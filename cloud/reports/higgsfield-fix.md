# higgsfield-fix

Recorded November 7, 2026, 6:44:04 PM Pacific, before the 7:22:50 p.m. Pacific cap. Work began at 6:22:50 p.m. Pacific. Only `cloud/higgsfield-fix` was pushed in either repository. No publish, tags, deployments, secrets, or real sign-ins.

## Branches and pushed commits

Both branches were created from the exact approved remote bases after fetching them. Existing checkouts initially tracked only main, so the cloud/combine remote-tracking refs had to be fetched explicitly.

| Repository / branch | SHA | Change |
|---|---|---|
| Tovu base `origin/cloud/combine` | `b45d2ee759009b08d04268ef9ddcf2b6d0f60671` | Approved base |
| Tovu `cloud/higgsfield-fix` | `eceacef61a8e6122bde393850d49ac1c7479b4ca` | Agent-plugin card path |
| Tovu `cloud/higgsfield-fix` | `70a9a77bf04ec2bb8a8fea93770640efce4f3e82` | Hosted API-connection card path |
| Tovu `cloud/higgsfield-fix` | `2aa3d4ebbec17389d2a48b47c33822e571922168` | Refused admin link errors |
| Tovu code tip `cloud/higgsfield-fix` | `5a3eb14246fc201081ded7d3b7a67b0df29c89a3` | Desktop handoff and shared MCP predicate |
| Jini base `origin/cloud/combine` | `32e9c9c2128805b20d1a562d6f0053d1c4604b52` | Approved base |
| Jini `cloud/higgsfield-fix` | `76a9e9f78068c7fd7bc1c7781848aa64b2dbbb76` | Outcome link errors and bridge contract test |

Every code fix was committed with explicit paths and pushed separately; each push succeeded. Tovu used the owner's branch-specific `--no-verify` authorization; Jini used normal commit/push commands. Before each push, pull/rebase used `origin cloud/higgsfield-fix`, or the approved base before the remote fix branch existed. Autostash preserved pending fixes during the first three Tovu pulls. This report is committed separately after the code tip; its containing commit and final remote tip are reported in the final response.

## Final change and trims

Hosted chat cards emit only the host hop pathname. Their OAuth redirect URIs remain absolute. Refused admin links throw the approved error, and cancellable outcome cards display refused replies and rejected requests through the existing failure display, with retry and Skip still usable. No production `useMcpUiHost` change.

Before changing the predicate module, caller search found one production caller of `isHostedSignInLinkPath`: `apps/website/src/features/agent-plugins/admin-surfaces/issued-sign-ins.ts:36`, which admits HTTP only for the API-connection handoff path. Its other existing use is the API-connection browser-binding unit test. The existing predicate is unchanged. New `isHostedMcpSignInLinkPath` is beside it, takes required/optional objects, and owns the MCP hop regex. Desktop uses both predicates.

The desktop popup shares `contents.session`, has sandbox/context isolation enabled, disables Node integration, and has no preload. HTTP(S) provider navigation stays inside it; other navigation/redirect schemes are prevented. Popup requests reuse the current guest popup policy. No `did-navigate` handler or `callbackPath` constant was added; the real callback HTML closes the window itself. Standalone-window wiring and native desktop API-connection URL forms are unchanged.

## Production line counts against the approved bases

| Repo / file | Added | Removed |
|---|---:|---:|
| Tovu `apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx` | +2 | -2 |
| Tovu `apps/desktop/src/main/index.ts` | +12 | -2 |
| Tovu `apps/website/src/contracts/core/hosted-sign-in-links.ts` | +4 | -0 |
| Tovu `apps/website/src/features/agent-plugins/connect-tool.ts` | +1 | -1 |
| Tovu `apps/website/src/features/api-connections/connect.ts` | +1 | -1 |
| Jini `packages/ui/src/features/mcp-ui/surfaces/outcome.ts` | +3 | -1 |

Total: **+23 / -7**, net +16, six files including the required shared predicate. No other production changes.

## Test line counts against the approved bases

