# Tovu → Jini extraction remainder

**Dispatch six Jini source sheets from merge-6.** Four Tovu sheets have enough detail for execution once their dependencies land. Keep the Tovu batch in draft until it reaches six. The two S6c halves are already pushed and use matching constructor contracts. The env remainder still has open work beyond the six dispatchable sheets.

I checked Tovu `776ce6d0f` and Jini `d3e78b387` with the supplied waiver for the missing `AI-Dev-Shop` directory. This was read-only. No files or refs changed, and no tests, builds, installs, type checks, or linters ran.

## Disposition

**PARTIAL** identifies rows whose evidence is insufficient for a source-edit brief. **READY-FOR-CODEX** includes source briefs with explicit combine or release predecessors.

| ID | Disposition | Evidence and order |
|---|---|---|
| Env J0, J1 core diagnostics | RETIRE | Census §4 records both as merged. `packages/core/src/env/describe-env-for-diagnostics.ts` already owns diagnostics formatting. |
| Env J1 presets | PARTIAL | `designs/env-schema/DESIGN.md:485` calls for server and CLI schemas and the first storage consumer. Preset declarations, direct callers, and the refusal inventory need merge-6 anchors. Keep the existing `SqliteBackendConfigError`, its messages, and its postgres-only validation. E60 belongs here and is shared with env S. |
| Env J2 | PARTIAL | Video source sheet E-V-J is ready. E-O-J covers the local-dev selector. Platform P and DB B remain open. See the ledger below. |
| Env J3 | PARTIAL | CLI URL source sheet E-C-J is ready. Desktop H, MCP M, sidecar I, daemon D and server S still need their caller manifests. |
| Env J4 | PARTIAL | E-A must bind the host shell value through auth, model discovery and invocation. `ex-env4` stopped before edits. `jb2` changes the runtime definition, executable registry and launch files. Rebase the inventory after `jb2`. |
| Env J5 | PARTIAL | E-NLWeb and E-Notes are ready. The remaining examples, dev flags, test hooks and scripts need individual assignments. |
| Env J6 | RETIRE | No J6 exists in `designs/env-schema/DESIGN.md:492`. |
| Env J7 | PARTIAL | The zero-debt cleanup follows J2–J5. The reviewed KEEP rows require a verified gate disposition before deleting the allowance. |
| Env T0 | PARTIAL | After J1 ships. Refresh the 176-name data inventory, classify the 45 refusal candidates, and pin bootstrap order and the local-CLI vetoes. |
| Env T1 | PARTIAL | After T0. Pin `REQUIRED_SECRETS` and `STARTUP_SECRET_KEYS` before deriving them. Generated docs and deploy-file inventory still need their exact inputs. |
| Env T2 | PARTIAL | After T0 and the J2 release. E-O-T is ready. E-V-T still needs the production environment binding and matching integration fixture. |
| Env T3a | PARTIAL | After T0. Census each entry’s S5 binding. Preserve the CLI-versus-direct-entry bind defaults and the order of secret consumption, IPC and settings parsing. |
| Env T3b | PARTIAL | After T3a and the size-01/02 composition splits. Refresh the former `deps.ts` and `app.ts` consumers against the split tree, including the pushed `tv-rs-e` and `tv-split` composition changes. |
| Env T4 | PARTIAL | After T3b. Inventory each parent/child pair. The server and sidecar stop-on-stdin bindings serve different children. |
| Env T5 | PARTIAL | After T3b. Map the feature, platform and assistant env bags to the named host slices and preserve source labels used in refusals. |
| Env T6 | PARTIAL | After T4. Refresh Electron main and the desktop launch fixtures against the combined desktop tree. |
| Env T7 | PARTIAL | After T0. Pin the three browser builds and their `DEV`/`MODE`/URL readers. Build constants have separate owners. |
| Env T8 | PARTIAL | After T3b–T6. Inventory dev flags, script entry points and test conversions. |
| Env T9 | PARTIAL | After J3 and T8. Remove the inert `TOVU_ALLOWED_ORIGINS` argument in `visitor-frontend-control.ts:67–68` with the wider Jini preset binding transition. |
| Env package entries, lock, releases | OPUS-CLOUD | Use the approved lockfile run for package entries, publication and Tovu lock consumption. Install the paired host wiring with any required-input release. |
| GitHub skill installer, two files | OWNED-ELSEWHERE `ex-err-jini` for `install-service.ts`; OPUS-CLOUD for the atomic move | `agentic/src/skills/install/{github.ts,adapters/github-rest.ts}` use the existing `SkillSourceFetchPort` and `SkillSourceValidatorPort` seam in `ports.ts:51–55`. The current `install-service.ts:4`, `ports.ts:1`, `state.ts:2` and `index.ts:4` still couple the installer to GitHub. The held branch touches `install-service.ts`. Migrate the public surface and host binding together once that file is released. Tovu’s `features/skills/__tests__/unit/github.unit.test.ts:3` imports the implementation from Agentic. |
| GitHub registry, three files | OPUS-CLOUD | `registry/src/{github-backend.ts,github-client.ts,providers/github-http.ts}` move together. `github-backend.ts:99` extends `StaticRegistryBackend` and uses Registry’s runtime validator. Existing registry types and `packages/registry/src/index.ts:21–22,30–31` need a legal dependency path and a paired export removal. No Tovu caller of the GitHub registry classes appeared in the scoped check. |
| Lipay signer and fake | OPUS-CLOUD | `commerce/src/payments/providers/lipay-gateway.ts:23` exports the signer. `payments/testkit/lipay-fake.ts:113,162` uses it and Commerce’s runtime `paymentError`. Use the existing `PaymentProvider` contract and resolve that runtime edge before introducing a provider entry. Repoint the Commerce kernel, accounting, ingest and ops tests, and Tovu’s `commerce-attention.unit.test.ts:18`, `commerce-composition.unit.test.ts:91` and `provider-plugins.unit.test.ts:2`. Keep the signer byte-for-byte. |
| Dormant GitHub deployment adapter | OWNED-ELSEWHERE `jy-pay` / `tv-y1` | D3 in their dispatches. It is a separate implementation from the five files above. |
| RD-J1, RD-J2, RD-T1 | RETIRE | `jb2` `c39b5bbdd` removes the chat guesser and flips the two former entropy-positive fixtures. `jb1` `6da21feaf` masks `accepted_json` with `maskedRequest`. `o-tv-b2/tv-b2.md:5` records the stdout-only boot-token change. |
| RD-T2 | NEEDS-DECISION | **May the two DKIM tests assert that public DKIM survives storage?** Recommend yes. After `jb1` + `jb2` are released and the cloud lock bump lands, prefix the opaque positive at `credential-chat-intake.unit.test.ts:59` with `sk-`. The two public-DKIM fixtures currently assert historical masking at `credential-chat-intake.unit.test.ts:51` and `credential-noise.unit.test.ts:38`. The simple policy leaves these values visible. Flip just those two assertions, retain the DKIM and URL inputs and all notice assertions. This is a test-only change and needs the narrow assertion amendment to the fixture-only cull. |
| a09 S1 | PARTIAL | After `jb2`. In `ui-a09-assistant-dock-chrome.md` §S1, refresh the dock bus, rule and preference consumers. Tovu’s setting keys and ledger policy stay with Tovu. |
| a09 S2 | OPUS-CLOUD | After `jb2`, S1 and C9b. The old React move needs a combined kit, hook, CSS and browser-entry inventory. Cull host-only UI and single-use wrappers before dispatch. |
| a09 S3 | PARTIAL | Tovu binding after S1/S2 and the shipped Chat entry. Refresh the component, hook, CSS and test imports against `origin/claude/uiux-split`, then verify the Desktop and admin dock. |
| R4 / C-CHAT-DEPS | PARTIAL | After `jb2`. Refresh `origin/wave2/chat-deps` row 390 against merge-6. The run-finalizer plan’s entry gate requires `RecoveryPorts.agents` and removal of `recover.ts`’s direct Agent Runtime import. Verify that gate in the combined tree before B1. |
| G-TESTS T0 | PARTIAL | After `jb2` and R4. Census §2’s G-TESTS-0 ratchet is a separate item. T0 still needs a current storage and replay test manifest. |
| Run-finalizer B1 | PARTIAL | Jini first, after `jb2`, `jb1`, C6 and R4. `DESIGN.md:619` uses a 26-test reconciliation against the older engine. Reconcile that list and current ports before moving files. The historical `@jini-ai/chat/testing` package-entry work goes to cloud if retained. |
| Run-finalizer C / F4 | PARTIAL | C is the Tovu binding after B1/B2, preserving late reads and the shared instance. F4 is the separate Jini `recover.ts` fix after B1/B2. Pin C16/C17 for settlement between CAS and reload and settlement during launch. The old pre-launch predicate covers only the first window. |
| Run-finalizer F1 / F2 | PARTIAL | Refresh C9 and C10 against the split implementation, then issue separate fix sheets. C9 pins which daemon receives cancellation when a replacement watch is active. C10 pins what happens after rejected settlement and who adopts the still-running row. |
| Run-finalizer F3 | NEEDS-DECISION | **Should recovery use a persisted terminal marker to distinguish a finished run from a dead unfinished run?** Recommend yes. Specify who writes it, its ordering relative to checkpoint and settlement, and behavior for old rows before drafting the fix. `designs/run-finalizer/DESIGN.md:479`. |
| L7a | PARKED | Census §3 identifies it as the desktop/admin general-chat controller merge, under todos L. |
| Arch L08 cache | OPUS-CLOUD | After `tv-bl` S7a/L08-types and the overlapping rendering changes. V4 finding E requires all durable, memory and peer repo constructions, all linked cache identities, and a parent pin that primes the existing cache. Keep invalidation synchronous after the write settles. |
| Arch L14 publish bag | OPUS-CLOUD | After L08 and `tv-xd5-publish`, `tv-rs-e`, `tv-split`, `tv-tq`. V4 finding H requires compiler discovery of registry and partial-bag producers. Pin post fallback, term read/apply/revert and absent-port behavior. |
| Arch L15.4 | OPUS-CLOUD | Bind the existing publication writer in `composition/http-app/public-middleware.ts`. Discover all `applyPublishedWebMcp` callers and fixtures. |
| Arch L15.5–7 | OPUS-CLOUD | Bind the existing publication reader across page tools, frontend control and confirmation. Use the same module instance as L15.4. Exercise matching revision and wrong-workspace refusal. Follow `r62t-feat2` on the visitor-approval file overlap. |
| Arch L15.8 | READY-FOR-CODEX | After K-04b-T. One public entry change and one route import. |
| B09 S2 / S3 | PARTIAL | `platform/src/secrets/index.ts:13–14` exports the parser and fingerprint aliases. Row 57 still needs refusal parity, then the Jini state-machine contract and Tovu callers. The withdrawn assumption that the aliases prove parity would leave the STOP unresolved. New `./secrets/root-key` entry goes to cloud. |
| a16 | PARTIAL | `split-a16-fs-files-tool-handlers.md` assumes row 41 has moved `fs-files`, `layout` and `write-files`. The Tovu registration still imports all three locally. Jini has narrower owners such as `strict-containment.ts` and `guarded-reader.ts`. Match declarations and path/approval semantics before selecting any deduplication. |
| Arch L05 | OPUS-CLOUD | V4 finding C and `o-tv-arch-w2/COMMIT-PLAN.md:67`. Pin the two `vendor-credentials/project-scope.ts` signatures, the four `siteKeyOps` bindings, per-call source order, hash fallback and read override. |
| Arch L06b | OPUS-CLOUD | After L05 and the current L06a binding. `o-tv-arch-w2/COMMIT-PLAN.md:67` records it unimplemented. Close the repository-target validator composition fixtures. |
| Arch L12b | OPUS-CLOUD | `member-login/link-service.ts:5–7` still imports the five members operations, while `:50–51,98` use `deps.members` as a repo. Use a distinct operation field and explicitly migrate `requestLoginEmailProof:166`. The L15 members mapper does not close this lane. |
| Arch L09b | PARTIAL | V4 finding F leaves port signatures and bindings unspecified. Refresh the seven remaining asset edges after L09a; the prior `o-tv-arch-w3/COMMIT-PLAN.md:42` STOP narrows the needed import guard. |
| Arch L10b | OPUS-CLOUD | After L10a, L03c and L04. V4 and the v5 handoff assign the remaining post-reader composition and fixture closure to the compiler run. |
| Arch L11b | PARTIAL | After L05. Put the required argument on `restoreImportedPluginState` in `site-backup/import-plugin-state.ts:27,43`. Enumerate direct and staged calls separately, including the direct `soon-lock.unit.test.ts` fixture. |
| Admin L4 / L5 | OPUS-CLOUD | Found both in `o-r62t-xd2-admin/r62t-xd2-admin.md:31,58`. L4 is Comments; L5 is SEO. Each moves CMS entries, browser closure and fixtures, then repoints Tovu. L4 precedes L5’s shared binding types. L5 intersects held `admin/src/seo/rules.ts` and its surface test, so the SEO move waits for `ex-err-jini` on those files. |
| S6c-J / S6c-T | RETIRE | Jini `xd-rs-c2` `86e9693b1` already exports all three SQL repos, has the neutral purge rationale at `form-delivery-repo.ts:160–167`, and uses injected table names. Tovu `tv-ext-rs-c` `64b0048ed6` binds those exact arguments at `form-delivery-binding.ts:5–7` and `after-assembly-forms-search.ts:84`. Combine those together and preserve the receipt test changes from `tv-tq`. The `rsh-jini` STOP describes an alternate redo. |
| K-04b-J / K-04b-T | READY-FOR-CODEX | Widen the selector’s field instead of narrowing the existing SEO record contract. Source sheets below. |
| `tv-tq` T1 | READY-FOR-CODEX | After `tv-xd5-publish` and `tv-tq`, against `tq-jini2`. Apply the unsheeted-c cull. |
| S7a / S7b | RETIRE / OPUS-CLOUD | Jini’s S7a is on merge-6. `tv-bl` finished the Tovu half. S7b media SQL follows S7a and needs the three-dialect proof. |
| L08 types, L08 preview Jini, L15.1–3/.9 | RETIRE | `tv-bl` finished the type, entry and mapper edits. `bl-jini` finished `withChatPreview` on `./media`. The existing L08-preview-T brief remains the adoption sheet. |
| a57 S2 | RETIRE duplicate | Use the approved existing Tovu sheet as written. `bl-jini` recorded the Jini disposition with the existing reporter API. Chrome look remains owed. |

