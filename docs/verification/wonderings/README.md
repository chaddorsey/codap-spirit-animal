# Verification scripts for `docs/WONDERINGS.md`

Two standalone Node scripts, no dependencies, no browser, no CODAP. They
produce the measurements quoted in `docs/WONDERINGS.md` §4.1. Run them to
re-check those numbers rather than trusting the document.

```
node docs/verification/wonderings/corr-pairing-bug.mjs
node docs/verification/wonderings/observation-feasibility.mjs
```

## `corr-pairing-bug.mjs`

Replicates the attribute-building and correlation arithmetic of
`web/src/insight.js:34-45` and `:62-74` **exactly**, then feeds it data with
missing cells. Expected output, 2026-08-28:

```
clean data           -> [{"a":"Height","b":"Mass","r":1}]
one blank Height     -> [{"a":"Height","b":"Mass","r":0.9}]
one blank Mass (mid) -> [{"a":"Height","b":"Mass","r":0.9}]

non-monotone, complete   -> [{"a":"Height","b":"Mass","r":1}]
non-monotone, 4 blanks   -> [{"a":"Height","b":"Mass","r":0.29}]
```

Each attribute's values are filtered for blanks **independently**, then
correlated **by parallel index**, so a missing cell in either column shifts
the pairing for every later case. The last line is the one that matters: an
exactly perfect relationship reads as `r = 0.29` because 4 of 18 cases have a
blank.

**When `insight.js` is fixed, the last line must read `1`.** That is
completion metric 1 of M0 in `docs/WONDERINGS.md` §11.

## `observation-feasibility.mjs`

Shows that the three observers this design depends on are computable locally,
with plain arithmetic, from the case list CODAP already gives us via
`dataContext[name].itemSearch[*]`. It also contains the pairwise-complete
Pearson implementation (`corr()`) that `insight.js` needs.

Expected output, 2026-08-28:

```
legend does nothing    {"eta2":0.03,"groups":2}
legend separates       {"eta2":1,"groups":2}
Simpson fixture        {"overall":0.8,"within":["Newt:-1","Salamander:-1"],"reversedIn":2,"of":2}
growth-curve fixture   {"linear":0.94,"monotone":1,"gap":0.06}
```

- **eta²** — between-group over total variance. The honest form of "does this
  legend actually separate anything": 0.03 when the colours mix, 1.00 when
  they stack. Both answers are interesting, which is the point.
- **Simpson** — overall the relationship rises (+0.80) while inside every
  group it falls (−1.00). Detected with a few lines of arithmetic.
- **curvature** — the gap between rank (monotone) and linear correlation
  separates "straight line" from "curve that flattens".

These fixtures are the seeds of the fixture corpus described in
`docs/WONDERINGS.md` §10.1. They are **not** a test suite yet: they print, they
do not assert, and they exit 0 regardless. Turning them into asserting
fixtures with declared must-produce / must-not-produce sets is an M0 task.
