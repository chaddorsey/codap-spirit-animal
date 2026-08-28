/**
 * wonderings/index.js — the assembled pipeline: rows in, one earned question out.
 *
 * WHY THIS FILE EXISTS. Nine modules were written in parallel under the ONE
 * MODULE, ONE FILE, ONE OWNER rule of
 * `docs/plans/2026-08-28-002-feat-wonderings-parallel-build-plan.md`, and none of
 * them may import another's private helpers. Something has to say, once, in what
 * order they run and what shape passes between them. That is all this file is.
 * It holds NO analysis, NO thresholds and NO English: every number lives in
 * `web/src/analysis/`, every gate in `web/src/wonderings/families/`, every word
 * in `web/src/wonderings/realize.js`, and every rate constant in
 * `web/src/wonderings/governor.js`. If you are tempted to add a threshold here,
 * it belongs in one of those.
 *
 * THE FOUR STAGES, in the order `nextWondering` runs them:
 *
 *   1. `buildDatasetModel(rows)`  — raw CODAP cases to the `DatasetModel` of
 *      `contracts.js`. This is the stage that retires the two live defects
 *      measured 2026-08-28: `insight.js`'s parallel-index correlation, which
 *      reported r = 0.29 for a perfect relationship with 4 blank cells in 18
 *      cases (`docs/verification/wonderings/corr-pairing-bug.mjs`), and the
 *      absence of any identifier rule, which let `Mammal` — cardinality 12 over
 *      12 cases — score eta2 = 1.00 against every numeric in the fixture
 *      (`docs/verification/wonderings/against-real-fixture.mjs`).
 *   2. `observeAll(dataset, scene)` — the seven families, each of which may and
 *      routinely does return `[]`. On the 12-case Mammals fixture with an empty
 *      scene, `Sleep` earns no distribution observation at all, `Order` (7 groups
 *      over 12 cases, smallest 1) earns nothing anywhere, and `Mammal` is refused
 *      as an identifier. Declining is the feature.
 *   3. `realizeAll(observations)` — words, lint-gated. A refusal here does not
 *      discard the observation; it is kept with `state: 'suppressed'`, because
 *      the refusals are the interesting half of the corpus
 *      (`docs/verification/wonderings/corpus.txt`).
 *   4. the governor — whether now is a moment to say anything at all. Its rule is
 *      inverted from the obvious one: a student in flow gets FEWER wonderings,
 *      because `docs/CHARACTER.md` "never interrupt flow" is binding.
 *
 * PURITY. Everything here is pure: no browser globals, no `Date.now()`, no
 * `Math.random()`, no `performance.now()`. `nextWondering` is handed
 * `nowSeconds` rather than reading a clock, which is what lets
 * `docs/verification/wonderings/corpus.mjs` enumerate the whole system in node
 * and get byte-identical output on two runs.
 *
 * WHAT THIS FILE DOES NOT DO. It does not catch exceptions from a family. A
 * family that throws is a bug, and swallowing it here would turn that bug into
 * "the panel is quiet today", which is indistinguishable from the correct
 * behaviour. The integration site (`web/src/codap-main.js`) wraps the call
 * instead, where it can log the failure where a human will see it.
 */

import { correlatePairs } from '../analysis/correlation.js';
import { shape } from '../analysis/distribution.js';
import { columnNames, groupSizes, role, separations } from '../analysis/grouping.js';

import { distributionFamily } from './families/distribution.js';
import { orderingFamily } from './families/ordering.js';
import { relationshipObservations } from './families/relationship.js';
import { secondDimensionObservations } from './families/second-dimension.js';
import { observeComparison } from './families/comparison.js';
import { observeGrouping } from './families/grouping.js';
import { observeFiltering } from './families/filtering.js';

import { realize } from './realize.js';
import { shouldOffer } from './governor.js';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/**
 * Data context name used when the caller supplies none. Unitless string.
 * Every family declines outright on an empty context, because `Observation.key`
 * is `family:context:attrs` and an empty context makes the de-duplication key,
 * the novelty key and the phrasing hash all ambiguous at once. A caller that
 * forgot the name would therefore see total silence and no diagnosis, which is
 * the worst failure mode available; a visibly wrong name in the provenance panel
 * is the better one.
 */
