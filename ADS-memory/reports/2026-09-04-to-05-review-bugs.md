# Code-inspection bug hunt — commits of 2026-09-04 and 2026-09-05

Reviewer: Programmer / Code Inspection persona (read-only; nothing run, nothing outside this file
written). Scope: the 521 commits in `git log --since="2026-09-04 00:00" --until="2026-09-06 00:00"`
(Sep 4: 93, Sep 5: 428), reviewed as the code stands at HEAD `efeeb67a`. Items already in
`2026-09-06-review-bugs.md`, `-architecture.md`, `-excess-code.md` and the F6 worklist are excluded
unless a new route or a worse consequence was found.

Triage: docs/content/design commits, the `agentHandle` tagging sweeps, test-only commits and
refactors were skipped outright (~300 commits). Effort went to writes, migrations, auth, media,
concurrency and anything touching a database. `deps.ts` carries uncommitted edits in the working
tree; its line numbers below are working-tree numbers.

Two facts from the owner's real `sites/tovu-com` directory (opened `?mode=ro` only) anchor
findings 1-4: `content.db` still holds **157 `ai_chats` / 562 `ai_chat_messages` / 19
`assistant_agent_sessions`** while `chat.db` holds 11 / 40 / 6; and `content.db` has **15 raw-SQL
tables** that are not the three chat tables (`_plugin_identity`, `_plugin_migration_journal`,
`_plugin_migrations`, `p_comments__comments`, `p_comments__moderation_log`, five
`p_newsletter__*`, `p_store__orders`, `p_store__products`).

---

## Findings, worst first

### 1. CONFIRMED — the chat.db split orphaned every pre-existing conversation; nothing detects or migrates them

`0fb84ae0` redirected `chatHistory`/`agentSessions` from `content.db` to a new sidecar file and
explicitly left "existing production data untouched — see the follow-up migration script".
The script (`ac171e6d`) is manual, dry-run by default, and demands `--db` with no default.

- `apps/website/src/server/runtime/composition/deps.ts:1009, 1182, 1185` — `openChatDb(...)`
  creates an empty `chat.db` and both stores read only from it.
- `apps/website/src/platform/db/sqlite/chat-db.ts:65-73` — `openChatDb` creates tables; it never
  looks at `content.db`.
- `development/scripts/split-chat-data-into-chat-db.ts:303-306, 346` — `--db` required, no
  auto-invocation; grep for `ai_chats` across `apps/website/src` (non-test) finds no boot-time
  check (only `chat-db.ts` and the `deps.ts` comments).

**Failure scenario (already live on the owner's site):** any server built after `0fb84ae0` boots
against an existing site → the assistant's conversation list shows only conversations created since
→ every earlier conversation is gone from the UI. On `sites/tovu-com` that is 157 conversations /
562 messages sitting invisibly in `content.db`. For a self-hoster upgrading Tovu it is the same
with no hint that a recovery script exists. The rows are recoverable, but only by someone who knows
the script's name.

**Fix:** at boot (in `createSqliteRouteDeps` right after `openChatDb`), count rows in
`content.db`'s three chat tables; if non-zero either run `applyChatSplit` (it is already
idempotent — `INSERT OR IGNORE` + per-row hash verification before any delete) or refuse/log loudly
naming the script. Then run the script against `sites/tovu-com` now.

### 2. CONFIRMED — `duplicateSite` carries the full chat history (and every backup) into the copy, the one thing it says it never does

Both headers state the requirement: "chat/session history must never ride along" /
"excluded BY CONSTRUCTION". The exclusion only applies to `content.db`. The generic directory copy
that follows copies everything else at the site's top level.

- `apps/website/src/platform/site-dir/duplicate-site.ts:68-82, 109, 180` — `copyPortableEntries`
  skips exactly `content.db`, `content.db-wal`, `content.db-shm`, `config.json`, `.site-meta.json`
  and `fs.cpSync`s every other entry.
