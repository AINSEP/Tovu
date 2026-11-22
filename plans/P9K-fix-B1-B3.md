P9K-FIX-B1B3 PARTIAL: full AdminKit compatibility and the deferred surface, vault, HTTP, and diagnostics cutover inventories remain NOT-CHECKED

| Batch | Jini writers | Tovu writers |
|---|---|---|
| B1 | `RT-K1-0.J` owns the core server barrel, CMS manifest, and their API baselines. `K4-i18n-common.J` owns the Admin manifest and API baseline. | Narrowed `T-post-1.T` owns the post repoints and the post entry in the dev-lite source scan. |
| B2 | Narrowed `A-K2-0a.J` owns the Admin kit and API baseline. `K4-seam-1.J` owns the core manifest and API baseline for approval and surface contracts. | `C-platform-html-1.T` owns the HTML repoints and the HTML entry in the dev-lite scan. Narrowed `RT-K1-0.T` owns the refusal and body-cap repoints. `K4-i18n-common.T` owns `i18n-common.ts`. The 0a host assignment owns `integrations/jini-kits.ts`. |
| B3 | Narrowed `A-K2-0b.J` owns the Admin kit and API baseline. Narrowed `K4-contracts-core-5.J` owns the core manifest and API baseline. | Narrowed `K4-seam-1.T` owns the approval type repoints. The 0b host assignment owns `integrations/jini-kits.ts`. |

Use Tovu `41e948ee4a` with the named tonight branches treated as landed, and Jini pinned to `e4e3bf175`. Link each Tovu writer against its prerequisite Jini commit. Land each kit change with its paired host assignment before advancing the shared linked baseline. For manifest and baseline updates, stage only the files owned by that writer. SH-3 stays owner-held. SEC-0 runs separately. The read-only verification reached 160 targeted lookups. Tests, builds, installs, and type-checks are implementer gates.

In the sheets below, website paths are relative to `apps/website/src/` and admin paths are relative to `apps/admin/src/`, unless qualified.

### T-post-1.T

**B1.** The Jini `./posts/post-before-save` and `./posts/slug` exports, and the Jini post slug test, are landed. Delete `features/post/{post-before-save,slug,rendering}.ts` and the duplicate `features/post/__tests__/slug.test.ts`. Delete the `BeforeSaveHookPort` re-export in `features/post/contracts.ts:2`, and the slug and hook re-exports in `features/post/index.ts:10,12` (`:9,11` on ex-core). Remove the `features/post/slug.ts` entry from the source-scan list in `development/scripts/__tests__/dev-lite.test.mjs:9`.

Use `import type { BeforeSaveHookPort } from "@jini-ai/cms/posts/post-before-save";` at these sites. Retain the other bindings on mixed imports.

- `features/post/__tests__/{content-duplicate.plugin-hook-failed.test.ts:31,post.test.ts:6,tool-registrations.plugin-hook-failed.test.ts:28}` and `features/post/post-tool-deps.ts:4`
- `features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts:27`, `features/publish-content/{tool-deps.ts:11,tool-registrations.ts:52,tovu-publish-ports.ts:1}`
- `features/widgets/__tests__/{integration/tool-registrations.plugin-hook-failed.test.ts:13,tool-contract.characterization.test.ts:28}` and `features/widgets/deps.ts:5`
- `server/routes/types.ts:38` and `server/runtime/composition/plugin-runtime.ts:16`

For `features/post/post-create.ts:4` and `post-update.ts:5`, use:

```ts
import { type BeforeSaveHookPort, runBeforeSaveHook, withCoverPresentation, mergeExt } from "@jini-ai/cms/posts/post-before-save";
```

For `features/post/post-import.ts:4`, use:

```ts
import { type BeforeSaveHookPort, runBeforeSaveHook, mergeExt } from "@jini-ai/cms/posts/post-before-save";
```

For the slug repoints, retain the current bindings and use `@jini-ai/cms/posts/slug`. Sites are `apps/admin/src/features/posts/rules.ts:1` and website `features/post/{__tests__/post.derived-slug-limit.test.ts:6,agent-tools.ts:4,post-slugs.ts:2,post-update.ts:8,tiptap-doc-schema.ts:1}`. The last site is needed because the doc schema stays. In both `server/inbound/public-http/http/site/render/{doc/doc-nodes.ts:12,widgets/social-entries.ts:5}`, use:

```ts
import { MAX_SLUG_LENGTH, SLUG_FORMAT_PATTERN } from "@jini-ai/cms/posts/slug";
```

Keep `features/post/{post-tool-schemas,tiptap-doc-schema,tiptap-block-schema,tiptap-text-schema}.ts` and `contracts/core/tool-metadata/post.ts`. Resume in **B9** after the remaining `T-post-1.J` work delivers `./posts/post-tool-schemas` and `./posts/tiptap-doc-schema`, with block and text schemas private. Post metadata also needs `K4-seam-1.J` and clearance of its owner-policy declarations before `./posts/tool-metadata` can land. Drop `./posts/rendering` from the J sheet.

Keep all eight original stay tests plus the two widget hook tests and publish hook-refusal test above. In Jini `posts/slug.ts`, mutate the `"untitled"` fallback to `""`. `posts/__tests__/slug.test.ts` must go red. Use `features/post/__tests__/agent-tools.tiptap-node-vocabulary.test.ts` for the later schema move.

### SH-3

Owner-held. Keep `features/custom-credentials/sets/{host,store,vault-repo}.ts`. The owner must approve removal of the first assertion block in `features/custom-credentials/__tests__/extract-s8-c1-source-scan.test.ts`. After that decision, preserve the remaining assertions and use the three existing importer lists in `SH-shells-1.md`. No B1–B3 dispatch.

### RT-K1-0.J

**B1.** Move `settings/shared.ts:157–173` from the admin route tree to `packages/core/src/contracts/server/route-refusal.ts`. Rename the class and function to `RouteRefusalError` and `rejectRoute`. Preserve `response: { status, body }`, the inherited `name === "Error"`, the message `"settings request rejected"`, omission of absent `code` and `details`, and the optional args pad. Keep the envelope and disclosure rationale, using host-neutral wording. Add to `packages/core/src/contracts/server.ts`:

```ts
export { RouteRefusalError, rejectRoute } from "./server/route-refusal.js";
```

Write `packages/core/src/contracts/server/__tests__/route-refusal.test.ts` first. Assert the Error identity, name and message, the exact `response` for a bare 404, and the exact `response` for a 403 with `code` and permission details. Mutation is dropping `code` from the 403 body.

Move `CONTENT_ENTRY_MAX_BODY_BYTES` and its 1 MiB rationale to `packages/cms/src/admin-http/limits.ts`. Add universal `./admin-http/limits` to `exports` and `jini.entries`, using the dist triple. Update the core and CMS baselines and the shared changeset for this step.

Jini’s Web Request adapter enforces `maxBodyBytes`. Express continues to use Tovu’s `rejectOversizedJsonBody`. The Express adapter sends returned parse and handler errors through `sendApiError` and sends thrown errors through `onError`. Any later flat-envelope mount must explicitly cover both returned-error paths and thrown refusals.

### A-K2-0a.J

**B2, verified first slice.** Use the existing `@jini-ai/admin/react/kit` entry in `A-K2-0.md`. In `packages/admin/src/react/kit.tsx`, add UI `Icon` to `AdminKitComponents` with the structural props the callers use, and export it through `slot("Icon")`. Add UI `useT` to `AdminKitHooks` using the existing hook-facade pattern. `TabBarTab` is already an exported type in both kit and UI.

Put `SETTINGS_DIALOG_DICTIONARIES`, `DEFAULT_NOTIFICATIONS_PREFERENCES`, `UNREACHABLE_RETRY_DELAYS_MS`, and `LOCAL_BACKUP_PRINCIPAL_ID` in an injected values group with their runtime shapes. Bind the first two from `@jini-ai/ui` and the last two from `@jini-ai/ui/panel-kit` in the B2 host assignment. `Icon` and UI `useT` come from `@jini-ai/ui`. At future screen moves, pass plain values and callable helpers from composition into existing args or props. The dictionary is used as data, including during module initialization in `components/AssistantDock/assistant-dock-i18n.ts:1`. Preserve that initialization in host composition.

Update `react/testing-kit.tsx:6,82,129`, `forms/react/__tests__/harness.tsx:18`, and the B2 host’s `integrations/jini-kits.ts` assignment at `satisfies AdminKit`. Tests go in `react/__tests__/kit.unit.test.tsx`. Assert injected Icon rendering, the UI translator sentinel, and value identity. Mutate the translator facade to return a different translator and show the sentinel assertion fail.

