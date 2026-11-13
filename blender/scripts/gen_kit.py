"""
Builds blender/kit/arena_kit.blend: the shared pieces the runtime draws as
InstancedMesh wherever a district places an `inst_<type>_<n>` empty (trees,
lamps) or a `collect_<kind>_<n>` empty (dots, golden dots, shuriken).

Each piece is a root mesh named `kit_<type>` whose geometry sits around its
own origin (floor centre), plus any `collision_` children the instances
should get. Roots are laid out in a row purely so they're easy to see in
Blender; the runtime only reads geometry relative to each root.

    blender -b --factory-startup -P blender/scripts/gen_kit.py -- --out blender/kit/arena_kit.blend
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _common import (  # noqa: E402
    ROOT, args, collider_cylinder, fresh_scene, material, save, visual,
)

BRAND = '#86BC25'


def build(coll):
    leaf = material('accent-cool', '#3F7F3A')
    leaf_dark = material('accent-cool', '#2E5E3A')
    bark = material('stone', '#7A5C44')
    metal = material('dark')
    lamp_head = material('ivory')
    gold = material('gold')
    green = material('brand-green')
    steel = material('ivory', '#C9CED4')

    x = 0

    def at():
        nonlocal x
        x += 6
        return (x, 0, 0)

    # Trees: three silhouettes, all under the 250-tri budget.
    root = visual('kit_tree-a', coll, leaf, lambda mb: (
        mb.cylinder((0, 1.0, 0), 0.22, 2.0, segments=6),
        mb.cylinder((0, 3.6, 0), 1.6, 3.4, segments=8, top_radius=0.05),
    ), location=at())
    # One material per mesh keeps each piece a single instanced draw; extra
    # colours are separate child meshes (see the lamp head).
    visual('kit_tree-a_trunk', coll, bark, lambda mb: mb.cylinder((0, 0.5, 0), 0.24, 1.0, segments=6), parent=root)
    collider_cylinder('kit_tree-a_trunk', coll, (0, 1.5, 0), 0.3, 3.0, parent=root)

    root = visual('kit_tree-b', coll, leaf_dark, lambda mb: (
        mb.cylinder((0, 1.1, 0), 0.24, 2.2, segments=6),
        mb.sphere((0, 3.4, 0), 1.7, segments=8, rings=6),
    ), location=at())
    collider_cylinder('kit_tree-b_trunk', coll, (0, 1.5, 0), 0.32, 3.0, parent=root)

    root = visual('kit_tree-c', coll, leaf, lambda mb: (
        mb.cylinder((0, 0.8, 0), 0.2, 1.6, segments=6),
        mb.box((0, 2.2, 0), (2.4, 1.4, 2.4)),
        mb.box((0, 3.4, 0), (1.6, 1.0, 1.6)),
    ), location=at())
    collider_cylinder('kit_tree-c_trunk', coll, (0, 1.2, 0), 0.28, 2.4, parent=root)

    root = visual('kit_lamp', coll, metal, lambda mb: (
        mb.cylinder((0, 2.6, 0), 0.09, 5.2, segments=6),
        mb.box((0.35, 5.2, 0), (0.9, 0.18, 0.3)),
    ), location=at())
    visual('kit_lamp_head', coll, lamp_head, lambda mb: mb.box((0.65, 5.05, 0), (0.4, 0.12, 0.26)), parent=root)
    collider_cylinder('kit_lamp_pole', coll, (0, 2.6, 0), 0.14, 5.2, parent=root)

    # Collectibles: no colliders -- the runtime treats them as sensors.
    visual('kit_dot', coll, green, lambda mb: mb.cylinder((0, 0, 0), 0.45, 0.16, segments=12, pitch=1.5708), location=at())
    visual('kit_golden', coll, gold, lambda mb: (
        mb.cylinder((0, 0, 0), 0.8, 0.24, segments=16, pitch=1.5708),
    ), location=at())
    visual('kit_shuriken', coll, steel, lambda mb: (
        mb.box((0, 0, 0), (1.3, 0.12, 0.32)),
        mb.box((0, 0, 0), (0.32, 0.12, 1.3)),
        mb.box((0, 0, 0), (0.9, 0.12, 0.22), yaw=0.785),
        mb.box((0, 0, 0), (0.22, 0.12, 0.9), yaw=0.785),
    ), location=at())


def main():
    out = args().get('out') or os.path.join(ROOT, 'blender', 'kit', 'arena_kit.blend')
    coll = fresh_scene('Kit')
    build(coll)
    save(out)
    print(f'[gen_kit] wrote {out}')


main()
