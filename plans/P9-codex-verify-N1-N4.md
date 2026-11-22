**Do not dispatch N1–N4 as written.** The pinned trees match Tovu `748c032db` and Jini `6b8e0d48a`. All 918 cited importer rows I checked match their source lines, and the listed move sources and tests exist. The sheets still miss barrel consumers, several moves carry Tovu policy, and two retirements conflict with the pinned release rule. Verification was read-only. Builds, tests, type-checks, and mutation results remain unverified.

Paths starting with `features/`, `contracts/`, `platform/`, `assistant/`, or `server/` below are relative to `apps/website/src/`. When splitting an import, retain its other bindings on the original line.

## N1

### SH-1 — FIX

The four sources are shells and their Jini subpaths exist. The 123 direct rows match. Delete the forwarded bindings at `features/form-destinations/index.ts:22` and `features/member-login/index.ts:8–9` and add these missing consumers to the sheet.

- `import { MemberLoginError } from "@jini-ai/user-management/server"` at `server/inbound/public-http/routes/commerce/purchase.ts:7` and, under `server/inbound/public-http/routes/members/`, `__tests__/member-proof-bodies.unit.test.ts:4`, `__tests__/oidc-callback-params.unit.test.ts:4`, `__tests__/unit/h4-oidc.unit.test.ts:7`, `me.ts:8`, `oidc-callback.ts:5`, `oidc-start.ts:4`, `oidc-verify-email.ts:3`, and `unlink-identity.ts:3`. At `oidc-deps.ts:6`, use `import { MemberLoginError, type LoginProvider, type MemberLoginOutcomeCode } from "@jini-ai/user-management/server"`.
- Under `server/runtime/composition/`, add `import type { … } from "@jini-ai/cms/forms"` with the bindings shown: `__tests__/agent-plugin-connections.vertical-slice.test.ts:37` (`FormDestinationKit`), `__tests__/form-delivery-deliverer.unit.test.ts:20` (`FormDestinationKit, FormDestinationRegistry`), `__tests__/form-delivery-oauth.fixture.ts:20` and `__tests__/form-delivery-oauth.integration.test.ts:27` (`FormDestinationKit`), `__tests__/form-delivery-vertical-slice.fixture.ts:14` (`FormDestinationModule, FormDestinationPage, RemoteFormSubmission`), `__tests__/form-delivery.security.test.ts:12` (`FormDeliveryConnectionPort, FormDestinationKit`), `__tests__/form-submissions.test.ts:12` (`FormDestinationPage, FormDestinationRegistry`), `form-delivery-deliverer.ts:3` (`FormDeliveryConnectionPort, FormDestinationKit, FormDestinationRegistry`), and `form-submissions.ts:9` (`FormDestinationAddress, FormDestinationRegistry`).

Preserve the aliases in the entries and taxonomy shells, including `Clock as ClockPort`, `IdGenerator as IdGeneratorPort`, and the tool type aliases. Run SH-2 after SH-1 lands. Both edit `server/routes/types.ts` at lines 111 and 87 respectively.

### SH-2 — FIX

The 17 sources and their Jini subpaths exist. The three database-transfer adapters contain host behavior. At `features/database-transfer/tool-registrations.ts:23`, keep `databaseTransferPlanStore as DEFAULT_PLAN_STORE` local and add `import type { DatabaseTransferPlanStore } from "@jini-ai/db/tools"`. At line 24, keep `createPsqlPostgresTarget` local and add `import { InvalidConnectionStringError, type PostgresTargetPort } from "@jini-ai/db/transfer"`. Preserve the adapter’s `applicationName: "tovu-database-transfer"`, the singleton, transfer naming, exclusions, and local table-catalog bindings. Apply the same split to the sheet’s test imports.

Remove the forwarded bindings from the media, analytics, navigation, and core barrels. Add these missing consumers.

