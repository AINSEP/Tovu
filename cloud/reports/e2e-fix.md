# E2E-FIX report

Base: `cloud/combine` in both repos (Tovu `ee9c64f4`, Jini `a184586d`). Work branch: `cloud/e2e-fix` in Tovu, one commit per fix, explicit paths. Jini was not changed. Only the end-to-end harness was changed. No product code was touched.

Raw outputs are in `cloud/reports/raw/e2e-fix/<step>.txt`.

## Setup

- **Node:** v24.22.2 from the nodejs.org tarball, installed in `~/.local/node24`.
- **Jini:** `pnpm install` then `pnpm --no-bail -r build`. Both exited 0.
- **Tovu:**
  1. `npm ci`
  2. `npm run build -w @tovu/sdk`
  3. `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini`. The default path `/root/Programming/Jini` does not exist here.
- **Separate installs:** `apps/admin` and `apps/site-chat` each have their own install (`npm run setup` does them). Without them the journey web server fails with `Cannot find module …/apps/admin/node_modules/vite/bin/vite.js`. I ran `npm --prefix apps/admin ci` and `npm --prefix apps/site-chat ci`, then `link:jini` again.
- **Chromium:** `npx playwright install chromium` is blocked by the network policy: 403 for `cdn.playwright.dev`. Tovu's Playwright 1.61.1 expects browser build 1228. The container has build 1243 pre-installed in `/opt/pw-browsers`. I symlinked it as `chromium-1228` and `chromium_headless_shell-1228` in a scratch `PLAYWRIGHT_BROWSERS_PATH`, without changing the repo. The actual browser is Chrome for Testing 153.0.8010.12, so screenshot baselines may differ from a 1228 run.
- **Temp files:** all runs used a scratch `TMPDIR`, so every isolated site landed in one throwaway place. At most 1 browser worker ran: the config pins `workers: 1`.
- **Not run:** `e2e:journeys:real`, `@live`, assistant-live and live-publish. No credentials were used.

## What changed and why

| # | Commit | File(s) | Root cause | Fix |
|---|--------|---------|------------|-----|
| 1 | `72876b4a` | new `development/e2e/support/admin-panels-literal.ts`, `journeys/smoke.journey.ts`, `journeys/admin-visual.pins.journey.ts` | Commit `3b8c3a13` made `ADMIN_PANELS = PANELS.map(panel => ({ ...panel, render: <Suspense>… }))`. Both TS-parser manifest readers required `ADMIN_PANELS` to be an array literal. They threw at load, and Playwright collected 0 tests. | A shared reader follows exactly one `.map` hop to the literal `PANELS`, and only when the callback spreads its parameter first and overrides neither `id` nor `nav`. Any other shape still throws, so coverage cannot shrink silently. |
| 2 | `07fbfa73` | `development/e2e/support/resettable-pin-api.ts` | Cold daemon registration (`b389d729`): `startAssistantDaemon` registers the supervisor and spawns only on demand. The warm pin API's snapshot/reset waited 60 s for a daemon registry record that nothing had demanded, then failed with "owned pin daemon never became ready". The fixture saw this after about 65 s. | Read the live registry record once. If a daemon is live, it still asserts the daemon is this site's owned daemon (same port check), then pauses it. If none is live there is nothing to pause. It now **also** fails the reset if a daemon became live during an unpaused copy. That check is new: the old code could not hit that case. Timeouts are unchanged and no assertion was removed. |
| 3 | `56be0d9f` | `journeys/admin-visual.pins.journey.ts` | This drift was hidden behind #1. After #1, collection still threw `Nonliteral SECURITY_TAB_IDS.id in security/Security.tsx`, because `SECURITY_TAB_IDS` is now `[ACCESS_TOKENS_TAB, "site-key"]`. | `tabValues` resolves an identifier only to a `const X = "literal"` in the same file. Anything else still throws. |

## Collection count

| | Command | Result |
|---|---------|--------|
| Before (base `ee9c64f4`, in a temporary worktree) | `playwright test --config=development/playwright.journeys.config.ts --list` | **Total: 0 tests in 0 files** (`list-before.txt`) |
| After (`56be0d9f`) | same | **Total: 932 tests in 35 files** (`list-after.txt`), exit 0 |

The full set is collected. There are 39 `*.journey.ts` files. The 4 that are not listed are the ones whose tests are all tagged `@live` or `@real-service`, which the config's `grepInvert` drops by design:

- `assistant-chat.pins`
- `assistant-live.pins`
- `credential-card-safety.pins`
- `deployment-live.pins`

## Warm pin sample

