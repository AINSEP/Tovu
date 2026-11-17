# Tool-call structural fixes: design (2026-11-17)

Design and plan only. No source file was edited, nothing was built, no test was run.
Input: `ADS-memory/.local-artifacts/codex/2026-11-10/tool-failure-audit.md` (1,324 failed tool calls of about 27,000, 10-20 to 11-10).
Code read: `integ/merge-a-2026-11-16`, Tovu `f354cfbd`, Jini `96aade8c`. Paths below are Jini `packages/…` or Tovu `apps/…`.
Line numbers are from those commits. Every sheet tells the executor to find the symbol by name first, because both
integration branches were still moving while this was written.

Repos are public. Security notes here name classes and locations only.

## 1. Verdict per class

| # | Class (audit count) | Today | Root cause (verified) | One mechanism | Sheets |
|---|---|---|---|---|---|
| C1a | Unknown tool id answered as "denied" (68 + part of 11) | **Live** | Four different answers for the same mistake (§2.1) | M1: one tool-target decision in the daemon route, `404 UNKNOWN_TOOL` | S1, S2 |
| C1b | Guides name tools the CLI cannot call directly (12) | **Live** | Direct set is the first 64 of one list; guides are free text; a full list silently skips promotion (§2.2) | M2: every answer says how to call the tool, plus a lint over every guide text | S3, S4a, S4b |
| C1c | Read-only gateway refuses a "get" tool (11) | **Live** | Three fields say "read" and are not checked against each other (§2.3) | M3: one registry-wide truth test | S5 |
| C2 | Tool, input and slug names masked in errors (78) | **Live, narrower** | Shape guessing: any run of 20+ characters is a secret unless it looks like a lowercase slug (§2.4) | M4: a trusted vocabulary built from registration data, used by both redaction layers | S6, S7 |
| C3 | Bare `HTTP 500` (40) | **Live, cause found** | The MCP client reads one envelope shape; the daemon app has no last-resort JSON error answer (§2.5) | M5: client never prints a status alone; one terminal error boundary on the server | S8, S9 |
| C4 | Same-file batch edits (21) | **Live** | Plan-mode batches pin every item before the first one runs (§2.6) | M6: the batch owner chains pins for items with the same target | S10, S11 |
| C5 | Refuse where clamp or help is safe (about 35) | **Live** | Repairs are per tool; the one normalizer knows aliases and number strings only (§2.7) | M7: declared repairs in the schema (`aliases`, `clamp`, `obtainFrom`) | S12, S13 |
| C6 | Screenshot 20 s deadline (20) | **Partly fixed** | A current-frame fallback exists; the deadline is still one constant for every request (§2.8) | M8: budget computed from the request, best effort after navigation | S14 |
| C7 | Calls silent for 300 s lose approvals (5 to 13) | **Live** | No progress notifications; a second 300 s wall is likely in the HTTP hop (§2.9) | M9: one progress pump in the MCP host, a long-wait fetch, per-CLI timeouts as adapter data | S15, S16 |
| C8 | Chrome tab collisions (192, rising) | **Changed** | Chrome is now a per-person switch, owner only, but it defaults to on and two runs can hold it at once (§2.10) | M10: one browser-integration lease per host; default is an owner decision | S17 |

Audit items checked and **not planned** because they are fixed or expected: result too large (paged since 11-02),
FS root wording, plugin off / OAuth refusals, owner rejections, media limits, egress block.

## 2. Root causes, with evidence

### 2.1 C1a: one mistake, four answers

| Path | Where | Answer today |
|---|---|---|
| Read-only gateway | `daemon/src/http/delegated-tools.ts:152-162` builds `TOOL_OPERATION_DENIED` from `daemon/src/core/read-only-tools.ts:46-49` | `HTTP 403: TOOL_OPERATION_DENIED: no tool "x" is registered; use search_tools — did you mean …` |
| Unconstrained gateway | executor throws `ToolInputError` (`unknown tool "x"`), caught at `delegated-tools.ts:381-383` | `HTTP 400: BAD_REQUEST: …unknown tool "x"`, no suggestions from this route |
| Catalog describe | `daemon/src/http/tool-catalog.ts:89` | `404 NOT_FOUND` |
| MCP-local dispatch | `mcp/src/server/tool-protocol.ts:304-306` | `unknown tool: x` |

Status table: `core/src/contracts/server/api-error.ts:32-56` maps `TOOL_OPERATION_DENIED` to 403. There is no code for
"this tool does not exist". The 17 generic codes are in `protocol/src/errors.ts:9-27`.

