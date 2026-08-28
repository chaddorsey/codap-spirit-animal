---
title: "feat: Wonderings — parallel build plan (ultracode)"
type: feat
status: active
date: 2026-08-28
supersedes: docs/plans/2026-08-28-001-feat-wonderings-ambient-inquiry-plan.md
goal: docs/GOAL-WONDERINGS-W0-W4.md
baseline: d18a172 (branch fix/stale-iframe-document)
---

# feat: Wonderings — parallel build plan

**This document governs.** It restructures plan `-001` for multi-agent execution.
Everything in `-001` about *what* to build and *why* still holds — the wondering
families, the engine design, the review findings, the owner's decisions. **Read
`-001` for rationale; read this for decomposition.** Where they conflict on
sequencing or file layout, this wins.

## Why this restructure exists

Plan `-001` has a bottleneck: **U0 bundles the correlation fix, distribution
shape, group separation, identifier detection and the fixture change into one
unit that every other unit waits on.** Serially that is fine. For parallel
execution it serializes the whole build behind one agent.

The work is in fact mostly **independent pure functions over a fixture that
already exists on disk** (`web/src/demo/fixture.js`, node-importable, verified).
Once the data contracts are frozen, nine modules can be written simultaneously by
agents that never touch the same file.

## The decomposition rule

**One module, one file, one owner, one node test.** No two concurrent agents edit
the same file. The only shared files — `web/src/insight.js` and
`web/src/codap-main.js` — are touched **exclusively in W3 by a single agent**,
after everything else exists.

## Frozen contracts (W0 — everything depends on these)

These shapes are the coordination mechanism. Once written, every other agent codes
against them without needing to see another agent's work.

```js
// web/src/wonderings/contracts.js — JSDoc typedefs only, no runtime logic

Attr        { name, kind:'numeric'|'categorical', role:'measure'|'identifier'|'category',
              n, mean?, sd?, median?, skew?, gapFrac?, maxAbsZ?, cv?,
              cardinality?, categories?, groupSizes? }

DatasetModel{ context, caseCount, attrs:Attr[],
              pairs:[{ a, b, r, rho, n, qualifies }],
              separations:[{ cat, num, eta2, groups, smallestGroup, qualifies }] }

SceneModel  { graphs:[{ id, plotType, x, y, legend, dataContext }],
              derived:{ plottedAttrs, unplottedAttrs, attrPairsPlotted, sceneVersion } }

Observation { family, key:'family:context:attrs', dataContext, focus:[names],
              evidence:{}, strength:0..1, novelty:0..1, scope:{ componentId } }

Wondering   { id, text, observation, shownAt, state }

// Family signature — pure, no I/O, no clock, no randomness:
//   (dataset: DatasetModel, scene: SceneModel) => Observation[]
```

## Waves

### W0 — Contracts and fixture (serial, one agent, small)

**Files owned:** `web/src/wonderings/contracts.js` (create),
`web/src/demo/fixture.js` (modify).

1. Write `contracts.js` exactly as above — JSDoc typedefs and nothing else.
2. Add a **`Diet` column to `MAMMALS`**: exactly 3 groups, each ≥ 3 of the 12
   cases, biologically correct (e.g. `meat` / `plant` / `both`). Add it to
   `MAMMALS_COLLECTION.attrs` as `categorical`. This unblocks three wondering
   families that currently produce nothing.

**Completion:** `node docs/verification/wonderings/distribution-shape.mjs` reports
group-comparison wonderings **> 0** (currently 0), and existing scripts still pass.

### W1 — Pure modules (nine agents, fully parallel)

Every one is pure, node-importable, zero browser globals, mirroring
`web/src/data-moves.js`. Every one ships its own test under
`docs/verification/wonderings/`.

| # | File owned | Does | Test |
|---|---|---|---|
| **A** | `web/src/analysis/correlation.js` | Pairwise-complete Pearson, Spearman, n-floor (\|r\| ≥ 0.576 at n=12) | `t-correlation.mjs` |
| **B** | `web/src/analysis/distribution.js` | skewness, largest-gap fraction, max\|z\|, coefficient of variation | `t-distribution.mjs` |
| **C** | `web/src/analysis/grouping.js` | eta², group-count ceiling, min group size, **identifier detection** (`cardinality === caseCount`) | `t-grouping.mjs` |
| **D** | `web/src/wonderings/families/distribution.js` + `ordering.js` | two families over module B's tells | `t-fam-shape.mjs` |
| **E** | `web/src/wonderings/families/relationship.js` + `second-dimension.js` | two families over module A | `t-fam-relation.mjs` |
| **F** | `web/src/wonderings/families/comparison.js` + `grouping.js` + `filtering.js` | three families over module C | `t-fam-group.mjs` |
| **G** | `web/src/wonderings/lint.js` | promote the prototype; add attribute-name readability + suppress fallback; **no presupposition guard** | `t-lint.mjs` |
| **H** | `web/src/wonderings/governor.js` | rate governor over `engine.state`; flow/pause/stall/thrash; de-escalating interval | `t-governor.mjs` |
| **I** | `web/src/scene-model.js` | concurrent snapshot, `driver.active` suspend, monotone healing, `sceneVersion` | `t-scene.mjs` |

