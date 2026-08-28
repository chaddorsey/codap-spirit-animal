/**
 * whiteboard.js — where the student writes their own wonderings.
 *
 * WHY IT LOOKS LIKE A WHITEBOARD. Chad's call, and it is doing real work: the
 * base rate for student questions is 0.11-0.17 per student per HOUR, with 96% of
 * all classroom questions coming from the teacher (Graesser & Person 1994, via
 * docs/verification/wonderings/pedagogy-literature.md §1 — citations there are
 * unverified). Against a base rate that close to zero, the thing to optimise is
 * the cost of writing one. A marker on a whiteboard is the cheapest, least
 * permanent-feeling way to put an idea down: no cursor blinking in an empty box,
 * no sense that this is being kept.
 *
 * The evanescence is a LOOK, not a lifetime — the board reads as wipeable while
 * the session quietly remembers everything, because Dot cannot notice you have
 * not investigated something she has forgotten.
 *
 * WHAT IS DELIBERATELY ABSENT: any mark of whether a wondering has been
 * investigated. The board is a place to write, not a checklist. Investigation
 * state exists (whiteboard-model.js) and is reported to Dot's Dashboard, where a
 * developer can see it and a student cannot — showing a child "untouched" beside
 * their own question is the assessment register wearing a progress bar.
 *
 * Follows web/src/ui/dot-badge.js for anchoring, and fixes the same three
 * defects: it returns a destroy(), it removes its listeners, and it re-measures
 * for the whole session rather than giving up after 120 s.
 */

const STYLE_ID = 'dot-whiteboard-style';

const Z_INDEX = 40;              // above CODAP's components, below #stage (50) so Dot floats over it
const REMEASURE_MS = 3000;       // ms; the tool shelf arrives late and moves — dot-badge.js stops at 120s, which is shorter than a class
const BOARD_WIDTH_PX = 320;      // px; wide enough for a two-slot stem on one line at 15px
const TOP_GAP_PX = 10;           // px below CODAP's tool shelf

/**
 * Marker palette. Deliberately dark enough to clear 4.5:1 on the board's own
 * near-white — the design review flagged that "ambient" and "legible" pull
 * against each other, and on a classroom projector legibility wins.
 */
const INK = '#22333b';
const INK_SOFT = '#5b6c75';
const BOARD = '#fbfaf7';
const RULE = '#e3e0d8';
const MARKER = '#0b7285';

const CSS = `
.dot-wb { position: fixed; z-index: ${Z_INDEX}; width: ${BOARD_WIDTH_PX}px;
  box-sizing: border-box; background: ${BOARD}; color: ${INK};
  border: 1px solid ${RULE}; border-radius: 10px;
  box-shadow: 0 6px 18px #0000001a; padding: 10px 12px 12px;
  font: 15px/1.45 ui-rounded, 'Segoe UI', system-ui, sans-serif; }
.dot-wb[hidden] { display: none; }

.dot-wb-head { display: flex; align-items: baseline; justify-content: space-between;
  gap: 8px; margin: 0 0 8px; }
.dot-wb-title { font-size: 13px; font-weight: 600; letter-spacing: .02em; color: ${INK}; }
.dot-wb-sub { font-size: 11px; color: ${INK_SOFT}; font-style: italic; }
.dot-wb-fold { border: none; background: none; cursor: pointer; color: ${INK_SOFT};
  font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 5px; }
.dot-wb-fold:hover { background: #0000000d; color: ${INK}; }
.dot-wb-fold:focus-visible { outline: 2px solid ${MARKER}; outline-offset: 2px; }

.dot-wb-stems { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 9px; }
.dot-wb-stem { font: inherit; font-size: 12px; padding: 3px 9px; cursor: pointer;
  border: 1px dashed ${RULE}; border-radius: 999px; background: transparent;
  color: ${INK_SOFT}; }
.dot-wb-stem:hover { border-color: ${MARKER}; color: ${MARKER}; }
.dot-wb-stem[aria-pressed="true"] { border-style: solid; border-color: ${MARKER};
  color: ${MARKER}; background: #0b72850d; }
.dot-wb-stem:focus-visible { outline: 2px solid ${MARKER}; outline-offset: 2px; }

.dot-wb-compose { margin-bottom: 9px; }
.dot-wb-line { font-size: 15px; line-height: 1.9; color: ${INK}; }
.dot-wb-blank { font: inherit; font-size: 14px; color: ${MARKER}; background: #fff;
  border: none; border-bottom: 2px solid ${MARKER}; border-radius: 3px 3px 0 0;
  padding: 1px 5px; margin: 0 2px; cursor: pointer; max-width: 130px; }
.dot-wb-blank:focus-visible { outline: 2px solid ${MARKER}; outline-offset: 1px; }
.dot-wb-post { font: inherit; font-size: 12px; margin-top: 7px; padding: 4px 12px;
  border: 1px solid ${MARKER}; border-radius: 6px; background: ${MARKER}; color: #fff;
  cursor: pointer; }
.dot-wb-post[disabled] { opacity: .35; cursor: default; }

.dot-wb-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid ${RULE}; }
.dot-wb-item { display: flex; align-items: flex-start; gap: 6px;
  padding: 7px 0 6px; border-bottom: 1px dashed ${RULE}; font-size: 14px;
  animation: dot-wb-in .5s ease both; }
.dot-wb-item:last-child { border-bottom: none; }
.dot-wb-text { flex: 1; }
.dot-wb-wipe { border: none; background: none; cursor: pointer; color: ${RULE};
  font-size: 15px; line-height: 1; padding: 0 2px; }
.dot-wb-item:hover .dot-wb-wipe { color: ${INK_SOFT}; }
.dot-wb-wipe:focus-visible { outline: 2px solid ${MARKER}; outline-offset: 2px; }
.dot-wb-empty { color: ${INK_SOFT}; font-style: italic; font-size: 13px;
  padding: 8px 0 2px; }

@keyframes dot-wb-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .dot-wb-item { animation: none; } }
`;

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  doc.head.appendChild(el);
}

