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
 * FOUR OF THOSE RULES WERE RESTATED ON 2026-08-28, and the header of each one
 * below carries its own evidence. All four were found by adversarial
 * verification and are recorded in
 * `docs/verification/wonderings/BUILD-VERIFICATION.md` §1-§3; the 13 named cases
 * keep their verdicts unchanged, which is what makes the restatements safe.
 * The pattern in all four is the same, and it is worth naming, because it is the
 * one this module is most likely to repeat: EVERY ONE OF THEM WAS A RULE STATED
 * OVER A SURFACE FEATURE INSTEAD OF OVER THE PROPERTY THAT MATTERS.
 *
 *   1. `\bwhat (does|do|can)\b` was interrogative FORM standing in for
 *      assessment, and it silenced the Distribution family's own phrasing.
 *      Restated over the property — is this a question the panel could receive
 *      an answer to? — in `SECOND_PERSON_ASSESSMENT`.
 *   2. A closed list of fifteen imperative VERBS stood in for the imperative
 *      MOOD, and let *"Compare mass and life span?"*, *"Sort by mass?"* and
 *      *"Let's think about mass?"* straight through. Restated as a
 *      bare-infinitive opening in `opensWithBareInfinitive`.
 *   3. Six of twelve statistical terms were bare literals inside one
 *      `\b`-terminated group, so *"Do the outliers matter here?"* passed. Every
 *      alternative now covers its own inflections.
 *   4. The out-of-focus rule fired only on tokens that LOOKED like raw column
 *      names — capitalised, underscored, camelCase — while
 *      `renderAttributeName` lowercases every name by design, so the rule was
 *      dead for all well-formed output. Restated over `FRAME_WORDS`.
 *
 * A rule that is wrong in one direction is usually one restatement away from
 * being wrong in the other, so `t-lint.mjs` group H asserts a phrasing that MUST
 * pass beside every phrasing that must fail, for each of the four.
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
 * unreadable one is noise in the student's peripheral vision. `FRAME_WORDS`,
 * `QUESTION_OPENERS` and `ENGLISH_ONSETS` all lean the same way for the same
 * reason: a word this file has never heard of costs one phrasing, and
 * `realize()` simply tries the next.
 *
 * PURITY. No browser globals, no clock, no randomness — same inputs, same
 * violations, forever, which is what makes the corpus reproducible in node.
 * Named exports only.
 */

/* ------------------------------------------------------------------ *
 * The six original rules. Two stand exactly as the prototype wrote them
 * (the character cap and the digit rule); four were restated 2026-08-28
 * over the property each was standing in for — see the header.
 * ------------------------------------------------------------------ */

/** Characters. Hard cap from `docs/WONDERINGS.md` §9.4; the target is ~8 words,
 *  and the panel is peripheral, so a sentence that needs a second glance has
 *  already cost more attention than the wondering is worth. */
export const MAX_WONDERING_CHARS = 70;

/** Closed list of statistical vocabulary. A wondering states no statistics: the
 *  evidence lives in `Observation.evidence` and is rendered as provenance in the
 *  "Dot's mind" panel, never in the sentence.
 *
 *  EVERY ALTERNATIVE ENDS IN `\w*`, AND THAT IS THE WHOLE POINT (defect §2,
 *  2026-08-28). Six of the twelve used to be bare literals inside a group
 *  terminated by a single `\b`, so the plural walked straight through:
 *  *"Do the outliers matter here?"* and *"Do the means differ?"* both passed.
 *  A statistical term is a term in every inflection it has.
 *
 *  `mean` IS THE ONE EXCEPTION, and it is spelled `means?` rather than `mean\w*`
 *  on purpose: `mean\w*` also swallows *meaning*, *meant* and *meander*, and a
 *  student column named `Meaning` would then be unspeakable by every family.
 *  Measured 2026-08-28 against `t-realize.mjs`'s ordinary-word probes. The
 *  defect to close was the plural, and `means?` closes exactly that. */
const STATISTICAL_VOCABULARY =
  /\b(?:correlat\w*|signific\w*|strong\w*|weak\w*|averag\w*|means?\b|median\w*|varianc\w*|deviation\w*|outlier\w*|trend\w*|quartile\w*|percentile\w*)|\br\s*=/i;

