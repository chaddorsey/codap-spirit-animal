# CODAP Spirit Animal 🌸

An animated 3D axolotl companion that lives on top of [CODAP v3](https://codap3.concord.org)
while students explore data. It reacts **wordlessly** to student actions — swimming to a
new graph, peering curiously at selections, following attribute drags with its gaze,
celebrating drops, dozing off when nothing happens — to subtly (and sometimes overtly)
incentivize data exploration.

## Architecture

```
assets/    source .blend + generated rigged/animated .blend files
pipeline/  headless Blender scripts: raw model -> rig -> clips -> glTF
web/       vite + three.js runtime and test pages
docs/      backlog, design notes, playbooks
```

Three layers, three crisp interfaces:

1. **Character runtime** (`web/src/character.js` + `stage.js` + `emotes.js`) — a screen-space
   puppet API: `moveTo(x,y)`, `lookAt(x,y)`, `gestureAt(x,y)`, `play(clip)`, `setBase(mood)`,
   `emote('?' | '!' | '?!')`. Transparent full-viewport ortho overlay; clip layering rules
   keep eyes/body/root channels composable.
2. **CODAP bridge** (`web/src/codap-bridge.js`) — host-side Data Interactive API over
   iframe-phone against an embedded CODAP v3 (`?embeddedServer=yes`). Translates raw
   notifications into semantic events; maps tile geometry doc→screen (offset + scale
   calibration, persisted in localStorage).
3. **Behaviors** (`web/src/codap-main.js`, spike-level) — event → reaction switchboard.
   Phase 4 replaces this with a real behavior engine (escalation, cooldowns).

## Running

```bash
cd web && npm install && npm run dev     # http://localhost:5199
```

- `/` — character test console (clips, emotes, click-to-swim, gaze, fake tile)
- `/codap.html` — live wrapper around codap3.concord.org with event log + calibration

## Asset pipeline (requires Blender 4.2+, tested on 5.1.2)

```bash
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b assets/cute-axolotl.blend    -P pipeline/01_build_rig.py     # 21-bone rig, procedural weights
$B -b assets/axolotl-rigged.blend  -P pipeline/02_build_clips.py   # 11 clips -> NLA tracks
$B -b assets/axolotl-animated.blend -P pipeline/03_export_glb.py   # web/public/axolotl.glb
```

Bones use underscore names (`arm_L`) because three.js strips dots. Clips are
channel-disjoint by contract (see header of `02_build_clips.py`) so the runtime can
layer blink/gaze/gesture over locomotion.

## Known quirks

- CODAP v3 renders its workspace scaled at smaller viewports → calibration has a scale
  term (panel buttons on `/codap.html`).
- `get componentList` lags create notifications by several seconds → bridge retries.
- Overlay canvas must have explicit CSS `width/height` (replaced element + Retina).

See `docs/BACKLOG.md` for queued work.
