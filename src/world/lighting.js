import * as THREE from 'three'

/**
 * There is deliberately almost nothing here.
 *
 * Every surface in the scene is matcap-shaded (`src/render/materials.js`),
 * which means shading is a texture lookup by view-space normal and no light
 * in the scene can affect it. Grounding comes from the Blender AO bake on the
 * static geometry and from the car's shadow blob, both of which are also
 * unlit. So the directional key this used to add was doing no work at all.
 *
 * The one ambient light that remains is a safety net, not a look: it costs
 * nothing while no lit material exists, and it stops a stray `MeshStandard`
 * material -- the default for anything dropped in from glTF before it gets
 * converted -- rendering as a black silhouette and looking like a bug.
 */
export function createLighting(scene) {
  // Tinted to the sky's horizon cream rather than a cool blue, so that if it
  // ever does light something the result belongs to the same palette.
  const ambient = new THREE.AmbientLight(0xf3e2c4, 1.15)
  ambient.name = 'fallback-ambient'
  scene.add(ambient)

  return { ambient }
}