/** Second-person assessment (§9.2, the register trap). The load-bearing form of
 *  the rule is *never ask what you cannot hear*: the panel has no ears, so a
 *  question addressed to the student is a quiz, not a wondering.
 *
 *  WHAT THIS RULE IS NOT (defect §1, 2026-08-28). It used to carry the
 *  alternative `\bwhat (does|do|can) \b`, written to catch *"What does that
 *  legend tell us?"*. That is a rule about INTERROGATIVE FORM, and the form is
 *  shared by *"What does the distribution of mass look like?"* — one of the five
 *  question types the owner asked for, and the most natural phrasing the
 *  Distribution family has. The rule is now stated over the property that
 *  actually separates them: is the question ADDRESSED to somebody, or does it
 *  ask for a REPORT the system has no way to receive? "What does X look like?"
 *  asks about the data. "What does X tell us?" asks the student to answer.
 *  `tell us` in the first alternative already caught the legend case, so
 *  dropping the form rule loses nothing the §9.2 example needed. */
const SECOND_PERSON_ASSESSMENT =
  /\b(you|your|yours|yourself|yourselves|we|us|our|ours)\b|\blet'?s\b|\b(tell|tells|telling|show|shows|showing|explain|explains|describe|describes|say|says)\s+(me|us|you)\b/i;

/** Words that may legitimately OPEN an English question: wh-words, auxiliaries,
 *  modals, copulas, pro-forms, determiners, prepositions and conjunctions.
 *
 *  WHY A LIST OF OPENERS AND NOT A LIST OF VERBS (defect §2, 2026-08-28).
 *  The old rule was a closed list of fifteen imperative verbs, and a closed verb
 *  list is the wrong shape: *"Compare mass and life span?"*, *"Sort by mass?"*,
 *  *"Watch how mass moves?"*, *"Describe the shape of mass?"* and *"Predict what
 *  mass does?"* all passed, because a tutor's verbs are not the fifteen somebody
 *  happened to think of. What every instruction shares is a GRAMMATICAL form —
 *  it opens with a bare infinitive. That cannot be enumerated, but its
 *  complement can: a question opens with a function word, with a participle
 *  (*"Sorted by mass, what comes to the top?"*), or by naming its own subject
 *  (*"Mass: all of a piece, or in clumps?"*). Anything else opening a sentence
 *  is a verb in bare form giving an order.
 *
 *  This list holds function words ONLY. A verb here would re-open the hole. */
const QUESTION_OPENERS = new Set([
  // wh-words
  'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how',
  'whether',
  // auxiliaries, copulas, modals
  'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did',
  'have', 'has', 'had', 'can', 'could', 'will', 'would', 'shall', 'should',
  'may', 'might', 'must',
  // pro-forms and determiners
  'i', 'it', 'its', 'they', 'them', 'their', 'he', 'she', 'his', 'her',
  'this', 'that', 'these', 'those', 'there', 'here', 'the', 'a', 'an',
  'all', 'any', 'both', 'each', 'every', 'either', 'neither', 'few', 'many',
  'more', 'most', 'much', 'no', 'none', 'one', 'other', 'another', 'some',
  'such', 'nothing', 'something', 'anything', 'everything',
  // prepositions, conjunctions, adverbs
  'about', 'above', 'across', 'after', 'again', 'against', 'along', 'among',
  'and', 'apart', 'around', 'as', 'at', 'before', 'behind', 'below', 'beside',
  'between', 'beyond', 'but', 'by', 'down', 'even', 'for', 'from', 'if', 'in',
  'inside', 'into', 'just', 'maybe', 'near', 'never', 'not', 'of', 'off', 'on',
  'once', 'only', 'or', 'out', 'outside', 'over', 'perhaps', 'so', 'still',
  'than', 'then', 'through', 'to', 'together', 'under', 'until', 'up', 'upon',
  'with', 'within', 'without',
]);

/** A sentence-opening word carrying tense or aspect is not a bare infinitive,
 *  so it is not an imperative: *"Sorted by mass, …"*, *"Grouping by diet, …"*.
 *  No English imperative ends in `-ed` or `-ing`. */
const INFLECTED_OPENING = /(?:ed|ing)$/i;

