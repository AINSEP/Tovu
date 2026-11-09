# EXTRACT-S10 — X1 packed install, saved-data/replay proof

**Result: INCOMPLETE** (independent of the end marker). The packed-install, structural and saved-data proofs ran and are green apart from reds that fail identically on the combine pair. X1 is not fully covered: PostgreSQL parity did not run here, three neutral-host classes have only partial packed successors (one of them needs a ruling), two extraction-era entries miss the optional-peer note obligation, and the independent Claude review has not happened. X2 was not started (it is a separate later run).

Builder: one serial Claude Code session (no helpers or subagents). Clock: start **2026-11-09T22:32:35Z**, deadline 00:32:35Z, reserve from 00:12:35Z. The session's worker process restarted once at about 22:57Z. Scratch state survived, so no work was redone. UTC end, elapsed time and shutdown evidence are in the last section.

## Pairs and branches

| | Tovu | Jini |
| --- | --- | --- |
| Floor (brief) | `d3dc793299f5cb7a331cad8fe5592efee0c1b56d`, ancestor of launch: yes | `4de40e0bb766b56118d0335e2c464d679340070d`, ancestor of launch: yes |
| Launch: origin/cloud/extract-integ | `0173ad32f9d187094d3957da1983ba79a908551f` | `d9fa89a284f5f5f69852abf4b9abac08e695021e` |
| Branch cloud/extract-s10, created from launch | Step 0 `41e5dc55`, evidence `61d476e3`, then this report (see Delivery) | no commits; equals launch `d9fa89a28` |
| Tested pair (packed proof) | `41e5dc55` (launch + Step 0) | `d9fa89a28` |
| Combine baseline pair | `7cf9658e5009541b3cdd1891b016b613cfad9903` | `e1b1bdbd632fb727434aef49f33f80c263c4fcc6` |
| XP3 declarations | n/a | `35c4961af718f0f30591c46d2ea2756c4484a731` |

Toolchain: Node 24.22.2 (nodejs.org tarball, checksum verified), npm 11.19.1, pnpm 10.33.2 (corepack). Container: 4 cores, 16 GB, no swap, no PostgreSQL, no IPv6, uid 0.

**Last genuinely green pair: null.** Every run has at least one red, and each of those reds fails identically on combine (see Reds).

## Step 0 (coordinator ruling, owner decision 2026-11-09)

`content/agent-plugin-overlays/higgsfield-media/GUIDANCE.md`: lines 155-156 and 185 lose the backticked host tool names. The new text is "a tool search cannot find it and it cannot be described" and "**Symptom:** a tool search finds no `mcp__higgsfield__generate_image`; the host cannot describe it." Nothing else in the guide changed; the diff is 2 lines out, 2 in. The unedited `higgsfield-media-overlay.test.mjs` passes 4/4 on the tarball consumer. INTEG3 recorded this case as NEW, caused by extraction, needing a ruling; it is now green. Commit `41e5dc55`.

## Setup and the XP3 snapshot

- Jini `CI=true pnpm install --frozen-lockfile` exit 0, core build exit 0, `pnpm --no-bail -r build` exit 0. Jini `git status` stayed clean afterwards.
- XP3 snapshot: a clean clone at `35c4961af`, frozen install and builds (exit 0). The current unmodified `scripts/check-no-cross-package.ts` was run by absolute path with that clone's tsx, using `--base 35c4961af718f0f30591c46d2ea2756c4484a731 --write-baseline <scratch>`.
  - Exit 0: "3308 source mappings". 3,320 declarations.
  - manifest SHA-256 **d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459**, which matches.
  - Declaration aggregate (`find . -name '*.d.ts' | LC_ALL=C sort | xargs sha256sum | sha256sum`) **48f6d4223224dc975edfbdebf1a01a25bf12044dfd1d4f872624571266452d24**, which matches.
  - `JINI_DECLARATION_BASELINE_DIR` was exported for every checker.
- No `link:jini` anywhere in X1. `JINI_PACKAGES_DIR` was unset. Neither consumer had a sibling `Jini` directory.

## X1 structural gates (Jini, at launch `d9fa89a28`)

Raw files are under `raw/extract-s10/gate-*.txt`. I read the full guard output myself.

