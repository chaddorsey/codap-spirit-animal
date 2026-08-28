/**
 * Can a LOCAL, deterministic pass detect the observations worth wondering
 * aloud about? Three candidates, none of which insight.js computes today.
 * No model, no network — plain arithmetic over the case list.
 */

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2))) || 1;

/** Pearson, PAIRWISE-COMPLETE — the fix insight.js needs. */
function corr(rows, x, y) {
  const p = rows.filter((r) => Number.isFinite(+r[x]) && Number.isFinite(+r[y]) && r[x] !== '' && r[y] !== '');
  if (p.length < 4) return null;
  const X = p.map((r) => +r[x]), Y = p.map((r) => +r[y]);
  const mx = mean(X), my = mean(Y);
  const num = X.map((v, i) => (v - mx) * (Y[i] - my)).reduce((a, b) => a + b, 0);
  return { r: +(num / (X.length * sd(X) * sd(Y))).toFixed(2), n: p.length };
}

/** OBSERVATION 1 — does a categorical attribute actually separate a numeric one?
 *  eta² = between-group variance / total variance. 0 = colors mix, 1 = colors stack. */
function separation(rows, cat, num) {
  const vals = rows.filter((r) => Number.isFinite(+r[num])).map((r) => ({ g: String(r[cat]), v: +r[num] }));
  const grand = mean(vals.map((d) => d.v));
  const groups = [...new Set(vals.map((d) => d.g))];
  const between = groups.reduce((acc, g) => {
    const gv = vals.filter((d) => d.g === g).map((d) => d.v);
    return acc + gv.length * (mean(gv) - grand) ** 2;
  }, 0);
  const total = vals.reduce((acc, d) => acc + (d.v - grand) ** 2, 0);
  return { eta2: +(between / total).toFixed(2), groups: groups.length };
}

/** OBSERVATION 2 — Simpson's paradox: does the relationship REVERSE within groups? */
function simpson(rows, x, y, by) {
  const overall = corr(rows, x, y);
  const groups = [...new Set(rows.map((r) => String(r[by])))];
  const within = groups.map((g) => ({ g, ...corr(rows.filter((r) => String(r[by]) === g), x, y) }))
    .filter((w) => w.r != null);
  const flipped = within.filter((w) => Math.sign(w.r) !== Math.sign(overall.r) && Math.abs(w.r) > 0.3);
  return { overall: overall.r, within: within.map((w) => `${w.g}:${w.r}`), reversedIn: flipped.length, of: within.length };
}

/** OBSERVATION 3 — is the relationship CURVED? Compare linear r to rank (Spearman) r. */
function curvature(rows, x, y) {
  const p = rows.filter((r) => Number.isFinite(+r[x]) && Number.isFinite(+r[y]));
  const rank = (vals) => { const s = [...vals].sort((a, b) => a - b); return vals.map((v) => s.indexOf(v) + 1); };
  const rx = rank(p.map((r) => +r[x])), ry = rank(p.map((r) => +r[y]));
  const ranked = corr(rx.map((v, i) => ({ a: v, b: ry[i] })), 'a', 'b');
  const linear = corr(p, x, y);
  return { linear: linear.r, monotone: ranked.r, gap: +(Math.abs(ranked.r) - Math.abs(linear.r)).toFixed(2) };
}

// ---------------------------------------------------------------- fixtures
// A: legend that does nothing.      B: legend that separates cleanly.
const noSep = Array.from({ length: 40 }, (_, i) => ({ Sleep: 5 + (i % 10), Diet: ['Meat', 'Plant'][i % 2] }));
const sep   = Array.from({ length: 40 }, (_, i) => ({ Sleep: (i % 2 ? 14 : 4) + (i % 5) * 0.2, Diet: ['Meat', 'Plant'][i % 2] }));
console.log('legend does nothing   ', JSON.stringify(separation(noSep, 'Diet', 'Sleep')));
console.log('legend separates      ', JSON.stringify(separation(sep,   'Diet', 'Sleep')));

// C: Simpson's paradox — overall Height rises with Age, but within each Species it falls.
const simp = [];
for (const [sp, base, slope] of [['Newt', 30, -0.8], ['Salamander', 60, -0.8]]) {
  for (let age = 1; age <= 12; age++) {
    simp.push({ Species: sp, Age: age + (sp === 'Newt' ? 0 : 14), Height: base + slope * age });
  }
}
console.log('Simpson fixture       ', JSON.stringify(simpson(simp, 'Age', 'Height', 'Species')));

// D: curved — Height vs Age flattens out (growth curve), the commonest real shape.
const curved = Array.from({ length: 30 }, (_, i) => ({ Age: i + 1, Height: 40 * Math.log(i + 2) }));
console.log('growth-curve fixture  ', JSON.stringify(curvature(curved, 'Age', 'Height')));
