P9K-VERIFY-MECH PARTIAL: six steps dispositioned; remaining candidates and exhaustive barrel cutovers for blocked steps NOT-CHECKED

**No current P9K sheet outside B1–B3 cleared dispatch.** `X-forms-1.J` is the closest. Its three sources can move mechanically once the sheet fixes the mutation and accounts for five Tovu barrel consumers.

I checked Tovu `41e948ee4a` and the `ex-sh`, `ex-core`, and `ex-export` branches separately. The named Jini merge-13 ref resolves to `7c4ee7881`; the requested `e4e3bf175` pin agrees on the checked destination paths and exports. I used read-only Git lookups within the budget. No tests, builds, installs, or type-checks ran. The paths below are relative to each repository unless specified.

## Candidate screen

- **Mechanical after sheet corrections** — `X-forms-1.J` (B45, three files). Its dependencies resolve to existing CMS sources, core, and Node. Its T half follows the corrected J half.
- **Next candidates, NOT-CHECKED for dispatch** — `A-adm-shell-lib-2.J`, `X-content-duplication-1.J`, `X-fs-files-1.J`, `X-object-storage-1.J`, `X-pages-1.J`, `X-seo-1.J`, `X-form-destinations-1.J`, `X-analytics-1.J`, `X-webmcp-1.J`, `X-change-sets-1.J`, `X-permanent-delete-1.J`, and `A-adm-{roles,members,users}-1.J`. Their INDEX rows have no scheduled prerequisite. Several already have sheet defects. For example, the object-storage mutation targets an `if` that the first export lacks, and the three admin API type sheets name runtime mutations on type-only files. None belongs in the run order on this evidence.
- **Zero-dependency rows with an unlanded source dependency** — `X-content-types-1.J` still imports the host routing barrel and tool metadata. `X-redirects-1.J` still imports the host routing registry. `X-navigation-1.J`, `X-entries-1.J`, and `X-workspace-1.J` still import Tovu tool metadata. `X-media-1.J` has the unlanded publishing dependency detailed below.
- **Other zero-dependency rows screened out** — `R-public-http-1.J` and `R-admin-http-1.J` contain Express or host serving code. `DT-desktop-1.J` carries the native helper path, host toolchain variables, and `tovu:speech` IPC binding. `A-adm-other-2.J`, `A-adm-shell-components-1.J`, and `A-adm-publish-content-1.J` include CSS export work, host bindings, or class changes. `A-adm-themes-1.J` directly calls a custom hook in `use-theme-delete-request.hooks.ts`. `A-adm-shell-lib-{1,3}.J` carry the Tovu Vite define or upstream response header. `X-trash-1.J` has a zero-argument public factory and a move test using `t.mock.method` and `t.after`. `X-plugin-runtime-1.J`, `X-settings-1.J`, `P-publish-trust-1.J`, `X-webhooks-1.J`, `X-skills-1.J`, `X-external-mcp-1.J`, and `X-widgets-1.J` carry host copy, policy, persisted vocabulary, or host adapters. `X-vendor-credentials-1.J` and `X-site-search-1.J` have positional public functions. `X-database-transfer-1.J` has a `table-catalog.ts` collision and host transfer copy. `C-contracts-headless-1.J` and `C-contracts-core-1.J` retain the prior verifier’s policy and owner holds.

The remaining K1–K5 and XC work requires the plan’s route, kit, injection, or seam changes. The V rows have unlanded prerequisites. `S6b` requires SQL table interfaces and binding changes. `S7b` waits for media and also needs SQL bindings. The SEC, RN, and RT-1/2 lanes retain their parity, compatibility, or owner prerequisites. RT-3’s retirement is already reflected in Jini.

**Landed J halves and Tovu cutovers.** The `ex-core` branch already removes the landed core files from Tovu. `ex-export` already removes `active-theme-id.ts`, `site-export/ports.ts`, and `public-origin-policy.ts`. The export failure-summary adapter remains local with its existing call shape. The outstanding post and HTML T halves are B1–B2 and have partial Jini coverage, as the prior verifier documented. I found no additional full `.T` row outside B1–B3 whose complete J half is landed and whose Tovu work remains.

## Six checked steps

All six sets of move sources and named test paths exist on the four checked Tovu refs. The exact proposed Jini destination files and export keys are free on both Jini refs. The media step has an existing implementation at a different path. For the blocked steps, the findings below identify the cutover failures. A complete replacement import inventory for those blocked cutovers remains **NOT-CHECKED**.

### `X-agent-plugins-1.J` — BLOCK · B14 · 12 files

