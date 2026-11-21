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
