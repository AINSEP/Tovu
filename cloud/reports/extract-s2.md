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
