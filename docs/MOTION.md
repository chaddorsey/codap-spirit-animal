# Dot's Motion Personality

Distilled from the honed `tinkerbell` clip (2026-07-07). These are the curves and
constants that make motion read as *Dot being Dot*. Apply them to every clip,
behavior, and locomotion path. When in doubt, watch tinkerbell and match it.

## The six principles

1. **Telegraph, then commit.** Every big action gets a brief anticipation in the
   opposite direction: the scrunch before the spring, the wind-up before the
   circle. Anticipation is short (0.15–0.35s), held, then released explosively.
   Nothing drifts into an action.

2. **Squash & stretch at the moments of force.** Compress at anticipation
   (z×0.84, xy×1.10) and on contacts; snap-stretch on launch (z×1.20, xy×1/√st,
   volume-conserving), relaxing by mid-flight. Secondary mass (gills, tail)
   flares with acceleration and streams with speed — the gill spread on the
   sproing is iconic; keep it.

3. **Attack, cruise, brake — never polynomial mush.** Speed profile is piecewise:
   explosive ramp to max over the first ~12–15% of a move, then *strictly
   uniform* velocity, then a sharp late brake (ease-out exponent ~3) close to
   the destination. Smooth symmetric easings (smoothstep everywhere) read as
   floaty and personality-less. Deceleration happens AT the destination, not
   spread along the way.

4. **Real gravity, slightly stated.** Climbs bleed ~15% speed; descents recover
   it (tinkerbell's circle). Vertical travel between points is a ballistic
   parabola with a floaty apex, not a line. The fall accelerates; the rise
   decelerates.

5. **Arrival ritual.** Land with a small overshoot past the target, then settle
   with 2–3 *descending* bobs (damping ratio ~0.55, ~0.25s per bob, unhurried),
   with a contact squash accent on the first. Big arrivals (tinkerbell) bounce
   0.2 BL; ordinary arrivals scale down (~0.05 BL) but keep the shape.

6. **Short beats, no dead air.** Pauses between phases are touches, not waits:
   ~0.16s. The character is never parked mid-gesture.

## Reference constants (from tinkerbell as shipped)

| Thing | Value |
|---|---|
| Anticipation scrunch | z 0.84, xy 1.10, held at bottom |
| Launch stretch | z 1.20 popping over ~0.04s, relaxed by 40% of flight |
| Attack fraction | 12% of the move to reach max speed |
| Cruise | dead constant (1.06x mean) |
| Gravity layer on climbs | 15% speed dip, symmetric recovery |
| Post-move ease-out exponent | 3 (sharp brake, long float) |
| Settle bobs | amplitudes ×0.55 each, ~0.25s per bob |
| Micro-pause | 0.16s |

## Where it's implemented

- Clips: `pipeline/02_build_clips.py` (`_tinkerbell` is the reference; `aim()`
  + phase tables are the tools).
- Locomotion: `web/src/character.js` `moveTo()` now carries the profile
  natively — attack ramp, uniform cruise, late brake, overshoot-settle on
  arrival. Options: `{ arrive: false }` for chained waypoints (keeps speed
  through the corner), `pixelsPerSecond` for cruise.

## Applying it to behaviors (e.g. zoomies)

*(Applied 2026-07-07: zoomies now runs arcing loop chains per below; the
multi-leg behaviors — tile-mischief swoop, greet bounding, pounce approach,
the nap-fall slip, peek/kilroy approaches — chain with `arrive:false` so
speed carries through corners and rituals happen only at true arrivals.)*

Zoomies previously read as "manic DVD screensaver": straight lines, constant
speed, instant wall-bounce reversals. Dot-being-Dot zoomies should:

- pick **arcing waypoint chains** (loops, figure-eights, swooping S-curves
  around tile edges), not reflective straight lines;
- chain legs with `moveTo(x, y, { arrive: false })` so speed carries through
  corners, with the runtime's attack/brake shaping only the first and last leg;
- begin with the anticipation scrunch (play a brief `hop`-style dip or reuse
  the wind-up feel: pause 0.16s, then burst);
- end the last leg with the full arrival ritual (default `arrive: true`) and a
  celebratory beat — the happy-dance settle is the signature closer;
- respect gravity flavor: rising legs slightly slower than falling ones (pick
  waypoint order so descents follow climbs).
