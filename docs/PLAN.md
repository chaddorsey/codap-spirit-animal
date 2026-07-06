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

- **Phases 0–3 complete.** Blender pipeline → `web/public/axolotl.glb` (21-bone rig,
  11 channel-disjoint clips); three.js character runtime with screen-space API;
  live CODAP v3 wrapper: iframe-phone bridge, semantic events, tile geometry with
  offset+scale calibration, spike behaviors (greet new component, ? on selection,
  gaze follows attribute drags, celebrate on drop, sleep when idle).
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

1. **Eye glint fix** (BACKLOG #1) — small, do first. Rebuild + verify with a zoomed
   screenshot at rest and mid-gaze.
2. **Limb extension + new clips** (BACKLOG #2, #3) — pipeline geometry change, then
   clip work. Verify every clip visually in the console before moving on.
3. **Emote glyph gap** (BACKLOG #4) — quick, isolated in `web/src/emotes.js`.
4. **Phase 4: behavior engine** — the design intent:
   - A small engine consuming `CodapBridge` semantic events plus timers, replacing the
     switchboard in `codap-main.js`. State: what the student has/hasn't done recently
     (per-component visit history, idle time, event counts).
   - Behaviors as data: trigger condition → intervention sequence (moveTo/gesture/
     emote/clip), with **priority**, **cooldown** (anti-annoyance: don't fire the same
     nudge twice in N minutes; never interrupt an active student mid-flow), and
     **escalation** (subtle first — glance, ?; overt later — swim over, tap, !).
   - Exemplar behaviors to implement first: (a) empty graph sitting unused → swim
     over, peer, tap it, ? ; (b) student makes first scatterplot with both axes →
     celebrate; (c) long idle with data present but no graph → swim to toolbar area,
     point at Graph button; (d) selection made → curious glance (already spiked).
   - Write `docs/BEHAVIORS.md` as a spec table others (and cheaper models) can extend.
5. **Playbooks** — `docs/PLAYBOOK-clips.md` and `docs/PLAYBOOK-behaviors.md`: exact
   recipe (files to touch, commands, how to verify) so less-capable agents can add
   clips/behaviors safely. Mine `02_build_clips.py`'s header comments as the seed.

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
