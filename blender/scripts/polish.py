"""
The arena's art pass (docs/pursuit-arena/04 §3, doc 06 Phase 10), run on each
generated .blend between `gen_*` and `validate.py`:

    blender -b blender/districts/<id>.blend -P blender/scripts/polish.py -- --id <id> --bake <png>
    blender -b blender/kit/arena_kit.blend   -P blender/scripts/polish.py -- --kit
    blender -b blender/districts/base.blend  -P blender/scripts/polish.py -- --id base --bake <png> --occluders a.blend,b.blend,...

(`npm run art:polish`, part of `npm run art:build`.)

1. **LOD1.** Each `landmark_*` visual gets a twin, `<name>_LOD1`, copied
   *before* the bevel: the plain blockout is about a third of the bevelled
   triangles, which is the "about 40%" LOD doc 04 asks for, with a silhouette
   that matches exactly. The runtime swaps by distance (src/world/world.js).
2. **Bevel.** Every static visual, dynamic-prop visual and kit piece gets a
   rounded, smooth-shaded edge (polish_lib.bevel): 2 segments on the statics
   people look at, 1 on props and kit pieces, which are small and many.
   Floors, roads and decals are flat and are left alone.
3. **AO.** The district's static visuals share one atlas (1024; HQ 2048) and
   bake ambient occlusion against each other and a temporary ground plane.
   LOD1 twins point at the atlas's reserved white corner. Dynamic props and
   kit instances move or are shared, so they are not baked (their blob
   shadows do that job).
4. **Ground (base only).** The ground and the other flat base surfaces get
   a planar top-down projection over the whole arena and bake AO times a
   soft sun shadow, with every district's statics linked in as occluders --
   the contact shadows that make buildings sit on the floor.

Idempotent per gen: objects already bevelled are skipped, LOD1 twins are
only made once. Re-run `art:gen` to start from the blockout again.
"""

import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import args, require_blender_5  # noqa: E402
import polish_lib as pl  # noqa: E402

FLAT = ('ground', 'roads', 'road_kerbs', 'decal_', 'plaza_')
NO_BAKE = ('anim_',)
WIDTH = {'landmark': 0.06, 'static': 0.05, 'prop': 0.03, 'kit': 0.03}

# Ground bake (base): see blender/bake_ao.py for the reasoning behind each.
GROUND_SIZE = 2048
GROUND_SAMPLES = 160
SUN_ELEVATION = 50.0
SUN_AZIMUTH = -38.0
SUN_SOFTNESS = 9.0
SHADOW_FLOOR = 0.45
GROUND_BLUR = 2.5


def dyn_root(obj):
    node = obj
    while node is not None:
        if node.name.startswith('dyn_'):
            return node
        node = node.parent
    return None


def visuals():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH' and not o.name.startswith('collision_')]


def is_flat(obj):
    return obj.name.startswith(FLAT)


def hide_non_occluders():
    """
    Collision proxies sit on top of their visuals (they'd occlude them
    completely) and dynamic props move (their shadow would stay where they
    started): neither may cast into a bake. Returns a restore list.
    """
    hidden = []
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH' and (obj.name.startswith('collision_') or dyn_root(obj) is not None):
            hidden.append((obj, obj.hide_render))
            obj.hide_render = True
    return hidden


def make_lod1(obj):
    name = f'{obj.name}_LOD1'
    if obj.name.endswith('_LOD1') or bpy.data.objects.get(name) or obj.data.get(pl.BEVEL_TAG):
        return None
    twin = obj.copy()
    twin.data = obj.data.copy()
    twin.name = name
    twin['lod'] = 1
    for coll in obj.users_collection:
        coll.objects.link(twin)
    return twin


