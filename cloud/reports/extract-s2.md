# Plugin extraction session 2

Latest status: corrected G-card GREEN; A1 GREEN after the approved required host messages correction. Continuation 2 STOPPED during A2 at its explicit additional-existing-test wiring rule. F2 was not started. The deadline was 07:44:33 UTC; this was an early stop, not a clock expiry. See the final stop record below.

Start: 2026-11-08 04:12:55 UTC. Deadline: 08:12:55 UTC. Shutdown reserve: 07:52:55 UTC. One serial task; no helper agents. No main merge or publication.

## Bases and branches

Remotes identify the checkouts as AINSEP/Tovu and AINSEP/Jini. Both remote `cloud/extract` pins verified with `git ls-remote`, fetched and resolved before tracked writes:
- Tovu: `dc08c79bc3c4daf2d8b79dbafc16444c507c31eb`.
- Jini: `35c4961af718f0f30591c46d2ea2756c4484a731`.
Both use new branch `cloud/extract-s2`. Initial tracked trees clean. Jini had six pre-existing untracked/ignored plugin directories left after switching from the environment branch; preserved outside package discovery under the scratch directory (no tracked files). Tovu has no AI-Dev-Shop as expected. The owner brief supplies the governing plan; neither is committed.

## Setup and baseline

Managed environment identity verified, network policy enforced, no configured secrets or outbound identities. Downloaded Node 24.2.0 official Linux tarball outside tracked paths. Versions: Node 24.2.0, npm 11.3.0, pnpm 10.33.2.
`CI=true pnpm install --frozen-lockfile` and `npm ci` passed on the unmodified pins (workspace cache overrides described below). All logs, process IDs and declaration baseline will be retained outside tracked source under `/workspace/work/extract-s2/`.
Local codebase-memory and Graphify indexes absent; understand-anything index inspected (stale 2026-07-25), source helpers cross-checked directly. No index installation. Historical architecture section files absent from this cloud checkout; supplied owner-approved brief governs this bounded extraction.

Tool metadata starting SHA256: `a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6` (`apps/website/src/assistant/__tests__/fixtures/tool-metadata.baseline.json`).

## Batch gates

| Batch | Paired SHAs | Commands/tests and results | Fixture hashes | UTC elapsed | Remaining work |
|---|---|---|---|---|---|
| Setup/baseline | starting pins above | PASS: full Jini build, recorded guard names/counts, plugins; Tovu SDK, link, contracts, tsc | Metadata above | 00:06 | Q1, Q2, G-card, A1, A2, F2 |
| Q1 | Jini `80a7ea2df06b20b26eadb8c7abe4462d0b55bebf`; Tovu `da81249eb75695b9ff3c73cf21634053dd2b7649` (report-only changes afterward) | PASS: 41/41 tests, script tsc, complexity, checker, identical guard record, plugins, verified pushes | Test SHA256 below | 00:13 | Q2, G-card, A1, A2, F2 |
| Q2 | Jini `ada68ff7d2cd2bad2495c368b99b2a32d45b34da`; Tovu `008eb932360b0e896aa2a726e66c019cd533b252` (report-only changes afterward) | PASS: 6 tsc, full build, 40 files / 727 tests, checker, guard record, plugins, Tovu tsc, verified pushes | Independent UI pin below | 00:27 | G-card, A1, A2, F2 |
| G-card | Last green pair below; no production changes | FAILED reachability: required creation + apply-card path is not covered; cited line is rotation | No new fixture or recording commit | 00:29 | G-card, A1, A2, F2 |

Last verified green paired batch: Q2 at the paired SHAs in the stop record below. Q2 inventory and type pin are recorded. G-card failed its reachability condition; no golden fixture was recorded. Existing tests are unedited; no application bug fix.

## Progress

- 04:15 UTC (~00:02): bases matched, branches created, exact tools installed, dependency baseline setup running.

## Push ledger

First pushes verified: Tovu `da81249eb75695b9ff3c73cf21634053dd2b7649`; Jini `35c4961af718f0f30591c46d2ea2756c4484a731`; both `cloud/extract-s2`. Pull with rebase immediately before each push; verify remote tips with `git ls-remote`.

## Setup observations

- Initial installs hit read-only home caches. Redirected npm, pnpm store, node-gyp and XDG paths outside tracked source, retained the existing readable Corepack cache. Final `CI=true pnpm install --frozen-lockfile --store-dir <scratch>/pnpm-store`: exit 0; final `npm ci`: exit 0. No lockfile edits.
- An early setup guard probe overlapped the recursive build and reported six R8 missing-package manifests plus seven SI-resolution findings for not-yet-generated Cloudflare modules. Session-1 report lines 90–91 independently document exactly these environment artifacts. Preserved all six directories outside `packages/` after checking that none contains tracked files. The formal baseline guard will run after the full build. This probe is recorded, not claimed green.

## Baseline results and XP3 provenance

Unmodified pinned-tree commands, in order per repository:
- Jini: `CI=true pnpm install --frozen-lockfile --store-dir /workspace/work/extract-s2/pnpm-store` (0); `pnpm --filter @jini-ai/core run build && pnpm --no-bail -r build` (0); post-build `pnpm guard` (raw exit 1, exactly the permitted `R2-deep-path` 1 and `R10-chatpane-public-surface` 1 plus informational R13); `pnpm guard:plugins` (0).
- Hardwiring HW1 17, HW2 16, HW3 135, HW4 1, HW8 49, all 0 new. Explicit `checkPackageLayers` returned 0; `checkSubpathIsolation` returned 0, audit SI-c 9 and SI-d 7.
- Tovu: `npm ci` (0); `npm run build --workspace @tovu/sdk` (0); `JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini` (0); `npm --prefix packages/contracts run build` (0); `npx tsc -p tsconfig.json --noEmit` (0).
- The listed pre-existing test reds were not run or repaired during setup. No baseline source/test/lockfile change.

XP3 snapshot: `/workspace/work/extract-s2/declaration-baseline`, copied after the successful unmodified full build at Jini `35c4961af718f0f30591c46d2ea2756c4484a731`, Node 24.2.0, pnpm 10.33.2. Manifest contains 6,639 declaration hashes and 6,641 source-to-output mappings obtained with TypeScript's `getOutputFileNames` from the package's build tsconfigs. Manifest SHA256 `17445c3a21901bf89874e71d87ad53a95f87e295f28dfed73d88b5489da8d6ff`. This is the fixed baseline for the entire session, not the previous batch. Set `JINI_DECLARATION_BASELINE_DIR` to its absolute path. Checker requires matching full base provenance and fails missing baseline/current outputs. Snapshot is outside tracked source and is not published.

## Q1 implementation and development verification

Jini `477052c9eb9f6a4ea615a35ad076c9c92108de32`: checker, root command and new fixture tests. Jini `80a7ea2df`: separate type-only branch for the required mutation, strict empty contract JavaScript, remove unused import. Neither existing checker nor guard registration changed; existing tests unedited.

Development: `pnpm exec vitest run scripts/__tests__/check-no-cross-package.test.ts --maxWorkers=2 --minWorkers=1` passed 41/41; `pnpm exec tsc -p scripts/tsconfig.json --noEmit` passed. Strict eslint `complexity` and `sonarjs/cognitive-complexity`, each maximum 10, passed.

Mutation: deleted the type-only import visitor's collection statement; the named `XP1 rejects a new source with type-only import` test failed (expected red, exit 1). Restored checker byte-exact with `cmp`; rerun full 41-test suite passed. Other cases were filtered only for the mutation demonstration; the full gate has no filtered or skipped cases.

Formal Q1 commands: `pnpm exec vitest run scripts/__tests__/check-no-cross-package.test.ts --maxWorkers=2 --minWorkers=1 --reporter=verbose`; `pnpm exec tsc -p scripts/tsconfig.json --noEmit`; `pnpm exec eslint --no-inline-config --rule 'complexity:[error,10]' --rule 'sonarjs/cognitive-complexity:[error,10]' scripts/check-no-cross-package.ts`; `JINI_DECLARATION_BASELINE_DIR=/workspace/work/extract-s2/declaration-baseline pnpm check:cross-package`. All passed. Q1 `pnpm guard` exactly matches the baseline by finding and hardwiring lines; `pnpm guard:plugins` passed. Both paired SHAs verified pushed with `git ls-remote`. No Q1 work remains.

### Q1 exact fixture test names

- XP1 rejects a new source with type-only import
- XP1 rejects a new source with inline type import
- XP1 rejects a new source with value import
- XP1 rejects a new source with type export
- XP1 rejects a new source with value export
- XP1 rejects a new source with dynamic import
- XP1 rejects a new source with require
- XP1 rejects a new source with import type node
- XP1 and XP3 permit core and same-package imports, and ignore tests
- XP1 and XP3 fully inspect renamed sources and their declarations
- XP2 permits an unchanged pre-existing edge and XP3 permits its unchanged declaration
- XP2 rejects a newly introduced specifier in a modified source
- XP3 rejects a new declaration edge even when the modified source imports only core
- XP3 reads the configured declaration output rather than assuming dist
- XP3 fails closed on missing or invalid current declarations
- XP3 fails closed on missing or invalid baseline declarations
- XP3 fails closed on missing or invalid mapping declarations
- XP3 fails closed on missing or invalid directory declarations
- XP3 fails closed on missing or invalid provenance declarations
- XP3 requires current declarations for added sources too
- XP4 permits only contracts with type declarations and relative type imports inside core
- XP4 rejects invalid contract: export const value = 1;
- XP4 rejects invalid contract: let value = 1;
- XP4 rejects invalid contract: export function value() {}
- XP4 rejects invalid contract: export class Value {}
- XP4 rejects invalid contract: export enum Value { X }
- XP4 rejects invalid contract: export const enum Value { X }
- XP4 rejects invalid contract: namespace Value {}
- XP4 rejects invalid contract: console.log(1);
- XP4 rejects invalid contract: export default interface Value {}
- XP4 rejects invalid contract: export = Value;
- XP4 rejects invalid contract: import { Existing } from '../index.js';
- XP4 rejects invalid contract: import type { X } from 'node:fs';
- XP4 rejects invalid contract: import type { X } from 'vendor';
- XP4 rejects invalid contract: import type { X } from '../../../outside.js';
- XP4 rejects invalid contract: export type X = import('node:fs').X;
- XP4 rejects runtime JavaScript even when its source is type-only
- core cannot import any Jini package
- XP5 rejects a new dependencies edge, including optional peers
- XP5 rejects a new peerDependencies edge, including optional peers
- XP5 permits added core and unchanged pre-existing dependencies

Q1 recording at Jini `80a7ea2df06b20b26eadb8c7abe4462d0b55bebf`: checker SHA256 `840076e449880694c8db8b8e819333c22922f7171a82e88711111313140d9e56`; new fixture-test source SHA256 `28fb1d47c49cba57c189f6ebc8fdfff5c5bfebcea4bf04ffa2d0d2428d0811d9`. Fixtures are generated temporary git repos, removed by `afterEach`.

Pushes verified after immediate pull/rebase: Jini `477052c9eb9f6a4ea615a35ad076c9c92108de32`, then `80a7ea2df06b20b26eadb8c7abe4462d0b55bebf`, both `cloud/extract-s2`. No push failure or rebase conflict.

