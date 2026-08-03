# Electron launch debug — Tovu-Runner on macOS (2026-08-03)

Dispatched to debug: `Tovu-Runner` (branch `rebuild/v1`) Electron app hangs forever at
`app.whenReady()` when launched from a Claude Code Bash tool context. Goal: either get a
verified visible window, or a confident evidence-backed verdict that it can't work from
this context plus the human-terminal command.

Skills loaded and followed: `AI-Dev-Shop/agents/devops/skills.md`,
`AI-Dev-Shop/skills/systematic-debugging/SKILL.md` (including the Web Escalation Gate).

## Starting facts (from dispatch, already established, not re-derived)

- `electron --version` → `v43.2.0` instantly, binary healthy.
- `electron .` / a minimal probe script both hang forever at `await app.whenReady()`.
- Zero child/helper processes ever fork. Chromium never initializes past this point.
- Bash tool's own sandbox swallows stdout entirely; `dangerouslyDisableSandbox: true` lets
  stdout through but the hang is unchanged.
- Arch match (x86_64/x86_64), macOS 13.7.5 vs `LSMinimumSystemVersion` 12.0 — fine.
- No `com.apple.quarantine` xattr (only `com.apple.provenance`).
- Bundle not corrupt: 290M, all Frameworks/Helpers present, `--version` works.
- `--no-sandbox` changed nothing.
- `codesign -dv` on Electron.app: **"code object is not signed at all"**.

## New evidence gathered this session

### 1. Session/GUI context is legitimate — ruled out headless/no-console theories

- `launchctl managername` → `Aqua`. `launchctl print gui/501` → `type = login`, active.
- Process ancestry of the Bash-tool shell traces cleanly to a real interactive session:
  `bash → claude → -bash → login → Terminal.app → launchd(1)`. This is a normal
  Terminal.app-launched shell, not SSH, not a LaunchAgent/background domain process.
- `who`/`w`: user `la` has been on `console` continuously since Jul 17 (16 days), 11
  concurrent tty sessions. Not logged out, not fast-user-switched away.
- Displays: **two displays fully online and awake** — built-in Retina "Color LCD"
  (2880x1800, Main Display) and an external "PX2710MW" (1920x1080) via HDMI/DVI adapter.
  `IODisplayWrangler` `CurrentPowerState=4` (max/fully on).
- `pmset -g assertions`: `UserIsActive=1`, and WindowServer itself logged a HID tickle
  ("Apple Internal Keyboard / Trackpad") seconds before the check — a real person is
  actively using this Mac's console right now. Screen is not locked/asleep in any way
  that would plausibly block WindowServer connections.
- **Conclusion: this is about as normal/healthy a macOS GUI session as exists. The hang
  is not explained by "no display", "screen locked", "background session", or "no GUI
  session" theories from the dispatch brief.**

### 2. LaunchServices-mediated launch (`open -n`) hangs identically to direct exec

Tested `open -n ./node_modules/electron/dist/Electron.app --args <path>` instead of
directly exec'ing the `Electron` binary (this properly registers the app with
LaunchServices/loginwindow and reparents it to `launchd`, PPID=1, unlike a direct
child-of-bash exec). **Same result: single process, `S` state, zero children, after 5+
seconds.** This rules out "direct exec vs LaunchServices-registered launch" as the
differentiator — whatever's wrong persists across both launch mechanisms.

### 3. Unified system log during the hang — no smoking gun, but confirms unsigned status

Captured `log stream --level debug` for the whole hang window, grepped for
Electron/TCC/sandbox/GPU/responsible-process keywords. Findings:
- Confirms unsigned: `[com.apple.securityd:cfloadfile] failed to fetch
  .../Contents/_CodeSignature/CodeDirectory error=-10` (repeated for every dylib/framework
  load — consistent with "not signed at all").
- Normal StoreKit/LaunchServices/AMS chatter that's boilerplate for *any* Electron app
  (all Electron apps ship with StoreKit-adjacent Info.plist keys) — not diagnostic.
- **No TCC denial, no sandbox violation, no AMFI/library-validation error, no explicit
  error of any kind logged for the Electron process.** It simply goes quiet after the
  routine LaunchServices registration — consistent with hanging inside Cocoa's
  `NSApplication` bootstrap / `-applicationDidFinishLaunching` before Electron's
  `whenReady` fires, rather than being killed or erroring.
