P9K-VERIFY-B1B3 PARTIAL: exhaustive seam importer inventories, per-symbol AdminKit resolution, and exact i18n key ownership NOT-CHECKED

**No B1–B3 implementation step is both OK and MECHANICAL.** The two Tovu repoint sheets assume completed Jini moves that are only partly present. B2 also has two writers to the core manifest, and B3 has overlapping writers in both repositories.

I reached the 160 Git lookup limit. Tovu resolved to `41e948ee4a`. The named Jini merge-13 ref resolved locally to `7c4ee7881`, and the requested `e4e3bf175` was also available. I checked the pinned commit directly for the disputed destinations, manifests, route and kit interfaces, and seam definitions. Those checks agreed with the named ref on the findings below. The system Git launcher failed on startup, so I checked executable locations and used the installed Git binary directly. Repository reads stayed within the requested trees. No files were changed and no tests, builds, installs, or type-checks ran.

## B1

### `T-post-1.T` — BLOCK | MECHANICAL

All eight Tovu sources and the named tests exist. Jini has only `posts/post-before-save.ts` and `posts/slug.ts`, both exported, plus the landed `posts/__tests__/slug.test.ts`. The sheet would delete six files without complete replacements.

- Keep `post-tool-schemas.ts`, `tiptap-doc-schema.ts`, `tiptap-block-schema.ts`, `tiptap-text-schema.ts`, and `contracts/core/tool-metadata/post.ts` until their Jini counterparts land. The Tiptap block and text schemas can stay private to the eventual Jini doc schema. The metadata file imports `ToolApprovalPolicy` at line 2, so its Jini move needs the approval-policy seam resolved.
- `features/post/rendering.ts:1` only re-exports `MAX_SLUG_LENGTH` and `SLUG_FORMAT_PATTERN`. Drop the proposed `./posts/rendering` export. In `server/inbound/public-http/http/site/render/doc/doc-nodes.ts:12` and `server/inbound/public-http/http/site/render/widgets/social-entries.ts:5`, change the existing named import’s specifier to `@jini-ai/cms/posts/slug`. Paths in this list are relative to `apps/website/src/`.
- Delete the `BeforeSaveHookPort` re-exports in `features/post/index.ts` and `features/post/contracts.ts` when the landed helper is repointed. The index export is at line 12 on merge-12 and line 11 on a tonight branch. Add `import type { BeforeSaveHookPort } from "@jini-ai/cms/posts/post-before-save";` at each site below. In mixed imports, retain the other names on the existing import.

| Missing importer | Line |
|---|---:|
| `features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts` | 27 |
| `features/publish-content/tool-deps.ts` | 11 |
| `features/publish-content/tool-registrations.ts` | 52 |
| `features/publish-content/tovu-publish-ports.ts` | 1 |
| `features/widgets/__tests__/integration/tool-registrations.plugin-hook-failed.test.ts` | 13 |
| `features/widgets/__tests__/tool-contract.characterization.test.ts` | 28 |
| `features/widgets/deps.ts` | 5 |
| `server/routes/types.ts` | 38 |
| `server/runtime/composition/plugin-runtime.ts` | 16 |

The named mutation asks a slug test to detect a Tiptap schema change. The existing `features/post/__tests__/agent-tools.tiptap-node-vocabulary.test.ts` is a relevant gate for the schema work.

### `SH-3` — BLOCK | MECHANICAL

Owner-held. The source-scan test pins the three credential shells. Its first assertion block requires the owner decision recorded in the sheet.

### `SEC-0` — OK | PATTERN

Owner-held, read-only parity report. The contract is in `plans/P9-extraction.md` §SEC. There is no standalone `SEC-0.md`. No implementation clearance derives from this row.

### `RT-K1-0.J` — FIX | PATTERN

The proposed new files are free. The core barrel backing `@jini-ai/core/contracts/server` is `packages/core/src/contracts/server.ts`. Add the CMS limit as a universal `./admin-http/limits` entry in `exports` and `jini.entries`.

- `settings/shared.ts:157–173` stores `response.status` and `response.body`. The T sheet reads `e.status` and `e.body`. Preserve the source shape and have the T handler read `e.response.status` and `e.response.body`. The source inherits `Error.name`. Spell out the expected name in the new test before changing it.
- `maxBodyBytes` is implemented in the Web Request handler at `packages/core/src/contracts/server/json-route.ts:199`. Express `mountJsonRoute` has its own spec type and no corresponding body-limit check. The Tovu Express mounts must retain their existing `rejectOversizedJsonBody` middleware until the host mounting recipe preserves that behavior. Name `apps/website/src/server/inbound/shared/__tests__/body-size-limit.test.ts` as a stay gate.
- Express sends returned parse and handler failures through `sendApiError` at `packages/http-kit/src/adapter.ts:65,108`. `onError` handles exceptions at line 122. The flat-envelope recipe needs to cover every legacy rejection path, including parse failures.