**D, E and F depend on A/B/C only through `contracts.js`.** They may be written
concurrently: each imports the analysis module by path and codes against the
frozen `Attr` fields. If an analysis module is not yet on disk, the family agent
writes against the contract and its test uses a hand-built `DatasetModel` literal.

**Hard rules for every W1 agent:** no browser globals; no `Date.now()`,
`Math.random()`, `performance.now()`; named exports only; a JSDoc header stating
*why* with dated evidence; SCREAMING_SNAKE constants each carrying unit and
rationale; test is a dependency-free `.mjs` that `process.exit(1)`s on failure.

### W2 — Composition (two agents, parallel)

| # | File owned | Does | Test |
|---|---|---|---|
| **J** | `web/src/wonderings/realize.js` | Observation → text; several phrasings per family chosen by hash of `key`; lint-gated; **partial framing** ("some of many") | `t-realize.mjs` |
| **K** | `web/src/ui/wonderings-panel.js` | upper-right, **z-index 40**, `pointer-events:none`, four states, `destroy()`, session-long re-anchor, slow dwell not fast fade | `panel.md` protocol |

### W3 — Integration (one agent, serial — owns the shared files)

**Files owned:** `web/src/insight.js`, `web/src/codap-main.js`,
`web/src/wonderings/index.js` (create), `docs/verification/wonderings/corpus.mjs`.

Wire the modules together; point `insight.js` at `analysis/correlation.js` so the
pairwise fix reaches `wise-attend`; mount the panel behind `?wonderings=1` and a
Dashboard toggle; render provenance into the existing "Dot's mind" panel; emit the
corpus.

**This is the only agent permitted to touch `insight.js` or `codap-main.js`.**

### W4 — Adversarial verification (fan out, one agent per module)

For each W1/W2 module, an independent agent tries to **break** it: run its test,
attack the edge cases the test does not cover, and confirm the completion metric
cannot be satisfied by a stub. Default to "refuted" when uncertain.

## Completion metrics

Judgment-free, checkable by running a command.

- **W0** `distribution-shape.mjs` reports group-comparison wonderings > 0.
- **W1** every `t-*.mjs` exits 0. Specifically: correlation returns **r = 1.00**
  on the 18-case/4-blank regression (currently 0.29); distribution earns tells on
  Mass and **none on Sleep**; grouping classifies `Mammal` as identifier and
  suppresses `Order`; each family emits on the Mammals fixture and emits nothing
  when its evidence gate is unmet; lint passes all 13 named cases; the governor's
  interval lengthens monotonically across three unacted wonderings.
- **W2** `t-realize.mjs` exits 0 and every emitted string passes the lint.
- **W3** `corpus.mjs` emits **≥ 40** triples, 100% lint-clean, exits non-zero on
  any failure. `(await __engine.selfTest()).pass === true`.
- **W4** every module has a verification verdict recorded; no module ships with an
  unrefuted "stub would pass this" finding.

## Boundaries

Do not: edit `docs/CHARACTER.md` or `web/src/behavior-engine.js`; let wondering
text reach `Axolotl.emote()`; inject into CODAP's DOM; make the panel clickable;
add an npm dependency or test runner; emit a wondering no analysis earned; call a
model at runtime; touch `insight.js` or `codap-main.js` outside W3.

## What is deliberately NOT in this build

The ledger and uptake instrumentation (plan `-001` U5). Rationale: three reviewers
found there is no population to measure at M0, and the metric it would feed was
found to measure compliance rather than exploration. Build the system, look at the
corpus, then decide what to instrument. `Wondering.shownAt` and the state field
are in the contract so it can be added without reshaping anything.

## Sources

- Rationale, families, engine design, review findings: plan `-001`
- Short form: `docs/GOAL-WONDERINGS-W0-W4.md`
- Character doctrine (binding): `docs/CHARACTER.md`
- Measurements: `docs/verification/wonderings/*.mjs`
- Pedagogy (citations unverified): `docs/verification/wonderings/pedagogy-literature.md`