- `import { MAX_DOCUMENT_BYTES as TOVU_MAX_UPLOAD_BYTES } from "@jini-ai/cms/media"` at `features/media-generation/tool-registrations.ts:37`, `features/media-import/__tests__/import-local-file.test.ts:14`, `features/media-import/fetch-image.ts:71`, `features/media-import/tool-registrations.ts:24`, `server/__tests__/routes/publish-content-blob-get.test.ts:13`, and `server/__tests__/routes/publish-content-blobs.test.ts:11`. Under `server/inbound/admin-http/routes/`, apply it at `media/__tests__/replace.test.ts:9`, `media/__tests__/upload.test.ts:12`, `media/import-url.ts:6`, `media/replace.ts:5`, `media/upload.ts:5`, `publish-content/blob-get.ts:7`, and `publish-content/blob-put.ts:3`. Use the same alias for the seven direct shell imports. The Jini export is 50 MiB.
- `import type { NormalizedHit } from "@jini-ai/analytics"` at `features/analytics/__tests__/recent-hits-tool.test.ts:4`, `features/analytics/tool-registrations.ts:11`, and `server/__tests__/routes/analytics-recent-hits.test.ts:9`. Use the same subpath for `DeviceClass, HitKind, NormalizedHit` at `platform/db/repos/analytics-sink.ts:5` and `server/inbound/admin-http/routes/analytics/recent-hits.ts:7`, for `AnalyticsSiteConfig` at `server/__tests__/routes/analytics-ingest.test.ts:11`, and for `IngestBeacon, IngestContext` at `server/inbound/public-http/routes/site/analytics-ingest.ts:7`.
- `import { MenuVersionConflictError } from "@jini-ai/cms/navigation"` at `features/navigation/__tests__/trash-aware-memory-menu-repo.test.ts:4` and, under `server/inbound/admin-http/routes/menus/`, `__tests__/assign-location.pins.unit.test.ts:6`, `__tests__/menus-route-failures.unit.test.ts:11`, `assign-location.ts:5`, and `update-tree.ts:10`.

### C-contracts-core-1.J/.T — FIX

Apply §1’s STAYS rule. Keep `approval-i18n.ts`, `assistant-content-guidance.ts`, `fs-folder-recovery.ts`, `consent-refusal.ts`, and `credential-store.ts` for product copy, assistant instructions, or product routes. Keep `custom-credential-categories.ts` for the host’s credential taxonomy, `redirect-tables.ts` for host-owned persisted names, `publish-history-list-limit.ts` for host list defaults, and `public-page-security-headers.ts:22–45` for the host’s report-only CSP and provider allowlist. Keep `gated-mutations/ports.ts` for the host DB/restore boundary and `gated-mutations/token.ts:97–100` for the host’s token format and default TTL. Drop their J exports and T rewrites. The security-header and token tests stay in Tovu. The token test also imports a Tovu site-directory fixture at line 1.

The remaining move is `extension-capability-vocabulary.ts`, `post-author.ts`, and `gated-mutations/watermark.ts`. Watermark can stay private in Jini. Move `watermark.unit.test.ts` to `contracts/site/gated-mutations/__tests__/`, change its line 4 to `../watermark.js`, and use `import { test } from "vitest"`. Use `stampWatermark`’s transaction guard as the named mutation. The unit suite directly tests that guard.

### C-contracts-core-2.J/.T — FIX

Keep `runtime-mode.ts` and `runtime-mode.unit.test.ts`. The source reads `TOVU_RUNTIME_MODE` and the test pins it. Keep `theme-ids.ts` for the `basic` → `tovu-theme` migration, `theme-slots.ts` for legacy static-theme defaults, and `settings-vocabulary.ts` for the host publishing allowlist and labels. Keep `site-key-state.ts` with `apps/admin/src/lib/__tests__/site-key-state-parity.unit.test.ts:22`. That test reads the Tovu source off disk, so a specifier rewrite cannot preserve it.

The remaining exports are `request-facts`, `soft-delete`, and `strict-base64`. Use `JINI_REQUEST_FACTS`, `jiniRequestFacts`, and `RequestFacts` consistently across the request adapter, readers, and tests. Mark `./contracts/site/strict-base64` as `node` because it uses `Buffer`. Move `strict-base64.unit.test.ts` with `../strict-base64.js` and use its decode guard for the mutation. Add these T rewrites after deleting the old barrel exports.

- `import { isTrashed } from "@jini-ai/core/contracts/site/soft-delete"` at `contracts/core/commands/__tests__/post-delete-reverter.test.ts:12`, `features/email-templates/operations.ts:10`, `features/pages/html-document-store.memory.ts:8`, `features/pages/tool-registrations.ts:13`, `features/seo/index.ts:15`, and `server/inbound/admin-http/routes/themes/explore.ts:52`.
- `import { decodeStrictBase64 } from "@jini-ai/core/contracts/site/strict-base64"` at `server/inbound/admin-http/routes/media/replace.ts:3`, `media/upload.ts:6`, and `publish-content/blob-put.ts:4`.

### C-platform-html-1.J/.T — FIX