## Q2 inventory (first Q2 commit; before type moves)

Q1 is green. Tovu report push `f249e0ea744c1f5ae5df517e0bebff69c60b6cd4` and Jini `80a7ea2df06b20b26eadb8c7abe4462d0b55bebf` verified. Q2 adds only the six approved areas. Whole type-only files move with `git mv`; mixed files contribute their declaration slices. Runtime implementations stay in their current packages. New nested contract leaves preserve the existing mail/OAuth type dependency graph; only the six area subpaths become public entries.

| Symbol or type dependency | Kind | Pinned source | Destination |
|---|---|---|---|
| SurfaceCardUri | type | Jini packages/core/src/surface-cards.ts:11 | core/contracts/cards |
| SurfaceCardApp | type | Jini packages/core/src/surface-cards.ts:12 | core/contracts/cards |
| SurfaceCardDetail | type | Jini packages/core/src/surface-cards.ts:13 | core/contracts/cards |
| SurfaceCardChoice | type | Jini packages/core/src/surface-cards.ts:16 | core/contracts/cards |
| SurfaceCardFieldBase | type | Jini packages/core/src/surface-cards.ts:18 | core/contracts/cards |
| SurfaceCardStringField | type | Jini packages/core/src/surface-cards.ts:23 | core/contracts/cards |
| SurfaceCardEnumField | type | Jini packages/core/src/surface-cards.ts:27 | core/contracts/cards |
| SurfaceCardMultiEnumField | type | Jini packages/core/src/surface-cards.ts:31 | core/contracts/cards |
| SurfaceCardField | type | Jini packages/core/src/surface-cards.ts:34 | core/contracts/cards |
| SurfaceCardSecretField | type | Jini packages/core/src/surface-cards.ts:36 | core/contracts/cards |
| SurfaceCardCopy | type | Jini packages/core/src/surface-cards.ts:40 | core/contracts/cards |
| SurfaceCardSecretForm | type | Jini packages/core/src/surface-cards.ts:44 | core/contracts/cards |
| SurfaceCardFormSpec | type | Jini packages/core/src/surface-cards.ts:48 | core/contracts/cards |
| SurfaceCardOutcome | type | Jini packages/core/src/surface-cards.ts:53 | core/contracts/cards |
| SurfaceCardSecretRun | type | Jini packages/core/src/surface-cards.ts:59 | core/contracts/cards |
| SurfaceCardSecretSpec | type | Jini packages/core/src/surface-cards.ts:66 | core/contracts/cards |
| SurfaceCardSecretOptions | type | Jini packages/core/src/surface-cards.ts:74 | core/contracts/cards |
| SurfaceCardSecretDeps | type | Jini packages/core/src/surface-cards.ts:84 | core/contracts/cards |
| SurfaceCardSecretTool | type | Jini packages/core/src/surface-cards.ts:88 | core/contracts/cards |
| SurfaceCardSignInState | type | Jini packages/core/src/surface-cards.ts:94 | core/contracts/cards |
| SurfaceCardSignInSpec | type | Jini packages/core/src/surface-cards.ts:95 | core/contracts/cards |
| SurfaceCardSignInWait | type | Jini packages/core/src/surface-cards.ts:103 | core/contracts/cards |
| SurfaceCardsPort | type | Jini packages/core/src/surface-cards.ts:119 | core/contracts/cards |
| PluginCredentialField | type | Jini packages/agent-plugins/src/lifecycle/credential-card-metadata.ts:8 | core/contracts/credentials |
| PluginCredentialCard | type | Jini packages/agent-plugins/src/lifecycle/credential-card-metadata.ts:16 | core/contracts/credentials |
| OutboundEmail | type | Jini packages/platform/src/mail/types.ts:6 | core/contracts/mail |
| EmailAddress | type | Jini packages/platform/src/mail/types.ts:28 | core/contracts/mail |
| EmailAttachment | type | Jini packages/platform/src/mail/types.ts:33 | core/contracts/mail |
| MailerSendOptions | type | Jini packages/platform/src/mail/types.ts:39 | core/contracts/mail |
| MailerSendResult | type | Jini packages/platform/src/mail/types.ts:62 | core/contracts/mail |
| MailerCapabilities | type | Jini packages/platform/src/mail/types.ts:73 | core/contracts/mail |
| MailerFeedbackEvent | type | Jini packages/platform/src/mail/types.ts:88 | core/contracts/mail |
| MailerDelivery | type | Jini packages/platform/src/mail/types.ts:105 | core/contracts/mail |
| MailerOptional | type | Jini packages/platform/src/mail/types.ts:106 | core/contracts/mail |
| MailerSendRequired | type | Jini packages/platform/src/mail/types.ts:107 | core/contracts/mail |
| MailerBatchRequired | type | Jini packages/platform/src/mail/types.ts:108 | core/contracts/mail |
| MailTestModeSetting | type | Jini packages/platform/src/mail/types.ts:111 | core/contracts/mail |
| MailTestApproval | type | Jini packages/platform/src/mail/types.ts:114 | core/contracts/mail |
| MailerPort | type | Jini packages/platform/src/mail/ports.ts:11 | core/contracts/mail |
| ConsoleMailerAdapter | type | Jini packages/platform/src/mail/ports.ts:23 | core/contracts/mail |
| InMemoryMailerAdapter | type | Jini packages/platform/src/mail/ports.ts:26 | core/contracts/mail |
| MailSuppressionScope | type | Jini packages/platform/src/mail/ports.ts:30 | core/contracts/mail |
| MailSuppressionRepoPort | type | Jini packages/platform/src/mail/ports.ts:32 | core/contracts/mail |
| MailDeliveryLane | type | Jini packages/platform/src/mail/ports.ts:51 | core/contracts/mail |
| MailLedgerOutcome | type | Jini packages/platform/src/mail/ports.ts:53 | core/contracts/mail |
| MailSendLedgerPort | type | Jini packages/platform/src/mail/ports.ts:55 | core/contracts/mail |
| MailSendDedupRepoPort | type | Jini packages/platform/src/mail/ports.ts:80 | core/contracts/mail |
| MailCapturePort | type | Jini packages/platform/src/mail/ports.ts:86 | core/contracts/mail |
| DeliveryReadinessPolicy | type | Jini packages/platform/src/mail/ports.ts:90 | core/contracts/mail |
| MailCredentialFact | type | Jini packages/platform/src/mail/engine-contracts.ts:8 | core/contracts/mail |
| MailProviderCredentialFacts | type | Jini packages/platform/src/mail/engine-contracts.ts:16 | core/contracts/mail |
| MailProviderField | type | Jini packages/platform/src/mail/engine-contracts.ts:25 | core/contracts/mail |
| MailProviderSetup | type | Jini packages/platform/src/mail/engine-contracts.ts:36 | core/contracts/mail |
| MailProviderConfiguration | type | Jini packages/platform/src/mail/engine-contracts.ts:42 | core/contracts/mail |
| MailProviderConfigurationReport | type | Jini packages/platform/src/mail/engine-contracts.ts:56 | core/contracts/mail |
| MailProviderError | type | Jini packages/platform/src/mail/engine-contracts.ts:63 | core/contracts/mail |
| ProviderDomainState | type | Jini packages/platform/src/mail/engine-contracts.ts:72 | core/contracts/mail |
| SenderDomainVerification | type | Jini packages/platform/src/mail/engine-contracts.ts:75 | core/contracts/mail |
| MailStatusReport | type | Jini packages/platform/src/mail/engine-contracts.ts:82 | core/contracts/mail |
| MailProviderCheck | type | Jini packages/platform/src/mail/engine-contracts.ts:90 | core/contracts/mail |
| MailProviderCatalog | type | Jini packages/platform/src/mail/engine-contracts.ts:93 | core/contracts/mail |
| MailProviderSettingPort | type | Jini packages/platform/src/mail/engine-contracts.ts:102 | core/contracts/mail |
| MailCredentialPort | type | Jini packages/platform/src/mail/engine-contracts.ts:108 | core/contracts/mail |
| SenderDomainVerificationPort | type | Jini packages/platform/src/mail/engine-contracts.ts:114 | core/contracts/mail |
| MailAdapterCredential | type | Jini packages/platform/src/mail/adapter-module.ts:4 | core/contracts/mail |
| MailAdapterKit | type | Jini packages/platform/src/mail/adapter-module.ts:10 | core/contracts/mail |
| MailAdapterCreateContext | type | Jini packages/platform/src/mail/adapter-module.ts:16 | core/contracts/mail |
| MailAdapterModule | type | Jini packages/platform/src/mail/adapter-module.ts:43 | core/contracts/mail |
| MailRateLimit | type | Jini packages/platform/src/mail/provider.ts:23 | core/contracts/mail |
| MailProviderCapabilities | type | Jini packages/platform/src/mail/provider.ts:28 | core/contracts/mail |
| MailFeedbackParser | type | Jini packages/platform/src/mail/provider.ts:38 | core/contracts/mail |
| MailProviderCallContext | type | Jini packages/platform/src/mail/provider.ts:49 | core/contracts/mail |
| MailDomainState | type | Jini packages/platform/src/mail/provider.ts:54 | core/contracts/mail |
| MailProviderModule | type | Jini packages/platform/src/mail/provider.ts:56 | core/contracts/mail |
| MailProviderRegistry | type | Jini packages/platform/src/mail/provider.ts:88 | core/contracts/mail |
| MailProviderSetting | type | Jini packages/platform/src/mail/provider.ts:106 | core/contracts/mail |
| MailLaneState | type | Jini packages/platform/src/mail/provider.ts:126 | core/contracts/mail |
| MailLaneStatus | type | Jini packages/platform/src/mail/provider.ts:128 | core/contracts/mail |
| MailStatusWarning | type | Jini packages/platform/src/mail/provider.ts:134 | core/contracts/mail |
| MailStatus | type | Jini packages/platform/src/mail/provider.ts:136 | core/contracts/mail |
| SealedSecret | type | Jini packages/platform/src/secrets/types.ts:2 | core/contracts/vault |
| RootKeyHandle | type | Jini packages/platform/src/secrets/ports.ts:4 | core/contracts/vault |
| KeyringPort | type | Jini packages/platform/src/secrets/ports.ts:9 | core/contracts/vault |
| SecretSealerPort | type | Jini packages/platform/src/secrets/ports.ts:16 | core/contracts/vault |
| VendorCredentialSetRecord | type | Jini packages/platform/src/secrets/credential-sets/types.ts:11 | core/contracts/vault |
| VendorCredentialSetSummary | type | Jini packages/platform/src/secrets/credential-sets/types.ts:38 | core/contracts/vault |
| VendorCredentialSetRepoPort | type | Jini packages/platform/src/secrets/credential-sets/types.ts:53 | core/contracts/vault |
| VaultKind | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:6 | core/contracts/vault |
| CredentialType | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:7 | core/contracts/vault |
| CredentialMeta | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:9 | core/contracts/vault |
| VaultJson | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:10 | core/contracts/vault |
| VaultMeta | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:11 | core/contracts/vault |
| VaultOptions | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:12 | core/contracts/vault |
| VaultContext | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:15 | core/contracts/vault |
| VaultIdentity | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:23 | core/contracts/vault |
| VaultRecord | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:24 | core/contracts/vault |
| VaultSummary | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:36 | core/contracts/vault |
| VaultPutRecord | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:40 | core/contracts/vault |
| VaultQuery | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:41 | core/contracts/vault |
| VaultDefaultQuery | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:49 | core/contracts/vault |
| VaultSingletonQuery | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:53 | core/contracts/vault |
| VaultBatchOp | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:60 | core/contracts/vault |
| VaultBatchResult | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:64 | core/contracts/vault |
| VaultCopyResult | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:65 | core/contracts/vault |
| VaultMetaParser | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:73 | core/contracts/vault |
| VaultMetaParsers | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:74 | core/contracts/vault |
| VaultRepoPort | type | Jini packages/platform/src/secrets/credential-sets/vault.types.ts:91 | core/contracts/vault |
| OAuthGrantKind | type | Jini packages/oauth/src/ports.ts:4 | core/contracts/oauth |
| OAuthClientAuthMethod | type | Jini packages/oauth/src/ports.ts:5 | core/contracts/oauth |
| OAuthProviderDescriptor | type | Jini packages/oauth/src/ports.ts:7 | core/contracts/oauth |
| OAuthClient | type | Jini packages/oauth/src/ports.ts:19 | core/contracts/oauth |
| OAuthTokenSet | type | Jini packages/oauth/src/ports.ts:25 | core/contracts/oauth |
| OidcTrustConfiguration | type | Jini packages/oauth/src/ports.ts:36 | core/contracts/oauth |
| OidcIdTokenClaims | type | Jini packages/oauth/src/ports.ts:42 | core/contracts/oauth |
| OidcSigningAlgorithm | type | Jini packages/oauth/src/ports.ts:54 | core/contracts/oauth |
| OAuthTokenTypeHint | type | Jini packages/oauth/src/ports.ts:56 | core/contracts/oauth |
| OAuthFetch | type | Jini packages/oauth/src/ports.ts:58 | core/contracts/oauth |
| OAuthRandomBytes | type | Jini packages/oauth/src/ports.ts:62 | core/contracts/oauth |
| OAuthAppOptions | type | Jini packages/oauth/src/ports.ts:67 | core/contracts/oauth |
| OAuthUrlGuard | type | Jini packages/oauth/src/ports.ts:73 | core/contracts/oauth |
| OAuthHttpPorts | type | Jini packages/oauth/src/ports.ts:80 | core/contracts/oauth |
| OAuthSleep | type | Jini packages/oauth/src/ports.ts:85 | core/contracts/oauth |
| OAuthResource | type | Jini packages/oauth/src/ports.ts:89 | core/contracts/oauth |
| OAuthTokenStore | type | Jini packages/oauth/src/ports.ts:91 | core/contracts/oauth |
| TokenRefreshPort | type | Jini packages/oauth/src/ports.ts:111 | core/contracts/oauth |
| RegisteredOAuthClient | type | Jini packages/oauth/src/ports.ts:118 | core/contracts/oauth |
| ClientRegistrationCache | type | Jini packages/oauth/src/ports.ts:127 | core/contracts/oauth |
| OAuthRequiredArgs | type | Jini packages/oauth/src/args.ts:2 | same package (consumer-only generic helper) |
| OAuthOptionalArgs | type | Jini packages/oauth/src/args.ts:5 | same package (consumer-only generic helper) |
| OAuthEmptyArgs | type | Jini packages/oauth/src/args.ts:9 | core/contracts/oauth |
| DeviceAuthorization | type | Jini packages/oauth/src/device-code.ts:15 | core/contracts/oauth |
| DiscoveredAuthorizationServer | type | Jini packages/oauth/src/discovery.ts:17 | core/contracts/oauth |
| DiscoveredOAuthConfiguration | type | Jini packages/oauth/src/discovery.ts:28 | core/contracts/oauth |
| OAuthProviderRegistry | type | Jini packages/oauth/src/registry.ts:80 | core/contracts/oauth |
| AuthorizationCallbackParams | type | Jini packages/oauth/src/authorization-code.ts:135 | core/contracts/oauth |
| IndexableFieldKind | type | Jini packages/cms/src/content-types/types.ts:50 | core/contracts/content-types |
| ContentTypeFieldKind | type | Jini packages/cms/src/content-types/types.ts:79 | core/contracts/content-types |
| ContentTypeFieldDef | type | Jini packages/cms/src/content-types/types.ts:114 | core/contracts/content-types |
| ContentTypeStatus | type | Jini packages/cms/src/content-types/types.ts:121 | core/contracts/content-types |
| ContentTypeRecord | type | Jini packages/cms/src/content-types/types.ts:124 | core/contracts/content-types |
| SurfaceDetail | type | Jini packages/ui/src/features/mcp-ui/surfaces/structured-details.ts:5 | core/contracts/cards |
| SurfaceFieldBase | type | Jini packages/ui/src/features/mcp-ui/surfaces/fields.ts:23 | core/contracts/cards |
| StringField | type | Jini packages/ui/src/features/mcp-ui/surfaces/fields.ts:37 | core/contracts/cards |
| NumberField | type | Jini packages/ui/src/features/mcp-ui/surfaces/fields.ts:50 | core/contracts/cards |
| BooleanField | type | Jini packages/ui/src/features/mcp-ui/surfaces/fields.ts:59 | core/contracts/cards |
| EnumField | type | Jini packages/ui/src/features/mcp-ui/surfaces/fields.ts:64 | core/contracts/cards |
| MultiEnumField | type | Jini packages/ui/src/features/mcp-ui/surfaces/fields.ts:85 | core/contracts/cards |
| SurfaceField | type | Jini packages/ui/src/features/mcp-ui/surfaces/fields.ts:92 | core/contracts/cards |
| FormSurfaceSpec | type | Jini packages/ui/src/features/mcp-ui/surfaces/form.ts:45 | core/contracts/cards |
| SurfaceOutcomeSpec | type | Jini packages/ui/src/features/mcp-ui/surfaces/outcome.ts:65 | core/contracts/cards |
| SelectOption | type | Jini packages/ui/src/features/mcp-ui/surfaces/select.ts:12 | core/contracts/cards |
| BridgeScriptSpec | type | Jini packages/ui/src/features/mcp-ui/surfaces/bridge.ts:58 | core/contracts/cards |
| SecretInputText | type | Jini packages/ui/src/features/mcp-ui/surfaces/text-input.ts:12 | core/contracts/cards |
| SurfaceStatusText | type | Jini packages/ui/src/features/mcp-ui/surfaces/document.ts:381 | core/contracts/cards |
| ConfirmationToolAction | type | Jini packages/ui/src/features/mcp-ui/surfaces/confirmation.ts:50 | core/contracts/cards |
| SurfaceTokenName | type | Jini packages/ui/src/features/mcp-ui/surfaces/tokens.ts:77 | core/contracts/cards |
| SecretCardField | type | Jini packages/ui/src/features/mcp-ui/secret-card.ts:25 | core/contracts/cards |
| SecretCardForm | type | Jini packages/ui/src/features/mcp-ui/secret-card.ts:32 | core/contracts/cards |
| VaultErrorCode | type | VaultError.code literal union | core/contracts/vault |
| ISODateTime, UUID, HttpClientPort | type | core/src/primitives/index.ts | same package (core primitives type imports) |
| DomainRequirement, ProviderContext, ProviderRegistry, ProviderResult | type | core/src/provider-registry.ts | same package (core provider-registry type imports) |
| SurfaceAskThenReport, SurfaceExchangeStore | type | core/src/surface-exchanges.ts | same package (core surface-exchanges type imports) |
| ToolExecutionContext, ToolExecutionOptions | type | core/src/tool-registry.ts | same package (core tool-registry type imports) |
| VAULT_KINDS; VaultError; content-kind constants | value | platform credential-sets/vault.types.ts; cms content-types/types.ts | same package (values unchanged; type annotations only) |

