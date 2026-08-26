# Continuation Plan — start here

You (Claude) are picking up an in-progress project. Read this file, then `README.md`
(architecture + quirks), then `docs/BACKLOG.md` (task details). Don't re-derive
decisions recorded here; verify by running, not by re-researching.

## Mission

A rigged 3D axolotl companion ("spirit animal") floats over CODAP v3 while students
explore data, reacting **wordlessly** (motion, gaze, ?/! emotes) to student actions to
provoke deeper data exploration. Target: CODAP v3 via a **wrapper page** (decided —
plugins cannot render outside their tile; see README quirks for the evidence summary).

## State (verified working as of 2026-08-25)

**All phases 0–8 landed.** 30 clips, 28 behaviors, engine selfTest 43/43.
Latest additions (July 2026): Phase 7 data-move encouragement
(`web/src/data-moves.js`, signatures live-verified on v3.0.3 — see
`docs/DATA-MOVES.md`) and the Phase 8 PoC "insight" inverted classifier
(`web/src/insight.js` + wise-attend + the Dot's-mind panel; work order
`docs/PHASE8-POC.md`). Motion personality is codified in `docs/MOTION.md`
(distilled from the honed tinkerbell clip) and baked into `moveTo()`
(attack/cruise/brake + overshoot-settle; `{arrive:false}` chains waypoints).
Sleep is a full doze cycle (`axo.doze()`: dozeoff → snore → Zzz's).

**`bat-a-point` FIXED and live-verified 2026-08-25** on codap3.concord.org
v3.1.0 — double lands within 0.6 px of the real point on dot plot,
scatterplot, and after tile resize+move; color exact; selfTest 43/43.
`docs/BAT-A-POINT.md` records the calibration numbers, what changed, and
the environment quirks hit while verifying (flaky iframe-phone replies —
always get-verify updates in a retry loop).

Environment gotchas (macOS dev machine):
- The Claude session shell may carry a stale `NODE_OPTIONS` preload
  (`...cmux-claude-node-options/restore-node-options.cjs`) that breaks ALL
  node commands — launch with `NODE_OPTIONS="--max-old-space-size=4096"`.
- Run vite detached (`nohup ... & disown`), NOT as a harness background
  task — the task reaper kills it (exit 144).
- Blender 5.1.2 at /Applications/Blender.app; pipeline chain is
  01_build_rig → 02_build_clips → 03_export_glb (see README).
- Asset/binary merge conflicts with the server: never pick a side —
  rebuild .blend/.glb from the merged pipeline scripts.

### Earlier phase history (2026-07-06/07)

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

### Phase 9 progress (2026-08-25/26) — P0–P4 executed

Dot performs the real actions live in the student's document and undoes them.
`web/codap-same.html?tutorial=1` and `?tutorial=2` are the venues; the debug
panel and `window.__demo.run('tutorial1','MakeGraph')` drive it by hand.

- **P0 done.** `web/src/inject.js` + `web/inject-test.html` → `__injectTest()`
  12/12. The P0 VERIFICATION TABLE in `docs/PHASE9-SHOWME.md` is filled. The
  headline: synthetic input is FOUR stacks, each listening somewhere else
  (dnd-kit, React props, d3-drag-with-mouse-events-only, PixiJS) — see the
  table, and the correction header now on `docs/SPIKE-SAME-ORIGIN.md`.
- **P1 done.** Cursor timeline, paw-print sprite, `facingOverride`, measured
  tap-contact constant (0.59 s). Paw↔cursor max 0.00 px over timeline ticks.
- **P2 done.** DemoScript (line notation + JSON, `demo-script.schema.json` is
  normative), resolvers, state-diff revert, cancellation. All 5 tutorial-1
  demos green 3× consecutively; malformed scripts rejected with zero motion.
- **P3 done** except demo COMPLETION rate. The forked plugin
  (`web/public/tutorial-plugins/onboarding/`, 8 marked DOT-FORK edits +
  `dot-showme.js`) hands "Show me." to Dot; suppression, busy, MP4-on-error,
  dirty-document and all-five-manual-completion verified.
- **P4 partial.** Tutorial 2 forked and usable; 4 of the 6 shared scatterplot
  scripts green. `MakeScatterplot` and `MakeLegend` end-to-end hit the 60 s cap.

**Read before continuing:** `docs/verification/phase9/P2-NOTES.md`,
`P3-NOTES.md`, `P4-NOTES.md` (what running it taught, with measurements) and
**`BAILOUTS.md`** (two v3 notification defects that need Chad's ten-second
check on the official tutorial page — they probably affect shipped CODAP).

The one thing that will bite next: **demos are timed out by CODAP's own
main-thread stalls**, not by our code. A single injected click that makes CODAP
build a graph blocks 1.3–17 s; the API itself answers in 0–20 ms. Measure
headed — headless roughly doubles it. P4-NOTES has the numbers.

## Work queue, in order

1. **Phase 9 — Dot as "Show me"**: continue `docs/PHASE9-SHOWME.md` at P5
   (Opus-ready work order, adversarially reviewed 2026-08-25). Live
   tutorial demonstrations via same-origin input injection
   (`docs/SPIKE-SAME-ORIGIN.md` has the verified mechanics), the
   DemoScript language (human line-notation + LLM JSON), plugin forks
   for the 7 getting-started tutorials, Easter eggs. Phases P0–P8,
   each a standalone stopping point.
2. **More mischief/insight polish** — whatever Chad queues next; tune
   against `docs/MOTION.md` and `docs/CHARACTER.md`.

Completed 2026-08-25: **bat-a-point fix + visual polish + force-fire
reliability** (`docs/BAT-A-POINT.md` STATUS), **same-origin injection
spike** (`docs/SPIKE-SAME-ORIGIN.md`).

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
