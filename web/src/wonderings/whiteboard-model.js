/**
 * whiteboard-model.js — the student's own wonderings: stems, slots, and whether
 * the student has gone and looked.
 *
 * WHY THIS EXISTS. Everything in web/src/wonderings/ so far makes the SYSTEM ask
 * and the student answer or ignore. Palincsar & Brown (1984) ran the control for
 * that: helping students *answer* provided questions produced "no reliable
 * improvement", while getting them to *produce* questions was the whole effect.
 * See docs/verification/wonderings/pedagogy-literature.md §5 — and note its
 * header, the citations there are unverified.
 *
 * WHY STEMS AND NOT A TEXT BOX. Two reasons, one pedagogical and one mechanical.
 * Rosenshine, Meister & Chapman (1996) found generic question stems the single
 * most effective prompt type in their meta-analysis (ES 1.12), and Yu, Tsai & Wu
 * (2013) raised fifth-graders' question quality — including originality — with
 * 14 stems each paired with a worked example. Mechanically: a FILLED STEM IS
 * MACHINE-READABLE AND FREE TEXT IS NOT. Dot can only notice that you have not
 * investigated your own wondering if she knows which columns it names.
 *
 * The blank stays the student's. The system supplies the form, never the
 * content — that is the distinction docs/verification/wonderings/pedagogy-literature.md
 * §4a calls the untested crux, and this is the side of it with the evidence.
 *
 * Pure: no DOM, no clock, no randomness. `nowSeconds` is always a parameter.
 */

/** Slot kinds a stem can ask for. `any` accepts either column type. */
const NUMERIC = 'numeric';
const CATEGORICAL = 'categorical';
const ANY = 'any';

/**
 * The stems, deliberately few. Six, not Yu's fourteen: every one maps onto a
 * family the analysis side can already reason about, so a filled stem always
 * has a detectable investigation. A seventh stem with no detector would be a
 * wondering Dot could never notice, which reads as her ignoring you.
 */
export const STEMS = Object.freeze([
  Object.freeze({ id: 'distribution', family: 'distribution',
    before: 'What does the distribution of ', middle: null, after: ' look like?',
    slots: Object.freeze([NUMERIC]) }),
  Object.freeze({ id: 'relationship', family: 'relationship',
    before: 'How does ', middle: ' go with ', after: '?',
    slots: Object.freeze([NUMERIC, NUMERIC]) }),
  Object.freeze({ id: 'comparison', family: 'comparison',
    before: 'How does ', middle: ' compare across ', after: '?',
    slots: Object.freeze([NUMERIC, CATEGORICAL]) }),
  Object.freeze({ id: 'grouping', family: 'grouping',
    before: 'What happens if we group by ', middle: null, after: '?',
    slots: Object.freeze([CATEGORICAL]) }),
  Object.freeze({ id: 'filtering', family: 'filtering',
    before: 'What if we only looked at ', middle: null, after: '?',
    slots: Object.freeze([ANY]) }),
  Object.freeze({ id: 'ordering', family: 'ordering',
    before: 'What if we sort by ', middle: null, after: '?',
    slots: Object.freeze([ANY]) }),
]);

export const STEM_IDS = Object.freeze(STEMS.map((s) => s.id));

/** Investigation states, in the order they progress. */
export const UNTOUCHED = 'untouched';
export const PARTIAL = 'partial';
export const INVESTIGATED = 'investigated';

/** A stem by id, or null. Never throws on junk. */
export function stemById(id) {
  return STEMS.find((s) => s.id === id) ?? null;
}

/**
 * Which of a dataset's columns may fill slot `i` of this stem. Identifiers are
 * excluded everywhere — the same rule the analysis side applies, for the same
 * reason: grouping by a column with one value per case produces one group per
 * case, which is a tautology rather than a question.
 *
 * @param {Object} stem     from STEMS
 * @param {number} slotIndex
 * @param {Object[]} attrs  DatasetModel.attrs (see contracts.js)
 * @returns {string[]} column names, in dataset order
 */
export function candidatesFor(stem, slotIndex, attrs) {
  const want = stem?.slots?.[slotIndex];
  if (!want || !Array.isArray(attrs)) return [];
  return attrs
    .filter((a) => a && a.role !== 'identifier')
    .filter((a) => (want === ANY ? true : a.kind === want))
    .map((a) => a.name);
}

/**
 * Render a filled stem as the sentence the student sees. Unfilled slots come
 * back as a blank marker so the board reads as a form rather than a broken
 * sentence.
 */
export function renderStem(stem, filled = [], blank = '____') {
  if (!stem) return '';
  const a = filled[0] || blank;
  if (stem.slots.length === 1) return `${stem.before}${a}${stem.after}`;
  const b = filled[1] || blank;
  return `${stem.before}${a}${stem.middle}${b}${stem.after}`;
}

/** Stable identity, so the same wondering written twice is one wondering. */
export function wonderingKey(stemId, filled) {
  return `sw:${stemId}:${(filled ?? []).join('|')}`;
}

/**
 * Create a student wondering. Returns null when the stem is unknown or a slot
 * is unfilled — a half-written wondering is not posted, it is still being
 * written.
 */