Family ids: `content_read` is a group of tools, not a tool. Describe was taught this in Tovu
(`apps/website/src/assistant/tool-catalog-query.ts:68-82`, `targetToolIds`). Execute was not. The suggestion scorer in
Jini names that Tovu family by string (`daemon/src/core/tool-candidates.ts:26`), which also breaks the rule that the
engine holds no product names.

### 2.2 C1b: what "directly callable" means today

- The MCP host publishes: 5 run tools, `search_tools`, `describe_tool`, component catalog tools, the two gateways,
  `wait_for`, optionally `check_messages` and `read_tool_result` (`mcp/src/server/run-tool-host.ts:99-111`,
  `tool-server.ts:310`), **plus** typed tools for the ids in `startupToolIds`.
- Tovu passes every visible id, theme file tools first (`apps/website/src/server/inbound/assistant/agent-daemon-scope.ts:511-518`).
  Jini keeps the first 64 that fit 256 KiB of schema (`core/src/tool-exposure.ts:210`, limit check `:162`).
- `describe_tool` promises that a described tool "also" appears in `tools/list`
  (`mcp/src/server/tools/tool-catalog-tools.ts`, `describeToolTool`). When the list is full, promotion is skipped with
  reason `tool-limit` and nobody is told. The model then calls `mcp__jini__<id>` and the CLI answers "No such tool".
- Guide text is free text in many places. Found so far, by kind:

| Kind | Example site | Names tools as |
|---|---|---|
| System overlay | `apps/website/src/server/inbound/assistant/assistant-system-overlay.ts:55`, `agent-daemon-scope.ts:1127` | bare id in a sentence |
| Plugin guidance | `features/agent-plugins/bundled-catalog.ts:153`, `features/agent-plugins/host-tool-ports.ts:32`, `features/plugin-runtime/plugin-tool-messages.ts:36`, `features/plugin-runtime/agent-tools.ts:158` | call form `load_agent_plugin({…})` |
| Tool descriptions and schema descriptions | `features/theme/agent-tools.ts:138` ("Use theme_list_files…"), `features/theme/duplicate-theme-tool.ts:41` | bare id |
| Refusal and result messages | `daemon/src/core/read-only-tools.ts:45-49`, `mcp/src/server/tool-result-pages.ts:45,78` | bare id or call form |
| MCP server instructions and local tool descriptions | `mcp/src/server/run-tool-host.ts` (`INSTRUCTIONS`), `tools/wait.ts:8` | bare id |
| Runtime guidance | `apps/website/src/server/inbound/assistant/assistant-runtime-guidance.ts:87` (`fs_write_files`) | bare id |
| Capability cards, site guide resource | `features/plugin-runtime/capability-card.ts:8`, `createSiteGuideResource` | bare id |

A search for only four ids (`load_agent_plugin`, `agent_plugin_connect`, `plugins_set_enabled`, `credential_save`)
finds 65 non-test files. **I did not count every guide site or every registered tool**: that needs the booted registry.
Sheet S4a produces that inventory as a committed file before anything is changed, and S4b may not start until its
unclassified count is zero.

### 2.3 C1c: three fields for one fact

`external_mcp_get_admissions` says "Reads…" in its description and is registered `sideEffects: "mutates-durable-state"`
(`apps/website/src/features/external-mcp/operations-tools.ts:33-34`), while its metadata row sits in
`apps/website/src/contracts/core/tool-metadata/external-mcp.ts:6`. The gate reads a third field: `descriptor.readOnly === true`
(`core/src/tool-registry.ts:100-102`). Nothing compares the three.

### 2.4 C2: shape guessing

- `core/src/redact.ts:338`: any run of 20 or more `[A-Za-z0-9_-]` is an opaque token.
- It survives only if it is a correlation id, UPPER_SNAKE, or (model-facing paths) a lowercase slug of letter-only or
  digit-only segments up to 31 characters (`core/src/text/sanitize-untrusted-text.ts:107-110`, unchanged since the audit).
- So these are still masked: camelCase input names of 20+ characters (`dismissCookieBanners` is exactly 20), slugs with
  letter+digit segments, UUID execution and job ids, tool ids registered after launch.
