# bat-a-point — design intent, current state, and the fix plan

Written 2026-08-25 to survive a context clear. Read this before touching the
behavior; it encodes both the intent and the diagnosis.

## STATUS: FIXED (2026-08-25, verified live on CODAP v3.1.0)

All steps below were executed and verified against live codap3.concord.org
(now serving **v3.1.0**, not the v3.0.3 the wrapper was first calibrated on).
Measured accuracy of the spawned double vs the real point (screenshot pixel
measurement, viewport 1440×900, dpr 1):

- dot plot (Mass, 12 items, outlier 6654): spawn (544.3, 511.8) vs real
  (544.9, 511.5) — **0.6 px**
- scatterplot (Mass×Sleep): spawn (546.6, 468.8) vs real (546.3, 468.8) —
  **0.3 px**
- after tile resize 560×360→700×450 AND move (40,40)→(120,90): spawn
  (751.8, 592.4) vs real (751.5, 592.3) — **0.3 px**
- color `#e6805b` exact; springs back and removes cleanly; engine selfTest
  43/43.

What changed (all in `web/src/`):
1. `props.js` — `parsePointColor()`: start from CODAP orange `#e6805b`, let a
   successful `THREE.Color.set()` overwrite; unparseable/empty never falls
   through to THREE's white default (the "white dot" bug).
2. `behaviors.js` — `PLOT_INSET` recalibrated against live v3.1.0 by
   measuring one point under two axis-bound configs and solving each edge:
   top 34.5, bottom 47.7, right 0.5, dotLeft 37.4 (no numeric y-axis),
   yAxisBase 45.6 + widest-tick-label width (canvas-measured, d3-style nice
   ticks at ~1/30px) when a y attribute exists. `plotRect()`/`plotX()`/
   `plotY()` replace the old constant-inset math.
3. `behaviors.js` bat-a-point run — picks the outlier **item** (not just the
   x value) so the scatterplot y uses the same case's y value via `plotY`;
   dot-plot y anchors the bottom row at `rect.bottom - radius - 1.5`;
   recomputes `c.bounds` from the freshly fetched `position`/`dimensions`
   (cached bounds go stale when a phone reply is lost or CODAP doesn't echo
   an author-made change); bat direction pushes AWAY from the herd
   (`dir = sign(value - mean)`, approach from the herd side, `bat_L` vs
   `bat_R` chosen to match); strike timing `BAT_STRIKE_SEC = 0.35` (first
   swipe peak of the 1.1 s clip: swipes start at t=0.25, peak 1/8 into the
   0.55 window); 0.25 s "where'd it go?" beat before springBack.
4. `demo-peek-axis` and `wise-attend` outlier-stare now use `plotRect()` too.

### Follow-up fix (same day): force-fire button did nothing

Chad pressed the panel's Force-fire → bat-a-point and saw nothing. Two
compounding causes, both rooted in LOST iframe-phone notifications:

1. **The engine's component model can be empty or blind.** A
   `component:create` notification that never arrives leaves the model
   empty; a graph whose attribute was assigned before the wrapper loaded
   (or whose `attributeChange` notification was dropped) sits at
   `attrsAssigned: 0` forever. bat-a-point's run() gated on
   `attrsAssigned > 0` and returned SILENTLY. (The earlier verification
   masked this by setting `attrsAssigned = 1` by hand before force-firing.)
2. Fixes (`behavior-engine.js`, `codap-bridge.js`, `behaviors.js`):
   - `bridge.components()` now reports `hasX` (live x-attribute presence);
     the engine seeds/heals `attrsAssigned` from it.
   - Periodic model reconciliation: `_resyncComponents()` sweeps the live
     componentList every 15 s (`COMPONENT_RESYNC_SEC`) from tick(), running
     even when behaviors are disabled — force-fire depends on the model too.
   - bat-a-point run() no longer gates on `attrsAssigned`: it probes
     candidate graphs (newest first) and lets the props fetch decide, with
     one retry per candidate for the flaky phone; if nothing is battable it
     emotes `?` instead of silently returning.
   - selfTest's "first data move" check now disables the engine and drains
     `actor.oneShot`/`motion` after cancelling — the resync made natural
     behaviors fire during live selfTest runs, exposing a pre-existing race
     where `_evaluate`'s motion-guard swallowed the simulated event.

Verified: fresh page → new doc → dataset+graph created with behaviors ON
and NO manual state fixups → model self-heals within one resync cycle →
the REAL panel button fires the full sequence (spawn at the verified
coordinates); selfTest 43/43 twice under live conditions.

### Visual polish round (same day, Chad's review)

Chad: (a) double a different size than the real point, (b) the real point
stays visible while the double flies, (c) the paw never gets near the
point. All three fixed and screenshot-verified on dot plot + scatterplot:

- **(a) + position ground truth**: new `measureRealPoint()` in
  `behaviors.js` — fetches CODAP's own PNG export (`get dataDisplay[id]`,
  which on v3.1.0 is the tile minus the 34-px title bar at 1:1 doc scale),
  scans a ±30 px window around the PREDICTED point for the nearest
  point-colored blob, and returns its exact screen center and drawn
  radius. The inset math is now just the prior; the render is the truth —
  robust to CODAP's count-dependent point sizing. Measured spawn (545,
  511.5) r 7 on the dot plot and (547, 469) r 6.5 on the scatterplot vs
  real (544.9, 511.5) / (546.3, 468.8). Runs concurrently with the
  approach swim; falls back to the prediction on any failure.
  GOTCHA: the pixel comparison must NOT use THREE.Color — its color
  management converts sRGB to linear (g 128 → ~55) and zero pixels match.
  Canvas `fillStyle` normalization parses the color instead.
