PLAN r62t-plan-small PARTIAL: 5 MOVE / 48 STAYS-HOST / 8 sheets

Three source files have Sol-ready Jini/Tovu sheets. Two settings reporters have OPUS-CLOUD sheets only. Of the 182 counted source records in scope, 129 are NOT-PLANNED. The 218 existing `keep.json` records are outside those totals. The lookup budget reached **220 of 220**. No files changed, and no tests, builds, installs, or type-checks ran.

Bases are Tovu `caa3ac7811f3ca15afb782ef0c4823f2d2cd5f8f` and Jini `dc2349f5194b8fcc2994e5c50936946f8229fab3`. Both are the supplied `origin/integ/merge-21-2026-11-24`.

The planner’s “ready” label is not a move decision. For example, `wire-headers.ts` is nine lines and imports only a type, but its header names are already used by webhook receivers. `site-title-legacy.ts` supplies the title existing sites rendered before the setting was introduced. Neither should move or be renamed.

## Five priority areas

Paths in these tables are relative to Tovu `apps/website/src/features/`. Jini paths are relative to `packages/`. A dash means no destination is authorized by this plan. OPUS-CLOUD alone is not a dispatch instruction. Only rows marked **MOVE** have executable sheets.

| File | Decision | Jini destination | Blocking dependency or reason |
|---|---|---|---|
| `identity/api-key-binding.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | Binds the existing `tovu_ak_` wire prefix to Jini’s key secret and service. Do not use the old recipe to rename it. |
| `identity/boot-session-token-binding.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | One host-owned token store shared by mint and redeem. Moving its singleton is not equivalent to moving the store factory. |
| `identity/trash-user-binding.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | Binds the existing Jini trash-user service at the host. |
| `identity/default-credential-exposure.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | Checks this host’s shipped admin sources against its development credential. |
| `identity/first-owner-password.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | Owns host env keys, runtime selection, and the development-default exception. |
| `identity/repo.sqlite.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | Binds Jini SQL repos and MFA/passkey/recovery stores to the site kernel, schema, and tables. |
| `identity/wiring.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | Runtime composition for seeding, hashers, stores, default credentials, and route deps. |
| `identity/permission-list-tool.ts` | NOT-PLANNED · OPUS-CLOUD | — | Read-only is not authorization-neutral. The move must preserve `role.manage`, the denial class, workspace scope, and authorize-before-read without importing CMS runtime. |
| `identity/repo.authentication.ts` | NOT-PLANNED · OPUS-CLOUD | — | Site database and authentication boundaries not closed. |
| `identity/repo.authorization.ts` | NOT-PLANNED · OPUS-CLOUD | — | Site database and grant boundaries not closed. |
| `identity/repo.ts` | NOT-PLANNED · OPUS-CLOUD | — | Identity transaction boundary and host DB collaborators not closed. |
| `identity/tool-registrations.ts` | NOT-PLANNED · OPUS-CLOUD | — | Secret cards, human confirmation, account-action policy, scheduler, and delete grants. |
| `identity/user-purge.ts` | NOT-PLANNED · OPUS-CLOUD | — | Permanent deletion and site cleanup ordering. |
| `settings/site-timezone-fallback.ts` | MOVE · OPUS-CLOUD | `cms/src/settings/site/site-timezone-fallback.ts` | Required logger injection. Preserve fixed text and safe metadata. |
| `settings/site-title-reporter.ts` | MOVE · OPUS-CLOUD | `cms/src/settings/site/site-title-reporter.ts` | Required logger injection. Preserve safe failure metadata and counts-only summary. |
| `settings/site-title-legacy.ts` | STAYS-HOST | — | Product default and concrete reporter composition. Existing `legacySiteTitle` field is the K3 seam. |
| `settings/index.ts` | STAYS-HOST | — | Contains the active-principal lookup and host write bindings. No new compatibility barrel. |
| `settings/repo.sqlite.ts` | STAYS-HOST | — | Maps the site DB, table names, and kernel into `SqlSettingsRepo`. |
| `settings/settings-write-policies.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | Host settings coordinates, validation, and dedicated-writer permission policy. |
| `settings/tool-registrations.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | Host confirmation and denial rules, locale vocabulary, and runtime selection. |
| `settings/visitor-tools-agent-tools.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | Model-facing product catalog and approval policy already supplied to the Jini contributor. |
| `settings/visitor-tools-permissions.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | Registers the product permission in the supplied grant registry. |
| `forms/index.ts` | STAYS-HOST | — | Binds the admin editor’s reserved `new` slug, permissions, request provenance, outbox dispatch, and repo-scoped attempt store. |
| `forms/tool-registrations.ts` | STAYS-HOST | — | Binds live route deps, host write wrappers, duplicate-name policy, and tool metadata to existing Jini handlers. |
| `forms/submission-ip-retention.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | Jini owns the retention query. This binds `FORMS_TABLES` and the dialect’s column lookup. |
| `forms/submission-ip-expiry-sweep.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | Jini owns the sweep runner. The host binds the repo, warning sink, and installed-package capability gate. Planner destination already exists. |
| `forms/form-file-maintenance.ts` | NOT-PLANNED · OPUS-CLOUD | — | Site media lifecycle, kernel, and trash/purge behavior. |
| `forms/form-file-purge.ts` | NOT-PLANNED · OPUS-CLOUD | — | Attachment ownership, cleanup sequencing, and storage-key locking. |
| `forms/protect-existing-files.ts` | NOT-PLANNED · OPUS-CLOUD | — | Filesystem and attachment ownership checks. |
| `forms/publish-content.ts` | NOT-PLANNED | — | Depends on the publish lane’s repo-handler and form port slice plus host-authorized form writes. Would require a split. |
| `newsletter/agent-tools.ts` | MOVE | `user-management/src/newsletter/agent-tools.ts` | Same-package campaign bounds become a relative import. Catalog data only. |
| `newsletter/deps-builders.ts` | STAYS-HOST | — | Assembles live host ports and injects outbox dispatch, rate-limit classification, and the error sink. |
| `newsletter/http-error-responses.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | The host supplies its flat HTTP error table to the already-neutral specs. Keep the unknown-error fallthrough. |
| `newsletter/repo.sqlite.ts` | STAYS-HOST | — | Binds Jini SQL repos to the site kernel, tables, and unreadable-body reporter. |
| `newsletter/confirmation.ts` | NOT-PLANNED · OPUS-CLOUD | — | Token lifecycle, verified origin, sender identity, and consent-before-subscribe ordering. |
| `newsletter/subscriptions.ts` | NOT-PLANNED · OPUS-CLOUD | — | Shares confirmation, consent, and revocation behavior with its callers. |
| `newsletter/tool-registrations.ts` | NOT-PLANNED · OPUS-CLOUD | — | Authorization, model-facing error handling, and confirmation dependencies. The catalog import can still be repointed. |
| `newsletter/delivery/tool-registrations.ts` | NOT-PLANNED · OPUS-CLOUD | — | Authorization and browser approval for campaign sending. |
| `webhooks/http.memory.ts` | MOVE | `integrations/src/webhooks/site/http.memory.ts` | Test double only. Use the existing same-package positional port. No general HTTP seam required. |
| `webhooks/wire-headers.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | The host passes its existing header vocabulary as `deps.headers`. All three names are wire values. |
| `webhooks/seal-aad-invariant.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | Host CLI and scan scope. Root `package.json:63` runs this path. No verifier extraction planned. |
| `webhooks/secret-scan-guard.ts` | STAYS-HOST · OPUS-CLOUD if changed | — | Host repository/history scan and allowlist policy around shared redaction patterns. |
| `webhooks/keyring.env.ts` | NOT-PLANNED · OPUS-CLOUD | — | Env/file ownership and frozen derivation bytes. Do not normalize product literals. |
| `webhooks/site-key-ensure.ts` | NOT-PLANNED · OPUS-CLOUD | — | Host boot policy, site metadata and durable file operations. |
| `webhooks/site-key-sources.ts` | NOT-PLANNED · OPUS-CLOUD | — | Host env names, directory precedence, compatibility paths, and test-home isolation. |
| `webhooks/tool-registrations.ts` | NOT-PLANNED · OPUS-CLOUD | — | Authorization, signing/sealing dependencies, and deletion confirmation. |

