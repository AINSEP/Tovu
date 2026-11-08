# Plugin extraction session 2

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

Last verified green paired batch: Q1 at the SHAs in its row. No golden fixtures or move inventories yet. No existing-test changes or bug fixes.

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
| OAuthRequiredArgs | type | Jini packages/oauth/src/args.ts:2 | core/contracts/oauth |
| OAuthOptionalArgs | type | Jini packages/oauth/src/args.ts:5 | core/contracts/oauth |
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
