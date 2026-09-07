# Handoff — session `tovu-8f`, 2026-09-06

Everything this session did, decided, and left open. Written for `tovu-67` and any successor.

**Provenance rule for this document:** items under "Landed" were verified by me directly (commit read,
test re-run, or database read) — not taken on a subagent's word. Items under "Open" are **claims from
reports, not independently confirmed**, and each names where to check.

---

## A. Owner decisions made tonight

| Decision | Verbatim / effect |
|---|---|
| lipay refund investigation | **Dropped.** *"We're not doing anything with Lepay."* Record as deliberately deferred, not an open bug. |
| Jini `http-kit` rebuild + daemon restart | **Approved and done.** Daemon restarted 19:17:33; `.records/` sidecar store now exists. |
| The 157 stranded conversations | **Low priority, deferred.** Rows are intact; detection landed. Migration not run. |
| The 12 recorded defects | **Greenlit for `tovu-67`.** |
| Sep 1–3 review (292 commits) | **Greenlit for `tovu-67`.** |
| `updatePost` optimistic concurrency | Posts only. **Pages arm deliberately excluded.** |
| Subagent model | Sonnet by default. Opus was scoped to specific batches, never a standing default. |

Earlier rulings inherited from `tovu-f6` and still in force: use **Claude in Chrome, not Playwright**,
for visual verification; **ask before touching `sites/tovu-com`**; Postgres/Supabase at site creation is
**cancelled, never raise again**; the desktop mic tooltip stays *"Disabled for now"* as worded.

---

## B. Landed this session — verified

**Data loss and privacy**
- `72e1e529` + Jini `6e8ea6db` — chat attachments survive a daemon restart. **Live only after tonight's rebuild.**
- `0d63cfd8` — `duplicateSite` no longer ships the source site's private data. Was copying `chat.db`, four
  `restore-point-*.db` (~39 MB each), `content.db.bak` and `content.db.predelete.bak` (44 MB each) — roughly
  250 MB of backups full of the chat history it claimed to exclude. Replaced the denylist with an
  **allowlist** in a new `platform/site-dir/layout.ts`.
- `9051e2b5` — `duplicateContentDb` no longer wipes every plugin's data. Purge **inverted**: it names what it
  deletes and keeps everything else. Measured 104 physical tables, 81 declared, 15 purged — including 3 store
  products, 1 newsletter list and a 12-row `_plugin_migrations`.
- `cb3789a9` — `.gitignore`: `chat.db`, its sidecars, and `sites/*/*.bak` were **not ignored** while
  `content.db` was. One `git add -A` would have committed the transcripts and two 44 MB production copies
  containing the `sessions` table.
- `a60e07e8` + `90e68e8f` + `e5a434c3` + `f239866e` — autosave no longer silently discards `applied: false`.
  A second tab could previously type for an hour, have every save rejected, and lose all of it on reload.
- `ef7fa9c8` — boot-time detection of conversations stranded by the chat split. Warns, never writes.

**Correctness**
- `be45461e` / `9c7d16bf` / `e595312f` / `f3bdd3af` / `2756ac26` / `b37864c3` — `updatePost` optimistic
  concurrency, wired across all three arms in scope (route, editor, agent tool).
- `0b7b6de1` — the Pages editor could not save hand-authored HTML into a new page. **Three sinks, not one.**
- `6442b34f` — `setInputValueAttr` appended a duplicate `value=` when the attribute contained the opposite
  quote character, losing the visitor's input.
- `3b196ffb` + `0b298d86` — `GET /api/attachments/:ref`, owner-scoped, path traversal blocked in four layers.
- `d033ffb8` + `2bb817f6` — the SEO editor could only write `""`, never clear. No way back from the UI.
- `b359e613` — landed the owner's in-flight `RouteDeps.contentDbPath` work; HEAD did not type-check before it.
- `6f32d027` — the BYOK module no longer reads `process.env` or opens its own auto-migrating DB handle.
- `ea5f3a42` + `b3553dd9` — **all** literal NUL bytes gone from tracked source (7 files). Those files were
  binary to git — no reviewable diff — and silently skipped by every grep-driven check. One was
  `builtin-role-grants.ts`, a permissions file.

