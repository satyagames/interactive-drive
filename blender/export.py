"""
Headless re-export of scene.blend -> public/models/{world,vehicle}.glb.

Run from the project root:

    blender --background blender/scene.blend --python blender/export.py

Exports the "World" collection and the "Vehicle" collection separately (each
via `use_selection`, so objects outside those collections -- and any leftover
default Camera/Light -- never leak into either file). Both use the same
Draco settings as the interactive export this scene was built with; keep
them in sync if you change one.
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


export_collection('World', 'world.glb')
export_collection('Vehicle', 'vehicle.glb')
bpy.ops.object.select_all(action='DESELECT')

print('Exported public/models/world.glb and public/models/vehicle.glb')