The remaining 0a appendix rows move to **B5** serially with 0c. Confirm each public export and structural assignment before making its field required. In particular, use distinct fields for the two `FetchQueryProvider` implementations from `@jini-ai/ui/fetch-query` and `@jini-ai/ui/fetch-query/tanstack`. Broader per-symbol compatibility is NOT-CHECKED.

### K4-i18n-common.J

**B1.** Move the generic entries from admin `lib/i18n-common.ts` to `packages/admin/src/core/i18n-common.ts`, exporting `ADMIN_COMMON_I18N`. Move all entries of `BASE_COMMON_I18N`, `BUILT_IN_I18N` (the `"Built-in"` key), `DRAFT_RECOVERY_I18N`, and `CODE_WRAP_I18N`. From `COMMON_EXTRA_KEYS` and `COMMON_EXTRA_VALUES`, move every paired entry except the key at line 484, `"is on an older Tovu and can't overwrite these yet. Update it, then publish again."` Keep that key and its aligned value in each of the 21 locale arrays at lines 500–520 in Tovu. Remove the same index from the moved key list and every moved value row.

Preserve the assembly at lines 710–716 in this order per locale: base, `"Built-in"`, draft recovery, code wrap, generic extras. Keep the positional-index rationale and the missing-translation assertion. Add `./core/i18n-common` to Admin `exports` and `jini.entries`.

Write `packages/admin/src/core/__tests__/i18n-common.test.ts` with cases for the original 21 locales and matching generic key sets, Spanish `Save === "Guardar"`, `"Built-in"` and `"Wrap: on"` surviving assembly, and the version-conflict key from line 496 surviving the extras split. Assert the branded older-version key is absent. Mutation is deleting Spanish `Save`, which fails the pinned value and key parity cases.

### C-platform-html-1.T

**B2.** Delete `platform/html/{slug,source-edits}.ts` and `platform/html/__tests__/slug.test.ts`. Jini’s landed slug and source-edit sources match the Tovu copies, and the slug test only changes its test runner import. Remove `platform/html/slug.ts` from the source-scan list at `development/scripts/__tests__/dev-lite.test.mjs:9`. B1 already deletes `features/post/slug.ts`.

Use `import { toSlug } from "@jini-ai/cms/html/site/slug";` in:

- `apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts:16`
- `features/forms/index.ts:62`, `features/pages/tool-registrations.ts:33` (`:32` on the pinned base), `features/plugin-runtime/built-ins/content-analyzer/analyze-content.ts:8`
- `features/taxonomy/tool-registrations.ts:29`, `features/widgets/deps.ts:49`, `server/inbound/public-http/http/site/render/doc/doc-nodes.ts:5`

At `assistant/__tests__/domain-no-direct-tool-registration.boundary.test.ts:260`, use `import { toSlug as html } from "@jini-ai/cms/html/site/slug";` inside the synthetic fixture. At `features/site-backup/static-download-html.ts:4` and `features/site-export/export-html-policy.ts:3`, use:

```ts
import { attribute, editedHtml, elements, type Edit, type Element } from "@jini-ai/cms/html/site/source-edits";
```

Keep `platform/html/{menu-render,published-webmcp-strip,safe-url,escape}.ts`, `platform/html/__tests__/escape.test.ts`, and their callers. The first three implement host policy, including existing HTML markers. Escape is a host call-shape adapter to core text, and merge-13 has no proposed CMS escape entry. Revisit it in **B9** only after `C-platform-html-1.J` verifies a destination and caller ABI.

Stay gates include the boundary fixture, existing safe-href characterization, both navigation tests, `features/webmcp/__tests__/embed-annotations.test.ts`, and `features/site-export/__tests__/{download-forms-privacy.test.ts,export-html-webmcp.unit.test.ts,hosted-forms-static.unit.test.ts,static-copy-policy.unit.test.ts}`. Mutation is disabling transliteration in Jini `html/site/slug.ts`. The non-ASCII slug case must go red.

### RT-K1-0.T

**B2, refusal and cap repoints only.** Delete the local class and function from `routes/settings/shared.ts`. Add `import { RouteRefusalError, rejectRoute } from "@jini-ai/core/contracts/server";` or merge those names into the existing import. Rename the four local calls and use `error.response.status` and `error.response.body` in the `instanceof RouteRefusalError` clause.

