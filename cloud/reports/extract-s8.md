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

## F8

## Shared-lane files

## Processes

Setup/baseline: all background runners (install/build, link/tsc, original-checkout build, per-file test loop) exited; none left running.

## Final status