## Prerequisites and execution order

- **Jini first.** Sol executes `SM-J01` through `SM-J03`, then `SM-T01` through `SM-T03` against that Jini artifact. The cloud runs the characterization, mutation, and integration checks. Only OPUS-CLOUD may take `SM-J04` and `SM-T04`. Don’t delete a Tovu source against a Jini artifact that lacks its new export.
- **K4 and K5.** First reuse the verified contracts below. None of the five moves requires a new core type. None imports another package’s implementation. The settings cloud sheet changes the logger collaborator from a default inside the moved factories to a required host-supplied port. Preserve `_optional = {}`.
- **K1 and K2.** No route spec or admin screen moves in these sheets. The comments route edits are import-only. No kit names, `@jini-ai/admin` dependencies, hook props, or `RouteDeps` changes are needed. If a running route lane has already replaced a listed importer, stop that T half and reconcile it with that lane.
- **Existing seams to keep.** Forms retention is already bound at `createSubmissionIpRetentionRepo({ kernel }, _optional = {})`. The host supplies `FORMS_TABLES` and `columns: ({ table }) => listColumns({ kernel, table })`. The host sweep calls the existing Jini runner with `{ repo, sweep, onError }` and `{ intervalMs, now }`. Do not bypass the installed-export gate as part of extraction. Forms publishing is held until the publish lane’s neutral form port and handler seam can be verified together. Do not invent a second publish port.
- **Existing wire ports to keep.** Newsletter composition at `server/runtime/composition/modules/newsletter.ts:132` supplies `mapNewsletterError: newsletterErrorResponse` with the current shape `(required: { err: unknown }, optional?: Record<string, never>) => { status: number; body: Record<string, unknown> } | undefined`. Webhook worker composition at `server/runtime/composition/webhook-delivery-worker.ts:5` imports the host vocabulary and supplies it to `deps.headers`. Neither port needs a new definition or repoint.
- **Exports and baselines.** For every Jini subpath below, add the explicit `package.json` `exports` entry with `types: "./dist/<stem>.d.ts"`, `import: "./dist/<stem>.js"`, and `default: "./dist/<stem>.js"`. Use the package’s corresponding `jini.entries` entry and mirror any existing `typesVersions["*"]` map for subpaths, specifically in `integrations`. These are additive API changes. Sol does not hand-edit baseline JSON. Cloud checks the built API, regenerates `api-baseline/jini-ai__{cms,integrations,user-management}.json` with `pnpm api:update`, and reviews the diff for unrelated changes or removals.