| Explicit exclusions | Disposition |
|---|---|
| Hygiene-a/b and practice | OWNED-ELSEWHERE cloud cull |
| Launch-44-41 | OWNED-ELSEWHERE `jy-pay`, `jy-core`, `jy-pads`, `jy-cls`, `jy-pa`, `jy-pb`, `tv-y1`, `tv-y2` |
| Error system E3–E11 | OWNED-ELSEWHERE `r62t-err-sys` |
| Error-gate rows and catch-only census | OWNED-ELSEWHERE `r62t-err-rows` |
| AG-UI 2–4, MCP Apps, media paging/size, M5, traceparent/metrics, visitor approval | OWNED-ELSEWHERE `r62t-feat2` |
| Held Jini branch | OWNED-ELSEWHERE `ex-err-jini`. Its merge-base diff covers 89 files, including Agentic installer service, DB Postgres transfer target and tests, daemon research test, OAuth/auth files and Admin SEO rules. |
| ACP-3/4/5 redo | OWNED-ELSEWHERE ACP redo |
| RT-J3 | OWNED-ELSEWHERE routing |
| Tier-2 Tovu-styled class tokens | PARKED per screen |
| Todos L | PARKED |
| 424 long UI functions | PARKED permanently |
| fn50 / c6fix | OWNED-ELSEWHERE size and complexity jobs |
| Coverage | OWNED-ELSEWHERE coverage |
| Mutation testing | OWNED-ELSEWHERE mutation program. Named sheet mutations remain combine acceptance checks. |

