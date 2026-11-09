# EXTRACT-S10-F: fixes from the EXTRACT-S10 review

**Result.** All eight items are done.
- F2 and F3 are fixed in Jini. Item 1's search found no other new package-to-package edge since combine.
- Item 3 is not a packaged-app crash, so nothing changed for it.
- F4 is a committed consumer test with no casts. It passes on tarballs.
- F5's two files pass on tarballs, so no fix was needed.
- F1 is scoped down. Combine's three hits stay red as prior.
- PostgreSQL parity ran on tarballs and passed.

One extra fix came from running the affected package's suite: two untyped optional arguments in `user-management`, added after combine (see item 1b).

The guard still has its two known violations. Both are shown failing on a combine clone below.

Builder: one serial Claude Code session plus one subagent, which wrote item 4. Clock: start 2026-11-09T23:24:31Z. The end time is in the Delivery section.

## Pairs

| | Tovu | Jini |
| --- | --- | --- |
| Start (brief) | `5f5394789` on cloud/extract-s10 | `d9fa89a28` on cloud/extract-s10 |
| Combine baseline | `7cf9658e5` | `e1b1bdbd6` |
| XP3 declarations | n/a | `35c4961af718f0f30591c46d2ea2756c4484a731` |
| End | the report commit (Delivery) | `de19462c` |

Toolchain: Node 24.22.2 (nodejs.org tarball), npm 11, pnpm 10.33.2 (corepack, Jini `packageManager`). Container: 4 cores, 16 GB, uid 0.

Setup:
- Jini: `CI=true pnpm install --frozen-lockfile` exit 0; `pnpm --no-bail -r build` exit 0.
- Tovu: `npm ci` exit 0.
- No `link:jini` was used anywhere.

## Tarballs and consumers

**Tarballs.** All 39 non-private Jini packages were packed with `pnpm --filter <pkg> pack`. Inventory: `raw/extract-s10-f/tgz-inventory.txt`.
- `agent-plugins` and `user-management` were rebuilt and repacked after their edits. The first `agent-plugins` pack predated F3's comment edit, because the build had already passed that package. I found that while checking the packed entry files, then rebuilt and repacked.
- Every other package's source is unchanged since `d9fa89a28`.
- `jini-ai-core-0.6.23.tgz` has SHA-256 `6dc6b4b0…2d96db`, the same as S10's. That is a reproducibility check.

| Archive | SHA-256 |
| --- | --- |
| jini-ai-agent-plugins-0.6.24.tgz | 7ded150c6a2712b0cf681bb57f9a15dff58b564cb618ef7f6de22bbe249f96c8 |
| jini-ai-user-management-0.6.22.tgz | b158a89e8cec23bd9c8fa30d0e6b6a14404e1df2c0ee51359a905e70288e111b |
| jini-ai-core-0.6.23.tgz | 6dc6b4b03a8ab93ad8cf1b53eeeac667a10eea91c279c40abbaf6082ba2d96db |
| jini-ai-integrations-0.6.19.tgz | b30613077e4a261e73bc64e853b2f00982bcdc40f74a82100aab28df0e14e113 |
| jini-ai-plugins-0.6.22.tgz | 3968103ab375dc568cac9a1f069982eb163e81c469e5d40b416eaec38e0ba45b |
| jini-ai-http-kit-0.6.22.tgz | e22cbddb31b8af18e863d7bb487470fd0050c31fe0fb4007d8bee00a3fee3d12 |
| jini-ai-oauth-0.6.19.tgz | 02e21ab9d43315dc57140c779737e9bfa6ccc60727c9c52a5ff7c4355a9b692c |