Under `server/inbound/admin-http/routes/`, add `import { rejectRoute } from "@jini-ai/core/contracts/server";` and rename calls at `settings/{clear.ts:13,get-effective.ts:2,get-raw.ts:2,register-definitions.ts:20,reset.ts:4,set.ts:15}` and `system/{assistant-owner-grant.ts:4,assistant-permanent-deletes.ts:4,assistant-subagents.ts:9}`. Keep the other bindings in the settings imports.

Delete the cap declaration at `server/inbound/shared/body-size-limit.ts:26`. Add `import { CONTENT_ENTRY_MAX_BODY_BYTES } from "@jini-ai/cms/admin-http/limits";` in admin `routes/{email-templates/routes.ts:23,pages/create.ts:7,pages/update-html.ts:17,pages/update.ts:19,posts/autosave.ts:5,posts/create.ts:7,posts/update.ts:22,publish-content/blobs-probe.ts:7}` and `server/inbound/shared/__tests__/body-size-limit.test.ts:4`. Keep the middleware imports and mounts.

The shared admin/public mount work moves to **B8**. Keep `mountSettingsJsonRoute` and every existing settings port in Tovu. Before swapping a mount, preserve the `settingsReady` await, check ordering, 403 permission details, each route’s `errorMappings`, and the existing redacted fallback. For public routes, keep visitor response mapping with the host. `reportServerFailure` supplies a report and error ID, and the host writes the response. Require parity for returned parse failures, returned handler failures, thrown refusals, and Express middleware’s 413 before switching the corresponding mount. Run the settings stay suite, including `json-route-parity.unit.test.ts`, `json-route-fallbacks.unit.test.ts`, and `server/inbound/shared/__tests__/body-size-limit.test.ts`.

### K4-i18n-common.T

**B2, after the Jini dictionary lands.** In admin `lib/i18n-common.ts`, add:

```ts
import { ADMIN_COMMON_I18N } from "@jini-ai/admin/core/i18n-common";
```

Retain the one branded key and its original translation for every locale, as specified in the J sheet. Build `COMMON_I18N` on the original locale set, spreading the chosen Jini locale dictionary first and the host locale entry last. Keep current Tovu importers on `COMMON_I18N`. Future moved callers use `ADMIN_COMMON_I18N` for generic fallback and receive the branded copy through their existing args or props.

Stay gates under admin are `__tests__/unit/app-i18n.unit.test.ts` and `lib/__tests__/{i18n-common,untranslated-copy,dictionary-lookup-sinks,version-conflict}.unit.test.ts`. With Spanish `Save` removed in Jini, `i18n-common.unit.test.ts` must fail its cross-locale key parity assertion. Restore it before committing.

### A-K2-0b.J

**B3, verified first slice.** Under the existing `./react/kit` entry, add the `AdminKit.chat` hook and factory fields for chat `useT`, `createMidRunMessagePoster`, `createTypedAnswerPoster`, and `createA2uiActionPoster`. The host binds `useT as useChatT` and the first two factories from `@jini-ai/chat/react`, and `createA2uiActionPoster` from `@jini-ai/chat/transports/http`. Export `useChatT` as the chat hook facade. At later screen moves use `import { useChatT as useT } from "@jini-ai/admin/react/kit";`, splitting mixed imports. The appendix’s chat usages are under `components/AssistantDock/`: `AgentFailureCard.hooks.ts:3`, `AgentFailureCard.tsx:3`, `DockLeadingAccessory.tsx:1`, `FolderDropConfirmation.tsx:1`, `FolderDropError.tsx:1`, `FolderDropPathHint.tsx:1`, `FolderPathButton.tsx:1`, `MessageOverflowModal.tsx:2`, `OverflowAwareMcpUiSurfaceCard.tsx:2`, `RoutedA2uiSurfaceCard.tsx:3`, `SelectedAgentPluginTray.tsx:2`, and `SlowRunNoticeCard.tsx:1`.

The factory call sites are `components/AssistantDock/DockChatPane.tsx:37`, `lib/typed-answer-poster.ts:34` onward, and `lib/a2ui-action-poster.ts:6`. At extraction, bind factories from the host kit and pass them through the caller’s existing args or props. Preserve the posters’ required and optional argument objects, especially the host route, cookie/fetch behavior, tool ID, redaction callback and A2UI failure reporting. Plain factory calls receive the injected function directly.

