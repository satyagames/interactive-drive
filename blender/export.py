"""
Headless re-export of scene.blend -> public/models/vehicle.glb.

Run from the project root:

    blender --background blender/scene.blend --python blender/export.py

Exports the "Vehicle" collection (via `use_selection`, so objects outside it
-- and any leftover default Camera/Light -- never leak into the file). The
"World" collection in scene.blend is the retired prototype lot; the arena is
generated and exported by blender/scripts/ (`npm run art:build`). Draco
settings match blender/scripts/export_arena.py; keep them in sync.
"""

import bpy
import os

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

EXPORT_KWARGS = dict(
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
)


def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objs:
        obj.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


def export_collection(name, filename):
    collection = bpy.data.collections.get(name)
    if not collection:
        raise RuntimeError(f'No "{name}" collection in this .blend')
    select_only(list(collection.objects))
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(PROJECT_ROOT, 'public', 'models', filename),
        **EXPORT_KWARGS,
    )


# The prototype's World collection is retired: the arena is generated and
# exported by blender/scripts/ (npm run art:build). Only the car ships from here.
export_collection('Vehicle', 'vehicle.glb')
bpy.ops.object.select_all(action='DESELECT')

print('Exported public/models/vehicle.glb')
