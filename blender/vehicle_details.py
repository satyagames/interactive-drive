"""
Adds the vehicle's two character details to scene.blend.

    blender --background blender/scene.blend --python blender/vehicle_details.py

The placeholder car is a wedge and two boxes, which reads as a collider with
paint on it. These are the smallest additions that make it read as a designed
object instead:

    vehicle_lamp_l / vehicle_lamp_r   a pair of round lamps set into the nose
    vehicle_spoiler                   a raised lip across the tail deck

Both are original, generic shapes -- a disc and a bar -- chosen because they
are the two details that read at driving distance from a chase camera: the
lamps give the car a *face* (which is most of why a toy car looks like a toy
car rather than a box), and the tail lip gives the rear something to catch the
rim light so the car has a front and a back from behind, too.

They are visual-only. The chassis collider is a box built from
`rebuild.chassis.size` in `src/config.js` and never looks at this geometry, so
nothing here can change how the car drives.

Idempotent: an existing object of the same name is replaced, so re-running
after an edit is safe. Run this *before* `bevel.py` -- fresh geometry carries
no bevel tag, and the bevel pass is what rounds these off with everything else.

Local axes in this collection are Blender's, not the game's: +X right,
-Y forward (the nose is at y = -2.0), +Z up. See docs/blender-conventions.md.
"""

import math

import bpy

COLLECTION = 'Vehicle'

#: Nose lamps. Radius and depth in metres; `y` is chosen so the disc stands a
#: few centimetres proud of the nose face at y = -2.0 rather than sitting
#: flush, which would leave it to the matcap alone to read as a separate part.
LAMP_RADIUS = 0.13
LAMP_DEPTH = 0.10
LAMP_Y = -1.99
LAMP_Z = 0.06
LAMP_X = 0.40
#: 16 sides is smooth enough at this size and keeps the car's whole visual
#: budget in the low hundreds of triangles.
LAMP_SIDES = 16

#: Tail lip. Sits *on* the rear deck (hull top is z = 0.254) rather than
#: floating above it, so it needs no struts to look supported.
SPOILER_SIZE = (1.04, 0.14, 0.21)
SPOILER_CENTRE = (0.0, 1.86, 0.357)


def collection():
    coll = bpy.data.collections.get(COLLECTION)
    if coll is None:
        raise RuntimeError(f'No "{COLLECTION}" collection in this .blend')
    return coll


def replace(name):
    """Drop any existing object (and its mesh) of this name, so re-runs are clean."""
    existing = bpy.data.objects.get(name)
    if existing is None:
        return
    mesh = existing.data if existing.type == 'MESH' else None
    bpy.data.objects.remove(existing)
    if mesh is not None and mesh.users == 0:
        bpy.data.meshes.remove(mesh)


def material(name):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    # Authoring readability only -- the game assigns matcaps by object name
    # prefix (`rendering.matcapRules` in src/config.js) and ignores these.
    mat.use_nodes = True
    return mat


def adopt(obj, name, mat_name):
    """Rename, re-home into the Vehicle collection, and apply the transform."""
    obj.name = name
    obj.data.name = name
    for coll in list(obj.users_collection):
        coll.objects.unlink(obj)
    collection().objects.link(obj)

    obj.data.materials.clear()
    obj.data.materials.append(material(mat_name))

    # The convention is applied transforms: what you read in Blender is what
    # the exporter emits. `location` stays, rotation and scale are baked in.
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def add_lamp(name, x):
    # A cylinder is born pointing up its own +Z; a +90 deg turn about X lays it
    # down pointing along -Y, i.e. out through the nose.
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=LAMP_SIDES,
        radius=LAMP_RADIUS,
        depth=LAMP_DEPTH,
        location=(x, LAMP_Y, LAMP_Z),
        rotation=(math.radians(90.0), 0.0, 0.0),
    )
    adopt(bpy.context.object, name, 'vehicle_lamp_mat')


def add_spoiler():
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=SPOILER_CENTRE)
    obj = bpy.context.object
    obj.scale = SPOILER_SIZE
    adopt(obj, 'vehicle_spoiler', 'vehicle_spoiler_mat')


def main():
    if bpy.context.object is not None and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')

    for name in ('vehicle_lamp_l', 'vehicle_lamp_r', 'vehicle_spoiler'):
        replace(name)

    add_lamp('vehicle_lamp_l', -LAMP_X)
    add_lamp('vehicle_lamp_r', LAMP_X)
    add_spoiler()

    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.wm.save_mainfile()
    print('vehicle details: ' + ', '.join(o.name for o in collection().objects))


main()
