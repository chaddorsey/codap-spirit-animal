"""Author the animation clip library on the rigged axolotl.

Run:  blender -b assets/axolotl-rigged.blend -P pipeline/02_build_clips.py
Writes: assets/axolotl-animated.blend

Each clip is a Blender action pushed to its own NLA track (track name ==
clip name) so the glTF exporter emits them as separate animations.

LAYERING RULES (runtime depends on these -- keep them when adding clips):
- body clips (idle, swim, hop, ...) never key eye bones
- eye clips (blink) key ONLY eye bones
- only hop/celebrate/dance/tinkerbell/nod_L/nod_R and the Phase 5 squibs
  (stretch/pounce/roll/startle/proud) key root loc/scale/rot
- every clip keys from a zeroed pose; loops end exactly at start values

Arms have a wrist hinge: arm_L/arm_R (upper) + hand_L/hand_R (outer third).

TO ADD A CLIP: write a pose function `def _my_clip(t, P)` where t is 0..1
through the clip and P posts bone transforms, then register it in CLIPS
at the bottom. Re-run this script + 03_export_glb.py.
"""
import bpy
import math
import os
from mathutils import Euler, Quaternion, Vector

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
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Euler((x, y, z), 'XYZ').to_quaternion()
        self.touched.setdefault(bone, set()).add("rotation_quaternion")

    def aim(self, bone, direction, blend=1.0, twist=0.0):
        """Rotate a bone so it points along `direction` in armature space
        (+X = character front, +Y = character's left, +Z = up).
        blend 0..1 slerps from rest toward the aim — use for ease-in/out.
        twist (radians) spins the bone about its own axis on top of the aim
        (e.g. turning the head left/right, since the head bone points up).
        Assumes ancestors are near rest; fine for limb/head gestures."""
        pb = rig.pose.bones[bone]
        pb.rotation_mode = 'QUATERNION'
        rest3 = pb.bone.matrix_local.to_3x3()
        y_rest = rest3 @ Vector((0, 1, 0))           # bone axis at rest
        q = y_rest.rotation_difference(Vector(direction).normalized())
        local = (rest3.inverted() @ q.to_matrix() @ rest3).to_quaternion()
        local = Quaternion().slerp(local, max(0.0, min(1.0, blend)))
        if twist:
            local = local @ Quaternion(Vector((0, 1, 0)), twist)
        pb.rotation_quaternion = local
        self.touched.setdefault(bone, set()).add("rotation_quaternion")

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
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
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
    sway = 0.35 * sin(6 * pi * t)
    P.aim("arm_R", (0.28, -0.82 - sway, 0.62), blend=lift)   # up beside the head,
                                                             # wider to clear the cheek
    P.aim("hand_R", (0.32, -0.38 - sway, 0.88), blend=lift)  # hand flaps along
    P.rot("head", y=D(-8 * lift))
    P.rot("chest", z=D(-4 * lift))
    gill_wave(P, t, D(5), 2)


# point/tap come in _L and _R variants: the runtime gestures with the
# camera-near arm (far arm hides behind the body in profile)
def _point_for(side):
    s = 1 if side == "L" else -1
    def fn(t, P):
        k = min(1.0, t * 3)
        e = 1 - (1 - k) ** 3                         # ease-out
        # straighter line arm->finger, slightly raised so the arm silhouettes
        # clear of the body when the runtime turns 3/4 toward the target
        P.aim(f"arm_{side}", (0.97, s * 0.20, 0.18), blend=e)
        P.aim(f"hand_{side}", (1.0, s * 0.15, 0.10), blend=e)
        P.rot("head", x=D(6 * e))
        P.rot("chest", x=D(6 * e))
        gill_wave(P, t, D(3), 1)
    return fn


def _tap_for(side):
    s = 1 if side == "L" else -1
    def fn(t, P):
        # raise the arm to ~90 deg from the body -- horizontal and straight out
        # to the side so it reads clearly on the front camera -- hold it there,
        # THEN flick the hand forward to tap twice
        reach = min(1.0, t * 3.5, (1 - t) * 3.5)
        P.rot("chest", x=D(8 * reach))
        P.rot("head", x=D(4 * reach))
        P.aim(f"arm_{side}", (0.15, s * 0.98, 0.05), blend=reach)   # straight out, horizontal
        taps = max(0.0, sin(4 * pi * min(max((t - 0.35) / 0.5, 0), 1)))
        P.aim(f"hand_{side}", (0.70, s * 0.50, -0.45), blend=reach * taps)  # flick forward to tap
        gill_wave(P, t, D(4), 2)
    return fn


