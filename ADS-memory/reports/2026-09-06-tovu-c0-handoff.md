# tovu-c0 → next session handoff

**From:** session `tovu-c0`. **Date:** 2026-09-06. Branch `restructure/apps-website-phased`.
Inherited from `tovu-ce` (`2026-09-05-tovu-ce-handoff.md`), which is still the history for
anything before this session.

---

## 0. THREE COMMANDS LEONA MUST RUN — nothing else unblocks them

Every one of these is refused by the harness's auto-mode classifier, for the coordinator and for
every subagent. This is not a scoping problem; the commands are correct and staged. She runs them
with a `!` prefix in her prompt.

```
! npx tsx development/scripts/repair-site.ts --dir sites/tovu-com --apply
! sqlite3 sites/tovu-com/content.db < .local-artifacts/delete-corrupt-fixtures.sql
! npx tsx development/scripts/split-chat-data-into-chat-db.ts --db sites/tovu-com/content.db --apply
```

1. **Repair the site** — writes `config.json` + `.site-meta.json` into `sites/tovu-com`. Dry-run
   verified: derives `schemaVersion 57` / `0057_concerned_hardball` from the db's own
   `__drizzle_migrations` history. Refuses if either file already exists. Clears the
   `Not initialized` badge and makes `tovu serve` accept the folder.
   **Note the path.** The agent that built it reported `apps/website/sites/tovu-com` — that is a
   stale 1.1 MB copy from Sep 2. The real site is `sites/tovu-com` at the repo root, 44 MB.
2. **Delete the corrupt fixtures.** Two GIFs with valid headers and truncated data (libvips:
   `Invalid frame data` / `Unexpected end of GIF source data`) — the only two `image/gif` rows in
   the database, each embedded in one test post. The SQL is written and reviewed at
   `.local-artifacts/delete-corrupt-fixtures.sql`; it deletes search-index rows, the two posts, the
   rendition rows, the media rows, and the blob rows in one transaction, matching on **ids only** so
   the unrelated third post at slug `blue-circle-test-2` survives. Audit/event/chat tables untouched
   deliberately. Backup already taken: `sites/tovu-com/content.db.predelete.bak`, integrity ok.
   **After it runs**, two orphaned blob files under
   `sites/tovu-com/uploads/ws/workspace-local/blobs/` should be moved (not deleted) to
   `.local-artifacts/deleted-blobs/`.
3. **Chat migration.** Still not run. 157 chats / 562 messages / 19 sessions sit in `content.db`
   and are **invisible in the UI**, because the `chat.db` split is live and new chats go there.
   Nothing is lost. Script is copy → verify-by-hash → delete-by-primary-key, safely re-runnable,
   dry-run verified against an independent count. Backups: `content.db.bak`, `chat.db.bak`.

---

## 1. `apps/desktop` — THE BIG ONE, and it has never been launched

**Nobody has run the Electron app this entire session.** Every agent was explicitly forbidden from
launching it (the owner is working on this machine and a stray window outliving an agent is worse
than an unverified claim). So everything below is verified at the unit/static level and **zero
percent verified as a running application.**

`cd apps/desktop && npm run dev` (`electron .`) is the entry point. Electron is installed at
`apps/desktop/node_modules/electron`.

**What landed tonight, all unverified in a real window:**

| Commit | What |
|---|---|
| `afffd00d` | `keyed-serializer.cjs` — prevents double-spawn on a fast double-click per site dir |
| `d1b1deb9` | `selftest-tracker.cjs` — per-window load tracking, seeded up front to avoid early-settle races |
| `022e978c` | `site-registry.cjs` — persists `{siteDir, port, workspaceId, pid}`, reconciles orphans on next launch (identity-checked via live `ps` argv, then SIGTERM→SIGKILL) |
| `9f0b5913` | `main.cjs` wiring + own-server mode spawns the CLI **from TypeScript source via `--import tsx`** instead of the stale compiled `dist/` |
| `6d4b64e3` | `preload-speech.cjs` constants inlined for `sandbox: true`; **also fixed `package.json`'s test glob, which had silently never run anything under `src/speech/`** (84 → 115 tests) |
| `738bdebf` | `openSiteWindow` rolls back the registry row + stops the server if `createWindow` throws |
| `4b89cd09` | **The mic fix** — `webPreferences.preload` and `registerSpeechIpc` were never wired in at all |

