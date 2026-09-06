# runner-ui-port — handoff (2026-09-06)

Written by the **coordinator** from the agent's own reports, not by the agent. It was rotated out on
context length and its final messages queued behind a running E2E, so this reconstructs the state
from what it reported plus the committed tree. **Anything below marked UNVERIFIED is the agent's
claim, not a checked fact.**

## Commits landed

| SHA | What |
|---|---|
| `4b89cd09` | wire the speech preload + IPC into `main.cjs` (the mic never existed in Electron before this) |
| `098e3466` | port manifest v1 (written against the ORIGINAL full-port scope — parts are now wrong) |
| `10fb9215` | Vite + React 19 + TS scaffold inside `apps/desktop`, two tsconfigs, `vite.config.mts` |
| `4c75f4c0` | Runner's renderer + shared contracts, 32 files, byte-identical copy |
| `6a0bd61c` | preload, 25 throwing IPC stubs, `TOVU_DESKTOP_UI=runner` boot mode |
| `af67f51e` | manifest **v2** — the authoritative one, written against the option-2 scope |
| `fb996e8f` | Tovu logo as app + nav mark; gold-runner PNGs deleted |
| `2aa317ab` | first sign-in attempt: per-site seeded password (**superseded**, see below) |
| `de1e1e2e` | E2E asserting the admin comes up authenticated |
| `15548bef` | **loopback boot token** — committed by the coordinator to protect it, not by the agent |

## Where it stopped

- **Boot token (option B): BUILT, committed in `15548bef`.** Its **E2E result was never reported** — the run was in flight when the agent was rotated out. *Nobody has seen this pass.* Re-run `npx playwright test --config development/playwright.desktop-shell.config.ts` before trusting it.
- **Projects front page: NOT STARTED.** This is the next task and the thing Leona is waiting to see.
- **`sealCredential` / `encryptString` Keychain guard: MOOT.** `safeStorage` and the whole stored-credential path were deleted when B replaced the password design, so the modal category no longer exists. Confirm by grep before assuming.

## Still wrong on the branch

The agent listed four items against the option-2 (N-BrowserWindow) scope. **Which of these it cleared is unconfirmed — check each.**

1. `main.cjs` sets `webviewTag: true` and installs Runner's `will-attach-webview` hardening. Both are dead under N windows; `electron-webview.d.ts` goes with them.
2. The renderer still contains `ProjectWorkspaces`/`ProjectWorkspace`, per-project tabs, and expanded mode — the one-window-many-guests model.
3. **Card click does not route to `openSites`.** Every IPC verb is still a stub.
4. Nav items and the sparkle FAB are not yet in the disabled state.

`TOVU_DESKTOP_UI=runner` keeps the fleet UI **opt-in**; unset env is byte-for-byte the old, verified-working shell. Flipping the default is one line, and should happen only once (3) is done.

## How the boot token works

`tovu serve --emit-boot-token` mints a 256-bit token into process memory at `listening` and prints it
on stdout **before** the documented startup line, so the parent has it buffered by the time the line
it waits on arrives — no handshake, no timing window. Nothing is persisted.
`POST /api/admin/v1/auth/boot-session` proves loopback from `req.socket.remoteAddress` — **not**
`req.ip`, not a header, and not the bind address, because `serve.ts` listens on all interfaces —
redeems single-use with a constant-time compare, and mints a real revocable `sessions` row. Unarmed
refuses every input including `""` and `undefined`; there is no permissive arm.

Server files touched, all outside `apps/desktop`: `features/identity/boot-session-token.ts` (+tests),
`server/inbound/admin-http/dev-auth.ts`, `cli/program.ts`, `cli/commands/serve.ts`. No server file
mentions Electron or `TOVU_DESKTOP_*`, so `apps/desktop` still deletes in place.

### Two load-bearing details

- **The identity library has no password-free session constructor**, so the route writes the `sessions` row itself and duplicates one private detail — the SHA-256 token hash. Not a silent fork: the route calls the library's own `validateSession` on the row it just wrote and returns 500 rather than a cookie if it does not resolve, so a hashing change fails loudly instead of minting cookies that never authenticate.
- **The token had three leak paths.** Child-output mirroring is now line-buffered so the token line can be stripped whole — a chunk boundary can fall inside it and a per-chunk filter would echo half — and `describeBootFailure` gets redacted input, because it puts accumulated child output straight into a thrown `Error`.