| Repo / file | Added | Removed |
|---|---:|---:|
| Tovu `apps/admin/src/components/AssistantDock/__tests__/AssistantDock.hooks.unit.test.tsx` | +14 | -9 |
| Tovu `apps/desktop/src/window-navigation-policy.test.ts` | +100 | -0 |
| Tovu `apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.unit.test.ts` | +9 | -7 |
| Tovu `apps/website/src/features/api-connections/__tests__/connect.unit.test.ts` | +12 | -2 |
| Jini `packages/ui/src/features/mcp-ui/__tests__/surfaces/outcome.test.ts` | +26 | -1 |
| Jini `packages/ui/src/react/mcp-ui/__tests__/useMcpUiHost.test.tsx` | +23 | -0 |

Total: **+184 / -19**, net +165. No test files outside the six approved files were executed. A detached approved-base worktree was used only to compare the same admin test file and desktop no-emit results. No full suite or watch mode ran.

## Red / mutation / green commands and records

Commands below are exact; log redirections are omitted from these test invocations. All new behavior tests ran red before their production changes. Passing contract guards were also mutated. Every mutation was restored.

### Agent-plugin card

From `/workspace/Tovu`, red and the final isolated mutation used:

```sh
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=2 --experimental-test-module-mocks apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.unit.test.ts
```

Baseline: 54 passed before adapting the fixture. Red (`plugin-red.log`): 53 passed / 1 failed, `AssertionError [ERR_ASSERTION]: the card contains the hosted path`. The fixture now models the hosted hop instead of incorrectly returning a provider URL, unsets `TOVU_PUBLIC_URL`, checks the HTTP-derived absolute callback URI, and checks that the listener origin is absent from the card.

Mutation: temporarily restore `return start.authorizationUrl;`. Final valid isolated proof (`plugin-mutation-revert-2.log`): 53 passed / 1 failed on that same assertion. An earlier isolated attempt stopped on missing `otplib` after dependency output was refreshed; that setup failure is not counted as mutation evidence.

Green: 54 passed as part of the final combined 69-pass command below (`server-final-green-2.log`).

### Hosted API-connection card

From `/workspace/Tovu`, red and isolated mutation used:

```sh
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=2 --experimental-test-module-mocks apps/website/src/features/api-connections/__tests__/connect.unit.test.ts
```

Baseline: 14 passed. Red (`server-pre-red.log`, combined invocation): the new case failed because the emitted value included `http://127.0.0.1:<port>`; the plugin file still passed its 54 original cases. Isolated mutation (`api-mutation-revert.log`): temporarily restore `signInUrl: start.authorizationUrl`, yielding 14 passed / 1 failed with the same relative-path assertion. Existing desktop-provider completion cases remained passing. Test-only hosted browser steps now resolve relative paths against the harness site origin.

Final combined green, from `/workspace/Tovu`:

```sh
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=2 --experimental-test-module-mocks apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.unit.test.ts apps/website/src/features/api-connections/__tests__/connect.unit.test.ts
```

Exit 0: **69 passed** (54 plugin / 15 API). Before that final proof, an additional `.origin` mutant was also detected: 63 passed / 6 failed (`server-mutation-origin.log`). That early mutant also converted the native desktop card's provider URL; its existing tests rejected it with `ERR_INVALID_URL`. Native production code was restored, and the final diff changes only `connectHosted`.

### Admin link host

From `/workspace/Tovu/apps/admin`, baseline, red, three mutations, and initial green used:

```sh
/workspace/Jini/node_modules/.bin/vitest run src/components/AssistantDock/__tests__/AssistantDock.hooks.unit.test.tsx --maxWorkers=2 --minWorkers=1 -t openMcpUiLink
```

Baseline after equivalent call-count/call-argument matcher syntax: 9 passed / 30 unmatched. Red (`admin-red.log`): 7 failed / 3 passed / 30 unmatched, because the refusal guards returned instead of throwing. Relative hop payloads already opened against the admin origin, and absolute HTTP stayed refused.

| Temporary mutation | Detected result |
|---|---|
| Malformed-URL throw changed back to return | 2 failed / 8 passed |
| Protocol guard throw changed back to return | 5 failed / 5 passed |
| Relative link base changed to `https://wrong.example` | 2 failed / 8 passed |

