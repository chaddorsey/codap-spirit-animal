// Does insight.js's correlation survive a single missing value?
// Replicates its attr-building and correlation math exactly (insight.js:34-75).

function analyze(rows) {
  const attrNames = Object.keys(rows[0] ?? {});
  const attrs = attrNames.map((a) => {
    const raw = rows.map((r) => r[a]).filter((v) => v !== '' && v != null);
    const nums = raw.map(Number).filter(Number.isFinite);
    const numeric = nums.length >= raw.length * 0.8 && nums.length > 0;
    if (numeric) {
      const mean = nums.reduce((x, y) => x + y, 0) / nums.length;
      const sd = Math.sqrt(nums.reduce((x, y) => x + (y - mean) ** 2, 0) / nums.length) || 1;
      return { name: a, kind: 'numeric', mean, sd, values: nums };
    }
    return { name: a, kind: 'categorical' };
  });
  const numerics = attrs.filter((x) => x.kind === 'numeric');
  const out = [];
  for (let i = 0; i < numerics.length; i++) {
    for (let j = i + 1; j < numerics.length; j++) {
      const A = numerics[i], B = numerics[j];
      const n = Math.min(A.values.length, B.values.length);
      if (n < 4) continue;
      let sxy = 0;
      for (let k = 0; k < n; k++) sxy += (A.values[k] - A.mean) * (B.values[k] - B.mean);
      const r = sxy / (n * A.sd * B.sd);
      out.push({ a: A.name, b: B.name, r: +r.toFixed(2) });
    }
  }
  return out;
}

// Perfect positive relationship: Mass is exactly 2*Height. True r = 1.00.
const clean = [];
for (let h = 1; h <= 10; h++) clean.push({ Height: h, Mass: 2 * h });

console.log('clean data           ->', JSON.stringify(analyze(clean)));

// Same data, but ONE case is missing its Height (a blank cell — utterly normal
// in a classroom dataset). Mass is untouched and still perfectly related.
const holed = clean.map((r, i) => (i === 0 ? { Height: '', Mass: r.Mass } : r));
console.log('one blank Height     ->', JSON.stringify(analyze(holed)));

// And a case missing Mass instead, in the middle of the table.
const holed2 = clean.map((r, i) => (i === 5 ? { Height: r.Height, Mass: '' } : r));
console.log('one blank Mass (mid) ->', JSON.stringify(analyze(holed2)));

// Realistic case: values are NOT a monotone ramp, and a few cells are blank in
// different rows. This is an ordinary classroom dataset.
const paired = [
  [5,50],[9,90],[2,20],[7,70],[3,30],[8,80],[1,10],[6,60],[4,40],[10,100],
  [5.5,55],[2.5,25],[8.5,85],[3.5,35],[7.5,75],[1.5,15],[9.5,95],[6.5,65],
];
const real  = paired.map(([h,m]) => ({ Height: h, Mass: m }));   // true r = 1.00
const gappy = real.map((r,i) => {
  if (i === 2 || i === 9)  return { Height: '',        Mass: r.Mass };
  if (i === 5 || i === 14) return { Height: r.Height,  Mass: '' };
  return r;
});
console.log('\nnon-monotone, complete   ->', JSON.stringify(analyze(real)));
console.log('non-monotone, 4 blanks   ->', JSON.stringify(analyze(gappy)));
