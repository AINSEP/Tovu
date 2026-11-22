DONE
SH-1 and SH-2 are implemented. Of the 21 shells, 18 are gone. Three (`custom-credentials/sets/{host,store,vault-repo}.ts`) are held back as **BLOCK**, because a test reads them off disk (see SH-2). The 3 database-transfer adapters stay, as Codex's FIX requires, with only host values left in them.

# P9 lane SH: delete the Tovu re-export shells (ex-sh)

- **Plan:** Tovu `origin/plan/whats-left-1122` (`plans/P9-extraction.md` §1 and lane SH, `plans/P9-steps/SH-shells-1.md`, `plans/P9-codex-verify-N1-N4.md`). Where Codex's SH-1/SH-2 FIX notes differ from the sheet, the FIX notes were followed.
- **Bases:**
  - Tovu `origin/integ/merge-12-2026-11-22` = `41e948ee4`, branch **`codex/ex-sh-tovu`**
  - Jini `origin/integ/merge-12-2026-11-22` = `6b8e0d48a`, branch **`codex/ex-sh-jini`**
- **Setup** (as in `combine-12-tovu.md`):
  - Node 24.22.3 (`/opt/node24`), pnpm 10.33.2
  - Jini: `pnpm install --frozen-lockfile` 0, `pnpm --no-bail -r build` 0
  - Tovu: `npm ci --ignore-scripts` 0 in root, admin, desktop and site-chat. `link-jini.mjs` 0. `packages/contracts` tsc 0. `packages/sdk` build 0.
  - No PostgreSQL in this container, so the `*.postgres.test.ts` files are red on base and on the branch alike.

## Pushed commits

| repo / branch | SHA | what |
|---|---|---|
| Tovu `codex/ex-sh-tovu` | `42fa489e0` | SH-1: delete the 4 shells and the forwarded barrel lines; repoint importers |
| | `be4cc83c6` | SH-1: form-destinations comments point at `@jini-ai/cms/forms`; why-comment debt for the 5 deleted shell headers |
| | `c25f04287` | SH-2: delete the shells, strip the adapters and barrels, repoint importers |
| | `a8d1b7e47` | SH-2: restore the 3 custom-credentials shells (BLOCK, see below) |
| | `86008b31a` | SH-2: move the substantive shell headers to their Tovu consumers; debt for pointer-only headers |
| | (this report) | `cloud-results/ex-sh.md` |
| Jini `codex/ex-sh-jini` | `c984e9dc` | comment-only: moves the rationale from the deleted host `path-containment.ts` onto `resolvePathWithin` (`packages/platform/src/fs/strict-containment.ts`), with a patch changeset `p9-sh-path-containment-comment.md` |

## Method

- Importers were rewritten with a TypeScript-AST script. It resolves relative paths, `#src/*` and `.js` specifiers to the shell, and maps each binding to the Jini specifier and original name the shell forwarded.
- When a statement needed only a new specifier, only the specifier text was replaced. 217 of the 262 static statements were handled this way.
- Statements whose bindings come from more than one module were split. Non-shell bindings stay on the original line.
- Aliases were preserved, for example `AgentToolDefinition as EntriesAgentToolDefinition`, `Clock as ClockPort` and `MAX_DOCUMENT_BYTES as TOVU_MAX_UPLOAD_BYTES`.
- Dynamic `import()` calls, `import("…")` types and `import type * as` namespaces were changed by hand, specifier only.
- No assertion changed. Tests changed only on import lines or `import()` specifiers.
- No re-export shell, layer or port was added. No `_optional` pad was touched.

## SH-1

**Files deleted (shell → Jini source):**
- `apps/website/src/features/entries/index.ts` → `@jini-ai/cms/entries`, `@jini-ai/core/primitives`, `@jini-ai/core`
- `apps/website/src/features/taxonomy/index.ts` → `@jini-ai/cms/taxonomy`, `@jini-ai/core/primitives`, `@jini-ai/core`
- `apps/website/src/features/form-destinations/types.ts` → `@jini-ai/cms/forms`
- `apps/website/src/features/member-login/types.ts` → `@jini-ai/user-management/server`