`bundled-catalog.ts:24` seeds the host’s chosen plugin set, including `tovu-theme` and `how-tovu-works`. `bundled-id-upgrade.ts:37,133` migrates existing `tovu/` identifiers and protects installations whose digests differ from the host’s bundled copy. Renaming those literals changes the migration or the seeded policy. `admin-surfaces/public-config.ts:15` also hardcodes a host environment allowlist and specific provider keys. `soon-lock.ts` and `retired-plugin-tool-aliases.ts` depend on the catalog.

The `@jini-ai/agent-plugins/site/*` keys are free, but moving the whole batch there would take these host bindings with it. The named mutation points at `bundled-source-root.ts`, a fixture helper. The existing `bundled-catalog.pointer.unit.test.ts` exercises pointer formatting.

The direct scan matched all 50 sheet rows in `apps/` and `packages/`. It also found `mock.module` specifiers in `apps/website/src/server/runtime/boot/__tests__/bootstrap-reporting.unit.test.ts:26,36`. Any later cutover must change both the imports and mock registrations together. The two development importer rows exist, and `development/scripts/__tests__/test-bundle-bootstrap.test.ts:18` embeds an additional import of the host catalog.

### `T-theme-1.J` — BLOCK · B15 · 10 files

The proposed `@jini-ai/cms/themes/site/*` keys and files are free. The Handlebars and Liquid imports need CMS runtime dependencies and a lockfile update. Tovu declares `handlebars: ^4.7.10` and `liquidjs: ^10.27.2`; CMS declares neither.

`entry-list-markup.ts` emits `data-tovu-entry-list` and CSS selectors pinned by `entry-list-render-layouts.test.ts:7–10`. Rewriting those selectors changes shipped markup and requires assertion changes. `entry-list-render.test.ts` exercises host rendering. `liquid-allowlist.test.ts` reads Tovu’s archived theme fixture, and `validation/__tests__/references.test.ts` uses `t.after`. The named layout test exercises CSS and cannot prove the proposed Handlebars mutation.

The 77 direct rows matched. The sheet also needs the barrel consumer at `apps/website/src/server/inbound/admin-http/routes/themes/explore.ts:46`. If the two helper files are cleared in a revised step, split out these imports and retain the other theme bindings:

```ts
import { MAX_THEME_FILE_BYTES, readThemeFile, ThemePathError } from "@jini-ai/cms/themes/site/theme-files";
import { ORIGINAL_LAYOUT_MISMATCH_REFUSAL } from "@jini-ai/cms/themes/site/theme-file-errors";
```

### `X-identity-1.J` — BLOCK · B15 · 10 files

`features/identity/api-key-secret.ts:45,57` uses `tovu_ak_` to mint and parse keys. `apps/website/src/__tests__/lane-su-pins/p3-p4-api-key-format.test.ts` pins the existing wire format and verifies frozen issued-key fixtures. The sheet’s rename would change the output and reject existing keys. Keep the format-bearing implementation and its tests together until the compatibility decision is made. `username-change-ports.ts` also binds the rename lifecycle to Tovu Trash and its transactional audit outbox.

The 76 direct sheet rows matched. The proposed user-management entries are free. `boot-session-token.test.ts` imports `boot-session-token.ts` and uses `t.after`; it cannot travel by an import-only test edit or exercise the named mutation in `delete-user-service.ts`.

### `X-media-1.J` — BLOCK · B15 · 10 files

`apps/website/src/features/media/where-used.ts:6` imports `collectReferencedMediaKeys` from Tovu’s `publish-content/media-references.ts`. That helper belongs to `K5-publish-content-1.J` and is absent from both Jini trees. `purge-media.ts:3` imports `where-used.ts`, so both files are blocked. This is a live dependency even though INDEX prints `—`.

There is also a duplicate implementation under a different Jini path. Merge-13 already exports `withChatPreview` from `@jini-ai/cms/media` and has `packages/cms/src/media/__tests__/chat-preview.test.ts`. The proposed `./media/site/chat-preview` would add a second copy. A direct repoint needs a behavior decision: the Tovu catch covers encoding and response construction, while Jini’s fallback wraps encoding only. Four Tovu import sites use the local helper: `features/media-generation/tool-registrations.ts:2`, `features/media-import/tool-registrations.ts:2`, `features/media/tool-registrations.ts:2`, and `features/media/__tests__/media-producing-previews.test.ts:23`.

