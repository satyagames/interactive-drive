"""
Shared helpers for the Pursuit Arena generators (Blender 5.x, headless).

Everything here is authored in **game space** -- metres, +Y up, -Z north,
+X east (docs/pursuit-arena/02 §2) -- and converted to Blender's Z-up space at
object-creation time, so the coordinates in the generators read exactly like
the design doc. The glTF exporter's +Y-up conversion turns them back on export
(docs/blender-conventions.md "Axis conversion").

    game (x, y, z)  ->  Blender (x, -z, y)
    game yaw (about +Y) == Blender rotation about +Z, same sign
    game pitch (about +X) == Blender rotation about +X, same sign

Naming contract (docs/pursuit-arena/04 §2):

    collision_*[_cyl|_sph]   static collider proxy (never rendered)
    dyn_<type>_<n>           dynamic body root; children: one visual mesh +
                             collision_ primitives; custom props mass,
                             friction, restitution, sfx, type
    inst_<type>_<n>          empty: place a kit instance of <type> here
    area_<contentId>         cube empty: Enter area, half extents from scale
    trigger_<id>             cube empty: passive trigger (stamps)
    collect_<kind>_<n>       empty: collectible spawn (dot / golden / shuriken)
    spawn_<id>               empty: respawn point, car faces the empty's -Z
    sfx_<id>                 sphere empty: ambient emitter, radius from scale
    decal_<id>               flat plate: floor typography / board (visual)

Materials are named `mc_<matcap>` or `mc_<matcap>__<RRGGBB>` (a tint the
runtime multiplies into the matcap); see `material()`.
"""

import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEED_PATH = os.path.join(ROOT, 'content', 'arena.seed.json')

# Budgets from docs/pursuit-arena/04 §3, checked by validate.py.
BUDGETS = {
    'district': 25000,
    'landmark': 6000,
    'pod': 1200,
    'prop': 300,
    'tree': 250,
    'letter': 400,
}


# ---- CLI + scene -----------------------------------------------------------

