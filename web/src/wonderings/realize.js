/**
 * realize.js — the only place an Observation is allowed to become English.
 *
 * WHY THIS FILE EXISTS. `web/src/wonderings/contracts.js` splits the finding
 * from the sentence: an Observation is what the data supports and is fully
 * testable in node; a Wondering is ONE English rendering of it. Everything up to
 * here is arithmetic that either earns a claim or declines. This module is where
 * the claim gets words — and where it can still fail, because words can be wrong
 * in ways numbers cannot. `realize()` returns `null` rather than a bad sentence,
 * and returning `null` is a normal outcome, not an error.
 *
 * THE LINT IS THE ONLY EXIT. Every candidate string is passed through
 * `lintWondering` from `web/src/wonderings/lint.js` before it can be returned.
 * There is deliberately no path around it: not a "trusted" template list, not a
 * short-circuit for the fixture, not a debug flag. The reason is that the
 * dangerous half of every sentence here is INTERPOLATED — a raw CODAP column
 * name the student typed — so a phrasing a human read and approved is still only
 * half of the output. `Ht_cm` and `msleep` render to `ht cm` and `msleep`, which
 * are not English, and the lint is what notices.
 *
 * WHY THE PHRASINGS BELOW ARE NOT THE STEMS IN PLAN `-001`. The family table in
 * `docs/plans/2026-08-28-001-feat-wonderings-ambient-inquiry-plan.md` writes the
 * seven families as *"What does the distribution of ___ look like?"*, *"What if
 * we sort by ___?"*, *"What if we only looked at ___?"*, and so on. Measured
 * 2026-08-28 by running those seven exact strings through this build's lint
 * (reproduce with `node docs/verification/wonderings/t-realize.mjs`, section 6),
 * THREE OF THE SEVEN FAIL it:
 *
 *   - *"What if we sort by mass?"* and *"What if we only looked at diet?"* —
 *     the editorial `we` is banned outright by the second-person rule. The
 *     load-bearing form of it is *never ask what you cannot hear*, and a panel
 *     that says "we" has cast itself as a person in the room.
 *   - *"How do the means of ___ compare?"* — the statistical-vocabulary rule.
 *
 * RE-MEASURED 2026-08-28 after `lint.js` was repaired, and TWO OF THE THREE
 * CHANGED, so the earlier reading of this section should be treated with the
 * suspicion a corrected measurement earns. The first measurement was taken
 * against a lint with two defects `docs/verification/wonderings/BUILD-
 * VERIFICATION.md` then recorded. It refused *"What does the distribution of
 * mass look like?"*, because the second-person rule matched the bare `what
 * does `; that was a FALSE POSITIVE against §9.2's actual register trap
 * (*"What does that legend tell us?"*, which assesses) and the repaired lint
 * accepts the distribution stem. And it PASSED *"How do the means of ___
 * compare?"*, because the vocabulary was `\bmean\b` and the plural blocked the
 * word boundary; the repaired lint refuses it in both numbers. The count is
 * unchanged at three of seven, and the design conclusion is unchanged and now
 * better supported: the comparison phrasings below were written to avoid the
 * word `mean` in any number on the grounds that passing on a technicality would
 * be lawyering the gate, and the gate has since closed the technicality.
 *
 * The stems are the FAMILIES' names, in other words, not shippable text. That
 * discovery is the main thing this module contributes: every phrasing below is
 * written to say the same thing without addressing the student and without the
 * editorial `we`, and every one of them is asserted lint-clean by the test.
 *
 * PARTIAL FRAMING, AND WHERE IT LIVES. Framing determines the SIGN of the effect
 * on student originality: George & Wiley (2020) found examples framed *"go past
 * these"* enhanced originality while bare exposure did nothing, and Gweon et al.
 * (2014) found children explore more broadly when they know a source omitted
 * something (`docs/verification/wonderings/pedagogy-literature.md` §4 — a lead
 * list with good provenance, not verified evidence). The STANDING framing is the
 * panel's job, not the sentence's: `PARTIAL_FRAMING_LABEL` below is the string
 * W3 should hand `createWonderingsPanel({ label })`, because a per-sentence
 * hedge would spend the 70-character budget on an apology and would repeat with
 * every wondering. What this module owns instead are two consequences of the
 * same finding:
 *   1. SEVERAL phrasings per family, so a corpus reads as a sample of a space
 *      rather than as a checklist. One phrasing per family would be a form to
 *      fill in.
 *   2. Every phrasing is open — `what if`, `might`, `would`, `is it` — and none
 *      presents itself as the question worth asking. There is no *"the"*
 *      question anywhere in the table below, deliberately.
 *
 * WHY SELECTION IS A HASH AND NOT A ROTATION OR A RANDOM PICK. Plan `-001` U1:
 * *"several phrasings per family, selected by a hash of `key`, so the same
 * observation always reads the same way."* Determinism is what makes the W3
 * corpus reproducible and reviewable — a rotation would make the corpus depend
 * on emission order, and `Math.random()` is banned outright for every module in
 * this wave. `Observation.key` is the right hash input because `contracts.js`
 * already guarantees it is stable across runs and carries no timestamp, no
 * random value and no scene id.
 *
 * WHAT MADE `key` -> text NOT A FUNCTION, AND WHAT FIXED IT. The hash is a
 * function of `key`, but the SENTENCE is not a function of the hash alone: the
 * chosen phrasing is filled with the focus names IN FOCUS ORDER. Measured
 * 2026-08-28 against the shipped corpus
 * (`docs/verification/wonderings/corpus.txt`): triples 4 and 36 both carry key
 * `relationship:Mammals:Height|Mass` and both select `rel-story`, and they read
 * *"Might height and mass be telling one story?"* and *"Might mass and height be
 * telling one story?"*. `families/relationship.js` SORTS the two names when it
 * builds the key but orders `focus` by what is on screen, so one key carried two
 * focus orders and the invariant above was false for every relationship
 * wondering in the corpus.
 *
 * The repair is `orderFocusByKey`: names are spoken in the order their raw
 * spellings appear inside `key`, and in `focus` order only when `key` does not
 * name every one of them exactly once. That makes the reading a function of
 * `key` wherever the key can settle it, and it preserves every ordering a family
 * DECLARED — `families/second-dimension.js` writes `partner|plotted` into its
 * key in the same order as `focus` (it calls that asymmetry load-bearing) and
 * `families/comparison.js` writes `measure` before `category`, so neither is
 * ever reordered. The only family reordered is the one that sorted its key,
 * which is exactly the family whose focus order the key had already discarded.
 *
 * NOT REPAIRED HERE, AND WHY. `families/filtering.js` leaves `evidence.kind` out
 * of its key, so an `outlier` and a `subgroup` observation over one attribute
 * would share a key and read differently. It cannot arise on any dataset —
 * `outlier` focuses a numeric attribute and `subgroup` a categorical one, and no
 * attribute is both — and the repair belongs in the key, which this module does
 * not own.
 *
 * TWO KINDS OF HOSTILE NAME. `Observation.family` and every entry of
 * `Observation.focus` are strings that arrive from CODAP, which means from
 * whatever the student typed, and both were used as object keys. Measured
 * 2026-08-28: `realize({family: 'constructor', evidence: {kind: 'keys'}})` THREW
 * (`PHRASINGS[observation.family][variant].filter is not a function`) because
 * `PHRASINGS[family]` walks the prototype chain and `hasOwnProperty` guarded
 * only the variant lookup; and a column named `__proto__` rendered to `proto`
 * and was spoken — *"What might the shape of proto be hiding?"* — as were
 * `valueOf` ("value of") and `propertyIsEnumerable`. Both lookups are now
 * own-property lookups, and any name resolving to a member of `Object.prototype`
 * is unrenderable: refused, not repaired, because `proto` is not what the column
 * is called and this module must not guess.
 *
 * THE DUPLICATE GUARD COMPARES WHAT IS SPOKEN, NOT WHAT IS STORED. Two distinct
 * raw names can render to one spoken name: `LifeSpan` and `Life_Span` both
 * become `life span`; `Mass` and `mass` both become `mass`. Measured 2026-08-28,
 * the raw-name guard passed both through and produced *"Does life span have
 * anything to do with life span?"* — the exact sentence the guard's own comment
 * says must never ship. The comparison is now on the rendered text, case-folded.
 *
 * A COLUMN NAME CAN STATE A STATISTIC. `lint.js` bans statistical vocabulary in
 * the sentence at word boundaries, which is the right rule for the phrasings:
 * they are fixed, and a human read them. The other half of every sentence is a
 * column name nobody reviewed, and the lint's terms are written in the forms
 * PROSE uses, not the forms a column name uses. Measured 2026-08-28: a column
 * named `Means` produced *"Where do the means values pile up?"* and `Strength`
 * produced *"Is strength spread evenly, or bunched together?"*, both lint-clean,
 * because `\bmean\b` misses the plural and `\bstrong\w*\b` does not reach
 * `strength`. So every name is checked twice here: through `lintWondering`
 * itself, in a neutral one-name frame — so anything the lint learns later is
 * inherited without editing this file — and against `STATISTICAL_NAME_WORDS`
 * below, which carries the lint's own terms in the shapes a column takes. A name
 * that states a statistic makes the whole wondering unrenderable. The cost is
 * that a dataset about material `Strength` loses its wonderings; that is the
 * under-emitting direction this build takes on unknowns everywhere else, and a
 * suppressed wondering is invisible while a statistic in the panel is a broken
 * promise.
 *
 * ARITY IS CHECKED, NOT PATCHED. Each phrasing declares how many attribute names
 * it speaks, and only phrasings whose `slots` EQUALS `focus.length` are
 * considered. So a distribution observation that somehow arrived carrying two
 * attributes has no template, and this returns `null` — rather than silently
 * dropping the second name and showing a sentence that is about less than the
 * analysis found. Both directions matter: a relationship observation carrying
 * one name would otherwise render as *"How does mass go with undefined?"*.
 *
 * THE FILTERING FAMILY BRANCHES ON `evidence.kind`. `families/filtering.js` earns
 * its observations two ways — `'outlier'` (one case doing all the work) and
 * `'subgroup'` (one kind of case worth seeing alone) — and says in its own header
 * that the two read differently in English. They do: one narrows a case away, the
 * other narrows to a group, and the same sentence cannot serve both. A filtering
 * observation carrying neither kind is not realizable, because guessing which it
 * is would put a sentence in front of a student that no analysis earned.
 *
 * PURITY. No browser globals, no `Date.now()`, no `Math.random()`, no
 * `performance.now()`. Same Observation in, byte-identical text out, forever.
 * Named exports only; no default export.
 */