No unresolved destination. Canonical cards retain complete pinned UI presentation shapes, add compatibility aliases for old core names, and preserve an independent pinned UI declaration copy in a new type test before UI definitions change. `SurfaceTokenName`, `VaultKind` and content-kind unions become literal unions as required. No hosted-MCP, vault constructor or A3/later work.

## Q2 implementation and verification

Inventory commit: Tovu `5f366ed47d3f7048ece0c0f7366facea7262afd5`, pushed after pull/rebase and verified. Implementation: Jini `699b47805da6069ae574f57942e56a351d9ec73c`, pushed after pull/rebase and verified. Six `core/contracts/*` area exports with universal metadata; private nested type leaves preserve the original mail and OAuth divisions. Old source paths re-export the canonical types. All runtime implementations remain in place. No `isolation.shared`, server, layer checker, dependency or lockfile changes.

Cards now use the complete pinned UI shapes: `previous`, `labels`, number/boolean variants, submit alternatives, form/secret-form text/tokens, outcome tokens and their presentation-type closure. Original core names remain compatibility aliases. Literal unions replace runtime-derived token/vault/content-kind types; platform/CMS constants retain their values with `satisfies` checks. New two-way type tests cover those constant unions.

Independent UI snapshot pin: `packages/ui/src/features/mcp-ui/__tests__/pinned-cards.typecheck.ts`, SHA256 `bf2f29fa8dffca5bc5317dbb6e2ed91f7cd23d55d475165dc823a42c04fb77dd` at recording commit Jini `699b47805da6069ae574f57942e56a351d9ec73c`. It copies pinned declarations before canonical re-exports; comparisons do not compare aliases to themselves. Recursive normalization preserves optional and readonly properties and discriminated field variants.

Mutation: removed optional `SurfaceDetail.previous` from the new core declaration. Mutant core build passed; a separate type-only witness showed two-way assignability still passed. UI `tsc --noEmit` failed the new exact-equality assertions (and existing uses of `previous`), expected red. Restored source byte-exact with `cmp`; full build/type-check gate runs on the restored source. No new application bug, no test weakened.

A TypeScript transpilation comparison of every inventoried old source against its pinned version, with comments/types erased, found zero runtime-output differences. Existing Jini tests and fixtures remain unedited; no Tovu source/test/fixture changes. No why-comment rewording. Q2 adds no core export-list test entries because neither `ui` integration-exports nor script packed-exports enumerates core's exports; their assertions remain unchanged.

### Q2 selected existing test files (direct imports of moved names)

Selected by parsing/grepping imports in the six touched packages. Three admin-widget `SelectOption` matches refer to a different local widget type and are excluded from this list. Core, OAuth and agent-plugins have no direct moved-name imports in their existing Vitest files. The selected tests run from their owning package so its unchanged Vitest config applies.

