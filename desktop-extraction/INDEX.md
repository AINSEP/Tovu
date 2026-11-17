# Desktop extraction plan (2026-11-16): INDEX

Status: **COMPLETE as a plan** (all seven survey steps have sheets; nothing PARTIAL). Planning only: no source file was edited, nothing was built, typechecked or run. What was not verified is in section 9.

Read `COMMON.md` first (base, first commands, 12 STOP conditions with a command each, proof levels, report format). Sheets: `D0-website-imports.md`, `D1-ipc-lifecycle.md`, `D2-notes-desktop.md`, `D3-supervision.md`, `D4-registry.md`, `D5-chat.md`, `D6-renderer.md`.

## 1. Code read, and reconciliation with tonight's branches

| Input | State found | Consequence |
|---|---|---|
| `integ/merge-final-2026-11-16` | does not exist | |
| `integ/merge-a-2026-11-16` @ `f354cfbd` (00:52 UTC) | contains `refactor/terra`; contains the `fix/desktop-waveb` desktop fixes (29 desktop files differ from terra; 5 files still differ from the branch tip) | read for `apps/desktop` |
| `integ/merge-b-2026-11-16` @ `dd70b057` (00:58 UTC, the newest) | contains terra; `apps/desktop` is **identical to terra**: the desktop part of `refactor/desktop-args` and the security dependency bumps are held as `cloud-results/merge-b-desktop.patch` (135 files) because the desktop pre-push gate failed on that tree | read for everything outside `apps/desktop`; the patch was applied on top of merge-a's desktop for reading |
| merge-a and merge-b | **diverged** (neither contains the other); a trial merge conflicts in about 24 non-desktop files | not this plan's work, but BASE (below) needs it |
| Patch onto merge-a's desktop | applies, with **13 conflicts**: `main/index.ts`, `main/updates/desktop-updater.ts`, and 11 tests (`find-menu`, `import-handoff-ipc`, `main-agent-runtime-wiring`, `main-shutdown-wiring`, `main-theme-preview-wiring`, `main-updater-wiring`, `project-ipc-dispatch`, `project-ipc`, `workspace-chat-ipc`, `workspace-conversation-gaps`, `zoom-menu`) | prerequisite **P0** |
| `refactor/desktop-args` (lanes R1, R2, M, T) | done: exported functions and Tovu port types take `(required, optional)`; two splits (`tovu-server.start.ts`, `project-ipc.site-lifecycle.ts`) | every signature in these sheets is the object-args form; Electron-dictated, DOM, React and Jini-contract slots stay positional (that plan's exempt list) |
| xpkg lane sheets | `desktop-host` has **no** rule-breaking import (0 census rows). `sidecar -> platform` has 3 sites, owned by lane **R11b**, which also turns `supervisor-node.ts` into ports and may move it (xpkg OD-3) | D3b and D3c wait for R11b; D3c waits for xpkg OD-3 |
| Daemon R7/R8 designs (revision 2) | `desktop-agent.ts` is a named caller in both: R7-G1 converts `tool-catalog` and `delegated-tools` (the two route groups the desktop mounts on Express); R8 changes its `createAgentExecutor` call | D5 is blocked until both land; D5 does not edit `desktop-agent.ts` |
| Jini | `integ/merge-b-2026-11-16` @ `674a19ea` read; it rewrote `desktop-host/electron/updates/auto-update-controller.ts` (about 285 changed lines) and added `electron/app-version.ts` | D1c2 re-reads the controller first |

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
| Existing `await import(` in non-test desktop source | | 8 sites (incl. `desktop-agent.ts:221`); owner rule says none: OD-7 |
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

**Movable to Jini: about 7.5k to 9.3k TypeScript lines** (survey: 8 to 11k), plus an unmeasured share of `app.css`, plus about 0.9k to 1.4k **new** lines (IPC kit about 250, Notes desktop 600 to 1,100). **About 28k to 30k lines stay**: the Tovu multi-site product. The survey's totals were high mainly in registry (several files are already bindings over `platform/fs`) and supervision (previews stay; sleep/wake is counted under D6e).

## 3. MOVE / SPLIT / STAY by file

The per-file tables are in each sheet's "Measured" section (D3, D4, D5, D6) and in D0's module table. Summary of SPLIT-first files: `project-ipc.ts` (1,730; D4a), `tovu-server.ts` (1,103; D3c2), `site-process-registry.ts` (637; D3b), `site-dir-store.ts` (650; D4b), `use-find-in-page.hooks.ts` (711; D6b), `workspace-chat-transport.ts` (454, 23 functions; D5a), `site-history-menu.ts` (151; D1c1), `update-check-now.ts` (176; D1c2). Seven of the twelve desktop keys in `development/scripts/size-debt.json` are touched by a sheet; each sheet says when its key is deleted.

## 4. Order and prerequisites

```
P0 (BASE) ─► D0a ─► D0b ─► D0c1 ─► D0c2      D0d (any time after P0)
        │                    ▲ OD-1
        ├─► D1a ─► D1b1 ─► D1b2               D1c1, D1c2 (after P0; one at a time on main/index.ts)
        │     │ OD-2
        │     └─► D2 (needs D0d + D1a)
        ├─► D3a ─► [xpkg R11b] ─► D3b ─► [xpkg OD-3, OD-4] ─► D3c1 ─► D3c2      D3d (after P0)
        ├─► D4a1 (needs D1b1, D3a) ─► D4a2 ─► D4b ─► D4c
        ├─► [daemon R7-G1 + R8b] ─► D5a ─► D5b ─► D5c
        └─► D6a (needs D1b2, D4c) ─► D6b ∥ D6c ─► D6d ─► D6e ─► D6f
```
Waves (runs inside a wave are file-disjoint except where section 6 says "serial"): **W1** D0a, D0d, D1a, D3a, D1c1. **W2** D0b, D1b1, D1c2, D2, D3d. **W3** D0c1, D1b2, D4a1, D3b. **W4** D0c2, D4a2, D3c1. **W5** D4b, D3c2, D5a. **W6** D4c, D5b. **W7** D5c, D6a. **W8** D6b, D6c. **W9** D6d. **W10** D6e. **W11** D6f. (D5 runs move later if the daemon lanes are not merged; nothing else waits for D5.) After W2, "a second desktop app can be built from Jini alone" is proven (D2); everything after makes Tovu thinner.

## 5. Sheets, estimates, proof level

T = typecheck + tests + six desktop gates; P = packaged proof (staged closure + release workflow `build` job on macOS and Windows); E = a look at the running Electron app. Definitions in `COMMON.md` section 6.

| Run | Repos | Estimate (Sonnet) | Proof | Waits for |
|---|---|---|---|---|
| D0a contracts to `@tovu/contracts` | Tovu | 110k | T | P0 |
| D0b log helpers to `diagnostics` | Jini + Tovu | 120k | T | D0a |
| D0c1 telemetry boot to `@tovu/host-shared` | Tovu | 120k | T | OD-1, D0b |
| D0c2 daemon schemas, secrets, host signals; delete staging step | Tovu | 150k | **P** | D0c1 |
| D0d `desktop-host/bridge` entry; unused deps | Jini + Tovu | 40k | T | P0 |
| D1a IPC kit | Jini | 150k | T | P0 |
| D1b1 adopt: sites channels | Tovu | 130k | T, **E** | D1a, OD-2 |
| D1b2 adopt: chat + single channels + preload | Tovu | 130k | T, **E**, **P** | D1b1 |
| D1c1 quit ask, move-to-Applications, history menu | Jini + Tovu | 180k | T, **E** | P0 |
| D1c2 update lifecycle, manifest merge | Jini + Tovu | 170k | T, **P** | P0 |
| D2 Notes desktop | Jini | 220k | T, **P**, **E** | D0d, D1a, OD-6 if it stops |
| D3a fleet primitives, ready line | Jini + Tovu | 170k | T | P0 |
| D3b child registry, orphan reconcile | Jini + Tovu | 230k | T, **P** | D3a, xpkg R11b |
| D3c1 one launcher (Jini) | Jini | 150k | T | D3b, xpkg OD-3, OD-4 |
| D3c2 `startTovuServer` on the launcher | Tovu | 200k | T, **P** | D3c1 |
| D3d process resource data | Jini + Tovu | 120k | T, **E** | P0 |
| D4a1, D4a2 split `project-ipc.ts` | Tovu | 180k + 180k | T, **E** | D1b1, D3a |
| D4b folder rules to `platform/fs` | Jini + Tovu | 220k | T | D4a2 |
| D4c project list hooks to `ui/site-card` | Jini + Tovu | 200k | T, **E** | D4b |
| D5a bridge transport | Jini + Tovu | 220k | T, **E** | daemon R7-G1, R8b |
| D5b serving side, store | Jini + Tovu | 200k | T, **E**, **P** | D5a |
| D5c conversation controller | Jini + Tovu | 180k | T, **E** | D5b |
| D6a pure rules | Jini + Tovu | 120k | T, **E** | D1b2, D4c |
| D6b find bar | Jini + Tovu | 230k | T, **E** | D6a |
| D6c webview workspace | Jini + Tovu | 240k | T, **E** | D6a |
| D6d adopt tab strip | Jini + Tovu | 200k | T, **E** | D6c, OD-8 if it stops |
| D6e live views, resources panel | Jini + Tovu | 200k | T, **E** | D6d |
| D6f CSS | Jini + Tovu | 200k | T, **E**, **P** | D6e |
| **29 runs** | | **about 5.0M Sonnet** | | |

Not in the total: P0; one cloud gate run per wave (about 60k each, 11 waves); one batched Opus review per wave (about 40k each) and the Opus look at screenshots for the 17 E runs (about 30k each); the owner's or CI's packaged smokes for the 8 P runs (no token cost counted). With those: **about 6.5M tokens**. Every run is under the 250k cap; D6c (240k) and D3b (230k) have the least room: each sheet tells the run where to split and report.

## 6. File-disjointness

Each run owns the files its sheet lists. Files touched by more than one run, and how that is ordered:

| File | Runs | Resolution |
|---|---|---|
| `apps/desktop/src/main/index.ts` (1,166; in size debt) | D0a, D0c1, D0c2, D1b1, D1b2, D1c1, D1c2, D3a, D3b, D3c2, D4b | **serial**: never two of these in one wave on unmerged bases; the wave table respects it except W1 (D0a and D1c1 both edit import lines: land D0a first) |
| `apps/desktop/src/project-ipc.ts` | D0a (one import), D1b1, D3a (imports), D4a1, D4a2 | serial by wave |
| `apps/desktop/src/tovu-server.ts` | D0a, D0b, D0c2 (imports), D3a, D3c2 | serial by wave; also a size-design target: check its log |
| `apps/desktop/src/desktop-agent.ts`, `desktop-agent-service.ts` | D0a, D0b, D0c2 (imports only); daemon R7 and R8 | coordinator-serialized with the daemon programme |
| `apps/desktop/src/preload/preload.mts` | D1b2 only | |
| `apps/desktop/electron-builder.yml`, `package.json` | D0c2, D0d, D1c2 (none), D2 (none) | serial by wave; lock file is coordinator-only |
| `apps/desktop/src/renderer/app.css` | D6f only (D6b to D6e do not touch CSS) | |
| `apps/desktop/src/renderer/app/SiteWorkspace.tsx` | D6b (find wiring), D6c, D6e | D6b and D6c are parallel: D6b edits only the find-bar import and props; if it needs more, run D6b before D6c |
| `packages/desktop-host/package.json` (exports) | D0d, D1a, D1c1, D1c2, D3c1, D3d | each adds its own keys; rebase before push; never two in flight unmerged |
| `packages/sidecar/package.json`, `supervision/supervisor-node.ts`, `json-file.ts` | D3a to D3c1; xpkg R11b | R11b first for D3b onward |
| `packages/ui/package.json`, `packages/chat/package.json`, `packages/platform/package.json` | D4c, D6a to D6f; D5a, D5b; D4b | one run at a time per package |
| `development/scripts/size-debt.json` | any run that deletes a file with a key | delete own keys only |

## 7. Owner decisions

| # | Question | Recommendation | Blocks |
|---|---|---|---|
| OD-1 | Tovu's website and desktop share 8 Node modules of product code (telemetry boot, startup secrets, daemon schemas, host signals). Where do they live once relative imports are cut? | One new **Tovu** workspace package `@tovu/host-shared` (not a Jini package). Alternative: widen `@tovu/contracts` beyond types and pure rules (not recommended). | D0c1, D0c2 |
| OD-2 | Adopting the IPC kit adds a sender check to 21 site-management handlers and others that have none today, and narrows the trusted set for `runner:*`/`workspace:*` to the sites-home page (site admin pages stay trusted only for voice, files and import hand-off). Accept this hardening? | Yes. It is the point of the kit; the characterization diff shows exactly which senders become refused. | D1b1, D1b2 |
| OD-3 (xpkg) | Where Node runtime adapters live (preset vs a small adapter package) | as the xpkg index recommends | D3c1 |
| OD-4 | `createElectronDesktopHost` loses its default launcher (`sidecarLauncher` becomes required) and `createNodeSidecarLauncher` leaves `desktop-host`, so there is one spawn-ready-stop, in `sidecar` | Yes; a default would force `desktop-host` to import `sidecar` | D3c1, D3c2 |
| OD-5 | Windows orphan cleanup: today's identity proof uses `ps`; what it does on Windows was not verified. Rule proposed: identity unknown means never terminate, on every OS | Yes; D3b reports today's Windows behaviour before changing anything | D3b |
| OD-6 | If the Notes desktop cannot run its child on Electron's own Node (native module ABI, type stripping), may an example bundle a Node runtime? | Decide only if D2 stops on it | D2 (conditionally) |
| OD-7 | The desktop has 8 `await import(` sites today, including the "resolve core from the daemon's location" workaround (`desktop-agent.ts:219-221`). Remove them all (needs one deduplicated `@jini-ai/core` in the staged closure) as its own lane? | Yes, as a separate lane after D0c2, with packaged proof; not hidden inside a move | nothing here |
| OD-8 | If `ui/tab-strip` behaves differently from the desktop's strip in a user-visible way (overflow, keyboard, close), keep the desktop's behaviour as a Jini option, or accept Jini's? | Keep the desktop's behaviour as an option unless the difference is a fix | D6d (conditionally) |
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