Move `slug.ts` and `source-edits.ts` to the listed CMS paths. Add `@sindresorhus/slugify: "^3.0.1"` to `packages/cms/package.json` dependencies and update Jini’s lockfile. The dependency is absent on the Jini base. Mark both exports `universal`.

Retire `escape.ts` by sending its callers, including `platform/html/menu-render.ts:3`, to the existing `@jini-ai/core/text` exports. Both existing functions already have the optional argument. Omit the duplicate CMS export. Keep `escape.test.ts` in Tovu and use `import { escapeHtml, escapeXml } from "@jini-ai/core/text"` at line 4. Move the HTML `slug.test.ts` and use its ASCII corpus test for the mutation by changing `decamelize: false` to `true`.

Keep `menu-render.ts`, `published-webmcp-strip.ts`, and `safe-url.ts` in Tovu. Navigation and WebMCP tests pin the first two files’ product markers, including `features/navigation/__tests__/html-render.test.ts:11` and `features/webmcp/__tests__/published-html.pins.test.ts:32`. `safe-url.ts` carries the YouTube-specific embed policy. Drop their proposed exports and importer rewrites.

### D-site-export-1.J/.T — FIX

Move `ports.ts` and `public-origin-policy.ts` to the listed DevOps paths as `universal` entries. `ports.ts` exports types, so its named mutation is impossible. Use a Jini characterization test for `exportPublicOrigin` that distinguishes configured public evidence from development evidence. Keep `static-copy-policy.unit.test.ts` and `features/site-backup/__tests__/static-copy.unit.test.ts` in Tovu.

Retain `export-failure-summary.ts` as the local call-shape adapter for this batch. The existing Jini function takes `{ report }` and the Tovu wrapper takes `report`. A later cutover must account for `features/site-export/site-exporter.ts:24`, `index.ts:9,16`, `__tests__/index.test.ts:4,9` and its identity assertion at line 26, and `__tests__/site-exporter.test.ts:23`. The planned direct rewrites alone leave that chain behind.

### C-presentation-1.J/.T — FIX

The proposed CMS path is free. Mark the export `universal`. Use `../index.js` for the same-package presentation import in the moved source and `../../index.js` in the relocated test. The named test exercises the missing-row fallback.

Add `import { resolveActiveThemeId } from "@jini-ai/cms/presentation/site/active-theme-id"` at `assistant/__tests__/tool-registrations.theme-duplicate.test.ts:12`, `assistant/__tests__/tool-registrations.theme-set-active.test.ts:16`, `features/post/template-options.ts:2`, `features/theme/__tests__/preview-switcher.integration.test.ts:9`, `theme-list-active.test.ts:6`, `verify-active-theme.test.ts:9`, `features/theme/preview-switcher-tools.ts:9`, `set-active-theme-tool.ts:17`, `trash-theme-tool.ts:7`, and `server/inbound/admin-http/routes/widgets/preview-render.ts:4`. Under `server/runtime/composition/`, also add it at `__tests__/create-site-app-theme-override.integration.test.ts:8`, `memory-deps/route-deps/publish-export.ts:16`, `memory-deps/route-deps/trash-and-content.ts:15`, `peer-site-reads.ts:34`, `site-deps/route-deps-assistant-mcp.ts:34`, `site-deps/route-deps-comments-plugins.ts:35`, and `visitor-page-targets.ts:5`.

## N2–N4

### C-contracts-core-3.J/.T — BLOCK

`tool-metadata/approval-policy.ts:3–11` encodes the owner’s confirmation categories and rules. Seven other files in the step import it, so keeping it in Tovu blocks their verbatim move. `widget-tables.ts:1–2` names a Tovu-owned persisted table, `scheduled-publish.ts:38–55` contains the owner’s date-display policy, and `gated-mutations/gateway.ts:118–128` wraps Jini with the host’s token format and TTL. It also imports the local token and restore contracts. Keep the source and test pairs in Tovu. The gateway’s first exported function has no `if`.

### C-contracts-headless-1.J/.T — BLOCK

`assistant-permanent-deletes-policy.ts:4–39` embeds admin routes, owner defaults, and assistant instructions. The T step also breaks `contracts/headless/__tests__/index.barrel.unit.test.ts:4,14–20`, which compares the entire barrel against the owner modules. `contracts.ts` is type-only, so the named branch mutation cannot run.