**Tovu consumer.** A throwaway clone of Tovu cloud/extract-s10. S10's recipe was applied by script (`tovu-consumer.py.txt`): every `@jini-ai/*` in root, `packages/contracts` and `packages/sdk`, plus a flat `overrides` map of all 39, set to `file:<tgz>`.
- `npm install` exit 0.
- After swapping in the two repacked tarballs, all 35 installed `@jini-ai` copies are byte-identical to the unpacked tarballs (`diff -rq`, empty), with 0 symlinks (`tovu-consumer-installed-bytes.txt`).
- `@tovu/sdk` and `packages/contracts` builds exit 0.
- Root `npx tsc -p tsconfig.json --noEmit` exit 0 (`tovu-consumer-tsc-final.txt`).

**Neutral consumer.** Strict pnpm: `node-linker=isolated`, `hoist=false`, `auto-install-peers=true`, `strict-peer-dependencies=false`. Every `@jini-ai/*` is `file:<tgz>` plus the same `pnpm.overrides`. `semver` and `@cfworker/json-schema` are declared, as S10 found necessary.
- Sources are `git archive` of Jini `de19462c` `examples/neutral-host/src`.
- Consumer-only edits: S10's three checkout-read replacements, plus S10's disposable test files from `raw/extract-s10/consumer-tests/`.
- `.pnpm` holds no registry `@jini-ai` copy. Every installed `@jini-ai` package matches its tarball byte for byte, apart from pnpm's own `node_modules/.bin` shims (`neutral-installed-bytes-excl-cache.txt`).

## Item 1: F2, owner's import rule (Jini `7871ddd7`)

The change:
- `packages/user-management/src/server/login-types.ts:2` now imports `OAuthClientAuthMethod` and `OidcSigningAlgorithm` from `@jini-ai/core/contracts/oauth`.
- The `@jini-ai/oauth` optional peer, its `peerDependenciesMeta` entry and its `jini.optionalPeers` note are removed. So is the `workspace:*` dev dependency on it, which was added in the same commit (d611333fa) only for this import and has no other user in the package.
- The lockfile diff is exactly the three lines of that importer link (`f2-lockfile-only.txt`).

Packed check (`f2-f3-packed-check.txt`): the packed `user-management/package.json` has 0 mentions of oauth, and the packed `login-types.d.ts` imports from `@jini-ai/core/contracts/oauth`.

**Search for other new Jini-to-Jini imports since combine, without the checker** (`f2-edge-scan*.txt`, script `edges.py.txt`).
- I read every non-test file under every `packages/<pkg>/`, at both commits through git objects. That includes shipped plugin `.mjs` folders, not just `src`.
- I extracted every static, dynamic and type `@jini-ai/<other>` specifier, excluding `core` and the package itself.
- I then compared the (package, target) edge sets and, for edges present at both, the importing files.

Results:
- **Combine `e1b1bdbd6` against `d9fa89a28`:** exactly one new edge, `user-management → oauth` (F2). No existing edge gained an importing file.
- **Combine against the final tip `de19462c`:** no new edge. Two older edges are gone (`commerce → cms`, `integrations → oauth`). There are 78 edges at the tip and 80 at combine on this wider scope; the review's 75/76 covered `src` only.
- **Manifest cross-check:** the only `@jini-ai/*` dependency added to any package manifest since combine was the oauth peer. The `ui` line in the diff is a comma move.

Nothing needed more than a type-import change.

### Item 1b: two untyped optional arguments, found while running the affected package (Jini `cd25cb27`)

`user-management`'s own vitest suite failed 1/1172. The failing test, `src/__tests__/public-args.test.ts`, already existed: "public functions … accept named argument objects".
- The assertion was `login-providers.ts: parseLoginProviders: expected undefined to be defined`, at `public-args.test.ts:27`.
- After that line was fixed, the test hit the same assertion on `login-types.ts: constructor`.
- A full listing by the same rule (`public-args-all.mjs.txt`) found exactly these two cases.

Both came in with d611333fa after combine. `login-providers.ts` does not exist at combine, so this red is extraction-caused and predates S10-F. It is not prior, and it is not caused by this run.

