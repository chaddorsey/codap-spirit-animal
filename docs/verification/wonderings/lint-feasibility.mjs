/**
 * Does the §9.4 lint in docs/WONDERINGS.md actually separate a wondering from
 * a tutor? Prototype only — the point is to find out whether the rules as
 * written are sufficient, BEFORE committing to them in a plan.
 *
 *   node docs/verification/wonderings/lint-feasibility.mjs
 */

const STATS = /\b(correlat\w*|signific\w*|strong\w*|weak\w*|average|mean|median|r=|r =|standard deviation|variance|outlier|trend)\b/i;
const IMPERATIVE = /^(try|drag|look|notice|click|put|add|make|use|check|see|find|explore|consider)\b/i;
const TEACHER = /\b(you|your|we|us|our)\b|\bwhat (does|do|can) \b|tell us|did you|have you|can you/i;

export function lintWondering(text, focus = []) {
  const v = [];
  if (!text.trim().endsWith('?')) v.push('not interrogative');
  if (text.length > 70) v.push(`too long (${text.length} > 70)`);
  if (/\d/.test(text)) v.push('contains a digit');
  if (STATS.test(text)) v.push('statistical vocabulary');
  if (IMPERATIVE.test(text.trim())) v.push('imperative opening');
  if (TEACHER.test(text)) v.push('second-person / teacher register');
  return { ok: v.length === 0, violations: v };
}

const CASES = [
  // --- should PASS: the register the design wants ---
  ['PASS', 'How does sleep go with body weight?'],
  ['PASS', 'Do the colours stack up, or mix together?'],
  ['PASS', 'Does height matter here?'],
  ['PASS', 'I wonder whether height depends on mass too?'],
  ['PASS', 'Is it the same for every kind of animal?'],
  ['PASS', 'Which animals are out on their own?'],

  // --- should FAIL: the failure modes §9 names ---
  ['FAIL', 'What does that legend tell us?'],              // teacher register (§9.2)
  ['FAIL', 'Try dragging Mass onto the y-axis.'],           // imperative + not a question
  ['FAIL', 'Height and mass are strongly related.'],        // assertion
  ['FAIL', 'Sleep and height have a correlation of -0.74.'],// statistics
  ['FAIL', 'What did you notice about the colours?'],       // second person
  ['FAIL', 'Notice how the points curve upward?'],          // imperative
  ['FAIL', 'I wonder whether the relationship between body mass and sleeping hours holds across every mammalian order?'],  // too long

  // --- the interesting boundary cases: which way should these go? ---
  ['?', 'What if bigger animals sleep less?'],
  ['?', 'Could one animal be pulling the whole pattern?'],
  ['?', 'Why do the colours mix together?'],                // presupposes they mix
  ['?', 'Is that one animal unusual?'],
];

let unexpected = 0;
for (const [want, text] of CASES) {
  const { ok, violations } = lintWondering(text);
  const got = ok ? 'PASS' : 'FAIL';
  const mark = want === '?' ? ' ?' : want === got ? '  ' : '<<';
  if (want !== '?' && want !== got) unexpected++;
  console.log(`${mark} ${got.padEnd(4)} ${JSON.stringify(text)}`);
  if (violations.length) console.log(`        ${violations.join('; ')}`);
}
console.log(`\n${unexpected} case(s) the lint got wrong. Lines marked << are failures.`);
console.log('Lines marked ? are judgement calls the design has not yet settled.');