def _scratch(t, P):
    # thinking: tilt head, bring hand up near the chin, scratch three times
    k = min(1.0, t * 3, (1 - t) * 3)
    P.rot("head", x=D(10 * k), z=D(-12 * k))
    P.rot("chest", x=D(4 * k))
    P.aim("arm_R", (0.60, -0.30, 0.74), blend=k)             # raise toward chin
    scr = sin(6 * pi * min(max((t - 0.25) / 0.55, 0), 1))    # three strokes
    P.aim("hand_R", (0.45, -0.15 + 0.12 * scr, 0.88), blend=k)
    gill_wave(P, t, D(4), 1.5)
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(4 * k) * sin(2 * pi * t - i * 0.5))


def _dance(t, P):
    # loopable bop: bounce, sway, alternating full-extension arm raises
    w = 2 * pi * t                                    # one full sway per loop
    bounce = abs(sin(2 * w))
    P.loc("root", y=0.10 * bounce)
    P.scale("root", 1 + 0.03 * bounce, 1 + 0.03 * bounce, 1 - 0.04 * bounce)
    P.rot("root", y=D(14) * sin(w))
    P.rot("spine", z=D(8) * sin(w))
    P.rot("chest", z=D(-6) * sin(w))
    P.rot("head", z=D(-8) * sin(w))
    raise_l = 0.5 + 0.5 * sin(w)                     # alternate full raises
    raise_r = 0.5 + 0.5 * sin(w + pi)
    P.aim("arm_L", (0.20, 0.55, 0.81), blend=raise_l)
    P.aim("arm_R", (0.20, -0.55, 0.81), blend=raise_r)
    P.aim("hand_L", (0.3, 0.25, 0.92), blend=raise_l)
    P.aim("hand_R", (0.3, -0.25, 0.92), blend=raise_r)
    P.rot("leg_L", x=D(18) * sin(2 * w))
    P.rot("leg_R", x=D(-18) * sin(2 * w))
    gill_wave(P, t, D(10), 4)
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(8) * sin(2 * w - i * 0.7))


def _curious(t, P):
    k = sin(pi * min(1.0, t * 1.25))                 # tilt in, settle out
    P.rot("head", x=D(4 * k), z=D(18 * k))
    P.rot("chest", x=D(6 * k))
    gill_wave(P, t, D(9), 3)                         # gills perk fast
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(5 * k) * sin(2 * pi * t - i * 0.5))


# Nods are authored with aim(): the head bone points straight up, so a true
# "yes" nod = tipping the bone axis toward the body's front (+X) and back to
# vertical. Side variants add twist (spin about the bone's own axis) to face
# a viewing angle first — axis-guessing-proof, unlike raw euler channels.
def _nod(t, P):
    # two forward tips, chin toward chest, returning to vertical
    env = min(max(t / 0.9, 0), 1)
    a = D(22) * abs(sin(2 * pi * env)) * (1 - 0.25 * env)
    P.aim("head", (sin(a), 0, cos(a)))
    gill_wave(P, t, D(4), 2)


# nod_L / nod_R: the WHOLE BODY turns ~15 deg toward a side (indicating the
# nod target and making the pitch visible), then the head tips forward and
# back — pure pitch, crown stays upright (aim() has no roll component).
def _nod_for(side):
    s = 1 if side == "L" else -1
    def fn(t, P):
        turn = min(1.0, t * 4, (1 - t) * 4)          # turn in, hold, return
        nod_env = min(max((t - 0.25) / 0.55, 0), 1)
        a = D(24) * abs(sin(2 * pi * nod_env))       # two forward tips
        P.rot("root", y=D(15 * s) * turn)            # body yaws toward target
        P.aim("head", (sin(a), 0, cos(a)))           # forward tip only
        gill_wave(P, t, D(4), 2)
    return fn