import { lintWondering, renderAttributeName } from './lint.js';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/**
 * The standing label the panel should carry, and the whole of the partial
 * framing. Not used by this module — exported so that W3 passes ONE string to
 * `createWonderingsPanel({ label })` instead of inventing a second one.
 * Characters: 25, well inside the panel's 320 px at 14 px.
 */
export const PARTIAL_FRAMING_LABEL = 'Wonderings — some of many';

/** FNV-1a 32-bit offset basis. Unitless; the published constant. */
const FNV_OFFSET_BASIS = 0x811c9dc5;

/** FNV-1a 32-bit prime. Unitless; the published constant. FNV-1a is chosen over
 *  anything cleverer because it is eight lines, has no dependency, and is
 *  byte-stable across engines — the only three properties the phrasing hash
 *  needs. It is NOT a security hash and nothing here treats it as one. */
const FNV_PRIME = 0x01000193;

/** The variant key used by every family that has only one way of reading. Only
 *  `filtering` has more, and its variants are the two values of
 *  `evidence.kind`. */
const SINGLE_VARIANT = '*';

/** Characters that families use to join fields inside `Observation.key`: `:`
 *  between family, context and names, and `|` (relationship, second-dimension)
 *  or `~` (comparison, filtering, grouping) between the names themselves. Unit:
 *  literal characters, as a split pattern. This module does not BUILD keys, so
 *  it must be able to read one it did not write; splitting on all three is the
 *  whole of that reading, and a key using none of them simply falls back to
 *  focus order (see `orderFocusByKey`). Kept a superset on purpose — plan `-002`
 *  records the separator inconsistency as a known defect, and a reader that
 *  accepts both survives its repair either way. */
