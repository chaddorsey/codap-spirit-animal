# Phase 5 Work Order — Personality & Kitten Mischief

Design settled with Chad 2026-07-07; spend reasoning on execution quality.
Read `PLAN.md` + `docs/CHARACTER.md` (deliverable #1) for context. The engine
guarantees from Phase 4 are inviolable: every new behavior inherits
arbitration, cooldowns, cancel-on-action, and the playbook recipe.

## Goal

Give the axolotl a felt personality — a young kitten's software in an
axolotl's body (early-Bambi innocence, Toothless's cat repertoire). Deliver:
a character bible; a felt-only mood system; a roster of ambient "squib"
micro-behaviors; performance variety for existing behaviors; and two
flagship mischief acts that physically interact with CODAP components
(tile nudge-and-return, point-batting with a visual double).

**Success sentence:** an idle observer watching a student session for five
minutes sees a creature — stretching, investigating, occasionally zooming or
batting something — and can name its mood without any UI telling them.

## Architecture (settled — approach A)

- **Mood** lives in the student model: `state.mood = { playful, curious,
  sleepy, mischievous }`, weights 0..1. Drift on the engine's 1 Hz tick:
  sleepy ↑ with idle, ↓ on activity; playful ↑ on activity bursts, slow
  decay; curious spikes on new-thing events (create / first selection /
  drag), decays; mischievous accrues while playful is high and no mischief
  has happened lately ("unspent energy"), resets after any mischief act.
- **Influence**: (a) squib triggers gate on mood thresholds; (b)
  `ctx.pick(variants, weights?)` chooses mood-weighted performance variants;
  (c) `actor` speed multiplier — playful ≈ +20% swim speed, sleepy ≈ −30%
  (via moveTo's existing pixelsPerSecond option, engine-supplied factor).
- **No mood UI.** Debug panel shows mood weights; students only ever infer.
- Engine changes are additive ONLY: mood state + drift, `ctx.pick`,
  speed factor. Everything else = behaviors + clips via existing playbooks.

## Deliverables

1. `docs/CHARACTER.md` — the bible: identity, seven core traits, the 14
   kitten behaviors mapped to our medium, loves/fears in a data world,
   comic timing rules (stillness before pounce; overshoot-and-recover;
   proud after anything; setbacks < 2 s; mischief exits fast), and the
   authoring test: "would a kitten do this, and would a 10-year-old smile?"
   Name slot reserved — naming is Chad's.
2. Engine: mood + drift + `ctx.pick` + speed factor; selfTest gains three
   assertions (mood drifts on tick; mood-gated trigger blocks below
   threshold; variant pick respects one-at-a-time). Panel: mood readout +
   mood-set debug buttons.
3. New clips (~8) via PLAYBOOK-clips: `stretch, head_tilt, pounce, roll,
   startle, proud, bat_L, bat_R`.
4. Ambient squibs (tick-triggered, mood-gated, long creature-random
   cooldowns): stretch-after-nap (wake path), head-tilt-investigate,
   zoomies, pounce-at-drag, roll-over (rare), absorbed-discovery,
   startle (mass deletions / rapid closes; recovery < 2 s), sit-nearby
   (indirect affection: rest beside the student's most-used tile).
5. Reaction variety: greet ×3, celebrate ×2 (tinkerbell joins), wake ×2
   (stretch-first variant), via `ctx.pick`.
6. Mischief acts:
   - `tile-mischief` — mischievous > 0.6 & student active: swoop to tile
     edge, bat (clip) synced with real DI `update component[id] position`
     (+12 px), swim around, bat it back (−12 px), exit fast + proud.
     Skips tiles the student touched in the last 20 s. Self-reversing.
   - `bat-a-point` — compute a point's screen position (case values + graph
     axis bounds + calibrated geometry); spawn a matching dot in OUR
     overlay; paw-arc it away with squash; spring back to land exactly on
     the real point; remove. Real data never changes. **Spike ≤ 30 min** on
     reading axis bounds from v3; fallback target = densest cluster
     centroid from values alone; if even that fails, descope to
     BEHAVIORS.md as blocked and keep the batting clip for tile-mischief.

## Measurable end state — ✅ COMPLETE 2026-07-07

- [x] `CHARACTER.md` reviewed by Chad — she is **Dot**; wise-kitten register added at his direction.
- [x] selfTest passes — grew 18 → **32/32** (mood drift, wake bumps,
      mood-gate block/fire, pick weights, per-behavior force-fire).
- [x] Every squib force-fireable + simulate-able; verified via mood-crank
      against the live page (docs/verification/phase5/). tile-mischief
      moved a REAL tile via DI and restored its exact position
      (verified `{left:40,top:60}` → identical after).
- [x] bat-a-point double: spawned from v3 axis bounds over the outlier dot,
      arc + elastic spring-back, landed visually indistinguishable from the
      real point before removal (mischief-bat-arc/landed screenshots).
- [x] Mood drift documented: readout at active / 3-idle-minutes / returned
      (mood-A/B/C screenshots; drift runs through the real `_tickMood`).
- [x] Prior 12 behaviors + clips unregressed (selfTest superset + live
      greet/celebrate observed during scene setup).
- [x] BEHAVIORS.md (Phase 5 table + engine opt-outs), PLAYBOOK-behaviors
      (mood/pick/onCancel/preempts contract), BACKLOG, PLAN updated; five
      milestone commits pushed.

Engine capabilities added along the way (all additive, all selfTest-covered):
`preempts` (startle must not wait its turn), `ctx.onCancel` (resource cleanup),
`spawnDot` point doubles, `slider:change` bridge mapping, model-owned
delete/churn histories.

## Milestones (commit + push after each)

1. CHARACTER.md + engine (mood/pick/speed) + selfTest + panel readout.
2. Clip batch (8 new; rebuild 02→03; console-verified at dpr 2).
3. Squib wave 1 (no-new-clip: zoomies, absorbed-discovery, sit-nearby) +
   reaction variety.
4. Squib wave 2 (clip-dependent: stretch-after-nap, head-tilt-investigate,
   pounce-at-drag, roll-over, startle).
5. Mischief acts + docs updates.

## Scope boundaries

**In:** everything above.
**Out:** pedagogy-driven acting (deferred until personality is nailed —
Chad's explicit call); student→axolotl input (pointer-events hole-punching);
perch-on-tile terrain system; component-aware data reactions beyond what
bat-a-point needs; sound; persistence; naming the character.

## Bail-outs

- Phase-4 rules apply: 3 distinct failed debug attempts → notes to
  `docs/PHASE5-NOTES.md`, commit working subset, move on. 30-minute cap on
  any missing-API investigation (bat-a-point axis bounds).
- Clip that fights the rig after 2 authoring passes → simplify the pose
  (the bible's timing rules beat anatomical ambition).
- Parallel-session merge conflicts on generated binaries → regenerate from
  merged 02_build_clips.py (never hand-resolve .blend/.glb).