/**
 * The closed vocabulary a wondering's FRAME may use.
 *
 * WHY THIS EXISTS (defect §3, 2026-08-28). The rule that stops a wondering
 * naming an attribute outside its `focus` used to fire only on tokens that were
 * capitalised, underscored, digit-bearing or camelCase — and
 * `renderAttributeName` LOWERCASES every name by design, so the rule could not
 * see a single correctly-rendered name. It was dead for all well-formed output.
 * With only `focus` in hand, the one way to recognise a lowercase word as a
 * column name is to know every word that is NOT one. So: in a wondering that
 * declares a focus, every word is either in this list or is one of that
 * wondering's own attribute names.
 *
 * NOUNS ARE ADMITTED ONLY WHERE A SHIPPED PHRASING NEEDS ONE, because every
 * noun admitted here is a column name this rule can no longer see (`shape`,
 * `line`, `group`, `story`, `view` are already in that position). Verbs and
 * function words are free — a column is not named `until`. The cost of an
 * omission is a suppressed wondering, never a bad one: `realize()` lints before
 * it returns and simply tries the next phrasing, which is the same
 * prefer-UNDER-emitting direction the rest of this module takes.
 */
const FRAME_WORDS = new Set([
  ...QUESTION_OPENERS,
  // more function words and quantities
  'also', 'always', 'anywhere', 'because', 'better', 'biggest', 'bigger',
  'closer', 'different', 'else', 'enough', 'ever', 'everywhere', 'far',
  'farther', 'first', 'further', 'greater', 'higher', 'last', 'least', 'less',
  'lower', 'next', 'often', 'own', 'rather', 'same', 'several', 'smaller',
  'smallest', 'sometimes', 'somewhere', 'soon', 'too', 'very', 'well', 'while',
  'whole', 'yet',
  // shape and manner adjectives/adverbs the phrasings lean on
  'alone', 'aside', 'big', 'bunched', 'clumped', 'even', 'evenly', 'flat',
  'heavy', 'high', 'large', 'largest', 'left', 'light', 'long', 'low', 'narrow',
  'narrowed', 'new', 'odd', 'old', 'ordinary', 'right', 'running', 'short',
  'small', 'spread', 'straight', 'strange', 'sudden', 'tight', 'top', 'typical',
  'unusual', 'upward', 'usual', 'wide',
  // verbs — free to admit, since a column is not named with one
  'add', 'adds', 'appear', 'appears', 'became', 'become', 'belong', 'belongs',
  'bunch', 'change', 'changed', 'changes', 'check', 'click', 'climb', 'climbs',
  'clump', 'come', 'comes', 'compare', 'compared', 'compares', 'consider',
  'curve', 'curves', 'depend', 'depends', 'describe', 'differ', 'differed',
  'differs', 'doing', 'done', 'drag', 'drop', 'drops', 'explore', 'fall',
  'falls', 'find', 'follow', 'follows', 'gets', 'give', 'gives', 'go', 'goes',
  'going', 'hold', 'holds', 'happen', 'happens', 'having', 'hide', 'hides',
  'hiding', 'keep', 'keeps', 'know', 'leave', 'leaves', 'lie', 'lies', 'like',
  'likes', 'look', 'looked', 'looking', 'looks', 'make', 'makes', 'match',
  'matches', 'matter', 'matters', 'meet', 'meets', 'mix', 'mixes', 'move',
  'moves', 'notice', 'pile', 'piles', 'predict', 'pull', 'pulling', 'pulls',
  'put', 'rise', 'rises', 'run', 'runs', 'say', 'see', 'seen', 'show', 'showed',
  'showing', 'shown', 'shows', 'sit', 'sits', 'sort', 'sorts', 'split',
  'splits', 'stack', 'stacks', 'stand', 'stands', 'stay', 'stays', 'tell',
  'telling', 'tells', 'think', 'thinks', 'travel', 'travels', 'try', 'turn',
  'turns', 'use', 'wander', 'watch', 'wonder', 'wonders', 'work', 'works',
  // nouns the shipped phrasings need — each one a name this rule cannot see
  'case', 'cases', 'clumps', 'column', 'columns', 'difference', 'differences',
  'dot', 'dots', 'end', 'ends', 'graph', 'group', 'groups', 'half', 'kind',
  'kinds', 'line', 'lines', 'part', 'parts', 'pattern', 'patterns', 'picture',
  'pictures', 'piece', 'pieces', 'plot', 'point', 'points', 'rest', 'row',
  'rows', 'set', 'sets', 'shape', 'shapes', 'side', 'sides', 'story', 'stories',
  'table', 'tables', 'thing', 'things', 'value', 'values', 'view', 'way',
  'ways',
  // the family stems in plan `-001` are linted verbatim by `t-realize.mjs`
  'distribution', 'distributions',
  // rendering artefacts of the phrasings themselves
  'colored', 'grouped', 'grouping', 'sorted', 'sorting',
  // the addressed pronouns. `SECOND_PERSON_ASSESSMENT` already refuses every
  // sentence containing one; they are listed here so the SECOND diagnosis is
  // not the false "names an attribute not in focus (us)".
  'we', 'us', 'our', 'ours', 'you', 'your', 'yours', 'yourself', 'me', 'my',
  'mine', 'let',
]);

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
 * Does this sentence open with a bare infinitive — i.e. is it an instruction?
 *
 * Stated as the complement of the three ways a question may legitimately begin:
 * with a function word (`QUESTION_OPENERS`), with a participle
 * (`INFLECTED_OPENING`), or by naming its own subject (a word of `allowed`).
 * See `QUESTION_OPENERS` for why the rule is not a list of verbs.
 *
 * @param {string} text the wondering, already trimmed
 * @param {Set<string>} allowed normalized words this wondering may use as names
 * @returns {boolean}
 */