const KEY_FIELD_SEPARATORS = /[:|~]/;

/** Rendered attribute-name WORDS that state a statistic, matched whole and
 *  case-folded. Unit: complete words of a rendered name, never substrings —
 *  `model` must not be caught by `mode`, and `meaning` must not be caught by
 *  `mean`. Every entry is one of `lint.js`'s own statistical terms in a shape a
 *  COLUMN NAME takes rather than a shape prose takes; this list adds no term the
 *  lint does not already ban, it only adds morphology (`means`, `strength`,
 *  `averages`, `deviations`) that a word-boundary rule written for prose cannot
 *  reach. Names are additionally probed through `lintWondering` itself, so a
 *  term added to the lint later is inherited here without editing this list. */
const STATISTICAL_NAME_WORDS = Object.freeze(new Set([
  'average', 'averages', 'mean', 'means', 'median', 'medians',
  'correlation', 'correlations', 'correlate', 'correlates', 'correlated',
  'significance', 'strength', 'strengths', 'strong', 'weak', 'weakness',
  'deviation', 'deviations', 'sd', 'stdev', 'variance', 'variances',
  'outlier', 'outliers', 'trend', 'trends', 'trending',
]));

/** The frame a rendered name is probed in before it may be spoken. Unit: a
 *  complete candidate wondering, so that `lintWondering` — the only gate this
 *  module is allowed to consult — judges the NAME on its own. It is deliberately
 *  the blandest interrogative available and puts the name mid-sentence, so that
 *  position-sensitive rules (the imperative opening, which is anchored to `^`)
 *  cannot fire on the frame and cannot fire on a name that is only a problem at
 *  the start of a sentence — that case is already handled by the retry walk in
 *  `realize`, which tries the next phrasing. */
