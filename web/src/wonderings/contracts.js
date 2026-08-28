/**
 * contracts.js — the frozen data shapes of the Wonderings system.
 *
 * WHY THIS FILE EXISTS. Wonderings is built by ten agents working in parallel
 * (`docs/plans/2026-08-28-002-feat-wonderings-parallel-build-plan.md`, wave W0),
 * under the rule ONE MODULE, ONE FILE, ONE OWNER. Nobody may read anybody
 * else's file while it is being written, so the only thing holding the build
 * together is agreement on FIELD NAMES. That agreement lives here.
 *
 * This file is documentation that the type checker can read. It contains
 * JSDoc `@typedef` declarations and NOTHING ELSE — no classes, no validators,
 * no constants, no runtime logic of any kind. Deliberately: a validator here
 * would be an eleventh module with an eleventh owner, and every analysis and
 * family module would then depend on it at runtime rather than only at
 * authoring time. Modules are expected to import NOTHING from this file. If a
 * module needs a shape enforced, it enforces it itself.
 *
 * PROVENANCE. Every shape below is transcribed from the "Frozen contracts (W0)"
 * block of plan `-002`; the rationale for each field is in plan `-001`. The
 * numbers quoted in the field comments were measured 2026-08-28 against the
 * 12-case Mammals fixture (`web/src/demo/fixture.js`) and are reproducible from
 * `docs/verification/wonderings/`:
 *
 *   - distribution analysis earns tells on 4 of the 5 Mammals numerics and
 *     correctly declines on `Sleep`  (distribution-shape.mjs)
 *   - the significance floor at n = 12 is |r| >= 0.576, which 2 numeric pairs
 *     clear                          (against-real-fixture.mjs)
 *   - `Mammal` has cardinality 12 over 12 cases, i.e. it is an IDENTIFIER and
 *     must never be offered as a grouping; `Order` has 7 groups over 12 cases
 *     with a smallest group of 1, and must be suppressed on group count
 *                                     (against-real-fixture.mjs)
 *   - `Diet`, added in W0, is the one categorical that qualifies: 3 groups,
 *     smallest group 3               (distribution-shape.mjs)
 *
 * A NOTE ON OPTIONALITY. Fields written `foo?` are absent, not `null`, when
 * they do not apply — e.g. a categorical `Attr` carries no `mean`. Consumers
 * must test with `!= null` or `in`, never with truthiness, because `0` is a
 * legitimate value for `skew`, `eta2`, `strength` and `novelty`.
 *
 * PURITY. Nothing described here holds a DOM node, a timer, or a promise. The
 * one clock-shaped field, `Wondering.shownAt`, is written by the caller that
 * owns the clock (W3 integration) and is never read by a pure module.
 */

/**
 * One attribute of the student's dataset, after analysis.
 *
 * `kind` is what CODAP says the column is. `role` is what the analysis
 * concluded it is FOR, and it is the field that stops embarrassing wonderings:
 * an `identifier` (cardinality === caseCount, e.g. Mammals' `Mammal`) must
 * never be grouped by, and a `category` must never be treated as a measure.
 *
 * @typedef {Object} Attr
 * @property {string} name
 *   The attribute name exactly as CODAP reports it. Raw and possibly
 *   unreadable (`Ht_cm`); making it readable is the lint's job, not this one's.
 * @property {'numeric'|'categorical'} kind
 *   The column's declared type.
 * @property {'measure'|'identifier'|'category'} role
 *   What the analysis concluded the column is for. `identifier` means
 *   `cardinality === caseCount` — one distinct value per case.
 * @property {number} n
 *   Count of NON-BLANK cases for this attribute. Not the dataset's case count:
 *   blanks are why pairwise-complete correlation exists.
 * @property {number} [mean]        Numeric only. Arithmetic mean of non-blank values.
 * @property {number} [sd]          Numeric only. Population standard deviation.
 * @property {number} [median]      Numeric only.
 * @property {number} [skew]        Numeric only. Fisher-Pearson g1; |g1| > 1 reads as markedly skewed.
 * @property {number} [gapFrac]     Numeric only. Largest gap between sorted values, as a fraction of range, 0..1.
 * @property {number} [maxAbsZ]     Numeric only. Largest |z| over the values; the outlier tell.
 * @property {number} [cv]          Numeric only. sd / mean — the scale-free spread tell. Meaningless when mean is near 0.
 * @property {number} [cardinality] Categorical only. Count of distinct values.
 * @property {string[]} [categories] Categorical only. The distinct values, as strings.
 * @property {Object.<string, number>} [groupSizes]
 *   Categorical only. Case count per category, keyed by the category string.
 *   The min of these is what a family checks before comparing groups.
 */

/**
 * The whole dataset as the wondering families see it. Pure data: no CODAP
 * handles, no case ids, nothing that goes stale if the student edits a cell.
 *
 * `pairs` and `separations` are precomputed rather than left to each family so
 * that the arithmetic exists in exactly one place (`web/src/analysis/`) and the
 * seven families stay declarative. Both carry a `qualifies` flag: the analysis
 * decides whether the evidence clears its own gate, and a family that emits on
 * `qualifies === false` is a bug, because a wondering must be EARNED.
 *
 * @typedef {Object} DatasetModel
 * @property {string} context   The CODAP data context name, e.g. 'Mammals'.
 * @property {number} caseCount Total cases, blanks included.
 * @property {Attr[]} attrs
 * @property {Array<{a: string, b: string, r: number, rho: number, n: number, qualifies: boolean}>} pairs
 *   Every unordered numeric pair. `a`/`b` are attribute names; `r` is
 *   pairwise-complete Pearson and `rho` pairwise-complete Spearman, both over
 *   the `n` cases where BOTH values are present. A large |rho| - |r| gap is the
 *   curvature tell. `qualifies` is true when the pair clears the n-dependent
 *   significance floor (|r| >= 0.576 at n = 12).
 * @property {Array<{cat: string, num: string, eta2: number, groups: number, smallestGroup: number, qualifies: boolean}>} separations
 *   Every categorical x numeric combination. `eta2` is between-group over total
 *   variance, 0..1. `qualifies` is true only when eta2 clears its threshold AND
 *   the group count is under the ceiling AND `smallestGroup` is large enough —
 *   eta2 alone is inflated by group count, which is exactly why Mammals'
 *   `Order` (7 groups, smallest 1) must not qualify.
 */