function opensWithBareInfinitive(text, allowed) {
  const m = /^[^A-Za-z]*([A-Za-z]+)/.exec(text);
  if (!m) return false;                                   // no word at all
  const word = m[1].toLowerCase();                        // "Let's" -> "let"
  if (QUESTION_OPENERS.has(word)) return false;
  if (INFLECTED_OPENING.test(word)) return false;
  if (allowed.has(normalizeName(word))) return false;
  return true;
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

  // Rendering first, because two of the rules below need to know which words of
  // this sentence are its own attribute names. Nothing is reported yet, so the
  // order violations appear in is still the order of the rules.
  const rendered = new Map();          // raw name -> render result
  for (const raw of names) rendered.set(raw, renderAttributeName(raw));

  // Vocabulary the text is allowed to use as a name: each focus name raw, and
  // each word of its rendering.
  const allowed = new Set();
  for (const [raw, r] of rendered) {
    allowed.add(normalizeName(raw));
    if (r.text) for (const w of r.text.split(' ')) allowed.add(normalizeName(w));
  }

  // --- the six original rules -------------------------------------------
  if (!text.trim().endsWith('?')) add('not interrogative');
  if (text.length > MAX_WONDERING_CHARS) {
    add(`too long (${text.length} > ${MAX_WONDERING_CHARS})`);
  }
  if (ANY_DIGIT.test(text)) add('contains a digit');
  if (STATISTICAL_VOCABULARY.test(text)) add('statistical vocabulary');
  if (opensWithBareInfinitive(text.trim(), allowed)) add('imperative opening');
  if (SECOND_PERSON_ASSESSMENT.test(text)) add('second-person / teacher register');

  // --- readability of every name this wondering is about -----------------
  for (const [raw, r] of rendered) {
    if (!r.readable) add(`unreadable attribute name (${raw}: ${r.reason})`);
  }

  // --- every word of the text, against the frame vocabulary ---------------
  // A rendered name is lowercase (`renderAttributeName`), so a rule that looked
  // only at capitalised/underscored/camelCase tokens could not see one. Every
  // word is checked instead, and `FRAME_WORDS` is what makes that affordable.
  for (const m of text.matchAll(TEXT_TOKEN)) {
    const token = m[0];
    const atStart = m.index === 0;

    // The text used a raw column name where the rendering should have gone.
    const r = rendered.get(token);
    if (r && r.text && token !== r.text) {
      if (!(atStart && token === sentenceCase(r.text))) {
        add(`raw attribute name (${token}; expected "${r.text}")`);
      }
      continue;
    }
    if (r) continue;                                   // used exactly as rendered

    if (allowed.has(normalizeName(token))) {
      // A word OF a focus name, but capitalised mid-sentence: the rendering rule
      // lowercases names, so this is a raw fragment that escaped it. At the
      // start of the sentence the capital is the sentence's, not the name's.
      if (!atStart && /^[A-Z]/.test(token) && !/^[A-Z]{2,}$/.test(token)) {
        add(`raw attribute name (${token}; expected "${token.toLowerCase()}")`);
      }
      continue;
    }

    if (CAPITALISED_NON_NAME.has(token)) continue;
    if (FRAME_WORDS.has(token.toLowerCase())) continue;
    // With no focus declared the lint knows no names, so it cannot tell a column
    // from a common noun and must not guess: the rule stands down. Every
    // wondering `realize()` produces carries its focus.
    if (names.length === 0) continue;
    add(`names an attribute not in focus (${token})`);
  }

  return { ok: violations.length === 0, violations };
}
