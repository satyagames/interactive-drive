/**
 * Generates the project's matcap textures into `public/textures/matcaps/`.
 *
 *   node tools/generate-matcaps.mjs
 *
 * These are original, procedurally painted spheres -- no third-party matcap
 * assets are vendored into the repo. Everything is derived from the `PALETTE`
 * table below, so re-colouring the whole prototype is a one-file edit plus a
 * re-run; the PNGs are committed so a plain `npm run dev` never needs Node
 * tooling beyond Vite.
 *
 * A matcap is just a lit sphere photographed head-on: the shader takes the
 * view-space normal of a fragment, maps it into the unit disc, and looks up
 * the colour there. So all this script has to do is, for every texel of the
 * disc, reconstruct the normal
 *
 *     n = (u, v, sqrt(1 - u^2 - v^2))
 *
 * and shade it. The shading model is deliberately "painted", not physical:
 * wrapped diffuse from a warm key and a cool fill, a soft ground bounce, one
 * broad specular lobe, and a rim term. That combination is what gives matcaps
 * their illustrated look and is why the scene needs no real-time lights.
 *
 * Everything is computed in linear space and encoded to sRGB at the end,
 * because three.js samples the matcap as an sRGB texture.
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'textures', 'matcaps')

/** Texture edge length. 256 is plenty -- a matcap is an extremely low-frequency image. */
const SIZE = 256

// ---- light rig -------------------------------------------------------------
// Shared by every variant so the whole set reads as one lighting setup, which
// is what stops a mixed-matcap scene looking like a collage.

const KEY = normalize([-0.45, 0.62, 0.64])
const FILL = normalize([0.72, 0.05, 0.69])
const BOUNCE = normalize([0.1, -0.85, 0.52])
const VIEW = [0, 0, 1]

/**
 * The project's colour palette, and the one place it is defined.
 *
 * Eight colours, designed as a set rather than picked per object: a warm sand
 * ground, three exhibit accents spanning warm -> cool -> violet, a muted warm
 * structural tone for the ramps, one cool hero colour for the car, a warm
 * near-black, and a cream. Saturation sits between roughly 20% and 60% across
 * the whole set and nothing is fully saturated, which is what makes eight
 * separate hues read as one family instead of a set of swatches.
 *
 *   #DDA871  Dune       ground / base
 *   #D2543C  Ember      exhibit accent, warm            (+ the car's trim)
 *   #2E9E8F  Lagoon     exhibit accent, cool
 *   #8E4F9E  Plum       exhibit accent, deep
 *   #A8907C  Driftwood  ramps, structural -- deliberately the quietest
 *   #2F6FB5  Cobalt     vehicle hull -- the only strong cool blue, so the
 *                       car is the one object that never blends into the set
 *   #332B29  Espresso   tyres, cabin glass -- warm-tinted, never pure black
 *   #F3E6CC  Ivory      headlamps, wheel hubs; also the sky's horizon tone
 *
 * `hex` is the authored colour *as the matcap renders it head-on*, not a raw
 * albedo: `solveBase()` below inverts this file's own tone curve so that the
 * centre texel of each generated PNG is exactly this value. That makes the
 * palette checkable (sample the middle of the image) instead of being a
 * number that only means something after four transforms. The renderer's ACES
 * tone mapping still sits on top at runtime, so on-screen pixels read a little
 * deeper than these -- that is a global look, applied equally to everything.
 *
 *   key     - warm key light colour/intensity
 *   fill    - cool fill
 *   bounce  - light kicked back up off the ground
 *   spec    - [intensity, exponent] of the single specular lobe
 *   rim     - [intensity, exponent] of the rim/fresnel term
 *   ambient - flat floor so nothing crushes to pure black
 *
 * The rim term is doing more work than it was before the bevel pass: every
 * mesh now has a rounded edge a few centimetres wide, and the rim is what
 * catches it and draws the bright outline that reads as moulded plastic.
 */