export function createWondering(stemId, filled, nowSeconds) {
  const stem = stemById(stemId);
  if (!stem) return null;
  const names = (filled ?? []).slice(0, stem.slots.length);
  if (names.length !== stem.slots.length || names.some((n) => !n)) return null;
  if (new Set(names).size !== names.length) return null;   // "How does Mass go with Mass?"
  return {
    key: wonderingKey(stemId, names),
    stemId,
    family: stem.family,
    focus: Object.freeze([...names]),
    text: renderStem(stem, names),
    writtenAt: Number.isFinite(nowSeconds) ? nowSeconds : 0,
    nudges: 0,
    lastNudgeAt: -Infinity,
  };
}

/** Every attribute name visible on any component in the scene. */
function namesOnScreen(scene) {
  const out = new Set();
  for (const g of Array.isArray(scene?.graphs) ? scene.graphs : []) {
    for (const n of [g?.x, g?.y, g?.legend]) if (typeof n === 'string' && n) out.add(n);
  }
  for (const n of scene?.derived?.plottedAttrs ?? []) if (typeof n === 'string' && n) out.add(n);
  return out;
}

/** The focus names that appear TOGETHER on a single component. */
function namesTogether(scene, focus) {
  for (const g of Array.isArray(scene?.graphs) ? scene.graphs : []) {
    const on = new Set([g?.x, g?.y, g?.legend].filter((n) => typeof n === 'string' && n));
    if (focus.every((f) => on.has(f))) return true;
  }
  return false;
}

/**
 * Has the student gone and looked?
 *
 * Constrained on purpose, per the owner's decision: investigation means a
 * related graph or a data move, not merely hovering. A loose predicate makes
 * the signal unfalsifiable — the failure the uptake metric already demonstrated
 * (docs/verification/wonderings/BUILD-VERIFICATION.md).
 *
 *   untouched     no focus column appears anywhere, and none has been moved
 *   partial       some appear, or one was moved — begun, not finished
 *   investigated  ALL focus columns appear TOGETHER on one component
 *
 * A one-slot wondering therefore reaches `investigated` as soon as its column is
 * plotted; a two-slot one needs both on the same graph, which is exactly the
 * "began but did not answer it fully" case the nudge exists for.
 *
 * @param {Object} w      a student wondering
 * @param {Object} scene  SceneModel
 * @param {Set<string>} movedAttrs  columns touched by a data move this session
 */
export function investigationState(w, scene, movedAttrs = new Set()) {
  const focus = w?.focus ?? [];
  if (!focus.length) return UNTOUCHED;
  if (namesTogether(scene, focus)) return INVESTIGATED;
  const screen = namesOnScreen(scene);
  const touched = focus.filter((f) => screen.has(f) || movedAttrs.has(f));
  if (touched.length === focus.length) return INVESTIGATED;  // 1-slot, or both but apart
  return touched.length ? PARTIAL : UNTOUCHED;
}

/** Seconds a wondering must sit in each state before Dot will look at it. */
export const NUDGE_AFTER_SEC = Object.freeze({
  [UNTOUCHED]: 120,   // written and then walked away from
  [PARTIAL]: 240,     // begun and left half-done; longer, they ARE working
});
export const NUDGE_COOLDOWN_SEC = 300;   // between nudges for the SAME wondering
export const MAX_NUDGES = 3;             // then let it be — under-nudge, per PHASE7

/**
 * The one wondering worth Dot's attention right now, or null.
 *
 * De-escalating and bounded: each wondering is nudged at most MAX_NUDGES times,
 * and never twice inside NUDGE_COOLDOWN_SEC. `docs/PHASE7.md`'s rule — a missed
 * cheer is invisible, a wrong cheer is noise — applies with more force here,
 * because a reminder about something YOU wrote is the one move in this whole
 * system that could read as surveillance.
 */
export function nudgeTarget(wonderings, scene, movedAttrs, nowSeconds) {
  let best = null;
  for (const w of Array.isArray(wonderings) ? wonderings : []) {
    const state = investigationState(w, scene, movedAttrs);
    if (state === INVESTIGATED) continue;
    if ((w.nudges ?? 0) >= MAX_NUDGES) continue;
    if (nowSeconds - (w.lastNudgeAt ?? -Infinity) < NUDGE_COOLDOWN_SEC) continue;
    const waited = nowSeconds - (w.writtenAt ?? 0);
    if (waited < NUDGE_AFTER_SEC[state]) continue;
    // Oldest-waiting first: the one most likely to have been forgotten.
    if (!best || waited > best.waited) best = { wondering: w, state, waited };
  }
  return best;
}

/** Session counts for the dashboard. Nothing here leaves the page. */
export function boardSummary(wonderings, scene, movedAttrs) {
  const list = Array.isArray(wonderings) ? wonderings : [];
  const byState = { [UNTOUCHED]: 0, [PARTIAL]: 0, [INVESTIGATED]: 0 };
  const attrs = new Set();
  const stems = new Set();
  for (const w of list) {
    byState[investigationState(w, scene, movedAttrs)] += 1;
    for (const f of w.focus ?? []) attrs.add(f);
    stems.add(w.stemId);
  }
  return {
    written: list.length,
    ...byState,
    distinctAttrs: attrs.size,      // the diversity measure, intra-student
    distinctStems: stems.size,
    nudges: list.reduce((n, w) => n + (w.nudges ?? 0), 0),
  };
}
