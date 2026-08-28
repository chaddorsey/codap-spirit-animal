# GOAL — Wonderings U0 → U5

Ship a panel in CODAP's upper-right that occasionally shows one short rhetorical
question earned by real analysis of the student's own dataset and current screen.

Repo `codap-spirit-animal`, branch `fix/stale-iframe-document`, from `84da2db`.
Venue: `cd web && npm run dev`, then
`http://localhost:5199/codap-same.html?tutorial=2&wonderings=1`.
Measured 2026-08-28, reproducible from `docs/verification/wonderings/`:
`insight.js` returns **r = 0.29** for a perfect relationship with 4 blank cells in
18 cases; distribution analysis earns a wondering on **4 of 5** Mammals numerics
and correctly declines on Sleep; group-comparison earns **0**, because `Order` is
7 groups over 12 cases; `suggestMoves` imports and runs in node unmodified.

**Read before starting:**
`docs/plans/2026-08-28-001-feat-wonderings-ambient-inquiry-plan.md`. **It governs;
this statement does not.** It carries the wondering families, the engine design,
the unit detail, and what the review left open.

**Discipline.** Reads retried, writes never (`DemoDriver.api()`). Never cache
`contentDocument`. Absence requires affirmative observation — never lower a count
from a dropped reply. `ps -A | grep agent-browser` clean before any timing. Three
consecutive green runs, never one. Interleave arms within one page session. No
wondering without an earned observation.

**Completion metrics**

- **U0** `node docs/verification/wonderings/dataset-model.mjs` exits 0; the
  18-case/4-blank fixture returns **r = 1.00**; `Mammal` and `Order` each produce
  zero observations; Sleep earns no distribution wondering while Mass earns four
  tells; and after the fixture gains a 3-group categorical,
  `distribution-shape.mjs` reports group-comparison wonderings **> 0**.
- **U1** `lint.mjs` exits 0 on all 13 named pass/fail cases; `corpus.mjs` emits
  **≥ 40** triples, 100 % lint-clean, and exits non-zero on any failure.
  **Circulate the corpus before starting U2.**
- **U2** `scene-model.mjs` exits 0; during a `tutorial2` run the SceneModel issues
  **0** requests of its own.
- **U3** `engine.mjs` exits 0, asserting: nothing emitted above the flow
  threshold; one emitted within the stall threshold of a simulated stall; and the
  interval **lengthens monotonically** across three consecutive unacted wonderings.
- **U4** With `?wonderings=1`, the panel renders in the upper-right below CODAP's
  tool shelf on 3 consecutive loads; its computed z-index is strictly between
  `#codap` and `#stage`; Dot renders over it (screenshot); without the parameter
  and without the Dashboard toggle it is not in the DOM; a full
  `__demo.run('tutorial2','MakeScatterplot')` completes with all 8 Undo taps landing.
- **U5** 3 consecutive live runs each show a wondering within **22 s** of a
  qualifying scene change; `(await __engine.selfTest()).pass === true`; a scripted
  `tutorial2` run produces **0** ledger uptake entries; breadth counters non-zero.

**Boundaries — do not**

- edit `docs/CHARACTER.md` or `web/src/behavior-engine.js`
- let wondering text reach `Axolotl.emote()`
- inject anything into CODAP's DOM, or make the panel clickable
- add an npm dependency or a test runner
- emit a wondering that no analysis earned
- call a model at runtime
- tune any constant from numbers measured on a different browser profile

**Bail out and report — do not decide**

- `docs/CHARACTER.md` would have to change
- the panel cannot sit upper-right without covering CODAP's own chrome at 1024 px
- `__engine.selfTest()` reports `pass: false` and the cause is not in our files
- any nonzero spend

Adding the 3-group categorical to `web/src/demo/fixture.js` is **in scope for U0**,
not a bail-out: three wondering families produce nothing without it.

An honest failure here is a unit whose metric does not pass, written up with the
measurement that shows it. A dishonest one is a metric relaxed to fit the result.
