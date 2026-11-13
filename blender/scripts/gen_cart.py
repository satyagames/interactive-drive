"""
The anniversary cart (docs/pursuit-arena/04 §5): an original, toy-like
open-top buggy -- Deloitte-green tub, chunky wheels under rounded fenders, a
white roll bar, and a "10" pennant on a spring antenna. Generated, bevelled,
AO-baked and exported in one reproducible pass:

    blender -b --factory-startup -P blender/scripts/gen_cart.py
      -> blender/vehicle/cart.blend
         public/models/cart.glb
         public/textures/bake/cart-ao.jpg

(`npm run art:cart`.)

Authored in the car's **body space**: metres, the physics body's origin
(wheel-connection height) at (0, 0, 0), the nose towards game +Z, which is
Blender -Y -- the project's convention (docs/blender-conventions.md); the
runtime's `rebuild.cart.yawOffset` (pi) turns it to drive towards -Z. Sizes
come from the arcade preset at worldScale 1.6 (src/config.js `rebuild.arcade`):

    wheels  r 0.40, width 0.38, centres x +-0.624, z +1.016 (front) / -0.76 (back),
            y -0.06 at rest (spring settled), so the ground is at y = -0.46
    body    inside the 1.63 x 1.86 x 3.25 m physics box

Object contract with `src/vehicle/arcadeVehicle.js`:

    cart_*                      body parts (AO-baked); `cart_body` is what skins repaint
    wheel_FL / FR / BL / BR     one wheel each, origin at the hub, axle along X
                                (the runtime clones wheel_FL's look for all four)
    antenna                     empty, pivot at the base; rod, pennant and "10" as children
    light_brake_L / R           brake lamps (the runtime drives their brightness)
    light_reverse_L / R         reversing lamps

"L" is the car's left: model +X, because the model is turned pi at runtime.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import ROOT, MeshBuilder, empty, fresh_scene, g2b, material, save  # noqa: E402
import polish_lib as pl  # noqa: E402

BLEND = os.path.join(ROOT, 'blender', 'vehicle', 'cart.blend')
GLB = os.path.join(ROOT, 'public', 'models', 'cart.glb')
BAKE = os.path.join(ROOT, 'public', 'textures', 'bake', 'cart-ao.jpg')

GROUND_Y = -0.46
WHEEL = {'r': 0.40, 'w': 0.38, 'x': 0.624, 'front': 1.016, 'back': -0.76, 'y': -0.06}

# Materials; made in main() after fresh_scene() (which clears the file).
GREEN = IVORY = DARK = RED = None

EXPORT_KWARGS = dict(
    export_format='GLB',
    export_yup=True,
    export_apply=True,
    export_extras=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
    export_texcoords=True,
    export_normals=True,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14,
    use_selection=True,
)


def axle_cylinder(mb, centre, radius, width, segments=20):
    """A cylinder whose axis is game X (wheels, hubs, headlamps turn this with yaw)."""
    m = Matrix.Translation(g2b(*centre)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
    bmesh.ops.create_cone(mb.bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=radius, radius2=radius, depth=width, matrix=m)
    return mb


def lengthwise_cylinder(mb, centre, radius, length, segments=14):
    """A cylinder along game Z (headlamps)."""
    m = Matrix.Translation(g2b(*centre)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
    bmesh.ops.create_cone(mb.bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=radius, radius2=radius, depth=length, matrix=m)
    return mb


def build(coll):
    parts = {}

    # width: bevel width (0 = none, for parts that are already round);
    # segments: 2 for the big read-from-afar shapes, 1 for small trim.
    def part(name, mat, fn, width, segments=2):
        mb = MeshBuilder()
        fn(mb)
        obj = mb.to_object(name, coll, mat)
        parts[name] = (obj, width, segments)
        return obj

    # Body: the tub, the nose and hood, four fenders, side pods, the rear deck.
    def body(mb):
        mb.box((0, 0.14, 0.05), (1.06, 0.50, 2.50))
        mb.box((0, 0.12, 1.42), (1.00, 0.44, 0.34))
        mb.box((0, 0.42, 0.95), (1.02, 0.12, 0.90))
        for side in (-1, 1):
            for z in (WHEEL['front'], WHEEL['back']):
                mb.box((side * 0.64, 0.46, z), (0.52, 0.12, 0.98))
            mb.box((side * 0.56, 0.30, 0.12), (0.22, 0.24, 0.80))
        mb.box((0, 0.46, -0.95), (1.06, 0.14, 0.60))
    part('cart_body', GREEN, body, 0.06)

    def trim(mb):
        mb.box((0, 0.02, 1.63), (1.24, 0.16, 0.14))       # front bumper
        mb.box((0, 0.04, -1.27), (1.24, 0.16, 0.14))      # rear bumper
        mb.box((0, 0.17, 1.595), (0.56, 0.18, 0.05))      # grille
        mb.box((0, 0.52, 0.52), (1.00, 0.16, 0.12))       # dashboard
        mb.cylinder((0.24, 0.66, 0.40), 0.17, 0.05, 12, pitch=-1.1)   # steering wheel
        mb.cylinder((0.24, 0.55, 0.47), 0.03, 0.24, 6, pitch=-1.1)    # column
    part('cart_trim', DARK, trim, 0.025, 1)

    def seats(mb):
        for x in (-0.24, 0.24):
            mb.box((x, 0.44, -0.24), (0.42, 0.12, 0.48))
            mb.box((x, 0.74, -0.50), (0.42, 0.58, 0.12))
    part('cart_seats', DARK, seats, 0.05, 1)

    def rollbar(mb):
        for x in (-0.52, 0.52):
            mb.cylinder((x, 0.88, -0.66), 0.045, 1.02, 8)
            # A rear stay from the top of each post down to the deck.
            mb.cylinder((x, 0.92, -0.92), 0.035, 0.86, 6, pitch=0.62)
        mb.box((0, 1.39, -0.66), (1.14, 0.09, 0.09))
    part('cart_rollbar', IVORY, rollbar, 0.0)

    def lamps(mb):
        for x in (-0.36, 0.36):
            lengthwise_cylinder(mb, (x, 0.20, 1.61), 0.10, 0.06, 12)
    part('cart_lamps', IVORY, lamps, 0.0)

    # Lamps the runtime drives (brake red, reversing white).
    for side, x in (('L', 0.38), ('R', -0.38)):
        part(f'light_brake_{side}', RED, lambda mb, x=x: mb.box((x, 0.36, -1.265), (0.20, 0.09, 0.04)), 0.0)
    for side, x in (('L', 0.16), ('R', -0.16)):
        part(f'light_reverse_{side}', IVORY, lambda mb, x=x: mb.box((x, 0.36, -1.265), (0.12, 0.08, 0.04)), 0.0)

    # Wheels: a fat tyre and a hub, origin at the hub.
    for name, x, z in (('FL', 1, WHEEL['front']), ('FR', -1, WHEEL['front']),
                       ('BL', 1, WHEEL['back']), ('BR', -1, WHEEL['back'])):
        tyre = MeshBuilder()
        axle_cylinder(tyre, (0, 0, 0), WHEEL['r'], WHEEL['w'], 16)
        wheel = tyre.to_object(f'wheel_{name}', coll, DARK, location=(x * WHEEL['x'], WHEEL['y'], z))
        parts[wheel.name] = (wheel, 0.07, 2)
        hub = MeshBuilder()
        axle_cylinder(hub, (0, 0, 0), 0.19, WHEEL['w'] + 0.02, 10)
        axle_cylinder(hub, (0, 0, 0), 0.07, WHEEL['w'] + 0.06, 6)
        hub_obj = hub.to_object(f'wheel_{name}_hub', coll, IVORY, parent=wheel)
        parts[hub_obj.name] = (hub_obj, 0.0, 0)

    # Antenna: an empty at the base (the spring's pivot), rod + pennant + "10".
    base = (0.42, 0.53, -1.05)
    antenna = empty('antenna', coll, 'PLAIN_AXES', base)
    rod = MeshBuilder().cylinder((0, 0.62, 0), 0.016, 1.24, 6, top_radius=0.011).sphere((0, 1.25, 0), 0.035, 8, 5)
    rod_obj = rod.to_object('antenna_rod', coll, IVORY, parent=antenna)
    pennant = MeshBuilder().box((0, 1.08, -0.20), (0.025, 0.24, 0.38))
    pennant_obj = pennant.to_object('antenna_pennant', coll, GREEN, parent=antenna)
    digits = MeshBuilder()
    for side in (-1, 1):
        digits.box((side * 0.016, 1.08, -0.10), (0.012, 0.15, 0.035))
        digits.ring((side * 0.016, 1.08, -0.26), 0.052, 0.026, segments=8, thickness=0.012, yaw=math.pi / 2)
    digits_obj = digits.to_object('antenna_digits', coll, IVORY, parent=antenna)
    for obj in (rod_obj, pennant_obj, digits_obj):
        parts[obj.name] = (obj, 0.0, 0)
    return parts


def main():
    global GREEN, IVORY, DARK, RED
    coll = fresh_scene('Cart')
    GREEN, IVORY, DARK, RED = material('brand-green'), material('ivory'), material('dark'), material('accent-warm')
    parts = build(coll)
    for obj, width, segments in parts.values():
        if width > 0:
            pl.bevel(obj, width, segments)
        else:
            pl.shade_by_angle(obj)

    # AO for the body parts; the wheels and a ground plane occlude, everything
    # small (lamps the runtime recolours, the antenna) is left out.
    baked = [parts[n][0] for n in ('cart_body', 'cart_trim', 'cart_seats', 'cart_rollbar', 'cart_lamps')]
    pl.unwrap(baked, margin=0.01)
    ground = pl.temp_ground(GROUND_Y, size=20.0)
    pl.bake_ao(baked, BAKE, 1024, samples=256, distance=1.2, blur_sigma=0.8)
    pl.remove(ground)

    save(BLEND)

    tris = 0
    for obj, _, _ in parts.values():
        obj.data.calc_loop_triangles()
        tris += len(obj.data.loop_triangles)
    objs = [o for o in bpy.context.scene.objects]
    pl.select_only(objs)
    os.makedirs(os.path.dirname(GLB), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=GLB, **EXPORT_KWARGS)
    print(f'[cart] {tris} triangles (budget 4000) -> {GLB} ({os.path.getsize(GLB)} bytes), AO -> {BAKE}')
    if tris > 4000:
        raise SystemExit(f'cart over budget: {tris} > 4000 triangles')


main()
