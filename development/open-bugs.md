# Open bugs

Known behaviours that are kept on purpose for now. Each one has a name; reports refer to it by that name.
Fixing one is its own piece of work: write the failing test first, then change the code.

## Preserved (pinned by tests, not fixed)

Logged in extract session 1, batch V1, when `cloud/more-jini-1` was merged. The revert code now lives in
Jini `packages/cms/src/core/commands/revert.ts` (public entry `@jini-ai/cms/core/commands`); Tovu
imports it directly.

### `L079-force-without-principal-kind`

`revertChangeSet` called with `force: true` and no `principalKind` skips the stale version check, so a
revert can be applied over a row that changed after the change set was recorded. Only
`principalKind: "agent"` is refused under `force`.
Pinned by `apps/website/src/contracts/core/commands/__tests__/revert.unit.test.ts`,
"L079: force without principal kind bypasses stale versions (reported, not fixed)".

### `L079-partial-inverse-failure`

When a change set's inverses are applied in reverse order and a later inverse fails, the inverses
already applied stay applied. The revert is not all-or-nothing.
Pinned by the same file, "L079: a later inverse failure leaves earlier writes applied (reported, not fixed)".

## Stale documentation (text kept byte-exact)

### `snapshot-stale-header`

Jini `packages/db/src/data-modules/snapshot.ts`, the comment above `discardCommittedSnapshot`, says a
failed migration "leaves the entry non-terminal". The code marks the journal entry `ROLLED_BACK`, which
is terminal; the snapshot file itself is kept. The comment moved byte-exact and was not edited.

## Pre-existing test failures seen while checking other work

### `plugin-host-bundled-identity`

`apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts`,
"every bundled agent and site package declares a distinct publisher identity and discovery terms",
fails with `unknown/charts-recharts` where `jini/charts-recharts-agent` is expected. The bundled Jini
manifests now declare their id under `extensions.jini`; the test reads identities with namespace `tovu`.
Seen in V1; it fails the same way on the V0 tip (before the merge), so the merge did not cause it.

## Resolved during extract session 2 continuation

### `A1-explicit-undefined-credential-metadata`

Moving the existing credential card builders and router into Jini exposed explicit `undefined`
properties accepted by Tovu's compiler but rejected by Jini's exact optional-property settings.
The development UI/agent-plugins builds demonstrated the type errors. The new UI test
`uses the host app identity and complete plugin metadata without introducing absent hints`
fails when the original hint mapping is restored (`hint: undefined`); the mutation was red.
The fix keeps absent hints absent, narrows always-present detail/description return types, and
explicitly permits already-supported undefined inputs in consumer-local loader/router types.
Card copy and submitted/saved data are unchanged. The corrected G-card fixture pins rendered parity.

## Incomplete at extract session 2 Continuation 2 stop

### `A2-resend-positional-http-abi`

The real bundled plugin calls positional `httpClient.send(request)` while the core port expects
`send({ request })`. New neutral-host `mail-port-regression.test.ts` demonstrated red with the
object-request fake (result.ok false). A draft `toPluginHttpClient` adapter makes that regression
green without editing the plugin. Mutation confirmation and the complete A2 gate were not run:
the required `parseSetup` change exposed a separate existing neutral-host test that needs wiring,
which triggers the brief's explicit stop rule. This entry is not a completed fix claim.

### `A2-resend-positional-http-abi` — Continuation 3 verification

The real plugin regression now passes through the public `toPluginHttpClient` adapter. Removing
the object-request wrapping from the adapter makes that regression red again; source bytes were
restored and platform rebuilt. The refusal and HTTP-header mutations each make the frozen
pre-move mail golden red. No plugin edits; no fixture regeneration. Full A2 results are recorded
in `cloud/reports/extract-s2.md`; this note supersedes the unfinished mutation status above.

## Found at combine-7 (Tovu `integ/merge-7-2026-11-20`, 2026-11-21) — listed, not fixed

### `C7-plugin-contribution-filenames`