- `packages/platform/src/mail/__tests__/adapter-module.test.ts`: MailProviderModule, MailerSendRequired
- `packages/platform/src/mail/__tests__/delivery-availability.test.ts`: MailerPort
- `packages/platform/src/mail/__tests__/delivery-observer-w2g.unit.test.ts`: MailerPort, MailProviderModule
- `packages/platform/src/mail/__tests__/delivery-wrapper.test.ts`: MailerPort, MailSendLedgerPort, MailSuppressionRepoPort, MailProviderModule, MailerSendOptions, MailerSendResult, MailTestApproval, MailTestModeSetting, OutboundEmail
- `packages/platform/src/mail/__tests__/domain-read.test.ts`: MailProviderCallContext
- `packages/platform/src/mail/__tests__/engine-contracts.test.ts`: MailAdapterModule, MailCredentialPort, MailProviderCatalog, MailProviderSettingPort, MailStatusReport, SenderDomainVerificationPort, MailerSendOptions, MailerSendRequired, MailTestApproval, MailTestModeSetting
- `packages/platform/src/mail/__tests__/feedback.test.ts`: MailFeedbackParser, MailSuppressionRepoPort, MailerFeedbackEvent
- `packages/platform/src/mail/__tests__/policy.test.ts`: MailCapturePort, MailDeliveryLane, MailerPort, MailSendLedgerPort, MailSuppressionRepoPort, MailerSendOptions, MailerSendResult, OutboundEmail
- `packages/platform/src/mail/__tests__/provider.test.ts`: MailProviderModule
- `packages/platform/src/mail/__tests__/purpose-gate-defaults.test.ts`: MailerPort
- `packages/platform/src/mail/__tests__/purpose-gate-predicate.test.ts`: MailerPort
- `packages/platform/src/mail/__tests__/purpose-scoped-mailer.test.ts`: MailerPort, OutboundEmail, MailerSendOptions, MailerSendResult
- `packages/platform/src/mail/__tests__/resolve-mailer-lifecycle.test.ts`: MailCredentialFact
- `packages/platform/src/mail/__tests__/sender-domain-verification.test.ts`: MailProviderModule
- `packages/platform/src/mail/__tests__/smtp.test.ts`: MailerSendOptions, OutboundEmail
- `packages/platform/src/secrets/__tests__/secret-sealer.aesgcm.test.ts`: KeyringPort, RootKeyHandle
- `packages/platform/src/secrets/__tests__/vault.api-connection-kind.test.ts`: VaultContext, VaultMeta
- `packages/platform/src/secrets/__tests__/vault.copy.test.ts`: VaultContext, VaultMeta
- `packages/platform/src/secrets/__tests__/vault.meta.test.ts`: VaultMeta, VaultMetaParser
- `packages/platform/src/secrets/__tests__/vault.repo.memory.test.ts`: VaultRecord, VaultPutRecord
- `packages/platform/src/secrets/__tests__/vault.service.pins.test.ts`: VaultContext, VaultIdentity, VaultMetaParsers, VaultQuery, VaultRecord
- `packages/platform/src/secrets/__tests__/vault.service.test.ts`: VaultIdentity, VaultMeta, VaultMetaParsers, VaultRepoPort
- `packages/platform/src/secrets/__tests__/vault.types.test.ts`: VaultRecord
- `packages/cms/src/content-types/__tests__/lifecycle-dispatch.cov-j2.test.ts`: ContentTypeRecord, ContentTypeStatus
- `packages/cms/src/content-types/__tests__/lifecycle.cov-j2.test.ts`: ContentTypeRecord, ContentTypeStatus
- `packages/cms/src/content-types/__tests__/list.test.ts`: ContentTypeRecord
- `packages/cms/src/content-types/__tests__/repo.memory.cov-j2.test.ts`: ContentTypeRecord
- `packages/cms/src/content-types/__tests__/tool-registrations.cov-j2.test.ts`: ContentTypeFieldDef
- `packages/cms/src/content-types/__tests__/write-service.guards-boundary.test.ts`: ContentTypeFieldDef, ContentTypeFieldKind, ContentTypeRecord
- `packages/cms/src/content-types/__tests__/write-service.register-owner.test.ts`: ContentTypeRecord
- `packages/cms/src/content-types/__tests__/write-service.register.test.ts`: ContentTypeRecord
- `packages/cms/src/entries/__tests__/field-validation.boundaries.test.ts`: ContentTypeFieldDef
- `packages/cms/src/forms/__tests__/notify-durable.test.ts`: MailerPort
- `packages/cms/src/forms/__tests__/notify-subscriber.host-options.test.ts`: MailerPort, MailerSendOptions, MailerSendResult, OutboundEmail
- `packages/cms/src/forms/__tests__/notify-subscriber.test.ts`: MailerPort, MailerSendOptions, MailerSendResult, OutboundEmail
- `packages/cms/src/widgets/__tests__/unit/entry-payload.concurrent-seed.unit.test.ts`: ContentTypeRecord
- `packages/cms/src/widgets/__tests__/unit/resolvers-recent-entries.unit.test.ts`: ContentTypeRecord
- `packages/ui/src/features/mcp-ui/__tests__/secret-card.unit.test.ts`: SecretCardField, SecretCardForm
- `packages/ui/src/features/mcp-ui/__tests__/surfaces/controls.test.ts`: SurfaceField
- `packages/ui/src/features/mcp-ui/__tests__/surfaces/form.test.ts`: FormSurfaceSpec

Commands: for each package/file list above, `pnpm --filter @jini-ai/<pkg> exec vitest run <files> --maxWorkers=2 --minWorkers=1 --reporter=verbose`. Results: platform 23 files / 409 tests PASS; CMS 14 files / 150 tests PASS; UI 3 files / 168 tests PASS; 40 files, 727 tests total, no filtered cases. Full verbose test names retained in scratch logs.

Type-check commands: `pnpm --filter @jini-ai/<pkg> exec tsc --noEmit`, individually for core, platform, oauth, cms, agent-plugins and ui. Full-build command: `pnpm --filter @jini-ai/core run build && pnpm --no-bail -r build`. All final checks passed on the refined tip as recorded below.

Q2 scope refinement before closing the gate: `OAuthRequiredArgs` and `OAuthOptionalArgs` are consumer-owned generic helpers and remain in `oauth/src/args.ts`; only `OAuthEmptyArgs`, used by the shared registry contract, moves to core. Final source inventory destinations above reflect this decision. Jini `ada68ff7d` records the refinement; verification reran and passed on this tip. The independent UI pin is unchanged.

### Q2 final gate

Final tip Jini `ada68ff7d2cd2bad2495c368b99b2a32d45b34da` verified pushed. Final logs use `q2-final-*` in the scratch directory. Full build exit 0; core/platform/oauth/cms/agent-plugins/ui `tsc --noEmit`, each exit 0; the same 40 named test files pass again with 727/727 tests; post-build `pnpm check:cross-package` exit 0 against the original pinned declaration snapshot; `pnpm guard` matches baseline finding/hardwiring lines exactly; `pnpm guard:plugins` exit 0. Tovu re-linked and `npx tsc -p tsconfig.json --noEmit` exited 0. No Q2 work remains.

Unchanged-test/fixture inspection against both starting pins: no existing test/fixture M/D/R; no allowed-list edits were needed. Server and prohibited layer-checker diffs empty. Both migration diffs empty. Tovu source diff empty; metadata SHA256 remains the starting hash. Independent UI pin SHA256 unchanged. Runtime emit comparison remains zero differences.

All recorded Q2 test runner PIDs have exited; recorded process groups have no executing test process (only already-exited, defunct esbuild helpers awaiting environment reaping). No test was left running.

Additional verified pushes: Tovu `008eb932360b0e896aa2a726e66c019cd533b252`; Jini `ada68ff7d2cd2bad2495c368b99b2a32d45b34da`, branch `cloud/extract-s2`, immediate pull/rebase before each. No conflicts or failed pushes.

## G-card stop: required path is not covered

The brief requests a distinct **creating a credential with a plugin card** path at `custom-credentials/tool-registrations.ts:985`, using `applyPluginCredentialCard`. At the pinned Tovu source, and unchanged now:
- `credential-save-tool.ts:119-122`: API input without `target` dispatches to `apiCreate`; with `target` dispatches to `apiRotate`.
- `tool-registrations.ts:955-1017`: `rotate` resolves an existing saved credential, loads its plugin card, and line 985 applies the card to `setTokenForm`. This is rotation, not creation.
- `tool-registrations.ts:1023-1038`: `create` calls `buildCreateForm({ prefill, providers })` at line 1035. It never loads or applies a plugin card.
- `tool-registrations.ts:1042-1056`: `pluginProvider` creates a credential through `buildPluginCredentialForm` at line 1050. This is already G-card's first requested path and does not exercise `applyPluginCredentialCard`.

The creation + apply-card path is **not covered**: it cannot be reached through its real tool without changing production. Substituting rotation would not meet the literal creation requirement. No production change, new G-card test, fixture, recording commit or hash was made. No existing golden or fixture was changed. Per the explicit G-card stop rule, the session stops before A1. This is a brief/source mismatch, not an application bug; no open-bugs entry or fix is claimed.

G-card test status: its fixture recording, repeatability checks, text mutation, and the two existing moved-tools golden reruns were not started after the reachability stop. No G-card gate is claimed green. A1, A2 and F2 were not started. Q1 and Q2 remain green at their verified tips; F2 has not approved the accumulated work.

## Stop record and remaining work

Last verified paired green SHAs (Q2, both checked again with `git ls-remote` during shutdown):
- Tovu: `d19f27330f33978d82b267659d12b6434d8b4db6`, `cloud/extract-s2` (report publication on the tested source state).
- Jini: `ada68ff7d2cd2bad2495c368b99b2a32d45b34da`, `cloud/extract-s2`.

Jini's final repository/remote tip is the SHA above. Tovu's final tip is the report-only shutdown commit containing this stop record; its full pushed SHA is supplied in the final task response after push verification. The last verified full Tovu tip before this report commit is `d19f27330f33978d82b267659d12b6434d8b4db6`. This distinction avoids claiming the report's own commit hash before it exists.

Remaining batches, requiring a later separately approved task and the specified owner/Claude checkpoint process:
1. G-card: resolve the creation-versus-rotation mismatch, then record all five real-handler card paths and their saved/dismissed outcomes, frame sizes and counters; run repeatability and restored mutation gates. No automatic substitution was made.
2. A1: card builders, credential-save router/loaders and provider-status extraction; not started.
3. A2: mail golden, ABI bug demonstration/fix and remaining mail glue; not started.
4. F2: accumulated final gate on both final tips; not started.

Process shutdown: all 54 recorded root PIDs were checked individually through `/proc` and `ps` at 04:41:42 UTC and had exited, including installs, builds, type-checks, tests, guards and mutations. Recorded test process groups contain no executing process; defunct esbuild helper children are already exited and awaiting environment reaping. No test process remains running and no active child needed termination. Root PID/status records are retained outside tracked source in `shutdown-process-status.json`.

No migration, server, prohibited checker, existing-test, existing-fixture or metadata-baseline change. No main merge, force push or publication. The brief and implementation scratch files remain outside tracked paths. No rebase conflict or failed push occurred. Both branch tips are verified again after the report-only push; final full SHAs appear in the task response.

UTC stop/report prepared: 2026-11-08 04:42:27 UTC. Elapsed 00:29:32; deadline 08:12:55 UTC, cap not reached.

Actual early failure: G-card creation + apply-card path is not covered; the cited production handler is rotation-only.
EXTRACT-S2 STOPPED AT CAP


## Continuation