Update `react/testing-kit.tsx:129–136`, the forms harness, and the B3 host assignment at `satisfies AdminKit`. In `react/__tests__/kit.unit.test.tsx`, assert distinct UI and chat translator sentinels and that each plain factory receives both args objects intact. Mutate `useChatT` to select the UI hook and show the chat sentinel fail. Remaining chat components, hooks and transports move in **B5**, after the structural props and injection sites are verified.

### K4-seam-1.J

**B2.** Add two universal core entries with manifest and baseline changes:

- `./contracts/site/tool-metadata-approval-policy` backed by `packages/core/src/contracts/site/tool-metadata-approval-policy.ts`. Import `ToolApprovalMetadata` from `../../tool-metadata-types.js`. Export `ToolApprovalClass = ToolApprovalMetadata["class"]` and `interface ToolApprovalPolicy<Rule extends string = string> extends ToolApprovalMetadata { readonly rule?: Rule }`. The six rule names and owner rationale stay with Tovu’s catalog and evaluator. Core already describes `rule` as host-owned.
- `./contracts/site/daemon-surface-exchanges` backed by `packages/core/src/contracts/site/daemon-surface-exchanges.ts`. Move the structural declaration and same-store rationale from `packages/daemon/src/surface-exchanges.ts:448–460`, with `import type { SurfaceExchangeStore } from "../../surface-exchanges.js";`. Preserve `readonly surfaceExchanges`. Core already owns that store contract. Keep the live store in daemon.

Make the surface export additive in B2 so linked Tovu builds can still use the daemon declaration. Remove the identical old declaration in the **B6** paired cutover. The Jini source sweep found no executable `AssistantSurfaceDeps` import, and `packages/daemon/src/tool-recovery/recovery.ts:375` has a doc reference to update. Stay gates are daemon `bound-confirmations`, `surface-exchange-approval-marker`, `surface-exchanges.deadlines`, and `http/__tests__/surface-{callback,restoration}` tests. For the approval mutation, change `rule?: Rule` to `rule?: never`; a type fixture assigning a named rule to a specialized `ToolApprovalPolicy` must fail.

The webhook cutover also moves to **B6**. Use core `./contracts/vault` after compatibility is established. The webhook signer only takes `Pick<KeyringPort, "deriveSigningSecret">`, but the full webhook port permits `activeKey()` and the core port requires `activeKey({})`. Keep `packages/integrations/src/webhooks/ports.ts` and its current exports until the paired migration. At `webhooks/signing.keyring.ts:3` and `webhooks/__tests__/signing.keyring.test.ts:6`, use `import type { KeyringPort } from "@jini-ai/core/contracts/vault";` when the ABI is cut over. Preserve the signer’s narrowed capability and run its existing test. Compare the sealed record shapes and AAD behavior before switching `SecretSealerPort`. Keep runtime exports and unrelated repo port types in integrations.

### K4-seam-2.J

**B7, after the explicit HTTP ABI cutover is prepared.** The original `platform/http/index.ts` target is a barrel. `HttpRequest` and `HttpResponse` already belong to `@jini-ai/core/primitives`. `EgressPolicy` already belongs to `@jini-ai/core/contracts/runtime`. Drop the proposed `./contracts/site/platform-http` manifest entry.

The outstanding contract is `HttpClientPort` in Tovu `platform/http/ports.ts`. Core takes `send({ request }, optional)` and Tovu takes `send(request, options)`. The existing bridge at `platform/http/client.ts` adapts these. Before dispatch, prepare the full caller and guard inventory and migrate the host boundary and callers together to the existing core contract. Retain the per-call redirect option, egress refusal identity and safe message, DNS pinning, response limits, user agent, and observation boundary. Keep the host port and bridge until that paired cutover. This step acquires no core manifest ownership.

### K4-seam-1.T

**B3, approval only after the B2 core entry lands.** Delete `contracts/core/tool-metadata/approval-policy.ts`. Move the owner rationale and six-rule union to `contracts/core/tool-metadata/index.ts`, beside the host catalog. At `:4`, import `ToolApprovalPolicy` from `@jini-ai/core/contracts/site/tool-metadata-approval-policy` and define `HostToolApprovalPolicy` as its specialization with the existing union. Use that specialization in `projectToolMetadata` and retain the existing `as const` declarations.

