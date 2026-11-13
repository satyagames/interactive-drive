"""
Percy and the blob family (docs/content-backup/08-brand-and-mascots.md,
docs/content-backup/10-3d-integration-plan.md §2.1): the 2D PursuitArena
community's own mascots, rebuilt as original low-poly 3D characters --
soft gumdrop blobs with a doodle face, two nub arms and the prop that tells
you the section. Generated in one reproducible pass:

    blender -b --factory-startup -P blender/scripts/gen_mascots.py
      -> blender/characters/mascots.blend
         public/models/mascots.glb

(`npm run art:mascots`.)

Authored in game space (metres, +Y up), each character standing on y = 0
with its face towards game +Z (Blender -Y), so the runtime turns one to face
the car with `rotation.y = atan2(dx, dz)`. Object contract with
`src/showcase/mascots.js`:

    blob_<id>                 empty: the character root, origin on the floor
      blob_<id>_body          the blob (squash-and-stretch scales this)
        blob_<id>_face        eyes + smile, one dark mesh
        blob_<id>_arm_L / _R  nub arms, origin at the shoulder (they wave
                              about game Z); a prop hangs off one of them
          blob_<id>_prop      what it holds (trophy, pencil, notebook...)
        blob_<id>_hat         optional: party hat / scarf

Budget: <= 1500 triangles per character (doc 10 §2.1), checked below.
Colours are the 2D banners' family palette (doc 08), not brand-new art.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import ROOT, MeshBuilder, empty, fresh_scene, g2b, material, save  # noqa: E402
import polish_lib as pl  # noqa: E402

BLEND = os.path.join(ROOT, 'blender', 'characters', 'mascots.blend')
GLB = os.path.join(ROOT, 'public', 'models', 'mascots.glb')
BUDGET = 1500

# id -> body colour, accent colour, prop, which arm holds it, scale, extra.
# Percy is the white one (doc 08); the buddies take the 2D section colours.
CHARACTERS = {
    'percy':      dict(body='#FFFFFF', accent='#86BC25', prop=None, hand='L', scale=1.25, extra='scarf'),
    'rnr':        dict(body='#8E5BB5', accent='#F28C28', prop='trophy', hand='L', scale=1.0, extra=None),
    'lnd':        dict(body='#4FB06D', accent='#F27BA5', prop='pencil', hand='L', scale=1.0, extra=None),
    'toolkit':    dict(body='#E8D8BC', accent='#2E7D9A', prop='notebook', hand='L', scale=1.0, extra=None),
    'innovation': dict(body='#2BB3A8', accent='#3A3D42', prop='laptop', hand='L', scale=1.0, extra=None),
    'culture':    dict(body='#E86A5C', accent='#F6C945', prop=None, hand='L', scale=1.0, extra='party_hat'),
}

HEIGHT = 1.5      # blob height before scale
RADIUS = 0.72     # widest radius (near the base)
DARK = None

EXPORT_KWARGS = dict(
    export_format='GLB',
    export_yup=True,
    export_apply=True,
    export_extras=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
    export_texcoords=False,
    export_normals=True,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14,
    use_selection=True,
)


def profile(t):
    """Blob radius at height fraction t (0 floor .. 1 top): a soft gumdrop."""
    t = min(max(t, 0.0), 1.0)
    # Widest a third of the way up, a soft flat base below, a dome above.
    if t <= 0.35:
        return RADIUS * (0.82 + 0.18 * math.sin(t / 0.35 * math.pi / 2))
    u = (t - 0.35) / 0.65
    return RADIUS * math.sqrt(max(1.0 - u * u, 0.0))


def surface_z(height):
    """How far the body surface sits in front of the axis at `height` (face placement)."""
    return profile(height / HEIGHT)


def blob_body(coll, name, mat, parent):
    """Lathe the gumdrop profile: 18 sides x 10 rings, smooth shaded."""
    bm = bmesh.new()
    sides, rings = 18, 10
    rows = []
    for r in range(rings + 1):
        t = r / rings
        y = HEIGHT * t
        rad = profile(t) if r < rings else 0.0
        row = []
        for s in range(sides):
            a = s / sides * math.tau
            if r == rings:
                row.append(bm.verts.new(g2b(0.0, y, 0.0)))
                break
            row.append(bm.verts.new(g2b(rad * math.sin(a), y, rad * math.cos(a))))
        rows.append(row)
    base = bm.verts.new(g2b(0.0, 0.0, 0.0))
    for s in range(sides):
        n = (s + 1) % sides
        bm.faces.new((base, rows[0][n], rows[0][s]))
    for r in range(rings - 1):
        for s in range(sides):
            n = (s + 1) % sides
            bm.faces.new((rows[r][s], rows[r][n], rows[r + 1][n], rows[r + 1][s]))
    top = rows[rings][0]
    for s in range(sides):
        n = (s + 1) % sides
        bm.faces.new((rows[rings - 1][s], rows[rings - 1][n], top))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    obj.parent = parent
    return obj


def doodle_face(coll, name, parent):
    """Two oval eyes, a smile and two cheek dots -- the 2D doodle face, in one dark mesh."""
    mb = MeshBuilder()
    eye_y = HEIGHT * 0.62
    z = surface_z(eye_y) - 0.02
    for side in (-1, 1):
        mb.sphere((side * 0.2, eye_y, z), 0.075, segments=8, rings=5)
    # The smile: the lower half of a thin vertical ring, facing +Z.
    smile_y = HEIGHT * 0.47
    smile_z = surface_z(smile_y) + 0.005
    mb.ring((0.0, smile_y + 0.06, smile_z), 0.16, 0.035, segments=12, thickness=0.04,
            skip=tuple(range(0, 6)))
    obj = mb.to_object(name, coll, DARK)
    # Eyes are ovals: a little taller than wide.
    obj.parent = parent
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def arm(coll, name, side, mat, parent):
    """A nub arm whose origin is the shoulder, so a rotation about game Z waves it."""
    shoulder = (side * (profile(0.42) - 0.05), HEIGHT * 0.42, 0.0)
    mb = MeshBuilder()
    mb.sphere((side * 0.2, -0.08, 0.0), 0.16, segments=8, rings=5)
    obj = mb.to_object(name, coll, mat, location=shoulder)
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = g2b(*shoulder)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def prop_mesh(coll, name, kind, accent, parent, side):
    """The section prop, held just in front of the hand (arm-local space)."""
    hand = (side * 0.28, -0.12, 0.18)
    mb = MeshBuilder()
    mats = []
    if kind == 'trophy':
        gold = material('gold')
        mb.cylinder((0, 0.0, 0), 0.12, 0.05, segments=10)
        mb.cylinder((0, 0.1, 0), 0.03, 0.16, segments=8)
        mb.cylinder((0, 0.26, 0), 0.06, 0.18, segments=10, top_radius=0.14)
        for s in (-1, 1):
            mb.ring((s * 0.14, 0.27, 0), 0.05, 0.02, segments=8, thickness=0.02, yaw=0.0)
        mats.append(gold)
    elif kind == 'pencil':
        mb.cylinder((0, 0.2, 0), 0.045, 0.5, segments=6)
        mb.cylinder((0, 0.5, 0), 0.045, 0.1, segments=6, top_radius=0.005)
        mats.append(material('ivory', accent))
    elif kind == 'notebook':
        mb.box((0, 0.18, 0), (0.34, 0.44, 0.06))
        mb.box((0.0, 0.18, 0.035), (0.04, 0.44, 0.02))
        mats.append(material('ivory', accent))
    elif kind == 'laptop':
        mb.box((0, 0.0, 0.12), (0.46, 0.03, 0.32))
        mb.box((0, 0.16, -0.03), (0.46, 0.32, 0.03), pitch=-0.25)
        mats.append(material('dark'))
    obj = mb.to_object(name, coll, mats[0] if mats else None, location=hand)
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = g2b(*hand)
    return obj


def extra_mesh(coll, name, kind, accent, parent):
    mb = MeshBuilder()
    if kind == 'scarf':
        # A Deloitte-green scarf ring round the "neck", with a tail.
        y = HEIGHT * 0.36
        mb.ring((0, y, 0), profile(0.36) + 0.02, 0.09, segments=16, thickness=0.1, vertical=False)
        mb.box((0.28, y - 0.18, surface_z(y) - 0.02), (0.14, 0.32, 0.05))
        mat = material('ivory', accent)
    else:
        # A striped party hat, tipped a little.
        mb.cylinder((0, HEIGHT + 0.2, 0), 0.24, 0.48, segments=10, top_radius=0.01)
        mb.sphere((0, HEIGHT + 0.47, 0), 0.07, segments=6, rings=4)
        mat = material('ivory', accent)
    obj = mb.to_object(name, coll, mat)
    obj.parent = parent
    for poly in obj.data.polygons:
        poly.use_smooth = kind == 'scarf'
    return obj


def build(coll):
    roots = []
    for index, (ident, spec) in enumerate(CHARACTERS.items()):
        # Laid out in a row for the .blend's viewport; the runtime re-places them.
        root = empty(f'blob_{ident}', coll, 'PLAIN_AXES', (index * 2.4 - 6.0, 0.0, 0.0))
        root.scale = (spec['scale'],) * 3
        body = blob_body(coll, f'blob_{ident}_body', material('ivory', spec['body']), root)
        doodle_face(coll, f'blob_{ident}_face', body)
        arms = {}
        for side, label in ((-1, 'L'), (1, 'R')):
            # "L" is the character's left: game -X when it faces +Z... mirrored on
            # screen, so the prop reads on the viewer's right.
            arms[label] = arm(coll, f'blob_{ident}_arm_{label}', side, material('ivory', spec['body']), body)
        if spec['prop']:
            hand_side = -1 if spec['hand'] == 'L' else 1
            prop_mesh(coll, f'blob_{ident}_prop', spec['prop'], spec['accent'], arms[spec['hand']], hand_side)
        if spec['extra']:
            extra_mesh(coll, f'blob_{ident}_hat', spec['extra'], spec['accent'], body)
        roots.append(root)
    return roots


def triangles(root):
    total = 0
    for obj in [root, *root.children_recursive]:
        if obj.type == 'MESH':
            obj.data.calc_loop_triangles()
            total += len(obj.data.loop_triangles)
    return total


def main():
    global DARK
    coll = fresh_scene('Mascots')
    DARK = material('dark')
    roots = build(coll)
    for obj in coll.objects:
        if obj.type == 'MESH' and not any(p.use_smooth for p in obj.data.polygons):
            pl.shade_by_angle(obj)
    save(BLEND)

    over = []
    for root in roots:
        tris = triangles(root)
        print(f'[mascots] {root.name}: {tris} triangles (budget {BUDGET})')
        if tris > BUDGET:
            over.append(f'{root.name}: {tris}')
    objs = list(coll.objects)
    pl.select_only(objs)
    os.makedirs(os.path.dirname(GLB), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=GLB, **EXPORT_KWARGS)
    print(f'[mascots] {len(roots)} characters -> {GLB} ({os.path.getsize(GLB)} bytes)')
    if over:
        raise SystemExit(f'mascots over budget: {", ".join(over)}')


main()
