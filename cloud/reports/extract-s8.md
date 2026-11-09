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