| Gate | Exit | Result |
| --- | ---: | --- |
| `pnpm check:cross-package` (XP3 env set) | 0 | "XP1–XP5 clean". INTEG3 could not complete this (no snapshot); it is green here with the pinned snapshot. |
| `pnpm guard` | 1 | Two violations. **R10** `packages/chat/src/react/features/chat-pane/components/ChatPane.tsx` imports `Icon` outside the public barrel. It is prior: combine's recorded guard has only R10. **R13** `packages/agent-runtime/src/defs/claude.ts`: fallbackModels lacks `claude-fable-5-2`, which this container's live Claude Code picker cache lists (17 live ids compared with 20 fallback entries). This is the container environment, as INTEG3 found. R2 is absent. Hardwiring: HW1 17, HW2 16, HW3 135, HW4 1, HW5 0, HW6 0, HW7 0, HW8 49, HW9 0, "0 new" each. R13 for codex/agy/pi/aider/opencode: MF3 skipped (tools absent). |
| `pnpm guard:plugins` | 0 | clean |
| `pnpm guard:plugins:packed` | 0 | clean |
| `check-package-layers.ts` | 0 | Exported `checkPackageLayers`: **0** violations. |
| `check-subpath-isolation.ts` | 0 | Exported `auditSubpathIsolation`: **580 closures, 0 blocking, 16 advisories (9 SI-c, 7 SI-d)**. These are the same counts integ2 recorded. Every path and reason is in `gate-layers-isolation-detail.txt`. |
| plugin-catalog vitest `--maxWorkers=2 --minWorkers=1` | 0 | 1 file, 65/65 |

The HW2 row at `apps/website/src/server/runtime/composition/plugin-runtime.ts:25` was left alone, as the dispatch instructs. Its file (`development/scripts/__tests__/hardwiring-debt.test.mjs`) is not in this run's gate set.

## E6 — tarballs, plain Node and the strict emitted-type consumer

**Pack.** `pnpm --filter <pkg> pack --pack-destination <scratch>` ran for each of the **39** non-private packages (`plugin-fixture-provider` is private). Plain `pnpm pack` was used, not the `file:`-rewriting scripts. 0 pack failures. Inventory (file, SHA-256, sha512 integrity) is in `raw/extract-s10/x1-tgz-inventory.txt`. Source for all of them is Jini `d9fa89a28`, built in place. Selected archives:

| Archive | SHA-256 |
| --- | --- |
| jini-ai-core-0.6.23.tgz | 6dc6b4b03a8ab93ad8cf1b53eeeac667a10eea91c279c40abbaf6082ba2d96db |
| jini-ai-agent-plugins-0.6.24.tgz | 1493025a19b57a2fe79c8693081fe0154257239ef0eb17d1bc4d3219db8882ce |
| jini-ai-integrations-0.6.19.tgz | 700155921739fbe7511412161de9b3e7647141c0591a17e68af1a3a8ed9b0c43 |
| jini-ai-plugins-0.6.22.tgz | 37ced29c588d3d59eb4575c8402db5538155473848e5bc20a298d356fb1a7bba |
| jini-ai-mcp-0.6.23.tgz | bbd6dcad0ba8d7afffae8ea4b37947fc474b262dd7d3ed14008dac8a91c5b2bd |
| jini-ai-devops-0.6.22.tgz | febcb400552f2bbbacd1d2031aa4a68ad95510800aa82661c84828a13e9234a5 |
| jini-ai-ui-0.6.23.tgz | 5258f57ae0478cca017cd36721ae01d9e41c119e74f44757e5996391a52a12dd |

Version numbers prove nothing; the hashes are the identity.

**Packed manifests.**
- No `workspace:`, `file:` or `link:` specifier, and no absolute checkout path, in any packed file.
- Core ships no `vendor/`.
- `assertPackedExports` (existing `scripts/lib/packed-exports.ts`, run on each unpacked inventory): **39/39 ok**. A separate walk found that every exports target of every package exists, including nested and wildcard targets.

