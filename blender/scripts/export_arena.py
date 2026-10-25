"""
Exports one arena .blend (kit, base or a district) to a GLB the runtime
loads (src/world/arena.js):

    blender -b blender/districts/audit.blend -P blender/scripts/export_arena.py -- --out public/models/district_audit.glb

Same conventions as the prototype's blender/export.py (+Y up, transforms
applied, Draco, no cameras/lights) plus:
  - custom properties ON (`export_extras`): dyn_ mass/friction/restitution/
    sfx/type and inst_ type reach the runtime as `userData`
  - hierarchy kept: dyn_ roots keep their visual + collision_ children
  - quantised positions (Draco 14-bit)
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _common import args, require_blender_5  # noqa: E402

EXPORT_KWARGS = dict(
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_extras=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
    export_texcoords=True,
    export_normals=True,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14,
)


def main():
    require_blender_5()
    out = args()['out']
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    objects = [o for o in bpy.context.scene.objects]
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=out, **EXPORT_KWARGS)
    print(f'[export] {os.path.basename(bpy.data.filepath)} -> {out} ({os.path.getsize(out)} bytes, {len(objects)} objects)')


main()
