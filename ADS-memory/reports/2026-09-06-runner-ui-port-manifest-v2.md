# Tovu-Runner UI port — manifest v2 (option-2 scope)

- Date: 2026-09-06
- Supersedes the scope sections of `2026-09-06-runner-ui-port-manifest.md` (commit `098e3466`).
  That file's per-file survey stands; its **window model and its phase plan do not**.
- Builds on `2026-09-05-runner-vs-desktop-parity.md`. Read that first — this does not repeat its
  matrix, only corrects it where it has gone stale and extends it where the new scope needs it.

## 0. Status — what is already on the branch

Stated plainly because it changes what "next" means. Phase 1 of the ORIGINAL dispatch was completed
and committed before the option-2 scope arrived:

| commit | contents | status under option 2 |
| --- | --- | --- |
| `098e3466` | manifest v1 | superseded by this file |
| `10fb9215` | Vite + React 19 + TS scaffold | **keep** — unaffected by the window model |
| `4c75f4c0` | renderer + contracts, byte-identical copy of Runner's | **keep, then subtract** — see §5 |
| `6a0bd61c` | preload, 25 throwing IPC stubs, `TOVU_DESKTOP_UI=runner` | **amend** — see §5 |

Verified by running, not reading: `tsc -p tsconfig.renderer.json` exits 0 against registry
`@jini-ai/chat@0.3.4` / `@jini-ai/protocol@0.3.1`; `vite build` exits 0; `npm test` in
`apps/desktop` is 129/129; an out-of-tree Electron probe confirmed `window.tovuRunner` (28 verbs),
`window.tovuVoice.isAvailable()` resolving `{available:true}`, no Node leak into the page, and the
UI rendering with zero console errors.

Also stated plainly: `npm install` was run in `apps/desktop` before the "RUN NO INSTALLS"
instruction arrived. Blast radius verified, not assumed — every `@jini-ai` symlink in Tovu root,
`apps/admin` and `apps/site-chat` is intact and still dated Sep 1; Jini's `node_modules` untouched
since Aug 8; root and `apps/admin` lockfiles untouched since Sep 3; Zana has no
`node_modules/@jini-ai` directory at all. `apps/desktop` is its own npm project outside root
`workspaces` (`packages/*`), so the install wrote only into `apps/desktop/node_modules`.

## 1. Corrections to the parity matrix — two of its premises have expired

The matrix is dated 2026-09-05 and describes a **single-site** `apps/desktop`. That is no longer
true, and its top two ranked gaps are now closed in code:

- **Q1 #1, "See and manage more than one site" — BUILT.** `main.cjs` now holds an
  `openSites: Map<siteDir, {server, window}>`, one `BrowserWindow` per site, "Open Site…" /
  "Open Recent" in the File menu, and `keyed-serializer.cjs` serializing opens per site dir. The
  matrix's `main.cjs:102-133 resolveTarget` no longer exists in that form.
- **Q1 #2, "Boot-time orphan reconciliation" — BUILT.** `site-registry.cjs` persists
  `{siteDir, port, workspaceId, pid}` per open site and `reconcileOrphans()` runs before any window
  opens, proving pid identity before killing. The matrix quotes `main.cjs:230-232`'s comment saying
  this "is reported rather than ported"; that comment is gone and the machinery is there.

Consequence for this port: **the fleet-management BACKEND the Projects screen needs largely
exists already.** What is missing is not supervision, it is a *list* — `openSites` knows what is
open right now, and `site-dir-store.cjs` knows what was opened recently, but nothing knows the set
of sites the operator considers theirs, with a name and a status, whether running or not.

The matrix's line counts were spot-checked and are correct; its "fleet chat is 1,027 lines, not
~1,950" correction is adopted verbatim and not re-derived.

## 2. Scope

Runner's **appearance and fleet-management front end**, on `apps/desktop`'s **N-BrowserWindow**
model. `apps/desktop` opens to Runner's Projects screen as its front page; clicking a project card
opens that site in its own window through the existing verified `openSites` path.

Not in scope: Runner's window architecture, its `<webview>` guests, its fleet-operator chat, its
in-process Jini daemon, its MCP surfaces, its credential vault.

## 3. The window-model question — what N windows costs and saves

The prior ruling ("rebuild differently, don't port — N `BrowserWindow`s is simpler") **stands**.
Stating the ledger explicitly, since the task asked for it:

**What N windows SAVES (real, and the reason the ruling is right):**
- No guest-navigation policy. Runner needs `registerGuestNavigationPolicy` (`main.ts:143-173`)
  because an embedded site can navigate its guest frame anywhere; a `BrowserWindow` whose
  `webContents` IS the site needs only the `setWindowOpenHandler` already in `main.cjs`.
- No `will-attach-webview` hardening, and no risk of getting it wrong. With `webviewTag` on, the
  PAGE picks each guest's `webPreferences` through plain HTML attributes; the hardening is a
  deny-list applied at attach time. Not having the attack surface beats hardening it.
- No `electron-webview.d.ts`, no guest lifecycle, no per-guest crash handling.
- Each site keeps its own OS-level window: real macOS window management, Mission Control,
  full-screen per site, and the native `role: "windowMenu"` **site switcher for free**.

**What N windows COSTS:**
- **The per-project tab strip becomes vestigial.** Runner's strip is one tab per OPEN project, each
  swapping which `<webview>` is visible inside the one window. With sites in separate OS windows
  there is nothing for a tab to switch. Leona has been told. Ruling: **port the strip, render only
  the "All" tab, fabricate nothing.** A tab that names another site and cannot switch to it asserts
  exactly the thing that must not be asserted — the same reasoning `554f6183` recorded when it
  refused the strip on the admin side.
- **Immersive/expanded mode goes.** `useExpandedMode` collapses Runner's chrome so a guest fills
  the window. A separate window is already "expanded"; the Escape-to-collapse listener would have
  nothing to collapse.
- **Losing the single-window operator view.** Runner shows fleet chrome and a live site
  simultaneously. Under N windows the Projects screen and a site are never on screen together in
  one window. This is the genuine loss, and it is acceptable: the OS composits windows better than
  a `<webview>` grid does.

**Worth having REGARDLESS of window model** (the answer to "what survives either ruling"):
`app.css` in full — the token system, the pill nav, card and grid styling, light/dark;
`icons.tsx`; `theme.ts`; `ProjectGrid.tsx` and its card anatomy; `CreateWebsiteOnboarding.tsx`;
the brand/typography setup. None of it encodes the window model. That is why the copy in
`4c75f4c0` is still the right base even though the ruling changed underneath it.

## 4. Nav disabling — already satisfied by the verbatim port

Leona asked that every nav item except Projects be rendered but disabled. **Runner already does
exactly this** — no new work, and no rebuild-by-eye:

- `App.tsx`'s `TopNav` passes `disabled={section.id !== 'projects'}` to every `NavLink`.
- `NavLink` renders a real `<button>` with `aria-disabled`, an early `if (disabled) return;` in
  `onClick`, and a `topnav__link--disabled` class.
- `app.css:232-233`: `opacity: 0.45; cursor: not-allowed;` plus a hover rule that neutralises the
  hover affordance. Matches "visibly and semantically disabled, no hover affordance".
- `visibleSections()` yields exactly `home, projects, tasks, generation, activity, updates` — a
  one-to-one match with Leona's reference (home / grid / checklist / video / activity / refresh),
  with the gear set apart in `topnav__tools`.

**One real gap:** the buttons are not `disabled`, so they remain keyboard-focusable and reachable
by Tab. The click handler already refuses, so nothing navigates, but "not keyboard-focusable" is
not met. Fix: `tabIndex={-1}` when disabled. Deliberately NOT the `disabled` attribute — that also
kills the `data-tip` hover tooltip, which is the only place a nav destination's name is written.

**Also remove:** `DUMMY_NAV_SUBLINKS`, the "TEMPORARY SCAFFOLD" placeholder dropdown its own
comment says carries no `RunnerSectionId` and routes nowhere. It hangs off `generation`, which is
disabled, so it is unreachable dead weight.

## 5. Per-file delta from what is committed

Only the deltas. Everything not listed stays as landed in `4c75f4c0`.

### Subtract from the renderer

