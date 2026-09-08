# 2026-09-08 — `<ExternalMcpSettingsPanel>` dynamic-payload test pass (QA/E2E)

Dispatched after ADM-003 (the report-nested-under-`report` wire-shape crash, fixed in `b0963afd`/
`6712e31a` — see `ADS-memory/reports/2026-09-08-external-mcp-panel-crash.md`). That fix was never
run against a live browser. This pass drives the panel against varied, dynamic MCP-server shapes —
live where possible, real-wire-shape fixtures where a live server of that shape doesn't exist — and
reports what actually rendered. **This is a test pass; no source file was modified.**

## Two payloads, not one — read this before the case-by-case results

The dispatch's own framing ("this report feeds a decision about building a tool picker on this same
payload") assumes one payload. There are **two**, and they matter differently to a tool-picker
decision:

1. **`AdminFederatedAdmissionEntry`** (`apps/admin/src/lib/api.ts:253`) — what the admissions/drift
   banner (`<ExternalMcpAdmissionsBanner>`, the thing ADM-003 fixed) reads. Per connection: `admitted`
   (`{remoteName, writeAuthorized}[]`), `refused` (`{remoteName, reason}[]`), `allowlistedButAbsent`,
   `writeAllowedButNotAllowlisted`. **No per-tool description, no annotations, no `hintsAbsent`.**
2. **`AdminRemoteToolSurfaceEntry`** (`api.ts:220`) — `probeExternalMcpServer`'s (C-007) response.
   Per tool: `remoteName`, `description`, `declaredAnnotations`, `writeDeclared`,
   `destructiveDeclared`, `hintsAbsent`, `allowlisted`, `writeAllowed`, `admitted`, `refusalReason`.
   This type's own doc comment says it exists **"for the (not-yet-built) write-tool picker"**.

A future tool picker reads payload 2, not payload 1. Payload 2 is already fully typed and the route
already returns it correctly (fetched, real, live-tested below) — but **today, every field on it
except a bare count is thrown away** before reaching any pixel. See Case 5.

## Environment

- System load was extremely high for most of this pass: `uptime` readings ranged 227–234 (three
  separate checks) before dropping to 80–190 later. The dispatch's own 300-load false-failure
  threshold and its "prefer component-level evidence" instruction governed most of this session.
- Playwright's shared browser was in use by another agent (`Error: Browser is already in use for
  .../mcp-chrome-01d688e`) — deferred to `claude-in-chrome` immediately, as instructed.
- Under peak load (227–234), the Chrome extension itself disconnected mid-operation twice and every
  screenshot/page-read timed out for roughly ten minutes of wall time. No result below was extracted
  from a browser during that window — component-level fixtures were used instead, all driven through
  the **real wire shape** (`RawAdmissionConnection`, nested under `report`) and the **real**
  `api.getExternalMcpAdmissions()` fix boundary, not hand-rolled flat shapes.
- Once load dropped (~80), live verification succeeded. **One verification-gap worth flagging for
  future browser QA passes**: re-navigating the same URL in an already-open tab was served from
  Chrome's back-forward cache (bfcache) rather than a fresh mount — the page visually looked correct
  (roster rendered) but genuinely made **zero** new network requests (confirmed two ways: the
  extension's own request tracker across 1000+ recorded requests, and the page's native
  `performance.getEntriesByType('resource')`). This looked exactly like "the admissions fetch never
  fires" and would have been a false defect report. Opening a **brand-new tab** (guaranteed cold
  mount) resolved it: the real fetch fired and returned 200. Flagging this because it is easy to
  reproduce accidentally and easy to misdiagnose as a product bug.

## Case-by-case results

### Case 1 — the live higgsfield connection — LIVE, CORRECT

Fresh tab, cold mount, `https://localhost:5173/admin/settings?tab=external-mcp`. Confirmed via the
extension's network tracker: `GET /api/admin/v1/workspaces/workspace-local/mcp-servers` → 200,
`GET /api/admin/v1/workspaces/workspace-local/mcp-servers/admissions` → 200. Screenshot: the roster
shows one connection, `higgsfield`, enabled, `streamable_http`, 7 tools in `allowedToolNames`
(`generate_image, models_explore, job_status, jobs_wait, show_generations, reveal_generation,
show_generation_by_ids`), 2 in `writeAllowedToolNames` (`generate_image, reveal_generation`), OAuth
credentials present with the client secret field correctly blank (not leaked to the DOM).