## Sol sheets

In the importer lists, `W/` means `apps/website/src/` in Tovu. Each T sheet removes its source only after its listed import edits. Tests that stay in Tovu retain their assertions.

### SM-J01 · Jini · Newsletter catalog

1. Create `packages/user-management/src/newsletter/__tests__/agent-tools.characterization.test.ts` first. Pin the ordered IDs below, each entry’s declared permission and side-effect value, `additionalProperties: false`, and agreement between campaign editorial bounds and `campaign-write-service.ts`. Pin absence of bulk subscription import. Keep the existing Tovu catalog, registrations, and model-facing error tests as the independent compatibility checks.
2. Copy `W/features/newsletter/agent-tools.ts` to `packages/user-management/src/newsletter/agent-tools.ts`. Change only the value import from `@jini-ai/user-management/newsletter/campaign-write-service` to `./campaign-write-service.js`. No new K3 field is needed. “Members” in this catalog names the existing subscriber/consent domain, not a product brand to substitute. No handler, authorization enforcement, or delivery collaborator moves.
3. Export `@jini-ai/user-management/newsletter/agent-tools` with stem `newsletter/agent-tools` and the same runtime classification as the adjacent campaign write service. The exported surface is `newsletterAgentToolCatalog` and its existing types.
4. Carry the why-comments explaining why bulk import is absent, why single-contact additions do not assert consent, which operations only narrow delivery, and why permissions declared by a catalog still have to be enforced by handlers.

The ordered ID suffixes after `newsletter_` are `list_campaigns`, `get_campaign`, `list_lists`, `list_subscriptions`, `list_send_log`, `create_campaign`, `update_campaign`, `cancel_campaign`, `pause_campaign`, `create_list`, `archive_list`, `create_subscription`, `remove_subscription`, `resend_confirmation`.

**Named mutation `NL-LIST-LIMIT-101`.** Change the `newsletter_list_campaigns` `limit.maximum` from `100` to `101`. The characterization must assert the exact value and fail. Revert in cloud.

### SM-T01 · Tovu · Newsletter catalog repoints

Replace the following specifiers with `@jini-ai/user-management/newsletter/agent-tools`.