For each of these files under `contracts/core/tool-metadata/`, use `import type { ToolApprovalPolicy } from "@jini-ai/core/contracts/site/tool-metadata-approval-policy";`. Lines are `:2` except where shown:

`agent-plugins`, `analytics`, `assistant:3`, `change-sets`, `comments`, `commerce`, `consent:3`, `content-duplication`, `content-read`, `content-types`, `custom-credentials`, `database-transfer`, `database`, `deploy-ops`, `deployments`, `domain-dns`, `email-templates`, `entries`, `external-mcp`, `files-copy`, `forms`, `frontend-control`, `fs-files`, `identity`, `image-transform`, `mail-status`, `media-generation`, `media-import`, `media`, `members`, `navigation`, `newsletter`, `observability`, `pages`, `permanent-delete`, `plugin-runtime`, `post`, `publish-content`, `recovery`, `redirects`, `search`, `seo`, `server-logs`, `settings`, `site-backup`, `site-evidence`, `site-guide`, `site-inspection`, `sites`, `skills`, `source-control`, `taxonomy`, `theme`, `trash`, `visitor-tools`, `web-screenshot`, `web`, `webhooks`, `widgets`, `workspace`.

Remove the moved-type re-exports at `contracts/headless/assistant-tool-approval-policy.ts:12` and `contracts/headless/index.ts:14`. At `contracts/headless/assistant-tool-approval-policy.ts:2`, import `HostToolApprovalPolicy as ToolApprovalPolicy` from `../core/tool-metadata/index.js`. In `assistant/{assistant-tool-approval-policy.ts:2,tool-approval-policy.ts:5}`, retain runtime imports and split these type imports:

```ts
import type { ToolApprovalClass } from "@jini-ai/core/contracts/site/tool-metadata-approval-policy";
import type { HostToolApprovalPolicy as ToolApprovalPolicy } from "../contracts/core/tool-metadata/index.js";
```

Use the same core class import in `assistant/mcp-federation/{registrations.ts:4,__tests__/confirmation-policy.unit.test.ts:5}`. In `assistant/__tests__/tool-approval-policy.tw3.test.ts:4`, retain the settings value import and add `import type { HostToolApprovalPolicy as ToolApprovalPolicy } from "../../contracts/core/tool-metadata/index.js";`. Run the approval-policy tests, `assistant/__tests__/tool-metadata-projections.test.ts`, and the moved-tools golden.

**B6** owns surface and vault repoints together with their Jini cleanup. Before dispatch, complete direct and barrel importer inventories. At `features/fs-files/__tests__/asset-tool-fixture.ts:10` on the verifier’s tonight tree, and `features/source-control/tool-registrations.ts:18`, use `import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";`. Retain `createSurfaceExchangeStore` and other daemon values where used. At `features/publish-content/destination-credential.ts:3`, `features/source-control/{store.ts:7,tool-registrations.ts:16}`, and `server/routes/route-deps/credentials-deps.ts:6`, the resolved line after the vault ABI cutover is `import type { KeyringPort, SecretSealerPort } from "@jini-ai/core/contracts/vault";`. Keep the existing imports until B6. B7 starts after B6 because their Tovu write sets overlap.

### K4-seam-2.T

**B7.** First complete the inventory of direct, relative, barrel and inline imports of `platform/http/{index,ports}` and of positional `send` calls and fakes. The complete inventory is NOT-CHECKED. For the verified request-only example, at `server/runtime/composition/__tests__/web-fetch-own-origin.integration.test.ts:8`, use:

```ts
import type { HttpRequest } from "@jini-ai/core/primitives";
```

Use that subpath for `HttpResponse` as well, and `@jini-ai/core/contracts/runtime` for `EgressPolicy`. Keep host constructors, error classes and named policies on their existing imports. Change the client type and calls together after `K4-seam-2.J` clears the ABI prerequisite. Keep the `platform/http/__tests__` suite and the affected caller tests, including `web-fetch-own-origin.integration.test.ts`. Gate on redirect refusal and preservation of the caller-safe egress refusal. Preserve the existing guarded composition path.

### K4-contracts-core-5.J