### `A-K2-0a.J` — FIX | PATTERN

Use the combined `A-K2-0.md` sheet and the existing `@jini-ai/admin/react/kit` export. The test is `packages/admin/src/react/__tests__/kit.unit.test.tsx`. Required component and hook additions also touch `packages/admin/src/react/testing-kit.tsx:6,82,129` and `packages/admin/src/forms/react/__tests__/harness.tsx:18`. The host assignment is already identified at `apps/admin/src/integrations/jini-kits.ts:27`.

The appendix lists UI `useT` as a 0a value and chat `useT` as a 0b value. They use different provider contexts. Give the chat hook a distinct facade and update its named imports explicitly. Put plain values and callbacks in the injected fields that match how callers use them. For example, a dictionary cannot be exposed through `slot()`, which renders a component.

### `K4-i18n-common.J` — FIX | PATTERN

`apps/admin/src/lib/i18n-common.ts` exists and the proposed Admin destination is free. Add `./core/i18n-common` to both `exports` and `jini.entries`. Specify the split at the dictionary-entry level, including entries assembled into `COMMON_I18N` near line 710. The count of product-bearing lines does not identify the keys and locale overrides that move.

Name the new `packages/admin/src/core/__tests__/i18n-common.test.ts` cases and the specific generic key each mutation exercises. The existing Tovu parity and dictionary gates belong in the T half.

## B2

### `C-platform-html-1.T` — BLOCK | MECHANICAL

All six Tovu sources and the named tests exist. Jini already exports `./html/site/slug` and `./html/site/source-edits`. The slug test is already in `packages/cms/src/html/site/__tests__/slug.test.ts`. The other four planned files and exports are absent.

- Keep `menu-render.ts`, `published-webmcp-strip.ts`, and `safe-url.ts` and their callers in Tovu. `plans/P9-data/stays-in-tovu.md:409–411` explicitly classifies them as host policy. The older sheet would also rename the rendered `data-tovu-menu-*` attributes and the WebMCP script marker.
- Keep `escape.ts` and `__tests__/escape.test.ts` in Tovu pending a verified Jini destination and export. There is no `@jini-ai/cms/html/site/escape` on either checked Jini base.
- The landed slug and source-edit repoints can be scoped separately. At `apps/website/src/features/pages/tool-registrations.ts:33` on ex-export, use `import { toSlug } from "@jini-ai/cms/html/site/slug";`. The sheet gives line 32. Coordinate the edit to `features/post/slug.ts` with the revised `T-post-1.T`, which deletes that file.
- Keep the Tovu safe-href characterization and the navigation and WebMCP tests with the policy they cover. The proposed mutation of `safe-url.ts` is outside the narrowed move, and `escape.test.ts` does not cover it.

### `RT-K1-0.T` — BLOCK | PATTERN

The sheet’s STOP applies. Settings currently awaits `deps.settingsReady` in `settings/shared.ts:215`, retains route-specific error mappings at line 227, and includes permission details in 403 responses at lines 220–222. The proposed shared port only accepts `workspaceId` and `authorize`, and its generic failure hook would replace settings-specific mappings. Preserve the settings readiness, authorization, and error hooks in Tovu composition before changing this mount. The public hook also needs the existing response mapping. `reportServerFailure` reports the failure and supplies an error ID.

With `rejectSettingsRequest` removed from the local module, add `import { rejectRoute } from "@jini-ai/core/contracts/server";` and rename calls at the following sites. Keep other bindings on their existing imports. Paths are relative to `apps/website/src/server/inbound/admin-http/routes/`.

`settings/clear.ts:13`, `settings/get-effective.ts:2`, `settings/get-raw.ts:2`, `settings/register-definitions.ts:20`, `settings/reset.ts:4`, `settings/set.ts:15`, `system/assistant-owner-grant.ts:4`, `system/assistant-permanent-deletes.ts:4`, `system/assistant-subagents.ts:9`, and `settings/shared.ts` itself.

### `K4-i18n-common.T` — FIX | PATTERN