The admissions/drift banner rendered **nothing** — no "Saved. The assistant is still running..."
text anywhere on the page. Per `ExternalMcpAdmissionsBanner`'s own contract ("renders NOTHING when
the live assistant and the saved roster agree"), this is the **correct** rendering for a connection
whose live admissions currently agree with its saved roster — not a failure to render. I did not
have a way to independently pull the raw admissions JSON to double-check this reading (an in-page
`fetch()` to the authenticated endpoint was correctly blocked by the extension's own
cookie-exfiltration guard), so this verdict rests on the rendering contract plus the two 200s, not on
inspecting the raw body.

### Case 2 — a server advertising MANY tools (tens) — LIVE + fixture, CORRECT

Live: clicked "Test" on the real higgsfield card. Result: **"101 tools advertised."** — a real MCP
server with over a hundred tools, of which only 7 are allowlisted (94 silently fall under the
routine `not-in-operator-allowlist` reason, which `external-mcp-admissions-rules.ts` deliberately
never renders — see that file's own header on why). This is strong live evidence the panel does not
assume a small, fixed tool count.

Fixture (real wire shape → `api.getExternalMcpAdmissions()` → `describeAdmissionDrift` →
`<ExternalMcpAdmissionsBanner>`): a 47-tool `admitted` array flattens correctly (`toHaveLength(47)`),
renders nothing when 47 saved names agree with 47 live names, and correctly names the missing 6 by
name (not just by count) when only 41 of 47 saved names are actually live. No hardcoded count or
index anywhere in the read path.

### Case 3 — very few tools — fixture, CORRECT

A single-tool connection (one refused tool, `remote-declares-not-read-only`) renders its one drift
row through the full pipeline: `only_tool` named, "Tick 'may write' to enable this tool." shown.
Not a degenerate/empty-state bug.

### Case 4 — zero tools — fixture, CORRECT

An empty `admitted`/`refused`/both-drift-lists connection, agreeing with an empty saved allowlist,
renders nothing (not an error, not a crash). The same zero-live-tools connection with a **non-empty**
saved allowlist correctly renders "Live now: 0 tools. Saved: 1 tools — ghost_tool are not loaded." —
proving zero-agrees-with-zero and zero-disagrees-with-saved are kept distinct, not collapsed.

### Case 5 — tools with no annotations at all (`hintsAbsent`) — REAL GAP, not rendered anywhere

This is the most important finding of the pass, and it is not a crash — it's exactly the "renders a
confident wrong state" failure class the dispatch asked me to watch for, just quieter than that:
**it renders no state on this at all.**

- `AdminFederatedAdmissionEntry.admitted` (the drift banner's own type) carries only
  `{remoteName, writeAuthorized}`. There is no field for `hintsAbsent`, `writeDeclared`, or
  `destructiveDeclared` anywhere in this type. The banner **cannot** show this distinction because
  the wire shape it reads never carries it.
- `AdminRemoteToolSurfaceEntry` (the probe type) does carry all three — but the only UI wired to the
  probe route is the "Test" button, which reduces the entire response to a bare count string (see
  `use-external-mcp.hooks.ts:331-346`, `SourceTestResult` is `{ok, message?, latencyMs?}` — its own
  doc comment says it "cannot carry a tool list"). Live-confirmed above: clicking Test on higgsfield's
  101 real tools produced exactly one line, "101 tools advertised." — no names, no annotations,
  nothing else.
- Traced the actual gate logic this connects to, `mcp-federation/trust.ts:326`:
  `if (annotations?.readOnlyHint === false && !writeAuthorized) return "remote-declares-not-read-only"`.
  A tool with `hintsAbsent: true` (no `annotations` object, or one with neither hint set) has
  `readOnlyHint === undefined`, not `=== false` — so this line does **not** refuse it. Per R3's own
  header comment, "a silent server was never caught." A hints-absent tool that is allowlisted is
  admitted exactly like a tool that explicitly declared `readOnlyHint: true`.
- Proved this is a real rendering gap, not just a type-level one, with a component-level fixture: an
  `admitted` array containing one `silent_tool` (standing in for hints-absent-but-admitted) and one
  `declared_readonly_tool` (standing in for genuinely declared read-only), both write-unauthorized,
  both allowlisted and agreeing with saved state. **Both render identically: nothing.** The operator
  has structurally no way, anywhere in this panel, to see that one tool's apparent safety is a real
  declaration and the other is silence the gate let through.

**Verdict: the panel does not render `hintsAbsent` as a confident "safe" — it doesn't render it as
anything, because no consumer of either payload keeps the field past the API boundary that fetches
it.** For a future tool picker built on `AdminRemoteToolSurfaceEntry` (which already carries this
field correctly per the C-007 route's own tests), this is the one field worth deliberately surfacing
rather than silently carrying forward the same gap into a new UI.

### Case 6 — `allowlistedButAbsent` (the typo case) — fixture, CORRECT

A wire body with `allowlistedButAbsent: ["list_stlyes"]` (deliberate typo, mirroring the real
`list_styles`/typo pattern from the ADM-003 report's own fixture) flattens through the real API
boundary and renders "list_stlyes — This server does not offer a tool by that name." Confirmed the
misspelled name itself survives the whole pipeline unmodified — nothing corrects, drops, or
normalizes it.

### Case 7 — `writeAllowedButNotAllowlisted` (the inert-grant case) — fixture, CORRECT

A write-authorized-but-not-allowlisted name renders "'edit_image' is on the write list but not on
the allowlist — it has no effect until it's also allowlisted." with the name correctly interpolated
from the real wire body. Also confirmed **both** drift lists populated on the **same** connection
render **both** rows (not one overwriting the other) — `typo_name` (not-offered) and `list_styles`
(inert-write-grant) both appeared from one wire body.

### Case 8 — a down/unreachable daemon (503) vs. running-with-zero — fixture, CORRECT, well-separated

Two levels proven:
1. **API boundary**: a 503 (`AGENT_DAEMON_UNAVAILABLE`) thrown from `fetch` causes
   `api.getExternalMcpAdmissions()` to reject (never reaches `flattenAdmissionConnection`); a 200
   with `{connections: []}` does not throw. Structurally different code paths, as designed.
2. **Full chain, hook to rendered text**: wired `useExternalMcpAdmissions` with the REAL
   `defaultExternalMcpAdmissionsPort` (not a fake port — this exercises `api.getExternalMcpAdmissions`
   too) against a 503-mocked `fetch`, wrapped in the real `FetchQueryProvider`, rendered the actual
   `<ExternalMcpAdmissionsBanner>`. Result: "the agent daemon is not reachable" rendered as its own
   sentence, and critically, the agreeing-and-silent "Saved. The assistant is still running..." text
   is **absent** — the two states cannot be confused for each other. A parallel 200-empty-connections
   run through the same chain does **not** show the unavailable sentence. This closes the loop the
   ADM-003 report's own type doc only asserted at the type level; this pass proved it through a real
   render.

### Case 9 — long tool names and long descriptions — fixture only, CONTENT proven, LAYOUT unproven

A 96-character remote tool name reaches the DOM as a complete, untruncated text node inside a
`<code>` element — the pipeline does not truncate, wrap-strip, or otherwise mangle a long name before
it reaches markup. **This is the one case I could not fully close.** jsdom does not compute real CSS
layout, so this proves content-completeness, not visual behavior — I cannot say from this evidence
alone whether a 96-character name overflows its container, wraps awkwardly, or is clipped by CSS in
a real browser. I did not have a safe way to inject a long-named tool into the live higgsfield
connection (would require either modifying a live external server or writing to the local roster,
both out of scope for a read-only test pass), and repeated live-browser attempts for this specific
check were the ones lost to the load window described above. **Recommend a follow-up live check of
this one case specifically** once a long-named real or fixture-backed server is available in a
running dev session.

## What is proven vs. assumed, for the tool-picker decision

**Proven, live:** the roster and admissions routes both return 200 against the real daemon; a
101-tool real server is handled without any hardcoded count; the drift banner correctly renders
nothing when live and saved agree.

**Proven, component-level, through the real wire-shape → real API fix boundary → real rules →
real component render (no logic bypassed, no flat-shape fixtures that would re-create the ADM-003
bug):** many/few/zero admitted-tool counts, `allowlistedButAbsent`, `writeAllowedButNotAllowlisted`
individually and combined on one connection, and the 503-vs-zero distinction end-to-end from a
mocked `fetch` through the wired hook to the rendered sentence.

**Not proven:** real CSS layout for long content (Case 9's visual half). **Not renderable to test at
all today:** `hintsAbsent`/`writeDeclared`/`destructiveDeclared` (Case 5) — there is no UI code path
that keeps these fields past the API layer, on either payload, so there is no rendering behavior to
verify yet. That absence is itself the finding: build any tool-picker UI against
`AdminRemoteToolSurfaceEntry` with this field deliberately handled, not carried forward silently
unrendered the way it is today.

No defects were fixed. No application source file was modified — a temporary test file
(`apps/admin/src/features/settings/__tests__/mcp-panel-dynamic-scratch.test.tsx`) was written to
drive the fixtures above through the real code paths, run (12 then 14/14 passing, `tsc --noEmit`
0 errors held), and deleted after its evidence was captured into this report; it was never committed.