All unmatched cases were selected out by test name, not disabled. Restored green (`admin-green.log`): **10 passed**, 30 unmatched. Final focused verification with an isolated Vitest 3 runner, from the same directory:

```sh
/workspace/work/higgsfield/vitest3/node_modules/.bin/vitest run src/components/AssistantDock/__tests__/AssistantDock.hooks.unit.test.tsx --maxWorkers=2 --minWorkers=1 -t openMcpUiLink
```

Exit 0: **10 passed**, 30 unmatched (`admin-final-focused-v3.log`). Full-file verification and its approved-base comparison are recorded under remaining errors below.

### Jini outcome and real bridge guard

From `/workspace/Jini/packages/ui`, baseline, red, initial green, and final restored green used:

```sh
../../node_modules/.bin/vitest run src/features/mcp-ui/__tests__/surfaces/outcome.test.ts src/react/mcp-ui/__tests__/useMcpUiHost.test.tsx --maxWorkers=2 --minWorkers=1
```

Baseline: 39 passed. Red: 2 failed / 40 passed; both refused `{ isError: true }` and rejected requests stayed `partial` instead of displaying `failed`. The real AppBridge guard passed already. Final green: **42 passed** (21 outcome / 21 hook). Both error cases assert immediate failure, another open request on retry, and the pending wait resolving through Skip.

Mutation commands from the same directory:

```sh
../../node_modules/.bin/vitest run src/features/mcp-ui/__tests__/surfaces/outcome.test.ts --maxWorkers=2 --minWorkers=1 -t 'cancellable outcome open-link failures'
../../node_modules/.bin/vitest run src/react/mcp-ui/__tests__/useMcpUiHost.test.tsx --maxWorkers=2 --minWorkers=1 -t 'relays a throwing open handler'
```

| Temporary mutation | Detected result |
|---|---|
| Replace `if (result && result.isError)` with `if (false)` | Refused-reply case fails; rejection case passes |
| Replace `.catch(reportCallFailure)` with an empty catch handler | Both failure cases fail |
| Swallow the existing hook's thrown open-handler error | Real bridge returns success instead of expected JSON-RPC error `-32603`; guard fails |

No production hook diff remains. Exact scratch logs: `/workspace/work/higgsfield-ui-{red,mutation-refused,mutation-catch,mutation-host,final-green}.log`.

### Desktop registered handoff

From `/workspace/Tovu/apps/desktop`, baseline, red, all nine mutations, and green used:

```sh
node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=2 src/window-navigation-policy.test.ts
```

Baseline: 26 passed. Red after the initial test fixture syntax/invalid-URL stand-ins were corrected (`desktop-red-final.log`): 27 passed / 2 failed; both approved paths created zero in-app windows instead of one. A further passing guard for a same-origin but unsupervised guest was then added. Final green (`desktop-green.log`): **30 passed**.

| Temporary mutation | Failed cases |
|---|---:|
| Replace shared session with a fresh object | 2 |
| Disable popup sandbox preference | 2 |
| Remove supervised-site admission check | 1 |
| Remove exact-origin admission check | 1 |
| Remove sign-in-path admission check | 1 |
| Remove non-HTTP(S) navigation prevention | 2 |
| Remove non-HTTP(S) redirect prevention | 2 |
| Remove popup-policy installation | 2 |
| Remove the existing callback page's script close | 2 |

The tests execute the real extracted registrar against fake Electron objects and the real callback script. Native Electron's closure admission was also verified separately below.

## No-emit checks

All commands ran against the final source state; no source changes were made to fix unrelated errors.

| Directory | Exact command | Final result |
|---|---|---|
| `/workspace/Tovu` | `./node_modules/.bin/tsc -p tsconfig.json --noEmit` | Exit 0 |
| `/workspace/Tovu/apps/admin` | `./node_modules/.bin/tsc --noEmit` | Exit 0 |
| `/workspace/Tovu/apps/desktop` | `./node_modules/.bin/tsc -p tsconfig.preload.json --noEmit` | Exit 0 |
| same | `./node_modules/.bin/tsc -p tsconfig.renderer.json --noEmit` | Exit 0 |
| same | `./node_modules/.bin/tsc -p tsconfig.main.json --noEmit` | Exit 2, four baseline `TS2531` errors |
| same | `./node_modules/.bin/tsc -p tsconfig.live-verify.json --noEmit` | Exit 0 |
| `/workspace/Jini` | `node_modules/.bin/tsc -p packages/ui/tsconfig.json --noEmit` | Exit 0 |

