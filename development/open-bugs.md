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