- A cluster of PIDs (61746, 61756, 61767 …) appeared in `syspolicyd` "provenance sandbox"
  log lines at ~1/sec during the window. Investigated and ruled out as coincidental
  background-system noise (this machine has 11 concurrent user sessions, VS Code,
  Docker, Chrome, Adobe helpers all active) — see next section, confirmed via
  fine-grained polling that they are NOT Electron children.

### 4. Zero-fork finding re-verified at high resolution — not a fast crash-loop

Polled `ps -ax` every 250ms for 10s during a fresh launch. **Only ever saw the single
Electron PID** — no transient helper processes appear-and-die between samples. Also
checked `~/Library/Logs/DiagnosticReports/` and `/Library/Logs/DiagnosticReports/` for
any Electron/Tovu-Runner crash report in the test window — **none exist**. This rules out
"helper processes are forking and crash-looping too fast to see" — they genuinely never
fork at all. The hang is upstream of any helper-process spawn, i.e. inside the browser
process's own early Cocoa/AppKit bootstrap.

### 5. Ruled out: lingering App Sandbox confinement from the harness itself

Checked environment for `APP_SANDBOX_CONTAINER_ID` and any sandbox/seatbelt-related env
vars inherited from Claude Code's own process — none present. `sandbox-exec` with a
permissive profile works normally from this shell (not nested inside a nonremovable
seatbelt container). This rules out "the whole harness process tree is itself confined by
a macOS App Sandbox that `dangerouslyDisableSandbox` can't remove."

### 6. Ruled out: code signature (single-variable test, per debugging skill)

Made an isolated copy of Electron.app, ad-hoc signed it (`codesign --force --deep --sign -`),
verified the signature applied (`flags=0x2(adhoc)`, valid CodeDirectory). Relaunched via
direct exec, polled every 500ms for 8s. **Identical hang, still zero children.** Signing
alone does not fix it — the "not signed at all" finding from the dispatch brief is real
but is not (on its own) the root cause of the hang.

## Web research (Web Escalation Gate)

Per the systematic-debugging skill, searched for the exact signature before further local
guessing (three prior local attempts — sandbox toggle, `--no-sandbox`, launch mechanism —
had already failed to change the outcome).

- General Electron/`whenReady` GitHub issue search turned up nothing matching "zero
  children, indefinite hang, no error" specifically.
- A relevant discussion (ghostty-org/ghostty#12496, "GUI child processes launched from
  Ghostty have no visible window on macOS") describes the general **macOS "responsibility
  chain" / activation-policy mechanism**: WindowServer can refuse to display windows for
  GUI descendants of a parent process that itself has no `Info.plist`/`NSPrincipalClass`/
  foreground activation policy (i.e., a bare terminal/shell process, not a real `.app`).
  This is a plausible *contributing* mechanism given the whole ancestor chain up to
  Terminal.app is bare shell processes, not app bundles — but it does not fully explain why
  `open -n` (which explicitly re-parents to `launchd` and goes through proper
  LaunchServices registration, is supposed to escape a broken responsibility chain)
  produced the *identical* hang. This is the strongest lead but not fully confirmed.

## 7. Ruled out: Bash-tool process detachment (no controlling TTY)

Launched the same real app from inside a genuinely fresh, interactive Terminal.app window
(`osascript -e 'tell application "Terminal" to do script ...'`) — a process tree with a
real controlling TTY and session, as close as possible to "a human ran this themselves."
**Identical hang, zero children.** This rules out "the Bash tool's process detachment (new
session, no ctty) breaks something Chromium's bootstrap depends on" — the exact same
failure reproduces in a completely normal human-equivalent terminal session. This was the
last environmental/session-based hypothesis; all of them are now ruled out.

## ROOT CAUSE FOUND: literal top-level `await app.whenReady()` deadlocks Electron's own bootstrap