Desktop main's remaining errors are all `TS2531: Object is possibly 'null'` in unchanged `apps/desktop/src/site-archive-import.test.ts` at 55:20, 170:16, 188:16, and 205:16. Approved-base comparison, from `/workspace/Tovu`:

```sh
./node_modules/.bin/tsc -p /workspace/work/higgsfield/tovu-baseline/apps/desktop/tsconfig.main.json --noEmit
```

Exit 2 with exactly the same four errors (`typecheck-desktop-main-baseline.log`). They are outside the approved change and were left untouched.

## Full changed admin file and remaining limitations

From `/workspace/Tovu/apps/admin`:

```sh
/workspace/work/higgsfield/vitest3/node_modules/.bin/vitest run src/components/AssistantDock/__tests__/AssistantDock.hooks.unit.test.tsx --maxWorkers=2 --minWorkers=1
```

Exit 1: 39 passed / 1 failed. The unchanged failure is `useComposerCapabilities > polls only while open and visible, including unfocused windows, and cleans up timers/listeners`, line 69: `AssertionError: expected 1 to be +0` for `vi.getTimerCount()`.

The exact same command from `/workspace/work/higgsfield/tovu-baseline/apps/admin` at approved base `b45d2ee75` gives 38 passed / 1 failed with the same line, name, and assertion. This is a baseline failure; no unrelated timer or assertion changes were made.

The unchanged Jini `outcome-cancellation.test.ts` shared fixture returns void from `openLink`, unlike the real Promise-returning bridge. It was neither adapted nor executed because it is outside the six approved test files. This mock mismatch is retained as a limitation; no shared-helper change was added.

Native smoke covers the registrar handoff, real Electron windows/navigation, cookies, and actual callback HTML against local mock servers. Full application startup, a real webview DOM, a real provider exchange, and OS sandbox enforcement are outside this smoke. No real sign-in was performed.

## Setup errors by name and handling

The environment initially linked Tovu's `@jini-ai/*` dependencies to sibling Jini source trees with stale generated `dist` output. Local dependency output was rebuilt without tracked source/manifest/lockfile changes. The final website/admin/UI checks are green after that refresh.

