/**
 * t-lint.mjs — the asserting test for `web/src/wonderings/lint.js` (W1, module G).
 *
 *   node docs/verification/wonderings/t-lint.mjs
 *
 * The lint is the single most important piece of machinery in
 * `docs/WONDERINGS.md` (§9.4), because it is what lets hand-written phrasings be
 * combined with the student's own column names without losing control of the
 * register. It fails silently in both directions: a lint that says `ok` to
 * everything ships a tutor's voice into a child's peripheral vision, and a lint
 * that says `ok` to nothing ships an empty panel that nobody notices is empty.
 *
 * Eight groups of assertion:
 *   A. the 13 named cases promoted from the prototype
 *      `docs/verification/wonderings/lint-feasibility.mjs` (2026-08-28) keep
 *      their verdicts exactly.
 *   B. the prototype's 4 undecided boundary cases are LOCKED AS PASS. Plan
 *      `-002` removes the presupposition guard from this build, so
 *      "Why do the colours mix together?" must pass. This group exists to make
 *      a later agent's re-added guard fail loudly rather than silently narrow
 *      the voice.
 *   C. one minimal pair per rule, asserting the EXACT violation list — a lint
 *      that fires the wrong rule, or two rules where one is due, fails here.
 *      This is the group a stub cannot survive: it must return different,
 *      specific violations for six texts that differ by one word each.
 *   D. the rendering rule: de-underscore, split camelCase, lowercase except
 *      short all-caps acronyms.
 *   E. the suppress-if-unreadable fallback: what rendering cannot save.
 *   F. the two rules bind together in `lintWondering` — an unreadable focus
 *      name, a raw name where the rendering belonged, a name outside `focus`.
 *   H. the four defects found by adversarial verification on 2026-08-28
 *      (`BUILD-VERIFICATION.md` §1-§3), each asserted in BOTH DIRECTIONS. Every
 *      one of the four was a rule that was wrong in one direction; a fix that
 *      buys a false negative with a false positive is not a fix, so each
 *      sub-group pairs a phrasing that must FAIL with one that must PASS.
 *   G. hygiene: purity of the source, determinism across repeated calls (a
 *      module-level `/g` regex used with `.test()` would fail this), and the
 *      `ok === violations.length === 0` invariant over every case above.
 *
 * MUTATION-TESTED 2026-08-28. Each of group H's four sub-groups was confirmed to
 * FAIL against the pre-fix code, and each fix was then reverted by hand to
 * confirm the assertions fail again: re-adding `\bwhat (does|do|can)\b` fails
 * H1, restoring the fifteen-verb `IMPERATIVE_OPENING` fails all seven of H2,
 * restoring the `\b`-terminated vocabulary group fails six of H3, and restoring
 * the `nameShaped` gate fails all three of H4. The escape hatches were mutated
 * too: dropping `INFLECTED_OPENING`, the focus-name exemption, or `FRAME_WORDS`
 * each fails the must-PASS side.
 *
 * Dependency-free, node builtins only. Written 2026-08-28.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lintWondering, renderAttributeName, MAX_WONDERING_CHARS }
  from '../../../web/src/wonderings/lint.js';
import { MAMMALS_COLLECTION } from '../../../web/src/demo/fixture.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LINT_SRC = join(HERE, '..', '..', '..', 'web', 'src', 'wonderings', 'lint.js');

let failures = 0;
function ok(cond, label, detail = '') {
  if (cond) { console.log(`  PASS  ${label}`); return true; }
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  return false;
}
const eq = (a, b, label) => ok(
  JSON.stringify(a) === JSON.stringify(b), label,
  `expected ${JSON.stringify(b)}\n        got      ${JSON.stringify(a)}`);

/** Every (text, focus) this file lints, collected for group G's invariant. */
const ALL_CALLS = [];
function lint(text, focus = []) {
  ALL_CALLS.push([text, focus]);
  return lintWondering(text, focus);
}

// ---------------------------------------------------------------------------
// A. the 13 named cases
// ---------------------------------------------------------------------------
console.log('\nA. the 13 named cases from lint-feasibility.mjs');
console.log('='.repeat(76));

