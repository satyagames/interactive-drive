"""
The art pass shared by the cart (`gen_cart.py`) and the arena (`polish.py`):
rounded edges, smooth-by-angle shading, a `bake` UV layer and a Cycles
ambient-occlusion bake (docs/pursuit-arena/04 §3, §4).

Adapted from the prototype's `blender/bevel.py` and `blender/bake_ao.py`
(same reasoning, same knobs), reorganised so it can run on any list of
objects in any generated .blend.

  bevel(obj, width)       apply a 2-segment angle-limited bevel, shade smooth
  ensure_bake_uv(obj)     add the `bake` layer second (glTF TEXCOORD_1)
  unwrap(objs)            pack all of them into one 0.02..1 atlas
  dump_uv(obj)            point every loop at the reserved white corner
  bake_ao(objs, ...)      AO into one image, deepened, written as PNG
"""

import math
import os

import bmesh
import bpy
import numpy as np

UV_LAYER = 'bake'
ART_UV_LAYER = 'UVMap'
SEGMENTS = 2
BEVEL_ANGLE = math.radians(30.0)
SMOOTH_ANGLE = math.radians(40.0)
#: Atlas islands are packed into [ATLAS_MIN, 1]; the square below it stays white,
#: so geometry that has no bake of its own (LOD1 copies) can point there.
ATLAS_MIN = 0.03
DUMP_UV = (0.008, 0.008)
#: Contrast curve on the raw AO (see blender/bake_ao.py AO_GAMMA).
AO_GAMMA = 1.7
BEVEL_TAG = 'bevel_applied'


def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objs:
        obj.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


def bevel(obj, width, segments=SEGMENTS):
    """
    Round every edge sharper than 30 deg, written into the mesh data (the bake
    has to see it), then shade by angle.

    Done with bmesh on the *mesh*, not a modifier on the object: dynamic props
    of one look share a mesh (that sharing is what the runtime batches them
    by), and a modifier can't be applied to shared data. The tag sits on the
    mesh too, so a shared mesh is bevelled once however many objects use it.
    """
    mesh = obj.data
    if mesh.get(BEVEL_TAG):
        return
    bm = bmesh.new()
    bm.from_mesh(mesh)
    edges = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0.0) > BEVEL_ANGLE]
    if edges:
        bmesh.ops.bevel(
            bm, geom=edges, offset=width, offset_type='OFFSET', segments=segments, profile=0.5,
            affect='EDGES', clamp_overlap=True, miter_outer='ARC',
        )
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    shade_by_angle(obj)
    mesh[BEVEL_TAG] = 1


def shade_by_angle(obj):
    """Smooth faces, hard creases past SMOOTH_ANGLE, written into the mesh (no modifier)."""
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for face in bm.faces:
        face.smooth = True
    for edge in bm.edges:
        edge.smooth = edge.is_manifold and edge.calc_face_angle(math.pi) <= SMOOTH_ANGLE
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def ensure_bake_uv(obj):
    layers = obj.data.uv_layers
    uv = layers.get(UV_LAYER)
    if uv is not None and layers.find(UV_LAYER) == 0:
        layers.remove(uv)
        uv = None
    if len(layers) == 0:
        layers.new(name=ART_UV_LAYER)
    if uv is None:
        uv = layers.new(name=UV_LAYER)
    layers.active = uv
    uv.active_render = True
    return uv