| Importer | Old specifier |
|---|---|
| `W/assistant/__tests__/tool-registrations.contracts.test.ts:111` | `../../features/newsletter/agent-tools.js` |
| `W/assistant/__tests__/tool-registrations.newsletter.test.ts:22` | `../../features/newsletter/agent-tools.js` |
| `W/features/newsletter/__tests__/tool-registrations.model-facing-errors.test.ts:20` | `../agent-tools.js` |
| `W/features/newsletter/tool-registrations.ts:32` | `./agent-tools.js` |

Delete `W/features/newsletter/agent-tools.ts`. Do not modify handler composition, catalog indexing, or the delivery tool catalog. No Tovu manifest or API-baseline change.

### SM-J02 · Jini · Webhook HTTP test double

1. Create `packages/integrations/src/webhooks/site/__tests__/http.memory.unit.test.ts`. Assert a default 200, recording on every call, scripted responses in order, repeating the final response after exhaustion, and propagation of a thrown script thunk. On the thrown call, assert that the request was recorded and the script position advanced.
2. Copy `W/features/webhooks/http.memory.ts` to `packages/integrations/src/webhooks/site/http.memory.ts`. Replace `../../platform/http/ports.js` with `./delivery.js` for the **type-only** `HttpClientPort` import. Keep the core `HttpRequest` and `HttpResponse` imports type-only. The local port is exactly `send(request: HttpRequest): Promise<HttpResponse>`. Preserve the existing class constructor and method shape.
3. Export `@jini-ai/integrations/webhooks/site/http.memory` with stem `webhooks/site/http.memory`, the runtime classification of the neighboring `./webhooks/site/delivery` entry, and `typesVersions["*"]["webhooks/site/http.memory"]` pointing at `./dist/webhooks/site/http.memory.d.ts`. Do not add it to the production webhook barrel.
4. Carry the why-comments that every call is recorded, script exhaustion repeats the last response, and the double is never production transport. Update stale relative-path references in those comments.

The prior K4 block on a **general** HTTP port is not resolved by this sheet. Core’s general port takes `{ request }` and optional redirect control. This fixture uses the already-published positional test seam beside webhook delivery. Do not change either port or any redirect behavior.

**Named mutation `WH-REPLAY-FIRST`.** Replace `this.cursor += 1` with `this.cursor += 0`. The two-distinct-responses test must fail on its second call. Revert in cloud.

### SM-T02 · Tovu · Webhook HTTP test double repoints

Replace the following specifiers with `@jini-ai/integrations/webhooks/site/http.memory`.

| Importer | Old specifier |
|---|---|
| `W/features/webhooks/__tests__/delivery.test.ts:11` | `../http.memory.js` |
| `W/server/runtime/composition/__tests__/webhook-delivery-worker.test.ts:7` | `#src/features/webhooks/http.memory` |

Delete `W/features/webhooks/http.memory.ts`. No production imports change. Keep both Tovu suites, including receiver-header assertions. No Tovu manifest or API-baseline change.

### SM-J03 · Jini · Comments marker rendering

1. Create `packages/cms/src/comments/site/__tests__/public-markers.unit.test.ts` before copying the implementation. Use a fake narrowed to `Pick<CommentsProviderRegistry, "active" | "get">`, cast once at the fixture boundary if needed. Do not import the capability-providers implementation into CMS. Cover these cases:
   - Marker-free HTML is byte-identical and never reads the registry.
   - Multiple markers use one active-provider resolution and one render. Preserve an attributed wrapper and leave unrelated markers untouched.
   - Pass the cursor through when present. A draft, an absent provider, and an unavailable adapter render no thread.
   - A provider script is emitted through `scripts` with its declared consent category and is not inserted as an executable tag. No scripts are emitted for a marker-free or draft page.
2. Copy `W/features/comments/public-markers.ts` to `packages/cms/src/comments/site/public-markers.ts`. Change `@jini-ai/cms/widgets/markers` to `../../widgets/markers/index.js`. Keep the two type imports `@jini-ai/core/contracts/site/comments-providers` and `@jini-ai/core/contracts/site/cookie-consent` unchanged.
3. Export `@jini-ai/cms/comments/site/public-markers` with stem `comments/site/public-markers` and `jini.entries["./comments/site/public-markers"] = "universal"`.
4. Keep the existing argument shape. Required args are `{ html: string; siteId: string; providers?: CommentsProviderRegistry; entry: { id: string; slug: string; title: string; canonicalUrl: string; status: string } }`. Optional args are `{ cursor?: string; scripts?: (required: { scripts: readonly DeclaredScript[] }) => void } = {}`. The host continues to supply providers and any script collector at the current render call sites. No new registry ownership, policy, or permissions.
5. Carry the why-comments about request-local resolution with no moderation cache, avoiding registry work for marker-free pages, static export behavior, and provider scripts inheriting consent while stored comments do not.