**Barrel lines deleted** (Codex FIX):
- `features/form-destinations/index.ts:5–22`, the 16 forwarded types
- `features/member-login/index.ts:8–9`

**Importers repointed:**
- **135 static import statements in 121 files.**
  - By Jini specifier: cms/entries 53, cms/taxonomy 29, cms/forms 29, user-management/server 24, core 1.
  - 15 statements were split, for example `oidc-deps.ts` → `import { MemberLoginError, type LoginProvider, type MemberLoginOutcomeCode } from "@jini-ai/user-management/server"`, exactly as Codex wrote it.
- **7 more by hand:**
  - 6 dynamic `import()` calls in `tool-registrations.widgets-authorization.test.ts:136`, `admin-widgets-routes.test.ts` ×4 and `mediawidget.integration.test.ts:60`
  - 1 `import("…").LoginProvider` type in `plugin-embed-render.test.ts:81`
- **Codex's missing consumers are all covered:**
  - `purchase.ts:7`, the 8 member-route files and their tests, and `oidc-deps.ts`
  - the 9 `server/runtime/composition/**` form-destination files, which get `import type … from "@jini-ai/cms/forms"`
  - `server/routes/types.ts`, at the taxonomy import (line 107–111)
- Two comments pointed at the deleted `./types.ts`: `form-destinations/index.ts:3` and `registry.ts:13`. Both now name `@jini-ai/cms/forms`.

**Tests:**
- **Moved:** none. This is a Tovu-only deletion.
- **Run:** 90 files, each alone under a 15-minute watchdog, 3 in parallel. These are the 67 changed test files, every test under `features/{entries,taxonomy,form-destinations,member-login}`, the member-route tests and the composition `form-*` tests.
  - **85 green.**
  - **5 red, all red at base with the same failure counts:**
    - `entries/…/repo.compare-and-set.postgres` and `unreadable-owner-entries-repair.postgres`: no Postgres
    - `member-login/providers` 1 and `ready-providers` 4: the google-login bundled preset is missing
    - `resolve-html-page-embeds.integration` 1: the widget test-title prefix
- **Mutation:** none. The plan says "Mutation: none (no behaviour)" for lane SH. Imports now bind the same Jini objects that the shells forwarded.

## SH-2

**Files deleted (shell → Jini source):**
- `apps/admin/src/lib/standing-draft-recovery-message.ts` (no importers) → `@jini-ai/ui/panel-kit`
- `contracts/core/external-mcp-access.ts` → `@jini-ai/core/contracts/hosted-mcp`, `@jini-ai/mcp/federation/hosted`
- `contracts/core/external-mcp-auth.ts` → the same two
- `contracts/core/path-containment.ts` → `@jini-ai/platform/fs`
- `contracts/core/upload-limits.ts` → `@jini-ai/cms/media` (`MAX_DOCUMENT_BYTES as TOVU_MAX_UPLOAD_BYTES` at every site; the Jini value is 50 MiB)
- `features/agent-plugins/mcp-metadata.ts` → `@jini-ai/agent-plugins/lifecycle`
- `features/analytics/types.ts` → `@jini-ai/analytics`
- `features/database/timeline.ts` → `@jini-ai/db/tools`
- `features/navigation/menu-version-conflict-error.ts` → `@jini-ai/cms/navigation`
- `features/recovery/recovery-orchestrator.ts` (`export *`) → `@jini-ai/db/recovery/recovery-orchestrator`
- `features/webhooks/types.ts` → `@jini-ai/integrations/webhooks`, `@jini-ai/platform/secrets`

**Barrel lines deleted** (Codex FIX):
- `contracts/core/index.ts:6` (`resolvePathWithin`)
- `features/media/index.ts:136` (`TOVU_MAX_UPLOAD_BYTES`)
- `features/analytics/index.ts:8–37` (28 types)
- `features/navigation/index.ts:139` (`MenuVersionConflictError`)

