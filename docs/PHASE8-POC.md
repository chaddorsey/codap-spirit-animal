# Phase 8 Proof of Concept — The Wise Kitten (Inverted Classifier)

Status: **PoC shipped 2026-07-07** for exploration; the full phase gets a
work order after classroom impressions of Phase 7 + this PoC.

## What it is

Phase 7 classifies data moves the student MADE. Phase 8 inverts it:

1. **`web/src/insight.js` — `analyzeDataset(bridge)`**: pulls the first
   populated data context and computes affordances — per-attribute
   numeric/categorical typing, outliers (|z| > 1.8), pairwise Pearson
   correlations, groupable categoricals (cardinality 2–8), flat-vs-
   hierarchical structure.
2. **`suggestMoves(analysis, state.dataMoves)`** — the inverted classifier:
   affordances × moves-NOT-yet-tried → ranked suggestions
   `{ move, score, rationale, target }`. Novelty dominates (untried move
   classes score double); strength (|z|, |r|, cardinality fit) breaks ties.
3. **`wise-attend` behavior** (p24, tick, curious > .45, cd 240 s, each
   insight offered once): delivers the TOP suggestion purely as attention,
   per CHARACTER.md's wise-kitten rules — grouping → fascinated hover at
   the graph's middle; outlier → nose-close absorbed stare at the dot's
   actual computed position; hierarchy → perch at the table's left edge
   gazing at the drop zone; summarizing → Kilroy over the graph. One beat
   of knowing stillness, then a kitten again. **Never wrong loudly**: a bad
   suggestion reads as ordinary curiosity.
4. **"Dot's mind" panel** (collapsible, wrapper page): dataset analysis,
   the ranked Phase 8 suggestions with rationales (dark red #8b1a1a), and a
   reaction log narrating every behavior fire — Phase 7 data-move reactions
   in blue (#1c63d6), Phase 8 insights in dark red, everything else gray —
   sourced from the `MIND` description map (behaviors.js) via the engine's
   additive `onFire` hook.

## Verified (mammals demo dataset: planted outlier, r=.75 pair, 3-cat attr)

- Analysis found mass=900 (z=3.19), mass×lifespan r=0.75, habitat cat×3,
  flat table. Suggestions ranked: outlier-filtering 6.38 > grouping 6.00 >
  second outlier 3.60 > hierarchy 2.20 — all with readable rationales.
- wise-attend fired on the tick and swam to STARE at the actual outlier
  position (computed from axis bounds); mind log narrated it in dark red.
- cheer-data-move narration renders blue. selfTest 43/43.
- Evidence: docs/verification/phase8/.

## Open questions for the full phase

- Refresh cadence and staleness of the analysis (currently: on connect,
  after each data move, and the panel's "analyze now").
- Suggestion pacing vs. annoyance (240 s + once-per-insight is a guess).
- Whether attention alone lands with students, or the escalation ladder
  (attend → attend longer → tap the drop zone) should apply.
- Aggregate/derived affordances (binned distributions, time attributes).