const NAMED_CASES = [
  // --- the register the design wants (6) ---
  ['PASS', 'How does sleep go with body weight?'],
  ['PASS', 'Do the colours stack up, or mix together?'],
  ['PASS', 'Does height matter here?'],
  ['PASS', 'I wonder whether height depends on mass too?'],
  ['PASS', 'Is it the same for every kind of animal?'],
  ['PASS', 'Which animals are out on their own?'],
  // --- the failure modes §9 names (7) ---
  ['FAIL', 'What does that legend tell us?'],               // teacher register (§9.2)
  ['FAIL', 'Try dragging Mass onto the y-axis.'],           // imperative + not a question
  ['FAIL', 'Height and mass are strongly related.'],        // assertion
  ['FAIL', 'Sleep and height have a correlation of -0.74.'],// statistics
  ['FAIL', 'What did you notice about the colours?'],       // second person
  ['FAIL', 'Notice how the points curve upward?'],          // imperative
  ['FAIL', 'I wonder whether the relationship between body mass and sleeping hours holds across every mammalian order?'],  // too long
];

ok(NAMED_CASES.length === 13, 'the named-case set is still 13 cases',
  `got ${NAMED_CASES.length}`);
for (const [want, text] of NAMED_CASES) {
  const { ok: pass, violations } = lint(text);
  ok((pass ? 'PASS' : 'FAIL') === want,
    `${want}  ${JSON.stringify(text.slice(0, 46))}`,
    `violations: ${violations.join('; ') || '(none)'}`);
}

// ---------------------------------------------------------------------------
// B. the 4 boundary cases — locked as PASS, no presupposition guard
// ---------------------------------------------------------------------------
console.log('\nB. boundary cases — plan -002 removes the presupposition guard');
console.log('='.repeat(76));

for (const text of [
  'What if bigger animals sleep less?',
  'Could one animal be pulling the whole pattern?',
  'Why do the colours mix together?',   // presupposes they mix — allowed, by decision
  'Is that one animal unusual?',
]) {
  const { ok: pass, violations } = lint(text);
  ok(pass, `PASS  ${JSON.stringify(text)}`, `violations: ${violations.join('; ')}`);
}

// ---------------------------------------------------------------------------
// C. one minimal pair per rule, exact violation lists
// ---------------------------------------------------------------------------
console.log('\nC. per-rule minimal pairs — exact violations');
console.log('='.repeat(76));

const CLEAN = 'Does height matter here?';
eq(lint(CLEAN).violations, [], 'the control text is clean');

eq(lint('Does height matter here.').violations,
  ['not interrogative'], 'rule: ends with ?');

const overlong = `Does height go with sleep for ${'x'.repeat(40)}?`;
ok(overlong.length === MAX_WONDERING_CHARS + 1,
  `the over-long probe is ${MAX_WONDERING_CHARS + 1} chars`, `got ${overlong.length}`);
eq(lint(overlong).violations,
  [`too long (${MAX_WONDERING_CHARS + 1} > ${MAX_WONDERING_CHARS})`],
  'rule: <= 70 characters');
eq(lint(overlong.slice(0, MAX_WONDERING_CHARS - 1) + '?').violations,
  [], 'the same text at 70 characters is clean');

eq(lint('Does height matter at 5 here?').violations,
  ['contains a digit'], 'rule: no digits');

eq(lint('Is the average height here?').violations,
  ['statistical vocabulary'], 'rule: no statistical vocabulary');

eq(lint('Try that with height?').violations,
  ['imperative opening'], 'rule: no imperative opening');

eq(lint('Does your height matter here?').violations,
  ['second-person / teacher register'], 'rule: no second-person assessment');

eq(lint('Does mass go with Speed?', ['Mass']).violations,
  ['names an attribute not in focus (Speed)'],
  'rule: names only attributes present in focus');

// ---------------------------------------------------------------------------
// D. the rendering rule
// ---------------------------------------------------------------------------
console.log('\nD. renderAttributeName — de-underscore, split camelCase, lowercase');
console.log('='.repeat(76));

for (const [raw, want] of [
  ['Mass', 'mass'],
  ['LifeSpan', 'life span'],
  ['body_mass', 'body mass'],
  ['  Sleep  ', 'sleep'],
  ['miles-per-gallon', 'miles per gallon'],
  ['BMI', 'BMI'],                       // short all-caps stays an acronym
  ['GDPPerHead', 'GDP per head'],
]) {
  const r = renderAttributeName(raw);
  eq([r.text, r.readable], [want, true], `${JSON.stringify(raw)} -> ${JSON.stringify(want)}`);
}