### Env ledger

Ranges assign the same disposition to **each** occurrence in the range. E numbers are merge-6 positions in `scripts/env-access-debt.json`. Match live entries by `(rule, file, fingerprint)` and occurrence count. H and L refer to the IDs in `o-r62t-hardwire/r62t-hardwire.md`.

| Rows | Disposition | Assignment |
|---|---|---|
| E1–10, E84 | BLOCKED-E-A | Enumerate `execAgentFile`’s omitted callers in `auth.ts:224`, `defs/pi.ts:49`, `defs/amr/index.ts:195,221,245`. Thread host `fallbackComSpec` while preserving child precedence. |
| E11 | KEEP | Standalone skill CLI already has an injected env default. ENV-3 drops W. |
| E12, E13 | READY | E-C-J and E-V-J respectively. |
| E14–16, E18–19 | BLOCKED-E-D | Follow A and P, and `jb2` on launch. Env D owns child/probe values, host tools and research resolver binding. Research test path is held by `ex-err-jini`. |
| E17 | BLOCKED-E-D | `ex-env4:packages/daemon/src/close-status.ts:46–60` is donor evidence for the isolated timeout change. The current caller and fixture list is still open. |
| E20–25 | BLOCKED-E-B | Reuse the three DB fixture pairs only with their current callers. Each pair has distinct HW9/HW12 keys. |
| E26 | BLOCKED-ex-err-jini | `packages/db/src/transfer/postgres-target.ts` and transfer tests are held. |
| E27–28 | BLOCKED-E-H | WIP `aa3926fdb` and `e1f8a9ac0` source must be reconciled with current desktop config/path consumers. |
| E29 | READY | E-O-J. |
| E30–33 | BLOCKED-E-M | Inventory AppData, explicit-empty federation override and stdio parent map callers. Child filtering stays at the existing seam. |
| E34–56 | BLOCKED-E-P | `a81366310` is partial. Settle the neutral-host executable snapshot without adding a new ambient read to `support/self-check.ts`, then close lock, shell, editor, PTY and resource callers. |
| E57–59 | BLOCKED-E-S | After A/D/P. Compare middleware order, origin selection and missing-bearer refusal before integration. |
| E60 | BLOCKED-J1-presets | Storage preset input and validation closure. |
| E61–64 | BLOCKED-E-I | Reconcile sidecar bootstrap, IPC trace and path inputs with the current callers and the desktop host. |
| E65–66, E68, E70, E72–77, E81 | KEEP | Reviewed executable snapshots and startup checks. Preserve the paired HW9 entries while retiring the named import-time occurrences. |
| E67, E69, E71 | READY | E-NLWeb and E-Notes. |
| E78–80, E82–83 | BLOCKED-E-R | After A/D/S. Keep one reference-web boot snapshot, preserve grant-secret isolation and remove the two global assignments. |
| H7–12, H14 | BLOCKED-E-A | Then hardwiring B. Keep the two held Claude auth/OAuth paths assigned to `ex-err-jini`. |
| H19–20 | BLOCKED-E-D | Timeout and host tools env ownership. |
| H23, H25–28 | BLOCKED-E-B | Then hardwiring C5. |
| H32, H35–42 | BLOCKED-E-P | Then C9 for the remaining dispatcher and terminal work. |
| H44 | BLOCKED-E-I | Env I subsumes the duplicate C11 edit. Retire the hardwiring row after E-I lands. |
| H45, H102 | KEEP | Editor development diagnostics and UI-kit build substitution. |
| L3–6, L12 | BLOCKED-E-A | Log D after A and hardwiring B. Respect the held OAuth files. |
| L16, L18–19, L22, L24–26, L39 | BLOCKED-E-D/S/R | Log I after those three env sheets. |
| L30–38, L40–41 | BLOCKED-E-I | Log M after sidecar env I. |