const PALETTE = {
  // Ground. Warm and saturated enough to be a colour rather than a backdrop,
  // but the lightest thing in the scene, so everything sitting on it reads
  // against it by value alone.
  neutral: {
    hex: '#DDA871',
    key: [1.15, 1.06, 0.92],
    fill: [0.36, 0.44, 0.62],
    bounce: [0.30, 0.24, 0.18],
    spec: [0.10, 24],
    rim: [0.14, 3.2],
    ambient: 0.07,
  },
  // Exhibit accent, warm. Also the car's nose bar and tail fin, which is what
  // ties the vehicle to the exhibits instead of leaving it a separate object.
  'accent-warm': {
    hex: '#D2543C',
    key: [1.20, 1.02, 0.80],
    fill: [0.28, 0.38, 0.60],
    bounce: [0.38, 0.22, 0.10],
    spec: [0.26, 30],
    rim: [0.34, 2.6],
    ambient: 0.06,
  },
  // Exhibit accent, cool.
  'accent-cool': {
    hex: '#2E9E8F',
    key: [1.12, 1.14, 1.12],
    fill: [0.26, 0.44, 0.62],
    bounce: [0.12, 0.24, 0.24],
    spec: [0.26, 30],
    rim: [0.36, 2.6],
    ambient: 0.06,
  },
  // Exhibit accent, deep. The one violet in the set; kept lower in saturation
  // than the other two accents so it reads as a third sibling, not a novelty.
  'accent-deep': {
    hex: '#8E4F9E',
    key: [1.14, 1.04, 1.16],
    fill: [0.30, 0.36, 0.64],
    bounce: [0.24, 0.14, 0.28],
    spec: [0.26, 30],
    rim: [0.34, 2.6],
    ambient: 0.06,
  },
  // Ramps and wheel hubs: a muted warm stone. Structural geometry the eye
  // should skip over on its way to an exhibit, so it is the least saturated
  // thing here that isn't the near-black.
  stone: {
    hex: '#9C7E62',
    // The only variant with a deliberately warm fill. Every other surface in
    // the scene gets the cool blue fill, which is what keeps the shadow side
    // of things from going muddy -- but the ramps are broad, near-flat and
    // face almost straight up, so they sample the top of the matcap disc
    // where the fill dominates. With the standard cool fill that made them
    // read as cold concrete in a warm scene; warming it here is a one-object
    // fix that leaves the rest of the rig alone.
    fill: [0.36, 0.38, 0.46],
    key: [1.12, 1.06, 0.98],
    bounce: [0.28, 0.23, 0.18],
    // Matte, not polished: the exhibits and the car own the gloss.
    spec: [0.20, 36],
    rim: [0.24, 2.8],
    ambient: 0.055,
  },
  // Vehicle hull. Highest gloss in the set, and the only saturated cool, so
  // the car reads as the one "hero" object on screen.
  vehicle: {
    hex: '#2F6FB5',
    key: [1.18, 1.12, 1.08],
    fill: [0.30, 0.42, 0.68],
    bounce: [0.14, 0.20, 0.32],
    spec: [0.58, 58],
    rim: [0.44, 2.3],
    ambient: 0.05,
  },
  // Tyres, cabin glass -- anything that should sink into shadow. Warm-tinted
  // rather than neutral black, so it belongs to the same palette as the rest.
  dark: {
    hex: '#332B29',
    key: [1.00, 0.96, 0.94],
    fill: [0.24, 0.28, 0.40],
    bounce: [0.10, 0.08, 0.07],
    spec: [0.24, 44],
    rim: [0.28, 2.6],
    ambient: 0.05,
  },
  // Headlamps and wheel hubs. The brightest thing in the scene by some way,
  // which is what lets two 26 cm discs read as lamps at driving distance.
  ivory: {
    hex: '#F3E6CC',
    key: [1.10, 1.06, 1.00],
    fill: [0.34, 0.40, 0.56],
    bounce: [0.26, 0.24, 0.20],
    spec: [0.34, 40],
    rim: [0.22, 3.0],
    ambient: 0.08,
  },
  // ---- Phase 10 (doc 04 §3): the arena's own materials -------------------
  // Deloitte Green (CLAUDE.md rule 4): the cart's body, the HQ beacon, the
  // portal, the 10 monument. Glossy like the old hull, so the cart stays the
  // hero object on screen.
  'brand-green': {
    hex: '#86BC25',
    key: [1.16, 1.12, 1.00],
    fill: [0.28, 0.42, 0.58],
    bounce: [0.18, 0.24, 0.12],
    spec: [0.52, 56],
    rim: [0.40, 2.4],
    ambient: 0.05,
  },
  // Trophies, coins, the golden 10: a tight hot specular and a strong rim
  // read as metal without any environment map.
  gold: {
    hex: '#E3B505',
    key: [1.22, 1.08, 0.84],
    fill: [0.34, 0.36, 0.46],
    bounce: [0.36, 0.28, 0.10],
    spec: [0.80, 70],
    rim: [0.50, 2.0],
    ambient: 0.05,
  },
  // The HQ tower and the Innovation dome: pale and cool with a bright rim,
  // so a large surface reads as glass rather than as painted plaster.
  glass: {
    hex: '#A9CFDC',
    key: [1.06, 1.10, 1.16],
    fill: [0.34, 0.48, 0.70],
    bounce: [0.16, 0.24, 0.30],
    spec: [0.70, 64],
    rim: [0.62, 1.8],
    ambient: 0.07,
  },
  // Paper: the RFP Gate's document arch, binders, forms. Matte, warm white.
  paper: {
    hex: '#F4F2EC',
    key: [1.06, 1.04, 1.00],
    fill: [0.36, 0.42, 0.56],
    bounce: [0.26, 0.25, 0.22],
    spec: [0.08, 20],
    rim: [0.16, 3.4],
    ambient: 0.08,
  },
  // Red tape: the Toolkit's toolbox and the Red Tape Wall. The brand red's
  // green channel is 0x10, so nothing additive may carry much green: a low
  // specular (it adds the key's colour) and a green-poor fill, bounce and
  // ambient, or the solve can't get the centre texel that dark in green.
  'red-tape': {
    hex: '#C8102E',
    key: [1.18, 0.96, 0.92],
    fill: [0.26, 0.10, 0.40],
    bounce: [0.34, 0.04, 0.08],
    spec: [0.08, 36],
    rim: [0.32, 2.6],
    ambient: 0.01,
  },
}

