"""Analyze the axolotl mesh to plan armature bone placement.

Run:  blender -b assets/cute-axolotl.blend -P pipeline/analyze_geometry.py

Reports, in world space:
- what shape key 'Key 1' moves (region + magnitude), to decide if it's worth keeping
- connected components ("islands") of each mesh with centroids/bounds,
  so gill fronds and limbs can each get a bone placed from real geometry
- material -> face-region mapping on the body (eyes/mouth live as materials)
"""
import bpy
import bmesh
from mathutils import Vector


def world_pt(obj, co):
    return obj.matrix_world @ co


def islands(obj):
    bm = bmesh.new()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bm.from_object(obj, depsgraph)  # evaluated: modifiers applied
    bm.verts.ensure_lookup_table()
    seen = set()
    result = []
    for seed in bm.verts:
        if seed.index in seen:
            continue
        stack = [seed]
        comp = []
        seen.add(seed.index)
        while stack:
            v = stack.pop()
            comp.append(v)
            for e in v.link_edges:
                o = e.other_vert(v)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        pts = [world_pt(obj, v.co) for v in comp]
        ctr = sum(pts, Vector()) / len(pts)
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        result.append((len(comp), ctr, lo, hi))
    bm.free()
    return sorted(result, key=lambda r: -r[0])


def fmt(v):
    return f"({v.x:+.3f},{v.y:+.3f},{v.z:+.3f})"


print("\n========== GEOMETRY ANALYSIS ==========")
for name in ("Cube", "Cube.001", "Cube.002", "Cube.003"):
    obj = bpy.data.objects[name]
    print(f"\n--- {name} ---")
    for n, ctr, lo, hi in islands(obj):
        print(f"  island verts={n:5d} centroid={fmt(ctr)} min={fmt(lo)} max={fmt(hi)}")

# shape key analysis on body
body = bpy.data.objects["Cube"]
sk = body.data.shape_keys
if sk:
    basis = sk.key_blocks["Basis"]
    key1 = sk.key_blocks["Key 1"]
    moved = []
    for i, (b, k) in enumerate(zip(basis.data, key1.data)):
        d = (k.co - b.co).length
        if d > 1e-5:
            moved.append((i, d, world_pt(body, b.co)))
    print(f"\n--- shape key 'Key 1' ---")
    print(f"  verts moved: {len(moved)} / {len(basis.data)}")
    if moved:
        maxd = max(m[1] for m in moved)
        ctr = sum((m[2] for m in moved), Vector()) / len(moved)
        print(f"  max displacement={maxd:.4f}  moved-region centroid={fmt(ctr)}")

# material -> region map on body
import collections
mats = collections.defaultdict(list)
for poly in body.data.polygons:
    mats[body.data.materials[poly.material_index].name].append(world_pt(body, Vector(poly.center)))
print("\n--- body material regions ---")
for mname, pts in mats.items():
    ctr = sum(pts, Vector()) / len(pts)
    print(f"  {mname}: faces={len(pts)} centroid={fmt(ctr)}")

# same for Cube.003
c3 = bpy.data.objects["Cube.003"]
mats3 = collections.defaultdict(int)
for poly in c3.data.polygons:
    mats3[c3.data.materials[poly.material_index].name] += 1
print("--- Cube.003 materials ---", dict(mats3))
print("========== END ==========")