With every environmental hypothesis exhausted, re-read `src/main/main.ts` and noticed the
`await app.whenReady()` on line 40 is a **literal top-level `await`** at ES module scope
(the file has no wrapping async function; `package.json` has `"type": "module"`, and the
dispatch's own `probe.mjs` used the identical pattern: bare `import`, then `await
app.whenReady()` directly in module scope).

Added `console.error` instrumentation at every step (module top-level, before/after
`createElectronDesktopHost`, before/after `singleInstance.claim()`, immediately before
`await app.whenReady()`) and rebuilt. Confirmed via the real Terminal.app launch: every
line up to and including `DEBUG: about to await app.whenReady()` prints instantly; nothing
after it ever prints. `createElectronDesktopHost` and all its port constructors
(`electron-protocol.js`, `electron-shell.js`, `electron-window-lifecycle.js`,
`electron-render-service.js`, `sidecar.js`) were read in full — none of them touch any
Electron API eagerly at construction time, so they're not the cause.

**Decisive single-variable tests** (four minimal `.mjs`/`.js` probes, each launched from a
real Terminal.app session, only one variable changed at a time):

| Probe shape | Electron 33 | Electron 43 |
|---|---|---|
| CJS, `app.whenReady().then(...)` | **resolves** (`app ready` printed, clean exit) | **resolves** (`app ready` printed, clean exit) |
| ESM, top-level `await app.whenReady()` | **hangs** (only `module evaluated` printed) | **hangs** (matches original dispatch symptom) |

This is conclusive: **the Electron version is irrelevant.** The deadlock is caused
specifically by awaiting `app.whenReady()` at the top level of an ES module's initial
evaluation. The module's own top-level evaluation apparently can't finish until the
awaited promise settles, but something in Electron's internal ready-sequencing depends on
that same top-level evaluation finishing first — a genuine deadlock between Electron's
custom ESM main-entry loader and its app-ready lifecycle. It reproduces identically
regardless of launch mechanism (direct exec / `open -n` / real Terminal), code signature,
or sandbox state — because none of those were ever the actual cause. It also explains
"zero children ever fork": the deadlock is upstream of any GPU/renderer helper spawn.

Rewriting the same logic to avoid the literal top-level `await` (wrapping the
post-`whenReady` logic in an async IIFE, `void (async () => { await app.whenReady(); ...
})();`, invoked instead of awaited at module scope) fixes it on **both** Electron 33 and
Electron 43 — confirmed with the same CJS/ESM comparison above and with the real app (next
section).

## Fix applied and verified end-to-end

Edited `/Users/la/Programming/Tovu-Runner/src/main/main.ts`: the `else` branch (primary
instance) now wraps everything from `await app.whenReady()` onward in
`void (async () => { ... })();` instead of using a literal top-level `await`. No change to
`createElectronDesktopHost`'s assembly or any port usage — same calls, same structure,
just no longer awaited at module top level. `npm run typecheck` and `npm run build` both
pass clean.

**Verification** (real Terminal.app session, project's own pinned `electron@43.2.0`, via
`npm run start:nobuild`):

- stdout printed the app's own boot line (not debug instrumentation — this is
  `main.ts`'s real code path):
  ```
  tovu-runner ready backend=electron electron=43.2.0 window=open projects=0
  ```
  (`window=open` means `window.isDestroyed()` returned `false` — `whenReady()` resolved
  and `createWindow` completed.)
- Process tree showed genuine Chromium child processes fork for the first time in this
  entire investigation — the exact multi-process signature that was **absent in every
  prior attempt** (dozens of tests, always zero children):
  ```
   72039     1 S   .../Electron.app/Contents/MacOS/Electron
   72041 72039 S   .../Electron.app/Contents/Frameworks/Electron Helper.app/.../Electron Helper
   72042 72039 S   .../Electron.app/Contents/Frameworks/Electron Helper.app/.../Electron Helper
   72053 72039 S   .../Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/.../Electron Helper (Renderer)
  ```
  All four processes stayed alive and stable (not crash-looping) for the full observation
  window.
- `lsappinfo list` confirmed pid 72039 registered with LaunchServices as
  `type="Foreground"` (a normal, Dock-visible foreground app registration), checked in and
  alive.
- Screenshot capture of the actual window content was inconclusive (Terminal/other windows
  occluded it in every capture attempt, and `osascript`/System Events lacks Accessibility
  permission in this session to raise it or enumerate the Dock — a macOS TCC limitation of
  the verification tooling, unrelated to the app). The three independent signals above
  (the app's own log line, the real Chromium multi-process fork, and the LaunchServices
  Foreground registration) are considered sufficient verification; a screenshot would be
  the only remaining nice-to-have.

## Verdict and command

**(a) — fixed, not just diagnosed.** The hang was a real, reproducible Electron bug in
Tovu-Runner's own `main.ts` (ESM top-level `await app.whenReady()`), not a Bash-tool/macOS
session limitation. It affects a human running it in their own Terminal exactly the same
way it affected the Bash tool context — every environmental hypothesis in the original
dispatch (no WindowServer access, no controlling TTY, sandboxing, code signing, launch
mechanism) was tested and ruled out with direct evidence before the real cause was found.

Working command (same one the human should use):
```
cd /Users/la/Programming/Tovu-Runner && npm run start:nobuild
```
(or `npm start`, which rebuilds first). No Electron downgrade needed — the fix in
`main.ts` resolves it on the project's existing pinned `electron@43.2.0`.

## Addendum: TCC/microphone hypothesis raised mid-investigation — tested and refuted

After the fix above was verified, the human received (and denied) a macOS microphone
permission prompt during one of the test launches. The team lead raised a plausible
alternative theory: that Chromium's browser process blocks on a synchronous, undisplayable
TCC (mic) prompt during early bootstrap, which would explain the same symptom profile
(alive, zero children, no crash, no error). Tested directly rather than reasoned about:

- **Grepped the already-captured full-debug unified log from the ORIGINAL hang** (the
  section 3 capture above, `electron@43.2.0`, pre-fix, real Tovu-Runner app) for all TCC
  activity. Found real, synchronous `TCCAccessRequest()` IPC calls — but for
  `kTCCServiceListenEvent` (Input Monitoring) and `kTCCServiceAccessibility`, not
  microphone. Each one traced end-to-end via its `msgID`: request sent, `tccd` processes
  it (walking the responsibility chain to Terminal.app, since the unsigned Electron binary
  has `identifier=<ID of InvalidCode>` and `SecTaskCopySigningIdentifier()` fails — a
  direct, concrete instance of the "responsibility chain" mechanism the Ghostty GitHub
  issue described in section 2's web research), and a `REPLY` (denied, `authValue=0`)
  comes back **within 12–18ms**. The hang itself continued for many more seconds
  afterward. **No `kTCCServiceMicrophone` entry appears anywhere in this capture.**
- **Captured a second full TCC-filtered log during a clean, successful, post-fix launch**
  of the real app (window opens, helpers fork, boot line prints). Same story: real TCC
  checks for `Accessibility`, `ListenEvent`, `PostEvent`, `AppleEvents`, `ScreenCapture` —
  all Electron/Chromium's routine macOS integration checks (global shortcuts, window
  management, screen-capture API availability) — **zero `kTCCServiceMicrophone` requests**
  on an ordinary, un-interacted-with launch.
- **Direct one-variable refutation test** (the team lead's own suggested test #3): reran
  the still-broken ESM-top-level-await probe under Electron 43 with audio fully disabled
  (`--disable-features=AudioServiceOutOfProcess --mute-audio --disable-audio-input`).
  **Hang was identical** — only `module evaluated` printed, same as every other
  top-level-await run. If a TCC/audio gate were the blocking mechanism, removing audio
  entirely should have unblocked it; it didn't.
- Read `src/renderer/index.html` in full: it is a **static placeholder page with no
  JavaScript at all** — no `getUserMedia`, no WebAudio, no `<audio>`/`<video>` elements.
  There is currently no code path in Runner that could request microphone access.

**Verdict: refuted.** TCC is real and does fire synchronously at Electron startup on this
unsigned binary (worth knowing generally), but it resolves in milliseconds and is not
what caused the hang; the hang is fully and independently explained by the top-level-await
deadlock already fixed and verified in the previous section.

**On the "early/undeclared mic request" question** (the thing worth naming as a bug
independent of the hang, per the correction in MSG #2): across the two full-detail TCC
captures taken, no microphone request occurred on a plain launch, and the renderer has no
code that could trigger one. I can't rule out with certainty that one of the ~15–20 other,
non-instrumented launches during this session triggered a real mic prompt some other way
(e.g. Chromium's audio service doing routine CoreAudio device enumeration for hotplug
detection, which is a documented Chromium/macOS interaction independent of any
`getUserMedia` call) — I didn't happen to have TCC logging running during that specific
moment. But there is no evidence of it, and no current code path that would cause it. Not
a live bug to fix right now. Ship-time note for whenever voice commands land: Runner's
Info.plist currently carries Electron's stock placeholder strings (e.g.
`NSMicrophoneUsageDescription = "This app needs access to the microphone"`) — replace
with a truthful, Runner-specific description before packaging, and request the permission
at first actual use (when the user engages voice input), not at launch.

## Note on the debugging process

The "single-variable" discipline is what surfaced this: the Electron-version swap test
(33 vs 43) briefly looked like the answer (a trivial CJS probe resolved fine on both, and
I initially — incorrectly — treated a *different-shaped* trivial probe as the same
comparison for the real app). Re-running the real app under the "known-good" Electron 33
binary and getting the *same* hang was the signal that the version wasn't actually the
variable that mattered; that discrepancy is what led to noticing the real app and the
original dispatch's own probe shared the same top-level-await ESM shape, which the
CJS-vs-ESM/`.then()`-vs-`await` four-way comparison then confirmed directly.