# --- tinkerbell choreography ---------------------------------------------
# dip to prep -> fly up one body length at 15deg left -> quick bob ->
# loop-the-loop: a circle 1.5 body-lengths across whose LEFT edge is tangent
# to the body line at the bob point (so the circle lies to her right); the
# body rolls a full 360 tracking the path, head leading, tail trailing ->
# land back at the takeoff point with a big bob and settling bobs.
#
# Worked in standard screen frame (x=right, y=up), converted to root-bone
# local coords at the end (root loc z = screen-LEFT, loc y = up, rot x =
# screen-plane roll, positive = counterclockwise/lean-left).
#
# The HEAD CENTER traces the circle (CLOCKWISE, 1.75 BL diameter), entered
# at the circle's left edge — the bob point — where the tangent equals the
# body line; the center therefore sits to her right. The body hangs tangent
# behind the head (pivot = head - L * velocity direction) and the roll
# tracks the tangent continuously through -360 degrees.
_TK_BL = 3.0                                  # one body length, armature units
_TK_L = 1.55                                  # root pivot -> head center distance
_TK_R = 0.875 * _TK_BL                        # radius (1.75 BL diameter)
_TK_ANG = D(15)
_TK_P2 = (-sin(_TK_ANG) * _TK_BL, cos(_TK_ANG) * _TK_BL)   # pivot after ascent
_TK_H0 = (_TK_P2[0] - _TK_L * sin(_TK_ANG),   # head center at circle entry
          _TK_P2[1] + _TK_L * cos(_TK_ANG))
_TK_C = (_TK_H0[0] + _TK_R * cos(_TK_ANG),    # center to her right (clockwise)
         _TK_H0[1] + _TK_R * sin(_TK_ANG))
_TK_A0 = pi + _TK_ANG                         # entry position angle (left edge)

# --- overshoot exit: leave the circle 5 deg shy of a full revolution and
# continue straight along the tangent, easing to an apex where the TAIL
# reaches the height the HEAD TOP had at circle entry; then pivot upright
# while easing into a drop back to the takeoff point (tail at its original
# sitting height), and settle with decreasing bobs.
_TK_SWEEP = 2 * pi - D(5)                     # 355 degrees of circle travel
_TK_AX = _TK_A0 - _TK_SWEEP                   # exit position angle
_TK_VX = (sin(_TK_AX), -cos(_TK_AX))          # exit tangent (up, ~20deg left)
_TK_PX = (_TK_C[0] + _TK_R * cos(_TK_AX) - _TK_L * _TK_VX[0],   # exit pivot
          _TK_C[1] + _TK_R * sin(_TK_AX) - _TK_L * _TK_VX[1])
_TK_TAIL = 1.38                               # tail tip below pivot, rest pose
_TK_HEADTOP = 2.0                             # head top above pivot, rest pose
_TK_HT0 = _TK_P2[1] + _TK_HEADTOP * cos(_TK_ANG)   # head-top height at entry
# settle arc: a ballistic mini-arc from the circle exit to the bob point —
# constant horizontal drift, parabolic height fitted so the apex puts the
# tail (hanging below an upright body) at the circle-entry head-top height
_TK_YAPEX = _TK_HT0 + _TK_TAIL - 0.5 * _TK_BL   # half BL below head-top mark
_d = _TK_P2[1] - _TK_PX[1]
_m = _d + 2 * (_TK_PX[1] - _TK_YAPEX)
_TK_ARC_A = _m - math.sqrt(_m * _m - _d * _d)      # parabola y = y0 + Bk + Ak^2
_TK_ARC_B = _d - _TK_ARC_A
_TK_KAPEX = -_TK_ARC_B / (2 * _TK_ARC_A)           # apex time within the arc

# gravity layer over the circle: angular speed dips as she climbs to the top
# (0-90 deg of revolution) and recovers symmetrically (90-180 deg), riding on
# the uniform base; below the horizontal (180-355) speed is uniform. Applied
# as a time-warp so the path itself is untouched.
_TK_GRAV_M = 0.15                              # slight: 15% dip at the top
def _tk_speed(g):
    phi = g * (_TK_SWEEP / pi * 180.0) if False else g * 355.0
    return 1 - _TK_GRAV_M * sin(pi * min(phi, 180.0) / 180.0)
