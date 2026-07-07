"""Build the axolotl armature and skin weights from the raw asset.

Run:  blender -b assets/cute-axolotl.blend -P pipeline/01_build_rig.py
Writes: assets/axolotl-rigged.blend  (source file is never modified)

Approach: all meshes are merged into one "Axolotl" mesh; bones are placed
from measured geometry (mesh islands), and weights are assigned
procedurally — rigid per island for gills/limbs/eyes, smooth z-blend along
the spine+tail chains for the body. No heat-map weighting: deterministic
and safe on disconnected islands.

Skeleton:
  root
   |- pelvis - spine - chest - head - { gill_1..3.L/R, eye.L, eye.R }
   |- tail_1 - tail_2 - tail_3 - tail_4
   |- arm.L/R (parent: chest)   |- leg.L/R (parent: pelvis)
"""
import bpy
import bmesh
import os
from mathutils import Vector

OUT_PATH = os.path.join(os.path.dirname(bpy.data.filepath), "axolotl-rigged.blend")
BLEND = 0.12  # half-width of the weight blend zone at chain joints


# ---------------------------------------------------------------- helpers
def set_active(obj):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.view_layer.objects:
        o.select_set(o == obj)


def mesh_islands(me):
    """Connected components as lists of vertex indices."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    seen, comps = set(), []
    for seed in bm.verts:
        if seed.index in seen:
            continue
        stack, comp = [seed], []
        seen.add(seed.index)
        while stack:
            v = stack.pop()
            comp.append(v.index)
            for e in v.link_edges:
                o = e.other_vert(v)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        comps.append(comp)
    bm.free()
    return comps


def centroid(me, idxs):
    return sum((me.vertices[i].co for i in idxs), Vector()) / len(idxs)


# ---------------------------------------------------------------- clean up
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)

body = bpy.data.objects["Cube"]
legs, arms, eyes = (bpy.data.objects[n] for n in ("Cube.001", "Cube.002", "Cube.003"))
if bpy.data.objects.get("Empty"):
    bpy.data.objects.remove(bpy.data.objects["Empty"])

# drop the alternate-proportions shape key; rig the Basis shape
set_active(body)
body.shape_key_clear()

# apply subsurf+mirror on limbs so their real geometry exists
for obj in (legs, arms):
    set_active(obj)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)

# unparent (keep transforms), apply transforms, join into one mesh
parts = [body, legs, arms, eyes]
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.join()
axo = bpy.context.view_layer.objects.active
axo.name = "Axolotl"
me = axo.data
me.name = "Axolotl"

# ---------------------------------------------------------------- classify islands
comps = sorted(mesh_islands(me), key=len, reverse=True)
body_island = comps[0]
gills, eye_parts, arm_parts, leg_parts = [], [], [], []
for comp in comps[1:]:
    c = centroid(me, comp)
    if c.x > 0.45:                                   # front of face
        eye_parts.append((comp, c))
    elif abs(c.y) > 0.3 and c.z > -0.5:              # head sides, upper
        gills.append((comp, c))
    elif c.z > -1.25:
        arm_parts.append((comp, c))
    else:
        leg_parts.append((comp, c))
assert len(gills) == 6 and len(eye_parts) == 6, \
    f"island classification off: gills={len(gills)} eyes={len(eye_parts)}"
assert len(arm_parts) == 2 and len(leg_parts) == 2, \
    f"island classification off: arms={len(arm_parts)} legs={len(leg_parts)}"

HEAD_CENTER = Vector((0.0, 0.0, 0.2))


def frond_bone(comp):
    """Bone endpoints for a gill frond: base (nearest head center) -> tip."""
    vs = [me.vertices[i].co for i in comp]
    base = min(vs, key=lambda v: (v - HEAD_CENTER).length)
    tip = max(vs, key=lambda v: (v - base).length)
    return Vector(base), Vector(tip)


def limb_ends(comp):
    """(shoulder/hip anchor, tip) for a limb island.

    The anchor is the TOP of the limb's inner (body-side) face — a true
    shoulder/hip — so raising gestures swing the limb clear of the body
    instead of pivoting at the armpit. Tip is the farthest vertex.
    """
    vs = [me.vertices[i].co for i in comp]
    y_cut = sorted(abs(v.y) for v in vs)[max(1, len(vs) // 5)]
    inner = max((v for v in vs if abs(v.y) <= y_cut), key=lambda v: v.z)
    tip = max(vs, key=lambda v: (v - inner).length)
    return Vector(inner), Vector(tip)


def limb_bone(comp):
    """Bone endpoints: pivot sunk 15% into the body so ~90 deg rotations
    keep the limb root visually attached at the shoulder/hip."""
    inner, tip = limb_ends(comp)
    head = inner + (inner - tip) * 0.15
    return head, tip


# eye assemblies: group the 3 islands per side; center = largest island's centroid
eye_groups = {"L": [], "R": []}
for comp, c in eye_parts:
    eye_groups["L" if c.y > 0 else "R"].append((comp, c))
eye_centers = {}
for side, group in eye_groups.items():
    biggest = max(group, key=lambda g: len(g[0]))
    eye_centers[side] = biggest[1]

# level the eyes: the source mesh has the eye assemblies at different
# heights/inset (reads as charm through the file's angled camera, reads as
# lopsided from the straight-on overlay camera). Slide each side's three
# islands so both eye centers share the same height and |y| spacing.
z_target = (eye_centers["L"].z + eye_centers["R"].z) / 2
y_target = (abs(eye_centers["L"].y) + abs(eye_centers["R"].y)) / 2
for side, sign in (("L", 1), ("R", -1)):
    c = eye_centers[side]
    delta = Vector((0, sign * y_target - c.y, z_target - c.z))
    for comp, _ in eye_groups[side]:
        for i in comp:
            me.vertices[i].co += delta
    eye_centers[side] = c + delta
    print(f"eye_{side} leveled by ({delta.y:+.3f}, {delta.z:+.3f})")

# reseat the glints (sub-pupils): from the straight-on overlay camera they sit
# low and drift off the pupil. Pull each glint onto the eyeball sphere surface,
# raised and front-facing, keeping its authored side (inner/outer) placement.
for side, group in eye_groups.items():
    islands = [(comp, centroid(me, comp)) for comp, _ in group]
    eyeball = max(islands, key=lambda g: len(g[0]))
    E = eyeball[1]
    r = max((me.vertices[i].co - E).length for i in eyeball[0])
    for comp, c in islands:
        if comp is eyeball[0]:
            continue
        d = c - E
        d.z += 0.20 * r                      # slight raise toward catchlight spot
        lat = (d.y ** 2 + d.z ** 2) ** 0.5   # keep within the pupil disc face
        max_lat = 0.52 * r
        if lat > max_lat:
            d.y *= max_lat / lat
            d.z *= max_lat / lat
        seat = 1.06 * r                      # just proud of the sphere, facing camera
        d.x = max(seat ** 2 - d.y ** 2 - d.z ** 2, 0) ** 0.5
        shift = (E + d) - c
        for i in comp:
            me.vertices[i].co += shift
        print(f"glint {side} ({len(comp)}v) shifted ({shift.x:+.3f},{shift.y:+.3f},{shift.z:+.3f})")

# lengthen arms and legs ~40% along the limb axis, anchored at the body end,
# so gestures read clearly. Cross-section is untouched (still chubby/cute).
LIMB_STRETCH = 1.4
for comp, c in arm_parts + leg_parts:
    inner, tip = limb_ends(comp)
    axis = (tip - inner).normalized()
    for i in comp:
        v = me.vertices[i]
        t = axis.dot(v.co - inner)
        v.co += axis * (t * (LIMB_STRETCH - 1))
print(f"limbs stretched x{LIMB_STRETCH} from shoulder/hip anchors")

# gill fronds per side, sorted top-to-bottom
gill_groups = {"L": [], "R": []}
for comp, c in gills:
    gill_groups["L" if c.y > 0 else "R"].append((comp, c))
for side in gill_groups:
    gill_groups[side].sort(key=lambda g: -g[1].z)

# ---------------------------------------------------------------- armature
arm_data = bpy.data.armatures.new("AxolotlRig")
rig = bpy.data.objects.new("AxolotlRig", arm_data)
bpy.context.scene.collection.objects.link(rig)
set_active(rig)
bpy.ops.object.mode_set(mode='EDIT')

bones = {}


def add_bone(name, head, tail, parent=None, connect=False):
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = head, tail
    if parent:
        b.parent = bones[parent]
        b.use_connect = connect
    bones[name] = b
    return b


Z = lambda x, z: Vector((x, 0, z))
add_bone("root",   Z(0, -1.35), Z(0, -1.05))
add_bone("pelvis", Z(0, -1.35), Z(0, -0.95), "root")
add_bone("spine",  Z(0, -0.95), Z(0, -0.55), "pelvis", True)
add_bone("chest",  Z(0, -0.55), Z(0, -0.20), "spine", True)
add_bone("head",   Z(0, -0.20), Z(0,  0.60), "chest", True)

# tail chain following the measured forward curl
tail_pts = [Z(0, -1.35), Z(-0.10, -1.60), Z(0.0, -1.95), Z(0.25, -2.25), Z(1.15, -2.70)]
prev = "root"
for i in range(4):
    add_bone(f"tail_{i+1}", tail_pts[i], tail_pts[i + 1], prev, connect=(i > 0))
    prev = f"tail_{i+1}"

island_to_bone = {}  # island (as tuple of vert idxs) -> bone name, rigid binding

for side in ("L", "R"):
    for i, (comp, c) in enumerate(gill_groups[side]):
        name = f"gill_{i+1}_{side}"
        h, t = frond_bone(comp)
        add_bone(name, h, t, "head")
        island_to_bone[tuple(comp)] = name
    for comp, c in eye_groups[side]:
        island_to_bone[tuple(comp)] = f"eye_{side}"
    ec = eye_centers[side]
    add_bone(f"eye_{side}", ec, ec + Vector((0.15, 0, 0)), "head")

arm_weight_specs = []  # (comp, arm_name, hand_name, inner, axis, length)
for comp, c in arm_parts:
    side = "L" if c.y > 0 else "R"
    h, t = limb_bone(comp)
    # two-bone arm: upper arm + a "hand" hinge on the outer ~30% so the
    # character can tap/flex a finger-equivalent
    mid = h + (t - h) * 0.7
    add_bone(f"arm_{side}", h, mid, "chest")
    add_bone(f"hand_{side}", mid, t, f"arm_{side}", connect=True)
    inner, tip = limb_ends(comp)
    axis = (tip - inner).normalized()
    arm_weight_specs.append(
        (comp, f"arm_{side}", f"hand_{side}", inner, axis, (tip - inner).length, mid))
for comp, c in leg_parts:
    side = "L" if c.y > 0 else "R"
    h, t = limb_bone(comp)
    add_bone(f"leg_{side}", h, t, "pelvis")
    island_to_bone[tuple(comp)] = f"leg_{side}"

bpy.ops.object.mode_set(mode='OBJECT')

# ---------------------------------------------------------------- weights
groups = {}
for b in arm_data.bones:
    groups[b.name] = axo.vertex_groups.new(name=b.name)

# rigid islands
for comp, bone_name in island_to_bone.items():
    groups[bone_name].add(list(comp), 1.0, 'REPLACE')

# arms: blend arm -> hand along the limb axis around the hinge point
for comp, arm_name, hand_name, inner, axis, length, mid in arm_weight_specs:
    split = axis.dot(mid - inner) / length      # hinge as 0..1 along the limb
    bw = 0.10
    for i in comp:
        t = axis.dot(me.vertices[i].co - inner) / length
        k = min(1.0, max(0.0, (t - (split - bw)) / (2 * bw)))
        k = k * k * (3 - 2 * k)
        groups[arm_name].add([i], 1.0 - k, 'REPLACE')
        groups[hand_name].add([i], k, 'REPLACE')

# body: smooth blend along spine + tail chains keyed on z
# joints: (z, bone_below, bone_above)
CHAIN = [
    (-2.25, "tail_4", "tail_3"),
    (-1.95, "tail_3", "tail_2"),
    (-1.60, "tail_2", "tail_1"),
    (-1.35, "tail_1", "pelvis"),
    (-0.95, "pelvis", "spine"),
    (-0.55, "spine", "chest"),
    (-0.20, "chest", "head"),
]


def body_weights(z):
    """Return {bone: weight} for a body vertex at height z."""
    for jz, below, above in CHAIN:
        if z < jz - BLEND:
            return {below: 1.0}
        if z <= jz + BLEND:
            t = (z - (jz - BLEND)) / (2 * BLEND)     # 0..1 across blend zone
            t = t * t * (3 - 2 * t)                  # smoothstep
            return {below: 1.0 - t, above: t}
    return {"head": 1.0}


for i in body_island:
    for bone_name, w in body_weights(me.vertices[i].co.z).items():
        groups[bone_name].add([i], w, 'REPLACE')

# bind
mod = axo.modifiers.new("Armature", 'ARMATURE')
mod.object = rig
axo.parent = rig

print("RIG OK: bones=%d verts=%d" % (len(arm_data.bones), len(me.vertices)))
bpy.ops.wm.save_as_mainfile(filepath=OUT_PATH)
print("SAVED", OUT_PATH)