**Declared-import scan** (disposable script, TypeScript parser, packed bytes only; `consumer-tests/scan-imports.mjs.txt`).
- Scope: every listed public entry plus every bundled-plugin subpath and every shipped agent-plugins `.mjs` outside tests, giving **132 closures**.
- **0 undeclared bare specifiers, 0 unresolved relative imports, 0 missing export targets.**
- 11 closures reach an optional peer by value. Every such peer is declared in the owner's `jini.optionalPeers`. Five of those notes name a sibling entry rather than the reaching entry:
  - Already present with the same note at combine: `agent-plugins/manifest` → semver, `agent-plugins/lifecycle/node` → @jini-ai/platform, `plugins/host/node` → semver.
  - **New since combine:** `agent-plugins/lifecycle/host-tools` → semver and `agent-plugins/connect/executable` → @cfworker/json-schema. Neither names itself in its manifest note, and neither entry file has an `@agent-note` naming the peer. See finding F1.

**Plain Node, Tovu consumer, no loader.** All **36** entries import: the 35 listed plus `platform/secrets/credential-sets`, 491 named exports. Each resolves inside the installed `node_modules/@jini-ai/*` with no `/src/` path.
- No entry exports a `require` condition, so import/require identity does not apply.
- Error classes exported by more than one entry are the same constructor (`PluginInstallError`, `PluginSourceError` through `plugins/host/node` and `plugins/host/tools`).
- The canonical `VaultError` (class and code) is asserted through the moved store by G-cred case 3 on tarballs.

**Strict neutral install** (pnpm 10.33.2, `node-linker=isolated`, `hoist=false`, `auto-install-peers=true`, `strict-peer-dependencies=false`, every `@jini-ai/*` as `file:<tgz>` plus the same map in `pnpm.overrides`).
- The first attempt ran the image's default pnpm 12.18.0, which ignores `package.json#pnpm`, and registry `@jini-ai` copies appeared. I pinned `packageManager: pnpm@10.33.2` and reinstalled from empty.
- `@jini-ai/http-kit` still came from the registry because pnpm does not apply overrides to auto-installed peers. It is a peer of cms/daemon, so the consumer now declares it directly as `file:<tgz>`.
- After that: `pnpm install` exit 0, `pnpm ls --depth Infinity` exit 0. All 71 `@jini-ai` links resolve inside the consumer's own `.pnpm` and are byte-identical to the unpacked tarballs. There are 0 registry copies.
- With isolation, three host-supplied packages had to be declared, which workspace hoisting had hidden: optional peers `semver` and `@cfworker/json-schema` (otherwise ERR_MODULE_NOT_FOUND from `agent-plugins` and `plugins/host`), and `@jini-ai/plugins` for the new tier-2 and sheets tests. `onlyBuiltDependencies: [esbuild]`.

**External strict tsc** (nodenext, `strict`, `noUncheckedIndexedAccess`, `skipLibCheck:false`, standalone tsconfig, no workspace extends or aliases). Final config: lib ES2023+DOM. Exit 2 with exactly **4 errors**, none in the consumer and none in an extracted entry:
- `agent-runtime/dist/providers/{connection-test,elevenlabs,model-catalog}.d.ts`: `Pick<RequestInit,'dispatcher'>`.
- `oauth/dist/dns-pinned-transport.d.ts`: `RequestInit['dispatcher']`.

Under the DOM lib, `RequestInit` has no undici `dispatcher`. The declaring source lines are byte-identical at combine `e1b1bdbd6`, and no commit since combine touches those files. A packed combine consumer was not built, so this is source-identity evidence, not a combine run.

The two exploratory configs are retained as `x1-neutral-tsc-strict-try{1,2}*.txt`:
- `exactOptionalPropertyTypes` added third-party vite/openid-client errors.
- Without DOM, cookie-consent's `Document` and vite's `Worker` are missing.

**Tovu consumer** (throwaway clone of S10 `41e5dc55`, flat npm as Tovu really installs).
- Every `@jini-ai/*` in root, `packages/contracts` and `packages/sdk`, plus a flat `overrides` map of all 39, was set to `file:<abs tgz>`. The manifest diff is in `x1-tovu-consumer-manifest-diff.txt`.
- `npm install --no-audit --no-fund` with the existing lock: exit 0, 811 packages. npm 11 skipped the install scripts of better-sqlite3, argon2 and esbuild. All three load from shipped prebuilds or optional binaries; this was smoke-checked.
- `npm ls --all` exit 0. 35 installed `@jini-ai` copies, no symlinks, all byte-identical to the tarballs. All 35 lock entries are `file:../../tgz/*.tgz`.
- `@tovu/sdk` build exit 0, `packages/contracts` build exit 0, root `npx tsc -p tsconfig.json --noEmit` **exit 0**. The trace shows `@jini-ai/core/contracts/cards` resolving to `node_modules/@jini-ai/core/dist/contracts/cards.d.ts`.
- Only `apps/admin`, `apps/desktop` and `apps/site-chat` have their own manifests. None of the tested files imports them, and they were not installed. This is a limit.
- Tracked manifests and locks on the S10 branch are unchanged. The edits exist only in the disposable clone (its `git status` is in raw).

