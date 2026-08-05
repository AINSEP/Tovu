# Bug 5 — Browser Verification (2026-08-05)

## Verdict: CONFIRMED

The desktop chat-FAB/composer-send-button overlap (Bug 5) is fixed. Verified live in a real
(private, headless) Chromium session against a real running admin app — not inferred from the
existing unit coverage (17/17 + 20/20), which never exercised an actual rendered browser layout.

## Why no existing e2e spec was used

Checked first, per the task's framing. `development/e2e/destructive-path.spec.ts` opens
`button.chat-fab` and references `.admin-chat-dock` (same elements), but its
`sendAssistantMessage` helper submits via `composer.press("Enter")`, never a real click on the
send button — so it would never trigger or catch the click-interception symptom even if it were
cheap to run. It also drives a genuine ~3-minute `claude` CLI turn per test for an unrelated bug
(MANDATE 2/ADR-055 Decision 2) and is itself expected-RED by its own file header. Not a fit, and
not modified or extended — `development/e2e/` was not touched for this verification at all.

## Method

A standalone, throwaway script (never committed, deleted immediately after use — not added to
`development/e2e/`) that:
1. Boots the same two processes `playwright.admin.config.ts`'s `webServer` entries use
   (`node --import tsx src/index.ts`, then Vite for `apps/admin`), on an isolated port range
   (7821/7822/7823 — confirmed free via `lsof` before booting, distinct from every other agent's
   range seen today).
2. Drives a **private** Chromium directly via the `playwright` package's own `chromium.launch()` —
   deliberately not the Playwright MCP browser tools, which existing project memory already flags
   as unusable for this (they drive the user's real Chrome via extension, not an isolated
   instance).
3. Logs in via the same pattern `development/e2e/auth-fixtures.ts` uses (real `Login.tsx` form,
   seeded dev credentials).
4. Opens the chat dock (`button.chat-fab` click) at the suite's normal desktop viewport
   (1280×900 — well above the 640px sheet-mode breakpoint in `App.tsx`'s `isSheetMode` check, so
   this is genuinely the desktop-docked code path, not the mobile sheet).
5. Waits ~500ms for the `ResizeObserver`-driven `dockWidthPx` measurement (`App.tsx`) to settle,
   the exact value that becomes `avoidRightPx` in `useFabPosition`.
6. Confirms the send button's real selector directly from `@jini-ai/chat`'s own compiled output
   (`node_modules/@jini-ai/chat/dist/react/components/Composer.js`): `button.jini-composer-send`,
   `aria-label="Send"`.

## Evidence — three independent checks, all agreeing

```
FAB box:          {"x":825,"y":824,"width":56,"height":56}      -> spans x:[825,881]
send button box:   {"x":1222,"y":821.375,"width":34,"height":32} -> spans x:[1222,1256]
```
**No bounding-box overlap** — the two elements are ~341px apart on the x-axis, consistent with
`avoidRightPx` correctly holding the FAB clear of the (measured, not hard-coded) dock width.

```
elementFromPoint at send button center: {"tag":"I","className":"ri-send-plane-2-line",
  "matchesSend":true,"isFabOrChild":false}
```
`document.elementFromPoint()` at the send button's own visual center resolves to a node inside
`.jini-composer-send` (the button's child icon — checked via `.closest()`, not an exact class
match, since the button renders an `<i>` icon as its topmost child and a naive exact-match check
false-negatives against that; caught and fixed mid-investigation, see Traps below) and explicitly
NOT inside `.chat-fab`.

```
REAL CLICK: succeeded, no interception
VERDICT: CONFIRMED
```
A genuine Playwright `.click()` on `button.jini-composer-send` (composer pre-filled so the button
is enabled) succeeded outright. This is the same check that originally caught the bug — the code
comment in `use-fab-position.hooks.ts` records the original failure as literally "Playwright
caught it as `<button class="chat-fab chat-fab-dock-open"> intercepts pointer events` while
trying to send a message." A clean `.click()` here is the direct negative of that original
failure signature, not an indirect proxy for it.

## Traps hit and fixed during this verification (infrastructure only — not Bug 5 itself)

None of these are Bug 5 findings; recording them because they cost real time and are worth
knowing for whoever writes browser verification scripts against this app next.

1. **ESM module resolution needs the script physically inside the repo.** A script in this
   session's scratchpad directory (outside the repo) cannot `import` bare specifiers like
   `"playwright"` — Node resolves them by walking up from the FILE's own path, not `cwd`. Placing
   it as a temporary top-level scratch file inside the repo (deleted immediately after, never
   staged) fixed this.
2. **This admin Vite dev server binds IPv6 `[::1]` only, not IPv4 `127.0.0.1`.** Confirmed via
   `lsof -i :7822 -P -n` mid-investigation: `TCP [::1]:7822 (LISTEN)`, no IPv4 entry at all. A
   port-readiness poll hard-coded to `host: "127.0.0.1"` (the exact idiom `development/scripts/
   dev.mjs`'s own `waitForPort` uses, copied from there) polls forever against a listener that is
   already up, because it is targeting the wrong address family. Fixed by polling `"localhost"`
   instead, which resolves via `getaddrinfo` to whichever family is actually listening. Worth a
   look at `development/scripts/dev.mjs`'s own `waitForPort` if this ever bites there too — not
   checked, since it was out of scope here, but the same admin Vite config is presumably involved.
3. **Self-inflicted cross-run contamination from manual `lsof`/diagnostic reruns of Vite on the
   same port while debugging #2** — a stale diagnostic process outlived its own `kill`, and a
   later real run silently connected to it instead of its own fresh instance. Not a subtlety of
   the app; a reminder to track exact spawned PIDs precisely (not just "the last thing I
   backgrounded") when iterating quickly on infrastructure. No collateral damage confirmed
   afterward: the ambient `tsx watch src/index.ts` dev server (a different command line entirely)
   and no other agent's processes were affected — checked directly via `ps` before proceeding.

## Scope discipline

Nothing in `src/`, `apps/admin/src/`, or `development/e2e/` was modified for this verification.
No fix was attempted for anything found (there was nothing to fix — verdict is CONFIRMED). The
throwaway probe script lived outside the repo (scratchpad) except for the brief window it needed
to be inside the repo for module resolution, and was deleted immediately after use — confirmed via
`git status` showing nothing pending for it.
