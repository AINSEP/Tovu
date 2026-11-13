### jini:packages/desktop-host/src/electron/updates/auto-update-controller.ts
- **Over:** `createAutoUpdateController` 116
- **Phase:** now (JINI 116) · **Batch:** size-39
- **Tests:** `src/__tests__/auto-update-controller.test.ts` (package `@jini-ai/desktop-host`). No test mocks the module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| S settings | `const clock` … `const messages` | resolve clock/timers/timing/copy from deps + options |
| L listeners | `if (isNativeUpdater(updater)) { updater.on(...` … `} else { … }` | register download/error listeners on either updater ABI |
| I install | `let installStarted = false;` + `startInstall` | hand installation to Squirrel with a fallback quit |
| C control | the remaining state, `onDownloaded`, `onError`, `otherInstances`, `heartbeat`, `check`, `tick`, `requestRestart`, returned API | update scheduling + quit policy (stays) |

- **Splits** (HELPERS in the same file, module level, directly above `createAutoUpdateController`, below `messageOf`):
  1. `function resolveUpdateSettings({ deps, options }: ResolveUpdateSettingsInput): UpdateSettings` with `interface UpdateSettings { now: () => number; timers: UpdateTimersPort; timing: UpdateTiming; messages: UpdateMessages }`. Body: the `clock`, `now`, `timers`, `timing` and `messages` statements verbatim, returning `{ now, timers, timing, messages }`. In the controller, `const { now, timers, timing, messages } = resolveUpdateSettings({ deps, options });` replaces those 5 lines. `startedAt = now()` stays right after it.
  2. `function registerUpdaterListeners({ updater, onDownloaded, onError }: RegisterUpdaterListenersInput): void`, holding unit L verbatim. Types: `updater: UpdaterLike; onDownloaded: (info: { version: string }) => void; onError: (error: unknown) => void`. The call goes at the same spot: `registerUpdaterListeners({ updater, onDownloaded, onError });`.
  3. `function createInstallHandoff({ updater, timers, timing, handles, log, messages, quit, isStopped }: CreateInstallHandoffInput): InstallHandoff` with `interface InstallHandoff { startInstall(required: { silent: boolean; relaunch: boolean }, _options?: Record<string, never>): boolean; started(): boolean }`. Body: `let installStarted = false;`, then `startInstall` verbatim with its doc comment and the "Arm before the handoff…" comment. Inside the fallback callback `if (!stopped) deps.quit();` becomes `if (!isStopped()) quit();`. Then `return { startInstall, started: () => installStarted };`. `log` takes the type of `deps.log`.
  - In the controller, delete `let installStarted = false;` and put `const install = createInstallHandoff({ updater, timers, timing, handles, log, messages, quit: () => deps.quit(), isStopped: () => stopped });` at that spot. Every read of `installStarted` (`onError`, `requestRestart`, `beforeFinalQuit` ×3) becomes `install.started()`. `startInstall(...)` becomes `install.startInstall(...)`.
- **Importers to update:** none (nothing new is exported).
- **After:** `createAutoUpdateController` about 92 lines. `createInstallHandoff` about 22, `registerUpdaterListeners` about 8, `resolveUpdateSettings` about 8. The file is about 255 counted lines.
- **Risks / notes:** `stopped` and `installStarted` are mutable `let`s. Every moved read goes through a getter (`isStopped()`, `install.started()`) evaluated at the same moment as before, so nothing is captured early. `quit` is wrapped as `() => deps.quit()` to keep the method-call form (`this`). Listener registration still runs during construction, in the same order relative to `updater.autoDownload`/`autoInstallOnAppQuit`.
