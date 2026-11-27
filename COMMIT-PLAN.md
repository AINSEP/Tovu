# COMMIT-PLAN — ext-w1 Tovu cutovers

Dispatch: revised r62t-w3-ext-w1 with every OPUS fix and owner override. Tovu HEAD `de82d1bff9633cb2b1d76185f51b57d2bd7e0855`; paired Jini branch `codex/w3-ext-w1j` resolves to `fe7bf8cc1c0ee977f5b82af8bf3889f4bc5917f6`. Jini handoff read from `o-w3-ext-w1j/w3-ext-w1j.md`; paired source reviewed with read-only git show. No release pin changes.

Programmer persona loaded from `/Users/la/Programming/Tovu/AI-Dev-Shop/agents/programmer/skills.md`. Clone intentionally has no AI-Dev-Shop or ADS-memory architecture chapters; consulted the original workspace chapters 13 and 14. Dispatch is the approved specification, file map and boundary checklist. Only listed host bindings and callers may change; preserve behavior and comments, delete old owners after repointing. No tests/builds/installs/type-checks/linters or mutation runs permitted. Tests are written/retained first; cloud verification remains pending. Git is read-only; coordinator commits these logical units.

## 1. T02 — consume core declarations

Completed: introspection and external MCP dependency declarations, preserving host rationale. Agent-pause remains with ext-crp per override.

Tests first: `tool-registrations.oauth-origin.unit.test.ts`, “device grant works without an inferred redirect origin” (added); `database-schema-state-route.test.ts`, “unavailable lineage reports unknown” (retained assertions, exact pin name). Mutations: `require-origin-for-device-grant`, `unknown-becomes-in-sync`.

Files:
- `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.external-mcp-save.integration.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.external-mcp.test.ts`
- `apps/website/src/assistant/tool-registrations.ts`
- `apps/website/src/features/database/adapter.sqlite.ts`
- `apps/website/src/features/database/repo.memory.ts`
- `apps/website/src/features/database/tool-registrations.ts`
- `apps/website/src/features/external-mcp/__tests__/access-save.integration.test.ts`
- `apps/website/src/features/external-mcp/__tests__/probe-card-binding.unit.test.ts`
- `apps/website/src/features/external-mcp/__tests__/save-refusals.unit.test.ts`
- `apps/website/src/features/external-mcp/__tests__/unit/static-token-setup.unit.test.ts`
- `apps/website/src/features/external-mcp/__tests__/unit/tool-registrations.oauth-origin.unit.test.ts`
- `apps/website/src/features/external-mcp/deps.ts`
- `apps/website/src/features/external-mcp/external-mcp-host-copy.ts`
- `apps/website/src/features/external-mcp/tool-registrations.ts`
- `apps/website/src/platform/db/sqlite/database-introspection-adapter.sqlite.ts`
- `apps/website/src/server/__tests__/routes/database-schema-state-route.test.ts`
- `apps/website/src/server/routes/types.ts`
- `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`

## 2. T03 — database memory and transfer cutover

Completed: Jini memory doubles/confirmation UI; destination-store-host owns the original scope, vault ID, metadata parsers, address normalization, memory class and singleton. Existing constructor ABI retained in its actual binding class. Frozen parity snapshot still loads its historical owner.

Test first: `destination-store.migrated.test.ts`, “legacy non-default destination opens with unchanged scope” (retained migrated fixture and assertions under exact pin name). Mutation `change-persisted-owner-key`. Retained metadata-only lastRun tests.

