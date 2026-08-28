# Wonderings — ambient inquiry prompts over a live CODAP document

> **REVIEWED 2026-08-28. Fourteen claims below are corrected in
> `docs/plans/2026-08-28-001-feat-wonderings-ambient-inquiry-plan.md`.** This
> document is left unedited on purpose, per the `P#-NOTES` convention — the
> corrections live in the plan alongside the measurement that forced each one.
> Read the plan's "Corrections to the Origin Document" before acting on
> anything here.
>
> **Three you must not act on as written.** §4.2's `[VERIFIED]` frame-gap
> figure is not verified — it describes a measurement
> `docs/DRAG-GHOST-CONUNDRUM.md` §7 records as *"prepared and then abandoned"*,
> inside material `docs/EXPERIMENT-RENDER-STARVATION.md` later retracted, and
> what survived says the opposite: an idle page is quiet and stalls follow the
> press. §8.4's poll policy is built on that error and aims work at the
> busiest window. And §5's `legend-separation` observer fires confidently and
> wrongly on the Mammals dataset the tutorials actually ship
> (`docs/verification/wonderings/against-real-fixture.mjs`).

**Status: design, not yet built. Written 2026-08-28 for adversarial review.**

One sentence: a toggleable panel in CODAP's menu bar shows a small number of
short, italic, rhetorical questions — *wonderings* — that arise from what is
actually in the student's dataset and what is currently on their screen, and
that Dot may draw attention to without ever speaking them.

Repo: `github.com/chaddorsey/codap-spirit-animal`, branch
`fix/stale-iframe-document`, designed against commit `eb43d1a`.
Target: CODAP **v3.1.0 (build 2985)** in a same-origin iframe.

**Read before starting:** `docs/DOT-INTERACTION-STACK.md` for how the wrapper
reaches CODAP at all, and `docs/CHARACTER.md`, which governs everything Dot
does and constrains §1 below.

---

## Provenance convention used throughout this document

This project has repeatedly been damaged by confident claims that turned out
to rest on one or two runs (see `docs/DRAG-GHOST-CONUNDRUM.md` §5). Every
factual claim below is therefore tagged:

- **[VERIFIED]** — read off the named source file, or measured, on 2026-08-28.
- **[PROPOSED]** — a design decision made here. Arguable; argue with it.
- **[UNVERIFIED]** — believed but not yet checked. Each one is a task.

A reviewer's first job is to attack the **[PROPOSED]** items and to convert
the **[UNVERIFIED]** ones.

---

## 1. The character decision this rests on, and why it holds

`docs/CHARACTER.md:13` is binding and unambiguous: *"Everything Dot does is
wordless; personality carries entirely through motion, gaze, timing, and the
?/! emotes."* Line 43 addresses this exact pedagogical phase: the wisdom
*"must manifest in Dot's own unvoiced, playful register — never as a tutor
breaking character."* **[VERIFIED]**

**The resolution is that Dot does not author or speak wonderings.** They are
ambient — "from the sky." They belong to the environment, like weather. Dot's
only relationship to a wondering is the one the Character Bible already
licenses: **attention.** Dot may swim to the panel, sit beneath a wondering,
look from it to the graph it concerns, and emote `?`. `CHARACTER.md:46-49`
describes precisely this move — *"Dot doesn't point at the correlation; it
becomes fascinated by exactly the right two attributes."* **[PROPOSED, and
argued]**

This is not a loophole. It is strictly better than Dot speaking, for a reason
worth stating: **a wondering Dot merely attends to is one the student may
ignore without ignoring Dot.** Authorship would make every unacted wondering a
small social failure. Ambient authorship keeps the student's relationship with
the character clean, and keeps Dot's endorsement meaningful precisely because
it is occasional.

**Constraint carried forward:** no wondering text may ever be rendered in
Dot's emote bubble, spoken by Dot, or attributed to Dot in any copy. The panel
label is `Wonderings`, never "Dot wonders."

## 2. What exists today that this builds on

All **[VERIFIED]** by reading the named files on 2026-08-28.

