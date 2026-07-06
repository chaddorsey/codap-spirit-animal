"""Export the animated axolotl to glTF for the web runtime.

Run:  blender -b assets/axolotl-animated.blend -P pipeline/03_export_glb.py
Writes: web/public/axolotl.glb  (mesh + skin + one animation per NLA track)
"""
import bpy
import os

out_dir = os.path.join(os.path.dirname(bpy.data.filepath), "..", "web", "public")
os.makedirs(out_dir, exist_ok=True)
out = os.path.abspath(os.path.join(out_dir, "axolotl.glb"))

# The body material drives Roughness through a ColorRamp; the exporter bakes
# that into a glossy metallicRoughness texture, which renders as black smudges
# in three.js (no environment to reflect). Flatten to a constant roughness.
mat = bpy.data.materials["Material.003"]
bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
rough = bsdf.inputs['Roughness']
for link in list(rough.links):
    mat.node_tree.links.remove(link)
rough.default_value = 0.55

for obj in bpy.context.view_layer.objects:
    obj.select_set(obj.name in ("Axolotl", "AxolotlRig"))

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    use_selection=True,
    export_animations=True,
    export_animation_mode='NLA_TRACKS',
    export_skins=True,
    export_yup=True,
    export_apply=False,
)
print("EXPORTED", out, os.path.getsize(out), "bytes")