**Adapters** (Codex FIX): only the Jini re-export lines were removed. These stay unchanged:
- **`plan-store.ts`:** the `databaseTransferPlanStore` singleton stays.
- **`postgres-target.ts`:** the local `createPsqlPostgresTarget` with `applicationName: "tovu-database-transfer"` stays.
- **`copy-engine.ts`:** `DEFAULT_TRANSFER_SCHEMA`, `TRANSFER_MARKER_TABLE`, `TRANSFER_NAMING`, `countPartialExclusions` and the local `./table-catalog.js` bindings stay.
- **`tool-registrations.ts:23–25`:**
  - `import { databaseTransferPlanStore as DEFAULT_PLAN_STORE } from "./plan-store.js"` plus `import type { DatabaseTransferPlanStore } from "@jini-ai/db/tools"`
  - `import { createPsqlPostgresTarget } from "./postgres-target.js"` plus `import { InvalidConnectionStringError, type PostgresTargetPort } from "@jini-ai/db/transfer"`
- **Test imports:** the same split in 4 files (`confirmation-policy`, `tool-registrations.faults`, `tool-registrations.postgres`, `transfer-snapshots`).

**Importers repointed:**
- **127 static statements in 119 files**, 30 of them split or aliased.
  - By Jini specifier: agent-plugins/lifecycle 33, cms/media 20, mcp/federation/hosted 17, analytics 15, webhooks 9, db/tools 9, cms/navigation 9, db/recovery/recovery-orchestrator 7, platform/fs 4, core/contracts/hosted-mcp 2, db/transfer 2.
  - This includes every consumer Codex added: the 13 `TOVU_MAX_UPLOAD_BYTES` sites, the 7 `NormalizedHit`/analytics sites and the 5 `MenuVersionConflictError` sites.
- **By hand, specifier only:**
  - `timeline.unit.test.ts:88`: `import("@jini-ai/db/tools")`
  - `restore-flow-ordering.integration.test.ts:69`: `import("@jini-ai/db/recovery/recovery-orchestrator")`, which keeps exactly `confirmRestore/executeRestore/planRestore`
  - `hosted-mcp-type-pins.test.ts:14–15`: `import type * as TAccess/TAuth from "@jini-ai/core/contracts/hosted-mcp"`
- **Comment pointers to deleted paths** were updated in the text only:
  - `composer-files.hooks.ts:37`
  - `database-api.types.ts:1`
  - `theme-asset-dirs.ts:44`
  - `theme-static-assets.integration.test.ts:208`
  - `change-sets/revert.ts:60`
  - `recovery/restore.ts:19`
  - `egress-policies.ts:45,197`
  - `site-exporter.ts:301`
  - `adapter.sqlite.ts:36`
- **Why-comments moved with the code:**
  - The `upload-limits.ts` owner-policy note went to the `TOVU_MAX_UPLOAD_BYTES` import in `routes/media/upload.ts`.
  - The `mcp-metadata.ts` rationale went to `agent-plugins/capability-projection.ts`.
  - The `analytics/types.ts` model notes (sidecar rows, no PII at rest) went to `features/analytics/index.ts`.
  - The `webhooks/types.ts` ADR-036 block went to `platform/db/repos/webhook-repo.ts`.
  - The standing-draft note went to `PostAutosaveRecoveryBanner.tsx`.
  - The `resolvePathWithin` rationale went to Jini `strict-containment.ts`. Jini's code there is identical to what the comment explains.
  - Pointer-only shell headers were added to `development/why-comments-debt.json` with reasons: 8 for SH-2 and 5 for SH-1.

**BLOCK: `custom-credentials/sets/{host,store,vault-repo}.ts`.**
- The sheet listed no importers. In fact `extract-s8-c1-second-host.test.ts:9–15` imports all three.
- `extract-s8-c1-source-scan.test.ts:9,11,22–28` also imports `store.ts` and `vault-repo.ts`, and reads all three files off disk, asserting that each shim imports only `@jini-ai/integrations/credentialed-http/sets`.
- Deleting them would need more than an import-line test edit (STOP 5). This is the same shape as Codex's `site-key-state` ruling.
- The shells are restored unchanged. To retire them, the owner must decide to drop that test's first block.

