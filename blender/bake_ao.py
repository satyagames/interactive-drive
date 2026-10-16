"""
Bakes ambient occlusion for the static world geometry.

    blender --background blender/scene.blend --python blender/bake_ao.py

Writes two textures into `public/textures/bake/`:

    world-ao-ground.png   2048  -- the ground plane's top face only
    world-ao-props.png    1024  -- exhibits and ramps, packed into one atlas

Both are sampled in-game on UV channel 1 (the `bake` UV layer, see "UV
layers" below) and multiplied into the matcap shading by
`src/render/materials.js`. That is what stops the placeholder boxes looking
like they are hovering: the matcap alone has no idea where the ground is.

Why AO and not a directional shadow bake: AO needs no light rig, so it can't
drift out of sync with a lighting setup that doesn't exist (everything static
is matcap-shaded and unlit). It also stays correct if the final art decides on
a completely different key direction later -- see docs/blender-conventions.md.

## UV layers

Every baked object gets a second UV layer called `bake`, added *after* the
existing layers so the glTF exporter emits it as TEXCOORD_1. Nothing else in
the project uses UVs yet, so channel 0 stays free for real art later.

The two groups are unwrapped very differently on purpose:

  - **Ground.** A 240 m box whose only visible surface is the top face. It
    gets a hand-written planar XY projection so that face fills the whole
    2048 texture (~12 cm/texel); every other face is collapsed into an unused
    corner texel so it cannot overwrite the top face's shadows.
  - **Props.** Small objects whose sides matter as much as their tops, so
    they get a normal automatic unwrap packed into a shared atlas.
"""

import math
import os

import bpy
import numpy as np

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(PROJECT_ROOT, 'public', 'textures', 'bake')

UV_LAYER = 'bake'
#: Placeholder so `bake` is never UV layer 0. glTF numbers TEXCOORD_n by layer
#: order, so keeping the bake second is what lets the game hardcode channel 1
#: and still be right the day real art arrives with its own UVs on channel 0.
ART_UV_LAYER = 'UVMap'

GROUND = 'ground'
GROUND_SIZE = 2048
PROPS_SIZE = 1024

#: How far a surface looks for occluders, metres. Roughly "how wide a
#: contact shadow spreads".
#:
#: Was 10, which spread each exhibit's occlusion over a 10 m falloff and made
#: the darkest texel next to a box only a few percent down from open ground --
#: technically present, invisible in motion. Halving it concentrates the same
#: occlusion into the metres that actually touch the object, which is where
#: "this is sitting on the ground" is read from.
AO_DISTANCE = 5.0

#: Cycles samples, per group. These are wildly different because the two bakes
#: have wildly different economics: the ground is a 2048 map over 57,000 m2 and
#: costs about twelve minutes at 256 samples, so its leftover speckle is
#: cheaper to remove with GROUND_BLUR_SIGMA below (a fraction of a second)
#: than with more rays. The props atlas is 1024 over a few hundred square
#: metres and bakes in about a minute, so there quadrupling the samples is the
#: cheap fix -- and it is the right one, because a blur wide enough to matter
#: would drag each island's occlusion across the atlas gutter into its
#: neighbours' and show up as seams along object edges.
GROUND_SAMPLES = 256
PROPS_SAMPLES = 1024

#: Contrast curve applied to every AO bake before it is saved (`ao ** gamma`).
#:
#: Cycles' AO is physically a visibility fraction, and a visibility fraction
#: next to a box on an open plane is a very gentle ramp -- correct, and far too
#: polite to read as contact. Raising it to a power above 1 leaves open ground
#: untouched (1 ** g == 1, so no seams appear in the atlas gutters, which stay
#: at 1) and pushes everything already partly occluded further down. This is
#: the knob that does most of the work of "things sit *in* the scene".
AO_GAMMA = 1.9