Files:
- `apps/website/src/assistant/__tests__/tool-registrations.database-recovery.test.ts`
- `apps/website/src/features/credential-safety/__tests__/probes-and-cards.test.ts`
- `apps/website/src/features/database-transfer/__tests__/confirmation-policy.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/confirmation-ui.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/destination-exchange.l240.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/destination-store.authorize.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/destination-store.l240.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/destination-store.migrated.test.ts`
- `apps/website/src/features/database-transfer/__tests__/destination-store.sqlite.test.ts`
- `apps/website/src/features/database-transfer/__tests__/tool-registrations.faults.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts`
- `apps/website/src/features/database-transfer/__tests__/transfer-snapshots.unit.test.ts`
- `apps/website/src/features/database-transfer/confirmation-ui.ts`
- `apps/website/src/features/database-transfer/destination-exchange.ts`
- `apps/website/src/features/database-transfer/destination-store-host.ts`
- `apps/website/src/features/database-transfer/destination-store.ts`
- `apps/website/src/features/database-transfer/tool-registrations.ts`
- `apps/website/src/features/database/__tests__/unit/repo.memory.unit.test.ts`
- `apps/website/src/features/database/repo.memory.ts`
- `apps/website/src/platform/db/__tests__/parity/parity-harness.ts`
- `apps/website/src/server/__tests__/admin-database-timeline-route.test.ts`
- `apps/website/src/server/__tests__/routes/database-schema-state-route.test.ts`
- `apps/website/src/server/__tests__/routes/recovery-restore-routes.test.ts`
- `apps/website/src/server/routes/route-deps/credentials-deps.ts`
- `apps/website/src/server/runtime/composition/memory-deps/route-deps/members-media-newsletter-forms.ts`
- `apps/website/src/server/runtime/composition/memory-deps/route-deps/model-comments-plugins.ts`
- `apps/website/src/server/runtime/composition/memory-deps/slices/repos.ts`
- `apps/website/src/server/runtime/composition/site-deps/route-deps-assistant-mcp.ts`
- `apps/website/src/server/runtime/composition/site-deps/route-deps-comments-plugins.ts`

## 3. T05 — consent host bindings

Completed: request/SQL owners imported from Jini; local public-path resolver binds the same base and reserved segments; each SQL construction supplies the two original tables. Route assembly unchanged.

Tests first: `published-policy.unit.test.ts`, “public consent ignores draft content during concurrent publish” (retained real SQL fixture; change publication pointer between head and revision read); `tools.test.ts`, “reserved path refuses before local rendering” (added renderer tripwire). Mutations `public-read-uses-draft`, `omit-reserved-segments`.

Files:
- `apps/website/src/features/consent/host-bindings.ts`
- `apps/website/src/server/runtime/composition/modules/consent.ts`
- `apps/website/src/features/consent/__tests__/fixture.ts`
- `apps/website/src/features/consent/__tests__/service.test.ts`
- `apps/website/src/features/consent/__tests__/tools.test.ts`
- `apps/website/src/features/consent/__tests__/unit/published-policy.unit.test.ts`
- `apps/website/src/server/runtime/composition/memory-deps/route-deps/assistant-and-site.ts`
- `apps/website/src/server/runtime/composition/site-deps/route-deps-assistant-mcp.ts`
- `apps/website/src/features/consent/request.ts`
- `apps/website/src/features/consent/revisions.repo.ts`

## T06 — STOPPED before cutover

The verified-importer claim does not match this tree: `platform/db/__tests__/parity/parity-harness.ts:86` dynamically loads `features/external-mcp/external-mcp-repo.ts`, then line 170 constructs `mods.mcpRepo.SqlExternalMcpServerRepo(kernel)`. Neither importer appears in T06. Deleting the SQL owner as specified would break the current parity harness; adapting that live MCP construction is outside T06's named file map. No production changes made. Removed the draft write-miss test so no partial T06 remains. The named mutation `bind-vault-outside-repo-transaction` remains pending with this stopped sheet.

## T07 — STOPPED on paired API mismatch

J08's `packages/user-management/src/identity/permission-list-tool.ts` exports `Deps`, `derivedRisk`, `buildRegistrations`, and `contributeIdentityPolicyListPermissionsTools`, but no `catalog`. T07 explicitly repoints the catalog consumers `assistant/__tests__/tool-registrations.contracts.test.ts:17` and `features/identity/__tests__/permission-list-tool.test.ts:5` to this owner. The first maintains an independent catalog assertion; rebuilding it from registrations would erase that assertion, and adding a new factory/export or duplicating the catalog is not sheeted. No T07 changes made. Pins and mutations `wire-unfenced-session-save` / `split-identity-transaction-lock` remain pending.

## 4. T10 — form destination bindings

Completed: Jini connection/destination ports receive real credential metadata/open callbacks and the unchanged host key-store, registry, settings and product copy. No plugin-loader or key-store move.

