# SPIKE — same-origin CODAP + synthetic input injection (2026-08-25)

Question (Chad): can Dot generate real mouse drags/clicks — tutorial-by-
demonstration (drag attribute to axis, open menus/flyouts), and can we
leverage the native drag-displace-recover behavior of plotted points
(ultimately: Dot swims through the points and they part around her)?

**Answer: YES to all of it, via same-origin hosting. Every mechanism was
verified live against CODAP v3.1.0 this session.** Testbed committed:
`web/vite.config.js` (proxy) + `web/codap-same.html` (wrapper variant).

## Architecture: same-origin via proxy

- `web/vite.config.js` proxies `/codap/` → `https://codap3.concord.org/`
  (assets are relative paths — no rewriting needed beyond the prefix).
- `web/codap-same.html` = codap.html with `src="/codap/?embeddedServer=yes"`.
- The iframe-phone bridge works unchanged through the proxy (connected,
  API calls fine). For production, self-host a pinned CODAP build instead
  of proxying concord.org.
- Same-origin gives `iframe.contentDocument` access: full DOM read
  (measure anything — the calibration problem evaporates) and synthetic
  event dispatch. Untrusted (`isTrusted:false`) events are accepted by
  React, Chakra menus, dnd-kit, and PixiJS alike — verified empirically,
  not assumed.

## Verified findings + exact protocols

1. **Buttons/dialogs**: dispatch a full sequence (pointerdown, mousedown,
   pointerup, mouseup, click) OR just `click` — both activate React
   buttons ("Create New Document" dismissed the launch dialog).

2. **Toolbar menus/flyouts**: dispatch ONE `MouseEvent('click')` on the
   toolbar button — the real Chakra flyout opens. A full pointer+mouse
   sequence DOUBLE-TOGGLES (open then instantly closed) — one click only.
   Menu state is readable: the menu list (e.g.
   `[data-testid=tool-shelf-table-menu-list]`) stays mounted; its popper
   wrapper's `visibility` is the open/closed truth. Menu items: single
   click → real action (created a real case table this way).
   **GOTCHA**: menu labels use lookalike Unicode ("Νew" starts with Greek
   capital Nu U+039D) — NEVER match by text; use `data-testid` or index.

3. **Attribute → axis drag (the tutorial centerpiece)**: CODAP v3 uses
   dnd-kit; it responds fully to synthetic PointerEvents. Protocol:
   - `pointerdown` on the pill (`[data-testid="codap-attribute-button Mass"]`),
     `pointerId` constant, `buttons:1`, `isPrimary:true`
   - ~14 `pointermove`s stepping to the target, ~40ms apart (activation
     needs a few px of travel; dispatch on document or window)
   - `pointerup` dispatched **on the iframe's `window`** — dispatching it
     on `document` leaves the drag stuck; window is where dnd-kit listens.
   - Drop zones: `[data-testid=add-attribute-drop-bottom]` / `-left`, plus
     `.droppable-plot` etc.
   Verified end-to-end: Mass landed on x, `plotType` became `dotPlot`,
   with the real drag-preview pill rendering during the drag. The student
   sees EXACTLY what their own drag would look like.

4. **Point dragging (Chad's leverage question)**: points live in a PixiJS
   canvas (one `<canvas>` per graph; no DOM circles). Synthetic pointer
   drags on the canvas work:
   - **Dot plot**: dragging a point displaces it temporarily (it also
     becomes selected/blue, native highlight echoes in the case table);
     on `pointerup` it animates home by itself. **Item values audited
     before/after: NEVER mutated.** This is exactly the primitive for
     bat-a-point-without-doubles and for swim-through-the-points.
   - **Case plot** (no axes assigned): dots follow the drag and STAY
     where dropped (positions are arbitrary; still no data change).
   - Selection via pointer also just works (click on point = select).

5. **Ambient**: the wrapper's behaviors/engine all ran unchanged on the
   same-origin page throughout the spike.

## What this unlocks (opportunity space)

- **Tutorial assistant**: Dot performs REAL demonstrations — open the
  Tables menu, click New, drag Mass to the x-axis — with her paw synced
  to synthetic input driving the actual UI. No pantomime needed
  (pantomime+API-commit remains the fallback for anything injection
  can't reach).
- **bat-a-point v2**: bat the REAL point — native displacement + native
  recovery replaces the visual-double machinery; illusion perfect by
  construction; data provably untouched.
- **Swim-through-points**: continuous small drags under Dot's path as she
  crosses a graph — dot-plot points part and re-land natively.
- **Calibration deleted**: tile geometry, axis rects, point positions all
  readable from the iframe DOM/canvas directly; the offset+scale
  calibration and the PNG-export measurement become unnecessary on the
  same-origin path.

## Costs / open items

- Production needs a self-hosted pinned CODAP build (proxying concord.org
  is a dev convenience; version drift breaks data-testids silently).
- Selection side-effect: point-dragging selects the point (blue). A
  batted point flashing selected may be acceptable (kitten touched it!)
  or may need a `selectCases []` cleanup after.
- Dot-plot displacement distance appeared damped (~12px for a 60px drag
  in one measurement, possibly mid-animation) — characterize the actual
  drag-follow behavior when building on it.
- dataTips on hover: untested (everything else responds; test when needed).
- The cross-origin wrapper (codap.html) keeps working as-is; same-origin
  is additive via codap-same.html until we commit to it.