_TK_N = 257
_taus = [0.0]
for _i in range(1, _TK_N):
    _gm = (_i - 0.5) / (_TK_N - 1)
    _taus.append(_taus[-1] + 1.0 / _tk_speed(_gm))
_TK_GT = [_t / _taus[-1] for _t in _taus]      # normalized time at g = i/(N-1)
def _tk_gwarp(u):
    u = max(0.0, min(1.0, u))
    lo, hi = 0, _TK_N - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if _TK_GT[mid] < u: lo = mid
        else: hi = mid
    t0, t1 = _TK_GT[lo], _TK_GT[hi]
    f = (u - t0) / (t1 - t0) if t1 > t0 else 0.0
    return (lo + f) / (_TK_N - 1)



def _smooth(k):
    k = max(0.0, min(1.0, k))
    return k * k * (3 - 2 * k)


def _tinkerbell(t, P):
    x = y = 0.0                               # position, std screen frame
    roll = 0.0                                # lean, radians; + = lean left
    # three equal beats: PREP [0, 1/3) -- CIRCLE [1/3, 2/3) -- SETTLE [2/3, 1]
    T1, T2 = 0.3224, 0.5748   # circle 1.07s; shelf pause 0.16s
    if t < 0.0768:                            # prep: dip + cartoony SCRUNCH,
        k = t / 0.0768                        # held compressed at the bottom
        y = -0.30 * _smooth(k)
        b = _smooth(k)
        P.scale("root", 1 + 0.10 * b, 1 + 0.10 * b, 1 - 0.16 * b)
    elif t < 0.2413:                          # prep: SPRING straight up the
        k = (t - 0.0768) / 0.1645             # angled line to the shelf
        e = 1 - (1 - k) ** 2.5                # explosive start, soft arrival
        x = _TK_P2[0] * e
        y = -0.30 + (_TK_P2[1] + 0.30) * e
        roll = _TK_ANG * e                    # lean matches the travel line
        if k < 0.06:                          # scrunch pops into launch stretch
            st = 0.84 + (1.20 - 0.84) * (k / 0.06)
        else:                                 # stretch relaxes by mid-flight
            st = 1 + 0.20 * max(0.0, 1 - (k - 0.06) / 0.38)
        sxy = 1 / st ** 0.5
        P.scale("root", sxy, sxy, st)
    elif t < 0.2797:                            # prep: settle onto the padded shelf
        k = (t - 0.2413) / 0.0384        # one slight settle, no bounce
        x, y = _TK_P2
        y += -0.12 * sin(pi * k)
        roll = _TK_ANG
    elif t < T1:                              # prep: spring wind-up — compress
        k = (t - 0.2797) / (T1 - 0.2797)        # back along the launch tangent
        d = 0.13 * _smooth(k)
        x = _TK_P2[0] + sin(_TK_ANG) * d
        y = _TK_P2[1] - cos(_TK_ANG) * d
        roll = _TK_ANG - D(5) * _smooth(k)    # slight extra back-lean
    elif t < T2:                              # the circle: head center rides it
        kr = (t - T1) / (T2 - T1)             # clockwise, 355 degrees
        # springy release: fast attack, gradual slowdown over the last
        # quarter-turn, small residual speed into the settle arc
        # springy ramp over the first 12%, then dead-constant velocity all
        # the way to the handoff (no easing anywhere after max speed)
        _a = 0.12
        _v = 1 / (1 - _a / 2)
        k = _v * kr * kr / (2 * _a) if kr < _a else _v * (_a / 2 + (kr - _a))
        k = _tk_gwarp(k)                      # gravity layer (see table above)
        a = _TK_A0 - _TK_SWEEP * k
        hx = _TK_C[0] + _TK_R * cos(a)
        hy = _TK_C[1] + _TK_R * sin(a)
        x = hx - _TK_L * sin(a)               # pivot trails head along velocity
        y = hy + _TK_L * cos(a)
        rel = max(0.0, 1 - k / 0.05)          # spring compression evaporates
        x += sin(_TK_ANG) * 0.13 * rel
        y -= cos(_TK_ANG) * 0.13 * rel
        roll = a - pi                         # body tangent to the path
        for i, name in enumerate(TAIL):       # tail whips, trailing the arc
            P.rot(name, x=D(16) * sin(4 * pi * k - i * 1.0))
    elif t < 0.8212:                            # settle: ballistic mini-arc from
        k = (t - T2) / (0.8212 - T2)            # circle exit up over the apex and
        k = 1 - (1 - k) ** 3                  # sharper ease-out once off the circle
        x = _TK_PX[0] + (_TK_P2[0] - _TK_PX[0]) * k     # down to the bob point
        y = _TK_PX[1] + _TK_ARC_B * k + _TK_ARC_A * k * k
        upr = min(1.0, k / _TK_KAPEX)         # upright by the apex
        roll = (_TK_AX - pi) + (-2 * pi - (_TK_AX - pi)) * upr
    else:                                     # three descending bounces to rest:
        k = (t - 0.8212) / 0.1789                 # 0.2 BL, then gently damping
        x, y = _TK_P2
        seg = min(2.999, k * 3)
        i = int(seg)
        f = seg - i
        y += (0.60, 0.34, 0.16)[i] * sin(pi * f)
        b = (0.5, 0.3, 0.15)[i] * max(0.0, cos(pi * f)) ** 2   # contact squash
        P.scale("root", 1 + 0.05 * b, 1 + 0.05 * b, 1 - 0.07 * b)
        roll = -2 * pi                        # upright (identity)
    # the clip's rest frame is the BOB POINT (where the revolution begins):
    # she settles there, elevated, and the runtime shifts her screen anchor
    # by the same offset at launch (meta.anchorShift) so takeoff stays
    # seamless and the clip still ends at zeroed pose
    x -= _TK_P2[0]
    y -= _TK_P2[1]
    P.loc("root", z=-x, y=y)                  # std x=right -> root z=left
    P.rot("root", x=roll)                     # screen-plane roll
    # flight dressing: gills stream, arms dangle/flap
    flying = 0.07 <= t < 0.92
    if flying:
        P.rot("arm_L", x=D(18) + D(10) * sin(10 * pi * t), z=D(8) * sin(9 * pi * t))
        P.rot("arm_R", x=D(-18) - D(10) * sin(10 * pi * t + 1), z=D(-8) * sin(9 * pi * t + 1))
        gill_wave(P, t, D(12), 7, sweep=D(10))
    else:
        P.rot("arm_L", x=0, z=0)
        P.rot("arm_R", x=0, z=0)
        gill_wave(P, t, D(5), 2)