Tests first: `delivery.security.test.ts`, “wrong adapter cannot open a shared credential and current label must still resolve the original ID” (real vault, open spy, changed-label read); `port.unit.test.ts`, “empty forms retain the existing key without generating another” (retained fixture plus generation counter). Mutations `bind-unfiltered-credential-open`, `generate-on-empty-forms`.

Files:
- `apps/website/src/server/runtime/composition/form-delivery-deliverer.ts`
- `apps/website/src/features/form-destinations/__tests__/deliver.unit.test.ts`
- `apps/website/src/features/form-destinations/__tests__/delivery.security.test.ts`
- `apps/website/src/server/runtime/composition/form-submissions.ts`
- `apps/website/src/features/form-destinations/__tests__/port.unit.test.ts`
- `apps/website/src/features/form-destinations/__tests__/byho-compat.unit.test.ts`
- `apps/website/src/features/form-destinations/port.ts`
- `apps/website/src/features/form-destinations/connection-port.ts`

## 5. T13 — media provider credentials cutover

Completed: Jini registrar/key patch with host metadata/save callbacks, canonical registry already on deps, credential-field rule, copy and secure-card transport. `provider-card-host.ts` retains exact Tovu URI, payload/form, safe-error whitelist and warning sink. No generation runner/registry/environment/route changes.

Test first: `providers-tools.test.ts`, “an invalid secret-looking reason fails before a card opens and an approved save returns no key” (direct preflight, real exchange/save fixture). Mutation `skip-credential-free-reason-check`. Retained single-provider save tests over the real host writer.

Files:
- `apps/website/src/features/media-generation/provider-card-host.ts`
- `apps/website/src/features/media-generation/providers-tools.ts`
- `apps/website/src/features/media-generation/provider-credential-save.ts`
- `apps/website/src/features/media-generation/__tests__/providers-tools.test.ts`
- `apps/website/src/features/media-generation/__tests__/provider-credential-save.unit.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`

## 6. T14 — deploy kit host binding

Completed deploy-kit portion only per override: `host-kit-binding.ts` preserves native-fetch lookup per call, validating DNS/guarded reachability, time/sleep, AwsClient and original trace wrappers. Timeout imports go directly to Jini. No static renderer changes (ext-w2 owns that lane).

Test first: `host-kit.observability.unit.test.ts`, “one safe span per outbound operation and none for sign” (added fetch/probe/sign sequence, exact count and redaction assertions). Mutation `send-probe-without-bound-observer`.

Files:
- `apps/website/src/features/deployments/deploy-targets/__tests__/host-kit.observability.unit.test.ts`
- `apps/website/src/features/deployments/deploy-targets/__tests__/host-kit.unit.test.ts`
- `apps/website/src/features/deployments/static-publish/__tests__/adapter.plugin-targets.unit.test.ts`
- `apps/website/src/features/deployments/static-publish/__tests__/inspection.unit.test.ts`
- `apps/website/src/features/deployments/static-publish/adapter.ts`
- `apps/website/src/features/deployments/static-publish/inspection.ts`
- `apps/website/src/features/deployments/static-publish/verify.ts`
- `apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts`
- `apps/website/src/server/runtime/composition/form-submissions.ts`
- `apps/website/src/server/runtime/composition/site-deps/after-assembly-forms-search.ts`
- `apps/website/src/server/runtime/composition/site-deps/media-storage.ts`
- `apps/website/src/server/runtime/composition/site-deps/site-sharing.ts`
- `content/agent-plugin-overlays/cloudflare/__tests__/bundled-package.test.mjs`
- `content/agent-plugin-overlays/s3-compatible/__tests__/media-store.integration.test.mjs`
- `content/agent-plugin-overlays/s3-compatible/__tests__/share-hosting.test.mjs`
- `content/agent-plugin-overlays/s3-compatible/__tests__/sigv4-host-signer.test.mjs`
- `content/agent-plugin-overlays/vercel/__tests__/blob-share.test.mjs`
- `apps/website/src/features/deployments/deploy-targets/host-kit.ts`
- `apps/website/src/features/deployments/deploy-targets/host-kit-binding.ts`

## 7. T16 — screenshot tool cutover