- **Changed since the audit:** the full registry now reaches the MCP process at launch
  (`agent-daemon-scope.ts:504` → `daemon/src/agent-executor/mcp-bridge.ts:84`, `JINI_DIAGNOSTIC_TOOL_IDS`), and
  `handleToolCall` adds the local tool names (`tool-protocol.ts:301`). Tool ids known at launch are no longer masked on the MCP side.
- There are **two** redaction layers: the daemon's tool-failure redaction (`daemon/src/tool-recovery/redaction.ts`, on
  `redactSecrets`, which has its own opaque-token pass at `redact.ts:852-861`) and the MCP client's `safeDiagnostic`
  (`mcp/src/server/daemon-client.ts:144-165`). **Not verified:** which layer produced each of the audit's examples
  ("Call [redacted] with {}"). S6 starts with a test that sends each example through both layers and records which one masks it.

### 2.5 C3: where a bare status comes from

Client: `formatDaemonHttpError` (`mcp/src/server/daemon-client.ts:168-174`) reads only `{ error: { code, message } }`.
`parseJsonLoose` (`:59-66`) turns any non-JSON body into `{}`. Result: the status alone.

Server responses on the delegated path that fall through that formatter today:

| Source | Where | Body | Model sees |
|---|---|---|---|
| A throw inside the run-scope middleware goes to `next(error)` | `agent-daemon-scope.ts:1424-1429` | Express default error page (HTML) | `HTTP 500` |
| Body parser refusals (over 6 MB, malformed JSON) | `agent-daemon-scope.ts:1407` | HTML | `HTTP 413` / `HTTP 400` |
| "a live run is required" | `:1426`, `:1558` | flat `{ error: "…" }` | `HTTP 404` |
| "site scope is closed" | `:1370` | flat `{ error: "…" }` | `HTTP 503` |

I found no terminal error handler in `agent-daemon-scope.ts` (searched for a four-argument middleware and for
`status(5`). **Not verified:** whether the parent app in `agent-daemon-server.ts` adds one, and which of these rows
caused the 11-09 storm (27 in one run). The audit found no server log line for it, which fits the first row: Express's
default handler logs to stderr only outside production mode.

A decoder for both envelope shapes already exists: `decodeApiError` (`protocol/src/errors.ts:111-121`).
`@jini-ai/mcp` already imports `@jini-ai/protocol`.

### 2.6 C4: pins taken before the first write

- Theme content tools are batched in plan mode (`apps/website/src/assistant/batch-tool-inputs.ts:14`,
  `apps/website/src/assistant/tool-registrations.ts:522`), so the handler receives `{ items }` once.
- The handler is `createPreparedBatchHandler` (`apps/website/src/features/theme/file-mutation-tools.ts:32`), which is
  `createBatchApprovalHandler` without a question (`core/src/approval.ts:182-191`).
- `prepare` runs for **every** item first (`approval.ts:226`). Each `prepare` stores the file's digest
  (`file-mutation-tools.ts:50`, `theme-files.ts:684-690`).
- `run` then goes item by item (`approval.ts:243-246`). Item 1 writes. Item 2 compares its stored digest with the file,
  sees item 1's bytes, and throws "The theme file changed during review…" (`file-mutation-tools.ts:55-58`, second copy `theme-files.ts:676`).
- The throw ends the loop. Earlier items stay applied, later items never run, and the message says nothing was replaced.
  **Not verified:** how this reaches the model as the audit's `partial_failure` shape; S10's first test records the real output.
- The wording is also wrong: theme writes have no review step (`file-mutation-tools.ts:51`).

`createPreparedBatchHandler` has one production caller (theme). `createBatchApprovalHandler` has none outside core in Tovu.

### 2.7 C5: repairs live in two places and know two tricks

- Registry tools: `normalizeToolInput` (`core/src/tool-input-normalization.ts:231`) applies declared `aliases`
  (`:125`), number-string coercion (`:69`), near-miss key names. No bounds handling.
- MCP-local tools use a smaller normalizer (`mcp/src/server/tool-arguments.ts:135-153`) unless they set `schemaInput`.
- Open cases: `read_tool_result.limit` over 8000 refused by the schema (`mcp/src/server/tool-result-pages.ts:48`);
  `theme_duplicate` has no `sourceId` alias (`apps/website/src/features/theme/duplicate-theme-tool.ts:48-50`);
  `theme_list_files` without `themeId` gets "supply required argument" plus the schema but no pointer to `theme_list`
  (`features/theme/agent-tools.ts`, `LIST_FILES_SCHEMA`); `pages_read_html` not-found has no hint
  (`features/pages/html-document-store.ts:347,350,392`).
