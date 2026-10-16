import * as THREE from 'three'

import { rendering, settings } from '../config.js'

/**
 * The prototype's shading model, in one place.
 *
 * Every surface uses `MeshMatcapMaterial`: shading is looked up from a pre-lit
 * sphere texture by view-space normal, so the scene needs no real-time lights
 * at all. That is the whole reason this reads as "lit" while costing roughly
 * what unlit geometry costs -- see `tools/generate-matcaps.mjs` for how the
 * matcaps themselves are made.
 *
 * Static geometry additionally multiplies in an ambient-occlusion bake from
 * Blender. The bake rides in the material's `map` slot, which for a matcap
 * material is a plain multiplier over the matcap colour -- exactly what a
 * lightmap wants to be -- sampled on UV channel 1 so channel 0 stays free for
 * real art later (`blender/bake_ao.py` guarantees that layout).
 *
 * The shader patch keeps AO strength live-tunable and adds restrained Fresnel
 * rims plus time, speed, and trigger-response accents without replacing the
 * matcap look.
 */

/** Shared across every baked material so one GUI slider moves all of them. */
const aoIntensity = { value: settings.render.bakedAo }
const shaderEffects = {
  time: { value: 0 },
  speed: { value: 0 },
  interaction: { value: 0 },
}

/** Called once a frame; keeps the shader uniform in step with `settings`. */
export function syncRenderSettings() {
  aoIntensity.value = settings.render.bakedAo
}

/** Updates the shared clock and gameplay signals used by animated materials. */
export function syncShaderEffects({ time, speed, interaction }) {
  shaderEffects.time.value = time
  shaderEffects.speed.value = speed
  shaderEffects.interaction.value = interaction
}

export async function loadRenderAssets() {
  const loader = new THREE.TextureLoader()

  const matcapNames = new Set([
    rendering.defaultMatcap,
    rendering.wheelMatcap,
    rendering.hubMatcap,
    ...rendering.matcapRules.map((rule) => rule.matcap),
  ])
  const bakeFiles = new Set(rendering.bakeRules.map((rule) => rule.file))

  const [matcapList, bakeList] = await Promise.all([
    Promise.all(
      [...matcapNames].map(async (name) => {
        const texture = await loader.loadAsync(`${rendering.matcapPath}${name}.png`)
        // The matcap is authored colour, so it decodes from sRGB like any
        // other image. Mipmaps stay on: a matcap covers few pixels once the
        // object is small on screen, and aliasing on the specular is ugly.
        texture.colorSpace = THREE.SRGBColorSpace
        return [name, texture]
      }),
    ),
    Promise.all(
      [...bakeFiles].map(async (file) => {
        const texture = await loader.loadAsync(`${rendering.bakePath}${file}`)
        texture.channel = rendering.bakeChannel
        texture.flipY = false
        // Cycles wrote linear occlusion into an sRGB-encoded PNG, so decoding
        // it as sRGB is what hands the shader the original linear multiplier.
        texture.colorSpace = THREE.SRGBColorSpace
        // The bake fills the whole 0..1 square; clamping stops the ground's
        // outermost texel row wrapping to the opposite edge.
        texture.wrapS = THREE.ClampToEdgeWrapping
        texture.wrapT = THREE.ClampToEdgeWrapping
        return [file, texture]
      }),
    ),
  ])

  return {
    matcaps: new Map(matcapList),
    bakes: new Map(bakeList),
    /** (matcap, bake) pair -> material, so meshes that share both share one. */
    cache: new Map(),
  }
}

/**
 * Replaces the material on every mesh under `root` with its matcap equivalent.
 *
 * Matching is on the object's own name, falling back to its ancestors', so a
 * glTF node that got wrapped in a group on import still resolves.
 */
