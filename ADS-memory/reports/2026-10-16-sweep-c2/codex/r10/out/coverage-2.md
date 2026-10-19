TDD(Direct): Loaded the TDD persona for behavior-focused coverage gap tests.

**CHANGED FILES:**

- /Users/la/Programming/Tovu/apps/website/src/platform/secrets/__tests__/vault-kinds.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/vendor-credentials/__tests__/vault-adapter.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/site-backup/__tests__/tool-registrations.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/external-mcp/__tests__/unit/static-token-setup.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/external-mcp/__tests__/unit/tool-registrations.oauth-origin.unit.test.ts

**PER FILE:**

Tests target these current-source paths; execution is pending because the supplied sweep’s line numbers have shifted.

- `platform/secrets/vault-kinds.ts`: metadata validation, migration/normalization, canonical origins, peer bindings, database descriptions/run summaries, ownership restrictions, clocks/IDs, crypto-error translation and label ordering.
- `features/site-backup/tool-registrations.ts`: input validation, provider refusal mappings, credential deletion races, source-control connections/usernames, snapshot failures and limits, config fallbacks, default logging/store/jobs, folder replacement and cancellation before commit.
- `features/vendor-credentials/vault-adapter.ts`: foreign/incomplete records, hint thresholds, DTO variants, missing capabilities, envelope changes, stale probes, patch errors and service authorization/storage failures.
- `features/external-mcp/tool-registrations.ts`: origin precedence, form field mapping, credential defaults, probe outcomes, OAuth resolution, blank secrets, expiry, deletion during resolution and contributor wiring.

**UNREACHABLE:**

- `platform/secrets/vault-kinds.ts:57`: non-string additional hosts already fail Jini’s structural parser.
- `platform/secrets/vault-kinds.ts:110–111`: Jini’s vault service never invokes these derivation wrappers.
- `platform/secrets/vault-kinds.ts:126` and `features/vendor-credentials/vault-adapter.ts:14–15`: these fixed policy callbacks have no consumers.
- `features/vendor-credentials/vault-adapter.ts:67–68`: an existing null envelope is rejected before `write()`.
- `features/site-backup/tool-registrations.ts:377`: the called resolver converts every exception into the preceding typed error.
- `features/external-mcp/tool-registrations.ts:325`: validated prepared state always supplies both routing strings.
- `features/external-mcp/tool-registrations.ts:447`: every outcome reaching this projection already has a string message.
- Private default-argument alternatives also lack caller paths, including vault lines 29/71 and adapter lines 28/32/63.

These remain unchanged for the owner’s delete-or-keep decision.

**NOT DONE:**

Tests, typecheck, builds, coverage and package scripts were not run. Passing status and 100% coverage remain unverified. No commits or git-state changes were made; production source and Jini remain unchanged.