#: The ground also gets a cast-shadow pass, because pure AO next to a 4 m box
#: on a 240 m plane is almost entirely *under* the box: the visible penumbra
#: is about a metre wide and reads as nothing at driving distance. A sun
#: throws a shadow you can actually see, which is what sells contact.
#:
#: Its direction is arbitrary by construction -- matcap shading is view-space,
#: so there is no world-space key light for it to disagree with. It is only
#: used on the ground; letting it darken one whole flank of every prop would
#: fight the matcaps for no benefit.
SUN_ELEVATION = 50.0
SUN_AZIMUTH = -38.0
#: Angular diameter of the sun, degrees. This is the penumbra control: a hard
#: 0.5 deg sun looks like a sticker, a few degrees reads as a soft day. Raised
#: from 5 so the shadow's edge spreads with distance from the contact point --
#: crisp where the box meets the ground, diffuse a few metres out, which is
#: the gradient that sells weight.
SUN_SOFTNESS = 9.0
#: How dark a fully shadowed ground texel is allowed to get. Full black would
#: punch holes in the ground; this keeps the bake a tint, not a hole. Lowered
#: from 0.42: at that value the deepest shadow was a 25% dip on a mid-tone
#: ground, which the eye reads as a smudge rather than as a shadow.
SHADOW_FLOOR = 0.24

#: Gaussian blur applied to the finished ground bake, in texels (one texel is
#: ~11 cm of ground). Two jobs, both wanted:
#:
#: 1. De-noise. A 9 deg sun at 256 samples leaves about 2% of speckle in the
#:    penumbra, which is invisible in the texture and reads as blotchy
#:    mottling once it is stretched across metres of ground.
#: 2. Soften. A contact shadow that is *slightly* softer than physically
#:    correct is the standard stylised cheat, and the alternative way to buy
#:    the same smoothness -- baking at 1000+ samples -- costs an hour of CPU
#:    for a result nobody can tell apart at driving distance.
#:
#: Ground only. The props share one packed atlas, and a blur that wide would
#: drag each island's occlusion across the gutter into its neighbours'.
GROUND_BLUR_SIGMA = 3.0

#: Leave the ground's projection slightly inside the texture so the bake
#: margin around the corner island can never bleed into it.
GROUND_INSET = 0.02
#: Where non-top ground faces are parked.
GROUND_DUMP_UV = (0.004, 0.004)


def world_meshes():
    """Visual world geometry only -- collision proxies are never rendered."""
    collection = bpy.data.collections['World']
    return [
        obj for obj in collection.objects
        if obj.type == 'MESH' and not obj.name.startswith('collision_')
    ]


def ensure_uv_layer(mesh):
    layers = mesh.uv_layers
    uv = layers.get(UV_LAYER)

    # Migration/normalisation: an earlier run could have made `bake` the only
    # (and therefore first) layer. Drop it and rebuild in the right order.
    if uv is not None and layers.find(UV_LAYER) == 0:
        layers.remove(uv)
        uv = None
    if len(layers) == 0:
        layers.new(name=ART_UV_LAYER)
    if uv is None:
        uv = layers.new(name=UV_LAYER)

    layers.active = uv
    # `active_render` decides which layer Cycles bakes into.
    uv.active_render = True
    return uv


def project_ground(obj):
    """Top-down planar unwrap of the ground's upward-facing polygons."""
    mesh = obj.data
    uv = ensure_uv_layer(mesh).data

    xs = [v.co.x for v in mesh.vertices]
    ys = [v.co.y for v in mesh.vertices]
    span = max(max(xs) - min(xs), max(ys) - min(ys)) or 1.0
    scale = (1.0 - 2 * GROUND_INSET) / span

    for poly in mesh.polygons:
        top = poly.normal.z > 0.9
        for loop_index in poly.loop_indices:
            if not top:
                uv[loop_index].uv = GROUND_DUMP_UV
                continue
            co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            uv[loop_index].uv = (
                GROUND_INSET + (co.x - min(xs)) * scale,
                GROUND_INSET + (co.y - min(ys)) * scale,
            )


