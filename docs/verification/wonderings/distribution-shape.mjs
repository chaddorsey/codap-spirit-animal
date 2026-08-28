/**
 * Every wondering type must be backed by real analysis — the stem form governs
 * WHO FILLS THE BLANK, not whether the system knows what it is pointing at.
 * So: does the shipping Mammals fixture actually contain interesting
 * distributions, separations and sort structure, or are these stems as empty on
 * real data as legend-separation turned out to be?
 *
 *   node docs/verification/wonderings/distribution-shape.mjs
 */
import { MAMMALS } from '../../../web/src/demo/fixture.js';

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2))) || 1;
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Fisher-Pearson skewness. |g1| > 1 is markedly skewed. */
const skew = (a) => { const m = mean(a), s = sd(a);
  return mean(a.map((v) => ((v - m) / s) ** 3)); };

/** Largest gap in the sorted values, as a fraction of range — a cheap clustering tell. */
function biggestGap(a) {
  const s = [...a].sort((x, y) => x - y);
  const range = s[s.length - 1] - s[0];
  let best = 0, at = null;
  for (let i = 1; i < s.length; i++) {
    const g = s[i] - s[i - 1];
    if (g > best) { best = g; at = [s[i - 1], s[i]]; }
  }
  return { frac: +(best / range).toFixed(2), at };
}

/** eta^2 — does a categorical separate a numeric? */
function eta2(rows, cat, num) {
  const v = rows.map((r) => ({ g: String(r[cat]), v: +r[num] }));
  const grand = mean(v.map((d) => d.v));
  const groups = [...new Set(v.map((d) => d.g))];
  const between = groups.reduce((acc, g) => {
    const gv = v.filter((d) => d.g === g).map((d) => d.v);
    return acc + gv.length * (mean(gv) - grand) ** 2;
  }, 0);
  const total = v.reduce((acc, d) => acc + (d.v - grand) ** 2, 0);
  return +(between / total).toFixed(2);
}

const NUMERIC = ['LifeSpan', 'Height', 'Mass', 'Sleep', 'Speed'];

console.log('DISTRIBUTION SHAPE — what backs "What does the distribution of ___ look like?"');
console.log('='.repeat(76));
for (const a of NUMERIC) {
  const v = MAMMALS.map((r) => +r[a]);
  const g1 = skew(v), gap = biggestGap(v);
  const cv = sd(v) / mean(v);
  const maxZ = Math.max(...v.map((x) => Math.abs((x - mean(v)) / sd(v))));
  const tells = [];
  if (Math.abs(g1) > 1) tells.push(`SKEWED (g1=${g1.toFixed(2)})`);
  if (gap.frac > 0.35) tells.push(`GAP at ${gap.at[0]}..${gap.at[1]} (${(gap.frac * 100) | 0}% of range)`);
  if (maxZ > 2.5) tells.push(`OUTLIER (|z|=${maxZ.toFixed(2)})`);
  if (cv > 1.5) tells.push(`VERY SPREAD (cv=${cv.toFixed(2)})`);
  console.log(`  ${a.padEnd(9)} ${tells.length ? tells.join('  ') : 'unremarkable — no wondering earned'}`);
}

console.log('\nGROUP SEPARATION — what backs "How do the means compare?" / "grouped by ___?"');
console.log('='.repeat(76));
const cats = ['Order'];   // Mammal is an identifier, excluded
for (const c of cats) {
  const card = new Set(MAMMALS.map((r) => r[c])).size;
  console.log(`  ${c} has ${card} groups over ${MAMMALS.length} cases — too many to compare honestly`);
  for (const n of NUMERIC) console.log(`     ${(c + ' -> ' + n).padEnd(22)} eta2=${eta2(MAMMALS, c, n)}  (inflated by group count)`);
}

console.log('\nSORT-WORTHINESS — what backs "What if we sort by ___?"');
console.log('='.repeat(76));
console.log('  An attribute is worth sorting when the order reveals structure the');
console.log('  unsorted table hides — i.e. a big gap, or a heavy tail.');
for (const a of NUMERIC) {
  const v = MAMMALS.map((r) => +r[a]);
  const gap = biggestGap(v);
  const worth = gap.frac > 0.35 || Math.abs(skew(v)) > 1;
  console.log(`  ${a.padEnd(9)} ${worth ? 'YES — sorting exposes the gap/tail' : 'no — evenly spread'}`);
}

console.log('\nVERDICT');
console.log('='.repeat(76));
const interesting = NUMERIC.filter((a) => {
  const v = MAMMALS.map((r) => +r[a]);
  return Math.abs(skew(v)) > 1 || biggestGap(v).frac > 0.35
    || Math.max(...v.map((x) => Math.abs((x - mean(v)) / sd(v)))) > 2.5;
});
console.log(`  ${interesting.length} of ${NUMERIC.length} numeric attributes have an EARNED distribution`);
console.log(`  wondering: ${interesting.join(', ')}`);
console.log('  Group-comparison wonderings: 0 earned — Order has 7 groups over 12 cases.');
console.log('  (Same blocker as legend-separation. A 3-group Diet/Habitat column fixes both.)');
