/**
 * Chad's five question types are STEMS over DATA MOVES, not filled sentences
 * over attribute pairs. This checks what that changes.
 *
 *   node docs/verification/wonderings/stems-over-datamoves.mjs
 *
 * Two things under test:
 *   1. Does the EXISTING pure ranker (suggestMoves, web/src/insight.js) import
 *      and run in node? If so the wonderings realizer can sit on top of it
 *      instead of a new observer layer.
 *   2. On the dataset the tutorials actually ship, how many distinct wonderings
 *      do the stems produce, versus the correlation observers?
 */
import { MAMMALS, MAMMALS_COLLECTION } from '../../../web/src/demo/fixture.js';
import { suggestMoves } from '../../../web/src/insight.js';

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2))) || 1;

// Derived from the fixture's own declared schema, NOT hardcoded. 2026-08-28:
// these two lists used to be literal copies of the fixture's columns, so when
// W0 added the `Diet` column the script kept reporting the pre-Diet answer
// (GROUPING -> 0) about a fixture that no longer existed. Reading
// MAMMALS_COLLECTION.attrs makes the measurement track the shipping dataset.
const byKind = (t) => MAMMALS_COLLECTION.attrs.filter((a) => a.type === t).map((a) => a.name);
const NUMERIC = byKind('numeric');
const CATEGORICAL = byKind('categorical');

// Build the analysis object analyzeDataset would produce — with U0's fixes
// applied (identifier exclusion; groupable ceiling tightened to <= 4 groups).
const attrs = [
  ...NUMERIC.map((name) => {
    const v = MAMMALS.map((r) => +r[name]);
    return { name, kind: 'numeric', mean: mean(v), sd: sd(v), values: v };
  }),
  ...CATEGORICAL.map((name) => {
    const cats = [...new Set(MAMMALS.map((r) => String(r[name])))];
    return { name, kind: 'categorical', cardinality: cats.length, categories: cats };
  }),
];
const isIdentifier = (a) => a.kind === 'categorical' && a.cardinality === MAMMALS.length;
const analysis = {
  context: 'Mammals', caseCount: MAMMALS.length, attrs,
  outliers: [{ attr: 'Mass', caseIndex: 1, value: 6654, z: 3.08 }],
  correlations: [{ a: 'Height', b: 'Sleep', r: -0.74 }],
  groupables: attrs.filter((a) => a.kind === 'categorical' && !isIdentifier(a)
    && a.cardinality >= 2 && a.cardinality <= 4),
  isHierarchical: false, hasFormulas: false, at: 0,
};

console.log('=== 1. Does the existing pure ranker run in node? ===');
const suggestions = suggestMoves(analysis, new Map());
console.log(`   YES — suggestMoves imported and returned ${suggestions.length} ranked suggestions.`);
for (const s of suggestions) {
  console.log(`   [${s.move.padEnd(11)}] score ${s.score.toFixed(2)}  key=${s.key}`);
}

// ---------------------------------------------------------------- the stems
const numeric = attrs.filter((a) => a.kind === 'numeric');
const groupable = analysis.groupables;

const STEMS = [
  { move: 'display',     needs: 'one numeric',
    make: (a) => `What does the distribution of ${a.name} look like?`,
    over: numeric },
  { move: 'summarizing', needs: 'groups on screen',
    make: (a) => `How do the means of ${a.name} compare?`,
    over: numeric },
  { move: 'ordering',    needs: 'any attribute',
    make: (a) => `What if we sort by ${a.name}?`,
    over: [...numeric, ...attrs.filter((a2) => a2.kind === 'categorical' && !isIdentifier(a2))] },
  { move: 'grouping',    needs: 'a low-cardinality categorical',
    make: (a) => `How would that look grouped by ${a.name}?`,
    over: groupable },
  { move: 'filtering',   needs: 'any attribute',
    make: (a) => `What if we only looked at ${a.name}?`,
    over: numeric },
];

console.log('\n=== 2. What the stems yield on the shipping Mammals fixture ===');
let total = 0;
for (const s of STEMS) {
  const lines = s.over.map(s.make);
  total += lines.length;
  console.log(`\n   ${s.move.toUpperCase()}  (needs: ${s.needs})  -> ${lines.length}`);
  for (const l of lines.slice(0, 3)) console.log(`      ${l}`);
  if (lines.length > 3) console.log(`      … and ${lines.length - 3} more`);
  if (!lines.length) console.log('      (none — no attribute qualifies)');
}

console.log('\n=== 3. Compared with the correlation observers ===');
console.log(`   stems over data moves        : ${total} distinct wonderings`);
console.log('   second-dimension/unplotted-  : 2  (only pairs clearing |r| >= 0.576 at n=12)');
// Computed, not asserted. Before W0's Diet column this read a hardcoded 0 with
// the note "no viable categorical ships"; that is now false, so it is measured.
const eta2 = (cat, num) => {
  const v = MAMMALS.map((r) => ({ g: String(r[cat]), v: +r[num] }));
  const grand = mean(v.map((d) => d.v));
  const groups = [...new Set(v.map((d) => d.g))];
  const between = groups.reduce((acc, g) => {
    const gv = v.filter((d) => d.g === g).map((d) => d.v);
    return acc + gv.length * (mean(gv) - grand) ** 2;
  }, 0);
  return between / v.reduce((acc, d) => acc + (d.v - grand) ** 2, 0);
};
const legendPairs = groupable.flatMap((c) => NUMERIC
  .filter((n) => eta2(c.name, n) >= 0.30)
  .map((n) => `${c.name} x ${n}`));
console.log(`   legend-separation            : ${legendPairs.length}` +
  (legendPairs.length ? `  (${legendPairs.join(', ')})` : '  (no viable categorical ships)'));
console.log(`\n   -> ${total} vs 2. And every stem leaves the BLANK for the`);
console.log('      student to fill, which is the form the literature backs.');