**Residual re-export lines (follow-up, not shells).**
- `features/external-mcp/contracts.ts:1` and `external-mcp-store.ts:1` re-exported names from the deleted `external-mcp-access.ts`.
- Following the sheet's importer rows (Codex lists only the media, analytics, navigation and core barrels for stripping), only their specifiers were repointed, to `@jini-ai/core/contracts/hosted-mcp` and `@jini-ai/mcp/federation/hosted`.
- Stripping them would also break `hosted-mcp-type-pins.test.ts:83`, which pins `T.ExternalMcpAccessSnapshot` through the `contracts.js` namespace. That is a test edit beyond the import line.

**Tests:**
- **Moved:** none.
- **Run:** 150 files, the same way as SH-1. These are the test files changed by SH-2 plus every test under `features/{database-transfer,database,recovery,navigation,analytics,custom-credentials}` and `external-mcp/__tests__/h1a`.
  - **142 green.**
  - **8 red, each with the same failing-test count at base (`41e948ee4`):**
    - `agent-plugins/federate-mcp.unit` 4, `tw2-L224-characterization.unit` 1, `bundled-deploy-package.unit` 6 (`jini/` vs `tovu/` id)
    - `database-transfer/copy-engine.postgres` 14, `tool-registrations.postgres` 7, `navigation/repo.compare-and-set.postgres` 2 (no Postgres)
    - `webhooks/tool-contract.characterization` 2
    - `webhook-delivery-worker.shutdown` 1
- **Admin vitest** (comment-only edits): `skill-composer-routing.unit` and `use-timeline-section.unit`, 2 files, 34 tests, all green. No admin test imports `PostAutosaveRecoveryBanner`.
- **Mutation:** none (no behaviour change, as the plan says for lane SH).

**Jini verification** (`codex/ex-sh-jini`, comment plus changeset only):
- `pnpm --filter "@jini-ai/platform..." build` 0, platform `typecheck` 0
- `vitest run src/fs/__tests__/strict-containment.test.ts`: 7/7
- `pnpm api:check` 0 (40 packages, 680 entries; no surface delta, so `api:update` was not needed)
- `pnpm guard` 0

## Gates (Tovu; exit code and findings vs base)

| gate | base `41e948ee4` | after SH-1 | after SH-2 (`86008b31a`) |
|---|---|---|---|
| typecheck | 0 | 0 | 0 |
| typecheck:tests | 0 | 0 | 0 |
| admin tsc | 0 | 0 | 0 |
| check:boundaries | 0 | 0 | 0 |
| check:complexity | 0 | 0 | 0 |
| check:hooks | 0 | 0 | 0 |
| check:size | 1 (pre-existing) | 1, same findings | 1, same findings |
| check:why-comments | 1, 80 blocks | 1, 85 (the 5 deleted shell headers, then added to debt) | 1, **80, the same set as base** |
| check:architecture | 1: runtime-only propagation 3.06 → 3.27 | the same | the same metric, 3.06 → 3.28 (+0.01). API surface 692 → 688 and hubs 315 → 313 improved. |

## FILES-LEFT (Jini-bound files still in Tovu)

Measured with the plan's own `scan.mjs` and `plan.mjs` (moving + shells):

| tree | moving | shells | **FILES-LEFT** |
|---|---|---|---|
| base `41e948ee4` | 2,488 | 21 | **2,509** |
| after SH-1 `be4cc83c6` | 2,488 | 17 | **2,505** |
| after SH-2 `86008b31a` | 2,491 | 3 | **2,494** |

- The plan expected 2,488. The 6-file gap is the 3 BLOCKed custom-credentials shells plus the 3 database-transfer adapters, which Codex's FIX keeps in Tovu with their host constants. The scan now counts the adapters as ordinary Jini-bound files.
- "Verbatim-movable now" went from 550 to 549. A few importers now import a sibling Jini package directly, which the plan counts as an XP3 edge.