# --- Phase 5 kitten squib clips (see docs/CHARACTER.md timing rules) ------

def _stretch(t, P):
    # post-nap cat stretch: reach forward-low, butt up, quiver, release+shake
    if t < 0.4:
        e = _smooth(t / 0.4)
    elif t < 0.7:
        e = 1.0 + 0.03 * sin(10 * pi * t)            # held, quivering at max
    else:
        e = 1 - _smooth((t - 0.7) / 0.3)
    P.rot("chest", x=D(-14 * e))                     # back arches
    P.rot("spine", x=D(10 * e))                      # butt up
    P.rot("head", x=D(-14 * e))                      # chin skyward
    # arms reach down-and-out (lateral so the stretch reads on the
    # front-facing ortho camera — pure-forward foreshortens to nothing)
    P.aim("arm_L", (0.45, 0.55, -0.70), blend=e)
    P.aim("arm_R", (0.45, -0.55, -0.70), blend=e)
    P.scale("root", 1, 1 + 0.06 * e, 1)              # elongate
    shake = D(6) * sin(14 * pi * t) if t > 0.82 else 0   # release shake
    P.rot("root", y=shake)
    gill_wave(P, t, D(3 + 6 * e), 1, sweep=D(-8 * e))
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(-8 * e) + D(3) * sin(2 * pi * t - i * 0.5))