| file / symbol | action | why |
| --- | --- | --- |
| `electron-webview.d.ts` | **delete** | types the `<webview>` tag, which will not exist |
| `App.tsx` `ProjectWorkspaces` / `ProjectWorkspace` | **delete** | the one-window-many-guests renderer |
| `App.hooks.ts` `useExpandedMode`, `useWebviewLoadFailure` | **delete** | guest-only concerns |
| `App.hooks.ts` `useProjectTabs`, `deriveFleetView`'s tab arms | **reduce** | no per-project tabs; the strip renders "All" only |
| `App.tsx` `DUMMY_NAV_SUBLINKS` | **delete** | §4 |
| `App.tsx` / `App.hooks.ts` fleet-chat wiring (`RunnerChatPane`, `useRunnerChatTransport`, `useRunnerConversations`) | **defer, do not delete yet** | the sparkle FAB is in Leona's reference; the chat BEHIND it is the fleet-operator surface the parity matrix rules out. Render the FAB, decide the pane separately — this is an open question, §9 |
| `fleet-chat-transport.ts`, `persistable-messages.ts`, `chat-attachments.ts`, `contracts/fleet-*.ts` | **hold** | follow whatever §9 decides; harmless while unreferenced |

### Amend `main.cjs`

| change | why |
| --- | --- |
| drop `webviewTag: true` from the fleet window | §3 |
| drop the `will-attach-webview` handler | §3 — no guests to harden |
| flip `TOVU_DESKTOP_UI=runner` from opt-in to the default | the Projects screen IS the front page now; that was the whole point |
| keep attach mode and `TOVU_DESKTOP_SITE_DIR(S)` working | they bypass the front page deliberately, for automation |
| route card-click to `serializer.run(siteDir, () => openSiteWindow(siteDir, ctx))` | reuse the verified path; do not replace it |

Note the `sandbox: false` on the fleet window is NOT dropped — it is required by the native-ESM
preload, not by `webviewTag`. Site-admin windows keep `sandbox: true` and `preload-speech.cjs`
untouched.

### Implement the stubs the front page actually needs

Of the 25 throwing channels, the Projects screen needs only these to stop throwing:

`runner:projects:list`, `runner:projects:create`, `runner:projects:delete`,
`runner:projects:open-external`, and a new "open in its own window" verb.

`start`/`stop` are the interesting case: **under N windows, "open" and "start" collapse into one
gesture** — `openSiteWindow` already spawns the server if it is not running, and closing the window
already stops it. Runner's separate start/stop buttons assume a project can run without being
visible. Ruling: **map card-click to open-or-focus, and let window close mean stop.** Do not port a
start/stop pair that would let a site run with no window, because `openSites` — the thing that
knows how to stop it — is keyed by an entry that only exists alongside a window.

### The project list — where does it come from

The one genuinely new backend piece. Per the parity matrix's own Q3 ruling and the deliberate
choice recorded at `site-dir-store.cjs:14` and `site-registry.cjs:17`:

**A JSON file in `userData`, NOT a sqlite table.** Porting Runner's `project-registry.ts` wholesale
would drag `@jini-ai/sqlite` + `better-sqlite3` into a shell that decided twice, in writing, not to
have them. Calling that out as a decision rather than doing it silently, as instructed.

Related landmine, recorded so it is not rediscovered: **`better-sqlite3` v13 is N-API and needs no
`electron-rebuild`** (`tovu-server.cjs:207-208` records ~90 lines burned on the opposite belief).
That does not change the ruling above — the objection to sqlite here is dependency weight, not
rebuild pain — but it removes a bad argument for it.