**Named mutation `CM-DROP-CONSENT-DECLARATIONS`.** Remove the call to `contributeScripts` in the active-provider branch. The test for the exact emitted script declarations must fail while the thread still renders. Revert in cloud.

### SM-T03 · Tovu · Comments marker repoints

Replace the following specifiers with `@jini-ai/cms/comments/site/public-markers`.

| Importer | Old specifier |
|---|---|
| `W/features/comments/__tests__/public-markers-builtin.unit.test.ts:6` | `../public-markers.js` |
| `W/features/comments/__tests__/public-markers-scripts.unit.test.ts:6` | `../public-markers.js` |
| `W/server/inbound/public-http/routes/site/pages/handlers/post.ts:1` | `#src/features/comments/public-markers` |
| `W/server/inbound/public-http/routes/site/pages/template-render.ts:1` | `#src/features/comments/public-markers` |

In `W/features/comments/index.ts:21`, remove `export { renderCommentsMarkers } from "./public-markers.js";` rather than replacing it with another re-export. The symbol lookup found no consumer through that barrel. Keep the remaining host composition in that file. Delete `W/features/comments/public-markers.ts`. Keep both Tovu tests, especially the script suite using the real provider registry. The reference in `W/features/theme/validation/markup.ts` is a comment, not an importer. Do not edit the theme file. No Tovu manifest or API-baseline change.

## OPUS-CLOUD sheets

### SM-J04 · Jini · Settings reporters

The two reporters are small, but their purpose is to prevent error content from reaching logs. This is a cloud-only move. Make no changes to reporter event construction, the stored title or timezone, or a settings write path.

1. First copy `W/features/settings/__tests__/site-timezone-fallback.unit.test.ts` and `W/features/settings/__tests__/site-title-reporter.unit.test.ts` to `packages/cms/src/settings/site/__tests__/`. Keep reporter imports relative. In the timezone test, change the resolver import to `../site-timezone.js`. Adapt the logger arguments to the exact required shapes below. Keep the timezone test’s fallback value, exact log record, and absence-of-secret assertions. Keep the title test’s present/absent `errorClass` and counts-only assertions.
2. Copy the two source files to `packages/cms/src/settings/site/`, retaining their basenames. Use `./site-timezone.js` and `./site-title.js` for the existing event and result types. Drop the runtime `createConsoleLogger` import and retain `import type { Logger } from "@jini-ai/core/primitives"`.
3. Use these signatures. Read `logger` from required args. Do not modify either reporter body after removing its default logger construction.

```ts
createSiteTimeZoneFallbackReporter(
  { logger }: { logger: Pick<Logger, "error"> },
  _optional: Record<string, never> = {},
): SiteTimeZoneFallbackReporter

createSiteTitleFailureReporter(
  { logger }: { logger: Pick<Logger, "error"> },
  _optional: Record<string, never> = {},
): SiteTitleFailureReporter

createSiteTitlePreservationSummaryReporter(
  { logger }: { logger: Pick<Logger, "info"> },
  _optional: Record<string, never> = {},
): SiteTitlePreservationSummaryReporter
```

4. Add `@jini-ai/cms/settings/site/site-timezone-fallback` and `@jini-ai/cms/settings/site/site-title-reporter`, with corresponding stems `settings/site/site-timezone-fallback` and `settings/site/site-title-reporter` and universal runtime entries. No barrel additions. Keep the why-comments about fixed text, why the original error is excluded, and why the title summary exposes only counts.

**Named mutations.** `ST-ZONE-DROP-ERROR-CLASS` removes `errorClass` from the timezone log metadata and must fail the exact log-record assertion. `ST-TITLE-UNDEFINED-ERROR-CLASS` always emits an `errorClass` property and must fail the title test for an absent class. Revert both in cloud.

### SM-T04 · Tovu · Settings reporter repoints

The host supplies the old default exactly as `{ logger: createConsoleLogger({ prefix: "" }) }`. Import or reuse `createConsoleLogger` from `@jini-ai/core/primitives` in each retained caller. The two copied tests use their existing test logger instead.