The product-name rollout is already assigned to `jy-pay` K4/K7 and `tv-y1` T5. Follow those jobs if a later env sheet touches the same plugin or host files. **BREAKS:** Existing deployments and user settings keyed to the renamed Jini plugin env and worker-binding names require reconfiguration or redeployment. The owning briefs carry the per-binding breaks. The new source sheets below introduce no Jini env-name renames.

## Codex source briefs

**Copy this block into each job brief.** Preserve behavior. New public functions use `(required, optional = {})` where applicable, with framework-dictated signatures exempt. Inject hooks as props. No forwarding shells, new deps, `eslint-disable`, `@ts-ignore`, `as any`, or `as never`. Functions are capped at 50 lines and complexity 10. Record files above 500 lines in `COMMIT-PLAN.md` and continue. STOP the affected sheet on a missing declaration, uncensused production importer, required cast or exceeded function cap. Same-edit test importers go in `REFRESH.md`. Use only the brief’s scoped symbol checks. Keep `.git` read-only. Run no tests, builds, installs, type checks, linters or codebase-memory tools. Keep vendor code in provider packages and framework wiring at the host. Send package/lock/new-package work to OPUS-CLOUD.

Read the cull before edits. Move bodies and rationale verbatim except for edits named in the sheet. Add only the named declarations, bindings and test cases. Preserve existing failure and retry behavior. Re-read the diff and list sheet-required deletions in root `COMMIT-PLAN.md`.