/**
 * Normal the palette's `hex` values are defined at: straight at the viewer,
 * i.e. the centre texel of the matcap and the shading a face square-on to the
 * camera receives. Everything else in the disc is lighter or darker than the
 * authored colour by design -- that gradient *is* the shading.
 */
const REFERENCE_NORMAL = [0, 0, 1]

/** Shoulder constant shared by `filmic()` and its inverse in `solveBase()`. */
const FILMIC_SHOULDER = 0.8

// ---- shading ---------------------------------------------------------------

/**
 * Splits the light rig's contribution at one normal into the part that scales
 * with albedo and the part that doesn't.
 *
 *     colour = base * mul + add
 *
 * Keeping them apart is what lets `solveBase()` run the whole thing backwards
 * from a target colour: with `mul` and `add` known at the reference normal,
 * recovering `base` is one division rather than a search.
 */
function lightTerms(n, p) {
  // Wrapped ("half lambert") diffuse. The wrap term softens the terminator
  // into the painted gradient a plain N.L can't give you -- but only a
  // little: wrap too hard and every variant comes out as flat pastel mush
  // with no silhouette against the background.
  const key = wrap(dot(n, KEY), 0.22)
  const fill = wrap(dot(n, FILL), 0.55) * 0.42
  const bounce = wrap(dot(n, BOUNCE), 0.85) * 0.22

  // Contact shading: the underside of a real painted sphere sits in its own
  // shadow. Without this the bounce light flattens the bottom of the disc and
  // objects lose their sense of weight.
  const grounding = lerp(0.42, 1, smoothstep(-0.95, 0.15, n[1]))

  // One specular lobe from the key, tinted towards the key's own colour.
  const half = normalize([KEY[0] + VIEW[0], KEY[1] + VIEW[1], KEY[2] + VIEW[2]])
  const spec = p.spec[0] * Math.pow(Math.max(dot(n, half), 0), p.spec[1])

  // Rim: brightest where the surface turns away from the viewer, i.e. the
  // outer ring of the disc. Biased upwards so it reads as sky light. On
  // bevelled geometry this is the term that lights up the rounded edge.
  const fresnel = Math.pow(1 - Math.max(n[2], 0), p.rim[1])
  const rim = p.rim[0] * fresnel * (0.22 + 0.78 * Math.max(n[1], 0))

  const mul = [0, 0, 0]
  const add = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    mul[c] = p.ambient + (p.key[c] * key + p.fill[c] * fill + p.bounce[c] * bounce) * grounding
    add[c] = spec * p.key[c] + rim * p.fill[c]
  }
  return { mul, add }
}

function shade(n, p) {
  const { mul, add } = lightTerms(n, p)
  return [
    p.base[0] * mul[0] + add[0],
    p.base[1] * mul[1] + add[1],
    p.base[2] * mul[2] + add[2],
  ]
}