// Every column the tutorials actually ship must render readable, or the
// wondering families that name them can never say anything.
const FIXTURE_RENDERINGS = {
  Mammal: 'mammal', Order: 'order', Diet: 'diet', LifeSpan: 'life span',
  Height: 'height', Mass: 'mass', Sleep: 'sleep', Speed: 'speed',
};
for (const a of MAMMALS_COLLECTION.attrs) {
  const want = FIXTURE_RENDERINGS[a.name];
  const r = renderAttributeName(a.name);
  ok(want !== undefined && r.readable && r.text === want,
    `fixture column ${a.name} renders readable to "${want}"`,
    `got ${JSON.stringify(r.text)}, readable=${r.readable} (${r.reason})`);
}
ok(Object.keys(FIXTURE_RENDERINGS).length === MAMMALS_COLLECTION.attrs.length,
  'every fixture column is covered by an expected rendering',
  `${MAMMALS_COLLECTION.attrs.length} columns, ${Object.keys(FIXTURE_RENDERINGS).length} expectations`);

// ---------------------------------------------------------------------------
// E. the suppress-if-unreadable fallback
// ---------------------------------------------------------------------------
console.log('\nE. renderAttributeName — what rendering cannot save');
console.log('='.repeat(76));

for (const [raw, why] of [
  ['Ht_cm', 'no vowel in "ht"'],
  ['msleep', 'English has no "msl" onset'],
  ['body_wt', 'no vowel in "wt"'],
  ['bodywt', 'English has no "wt" coda'],
  ['kg', 'no vowel'],
  ['attr2', 'a digit is not a word'],
  ['Average_Annual_Precipitation_Millimetres', 'too long for a 70-char sentence'],
  ['', 'nothing to render'],
  ['___', 'nothing to render'],
]) {
  const r = renderAttributeName(raw);
  ok(r.readable === false && typeof r.reason === 'string' && r.reason.length > 0,
    `${JSON.stringify(raw)} is unreadable (${why})`,
    `got readable=${r.readable}, text=${JSON.stringify(r.text)}`);
}

// The rule must not reject everything: readable and unreadable are both reachable
// from names of the same shape.
ok(renderAttributeName('sleep').readable && !renderAttributeName('msleep').readable,
  '"sleep" readable but "msleep" not — the onset rule discriminates');
ok(renderAttributeName('body_mass').readable && !renderAttributeName('body_wt').readable,
  '"body mass" readable but "body wt" not — the vowel rule discriminates');

// ---------------------------------------------------------------------------
// F. lint + names together
// ---------------------------------------------------------------------------
console.log('\nF. lintWondering with a focus');
console.log('='.repeat(76));

// The motivating case: lint-clean under all six original rules, unreadable.
{
  const { ok: pass, violations } = lint('How does Ht_cm go with msleep?', ['Ht_cm', 'msleep']);
  ok(!pass, 'the motivating case "How does Ht_cm go with msleep?" is refused',
    `violations: ${violations.join('; ')}`);
  ok(violations.some((v) => v.startsWith('unreadable attribute name (Ht_cm')),
    '  ... because Ht_cm cannot be rendered readable');
  ok(violations.some((v) => v.startsWith('unreadable attribute name (msleep')),
    '  ... and because msleep cannot either');
  ok(violations.some((v) => v.startsWith('raw attribute name (Ht_cm')),
    '  ... and because the raw column name reached the sentence');
}

eq(lint('How does life span go with sleep?', ['LifeSpan', 'Sleep']).violations, [],
  'the rendered form of a camelCase column passes');

eq(lint('How does LifeSpan go with sleep?', ['LifeSpan', 'Sleep']).violations,
  ['raw attribute name (LifeSpan; expected "life span")'],
  'the raw form of the same column does not');

eq(lint('How does sleep go with Mass?', ['Mass', 'Sleep']).violations,
  ['raw attribute name (Mass; expected "mass")'],
  'a mid-sentence capital is a raw name, not a proper noun');

eq(lint('Mass and sleep, do they go together?', ['Mass', 'Sleep']).violations, [],
  'the same name capitalised at the START of the question is fine');

eq(lint('How does mass go with Life span?', ['Mass', 'LifeSpan']).violations,
  ['raw attribute name (Life; expected "life")'],
  'one capitalised WORD of a rendered name is caught too');

eq(lint('How does BMI go with sleep?', ['BMI', 'Sleep']).violations, [],
  'a short all-caps acronym survives mid-sentence');

eq(lint('Does mass go with Ht_cm?', ['Mass']).violations,
  ['names an attribute not in focus (Ht_cm)'],
  'a name outside focus is caught even when focus itself is readable');