- `deps.ts:471` — `chat.db` lives at `<dirname(content.db)>/chat.db`, i.e. the same top level.
- `sites/tovu-com` today contains: `chat.db` (3.0 MB) + `chat.db-wal` (4.2 MB) + `chat.db-shm`,
  `chat.db.bak`, `content.db.bak` (44 MB), `content.db.predelete.bak` (44 MB),
  `content.db.bak-20260812-205241` (10 MB), nine `restore-point-*.db` files (10-40 MB each,
  ≈ 260 MB total), `content.seed.db`, `ops/`, `out/`.
- `bcf09c62` (18:18) landed after the split `0fb84ae0` (18:02); `duplicate-content-db.ts:38-42`
  even anticipates the split but forgets the file itself is copied by its sibling.

**Failure scenario:** `sites_duplicate_site` (`features/sites/tool-registrations.ts:153-154`) on
`tovu-com` → the new client site contains the owner's entire chat history three ways: `chat.db`
(current conversations), every `restore-point-*.db` and `*.bak` (pre-split full `content.db` copies
holding `ai_chats`, `ai_chat_messages`, *and* the identity `sessions` table with live session
hashes). ~330 MB is copied synchronously (`fs.cpSync`), stalling the hosting process's event loop
for the duration; the live WAL-mode `chat.db`/`ops/database-journal.db` are copied mid-write, the
torn-copy problem the header describes for `content.db`.

**Fix:** invert to an allowlist of portable entries (`uploads`, `themes`, `plugins`, `overrides`,
`skills`, `agent-plugins`), or at minimum skip every top-level `*.db`, `*.db-wal`, `*.db-shm`,
`*.bak*`, `restore-point-*`, `content.seed.db*` and `ops/`. Make the copy async or run it off the
request path.

### 3. CONFIRMED — `duplicateContentDb` empties every plugin-owned table (comments, newsletter, store, plugin identity)

The purge keeps only tables declared in `schema.ts`, `__drizzle_migrations`, `sqlite_*` and FTS
objects, and deletes rows from everything else. Its premise — the three chat tables are the only
raw-SQL tables — is false: plugin data modules create `p_<plugin>__<table>` tables and their
bookkeeping at runtime, after migration.

- `apps/website/src/platform/site-dir/duplicate-content-db.ts:78-84, 96-108, 150` —
  `isKeptInfrastructureTable` + `purgeNonContentTables` (`DELETE FROM "<name>"` for every other
  table).
- `apps/website/src/features/plugins/data-module.ts:444` (`_plugin_migrations`),
  `plugin-identity.ts:43` (`_plugin_identity`), `migration-journal.ts:28`
  (`_plugin_migration_journal`), `data-module.ts:853` (`CREATE TABLE "p_..."`).
- Installed on every site by the composition root: `features/comments/types.ts:213-246`,
  `features/newsletter/data-module-manifest.ts:51-…`, `features/plugins/store/store-plugin.ts`,
  `lipay-plugin.ts`, `deploy-plugin.ts`.
- `apps/website/src/platform/db/schema.ts:706` — `newsletter_campaigns.list_id NOT NULL` is kept
  and now points at a purged `p_newsletter__lists` row.
- The header's citation (`:28`, "`RAW_SQL_MANAGED_TABLES` registry in `db/migration/manifest.ts`")
  is false — that constant exists only in
  `platform/db/__tests__/schema-migration-drift.test.ts:134` and lists just the three chat tables.

**Failure scenario:** duplicate a client site that has a store and a newsletter → the copy has
zero products, zero orders, zero comments, zero lists/subscribers; every campaign's `list_id`
dangles; `_plugin_identity` is empty so the next plugin load re-mints identity ("first-mint") and
the 12-row migration timeline is gone. On `tovu-com` today that is 3 `p_store__products`, 1
`p_newsletter__lists` and 12 `_plugin_migrations` rows. Meanwhile the chat tables this purge was
written for are now empty in `content.db` anyway (finding 1 aside).

**Fix:** keep `_plugin_*` and `p_*` tables (plugin data is site content); name the three chat
tables explicitly as the purge set, or drop the purge now that chat lives in `chat.db` (after
finding 1 is closed). Fix the false citation.

