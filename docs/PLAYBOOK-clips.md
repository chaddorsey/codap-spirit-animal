# Playbook — adding an animation clip

Recipe for adding one clip to the axolotl's library. Requires Blender ≥4.2 on
PATH (tested 5.1.2). Everything is scripted — **never hand-edit .blend files**.

## Files you touch

| File | What |
|---|---|
| `pipeline/02_build_clips.py` | **The only required change** — one pose function + one `CLIPS` row |
| `web/src/behaviors.js` | Optionally, the behavior that plays your clip |

`clips.json` is **generated** by 02 (manifest at the bottom of the script) —
never edit it by hand. `01_build_rig.py` and `03_export_glb.py` stay untouched
unless you're changing the skeleton (you're not).

## The layering contract (breaking it breaks runtime composition)

- body clips (idle, swim, hop…) **never key eye bones**
- eye clips (blink) key **only** eye bones
- only hop / celebrate / dance key **root** location/scale/rotation
- every clip keys from a zeroed pose; **loops end exactly at start values**

The runtime layers blink/gaze/gesture over locomotion because of these rules.

## Steps

1. In `02_build_clips.py`, write a pose function near its siblings:

   ```python
   def _my_clip(t, P):          # t runs 0..1 through the clip
       e = ease(t)              # helpers already in the file: ease, pulse, D (degrees)
       P.rot("head", x=D(10 * e))            # Euler-degrees rotation
       P.aim("arm_L", (1, 0.4, 0.6), e)      # world-space limb aim: +X front,
                                             # +Y character's left, +Z up; blend 0..1
       gill_wave(P, t, D(3), 1)              # idle gill motion keeps it alive
   ```

   Bones: `head`, `chest`, `arm_L/R`, `hand_L/R`, `leg_L/R`, `foot_L/R`,
   `tail_1..4`, `gill_1..3_L/R`, `eye_L/R` (eye bones: blink only!).
   `P.rot/aim/loc/scale` only touch what you call — untouched bones stay free
   for other layers. Left/right pairs: write `_my_for(side)` returning the pose
   fn (see `_tap_for`/`_point_for`).

2. Register it in the `CLIPS` list at the bottom:
   `("my_clip", 1.2, _my_clip, False)` → (name, seconds, fn, loop).
   Names use underscores, never dots (three.js strips dots).

3. Rebuild (from the repo root — 01 only needed if you never built locally):

   ```bash
   B=/Applications/Blender.app/Contents/MacOS/Blender
   $B -b assets/axolotl-rigged.blend   -P pipeline/02_build_clips.py   # clips + clips.json
   $B -b assets/axolotl-animated.blend -P pipeline/03_export_glb.py    # web/public/axolotl.glb
   ```

4. Verify in the console page:

   ```bash
   cd web && npm run dev -- --host      # open http://localhost:5199/
   ```

   Click your clip's button (the console lists every clip from clips.json).
   Check: plays fully, returns cleanly to idle, no foot/hand detaching, no eye
   glitch while blinking during it. **Screenshot at devicePixelRatio 2 as well**
   — dpr-1 headless capture hides Retina-only artifacts.

5. If a behavior should use it: `actor.play('my_clip')` (one-shot) or
   `actor.play('my_clip', { hold: true })` + later `actor.release()` for
   held poses. Loops belong in `setBase` only.

## Common failure modes

| Symptom | Cause / fix |
|---|---|
| Clip plays but eyes/gaze go dead during it | You keyed `eye_L/R` from a body clip — remove those channels (layering contract). |
| Character pops at loop point | Loop doesn't end at its start values; make the pose fn periodic in `t` (`sin(2π·t)`-style), not one-way. |
| Limb detaches / hyperextends | Aim direction too extreme for the pivot; blend the aim in/out with `e` and keep rotations ≲100°. |
| Clip missing in the web console | `CLIPS` row not added, or 03 not re-run after 02 (the glb still has the old animation list). |
| Runtime picks the wrong arm | Handedness is chosen by the *runtime* (`gestureAt`/`tapAt` pick the camera-near arm). Author both `_L` and `_R` variants. |
| Blender exits with a Python error mid-script | Read the traceback line in the 02 output — usually a bone-name typo; nothing was saved, just fix and re-run. |
| New clip looks right in Blender but wrong on the web | The exporter resamples (`STEP = 2` keying) — very fast spikes need shorter STEP or longer duration. |