const UNNAMED_CONTEXT = 'dataset';

/**
 * Fraction of an attribute's NON-BLANK cells, 0..1, that must parse as finite
 * numbers before the column reads as `kind: 'numeric'`. 0.8 is carried over
 * unchanged from `web/src/insight.js`'s original classifier so that this
 * rewrite does not silently re-type anybody's columns; the point of the rewrite
 * is the correlation and the identifier rule, not the typing. Below 1.0 because
 * one typo in one cell must not demote a whole measurement column — and
 * `analysis/grouping.js::role` insists on 1.0, which is why `attrRole` below
 * reconciles the two rather than trusting either alone.
 */
const NUMERIC_PARSE_RATIO = 0.8;

/**
 * The seven families, in the order `observeAll` runs them. Frozen: a consumer
 * that reordered this would change nothing about the OUTPUT — `observeAll`
 * sorts — but would change which family a reader believes runs first, and the
 * corpus is read by humans.
 */
export const FAMILIES = Object.freeze([
  Object.freeze({ name: 'distribution', observe: distributionFamily }),
  Object.freeze({ name: 'ordering', observe: orderingFamily }),
  Object.freeze({ name: 'relationship', observe: relationshipObservations }),
  Object.freeze({ name: 'second-dimension', observe: secondDimensionObservations }),
  Object.freeze({ name: 'comparison', observe: observeComparison }),
  Object.freeze({ name: 'grouping', observe: observeGrouping }),
  Object.freeze({ name: 'filtering', observe: observeFiltering }),
]);

/** Just the names, for a caller that wants to assert coverage without indexing. */
export const FAMILY_NAMES = Object.freeze(FAMILIES.map((f) => f.name));

/* ------------------------------------------------------------------ *
 * Stage 1 — the DatasetModel
 * ------------------------------------------------------------------ */