// A wondering may be about fewer things than it is allowed to be.
eq(lint('Does height matter here?', ['Height', 'Sleep']).violations, [],
  'naming only some of the focus is not a violation');

// Defensive shapes: the realizer may hand us anything.
eq(lintWondering(null).violations, ['not a string'], 'a non-string text is refused');
ok(lintWondering('Does height matter here?', null).ok,
  'a null focus is treated as an empty focus, not a crash');
ok(lintWondering('Does mass matter here?', ['Mass', 7, null]).ok,
  'non-string focus entries are ignored, not crashed on');

// ---------------------------------------------------------------------------
// H. the four defects of 2026-08-28, each asserted in BOTH directions
//
//    Recorded in `docs/verification/wonderings/BUILD-VERIFICATION.md` §1-§3.
//    Every one of them is a rule that was wrong in one direction; a fix that
//    trades a false positive for a false negative is not a fix, so each
//    sub-group asserts a phrasing that MUST pass beside the one that MUST fail.
// ---------------------------------------------------------------------------
console.log('\nH. the four defects — both directions for every rule touched');
console.log('='.repeat(76));

// --- H1. the tell is ASSESSMENT, not the interrogative form -----------------
// `\bwhat (does|do|can)\b` caught "What does that legend tell us?" and the
// Distribution family's own phrasing with the same stroke. The load-bearing
// rule (plan `-001` §9.2) is NEVER ASK WHAT YOU CANNOT HEAR: a question the
// panel could not receive an answer to is a quiz. "What does X look like?"
// asks about the data; "What does X tell us?" asks the student to report.
console.log('\n  H1. assessment, not interrogative form');

eq(lint('What does the distribution of mass look like?', ['Mass']).violations, [],
  'PASS  the Distribution family\'s own stem — asks about the data');
eq(lint('What do the mass values look like?', ['Mass']).violations, [],
  'PASS  the same question in the plural');
eq(lint('What can the shape of mass show here?', ['Mass']).violations, [],
  'PASS  "what can ... show" with no addressee');

eq(lint('What does that legend tell us?').violations,
  ['second-person / teacher register'],
  'FAIL  the register trap — a report addressed to the system');
eq(lint('What does mass tell us?', ['Mass']).violations,
  ['second-person / teacher register'],
  'FAIL  the same trap wearing a legitimate subject');
eq(lint('What can mass show you?', ['Mass']).violations,
  ['second-person / teacher register'],
  'FAIL  "show you" is a report the panel cannot hear');

// --- H2. the purest tutor register ------------------------------------------
// A 15-verb closed list cannot enumerate the verbs a tutor uses. The
// discriminating property is grammatical: an imperative opens with a BARE
// INFINITIVE. So the rule must catch verbs nobody listed, and must NOT catch a
// participle opening or a sentence that opens by naming its own subject.
console.log('\n  H2. imperative = bare-infinitive opening, not a verb list');

for (const [text, focus] of [
  ["Let's think about mass?", ['Mass']],
  ['Compare mass and life span?', ['Mass', 'LifeSpan']],
  ['Sort by mass?', ['Mass']],
  ['Watch how mass moves?', ['Mass']],
  ['Describe the shape of mass?', ['Mass']],
  ['Predict what mass does?', ['Mass']],
  ['Show how mass and life span go together?', ['Mass', 'LifeSpan']],
]) {
  const { ok: pass, violations } = lint(text, focus);
  ok(!pass && violations.includes('imperative opening'),
    `FAIL  ${JSON.stringify(text)}`, `violations: ${violations.join('; ') || '(none)'}`);
}
// "Let's" is "let us" — the first-person-plural address must be seen as well.
ok(lint("Let's think about mass?", ['Mass']).violations
  .includes('second-person / teacher register'),
  '  ... and "Let\'s" is also caught as the contraction of "let us"');

// The other direction: none of these opens with a bare infinitive.
for (const [text, focus] of [
  ['Sorted by mass, what comes to the top?', ['Mass']],          // participle
  ['Grouped by diet, does that picture change?', ['Diet']],      // participle
  ['Mass: all of a piece, or in clumps?', ['Mass']],             // names its subject
  ['Life span: all of a piece, or in clumps?', ['LifeSpan']],    // ... in two words
  ['How does mass compare across diet?', ['Mass', 'Diet']],      // verb, not initial
  ['Would sorting by mass show something new?', ['Mass']],       // gerund after modal
  ['What hides in mass until it is sorted?', ['Mass']],
]) {
  eq(lint(text, focus).violations, [], `PASS  ${JSON.stringify(text)}`);
}

