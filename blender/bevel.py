"""
Rounds every visible edge in the scene, destructively.

    blender --background blender/scene.blend --python blender/bevel.py

This is the single biggest reason the prototype used to read as a blockout
rather than as art. A 90 degree edge is what a collider looks like; nothing
manufactured has one, because nothing can be moulded, cast or pressed to a
zero-radius corner. Adding a few centimetres of radius and letting it shade
smooth gives every edge a bright sliver where it turns through the light --
which is most of what the eye uses to read "solid object" instead of "flat
polygon", and it costs nothing at runtime beyond a few hundred vertices.

The bevel is **applied**, not left as a live modifier:

  - `bake_ao.py` unwraps and bakes the mesh it finds, so the geometry it sees
    has to be the final geometry or the bake lands on the wrong surface.
  - The naming convention is the contract with the game, and a mesh whose
    shape depends on a modifier stack is one more thing that has to survive
    every future edit intact.

Collision proxies are deliberately skipped. They are never rendered, and
`src/world/world.js` sizes colliders from their bounding boxes -- rounding
them would add vertices to geometry nobody sees, to no effect. (A bevel does
not change a convex mesh's bounding box anyway, so this pass cannot move a
collider, a trigger volume or a spawn point even on the meshes it does touch.)

## Re-running

Applying a bevel twice would round the rounding. Every object this touches is
tagged with `BEVEL_TAG = BEVEL_VERSION`, and an object already carrying the
current version is skipped, so the script is safe to re-run. Bump
`BEVEL_VERSION` to force a re-bevel -- but note that a second pass compounds
on the first, so a width change means reverting the geometry (undo, or
re-authoring the primitive) rather than just bumping the number and re-running.

Run order for a full art rebuild:

    blender --background blender/scene.blend --python blender/vehicle_details.py
    blender --background blender/scene.blend --python blender/bevel.py
    blender --background blender/scene.blend --python blender/bake_ao.py
    blender --background blender/scene.blend --python blender/export.py
"""

import math

import bmesh
import bpy

#: Bump to force already-bevelled objects through again. See "Re-running".
BEVEL_VERSION = 1
BEVEL_TAG = 'bevel_applied'

#: Segments across each rounded edge. Two reads as a chamfer (a cut corner);
#: three is the first count that reads as an actual radius, and the difference
#: between three and four is invisible at this object scale.
SEGMENTS = 3

#: Edge radius in metres, for anything without an entry in WIDTHS below.
#: Sized for the exhibits (3-6 m boxes), where ~8 cm is about 2% of the object
#: -- small enough to still read as a crisp box, wide enough to catch light
#: across a couple of pixels at driving distance.
DEFAULT_WIDTH = 0.085

#: Per-object overrides. The rule is roughly constant radius *relative to the
#: object*, not constant absolute radius: the same 8 cm that reads as a subtle
#: round on a 4 m exhibit reads as a melted blob on a 14 cm lamp.
WIDTHS = {
    # The ground's only bevelled edges are the perimeter of a 240 m plate,
    # 120 m from anything the camera looks at. Width here is nearly academic;
    # it exists so the edge of the world isn't a razor if it's ever in frame.
    'ground': 0.15,
    # Ramps are 50 cm thick, so their radius is capped by their own thickness
    # long before it is capped by taste.
    'ramp_n': 0.07,
    'ramp_n_landing': 0.07,
    'ramp_e': 0.07,
    # The car is the smallest thing on screen and the closest to camera.
    'vehicle_hull': 0.05,
    'vehicle_cabin': 0.035,
    'vehicle_nose_accent': 0.02,
    'vehicle_lamp_l': 0.018,
    'vehicle_lamp_r': 0.018,
    'vehicle_spoiler': 0.03,
}

#: Only edges sharper than this get rounded. It is what keeps the cylindrical
#: exhibit a cylinder: the 22.5 deg joins between its side facets fall under
#: the limit and are left alone, while its 90 deg top and bottom rims are
#: rounded like every other edge in the scene.
BEVEL_ANGLE_LIMIT = math.radians(30.0)

#: Faces meeting at less than this are shaded smooth. With three segments a
#: rounded 90 deg corner steps 22.5 deg at a time, so this smooths the whole
#: bevel *and* its join into the flat faces either side -- which is the point.
#: Anything genuinely sharper (the un-bevelled interior of a ramp wedge, say)
#: stays a hard edge.
SMOOTH_ANGLE = math.radians(40.0)

COLLECTIONS = ('World', 'Vehicle')
SKIP_PREFIX = 'collision_'


def targets():
    """Every visible mesh in the scene, collision proxies excluded."""
    out = []
    for name in COLLECTIONS:
        coll = bpy.data.collections.get(name)
        if coll is None:
            raise RuntimeError(f'No "{name}" collection in this .blend')
        for obj in coll.objects:
            if obj.type == 'MESH' and not obj.name.startswith(SKIP_PREFIX):
                out.append(obj)
    return out


def apply_bevel(obj, width):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    mod = obj.modifiers.new(name='toy_bevel', type='BEVEL')
    mod.width = width
    mod.segments = SEGMENTS
    mod.limit_method = 'ANGLE'
    mod.angle_limit = BEVEL_ANGLE_LIMIT
    # Without this, a width wider than half the thinnest feature turns the
    # mesh inside out -- and the thinnest feature here (the nose bar) is 10 cm.
    mod.use_clamp_overlap = True
    # A round profile, not a flat chamfer. 0.5 is the circular arc.
    mod.profile = 0.5
    mod.miter_outer = 'MITER_ARC'
    bpy.ops.object.modifier_apply(modifier=mod.name)


def shade(obj):
    """
    Smooth faces, sharp creases, decided per edge by the angle between faces.

    Done with bmesh rather than `shade_smooth_by_angle` because this writes the
    result into the mesh data itself. The operator's equivalent is a modifier,
    which would then be one more thing for the bake and the export to have to
    agree about -- and the whole point of this script is to leave finished
    geometry behind.
    """
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for face in bm.faces:
        face.smooth = True
    for edge in bm.edges:
        # An open boundary has no angle to measure; treat it as sharp.
        edge.smooth = edge.calc_face_angle(math.pi) <= SMOOTH_ANGLE
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def main():
    if bpy.context.object is not None and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')

    for obj in targets():
        if obj.get(BEVEL_TAG) == BEVEL_VERSION:
            print(f'  {obj.name:22s} already bevelled (v{BEVEL_VERSION}), skipped')
            continue

        width = WIDTHS.get(obj.name, DEFAULT_WIDTH)
        before = len(obj.data.vertices)
        apply_bevel(obj, width)
        shade(obj)
        obj[BEVEL_TAG] = BEVEL_VERSION
        print(f'  {obj.name:22s} width {width:.3f} x{SEGMENTS}  {before} -> {len(obj.data.vertices)} verts')

    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.wm.save_mainfile()
    print('bevel pass complete')


main()