The named hydrate test exists and exercises the missing-seed path. The 33 direct rows matched, with seven barrel line shifts on `ex-sh-tovu`. Deleting the media forwards also affects consumers the sheet omits, including `features/asset-transfer/asset-sources.ts:9` (`readStoredBytes`), `features/forms/form-file-maintenance.ts:5` (`purgeMedia`), and `server/routes/types.ts:80` (`HydrateBlobStoreFromSeedResult`). The full barrel cutover remains **NOT-CHECKED**.

### `X-forms-1.J` — FIX · B45 · 3 files

The three files are Jini-bound. Use the sheet’s `packages/cms/src/forms/site/` destinations and matching `exports` and `jini.entries` keys. Mark `./forms/site/form-destination-manifest` `node` for `node:crypto`. Mark `./forms/site/import-remote-submissions` and `./forms/site/mail-outbox-readiness` `universal`.

- In the moved manifest source, replace `@jini-ai/cms/forms` with `../index.js` and `@jini-ai/cms/forms/html` with `../html/index.js`. Apply the same two replacements in `import-remote-submissions.ts`. Keep the core imports. Reword the host-name references in the manifest comments and preserve their rationale.
- Move `form-destination-manifest.test.ts` to `forms/site/__tests__/`. Use `import { test } from "vitest"` and `../../index.js` for the existing CMS forms type import. The relative import of the manifest stays `../form-destination-manifest.js`. `buildFormDestinationManifest` has no `if`. For the mutation, remove the active-status predicate from its filter and use the existing **“no active forms means an empty manifest”** case.
- The T sheet’s seven direct rows matched across the checked Tovu refs. Apply its five specifier rewrites and two barrel deletions. Add the five missing barrel consumers below. In `server/routes/types.ts`, keep `FormDeliveryStatusPort` on its existing import.

Paths in this table are under `apps/website/src/`.

| Importer | New import |
|---|---|
| `server/routes/types.ts:62` | `import type { FormsAutoPullPort, FormSubmissionsPullPort } from "@jini-ai/cms/forms/site/import-remote-submissions";` |
| `server/runtime/composition/__tests__/form-delivery-vertical-slice.fixture.ts:15` (`:16` on ex-sh) | `import type { FormsAutoPullPort } from "@jini-ai/cms/forms/site/import-remote-submissions";` |
| `server/runtime/composition/form-delivery.ts:5` | `import { buildFormDeliveryForm } from "@jini-ai/cms/forms/site/form-destination-manifest";` |
| `server/runtime/composition/form-pull-triggers.ts:3` | `import type { FormsAutoPullPort } from "@jini-ai/cms/forms/site/import-remote-submissions";` |
| `server/runtime/composition/form-submissions.ts:14` (`:21` on ex-sh) | `import { buildFormDestinationManifest } from "@jini-ai/cms/forms/site/form-destination-manifest";` and `import type { FormDestinationPullReport, FormPullCounts, FormSubmissionsPullPort, FormSubmissionsPullResult, FormsAutoPullPort } from "@jini-ai/cms/forms/site/import-remote-submissions";` |

The named stay tests exist. `X-forms-1.J` shares the CMS manifest and API baseline with the theme, media, and image-transform J halves. Its corrected T half also shares `server/routes/types.ts` with the media cutover.

### `X-image-transform-1.J` — BLOCK · B158 · 1 file

`packages/cms/src/media/site-transform/image-ops.ts` and `./media/site-transform/image-ops` are free. The implementation accepts an injected codec. Its Jini copy would use `../image-codec.js` for the type import and a `node` entry for `Buffer`. Its unconditional `@cfworker/json-schema` import requires a CMS runtime dependency and lockfile update. The existing Tovu version is `^4.1.1`.

The named `image-ops.test.ts` exists. Its output-count assertions cover the first `if` in `normalizeOutputs`. The sheet’s direct consumer at `apps/website/src/features/image-transform/tool.ts:14` resolves by retaining its bindings and changing the specifier to `@jini-ai/cms/media/site-transform/image-ops`.

The sheet misses `apps/website/src/features/image-transform/__tests__/image-codec.boundary.test.ts:6`. That test reads `../image-ops.ts` from disk and checks three other Tovu sources in the same loop. The cutover needs to retain the three host checks and relocate the `image-ops.ts` assertion to Jini. An import-line edit cannot preserve that guard, so STOP 5 applies to the current sheet.

**SAFE TONIGHT:** None. No step earned OK. The first sheet to correct is `X-forms-1.J`, followed by `X-forms-1.T` after the Jini commit and linked rebuild. Give the J half its own CMS manifest slot.