// --- H3. statistical vocabulary in the plural -------------------------------
// Six of twelve alternatives were bare literals inside a `\b`-terminated group,
// so every inflected form walked through.
console.log('\n  H3. statistical vocabulary survives inflection');

for (const text of [
  'Do the outliers matter here?',
  'Do the means differ?',
  'Do the medians differ?',
  'Are the averages the same?',
  'Are the variances the same?',
  'Are the trends the same?',
  'Is the trend the same?',
  'Is the outlier here?',
]) {
  eq(lint(text).violations, ['statistical vocabulary'], `FAIL  ${JSON.stringify(text)}`);
}
// The other direction — plain words that merely describe shape are not statistics.
for (const [text, focus] of [
  ['Is mass spread evenly, or bunched together?', ['Mass']],
  ['What shape does mass make?', ['Mass']],
  ['Where do the mass values pile up?', ['Mass']],
]) {
  eq(lint(text, focus).violations, [], `PASS  ${JSON.stringify(text)}`);
}

// --- H4. the focus rule must see a RENDERED name ----------------------------
// `renderAttributeName` lowercases every name by design, and the old rule only
// looked at tokens that were capitalised, underscored, digit-bearing or
// camelCase — so it could not see a single correctly-rendered name. The probes
// below use the RENDERED form, which is the only form that ever ships.
console.log('\n  H4. the focus rule sees lowercase, rendered names');

eq(lint('How does mass go with speed?', ['Mass']).violations,
  ['names an attribute not in focus (speed)'],
  'FAIL  a rendered name outside focus is caught');
eq(lint('Does life span matter for speed too?', ['LifeSpan']).violations,
  ['names an attribute not in focus (speed)'],
  'FAIL  ... including beside a two-word rendered name that IS in focus');
eq(lint('How does mass go with life span?', ['Mass']).violations,
  ['names an attribute not in focus (life)', 'names an attribute not in focus (span)'],
  'FAIL  ... and every word of an out-of-focus rendering is named');

eq(lint('How does mass go with life span?', ['Mass', 'LifeSpan']).violations, [],
  'PASS  the same sentence with the same name IN focus');
eq(lint('Does mass matter here?', ['Mass']).violations, [],
  'PASS  frame vocabulary is not mistaken for an attribute name');
eq(lint('How does mass go with speed?', []).violations, [],
  'PASS  with no focus declared the rule stands down — it knows no names');

// ---------------------------------------------------------------------------
// G. hygiene: purity, determinism, invariant
// ---------------------------------------------------------------------------
console.log('\nG. hygiene');
console.log('='.repeat(76));

const src = readFileSync(LINT_SRC, 'utf8');
const code = src.split('\n')
  .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))   // strip comment lines
  .join('\n');
for (const banned of ['document', 'window', 'localStorage', 'performance',
  'Date.now', 'Math.random', 'export default']) {
  ok(!code.includes(banned), `source contains no ${banned}`);
}
ok(/export function lintWondering/.test(code), 'lintWondering is a named export');
ok(/export function renderAttributeName/.test(code), 'renderAttributeName is a named export');

// Determinism. A module-level /g regex used with .test() advances lastIndex and
// makes every OTHER call wrong; running the whole corpus twice catches it.
let drift = 0;
for (const [text, focus] of ALL_CALLS) {
  const a = JSON.stringify(lintWondering(text, focus));
  const b = JSON.stringify(lintWondering(text, focus));
  if (a !== b) { drift++; console.log(`        drifts: ${JSON.stringify(text)}`); }
}
ok(drift === 0, `all ${ALL_CALLS.length} calls are stable when repeated`, `${drift} drifted`);

// The invariant, over everything this file linted.
let broken = 0;
let cleanSeen = 0;
let dirtySeen = 0;
for (const [text, focus] of ALL_CALLS) {
  const r = lintWondering(text, focus);
  if (r.ok !== (r.violations.length === 0)) broken++;
  if (r.ok) cleanSeen++; else dirtySeen++;
}
ok(broken === 0, 'ok === (violations.length === 0) everywhere', `${broken} breaches`);
ok(cleanSeen > 0 && dirtySeen > 0,
  `both verdicts are reachable (${cleanSeen} clean, ${dirtySeen} refused)`);

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(76));
if (failures) {
  console.log(`FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log('OK — lint.js passes all 13 named cases, the 4 boundary cases, and the');
console.log('     attribute-name readability rule with its suppress fallback.\n');
