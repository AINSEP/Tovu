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

C0 is GREEN on the unmoved code. Prior behavior meets every frozen G-cred fixture, so there is no behavior-mismatch stop and C1 may proceed. The fixtures are hash-pinned in the test (see "C0" below), and the post-move gate must rerun the unchanged C0 file.

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

Batch C0 (G-cred), 0 moves, Tovu tests only, written on UNMODIFIED production code. Built 07:00Z–07:20Z (about 20 min, setup wait included).

**Commits (Tovu cloud/extract-s8):** `3e3eaa1d5dedae53f35f227db8ad85c1337b5711` (test plus frozen fixtures) and `2730484e7bcbe3e3eed323e1b8140ec6ad4d0730` (types the foreign-context case list with `satisfies Partial<VaultRecord>[]` and fixes one lint warning; no assertion changed). ls-remote showed `2730484e…` after the push. **Jini:** no C0 changes. Its tip is still the pin `4044fe3c0fa34b1f903c5d20a6b4de7714cde573`, and ls-remote confirms it.

**Files (all NEW, T = apps/website/src/):**

| file | SHA256 at C0 commit |
|---|---|
| features/custom-credentials/__tests__/extract-s8-g-cred.integration.test.ts | aca0785bcb06cb323bc707915f6fe3d94784379965bbc44c686a04a83c80131d |
| features/custom-credentials/__tests__/fixtures/extract-s8/stored-rows.json | 45f7a3839cb1bdb9cfef586c4bc63994e8f8111f1fdb247f7bf3c3faccaf60a2 |
| features/custom-credentials/__tests__/fixtures/extract-s8/expected-summaries.json | 49ed30a958a5ea747142efe621ccb9d8a38abf71aa660832541e6672cabcd5fc |
| features/custom-credentials/__tests__/fixtures/extract-s8/expected-open.json | d39fd19a727e6a53fe056d78d94acc1ca7901695e01f167eb978291485ee74fe |
| features/custom-credentials/__tests__/fixtures/extract-s8/synthetic-key.json | 83e9ca08c77be7c3329d09ad598dea5ad23104322aeedbc39ed8e715b0343e5a |

The test hard-codes the four fixture hashes (`FROZEN_SHA256`) and checks them both at load time and in `test.after`. This means no later batch can regenerate the fixtures without the suite going red.

**Fixture provenance:** the fixtures were minted ONCE on the pins (Tovu c3801c833 / Jini 4044fe3c0). The minting script stayed in session scratch and is not committed; the repo has no committed-generator convention. Mint conditions:
- Key: obviously synthetic bytes 00..1f, derived through the real `FixedRootKeyKeyring` with Tovu's `HKDF_EXTRACTION_SALT`.
- Fixed clock 2026-11-01T00:00:00.000Z and fixed ids.
- Fresh head-schema content database (`openContentDb(":memory:")`).
- Production SQL facade `SqlCustomCredentialSetRepo`.

The two rows:
- `cred-vendor-custom`: kind `vendor`, `meta.credentialType="custom"`, created through the real `createCustomCredential`. It has a username and hints (35/`0001`), and its payload holds the token only.
- `cred-legacy-custom`: kind `custom`, in its post-boot-normalized shape. Its metadata has no `credentialType` or `worksFor` (read defaults apply), `username:null`, and no hints, at revision 2. It is sealed by the real `AesGcmSecretSealer` under `buildVaultAad` over kind `custom`. The store cannot mint this kind: `SecretsVaultService.prepare` refuses a new `custom` identity. The 0012/boot migration lineage could not supply a fixed key either, because `vaultFixture`'s keyring is random. That lineage stays covered by the existing `vault-unified-credentials.integration` test, which C0 imports nothing from and does not modify.

The rows are frozen as SQL column JSON (`SELECT *`). Each test inserts those exact bytes with the read-only `insertFixture` helper from `platform/db/migrations/__tests__/secrets-vault.fixture.ts`. No migration, old fixture or existing test was touched.

**Cases (11, all pass):**
1. Frozen fixtures: the bytes match the C0 hashes, and they seed exactly the frozen stored rows (deepEqual plus byte-identical JSON).
2. The exact context (workspace, owner=tovu, literal AAD `secrets-vault:v1:[ws,id,kind,"tovu",null,null]`, null principal/binding/provider) opens both kinds through `createTovuStoreVault` and through `resolveCustomCredentialByLabel`, without rewriting the stored row. Observed: 0 puts, 0 seals, rows unchanged.
3. Wrong context fails with the canonical `VaultError`: the same class (`constructor === VaultError`) and code `context`. Cases: foreign owner, principal or binding; a kind-rewritten identity in both directions; a hidden DTO with foreign owner, principal, binding, provider or kind. The frozen envelope does not open under the other kind's AAD and does open under its own. A wrong key gives `CustomCredentialSecretStoreUnconfiguredError`.
4. Summary bytes equal `expected-summaries.json` exactly (list plus describe). Inventory and describe-by-label return the same summaries. Summary keys are restricted to the public set, and the bytes contain no token, ciphertext, nonce or keyId. The legacy username is absent, hints are exact, and timestamps are exact. With a project attached, the same rows come back with `scope:"site"` added.
5. `vaultRecord` and `vaultExpectedRevision` are non-enumerable (they appear in neither keys nor JSON) yet carry the exact CAS revision: put expectedRevision 1, record revision 2. A spread copy goes through the compatibility path, which re-reads the current revision. A stale prepared record is refused with canonical `conflict`, and a re-read shows nothing was overwritten.
6. Metadata list and describe do 0 opens. Resolve opens only the selected row, using that row's AAD. A metadata update made by a concurrent writer between label selection and the open is returned from the same read, never paired with the earlier selection's hosts or username.
7. Site rows take precedence over project rows, then the granted project row is the fallback. Project rows that are unattached, or revoked mid-test, are inaccessible to resolve, describe and list, with no opens and no writes.
8. Trusted owner create/replace behaves as before:
   - A create lands in the project store and is hidden until granted.
   - An untrusted update is refused with the exact `P25_OWNER_KEY_READ_ONLY` message, and the project row is unchanged.
   - `allowSharedKeyReplacement` rotates the key with 1 project seal.
9. CAS writes on both kinds keep the compatibility kind, the envelope and the safe hints:
   - Rename, username clear and host change: 0 seals and 0 opens; the envelope, hint, default and createdAt columns are byte-equal; metadata is exact.
   - Compatibility DTO writes also keep everything.
   - Rotation reseals under the row's OWN kind (`custom`) AAD.
10. Failures overwrite nothing and roll back for real:
    - A duplicate label gives `CustomCredentialDuplicateLabelError` with the historical message, and no write happens.
    - A host transaction around a real update throws after the vault write. The changed row was visible inside the transaction, and a re-read afterwards equals the frozen rows: an actual SQLite rollback, checked on stored state rather than through spies.
    - A concurrent winner commits between read and CAS: the stale loser gets canonical `conflict`, and the winner's row remains.
11. An old reader accepts the stored rows that new operations wrote: a create, a legacy update with rotation, and a vendor username set. A reader built from scratch over the stored bytes (fresh facade, fresh sealer) resolves all three and lists the exact hints.

**Old→new replay:** at C0 the old and new code are the same, so case 11 is a same-code replay. The real new→old check comes later: the post-move gate reruns this unchanged file against the moved code. Setting `EXTRACT_S8_G_CRED_REPLAY_DIR` makes case 11 also dump the rows the new code wrote. A pinned old reader then re-reads them from a Tovu checkout at `2730484e` (with the Jini pin). At C0 that reader accepted 3/3 rows, exit 0.

**Counts observed (pinned code, production SQL facade behind counting wrappers):**

| operation | count |
|---|---|
| listCustomCredentials | 2 `vault.list` (unified vendor + legacy custom bridge), 0 opens |
| describe by id | 1 find |
| describe by label | 1 indexed `findByLabel` |
| inventory | 2 lists |
| metadata reads, total | 0 opens / 0 seals / 0 writes |
| resolve | 1 `findByLabel` + 1 find + 1 open (selected AAD only) |
| metadata-only update | 0 seal, 0 open, 1 put |
| compatibility DTO update | 1 find + 1 put |
| rotation | 1 seal |
| trusted replacement | 1 project seal |

**Line-range verification and corrections:** these ranges were checked against the pin:
- vault-repo: scope 8-11, record/hidden DTO 20-34 (defineProperty 31-32), bridge 56-62, compatibility 96-110 (hints 112-120), prepared CAS 122-129.
- store: create 376-393, update 472-492, resolve 518-532 + locateByLabel 538-546 + openLocated 550-556.
- custom-credential-repo.ts is 20 lines and .sqlite.ts is 10.

The brief's ranges are each correct to within 1-2 trailing lines, and no path is stale.

**Not exercised, and why:**
- Postgres/PGlite: this suite is SQLite only. The dialect matrix stays with the existing `platform/db/repos/__tests__/custom-credential-repo.test.ts`.
- `ProjectKeyCreateConflictError` mapping and the hidden project duplicate path of `throwSaveError` (store:354-359) are not driven here, because both need a project create adapter. The existing project-scope tests cover them.
- A label shared across kinds (a vendor-kind create using a legacy custom-kind label) was not probed. The SQL label check is scoped by kind, and that behavior is outside the fixture requirement.
- **No prior-behavior mismatch was found. There is no stop before C1.**

**Gate (C0, old code):**

| check | result |
|---|---|
| New C0 test | 11/11 pass, exit 0 |
| C1 matrix (11 files) | 216/216 pass, all exit 0 |
| Accumulated nine + inherited S3 three (12 files) | 72/72 pass, all exit 0 |
| Explicit compile of the new test (test tsconfig extended, single file) | `npx tsc -p <c0 tsconfig> --noEmit` exit 0 |
| T main | `npx tsc -p tsconfig.json --noEmit` exit 0 |
| `npx eslint` on the new test | exit 0, 0 problems |
| Jini `JINI_DECLARATION_BASELINE_DIR=<XP3 snapshot> pnpm check:cross-package` | exit 0, "XP1–XP5 clean" |
| `pnpm guard` | exit 1, same as baseline |
| `pnpm guard:plugins` | exit 0, clean |
| layers | exit 0 |
| isolation | exit 0 |
| SI audit | c=9 / d=7 |
| Base fixture hashes (5) and inherited S3 test-file hashes (3) | all unchanged |

The guard output is byte-identical to the setup baseline: only R2-deep-path(1) and R10-chatpane-public-surface(1) fail; R13 is informational; HW1/2/3/4/8 = 17/16/135/1/49 with 0 new; HW5/6/7/9 = 0; no N1, R8 or other family.

No background process left running (the single test loop exited 0).

## C1 seam

## C1 move

## C2 part1

## C2 part2

## F8 — see end of report

## Shared-lane files — see end of report

## Processes — see end of report

Setup/baseline: all background runners (install/build, link/tsc, original-checkout build, per-file test loop) exited; none left running.

## Final status — see end of report

## C1 seam — inventory

Recorded before any C1 implementation edit (R5.6). T = `apps/website/src/`, J = Jini `packages/`.
Cited lines verified against the C0 tip: `custom-credentials/store.ts` 562 lines, `vault-repo.ts` 129,
`types.ts` 134, `repo.memory.ts` 7; `platform/secrets/vault-kinds.ts` createTovuStoreVault :62,
parseTovuStoreMeta :92, byVaultLabel :99; `vendor-credentials/project-scope.ts` credentialScopes :39,
credentialCreateTarget :51; vault-repo.ts :9 / :21 `"tovu"` owner, :23/:26/:126 `new VaultError`, :44
`import("../project-keys/attached-vault.js").SiteGrantedVault`; store.ts :354 ProjectKeyCreateConflictError.
Corrections: none (all cited lines match). One closure addition: store.ts also imports
`normalizeCredentialWorksFor` and `VaultError` from `@jini-ai/platform` (a Jini package other than core),
so both are injected too (rows below).

Seam shape: the generic code moves into NEW same-directory files `T features/custom-credentials/sets/{host,vault-repo,store}.ts`
(destination of the next batch: `J integrations/src/credentialed-http/sets/`). They import only
`@jini-ai/core/contracts/{credentials,vault}`, `@jini-ai/core/primitives` (types) and each other. A NEW
Tovu binder `T features/custom-credentials/tovu-credential-sets.ts` holds every Tovu input; `store.ts`
and `vault-repo.ts` become thin bindings keeping every historical export, signature and default;
`types.ts` keeps every name as an alias of the core contract (`allowedOriginsFor` runtime stays in `types.ts`).