In `apps/admin/src/lib/i18n-common.ts`, add `import { ADMIN_COMMON_I18N } from "@jini-ai/admin/core/i18n-common";` after the Jini export lands. Keep the current locale set and per-locale merge precedence, and keep present Tovu consumers on `COMMON_I18N`. Name the stay gates explicitly under `apps/admin/src/`: `__tests__/unit/app-i18n.unit.test.ts` and `lib/__tests__/{i18n-common,untranslated-copy,dictionary-lookup-sinks,version-conflict}.unit.test.ts`. Tie the mutation to a key one of those tests actually asserts.

### `A-K2-0b.J` — FIX | PATTERN

Use `A-K2-0.md`, the existing `./react/kit` entry, and `react/__tests__/kit.unit.test.tsx`. A required `chat` group also affects `react/testing-kit.tsx:129–136`, the forms harness, and the Tovu host kit. Resolve the `useT` collision with 0a. `createMidRunMessagePoster` and `createTypedAnswerPoster` are factories, so the sheet needs to identify their injected call sites. A component facade or a context lookup from a plain factory call would change how those callers work.

### `K4-seam-1.J` — FIX | PATTERN

- `apps/website/src/contracts/core/tool-metadata/approval-policy.ts:10–11` exports only the two types. The sheet’s instruction to leave values behind cannot apply to this file. Remove the old file after its importers are repointed. Keep the owner-policy rationale and the rule vocabulary with the code that owns them. `ToolApprovalClass` is already expressed through core’s `ToolApprovalMetadata['class']`.
- `packages/daemon/src/surface-exchanges.ts:458` defines `AssistantSurfaceDeps`. Its member can use the existing core `SurfaceExchangeStore` contract at `packages/core/src/surface-exchanges.ts:141`. Keep the daemon store implementation in daemon.
- `packages/integrations/src/webhooks/ports.ts:19,31` defines the two webhook ports. Core already owns namesakes in `contracts/vault/ports.ts:10,17`. Check compatibility before choosing the existing contracts or specifying a real seam. For example, core’s `activeKey` requires an object, and the webhook port calls it with zero arguments. A blind substitution changes the call contract.
- The proposed site subpaths are free. The sheet still needs the exact Jini importer and stay-test list, including mixed type/value consumers. Serialize the core manifest and baseline edits with `K4-seam-2.J`.

### `K4-seam-2.J` — BLOCK | PATTERN

The sheet points to a barrel. `HttpRequest` and `HttpResponse` already come from `@jini-ai/core/primitives`. `EgressPolicy` already comes from `@jini-ai/core/contracts/runtime`. The actual Tovu `HttpClientPort` is in `apps/website/src/platform/http/ports.ts` and uses positional `send(request, options)`. Core’s `packages/core/src/primitives/http.ts:65` uses `send({ request }, options)`. Tovu’s `platform/http/client.ts` explicitly adapts the two.

Use the existing exports for the three identical contracts. The sheet needs an explicit owner-rule-compliant migration for the fourth, including callers and guards, before the proposed `./contracts/site/platform-http` export can be approved. `K4-seam-1.J` and this step both claim `packages/core/package.json`.

## B3

### `K4-seam-1.T` — BLOCK | PATTERN

The Jini contract decisions above must land first. Replace the sheet’s importer counts with exact file, line, and name lists. It currently reports zero Tovu importers for two subpaths with live users. For example, in `apps/website/src/features/fs-files/__tests__/asset-tool-fixture.ts:10`, split out `import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";` once that export lands. Keep `createSurfaceExchangeStore` on the daemon import. `features/publish-content/destination-credential.ts:3` and `server/routes/route-deps/credentials-deps.ts:6` also need the resolved vault types.

**Serialize with `K4-seam-2.T`.** I found at least 19 overlapping Tovu files. Examples under `apps/website/src/` include `features/publish-content/destination-credential.ts:2–3`, `features/source-control/store.ts:7,19`, `features/source-control/tool-registrations.ts:16,18,43`, and `server/routes/route-deps/credentials-deps.ts:6,9`.

### `K4-seam-2.T` — BLOCK | PATTERN

The J half leaves the `HttpClientPort` ABI unresolved. Inventory direct `platform/http/ports` imports as well as `platform/http/index` and relative forms. For an already-resolved example, `apps/website/src/server/runtime/composition/__tests__/web-fetch-own-origin.integration.test.ts:8` can use `import type { HttpRequest } from "@jini-ai/core/primitives";`. At mixed imports, retain host constructors, error classes, and named egress policies on the host import. Name the `platform/http/__tests__` stay gates and the affected caller tests. The exact full importer inventory remains unchecked.