Jini merge-7 (jy-pay K9) renamed every bundled agent-plugin contribution file from `tovu-*.json` to
`jini-*.json` (`cloudflare/jini-deploy-targets.json`, `github/jini-source-control.json`, …), but the
Tovu host still loads the old names through 14 filename constants (`DEPLOY_TARGETS_FILENAME`,
`DEPLOY_OPS_FILENAME`, `DEPLOY_CONFIGS_FILENAME`, `SOURCE_CONTROL_PROVIDERS_FILENAME`,
`MAIL_ADAPTERS_FILENAME`, `LOGIN_PROVIDERS_FILENAME`, `SEARCH_PROVIDERS_FILENAME`,
`OBJECT_STORES_FILENAME`, `CONSENT_CONTRIBUTIONS_FILENAME`, `API_CONNECTIONS_FILENAME`,
`AGENT_PLUGIN_TOOLS_FILENAME`, `ADMIN_SURFACES_FILENAME`, `CREDENTIAL_SCHEMES_FILENAME`,
`FORM_DESTINATIONS_FILENAME`), the three literals in `composition/plugin-credential-cards.ts:71-73`
and `site-backup/share-file-policy.ts:9`. Against Jini merge-7 the bundled plugins' contributions
do not load (e.g. `site-backup/__tests__/tool-registrations.unit.test.ts` 62/84 fail with ENOENT
`…/agent-plugins/github/tovu-source-control.json`). Red since the relink. Full list:
`cloud-results/combine-7-tovu-renamed-plugin-file-refs.txt`. Owner 11-20 accepted the rename; the
Tovu repoint (and whether third-party `tovu-*.json` keeps loading) is a decision.

### `C7-jini-directory-trash-exdev-cause`

tv-xd5-publish deleted Tovu's `features/trash/adapters/directory.ts` in favour of Jini's
`@jini-ai/cms/trash/adapters/directory` (`directory.node.ts:82`). Merge-6 had added
`{ cause: error }` to the cross-filesystem (`EXDEV`) error in the Tovu copy (04d030b5a); Jini's copy
throws without the cause, so the original errno is lost. Needs the fix in Jini.

### `C7-theme-preview-refresh-public-barrel`

