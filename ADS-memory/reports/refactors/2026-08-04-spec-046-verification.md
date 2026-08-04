# SPEC-046 client-directive channel — browser verification report

Run: local (not cloud — dispatched as a local re-run of a failed cloud brief). Repo
`/Users/la/Programming/Tovu`, branch `refactor/jini-admin-extraction`, started at tip `7d2d091`,
finished at `e5a1dbd`. Real Chromium via Playwright resolved from `node_modules` by absolute path —
no MCP tooling used. Real dev server (`npx tsx src/index.ts`, no watch mode — see Task 2 environment
note below), real SQLite content DB, real `GEMINI_API_KEY` for the one live model round-trip.

**Deviations from the original brief** (agreed with dispatcher before starting): skipped Task 1
(browser install — Chromium was already present locally) and skipped the RUN-PROTOCOL run-log/
heartbeat machinery (that exists for cloud runs that are otherwise a black box; this session checked
in via numbered messages instead). Everything else in the brief stands.

## Headline: two real bugs found and fixed while measuring, not hypothesized

Both were invisible to every existing test (unit, integration, and the jsdom bundle-mount guard) and
only surfaced by actually driving a real browser against the real running app — exactly the standing
rule this workstream operates under.

1. **Infinite navigation loop** (severe). After a real "take me there" navigation, the destination
   page's persisted transcript still ends in the message carrying that `auto: true` navigate
   directive. `ChatPane`'s own `onMessagesChange` fires once on mount with the rehydrated messages,
   and `SiteAssistantWidget.tsx`'s `processedMessageIdsRef` started as an empty `Set` on every fresh
   component instance — no memory that this exact message was already acted on by a prior page's
   instance. Mount → replay navigate → reload → mount → replay → reload, forever. **Measured live: 11
   navigations to the same destination in 6 seconds, uncapped** — this made the site unusable for any
   visitor who ever used "take me there" once, since `sessionStorage` carries the poisoned state
   forward indefinitely. Fix: commit `07a9e38`.
2. **Reduced-motion fade never ran** (moderate–severe). The shipped `tovu-official` theme's own
   accessibility reset (`@media (prefers-reduced-motion: reduce) { * { animation: ... !important;
   ... } }`) silently beat `widget.css`'s non-`!important` reduced-motion override — `!important`
   always outranks specificity regardless of selector weight. Measured: `animationName` computed as
   `"none"`, the outline stayed at full opacity for the whole ~21s until `highlight.ts`'s
   `CLEANUP_FALLBACK_MS` JS timer force-removed it with a visible pop, never the intended 2s fade
   spec §4 calls for ("same duration and fade"). Only caught because the test used a Playwright
   context that actually sets `prefers-reduced-motion` — a default context would have passed
   regardless, per the brief's own non-negotiable. Fix: commit `e5a1dbd`.

Both fixes were re-measured live after the fix, not just re-read from source; numbers below.

## Environment note (also a real finding, resolved, not a defect)

The repo's normal `npm run dev:server` uses `tsx watch`, which restarts on ANY change under this
session's `node_modules`-symlinked `@jini-ai/*` packages — and four other agents
(`site-assistant-channel`, `-foundation`, `-qa`, `-ratelimit`) were concurrently rebuilding those
packages during this session. The server restarting mid-test produced noisy, misleading repeated-
navigation symptoms on the FIRST live attempt. Diagnosed via the systematic-debugging process (checked
recent changes → found concurrent sibling rebuilds in the server log) and worked around by running the
dev server without watch mode (`npx tsx src/index.ts`) for the remainder of the session. Once isolated
from that noise, the SAME repeated-navigation symptom reproduced deterministically and cheaply
(model-free, `sessionStorage`-seeded), which is what led to bug #1 above — the environment noise and
the real bug were two different things, confirmed by ruling the first out before concluding the second.

## Task 2 — acceptance criteria (brief's numbering 1–7, plus D-1)

