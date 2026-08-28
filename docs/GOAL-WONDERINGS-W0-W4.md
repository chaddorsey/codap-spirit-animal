# GOAL — Wonderings W0 → W4

Build the Wonderings system as nine independent pure modules plus a panel, so
CODAP occasionally shows one short rhetorical question earned by real analysis of
the student's own dataset.

Repo `codap-spirit-animal`, branch `fix/stale-iframe-document`, from `d18a172`.
Venue: `cd web && npm run dev`, then
`http://localhost:5199/codap-same.html?tutorial=2&wonderings=1`.
Measured 2026-08-28, reproducible from `docs/verification/wonderings/`:
`insight.js` returns **r = 0.29** for a perfect relationship with 4 blank cells in
18 cases; distribution analysis earns tells on **4 of 5** Mammals numerics and
correctly declines on Sleep; group-comparison earns **0**, because `Order` is 7
groups over 12 cases.

**Read before starting:**
`docs/plans/2026-08-28-002-feat-wonderings-parallel-build-plan.md`. **It governs;
this statement does not.** It carries the frozen contracts, the file-ownership
table, and the wave structure. Plan `-001` carries the rationale behind all of it.

**Discipline.** One module, one file, one owner, one node test — no two concurrent
agents edit the same file. Every module is pure: no browser globals, no
`Date.now()`, no `Math.random()`, no `performance.now()`. Named exports only. A
JSDoc header giving *why* with dated evidence. SCREAMING_SNAKE constants each
carrying unit and rationale. Tests are dependency-free `.mjs` that
`process.exit(1)` on failure. No wondering without an earned observation.

**Completion metrics**

- **W0** `node docs/verification/wonderings/distribution-shape.mjs` reports
  group-comparison wonderings **> 0** (currently 0), and the four existing scripts
  still run clean.
- **W1** every `docs/verification/wonderings/t-*.mjs` exits 0, and specifically:
  correlation returns **r = 1.00** on the 18-case/4-blank regression; distribution
  earns tells on Mass and **none on Sleep**; grouping classifies `Mammal` as
  identifier and suppresses `Order`; every family emits on the Mammals fixture and
  emits **nothing** when its evidence gate is unmet; lint passes all 13 named
  cases; the governor's interval **lengthens monotonically** across three
  consecutive unacted wonderings.
- **W2** `t-realize.mjs` exits 0 and 100 % of emitted strings pass the lint.
- **W3** `corpus.mjs` emits **≥ 40** triples, 100 % lint-clean, exits non-zero on
  any failure; `(await __engine.selfTest()).pass === true`; with `?wonderings=1`
  the panel renders upper-right with computed z-index strictly between `#codap`
  and `#stage`, and without the flag it is not in the DOM.
- **W4** every W1/W2 module carries a written verification verdict, and none ships
  with an unrefuted finding that a stub would pass its test.

**Boundaries — do not**

- edit `docs/CHARACTER.md` or `web/src/behavior-engine.js`
- touch `web/src/insight.js` or `web/src/codap-main.js` outside W3
- let wondering text reach `Axolotl.emote()`
- inject anything into CODAP's DOM, or make the panel clickable
- add an npm dependency or a test runner
- emit a wondering that no analysis earned
- call a model at runtime
- build the ledger or uptake instrumentation — deliberately out of scope

**Bail out and report — do not decide**

- `docs/CHARACTER.md` would have to change
- the panel cannot sit upper-right without covering CODAP's own chrome at 1024 px
- `__engine.selfTest()` reports `pass: false` and the cause is not in our files
- two waves need the same file and the ownership table cannot be honoured
- any nonzero spend

An honest failure here is a module whose metric does not pass, written up with the
measurement that shows it. A dishonest one is a metric relaxed to fit the result,
or a test written to pass a stub.
