"""
Builds one district greybox: blender/districts/<id>.blend.

    blender -b --factory-startup -P blender/scripts/gen_district.py -- --id audit --out blender/districts/audit.blend

Every district follows doc 02 §3 at the coordinates in content/arena.seed.json:
a plaza, a gateway on the HQ side with the passport stamp trigger, one
landmark, one pod + `area_<station id>` per content station, a themed
playground of dynamic props, trees, a spawn point and an ambience emitter.
HQ, the RFP Gate and the Decade Drive have their own layouts.

Shapes are deliberately primitive (Phase 10 replaces them with final art);
what matters here is names, positions, colliders and budgets.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import arena_layout as L  # noqa: E402
from _common import (  # noqa: E402
    ROOT, Frame, MeshBuilder, area, args, collect, collider_box, collider_cylinder, dyn, empty,
    fresh_scene, inst, load_seed, material, rng, save, sfx, solid_box, solid_cylinder, spawn, trigger, visual,
)

BRAND = '#86BC25'
WHITE = '#F4F2EC'
GREY = '#DADFE3'


def lighten(hexcode, amount=0.55):
    h = hexcode.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    mix = lambda c: round(c + (255 - c) * amount)  # noqa: E731
    return f'#{mix(r):02X}{mix(g):02X}{mix(b):02X}'


# ---- prop recipes (visual builder, colliders ~10% inside, mass, sfx) ---------------

def prop(coll, kind, index, frame, lx, lz, mat, y=None, yaw=0.0, suffix=''):
    spec = PROPS[kind]
    x, z = frame.to_world(lx, lz)
    height = spec['y'] if y is None else y
    return dyn(kind, index, coll, (x, height, z), frame.yaw(yaw), mat, spec['visual'], spec['colliders'],
               spec['mass'], spec['sfx'], spec.get('friction', 0.5), spec.get('restitution', 0.2), suffix)


def _box_prop(w, h, d, mass, sfx_class, **extra):
    inner = (w * 0.9, h * 0.9, d * 0.9)
    return dict(y=h / 2, visual=lambda mb: mb.box((0, 0, 0), (w, h, d)), colliders=[('box', (0, 0, 0), inner)],
                mass=mass, sfx=sfx_class, foot=max(w, d), **extra)


def _cyl_prop(r, h, mass, sfx_class, segments=10, **extra):
    return dict(y=h / 2, visual=lambda mb: mb.cylinder((0, 0, 0), r, h, segments),
                colliders=[('cyl', (0, 0, 0), r * 0.9, h * 0.9)], mass=mass, sfx=sfx_class, foot=2 * r, **extra)


def _ball_prop(r, mass, sfx_class, **extra):
    return dict(y=r, visual=lambda mb: mb.sphere((0, 0, 0), r, segments=12, rings=8),
                colliders=[('sph', (0, 0, 0), r * 0.92)], mass=mass, sfx=sfx_class, foot=2 * r, **extra)


PROPS = {
    'cone': dict(y=0.45, visual=lambda mb: (mb.box((0, -0.4, 0), (0.7, 0.1, 0.7)), mb.cylinder((0, 0.05, 0), 0.32, 0.8, 8, top_radius=0.06)),
                 colliders=[('box', (0, -0.4, 0), (0.62, 0.09, 0.62)), ('cyl', (0, 0.05, 0), 0.22, 0.72)], mass=0.4, sfx='plastic', foot=0.7),
    'barblock': _box_prop(1.2, 1.2, 1.2, 1.0, 'wood'),
    'binder': _box_prop(0.4, 1.0, 0.8, 0.5, 'paper'),
    'coin': _cyl_prop(0.6, 0.25, 0.6, 'metal', 14),
    'percent': _box_prop(0.9, 1.4, 0.3, 0.6, 'plastic'),
    'plane': dict(y=0.3, visual=lambda mb: mb.wedge((0, -0.3, 0), 1.4, 1.0, 0.5), colliders=[('box', (0, -0.05, 0), (0.9, 0.4, 1.2))], mass=0.3, sfx='paper', foot=1.4),
    'bulb': _ball_prop(0.6, 0.6, 'plastic', restitution=0.5),
    'gear': dict(y=0.9, visual=lambda mb: mb.cylinder((0, 0, 0), 0.9, 0.35, 12, pitch=1.5708),
                 colliders=[('cyl', (0, 0, 0), 0.82, 0.3)], mass=1.5, sfx='metal', foot=1.8),
    'sticky': _box_prop(0.8, 0.8, 0.8, 0.4, 'paper'),
    'tyre': _cyl_prop(0.7, 0.45, 0.8, 'rubber', 12, restitution=0.5),
    'flag': dict(y=1.6, visual=lambda mb: (mb.cylinder((0, 0, 0), 0.07, 3.2, 6), mb.box((0.5, 1.2, 0), (0.9, 0.6, 0.05))),
                 colliders=[('cyl', (0, 0, 0), 0.07, 2.9)], mass=0.6, sfx='metal', foot=1.0),
    'paintcan': _cyl_prop(0.4, 0.7, 0.6, 'metal', 10),
    'crayon': dict(y=0.35, visual=lambda mb: mb.cylinder((0, 0, 0), 0.3, 2.4, 6, pitch=1.5708),
                   colliders=[('cyl', (0, 0, 0), 0.27, 2.2)], mass=0.8, sfx='wood', foot=2.4),
    'frame': _box_prop(1.6, 1.2, 0.15, 0.6, 'wood'),
    'globe': _ball_prop(1.6, 3.0, 'rubber', restitution=0.45),
    'luggage': _box_prop(1.0, 0.8, 0.5, 0.9, 'plastic'),
    'eventcube': _box_prop(1.0, 1.0, 1.0, 0.7, 'plastic'),
    'pin': dict(y=0.9, visual=lambda mb: (mb.cylinder((0, -0.3, 0), 0.32, 1.2, 8, top_radius=0.2), mb.sphere((0, 0.5, 0), 0.3, 8, 6)),
                colliders=[('cyl', (0, -0.1, 0), 0.28, 1.6)], mass=0.1, sfx='wood', restitution=0.3, foot=0.7),
    'bowlingball': _ball_prop(0.9, 1.0, 'rubber'),
    'jenga': _box_prop(2.4, 0.5, 0.8, 0.6, 'wood'),
    'soccer': _ball_prop(0.8, 0.5, 'rubber', restitution=0.6),
    'brick': _box_prop(1.2, 0.6, 0.6, 0.5, 'brick'),
    'toolbox': _box_prop(1.2, 0.6, 0.6, 1.0, 'metal'),
    'spanner': _box_prop(1.6, 0.15, 0.3, 0.4, 'metal'),
    'beachball': _ball_prop(0.7, 0.2, 'rubber', restitution=0.7),
    'balloon': _ball_prop(0.6, 0.1, 'rubber', restitution=0.7),
    'crate': _box_prop(1.0, 0.7, 0.7, 0.7, 'wood'),
    'chair': _box_prop(0.6, 0.9, 0.6, 0.4, 'metal'),
    'planter': _cyl_prop(0.6, 0.8, 1.5, 'brick', 10),
    'finalbox': _box_prop(1.0, 0.8, 0.8, 0.5, 'paper'),
}


# ---- letters for the intro: our own blocky 3x5 type, not a font -------------------

GLYPHS = {
    'P': [(0, 0, 1, 5), (1, 4, 1, 1), (2, 2, 1, 3), (1, 2, 1, 1)],
    'U': [(0, 1, 1, 4), (2, 1, 1, 4), (0, 0, 3, 1)],
    'R': [(0, 0, 1, 5), (1, 4, 1, 1), (2, 2, 1, 3), (1, 2, 1, 1), (2, 0, 1, 2)],
    'S': [(0, 4, 3, 1), (0, 2, 1, 2), (1, 2, 2, 1), (2, 0, 1, 2), (0, 0, 2, 1)],
    'I': [(1, 1, 1, 3), (0, 4, 3, 1), (0, 0, 3, 1)],
    'T': [(0, 4, 3, 1), (1, 0, 1, 4)],
    'A': [(0, 0, 1, 5), (2, 0, 1, 5), (1, 4, 1, 1), (1, 2, 1, 1)],
    'E': [(0, 0, 1, 5), (1, 4, 2, 1), (1, 2, 1, 1), (1, 0, 2, 1)],
    'N': [(0, 0, 1, 5), (2, 0, 1, 5), (1, 2, 1, 2)],
    '1': [(1, 0, 1, 5), (0, 3, 1, 1)],
    '0': [(0, 0, 1, 5), (2, 0, 1, 5), (1, 4, 1, 1), (1, 0, 1, 1)],
}


def letter(coll, char, index, location, yaw, unit, depth, mat, mass):
    """A dynamic compound letter: one box per stroke, centred on its bounding box."""
    rects = GLYPHS[char]
    w = max(x + rw for x, _, rw, _ in rects) * unit
    h = 5 * unit
    boxes = [((x + rw / 2) * unit - w / 2, (y + rh / 2) * unit - h / 2, rw * unit, rh * unit) for x, y, rw, rh in rects]
    key = f'letter-{char}' if unit < 0.55 else f'letter-gold-{char}'
    return dyn(key, index, coll, (location[0], h / 2, location[2]), yaw, mat,
               lambda mb: [mb.box((cx, cy, 0), (bw, bh, depth)) for cx, cy, bw, bh in boxes],
               [('box', (cx, cy, 0), (bw * 0.92, bh * 0.92, depth * 0.9)) for cx, cy, bw, bh in boxes],
               mass, 'wood', suffix='')


# ---- shared district skeleton --------------------------------------------------------

def plaza(coll, ident, frame, radius, tint):
    visual(f'plaza_{ident}', coll, material('ivory', lighten(tint, 0.7)),
           lambda mb: mb.cylinder((0, 0.02, 0), radius, 0.04, 40), location=(frame.x, 0, frame.z))


def gateway(coll, ident, frame, radius, tint, label_mat):
    """Two posts and a lintel on the HQ side; the stamp trigger fills the opening."""
    post = material('ivory', WHITE)
    for side in (-1, 1):
        x, z = frame.to_world(side * 4.2, -radius + 1)
        solid_box(f'landmark_{ident}_gatepost_{"lr"[side > 0]}', coll, post, (x, 0, z), (0.8, 4.6, 0.8), yaw=frame.yaw())
    x, z = frame.to_world(0, -radius + 1)
    visual(f'landmark_{ident}_lintel', coll, label_mat, lambda mb: mb.box((0, 4.9, 0), (9.2, 0.9, 0.5)),
           location=(x, 0, z), yaw=frame.yaw())
    trigger(f'stamp_{ident}', coll, (x, 0, z), (3.6, 2.0, 1.6), yaw=frame.yaw())
    sx, sz = frame.to_world(0, -radius - 5)
    spawn(ident, coll, (sx, 0.6, sz), frame.yaw(math.pi))
    # Floor typography plate for the district name (art arrives in Phase 10).
    dx, dz = frame.to_world(0, -radius + 3.2)
    visual(f'decal_{ident}_name', coll, material('ivory', lighten(tint, 0.25)),
           lambda mb: mb.plate((0, 0.06, 0), 9.0, 2.2), location=(dx, 0, dz), yaw=frame.yaw())


def pods(coll, ident, frame, stations, radius, tint):
    """
    One kiosk per station on a front arc (radius 0.6 R, at most ±60° off the
    gateway axis), each facing the plaza centre with its Enter area on the
    inside -- so you drive in through the gateway and the stations ring you.
    """
    body = material('ivory', WHITE)
    roof = material('ivory', tint)
    count = len(stations)
    ring = radius * 0.6
    # Pods alternate left / right of the gateway axis, 25-55° off it, so
    # the straight run from the gateway to the plaza centre stays clear.
    left = math.ceil(count / 2)
    right = count - left

    def side_angles(n, sign):
        if n == 0:
            return []
        if n == 1:
            return [sign * 40.0]
        return [sign * (25.0 + 30.0 * k / (n - 1)) for k in range(n)]
    angles = side_angles(left, -1) + side_angles(right, 1)
    for i, station in enumerate(stations):
        a = math.radians(angles[i])
        lx, lz = ring * math.sin(a), -ring * math.cos(a)
        x, z = frame.to_world(lx, lz)
        yaw = frame.yaw(math.pi - a)   # local -Z towards the centre
        solid_box(f'pod_{station["id"]}', coll, body, (x, 0, z), (3.2, 2.6, 2.4), yaw=yaw)
        visual(f'pod_{station["id"]}_roof', coll, roof, lambda mb: mb.box((0, 2.75, 0), (3.8, 0.3, 3.0)),
               location=(x, 0, z), yaw=yaw)
        inner = ring - 4.2
        ax, az = frame.to_world(inner * math.sin(a), -inner * math.cos(a))
        area(station['id'], coll, (ax, 0, az), (2.2, 1.5, 2.2), yaw=yaw)


def trees_around(coll, ident, frame, radius, count, skip_front=60.0, skip_back=0.0):
    """Trees on a band just outside the plaza; angle 0 = the gateway (front) side."""
    r = rng(f'trees-{ident}')
    placed = 0
    for i in range(count * 4):
        if placed >= count:
            break
        a = r.uniform(0, 360)
        off_front = abs(((a + 180) % 360) - 180)
        if off_front < skip_front or off_front > 180 - skip_back:
            continue
        rr = radius + r.uniform(1.5, 4.5)
        lx, lz = rr * math.sin(math.radians(a)), -rr * math.cos(math.radians(a))
        x, z = frame.to_world(lx, lz)
        inst(r.choice(['tree-a', 'tree-b', 'tree-c']), f'{ident}_{placed}', coll, (x, 0, z), r.uniform(0, math.tau), r.uniform(0.8, 1.2))
        placed += 1


def playground(coll, ident, frame, items, side, radius, mat_for, z0):
    """
    The district's dynamic props, packed into one block in a side band
    (|x| from 0.45 R outwards, 0.4 R wide), rows growing towards the back
    from `z0`. Each kind starts a new row; 'stack' piles its count into a
    small staggered stack instead of spreading it out.
    """
    index = 0
    inner = radius * 0.45
    band = radius * 0.4
    oz = z0
    for kind, count, layout in items:
        spec = PROPS[kind]
        step = spec.get('foot', 1.2) + 0.5
        cols = max(1, int(band // step))
        if layout == 'stack':
            cols = min(cols, max(2, math.ceil(math.sqrt(count))))
            for i in range(count):
                col, level = i % cols, i // cols
                stagger = step / 2 if level % 2 else 0.0
                x = side * (inner + step / 2 + col * step + stagger)
                prop(coll, kind, index, frame, x, oz + step / 2, mat_for(kind), y=spec['y'] + level * spec['y'] * 2 * 1.02,
                     suffix=f'{ident}_')
                index += 1
            oz += step + 0.8
            continue
        rows = math.ceil(count / cols)
        for i in range(count):
            col, row = i % cols, i // cols
            x = side * (inner + step / 2 + col * step)
            prop(coll, kind, index, frame, x, oz + step / 2 + row * step, mat_for(kind), suffix=f'{ident}_')
            index += 1
        oz += rows * step + 0.8
    return oz


# ---- landmarks (doc 02 §3.3 / §3.4) ----------------------------------------------------

def landmark(coll, ident, frame, tint, radius):
    lx, lz = 0.0, radius * 0.45
    x, z = frame.to_world(lx, lz)
    yaw = frame.yaw()
    main = material('ivory', tint)
    accent = material('ivory', lighten(tint, 0.45))
    white = material('ivory', WHITE)
    dark = material('dark')
    gold = material('ivory', '#E3B505')

    def at(dx, dz):
        return frame.to_world(lx + dx, lz + dz)

    if ident == 'audit':   # stacked-ledger towers + magnifying glass
        for i, (dx, h) in enumerate(((-4.5, 9.0), (0.0, 13.0), (4.5, 7.0))):
            px, pz = at(dx, 1.5)
            solid_box(f'landmark_audit_ledger_{i}', coll, main if i != 1 else accent, (px, 0, pz), (3.4, h, 3.0), yaw=yaw)
        px, pz = at(0, -3.5)
        visual('landmark_audit_glass', coll, white, lambda mb: (mb.ring((0, 4.2, 0), 2.0, 0.45, segments=16),
                                                              mb.cylinder((0, 1.1, 0), 0.25, 2.2, 8)),
               location=(px, 0, pz), yaw=yaw)
        collider_cylinder('landmark_audit_glass_handle', coll, (px, 1.1, pz), 0.3, 2.2)
    elif ident == 'tax':   # calculator-key buildings + coin tower
        for i in range(9):
            px, pz = at((i % 3 - 1) * 3.2, (i // 3) * 3.2 - 2)
            solid_box(f'landmark_tax_key_{i}', coll, main if i % 2 else accent, (px, 0, pz), (2.6, 2.0 + (i % 4), 2.6), yaw=yaw)
        px, pz = at(7.0, 1.0)
        visual('landmark_tax_coins', coll, gold, lambda mb: [mb.cylinder((0, 0.6 + k * 1.2, 0), 1.6 - k * 0.12, 1.1, 16) for k in range(6)],
               location=(px, 0, pz))
        collider_cylinder('landmark_tax_coins', coll, (px, 3.6, pz), 1.6, 7.2)
    elif ident == 'consulting':   # interlocking gears + a flowchart bridge you drive over
        for i, dx in enumerate((-3.0, 2.2)):
            px, pz = at(dx, 3.5)
            visual(f'landmark_consulting_gear_{i}', coll, main if i else accent,
                   lambda mb, r=3.2 - i * 0.8: mb.ring((0, r + 0.2, 0), r, 0.9, segments=12, thickness=0.8), location=(px, 0, pz), yaw=yaw)
            collider_box(f'landmark_consulting_gear_{i}', coll, (px, 3.0 - i * 0.8, pz), (6.4 - i * 1.6, 6.0 - i * 1.6, 0.8), yaw=yaw)
        # Along the back edge, so it never crosses the playground or pods.
        bridge(coll, 'landmark_consulting_bridge', frame, (0.0, radius + 2.5), white, deck=1.6, deck_len=6.0)
    elif ident == 'pace':   # mini oval track + pace-car tower + chequered flags
        px, pz = at(0, 0)
        visual('landmark_pace_oval', coll, dark, lambda mb: (mb.annulus((0, 0.04, 0), 5.0, 7.0, y=0.04, segments=40)),
               location=(px, 0, pz))
        tx, tz = at(0, 0)
        solid_box('landmark_pace_tower', coll, main, (tx, 0, tz), (2.4, 11.0, 2.4), yaw=yaw)
        visual('landmark_pace_tower_cab', coll, accent, lambda mb: mb.box((0, 11.8, 0), (4.0, 1.6, 4.0)), location=(tx, 0, tz), yaw=yaw)
    elif ident == 'studio':   # pencil obelisk + swatch fan wall + easel
        px, pz = at(-3.0, 1.0)
        visual('landmark_studio_pencil', coll, main, lambda mb: (mb.cylinder((0, 6.0, 0), 1.3, 12.0, 6),
                                                                   mb.cylinder((0, 13.2, 0), 1.3, 2.4, 6, top_radius=0.05)),
               location=(px, 0, pz))
        collider_cylinder('landmark_studio_pencil', coll, (px, 6.0, pz), 1.3, 12.0)
        sx, sz = at(4.0, 2.5)
        swatches = ('#E86A5C', '#E3B505', '#86BC25', '#00A3E0', '#7F5BA6')
        for i, colour in enumerate(swatches):
            visual(f'landmark_studio_swatch_{i}', coll, material('ivory', colour),
                   lambda mb, k=i: mb.box((0, 3.0, 0), (1.0, 6.0, 0.2), yaw=-0.5 + k * 0.25), location=(sx, 0, sz), yaw=yaw)
        collider_box('landmark_studio_swatches', coll, (sx, 3.0, sz), (3.0, 6.0, 1.4), yaw=yaw)
        ex, ez = at(0.5, -2.5)
        visual('landmark_studio_easel', coll, white, lambda mb: (mb.box((0, 2.0, 0), (2.4, 1.8, 0.15)), mb.box((0, 1.0, 0.4), (0.15, 2.0, 0.15))),
               location=(ex, 0, ez), yaw=yaw)
    elif ident == 'catalyst':   # arched bridge with a gap + globe + twin clocks
        bridge(coll, 'landmark_catalyst_bridge', frame, (0.0, radius + 2.5), white, deck=2.2, deck_len=6.0, gap=4.0, drop=0.7)
        gx, gz = at(-6.5, 3.5)
        visual('landmark_catalyst_globe', coll, main, lambda mb: (mb.sphere((0, 3.2, 0), 2.4, 14, 8),
                                                                   mb.ring((0, 3.2, 0), 3.0, 0.15, segments=16, thickness=0.15)),
               location=(gx, 0, gz), yaw=yaw)
        collider_cylinder('landmark_catalyst_globe', coll, (gx, 2.6, gz), 2.4, 5.2)
        for i, dx in enumerate((5.5, 8.0)):
            cx, cz = at(dx, 4.0)
            solid_box(f'landmark_catalyst_clock_{i}', coll, accent, (cx, 0, cz), (1.8, 4.2, 1.0), yaw=yaw)
            visual(f'landmark_catalyst_clock_{i}_face', coll, white, lambda mb: mb.cylinder((0, 3.4, -0.55), 0.7, 0.1, 16, pitch=1.5708),
                   location=(cx, 0, cz), yaw=yaw)
    elif ident == 'innovation':   # glass dome with orbiting rings
        px, pz = at(0, 0)
        visual('landmark_innovation_dome', coll, material('accent-cool', lighten(tint, 0.3)),
               lambda mb: mb.sphere((0, 0, 0), 7.0, 18, 10), location=(px, 0, pz))
        collider_cylinder('landmark_innovation_dome', coll, (px, 2.5, pz), 6.3, 5.0)
        for i in range(2):
            visual(f'landmark_innovation_ring_{i}', coll, white,
                   lambda mb, k=i: mb.ring((0, 7.5 + k * 1.2, 0), 9.0 - k * 1.5, 0.25, segments=24, thickness=0.2, vertical=False),
                   location=(px, 0, pz))
    elif ident == 'rnr':   # trophy stadium + giant trophy
        px, pz = at(0, 2.0)
        # Low stadium wall with an entrance on the gateway side (local -Z:
        # horizontal ring segments 16-19 sit there once yawed into the frame).
        entrance = {16, 17, 18, 19}
        visual('landmark_rnr_stadium', coll, accent,
               lambda mb: mb.ring((0, 1.0, 0), 6.0, 1.2, segments=24, thickness=2.0, vertical=False, skip=entrance),
               location=(px, 0, pz), yaw=yaw)
        for i in range(24):
            if i in entrance:
                continue
            a = (i + 0.5) / 24 * math.tau
            ox, oz = 6.0 * math.cos(a), 6.0 * math.sin(a)
            wx, wz = frame.to_world(lx + ox, lz + 2.0 + oz)
            collider_box(f'landmark_rnr_stadium_{i:02d}', coll, (wx, 1.0, wz), (1.7, 2.0, 1.2), yaw=yaw - a - math.pi / 2)
        visual('landmark_rnr_trophy', coll, gold, lambda mb: (mb.cylinder((0, 0.6, 0), 1.6, 1.2, 12),
                                                                mb.cylinder((0, 2.4, 0), 0.4, 2.4, 8),
                                                                mb.cylinder((0, 5.0, 0), 1.0, 2.8, 12, top_radius=2.2),
                                                                mb.ring((0, 5.2, 0), 1.0, 0.25, segments=10, yaw=0.0)),
               location=(px, 0, pz))
        collider_cylinder('landmark_rnr_trophy', coll, (px, 3.2, pz), 1.6, 6.4)
    elif ident == 'lnd':   # open-book amphitheatre + graduation-cap pavilion
        bx, bz = at(0, 1.0)
        visual('landmark_lnd_book', coll, white, lambda mb: (mb.box((-3.2, 1.6, 0), (6.2, 0.4, 8.0), yaw=0.0, pitch=0.0),
                                                              mb.box((3.2, 1.6, 0), (6.2, 0.4, 8.0))),
               location=(bx, 0, bz), yaw=yaw)
        visual('landmark_lnd_spine', coll, main, lambda mb: mb.box((0, 0.8, 0), (0.6, 1.6, 8.0)), location=(bx, 0, bz), yaw=yaw)
        collider_box('landmark_lnd_book', coll, (bx, 0.9, bz), (12.8, 1.8, 8.0), yaw=yaw)
        cx, cz = at(-8.0, -1.0)
        solid_box('landmark_lnd_pavilion', coll, accent, (cx, 0, cz), (3.0, 3.0, 3.0), yaw=yaw)
        visual('landmark_lnd_cap', coll, material('dark'), lambda mb: mb.box((0, 3.3, 0), (4.6, 0.3, 4.6), yaw=0.785),
               location=(cx, 0, cz), yaw=yaw)
    elif ident == 'toolkit':   # giant toolbox building, lid open
        px, pz = at(0, 1.0)
        solid_box('landmark_toolkit_box', coll, material('ivory', '#C8102E'), (px, 0, pz), (12.0, 5.0, 6.0), yaw=yaw)
        visual('landmark_toolkit_lid', coll, material('ivory', '#A50D25'),
               lambda mb: mb.box((0, 5.0 + 2.6 * math.sin(1.0), 3.0 + 2.6 * math.cos(1.0)), (12.0, 0.4, 5.6), pitch=1.0),
               location=(px, 0, pz), yaw=yaw)
        visual('landmark_toolkit_handle', coll, material('dark'), lambda mb: mb.box((0, 5.8, 0), (4.0, 0.4, 0.4)),
               location=(px, 0, pz), yaw=yaw)
    elif ident == 'culture':   # park + bandstand + string-light canopy
        px, pz = at(0, 0)
        visual('landmark_culture_bandstand', coll, white, lambda mb: (
            mb.cylinder((0, 0.4, 0), 5.0, 0.8, 8),
            *[mb.cylinder((4.2 * math.cos(k / 8 * math.tau), 2.6, 4.2 * math.sin(k / 8 * math.tau)), 0.18, 3.6, 6) for k in range(8)],
            mb.cylinder((0, 5.4, 0), 5.6, 2.2, 8, top_radius=0.2),
        ), location=(px, 0, pz))
        collider_cylinder('landmark_culture_bandstand', coll, (px, 0.4, pz), 5.0, 0.8)
        for k in range(8):
            a = k / 8 * math.tau
            collider_cylinder(f'landmark_culture_post_{k}', coll, (px + 4.2 * math.cos(a), 2.6, pz + 4.2 * math.sin(a)), 0.2, 3.6)
        for k in range(6):
            sx, sz = at(-9.0 + k * 3.6, 6.8)
            solid_cylinder(f'landmark_culture_lightpole_{k}', coll, material('dark'), (sx, 0, sz), 0.1, 4.2, 6)


def bridge(coll, name, frame, local_centre, mat, deck, deck_len, gap=0.0, drop=0.0):
    """
    A drivable bridge along the frame's local X: ramp up, deck, ramp down.
    With `gap`, the deck is split for a jump and the far half sits `drop`
    lower so a car leaving the near edge at speed lands on it (doc 02 §3.3
    "Bridge Run"); too slow and you drop into the gap and drive out.
    """
    lx, lz = local_centre
    width = 4.5
    slope = math.radians(14)
    near_h, far_h = deck, deck - drop
    if gap > 0:
        half = deck_len / 2
        pieces = [('deck_near', -(gap + half) / 2, half, near_h), ('deck_far', (gap + half) / 2, half, far_h)]
        ends = ((-(gap / 2 + half), near_h), (gap / 2 + half, far_h))
    else:
        pieces = [('deck', 0.0, deck_len, near_h)]
        ends = ((-deck_len / 2, near_h), (deck_len / 2, near_h))
    for label, dx, length, h in pieces:
        x, z = frame.to_world(lx + dx, lz)
        solid_box(f'{name}_{label}', coll, mat, (x, h - 0.4, z), (length, 0.4, width), yaw=frame.yaw())
        visual(f'{name}_{label}_pier', coll, material('stone'),
               lambda mb, hh=h: mb.box((0, (hh - 0.4) / 2, 0), (0.8, hh - 0.4, width * 0.8)), location=(x, 0, z), yaw=frame.yaw())
    for side, (end, h) in zip(('in', 'out'), ends):
        ramp_len = h / math.tan(slope)
        direction = -1 if side == 'in' else 1
        x, z = frame.to_world(lx + end + direction * ramp_len / 2, lz)
        # The wedge rises towards its local -Z. 'in' climbs while driving +X
        # (yaw -90° in the frame), 'out' climbs while driving -X (+90°).
        ramp_yaw = frame.yaw(-math.pi / 2 if side == 'in' else math.pi / 2)
        visual(f'{name}_ramp_{side}', coll, mat, lambda mb, hh=h, ll=ramp_len: mb.wedge((0, 0, 0), ll, width, hh),
               location=(x, 0, z), yaw=ramp_yaw)
        collider_box(f'{name}_ramp_{side}', coll, (x, h / 2 - 0.2, z), (width, 0.4, math.hypot(ramp_len, h)),
                     yaw=ramp_yaw, pitch=math.atan2(h, ramp_len))


# ---- per-district specs ------------------------------------------------------------------

PLAYGROUNDS = {
    'audit': [('barblock', 9, 'stack'), ('binder', 6, 'row'), ('cone', 4, 'row')],
    'tax': [('coin', 12, 'stack'), ('plane', 5, 'row'), ('percent', 3, 'row')],
    'consulting': [('bulb', 5, 'row'), ('gear', 3, 'row'), ('sticky', 8, 'grid')],
    'pace': [('tyre', 10, 'stack'), ('flag', 4, 'row'), ('cone', 6, 'row')],
    'studio': [('paintcan', 8, 'grid'), ('crayon', 5, 'row'), ('frame', 4, 'row')],
    'catalyst': [('globe', 1, 'row'), ('luggage', 8, 'grid')],
    'innovation': [('eventcube', 8, 'grid'), ('cone', 4, 'row')],
    'rnr': [('pin', 10, 'pins'), ('bowlingball', 1, 'lane')],
    'lnd': [('jenga', 12, 'jenga'), ('soccer', 1, 'row')],
    'toolkit': [('brick', 24, 'wall'), ('toolbox', 4, 'row'), ('spanner', 4, 'row')],
    'culture': [('beachball', 5, 'row'), ('balloon', 6, 'row'), ('crate', 6, 'grid')],
}

PROP_COLOURS = {
    'barblock': None, 'coin': '#E3B505', 'bulb': '#FFF1C4', 'tyre': '#2B2B2B', 'brick': '#C8102E',
    'pin': WHITE, 'bowlingball': '#26890D', 'globe': '#00A3E0', 'beachball': '#E86A5C', 'balloon': '#E3B505',
    'cone': '#ED8B00', 'jenga': '#D9B88A', 'soccer': WHITE, 'paintcan': '#62B5E5',
}

SHURIKEN = {
    'consulting': ('bridge', (0.0, 0.0)),   # on the flowchart bridge deck
    'catalyst': ('under', (0.0, 0.0)),      # under the bridge gap
    'toolkit': ('behind', (0.0, 0.0)),      # behind the depot
}


def build_district(coll, ident, info, seed):
    tint = info['color']
    radius = L.PILLAR_RADIUS if info['kind'] == 'pillar' else L.TERRITORY_RADIUS
    frame = Frame.facing_centre(info['x'], info['z'])
    label = material('ivory', tint)

    plaza(coll, ident, frame, radius, tint)
    gateway(coll, ident, frame, radius, tint, label)
    landmark(coll, ident, frame, tint, radius)
    pods(coll, ident, frame, info['stations'], radius, tint)

    def mat_for(kind):
        colour = PROP_COLOURS.get(kind) or lighten(tint, 0.2)
        return material('ivory', colour)

    # Playground on the side away from the landmark's off-centre pieces,
    # starting just behind the outermost pods (which reach lz = -0.3 R).
    side = -1 if ident in ('audit', 'tax', 'pace', 'innovation', 'lnd') else 1
    items = PLAYGROUNDS[ident]
    z0 = -0.3 * radius + 2.4
    if ident == 'rnr':
        # Strike a Win: the lane runs front-to-back along the outer edge.
        bowling(coll, frame, (side * radius * 0.78, -1.0), mat_for)
    elif ident == 'lnd':
        jenga(coll, frame, (side * radius * 0.55, 0.0), mat_for('jenga'))
        prop(coll, 'soccer', 0, frame, side * radius * 0.55, 3.0, mat_for('soccer'), suffix='lnd_')
    elif ident == 'toolkit':
        red_tape_wall(coll, frame, (side * radius * 0.5, -1.0), mat_for('brick'))
        playground(coll, ident, frame, items[1:], side, radius, mat_for, z0=1.5)
    else:
        playground(coll, ident, frame, items, side, radius, mat_for, z0=z0)

    trees_around(coll, ident, frame, radius, 10 if info['kind'] == 'territory' else 14,
                 skip_back=70.0 if ident in ('consulting', 'catalyst') else 0.0)
    sfx(ident, coll, (frame.x, 2.0, frame.z), radius + 6)

    if ident in SHURIKEN:
        where, _ = SHURIKEN[ident]
        lx, lz = 0.0, radius * 0.45
        if where == 'bridge':
            x, z = frame.to_world(0.0, radius + 2.5)
            collect('shuriken', ident, coll, (x, 2.6, z))
        elif where == 'under':
            x, z = frame.to_world(0.0, radius + 2.5)
            collect('shuriken', ident, coll, (x, 0.9, z))
        else:
            x, z = frame.to_world(0, radius + 2.5)
            collect('shuriken', ident, coll, (x, 0.9, z))


def bowling(coll, frame, origin, mat_for):
    """Strike a Win: ten pins in a triangle, the ball up the lane."""
    ox, oz = origin
    index = 0
    for row in range(4):
        for k in range(row + 1):
            prop(coll, 'pin', index, frame, ox + (k - row / 2) * 1.2, oz + row * 1.1, mat_for('pin'), suffix='rnr_')
            index += 1
    prop(coll, 'bowlingball', 0, frame, ox, oz - 9.0, mat_for('bowlingball'), suffix='rnr_')


def jenga(coll, frame, origin, mat):
    ox, oz = origin
    for level in range(4):
        for k in range(3):
            if level % 2 == 0:
                prop(coll, 'jenga', level * 3 + k, frame, ox, oz + (k - 1) * 0.82, mat, y=0.25 + level * 0.51, suffix='lnd_')
            else:
                prop(coll, 'jenga', level * 3 + k, frame, ox + (k - 1) * 0.82, oz, mat, y=0.25 + level * 0.51,
                     yaw=math.pi / 2, suffix='lnd_')


def red_tape_wall(coll, frame, origin, mat):
    """Red Tape Wall: 6 x 4 bricks, staggered, across the approach."""
    ox, oz = origin
    index = 0
    for row in range(4):
        for k in range(6):
            offset = 0.6 if row % 2 else 0.0
            prop(coll, 'brick', index, frame, ox + (k - 2.5) * 1.22 + offset, oz, mat, y=0.3 + row * 0.61, suffix='toolkit_')
            index += 1


# ---- HQ, RFP Gate, Decade Drive ----------------------------------------------------------

def build_hq(coll, info):
    tint = info['color']
    frame = Frame(0.0, 0.0, 0.0)   # local -Z = north
    white = material('ivory', WHITE)
    glass = material('accent-cool', '#9FD3E0')
    green = material('ivory', BRAND)
    visual('plaza_hq', coll, material('ivory', '#E9ECEF'), lambda mb: mb.cylinder((0, 0.02, 0), L.HQ_PLAZA, 0.04, 48))

    # Command Tower: stepped, rounded, about 28 m, with the green "dot" beacon.
    visual('landmark_hq_tower', coll, glass, lambda mb: (
        mb.cylinder((0, 5.0, 0), 6.0, 10.0, 20),
        mb.cylinder((0, 14.5, 0), 4.6, 9.0, 20),
        mb.cylinder((0, 22.5, 0), 3.2, 7.0, 20),
    ), location=(0, 0, -4.0))
    visual('landmark_hq_tower_bands', coll, white, lambda mb: (
        mb.cylinder((0, 10.1, 0), 6.3, 0.4, 20), mb.cylinder((0, 19.1, 0), 4.9, 0.4, 20), mb.cylinder((0, 26.1, 0), 3.5, 0.4, 20),
    ), location=(0, 0, -4.0))
    visual('landmark_hq_beacon', coll, green, lambda mb: mb.sphere((0, 27.6, 0), 1.3, 14, 8), location=(0, 0, -4.0))
    collider_cylinder('landmark_hq_tower_base', coll, (0, 5.0, -4.0), 6.0, 10.0)
    collider_cylinder('landmark_hq_tower_mid', coll, (0, 14.5, -4.0), 4.6, 9.0)

    # Leadership Balcony (raised, off the tower) + "Our COE at a glance" kiosk.
    solid_box('pod_hq_leadership', coll, white, (-9.6, 0, -4.0), (3.4, 3.2, 3.0))
    visual('pod_hq_leadership_rail', coll, green, lambda mb: mb.box((0, 3.4, 0), (3.8, 0.3, 3.4)), location=(-9.6, 0, -4.0))
    area('hq_leadership', coll, (-9.6, 0, 1.0), (2.4, 1.5, 2.2))
    solid_box('pod_hq_org', coll, white, (9.6, 0, -4.0), (3.4, 2.6, 3.0))
    visual('pod_hq_org_roof', coll, green, lambda mb: mb.box((0, 2.75, 0), (3.8, 0.3, 3.4)), location=(9.6, 0, -4.0))
    area('hq_org', coll, (9.6, 0, 1.0), (2.4, 1.5, 2.2))

    # Submission Portal: a green ring on the south approach (the Dash finish).
    visual('landmark_hq_portal', coll, green, lambda mb: mb.ring((0, 3.6, 0), 3.4, 0.6, segments=16, thickness=0.8),
           location=(0, 0, 13.0))
    for k, x in enumerate((-3.6, 3.6)):
        collider_box(f'landmark_hq_portal_{k}', coll, (x, 2.0, 13.0), (0.7, 4.0, 0.8))
    area('hq_submission_portal', coll, (0, 0, 13.0), (2.6, 2.0, 1.6))

    # The "10" monument: a "1" and a "0" arch you drive through (ring with
    # its bottom left open). Doc 02 §3.2; a full loop-the-loop is a Phase 10
    # art + feel job.
    solid_box('landmark_hq_one', coll, green, (-14.0, 0, 6.0), (1.6, 7.0, 1.6), yaw=math.radians(38))
    zero_segments = 16
    zero_r = 3.4
    open_bottom = {11, 12}   # segment i sits at (i + 0.5) / 16 of a turn from +X; 11 and 12 are lowest

    def zero(mb):
        mb.ring((0, zero_r + 0.4, 0), zero_r, 0.7, segments=zero_segments, thickness=1.2, skip=open_bottom)
    visual('landmark_hq_zero', coll, green, zero, location=(-9.0, 0, 9.0), yaw=math.radians(38))
    for i in range(zero_segments):
        if i in open_bottom:
            continue
        a = (i + 0.5) / zero_segments * math.tau
        lx, ly = zero_r * math.cos(a), zero_r * math.sin(a) + zero_r + 0.4
        if ly < 0.9:
            continue
        c, s = math.cos(math.radians(38)), math.sin(math.radians(38))
        collider_box(f'landmark_hq_zero_{i:02d}', coll, (-9.0 + lx * c, ly, 9.0 - lx * s), (1.4, 0.7, 1.2),
                     yaw=math.radians(38))
    trigger('loop_zero', coll, (-9.0, 0, 9.0), (1.0, 2.5, 1.2), yaw=math.radians(38))
    collect('shuriken', 'hq_zero', coll, (-9.0, 4.2, 9.0))

    # Plaza props: café chairs, planters, a stack of "Final_v7" boxes.
    hq_frame = frame
    for i in range(6):
        a = i / 6 * math.tau
        prop(coll, 'chair', i, hq_frame, 12.0 + 1.6 * math.cos(a), -8.0 + 1.6 * math.sin(a), material('ivory', GREY), suffix='hq_')
    for i, (x, z) in enumerate(((-16, -2), (16, -2), (-5, 17), (5, 17))):
        prop(coll, 'planter', i, hq_frame, x, z, material('ivory', '#3F6B3A'), suffix='hq_')
    for i in range(6):
        row = 0 if i < 3 else (1 if i < 5 else 2)
        col = i if i < 3 else (i - 3 if i < 5 else 0)
        prop(coll, 'finalbox', i, hq_frame, 15.0 + col * 1.05 + row * 0.5, 6.0, material('ivory', '#F4F2EC'),
             y=0.4 + row * 0.82, suffix='hq_')

    spawn('hq', coll, (0, 0.6, 19.0), 0.0)
    sfx('hq', coll, (0, 2, 0), L.HQ_PLAZA)


def build_gate(coll, info):
    """
    The RFP Gate (doc 02 §3.0), laid out in a frame whose local -Z points at
    HQ (north): the car spawns facing the intro letters, drives through them
    and out under the paper arch onto the Decade Drive.

      lz +7   spawn (boot spawn: content rfpGate.spawn), "How to drive" board
      lz -1   P U R S U I T
      lz -4.5 A R E N A            golden "10" off to the east
      lz -12  the RFP arch over the exit
    """
    frame = Frame.facing_centre(info['x'], info['z'])
    white = material('ivory', WHITE)
    paper = material('ivory', '#FBF8F0')
    green = material('ivory', BRAND)
    gold = material('ivory', '#E3B505')
    plaza(coll, 'rfp_gate', frame, L.PILLAR_RADIUS, BRAND)

    ax, az = frame.to_world(0, -12.0)
    visual('landmark_rfp_gate_arch', coll, paper, lambda mb: (
        mb.box((-5.2, 3.5, 0), (0.6, 7.0, 3.0)),
        mb.box((5.2, 3.5, 0), (0.6, 7.0, 3.0)),
        mb.ring((0, 7.0, 0), 5.2, 0.6, segments=12, thickness=3.0, skip=set(range(6, 12))),
    ), location=(ax, 0, az), yaw=frame.yaw())
    for k, dx in enumerate((-5.2, 5.2)):
        x, z = frame.to_world(dx, -12.0)
        collider_box(f'landmark_rfp_gate_leg_{k}', coll, (x, 3.5, z), (0.6, 7.0, 3.0), yaw=frame.yaw())
    px, pz = frame.to_world(-11.0, 4.0)
    solid_box('landmark_rfp_gate_podium', coll, white, (px, 0, pz), (4.0, 1.0, 3.0), yaw=frame.yaw())

    # Stations: the "how to drive" board beside the spawn, the Deadline Dash
    # start pad by the podium.
    hx, hz = frame.to_world(7.0, 7.0)
    visual('decal_gate_how_to_drive', coll, material('ivory', '#DADFE3'), lambda mb: mb.plate((0, 0.06, 0), 6.0, 4.0),
           location=(hx, 0, hz), yaw=frame.yaw())
    area('gate_how_to_drive', coll, (hx, 0, hz), (3.0, 1.5, 2.0), yaw=frame.yaw())
    dx, dz = frame.to_world(-11.0, 0.0)
    visual('decal_gate_deadline_dash', coll, green, lambda mb: mb.plate((0, 0.06, 0), 5.0, 3.0), location=(dx, 0, dz), yaw=frame.yaw())
    area('gate_deadline_dash', coll, (dx, 0, dz), (2.5, 1.5, 1.5), yaw=frame.yaw())

    # Intro letters, our own blocky type, facing south towards the camera.
    # Sleeping dynamic bodies, so the first thing you do is knock them over.
    for row, (word, lz) in enumerate((('PURSUIT', -1.0), ('ARENA', -4.5))):
        pitch = 2.3
        width = len(word) * pitch
        for i, char in enumerate(word):
            x, z = frame.to_world(-width / 2 + i * pitch + pitch / 2, lz)
            letter(coll, char, f'{row}{i}', (x, 0, z), frame.yaw(), 0.5, 0.8, white, 1.5)
    for i, char in enumerate('10'):
        x, z = frame.to_world(8.0 + i * 2.6, -4.5)
        letter(coll, char, f'g{i}', (x, 0, z), frame.yaw(), 0.6, 1.0, gold, 4.0)

    sx, sz = frame.to_world(0, 7.0)
    spawn('rfp_gate', coll, (sx, 0.6, sz), frame.yaw())
    for i in range(4):
        prop(coll, 'cone', i, frame, -3.0 + i * 2.0, -15.0, material('ivory', '#ED8B00'), suffix='gate_')
    sfx('rfp_gate', coll, (frame.x, 2, frame.z), L.PILLAR_RADIUS + 6)
    trees_around(coll, 'rfp_gate', frame, L.PILLAR_RADIUS, 12)


def build_decade_drive(coll, seed):
    white = material('ivory', WHITE)
    gold = material('ivory', '#E3B505')
    green = material('ivory', BRAND)
    for i, (z, milestone) in enumerate(zip(L.DECADE_ARCHES_Z, seed['timeline'])):
        for side in (-1, 1):
            solid_box(f'landmark_decade_arch_{i}_{"lr"[side > 0]}', coll, white, (side * 5.4, 0, z), (0.8, 5.2, 0.8))
        visual(f'landmark_decade_arch_{i}_top', coll, green if i == 9 else gold,
               lambda mb: mb.box((0, 5.5, 0), (11.6, 0.7, 0.9)), location=(0, 0, z))
        # The milestone board on the floor under the arch, read from above.
        visual(f'decal_{milestone["id"]}', coll, material('ivory', '#FBF8F0'),
               lambda mb: mb.plate((0, 0.06, 0), 4.6, 3.0), location=(0, 0, z))
        area(milestone['id'], coll, (0, 0, z), (2.4, 1.5, 1.6))
        collect('golden', i + 1, coll, (0, 0, z - 2.4))
    # Year 10: traffic cones laid out as a "10".
    origin_z = L.DECADE_ARCHES_Z[-1] - 0.0
    spots = [(-4.6, dz) for dz in (-2.0, -0.8, 0.4, 1.6)] + [(-3.2, -2.0), (-3.2, 1.6)]
    spots += [(x, z) for x, z in ((7.0, -2.0), (8.4, -2.0), (7.0, 1.6), (8.4, 1.6), (6.4, -0.8), (6.4, 0.4), (9.0, -0.8), (9.0, 0.4))]
    frame = Frame(0.0, origin_z, 0.0)
    for i, (x, z) in enumerate(spots):
        prop(coll, 'cone', i, frame, x, z, material('ivory', '#ED8B00'), suffix='decade_')
    spawn('decade_drive', coll, (8.0, 0.6, 60.0), 0.0)
    sfx('decade_drive', coll, (0, 2, 55.0), 30.0)


def main():
    opts = args()
    ident = opts['id']
    out = opts.get('out') or os.path.join(ROOT, 'blender', 'districts', f'{ident}.blend')
    seed = load_seed()
    info = L.districts(seed)[ident]
    coll = fresh_scene('District')
    if ident == 'hq':
        build_hq(coll, info)
    elif ident == 'rfp_gate':
        build_gate(coll, info)
    elif ident == 'decade_drive':
        build_decade_drive(coll, seed)
    else:
        build_district(coll, ident, info, seed)
    save(out)
    print(f'[gen_district] {ident}: wrote {out}')


main()