## Tovu on tarballs (required A/H/L/C groups)

The file list is materialized from the committed `extract-integ-gates.json` (tovu files), `extract-s7-gates.json` (all recorded file paths) and `extract-s9-d-gates.json` phase `c4m`, plus the brief's pins: **378 files**, deduplicated, with provenance in `x1-tovu-file-list-provenance.json`.
- `c4m-j` does not exist in `extract-s9-d-gates.json`. Its phases are c3-d, g, c4s and c4m.
- Two recorded paths no longer exist: `extract-s7-error-port.unit.test.ts` was deleted by `24d99e36` and `extract-s8-x-contracts.test.ts` by `c60a21e6` (replaced by `extract-s9-tools-public.test.ts`, which is in the list).
- Seven INTEG3 named-repair files were outside that list and ran separately.

Invocation: `node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=1`, one file at a time, in three shards.

| Set | Files | Tests | Pass | Fail | Skipped | Zero-case files |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gate list + pins | 378 | 4,567 | 4,557 | 4 | 6 | 0 |
| INTEG3 repairs not in the list | 7 | 52 | 52 | 0 | 0 | 0 |
| **Total** | **385** | **4,619** | **4,609** | **4** | **6** | **0** |

Per-file results: `x1-tovu-tarball-378-files.tsv.txt`. Every mandatory pin passes:
- `moved-tools.{golden,access-token.golden,credential-cards.golden}` and `tool-registrations.contracts`
- `mail-send.golden` and `mail-engine-parity`
- `cost-counters.baseline` and `wiring-identity`
- `extract-s6-g-plug` golden (6/6) and integration (4/4)
- `extract-s8-g-cred` (11/11) and `extract-s9-g-deploy` (1/1)
- `external-mcp-frozen-db` (6/6) and `saved-keys-round-trip` (3/3)

`google-workspace/oauth.contract` passes 29/29.

### Reds — every one reproduced on the combine pair

The combine pair is a detached clone of Tovu `7cf9658e5` with its own `npm ci`, plus Jini `e1b1bdbd6` built in a separate clone and linked into it (combine `@tovu/sdk` and contracts built with tsc; exit 0). The four files ran in one batch with the same invocation.

| # | File (apps/website/src/…) | Failing case | S10 tarballs | Combine pair | INTEG3 row |
| ---: | --- | --- | --- | --- | ---: |
| 1 | server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts | `../../../inbound/assistant/agent-daemon-server.ts: desktop accepts a loopback OAuth callback; hosted requires HTTPS` (expected 1, actual 0) | 2/3, exit 1 | same case fails, 2/3, exit 1 | 21 |
| 2 | features/api-connections/__tests__/vendor-neutrality.test.ts | `no generic seam file names the first provider` | 1/2, exit 1 | same, 1/2, exit 1 | 19 |
| 3 | assistant/__tests__/mcp-ui-allowlist-completeness.test.ts | `every surfaceExchanges.open(...) call names a toolId constant this scan can resolve` | 9/10, exit 1 | same, 9/10, exit 1 | 4 |
| 4 | server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts | `a project store that can't open (EACCES on its folder): …` (expected true, actual false) | 6/7, exit 1 | same, 6/7, exit 1 | 23 |

All four are prior. They stay red and were not fixed. Case 4 is consistent with running as uid 0, where EACCES cannot occur. The TAP for both sides is in raw (`x1-red-*`, `combine-red-*`).

No red was caused by S10, and no new extraction red survived. **No minimal-defect fix was made**, so no Tovu or Jini production code changed in S10.

## E1 — contribution kinds and modules (neutral consumer, installed tarballs)