const nameProbe = (rendered) => `what about ${rendered}?`;

/** The `Observation.family` values this module can give words to. Exported so
 *  W3's corpus can assert it covers all seven rather than counting by eye. */
export const REALIZABLE_FAMILIES = Object.freeze([
  'distribution', 'ordering', 'relationship', 'second-dimension',
  'comparison', 'grouping', 'filtering',
]);

/* ------------------------------------------------------------------ *
 * The phrasings
 *
 * Every `build` receives the RENDERED attribute names (lowercase, de-underscored
 * — see `renderAttributeName`) in `Observation.focus` order, and returns an
 * all-lowercase sentence. Capitalisation of the first character happens once,
 * afterwards, in `capitalizeFirst`. Writing the templates lowercase is not a
 * style choice: the lint treats a mid-sentence capital as a raw column name that
 * escaped rendering, so a template that capitalised anything itself would be
 * rejected, and a template that opens with an attribute name must be capitalised
 * by the same rule that capitalises `what`.
 * ------------------------------------------------------------------ */

const PHRASINGS = Object.freeze({
  // "What does the distribution of ___ look like?" — the stem, unshippable:
  // `what does ` trips the register rule.
  distribution: {
    [SINGLE_VARIANT]: [
      { id: 'dist-shape', slots: 1, build: (n) => `what shape does ${n[0]} make?` },
      { id: 'dist-pile', slots: 1, build: (n) => `where do the ${n[0]} values pile up?` },
      { id: 'dist-even', slots: 1, build: (n) => `is ${n[0]} spread evenly, or bunched together?` },
      { id: 'dist-clumps', slots: 1, build: (n) => `${n[0]}: all of a piece, or in clumps?` },
      { id: 'dist-line', slots: 1, build: (n) => `how do the ${n[0]} values sit along a line?` },
      { id: 'dist-hiding', slots: 1, build: (n) => `what might the shape of ${n[0]} be hiding?` },
    ],
  },

  // "What if we sort by ___?" — the stem, unshippable: `we`.
  ordering: {
    [SINGLE_VARIANT]: [
      { id: 'ord-table', slots: 1, build: (n) => `what if the table were sorted by ${n[0]}?` },
      { id: 'ord-new', slots: 1, build: (n) => `would sorting by ${n[0]} show something new?` },
      { id: 'ord-hides', slots: 1, build: (n) => `what hides in ${n[0]} until it is sorted?` },
      { id: 'ord-top', slots: 1, build: (n) => `sorted by ${n[0]}, what comes to the top?` },
      { id: 'ord-smallest', slots: 1, build: (n) => `${n[0]} from smallest to largest: what appears?` },
    ],
  },

  // "How does ___ go with ___?" — the one stem that survives the lint intact,
  // and it leads the list for that reason.
  relationship: {
    [SINGLE_VARIANT]: [
      { id: 'rel-gowith', slots: 2, build: (n) => `how does ${n[0]} go with ${n[1]}?` },
      { id: 'rel-together', slots: 2, build: (n) => `do ${n[0]} and ${n[1]} travel together?` },
      { id: 'rel-anything', slots: 2, build: (n) => `does ${n[0]} have anything to do with ${n[1]}?` },
      { id: 'rel-changes', slots: 2, build: (n) => `as ${n[0]} changes, what happens to ${n[1]}?` },
      { id: 'rel-story', slots: 2, build: (n) => `might ${n[0]} and ${n[1]} be telling one story?` },
      { id: 'rel-against', slots: 2, build: (n) => `where does ${n[1]} sit against ${n[0]}?` },
    ],
  },

  // "Does ___ matter here too?" — `focus[0]` is the OFF-SCREEN partner and
  // `focus[1]` the attribute already on an axis (`families/second-dimension.js`
  // calls that asymmetry load-bearing). Naming the plotted attribute rather than
  // saying "here" is the better sentence and is what the two-slot phrasings do;
  // the one-slot set exists for an observation that carries only the partner,
  // and keeps "here" deictic to the graph the wondering is anchored to.
  'second-dimension': {
    [SINGLE_VARIANT]: [
      { id: 'sec-matter', slots: 2, build: (n) => `does ${n[0]} matter for ${n[1]} too?` },
      { id: 'sec-add', slots: 2, build: (n) => `what might ${n[0]} add to the ${n[1]} picture?` },
      { id: 'sec-change', slots: 2, build: (n) => `would ${n[0]} change how ${n[1]} looks?` },
      { id: 'sec-partof', slots: 2, build: (n) => `is ${n[0]} part of what ${n[1]} is doing?` },
      { id: 'sec-here', slots: 1, build: (n) => `does ${n[0]} matter here too?` },
      { id: 'sec-addhere', slots: 1, build: (n) => `what might ${n[0]} add here?` },
      { id: 'sec-picture', slots: 1, build: (n) => `would ${n[0]} change this picture?` },
    ],
  },

  // "How do the means of ___ compare?" — `focus` is `[measure, category]`, and
  // `families/comparison.js` says in its own header that naming both is the
  // better sentence. The word "means" is avoided throughout: the lint's
  // statistical-vocabulary rule bans `mean`, and passing on the technicality
  // that `\bmean\b` does not match the plural would be lawyering the gate.
  comparison: {
    [SINGLE_VARIANT]: [
      { id: 'cmp-differ', slots: 2, build: (n) => `does ${n[0]} differ from one ${n[1]} to the next?` },
      { id: 'cmp-across', slots: 2, build: (n) => `how does ${n[0]} compare across ${n[1]}?` },
      { id: 'cmp-same', slots: 2, build: (n) => `is ${n[0]} the same for every ${n[1]}?` },
      { id: 'cmp-most', slots: 2, build: (n) => `which ${n[1]} goes with the most ${n[0]}?` },
      { id: 'cmp-diff', slots: 2, build: (n) => `does ${n[1]} make a difference to ${n[0]}?` },
      { id: 'cmp-group', slots: 1, build: (n) => `does ${n[0]} differ from group to group?` },
      { id: 'cmp-every', slots: 1, build: (n) => `is ${n[0]} the same in every group?` },
    ],
  },

  // "How would that look grouped by ___?" — the stem, and it passes the lint as
  // written. "that" is deictic to the graph `families/grouping.js` requires
  // before it will emit at all, so every phrasing here keeps a pointing word.
  grouping: {
    [SINGLE_VARIANT]: [
      { id: 'grp-that', slots: 1, build: (n) => `how would that look grouped by ${n[0]}?` },
      { id: 'grp-colored', slots: 1, build: (n) => `what if those dots were colored by ${n[0]}?` },
      { id: 'grp-split', slots: 1, build: (n) => `would ${n[0]} split that picture apart?` },
      { id: 'grp-change', slots: 1, build: (n) => `grouped by ${n[0]}, does that picture change?` },
      { id: 'grp-do', slots: 1, build: (n) => `what would ${n[0]} do to that picture?` },
    ],
  },

  // "What if we only looked at ___?" — the stem, unshippable: `we`. The two
  // variants are `evidence.kind` from `families/filtering.js`.
  filtering: {
    outlier: [
      { id: 'flt-biggest', slots: 1, build: (n) => `what if the biggest ${n[0]} were left aside?` },
      { id: 'flt-farone', slots: 1, build: (n) => `how would ${n[0]} look with the far one set aside?` },
      { id: 'flt-running', slots: 1, build: (n) => `is one case running the whole ${n[0]} picture?` },
      { id: 'flt-without', slots: 1, build: (n) => `what might ${n[0]} look like without its far point?` },
    ],
    subgroup: [
      { id: 'flt-onlyone', slots: 1, build: (n) => `what if only one ${n[0]} were in view?` },
      { id: 'flt-ownnow', slots: 1, build: (n) => `how does one ${n[0]} look on its own?` },
      { id: 'flt-narrow', slots: 1, build: (n) => `what if the picture narrowed to one ${n[0]}?` },
      { id: 'flt-alone', slots: 1, build: (n) => `would one ${n[0]} alone tell a different story?` },
    ],
  },
});

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

