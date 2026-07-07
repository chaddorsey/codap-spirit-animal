# Data Moves — Detection & Dot's Encouragement

Sources: Erickson, Wilkerson, Finzer & Reichsman, *Data Moves*, TISE 12(1)
2019 (`docs/pedagogy-reference/qt0mg8m7g6.pdf`); Erickson, Finzer, Reichsman
& Wilkerson, *Data Moves: One Key to Data Science at the School Level*,
ICOTS10 2018 (`ICOTS10_9B3.pdf`); plus the CODAP teacher-education and HS
data-science papers in the same folder.

**A data move alters a dataset's contents, structure, or values.** The six
core moves: **filtering, grouping, summarizing, calculating, merging/joining,
making hierarchy.** Making a graph is NOT a data move (display only) — but
moves are usually performed *in service of* a graph, which is exactly the
loop we want Dot to reinforce. Data moves are seldom taught explicitly;
students who make one have done something genuinely agentive with their data.
That is the pedagogical bet: **Dot's visible delight marks the move as a
real, nameable, repeatable act.**

## 1. The moves as observable CODAP v3 actions

Our wrapper hears every Data Interactive notification (the bridge's `raw`
stream). Each move has a signature there. Confidence = how sure we are the
signature exists/is unambiguous, pending live verification (30-min rule per
op, as with `attributeChange`).

| Move | Student gesture in CODAP | Notification signature (expected) | Conf. |
|---|---|---|---|
| **Filtering** | select cases → eye-menu *Hide Selected/Unselected*; *Set Aside* in table; graph `filterFormula`; delete cases | `dataContextChangeNotice` ops `hideCases`/`showCases`/`setAside…`/`deleteCases`; component update carrying `filterFormula`/`hiddenCases` (we've already seen `filterFormula` in graph props) | High |
| **Grouping** | drag a categorical attribute into the **middle of a graph** (legend — the iconic gesture, per ICOTS); split axis by category; *Group into Bins* in graph config | `component … attributeChange` where the role is legend (or the attr is categorical); component config change for binning | High |
| **Summarizing** | Measure palette: mean/median/count/box-plot adornments; an aggregate formula (`mean()`, `count()`, …) in a new column | component change ops for measure toggles (same channel as `change slider value`); `updateAttributes` whose formula contains an aggregate function | High (adorn.) / High (formula) |
| **Calculating** | new attribute (+ column) in the table, then a formula | `createAttributes` then `updateAttributes` (formula present; non-aggregate → calculating, aggregate → summarizing) | High |
| **Merging/Joining** | drop a CSV in; copy data between tables; cross-table attribute drag | `createDataContext` (second context = new data arrived); cross-context ops | Medium (rare in class) |
| **Making hierarchy** | drag an attribute **leftward** in the case table, creating a parent collection | `createCollection` / `moveAttribute` ops | High |

Two useful non-moves worth tracking as context (not celebrated as moves):
making a graph (`component:create` graph — already tracked) and axis
assignment (`attributeChange` — already celebrated once via
celebrate-first-plot). They tell us *what the moves were for*.

## 2. Characterization architecture (next phase's spine)

- **DataMoveClassifier** (additive, bridge-side): pattern-match
  `(resource, operation, values)` → emit `datamove` events
  `{ move, detail, confidence }`. One table, each row live-verified the way
  we verified `attributeChange`. Unknown ops keep flowing as `raw`.
- **Student model** (`state.dataMoves`): per-move `{ count, firstAt, lastAt }`
  + a short recent-moves list for pattern detection (e.g. the canonical
  *grouping → summarizing* chain the ICOTS paper highlights).
- **Mood coupling**: every data move spikes curious **and** playful harder
  than any other event class — during productive data work Dot visibly
  comes alive, which students feel without being told anything.

## 3. Dot's positive responses (this phase's design)

All responses obey CHARACTER.md — wordless, interruptible, insight dressed
as play — and the anti-annoyance rules (per-move cooldowns, novelty decay).

**Tier 1 — first-of-a-kind this session** (each move type, once):
full celebration — `!` + celebrate/tinkerbell — then, crucially, the
**investigation**: Dot swims to the affected tile and *studies the result*
(absorbed peer at the new column; head-tilt at the newly grouped legend;
Kilroy over a table that just went hierarchical — "what happened in
there?!"). The celebration says *you did a thing*; the investigation says
*the thing you did made something worth looking at*. That second beat is
the pedagogy.

**Tier 2 — repeat moves**: light, warm, non-interrupting: the proud beat
aimed at the student's tile, a nod, a brief `!` — decaying with repetition
like a kitten habituating (novelty decay: full ack → nod → occasional
glance). Never blocks flow; any student action cancels instantly (rule 6).

**Tier 3 — patterns**: the *grouping → summarizing* chain inside ~2 minutes
gets the biggest response (dance + investigate both tiles); **making
hierarchy** is the rarest, most structural single move and earns the
tinkerbell. Filtering *in* (expanding scope — re-showing hidden cases to
compare) gets a delighted double-take (startle-into-curious), honoring the
papers' point that filtering runs both directions.

**What Dot never does** (this phase): explain, point at what to do next,
or respond to a move with anything that reads as grading. Encouragement
and curiosity only. Suggesting moves is the next phase, and the wise-kitten
rules already constrain its form: Dot will *attend to* the place where a
move is available (perch beside the table's drag zone, peek at the legend
area), never demonstrate-and-lecture.

## 4. Live-verification checklist (before building)

- [ ] Hide/show/setAside case ops: exact operation strings in v3's stream.
- [ ] Legend assignment: does `attributeChange` distinguish legend from axis
      (role/place in values)? If not: infer from attr type + graph state.
- [ ] Measure adornment toggles: op names for mean/median/count.
- [ ] `createAttributes`/`updateAttributes`: is the formula text included?
- [ ] `createCollection`/`moveAttribute` on table hierarchy drag.
- [ ] `createDataContext` on CSV drop.

## 5. Next phase hooks (suggesting moves — not yet)

The same classifier inverted: moves *not yet tried* + dataset affordances
(categorical attr present but never grouped; a formula-less table; hidden
structure a filter would reveal) become the wise-kitten's attention targets,
delivered through the already-targetable terrain primitives.