def _head_tilt(t, P):
    # the unfamiliar-thing double tilt: right, through center, further left
    if t < 0.3:
        z = 24 * _smooth(t / 0.3)
    elif t < 0.45:
        z = 24                                        # hold the first tilt
    elif t < 0.75:
        z = 24 - 46 * _smooth((t - 0.45) / 0.3)       # swing through to -22
    else:
        z = -22 * (1 - _smooth((t - 0.75) / 0.25))    # settle out
    P.rot("head", z=D(z), x=D(3))
    gill_wave(P, t, D(9), 3)                          # gills perked, listening
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(4) * sin(2 * pi * t - i * 0.5))


def _pounce(t, P):
    # crouch-back anticipation -> spring forward with arms out -> overshoot
    # wobble -> recover to start (comic rule 2: enthusiasm outruns skill)
    if t < 0.3:                                       # coiled crouch
        k = _smooth(t / 0.3)
        P.loc("root", x=-0.10 * k, y=-0.14 * k)
        P.scale("root", 1 + 0.07 * k, 1 + 0.07 * k, 1 - 0.10 * k)
        P.rot("spine", x=D(8 * k))
    elif t < 0.6:                                     # the spring
        k = _smooth((t - 0.3) / 0.3)
        P.loc("root", x=-0.10 + 0.62 * k, y=-0.14 + 0.44 * sin(pi * k))
        st = 1 + 0.12 * sin(pi * k)
        P.scale("root", 1 / st, 1 / st, st)
        P.aim("arm_L", (0.95, 0.30, -0.15), blend=k)  # paws out front
        P.aim("arm_R", (0.95, -0.30, -0.15), blend=k)
        gill_wave(P, t, D(4), 1, sweep=D(-22 * k))    # gills flare back
    elif t < 0.8:                                     # landing wobble
        k = (t - 0.6) / 0.2
        P.loc("root", x=0.52 + 0.06 * sin(3 * pi * k) * (1 - k), y=-0.06 * sin(pi * k))
        w = 1 + 0.08 * sin(2 * pi * k) * (1 - k)
        P.scale("root", w, w, 1 / w)
        P.rot("root", y=D(10) * sin(2 * pi * k) * (1 - k))
    else:                                             # trot back to start
        k = _smooth((t - 0.8) / 0.2)
        P.loc("root", x=0.52 * (1 - k))
        P.rot("arm_L", x=0); P.rot("arm_R", x=0)
        gill_wave(P, t, D(6), 2)


def _roll(t, P):
    # high-trust barrel roll: over onto the back, limb wiggle at the apex,
    # complete the rotation and pop upright
    spin = 2 * pi * _smooth(min(1.0, t * 1.25))       # full roll, eased
    P.rot("root", x=spin)
    apex = max(0.0, sin(pi * min(1.0, t * 1.25)))     # 1 when upside-down
    P.loc("root", y=0.15 * apex)
    wig = sin(8 * pi * t) * apex                      # paws paddling the air
    P.rot("arm_L", x=D(40 * apex + 12 * wig))
    P.rot("arm_R", x=D(-40 * apex - 12 * wig))
    P.rot("leg_L", x=D(30 * apex - 12 * wig))
    P.rot("leg_R", x=D(-30 * apex + 12 * wig))
    gill_wave(P, t, D(8), 3)
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(10 * apex) * sin(4 * pi * t - i * 0.7))


def _startle(t, P):
    # fearless -> startled flip: instant recoil-jump, gills flared, then
    # immediate curious recovery (rule 4: setbacks last under 2 seconds)
    jump = sin(pi * min(1.0, t * 2.5)) if t < 0.4 else 0.0
    # vertical pop + shiver (depth recoil is invisible to the ortho camera)
    P.loc("root", y=0.26 * jump)
    P.rot("root", y=D(6) * sin(20 * pi * t) * jump)   # startled shiver
    P.scale("root", 1 - 0.06 * jump, 1 - 0.06 * jump, 1 + 0.10 * jump)  # stretch tall
    P.rot("chest", x=D(-12 * jump))                   # reared back
    P.rot("arm_L", z=D(55 * jump))                    # arms splay
    P.rot("arm_R", z=D(-55 * jump))
    gill_wave(P, t, D(2), 1, sweep=D(-30 * jump))     # gills flare hard
    if t >= 0.4:                                      # recovery: lean back in
        k = _smooth((t - 0.4) / 0.6)
        P.rot("head", z=D(14 * sin(pi * k)), x=D(4 * sin(pi * k)))  # curious tilt
        gill_wave(P, t, D(8), 3)
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(12 * jump))                   # tail stiffens