Owner-approved continuation started 2026-11-08 04:44:33 UTC. Continuation cap: 3 hours, deadline 07:44:33 UTC, shutdown reserve starts 07:24:33 UTC. This continues the same session and branches; no new approval lane, helpers or task reset. Starting verified tips: Tovu `a1ce51994e1e057352eea2f0f699a96b099cb998` (Q2 report `d19f27330f33978d82b267659d12b6434d8b4db6` plus stop report), Jini `ada68ff7d2cd2bad2495c368b99b2a32d45b34da`. Both local trees clean and remote tips verified. Runtime status refreshed; existing exact tool versions and fixed XP3 declaration snapshot retained.

Coordinator/owner correction supersedes the earlier G-card reachability stop: cover six real-handler paths without production changes: existing-credential rotation applying its plugin card to `setTokenForm`; pluginProvider creation using `buildPluginCredentialForm`; plain creation using `buildCreateForm` without a plugin card; publish-host; source-control; and agent-plugin-token with a credential card. Each must pin saved/dismissed outcomes, resource, frame size and per-path counters, then pass repeatability and mutation gates. The former creation + apply-card wording is withdrawn. A1, A2 and F2 follow only after green paired gates.

Continuation progress: 04:45 UTC, corrected G-card fixture work started. No production symbols move in G-card; the new test and its own fixture are the only planned non-report changes.

### Continuation G-card recording and tests

Six paths each invoke the production `credential_save` router and real domain handler, using sealed in-memory stores, fake vendor HTTP, and actual human surface-exchange delivery. No builder is called directly by the new test. All six saved cases assert success; all six dismissed cases assert no save. Forms/outcomes pin visible markup, whole-resource text SHA256 (including scripts/styles), app identity, complete resource metadata and explicit frame size, result, card/lookup/probe counts, and exchanges before/after. Submitted secrets are asserted absent from result/surface output.

The initial capture was made once on unmoved production runtime code. Before freezing the recording hashes, its explicit frame projection was corrected from the metadata already captured in that same fixture; resource text/hash/markup were not re-recorded. The new test's source-control fixture was completed with required unused export ports; test type-check verification follows. Existing test files/fixtures are untouched.

Recording commit: Tovu `fa9041368fdc1385c0c641474edfa426e0c422de`. Test `apps/website/src/assistant/__tests__/moved-tools.credential-cards.golden.test.ts` SHA256 `54c1f9c3c98780a882eca0dc94c5c1b7a0d8cd50aa28053b7be20b783c6aa76c`; fixture `apps/website/src/assistant/__tests__/fixtures/moved-tools.credential-cards.golden.json` SHA256 `3eb3766de97c9d6699507fbda53b29ec63babd0af1d6381611ee907da4a2fa01`.

Commands use the brief's runner: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=1 <files>`.
- New golden: `six real credential_save card paths retain saved/dismissed resources, frames and counters`; two unfiltered repeat runs pass against the frozen fixture.
- Mutation: changed `submitLabel: "Save key"` to `"Save keZ"` in Tovu `contracts/core/plugin-credential-card.ts`. New golden failed (expected red); original source restored and verified byte-exact using `cmp`.
- Restored gate: new test plus unchanged `moved-tools.golden.test.ts` and `moved-tools.access-token.golden.test.ts`, 3/3 PASS, no skips/todos. `pnpm check:cross-package` PASS against the retained Q2 build and pinned declaration baseline. Jini code unchanged in this batch.
- Development test type-check initially showed the 12 named baseline errors plus the new fixture's missing unused source-control export ports; those ports were supplied in the new test. Existing baseline errors were not fixed or counted.

Verified pushes in this batch: Tovu `e4d808998059d4a1f9ad08f2ce42813fe5563fa6`, `53706c02b5fbeceebf6dd6e46d0eb7cdcf75c2dc`, then `fa9041368fdc1385c0c641474edfa426e0c422de` (includes frame projection commit `8d123149967aaad0132cf92e959f8564fdf4f843`); all branch `cloud/extract-s2`, immediate pull/rebase before push, remote tips verified. One pull/rebase was refused locally while the intentional mutation was present; no push occurred in that attempt. Restored mutation before the successful retry; no stash or force push.

Continuation G-card final gate: GREEN. Guard finding/hardwiring lines equal the original record exactly; `guard:plugins` PASS. New test type-check has no errors; the full test-config check reports exactly the 12 named baseline errors and no additions. No G-card work remains after the approved correction. Paired verified green tips: Tovu `fa9041368fdc1385c0c641474edfa426e0c422de`, Jini `ada68ff7d2cd2bad2495c368b99b2a32d45b34da`. Next batch A1.

| Continuation batch | Paired tested SHAs | Commands/test names and result | Fixture hashes | Elapsed from continuation | Remaining |
|---|---|---|---|---|---|
| G-card | Tovu `fa9041368fdc1385c0c641474edfa426e0c422de`; Jini `ada68ff7d2cd2bad2495c368b99b2a32d45b34da` | PASS: new golden twice, restored mutation, moved-tools.golden, moved-tools.access-token.golden, cross-package checker and guard record/plugins | Recorded above | 00:09 | A1, A2, F2 |

### A1 inventory (first A1 commit; before moves)

G-card is green and both paired tips are pushed. Cross-repository source transport uses `git mv` to a temporary tracked path, followed by a filesystem move to Jini and recreation of the original Tovu path as a shim; no implementation is retyped. Canonical credential/card types are reused from core.

| Symbol/helper/dependency | Kind | Source | Destination |
|---|---|---|---|
| PluginCredentialField | type | Tovu apps/website/src/contracts/core/plugin-credential-card.ts:13 | core/contracts/credentials (canonical re-export) |
| PluginCredentialCard | type | Tovu apps/website/src/contracts/core/plugin-credential-card.ts:21 | core/contracts/credentials (canonical re-export) |
| buildPluginCredentialForm | value | Tovu apps/website/src/contracts/core/plugin-credential-card.ts:59 | ui/src/features/mcp-ui/credential-card.ts |
| applyPluginCredentialCard | value | Tovu apps/website/src/contracts/core/plugin-credential-card.ts:81 | ui/src/features/mcp-ui/credential-card.ts |
| pluginCardDetails | value | Tovu apps/website/src/contracts/core/plugin-credential-card.ts:89 | ui/src/features/mcp-ui/credential-card.ts |
| CredentialSaveAdapters | type | Tovu apps/website/src/features/custom-credentials/credential-save-tool.ts:12 | agent-plugins/src/connect/credential-save-tool.ts |
| KINDS | value | Tovu apps/website/src/features/custom-credentials/credential-save-tool.ts:24 | agent-plugins/src/connect/credential-save-tool.ts |
| CredentialKind | type | Tovu apps/website/src/features/custom-credentials/credential-save-tool.ts:25 | agent-plugins/src/connect/credential-save-tool.ts |
| credentialSaveCatalog | value | Tovu apps/website/src/features/custom-credentials/credential-save-tool.ts:32 | agent-plugins/src/connect/credential-save-tool.ts |
| credentialSaveDerivedRisk | value | Tovu apps/website/src/features/custom-credentials/credential-save-tool.ts:57 | agent-plugins/src/connect/credential-save-tool.ts |
| selectSave | value | Tovu apps/website/src/features/custom-credentials/credential-save-tool.ts:65 | agent-plugins/src/connect/credential-save-tool.ts |
| routeSave | value | Tovu apps/website/src/features/custom-credentials/credential-save-tool.ts:84 | agent-plugins/src/connect/credential-save-tool.ts |
| selectProviderSettingsSave | value | Tovu apps/website/src/features/custom-credentials/credential-save-tool.ts:107 | agent-plugins/src/connect/credential-save-tool.ts |
| selectProviderSave | value | Tovu apps/website/src/features/custom-credentials/credential-save-tool.ts:114 | agent-plugins/src/connect/credential-save-tool.ts |
| selectApiSave | value | Tovu apps/website/src/features/custom-credentials/credential-save-tool.ts:119 | agent-plugins/src/connect/credential-save-tool.ts |
| selectPublishSave | value | Tovu apps/website/src/features/custom-credentials/credential-save-tool.ts:125 | agent-plugins/src/connect/credential-save-tool.ts |
| buildCredentialSaveRegistrations | value | Tovu apps/website/src/features/custom-credentials/credential-save-tool.ts:140 | agent-plugins/src/connect/credential-save-tool.ts |
| routePluginCard | value | Tovu apps/website/src/features/custom-credentials/credential-save-tool.ts:164 | agent-plugins/src/connect/credential-save-tool.ts |
| invokeSaveAdapter | value | Tovu apps/website/src/features/custom-credentials/credential-save-tool.ts:179 | agent-plugins/src/connect/credential-save-tool.ts |
| LoadPluginCredentialCards | type | Tovu apps/website/src/features/custom-credentials/plugin-credential-card.ts:6 | agent-plugins/src/connect/plugin-credential-card.ts |
| readPluginCredentialValues | value | Tovu apps/website/src/features/custom-credentials/plugin-credential-card.ts:11 | agent-plugins/src/connect/plugin-credential-card.ts |
| readPublicField | value | Tovu apps/website/src/features/custom-credentials/plugin-credential-card.ts:23 | agent-plugins/src/connect/plugin-credential-card.ts |
| assertHttpsInput | value | Tovu apps/website/src/features/custom-credentials/plugin-credential-card.ts:33 | agent-plugins/src/connect/plugin-credential-card.ts |
| findPluginCredentialCard | value | Tovu apps/website/src/features/custom-credentials/plugin-credential-card.ts:40 | agent-plugins/src/connect/plugin-credential-card.ts |
| cardMatches | value | Tovu apps/website/src/features/custom-credentials/plugin-credential-card.ts:47 | agent-plugins/src/connect/plugin-credential-card.ts |
| loadPluginCredentialCardsSafely | value | Tovu apps/website/src/features/custom-credentials/plugin-credential-card.ts:55 | agent-plugins/src/connect/plugin-credential-card.ts |
| credentialCardsContribution | value | Tovu apps/website/src/features/agent-plugins/credential-cards.ts:9 | agent-plugins/src/connect/credential-cards.ts |
| mergePluginCredentialCards | value | Tovu apps/website/src/features/agent-plugins/credential-cards.ts:17 | agent-plugins/src/connect/credential-cards.ts |
| conflictingApiLabels | value | Tovu apps/website/src/features/agent-plugins/credential-cards.ts:37 | agent-plugins/src/connect/credential-cards.ts |
| isApiCard | value | Tovu apps/website/src/features/agent-plugins/credential-cards.ts:50 | agent-plugins/src/connect/credential-cards.ts |
| PROVIDER_STATUS_TOOL_ID | value | Tovu apps/website/src/features/plugin-runtime/provider-status-tool.ts:14 | agent-plugins/src/lifecycle/host-tools/provider-status-tool.ts |
| ProviderStatusRow | type | Tovu apps/website/src/features/plugin-runtime/provider-status-tool.ts:17 | agent-plugins/src/lifecycle/host-tools/provider-status-tool.ts |
| ProviderStatusPorts | type | Tovu apps/website/src/features/plugin-runtime/provider-status-tool.ts:34 | agent-plugins/src/lifecycle/host-tools/provider-status-tool.ts |
| providerStatusAgentToolCatalog | value | Tovu apps/website/src/features/plugin-runtime/provider-status-tool.ts:40 | agent-plugins/src/lifecycle/host-tools/provider-status-tool.ts |
| providerStatusDerivedRisk | value | Tovu apps/website/src/features/plugin-runtime/provider-status-tool.ts:48 | agent-plugins/src/lifecycle/host-tools/provider-status-tool.ts |
| selectRows | value | Tovu apps/website/src/features/plugin-runtime/provider-status-tool.ts:51 | agent-plugins/src/lifecycle/host-tools/provider-status-tool.ts |
| buildProviderStatusRegistrations | value | Tovu apps/website/src/features/plugin-runtime/provider-status-tool.ts:59 | agent-plugins/src/lifecycle/host-tools/provider-status-tool.ts |
| SecretCardForm, SurfaceCardApp | dependency | UI secret-card type dependency | core/contracts/cards |
| PluginCredentialCard, PluginCredentialField | dependency | Tovu credential-card type dependency | core/contracts/credentials |
| toolMetadata (both domains) | dependency | Tovu tool metadata modules | named host input metadata |
| CREDENTIAL_SAVE_TOOL_ID | dependency | Tovu headless contract | named host input toolId |
| CUSTOM_CREDENTIAL_CATEGORIES | dependency | Tovu credential categories | named host input categories |
| authorization.permission | dependency | provider-status catalogue | named host input authorization.permission |
| CustomCredentialValidationError | dependency | custom-credentials/store.ts:26 | named local port cardErrors.validation(message, field) |
| assertCredentialFreeField | dependency | contracts/core/credential-token.ts:8 | named host input assertFreeField |
| PluginProviderSettingField | dependency | @jini-ai/plugins/host type | named local port ProviderSettingFieldProjection |
| parsePluginCredentialCards, parseCredentialCardUsedFor, PluginContributionDefinition | dependency | agent-plugins manifest/lifecycle | same package (agent-plugins) |
| buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, ToolInputError, tool types | dependency | core runtime/types | core root |

