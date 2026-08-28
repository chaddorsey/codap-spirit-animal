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
 * THREE OF THE SEVEN FAIL it, all on the same rule:
 *
 *   - *"What does the distribution of mass look like?"* — the second-person
 *     assessment rule matches `what does `, because §9.2's register trap is
 *     exactly the *"What does that legend tell us?"* shape.
 *   - *"What if we sort by mass?"* and *"What if we only looked at diet?"* —
 *     the editorial `we` is banned outright by the same rule. The load-bearing
 *     form of it is *never ask what you cannot hear*, and a panel that says "we"
 *     has cast itself as a person in the room.
 *
 * A fourth is worse than a failure: *"How do the means of ___ compare?"* PASSES,
 * because the statistical-vocabulary rule is `\bmean\b` and the plural blocks
 * the word boundary. Shipping it would be lawyering the gate, so the comparison
 * phrasings below avoid the word entirely.
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

/**
 * Which phrasing set an observation belongs to, or `null` when it belongs to
 * none. Only `filtering` has more than one, keyed by `evidence.kind`; an
 * unknown or absent kind is refused rather than defaulted, because the two
 * kinds make opposite claims about what to narrow.
 */
function variantOf(observation) {
  const byVariant = PHRASINGS[observation.family];
  if (!byVariant) return null;
  if (Object.prototype.hasOwnProperty.call(byVariant, SINGLE_VARIANT)) return SINGLE_VARIANT;
  const kind = observation.evidence == null ? undefined : observation.evidence.kind;
  return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(byVariant, kind)
    ? kind
    : null;
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
 * Refuses (returns `null`) when: the observation is not an object; its `family`
 * has no phrasings; `filtering` carries no usable `evidence.kind`; `focus` is
 * not a non-empty array of distinct non-empty strings; no phrasing speaks
 * exactly `focus.length` names; or every candidate phrasing fails the lint —
 * which is what happens when an attribute name renders unreadably (`Ht_cm`,
 * `msleep`), because there is no repair path and this module must not guess what
 * a column is short for in front of a student.
 *
 * @param {import('./contracts.js').Observation} observation
 * @returns {{text: string, provenance: Object}|null}
 *   `text` is lint-clean by construction. `provenance` is for the "Dot's mind"
 *   developer panel and the W3 corpus — it carries the evidence, the phrasing
 *   chosen and every phrasing refused along the way, with its violations. NONE
 *   of `provenance` may be shown to a student: `provenance.rejected[].text`
 *   holds strings that FAILED the lint, and `evidence` holds the statistics the
 *   voice rule keeps out of the sentence.
 */
export function realize(observation) {
  if (!observation || typeof observation !== 'object') return null;
  if (typeof observation.family !== 'string') return null;

  const variant = variantOf(observation);
  if (variant === null) return null;

  const focus = Array.isArray(observation.focus) ? observation.focus : null;
  if (!focus || focus.length === 0) return null;
  if (!focus.every((f) => typeof f === 'string' && f.trim() !== '')) return null;
  // Two slots filled with one attribute reads as a sentence about nothing
  // ("how does mass go with mass?") and is lint-clean, so the lint cannot catch
  // it. No family emits it; refuse it here so none ever can.
  if (new Set(focus).size !== focus.length) return null;

  const candidates = PHRASINGS[observation.family][variant]
    .filter((p) => p.slots === focus.length);
  if (candidates.length === 0) return null;   // an attribute in focus with no slot

  const rendered = focus.map((raw) => renderAttributeName(raw));
  const names = rendered.map((r) => r.text);

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
