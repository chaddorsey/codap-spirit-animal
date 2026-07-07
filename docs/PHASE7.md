# Phase 7 Work Order — Data-Move Encouragement

Design: `docs/DATA-MOVES.md` (signatures live-verified 2026-07-07, incl.
Chad's manual `createCollection` confirmation). Character constraints:
`docs/CHARACTER.md` (binding; wordless, interruptible, never grading).
Motion: `docs/MOTION.md`. Engine guarantees inviolable.

## Goal

When a student performs a **data move** — filtering, grouping, summarizing,
calculating, making hierarchy — Dot notices, delights, and **investigates
the result**. The celebration says *you did a thing*; the investigation says
*the thing you did made something worth looking at*. No teaching, no
grading, no suggesting (that's Phase 8) — encouragement and curiosity only.

**Success sentence:** a student who drags `species` into the middle of a
graph sees Dot light up and swim over to study the newly colored points —
and a student doing their fifth filter sees only a warm nod, because Dot,
like any kitten, habituates.

## Architecture

1. **`web/src/data-moves.js`** — `classifyDataMove(resource, op, values)`
   → `{ move, kind, detail } | null`, pure table from the verified ops:
   - `hideUnselected`/`hideSelected`/`displayOnlySelected` → filtering:out
     (carry `numberHidden`); `showAllCases` → filtering:in
   - `legendAttributeChange` → grouping (attributeName, componentId)
   - `/^togglePlotted/` + `isChecked:true` → summarizing:adornment
     (un-checking is not a celebration)
   - `createAttributes` → calculating:newColumn
   - `updateAttributes` with `result.attrs[].formula` → aggregate-fn regex
     (`mean|median|count|sum|min|max|stdDev|stdErr|mad|variance|percentile|
     uniqueValues|correlation|rolling…`) → summarizing:formula else
     calculating:formula
   - `createCollection` → hierarchy
   - `dataContextCountChanged` → merging:newData (tracked, low-key)
   Bridge (additive): emit `'datamove'` events after classification.
2. **Engine student model** (additive): subscribe `datamove`;
   `state.dataMoves` Map(move → {count, firstAt, lastAt}) + `recentMoves`
   ring (10) for pattern detection; mood spike curious +0.35 / playful +0.25
   (the biggest event class); component association via detail.componentId
   for investigation targeting.
3. **`cheer-data-move` behavior** (p75, event-triggered on `datamove`,
   engine cooldown ~8s so distinct move types can cheer close together;
   per-move novelty ledger in `mem`):
   - **Tier 3 patterns first**: grouping→summarizing within 120s (ring scan)
     → dance + investigate; hierarchy → tinkerbell + **Kilroy over the
     table**; filtering:in → the delighted double-take (startle → curious).
   - **Tier 1 first-of-kind** (count===1): `!` + celebrate → investigate
     the result: swim to the affected tile; absorbed nose-close peer at a
     new column; head-tilt at a new legend.
   - **Tier 2 repeats, novelty decay**: 2–3 → proud beat aimed at the tile
     + nod; 4–6 → nod only; 7+ → 30% chance of a glance, else nothing
     (decline in trigger, not in run, so no dead firings).
   - Per-move-type cooldown 90s in mem; all responses cancel-on-action.
4. **Debug**: panel simulate buttons (`dm:group`, `dm:filter`, `dm:formula`,
   `dm:hierarchy`); selfTest grows: classifier table spot-checks, tier-1
   fires on first simulated move, tier-2 decay path, chain detection.

## Measurable end state

- [ ] Classifier unit-checked in selfTest against captured op fixtures.
- [ ] Live: legend drop → grouping cheer + investigation of the real graph
      (screenshot); hide-unselected → filtering ack; mean toggle →
      summarizing ack; formula apply → calculating vs `mean()` →
      summarizing (both classified correctly, one screenshot).
- [ ] Novelty decay demonstrated: same move fired 3× → responses visibly
      shrink (log evidence).
- [ ] Chain: grouping then summarizing inside 2 min → dance (live, screenshot).
- [ ] Hierarchy path exercised via simulated `createCollection` (real drag
      needs a human; op confirmed) → tinkerbell + Kilroy-over-table.
- [ ] selfTest green; BEHAVIORS.md/DATA-MOVES.md/BACKLOG/PLAN updated; pushed.

## Milestones

1. data-moves.js classifier + bridge emit + engine model/mood + selfTest.
2. cheer-data-move behavior + panel sims + selfTest tiers.
3. Live verification + docs.

## Scope boundaries

**Out:** suggesting moves (Phase 8); any text/labels; merging beyond the
low-key count; per-eye-menu-variant enumeration (family-matched);
responding to un-doing moves (un-check, re-flatten) beyond filtering:in.

## Bail-outs

Standard 3-strikes + 30-min caps. If an op family surprises (extra ops
firing alongside), prefer UNDER-cheering: drop the row to `raw` and note it
— a missed cheer is invisible, a wrong cheer is noise.