No unresolved row. All domain save handlers/stores stay in the host. The neutral-host provider-status placeholder receives actual coverage in a new test file, preserving the frozen existing file and every existing assertion as F2 requires. The new test will use only public exports, show a provider settings card and save through memory ports. No connect/executable or connect/plugin-host entry is added.

### A1 implementation, validation and failed gate

Moved the inventoried implementations using the recorded cross-repository transport, then retained Tovu shims with their old names/signatures. UI's new `mcp-ui/credential-card` takes canonical core card/credential types and required host app identity. The `connect` factory takes required host metadata, tool id and categories; the card operations take the host's validation-error and free-field ports. Provider status takes host metadata and `authorization.permission`, with a consumer-local `ProviderSettingFieldProjection`. No moved/new production file imports another Jini package except core; no new dependency or lockfile change. `connect` is mapped to lifecycle isolation; no executable/plugin-host entry was added.

Strict optional-property adoption was completed before the formal gate: new loader/router types explicitly accept undefined values already passed by the old host; always-present description/details get precise return types; absent field hints remain absent. Bug `A1-explicit-undefined-credential-metadata` is logged in Tovu `development/open-bugs.md`. The new UI regression test failed under the original hint mapping (1 failed / 1 passed), then passed after restoration (2/2). Card text remains byte-identical in all three goldens; saved data and metadata baseline were not changed.

Two moved comment lines were neutralized for the source rule: router `Tovu credential kinds delegate...` became `Host credential kinds delegate...`; credential-cards `Jini owns declaration parsing; Tovu binds...` became `Declaration parsing stays here; the host binds...`. Other why comments moved intact. Required new agent notes explain host app identity, shared error/field policy and metadata-only provider projections.

Existing Jini test change allowed by R6.5: `packages/ui/src/__tests__/integration-exports.test.ts` gains only `'./mcp-ui/credential-card'` in the universal list. Every assertion is preserved. All other pre-existing Jini/Tovu tests and fixtures are unedited. Provider-status behavior is implemented in a new neutral-host test, leaving the original placeholder file frozen as the unchanged-test rule requires.

A1 commands/results:
- `pnpm --filter @jini-ai/ui run build && pnpm --filter @jini-ai/agent-plugins run build`: PASS.
- `pnpm --filter @jini-ai/ui exec tsc --noEmit`, `pnpm --filter @jini-ai/agent-plugins exec tsc --noEmit`, `pnpm --filter @jini-example/neutral-host exec tsc --noEmit`: PASS.
- Tovu `JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini && npx tsc -p tsconfig.json --noEmit`: PASS.
- Tovu `npx tsc -p tsconfig.tests.json --noEmit`: exactly the same 12 named baseline errors; no new error. The new independent old/core credential type compatibility checks compile.
- UI strict complexity check (maximum 10 for both rules): no errors; two pre-existing-style unused destructuring warnings in moved router (`_kind`, `_target`). No lint disable was added.
- Post-build `JINI_DECLARATION_BASELINE_DIR=/workspace/work/extract-s2/declaration-baseline pnpm check:cross-package`: PASS.
- `pnpm guard:plugins`: PASS.
- `pnpm guard`: **FAILED the required record**, with one new `HW8-provider-url` at `packages/agent-plugins/src/connect/credential-save-tool.ts`. HW8 is **50 total, 1 new**, required **49 total, 0 new**. The finding comes from the unchanged catalogue example `https://api.example.test` at line 40. Other hardwiring counts remain HW1 17, HW2 16, HW3 135, HW4 1; the two allowed R2/R10 findings and informational R13 remain. No guard/baseline suppression or post-failure fix was attempted. A2 was not started.

A1 Tovu tests, all through the brief's Node runner, 10 files / **146 tests PASS**, no skips/todos:
- `apps/website/src/features/custom-credentials/__tests__/credential-save-tool.unit.test.ts`
- `apps/website/src/features/custom-credentials/__tests__/credential-save-probe.test.ts`
- `apps/website/src/features/custom-credentials/__tests__/form-save-errors.model-facing.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-credential-cards.unit.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/plugin-credential-cards.unit.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/assistant/__tests__/moved-tools.golden.test.ts`
- `apps/website/src/assistant/__tests__/moved-tools.access-token.golden.test.ts`
- `apps/website/src/assistant/__tests__/moved-tools.credential-cards.golden.test.ts`

A1 UI command `pnpm --filter @jini-ai/ui exec vitest run <files> --maxWorkers=2 --minWorkers=1`, 4 files / **71 tests PASS**:
- `src/features/mcp-ui/__tests__/cards.unit.test.ts`
- `src/__tests__/integration-exports.test.ts`
- `src/features/mcp-ui/__tests__/secret-card.unit.test.ts`
- new `src/features/mcp-ui/__tests__/credential-card.unit.test.ts`

Neutral host command `pnpm --filter @jini-example/neutral-host exec vitest run src/provider-status.test.ts --maxWorkers=2 --minWorkers=1`: **1/1 PASS**. Named test: `provider status: reports configured providers with no product names, shows the host settings card and saves through memory`. It uses public package exports and a host-supplied card adapter, exercises the actual moved router/status tools and daemon exchange, saves the human answer in memory, then reports configured without exposing the secret. No cross-domain package is selected implicitly.

| Continuation batch | Paired source tips | Gate result | Fixture hashes | Elapsed | Remaining |
|---|---|---|---|---|---|
| A1 | Tovu `34d29ac914650710c856b2ea9fe1444b00264348`; Jini `9066f7eaebf431503cb86d92989adfab1b1d373b` | RED: new HW8-provider-url; all listed runtime/type/checker checks above pass | G-card hashes unchanged | 00:20 at failure | finish A1 guard, A2, F2 |

### Continuation push ledger

All pushes use `cloud/extract-s2`, after immediate pull/rebase, and are verified with `git ls-remote`. A1 includes these pushed tips/commits:
- Tovu `a86385e655181407c9ebf1da2416aab7dba9e171`.
- Tovu `d3f8cf2d8c3f3e675ac791cfef6929c623ed87dc`.
- Tovu `34d29ac914650710c856b2ea9fe1444b00264348`.
- Jini `1cf03063dfaf7b53f02f2c7d331c7c1caf7c82ec`.
- Jini `828437d42ee34b3c66d5090da2da63b4097919ad`.
- Jini `9066f7eaebf431503cb86d92989adfab1b1d373b`.

Jini test commit `9585ccd66` is included in those pushed tips. Earlier continuation/G-card pushes and recording SHAs are listed above. No rebase conflict, force push or publication occurred.

### Continuation stop record

Actual stop: A1's first formal gate failed the unchanged guard record (`HW8-provider-url`, 50 versus required 49). The first-failed-gate instruction stops this continuation before A2. No fix or waiver was made after this finding. A1 is not green despite its passing tests. F2 was not run; the accumulated session is not approved as complete.

Last verified paired green SHAs, **corrected G-card**:
- Tovu `5fbf8fec2733f58dfc48bce305347fefe9524cab` (report publication on tested source tip `fa9041368fdc1385c0c641474edfa426e0c422de`).
- Jini `ada68ff7d2cd2bad2495c368b99b2a32d45b34da`.

Final Jini repository/remote tip: `9066f7eaebf431503cb86d92989adfab1b1d373b`. Final Tovu source tip before this report-only shutdown commit: `34d29ac914650710c856b2ea9fe1444b00264348`. Tovu's final tip is the shutdown report commit containing this record; its full verified pushed SHA is supplied in the final task response after it exists.

Remaining batches, numbered:
1. A1: resolve the new HW8 finding without changing pinned tool/card text or weakening the guard; rerun its complete gate and verify both pushed tips in a separately approved continuation.
2. A2: mail golden, real resend ABI failure/mutation/fix, parser port and remaining glue; not started.
3. F2: accumulated final gate on final tips; not started.

Shutdown checks: all **80 recorded root PIDs** across the run and continuation were checked individually via `/proc` and `ps`; all exited. No active test/child root required termination. Recorded test process groups have no executing test process; any defunct esbuild helpers already exited. PID/status evidence remains outside tracked source in `continuation-shutdown-process-status.json`. No test process remains running.

Hashes at stop: G-card test `54c1f9c3c98780a882eca0dc94c5c1b7a0d8cd50aa28053b7be20b783c6aa76c`; G-card fixture `3eb3766de97c9d6699507fbda53b29ec63babd0af1d6381611ee907da4a2fa01`; Q2 independent UI pin `bf2f29fa8dffca5bc5317dbb6e2ed91f7cd23d55d475165dc823a42c04fb77dd`; tool metadata baseline `a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6`. All equal their recording values. No migration diff; no server or prohibited layer-checker diff. No existing Tovu test/fixture edit; only the precise additive UI export-list change in existing Jini tests. No main merge or publication.

Continuation progress/stop: 2026-11-08 05:07:22 UTC; elapsed 00:22:49. Deadline 07:44:33 UTC; the cap was not reached.

Actual early failure: A1 adds one HW8-provider-url finding, changing the required guard count from 49 to 50.
EXTRACT-S2 STOPPED AT CAP


## Continuation 2

Owner-approved resumption started 2026-11-08 06:12:26 UTC, on verified clean tips Tovu `1a24a1843c6d7cae4280a53f2e8ac738bafae420` and Jini `9066f7eaebf431503cb86d92989adfab1b1d373b`, both `cloud/extract-s2`. Deadline remains 07:44:33 UTC; shutdown reserve starts 07:24:33 UTC. Runtime status refreshed; original versions and pinned declaration baseline retained. No helpers or new session scope.

