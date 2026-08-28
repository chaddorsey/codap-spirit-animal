---
title: "feat: Wonderings — ambient inquiry prompts over a live CODAP document"
type: feat
status: active
date: 2026-08-28
revised: 2026-08-28 (post-review, post-owner-decisions)
origin: docs/WONDERINGS.md
goal: docs/GOAL-WONDERINGS-U0-U5.md
baseline: 84da2db (branch fix/stale-iframe-document)
---

# feat: Wonderings — ambient inquiry prompts over a live CODAP document

**This document governs.** `docs/GOAL-WONDERINGS-U0-U5.md` is the short form for
starting work. The original design, `docs/WONDERINGS.md`, is superseded and left
unedited with a correction header; read it only for history.

This is the post-review revision. Seven document reviewers and a pedagogy
literature review reshaped it; what they found is folded into the sections below
rather than appended, except for the genuinely open items in
[Still Open](#still-open).

## Overview

A panel in the upper-right of the CODAP workspace shows, occasionally, one short
italic rhetorical question — a *wondering* — earned by real analysis of the
student's own dataset and current screen. Wonderings are ambient and attributed
to no one, so Dot stays wordless and `docs/CHARACTER.md` holds.

**This is speculative experimental work.** No classroom-readiness question gates
it. That is what makes the scope below defensible.

## Problem Frame

CODAP gives students a powerful exploration surface and no prompt to explore it.
The project already computes real structure in the dataset (`web/src/insight.js`)
and already models what the student has done (`web/src/behavior-engine.js`), but
that understanding is visible only in a hidden developer panel and expressible
only as the character's wordless attention.

**Caveat, honestly labelled:** the premise that students stall after their first
plot is `[PROPOSED]`, not evidenced. It carries no citation and no observation.
If it is wrong, this feature answers a question nobody has.

## Owner's Decisions

Recorded because they set scope and a fresh reader would otherwise reopen them.

1. **Classroom readiness does not gate this.** Speculative; experiment at will.
2. **"Off" means not visible, not "not functioning."** The pipeline runs; the
   panel is revealed by `?wonderings=1` or a Dot's Dashboard toggle.
3. **Undone uptakes still count. Demo moves and undos are never tracked at all** —
   filtered, not bucketed.
4. **The uptake window is 2 minutes.**
5. **Third-party API calls are permitted** in this experimental work.
6. **Location: upper-right, floating above CODAP's components, with Dot floating
   above it.** `#codap` has no z-index and `#stage` (Dot) is 50, so the panel sits
   at **z-index 40**.
7. **Unclickable for now.** Interaction is deferred to a later iteration.
8. **Uptake measured intra-student.** Cross-student diversity is the
   better-evidenced metric but there is no shared data, so: within-student
   exploration breadth plus best guesses, with the limitation stated.

## Requirements

- **R1** Visibility gated: hidden unless `?wonderings=1` or the Dashboard toggle.
  The pipeline runs regardless.
- **R2** Panel in the upper-right of the workspace, standing `Wonderings` label,
  multiple lines supported.
- **R3** Brief rhetorical questions, italic, light, fading in and out.
- **R4** Ambient — never the character speaking.
- **R5** Computed in advance where possible; live model calls permitted later.
- **R6** True wonderings: they need not prove true or have a correct answer.
- **R7** Responsive to what is on screen and to the learner's history.
- **R8** A scene model and a dataset model that are usable and extensible.
- **R9** Occasional, not permanent. A governing engine makes them appropriate,
  adjustable, and responsive to the student's activity level.

## Scope Boundaries

- **Not** the character speaking. No wondering text reaches `Axolotl.emote()`.
- **Not** injected into CODAP's DOM. Host-document overlay only.
- **Not** clickable at M0 (decision 7).
- **Not** an edit to `web/src/behavior-engine.js` (`docs/PLAYBOOK-behaviors.md`:
  *"if you think you need to, stop and ask"*).
- **Not** a new test framework or npm dependency.
- **Not** a learner mastery model.
- **Not** composing two observations into one wondering.

---

## The Wondering Families

**The unifying rule: no wondering without an earned observation.** The stem form
governs *who fills the blank*; it never means the system is guessing. Every family
below is gated on analysis of the student's actual data.

| Family | Form | Earned when | On Mammals |
|---|---|---|---|
| **Distribution** | *What does the distribution of ___ look like?* | \|skew\| > 1, or a gap > 35% of range, or \|z\| > 2.5, or cv > 1.5 | **4 of 5** |
| **Ordering** | *What if we sort by ___?* | a gap or a heavy tail — sorting reveals what the unsorted table hides | **4 of 5** |
| **Relationship** | *How does ___ go with ___?* | \|r\| or \|ρ\| clears the n-floor (0.576 at n=12) | **2** |
| **Second dimension** | *Does ___ matter here too?* | a univariate plot exists and the plotted attribute has a qualifying partner | scene-dependent |
| **Comparison** | *How do the means of ___ compare?* | eta² with a group-count ceiling and min group size | **0** — blocked |
| **Grouping** | *How would that look grouped by ___?* | low-cardinality categorical that actually separates | **0** — blocked |
| **Filtering** | *What if we only looked at ___?* | an outlier or a distinct subgroup exists | 1 (Mass) |

**Two properties worth noting.** The families are *complementary, not redundant*:
Sleep earns no distribution wondering (evenly spread) but is half of the best
relationship (Height × Sleep, r = −0.74). And the analysis *declines* — one of
five numeric attributes produces no distribution wondering at all, which is the
difference between dataset understanding and a stem generator.

**The blocker:** Comparison and Grouping produce nothing, because Mammals' only
non-identifier categorical is `Order` — 7 groups over 12 cases, smallest group 1.
This is the same blocker that kills `legend-separation`. **Adding a 3-group
`Diet` or `Habitat` column with ≥3 members each to `web/src/demo/fixture.js`
unblocks three families at once and is the cheapest change in the plan.**

All measured; reproduce with `docs/verification/wonderings/distribution-shape.mjs`
and `stems-over-datamoves.mjs`.

### Voice

Interrogative always; ≤ 8 words target, 70-character hard cap; no statistics in
the text; no imperatives; no assertions; **no second-person assessment** — the
load-bearing version of that rule is *never ask what you cannot hear*. Attribute
names must be rendered readable (a raw `Ht_cm` makes a lint-clean unreadable
sentence) with a suppress-if-unreadable fallback.

**Frame the panel as partial.** *"Here are some of many"* rather than *"here are
the questions worth asking."* Framing determines the *sign* of the effect on
student originality, and children explore more broadly when they know a source
omitted something — the best-evidenced, cheapest thing in the whole review
(`docs/verification/wonderings/pedagogy-literature.md` §4).

---

## The Wondering Engine (R9)

Wonderings must be occasional, appropriate, adjustable, and tied to activity
level. **Most of that already exists and is self-tested** — reuse
`BehaviorEngine`'s *state*, not its *lifecycle*.

**Reuse verbatim** from `web/src/behavior-engine.js:65-84`: `recentMoves` (ring of
10) for activity level; `idleSeconds` (live getter) for stall; `componentChurn`
for thrashing; `dataMoves` for novelty; `mood` for disposition; `lastActionAt` and
`ACTION_GRACE_SEC = 0.35` for the don't-interrupt precedent.

**The rate governor is the new part, and its core rule is inverted from the
obvious one: a student in flow gets fewer wonderings, not more.**
`CHARACTER.md:105-107` is binding — *"Never interrupt flow."* The moment of need
is the stall, not the streak.

- **In flow** (several moves in the last minute, low idle) — say nothing.
- **At a natural pause** (a data move landed and settled, then quiet) — best moment.
- **Stalled** (idle past threshold, or an empty graph sitting) — the moment of need.
- **Thrashing** (high `componentChurn`) — say nothing.

**De-escalate, don't escalate.** Each unacted wondering *lengthens* the interval
before the next — the opposite of the engine's nudge behaviour. Justified by
`docs/PHASE7.md`'s under-cheer rule and by the one study that measured it, which
found prompting decays motivation over time whether or not it is faded.

**Adjustable** means every rate constant is named, carries its unit and rationale,
is exposed on `window.__dotWonder` for live tuning, and is surfaced in Dot's
Dashboard beside the visibility toggle.

**Do not reuse the engine's lifecycle**, for three reasons: an intervention is
momentary where a wondering persists; the engine cancels on student action, which
is exactly when a wondering should stay; and `_evaluate:266` refuses to fire while
`actor.oneShot || actor.motion`, so a zoomie would suppress wonderings for nothing.
Reading `engine.state` needs no engine edit — the seam already exists
(`codap-main.js:427` writes `insight` onto it by bare assignment).

---

## Context & Research

### Patterns to follow

| Concern | Follow | Note |
|---|---|---|
| Toolbar-anchored overlay | `web/src/ui/dot-badge.js` | **Fix its three defects**: no `destroy()`, leaked resize listener, stops repositioning after 120 s |
| Iframe readiness | `codapDocReady(iframe)` | `sameOrigin()` is **not** a readiness check |
| API discipline | `DemoDriver.api()` `demo-driver.js:254-272` — reads 4× at 3 s, **writes never** | `bridge.request()` has no timeout and never rejects |
| Concurrent snapshot | `DemoDriver.snapshot({maxAgeMs})` `:304-338` | `CodapBridge.components()` is the serial, slow path |
| Monotone healing | `behavior-engine.js:396-410` | absence requires affirmative observation |
| Pure analysis split | `insight.js` — async fetch → plain object → pure `suggestMoves` | `suggestMoves` **imports and runs in node**, verified |
| Node-runnable fixture | `web/src/demo/fixture.js` | zero browser deps |
| Module conventions | `codap-bridge.js`, `data-moves.js` headers | JSDoc header giving *why with dated evidence*; SCREAMING_SNAKE constants each carrying unit and rationale |

### Institutional learnings

Never cache `contentDocument` — `about:blank` is same-origin. Writes are never
retried (one dropped reply once produced four graphs). Reads always are. Some
notifications don't exist at all, so a floor sweep is a primary channel. No drag
notifications for internal drags. Layout-forcing reads are the documented killer.
`ps -A | grep agent-browser` before any timing. One or two runs is not evidence —
the bar is three consecutive. Under-cheer deliberately.

### Measurements

Scripts in `docs/verification/wonderings/`, all reproducible:

1. `insight.js`'s correlation returns **r = 0.29** for a perfect relationship with
   4 blank cells in 18 cases — a pairing bug, and a live defect corrupting
   `wise-attend` today.
2. Distribution analysis earns wonderings on **4 of 5** Mammals numerics and
   correctly declines on Sleep.
3. Stems over data moves yield **21** wonderings on Mammals against **2** from
   correlation alone; `legend-separation` yields **0**.
4. The lint separates wondering from tutor on all 13 named cases, with one known
   blind spot: it cannot catch presupposition.
5. At n = 12 the significance floor is |r| ≥ 0.576. `insight.js`'s `STRONG_R = 0.5`
   is below it.

---

## Implementation Units

### U0 — DatasetModel: fix what is broken, add what the families need

**Goal:** Trustworthy analysis. Every family above depends on it.
**Dependencies:** none (pure).

**Files:** create `web/src/dataset-model.js` (pure, zero browser globals); modify
`web/src/insight.js` and `web/src/demo/fixture.js`; test
`docs/verification/wonderings/dataset-model.mjs`.

**Approach:**
- **Pairwise-complete Pearson** — the blocking fix; reference implementation in
  `observation-feasibility.mjs`.
- **Spearman**, for the skewed attributes Pearson mis-ranks.
- **Identifier exclusion**: `cardinality === caseCount` ⇒ excluded everywhere.
- **Distribution shape**: skewness, largest-gap fraction, max |z|, coefficient of
  variation — the four tells the Distribution and Ordering families need.
- **Group separation**: eta² with a group-count ceiling and minimum group size.
- Significance floor by n; retain `n` per pair.
- Analyze **per data context**; fix `Object.keys(rows[0])`.
- **Add a 3-group categorical to the Mammals fixture** (`Diet` or `Habitat`,
  ≥3 members per group), unblocking Comparison, Grouping and legend separation.
- Defer `attributeList` — its only consumers are semantic wonderings much later,
  and it is the one API call with no existing call site or known response shape.

**Execution note:** Test-first. The regression fixture and its expected value
(r = 1.00, currently 0.29) already exist.

**Test scenarios:** the 18-case/4-blank regression returns 1.00 · `Mammal`
produces nothing anywhere · `Order` is suppressed by the group ceiling · Sleep
earns no distribution wondering while Mass earns four tells · the new categorical
earns a Comparison wondering · <4 cases returns a result distinct from "no
context" · an all-blank column does not divide by zero.

**Completion:** `node docs/verification/wonderings/dataset-model.mjs` exits 0, and
`distribution-shape.mjs` reports group-comparison wonderings > 0.

### U1 — Families, realizer, lint, corpus

**Goal:** Every family emitting evidence-gated wonderings, and the reviewable
artifact — **before any browser work**.
**Dependencies:** U0.

**Files:** create `web/src/wonderings/families.js` (pure),
`web/src/wonderings/realize.js`, `web/src/wonderings/lint.js`; test
`docs/verification/wonderings/lint.mjs`, `corpus.mjs`.

**Approach:**
- Families are pure `(dataset, scene) → Observation[]`. No I/O, no clock, no
  randomness — this is what makes the corpus buildable without a browser.
- `key` namespaced by data context from the first commit: `family:context:attrs`.
- Realizer: several phrasings per family, selected by a hash of `key`, so the same
  observation always reads the same way. Determinism is not the liability the
  origin feared — vary *appearance*, not semantics, if variation is wanted later.
- Lint gates every realization. Promote the working prototype; add the
  attribute-name readability rule and its suppress fallback. **The presupposition
  guard moves out of M0** — with a fixed set of hand-written phrasings a human has
  read, it protects nothing and gates on an unsolved problem.
- Corpus enumerates (fixture × scene configuration) and emits every
  (state → observation → wondering) triple to one reviewable file.

**Completion:** `lint.mjs` exits 0 on all 13 named cases; `corpus.mjs` emits ≥ 40
triples, 100% lint-clean, exits non-zero on any failure. **The corpus file is the
artifact to circulate before building U2–U5.**

### U2 — SceneModel

**Goal:** What is on screen, cheaply and honestly, affordable to run permanently.
**Dependencies:** U0.

**Files:** create `web/src/scene-model.js`; modify `web/src/codap-bridge.js`; test
`docs/verification/wonderings/scene-model.mjs`.

**Approach:** reuse `driver.snapshot({maxAgeMs})` when a driver exists, else the
same concurrent `Promise.all` fan-out — never the serial `components()`. Extract
the read discipline into a standalone module both callers use, since no driver
exists cross-origin or for up to 60 s at boot and `driver.aborted` latches. Poll
policy: wall-clock sweep during quiet, defer after a `component:*` notification
until settle (the stall follows the press; the idle page is quiet). Suspend on
**`driver.active`** — not `phase`, which returns to `'idle'` after every tap and is
never set by `revert()`. Heal monotonically; carry `sceneVersion`. Make failure
modes discriminable: "reply lost" must not look like "nothing qualified."

**Completion:** `scene-model.mjs` exits 0; during a `tutorial2` run the SceneModel
issues 0 requests of its own.

### U3 — The wondering engine

**Goal:** Occasional, appropriate, adjustable, activity-linked.
**Dependencies:** U1, U2.

**Files:** create `web/src/wonderings/engine.js`; test
`docs/verification/wonderings/engine.mjs`.

**Approach:** the rate governor above, reading `engine.state`. Lifecycle
`absent → pending → visible → retiring → retired`, each transition recording a
reason (`stale | taken-up | timeout | hidden | scene-gone | document-changed`).
Premise re-checked against `sceneVersion` immediately before display; a premise may
be judged false only from a **successful** poll. Invalidation outranks the minimum
display floor, but keep a short **perceptibility** floor (~1.5 s after fade-in
completes) so a wondering cannot vanish before it can be read. Retired keys
re-arm only on a stated cooldown — undo restores the very scene that produced the
observation. Timers ride `performance.now()`, never frame `dt`.

**Completion:** `engine.mjs` exits 0, asserting: nothing emitted above the
flow threshold · one emitted within N s of a simulated stall · the interval
lengthens monotonically across three consecutive unacted wonderings.

### U4 — Panel

**Goal:** Upper-right, above components, under Dot, unclickable, revealed only on
request.
**Dependencies:** U3.

**Files:** create `web/src/ui/wonderings-panel.js`; modify
`web/src/codap-main.js`, `web/codap-same.html`; test
`docs/verification/wonderings/panel.md` (recorded protocol + screenshots).

**Approach:**
- **z-index 40** — above `#codap` (no z-index, document order), below `#stage` (50)
  so Dot floats over it. Note the upper-right already holds `.dot-badge` (120) and
  the Dashboard (100, `top:68px right:8px`); both are dev affordances and both will
  cover it when open. Top edge sits **below CODAP's tool shelf**, measured not
  guessed, the way `dot-badge.js` measures the Help control.
- Four states: `hidden`, `idle` (label only), `thinking` (visually identical to
  `idle` — a spinner in a quiet panel is an alert), `showing`.
- `pointer-events: none` (decision 7) — it must never intercept a click.
- Do not mount until `codapDocReady`. Read `contentDocument` fresh at every
  measurement, never cached.
- Fix the badge's three defects: return `destroy()`, remove the resize listener,
  and reposition for the whole session rather than stopping at 120 s.
- **Slow the dwell, not the crossfade** — a 400 ms opacity fade is a change-blind
  transition, the documented recipe for going unnoticed. Consider a slow rise and
  a sinking departure: it matches the "from the sky, like weather" concept in a
  product whose character is aquatic, and vertical motion is more perceptible in
  peripheral vision than opacity at low contrast.
- Legibility beats ambience where they conflict: state a backplate colour (without
  one no contrast ratio can be computed at all), font-size ≥ 14 px, weight ≥ 400,
  contrast ≥ 4.5:1. Carry ambience with italic, letter-spacing, absence of chrome
  and slow motion.
- `aria`: standing label outside the live region; `aria-live="polite"`,
  `aria-atomic="false"`, `aria-relevant="additions"`; one child per wondering with
  a stable key; fade-out not announced.

**Completion:** with `?wonderings=1` the panel renders in the upper-right below the
tool shelf on 3 consecutive loads · computed z-index is strictly between `#codap`
and `#stage` · Dot renders over it (screenshot) · without the parameter and
without the toggle it is not in the DOM · a full
`__demo.run('tutorial2','MakeScatterplot')` completes with all 8 Undo taps landing.

### U5 — Wire together and instrument

**Goal:** End to end, with intra-student breadth recorded.
**Dependencies:** U0–U4.

**Files:** modify `web/src/codap-main.js`; test
`docs/verification/wonderings/live-session.md`.

**Approach:**
- Provenance renders into the **existing** "Dot's mind" panel, not a new surface.
- **Intra-student breadth** (decision 8): distinct attributes touched, distinct
  move classes used, and distinct graphs created per session, recorded with and
  without the panel in alternating periods within one session. Cross-student
  diversity is the better-evidenced metric and is unavailable; **record that
  limitation in the results, not only here.**
- Ledger: `actor` filter (demo activity never enters), `shownAt`, `fadedAt` with
  reason, 2-minute window, undone uptakes still count. A wondering whose uptake is
  unobservable is `unmeasurable`, never *not taken up*.
- Document reset on `documentChangeNotice` or wholesale `dataContextList` change —
  note `codap-bridge.js` does not currently map that event, so it needs adding.
- Measurement protocol: process check first; arms interleaved within one page
  session, ≥3 reps; report worst frame gap and count of gaps > 1 s, never mean fps.

**Completion:** 3 consecutive live runs each show a wondering within 22 s of a
qualifying scene change · `(await __engine.selfTest()).pass === true` · a full demo
run produces 0 ledger uptake entries · breadth counters non-zero.

---

## Still Open

Not blocking U0–U1, but decide before U4:

- **Interaction.** Deferred by decision 7, but the metric is an action and the
  literature says such panels need affordance rather than prose. Revisit when
  iterating.
- **Fixed vs faded rate.** The evidence splits; what survives both sides is
  *adaptive to demonstrated competence, not scheduled*, plus per-wondering
  dismissal (the highest-scoring customization method measured). Per-wondering
  dismissal conflicts with decision 7 and needs resolving together with it.
- **Motivation decay.** The one study that measured it found prompting decays
  motivation over time regardless of fading. Nothing here measures that.
- **The premise itself.** That students stall after their first plot is untested.
- **Pedagogy citations are unverified** — the search budget was exhausted before
  the review returned. Confirm by DOI before anything leans on them. The five PDFs
  in `docs/pedagogy-reference/` remain unread and need no network.

## Risks

| Risk | Mitigation |
|---|---|
| Permanent background cost (pipeline always runs) | Settle-then-sweep poll policy; reuse the driver's snapshot; no per-rAF work; frame-gap check against baseline in U2 and U5 |
| Uptake measures the demo | Actor filter, with a regression asserting a scripted run yields 0 entries |
| Wonderings narrow exploration rather than widening it | Partial framing; families that decline; **breadth is the metric, not compliance** |
| A wondering is wrong | Every family evidence-gated; the wondering register makes being wrong survivable |
| Panel unnoticed | Slow dwell not fast fade; don't make it small; upper-right of the workspace rather than in chrome |
| Motivation decay | Recorded, unmitigated, unmeasured |
| Anchor breaks on a CODAP version bump | Failure logged and detectable, never a silent fallback |

## Sources

- Short form: `docs/GOAL-WONDERINGS-U0-U5.md`
- Superseded design: `docs/WONDERINGS.md`
- Character doctrine (binding): `docs/CHARACTER.md:13`, `:43-58`
- Behavior authoring: `docs/PLAYBOOK-behaviors.md`
- Interaction stack: `docs/DOT-INTERACTION-STACK.md`
- Pedagogy review (citations unverified):
  `docs/verification/wonderings/pedagogy-literature.md`
- Measurements: `docs/verification/wonderings/*.mjs`
- Retraction discipline: `docs/EXPERIMENT-RENDER-STARVATION.md` §0
- Under-cheer rule: `docs/PHASE7.md`, `docs/DATA-MOVES.md` §3