**Accessibility — the point of this work**
`agentHandle()`'s `label` writes **only** `data-agent-label`, never `aria-label`
(`Jini/packages/agentic/src/core/handle.ts:64`, verified). So the ~480-call-site tagging effort is invisible
to a generic browser agent, which reads the accessibility tree. Comments in this repo claiming those labels
help assistive tech are **false**.
- `efeeb67a`, `d10486d5`, `3d702539`, `e2aafba6`, `fe76057d`, `abfc98fe`, `ec725ad8`, `00718e89`, `27ccb328`.
- The recurring defect: **every row in a list sharing one accessible name.** Worst case was Recovery's
  "Restore…" — that page's destructive, explicitly unrecoverable action.
- **The tell:** a test using `within()`, a regex name match, or array indexing (`buttons[0]`) to pick a
  control. A real assertion should not need DOM position to know which row it is checking.
- **Why the suite never caught it:** the existing tests rendered exactly one row.

**Records**
- `f92e835f` — the `f3579456` authorship misattribution note.
- Six review reports: `4e64e467`, `b81d57b1`, `ffc37e59`, `ee304d5e`, `ef79b352`, `552e806d`.

---

## C. Open — greenlit for `tovu-67`

Claims from the reports, **not independently verified**. Two of the original twelve (`duplicateSite`,
`duplicateContentDb`) are now closed by section B.

**Admin**
1. ~~Four `<button>` inside `<a href>`~~ — **CORRECTED 2026-09-06, and the correction matters more than
   the item.** `tovu-67` fixed those four (`a44148a1`, `530d6122`) and established that **they were never
   blocked on anything.** `Collections.tsx`'s "a fix in flight elsewhere" comment is false, but not for the
   reason two sessions concluded: the `.btn-*`-on-a-bare-`<a>` CSS **already existed when the comment was
   written** — `apps/admin/src/styles.css:1135`, landed 2026-08-01 in `bdc3776e` (I verified both the rule
   and its date), already in production use by `Dashboard.tsx`'s "View site ↗" anchor. `git blame` puts the
   comment the same minute that CSS landed: **stale from birth.**

   **The real count was 13 repo-wide, not 4.** A comment-aware scan of all 312 admin `.tsx` files found nine
   more, still open and unowned: `PostEditor.tsx:662`, `PageEditor.tsx:102` (both in someone's in-flight
   work), `Menus.tsx:44`, `WidgetRegions.tsx:98`, `WidgetsLibrary.tsx:113`, `WidgetRegionEditor.tsx:46`,
   `WidgetInstanceEditor.tsx:134`, `Recovery.tsx:94`, and `MenuEditor.tsx:373` — that last inside the owner's
   own uncommitted work, so it needs her rather than an agent.
2. `security/AccessTokensTab.tsx`'s `TokenRowDefaultIndicator` — "Make default" is a `<button>` inside a
   `<summary>` with no `stopPropagation`, so clicking it also toggles the row. Correct pattern already exists
   at `deployment/StaticSiteTab.tsx`'s `CredentialVerifyAction`.
3. Eleven hand-rolled `*GenerationRef = useRef(0)` stale-settlement guards across 10 hook files, no shared helper.
4. Push-to-talk leaves the mic live if released during the permission prompt —
   `use-push-to-talk.hooks.ts:150-151`; the state table has no `requesting-mic:stop`. Untested.

**Website / architecture**
5. Sites route and `sites_duplicate_site` re-derive the site binding from `process.cwd()`/`process.env`.
   `npx tovu serve /some/site` from the repo root reports the **wrong** site as active and writes under `cwd`.
   Masked on desktop only by `tovu-server.cjs` setting `TOVU_SITE_DIR`.
6. Authz grants registered into a module-scope `Map` by **import side effect** —
   `builtin-role-grants.ts:13-16`, populated by `pages/permissions.ts:122-146`. A script that builds identity
   deps without importing `features/pages` gets an **empty permissions registry**
   (`development/scripts/backfill-reset-admin-password.ts:132`).
7. Boot-session token is a module singleton on a security route with **no server-side test**. Its header claims
   "no dependency path" between minting and redeeming — provably false.
8. `dev-auth.ts:297-312` re-implements `@jini-ai/cms/identity`'s private session hashing. Seam belongs in Jini.
9. Boot orchestration hand-copied three times between `serve.ts` and `index.ts`, with a comment claiming boot
   logic is "never shared via import" — contradicted the same day by `4dfbfe80`. `export.ts` has none of it and
   still boots the real `createApp`, so the crash-interrupted-migration scan never runs before an export.