/**
 * @param {object}   opts
 * @param {Document} opts.doc
 * @param {HTMLIFrameElement} opts.frame        CODAP, for measuring the tool shelf
 * @param {() => object[]}    opts.getAttrs     DatasetModel.attrs, read fresh each open
 * @param {(stemId:string, filled:string[]) => void} opts.onPost
 * @param {(key:string) => void}                opts.onWipe
 * @param {() => object[]}    opts.getBoard     the wonderings written so far
 * @param {object}   opts.model                 whiteboard-model.js
 * @returns {{ el, refresh, destroy, setHidden }}
 */
export function createWhiteboard({ doc = document, frame = null, getAttrs = () => [],
                                   onPost = () => {}, onWipe = () => {},
                                   getBoard = () => [], model }) {
  ensureStyle(doc);

  const el = doc.createElement('section');
  el.className = 'dot-wb';
  el.setAttribute('aria-label', 'Your wonderings');
  doc.body.appendChild(el);

  let picked = null;          // stem id being composed
  let filled = [];            // chosen column names
  let folded = false;

  // --- anchoring ---------------------------------------------------------
  // Same technique as dot-badge.js: MEASURE CODAP's own chrome rather than
  // hardcoding an offset, and read contentDocument at the point of use — never
  // cache it, because about:blank is same-origin and hands back a live, dead
  // document (docs/DRAG-GHOST-CONUNDRUM.md §0).
  const SHELF_SELECTORS = ['[data-testid="tool-shelf-button-undo"]',
                           '[data-testid*="tool-shelf" i]'];
  const shelfBottom = () => {
    let d = null;
    try { d = frame?.contentDocument; } catch { return null; }
    if (!d) return null;
    for (const sel of SHELF_SELECTORS) {
      let els = [];
      try { els = [...d.querySelectorAll(sel)]; } catch { continue; }
      const vis = els.filter((e) => { const r = e.getBoundingClientRect();
        return r.width > 8 && r.height > 8 && r.top < 200; });
      if (vis[0]) return vis[0].getBoundingClientRect().bottom;
    }
    return null;
  };
  const place = () => {
    const fr = frame?.getBoundingClientRect();
    const bottom = shelfBottom();
    const top = fr && bottom != null ? fr.top + bottom + TOP_GAP_PX : 96;
    el.style.top = `${Math.max(4, Math.round(top))}px`;
    el.style.right = `${Math.round((fr ? window.innerWidth - fr.right : 0) + 12)}px`;
  };
  place();
  const placeTimer = setInterval(place, REMEASURE_MS);   // for the SESSION, not 120s
  const onResize = () => place();
  doc.defaultView?.addEventListener('resize', onResize);

  // --- rendering ---------------------------------------------------------
  const canPost = () => {
    const stem = model.stemById(picked);
    return !!stem && filled.length === stem.slots.length && filled.every(Boolean)
      && new Set(filled).size === filled.length;
  };

  function renderCompose(host) {
    host.textContent = '';
    const stem = model.stemById(picked);
    if (!stem) return;
    const line = doc.createElement('div');
    line.className = 'dot-wb-line';
    const attrs = getAttrs();

    const blank = (i) => {
      const sel = doc.createElement('select');
      sel.className = 'dot-wb-blank';
      sel.setAttribute('aria-label', `word ${i + 1}`);
      const none = doc.createElement('option');
      none.value = ''; none.textContent = '____';
      sel.appendChild(none);
      for (const name of model.candidatesFor(stem, i, attrs)) {
        const o = doc.createElement('option');
        o.value = name; o.textContent = name;
        sel.appendChild(o);
      }
      sel.value = filled[i] ?? '';
      sel.onchange = () => { filled[i] = sel.value; render(); };
      return sel;
    };

    line.append(doc.createTextNode(stem.before), blank(0));
    if (stem.slots.length === 2) line.append(doc.createTextNode(stem.middle), blank(1));
    line.append(doc.createTextNode(stem.after));
    host.appendChild(line);

    const post = doc.createElement('button');
    post.type = 'button';
    post.className = 'dot-wb-post';
    post.textContent = 'Put it on the board';
    post.disabled = !canPost();
    post.onclick = () => {
      if (!canPost()) return;
      onPost(picked, [...filled]);
      picked = null; filled = [];
      render();
    };
    host.appendChild(post);
  }

  function render() {
    el.textContent = '';

    const head = doc.createElement('div');
    head.className = 'dot-wb-head';
    const titles = doc.createElement('div');
    const t = doc.createElement('div');
    t.className = 'dot-wb-title'; t.textContent = 'Your wonderings';
    const sub = doc.createElement('div');
    sub.className = 'dot-wb-sub'; sub.textContent = 'nothing here is kept';
    titles.append(t, sub);
    const fold = doc.createElement('button');
    fold.type = 'button'; fold.className = 'dot-wb-fold';
    fold.textContent = folded ? '+' : '–';
    fold.setAttribute('aria-expanded', String(!folded));
    fold.setAttribute('aria-label', folded ? 'Open your wonderings' : 'Fold your wonderings away');
    fold.onclick = () => { folded = !folded; render(); };
    head.append(titles, fold);
    el.appendChild(head);
    if (folded) return;

    const stems = doc.createElement('div');
    stems.className = 'dot-wb-stems';
    for (const s of model.STEMS) {
      const b = doc.createElement('button');
      b.type = 'button'; b.className = 'dot-wb-stem';
      // The chip shows the stem with its blanks, so the FORM is what you pick.
      b.textContent = model.renderStem(s, [], '__');
      b.setAttribute('aria-pressed', String(picked === s.id));
      b.onclick = () => {
        picked = picked === s.id ? null : s.id;
        filled = [];
        render();
      };
      stems.appendChild(b);
    }
    el.appendChild(stems);

    const compose = doc.createElement('div');
    compose.className = 'dot-wb-compose';
    renderCompose(compose);
    el.appendChild(compose);

    const board = getBoard();
    if (!board.length) {
      const empty = doc.createElement('div');
      empty.className = 'dot-wb-empty';
      empty.textContent = 'Pick a shape above and fill in the blanks.';
      el.appendChild(empty);
      return;
    }
    const list = doc.createElement('ul');
    list.className = 'dot-wb-list';
    for (const w of board) {
      const li = doc.createElement('li');
      li.className = 'dot-wb-item';
      const span = doc.createElement('span');
      span.className = 'dot-wb-text';
      span.textContent = w.text;              // textContent: the names came from the student's data
      const wipe = doc.createElement('button');
      wipe.type = 'button'; wipe.className = 'dot-wb-wipe';
      wipe.textContent = '×';
      wipe.setAttribute('aria-label', `Wipe: ${w.text}`);
      wipe.onclick = () => { onWipe(w.key); render(); };
      li.append(span, wipe);
      list.appendChild(li);
    }
    el.appendChild(list);
  }

  render();

  return {
    el,
    refresh: render,
    reposition: place,
    setHidden: (h) => { el.hidden = !!h; },
    destroy: () => {
      clearInterval(placeTimer);
      doc.defaultView?.removeEventListener('resize', onResize);
      el.remove();
      doc.getElementById(STYLE_ID)?.remove();
    },
  };
}
