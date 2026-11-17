# S6. Trusted vocabulary for model-facing errors, MCP side (C2, mechanism M4)

Repo: Jini. Packages: `core`, `mcp`. Estimate: 190k Sonnet. Prerequisites: none. OD-3 decides source 4.

## Read first
`../DESIGN.md` §2.4, M4. `core/src/text/sanitize-untrusted-text.ts` (`isIdentifierShaped`, `redactSecretLike`,
`SanitizeTextOptions.diagnosticToolIds`), `core/src/redact.ts` (`OPAQUE_TOKEN_RE`, `NON_SECRET_TOKEN_RE`,
`collectOpaqueTokens`), `mcp/src/server/daemon-client.ts` (`safeDiagnostic`), `mcp/src/server/tool-protocol.ts`
(`handleToolCall`: three sanitize calls), `daemon/src/tool-recovery/redaction.ts` (`redactFailedResult`).

## Step 0: locate the layer (characterization, passes today; commit it first)
`mcp/src/server/__tests__/masked-identifiers.characterization.test.ts`. For each row, build the daemon error envelope a
real handler would send, run it through (a) `redactFailedResult` and (b) `safeDiagnostic`, and record in the test which
layer first prints `[redacted]`:

| Row | Text |
|---|---|
| 1 | `Publish job status could not be confirmed. Call publish_job_status_read with {}` (use a real registered id of 20+ characters from Tovu; note it in the test) |
| 2 | `Declared inputs: viewport (optional), fullPage (optional), dismissCookieBanners (optional)` |
| 3 | `media_asset 'marquee-suit-2024-final-v2' was not found` |
| 4 | `{"executionId":"3f2b8c1e-5d47-4a8e-9b1c-0d6e7f8a9b10","toolId":"theme_write_file","pendingToolId":"theme_edit_file"}` |
| 5 | `tool "agent_plugin_google-login__start_sign_in" timed out before it finished` (an id **not** in the launch list) |

Report the table. S7 is scoped from it.

## Red-first (each must fail by showing `[redacted]`)
`core/src/text/__tests__/diagnostic-vocabulary.unit.test.ts` and `mcp/.../masked-identifiers.unit.test.ts`:
- rows 2, 4, 5 come out unchanged when the vocabulary is built from: the called tool's schema (row 2), the envelope's named id fields (row 4), the envelope's `details.toolId` (row 5);
- row 3 comes out unchanged only when the slug is a scalar argument of the same call (OD-3 = yes);
- **still masked** (these must pass before and after): a `Bearer` token; `apiKey: <40 chars>`; a 36-character UUID that appears only in free text; a schema-named property's **value**; an argument whose schema property has `writeOnly: true` or `format: "password"`; a vocabulary entry glued to a suffix (`dismissCookieBannersXYZ…`); an "id field" whose value does not match its shape (a 60-character token in `details.jobId`).

## Change
1. `core/src/text/diagnostic-vocabulary.ts` (new, pure, ≤ 150 lines): `buildDiagnosticVocabulary` as in DESIGN M4. Schema walk depth ≤ 6, at most 512 names; envelope fields by fixed name with shape checks (`ERR-…`, UUID, tool-id charset ≤ 128).
2. `SanitizeTextOptions`: keep `diagnosticToolIds` as the one "trusted whole tokens" input (do not add a second option); the builder's output is what callers pass.
3. `mcp/src/server/tool-protocol.ts`: build the vocabulary once per call from the tool index, the called tool's wire schema, and (in the handler-error path) the envelope fields carried on `DaemonHttpError` (S8 adds `code`/`requestId`; until then read what exists). OD-3 = yes: pass the validated arguments and the schema as `echoed`.
4. Do not change `OPAQUE_TOKEN_RE`, `isIdentifierShaped` or any credential rule.

## Acceptance
- Rows 2, 4, 5 (and 3 under OD-3) readable end to end through `handleToolCall` with a fake daemon; all "still masked" cases green.
- A property test: for random 20 to 64 character tokens that are in none of the sources, output always contains `[redacted]`.
- `pnpm guard`, `pnpm typecheck`, `core` and `mcp` tests green; counts recorded.
