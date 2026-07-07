/**
 * Terrain primitives — Phase 6. Dot treats tiles (or ANY screen rect) as
 * terrain: perch on the top edge, peek from behind a side edge, Kilroy over
 * the top. All primitives are targetable — a rect is a rect, whether it is
 * a tile, an axis region, or a toolbar button's neighborhood — which is the
 * entree to signifying things of interest in the wise-kitten phase.
 *
 * Every primitive registers ctx.onCancel cleanup: a cancelled peek must
 * never leave Dot half-clipped (actor.stop() also clears clipping).
 *
 * Timing per docs/CHARACTER.md: emerges are slow or medium, never
 * distractingly rapid; setbacks (the ledge fall) recover inside 2 s.
 */

const PERCH_CENTER_ABOVE_EDGE_PX = 12;  // seated belly rests ON the ledge
                                        // (the pose tucks legs up, so the
                                        // visual bottom sits well above the
                                        // bind-pose bbox; tail drapes over)
const PEEK_SPEEDS = { slow: 45, medium: 95 };   // px/s emergence
const KILROY_CENTER_BELOW_EDGE_PX = 20; // center a bit BELOW the edge: only
                                        // eyes + hooked paw-tips crest it
const INSPECTOR_W_PX = 92;              // CODAP v3 floating inspector palette
                                        // (+ gap) to the RIGHT of the
                                        // focused tile
const HIDE_DEPTH_PX = 60;               // how far "behind the wall" Dot ducks
const FALL_DISTANCE_PX = 150;
const FALL_SPEED_PX_S = 1100;

/** The focused tile's furniture includes its floating inspector palette —
 *  Dot must never swim (or surface) between a tile and its side menu.
 *  Callers extend the rect with this before right-edge peeks or hovers. */
export function withInspector(rect) {
  return { ...rect, w: rect.w + INSPECTOR_W_PX };
}

/** Sit on the top edge of `rect` at fraction `t` across it. Leaves Dot
 *  perched (base = perch); caller decides how long and how to leave. */
export async function perchOn(actor, rect, ctx, { t = 0.5 } = {}) {
  const px = rect.x + rect.w * t;
  const py = rect.y;
  await actor.moveTo(px, py - PERCH_CENTER_ABOVE_EDGE_PX - 40);
  await actor.moveTo(px, py - PERCH_CENTER_ABOVE_EDGE_PX,
    { pixelsPerSecond: 110 });                    // settle down gently
  actor.setBase('perch');
}

/** Peek around a vertical edge of `rect` like a kid behind a wall:
 *  duck behind, slide out until the face shows, hover with a gaze into the
 *  rect, then slip back out of sight. Resolves fully un-clipped. */
export async function peekSide(actor, rect, ctx,
  { side = 'left', speed = 'slow', holdSec = 2.5 } = {}) {
  const edgeX = side === 'left' ? rect.x : rect.x + rect.w;
  const py = rect.y + rect.h * 0.35;
  const out = side === 'left' ? -1 : 1;           // direction away from tile
  const pxHidden = edgeX - out * HIDE_DEPTH_PX;   // fully behind the wall
  const pxPeek = edgeX - out * 8;                 // center just behind the
                                                  // edge: only a face-sliver shows
  ctx.onCancel(() => actor.clearClip());
  // approach visibly just outside the edge, then duck behind it
  await actor.moveTo(edgeX + out * 70, py);
  actor.clipAtScreenX(edgeX, { keepLeft: side === 'left' });
  await actor.moveTo(pxHidden, py, { pixelsPerSecond: PEEK_SPEEDS.medium });
  await ctx.sleep(0.5);                           // beat of anticipation
  // emerge — slow or medium, never rapid
  await actor.moveTo(pxPeek, py, { pixelsPerSecond: PEEK_SPEEDS[speed] ?? PEEK_SPEEDS.slow });
  actor.lookAt(rect.x + rect.w / 2, rect.y + rect.h / 2);
  await ctx.sleep(holdSec);                       // hover curiously
  actor.clearGaze();
  // slip back out the visible side and reappear
  await actor.moveTo(edgeX + out * 70, py, { pixelsPerSecond: PEEK_SPEEDS.medium });
  actor.clearClip();
}

/** The Kilroy: duck behind the top edge, rise until eyes + paws crest it,
 *  hold the over-the-wall pose, then climb up and over. */
export async function kilroyOver(actor, rect, ctx, { t = 0.5, holdSec = 2.5 } = {}) {
  const px = rect.x + rect.w * t;
  const edgeY = rect.y;
  ctx.onCancel(() => { actor.clearClip(); actor.release(); });
  // approach above the edge, then sink behind the wall
  await actor.moveTo(px, edgeY - 70);
  actor.clipAtScreenY(edgeY, { keepAbove: true });
  await actor.moveTo(px, edgeY + HIDE_DEPTH_PX, { pixelsPerSecond: PEEK_SPEEDS.medium });
  await ctx.sleep(0.6);                           // the wall is suspiciously quiet
  // rise: eyes and paws over the edge
  actor.play('kilroy', { hold: true });
  await actor.moveTo(px, edgeY + KILROY_CENTER_BELOW_EDGE_PX,
    { pixelsPerSecond: PEEK_SPEEDS.slow });
  actor.lookAt(rect.x + rect.w / 2, rect.y + rect.h / 2);
  await ctx.sleep(holdSec);                       // just... watching
  actor.clearGaze();
  actor.release();
  // climb up and over: rise fully above the edge, then un-clip
  await actor.moveTo(px, edgeY - 60, { pixelsPerSecond: PEEK_SPEEDS.medium });
  actor.clearClip();
}

/** The only way a nap on a ledge ends: droop, slip, fall, startle,
 *  recover — all inside the 2-second setback rule. */
export async function fallFrom(actor, ctx) {
  const here = actor.getPosition();
  actor.play('droop');
  await ctx.sleep(0.55);
  await actor.moveTo(here.x + 18, here.y + FALL_DISTANCE_PX,
    { pixelsPerSecond: FALL_SPEED_PX_S });        // the slip
  actor.setBase('idle');                          // wide awake now
  await actor.play('startle');
  await actor.play('proud');                      // ...meant to do that
}