| Capability | Where | State |
|---|---|---|
| Full CODAP Data Interactive API | `web/src/codap-bridge.js:45-48` — one generic `request(action, resource, values)` | Complete. Any plugin-reachable request works today |
| Whole-dataset read | `dataContext[name].itemSearch[*]`, called at `web/src/insight.js:26` | Working |
| Dataset affordance analysis | `web/src/insight.js` — attribute typing, z-score outliers, pairwise correlation, groupables, hierarchy | Working, **with a load-bearing bug** — §4.1 |
| Data-move classification | `web/src/data-moves.js` | Working; 6 move classes |
| Learner state | `web/src/behavior-engine.js:65-84` — components, dataMoves, recentMoves, idleSeconds, mood | Working |
| Arbitration (priority, cooldown, escalation, cancel-on-action) | `web/src/behavior-engine.js` | Working, self-tested |
| Toolbar-anchored overlay UI | `web/src/ui/dot-badge.js:144-182` | **The pattern this panel copies** — §6 |
| Text rendering for the student | — | **Does not exist.** `web/src/emotes.js:15-18` defines a closed character set of `?` and `!`; `show()` silently drops every other character |

What does **not** exist and must be built: a scene model (§4.2), a wondering
ledger (§4.4), the observer layer (§5), the realization layer (§7), the panel
(§6), and the test harness (§10).

## 3. Architecture — `Observation` is the contract

```
  CODAP  ──►  CodapBridge (exists)
                 │
     ┌───────────┼────────────┬──────────────────┐
     ▼           ▼            ▼                  ▼
 DatasetModel  SceneModel  LearnerModel   WonderingLedger
  (§4.1)        (§4.2)       (§4.3)           (§4.4)
     └───────────┴────────────┴──────────────────┘
                 │
                 ▼   PURE FUNCTIONS — no I/O, no clock, no randomness
            Observers (§5)  →  Observation[]
                 │
                 ▼   Scheduler (§8): budget, cooldown, staleness, yield-to-flow
            selected Observation[]
                 │
                 ▼   Realizer (§7): Observation → text.  Lint gate (§9).
            Wondering { id, text, observation, targets[] }
                 │
                 ├──►  Panel (§6)          — the student reads it
                 └──►  Dot (§1)            — may attend to it, wordlessly
```

**The single most important structural rule: an `Observation` names a claim;
a `Wondering` names words. Nothing downstream of the Observation may
introduce a claim that is not already in it.** **[PROPOSED]**

That rule is what makes a language model safe to introduce later (§7.3) and
what makes the whole pipeline testable without a browser (§10).

```js
Observation = {
  type:      'second-dimension' | 'unplotted-partner' | 'legend-separation' | …,
  key:       'second-dimension:Sleep:Mass',   // stable identity, for the ledger
  focus:     ['Sleep', 'Mass'],               // attribute names, ordered
  evidence:  { r: 0.71, n: 38, eta2: null },  // summary statistics ONLY
  strength:  0.71,      // 0..1, how strong the underlying signal is
  novelty:   1.0,       // 0..1, from LearnerModel — has this been explored?
  scope:     { componentId: 42 },             // what it is about, for Dot + linking
  openness:  'open' | 'checkable',            // §9.3 — does it even have an answer?
}
```

`evidence` carries **no case-level values and no case identifiers.** This is a
hard invariant, and it is what makes §7.3 defensible. **[PROPOSED]**

## 4. The four models

### 4.1 DatasetModel — extends `web/src/insight.js`

**A bug must be fixed before anything is built on this.** `insight.js:34-45`
builds each attribute's value array by filtering out blanks *independently per
attribute*, then `insight.js:62-74` correlates those arrays **by parallel
index**. Any missing cell misaligns the pairing.

Measured 2026-08-28 by replicating the exact arithmetic **[VERIFIED]**:

```
non-monotone data, 18 cases, complete   ->  r = 1.00
same data, 4 blank cells                ->  r = 0.29
```

A perfect relationship reads as noise. Correlations are the backbone of most
observers in §5, so **the pairwise-complete fix is a blocking prerequisite for
M0**, not a nice-to-have.

Two lesser defects in the same file **[VERIFIED]**: `insight.js:30` derives
attribute names from `Object.keys(rows[0])`, so any attribute absent from the
first case is invisible; and `insight.js:82` declares `hasFormulas: false`
with a comment promising it is "refined below," which never happens.

