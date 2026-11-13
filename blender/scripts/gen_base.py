"""
Builds blender/districts/base.blend: everything between the districts.

  - the ground (visual `ground` + one big collider) the floor gradient paints
  - the Deadline Loop and Outer Loop ring roads, spokes to every district
  - the soft boundary: a low hedge berm plus an invisible wall at 135 m
  - four jump ramps on the Outer Loop
  - knockable fingerposts at the Deadline Loop junctions
  - trees and lamps (`inst_`), 100 green dots and the hidden shuriken that
    don't belong to a single district (`collect_`)

    blender -b --factory-startup -P blender/scripts/gen_base.py -- --out blender/districts/base.blend
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import arena_layout as L  # noqa: E402
from _common import (  # noqa: E402
    ROOT, MeshBuilder, args, collect, collider_box, dyn, fresh_scene, inst, load_seed,
    material, polar, rng, save, sfx, visual,
)


def build(coll, seed):
    road = material('dark', '#3C3F45')
    road_edge = material('ivory', '#F4F2EC')
    hedge = material('accent-cool', '#3F6B3A')
    ramp = material('stone', '#9C8F80')
    post = material('ivory', '#F4F2EC')

    # ---- ground ------------------------------------------------------------
    # The visible plane is named `ground` so floorGradient.js paints it; it
    # reaches past the 135 m boundary so the gradient can fade into the fog.
    visual('ground', coll, material('neutral'), lambda mb: mb.plate((0, 0, 0), 420, 420))
    collider_box('ground', coll, (0, -0.5, 0), (600, 1.0, 600))

    # ---- roads (visual only; the ground collider carries the car) ---------------
    def roads(mb):
        mb.annulus((0, 0, 0), *L.DEADLINE_LOOP, y=0.02, segments=96)
        mb.annulus((0, 0, 0), *L.OUTER_LOOP, y=0.02, segments=128)
        # Spokes: HQ plaza -> Deadline Loop at all 12 bearings, then on to
        # the Outer Loop at the six pillar / gate bearings.
        for angle in range(0, 360, 30):
            mid = (L.HQ_PLAZA + L.DEADLINE_LOOP[0]) / 2
            x, z = polar(mid, angle)
            mb.plate((x, 0.02, z), L.ROAD_WIDTH, L.DEADLINE_LOOP[0] - L.HQ_PLAZA + 1, yaw=math.radians(-angle))
        for angle in range(0, 360, 60):
            mid = (L.DEADLINE_LOOP[1] + L.OUTER_LOOP[0]) / 2
            x, z = polar(mid, angle)
            mb.plate((x, 0.02, z), L.ROAD_WIDTH, L.OUTER_LOOP[0] - L.DEADLINE_LOOP[1] + 1, yaw=math.radians(-angle))
        # Short spurs from the Deadline Loop out to each team territory.
        for angle in range(30, 360, 60):
            start, end = L.DEADLINE_LOOP[1], L.INNER_RING - L.TERRITORY_RADIUS
            x, z = polar((start + end) / 2, angle)
            mb.plate((x, 0.02, z), L.ROAD_WIDTH, end - start + 1, yaw=math.radians(-angle))
    visual('roads', coll, road, roads)

    def kerbs(mb):
        for radius in (L.DEADLINE_LOOP[0], L.DEADLINE_LOOP[1], L.OUTER_LOOP[0], L.OUTER_LOOP[1]):
            mb.annulus((0, 0, 0), radius - 0.15, radius + 0.15, y=0.03, segments=128)
    visual('road_kerbs', coll, road_edge, kerbs)

    # ---- boundary ------------------------------------------------------------------
    visual('boundary_berm', coll, hedge, lambda mb: mb.ring((0, 0.5, 0), L.BOUNDARY, 2.4, segments=72, thickness=1.2, vertical=False))
    segments = 48
    for i in range(segments):
        a = (i + 0.5) / segments * 360
        x, z = polar(L.BOUNDARY + 2.0, a)
        length = 2 * (L.BOUNDARY + 2.0) * math.sin(math.pi / segments) + 1.0
        collider_box(f'boundary_wall_{i:02d}', coll, (x, 3.0, z), (length, 6.0, 1.0), yaw=math.radians(-a))

    # ---- jump ramps on the Outer Loop -------------------------------------------------
    mid = sum(L.OUTER_LOOP) / 2
    pitch = math.radians(L.RAMP_PITCH_DEG)
    height = L.RAMP_LENGTH * math.tan(pitch)
    for i, angle in enumerate(L.RAMP_ANGLES):
        x, z = polar(mid, angle)
        # Clockwise travel round the loop: the ramp faces along the tangent.
        yaw = math.radians(-angle) - math.pi / 2
        visual(f'ramp_{i}', coll, ramp, lambda mb: mb.wedge((0, 0, 0), L.RAMP_LENGTH, 4.0, height), location=(x, 0, z), yaw=yaw)
        # A thin box tilted to the wedge's slope; its low edge sinks into the ground.
        c, s = math.cos(yaw), math.sin(yaw)
        collider_box(f'ramp_{i}', coll, (x, height / 2 - 0.15 * math.cos(pitch), z), (4.0, 0.3, L.RAMP_LENGTH / math.cos(pitch)),
                     yaw=yaw, pitch=pitch)

    # ---- fingerposts at the Deadline Loop junctions (knockable) -----------------------
    for i, angle in enumerate(range(0, 360, 30)):
        x, z = polar(L.DEADLINE_LOOP[0] - 2.2, angle + 6)
        dyn('fingerpost', i, coll, (x, 1.6, z), math.radians(-angle), post,
            lambda mb: (mb.cylinder((0, 0, 0), 0.09, 3.2, segments=6), mb.box((0.55, 1.2, 0), (1.3, 0.32, 0.08))),
            [('cyl', (0, 0, 0), 0.08, 2.9), ('box', (0.55, 1.2, 0), (1.15, 0.28, 0.07))],
            mass=2.0, sfx_class='wood', suffix='base_')

    # ---- trees + lamps --------------------------------------------------------------------
    r = rng('pursuit-arena-base')
    blocked = [(d['x'], d['z'], (L.PILLAR_RADIUS if d['kind'] == 'pillar' else L.TERRITORY_RADIUS) + 6)
               for d in L.districts(seed).values() if d['kind'] in ('territory', 'pillar', 'gate')]
    blocked.append((0.0, 0.0, L.HQ_PLAZA + 4))

    def free_spot(x, z):
        radius = math.hypot(x, z)
        if radius > L.BOUNDARY - 4:
            return False
        for lo, hi in (L.DEADLINE_LOOP, L.OUTER_LOOP):
            if lo - 4 < radius < hi + 4:
                return False
        angle = (math.degrees(math.atan2(x, -z)) + 360) % 360
        for spoke in range(0, 360, 30):
            gap = abs((angle - spoke + 180) % 360 - 180)
            if gap * math.pi / 180 * radius < L.ROAD_WIDTH + 3 and radius < L.OUTER_LOOP[1] + 4:
                return False
        if abs(x) < 9 and z > 0:   # Decade Drive corridor
            return False
        return all(math.hypot(x - bx, z - bz) > br for bx, bz, br in blocked)

    trees = 0
    attempts = 0
    while trees < 160 and attempts < 6000:
        attempts += 1
        x, z = r.uniform(-L.BOUNDARY, L.BOUNDARY), r.uniform(-L.BOUNDARY, L.BOUNDARY)
        if free_spot(x, z):
            inst(r.choice(['tree-a', 'tree-b', 'tree-c']), trees, coll, (x, 0, z), r.uniform(0, math.tau), r.uniform(0.85, 1.25))
            trees += 1

    lamps = 0
    for loop in (L.DEADLINE_LOOP, L.OUTER_LOOP):
        count = 18 if loop is L.DEADLINE_LOOP else 28
        for i in range(count):
            angle = (i + 0.5) / count * 360 + 3
            x, z = polar(loop[1] + 1.6, angle)
            inst('lamp', lamps, coll, (x, 0, z), math.radians(-angle) + math.pi / 2)
            lamps += 1

    # ---- collectibles -------------------------------------------------------------------------
    # 100 green dots along the racing lines: 44 round the Outer Loop, 32 round
    # the Deadline Loop, 24 down the pillar spokes (doc 03 §2.3).
    dots = 0
    for count, radius in ((44, sum(L.OUTER_LOOP) / 2), (32, sum(L.DEADLINE_LOOP) / 2)):
        for i in range(count):
            x, z = polar(radius, (i + 0.25) / count * 360)
            collect('dot', dots, coll, (x, 0, z))
            dots += 1
    for angle in range(0, 360, 60):
        for k in range(4):
            x, z = polar(L.DEADLINE_LOOP[1] + 8 + k * 8, angle)
            collect('dot', dots, coll, (x, 0, z))
            dots += 1
    assert dots == 100, dots

    # Shuriken that live between districts; the rest sit inside their district files.
    for i, (radius, angle) in enumerate(((L.BOUNDARY - 8, 75.0), (L.BOUNDARY - 8, 255.0), (sum(L.OUTER_LOOP) / 2, 90.0))):
        x, z = polar(radius, angle)
        collect('shuriken', f'base_{i}', coll, (x, 0, z))
    # One rides on top of the first ramp's lip.
    x, z = polar(mid, L.RAMP_ANGLES[1])
    collect('shuriken', 'base_ramp', coll, (x, height + 1.0, z))

    sfx('arena_wind', coll, (0, 2, 0), L.BOUNDARY)


def main():
    out = args().get('out') or os.path.join(ROOT, 'blender', 'districts', 'base.blend')
    coll = fresh_scene('District')
    build(coll, load_seed())
    save(out)
    print(f'[gen_base] wrote {out}')


main()