## Learned by running, in no commit message

- **`safeStorage.isEncryptionAvailable()` returning true is not a promise the store works.** It returned true on this machine and the store still raised a native Keychain modal. A modal blocks Electron's entire automation channel — the E2E hangs rather than fails.
- `isEncryptionAvailable()` is **false** under a scratch `HOME`, which is how the E2E runs — so the first credential design silently no-opped in every test while looking green.
- A credential under `userData` is orphaned **permanently** by a cleared profile, because idempotent seeding can never apply a replacement. It belongs beside the `content.db` it unlocks.
- **This machine exports `TOVU_ADMIN_PASSWORD` with `TOVU_ADMIN_USER` unset**, so a child seeded `admin` with the operator's password while the shell logged in with a different one — a guaranteed 401.
- Dropping `useSessionCookies` makes the whole mechanism a **silent no-op while every other signal still looks healthy**. Proven by mutation, not observation.

## Defect found in `@jini-ai/cms` — not fixed, not ours

Changing `TOVU_ADMIN_USER` on an existing install trips `seedIdentity`'s username-keyed early return,
re-inserts the built-in roles, and dies:

```
UNIQUE constraint failed: roles.workspace_id, roles.name
```

That rejection reaches the boot-readiness gate — `[cli/serve] a boot-readiness promise rejected — not
starting the agent daemon`. **The site still serves normally, so nothing looks broken while its
assistant is silently dead.** Any host that changes `TOVU_ADMIN_USER` on an existing install hits it.
The agent abandoned the distinct-username approach and pinned the username with a test rather than
routing around it. Needs its own ticket.

## Closed decision: site seeding

**Leona ruled 2026-09-06: leave seeding alone.** New sites keep the shipped default owner password.

Three options were considered and none taken: (1) random password written to the site dir at 0600 — the agent's recommendation; (2) random password printed once — a lockout with extra steps, since a desktop user never sees the CLI's stdout; (3) surface boot-readiness's existing `hasDefaultOwnerPassword` as a change-this prompt in the admin — the coordinator's recommendation, and the only one that fixes every install rather than desktop-created ones.

**Why nothing was done:** a random password the shell records nowhere is a permanent, invisible lockout for anyone opening that site in a browser or on another machine, with no reset path. That is worse than a known-weak default. The exposure is real but bounded for a local single-user install.

`wiring.ts:121`'s fallback to `DEFAULT_OWNER_PASSWORD` when `TOVU_ADMIN_PASSWORD` is unset, with
`apps/desktop` setting neither, **remains true and remains a finding** for any site served over a network.

## Corrections to the record

- **`de1e1e2e`'s commit message is wrong.** It says the two `development/e2e/desktop-shell*` files were untracked work it was committing; the coordinator had already committed them in `14167454`. The diff is right (+69/−0, its test only); only the prose is wrong. Do not rewrite published history to fix it.
- **`15548bef` was committed by the coordinator, not the author**, to protect the work from a stop. Its E2E result is unknown at commit time and the message says so.
- **Manifest v1 (`098e3466`) is stale** — written against the original full-port scope. **v2 (`af67f51e`) is authoritative.**
- Two premises in `2026-09-05-runner-vs-desktop-parity.md` have **expired**: its top two ranked gaps, multi-site and boot-time orphan reconciliation, are now built. The `main.cjs` comment it quotes as conceding the orphan gap no longer exists.

## Unverified claims — do not inherit as fact

- That the boot-token E2E passes. **Never reported.**
- That `CR-R04/CR-R01`'s failure is pre-existing. The agent called it so "on documentation plus reasoning, not on a revert", and said so plainly. Still unproven.
- Which of the four "still wrong on the branch" items were cleared.
- That `npm install` in `apps/desktop` was harmless. The agent did verify symlinks, lockfile dates and Zana's absence of `node_modules/@jini-ai`, which is the right check — but it ran the install before the no-installs rule reached it.