export function applyMatcapMaterials(root, assets) {
  // Two meshes can share one glTF material, so collect first and dispose
  // once -- every mesh under `root` is being re-materialled anyway, so
  // nothing can still be using them afterwards.
  const replaced = new Set()

  root.traverse((object) => {
    if (!object.isMesh) return

    const name = resolveName(object)
    const matcapName = matchRule(rendering.matcapRules, name)?.matcap ?? rendering.defaultMatcap
    const bakeFile = matchRule(rendering.bakeRules, name)?.file ?? null

    if (object.material) replaced.add(object.material)
    object.material = getMaterial(assets, matcapName, bakeFile, effectProfile(name))
  })

  // Skip anything from the shared cache -- calling this twice (world, then
  // vehicle) would otherwise dispose a matcap material still in use.
  const ours = new Set(assets.cache.values())
  for (const material of replaced) {
    if (!ours.has(material)) material.dispose()
  }
}

/** Builds a matcap material directly, for geometry that never came from glTF. */
export function createMatcapMaterial(assets, matcapName) {
  return getMaterial(assets, matcapName, null)
}

function getMaterial(assets, matcapName, bakeFile, profile = effectProfile(matcapName)) {
  const key = `${matcapName}|${bakeFile ?? ''}|${profile.name}`
  const cached = assets.cache.get(key)
  if (cached) return cached

  const material = new THREE.MeshMatcapMaterial({
    matcap: assets.matcaps.get(matcapName) ?? null,
    map: bakeFile ? assets.bakes.get(bakeFile) ?? null : null,
    fog: true,
  })
  material.name = `matcap:${key}`
  patchMaterial(material, profile)

  assets.cache.set(key, material)
  return material
}

function patchMaterial(material, profile) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAoIntensity = aoIntensity
    shader.uniforms.uTime = shaderEffects.time
    shader.uniforms.uSpeed = shaderEffects.speed
    shader.uniforms.uInteraction = shaderEffects.interaction
    shader.uniforms.uFresnelStrength = { value: profile.fresnel }
    shader.uniforms.uFresnelPower = { value: profile.fresnelPower }
    shader.uniforms.uEmissionStrength = { value: profile.emission }
    shader.uniforms.uAccentColor = { value: new THREE.Color(profile.color) }

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        '#include <map_pars_fragment>\nuniform float uAoIntensity;\nuniform float uTime;\nuniform float uSpeed;\nuniform float uInteraction;\nuniform float uFresnelStrength;\nuniform float uFresnelPower;\nuniform float uEmissionStrength;\nuniform vec3 uAccentColor;',
      )
      .replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
          diffuseColor.rgb *= mix( vec3( 1.0 ), texture2D( map, vMapUv ).rgb, uAoIntensity );
        #endif
        `,
      )
      .replace(
        '#include <output_fragment>',
        `
        float fresnel = pow( 1.0 - max( dot( normalize( vNormal ), normalize( -vViewPosition ) ), 0.0 ), uFresnelPower );
        float pulse = 0.5 + 0.5 * sin( uTime * 2.2 + dot( vViewPosition, vec3( 0.17, 0.11, 0.07 ) ) );
        float animatedAccent = mix( 0.35, 1.0, pulse ) * ( 0.35 + 0.65 * uInteraction );
        outgoingLight += uAccentColor * fresnel * uFresnelStrength;
        outgoingLight += uAccentColor * animatedAccent * uEmissionStrength * ( 0.25 + 0.75 * uSpeed );
        #include <output_fragment>
        `,
      )
  }
  material.customProgramCacheKey = () => `matcap-effects:${profile.name}`
}

function effectProfile(name) {
  if (name.startsWith('vehicle_lamp')) {
    return { name: 'lamp', fresnel: 0.12, fresnelPower: 2.2, emission: 1.8, color: 0xffd6a0 }
  }
  if (name.startsWith('exhibit_')) {
    return { name: 'exhibit', fresnel: 0.48, fresnelPower: 2.4, emission: 0.1, color: 0xffb35c }
  }
  if (name.startsWith('vehicle_')) {
    return { name: 'vehicle', fresnel: 0.2, fresnelPower: 2.8, emission: 0.035, color: 0xffa36a }
  }
  return { name: 'default', fresnel: 0.035, fresnelPower: 3.5, emission: 0, color: 0xffffff }
}

function resolveName(object) {
  for (let node = object; node; node = node.parent) {
    if (node.name) return node.name
  }
  return ''
}

function matchRule(rules, name) {
  return rules.find((rule) => name.startsWith(rule.prefix))
}
