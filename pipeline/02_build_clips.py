"""Author the animation clip library on the rigged axolotl.

Run:  blender -b assets/axolotl-rigged.blend -P pipeline/02_build_clips.py
Writes: assets/axolotl-animated.blend

Each clip is a Blender action pushed to its own NLA track (track name ==
clip name) so the glTF exporter emits them as separate animations.

LAYERING RULES (runtime depends on these -- keep them when adding clips):
- body clips (idle, swim, hop, ...) never key eye bones
- eye clips (blink) key ONLY eye bones
- only hop/celebrate key root location/scale/rotation
- every clip keys from a zeroed pose; loops end exactly at start values

TO ADD A CLIP: write a pose function `def _my_clip(t, P)` where t is 0..1
through the clip and P posts bone transforms, then register it in CLIPS
at the bottom. Re-run this script + 03_export_glb.py.
"""
import bpy
import math
import os

sin, cos, pi = math.sin, math.cos, math.pi
FPS = 24
STEP = 2  # keyframe every N frames (exporter resamples anyway)

rig = bpy.data.objects["AxolotlRig"]
bpy.context.view_layer.objects.active = rig
ad = rig.animation_data if rig.animation_data else rig.animation_data_create()

GILLS = [f"gill_{i}_{s}" for i in (1, 2, 3) for s in ("L", "R")]
TAIL = [f"tail_{i}" for i in (1, 2, 3, 4)]


class Poser:
    """Collects per-frame bone transforms, then keyframes exactly those."""

    def __init__(self):
        self.touched = {}

    def rot(self, bone, x=0.0, y=0.0, z=0.0):
        pb = rig.pose.bones[bone]
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (x, y, z)
        self.touched.setdefault(bone, set()).add("rotation_euler")

    def loc(self, bone, x=0.0, y=0.0, z=0.0):
        rig.pose.bones[bone].location = (x, y, z)
        self.touched.setdefault(bone, set()).add("location")

    def scale(self, bone, x=1.0, y=1.0, z=1.0):
        rig.pose.bones[bone].scale = (x, y, z)
        self.touched.setdefault(bone, set()).add("scale")

    def key(self, frame):
        for bone, paths in self.touched.items():
            pb = rig.pose.bones[bone]
            for path in paths:
                pb.keyframe_insert(path, frame=frame)


def zero_pose():
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


def build_clip(name, seconds, pose_fn):
    action = bpy.data.actions.new(name)
    ad.action = action
    zero_pose()
    frames = int(seconds * FPS)
    P = Poser()
    f = 0
    while f <= frames:
        pose_fn(f / frames, P)
        P.key(f + 1)
        f += STEP
    if (frames % STEP) != 0:            # ensure exact final frame
        pose_fn(1.0, P)
        P.key(frames + 1)
    # detach into an NLA track named after the clip
    ad.action = None
    track = ad.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, action)
    track.mute = True
    print(f"CLIP {name}: {frames} frames")


D = math.radians

# ------------------------------------------------------------------ clips
def gill_wave(P, t, amp, speed, sweep=0.0):
    """Undulate the six fronds with per-frond phase; sweep pins them back."""
    for j, name in enumerate(GILLS):
        side = 1 if name.endswith("_L") else -1
        phase = 2 * pi * (j / 6.0)
        P.rot(name, x=side * (sweep + amp * sin(2 * pi * speed * t + phase)))


def _idle(t, P):
    breathe = sin(2 * pi * t)                       # one breath per loop
    P.scale("chest", 1 + 0.02 * breathe, 1 + 0.02 * breathe, 1 + 0.03 * breathe)
    P.rot("head", x=D(2) * sin(2 * pi * t + 0.5))
    P.rot("spine", x=D(1.5) * breathe)
    gill_wave(P, t, D(6), 2)                        # two slow gill waves
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(3) * sin(2 * pi * t - i * 0.6))


def _blink(t, P):
    # quick close, brief hold, open
    v = min(1.0, sin(pi * t) * 1.6)
    s = 1 - 0.85 * v
    P.scale("eye_L", 1, 1, s)
    P.scale("eye_R", 1, 1, s)


def _swim(t, P):
    w = 2 * pi * t                                   # one undulation cycle
    P.rot("spine", x=D(6) * sin(w), z=D(4) * sin(w))
    P.rot("chest", x=D(5) * sin(w + 0.7))
    P.rot("head", x=D(-4) * sin(w + 1.2))
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(14) * sin(w - i * 0.9))      # wave travels down tail
    P.rot("arm_L", x=D(20), z=D(8) * sin(w))         # trailing, small flutter
    P.rot("arm_R", x=D(-20), z=D(-8) * sin(w))
    P.rot("leg_L", x=D(15) * sin(w + pi))
    P.rot("leg_R", x=D(-15) * sin(w + pi))
    gill_wave(P, t, D(8), 1, sweep=D(18))            # gills swept back