| # | Claim | Measured | Verdict |
|---|---|---|---|
| 1 | Ask → answer → "take me there" → navigates, transcript still present, pane still open | **Live, real model.** `message_count_after_answer=2` (real Gemini answer received). Explicit "Take me to the About page." → `navigation_occurred=true`, `post_nav_url=http://localhost:4530/about`. Post-navigation: `mount_children_after_nav=1`, `panel_hidden_attr_after_nav=null` (open), `message_count_after_nav=4`, `sessionStorage_transcript_state={"open":true,"messageCount":4}`, `console_errors=[]`. (First live attempt hit bug #1 above; re-measured clean after the fix.) | **TRUE** |
| 2 | Highlight appears, pulses, holds, fades ~20s, leaves no residue | `ac2_highlight_class_applied=true`; `animationName` during pulse = `"tovu-site-assistant-highlight-pulse, tovu-site-assistant-highlight-fade"`. After the fade window: `ac2_no_residue_class=true`, computed `outlineStyle="none"`. | **TRUE** |
| 3 | Reloading the destination does not re-fire the queued action | `ac3_highlighted_on_first_arrival=true` → `page.reload()` → `ac3_highlighted_after_reload=false`. | **TRUE** |
| 4 | `prefers-reduced-motion: reduce` → no pulse, no smooth scroll, still highlighted, same duration/fade | Context verified to actually set the preference (`ac4_context_actually_reduced_motion=true` via live `matchMedia` read). Before fix: `animationName="none"` (bug #2). After fix: `animationName="tovu-site-assistant-highlight-fade"`, `ac4_no_pulse=true`, `scrollIntoView` called with `{behavior:"auto"}` not `"smooth"`. Fade-completion timing measured at exactly **20000ms** (18s delay + 2s duration) — the real `animationend` path, not the ~21s JS fallback. | **TRUE (after fix)** |
| 5 | Crafted targets (off-site URL, admin path, unpublished slug, trashed-but-published post) refused server-side, never reach client | Route-level test (`aa467f2`) with a real DB-backed repo: `highlight_entry` called on a trashed-but-`status:"published"` post (the catching case — `deletedAt` independent of `status`), a draft, and a nonexistent slug, all in one mocked model turn. Zero `client_directive` frames in the raw SSE response; positive proof of refusal captured from the continuation request's `functionResponse` body (`refusalCount === 3`). Independently corroborated against the real dev DB: created a published post, soft-deleted it (status stayed `"published"`, confirmed via the DELETE response body), and its own public page 404s. **Off-site URL / `javascript:` scheme were not separately tested** — the tool schema (`tools.ts`) only accepts a bare `slug: string`; there is no parameter path for a URL at all, which is a structurally stronger guarantee than a runtime check. | **TRUE** (URL/scheme cases: **structurally N/A**, not merely refused) |
| 6 | 11th request in 5 min → 429, widget shows readable message, not hanging | Server-side 429 generation already covered by an existing, still-passing unit test (`site-assistant-routes.test.ts`, "11th request... rejected with 429"). Widget-side handling measured live: mocked the browser's own fetch to return the real 429 JSON shape → `rate_limit_error_region_text=["This turn failed.", "too many messages from this address — please wait before trying again"]`, `rate_limit_still_pending_count=0` (not hung), send button re-enables once new text is typed (not stuck). | **TRUE** |
| 7 | Layout unchanged by highlighting — `getBoundingClientRect()` before/after | Target heading rect identical before/after (`x/y/width/height` byte-for-byte equal). Also measured the NEXT sibling element's rect before/after (proof neighboring content didn't reflow either) — also identical. | **TRUE** |
| D-1 | Propose by default; auto-navigate only on explicit request; proposal itself carries a server-validated target | Auto branch confirmed live (test #1 above, real "take me to" phrase). Propose branch: mocked `auto:false` directive → `.tovu-site-assistant__proposal` appeared, `d1_url_before_click` unchanged (no auto-nav), click → `d1_navigated_after_click` = destination. Label rendered the server-resolved title (`"Go to “What Is Tovu?”?"`). Server-validated-target property is the same REQ-6 resolution proven under AC5 — the directive's `target` field is always server-constructed, the model never supplies a path. | **TRUE** |

## Task 3 — jsdom guard drift weakness (`44f9242`)

Found and fixed exactly the weakness the brief named: 3 of 8 scenarios in `check-bundle-mounts.mjs`
seeded a storage key but never asserted it was **consumed** — "wrong-shaped transcript entry" had no
`verify` at all; "highlight action" and "scroll_to action" checked DOM effects but never that
`ACTION_QUEUE_STORAGE_KEY` was cleared. A key-version bump left un-mirrored in this script's
duplicated literals would have seeded a key the running bundle no longer reads, and these would have
still passed on "still mounts" alone. Added consumption assertions to all three. **Verified the fix
actually catches drift**, not just that it passes: temporarily staled one key literal, confirmed the
guard failed loudly (`FAIL: poisoned action-queue entry: drainQueuedAction should have deleted the
entry before attempting to parse it`), then reverted. Build + guard green before and after.

A 9th scenario was added later in the session (`07a9e38`) as a regression guard for bug #1 above —
see that commit.

## Task 4 — SSE-framing test gap (`7de3297`, plus `aa467f2` for AC5)

The blocking import (`demo-choices-tool.ts`'s missing `./pending-surface-answers`) is **already
resolved** by another in-flight session — `site-assistant-routes.test.ts` now runs clean on its own
(confirmed: 5/5 green before any of this session's additions). Every existing case in that file lands
on the `NOT_CONFIGURED` 503 branch and never reaches `executeTool`/the `client_directive` SSE write, so
the gap was real despite the import being fixed.

Added a route-level integration test that stubs `global.fetch` — routed by URL so only the outbound
call to `generativelanguage.googleapis.com` is intercepted, not the test's own request to the local
server — fabricates a Gemini `streamGenerateContent` SSE response calling `navigate_to_entry`, and
asserts the **raw SSE bytes** the route writes: event name, JSON shape, D-1's `auto: true` on an
explicit "take me there" message, and REQ-6's server-resolved target (the mocked model call never sent
a path, only a bare slug). 6/6 green in the full file, stable across repeated isolated runs. Extended
the same harness for AC5 (see table above).

**Per the brief's own instruction**: Task 2's live/mocked-browser AC1 evidence (real client parsing a
real-shaped frame off a real wire and visibly navigating) supersedes this test as end-to-end proof —
this integration test is what proves the SERVER half in isolation and at the exact byte level; Task 2
proves the CLIENT half consumes that exact shape correctly. Together they cover the full stack without
either being "no integration test = unverified."

## Fixes shipped (all committed incrementally, all pushed)

| commit | what | severity |
|---|---|---|
| `44f9242` | jsdom guard: close the storage-key drift gap (3 scenarios) | test-quality |
| `7de3297` | route-level `client_directive` SSE-framing integration test | test-quality |
| `aa467f2` | AC5 refusal test over the real route + DB (trashed/draft/nonexistent) | test-quality |
| `07a9e38` | **fix**: stop an already-executed navigate directive re-firing on every mount (infinite loop) | **severe** |
| `e5a1dbd` | **fix**: restore the reduced-motion highlight fade against the real theme's `!important` reset | **moderate–severe** |

## Scope limits honored

- Did not touch the `Jini` repo (read three of its source files for reference only: `google-messages.ts`,
  its own test file, `useChatPane.hooks.ts` — no edits).
- Did not touch `demo-choices-tool.ts`, `surface-exchanges.ts`, `tool-registrations.ts`,
  `mcp-ui-tool-calls-route.ts`, `agent-daemon-server.ts`, `tool-executor-audit.ts`.
- Did not implement Tier B / MCP-UI surfaces.
- Scoped test runs only — never `npm test` across the whole suite; every run named its target file(s).
- Targeted `git add <path>` only, never `-A` or `-a`.
- `npm run check:architecture`: 24 back-edges into the composition root (improved from a documented
  28-baseline; 5 module-cycle pairs removed since baseline — this predates and is unrelated to this
  session's changes, which only touched `apps/site-chat` and one test file). Did **not** run `--update`.

## What "not verified" would have looked like, for calibration

Nothing in Task 2's table ended up NOT VERIFIED — every criterion got either live-model or
mocked-at-the-network-boundary real-browser evidence, or (AC5's URL/scheme cases) a structural
argument stronger than a runtime test. If Gemini quota had run out before the one live round-trip,
AC1/D-1's auto branch specifically would have been the criterion downgraded to NOT VERIFIED, since it
is the one property that genuinely requires a live model call (everything else in the table was
deliberately re-derived from the mocked-network technique specifically to avoid spending scarce shared
quota — four other agents were using the same `GEMINI_API_KEY` concurrently this session).