def _proud(t, P):
    # the after-anything beat: chest up, chin up, tiny lift, settle (rule 3)
    k = min(1.0, t * 2.5, (1 - t) * 2.5)
    e = _smooth(k)
    P.rot("chest", x=D(-10 * e))                      # chest out
    P.rot("head", x=D(-14 * e))                       # chin up
    P.loc("root", y=0.08 * e)
    P.scale("chest", 1 + 0.04 * e, 1 + 0.04 * e, 1 + 0.02 * e)
    gill_wave(P, t, D(7), 1.5, sweep=D(-10 * e))      # gills high and slow
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(6 * e) * sin(2 * pi * t - i * 0.4))


def _bat_for(side):
    # kitten paw-bat: raise the paw high-forward, two quick down-across
    # swipes, retract. Faster and swipier than tap; body stays planted.
    s = 1 if side == "L" else -1
    def fn(t, P):
        reach = min(1.0, t * 4, (1 - t) * 4)
        P.rot("chest", x=D(6 * reach))
        P.rot("head", x=D(6 * reach), z=D(-6 * s * reach))   # eyes on the prey
        P.aim(f"arm_{side}", (0.55, s * 0.60, 0.42), blend=reach)  # paw raised
        swipes = max(0.0, sin(4 * pi * min(max((t - 0.25) / 0.55, 0), 1)))
        # swipe down-and-across the front
        P.aim(f"hand_{side}", (0.85, -s * 0.20, -0.45), blend=reach * swipes)
        gill_wave(P, t, D(6), 3)
        for i, name in enumerate(TAIL):
            P.rot(name, x=D(6 * reach) * sin(4 * pi * t - i * 0.6))
    return fn


def _celebrate(t, P):
    spin = 2 * pi * min(1.0, t * 1.4)                # one full spin, then bounce
    P.rot("root", y=spin)
    h = abs(sin(2 * pi * t)) * (1 - t * 0.4)
    P.loc("root", y=0.35 * h)
    P.aim("arm_L", (0.10, 0.55, 0.83))               # arms fully up in a V
    P.aim("arm_R", (0.10, -0.55, 0.83))
    wig = 0.15 * sin(4 * pi * t)
    P.aim("hand_L", (0.15, 0.30 + wig, 0.92))
    P.aim("hand_R", (0.15, -0.30 + wig, 0.92))
    gill_wave(P, t, D(10), 4, sweep=D(-12))
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(10) * sin(4 * pi * t - i * 0.8))


# --- Phase 6 terrain clips -------------------------------------------------

def _perch(t, P):
    # sitting on a ledge: legs tucked forward, tail curled to one side,
    # gentle hunch, slow contented gill sway. Loopable.
    breathe = sin(2 * pi * t)
    P.rot("leg_L", x=D(70))                          # legs tucked up
    P.rot("leg_R", x=D(70))
    P.rot("spine", x=D(6))                           # gentle hunch
    P.rot("chest", x=D(4 + 1.5 * breathe))
    P.rot("head", x=D(-6), z=D(3) * sin(2 * pi * t + 0.7))  # looking about
    P.scale("chest", 1 + 0.02 * breathe, 1 + 0.02 * breathe, 1 + 0.03 * breathe)
    P.rot("arm_L", x=D(25))                          # paws rested forward
    P.rot("arm_R", x=D(-25))
    gill_wave(P, t, D(4), 1)                         # slow, contented
    for i, name in enumerate(TAIL):                  # tail curled to the side
        P.rot(name, z=D(18), x=D(2) * sin(2 * pi * t - i * 0.4))