**Two real bugs found and fixed along the way**, both reproduced rather than assumed:
- The `TOVU_SITE_DIR` crash fix had been applied to the `serve` arm only, not `init`. So
  **"Open Site…" / "Open Recent" onto an empty folder was broken** — the CLI crashed before
  `runInitCommand` ran.
- The desktop spawned a **stale Aug-28 CLI at schema v50 while source is at v57** (confirmed:
  `dist/src/cli/main.js` dated Aug 28, journal tops out at `0050_warm_eternity`). It therefore
  rejected sites created by current code. Now spawns from source.

**What the next session must actually do:**
1. **Launch it.** `cd apps/desktop && npm run dev`. Nothing below means anything until this happens.
2. **Verify the mic end to end** — on-device macOS transcription into the composer. It is wired now
   but has never been exercised in a real Electron renderer. In a browser the mic is *correctly*
   disabled (the only browser option is Web Speech, which uploads audio to Google — a prior session
   ruled that out and the owner has not overridden it).
3. **Verify multi-site**: open two sites, confirm two windows with two `tovu serve` children, and
   that the macOS `role: "windowMenu"` switcher works.
4. **Verify crash safety**: hard-kill Electron, relaunch, confirm `reconcileOrphans` actually cleans
   the orphaned server.
5. **Verify "Open Site…" onto an empty folder** — the bug fixed in `9f0b5913`. This is the one with
   a known-broken past.
6. `main.cjs` has **zero exports** and runs Electron-only code on require, so nothing in it is unit
   testable without extracting `openSiteWindow`/`createWindow` and their shared module state into an
   injectable module. That restructure was costed and deliberately not done. Decide whether it is
   worth it before adding more logic there.

---

## 2. Landed this session — do not redo

~40 commits. Highlights beyond `apps/desktop` above:

| Area | Commits |
|---|---|
| **Sites tab system** (the session's opening complaint) — two real tabs, create form inside tab 2, returns to tab 1 on success | `f978ebe0` |
| **Single-port dev**: `https://localhost:3000/admin/` proxies to Vite, HMR forwarded, no redirect | `4f259b5b`, `657d2ace`, `24c71a5b` |
| **Boot safety**: `npm run dev` refuses to migrate a newer db; `tovu serve` now runs the full boot lifecycle + readiness gate | `4dfbfe80`, `66e14fe5` |
| **"Repair this site"** + shared `readAppliedSchemaIdentity` extraction | `8a14b56a`, `d131619d` |
| `ba3a61b4` corruption sweep (3 fixed) | `ef3902f4`, `ebc60b29`, `9bc70d09` |
| 6 gate-script edge cases | `c5c70bfe`, `d4968f05`, `088ee490`, `f74eddda`, `005d9785`, `06673aee` |
| AssistantDock memo defect, `resolveActiveTabId` guard, SlowRunNoticeCard split | `c084f293`, `3e651f63`, `06bf5966` |
| Admin field-kind crash (`relation`/`json`) + drift guard | `1a551bc9`, `7701bbfc` |
| Effort-picker data plumbing (Tovu side) | `16dda1dc`, `a3c32590` |
| `apps/website` doc debts + 4 orphaned test suites | `8653fa97`, `06298162`, `4c825f6a`, `056135db`, `5dadd65d`, `57143cd2` |
| `dev.mjs` complexity, `theme-files` type fix (**repo now typechecks at exit 0**) | `66156ffe`, `663b338f` |
| Hop-by-hop header leak + SSE `Connection` gating | `848ddd09`, `2cd019cd` |
| Cleanups: `stash@{0}` dropped (patch saved), 18 root PNGs moved, gitignores | `dcd1f968` |

**In Jini** (branch `general-work`): `abd73e34`/`4d2e5380` (amr wiring + 8 doc comments, one of which
was factually false and was corrected), `df1be096`/`63a2f909`/`39df9ccd` (CMS `relation`/`json` field
kinds, after a full exhaustiveness audit of every security-relevant switch), `059227e0` (effort
picker narrows per selected model), plus 10 guard-neutrality commits ending `8ae53f25`.
**`@jini-ai/cms` and `@jini-ai/ui` were rebuilt and the dev server restarted, so all of that is live.**

---

## 3. Open decisions

1. **HTTP/2 on the API is BLOCKED by a Node bug** — `http2.createSecureServer({allowHTTP1:true})`
   kills the process within ~15s once an SSE stream is open (`TypeError: ... reading 'readable'`,
   entirely inside Node core, v24.2.0, reproduced 3x with A/B confirmation). Reverted; documented in
   `index.ts` so nobody retries blind. **Consequence:** both hops of `:3000/admin` are HTTP/1.1, so
   Chrome's ~6-connection cap can bite — the symptom is an admin that hangs and looks like a dead
   backend. `https://localhost:5173/admin/` remains the escape hatch. Revisit on a newer Node.
2. **Jini guard: 25 violations remain, deliberately.** 22 are in files other sessions own
   (chat-pane, cms, tokens); 3 are the guard's own stale allowlist — `@jini-ai/ui/html-editor`,
   `/a2ui`, `/interactive-ui` are real published entry points but only `/mcp-ui` was ever gated.
   Adding them is a guard-design call.
3. **Four unexplained version-only bumps** in Jini (`core`, `devops`, `http-kit`, `mcp`) with zero
   source diff. **Leona ruled: no Jini version bumps now.** Left uncommitted.
4. **Jini `.gitignore`** has an uncommitted edit adding `cache/` (97 MB, stale, indexes Jini's own
   `AI-Dev-Shop/` subtree — NOT Tovu's, an earlier claim to the contrary was wrong) and
   `.rebuild.lock`. Left uncommitted; `cache/` not deleted.
5. **A stale `dev.mjs` orchestrator** may reappear — one was running all evening owning no ports.
   Attribute by socket/pid, never start time.
6. **Untrimmed credential whitespace**, **per-site tabs**, and **real data agents wrote into her dev
   DB** (a site-wide OG image + a Home entry override) are all still unruled from the prior handoff.
7. **CI is still billing-blocked** and has not run on GitHub in weeks — a payment issue, not a
   workflow issue. Until then `test:ci` is non-blocking anyway and its outcome is never read by the
   aggregator, so a red unit test is purely informational.

**CANCELLED, do not raise again:** Postgres/Supabase at site creation. Leona, 2026-09-06: *"we're
not doing [postgres] cross site creation at all. Don't even bring that up again."* The inert
three-option picker in the create form stays as-is.

---

## 4. Still open, not started

- **The SIGTERM hang** (`CR-R04/CR-R01` foreign-cwd test) — an agent was mid-investigation when this
  session ended, with uncommitted work in `serve.ts`, `app.ts`, `deps.ts`, `types.ts`. **Check
  `git status` before touching those.**
- **`assistant-byok.ts`'s `resolveToolAttemptAuditSink()`** calls `openContentDb(defaultContentDbPath())`
  directly, ignoring the CLI's resolved path. It crashes the `TOVU_CONTENT_DB`-override test — and
  because `openContentDb` migrates unconditionally, **a code path that opens the wrong database also
  migrates it.** Same investigation as above; unfinished.
- **5 pre-existing failures** in `external-mcp-repo.sqlite.test.ts` (`aadVersion`/`oauthAadVersion`
  column mismatches), noticed but never triaged.
- The `@jini-ai/chat/core` deep-path violations in chat-pane are a **zero-behavior-change one-line
  fix** each (`"."` and `"./core"` resolve to the identical `dist/core/index.js`) — do them once
  that directory is free.

---

## 5. Traps confirmed or learned this session

- **The harness classifier blocks destructive DB commands** for coordinator and subagents alike.
  Do not hunt for another route; hand the owner the command.
- **Vitest's text coverage table shows only ONE uncovered gap per file and truncates filenames** —
  read lcov. A reported gap at a line past a file's end means truncation, not a bug.
- **`ReturnType<typeof overloadedFn>` resolves to the LAST overload**, silently widening a declared
  return type. Narrow the declaration; never cast at the call site.
- **A bulk path-rewrite can rewrite non-import string literals** — `ba3a61b4` corrupted a frozen lcov
  fixture reference, three comments about a pre-existing rename, and a path into *another repo*.
  **Nothing in this toolchain checks comment content against reality.**
- **Mid-flight `SendMessage` to a busy agent lands late or not at all.** Everything goes in the spawn
  prompt. Two messages arriving together will often get only the first answered.
- Reconfirmed: never read an exit code through a pipe; `timeout` does not exist on macOS; `grep` is
  ugrep with three silent-zero modes; `git show -- <path>` prints nothing on a non-matching pathspec.

---

## 6. How the owner works

She dictates by voice, so proper nouns garble — resolve against repo vocabulary and **state your
reading inline** so she can correct it cheaply. She wants to **see** things working, not be told
they work. **Report only mistakes and things she must approve — never agent completions or a running
status feed.** Keep replies short; she is listening to them. And a **reference screenshot is not an
instruction**: when a reference conflicts with what she said in words, the words win, or you ask.