- `CACError: Unknown option --minWorkers`: installed Tovu Vitest 4 removed that option. Existing Vitest 2 was used with both requested worker flags for the behavior/mutation runs; isolated Vitest 3.2.4 supports both flags and existing full-file matchers. Vitest 2's full-file `Invalid Chai property: toHaveBeenCalledExactlyOnceWith` was a runner mismatch, removed from final full-file verification by Vitest 3.
- `ERR_PNPM_UNSUPPORTED_ENGINE`: installed pnpm 11.25.0 conflicts with the repo's <11 constraint. Local test/compiler binaries were invoked directly.
- `ERR_MODULE_NOT_FOUND`: stale UI `sign-in-card.js`; isolated Vitest 3 initially lacked jsdom; refreshed user-management output lacked declared `otplib` and SimpleWebAuthn dependencies. Generated output was refreshed, jsdom reused from the existing admin installation, and the declared auth dependencies installed in scratch and linked into ignored node_modules. The setup failure in the first repeated plugin mutation was not counted as mutation proof.
- Runtime missing-export `SyntaxError` for `createSignInHandoffs`, `onTeardown`, `createVersionedPluginActivationReader`, `readBootIdentity`, and `TypeError: createConditionalHistoryRead is not a function`: resolved by refreshing local dependency output.
- Initial no-emit/build errors on stale declarations included `TS2305`, `TS2307`, `TS2353`, `TS7031`, `TS2554`, `TS2344`, `TS18046`, `TS2339`, `TS2724`, `TS2345`, `TS2694`, `TS7006`, `TS2741`, `TS2322`, `TS2561`, `TS7053`, `TS2739`, `TS18048`, and `TS2459`. These setup errors were resolved for the touched packages except the separately proven baseline `TS2531` cases.
- New test-fixture `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` (parameter property under Node's strip-only mode) and fake predicate `ERR_INVALID_URL` were corrected before collecting the valid desktop red result.
- Electron direct Ozone headless probes exited 139 (`Segmentation fault`); apt had no xvfb package index. A Debian xvfb package was extracted under scratch without system changes, enabling the native displayless checks. Details and nonfatal environment errors follow.

No inline lint disables, added Jini-to-Jini imports, production hook changes, tickets, new options, cookie-policy changes, wider HTTP admission, settings changes, or unrelated source fixes. `git diff --check` passed in both repositories. Tovu's referenced `AI-Dev-Shop/AGENTS.md` is absent even at its approved base; the sibling Jini copy was read. Jini's pre-existing untracked `packages/plugin-ui-ux-design/` was left untouched.

## Native Electron evidence

Completed 2026-11-08 02:37:23 UTC. Scratch only; no tracked edits/commits.
Script: `/workspace/work/higgsfield/electron-sign-in-smoke.cjs`.
Electron 43.2.0; Xvfb from local extracted executable.

## What ran

The smoke extracts and evaluates the real `registerGuestNavigationPolicy` function from current Tovu `apps/desktop/src/main/index.ts`; imports the real `installWebviewGuestPolicy`, Tovu navigation-policy adapters, hosted sign-in predicates, and `renderOAuthCallbackPage` TypeScript sources. A fake app emitter and webview EventEmitter call the registered handoff; BrowserWindow construction and all browser navigation/script execution use native Electron. The real application startup/actual webview DOM are outside this narrow smoke.

Two local HTTP servers simulate site and separate-origin provider; no real sign-ins or credentials. For each approved route:

- `/api/admin/v1/workspaces/ws-1/mcp-servers/widget/oauth/sign-in`
- `/api/admin/v1/workspaces/ws-1/agent-plugins/connections/sign-in/` plus 43 `a` characters

The site hop sets a mock HttpOnly binding cookie and redirects to the provider origin, which redirects to that flow's callback. The callback marks exchange complete, serves the actual success HTML from `renderOAuthCallbackPage`, and tracks HTTP response completion.

Assertions passed for both native windows: exact guest session identity; sandbox and contextIsolation true; nodeIntegration false; no preload; provider reached; callback receives binding cookie; server exchange and response finished before close; callback's real script closes native window; no shell.openExternal handoff; no did-navigate handler in registrar.

## Exact commands and results

All commands executed from `/workspace/Tovu`.
Initial green, exit 0, log `/workspace/work/higgsfield/native-sign-in-green.log`:
```sh
/workspace/work/higgsfield/xvfb/usr/bin/Xvfb :99 -screen 0 1280x720x24 -nolisten tcp > /workspace/work/higgsfield/xvfb-sign-in.log 2>&1 &
xvfb_pid=$!
trap 'kill "$xvfb_pid" 2>/dev/null; wait "$xvfb_pid" 2>/dev/null' EXIT
for attempt in 1 2 3 4 5; do test -S /tmp/.X11-unix/X99 && break; sleep 0.2; done
DISPLAY=:99 XDG_CACHE_HOME=/workspace/work/higgsfield/xdg-cache XDG_CONFIG_HOME=/workspace/work/higgsfield/xdg-config timeout --kill-after=3s 20s /workspace/Jini/node_modules/.pnpm/electron@43.2.0/node_modules/electron/dist/electron --no-sandbox --disable-gpu /workspace/work/higgsfield/electron-sign-in-smoke.cjs > /workspace/work/higgsfield/native-sign-in-green.log 2>&1
result=$?
tail -35 /workspace/work/higgsfield/native-sign-in-green.log
exit "$result"
```

Mutation, exit 1, expected `CALLBACK_SCRIPT_CLOSE_TIMEOUT_mcp`. Only mock callback response HTML substitutes `void 0;` for `window.close();`; production source unchanged. Proves native closure depends on callback script instead of main-process auto-close.
```sh
/workspace/work/higgsfield/xvfb/usr/bin/Xvfb :99 -screen 0 1280x720x24 -nolisten tcp > /workspace/work/higgsfield/xvfb-sign-in-mutation.log 2>&1 &
xvfb_pid=$!
trap 'kill "$xvfb_pid" 2>/dev/null; wait "$xvfb_pid" 2>/dev/null' EXIT
for attempt in 1 2 3 4 5; do test -S /tmp/.X11-unix/X99 && break; sleep 0.2; done
DISPLAY=:99 XDG_CACHE_HOME=/workspace/work/higgsfield/xdg-cache XDG_CONFIG_HOME=/workspace/work/higgsfield/xdg-config HIGGSFIELD_SMOKE_NO_CLOSE=1 timeout --kill-after=3s 20s /workspace/Jini/node_modules/.pnpm/electron@43.2.0/node_modules/electron/dist/electron --no-sandbox --disable-gpu /workspace/work/higgsfield/electron-sign-in-smoke.cjs > /workspace/work/higgsfield/native-sign-in-mutation.log 2>&1
result=$?
tail -12 /workspace/work/higgsfield/native-sign-in-mutation.log
exit "$result"
```

Final restored green, exit 0, log `/workspace/work/higgsfield/native-sign-in-final-green.log`:
```sh
/workspace/work/higgsfield/xvfb/usr/bin/Xvfb :99 -screen 0 1280x720x24 -nolisten tcp > /workspace/work/higgsfield/xvfb-sign-in-final.log 2>&1 &
xvfb_pid=$!
trap 'kill "$xvfb_pid" 2>/dev/null; wait "$xvfb_pid" 2>/dev/null' EXIT
for attempt in 1 2 3 4 5; do test -S /tmp/.X11-unix/X99 && break; sleep 0.2; done
DISPLAY=:99 XDG_CACHE_HOME=/workspace/work/higgsfield/xdg-cache XDG_CONFIG_HOME=/workspace/work/higgsfield/xdg-config timeout --kill-after=3s 20s /workspace/Jini/node_modules/.pnpm/electron@43.2.0/node_modules/electron/dist/electron --no-sandbox --disable-gpu /workspace/work/higgsfield/electron-sign-in-smoke.cjs > /workspace/work/higgsfield/native-sign-in-final-green.log 2>&1
result=$?
tail -13 /workspace/work/higgsfield/native-sign-in-final-green.log
exit "$result"
```

Both green runs printed:
```
NATIVE_SIGN_IN_OK mcp: real registrar, shared session, isolated popup, provider redirect, binding cookie, exchange finished, real callback script closed window
NATIVE_SIGN_IN_OK hosted: real registrar, shared session, isolated popup, provider redirect, binding cookie, exchange finished, real callback script closed window
NATIVE_SIGN_IN_SMOKE_OK
```

## Environment limitations / named errors

Direct Electron --headless was previously observed by coordinator to crash exit139. Xvfb enables this displayless native smoke. `--no-sandbox` is required by container execution and disables Chromium's OS sandbox globally; the test verifies each popup's configured Electron `sandbox: true` preference, not OS sandbox enforcement. No real OAuth server exchange/real provider sign-in performed.

Nonfatal environment log errors: D-Bus system socket missing; D-Bus server-address parse/NameHasOwner errors; renderer OOM score adjustment Read-only file system (30). Node reports ExperimentalWarning for stripTypeScriptTypes. These did not block assertions.

Finite 15s overall/4s per-close deadlines and 20s external timeout; cleanup destroys remaining windows, closes both local servers/connections, exits app, and kills/waits Xvfb. Process inspection at 02:37:23 UTC found no live Electron/Xvfb process. PID1 retains defunct (`Z`) Electron zygote records, including pre-existing probes and pairs from these three runs; they are exited, not running, and cannot be reaped by a non-parent process. No server/test process remains running.

## Completion

All authorized functional changes are implemented and pushed; the report records the baseline check failures and the unmodified fixture limitation. No test, native browser, local mock server, or virtual display process is left running. Exited Electron zombie records owned by PID 1 are not running processes.

HIGGSFIELD-FIX DONE