def args():
    """`blender -b -P script.py -- --id audit --out path` -> {'id': 'audit', 'out': 'path'}."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    key = None
    for token in argv:
        if token.startswith('--'):
            key = token[2:]
            out[key] = True
        elif key:
            out[key] = token
            key = None
    return out


def require_blender_5():
    major = bpy.app.version[0]
    if major < 5:
        raise SystemExit(f'Pursuit Arena generators target Blender 5.x; this is {bpy.app.version_string}')


def fresh_scene(collection_name):
    """Empty the startup file and make one collection that everything goes into."""
    require_blender_5()
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            block.remove(item)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    coll = bpy.data.collections.new(collection_name)
    scene.collection.children.link(coll)
    return coll


def save(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, check_existing=False, compress=True)


def load_seed():
    with open(SEED_PATH, encoding='utf-8') as handle:
        return json.load(handle)


# ---- space conversion --------------------------------------------------------

def g2b(x, y, z):
    return Vector((x, -z, y))


def polar(radius, angle_deg):
    """Doc 02 placement: theta clockwise from north. Returns game (x, z)."""
    t = math.radians(angle_deg)
    return radius * math.sin(t), -radius * math.cos(t)


class Frame:
    """
    A local layout frame: origin at a district centre, local -Z pointing at
    the arena centre (the district's front door). `to_world(lx, lz)` gives
    game (x, z); `yaw(local_yaw)` gives a world yaw for objects in the frame.
    """

    def __init__(self, x, z, yaw):
        self.x, self.z, self.yaw_rad = x, z, yaw

    @classmethod
    def facing_centre(cls, x, z):
        if abs(x) < 1e-6 and abs(z) < 1e-6:
            return cls(0.0, 0.0, 0.0)
        # Local forward (0, -1) must point from (x, z) towards the origin.
        return cls(x, z, math.atan2(x, z))

    def to_world(self, lx, lz):
        c, s = math.cos(self.yaw_rad), math.sin(self.yaw_rad)
        return self.x + lx * c + lz * s, self.z - lx * s + lz * c

    def yaw(self, local_yaw=0.0):
        return self.yaw_rad + local_yaw


# ---- materials ---------------------------------------------------------------

def material(matcap, tint=None):
    """`mc_<matcap>` or `mc_<matcap>__<RRGGBB>`; viewport colour for readability only."""
    name = f'mc_{matcap}' + (f'__{tint.lstrip("#").upper()}' if tint else '')
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    hexcode = (tint or '#B8B2A7').lstrip('#')
    r, g, b = (int(hexcode[i:i + 2], 16) / 255 for i in (0, 2, 4))
    mat.diffuse_color = (r, g, b, 1.0)
    return mat


# ---- mesh building -----------------------------------------------------------

class MeshBuilder:
    """
    Accumulates game-space primitives into one bmesh, so a whole compound
    shape (a landmark, a letter) becomes one object and one draw.
    Positions are relative to the object's origin, in game axes.
    """

    def __init__(self):
        self.bm = bmesh.new()

    def _matrix(self, centre, size, yaw=0.0, pitch=0.0):
        # Game (w, h, d) -> Blender (w, d, h); rotations as documented above.
        loc = g2b(*centre)
        rot = Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(pitch, 4, 'X')
        scale = Matrix.Diagonal((size[0], size[2], size[1], 1.0))
        return Matrix.Translation(loc) @ rot @ scale

    def box(self, centre, size, yaw=0.0, pitch=0.0):
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=self._matrix(centre, size, yaw, pitch))
        return self

    def cylinder(self, centre, radius, height, segments=12, top_radius=None, yaw=0.0, pitch=0.0):
        m = self._matrix(centre, (1, 1, 1), yaw, pitch)
        bmesh.ops.create_cone(
            self.bm, cap_ends=True, cap_tris=False, segments=segments,
            radius1=radius, radius2=radius if top_radius is None else top_radius,
            depth=height, matrix=m,
        )
        return self

    def sphere(self, centre, radius, segments=10, rings=6):
        bmesh.ops.create_uvsphere(
            self.bm, u_segments=segments, v_segments=rings, radius=radius,
            matrix=self._matrix(centre, (1, 1, 1)),
        )
        return self

    def wedge(self, centre, length, width, height, yaw=0.0):
        """A ramp: rises from 0 at local +Z (back) to `height` at local -Z (front)."""
        hw, hl = width / 2, length / 2
        pts = [(-hw, 0, hl), (hw, 0, hl), (hw, 0, -hl), (-hw, 0, -hl), (-hw, height, -hl), (hw, height, -hl)]
        m = Matrix.Translation(g2b(*centre)) @ Matrix.Rotation(yaw, 4, 'Z')
        verts = [self.bm.verts.new(m @ g2b(*p)) for p in pts]
        for face in ((0, 1, 2, 3), (3, 2, 5, 4), (0, 3, 4), (1, 5, 2), (0, 4, 5, 1)):
            self.bm.faces.new([verts[i] for i in face])
        return self

    def ring(self, centre, radius, tube, segments=16, thickness=None, vertical=True, yaw=0.0, skip=()):
        """
        A ring of box segments (the "0", portals, arches, stadium walls).
        Vertical rings stand in the local XY plane; segment i sits at angle
        (i + 0.5) / segments * 360° from local +X (vertical: towards +Y;
        horizontal: towards +Z). `skip` leaves segments out (openings).
        """
        depth = thickness or tube
        for i in range(segments):
            if i in skip:
                continue
            a = (i + 0.5) / segments * math.tau
            seg_len = 2 * radius * math.sin(math.pi / segments) + tube * 0.3
            if vertical:
                lx, ly = radius * math.cos(a), radius * math.sin(a)
                c, s = math.cos(yaw), math.sin(yaw)
                pos = (centre[0] + lx * c, centre[1] + ly, centre[2] - lx * s)
                # Tangent (-sin a, cos a) in the game XY plane is Blender
                # (-sin a, 0, cos a): a rotation of -(a + 90°) about Blender Y.
                m = (Matrix.Translation(g2b(*pos)) @ Matrix.Rotation(yaw, 4, 'Z')
                     @ Matrix.Rotation(-(a + math.pi / 2), 4, 'Y')
                     @ Matrix.Diagonal((seg_len, depth, tube, 1.0)))
            else:
                lx, lz = radius * math.cos(a), radius * math.sin(a)
                pos = (centre[0] + lx, centre[1], centre[2] + lz)
                # Tangent (-sin a, cos a) on the game floor is Blender
                # (-sin a, -cos a, 0): a rotation of -(a + 90°) about Blender Z.
                m = (Matrix.Translation(g2b(*pos)) @ Matrix.Rotation(-(a + math.pi / 2), 4, 'Z')
                     @ Matrix.Diagonal((seg_len, tube, depth, 1.0)))
            bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        return self

    def annulus(self, centre, inner, outer, y=0.0, segments=96):
        """A flat ring on the floor (ring roads), top face only."""
        verts_in, verts_out = [], []
        for i in range(segments):
            a = i / segments * math.tau
            verts_in.append(self.bm.verts.new(g2b(centre[0] + inner * math.cos(a), y, centre[2] + inner * math.sin(a))))
            verts_out.append(self.bm.verts.new(g2b(centre[0] + outer * math.cos(a), y, centre[2] + outer * math.sin(a))))
        for i in range(segments):
            j = (i + 1) % segments
            self.bm.faces.new((verts_out[i], verts_out[j], verts_in[j], verts_in[i]))
        return self

    def plate(self, centre, width, depth, yaw=0.0):
        """A flat rectangle on the floor (spokes, boards), top face only."""
        hw, hd = width / 2, depth / 2
        m = Matrix.Translation(g2b(*centre)) @ Matrix.Rotation(yaw, 4, 'Z')
        verts = [self.bm.verts.new(m @ g2b(x, 0, z)) for x, z in ((-hw, hd), (hw, hd), (hw, -hd), (-hw, -hd))]
        self.bm.faces.new(verts)
        return self

    def to_object(self, name, coll, mat=None, location=(0, 0, 0), yaw=0.0, parent=None):
        mesh = bpy.data.meshes.new(name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for poly in mesh.polygons:
            poly.use_smooth = False
        if mat is not None:
            mesh.materials.append(mat)
        obj = bpy.data.objects.new(name, mesh)
        obj.location = g2b(*location)
        obj.rotation_euler = (0.0, 0.0, yaw)
        coll.objects.link(obj)
        if parent is not None:
            obj.parent = parent
        return obj


def visual(name, coll, mat, build, location=(0, 0, 0), yaw=0.0, parent=None):
    """`build(MeshBuilder)` then make an object."""
    mb = MeshBuilder()
    build(mb)
    return mb.to_object(name, coll, mat, location, yaw, parent)


def collider_box(name, coll, centre, size, yaw=0.0, pitch=0.0, parent=None):
    """A `collision_` box. Centre/size in game space; parented colliders are local to the parent."""
    obj = MeshBuilder().box((0, 0, 0), size).to_object(f'collision_{name}', coll, parent=parent)
    obj.location = g2b(*centre)
    obj.rotation_euler = (pitch, 0.0, yaw)
    obj.display_type = 'WIRE'
    return obj


def collider_cylinder(name, coll, centre, radius, height, parent=None):
    obj = MeshBuilder().cylinder((0, 0, 0), radius, height, segments=12).to_object(
        f'collision_{name}_cyl', coll, parent=parent)
    obj.location = g2b(*centre)
    obj.display_type = 'WIRE'
    return obj


def collider_sphere(name, coll, centre, radius, parent=None):
    obj = MeshBuilder().sphere((0, 0, 0), radius, segments=10, rings=6).to_object(
        f'collision_{name}_sph', coll, parent=parent)
    obj.location = g2b(*centre)
    obj.display_type = 'WIRE'
    return obj


def solid_box(name, coll, mat, centre, size, yaw=0.0):
    """Static box: visual + matching collider, both at the same transform."""
    visual(name, coll, mat, lambda mb: mb.box((0, size[1] / 2, 0), size), location=(centre[0], centre[1], centre[2]), yaw=yaw)
    collider_box(name, coll, (centre[0], centre[1] + size[1] / 2, centre[2]), size, yaw=yaw)


def solid_cylinder(name, coll, mat, centre, radius, height, segments=16):
    visual(name, coll, mat, lambda mb: mb.cylinder((0, height / 2, 0), radius, height, segments), location=centre)
    collider_cylinder(name, coll, (centre[0], centre[1] + height / 2, centre[2]), radius, height)


# ---- empties -----------------------------------------------------------------

def empty(name, coll, kind, location, yaw=0.0, scale=(1, 1, 1), props=None, parent=None):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = kind
    obj.empty_display_size = 1.0
    obj.location = g2b(*location)
    obj.rotation_euler = (0.0, 0.0, yaw)
    obj.scale = scale
    for key, value in (props or {}).items():
        obj[key] = value
    coll.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def box_volume(prefix, ident, coll, centre, half_extents, yaw=0.0):
    """area_/trigger_ empties: Blender scale = (hx, hz, hy) -- the documented Y/Z swap."""
    hx, hy, hz = half_extents
    return empty(f'{prefix}{ident}', coll, 'CUBE', (centre[0], centre[1] + hy, centre[2]), yaw, scale=(hx, hz, hy))


def area(content_id, coll, centre, half_extents=(2.4, 1.5, 2.4), yaw=0.0):
    return box_volume('area_', content_id, coll, centre, half_extents, yaw)


def trigger(ident, coll, centre, half_extents, yaw=0.0):
    return box_volume('trigger_', ident, coll, centre, half_extents, yaw)


def spawn(ident, coll, location, yaw):
    return empty(f'spawn_{ident}', coll, 'SINGLE_ARROW', location, yaw)


def sfx(ident, coll, location, radius):
    return empty(f'sfx_{ident}', coll, 'SPHERE', location, scale=(radius, radius, radius))


def collect(kind, index, coll, location):
    """Floats 0.9 m up unless an explicit height is given (e.g. on a ramp lip)."""
    y = location[1] if location[1] > 0 else 0.9
    return empty(f'collect_{kind}_{index}', coll, 'PLAIN_AXES', (location[0], y, location[2]))


def inst(kind, index, coll, location, yaw=0.0, scale=1.0):
    return empty(f'inst_{kind}_{index}', coll, 'PLAIN_AXES', location, yaw, (scale, scale, scale), props={'type': kind})


# ---- dynamic props -------------------------------------------------------------

SFX_CLASSES = ('paper', 'wood', 'metal', 'plastic', 'brick', 'rubber')

# One shared mesh per prop type per file, so the exporter writes it once.
_prop_meshes = {}


def dyn(kind, index, coll, location, yaw, mat, build_visual, colliders, mass, sfx_class,
        friction=0.5, restitution=0.2, suffix=''):
    """
    A dynamic prop: Empty root at the centre of mass (custom props), one
    visual child, `colliders` = [('box', centre, size) | ('cyl', centre, r, h)
    | ('sph', centre, r)] in the root's local game space. Colliders are kept
    about 10% inside the visual (doc 04 §3) by the caller.
    """
    assert sfx_class in SFX_CLASSES, sfx_class
    name = f'dyn_{kind}_{suffix}{index}'
    root = empty(name, coll, 'PLAIN_AXES', location, yaw, props={
        'type': kind, 'mass': float(mass), 'friction': float(friction),
        'restitution': float(restitution), 'sfx': sfx_class,
    })
    key = (kind, mat.name)
    if key not in _prop_meshes:
        mb = MeshBuilder()
        build_visual(mb)
        _prop_meshes[key] = mb.to_object(f'{kind}_mesh', coll, mat).data
        bpy.data.objects.remove(bpy.data.objects[f'{kind}_mesh'], do_unlink=True)
    vis = bpy.data.objects.new(f'{name}_vis', _prop_meshes[key])
    coll.objects.link(vis)
    vis.parent = root
    for i, spec in enumerate(colliders):
        shape = spec[0]
        if shape == 'box':
            collider_box(f'{name}_{i}', coll, spec[1], spec[2], parent=root)
        elif shape == 'cyl':
            collider_cylinder(f'{name}_{i}', coll, spec[1], spec[2], spec[3], parent=root)
        elif shape == 'sph':
            collider_sphere(f'{name}_{i}', coll, spec[1], spec[2], parent=root)
    return root


def rng(seed_text):
    return random.Random(seed_text)