**B3, after the B2 approval contract.** Move these ten declarations to the existing sheet’s `packages/core/src/contracts/site/tool-metadata/<basename>.ts` destinations: `files-copy`, `forms`, `identity`, `mail-status`, `media`, `media-generation`, `media-import`, `navigation`, `observability`, and `pages`. Use `../../../tool-metadata-types.js` for `ToolMetadataById` and `../tool-metadata-approval-policy.js` for `ToolApprovalPolicy`. Add only the ten corresponding universal exports and baseline entries. Keep `frontend-control`, `fs-files`, `image-transform`, `permanent-delete`, `plugin-runtime`, and `recovery` in Tovu with their owner approval behavior or host ceremony. `plugin-runtime.ts` also embeds `tovu-plugin` in static copy with no existing args object for K3 injection.

For the **B5** T repoint, in `contracts/core/tool-metadata/index.ts` use `import { toolMetadata as <alias> } from "@jini-ai/core/contracts/site/tool-metadata/<basename>";` at `21 forms`, `24 identity`, `25 files_copy`, `28 mail_status`, `29 media`, `30 media_generation`, `31 media_import`, `33 navigation`, `35 pages`, and `45 observability`. The `<basename>` is the dashed filename. For each row below use `import { toolMetadata } from "@jini-ai/core/contracts/site/tool-metadata/<basename>";`:

| Basename | Website importer under `features/` |
|---|---|
| `files-copy` | `asset-transfer/copy-tool.ts:10` |
| `forms` | `forms/tool-registrations.ts:28` |
| `identity` | `identity/{permission-list-tool.ts:1,tool-registrations.ts:3}` |
| `mail-status` | `mail-status/{delivery-tool-registrations,provider-tool-registrations,tool-registrations}.ts:1` |
| `media` | `media/{library-save-attachment.ts:7,list-pending-chat-attachments.ts:1,promote-chat-attachment.ts:1,tool-registrations.ts:6,view-image-tool.ts:1,view-video-tool.ts:1}` |
| `media-generation` | `media-generation/{providers-tools.ts:1,tool-registrations.ts:5}` |
| `media-import` | `media-import/tool-registrations.ts:4` |
| `navigation` | `navigation/tool-registrations.ts:1` |
| `observability` | `observability/tool-registrations.ts:7` |
| `pages` | `pages/tool-registrations.ts:1` |

Keep `assistant/__tests__/moved-tools.golden.test.ts` and the host plugin source-tools test. In core `contracts/site/tool-metadata/__tests__/identity.test.ts`, pin `identity_user_change_username.approval.confirmation` to `"direct"`. Mutate it to `"plan"` and show the assertion fail.

### A-K2-0.J

**B5, after the remaining 0a/0b value fields, with one Admin writer.** Use the existing `./react/kit` entry. Close the appendix’s 0c rows against public exports and existing core or Admin types before adding structural types. `TabBarTab` is already available. The three runtime constants listed under 0a above are injected values. For any outstanding type, verify the exact named export and shape against current callers and add the corresponding host assignment before marking the row ready. Use host `satisfies AdminKit` and the kit tests as gates. Mutation should rename a field that a checked structural assignment actually uses. The remaining per-symbol matches are NOT-CHECKED.

Carry all three CSS rows in the screen migration instructions:

- `import "@jini-ai/ui/settings-dialog.css";` at `apps/admin/src/panels.tsx` for moved panels that use it. Retained dock and settings entry points keep their existing import.
- `import "@jini-ai/chat/react/styles/chat-settings.css";` at the host AssistantDock mount in `components/AssistantDock/AssistantDock.tsx`, which already imports it at line 1.
- `import "@jini-ai/ui/interactive-ui.css";` at the shared inline/canvas boundary in `components/AssistantDock/RoutedA2uiSurfaceCard.tsx:5`. If that boundary moves, carry the side effect to the host wrapper and repoint `components/AssistantDock/__tests__/interactive-ui-styles.unit.test.ts` to the wrapper, preserving the stylesheet assertions.

### K4-seam-3.J