- **Not re-verified:** `web_fetch_page sitePath`, `web_screenshot_page width`. S13 checks them against the live schema.

### 2.8 C6: one constant for every capture

`CAPTURE_DEADLINE_MS = 20_000` (`apps/website/src/features/web-screenshot/web-screenshot.ts:35`), message at `:230`.
The budget is spent in Jini's `renderPage` (`diagnostics/src/web-evidence/render-page.ts`, `timeoutMs` `:44`, navigation
`:205`, wait `:228-234`, load wait `:252`). A fallback already takes the current frame when only the **stable-frame
screenshot** times out (`playwright-page-capture.ts:199-217`, 4 s reserve). A page that uses the budget during navigation,
scrolling (`fullPage`) or its requested wait still fails with nothing, and the outer race (`:163-175`) drops the browser.
**Not verified:** how many of the audit's 20 came before that fallback; the file's history was squashed by later refactors.

### 2.9 C7: two walls at 300 seconds

1. The CLI. `packages/mcp/src/server/**` never sends `notifications/progress` (search finds the word only in
   `federation/adapter.http.ts`, which is Jini acting as a client). The call handler forwards only `extra.signal`
   (`tool-server.ts:331-333`; port type `:48-53`), although the SDK passes the whole `extra` object through
   (`tool-server.ts:139`). The delegated call itself waits without a deadline by decision (`tools/delegated-tool.ts:114`).
2. The HTTP hop. The MCP process calls the daemon with the global `fetch` (`daemon-client.ts:230`). Node's fetch gives up
   when response headers do not arrive within its own default timeout, which is 300 s in current Node releases.
   **Not verified in this run** (nothing was executed), but it matches the audit's unexplained `fetch failed` ×10 on
   publish and credential tools. S15's first test proves or disproves it against a real local server.

No generated MCP config sets a per-server tool timeout (`mcp/src/core/config.ts`, `core/opencode/config.ts`,
`daemon/src/agent-executor/mcp-bridge.ts`: no match for any timeout key).

Overlap check: the AG-UI design keeps the server's chat-card exchange as the one approval mechanism (its OD-10) and adds
SSE keepalive between browser and server. It does not touch the hop from the agent CLI to the MCP host. No shared change.

### 2.10 C8: Chrome is a switch now, on by default

- `useClaudeInChrome` defaults to `true` (`apps/website/src/assistant/runtime-preferences.ts:25`).
- It applies only to the owner on a runtime that supports it, and a supporting runtime is always told `--chrome` or
  `--no-chrome` explicitly (`apps/website/src/server/inbound/assistant/assistant-runtime-guidance.ts:55-72`;
  Jini `agent-runtime/src/defs/claude.ts:127-128`).
- Nothing limits how many runs hold Chrome at once, and the tab group belongs to the CLI and its browser extension.
  **Not verified:** whether the CLI offers a per-session tab group; I found no such option in the adapter.
- Collisions with the owner's own non-Tovu sessions cannot be fixed from here.

## 3. Mechanisms

Each mechanism has one owner. A Jini package imports itself, `@jini-ai/core` and `@jini-ai/protocol` only. New
functions take `(required, optional = {})`, stay under 50 lines and complexity 10, and new files stay under 500 lines.
Files that are already close to the limit get a new sibling file instead of more lines
(`tool-server.ts` 409, `delegated-tools.ts` 392, `approval.ts` 373, `tool-protocol.ts` 333).

### M1. One tool-target decision (Jini `daemon`, codes in `protocol` + `core`)

```ts
// daemon/src/core/tool-target.ts (new)
export type ToolTarget =
  | { readonly kind: 'tool'; readonly toolId: string; readonly input: unknown; readonly notes: readonly string[] }
  | { readonly kind: 'unknown'; readonly toolId: string; readonly candidates: readonly string[]; readonly family?: readonly string[] };
export interface ToolFamilyPort {   // host-owned; absent means "no families"
  resolveMember(required: { familyId: string; input: unknown }): { memberId: string; input: unknown } | { members: readonly string[] } | undefined;
}
export function resolveToolTarget(required: { toolId: string; input: unknown; registry: Pick<ToolRegistry, 'list'> },
                                  optional?: { families?: ToolFamilyPort }): ToolTarget;
export function unknownToolMessage(required: { target: Extract<ToolTarget, { kind: 'unknown' }> }, optional?: {}): string;
```

