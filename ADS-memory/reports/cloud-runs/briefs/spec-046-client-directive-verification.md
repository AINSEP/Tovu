# Brief — SPEC-046 client-directive channel: verify, then fix what's broken

**Read `ADS-memory/reports/cloud-runs/RUN-PROTOCOL.md` in full first.** It is mandatory and this
brief assumes it. Run log slug: `spec-046-client-directive-verification`.

## What this is

SPEC-046 (`ADS-memory/specs/046-site-assistant-page-actions/spec.md`, **v2**) built a client-directive
channel for the public visitor assistant: the server emits a validated `client_directive` SSE frame,
and the widget acts on it in the visitor's browser (navigate / scroll / highlight).

**All the code is written and pushed. None of the browser-level acceptance criteria have been
measured.** The local agent was stopped immediately after wiring the client half, before it produced
any real-browser evidence. Your job is to produce that evidence, and to fix what it turns up.

Relevant commits already on `refactor/jini-admin-extraction`:

| commit | what |
|---|---|
| `4172c2b` | REQ-0 capability registry (default-deny preserved) |
| `b738359` | REQ-1/REQ-2 transcript persistence + single-shot action queue |
| `9462e38` | REQ-3 bounded conversation history |
| `42cad2d` | storage consolidated into one `session-store.ts` (+ guard test) |
| `6a21c8f` | REQ-4/5/6/8 server-side directive channel |
| `c4f0c7a` | client-side wiring: transport parsing, highlight CSS, D-1 propose-vs-auto |

## The standing rule in this workstream

**"Tests pass" is not evidence for anything a browser runs.** This exact codebase once had 80/80
green tests, correct HTML, and 200 responses while the bundle threw `ReferenceError: process is not
defined` on load and never mounted. Assert the mount node has **children**. Measure properties with
`getComputedStyle` / `getBoundingClientRect` and report the numbers. A screenshot is not a
measurement.

## Task 1 — get a browser, or prove you can't (do this FIRST, log the outcome immediately)

The repo has `playwright` in `node_modules`. A cloud sandbox may not have a browser binary.

1. Try `npx playwright install --with-deps chromium`.
2. Write the result to the run log **before doing anything else** — exact command, exit code, first
   ~20 lines of stderr on failure.
3. **If Chromium cannot be installed or launched, do NOT fake it and do NOT silently downgrade.** Say
   so prominently in the run log and the final report, then fall back to Task 3 (jsdom) and Task 4,
   and mark every Task 2 criterion explicitly `NOT VERIFIED — no browser available`. An honest gap is
   the deliverable in that case. A verification claim you could not actually make is worse than
   nothing, because it closes the item for good.

Do NOT use any Playwright MCP tooling. Import directly by absolute path from the repo's
`node_modules`.

⚠️ **`waitUntil: "networkidle"` NEVER resolves against this app** — the page holds an open SSE
connection. It fails *silently*: you get identically-sized screenshots stuck on the wrong state and
no error. Use `domcontentloaded` plus explicit waits (~600 ms for React mount, ~1200 ms to settle).

## Task 2 — measure SPEC-046 §7 acceptance criteria 1–7

Read §7 for the authoritative list. Each needs a measured value, not a judgement:

1. Ask → answer → "take me there" → page navigates **and the transcript is still present**, pane
   still open. (This is the whole point of REQ-1; it is measurable and must be measured.)
2. Highlight appears on the destination, pulses, holds, fades over ~20 s, leaves **no residue**
   (assert the class/attribute is gone afterwards).
3. Reloading the destination does **not** re-fire the queued action.
4. `prefers-reduced-motion: reduce` → no pulse, no smooth scroll, still highlighted. Drive this with
   a browser context that actually sets the preference; a default context will pass regardless and
   tell you nothing.
5. Crafted targets are refused **server-side** and never reach the client: off-site URL, `javascript:`
   scheme, admin path, unpublished slug, and — the one that catches naive implementations — a
   **trashed-but-`status: "published"`** post. `posts.deleted_at` is independent of `status`.