### Jini

**E-C-J · CLI URL selection · merge-6 · 5k tokens**

Tests first. In `packages/cli/src/__tests__/daemon-url{,.pins}.test.ts`, replay the exact test hunks from `aa3926fdb` for flag/configured URL/discovery/default precedence, supplied map identity, empty values and skipped discovery. Mutate by moving discovery ahead of the configured URL and by sending a different env object. In `local-daemon-discovery.test.ts:118,123,132` pass the existing discovery fixture env in the first arg. In `integration-surface.test.ts:48` pass `{ env: {} }`. Existing import lines stay, including `import { resolveDaemonUrl } from '../daemon-url.js';` in `local-daemon-discovery.test.ts:9`.

Replay `aa3926fdb:packages/cli/src/daemon-url.ts:15–72` onto base `:15–81`. Replace `envVarName` with `configuredUrl?: string | undefined`, require `{ env }`, and delete `envCandidate`. In `main.ts:82,183`, retain `import { resolveDaemonUrl, type ResolveDaemonUrlOptions } from './daemon-url.js';` and call `resolveDaemonUrl({ env }, { flagUrl, configuredUrl: env[DAEMON_URL_ENV_VAR], … })` with the existing flag expression and other options. Update the two usage examples in `local-daemon-discovery.ts:11,43` to `{ env }`. Preserve the existing failure text in this sheet. The CLI public entry stays in place. Record E12 and the changed public signature in the commit plan. Cloud owes the API baseline and public examples. No visual look. STOP if a production caller lacks a host map or the precedence diff extends beyond this chain.