def _kilroy(t, P):
    # the over-the-wall pose: paws up gripping the ledge, chin just above
    # it, eyes doing all the work. Eases in, then holds (runtime hold:true).
    e = _smooth(min(1.0, t * 2.5))
    P.aim("arm_L", (0.72, 0.40, 0.56), blend=e)      # paws raised to the ledge
    P.aim("arm_R", (0.72, -0.40, 0.56), blend=e)
    P.aim("hand_L", (0.85, 0.20, -0.30), blend=e)    # fingers hooked over
    P.aim("hand_R", (0.85, -0.20, -0.30), blend=e)
    P.rot("head", x=D(4 * e))                        # chin tucked to the edge
    P.rot("chest", x=D(6 * e))
    wob = sin(4 * pi * t) * (1 - 0.5 * e)
    P.rot("spine", z=D(2 * wob))                     # tiny effortful sway
    gill_wave(P, t, D(6), 2)
    for i, name in enumerate(TAIL):
        P.rot(name, x=D(4) * sin(2 * pi * t - i * 0.5))


def _sleep(t, P):
    breathe = sin(2 * pi * t)                        # loopable slow breath
    a = D(24 + 3 * breathe)                          # dozing forward nod, the
    P.aim("head", (sin(a), 0, cos(a)))               # breath riding on it
    P.rot("chest", x=D(6), z=0)
    P.scale("chest", 1 + 0.03 * breathe, 1 + 0.03 * breathe, 1 + 0.04 * breathe)
    gill_wave(P, t, D(2), 1, sweep=D(10))            # drooped
    P.scale("eye_L", 1, 1, 0.45)                     # heavy-lidded, not shut
    P.scale("eye_R", 1, 1, 0.45)
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
    ("wave",      1.6, _wave,      False),
    ("point_L",   1.0, _point_for("L"), False),   # hold last frame at runtime
    ("point_R",   1.0, _point_for("R"), False),
    ("tap_L",     1.4, _tap_for("L"),   False),
    ("tap_R",     1.4, _tap_for("R"),   False),
    ("scratch",   2.2, _scratch,   False),
    ("dance",     2.4, _dance,     True),
    ("curious",   1.2, _curious,   False),
    ("nod",       0.9, _nod,       False),
    ("nod_L",     1.8, _nod_for("L"), False),   # turn head left, then nod yes
    ("nod_R",     1.8, _nod_for("R"), False),   # turn head right, then nod yes
    ("tinkerbell", 4.24, _tinkerbell, False),
    ("celebrate", 1.6, _celebrate, False),
    ("sleep",     4.0, _sleep,     True),
    ("droop",     1.5, _droop,     False),   # hold last frame at runtime
    # Phase 5 kitten squib clips
    ("stretch",   2.0, _stretch,   False),
    ("head_tilt", 1.6, _head_tilt, False),
    ("pounce",    1.3, _pounce,    False),
    ("roll",      2.2, _roll,      False),
    ("startle",   0.8, _startle,   False),
    ("proud",     1.2, _proud,     False),
    ("bat_L",     1.1, _bat_for("L"), False),
    ("bat_R",     1.1, _bat_for("R"), False),
    # Phase 6 terrain clips
    ("perch",     3.5, _perch,     True),
    ("kilroy",    1.6, _kilroy,    False),   # hold last frame at runtime
]

for name, seconds, fn, loop in CLIPS:
    build_clip(name, seconds, fn)
zero_pose()

# the source file ships with a short playback range (1-80) and the glTF
# exporter limits baking to it by default — clips longer than the range
# get frozen at the last frame. Extend the range to cover the longest clip.
longest = max(int(s * FPS) + 1 for _, s, _, _ in CLIPS)
bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = longest
print(f"scene frame range set to 1-{longest}")

# manifest for the web runtime
import json
manifest = [{"name": n, "seconds": s, "loop": l} for n, s, fn, l in CLIPS]
for entry in manifest:
    if entry["name"] == "tinkerbell":
        # net anchor displacement (std screen frame, armature units): the
        # runtime shifts the character's anchor by this at launch, since the
        # clip's rest frame is the elevated bob point
        entry["anchorShift"] = [_TK_P2[0], _TK_P2[1]]
mpath = os.path.join(os.path.dirname(bpy.data.filepath), "..", "web", "public")
os.makedirs(mpath, exist_ok=True)
with open(os.path.join(mpath, "clips.json"), "w") as f:
    json.dump(manifest, f, indent=2)

out = os.path.join(os.path.dirname(bpy.data.filepath), "axolotl-animated.blend")
bpy.ops.wm.save_as_mainfile(filepath=out)
print("SAVED", out)
