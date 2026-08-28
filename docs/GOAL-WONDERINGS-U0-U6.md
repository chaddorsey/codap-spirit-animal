# GOAL — Wonderings U0 → U6

Ship an ambient "Wonderings" panel over CODAP showing one short rhetorical
question computed from the student's real dataset and current screen state,
hidden unless explicitly revealed.

Repo `codap-spirit-animal`, branch `fix/stale-iframe-document`, from `f213991`.
Venue: `cd web && npm run dev`, then
`http://localhost:5199/codap-same.html?tutorial=2&wonderings=1`.
Measured 2026-08-28, all reproducible from `docs/verification/wonderings/`:
`insight.js` returns **r = 0.29** for a perfect relationship with 4 blank cells
in 18 cases; on the Mammals fixture `Mammal` scores **eta² = 1.00** against every
numeric attribute; **Height × Sleep, r = −0.74** is the one sound pair.

**Read before starting:**
`docs/plans/2026-08-28-001-feat-wonderings-ambient-inquiry-plan.md`. **It
governs; this statement does not.** It carries the reading order, the unit
detail, and the fourteen corrections to `docs/WONDERINGS.md`.

**Discipline.** Reads retried, writes never (`DemoDriver.api()`). Never cache
`contentDocument`. Absence requires affirmative observation — never lower a count
from a dropped reply. `ps -A | grep agent-browser` clean before any timing. Three
consecutive green runs, never one. Interleave arms within one page session.

**Completion metrics**

- **U0** `node docs/verification/wonderings/dataset-model.mjs` exits 0; the
  18-case/4-blank fixture returns **r = 1.00**; `Mammal` and `Order` each produce
  zero observations.
- **U1** With `?wonderings=1`, panel left edge within 4 px of
  `[data-testid="tool-shelf-button-undo"]` on 3 consecutive loads. Without the
  parameter and without the Dashboard toggle: not in the DOM. A full
  `__demo.run('tutorial2','MakeScatterplot')` completes with all 8 Undo taps landing.
- **U2** `scene-model.mjs` exits 0. During a `tutorial2` run the SceneModel issues
  **0** requests of its own.
- **U3** `observers.mjs` exits 0; Mammals + a univariate Sleep plot emits
  `second-dimension` naming Height; legend = `Mammal` and legend = `Order` each
  emit nothing.
- **U4** `ledger.mjs` exits 0; a scripted `tutorial2` run produces **0** ledger
  uptake entries; uptake at 1:59 counts and at 2:01 does not.
- **U5** `lint.mjs` exits 0 on all 13 named pass/fail cases; `corpus.mjs` emits
  ≥ 40 triples, 100 % lint-clean, and exits non-zero on any failure.
- **U6** 3 consecutive live runs each show a wondering within 15 s of a univariate
  Sleep plot; `(await __engine.selfTest()).pass === true`.

**Boundaries — do not**

- edit `docs/CHARACTER.md` or `web/src/behavior-engine.js`
- let wondering text reach `Axolotl.emote()`
- inject anything into CODAP's DOM
- add an npm dependency or a test runner
- compose two observations into one wondering
- call a model at runtime in M0
- tune any constant from numbers measured on a different browser profile

**Bail out and report — do not decide**

- `docs/CHARACTER.md` would have to change
- the panel cannot avoid overlapping Undo/Redo at 1024 px — that is a design
  change, not a bug fix
- `__engine.selfTest()` reports `pass: false` and the cause is not in our files
- any nonzero spend

`attributeList` returning an unusable shape is **not** a bail-out: fall back to
inference, record the shape observed, continue — bail only if U0's metrics then fail.

An honest failure here is a unit whose metric does not pass, written up with the
measurement that shows it. A dishonest one is a metric relaxed to fit the result.