def bake_district(statics, out_path, size):
    baked = [o for o in statics if not o.name.endswith('_LOD1')]
    pl.unwrap(baked)
    for twin in (o for o in statics if o.name.endswith('_LOD1')):
        pl.dump_uv(twin)
        # LOD1 twins sit exactly on their LOD0: hide them so they don't occlude it.
        twin.hide_render = True
    ground = pl.temp_ground(0.0)
    try:
        pl.bake_ao(baked, out_path, size, samples=256, distance=3.0)
    finally:
        pl.remove(ground)
        for twin in (o for o in statics if o.name.endswith('_LOD1')):
            twin.hide_render = False
    print(f'[polish]   AO {size}px -> {out_path}')


def link_occluders(paths):
    """Link every district's static visuals (LOD0) into this file, render-only, for the ground bake."""
    linked = []
    coll = bpy.data.collections.new('bake_occluders')
    bpy.context.scene.collection.children.link(coll)
    for path in paths:
        with bpy.data.libraries.load(path, link=True) as (src, dst):
            dst.objects = [n for n in src.objects if not n.startswith(('collision_', 'area_', 'trigger_', 'spawn_', 'sfx_', 'collect_', 'inst_')) and not n.endswith('_LOD1')]
        for obj in dst.objects:
            if obj is None or obj.type != 'MESH' or dyn_root(obj) is not None:
                continue
            coll.objects.link(obj)
            linked.append(obj)
    return coll, linked


def project_top(objs, lo, hi):
    """Planar top-down UVs over the arena square for upward faces; the rest to the white corner."""
    span_x, span_y = hi[0] - lo[0], hi[1] - lo[1]
    span = max(span_x, span_y)
    inset = pl.ATLAS_MIN
    scale = (1.0 - 2 * inset) / span
    for obj in objs:
        mesh = obj.data
        uv = pl.ensure_bake_uv(obj).data
        mw = obj.matrix_world
        normal_matrix = mw.to_3x3().inverted().transposed()
        for poly in mesh.polygons:
            up = (normal_matrix @ poly.normal).normalized().z > 0.5
            for li in poly.loop_indices:
                if not up:
                    uv[li].uv = pl.DUMP_UV
                    continue
                co = mw @ mesh.vertices[mesh.loops[li].vertex_index].co
                uv[li].uv = (inset + (co.x - lo[0]) * scale, inset + (co.y - lo[1]) * scale)


#: Base meshes that lie on the floor and share the ground's planar projection.
#: Only the ground itself is baked: roads and kerbs sit a few centimetres above
#: it, and baking them too would write the (black) floor *under* a road into
#: the very texels the road reads. Hidden during the bake, they simply inherit
#: the ground's shadows. Anything raised (ramps, the berm) gets no ground bake.
GROUND_LEVEL = ('ground', 'roads', 'road_kerbs')


def bake_ground(statics, out_path, occluder_paths):
    ground = bpy.data.objects.get('ground')
    if ground is None:
        raise SystemExit('base.blend has no "ground" object')
    pts = [ground.matrix_world @ v.co for v in ground.data.vertices]
    lo = (min(p.x for p in pts), min(p.y for p in pts))
    hi = (max(p.x for p in pts), max(p.y for p in pts))
    raised = [o for o in statics if not o.name.startswith(GROUND_LEVEL)]
    level = [o for o in statics if o.name.startswith(GROUND_LEVEL)]
    for obj in raised:
        pl.dump_uv(obj)
    project_top(level, lo, hi)
    riders = [o for o in level if o is not ground]
    for obj in riders:
        obj.hide_render = True
    statics = [ground]
    coll, linked = link_occluders(occluder_paths)
    print(f'[polish]   ground: {len(statics)} base meshes, {len(linked)} occluders linked')
    try:
        pl.configure_cycles(GROUND_SAMPLES, 4.0)
        ao = pl.new_image('ground_ao_pass', GROUND_SIZE)
        pl.attach_target(statics, ao)
        pl.select_only(statics)
        bpy.ops.object.bake(type='AO')
        sun = add_sun()
        shadow = pl.new_image('ground_shadow_pass', GROUND_SIZE)
        pl.attach_target(statics, shadow)
        bpy.ops.object.bake(type='SHADOW')
        bpy.data.objects.remove(sun, do_unlink=True)
        pl.detach_target(statics)
        a = np.empty(GROUND_SIZE * GROUND_SIZE * 4, dtype=np.float32)
        s = np.empty_like(a)
        ao.pixels.foreach_get(a)
        shadow.pixels.foreach_get(s)
        # Normalise: open ground under a sun at SUN_ELEVATION receives
        # sin(elevation) of full light, not 1, and should read as unshadowed.
        s = np.clip(s / max(float(np.percentile(s[0::4], 99.5)), 1e-3), 0, 1)
        lit = SHADOW_FLOOR + (1.0 - SHADOW_FLOOR) * s
        result = np.clip(np.power(np.clip(a, 0, 1), pl.AO_GAMMA) * lit, 0, 1)
        result = pl.blur(result, GROUND_SIZE, GROUND_BLUR)
        result[3::4] = 1.0
        out = pl.new_image(os.path.splitext(os.path.basename(out_path))[0], GROUND_SIZE)
        out.pixels.foreach_set(result)
        pl.save_ao(out, out_path)
        for image in (ao, shadow, out):
            bpy.data.images.remove(image)
    finally:
        for obj in riders:
            obj.hide_render = False
        for obj in linked:
            coll.objects.unlink(obj)
        bpy.data.collections.remove(coll)
        for lib in list(bpy.data.libraries):
            bpy.data.libraries.remove(lib)
    print(f'[polish]   ground AO + shadow {GROUND_SIZE}px -> {out_path}')


