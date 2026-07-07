# Backlog

## Queued

0. ~~Proposed behaviors~~ — DONE 2026-07-07: all 8 originally-proposed
   behaviors (selection glance, drag-follow, suggest-graph, milestones…). Each
   is a one-entry change via `docs/PLAYBOOK-behaviors.md`; all needed clips
   exist. Good cheap-model tasks.

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

## Done (2026-07-06, Phase 4)

- Behavior engine shipped (`web/src/behavior-engine.js` + `web/src/behaviors.js`):
  one-at-a-time arbitration, priority, cooldowns, subtle→overt escalation,
  cancel-on-student-action (<1s, live-measured 109–175ms). Four seed behaviors
  live-verified against CODAP v3.0.3 (`docs/verification/phase4/`);
  `window.__engine.selfTest()` 10/10. Debug harness in `/codap.html` (live state,
  force-fire, simulated events). Spec table `docs/BEHAVIORS.md`; playbooks
  `docs/PLAYBOOK-behaviors.md` + `docs/PLAYBOOK-clips.md`.
- v3 finding: `component … attributeChange` notifications exist and fire on axis
  assignment — celebrate/nudge triggers need no workarounds.

## Later

- Calibration wizard: drag-the-axolotl-onto-a-tile-corner to solve offset+scale
  (host page cannot measure inside the cross-origin CODAP iframe).
- `point` gesture reads subtly in profile (arm hides behind body) — tune clip.
- Auto-detect CODAP workspace scale if/when an API for it exists.
