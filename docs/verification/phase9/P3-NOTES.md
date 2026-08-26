# P3 notes — the tutorial-1 integration, and what it cost

Written 2026-08-26 while executing Phase 3 of `docs/PHASE9-SHOWME.md`. As with
P2, the work order is unedited; this records what running the thing taught.

## Where P3's criteria stand

| Criterion | Status |
|---|---|
| every "Show me." runs Dot's demo live | **yes** — all five start a live demo, no movie; **completion** varies, see below |
| the checklist does NOT check during demos | **yes**, all five, verified with a 6 s margin past the settle window |
| manual task performance DOES check (all 5) | **yes**, verified end to end |
| demos behave in a dirty document | **yes** — 1 graph before, 2 at peak, 1 after; the student's graph untouched |
| a second "Show me." mid-demo gets `dot-demo-busy`, link stays alive | **yes** |
| a forced driver failure plays that task's MP4 | **yes** — `MakeGraph.mp4`, from our vendored copy |

## The one soft spot: the 60 s wall-clock cap

Demos complete green roughly three to five times out of five per pass. The
failures are always the same: `demo exceeded 60s wall clock`. Measured causes,
in the order I ruled them out:

1. **Not the API.** In the tutorial document, `get componentList` measures
   0–20 ms and a full state snapshot 5–20 ms. The phone is not the problem.
2. **Not our overlay.** With the three.js render loop stopped entirely, an
   injected Graph-button click still cost 3.7–4.9 s (vs 1.3–5.5 s with it
   running). Turning our own renderer off does not help.
3. **It is CODAP's own work, on the main thread.** A single injected click that
   makes CODAP build a graph blocks for seconds — 12–17 s in a busy document.
   Everything else in the page, including the animation clock the demo's own
   timers ride on, is starved for that whole time. `tap` alone measured 50.7 s
   inside one failing demo, of which the tap clip is 1.4 s.
4. **Headless roughly doubles it.** MakeGraph: 55.8 s headless vs 33.6 s headed
   on the same machine. Demo timings are only meaningful on a GPU-backed
   browser, so all P3 acceptance numbers above were taken headed.

What was done about it, all of it inside our own budget rather than by
touching the cap:

- snapshots are taken only after verbs that can actually mutate the document,
  and are cached for 400 ms inside a poll
- a snapshot fetches its components concurrently instead of N+1 serially
- `waitFor` polls at 500 ms and only reads the selection when the condition
  actually mentions it
- `peer` starts its glance and moves on instead of awaiting the whole clip
- the emote font is preloaded at wrapper start, so the first `say` does not pay
  for it
- `carrycsv` uses a short reply window and verifies by reading, rather than
  waiting out a long write timeout for a reply it is going to verify anyway

That took a Drag demonstration from over 60 s to 47 s and MakeGraph from 55.8 s
to the low 30s — but a bad CODAP stall can still push either past the cap, and
when it does, the demo degrades to its MP4, which is exactly the designed
behaviour. **This is a property of CODAP's click handling on this machine, not
of the demo design**, and it is the reason the cap is worth keeping rather than
raising: a demo that has been stalled for a minute is not one a student is
still watching.

## Race conditions the integration turned up

Three, all fixed, all invisible until something real drove the code:

1. **One click, two `dot-show-me` messages.** The second arrived while the first
   was still loading its script, so the driver looked idle, both reached the
   runner, and the loser reported a failure — playing an MP4 over a demo that
   was about to start. The bridge now holds an in-flight key.
2. **Failures before the runner started sent nothing.** Centralising
   suppression into the runner meant a missing script, a validation error or a
   forced test failure never reached `demoEnded`, so no `dot-demo-error`, no
   MP4, and a link that did nothing. The bridge now sends one itself.
3. **Suppression was tied to the trigger, not the demo.** See the commit
   "suppress the checklist for EVERY demo" — this is the one Chad caught by
   watching, and the automated checks had missed it precisely because they
   drove the path that was covered.

## CODAP v3 behaviours worth knowing (all measured here)

- A case table created immediately after `dataContextFromURL` comes up
  **unbound**: no columns, no attribute pills, no `dataContext` field, and
  `update component[id] { dataContext }` will not repair it. Wait for the
  context's attributes, then create the table, then verify by looking for the
  pills.
- A drop zone's centre is regularly **underneath another tile** — in the
  tutorial-1 document the graph overlaps the case table — and dnd-kit reaches
  `active` but never `over`, so the drop silently does nothing. Resolvers pick
  a point whose topmost element belongs to the target's own tile.
- Notification delivery to plugins is unreliable in two specific ways, both
  written up for Chad in `BAILOUTS.md`: no notification at all when a data
  context is created, and an `attributeChange` whose detection chain does not
  fire even though the notification demonstrably arrives.