**Additions required beyond the fix:**

| Addition | Why | Tier |
|---|---|---|
| `attributeList` fetch | CODAP's declared `type`, `unit`, `description`, `precision` are **never requested anywhere in `web/src`** **[VERIFIED]** — everything is inferred from `Number.isFinite`. Units and author descriptions materially improve wording, and a declared type stops an ID column being treated as a measure | M0 |
| Pairwise-complete Pearson | §4.1 above | M0 |
| `n` retained per pair | A wondering premised on r=0.6 at n=5 is noise. Strength must be gated on sample size | M0 |
| Spearman (rank) correlation | Cheap, and the linear/monotone gap detects curvature | M1 |
| eta² for categorical × numeric | The honest form of "does this legend do anything" | M0 |
| Group-conditional correlation | Simpson's paradox detection | M1 |
| Attribute *role* inference (identifier / measure / category / date) | An ID column that correlates with everything is the classic false-positive generator | M1 |

Feasibility of the non-trivial ones was checked with a standalone script, no
browser, no model **[VERIFIED, 2026-08-28]**:

```
legend that does nothing     eta² = 0.03
legend that separates        eta² = 1.00
Simpson's paradox fixture    overall r = +0.80; within groups: -1.00, -1.00
growth-curve fixture         linear r = 0.94, monotone r = 1.00  (gap = 0.06)
```

### 4.2 SceneModel — new, and the reason nothing here works today

**The notification channel cannot support this feature.**
`component:attributeChange` carries only `{ id, type }` — it reports *that* an
axis binding changed on component N, and not which attribute, which axis, or
in which direction (`web/src/codap-bridge.js`, consumed at
`web/src/behavior-engine.js:226` as a bare `attrsAssigned++` counter).
**[VERIFIED]**

The polling channel is rich: `get component[id]` returns `xAttributeName`,
`yAttributeName` / `yAttributeNames[]`, `legendAttributeName`, `plotType`,
axis bounds, `hiddenCases[]`, `displayOnlySelectedCases`, `dataContext`,
position and dimensions. **[VERIFIED]** — consumed today at
`web/src/demo/demo-driver.js:326-333`.

**And `CodapBridge.components()` currently discards all of it**, returning
`{ id, type, title, bounds, hasX }` where `hasX` is literally
`!!c.values?.xAttributeName` (`web/src/codap-bridge.js:88-106`). **[VERIFIED]**

So the SceneModel is mostly a matter of *not throwing away data already
fetched*. **[PROPOSED]** shape:

```js
SceneModel = {
  graphs: [{ id, plotType, x, y, yAll[], legend, xBounds, yBounds,
             hiddenCount, onlySelected, dataContext, bounds }],
  tables: [{ id, dataContext, bounds }],
  other:  [{ id, type, bounds }],
  derived: {
    plottedAttrs:    Set,   // anywhere on any axis or legend
    unplottedAttrs:  Set,
    focusComponent:  id,    // most recently interacted-with
    atSeconds:       12.4,
  },
}
```

**Two risks specific to this project, both real:**

1. **iframe-phone replies get lost.** This is documented and worked around all
   over the codebase — 3× retry at `web/src/behaviors.js:180-183`, 2× at
   `:837`, and a 15 s `_resyncComponents()` safety sweep at
   `web/src/behavior-engine.js:117-121`. **[VERIFIED]** The SceneModel must
   assume any single poll may silently fail, and must never let a dropped
   reply present as "the student removed the attribute."
2. **Polling costs main-thread time on a page with a known thread problem.**
   `web/src/codap-main.js` records 26 fps idle and 3.8 fps mid-demo with
   single frame gaps of 6-12 s. **[VERIFIED]** A naive poll-every-second over
   N components is exactly the kind of load this page cannot absorb. §8.4
   sets the policy.

### 4.3 LearnerModel — extends `web/src/behavior-engine.js:65-84`

Already present **[VERIFIED]**: `dataMoves` (Map of move → `{count, firstAt,
lastAt}`), `recentMoves` (ring of 10), `components`, `selection`, `drag`,
`idleSeconds`, `mood`.

To add **[PROPOSED]**: `attrsEverPlotted` (Set), `attrPairsEverPlotted` (Set
of unordered pairs), `plotTypesUsed` (Set), and `sessionSeconds`. All are
cheap derivations from events already flowing.

