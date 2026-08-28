# Verification notes — `web/src/ui/wonderings-panel.js` (W2 module K)

Written 2026-08-28, branch `fix/stale-iframe-document`.
Governing plan: `docs/plans/2026-08-28-002-feat-wonderings-parallel-build-plan.md`
(module **K**, wave W2). Rationale: `docs/plans/2026-08-28-001-feat-wonderings-ambient-inquiry-plan.md` §U4.

**Why this file is prose AND there is now a `.mjs` as well.** Every other W1/W2
module is a pure function over data and is verified by
`node docs/verification/wonderings/t-*.mjs`. Module K owns geometry, stacking and
paint inside a live CODAP iframe, so it was originally commissioned with this
prose protocol as its *only* verification.

**That was drawn too widely, and it cost a defect.** The 2026-08-28 adversarial
verification (`BUILD-VERIFICATION.md`) found the panel holding **two items in one
`aria-live` region for the full 1600 ms sink**, with the retiring one still in
normal flow — found with a DOM shim, in seconds, with no browser involved. "Needs
a browser" is true of colour, layout and computed style. It is **false** of DOM
shape, ARIA, timers and teardown.

So verification is now two halves, and neither replaces the other:

| Half | Path | Decides |
|---|---|---|
| Automated | `docs/verification/wonderings/t-panel.mjs` — `node docs/verification/wonderings/t-panel.mjs`, exits 0 | declared `z-index` and `pointer-events`; DOM shape and ARIA; at most one item in the live region, ever; `destroy()` releasing element, resize listener and timers; `contentDocument` re-read at every measurement |
| Manual | **§6 below** | everything only a browser can decide — see §5's "what the node test cannot decide" list |

`t-panel.mjs` uses a hand-written DOM shim and a virtual clock. **No jsdom and no
test runner**: the goal's boundaries forbid adding a dependency, and a shim that
only implements the surface the module touches is also a readable statement of
exactly how much browser this module needs.

**Filename note.** The plan's W2 table calls this artifact `panel.md`; plan `-001`
§U4 calls it `docs/verification/wonderings/panel.md`. It is written here as
`panel-notes.md` because that is the path module K was commissioned against.
Anything looking for `panel.md` should look here.

---

## 1. Z-index: exactly 40

**Value:** `Z_INDEX = 40` in `web/src/ui/wonderings-panel.js`, interpolated into
the `.wonderings-panel` rule. It is not written twice; the CSS reads
`z-index: ${Z_INDEX}`.

**Why 40 and not another number.** Measured from `web/codap-same.html` lines 8–12:

| Element | Selector | `z-index` |
|---|---|---|
| CODAP itself (the iframe) | `#codap` | **none** — stacks by document order |
| The Wonderings panel | `.wonderings-panel` | **40** |
| Dot's canvas | `#stage` | 50 |
| Dot's Dashboard | `#panel` | 100 |
| Dot's head badge | `.dot-badge` | 120 |

`#codap` declares no `z-index` at all, so it participates in document order and
any positioned element with a positive `z-index` paints above it. `#stage` is 50.
40 is therefore the required sandwich: **strictly above every CODAP component,
strictly below Dot.** The goal's W3 metric — "computed z-index strictly between
`#codap` and `#stage`" — is satisfied by any value in `1…49`; 40 was chosen to
leave headroom on both sides for a future surface without renumbering anything.

**Known and accepted occlusion.** `.dot-badge` (120) and the Dashboard (100,
`top: 68px; right: 8px`) both live in the upper right and **will cover this panel
while open**. Both are developer affordances, not student surfaces, so this is
correct behaviour rather than a defect. Do not "fix" it by raising the panel
above 50 — that would put a rhetorical question on top of the character.

---

## 2. The measured anchor

**Requirement:** the top edge sits below CODAP's tool shelf, *measured* the way
`web/src/ui/dot-badge.js` measures the Help control — never hardcoded, because a
fixed offset drifts the moment CODAP's toolbar changes.

**How `reposition()` computes the top edge:**