### 4. CONFIRMED — `chat.db` and the `.bak` copies are not gitignored; the transcripts moved out from under the rule that protected them

`.gitignore:46-57` excludes `content.db` *because* it holds "real chat transcripts". `0fb84ae0`
moved those transcripts into `sites/<name>/chat.db` and added no rule.

- `git check-ignore -v sites/tovu-com/chat.db sites/tovu-com/chat.db-wal` → not ignored; `git
  status` shows `?? sites/tovu-com/chat.db`, `chat.db-shm`, `chat.db-wal`, `chat.db.bak`.
- `.gitignore:60` covers only `content.db.bak-*`; `content.db.bak` and `content.db.predelete.bak`
  (44 MB each, full production copies with `sessions` and every credential table) are `??` too.

**Failure scenario:** a `git add sites/` or `git add -A` (the shared-tree hazard already in memory)
commits the owner's conversations and a full production database copy; a later public push
publishes them.

**Fix:** add `sites/*/chat.db`, `sites/*/chat.db-wal`, `sites/*/chat.db-shm`, `sites/*/*.bak`,
`sites/*/content.db.*.bak`. (`?? content.db` at the repo root and
`apps/website/sites/tovu-com/content.db` — a 1 MB site created under `apps/website/` on Sep 2,
directory touched Sep 6 — are the same class; something still runs with `cwd=apps/website`.)

### 5. PLAUSIBLE — lipay's webhook refund path treats `data.amount` as the refund amount; the only gateway hands it the charge's total

`74094c5c` added a money-only update so a partial refund that does not change status still
accumulates. Whether it is ever reached depends on what `charge.refunded`'s `data.amount` is.

- `apps/website/src/features/plugins/lipay/lipay-plugin.ts:476-478` — `incomingRefundAmount` =
  `event.amount?.minorUnits ?? paymentRow.amount_minor`; `:531-534` adds it to the stored total.
- `providers/lipay-gateway.ts:273, 278` — `const charge = body.data; resolveChargeAmount(charge)`
  reads `data.amount`, documented at `:252` as "`charge.amount`", i.e. the charge's own amount.

If `data` on a `charge.refunded` event is the charge (as the code and its names say), every webhook
refund is recorded as a *full* refund: `min(existing + amount_minor, amount_minor)` → status
`refunded` (terminal, `state-machine.ts:30`) → a later real webhook is ignored. The new
`moneyOnlyTransition` (`:552`) is then unreachable through the only producer, and the added test
(`webhook.test.ts`) passes because it feeds a normalized event with a partial `amount` directly. If
instead `data` is the refund object, the naming is wrong but the arithmetic is right. Check the
gateway's `charge.refunded` payload contract; if it is the charge, read `amount_refunded` (cumulative)
and set rather than add.

### 6. LOW / CONFIRMED — `setInputValueAttr`'s new regex still misses mixed quotes, re-creating the "second `value=` appended" bug it fixed

- `apps/website/src/server/inbound/public-http/http/site/form-render.ts:383` —
  `/(\s)value=(["'])[^"']*\2/i`. `[^"']*` rejects *both* quote characters, so `value="Don't
  panic"` and `value='say "hi"'` never match and fall to the append branch (`:388-390`).

**Failure scenario:** theme template `<input name="q" value="Don't know">`; visitor types "hello",
another field fails validation → the re-rendered tag carries two `value` attributes and the browser
honours the first: the visitor sees "Don't know" again and their text is lost from that field.
`escapeHtml` (`:155`) does not escape `'`, so nothing else guards this. Fix: `("[^"]*"|'[^']*')`.

---

## Checked and found sound (no finding)

- **Media gate** (`e3f1aabb`, `a5c9bac8`): the "unreferenced → allow" default is a documented
  product decision (`media-rendition.ts` decision-function doc, share-image/theme-marker
  counter-examples); both `/m/` routes share `resolveMediaAccessDecision`; the original-video
  route always stamps `private, no-store` (`routes/media/original.ts:138`), so the gated-200 cache
  defect has no sibling arm.