/**
 * What is on screen right now — the second input to every family, and the
 * reason a wondering can be about the student's current view rather than about
 * the dataset in the abstract.
 *
 * `sceneVersion` is the staleness guard. It increments on every observed scene
 * change; a wondering records the version it was born under, and a premise
 * re-checked against a newer version may no longer hold. Undo is why this is
 * needed: `revert()` restores a scene without ever setting the flags a normal
 * edit sets.
 *
 * @typedef {Object} SceneModel
 * @property {Array<{id: (string|number), plotType: string, x: (string|null), y: (string|null), legend: (string|null), dataContext: string}>} graphs
 *   One entry per graph component. `x`, `y` and `legend` are attribute names or
 *   `null` when that axis is empty — an empty axis is a signal, not a gap.
 * @property {{plottedAttrs: string[], unplottedAttrs: string[], attrPairsPlotted: string[][], sceneVersion: number}} derived
 *   Cached rollups over `graphs`. `attrPairsPlotted` holds `[a, b]` name pairs
 *   already shown together, so a family does not wonder aloud about a
 *   relationship the student is already looking at. `sceneVersion` heals
 *   MONOTONICALLY: it only ever increases, so a stale snapshot is detectable
 *   even after a failed or concurrent read.
 */

/**
 * A single earned finding: the analysis's claim, before any words exist.
 *
 * The split between Observation and Wondering is the load-bearing one in this
 * design. An Observation is what the data supports and is fully testable in
 * node; a Wondering is one English rendering of it. Realization (W2) may fail
 * the lint and produce no Wondering at all — the Observation still stands.
 *
 * @typedef {Object} Observation
 * @property {string} family
 *   Which family earned it: 'distribution' | 'ordering' | 'relationship' |
 *   'second-dimension' | 'comparison' | 'grouping' | 'filtering'.
 * @property {string} key
 *   Stable identity, formatted `'family:context:attrs'` with the attribute
 *   names in a deterministic order. Two runs over the same data must produce
 *   the same key: it is the de-duplication key, the novelty key, AND the hash
 *   input that picks a phrasing in W2 — so it must not embed a timestamp,
 *   a random value, or a scene id.
 * @property {string} dataContext The context this was observed in.
 * @property {string[]} focus     Attribute names the wondering will be about, in speaking order.
 * @property {Object} evidence
 *   Family-specific numbers that justify the claim, e.g. `{ r, n }` or
 *   `{ eta2, groups, smallestGroup }`. Rendered into the "Dot's mind" panel as
 *   provenance; NEVER rendered into the wondering text, because the voice rule
 *   forbids statistics in the sentence.
 * @property {number} strength
 *   0..1. How strongly the data supports the claim. Ranking only — it is not a
 *   p-value and must not be shown to the student.
 * @property {number} novelty
 *   0..1. How new this is to THIS student in THIS session; 0 means recently
 *   said. Keeps a strong-but-stale finding from being repeated forever.
 * @property {{componentId: (string|number|null)}} scope
 *   The component the wondering is anchored to, or `componentId: null` when it
 *   is about the dataset rather than about anything on screen.
 */

/**
 * An Observation that has been given words and shown.
 *
 * `shownAt` and `state` exist in the contract even though the ledger and uptake
 * instrumentation are DELIBERATELY out of scope for this build (three reviewers
 * found there is no population to measure yet, and the metric it would feed
 * measures compliance rather than exploration). They are here so that
 * instrumentation can be added later without reshaping anything.
 *
 * @typedef {Object} Wondering
 * @property {string} id            Unique per shown wondering. Distinct from `observation.key`, which repeats.
 * @property {string} text          The rendered question. Interrogative, <= 70 characters, no statistics, no imperatives.
 * @property {Observation} observation The finding this renders. Kept so the premise can be re-checked before display.
 * @property {number|null} shownAt
 *   Epoch milliseconds when it was displayed, or `null` if not yet shown.
 *   Written by the caller that owns the clock — pure modules never set it.
 * @property {'pending'|'shown'|'faded'|'suppressed'} state
 *   `suppressed` means realization or the lint refused it, or its premise no
 *   longer held at display time. A suppressed Wondering is kept, not discarded:
 *   the refusals are the interesting half of the corpus.
 */

/**
 * The signature EVERY wondering family exports. Pure: no I/O, no clock, no
 * randomness, no browser globals. Same inputs, same outputs, forever — which is
 * what makes the corpus reproducible and every family testable in node.
 *
 * A family that finds nothing returns `[]`. That is the normal, correct,
 * frequent case: on Mammals, distribution analysis DECLINES on `Sleep`, and
 * declining is the difference between understanding a dataset and generating
 * sentences about one.
 *
 * @typedef {(dataset: DatasetModel, scene: SceneModel) => Observation[]} WonderingFamily
 */

export {};   // typedefs only — this module intentionally exports no value
