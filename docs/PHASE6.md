# Phase 6 Work Order — Terrain: Perch, Peek, Kilroy

Design settled with Chad 2026-07-07. Dot treats tiles as terrain. Scope
decision: **targetable machinery only** — perch/peek/hover become
parameterized primitives any behavior can aim at a rect, edge, or point
(tile edges now; menus, attribute headers, axis regions in the wise-kitten
phase). Insight detectors are OUT of scope. `docs/CHARACTER.md` is binding
(playbook verification step 6); Dot takes no gendered pronouns.

## Goal

- **Perch on tiles** — sit on a tile's top edge; perching long enough while
  sleepy can become a nap, and a nap on a ledge ends the only way comedy
  allows: droop → slip → startled fall → instant recovery (< 2 s, rule 4).
- **Peek** — emerge partially from behind a tile's side/corner like a kid
  behind a wall, or the **Kilroy**: face + paws over the middle of the top
  edge. Emerge slow or medium (`ctx.pick`), never distractingly rapid; may
  just hover curiously for a while instead.
- **Targetable** — all of the above take an arbitrary screen rect/edge/point,
  proving the entree to signifying things of interest (menus, attribute
  headers, axes) without building the detectors yet.

## Architecture

- **Occlusion trick** (the technical heart): Dot's overlay always renders in
  front of the iframe, so "behind a tile" is faked with a three.js clipping
  plane at the tile's edge — one horizontal plane for Kilroy (hide below the
  top edge), one vertical plane for side peeks (hide beyond the edge).
  Additive Axolotl API: `clipAtScreenY(y, hideBelow)` /
  `clipAtScreenX(x, hideLeft)` / `clearClip()`; character meshes share one
  mutable plane; renderer gets `localClippingEnabled`. Emotes stay unclipped.
- **`web/src/terrain.js`** — the primitives, composable by any behavior:
  `perchOn(actor, rect, ctx, {t})`, `peekSide(actor, rect, ctx, {side,
  speed, holdSec})`, `kilroyOver(actor, rect, ctx, {t, holdSec})`,
  `fallFrom(actor, ctx)`. Every primitive registers `ctx.onCancel` cleanup
  (clearClip + stop) — a cancelled peek must never leave Dot half-clipped.
- **Clips (2 new via PLAYBOOK-clips):** `perch` (sitting loop: tail curled,
  slow gill sway) and `kilroy` (hold pose: paws raised like gripping a
  ledge, head slightly over). The fall composes from existing clips
  (droop → fast downward moveTo → startle → recover); no new fall clip.
- **Behaviors** (ambient, mood-gated, CHARACTER.md timing rules):
  - `perch-on-tile` (p16, tick, curious+playful mid, cd 240 s): swim up,
    perch a while, gaze around; if sleepy rises and the student is quiet,
    nap on the ledge → droop → **fall** → startle → recover → proud.
  - `peek-at-tile` (p19, tick, curious > .55, cd 180 s): pick side / corner
    / Kilroy via `ctx.pick`; emerge slow-or-medium, hover with gaze into
    the tile, linger, slip back or emerge fully and swim off.
  - `demo-peek-axis` (trigger: never; force-fire only): Kilroy/peek aimed at
    a real graph's x-axis region (tile bounds + plot insets) — the
    targetability proof for the wise-kitten phase.
- Engine: NO changes expected. selfTest gains: clip plane set→cleared on
  cancel; peek primitive respects one-at-a-time (covered by force-fire).

## Measurable end state — ✅ COMPLETE 2026-07-07

- [x] Kilroy: head + hooked paws above the tile's top edge, body hidden
      (`docs/verification/phase6/terrain-kilroy.png`).
- [x] Side-peek: partial emergence, body sliced at the vertical edge
      (`terrain-peek-side.png`).
- [x] Perch on live CODAP: Dot seated ON a real graph tile's title bar
      (`terrain-perch-live.png`, `terrain-napfall-a.png`).
- [x] Nap-fall observed: full sequence completed live (log:
      perch-on-tile done); nap + mid-fall frames captured on the console
      (`terrain-nap-on-perch.png`, `terrain-fall-startle.png` — the DOM
      fake-tile partially occludes the drop there; the wrapper overlay is
      topmost so the fall reads fully live).
- [x] Cancel clears clipping — selfTest assertion (36/36).
- [x] `demo-peek-axis` force-fired live: Kilroy rising from behind a real
      graph's x-axis region (`terrain-demo-axis.png`) — targetability
      proven on an arbitrary sub-tile rect.
- [x] selfTest 36/36 (24 behaviors); BEHAVIORS.md, BACKLOG, PLAN updated;
      milestone commits pushed.

## Milestones

1. Clipping API + terrain.js primitives + `perch`/`kilroy` clips →
   console-verified screenshots.
2. The three behaviors + selfTest + live verification.
3. Docs + push.

## Scope boundaries

**In:** the above. **Out:** insight detectors / when-to-signify logic
(wise-kitten phase); per-header or per-menu geometry beyond demo regions;
student→Dot input; sound; z-sorting against multiple overlapping tiles
(clip against ONE target rect only).

## Bail-outs

Phase 4/5 rules apply (3 strikes → PHASE6-NOTES.md; 30-min cap on API
investigations; regenerate binaries from merged script on parallel-session
conflicts). Clipping-specific: if plane math fights the stage transform
for >3 attempts, fall back to emerging from BEHIND the panel edge visually
(position + scale tricks, no clipping) and note it.