I ran `--project=chromium --workers=1` on 4 warm pin files (`warm-sample.txt`). None of the selected tests is tagged `@isolated-site`, so each file boots through the resettable pin API, takes a baseline snapshot, and resets before every test.

Result: **1 passed, 10 failed, 1 did not run (serial skip), 12.5 min.**

All 4 files got past fixture setup:

- The pin log has no `snapshot failed`, `reset failed`, `never became ready` or `became live during` line.
- Every failure below is thrown from inside a test body, with the line shown.
- `admin-phone-layout.pins` ran 2 tests on one pin site, and `media.pins` ran 7, so per-test resets succeeded repeatedly.

| File | Tests | Outcome |
|------|-------|---------|
| `admin-phone-layout.pins.journey.ts` | 2 | 1 ✓ (`site-key fingerprint stays inside its card on a phone`), 1 ✘ |
| `agent-page.pins.journey.ts` | 2 | 1 ✘ (in `beforeEach`), 1 did not run (serial) |
| `media.pins.journey.ts` | 7 | 7 ✘ |
| `users.pins.journey.ts` | 1 | 1 ✘ |

## Failures found, listed, not fixed

Each test now reaches its own steps or assertions and fails there. I have **not** diagnosed which ones are product bugs and which are stale tests. Some first errors point at test drift: selectors or login flow that no longer match the UI. Each name is given with its first error line.

1. **admin-phone-layout.pins.journey.ts:31 › post formatting controls stay visible and keyboard-reachable on a phone**
   - First error: `Error: page.waitForResponse: Test timeout of 90000ms exceeded.` (line 33: the awaited post-create response never arrived).
2. **agent-page.pins.journey.ts:109 › Bug pin: agent-page-control-live-verification › LEVEL 1: DOM page-driver mechanics work against the real rendered SPA…**
   - First error: `Error: github-pages: explicit host activation` / `expect(received).toBe(expected)`, Expected `true`, Received `false`.
   - This is in `beforeEach` (line 18): `PATCH …/agent-plugins/github-pages {enabled:true}` returned non-OK.
   - LEVEL 2 (line 169) did not run.
3. **media.pins.journey.ts:48 › Bug pin: media-picker-cancel › Media's Order by label and dropdown share a row with visible spacing**
   - First error: `Error: expect(locator).toBeVisible() failed`
   - Cause: `strict mode violation: locator('.media-order-control') resolved to 2 elements`. The grid-size control now shares that class.
4. **media.pins.journey.ts:130 › Bug pin: media-picker-cancel › Media Picker — Cancel button reachability › Cancel stays fully inside the viewport…**
   - First error: `Error: expect(page).toHaveURL(expected) failed` (line 76, `openFreshPost` expects `/admin/posts/<id>`).
5. **media.pins.journey.ts:196 › Bug pin: media-picker-cancel › Media lightbox enters modal focus, routes real arrow keys, and restores focus on Escape**
   - First error: `Error: expect(locator).toHaveText(expected) failed`. `.media-lightbox-counter` did not read `2 / 2` (line 242).
6. **media.pins.journey.ts:309 › Bug pin: media-providers-credentials › the tab renders the engine's vendor roster, not @jini-ai/ui's curated sample**
   - First error: `Error: page.fill: Test timeout of 90000ms exceeded.`
   - Line 288: `.login-card` appears, but `.login-card label:has-text("Password") input` is never found.
7. **media.pins.journey.ts:326 › Bug pin: media-providers-credentials › a typed key survives a full page reload as a masked marker…**
   - First error: same as #6 (`page.fill` timeout on the login card's Password input, line 288).
8. **media.pins.journey.ts:349 › Bug pin: media-providers-credentials › the stored key is never delivered to the browser — the field stays empty**
   - First error: same as #6.
9. **media.pins.journey.ts:366 › Bug pin: media-providers-credentials › Clear removes the credential server-side, so a reload does not bring it back**
   - First error: same as #6.
10. **users.pins.journey.ts:90 › Bug pin: users-reset-password › mismatch blocks submit, each toggle reveals only its own field…**
    - First error: `Error: locator.click: Test timeout of 90000ms exceeded.`
    - Line 142: no `Show password` button inside the New password field's `.field` wrapper.

## Other harness findings, listed, not fixed