/**
 * Recovers the linear albedo that makes a variant render as its authored
 * `hex` at `REFERENCE_NORMAL`.
 *
 * Inverting `filmic()` (`y = x / (1 + kx)`  ->  `x = y / (1 - ky)`) gives the
 * pre-tone-curve value the encoder has to be handed; subtracting the additive
 * specular/rim terms and dividing by the diffuse multiplier gives the albedo.
 * A saturated colour can land above 1 here, which is fine -- this is a painted
 * texture, not a physical BRDF, and the tone curve keeps the brighter normals
 * from clipping.
 */
function solveBase(p) {
  const { mul, add } = lightTerms(REFERENCE_NORMAL, p)
  const target = hexToLinear(p.hex)
  return target.map((t, c) => {
    const preTone = t / (1 - FILMIC_SHOULDER * t)
    return Math.max((preTone - add[c]) / mul[c], 0)
  })
}

/** Gentle shoulder so the specular highlight rolls off instead of clipping flat. */
function filmic(x) {
  return x / (1 + x * FILMIC_SHOULDER)
}

// ---- rasterise -------------------------------------------------------------

function renderMatcap(p) {
  const pixels = Buffer.alloc(SIZE * SIZE * 3)

  for (let y = 0; y < SIZE; y++) {
    // +v is up in the matcap disc, but image rows run downwards.
    const v = 1 - ((y + 0.5) / SIZE) * 2
    for (let x = 0; x < SIZE; x++) {
      const u = ((x + 0.5) / SIZE) * 2 - 1
      const r2 = u * u + v * v

      // Outside the disc, clamp to the silhouette rather than leaving black:
      // the shader samples at 0.495 scale, but bilinear filtering can still
      // reach a texel or two past the edge and a black fringe there is very
      // visible on a curved surface.
      let n
      if (r2 >= 1) {
        const r = Math.sqrt(r2)
        n = [u / r, v / r, 0]
      } else {
        n = [u, v, Math.sqrt(1 - r2)]
      }

      const lin = shade(n, p)
      const i = (y * SIZE + x) * 3
      for (let c = 0; c < 3; c++) {
        pixels[i + c] = Math.round(linearToSrgb(filmic(Math.max(lin[c], 0))) * 255)
      }
    }
  }

  return pixels
}

// ---- PNG encoding ----------------------------------------------------------
// A minimal RGB8 encoder. Writing ~40 lines of PNG beats adding an image
// dependency to a project whose only build tool is Vite.

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function encodePng(pixels, size) {
  // One filter byte (0 = None) per scanline. The image is a smooth gradient,
  // so deflate handles it well enough without per-line filter heuristics.
  const stride = size * 3
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  // 10..12: compression / filter / interlace, all 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- maths -----------------------------------------------------------------

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** Wrapped diffuse: pushes the terminator round the back of the sphere. */
function wrap(nl, w) {
  return Math.max((nl + w) / (1 + w), 0)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

function linearToSrgb(c) {
  const v = Math.min(Math.max(c, 0), 1)
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** '#RRGGBB' -> linear-light [r, g, b]. */
function hexToLinear(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map((v) => srgbToLinear(v / 255))
}

// ---- main ------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true })
for (const [name, p] of Object.entries(PALETTE)) {
  // Derived once per variant, not per texel: this is what makes `hex` the
  // colour the PNG actually comes out as.
  p.base = solveBase(p)

  const pixels = renderMatcap(p)
  const file = join(OUT_DIR, `${name}.png`)
  const png = encodePng(pixels, SIZE)
  writeFileSync(file, png)

  // Round-trip check on the centre texel. If this ever drifts by more than a
  // rounding step, the tone curve and its inverse in `solveBase()` have come
  // apart. One step of slack is expected and not a bug: texel centres are
  // sampled at half-texel offsets, so the middle of a 256 px image is the
  // normal (0.004, -0.004, ~1) rather than exactly `REFERENCE_NORMAL`.
  const mid = ((SIZE / 2) * SIZE + SIZE / 2) * 3
  const got = `#${[0, 1, 2].map((c) => pixels[mid + c].toString(16).padStart(2, '0')).join('')}`
  const want = hexToLinear(p.hex).map((_, c) => parseInt(p.hex.slice(1 + c * 2, 3 + c * 2), 16))
  const drift = Math.max(...[0, 1, 2].map((c) => Math.abs(pixels[mid + c] - want[c])))
  const match = drift <= 1 ? `ok (${p.hex}, drift ${drift})` : `MISMATCH (wanted ${p.hex})`
  console.log(`${name.padEnd(12)} ${got}  ${SIZE}x${SIZE}  ${(png.length / 1024).toFixed(1).padStart(5)} KB  ${match}`)
}