1. Read CODAP's document **fresh**, via `liveDoc(frame)`, inside `try/catch`.
2. Reject it unless `location.href` is neither `''` nor `about:blank` **and**
   `body` exists. This is the readiness check from
   `docs/DRAG-GHOST-CONUNDRUM.md` §0, not an origin check.
3. Selector cascade for the shelf **container**, most specific first
   (`SHELF_SELECTORS`):
   - `[data-testid="tool-shelf"]` — the same selector `web/src/inject.js:403`
     already depends on, so it is load-bearing elsewhere in this repo, not a guess
   - `[data-testid^="tool-shelf"]:not([data-testid*="button"])`
   - `.tool-shelf`
4. Fallback cascade for a control known to sit **inside** the shelf
   (`SHELF_CONTROL_SELECTORS`): `tool-shelf-button-undo`, `tool-shelf-button-redo`,
   then the three Help selectors `dot-badge.js` uses verbatim. A control's bottom
   sits above the shelf's own bottom padding, so `CONTROL_PAD_PX = 6` is added.
5. Plausibility filter on every candidate rect, so a component cannot be mistaken
   for chrome: `height ≥ 12`, `width ≥ 80` (container) or `≥ 8` (control),
   `top < 160`, `bottom > 0`. Topmost surviving match wins.
6. `top = frameRect.top + shelfBottom + SHELF_GAP_PX(10)`, floored at
   `MIN_TOP_PX(8)` and clamped to `viewportHeight − BOTTOM_SAFETY_PX(96)`.
7. `right = max(EDGE_GAP_PX(12), viewportWidth − frameRect.right + 12)` — inset
   from the **frame's** right edge, so it stays correct if the iframe ever stops
   being full-bleed.

**When nothing can be measured** — cross-origin, CODAP not yet rendered, or the
markup changed — the panel falls back to `FALLBACK_TOP_PX = 60`, derived from
CODAP v3's shelf measuring ~50 px tall on 2026-08-28 plus the 10 px gap. The
fallback is a *degradation*, not the design; §6 step 3 checks that the measured
path is the one actually taken.

**The document is never cached.** `liveDoc()` is called on every single
measurement, and the shelf element is re-queried every time rather than
remembered. Reason, with evidence: on 2026-08-27 a cached `contentDocument` cost
this project weeks — `about:blank` is same-origin, so a reference taken before
CODAP finished loading stayed same-origin and stayed dead for the life of the
page (`docs/DRAG-GHOST-CONUNDRUM.md` §0, memory note `stale-iframe-doc-bug`).

---

## 3. The three `dot-badge.js` defects, and their fixes

| # | Defect in `web/src/ui/dot-badge.js` | Fix in `wonderings-panel.js` |
|---|---|---|
| 1 | `installDashboardBadge()` returns `{badge, reposition, open, close, toggle, setConnected}` — **no `destroy()`**, so nothing it installs can be taken down | Returns `destroy()`. It clears the interval, removes the resize listener, clears **every** pending animation timeout (tracked in a `Set`), detaches the element, and releases the shared `<style>`. Idempotent; after it, `show()` returns `null` and `setState()` is a no-op instead of throwing. |
| 2 | `doc.defaultView?.addEventListener('resize', placeLeftOfHelp)` with **no matching `removeEventListener`** — the listener outlives the badge and holds the closure alive | The handler is a named binding `onResize`; `destroy()` calls `view.removeEventListener('resize', onResize)`. |
| 3 | `setTimeout(() => clearInterval(reposition), 120000)` — **stops re-measuring at 120 s.** A class period is 45 minutes, so a badge that reflows at minute 3 spends the other 42 in the wrong place | The 2 s interval runs until `destroy()`. There is no self-cancelling timeout anywhere in the executable code (asserted in §5). To keep the cost of a session-long poll near zero, `reposition()` writes `style.top` / `style.right` **only when the rounded value changed**, so a steady state costs one `getBoundingClientRect` and two integer comparisons per tick. |

---

## 4. The four states

