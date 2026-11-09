# EXTRACT-S8 — plugin extraction session 8 report

## Inputs

- Tovu (AINSEP/Tovu, origin https://github.com/AINSEP/Tovu): branch `cloud/extract-s8` created at pin `c3801c833a191be51753dcdecd133b0cad6f8945`.
- Jini (AINSEP/Jini, origin https://github.com/AINSEP/Jini): branch `cloud/extract-s8` created at pin `4044fe3c0fa34b1f903c5d20a6b4de7714cde573`.
- Original XP3 declaration base: Jini `35c4961af718f0f30591c46d2ea2756c4484a731`.
- Session UTC start 2026-11-09T06:55:21Z; hard deadline 2026-11-09T09:25:21Z; reserve (no new implementation batch) from 09:00:21Z.
- Toolchain: Node v24.2.0, npm 11.3.0, pnpm 10.33.2 (same as S3). Container: 4 cores, 16 GB, no swap.
- Branch note: a coordinator-level instruction named `claude/gifted-bell-8zzhzz`, but the owner-approved brief names `cloud/extract-s8`; the brief governs, so all S8 work is on `cloud/extract-s8` in both repos.
- Batch order: C0 → C1 seam → C1 move → C2 part 1 → C2 part 2 → F8.

## Dependency/C0 verdict

_Placeholder — filled by the C0 batch._

## Concurrent lanes

- S4 owns A8–A11 on `cloud/extract-s4`; S5 owns H0–H3 on `cloud/extract-s5`; S6 owns G-plug/L1a–L1c on `cloud/extract-s6`. Each owns its lane.
- S7 (L2, L3, C0, F7) has not run; S8 therefore includes C0 itself.
- No merges or cherry-picks from any other lane.

## Baseline

Recorded on the unmodified pins, 06:59–07:08Z. Trees clean; no untracked `packages/plugin-*` residue (every `packages/plugin-*` directory has a manifest; nothing removed).

### Setup commands and exits

| repo | command (cwd = repo root) | exit |
|---|---|---|
| Jini | `CI=true pnpm install --frozen-lockfile` | 0 |
| Jini | `pnpm --filter @jini-ai/core run build` | 0 |
| Jini | `pnpm --no-bail -r build` | 0 (no failing packages) |
| Tovu | `npm ci` | 0 |
| Tovu | `npm run build --workspace @tovu/sdk` (before link) | 0 |
| Tovu | `JINI_PACKAGES_DIR=<abs Jini>/packages npm run link:jini` | 0 (68 links) |
| Tovu | `npm --prefix packages/contracts run build` | 0 |
| Tovu | `npx tsc -p tsconfig.json --noEmit` (root tsconfig) | 0 |

Tovu tests run from the Tovu root (there is no `apps/website` package.json/tsconfig):
`TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/<file>`.
Jini vitest: `pnpm --filter <pkg> exec vitest run <files> --maxWorkers=2 --minWorkers=1`; `scripts/__tests__` via `pnpm exec vitest run <files> --maxWorkers=2 --minWorkers=1` from the Jini root.

### Jini gates (unmodified tree)

| gate | exit | result |
|---|---|---|
| `pnpm guard` | 1 | 2 violations: R2-deep-path(1), R10-chatpane-public-surface(1) |
| `pnpm guard:plugins` | 0 | clean |
| `node --import tsx scripts/check-package-layers.ts` | 0 | 0 failures |
| `node --import tsx scripts/check-subpath-isolation.ts` | 0 | 0 failures; audit kinds SI-c 9, SI-d 7 |
| `JINI_DECLARATION_BASELINE_DIR=<snapshot> pnpm check:cross-package` | 0 | XP1–XP5 clean |

Guard families (complete output read):

| family | count | detail |
|---|---|---|
| R2-deep-path | 1 | `packages/plugin-catalog/scripts/generate.ts` → `../../agent-plugins/src/core/identity-namespace.js` |
| R10-chatpane-public-surface | 1 | `packages/chat/src/react/features/chat-pane/components/ChatPane.tsx` imports `Icon` outside barrel |
| R13-model-fallback-freshness | info | claude MF3 16 live vs 20 fallback; codex/agy CLIs absent (skipped); pi/aider/opencode MF3 n/a |
| HW1 / HW2 / HW3 / HW4 / HW8 | 17 / 16 / 135 / 1 / 49 | 0 new each |
| HW5 / HW6 / HW7 / HW9 | 0 / 0 / 0 / 0 | |
| N1, R8, any other prefix | none | |

Verdict: identical to the expected S3 record (guard exit 1, only R2/R10, R13 informational, HW counts equal, zero new, layers/isolation 0, SI-c9/SI-d7, plugins clean).

### XP3 original declaration snapshot — provenance

1. Separate detached git worktree of Jini at `35c4961af718f0f30591c46d2ea2756c4484a731`, outside both tracked trees (only `.git/worktrees` metadata in the Jini clone); tracked source clean.
2. In it: `CI=true pnpm install --frozen-lockfile` (0), `pnpm --filter @jini-ai/core run build` (0), `pnpm --no-bail -r build` (0, no failures), same toolchain.
3. From that cwd: `node --import <S8 Jini>/node_modules/.pnpm/tsx@4.23.1/node_modules/tsx/dist/loader.mjs <S8 Jini>/scripts/check-no-cross-package.ts --base 35c4961af718f0f30591c46d2ea2756c4484a731 --write-baseline <new absolute dir outside both checkouts>` → exit 0, "3308 source mappings". The checker's own build-tsconfig mapping was used (no one-off generator).
4. Every later gate exports `JINI_DECLARATION_BASELINE_DIR=<that dir>`; it is never regenerated.

| item | value | vs S3 |
|---|---|---|
| manifest `base` | 35c4961af718f0f30591c46d2ea2756c4484a731 | match |
| `manifest.json` SHA256 | d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459 | match |
| source mappings | 3308 | match |
| declaration files | 3320 | match |
| aggregate declaration hash | 48f6d4223224dc975edfbdebf1a01a25bf12044dfd1d4f872624571266452d24 | (new; method below) |

Aggregate method: in the snapshot dir, `find . -type f \( -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' \) -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum`.

### Test baseline (unmodified tree)

Every listed path exists at the pin; no stale-path corrections were needed.

Tovu: 47 unique files (C1 matrix 11 files / 216 tests; C2 Tovu matrix 28 files / 562 tests; accumulated nine + three inherited S3 tests = 12 files / 72 tests; overlap counted once) — 747 tests, 0 failures, every file exit 0.

| T-relative file | exit | tests | pass | fail |
|---|---|---|---|---|
| assistant/__tests__/custom-credential-tools-search-discoverability.test.ts | 0 | 9 | 9 | 0 |
| assistant/__tests__/moved-tools.access-token.golden.test.ts | 0 | 1 | 1 | 0 |
| assistant/__tests__/moved-tools.credential-cards.golden.test.ts | 0 | 1 | 1 | 0 |
| assistant/__tests__/moved-tools.golden.test.ts | 0 | 1 | 1 | 0 |
| assistant/__tests__/tool-registrations.contracts.test.ts | 0 | 36 | 36 | 0 |
| assistant/__tests__/tool-registrations.custom-credentials-egress-refusal.integration.test.ts | 0 | 6 | 6 | 0 |
| features/agent-plugins/__tests__/unit/connect-tool.api-connections.unit.test.ts | 0 | 12 | 12 | 0 |
| features/api-connections/__tests__/plugin-state-format.pin.unit.test.ts | 0 | 1 | 1 | 0 |
| features/custom-credentials/__tests__/auth-failure-diagnostic.unit.test.ts | 0 | 27 | 27 | 0 |
| features/custom-credentials/__tests__/auth-schemes.unit.test.ts | 0 | 21 | 21 | 0 |
| features/custom-credentials/__tests__/create-agent-tool.unit.test.ts | 0 | 39 | 39 | 0 |
| features/custom-credentials/__tests__/credential-copy-tool.test.ts | 0 | 6 | 6 | 0 |
| features/custom-credentials/__tests__/credential-recovery.unit.test.ts | 0 | 6 | 6 | 0 |
| features/custom-credentials/__tests__/credential-save-probe.test.ts | 0 | 22 | 22 | 0 |
| features/custom-credentials/__tests__/credential-save-tool.unit.test.ts | 0 | 31 | 31 | 0 |
| features/custom-credentials/__tests__/credential-works-for-form.unit.test.ts | 0 | 6 | 6 | 0 |
| features/custom-credentials/__tests__/credentialed-request.unit.test.ts | 0 | 63 | 63 | 0 |
| features/custom-credentials/__tests__/form-save-errors.model-facing.test.ts | 0 | 7 | 7 | 0 |
| features/custom-credentials/__tests__/list-agent-tool.unit.test.ts | 0 | 15 | 15 | 0 |
| features/custom-credentials/__tests__/make-request-delete-confirmation.test.ts | 0 | 23 | 23 | 0 |
| features/custom-credentials/__tests__/project-scope.unit.test.ts | 0 | 11 | 11 | 0 |
| features/custom-credentials/__tests__/resolve-by-label.unit.test.ts | 0 | 71 | 71 | 0 |
| features/custom-credentials/__tests__/set-token-agent-tool.unit.test.ts | 0 | 26 | 26 | 0 |
| features/custom-credentials/__tests__/set-username-agent-tool.unit.test.ts | 0 | 12 | 12 | 0 |
| features/custom-credentials/__tests__/tool-registrations.model-facing-errors.test.ts | 0 | 13 | 13 | 0 |
| features/custom-credentials/__tests__/update-username.unit.test.ts | 0 | 8 | 8 | 0 |
| features/custom-credentials/__tests__/vault-repo.tw4.unit.test.ts | 0 | 13 | 13 | 0 |
| features/custom-credentials/__tests__/write-files-confirmation.test.ts | 0 | 11 | 11 | 0 |
| features/custom-credentials/__tests__/write-files-network-failure.model-facing.test.ts | 0 | 5 | 5 | 0 |
| features/custom-credentials/__tests__/write-files-validation.unit.test.ts | 0 | 50 | 50 | 0 |
| features/project-keys/__tests__/attached-vault.unit.test.ts | 0 | 2 | 2 | 0 |
| features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts | 0 | 3 | 3 | 0 |
| features/source-control/__tests__/provider-registry.unit.test.ts | 0 | 16 | 16 | 0 |
| features/source-control/__tests__/repository-target.unit.test.ts | 0 | 4 | 4 | 0 |
| features/source-control/__tests__/tool-registrations.dry-run.test.ts | 0 | 8 | 8 | 0 |
| features/source-control/__tests__/tool-registrations.unit.test.ts | 0 | 33 | 33 | 0 |
| platform/secrets/__tests__/store-vault-guards.unit.test.ts | 0 | 10 | 10 | 0 |
| platform/secrets/__tests__/vault-kinds.unit.test.ts | 0 | 79 | 79 | 0 |
| platform/secrets/__tests__/vault-meta-rules.unit.test.ts | 0 | 11 | 11 | 0 |
| server/runtime/boot/__tests__/mail-engine-parity.unit.test.ts | 0 | 5 | 5 | 0 |
| server/runtime/boot/__tests__/mail-send.golden.test.ts | 0 | 1 | 1 | 0 |
| server/runtime/composition/__tests__/api-connection-state-vault.identity.test.ts | 0 | 1 | 1 | 0 |
| server/runtime/composition/__tests__/cost-counters.baseline.test.ts | 0 | 4 | 4 | 0 |
| server/runtime/composition/__tests__/site-saved-keys.integration.test.ts | 0 | 1 | 1 | 0 |
| server/runtime/composition/__tests__/vault-plugin-state.integration.test.ts | 0 | 2 | 2 | 0 |
| server/runtime/composition/__tests__/vault-unified-credentials.integration.test.ts | 0 | 8 | 8 | 0 |
| server/runtime/composition/__tests__/wiring-identity.test.ts | 0 | 6 | 6 | 0 |

Jini:

| file | exit | tests |
|---|---|---|
| J integrations `src/credentialed-http/__tests__/auth-failure-diagnostic.unit.test.ts` | 0 | 17 |
| J integrations `src/credentialed-http/__tests__/auth-schemes.unit.test.ts` | 0 | 23 |
| J integrations `src/credentialed-http/__tests__/credential-probe.unit.test.ts` | 0 | 49 |
| J integrations `src/credentialed-http/__tests__/credentialed-request.unit.test.ts` | 0 | 99 |
| J integrations `src/credentialed-http/__tests__/ports.contract.test.ts` | 0 | 6 |
| J integrations `src/credentialed-http/__tests__/response-redaction.unit.test.ts` | 0 | 17 |
| J integrations `src/__tests__/package-surface.test.ts` | 0 | 1 |
| Jini `scripts/__tests__/check-no-cross-package.test.ts` | 0 | 41 |
| Jini `scripts/__tests__/extract-s3-checker.test.ts` | 0 | 23 |
| Jini `scripts/__tests__/extract-s3-source-contracts.test.ts` | 0 | 6 |

(Integrations run: 7 files / 212 tests, exit 0. Scripts run: 3 files / 70 tests, exit 0.)

Known excluded S3 prior reds (not in these matrices, not counted green, not fixed): T plugin-host-bundled-identity; J UI `sign-in-card.unit.test.ts` five AbortSignal.any/jsdom; broad T test-tsconfig 12 errors (external-mcp-connection-source.operator-read-only, import-local.integration×8, set-enabled-confirmation-ui, site-imports.integration, agent-plugin-token-boot-order).

### Base hash table (T-relative, SHA256 at start)

| file | SHA256 | vs brief |
|---|---|---|
| assistant/__tests__/fixtures/tool-metadata.baseline.json | a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6 | match |
| assistant/__tests__/fixtures/moved-tools.golden.json | 3583bc14fa8c596d64a2e97a274166f87a0ea278aed3f8c12b926552b7fc5f66 | match |
| assistant/__tests__/fixtures/moved-tools.access-token.golden.json | 61e018a56d59eee3a4b44055136c9a7c6144c5a6b13a948c8f90ebb8b14ca16e | match |
| assistant/__tests__/fixtures/moved-tools.credential-cards.golden.json | 3eb3766de97c9d6699507fbda53b29ec63babd0af1d6381611ee907da4a2fa01 | match |
| server/runtime/composition/__tests__/fixtures/cost-counters.baseline.json | 2be1488c8e4556b71b759536dccac88c78612a22200aa6843748f62cb78e736c | match |

Inherited S3 pins keep their pinned values inline in the test files (no separate fixture file); test-file SHA256 at start:

| file | SHA256 |
|---|---|
| features/api-connections/__tests__/plugin-state-format.pin.unit.test.ts | 57a312280c8e890a00683ab3ce7419bc245e9aebe82821c18a6715698f96e902 |
| server/runtime/composition/__tests__/api-connection-state-vault.identity.test.ts | 63af6d71b754bb755035f8777570cc340834c783d7a28477467000169b879d80 |
| features/agent-plugins/__tests__/unit/connect-tool.api-connections.unit.test.ts | f31899fa0d573d28ae1540ec12ddb45f91efcb89a83ee0798adcbbca085fb88e |

## C0

## C1 seam

## C1 move

## C2 part1

## C2 part2

## F8

## Shared-lane files

## Processes

Setup/baseline: all background runners (install/build, link/tsc, original-checkout build, per-file test loop) exited; none left running.

## Final status