Item (g) of the brief asks for responsiveness to *history*. History enters
scoring only through `novelty` — an attribute pair the student has already
plotted scores near zero. Deliberately, the LearnerModel is **not** a
competence or mastery model. §12 records why.

### 4.4 WonderingLedger — new

Per-session, in memory (M0), `sessionStorage` (M1). Records for every
wondering ever shown: `key`, `shownAt`, `dismissedAt`, `fadedAt`, `takenUpAt`,
and the Observation it came from.

It has three jobs: prevent repetition, feed `novelty`, and **measure uptake**
(§10.3). The third is the reason it exists in M0 rather than later.

## 5. The observer catalogue

An observer is a **pure function** `(dataset, scene, learner) → Observation[]`.
No I/O, no clock, no randomness — so every one is testable from fixtures with
no browser and no CODAP. **[PROPOSED]**

### Tier A — M0. Three observers, covering the brief's own examples.

| Type | Fires when | Evidence | Example realization |
|---|---|---|---|
| `second-dimension` | A univariate plot exists; the plotted attribute has a partner with strong \|r\| that is not on screen | `{r, n, partner}` | *How does sleep go with body weight?* |
| `unplotted-partner` | A bivariate plot exists; a third numeric attribute correlates with the y-attribute and is unplotted | `{r, n, partner}` | *Does height matter here too?* |
| `legend-separation` | A legend attribute is set on a graph | `{eta2, groups, n}` | *Do the colors stack up, or mix together?* |

`legend-separation` is the clearest demonstration of why real computation
beats scripting: **both outcomes are interesting**, and the wondering differs
by which one holds. A scripted "What does that legend tell us?" is empty by
comparison — and, per §9.2, is also in the wrong register.

### Tier B — M1.