/**
 * FNV-1a over a string, as an unsigned 32-bit integer.
 *
 * Exported because determinism is a claim about this function, and a test that
 * can only observe it through `realize()` can check that the same input gives
 * the same output but not that the mapping is spread over the phrasings at all.
 *
 * @param {string} key `Observation.key`
 * @returns {number} 0 .. 2^32 - 1
 */
export function phrasingHash(key) {
  const s = typeof key === 'string' ? key : '';
  let h = FNV_OFFSET_BASIS;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

/** Own-property lookup. Every table in this module is indexed by a string that
 *  came from CODAP, so `table[name]` is a prototype-chain walk with student
 *  input at the wheel: `PHRASINGS['constructor']` is a function, and indexing it
 *  again with an own member of `Object` reaches something with no `.filter`. */
function ownProperty(table, name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(table, name)
    ? table[name]
    : undefined;
}

/** Does this name resolve to a member of `Object.prototype`? Computed from the
 *  prototype itself rather than listed, so it cannot drift as engines add
 *  members. Covers `__proto__`, `constructor`, `valueOf`, `hasOwnProperty` and
 *  the rest — every one of which a student may legally type into a column
 *  header, and none of which may be used as a lookup key or spoken aloud. */
function isPrototypeMemberName(name) {
  return typeof name === 'string'
    && Object.prototype.hasOwnProperty.call(Object.prototype, name);
}

/**
 * The phrasing set an observation belongs to, or `null` when it belongs to
 * none. Only `filtering` has more than one, keyed by `evidence.kind`; an
 * unknown or absent kind is refused rather than defaulted, because the two
 * kinds make opposite claims about what to narrow.
 *
 * @param {Object} byVariant the family's own phrasing table
 * @param {Object} observation
 * @returns {string|null}
 */
function variantOf(byVariant, observation) {
  if (Object.prototype.hasOwnProperty.call(byVariant, SINGLE_VARIANT)) return SINGLE_VARIANT;
  const kind = observation.evidence == null ? undefined : observation.evidence.kind;
  return Array.isArray(ownProperty(byVariant, kind)) ? kind : null;
}

/**
 * The order the focus names are SPOKEN in, which must be a function of `key`.
 *
 * Names are ordered by where their raw spellings appear inside `key`. A key that
 * does not name every focus entry exactly once settles nothing, and focus order
 * stands — that is the normal case for a synthetic key (`relationship:Probe:3`)
 * and for any family that stops writing names into its key.
 *
 * @param {string[]} focus raw names, as the observation carries them
 * @param {*} key `Observation.key`
 * @returns {string[]} a NEW array; the observation is never mutated
 */
function orderFocusByKey(focus, key) {
  if (focus.length < 2 || typeof key !== 'string') return focus.slice();
  const fields = key.split(KEY_FIELD_SEPARATORS);
  const at = [];
  for (const raw of focus) {
    const first = fields.indexOf(raw);
    if (first === -1 || fields.indexOf(raw, first + 1) !== -1) return focus.slice();
    at.push(first);
  }
  return focus
    .map((raw, i) => ({ raw, at: at[i] }))
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.raw);
}

