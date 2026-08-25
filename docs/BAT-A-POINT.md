# bat-a-point — design intent, current state, and the fix plan

Written 2026-08-25 to survive a context clear. Read this before touching the
behavior; it encodes both the intent and the diagnosis.

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