- The delegated route calls it **once**, after the run-existence check and before the read-only check, the principal
  lookup and the bridge. Everything after that line uses the resolved id. An unknown target answers
  `404 UNKNOWN_TOOL` for both gateways.
- Exact message, one format: `There is no tool named "x". Closest names: a, b. Find tools with search_tools.`
  For a family id: `"content_read" is a group of tools, not one tool. Call one of: content_read.menu, content_read.page.`
- `UNKNOWN_TOOL` joins `GENERIC_ERROR_CODES` and the status table (404). `TOOL_OPERATION_DENIED` keeps meaning a real refusal.
- The MCP-local "unknown tool: x" answer uses the same sentence builder with the local names as candidates, so the
  fourth path matches. `check_messages` keeps its dedicated sentence.
- Family routing (owner decision OD-2): when the port returns one member, the call continues as that member with the
  selector key removed and a note `"content_read" is a group; ran content_read.menu`. Tovu supplies the port from the
  same catalog snapshot that already builds `targetToolIds`. The `content_read` string leaves Jini.

Security trace (lesson 13): the order of gates on the delegated path stays bearer → run credential matches `body.runId`
→ run exists → **target decision** → read-only check on the **resolved** id → principal → attenuation → executor
(policy, confirmation card, deny by default). The target decision reads descriptors only. It never executes, never
widens what a read-only caller can reach (the member is checked by the same `isReadOnlyTool`), and never answers
"unknown" for a tool the caller may not see in a way that differs from a tool that does not exist: the registry passed
in is the run-scoped one the route already uses (`siteTools.registry` under `withRun`, `agent-daemon-scope.ts:1424-1429,1496`).
S1 pins that with a test: a tool hidden from the run and a made-up id produce the same answer and the same candidates.
A 404 instead of a 403 must not change any gate that keys on the status: S1 lists every reader of
`TOOL_OPERATION_DENIED` and of `DaemonHttpError.status` first.

### M2. Every answer says how to call the tool; a lint reads every guide (Jini `mcp`, Tovu check)

- `McpToolContext` gains `isDirectTool(required: { name })`. `describe_tool` adds `callAs: 'direct' | 'gateway'` and,
  for a gateway-only tool, the exact call: `execute_delegated_tool({"toolId":"x","input":{…}})` (the read-only gateway
  when the descriptor is read-only). The false "also appears in tools/list" promise is removed from the description and
  made conditional in the result. A skipped promotion (`tool-limit`, `schema-limit`) is no longer silent.
- One text helper renders a tool mention for model-facing text: `toolCallText({ toolId, input? }, { direct })`. It lives
  in `@jini-ai/core` so Tovu features and Jini packages share it.
- Tovu pins: `startupToolIds` puts the **named** set first (the ids the lint finds in guide text), then the four theme
  file tools, then the rest. The named set is a generated, committed list, so launch does not scan source.
- Lint `check:tool-guides` (Tovu `development/scripts/check-tool-guides.ts`, registry from the existing
  `development/evals/tool-search-eval-registry.ts`; Jini half in `scripts/`): reads every string literal and template
  chunk in non-test source plus every descriptor and schema description from the booted registry.
  1. A registered id or MCP-local name inside a longer string is a **mention**.
  2. A mention must be in the pinned list, or written in gateway call form.
  3. A snake_case token in call form (`name(` or `name({`) or in backticks that is **not** a registered id fails as "names a tool that does not exist".
  4. `pinned + local` must fit the 64-tool and 256 KiB limits; the check prints the margin.
  It also covers `obtainFrom` values (M7) and plugin guidance files shipped as content.
- Guessed `agent_plugin_<id>`: rule 3 catches guides that invite it, and M1's candidates answer it
  (`agent_plugin_google-login` → `agent_plugin_google-login__…` members).

Consumers that will move with this (lesson 2): tool-description snapshot tests, the search-eval fixtures that embed
descriptions (`development/evals/*`), the doc2query index built from descriptions, and source-reading tests. S4a lists
them by running the suites before any text changes and recording which tests read description text.

### M3. One truth test for "read" (Tovu)

A test over the full registry: `approval.class === 'read'` ⇔ `descriptor.readOnly === true` ⇔ `sideEffects` is not a
mutating value, and a description that starts with "Reads", "Lists", "Gets" or "Tests" on a non-read tool fails unless
listed with a reason. Mismatches are fixed by changing the registration to what the handler really does, after reading
the handler. A tool that writes (for example an admission cache) stays a write and is **reworded**, never relabelled.