| Importer | Exact edit |
|---|---|
| `W/features/settings/site-title-legacy.ts:3` | Replace `./site-title-reporter.js` with `@jini-ai/cms/settings/site/site-title-reporter`. Pass the explicit logger at the failure factory call at `:16` and the summary factory call at `:30`. |
| `W/features/settings/__tests__/site-timezone.test.ts:16` | Replace `../site-timezone-fallback.js` with `@jini-ai/cms/settings/site/site-timezone-fallback`. Pass the explicit logger at `:94`. |
| `W/server/runtime/composition/app.ts:90` | Replace `#src/features/settings/site-timezone-fallback` with `@jini-ai/cms/settings/site/site-timezone-fallback`. Pass the explicit logger at `:312`. |
| `W/server/runtime/composition/site-deps/identity-settings.ts:15` | Same specifier replacement. Pass the explicit logger at `:220`. |
| `W/server/runtime/composition/site-deps/site-sharing.ts:26` | Same specifier replacement. Pass the explicit logger at `:87`. |
| `W/features/settings/__tests__/site-timezone-fallback.unit.test.ts:8` | Delete this test file after its Jini copy lands. Do not leave a forwarding test. |
| `W/features/settings/__tests__/site-title-reporter.unit.test.ts:6` | Delete this test file after its Jini copy lands. Do not leave a forwarding test. |

Delete the two old reporter sources. Update the two filename references in `W/features/settings/INFO.md` to the Jini subpaths, keeping the distinction between the product binding and the reporter. Keep `LEGACY_SITE_TITLE`, `siteTitleHostBindings`, and `siteTitlePreservationHostBindings` in Tovu. No Tovu manifest or API-baseline change.

## Other areas under eight counted files

The one additional MOVE, `comments/public-markers.ts`, is included above. Below, paths are relative to the area’s directory, filenames without extensions are `.ts`, and a dash means no Jini path is authorized. Every NOT-PLANNED row is inventory only. A `blocked.json` destination for such a row is a candidate, not an instruction to create the file.