| Name | Value/type | Source file:line | Destination | Host vocabulary: permission names, ids and paths — injected or justified | @agent-note obligations |
|---|---|---|---|---|---|
| CustomProviderConnectionInput | type | T custom-credentials/types.ts:27 | core contracts/credentials `CredentialSetConnectionInput`; T alias | none | username is metadata, only token sealed |
| CustomCredentialSetRecord | type | types.ts:33 | core `CredentialSetRecord<C>`; T alias `<CustomCredentialCategoryId>` | category union = host input via `C` | vaultRecord/vaultExpectedRevision non-enumerable, never serialized; same vault + CAS; trusted owner/null/kind/AAD |
| CustomCredentialSummary | type | types.ts:62 | core `CredentialSetSummary<C>`; T alias | `credentialType: "custom"` = core persisted `CredentialType` value (neutral protocol) | metadata only, never decrypts, no token/sealed/private field |
| CustomCredentialScope | type | types.ts:82 | core `CredentialSetScope`; T alias | `site`/`project` neutral scope ids | site first, then granted project |
| CustomCredentialProjectScope | type | types.ts:90 | core `CredentialSetProjectScope<C>`; T alias | none | replaceRepo trusted + grant recheck; inventoryRepo cannot open; createRepo create-only; project sealer/keyring |
| CustomCredentialSetRepoPort | type (repo port, :115-134) | types.ts:115 | core `CredentialSetRepoPort<C>`; T alias | none | CAS writes join host transaction; findByLabel indexed + same authorization; vault is the read vault |
| CredentialTokenHint | type | contracts/core/credential-token.ts:5 (platform) | core `CredentialSetTokenHint` (narrow identical local type; no platform import) | none | computed at seal; read without decrypt |
| CustomCredentialCategoryId / CUSTOM_CREDENTIAL_CATEGORIES | type + runtime const | contracts/core/custom-credential-categories.ts:7,9 | stays T; injected as `host.categories` and as type param `C` | `source-control|hosting|media|ai|ops|general` host validation list; core types use `C extends string` so stored `category` strings stay exactly the same bytes (compatibility: core never narrows or rewrites the stored value) | host list validates writes; reads keep stored value |
| VaultPutRecord / VaultRepoPort / SealedSecret / KeyringPort / SecretSealerPort / VaultErrorCode | types | via @jini-ai/platform re-export of core | core contracts/vault (existing) | none | — |
| ISODateTime / UUID | types | @jini-ai/core/primitives | core contracts use `string` (identical aliases, no extra import) | none | — |
| allowedOriginsFor | runtime fn | types.ts:108 | stays T (NOT core) | none | — |
| customVaultScope | runtime fn | vault-repo.ts:8-11 | generic `credentialSetVaultScope({..., ownerKey})` in sets/vault-repo.ts; T binding unchanged signature | owner `tovu` (vault-repo.ts:9) → required `policy.ownerKey`; null principal/binding neutral | trusted owner, null scope; kind vendor default, custom legacy bridge |
| isCustomCredentialRow | runtime fn | vault-repo.ts:13-15 | sets/vault-repo.ts (private) | kinds `vendor`/`custom`, meta `credentialType` = core VaultKind/CredentialType values (neutral persisted types) | vendor-default/custom-legacy read bridge |
| customVaultRecord | runtime fn | vault-repo.ts:20-34 | generic `credentialSetVaultRecord({row, expectedRevision, policy})`; T binding | owner `tovu` (:21) → policy.ownerKey; parseTovuStoreMeta → policy.parseMeta; VaultError → policy.vaultErrors.create | context/invalid-record canonical errors; non-enumerable private context |
| CustomCredentialVaultRepo | class | vault-repo.ts:37-92 | generic `CredentialSetVaultRepo` (sets/vault-repo.ts); T subclass keeps name + constructor `({vault}, {project})` | byVaultLabel → policy.compareLabels; raw UNIQUE message (vault-repo.ts:83) → policy.labelConflict (host SQL wording) | same vault object, CAS, label order |
| attached-vault SiteGrantedVault | import-type | vault-repo.ts:44 | removed from generic; optional `findRowByLabel` input; T binds `reader.findByLabel` of the SAME vault | none | indexed, same authorization; repo.vault === supplied vault |
| compatibilityVaultRow/Meta/TokenHints, preparedVaultRow | runtime fns | vault-repo.ts:96-129 | sets/vault-repo.ts | none beyond policy | hints kept only for unchanged envelope; prepared CAS identity check |
| VaultError (construct + classify) | runtime class | @jini-ai/platform (vault-repo.ts:23/26/126, store.ts:358,561) | R6 `vaultErrors.create({code}, optionalArgs?)` + `vaultErrors.codeOf(error)`; T binds `new VaultError({code})` / instanceof | none | one canonical class per code; classifier recognizes only it |
| parseTovuStoreMeta | runtime fn | platform/secrets/vault-kinds.ts:92 | host input `policy.parseMeta`; T binds | Tovu meta policy stays T | same complete-shape parser as the vault service |
| byVaultLabel | runtime fn | vault-kinds.ts:99 | host input `policy.compareLabels`; T binds | none | label order identical |
| createTovuStoreVault | runtime fn | vault-kinds.ts:62 | host input `host.openVault({deps, kind})`; T binds with storageError | key/meta protection, owner check stay T | authorize full context before seal/open; crypto → storage error |
| credentialScopes | runtime fn | vendor-credentials/project-scope.ts:39 | host input `host.scopes`; narrow local `CredentialSetScoped`/`CredentialSetScopeCarrier` types | none | site first, then granted project |
| credentialCreateTarget | runtime fn | project-scope.ts:51 | host input `host.createTarget` | `scope must be "site" or "project"` stays T wording | project unless site; create-only owner port |
| isUniqueViolation | runtime fn | @jini-ai/db/kernel (store.ts:6,361) | host input `host.isUniqueViolation` | none | raw UNIQUE → domain duplicate |
| ProjectKeyCreateConflictError | runtime class | project-keys/create-vault.ts:6 (store.ts:354) | host input `host.isCreateConflict` (type guard); message kept | Shared Keys/P25_KEY_CREATE_CONFLICT wording stays T | keep host message |
| normalizeCredentialToken / assertCredentialFreeField / CredentialInputError | runtime | contracts/core/credential-token.ts:3-10 | host input `host.token.{normalize,assertFreeField,isInputError}`; T binds the @tovu/contracts application-key detector variant | none | same validation order; input errors → validation error, same message |
| normalizeCredentialWorksFor | runtime fn | @jini-ai/platform (store.ts:2,560) | host input `host.normalizeWorksFor` | `worksFor must be an array of provider IDs` → host message | canonical vault error → validation error |
| CREDENTIAL_MESSAGES.storage | value | credential-token.ts (platform) | `host.messages.storage` | host wording | — |
| duplicate/project/notFound messages | values | store.ts:335,361,475 | `host.messages.{duplicateLabel,projectDuplicateLabel,notFound}` | `a custom credential labeled…`, `Your project already has a key named…`, `no custom credential…` host wording | verbatim |
| Shared Keys / P25_OWNER_KEY_READ_ONLY messages | values | store.ts:463,504 | `host.messages.{sharedReplacementReadOnly,sharedDeleteReadOnly}` | Shared Keys product name + P25 code host policy | trusted allowSharedKeyReplacement never model input |
| Field validation messages (label/category/baseUrl/additionalHosts/username/connection) | values | store.ts:170-314 | sets/store.ts | neutral schema wording over field names of the neutral contract (justified neutral protocol); category list comes from host | same order and text |
| MAX_LABEL_LENGTH = 200 | value | store.ts:20 | sets/store.ts | neutral limit of the contract (stored labels unchanged) | — |
| Error classes CustomCredential{Validation,DuplicateLabel,ConcurrentModification,SecretStoreUnconfigured,NotFound}Error | runtime classes | store.ts:27-40 | sets/store.ts canonical; T store.ts re-exports the SAME objects | `custom` = core CredentialType value; class names unchanged for identity | one canonical class, old shim same object |
| Store operations (describe/describeByLabel/list/inventory/create/update/delete/resolve) | runtime fns | store.ts:104-556 | sets/store.ts `{host, deps, input}` API; T store.ts thin bindings, same names/signatures | none | metadata never decrypts; resolve opens only the selected authorized row with same-read metadata; CAS; kind preserved |
| Deps/input interfaces (Inventory/Read/Write/Resolve deps, Create/Update input) | types | store.ts:88-95,159-166,316-328,395-427,508-511 | T keeps verbatim; generic twins in sets/store.ts | `TOVU_SITE_KEY` only in T comment | allowSharedKeyReplacement trusted |
| repo.memory.ts InMemoryCustomCredentialSetRepo | class | repo.memory.ts:5-7 | stays T unchanged (platform InMemoryVaultRepo construction) | none | — |
| owner=tovu / null scopes / vendor-custom bridge | values | vault-repo.ts:9,21,56-62 | `tovuCredentialSetVaultPolicy.ownerKey` (T binder); null scopes + bridge in generic (neutral persisted contract) | owner required input, no default | documented in CredentialSetVaultPolicy note |
| custom-credentials/read/write/system.write, credential-copy, tool/catalogModule names | permission/tool ids | tool-registrations / tool-catalog-manifest | C2 | not touched in C1 (no C1 symbol uses them) | C2 |
| copy URI `ui://tovu/use-saved-key/${exchange.id}` | URI | credential-copy tool | C2 | not touched in C1 | C2 |
| set-token apps `tovu-custom-credential-set-token` / `-outcome`, create/outcome apps, path `/:new-key`, answer fields/examples | app ids/paths | tool registrations/cards | C2 | not touched in C1 | C2 |
| Access Tokens / environment wording | text | categories doc, `TOVU_SITE_KEY` comment | T only (comments + host list) | host | — |
| Cycles | — | store.ts → vendor-credentials (pre-existing) | binder only; sets/* has no T import, so no new cycle | — | — |

C1 new tests, named before they are written (T-relative, all NEW files):
- `features/custom-credentials/__tests__/extract-s8-c1-second-host.test.ts` — a second host (different owner key, category list and messages, its own error classes) drives the generic `sets/` store + vault repo over the platform in-memory vault: create/list/describe/resolve/update/delete, owner/null/kind enforcement, canonical error construction + classifier + context, scope/replace/grants with a project half, same vault identity and read/open/seal/write counts, metadata reads with 0 opens.
- `features/custom-credentials/__tests__/extract-s8-c1-source-scan.test.ts` — the `sets/` files import nothing but `@jini-ai/core/*` and same-dir files (no db/platform/UI/Tovu/project/vendor path, no `tovu` owner literal); T old-entry identity: `store.ts` error classes are the `sets/store.ts` objects, `CustomCredentialVaultRepo` constructor shape/instance fields, `repo.vault === suppliedVault`, VaultError identity for context/invalid-record, raw UNIQUE message.
- `features/custom-credentials/__tests__/extract-s8-c1-old-shape.types.test.ts` — independent hand-written copies of the old `types.ts` shapes; exact key/readonly/optional/assignability checks against the aliases, compiled explicitly with `tsc --noEmit` (its runtime body is one trivial node test).

## C1 seam

Coordinator boundary C0→C1: 2026-11-09T07:20:58Z, elapsed 25m37s of 150m, running token total ≈ 412k (setup 131k, C0 241k, coordinator ≈ 40k) of 1.9M cap.

Window: 07:11Z–07:35Z (drafting from 07:11Z, edits after c0-green 07:21Z; ~24 min). Nothing moved into Jini except pure types in core.

Commits (all pushed, `git ls-remote` verified):
- Tovu: 436862ecea8c46796e3dcf12fe3a61f82f0c9ee0 (inventory), 79e039b1ca8dfea70bcd07e90f27852649e62df5 (seam), af4c1cddf28b6b5e0e15acddb6857c9f95b3907d (new tests + one comment reword), 1a8e1bd483c78eb1e41f791c64bd2de7808b4e79 (strict-lint), 98212b56b0c387514bb362381e0a51e1c7b9c9e8 (repair), plus this report commit.
- Jini: 23c19e2ae22192713ef2cb08bd2cb729276e8ea9 (core contracts), 41ff2ffecfbcbb94b4ed0da76491a46a1f5f347f (changeset `extract-s8-c1-credential-set-contracts.md`, @jini-ai/core minor).

Files (T = apps/website/src/features/custom-credentials/):
- NEW generic (only `@jini-ai/core/*` + same-dir imports): T sets/host.ts (102), sets/vault-repo.ts (≈151), sets/store.ts (550).
- NEW Tovu binder: T tovu-credential-sets.ts (57) — owner `tovu`, parseTovuStoreMeta, byVaultLabel, `new VaultError({code})` + instanceof classifier, raw UNIQUE message, createTovuStoreVault+storage error, credentialScopes/credentialCreateTarget, isUniqueViolation, ProjectKeyCreateConflictError, token policy with the @tovu/contracts detector, normalizeCredentialWorksFor, CUSTOM_CREDENTIAL_CATEGORIES, all host wording.
- MODIFIED thin bindings: T store.ts (+34/−461; every export, signature and deps/input interface kept verbatim; error classes re-exported as the same objects), vault-repo.ts (+19/−111; `customVaultScope`/`customVaultRecord`/`CustomCredentialVaultRepo` same signatures; the :44 inline `import()` type replaced by a type import + injected `findRowByLabel` on the same vault), types.ts (+37/−87; every name is now an alias of the core contract specialized to `CustomCredentialCategoryId`; `allowedOriginsFor` runtime unchanged in T; field-level why comments kept in the alias docs).
- J packages/core/src/contracts/credentials.ts (+122): CredentialSetTokenHint, CredentialSetKeyringPort, CredentialSetConnectionInput, CredentialSetRecord<C>, CredentialSetScope, CredentialSetSummary<C>, CredentialSetProjectScope<C>, CredentialSetRepoPort<C>, each with @agent-note (metadata never decrypts; non-enumerable private vault context, same vault + CAS; trusted owner/null/kind/AAD; scope/grant/replacement; findByLabel indexed + same authorization). Relative type import from ./vault.js only; emitted JS is `export {}` + comments (XP4).
- NEW tests: T __tests__/extract-s8-c1-second-host.test.ts (8), extract-s8-c1-source-scan.test.ts (6), extract-s8-c1-old-shape.types.test.ts (1 + compile-time pin).

Inventory correction found during implementation: Tovu's `KeyringPort` (via @jini-ai/integrations/webhooks) has a zero-argument `activeKey()`, while core's vault `KeyringPort` takes `_required`. Using core's would have changed the old project-scope shape, so core gets the narrow `CredentialSetKeyringPort` (zero-arg; both keyring shapes satisfy it). The old-shape pin proves it (mutation to core's port fails compile).

Comment reword in moved-to-be code (exact): sets/store.ts copy of store.ts:36 — before `realistic cause is a missing site key (\`TOVU_SITE_KEY\`), same fail-closed`, after `realistic cause is a missing store key (a host environment setting), same fail-closed`. The original line is unchanged in Tovu history; `TOVU_SITE_KEY` remains in T comments/tests only.

Repair (own bug, red → fix → green): the first seam held the host policy in a `#policy` private field. The existing C2-matrix test features/custom-credentials/__tests__/form-save-errors.model-facing.test.ts wraps the repo with `Object.create(inner)`, which cannot reach a `#private` field (red: 6/7, \"form must be raised\"). Fixed by storing the policy as a non-enumerable `declare`d property (own keys stay `vault, project, findByLabel`); new regression case in extract-s8-c1-source-scan. That existing test was NOT edited; it is 7/7 again.

Gate (after the repair commit; Node 24.2.0):
| step | command | exit | result |
|---|---|---|---|
| core build | `pnpm --filter @jini-ai/core run build` | 0 | — |
| core tsc | `pnpm --filter @jini-ai/core exec tsc --noEmit` | 0 | — |
| relink | `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` | 0 | — |
| T main tsc | `npx tsc -p tsconfig.json --noEmit` | 0 | — |
| explicit pin compile | `tsc -p <tsconfig extending tsconfig.tests.json, files = the 3 new tests>` | 0 | mutation check (old label made mutable + core KeyringPort) → exit 2, 6 errors |
| eslint T | `npx eslint` on the 7 changed/new code files + 3 new tests | 0 | 0 problems (3 warnings fixed) |
| eslint J | `pnpm exec eslint packages/core/src/contracts/credentials.ts` | 0 | 0 |
| Tovu tests | node test runner, `--test-concurrency=1`, one file at a time | all 0 | 51 files / 773 tests / 0 fail: C1 matrix 11 files (216), accumulated nine + inherited S3 three (72), C2-Tovu matrix 28 files (562, regression run), C0 extract-s8-g-cred (11), new C1 (15); baseline 747 + 11 + 15 = 773 |
| XP | `JINI_DECLARATION_BASELINE_DIR=<original-35c4961af snapshot> pnpm check:cross-package` | 0 | XP1–XP5 clean; snapshot manifest d836eba0…728d459 and aggregate d.ts hash 48f6d422…452d24 unchanged |
| guard | `pnpm guard` | 1 | byte-identical to setup baseline: only R2-deep-path(1), R10-chatpane-public-surface(1); R13 informational; HW1=17/HW2=16/HW3=135/HW4=1/HW8=49, HW5/6/7/9=0, 0 new; no N1/R8/other family |
| guard:plugins / layers / isolation | as setup | 0/0/0 | clean; SI audit c=9, d=7 |
| hashes | sha256 of the 5 base fixtures | — | all 5 match the brief; C0 fixtures/test unchanged since 3f19a8bd |

Manual relative-edge review: sets/* import only `./host.js`, `./vault-repo.js` and `@jini-ai/core/contracts/{credentials,vault}`, `@jini-ai/core/primitives` (types); asserted by extract-s8-c1-source-scan. core/contracts/credentials.ts imports only `./vault.js` (type). No Jini package gained a dependency. No existing test/fixture in either repo was modified, deleted or renamed; no migration, guard, checker or debt file touched.

Shared-lane files: none. tool-catalog-manifest.ts, deps.ts, external-mcp, api-connections, plugin-runtime and J agent-plugins/mcp/plugins were not touched (checked with `git diff --name-only` from the C0 tip).
Gate status: fully green.

## C1 move — destination inventory

Recorded before any C1 move edit (R5.6). Sources at Tovu 43a0e5d453b29b760402a54a5be4831bdd7d617c, Jini base 41ff2ffecfbcbb94b4ed0da76491a46a1f5f347f. T = `apps/website/src/features/custom-credentials/`, J = Jini `packages/`.
Public entry: `@jini-ai/integrations/credentialed-http/sets` → `./dist/credentialed-http/sets/index.{js,d.ts}`, `typesVersions["credentialed-http/sets"]`, `jini.entries["./credentialed-http/sets"] = "node"` (same shape as `./credentialed-http`). `@jini-ai/integrations` already depends on `@jini-ai/core` (`workspace:^`); nothing is added. The existing `./credentialed-http` entry and its exports are unchanged.

| Name | Value/type | Source file:line | Destination | Host vocabulary: permission names, ids and paths — injected or justified | @agent-note obligations |
|---|---|---|---|---|---|
| sets/host.ts (all host-input contracts: CredentialSetVaultErrors, CredentialSetVaultPolicy, CredentialSetLabelReader, CredentialSetScoped/ScopeCarrier, CredentialSetStoreVault, CredentialSetVaultWrite, CredentialSetOpenVaultDeps, CredentialSetStoreHost, CredentialSetMessages) | types | T sets/host.ts:1-102 | J integrations/src/credentialed-http/sets/host.ts (copied verbatim + provenance @file line) | none in source: owner key, meta parser, categories, scope policy, error factories and all wording are REQUIRED host inputs, no default | existing notes kept: canonical vault errors one identity per code; indexed label lookup over the SAME vault; vault service authorizes full context before seal/open; host wording verbatim |
| sets/vault-repo.ts (credentialSetVaultScope, credentialSetVaultRecord, CredentialSetVaultRepo, compatibility/prepared row helpers) | runtime + types | T sets/vault-repo.ts:1-151 | J …/credentialed-http/sets/vault-repo.ts | owner = `policy.ownerKey` (Tovu binds `tovu`); kinds `vendor`/`custom` and meta `credentialType` are core `VaultKind`/`CredentialType` persisted values (neutral protocol); raw UNIQUE text = `policy.labelConflict` (host SQL wording) | trusted owner, null principal/binding, vendor default + custom legacy read bridge; non-enumerable private vault context never serialized; CAS prepared-row identity; same vault object |
| sets/store.ts (CustomCredential{Validation,DuplicateLabel,ConcurrentModification,SecretStoreUnconfigured,NotFound}Error; describe/describeByLabel/list/inventory/create/update/delete/resolve credential-set operations; deps/input types; MAX_LABEL_LENGTH) | runtime + types | T sets/store.ts:1-550 | J …/credentialed-http/sets/store.ts — the ONE canonical class per error; Tovu `store.ts` re-exports the same objects | categories = `host.categories`; scopes/createTarget/isUniqueViolation/isCreateConflict/token/normalizeWorksFor/openVault host inputs; messages (duplicate/project duplicate/notFound/storage/Shared Keys read-only) = `host.messages`; field-validation wording over neutral contract field names (justified neutral schema text, unchanged); `custom` in class names = core CredentialType value. Comment-only references (`vendor-credentials/project-scope.ts`, `types.ts`, route `409 DUPLICATE_LABEL`/`400`) are provenance pointers kept verbatim (no runtime value); reworded only if a guard rejects them | metadata never decrypts; resolve opens only the selected authorized row with same-read metadata; scope order site then granted project; trusted allowSharedKeyReplacement never model input; CAS; kind preserved |
| sets/index.ts | barrel (NEW) | — | J …/credentialed-http/sets/index.ts: `export *` of host/vault-repo/store | none | @file note: every product value is a required host input; one canonical error class per kind |
| VaultError | runtime class | @jini-ai/platform | stays host canonical (Tovu binds `new VaultError({code})` + instanceof via `vaultErrors`) | — | — |
| allowedOriginsFor | runtime fn | T types.ts | stays T (not needed by sets; never core) | — | — |
| repo.memory.ts InMemoryCustomCredentialSetRepo, tovu-credential-sets.ts binder, SQL/indexed `findByLabel`/kernel/project adapter, vendor-credentials scope, token/category/meta policy, routes, tools | runtime | T | stay T unchanged except import specifiers (`./sets/*.js` → `@jini-ai/integrations/credentialed-http/sets`) | Tovu ids/owner/paths/wording remain only here | — |
| T sets/{host,vault-repo,store}.ts after the move | re-export shims | T | each re-exports the J entry (same objects/types) so existing importers (incl. the C1 seam tests) keep working; no generic code stays in Tovu | none | — |

Every moved contract keeps its @agent-notes in J source and emitted `.d.ts`; the new `index.ts` adds the second-host obligations summary.

New pins, named before edits:
- J `integrations/src/credentialed-http/sets/__tests__/extract-s8-sets.unit.test.ts` (vitest, relative imports like the sibling credentialed-http tests): public entry wiring (package.json export/typesVersions/jini.entries + built entry exports), a second host (different owner/categories/messages) over an in-test vault fake, error class identity through the entry, declaration closure (built `dist/credentialed-http/sets/*.d.ts` reference only `@jini-ai/core/*` and same-directory paths), @agent-notes present in emitted `.d.ts`.
- J `examples/neutral-host/src/credential-sets.test.ts` (vitest via `pnpm --filter @jini-example/neutral-host exec vitest run`, typechecked by its `tsc -p tsconfig.json`): a neutral host wiring the public `@jini-ai/integrations/credentialed-http/sets` entry with `@jini-ai/platform` vault parts (host tests may import several packages).

## C1 move

Coordinator boundary C1 seam→C1 move: 2026-11-09T07:35:37Z, elapsed 40m16s; running token total ≈ 0.93M at move digest (setup 131k, C0 241k, C1 seam 269k, C1 move 183k, C2p1 drafting in progress, coordinator ≈ 70k) of 1.9M cap.

Window: 07:36Z–07:50Z (clock per `date -u` in the session container). Status: fully green after the coordinator-approved new-test wiring correction below (the first digest reported one red test and no marker).

Commits (all pushed, `git ls-remote` verified):
- Tovu: 610441e9e29f6ce4fb7650e49d6842e87a5068c4 (destination inventory), cc12641d3c4f3aa019d7e683564fb9ff58cc1e1d (repoint + shims), plus this report commit.
- Jini: 63e11c5d4e5575a23af0892857de302de71a13ea (move + entry + changeset), b86e8a76abba75cb959a08f07a66f34e1591ef19 (new pins + core note correction).

Moved (cross-repo, provenance in the Jini commit message: `AINSEP/Tovu apps/website/src/features/custom-credentials/sets/{host,vault-repo,store}.ts@43a0e5d4`):
- J packages/integrations/src/credentialed-http/sets/host.ts (102 → 104), vault-repo.ts (151 → 153), store.ts (550 → 552): byte-identical to the Tovu seam files except two added provenance lines in each `@file` block. NEW index.ts barrel with the second-host `@agent-note`.
- Provenance deviation (forced by the guard, recorded): the requested in-source wording "moved from AINSEP/Tovu <path>" would fail source-neutrality rules N1-consumer-identity (`/tovu/i`, comments included) and N2-consumer-path (`apps/website`). The `@file` line therefore reads "moved unchanged (EXTRACT-S8 C1 move) from the first host's credential-set seam file `sets/<name>.ts` at its commit 43a0e5d4"; the full repo/path is in the Jini commit message and here.
- Jini-strictness edits: **none** — the three files compile unchanged under the package tsconfig (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).
- Imports after the move: only `./host.js`, `./vault-repo.js`, `./store.js`, `@jini-ai/core/contracts/{credentials,vault}`, `@jini-ai/core/primitives`; no relative path leaves packages/integrations; no Tovu vocabulary (manual grep for tovu, apps/, #src, Shared Keys, Access Tokens, P25, secrets_vault: none). Comment-only references `vendor-credentials/project-scope.ts`, `types.ts`, route `409`/`400` kept verbatim (no guard rejection).
- Entry: `@jini-ai/integrations/credentialed-http/sets` in exports (types/import/default), typesVersions, `jini.entries` = node — same shape as `./credentialed-http`; dependencies still only `@jini-ai/core`. Changeset `.changeset/extract-s8-c1-credential-sets-entry.md` (@jini-ai/integrations minor). `./credentialed-http` unchanged.
- Tovu: tovu-credential-sets.ts (binder), store.ts and vault-repo.ts import the public entry (import specifiers + three comment path references updated to the entry name). sets/{host,vault-repo,store}.ts are now 7-line re-export shims of the entry (`export type *` for host.ts, `export *` for the others) so the error classes stay ONE object. VaultError stays host canonical; repo.memory.ts, SQL/indexed query/kernel/project adapter, allowedOriginsFor stay in Tovu, unchanged.
- Core note correction (J packages/core/src/contracts/credentials.ts, doc-only, found reading as a second host): `CredentialSetKeyringPort`'s note said "both historical keyring shapes satisfy it"; a keyring whose `activeKey` takes the vault port's required options argument (platform keyrings) does NOT, and the host adapts it (`activeKey: () => keyring.activeKey({})`). Covered by the existing unreleased core minor changeset.

New pins: J integrations sets/__tests__/extract-s8-sets.unit.test.ts (5 tests: entry declaration; one canonical object per runtime export; second host with owner `second-host`, categories red/blue and its own messages — metadata reads 0 opens, resolve 1 open, 1 seal; canonical error classes and host `context` error for a foreign owner; emitted `.d.ts` closure = core subpaths + same directory and @agent-notes present). Mutation check: an extra `@jini-ai/platform` import appended to the emitted store.d.ts → the closure test fails (1 of 5); rebuild → 5/5. J examples/neutral-host/src/credential-sets.test.ts (1 test: owner `library-host`, books/tools, create/list/describe/resolve/duplicate/category/delete through the public entry).

Gate (after transport; Node 24.2.0):
| step | exit | result |
|---|---|---|
| core build / core tsc | 0 / 0 | — |
| integrations build / `exec tsc --noEmit` | 0 / 0 | build also compiles the new J pin (package tsconfig includes src) |
| integrations vitest: 6 credentialed-http files + package-surface + new pin | 0 | 8 files / 217 tests (212 baseline + 5) |
| neutral-host vitest (new pin) / neutral-host `tsc -p` | 0 / 0 | 1/1 |
| scripts/__tests__ three (with XP3 snapshot env) | 0 | 3 files / 70 |
| `JINI_DECLARATION_BASELINE_DIR=<35c4961af snapshot> pnpm check:cross-package` | 0 | XP1–XP5 clean |
| guard | 1 | identical to the setup baseline: R2-deep-path(1), R10-chatpane-public-surface(1) only; HW1=17/HW2=16/HW3=135/HW4=1/HW8=49, HW5/6/7/9=0, 0 new; no N1/N2/R8/other |
| guard:plugins / layers / isolation / SI audit | 0/0/0/0 | clean; SI c=9, d=7 |
| T relink / T main tsc | 0 / 0 | — |
| T explicit compile of the 3 C1 seam pins | 0 | — |
| eslint T (6 changed) / J (7 changed/new) | 0 / 0 | 0 problems |
| Tovu tests, 51 files one at a time (C1 matrix 11, C2-Tovu 28, accumulated nine + inherited S3 three, C0, C1 seam three) | all 0 but one | 773 tests, 772 pass, **1 fail**: extract-s8-c1-source-scan.test.ts test 1 |
| C0 + new→old replay | 0 | C0 11/11 with `EXTRACT_S8_G_CRED_REPLAY_DIR`; rows written by the moved code read by the pinned old reader from a detached Tovu worktree at C0 3f19a8bd: 3/3 accepted; dump differs from the C0 dump only in `sealed_ciphertext`/`sealed_nonce` (fresh randomness) |
| hashes | — | 5 base fixtures + 3 inherited S3 pins match; C0 fixtures/test unchanged since 3f19a8bd; counts unchanged (C0 test green, cost-counters baseline green) |

**Open: drift in a committed C1 seam test.** extract-s8-c1-source-scan.test.ts test 1 ("sets/ imports nothing but @jini-ai/core subpaths and same-directory files") scans the Tovu `sets/*.ts` paths; after the move those paths are shims importing `@jini-ai/integrations/credentialed-http/sets`, so it fails by design. Deleting the shims (as first dispatched) would instead break that whole file and extract-s8-c1-second-host.test.ts at import (14 tests). Rules forbid editing a committed test without approval, so the test was not touched. The test's purpose (its @file: "so they can move into Jini unchanged") is now proven at the destination by the J closure pin. Coordinator choices: (a) approve retargeting test 1 to scan the shims (one specifier = the entry) plus the resolved entry's emitted files (core + same directory only), or (b) record test 1 as retired-by-design.

Shared-lane files: none (no tool-catalog-manifest/deps/external-mcp/api-connections/plugin-runtime/agent-plugins/mcp/plugins file touched). No existing pre-session test or fixture modified, deleted or renamed in either repo; no migration, guard, checker, debt or baseline edit. Processes: background runners (Tovu 51-file loop, Jini gate script) exited; none left. Scratch worktree of Tovu at C0 kept outside the tracked tree (registered in Tovu .git/worktrees).

### New-test wiring correction (coordinator-approved, option (a))

Rationale: extract-s8-c1-source-scan.test.ts is a NEW session-authored pin (C1 seam), not a pre-session test, so the brief's "NEW test wiring mistakes fix normally" applies. The retarget keeps the same property (the moved generic code imports only `@jini-ai/core` + same-directory files) at its new location, adds the shim-imports-only-the-entry check, and keeps BOTH `doesNotMatch` assertions unchanged; no assertion softened. The scan covers the three moved modules (`host`, `vault-repo`, `store`; emitted `.js` and `.d.ts` from the resolved entry directory) rather than every file there: the new `index.ts` barrel's note names its own entry, which is not a moved file. The original per-file "has imports" check now applies per moved module (`.js` + `.d.ts` together), because type-only modules emit `.js` with no imports. Imports added: `dirname`, `join` (node:path), `fileURLToPath` (node:url). Mutation: `import "@jini-ai/platform";` appended to the emitted store.js → test 1 red (5/6); rebuild → 6/6.

Before:
```ts
test("sets/ imports nothing but @jini-ai/core subpaths and same-directory files", () => {
  for (const file of SETS) {
    const source = readFileSync(file, "utf8");
    const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(match => match[1]!);
    assert.ok(specifiers.length > 0, `${file.pathname} has imports`);
    for (const specifier of specifiers) {
      assert.ok(/^@jini-ai\/core(\/[a-z/-]+)?$/.test(specifier) || /^\.\/[a-z-]+\.js$/.test(specifier), `${file.pathname}: forbidden import ${specifier}`);
    }
    assert.doesNotMatch(source, /require\(|#src\/|@tovu\/|@jini-ai\/(?!core)/, `${file.pathname}: no Tovu, db, platform or other Jini package`);
    assert.doesNotMatch(source, /["']tovu["']|Shared Keys|P25_|TOVU_|secrets_vault/, `${file.pathname}: no product owner, wording or table names`);
  }
});
```
After:
```ts
test("sets/ shims import only the Jini entry; the moved code imports nothing but @jini-ai/core subpaths and same-directory files", () => {
  for (const file of SETS) {
    const source = readFileSync(file, "utf8");
    const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(match => match[1]!);
    assert.deepEqual(specifiers, ["@jini-ai/integrations/credentialed-http/sets"], `${file.pathname}: shim imports only the entry`);
  }
  const dir = dirname(fileURLToPath(import.meta.resolve("@jini-ai/integrations/credentialed-http/sets")));
  for (const name of ["host", "vault-repo", "store"]) {
    const files = [`${name}.js`, `${name}.d.ts`].map(file => join(dir, file));
    let count = 0;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(match => match[1]!);
      count += specifiers.length;
      for (const specifier of specifiers) {
        assert.ok(/^@jini-ai\/core(\/[a-z/-]+)?$/.test(specifier) || /^\.\/[a-z-]+\.js$/.test(specifier), `${file}: forbidden import ${specifier}`);
      }
      assert.doesNotMatch(source, /require\(|#src\/|@tovu\/|@jini-ai\/(?!core)/, `${file}: no Tovu, db, platform or other Jini package`);
      assert.doesNotMatch(source, /["']tovu["']|Shared Keys|P25_|TOVU_|secrets_vault/, `${file}: no product owner, wording or table names`);
    }
    assert.ok(count > 0, `${name} has imports`);
  }
});
```

Rerun after the correction: source-scan 6/6, C1 second-host 8/8, C0 11/11 (all exit 0); explicit compile of the 3 C1 pins exit 0; eslint on the edited test exit 0. Tovu total 773/773: the 51-file run above had 772 pass and only this test failing; the corrected file now passes 6/6, and nothing else changed between the runs (an integrations rebuild re-emitted identical files).

## C2 part 1 — inventory

Recorded before any C2 implementation edit (R5.6). T = Tovu `apps/website/src/`, J = Jini `packages/`.
Scope: every helper/type/value a prospective C3 move of the custom-credential tool registrations
(`T features/custom-credentials/tool-registrations.ts`, 1,245 lines; imports :1-78), the credential-copy
tool (`credential-copy-tool.ts`, 130 lines) and the write-files/source-control write path would consume.
C3 itself is NOT authorized in this session; the destination column says where the dependency would
come from once it is, without any forbidden import. "Same package" means the C3 destination
`J integrations` (the package `credentialed-http` and, after C1 move, the credential-set store live in).
Rule applied to every row: a moved handler may import only its own package and `@jini-ai/core`
(root or `contracts/<area>` / existing core subpaths). Anything from `@jini-ai/{cms,daemon,ui,platform,
agent-plugins,plugins,devops}` or from Tovu becomes a named local port or named host input.

Cited lines verified at the C1 move tip (Tovu afa3b2c3, Jini b86e8a76). Corrections to the brief's citations: none — `credentialed-request.ts`
`resolveRequestTarget` :720, `verifyCustomCredential` :734, `makeCredentialedRequest` :749,
`probeCredentialConnection` :766; tool-registrations build/validate/plan/commit :1193-1225, plan-bound
commit :381-391, safe-message egress reconstruction :224-231 all match.

Design-stop candidates: **none**. Every row resolves to same package, core root/subpath, core contracts,
a named local port (the two new ports) or a named host input.

### A. Credentialed request (new `CredentialedRequestPort`, J core/contracts/credentials)

| Name | Value/type | Source file:line | Destination | Host vocabulary — injected or justified | @agent-note obligations |
|---|---|---|---|---|---|
| makeCredentialedRequest | async fn (deps, input) → executed result | T custom-credentials/credentialed-request.ts:749 | named local port `CredentialedRequestPort.request` (T binder binds this exact fn) | Access Tokens remedy suffix (:713-716) and not-found identity stay in the T adapter behind the port | executes only after caller policy; DELETE is held by the caller, never by the port; egress refusal identity preserved; result never carries secret/header/username |
| resolveRequestTarget | async fn → `{label, url: URL}` | credentialed-request.ts:720 | `CredentialedRequestPort.resolveTarget` | same remedy/not-found policy as above | NEVER decrypts; must run before any dialog or decrypt |
| verifyCustomCredential | async fn → verification result | credentialed-request.ts:734 | `CredentialedRequestPort.verify` | verification messages are J integrations text (neutral, label-only) | tri-state valid/invalid/unreachable; transport failure is "unreachable", never "invalid"; authDiagnostic facts only |
| probeCredentialConnection | fn (required, {httpClient}) → ok/refused/unavailable | credentialed-request.ts:766 (over J integrations credentialed-http/credentialed-request.ts:~322) | `CredentialedRequestPort.probe` (binder closes over the guarded client) | none | URL is trusted, host-resolved against the saved origin; bodyless GET, no redirects; no body/header/secret escapes |
| CredentialedRequestDeps {repo, sealer, httpClient, clock, audit?, loadAuthSchemes} | interface | credentialed-request.ts:648 | named host input — closed over by the T binder; never crosses the port | `[custom-credentials]` audit prefix (:629) host | binder must reuse composition's guarded client and the same repo/sealer the store uses |
| MakeCredentialedRequestInput | interface (label/method/url unknown + headers/body unknown) | T :657, J integrations credentialed-request.ts:461 | core `CredentialedRequestRequired`/`CredentialedRequestOptional` (label/method/url `string` — handlers already `requireString` them; headers/body stay `unknown`: untrusted model fields the port validates) | none | headers/body are validated by the port, never pre-trusted |
| CredentialedRequestExecutedResult | interface | J credentialed-request.ts:444 | core mirror `CredentialedRequestResult` (structurally identical) | none | redacted provider output only |
| CredentialedRequestDeclinedResult / Outcome | interface/union | J :453/:459 | same package (only the host confirmation layer produces "declined"; not a port result) | none | — |
| CustomCredentialVerificationResult / CustomCredentialCheckStatus | interface / union | J :381 / :297 | core mirror `CredentialVerification` / `CredentialCheckStatus` | none | checkedAt from injected clock |
| AuthFailureDiagnostic | interface | J :174 | core mirror `CredentialAuthFailureDiagnostic` | `remedyToolId` is a host-registered tool id (host input) | never the token/header/username value |
| CredentialConnectionProbeInput / CredentialConnectionProbeStatus | interface / union | J :304 / :300 | core mirror `CredentialProbeInput` / `CredentialProbeStatus` | none | — |
| CredentialSchemeRule | interface {id,prefix,scheme} | J integrations credentialed-http/auth-schemes.ts:1 | core mirror `CredentialAuthSchemeRule` | rule ids come from installed plugins (host trust policy) | host owns digest trust of plugin rules |
| CredentialedRequestValidationError | class | J integrations contracts/credentialed-request-errors.ts | same package; reported by `classifyError` as `validation` | none | message is caller-safe (caller's own url, header keys, saved origins) |
| CredentialedRequestTransportError | class | J credentialed-request.ts:31 | same package; `classifyError` → `transport` | none | raw transport text never caller-safe: no message field |
| EgressRefusedError | runtime class (host) | T platform/http/index.ts | `classifyError` → `egress-refused` with `callerSafeMessage` + host-built `callerSafeError` (exactly the :229 reconstruction) | host class; the port hides it | full message (resolved address) stays in audit/server log; model sees callerSafeMessage only |
| CustomCredentialNotFoundError | class | T custom-credentials/store.ts (C1) | `classifyError` → `not-found`; class itself already in J integrations credentialed-http/sets (C1 move) | label-only message | not schema-decorated |
| isCredentialedRequestShapeRejection | fn | tool-registrations.ts:208 | same package (C3) over `classifyError` category ∈ {validation, egress-refused} | none | transport/not-found/unknown never decorated |
| makeModelFacingCredentialedRequest | fn | tool-registrations.ts:224-231 | same package (C3) over `request` + `classifyError(...).callerSafeError` | catalog/tool id host inputs | reconstruction BEFORE decoration reads `.message` |
| CredentialedRequestAuditPort, Console/InMemory audit | interface/classes | T credentialed-request.ts:620-645 | named host input (inside binder) | `[custom-credentials]` prefix | metadata only |
| REQUEST_POLICY / mapDiagnostic / rethrowHostError | consts/fns | T credentialed-request.ts:690-717 | host-retained behind the port | Access Tokens wording | unchanged |
| loadAuthSchemes | dep fn | tool-registrations.ts:153 (deps), used :558 | named host input (`CredentialSchemeRegistryPort` shape is J integrations ports.ts:13, same package) | installed-plugin trust policy | — |
| probeCardBeforeSave | fn | tool-registrations.ts:551-566 | same package (C3) over `port.probe` + host `loadAuthSchemes`; refusal/unavailable/origin texts host input | "This key was refused…", "The service couldn't be reached…", "The saved origin no longer matches…" host text | origin check before any send; abort checks around probe |
| buildAuthorizationHeader | fn | J integrations credentialed-http (import :15) | same package | none | header value never logged |

### B. Source-control write (new `SourceControlWritePort`, J core/contracts/credentials)

| Name | Value/type | Source file:line | Destination | Host vocabulary — injected or justified | @agent-note obligations |
|---|---|---|---|---|---|
| buildSourceControlProviderForApi | async fn → `{ok, provider}`/`{ok:false,message,refusals}` | T source-control/provider-registry.ts:297 | `SourceControlWritePort.build` (binder closes over load/httpClient/observability) | "No enabled Agent Plugin provides source control for …" (:307), noSourceControlProviderMessage (:265) host text | one build per call; current registry; saved baseUrl from the non-decrypting summary |
| LoadSourceControlProviders | type | provider-registry.ts:207 | named host input (binder) | `tovu-source-control.json` (:35) host file name, never in Jini | — |
| SourceControlProvider | type | source-control/provider-module.ts:179 | core `SourceControlFileWriter` (structural subset: planFileWrite, commitFiles, validateTarget?) | provider ids/labels are plugin-declared | port returns the SAME object; plan and commit go to that object |
| RepositoryTarget / RepositoryTargetValidator | interface / fn type | provider-module.ts:~199/~205 | core mirrors | GitHub wording lives in the plugin | pure, never throws |
| validateRepositoryTarget | fn (throws CustomCredentialValidationError) | custom-credentials/write-files-validation.ts:95 (→ T source-control/repository-target.ts → `@jini-ai/devops`) | `SourceControlWritePort.validateTarget` (devops is forbidden to integrations, so the host binds it) | host rule text | runs before decrypt |
| CredentialedRepositoryTarget, WriteFile, FileWriteState, FileWritePlan | interfaces | provider-module.ts:65/72/77/84 | core mirrors | none | plan = read-only reconnaissance the commit must use unchanged |
| FileWritePlanResult, CommitFilesResult, ProviderCallFailure | unions | provider-module.ts:90/92/59 | core mirrors | `logDetail` server-log only | logDetail never model-facing |
| provider.planFileWrite / provider.commitFiles | methods | provider-module.ts:164-168 | `SourceControlWritePort.planFileWrite` / `.commitFiles` | none | commit with EXACT plan; abort → no commit; freshness/atomicity owned by provider |
| performRepositoryFilesWrite | fn | tool-registrations.ts:381-397 | same package (C3) over `commitFiles` | none | same provider + exact plan |
| writeTarget | fn | tool-registrations.ts:400-402 | same package (buildAuthorizationHeader same package) | none | decrypted connection only in-process |
| reportRepositoryWriteFailure / failureLog | fns | tool-registrations.ts:536 / :522 | same package (C3) + named host input `failureLog` (deps :158) | `[custom-credentials]` prefix, tool id host input | only code + logDetail |
| WriteFilesResult | union | tool-registrations.ts:373 | same package | none | no token-carrying field |
| validateWriteFilesInput, WRITE_FILES_LIMITS, validateBranch/CommitMessage, normalizeWriteFilePath | fns/consts | write-files-validation.ts:61/103/117/140 | same package (C3); its error class: C1 — see C1 inventory (host error factory); `isNonArrayRecord` core root | rule texts (fixed strings) move verbatim | validation before resolve |
| isWriteFilesShapeRejection | fn | tool-registrations.ts:253 | same package | none | only around validation |

### C. Core registration/catalog/schema/model-error/permission helpers

| Name | Value/type | Source file:line | Destination | Host vocabulary — injected or justified | @agent-note obligations |
|---|---|---|---|---|---|
| buildDomainRegistrations, indexCatalogById, requireInputRecord, requireNoInput, requireString, withSchemaOnRejection, redactSecrets, ToolInputError, isNonArrayRecord | values | J core (registration-kit.ts:332/486, redact.ts:414) via `@jini-ai/core` | core root | none | — |
| AgentToolSideEffect, DerivedRiskByToolId, ToolHandler, ToolRegistration, ToolExecutionContext/Options, ToolContributor, SurfaceEmission, AgentToolDefinition | types | `@jini-ai/core` | core root | none | — |
| callerSafeErrorMessage, withModelFacingErrors, CallerSafeErrorRule, ModelFacingErrorRule, forbiddenRule (core) | values/types | J core/src/model-facing-tool-errors.ts:141/230 | core subpath `@jini-ai/core/model-facing-tool-errors` | none | allowlist: unlisted errors stay redacted |
| requireToolPermission, adaptLegacyAuthorize | values | today via `@jini-ai/cms/core` (tools/args.ts re-export); real source J core/src/tool-permissions.ts:75/:87, core index.ts:57-58 | core root (no cms/commands-barrel dependency) | permission strings host input | check before any resolve |
| LegacyToolAuthorizeFn / AuthorizeFn | type | core tool-permissions.ts:15 / T contracts/core/commands | core root `LegacyToolAuthorizeFn` | none | — |
| forbiddenRule (T) | fn over cms ForbiddenError | T contracts/core/model-facing-tool-errors.ts:35 | core `forbiddenRule` + core `ToolPermissionDeniedError` (index.ts:56; same class cms re-exports as ForbiddenError, cms commands/command.ts:1) with host-input domain prefix | `CUSTOM_CREDENTIALS` prefix host input | class identity unchanged |
| describeErrorForLog (T) | fn | T contracts/core/model-facing-tool-errors.ts:51 | named host input (log policy) | none | never the raw message |
| DOMAIN / READ_PERMISSION / WRITE_PERMISSION | consts `custom-credentials`, `.read`, `.write` | tool-registrations.ts:169/171/174 | named host inputs (domain, entityType, permissions) | Tovu permission vocabulary | — |
| catalogModule | `"features/custom-credentials/agent-tools.ts"` | tool-registrations.ts:1233 | named host input | Tovu path | — |
| toolMetadata | const | T contracts/core/tool-metadata/custom-credentials.ts:5 | named host input | Tovu catalog metadata | — |
| customCredentialsAgentToolCatalog, WRITE_FILES_TOOL_ID | catalog/const | custom-credentials/agent-tools.ts | named host input (catalog text, examples incl. example URLs, ids) | product wording incl. example.com | — |
| MAKE_CREDENTIALED_REQUEST_TOOL_ID, CREDENTIAL_SAVE_TOOL_ID, CREDENTIAL_COPY_TOOL_ID | consts | delete-request-confirmation-ui.ts:19, T contracts/headless/secret-form-cards.ts:2, credential-copy-tool.ts:11 | named host inputs | tool ids | — |
| CUSTOM_CREDENTIALS_MODEL_FACING_ERRORS | rule list | tool-registrations.ts:297-320 | named host input (codes `CUSTOM_CREDENTIALS_*`, guidance, fixed messages) | Tovu wording/codes | secret-store message fixed, never err.message |
| FORM_SAVE_CALLER_SAFE_ERRORS / FORM_SAVE_FAILURE_MESSAGE | list/const | tool-registrations.ts:504/516 | named host input | Tovu wording | — |
| customCredentialsDerivedRisk | Map | tool-registrations.ts:325 | same package, keyed by host tool ids | tool ids host input | derived from handler calls |
| SET_USERNAME/SET_TOKEN allowed fields + rejecters | consts/fns | tool-registrations.ts:410-480 | same package | field names are tool schema (neutral) | structural no-token guarantee |

### D. Clock/observability/HTTP/audit/keyring/sealer

| Name | Value/type | Source file:line | Destination | Host vocabulary | @agent-note obligations |
|---|---|---|---|---|---|
| Clock | type | `@jini-ai/core/primitives` | core subpath | none | — |
| HttpClientPort | T legacy positional port / core required-object port | T platform/http; J core/src/primitives/http.ts:62 | named host input (closed over by both binders; adapter at credentialed-request.ts:684 unchanged) | none | guarded client from composition only |
| ObservabilityPort | type | T platform/observability | named host input (closed over by `SourceControlWritePort.build`) | none | — |
| KeyringPort, SecretSealerPort, idGen | types | T webhooks/index (≡ core contracts/vault) | core contracts/vault (credentials.ts:2) / host input; C1 — see C1 inventory | none | key handles only |
| customCredentialsAudit / customCredentialsFailureLog | optional deps | tool-registrations.ts:151/158 | named host inputs | — | test-only overrides |

### E. Surfaces, secret cards, approvals, human confirm

| Name | Value/type | Source file:line | Destination | Host vocabulary | @agent-note obligations |
|---|---|---|---|---|---|
| askThenReport | fn | J daemon/src/surface-exchanges.ts:340 | named host input typed by core `SurfaceAskThenReport` (core surface-exchanges.ts:187) | none | outcome replaces the same URI only after save |
| AssistantSurfaceDeps {surfaceExchanges} | interface | daemon surface-exchanges.ts:412 | core `SurfaceCardSecretDeps` (contracts/cards) / core `SurfaceExchangeStore` | none | SAME store as the answer/callback route |
| SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM | consts | J core/src/surface-exchanges.ts:28 (re-exported by daemon) | core root | neutral protocol params | — |
| defineSecretCardTool | fn | J ui/src/features/mcp-ui/secret-card.ts:238 | named host input via core `SurfaceCardsPort.defineSecretCardTool` (contracts/cards.ts:63) | none | note: typically `mcpUiCards` from `@jini-ai/ui/mcp-ui/cards` |
| SecretCardForm | type | ui secret-card / core contracts/cards.ts:352 | core contracts/cards | none | — |
| buildFormSurface / UIResourceUri | fn/type | ui mcp-ui/surfaces form.ts:398 | `SurfaceCardsPort.buildFormSurface` / core `SurfaceCardUri` | none | — |
| SurfaceOutcomeSpec | type | ui surfaces | core `SurfaceCardOutcome` | none | — |
| approvalToolHandler / HumanConfirmSpec | fn/type | T contracts/core/human-confirm.ts:216/:33 | named host input (approval surface; T builds over core createApprovalHandler + ui confirmation surface) | approval wording T-owned (approval-i18n) | DELETE: one held call; decline sends nothing; decrypt only after approval |
| describeDeleteRequestApproval | fn | delete-request-confirmation-ui.ts:31 | named host input | Tovu wording | — |
| buildCreateForm / buildCreateOutcome | fns | custom-credential-create-ui.ts:70/174 | named host input (credential card builders) | apps `tovu-custom-credential-create` (:128) / `-outcome` (:181) via `cardIdentity.appNames` | outcome after save |
| setTokenForm / setTokenOutcome | fns | custom-credential-set-token-ui.ts:63/100 | named host input | apps `tovu-custom-credential-set-token` (:83) / `-outcome` (:106) via `cardIdentity.appNames` | same URI |
| SECRET_FORM_CARD_DEFINITIONS | const | T contracts/headless/secret-form-cards.ts:9 | host-retained (used only by the host builder) | Tovu card defs | — |
| CreateCredentialPrefill | interface | custom-credential-create-ui.ts:46 | host builder input type (named host input) | answer field names | — |
| copy URI `ui://tovu/use-saved-key/${exchange.id}` | template | credential-copy-tool.ts:95 | `cardIdentity.uriNamespace` (`tovu`) host input; path segment `use-saved-key` host input | "Your app's id; it appears in every card URI and is compared on answers." | URI keyed by exchange id, never a token |

### F. Locale/translation/hints/token-free rules

| Name | Value/type | Source file:line | Destination | Host vocabulary | @agent-note obligations |
|---|---|---|---|---|---|
| resolveOperatorLocale / OperatorLocaleDeps | fn/type | T settings/operator-locale.ts:27 / T contracts/headless/plugin-host.ts:54 | named host input `resolveLocale` | locale T-owned | no default locale in generic code |
| credentialText / formatCredentialHint / translateCredentialMessage / CREDENTIAL_COPY | fns/const | T contracts/core/credential-copy.ts:576/579/590/:4 | named host input (messages) | all copy T-owned | — |
| assertCredentialFreeField | fn | T contracts/core/credential-token.ts:8 (over `@jini-ai/platform`) | named host input | — | token-free metadata rule |
| cleanCardToken / TOKEN_PASTE_AGAIN_MESSAGE | fn/const | custom-credentials/card-token.ts:27/:16 | named host input | Tovu wording | — |
| normalizeCredentialWorksFor | fn | `@jini-ai/platform/secrets/credential-sets` (import :5) | named host input (C1 already injects it) | — | — |
| suggestCredentialWorksFor | fn | platform (create-ui :1) | host builder (stays T) | — | — |

### G. Deploy/publish/abort guard

| Name | Value/type | Source file:line | Destination | Host vocabulary | @agent-note obligations |
|---|---|---|---|---|---|
| abortGuardedCredentialRepo | fn | T vendor-credentials/abort-guarded-repo.ts:9 | named host input `guardRepo({store, signal})` | none | every repo/vault write checks signal |
| invalidatePublishCredentialCompatibility | fn | T deployments/publish-credentials/store.ts:80 | narrow named host port (publish invalidation) | deploy target ids host | runs after save only |
| loadDeployTargets / DeployTargetRegistry / publishCredentialVerificationCache | deps/type | tool-registrations.ts:144/146, T deployments/contracts.ts | narrow named host port (deploy catalog list + cache delete) | deploy vocabulary host | absent → no invalidation, no provider list |
| loadCreateCredentialProviders | fn | tool-registrations.ts:927 | same package over the narrow deploy-catalog port | — | failures swallowed (unchanged) |

### H. Plugin cards / recovery / setup diagnostics

| Name | Value/type | Source file:line | Destination | Host vocabulary | @agent-note obligations |
|---|---|---|---|---|---|
| loadPluginCredentialCardsSafely / findPluginCredentialCard / LoadPluginCredentialCards | fns/type | `@jini-ai/agent-plugins/connect` via T plugin-credential-card.ts:4-5 | named host input `pluginCards.{load,find}` | — | absent loader → none; owned-label/conflict rules preserved |
| readPluginCredentialValues | fn | T plugin-credential-card.ts:6 | named host input `pluginCards.readValues` | — | plaintext fields only |
| PluginCredentialCard | type | J core contracts/credentials.ts:16 (T re-export contracts/core/plugin-credential-card.ts:4) | core contracts/credentials | — | — |
| buildPluginCredentialForm / applyPluginCredentialCard | fns | T contracts/core/plugin-credential-card.ts:6/:9 | named host input `credentialCardForms.{build,apply}` | — | — |
| withCustomCredentialSetup / CredentialSetupFailure | fn/type | custom-credentials/credential-recovery.ts:10/:4 (over `@jini-ai/daemon/tool-recovery`) | named host input (recovery/setup diagnostics) | setup tool id host | — |
| createCredentialSaveTools | fn | `@jini-ai/agent-plugins/connect` (credential-save-tool.ts:1) | host composition (unchanged; not a C3 move) | — | — |
| PluginProviderSettingField (provider-settings-card.ts:4) | type | `@jini-ai/plugins/host` | host-retained (provider-settings card is not in C3 scope) | — | — |

### I. C1 store/errors/types

| Name | Value/type | Source file:line | Destination | Host vocabulary | @agent-note obligations |
|---|---|---|---|---|---|
| createCustomCredential, updateCustomCredential, listCustomCredentials, describeCredential, describeCredentialByLabel, resolveCustomCredentialByLabel | fns | T custom-credentials/store.ts (imports :63-75; now host bindings at store.ts:29-135) | C1 — see C1 inventory: moved to J integrations/src/credentialed-http/sets, bound by T store.ts + tovu-credential-sets.ts | C1 host inputs (tovu-credential-sets.ts) | C1 |
| CustomCredentialDuplicateLabelError / NotFound / SecretStoreUnconfigured / Validation | classes | J integrations credentialed-http/sets (T store.ts:15-16 re-exports the same objects) | same package (C1 move) — see C1 inventory | C1 | C1 |
| CustomCredentialSetRepoPort, CustomCredentialSummary, CustomProviderConnectionInput | types | T custom-credentials/types.ts | C1 — see C1 inventory | C1 | C1 |
| CUSTOM_CREDENTIAL_CATEGORIES | const | T contracts/core/custom-credential-categories.ts:9 | C1 — see C1 inventory (host validation list) | categories host list | C1 |

### J. Credential copy tool

| Name | Value/type | Source file:line | Destination | Host vocabulary | @agent-note obligations |
|---|---|---|---|---|---|
| ProjectKeysPort / ProjectKeyRow | types | T project-keys/service.ts (copy imports :8) | narrow named host port (list / permissionFor / use / site view) | — | offered ids only; use re-resolves revoked/deleted keys |
| owner/instance auth (`admit`) | fn | credential-copy-tool.ts:34-42 | same package over core `requireToolPermission` + core `InstanceAuthorizeFn` (`@jini-ai/core/gated-mutations`) | `system.write` (:26/:34/:38) host input | re-admit after the human answers |
| askThenReport / SURFACE_* params / buildFormSurface | fns/consts | credential-copy-tool.ts:5-7 | as section E | — | — |
| NEW_KEY `:new-key` | const | credential-copy-tool.ts:12 | named host input (answer field vocabulary) | Tovu answer value | — |
| card-token cleanup (set-token / create saves) | fn | tool-registrations.ts:605/835/856 | named host input `cleanCardToken` | — | keystrokes browser→route→exchange→seal only |

### Per-handler consumption (prospective C3)

| Handler (line) | Rows consumed |
|---|---|
| custom_credential_list (:1074) | C requireNoInput/permission(read); I listCustomCredentials; H loadPluginCredentialCardsSafely |
| custom_credential_verify (:1088) | C permission(read); A port.verify; H recovery |
| custom_credential_set_username (:1105) | C allowed-field rejecters, permission(write); I describe/update; D keyring/idGen |
| custom_credential_make_request (:1130-1180) | C permission(write); A port.request/resolveTarget/classifyError; E approvalToolHandler, describeDeleteRequestApproval; H recovery |
| credential_save api set-token (:953-1015) | C permission; E defineSecretCardTool, setTokenForm/Outcome, askThenReport; F locale/messages/cleanCardToken; G abort guard; H pluginCards.find, credentialCardForms.apply; A probeCardBeforeSave |
| credential_save api create (:1020-1040) | E buildCreateForm/Outcome; F worksFor/locale/messages; G abort guard, deploy catalog, publish invalidation; I createCustomCredential |
| credential_save plugin card (:1041-1058) | H pluginCards.load/readValues, credentialCardForms.build; A probeCardBeforeSave |
| custom_credential_write_files (:1185-1225) | B port.build/validateTarget/planFileWrite/commitFiles, validateWriteFilesInput, failure log; I describe/resolve |
| credential_copy_from_project (copy tool) | J ProjectKeysPort, admit, cardIdentity URI, NEW_KEY; E surfaces |

## C2 part 1

Coordinator boundary C1 move→C2 part 1: 2026-11-09T07:52:16Z, elapsed 56m55s; running token total ≈ 0.95M (setup 131k, C0 241k, C1 seam 269k, C1 move 192k, coordinator ≈ 80k, plus C2 builders in progress) of 1.9M cap.

Window: builder started 07:21Z (read-only draft while C1 moved), build phase 07:52Z–08:01Z. Status: fully green.

**Commits**
- Tovu `82d0058c382ad93bf0c034ac0388cc651889541e`: the C2 part 1 inventory above (first commit, before any implementation).
- Jini `a266ba82144d9c7d8078ef7d056ff8c748d607e6`: `CredentialedRequestPort` and `SourceControlWritePort` appended to `packages/core/src/contracts/credentials.ts` (types only), plus changeset `.changeset/extract-s8-c2p1-credential-ports.md` (@jini-ai/core minor).
- Tovu `09317cc0fb552a1aeb94a04f668673d74125501b`: binder `features/custom-credentials/credential-ports.ts`, the test `__tests__/extract-s8-c2p1-credential-ports.test.ts` and the type pin `__tests__/extract-s8-c2p1-ports.type-pin.ts`.

**Port shapes.** Both ports live in `@jini-ai/core/contracts/credentials`. They are self-contained mirrors, with no import from integrations or Tovu. The pin proves they are mutually assignable with the real shapes: `CredentialedRequestResult` ≡ J `CredentialedRequestExecutedResult`, `CredentialVerification` ≡ `CustomCredentialVerificationResult`, `CredentialAuthFailureDiagnostic` ≡ `AuthFailureDiagnostic`, `CredentialProbeInput`/`CredentialProbeStatus` ≡ the J probe types, and `SourceControlFileWritePlan`/`…PlanResult`/`…CommitFilesResult` ≡ the T provider-module types. Tovu's `SourceControlProvider` satisfies `SourceControlFileWriter` directly, so no wrapper is needed and the object stays the same.
- `CredentialedRequestPort { request(required{workspaceId,label,method,url}, optional{headers?,body?}), resolveTarget, verify, probe, classifyError }`. The classifier categories are `validation | transport | egress-refused | not-found | unknown`. `error` is always the thrown object itself. Only `callerSafeMessage` is model-safe (validation / egress / not-found). Egress refusals also carry `callerSafeError`, which reproduces the reconstruction at tool-registrations.ts:229 (same class, address-free message) before decoration. Transport and unknown errors expose no message field.
- `SourceControlWritePort { build, validateTarget, planFileWrite, commitFiles }`. The provider is passed explicitly, so plan and commit go to the same object as built, and `commitFiles` takes the exact plan.
- The @agent-notes are in the Jini source and survive into `.d.ts`. They cover: no decrypt in resolveTarget, run before any dialog or decrypt; DELETE held for a human, a decline sends nothing; no token/header/username in results; untrusted headers/body are validated by the port; probe URL is trusted and host-resolved; egress full message stays in the server audit; logDetail is for the server log only; the build → validate → decrypt → plan → abort-stop → commit order on the SAME provider with the EXACT plan, with no rebuild or re-plan; whole-site export is separate, and no new confirmation. No Tovu vocabulary appears in Jini (grep `tovu` in the file: 0).
- Binder: each method is one call of the existing `makeCredentialedRequest` / `resolveRequestTarget` / `verifyCustomCredential` / `probeCredentialConnection` / `buildSourceControlProviderForApi` / `validateRepositoryTarget` / `provider.planFileWrite` / `provider.commitFiles`, with the same deps. No lower-level J call and no behavior change. Handlers are NOT rewired; that is part 2.

**New tests (7, all real bindings; only the network and the git-host provider calls are faked).**
- Egress identity, safe form, and the address kept in the audit.
- validation / not-found / transport / unknown identity and safe fields, including the host "Access Tokens" suffix through the port.
- headers/body/`timeoutMs` 10 000 pass-through equal to the direct adapter call; the 1 MB body bound refuses before sending.
- verify tri-state with authDiagnostic; probe ok/refused/unavailable as a bodyless GET.
- resolveTarget makes 0 sealer opens and 0 sends; the request makes 1 open.
- Write port: 1 registry load; target rules run before planning; plan and commit are called with `this` === the built provider; commit receives the plan object itself; planning alone never commits.
- No-provider build result.

Mutation proof (the binder was mutated, then restored and checked byte-equal): copying the plan before commit → 1 fail; returning the raw egress error as `callerSafeError` → 1 fail; decrypting before target resolution → 1 fail.

Repair: one input error in my own test before its first commit (a request body passed as an object; the adapter requires a string). I fixed the input; no assertion was softened. Abort→no-commit is pinned at the port by "planning alone never commits". The handler-level abort stop stays covered by the existing write-files-confirmation test. The port has no signal of its own, by design, so behavior is unchanged.

**Gate (all at the tips above)**
| check | exit | counts |
|---|---|---|
| J core build + `tsc --noEmit` | 0 | — (credentials.js stays an empty module) |
| J integrations `tsc --noEmit` (consumer; core change is types-only, so no runtime rebuild needed) | 0 | — |
| J eslint core/src/contracts/credentials.ts | 0 | 0 problems |
| J integrations vitest (C2 J matrix, 7 files) | 0 | 212/212 |
| J scripts vitest (3 files) | 0 | 70/70 |
| J C1 new: sets extract-s8-sets.unit / neutral-host credential-sets / neutral-host tsc | 0/0/0 | 5/5, 1/1 |
| `check:cross-package` (XP3 snapshot dir) | 0 | XP1–XP5 clean |
| guard | 1 | the same 2 baseline violations (R2-deep-path plugin-catalog, R10-chatpane); HW1/2/3/4/8 17/16/135/1/49 with 0 new; HW5/6/7/9 0; R13 informational; no N1/R8 |
| guard:plugins / layers / isolation / SI audit | 0/0/0/0 | SI c=9 d=7 |
| T relink (`link:jini`) / contracts build / main `tsc -p tsconfig.json` | 0/0/0 | — |
| T eslint (3 new files) | 0 | 0 problems |
| T explicit compile: C2p1 pin + test / C1 pins / C0 test | 0/0/0 | — |
| T tests: C0 + C1 matrix + C1 new + C2 matrix + accumulated nine + inherited S3 three + C2p1 new (52 unique files) | every file 0 | 780/780, 0 fail |
| fixture hashes (5 fixtures + 3 inherited pins) | match | all 8 equal the baseline |

Existing tests and fixtures: none modified (diff since the pin under `__tests__` is additions only). Shared-lane files: none touched (no S4/S5/S6-owned file; `core/src/contracts/credentials.ts` and the new changeset are S8 integration files). Cross-package: core imports nothing new; the binder imports only Tovu modules and `@jini-ai/core/contracts/credentials`. Processes: the one background test runner exited 0; nothing is left running.

## C2 part 2 — inventory/plan

Recorded before any C2 part 2 implementation edit (R5.6). Row names refer to "C2 part 1 — inventory"
above (sections A–J). Seams are made IN PLACE in Tovu: no tool, source-control, deployment, project,
HTTP or policy code moves; old entries keep their signatures and bind Tovu's values. Jini is not
edited in this part (every type the seams need already exists in `@jini-ai/core` root,
`core/gated-mutations` and `core/contracts/cards`; the two new contracts are consumer-local because
both consumers would land in the same package at C3).

New Tovu files (T = `apps/website/src/`):
- `features/custom-credentials/credential-tool-host.ts` — types only (imports only `@jini-ai/core` types):
  `CredentialCardIdentity {uriNamespace, appNames}`, `CustomCredentialToolVocabulary`,
  `CustomCredentialToolHost`, `CredentialCopyProjectKeysPort` (narrow list/permissionFor/use/savedResult/site),
  `CredentialCopyMessages`, `CredentialCopyToolHost`. Every field required; @agent-notes carry the
  second-host rules (namespace compared on answers, permission-before-resolve, re-admit after answer,
  use re-resolves, same SurfaceExchangeStore).
- `features/custom-credentials/tovu-credential-card-identity.ts` — Tovu binds namespace `tovu` and the
  exact apps `tovu-custom-credential-{create,create-outcome,set-token,set-token-outcome}` version `1`.

| Inventory row (section) | Seamed now | How | Remains for C3 |
|---|---|---|---|
| owner/instance auth `admit` (J) | yes | new `createCredentialCopyRegistrations({deps,surfaces,host},{saveNew})`; owner permission `host.vocabulary.ownerPermission`; core-root `requireToolPermission`/`adaptLegacyAuthorize`/`LegacyToolAuthorizeFn` (no cms) | — |
| ProjectKeysPort/ProjectKeyRow (J) | yes | narrow local `CredentialCopyProjectKeysPort`; T `ProjectKeysPort` passes structurally | — |
| copy URI `ui://tovu/use-saved-key/${id}` (E/J) | yes | `ui://${cardIdentity.uriNamespace}/${vocabulary.cardPath}/${exchange.id}` | — |
| NEW_KEY `:new-key` (J) | yes | `vocabulary.newKeyValue` | — |
| copy catalog / tool id / domain / catalogModule / metadata / derived risk (J, C) | yes | host inputs; old exports `catalog`, `CREDENTIAL_COPY_TOOL_ID`, `credentialCopyDerivedRisk` unchanged objects | — |
| copy card + error sentences (J) | yes | `host.messages` (16 fields, verbatim T text) | — |
| askThenReport / buildFormSurface for copy (E) | yes | `host.protocol` typed by core `SurfaceAskThenReport` / `SurfaceCardFormSpec`; T binds daemon/ui functions | — |
| DOMAIN / READ_PERMISSION / WRITE_PERMISSION / catalogModule / toolMetadata / catalog (C) | yes | new `createCustomCredentialsRegistrations` + `createApiCredentialSaveHandlers` take `host.vocabulary`; T consts and why-comments stay in place, bound by old entries | — |
| secret-card `uriHost: 'tovu'` ×2 (E) | yes | `host.cardIdentity.uriNamespace` | — |
| create/set-token app names (E: buildCreateForm/Outcome, setTokenForm/Outcome) | yes | `cardIdentity.appNames.*` stamped on the host builder output (T values identical bytes) | builders themselves stay host builders |
| requireToolPermission/adaptLegacyAuthorize via `@jini-ai/cms/core` (C) | yes | imported from `@jini-ai/core` (same objects; cms re-exports them) | — |
| tool ids MAKE_CREDENTIALED_REQUEST / CREDENTIAL_SAVE / WRITE_FILES, handler keys, derived-risk map (C) | no | — | host inputs at C3 |
| CUSTOM_CREDENTIALS_MODEL_FACING_ERRORS, FORM_SAVE_* messages, set-token/create fixed texts (C, E) | no | — | `messages` host input at C3 |
| resolveOperatorLocale / credentialText / formatCredentialHint / translateCredentialMessage (F) | no | — | locale/translation port at C3 |
| defineSecretCardTool / askThenReport in tool-registrations, approvalToolHandler, describeDeleteRequestApproval (E) | no | — | `SurfaceCardsPort` + approval host input at C3 |
| CredentialedRequestPort / SourceControlWritePort wiring into handlers (A, B) | no | part 1 binders exist (`credential-ports.ts`) | handler consumption at C3 |
| deploy catalog / publish invalidation / cache delete (G), abortGuardedCredentialRepo (G) | no | — | narrow ports at C3 |
| pluginCards {load,find,readValues}, credentialCardForms {build,apply}, recovery (H) | no | — | host inputs at C3 |
| cleanCardToken, assertCredentialFreeField, normalizeCredentialWorksFor (F, J) | no | — | host inputs at C3 |
| C1 store/errors/types (I) | n/a | C1 (done) | — |

Not touched: `server/runtime/composition/tool-catalog-manifest.ts` (old entries keep their call
shapes; connect tokenDeps :595 untouched), H/A/L areas, any test or fixture.
New tests (named before edits): `features/custom-credentials/__tests__/extract-s8-c2p2-host-inputs.test.ts`
— second host with different permissions/entity/domain/catalogModule/tool id/namespace/apps/path/
messages/answer value; T old-entry byte pins (sha256 of emitted copy and create cards and the
registration descriptors, recorded on the unmodified code before the seam edits).

## C2 part 2

Coordinator boundary C2 part 1→C2 part 2: 2026-11-09T08:00:57Z, elapsed 65m36s; running token total ≈ 1.17M (setup 131k, C0 241k, C1 seam 269k, C1 move 192k, C2 part 1 252k, coordinator ≈ 85k, plus C2 part 2 in progress) of 1.9M cap.

Status: GREEN. Started 07:53Z (read-only drafting), implementation after the part 1 marker at 08:00Z, gate complete ≈08:13Z.

Commits (Tovu `cloud/extract-s8`; Jini has NO C2 part 2 commit — Jini stays at `a266ba82144d9c7d8078ef7d056ff8c748d607e6`):
- `3aa67be712d3093a8f773b9a8c0ab3178d1d73f2` docs: C2 part 2 inventory/plan (first commit, before implementation)
- `f71c8de6f2f3055068acf136918ac914c16dddda` refactor: host inputs for the credential tools (seams + new tests)
- `463f56a8f0fdcc8703badaf5c6fd0fbafd2bf2de` test: type the recorded authorize calls (explicit pin compile fix)
- this report commit (SHA in the push record below)

Files (all T = `apps/website/src/features/custom-credentials/`; none owned by S4/S5/S6 lanes; `server/runtime/composition/tool-catalog-manifest.ts`, connect tokenDeps :595, H/A/L areas untouched):
- NEW `credential-tool-host.ts` (114 lines, types only, imports only `@jini-ai/core` and `@jini-ai/core/contracts/cards` types).
- NEW `tovu-credential-card-identity.ts` (18): namespace `tovu`, apps `tovu-custom-credential-{create,create-outcome,set-token,set-token-outcome}` v`1`.
- `credential-copy-tool.ts` (+151/−?): new `createCredentialCopyRegistrations({deps,surfaces,host},{saveNew})`; generic part imports only core (root, `gated-mutations`, `contracts/cards`) and the local types file; permission helpers now from `@jini-ai/core` root (same objects `@jini-ai/cms/core` re-exports); `ProjectKeyRow` import dropped (narrow port). Tovu values (`TOVU_CREDENTIAL_COPY_HOST`: tool id, domain `credential-copy`, catalog path, `system.write`, `:new-key`, `use-saved-key`, 16 sentences verbatim, daemon `askThenReport` + ui `buildFormSurface`) sit beside the old entry, which keeps its signature. Exports `catalog`, `CREDENTIAL_COPY_TOOL_ID`, `credentialCopyDerivedRisk`, `CredentialCopyToolDeps` unchanged.
- `tool-registrations.ts` (hunks at old lines 18, 78, 175, 224-225, 871/874/905/907-908/913 openCreateCard, 943-946 doc+signature, 959/985/997/999-1000/1004/1030/1034-1035/1045/1049 API save handlers, 1061 new registrations entry, 1077/1091/1109/1142/1145/1173/1176/1185/1189 handlers, 1229-1232 buildDomainRegistrations, 1237 old entry): new `createCustomCredentialsRegistrations` / `createApiCredentialSaveHandlers` take `host: CustomCredentialToolHost`; `DOMAIN`/`READ_PERMISSION`/`WRITE_PERMISSION`/`CATALOG_BY_ID` and their why-comments stay in place and are bound once in `TOVU_CUSTOM_CREDENTIAL_HOST`; both `uriHost: 'tovu'` → `cardIdentity.uriNamespace`; host builder outputs get `cardIdentity.appNames.*` stamped via `withCardApp` (same key position → identical bytes for Tovu); `makeModelFacingCredentialedRequest` takes `{catalog}`. Old `buildCustomCredentialsRegistrations(routeDeps, surfaces)` and `buildApiCredentialSaveHandlers({routeDeps,surfaces})` are one-line bindings.
- NEW tests `__tests__/extract-s8-c2p2-host-inputs.test.ts` (10 tests) + `__tests__/extract-s8-c2p2-pins.support.ts`.

Repairs (own errors): capture helper delivered before the emit returned (hang) → deliver after emit via setImmediate with the fixed exchange id; two first-draft expectations were wrong about existing behaviour (permissionFor is evaluated before the post-answer re-admit, so the log is `list, permissionFor` with no `use`; an unknown request label is reported through the model-facing error path rather than a throw) → expectations corrected to the real unchanged behaviour; explicit pin compile found `AuthorizationRequired` not assignable to `Record<string,unknown>` → spread copy. Two sonarjs nested-increment warnings fixed. No production behaviour changed by any repair.

Old-entry byte pins: sha256 of JSON of the emitted saved-key card, the emitted create card, and both descriptor lists, RECORDED on the unmodified tree (Tovu `3aa67be7`, deterministic over two runs) before the seam commit, then asserted after it: copyCard `cdf8d669…ecead`, createCard `63acf4f1…51a75`, credentialDescriptors `657345d5…df6cb`, copyDescriptors `b2a05ee1…6eea` — all equal.
Second host ("acme") proves use of: tool id, domain + catalog path (drift error names `acme-keys`/`acme/keys/tools.ts` and `acme-creds`/`acme/creds/tools.ts`), owner permission `acme.owner` then key permission after the answer, read/write permissions `acme.creds.see`/`acme.creds.change` with entity `acme-entity`, URI `ui://acme/pick-key/<id>` and `ui://acme/secret-card/credential_save/<id>`, app `acme-key-create` v`7`, answer value `~fresh` (Tovu's `:new-key` is refused as not offered), all card/refusal sentences; grant revoke/recheck (permission lost while open → no `use`; revoked key → `use` refuses, no grant; dismissal → `{granted:false}`).

Gate (T run from Tovu root; Node 24.2.0; raw outputs kept in the session scratch area):
| check | result |
|---|---|
| T `npx tsc -p tsconfig.json --noEmit` | exit 0 (before and after the test fix) |
| explicit pin compile (tsconfig.tests.json, files = all 8 new S8 T test/pin files incl. C0/C1/C2p1) | exit 0 |
| eslint `--max-warnings 0` on the 6 changed/new T files | exit 0 |
| T matrix: C1 + C2 matrices + accumulated nine + inherited S3 three + all new S8 tests (g-cred, c1-old-shape, c1-second-host, c1-source-scan, c2p1-credential-ports, c2p2-host-inputs) | 53 files, every file exit 0, 790/790 pass, 0 fail (part 1: 52/780; +1 file/+10 tests) |
| J core tsc / integrations tsc | exit 0 / exit 0 (no J build: Jini unchanged since part 1's build) |
| J integrations vitest (C2 matrix 6 + package-surface + extract-s8-sets) | 8 files, 217/217 |
| J neutral-host credential-sets test / typecheck | 1/1 / exit 0 |
| J scripts tests (check-no-cross-package, extract-s3-checker, extract-s3-source-contracts) with XP3 snapshot | 3 files, 70/70 |
| `pnpm check:cross-package` (JINI_DECLARATION_BASELINE_DIR = original 35c4961a snapshot) | exit 0, XP1–XP5 clean |
| `pnpm guard` | raw exit 1 = baseline: only R2-deep-path(1) plugin-catalog/scripts/generate.ts and R10-chatpane-public-surface(1) ChatPane.tsx; R13 informational; HW1 17/HW2 16/HW3 135/HW4 1/HW5 0/HW6 0/HW7 0/HW8 49/HW9 0, 0 new each; no N1/R8/other family |
| guard:plugins / layers / isolation | exit 0 / 0 / 0; SI audit c=9 d=7 |
| fixture hashes (tool-metadata.baseline, moved-tools ×3 goldens, cost-counters.baseline) + inherited S3 pins ×3 | all 8 unchanged |
| old T/J tests/fixtures M/D/R since session start | none |

XP: no Jini change in this part, so no new/modified J specifiers, declarations or dependencies. Advance caller search: the new inputs are behind new T functions; the old T entries keep their signatures, so no J caller (none exists) and no T caller needs edits. Shared-lane files touched: none. No process left running (both background runners exited 0).
Remaining for C3 (not seamed here): see the "Remains for C3" column of the plan above — tool ids/handler keys, model-facing error rules and form messages, locale/translation, `defineSecretCardTool`/`askThenReport`/approval injection in tool-registrations, part 1 port consumption in handlers, deploy/publish/cache ports, abort guard, pluginCards/credentialCardForms/recovery, cleanCardToken/assertCredentialFreeField/worksFor.

## F8

Final accumulated gate, run 08:12Z–08:20Z against the final source pair: **Tovu 463f56a8f0fdcc8703badaf5c6fd0fbafd2bf2de (source; tip 3862f79b is report-only) / Jini a266ba82144d9c7d8078ef7d056ff8c748d607e6**. Every result below comes from this run. No earlier green result was reused. Toolchain node 24.2.0 / npm 11.3.0 / pnpm 10.33.2.

### 1. Start-to-tip diffs (git only)

`git diff --name-status <start pin> <tip>`:
- Tovu c3801c83..463f56a8: 25 paths. Every one is an addition except these five modified production files: `features/custom-credentials/{credential-copy-tool,store,tool-registrations,types,vault-repo}.ts`, plus the report. No pre-session test or fixture shows M, D or R: each non-A path was checked against `git cat-file -e <pin>:<path>`, and no `__tests__`/fixture path is among them. No migration, package.json, lockfile, guard, checker, layer or debt path changed.
- Jini 4044fe3c..a266ba82: 11 paths. Additions: three changesets, `examples/neutral-host/src/credential-sets.test.ts`, `packages/integrations/src/credentialed-http/sets/{host,index,store,vault-repo}.ts`, and `sets/__tests__/extract-s8-sets.unit.test.ts`. Modified: `packages/core/src/contracts/credentials.ts`, which only adds types (+318 lines; the only new import is `import type … from "./vault.js"`), and `packages/integrations/package.json`. The package.json diff touches only the `./credentialed-http/sets` export, the runtime map and the typesVersions entries. `dependencies`, `peerDependencies` and `optionalDependencies` are unchanged. No guard, checker, layer, debt or server change, and no pre-session J test changed.
- New session tests and fixtures, with the commits that touched each one:
  - T `extract-s8-g-cred.integration.test.ts`: 3e3eaa1d, then 2730484e (typing/lint)
  - the four `fixtures/extract-s8/*.json` files: recorded at 3e3eaa1d and never touched again
  - `extract-s8-c1-old-shape.types.test.ts`: af4c1cdd
  - `extract-s8-c1-second-host.test.ts`: af4c1cdd, then 1a8e1bd4 (lint)
  - `extract-s8-c1-source-scan.test.ts`: af4c1cdd, 98212b56, and afa3b2c3. The afa3b2c3 change is the coordinator-approved retarget recorded under C1 move. It is a session-new test, not an old one.
  - `extract-s8-c2p1-credential-ports.test.ts` and `extract-s8-c2p1-ports.type-pin.ts`: 09317cc0
  - `extract-s8-c2p2-host-inputs.test.ts` and `extract-s8-c2p2-pins.support.ts`: f71c8de6, then 463f56a8
  - J `extract-s8-sets.unit.test.ts` and neutral-host `credential-sets.test.ts`: b86e8a76

### 2. Hashes

Base fixtures and inherited pins are compared with the start pin. New C0 fixtures are compared with their recording commit, 3e3eaa1d. Each hash below was computed at the reference commit and is byte-equal to the tip and to the working tree. Nothing was reminted.

| T-relative file | reference | sha256 (reference = tip) | result |
|---|---|---|---|
| assistant/__tests__/fixtures/tool-metadata.baseline.json | c3801c83 | a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6 | MATCH |
| assistant/__tests__/fixtures/moved-tools.golden.json | c3801c83 | 3583bc14fa8c596d64a2e97a274166f87a0ea278aed3f8c12b926552b7fc5f66 | MATCH |
| assistant/__tests__/fixtures/moved-tools.access-token.golden.json | c3801c83 | 61e018a56d59eee3a4b44055136c9a7c6144c5a6b13a948c8f90ebb8b14ca16e | MATCH |
| assistant/__tests__/fixtures/moved-tools.credential-cards.golden.json | c3801c83 | 3eb3766de97c9d6699507fbda53b29ec63babd0af1d6381611ee907da4a2fa01 | MATCH |
| server/runtime/composition/__tests__/fixtures/cost-counters.baseline.json | c3801c83 | 2be1488c8e4556b71b759536dccac88c78612a22200aa6843748f62cb78e736c | MATCH |
| features/api-connections/__tests__/plugin-state-format.pin.unit.test.ts | c3801c83 | 57a312280c8e890a00683ab3ce7419bc245e9aebe82821c18a6715698f96e902 | MATCH |
| server/runtime/composition/__tests__/api-connection-state-vault.identity.test.ts | c3801c83 | 63af6d71b754bb755035f8777570cc340834c783d7a28477467000169b879d80 | MATCH |
| features/agent-plugins/__tests__/unit/connect-tool.api-connections.unit.test.ts | c3801c83 | f31899fa0d573d28ae1540ec12ddb45f91efcb89a83ee0798adcbbca085fb88e | MATCH |
| features/custom-credentials/__tests__/fixtures/extract-s8/expected-open.json | 3e3eaa1d | d39fd19a727e6a53fe056d78d94acc1ca7901695e01f167eb978291485ee74fe | MATCH |
| features/custom-credentials/__tests__/fixtures/extract-s8/expected-summaries.json | 3e3eaa1d | 49ed30a958a5ea747142efe621ccb9d8a38abf71aa660832541e6672cabcd5fc | MATCH |
| features/custom-credentials/__tests__/fixtures/extract-s8/stored-rows.json | 3e3eaa1d | 45f7a3839cb1bdb9cfef586c4bc63994e8f8111f1fdb247f7bf3c3faccaf60a2 | MATCH |
| features/custom-credentials/__tests__/fixtures/extract-s8/synthetic-key.json | 3e3eaa1d | 83e9ca08c77be7c3329d09ad598dea5ad23104322aeedbc39ed8e715b0343e5a | MATCH |

The metadata baseline equals the start hash. The golden tests passed against these unchanged fixtures (moved-tools golden ×3, the tool-registrations contracts 36/36, mail-send golden, cost-counters baseline 4/4). Tool schemas, text, approvals and cards are therefore byte-equal to the start. No migration file is in either diff.

### 3. Jini gates (cwd Jini; commands as in the setup ledger)

| step | command | exit | result |
|---|---|---|---|
| core build | `pnpm --filter @jini-ai/core run build` | 0 | |
| core tsc | `pnpm --filter @jini-ai/core exec tsc --noEmit` | 0 | |
| integrations build | `pnpm --filter @jini-ai/integrations run build` | 0 | |
| integrations tsc | `pnpm --filter @jini-ai/integrations exec tsc --noEmit` | 0 | |
| integrations vitest | credentialed-http auth-failure-diagnostic 17, credentialed-request 99, credential-probe 49, auth-schemes 23, response-redaction 17, ports.contract 6; package-surface 1; sets extract-s8-sets 5 (`--maxWorkers=2 --minWorkers=1`) | 0 | 8 files / 217 pass |
| neutral host | `pnpm --filter @jini-example/neutral-host exec vitest run src/credential-sets.test.ts` ; `run typecheck` | 0 / 0 | 1/1 |
| scripts | `vitest run scripts/__tests__/{check-no-cross-package,extract-s3-checker,extract-s3-source-contracts}.test.ts` (with baseline dir) | 0 | 3 files / 70 pass |
| XP | `JINI_DECLARATION_BASELINE_DIR=<original snapshot> pnpm check:cross-package` | 0 | "XP1–XP5 clean" |
| guard | `pnpm guard` | 1 | exactly 2 = baseline (below) |
| guard:plugins | `pnpm guard:plugins` | 0 | clean |
| layers | `node --import tsx scripts/check-package-layers.ts` | 0 | no failures |
| isolation | `node --import tsx scripts/check-subpath-isolation.ts` | 0 | no failures; SI audit c=9 d=7 |
| eslint | `pnpm exec eslint <every A/M .ts since pin>` | 0 | 0 problems |

The original declaration snapshot was checked before use and is unchanged: manifest.json sha256 d836eba0…d459, aggregate d.ts hash 48f6d422…2d24 (both equal the setup record).

Guard families (complete output read; 25 lines): R2-deep-path 1 (`packages/plugin-catalog/scripts/generate.ts` → agent-plugins src, pre-existing), R10-chatpane-public-surface 1 (`ChatPane.tsx` Icon, pre-existing). HW1/2/3/4/5/6/7/8/9 = 17/16/135/1/0/0/0/49/0, 0 new each. R13 informational only, as at baseline. No N1, R8 or other family. This is identical to baseline.

Emitted output inspection:
- `core/dist/contracts/credentials.js` is exactly `export {};` (XP4: types only). `credentials.d.ts` carries 18 `@agent-note`s.
- The `integrations/dist/credentialed-http/sets/*.d.ts` files carry their notes: host 6, index 1, store 6, vault-repo 3. The source store.ts has 7. The extra source note sits on a non-exported internal and is not part of the public declarations.
- Every import in the sets d.ts/js is either `@jini-ai/core/{primitives,contracts/credentials,contracts/vault}` (type-only) or a same-package relative import. No other Jini package is imported, and core imports no Jini package.

Manual vocabulary review of all moved and added J code:
- No `tovu`, `ui://`, custom-credentials, Shared Keys/Access Tokens, P25_*, site-chat or example.com strings.
- Owner key, categories, token policy, wording, scopes and errors are host inputs. The neutral host proves this with its own owner `library-host` and categories `books|tools`.
- The `saveKind`/`category` strings already in core are pre-session text.

### 4. Tovu gates (cwd Tovu root)

| step | command | exit |
|---|---|---|
| relink | `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` | 0 (0 links changed; already linked) |
| contracts | `npm --prefix packages/contracts run build` | 0 |
| main tsc | `npx tsc -p tsconfig.json --noEmit` | 0 (25 s) |
| explicit pins | `npx tsc -p <tsconfig extending tsconfig.tests.json, files = …>` for C0 (g-cred), C1 (old-shape/second-host/source-scan), C2p1 (credential-ports + ports.type-pin), C2p2 (host-inputs + pins.support), and one all-pins config covering all 8 new files | 0 ×5 |
| eslint | `npx eslint --max-warnings 0 <20 A/M .ts since pin>` | 0 |
| biome (repo `lint`) | `npx biome lint <same 20>` | 0 errors |

The biome run reports 55 warnings, all pre-existing in style or in new tests. They are mostly `noNonNullAssertion` in the new tests. The modified production files have no new warnings: tool-registrations.ts 2 at pin and 2 now, vault-repo.ts 5 at pin and 1 now. There are no suppressions.

Tests were run one file at a time:
```sh
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx \
  --import ./development/test-support/composed-bundle-env.ts \
  --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/<file>
```
The run covered 53 files: the C1 matrix, the C2 matrix, the accumulated nine, the three inherited S3 tests and all six new session test files. **Every file exited 0. 790 tests, 790 pass, 0 fail.** The C2 part 1 total was 780; the extra 10 are the new C2 part 2 host-input test.

| file (T-relative) | exit | tests | pass | fail |
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
| features/custom-credentials/__tests__/extract-s8-c1-old-shape.types.test.ts | 0 | 1 | 1 | 0 |
| features/custom-credentials/__tests__/extract-s8-c1-second-host.test.ts | 0 | 8 | 8 | 0 |
| features/custom-credentials/__tests__/extract-s8-c1-source-scan.test.ts | 0 | 6 | 6 | 0 |
| features/custom-credentials/__tests__/extract-s8-c2p1-credential-ports.test.ts | 0 | 7 | 7 | 0 |
| features/custom-credentials/__tests__/extract-s8-c2p2-host-inputs.test.ts | 0 | 10 | 10 | 0 |
| features/custom-credentials/__tests__/extract-s8-g-cred.integration.test.ts | 0 | 11 | 11 | 0 |
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

### 5. C0 new→old replay (against final code)

1. `EXTRACT_S8_G_CRED_REPLAY_DIR=<dir>` was set on the unchanged C0 test at the final code: 11/11 pass, exit 0. The run dumped the rows the moved code wrote.
2. The pinned old reader re-read those rows from a detached Tovu worktree at 3f19a8bd (C0 code, before any move). It used the same synthetic key and the same SQL facade: **3/3 rows accepted, exit 0.**

New-format rows written by moved code stay readable by the pre-move reader.

### 6. Shared-lane check method

`git fetch origin cloud/extract-s4 cloud/extract-s5 cloud/extract-s6` was run in both repos. Each lane descends from the S8 start pins: merge-base = pin. For each lane, `git diff --name-only <pin> origin/cloud/extract-sN` was intersected with S8's pin..tip name list. Results are in "Shared-lane files" below.

Lane tips: Tovu s4 e74957c8, s5 01928354, s6 f0ae77a5; Jini s4 92b4eb7d, s5 183915bb, s6 7fd1ab74.

## Shared-lane files

The intersections below were checked against actual diffs (method above). This list supersedes the "Shared-lane files: none" lines in the C1 move and C2 part 1 sections: those lines were about Tovu only, and the Jini overlap below was not listed there.

| repo | file | other lane | S8 reason and hunk | other lane's hunk | conflict |
|---|---|---|---|---|---|
| Jini | `packages/integrations/package.json` | S5 (cloud/extract-s5, H0–H3) | C1 move public entry. It adds `"./credentialed-http/sets": "node"` to the `jini` runtime map after `./credentialed-http`. It also adds an `exports["./credentialed-http/sets"]` block (types/import/default → `dist/credentialed-http/sets/index.*`) and a `typesVersions` `credentialed-http/sets` entry. | Adds `./api-connections/hosted-mcp` to the runtime map after `./api-connections`, plus its `exports` block. | Different keys, so the hunks are disjoint. Their context lines are near each other (runtime map at lines 16–21), so a later merge may need a trivial textual resolve. There is no semantic overlap and no dependency field is touched. |

- Tovu: **none.** S8 touched 25 paths and none intersects the S4 (233), S5 (26) or S6 (20) path lists. The S8 changes to `tool-registrations.ts` and `credential-copy-tool.ts` are not in any lane diff. S8 did not touch `server/runtime/composition/deps.ts` (S4), `tool-catalog-manifest.ts`, `features/external-mcp/**` (S5) or `features/plugin-runtime/**` (S6).
- Jini: the S4 and S6 lanes have no intersection. The only S5 intersection is the row above.

## Processes

| owner | recorded PIDs / runners | state |
|---|---|---|
| Setup | 1045, 1046, 3681, 3682, 5014 | all exited |
| C0 | single test loop | exited 0 |
| C1 seam | full rerun PID 22384 | exited |
| C1 move, C2 part 1, C2 part 2 | per-file loops and Jini gate scripts, foreground or awaited | all exited |
| F8 | gate chain PID 18363 (Jini gate, then Tovu gate); replay and old reader in the foreground | chain exited (JDONE-0 / TDONE-0) |

After F8, `ps` shows no node, vitest, tsc, npm or pnpm process. **Nothing is left running.** These scratch worktrees remain on disk and run nothing: the original Jini checkout at 35c4961a and the Tovu C0 worktree at 3f19a8bd.

## Final status

- **Tips:** Tovu cloud/extract-s8 = the commit that adds this F8 section (report-only; see the verified ls-remote below). Before that it was 3862f79bf4e61fe4d790a550805acb2fc715f33d. Jini cloud/extract-s8 = a266ba82144d9c7d8078ef7d056ff8c748d607e6, unchanged since C2 part 1.
- **Last verified GREEN source pair (F8):**
  - Tovu source 463f56a8f0fdcc8703badaf5c6fd0fbafd2bf2de. The report-only commits after it are 3862f79b and this F8 commit.
  - Jini a266ba82144d9c7d8078ef7d056ff8c748d607e6.
- **Batches:**
  - C0: complete and green (Tovu 3e3eaa1d, 2730484e, report 3f19a8bd).
  - C1 seam: complete and green (Tovu af4c1cdd, 1a8e1bd4, 98212b56, report 43a0e5d4; Jini 23c19e2a, 41ff2ffe).
  - C1 move: complete and green (Tovu 610441e9 inventory, cc12641d, afa3b2c3; Jini 63e11c5d, b86e8a76).
  - C2 part 1: complete and green (Tovu 82d0058c inventory, 09317cc0, report 0dbf0072; Jini a266ba82).
  - **C2 part 2: PARTIAL.** It is a green subset: Tovu 3aa67be7 plan, f71c8de6 seams and tests, 463f56a8 test fix, 3862f79b report; Jini unchanged.
  - **F8: GREEN** on the pushed work. Diffs are clean, 12/12 hashes match, all Jini builds/tsc/tests (217+1+70) pass, XP is clean, guard equals baseline, plugins/layers/isolation exit 0, Tovu tsc and 5 pin compiles exit 0, lint passes, the Tovu tests pass 790/790 across 53 files, and the new→old replay accepted 3/3 rows.
- **Recovery branches:** `git ls-remote origin 'refs/heads/cloud/extract-s8*'` lists only `refs/heads/cloud/extract-s8` in both repos. There are no fallback or recovery branches.
- **Remaining work (numbered):**
  1. The C2 part 2 remainder. Rows still to seam:
     1. pluginCards {load, find, readValues};
     2. credentialCardForms build/apply, plus the recovery and setup diagnostics;
     3. injecting defineSecretCardTool, askThenReport, approvalToolHandler and human-confirm into tool-registrations;
     4. making the handlers consume the part 1 CredentialedRequestPort and SourceControlWritePort;
     5. the deployment catalog, publish and cache-invalidation ports;
     6. the locale and translation ports;
     7. abortGuardedCredentialRepo;
     8. cleanCardToken, assertCredentialFreeField and worksFor;
     9. the model-facing error rules and form messages;
     10. tool ids and handler keys as host inputs.
  2. C3 tools move.
  3. G-deploy.
  4. C4.
  5. Packed-consumer/desktop checks (out of scope for this session).
- **Stale-path corrections:** none. Every cited matrix path existed at the pin, and the C0, C1 and C2p1 line-range checks found no stale path. One inventory correction is recorded under C1 seam: the zero-argument `activeKey` keyring shape. One doc-note correction is recorded under C1 move: the core `CredentialSetKeyringPort` note.
- **Limits:**
  - The C0 old-data replay is SQLite only. Postgres/PGlite paths are not covered by C0; they stay with the existing dialect suite `platform/db/repos/__tests__/custom-credential-repo.test.ts`.
  - Abort with no commit is pinned at handler level only, by an existing test (not re-derived in F8). No new abort-guard seam exists yet (remaining item 1.7).
  - The S3 prior reds stay excluded and are not counted green: T plugin-host-bundled-identity, J sign-in-card jsdom, and T test-tsconfig.
  - Biome warnings are as listed in F8 §4: pre-existing or style-only, with no suppressions.
- **Old-input allowance: NONE**, confirmed. No pre-session test or fixture in either repo was modified, deleted or renamed, as F8 §1 shows.
- Coordinator boundary C2 part 2→F8: 2026-11-09T08:13:06Z, elapsed 77m45s; running token total ≈ 1.41M + F8 of 1.9M cap.
- F8 boundary: 2026-11-09T08:20:35Z, elapsed 85m14s (F8 ≈ 70k tokens).

- Coordinator final tally: 2026-11-09T08:22:17Z, elapsed 86m56s of 150m. Actual subagent tokens: setup 131k, C0 241k, C1 seam 269k, C1 move 192k, C2 part 1 252k, C2 part 2 241k, F8 142k = 1.468M; coordinator ≈ 0.105M; job total ≈ 1.57M of the 1.9M cap. Subagents: 7 (6 build + F8), no follow-up builder. Batch-time note: C1 seam, C1 move and C2 part 1 each finished inside their windows; no batch ran over 1.4× its estimate.

## Continuation (EXTRACT-S8-C)

### C2 part 2 remainder

Continuation start 2026-11-09T08:38:25Z, deadline 09:38:25Z, extra cap 450k tokens / 1h

Builder window 08:39Z–09:10Z. Rows are the "Remains for C3" rows of the "C2 part 2 — inventory/plan"
table above (that table is this batch's inventory; no new inventory rows were needed). Seams IN PLACE
in Tovu only: no tool, provider, HTTP or policy code moved; old entries (`buildCustomCredentialsRegistrations`,
`buildApiCredentialSaveHandlers`, `contributeCustomCredentialsTools`) and the part-2 entries
(`createCustomCredentialsRegistrations`, `createApiCredentialSaveHandlers`) keep their signatures and
bind Tovu's values. Jini untouched (stays `a266ba82144d9c7d8078ef7d056ff8c748d607e6`, clean, remote equal).

| Row (priority) | Status | How |
|---|---|---|
| 1. handlers consume `CredentialedRequestPort` / `SourceControlWritePort` | DONE | new `createCustomCredentialsToolRegistrations({routeDeps,surfaces,host,ports})` and `createApiCredentialSaveToolHandlers({…,ports,cards})`; `ports: CustomCredentialToolPorts {credentialedRequest, sourceControlWrite}` (new required type in `credential-tool-host.ts`, core types only, @agent-notes: target before decrypt/dialog, GET/POST/PUT/PATCH immediate, DELETE held then decrypt, decline sends nothing, one build/validate-before-decrypt/one plan/one commit on the SAME provider with the EXACT plan, abort → no commit, egress `callerSafeError` only). verify → `port.verify`; make_request → `port.request` (headers/body as the optional half) / `port.resolveTarget`; egress rebuild now `classifyError(...).callerSafeError` (Tovu binder builds exactly the old `new EgressRefusedError({message: callerSafeMessage}, {callerSafeMessage})`); `isCredentialedRequestShapeRejection` = `classifyError` category ∈ {validation, egress-refused} (same set as the old two `instanceof`); write_files → `build`/`validateTarget`/`planFileWrite`/`commitFiles`; plugin-card probe → `port.probe`. Old/part-2 entries bind `credential-ports.ts`'s `bindCredentialedRequestPort`/`bindSourceControlWritePort` over the same deps (`credentialedRequestDeps(routeDeps)` = the former inline `requestDeps`). Same error classes/messages. |
| 2. secret cards / askThenReport injection | DONE (cards) / REMAINING (approval) | `createApiCredentialSaveToolHandlers` takes required `cards: CustomCredentialSecretCards {defineSecretCardTool: SurfaceCardsPort["defineSecretCardTool"], askThenReport: SurfaceAskThenReport}` (@agent-note: typically Jini UI `@jini-ai/ui/mcp-ui/secret-card` + daemon `askThenReport`; SAME `SurfaceExchangeStore` as the answer/callback route; keystrokes only browser→route→exchange→seal; outcome same URI only after save). Existing entry binds ui `defineSecretCardTool` + daemon `askThenReport`. `approvalToolHandler`/`describeDeleteRequestApproval` NOT injected: its type names T `HumanConfirmSpec`/`ChatDeleteSurfaceDeps`, so a generic port needs a narrow local approval type — not started before the 09:00Z row cut-off. |
| 3. pluginCards {load,find,readValues}, credentialCardForms, recovery/setup diagnostics | REMAINING | not started (time) |
| 4. deployment catalog / publish + cache invalidation, locale/translation ports | REMAINING | not started (time) |
| 5. abortGuardedCredentialRepo, cleanCardToken / assertCredentialFreeField / worksFor, model-facing error rules / form messages, tool ids / handler keys | REMAINING | not started (time) |

Commits (Tovu `cloud/extract-s8`, all pushed; Jini none):
- `42b9b0c5` refactor: request, verify, target and file-write handlers call the injected credential ports (row 1)
- `3644089f` refactor: plugin-card key probe goes through the injected request port (row 1)
- `2f25eedb` test: second host's credential ports are the ones the handlers call, in order (row 1)
- `d58df3cf` test: plugin-card key probe uses the second host's request port (row 1)
- `1e4f8d3d` refactor: API key cards open through host-injected secret-card functions (+ test) (row 2)
- this report commit (SHA in the final digest / F8 rerun)

Files (T = `apps/website/src/features/custom-credentials/`; none in S4/S5/S6 lanes; `tool-catalog-manifest.ts` and connect tokenDeps :595 untouched; no test/fixture M/D/R):
- `credential-tool-host.ts` (+38/−2; still core-type imports only): new `CustomCredentialSecretCards`, `CustomCredentialToolPorts`; import of `SurfaceCardsPort` and `@jini-ai/core/contracts/credentials` port types.
- `tool-registrations.ts` (+160/−64 across both rows): imports (credentialed-request value imports reduced to `CredentialedRequestValidationError`; `provider-module`/`buildSourceControlProviderForApi`/`validateRepositoryTarget`/`probeCredentialConnection` imports dropped; core credential types + `credential-ports.js` binders added); `isCredentialedRequestShapeRejection`/`makeModelFacingCredentialedRequest` (old lines 222-246); `performRepositoryFilesWrite` (397-404); `probeCardBeforeSave`/`SetTokenAnswerContext`/`saveSetToken`/`saveCreateCard`/`openCreateCard` gain `probe` and `cards` (567-939); `createApiCredentialSaveHandlers` → one-line binding + new `createApiCredentialSaveToolHandlers` (964-1067); new `credentialedRequestDeps`, `tovuCredentialToolPorts`, `createCustomCredentialsToolRegistrations` (1093-1102); handler call sites (1124, 1177, 1185, 1208, 1229-1257).
- Comment edit (exact, recorded): before — "// `EgressRefusedError` is a runtime import, and the ONLY one this file takes from `platform/http` — / // the barrel is otherwise types-only by design. Imported for `instanceof`, not to construct / // anything; see {@link isCredentialedRequestShapeRejection}. Same pattern / // `features/media-import/tool-registrations.ts`'s own identical import uses." + `import { EgressRefusedError, type HttpClientPort } …`; after — "// Types only: the egress refusal is recognised through the request port's `classifyError` / // (Tovu's binding, `credential-ports.ts`, holds the `EgressRefusedError` runtime import)." + `import type { HttpClientPort } …`. The runtime import it explained no longer exists in this file; the `instanceof` now lives in the binder (part 1).
- NEW test `__tests__/extract-s8-c2p2c-ports.test.ts` (9 tests): old-entry byte pins (reuses `extract-s8-c2p2-pins.support.ts`, same four recorded hashes); acme host (permissions `acme.creds.see`/`acme.creds.change`, entity `acme-entity`, namespace `acme`, apps `acme-key-*` v7, acme URLs/messages): verify + GET = one port call each, no resolve, exact required/optional split; egress → port `callerSafeError` message, no resolved address; DELETE: `resolveTarget` before the dialog, decline → no `request`, approve → exactly one `request:DELETE` after the dialog with the write permission re-checked, refused target → no dialog; write files: `build → validateTarget → open → plan → commit`, same provider object at validate/plan/commit, `commitPlan === plan`, abort during plan → no commit, refused target → no decrypt/plan; probe through the port before sealing (refusal keeps the old key, card text has the host hint); cards: the card handler receives the SAME exchange store, host reporter called once, outcome emitted only after the new key is stored, URI `ui://acme/secret-card/credential_save/acme-rot-1`.

Gate (Tovu root, Node 24.2.0):
| check | result |
|---|---|
| T `npx tsc -p tsconfig.json --noEmit` | exit 0 (after row 1a, row 1b, row 2) |
| explicit pin compile (`tsconfig.tests.json` + the 8 earlier S8 test/pin files + the new file) | exit 0 |
| eslint `--max-warnings 0` on the 3 changed/new files | exit 0 |
| T matrix after row 1 (C1 + C2 matrices + accumulated nine + inherited S3 three + all S8 tests + new file) | 54 files, every exit 0, 798/798 |
| T matrix after row 2 (same list) | 54 files, every exit 0, 799/799 (part 2 end: 53/790; +1 file/+9 tests) |
| fixture hashes (tool-metadata.baseline, moved-tools ×3, cost-counters.baseline) + inherited S3 pins ×3 | all 8 unchanged |
| Jini | untouched: HEAD = remote = `a266ba82…`, clean → J build/guard/cross-package not rerun (F8 values stand) |

Repairs (own errors): first draft dropped the `CredentialedRequestValidationError` import still used by the map-level error rules → restored before the first compile; explicit pin compile found the test's sealer wrapper untyped → typed parameters. No production behaviour changed by a repair. No process left running (both matrix runners exited 0).
Elapsed: 08:39Z–08:59Z (≈20 min). Approval injection and rows 3–5 were not started: the remaining window could not hold another implementation plus a full green matrix before the 09:10Z push deadline.

### F8 rerun

Full accumulated gate, rerun 08:58Z–09:06Z at the final pair **Tovu source `1e4f8d3d1` (tip `db3456e397db786bdbe00824ec451fe5985066d5` is report-only) / Jini `a266ba82144d9c7d8078ef7d056ff8c748d607e6`** (unchanged). Same commands as the F8 section above; no earlier green result reused. Node 24.2.0 / npm 11.3.0 / pnpm 10.33.2.

**1. Start-to-tip diffs (git only).**
- Tovu `c3801c83..db3456e3`: 26 paths = 21 A + 5 M. The M paths are only the five production files `features/custom-credentials/{credential-copy-tool,store,tool-registrations,types,vault-repo}.ts`. No pre-session test or fixture is M, D or R. No migration, package.json, lockfile, guard, checker, layer, debt or `server/` path. Since the previous F8 source (`463f56a8`): `credential-tool-host.ts` and `tool-registrations.ts` modified (both session-added or already-listed), one new test `features/custom-credentials/__tests__/extract-s8-c2p2c-ports.test.ts`, and the report.
- Jini `4044fe3c..a266ba82`: 11 paths (9 A + 2 M: `packages/core/src/contracts/credentials.ts` types only, `packages/integrations/package.json` exports only). Name list identical to the previous F8.
- Session-new tests changed after their first commit: `extract-s8-c1-second-host` (2 commits), `extract-s8-c1-source-scan` (3), `extract-s8-c2p2-host-inputs` (2), `extract-s8-g-cred.integration` (2), `extract-s8-c2p2c-ports` (3: `2f25eedb` → `d58df3cf` → `1e4f8d3d`). The c2p2c follow-ups only re-type the test sealer wrapper, widen imports and add the row-2 card cases (+74/−6); no assertion was removed or softened.
- Shared lanes (fresh fetch of `cloud/extract-s4/s5/s6`, intersected with the S8 name lists): Tovu none; Jini only `packages/integrations/package.json` with S5 (disjoint export entries, as before). S4/S6 none.

**2. Hashes.** 12/12 MATCH (start-pin blob = working tree = HEAD): 5 base fixtures and 3 inherited S3 pins against `c3801c83`, and the 4 C0 fixtures (`expected-open`, `expected-summaries`, `stored-rows`, `synthetic-key`) against `3e3eaa1d`. Byte-identical to the previous F8 hash table.

**3. Jini gates** (XP3 snapshot verified first: manifest.json sha256 `d836eba0…d459`, aggregate d.ts hash `48f6d422…2d24`, both equal the setup record).

| step | exit | result |
|---|---|---|
| core build / tsc | 0 / 0 | |
| integrations build / tsc | 0 / 0 | |
| integrations vitest (8 named files) | 0 | 8 files, 217/217 |
| neutral-host `credential-sets.test.ts` / typecheck | 0 / 0 | 1/1 |
| scripts three (`check-no-cross-package`, `extract-s3-checker`, `extract-s3-source-contracts`) | 0 | 3 files, 70/70 |
| `JINI_DECLARATION_BASELINE_DIR=<snapshot> pnpm check:cross-package` | 0 | XP1–XP5 clean |
| `pnpm guard` | 1 | baseline: "2 guard violation(s)", output byte-identical to the previous F8 (timings aside) |
| guard:plugins / layers / isolation / SI audit | 0 / 0 / 0 / 0 | SI c=9 d=7 |
| eslint changed (`--max-warnings 0`) | 0 | |

Guard families: R2-deep-path 1, R10-chatpane-public-surface 1 (both pre-existing); HW1/2/3/4/5/6/7/8/9 = 17/16/135/1/0/0/0/49/0, 0 new each; R13 informational only. No N1, R8 or other family.

**4. Tovu gates.** relink 0; contracts build 0; main `tsc --noEmit` 0 (30 s); explicit pin compiles 0 ×5 (C0, C1, C2p1, C2p2, and an all-pins config now covering all 9 session-new test/pin files including `extract-s8-c2p2c-ports.test.ts`); `eslint --max-warnings 0` on the 21 A/M .ts files 0; `biome lint` 0 errors (warnings only in new tests plus pre-existing ones; `tool-registrations.ts` has the same 15 warnings at the start pin, `463f56a8` and HEAD). Tests one file at a time (same node command as F8): **54 files, 799/799 pass, 0 fail, every file exit 0** (the new c2p2c file 9/9).

**5. C0 new→old replay against final code.** `EXTRACT_S8_G_CRED_REPLAY_DIR=<dir>` on the unchanged C0 test: 11/11, exit 0. The pinned old reader from the detached Tovu worktree at `3f19a8bd`: **3/3 rows accepted, exit 0.**

**6. Inspection.**
- `credential-tool-host.ts` imports only `@jini-ai/core` / `@jini-ai/core/contracts/{cards,credentials}` types. Its `@agent-note`s spell out the port contract: bind both ports over the host's existing adapters; `resolveTarget` never decrypts and runs before any dialog; DELETE decrypts and sends only after approval; `classifyError` returns the egress refusal's caller-safe error without the resolved address; file writes are one `build` → `validateTarget` before decrypt → one `planFileWrite` → one `commitFiles` on the same provider with the exact plan, no commit when aborted; cards are typically from Jini UI (`defineSecretCardTool` from `@jini-ai/ui/mcp-ui/secret-card`, `askThenReport` from `@jini-ai/daemon/surface-exchanges`) with the same `SurfaceExchangeStore` the answer route uses.
- Open doc issue (not fixed here, to keep the gated pair): the JSDoc block describing the two credential ports sits directly above the `CustomCredentialSecretCards` JSDoc, so `CustomCredentialToolPorts` itself carries no doc comment on hover. Move it onto `CustomCredentialToolPorts` in the next session.
- Vocabulary: no Tovu/product strings in the added or modified Jini code. The Jini `sets/store.ts` docs say "admin inventory" and "site overrides" (generic wording, unchanged since the previous F8). The Tovu seam files are Tovu-owned and name Tovu only as the example binder.
- Emitted `core/dist/contracts/{credentials,cards,vault}.js` are each exactly `export {};`.

**Processes.** Jini gate PID 7383 and Tovu gate PID 10530 both exited (DONE); replay and old reader ran in the foreground. `ps` shows no node, vitest, tsc, npm or pnpm process afterwards.

> Original S8 verdict (08:22Z): EXTRACT-S8 STOPPED AT CAP — C2 part 2 partial, token cap.

### Continuation final status

- **Tips (ls-remote verified):** Tovu `cloud/extract-s8` = the commit that adds this final-status block (report-only); before it `7601724b15230fd9a8c6180f3a7608102d490c9f` (F8 rerun section, report-only), verified with `git ls-remote origin refs/heads/cloud/extract-s8`. Jini `cloud/extract-s8` = `a266ba82144d9c7d8078ef7d056ff8c748d607e6` (unchanged since C2 part 1; ls-remote equal).
- **Last verified GREEN source pair (F8 rerun):** Tovu source `1e4f8d3d1271405709bd588c7a04e2c86cd42031` / Jini `a266ba82144d9c7d8078ef7d056ff8c748d607e6`. Report-only Tovu commits after it: `db3456e397db786bdbe00824ec451fe5985066d5`, `7601724b15230fd9a8c6180f3a7608102d490c9f`, and this final-status commit.
- **Recovery branches:** `git ls-remote origin 'refs/heads/cloud/extract-s8*'` lists only `refs/heads/cloud/extract-s8` in both repos. No fallback or recovery branches.
- **C2 part 2 rows done (continuation):** row 1, handlers consume the injected `CredentialedRequestPort` / `SourceControlWritePort` (`42b9b0c5`, `3644089f`, tests `2f25eedb`, `d58df3cf`); row 2, secret cards: `defineSecretCardTool` and `askThenReport` injected through `CustomCredentialSecretCards` (`1e4f8d3d`).
- **C2 part 2 REMAINING:**
  1. `approvalToolHandler` / `describeDeleteRequestApproval` / human-confirm injection (needs a narrow local approval type replacing `HumanConfirmSpec`);
  2. `pluginCards` {load, find, readValues} / `credentialCardForms` / recovery and setup diagnostics;
  3. deployment catalog / publish / cache-invalidation / locale-translation ports;
  4. `abortGuardedCredentialRepo` / `cleanCardToken` / `assertCredentialFreeField` / `worksFor` / model-facing error rules / form messages / tool ids and handler keys.
- **Next-session work:** finish the C2 part 2 remaining rows above, then C3 (tools move), G-deploy, C4.
- **Open doc issue:** move the credential-ports JSDoc onto `CustomCredentialToolPorts` (see F8 rerun, section 6).
- Continuation tokens (coordinator-corrected from harness usage): C2p2 remainder 211k + F8 rerun 114k + coordinator ≈ 25k = ≈ 350k of 450k; elapsed 28m of 60m at 09:06:30Z.

Stop reason: continuation token cap — after C2 part 2 rows 1–2 (partial) and the F8 rerun, ≈ 100k of the 450k continuation tokens remain, less than one more row builder plus the mandatory full F8 re-gate (≈ 114k alone); the remaining C2 part 2 rows (listed above) stay unbuilt. Not a behavior, design or import-rule stop.
EXTRACT-S8-C STOPPED AT CAP

## Codex continuation

### EXTRACT-S8-X clock, inputs and inventory (before implementation)

Conservative UTC start **2026-11-09T15:03:00Z**, deadline **18:03:00Z** (3 hours, including setup),
implementation cutoff **17:38:00Z** (last 25 minutes reserved for F8, recovery, shutdown and report).
Single serial worker; no helper agents. Current owner instructions supersede the older branch creation,
150-minute and token-cap instructions. C0, C1 seam/move, C2 part 1 and the two completed C2 part 2 rows
are retained. C3, G-deploy, C4, publishing and deployment are excluded.

Fetched and verified before tracked writes:

| Repository / origin | existing branch | continuation input | S3 fetched pin |
|---|---|---|---|
| AINSEP/Tovu, https://github.com/AINSEP/Tovu.git | cloud/extract-s8 | 25278ded34ff933801fb6c51e0dc62358f520431 | c3801c833a191be51753dcdecd133b0cad6f8945 |
| AINSEP/Jini, https://github.com/AINSEP/Jini.git | cloud/extract-s8 | a266ba82144d9c7d8078ef7d056ff8c748d607e6 | 4044fe3c0fa34b1f903c5d20a6b4de7714cde573 |

The environment initially checked out unrelated `work` branches. Only after fetching the exact pins
were local tracking branches for the existing S8 branches selected; no existing branch was overwritten.
Inherited last verified GREEN source pair: Tovu **1e4f8d3d1271405709bd588c7a04e2c86cd42031** /
Jini **a266ba82144d9c7d8078ef7d056ff8c748d607e6**. This is inherited evidence, not a new baseline claim.
The new unmodified baseline is in progress at this inventory commit.

Bootstrap: Tovu's absent AI-Dev-Shop is expected under the current dispatch; Jini's AGENTS and
AI-Dev-Shop/AGENTS were read. The dispatch's explicit serial/no-helper rule governs. Jini's local
codebase-memory executable and Graphify output are absent; the available understand-anything index
was queried, then the actual source and CAPABILITIES were checked. Tovu's cited architecture sections
13/14 are absent in this checkout; the owner's complete extraction contract supplies the applicable
architecture. No missing file is treated as an external implementation prerequisite.

Pinned toolchain: Node 24.2.0, npm 11.3.0, pnpm 10.33.2 installed outside both tracked trees. Initial
installs failed because native builds attempted writes in the read-only user cache; workspace-local
cache/devdir and the matching Node distribution's headers repair setup without tracked changes.
The untracked `Jini/packages/plugin-ui-ux-design` residue was inspected with `git ls-files` (empty)
and status, then removed; no tracked source was removed. Frozen installs and original XP3 reproduction
are required before relying on the baseline. The private brief stays outside both repositories.

This is one completion batch for the four remaining C2 part 2 groups. Existing entries retain their
signatures and bind Tovu policy; new fully injected entries accept the required local operations.
Nothing moves to Jini in C2. The local port declarations import core types only, carry their second-host
obligations, and are the intended C3 consumer contracts. The prior C2 inventory remains applicable;
the following resolves its remaining helper closure. Source lines refer to continuation-input Tovu's
`apps/website/src/features/custom-credentials/tool-registrations.ts` unless another file is named.

| Name / dependency | Value/type | Source file:line | Destination | Host vocabulary: injected input or justification | @agent-note obligations |
|---|---|---|---|---|---|
| approvalToolHandler / requireHumanConfirm / describeDeleteRequestApproval | values + narrow type | imports :35, :62; DELETE :1203; contracts/core/human-confirm.ts | named local approval port | host description, tool id, error prefix, namespace/app/path and all dialog text stay in the bound host transport | Same answer-route exchange store; prepare before dialog, explicit human only, freeze input, recheck permission and abort before decrypt/send; decline sends nothing |
| PluginCredentialCard | type | :2 | core/contracts/credentials | provider/owner/label/category ids are trusted card data, not invented defaults | Cards come from the installed trusted loader; metadata cannot select or authorize a key |
| loadPluginCredentialCardsSafely / findPluginCredentialCard / readPluginCredentialValues | values | :59; plugin-credential-card.ts | pluginCards load/find/readValues port | workspace/target/saveKind are explicit inputs; warning and validation copy belong to binding | Absent loader means no cards, preserve exact owned-label matching/conflicts, fixed destinations, HTTPS/public-field rules, no plaintext model result |
| buildPluginCredentialForm / applyPluginCredentialCard | values | :58 | credentialCardForms plugin build/apply | app identity and plugin text/URLs are host inputs | Typically UI builders, never a production package import; token has no prefilled value |
| buildCreateForm / buildCreateOutcome / CreateCredentialPrefill | values/type | :60 | credentialCardForms create form/outcome + narrow local prefill type | category list, examples/URLs, field labels, app names and dimensions stay with host builders | Preserve form bytes for Tovu; outcome only after save at same URI |
| setTokenForm / setTokenOutcome | values | :61 | credentialCardForms rotation form/outcome | all form/app/product copy supplied by host | Masked human input only; token hints human-only; keep fresh username on replacement |
| SecretCardForm / SurfaceOutcomeSpec / AssistantSurfaceDeps | types | :19, :27 | core/contracts/cards and core SurfaceExchangeStore shapes | field names token/label/baseUrl/category/username/worksFor and lifecycle statuses are persisted card protocol | No UI/daemon types in consumer-only contracts; exact same exchange instance as answer route |
| withCustomCredentialSetup / CredentialSetupFailure / diagnostic issuer | value/types | :8; credential-recovery.ts | recovery withSetup port + narrow local diagnostic type | recovery save tool id/kind/prefill and wording remain host input | Preserve issued-object provenance; missing label offers creation, only explicit invalid verification offers rotation; transport failure never establishes invalidity |
| loadCreateCredentialProviders / DeployTargetRegistry / source-control catalog | value/types | :937, :5, :63 | catalog loadProviders port | provider/vendor ids supplied by current host catalogs | Optional catalog failure never blocks create or erases explicit worksFor; read-only enrichment, no extra loads |
| publish registry + invalidatePublishCredentialCompatibility + verification cache | values/types | :3, :864–887 | publish prepareInvalidation port returning an exact after-save callback | host workspace/target/cache keys stay in binding | Same registry/cache objects; prepare before persistence, invalidate only after successful save, never on failure |
| resolveOperatorLocale / OperatorLocaleDeps | value/type | :12–13 | locale resolve port | workspace/principal locale lookup remains host | Same authenticated principal and workspace; no generic default locale |
| credentialText / formatCredentialHint / translateCredentialMessage | values | :11 | locale text/hint/translate ports | all sentences/translations and hint labels are host input | Translate only caller-safe text; hints never enter model output |
| abortGuardedCredentialRepo | value | :1; vendor-credentials/abort-guarded-repo.ts | policy guardRepo port | no product defaults; same repo supplied explicitly | Guard site and project insert/update plus vault put/applyBatch after asynchronous sealing; preserve CAS/transactions and bound receiver; reads/deletes pass through |
| cleanCardToken | value | :57; card-token.ts | policy cleanToken port | host's token paste policy | Preserve cleanup/validation and exact resulting secret; never log or return it |
| assertCredentialFreeField | value | :10; contracts/core/credential-token.ts | policy assertFreeField port | field names explicit protocol input; host exception/message policy | Reject secret-looking non-secret fields before disclosure; no echo of secret values |
| normalizeCredentialWorksFor | value | :4 | policy normalizeWorksFor port | explicit vendor/host ids; default category and unlabeled text become policy/message inputs | Metadata only, never credential selection/authority; preserve explicit submitted compatibility ids |
| CUSTOM_CREDENTIALS_MODEL_FACING_ERRORS / forbiddenRule | values | :310 | modelFacingErrors host rules | error codes, guidance, secret-store/Admin text all host input | Same canonical error classes; allowlist only; transport/unknown/raw sealer/JSON errors stay redacted, egress safe error before schema decoration |
| FORM_SAVE_CALLER_SAFE_ERRORS / FORM_SAVE_FAILURE_MESSAGE | values | :498–513 | formErrors host rules/fallback | fixed storage and internal-failure sentences are host text | No raw unknown message; fixed secret-store text; duplicate project-conflict message only through trusted classifier |
| mapCreateCredentialError / duplicate-label wording | value | :816 | helper consumes form rules/messages + duplicate-message policy | rotation tool name, project-conflict prefix and label wording host supplied | Canonical error identity, safe display label, duplicate refuses overwrite |
| probeCardBeforeSave | value | :566 | helper consumes messages and existing request probe port | mismatch/refused/unavailable/previous-key/hint text host input | Saved origin before probe; probe before seal; abort around await; failures keep previous key |
| readCreateCredentialPrefill / safeCredentialLabel / deriveCreateCredentialSubmission | values/types | :682, :780, :785 | same-job helper using policy/messages | category default and unlabeled display text host input; field names persisted protocol | Secret-free prefill, no hidden category/product default; all real validation stays in C1 store |
| rejectUnexpectedSetUsernameFields / requireUsernameOrClearSentinel / rejectUnexpectedSetTokenFields | values | :444, :467, :492 | helpers consume host messages | username/token tool names and messages supplied | Exact accepted key sets label+username / label; null clears, omission refused; never model secret input |
| reportRepositoryWriteFailure / failureLog | values | :520, :537 | host diagnostic callbacks | log prefix and tool ids remain host binding | No token, file contents, label or arbitrary exception text; log-only network/egress detail stays server-side |
| tool ids / registration handler keys / customCredentialsDerivedRisk | values | :46, :62, :343, :1124–1300 | required ids + derivedRisk inputs on new entry | list/verify/setUsername/makeRequest/writeFiles/save ids injected; registration keys computed from them | Catalog, metadata, risk, schema decoration and handler keys must agree; no fallback product ids |
| create/rotate/pluginProvider adapter keys | local method protocol | :979–1073 | local adapter result shape | neutral operation roles used by credential-save composition, not public tool ids | Stable internal API retained for existing callers; external registered ids still supplied explicitly |
| makeModelFacingCredentialedRequest / isWriteFilesShapeRejection / performRepositoryFilesWrite / writeTarget | values | :248, :266, :396, :421 | same-job helpers + existing core/request/source-control ports | schema tool ids and error/log text supplied; HTTP method DELETE and Authorization are neutral wire protocol | Preserve caller-safe classifier; target before decrypt; exact same provider/plan and single commit; abort commits nothing |
| C1 store operations and canonical errors | values/types | :65–78 | existing C1 bindings retained in place | C1 already injects owner/category/store messages; no new host vocabulary default | Same vault/owner/scope/CAS and canonical error objects; no new repository, migration, decrypt or serialization |
| CustomCredentialToolPorts documentation | type declaration | credential-tool-host.ts:63–99 | put existing JSDoc on actual declaration | no value change | All ordering, same-provider/plan, trusted binding and custody rules visible on declaration hover |

Planned new verification before source edits: `extract-s8-x-host-operations.test.ts` for second-host
approval/confirm, plugin load/find/read/forms, diagnostics, catalog/invalidation ordering, locale and
policy callbacks, foreign ids/messages/paths and old-entry byte pins; `extract-s8-x-contracts.test.ts`
for pure-contract imports/declaration documentation and absence of product defaults in the injected
closure. Existing tests/fixtures are frozen (allowance NONE). Full 54-file inherited Tovu matrix plus
all new tests, explicit pin compilation, core/integrations builds/types, neutral host, Jini matrices,
original-snapshot XP1–XP5 and complete raw guards are required again at the final source pair.

Inventory resolution before implementation: the new injected entries also take a narrow
`CredentialToolActorDeps` (core LegacyToolAuthorizeFn, workspace id and trusted scheme loader),
`CredentialToolSurfaces` (core exchange store), and `operations.sets: CredentialToolSetsPort`.
The latter binds the existing C1 list/describe/byLabel/resolve/setUsername/create/replace functions
over the same host policy and repo rather than exporting the broad Tovu route-deps type. Its
create/replace callbacks receive the supplied abort guard, signal and trusted principal where
needed; they preserve owner replacement, scope grants and CAS. These are consumer-only core-type
contracts with declaration @agent-notes, no new domain package or runtime implementation move.
Summary categories remain the core's host-supplied string; the Tovu binding preserves its existing
stored category union. This resolves the C1 row's prospective C3 type closure without a Tovu type
import or a cross-package import.

Write-validation closure resolution before implementation: `validateWriteFilesInput` remains in
Tovu behind `policy.validateWriteFiles`; its exact consumed result is local
`CredentialWriteFilesRequest` (branch/commitMessage/files), with declaration notes requiring the
existing branch/path/size/.git rules and canonical validation errors before permission/I/O. The
provider-specific owner/repo validation already goes through SourceControlWritePort. Consequently
the prospective handler closure imports neither the Tovu source-control validator type nor its
policy module; no source-control implementation or limits move in this batch.

### Fresh baseline and original declarations

Baseline completed on unchanged production/test source before implementation, 15:28:15Z:
Tovu **54 files / 799 tests / 799 pass / 0 fail, skipped, todo or cancelled**; main tsc exit 0.
Jini core build/types, integrations build/types, eight integration files **217/217**, neutral-host
credential-sets **1/1** plus typecheck, three checker files **70/70**, original-snapshot XP1–XP5,
plugins, layers and isolation all exit 0. Full recursive Jini build and original recursive build
both exit 0. Raw `pnpm guard` exits 1 with exactly the two inherited findings described below.
No baseline red was waived. The first dependent Tovu typecheck was accidentally started before
the full Jini build finished; after correcting that ordering, all declarations and baseline checks
passed. The first link attempt also used the checkout rather than its `packages/` directory;
the corrected invocation is `JINI_PACKAGES_DIR=<Jini>/packages npm run link:jini`.

The original XP3 snapshot was reproduced once from clean detached Jini
**35c4961af718f0f30591c46d2ea2756c4484a731**, with frozen install, core build, recursive build,
then S8's unmodified checker invoked by absolute path using the verified S8 tsx loader
(`tsx@4.23.1/dist/loader.mjs`). `--write-baseline` exited 0 with **3308 mappings / 3320 d.ts**.
Tracked source was clean before/after. The manifest SHA256 is
**d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459**;
the sorted declaration aggregate, using the earlier report's exact `find`/`sort`/`sha256sum` method,
is **48f6d4223224dc975edfbdebf1a01a25bf12044dfd1d4f872624571266452d24**.
Both match the inherited record. Every formal gate exports this immutable original snapshot;
it has not been regenerated. All 12 recorded artifacts were hashed and matched before edits.

Additional manifestless ignored residue, inspected and confirmed to have no tracked files before
removal: `Jini/packages/plugin-{ai-trace-langfuse,analytics-posthog,observability-opentelemetry,observability-sentry,payments-stripe}`.
These were stale ignored plugin outputs/node_modules, not source. Together with the previously
listed UI plugin residue, these removals changed no Git blob, guard or waiver.

### Remaining C2 part 2 groups implemented

| Group | Status / actual binding |
|---|---|
| Approval handler and human confirm | Complete. `CredentialApprovalDescription` contains only consumed core-shaped fields. Required `approval.handler`, `askHuman`, `describeDelete` are separate inputs. Tovu binds the same core `createApprovalHandler` that its old `approvalToolHandler` used, with the exact always-ask/no-remembered subset this DELETE consumes, and the unchanged Tovu `requireHumanConfirm` over the existing answer-route store. Target resolves before dialog, permission is rechecked after confirmation, abort prevents send, decline sends nothing. No human-confirm/server types leak into the consumer contract. |
| Plugin cards, forms, recovery/setup diagnostics | Complete. Required `pluginCards.load/find/readValues`, `credentialCardForms.buildPlugin/applyPlugin/create/createOutcome/rotate/rotateOutcome` and `recovery.withSetup`. Tovu binds its existing safe loader/exact-label selection, public-field validation, UI builders and issued diagnostics. Optional loader failures, ownership, fixed destinations, origin-before-probe-before-seal, plaintext custody and safe outputs remain intact. Recovery preserves the issued diagnostic object, not a reconstruction. |
| Catalog, publish/cache invalidation, locale/translation | Complete. Required `publish.loadProviders/prepareInvalidation` and `locale.resolve/text/hint/translate`. Tovu's optional catalog enrichment is unchanged. Invalidation callback closes over the existing registry/cache and runs after save, never on a failure; it neither reloads nor publishes/deploys anything. Real-binding tests verify registry/cache receiver identity, load counts, same repo/guard and optional failures. |
| Guard/token/field/worksFor/rules/messages/ids | Complete. Required `policy.guardRepo/cleanToken/assertFreeField/normalizeWorksFor/defaultCategory/isProjectConflict/validateWriteFiles`, canonical model/form allowlists, safe fallback/messages and diagnostic callbacks. Required ids drive every registration handler key, request schema decorator, write-files decorator and save-card routing; risk comes from the supplied map. Category defaults and every interpolated product sentence are host inputs. C1 store operations close over the existing host store through `sets`, so the injected entries accept only narrow core-based actor/surface/store contracts. |
| Open documentation issue | Fixed. The existing credential-port JSDoc is directly attached to `CustomCredentialToolPorts`. Added missing declaration-local notes to the aggregate host/messages and internal result/submission/context contracts. Both source and real emitted declarations retain their notes. |

New fully injected entries: `createCredentialToolRegistrations` and `createCredentialSaveHandlers`.
The old `build*`, `createCustomCredentialsRegistrations`, `createCustomCredentialsToolRegistrations`,
`createApiCredentialSaveHandlers` and `createApiCredentialSaveToolHandlers` retain their signatures;
they bind Tovu operations explicitly. `bindTovuCredentialToolOperations` is the compatibility binder.
No C3 handler or other runtime code moves to Jini. No deployment/source-control/server/HTTP/policy
implementation is extracted. No new package, dependencies, exports, lock changes or changeset is
needed for these Tovu-local seams; earlier S8 public entries/changesets remain unchanged.

Declaration obligations cover provider/plan identity, same store/vault/transaction, current scope
and grants, authenticated actor, target/dialog/decrypt/save ordering, compare-and-swap/private context,
issued-diagnostic provenance, secret custody and trusted metadata. Field names
`label/baseUrl/category/username/token/worksFor`, lifecycle statuses, the scope `site`, DELETE and
the secret-card path layout are existing neutral/persisted protocol, not product defaults. The API
adapter return keys `create/rotate/pluginProvider` are private composition roles, not tool ids.
All tool ids, permissions, entity/domain/catalog path, namespace/apps, category defaults, product
words, errors, descriptions, examples and URLs consumed by the injected closure are supplied.

### Commits, tests, repairs and C2 gate

Tovu `cloud/extract-s8`, every commit pushed after a pre-push pull/rebase and ls-remote verified:

| Kind | Full SHA |
|---|---|
| First inventory | 463e647447a3cd0929b145be4860c58a2fcdc6e7 |
| Actor/store closure inventory | 3538f2467364601f54c36274197a72ff80a03caf |
| Write-validation closure inventory | 51270fd10ee1aebb5f8e6509ae0d36f52981e513 |
| Implementation (preserved before validation) | de3134c97d3d25f7252d02c8f0b4d6b44550c1c9 |
| Independent host/declaration tests and notes | f64bf3d32c1216bc5e07169173c8aec84193c7e4 |
| Real binding tests | 2a061288765a9470812487780ec588fd869d073c |

Jini stays **a266ba82144d9c7d8078ef7d056ff8c748d607e6**. No Jini source commit in this continuation.

New tests, all named in the pre-implementation inventory:
- `apps/website/src/features/custom-credentials/__tests__/extract-s8-x-host-operations.test.ts`: **14 tests**. Independent host with foreign permissions/entity/domain/ids/catalog path, namespace/apps/approval path, URLs, category, copy and locale. Exercises list hints/owned labels, issued recovery identity, actual human answer exchange, decline, approval/revocation, creation/defaults/cleanup/worksFor, plugin form/read/probe refusal, current username on rotation, safe model/form errors, duplicate and public-field errors, provider/plan identity, missing channels/cards, plus real Tovu catalog/cache/repo/guard and optional-loader bindings.
- `apps/website/src/features/custom-credentials/__tests__/extract-s8-x-contracts.test.ts`: **4 tests**. Pure core type imports, declaration-local notes preserved through declaration emission, correct attachment of the port note, and AST inspection of the intended handler/helper closure for product literal defaults and broad Tovu dependency types.

Repairs: initial strict lint rejected three redundant optional/undefined annotations; removed them
without a suppression. The first new duplicate test submitted `label` through a test form declaring
only `token`; declared the public label/origin/username fields in that independent test form and
retained the original assertion. No pre-existing test/input/assertion was edited. The isolated old
reader initially ran as `.ts` outside an ESM package and failed before reading data; using `.mts`
fixed the harness, with the old checkout untouched. Setup/cache/link/order repairs are above.
No production behavior bug was waived or repaired by changing an expectation.

Mutation proof: temporarily hard-coded the list handler key instead of `operations.ids.list`.
The independent-host file failed **7 tests / 14**, exit 1, naming the supplied
`acme/catalog/keys.ts` drift; restoring the exact source produced the full green C2 gate below.
The mutation was never committed and left no diff. No fixture/golden was minted or reminted.
The four byte hashes are the already-recorded original S8 values.

C2 completion gate at source pair **Tovu 2a061288765a9470812487780ec588fd869d073c /
Jini a266ba82144d9c7d8078ef7d056ff8c748d607e6**, completed 15:55:12Z:

| Check | Actual result |
|---|---|
| Tovu relink / contracts build / main tsc | 0 / 0 / 0 |
| Explicit compile of all 11 S8 test/pin/support files, including both new files | 0 |
| Actual `tsc --declaration --emitDeclarationOnly` on both consumer contract modules, comments retained | 0; notes inspected in emitted d.ts |
| Tovu named accumulated matrix, all C0/C1/C2/new tests | **56 files / 817 tests / 817 pass**, every file exit 0; no skipped/todo |
| Tovu eslint, every S3-to-tip added/modified TS file (24 files), max-warnings 0 | 0 |
| Explicit no-inline-config cyclomatic and cognitive ceiling 10 on all three changed production TS files | 0 |
| Jini core build/types, integrations build/types | 0 / 0 / 0 / 0 |
| Jini eight integration files / neutral host + types / three checker files | 217/217 / 1/1 + 0 / 70/70; all exits 0 |
| Jini eslint, all seven S8 changed TS files, max-warnings 0 | 0 |
| Original-snapshot XP1–XP5 | 0, clean |
| Raw guard / plugin guard | 1 (exact inherited two findings) / 0 |
| Layers / isolation commands and actual exported-checker audit | 0 / 0 / 0; layers [], blocking isolation 0, SI-c=9/SI-d=7 |
| C0 replay / isolated old reader at Tovu 3f19a8bdb | 11/11, exit 0 / **3/3 rows accepted**, exit 0 |

The layer/isolation files export checker functions: merely loading those files is not independent
proof. The full guard invokes them, and this continuation additionally calls `checkPackageLayers`
and `auditSubpathIsolation` directly against the checkout and reads their full findings. The only
audit findings are the same c/d asset/aggregate advisories, nine/seven respectively.
Core `contracts/credentials.js`, `cards.js` and `vault.js` each contain only `export {};` plus the
source-map comment. No contracts gain runtime/Node imports.

UTC progress: baseline 15:28:15Z (25m15s elapsed); implementation/new tests 15:45:50Z (42m50s);
C2 gate complete 15:55:12Z (**52m12s elapsed, 127m48s remaining**). The original deadline stays
18:03:00Z. F8 is next; no C3/G-deploy/C4 work is authorized here.