`setState(s)` accepts exactly `'hidden' | 'idle' | 'thinking' | 'showing'` and
**throws** on anything else. The current state is readable two ways: the returned
`getState()`, and the `data-state` attribute on the root (which is what the manual
protocol inspects).

### `hidden`

```html
<div class="wonderings-panel" data-state="hidden" hidden style="top:62px; right:12px">
  <div class="wp-label">Wonderings</div>
  <div class="wp-stack">
    <div class="wp-live" aria-live="polite" aria-atomic="false" aria-relevant="additions"></div>
    <div class="wp-exit" aria-hidden="true"></div>
  </div>
</div>
```

`hidden` empties the live region outright rather than sinking it — nothing is on
screen to animate, and an item left inside would be announced when the panel came
back. The `hidden` attribute gives `display: none`, which takes the live region
out of the accessibility tree entirely.

Note the scope: `setState('hidden')` hides an **already-mounted** panel. The goal's
"without `?wonderings=1` it is not in the DOM" is W3's job — that agent must not
call `createWonderingsPanel()` at all when the flag is absent.

### `idle`

```html
<div class="wonderings-panel" data-state="idle" style="top:62px; right:12px">
  <div class="wp-label">Wonderings</div>
  <div class="wp-stack">
    <div class="wp-live" aria-live="polite" aria-atomic="false" aria-relevant="additions"></div>
    <div class="wp-exit" aria-hidden="true"></div>
  </div>
</div>
```

Standing label only. The label persists in every visible state, which is what
makes an arriving question legible as *a wondering* rather than as an alert.

### `thinking`

```html
<div class="wonderings-panel" data-state="thinking" style="top:62px; right:12px">
  <div class="wp-label">Wonderings</div>
  <div class="wp-stack">
    <div class="wp-live" aria-live="polite" aria-atomic="false" aria-relevant="additions"></div>
    <div class="wp-exit" aria-hidden="true"></div>
  </div>
</div>
```

**Byte-identical to `idle` except the attribute value.** This is the point: a
spinner in a quiet panel is an alert, and an alert is exactly what a wondering
must not be. The state exists so the engine can reason about itself and so the
Dashboard can report it — not so the student can watch the machine think.

**The invariant that keeps it true:** *no CSS rule in the module targets
`[data-state]` at all.* Grep for it (§5). If a future edit adds
`.wonderings-panel[data-state="thinking"] { … }`, this state stops being
visually identical and the design is broken. Note also that `aria-busy` is
deliberately **not** set during `thinking`: on a live region `aria-busy="true"`
suppresses announcements until it clears, which would silently swallow a
wondering that arrived during the window.

### `showing`

```html
<div class="wonderings-panel" data-state="showing" style="top:62px; right:12px">
  <div class="wp-label">Wonderings</div>
  <div class="wp-stack">
    <div class="wp-live" aria-live="polite" aria-atomic="false" aria-relevant="additions">
      <p class="wp-item" data-key="1kf3xq">What if the heaviest animals are also the slowest?</p>
    </div>
    <div class="wp-exit" aria-hidden="true"></div>
  </div>
</div>
```

**The live region holds at most one `.wp-item`, at every instant — including
during a handover.** Mid-handover the outgoing `<p>` is in `.wp-exit`, not in
`.wp-live`:

```html
  <div class="wp-stack" style="min-height:23px">
    <div class="wp-live" aria-live="polite" aria-atomic="false" aria-relevant="additions">
      <p class="wp-item" data-key="0q8w4c">Which animals are out on their own?</p>
    </div>
    <div class="wp-exit" aria-hidden="true">
      <p class="wp-item is-leaving" data-key="1kf3xq" data-retiring="1" aria-hidden="true">…</p>
    </div>
  </div>
```

**Why `.wp-exit` exists** (fixes the defect recorded in `BUILD-VERIFICATION.md`,
"the panel holds two items in the live region for 1600 ms"). Before 2026-08-28 the
retiring `<p>` simply stayed in `.wp-live` until its `SINK_MS` timer removed it,
which was wrong twice over:

1. **Accessibility.** Two questions sat in one `aria-live` region for 1600 ms. A
   screen reader scanning the region found both.
