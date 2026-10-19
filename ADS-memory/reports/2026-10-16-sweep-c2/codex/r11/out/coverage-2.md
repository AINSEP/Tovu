TDD(Direct): Loaded the TDD persona for coverage test design.

Extended existing suites and added optional filesystem/schema ports. No tests, typechecks, builds, coverage, package scripts, commits, or git mutations were performed. Whitespace review passed.

**CHANGED FILES:**

```text
/Users/la/Programming/Tovu/apps/website/src/contracts/headless/plugin-install-source.ts
/Users/la/Programming/Tovu/apps/website/src/contracts/headless/__tests__/plugin-boundaries.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/database-transfer/table-catalog.ts
/Users/la/Programming/Tovu/apps/website/src/features/database-transfer/__tests__/table-catalog.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/external-mcp/__tests__/unit/save-form.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/identity/__tests__/tool-registrations.human-confirm.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/newsletter/__tests__/delivery-tools.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/newsletter/__tests__/tool-registrations.model-facing-errors.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/settings/__tests__/publish-content.round-trip.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/sites/__tests__/site-admin.unit.test.ts
```

**PER FILE:** These are statically targeted paths; coverage remains unmeasured.

| Source | Tests added for |
|---|---|
| `external-mcp/save-form.ts` | Explicit and empty-string prefill precedence, token-environment fallbacks, `static_env`, and credential-free forms. |
| `database-transfer/table-catalog.ts` | Missing exports, unsupported defaults, literal/SQL defaults, identity modes, composite keys, unnamed indexes, unique constraints, foreign-key action fallbacks, and chat ordering. |
| `identity/tool-registrations.ts` | Invalid-input guidance, omitted schema requirements, missing deletion targets, assignment details, owner refusals, transaction failures, ISO-only clocks, and contribution metadata. |
| `headless/plugin-install-source.ts` | Source validation branches, replacement flags, unavailable/oversized attachments, missing/local files, byte-limit boundaries, and growth between stat/read. |
| `settings/publish-content.ts` | Invalid/local URLs, reference filtering, missing/ineligible definitions, apply-time refusals, and omitted values written through the ledger. |
| `sites/site-admin.ts` | Token parsing/checking/sealing paths, storage failures, real default adapters, and supervisor capability refusals. |
| `newsletter/tool-registrations.ts` | Update field fallbacks, status filtering, explicit subscription source, both mail-off drivers, capability changes, and abandonment after contact lookup. Existing suites already exercise send-log views. |
| `site-guide/contracts.ts` | No tests added: the file contains only erased TypeScript declarations. |

**UNREACHABLE:** Under current catalog, repository, and dependency invariants:

- `database-transfer/table-catalog.ts:66–67`: Drizzle supplies unique-column and unique-constraint names.
- `database-transfer/table-catalog.ts:136`: Current schema exports are all Drizzle tables; rejection arms cannot occur.
- `identity/tool-registrations.ts:98`: Equal-ID comparison requires duplicate IDs within a repository result.
- `identity/tool-registrations.ts:228`: The fixed Jini user-create catalog supplies its description.
- `sites/site-admin.ts:249`: Its caller already returns when `restartNow` is false.

These branches remain unchanged for owner disposition.

**NOT DONE:**

- Verified 100% coverage awaits the locked verifier.
- `sites/site-admin.ts:167`’s missing-sealer fallback remains untested; reaching it requires removing the port after the earlier guard.
- `site-guide/contracts.ts:2–25` has no runtime behavior to execute; its reported line coverage needs instrumentation review.
