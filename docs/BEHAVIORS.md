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

Notes:
- Components present before the wrapper connected are marked `preexisting` and
  are never nudged (their attribute state is unknown).
- `attrsAssigned` counts `attributeChange` notifications per component — it is
  an event count, not axis state; removal of an attribute also increments it.
  Good enough for "has the student ever touched this graph's axes."

## Proposed (next candidates — all clips already exist unless noted)

| id | Trigger | Condition | Sequence | Cooldown | Escalation | Priority | Clips needed |
|---|---|---|---|---|---|---|---|
| `glance-at-selection` | `selection` | selection count ≥ 1 | `?` emote → `curious` (re-implements the retired spike reaction) | 20 s | none | 30 | curious ✓ |
| `follow-attribute-drag` | `drag` phases | dragstart→drop of an attribute | gaze follows drag position; on drop over a tile: `!` + `celebrate`; on dragend: clear gaze (retired spike reaction; needs a "sticky" run that spans phases) | 10 s | none | 70 | celebrate ✓ |
| `suggest-graph-for-data` | clock tick | a dataContext has cases but no graph exists for >90 s; student active | swim toward the toolbar area → `point_L/R` at the Graph button coords → `?` | 180 s | after 2: tap at the Graph button + `?!` | 35 | point ✓, tap ✓ |
| `celebrate-first-selection` | `selection` | first nonempty selection of the session | `nod_L/R` toward the graph → `!` | once/session | none | 55 | nod_L/R ✓ |
| `peer-at-big-selection` | `selection` | count ≥ 10 cases | swim beside the graph → `curious` → `?` | 60 s | none | 25 | curious ✓ |
| `nudge-idle-table` | clock tick | a case table exists >180 s with 0 cases added; student active elsewhere | swim beside table → gaze → `?` | 120 s | after 2: tap on the table + `?!` | 38 | tap ✓ |
| `dance-on-data-milestone` | `cases:change` | `createCases` pushes a context past 25 cases (once per threshold) | `dance` (short) + `!` | once/context | none | 45 | dance ✓ |
| `scratch-on-thrash` | any component event | ≥4 create/delete events within 30 s (student flailing) | `scratch` + `?` | 300 s | none | 20 | scratch ✓ |

Design conventions for new rows: subtle before overt; cooldowns err long
(anti-annoyance beats responsiveness); priorities — celebrations 45–80,
reactions 20–40 with nudges near the bottom of that band, ambient ≤10.
`droop` is unused so far — a natural fit for a future "student dismissed the
nudge" acknowledgment.

## Blocked / descoped

None — every Phase 4 trigger exists in the v3 notification stream.
(`component … attributeChange` confirmed live 2026-07-06; see
`docs/verification/phase4/`.)