10. **713 sessions** in the live database — every desktop launch mints a 30-day owner session, never revoked.
11. `escapeHtml` does not escape `'`. Deliberate: it changes output across every form.

**Review coverage — the biggest gap**
12. **2026-09-01 → 09-03, 292 commits, reviewed by nobody.** 194 of them are 09-03 alone.
    Sep 4–6 are covered by the six reports above, but those windows were **triaged, not exhaustive** —
    skipped: ~200 `agentHandle` commits, ~100 docs/design/landing, test-and-refactor-only, ~15 admin hook
    fixes, most of the desktop shell, voice, several UI screens, theme CSS, SSRF, deployment trims, evals.

---

## D. Unowned

- **`apps/desktop/**`** — `tovu-f6` shut down.
- **WebMCP.** W3C CG standard, Chrome 146. Tool registration, **not** DOM tagging — any text calling it a
  tagging convention is wrong. The getter moved `navigator.modelContext` → **`document.modelContext`**
  (Chrome 150 keeps the old name as a deprecated alias). Tovu already has the tools; the real work is deciding
  **what a browser agent may reach with no operator present** — an authorization question, not an API call.
- **The attachment preview modal has never been seen rendering a decoded image in a browser.** Committed and
  unit-tested; blocked three times by environment. Do not record it as working. The owner can settle it in ten
  seconds by attaching an image and clicking the chip.

---

## E. Operating rules this session learned the hard way

- **The machine hit load average 613 against a known crash point of ~721.** Cause: five agents running
  **directory-wide** test suites. Owner, verbatim: *"Don't run any fucking tests on the whole repo. It's only
  files they change."* The cap is on **test runs, not agent count** — agents are cheap and wanted.
  Every dispatch prompt must carry: exact test **file** paths only, one process at a time, `uptime` first.
  `npx vitest run src/features/posts` is the shape that did it.
- **No `index_repository` / codebase-memory MCP calls.** An indexer hit 3.88 GB and 110% CPU. No recursive
  grep over `/Users/la/Programming/`.
- **Every save under `apps/website/src` restarts the API and takes the agent daemon with it** — dropping the
  owner's chat stream. Batch edits.
- **Mid-flight messages to subagents may not arrive.** Two scope changes this session did not land; a third
  arrived after the agent had finished. Put everything in the spawn prompt, or kill and respawn.
- **`$(printf '\0')` collapses to an empty pattern in bash** and matches every file. I nearly reported a false
  NUL-byte sweep from it. Use a byte-level scan.
- **Reports are claims.** Verified independently this session: a "wired end-to-end" claim that had left one of
  three arms untouched; a `package.json` change described as a subpath export that was only a version bump; a
  "one confirm away from `rm -rf`" framing that was not reachable on the owner's machine.
- **Comments in this codebase are frequently, confidently false.** Corrected tonight: `duplicate-site.ts` ×4,
  `duplicate-content-db.ts` ×2 including a citation to a constant that does not exist where it says,
  `routes/posts/autosave.ts` describing client logic that never existed, `Seo.hooks.tsx` and `api.ts`,
  `Collections.tsx`'s "fix in flight elsewhere". Verify before trusting.
- **A comment claiming work is "in flight elsewhere" is not evidence that it is pending.** Check whether it
  already landed before concluding it is unowned. Two sessions read that comment tonight and both drew a
  wrong conclusion from it — just a *different* wrong conclusion than the one it was written to induce. The
  CSS it described as forthcoming had shipped the same minute the comment was written, and four fixes sat
  blocked on nothing for five weeks. Cost: two sessions' analysis and a wrong entry in the first version of
  this very document (see C1).
- **The same failure appears in commit messages, where it is even less likely to be re-checked.**
  `1bb6fa67` claims it fixed a problem "as a class"; `withReadOnlyToolConstraint` has exactly one call site,
  because BYOK hand-composes its own stack. And `64e6c029` carries `ab3c01cc`'s message entirely — its real
  diff is a credential-redaction fix. Treat a commit message as a claim, like a comment.
- **Counts in a report are lower bounds, not totals.** The nested-`<button>` item was reported as 4 sites; a
  comment-aware scan across all 312 admin `.tsx` files found **13**. A grep that misses commented-out code,
  or stops at the first directory it was pointed at, undercounts silently.
