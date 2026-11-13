"""
Validates one arena .blend against the naming contract and budgets
(docs/pursuit-arena/04 §2-3) and writes blender/reports/<file>.json.

    blender -b blender/districts/audit.blend -P blender/scripts/validate.py -- --reports blender/reports

Errors (the build fails on any):
  - unknown or malformed prefixed names; unapplied scale on meshes
  - dyn_ roots without mass/friction/restitution/sfx/type, or without exactly
    one visual child and at least one collision_ child
  - area_/trigger_ that aren't cube empties with positive half extents
  - collect_ kinds other than dot / golden / shuriken; inst_ without a type
  - triangle budgets: district total 25k, landmark 6k, pod 1.2k, prop 300
    (letters 400), kit tree 250
  - a dynamic prop whose collider starts inside a static collider (it would
    be shot out on the first physics step)

Cross-file checks (every content id has exactly one area) live in
tools/blender.mjs, which reads all the reports.
"""

import json
import os
import re
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _common import BUDGETS, SFX_CLASSES, args  # noqa: E402

PREFIXES = ('collision_', 'dyn_', 'inst_', 'area_', 'trigger_', 'collect_', 'spawn_', 'sfx_', 'decal_', 'anim_')
# Optional behaviour properties on dyn_ roots (src/world/dynamicProps.js).
DYN_NUMBERS = ('hang', 'springK', 'springDamp', 'buoyancy', 'tether')
COLLECT_KINDS = ('dot', 'golden', 'shuriken')
# Plain visual names the generators use; anything else unprefixed is a warning.
VISUAL_NAMES = re.compile(r'^(ground|roads|road_kerbs|boundary_berm|ramp_\d+|plaza_.+|landmark_.+|pod_.+|kit_.+|dyn_.+_vis)$')
OVERLAP_TOLERANCE = 0.03   # metres; touching faces are fine


def triangles(obj):
    if obj.type != 'MESH':
        return 0
    mesh = obj.data
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def world_aabb(obj):
    pts = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def overlaps(a, b):
    (alo, ahi), (blo, bhi) = a, b
    return all(alo[i] + OVERLAP_TOLERANCE < bhi[i] and blo[i] + OVERLAP_TOLERANCE < ahi[i] for i in range(3))


def is_dynamic(obj):
    node = obj
    while node is not None:
        if node.name.startswith('dyn_'):
            return node
        node = node.parent
    return None


