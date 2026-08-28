# Wonderings build — adversarial verification, 2026-08-28

Four independent verifiers attacked the parallel build. **All four returned
WEAK** — none SOUND, none BROKEN. The system works: 11 of 11 tests pass, the
corpus emits, the output is scene-responsive and reads in the right register.
But the tests are weaker than they look and there are real defects.

Totals: **21 real defects · 18 tests a stub would pass · 4 contract violations**
(three of them soft).

Everything below was reported by a verifier; the four marked **[confirmed here]**
I reproduced independently before recording them.

---

## Blocking — fix before this is trusted

### 1. The lint rejects a required question type **[confirmed here]**
```
rejected  "What does the distribution of mass look like?"  <- second-person / teacher register
```
This is one of the five question types the owner asked for. The rule
`\bwhat (does|do|can)\b` was written to catch *"What does that legend tell us?"*
and catches both. **A false positive that silences the most natural phrasing of
the Distribution family.** The distinguishing property is *assessment*, not the
interrogative form — the load-bearing rule is *never ask what you cannot hear*.

### 2. The lint leaks the purest tutor register **[confirmed here]**
```
PASSES  "Let's think about mass?"        first-person-plural imperative
PASSES  "Compare mass and life span?"    instruction
PASSES  "Sort by mass?"                  instruction
PASSES  "Do the outliers matter here?"   statistical vocabulary, plural
```
Three separate holes. `SECOND_PERSON_ASSESSMENT` matches `\bus\b`, which the
contraction "Let's" does not contain, and `let` is absent from
`IMPERATIVE_OPENING` — a 15-verb closed list missing the verbs a tutor actually
uses (watch, compare, sort, describe, predict, show). And six of twelve
statistical terms are bare literals inside a `\b`-terminated group, so every
inflected form walks through.

### 3. The focus rule is dead for all well-formed output
A token only reaches the focus check if it is capitalised, underscored,
digit-bearing or camelCase — but `renderAttributeName` lowercases every name by
design. So the rule that stops a wondering naming an attribute outside its
`focus` cannot see correctly-rendered names. Its single test uses a capitalised
name and therefore passes.