- **(b)**: `PointDouble` takes `coverColor` (the graph's
  `backgroundColor`, default white) and spawns a background-colored patch
  over the real point, slightly BEHIND the character plane so the paw
  sweeps in front of it; removed with the double. While the double flies,
  the origin reads as empty plot.
- **(c)**: the stance was 70 px out with no body turn (gaze only), so the
  swipe hit air. Now: stand at 32 px from the point (24 px above), plus
  the same 3/4 body turn `tapAt` uses (`targetFacing = dir·0.38π`) so the
  camera-near paw sweeps over the point; `bat_L`/`bat_R` chosen so the
  paw matches the approach side. Strike-frame screenshots show the paw
  tip on the dot.

Known environment quirks discovered while verifying (kept for the next
session): iframe-phone replies are intermittently LOST on this wrapper —
always verify an update with a follow-up get, in a retry loop; the engine's
own traffic can interleave, so disable behaviors (`__engine.enabled=false`)
during API-driven test setup; `agent-browser record start` RELOADS the page
(kills the CODAP session) — use screenshot bursts instead; CODAP v3 renders
plot points in canvas (PixiJS), so ground truth comes from screenshot pixel
measurement, not DOM.

The original diagnosis and plan follow, unchanged, for provenance.

## Intent (what a bystander should see)

Dot's mischief meter fills. She eyes a populated graph, swims over beside one
particular plotted point — THE OUTLIER, the dot sitting apart from its herd —
goes still for a stalking beat, and bats it with her paw. The point flies off
in a squashy little arc, springs back elastically to exactly where it was, and
everything is as before. Dot swims away and is `proud`.

Crucially the "point" is a **visual double** (`web/src/props.js`,
`PointDouble`): a mesh spawned exactly over the real CODAP point, matched to
the graph's point color/size. The real data is never touched. Pedagogy: a
wordless "this point is interesting" — she picks the outlier *because* kittens
pick the thing that moves differently; like recognizes like.

## Anatomy (where everything lives)

- Behavior: `web/src/behaviors.js` → `id: 'bat-a-point'` (~line 690).
  Trigger: tick + `mood.mischievous > gate` + a graph with bounds and ≥1
  assigned attribute. Run: fetch component props → fetch items → outlier by
  max |x − mean| → `plotX()` maps value→screen via axis bounds → stalk →
  `actor.spawnDot()` → `bat_R` clip → `dot.batTo(-60,-20)` → `springBack()` →
  remove → swim away → `proud`.
- Prop: `web/src/props.js` `PointDouble` — spawn/batTo (arc + impact squash)/
  springBack (elastic overshoot)/remove. Solid; not the problem.
- Clip: `bat_R`/`bat_L` in `pipeline/02_build_clips.py` (server-authored paw
  swat).

## Observed failure (2026-08-24, Chad)

"All I see is a white point leaving Dot's hand." Two distinct bugs compound:

1. **White, not point-colored.** `props.pointColor` from
   `get component[id]` is passed to `new THREE.Color(string)`. An
   unparseable/empty string yields WHITE. Need to log the actual v3
   `pointColor` format (may be `''`, `rgba(...)`, or absent) and
   parse/fallback to CODAP's default point orange `#e6805b`.
2. **At the hand, not on the real dot.** Screen position: `plotX()` from
   `xLowerBound/xUpperBound` + hard-coded `PLOT_INSET`s, and `sy` assumes a
   DOT PLOT ("points rest just above the bottom axis"). So:
   - scatterplots (x AND y attrs) get a meaningless y — the double appears
     wherever the inset guess puts it (near Dot, since she stands beside it);
   - inset guesses were never calibrated against real v3 rendering;
   - doc→screen calibration (offset+scale in codap-bridge) compounds error.

## Fix plan (next session — verify each step live)

1. **Instrument first**: force mischief high, force-fire `bat-a-point` on a
   real Mammals dot plot AND a scatterplot; log `pointColor`, computed (sx,
   sy), and screenshot where the double lands vs the real point. One session
   of ground truth beats all guessing. (Use the wrapper panel: Mood →
   mischievous↑; Force-fire → bat-a-point.)
2. **Color**: parse `pointColor` robustly (try THREE.Color, catch/detect
   white-fallback, default `#e6805b`); also read `pointSize` scaling actual
   radius from it (v3 pointSizeMultiplier semantics — check live value).
3. **Position**:
   - scatterplot: compute sy from `yAttributeName` + `yLowerBound/yUpperBound`
     symmetric to `plotX` — use the OUTLIER CASE's y value (fetch both
     coordinates from the same item, not just x).
   - dot plot: keep bottom-anchored y but calibrate `PLOT_INSET` against a
     live screenshot (measure axis pixel origin for a known value).
   - consider `get component[id]` extras: v3 may expose plot area bounds
     directly (check `plotModels` / adornment info before hand-rolling).
4. **Polish once placed correctly**: bat direction should push AWAY from the
   herd (sign of (value − mean)); paw contact timing (the 0.4s sleep) should
   match the bat_R clip's actual strike frame; consider a tiny pause before
   springBack ("where'd it go?" beat).
5. **Acceptance**: on a live graph, the double is indistinguishable from the
   real point until the instant it moves, and lands back pixel-exact. Verify
   on: dot plot, scatterplot, resized graph, and after dragging the tile.

## Verification recipe

Wrapper page → open Mammals example → make a dot plot of Mass → panel: Mood
mischievous↑ ×3 → Force-fire bat-a-point → watch + screenshot. Repeat with a
Mass×Sleep scatterplot. The reaction log (Dot's mind section) narrates the
behavior's reasoning; the event log shows the API traffic.