def unwrap(objs, margin=0.006):
    """One shared atlas for all of `objs`, squeezed into [ATLAS_MIN, 1] so the corner stays free."""
    if not objs:
        return
    # Faces pointing straight down sit on the floor and are never seen: they
    # stay out of the atlas (a plaza's underside was a quarter of HQ's) and
    # sample the white corner instead.
    hidden = {}
    for obj in objs:
        ensure_bake_uv(obj)
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        down = [(normal_matrix @ p.normal).normalized().z < -0.9 for p in obj.data.polygons]
        hidden[obj.name] = down
        for poly, is_down in zip(obj.data.polygons, down):
            poly.select = not is_down
    select_only(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.context.tool_settings.mesh_select_mode = (False, False, True)
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    # smart_project's own packing leaves big gaps once faces are left out, so
    # pack again: with the left-out faces collapsed to a point first (their
    # untouched default UVs would otherwise count as huge islands).
    for obj in objs:
        data = obj.data.uv_layers[UV_LAYER].data
        for poly in obj.data.polygons:
            if hidden[obj.name][poly.index]:
                for li in poly.loop_indices:
                    data[li].uv = DUMP_UV
    bpy.context.scene.tool_settings.use_uv_select_sync = False
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')
    span = 1.0 - ATLAS_MIN
    for obj in objs:
        data = obj.data.uv_layers[UV_LAYER].data
        down = hidden[obj.name]
        for poly in obj.data.polygons:
            for li in poly.loop_indices:
                if down[poly.index]:
                    data[li].uv = DUMP_UV
                else:
                    u, v = data[li].uv
                    data[li].uv = (ATLAS_MIN + u * span, ATLAS_MIN + v * span)


def dump_uv(obj):
    """No bake of its own: every loop samples the atlas's reserved white corner."""
    data = ensure_bake_uv(obj).data
    for loop in data:
        loop.uv = DUMP_UV


def configure_cycles(samples, distance):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons.get('cycles')
    scene.cycles.device = 'CPU'
    if prefs is not None:
        # A GPU makes a 14-district bake minutes instead of an hour; fall back quietly.
        for backend in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
            try:
                prefs.preferences.compute_device_type = backend
                prefs.preferences.get_devices()
                devices = prefs.preferences.devices
                if any(d.type == backend for d in devices):
                    for device in devices:
                        device.use = device.type == backend
                    scene.cycles.device = 'GPU'
                    break
            except (TypeError, ValueError):
                continue
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 6
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.use_clear = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new('bake_world')
    scene.world.light_settings.distance = distance
    return scene.cycles.device


def new_image(name, size):
    image = bpy.data.images.get(name)
    if image is not None:
        bpy.data.images.remove(image)
    image = bpy.data.images.new(name, width=size, height=size, alpha=False)
    # AO multiplies: every texel the bake never reaches must mean "no occlusion".
    image.pixels.foreach_set(np.ones(size * size * 4, dtype=np.float32))
    return image


def attach_target(objs, image):
    """Cycles bakes into each material's active Image Texture node."""
    seen = set()
    for obj in objs:
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None or mat.name in seen:
                continue
            seen.add(mat.name)
            mat.use_nodes = True
            nodes = mat.node_tree.nodes
            node = nodes.get('ao_bake_target') or nodes.new('ShaderNodeTexImage')
            node.name = 'ao_bake_target'
            node.image = image
            for other in nodes:
                other.select = False
            node.select = True
            nodes.active = node


def detach_target(objs):
    """Leave no image nodes behind: the exporter would ship them as textures."""
    for obj in objs:
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None or not mat.use_nodes:
                continue
            node = mat.node_tree.nodes.get('ao_bake_target')
            if node is not None:
                mat.node_tree.nodes.remove(node)


def bake_ao(objs, out_path, size, samples=128, distance=4.0, blur_sigma=0.0):
    """Bake AO for `objs` (everything else visible occludes), deepen, optionally blur, save PNG."""
    configure_cycles(samples, distance)
    image = new_image(os.path.splitext(os.path.basename(out_path))[0], size)
    attach_target(objs, image)
    select_only(objs)
    bpy.ops.object.bake(type='AO')
    detach_target(objs)
    pixels = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    out = np.power(np.clip(pixels, 0.0, 1.0), AO_GAMMA)
    if blur_sigma > 0:
        out = blur(out, size, blur_sigma)
    out[3::4] = 1.0
    image.pixels.foreach_set(out)
    save_ao(image, out_path)
    bpy.data.images.remove(image)
    return out_path


def save_ao(image, out_path):
    """
    Greyscale JPEG: AO is one channel of smooth gradients, which JPEG keeps
    well at a fraction of an RGB PNG's size (the 17 bakes went from 8.6 MB to
    2.3 MB -- rule 5's 10 MB first load).
    """
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    # save_render applies the scene's view transform; Blender 5's default
    # (AgX) maps 1.0 to ~0.77, which darkened every bake by a quarter.
    view = bpy.context.scene.view_settings
    view.view_transform = 'Standard'
    view.look = 'None'
    view.exposure = 0.0
    view.gamma = 1.0
    settings = bpy.context.scene.render.image_settings
    settings.file_format = 'JPEG'
    settings.color_mode = 'BW'
    settings.quality = 88
    image.save_render(out_path, scene=bpy.context.scene)


def blur(buffer, size, sigma):
    """Separable Gaussian on an RGBA AO buffer (grey, so one channel), edge-replicated."""
    radius = int(math.ceil(sigma * 3))
    offsets = np.arange(-radius, radius + 1)
    kernel = np.exp(-0.5 * (offsets / sigma) ** 2)
    kernel /= kernel.sum()
    img = buffer.reshape(size, size, 4)[:, :, 0].astype(np.float64)
    for axis in (0, 1):
        padded = np.pad(img, radius, mode='edge')
        acc = np.zeros_like(img)
        for i, w in enumerate(kernel):
            acc += w * (padded[i:i + size, radius:radius + size] if axis == 0 else padded[radius:radius + size, i:i + size])
        img = acc
    out = buffer.copy()
    flat = img.reshape(-1).astype(np.float32)
    for c in range(3):
        out[c::4] = flat
    return out


def temp_ground(y, size=600.0):
    """A ground plane for baking only (contact darkening at the base of things); remove after."""
    mesh = bpy.data.meshes.new('bake_ground')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size / 2)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('bake_ground', mesh)
    obj.location = (0, 0, y)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def remove(obj):
    mesh = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if mesh is not None and mesh.users == 0:
        bpy.data.meshes.remove(mesh)
