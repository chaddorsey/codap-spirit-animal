# Backlog

## Queued

1. **Emote glyph fix** — `?` and `!` need a larger visible gap between the downstroke
   and the bottom point/dot. The helvetiker_bold font renders them nearly touching at
   our extrusion size. Options: geometrically separate (split TextGeometry per part and
   spread), switch font, or build the glyphs from primitives in `web/src/emotes.js`.
   Web-only — no Blender needed.

2. **Gesture polish** (optional) — wave arm could clear the cheek a bit more; point
   could extend straighter. Tune the `P.aim()` direction vectors in
   `02_build_clips.py` (see DONE notes below), rebuild 02→03, verify in console.

## Done (2026-07-06, second pass)

- Eye glints reseated on the pupil face (constraint math in `01_build_rig.py`).
- Limbs +40% from true shoulder/hip anchors (top of inner face — `limb_ends()`),
  pivots sunk 15% into the body so ~90° rotations stay attached.
- Wrist hinge added: `arm_L/R` + `hand_L/R` with axis-blended weights.
- Clip DSL gained `P.aim(bone, direction, blend)` — world-space limb aiming
  (+X front, +Y character's left, +Z up); all rotations now quaternion channels.
- New/updated clips: wave (human-like, up beside head), point_L/point_R and
  tap_L/tap_R (runtime picks the camera-near arm; `gestureAt`/`tapAt` in
  character.js turn 3/4 toward the target), scratch (chin), dance (loop),
  celebrate (full-V arms). 16 clips total.

## Later

- Behavior engine (Phase 4): utility/state-machine over bridge events, subtle→overt
  escalation, anti-annoyance cooldowns; behavior spec table; playbooks for adding
  clips/behaviors with cheaper models.
- Calibration wizard: drag-the-axolotl-onto-a-tile-corner to solve offset+scale
  (host page cannot measure inside the cross-origin CODAP iframe).
- `point` gesture reads subtly in profile (arm hides behind body) — tune clip.
- Auto-detect CODAP workspace scale if/when an API for it exists.