/**
 * The rendered form of one raw attribute name, or `null` when it is not fit to
 * put in front of a student. Three ways to fail, in order of how loudly they
 * fail: it resolves to an `Object.prototype` member (`__proto__` renders to the
 * plausible-looking `proto`, which is not what the column is called); it states
 * a statistic in a shape the lint's prose-shaped vocabulary misses (`Means`,
 * `Strength`); or `lintWondering` itself refuses the bare name — the probe
 * inherits every rule the lint has now and every rule it gains later.
 *
 * @param {string} raw
 * @returns {string|null}
 */
function speakableName(raw) {
  if (isPrototypeMemberName(raw)) return null;
  const rendered = renderAttributeName(raw);
  if (!rendered.readable) return null;
  for (const word of rendered.text.split(' ')) {
    if (STATISTICAL_NAME_WORDS.has(word.toLowerCase())) return null;
  }
  if (!lintWondering(nameProbe(rendered.text), [raw]).ok) return null;
  return rendered.text;
}

/** Sentence-initial capital. The templates are written lowercase throughout, so
 *  this is the only capitalisation in the module. */
function capitalizeFirst(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ------------------------------------------------------------------ *
 * Realization
 * ------------------------------------------------------------------ */

/**
 * Give one Observation words, or refuse.
 *
 * The phrasing is chosen by `phrasingHash(observation.key) % candidates.length`,
 * so one observation always reads the same way. If that phrasing fails the lint
 * the next is tried, wrapping, until the candidates run out — the walk is
 * forward from the hashed index rather than restarting, so a suppression cannot
 * change which phrasing a DIFFERENT observation gets.
 *
 * The names are spoken in the order `key` puts them in (`orderFocusByKey`), not
 * in `focus` order, because the invariant is about the key and two observations
 * can carry one key with their focus arrays in opposite orders.
 *
 * Refuses (returns `null`) when: the observation is not an object; its `family`
 * is not one of `REALIZABLE_FAMILIES`; `filtering` carries no usable
 * `evidence.kind`; `focus` is not a non-empty array of non-empty strings; two
 * focus names RENDER to the same spoken name; no phrasing speaks exactly
 * `focus.length` names; any name is unspeakable (`speakableName` — unreadable
 * like `Ht_cm` and `msleep`, an `Object.prototype` member like `__proto__`, or a
 * statistic like `Means`); or every candidate phrasing fails the lint. There is
 * no repair path in any of these cases: this module must not guess what a column
 * is short for in front of a student.
 *
 * @param {import('./contracts.js').Observation} observation
 * @returns {{text: string, provenance: Object}|null}
 *   `text` is lint-clean by construction. `provenance` is for the "Dot's mind"
 *   developer panel and the W3 corpus — it carries the evidence, the phrasing
 *   chosen and every phrasing refused along the way, with its violations.
 *   `provenance.focus` and `provenance.names` are in SPEAKING order and are
 *   index-aligned with each other; `provenance.focusAsGiven` is the
 *   observation's own `focus` order, kept so a reordering is auditable. NONE
 *   of `provenance` may be shown to a student: `provenance.rejected[].text`
 *   holds strings that FAILED the lint, and `evidence` holds the statistics the
 *   voice rule keeps out of the sentence.
 */
export function realize(observation) {
  if (!observation || typeof observation !== 'object') return null;

  const byVariant = ownProperty(PHRASINGS, observation.family);
  if (byVariant === undefined) return null;   // unknown family, or a prototype member

  const variant = variantOf(byVariant, observation);
  if (variant === null) return null;

  const given = Array.isArray(observation.focus) ? observation.focus : null;
  if (!given || given.length === 0) return null;
  if (!given.every((f) => typeof f === 'string' && f.trim() !== '')) return null;

  // The names are spoken in the order the KEY puts them in, so that two
  // observations sharing a key read identically even when their focus arrays
  // disagree — see the header. Never mutates `observation.focus`.
  const focus = orderFocusByKey(given, observation.key);

  const candidates = byVariant[variant].filter((p) => p.slots === focus.length);
  if (candidates.length === 0) return null;   // an attribute in focus with no slot

  const names = [];
  for (const raw of focus) {
    const spoken = speakableName(raw);
    if (spoken === null) return null;         // unreadable, hostile, or a statistic
    names.push(spoken);
  }

  // Two slots filled with one attribute reads as a sentence about nothing
  // ("how does mass go with mass?") and is lint-clean, so the lint cannot catch
  // it. No family emits it; refuse it here so none ever can. The comparison is
  // on what is SPOKEN: `LifeSpan` and `Life_Span` are two raw names and one
  // sentence, and it is the sentence the rule is about.
  const spokenKeys = names.map((n) => n.toLowerCase());
  if (new Set(spokenKeys).size !== spokenKeys.length) return null;

  const hash = phrasingHash(observation.key);
  const start = hash % candidates.length;
  const rejected = [];

  for (let step = 0; step < candidates.length; step++) {
    const index = (start + step) % candidates.length;
    const phrasing = candidates[index];
    const text = capitalizeFirst(phrasing.build(names));
    const verdict = lintWondering(text, focus);
    if (!verdict.ok) {
      rejected.push({ phrasing: phrasing.id, text, violations: verdict.violations });
      continue;
    }
    return {
      text,
      provenance: {
        family: observation.family,
        variant,
        key: typeof observation.key === 'string' ? observation.key : null,
        dataContext: observation.dataContext ?? null,
        focus: focus.slice(),
        focusAsGiven: given.slice(),
        names: names.slice(),
        phrasing: phrasing.id,
        phrasingIndex: index,
        phrasingCount: candidates.length,
        hash,
        attempts: step + 1,
        rejected,
        evidence: observation.evidence && typeof observation.evidence === 'object'
          ? { ...observation.evidence }
          : {},
        strength: Number.isFinite(observation.strength) ? observation.strength : null,
        novelty: Number.isFinite(observation.novelty) ? observation.novelty : null,
        framing: 'partial',
        lint: { ok: true, violations: [] },
      },
    };
  }

  return null;   // every phrasing refused — usually an unreadable attribute name
}