`contribution-contracts.test.ts` walked the installed `@jini-ai/agent-plugins` package root, found through the public `./manifest` export. It covers **14 kinds and 27 bundled files**, and each parses through a public Jini export and its declared modules pass that kind's contract:

- admin-surfaces: google-workspace
- agent-tools: google-workspace
- connections: google-workspace
- consent: cloudflare, netlify, vercel
- credential-schemes: fly
- deploy-configs: fly, railway, render
- deploy-ops: fly, github, railway, render
- deploy-targets: cloudflare, github-pages, netlify, s3-compatible, vercel
- form-destinations: cloudflare, google-workspace (declares modules)
- login-providers: google-login
- mail-adapters: resend
- object-stores: s3-compatible, vercel
- search-providers: meilisearch
- source-control: github

Consent and login-providers declare no modules. The frozen `tovu-*.json` payload protocol is unchanged and unrenamed.

## E2 — neutral public-contract runtime coverage (strict pnpm consumer)

`examples/neutral-host` was copied from `git archive HEAD`, all deps were made tarballs, and it got a standalone tsconfig. Vitest `--maxWorkers=2`: **17 files, 69 passed, 13 todo, exit 0**.

Consumer-only edits (diff in `x1-neutral-consumer-src-diff.txt`):
- Three checkout reads were replaced by installed public resolution (`createRequire().resolve` of an exported entry, then up to the package root): `api-host-moves`, `executable-surface-entries` and `contribution-contracts`. Their assertions are unchanged.
- Three new test files were added: sheets_get, tier-2, and hosted-MCP revocation/store listing. The last copies `hosted-mcp-sign-in.test.ts`'s setup unchanged and appends 2 cases.

| Required coverage | Packed evidence |
| --- | --- |
| 16 skills-only plugins | neutral-host "skill tool: … for every skills-only plugin" ×2 (`SKILLS_ONLY_PLUGIN_IDS`, 16 ids) |
| provider-settings card/save | provider-status.test.ts |
| Resend/SMTP fake transports | mail-host.test.ts ("real plugin and SMTP mail"), mail-port-regression.test.ts |
| Google-Workspace-shaped sign-in + sheets_get, fake Google | **new** `s10-sheets-get.test.ts`. The shipped `google-workspace/tovu-agent-tools.json` and `tools/sheets/get.mjs` are loaded through `@jini-ai/agent-plugins/google-workspace/*` and run through the public `lifecycle/tools` projection with `plugins/host` registry. The test checks the bearer token from the connection port, the fake Google path and the answer, and that a 401 refuses. The OAuth sign-in itself: Tovu `google-workspace/oauth.contract` 29/29 on tarballs. |
| Higgsfield-shaped MCP sign-in/call/expire/refusal/reconnect | hosted-mcp-sign-in.test.ts (2 cases), hosted-mcp-contracts.test.ts |
| tier-2 worker result/timeout | **new** `s10-tier2-worker.test.ts` with the host's own worker entry `s10-tier2-entry.mjs`. A real `worker_threads` Worker runs `startTier2Worker` from `@jini-ai/plugins/host/worker` with a neutral SDK binding. The beforeSave patch is decoded by `decodeTier2Reply`. A hung setup is cut by the host timeout. |
| deploy/forms/storage/login/consent | E1 contract checks; deploy-tools.test.ts |

Each new assertion was mutation-checked:
- Sheets token and tier-2 patch: mutated, both fail (exit 1); restored, both pass (exit 0).
- Revocation without `disconnect`: "expected 'connected' to be 'disconnected'", exit 1.
- Store listing with opens forced to 0: "expected 1 to be +0", exit 1.

The tests are in `raw/extract-s10/consumer-tests/` and live only in the disposable consumer, not in Jini.

**`neutral-host.test.ts` `.todo` classes mapped to packed successors:**