- **The eager-daemon assumption also exists outside fixture setup.**
  - `waitForAgentDaemon()` (`development/e2e/support/bug-pin-daemon.ts`, and its twin `development/e2e/daemon-ready.ts`) only polls a TCP connect on the daemon port. It never demands a start.
  - With cold registration, nothing listens until a product path demands the daemon, so a caller that has not triggered demand waits the full 120 s and throws.
  - Callers:
    - `agent-page.pins.journey.ts:170`, `:243`
    - `widgets-menus.pins.journey.ts:201`
    - `journeys.globalSetup.ts:76`, the local-cli path used only by live and codex runs. It waits for the daemon right after login, before anything demands it.
  - Not fixed: this is in test bodies and global setup, not the warm-pin fixture setup the brief named.
- **The journey cleanup reporter does not delete the config-level sites after a test run.**
  - The `journeys` and `journeys-media` sites created when the config loads were left in `TMPDIR` after the sample run. Its per-pin sites were deleted.
  - A run whose web server failed to start also left them.
  - `--list` runs did delete them.
  - I removed the leftovers by hand, below.
- **`link:jini` has a machine-specific default.** It defaults to `/root/Programming/Jini`, so `JINI_PACKAGES_DIR` is required anywhere else.

## Cleanup

- I deleted the 4 leftover config-level site dirs (including their `agent-plugins` stores) with `chmod -R u+w` then `rm -rf`. After that, `ls <scratch TMPDIR> | grep -c tovu` gave `0`, and `ls /tmp | grep -c tovu-` gave `0`.
- I removed the temporary base worktree: `git worktree list` shows only `/home/user/Tovu`.
- I deleted the generated `development/test-results/journeys` and `development/playwright-report/journeys`.
- No Playwright, journey-site, daemon, vite or chrome processes remain: the `ps` grep returned 0.
- **Still linked:** `apps/*/node_modules/@jini-ai` is still linked to the local Jini checkout. Run `npm run unlink:jini` before a real build.

E2E-FIX DONE

## E2E-FIX-2: review follow-up

Owner-approved follow-up to an independent review, on the same branch. Only the harness changed. Two findings were fixed and nothing else.

| # | Commit | File(s) | Finding | Fix |
|---|--------|---------|---------|-----|
| 1 | `7d92b987` | `development/e2e/support/admin-panels-literal.ts` | **Medium.** The `.map` guard compared `member.name.getText()` with bare `id` and `nav`. So `"id": …` and `["id"]: …` overrides were accepted, and journeys were generated from a stale manifest. | Normalize identifier, string and numeric property names to their text, and reject computed names (`["id"]`, `[key]`). An override of `id` or `nav` in any spelling now throws. |
| 2 | `be43d06f` | new `development/e2e/support/top-level-const-string.ts`, `development/e2e/journeys/admin-visual.pins.journey.ts`, new `development/e2e/__tests__/admin-manifest-readers.unit.test.ts` | **Medium.** The tab-id constant lookup ignored lexical scope. It visited every nested declaration and kept the last match, so a nested `const ACCESS_TOKENS_TAB = "other"` became the security tab id. | `topLevelConstString(identifier)` reuses the identifier's own `getSourceFile()`. This removes the second read and parse at the old `admin-visual.pins.journey.ts:150`. The name must be bound exactly once in the file, as a top-level `const` with a string-literal value. Anything else throws: a second binding (nested const, parameter, import, …), a `let`, a nested-only const, a missing binding, or a non-string value. |

### Tests added

The new tests are in `admin-manifest-readers.unit.test.ts`, run with `node --import tsx --test`. Result: **11 tests, 11 pass, 0 fail** (`fix2-unit.txt`).

`adminPanelsLiteral`:
- Accepts the shipped render-only `.map`.
- Rejects overrides written as bare `id`, `"id"`, `'nav'`, `["id"]` and `[key]`.

`topLevelConstString`:
- Resolves the single top-level const.
- Rejects the review's case: a top-level const plus a same-named const in an unrelated function.
- Rejects a nested const that shadows the reference, a same-named parameter, an import, a `let`, a nested-only const, a missing binding, and a numeric value.

Mutation check: I ran the same test file against the pre-fix guard (`7c83209a`'s `admin-panels-literal.ts`) in a scratch copy. It failed exactly the 4 new quoted and computed rejection cases, and the bare-`id` case still passed. The scratch copy was deleted.

### Verification

- **Collection:** `playwright test --config=development/playwright.journeys.config.ts --list` gives **Total: 932 tests in 35 files**, exit 0 (`fix2-list.txt`). That is unchanged from E2E-FIX.
- **Typecheck:** `tsc -p development/tsconfig.e2e.json --noEmit` exits 0 with 0 errors (`fix2-tsc-e2e.txt`).
- **Not rerun:** the journey suite, as instructed.
- **Cleanup:** the scratch `TMPDIR` holds no `tovu-*` sites after the list run.

E2E-FIX-2 DONE
