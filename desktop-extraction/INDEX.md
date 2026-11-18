# Desktop extraction plan (2026-11-16): INDEX

Status: **PARTIAL, revision 3 (2026-11-16, Opus review applied; table at the end; coordinator decisions in section 0)**. Revision 2 (2026-11-17): all 20 findings of `CODEX-JUDGE.md` were checked against the code (19 accepted, 1 accepted in part with a rebuttal; table at the end). Not finished, numbered in section 10: the D0c design, D0e's sheet, Inventory blocks for D3-D6. Round 1 said: COMPLETE as a plan (all seven survey steps have sheets). Planning only: no source file was edited, nothing was built, typechecked or run. What was not verified is in section 9.

**D0c revision 3 (2026-11-18, rethink, unjudged):** `designs/D0c-REVISION-3.md` replaces the host-shared design (`designs/D0c.md`, `D0c3.md`, `D0c3-REVISION-2.md`, `D0c3-sheets.md` and the D0c rows of section 5) for everything not yet landed. Owner question Q1 (host-shared vs request-facts) is answered there with recommendation C: no `@tovu/host-shared`; sheets in `designs/d0c-v3/` (own COMMON). Q2 (product-telemetry provider loading) blocks only D0c3c/D0c3d.

Read `COMMON.md` first (base, first commands, 12 STOP conditions with a command each, proof levels, report format). Sheets: `D0-website-imports.md`, `D1-ipc-lifecycle.md`, `D2-notes-desktop.md`, `D3-supervision.md`, `D4-registry.md`, `D5-chat.md`, `D6-renderer.md`.

## 0. Coordinator decisions (revision 3, 2026-11-16; recorded identically in the notes plan's INDEX)

1. **One owner per shared surface.** This plan owns `desktop-host` `./bridge` (D0d), the IPC kit at **`./electron/ipc`** + **`./electron/ipc/preload`** (D1a; neither name exists on merge-final, and `./electron/*` is the naming `desktop-host` already uses: `./electron/navigation-policy`, `./electron/updates`, `./electron/usability`), and every change to `createNodeSidecarLauncher` / the ready-line wait (D3a, D3c1).
2. The notes plan **consumes** those surfaces: its sheets that built them (its old D0: `./bridge`, `./ipc`, `readyLine`) are removed and replaced by prerequisites on D0d and D1a. **`examples/notes-desktop` is owned by the notes plan only**; this plan's D2 is withdrawn (`D2-notes-desktop.md` now says where each piece went). D3c1 may edit only the launcher binding line(s) of `examples/notes-desktop/src/main.ts`, after notes D1 has landed.
3. **`@jini-ai/node-adapters` is created only by xpkg sheet N1** (`plan/xpkg-lane-sheets-2026-11-16`, wave 0b). D3b1 depends on N1 and adds the subpath `./process-observation`; D3c1 adds the spawn/tree-kill subpath. **OD-3 is DECIDED (owner, 2026-11-16): node-adapters holds fs/lock/process bindings only.**
4. Notes G1 reuses `@jini-ai/http-kit/node-bridge`; nothing beyond fs/lock/process goes into node-adapters (affects this plan only through decision 3).
5. Notes G19 (agent may change note bodies) is on HOLD as an owner decision; no effect on this plan.

## 1. Code read, and reconciliation with tonight's branches