| Class | Packed successor |
| --- | --- |
| provider status | provider-status.test.ts |
| mail | mail-host.test.ts, mail-port-regression.test.ts |
| credential save | credential-tools.test.ts (`createCredentialSaveHandlers`) |
| connect through one card | connect-plugin-host.test.ts (2) |
| provisioning | connect-plugin-host.test.ts ("provisions with the real bodies") |
| executable-tool host | executable-surface-entries.test.ts (3) |
| MCP sign-in | hosted-mcp-sign-in.test.ts |
| connect orchestration (exchange started by a card) | hosted-mcp-sign-in.test.ts; credential-tools copy ("SAME actor-bound exchange") |
| API connection host | api-host-moves.test.ts. **Partial:** reachability and the state-store refusal only. A credentialed call through the host has no neutral successor; it is covered on the Tovu tarballs (api-connections suites in the 378). |
| access token, one credential open per lookup | **Partial:** no neutral counting assertion. Tovu tarballs: `moved-tools.access-token.golden` and `cost-counters.baseline` tokenLookup. Note that the frozen baseline records **4** credential opens per `getAccessToken`, not 1, so the `.todo` wording does not match the pinned behaviour. A neutral assertion of "1" would contradict the frozen baseline, so none was written. |
| MCP store, listing as counted | **new** `s10-hosted-revocation.test.ts` case 2: `listExternalMcpServerViews` with a counting sealer. The signed-in server is listed with 1 open for 1 row (bound ≤ 2 per row, as in Tovu frozen-db case 1), and the bearer never appears in the views. |
| revocation of a hosted MCP grant | **new** `s10-hosted-revocation.test.ts` case 1: sign in and call, then `service.disconnect`. The row reads `disconnected`, the opened stored payload has no tokens, the token lookup refuses with the host's `StudioRelinkError` (model-safe text), and the provider gets no request. |
| vault, plugin-state writes counted | **Partial:** api-host-moves proves zero storage calls before a foreign-scope refusal; neutral-host harness counts vault listings. |

**Tovu strings in the second host** (second-host limit):
- the existing `tovu-` file prefix and `TOVU_` client namespace in contribution-contracts;
- frozen data names;
- the `tovu-agent-tools.json` file name read by the new sheets test;
- existing negative assertions ("never names the original product").

No other Tovu vocabulary or imports.

## E3 — thin adapters

There is no checked-in moved-path inventory, so a proxy was used. It takes production Tovu files (`apps/website/src`, non-test) added or modified since the combine merge-base `b45d2ee75` that import an extracted A/H/L/C entry: **111 files**. Of those, **18 have more than 80 nonblank, noncomment lines** (`x1-e3-thin-adapters.txt`):

| Lines | File | Reason |
| ---: | --- | --- |
| 1613 | server/runtime/composition/deps.ts | composition root |
| 1610 | server/runtime/composition/app.ts | composition root |
| 517 | server/routes/types.ts | route type declarations |
| 257 | features/custom-credentials/tool-registrations.ts | host tool registration wiring |
| 212 | features/agent-plugins/lifecycle.ts | host lifecycle binding |
| 182 | features/api-connections/vault-stores.ts | host vault adapters |
| 163 | server/runtime/composition/domain-dns-adapters.ts | composition |
| 153 | server/inbound/admin-http/routes/agent-plugins/set-enabled.ts | HTTP route |
| 143 | features/agent-plugins/connect-tool.ts | host tool |
| 127 | features/deployments/deploy-config.ts | host deploy config |
| 105 | features/external-mcp/external-mcp-oauth.ts | host OAuth service |
| 101 | features/deployments/deploy-config-registry.ts | host registry |
| 100 | features/agent-plugins/tool-registrations.ts | allowed: agent-plugins tool-registrations host wiring |
| 100 | features/agent-plugins/access-token-tool.ts | host tool |
| 93 | features/agent-plugins/supersession.ts | host policy |
| 90 | features/plugin-runtime/capability-tool-registrations.ts | host registration |
| 86 | server/runtime/composition/plugin-host.ts | composition |
| 84 | server/runtime/composition/site-mailer.ts | composition |

These are named exceptions, and there was no further extraction (S10 moves no code). Because this is a proxy, it is not the plan's inventory. Whether each file is "moved" needs the plan's list.

## E4 — byte equality, frozen tests, metadata, no migrations

- S10's only source change is the Step 0 guide edit, a 2-line diff. No production, test, fixture, pin, golden, guide (other than Step 0), migration, DDL, serialization, manifest or lock change exists in either repository on S10. Jini has no S10 commit.
- Frozen fixtures were hashed before and after every run and are identical (`x1-frozen-fixtures-{first,last}.txt`):
  - `mcp-credentials.frozen.sql` aca349ca…40c3
  - extract-s8 `expected-open.json` d39fd19a…74fe, `expected-summaries.json` 49ed30a9…d5fc, `stored-rows.json` 45f7a383…60a2, `synthetic-key.json` 83e9ca08…3e5a
  - extract-s9 `recordings.json` b616c77f…b58