The fix gives each `_options` parameter the type `Record<string, never>`, the form the rest of the package uses. Every caller in Jini and Tovu passes one argument. Results:
- `public-args` 1/1;
- the whole package 1172/1172 (`f2b-user-management-vitest-before.txt` and `-after.txt`);
- package `tsc` exit 0.

Tovu has its own `parseLoginProviders` wrapper in `features/member-login/providers.ts`. It was left alone and is not under that test.

## Item 2: F3, optional-peer notes (Jini `4397a493`)

- **`jini.optionalPeers.semver`** now reads "opt-in: plugin version compatibility; import @jini-ai/agent-plugins/lifecycle, import @jini-ai/agent-plugins/lifecycle/host-tools — …". The headline after the dash is unchanged.
- **`jini.optionalPeers["@cfworker/json-schema"]`** now names `…/lifecycle/tools, import @jini-ai/agent-plugins/connect/executable — …`.
- **`lifecycle/host-tools/index.ts`** gained an `@agent-note`. A host must install `semver`: plugin search (`search-tool.ts`) loads `../compatibility.js`, which imports it by value, so without it the import fails with ERR_MODULE_NOT_FOUND.
- **`connect/executable/index.ts`** gained an `@agent-note`. A host must install `@cfworker/json-schema`: `register.ts` builds the projection from `lifecycle/tools/projection.js`, which imports it by value, with the same failure.
- **`scripts/__tests__/optional-peer-contract.test.ts`:** 57/57 (`optional-peer-contract.txt`). This includes "classify opt-in subpaths", which needs `import <subpath> —` in the note.
- **Packed bytes:** both notes are in the packed manifest. Both `@agent-note`s are in the packed `dist/*/index.js`.

## Item 3: desktop check (no change; not a packaged crash)

`apps/desktop/scripts/stage-website-shared.ts` calls esbuild with `bundle: true`. It sets no `external`, `packages` or `metafile` option, and its comment says dependencies are inlined because nothing under `Resources/website/` has a `node_modules` ancestor. So bare imports of the staged modules are inlined at staging time and never resolved at runtime.

Evidence on the tarball consumer (`desktop-stage-*.txt`):
- **Staging run:** exit 0, 15 modules, including `src/features/agent-plugins/host-signals.ts`.
- **What the staged `host-signals.ts` imports:** only `node:fs`, `node:path` and `node:module`. It has no `semver` reference at all; the `@jini-ai/agent-plugins` code was inlined from `dist/core/identity-namespace.js` and `dist/lifecycle/metadata.js`.
- **Whole staged tree:** no `from`, `require` or `import()` of `semver` anywhere.
- **Why semver is absent:** the installed `@jini-ai/agent-plugins/manifest` entry does reach `semver` in its static closure (9 files; bare specifiers `@jini-ai/core/plugin-directory` and `semver`). esbuild drops it because `readAgentPluginMetadata` does not use it (`sideEffects: false`).
- **If a later change made `host-signals` use semver:** staging would inline it. It resolves at staging time from the Tovu root, which declares `semver ^7.6.2`.

The shell itself (`apps/desktop/src`, `bin`) imports no `@jini-ai/agent-plugins`. The desktop shell's dev-only `semver` is therefore correct, and its manifest and lock are unchanged.

A side note on the first attempt: staging against Tovu's committed lock (registry `agent-plugins 0.6.23`) fails at build time with "No matching export … readAgentPluginMetadata" and three similar `@jini-ai/plugins` errors (`desktop-stage-registry.txt`). That is the review's existing §7 point: the committed lock pins registry builds that predate the extraction. It is a staging-time failure, not a runtime crash.

## Item 4: F4, a second host signs in before `sheets_get` (Jini `de19462c`)

`examples/neutral-host/src/api-connection-sheets-get.test.ts` is one test. It has no `as` casts, no `!` and no `@ts-` directive. It imports only public `@jini-ai/*` entries, `node:*` and vitest, and contains no Tovu vocabulary.