### 4. The governor's binding rule does not hold **[confirmed here]**
```
interval after each successive unacted wondering: 162 -> 162 -> 162 -> 162
```
`Math.max(1, already)` clamps instead of incrementing, so de-escalation stops
after one step and the interval is flat forever. **De-escalation is the module's
single stated purpose** (`docs/PHASE7.md`'s under-cheer rule, and the one study
that measured prompting's effect on motivation over time).

Two more in the same file: `constantsFor` accepts any finite override, so
`tuning:{DE_ESCALATION_FACTOR:0.5}` *inverts* de-escalation into escalation —
breaking `CHARACTER.md:105-107` with it; and `countSince` never tests the lower
bound, so timestamps in the **future** count as activity.

### 5. A malformed reply presents as a mass deletion
`scene-model.js:366` guards only `list == null` and `list.success === false`;
anything else is authoritative, and `Array.isArray(list.values) ? list.values : []`
silently yields an empty scene on `{}`. **This is exactly the failure "absence
requires affirmative observation" exists to prevent** — it simply arrives through
the component *list* rather than through a component reply. The test covers a
dropped list and a refused list, never a malformed one.

---

## Real, not blocking

- **`realize.js`: key → text is not a function**, contradicting the module's own
  central invariant. Provable from the shipped `corpus.txt`: two triples carry
  identical keys and identical variants but read differently.
- **`__proto__` and `constructor` as column names escape** — `realize()` throws
  for a family colliding with an `Object.prototype` member, and a column named
  `__proto__` is spoken as "proto".
- **A column named `Means` or `Strength` defeats the no-statistics rule**, because
  the lint's vocabulary matches inside the rendered student column name.
- **The duplicate-focus guard compares raw names, not rendered ones**, so
  `['LifeSpan','Life_Span']` produces *"Does life span have anything to do with
  life span?"*
- **`distribution.js`: the `spread` tell is not sign-symmetric.** Negating every
  Mass value — identical shape — drops the tell, because the comparison is
  `cv > CV_FLOOR` rather than `Math.abs(cv) > CV_FLOOR`. It also fires spuriously
  on any column straddling zero.
- **`grouping.js`: the identifier rule is exact equality.** One blank cell in a
  12-case identifier column flips its role from `identifier` to `category`.
- **`correlation.js`: `correlatePairs` emits a self-pair** on a repeated name —
  `{a:'Height', b:'Height', r:1, qualifies:true}` — which the relationship
  families would turn into a wondering.
- **Key-separator inconsistency:** `comparison`/`filtering` join focus with `~`,
  `relationship`/`second-dimension` with `|`, in a field the contract declares is
  simultaneously the dedup key, the novelty key and the phrasing-hash input.
- **`dataContext == null` is treated as "belongs to this context"** by two
  families and as "does not belong" by three others.
- **The panel holds two items in the live region for 1600 ms** on an A → B change,
  with the retiring one still in normal flow.

## Contract violations

Ownership was **clean** — every W1 module wrote exactly the files plan `-002`
assigned it. Purity verified independently across all three analysis modules: no
clock, no randomness, no browser globals, no default exports, headers and
constants to house style.

Two soft ones worth fixing:

- `families/distribution.js` **re-declares all four thresholds and
  re-implements the tell logic**, importing nothing from
  `analysis/distribution.js`. Plan `-002` says the arithmetic lives in exactly
  one place.
- `governor.js` reads `engineState.idleSeconds`, which on a real
  `BehaviorEngine.state` is a getter that calls `performance.now()`. Touching the
  property invokes the clock — latent, since the module is otherwise pure, but it
  undermines the purity claim its own header makes.

## The pattern worth remembering

**Every one of the four groups passed its own tests, and every one was WEAK.**
The characteristic failure of parallel codegen is not broken code — it is code
whose author also wrote the test, so the test asserts what the code does rather
than what the contract requires. Concretely: the distribution test compares the
module's constants *to string literals copied from the same module*; the
determinism test re-realizes the same object, so a realizer ignoring `key`
entirely passes; the identifier test never blanks a cell; `correlatePairs` is
never called with a repeated name.

Mutation testing found these in minutes. It is the cheapest thing to add to the
next build.

---

# Outcome, 2026-08-28

Everything above this line is the record as it stood BEFORE the repair, and is
left unedited on purpose: what was wrong is worth as much as the fix, and a
finding whose original wording has been tidied to match the fix can no longer
be used to check the fix.

Seven agents repaired in parallel; this section is the integrator's independent
re-measurement. **Every defect was re-probed from outside the module that owns
it**, against the shipped code, not against the owner's test — because the
whole reason this document exists is that an owner's test asserts what the code
does.

**State: all 12 `t-*.mjs` exit 0, `corpus.mjs` exits 0, `node --check` clean on
`web/src/insight.js` and `web/src/codap-main.js`.** `insight.js` needed no edit:
`analysis/correlation.js` and `analysis/grouping.js` changed only additively
(one new export, `IDENTIFIER_DISTINCT_FRACTION`), and every name `insight.js`
and `codap-main.js` import still resolves at the same arity.

## Per defect

### Blocking

| # | Defect | Outcome | Evidence |
|---|---|---|---|
| 1 | lint rejects a required question type | **fixed** | `"What does the distribution of mass look like?"` passes. The interrogative-FORM alternative `\bwhat (does\|do\|can)\b` is gone; `tell us` still catches the §9.2 trap `"What does that legend tell us?"` |
| 2 | lint leaks the purest tutor register | **fixed** | All four leak cases refused. `\blet'?s\b` closes the contraction; `QUESTION_OPENERS` replaces the closed 15-verb list with a function-word ALLOW-list, so *any* bare infinitive opening is an imperative; `means?\b` and `outlier\w*` close the inflection holes |
| 3 | the focus rule is dead for well-formed output | **fixed** | `lintWondering('does mass go with sleep?', ['Mass'])` now reports `names an attribute not in focus (sleep)`. The rule is an ordinary-word stop-list, so it sees lowercase rendered names |
| 4 | the governor's binding rule does not hold | **fixed** | Interval across four unacted offers: **162.0 → 291.6 → 524.9 → 900.0** s (was 162 → 162 → 162 → 162), capped at `MAX_INTERVAL_SEC` |
| 4a | `constantsFor` accepts any finite override | **fixed** | `GOVERNOR_TUNING_RANGES` bounds each key; `DE_ESCALATION_FACTOR: 0.5` no longer inverts de-escalation |
| 4b | `countSince` never tests the lower bound | **fixed** | `insideWindow(age, w)` is `age >= 0 && age <= w`. The header records the measurement: a clock-base mismatch used to read `thrashing`, and now reads `stalled` |
| 5 | a malformed reply presents as a mass deletion | **fixed** | `READ_REASONS.LIST_MALFORMED` added and distinct. `success` must be exactly `true` **and** `values` must be an array; `{}`, `{success:true}`, `{values:[…]}`, a bare string and a bare array are all failed reads that preserve the scene and issue no per-component reads (`t-scene.mjs` §D2) |

### Real, not blocking

| Defect | Outcome | Evidence |
|---|---|---|
| `realize.js`: key → text is not a function | **fixed** | Over all **195** rendered rows in the regenerated `corpus.txt`: 0 (key, variant) pairs map to more than one text, and 0 keys map to more than one variant |
| `__proto__` / `constructor` escape | **fixed** | `isPrototypeMemberName()` refuses both, as a column name and as a family name. `realize()` returns `null` instead of throwing or speaking "proto" |
| a column named `Means`/`Strength` defeats the no-statistics rule | **partially fixed** | `Strength` is now speakable. `Means`, `Trend`, `Average`, `Median`, `Outliers` are **refused** by `STATISTICAL_NAME_WORDS` in `realize()` rather than spoken. The leak is closed by suppression, not by disambiguation — see *newly found N5* |
| the duplicate-focus guard compares raw names | **fixed** | `['LifeSpan','Life_Span']` and `['Mass','mass']` both render to one spoken key and `realize()` returns `null`. No more *"Does life span have anything to do with life span?"* |
| `distribution.js`: the `spread` tell is not sign-symmetric | **fixed** | Negating every value gives an identical tell set: `["skewed","gap","outlier","spread"]` both ways. A series straddling zero now earns `["gap"]` only — no spurious `spread` |
| `grouping.js`: the identifier rule is exact equality | **fixed** | 11 distinct values + one blank over 12 cases still classifies as `identifier`; `IDENTIFIER_DISTINCT_FRACTION = 0.9` |
| `correlatePairs` emits a self-pair | **fixed** | `correlatePairs(rows, ['Height','Height','Mass'])` → `["HeightxMass"]`, 0 self-pairs |
| key-separator inconsistency | **fixed** | 176 keys, 66 compound, **all** joined with `\|`; `KEY_SEPARATOR` is now a named export in `families/comparison.js` with the rationale for choosing `\|` |
| `dataContext == null` is treated inconsistently | **fixed** | All **seven** families now use strict `g.dataContext === context`, and all seven headers state the same convention: a null context does not belong |
| the panel holds two items in the live region for 1600 ms | **fixed** | New `t-panel.mjs` §D samples the whole 1600 ms sink and asserts at most one item in the live region at every sample, with the retiring one out of normal flow immediately |

### Contract violations

| Violation | Outcome | Evidence |
|---|---|---|
| `families/distribution.js` re-declares the four thresholds | **fixed** | It now imports `tellsFromShape` from `analysis/distribution.js` and declares **zero** threshold constants of its own |
| `governor.js` reads `engineState.idleSeconds` | **partially fixed** | `idleFrom()` computes `nowSeconds - lastActionAt` on the normal path and reaches `idleSeconds` **only** when `lastActionAt` is not finite, with the reason written into the header as "A DELIBERATE NON-READ". The clock read is narrowed to a fallback, not eliminated. A caller that omits `lastActionAt` still touches the getter |

## Newly found at integration

**N1 — a raw NUL byte in `web/src/scene-model.js` makes the file invisible to
`grep`.** Byte 15947, in `attrPairsPlotted`, is a literal U+0000 embedded in
a template literal used as a pair key: the line reads `const key =` followed by
a template joining `pair[0]` and `pair[1]` with that raw byte. The intent — an
unambiguous separator no attribute name can contain — is right; writing the byte
literally into the source is not. `file` reports the file as `data`, and
**`grep -c export web/src/scene-model.js` prints nothing and exits 1** while
`grep -a` finds 6. A future reader greps the file, is told there is nothing
there, and believes it; that is how this was found. Pre-existing — the byte is
in `HEAD` too, so it is not a regression from this round. `git diff` still
treats the file as text and `node --check` passes. The fix is to write the
six-character JavaScript escape for U+0000 instead of the byte itself.
**Not fixed here — `scene-model.js` is not the integrator's file.**

(This paragraph originally contained a literal U+0000 of its own, written while
describing the defect. It is gone; the byte count below is the check.)

**N2 — a refusal-blind register assertion cannot see defect 2 come back.** The
first draft of the new `REGISTER-GATE` check in `corpus.mjs` asserted only that
the tutor-register strings were refused. Mutating `lint.js` to put defect 2's
vocabulary hole straight back (`outlier\w*` → `outlier\b`, `means?\b` →
`mean\b`) **did not fail it**: both sentences were still refused, but by the
ordinary-word rule, which flags `outliers` and `means` as unrecognised nouns.
The stop-list and `STATISTICAL_VOCABULARY` overlap, so the two rules mask each
other. The check now names the rule that must catch each string, and the same
mutation fails it. Concretely: a maintainer who adds `outliers` to the
ordinary-word stop-list to unblock some future phrasing reopens defect 2, and
only the rule-named form of the assertion notices.

**N3 — a stale rationale comment in `realize.js:258-259`.** It still reads
*"What does the distribution of ___ look like?" — the stem, unshippable:
`what does ` trips the register rule.* Defect 1's fix made that false; the lint
accepts the stem now. The module HEADER was correctly updated (lines 35-49
record the re-measurement); this inline comment was missed. Cosmetic, but it is
the comment a reader lands on when asking why the family's most natural
phrasing is not in the list. **Not fixed here — `realize.js` is not the
integrator's file.** Related: no variant offers that stem even though the lint
now permits it, so defect 1's fix is currently unused by shipping output.

**N4 — distinct-wording headroom fell from 23 to 21 against a floor of 20.**
Not a lint rejection: all five phrasings that dropped out still lint clean. The
cause is the phrasing hash redistributing after `realize.js`'s determinism fix
and the `~` → `|` separator change, which together altered the hash input for
every compound-focus family. Two more phrasings colliding away would break
`MIN_DISTINCT_TEXTS`. Worth a phrasing-count check, not a repair.

**N5 — five plausible student column names are now permanently silent.** A
dataset with a column named `Means`, `Trend`, `Average`, `Median` or `Outliers`
will never earn a wondering about that column: `realize()` refuses it up front.
That is the deliberate resolution of the `Means`/`Strength` defect — refuse
rather than speak — and it is the safe direction, but it is a product decision
that was made inside a bug fix and is recorded here so it is visible. The real
fix is to exempt tokens that came from the rendered focus, which nothing does
yet.

## What was measured, and how

Regenerated corpus: **176 triples** (176 spoken, 0 refused) over 11 scenes,
**100 % lint-clean**, **21 distinct wordings**, plus a 32-triple refusal probe
in which 13 are suppressed for an unreadable column name. Byte-identical across
two enumerations.

Scene responsiveness is **unchanged**, per-family and per-scene, against the
pre-repair corpus — the counts below are identical in both files:

| scene | total | families |
|---|---|---|
| empty workspace | **16** | comparison 4, distribution 4, filtering 2, ordering 4, relationship 2 |
| univariate Sleep plot | **18** | + grouping 1, second-dimension 1 |
| Height × Mass scatter | **16** | grouping 1, relationship **1** (down from 2 — the plotted pair is not re-offered) |

Second-dimension fires only on univariate scenes (empty 0, bivariate 0,
univariate 1-2) and relationship drops 2 → 1 on the scatter, exactly as before.
The lint change moved which *words* are used, never which observations are
*earned*: the analysis modules and the lint are independent, and the corpus
shows it.

Three mutations were applied to the shipped code and reverted, each confirming
the new `corpus.mjs` assertions can actually fail:

1. re-adding `\bwhat (does|do|can)\b` to `SECOND_PERSON_ASSESSMENT` → `REGISTER-GATE` (accept half) FAILS, 2 wrongly refused, corpus exits 1
2. dropping `\blet'?s\b` and admitting `compare`/`sort` as openers → `REGISTER-GATE` (refuse half) FAILS, 2 leak, corpus exits 1
3. `KEY_SEPARATOR = '|'` → `'~'` in `families/comparison.js` → `KEY-SEPARATOR` FAILS, 42 keys, corpus exits 1

A fourth mutation (reverting the vocabulary inflection fix) initially did NOT
fail, which is finding **N2** above; after the assertion was strengthened to
name the rule, it fails.

## What the pattern section got right

The original diagnosis — *code whose author also wrote the test* — held up.
Every repair verified here was verified from outside its own module, and the one
assertion written the lazy way (refusal-blind, N2) was the one that survived a
mutation it should have caught. Mutation testing remains the cheapest check
available, and it is now wired into `corpus.mjs` rather than performed by hand.
