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
| 06:36 | 26 | Baseline agent done (Tovu 55111a2e) + H0 done (Tovu tip 8c563ef5; Jini pin) — LAST GREEN PAIR Tovu 8c563ef5 / Jini 4044fe3c0 | ~515k (baseline 174k, H0 269k — H0 over 230k target, within cap) |
| 07:04 | 54 | H1a done — LAST GREEN PAIR Tovu 5162e3db / Jini 883db690 | ~805k (H1a 274k) |
| 07:34 | 84 | H1b done — LAST GREEN PAIR Tovu ddf430cc / Jini 07766d6e | ~1.10M (H1b 279k; >1.4x? no batch estimate exceeded in time) |
| 07:40 | 90 | H2a stopped after inventory (test-contract drift); coordinator ruling (c) | ~1.26M |
| 07:45 | 95 | Coordinator ruling (a) replaces ruling (c); H2a resumed | — |
| 08:00 | 110 | H2a items 2–5 landed — green for its gates Tovu 2c717cfb / Jini 183915bb | ~1.35–1.50M (H2a 150k first run, 255k resumed run) |
| 08:26 | 136 | H2b done (H2 gate green for H2b scope) — LAST GREEN PAIR Tovu f88953d8 / Jini 575b95e4 | ~1.60–1.75M (H2b 228k) |

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

## Coordinator decisions
- 06:36Z Baseline digest: T external-mcp-oauth-loopback-wiring.unit.test.ts case "../../../inbound/assistant/agent-daemon-server.ts: desktop accepts a loopback OAuth callback; hosted requires HTTPS" RED at unmodified pin (0 !== 1 createTovuOAuthHttpPorts calls). Coordinator verified: git grep at c3801c833 shows no call in agent-daemon-server.ts; Tovu's own cloud/reports/tests-tovu-site.md:1227 already records it as "unchanged obsolete daemon OAuth-port owner assertion ... full replacement ownership proof not completed" (pre-S5). DECISION: treated as NAMED PRIOR DEBT pinned to that exact case (not a stop): file must remain exactly 2/3 with the same single failing case and same assertion message at every gate; the app.ts and deps.ts cases are required-green. Not counted green. Flagged for owner/independent review: the brief says "Required baseline red means prior drift"; coordinator judged this documented, out-of-scope source-scan assertion as prior debt rather than a session stop.
- typecheck:tests 13 errors (brief expected 12): extra surface-connections.host-port.unit.test.ts(15,5) TS2322 from S3 commit 1ef11e22. Treated likewise as named prior debt; exact 13 set must not grow.

## H1a — inventory

Recorded before any production move (H1a builder, Tovu tip 8aef56e2, Jini pin 4044fe3c0). Source blobs at T pin c3801c833: `features/external-mcp/contracts.ts` e2f1d908 (539 lines), `contracts/core/external-mcp-auth.ts` 6418431c (77), `contracts/core/external-mcp-access.ts` 4f6fc1ba (165), `features/external-mcp/external-mcp-store.ts` 2bac5b32 (only the unconfigured error class); J `mcp/src/federation/adapter.http.ts` 63b935b2. Abbreviations: **CORE** = J `core/src/contracts/hosted-mcp` (types only, new independent subpath `@jini-ai/core/contracts/hosted-mcp`); **MCP** = J `mcp/src/federation/hosted` (new node subpath `@jini-ai/mcp/federation/hosted`); **INT** = J `integrations/src/api-connections/hosted-mcp/contracts.ts` (new node subpath `@jini-ai/integrations/api-connections/hosted-mcp`, types only); **T** = stays Tovu as re-export/alias shim with the same name. Runtime closure "type" = erased.