def add_sun():
    data = bpy.data.lights.new('bake_sun', type='SUN')
    data.angle = math.radians(SUN_SOFTNESS)
    sun = bpy.data.objects.new('bake_sun', data)
    sun.rotation_euler = (math.radians(90.0 - SUN_ELEVATION), 0.0, math.radians(SUN_AZIMUTH))
    bpy.context.scene.collection.objects.link(sun)
    bpy.context.view_layer.update()
    return sun


def main():
    require_blender_5()
    opts = args()
    if bpy.context.object is not None and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    ident = opts.get('id', 'kit')
    kit = bool(opts.get('kit'))
    objs = visuals()

    if kit:
        # Trees are round already (and tightly budgeted): only the hard-edged pieces.
        for obj in objs:
            if obj.name.startswith('kit_tree') or (obj.parent and obj.parent.name.startswith('kit_tree')):
                pl.shade_by_angle(obj)
            else:
                pl.bevel(obj, WIDTH['kit'], segments=1)
        bpy.ops.wm.save_mainfile()
        print(f'[polish] kit: {len(objs)} pieces bevelled')
        return

    props = [o for o in objs if dyn_root(o) is not None]
    statics = [o for o in objs if dyn_root(o) is None and not o.name.startswith(NO_BAKE)]
    anims = [o for o in objs if o.name.startswith(NO_BAKE)]

    twins = [t for t in (make_lod1(o) for o in statics if o.name.startswith('landmark_')) if t is not None]
    statics += twins
    for obj in statics:
        if obj.name.endswith('_LOD1'):
            pl.shade_by_angle(obj)
        elif is_flat(obj):
            continue
        else:
            pl.bevel(obj, WIDTH['landmark'] if obj.name.startswith('landmark_') else WIDTH['static'], segments=2)
    for obj in anims:
        pl.bevel(obj, WIDTH['static'], segments=2)
    for obj in props:
        pl.bevel(obj, WIDTH['prop'], segments=1)

    out = opts.get('bake')
    if out:
        hidden = hide_non_occluders()
        if ident == 'base':
            occluders = [p for p in opts.get('occluders', '').split(',') if p]
            bake_ground([o for o in statics if not o.name.endswith('_LOD1')], out, occluders)
        else:
            bake_district(statics, out, 2048 if ident == 'hq' else 1024)
        for obj, was in hidden:
            obj.hide_render = was
    bpy.ops.wm.save_mainfile()
    print(f'[polish] {ident}: {len(statics) - len(twins)} statics, {len(twins)} LOD1 twins, {len(props)} props, {len(anims)} animated')


main()
