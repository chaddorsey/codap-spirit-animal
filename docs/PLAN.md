# Continuation Plan — start here

You (Claude) are picking up an in-progress project. Read this file, then `README.md`
(architecture + quirks), then `docs/BACKLOG.md` (task details). Don't re-derive
decisions recorded here; verify by running, not by re-researching.

## Mission

A rigged 3D axolotl companion ("spirit animal") floats over CODAP v3 while students
explore data, reacting **wordlessly** (motion, gaze, ?/! emotes) to student actions to
provoke deeper data exploration. Target: CODAP v3 via a **wrapper page** (decided —
plugins cannot render outside their tile; see README quirks for the evidence summary).

## State (verified working as of 2026-07-06)

- **Phases 0–4 complete.** Blender pipeline → `web/public/axolotl.glb` (21-bone rig,
  18 channel-disjoint clips); three.js character runtime with screen-space API;
  live CODAP v3 wrapper: iframe-phone bridge, semantic events, tile geometry with
  offset+scale calibration.
- **Phase 6 done (2026-07-07):** terrain — perch/peek/Kilroy primitives
  targetable at any screen rect (axis-region Kilroy proven live), clipping
  occlusion, nap-on-ledge→fall comedy, 24 behaviors, selfTest 36/36.
  Work order: `docs/PHASE6.md`.
- **Phase 5 done (2026-07-07):** personality system — character bible
  (`docs/CHARACTER.md`), felt-only mood engine, 9 kitten squibs + 2 mischief
  acts (self-undoing REAL tile moves; point-batting via visual doubles from
  v3 axis bounds), reaction variety, 8 new clips (27 total), 21 behaviors,
  selfTest 32/32. Work order: `docs/PHASE5.md`. Open: Chad reviews/names
  the character in CHARACTER.md.
- **Phase 4 done (2026-07-06):** data-driven behavior engine
  (`web/src/behavior-engine.js` + `behaviors.js`) replaced the switchboard —
  arbitration, cooldowns, subtle→overt escalation, cancel-on-student-action.
  Four seed behaviors live-verified (greet, celebrate-first-plot, nudge-empty-graph
  incl. escalation, idle-companion); `__engine.selfTest()` 10/10; debug harness in
  `/codap.html`. Evidence: `docs/verification/phase4/`. Spec: `docs/BEHAVIORS.md`.
- Test console: `web/` → `/` (character) and `/codap.html` (live CODAP wrapper).
- Everything is scripted/reproducible; no manual Blender edits anywhere.

## First: verify your environment (10 min)

```bash
cd web && npm install && npm run dev -- --host   # then open :5199/ and /codap.html
```

Console page: click around (swim), try clips/emotes. Wrapper page: create a document
and a graph in CODAP; the axolotl should emote !, hop, swim to the graph, peer at it.
If Blender ≥4.2 is installed, also rebuild the asset once (commands in README) to
confirm the pipeline runs on this machine. If no Blender, web work still proceeds —
the glb is committed.

## Work queue, in order

1. **Emote glyph gap** (BACKLOG #1) — quick, isolated in `web/src/emotes.js`.
2. **Proposed behaviors** (BACKLOG #0) — extend `web/src/behaviors.js` per
   `docs/BEHAVIORS.md` + `docs/PLAYBOOK-behaviors.md`. One entry each; the
   engine and clips are done. `glance-at-selection` and `follow-attribute-drag`
   restore the retired spike reactions — do those first.
3. **Gesture polish** (BACKLOG, optional) — clip tuning per `docs/PLAYBOOK-clips.md`.

Completed queues: eye glints, limb extension + clips, **Phase 4 behavior engine +
both playbooks** (work order was `docs/PHASE4.md`; every acceptance box verified —
evidence in `docs/verification/phase4/`).

## Working agreements

- Pipeline changes go in `pipeline/*.py` (deterministic, re-runnable); never hand-edit
  .blend files. Asset chain: 01 → 02 → 03, then reload the page.
- Respect the clip channel-layering contract (header of `02_build_clips.py`).
- Verify visually (screenshot via browser automation) before declaring anything done;
  test at devicePixelRatio 2 as well — dpr-1 headless capture hides Retina bugs.
- Commit per milestone with substantive messages; push to
  https://github.com/chaddorsey/codap-spirit-animal (master).
- Expensive-model budget is limited: spend top-tier reasoning on rig/animation math,
  engine design, and playbook authoring; delegate research and template-following work
  to cheaper subagents when available.