def unwrap_props(objs):
    """Pack every prop into one shared 0..1 atlas via a multi-object unwrap."""
    for obj in objs:
        ensure_uv_layer(obj.data)

    select_only(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objs:
        obj.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


def attach_bake_target(objs, image):
    """
    Point every material on `objs` at `image`.

    Cycles bakes into whichever Image Texture node is *active* in each
    material, so the node only has to exist and be selected -- it is
    deliberately left unconnected so the .blend still previews the flat
    authoring colours.
    """
    seen = set()
    for obj in objs:
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None or mat.name in seen:
                continue
            seen.add(mat.name)
            mat.use_nodes = True
            nodes = mat.node_tree.nodes

            node = nodes.get('ao_bake_target')
            if node is None:
                node = nodes.new('ShaderNodeTexImage')
                node.name = 'ao_bake_target'
                node.label = 'AO bake target'
                node.location = (-600, -320)
            node.image = image

            for other in nodes:
                other.select = False
            node.select = True
            nodes.active = node


def new_image(name, size):
    image = bpy.data.images.get(name)
    if image is not None:
        bpy.data.images.remove(image)
    image = bpy.data.images.new(name, width=size, height=size, alpha=False)
    # AO is a multiplier, so every texel the bake never reaches -- atlas gutters,
    # the ground's inset border, the margin dilation around each island -- has to
    # start at "no occlusion". Baking with `use_clear` instead would zero the
    # image first and leave black seams wherever filtering strays off an island.
    image.pixels.foreach_set([1.0] * (size * size * 4))
    return image


def bake_into(objs, image, bake_type):
    attach_bake_target(objs, image)
    select_only(objs)
    bpy.ops.object.bake(type=bake_type, use_clear=False)


def save(image):
    image.filepath_raw = os.path.join(OUT_DIR, image.name + '.png')
    image.file_format = 'PNG'
    image.save()
    print(f'  wrote {image.filepath_raw}')


def read_pixels(image):
    buffer = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(buffer)
    return buffer


def deepen(buffer):
    """
    Apply `AO_GAMMA` to a baked occlusion buffer.

    Untouched texels sit at 1.0 and stay there, so atlas gutters, the ground's
    inset border and the margin dilation around each island are all unaffected
    -- which is what lets this run before the image is saved rather than
    needing to know where the islands are.
    """
    out = np.power(np.clip(buffer, 0.0, 1.0), AO_GAMMA)
    out[3::4] = 1.0
    return out


def blur(buffer, size, sigma):
    """
    Separable Gaussian over the RGB of an RGBA float buffer.

    Edges are handled by replicating the border rather than by zero-padding,
    which on a multiplier texture would mean blurring towards "fully
    occluded" and drawing a dark frame around the world.
    """
    radius = int(math.ceil(sigma * 3))
    offsets = np.arange(-radius, radius + 1)
    kernel = np.exp(-0.5 * (offsets / sigma) ** 2)
    kernel /= kernel.sum()

    # All three channels of an AO bake are identical, so one is enough.
    image = buffer.reshape(size, size, 4)[:, :, 0].astype(np.float64)
    for axis in (0, 1):
        padded = np.pad(image, radius, mode='edge')
        window = padded[:, radius:radius + size] if axis == 0 else padded[radius:radius + size, :]
        out = np.zeros_like(image)
        for i, weight in enumerate(kernel):
            out += weight * (window[i:i + size, :] if axis == 0 else window[:, i:i + size])
        image = out

    result = buffer.copy()
    flat = image.reshape(-1)
    for channel in range(3):
        result[channel::4] = flat
    result[3::4] = 1.0
    return result


def bake_ao_only(objs, name, size, samples):
    bpy.context.scene.cycles.samples = samples
    image = new_image(name, size)
    bake_into(objs, image, 'AO')
    image.pixels.foreach_set(deepen(read_pixels(image)))
    save(image)


def bake_ao_and_shadow(objs, name, size, samples):
    """Ground bake: ambient occlusion multiplied by the sun's cast shadow."""
    bpy.context.scene.cycles.samples = samples
    ao = new_image(name + '-ao-pass', size)
    bake_into(objs, ao, 'AO')

    sun = add_sun()
    try:
        shadow = new_image(name + '-shadow-pass', size)
        bake_into(objs, shadow, 'SHADOW')
    finally:
        remove_sun(sun)

    # Blender's shadow pass is "fraction of the light that arrives", so 1 is
    # lit. Lifting it off the floor keeps the darkest shadow readable rather
    # than a black hole, and AO multiplies on top for the contact darkening.
    combined = new_image(name, size)
    lit = SHADOW_FLOOR + (1.0 - SHADOW_FLOOR) * read_pixels(shadow)
    result = np.clip(deepen(read_pixels(ao)) * lit, 0.0, 1.0)
    # Blur last, so it smooths the AO and the cast shadow together rather than
    # letting the gamma curve sharpen speckle back up afterwards.
    combined.pixels.foreach_set(blur(result, size, GROUND_BLUR_SIGMA))
    save(combined)

    for temp in (ao, shadow):
        bpy.data.images.remove(temp)


def add_sun():
    data = bpy.data.lights.new('ao_bake_sun', type='SUN')
    data.angle = math.radians(SUN_SOFTNESS)
    data.energy = 1.0
    sun = bpy.data.objects.new('ao_bake_sun', data)
    # A sun points down its own -Z, so elevation is a rotation off straight
    # down and azimuth spins it around.
    sun.rotation_euler = (
        math.radians(90.0 - SUN_ELEVATION),
        0.0,
        math.radians(SUN_AZIMUTH),
    )
    bpy.context.scene.collection.objects.link(sun)
    bpy.context.view_layer.update()
    return sun


def remove_sun(sun):
    data = sun.data
    bpy.data.objects.remove(sun)
    bpy.data.lights.remove(data)


def configure_scene():
    """Switch to Cycles for the bake; `main()` puts the original engine back."""
    scene = bpy.context.scene
    previous_engine = scene.render.engine
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    # Set per bake; this is just a floor so the scene is never left at
    # whatever the .blend happened to be saved with.
    scene.cycles.samples = GROUND_SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.bake_type = 'AO'
    scene.render.bake.margin = 8
    scene.render.bake.use_selected_to_active = False
    scene.world.light_settings.distance = AO_DISTANCE
    return previous_engine


def hide_non_occluders():
    """
    Anything that isn't static world geometry must not cast into the bake.

    Collision proxies sit exactly on top of their visual twins, so leaving
    them visible would occlude every surface with itself; the vehicle would
    burn a permanent car-shaped shadow into the ground at the origin.
    """
    hidden = []
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        if obj.name.startswith('collision_') or obj.name.startswith('vehicle_'):
            hidden.append((obj, obj.hide_render))
            obj.hide_render = True
    return hidden


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    previous_engine = configure_scene()
    hidden = hide_non_occluders()

    if bpy.context.object is not None and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')

    meshes = world_meshes()
    ground = [obj for obj in meshes if obj.name == GROUND]
    props = [obj for obj in meshes if obj.name != GROUND]

    print(f'baking ground: {[o.name for o in ground]}')
    for obj in ground:
        project_ground(obj)
    bake_ao_and_shadow(ground, 'world-ao-ground', GROUND_SIZE, GROUND_SAMPLES)

    print(f'baking props: {[o.name for o in props]}')
    unwrap_props(props)
    bake_ao_only(props, 'world-ao-props', PROPS_SIZE, PROPS_SAMPLES)

    for obj, was_hidden in hidden:
        obj.hide_render = was_hidden

    # The .blend is saved so the new `bake` UV layers survive for the next
    # export, but the viewport engine is the author's setting, not ours.
    bpy.context.scene.render.engine = previous_engine
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.wm.save_mainfile()
    print('AO bake complete')


main()