**E-O-J · Dev Node selector · merge-6 · 3k tokens**

Tests first. Reuse the `aa3926fdb` test hunks in `packages/devops/src/local-dev/__tests__/node-runtime.test.ts` at base `:5,9,16,24,47`, including identity of the env passed to both candidate probes. Mutation passes `{}` to `usable`. Keep `import { selectNodeRuntime } from '../node-runtime.js';` and the existing `local-dev/index.ts:2` export.

Replay `aa3926fdb:packages/devops/src/local-dev/node-runtime.ts:5–34` against base `:5–35`. Require `env` on `RuntimeInput`, remove it from `RuntimeOptions`, and take it from the first arg in `selectNodeRuntime:32`. Preserve candidate ordering and the Electron probe override. Record E29 and the `./local-dev` API signature delta. No manifest or new entry. Cloud pairs the release with E-O-T. STOP if another production probe or caller is found.

**E-V-J · FFmpeg lookup inputs · merge-6 · 6k tokens**

Tests first. Use only the exact `aa3926fdb` test hunks for `packages/cms/src/media/__tests__/hardwiring-ports.test.ts` and `video-frames.ffmpeg.test.ts`. The existing `node-entry.test.ts:9,14` checks export identity and needs no call change. `hardwiring-ports.test.ts:5` and `video-frames.ffmpeg.test.ts:9` retain their imports from `../video-frames.ffmpeg.js`. Pin supplied binary paths, platform, no-PATH refusal and forwarding to discovery. Mutate by discarding `searchPath` or the selected binary override.

Replay the `aa3926fdb` hunks for `video-frames.ffmpeg.ts`, base `:14–42,291–344`, covering `VideoBinaryFinder`, `executable`, `findVideoBinaries:31`, `ExtractorDeps`, `discoverBinaries`, and `createFfmpegVideoFrameExtractor:334`. Require `searchPath`, `ffmpegPath`, `ffprobePath`, each `string | undefined`, in both public first args. Keep `media/node.ts:11–13` exporting the same names via `./video-frames.ffmpeg.js`. Record E13 and `./media/node` API delta. No new package entry. STOP if the port needs any additional argument. Hold publication until E-V-T names the Tovu composition binding. Cloud owes real ffmpeg proof and a Chrome preview.

**E-NLWeb · Import-safe demo · merge-6 · 3k tokens**

Tests first. Port the import case from `aa3926fdb:examples/nlweb-demo/src/__tests__/server-entry.test.ts:1–11`. Import `../server.js` and assert the mocked `createServer` is uncalled. Omit the donor’s test-only public `main` assertion and cast-based listener fixture. Mutate by invoking startup outside the direct-entry guard.

In `examples/nlweb-demo/src/server.ts`, move the `NLWEB_DEMO_PORT` read at `:15` and the existing `createServer`/`listen` statements into private `startFromEnvironment()`. Preserve loopback, `4319`, response handling and startup text. Import `pathToFileURL` from `node:url`. Call startup only under `process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href`, as in `aa3926fdb:…/server.ts:69–71`. The env read belongs **inside the function**, so the AST gate does not count it as module scope. The manifest Start command is unchanged. No API entry. Record E67 removal and E66 KEEP. STOP if the file has an additional startup caller.

**E-Notes · Import-safe Notes entry · merge-6 · 3k tokens**

Tests first. Port `aa3926fdb:examples/notes-app/src/main-entry.test.ts:1–43` exactly. The dynamic import targets `./main.ts` and checks that import creates no database or listener. The subprocess uses flag values in conflict with the environment. Mutations call startup at import or switch flag and env precedence.

In `examples/notes-app/src/main.ts:7–34`, put the existing argument parse, database and port lookups, admin directory resolution, startup and shutdown listeners inside private async `startFromEnvironment()`. Add `pathToFileURL` to the existing `node:url` import. Await startup only under the direct-entry check from `aa3926fdb:…/main.ts:33–39`. Keep the existing defaults, path resolution, stdout and SIGINT/SIGTERM ordering. No entry changes. Record E69/E71 removal and E68/E70 KEEP. Chrome owes one Notes admin boot. STOP if any startup caller requires another entry path.

**K-04b-J · SEO cover projection · after `bl-jini` and `tq-jini2` · 10k tokens**

Tests first. In `packages/cms/src/seo/__tests__/cover-image.test.ts`, use `import { withCoverSeoDefaults } from "../cover-image.js";`. Port the featured/absent identity, library projection and explicit OG precedence cases from `tv-ext-rs-c:apps/website/src/features/seo/__tests__/cover-image-defaults.test.ts:10,18,38`. Mutations bypass the featured guard, drop the projected media ID and prefer the external URL over explicit OG. Use the existing SEO test record shape.