Owner/coordinator decision supersedes the A1 HW8 stop: the credential-save description is product wording and becomes a required host `messages.description` input with an agent note. Tovu passes the current description expression byte-exact. No hardwiring debt or guard weakening. A1's complete gate must rerun with HW8 49 and zero new before A2.

Continuation 2 seam inventory (first commit before edits):

| Symbol/helper/dependency | Kind | Source | Destination |
|---|---|---|---|
| credentialSaveCatalog description expression | value | Jini packages/agent-plugins/src/connect/credential-save-tool.ts:38-43 | named host input messages.description, bound in Tovu features/custom-credentials/credential-save-tool.ts |
| CredentialSaveMessages | type | new consumer contract | same package (agent-plugins/connect) |
| neutral-host description | value | new host wiring | examples/neutral-host/src/provider-status.test.ts |

No unresolved row. Tool text, cards, fixtures and metadata baseline must keep their recording hashes. Then A2 and F2 proceed serially under the original rules.

### Continuation 2 A1 complete gate

Required `CredentialSaveMessages.description` with an agent note now owns the description. Tovu passes the unchanged 3,558-character original expression; neutral-host passes its own wording. The entire catalogue description remains byte-identical for Tovu, confirmed by moved-tools.golden and tool-registrations.contracts. No hardwiring debt, guard edit, suppression or baseline edit.

A1 gate GREEN on Tovu `2731bdf05a2f1cf2011022081deafd66041c7ad8` and Jini `f1510e12e97f602c65c2db5a7be11de9dc44993d`, both verified pushed after pull/rebase. Root command/log prefix `c2-a1-*` in scratch. Complete rerun: agent-plugins build; UI/agent-plugins/neutral-host `tsc --noEmit`; Tovu re-link/main tsc; all 10 previously enumerated A1 Tovu files (146/146); four UI files (71/71); new neutral-host provider-status test (1/1); post-build `check:cross-package`; `guard:plugins`; and guard record. All passed, no filtered/skipped cases. Guard exactly matches the original named findings and every hardwiring count, including **HW8 49, 0 new**.

The metadata baseline remains `a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6`; G-card fixture remains `3eb3766de97c9d6699507fbda53b29ec63babd0af1d6381611ee907da4a2fa01`. No existing test/fixture was edited in this correction; new neutral-host wiring accepts the required messages input. No A1 work remains. Last verified green paired batch: A1 at these SHAs. Next A2.

Continuation 2 progress: 06:15 UTC, A1 complete, HW8 restored without guard exceptions. Verified pushes: Tovu `2731bdf05a2f1cf2011022081deafd66041c7ad8` (includes inventory `981c426b0`); Jini `f1510e12e97f602c65c2db5a7be11de9dc44993d`.

### A2 inventory and unmoved golden (first A2 commit)

A1 is green. Runtime helpers move by source transport; stores, settings ownership, source enumeration, runtime mode, host text and mail policy remain host inputs. The inventory and new golden are committed together before any production move.

| Symbol/helper/dependency | Kind | Source | Destination |
|---|---|---|---|
| MAIL_CREDENTIAL_CATEGORY | value | Tovu apps/website/src/server/runtime/boot/mail-provider-catalog.ts:45 | same package (Tovu host binding) |
| MAIL_SMTP_CREDENTIAL_LABEL | value | Tovu apps/website/src/server/runtime/boot/mail-provider-catalog.ts:48 | same package (Tovu host binding) |
| SMTP_PROVIDER_SETUP | value | Tovu apps/website/src/server/runtime/boot/mail-provider-catalog.ts:55 | same package (Tovu host binding) |
| MailProviderCatalogDeps | type | Tovu apps/website/src/server/runtime/boot/mail-provider-catalog.ts:61 | same package (Tovu host binding) |
| MailProviderCatalog | type | Tovu apps/website/src/server/runtime/boot/mail-provider-catalog.ts:77 | agent-plugins/src/lifecycle/mail/catalog.ts |
| builtins | value | Tovu apps/website/src/server/runtime/boot/mail-provider-catalog.ts:90 | agent-plugins/src/lifecycle/mail/catalog.ts |
| loadAdapters | value | Tovu apps/website/src/server/runtime/boot/mail-provider-catalog.ts:102 | agent-plugins/src/lifecycle/mail/catalog.ts |
| loadMailProviderCatalog | value | Tovu apps/website/src/server/runtime/boot/mail-provider-catalog.ts:114 | agent-plugins/src/lifecycle/mail/catalog.ts |
| loadMailCredentialCards | value | Tovu apps/website/src/server/runtime/boot/mail-provider-catalog.ts:136 | agent-plugins/src/lifecycle/mail/catalog.ts |
| resolveMailCredential | value | Tovu apps/website/src/server/runtime/boot/mail-provider-catalog.ts:151 | same package (Tovu host binding) |
| resolveMailDomainReadCredential | value | Tovu apps/website/src/server/runtime/boot/mail-provider-catalog.ts:167 | agent-plugins/src/lifecycle/mail/catalog.ts |
| credentialFailureReason | value | Tovu apps/website/src/server/runtime/boot/mail-provider-catalog.ts:184 | same package (Tovu host binding) |
| createProviderMailer | value | Tovu apps/website/src/server/runtime/boot/mail-provider-catalog.ts:197 | platform/src/mail/provider-mailer.ts |
| CatalogEntry | type | Tovu apps/website/src/server/runtime/boot/mail-provider-configuration.ts:17 | agent-plugins/src/lifecycle/mail/configuration.ts |
| lanesFor | value | Tovu apps/website/src/server/runtime/boot/mail-provider-configuration.ts:20 | agent-plugins/src/lifecycle/mail/configuration.ts |
| rowComplete | value | Tovu apps/website/src/server/runtime/boot/mail-provider-configuration.ts:25 | agent-plugins/src/lifecycle/mail/configuration.ts |
| credentialFacts | value | Tovu apps/website/src/server/runtime/boot/mail-provider-configuration.ts:30 | agent-plugins/src/lifecycle/mail/configuration.ts |
| refusalFor | value | Tovu apps/website/src/server/runtime/boot/mail-provider-configuration.ts:39 | agent-plugins/src/lifecycle/mail/configuration.ts |
| describeOne | value | Tovu apps/website/src/server/runtime/boot/mail-provider-configuration.ts:45 | agent-plugins/src/lifecycle/mail/configuration.ts |
| describeMailProviders | value | Tovu apps/website/src/server/runtime/boot/mail-provider-configuration.ts:63 | agent-plugins/src/lifecycle/mail/configuration.ts |
| MAIL_ADAPTERS_FILENAME | value | Tovu apps/website/src/features/agent-plugins/mail-adapter-registry.ts:41 | same package (Tovu host binding) |
| LoadedMailAdapter | type | Tovu apps/website/src/features/agent-plugins/mail-adapter-registry.ts:45 | agent-plugins/src/lifecycle/mail/contribution.ts |
| MailAdapterRegistry | type | Tovu apps/website/src/features/agent-plugins/mail-adapter-registry.ts:51 | agent-plugins/src/lifecycle/mail/contribution.ts |
| adapterContribution | value | Tovu apps/website/src/features/agent-plugins/mail-adapter-registry.ts:58 | agent-plugins/src/lifecycle/mail/contribution.ts |
| AdapterPackage | type | Tovu apps/website/src/features/agent-plugins/mail-adapter-registry.ts:66 | agent-plugins/src/lifecycle/mail/contribution.ts |
| loadMailAdapterRegistry | value | Tovu apps/website/src/features/agent-plugins/mail-adapter-registry.ts:76 | agent-plugins/src/lifecycle/mail/contribution.ts |
| loadMailAdapterRegistryFromSource | value | Tovu apps/website/src/features/agent-plugins/mail-adapter-registry.ts:87 | agent-plugins/src/lifecycle/mail/contribution.ts |
| loadBundledMailAdapterRegistry | value | Tovu apps/website/src/features/agent-plugins/mail-adapter-registry.ts:98 | same package (Tovu host binding) |
| cardNotes | value | Tovu apps/website/src/features/agent-plugins/mail-adapter-registry.ts:110 | agent-plugins/src/lifecycle/mail/contribution.ts |
| parseMailAdaptersFile | value | Tovu apps/website/src/features/agent-plugins/mail-adapter-registry.ts:122 | agent-plugins/src/lifecycle/mail/contribution.ts |
| defaultCredentialLabel | value | Tovu apps/website/src/features/agent-plugins/mail-adapter-registry.ts:127 | agent-plugins/src/lifecycle/mail/contribution.ts |
| v2Mismatch | value | Tovu apps/website/src/features/agent-plugins/mail-adapter-registry.ts:132 | agent-plugins/src/lifecycle/mail/contribution.ts |
| providerFor | value | Tovu apps/website/src/features/agent-plugins/mail-adapter-registry.ts:144 | agent-plugins/src/lifecycle/mail/contribution.ts |
| contributeMailProviders | value | Tovu apps/website/src/features/agent-plugins/mail-adapter-registry.ts:164 | agent-plugins/src/lifecycle/mail/contribution.ts |
| allowSystemMailMigration | value | Tovu apps/website/src/server/runtime/composition/site-mailer.ts:22 | same package (Tovu host binding) |
| SiteMailerRequired | type | Tovu apps/website/src/server/runtime/composition/site-mailer.ts:24 | same package (Tovu host binding) |
| SiteMailer | type | Tovu apps/website/src/server/runtime/composition/site-mailer.ts:35 | same package (Tovu host binding) |
| installedMailProviderIds | value | Tovu apps/website/src/server/runtime/composition/site-mailer.ts:52 | same package (Tovu host binding) |
| createSiteMailer | value | Tovu apps/website/src/server/runtime/composition/site-mailer.ts:66 | same package (Tovu host binding) |
| clearPluginSelectionSnapshot | value | Tovu apps/website/src/server/runtime/composition/site-mailer.ts:73 | agent-plugins/src/lifecycle/mail/selection.ts |
| clearPluginSelection | value | Tovu apps/website/src/server/runtime/composition/site-mailer.ts:92 | agent-plugins/src/lifecycle/mail/selection.ts |
| pendingPluginSelections | value | Tovu apps/website/src/server/runtime/composition/site-mailer.ts:99 | agent-plugins/src/lifecycle/mail/selection.ts |
| disabledProviderIds | value | Tovu apps/website/src/server/runtime/composition/site-mailer.ts:103 | agent-plugins/src/lifecycle/mail/selection.ts |
| setPluginEnabled | value | Tovu apps/website/src/server/runtime/composition/site-mailer.ts:119 | agent-plugins/src/lifecycle/mail/selection.ts |
| selectProvider | value | Tovu apps/website/src/server/runtime/composition/site-mailer.ts:132 | agent-plugins/src/lifecycle/mail/selection.ts |
| WrapMailerWithPurposeGateOptions | type | Tovu apps/website/src/platform/mail/purpose-scoped-mailer.ts:13 | same package (Tovu host binding) |
| toJiniMailer | value | Tovu apps/website/src/platform/mail/purpose-scoped-mailer.ts:20 | platform/src/mail/plugin-abi.ts (public names fromPositionalMailer/toPositionalMailer; Tovu aliases remain) |
| toTovuMailer | value | Tovu apps/website/src/platform/mail/purpose-scoped-mailer.ts:29 | platform/src/mail/plugin-abi.ts (public names fromPositionalMailer/toPositionalMailer; Tovu aliases remain) |
| wrapMailerWithPurposeGate | value | Tovu apps/website/src/platform/mail/purpose-scoped-mailer.ts:42 | same package (Tovu host binding) |
| PositionalMailer, PluginMailHttpClient | dependency | new ABI type contracts | core/contracts/mail |
| toPluginHttpClient, fromPositionalMailer, toPositionalMailer | dependency | new ABI adapters | platform/src/mail/plugin-abi.ts |
| createHostMailer | dependency | new composition assembly | agent-plugins/src/lifecycle/mail/host-mailer.ts |
| MailCredentialRow | dependency | CustomCredentialSetRecord fields actually read | named local port in mail/configuration |
| mailEngine.createRegistry, mailEngine.builtins.console/smtp | dependency | platform mail engine | named required host input mailEngine |
| ABI functions | dependency | platform mail adapters | named required host input ABI |
| parseMailProviderSetupProperty | dependency | platform mail parser | named required host input parseSetup |
| parseMailAdaptersFile parser dependency | dependency | agent-plugins/lifecycle/mail/adapter-descriptors.ts:10 | same package, with required parseSetup port |
| credential row lookup, error classification, SMTP transport, lifecycle source loader, settings read/write and plugin toggle | dependency | Tovu runtime values | named host inputs/ports |
| SMTP setup metadata, credential labels/category and refusal copy | dependency | Tovu positional text | named host input mailHostText |

