# S6. Trusted vocabulary for model-facing errors, built before the first lossy pass (C2, mechanism M4, MCP side)

Repo: Jini. Packages: `core`, `mcp`. Estimate: 200k Sonnet. Prerequisites: S8 (envelope `details` on `DaemonHttpError`,
the formatter file). Needs decision: **OD-3** for source 4 only (run without it; source 4 is then left out).
Landed check: `rg -n "describeDaemonFailure" packages/mcp/src/server/daemon-error-text.ts`.

## Where names are really lost (judge findings 9 and 10; lesson 34)
- The daemon side does **not** mask names in Tovu. `daemon/src/tool-recovery/redaction.ts` (`redactFailedResult`) calls
  an injected `redactSecretShapes` port; Tovu binds `@tovu/contracts/secret-redaction`, which is secrets-only and whose
  own unit tests assert that tool ids and ordinary diagnostics stay. Nothing to change there.
- The **first lossy pass** is in the MCP client: `requestDaemonJson` formats a non-2xx answer through `safeDiagnostic`
  **before** it throws. `handleToolCall` sanitizes the thrown message a **second** time. A name masked by the first
  pass cannot be restored by the second. So the vocabulary must be complete when `requestDaemonJson` formats the error.
- A gateway call's MCP schema describes `toolId` and a free `input`, not the domain tool's schema. Domain property
  names for a gateway call can therefore only come from (a) a descriptor this MCP run already holds, or (b) trusted
  metadata the server puts in the envelope (S7 adds it).
- `ctx.diagnosticToolIds` is also used as a **registration predicate** (`tools/delegated-tool.ts`, `isRegistered`).
  The vocabulary must never be merged into it.

## Read first
`../DESIGN.md` §2.4, M4. `rg -n "isIdentifierShaped|diagnosticToolIds|keepIdentifiers" packages/core/src/text/sanitize-untrusted-text.ts` ·
`rg -n "OPAQUE_TOKEN_RE" packages/core/src/redact.ts` · `rg -n "export function safeDiagnostic|formatDaemonHttpError|describeDaemonFailure" packages/mcp/src/server` ·
`rg -n "diagnosticToolIds" packages/mcp/src/server` (every use; classify each as "exempt tokens" or "is registered").

## Fixtures (shared by this sheet and S7)
New `core/src/text/masked-identifier-rows.ts`, public entry `./text/masked-identifier-rows` (`universal`, README §4.9): the rows
as data, no test code.

| Row | Text | Trusted source that must keep it |
|---|---|---|
| 1 | `Call publish_job_status_read with {}` (a registered id of 20+ characters) | source 1 |
| 2 | `Declared inputs: viewport (optional), fullPage (optional), dismissCookieBanners (optional)` | source 2 |
| 3 | `media_asset 'marquee-suit-2024-final-v2' was not found` | source 4 (OD-3) |
| 4 | `execution 3f2b8c1e-5d47-4a8e-9b1c-0d6e7f8a9b10 for theme_write_file is still pending` | source 3 (`details.executionId`, `details.toolId`) |
| 5 | `tool "agent_plugin_google-login__start_sign_in" timed out before it finished` (id **not** in the launch list) | source 3 (`details.toolId`) |

## Characterization (passes today; commit first). Each redactor is tested in its **own** package.
- `core/src/text/__tests__/masked-identifiers.characterization.test.ts`: each row through `sanitizeUntrustedText` with
  `keepIdentifiers: true` and no trusted tokens → record exactly which rows print `[redacted]`.
- `mcp/src/server/__tests__/masked-identifiers.characterization.test.ts`: each row as the `message` of a nested
  envelope answered by a fake `fetchImpl`, through `postDaemonJson` and through `handleToolCall` → record the output.
  No daemon code is imported.

## Red-first (each must fail by showing `[redacted]`)
`core/src/text/__tests__/diagnostic-vocabulary.unit.test.ts`, `mcp/.../masked-identifiers.unit.test.ts`:
- typed tool call (the MCP tool's schema **is** the domain schema): row 2 unchanged.
- gateway call for a tool this run has described or published (descriptor held by the publisher): row 2 unchanged.
- gateway call for a tool this run never described: row 2 unchanged **only** when the envelope carries
  `details.inputNames` (fake daemon sends what S7 will send); without it, row 2 stays masked (pin that).
- rows 4 and 5 unchanged when the envelope has `details.executionId` / `details.toolId` of the right shape.
- row 3 unchanged only when the slug is a scalar argument of the same call (OD-3 = yes).
- **still masked** (pass before and after): a `Bearer` token; `apiKey: <40 chars>`; a UUID that appears only in free
  text; the **value** of a schema-named property; an argument whose schema property has `writeOnly: true` or
  `format: "password"`; a vocabulary entry glued to a suffix (`dismissCookieBannersXYZ…`); a 60-character token in
  `details.jobId`; any `details.inputNames` entry that is not `[A-Za-z_][A-Za-z0-9_]{0,63}`; more than 64 names (extra ignored).
- registration predicate: after a call that put `dismissCookieBanners` in the vocabulary, the gateway's `isRegistered`
  for `dismissCookieBanners` is still `false`.

## Change (one gated commit per item)
1. `core/src/text/diagnostic-vocabulary.ts` (new, pure, ≤ 150 lines), public entry `./text/diagnostic-vocabulary`:
   `buildDiagnosticVocabulary({ toolIds }, { inputSchema, envelopeDetails, echoed })` as in DESIGN M4. Schema walk
   depth ≤ 6, ≤ 512 names; envelope fields by fixed name with shape checks.
2. `DaemonRequestOptions.trustedTokens?: readonly string[]` and `McpToolContext.diagnosticVocabulary?: readonly string[]`
   (new fields; `diagnosticToolIds` keeps its meaning). `daemonCallOptions` forwards it. `safeDiagnostic` passes
   `[...diagnosticToolIds, ...trustedTokens]` to the sanitizer's existing whole-token exemption.
3. First pass: in `requestDaemonJson`, build the per-answer tokens from the decoded envelope's `details`
   (`toolId`, `pendingToolId`, `executionId`, `jobId`, `requestId`, `errorId`, `inputNames`) and add them for that one format call.
4. Second pass and pre-call: `handleToolCall` builds the vocabulary once per call (the called tool's schema; for a
   gateway call the held descriptor of `args.toolId` through a new optional `ctx.descriptorFor?({ toolId })` supplied
   by the publisher; OD-3: `echoed`), sets `ctx.diagnosticVocabulary`, and re-adds the tokens `DaemonHttpError.details`
   carried, so the second pass keeps what the first kept.
5. Do not change `OPAQUE_TOKEN_RE`, `isIdentifierShaped` or any credential rule.

## Acceptance
- Rows 1, 2, 4, 5 (and 3 under OD-3) readable end to end through `handleToolCall` with a fake daemon, for a typed
  call **and** both gateways; all "still masked" cases green.
- Property test: random 20 to 64 character tokens in none of the sources always come out as `[redacted]`.
- Gate green for `core` and `mcp`; counts recorded; new exports listed for REL.