The sheet misses `apps/admin/src/integrations/chart-providers/chart-registry-port.hooks.ts:2–3` through `@tovu/headless`. A cleared chart move would import `AdminChartProviderSnapshot` as a type from `@jini-ai/core/contracts/headless/chart-providers`, and remove the redundant type re-export with its consumers repointed. Other omitted consumers include `assistant/component-catalog-query.ts:4` and `server/runtime/composition/chart-providers.ts:5` for that type, `features/agent-plugins/install-tool.ts:11` and `features/plugin-runtime/install-source.ts:4` for install contracts, and `server/inbound/admin-http/http/posts.ts:2` and `http/presentation.ts:2` for the headless response types. The test contract and barrel cutover need a revised sheet before dispatch.

### P-publish-content-ui-1.J/.T — BLOCK

`sections.ts:31–44` is Tovu’s publishable-entity policy and UI copy. `ui/__tests__/index.test.ts:21,26–32` pins the section bindings in the barrel, and the first exported function has no `if`. The sheet also omits three consumers of the alias. If the boundary is cleared later, the import lines would be:

- `apps/admin/src/features/publish-content/publish-scope.ts:1` — `import { publishSectionForEntityTypes, type PublishSection } from "@jini-ai/admin/publish-content/sections"`
- `apps/admin/src/features/publish-content/hooks/use-publish-section-button.hooks.ts:1` — `import { publishSectionById, type PublishSectionId } from "@jini-ai/admin/publish-content/sections"`
- `apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts:34` — split out `import { publishEntityTypePluralLabel } from "@jini-ai/admin/publish-content/sections"`

A later move would also need the root Tovu `@jini-ai/admin` dependency and lockfile entry for the website consumers, plus matching Jini `jini.entries` and `typesVersions` keys.

### RT-1 — BLOCK

Jini `scripts/injection-exceptions.json:2,5–8` freezes this package until the next major. The retirement sheet also misses `.changeset/core-storage-contract.md:12`, the lock importer at `pnpm-lock.yaml:1419`, and `scripts/__tests__/injection-exceptions.q2.test.ts:20,35–37,45–46`, which copies the package and requires its edges. The package’s own `loads-without-driver.test.ts:15,21` imports the entry in fixtures. Those tests retire with the package. No surviving runtime importer surfaced on either pin. The release window and stale release references must be resolved together.

### RT-2 — BLOCK

The same next-major freeze covers `infra → db` at `scripts/injection-exceptions.json:2,4`. The Q2 test copies both shim files, so RT-1 and RT-2 also share that test and the exception ledger. At retirement, remove `db/core` and `db/sqlite` from `typesVersions`, remove stale `jini.neutralEntries` and DB peer metadata, and preserve `./events/outbox`. `./db/core` currently targets `dist/db/driver/index.*`. The two DB barrel tests and the Tovu outbox integration test exist.

### RT-3 — FIX

Delete the exact `./commerce/server` export at `packages/agent-plugins/package.json:265–269` and the matching `jini.entries` row at line 100. Keep the commerce manifest and wildcard payload exports. Remove `@jini-ai/commerce` from `jini.optionalPeers`, `peerDependencies`, and `peerDependenciesMeta`, remove the fourth debt row at `scripts/injection-debt.json:7`, and update the Jini lockfile.

In `packages/agent-plugins/commerce/__tests__/bundled-package.test.mjs`, keep the dormant payload assertions at lines 6–12, remove the retired-entry assertions at lines 13–15 and the entry-only test blocks at lines 17–35. Line 29 dynamically imports the deleted subpath. No Tovu runtime import needs a rewrite.

### T-theme-1.J/.T — BLOCK

CMS declares neither `handlebars` nor `liquidjs`. The entry-list rename breaks `entry-list-render-layouts.test.ts:7–10` and `entry-list-render.test.ts:47–65`. The latter also exercises the Tovu rendering integration and belongs in Tovu. `liquid-allowlist.test.ts` reads Tovu’s `development/fixtures/theme-archive` and `validation/__tests__/references.test.ts` uses `t.after` three times. Both stay under the move contract. The named Handlebars mutation cannot be proved by a test that only checks entry-list CSS.

The missing T consumer at `server/inbound/admin-http/routes/themes/explore.ts:46` would need `import { MAX_THEME_FILE_BYTES, readThemeFile, ThemePathError } from "@jini-ai/cms/themes/site/theme-files"` and `import { ORIGINAL_LAYOUT_MISMATCH_REFUSAL } from "@jini-ai/cms/themes/site/theme-file-errors"` if those files are cleared.

### C-contracts-core-6.J/.T — BLOCK