6. Rate limit: the 11th request in 5 minutes returns 429 and the widget shows a readable message
   rather than hanging.
7. **Layout is unchanged by highlighting** — `getBoundingClientRect()` on the target before and
   after, reported as numbers. The highlight is applied to arbitrary theme content and must not
   reflow it.

Also verify **D-1** behaviourally: a plain question yields a *proposal* the visitor must click; only
an explicit "take me there" auto-navigates. And confirm the proposal itself carries a
**server-validated** target — a proposal holding an unvalidated URL would defeat the entire reason
D-1 was chosen.

## Task 3 — the jsdom guard

`apps/site-chat/scripts/check-bundle-mounts.mjs` runs the **built** bundle in jsdom and has ~5
scenarios (clean, poisoned transcript, wrong-shaped entry, poisoned queue, real queued action). Run
`npm --prefix apps/site-chat run build` (its `postbuild` runs the guard).

One known weakness to close: the script **duplicates the storage-key strings** rather than importing
them, so a key-version bump would leave scenarios seeding a stale key and passing vacuously. Confirm
every scenario that seeds a key also asserts that entry was **consumed/cleared** after mount — that
assertion is what makes drift fail loudly. Fix any scenario that only asserts "still mounts".

## Task 4 — the one known test gap

Route-level SSE framing (does the `client_directive` frame get written correctly on the wire) has no
integration test. `src/server/__tests__/site-assistant-routes.test.ts` is the natural home, but it was
blocked by another session's in-flight refactor: `demo-choices-tool.ts` imported a missing
`./pending-surface-answers`.

**Check whether that is still broken.** If it now resolves, add the integration test. If it is still
missing, **do not create the module, stub it, or work around it** — log that it is still blocked and
move on. If Task 2 succeeded with a real browser, that end-to-end evidence supersedes this test
anyway: a client parsing a real frame off a real wire and visibly acting on it is stronger evidence
than a unit test asserting bytes. Say so explicitly in the report so nobody later reads "no
integration test" as "unverified".

## Fixing

Where a criterion fails, **diagnose before patching** — root cause, then fix, then re-measure and
report both the before and after numbers. Do not "fix" by relaxing the check.

Two traps this codebase has already paid for:

- **Never reuse a `jini-*` class for anything you author.** Commit `eefb34e` fixed a live bug where
  borrowing `jini-chat-pane__cancel` silently inherited `position: absolute` from `@jini-ai/chat`'s
  injected stylesheet and threw the control 505 px off target. Use `tovu-site-assistant__*`.
- **No dark-mode variant, ever.** The public site is fixed light; `widget.css` carries a standing
  warning and a prior session already had to undo one.

## Scope limits

- **Do not touch the `Jini` repo.** Nothing here needs it.
- **Do not touch** `demo-choices-tool.ts`, `surface-exchanges.ts`, `tool-registrations.ts`,
  `mcp-ui-tool-calls-route.ts`, `agent-daemon-server.ts`, or `tool-executor-audit.ts` — another
  session owns that MCP-UI return-path refactor.
- **Do not implement Tier B / MCP-UI surfaces.** Per spec §8 the public allowlist ships **empty**.
- **Scoped test runs only.** Never `npm test` across the whole suite.
- Run `npm run check:architecture` and report if the number moves. Do **not** run `--update`.
- Targeted `git add <path>` only. **Never `git add -A` or `git commit -a`** — other sessions' work
  shares this tree.

## Deliverable

1. The run log, per RUN-PROTOCOL (STARTED within 2 minutes, heartbeats every 5, a final entry
   written and pushed **first** before stopping for any reason).
2. `ADS-memory/reports/refactors/2026-08-04-spec-046-verification.md` — per criterion: the claim, the
   measured value, and a verdict of **TRUE / FALSE / NOT VERIFIED**. "Not verified" is a perfectly
   good answer and far more useful than an optimistic one. List every fix with its commit SHA.
3. Any code fixes, committed **incrementally** — never batched to the end, never gated behind a green
   suite. Commits are the only telemetry you have.
