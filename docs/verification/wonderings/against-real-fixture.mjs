/**
 * What would the Wonderings observers ACTUALLY say about the dataset students
 * really use? Runs the §5 Tier-A/B analyses over the repo's own 12-row Mammals
 * fixture (web/src/demo/fixture.js), unmodified.
 *
 *   node docs/verification/wonderings/against-real-fixture.mjs
 *
 * The point is not to admire the output. It is to find out whether the real
 * shipping dataset produces good wonderings or embarrassing ones.
 */
import { MAMMALS } from '../../../web/src/demo/fixture.js';

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2))) || 1;
const num = (v) => (v !== '' && v != null && Number.isFinite(+v) ? +v : null);

/** Pairwise-complete Pearson — the fix insight.js needs. */
function corr(rows, x, y) {
  const p = rows.filter((r) => num(r[x]) !== null && num(r[y]) !== null);
  if (p.length < 4) return null;
  const X = p.map((r) => +r[x]), Y = p.map((r) => +r[y]);
  const mx = mean(X), my = mean(Y);
  const s = X.map((v, i) => (v - mx) * (Y[i] - my)).reduce((a, b) => a + b, 0);
  return { r: +(s / (X.length * sd(X) * sd(Y))).toFixed(2), n: p.length };
}

function spearman(rows, x, y) {
  const p = rows.filter((r) => num(r[x]) !== null && num(r[y]) !== null);
  const rank = (vals) => { const s = [...vals].sort((a, b) => a - b); return vals.map((v) => s.indexOf(v) + 1); };
  const rx = rank(p.map((r) => +r[x])), ry = rank(p.map((r) => +r[y]));
  return corr(rx.map((v, i) => ({ a: v, b: ry[i] })), 'a', 'b');
}

function separation(rows, cat, n) {
  const vals = rows.filter((r) => num(r[n]) !== null).map((r) => ({ g: String(r[cat]), v: +r[n] }));
  const grand = mean(vals.map((d) => d.v));
  const groups = [...new Set(vals.map((d) => d.g))];
  const between = groups.reduce((acc, g) => {
    const gv = vals.filter((d) => d.g === g).map((d) => d.v);
    return acc + gv.length * (mean(gv) - grand) ** 2;
  }, 0);
  const total = vals.reduce((acc, d) => acc + (d.v - grand) ** 2, 0);
  const sizes = groups.map((g) => vals.filter((d) => d.g === g).length);
  return { eta2: +(between / total).toFixed(2), groups: groups.length,
           smallestGroup: Math.min(...sizes) };
}

const NUMERIC = ['LifeSpan', 'Height', 'Mass', 'Sleep', 'Speed'];
const CATEGORICAL = ['Mammal', 'Order'];

console.log(`\nMammals fixture: ${MAMMALS.length} cases\n${'='.repeat(64)}`);

console.log('\n-- attribute shape ------------------------------------------');
for (const a of CATEGORICAL) {
  const card = new Set(MAMMALS.map((r) => r[a])).size;
  console.log(`  ${a.padEnd(9)} categorical  cardinality ${card}` +
    (card === MAMMALS.length ? '   <-- IDENTIFIER: unique per case' : ''));
}
for (const a of NUMERIC) {
  const v = MAMMALS.map((r) => +r[a]);
  const m = mean(v), s = sd(v);
  const maxZ = Math.max(...v.map((x) => Math.abs((x - m) / s)));
  console.log(`  ${a.padEnd(9)} numeric      range ${Math.min(...v)}..${Math.max(...v)}` +
    `   max|z| ${maxZ.toFixed(2)}` + (maxZ > 2.5 ? '   <-- dominated by one case' : ''));
}

console.log('\n-- every numeric pair, as the observers would rank them ------');
const pairs = [];
for (let i = 0; i < NUMERIC.length; i++) {
  for (let j = i + 1; j < NUMERIC.length; j++) {
    const c = corr(MAMMALS, NUMERIC[i], NUMERIC[j]);
    const sp = spearman(MAMMALS, NUMERIC[i], NUMERIC[j]);
    pairs.push({ pair: `${NUMERIC[i]} x ${NUMERIC[j]}`, r: c.r, rho: sp.r,
                 gap: +(Math.abs(sp.r) - Math.abs(c.r)).toFixed(2), n: c.n });
  }
}
pairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
for (const p of pairs) {
  console.log(`  ${p.pair.padEnd(22)} r=${String(p.r).padStart(5)}  rho=${String(p.rho).padStart(5)}` +
    `  gap=${String(p.gap).padStart(5)}  n=${p.n}` +
    (p.gap > 0.25 ? '   <-- CURVED: linear r understates it' : ''));
}

console.log('\n-- legend separation, every categorical x numeric ------------');
for (const cat of CATEGORICAL) {
  for (const n of NUMERIC) {
    const s = separation(MAMMALS, cat, n);
    const flag = s.groups >= MAMMALS.length / 2 ? '   <-- too many groups to mean anything'
      : s.smallestGroup < 3 ? '   <-- a group with < 3 cases' : '';
    console.log(`  ${(cat + ' -> ' + n).padEnd(22)} eta2=${String(s.eta2).padStart(5)}` +
      `  groups=${s.groups}  smallest=${s.smallestGroup}${flag}`);
  }
}