**B4**, with a paired Tovu cutover before removing the old exports. At `packages/core/src/contracts/site/diagnostics-observability.ts`, move `Tracker`, `TrackerErrorContext`, `TrackerSpan`, `OperationSpanOptions`, `RequestSpanOptions`, `AgentSpanOptions`, and `CaptureEvent`. Export `CaptureEvent` so diagnostics can keep its `CapturePort` contract. Replace the inline `TraceIds` reference and the other observability imports with type imports from `../observability.js`. Preserve overloads and comments. Add universal `./contracts/site/diagnostics-observability` and the core baseline delta.

Under `packages/diagnostics/src/observability/`, import these names from `@jini-ai/core/contracts/site/diagnostics-observability`:

| File | Type bindings |
|---|---|
| `tracker-types.ts` | `CaptureEvent` for the retained `CapturePort`. Keep `TrackerProviders` and `TrackerOptions` here. |
| `telemetry-test.ts:2` | `Tracker` |
| `tracker-noop.ts:1` | `Tracker, TrackerSpan` |
| `tracker.ts:7` | `AgentSpanOptions, OperationSpanOptions, RequestSpanOptions, Tracker, TrackerErrorContext, TrackerSpan`. Keep `TrackerOptions, TrackerProviders` on the local import. |
| `index.ts:13` | Limit the local type export to `TrackerOptions, TrackerProviders` when the paired cutover lands. |

No test directly imports `tracker-types.js` in the checked diagnostics tree. Keep the tracker, tracker metric rejection, trace correlation, telemetry probe, provider-boundaries and optional-analytics tests. Mutation is renaming `TrackerSpan.setOutcome`, which must fail diagnostics type-check. The T sheet must complete the consumer inventory before removing the old export. For example, split `apps/desktop/src/product-memory-telemetry.test.ts:5` into the existing diagnostics `createNoopTracker` import and `import type { TrackerErrorContext } from "@jini-ai/core/contracts/site/diagnostics-observability";`. Apply the same split to mixed `Tracker` imports, preserving diagnostics runtime bindings. The full tonight-branch Tovu inventory is NOT-CHECKED.

### A-adm-other-1.J

**B4**, as the single Admin manifest writer. Keep the original ten TypeScript moves other than `features/authentication/model/provider-schemas.ts`, with the existing destination and repoint tables. Keep the provider catalog, its test, its `Authentication.tsx:21` import, and the vendor exception in Tovu. Move the collections hook test to `packages/admin/src/screens/collections/__tests__/use-json-field-control.unit.test.ts`; its binding resolves with `import { useJsonFieldControl } from "../hooks/use-json-field-control.hooks.js";`.

Deliver the three stylesheets in **B5 CSS**, serially after the B5 Admin kit writer and with their matching Tovu JSX changes. Use browser exports `./screens/admin-themes/admin-themes.css`, `./screens/consent/consent-settings.css`, and `./screens/email/email.css`, each mapping directly to `./src/screens/<same relative file>.css`, following `./themes/default/admin.css`. Add browser `jini.entries`, include those assets in package `files`, and include `./src/screens/**/*.css` in `sideEffects`. Pair each moved stylesheet-owned class rename with its JSX references. For email, keep the `--tovu-site-preview-bg` rule in host styling and point its selector at the renamed email preview class. The classic and glass theme definitions and other host consumers retain their token. Exact class-reference inventories are NOT-CHECKED before this paired delivery.

Use the following side-effect imports at `features/admin-themes/AdminThemes.tsx:11`, `features/consent/CookieConsent.tsx:14`, and `features/email/{Email.tsx:27,EmailTemplateEditor.tsx:20}`, respectively:

```ts
import "@jini-ai/admin/screens/admin-themes/admin-themes.css";
import "@jini-ai/admin/screens/consent/consent-settings.css";
import "@jini-ai/admin/screens/email/email.css";
```

Keep all 24 original stay gates. For the dictionary move, in `features/email/email-i18n.ts:1` use `import { EMAIL_TABS_DICT } from "@jini-ai/admin/screens/email/email-tabs-i18n";` and at `features/email/__tests__/email-i18n.unit.test.ts:5` use `import { EMAIL_TAB_LOCALES, EMAIL_TAB_ROWS } from "@jini-ai/admin/screens/email/email-tabs-i18n";`. Remove the stale `email-tabs-i18n.ts` entry in `development/scripts/error-gate-debt.json` with the Tovu deletion. Mutation is deleting the `"Add this provider's key first."` row from Jini `EMAIL_TAB_ROWS`. The named email i18n unit test requires that key in all 21 locales.
