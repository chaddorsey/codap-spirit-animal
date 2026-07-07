# Behavior Specification

The behavior library for the spirit animal. Implemented behaviors live in
`web/src/behaviors.js` as data entries consumed by `web/src/behavior-engine.js`;
this table is the design source for extending them. To add one, follow
`docs/PLAYBOOK-behaviors.md` — no engine changes should be needed.

**Engine guarantees** (enforced for every behavior; see `behavior-engine.js`):
one intervention at a time · higher priority wins ties · cooldown blocks refires ·
escalation variant fires only after `after` subtle firings went un-acted-on ·
any fresh student action cancels an in-flight intervention within ~1s and the
character returns to idle · the overlay never intercepts input. Two opt-outs:
`ignoreActivity` (behavior accompanies continuous student action and
self-terminates) and `preempts` (a strictly-higher-priority behavior may
displace a running one — startle only).

**Mood** (Phase 5): `state.mood` = playful/curious/sleepy/mischievous 0–1,
drifting per `docs/CHARACTER.md`; squib triggers gate on it, `ctx.pick`
weights performance variants by it, and it scales swim speed (felt only —
no student-facing UI).

## Implemented (Phase 4 — all live-verified against CODAP v3.0.3, 2026-07-06)

| id | Trigger | Condition | Sequence | Cooldown | Escalation | Priority | Clips used |
|---|---|---|---|---|---|---|---|
| `celebrate-first-plot` | `component:attributeChange` | component is a graph; not yet fired this session (`mem.done`) | `!` emote → `celebrate` | — (once/session) | none | 80 | celebrate |
| `greet-new-component` | `component:create` | always (geometry optional) | `!` emote → `hop` → wait ≤6s for bounds → swim beside tile → gaze at center → `curious` → clear gaze. No bounds: emote + hop only | 8 s | none | 60 | hop, curious, swim |
| `nudge-empty-graph` | clock tick | a session-created graph with bounds has 0 attribute assignments for >120 s **and** student acted <60 s ago (present, busy elsewhere) | swim beside graph → gaze → `?` emote → 2.5 s → clear gaze | 90 s | after **2** ignored firings: swim **onto** the tile → `tap_L/R` on it → `?!`. Counter resets when any `component:attributeChange` arrives (`satisfied`) | 40 | swim, tap_L, tap_R |
| `idle-companion` | clock tick | no student action for 90 s | base → `sleep`; stays until any student action cancels; wake adds `!` (`onCancel`) | 30 s | none | 10 | sleep |
| `follow-attribute-drag` ᵃ | `drag` (`dragstart`) | always | `?` emote; gaze tracks drag position; on drop: `!` + `celebrate`; on dragend/stall: clear | 10 s | none | 70 | celebrate |
| `glance-at-selection` ᵃ | `selection` | count ≥ 1 | `?` emote → `curious` | 20 s | none | 30 | curious |

| `celebrate-first-selection` ᵇ | `selection` | count ≥ 1, once per session | `!` + `nod_L/R` | once/session | none | 55 | nod_L, nod_R |
| `dance-on-data-milestone` ᵇ | `cases:change` (`createCases`/`createItems`) | context's itemCount ≥ 25 (queried in `run`, quiet bail below); once per context | `!` + `dance` (time-boxed loop) | 20 s | none | 45 | dance |
| `nudge-idle-table` ᵇ | clock tick | session-created case table >180 s with no case additions since; student active | swim beside → gaze → `?` | 120 s | after 2: onto tile + tap + `?!`; any case creation satisfies | 38 | tap_L/R |
| `suggest-graph-for-data` ᵇ | clock tick | data has cases, no graph exists ≥90 s; student active | swim toward tool shelf → `?` + point at Graph button | 180 s | after 2: tap at the button + `?!`; graph creation satisfies | 35 | point_L/R, tap_L/R |
| `peer-at-big-selection` ᵇ | `selection` | count ≥ 10 (outranks glance) | swim beside graph → gaze → `?` + `curious` | 60 s | none | 32 | curious |
| `scratch-on-thrash` ᵇ | `component:create`/`delete` | ≥4 create/delete events in 30 s (model-owned churn history) | `?` + `scratch` | 300 s | none | 20 | scratch |

ᵃ Added post-Phase-4 (2026-07-07), restoring the retired spike reactions.
ᵇ Added 2026-07-07. All six verified by simulation (debug panel) with
selfTest 18/18; `dance-on-data-milestone` also live-verified (real 30-item
creation → `createCases` → API `itemCount` query → dance). The v3 `itemCount`
resource works from the wrapper. Churn for `scratch-on-thrash` is tracked in
the engine's student model (`state.componentChurn`), not in behavior `mem` —
trigger-side counters miss events consumed by higher-priority firings.
`follow-attribute-drag` sets `ignoreActivity: true` — it accompanies continuous
student action and self-terminates rather than being cancelled by the drag it
is following. `glance-at-selection` live-verified (table-row click →
`selectCases`). **`follow-attribute-drag` is simulation-verified but blocked
live**: v3 emits `dragDrop` notifications only for attribute drags over
*plugin tiles* — internal table→graph drags produce no drag-phase
notifications at all (confirmed 2026-07-07 by watching the raw stream during a
real header→axis drag; only the final `attributeChange` arrives, which
`celebrate-first-plot` already covers). It fires correctly the moment such
notifications exist (or if the companion ever runs as a plugin tile).

