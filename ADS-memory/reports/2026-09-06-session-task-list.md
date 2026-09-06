# Session task list — 2026-09-06 (tovu-c1)

Live worklist for this session. Owner column: **L** = only Leona can run it, **A** = dispatched agent, **C** = coordinator.

## In flight

| # | Task | Owner | State |
|---|---|---|---|
| 1 | Port Tovu Runner's UI into `apps/desktop` — Projects grid becomes the app's front page, N-BrowserWindow model kept (no `<webview>` tabs) | A (`runner-ui-port`, Opus 5) | manifest first, scaffold blocked on coordinator approval |
| 2 | Redesign the `sample-xai` landing page after x.ai + the refero design system, with code/video placeholders | A (`xai-landing`, Fable 5.1) | dispatched |

## Decided this session

- **Port scope**: Runner's *look and front end*, but each site keeps its own `BrowserWindow`. Reverses part of the `2026-09-05-runner-vs-desktop-parity.md` ruling — deliberately, on Leona's word. Consequence accepted: the tab strip shows only "All", since per-project tabs are the webview model.
- **No sign-in.** The desktop app must come up authenticated. Needs a desktop-only auto-auth path that cannot apply to anything network-reachable and must not weaken `/api/admin/session` for the web product.
- **Nav**: only Projects is live; the other pill items render but are disabled, not hidden, not wired to blank screens.
- **Logo**: tovu-com's logo (`sites/tovu-com/themes/static/basic/`) replaces Runner's gold-runner mark, copied into `apps/desktop` rather than referenced out of the live site dir.

## Three commands only Leona can run

The harness auto-mode classifier refuses these for the coordinator and every subagent. Staged and backed up.

```
! npx tsx development/scripts/repair-site.ts --dir sites/tovu-com --apply
! sqlite3 sites/tovu-com/content.db < .local-artifacts/delete-corrupt-fixtures.sql
! npx tsx development/scripts/split-chat-data-into-chat-db.ts --db sites/tovu-com/content.db --apply
```

The third has a running cost: **157 chats / 562 messages / 19 sessions are sitting in `content.db` and are invisible in the UI right now**, because the `chat.db` split is live and new chats go there. Nothing is lost.

## Defects found by running the app (new this session)

| # | Defect | Evidence |
|---|---|---|
| 3 | **Empty folder is not initialized on the env-var arms.** `resolveSiteDir`'s first branch is `if (envDir) return envDir` — returned raw, never reaching `adoptSiteDir`, so `tovu serve` dies `SITE_DIR_INVALID: config.json is missing`. `TOVU_DESKTOP_SITE_DIRS` in `main.cjs` bypasses `adoptSiteDir` too. Only the picker arm initializes. Third arm of the `TOVU_SITE_DIR` fix that landed in `serve`, then `init` (`9f0b5913`). | `development/e2e/desktop-shell.spec.ts` test 4, RED |
| 4 | **`TOVU_DESKTOP_SELFTEST=1` exits 0 on a hard boot failure.** Server died, no window ever loaded, still returned 0 — the same exit code as a full two-site success. The selftest can never fail CI as written. | measured directly, `$?` read without a pipe |

## Verified working by running (first launches ever of `apps/desktop`)

- Two sites boot concurrently, own ports, schema v57, admin loads in both windows.
- Crash-orphan reconcile really fires and kills stale `tovu serve` children on next launch.
- E2E harness now exists: `development/playwright.desktop-shell.config.ts` + `development/e2e/desktop-shell.spec.ts`, driven through Playwright's `_electron`. 2 pass / 2 fail, the 2 failures being defect #3.

## Not started

| # | Task | Note |
|---|---|---|
| 5 | Verify the mic end to end inside Electron | wiring fixed in `4b89cd09`, never exercised |
| 6 | Verify hard-kill → relaunch orphan cleanup deliberately | seen firing incidentally; not yet a test |
| 7 | Review the stopped agent's uncommitted diff in `apps/website/src/server/**` | it was stopped mid-investigation with **no record of what it learned** — treat as unreviewed; delete the `zzz-debug-*` scratch file rather than committing it |
| 8 | `assistant-byok`: `resolveToolAttemptAuditSink()` calls `openContentDb(defaultContentDbPath())`, ignoring the CLI's resolved path — and `openContentDb` migrates unconditionally, so a call site that opens the wrong database also migrates it | reachability unanswered |
| 9 | Five pre-existing `external-mcp-repo.sqlite.test.ts` failures | never triaged |
| 10 | Jini `pnpm guard` sits at 25 violations deliberately | 22 in other sessions' files, 3 are the guard's own stale allowlist |
| 11 | CI still billing-blocked | |
| 12 | Audit `apps/desktop` for more silent-zero test wiring | its test glob was `src/*.test.cjs` and never ran the 6 files under `src/speech/` for weeks (fixed `6d4b64e3`) |

## Closed — do not reopen

- **Postgres/Supabase at site creation is CANCELLED.** The inert three-option picker in the create form stays.

## Environment notes that cost time

- **macOS Screen Recording is not granted to Terminal**, so `screencapture` returns bare wallpaper and `-l<windowid>` fails outright. Electron windows are captured through Playwright's `_electron` driver instead — no permission needed. Granting the permission would also work but is not required.
- Playwright is at the repo root; **electron is only in `apps/desktop/node_modules`**, so `_electron.launch()` needs an explicit `executablePath`.