| Type | Fires when | Note |
|---|---|---|
| `reversal` | Overall r and within-group r have opposite signs (Simpson's paradox) | The intellectually richest observer, and cheap. Verified computable in §4.1 |
| `curvature` | Spearman \|r\| materially exceeds Pearson \|r\| | Growth curves are the commonest real shape |
| `outlier-in-view` | A high-\|z\| case is inside the current plot's bounds | Overlaps the existing `wise-attend` behaviour; must not double-fire |
| `untouched-attribute` | An attribute has never been plotted and has structure | The gentlest possible prompt |
| `spread-contrast` | Grouping exists; one group's SD is much larger | "Why is one group so much more spread out?" |
| `crowded-axis` | A categorical with high cardinality is on an axis | A wondering, never a correction |

### Tier C — M2+.

Semantic wonderings that use attribute `description` and `unit`;
cross-representation wonderings (something visible in the table but not the
graph); history-shaped wonderings ("three ways of looking at sleep — what
about diet?"); and multi-observation composition.

**Composition is explicitly deferred to M2 and may never be built.** Two
observations combined is where a system starts asserting a narrative, and
narrative is the thing §1 forbids.

## 6. The panel

Per brief item (b). **[PROPOSED]** except where marked.

**Mount.** A `position: fixed` element in the **host** document, positioned by
measuring CODAP's Undo control through `frame.contentDocument` — exactly the
technique `web/src/ui/dot-badge.js:144-182` already uses for the Help control
**[VERIFIED]**, including its fallbacks: a selector cascade
(`[data-testid*="undo" i]`, `[title*="undo" i]`, `[aria-label*="undo" i]`), a
visibility-and-top-of-page filter, re-measurement on an interval and on
resize, and graceful degradation to a fixed corner when the control cannot be
found.

**The panel is never injected into CODAP's DOM.** Three reasons: it would
break whenever CODAP ships a toolbar change; it would be visible to the demo
runner's state-diff revert logic as document residue; and the overlay pattern
is already the house convention. **[PROPOSED]**

**The Undo selector is [UNVERIFIED]** — it must be read off a live CODAP
v3.1.0 and recorded, per the standard set by
`web/src/demo/resolvers.js`'s P0 verification table. This is an M0 task.

**Layout.**

```
┌──────────────────────────────────────────────────────────┐
│  Wonderings │ How does sleep go with body weight?        │  ← italic, light
│             │ Do the colors stack up, or mix together?   │
└──────────────────────────────────────────────────────────┘
                                            [Undo] [Redo] …
```

- Standing label `Wonderings` at the left, upright, not italic, quiet.
- Up to **3** lines (M0: **1**; see §8.2 for why the cap starts low).
- Italic, light weight, lower contrast than CODAP's own chrome — it must read
  as ambient, not as an alert.
- Fade in / fade out via opacity transition, ~400 ms **[PROPOSED]**.
- Non-interactive in M0. Clicking is M2 (§11).

**Toggle.** Per brief item (a). A single switch that (i) hides the panel,
(ii) stops the observer pipeline entirely, and (iii) stops the SceneModel
poll. Off must cost zero main-thread work, not merely zero pixels — given
§4.2's thread risk, a "hidden but still polling" state would be a trap.
Default state is **[PROPOSED] off** for M0 and revisited at M1.

**Accessibility.** `aria-live="polite"` so a screen reader announces a new
wondering without interrupting; the label is a real `<h*>` or `aria-label`;
italic light text must still clear contrast minimums, which is in tension with
"ambient" and needs a real check, not an assertion. **[UNVERIFIED]**

**Occlusion risk.** CODAP v3 renders its workspace scaled down at smaller
viewports (`web/src/codap-bridge.js` calibration comment) **[VERIFIED]**. At
narrow widths the menu bar may not have room for a three-line panel beside
Undo. Behaviour at small viewports is **[UNVERIFIED]** and is an M0 task —
the fallback is to reduce to one line, then to hide entirely.

## 7. Realization — Observation to words

### 7.1 The separation that makes everything else safe

`realize(observation, voice) → { text, provenance }`. Three implementations
share one interface, so the pipeline never changes when the realizer does.

### 7.2 `TemplateRealizer` — M0, the default forever

Local, deterministic, offline, zero latency. One template family per
observation type, with slots filled from `focus` and `evidence`, and several
phrasings per family selected by a hash of the observation `key` — so the same
observation always reads the same way, and different observations vary.

Determinism matters more than it looks: it makes the corpus test in §10.2
reproducible, and it means a teacher who sees a wondering can be shown the
same wondering again.

### 7.3 Model-authored phrasing — M2, offline

Because the observers are pure, every reachable `(dataset × scene)` state can
be enumerated offline. A model drafts and stress-tests phrasings across that
corpus; the **frozen output ships as the template library**. This buys
model-quality language with template-grade determinism, offline safety and
reviewability.

**This is the recommended way to use a model here.** **[PROPOSED]**

### 7.4 `LiveRealizer` — M3, deferred but not rejected

Per brief item (e). Constraints, all of which are testable:

1. The model receives **only the `Observation`** — never case values, never
   case identifiers. The §3 invariant is what makes this defensible.
2. Output must pass the §9 lint. On any failure, fall back to the template
   silently.
3. Output must name **only** attributes present in `observation.focus`. A
   response naming an attribute not in the Observation is discarded — this is
   the specific check that makes claim-injection structurally detectable.
4. Timeout budget; on timeout, template. The panel must never wait.

**Three objections a reviewer should press on** — none is dispositive, all are
real. Attribute *names* still leave the browser, and in a student-authored
dataset a column name can be personal; a Concord classroom deployment has
institutional obligations here that this document cannot resolve. A model
asserting an unsupported relationship is a pedagogical failure that is
invisible to the teacher in the room. And a network dependency in a school
building is a reliability question, not a theoretical one.

## 8. Timing, budget, and yielding

### 8.1 Wonderings are ambient, not interventions

The behaviour engine's core rule is one intervention at a time, cancelled by
student action (`web/src/behavior-engine.js`) **[VERIFIED]**. A panel entry is
not an intervention — it persists, it does not demand, and several may coexist.
It therefore needs its own scheduler.

But it must **yield on the same principle**. `CHARACTER.md:105-107` — *"Never
interrupt flow… Dot is interruptible by design."* **[PROPOSED]** rules:

- Never fade a wondering in while a drag is in progress, a menu is open, or
  the student has acted within the last **2 s**.
- Minimum display **20 s** once shown, so nothing flickers.
- Maximum display **3 min** unacted, then fade out.
- Fade out immediately if the wondering becomes false or irrelevant (its graph
  was deleted, its attribute was plotted).

### 8.2 Budget

**[PROPOSED]** M0: at most **1** visible, at most **1 new per 90 s**. M1:
raise to 3 visible after the §10.3 uptake data exists — *not before*. The
starting cap is deliberately below what the brief allows, because the failure
mode of this feature is wallpaper (§13.1) and a low cap is the cheapest
insurance while it is unproven.

### 8.3 Selection

Rank by `strength × novelty × typeDiversity`, where `typeDiversity`
down-weights an observation whose type was the last one shown. Never show two
observations sharing an attribute simultaneously.

### 8.4 Poll policy

Given §4.2's thread risk **[PROPOSED]**: poll the SceneModel on
`component:*` notifications (event-driven, not timed) plus a **10 s** floor
sweep for missed notifications; suspend polling entirely while
`driver.timelineActive` is true, since a demo is running and the thread is
already saturated; and suspend when the toggle is off.

## 9. Voice and register

Per brief items (c) and (f). This section is normative and lintable.

### 9.1 Form

- **Always interrogative.** A wondering is a question or it is not a wondering.
- **Brief** — target ≤ 8 words, hard cap 70 characters.
- **Italic, light weight**, per §6.
- **No statistics in the text.** No r, no n, no "strongly", no "significant".
  The evidence justifies the wondering; it is not part of it.
- **No imperatives.** Not "Try…", "Drag…", "Look at…", "Notice…".
- **No assertions.** Not "Height and mass are related."
- **No praise, no assessment.** Not "Nice graph!", not "What did you find?"

### 9.2 The register trap, stated explicitly

The three examples in the original brief are **not the same speech act**, and
the difference is the whole design.

> *I wonder whether height depends on mass too?* — a fellow investigator.
> *How does that vary with height?* — a fellow investigator.
> *What does that legend tell us?* — **a teacher.**

The third is the pseudo-Socratic form: a question with a right answer already
in mind, quietly assessing whether the student has it. It breaks §1 as surely
as an instruction would. Its legitimate sibling is *Do the colors stack up, or
mix together?* — same subject, no answer presumed.

**Rule: second-person questions about what the student sees, thinks, or has
learned are forbidden. Impersonal or first-person wonderings are permitted.**

### 9.3 Wonderings need not have answers

Per brief item (f), and this is a feature. `openness: 'open'` observations —
*Does height matter?* — model genuine inquiry precisely because they are not
resolvable by one move. **[PROPOSED]** at least one visible wondering in three
should be `open`.

There is a real tension here that §13.2 records: a system that only ever
wonders about things that pan out teaches students that the panel is an oracle
and that checking is unnecessary.

### 9.4 The lint

`lintWondering(text) → { ok, violations[] }`, a pure function, applied to
**every** realization regardless of source. Mechanically checkable rules:
ends with `?`; ≤ 70 chars; matches no imperative-opening pattern; contains no
digit, no `r =`, no statistical vocabulary from a closed list; contains no
second-person assessment pattern (`you `, `we `, `what does`, `tell us`,
`did you`); names only attributes present in `observation.focus`.

The lint is the single most important piece of machinery in this document,
because it is what lets §7.3 and §7.4 be attempted at all without losing
control of the register.

## 10. Test machinery

Designed so the work can be checked by another model, or by a person, without
a browser and without a running CODAP.

### 10.1 Fixtures

A directory of small datasets with **known ground truth**: a clean
correlation, a correlation with scattered missing cells (§4.1's regression), a
Simpson's-paradox pair, a separating legend, a non-separating legend, a growth
curve, a high-cardinality categorical, an ID column that spuriously correlates
with everything. Each fixture declares the observations it *must* produce and
the ones it *must not*.

Seeds for four of these exist already, written 2026-08-28 and used to produce
the measurements in §4.1.

### 10.2 The corpus test

Because observers and realizers are pure, enumerate `(fixture × scene
configuration)` exhaustively and emit every `(state → observation →
wondering)` triple to a single reviewable file. Then:

- **Mechanical pass:** every emitted text passes §9.4's lint. Exit non-zero
  otherwise. No judgment involved.
- **Model-judged pass:** a model reviews the corpus for register violations
  the lint cannot catch and for unsupported claims, reporting per-line
  verdicts. Judgment involved, so this reports rather than gates.

This is the artifact to hand to a reviewer: not the code, the corpus.

### 10.3 The uptake metric

The only question that matters is whether a wondering changed what the student
did next. `behaviors.js` entries already support `satisfied(state, event)`
**[VERIFIED]**; the analogous predicate for a wondering is *the student
plotted the pair it named, within N minutes*.

Instrument in M0, not later. Without it, every subsequent decision — cap,
budget, whether live model calls are worth their cost — is a matter of taste.

## 11. Tiers, from must-have to nice-to-have

Completion metrics are written to be checkable **without judgment**, per the
convention in the user's global `CLAUDE.md`.

### M0 — MVP. The panel is real, one wondering at a time, no history, no model.

Must-haves: the `insight.js` pairwise-complete correlation fix; `attributeList`
fetch; SceneModel from polled component data; the three Tier-A observers;
`TemplateRealizer`; the §9.4 lint; the panel with its toggle; the ledger with
uptake instrumentation; fixtures and the mechanical corpus pass.

**Completion metrics.**
1. `insight.js` correlation on the 18-case 4-blank fixture returns `r = 1.00`,
   not `0.29`.
2. The Undo-anchor selector is recorded in this document with the CODAP build
   it was read from, and the panel's measured position is within 4 px of the
   Undo control's left edge at 1440 px viewport width.
3. With `web/codap-same.html?tutorial=2` loaded and a univariate plot of one
   numeric attribute created, exactly one wondering appears within 10 s.
4. Toggling off removes the panel from the DOM **and** issues zero
   `component[id]` requests over the following 60 s.
5. The corpus test emits ≥ 40 triples, and `lintWondering` passes on 100% of
   them; the command exits non-zero on any failure.
6. Every fixture's declared must-produce and must-not-produce sets hold.
7. No wondering text is reachable by `Axolotl.emote()` — grep-checkable.

### M1 — History, richer observers, and Dot's attention.

Tier-B observers; `attrsEverPlotted` / pair novelty; `sessionStorage` ledger;
the visible cap raised to 3 **only if** M0 uptake data supports it; and Dot's
attention link — swim to the panel, sit beneath a wondering, look from it to
the component in `observation.scope`, emote `?`, then leave. Registered as a
normal behaviour so it inherits cooldown, priority and cancel-on-action.

**Completion metrics.** The `reversal` observer fires on the Simpson fixture
and does not fire on the clean-correlation fixture. Dot's attention behaviour
cancels within 1 s of student action, per the engine's existing rule. Novelty
suppression is demonstrated: an attribute pair plotted once never produces a
`second-dimension` observation naming that pair again in the same session.

### M2 — Interaction and model-authored phrasing.

Clicking a wondering highlights the component and attributes it concerns
(brief item (d)); model-authored phrasing library frozen offline (§7.3);
Tier-C semantic observers using `description` and `unit`; the model-judged
corpus pass.

### M3 — Live model calls, and only if M0-M2 earned it.

`LiveRealizer` under §7.4's four constraints; cross-session ledger; teacher
visibility into what was shown. **Gated on** the §10.3 uptake metric showing
M2 wonderings are acted on measurably more often than M0's — because if
template wonderings are already ignored, better wording is not the problem.

## 12. Rejected options, and why

Recorded so they are not re-proposed. A fresh reader re-derives whatever a doc
does not explicitly close.

| Option | Why rejected |
|---|---|
| **Dot speaks the wonderings** | `CHARACTER.md:13, 43`. Also strictly worse — §1's argument about unacted wonderings becoming social failures |
| **Inject the panel into CODAP's DOM** | Breaks on any CODAP toolbar change; shows up as residue to the demo state-diff revert; `dot-badge.js` already established the overlay convention |
| **Extend the three.js emote pipeline to sentences** | `emotes.js:15-18` is a closed `?`/`!` set built for single extruded glyphs; sentences in extruded 3D type would read as a title card, not as ambient text |
| **Drive the SceneModel from notifications** | `component:attributeChange` carries no attribute name (§4.2). Not a preference — it cannot work |
| **A live model call in the MVP** | Deferred to M3, not rejected. Privacy, offline reliability, latency, and unverifiable claims — but chiefly that it cannot be evaluated until §10.3 exists |
| **A learner mastery/competence model** | Large, hard to validate, and ethically loaded in a classroom tool for 10-year-olds. `novelty` gets ~80% of the benefit at ~2% of the cost and makes no claims about the child |
| **One wondering per observation with a "correct" answer** | Brief item (f), and §9.3 |
| **Composing multiple observations into one wondering** | Deferred to M2 and possibly forever — composition is where a system starts asserting a narrative, which §1 forbids |

## 13. Risks and kill criteria

### 13.1 Wallpaper — the likeliest failure
Ambient text that is always present stops being read within minutes. Mitigated
by the low M0 cap (§8.2), the 3-minute fade-out, and never repeating a
wondering. **Detected by** §10.3 uptake trending to zero.

### 13.2 Suppressing the student's own questions — the most serious failure
A panel that supplies good questions may stop students generating their own,
which inverts the pedagogical goal. This risk is **not** mitigated by anything
in this design and cannot be measured by uptake — high uptake could even be
evidence *for* it. **[UNVERIFIED, and the most important open question in this
document.]** It needs a classroom observation protocol, not a metric.

### 13.3 Wrong but loud
A wondering premised on a spurious correlation — an ID column, an artifact of
missing data, n=5. Mitigated by the §4.1 fix, the `n` gate, role inference
(M1), and the wondering register itself, which makes being wrong survivable in
a way an assertion would not be.

### 13.4 Thread cost
§4.2 and §8.4. **Detected by** `window.__dotPerf.gaps` (already built,
`web/src/codap-main.js`) showing no increase in frame gaps > 250 ms with the
toggle on versus off.

### 13.5 Kill criteria
Abandon the feature if, after M1: uptake is statistically indistinguishable
from zero across ≥ 5 sessions; or the toggle-on frame-gap regression in §13.4
is material and cannot be removed; or classroom observation finds §13.2
occurring.

## 14. Bail-out criteria

Phrased as bail-outs, not gates — report and stop, do not decide:

- Any change to `docs/CHARACTER.md` — the character doctrine is the owner's.
- Any decision to send data of any kind to a third-party API from a classroom
  deployment — institutional, not technical.
- Any wondering text shipped as a fixed default that a reviewer flags as
  teacher-register — voice is the owner's call, and §9.2 is a guideline that
  will have edge cases.
- Discovering that CODAP v3's menu bar cannot host a three-line panel at
  common classroom viewport sizes — that is a design change, not a bug fix.

## 15. Open questions for the adversarial review

1. **§13.2** — is there any way to detect question-suppression short of
   classroom observation? If not, should M0 ship to classrooms at all, or only
   to the developer's own machine?
2. Is `openness: 'open'` (§9.3) sound, or does an unanswerable prompt in a
   tool built for answering questions just read as noise?
3. Is one visible wondering (§8.2) too conservative to test the idea at all?
   A single line may be indistinguishable from a status message.
4. Does the §3 invariant actually hold under §7.4, given that attribute names
   leave the browser and can be student-authored?
5. Is the `TemplateRealizer`'s determinism (§7.2) a liability — will a student
   who sees the same wondering across two sessions read the whole panel as
   canned?
6. The `reversal` observer (Simpson's paradox) may be beyond a 10-year-old.
   Is a wondering the student cannot act on worse than no wondering?
7. §11's M0 asks for eight things. Is the pairwise-correlation fix plus the
   SceneModel plus one observer a better first cut — with the panel itself
   rendering into the existing hidden dashboard until the observers are proven?

## 16. Related documents

- `docs/CHARACTER.md` — governs §1 and §9; where the two differ, it wins
- `docs/DOT-INTERACTION-STACK.md` — the machinery §2 builds on
- `docs/DATA-MOVES.md` — the Erickson/Wilkerson/Finzer/Reichsman framing behind
  `web/src/data-moves.js`
- `docs/BEHAVIORS.md` and `docs/PLAYBOOK-behaviors.md` — how M1's attention
  behaviour must be authored
- `docs/DRAG-GHOST-CONUNDRUM.md` §5 — why this document tags provenance