No unresolved row. The SMTP setup metadata and product credential labels stay byte-identical in host input. `resolve-mailer`, mail-delivery-policy/resendPolicyFor, account-token bindings, tables, settings, routes, nodemailer and Jini resend assets stay in place. No extra send-path read is permitted. Only the nine parser calls in the named existing Jini test receive the real parseSetup port.


### Continuation 2 — A2 stop record

Implementation stopped at 2026-11-08 06:31:31 UTC, approximately 19 minutes after the 06:12:26 UTC continuation start. Shutdown/reporting completed before the unchanged 07:44:33 UTC deadline. No subsequent batch was started.

**Exact stop condition:** R5.6 §2.3 says: “Stop if another Jini package calls `parseMailAdaptersFile`, or another existing test needs wiring edits.” The required `parseSetup` input causes the existing `examples/neutral-host/src/contribution-contracts.test.ts:164` to fail type-checking:

```text
src/contribution-contracts.test.ts(164,109): error TS2345:
Argument of type '{ raw: string; }' is not assignable to parameter of type
'{ readonly raw: string; readonly parseSetup: ParseMailSetup; }'.
Property 'parseSetup' is missing.
```

That existing file remains byte-identical to the starting pin. The search before extraction covered package callers but missed this example test. No optional parser default, guard waiver or extra test edit was introduced. The formal A2 gate is incomplete; F2 was not started.

| Batch / development check | Paired SHAs / command | Result |
|---|---|---|
| Last completely green batch: A1 | Tovu source `2731bdf05a2f1cf2011022081deafd66041c7ad8` plus report `b21cd3fdce1e40ed7d803b35b67340c49566781a`; Jini `f1510e12e97f602c65c2db5a7be11de9dc44993d` | Full A1 gate green, including HW8 49 / 0 new, as recorded above. Both verified pushed. |
| A2 recording / inventory | Tovu `0506f0df5723d031c6e97a801d07fe9786fd5489` | First A2 commit contains the new golden and symbol inventory, before production changes; recording and unchanged repeat both passed. |
| ABI bug red | Jini new `examples/neutral-host/src/mail-port-regression.test.ts`; `pnpm --filter @jini-example/neutral-host exec vitest run src/mail-port-regression.test.ts --maxWorkers=2 --minWorkers=1` | Real Resend plugin with object-request fake produces `result.ok === false` without adaptation. First import.meta.resolve attempt was a Vitest harness failure and is not the bug evidence; corrected dynamic public import reproduced the actual ABI failure. Log `c2-a2-resend-abi-red.log`. |
| ABI adapter green | Same regression with `toPluginHttpClient` | 1/1 passed (`c2-a2-abi-green.log`); plugin unedited. Mutation confirmation remains unfinished. |
| Development builds/types | `pnpm --filter @jini-ai/core build`; `pnpm --filter @jini-ai/platform build`; `pnpm --filter @jini-ai/platform exec tsc --noEmit`; `pnpm --filter @jini-ai/agent-plugins exec tsc --noEmit`; `pnpm --filter @jini-ai/agent-plugins build` | Exit 0 at the recorded development states. Logs `c2-a2-core-build`, `platform-build`, `platform-pre`, `agent-pre`, `agent-build2`. These do not substitute for the full A2 gate. |
| Moved-source complexity | ESLint with complexity and cognitive-complexity limits 10 on the eight new/changed mail runtime modules | 0 errors; one unused-import warning subsequently removed before the stop. Not rerun as a gate. |
| Golden after extraction | Node command below, `mail-send.golden.test.ts` | 1/1 passed against the frozen recording, `c2-a2-golden-post.log`. |
| Tovu development type-check | Relink; `npx tsc --noEmit` | First check exposed a narrowed optional toggle argument; corrected to accept the host's existing optional object. Rerun exit 0 (`c2-a2-tovu-pre2.log`). |
| New neutral integration scaffold | `pnpm --filter @jini-example/neutral-host exec vitest run src/mail-port-regression.test.ts src/mail-host.test.ts --maxWorkers=2 --minWorkers=1` | ABI regression passed. New integration scaffold failed at its suppression assertion: expected `MAIL_SUPPRESSED`, actual existing contract `MAIL_RECIPIENT_SUPPRESSED`. No subsequent cases claimed covered. Test left as captured at the stop; no fix after the stop condition. |
| Neutral-host type-check | `pnpm --filter @jini-example/neutral-host exec tsc --noEmit` | Exit 1 at the additional protected existing caller quoted above (`c2-a2-neutral-tsc-pre.log`). Explicit A2 stop rule applies. |

Node golden command (same recording/repeat/post-move arguments):

```sh
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx \
  --import ./development/test-support/composed-bundle-env.ts \
  --test --experimental-test-module-mocks --test-concurrency=1 \
  apps/website/src/server/runtime/boot/__tests__/mail-send.golden.test.ts
```

The mail golden freezes real bundled Resend and SMTP requests/payloads, ordered ledger calls, per-recipient counters, suppression/redirect/capture/rate-limit results, three configuration refusals, sender identity names and full missing-sender refusal, status/description/checkProvider, rotation, cards and off-clearing. `MAIL_SEND_GOLDEN_WRITE=1` was used once for recording. At recording commit `0506f0df5723d031c6e97a801d07fe9786fd5489` and at the stopped tip:

- Test SHA256: `28738c7757cc624ea03fcd4c7564d9f1a30882d1b94e2574a7d31b4ca4bf92f0`.
- Fixture SHA256: `f0733d6176cd0d2fc92a9181d342c9ff9480f0d505f7c5e1dc8330d3f48a4be3`.

Other frozen hashes re-read unchanged during shutdown: G-card test `54c1f9c3c98780a882eca0dc94c5c1b7a0d8cd50aa28053b7be20b783c6aa76c`, G-card fixture `3eb3766de97c9d6699507fbda53b29ec63babd0af1d6381611ee907da4a2fa01`, UI pin `bf2f29fa8dffca5bc5317dbb6e2ed91f7cd23d55d475165dc823a42c04fb77dd`, tool metadata `a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6`.

Partial A2 implementation is preserved for review: core ABI types; platform ABI/scrubbing boundary; injected contribution/catalog/configuration/selection/host-mailer factories; host text and guarded ports bound by the old Tovu paths. Product labels, SMTP form metadata and refusal copy remain host input. The inventory's positional parser and default credential label rows are host shims/bindings to the generic factory, consistent with the host-text requirement. No new dependency, package, guard/debt edit or migration. Base-to-tip diffs for `packages/server`, Jini Resend assets and migration paths are empty.

A2 is not a completed move-compliance claim. This partial extraction used scripted source slicing and binding edits rather than the required `git mv` transport; move provenance and full why-comment compliance need review before it can be accepted. Neutral wording edits in the draft include the provider wrapper's old Tovu ABI explanation, the contribution HTTP-ABI comment, its shipped-plugin trust wording, and the two ABI adapter API comments. No broader comment audit was completed after the stop. The additional A2 bug entry in `development/open-bugs.md` is explicitly incomplete.

Existing tests remain protected: Tovu base-to-tip tests/fixtures are additions only. A2's sole existing Jini test change is exactly one real-parser import and `parseSetup: parseMailProviderSetupProperty` added to the nine required argument objects in `packages/agent-plugins/src/lifecycle/mail/__tests__/adapter-descriptors.test.ts`; all assertions, raw inputs, expected values and optional arguments are preserved. The newly written tests are not frozen pre-existing tests. This stop inspection does not claim F2's accumulated audit has passed.

Numbered remaining work, requiring a separately approved continuation:

1. Resolve the coordinator-level parser wiring stop for the existing neutral-host contribution test. Review the draft A2 transport/comment provenance; correct and complete the new integration scaffold. Complete the required ABI mutation and refusal/header golden mutations, restoring all frozen bytes.
2. Complete A2's full listed Tovu/Jini suites, neutral-host outcomes, final builds/types, cross-package checker and exact guard record, with verified paired pushes. None of the unrun tests or outcomes are green by implication.
3. Run accumulated F2 unchanged-test/pin/metadata/migration audit, its nine named regression groups, every touched package type-check, Tovu type-check, cross-package check and guard record. Stop on its first failure; publish nothing.

Shutdown: all 94 recorded process roots were checked individually through `/proc/<pid>/stat`; none running. Evidence is `/workspace/work/extract-s2/c2-shutdown-process-status.json`. Development command sessions also returned their final exits; no test or build session remains running. No mutation was outstanding. No main merge or publication.

Verified pushed stopped source tips on `cloud/extract-s2` (pull with rebase immediately before each push, then `git ls-remote`):

- Tovu `1022c243689a0f57a0b6a127680513ed217332f0` (this final report is a following report-only commit, whose full remote SHA is supplied in the task response).
- Jini `eb76e3e193ddc571fb6df444a2aeeda8c8eb3fb8`.
- ABI red-test recording commit Jini `a6f7b8d5730131e5abd1b68b3eae456957a70dd8` is included in the pushed history.

The last verified green pair remains A1: Tovu `2731bdf05a2f1cf2011022081deafd66041c7ad8` plus report `b21cd3fdce1e40ed7d803b35b67340c49566781a`; Jini `f1510e12e97f602c65c2db5a7be11de9dc44993d`.

Early stop: A2 requires wiring an additional existing neutral-host test, explicitly forbidden by the brief's stop rule. A2 is incomplete and F2 was not started; the clock did not expire.
EXTRACT-S2 STOPPED AT CAP