| Input | State found | Consequence |
|---|---|---|
| `integ/merge-final-2026-11-16` | does not exist | |
| `integ/merge-a-2026-11-16` @ `f354cfbd` (00:52 UTC) | contains `refactor/terra`; contains the `fix/desktop-waveb` desktop fixes (29 desktop files differ from terra; 5 files still differ from the branch tip) | read for `apps/desktop` |
| `integ/merge-b-2026-11-16` @ `dd70b057` (00:58 UTC, the newest) | contains terra; `apps/desktop` is **identical to terra**: the desktop part of `refactor/desktop-args` and the security dependency bumps are held as `cloud-results/merge-b-desktop.patch` (135 files) because the desktop pre-push gate failed on that tree | read for everything outside `apps/desktop`; the patch was applied on top of merge-a's desktop for reading |
| merge-a and merge-b | **diverged** (neither contains the other); a trial merge conflicts in about 24 non-desktop files | not this plan's work, but BASE (below) needs it |
| Patch onto merge-a's desktop | applies, with **13 conflicts**: `main/index.ts`, `main/updates/desktop-updater.ts`, and 11 tests (`find-menu`, `import-handoff-ipc`, `main-agent-runtime-wiring`, `main-shutdown-wiring`, `main-theme-preview-wiring`, `main-updater-wiring`, `project-ipc-dispatch`, `project-ipc`, `workspace-chat-ipc`, `workspace-conversation-gaps`, `zoom-menu`) | prerequisite **P0** |
| `refactor/desktop-args` (lanes R1, R2, M, T) | done: exported functions and Tovu port types take `(required, optional)`; two splits (`tovu-server.start.ts`, `project-ipc.site-lifecycle.ts`) | every signature in these sheets is the object-args form; Electron-dictated, DOM, React and Jini-contract slots stay positional (that plan's exempt list) |
| xpkg lane sheets | `desktop-host` has **no** rule-breaking import (0 census rows). `sidecar -> platform` has 3 sites, owned by lane **R11b-1** (wave 3; the only xpkg run on `packages/sidecar/**`), which also turns `supervisor-node.ts` into ports. xpkg OD-3 is **decided** (node-adapters, N1) | D3b2 and D3c wait for R11b-1; D3b1 waits for N1 (revision 3) |
| Daemon R7/R8 designs (revision 2) | `desktop-agent.ts` is a named caller in both: R7-G1 converts `tool-catalog` and `delegated-tools` (the two route groups the desktop mounts on Express); R8 changes its `createAgentExecutor` call | D5 is blocked until both land; D5 does not edit `desktop-agent.ts` |
| Jini | `integ/merge-b-2026-11-16` @ `674a19ea` read; it rewrote `desktop-host/electron/updates/auto-update-controller.ts` (about 285 changed lines) and added `electron/app-version.ts` | D1c2 re-reads the controller first |

**Revision 2 note on P0:** `integ/merge-b-2026-11-16` moved to `450ac748` ("merge-b desktop part: held cloud patch, pushed --no-verify, owner OK 11-16"): the desktop patch is now committed on merge-b, so P0 shrinks to merging merge-a (`e801e9ae`) with merge-b and getting the six desktop gates green **without** `--no-verify` (that push skipped them; S11 still forbids it for sheet runs). Both traps below still need checking on the result.

**Revision 3:** `integ/merge-final-2026-11-16` now exists (Tovu `f70017dc`, Jini `65d73b0d`). P0 = make the six desktop gates green on it without `--no-verify`, then check both traps below; until then BASE does not exist and no sheet runs.

**P0 (prerequisite, coordinator; not a sheet here): produce BASE** = merge-a + merge-b + the desktop patch with the 13 conflicts resolved, green on the six desktop gates. Two traps to check in the result: (1) `electron-updater` must be a **static** import (merge-a's side; `refactor/desktop-args` commit `b95d4e64` made it lazy again and the patch description says it carries the static form: verify `rg -n "import\(.electron-updater" apps/desktop/src` is empty); (2) the trusted-sender wiring in `main/index.ts` must be the desktop-args form `({ senderUrl }) => isShellPage({ raw: senderUrl })`; merge-a's `(raw) => isShellPage({ raw })` passes an object where a URL string is expected once the ports are object-shaped (class: IPC trusted-sender check; `rg -n "isTrustedSender: \(raw\)" apps/desktop/src/main/index.ts` must be empty).

## 2. Size now (re-measured on the reading tree)

| Pool | Survey (2026-11-10) | Now |
|---|---|---|
| `apps/desktop/src` non-test `.ts/.tsx/.mts/.cts` | 36,123 lines, 254 files | **37,073 lines, 249 files** |
| Desktop test files | not given | 319 files, 52,165 lines |
| `scripts/` + `bin/` | 2,808 | 2,945 by `find` (2,808 for `scripts/*.ts` + `bin/*`) |
| CSS | 2,314 | 2,332 (`app.css` 2,309, `SharedKeys.css` 23) |
| Jini `desktop-host/src` non-test | 4,774 | **4,895** (incl. the 157-line Swift helper; `electron/app-version.ts` is new) |
| Jini `sidecar/src` | not given | 2,322 |
| Jini `platform/src/fs` | not given | 2,823 |
| Tovu shims over `desktop-host` | 818 | **963 in 17 files** (about 820 without the two contract files and the speech preload) |
| Relative imports into `apps/website/src` | "16 modules" | **16 modules, 36 import lines, 22 files** (15 `src`, 7 `scripts`) + 13 test files |
| IPC | | 57 registrations in 13 files; 70 channel literals; 6 bridge globals; 60 `invoke/send` sites in the preload |
| Tests that read source or CSS as text | | 37 files |
| Existing `await import(` in non-test desktop source | | 8 runtime `import()` sites on the syntax tree (merge-final: `desktop-agent.ts:222`, `app-render-harness.ts:45,47,48`, `smoke-bridge.ts:76,77,86`, `smoke-native.ts:257`); owner rule says none: D0e |
| Declared, never imported | `@mcp-ui/client`, `@cfworker/json-schema` | still 0 import sites (D0d) |

Area totals (rule-assigned by file name, non-overlapping; the rules are in this run's scratch script and differ from the survey's, so compare totals, not rows):

| Area | Lines | Files | Generic and movable | Target | Sheet |
|---|---|---|---|---|---|
| Renderer: grid, onboarding, import, settings, keys | 7,203 | 63 | 400 to 580 (project list hooks) | `ui/site-card` | D4c |
| Registry + folder identity | 5,420 | 23 | 800 to 1,000 | `platform/fs` (new `./fs/*` entries) | D4a (split), D4b |
| Supervision | 4,188 | 21 | 1,500 to 1,800 | `sidecar` (`./keyed-serializer`, `./child-transitions`, `./fleet-supervisor`, `./ready-line`, `./child-registry`, `./orphan-reconcile`, `./child-launch`); `desktop-host/electron/process-resources` | D3 |
| Lifecycle, windows, menus | 3,788 | 20 | about 565 | `desktop-host/electron/app-shell/*`, `electron/usability` | D1c1 |
| Renderer: workspace, tabs, find, zoom, live views | 3,320 | 23 | 2,400 to 3,000 (part is adoption of `ui/tab-strip` and `browser-chrome`) + CSS share | `ui` (`./webview-workspace`, `./find-bar`, existing `./tab-strip`) | D6 |
| Dev gates, smokes, harnesses | 3,213 | 22 | 0 | STAY | |
| Agent/chat main process | 2,080 | 11 | about 250 to 350 | `chat` (`./server/bridge-serving`, store) | D5b |
| Packaging | 1,745 | 8 | 105 (manifest merge) | `devops/packaging/electron` | D1c2 |
| Renderer: chat | 1,558 | 11 | 850 to 1,150 | `chat` (`./transports/bridge`; existing hooks) | D5a, D5c |
| Contracts (IPC tables) | 1,158 | 15 | about 70 (chat message types) | with D5a | |
| Auth, owner keys, tokens | 1,018 | 4 | 0 for now (boot-token handshake about 150: deferred, section 8) | STAY | |
| Shims over desktop-host | 963 | 17 | already bindings | STAY | |
| Updates | 835 | 6 | about 370 | `desktop-host/electron/updates` | D1c2 |
| Telemetry | 359 | 4 | 0 | STAY (imports cut in D0c1) | |
| Preload | 225 | 1 | about 15 (`subscribe`) | `desktop-host/electron/ipc/preload` | D1a, D1b2 |
| Website modules reached by relative path | (website) | 16 | 153 to 292 generic (`redact-local-text`, `console-tee`, maybe `log-buffer`) | `diagnostics` | D0b |

**Movable to Jini: about 7.5k to 9.3k TypeScript lines** (survey: 8 to 11k), plus an unmeasured share of `app.css`, plus about 0.25k **new** lines (IPC kit; the Notes desktop's 600 to 1,100 new lines are now counted by the notes plan). **About 28k to 30k lines stay**: the Tovu multi-site product. The survey's totals were high mainly in registry (several files are already bindings over `platform/fs`) and supervision (previews stay; sleep/wake is counted under D6e).

## 3. MOVE / SPLIT / STAY by file

The per-file tables are in each sheet's "Measured" section (D3, D4, D5, D6) and in D0's module table. Summary of SPLIT-first files: `project-ipc.ts` (1,730; D4a), `tovu-server.ts` (1,103; D3c2), `site-process-registry.ts` (637; D3b), `site-dir-store.ts` (650; D4b), `use-find-in-page.hooks.ts` (711; D6b), `workspace-chat-transport.ts` (454, 23 functions; D5a), `site-history-menu.ts` (151; D1c1), `update-check-now.ts` (176; D1c2). Seven of the twelve desktop keys in `development/scripts/size-debt.json` are touched by a sheet; each sheet says when its key is deleted.

## 4. Order and prerequisites

```
P0 (BASE) ─► D0a ─► D0b ─► D0c1 ─► D0c2 ─► [D0c3 design + judge] ─► D0c3a ─► D0c3b ─► D0c3c ─► D0c3d ─► D0c3e (P)      D0d (any time after P0)
        │                    ▲ OD-1
        ├─► D1a ─► D1b1 ─► D1b2               D1c1, D1c2 (after P0; one at a time on main/index.ts)
        │     │ (OD-2 hardening commits come after D1b1/D1b2, per channel group)
        │     └─► [notes plan D1 notes-desktop consumes D0d + D1a]
        ├─► D3a ─► [xpkg N1] D3b1 ─► [xpkg R11b-1] D3b2 ─► [OD-4] D3c1 ─► D3c2      D3d (after P0)
        ├─► D4a1 (needs D1b1, D3a) ─► D4a2 ─► D4b ─► D4c
        ├─► [daemon R7-G1 + R8b] ─► D5a ─► D5b ─► D5c
        └─► D6a (needs D1b2, D4c) ─► D6b ∥ D6c ─► D6d ─► D6e ─► D6f
```
**Landing order (revision 2; replaces round 1's waves, which put D0a, D3a and D1c1 — all editing `main/index.ts` — in one wave and D1b1 with D1c2 in the next; judge finding 19).** One run **lands** at a time per shared file; the list is a total order for every run that touches a file in section 6:
```
 1 D0a   2 D0d   3 D1a   4 D3a   5 D0b   6 D3d   7 D1c1   8 D1b1   9 (withdrawn: D2 -> notes plan D1)   10 D1c2
11 [D0c design + judge]  12 D0c1  13 D1b2  14 D4a1  15 D4a2  16 [xpkg N1] D3b1  17 [xpkg R11b-1] D3b2
18 D0c2  18a [D0c3 design + judge]  18b D0c3a  18c D0c3b  18d D0c3c  18e D0c3d  18f D0c3e  19 D0e  20 D4b  21 [OD-4; after notes D1] D3c1  22 D3c2  23 D4c
24 [daemon R7-G1 + R8b] D5a  25 D5b  26 D5c  27 D6a  28 D6b  29 D6c  30 D6d  31 D6e  32 D6f
```
A run may be **worked on** while an earlier one is in review only if the two share no row of section 6; the pairs that qualify: D0d ‖ D0a, D1a ‖ D0a, D3d ‖ D0b, D3b1 ‖ D4a1/D4a2, D5a-c ‖ D4b-D4c, D6b ‖ D6c (with section 6's caveat). Everything else starts from the merged result of its predecessor: the first command of a run is `git fetch && git log --oneline HEAD..origin/<BASE>` (must be empty). Lockfiles are regenerated by install after every rebase (COMMON section 5), which is why two manifest-editing runs never land together. "A second desktop app can be built from Jini alone" is proven by the notes plan's D1 + D2 once D0d and D1a have landed (revision 3); everything in this plan after item 8 makes Tovu thinner.

## 5. Sheets, estimates, proof level

T = typecheck + tests + six desktop gates; P = packaged proof (staged closure + release workflow `build` job on macOS and Windows); E = a look at the running Electron app. Definitions in `COMMON.md` section 6.

| Run | Repos | Estimate (Sonnet) | Proof | Waits for |
|---|---|---|---|---|
| D0a contracts to `@tovu/contracts` (incl. headless barrel importer repoint to `@tovu/contracts/assistant-subagents-policy`) | Tovu | 120k | T, **P** steps 1-3 | P0 |
| D0b log helpers to `diagnostics` | Jini + Tovu | 120k | T, **P** steps 1-3 | D0a |
| **D0c design** — DONE (draft on `wave3/desktop-d0c`, judged 2026-11-18: `designs/D0c.md`) | none (docs) | - | - | OD-1 = DX-OD1 |
| D0c1 `@tovu/host-shared` + process-error-guards, product-events, jini-routes — **EXECUTABLE** (revision 4) | Tovu | 130k | T, **P** owed (DX-OD10) | D0b; base `wave3/desktop-d0c` |
| D0c2 startup-secrets + daemon-connection schemas — **EXECUTABLE** after D0c1 | Tovu | 120k | T, **P** owed | D0c1 |
| **D0c3 design** — REJECTED (`designs/D0c3-CODEX-JUDGE-1.md`), **revised** (`designs/D0c3-REVISION-2.md`, 2026-11-18, unjudged; base Tovu a7ebde50 = `wave3/desktop-d0c`, NOT in terra b5fbf2a5) | none (docs) | - | - | D0c2 |
| D0c3a host signals: `bundled-plugin-sources` (+ retired set), `host-signals`, `findProductRoot` walk + lazy `bundledAgentPluginsDirFor`; contracts build order — after rev-2 judge (`D0c3-sheets.md`) | Tovu | 170k | T, P owed | D0c2; `wave3/audit2-a` landed or abandoned (Q4) |
| D0c3b `runtime-mode` -> `@tovu/contracts` (signature adopted); `observability-export` -> host-shared, `checkout` required, website `isCheckoutInstall` — after rev-2 judge | Tovu | 150k | T, P owed | D0c3a |
| D0c3c plugin-host policy: vocabulary -> contracts; `plugin-export`, `system-content-types`, declarative **factory**, `createPluginHostPolicy`, the two product provider validators -> host-shared; **sdk build order** — after rev-2 judge + owner Q3 | Tovu | 210k | T | D0c3b; `wave3/xpkg-c12obs-r12` landed or abandoned (Q4) |
| D0c3d product telemetry: d.1 boot + consent reader with every consent caller; d.2 loader + `productProviderOf` (lazy, failure parity); d.3 desktop binding (string-identical search roots) — after rev-2 judge + owner Q3 | Tovu | 230k | T, P owed | D0c3c |
| D0c3e staging-step deletion (`stage` stays as `stage-payload.ts` only; verifier loses only the website copy) + cold-install check + **P** for D0c1-D0c3 | Tovu + CI | 110k + CI | **P** steps 1-4 | D0c3d; Jini `0.7.1-next.N` (DX-OD10, after 2026-11-19) |
| D0e remove the 8 existing lazy imports (outline only) | Tovu (+ Jini closure) | 150k | **P** | D0c3e (was D0c2), daemon R7/R8 for `desktop-agent.ts` |
| D0d `desktop-host/bridge` entry; unused deps | Jini + Tovu | 40k | T | P0 |
| D1a IPC kit `./electron/ipc` (three policies, policy required per registration, refusals reported, raw parity path; reference-desktop preload bundling) | Jini | 160k | T | P0 |
| D1b1 gate inventory + adopt: sites channels at parity (OD-2 hardening as a separate later commit) | Tovu | 150k | T, **E** | D1a |
| D1b2 adopt: chat + single channels + preload | Tovu | 130k | T, **E**, **P** | D1b1 |
| D1c1 split over-limit function, then quit ask, move-to-Applications, history menu | Jini + Tovu | 200k | T, **E** | P0 |
| D1c2 split `createDesktopUpdater`, update lifecycle (skip gate and copy stay in Tovu), manifest merge | Jini + Tovu | 190k | T, **P** | P0 |
| ~~D2 Notes desktop~~ withdrawn (revision 3): owned by the notes plan's D1/D2 | - | 0 | - | - |
| D3a fleet primitives, ready line | Jini + Tovu | 170k | T, **P** steps 1-3 | P0; lands outside xpkg R11b-1's wave |
| D3b1 characterization + `@jini-ai/node-adapters` subpath `./process-observation` (package created by xpkg N1, not here) | Jini + Tovu tests | 150k | T | D3a, xpkg N1 |
| D3b2 child registry, orphan reconcile (sync observation, identity-checked escalation, parentage vs file ownership; Windows keeps "never terminate", manual check) | Jini + Tovu | 200k | T, **P** (macOS; Windows = stated limit + manual check) | D3b1, xpkg R11b-1 |
| D3c1 one launcher (Jini) | Jini | 150k | T | D3b2, OD-4, notes D1 landed |
| D3c2 `startTovuServer` on the launcher | Tovu | 200k | T, **P** | D3c1 |
| D3d process resource data | Jini + Tovu | 120k | T, **E** | P0 |
| D4a1, D4a2 split `project-ipc.ts` | Tovu | 180k + 180k | T, **E** | D1b1, D3a |
| D4b folder rules to `platform/fs` | Jini + Tovu | 220k | T, **P** steps 1-3 | D4a2 |
| D4c project list hooks to `ui/site-card` | Jini + Tovu | 200k | T, **E** | D4b |
| D5a bridge transport | Jini + Tovu | 220k | T, **E** | daemon R7-G1, R8b |
| D5b serving side (the store stays in Tovu behind a port; OD-13) | Jini + Tovu | 150k | T, **E**, **P** | D5a |
| D5c conversation controller | Jini + Tovu | 180k | T, **E** | D5b |
| D6a pure rules | Jini + Tovu | 120k | T, **E** | D1b2, D4c |
| D6b find bar | Jini + Tovu | 230k | T, **E** | D6a |
| D6c webview workspace | Jini + Tovu | 240k | T, **E** | D6a |
| D6d adopt tab strip | Jini + Tovu | 200k | T, **E** | D6c, OD-8 if it stops |
| D6e live views, resources panel | Jini + Tovu | 200k | T, **E** | D6d |
| D6f CSS | Jini + Tovu | 200k | T, **E**, **P** | D6e |
| **31 runs + 1 design** (revision 3: D2 withdrawn) | | **about 5.3M Sonnet + 0.2M Opus design** (revision 2: 5.5M; round 1: 5.0M) | | |

Not in the total: P0; one cloud gate run per wave (about 60k each, 11 waves); one batched Opus review per wave (about 40k each) and the Opus look at screenshots for the 16 E runs (about 30k each); the owner's or CI's packaged smokes for the 8 P runs (no token cost counted). With those: **about 6.85M tokens** (revision 2: 7.1M; round 1: 6.5M). Every P level additionally waits for a published Jini snapshot (OD-10). Every run is under the 250k cap; D6c (240k) and D3b (230k) have the least room: each sheet tells the run where to split and report.

## 6. File-disjointness

Each run owns the files its sheet lists. Files touched by more than one run, and how that is ordered:

| File | Runs | Resolution |
|---|---|---|
| `apps/desktop/src/main/index.ts` (1,166; in size debt) | D0a, D0c1, D0c2, D0c3b, D0c3d, D1b1, D1b2, D1c1, D1c2, D3a, D3b, D3c2, D4b | **serial**: never two of these in one wave on unmerged bases; the landing order in section 4 is the serialization (round 1's wave table broke this rule) |
| `apps/desktop/src/project-ipc.ts` | D0a (one import), D1b1, D3a (imports), D4a1, D4a2 | serial by wave |
| `apps/desktop/src/tovu-server.ts` | D0a, D0b, D0c2 (imports), D3a, D3c2 | serial by wave; also a size-design target: check its log |
| `apps/desktop/src/desktop-agent.ts`, `desktop-agent-service.ts` | D0a, D0b, D0c2 (imports only); daemon R7 and R8 | coordinator-serialized with the daemon programme |
| `apps/desktop/src/preload/preload.mts` | D1b2 only | |
| `apps/desktop/electron-builder.yml`, `package.json`, `package-lock.json`; Jini `pnpm-lock.yaml` | every run that changes a dependency or export (D0a-D0e, D0d, D1a, D1c1, D1c2, D2, D3*, D4b, D4c, D5*, D6*) | serial by the landing order; the lockfile is regenerated by the run's own install and committed with the manifest (no coordinator-only files) |
| `apps/desktop/scripts/verify-staged-closure.ts`, `src/verify-package-cli.test.ts`, `src/staged-closure.test.ts` | D0c3e only (D0c2 changed none of them) | the `website` resource copy is removed in the same commit as the staging step |
| `composition/product-telemetry.ts`, `provider-contracts.ts`, `provider-plugins.ts` (+ tests), `packages/contracts/src/product-telemetry.ts`, `apps/desktop/src/product-telemetry.test.ts` | D0c3b, D0c3c, D0c3d; **`wave3/xpkg-c12obs-r12`** (provider factory options, validator ownership) | serial: c12obs-r12 lands (or is abandoned) before D0c3c; then the D0c3c/d step-0 gate re-derives the expectations |
| `features/agent-plugins/new-site-agent-plugin-tokens.ts` (uses `RETIRED_BUNDLED_AGENT_PLUGINS`), `apps/desktop/package.json` + lock | D0c3a; **`wave3/audit2-a`** | serial: audit2-a first, then D0c3a step 0 |
| `development/scripts/build-server.mjs`, `packages/host-shared/package.json` (`prepare`), `apps/desktop/package.json` (`predev`/`prebuild`) | D0c3a (contracts order), D0c3c (sdk order) | one sheet at a time (D0c3 is serial) |
| `packages/node-adapters/**` (created by xpkg N1, wave 0b) | xpkg N1 (creates), R11a (2), R11b-3 (3), R10b-1 (4); this plan: D3b1 (`./process-observation`), D3c1 (spawn/tree-kill subpath) | one landing per wave; D3b1/D3c1 land in waves where no xpkg run edits its `package.json` |
| `apps/desktop/src/renderer/app.css` | D6f only (D6b to D6e do not touch CSS) | |
| `apps/desktop/src/renderer/app/SiteWorkspace.tsx` | D6b (find wiring), D6c, D6e | D6b and D6c are parallel: D6b edits only the find-bar import and props; if it needs more, run D6b before D6c |
| `packages/desktop-host/package.json` (exports) | D0d, D1a, D1c1, D1c2, D3c1, D3d | each adds its own keys; landing order D0d, D1a, D3d, D1c1, D1c2, D3c1 |
| `packages/sidecar/package.json`, `supervision/supervisor-node.ts`, `json-file.ts` | D3a to D3c1; xpkg R11b-1 | D3a lands before R11b-1 starts or after it merges; R11b-1 first for D3b2 onward |
| `examples/notes-desktop/**` | notes plan D1/D2 (owner); D3c1 (launcher binding line(s) of `src/main.ts` only) | notes D1 lands first |
| `packages/devops/package.json` | D1c2 (`update-manifest-merge`); notes plan D2 (packaging recipe) | one at a time |
| `examples/reference-desktop/**` | D1a (kit adoption + preload bundling) | |
| `packages/ui/package.json`, `packages/chat/package.json`, `packages/platform/package.json` | D4c, D6a to D6f; D5a, D5b; D4b | one run at a time per package |
| `development/scripts/size-debt.json` | any run that deletes a file with a key | delete own keys only |

## 7. Owner decisions

| # | Question | Recommendation | Blocks |
|---|---|---|---|
| OD-1 | Tovu's website and desktop share 8 Node modules of product code (telemetry boot, startup secrets, daemon schemas, host signals). Where do they live once relative imports are cut? | One new **Tovu** workspace package `@tovu/host-shared` (not a Jini package). Alternative: widen `@tovu/contracts` beyond types and pure rules (not recommended). | D0c1, D0c2 |
| OD-2 (does not block D1b1/D1b2: adoption is at parity, ungated rows stay raw on `ipcMain`; the hardening is a separate commit per channel group after approval) | The hardening (after adoption) adds a sender check to 21 site-management handlers and others that have none today, and narrows the trusted set for `runner:*`/`workspace:*` to the sites-home page (site admin pages stay trusted only for voice, files and import hand-off). Accept this hardening? | Yes. It is the point of the kit; the characterization diff shows exactly which senders become refused. | D1b1, D1b2 |
| OD-3 (xpkg) | Where Node runtime adapters live | **DECIDED (owner, 2026-11-16):** `@jini-ai/node-adapters`, created by xpkg N1 only, fs/lock/process bindings only | nothing (decided) |
| OD-4 | `createElectronDesktopHost` loses its default launcher (`sidecarLauncher` becomes required) and `createNodeSidecarLauncher` leaves `desktop-host`, so there is one spawn-ready-stop, in `sidecar` | Yes; a default would force `desktop-host` to import `sidecar` | D3c1, D3c2 |
| OD-5 | Windows orphan cleanup: today's identity proof uses `ps`; what it does on Windows was not verified. Rule proposed: identity unknown means never terminate, on every OS | Yes. Verified (revision 3): on Windows today's reads return `null`, so orphans are never terminated there; D3b keeps that | D3b |
| OD-5b (new, revision 3) | Should Windows clean orphaned site children (needs a Windows command-line + parent-pid reader in node-adapters: a behaviour change)? | Yes, as its own sheet with a Windows packaged proof; until then the Windows P proof of D3b2 is "orphans left by design" + manual check | nothing in this plan |
| OD-6 | If the Notes desktop cannot run its child on Electron's own Node (native module ABI, type stripping), may an example bundle a Node runtime? | Moved to the notes plan with notes-desktop (revision 3) | notes plan D1/D2 |
| OD-7 (now scheduled as D0e) | The desktop has 8 `await import(` sites today, including the "resolve core from the daemon's location" workaround (`desktop-agent.ts:219-221`). Remove them all (needs one deduplicated `@jini-ai/core` in the staged closure) as its own lane? | Yes, as a separate lane after D0c2, with packaged proof; not hidden inside a move | nothing here |
| OD-8 | If `ui/tab-strip` behaves differently from the desktop's strip in a user-visible way (overflow, keyboard, close), keep the desktop's behaviour as a Jini option, or accept Jini's? | Keep the desktop's behaviour as an option unless the difference is a fix | D6d (conditionally) |
| OD-10 (new) | Packaged proof needs the Jini half installable without a link (`release:inputs` refuses linked Jini). Who publishes a snapshot version of the touched `@jini-ai/*` packages, and how often? | The release owner publishes one snapshot per landed Jini lane that a P-level sheet depends on (D0b, D1c2, D3a, D3b2, D3c1, D4b, D5b, D6f); the Tovu commit pins it | every P level |
| OD-11 (new) | Run ownership for workspace chat (a sender may only reattach/stop runs it started) | Not now. It changes how pane disposal and reattach work; needs an identity, a lifetime and recovery rules first | nothing (removed from D5b) |
| OD-12 (new) | Stricter runtime checks the code does not have: an allow-list for the open-external view value; containment of erase targets to scan roots | Decide separately; D4a characterizes today's behaviour only | nothing |
| OD-13 (new) | May `@jini-ai/chat`'s conversation store carry a host-owned extra section (the tool-gap audit) under the same write lock, with migration of existing files? | Design first; until then the store stays in Tovu behind a port | the store part of D5b |
| OD-9 | UI runs (D4c, D5c, D6a to D6f): Sonnet executes and Opus reviews screenshots (as estimated), or Opus executes? | Sonnet + Opus review for D6a, D6f, D4c; Opus executes D6c and D6d (the two with behaviour comparison) | scheduling only |

## 8. Deliberately left out (with the reason)

- Boot-token session handshake (`desktop-auth.ts`, about 150 generic lines): security-sensitive, single consumer; no second host needs it yet. Revisit when one does.
- Preview store and scheduler, `external-site-stop.ts`, `admin-dev-proxy.ts`: Tovu formats or single consumer.
- Packaging helpers `verify-package-cli.ts` (184), `pty-helpers.ts` (50), `shell-staleness.ts` (77): candidates for `devops/packaging/electron` (about 300 lines) but each is tied to Tovu's payload layout; D2's report will say what a second app actually needed, and a follow-up sheet should be written from that.
- `sandbox: false` on the sites-home window (native ESM preload): the kit's preload file is import-free so a bundled CJS preload and `sandbox: true` become possible; switching Tovu is a separate, E- and P-proven change.
- Raw `.ts` shipped in the asar: D2 builds `dist/`; Tovu's own switch is not planned here.

## 9. Not verified by this run

- Nothing was built, typechecked or tested; "green alone" boundaries are designed, not proven. The reading tree is a local assembly, not a pushed SHA; 13 files were read at merge-a's side only.
- The import closures of the 8 Tovu Node modules in D0c beyond the first level; whether `zod` and the moved modules resolve in the staged closure.
- `listProcessSnapshots` output (full argv, parent pid) per OS; today's Windows behaviour of orphan identity; equality of the two `isProcessAlive` functions and of the two port allocators.
- Behavioural equality of `ui/tab-strip`, `browser-chrome` history hooks, `chat` stores and `useAssistantChats` with their desktop counterparts (each sheet makes the comparison step 1, with a STOP).
- How `tovu serve` is run in a packaged app (D2 step 1 reads it).
- The share of `app.css` that belongs to moved components.
- The personas and skills named in the first commit were read for their role, workflow, rule and guardrail sections, not every reference file they link.
- Estimates use the survey's ratio (about 400 tokens per moved line) adjusted per sheet; calibrate on D0a and D3a and re-plan if either is off by more than 40%.

## 10. What remains (revision 3; numbered)
1. **P0 / BASE**: merge-final must pass the six desktop gates without `--no-verify`. No sheet runs before.
2. **D0c design**: done and judged (`designs/D0c.md`); D0c1/D0c2 executed at T on `wave3/desktop-d0c` (not yet in terra). **D0c3**: design rejected by the Codex judge (`designs/D0c3-CODEX-JUDGE-1.md`: 4 blockers, all agreed); **revision 2** (`designs/D0c3-REVISION-2.md`) answers every finding, rewrites `D0c3-sheets.md` a-e and replaces the bespoke gates with one repo-command gate per commit (`tsc --explainFiles`/`--listFiles`, esbuild metafile, the ratchets, desktop `npm run gates`) against per-step expectations in `expect/`. Needs: a second judge; owner Q3 (desktop dependency list) and Q4 (land `audit2-a`, `xpkg-c12obs-r12`, and `wave3/desktop-d0c` on terra first). Q1 (keep lazy) and Q2 (factory) are answered by the revision.
3. **D0e**: outline only; its first step is the per-site table (the 8 sites are now listed).
4. **Inventory blocks**: D0 (per run) and D1b1 have executable ones; D3-D6 now run COMMON block S7 (`wc -l` of every file in the Measured table, 5 % tolerance) — executable, but coarser than a per-run block; the consumer lists in D3-D6 are still "inventory, do not trust".
5. **Function splits**: D1c1/D1c2 give a procedure and a STOP for the two over-limit factories, not a finished partition.
6. Not re-read against merge-final: D6, D4c, D5c, most of D3c/D3d.
7. Daemon `R7-ROUTES.md:331-350` (finding 8) was not opened.
8. OD-10 (who publishes Jini snapshots) undecided; every P level waits on it.
9. Owner decisions still open: OD-1, OD-2, OD-4, OD-5b (new), OD-6 (moved to the notes plan), OD-8, OD-9, OD-10, OD-12, OD-13.

## Revision 2 - judge response (`CODEX-JUDGE.md`)
Code read for verification: Tovu `integ/merge-b-2026-11-16` @ `450ac748` (desktop, website) and `integ/merge-a` @ `e801e9ae`; Jini `integ/merge-b` @ `9c982fd9`. `integ/merge-final-2026-11-16` did not exist. `D/` = `apps/desktop/src/`.
| # | Severity | Verdict | What changed (file) | Evidence |
|---|---|---|---|---|
| 1 | Blocker | ACCEPT | `D1-ipc-lifecycle.md`: three policies and no default; per-registration gate inventory; adoption table with the complete predicates; tests G1-G5 | `D/resources-ipc.ts:25-28`, `D/owner-store-ipc.ts:210-216` (main frame only); `D/main/updates/product-telemetry-boot.ts:115-117` (`&& url.startsWith("file:")`) |
| 2 | Blocker | ACCEPT | `D3-supervision.md`: `stopProcesses` dropped; `signal` port + escalation owned by orphan-reconcile with identity re-check; test (b) | `D/site-process-registry.ts:489-521`; Jini `platform/src/process.ts:570-583`; `core/src/contracts/runtime/process.ts:47-50` (no identity callback) |
| 3 | Blocker | ACCEPT | `D3-supervision.md`: two decisions / two kinds of evidence table; eight-row characterization matrix | `D/site-process-registry.ts:457` `isOrphanedProcess` (parent pid), `:572` three-part guard |
| 4 | Major | ACCEPT | `D3-supervision.md`: synchronous `observe` port; exported predicates stay synchronous; no caller becomes async | `D/site-process-registry.ts:318`; `D/project-ipc.ts:897-900` (inside `filter`); `process.ts:48` returns a promise |
| 5 | Blocker | ACCEPT (fix incomplete: design owed) | `D0-website-imports.md`: D0c1 marked not executable; three fixed decisions; D0c design run with output contract | website `server/runtime/composition/product-telemetry.ts:16,32-37,120-125` |
| 6 | Major | ACCEPT | `COMMON.md` proof P: stage → package → `--asar <archive>` with macOS/Windows paths, owed by every runtime-module move; `D0` D0c2: verifier changes with the resource removal, working search command | `apps/desktop/scripts/verify-staged-closure.ts:32-34,39-40`; `package.json:25-26` |
| 7 | Major | ACCEPT | `COMMON.md` section 5: landing unit includes lockfiles; linked proof is T only, P needs a published snapshot (OD-10); S1 rewritten as wip branch vs lane branch with `git rebase --exec`; coordinator-only list removed | `apps/desktop/package.json:22` `release:inputs`; round-1 `COMMON.md:34` vs `:61` |
| 8 | Major | ACCEPT | `D5-chat.md:10`: prerequisite is the merged R7-G1/R8b commits; Express stays | `D/desktop-agent.ts:34,366` (R7 design not re-opened: section 10 item 6) |
| 9 | Major | ACCEPT | `D5-chat.md:35,37`: operation port = existing runner-api methods; `classifyAgentTool` policy port + test | `D/renderer/runner-api.ts:125`; `D/renderer/workspace-chat-transport.ts:29,142` |
| 10 | Major | ACCEPT | `D5-chat.md:45`: full store contract first; store stays in Tovu behind a port; OD-13 | `D/workspace-conversation-store.ts:27-28,112` |
| 11 | Major | ACCEPT | `D5-chat.md:47`: hardening removed; today's reattach/stop characterized; OD-11 | judge's `workspace-chat-ipc.ts:172-181` (not re-opened); transport supports dispose + reattach |
| 12 | Major | ACCEPT | `D4-registry.md:40`: five effect-based erase tests; open-external tests of the real URL construction; OD-12 | `D/project-ipc.ts:1186-1191` (`view === "site" ? "/" : "/admin/"`) |
| 13 | Major | ACCEPT | `D4-registry.md:10,58,62`: synchronous `shouldRun`, `null`/report contract, `rewriteMovedRow` host port + erasability test, `.site-meta.json` | `D/site-relocation.ts:33,72,213,237` |
| 14 | Major | ACCEPT | `D0` D0c1 decision 3: independent registrations and disposal | website `server/runtime/boot/process-error-guards.ts:59-63` ("deliberately NOT guarded") |
| 15 | Major | ACCEPT | `D0` D0a step 2 (both barrel lines, type and value importers); D0b export keys in the commit that moves each file | `apps/website/src/contracts/headless/index.ts:13-14` |
| 16 | Major | ACCEPT in part / **REBUT in part** | Accepted: D0a's self-granted re-export removed; D1c2 skip gate and product copy stay in Tovu behind ports. **Rebutted:** `@jini-ai/ui-kit/react` in React entries is not a self-granted exception; it is the owner's option C, stated in this round's brief ("option C: React entries may import @jini-ai/ui-kit/react") and lesson 27 says to apply approved exceptions. `COMMON.md` S10 and `D6:28` now cite it | `D/main/updates/desktop-updater.ts:70` (`TOVU_DESKTOP_DISABLE_UPDATER`) |
| 17 | Major | ACCEPT (procedure, not a finished partition) | `COMMON.md` S9: Jini `pnpm check:size && pnpm check:complexity`; `D1` split-before-move step with STOP for the two factories | Jini `package.json:27-28`; `scripts/guard.ts` has no size check |
| 18 | Major | ACCEPT (partly done) | `COMMON.md` S2 (multiline, `.ts` and `.tsx`, call sites), S3, S6 (content diff); `D0` per-run starting inventory; D0e scheduled | section 10 items 2-3 list what is still missing |
| 19 | Major | ACCEPT | `INDEX.md` section 4: one total landing order; section 6 rows for lockfiles, verifier, node-adapters | round-1 W1 = D0a, D3a, D1c1, all in the `main/index.ts` row |
| 20 | Minor | ACCEPT | `D2-notes-desktop.md:52`: named package + `test` script | `&& test` is the shell builtin |

## Revision 3 - Opus review response
Review: `opus-review/desktop.md` (verdict NOT READY). Code re-checked read-only on `integ/merge-final-2026-11-16`: Tovu `f70017dc`, Jini `65d73b0d`. `D/` = Tovu `apps/desktop/src/`. Coordinator decisions are in section 0.

| Item | ACCEPT/REBUT | Change | Evidence |
|---|---|---|---|
| Judge #1 (blocker): contract disagrees with its fix (no `'main-frame'`, optional policy, per-instance policy, no parity path for 21 ungated handlers) | ACCEPT | `D1` D1a: `SenderPolicy` gains `'main-frame'`; `policy` + `isTrustedSender` are **required per registration** (`handle`/`on`), missing one throws; decision 4: ungated rows stay raw on `ipcMain` in the parity commit, pinned by a raw-channel test, and reach the kit only via OD-2 | `D/resources-ipc.ts:25-28`; `D/project-ipc.ts` 21 handlers take `_event` |
| Judge #1 / OD-2: round-1 hardening text left in D1b; dangling "and use:" | ACCEPT | `D1` D1b: parity paragraph replaces "security hardening... needs OD-2"; predicates paragraph scoped to OD-2 commits; tests paragraph: parity commit leaves expectations unchanged | review cites D1 "D1b1 and D1b2" section |
| Judge #6: P owed but INDEX marks D0a, D0b, D3a, D4b T only | ACCEPT | INDEX section 5: those four are T + P steps 1-3; D0a/D0b headers say so; OD-10 list adds D3a, D4b (D0a is Tovu-only, no snapshot) | COMMON section 6 (P owed by every runtime-loaded move) |
| Judge #7: D0d "report the lock diff for the coordinator" | ACCEPT | `D0` D0d step 3: lockfile committed with the manifest | COMMON section 5 landing unit |
| Judge #8: D5 first bullet says R7 removes Express | ACCEPT | `D5` bullet: R7 mounts converted routes; Express stays | `D/desktop-agent.ts:34,366` |
| Judge #10: D5 Measured row says use chat store and delete | ACCEPT | `D5` row: STAYS in Tovu behind a port (OD-13) | D5b step 1 |
| Judge #15: barrel repoint target wrong; proof can never pass | ACCEPT | `D0` D0a step 2 rewritten: 7 names repoint to `@tovu/contracts/assistant-subagents-policy`; shell importers to `.../assistant-native-fallbacks`; two censuses + four-line passable proof in a fenced block | Tovu `apps/website/src/contracts/headless/index.ts:13-14` (`./assistant-subagents-policy.js` = headless definitions file); `assistant/assistant-subagents-policy.ts:1` (only `assistantCliPermissions`); `contracts/core/assistant-native-fallbacks.ts:1` (imports the names); `packages/contracts/package.json` exports `./*` |
| Judge #17: nothing enforces 50 | ACCEPT | COMMON S9 block: ESLint `max-lines-per-function` 50 (blank/comment skipped), `complexity` 10, `sonarjs/cognitive-complexity` 10, `max-lines` 500 as errors; created/moved files must pass, edited files may not gain an error | Jini `scripts/check-size.mjs:15` (80), `:39` (50 = warn) |
| Judge #17: `package.json:27-28` citation off by two | REBUT | none: the citation is right on merge-final (the review read merge-a) | Jini merge-final `package.json:27` `check:complexity`, `:28` `check:size` |
| Judge #18: S3 regex flags type-position `import()` (~28 lines, not 8) | ACCEPT | COMMON S3: counts runtime `import()` calls on the TypeScript syntax tree, compares B vs HEAD; regex only for `createRequire(`/`loadOptionalPeer`; D0e lists the 8 real sites | merge-final: regex matches 28 lines; runtime calls = `D/desktop-agent.ts:222`, `renderer/app-render-harness.ts:45,47,48`, `smoke-bridge.ts:76,77,86`, `smoke-native.ts:257`; type-position e.g. `D/project-ipc.ts:1677-1678`, JSDoc `D/site-process-registry.ts:47` |
| Judge #18: D3-D6 Inventory blocks owed | ACCEPT in part | COMMON block S7 (`wc -l` of the Measured table, 5 % tolerance) makes D3-D6 inventories executable; per-run consumer blocks still owed (section 10 item 4) | |
| New blocker: two plans build the same surfaces | ACCEPT | Section 0 decisions; `D2` withdrawn (pointer table); D0d, D1a, D3 carry the ownership lines; INDEX sections 4-6 updated | notes `sheets/D0*`, `D1*`, `D2*` |
| New blocker: two creators of `@jini-ai/node-adapters` | ACCEPT | `D3` D3b1 adds subpath `./process-observation` and STOPs if N1's package is absent; section 6 row lists N1/R11a/R11b-3/R10b-1; COMMON S10 "no new package directory" | xpkg `INDEX.md:55,74`; `N1-node-adapters.md` |
| Major: OD-3 stale; which R11b | ACCEPT | OD-3 DECIDED; D3b2/D3c wait for **R11b-1** (the only xpkg run on `packages/sidecar/**`); D3a lands outside R11b-1's wave | xpkg `INDEX.md:86` (`packages/sidecar/**` R11b-1 only), `:104` (OD-3 answered) |
| Major: D3b Windows proof impossible; "ps bindings" vs "no ps fallback" | ACCEPT | `D3`: Windows keeps "never terminate"; P = macOS proof + Windows stated limit with a manual `Get-CimInstance` check; OD-5b (Windows reader) new; step 1 wording fixed; COMMON section 4 note | `D/site-process-registry.ts:398-399`, `:423` (`win32` returns `null`) |
| Major: D1a breaks the sandboxed reference preload | ACCEPT | `D1` D1a decision 7: esbuild bundling step in `examples/reference-desktop` `build`, esbuild devDependency, bundle test | Jini `examples/reference-desktop/src/main.ts:31,59`; `preload.cts:1`; `package.json:8` (`tsc` only) |
| Major: STOP commands with `\|` do nothing when copied | ACCEPT | COMMON section 3: table has no commands; all S1-S12 commands in one fenced block; D1 Measured commands M1/M2 fenced | lesson 29 |
| Major: `on` refusals dropped silently | ACCEPT | `D1` D1a: required `reportRefusal` (channel, kind, policy, sender URL; never payload) for `handle` and `on`; test | owner rule: errors never swallowed |
| Minor: S1 runs full desktop `npm test` per lane commit | ACCEPT | COMMON S1 + section 2: changed-file tests locally; full suite in the per-wave cloud gate run | owner rule: test only changed files |
| Minor: D5b packaged proof macOS only | ACCEPT | `D5` D5b P on macOS and Windows (manual fallback stated) | COMMON section 4 |
| Minor: D0c1 twin must not copy website dynamic imports | ACCEPT | `D0` D0c1 decision 1 + D0e note | website `product-telemetry.ts:120-121` |
| Info: lazy-core lines moved | ACCEPT | D5, D0e, INDEX cite `desktop-agent.ts:220-222` | merge-final `D/desktop-agent.ts:220-222` |
| Coordinator: enforcing command for 50 lines / complexity 10 | ACCEPT | COMMON S9 block (see judge #17 row) | |
