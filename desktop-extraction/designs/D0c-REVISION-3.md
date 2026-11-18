# D0c revision 3: a rethink (no `@tovu/host-shared`), 2026-11-18

Status: **DESIGN, unjudged. Edits no product code.** Written by an unattended Opus run. It replaces `D0c.md` (judgment section included), `D0c3.md` and `D0c3-REVISION-2.md` for everything not yet landed. Executable form: the sheets in `d0c-v3/` (start with `d0c-v3/COMMON.md`). Where this file and an older D0c file disagree, this file wins.

Base read (every fact below was checked on these trees with `git grep`/`git show`/`rg`; nothing was installed, built or run):
- Tovu `origin/integ/merge-3-2026-11-18` **2d82735a** (= terra b5fbf2a5 + combine-3 + combine-3-fix). D0c1/D0c2 are **not** in it: merged as `99e4ffb09`, reverted as `dd639c1fd`. The desktop still has the full 9-module / 11-line D0c inventory (section 4.1).
- Jini `origin/integ/merge-3-2026-11-18` **d37821a4**.

## 1. Why a rethink (owner rule: repeated same-class findings = question the design)

Four reviews of the host-shared design (D0c judgment, D0c3 judges 1 and 2, combine-3) keep finding the **same three classes**:

| Class | Instances | Common cause |
|---|---|---|
| A. A moved module drags its website closure | combine-3: `jini-routes` needs website `request-facts` (+ `resolveClientIp`, `resolveProtocol`, `TOVU_REQUEST_FACTS`); judge 2 B3: `findAncestor` callers left behind; judge 2 B4: `DeclaredContentTypeWritePorts`, input/config types; D0c judgment: telemetry drags `plugin-runtime/host-binding` (+ sdk, plugins, cms, commerce) | `@tovu/host-shared` is defined by **who uses** a module (both apps), not by **what domain** it belongs to. Every module brings whatever it touches, so the package grows into "everything both hosts touch": a package above domains |
| B. The new package's install/build tax | judge 1 B1 / judge 2 B5: sdk/contracts/host-shared build order in four paths; cold release install needs compatible pins; d0c-verify-fix obs. 1-2 (`prepare` fails on 0.7.0 pins, `predev`/`prebuild` skip it); D0c3 1.7: a `file:` package's runtime deps reach `app.asar` only if the desktop declares each | a new `file:` workspace package (its own `prepare`, its own slot in `build-server.mjs`, `predev`, `prebuild`, lockfiles, staging) |
| C. Gates that pass the wrong thing | judge 1 B3, judge 2 B1/B2: bespoke census scripts, `plant` helpers, trailer-selected expectations, Bash 3.2 | bespoke scripts written because the design needed bespoke census |

Each revision fixed the instances and the next review found new instances of the same classes. So the design is wrong, not the details.

## 2. Owner question Q1: "host-shared vs request-facts" (blocks D0c1/D0c2 re-application, and so D0c3)

**Question.** `wave3/desktop-d0c` moved `jini-routes.ts` into `@tovu/host-shared`; after daemon-r7 that file calls the website's `requestFactsLocals` on every dispatch (`apps/website/src/server/runtime/composition/jini-routes.ts:14,37`). A package the desktop also loads may not import the website. Which way?