2. **Layout.** `.wp-item` is a block `<p>` with `margin: 7px 0 0`, and
   `is-leaving` only changes `opacity` and `transform` — neither of which takes a
   box out of flow. So the *arriving* wondering was pushed a line down the page
   for the whole sink and then snapped back up. In a panel whose entire design
   goal is "reads as weather, not as a notification", that snap is the loudest
   thing on screen.

`retire()` now moves the node into `.wp-exit` **immediately**, which is both fixes
at once: out of the live region, and `position: absolute` inside
`position: relative` `.wp-stack`, therefore out of normal flow. `aria-hidden`
stays as a second line of defence, and `aria-relevant="additions"` means the move
(a removal, from the live region's point of view) is silent.

The sink itself is **unchanged**: `is-leaving` still runs for the deliberate
`SINK_MS = 1600 ms` with the same `translateY(+18px)` travel. Plan `-001` chose a
slow dwell and a sinking departure over a fast crossfade because a 400 ms opacity
fade is a change-blind transition; this fix is about flow and the accessibility
tree, not about speed. `t-panel.mjs` group G asserts both numbers so a later
"simplification" to a crossfade fails loudly.

`.wp-stack` gets an inline `min-height` for the duration of the sink, taken from
the retiring item's `offsetHeight`, so lifting the item out of flow does not snap
the backplate shorter underneath text that is still visible. It is cleared when
the exit layer empties. `.wp-stack` is `display: flow-root`, which keeps
`.wp-item`'s 7 px top margin inside the stack — that is what makes the in-flow
item and the absolutely-positioned exit item start on the same baseline, so the
departure does not jump as it begins.

`data-key` is FNV-1a over the whitespace-normalised text — a **stable** key, so
`show()` called twice with the same wondering reuses the existing node and does
**not** re-announce it or interrupt a student mid-read.

**`show()` while `hidden` is a deliberate no-op returning `null`.** `hidden` means
wonderings are switched off; a wondering that finished computing just after the
student switched them off must not appear. Callers wanting it visible call
`setState('idle')` first. This is the one API behaviour most likely to look like
a bug in W3 integration, so it is called out here.

---

## 5. Colours, sizes, motion — with the arithmetic

Everything below is set in the `CSS` template literal in the module.

### Contrast

The backplate is **opaque** (`#EEF3F6`). This is the load-bearing decision: with a
translucent backplate the effective contrast is a function of whatever CODAP
happened to draw underneath, which means **no contrast ratio can be computed at
all**. Legibility beats ambience where they conflict, so the panel does not use
resting transparency anywhere.

WCAG 2.x relative-luminance calculation, recomputed 2026-08-28:

| Role | Colour | On | Ratio | AA floor 4.5:1 |
|---|---|---|---|---|
| Wondering text | `#1F2A33` | `#EEF3F6` | **13.07:1** | PASS |
| Standing label | `#4A5866` | `#EEF3F6` | **6.53:1** | PASS |
| Backplate vs a white CODAP background | `#EEF3F6` | `#FFFFFF` | 1.12:1 | — |

Reproduce the numbers:

```bash
node -e '
const lin=c=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4};
const L=h=>{const n=parseInt(h.slice(1),16);return 0.2126*lin((n>>16)&255)+0.7152*lin((n>>8)&255)+0.0722*lin(n&255)};
const R=(a,b)=>{const x=L(a),y=L(b),h=Math.max(x,y),l=Math.min(x,y);return((h+0.05)/(l+0.05)).toFixed(2)};
console.log("body ",R("#1F2A33","#EEF3F6"));console.log("label",R("#4A5866","#EEF3F6"));'
```

The backplate is only 1.12:1 against white, i.e. nearly invisible on a white
graph — which is why the panel keeps a hairline
`box-shadow: 0 1px 12px rgba(15,30,45,.10)` rather than going fully chromeless. A
shadow, not a border: a border plus a fill would read as another CODAP component
with a title bar.

### Type

| Role | Size | Weight | Style | Floor from the goal |
|---|---|---|---|---|
| Standing label | 14 px | 600 | roman, `letter-spacing: .06em` | ≥ 14 px, ≥ 400 |
| Wondering | **15 px** | 400 | *italic*, `line-height: 1.5` | ≥ 14 px, ≥ 400 |

The wondering is the larger of the two because it is the thing to be read; the
label is a signpost. Ambience is carried by the italic, the letter-spacing, the
absence of chrome and the slow motion — never by shrinking or dimming the text.
Sentence case throughout: all-caps at 14 px costs more legibility than the label
gains in "section-ness".

Box: `max-width: 320px` (matching Dot's Dashboard, so the corner has one measure),
`min-width: 190px` (below which the label wraps), `padding: 9px 14px 11px`,
`border-radius: 10px`.

### Motion — slow the dwell, not the crossfade

A 400 ms opacity crossfade is the documented change-blind transition: peripheral
vision is poor at low-contrast opacity steps and good at motion. So:

| Phase | Duration | Travel | Easing |
|---|---|---|---|
| Rise (arrival) | `RISE_MS` **1200 ms** | from `translateY(+14px)` to `0` — it **rises** into place | `cubic-bezier(.22,.61,.36,1)` |
| Sink (departure) | `SINK_MS` **1600 ms** | to `translateY(+18px)` — it **sinks** away | same |

The departure is *longer* than the arrival, so leaving is never startling. The
entrance is applied over two `requestAnimationFrame` ticks so the browser has laid
the element out in its entering position before the transition begins (one frame
suffices in most engines and not in all).

`@media (prefers-reduced-motion: reduce)` drops the travel but **keeps the
slowness** — `REDUCED_MOTION_MS = 600 ms`, deliberately not the 400 ms blink this
design exists to avoid.

### Pointer and ARIA

- `pointer-events: none` on `.wonderings-panel` **and** on `.wonderings-panel *`.
  Decision 7: an ambient prompt that can eat a click has stopped being ambient.
- The standing label is a **sibling of** the live region, never inside it —
  inside, the word "Wonderings" would be re-announced with every question.
- `aria-live="polite"`, `aria-atomic="false"`, `aria-relevant="additions"`. The
  `additions`-only value is what keeps the **sinking departure silent**: removals
  are not announced, so a wondering ageing out does not interrupt a second time.
- **A departing wondering leaves the live region at once**, moved to `.wp-exit`
  (§4). The live region therefore never contains two questions, at any instant.
- The departing node also gets `aria-hidden="true"`, and `.wp-exit` itself is
  `aria-hidden="true"`, against a screen reader re-scanning the subtree mid-exit.
- Wondering text is written with `textContent`, never `innerHTML`.

### Headless checks

```bash
cd /Users/chaddorsey/Dropbox/dev/codap-spirit-animal
node --check web/src/ui/wonderings-panel.js
node docs/verification/wonderings/t-panel.mjs        # 75 assertions, exits 0
grep -n 'data-state'    web/src/ui/wonderings-panel.js
grep -n 'clearInterval' web/src/ui/wonderings-panel.js
```

Run 2026-08-28. Expected output, and what each line means:

- `node --check` exits **0**. A stub passes this too; it is a syntax check, not
  acceptance.
- **`t-panel.mjs` exits 0** and prints `OK — every assertion passed`. Groups A–G
  are described in that file's header. It is the check that decides the goal's
  three machine-checkable panel metrics short of a browser: the *declared*
  `z-index: 40` and `pointer-events: none`, and that `contentDocument` is never
  cached.
- `data-state` → hits are **comments and the one `root.dataset.state = next`
  assignment**; **zero hits inside the `CSS` template literal is the invariant.**
  The moment a rule such as `.wonderings-panel[data-state="thinking"] { … }`
  appears there, `thinking` stops being visually identical to `idle` and the
  design is broken. `t-panel.mjs` group G asserts this against the injected
  stylesheet, so the grep is now a convenience rather than the only guard.
- `clearInterval` → the **only executable hit is inside `destroy()`**; the others
  are comments describing the `dot-badge.js` defect being fixed. An executable
  `clearInterval` anywhere else — in particular wrapped in a `setTimeout` — means
  defect 3 has regressed. (Line numbers are deliberately not quoted here: they
  went stale the first time the file was edited.)

### What the node test cannot decide — these stay human (§6)

The shim has no layout engine, no cascade and no compositor. It reads *declared*
CSS out of the injected `<style>`; it cannot compute anything. So the following
are **not** covered by `t-panel.mjs` and are verified only by §6:

| Not covered | Why | §6 step |
|---|---|---|
| **Computed** z-index strictly between `#codap` and `#stage` | requires a real cascade and a real stacking context; the shim only knows the rule *declares* 40 | 4 |
| The panel actually never eats a click | `pointer-events` is a hit-testing behaviour; the shim asserts the declaration, `elementFromPoint` asserts the behaviour | 5 |
| The measured anchor: 10 px below the real CODAP tool shelf | needs CODAP's real DOM and real rects; the shim feeds pre-registered rectangles, which proves the *arithmetic* and the freshness, not the selectors | 2, 3, 8 |
| `idle` and `thinking` are indistinguishable **on screen** | needs pixels; the shim proves only that no CSS rule targets `[data-state]` | 6 |
| The rise and sink read as weather in peripheral vision | a perceptual claim; no automated substitute exists | 7 |
| Contrast as rendered, and `prefers-reduced-motion` | the ratios are arithmetic (reproducible above), but that they apply to the painted text is not | 5, 7 |
| The 1024 px bail-out: not covering CODAP's own chrome | a layout question about someone else's markup | bail-out check |

---

## 6. Manual verification protocol

Run all of it. Steps 1–9 are the acceptance record; record PASS/FAIL and the
screenshot filename beside each. Run `node docs/verification/wonderings/t-panel.mjs`
first — if it fails, do not spend a browser session on it.

**Setup**

```bash
cd /Users/chaddorsey/Dropbox/dev/codap-spirit-animal/web && npm run dev
```

Open `http://localhost:5199/codap-same.html?tutorial=2&wonderings=1` at a
**1024 px-wide** viewport (the width the goal's bail-out criterion names). Wait
for Dot's Dashboard badge to go teal (CODAP connected). Open DevTools on the
**host** page, not the iframe.

Where the steps say "drive the panel", use the handle W3 exposes; if it is not
wired yet, drive the module directly from the host console:

```js
const { createWonderingsPanel } = await import('/src/ui/wonderings-panel.js');
const wp = createWonderingsPanel({ doc: document, frame: document.getElementById('codap') });
```

**1 — It renders where it should, three loads running.** Reload the page three
times. Each time, run `wp.setState('idle')` and confirm the panel appears in the
upper-right of the workspace. PASS requires all three.

**2 — The top edge is below the tool shelf, and measured.**

```js
const codap = document.getElementById('codap');
const shelf = codap.contentDocument.querySelector('[data-testid="tool-shelf"]');
const s = shelf.getBoundingClientRect(), p = wp.el.getBoundingClientRect();
console.log({ shelfBottom: s.bottom, panelTop: p.top, gap: p.top - s.bottom });
```

PASS: `gap` is **10 ± 1 px** and `panelTop > shelfBottom`. If `panelTop` is
exactly 60 the fallback fired and the measured path did **not** run — investigate
before accepting.

**3 — Right edge.** `window.innerWidth - wp.el.getBoundingClientRect().right`
is **12 ± 1 px**.

**4 — Stacking.** `getComputedStyle(wp.el).zIndex === '40'`. Then run
`wp.show('Which of these is doing the most work?')` and walk Dot across the panel
(`__demo` or just wait for an idle animation). **Screenshot** showing Dot's body
drawn over the panel and the panel drawn over a CODAP graph. Save as
`docs/verification/wonderings/panel-stacking.png`.

**5 — It never eats a click.** With the panel showing, click *through* it onto
whatever CODAP component lies underneath (a graph point, a table cell). PASS: the
CODAP element responds normally and the panel does not so much as highlight. Also
run `document.elementFromPoint(cx, cy)` at the panel's centre — it must return the
**iframe**, not the panel.

**6 — The four states.** For each of `hidden`, `idle`, `thinking`, `showing`, run
`wp.setState(s)` and screenshot. PASS requires the `idle` and `thinking`
screenshots to be **indistinguishable**; diff them if in doubt. Confirm
`wp.el.dataset.state` tracks each call and that `wp.setState('spinner')` throws.

**7 — Slow dwell, not fast fade.** Run `wp.show('…')` while watching peripherally
(look at the CODAP table, not at the panel). The wondering should rise over ~1.2 s
and be noticeable without being read. Then `wp.clear()`: it sinks over ~1.6 s.
PASS: the arrival is caught out of the corner of the eye at least 2 times in 3.
Repeat with the OS "reduce motion" setting on — the fade must still take ~0.6 s
and the element must not travel.

**8 — Session-long anchoring and a clean teardown.** Leave the page open,
resize the window a few times over **at least 3 minutes** (past the 120 s at
which `dot-badge.js` gives up), and re-run step 2. PASS: the gap is still
10 ± 1 px. Then:

```js
wp.destroy();
document.querySelector('.wonderings-panel');                 // → null
document.getElementById('wonderings-panel-style');           // → null
getEventListeners(window).resize;                            // no wonderings handler (Chrome DevTools)
wp.show('x');                                                // → null, no throw
wp.destroy();                                                // no throw
```

**9 — The A → B handover does not shove the page.** This is the browser half of
the defect fixed in §4; `t-panel.mjs` group D covers the DOM, this covers the
pixels.

```js
wp.setState('idle');
wp.show('Which animals are out on their own?');
setTimeout(() => {
  const before = wp.el.querySelector('.wp-live .wp-item').getBoundingClientRect().top;
  wp.show('What if the heaviest animals are also the slowest?');
  requestAnimationFrame(() => {
    const live = wp.el.querySelectorAll('.wp-live .wp-item');
    const after = live[0].getBoundingClientRect().top;
    console.log({ liveCount: live.length, before, after, drift: after - before });
  });
}, 3000);
```

PASS: `liveCount` is **1** and `drift` is **0 ± 1 px**. Watch it happen too — the
outgoing question must sink from exactly where it was standing while the incoming
one rises into the same slot; neither may jump. Screenshot mid-handover as
`docs/verification/wonderings/panel-handover.png`.

Then, with a screen reader running (VoiceOver: ⌘F5), repeat. PASS: **one** question
is announced, the incoming one. The departure is silent.

**Bail-out check (from the goal).** At 1024 px, confirm the panel does not cover
CODAP's own chrome — the tool shelf, the component title bars along the top. It
*will* float over component **contents**; that is the design. If it cannot avoid
CODAP's chrome at 1024 px, **bail out and report — do not redesign.**

---

## 7. What is deliberately not here

- **No `?wonderings=1` gating, and no mounting.** W3 owns `web/src/codap-main.js`
  and decides when to construct the panel. Module K never reads the URL.
- **No timing policy.** How long a wondering dwells, when it retires, and the rate
  governor all live in `web/src/wonderings/governor.js` (module H) and the engine.
  The panel exposes `show`/`clear` and holds no opinion about when they are called.
- **No text generation and no lint.** `show(text)` renders whatever string it is
  given, as `textContent`. Phrasing is `web/src/wonderings/realize.js` (module J);
  the lint is `web/src/wonderings/lint.js` (module G).
- **Nothing injected into CODAP's DOM.** The panel lives in the host document and
  is positioned over the iframe. That is why it can be `z-index: 40` at all, and
  why removing it cannot disturb CODAP's state.
- **No jsdom, no test runner.** The goal's boundaries forbid adding an npm
  dependency, so `t-panel.mjs` carries its own ~180-line DOM shim and a virtual
  clock. If a future agent is tempted to reach for jsdom: the shim is small
  *because* the module touches little, and that smallness is itself the evidence
  that this panel is not entangled with the browser. Growing the shim is a signal
  to check whether the module has picked up a dependency it should not have.
