# Behavior Specification

The behavior library for the spirit animal. Implemented behaviors live in
`web/src/behaviors.js` as data entries consumed by `web/src/behavior-engine.js`;
this table is the design source for extending them. To add one, follow
`docs/PLAYBOOK-behaviors.md` — no engine changes should be needed.

**Engine guarantees** (enforced for every behavior; see `behavior-engine.js`):
one intervention at a time · higher priority wins ties · cooldown blocks refires ·
escalation variant fires only after `after` subtle firings went un-acted-on ·
any fresh student action cancels an in-flight intervention within ~1s and the
character returns to idle · the overlay never intercepts input.

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