| Area | File(s) | Decision | Destination or blocking seam |
|---|---|---|---|
| `adm-recovery` | `index` | STAYS-HOST | Host screen entry. |
|  | `Recovery.tsx`, `api/recovery-api`, `hooks/recovery-dependencies.hooks`, `hooks/restore-flow-dependencies.hooks` | NOT-PLANNED · OPUS-CLOUD | Restore client and required hooks not closed. No K2 kit names verified for a move. Do not add recovery domain deps to `admin`. |
| `adm-roles` | `index.tsx`, `roles-host-binding`, `hooks/use-wired-roles.hooks` | STAYS-HOST | Host screen mount, transport/navigation, locale, and hook binding. |
|  | `api/roles-api`, `hooks/roles-dependencies.hooks` | NOT-PLANNED · OPUS-CLOUD | Role permissions, host HTTP, and domain contract boundary. Do not blindly use the planner’s `admin/src/roles` path. |
| `adm-users` | `index.tsx`, `users-host-binding`, `hooks/use-wired-users.hooks` | STAYS-HOST | Host screen mount, transport, and hook binding. |
|  | `api/users-api` | NOT-PLANNED · OPUS-CLOUD | User-management contract and account mutation transport. |
| `desktop` | `asar-verify`, `durable-json-file`, `node-toolchain-host`, `speech/speech-host-config` | STAYS-HOST | Host packaging, storage, launcher, and speech bindings from the supplied census. |
|  | `desktop-memory-sampler` | NOT-PLANNED | Clock/process sampling contract and importer set not closed. |
| `contracts-headless` | `assistant-permanent-deletes-policy`, `assistant-tool-approval-policy`, `secret-form-cards`, `index` | NOT-PLANNED · OPUS-CLOUD | Delete/approval/credential card contracts and mixed barrel. The older ready sheet is not authorization to move them. |
|  | `plugin-install-source` | NOT-PLANNED | Host install vocabulary versus a generic source contract not verified. |
| `analytics` | `salt-context`, `warn` | STAYS-HOST | Frozen visitor/session context bytes and operator log prefix/sink are already injected. No renaming. |
| `asset-transfer` | `asset-destinations`, `asset-sources`, `copy-tool` | NOT-PLANNED | Host destination/source policy and human-confirm boundary. |
| `comments` | `index`, `tool-registrations` | STAYS-HOST | Provider and settings composition stay. Only the marker re-export is deleted by `SM-T03`. |
|  | `public-markers` | MOVE | `cms/src/comments/site/public-markers.ts`. `SM-J03`/`SM-T03`. |
| `consent` | `host-bindings`, `privacy-defaults-reporter`, `request`, `revisions.repo` | NOT-PLANNED · OPUS-CLOUD | Host consent policy, request data, reporter, and revision persistence. |
| `content-duplication` | `tool-registrations` | NOT-PLANNED | Host copy naming, metadata, and contributor wiring not closed. |
| `content-types` | `write-service` | STAYS-HOST | Injects the host reserved route vocabulary into the shared authorization-first write owner. |
|  | `content-type-repo`, `publish-content`, `tool-registrations` | NOT-PLANNED | Site DB, publish handler, and contributor/error work not closed. |
| `database` | `adapter.sqlite`, `db-messages`, `agent-tools`, `repo.memory`, `tool-registrations` | NOT-PLANNED | Per-file split of engine, product messages, and site maintenance wiring not verified. No maintenance mutation to Sol. |
| `email-templates` | `operations`, `tool-registrations` | NOT-PLANNED | Host/domain mail collaborators and tool exposure not closed. |
| `entries` | `entry-repo`, `publish-content` | NOT-PLANNED | Site kernel and publish-lane coupling. |
|  | `unreadable-owner-entries-repair` | NOT-PLANNED · OPUS-CLOUD | Owner repair and persisted-content boundary. |
| `form-destinations` | `connection-port`, `key-store`, `port`, `registry` | NOT-PLANNED · OPUS-CLOUD | Credential and connection boundary. No domain implementation imports added to CMS. |
| `fs-files` | `agent-tools`, `fs-files`, `layout`, `tool-registrations` | NOT-PLANNED · OPUS-CLOUD | Host file scope and mutation policy not split from shared behavior. |
| `image-transform` | `tool` | NOT-PLANNED | Media port and contributor importers not closed. |
| `mail` | `capture-clear` | NOT-PLANNED · OPUS-CLOUD | Existing clear operation and its scope. |
|  | `index` | NOT-PLANNED | Host mail assembly versus shared exports not closed. |
| `mail-status` | `delivery-tool-registrations`, `provider-operations`, `provider-tool-registrations`, `tool-registrations` | NOT-PLANNED | Provider/status interfaces, host tooling, and model-facing error boundaries. |
| `media-generation` | `provider-credential-save`, `providers-tools`, `tool-registrations` | NOT-PLANNED · OPUS-CLOUD | Provider credential save and tool exposure not separated. |
| `media-import` | `tool-registrations` | NOT-PLANNED | Host import collaborator and tool composition not closed. |
| `member-login` | `credentials`, `index`, `providers`, `ready-providers` | NOT-PLANNED · OPUS-CLOUD | Sign-in provider and credential wiring. |
| `members` | `mail-transport`, `repo.sqlite`, `tool-registrations` | NOT-PLANNED · OPUS-CLOUD | Sign-in transport, site repositories, and membership mutation/consent. |
| `navigation` | `tool-registrations` | NOT-PLANNED · OPUS-CLOUD | Host binds raw HTML permission and the ordered model-facing error allowlist. Do not use the ready sheet as written. |
|  | `migrate-footer-page-links`, `page-target-resolver`, `publish-content` | NOT-PLANNED | Host page links/site DB and publish-lane coupling. |
| `object-storage` | `artifact-provider`, `media-store` | NOT-PLANNED | Site storage binding and package implementation edges not split. |
| `observability` | `test-error-message` | STAYS-HOST | Product string shared by the host route binding and tool description. No args object in this module. |
| `permanent-delete` | `tool-registrations` | NOT-PLANNED · OPUS-CLOUD | Permanent-delete approval gateway and tool wiring. |
| `presentation` | `index`, `repo.sqlite`, `set-active-theme` | NOT-PLANNED | Site DB, theme-owner boundary, and analytics adapter. The telemetry wrapper is not a verbatim move. |
| `publish-content-ui` | `host-binding`, `sections` | STAYS-HOST | Host publication binding and product section vocabulary. |
|  | `index`, `policy` | NOT-PLANNED | Publish companion scope and policy ownership not closed. |
| `recovery` | `capability-card`, `gated-hooks`, `tool-registrations` | NOT-PLANNED · OPUS-CLOUD | Restore/gated write behavior and host composition. |
| `redirects` | `repo.sqlite` | NOT-PLANNED | Site kernel/table binding and consumer set not verified. |
| `seo` | `index` | NOT-PLANNED | Site settings and active-principal lookup binding. |
| `server-logs` | `process-source` | NOT-PLANNED · OPUS-CLOUD | Host process source and log-data boundary. |
| `site-inspection` | `admin-screens.generated` | STAYS-HOST | Generated from Tovu `ADMIN_PANELS`; the host manifest test enforces that ownership. |
|  | `agent-tools`, `deps`, `index`, `tool-registrations` | NOT-PLANNED | Host screen data, domain composer, and contributor edges not closed. |
| `site-search` | `cms-search-rules` | NOT-PLANNED | Host CMS search rules and search-package port boundary. |
| `skills` | `install-adapters` | STAYS-HOST | Constructs Node filesystem/archive/YAML adapters, preserving the failsafe YAML policy. |
|  | `site-host` | NOT-PLANNED | Host layout and install composition; legacy-read/new-write state filename behavior must be preserved. |
| `taxonomy` | `agent-tools`, `gated-hooks`, `publish-content`, `tool-registrations` | NOT-PLANNED | Host catalog additions, approval wiring, and publish ports not closed. |
| `tool-audit` | `repo.sqlite` | NOT-PLANNED · OPUS-CLOUD | Site DB and audit-data/redaction boundary. |
| `vendor-credentials` | `index`, `repo.memory`, `types`, `vault-adapter`, `vendor-credential-repo.sqlite`, `vendor-credential-repo` | NOT-PLANNED · OPUS-CLOUD | Vault and keyring ports, schema, and credential semantics. The ready `types` file is not cleared independently. |
| `web` | `agent-tools`, `tool-registrations`, `web-page` | NOT-PLANNED | Host outbound/live-render policy and contributor boundaries. |
| `web-screenshot` | `agent-tools` | STAYS-HOST | Static catalog contains product-specific copy without an existing args object. Do not rename literals or add a forwarding shell. |
|  | `tool-registrations` | NOT-PLANNED | Host outbound and capture policy dependencies not closed. |
| `webmcp` | `published-html` | NOT-PLANNED · OPUS-CLOUD | Published surface filtering and host policy. |
| `widgets` | `media-html-log` | STAYS-HOST | Binds host console sink, message text, and argument layout to shared diagnostic events. |
|  | `deps`, `publish-content`, `tool-registrations` | NOT-PLANNED | Post dependency, publish-lane ports, and host contributor wiring. |
| `platform-html` | `menu-render`, `published-webmcp-strip`, `safe-url` | NOT-PLANNED · OPUS-CLOUD | Product marker/URL policy and stale destination/ownership assumptions in the ready sheet. |
| `platform-mail` | `adapter-module`, `adapters/smtp.nodemailer`, `delivery-availability`, `index`, `sender-identity` | NOT-PLANNED | Vendor adapter, configured sender, and host transport edge not split. Credential handling stays with cloud. |
| `platform-routing` | `adapter` | STAYS-HOST | One host routing instance binds publication visibility, clock, and operator error channel. |