1. **Plugin loading.** The test finds the shipped google-workspace plugin through the public `@jini-ai/agent-plugins/google-workspace` export. It loads the plugin's connections and tools declarations through the real contribution loader: `defineExecutablePluginContribution` with `parseApiConnectionsFile` and the connection hook and namespace checks, and `defineAgentPluginToolContribution`.
2. **Host.** It builds the real `createApiConnectionHost` for the hosted runtime, with:
   - in-memory record, token and settings stores;
   - the real `@jini-ai/oauth` capabilities and URL guard;
   - `createAdminSurfaceCallbackInbox`;
   - `createRateLimiter` over `createMemoryCounterStore`;
   - a fake token endpoint and a fake Google.
3. **Tools.** The real `createAgentPluginToolCapabilities` takes `host.toolConnections`, `host.pluginState.readerFor`, `host.apiOriginsFor` and a fake `HttpClientPort`. It feeds the real `createAgentPluginToolProjection` and `createPluginContributionRegistry`.
4. **Before sign-in.** The tool refuses with `not-connected`. Neither the token endpoint nor Sheets receives a request.
5. **Refused exchange.** A sign-in whose token endpoint answers `invalid_grant` fails with `authorization-failed`. No token is issued, the status stays `disconnected`, and Sheets gets no request.
6. **Real sign-in.** The flow is `startApiConnectionSignIn`, then the hand-off, then consent at the fake, then `serviceFor().complete`. The token endpoint receives `grant_type=authorization_code`, the minted code, the host's web `client_id` and secret, and the host callback as `redirect_uri`. Exactly one token is issued, and the status reads `connected`.
7. **Tool call.** `sheets_get` makes exactly one request: GET `https://sheets.googleapis.com/v4/spreadsheets/sheet-one-0001` with `Bearer <the issued token>`. The answer equals the fake body and does not contain the token.

Runs (raw `f4-*.txt`):