- **`pages.edit_html`** (`45ab6319`, `db83fdaf`): owner holds the `"*"` wildcard
  (`@jini-ai/cms/identity/seed.ts:286`), admin gets the builtin grant, `CreatePostInput`/
  `UpdatePostInput` carry no `bodyHtml` (`post.ts:602-619`), route `Pick`s and the `content_post_*`
  tools exclude it; the only HTML write arms are `PUT …/pages/:id/html` and `pages_write_html`,
  both gated. No raw-HTML node type exists in the doc renderer.
- **Boot schema guard** (`4dfbfe80`, `66e14fe5`): `index.ts:276` runs before
  `createSqliteRouteDeps()` at `:278`; `app.ts:1388`'s module-load `createApp()` is the hermetic
  in-memory root; `tovu serve` reaches `compareSchemaVersion` (`boot-site-dir.ts:80`) before
  `openContentDb` (`:85`).
- **Daemon vs API on chat.db**: `createSqliteRouteDepsForWorkspace` (`deps.ts:1515-1527`)
  delegates to `createSqliteRouteDeps`, so both processes open the same sidecar; the daemon gets
  `TOVU_SITE_DIR` (`daemon-supervisor.ts:398`) and the desktop shell deletes `TOVU_CONTENT_DB`
  (`tovu-server.cjs:230`).
- `isDaemonProcessForWorkspace` (`056135db`) has no caller — deliberate, documented as "for a
  FUTURE reconciler"; not the unwired-sink pattern.
- **Admin dev proxy** (`4f259b5b`): GET + upgrade only, hop-by-hop headers stripped, upstream
  error → 502, SEA runtime excluded; the Vite `/@fs/` exposure is unchanged from the previous
  redirect.
- **Trashed-post exclusion** is present at every public lister touched or adjacent:
  `routing.ts:155`, `sitemap.ts:104`, `seo.ts:172`, `media-rendition.ts:210`, all `post.ts`
  public readers (`:1063-1190`); `llms.txt` derives from the same `computeIndexableEntries`.
- **Content API** `get-by-slug.ts:87` sends `private, no-store` on every 200 (over-conservative,
  safe). **robots.txt** builds its `Sitemap:` from `originRegistry`, not the Host header.
- **Theme file store**: all five mutators route stat through `statOrThemePathError`
  (`theme-files.ts:422-428`, any error → `ThemePathError`); `listThemeFiles`/`walkThemePackage` use
  `lstat`. **Backfill scripts**: all 13 scripts that open `content.db` also have a read-only
  dry-run open.
- **Embed header** (`fc1a506a`): `renderHtmlPageBody` is the single substitution point and all
  three callers (`render.ts:1398`, `pages.ts:663, 817`) go through it.
- `usePageEditor.save` generation guard (`use-page-editor.hooks.ts:421-455`), `useExternalMcp`
  per-id write chain, desktop `keyed-serializer.cjs`, `selftest-tracker.cjs`, and
  `site-registry.cjs`'s reconcile (command-line + `ppid == 1` proof before SIGTERM/SIGKILL) read
  correctly.
- The two "binary" source files (`split-chat-data-into-chat-db.ts`, `builtin-role-grants.ts`)
  contain one deliberate `"\0"` key separator each — legal, but git shows them as binary and `grep`
  skips them, so every grep-based sweep (dead-path, coverage-integrity) silently ignores both.
  Use a visible separator.

## Not covered

~200 `agentHandle` tagging commits; ~100 docs/content/design/landing commits; test-only and
refactor commits; the ~15 admin stale-settlement hook fixes other than the three named above; the
desktop shell beyond `site-registry.cjs`/`keyed-serializer.cjs`/`selftest-tracker.cjs` (the Sep 6
reports cover `main.cjs`); voice input / speech helper; Sites/SEO/Collections UI screens; theme CSS
and WCAG commits; HTTP-client SSRF fixes (memory records them verified); source-control fixes other
than `f1db9694`; deployment secret trims; dead-path-sweep and coverage scripts; evals. No tests,
`tsc`, builds, browsers or servers were run.