Each row needs: site dir, display name (`config.json`'s `name`, as `readSiteName` already reads),
last known port, and derived status. Status is **derived, not stored**: `openSites.has(siteDir)`
is ground truth for "running", and a stored status would be a second source of truth that goes
stale exactly when Electron is killed hard.

## 6. Logo — verified dimensions, per-slot picks, and the wordmark call

Files inspected with `sips`, not assumed:

| file | pixels | alpha | verdict |
| --- | --- | --- | --- |
| `assets/logo.png` | 128×128 | yes | **nav mark, 1x** |
| `assets/logo@2x.png` | 256×256 | yes | **nav mark, 2x** |
| `icons/icon-512.png` | 512×512 | yes | **Electron app/window icon** |
| `icons/maskable-icon-512.png` | 512×512 | yes | rejected — maskable carries ~20% PWA safe-zone padding designed to be cropped by the OS; in a macOS dock, which applies its own convention, it renders visibly small |
| `icons/apple-touch-icon.png` | 180×180 | **no** | rejected — flattened background, wrong for a circular mark |
| `favicon*.png` / `.ico` | 16/32 | — | rejected — too small for both slots |

The mark itself: a gold/amber gradient browser-window frame containing a bold **T**, with a
four-point sparkle at the lower right. Two things follow. It is square with real transparency, so
it drops into Runner's circular `topnav__mark` without a plate behind it. And **its sparkle is the
same motif as Runner's sparkle FAB** — the two were not designed together but they agree, so the
FAB stays as-is rather than being restyled.

**Copy into `apps/desktop/src/renderer/public/brand/`, do not reference `sites/tovu-com/`.** That
is a user's live site directory. Runner's `gold-runner-*.png` are then deleted, not left orphaned.

**Wordmark call: replace "Runner" with "Tovu".** Reasoning, since the task asked for it rather than
a silent choice: "Runner" names a different product and this is Tovu's desktop app, so keeping it
is simply wrong. Dropping the wordmark entirely was the other candidate and is rejected — the mark
is a "T" in a browser frame, legible as an icon but not self-identifying at 24px, and the page's
own heading is "Projects", so nothing else on screen would name the application. "Tovu" beside a
T-mark reads as a lockup rather than a redundancy.

## 7. No sign-in — design, for approval BEFORE implementation

### What is actually there today

Read `apps/website/src/server/inbound/admin-http/dev-auth.ts` in full, plus
`features/identity/wiring.ts`. This is not a stub gate:

- Real server-side sessions. `login()` verifies **argon2id** against the seeded `users` row and
  writes a revocable `sessions` row; the raw token comes back as `tovu_session`, `HttpOnly`,
  `SameSite=Strict`, `Secure`, `Path=/`.
- A second credential type already exists: `Authorization: Bearer <raw-key>`, resolving to a
  principal whose grants come from an issuance snapshot and are evaluated by **the same
  `authorize()`**. RBAC is not bypassed for API keys; it is enforced identically.
- `TOVU_ADMIN_USER` / `TOVU_ADMIN_PASSWORD` seed the owner credential **at first boot only**.
  `seedIdentity` is idempotent — `wiring.ts:233` documents it looking up the owner username before
  minting — so on an already-seeded site DB these env vars change nothing.
- `Secure` on the cookie is not an obstacle: browsers treat `http://127.0.0.1` as a trustworthy
  origin and accept `Secure` cookies there. **Flagged for live verification before building**, not
  asserted.

### Option A — env-seeded credential + loopback login + cookie injection. RECOMMENDED.

Entirely inside `apps/desktop/`. **Zero files outside the directory. No server change at all.**

1. Per site dir, the shell generates a strong random owner password once
   (`crypto.randomBytes(32).toString('base64url')`) and stores it with Electron
   `safeStorage.encryptString` in `userData`.
2. `startTovuServer` already builds the child's env, so it passes `TOVU_ADMIN_USER=tovu-desktop`
   and that password into the spawned `tovu serve`. On a **new** site this seeds the owner.
3. Before `loadURL`, the main process `POST`s `/api/admin/v1/auth/login` on loopback with those
   credentials, takes the `Set-Cookie`, and injects it with `session.cookies.set()` into that
   window's session partition.
4. The window loads already authenticated as a **real principal**, with real RBAC.

Against the stated constraints:

- *Cannot authenticate anything over a network.* The shell only ever posts to a port it learned
  from a child it spawned. Hardened further: assert the target host is literally `127.0.0.1` and
  the port matches `server.port` for that site before sending, and refuse otherwise. The password
  never leaves the loopback request.
- *Does not weaken `/api/admin/session` for the web product.* **This is the option's main
  argument** — it changes no server code, so the browser-served admin is bit-for-bit unaffected.
  Nothing becomes easier to authenticate for anyone who is not already able to spawn processes on
  the machine, and someone who can do that has already won.
- *Does not disable RBAC.* It is an ordinary `login()` producing an ordinary session. `authorize()`
  runs unchanged on every route.
- *Blast radius of the stored secret.* Per-site and random, so a leaked blob authenticates one
  local site. The parity matrix's AAD critique of Runner's vault applies to `safeStorage` here too
  (no AAD parameter exists), so the plaintext inside the blob is `{siteDir, password}` and the
  shell verifies `siteDir` after decrypt — AAD by construction, three lines, and it makes a
  slot-swap fail closed instead of silently.

**Two honest weaknesses, both must be handled and neither is hidden:**

- **Already-seeded sites.** Because seeding is idempotent, an existing site dir keeps whatever
  owner password it has and this login will 401. The shell must then **fall through to the normal
  login screen** — never a retry loop, never a blank window, never a silent failure. So the promise
  is "no sign-in for sites this shell created", not "no sign-in, ever". Leona should hear that
  sentence before this is built.
- **Sites created today already have a known default.** `wiring.ts:121` falls back to
  `DEFAULT_OWNER_PASSWORD` when the env var is unset, and `apps/desktop` sets neither — so **every
  site this shell has created so far is seeded with the shipped default owner password.** That is a
  pre-existing finding, not something this design introduces, and option A improves it. Worth
  raising on its own.

### Option B — server-side loopback boot token. Cleaner, but out of bounds.

`tovu serve` mints a single-use, short-TTL, loopback-only token at boot, writes it `0600` into the
site dir, and a new route exchanges it for a session. Strictly better: no long-lived stored
password, works on already-seeded sites, and the trust root is the filesystem permission on a file
only this user can read.

It requires editing `apps/website/src/cli/commands/serve.ts` and adding an auth route — **outside
`apps/desktop/`, so it breaks the deletable-in-place invariant.** Per instruction I have stopped
rather than started it. This is Leona's call, not mine.

### Rejected

- Disabling or bypassing the gate for loopback. Weakens the server for the web product and hands
  anything on the machine an unauthenticated admin.
- Forging a session cookie. Would need the session-token format and secret; `validateSession` is
  backed by a real `sessions` row, so a forged cookie does not resolve anyway.
- A fixed built-in password. A hardcoded credential shipped in the app, identical on every install.

## 8. Landmines folded in

- `better-sqlite3` v13 is N-API — **no `electron-rebuild`** (`tovu-server.cjs:207-208`).
- No installs anywhere (Jini symlinks; Zana consumes Jini through `link:`). No `pnpm -r build` —
  scoped only, `pnpm --filter @jini-ai/<pkg> build`.
- Fleet chat is **1,027** lines, not ~1,950; the larger figure only holds if the MCP bridge (428)
  and tool registry (487) are counted with it.
- **Check every arm of any `kind`/mode conditional.** The live example: the `TOVU_SITE_DIR` crash
  fix landed in `serve`, then `init` (`9f0b5913`), and `TOVU_DESKTOP_SITE_DIR` pointing at an empty
  folder still dies `SITE_DIR_INVALID` instead of initing. `main.cjs` now has THREE boot modes —
  fleet, attach, own-server — so every one of them is an arm.
- **Prove any new test glob matches files.** `apps/desktop`'s was `src/*.test.cjs` and silently
  never ran the six files under `src/speech/` for weeks (`6d4b64e3`). The current glob is
  `src/**/*.test.cjs` and it is confirmed to reach `src/preload/` and `src/speech/` — 129 tests
  collected, counted, not assumed.
- The admin-side objection to a per-project tab strip (`554f6183`) rests on Tovu's admin binding
  one site at boot. **That reasoning does not transfer here** — `apps/desktop` really does spawn a
  `tovu serve` per site, which is Runner's own precondition. The strip is nonetheless reduced to
  "All" for the different reason in §3: separate OS windows, nothing for a tab to switch.

## 9. Open questions — blocking, for the team lead

1. **The four landed commits: keep and amend forward, or revert `6a0bd61c` (and `4c75f4c0`)?**
   Reverting is clean and I have no stake in the code surviving.
2. **The sparkle FAB.** It is in Leona's reference, but the chat behind it is the fleet-operator
   surface the parity matrix rules out under the ports-not-fleet model. Render the FAB wired to
   nothing visible yet, drop it, or reconsider the fleet chat? I will not guess.
3. **`apps/desktop/node_modules` holds real registry copies of `@jini-ai/*`, not symlinks.** That
   is what keeps the directory self-contained and deletable, and `link-jini.mjs` was deliberately
   not extended. Confirm — it means the fleet UI renders against published Jini, not local edits.
4. **No sign-in: option A, or is option B's out-of-directory change authorised?** And Leona should
   be told option A's real promise is "no sign-in for sites this shell created."
5. **Pre-existing finding, independent of this port:** every site `apps/desktop` has created so far
   is seeded with the shipped `DEFAULT_OWNER_PASSWORD`, because it sets neither `TOVU_ADMIN_USER`
   nor `TOVU_ADMIN_PASSWORD`. Worth its own decision.