| Run | Where | Result |
| --- | --- | --- |
| pass | tarball neutral consumer | 1/1 |
| mutation 1: connections replaced by a constant-token stub (S10's shortcut) | consumer copy only | 1 failed: "Reconnect required" where `not-connected` was expected |
| mutation 2: the token store serves a token other than the one the sign-in installed | consumer copy only | 1 failed: "Reconnect required: Google no longer accepts the saved sign-in" |
| restored | consumer | 1/1 |
| workspace | `examples/neutral-host` | 1/1 |
| full neutral suite, final | tarball neutral consumer | **19 files, 71 passed, 13 todo, exit 0** (S10: 18/70/13, plus this test) |

Type checks:
- Strict external `tsc` on the neutral consumer has exactly the 4 known `dispatcher` declaration errors (agent-runtime ×3, oauth ×1) and none in a consumer file (`neutral-tsc-strict-final.txt`).
- Workspace `tsc -p examples/neutral-host` exits 0 after the lockfile link (`f4-tsc-workspace-final.txt`).

Manifest change: `examples/neutral-host` devDependencies gain `@jini-ai/http-kit` (the rate limiter) and `@jini-ai/plugins` (the registry). The latter was already imported by the test through a root phantom. The lockfile diff is exactly those two link entries (6 lines).

**A finding worth recording, not a defect fixed here.** The shipped `google-workspace` connections file names its client settings with the first host's prefix. `parseApiConnectionsFile` accepts a declaration only when those names fall inside the host's `clientNamespace`. A second host must therefore adopt that prefix. The test derives the prefix from the declaration's `clientIdEnv` rather than spelling it.

The file names are not spelled either: the test takes the unique `*-connections.json` and `*-agent-tools.json` in the package root, because no public loader discovers a plugin's contribution file names.

## Item 5: F5, customized copy and disabled decision on tarballs

The two files ran one at a time on the Tovu tarball consumer, with S10's invocation (`run-shard.sh.txt`). Raw: `raw/extract-s10-f/f5/`.

| File | Result |
| --- | --- |
| `features/agent-plugins/__tests__/integration/bundled-customization.integration.test.ts` | 1/1: "H1: owner customizes bundled tovu-theme through chat into a saved site copy, preserving bundled bytes and trust" |
| `features/agent-plugins/__tests__/integration/bundled-upgrade-digest-supersession.integration.test.ts` | 7/7, including "a bundled upgrade preserves an operator's disabled decision and keeps both gates closed" and "an edited bundled SKILL.md refreshes the site's installed copy even with NO version bump" |

Both passed again in the final rerun. Neither failed, so there is no defect and nothing to compare with combine.

## Item 6: F1, vendor-neutrality (Tovu `a1d33ad3`)

`vendor-neutrality.test.ts` now excludes `features/agent-plugins/__tests__/unit/portable-host-guidance.unit.test.ts` from the seam scan. It does so the same way the scan already excludes the test file itself: a resolved path in the file filter, with a comment on why.

| Pair | Failing case | Hits |
| --- | --- | --- |
| S10 before (raw/extract-s10) | `no generic seam file names the first provider` | 7: `portable-host-guidance.unit.test.ts:15,17,23,31`, `bundled-catalog.ts:43,44`, `shared-owner.ts:81` |
| S10-F, tarballs (`f1-vendor-neutrality-s10f.tap.txt`, final rerun) | same case, 1/2 | 3: `bundled-catalog.ts:43`, `bundled-catalog.ts:44`, `shared-owner.ts:81` |
| Combine `7cf9658e5` (`git archive` of `apps/website/src` and `apps/admin/src`, run fresh here: `f1-vendor-neutrality-combine-7cf9658e5.tap.txt`) | same case, 1/2, exit 1 | the same 3, same `deepStrictEqual` |

The remaining three are prior and stay red.

## Item 7: PostgreSQL

- **Install.** `apt-get install -y postgresql` exit 0 in about 6 s (PostgreSQL 16.15).
- **Cluster.** `initdb -A trust` as the `postgres` user into scratch, Unix socket only (`-k <scratch>/pgsock`, `listen_addresses=''`).
- **Test.** `external-mcp-frozen-db.postgres.test.ts` on the Tovu tarball consumer, with `PGHOST=<socket dir> PGUSER=postgres` and S10's invocation: **1/1 pass, exit 0**. The case is "frozen fixture [postgres]: replayed sealed bytes open, refresh under the lease, re-save and survive a reconnect" (`pg-external-mcp-frozen-db.tap.txt`).
- **S10's "2/2 fail".** That was this case plus a file-level failure, because there was no server.
- **Shutdown.** The cluster was stopped with `pg_ctl stop`, and 0 postgres processes remain.
- **Tarball note.** This ran before the `agent-plugins`/`user-management` repack. Those two tarballs differ only by entry comments and two parameter type annotations, and neither is on this test's path.

## Item 8: corrections to `extract-s10.md`

1. **F1, the vendor-neutrality red: partly new, not fully inherited.** Lines 141 and 145–147 called it identical to combine. It was not: 4 of its 7 hits came from `portable-host-guidance.unit.test.ts`, added after combine in 303e0179f. Item 6 removes those 4. The other 3 match combine exactly.
2. **F6, P10a's limits.**
   - P10a booted a nearly empty seeded site. The boot log shows vault coverage of 0 rows for every kind, and only `how-tovu-works` and `tovu-theme` are in the digest change.
   - "Rows in use unchanged" holds for that site only. The real row evidence is `external-mcp-frozen-db` (SQLite 6/6 in S10, and PostgreSQL 1/1 now) and `extract-s8-g-cred` 11/11.
   - The old-reader proofs (S5 5/5, S8 3/3) read rows written by mid-extraction code (S5 H0, S8 C0), not by combine's own code. Their old-format claim rests on source identity of the sealer and keyring.
   - "Customized copies" is now covered by item 5's two integration files on tarballs, not by `saved-keys-round-trip`.
3. **F7, per-file results for the seven INTEG3 repair files**, committed in `raw/extract-s10-f/f7/` with TSV and TAP. They are the INTEG3 group A–I and "Broad types" files missing from S10's 378-file list. They ran on the tarball consumer with S10's invocation, and again in the final rerun:

   | File | Tests | Pass |
   | --- | ---: | ---: |
   | apps/website/src/features/site-guide/__tests__/plugin-contributions.test.ts | 3 | 3 |
   | apps/website/src/server/runtime/composition/__tests__/recharts-package-pin.unit.test.ts | 7 | 7 |
   | content/agent-plugin-overlays/google-login/__tests__/exports.test.mjs | 6 | 6 |
   | content/agent-plugin-overlays/composio/__tests__/connection-contract.test.mjs | 1 | 1 |
   | content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs | 29 | 29 |
   | apps/website/src/assistant/__tests__/approval-single-path.test.ts | 2 | 2 |
   | apps/website/src/server/runtime/boot/__tests__/agent-plugin-token-boot-order.unit.test.ts | 4 | 4 |
   | **Total** | **52** | **52** |

4. **The S10 open item on the API-connection credentialed call is covered** by item 4's committed consumer test. It is no longer "partial".

## Reruns on tarballs and gates (final tree)

| Check | Result | Raw |
| --- | --- | --- |
| Declared-import scan, packed bytes (S10's script, scope + `user-management/server`) | 133 closures: 0 undeclared bare specifiers, 0 unresolved relative, 0 missing export targets. 11 optional-peer reaches, the same list as S10's. | `declared-import-scan.{txt,json}`, `scan-imports.mjs.txt` |
| Neutral consumer, vitest | 19 files, 71 passed, 13 todo, exit 0 | `neutral-vitest-final.txt` |
| Neutral consumer, strict tsc | 4 errors, all the known `dispatcher` declarations | `neutral-tsc-strict-final.txt` |
| Tovu affected files (16), one file at a time | 15 files green. `vendor-neutrality` is 1/2, with combine's 3 hits. | `final-tovu/` |
| Tovu root tsc on tarballs | exit 0 | `tovu-consumer-tsc-final.txt` |
| Desktop staging on tarballs | exit 0, 15 modules | `desktop-stage-tarball-final.txt` |
| `pnpm check:cross-package`, with the XP3 snapshot rebuilt as S10 describes | exit 0, "XP1–XP5 clean" | `gate-cross-package.txt`, `xp3-*.txt` |
| `pnpm guard` | exit 1: R10 and R13 (below). HW1–HW9 counts as S10, "0 new". | `gate-guard.txt` |
| Tool-metadata golden | SHA-256 `a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6`, unchanged (checkout and consumer) | `tool-metadata-golden.txt` |

The 16 Tovu files were chosen by what this run touches: member-login ×6 (F2 and 1b), the F5 pair, the F7 seven, and vendor-neutrality.

**XP3 snapshot.** A clean clone at `35c4961af`, frozen install, core build, then the recursive build. All exit 0. The current `scripts/check-no-cross-package.ts` was invoked by absolute path with `--write-baseline`, giving "3308 source mappings".
- manifest SHA-256 `d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459`, which matches;
- declaration aggregate `48f6d4223224dc975edfbdebf1a01a25bf12044dfd1d4f872624571266452d24`, which matches.

`JINI_DECLARATION_BASELINE_DIR` was set for the gate.

**Guard violations, shown on combine** (`combine-jini-guard.txt`: a clean Jini clone at `e1b1bdbd6`, frozen install and build, then `pnpm guard`):
- **R10, prior.** The same text appears on combine: "`packages/chat/src/react/features/chat-pane/components/ChatPane.tsx`: imports "Icon" from "../../../components/Icon.js" … not in the public barrel's export list".
- **R13, environmental.** The same text appears on combine: "`packages/agent-runtime/src/defs/claude.ts`: fallbackModels is missing 1 model(s) the live claude-code-picker-cache reports: claude-fable-5-2". This container's picker cache lists that model, and combine's `fallbackModels` fails against it in exactly the same way.
- Combine's guard totals: "2 guard violation(s)", exit 1. The tip's are the same.

The first combine attempt is kept in raw as setup evidence: it cloned without the combine commit, then ran an unbuilt tree.

## Every error and red in this run

- **Tovu `vendor-neutrality.test.ts`:** `no generic seam file names the first provider`. Hits: `bundled-catalog.ts:43`, `bundled-catalog.ts:44`, `shared-owner.ts:81`. **Prior**; the same assertion fails on combine.
- **Jini guard R10** (`ChatPane.tsx` imports `Icon` outside the public barrel). **Prior**, see above.
- **Jini guard R13** (`claude.ts` fallbackModels lacks `claude-fable-5-2`, which this container's live picker cache lists). **Environmental**, see above.
- **Strict neutral tsc**, 4 declaration errors from `Pick<RequestInit,'dispatcher'>` / `RequestInit['dispatcher']` under the DOM lib:
  - `agent-runtime/dist/providers/connection-test.d.ts`
  - `agent-runtime/dist/providers/elevenlabs.d.ts`
  - `agent-runtime/dist/providers/model-catalog.d.ts`
  - `oauth/dist/dns-pinned-transport.d.ts:21`

  These are on the release list and left alone.
- **`user-management` public-args (`login-providers.ts` and `login-types.ts`).** Extraction-caused after combine, not prior. **Fixed** in 1b.
- **Setup-only failures, not product reds:**
  - The first desktop staging run had no built `@tovu/sdk`.
  - Staging against the committed registry lock fails at build time (see item 3).
  - The first combine guard attempt cloned without the combine commit, then ran unbuilt. It was redone.

Left alone as briefed: F8 dependency floors, the access-token `.todo` wording, the four `dispatcher` declaration errors, and the 17 FAT files. Full suites were not run.

## Delivery

**Jini cloud/extract-s10**, each commit pushed:

| SHA | Item |
| --- | --- |
| `7871ddd7` | 1: F2 import from `@jini-ai/core/contracts/oauth`; oauth peer, meta, note and dev dependency removed; lockfile |
| `4397a493` | 2: F3 optional-peer notes and entry `@agent-note`s |
| `cd25cb27` | 1b: typed optional arguments in the member-login parser and error |
| `de19462c` | 4: F4 consumer test, two example devDependencies, lockfile |

**Tovu cloud/extract-s10**, each commit pushed:

| SHA | Item |
| --- | --- |
| `a1d33ad3` | 6: F1 vendor-neutrality exclusion |
| this commit | 8: this report and `raw/extract-s10-f/`. The SHA is in the final message. |

Items 3, 5 and 7 changed no code. Their evidence is in raw.

**Processes and scratch.**
- The PostgreSQL cluster was stopped with `pg_ctl stop`.
- Every background job (installs, builds, XP3 snapshot, combine clone, shards, staging, gates) finished on its own.
- `ps` shows no node, pnpm, vitest, tsc, esbuild or postgres process.
- Scratch consumers, clones and tarballs stay in private scratch and are not committed. The XP3 build clone was deleted after its snapshot was written.

No secret, real key or token-shaped value is committed. The tokens in the F4 test and outputs are literal `fake-` strings.

Time: start 2026-11-09T23:24:31Z, end 2026-11-09T23:48:02Z, within the one-hour cap. The subagent used about 261k tokens.

EXTRACT-S10-F DONE