def main():
    opts = args()
    reports_dir = opts.get('reports') or os.path.join(os.path.dirname(bpy.data.filepath), '..', 'reports')
    file_label = os.path.splitext(os.path.basename(bpy.data.filepath))[0]
    is_kit = file_label == 'arena_kit'
    is_base = file_label == 'base'

    errors, warnings = [], []
    counts = dict(objects=0, colliders=0, dynamic=0, instances=0, collectibles=0)
    areas = []
    total_tris = 0
    landmark_tris = 0
    lod1_tris = 0
    pod_tris = {}

    objects = list(bpy.data.objects)
    for obj in objects:
        counts['objects'] += 1
        name = obj.name
        tris = triangles(obj)
        # LOD1 twins (polish.py) never draw alongside their LOD0: counted apart.
        if name.endswith('_LOD1'):
            lod1_tris += tris
            continue
        if not name.startswith('collision_'):
            total_tris += tris

        if obj.type == 'MESH' and any(abs(s - 1.0) > 1e-4 for s in obj.scale):
            errors.append(f'{name}: unapplied scale {tuple(round(s, 3) for s in obj.scale)}')

        if name.startswith('collision_'):
            counts['colliders'] += 1
            if obj.type != 'MESH':
                errors.append(f'{name}: collision proxies must be meshes')
        elif name.startswith('dyn_') and obj.type == 'EMPTY':
            counts['dynamic'] += 1
            for key in ('type', 'mass', 'friction', 'restitution', 'sfx'):
                if key not in obj.keys():
                    errors.append(f'{name}: missing custom property "{key}"')
            if obj.get('mass', 0) <= 0:
                errors.append(f'{name}: mass must be > 0')
            for key in DYN_NUMBERS:
                if key in obj.keys() and not (isinstance(obj[key], (int, float)) and obj[key] > 0):
                    errors.append(f'{name}: "{key}" must be a positive number')
            if ('hang' in obj.keys()) != ('springK' in obj.keys()):
                errors.append(f'{name}: hanging props need both "hang" and "springK"')
            if obj.get('sfx') not in SFX_CLASSES:
                errors.append(f'{name}: sfx "{obj.get("sfx")}" not one of {SFX_CLASSES}')
            visuals = [c for c in obj.children if c.type == 'MESH' and not c.name.startswith('collision_')]
            colliders = [c for c in obj.children if c.name.startswith('collision_')]
            if len(visuals) != 1:
                errors.append(f'{name}: needs exactly one visual mesh child, has {len(visuals)}')
            if not colliders:
                errors.append(f'{name}: needs at least one collision_ child')
            budget = BUDGETS['letter'] if str(obj.get('type', '')).startswith('letter') else BUDGETS['prop']
            for v in visuals:
                if triangles(v) > budget:
                    errors.append(f'{name}: {triangles(v)} tris > prop budget {budget}')
        elif name.startswith('inst_'):
            counts['instances'] += 1
            if 'type' not in obj.keys():
                errors.append(f'{name}: inst_ empties need a "type" custom property')
        elif name.startswith('area_') or name.startswith('trigger_'):
            if obj.type != 'EMPTY' or obj.empty_display_type != 'CUBE':
                errors.append(f'{name}: must be a cube empty')
            if min(obj.scale) <= 0:
                errors.append(f'{name}: half extents (scale) must be positive')
            if name.startswith('area_'):
                areas.append(name[len('area_'):])
        elif name.startswith('collect_'):
            counts['collectibles'] += 1
            kind = name.split('_')[1] if '_' in name else ''
            if kind not in COLLECT_KINDS:
                errors.append(f'{name}: collectible kind "{kind}" not one of {COLLECT_KINDS}')
        elif name.startswith(('spawn_', 'sfx_')):
            if obj.type != 'EMPTY':
                errors.append(f'{name}: must be an empty')
        elif name.startswith('anim_'):
            # Kinematic visuals the runtime animates (kept out of the static merge).
            if obj.type != 'MESH':
                errors.append(f'{name}: anim_ objects must be meshes')
            if not isinstance(obj.get('spin'), (int, float)):
                errors.append(f'{name}: anim_ needs a numeric "spin" (rad/s)')
            if obj.get('axis') not in ('x', 'y', 'z'):
                errors.append(f'{name}: anim_ "axis" must be x, y or z')
        elif name.startswith('decal_'):
            pass
        elif not VISUAL_NAMES.match(name):
            warnings.append(f'{name}: unprefixed object with an unexpected name')

        if name.startswith('landmark_'):
            landmark_tris += tris
        if name.startswith('pod_'):
            key = name[len('pod_'):].removesuffix('_roof').removesuffix('_rail')
            pod_tris[key] = pod_tris.get(key, 0) + tris
        if is_kit and name.startswith('kit_tree') and obj.parent is None:
            tree_total = tris + sum(triangles(c) for c in obj.children if not c.name.startswith('collision_'))
            if tree_total > BUDGETS['tree']:
                errors.append(f'{name}: {tree_total} tris > tree budget {BUDGETS["tree"]}')

    budget = None if (is_kit or is_base) else BUDGETS['district']
    if budget and total_tris > budget:
        errors.append(f'{total_tris} tris > district budget {budget}')
    if not is_kit and landmark_tris > BUDGETS['landmark']:
        errors.append(f'landmarks total {landmark_tris} tris > {BUDGETS["landmark"]}')
    for key, tris in pod_tris.items():
        if tris > BUDGETS['pod']:
            errors.append(f'pod_{key}: {tris} tris > pod budget {BUDGETS["pod"]}')

    # Dynamic props must not start inside static geometry.
    statics = [(o.name, world_aabb(o)) for o in objects
               if o.name.startswith('collision_') and is_dynamic(o) is None and o.name != 'collision_ground']
    for obj in objects:
        if not obj.name.startswith('collision_'):
            continue
        root = is_dynamic(obj)
        if root is None:
            continue
        box = world_aabb(obj)
        for static_name, static_box in statics:
            if overlaps(box, static_box):
                errors.append(f'{root.name}: starts inside {static_name}')
                break

    report = dict(
        file=file_label, triangles=total_tris, budget=budget, landmarkTriangles=landmark_tris, lod1Triangles=lod1_tris,
        areas=sorted(areas), errors=errors, warnings=warnings, **counts,
    )
    os.makedirs(reports_dir, exist_ok=True)
    with open(os.path.join(reports_dir, f'{file_label}.json'), 'w', encoding='utf-8') as handle:
        json.dump(report, handle, indent=2)
    status = 'OK' if not errors else f'{len(errors)} error(s)'
    print(f'[validate] {file_label}: {total_tris} tris, {counts["dynamic"]} dyn, {len(areas)} areas -- {status}')
    for line in errors[:12]:
        print(f'[validate]   {line}')


main()