- `assistant/__tests__/fixtures/tool-metadata.baseline.json` SHA-256 **a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6** in both the S10 checkout and the consumer. It matches; nothing to explain.
- The P10a seeded boot (below) shows schemaVersion 77 on both the combine and the S10 code, with identical schema SQL for content.db (114 tables), chat.db and project.db.

### Saved replay (copies only, no live calls)

- **external-mcp-frozen-db** on tarballs with `S5_FROZEN_DB_OUT`: 6/6. Covers three credentials open, leased refresh, static re-save, env update, restart with untouched bytes, and the negative context/kind cases. The post-write DB is SHA-256 `0610f0a6…e2d7`, unchanged after both readers (they used copies).
- **G-cred** on tarballs with `EXTRACT_S8_G_CRED_REPLAY_DIR`: 11/11. Exported `new-operations-rows.json` is SHA-256 `1406388f…6878` (not committed: it holds synthetic sealed rows).
- **S5 old reader.** Committed `s5-baseline-rollback.mjs` ran with tsx from an old cwd: Tovu **c3801c833** with its own `npm ci`, Jini **4044fe3c0** built in a separate clone and linked. Inputs were `--db <copy of post-write>` and `--fixture` = the frozen SQL (aca349ca…, absent at c3801c833 and read from the S10 tree). Result: **ok, 5/5 checks, exit 0** (workspace row, server identity, untouched envelopes byte-identical, rewritten envelopes keep format columns, old code opens all three credentials).
- **S8 old reader.** Recreated, `consumer-tests/s8-old-reader.mjs.txt`, with the old facade, repo and sealer from Tovu **3f19a8bdb** and `@jini-ai/platform/secrets` from Jini **4044fe3c0**. It reads the exported rows into a fresh head-schema DB. Result: **3/3 rows accepted** (Created later, Legacy updated, Vendor bridge, matching `expected`). List summaries and token hints match case 11 exactly, exit 0.
  - Tamper control: one flipped ciphertext character gives "could not be saved or unlocked", exit 1.
- **Reader isolation.** A Node resolve hook recorded every module URL: S5 969 and S8 935. All of them are under the old Tovu or Jini clones except the reader script itself; none is under the consumers or `/home/user`. The old clones' tracked trees are clean and at their exact commits.
- **PostgreSQL parity: NOT RUN.** `external-mcp-frozen-db.postgres.test.ts` fails 2/2 because there is no server (it fails by design rather than skipping). It is unproven here.

### P10a seeded replay

The site was seeded by the **combine pair** source CLI: `init` then `serve` to HTTP 200 (6 s), then stopped. Synthetic operator state was added: a memory note and a learned file. The state was snapshotted (pristine tar SHA-256 `be58c3db…e57f`) and then booted by the **packed S10 code** to HTTP 200 (20 s; cold tsx cache; not a performance measurement), then stopped. Both used the same scratch HOME.

| Category | Evidence |
| --- | --- |
| ledger | `bundled-digests.json` keeps both plugins. Digests move to the new bundled archives: tovu-theme 82fc2b69… → b1bdcaea… (plugin.json 1.1.2 → 1.1.3, extension key `tovu` → `jini`, INTEG3 group A), how-tovu-works f2b7e516… → ffdc98a6…. Ledger units: bundled-digests, lifecycle-binding and retire-bundled suites on tarballs. |
| activations | `activations.json` byte-identical; `plugin_activations` rows unchanged; G-plug 3, wiring-identity row 7 |
| same tools registered | G-plug 1/2, moved-tools goldens, tool-registrations.contracts, tool-metadata baseline hash |
| rows in use unchanged | 113/114 content.db tables identical. `origin_settings` changed only port 39101→39102 and verified_at. chat.db and project.db identical. frozen-db case 3; G-cred 2/9/10. |
| memory readable | seeded note and learned file byte-identical after the new boot; install-upload-update "keeps memory"; neutral "plugin memory tools: read and write" |
| connect defaults | apply-connect-defaults "a row the operator already edited is untouched by a sign-in"; connect-tool case 32 |
| customized copies | not seeded through the install API in this run; saved-keys-round-trip case 3 "edited bundled plugin labels survive". **Partial.** |
| disk growth | +119,333 bytes (5,035,002 → 5,154,335). Cause: the two new bundled package digests (11 files) plus the server log; old package versions retained; 0 files removed. |

