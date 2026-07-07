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

**Live-verified 2026-07-07 against codap3.concord.org v3.0.3** (same probe
method as `attributeChange`: perform the real gesture, capture the raw
stream). ✅ = exact op observed.

| Move | Student gesture in CODAP | Notification signature | Status |
|---|---|---|---|
| **Filtering (out)** | select cases → eye-menu *Hide Unselected Cases* | ✅ `component / hideUnselected` — includes **`numberHidden`** (how much got filtered!) + component id/type | Confirmed |
| **Filtering (in)** | eye-menu *Show All Cases* | ✅ `component / showAllCases` | Confirmed |
| **Filtering (variants)** | *Hide Selected Case*, *Display Only Selected* | same family (op names inferred: `hideSelected`, …) — one manual pass to enumerate | Inferred |
| **Grouping** | drag a categorical attribute into the **middle of a graph** (legend — the iconic gesture, per ICOTS) | ✅ `component / legendAttributeChange` — includes `attributeName`, `attributeId`, `plotType`, `primaryAxis`. A DEDICATED op; zero inference | Confirmed |
| **Summarizing (adornment)** | Measure palette: Mean (also Count, Median, StdDev, MAD, Box Plot) | ✅ `component / togglePlottedMean` with **`isChecked`**; family pattern `togglePlotted*` / measure toggles | Confirmed (mean; family inferred) |
| **Calculating** | table **+** button → new column | ✅ `dataContextChangeNotice / createAttributes` | Confirmed |
| **Calculating/Summarizing (formula)** | header menu → *Edit Formula* → Apply | ✅ triple: `updateCases` + `updateAttributes` (**`result.attrs[].formula` carries the full formula text** — aggregate-function regex separates summarizing from calculating) + `component / "edit formula"` | Confirmed |
| **Merging/Joining** | drop a CSV in; cross-table ops | `createDataContext` expected; deferred (rare in class, file-drop hard to automate) | Deferred |
| **Making hierarchy** | drag an attribute **leftward** onto the table's yellow *"Drop attribute to create collection"* strip | ✅ `dataContextChangeNotice / createCollection` (manually confirmed by Chad; synthetic drops don't land, humans do fine) | Confirmed |

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

## 4. Live-verification checklist (2026-07-07)

- [x] Hide/show case ops: `hideUnselected` (+`numberHidden`), `showAllCases`.
- [x] Legend assignment: dedicated `legendAttributeChange` op with attribute
      name/id + plotType — no inference needed.
- [x] Measure adornment toggles: `togglePlottedMean` with `isChecked`
      (family: Count/Median/StdDev/MAD/Box Plot in the same palette).
- [x] `createAttributes` fires on new column; `updateAttributes` **includes
      the formula text** in `result.attrs[].formula` — plus a bonus
      `component / "edit formula"` op.
- [x] `createCollection` on the hierarchy drag — **manually confirmed by
      Chad 2026-07-07**: `dataContextChangeNotice[…] createCollection`
      (synthetic mouse drops don't land on the drop strip; humans do fine).
- [ ] `createDataContext` on CSV drop (deferred; rare in class).
- [ ] Enumerate remaining eye-menu variants (hide-selected, display-only).

## 5. Next phase hooks (suggesting moves — not yet)

The same classifier inverted: moves *not yet tried* + dataset affordances
(categorical attr present but never grouped; a formula-less table; hidden
structure a filter would reveal) become the wise-kitten's attention targets,
delivered through the already-targetable terrain primitives.