Completed: catalog-host binds exact descriptions, limits and permission without starting a browser. Composition creates one service per contributor, keeps guarded capture and distinct site factories; Jini owns registration.

Tests first: `screenshot-queue.integration.test.ts`, “two surfaces share the queue and keep distinct site writers” (held capture plus separate writer paths); `tool-registrations.unit.test.ts`, “host permission and guarded client remain required” (deny before capture, guarded adapter refusal). Mutations `create-capture-service-per-build`, `authorize-after-capture`.

Files:
- `apps/website/src/features/web-screenshot/catalog-host.ts`
- `apps/website/src/features/web-screenshot/agent-tools.ts`
- `apps/website/src/features/web-screenshot/tool-registrations.ts`
- `apps/website/src/features/web-screenshot/__tests__/screenshot-queue.integration.test.ts`
- `apps/website/src/features/web-screenshot/__tests__/tool-registrations.unit.test.ts`
- `apps/website/src/assistant/__tests__/image-viewer-batching.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`

## 8. T17 — web tool cutover

Completed: Jini owns registration/risk, host composition supplies catalog, permission, reader, diagnostics callbacks and full ports. One host limiter/clock/observer per contributor; site callbacks override only guarded HTTP/render effects. Original rate-limit values and why-comment moved to `features/web/policy.ts`. Product reader and user agent unchanged.

Tests first: `tool-registrations.unit.test.ts`, “one per-host budget is shared across the two assistant surfaces” and “refusals never fall back to a raw client” (exercise real contributor installation, two registrations share 30 calls; global raw-fetch spy). Mutations `bind-limiter-per-call`, `fallback-to-default-client-on-refusal`. Existing find-beyond-output-window and negative tests retained with explicit host ports; webDerivedRisk imports repointed.

Files:
- `apps/website/src/features/web/policy.ts`
- `apps/website/src/features/web/tool-registrations.ts`
- `apps/website/src/features/web/__tests__/tool-registrations.unit.test.ts`
- `apps/website/src/features/web/__tests__/web-page.unit.test.ts`
- `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`

## Left / excluded sheets

- T01 and T15: REJECT, superseded by ext-crp and ext-w2 respectively. No approval/grant or artifact-provider cutover attempted.
- T04: skipped; J05 stopped (universal parser reaches node:path). Site-sealer excluded by override.
- T08: skipped; J09 stopped (member sign-in reaches node:crypto).
- T09: skipped; J10 stopped (content-hash owner reaches node:crypto).
- T11: skipped; J12 stopped, required ext-crp confirmation builder absent.
- T12: skipped; J13 stopped, required ext-crp builder absent; ext-w2 capture-clear binding also remains outside this set.
- T06 and T07: stopped on the exact importer/API mismatches recorded above.
- All J sheets: read-only, never built in this Tovu dispatch. No BUILDER: OPUS or NEEDS-OPUS T sheets were provided. Every built sheet's OPUS-REVIEW remains pending.
- All six NOT-SHEETED candidates left intact: media-import, asset destinations/copy, image transform, media generation runner and recovery registrar. No already-moved source recreated.

## Final diff review / handoff

Nine new host characterization cases; four existing pins retained/strengthened under their exact sheet names. Every named mutation for completed sheets is recorded with its logical commit above. Existing integration, wire, negative and digest assertions retained. No package manifest, export, changeset, API baseline or release-pin change.

Removed during final review: the stopped T06 draft test; unnecessary test-only media-card-host import (the single-provider tests bind the real writer directly); a temporary screenshot-fixture `ports` return field; two local test convenience callbacks; redundant object-literal spreads introduced during API repointing. No extra production helpers, types, guards, retries, options or fallbacks added.

Validation is static only: paired Jini source/exports reviewed, all named callers read/repointed, scoped current-source specifier searches and diff review. Historical source-root imports remain only for frozen parity data. `git diff --check` passes. No test/build/install/type-check/lint/mutation execution, no baseline claim, no commits or pushes. Cloud test execution and Opus mutation review are the next assignees. Do not claim these changes verified green.

Final inventory: 76 modified tracked files, 15 deleted owners, 5 created source files, plus this plan. All 15 consumed Jini subpaths have exports on the paired branch. Tovu and paired Jini heads were rechecked unchanged at handoff.
