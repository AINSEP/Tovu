# EXTRACT-S5 — plugin extraction session 5 (H0 → H1a → H1b → H2 → H3 → C-c)

Owner-approved by name 2026-11-08. Builder: Claude Code coordinator + one Opus subagent per batch (owner change to the Codex brief). The brief/plan are kept outside tracked source and are not committed.

## Timing (UTC)

- Start: 2026-11-09T06:10:31Z
- Hard deadline (270 min): 2026-11-09T10:40:31Z
- Shutdown reserve begins (no new batch): 2026-11-09T10:20:31Z
- Coordinator token cap: 1.9M total across coordinator + subagents

## Pins and branches

| Repo | Base pin (verified full SHA, = origin/cloud/extract-s3) | Branch |
|---|---|---|
| AINSEP/Tovu | c3801c833a191be51753dcdecd133b0cad6f8945 | cloud/extract-s5 |
| AINSEP/Jini | 4044fe3c0fa34b1f903c5d20a6b4de7714cde573 | cloud/extract-s5 |

XP3 original declaration base: 35c4961af718f0f30591c46d2ea2756c4484a731 (= origin/cloud/extract in Jini).
No cloud/extract-s4 branch existed on either remote at start (06:11Z). No untracked residue dirs under Jini packages/plugin-* at start (every dir has package.json).

## Setup

Node v24.2.0 (nodejs.org tarball, ~/.local/node24), npm 11.3.0, pnpm 10.33.2 (corepack).
Jini: `CI=true pnpm install --frozen-lockfile` EXIT 0; `pnpm --filter @jini-ai/core run build` EXIT 0; `pnpm --no-bail -r build` EXIT 0.
Tovu (after Jini build): `npm ci` EXIT 0; `npm run build --workspace @tovu/sdk` EXIT 0; `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` EXIT 0 (links every @jini-ai package to the S5 Jini tree, was installed-copy); `npm --prefix packages/contracts run build` EXIT 0; `npx tsc -p tsconfig.json --noEmit` EXIT 0, 0 errors.
Scratch worktrees: base/{Jini,Tovu} at the S5 pins (H0 rollback baseline; frozen install + builds EXIT 0); xp3-orig/Jini at the ORIGINAL pin 35c4961af718f0f30591c46d2ea2756c4484a731 (frozen install, core build, recursive build EXIT 0, tracked tree clean).

## Coordinator progress log

| UTC | Elapsed (min) | Event | Coordinator+subagent tokens (approx) |
|---|---|---|---|
| 06:10 | 0 | start, pins verified, branches created | — |

## Baseline (setup, guard, XP3, named tests)