Set `packages/cms/src/media/cover-image.ts:10` to `featuredMediaId?: string | null | undefined;`. `SeoPostRecord` already permits explicit `undefined` at `seo/ports.ts:60`. Preserve all consumers of the widened input: the selector’s functions at `media/cover-image.ts:136,178,192,205,260` and `media/__tests__/cover-image.test.ts:5` with its existing import. This type change adds no runtime branch.

Copy `tv-ext-rs-c:apps/website/src/features/seo/cover-image.ts:1–94` to `packages/cms/src/seo/cover-image.ts`. Keep `resolveSeoCoverImage:10`, `readCoverSeoOverrides:28`, `withCoverSeoDefaults:45`, `withCoverReadDeps:65`, and `withContentImageSource:86`, including the existing narrowing assertion and argument shapes. Use these exact imports:

```ts
import type { GetEntryMetaDeps } from "./seo.js";
import type { SeoMeta } from "./types.js";
import type { SeoPostRecord } from "./ports.js";
import { collectCoverMediaRefs, resolveCoverImage, type CoverImage, type CoverMedia } from "../media/cover-image.js";
```

Direct Node entry `@jini-ai/cms/seo/cover-image` targets `./dist/seo/cover-image.{d.ts,js}`. Cloud adds or combines the manifest entry, API row and `.changeset/cms-seo-cover-image.md` after `bl-jini`, `rsh-jini` and `tq-jini2` CMS manifest changes. Injection debt delta zero. STOP if the leaf needs another package import, a new cast or an export from the universal SEO entry.

### Tovu

Paths below start at `apps/website/src` unless specified.

**E-O-T · Dev launcher binding · after E-O-J and its cloud release/lock bump · 2k tokens**

In root `development/scripts/dev.mjs:861`, add `env: process.env` to the first object passed to `selectNodeRuntime`. Keep `import { selectNodeRuntime } from "@jini-ai/devops/local-dev";` at `:55`. This is the sole scoped Tovu call. Existing Jini probe-map test supplies the mutation proof. Cloud owes one dev launch through selected Electron-as-Node and one Node fallback. No host test edits, debt edits or new manifest entries. STOP if the paired public signature differs or another production caller surfaces.

**K-04b-T · SEO callers · after K-04b-J is consumable, `tv-b1`, `tv-ext-rs-c` and `tv-xd5-render` · 5k tokens**

Tests first. Change the following import lines to `import { <names> } from "@jini-ai/cms/seo/cover-image";`, preserving the listed symbol order.

| Importer | Names |
|---|---|
| `features/seo/__tests__/cover-image-defaults.test.ts:6` | `withCoverSeoDefaults` |
| `features/seo/__tests__/cover-image-resolve.test.ts:10` | `resolveSeoCoverImage, withCoverReadDeps` |
| `features/seo/__tests__/cover-image-source.test.ts:11` | `withContentImageSource, withCoverSeoDefaults` |
| `features/seo/page-head-contributor.ts:2` | `withCoverReadDeps` |
| `server/inbound/admin-http/routes/seo/get-entry-analyze.ts:4` | `withCoverReadDeps` |
| `server/inbound/admin-http/routes/seo/get-entry.ts:4`, `put-entry.ts:14` | `withContentImageSource, withCoverReadDeps` |

Delete `features/seo/cover-image.ts` and its forwarding export at `features/seo/index.ts:26`. Cloud mutations admit trashed media, drop stored-override precedence and admit an external image into JSON-LD. The existing resolve, source and `cover-image-head.test.ts:84` pins cover them. No debt changes. Chrome owes body cover, explicit override and no-cover. STOP the deletion at combine if `worker-import-graph.test.ts` or either worker budget fails.

**T1 · Theme manifest validator · after `tv-xd5-publish` and `tv-tq`, against `tq-jini2` · 7k tokens**

`tv-xd5-publish` `23c00b5bc9` supplies `features/theme/template-applicability-errors.ts:3` and its `theme-manifest.ts:9` importer. Jini `themes/manifest-v2.ts:9,243` and `themes/template-applicability.ts:54` supply the replacements.

Tests first. In `features/theme/__tests__/template-applicability.unit.test.ts`, delete the three cases at `:53–61,63–68,70–75` ported to Jini. Repoint the imports to:

```ts
import { applicableThemeTemplates, parseTemplateFor, rejectTemplateFor } from "@jini-ai/cms/themes/template-applicability";
import { validateManifestV2 } from "@jini-ai/cms/themes/manifest-v2";
import { validateScripts } from "@jini-ai/cookie-consent/policy";
import { isSourceDirGeneratedConflict } from "../theme-file-policy.js";
```

Pass `validateScripts` and `isSourceDirGeneratedConflict` to the invocations at `:28,48`. In `__tests__/declared-scripts.unit.test.ts:8,37–38`, use the same last three imports and dependencies. Keep the invalid `templateFor` and unknown consent-category assertions. Mutations skip the `templateFor` check and return no script problems, respectively. Delete the ported `validation/__tests__/manifest-v2.test.ts`.

In `validation/validate-theme-package.ts:8,11,16,177` import `validateManifestV2, type ThemeValidationIssue` from `@jini-ai/cms/themes/manifest-v2`, `validateScripts` from `@jini-ai/cookie-consent/policy` and `isSourceDirGeneratedConflict` from `../theme-file-policy.js`. Supply both dependencies. Remove only `ThemeValidationIssue` from the profiles import and export. In `validation/{markup.ts:2,references.ts:4,structure.ts:7,webmcp-markup.ts:2}` use `import type { ThemeValidationIssue } from "@jini-ai/cms/themes/manifest-v2";`. Delete the declaration at `validation/profiles.ts:33–37` and its forwarding member in `features/theme/index.ts:29` on `tv-xd5-publish`. Repoint `theme-manifest.ts:9` to `import { rejectTemplateFor } from "@jini-ai/cms/themes/template-applicability";`.

Delete `validation/manifest-v2.ts` and `template-applicability-errors.ts`. Delete only the validator-path entry in root `development/scripts/coverage-integrity-baseline.json:56` on `tv-xd5-publish`. Record the error-gate row for combine. STOP on a missing Jini dependency export or a newly surfaced production importer. Run the existing worker and bundled-theme pins in combine.

**L15.8 · SEO public entry · after K-04b-T, `tv-bl`, `tv-xd5-render` and `tv-ext-rs-c` · 2k tokens**

Add `export { createSeoPageHeadHook } from "./page-head-contributor.js";` to `features/seo/index.ts`. Change `server/inbound/public-http/routes/site/pages/extra-head.ts:1` to `import { createSeoPageHeadHook } from "#src/features/seo/index";`. The existing `features/seo/__tests__/cover-image-head.test.ts:9` direct import remains the unit pin. No test edits. The combine mutations restore the deep import for the boundary gate and drop the cover in the existing OG/JSON-LD pin. No debt-row edit. STOP on a new cycle or any failure in the worker graph or budget. Share K-04b-T’s Chrome look.

## Dispatch order

| Branch | Base and order | Executor estimate |
|---|---|---:|
| `codex/ext2-jini` | Jini merge-6 with `bl-jini` and `tq-jini2`. E-C-J → E-O-J → E-V-J → E-NLWeb → E-Notes → K-04b-J. | 30k |
| `codex/ext2-tovu` **draft** | Tovu merge-6 plus `tv-b1`, `tv-ext-rs-c`, `tv-xd5-render`, `tv-xd5-publish`, `tv-tq`, `tv-bl`, and paired Jini entries. Verified order is E-O-T → T1 → K-04b-T → L15.8. Append E-V-T and RD-T2 only after their blockers close and their releases are consumable. | 16k verified, 24k provisional |

Cloud can combine S6c independently. For the env work, keep `aa3926fdb`, `e1f8a9ac0` and `a81366310` as donor refs. The ready sheets use only bounded hunks whose base files match. P, A, D, S and R need a refreshed caller inventory before reuse.

## Partial handoff

- **Env:** The ledger is assigned through E84 and covers all 26 held hardwiring rows and 24 held log-safety rows. The remaining sheets need the exact preset/refusal inventory, neutral-host snapshot, `execAgentFile` callers and Tovu bindings. For E-V-T, start at `server/runtime/composition/media-video-ports.ts:16`, its composition caller in `tool-catalog-manifest.ts:367` and `features/media/__tests__/view-video-tool.integration.test.ts:6,15,29`. The pending proof is that normal BYOK and CLI catalog construction both receive the host values.
- **Providers:** All seven source files are located. The held Agentic installer edit and the Registry/Lipay cross-package runtime edges prevent an atomic source-only move. The cloud briefs still need the final entry names and provider runtime import inventory.
- **Chat and architecture:** The remaining old anchors identify the necessary work. They still lack current importer or fixture manifests, or need the compiler in the loop as marked above. RD-T2 and F3 have the two specific decisions in the table. The four verified Tovu sheets remain a draft batch under the six-sheet dispatch rule.