/** CODAP delivers empty cells as `''`, `null` or a missing key; whitespace counts. */
function isBlank(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

/**
 * Finite number or null. Stricter than `+v` on purpose, and for the same reason
 * as in `analysis/correlation.js`: `Number('')` is 0 and `Number(true)` is 1, so
 * a lax coercion turns blanks into observations at the origin and checkboxes
 * into measurements.
 */
function toNumber(v) {
  if (v == null || typeof v === 'boolean' || typeof v === 'object') return null;
  const s = typeof v === 'string' ? v.trim() : v;
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * `'numeric'` or `'categorical'` for one column.
 *
 * A declared kind always wins: a column of zip codes is categorical however it
 * parses, and CODAP knows that when we do not.
 */
function attrKind(values, declaredKind) {
  if (declaredKind === 'numeric' || declaredKind === 'categorical') return declaredKind;
  const present = values.filter((v) => !isBlank(v));
  if (present.length === 0) return 'categorical';
  const parsed = present.filter((v) => toNumber(v) !== null).length;
  return parsed / present.length >= NUMERIC_PARSE_RATIO ? 'numeric' : 'categorical';
}

/**
 * `'measure' | 'identifier' | 'category'`, reconciled with `kind`.
 *
 * `analysis/grouping.js::role` is the authority on the identifier rule and is
 * used unmodified — that is the whole point of this wave's grouping module, and
 * it is what stops `Mammal` (12 distinct values over 12 cases) from being offered
 * as a grouping and scoring eta2 = 1.00 against every numeric.
 *
 * The two reconciliations below exist because `role()` deliberately reads the
 * VALUES while `kind` may have been DECLARED, and the two can disagree:
 *
 *   - declared categorical, values all numeric (zip codes, class periods):
 *     `role()` says `'measure'`, and treating it as one would put zip codes on a
 *     correlation. Demoted to `'category'`.
 *   - typed numeric, one unparseable cell: `role()` insists on 100% parsing and
 *     falls through to `'category'`, which would exclude a real measurement
 *     column from every relationship and distribution wondering there is.
 *     Promoted to `'measure'`.
 *
 * `'identifier'` is never overridden in either direction. It is the one verdict
 * whose whole job is to refuse, and refusing wrongly costs one wondering while
 * accepting wrongly costs a sentence about African Elephant's mean.
 */
function attrRole(name, values, caseCount, kind) {
  const inferred = role(name, values, caseCount);
  if (inferred === 'identifier') return 'identifier';
  if (kind === 'categorical' && inferred === 'measure') return 'category';
  if (kind === 'numeric' && inferred === 'category') return 'measure';
  return inferred;
}

/** Distinct non-blank values as strings, in first-seen order. */
function categoriesOf(values) {
  const seen = [];
  for (const v of values) {
    if (isBlank(v)) continue;
    const s = String(v);
    if (!seen.includes(s)) seen.push(s);
  }
  return seen;
}

/**
 * One `Attr` (`contracts.js`). Optional fields are OMITTED rather than set to
 * `null` when they do not apply, exactly as the contract says — every family
 * tests them with `Number.isFinite`, and `null > 1` is `false` while
 * `null > -1` is `true`, so a null that leaked through would fire a tell on a
 * column that was never measured.
 */
function buildAttr(rows, name, caseCount, declaredKind) {
  const values = rows.map((r) => (r && typeof r === 'object' ? r[name] : undefined));
  const kind = attrKind(values, declaredKind);
  const attr = { name, kind, role: attrRole(name, values, caseCount, kind), n: 0 };

  if (kind === 'numeric') {
    const s = shape(values);
    attr.n = s.n;
    for (const field of ['mean', 'sd', 'median', 'skew', 'gapFrac', 'maxAbsZ', 'cv']) {
      if (Number.isFinite(s[field])) attr[field] = s[field];
    }
    return attr;
  }

  const categories = categoriesOf(values);
  attr.n = values.filter((v) => !isBlank(v)).length;
  attr.cardinality = categories.length;
  attr.categories = categories;
  attr.groupSizes = groupSizes(rows, name);
  return attr;
}

/**
 * Raw CODAP cases to a `DatasetModel`.
 *
 * @param {Array<Object>} rows One plain object per case; blanks may be `''`,
 *   `null`, `undefined` or a missing key.
 * @param {Object} [options]
 * @param {string} [options.context] The CODAP data context name. Defaults to
 *   `UNNAMED_CONTEXT` — see the constant for why silence is not the default.
 * @param {string[]} [options.attributeNames] Column order as CODAP reports it.
 *   Defaults to first-seen order over `rows`, which is deterministic but loses
 *   any column the first case happens to leave blank, so pass it when known.
 * @param {Object.<string, 'numeric'|'categorical'>} [options.declaredKinds]
 *   CODAP's declared types, which beat inference. See `attrKind`.
 * @returns {import('./contracts.js').DatasetModel}
 *   `pairs` covers every unordered pair of numeric MEASURES (identifiers
 *   excluded); `separations` covers every categorical — INCLUDING identifiers —
 *   crossed with every numeric measure, so that the provenance panel can show
 *   `{ eta2: 1, qualifies: false, reason: 'identifier' }` for `Mammal` rather
 *   than silently omitting the row a reader would go looking for.
 */
export function buildDatasetModel(rows, options = {}) {
  const all = Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : [];
  const context = typeof options.context === 'string' && options.context !== ''
    ? options.context
    : UNNAMED_CONTEXT;
  const declaredKinds = options.declaredKinds ?? {};
  const names = Array.isArray(options.attributeNames) && options.attributeNames.length
    ? options.attributeNames.filter((n) => typeof n === 'string' && n !== '')
    : columnNames(all);
  const caseCount = all.length;

  const attrs = names.map((name) => buildAttr(all, name, caseCount, declaredKinds[name]));

  const roles = {};
  for (const a of attrs) roles[a.name] = a.role;

  const numericMeasures = attrs
    .filter((a) => a.kind === 'numeric' && a.role === 'measure')
    .map((a) => a.name);
  const categoricals = attrs
    .filter((a) => a.kind === 'categorical' && a.role !== 'measure')
    .map((a) => a.name);

  return {
    context,
    caseCount,
    attrs,
    pairs: correlatePairs(all, numericMeasures),
    separations: separations(all, categoricals, numericMeasures, { roles }),
  };
}

/* ------------------------------------------------------------------ *
 * Stage 2 — the families
 * ------------------------------------------------------------------ */

/**
 * Every observation the seven families earn, strongest first.
 *
 * Deliberately UNCAUGHT: a family that throws propagates. See the header.
 *
 * @param {import('./contracts.js').DatasetModel} dataset
 * @param {import('./contracts.js').SceneModel} [scene]
 * @returns {import('./contracts.js').Observation[]} Sorted by strength
 *   descending, then novelty descending, then `key` ascending — a total order,
 *   so two runs over the same inputs produce byte-identical output.
 */
export function observeAll(dataset, scene) {
  const out = [];
  for (const family of FAMILIES) {
    const found = family.observe(dataset, scene);
    if (!Array.isArray(found)) continue;
    for (const o of found) if (o && typeof o === 'object') out.push(o);
  }
  return out.sort((a, b) => (b.strength - a.strength)
    || (b.novelty - a.novelty)
    || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/* ------------------------------------------------------------------ *
 * Stage 3 — words
 * ------------------------------------------------------------------ */

/**
 * Give one Observation words, as a `Wondering` (`contracts.js`).
 *
 * `id` is `key#phrasing` — stable, and DISTINCT from `observation.key`, which
 * repeats across scenes. A caller that needs one id per SHOWING (rather than one
 * per realization) owns the clock and appends to this; a pure module cannot.
 *
 * `shownAt` is always `null` here for the same reason: the contract says the
 * caller that owns the clock writes it.
 *
 * @param {import('./contracts.js').Observation} observation
 * @returns {import('./contracts.js').Wondering} Never `null`. A refusal comes
 *   back with `state: 'suppressed'`, `text: ''`, and `provenance.reason` — the
 *   refusals are half of what the corpus is for.
 */
export function realizeObservation(observation) {
  const realized = realize(observation);
  if (realized === null) {
    return {
      id: `${observation?.key ?? '?'}#suppressed`,
      text: '',
      observation,
      shownAt: null,
      state: 'suppressed',
      provenance: {
        family: observation?.family ?? null,
        key: observation?.key ?? null,
        focus: Array.isArray(observation?.focus) ? observation.focus.slice() : [],
        evidence: observation?.evidence && typeof observation.evidence === 'object'
          ? { ...observation.evidence }
          : {},
        // `realize()` returns a bare null, so the specific cause is not
        // recoverable here. The two that actually happen are an attribute name
        // that renders unreadably and a family with no phrasing of the right
        // arity; both are visible in the corpus from `focus` alone.
        reason: 'no phrasing survived the lint',
      },
    };
  }
  return {
    id: `${observation.key}#${realized.provenance.phrasing}`,
    text: realized.text,
    observation,
    shownAt: null,
    state: 'pending',
    provenance: realized.provenance,
  };
}

/**
 * Realize a whole list, keeping the refusals.
 *
 * @param {import('./contracts.js').Observation[]} observations
 * @returns {{wonderings: Object[], suppressed: Object[]}} Both arrays hold
 *   `Wondering`s in the input's order. `wonderings` is lint-clean by
 *   construction, because `realize()` shows nothing the lint refused.
 */
export function realizeAll(observations) {
  const wonderings = [];
  const suppressed = [];
  for (const o of Array.isArray(observations) ? observations : []) {
    const w = realizeObservation(o);
    (w.state === 'suppressed' ? suppressed : wonderings).push(w);
  }
  return { wonderings, suppressed };
}

/**
 * The whole analysis half of the pipeline, with no governor and no clock: what
 * this dataset and this scene earn, right now, in ranking order.
 *
 * This is the entry point the corpus uses, and the one to reach for when the
 * question is "what would it say?" rather than "should it speak?".
 *
 * @param {import('./contracts.js').DatasetModel} dataset
 * @param {import('./contracts.js').SceneModel} [scene]
 * @returns {{observations: Object[], wonderings: Object[], suppressed: Object[]}}
 */
export function wonderingsFor(dataset, scene) {
  const observations = observeAll(dataset, scene);
  const { wonderings, suppressed } = realizeAll(observations);
  return { observations, wonderings, suppressed };
}

/* ------------------------------------------------------------------ *
 * Stage 4 — should it speak at all?
 * ------------------------------------------------------------------ */

/**
 * One decision: say this, now, or stay quiet and say why.
 *
 * The governor runs FIRST and the analysis second, so that a student in flow
 * costs nothing at all — no correlation, no families, no realization. That
 * ordering is the reason the pipeline can run permanently
 * (plan `-001`, Risks: "permanent background cost").
 *
 * Pure: `nowSeconds` is a parameter. Nothing here mutates `governorState` —
 * applying `{ type: 'offered' }` through `governorReducer` is the caller's job,
 * because only the caller knows whether the panel actually displayed it.
 *
 * @param {Object} input
 * @param {import('./contracts.js').DatasetModel} input.dataset
 * @param {import('./contracts.js').SceneModel} [input.scene]
 * @param {Object} input.engineState  `BehaviorEngine.state`; read, never mutated.
 * @param {Object} input.governorState  From `initialGovernorState()`.
 * @param {number} input.nowSeconds  Monotonic seconds on the same base as
 *   `engineState.lastActionAt` — i.e. `performance.now() / 1000`.
 * @param {Iterable<string>} [input.saidKeys]  `Observation.key`s already shown
 *   this session. A key here is skipped: novelty is per student per session, and
 *   a pure family has no history to read.
 * @returns {{offer: boolean, reason: string, wondering: (Object|null),
 *            activity: string, observations: Object[], wonderings: Object[],
 *            suppressed: Object[]}}
 *   `reason` is the governor's (`thrashing | dormant | in-flow | settling |
 *   too-soon | natural-pause | stalled`) or, when the moment was right but the
 *   data earned nothing new, `'nothing-new'`. `activity` is the governor's
 *   verdict on the student regardless of whether anything was offered, so the
 *   dashboard can show why it is quiet.
 */
export function nextWondering(input) {
  const {
    dataset, scene, engineState, governorState, nowSeconds, saidKeys = [],
  } = input ?? {};

  const gate = shouldOffer(engineState, governorState, nowSeconds);
  if (!gate.offer) {
    return {
      offer: false,
      reason: gate.reason,
      wondering: null,
      activity: gate.reason,
      observations: [],
      wonderings: [],
      suppressed: [],
    };
  }

  const { observations, wonderings, suppressed } = wonderingsFor(dataset, scene);
  const said = new Set(saidKeys);
  const pick = wonderings.find((w) => !said.has(w.observation.key)) ?? null;

  return {
    offer: pick !== null,
    reason: pick === null ? 'nothing-new' : gate.reason,
    wondering: pick,
    activity: gate.reason,
    observations,
    wonderings,
    suppressed,
  };
}

/* ------------------------------------------------------------------ *
 * Re-exports
 *
 * So the integration site imports ONE module rather than five, and so that
 * moving a constant between modules cannot break `codap-main.js`. Nothing is
 * re-wrapped: these are the same bindings the owning modules export.
 * ------------------------------------------------------------------ */

export { PARTIAL_FRAMING_LABEL, REALIZABLE_FAMILIES, realize } from './realize.js';
export { lintWondering, renderAttributeName } from './lint.js';
export {
  ACTIVITY_STATES, GOVERNOR_CONSTANTS, activityState, governorReducer,
  initialGovernorState, intervalSeconds, shouldOffer,
} from './governor.js';
