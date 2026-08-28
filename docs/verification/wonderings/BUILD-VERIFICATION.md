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