### `K4-contracts-core-5.J` — BLOCK | PATTERN

All 16 sources exist and the proposed destinations and manifest keys are free. Their dependency on `K4-seam-1` is real. K4 resolves the type edge only. The sheet also moves owner policy and product copy verbatim. Examples include the `page-control` approval rule in `frontend-control.ts`, the `plugin-enable` approval rule and `tovu-plugin` keyword in `plugin-runtime.ts`, and the permanent-delete approval declarations. `plugin-runtime.ts` is a static declaration with no existing args object through which to pass the keyword. Apply K3 STOP there and keep the policy on the host side while proceeding with eligible files.

The future T sheet lists two edits and misses the catalog aggregator. In `apps/website/src/contracts/core/tool-metadata/index.ts`, each approved move changes its line to `import { toolMetadata as <existing alias> } from "@jini-ai/core/contracts/site/tool-metadata/<basename>";`. The omitted lines are `21–26` for forms, frontend-control, fs-files, identity, files-copy, and image-transform, `28–31` for mail-status, media, media-generation, and media-import, `33` for navigation, `35–37` for pages, permanent-delete, and plugin-runtime, `40` for recovery, and `45` for observability. Keep the existing catalog golden at `apps/website/src/assistant/__tests__/moved-tools.golden.test.ts`. The proposed identity mutation should target a field in the exported declaration, since the file exports data.

**Serialize the core manifest and baseline edits with `K4-seam-3.J`.**

### `A-K2-0.J` — FIX | PATTERN

Reclassify `UNREACHABLE_RETRY_DELAYS_MS`, `DEFAULT_NOTIFICATIONS_PREFERENCES`, and `LOCAL_BACKUP_PRINCIPAL_ID` from 0c to the injected value work. Each is a runtime constant in Jini. The CSS appendix has three rows, while the combined sheet identifies only two specifiers. Reconcile all three with the host mount sites. Use the existing `./react/kit` entry. The sheet still needs per-symbol export, structural compatibility, and host-wiring checks for the restated types.

### `K4-seam-3.J` — FIX | PATTERN

`Tracker` is at `packages/diagnostics/src/observability/tracker-types.ts:44`. The proposed destination and key are free. Moving only that declaration leaves unresolved references to `CaptureEvent`, `TrackerErrorContext`, `TrackerSpan`, and the request, agent, and operation span options. Specify the full type dependency set and keep core-owned observability imports relative within core. `TrackerProviders` and diagnostics implementations can stay with diagnostics.

List the internal diagnostics users and tests that import `./tracker-types.js`. The Jini observability barrel exports those types at present, and consumers importing both a moved type and a runtime value such as `createNoopTracker` need split imports. The Tovu importer inventory belongs in the T sheet. The batch must serialize this step’s manifest and baseline writes with `K4-contracts-core-5.J`.

### `A-adm-other-1.J` — FIX | PATTERN

All 14 sources and both move tests exist. The 24 named stay tests also exist. The targeted module-specifier sweep matched the 95 listed repoints and the two imports in the moving tests. I found no existing destination or export collision.

- Keep `features/authentication/model/provider-schemas.ts` and its test in Tovu under the vendor-neutral rule. The runtime catalog hardcodes Google, Facebook, and LinkedIn schemas and credential hints at lines 29–86. The existing `apps/website/src/features/deployments/deploy-targets/__tests__/vendor-exceptions.json:34` already records this catalog as pending owner direction.
- The three CSS files need browser CSS exports, using the pattern already in `packages/admin/package.json` for `./themes/default/admin.css`, with published assets and side effects declared. A `types`/`import`/`default` JavaScript export triple does not resolve a CSS asset. Keep the `--tovu-site-preview-bg` dependency in host styling or explicitly account for its host definition and consumers before changing the token in `features/email/email.css:72`. Any moved class renames need the matching JSX edits in the same delivery.
- `email-tabs-i18n.ts` exports dictionary data. The named mutation targets an exported function that does not exist, and `provider-schemas.unit.test.ts` covers a different module. Use `apps/admin/src/features/email/__tests__/email-i18n.unit.test.ts` for an asserted dictionary entry.

## OK and MECHANICAL execution order

**Empty.** The landed post and HTML subpaths support smaller mechanical repoints once their sheets are corrected. The current batch rows do not isolate those changes.