Measured 2026-11-09 06:15–06:30Z at the UNMODIFIED pins (Jini tree = 4044fe3c0; Tovu production/test tree = c3801c833 plus only this report and the H0 builder's new fixture files from 31504fd7, none of which any named test imports). Measurement only: no production or test edits. Raw output is kept as .txt in the cloud scratch area (not committed).

### Guard (personally read, full stdout+stderr)
- `pnpm guard` raw EXIT 1. Printed TOTAL "2 guard violation(s).", exactly the expected two, by name and location:
  - `R2-deep-path` packages/plugin-catalog/scripts/generate.ts (relative import reaches agent-plugins/src)
  - `R10-chatpane-public-surface` packages/chat/src/react/features/chat-pane/components/ChatPane.tsx ("Icon" not in the public barrel)
  - No N1 finding, no other rule. R13-model-fallback-freshness is informational only (6 stdout lines: claude MF3 compared 16 live ids with 20 fallback entries; codex/agy MF3 skipped because the CLIs are absent; pi/aider/opencode MF3 not applicable).
  - HW summary: HW1:17 HW2:16 HW3:135 HW4:1 HW5:0 HW6:0 HW7:0 HW8:49 HW9:0, every rule "0 new".
  - Self-test passed: guard.ts exits before running any check when the self-test fails, and the separate driver's `runGuardSelfTest()` returned 0 failures.
- `pnpm guard:plugins` raw EXIT 0, no findings.
- Exported checks run through the installed tsx loader (node_modules/tsx/dist/loader.mjs, tsx 4.23.1) with a scratch driver that calls the functions and logs what they return: `checkPackageLayers` 0 findings; `checkSubpathIsolation` 0 findings; `auditSubpathIsolation` 573 closures and 16 audit findings (SI-c 9, SI-d 7). The SI audits match the brief's SI-c9/SI-d7 and do not fail the guard.
- Reusable gate script: it reruns all three, keeps the raw output, and compares every rule and location, the TOTAL, the HW counts and the SI audit lines against this baseline. Any N1 or other unknown rule or location fails it. It was negative-tested: a fabricated N1 line was flagged, and so was a TOTAL mismatch.

### XP3 immutable ORIGINAL declaration snapshot
- Writer: the S5 tree's scripts/check-no-cross-package.ts (blob d5d30609cb19, sha256 c0ad14077a98…), run by absolute path from a clean scratch worktree at the ORIGINAL pin **35c4961af718f0f30591c46d2ea2756c4484a731**. That worktree had a frozen install, a core build and a recursive build, all EXIT 0, and 0 tracked modifications. Nothing was copied into the old tree. The command was `node --import <s5-jini>/node_modules/tsx/dist/loader.mjs <s5-jini>/scripts/check-no-cross-package.ts --base 35c4961af718f0f30591c46d2ea2756c4484a731 --write-baseline <scratch>/declaration-baseline` and it exited 0 with "3308 source mappings".
- Counts: 3308 source mappings, 3320 declaration files, 3321 files including manifest.json. manifest.base = 35c4961af718f0f30591c46d2ea2756c4484a731.
- manifest.json SHA256 **d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459**. Whole-snapshot SHA256 (sha256 of the sorted per-file sha256 list) **08b79774e4c55f4288f682316eefe4ea077317da8f855d2e854f3606bc987048**.
- Made immutable: chmod -R a-w, plus chattr +i, because the container runs as root and root can write through a-w. After that, writes fail with "Operation not permitted" and the hash re-verifies.
- S5 tree `JINI_DECLARATION_BASELINE_DIR=<snapshot> pnpm check:cross-package` (the script passes `--base 35c4961af`): EXIT 0, "check:cross-package: XP1–XP5 clean". A gate script checks the snapshot base, the manifest hash and the whole-snapshot hash before every run.

### Tovu typechecks
- Main `npx tsc -p tsconfig.json --noEmit`: EXIT 0, 0 errors.
- `npm run typecheck:tests` (tsconfig.tests.json): EXIT 2 with **13 errors, not the 12 the brief lists**. The 12 listed errors are exact: external-mcp-connection-source.operator-read-only 42,27 TS2551; import-local.integration ×8 (27,16 28,32 30,40 31,40 33,35 35,13 35,119 45,30) TS18047; set-enabled-confirmation-ui.unit 41,266 TS2353; site-imports.integration 70,9 TS2741; agent-plugin-token-boot-order.unit 72,78 TS2561. **The extra prior error** is features/api-connections/__tests__/surface-connections.host-port.unit.test.ts(15,5) TS2322: the stub record lacks the required `staged` property of AdminSurfaceConnectionRecord. That file arrived in S3 commit 1ef11e22. It is prior test-typing debt and was not fixed.

### Named tests at the unmodified pins
Every brace list in "Named regressions" was expanded: 70 paths in total (50 T files, with connect-tool.api-connections listed in two groups, and 20 J files) plus J examples/neutral-host/src/api-host-moves.test.ts. Every path exists, so no corrections were needed. The T command is exactly the brief's, with `--test-concurrency=1`. The J command is `pnpm --filter @jini-ai/integrations exec vitest run <files> --maxWorkers=2 --minWorkers=1` (filter name confirmed from the package.json). Per-file counts come from one-file reruns of the same command, and their sums equal the group totals. No named test is a desktop test, so build:preload was not needed.

| Group | Files | Tests | Result |
|---|---|---|---|
| T store/vocabulary | 12 | 284 | all pass, EXIT 0 |
| T sign-in/gate | 7 | 142 | **141 pass / 1 fail, EXIT 1** |
| T API/token | 16 | 156 | all pass, EXIT 0 (connect-tool.api-connections.unit 12/12) |
| T connect | 6 | 147 | all pass, EXIT 0 |
| T accumulated nine | 9 | 58 | all pass, EXIT 0 |
| J integrations api-connections + token-store | 20 | 365 | all pass, EXIT 0 |
| J examples/neutral-host api-host-moves | 1 | 2 | pass, EXIT 0 |

**A required baseline test is red: prior Tovu test drift, not fixed.** T server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts has 3 cases and 2 pass. The failing case is `../../../inbound/assistant/agent-daemon-server.ts: desktop accepts a loopback OAuth callback; hosted requires HTTPS`, which fails with AssertionError "../../../inbound/assistant/agent-daemon-server.ts must have one OAuth ports call" (0 !== 1). The test scans that file's source for exactly one `createTovuOAuthHttpPorts(...)` call. At the pin there is none in server/inbound/assistant/agent-daemon-server.ts; the only composition calls are composition/app.ts:1159 and deps.ts:2180. agent-daemon-server.ts was last changed in 6331ff2e (2026-11-04) and the test in b389d729 (2026-11-03). The app.ts and deps.ts cases pass.

Earlier-debt items the brief names that are not in the named groups (T plugin-host-bundled-identity, J UI sign-in-card AbortSignal.any) were not run at this baseline.

### Hashes (sha256, at baseline)
- T assistant/__tests__/fixtures/tool-metadata.baseline.json **a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6**, which matches the brief.
- moved-tools.golden.json 3583bc14fa8c596d64a2e97a274166f87a0ea278aed3f8c12b926552b7fc5f66; moved-tools.access-token.golden.json 61e018a56d59eee3a4b44055136c9a7c6144c5a6b13a948c8f90ebb8b14ca16e; moved-tools.credential-cards.golden.json 3eb3766de97c9d6699507fbda53b29ec63babd0af1d6381611ee907da4a2fa01; server/runtime/boot/__tests__/fixtures/mail-send.golden.json f0733d6176cd0d2fc92a9181d342c9ff9480f0d505f7c5e1dc8330d3f48a4be3; server/runtime/composition/__tests__/fixtures/cost-counters.baseline.json 2be1488c8e4556b71b759536dccac88c78612a22200aa6843748f62cb78e736c.
- A full list of 25 files (every file in the T assistant, boot and composition `__tests__/fixtures` dirs, plus the J api-connections test fixtures) is kept in scratch, and `sha256sum -c` on it passes on both trees.

## H0 — G-mcp

Builder: H0 subagent (slug s5-h0). No production move or edit; Tovu new files only; Jini untouched (no Jini commits in H0). Programmer skills file (Jini `AI-Dev-Shop/agents/programmer/skills.md`) loaded.

### Paths verified / corrections
All plan-cited paths exist at the pin: T `features/external-mcp/external-mcp-repo.ts` (`SqlExternalMcpServerRepo`), `external-mcp-repo.sqlite.ts` (`SqliteExternalMcpServerRepo extends SqlExternalMcpServerRepo`), `external-mcp-store.ts`, `external-mcp-vault.ts`, `external-mcp-oauth.ts`, and every store/vocabulary + accumulated-nine named test (12 + 9 files). Corrections: (1) none of the cited paths are stale; (2) the repo test lives at `platform/db/repos/__tests__/external-mcp-repo.test.ts` while the repo itself is in `features/external-mcp/` (as cited); (3) `secrets_vault` is created for tests by the unregistered `ensureVaultRepoFixture` step, and vault rows need a `workspaces` FK parent, so the fixture carries one workspace row; (4) the schema itself refuses some tampers (trigger `secrets_vault_mcp_identity` on linked owner/kind, CHECK `secrets_vault_principal_scope`, CHECK `secrets_vault_owner` for non-MCP kinds) — the test asserts those refusals, then drops the identity trigger on its scratch copy to reach the read-side check.

### Fixture mint (once)
- Command (Tovu root): `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx apps/website/src/features/external-mcp/__tests__/fixtures/mint-mcp-credentials-frozen.ts --i-am-minting-once` (refuses without the flag or if the fixture exists). First attempt failed before writing anything (FK to `workspaces`; raw `h0-mint.txt` overwritten by the successful run); the fix added the workspace row; the single successful mint wrote the fixture.
- Writes went through the unmoved `SqlExternalMcpServerRepo` + `saveExternalMcpServer` (env row `env-tool` stdio/none; `static-http` streamable_http/static_env; `oauth-higgs` stdio/oauth with an env block) and the OAuth service's redirect sign-in against an in-process fake token server. Text SQL, INSERTs only: 1 workspace, 4 vault envelopes (mcp-env ×2, mcp-auth ×2), 3 servers. Test key + fake tokens only; no plaintext token appears in the file.
- Recording commit **31504fd7c16adf756e313da7f3d8c77087630139**. Fixture SHA256 **aca349ca2ad02ec166575336860daabe6c54d316bb7c6b23b9e06a00eddb40c3** (unchanged at H0 tip). Test-key SHA256 (of the 64-char hex string) **43bcfd960ecc2323244b0daaad5f99bfc4df7a2a53177dbd4bee23ae9788ab1a**.

### New tests (T command, `--test-concurrency=1`)
`features/external-mcp/__tests__/external-mcp-frozen-db.test.ts` (6 cases, SQLite file DBs) and `external-mcp-frozen-db.postgres.test.ts` (1 case, real PostgreSQL); shared host in `__tests__/fixtures/frozen-db-harness.ts`, fixture inputs in `__tests__/fixtures/mcp-credentials-frozen.fixture.ts`. All reads/writes go through `SqlExternalMcpServerRepo` + store/OAuth service (envelope context rebuilt by `joinedEnvelope`).
1. Open all three via `listExternalMcpServerViews`, `readEnabledExternalMcpConfigs` (+OAuth token resolver) and `openExternalMcpOAuthPayload`.
2. Gate: `createExternalMcpConnectionGate` verdict `current-grants-checked`.
3. Leased refresh (fake token server) → static re-save (no new token, carried envelope) → env update → restart (fresh connection/repo/keyring/sealer/service on the same file) → reopen all three. Untouched envelopes (static mcp-auth, oauth mcp-env) byte-identical incl. rowid; rewritten envelopes change ONLY `id,label,created_at,updated_at,sealed_ciphertext,sealed_nonce` (+SQLite rowid) — baseline reseal stages a new vault id with label=id; kind/owner/principal/binding/provider/is_default/revision/sealed_key_id/sealed_alg/last4/token_length/meta unchanged. Server rows updated in place (same rowid, created_at): env `env_secret_id,updated_at`; static `label,updated_at`; oauth `oauth_expires_at,oauth_secret_id,updated_at`. Rewritten OAuth payload keeps key order `clientSecret,tokens,schemaVersion`, schemaVersion 1.
4. Tamper owner/binding/other-MCP-kind → `VaultError{code:"context"}` from `findByServerId` and `listExternalMcpServerViews` with 0 sealer and 0 keyring calls; restore → reads again.
5. Foreign kind (`mcp-auth`, `api-connection`) on open → context, 0 sealer calls; foreign kind on seal → context, 0 sealer/keyring calls; invalid AAD (static ciphertext transplanted into the OAuth row) → `ExternalMcpSecretStoreUnconfiguredError` after exactly 1 open; payload schemaVersion 2 (sealed via the real seal path) → version error, not the decrypt error.
6. Canaries (token/secret/URL/path in `error_description`/`error_uri`; invalid_grant and 500): resolver error message, `readEnabledExternalMcpConfigs` failure reason and gate refusal contain none of them. Baseline already redacts — no prior-behaviour stop.

### Counters measured (baseline, asserted exactly)
| path | measured |
|---|---|
| toView (list, 3 rows) | opens per row env 1 / static 1 / oauth 2 (≤2); sealer {open:4}; kernel {query:1}; keyring 0 |
| gate call | repo {findByServerId:1}; kernel {query:1}; sealer 0; keyring 0 |
| one leased refresh | 1 token request; repo {findByServerId:4, tryClaimOAuthRefreshLease:1, releaseOAuthRefreshLease:1, upsert:1}; sealer {open:4, seal:1}; kernel {lockKey:3, query:4, run:13, transaction:3}; keyring {activeKey:1} |
| next call in lifetime | 0 requests; repo {findByServerId:1}; sealer {open:1} |
PostgreSQL replay asserts the same per-row opens, gate counts and refresh repo/sealer counts.

### BASELINE rollback
Script `features/external-mcp/__tests__/fixtures/s5-baseline-rollback.mjs` imports every Tovu module from `--base` (baseline checkout `/home/user/s5/base/Tovu`, pin c3801c83, installed+linked to `/home/user/s5/base/Jini`), copies the DB, compares against the fixture loaded by baseline code, and reads all three. Commands:
```
cd /home/user/Tovu && S5_FROZEN_DB_OUT=/home/user/s5/h0/post-write.db TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/features/external-mcp/__tests__/external-mcp-frozen-db.test.ts
cd /home/user/s5/base/Tovu && TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx /home/user/Tovu/apps/website/src/features/external-mcp/__tests__/fixtures/s5-baseline-rollback.mjs --base /home/user/s5/base/Tovu --db /home/user/s5/h0/post-write.db
```
Result at H0: `ok:true`, 5 checks (workspace unchanged; server rows in place — rowid/created_at/identity; untouched envelopes byte-identical; rewritten envelopes keep format columns; baseline code opens all three, 0 network). Raw `h0-rollback.txt`, `h0-final-rollback.txt` EXIT 0. Rerun after H1b and H3 (same two commands).

### Mutation red / restored green (raw `h0-mut-*.txt`, `.diff`; script `/home/user/s5/h0/mut/run-mutations*.sh` backs up, mutates, runs, restores by cp, proves `git diff --exit-code`)
| assertion | mutation | red | restored |
|---|---|---|---|
| tamper before crypto | repo `assertJoinedContext` no-op | EXIT 1 "Missing expected rejection: owner_key tamper" | clean |
| foreign kind (seal) | remove vault service first-line + parser kind guards | EXIT 1 | clean |
| foreign kind (read) | remove `externalMcpVaultRecord` + `authorize` kind checks | **survived** (EXIT 0): Jini `SecretsVaultService.get`→`find` refuses the kind first; redundant layer. Assertion liveness shown by test-expectation mutation (`context`→`invalid-record`) EXIT 1 | clean |
| byte-identity | static carry reseals (open+seal) | EXIT 1 "mcp-auth of static-http is byte-identical" rowid 6≠2 | clean |
| open counts | toView opens the OAuth hint twice | EXIT 1 | clean |
| gate 1 row | extra `findByServerId` in gate | EXIT 1 | clean |
| rollback: no recreation | delete+reinsert `static-http` server row | `ok:false` rowid 4≠2 | green EXIT 0 |
| rollback: untouched bytes | edit static envelope `updated_at` | `ok:false` | green EXIT 0 |
Restored-green full runs: `h0-mut-restored-green.txt`, `h0-mut2-restored-green.txt` EXIT 0.

### Gate (unmoved code)
| check | result | raw |
|---|---|---|
| new SQLite frozen test | 6/6, EXIT 0 | h0-final-frozen.txt |
| new PostgreSQL frozen test | 1/1, EXIT 0 | h0-final-frozen-pg.txt |
| BASELINE rollback | ok, EXIT 0 | h0-final-rollback.txt |
| T store/vocabulary (12 files) | 284/284, EXIT 0 = baseline | h0-t-store.txt |
| T accumulated nine (9 files) | 58/58, EXIT 0 = baseline | h0-t-nine.txt |
| Tovu main tsc | EXIT 0, 0 errors | h0-final-t-tsc.txt |
| Tovu typecheck:tests | EXIT 2, 13 errors = baseline set, 0 in new files | h0-final-t-tsc-tests.txt |
| eslint new files | 0 errors after one warning fix | h0-eslint-try1.txt |
| guard gate (Jini unchanged) | MATCHES BASELINE (exit 1; R2-deep-path + R10 only; HW +0) | j-guard-summary-h0.txt |
| XP gate | snapshot VERIFIED; check:cross-package EXIT 0 XP1–XP5 clean | j-xp-h0.txt |
| fixture hash | aca349ca… unchanged | h0-final-fixture-hash.txt |
Diff vs pin: only `A` files (7 under `features/external-mcp/__tests__/` + this report); no existing test/fixture M/D/R.

### PostgreSQL status
PostgreSQL 16 server binaries are present in the container (`/usr/lib/postgresql/16/bin`), contrary to the setup note. A scratch cluster (`/home/user/s5/h0/pg/data`, socket `/tmp/s5pg`, user postgres, PID 16820, stopped after the gate) ran the existing harness `platform/db/__tests__/parity/vault-read-parity.postgres.test.ts` + `access-choice.postgres.test.ts`: 20/20 pass (raw `h0-pg-harness.txt`). **G-mcp PostgreSQL replay: proven** — the frozen fixture's sealed bytes replayed into migrated Postgres, opened, refreshed under the lease, re-saved and reopened after reconnect (new pool) with untouched envelopes byte-identical. Not replayed on Postgres: tamper/foreign-kind/AAD/version/canary cases and the rollback script (SQLite only).

### S4 overlap
Files touched in H0: the 7 new files under T `features/external-mcp/__tests__/` and `cloud/reports/extract-s5.md`. None is in the S4-owned set (T `features/agent-plugins/**` connect files, bindings/registrations, J `agent-plugins/src/connect/**`); no shared manifests/lockfiles/changesets touched. Overlap: none.

### Findings (listed, not fixed)
- Foreign-kind read refusal is triple-layered (repo/vault-record, vault authorize, Jini vault find); Tovu-side removal is not observable.
- Baseline reseal writes mint a new vault id (and created_at) per rewrite; "ids preserved" holds for server rows/kinds/owner, not envelope ids.

### Pushed SHAs (Tovu cloud/extract-s5)
31504fd7c16adf756e313da7f3d8c77087630139, fde3156848329cd028e90843c190659ffbc231f1, b744f77cc5c17c55ac5100b4a7019b4cc9adc7c4, 06863b2da32287dafb17408d99affc3b1ced5301, plus this report commit (SHA in coordinator digest). Jini: none.