### Counters (pins on tarballs, all equal to the committed baseline `cost-counters.baseline.json` SHA-256 2be1488c…736c)

| Counter | Values |
| --- | --- |
| skill tool call, overview | opened 2, listed 4, bytes 236 |
| skill tool call, supporting file | opened 2, listed 4, bytes 172 |
| skill tool call, other skill | opened 1, listed 3, bytes 105 |
| token lookup, first and second | 1 contribution load (`tovu-connections.json`), 4 credential opens each |
| mail send, first | settingReads 1, credentialLists 1, rows 2, catalogLoads 0, opens 0, providerCalls 1 |
| mail send, cached | settingReads 1, credentialLists 1, rows 2, catalogLoads 0, opens 0, providerCalls 1 |
| mail send, after invalidate | settingReads 1, credentialLists 3, rows 6, catalogLoads 1, opens 1, providerCalls 1 |
| mail send, unconfigured first and second | settingReads 1, catalogLoads 1, all else 0 |

`wiring-identity` 6/6. No new counter harness, no optimization.

## E5 — guard, layer and isolation findings

These are in the X1 structural gates table. Baseline provenance: combine's recorded guard reports only R10 (brief and INTEG3).
- R10 is unchanged.
- R13 is from this container's model-picker cache. INTEG3 found `fallbackModels` identical between combine and the tip.
- R2 stays gone.
- Layers 0 and isolation 0 blocking, with 16 SI-c/SI-d advisories, are identical in count to integ2's 580-closure record.

No script, guard, checker or debt edit.

## Findings and remaining work

1. **F1, optional-peer note obligation (needs a ruling).** `@jini-ai/agent-plugins/lifecycle/host-tools` reaches the optional peer `semver` by value. `@jini-ai/agent-plugins/connect/executable` reaches `@cfworker/json-schema` by value. Neither entry names this in its own `jini.optionalPeers` note or entry `@agent-note`, and both entries are new since combine. The strict consumer confirms the hazard: without `semver` installed, importing these packages fails with ERR_MODULE_NOT_FOUND. Not fixed: S10 freezes manifests and guides, and the repository's own isolation checker accepts it. Three older entries (manifest, lifecycle/node, plugins/host/node) have the same shape at combine.
2. PostgreSQL parity for the frozen-db replay: run where a PostgreSQL server exists.
3. Neutral-host partial classes still open: the access-token count (its `.todo` wording contradicts the frozen 4-open baseline; needs a ruling), the API-connection credentialed call, and the plugin-state vault count. Revocation and MCP-store listing are now covered by disposable consumer assertions. Either write the remaining assertions or accept the Tovu-tarball successors.
4. Strict consumer tsc: the 4 `RequestInit['dispatcher']` declaration errors under the DOM lib, from source unchanged since combine. Confirm with a packed combine consumer, or fix in a later lane.
5. E3: replace the proxy with the plan's moved-path inventory and rule on the 17 FAT files.
6. P10a customized copy through the real install/customize API.
7. Desktop preload and desktop suites need electron; not run here.
8. X2 full suites: a separate later run, not started.
9. **Independent Claude review of the packed/replay evidence and of the final extraction result: pending.** Not self-approved. C-d status: still pending independent review, as before.

## Delivery

Raw evidence: `cloud/reports/raw/extract-s10/` (gate outputs, inventories, scan JSON, consumer results, per-file TSV, reds' TAP on both pairs, replay and old-reader outputs, P10a comparison, disposable scripts as `.txt`). No credential values, real keys or exploit detail. The P10a site key and the S8 exported rows stayed in private scratch.

Commits on cloud/extract-s10 (Tovu), each pushed:
- `41e5dc55` Step 0
- `61d476e3` raw evidence
- the report commit (SHA in the final message and the delivery addendum below)

Jini cloud/extract-s10 equals `d9fa89a28`, pushed and unchanged.