`server/inbound/public-http/middleware/theme-preview-refresh.ts` (tv-xd5-publish) imports
`themeRosterPorts` from `#src/features/theme/index`, so the public request path loads feature-wide
barrels (`worker-import-graph.test.ts` new failing case "…theme-preview-refresh.ts keeps public reads
separate from feature-wide write/tool barrels").

### `C7-y1-credential-label-prefix`

tv-y1 T5 changed `server/runtime/composition/modules/site-search.ts` `SEARCH_CREDENTIAL_LABEL_PREFIX`
to `"Jini Search — "`; the prefix builds the credential label the search vendor lookup uses, so a site
that saved `Tovu Search — <vendor>` before may no longer resolve it (not verified end to end).
`site-search.unit.test.ts` ×2 still expect `Tovu Search — …`. Opposite drift in the same sheet:
`mail-provider-contribution.unit.test.ts` expects `Jini Mail — Resend API` while
`agent-plugins/mail-adapter-registry.ts:10 defaultCredentialLabel` still returns `Tovu Mail — …`.

### Fixed during combine-7 (for the record)

- `apps/desktop/src/renderer/App.tsx:97` `...props,` (rest element with a trailing comma, from
  7b4fea84a) — the desktop renderer did not compile; fixed `8ec117a4a` together with the desktop's
  positional `collectProcessTreePids` calls (Jini takes one object) and `site-backend.ts` generic
  `ReturnType`s.
- `@tovu/contracts` imported `@jini-ai/agent-runtime` undeclared (tv-ext-rs-c a52) — the packaged
  desktop would miss it; declared in `196e536c8`.

## cloud-bugs-1120 (Tovu `fix/cloud-bugs-1120`, 2026-11-21)

Triage of the 46 cloud-only rows (`origin/plan/culls-1120:cloud-bugs/list.md`) is in
`cloud-results/cloud-bugs-1120.md`; rows not listed here were already fixed on the merge-7 bases,
belong to the lockfile/release run, or need a packaged app / real provider (see that table).

### `552-check-scripts-in-server-build` — FIXED-ON-BRANCH `f57b409e0`
- Snapshot row 552 (11-02): build-time check scripts shipped in the desktop payload's `dist/src`.
  `seal-aad-invariant.ts` had been excluded; `features/webhooks/secret-scan-guard.ts` and
  `features/identity/default-credential-exposure.ts` (run from source by `check:secret-scan` /
  `check:default-credential`) were still compiled by `tsconfig.json`. Now excluded;
  `tsconfig.tests.json` still type-checks them. Test: `development/scripts/__tests__/app-runtime-dependencies.test.ts`
  "repo-scanning check scripts run from source and never ship in the server build" (red on the base).

### `1280-optional-peer-contract` — confirmed, listed (Jini, not fixed)
- Jini `scripts/__tests__/optional-peer-contract.test.ts` 3/151 red at `06559affb`: stale pins
  `ui → lexical` and `daemon → express` (neither manifest nor source has them any more) and four
  `jini.optionalPeers` texts that do not name their opt-in subpath (agentic → protocol, platform → parse5,
  user-management → ui-kit / react-dom). The other two parts of row 1280 are green after a clean install.

## combine-8 (Tovu `integ/merge-8-2026-11-21`, 2026-11-21)

Found while merging combine-8 against Jini `integ/merge-8-2026-11-21` `3ad0c5671`. Listed, not fixed
(none blocks build or typecheck). Details: `cloud-results/combine-8-tovu.md`.

### `C8-github-managed-manifest-path` — confirmed (Jini rename, no migration)
- Jini `d9c625e6` changed the GitHub commit-site adapter's ownership manifest from
  `<folder>/.tovu/managed-files.json` to `<folder>/.jini/managed-files.json`
  (`packages/agent-plugins/github/source-control/commit-site.mjs:35`), with no read of the old path.
  A repository that Tovu already published to keeps its record under `.tovu/`; after the upgrade the
  adapter cannot see which files it owns (orphaned/unowned files on the next commit).
- Tovu `content/agent-plugin-overlays/github/GUIDANCE.md:78` still tells the agent `.tovu/managed-files.json`.
- Witness: `apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-commit-site.unit.test.ts`
  goes 1 → 37 red now that tv-c7a makes the bundled plugin load (fetch `…/static_sites/.jini/managed-files.json`
  where the test expects `.tovu/`). Decision needed: dual-read/migrate in Jini, or accept and repoint the tests.

### `C8-dev-select-node-runtime-env` — confirmed (dev tooling)
- Jini merge-8 made `@jini-ai/devops/local-dev#selectNodeRuntime({ searchFrom, nodePath, env })` require
  `env` (the option default was removed). `development/scripts/dev.mjs:861` still passes only
  `{ searchFrom, nodePath }`, so the desktop-Electron probe spawns with `{ ELECTRON_RUN_AS_NODE: '1' }` and
  no PATH/HOME; a probe that needs them fails and `npm run dev` silently falls back to stock Node.
  `.mjs`, so no typecheck catches it. Fix: pass `env: process.env` (owed by the Jini combine-8 notes).

### `C8-css-unrenamed-jini-classes` — confirmed (visual, admin)
- Tovu styles Jini components through `.jini-*` selectors that Jini never emits (jy-cls skipped them):
  `apps/admin/src/integrations/jini-admin/jini-media.css:601` `.jini-tab-bar-tag` and `:613` `.jini-tab-bar-dot`
  (Jini `ui/…/tab-strip/react/components/TabBar.tsx:108,116` emits `tab-bar-dot` / `tab-bar-tag`), and `:781`
  `.jini-row-menu-popup-above` (Jini `admin/…/RowMenu/RowMenu.tsx:106` template literal ` row-menu-popup-above`).
  Those rules never match. Full reverse-check list (26 selectors): `cloud-results/combine-8-tovu-class-audit.txt`.

## combine-9 (Tovu `integ/merge-9-2026-11-21`, 2026-11-21)

Found while merging combine-9 against Jini `integ/merge-10-2026-11-21` `de4e555b9`. Listed, not fixed
(none blocks build or typecheck). Details: `cloud-results/combine-9-tovu.md`.

### `C9-share-zip-refusal-vs-acknowledgement` — confirmed (tv-sharezip T5 vs the existing acknowledgement flow)
- tv-sharezip T5 (`apps/website/src/features/site-backup/share-backend.ts`, `requireNoShareCredentialWarnings`,
  called right after both ZIP builds) now throws `SiteShareRefusal` `UNSAFE_FILE` whenever the ZIP collector
  records any credential warning. Before it, the same warnings produced a share with
  `needsAcknowledgement: true`, a 403 `ACKNOWLEDGE_CREDENTIALS` download block and a
  `POST …/site-shares/<id>/acknowledge` route. That whole acknowledgement path is now unreachable.
- Red on the tip, green on the base (merge-8 + lockfile pair): `features/site-backup/__tests__/credential-warnings.integration.test.ts`
  "export keeps database values and complete plugin packages; download requires a durable acknowledgement"
  (`SiteShareRefusal: The export contains files with possible credentials…`), and
  `features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts` "exports and imports contain
  no saved keys or inherited grants" (inSite) and (appData): the admin export route returns 400
  `{"code":"UNSAFE_FILE","message":"Export creation failed: The export contains files with possible credentials…"}`
  where the test expects 200.
- Effect: a site whose files carry anything credential-shaped can no longer be exported or shared at all;
  previously the owner could review and acknowledge. Decision: keep the hard refusal (then delete the
  acknowledgement route/state and repoint the 3 tests), or scope T5 to the public-token share and keep the
  acknowledged download for owner exports.

### `C9-site-chat-lockfile-stale` — confirmed (release/lockfile-1120 left one lockfile behind)
- `release/lockfile-1120` bumped `apps/site-chat/package.json` (`@jini-ai/agentic`, `chat`, `core`, `protocol`
  → `^0.7.3-next.1`) but did not regenerate `apps/site-chat/package-lock.json`, which still pins 0.7.0.
  `npm ci --ignore-scripts` in `apps/site-chat` fails: `EUSAGE … lock file's @jini-ai/agentic@0.7.0 does not
  satisfy @jini-ai/agentic@0.7.3-next.1` (also chat, core, protocol). Root/admin/desktop `npm ci`: 0.
  Fix: `npm install` in `apps/site-chat` against the published 0.7.3-next.1 and commit the lockfile.

## combine-10 (Tovu `integ/merge-10-2026-11-21`, 2026-11-21)

Follow-ups and cloud items on top of combine-9, against Jini `integ/merge-10-2026-11-21` `de4e555b9`.
Details: `cloud-results/combine-10-tovu.md`. **No new production bug found.**

- `C9-site-chat-lockfile-stale`: **FIXED** in `47dd8b157`. Only the `@jini-ai/*` entries were re-resolved
  to 0.7.3-next.1; every other locked version is unchanged. `npm ci --ignore-scripts` in `apps/site-chat`: 0.
- `C9-share-zip-refusal-vs-acknowledgement`: **still open**. Owner decision pending; tv-sharezip left as merged.
- Not production: the 3 tv-w2 I2-T media reds and the 3 lockfile-1120 pin reds were stale tests (repointed in
  `ab038aae8` and `75900acdf`). `byte-size.ts` still reports `null` for an unknown size.
- Test infrastructure (not production): with `TOVU_CHAT_TEST_POSTGRES_URL` set, every `*.dialects.test.ts`
  file shares one real Postgres database. `chat-dialect-matrix.ts` `emptiedPostgresChatKernel()` truncates the
  four `ai_chat.*` tables per make, so files running at the same time wipe each other's rows. Each file is green
  alone. Needs a per-process database/schema, or serial dialect files.

## combine-11 (Tovu `integ/merge-11-2026-11-21`, 2026-11-21)

Eleven merges on top of combine-10, against Jini `integ/merge-11-2026-11-21` `1ac1cbbd1` (published 0.7.3-next.2).
Details: `cloud-results/combine-11-tovu.md`.

### `C11-agui-run-error-raw-message` — OPEN (tv-ag1 × bugs1 T4)
- bugs1 T4 changed the catch in Tovu's own `drainAgUiStream`. On a dropped daemon stream the AG-UI `RUN_ERROR`
  carried the approved sentence "The assistant’s response was interrupted. Send your request again." in place
  of the transport text.
- tv-ag1 deleted that function, and Tovu now calls Jini `drainRunFramesToAgUi`. Its catch
  (`packages/chat/src/core/ag-ui/event-projection.ts:280` at `1ac1cbbd1`) writes `error.message` again.
- Witness: `assistant-ag-ui-wire.golden.test.ts` "a dropped daemon stream closes partial text and reports a
  private interruption message" fails with actual `'aborted'`.
- Fix options: a Jini change (a fixed message, or a host-supplied `interruptedMessage`), or a Tovu `write`
  wrapper that rewrites the catch-path `RUN_ERROR`. Not one line, so not fixed in combine-11.

### `C11-share-ack-403-admin` — FIXED (`c3ac7bd03`)
- bugs1 SHARE-ZIP moved `site-shares.ts` acknowledgement-required downloads from 409 to 403.
- The admin `use-share-credential-gate.hooks.ts:69` still opened the acknowledgement checkbox only for 409.
  The owner saw "Download failed." for a warned export.
- Fixed in one line (`!== 403`). The sheet's admin test is now 16/16.

### `C11-stage-payload-empty-refusal` — FIXED (`623bbbab7`), only on the merge
- main `d2edbcb43` added `failIfShellIsIncomplete` with `fail(string)`. The integ object-arg refactor's `fail`
  takes `{ message }`, so the refusal printed nothing (desktop tsc TS2345).
- Fixed in one line.

### `C11-installed-plugin-id-upgrade` — OPEN (known PARTIAL, now with a failing proof)
- Installed `tovu/<x>` bundled plugins from 0.7.2 (25 IDs) never reach `jini/<x>`. Canonical seeding keeps the
  old revision silently.
- Witness: `installed-plugin-id-upgrade.unit.test.ts` (red).

### Not production / listed
- `C10-A7` real-Postgres dialect contention: **FIXED** in test support (`1baf41c6f`).
- `vendor-neutrality` "no generic seam file names the first provider": 4 hits outside T-VENDOR's scope
  (`bundled-catalog.ts:47,48,57`, `shared-owner.ts:81`). This is BASE-RED and meets the T-VENDOR STOP.
- New complexity violations (CI step is non-blocking): `backup-service.ts:681 pushPlannedBackup` 11 (tv-own Q3),
  `use-copy-keys.hooks.ts:24 useCopyKeys` 11 (tv-gate T46), `plugin-activation-polling.ts:46
  reconcilePluginActivationsOnce` 13 (main's backoff in integ's signature).
- Size: `backup-service.ts` 547 (baseline 535).
- why-comments: 77 → 79 (`b3ec582b7325`, `096121b6167d`).

## combine-12 (Tovu `integ/merge-12-2026-11-22`, 2026-11-22)

Five merges on top of combine-11, against Jini `integ/merge-12-2026-11-22` `6b8e0d48a` + local `codex/jx-chatlinks`.
Details: `cloud-results/combine-12-tovu.md`.

### `C12-seed-upgrade-missing-ids` — FIXED (`748c032db`)
- tv-seed-upgrade's `RENAMED_TO_JINI` (`features/agent-plugins/bundled-id-upgrade.ts`) listed 23 IDs. combine-11
  measured 25 bundled packages that `@jini-ai/agent-plugins` 0.7.2 shipped as `tovu/<id>` and next.2 ships as
  `jini/<id>`. Missing: `calendly` (Tovu seeds it) and `shopify`. A site holding either kept the pre-rename copy
  and hit a seed conflict on every boot.
- Witness: `bundled-id-upgrade.unit.test.ts` "the rename map covers every bundled package 0.7.2 shipped as
  tovu/<id>" (red `['calendly','shopify']` before the fix).

### `C12-howto2-form-id-pointer` — FIXED (`8cef2d19b`)
- tv-howto2 W8 dropped "listed by forms_list_definitions" from the page HTML `form` marker, so `pages_write_html`
  and `pages_write_region` no longer said where a form ID comes from. The pointer is kept beside W8's new words.

### `C11-agui-run-error-raw-message` — FIXED (`a6a94d354`)
- Tovu passes its approved sentence to Jini `drainRunFramesToAgUi(ctx, { interruptionMessage })`.

### `C11-installed-plugin-id-upgrade` — FIXED (tv-seed-upgrade merge `25cba763c` + `748c032db`)

### Not production / listed
- The new `Load latest` button in both conflict banners has no `data-agent-element/role/label` (siblings do).
- Gate debt: size Worsened `PageEditor.tsx` (file 1015, `PageEditor` 221, `PageEditorPane` 128),
  `usePageEditor` 384, `usePostEditor` 410 (tv-bugs3b); error gate WARN `catch-reads-error` in
  `bundled-id-upgrade.ts` (5), `lifecycle.ts` (1), `use-page-editor.hooks.ts` 2 → 3; architecture NEW edge
  `site-backup/push-content.ts → source-control/provider-module.ts` and boundaries no-circular
  `backup-service.ts ↔ push-content.ts` (tv-bugs3a B8a); why-comments 79 → 80 (`3ee47e16609e`, tv-howto2).
- Cleared: complexity 3 → 0 and size `backup-service.ts` (tv-bugs3a).

## combine-13 (Tovu `integ/merge-13-2026-11-22`, 2026-11-22)

Three P9 extraction merges (ex-sh, ex-core, ex-export) on top of combine-12, against Jini `integ/merge-13-2026-11-22`
`7c4ee7881` (READY content `e4e3bf175`). Details: `cloud-results/combine-13-tovu.md`.

**No production bug found.** No Tovu consumer of RT-3's removed `@jini-ai/agent-plugins/commerce/server` exists
(Tovu's commerce composition imports `@jini-ai/commerce` directly).

### `C13-overlay-tests-deleted-shell` — FIXED (`0d7f78fa4`, test harness, not production)
- ex-sh (SH-2) deleted `apps/website/src/features/agent-plugins/mcp-metadata.ts`. Six
  `content/agent-plugin-overlays/*/__tests__/*.test.mjs` files imported it by a relative path that the SH importer
  rewrite did not see, and crashed with `ERR_MODULE_NOT_FOUND` (composio, fly, higgsfield-media, supabase
  connection/manifest tests, resend bundled-mail and resend-mcp). They now import `parseAgentPluginMcpConfig` from
  `@jini-ai/agent-plugins/lifecycle`, the module the shell forwarded. Import line only.

### Pre-existing, listed (BASE-RED at `41e948ee4a`, not fixed)
- `C13-overlay-core-primitives-uuid`: 4 overlay tests import `createRandomUuidGenerator` from
  `@jini-ai/core/primitives`, which Jini moved to `@jini-ai/platform/system` (`2d0216d6`, before merge-12):
  `resend/resend-mcp`, `github/source-control-tool-wiring`, `google-workspace/form-delivery.e2e`,
  `google-workspace/sheets-admin-host-schema.security` (via `sheets-admin-harness.mjs`). Each fails to load.
- `C13-test-writes-dev-site`: a node test seeds agent-plugin packages into the repo's own
  `sites/tovu-dev/agent-plugins/ws/workspace-local/` (and a root `chat.db` appears), leaving untracked files after a run.
- `M3-a` coverage gap: no Tovu test kills a negated `evidence.source !== "workspace-setting"` in
  `exportPublicOrigin` (now Jini devops); Jini's own characterization test does.
- Stale `development/scripts/check-architecture.baseline.json` edge rows naming files the merges deleted
  (`form-destinations/types.ts` ×4, `member-login/types.ts`, `entries/index.ts`, `taxonomy/index.ts`,
  `presentation/active-theme-id.ts`). The gate does not fail on them.

## ex2-holds-tovu (Tovu `codex/ex2-holds-tovu`, 2026-11-22)

Owner-approved holds on top of combine-13 (`0d7f78fa4`, Jini merge-13 linked). Details: `cloud-results/ex2-holds-tovu.md`.

### `C043` Tier-2 plugin worker import allowlist — FIXED (`5be5b781c`; review fixes on `codex/ex2-holds-tovu`, security MED)
- The import policy lives in Jini's Node worker adapter (`@jini-ai/plugins/host/worker` `registerTier2ImportPolicy`, Jini
  `codex/ex2-holds-tovu-jini`). For modules inside a plugin package it refuses every bare specifier except the SDK
  specifiers (`node:fs`, `child_process`, npm packages, `data:`) and any path that resolves outside the package.
- SDK-only by default. Coordinator decision (owner may revisit): the registered content-analyzer entry also gets exactly
  `@jini-ai/cms/seo/content-analysis` and `#src/platform/html/slug`, injected by Tovu's worker entry (`TIER2_IMPORT_POLICY`).
  No directory is exempt.
- Set up on the real-import path, so a malformed entry URL is a structured `stage: "import"` reply.

### `C115` disk-space 507 reported as an incident — FIXED (`46fc4f901`)
- `adminFailureResponse` returns the typed `DatabaseDiskSpaceError` refusal before logging/reporting; no incident,
  no error ID. An explicit status override still reports.

### `C026` vendor names in generic seam files — PARTIAL (`8f6818798`), still OPEN
- `shared-owner.ts:81` reworded (plain-English "picker"). The guard still lists 28 hits (combine-11 had 4).
  Two are new production seam hits: `admin-surfaces/public-config.ts:15` (`JINI_GOOGLE_PICKER_*` in the generic
  public-name pattern) and `api-connections/contribution.ts:77` (`google-workspace` → `JINI_` client namespace).
  `bundled-catalog.ts:47,48,57` need an owner call (inventory allow-list) and Jini manifest `soon` flags.

## bugs-high (Tovu `codex/bugs-high-tovu`, 2026-11-23)

HIGH rows of `plans/P8-triaged-backlog.md` (plan branch `plan/whats-left-1122`), on base
`integ/merge-13-2026-11-22`. Each fix has a failing test first and a named mutation. Commits are listed in
`cloud-results/bugs-high.md`.

### `B151-enable-owner-disabled-admin` — FIXED on `codex/bugs-high-tovu`
- `POST users/:id/enable` (and the assistant's `identity_user_enable`) only checked `user.manage`, so an admin
  could turn back on an admin the owner had disabled. Both now run `assertUserAccountAction(action: "enable")`
  in the write's transaction: only an owner may re-enable an admin or owner account.
- Test: `account-protections.test.ts` "HTTP enable: a non-owner admin cannot re-enable an owner-disabled admin".
  Mutation: guard action `enable` → `reset-password` (no owner rule) — red.

### `B152-reset-password-trash-before-permission` — FIXED on `codex/bugs-high-tovu`
- `POST users/:id/reset-password` looked the user up in the Trash before checking the caller's permission, so a
  caller without `user.manage` got `409 USER_IN_TRASH` and learned the user was trashed. The permission check now
  runs first (as `enable.ts`), so that caller gets 403.
- Test: `account-protections.test.ts` "HTTP reset-password: a caller without user.manage gets 403 for a trashed
  user, not USER_IN_TRASH". Mutation: move the permission check after the Trash check — red.

### `B140-chat-rename-title-not-redacted` — FIXED on `codex/bugs-high-tovu`
- `PATCH /api/assistant/chats/:id` stored the typed title as-is, so a credential pasted into a rename was saved in
  the chat list (the first-message seed and messages were already redacted). `parseRenameTitle` now runs
  `redactUserText` before storing. Already-stored titles are not scrubbed (owner question 3 in P8).
- Test: `assistant-chats-routes.test.ts` "renamed title with a token is stored redacted". Mutation: skip the
  redactor — red.

### `B211-search-plugin-activation-site-root` — FIXED on `codex/bugs-high-tovu`
- Site search asked "is this provider plugin on?" at the site-level `agentPluginLayout.root`, where no activations
  file lives, so a provider plugin the operator disabled kept receiving index writes and visitor queries. The check
  (now `bindSearchPluginActivity`) reads `agentPluginLayout.forWorkspace({ workspaceId }).root`, as `app.ts` does.
- Test: `site-deps/__tests__/search-plugin-activity.unit.test.ts`. Mutation: read `layout.root` again — red.
- Unrelated, pre-existing: 32 `site-deps` characterization tests ("slice call missing") fail on the base too.

### `B190-widget-embed-entry-id-schema` — FIXED on `codex/bugs-high-tovu`
- The admin editor writes `attrs.widgetEntryId` on every `widgetEmbed` node, but the post tool schema's
  `widgetEmbed.attrs` had `additionalProperties: false` without it, so strict MCP validation refused the node and a
  model had to strip it, losing which widget the embed shows. The schema now lists it ("Keep it when present").
- Test: `agent-tools.tiptap-node-vocabulary.test.ts` "widgetEmbed carrying widgetEntryId passes strict validation and
  keeps it". Mutation: drop the schema property — red.

### `C058-member-save-stale-overwrite` — FIXED on `codex/bugs-high-tovu`
- `SqlMemberRepo.save` accepted the write when the stored `version <= record.version`. Every caller saves
  `read.version + 1`, so two writers that read the same version both landed and the second silently overwrote the
  first. The guard is now strict (`<`); the Trash and credential-cutoff guards are unchanged. No other table uses the
  `<=` pattern (grep of `apps/website/src`).
- Test: `credentials-revocation.dialects.test.ts` "two saves from the same version: the second is refused" (sqlite +
  pglite). Mutation: restore `<=` — red on both dialects.

### `B218-plugin-note-rename-drops-text` — FIXED on `codex/bugs-high-tovu`
- In a plugin's Memory editor, typing a new file name replaced the note text with that file's saved text — a blank
  page for a new name — on every keystroke, so renaming a note being written threw the writing away. `setPath` now
  keeps edited text; only an unedited draft switches to the named note's saved text.
- Test: admin `agent-plugin-memory.hooks.unit.test.ts` "renaming a new note keeps its text; …". Mutation: always load
  the named note's text — red.

### `B216-byok-key-to-half-typed-base-url` — FIXED on Jini `codex/bugs-high-jini` (`e5f263d5`)
- Jini `ui` BYOK model discovery re-ran on every Base URL keystroke and sent the provider key to each half-typed
  host. It now waits until a typed Base URL is unchanged for 600 ms and is a complete allowed URL; preset/protocol
  picks still probe at once. Test: Jini `ExecutionTab.hooks.base-url.test.tsx`. Mutation: key the effect on the typed
  URL and drop the guard — red. Tovu picks it up with the next `@jini-ai/ui` release.

### Skipped in this run (fix belongs to an open lane branch)
- `B236` webhook owner `user-local` — `routes/integrations/create.ts` is changed by `codex/ex4-integrations-tovu`.
- `B217` menu leave guard — `MenuEditor.tsx` is changed by `codex/ex5-small-tovu`.
- `B233` stale collection sort — `WidgetConfigFields.hooks.tsx` is changed by `codex/ex5-collections-tovu`.
- `C043` tier-2 import allowlist — `plugin-tier2/worker.ts` is changed by `codex/ex2-holds-tovu`, which already
  carries a C043 import policy and `worker-import-allowlist.integration.test.ts`.

## bugs-medium (Tovu `codex/bugs-medium-tovu`, Jini `codex/bugs-medium-jini`, 2026-11-23)

MED rows of `plans/P8-triaged-backlog.md`, fixed test-first on the merge-13 (Tovu) / merge-14 (Jini) bases.
Full table: `cloud-results/bugs-medium.md`.

- `B146` — FIXED-ON-BRANCH (Jini): webhook update defaults `expectedVersion` to the version it read.
- `B166` — FIXED-ON-BRANCH (Jini): copy-plan store caps plans per principal.
- `B060` — FIXED-ON-BRANCH (Jini): sharp transforms never enlarge a small source.
- `B016` — FIXED-ON-BRANCH (Jini): Resend send passes Jini's `{ request }` shape too (plugin 0.2.4).
- `B176` — PARTIAL-ON-BRANCH: with consent unbound, the public confirm link shows a plain 503 page
  ("This subscription link can’t be confirmed right now. Ask the site owner.") instead of a 500, and
  the token stays unused. Still OPEN: tokens and confirmation emails are still issued while unbound
  (changing that touches every subscribe path and their tests; left for a design call).
- `B177` — FIXED-ON-BRANCH: campaign saves/schedules and single/bulk subscriptions refuse an archived
  list ("This list is archived.", `NewsletterValidationError` reason `archived`).
- `B201` — FIXED-ON-BRANCH: the External MCP reauth deep link points at `/addons/integrations?tab=external-mcp&server=<id>`.
- `B237` — FIXED-ON-BRANCH: WebMCP script injection finds `</body>` case-insensitively on the original HTML.
- `B165` — FIXED-ON-BRANCH: site import checks only the derived slug (trimmed), so names ending in "." or a space import.

## Visitor assistant chat ("Ask this site") — VISITOR-CHAT, 2026-11-23 (branch `codex/visitor-chat-tovu`)
The `development/todos.md` item "visitor assistant chat — show the model + UI pass" and any VISITOR-CHAT entries were not
present on `integ/merge-13-2026-11-22` when this ran; the five items from the dispatch are recorded here.
- `VISITOR-CHAT-cutoff`: **FIXED in `758461edf`** (budget + truncation notice; server integration tests written but **not run
  here**, see `cloud-results/visitor-chat.md`). Root cause: `site-assistant.ts` `VISITOR_MAX_OUTPUT_TOKENS` was 1024 and Gemini
  bills hidden thinking against it; `@jini-ai/agent-runtime` `googleLoopExitReason` reports `end: stop` for any reply without
  tool calls, so a `MAX_TOKENS` stop looked like a clean finish. Budget now 4096 (owner-reversible cost knob); a reply that
  still hits it ends `truncated` and the panel says so.
- `VISITOR-CHAT-jump-covers-bubble`: **FIXED in `05a4a6209`** (list bottom reserve 24px -> 56px). Needs the owner's browser check.
- `VISITOR-CHAT-send-looks-disabled`: **FIXED in `05a4a6209`** by making the states distinct (cause not reproducible
  without a browser; see report). Needs the owner's browser check.
- `VISITOR-CHAT-model-label`: **DONE in `758461edf` + `05a4a6209`** ("Answered by <model>" under the pane; hidden when unknown).
- `VISITOR-CHAT-first-prompt-failure`: **MITIGATED, root cause NOT found** — transport retries once before any reply byte,
  then shows a plain error plus a "Try again" bar. Reopen if it still fails twice in a row on a real site.
- `VISITOR-CHAT-vanilla-parity` (new, open): the Pure JS vanilla widget gets the truncation notice and the auto-retry (shared
  transport) but not the model label or the retry bar.