No new work is assigned for zero-count `change-sets`, `domain-dns`, `plugins`, or `workspace`. The agreed keeps are unchanged. Those include the 202 desktop keeps, ten `sites` keeps, `origin/configured-origin.ts`, `platform/routing/index.ts`, `content-duplication/copy-naming-policy.ts`, `database/gated-hooks.ts`, `fs-files/site-file-request.ts`, and `media-import/fetch-image.ts`.

## STOP conditions

- **Stop the affected T half** if the branch differs at a listed import, a new consumer appears, or a deletion would leave a stale dynamic import, barrel entry, or test runner path. Do not use a forwarding shell. A concurrent route-lane edit needs reconciliation, not a second route implementation.
- **Stop the affected J half** on a destination or export collision, a required package-implementation import, an unverified host copy/policy substitution, or a function over 80 lines or complexity over 10. Do not resolve those by deleting the why-comment, adding a blanket dependency exception, or substituting a new literal.
- **Stop Sol** on authorization or approval behavior, credential/token/key handling, redaction, or deletion. Existing compatibility must hold for API key prefixes, webhook headers, serialized error bodies, title defaults, and any frozen key bytes. No sheet authorizes changing one of those values.
- **Stop cloud promotion** if characterization or host integration tests fail, if a named mutation does not turn its targeted test red, or if the API diff contains a removal or unrelated change. Revert each mutation before completing validation.
- **Do not auto-dispatch a NOT-PLANNED row.** Its planner path and batch are context, not an executable replacement for the missing seam and importer verification.
