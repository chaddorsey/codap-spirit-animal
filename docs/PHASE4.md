# Phase 4 Work Order — Behavior Engine

Complete goal statement for the next work session. Read `PLAN.md` first for project
context; this file governs Phase 4 specifically. Follow it as written — the design
decisions here are settled; spend reasoning on execution quality, not re-litigation.

## Goal

Replace the event→reaction switchboard in `web/src/codap-main.js` with a small,
data-driven **behavior engine**, a seed library of four working behaviors, a debug
harness that makes behaviors testable without a live student, and the two playbooks
that convert all future behavior/clip work into cheap-model work.

**The single sentence that defines success:** after this phase, adding a new wordless
intervention means adding one declarative entry to `web/src/behaviors.js` (and
optionally one clip via the existing pipeline), takes under an hour, requires no
engine changes, and can be verified by force-firing it in the debug panel.

## Architecture (settled — do not redesign)

- `web/src/behavior-engine.js` — the engine. Consumes `CodapBridge` events + a clock.
  Owns a **student model**: known components with bounds and creation/interaction
  timestamps, current selection info, drag state, seconds since last student action.
  Exposed as `window.__engine` with an inspectable `.state`.
- `web/src/behaviors.js` — behaviors as data. Each entry:
  `{ id, priority, cooldownSec, trigger(state, event) -> bool,
     run(actor, state) -> Promise, escalation?: { after: n, run: overtVariant } }`
  where `actor` is the existing Axolotl API (`moveTo/lookAt/gestureAt/tapAt/play/
  setBase/emote/release/clearGaze`) — additive changes to that API only.
- Engine rules (each is an acceptance test, see below): one intervention at a time;
  higher priority wins ties; a behavior on cooldown never fires; escalation variants
  fire only after `after` subtle firings went un-acted-on; any fresh student action
  cancels an in-flight intervention within ~1s and returns the character to idle.
  The overlay must never intercept input (pointer-events stays none).
- `codap-main.js` shrinks to: wiring (stage, character, bridge, engine, panel) and
  the debug panel. The idle/sleep logic moves into the engine as a behavior.

## Seed behaviors (implement exactly these four first)

1. `greet-new-component` — component created → ! emote, hop, swim beside it, curious
   peer. (Port of the working spike behavior; escalation: none.) Degrades gracefully
   if geometry hasn't arrived: emote + hop in place (engine must not hang on the
   known componentList lag).
2. `celebrate-first-plot` — first time a graph gains an axis attribute
   (`attributeChange` notification on a graph tile) → celebrate + ! ; once per session.
3. `nudge-empty-graph` — a graph has existed >120s with no attribute assignments and
   the student has been active elsewhere → subtle: swim near it, look at it, ? emote.
   Escalation after 2 ignored firings: swim onto the tile, tap_L/tap_R on it, ?!.
4. `idle-companion` — no student action for 90s → sleep; wake on any action with !.
   (Existing spike logic, engine-ified; also serves as the cooldown/cancel test case.)

If a trigger's notification turns out not to exist in v3's stream, spend at most 30
minutes confirming (log the raw stream, check the v2-v3 compatibility audit in the
CODAP repo), then descope that behavior to `docs/BEHAVIORS.md` as "blocked on
notification X" and move on. Do not reverse-engineer CODAP source beyond that.

## Debug harness (this is what makes the phase verifiable)

Extend the `/codap.html` panel with a "behaviors" section:
- live state readout (components known, idle seconds, active intervention, per-behavior
  cooldown/escalation counters);
- a force-fire button per behavior (bypasses trigger, respects the one-at-a-time rule);
- a "simulate event" control that injects synthetic bridge events (component:create,
  selection, drag phases) so every behavior is testable **without** clicking inside
  CODAP;
- `window.__engine.selfTest()` — runs through: fire each behavior via simulation,
  assert one-at-a-time, assert cooldown blocks a refire, assert cancel-on-activity;
  resolves with a pass/fail summary object. This is the phase's smoke test.

## Measurable end state (all must hold)

- [ ] `selfTest()` passes in the browser (screenshot or logged result).
- [ ] Each of the four behaviors visually verified against **live** CODAP once
      (screenshot each; the debug panel makes setup fast).
- [ ] Force-firing behavior A while B runs: B completes or cancels cleanly, never
      two interventions animating at once.
- [ ] A student click inside CODAP during `nudge-empty-graph` cancels it within ~1s.
- [ ] `docs/BEHAVIORS.md`: spec table of the 4 implemented + ≥6 proposed behaviors
      (trigger, condition, sequence, cooldown, escalation, priority, needed clips).
- [ ] `docs/PLAYBOOK-behaviors.md` and `docs/PLAYBOOK-clips.md`: recipe format —
      files to touch, exact commands, verification steps, common failure modes.
- [ ] BACKLOG.md and PLAN.md updated; everything committed and pushed.

## Bail-out criteria (stop digging when hit)

- Same failure survives 3 distinct debugging attempts → stop, write findings and
  hypotheses to `docs/PHASE4-NOTES.md`, commit the working subset, move to the next
  item. A partial phase with clean notes beats a wedged session.
- A trigger needs a notification v3 doesn't emit → descope per the 30-minute rule.
- Geometry unreliable (componentList lag >15s in practice) → behaviors fall back to
  their geometry-free variants; never busy-wait more than the existing retry loop.
- Browser automation flaky → verify with a human-in-the-loop note rather than
  burning cycles on the harness itself; the deliverable is the engine, not the CI.

## Scope boundaries

**In:** the engine, behaviors-as-data, the four seeds, debug harness, the two
playbooks, BEHAVIORS.md, doc updates.

**Out (do not touch, regardless of temptation):** `pipeline/` and the .blend/glb
(asset work is complete; reuse the 16 existing clips); the CodapBridge and Axolotl
public APIs beyond additive methods; LLM-driven or generative behaviors (rule-based
only this phase); sound; persistence/analytics; multi-character; plugin-tile or
CODAP-v2 modes; the calibration wizard; visual styling polish.

## Token rationing (how to spend the model you're running on)

- Read only: `codap-main.js`, `codap-bridge.js`, `character.js` (public methods),
  `index.html`/`codap.html` panel markup. Do NOT re-read pipeline files or re-run
  research — the findings you need are in README.md and this file.
- Spend top-tier reasoning on: engine arbitration/cancellation semantics (the only
  genuinely subtle code), the escalation state machine, and playbook clarity.
- Delegate to cheaper subagents (if available): screenshot-verification passes,
  drafting the ≥6 proposed behaviors for BEHAVIORS.md, doc proofreading.
- Milestone commits: engine skeleton + behavior 1 → commit; behaviors 2–4 + harness
  → commit; docs/playbooks → commit. Push after each. If the session dies, the next
  one resumes from a green commit, not a diff.
