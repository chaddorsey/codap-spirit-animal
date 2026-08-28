/**
 * lint.js — the wondering lint: what separates a wondering from a tutor.
 *
 * WHY THIS FILE EXISTS. Every wondering the system shows is assembled from a
 * hand-written phrasing plus attribute names taken verbatim from the student's
 * own dataset (`docs/WONDERINGS.md` §9.4, plan `-001` "Voice"). Both halves can
 * fail, and they fail in different ways, so both are checked here — this is the
 * one gate every realization passes through regardless of source
 * (`web/src/wonderings/realize.js`, W2), and the mechanical half of the corpus
 * test (`docs/verification/wonderings/corpus.mjs`, W3).
 *
 * PROVENANCE OF THE SIX ORIGINAL RULES. Promoted from the working prototype
 * `docs/verification/wonderings/lint-feasibility.mjs` (2026-08-28), which was
 * written to answer whether §9.4's rules are sufficient BEFORE committing to
 * them. Measured result: they separate wondering from tutor on all 13 named
 * cases. The failure they catch is the register trap of §9.2 — *"What does that
 * legend tell us?"* is a question with a right answer already in mind, quietly
 * assessing the student, and it breaks the character doctrine as surely as an
 * instruction would. Its legitimate sibling, *"Do the colours stack up, or mix
 * together?"*, is the same subject with no answer presumed.
 *
 * NO PRESUPPOSITION GUARD, DELIBERATELY. The prototype's one known blind spot
 * is presupposition: *"Why do the colours mix together?"* assumes they do, and
 * no regex finds that. Plan `-002` removes the guard from this build
 * (plan `-001` U1: "with a fixed set of hand-written phrasings a human has read,
 * it protects nothing and gates on an unsolved problem"). The four boundary
 * cases the prototype left open therefore all PASS, and
 * `docs/verification/wonderings/t-lint.mjs` locks that in so a later agent does
 * not quietly re-add the guard. If phrasings ever become generated rather than
 * written, this decision must be revisited.
 *
 * THE RULE ADDED HERE: ATTRIBUTE-NAME READABILITY. A template interpolates a
 * raw column name, so *"How does Ht_cm go with msleep?"* is lint-clean under all
 * six original rules — interrogative, 33 characters, no digits, no statistics,
 * no imperative, no second person — and completely unreadable. Real CODAP
 * columns are named `Ht_cm`, `msleep`, `body_wt`, `LifeSpan`. So:
 *
 *   1. RENDER  every attribute name before it reaches a sentence:
 *      de-underscore, split camelCase, then lowercase every word except an
 *      all-caps acronym of 2..4 letters (`BMI` stays `BMI`; `LifeSpan` becomes
 *      `life span`; `Mass` becomes `mass`). Lowercase, because names appear
 *      mid-sentence and a mid-sentence capital reads as a proper noun.
 *   2. REJECT what rendering cannot save. `Ht_cm` renders to `ht cm`, which is
 *      not English; `msleep` renders to itself, which is not English either.
 *      The test is phonotactic and closed-list, not a dictionary: every word
 *      must contain a vowel, must begin with a consonant cluster English
 *      actually uses as an onset (`sl` yes, `msl` no, `ht` no), and must end in
 *      a cluster English actually uses as a coda (`ght` yes, `wt` no).
 *   3. SUPPRESS on rejection. `lintWondering` returns `ok: false` with an
 *      `unreadable attribute name` violation, and the caller drops the whole
 *      wondering — there is no repair path, because the system does not know
 *      what `Ht_cm` is short for and must not guess in front of a student.
 *
 * The phonotactic lists err toward rejection, and that is the intended
 * direction: this module inherits `web/src/data-moves.js`'s philosophy on
 * unknowns — prefer UNDER-emitting. A suppressed wondering is invisible; an
 * unreadable one is noise in the student's peripheral vision.
 *
 * PURITY. No browser globals, no clock, no randomness — same inputs, same
 * violations, forever, which is what makes the corpus reproducible in node.
 * Named exports only.
 */

/* ------------------------------------------------------------------ *
 * The six original rules, promoted verbatim from the prototype.
 * ------------------------------------------------------------------ */

