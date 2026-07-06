# Backlog

## Queued (requested 2026-07-06, not yet started)

1. **Eye glint alignment** — the sub-pupils (the two white glint spheres per eye) are
   separated from the main pupil and sit too low / misaligned. Likely fallout from the
   eye-leveling step in `01_build_rig.py` (it slides all three islands per side by the
   same delta — verify the glints belong to the island sets being moved, and check
   whether the *largest* island per side is actually the eyeball) or an authored offset
   exposed by the straight-on camera. Fix in the pipeline, then rebuild 01→02→03.

2. **Longer limbs + richer gestures** — lengthen arms and legs ~40% (keep cute
   proportions). Allow shoulder/hip rotation up to 90° so limbs can extend into the
   body plane. Approach: scale limb island geometry along the bone axis in
   `01_build_rig.py` after classification (mirror the eye-leveling pattern), then
   re-place bones from the stretched geometry.

3. **New/updated clips using the longer limbs** (in `02_build_clips.py`, follow the
   channel-layering rules in its header): point (fuller extension), wave (bigger arc),
   **tap** (tap on something in front — for tapping on CODAP tiles), celebrate
   (arms fully up), **scratch-chin** (thinking), **dance**.

4. **Emote glyph fix** — `?` and `!` need a larger visible gap between the downstroke
   and the bottom point/dot. The helvetiker_bold font renders them nearly touching at
   our extrusion size. Options: geometrically separate (split TextGeometry per part and
   spread), switch font, or build the glyphs from primitives in `web/src/emotes.js`.

## Later

- Behavior engine (Phase 4): utility/state-machine over bridge events, subtle→overt
  escalation, anti-annoyance cooldowns; behavior spec table; playbooks for adding
  clips/behaviors with cheaper models.
- Calibration wizard: drag-the-axolotl-onto-a-tile-corner to solve offset+scale
  (host page cannot measure inside the cross-origin CODAP iframe).
- `point` gesture reads subtly in profile (arm hides behind body) — tune clip.
- Auto-detect CODAP workspace scale if/when an API for it exists.
