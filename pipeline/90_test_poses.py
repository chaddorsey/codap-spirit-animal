"""Render deformation test poses to validate skin weights.

Run:  blender -b assets/axolotl-rigged.blend -P pipeline/90_test_poses.py
Writes renders/pose_*.png
"""
import bpy
import math
import os

ROOT = os.path.dirname(os.path.dirname(bpy.data.filepath)) \
    if os.path.basename(os.path.dirname(bpy.data.filepath)) == "assets" \
    else os.path.dirname(bpy.data.filepath)
OUT = os.path.join(os.path.dirname(bpy.data.filepath), "..", "renders")
os.makedirs(OUT, exist_ok=True)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.render.resolution_x = 640
scene.render.resolution_y = 640
scene.render.image_settings.media_type = 'IMAGE'
scene.render.image_settings.file_format = 'PNG'

rig = bpy.data.objects["AxolotlRig"]
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')
pb = rig.pose.bones


def reset():
    for b in pb:
        b.rotation_mode = 'XYZ'
        b.rotation_euler = (0, 0, 0)
        b.location = (0, 0, 0)
        b.scale = (1, 1, 1)


def render(name):
    scene.render.filepath = os.path.join(OUT, f"pose_{name}.png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", name)


deg = math.radians

# pose 1: rest
reset()
render("1_rest")

# pose 2: head nod + turn, gills flared, eyes look + blink test on one eye
reset()
pb["head"].rotation_euler = (deg(15), deg(10), deg(15))
for side, sign in (("L", 1), ("R", -1)):
    for i in (1, 2, 3):
        pb[f"gill_{i}_{side}"].rotation_euler = (deg(25) * sign, 0, 0)
pb["eye_L"].rotation_euler = (0, deg(15), deg(10))
pb["eye_R"].scale = (1, 1, 0.2)   # blink squash
render("2_head_gills_eyes")

# pose 3: body lean, tail curl, arms raised, legs kick
reset()
pb["spine"].rotation_euler = (deg(12), 0, 0)
pb["chest"].rotation_euler = (deg(10), 0, 0)
for i in (1, 2, 3, 4):
    pb[f"tail_{i}"].rotation_euler = (deg(20), 0, 0)
pb["arm_L"].rotation_euler = (0, 0, deg(50))
pb["arm_R"].rotation_euler = (0, 0, deg(-50))
pb["leg_L"].rotation_euler = (deg(30), 0, 0)
pb["leg_R"].rotation_euler = (deg(-30), 0, 0)
render("3_body_tail_limbs")

reset()
bpy.ops.object.mode_set(mode='OBJECT')
print("TEST POSES DONE")