/** Characters. Hard cap from `docs/WONDERINGS.md` §9.4; the target is ~8 words,
 *  and the panel is peripheral, so a sentence that needs a second glance has
 *  already cost more attention than the wondering is worth. */
export const MAX_WONDERING_CHARS = 70;

/** Closed list of statistical vocabulary. A wondering states no statistics: the
 *  evidence lives in `Observation.evidence` and is rendered as provenance in the
 *  "Dot's mind" panel, never in the sentence. */
const STATISTICAL_VOCABULARY = /\b(correlat\w*|signific\w*|strong\w*|weak\w*|average|mean|median|r=|r =|standard deviation|variance|outlier|trend)\b/i;

/** Verbs that open an instruction. An instruction is not a wondering; it is the
 *  tutor register the whole design exists to avoid. Anchored to the start. */
const IMPERATIVE_OPENING = /^(try|drag|look|notice|click|put|add|make|use|check|see|find|explore|consider)\b/i;

/** Second-person assessment (§9.2, the register trap). The load-bearing form of
 *  the rule is *never ask what you cannot hear*: the panel has no ears, so a
 *  question addressed to the student is a quiz, not a wondering. */
const SECOND_PERSON_ASSESSMENT = /\b(you|your|we|us|our)\b|\bwhat (does|do|can) \b|tell us|did you|have you|can you/i;

/** Any digit. Digits are statistics wearing a disguise ("a correlation of
 *  -0.74" survives the vocabulary list if the word is dropped). */
const ANY_DIGIT = /\d/;

/* ------------------------------------------------------------------ *
 * The attribute-name rules added in this module.
 * ------------------------------------------------------------------ */

/** Characters, for one rendered attribute name. Rationale: the longest
 *  two-name frame in use, "How does ___ go with ___?", is 21 characters of
 *  frame, leaving 49 of the 70-character budget for two names. */
const MAX_RENDERED_NAME_CHARS = 24;

/** Words, per rendered attribute name. More than three words reads as a phrase
 *  rather than as the name of a column, and drags the sentence past 8 words. */
const MAX_RENDERED_NAME_WORDS = 3;

/** Letters. An all-caps run this short is read aloud as an acronym (`BMI`,
 *  `GDP`, `PH`) and stays capitalised; longer all-caps is shouting and is
 *  lowercased like anything else. */
const ACRONYM_MAX_LETTERS = 4;

/** Vowels for the phonotactic test. `y` counts: `body`, `dry`, `myth` are
 *  pronounceable and would otherwise be rejected for having no vowel. */
const VOWELS = 'aeiouy';

/** Closed list of consonant clusters English uses word-initially. This is the
 *  rule that tells `sleep` from `msleep` and rejects `ht`, `kg`, `bmi`.
 *  Empty string = the word begins with a vowel (`order`, `age`). */
const ENGLISH_ONSETS = new Set([
  '',
  'b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's',
  't', 'v', 'w', 'x', 'y', 'z',
  'bl', 'br', 'ch', 'cl', 'cr', 'dr', 'dw', 'fl', 'fr', 'gl', 'gn', 'gr', 'kn',
  'ph', 'pl', 'pr', 'ps', 'pt', 'qu', 'rh', 'sc', 'sh', 'sk', 'sl', 'sm', 'sn',
  'sp', 'st', 'sw', 'th', 'tr', 'tw', 'wh', 'wr',
  'chr', 'phl', 'phr', 'sch', 'scl', 'scr', 'shr', 'sph', 'spl', 'spr', 'squ',
  'str', 'thr',
]);

/** Closed list of consonant clusters English uses word-finally. This is what
 *  rejects the mashed abbreviation `bodywt` (coda `wt`) while accepting
 *  `height` (coda `ght`) and `depth` (coda `pth`). Empty string = the word ends
 *  in a vowel (`life`, `data`). */
