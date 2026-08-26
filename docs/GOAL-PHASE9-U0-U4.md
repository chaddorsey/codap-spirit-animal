# GOAL — U0 → U4: Dot as "Show me" (PHASE9-SHOWME P0–P4)

Make tutorials 1–2 of the CODAP getting-started series run with Dot performing every "Show me" task live, by executing phases P0 through P4 of docs/PHASE9-SHOWME.md exactly as written.

Repo: github.com/chaddorsey/codap-spirit-animal, master, from commit 700b20b. Venue: local dev; vite on :5199 (same-origin proxy in web/vite.config.js; web/codap-same.html works). Measured preconditions: engine selfTest 43/43 on /codap.html; agent-browser CLI installed; injection verified live on CODAP v3.1.0 per docs/SPIKE-SAME-ORIGIN.md.

**Read before starting:** docs/PHASE9-SHOWME.md — the governing work order (adversarially reviewed; architecture, DemoScript language, protocols, per-phase Done-when criteria, gotchas, and its own reading list including docs/SPIKE-SAME-ORIGIN.md, docs/BAT-A-POINT.md, docs/PLAN.md). Where this statement and that doc differ, the doc wins. This statement never governs.

Discipline carried from prior goals: verify visually via screenshot before declaring done (dpr 2 too); get-verify-retry every bridge call (the phone drops replies); commit per unit, push to master; evidence under docs/verification/phase9/; environment gotchas per docs/PLAN.md. Added: run unattended — never wait on human input; every wait has a timeout; fill the P0 VERIFICATION TABLE inside docs/PHASE9-SHOWME.md as that doc instructs.

Completion metrics (units = the doc's phases; a unit is done only when its "Done when" block passes as written):
- U0 = P0: web/src/inject.js + web/inject-test.html exist; window.__injectTest() prints PASS for primitives P1–P7+P9; every row of the P0 VERIFICATION TABLE is filled (zero empty cells).
- U1 = P1: P1 criteria (a)–(d) — instrumented paw/cursor log max distance ≤10px over a full demo; API-verified click, drag with native preview frame captured, revert diff empty.
- U2 = P2: 5 tutorial-1 demos green 3× consecutively; cancel-interleave test leaves the student-created graph intact; 3 malformed scripts rejected with zero Dot movement; a fresh line-notation script runs green; line↔JSON round-trip byte-stable.
- U3 = P3: all 5 tutorial-1 "Show me." links run live demos on codap-same.html?tutorial=1; checklist unchecked during demos, checked on manual completion; dirty-document case passes; dot-demo-busy reply works; forced driver failure plays the task's MP4.
- U4 = P4: tutorial 2 fully Dot-powered (same criteria); the 6 shared scatterplot-set scripts run green against a family-B dataset.
- Every unit: engine selfTest ≥43/43 after the unit's changes; unit committed and pushed before the next begins.

Boundaries — do not:
- proceed past U4 (P5–P8 are out of scope);
- edit any "Done when" criterion or any recorded decision in docs/PHASE9-SHOWME.md (filling its verification tables is required; weakening gates is forbidden);
- modify pipeline/*.py, the .blend/.glb assets, tutorial task text, or any upstream repository;
- deploy publicly or add paid services;
- delete the PointDouble fallback or the cross-origin codap.html path.

Bail-outs — bail out and report; do not decide. On trigger: append exact evidence (events sent, observed behavior, screenshots) to docs/verification/phase9/BAILOUTS.md and commit; if the blocked item has a doc-specified fallback (MP4, carrycsv), take it and continue; otherwise stop the run cleanly with the report as the final commit. Triggers: any bail-out item listed in docs/PHASE9-SHOWME.md; a Done-when item still failing after 3 full attempts; CODAP unreachable through the proxy; the P0 plugin-in-wrapper sanity check failing; any step that would require human input or money.

An honest failure is a filled verification table, a BAILOUTS.md naming exactly what would not respond and how it was probed, and clean pushed commits through the last green unit — never a weakened gate or a silent hang.