| Option | What it does | Cost now | Long-term / modularity | Owner rules |
|---|---|---|---|---|
| **A.** Move request facts into host-shared | `request-facts.ts` Express half + `TOVU_REQUEST_FACTS` + `resolveClientIp` + `resolveProtocol` go to host-shared with `jini-routes` | revert-the-revert + move 4 more files, repoint their website importers | host-shared grows by the request-facts domain; the desktop loads facts code it never reads (its two route lists, `toolCatalogRoutes`/`delegatedToolRoutes`, read no `locals`) | breaks "no package above domains" harder; class A again |
| **B.** Required `locals` port on host-shared `mountJiniRoutes` | website passes `requestFactsLocals`, desktop passes identity | revert-the-revert + ~19 call sites incl. tests (combine-3-fix count) | host-shared stays; D0c3 then has to put plugin policy, telemetry, host signals into it (the two REJECTed designs) | host-shared is still a package above domains |
| **C. (RECOMMENDED)** No `@tovu/host-shared`. Each module goes to the owner of its **domain**; the host wires | `jini-routes.ts` **stays in the website** (it is Tovu's Express composition and owns the facts); the desktop mounts its two lists with **Jini's own generic Node binding**, which already exists: `@jini-ai/server` `mountRoutes` (`packages/server/src/mount-routes.ts:32`) and `presetRouteHost` (`route-host.ts:80`, same body as Tovu's `daemonRouteHost`). Other modules: section 3 | 3 small Jini commits + 5 small Tovu commits for D0c1/D0c2 (no package scaffold, no lockfile link, no build-order slot) | only three destinations, all existing: Jini (generic, published, its deps install transitively), `@tovu/contracts` (pure Tovu vocabulary; already a desktop dependency, already built by `predev`/`prebuild`, already staged), or the website (Tovu composition). New shared code never needs a new package | "generic code belongs in Jini", "the package states a contract and Tovu wires it", "Express OK behind a Server interface" (Jini's `mountRoutes` takes `app: unknown` with a `use` method, `mount-routes.ts:17-24`), no package above domains |

**Recommendation: C.** It is the easiest long-term because it removes the tax (class B) for good and makes class A impossible by construction: a module only moves to a package whose existing dependencies already cover it, otherwise it stays and the desktop composes its own instance from Jini parts. It is more modular because each rule keeps one owner by domain (request facts: website; route mounting: Jini; vocabularies: contracts). Short-term it costs more than A/B for D0c1/D0c2 (Jini commits and a Jini release before a cold release install passes), and it is much cheaper for D0c3, which A/B leave as the hard part.

Request-facts parity under C, by command:
- `git grep -n TOVU_REQUEST_FACTS -- apps/desktop` prints nothing; the facts are read only by website hooks through `readRequestFacts` (`apps/website/src/contracts/core/request-facts.ts:36-37`).
- Jini `delegated-tools.ts` and `tool-catalog.ts` contain no `locals` (`rg -n locals packages/daemon/src/http/{delegated-tools,tool-catalog}.ts` is empty), so dropping the facts key from the desktop's locals changes nothing they compute.
- Jini `mountRoutes` vs Tovu `mountJiniRoutes` for the desktop's calls: same dispatcher (`createNodeDispatcher({}, { expressCompatible: true })`), same parsed body, same `res.locals` minus the facts key; `recordRouteRegistrations` is inert when no route guard is installed (`http-kit/src/route-registration-guard.ts:121-122`); the desktop passes no `redactionPatterns` (`desktop-agent.ts:382-383`). `presetRouteHost` and `daemonRouteHost` have identical bodies.

Follow-up, NOT part of D0c (no over-engineering): the website's `mountJiniRoutes` duplicates Jini `mountRoutes` plus one `locals` line; folding it into Jini needs a `locals` port on Jini's function and touches ~19 call sites. Record only.

## 3. Destination of every D0c module under C

| Module (tip path) | Desktop needs | Destination | Why that owner |
|---|---|---|---|
| `server/runtime/composition/jini-routes.ts` | `mountJiniRoutes`, `daemonRouteHost` | **stays**; desktop uses Jini `@jini-ai/server/mount-routes` + `@jini-ai/server/route-host` (two new export-map entries, no new source file) | generic code already in Jini (sheet J1, T1) |
| `server/runtime/boot/process-error-guards.ts` | `installProcessErrorReporting`, `installUnhandledRejectionGuard` | those two functions -> Jini `@jini-ai/diagnostics/observability/node` (already holds `redactedError`, `createTracker`; already a desktop dependency). `reportFatalBootFailure` (Tovu wording "Tovu failed to start", `:160`) and the Tovu incident history stay in the website file | the two functions name no product (the D0c judgment's "Tovu wording" reason applies only to `reportFatalBootFailure`) (J2, T2) |
| `server/runtime/composition/product-events.ts` | `PRODUCT_EVENTS` | `@tovu/contracts/product-events` (pure tables + projection; runtime import only `TOOL_ATTEMPT_PHASES` from `@jini-ai/daemon/tool-audit`, a `universal` subpath) | Tovu vocabulary (T3) |
| `platform/secrets/startup-secrets.ts` | `STARTUP_SECRET_KEYS`, `DESKTOP_AGENT_SERVICE_ENV`, `initializeStartupSecrets` | names -> `@tovu/contracts/startup-secrets`; the consume-once mechanics -> Jini `@jini-ai/sidecar/supervisor/node` `consumeNodeStartupSecrets` (beside `splitNodeStartupSecrets`/`receiveNodeStartupSecrets`, which it composes); the website module **keeps** its process state and its 15 function importers unchanged; the desktop main calls the Jini function with the contracts key list | names are Tovu vocabulary; the mechanics are generic and Jini already owns their halves; process state is per process (J3, T4) |
| `server/runtime/lifecycle/assistant-daemon-connection.ts` | `daemonControlRequest`, `daemonEndpoint`, `siteIdleStopReply`, type `DaemonSiteRegistration` | schemas (lines 1-2, 4-25) -> `@tovu/contracts/daemon-connection`; module state stays | Tovu protocol schema; pure `zod` (T5) |
| `contracts/core/runtime-mode.ts` + `server/runtime/composition/observability-export.ts` | `resolveTovuObservabilityExport` | both -> `@tovu/contracts` (pure once `env` and `checkout` are **required**); website gets `isCheckoutInstall` in `product-root.ts` | Tovu interpretation of launch facts; Jini already owns the generic decision (`observabilityExportAllowed`) (T6) |
| `features/agent-plugins/host-signals.ts` + `bundled-contribution-sources.ts` + `site-paths`' `bundledAgentPluginsDir` | `resolveBundledHostSignals`, `bundledAgentPluginsDir` | generic listing + manifest reading -> Jini `@jini-ai/agent-plugins/lifecycle/node` (Jini already parses `hostSignals`/`deploymentAdvice`, `lifecycle/metadata.ts:15-16,84-92`, and already models the retired map as a host port, `lifecycle/ports.ts:51`); `RETIRED_BUNDLED_AGENT_PLUGINS`, the fallback composition `resolveDeclaredHostSignals`, the env/root rule `bundledAgentPluginsDirFor` and the root walk `findProductRoot` -> `@tovu/contracts` | (J4, T7) |
| `server/runtime/composition/product-telemetry.ts` | `bootProductTelemetry`, `createProductConsentReader` | **Q2 below** | |

## 4. Owner question Q2 (blocks only D0c3c/D0c3d: product telemetry and the staging-step deletion)

The desktop main boots product telemetry through the website's `loadProductProviders` (`product-telemetry.ts:119-157`), whose three lazy imports load Tovu's plugin-host binding (`features/plugin-runtime/host-binding.ts`: `@tovu/sdk` binding, tier policy, declarative content types, capability vocabulary, digest check). Whoever moves the boot must give the desktop the **same** admission policy (a second policy is a second owner: D0c3 section 4). That is a decision about who owns Tovu plugin admission, which is bigger than the desktop plan.

| Option | Effect | Cost | Verdict |
|---|---|---|---|
| **Q2-a (RECOMMENDED NOW)** Keep `product-telemetry.ts` as the one website module the desktop reaches | after T1-T7 the staging step bundles **one** module instead of 9; `stage` script, `electron-builder.yml`, verifier and release workflow untouched; the three lazy imports keep failure parity exactly | zero | converges; D0's last import stays until Q2-b is decided |
| **Q2-b (RECOMMENDED TARGET)** Tovu's plugin-host policy factory moves to its domain package `@tovu/sdk` (new `./host` entry: the policy half of `host-binding.ts` + `plugin-export.ts`); the generic boot/consent/guards and a catalog provider loader taking the host's binding as a **required** port move to Jini; each host wires them | the desktop owns no plugin rule; staging step deleted | Jini analytics + plugins commits, `@tovu/sdk` build order in `predev`/`prebuild`, a desktop `file:` dependency on sdk | needs the owner's yes on "plugin admission policy lives in `@tovu/sdk`" and its own judged design (`d0c-v3/T8-telemetry-boot.md` is an outline, not executable) |
| Q2-c A Tovu telemetry+policy package | host-shared again under another name | class A/B | rejected |

## 5. Order (each row lands and is judged before the next starts; J before the T that needs it)

| Sheet | Repo | Needs | Proof |
|---|---|---|---|
| `J1-server-route-subpaths` | Jini | - | T |
| `J2-process-guards` | Jini | - | T |
| `J3-startup-secrets` | Jini | - | T |
| `J4-bundled-sources` | Jini | - | T |
| `T1-routes` (D0c1) | Tovu | J1 | T; P owed |
| `T2-process-guards` (D0c1) | Tovu | J2 | T; P owed |
| `T3-product-events` (D0c1) | Tovu | - | T; P owed |
| `T4-startup-secrets` (D0c2) | Tovu | J3 | T; P owed |
| `T5-daemon-connection` (D0c2) | Tovu | - | T; P owed |
| `T6-observability-export` (D0c3a) | Tovu | - | T; P owed |
| `T7-host-signals` (D0c3b) | Tovu | J4 | T; P owed |
| `T8-telemetry-boot` (D0c3c) | both | owner Q2-b | outline only |
| `T9-staging-deletion` (D0c3d) | Tovu + CI | T8 | outline only; P |

J1-J4 are independent (four files, no overlap) and can run in parallel; T3, T5, T6 need no Jini change. P (COMMON section 6 of the plan) for T1-T7 needs one Jini release containing J1-J4, because a cold release install resolves `@jini-ai/*` from the registry (`desktop-release.yml:156-159`).

## 6. Every finding of the two judgments, answered

"Obsolete" = the v3 design no longer contains the thing judged. Line refs are the judges' own.

### `D0c3-CODEX-JUDGE-1.md`

| # | Finding | v3 answer |
|---|---|---|
| J1-C1..C4 | claims reproduced; host-binding 23 / provider-contracts 2 / 19 tests; `processBuildRelease` at :35; esbuild/electron-builder unverifiable | accepted (rev 2 corrected the counts). v3 cites no count it did not re-derive on 2d82735a; every sheet's step 0 re-derives its list with `git grep` and STOPs on a difference |
| J1-B1 | D0c3c cannot build cleanly: SDK/plugins order, dependency one commit early | **obsolete by design**: no host-shared, no sdk build-order change in T1-T7 (only T8, gated). Runtime deps are declared in the first consuming commit and checked by `npm pkg get` + `npm ls` per name (COMMON G-DEP) |
| J1-B2 | D0c3d splits an atomic change (`productProviderOf`, `noopTelemetry`, consent callers) | **obsolete for now**: the loader does not move (Q2-a). T8 outline keeps loader + `productProviderOf` + `noopTelemetry` in one commit and repoints every consent caller in the deleting commit |
| J1-B3 | gates pass the wrong thing (multiline imports, `plant`, Bash 3.2 `mapfile`, fixed EXPECT, swallowed errors, GREW exits 0, why-comments red) | **fixed by removal**: no census script, no plant helper, no trailers, no `mapfile`. The import gate is the **existing repo test** `apps/desktop/src/dist-import-check.test.ts` (matches the quoted specifier itself, so multiline imports are caught; runs inside `npm run gates`); each T sheet appends its module to `MOVED_WEBSITE_MODULES`. Mutation proofs are named per sheet with the exact edit and the exact failing test name expected (green control first). `check:errors -- --strict`; `check:why-comments -- --base "$BASE"` with `$BASE` = the sheet's own start SHA, so only this sheet's deletions count |
| J1-B4 | D0c3e proof cannot pass (fixture lacks the verified packages; zero-hit search matches the assertion; cold pins; archives) | **obsolete for now** (no staging deletion until T9). T9 outline carries the fixes: complete fixture, separate missing-package case, runtime-config-scoped search, real macOS/Windows archives |
| J1-M parity a | dev lookup walks `apps/node_modules` | obsolete (loader stays, Q2-a) |
| J1-M parity b | packaged signals fallback accepts an unvalidated ancestor | **fixed**: T7 desktop root = contracts `findProductRoot` (the website's walk + both markers + `MAX_WALK_UP`, moved, website `product-root.ts` calls it for all three of its callers) |
| J1-M parity c | static imports move provider failures out of the caught lazy load | obsolete (loader and its lazy imports untouched, Q2-a) |
| J1-M owner a | cross-package module mocking (`declared-tool-keywords-lazy`) | T7 does not move `bundled-contribution-sources.ts` (it stays, now delegating to Jini with the retired map), so that mock still targets a website file: no new cross-package mock. T2's two serve wiring tests: see COMMON allowed edit (b) |
| J1-M owner b | `resolveRuntimeMode` one-argument API | **fixed**: T6 `resolveRuntimeMode(required = { env: process.env }, _optional = {})`, body `required.env ?? {}`, so `()` keeps reading `process.env` and `({ env: undefined })` keeps meaning local; the existing test is the pin and is moved unchanged except its import line |
| J1-M owner c | module-scope bindings retained | no new module-scope binding anywhere in v3. Pre-existing website module state (`startup-secrets`, `assistant-daemon-connection`) stays where it is, listed, not widened |
| J1-M owner d | checkout fixtures `observability-export.unit.test.ts:24,32-33` omitted | **fixed**: T6 lists `:24,32-33` (move `checkout` into the first argument), `:38` and `:55` (add `checkout: isCheckoutInstall({})`, which is the value the default computed), exact edits in the sheet |
| J1-M overlap | `xpkg-c12obs-r12`, `audit2-a` not serialized | **resolved by base**: both are merged in 2d82735a (combine-3 table). Each sheet re-derives on its start SHA |
| J1-m1 | keep-root assertion too generic | obsolete for now (scrub/keep-roots do not move, Q2-a); T8 outline keeps the exact `app:///x.js:1:2` / `<path>:1:2` assertions |
| J1-O1 | full provider registry + commerce to the desktop | obsolete (nothing of provider-contracts moves) |
| J1-O2 | hand-maintained dependency fixture list | obsolete (no verifier change in T1-T7) |
| J1-U | unverified items, budgets | carried: section 7 |

### `D0c3-CODEX-JUDGE-2.md`

| # | Finding | v3 answer |
|---|---|---|
| J2-C1 | rev-list counts wrong (8, 342) | accepted; v3 states no rev-list count. Base is the tip (2d82735a), not a7ebde50 |
| J2-C2..C4 | edges, closures, importers, build facts reproduced; 23/2/19 | accepted; not reused (re-derived per sheet) |
| J2-B1 | gate cannot start (trailer from base; Bash 3.2 `case` in `$( )`) | **fixed by removal**: no trailer, no `case` inside a substitution; the per-commit gate (COMMON G) is a flat `set -euo pipefail` list of repo commands plus one literal test-file list per sheet, valid in Bash 3.2 (`/bin/bash -n` is step 0 of COMMON) |
| J2-B2 | false greens: root discovery, `grep` exit 2, multi-name `npm ls`, S9 evidence only | **fixed**: no root discovery, no `grep` in a pass condition except the architecture count, which fails closed when the line is missing; `npm ls` one name per command plus `npm pkg get dependencies.<name>` must not print `{}`; size/complexity are enforced by `check:size`/`check:complexity` (the repo's own limits) and the sheets keep every touched function <= 50 lines and complexity <= 10 by construction (moves are verbatim) |
| J2-B3 | a.3/b.2 leave broken callers (`findAncestor` at `product-root.ts:121,138`; `checkout` at `:55`; boot test `repoRoot` fixtures) | **fixed**: T7 moves `findAncestor` + `MAX_WALK_UP` to contracts and `product-root.ts` imports them for `resolveProductRoot`, `resolveAppDistDir` and `resolveCheckoutRoot` (all three callers); T6 lists `:55`; the boot test needs no `repoRoot` fixture because the desktop's checkout fact is `!app.isPackaged`, which T6 shows is behaviour-identical in every real launch (sheet T6, commit 2); one new boot-test case pins it |
| J2-B4 | c.2/d.1 omit type dependencies | obsolete (declarative content types and telemetry input types do not move, Q2-a) |
| J2-B5 | clean release inputs (pins before moves; overrides) and why-comments of the staging script | pins: T1, T2, T4, T7 consume unreleased Jini exports, so their **P** (not T) waits for one Jini release with J1-J4; T runs on `link-jini.mjs` like D0b. `apps/desktop/package.json:87` override (`@jini-ai/core`) is untouched. The staging script is not deleted (Q2-a), so no why-comment is lost; T9 outline moves its "Why" into `apps/desktop/RELEASING.md` and allow-lists each block with its carrying path |
| J2-M lazy | policy loaded eagerly; packaged provider smoke | obsolete (Q2-a keeps the lazy load byte-identical) |
| J2-M owner a | module singleton `host-binding.ts:74-86` | untouched (not moved) |
| J2-M owner b | moved-name aliases (`lifecycle.ts:52`) | **fixed**: T7 removes `RETIRED_BUNDLED_AGENT_PLUGINS` from the `lifecycle.ts:52` re-export line and repoints its importer `new-site-agent-plugin-tokens.ts:12` directly to `@tovu/contracts/retired-agent-plugins` |
| J2-M overlap | `wave3/su-cms-3` touches `main/index.ts`, `provider-plugins.ts`, desktop lock | **resolved by base**: su-cms-3 is merged in 2d82735a |
| J2-m1 | `.js` plant vs `.mjs` test | obsolete (no plugin policy move) |
| J2-m2 | platform-aware expected paths | T7 tests build expected paths with `path.join`, never string literals with `/` |
| J2-O1 | generic `hasMethods` in the API | obsolete |
| J2-O2 | `exists` seam on `isCheckoutInstall` | **accepted**: T6's `isCheckoutInstall(_required = {}, _optional = {})` has no seam; it is `existsSync(path.join(resolveCheckoutRoot({}), '.git'))`, the exact default expression it replaces |
| J2-U | unverified, 870k budget | v3 budgets: J1 25k, J2 60k, J3 50k, J4 70k, T1 50k, T2 80k, T3 50k, T4 80k, T5 60k, T6 120k, T7 120k = **765k** for everything except Q2-b; no sheet above 120k |

### `combine-3` / `combine-3-fix` blocker

| Finding | v3 answer |
|---|---|
| d0c moves `jini-routes.ts` into host-shared but it imports website `request-facts` (combine-3 row `wave3/desktop-d0c`; combine-3-fix item 2) | Q1-C: `jini-routes.ts` does not move. The revert `dd639c1fd` stays; **do not** `git revert dd639c1fd`. D0c1/D0c2 are re-applied by T1-T5 on the tip, reusing the reverted commits only as reading material (their characterization tests: sheet references) |
| d0c's `jini-routes` copy predates daemon-r7 | moot (no copy) |

## 7. Not verified by this run

No install, build, typecheck or test in either repo. In particular: that Jini `AgentPluginHostSignal` is assignable to contracts `HostSignal` (T7 step 0 checks it with `tsc`; STOP if not); the exact output line of `check:architecture` used by the gate (COMMON step 0 checks it on the base); that the desktop lock already holds `zod` transitively (T5 declares it either way); electron-builder placement of the new Jini dependency `@jini-ai/server` (P). Line numbers are 2d82735a's (Tovu) and d37821a4's (Jini).
