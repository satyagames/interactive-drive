import * as THREE from 'three'

import { settings } from '../config.js'

/**
 * The floor's colour: a four-corner gradient laid out in **world space**
 * (docs/pursuit-arena/02 §2), so the ground itself hints at where you are on
 * the map, dissolving into the fog colour past the arena boundary.
 *
 * Two surfaces share one GLSL function:
 *   - the authored ground mesh keeps its matcap material and AO bake; a
 *     patched clone swaps its colour for the gradient (the bake still
 *     multiplies on top, so contact shadows survive);
 *   - an extra large plane just underneath carries the gradient out past the
 *     authored ground to the horizon, so there is never a visible edge.
 *
 * Corner colours are read live from `settings.floor` every frame.
 */

/** Big enough that its edge is always deep inside the fog. */
const OUTER_SIZE = 4000
/** Sits just under the authored ground so the two never z-fight. */
const OUTER_DROP = 0.03

const GRADIENT_GLSL = /* glsl */ `
  uniform vec3 uFloorNW;
  uniform vec3 uFloorNE;
  uniform vec3 uFloorSE;
  uniform vec3 uFloorSW;
  uniform vec3 uFloorFade;
  uniform float uFloorHalfExtent;
  uniform float uFloorBoundary;
  uniform float uFloorFadeWidth;

  // -Z is north, +X is east (doc 02 §2).
  vec3 floorGradient( vec3 worldPosition ) {
    vec2 uv = clamp( ( worldPosition.xz + uFloorHalfExtent ) / ( 2.0 * uFloorHalfExtent ), 0.0, 1.0 );
    vec3 north = mix( uFloorNW, uFloorNE, uv.x );
    vec3 south = mix( uFloorSW, uFloorSE, uv.x );
    vec3 colour = mix( north, south, uv.y );
    float edge = smoothstep( uFloorBoundary, uFloorBoundary + uFloorFadeWidth, length( worldPosition.xz ) );
    return mix( colour, uFloorFade, edge );
  }
`

export function createFloorGradient({ scene, ground, fogColor }) {
  const uniforms = {
    uFloorNW: { value: new THREE.Color() },
    uFloorNE: { value: new THREE.Color() },
    uFloorSE: { value: new THREE.Color() },
    uFloorSW: { value: new THREE.Color() },
    uFloorFade: { value: new THREE.Color(fogColor) },
    uFloorHalfExtent: { value: 1 },
    uFloorBoundary: { value: 1 },
    uFloorFadeWidth: { value: 1 },
  }

  if (ground) ground.material = patchGroundMaterial(ground.material, uniforms)

  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(OUTER_SIZE, OUTER_SIZE).rotateX(-Math.PI / 2),
    createOuterMaterial(uniforms),
  )
  outer.name = 'floor-outer'
  outer.position.y = -OUTER_DROP
  outer.renderOrder = -0.5
  outer.frustumCulled = false
  scene.add(outer)

  function update() {
    const f = settings.floor
    uniforms.uFloorNW.value.setHex(f.northWest)
    uniforms.uFloorNE.value.setHex(f.northEast)
    uniforms.uFloorSE.value.setHex(f.southEast)
    uniforms.uFloorSW.value.setHex(f.southWest)
    uniforms.uFloorHalfExtent.value = f.halfExtent
    uniforms.uFloorBoundary.value = f.boundaryRadius
    uniforms.uFloorFadeWidth.value = Math.max(f.fadeWidth, 1e-3)
  }
  update()

  return { outer, update }
}

/**
 * Clone the ground's shared matcap material (other meshes may use the same
 * cached instance) and chain an extra patch after the existing one: keep its
 * AO multiplier, replace the matcap colour with the gradient.
 */
function patchGroundMaterial(source, uniforms) {
  const material = source.clone()
  const basePatch = source.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    basePatch?.call(material, shader, renderer)
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFloorWorld;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvFloorWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFloorWorld;\n${GRADIENT_GLSL}`)
      // diffuseColor carries the AO bake (the base patch multiplies it in);
      // the gradient replaces what the matcap would have contributed.
      .replace(
        '#include <opaque_fragment>',
        'outgoingLight = floorGradient( vFloorWorld ) * diffuseColor.rgb;\n#include <opaque_fragment>',
      )
  }
  material.customProgramCacheKey = () => 'floor-gradient-ground'
  material.name = 'floor-gradient-ground'
  return material
}

/**
 * Unlit gradient + fog for the outer plane. The floor uniforms are passed by
 * reference so the per-frame update reaches this material and the ground's.
 */
function createOuterMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    name: 'floor-gradient-outer',
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...uniforms },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vFloorWorld;
      void main() {
        vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        vFloorWorld = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      varying vec3 vFloorWorld;
      ${GRADIENT_GLSL}
      void main() {
        gl_FragColor = vec4( floorGradient( vFloorWorld ), 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    fog: true,
  })
}