### M4. Trusted vocabulary instead of shape guessing (Jini `core`, used by `mcp` and `daemon`)

```ts
// core/src/text/diagnostic-vocabulary.ts (new)
export function buildDiagnosticVocabulary(required: { toolIds: readonly string[] },
  optional?: { inputSchema?: unknown; envelope?: { requestId?: string; details?: unknown }; echoed?: { input: unknown; schema?: unknown } }): readonly string[];
```

Sources, all from trusted positions, never from the error text itself:

1. Registered tool ids (today's `diagnosticToolIds`), refreshed per call from the daemon's answer when it names the tool it ran.
2. Property names of the called tool's input schema, walked to a fixed depth. This is what keeps `dismissCookieBanners` readable.
3. Ids the server put in **named envelope fields**: `requestId`, `errorId`, `details.executionId`, `details.jobId`,
   `details.toolId`, `details.pendingToolId`. Each must match its expected shape.
4. (Owner decision OD-3) Scalar string arguments the caller sent in this same call, except any property whose schema
   marks it secret (`writeOnly`, `format: password`, or the project's secret marker) and except any value a secret rule matches.

Rules that do not change: credential and labelled-secret rules run first; a vocabulary entry exempts a **whole** token
only; UUIDs and letter+digit runs are not exempt by shape (some providers issue UUID-shaped keys); the 20-character
rule stays for everything else. Both layers call the same builder, so a name kept by the daemon is not masked again by
the MCP client. The publish error's `Call [redacted] with {}` becomes readable through source 1 or 3 once S6's first
test shows which layer masks it.

Disclosure (lesson 24): the vocabulary only stops masking of names. It does not add any text to an error. What an error
may say stays with the error-system design's disclosure rules.

### M5. Never a status alone (Jini `mcp` client, Jini `http-kit` boundary, Tovu wiring)

Client (`mcp/src/server/daemon-client.ts`, formatting moves to a sibling `daemon-error-text.ts`):

- Decode with `decodeApiError` (nested and flat). Keep `code`, `message`, `requestId`/`errorId`.
- Non-JSON body: the first non-empty line, tags stripped, sanitized, at most 200 characters.
- Always a sentence chosen by status class, then the detail, then the id. Exact texts:
  - 5xx with an id: `The tool service failed (HTTP 500). <detail> Error ID: ERR-…. Do not retry the same call; give the user this ID.`
  - 5xx without an id: the same sentence with `Reference: <ref>` where `<ref>` comes from an injected `ids` port and
    is written once to the MCP process log with status, route, content type and body length (no body text).
  - 503: `The tool service is restarting or closed (HTTP 503). Wait a few seconds and retry once.`
  - 4xx without detail: `The tool service refused the request (HTTP 404) and gave no reason. Reference: <ref>.`
- `DaemonHttpError` keeps `status` and gains `code` and `requestId`, so callers stop parsing text.

Server: `http-kit` gains `mountJsonErrorBoundary({ app }, { onInternalError, logSource })`, a last middleware that
answers JSON for any error or unmatched API path: body-parser refusals keep their own status (413, 400) with a plain
sentence; everything else is `reportRouteInternalError(...)`, so it carries a `requestId` and reaches the host's
incident sink. Tovu mounts it last on the daemon app and turns the three flat `{ error: "…" }` answers into
`createApiError` envelopes with codes.

Coordination with the error-system design (no change planned twice):

- That design's E4 makes `reportRouteInternalError` call `createErrorReporter` and E2 moves the `ERR-…` id minting to
  core. M5 **calls** `reportRouteInternalError` and takes its `ids` port from the same core function once E2 lands.
  It adds no second reporter, no second id format and no new envelope.
- If S9 runs before E2/E4, it uses today's `reportRouteInternalError` (UUID `requestId`) and E4 converts it with the
  other six call sites. The sheet says so. S8's exact-text tests take the id as a fixture value, so they do not change.
- The error-system site list has no row for `daemon-client.ts` or `delegated-tools.ts`; nothing here duplicates its sweeps.
- R7 (daemon `src/http` → `ServerRoute[]`) moves the route files. S1 and S9 touch `delegated-tools.ts` and the Tovu
  scope file. Order is in INDEX §3.

### M6. Chained pins for same-target batch items (Jini `core/src/approval.ts`, Tovu theme adoption)

```ts
// added option on createPreparedBatchHandler only
chain?: { targetKey(required: { prepared: TPrepared }): string;
          repin(required: { prepared: TPrepared; ctx: ToolExecutionContext }): TPrepared | Promise<TPrepared> }
```

- After an item runs successfully, the next item **with the same key** is re-pinned before its own `run`. Items with
  other keys keep the pin taken at prepare time.
- If an item fails, later items with the same key are not run and report
  `Skipped: an earlier change to this file in the same call failed.` Items for other files still run. The result lists
  every item as applied, failed or skipped. A batch never reports "nothing was replaced" after something was.
- Only for direct batches. A batch that asks a person keeps one pin per item, because the person approved a
  description computed from the first bytes. Its refusal gets the corrected words.
- Protection kept: a change made by anyone else between two items still refuses, because `repin` reads the version
  right after this call's own write and the existing check in `run` compares again before the next write. The window
  between a write and the re-read is the same size as the existing window between check and write; S10 states it and does not claim to remove it.
- New wording, both sites: `This theme file changed after it was read. Read it again and retry; this change was not applied.`

### M7. Declared repairs in the schema (Jini `core` normalizer, MCP-local opt-in, Tovu data)

- `aliases` (exists): add `sourceId` on `theme_duplicate.sourceThemeId`.
- `clamp: true` (new) on a numeric property with `minimum`/`maximum`: an out-of-range number is set to the bound with a
  value-free note (`limit was lowered to its maximum, 8000`). Opt-in per property (OD-8). Never on a property that
  selects, addresses or authorizes something. MCP-local `read_tool_result` opts in through `schemaInput`.
- `obtainFrom: "<tool id>"` (new) on a required property: the missing-argument message becomes
  `supply required argument \`themeId\`; list valid values with theme_list`. M2's lint checks the id.
- Gate: a registry-wide test that every integer property named like a page or size control (`limit`, `offset`,
  `pageSize`, `maxResults`, `width`, `height`, `waitMs`) with a `maximum` states `clamp` as true or false. Report-only
  until its list is classified, then strict.
- One domain message edit that no keyword covers: the `pages_read_html` not-found text names the listing tool.
- Both extension keywords are published with the schema, as `aliases` already is. S12 checks the three schema
  consumers that might reject unknown keywords: the MCP validator (`@cfworker/json-schema`, strict flag at
  `tool-protocol.ts:246`), `parseMcpToolInputSchema`, and each CLI's schema loader (the Gemini union-schema fix shows
  one of them is strict).

### M8. A budget computed from the request (Jini `diagnostics/web-evidence`, Tovu adoption)

```ts
// diagnostics/src/web-evidence/capture-budget.ts (new, pure)
export function captureBudget(required: { settleMs: number; fullPage: boolean; waitForSeconds?: number },
                              optional?: { baseMs?: number; fullPageMs?: number; capMs?: number }): { totalMs: number; reserveMs: number };
```

- Total = base 20 s + requested wait + a full-page allowance, capped (OD-5 proposes 45 s). The reserve for the
  fallback frame stays 4 s.
- Best effort is widened: once navigation has committed, a budget timeout in the wait, load or scroll phase takes the
  current frame with the existing note instead of failing. A timeout before navigation commits still fails, with the
  phase named: `this site did not answer within N seconds` versus `this site loaded but did not settle…`.
- The message at `web-screenshot.ts:230` states the real number used.
- The outer race keeps its job (a hung renderer) with the computed total.

### M9. Progress from one place, a long-wait fetch, timeouts as adapter data (Jini `mcp`, `agent-runtime`)

- `mcp/src/server/call-progress.ts` (new): `startCallProgress({ extra, scheduler, intervalMs })` returns `stop()`.
  When the request carries `_meta.progressToken` and `extra.sendNotification` exists, it sends
  `notifications/progress` with an increasing counter and the fixed message `waiting` every 25 s. No token: it does nothing.
  It is started and stopped in the one `tools/call` handler, so the gateways, typed tools, local tools and `wait_for`
  are all covered. It stops on settle and on `extra.signal` abort, before the response is written; a failed send stops it and is logged once.
  It carries no tool output, no card text and no ids (lessons 18, 19).
- The composition root (`mcp/src/bin/serve.ts`) passes a `fetchImpl` whose response-header wait is unlimited. The bound
  on a delegated call stays what it is today: the caller's signal and the run. Short calls keep `DEFAULT_TIMEOUT_MS`.
- Per-CLI behaviour is adapter data: each agent def declares `mcpToolCall: { sendsProgressToken, resetsOnProgress,
  timeoutConfig? }`, and the MCP config writers emit the vendor's own timeout key where one exists. **None of these
  values were verified here.** S16 measures them with a recording fake MCP server before writing any value; a CLI that
  cannot be measured gets no entry and is listed as unknown.
- Approvals: unchanged owner (the chat-card exchange). When a CLI still aborts, the existing signal path expires the card.

### M10. One browser integration at a time (Jini `daemon` launch port, Tovu wiring)

- `browserIntegrationLease` port on the launch path: a run that asks for `chromeIntegration: true` takes the host
  lease; a second run launches with `false` and gets one guidance sentence: `Another chat is using the browser
  integration. Use web_screenshot_page and page tools.` The lease is released on every run ending, including crash and cancel (lesson 21).
- Generic by category: the def already declares browser integration as a capability; the lease is not Claude-specific.
- Default (OD-4): proposal is off by default, on when the owner turns it on. With M8 the common reason to reach for
  Chrome shrinks.

## 4. Gates that stop each class from coming back

| Class | Gate | Where it runs |
|---|---|---|
| C1a | Route test: unknown id on either gateway is `404 UNKNOWN_TOOL` with the exact sentence; guard rule: no product tool name in `packages/**` | Jini daemon tests, `pnpm guard` |
| C1b | `check:tool-guides` (strict after S4b), pinned-fit test | Tovu check, Jini `scripts/` |
| C1c | Read-truth registry test | Tovu test |
| C2 | Table test of real masked examples through both layers; property test that a credential-shaped value is still masked even when it is in the vocabulary sources that must not be trusted | Jini core + mcp tests |
| C3 | Property test: for any status 400–599 and any body the message is never only a status and always has an id or reference; wire test that a throwing middleware answers JSON with a request id | Jini mcp tests, Tovu integration test |
| C4 | Core test for chain and skip; Tovu test with three edits to one file | Jini core, Tovu |
| C5 | Bounds-declared registry test; normalizer tests | Jini core, Tovu |
| C6 | Pure budget tests; fake-page tests per phase | Jini diagnostics, Tovu |
| C7 | Fake-scheduler test of the pump (token, no token, abort, settle); real-server test of the header wait | Jini mcp |
| C8 | Lease tests (two runs, release on each ending) | Jini daemon |

## 5. Lessons applied (the ones that shaped this plan)

- 2 / 9 / "search for existing mechanisms": reused `decodeApiError`, `reportRouteInternalError`, `normalizeToolInput`
  and its `aliases`, `toolCandidates`, `targetToolIds`, `buildEvalToolRegistry`, the `chromeIntegration` option, the screenshot fallback.
- 5: every sheet lists its prerequisites and is green alone; text-changing sheets update the tests that read the text in the same commit.
- 6: each characterization test names the failure it must show before the fix (INDEX §2, column "red-first test").
- 13: gate order on the delegated path traced in M1; S1 and S9 carry tests that fail when a gate is removed.
- 15: owner rules are acceptance criteria in every sheet (limits, DI, exact error text, no masked names, no bare status).
- 18 / 19: the progress pump carries no content and no correlation by tool name.
- 20: making the screenshot deadline configurable revisits the outer race and the message that quoted the constant.
- 21: the lease is released on process death, not only on promise settlement.
- 24: un-masking names is separated from disclosure; both directions of old client × new server are covered in S8 and S9.

## 6. Not verified

1. Nothing was executed. All claims come from reading the two commits named at the top.
2. The number of registered tools, the number of guide sites, and whether the named set fits the 64-tool limit (S4a measures).
3. Which redaction layer masks each audit example (S6 measures).
4. Which bare-status source caused the 11-09 storm; whether `agent-daemon-server.ts` adds an error handler above the scope app.
5. The 300 s response-header wait of Node's fetch on the versions in use (S15 measures).
6. Whether each agent CLI sends a progress token, resets its timer on progress, or has a per-server timeout key (S16 measures).
7. How a failed plan-mode batch reaches the model today (S10 measures).
8. `web_fetch_page sitePath`, `web_screenshot_page width`, and the publish "status could not be confirmed" case (the audit marks it unclear; not planned here).
9. `integ/merge-b-2026-11-16` was not read. It was moving in parallel and may have changed the cited lines.
10. Tool names leaking into assistant replies (audit item 16) is a prompt and UI matter and is not planned here.