const ENGLISH_CODAS = new Set([
  '',
  'b', 'c', 'd', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'x', 'z',
  'ch', 'ck', 'ct', 'ff', 'ft', 'gh', 'ld', 'lf', 'lk', 'll', 'lm', 'lp', 'ls',
  'lt', 'mb', 'mp', 'nd', 'ng', 'nk', 'ns', 'nt', 'ph', 'pt', 'rd', 'rk', 'rl',
  'rm', 'rn', 'rp', 'rs', 'rt', 'sh', 'sk', 'sp', 'ss', 'st', 'th', 'ts', 'zz',
  'dth', 'ght', 'ngth', 'nth', 'pth', 'rth', 'tch',
]);

/** Every word-ish token in a sentence, with its offset. `_` is inside the token
 *  on purpose: `Ht_cm` must be seen as ONE raw column name, not as two words. */
const TEXT_TOKEN = /[A-Za-z][A-Za-z0-9_]*/g;

/** The one capitalised word that is never an attribute name, so mid-sentence
 *  capitalisation cannot be used as a name signal without excluding it. */
const CAPITALISED_NON_NAME = new Set(['I']);

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

/** Compare-key for "is this token the same name as that one": case, spaces,
 *  underscores and punctuation all removed. */
function normalizeName(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The leading consonant run of a lowercase word, i.e. everything before the
 *  first vowel. */
function onsetOf(word) {
  let i = 0;
  while (i < word.length && !VOWELS.includes(word[i])) i++;
  return word.slice(0, i);
}

/** The trailing consonant run of a lowercase word, i.e. everything after the
 *  last vowel. */
function codaOf(word) {
  let i = word.length - 1;
  while (i >= 0 && !VOWELS.includes(word[i])) i--;
  return word.slice(i + 1);
}

/**
 * Is one rendered word pronounceable English? Closed-list phonotactics, not a
 * dictionary: a dictionary is an npm dependency and this build may not add one.
 *
 * @param {string} word one word of a rendered attribute name
 * @returns {boolean}
 */
function isPronounceableWord(word) {
  // An acronym is read letter by letter, so phonotactics do not apply.
  if (/^[A-Z]{2,}$/.test(word) && word.length <= ACRONYM_MAX_LETTERS) return true;
  if (!/^[a-z]+$/.test(word)) return false;              // digits, stray caps
  if (word.length < 2) return false;                     // a bare letter is a label, not a word
  if (![...word].some((c) => VOWELS.includes(c))) return false;  // `ht`, `cm`, `kg`
  if (!ENGLISH_ONSETS.has(onsetOf(word))) return false;  // `msleep`, `bmi`
  if (!ENGLISH_CODAS.has(codaOf(word))) return false;    // `bodywt`
  return true;
}

/**
 * Render a raw CODAP attribute name for use inside a wondering, and say whether
 * the result is fit to show a student.
 *
 * The rendering rule, in order: trim; split camelCase and letter/digit
 * boundaries; turn `_`, `-` and `.` into spaces; collapse whitespace; then
 * lowercase every word except an all-caps acronym of at most
 * `ACRONYM_MAX_LETTERS` letters. Lowercase because the name lands mid-sentence,
 * where a capital reads as a proper noun.
 *
 * @param {string} raw the attribute name exactly as CODAP reports it
 * @returns {{ raw: string, text: string, readable: boolean, reason: (string|null) }}
 *   `text` is the best-effort rendering (possibly `''`). When `readable` is
 *   false the caller must SUPPRESS the wondering entirely: there is no repair
 *   path, because nothing here knows what `Ht_cm` is short for.
 */
export function renderAttributeName(raw) {
  const source = typeof raw === 'string' ? raw : '';
  const spaced = source
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')        // lifeSpan -> life Span
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')     // GDPPerHead -> GDP PerHead
    .replace(/([A-Za-z])(\d)/g, '$1 $2')           // attr2 -> attr 2
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = spaced ? spaced.split(' ') : [];
  const rendered = words
    .map((w) => (/^[A-Z]{2,}$/.test(w) && w.length <= ACRONYM_MAX_LETTERS ? w : w.toLowerCase()))
    .join(' ');

  const fail = (reason) => ({ raw: source, text: rendered, readable: false, reason });

  if (!rendered) return fail('empty after rendering');
  if (rendered.length > MAX_RENDERED_NAME_CHARS) {
    return fail(`${rendered.length} chars > ${MAX_RENDERED_NAME_CHARS}`);
  }
  if (words.length > MAX_RENDERED_NAME_WORDS) {
    return fail(`${words.length} words > ${MAX_RENDERED_NAME_WORDS}`);
  }
  for (const w of rendered.split(' ')) {
    if (!isPronounceableWord(w)) return fail(`"${w}" is not a readable word`);
  }
  return { raw: source, text: rendered, readable: true, reason: null };
}

/* ------------------------------------------------------------------ *
 * The lint
 * ------------------------------------------------------------------ */

/** Sentence-initial capitalisation of a rendered name is legitimate: "mass"
 *  becomes "Mass" when it opens the question. */
function sentenceCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Lint one realized wondering.
 *
 * @param {string} text  the rendered question
 * @param {string[]} [focus] `Observation.focus` — the attribute names, RAW as
 *   CODAP reports them, that this wondering is allowed to be about.
 * @returns {{ ok: boolean, violations: string[] }} `ok` is exactly
 *   `violations.length === 0`. The caller shows the text only when `ok`.
 */
export function lintWondering(text, focus = []) {
  const violations = [];
  const add = (v) => { if (!violations.includes(v)) violations.push(v); };

  if (typeof text !== 'string') return { ok: false, violations: ['not a string'] };
  const names = Array.isArray(focus) ? focus.filter((f) => typeof f === 'string') : [];

  // --- the six original rules -------------------------------------------
  if (!text.trim().endsWith('?')) add('not interrogative');
  if (text.length > MAX_WONDERING_CHARS) {
    add(`too long (${text.length} > ${MAX_WONDERING_CHARS})`);
  }
  if (ANY_DIGIT.test(text)) add('contains a digit');
  if (STATISTICAL_VOCABULARY.test(text)) add('statistical vocabulary');
  if (IMPERATIVE_OPENING.test(text.trim())) add('imperative opening');
  if (SECOND_PERSON_ASSESSMENT.test(text)) add('second-person / teacher register');

  // --- readability of every name this wondering is about -----------------
  const rendered = new Map();          // raw name -> render result
  for (const raw of names) {
    const r = renderAttributeName(raw);
    rendered.set(raw, r);
    if (!r.readable) add(`unreadable attribute name (${raw}: ${r.reason})`);
  }

  // Vocabulary the text is allowed to use as a name: each focus name raw, and
  // each word of its rendering.
  const allowed = new Set();
  for (const [raw, r] of rendered) {
    allowed.add(normalizeName(raw));
    if (r.text) for (const w of r.text.split(' ')) allowed.add(normalizeName(w));
  }

  // --- name-shaped tokens in the text ------------------------------------
  for (const m of text.matchAll(TEXT_TOKEN)) {
    const token = m[0];
    const atStart = m.index === 0;
    const nameShaped = token.includes('_')
      || /\d/.test(token)
      || /[a-z][A-Z]/.test(token)
      || /[A-Z]{2}[a-z]/.test(token)
      || (/^[A-Z]/.test(token) && !atStart && !CAPITALISED_NON_NAME.has(token));
    if (!nameShaped) continue;

    // The text used a raw column name where the rendering should have gone.
    const r = rendered.get(token);
    if (r && r.text && token !== r.text) {
      if (!(atStart && token === sentenceCase(r.text))) {
        add(`raw attribute name (${token}; expected "${r.text}")`);
      }
      continue;
    }
    if (r) continue;                                   // used exactly as rendered

    if (!allowed.has(normalizeName(token))) {
      add(`names an attribute not in focus (${token})`);
      continue;
    }
    // A word OF a focus name, but capitalised mid-sentence: the rendering rule
    // lowercases names, so this is a raw fragment that escaped it.
    if (/^[A-Z]/.test(token) && !/^[A-Z]{2,}$/.test(token)) {
      add(`raw attribute name (${token}; expected "${token.toLowerCase()}")`);
    }
  }

  return { ok: violations.length === 0, violations };
}