Notes:
- Components present before the wrapper connected are marked `preexisting` and
  are never nudged (their attribute state is unknown).
- `attrsAssigned` counts `attributeChange` notifications per component — it is
  an event count, not axis state; removal of an attribute also increments it.
  Good enough for "has the student ever touched this graph's axes."

## Phase 5 — personality squibs & mischief (2026-07-07, selfTest 32/32)

| id | Trigger | Gate / condition | Sequence | Cooldown | Priority | Clips |
|---|---|---|---|---|---|---|
| `startle` ᵖ | `component:delete` | 2+ deletes in 4 s | jump-back pop + "where did it go?" head-tilt; recovers < 2 s | 60 s | 65 | startle, head_tilt |
| `pounce-at-drag` ⁱ | `slider:change` | playful > .55 | stalk-freeze 0.8 s → fast approach → pounce (overshoot+recover) → proud | 90 s | 28 | pounce, proud |
| `absorbed-discovery` | tick | curious > .6, populated graph | nose-close hover, utterly still 4.5 s, drifts off | 180 s | 18 | — |
| `head-tilt-investigate` | tick | curious > .5 | visits a (preferably new) tile, considers it from two angles | 150 s | 17 | head_tilt |
| `zoomies` | tick | playful > .7 | 4 laps of open canvas at 950 px/s, abrupt hop stop; spends energy | 240 s | 15 | — |
| `tile-mischief` ⁱ | tick | mischievous > .6, student around, tile untouched 20 s | bat tile (+12 px REAL DI move) → swoop around → bat it back → exit fast, proud. Self-undoing; verified position-restored live | 300 s | 14 | bat_L/R, proud |
| `bat-a-point` ⁱ | tick | mischievous > .6, populated graph | stalk → spawn visual double exactly over the outlier dot (position from v3 `xLower/UpperBound`) → paw-arc it away → elastic spring-back onto the real dot → remove → exit, proud. Data never changes | 240 s | 13 | bat_R, proud |
| `sit-nearby` | tick | playful > .5, student around | settles low beside the most-used tile for 10 s; any action releases it | 300 s | 12 | — |
| `roll-over` | tick | playful > .8 | barrel roll in open water + proud | 600 s | 8 | roll, proud |

ᵖ = `preempts` · ⁱ = `ignoreActivity`. Wake-path stretch (`stretch` clip) ships
as an idle-companion wake variant, not its own row. v3 findings: graph
components expose `xLowerBound/xUpperBound/pointColor/pointSize/plotType`
(bat-a-point needs no fallback); slider drags emit `component / change slider
value` ops (mapped to `slider:change`).

## Phase 6 — terrain (2026-07-07, selfTest 36/36)

| id | Trigger | Gate / condition | Sequence | Cooldown | Priority | Clips |
|---|---|---|---|---|---|---|
| `yield-to-mouse` | `mouse:near` (whisker halo) | cursor entered Dot's personal space | drift promptly-but-sweetly ~190 px away from the cursor, glance back ("you go ahead") | 8 s | 58 | — |
| `peek-at-tile` | tick | curious > .55, tile exists | `ctx.pick` of Kilroy-over-the-top / side face-sliver (slow or medium emerge, never rapid) / curious hover; gaze into the tile; slip away | 180 s | 19 | kilroy |
| `perch-on-tile` | tick | curious > .4, tile exists | sit on the top edge (`perch` loop), glance about; if sleepy > .35 and the student is quiet: nap on the ledge → droop → **fall** → startle → proud (< 2 s recovery) | 240 s | 16 | perch, droop, startle, proud |
| `demo-peek-axis` | force-fire only | a graph exists | Kilroy aimed at the x-axis REGION (tile bounds + plot insets) — the targetability proof | — | 1 | kilroy |

**The whisker** (`web/src/whisker.js`): the mouse is invisible over the
cross-origin iframe, so Dot senses it only through a transparent
pointer-events:auto halo riding at Dot's own position. One `mouseenter` →
halo goes inert (every subsequent event, including the click the user was
reaching for, passes through to CODAP) → `mouse:near` fires → Dot yields.
Re-arms 2.5 s later. Input is never intercepted beyond that single enter.

Terrain primitives (`web/src/terrain.js`) take **any** screen rect —
`perchOn / peekSide / kilroyOver / fallFrom` — so the wise-kitten phase can
aim them at menus, attribute headers, and axes. Occlusion is one clipping
plane at the target edge (`clipAtScreenX/Y`, additive on Axolotl);
`actor.stop()` and every primitive's `ctx.onCancel` clear it, and selfTest
asserts cancel-clears-clipping. Verified live: perch ON a real tile,
Kilroy rising from behind a real graph's axis region, nap-fall completed.

## Proposed (next candidates)

All eight originally-proposed behaviors are now implemented (see above). Fresh
candidates worth speccing when needed: acknowledge-dismissed-nudge (`droop`
after a nudge target is deleted), celebrate-first-map, react-to-formula-edit,
point-at-undo-after-thrash.

Design conventions for new rows: subtle before overt; cooldowns err long
(anti-annoyance beats responsiveness); priorities — celebrations 45–80,
reactions 20–40 with nudges near the bottom of that band, ambient ≤10.
`droop` is unused so far — a natural fit for a future "student dismissed the
nudge" acknowledgment.

## Blocked / descoped

None — every Phase 4 trigger exists in the v3 notification stream.
(`component … attributeChange` confirmed live 2026-07-06; see
`docs/verification/phase4/`.)