All 14 modules import C-contracts-core-3’s `ToolApprovalPolicy`. Moving them would require a Jini → Tovu edge or a policy change. `site-guide.ts:8–9` carries Tovu guidance and `sites.ts:6–46` carries site-management tool policy. Keep the site-evidence metadata with the host feature as well. The named `site-guide-tools.test.ts` exists. The proposed `widgets.ts` mutation has no branch to negate because the module exports a metadata object.

### C-contracts-core-7.J/.T — BLOCK

`gated-mutations/composition.ts:68–94` grants the host’s seeded owner instance-wide permissions, and line 5 imports the gateway held by C-contracts-core-3. Keep the composition and `composition.unit.test.ts` together in Tovu. If revisited, the T half also overlaps C-contracts-core-3.T on the composition module and ten callers.

### T-post-1.J/.T — FIX

Keep `contracts/core/tool-metadata/post.ts` in Tovu with its approval-policy dependency. Drop its proposed CMS export and T rewrites. Replace the planned `rendering.ts` move with deletion of that two-line shell. At `server/inbound/public-http/http/site/render/doc/doc-nodes.ts:12` and `server/inbound/public-http/http/site/render/widgets/social-entries.ts:5`, use `import { MAX_SLUG_LENGTH, SLUG_FORMAT_PATTERN } from "@jini-ai/cms/posts/slug"`.

In the Jini copy, `posts/slug.ts` imports `../html/site/slug.js`. Keep `tiptap-block-schema.ts` and `tiptap-text-schema.ts` private, with `tiptap-doc-schema.ts:4–5` continuing to import them relatively. Move `features/post/__tests__/slug.test.ts` and use its long-slug assertion to prove removal of the collision-suffix reservation. The named target, `tiptap-block-schema.ts`, exports constants.

Delete the `BeforeSaveHookPort` forwards from `features/post/index.ts:12` and `features/post/contracts.ts:2`. Add `import type { BeforeSaveHookPort } from "@jini-ai/cms/posts/post-before-save"` at `features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts:27`, `features/publish-content/tool-deps.ts:11`, `tool-registrations.ts:52`, `tovu-publish-ports.ts:1`, `features/widgets/__tests__/integration/tool-registrations.plugin-hook-failed.test.ts:13`, `features/widgets/__tests__/tool-contract.characterization.test.ts:28`, `features/widgets/deps.ts:5`, `server/routes/types.ts:38`, and `server/runtime/composition/plugin-runtime.ts:16`.

### XC-1 — BLOCK

The picker imports and calls runtime functions at all four React import lines. A type move leaves the dependency intact. `packages/chat/src/core/agents-port.ts:6–18` already defines the policy and failure ports, but `core/durable-runs/ports.ts:60–74` has no `RecoveryPorts.agents`. A required port change also touches the Tovu caller at `server/runtime/composition/modules/run-finalizer/recovery-binding.ts:50`, plus Jini’s `recover.test.ts`, `recover-boundaries.test.ts`, and `missing-resume.test.ts` under `packages/chat/src/server/durable-runs/__tests__/`. The sheet needs that wiring and a test list before it can run as a coordinated change.

## Batch corrections

Every retained Jini export needs a matching `jini.entries` key. The engine-boundary guard requires exact coverage. Core-1.J and Core-2.J share both `packages/core/package.json` and `api-baseline/jini-ai__core.json`. Land them in sequence or produce the baseline from their combined tree.

| Batch | Dispatch after the fixes above |
|---|---|
| N1 | SH-1 → SH-2. C-contracts-core-1.J → C-contracts-core-2.J. C-platform-html-1.J and D-site-export-1.J in parallel. |
| N2 | C-contracts-core-1.T, D-site-export-1.T, and C-presentation-1.J → .T. |
| N3 | C-contracts-core-2.T and RT-3. Hold the out-of-scope C-contracts-core-4/5 J steps because their declared prerequisite, Core-3.J, is blocked. |
| N4 | C-platform-html-1.T and T-post-1.J after the Jini CMS slug export lands. Keep T-post-1.T in its later slot. It shares `features/post/slug.ts` and two public-render callers with the HTML cutover. |

§5’s inventory checks found **551 `tovu` hits across 200 Jini files**, versus 547 across 197 in the plan. `apps/site-chat` is outside `AREAS` as the plan states. The repository’s Option C report supports retaining the 23 admin React kit imports and the separate `needs` import. The original owner decision remains unverified. For S6b, Tovu re-exports the Jini delivery and subscription repository ports, and the local envelope store’s `save` and `find` signatures match Jini’s. Regenerating and diffing `areas-and-steps.json` remains unverified because the plan generators write files.