### contracts.ts (T features/external-mcp)
| Symbol | Lines | Kind | Runtime closure | Destination | Host vocabulary |
|---|---|---|---|---|---|
| header `/** External-MCP connection DTOs… */` | 4 | comment | — | stays T (file header of shim) | none |
| re-export `ExternalMcpAccessSnapshot` | 1–2 | type re-export | type | T keeps line; type now from CORE via access shim | none |
| `SUPPORTED_EXTERNAL_MCP_TRANSPORTS` + doc | 11–20 | const tuple | none | MCP `vocabulary.ts` (`satisfies readonly ExternalMcpTransport[]`) | `"stdio"`,`"streamable_http"`: MCP protocol transport names (neutral protocol). Doc names T-era file paths (`mcp-federation/…`) — comment provenance, kept byte-exact |
| `ExternalMcpTransport` | 22 | type (typeof) | type | CORE literal union `"stdio" \| "streamable_http"` (R5/R6) | same |
| `EXTERNAL_MCP_OAUTH_GRANTS` + doc | 24–26 | const tuple | none | MCP `vocabulary.ts` | RFC 6749/8628 grant names (neutral protocol) |
| `ExternalMcpOAuthGrant` | 28 | type | type | CORE literal union | same |
| `ExternalMcpServerRecord` | 30–102 | interface (28 fields) | type | CORE (`SealedSecret` from core vault; `UUID`/`ISODateTime` core primitives). Field types unchanged (`transport`/`authMode`/`oauthGrant`/`oauthStatus` stay `string`, persisted format) | column docs cite `schema.sqlite.ts`, `trust.ts`, `external-mcp-oauth.ts` (comment provenance only). Saved-row format = persisted, not injected |
| `ExternalMcpAccessUpdate` | 104–112 | interface | type | CORE | none |
| `ExternalMcpServerRepoPort` (6 methods) | 114–144 | interface | type | CORE | "ADR-007" comment only |
| floating doc "decrypted, validated domain shape" | 146 | comment | — | CORE, kept before target doc | none |
| `ExternalMcpServerTarget` | 147–180 | union | type | CORE; line 179 `import("@jini-ai/mcp/federation").McpBearerTokenSupplier` → core `McpBearerTokenSupplier` | `Authorization: Bearer` (HTTP protocol) |
| `ExternalMcpServerConfig` | 182–199 | interface | type | CORE | none |
| `ExternalMcpOAuthView` | 201–217 | interface | type | CORE | comment cites `routes/admin/system/deployment-overview.ts` (provenance only) |
| `ExternalMcpServerView` | 219–250 | interface | type | CORE as `ExternalMcpServerView<TokenHint = never>`; T alias `= ExternalMcpServerView<CredentialTokenHint>` (host hint type stays host input; no platform type in core) | `CredentialTokenHint` = host/platform type → injected type parameter |
| `ExternalMcpStoreDeps` | 252–257 | interface | type | CORE (`KeyringPort`/`SecretSealerPort` core vault — platform's are `export type *` of the same core module; `Clock` core primitives) | none |
| `ExternalMcpOAuthTokenResolverPort` | 259–276 | interface | type | CORE | comment cites `src/platform/oauth/` (provenance) |
| `SaveExternalMcpOAuthInput` | 278–303 | interface | type | CORE | none |
| `SaveExternalMcpServerInput` | 305–355 | interface | type | CORE | comments cite `features/agent-plugins/federate-mcp.ts`, `external_mcp_save`, `getAuthedPrincipal(res)`, C-006 (provenance only; no runtime literal) |
| `ExternalMcpSealedOAuthPayload` | 357–372 | interface | type | CORE | sealed payload v1 member names = persisted format (byte-identical JSON keys) |
| floating doc "Seals an OAuth payload…" + `SealedExternalMcpOAuth` | 374–393 | comment + interface | type | CORE | none |
| `DeviceAuthorizationStore` + doc | 395–412 | interface | type | INT (`DeviceAuthorization` from core/contracts/oauth) | doc cites `platform/db/repos/oauth-pending-store.ts`, `content.db`, ADR-058/006 (provenance only) |
| `ExternalMcpOAuthDeps` | 414–434 | interface | type | INT as `ExternalMcpOAuthDeps<Shared = never>`: `shared?: Shared` is the narrow host port (T alias binds `SharedExternalMcpOwner`); repo/sealer/keyring/clock/devices/httpPorts/providers/lookupProvider/onConnected from CORE + core/contracts/oauth | `SharedExternalMcpOwner` (T shared-owner/project-keys) = host input via type parameter; `onConnected` callback = host input (composition keeps binding `apply-connect-defaults`) |
| `ExternalMcpAuthorizationStart`/`ExternalMcpDeviceStart`/`ExternalMcpConnectStart` | 436–454 | interfaces/union | type | CORE (connect-start, per brief list) | `"redirect_required"`/`"device_code"` discriminants (protocol/wire shape) |
| `ExternalMcpOAuthService` | 456–528 | interface | type | INT (`AuthorizationCallbackParams` core/contracts/oauth; `ExternalMcpConnectStart`/`ExternalMcpOAuthTokenResolverPort` CORE) | `delivery?: "hosted"`, `destination?: "shared"` wire literals (unchanged signature). Doc line 468 names the host env var `TOVU_PUBLIC_URL` and tool `external_mcp_oauth_connect` → N1 (`/tovu/i`) will reject the env name in J: reword only if guard reports N1, record before/after |
| `ExternalMcpRevocationReason` | 530–539 | union | type | CORE | seven reason literals = persisted/test-pinned D3 message keys (neutral) |

**OAuth half boundary confirmed:** INT gets 395–434 (device store + deps) and 456–528 (service). 436–454 (connect-start) goes to CORE as the brief's type list names it; 530–539 (revocation reason) goes to CORE. 1–29 / 30–393 types to CORE, values to MCP.

### external-mcp-auth.ts (T contracts/core) — whole-file values → MCP `auth.ts`, types → CORE
| Symbol | Lines | Kind | Runtime closure | Destination | Host vocabulary |
|---|---|---|---|---|---|
| file header + `@file` doc | 3–13 | comment | — | MCP `auth.ts` byte-exact (cites T-era paths: provenance) | none |
| `EXTERNAL_MCP_AUTH_MODES` | 15–24 | const | none | MCP | `none`/`static_env`/`oauth` = persisted `auth_mode` values |
| `ExternalMcpAuthMode` | 25 | type | type | CORE literal union | same |
| `resolveExternalMcpAuthMode` | 27–40 | fn | MODES | MCP | default `static_env` = persisted-format compatibility rule |
| `externalMcpRecordHasStaticAccessToken` | 42–54 | fn | resolve fn; `SealedSecret` type → core vault | MCP | none |
| `EXTERNAL_MCP_OAUTH_STATUSES` | 56–66 | const | none | MCP | persisted `oauth_status` values |
| `ExternalMcpOAuthStatus` | 68 | type | type | CORE literal union | same |
| `resolveExternalMcpOAuthStatus` | 70–77 | fn | STATUSES | MCP | default `disconnected` |

### external-mcp-access.ts (T contracts/core) — split
| Symbol | Lines | Kind | Runtime closure | Destination | Host vocabulary |
|---|---|---|---|---|---|
| header | 1–2 | comment | — | MCP `access.ts` | none |
| `ExternalMcpAccessSnapshot` | 7–16 | interface | type | CORE | none |
| `ExternalMcpApprovedAccess` | 18–25 | interface | type | CORE | none |
| `ExternalMcpAdmissionSource` (private) | 27–37 | interface | type | MCP `access.ts`, module-local (signature closure of revision fn) | none |
| `ExternalMcpAccessRecord` (private) | 39 | type | type | MCP `access.ts`, module-local | none |
| `ExternalMcpValidationError` | 41–54 | class | Error | MCP `validation-error.ts` (one class per module; `name` = `"ExternalMcpValidationError"`, `field`) — error identity | class name string = error identity, kept |
| `MAX_ALLOWED_TOOLS` (private) | 56 | const 64 | none | MCP `access.ts` | MCP tool cap (protocol-side admission limit) |
| `REMOTE_TOOL_NAME_PATTERN` (private) | 57–60 | regex | none | MCP `access.ts` | mirrors J `federation/trust.ts` pattern (same package now) |
| `parseExternalMcpJsonArray` | 61–72 | fn | JSON, `ToolInputError` (@jini-ai/core) | MCP | strict message "The plugin connection has an unreadable tool list. Save its tool list again before enabling it." — Jini agent-plugin vocabulary, no product/path/permission/id; justified neutral (listed for review) |
| `externalMcpAdmissionRevision` | 74–120 | fn | `node:crypto` createHash sha256 | MCP (node entry) | revision = sha256(JSON) bytes, persisted/compared format |
| `externalMcpAccessSnapshot` | 122–131 | fn | revision fn | MCP | none |
| `readExternalMcpToolGrants` | 133–145 | fn | parse fn | MCP | none |
| `validateExternalMcpToolNames` | 147–164 | fn | ValidationError, cap, pattern | MCP | messages "at most 64 tools are supported" / "'…' is not a valid MCP tool name, so the trust tier would refuse it on connect" — neutral (Jini trust tier) |

### Other
| Symbol | Source | Destination | Notes |
|---|---|---|---|
| `ExternalMcpSecretStoreUnconfiguredError` | T external-mcp-store.ts:64–71 (class + doc) | MCP `unconfigured-error.ts` (one class per module); store re-exports same identity | name string = error identity. Store algorithms stay (H1b) |
| `hostedMcpProjections` | new; composes the six functions T `agent-plugins/mcp-host-bindings.ts:8–12` binds (`accessSnapshot, admissionRevision, readToolGrants, validateToolNames, oauthStatus, hasStaticAccessToken`) | MCP `projections.ts` | pure object of the moved functions; no I/O/state. T bindings (S4-owned) not edited: they keep their own object over the same (now re-exported) function identities |
| `McpBearerTokenSupplier` | J mcp/src/federation/adapter.http.ts:123–124 (cite :124 correct) | CORE; adapter.http.ts re-exports the core type (config.ts/stdio import unchanged) | none |
| T consumers | `service-ports.ts`, `mcp-host-bindings.ts`, connect files, `composition/agent-plugin-service-ports.ts`, routes, repos, store, oauth | unchanged: old paths keep every name via re-exports/aliases | S4-owned files NOT edited |

**Not moved (stay T):** store/memory/vault/revocation algorithms (H1b), SQL repo, routes, `CredentialTokenHint`/`SharedExternalMcpOwner` (host types, bound by T aliases).

## H1a

Builder: H1a subagent. Programmer skills file (`Jini AI-Dev-Shop/agents/programmer/skills.md`) loaded. Starting pair Tovu 8aef56e2 / Jini 4044fe3c0; H0 last green Tovu 8c563ef5 / Jini 4044fe3c0.

### Inventory resolution
Every row in "## H1a — inventory" resolved as recorded, with no deviations. Types are in **CORE** `@jini-ai/core/contracts/hosted-mcp` (`contracts/hosted-mcp.ts` → `hosted-mcp/{vocabulary,record,config}.ts`). Values are in **MCP** `@jini-ai/mcp/federation/hosted` (`federation/hosted/{vocabulary,auth,access,validation-error,unconfigured-error,projections,index}.ts`). Sign-in types are in **INT** `@jini-ai/integrations/api-connections/hosted-mcp` (`contracts.ts` + `index.ts`). Literal unions follow R5/R6 (no `typeof` of a runtime constant in core). In the type-pin test, tuples and unions are pinned equal in both directions. Host types are injected as type parameters: `ExternalMcpServerView<TokenHint = never>` and `ExternalMcpOAuthDeps<Shared = never>`. The Tovu aliases bind `CredentialTokenHint` / `SharedExternalMcpOwner`. Store algorithms did not move. The only store edit replaces the unconfigured class with an import and re-export of the same identity.

### Provenance / comment custody
Moved lines are byte-sliced from T c3801c833 blobs contracts.ts e2f1d908, external-mcp-auth.ts 6418431c, external-mcp-access.ts 4f6fc1ba, external-mcp-store.ts 2bac5b32 (64–71), and J adapter.http.ts 63b935b2 (123–124). No retyping. Check `raw/h1a-provenance.txt` covered 733 non-blank source lines. 11 lines are not byte-exact, all intentional:
- contracts.ts:179 bearer `import("@jini-ai/mcp/federation")…` → core `McpBearerTokenSupplier`. :220/:245/:246 View gains `<TokenHint = never>` and `CredentialTokenHint`→`TokenHint`. :414/:416 Deps gains `<Shared = never>` and `shared?: Shared`. auth.ts:25/:68 `typeof` types → core literal unions. Lines 22 and 28 of contracts.ts were replaced the same way.
- access.ts:62: `{ strict?: boolean }` → `{ strict?: boolean | undefined }`. This is needed for Jini `exactOptionalPropertyTypes`. It was a red build (TS2379 at access.ts 113/114) that I fixed and rebuilt green. The parameter only widens, and runtime is identical.
- **N1 rewordings (real guard rejection `N1-consumer-identity /tovu/i`, `raw/j-guard-h1a.txt` first run):**
  - contracts.ts:468: "EVERY grant whenever \`TOVU_PUBLIC_URL\` was unset" → "EVERY grant whenever the host's public-URL setting was unset".
  - external-mcp-auth.ts:21: "\`oauth\` — Tovu holds a token" → "\`oauth\` — the host holds a token".
  - Two new agent notes of mine also named Tovu. I reworded them to "for example the platform `CredentialTokenHint`" and "for example a desktop shared-owner storage type".

### Exports added
- core `./contracts/hosted-mcp` (universal, types-only).
- mcp `./federation/hosted` (node).
- integrations `./api-connections/hosted-mcp` (node, types-only).
- Each is in both `exports` and `jini.entries`.
- `McpBearerTokenSupplier` moved to core. `@jini-ai/mcp/federation` re-exports it under the same name, and config.ts and stdio are unchanged.
- Changesets: `.changeset/s5-h1a-{core,mcp,integrations}.md`.
- No lockfile edits. No new dependency: the mcp and integrations closures import only `@jini-ai/core` (+ `node:crypto`).

### @agent-notes in emitted .d.ts
Each note is a separate JSDoc block attached directly to the declaration, after the original doc. Counts match source and dist: core 36/36, mcp 17/17, integrations 14/14. All 68 are present in the final dist `.d.ts`. They cover:
- every exported type, function, const and class;
- every repository-port method and every sign-in service and device-store method;
- who fulfills the contract, same-instance rules, CAS/ordering, saved formats and error identity.

### New tests (new files only; existing tests frozen — `git diff --name-status` shows no M/D/R under any __tests__)
- T `features/external-mcp/__tests__/h1a/hosted-mcp-type-pins.test.ts`: 39 pins of `Equal` + keyof equality + two-way assignability.
  - Pinned against both core and the T aliases: record, snapshot, approved access, access update, save, save-oauth, view, oauth view, bearer (core and mcp re-export), target, config, sealed payload, sealed oauth, connect-start, revocation, the 4 unions vs literals and vs runtime tuples, and repo/service/deps/device-store key sets plus core↔T↔INT identity.
  - A second-host case binds its own hint and shared types.
  - Mutation evidence: changing `aadVersion` to string and dropping a device-store key gave 6 TS errors (`raw/h1a-t-tsc-newtests-mutation.txt`). Restored green (EXIT 0).
- T `…/h1a/hosted-mcp-projections.test.ts` + `fixtures/projection-baseline.ts`: all 6 projection outputs + 3 revision hashes are pinned to `BASELINE`.
  - `BASELINE` was captured once from the unmodified c3801c833 functions in `/home/user/s5/base/Tovu` before any edit (`raw/h1a-baseline-projections.json`).
  - Pinned through the T shims, through `hostedMcpProjections` from the public entry, and through function identity with the existing `agentPluginMcpProjections`.
- T `…/h1a/hosted-mcp-error-identity.test.ts`:
  - access shim / store export / entry are the same class objects;
  - instanceof, name and field survive;
  - `classifyAgentPluginMcpError` → validation/unconfigured;
  - `isAgentPluginSignInRefusal` recognizes the canonical validation error;
  - a same-named lookalike is `other` and not a refusal.
  - The baseline class has no `code`, and none was added (asserted).
- J `mcp/src/federation/hosted/__tests__/hosted-entry.test.ts` (4): same baseline outputs through the entry, members are the exact functions, saved literals, one class per error.
- J `examples/neutral-host/src/hosted-mcp-contracts.test.ts` (1): a second host fulfills the core repo, device store and deps with its own ids, paths and identity. It resolves only core contracts and the INT type entry.
- Scratch isolated consumer `/home/user/s5/scratch/h1a-consumer` (untracked):
  - `node_modules` holds only a core symlink plus copies of `package.json` and the hosted dist subtree for mcp and integrations.
  - strict `nodenext` + `skipLibCheck:false` tsc: EXIT 0. Plain node run: EXIT 0.
  - Negative control: `import("@jini-ai/mcp/federation")` → ERR_MODULE_NOT_FOUND (`raw/h1a-final-consumer-*.txt`, `raw/h1a-consumer-run.txt`).

### Gate (final tip: Tovu 5162e3db + this report, Jini 883db690; raw under /home/user/s5/raw/)
| Gate | Result | Raw |
|---|---|---|
| H0 frozen SQLite (S5_FROZEN_DB_OUT) | 6/6, EXIT 0 | h1a-h0-frozen.txt |
| H0 BASELINE rollback | ok:true, 5 checks, EXIT 0 | h1a-h0-rollback.txt |
| H0 PostgreSQL replay (optional) | 1/1, EXIT 0; server PID 24407 started and stopped by me (no postmaster.pid left) | h1a-h0-pg.txt |
| Fixture sha / tool-metadata sha / all baseline hashes | aca349ca… / a0d6b428… / `sha256sum -c` OK (T and J) | — |
| T store/vocabulary (12 files) | 284/284 EXIT 0 (gate run and final rerun) | h1a-t-store.txt, h1a-final-t-store.txt |
| T sign-in/gate | 141/142 EXIT 1. The only failure is the named prior-debt case, "../../../inbound/assistant/agent-daemon-server.ts: desktop accepts a loopback OAuth callback; hosted requires HTTPS", with the same message "must have one OAuth ports call" 0 !== 1. Unchanged from baseline; not counted green | h1a-final-t-signin.txt |
| T connect | 147/147 EXIT 0 | h1a-final-t-connect.txt |
| T accumulated nine | 58/58 EXIT 0 | h1a-final-t-nine.txt |
| T new H1a tests | 9/9 EXIT 0. First run 8/9: my own miscount, 39 vs 40 → fixed and rerun | h1a-t-new.txt |
| J build core/mcp/integrations | EXIT 0 (mcp first red TS2379 → fixed) | h1a-build-*.txt |
| J `exec tsc --noEmit` core/mcp/integrations | 0/0/0 | h1a-j-tsc-*.txt |
| J mcp full vitest (adapter.http changed) | 91 files / 1563 tests pass | h1a-j-mcp-all.txt |
| J API group (integrations) | 20 files / 365 pass (= baseline) | h1a-j-api.txt |
| J mcp hosted entry test / neutral-host (new + api-host-moves) / neutral-host tsc | 4/4; 3/3; EXIT 0 | h1a-final-j-*.txt |
| Relink + T main tsc | EXIT 0, 0 errors | h1a-final-t-tsc.txt |
| T typecheck:tests | EXIT 2, exactly the 13 baseline errors (set diff empty) | h1a-final-t-tsc-tests.txt |
| guard-gate.sh | First run: DIFFERS (3× N1, see rewordings) → fixed → MATCHES BASELINE twice. Final: exit 1 TOTAL 2 (R2-deep-path, R10-chatpane), HW1:17 HW2:16 HW3:135 HW4:1 HW8:49, others 0. Plugins clean. layers 0, isolation 0, audit findings 16 (c9/d7). Closures 573→576 from the 3 new entries | h1a-final-guard-gate-summary.txt, j-guard-h1a-final.txt |
| xp-gate.sh | snapshot VERIFIED; XP1–XP5 clean, EXIT 0 | h1a-final-xp-gate-summary.txt |
| Strict lint, changed production (`--no-inline-config`, complexity/cognitive 10) | J: first run 1 warning (unused `ISODateTime`, mine) → fixed → EXIT 0. T shims clean. T store's only error, `resolveExternalMcpAccessToken` complexity 11, is identical at baseline (line 514 at pin, 509 now) = prior. Biome on new tests: 1 `useImportType` (mine) fixed. Store biome warnings identical to baseline | h1a-j-lint-rerun.txt, h1a-t-lint*.txt, h1a-t-biome*.txt |
| Emitted closure inspection | 26 files (`.js`/`.d.ts`) across the three new entries: 0 product hits (tovu/open design/higgsfield). Non-core `@jini-ai` import/ImportType/require/re-export specifiers: **0**. The only non-core names appear in agent-note prose ("usually from `@jini-ai/mcp/…`"), as in the existing core contracts | — |

### S4 overlap
Every changed path, compared against the S4-owned set (T `features/agent-plugins/{federate-mcp,enable-access,apply-connect-defaults,switch-on-saved-token,connection-status,service-ports,plugin-host,connect-tool,access-token-tool,connect-card-ui,connect-destination,connect-sign-in-wait,grant-signed-in-defaults,token-sign-in,import-access-token,apply-tool-renames}.ts`, bindings/registrations, J `agent-plugins/src/connect/**`):
- T: `contracts/core/external-mcp-{auth,access}.ts`, `features/external-mcp/{contracts,external-mcp-store}.ts`, 4 new files under `features/external-mcp/__tests__/h1a/`, and the report.
- J: core, mcp and integrations `package.json`; new files under `core/src/contracts/hosted-mcp*`, `mcp/src/federation/hosted/**` and `integrations/src/api-connections/hosted-mcp/**`; `mcp/src/federation/adapter.http.ts`; 3 new changesets; 1 new `examples/neutral-host` test.
- **No S4-owned file was touched.** `service-ports.ts`, `mcp-host-bindings.ts`, the connect files and `composition/agent-plugin-service-ports.ts` are unedited. They resolve through the old paths with the same identities, which the error-identity test proves.
- Shared-manifest risk for the integrator: `packages/{core,mcp,integrations}/package.json` `exports`/`jini.entries`. These are additive insertions next to `./contracts/content-types`, `./federation/testing` and `./api-connections`. If S4 adds entries at the same anchors, expect a trivial textual merge. Changeset names are unique (`s5-h1a-*`).

### Lines
- J production: 14 files, +890/−2 (mostly moved text plus notes).
- T production: −784/+32 across the 4 shims.
- New tests: T 228 lines, J 122 lines.

### Findings (listed, not fixed)
- Pre-existing complexity 11 in T `resolveExternalMcpAccessToken` (store; H1b moves it and will meet the <11 rule).
- `parseExternalMcpJsonArray`'s strict ToolInputError text ("The plugin connection has an unreadable tool list…") moved as neutral engine wording. A reviewer may prefer it as host input; it is pinned in the baseline either way.
- The agent notes in core contracts name `@jini-ai/mcp`/`@jini-ai/integrations` in prose (existing convention).

### Pushed SHAs
- Jini cloud/extract-s5: 27063efcc7c0327f517429812e167174d1a80448, 0b7183c3afe92f9e685d27b744739a79ab328b10, 60f593071fbec15fda1ada9b3df886ba6c20e14c, 883db6908a72947b81fe7c9ce6000893bdf1e4bb.
- Tovu cloud/extract-s5: 1472d1c26ea74c8ab2a2d4258dde6c926906c401 (inventory), 9355bd8caa68ef6ee928f2a917debddc6c98e967, d075d1e44528f6d2651022473f89321f694b8be7, 5162e3db150286cd8806bd780e18bfcbfe445afe, plus this report commit.

**LAST GREEN PAIR: Tovu 5162e3db150286cd8806bd780e18bfcbfe445afe (tested source; the report commit adds only this file) / Jini 883db6908a72947b81fe7c9ce6000893bdf1e4bb.**

## H1b — inventory

Recorded before any production move (H1b builder, Tovu tip 559cbb43, Jini tip 883db690). Source blobs (T `features/external-mcp/`): `external-mcp-store.ts` 23042de1 (1652 lines; pin c3801c833 blob 2bac5b32, differs only at H1a's lines 64–66), `external-mcp-store.memory.ts` 87595f9e (163), `external-mcp-vault.ts` 5d77eda7 (114), `external-mcp-revocation.ts` 8b806a7b (129). **HOSTED** = J `mcp/src/federation/hosted/` (node subpath `@jini-ai/mcp/federation/hosted`, H1a). **PORT** = injected host port, typed in new HOSTED `store-ports.ts` from core contracts (`@jini-ai/core/contracts/vault`, `/hosted-mcp`) only. **T** = stays Tovu (old path becomes a thin bound wrapper with the same names/signatures). Runtime closure "type" = erased. Vocabulary column: `—` = none; otherwise the literal and its resolution.

### external-mcp-vault.ts → HOSTED `vault.ts` (the ONE envelope module)
| symbol | line | closure | destination | host vocabulary |
|---|---|---|---|---|
| imports `randomUUID` | 1 | node:crypto | HOSTED (node entry) | — |
| imports `InMemoryVaultRepo`, `SecretsVaultService`, `VaultError` (platform values) | 2 | @jini-ai/platform | **PORT** `vault.createMemoryRepo()`, `vault.createService(deps)`, `vaultErrors.create({code})` (T binds the real constructors once) | — |
| imports `VaultMeta`, `VaultRecord`, `VaultRepoPort` (types) | 2–3 | type | core `@jini-ai/core/contracts/vault` | — |
| imports `KeyringPort`, `SealedSecret`, `SecretSealerPort` | 4 | type | core `contracts/vault` | — |
| imports `createTovuVaultKinds` | 5 | T platform/secrets/vault-kinds | **PORT** `metaParsers({validateMeta})` → `VaultMetaParsers`. T binds `createTovuVaultKinds({policy:{validateMeta, legacyPublishCredential:()=>undefined, tokenField:()=>undefined}}).metaParsers` (the two stubs are host-registry fields, moved byte-exact into the T binding) | `createTovuVaultKinds` name = host; injected |
| `Identity` type | 7 | type | HOSTED | — |
| `Kind` = `"mcp-env"\|"mcp-auth"` | 8 | type | HOSTED | saved vault kinds (persisted AAD/format: core `VaultKind` members) — neutral persisted format |
| `contextKey` Symbol("external-mcp-vault-context") | 9 | value | HOSTED, private; the single instance the SQL repo/memory repo/store/shims all reach | description string is debug-only, never persisted |
| `stagedKey` Symbol("external-mcp-staged") | 10 | value | HOSTED, private, single instance | same |
| `Envelope` type | 11 | type | HOSTED | — |
| `externalMcpVaultEnvelope` | 15 | pure | HOSTED, unchanged signature | — |
| `externalMcpVaultRecord` | 22 | throws `VaultError` ×2 (26, 29) | HOSTED; both throws → `vaultErrors.create({code:"context"})`; required object gains `vaultErrors` | — |
| `service` (private) | 33 | `VaultError` ×2 (37, 40), `createTovuVaultKinds`, `SecretsVaultService`, `randomUUID`, `Date` | HOSTED; 37/40 → `vaultErrors.create`; metadata policy (validateMeta foreign-kind refusal) and `authorize` stay byte-exact in HOSTED, same order; foreign kind refused (line 37) before the parser factory or any crypto runs; `now`/`newId` unchanged (`new Date().toISOString()`, `randomUUID()`) | — |
| `sealExternalMcpVaultPayload` | 54 | `InMemoryVaultRepo` (60), `VaultError` (64) | HOSTED; memory repo via `vault.createMemoryRepo()`; 64 → factory; id generated at the same point (before put) | — |
| `openExternalMcpVaultPayload` | 71 | `InMemoryVaultRepo` (76), `VaultError` (79, 84) | HOSTED; 79/84 → factory; fail-closed seal/keyring ports unchanged | — |
| `persistExternalMcpVaultEnvelope` | 91 | `VaultError` (99, 102) | HOSTED; 99/102 → factory; carried-envelope JSON equality unchanged | — |
| `deleteExternalMcpVaultEnvelope` | 108 | repo only | HOSTED unchanged | — |
All ten constructions 26, 29, 37, 40, 47, 64, 79, 84, 99, 102 are `new VaultError({ code })` (47 is the validateMeta policy refusal) → `vaultErrors.create({ code })`. `classifyVaultError`: **not referenced** by any of the four files (nor defined in T/J platform) → not added (smallest change). `aad.format`: AAD is built only inside the injected vault service (`buildVaultAad`); none of the four files formats AAD → not added.

### external-mcp-store.memory.ts → HOSTED `store.memory.ts`
| symbol | line | closure | destination | vocabulary |
|---|---|---|---|---|
| `isDeepStrictEqual` | 1 | node:util | HOSTED | — |
| `InMemoryVaultRepo` value / `VaultRecord` type | 2 | platform | **PORT** `vault.createMemoryRepo()` (the `stage` construction, line 60); type → core `VaultRecord`/`VaultRepoPort` | — |
| `SealedSecret` | 3 | type | core | — |
| vault envelope fns | 4 | HOSTED vault.ts | relative import of the same module | — |
| `ISODateTime`, `UUID` | 5 | type | core primitives | — |
| `externalMcpAccessSnapshot` | 7 | HOSTED access.ts (H1a) | relative | — |
| repo/record/access-update types | 8 | type | core `contracts/hosted-mcp` | — |
| `keyOf`, `EnvelopeKind`, `ENVELOPE_FIELDS`, `EnvelopeField`, `storedEnvelopes`, `envelopeAt` | 24–45 | pure/vault | HOSTED; `storedEnvelopes` passes `vaultErrors` to `externalMcpVaultRecord` | field names `sealedEnv`/`sealedOAuth` = core record fields |
| `InMemoryExternalMcpServerRepo` + members (rows, vaults, pending, write, stage, hydrate, listByWorkspaceId, findByServerId, upsert, updateAccessIfCurrent, deleteByServerId, tryClaimOAuthRefreshLease, releaseOAuthRefreshLease) | 47–162 | — | HOSTED; constructor gains required `({vault, vaultErrors})`; T subclass keeps `new InMemoryExternalMcpServerRepo()` binding the T ports once | — |

### external-mcp-revocation.ts → HOSTED `revocation.ts` (decision + class), messages stay T
| symbol | line | closure | destination | vocabulary |
|---|---|---|---|---|
| `ExternalMcpRevocationReason` | 23 | type | core (H1a) | reason literals = neutral protocol |
| `ToolInputError` | 24 | @jini-ai/core | HOSTED | — |
| admission revision / grants | 26 | HOSTED access.ts | relative | — |
| oauth status / auth mode | 27–28 | HOSTED auth.ts | relative | — |
| `FederatedCallTarget`, `refusalForAdmittedToolUnderCurrentGrants` | 30–31 | same package `../` | relative | — |
| `RevocationMessageInput` | 34 | type | HOSTED (exported as `ExternalMcpRevocationMessageInput`) | — |
| `REVOCATION_MESSAGES` + its doc comment | 41–62 | value | **T** (host input): every string names the host settings path "Integrations → External MCP" and "the assistant" | model-facing product wording → injected as `messages` |
| `revocationMessage` | 64 | — | HOSTED, reads injected `messages` | — |
| `ExternalMcpConnectionRevokedError` | 74 | ToolInputError | HOSTED; constructor `(input & {messages})`; T subclass keeps `new ExternalMcpConnectionRevokedError(input)` binding `REVOCATION_MESSAGES`; `code` "EXTERNAL_MCP_CONNECTION_REVOKED"/name/retryable unchanged | error code = neutral persisted identity |
| `isOAuthDisconnected`, `grantRefusalFor`, `rosterRefusalFor` | 91, 100, 122 | pure | HOSTED unchanged | — |

### external-mcp-store.ts → HOSTED `store.ts`
Imports: access/auth values (1–2, 4, 56) → relative HOSTED `access.js`/`auth.js`/`vocabulary.js` (H1a); `ToolInputError` (3) core; `SUPPORTED_EXTERNAL_MCP_TRANSPORTS`, `EXTERNAL_MCP_OAUTH_GRANTS` (46) → HOSTED vocabulary.ts; record types (47) → core `contracts/hosted-mcp`; `nowIso`/`ISODateTime`/`UUID` (50) core primitives; `SealedSecret`/`SecretSealerPort` (52, T webhooks re-export) → core `contracts/vault`; `FEDERATED_CONNECTION_DEFAULTS`, `ResolvedFederatedConnection`, `McpLaunchSpec`, `assertValidConnectionId` (53–55) → same package relative `../`; unconfigured error (65) relative; vault fns (72) relative vault.ts.

**credential-token.ts (48) — each read becomes a PORT row** (T binds the real `contracts/core/credential-token.ts` exports once):
| dependency | store lines | port |
|---|---|---|
| `assertCredentialFreeField` | 1550 | `assertFreeField(required)` (top level; T binds the application-key detector wrapper) |
| `normalizeCredentialToken` | 1440, 1450 | `credential.normalize(required)` |
| `assertCredentialToken` | 614 | `credential.assert(required)` |
| `credentialTokenHint` / `CredentialTokenHint` | 380, 385, 391, 396 | `credential.hint({token})` → `HostedMcpTokenHint` = `{length:number; last4:string\|null}` (structurally = platform `CredentialTokenHint`) |
| `CREDENTIAL_MESSAGES` (.env .ascii .storage .blank .url) | 192, 199, 200, 615, 1186, 1198, 1227, 1372 | `credential.messages` (only those 5 keys) |
| `CREDENTIAL_TOKEN_LIMIT` | 183, 194 | `credential.limit` |
| `CredentialInputError` (`instanceof`) | 615, 1442, 1452, 1552 | `credential.InputError` (constructor reference; same `instanceof` semantics) |

**Store symbols (all → HOSTED `store.ts` unless stated):** `EXTERNAL_MCP_VAULT_VERSION` 70 (saved format 1), `ExternalMcpIdentity` 71, `MAX_SERVERS_PER_WORKSPACE` 74, `MAX_ENV_VARS` 75, `MAX_ARGS` 76, `ENV_NAME_PATTERN` 79, `MAX_OAUTH_SCOPES` 81, `MAX_OAUTH_FIELD_LENGTH` 84, `OAUTH_PROVIDER_ID_PATTERN` 87, `parseJsonObject` 92, `applyExternalMcpAccess` 107, `parseEnvLine` 141, `parseEnvBlock` 164 (+credential), `assertJsonEnvEntry` 191 (+credential), `parseJsonEnvBlock` 197 (+credential), `parseArgs` 223, `readBareArg` 242, `readQuotedArg` 250, `parseToolNameList` 275, `parseAllowedToolNames` 291 (**unchanged**), `parseWriteAllowedToolNames` 305, `assertWriteAllowlistSubset` 318, `toolNameSetsEqual` 335, `externalMcpRecordHasStoredToken` 372, `externalMcpEnvHints` 379, `externalMcpAccessTokenHint` 390, `toView` 402, `listExternalMcpServerViews` 445, `openExternalMcpEnv` 469, `oauthStatusFailure` 490, `resolveExternalMcpAccessToken` 509 (prior complexity 11), `externalMcpFailure` 534, `resolveStdioTarget` 546, `resolveHttpTarget` 582, `hostedTokenFailure` 613 (+credential), `withStaticAccessToken` 627, `openExternalMcpStaticAccessToken` 645, `resolveExternalMcpConfig` 661, `readEnabledExternalMcpConfigs` 703, `toResolvedFederatedConnections` 733, `toFederatedLaunchSpec` 759, `assertValidExternalMcpServerId` 788, `assertSupportedExternalMcpTransport` 796, `resolveSavedAuthMode` 808, `parseOAuthScopes` 828, `buildOAuthEndpoints` 838, `oauthBindingFingerprint` 863, `ResolvedOAuthFields` 876, `NO_OAUTH_FIELDS` 899, `firstTrimmed` 919, `assertOAuthGrant` 943, `assertOAuthClientId` 971, `resolveOAuthEndpoints` 1002, `DYNAMIC_REGISTRATION_ENDPOINT_KEYS` 1017 (saved endpoint keys), `assertOAuthProviderIdentity` 1025, `resolveOAuthProviderIdentity` 1040, `resolveOAuthTokenEnvName` 1064, `resolveSavedOAuthScopes` 1089, `resolveOAuthFields` 1094, `assertNonEmptyExternalMcpCommand` 1120, `assertUnderExternalMcpServerCap` 1131, `carryForwardExternalMcpSealedEnv` 1158, `sealFreshExternalMcpEnv` 1172, `resolveExternalMcpSealedEnv` 1191, `LOOPBACK_HOSTNAMES` 1205 (neutral protocol), `assertSafeRemoteMcpUrl` 1218, `resolveTransportTarget` 1240, `carryOAuthRuntimeState` 1259, `EXTERNAL_MCP_OAUTH_PAYLOAD_VERSION` 1300 (saved format), `hydrateExternalMcpOAuthPayload` 1315, `openExternalMcpOAuthPayload` 1338, `sealExternalMcpOAuthPayload` 1356, `resolveSealedOAuthBlob` 1386, `resolveWriteGrantAttribution` 1422, `normalizeOAuthClientSecret` 1439, `normalizeExternalMcpAccessToken` 1447, `resolveSealedStaticAccessToken` 1469, `resolveStaticAccessTokenEnvName` 1494, `resolveSavedCredentialColumns` 1525, `assertExternalMcpPlainField` 1549, `assertExternalMcpPlainInput` 1557, `saveExternalMcpServer` 1566, `deleteExternalMcpServer` 1646. Re-exports at 2 and 66 stay in the T shim (same identities).

**Host vocabulary in the store:**
| literal | lines | resolution |
|---|---|---|
| "Settings → External MCP" inside model/admission-facing reasons | 479, 494, 496, 516, 528, 529, 607, 655 | **PORT** `settingsLink` (string), interpolated at the same place; T binds `"Settings → External MCP"` so bytes are identical |
| "site credential store", "this site" | 479, 516, 607 | generic English for the deployment (not a product name); kept, flagged for review |
| "The token exceeds the 8192-character limit…" | 183, 194 | literal kept byte-exact (neutral; mirrors `credential.limit`); listed |
| `@file` comment: "Settings → External MCP", `TOVU_<VENDOR>_MCP_*`, "Tovu obtains the token", "Tovu's call" (6, 10, 43, 726), "Tovu error adapter" (1438) | comments | move byte-exact; reworded ONLY on real N1 rejection (before/after recorded) |
| OAuth endpoint keys, transports, grants, auth modes, statuses | various | saved formats/protocol (core literal unions, H1a) |

**Store port (types in HOSTED `store-ports.ts`, core types only):** per-call `repo/sealer/keyring/clock` (unchanged core `ExternalMcpStoreDeps`) + host-bound `HostedMcpStorePorts` = `{ vault:{createService,createMemoryRepo}, vaultErrors:{create({code}:{code:VaultErrorCode}, optionalArgs?:Record<string,never>):Error}, metaParsers, assertFreeField, credential:{normalize,assert,hint,messages,limit,InputError}, settingsLink }`. `classifyVaultError`/`aad.format`: not used → omitted. T binds once in `external-mcp-vault.ts` (vault ports) and `external-mcp-store.ts` (store ports); old exports keep names/signatures: `saveExternalMcpServer(deps,input)`, `readEnabledExternalMcpConfigs`, `listExternalMcpServerViews`, `applyExternalMcpAccess`, `deleteExternalMcpServer`, `openExternalMcpOAuthPayload(sealer,record)`, `sealExternalMcpOAuthPayload(deps,identity,payload)`, `parseEnvBlock(text)`, `normalizeExternalMcpAccessToken(value,transport)`, vault fns (same required-object shapes), `new InMemoryExternalMcpServerRepo()`, `new ExternalMcpConnectionRevokedError(input)`.

**Stays Tovu:** `external-mcp-repo.ts` (SQL repo; imports envelope fns through the T vault shim = the HOSTED module instance), `external-mcp-repo.sqlite.ts`, `REVOCATION_MESSAGES`, the T bindings. S4-owned files: not touched.

## H1b

Builder: H1b subagent. Programmer skills file (`Jini AI-Dev-Shop/agents/programmer/skills.md`) loaded. Starting pair Tovu 559cbb43 / Jini 883db690 (last green Tovu 5162e3db / Jini 883db690).

### Inventory resolution
Every row in "## H1b — inventory" was resolved as recorded, with these additions:
- **Two extra ports, from real N3 rejections.** The guard's `N3-host-copy` rule forbids `EXTERNAL_MCP` literals, so two error codes became host input:
  - `reauthRequiredCode` (store ports). Tovu binds `"EXTERNAL_MCP_REAUTH_REQUIRED"`.
  - The revoked error's `code` (constructor input). The T subclass binds `"EXTERNAL_MCP_CONNECTION_REVOKED"` and keeps `declare readonly code: "EXTERNAL_MCP_CONNECTION_REVOKED"` so the literal type is unchanged.
- **One `exactOptionalPropertyTypes` widening.** `store.memory.ts` `stage({ previous?: … | undefined })`. The type only widens; runtime is identical.
- **Complexity split.** `resolveExternalMcpAccessToken` had complexity 11 before this batch. Its final try/catch moved unchanged into `resolveOwnedAccessToken`, and the function now returns that helper's result. Proof that behaviour is identical:
  - The same reasons come back in the same order.
  - The store group passes 284/284, which includes the reauth/needs_reauth/shared cases.
  - Strict lint at complexity 10 is clean.
- Nothing else moved. `classifyVaultError` and `aad.format` are not used by any of the four files, so they were not added. `parseAllowedToolNames` is unchanged.

### Provenance / comment custody
- **Source.** T blobs at 559cbb43 were copied whole:
  - store 23042de1 → `store.ts`
  - memory 87595f9e → `store.memory.ts`
  - vault 5d77eda7 → `vault.ts`
  - revocation 8b806a7b → `revocation.ts`
- **Edits.** The only changes after the copy were explicit string replacements:
  - imports;
  - port threading: replacing `sealer` with `deps`/`ports`, adding the `credential.*` reads, and interpolating `settingsLink`;
  - adding `@agent-note`s.
- **Comment custody.** "Why" comments moved byte-exact with their owner: AAD, staging, foreign kind before crypto, carried-envelope equality, CAS/leases, no retry. `REVOCATION_MESSAGES` and its doc block stayed in T, byte-exact (host wording).
- **N1 rewordings (real rejection `N1-consumer-identity /tovu/i`, `raw/j-guard-h1b.txt` first run), store.ts comments only:**
  - "resolvers read \`TOVU_<VENDOR>_MCP_*\` environment variables;" → "resolvers read the host's \`<VENDOR>_MCP_*\` environment variables;"
  - "OAuth — Tovu obtains the token" → "OAuth — the host obtains the token"
  - "Tovu's call and not an operator preference." → "the host's call and not an operator preference."
  - "/** Tovu error adapter for the shared token policy." → "/** Host error adapter for the shared token policy."
- **Model-facing bytes are unchanged.** The 8 "Settings → External MCP" reasons are now `${settingsLink}` templates, and T binds the identical string. All T store/connect/nine tests pass unmodified, and those tests pin the reasons.

### Ports (J `mcp/src/federation/hosted/store-ports.ts`, core vault types only)
- **`HostedMcpVaultPorts`** = `{ vault:{createService, createMemoryRepo}, vaultErrors:{create({code}:{code:VaultErrorCode}, optionalArgs?:Record<string,never>):Error}, metaParsers({validateMeta}) }`.
- **`HostedMcpStorePorts`** extends it with `assertFreeField`, `credential:{normalize, assert, hint, messages(env/ascii/storage/blank/url), limit, InputError}`, `settingsLink` and `reauthRequiredCode`.
- Per call, the deps are still the unchanged core `ExternalMcpStoreDeps`. The new `HostedMcpStoreDeps` = deps & ports.
- **Bound once in T:**
  - `external-mcp-vault.ts` → `externalMcpVaultPorts`: the real `SecretsVaultService`, `InMemoryVaultRepo`, `VaultError`, and `createTovuVaultKinds` with the original two policy stubs.
  - `external-mcp-store.ts` → the store ports: the real credential-token exports and `"Settings → External MCP"`.
  - The T memory and revocation files are subclasses that keep their 0- and 1-argument constructors.
- **No J file imports `@jini-ai/platform`.** All ten `new VaultError` sites (26, 29, 37, 40, 47, 64, 79, 84, 99, 102) became `vaultErrors.create`. The memory store uses `vault.createMemoryRepo()` and has no Map vault.

### Envelope module: one instance
- `vault.ts` is the only module that holds `contextKey`/`stagedKey`. The store, memory repo and T shims import it. The T SQL repo (`external-mcp-repo.ts`, unchanged) gets it through the T vault shim, which re-exports or wraps the same dist module.
- Tovu resolves `@jini-ai/mcp/federation/hosted` to `packages/mcp/dist/federation/hosted/index.js`, which the test asserts.
- Proof by a negative control: an envelope sealed through the shim is accepted by the dist `externalMcpVaultRecord` and rejected (`VaultError`) by the **source** `vault.ts` instance. This shows the symbols are per-instance, so the passing path uses one shared instance.
- No seal-path additions. AAD, version, ids, kinds, null scope, staging, id timing (before put), owner checks, `expectedRevision`, carried-envelope JSON equality, foreign kind before the parser/crypto, and metadata policy order are all unchanged.

### Counters
- The H0 frozen test passes 6/6 unmodified, with its exact counters: toView env1/static1/oauth2, sealer open:4, leased refresh {open:4, seal:1}, repo/kernel/keyring counts.
- The new memory-path pins through the shims: save {seal:2, open:2}, list {open:2}, config read {open:2}.
- In the second host: save {seal:2, open:2}, read {open:2}, and a foreign context gives open:0.

### New tests (existing tests frozen; `git diff --name-status` vs both pins shows only A under `__tests__`)
- **T `features/external-mcp/__tests__/h1b/hosted-store-seams.test.ts` (3 tests):**
  - per-row counts;
  - foreign server, foreign kind, missing context and foreign seal kind all give the real platform `VaultError` `context` with 0 opens/seals;
  - a carried envelope that is not in the repo gives `conflict`;
  - revoked error identity (`instanceof` hosted and `ToolInputError`; name, code, retryable, exact message);
  - `rosterRefusalFor` and envelope function identity;
  - dist resolution plus the single-instance negative control.
- **J `mcp/src/federation/hosted/__tests__/second-host-store.test.ts` (3 tests).** The test supplies its own vault service, memory repo, AAD sealer, `AcmeVaultError`/`AcmeInputError`, credential policy, settings path "Console › Tools › Remote servers", reauth/revoked codes, and `acme-*` ids and workspaces. It checks:
  - save, list and read work, with exact counts;
  - failure reasons carry the second host's path and messages;
  - a provider canary (`sk_acme_secret` + URL) never reaches a reason;
  - a plain-field secret is refused with the second host's message;
  - a foreign workspace, server or kind is refused with the host error before crypto;
  - no first-host vocabulary appears in the output.
  - My first run was red because of 2 errors in my own test (clock shape `nowMs`; rows need `enabled: true`). I fixed and reran: 7/7. A typing slip in the same test (`isDefault`) broke the mcp build once; I fixed it and the build is green.
- Not separately covered: there is no second-host case for `reauthRequiredCode`. The T store group covers the Tovu binding.

### Gate (final tip: Tovu ddf430cc + this report, Jini 07766d6e; raw under /home/user/s5/raw/)
| Gate | Result | Raw |
|---|---|---|
| H0 frozen SQLite (S5_FROZEN_DB_OUT) | 6/6 EXIT 0 (three runs, incl. Jini tip) | h1b-h0-frozen, h1b-final-h0-frozen, h1b-tip-frozen-new |
| H0 BASELINE rollback | ok:true, 5 checks, EXIT 0 (three runs) | h1b-h0-rollback, h1b-final-…, h1b-tip-rollback |
| T store/vocabulary | 284/284 EXIT 0 (before and after the N1/N3 fix) | h1b-t-store, h1b-final-t-store |
| T connect / nine | 147/147, 58/58 EXIT 0 | h1b-final-t-connect, -nine |
| T sign-in/gate | 141/142 EXIT 1. Only the named prior-debt case fails, with the same message "must have one OAuth ports call" 0 !== 1. Not counted green | h1b-final-t-signin |
| T H1a + H1b new tests | 12/12 EXIT 0 | h1b-final-t-new |
| J mcp build / tsc --noEmit | EXIT 0 / 0 (one red build from my test typing → fixed) | h1b-build-mcp-3, h1b-j-tsc-3 |
| J hosted tests (entry + second host) | 7/7 | h1b-j-hosted-tests |
| Relink (symlinked) + T main tsc | EXIT 0, 0 errors (at tip) | h1b-tip-t-tsc |
| T typecheck:tests | EXIT 2, exactly the 13 baseline errors (set diff empty) | h1b-t-tsc-tests |
| guard-gate.sh h1b | First run DIFFERS: N1 store.ts and N3 ×2 (store.ts:543, revocation.ts:59). Fixed (above) and rerun: **MATCHES BASELINE**. TOTAL 2 (R2, R10); HW +0; layers 0; isolation 0; audit 576/16 (c9/d7) | h1b-guard-gate-summary, j-guard-h1b |
| xp-gate.sh h1b | snapshot VERIFIED; XP1–XP5 clean EXIT 0 | h1b-xp-gate-summary |
| Strict lint, changed production | J: 1 warning (unused import, mine) → fixed → 0. T shims: 0. The prior T complexity-11 error is gone (split) | h1b-j-lint-rerun, h1b-t-lint |
| Emitted closure | Runtime closure of the hosted entry is 13 files: core/node only. Non-core `@jini-ai` specifiers in hosted `.js`/`.d.ts`: 0. No product strings in runtime literals. The "Settings → External MCP" text in the `@file` header comment is a byte-exact comment. `@agent-note` counts match source and dist: store 6, vault 8, store-ports 6, memory 1, revocation 4 | — |
| Hashes | fixture aca349ca…, tool-metadata a0d6b428…, `sha256sum -c` T and J OK | — |

### Findings (listed, not fixed)
- **Declaration closure.** `toResolvedFederatedConnections` returns `ResolvedFederatedConnection` (`../config.d.ts`), whose closure already reaches the type-only `@jini-ai/platform/fetch-with-timeout` through pre-existing `adapter.http.ts` (present at pin 4044fe3c0; mcp declares platform as a dependency).
  - The guard, SI audit and XP accept this.
  - The H1a isolated scratch consumer was not refreshed. It would need that type or `skipLibCheck`.
- "this site" / "site credential store" stay in moved reasons. The guard explicitly allows generic "this site".
- "The token exceeds the 8192-character limit…" is hard-coded next to the injected `credential.limit`. It is byte-exact; a reviewer may prefer it as host input.
- The PostgreSQL replay was not rerun in H1b (optional).

### S4 overlap
- T: `features/external-mcp/{external-mcp-store,external-mcp-store.memory,external-mcp-vault,external-mcp-revocation}.ts`, the new `__tests__/h1b/`, and this report.
- J: `mcp/src/federation/hosted/{store,store-ports,vault,store.memory,revocation,index}.ts`, a new hosted test, and `.changeset/s5-h1b-mcp.md`.
- **No S4-owned file was touched.** `service-ports.ts`, `mcp-host-bindings.ts`, the connect files and `composition/agent-plugin-service-ports.ts` are unedited. All old export names and signatures are kept, which the passing connect/nine/store groups confirm.
- No `package.json` or lockfile edits.

### Lines
- J production: +2142 (moved text plus ports and notes).
- T production: −1962/+71.
- New tests: J 131, T 82.

### Pushed SHAs
- Jini: 0203256288d36d38bac90cc0f3f49487db252b9b, fabc0b09f7b7be331196fe261f44bfabb400f044, 18e2d521cc5f6c1db0e88c9480dae10e6d3ec104, 07766d6e7db863e2a7ae7c6bcc6c2b860affbc2b.
- Tovu: eb3736f46457a5211a61f115347c3b79d4cbc536 (inventory), 045f6258ef933e6cd936477e0b93001e58c61d83, ce2ec9250b3a7862eb1c0134411a735af7cbd4ac, ddf430cc17c3439b44b80de64d9b9f808d2372b1, plus this report commit.

**LAST GREEN PAIR: Tovu ddf430cc17c3439b44b80de64d9b9f808d2372b1 (tested source; the report commit adds only this file) / Jini 07766d6e7db863e2a7ae7c6bcc6c2b860affbc2b.**

## H2a — inventory and 14-import ledger

Builder: H2a (part 1 of H2: reviewed API closure; seam items 2–5). Start pair: Tovu 63ba11b3 / Jini 07766d6e (LAST GREEN PAIR Tovu ddf430cc / Jini 07766d6e). Line numbers re-verified on the S5 tip (match the brief's base lines). Paths relative to J `packages/integrations/src/api-connections/`.

### Ledger: 14 reviewed imports → planned replacement
| # | site | symbols used (actual use) | planned replacement |
|---|---|---|---|
| 1 | access-token.ts:11 | `createTokenRefresher` (l.86), `refreshAccessToken` (l.80), `OAuthError` (l.97 `instanceof` + code `OAUTH_INVALID_GRANT`), type `TokenRefreshPort` (l.69) | fns: `deps.oauth.flow` = `Pick<OAuthFlowOperations,…>` (core/contracts/oauth, new); error: injected real classifier `deps.oauth.isOAuthError` bound by host to the real `OAuthError` class identity (instanceof preserved, no duck typing/message matching); `TokenRefreshPort` → core/contracts/oauth (already there; oauth `ports.ts` re-exports core, same identity) |
| 2 | attempt-state.ts:12 | `invalidPendingAuthorizationState` (l.43,89), `PENDING_AUTHORIZATION_STATE_BYTES` (l.53), `generateOAuthState` (l.53), `secureEqualsForOwnerBinding` (l.67,70), types `PendingAuthorization` (l.34), `SealedAuthorizationState` (l.47,82) | fns/const: `deps.oauth.{invalidPendingState, pendingStateBytes, generateState, secureEquals}` (narrow local port, host binds the real exports); types → core/contracts/oauth (moved signature closure; oauth re-exports) |
| 3 | authorization.ts:11 | `beginAuthorizationCode` (l.124), `completeAuthorizationCode` (l.152), `generateOAuthState` (l.120–121), `OAuthError` (l.95 instanceof; codes INVALID_STATE/ACCESS_DENIED; `.message`/`.operatorAction`), types `OAuthProviderDescriptor`, `OAuthTokenSet` | `deps.oauth.flow.{beginAuthorizationCode,completeAuthorizationCode}`, `deps.oauth.generateState`, `deps.oauth.isOAuthError`; types → core/contracts/oauth (already there) |
| 4 | deps.ts:8 | types `OAuthAppOptions, OAuthClient, OAuthFetch, OAuthRandomBytes, OAuthSleep, OAuthUrlGuard` | core/contracts/oauth (all already there; identical identity via oauth `ports.ts`); deps gains required `oauth: ApiConnectionOAuthCapabilities` |
| 5 | descriptor.ts:8 | `isCallbackFieldName`, `MAX_CALLBACK_FIELD_LENGTH`, `MAX_CALLBACK_FIELDS` (l.23 `CALLBACK_FIELD_RULES`) | required `callbackFieldRules` input to `parseApiConnectionDescriptor` — **BLOCKED, see test-contract drift below** |
| 6 | finish-authorization.ts:9 | type `OAuthTokenSet` | core/contracts/oauth |
| 7 | hosted-sign-in.ts:2 | `createPendingAuthorizationStore` (generic cache overload, l.63: `put`/`consume`, `expiry`), `generateOAuthState` (l.69, 32 bytes), type `OAuthRandomBytes` | required inputs on `createSignInHandoffs({clock, randomBytesFn, createPendingCache, generateState})` (narrow local structural port); type → core |
| 8 | install-credential.ts:10 | type `OAuthTokenSet` | core/contracts/oauth |
| 9 | ports.ts:8 | types `OAuthTokenSet, OAuthTokenStore` | core/contracts/oauth (already there) |
| 10 | request-checks.ts:8 | `MAX_AUTHORIZATION_STATE_LENGTH`, `MAX_CALLBACK_FIELD_LENGTH` (l.72) | required `limits` input to `checkCallbackParams` threaded from service deps (`deps.oauth.callbackLimits`) |
| 11 | token-store/record.ts:5 | type `OAuthTokenSet` | core/contracts/oauth |
| 12 | token-store/vault-token-store.ts:13 | types `OAuthTokenSet, OAuthTokenStore` | core/contracts/oauth |
| 13 | token-store/record.ts:6 (platform) | type `VaultMeta` | core/contracts/vault (already there) |
| 14 | token-store/vault-token-store.ts:14 (platform) | `VaultError` (l.50 `instanceof` + code `conflict`), types `SecretsVaultService` (l.28 Pick get/put/patchMeta/delete), `VaultContext, VaultIdentity, VaultMeta` | types → core/contracts/vault; `OAuthTokenVaultPort` rewritten as a local structural port of exactly get/put/patchMeta/delete; required injected `isVaultConflict(error)` classifier (T vault-stores.ts:161 binds real `VaultError` instanceof + `conflict`) |

OAuthFlowOperations closure (core/contracts/oauth, type-only): the 11 named function types need `OAuthRequiredArgs/OptionalArgs`, Begin/CompleteAuthorizationCode{Deps,Input,Result,Args}, PendingAuthorization(+Store), SealedAuthorizationState, AuthorizationStateCodec, TokenRequestDeps, TokenRefresher(+Deps), RefreshAccessTokenInput, DeviceAuthorizationDeps, Begin/PollDeviceAuthorizationInput, OAuthDiscoveryDeps, DiscoverAuthorizationServerInput, DynamicClientRegistration{Deps,Input}, OperatorOAuthProviderInput. `OAuthMessages` is `typeof defaultOAuthMessages` in oauth (runtime-derived) → needs an explicit core interface (no `typeof import` in core). Host vocabulary: none new (no permission names/ids/paths introduced; all inputs are protocol constants/functions bound from the OAuth/platform packages).

### STOP — test-contract drift (owner/coordinator decision needed before implementation)
- Frozen T test `apps/website/src/features/api-connections/__tests__/shared-owner.integration.test.ts:10,22` imports `parseApiConnectionDescriptor` **directly from `@jini-ai/integrations/api-connections`** and calls it as `parseApiConnectionDescriptor({ value: {...} })`. It is in the T API group (`named-tests.sh` l.31, 156/156 gate) and inside `tsconfig.tests.json` (`apps/website/src/**/*.ts`).
- Seam item 3 + the allowance table (descriptor.unit.test.ts helper16/calls26–44, harness descriptor87, security-pins 222…, host-seams 5, unit-deps 39) require `parseApiConnectionDescriptor` to take a REQUIRED callback-rule input (no optional fallback, no copied policy). The brief's caller search covered only J `packages/` + `examples/`; this T caller is unlisted, not routed through any T shim, and cannot be bound by a T re-export.
- Consequence of implementing as briefed: `npm run typecheck:tests` gains 1 error (13 → 14, TS2345 missing property) in a frozen T test. Runtime stays green (its descriptor declares no `callbackFields`; `readFields` returns before touching the rules), so the 156/156 API group would still pass.
- Every alternative violates a rule: keeping descriptor.ts on `@jini-ai/oauth` breaks the H2 Decision ("NONE deferred"); an optional/default rule set is a forbidden optional fallback/copied policy; deferring callback-field validation to service creation changes refusal timing (J descriptor/security-pins expectations).
- Options for the owner: (a) authorize this one T typecheck drift (14th error = shared-owner.integration.test.ts:22, runtime unchanged) or a one-line T test edit binding the rule input; (b) keep the descriptor edge as the single named H2 exception; (c) another ruling. No code was changed; items 2–4 (flow ops, service deps, handoffs, request-checks) and item 5 (vault) are independent of this and are ready to implement from the ledger above once ruled.

## H2a

Rulings applied: coordinator (c) (core leaf move) was implemented and pushed in Jini 6ab1d818. The coordinator then replaced it with ruling (a), so (c) was hand-reverted in 183915bb: core package.json and oauth loopback-callback.ts are byte-identical to 07766d6e again, and the core subpath and its changeset text are removed. `parseApiConnectionDescriptor` now takes a REQUIRED `callbackFieldRules` input, bound from the real oauth `MAX_CALLBACK_FIELDS`/`MAX_CALLBACK_FIELD_LENGTH`/`isCallbackFieldName`.

**The single allowed Tovu test wiring edit (coordinator ruling (a), same kind of exception as earlier sessions' newly-required inputs)**, `apps/website/src/features/api-connections/__tests__/shared-owner.integration.test.ts`:
```
+import { apiConnectionCallbackFieldRules } from '../oauth-bindings.js';
-const descriptor = parseApiConnectionDescriptor({ value: { pluginId: 'shared-fixture', connectionId: 'account',
+const descriptor = parseApiConnectionDescriptor({ callbackFieldRules: apiConnectionCallbackFieldRules, value: { pluginId: 'shared-fixture', connectionId: 'account',
```

Ledger result (old edge → replacement). All 14 edges are removed. closure-check over source, JS and .d.ts is CLEAN.
- 1–3, 7: flow functions → `deps.oauth.flow` (`Pick<OAuthFlowOperations,…>`). Helpers → `deps.oauth.{generateState, pendingStateBytes, invalidPendingState, secureEquals}` / `createSignInHandoffs({…, oauth})`. OAuthError classification → `deps.oauth.isOAuthError`, the real oauth `isOAuthError` (`instanceof`).
- 5: descriptor rules → required `callbackFieldRules`.
- 10: request-checks → `checkCallbackParams(value, {maxAuthorizationStateLength, maxCallbackFieldLength})` from `deps.oauth`.
- 4, 6, 8, 9, 11, 12: types → core/contracts/oauth.
- 13: `VaultMeta` → core/contracts/vault.
- 14: `OAuthTokenVaultPort` → local structural get/put/patchMeta/delete port over core vault types. `VaultError` → required `isVaultConflict`; Tovu vault-stores.ts:161 passes its existing `isConflict` (`instanceof VaultError && code==='conflict'`).
- New: core/contracts/oauth/flow.ts holds `OAuthFlowOperations` plus its signature closure. The 26 types were moved byte-exact with an @agent-note each. Two forced edits: `import("./ports.js").OAuthResource` became `OAuthResource`, and the private `AuthorizationEntry` alias was duplicated (it is still used by the oauth implementation). `OAuthMessages` is an explicit interface; `defaultOAuthMessages` uses `satisfies`. The oauth package re-exports every old name. `oauthFlowOperations` lives in oauth flow-operations.ts.
- Tovu wiring: features/api-connections/oauth-bindings.ts (new) holds the one real capabilities object plus the rules. host-bindings.ts, contribution.ts:72 and vault-stores.ts use it. browser-binding.ts `createSignInHandoffs` is now a thin bound shim with the old signature. That shim was needed because browser-binding.unit.test.ts failed 2/156 and gave 2 TS errors before it: red → fix → rerun.

Allowance-table J test edits (only real-capability wiring plus one import per file; shared new fixture `__tests__/fixtures/real-capabilities.ts`). Diffs are in raw/h2a-allowance-diff.txt plus commit 183915bb.
| file | edited sites |
|---|---|
| harness.ts | service 102, vault store 128, descriptor 87 |
| unit-deps.ts | descriptor 39, returned deps 43 |
| descriptor.unit | 16, 26, 32, 37, 44 |
| host-seams.unit | 5 |
| security-pins | 222, 281, 289, 294, 299 |
| credential-status | 22 |
| hosted-sign-in.unit | 94, 107, 108, 118, 128 |
| request-checks.unit | 99, 103, 107, 112, 116 |
| token-store fixtures | 29 |
| vault-token-store.security | 66, 281, 306, 321, 335 |
| vault-token-store.slice | 20 |
| vault-token-store.unit | 30 |

No assertion, expected value or flow changed. No unlisted J test edit was needed. The baseline hashes of harness.ts, unit-deps.ts and token-store/__tests__/fixtures.ts change because they are allowance files; every other hash is unchanged.

Gate:
| gate | result |
|---|---|
| core/oauth/integrations build + tsc | EXIT 0 |
| oauth tests (touched exports) | 40 files / 714 pass |
| J API/token 20 files | 365/365 |
| closure-check `api-connections` + `/hosted-mcp` (src/js/dts) | CLEAN. Negative control on base tree: 29 violations found |
| second-host consumer (scratch/h2a-consumer; oauth/platform absent, `preserveSymlinks`, strict) | tsc EXIT 0; runtime run EXIT 0. The descriptor refusal, single-use hand-off and token store all work through fakes |
| Tovu main tsc | 0 errors |
| typecheck:tests | 13 = baseline set |
| T api | 156/156 |
| T connect | 147/147 |
| T nine | 58/58 |
| T sign-in | 141/142 (prior-debt case only) |
| guard-gate h2a | MATCHES BASELINE |
| xp-gate h2a | XP1–XP5 clean |
| Tovu hashes | OK |

NOT RUN (budget cap): conformance test wiring the real oauth exports; neutral-host api-host-moves + new examples test; strict lint of changed production; H0 frozen test + BASELINE rollback.

S4 overlap: none. The Tovu files touched are in features/api-connections only; no agent-plugins/connect files. Changesets: s5-h2a-{core,oauth,integrations}.md. No lockfile edits.

## H2b — seam inventory

Recorded before any seam edit (H2b builder; Tovu 01928354, Jini 9a669a56). Source: T `apps/website/src/features/external-mcp/external-mcp-oauth.ts` (1248 lines) and `external-mcp-shared-oauth.ts` (296). Destinations per R3: **MCP** = J `mcp/federation/hosted` (gate, H3); **INT** = J `integrations/api-connections/hosted-mcp` (sign-in, H3); **T** = stays Tovu (host binding/adapter); **PORT** = host-passed input.

### Gate region (old lines 157–273) → MCP in H3; split in place now
| Symbol | Lines | Closure today | Port it takes | Host vocabulary |
|---|---|---|---|---|
| `ExternalMcpConnectionGateDeps` | 159–164 | type | stays as the T signature; neutral `HostedMcpConnectionGatePorts` added | none |
| `createExternalMcpConnectionGate` + why-doc | 166–213 | revocation (hosted `rosterRefusalFor`), mcp/federation types | repo, isPluginEnabled, assertSharedAuthorized?, reauthRequired factory, revoked factory, recovery text, operator log | none in body; doc cites T paths (provenance) |
| `offerPluginAccessCard` | 220–225 | `ToolInputError` (core) | recovery `accessHint` | tool id `plugins_set_enabled`, `family:"agent-plugin"`, reason wording → PORT (T binds exact bytes) |
| `assertProvisioningPluginEnabled` | 231–238 | `ToolInputError` | isPluginEnabled, recovery `pluginOff` | `plugins_set_enabled` wording → PORT |
| `readConnectionRowOrRefuse` | 246–256 | console.warn, revoked error | `logUnreadableRow`, revoked factory | `[external-mcp]` log prefix → PORT; `unverifiable` reason = neutral D3 key |
| `assertNotAwaitingReauth` | 262–266 | T projections, reauth class | hosted projections (same package after move), reauthRequired factory | none |
| `ExternalMcpReauthRequiredError` | 86–121 | `externalMcpSettingsDeepLink` | stays T (host text + settings link); ONE factory `createExternalMcpReauthRequiredError` supplied to gate AND sign-in | `"EXTERNAL_MCP_REAUTH_REQUIRED"`, `Settings → External MCP` → T |
| `externalMcpSettingsDeepLink` | 136–138 | none | settingsLink PORT | `/settings/external-mcp?server=` → T |
| `createDeviceAuthorizationStore` | 142–154 | none | moves INT (H3) | none |

### Sign-in half (275–1248 + shared-oauth.ts) → INT in H3
| Need | Where | Port (sign-in port) | Host vocabulary |
|---|---|---|---|
| registration identity | 275–278 `oauthClientOptions`; shared 243 | `registrationIdentity` {softwareId, clientName(record)} | softwareId `tovu`; display `record.label ?? record.serverId` (row-label fallback), shared `Tovu` → T binds |
| onConnected | 280–289 `notifyConnected`; calls 1104/1133/1139/1164 | existing `deps.onConnected` (contracts.ts:430–433); host log | `[external-mcp] … post-connect step failed` log → T |
| flow functions (11) | 13–34, shared 3–4 | H2a `OAuthFlowOperations` | none |
| `OAuthError` construction | 306–309, ~529–540, shared 37 | errors port (oauth error factory) — DEFERRED | `Settings → External MCP`, "grant Tovu supports" → T messages |
| store open/seal/upsert/lease | 113, 288, 488, 589, 625–704 | store port | none |
| projections | 36–39 | hosted `hostedMcpProjections` | none |
| validation/unconfigured errors | 35, ~1063 | errors.validation/unconfigured | `TOVU_PUBLIC_URL` text → T messages |
| seal-AAD | 775–792 `sealedRedirectState`, `formatAad` (platform) | `aad.format` PORT | kind `oauth-redirect-state` v1 = persisted format (neutral, must stay byte-identical) |
| owner key | 763–765 | neutral (`${workspaceId}:${serverId}`) | none |
| link | 6, 771, shared 9 | `signInLink` | T `hostedMcpSignInLink` |
| messages/policy | 4, ~491, ~536, 785 | `oauthMessages`, `discoveryPolicy`, `withCopy` | `tovuOAuthMessages`, `createTovuIssuerBoundDiscoveryPolicy`, `withTovuOAuthCopy` → T |
| shared-owner/project-keys types | shared 6–8, 12–22 | narrow structural ports | T `SharedOAuthOwnerStorage`, `SiteOAuthBindings`, `KeyAttachments`, `ProjectKeyTransaction` — adapters stay T |
| shared inventory type | shared 21 | core vault `VaultRecord` | `import('@jini-ai/platform/…')` → core type |

Plan for this batch (re-cut, ~600-line rule): **H2b = gate split (item 6) + one reauth factory + registration identity/onConnected bindings (item 7)**. The sign-in half's store/error/AAD/link/messages/policy ports and the narrow shared-owner ports (item 1 for the sign-in half) are a separate serial substep (**H2c**) because together they exceed the budget left in this batch.

## H2b

Scope that landed: the H2a leftovers, the seam inventory above, **item 6** (the gate split in place plus one reauth factory), and **item 7** as far as registration identity, the onConnected notes and the hosted closure leak go. **Item 1 is NOT done for the sign-in half.** That means the store, error, AAD, link, messages and policy ports, and the narrow shared-owner ports. It is cut out as a serial substep, **H2c**, which must land before H3. The gate half of item 1 is done.

### H2a leftovers
- New J `integrations/src/api-connections/__tests__/real-oauth-conformance.integration.test.ts` (7 cases). It wires the real `oauthFlowOperations` and capabilities, `isOAuthError` and `VaultError` through the public entry, and covers: state bytes, which equal `PENDING_AUTHORIZATION_STATE_BYTES`; S256 PKCE; callback complete; refresh through the real refresher; `MAX_*` callback bound+1 refused before any provider call, while the bound itself passes the size check; refresh `invalid_grant` → `reconnect-required` with the exact text and a real `OAuthError` cause; code-exchange `invalid_client` → `authorization-failed`; canaries (token/secret/URL/path in `error_description`/`error_uri`) absent from model text; single-use hand-off; the conflict classifier.
  - Red→fix: I first asserted that hand-off ids use the pending-state width (24). Base `hosted-sign-in.ts:69` uses `stateBytes: 32`, so the test was wrong, not the code. The test now asserts 32.
- Scratch consumer redone at `/home/user/s5/scratch/h2a-consumer`. **The H2a positive run was not a true isolation.** It symlinked `packages/integrations`, whose own `node_modules/@jini-ai/oauth` stayed resolvable. The packages are now copied in without `node_modules` or `src`.
  - Positive: tsc EXIT 0, run EXIT 0.
  - Negative control `neg.ts`: TS2307 for `@jini-ai/oauth` and `@jini-ai/platform/fetch-with-timeout`, and runtime ERR_MODULE_NOT_FOUND for both (raw `h2b-consumer-neg.txt`).
  - Base-tree control (`scratch/h2b-consumer-base`, pin packages): 8×TS2307 plus a runtime ERR_MODULE_NOT_FOUND for oauth (raw `h2b-consumer-base-neg.txt`).
- `examples/neutral-host` `api-host-moves.test.ts`: 2/2, file unchanged.
- Strict lint of the H2a production files.
  - J: 20 `sonarjs/unused-import` warnings in 8 oauth files were session-caused (H2a moved types to core and left the imports). Base files lint clean. Fixed, and the oauth tests still pass 714/714.
  - `host.ts:131` prefer-destructuring is baseline (same line at the pin). Listed, not fixed.
  - T biome on the H2a files: 2 `noNonNullAssertion` warnings, both baseline.

### Ports (item 6, T `external-mcp-oauth.ts`, in place)
- `HostedMcpConnectionGatePorts` extends the old `ExternalMcpConnectionGateDeps` with:
  - `reauthRequired(input) => Error`
  - `revoked(input) => Error`
  - `recovery.accessHint` and `recovery.pluginOff` (each returns model text)
  - `logUnreadableRow({connectionId,error})`

  An attached @agent-note covers one instance per gate, the same repo instance, one read, no unseal/open/network, "activation throw denies", and shared error identity.
- `createHostedMcpConnectionGate(ports)` holds the original body and order unchanged: read → activation → preset bypass of roster grants only → roster refusal/access hint → shared → legacy reauth → verdict. The why-doc stays attached to it.
  - It imports no Tovu vocabulary: `ToolInputError` comes from core, and `rosterRefusalFor` and the projections come through T shims of `@jini-ai/mcp/federation/hosted`.
  - Neither it nor its ports type references integrations or OAuth, so H3 can move it to MCP.
- `createExternalMcpConnectionGate(deps)` keeps its old signature. It is the neutral gate bound to `tovuConnectionGateVocabulary`, which reproduces the exact old bytes: `plugins_set_enabled`/`agent-plugin` copy, the `[external-mcp]` warn text, and `ExternalMcpConnectionRevokedError`.
- `createExternalMcpReauthRequiredError` is the ONE factory. It serves the gate binding and all three sign-in throw sites (`reportAuthFailure`/resolver). The class stays in T.
- Item 7: `tovuRegistrationIdentity` {softwareId `tovu`, clientName = label ?? serverId, sharedClientName `Tovu`} carries an attached note. `oauthClientOptions` uses it, and it is passed as the new required `registrationIdentity` of `createSharedExternalMcpOAuth`. J `hosted-mcp/contracts.ts` got notes for one device store, one registry per service, and onConnected exactly once / failure-tolerant.
- Leak fix: J `mcp/src/federation/config.ts:1` now takes `McpBearerTokenSupplier` from `@jini-ai/core/contracts/hosted-mcp`, the same type `adapter.http` re-exports. Hosted-entry closure-check: before, 3 violations (src import + dynamic import + .d.ts, raw `h2b-closure-hosted-before.txt`); after, CLEAN on src/JS/.d.ts.

### New tests
- T `features/external-mcp/__tests__/h2b/connection-gate-seam.test.ts`, 9/9:
  - roster order
  - preset bypasses roster only (shared and reauth still run)
  - roster refusal and access hint
  - activation failure denies
  - row failure: operator log only, generic model text (canary checked on both the second host and Tovu)
  - no origin gets the full re-check
  - onConnected once, after durable `connected`, with failure tolerated
  - one reauth factory (gate, sign-in and factory: same class/code/retryable; source has exactly one construction)
  - identity values

  The second host varies tool ids, paths, codes and identity, and no Tovu word appears in its output.
- Mutation red, then restored: "shared no longer skips reauth" → 1 fail; "activation failure allows" → 1 fail; "no-origin treated as preset" → 1 fail once the no-origin case was added. Before that case existed this mutation survived, which is why it was added.
- Red→fix during writing (test-side only): the activation test's expected calls missed the read; the roster fixture needed `oauthStatus: connected` and annotations.
- Session lint regression: the wrapper repeated the `void|verdict` type, adding a second `noConfusingVoidType`. Fixed with `ReturnType<typeof createHostedMcpConnectionGate>`, and the counts now equal baseline (1/2/1).

### S4 overlap
None. Tovu touched only `features/external-mcp/external-mcp-oauth.ts` and `external-mcp-shared-oauth.ts`, plus the new test and this report. Jini touched oauth src, `mcp/federation/config.ts` and `integrations/hosted-mcp/contracts.ts`, plus the new test. No `agent-plugins`/`connect`/`composition`/`assistant` files. No changeset or lockfile changes.

### Lines
Seam lines truly edited: T oauth +76/−22, shared +3/−1; J 4+1 doc/type lines. That is far below 600, but the remaining sign-in ports (H2c) are estimated at around 250–350 edited lines.

## H2 gate (H2b tip: Tovu f88953d8, Jini 575b95e4; raw /home/user/s5/raw/h2b-g-*.txt, summary h2b-gate-summary.txt)
| gate | result |
|---|---|
| J core/oauth/mcp/integrations build + tsc | all EXIT 0 |
| closure-check: api-connections, …/hosted-mcp, mcp/federation/hosted (src/JS/.d.ts) | CLEAN |
| J API 20 files + conformance | 21 files / 372 (365 + 7) |
| J mcp hosted tests | 7/7 |
| J oauth | 40 files / 714 |
| neutral-host api-host-moves | 2/2 |
| T main tsc | 0 errors; rerun after lint fix: 0 |
| typecheck:tests | 13 (= baseline set) |
| T sign-in/gate | 141/142, prior-debt case only, same message (rerun after lint fix: same) |
| T api / connect / store / nine | 156 / 147 / 284 / 58, all pass |
| T new h1a+h1b+h2b | 21/21 |
| H0 frozen SQLite / BASELINE rollback | 6/6 / ok, EXIT 0 |
| guard-gate h2 | MATCHES BASELINE |
| xp-gate h2 | XP1–XP5 clean |
| strict lint changed production | J eslint EXIT 0; T biome = baseline counts |
| hashes | T OK; J only the 3 allowance fixtures differ (harness.ts, unit-deps.ts, token-store fixtures.ts), as expected |
| existing-test audit vs pins | T: only M `shared-owner.integration.test.ts` (coordinator ruling (a)). J: only the 12 allowance-table files M. Everything else is A |

Not part of this gate: the full H2 closure requirement for the sign-in half. The INT `hosted-mcp` entry is types-only; the sign-in runtime is still in T until H2c/H3.

### Pushed SHAs (H2b)
Jini: 5525436891351a57315caf12c409f5d702b964b3, 9a669a56d188dbcc6dca037ba16e74d0efd459f9, 575b95e4cf86ae21d347ea3efb302c5cec5c08e2.
Tovu: 39c1c7c8ddc214cc514cd944a3d7971d900db382 (inventory), e8080710aafc1871e652a189f8774aa9ceb648d4, 8f61f08ef1f30306fdce26d3030a05a37b15625d, f88953d84a1edfdb58d1ff1eb7f84ccab347888b, plus this report commit.
**LAST GREEN PAIR: Tovu f88953d8 / Jini 575b95e4** (green for H2b scope; the H2 gate must rerun after H2c).

### Findings (listed, not fixed)
- J `integrations/api-connections/host.ts:131` prefer-destructuring warning (baseline).
- The H2a report's "second-host consumer: oauth/platform absent" claim was not true isolation (symlinked package node_modules). Corrected above.

### Coordinator decisions (later)
- ~07:42Z H2a stopped after inventory (Tovu 8496ae73): frozen T test features/api-connections/__tests__/shared-owner.integration.test.ts:10/22 imports and calls J parseApiConnectionDescriptor({value}) directly (caller outside the brief's packages/+examples/ search). Making callback rules a REQUIRED input would add a 14th typecheck:tests error. RULING (c): keep the public signature; MOVE the pure leaves isCallbackFieldName/MAX_CALLBACK_FIELDS/MAX_CALLBACK_FIELD_LENGTH from oauth loopback-callback.ts to a @jini-ai/core root subpath (brief lists "core root" as a legal destination); oauth re-exports same identity; integrations imports from core. Deliberate deviation from seam item 3's "inject via typed input" for these 3 leaves only; no copy, no optional fallback, frozen test untouched. Flagged for independent review.
- ~07:45Z COORDINATOR RULING (a) (supersedes ruling (c) above): option (a). descriptor callback rules become a REQUIRED input (descriptor oauth edge removed, no fallback/copy); ONE-line wiring edit in T features/api-connections/__tests__/shared-owner.integration.test.ts passes Tovu's real callback-rule binding; no assertion change. Listed as the single allowed Tovu test wiring edit (coordinator ruling (a)). The instruction to continue H2, H3, gates and C-c within the original caps, with the rest of the stop rule applying, came with it.

## Shutdown (coordinator) — STOPPED AT CAP (token cap projection)

Stopped 2026-11-09T08:27Z, elapsed 137 of 270 minutes, 133 minutes left on the clock. The time cap was not reached. **The 1.9M total-token cap was the reason.**

Measured subagent usage (final context per run): baseline 174k, H0 269k, H1a 274k, H1b 279k, H2a 150k first run + 255k resumed, H2b 228k. That is about 1.48–1.63M depending on how the resumed H2a run is counted, plus about 120k for the coordinator, so about 1.60–1.75M in total. Every builder so far has used 200–280k. The work left is H2c, its full H2 gate rerun, H3 and C-c, which needs at least three more such runs. That cannot fit in the 150–300k remaining. Following the "on any cap: push what you have, report, END" rule, the coordinator did not start H2c on a partial budget. A half-landed seam would put the last green pair at risk.

### Final tips (verified with git ls-remote)
- Tovu cloud/extract-s5: d86c41d8432990558d72e1ca4a55d95643847f79. This tip is report-only; the tested source is f88953d84a1edfdb58d1ff1eb7f84ccab347888b.
- Jini cloud/extract-s5: 575b95e4cf86ae21d347ea3efb302c5cec5c08e2.
- **LAST GREEN PAIR: Tovu f88953d8 / Jini 575b95e4.** It is green for H0, H1a, H1b, H2a and H2b scope; full table in "## H2 gate". The H2 gate must be rerun after H2c.

### Every pushed SHA
Tovu (oldest first): a6e2921d, 31504fd7, fde31568, b744f77c, 55111a2e, 06863b2d, 8c563ef5, 8aef56e2, 1472d1c2, 9355bd8c, d075d1e4, 5162e3db, 559cbb43, eb3736f4, 045f6258, ce2ec925, ddf430cc, 63ba11b3, 8496ae73, 55214a2f, 776e5226, 2c717cfb, 01928354, 39c1c7c8, e8080710, 8f61f08e, f88953d8, d86c41d8. Full SHAs are in `git log c3801c833..cloud/extract-s5`.
Jini (oldest first): 27063efc, 0b7183c3, 60f59307, 883db690, 02032562, fabc0b09, 18e2d521, 07766d6e, 6ab1d818 (ruling (c), reverted by 183915bb), d0a76a53, f1e53648, 183915bb, 55254368, 9a669a56, 575b95e4. Full SHAs are in `git log 4044fe3c0..cloud/extract-s5`.

### Batch status
| Batch | Status |
|---|---|
| Baseline | done; one prior-debt case and 13 typecheck:tests errors, see Coordinator decisions |
| H0 | DONE, green (SQLite mandatory green; PostgreSQL replay also proven for the main flow) |
| H1a | DONE, green |
| H1b | DONE, green |
| H2 | PARTIAL. H2a items 2–5 done: all 14 reviewed imports removed, closure-check CLEAN on src/JS/.d.ts, coordinator ruling (a) applied. H2b items 6 and part of 7 done: gate split in place, one reauth factory, registration identity. **H2c NOT DONE**: item 1 for the sign-in half and the rest of item 7, see H2B-HANDOFF list in "## H2b". |
| H3 | NOT STARTED |
| C-c | NOT STARTED: no packed consumer smoke and no C-c handoff section |

### Numbered remaining work
1. H2c: sign-in half of seam item 1 and the rest of item 7 in Tovu external-mcp-oauth.ts / external-mcp-shared-oauth.ts. Flow functions go behind OAuthFlowOperations; direct `new OAuthError` calls go behind an errors port; store, validation/unconfigured errors, formatAad, sign-in link, messages/policy and public-URL text become ports; shared-owner/project-keys types become narrow ports. Estimated 250–350 edited lines.
2. Full H2 gate rerun after H2c, including closure-check on all three entries.
3. H3: move the gate and policy to J mcp/federation/hosted, and sign-in, device store and shared sign-in to J integrations/api-connections/hosted-mcp; thin Tovu shims; new neutral host signs in to a Higgsfield-shaped fake provider; full H3 gate, including G-mcp and the BASELINE rollback.
4. C-c: packed scratch consumer (nodenext, plain node), .d.ts note/import inspection, and the "## C-c — ready for Claude review" section.

### S4 overlap (actual comparison of changed paths vs pins)
- Tovu: no file in the S4-owned set (features/agent-plugins/{federate-mcp,…,apply-tool-renames}.ts, mcp-host-bindings.ts, composition/agent-plugin-service-ports.ts) changed. No package.json or package-lock changes.
- Jini: no agent-plugins/src/connect/** changes, no pnpm-lock changes. **Shared manifests touched:** packages/core/package.json, packages/mcp/package.json, packages/integrations/package.json, with additive `exports`/`jini.entries` insertions for the new subpaths. Merge advice: union the entries. Changesets are uniquely named `s5-h1a-*`, `s5-h1b-mcp`, `s5-h2a-*`.

### Processes
No test, server or PostgreSQL processes remain (`ps` checked at 08:26Z). The H0 PostgreSQL scratch cluster (PID 16820) and the H1a one (PID 24407) were stopped by their builders. Scratch worktrees /home/user/s5/{base,xp3-orig} and the read-only XP3 snapshot are left in place in the container, untracked, for a continuation session.


EXTRACT-S5 STOPPED AT CAP (first session; superseded by the continuation below)

## Continuation — EXTRACT-S5-C

This continuation is owner-approved, in the same session and on the same branches. The caps are raised by 700k tokens in total (coordinator plus subagents) and by 1.5 hours.
- Continuation start: 2026-11-09T08:37:55Z. Continuation deadline: 10:07:55Z, read conservatively as 1.5 hours from the continuation start. Shutdown reserve begins 09:52Z.
- Starting tips: Tovu d6b3d102 (report only; tested source f88953d8), Jini 575b95e4. LAST GREEN PAIR at start: Tovu f88953d8 / Jini 575b95e4.
- Wording correction: the one-line wiring edit in shared-owner.integration.test.ts was the **coordinator's** ruling (a), not the owner's. Every earlier "owner ruling/override/owner-allowed" mention of it in this report has been corrected to "coordinator ruling (a)". Commit messages that already say "owner ruling (a)" (Tovu 776e5226, Jini 183915bb) cannot be rewritten without a force-push, so this note corrects them.
- Plan: H2c (sign-in half of seam item 1 + rest of item 7) with the full H2 gate rerun and closure-check on all three entries → H3 → C-c. One fresh Opus builder per batch, each pushed before the next.

| UTC | Elapsed in continuation (min) | Event | Continuation tokens (approx) |
|---|---|---|---|
| 08:38 | 0 | continuation start; report wording corrected | — |
| 09:07 | 29 | H2c done + full H2 gate rerun green (closure-check CLEAN on 3 entries) — LAST GREEN PAIR Tovu f9631ad5 / Jini 2cdeae0f | ~290k (H2c 270k) |
| 09:31 | 53 | H3 done, H3 gate green (union of named groups + all new S5 tests; prior-debt case only) — LAST GREEN PAIR Tovu 624f769c / Jini c9d06913 | ~530k (H3 223k) |
| 09:36 | 58 | C-c section + packed smoke pushed (Tovu 681e8568); scratch worktrees removed; no processes running | ~650k (C-c 109k, coordinator ~45k) — within the 700k raise |

## H2c — inventory

Recorded before any H2c seam edit (H2c builder; Tovu cdf3038a, Jini 575b95e4). T = `apps/website/src/features/external-mcp/`; lines are at cdf3038a: `external-mcp-oauth.ts` (O, 1302 lines) and `external-mcp-shared-oauth.ts` (S, 298 lines). Destination for every row is the H3 move to J `integrations/api-connections/hosted-mcp` (INT), unless a row says T. "Port" means a member of a new `HostedMcpSignInPorts` object, declared types-only in J `integrations/src/api-connections/hosted-mcp/contracts.ts` (core imports only), bound ONCE by Tovu as `tovuSignInPorts`.

| Symbol / need | Source file:line | Runtime closure today | Destination (port member) | Host vocabulary (injected or justified) |
|---|---|---|---|---|
| 11 flow fns (begin/complete code, device begin/poll, operator provider, sealed state, refresher, discovery, registry, refresh, DCR) | O:13-34 (calls 411, 543, 612, 832, 1020-1021, 1040, 1097, 1140, 1165, 1205); S:3-4 (calls 86, 88, 125, 233, 243, 256, 272) | `@jini-ai/oauth` values | `flow: OAuthFlowOperations` (core); T binds `oauthFlowOperations` | none |
| OAuth types (DeviceAuthorization, DiscoveredOAuthConfiguration, OAuthClient, OAuthClientAuthMethod, OAuthProviderDescriptor, OAuthTokenSet, OAuthAppOptions, OAuthProviderRegistry) | O:25-32; S:4 | oauth type re-exports of core | `@jini-ai/core/contracts/oauth` types | none |
| `new OAuthError(...)` (no provider, no client id, no grant, no DCR, no device auth; shared invalidState) | O:361, 476, 586, 610, 1199; S:37 | oauth class | `errors.oauth({code,message,operatorAction})`; T binds `new OAuthError(input)` (real instance) | operator actions name `Settings → External MCP`; O:586 message says "grant Tovu supports" → `copy` port |
| `instanceof OAuthError` (client-rejected, retryable poll, invalid_grant) | O:1179, 1223, 1293; S:99, 284 | oauth class | `errors.isOAuthError(error)`; T binds the real `isOAuthError` | none |
| `new ExternalMcpValidationError(m, f)` | O:349, 352, 1085, 1118 | T re-export of hosted class | `errors.validation(message, field)`; T binds the canonical class | O:1085 Mac-owner text, O:1118-1123 `TOVU_PUBLIC_URL` text → `copy` port; O:349/352 neutral MCP wording kept |
| `instanceof ExternalMcpSecretStoreUnconfiguredError` | O:956, 976 | T re-export of hosted class | `errors.isUnconfigured(error)`; T binds `instanceof` | none |
| reauth factory | O:1246, 1274, 1295 | T `createExternalMcpReauthRequiredError` | `errors.reauthRequired(input)`; T binds the ONE factory (same function) | class text/settings link stay T |
| store open/seal payload | O:478, 653, 655, 853-854, 954, 973, 1031 | T shims over `@jini-ai/mcp/federation/hosted` | `store.openPayload(sealer, record)` / `store.sealPayload(deps, identity, payload)`; T binds its existing shims (same identity, same envelope instance) | none |
| repo findByServerId/upsert/tryClaim/release lease | O:347, 671, 867, 990, 998, 1026, 1060, 1069, 1248, 1294; S:113, 134, 182, 204 | `deps.repo` (already injected) | stays `deps.repo` — MUST be the store's repo instance (A7); no second store member, so lease/CAS order cannot diverge | none |
| `rosterRefusalFor` | not used by sign-in (gate only, O:223-310) | — | gate side (MCP in H3) | none |
| projections authMode/oauthStatus | O:36-37, 351, 1030, 1251, 1267 | T contracts/core re-exports | `projections.{authMode,oauthStatus}`; T binds `resolveExternalMcpAuthMode`/`resolveExternalMcpOAuthStatus` | none |
| seal-AAD `formatAad` | O:8, 833; S:5, 124 | `@jini-ai/platform/secrets` | `aad.format({kind,version,parts})`; T binds platform `formatAad` | kind `oauth-redirect-state` v1 and parts = persisted format (neutral; bytes unchanged) |
| sign-in link | O:6, 1136; S:9, 244 | T browser-binding | `signInLink({callbackUrl,workspaceId,serverId})`; T binds `hostedMcpSignInLink` | T route path stays in T |
| messages / discovery policy / copy wrapper | O:4, 543-545, 612, 620, 1040, 1097, 1140, 1150, 1165, 1205 | T `platform/oauth/endpoint-safety` | `oauthMessages`, `discoveryPolicy({guard})`, `withCopy({call})`; T binds `tovuOAuthMessages`, `createTovuIssuerBoundDiscoveryPolicy`, `withTovuOAuthCopy` | Tovu copy → T |
| registration identity | O:320-332, 1074; S:44, 247 | T `tovuRegistrationIdentity` | `registrationIdentity {softwareId, clientName(record), sharedClientName}` (replaces S's separate required arg) | `tovu`, label ?? serverId, `Tovu` → T |
| post-connect log | O:340 | console.warn | `log.postConnectFailed({serverId,error})`; T binds the exact warn | `[external-mcp]` prefix → T |
| sign-in copy | O:361, 476, 586, 610, 1085, 1118-1123, 1199; S:34, 37, 131 | literals | `copy.*`; T binds exact bytes | `Settings → External MCP`, "Tovu", `TOVU_PUBLIC_URL`, example origin, "this Mac" → T |
| `randomBytes`/`randomUUID` | O:5, 1142; S:1, 136, 247 | `node:crypto` | kept (INT is `runtime: node` and already imports `node:crypto`) | none |
| `ToolInputError`, `nowIso`, `UUID` | O:2, 7 | core | kept (core) | none |
| `ExternalMcp*` record/grant/payload types | O:38-39; S:10 | T contracts re-exports of core | `@jini-ai/core/contracts/hosted-mcp` (S now; O at H3) | none |
| `ExternalMcpOAuthDeps`/`ExternalMcpOAuthService` | S:10, 270 | T contracts re-exports of J INT | `@jini-ai/integrations/api-connections/hosted-mcp` (relative after H3) | none |
| shared-owner `SharedOAuthOwnerStorage`, `SharedOAuthIssuingContext` | S:6, 13, 31 | T api-connections/shared-owner | narrow structural `SharedSignInOwner` + `SharedSignInIssuingContext` in S (records.read/compareAndSet, readContext, saveContext, tokensFor, readConnection) | adapter bodies stay T |
| project-keys `SiteOAuthBindings`, `KeyAttachments`, `ProjectKeyTransaction` | S:7-8, 14-16 | T project-keys | narrow structural `SharedSignInBindings` (read/set/remove), `SharedSignInAttachments` (attach/detach/isAttached), `SharedSignInTransaction` in S | adapters stay T |
| shared `inventory` VaultRecord | S:21 | `import('@jini-ai/platform/…')` | core `VaultRecord` (`@jini-ai/core/contracts/vault`) | none |
| shared ids `external-mcp`, `mcp:<serverId>`, `oauth`, `project`, `shared` device key | S:35-36, 50, 135-141 | literals | kept: persisted owner-vault identity/binding keys (changing them orphans saved shared credentials) — neutral persisted format, not host wording | persisted format |
| timeouts 15 000/10 000 ms, 600 000 ms hosted expiry, lease 45 000, reseal 3 | O:64, 72, 82, 544, 1137; S:87, 237, 245 | constants | kept (protocol timing, unchanged) | none |
| `createExternalMcpOAuthService` | O:1019 | — | neutral body → `createHostedMcpSignInService({...deps, ports})` (INT at H3); T keeps `createExternalMcpOAuthService(required, _optional)` bound to `tovuSignInPorts`, same signature/defaults | — |
| `createDeviceAuthorizationStore` | O:147-160 | none | already neutral; INT at H3 (T re-export) | none |

Not changed by H2c: routes, browser binding, Express, `contracts.ts`, composition, S4-owned files. Old exports/signatures stay; `createSharedExternalMcpOAuth` is internal to O (only caller) and takes `ports` in place of the H2b-added `registrationIdentity`.

## H2c

Scope: seam item 1 for the sign-in half, plus the rest of item 7. Done in place; H3 moves the code. Skills: `AI-Dev-Shop/agents/programmer/skills.md` header loaded.

### Ports
J `integrations/src/api-connections/hosted-mcp/contracts.ts` (types only, imports core only) gained `HostedMcpSignInPorts`, `HostedMcpOAuthFailure` and `HostedMcpSignInCopy`, each with attached @agent-notes. The notes say who fulfills each member, that it is one object per composition, real instances only, how error identity is kept, that the repo is the same instance, ordering, and that the AAD bytes and registration identity are stable.

| Member | Tovu binding (`tovuSignInPorts`, T `external-mcp-oauth.ts`, bound ONCE) |
|---|---|
| `flow: OAuthFlowOperations` | `oauthFlowOperations` (the same value) |
| `errors.oauth` / `errors.isOAuthError` | `new OAuthError(input)` / real `isOAuthError({value})` |
| `errors.validation` / `errors.isUnconfigured` | canonical `ExternalMcpValidationError` / `instanceof ExternalMcpSecretStoreUnconfiguredError` |
| `errors.reauthRequired` | `createExternalMcpReauthRequiredError` (the same function the gate gets) |
| `store.openPayload` / `store.sealPayload` | the existing T shims (same identity, same envelope instance) |
| `projections.authMode` / `projections.oauthStatus` | `resolveExternalMcpAuthMode` / `resolveExternalMcpOAuthStatus` |
| `aad.format` | platform `formatAad` (`oauth-redirect-state` v1 bytes unchanged) |
| `signInLink` | `hostedMcpSignInLink` |
| `registrationIdentity` | `tovuRegistrationIdentity` (tovu / label ?? serverId / Tovu) |
| `oauthMessages` / `discoveryPolicy` / `withCopy` | `tovuOAuthMessages` / `createTovuIssuerBoundDiscoveryPolicy` / `withTovuOAuthCopy` |
| `copy.*` | the exact earlier literals (Settings → External MCP, "Tovu", `TOVU_PUBLIC_URL`, "this Mac") |
| `log.postConnectFailed` | the exact earlier `console.warn` `[external-mcp] … post-connect step failed` |

How the brief's sign-in port list maps:
- **store.findByServerId/upsert/tryClaimLease/releaseLease** stay `deps.repo`. It is the store's repo instance (A7), and it is not a second port member, so the lease/CAS order is literally unchanged.
- **rosterRefusalFor** is not used by the sign-in; it belongs to the gate.
- **errors.unconfigured()/classify({error})** became the predicates `isUnconfigured`/`isOAuthError`. The sign-in never constructs an unconfigured error; it only recognizes one. Classification itself stays with the host's `classifyError`/`isSignInRefusal`, and the test proves it is unchanged.

Code:
- `createHostedMcpSignInService(required: deps & {ports}, _optional)` is the neutral body.
- `createExternalMcpOAuthService(required, _optional)` keeps the same signature and defaults and is `createHostedMcpSignInService({...required, ports: tovuSignInPorts})`.
- `createSharedExternalMcpOAuth` takes `ports` in place of the H2b-added `registrationIdentity`. Its only caller is O.
- `SharedExternalMcpOwner` is now narrow structural ports: `SharedSignInOwner` (records.read/compareAndSet, readContext, saveContext, tokensFor, readConnection), `SharedSignInBindings` (read/set/remove), `SharedSignInAttachments` (attach/detach/isAttached), `SharedSignInTransaction`, `SharedSignInIssuingContext`, and `inventory` returning the core `VaultRecord`. The Tovu adapters (shared-owner, site-references, attachments) are untouched, and production assigns to these ports unchanged (main tsc 0).
- `external-mcp-shared-oauth.ts` now imports only `node:crypto`, `@jini-ai/integrations/api-connections{,/hosted-mcp}` and core.
- The O sign-in body uses no oauth/platform/mcp/T value. A grep audit of lines 296-297 and 366-1333 finds no `new OAuthError`, `instanceof OAuthError`, `formatAad`, `hostedMcpSignInLink`, `tovu*`, `resolveExternalMcp*`, open/seal shims or `console`. `Tovu` is left only in why-comments.

### Semantics preserved
Same call order and counts. One `openPayload`/`sealPayload` per former call site. The repo calls are unchanged. `onConnected` runs once, after a durable write, and its failure goes to `log` (h2b test still 9/9; h2c second host). There are no new reads, opens or network calls. The H0 counters test is green (6/6) and the BASELINE rollback is ok.

### New tests (new file only): T `features/external-mcp/__tests__/h2c/sign-in-ports.test.ts`, 6/6
1. A second host signs in with fake flow ops. Its own softwareId/clientName, link path, copy, AAD recorder and validation/OAuth error factories are used. The test checks begin options, the ownerKey, the messages passed, AAD kind/version/parts, the hosted link, callback→connected with onConnected once, no-origin/no-device/shared refusals in second-host words, and no Tovu vocabulary in output.
2. A second host's onConnected failure goes to its log port, and sign-in still succeeds.
3. Tovu's binding uses the real implementations by identity. Every copy string is a byte-substring of the BASELINE checkout's oauth/shared files.
4. With real Tovu wiring, a provider token error carrying token/secret/URL/path canaries arrives as a real `OAuthError`, and neither its message nor its operatorAction carries a canary.
5. With real wiring, `reportAuthFailure` with a canary provider error gives the canonical reauth error with no canary, and the row becomes needs_reauth.
6. Error identity:
   - The canonical validation error is classified `validation` and counts as a sign-in refusal.
   - The unconfigured error is classified `unconfigured`.
   - A real OAuthError is recognized by the port and by `isAgentPluginSignInRefusal`; an imitation with the same fields is NOT.
   - The reauth error has the canonical class and is not retryable.
- Mutations (raw `h2c-mutations.txt`), all red then restored: hardcoded softwareId → 1 fail; imitation OAuth predicate → 1 fail; swallowed post-connect failure → 1 fail.
- Red→fix: in the first gate run, typecheck:tests went 13→20; all 7 new errors were in the new test (`.catch` union types). Fixed with a typed `rejection()` helper (f9631ad5), and the FULL gate was rerun (below).

### S4 overlap
None. Tovu files touched: `external-mcp-oauth.ts`, `external-mcp-shared-oauth.ts`, the new h2c test and this report. Jini: `integrations/src/api-connections/hosted-mcp/contracts.ts`. No agent-plugins/connect/composition/assistant/routes/browser-binding/lockfile/changeset files. `mcp-host-bindings.ts` is only imported by the new test.

### Edited lines
Seam lines truly edited: T oauth +137/−106 (the 49-line binding included), shared +64/−36, J +72/−2. That is below 600, so no re-cut was needed.

### Pushed SHAs (H2c)
- Jini: 2cdeae0f06ef8a2a67497eca8bc57704bf4542db (ports contract).
- Tovu:
  - 22dd70ba5e564aa0f4ffb899556f3fed58b5eafd (inventory)
  - 7f6ea0ce96d337c333c0bd3c033ed7be5f7023b6 (seam)
  - 42bf47f8b794677a40f5dc67dbf52cb2946c490b (test)
  - f9631ad50b17c238e841a637481bd72b9cbbc7fc (test typing fix)
  - plus this report commit.

### Findings (listed, not fixed)
- Moved why-comments in the sign-in body still say "Tovu". H3 moves them byte-exact and rewords them only if the N1 guard really rejects them.
- The "H2c handoff" is at /home/user/s5/H2C-HANDOFF.md (untracked). It gives exact line ranges for what H3 moves.

## H2 gate (rerun after H2c; tested Tovu f9631ad5 / Jini 2cdeae0f; raw /home/user/s5/raw/h2c-g-*.txt, summary h2c-gate-summary.txt, first run h2c-gate-summary-run1.txt)
Run 1 was red on one row: typecheck:tests showed 20 errors, 13 of them baseline and 7 from the new test. Every other row of run 1 matched run 2. After the fix (f9631ad5) the FULL gate was rerun:

| gate | result |
|---|---|
| J core/oauth/mcp/integrations build + tsc | all EXIT 0 |
| closure-check: api-connections, …/hosted-mcp, mcp/federation/hosted (src/JS/.d.ts) | CLEAN (EXIT 0) |
| J API 20 files + conformance | 21 files / 372 |
| J mcp hosted | 7/7 |
| J oauth | 40 files / 714 |
| neutral-host api-host-moves | 2/2 |
| relink (`link:jini`) | EXIT 0 |
| T main tsc | 0 errors |
| typecheck:tests | 13, the same set as H2b, compared file+code |
| T sign-in/gate | 141/142; only the prior-debt case fails (agent-daemon-server loopback/HTTPS), with the identical assertion message to H2b |
| T api / connect / store / nine | 156 / 147 / 284 / 58, all pass |
| T new h1a+h1b+h2b+h2c | 27/27 |
| H0 frozen SQLite / BASELINE rollback | 6/6 / ok, EXIT 0 |
| guard-gate h2c | MATCHES BASELINE (EXIT 0) |
| xp-gate h2c | XP1–XP5 clean |
| strict lint changed production | J eslint EXIT 0; T biome = baseline counts (1 noConfusingVoidType, 1 noNonNullAssertion, 2 useImportType, all in pre-existing lines) |
| hashes | T OK; J only the 3 allowance fixtures differ (harness.ts, unit-deps.ts, token-store fixtures.ts), as expected |
| existing-test audit vs pins | T: only M `shared-owner.integration.test.ts` (coordinator ruling (a)). J: only the 12 allowance-table files M (raw `h2c-audit-{t,j}.txt`). Everything else is A |

Not covered until H3: the hosted-mcp entry's runtime closure. The sign-in runtime is still in T, and its move-readiness is shown by the import/grep audit above. H3 reruns the closure on the moved code.

**LAST GREEN PAIR: Tovu f9631ad5 / Jini 2cdeae0f** (the full H2 gate including H2c; the report commit follows).

## H3 — inventory

Source pins: Tovu a2af906e; T = apps/website/src/features/external-mcp/. Blobs: `external-mcp-oauth.ts` 243cf0762dfc807701de57e52409f326e3e11279 (1333 lines), `external-mcp-shared-oauth.ts` 3d8cf04a92de595bcd29c3631e0be6b80c57a5ea (326 lines). Copies are literal line-range copies (sed), plus necessary import rewrites only.

| symbol | source T file:line | runtime closure | destination | host vocabulary |
|---|---|---|---|---|
| `ExternalMcpConnectionGateDeps` (now exported), `HostedMcpConnectionGatePorts` (+@agent-note) | oauth.ts:143-170 | types: core UUID, core/contracts/hosted-mcp repo/revocation reason | J mcp/src/federation/hosted/connection-gate.ts | none: recovery text/tool ids/reauth/revoked/log are ports |
| `createHostedMcpConnectionGate` (+why-doc) | oauth.ts:172-222 | `rosterRefusalFor` (./revocation.js), mcp/federation ports types (../ports.js) | same | returns protocol value `"current-grants-checked"` (J federation contract) |
| `offerPluginAccessCard`, `assertProvisioningPluginEnabled`, `readConnectionRowOrRefuse`, `assertNotAwaitingReauth` (+docs) | oauth.ts:248-294 | core `ToolInputError`; ./auth.js projections | same | refusal ids `turned-off`/`tool-not-allowed`/`write-not-allowed` = core revocation-reason protocol values |
| header why-doc, `CONNECT_TIMEOUT_MS`, `REFRESH_LEASE_MS`, `CLEAR_TOKEN_RESEAL_ATTEMPTS` (+docs) | oauth.ts:22-64 | none | J integrations/src/api-connections/hosted-mcp/sign-in.ts | none (timeouts are protocol bounds, unchanged values) |
| `createDeviceAuthorizationStore` (+doc) | oauth.ts:127-142 | Map only | same | none |
| `SignInDeps`, `ExternalMcpOAuthServiceDeps` | oauth.ts:296-297 | types | same | none |
| `oauthClientOptions` … `createHostedMcpSignInService` (all private helpers) | oauth.ts:366-1333 | node:crypto randomBytes; core primitives nowIso/UUID; core/contracts/{oauth,hosted-mcp} types; ./contracts.js; ./shared-sign-in.js | same | registration identity, link, messages, copy, errors, AAD format, store seal/open all via `HostedMcpSignInPorts` (H2c); grant ids/`urn:ietf:params:oauth:grant-type:device_code`/auth methods = RFC protocol values; AAD kind bytes come from the host `aad.format` port |
| `external-mcp-shared-oauth.ts` WHOLE (`createSharedExternalMcpOAuth`, `SharedExternalMcpOwner`, Shared* narrow ports) | shared-oauth.ts:1-326 | node:crypto; `../index.js` (api-connections); `./contracts.js`; core types | J integrations/src/api-connections/hosted-mcp/shared-sign-in.ts | owner/client name/copy via ports (H2c) |
| stays T: `ExternalMcpReauthRequiredError`, `createExternalMcpReauthRequiredError`, `externalMcpSettingsDeepLink`, `tovuConnectionGateVocabulary`, `createExternalMcpConnectionGate`, `tovuRegistrationIdentity`, `tovuSignInPorts`, `createExternalMcpOAuthService` | oauth.ts:66-125, 224-246, 298-364 | T | T (thin shims + re-exports of `createDeviceAuthorizationStore`, `createHostedMcpSignInService`, `createHostedMcpConnectionGate`, `HostedMcpConnectionGatePorts`; shared-oauth.ts re-exports) | Tovu bytes unchanged |

## H3

Builder: EXTRACT-S5-C H3 (slug s5c-h3). Programmer skills header (`Jini/AI-Dev-Shop/agents/programmer/skills.md`) loaded (header only). Source pins Tovu a2af906e / Jini 2cdeae0f.

### Moves and provenance (cross-repo literal line-range copies; source blobs at Tovu a2af906e)
- Gate → J `packages/mcp/src/federation/hosted/connection-gate.ts` (134 lines): T `external-mcp-oauth.ts` (blob 243cf0762dfc807701de57e52409f326e3e11279) lines 144-221 (`ExternalMcpConnectionGateDeps`, `HostedMcpConnectionGatePorts` + attached @agent-note, `createHostedMcpConnectionGate` + its why-doc) and 243-291 (`offerPluginAccessCard`, `assertProvisioningPluginEnabled`, `readConnectionRowOrRefuse`, `assertNotAwaitingReauth` + docs). Necessary edits only: 6 import lines (core `ToolInputError`, core UUID, core/contracts/hosted-mcp types, `../ports.js`, `./revocation.js`, `./auth.js`) and `interface ExternalMcpConnectionGateDeps` → `export interface` (the Tovu wrapper keeps its signature through it). Exported from the `./federation/hosted` barrel. No integrations/OAuth import.
- Sign-in → J `packages/integrations/src/api-connections/hosted-mcp/sign-in.ts` (1047 lines): same T blob lines 22-64 (header why-doc + `CONNECT_TIMEOUT_MS`/`REFRESH_LEASE_MS`/`CLEAR_TOKEN_RESEAL_ATTEMPTS` + docs), 127-142 (`createDeviceAuthorizationStore` + doc), 293-297 (`SignInDeps`, `ExternalMcpOAuthServiceDeps` + doc), 366-1333 (`oauthClientOptions` … `createHostedMcpSignInService`). Imports: node:crypto, core/primitives, core/contracts/{oauth,hosted-mcp}, `./contracts.js`, `./shared-sign-in.js`.
- Shared sign-in → J `.../hosted-mcp/shared-sign-in.ts`: T `external-mcp-shared-oauth.ts` blob 3d8cf04a92de595bcd29c3631e0be6b80c57a5ea WHOLE (326 lines); 2 import specifiers rewritten (`@jini-ai/integrations/api-connections` → `../index.js`, `…/hosted-mcp` → `./contracts.js`).
- `hosted-mcp/index.ts` now exports `createHostedMcpSignInService`, `createDeviceAuthorizationStore`, `createSharedExternalMcpOAuth` + shared owner/port types and `SharedMcpConfiguration` (its @agent-note updated: "Types only" → "contracts and values … Imports only core and this package"). package.json exports/jini runtime entries already existed (no package.json, no lockfile edit). Changesets `.changeset/s5c-h3-mcp.md`, `.changeset/s5c-h3-integrations.md`. @agent-notes present in emitted .d.ts (contracts 32, shared-sign-in 5, connection-gate 1, index 1).
- Tovu shims: `external-mcp-oauth.ts` 1333 → 169 lines (reauth error/factory, settings link, `tovuConnectionGateVocabulary` + `createExternalMcpConnectionGate`, `tovuRegistrationIdentity`, `tovuSignInPorts`, `createExternalMcpOAuthService` — exact original bytes — plus re-exports of `createHostedMcpConnectionGate`, `HostedMcpConnectionGatePorts`, `createDeviceAuthorizationStore`, `createHostedMcpSignInService`); `external-mcp-shared-oauth.ts` 326 → 2 lines (re-exports). One biome fix in the shim (`import type` for `ExternalMcpServerRecord`). assistant/{agent-daemon-port,external-mcp-connection-source}.ts, composition/{app,deps}.ts, routes and browser binding untouched.
- Lines moved: 1500 T lines deleted (+11), J +1507 production lines (134 + 1047 + 326).

### Necessary non-import edits (exact before → after; behaviour-preserving)
- **`exactOptionalPropertyTypes`** (J `tsconfig.base.json`; Tovu does not set it): 15 tsc errors on the literal copy (raw `h3-tsc-int-1.txt`; full diffs `raw/h3-signin-vs-source.diff`, `raw/h3-shared-vs-source.diff`). Type-only widenings: sign-in `resource?: string;` → `resource?: string | undefined;` (StoredOAuthEndpoints); `{ readonly resource?: string | null }` → `{ readonly resource?: string | null | undefined }` (toStoredEndpoints); `browserBinding?: string }` → `browserBinding?: string | undefined }` (sealedRedirectState); shared `readonly resource?: string;`/`readonly issuer?: string;` → `… | undefined;` (SharedMcpConfiguration); `redirectUri?: string }` → `redirectUri?: string | undefined }` (configure). Value sites (8): `resource: X` → `...resourceOption(X)` (sign-in 4 sites; new 4-line private helper `resourceOption`, documented) and `resource: context.identity.resource` → `...(context.identity.resource === undefined ? {} : { resource: context.identity.resource })` (shared 4 sites). Runtime difference: an absent audience is now an absent key instead of `resource: undefined`; `@jini-ai/oauth` treats both identically (`input.resource === undefined`, authorization-code.ts:102/143/178). Evidence: T sign-in group still 141/142 (prior-debt failure only) and the neutral host signs in through real oauth.
- Missing type import: `ExternalMcpOAuthStatus` added to the core/contracts/hosted-mcp import (it came from T contracts before).
- **Real N1 rejection** (guard-gate run 1: `N1-consumer-identity packages/integrations/src/api-connections/hosted-mcp/sign-in.ts: forbidden source reference "Tovu"`, raw `j-guard-summary-h3.txt` run 1 → `h3-gate-summary-run1.txt`). Rejected comment lines only (raw `h3-n1-before.txt` / `h3-n1-after.txt`): 134 "as Tovu's own," → "as the host's own,"; 135 "which Tovu may replace" → "which the host may replace"; 238 "who Tovu is to it" → "who the host is to it"; 298 "Tovu's internal grant alias" → "The internal grant alias"; 324 "no other grant Tovu implements" → "no other grant this sign-in implements"; 326 "neither grant Tovu" → "neither grant this sign-in"; 524 "one Tovu minted … so Tovu's to replace" → "one the host minted … so the host's to replace"; 637 "a client Tovu minted" → "a client the host minted". All other why-comments byte-exact.
- Session-caused defect fixed: the first gate copy used off-by-a-few ranges (dropped `offerPluginAccessCard`'s doc, carried the sign-in's `ExternalMcpOAuthDeps` doc); found by diffing against the source ranges, fixed in Jini 0facef63 (comment-only), diff now = imports + `export` only.

### Neutral-host proof (new; public entries only)
`examples/neutral-host/src/hosted-mcp-sign-in.test.ts` (2 cases): the "Studio" host wires REAL `oauthFlowOperations`/`OAuthError`/`isOAuthError`/`createOAuthUrlGuard`/`defaultOAuthMessages` (@jini-ai/oauth), REAL hosted store + `createHostedMcpConnectionGate` (@jini-ai/mcp/federation/hosted; own toy vault/sealer/credential ports), REAL `createHostedMcpSignInService` + `createDeviceAuthorizationStore` (integrations hosted-mcp), `formatAad` (platform/secrets), against an in-process fake OAuth server (device grant + refresh) and a Higgsfield-shaped provider (`lumafield-studio`, tool `generate_clip`, plugin `studio.media.lumafield`). Flow: device sign-in (pending → connected, onConnected once) → tool call with the issued bearer → token expiry + refresh denied with canary body → host terminal `StudioRelinkError` ("Do not retry this tool.", retryable false), row `needs_reauth` → next call refused by the gate's row read with zero token requests → reconnect → tool works with the new bearer; plugin-off refusal uses host copy. Canaries (token, secret, URL, path) and first-host words never in model-facing text. Varied: workspace/server/plugin ids, settings path, reauth code, softwareId `studio-agent`, client names, link path. `examples/neutral-host/vitest.config.ts` aliases `@jini-ai/mcp/federation/hosted` and `@jini-ai/oauth` to exactly their exports-map targets because neutral-host/package.json does not list them and the lockfile may not change (disclosed; the packed consumer must install them — see H3-HANDOFF). Tovu: new `__tests__/h3/moved-shims.test.ts` (3: identity re-exports, Tovu names/arity/bindings, no moved body left).

### H3 gate (tested Tovu 624f769c / Jini c9d06913; script /home/user/s5/scratch/h3-gate.sh; raw /home/user/s5/raw/h3-g-*.txt, summary h3-gate-summary.txt; run 1 h3-gate-summary-run1.txt)
| check | result |
|---|---|
| J core/oauth/mcp/integrations build + tsc | 0/0 each |
| closure-check api-connections, …/hosted-mcp (36 src/31 JS/33 dts files, now with runtime), mcp/federation/hosted (17/14/15) src+JS+.d.ts | EXIT 0, CLEAN |
| J API + conformance | 21 files, 372/372 |
| J mcp hosted | 2 files, 7/7 |
| J oauth | 40 files, 714/714 |
| neutral-host api-host-moves (unchanged) + new hosted-mcp-sign-in | 2 files, 4/4 |
| relink; T main tsc | 0; 0 errors |
| T typecheck:tests | EXIT 2, 13 errors = the 13 baseline set (prior debt) |
| T sign-in group | 141/142; only the prior-debt `agent-daemon-server` desktop-loopback case |
| T api / connect / store / nine | 156/156, 147/147, 284/284, 58/58 |
| T new S5 tests h1a/h1b/h2b/h2c + h3 | 30/30 (27 + 3 new) |
| H0 frozen SQLite; BASELINE rollback | 6/6; EXIT 0 ok:true (5 checks) |
| guard-gate h3 | run 1 EXIT 1 (N1 "Tovu" in sign-in.ts comments, NEW) → reworded → run 2 EXIT 0 MATCHES BASELINE, FLAGS 0 |
| xp-gate h3 | EXIT 0, XP1–XP5 clean |
| hashes T; tool-metadata.baseline.json a0d6b428… | EXIT 0; EXIT 0 |
| hashes J | EXIT 1: the same 3 H2 required-input-allowance fixtures as at H2c (harness.ts, unit-deps.ts, token-store fixtures.ts); none touched by H3 |
| strict lint J changed production; biome T shims | 0; 0 |
| existing-test audit vs S5 pins | T: only shared-owner.integration.test.ts (coordinator ruling (a), pre-H3); J: only the H2 allowance files (pre-H3); H3 added tests only |

Optional PostgreSQL replay: not run in H3 (optional; disclosed, not counted).

### S4 overlap (actual comparison with origin/cloud/extract-s4)
H3 changed — Tovu: `features/external-mcp/external-mcp-oauth.ts`, `external-mcp-shared-oauth.ts`, `__tests__/h3/moved-shims.test.ts`, this report. Jini: `packages/mcp/src/federation/hosted/{connection-gate,index}.ts`, `packages/integrations/src/api-connections/hosted-mcp/{sign-in,shared-sign-in,index}.ts`, `.changeset/s5c-h3-{mcp,integrations}.md`, `examples/neutral-host/{vitest.config.ts,src/hosted-mcp-sign-in.test.ts}`. None of these paths is changed on cloud/extract-s4 (T 486 / J 36 changed paths compared). Adjacent only: S4 adds `examples/neutral-host/src/connect-plugin-host.test.ts` (same folder, different file; if S4's file needs mcp/oauth it may want the same alias or real devDependencies) and edits `packages/core/src/contracts/hosted-mcp*` (H3 did not edit core). Merge advice: no textual conflict expected; if S4 adds neutral-host devDependencies for @jini-ai/mcp/@jini-ai/oauth, `vitest.config.ts` can be deleted.

### Minor findings (listed, not fixed)
- neutral-host/package.json lacks @jini-ai/mcp and @jini-ai/oauth devDependencies (lockfile rule) — test resolves them through the alias file; neutral-host `tsc` typecheck of the new file would not resolve them until the deps are added.
- `hosted-mcp/shared-sign-in.ts` imports the `../index.js` api-connections barrel (as the handoff specified); a narrower module import would shrink the closure.
- The literal copies still carry first-host file references that N1 does not reject (e.g. `mcp-federation/registrations.ts`, `external-mcp-store.ts`, `createExternalMcpConnectionGate`, `console.warn` in the gate's and sign-in's why-comments) — left byte-exact per the comment rule.

### Pushed SHAs (H3)
- Jini: 50f6e4c18ee37d5521d9ff47b180c45e0ffcd1cd (moves), c7e7cdba744c29ba21e0f9e1a0402ca8acb54343 (SharedMcpConfiguration export), 9cb27b0dd3e2ac34177f9f8d5c6e24f76e0969b8 (neutral host), 0facef637517cd7a4216f61009c2ad16a5a56931 (gate range fix), c9d06913a35740b4e413d7465cbac1a3a9a20961 (N1 rewording).
- Tovu: fdae3612f8fc0f0ad7ac203e28c79aa52ec48969 (inventory), 3d22efc021d84b81850a8953fe149be38dee0f21 (shims), 624f769c0a96b9e4564d3068f05efca95e712f57 (h3 test); this report commit follows.

**LAST GREEN PAIR: Tovu 624f769c / Jini c9d06913** (full H3 gate, run 2; prior debt disclosed above).

## C-c — ready for Claude review

Compact handoff. It points to the earlier sections and does not repeat them. Written 09:31–09:40Z by the C-c builder. Raw output: /home/user/s5/raw/cc-*.txt (untracked).

### Pins, branches, tips
- Tovu (AINSEP/Tovu, `cloud/extract-s5`): pin c3801c833a191be51753dcdecd133b0cad6f8945. Tip before this section: 9ce18a6560a62b1e6f1fee862024b1a76c638ea2 (report-only). Tested source: 624f769c0a96b9e4564d3068f05efca95e712f57.
- Jini (AINSEP/Jini, `cloud/extract-s5`): pin 4044fe3c0fa34b1f903c5d20a6b4de7714cde573. Tip: c9d06913a35740b4e413d7465cbac1a3a9a20961 (tested source = tip).
- **LAST GREEN PAIR: Tovu 624f769c / Jini c9d06913** (full H3 gate, see "### H3 gate"). Report-only commits after 624f769c: 9ce18a65 and this section's commit. They change no source.
- Every pushed SHA, from `git log --format=%H <pin>..HEAD`, newest first, verified equal to origin at 09:34Z:
  - Tovu (41): 9ce18a6560a62b1e6f1fee862024b1a76c638ea2 624f769c0a96b9e4564d3068f05efca95e712f57 3d22efc021d84b81850a8953fe149be38dee0f21 fdae3612f8fc0f0ad7ac203e28c79aa52ec48969 a2af906e698c479f343987b265c2b48752d53d25 4585fe98757aceaa1ffd052f33c8730916d12088 f9631ad50b17c238e841a637481bd72b9cbbc7fc 42bf47f8b794677a40f5dc67dbf52cb2946c490b 7f6ea0ce96d337c333c0bd3c033ed7be5f7023b6 22dd70ba5e564aa0f4ffb899556f3fed58b5eafd cdf3038a1986119bbc5b8669c4a62e4cac67fe97 d6b3d10209c1d029d06b489b5c6571a63064f56c aba3638cc7e8fb55862fe81f6458a2b962d285b2 d86c41d8432990558d72e1ca4a55d95643847f79 f88953d84a1edfdb58d1ff1eb7f84ccab347888b 8f61f08ef1f30306fdce26d3030a05a37b15625d e8080710aafc1871e652a189f8774aa9ceb648d4 39c1c7c8ddc214cc514cd944a3d7971d900db382 019283549227ead22c7c0f8c24e84bc274f58379 2c717cfb33673f1b7b87d14e671a11ce26dcbd24 776e5226bcd211cbd1b26752590ce35422026242 55214a2f34cee7afb1fbe729757ece4d7704034d 8496ae7357c7c7be34b565472ab97221814c2c48 63ba11b3503c24374ee074b4464f8a63ccd4c0ec ddf430cc17c3439b44b80de64d9b9f808d2372b1 ce2ec9250b3a7862eb1c0134411a735af7cbd4ac 045f6258ef933e6cd936477e0b93001e58c61d83 eb3736f46457a5211a61f115347c3b79d4cbc536 559cbb436320d18c08cb0e39f34fd30a5397ecd8 5162e3db150286cd8806bd780e18bfcbfe445afe d075d1e44528f6d2651022473f89321f694b8be7 9355bd8caa68ef6ee928f2a917debddc6c98e967 1472d1c26ea74c8ab2a2d4258dde6c926906c401 8aef56e258d044173d21f7923e5babb34bf72c9c 8c563ef5a213abb3c6fe49c579ad09b745f7c531 06863b2da32287dafb17408d99affc3b1ced5301 55111a2ebb83fb464dd2ce8af9f442c5a95d20b9 b744f77cc5c17c55ac5100b4a7019b4cc9adc7c4 fde3156848329cd028e90843c190659ffbc231f1 31504fd7c16adf756e313da7f3d8c77087630139 a6e2921d0952cab53218a38d28ef79b387a3dee1. This section's commit is added after them.
  - Jini (21): c9d06913a35740b4e413d7465cbac1a3a9a20961 0facef637517cd7a4216f61009c2ad16a5a56931 9cb27b0dd3e2ac34177f9f8d5c6e24f76e0969b8 c7e7cdba744c29ba21e0f9e1a0402ca8acb54343 50f6e4c18ee37d5521d9ff47b180c45e0ffcd1cd 2cdeae0f06ef8a2a67497eca8bc57704bf4542db 575b95e4cf86ae21d347ea3efb302c5cec5c08e2 9a669a56d188dbcc6dca037ba16e74d0efd459f9 5525436891351a57315caf12c409f5d702b964b3 183915bb0ae25c659ec5a1273c97a4b0ba992910 f1e536487557a5f20e786de477d72d7c16ef1524 d0a76a53c72c99d27a3de4bf48c9d55ec37e14bc 6ab1d818454a2b7cbeefdaec618e6f2000aefb3b 07766d6e7db863e2a7ae7c6bcc6c2b860affbc2b 18e2d521cc5f6c1db0e88c9480dae10e6d3ec104 fabc0b09f7b7be331196fe261f44bfabb400f044 0203256288d36d38bac90cc0f3f49487db252b9b 883db6908a72947b81fe7c9ce6000893bdf1e4bb 60f593071fbec15fda1ada9b3df886ba6c20e14c 0b7183c3afe92f9e685d27b744739a79ab328b10 27063efcc7c0327f517429812e167174d1a80448.

### Packed checkpoint smoke (scratch only; Jini c9d06913; raw cc-*.txt)
Packed: `pnpm pack` of core 0.6.23, oauth 0.6.19, mcp 0.6.23, integrations 0.6.19 and platform 0.6.23, written to /home/user/s5/scratch/cc-packs. All 5 exits were 0 (cc-pack.txt). The core/oauth/mcp/integrations dist was built at 09:23Z, after the tip commit. Platform is unchanged since the pin; its dist dates from setup. The throwaway consumer is /home/user/s5/scratch/cc-consumer. It is `npm install`ed from the five `file:` tarballs only, with an override pinning core to its tarball. There are no workspace links: the only symlinks are in `.bin`. One gap: `@jini-ai/protocol` (an mcp dependency, not in the closure) came from the npm registry at 0.6.19, not from a tarball. `@jini-ai/db` (an integrations dependency) did not install, and no checked import needed it.

| Check | Command | Result |
|---|---|---|
| install | `npm install` (tarballs) | EXIT 0, 108 pkgs (cc-install.txt) |
| plain-node import | `node imp.mjs` | EXIT 0. All entries load: mcp/federation/hosted 43 exports, integrations/api-connections 28, …/api-connections/hosted-mcp 3, oauth 51, platform/secrets 33, core 145. `createHostedMcpConnectionGate`, `createHostedMcpSignInService`, `createDeviceAuthorizationStore` and `createSharedExternalMcpOAuth` are functions. `oauthFlowOperations` is an object (cc-import.txt) |
| core/contracts/hosted-mcp (type-only) | resolved by tsc below | The .d.ts is `export type *` of vocabulary/record/config. The exports map has types+import |
| strict nodenext tsc, `skipLibCheck:false` | `tsc -p` (module/moduleResolution nodenext, strict) | **EXIT 2, 1 error, in a library file, not the consumer**: `oauth/dist/dns-pinned-transport.d.ts(21,50) TS2339 'dispatcher' not on RequestInit`. This is **prior debt**: the file is unchanged since the Jini pin. It needs undici/DOM `RequestInit` typing (cc-tsc.txt). A first run also showed one error in my own probe line (InMemory repo constructor arity). I fixed it and reran |
| strict nodenext tsc, `--skipLibCheck` | same | **EXIT 0**. The consumer uses core/contracts/hosted-mcp types, `HostedMcpConnectionGatePorts`, `SharedExternalMcpOwner`, `SharedMcpConfiguration` and the return types of the gate and the sign-in service (cc-tsc-skiplib.txt) |
| neutral-host proof from packed install | J `examples/neutral-host/src/hosted-mcp-sign-in.test.ts` copied **byte-identical** (sha256 2a4a78dad45c619b… on both), run with vitest 2.1.9, no alias config | **EXIT 0, 2/2 pass**. Real `oauthFlowOperations`, the hosted store and sign-in, run against the test's in-process fake OAuth server (cc-neutral-proof.txt). `api-host-moves.test.ts` was not run here: it imports `@jini-ai/agent-plugins`, which is outside the packed closure |
| packed closure (js + .d.ts) | scratch copy of tools/closure-check.mjs with the mode list `['js','dts']`, because tarballs ship no src (4-line diff), on the unpacked tarballs | **EXIT 0, CLEAN**. mcp/federation/hosted js 14/dts 15 files; api-connections 28/29; …/hosted-mcp 31/33. 0 non-self, non-core `@jini-ai` specifiers (cc-closure.txt) |
| `@agent-note` in packed .d.ts | grep | mcp/federation/hosted 43 (13 files); integrations api-connections 47 (9 files, including hosted-mcp 38 in 3 files); core contracts/hosted-mcp 36 (3 files) plus 1 on hosted-mcp.d.ts; oauth 1 (cc-agent-notes.txt) |

Not done (this is out of scope for C-c): the full X1 Tovu tarball replay and desktop certification.

### Pointers (earlier sections)
- Inventories: "## H1a — inventory", "## H1b — inventory", "## H2a — inventory and 14-import ledger", "## H2b — seam inventory", "## H2c — inventory", "## H3 — inventory".
- Provenance, comment custody and exact N1 rewordings: H1a "### Provenance / comment custody" (N1 list), H1b "### Provenance / comment custody" (N1 list, store.ts), H3 "### Moves and provenance" and "### Necessary non-import edits" (the c9d06913 N1 rewording).
- H2 ledger of all 14 reviewed imports: "### Ledger: 14 reviewed imports" (H2a). Result: all 14 removed; closure-check CLEAN over src/JS/.d.ts with a negative control (29 violations on base) under "## H2a". Re-proved in "## H2 gate" (H2b and the H2c rerun) and the H3 gate. Packed js/.d.ts proof is above. Other legacy entries and manifest edges are not claimed.
- Frozen SQL/key recording and hashes: "### Hashes (sha256, at baseline)", "### Fixture mint (once)" (H0). BASELINE rollback: H0 "### BASELINE rollback" (ok:true, 5 checks). Reruns are green in the H1a, H1b (×3), H2b, H2c and H3 gates.
- PostgreSQL: **proven at H0** (G-mcp replay plus the 20/20 harness; see H0 "### PostgreSQL status"). The coordinator records it as proven for the H0/H1a main flow. **Not rerun after that**: H1b listed it as optional, and H2/H3 did not rerun it.
- S4 overlap: none in owned files. S4 has additive package.json entries only. The adjacent files are S4's `examples/neutral-host/src/connect-plugin-host.test.ts` and its edits to `packages/core/src/contracts/hosted-mcp*`, which H3 did not edit. Merge advice is in H3 "### S4 overlap" and the per-batch S4 sections.
- Named prior debt: T `external-mcp-oauth-loopback-wiring.unit.test.ts` "desktop accepts a loopback…" case (red at the pins). T `typecheck:tests` has 13 baseline errors (the brief lists 12; the extra one is from S3 1ef11e22). The packed-consumer libcheck error above is also prior debt.
- Coordinator rulings: (c) was implemented in Jini 6ab1d818 and then **reverted**, superseded by ruling (a). Under (a), descriptor callback rules are a required input, with **one Tovu test wiring edit** in `features/api-connections/__tests__/shared-owner.integration.test.ts`. That edit is the coordinator's ruling, not a builder waiver (see "### Coordinator decisions (later)", "## H2a").

### Open issues / risks listed by builders (not fixed)
1. `examples/neutral-host/package.json` lacks @jini-ai/mcp and @jini-ai/oauth devDependencies. The test resolves them through `vitest.config.ts` aliases. **An owner ruling is needed on the devDependency/lockfile change.** The packed smoke shows the test passes against real installs.
2. `hosted-mcp/shared-sign-in.ts` imports the `../index.js` api-connections barrel. A narrower import would shrink the closure.
3. Moved why-comments keep first-host file/symbol references that N1 does not reject. They were left byte-exact.
4. Store complexity split: `resolveExternalMcpAccessToken` was at complexity 11 and was split in H1b. A reviewer should confirm the split preserves order.
5. Envelope id rotation: baseline reseal writes mint a new vault id and created_at per rewrite. "Ids preserved" holds for server rows, kinds and owner, not for envelope ids (H0 findings).
6. Foreign-kind refusal is three-layered (H1b): store owner/kind check, vault context check, and platform `VaultError`. Each refuses with 0 opens/seals. A reviewer may want one authoritative layer.
7. The packed oauth .d.ts fails `skipLibCheck:false` on `RequestInit['dispatcher']` (prior; noted above).

Independent Claude verdict and next-session owner approval happen outside this build.


### Continuation shutdown
- Finished 2026-11-09T09:36Z, 58 minutes into the 90-minute continuation. About 650k of the 700k continuation tokens were used. Neither cap was reached.
- Every batch is complete and pushed: H0, H1a, H1b, H2 (H2a+H2b+H2c, with the full H2 gate rerun and closure-check CLEAN on all three entries), H3 with its accumulated gate, and the C-c handoff.
- Final tips, verified with git ls-remote: **Tovu cloud/extract-s5 = this report commit** (the tested source is 624f769c0a96b9e4564d3068f05efca95e712f57; later commits are report-only), **Jini cloud/extract-s5 = c9d06913a35740b4e413d7465cbac1a3a9a20961**.
- **LAST GREEN PAIR: Tovu 624f769c / Jini c9d06913.**
- Disclosed and not counted green:
  - the named prior-debt loopback case;
  - the 13-error typecheck:tests baseline set;
  - PostgreSQL replay, which was not rerun after H1a;
  - packed smoke: strict tsc without skipLibCheck fails on unchanged packed oauth `dns-pinned-transport.d.ts` (prior debt); `@jini-ai/protocol` came from the registry during the smoke install;
  - the neutral-host devDependency (lockfile) change still needs an owner ruling.
- Scratch worktrees /home/user/s5/{base,xp3-orig} were removed after the final BASELINE rollback replay. No test, server or PostgreSQL processes remain.
- DONE means the build is complete. It is not Claude approval: the independent Claude review and next-session owner approval happen outside this build.

EXTRACT-S5-C DONE


## EXTRACT-S5-X

Follow-up on the existing `cloud/extract-s5` branches. Starting tips verified exactly: Tovu `8f3088ea0d95d2afe849c189dc5925ff4bfb5667`, Jini `c9d06913a35740b4e413d7465cbac1a3a9a20961`. The earlier tested Tovu source `624f769c0a96b9e4564d3068f05efca95e712f57` differs from the starting Tovu tip only by the prior report. First timestamp captured in this executor: 2026-11-09T15:03:50Z; conservative shutdown deadline used: 16:24Z (within the 90-minute cap, including bootstrap). No publication or main-branch changes.

### Five findings and red/green evidence

1. **Provider error codes:** `oauth/src/token-endpoint.ts` now permits only recognized OAuth token/device/error protocol codes in error text. Unrecognized values get a plain unrecognized-error message plus the existing recovery action; their metadata also becomes the safe `invalid_provider_error` sentinel. Known codes retain the old exact message/action bytes. The canary is constructed as concatenated strings, including its value in `error`, not just descriptions/URIs. Existing token-endpoint baseline: **49/49 green** before the fix. New regression first: **3 failures / 13 passes**, exposing the secret in the message at HTTP 200/400/503. Fixed: **65/65** across the old endpoint suite and the new file. A further real-OAuth conformance case proved the actual `ApiConnectionError.message` path: **1 failure / 7 passes** against the old built OAuth output, then **8/8** after rebuilding the fix. No error identity, retry state or retry count changed for recognized codes. Three existing sentinel-message assertions were updated only for the approved unknown-code security behavior.
2. **Owner workspace:** `SharedExternalMcpOwner.ownerWorkspaceId` is required and supplies both key derivation and the lifecycle record workspace. Tovu's composition and existing shared-sign-in test bind `"project"`. New second-host cases first both failed because the owner store received `"project"` instead of its own workspace; both now pass, including restart/resume for device and redirect grants. Existing Tovu shared-sign-in cases remain green; key construction/order and persisted values for Tovu are unchanged.
3. **Persisted context:** the `@agent-note` attached to `SharedSignInIssuingContext` explicitly requires lossless storage of the full supplied object, including `mcp: { provider, scopes, url, grant }` and any additional fields. The JSON-round-trip restart cases above verify both completion paths. No serialization or field order changed.
4. **Deleted scratch dependency:** the existing copy case was reproduced at **5 pass / 1 fail**, with `ENOENT` for its deleted `/home/user/s5/base/Tovu` source. It now reads committed immutable `.txt` source fixtures under `__tests__/fixtures/sign-in-copy-baseline`, derived directly from the original pinned git objects, retaining every old copy assertion and adding exact SHA256 assertions. Focused Tovu run: **17/17** (six port/copy cases plus eleven existing shared-sign-in cases). Fixture provenance records pin `c3801c833a191be51753dcdecd133b0cad6f8945`, blobs `bd997b3ee10e7fffce962eb31fb921ddaa9b38db` and `fc964786bb702c99a2fd0b0948fa447838feaa77`; SHA256 `37403ba581a374961e1435bfe86cafc1abe4db479869107fc3dd45e762811415` / `acec0a97bad6443817cf56ab6df38da02db00d9bedd063d4c4e36bc783b4cc32`. Both fixtures reverified byte-for-byte against those git objects. The completion commit also adds a local `*.txt -text` attribute: a real `core.autocrlf=true` checkout-filter probe first changed the fixture hash, then preserved both pinned hashes after this attribute. This keeps fresh Windows checkouts byte-identical too.
5. **Neutral-host dependencies:** declared `@jini-ai/mcp` and `@jini-ai/oauth` as workspace devDependencies, updated only their importer entries (six lockfile lines), deleted the complete nineteen-line Vitest alias config. The pre-change typecheck showed both missing modules; the standalone hosted sign-in test subsequently passes **2/2** through declared public package exports without aliases. Final full neutral-host typecheck and accumulated two-file result are recorded below.

### Additional vocabulary and contract sweep

Searched all moved production hosted-MCP/store/sign-in modules and core hosted-MCP contracts for host names, UI paths, workspace literals, database/ADR assumptions, original source paths and logger assumptions. Fixed the additional instances found:

- `mcp/.../hosted/store.ts`: host-specific Settings wording, portable database/ADR/keyring references, old OAuth/source/UI-hook paths; neutral descriptions preserve the original reasons and policies.
- `mcp/.../hosted/{auth,access,revocation,vocabulary,store.memory,connection-gate}.ts`: obsolete host paths and ADR references, stale old gate links, and the claim that the package logs through `console.warn`; the actual host logging port is now named.
- `integrations/.../hosted-mcp/{sign-in,contracts}.ts`: host routing/database paths and assumed adapters. Contracts now explicitly require sealed durable device codes and the host's authenticated, browser-bound, escaped/origin-checked and bounded browser routes.
- Shared-owner notes now spell out owner transaction serialization, trusted owner/actor identity and token-free bounded inventory; the lossless context and injected workspace rules are attached to the contracts.
- Both logging contracts explicitly require non-throwing operator diagnostics which never forward provider details to model text, preserving the service/gate guarantees.
- `core/contracts/hosted-mcp/{record,config}.ts`: old schema/route/tool implementation references replaced with the host's obligations; provisioning attribution is trusted and set only on creation, and sealed-payload updates preserve other members.
- Preserved stable persisted protocol identifiers (`external-mcp`, `oauth`, `mcp:`, `shared`) and documented their role; none selects an owner workspace. No new package-to-package dependency was added in moved production code.

The eleven files in the documentation sweep commits compare equal through the TypeScript AST printer with comments removed. The sweep changed no executable/type tokens. Final targeted search found no remaining host vocabulary/path matches in those production areas. Strict changed-production lint passes. Existing fixtures: **26 Tovu / 4 Jini files** byte-identical against the follow-up starting tips, plus the two new pinned fixtures verified independently. Tool metadata remains `a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6`.

### Commits (all on cloud/extract-s5, pulled with rebase before each non-force push)

Tovu:

- `033ba1b8cfc43a919045e55f6a2025f236ae0e95` — fix(external-mcp): bind shared owner workspace to project
- `1d1e211f73d11bee53a493d00f0a1c8764d165ca` — test(external-mcp): retain pinned sign-in copy fixtures in the repository

Jini:

- `0093e3c28209bdb557027786714430fa453e34a1` — fix(oauth): allow only protocol error codes in token failures
- `d7bf3bfd74de6ca7f8f2ca1849cfc6f291d13f3a` — fix(integrations): inject shared MCP owner workspace and document persistence
- `878c822899e47a6819b286e01469ef85fe47fcb4` — fix(examples): declare hosted MCP OAuth dependencies without aliases
- `89eb5365149957a80d2c6ef2eba275bb3de53eb1` — docs(hosted-mcp): remove host vocabulary and spell out adapter obligations
- `8b74983de0938798802e99915f9561865b317903` — test(integrations): cover provider error-code secret through real OAuth
- `1f2d31062fc3ff797b110e3ac7ce9b25e800c44a` — docs(core): make hosted MCP persistence and provisioning rules explicit

- `324103f25d1d87b9b0e497cdd2ed71eee9b34c8b` — docs(hosted-mcp): finish host-neutral storage contract wording

### Final accumulated H3 verification

Functional source pair: **Tovu `1d1e211f73d11bee53a493d00f0a1c8764d165ca` / Jini `324103f25d1d87b9b0e497cdd2ed71eee9b34c8b`**. Tovu `3d373992afd3db2e215cca216f236855c9a7b99f` is the report-progress commit; this completion commit adds the final report and the fixture checkout attribute verified above.

The original `/home/user/s5` scripts and exact 50-path Tovu list were deleted and never committed. Coverage was reconstructed from the report, committed test paths, the exact accumulated nine in the S2 report, and the complete 62-path S3 final matrix. The commands below select a **219-file Tovu superset**, including both moved domains, all S5 tests, relevant caller/connect tests, compatibility route files, OAuth shims and the vault-kind migration. This also exercises unrelated bundled-content/seed checks. All assertions remain intact.

| Check | Actual final result |
|---|---|
| J core/oauth/mcp/integrations builds and no-emit typechecks | EXIT 0 for all four; affected packages re-emitted after final documentation changes |
| Neutral-host full NodeNext typecheck, alias file deleted | EXIT 0 |
| J API + token-store + conformance + shared-owner restart cases | 23 files, **382/382**, EXIT 0 |
| J mcp hosted | 2 files, **7/7**, EXIT 0 |
| J oauth | 41 files, **730/730**, EXIT 0 |
| Neutral-host named API-host-moves + hosted-MCP sign-in | 2 files, **4/4**, EXIT 0 |
| T main typecheck | EXIT 0, no errors |
| T test typecheck | EXIT 2, exactly the previous **13-error** set; no new error |
| T reconstructed main set | 195 files, 2364 cases: **2344 pass / 18 prior fail / 2 existing opt-in skipped**, EXIT 1 |
| T additional compatibility/caller/OAuth files | 23 files, **380/380**, EXIT 0 |
| T vault API-connection kind migration | 1 file, **4/4**, EXIT 0 (SQLite and PGlite) |
| T total across selected paths | 219 files, **2728 pass / 18 prior fail / 2 existing opt-in skipped**; no new failing case |
| H0 frozen SQLite | All **6/6** within the main set pass |
| BASELINE rollback using original S5 source/build pair | EXIT 0, **ok:true, all five checks**: workspace unchanged; server rows in place; untouched envelopes byte-identical; rewritten envelopes retain format columns; baseline opens all three credentials |
| Three moved entry closures, source + JS + declarations | CLEAN; `api-connections` 32/28/29 files, hosted sign-in 36/31/33, hosted MCP 17/14/15. Negative control EXIT 1 with exactly **33 forbidden edges** |
| Current-tip real guard, raw output personally read | EXIT 1, exactly **2** baseline violations: R2-deep-path at plugin-catalog/scripts/generate.ts and R10-chatpane-public-surface at ChatPane.tsx; no N1/new rule |
| Hardwiring | HW1–HW9 = **17/16/135/1/0/0/0/49/0**, every rule **0 new** |
| guard:plugins | EXIT 0, no findings |
| Package layers / subpath isolation | **0 / 0** violations; **576** closures, audit **SI-c9 / SI-d7** |
| Immutable ORIGINAL declaration baseline + XP | Clean pin `35c4961af718f0f30591c46d2ea2756c4484a731`, frozen install, core and full recursive builds EXIT 0; writer EXIT 0; **XP1–XP5 clean** at the final tip |
| Changed production strict lint / existing T shims Biome | EXIT 0 / EXIT 0 |
| Existing fixtures, metadata and new baseline fixtures | Unchanged and verified as recorded above; no fixture regenerated to match changed behavior |

Jini's named test groups total **1123/1123 passing**. Optional real PostgreSQL replay was not run, as in the original H3 gate.

### Prior-failure proof and stop-rule boundary

The larger selection reproduces eighteen failures. The same **exact failing-case set**, with no additions or omissions, was reproduced using independently installed/built ORIGINAL S5 pins **Tovu c3801c833 / Jini 4044fe3c0**, before any S5 extraction or this follow-up. Two baseline commands ran 67 cases: 49 pass / 18 fail. These files and assertions were not changed:

| Unchanged Tovu file | Prior failing cases |
|---|---:|
| assistant/__tests__/external-mcp-connection-source.operator-read-only.test.ts | 3 (old `tovuDefaultTools` fixture vocabulary) |
| features/agent-plugins/__tests__/unit/bundled-composio-package.unit.test.ts | 1 |
| features/agent-plugins/__tests__/unit/bundled-github-actions-ops.unit.test.ts | 1 |
| features/agent-plugins/__tests__/unit/bundled-github-package.unit.test.ts | 2 |
| features/agent-plugins/__tests__/unit/bundled-supabase-package.unit.test.ts | 5 |
| features/agent-plugins/__tests__/unit/bundled-ui-ux-design-package.unit.test.ts | 4 (including expected 0.6.2 vs actual 0.6.3) |
| features/api-connections/__tests__/vendor-neutrality.test.ts | 1 (existing hits in portable-host-guidance, bundled-catalog and shared-owner) |
| server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts | 1 (the already named desktop-loopback source-scan debt) |

The bundled-content failures are stale skill/manifest/version expectations. The two skipped cases are pre-existing environment-acceptance tests requiring a real installed and activated ui-ux-design plugin; no new skip was introduced. Prior behavior/test drift was left unchanged under the stop rule and is not counted green. No unrelated behavior fix or test relaxation was made.

Cold setup initially used the host's incompatible pnpm 11 and read-only home cache; subsequent commands pin pnpm **10.33.2** and use a workspace cache. An early full build saw one self-authored test error (missing callback `state`), which was fixed; final focused builds/typechecks and all Jini suites pass. Early T typechecks started before user-management emission completed and saw missing exports; the final checks after all emissions produce main EXIT 0 and only the thirteen known test errors. Untracked package residue was moved out of the checkout, and generated Cloudflare files were built before rerunning the real guard. No setup error was grandfathered.

### Snapshot provenance and integrity

The declaration snapshot has **3308 source mappings / 3320 declarations / 3321 total files**. Its manifest SHA256 **d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459** exactly matches the earlier report. Its new, explicitly defined relative-path-order inventory (`<sha256>  <relative path>\n`) hashes to **09390aafb26ca6c23b92f1a968e4655fddc2e5817dc40cc779923f87dc714247**. Every inventory checksum reverified before shutdown. The original report did not retain the list formatting/path prefixes behind its whole-snapshot digest; equality to that older whole-snapshot digest is not claimed. The snapshot is read-only and a write-open probe was refused; `chattr` is unavailable in this executor, so no filesystem immutable-flag claim is made.

### Commands and retained evidence

Logs, the checksum inventory, source/closure audit helpers and exact selected-file lists remain outside both checkouts in `/workspace/work/extract-s5-x`. The brief was never committed. Commands ran with Node **24.22.1**, npm **11.9.0**, pnpm **10.33.2**. The actual cached pnpm launcher was `/workspace/work/npm-cache/_npx/ed17c428e728397e/node_modules/.bin/pnpm`; a reproducible launcher is `npm_config_cache=/workspace/work/npm-cache npx --yes pnpm@10.33.2`.

Setup and final type/build commands (run in the named repository):

```bash
# Jini: frozen install, core first, then recursive setup build.
export npm_config_cache=/workspace/work/npm-cache
CI=true npx --yes pnpm@10.33.2 install --frozen-lockfile --store-dir /workspace/work/pnpm-store
npx --yes pnpm@10.33.2 --filter @jini-ai/core build
npx --yes pnpm@10.33.2 --no-bail -r build
# Final focused builds followed by typechecks, after fixing the self-authored test error.
for pkg in core oauth mcp integrations; do npx --yes pnpm@10.33.2 --filter @jini-ai/$pkg build; done
for pkg in core oauth mcp integrations; do npx --yes pnpm@10.33.2 --filter @jini-ai/$pkg typecheck; done
npx --yes pnpm@10.33.2 --filter @jini-example/neutral-host typecheck
# Tovu setup and final checks.
npm ci
npm run build --workspace @tovu/sdk
npm --prefix packages/contracts run build
JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini
node_modules/.bin/tsc -p tsconfig.json --noEmit
npm run typecheck:tests
```

The accumulated test driver used below retains raw exits (including prior-debt EXIT 1). It selects all moved domain tests, the exact recovered accumulated nine and S3 matrix, plus caller/connect coverage:

```bash
#!/usr/bin/env bash
# Reconstructed H3 accumulated test gate. Original scratch scripts/file lists were deleted.
# Tovu is a conservative source-derived superset; see h3-gate-reconstruction.txt.
set -u
export npm_config_cache="${npm_config_cache:-/workspace/work/npm-cache}"
log_dir="${S5X_LOG_DIR:-/workspace/work/extract-s5-x}"
mkdir -p "$log_dir"
: > "$log_dir/h3-test-status.txt"
fail=0
run() {
  local name="$1" repo="$2"
  shift 2
  (cd "$repo" && "$@") > "$log_dir/$name.log" 2>&1
  local code=$?
  printf '%s exit=%s\n' "$name" "$code" | tee -a "$log_dir/h3-test-status.txt"
  if [ "$code" -ne 0 ]; then fail=1; fi
}
python3 - "$log_dir" <<'PY'
import pathlib,re,sys
out=pathlib.Path(sys.argv[1]); root=pathlib.Path('/workspace/Tovu'); src=root/'apps/website/src'
# All non-PostgreSQL tests in the two moved domains, host connect unit pins,
# and source-scanned external MCP/OAuth caller contracts. This contains the S5 additions.
files=set()
# Exact accumulated-nine list (S2) and final accumulated S3 C40 matrix.
report_s2=(root/'cloud/reports/extract-s2.md').read_text()
nine_section=report_s2.split('The regression command is the documented Tovu Node command with these nine explicit files:',1)[1].split('All F2 commands',1)[0]
nine_paths=re.findall(r'`(apps/website/src/[^`]+\.test\.ts)`',nine_section)
assert len(nine_paths)==9, f'expected exact nine, got {len(nine_paths)}'
report_s3=(root/'cloud/reports/extract-s3.md').read_text()
s3_section=report_s3.split('#### C40 — cwd /workspace/Tovu',1)[1].split('#### C41',1)[0]
s3_paths=re.findall(r'apps/website/src/[^\s`]+\.test\.ts',s3_section)
assert s3_paths, 'S3 C40 matrix missing'
for value in nine_paths+s3_paths:
 p=root/value
 assert p.is_file(), f'documented accumulated test missing: {value}'
 if 'postgres' not in p.name: files.add(p)
print(f'Exact accumulated nine: {len(nine_paths)}; S3 C40 matrix: {len(set(s3_paths))} paths')
for d in ['features/external-mcp','features/api-connections','features/agent-plugins/__tests__/unit']:
 files.update(p for p in (src/d).rglob('*.test.ts') if 'postgres' not in p.name)
for pat in ['assistant/__tests__/external-mcp*.test.ts','assistant/__tests__/tool-registrations.external-mcp.test.ts',
 'assistant/__tests__/mcp-ui-tool-calls-route.external-mcp-save.integration.test.ts',
 'platform/db/repos/__tests__/external-mcp*.test.ts','platform/db/repos/__tests__/oauth-pending-store.test.ts',
 'server/inbound/admin-http/routes/external-mcp/__tests__/*.test.ts',
 'server/inbound/public-http/routes/external-mcp/__tests__/*.test.ts',
 'server/inbound/public-http/routes/api-connections/__tests__/*.test.ts',
 'server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts']:
 files.update(src.glob(pat))
(out/'h3-tovu-files.txt').write_text(''.join(str(p.relative_to(root))+'\n' for p in sorted(files)))
print(f'Tovu conservative superset: {len(files)} files')
PY
mapfile -t tovu_files < "$log_dir/h3-tovu-files.txt"
run h3-tovu /workspace/Tovu env S5_FROZEN_DB_OUT="$log_dir/post-write.db" TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=1 "${tovu_files[@]}"
run h3-j-integrations /workspace/Jini /workspace/work/npm-cache/_npx/ed17c428e728397e/node_modules/.bin/pnpm --filter @jini-ai/integrations exec vitest run src/api-connections --maxWorkers=2 --minWorkers=1
run h3-j-mcp-hosted /workspace/Jini /workspace/work/npm-cache/_npx/ed17c428e728397e/node_modules/.bin/pnpm --filter @jini-ai/mcp exec vitest run src/federation/hosted --maxWorkers=2 --minWorkers=1
run h3-j-oauth /workspace/Jini /workspace/work/npm-cache/_npx/ed17c428e728397e/node_modules/.bin/pnpm --filter @jini-ai/oauth exec vitest run --maxWorkers=2 --minWorkers=1
run h3-j-neutral /workspace/Jini /workspace/work/npm-cache/_npx/ed17c428e728397e/node_modules/.bin/pnpm --filter @jini-example/neutral-host exec vitest run src/api-host-moves.test.ts src/hosted-mcp-sign-in.test.ts --maxWorkers=2 --minWorkers=1
exit "$fail"
```

The additional twenty-three paths were selected from `rg --files apps/website/src`: `.test.ts` names containing `external-mcp` or `oauth` that were absent from the 195-file list, excluding `postgres` and unrelated `form-delivery` paths. The same Tovu Node command above ran that explicit list, then `apps/website/src/platform/db/migrations/__tests__/vault-api-connection-kind.test.ts`. Their paths are retained in `h3-tovu-additional-files.txt`.

Focused red/green commands:

```bash
# Jini; new test files/cases ran red before their relevant implementation/build fix.
pnpm --filter @jini-ai/oauth exec vitest run tests/token-error-redaction.test.ts
pnpm --filter @jini-ai/oauth exec vitest run tests/token-error-redaction.test.ts tests/token-endpoint.test.ts
pnpm --filter @jini-ai/integrations exec vitest run src/api-connections/hosted-mcp/__tests__/shared-owner.test.ts
pnpm --filter @jini-ai/integrations exec vitest run src/api-connections/__tests__/real-oauth-conformance.integration.test.ts
# Tovu: the existing copy case ran red before changing its baseline inputs.
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/features/external-mcp/__tests__/h2c/sign-in-ports.test.ts apps/website/src/features/external-mcp/__tests__/external-mcp-shared-oauth.test.ts
# Byte preservation with Windows checkout conversion enabled: failed before the local attribute, passed after it.
git -c core.autocrlf=true cat-file --filters HEAD:apps/website/src/features/external-mcp/__tests__/fixtures/sign-in-copy-baseline/external-mcp-oauth.txt | sha256sum
```

Baseline worktrees were created with `git worktree add --detach` at the two original S5 pins and the XP original pin. Each Jini baseline received a frozen install, core build and full recursive build; baseline Tovu received `npm ci`, SDK/contracts builds and `JINI_PACKAGES_DIR=/workspace/work/extract-s5-x/base/Jini/packages npm run link:jini`. For the XP writer, cwd was the clean original checkout:

```bash
node --import /workspace/Jini/node_modules/tsx/dist/loader.mjs /workspace/Jini/scripts/check-no-cross-package.ts --base 35c4961af718f0f30591c46d2ea2756c4484a731 --write-baseline /workspace/work/extract-s5-x/declaration-baseline
# Current Jini; snapshot made read-only once and never regenerated for a gate.
JINI_DECLARATION_BASELINE_DIR=/workspace/work/extract-s5-x/declaration-baseline pnpm check:cross-package
# Baseline Tovu cwd, reading the database produced by the main frozen test.
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx /workspace/Tovu/apps/website/src/features/external-mcp/__tests__/fixtures/s5-baseline-rollback.mjs --base /workspace/work/extract-s5-x/base/Tovu --db /workspace/work/extract-s5-x/post-write.db
# Current Jini; raw output read in full, not filtered to R-number findings.
node --import tsx scripts/guard.ts
node --import tsx scripts/check-plugin-packages.ts
node --import tsx scripts/check-agent-plugin-content.ts
```

The isolation driver calls the real exported `checkPackageLayers()`, `checkSubpathIsolation()` and `auditSubpathIsolation()` from `scripts/`. The reconstructed closure checker recursively parses literal imports, re-exports, dynamic imports, `require` and import-type nodes using the TypeScript AST, resolves relative edges in src/JS/.d.ts separately, and rejects missing files, package escapes and any non-self/non-core Jini edge. All three entries passed; a separate synthetic nine-file tree produced thirty-three forbidden edges as expected. Documentation-only commits were compared using TypeScript's AST printer with comments removed (a raw token scanner was replaced because template-token rescanning is required).

Strict lint used `eslint --no-inline-config --rule '{"complexity":["error",10],"sonarjs/cognitive-complexity":["error",10]}'` on every changed production file. Biome checked the two unchanged Tovu sign-in shims. Raw artifacts include `f1-{baseline,red,green}.log`, `f1-api-{red,green}.log`, `f2-{red,green}.log`, `f4-{red,green}.log`, `f5-{red,test-green}.log`, `h3-*.log`, `j-guard-tip.log`, `j-isolation-final.log`, `j-closure-final.log`, `j-closure-negative.log`, `j-xp-final.log`, `t-{main,test}-tsc-final.log`, `t-baseline-rollback.log`, and the original-pin prior-failure logs. Baseline failure-set equality was asserted directly from the Node reporter case names.

### Completion and shutdown

All five findings and the requested additional vocabulary/contract sweep are complete. All source batches and the progress report were pushed successfully after pull/rebase; the completion report's commit is identified in the task response. Prior behavior/test drift remains unchanged and disclosed above. The three scratch worktrees were checked tracked-clean and removed after replay; the independent checksum-protected declaration snapshot and raw evidence remain in `work/`. No task-started test, build or server process remains. No force push, main-branch modification or publication occurred. Finished before the conservative 16:24Z deadline.

EXTRACT-S5-X DONE