def _hop(t, P):
    # anticipation squash -> leap with stretch -> land squash -> settle
    if t < 0.2:
        k = t / 0.2
        P.loc("root", y=-0.12 * k)                   # bone Y == world Z here
        P.scale("root", 1 + 0.08 * k, 1 + 0.08 * k, 1 - 0.12 * k)
    elif t < 0.65:
        k = (t - 0.2) / 0.45
        h = sin(pi * k)
        P.loc("root", y=-0.12 + 0.55 * h)
        st = 1 + 0.10 * h * (1 - k)
        P.scale("root", 1 / st, 1 / st, st)
        P.rot("arm_L", z=D(55 * h))
        P.rot("arm_R", z=D(-55 * h))
        gill_wave(P, t, D(4), 1, sweep=D(-20 * h))   # gills flare up
    else:
        k = (t - 0.65) / 0.35
        s = sin(pi * k)
        P.loc("root", y=-0.10 * s)
        P.scale("root", 1 + 0.06 * s, 1 + 0.06 * s, 1 - 0.08 * s)
        P.rot("arm_L", z=0)
        P.rot("arm_R", z=0)
        gill_wave(P, 0, 0, 0)


def _wave(t, P):
    lift = min(1.0, t * 4, (1 - t) * 4)              # raise, hold, lower
    P.rot("arm_R", x=D(-30 * lift), z=D(-70 * lift) + D(20 * lift) * sin(6 * pi * t))
    P.rot("head", y=D(-8 * lift))
    P.rot("chest", z=D(-4 * lift))
    gill_wave(P, t, D(5), 2)


def _point(t, P):
    # extend right arm forward and hold (runtime aims the whole body)
    k = min(1.0, t * 3)
    e = 1 - (1 - k) ** 3                             # ease-out
    P.rot("arm_R", x=D(-55 * e), z=D(-25 * e))
    P.rot("head", x=D(6 * e))
    P.rot("chest", x=D(4 * e))
    gill_wave(P, t, D(3), 1)


def _curious(t, P):
    k = sin(pi * min(1.0, t * 1.25))                 # tilt in, settle out
    P.rot("head", x=D(4 * k), z=D(18 * k))
    P.rot("chest", x=D(6 * k))
    gill_wave(P, t, D(9), 3)                         # gills perk fast
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(5 * k) * sin(2 * pi * t - i * 0.5))


def _nod(t, P):
    P.rot("head", x=D(14) * sin(4 * pi * min(t, 0.9) / 0.9) * (1 - t * 0.3))
    gill_wave(P, t, D(4), 2)


def _celebrate(t, P):
    spin = 2 * pi * min(1.0, t * 1.4)                # one full spin, then bounce
    P.rot("root", y=spin)
    h = abs(sin(2 * pi * t)) * (1 - t * 0.4)
    P.loc("root", y=0.35 * h)
    P.rot("arm_L", z=D(60))
    P.rot("arm_R", z=D(-60))
    gill_wave(P, t, D(10), 4, sweep=D(-12))
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(10) * sin(4 * pi * t - i * 0.8))


def _sleep(t, P):
    breathe = sin(2 * pi * t)                        # loopable slow breath
    P.rot("head", x=D(18 + 2 * breathe))
    P.rot("chest", x=D(6), z=0)
    P.scale("chest", 1 + 0.03 * breathe, 1 + 0.03 * breathe, 1 + 0.04 * breathe)
    gill_wave(P, t, D(2), 1, sweep=D(10))            # drooped
    P.scale("eye_L", 1, 1, 0.12)
    P.scale("eye_R", 1, 1, 0.12)
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(2) * sin(2 * pi * t - i * 0.4))


def _droop(t, P):
    k = min(1.0, t * 2.5)
    e = 1 - (1 - k) ** 2
    P.rot("head", x=D(14 * e), z=0)
    P.rot("chest", x=D(5 * e))
    gill_wave(P, t, D(2) * e, 1, sweep=D(14 * e))
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(-4 * e))


CLIPS = [
    ("idle",      4.0, _idle,      True),
    ("blink",     0.35, _blink,    False),
    ("swim",      1.2, _swim,      True),
    ("hop",       0.9, _hop,       False),
    ("wave",      1.4, _wave,      False),
    ("point",     1.0, _point,     False),   # hold last frame at runtime
    ("curious",   1.2, _curious,   False),
    ("nod",       0.9, _nod,       False),
    ("celebrate", 1.6, _celebrate, False),
    ("sleep",     4.0, _sleep,     True),
    ("droop",     1.5, _droop,     False),   # hold last frame at runtime
]

for name, seconds, fn, loop in CLIPS:
    build_clip(name, seconds, fn)
zero_pose()

# manifest for the web runtime
import json
manifest = [{"name": n, "seconds": s, "loop": l} for n, s, fn, l in CLIPS]
mpath = os.path.join(os.path.dirname(bpy.data.filepath), "..", "web", "public")
os.makedirs(mpath, exist_ok=True)
with open(os.path.join(mpath, "clips.json"), "w") as f:
    json.dump(manifest, f, indent=2)

out = os.path.join(os.path.dirname(bpy.data.filepath), "axolotl-animated.blend")
bpy.ops.wm.save_as_mainfile(filepath=out)
print("SAVED", out)
