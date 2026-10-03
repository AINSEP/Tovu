# EmDash vs Tovu — what to learn (2026-09-28)

Read-only comparison. Input: `reports/2026-09-28-emdash-map.md` (EmDash HEAD `0e8977c`). EmDash paths are relative to
`/Users/la/Programming/OSS-Repos/emdash`; Tovu paths relative to `/Users/la/Programming/Tovu` unless they start with `Jini/`.
Every Tovu claim below was spot-checked in source today; EmDash claims marked (map) were taken from the map without re-reading.

## 1. Verdict

EmDash overlaps Tovu on the CMS core (pages/posts/collections, revisions, media, plugins with capabilities, MCP), but the
two point in different directions. **EmDash is a WordPress replacement for developers**: an Astro integration, deployed
to Cloudflare or a Node server, with a signed public plugin registry, isolate-sandboxed plugins, and an MCP server so
*outside* agents (Claude, ChatGPT, Codex) can drive the site. It has **no built-in assistant, no desktop app, and no
agent-plugin concept** (no LLM SDK in `packages/core` or `packages/admin`; AI code exists only in `apps/labeler` and the
legacy `packages/marketplace` audits). **Tovu is an owner-first, own-your-directory CMS with the assistant inside it**:
Electron desktop, a built-in chat agent that edits the site, agent plugins that wire external MCP servers with
Confirm/Cancel cards. EmDash is ahead on storage portability, plugin isolation and distribution trust; Tovu is ahead on
the in-product agent, owner UX and desktop. The storage layer is the most useful thing to learn from right now: EmDash
already runs one codebase on SQLite, libSQL, D1 and Postgres, which is exactly the problem the PGlite work faces.

## 2. Side by side

| Area | EmDash | Tovu |
|---|---|---|
| Storage | Kysely; dialect `"sqlite" \| "postgres"` (`packages/core/src/db/adapters.ts:24`); config-time descriptors `sqlite()` `:87`, `libsql()` `:112`, `postgres()` `:164`, loaded at runtime; D1/Hyperdrive/DO in `packages/cloudflare/src/index.ts`. **One** migration set for all dialects via helpers (`packages/core/src/database/dialect-helpers.ts`). Explicit transaction handle (`database/transaction.ts`). | Drizzle over sync better-sqlite3; 54 `*.sqlite.ts` adapters behind async ports; no Postgres runtime or migrations (`ADS-memory/reports/2026-09-27-sqlite-lockin-audit-and-storage-adapter-plan.md` §0, §2). PGlite prototype in progress: `apps/website/src/platform/db/pglite/content-store.ts` (schema built once from `schema.postgres.ts`, AsyncLocalStorage transaction executor, "no Postgres migrations yet", header lines 11-30). |
| Content model | Schema in DB (`_emdash_collections`/`_emdash_fields`); each collection is a real table `ec_<slug>` with typed columns; `ALTER TABLE` on field add (`packages/core/src/schema/registry.ts:334,1870`; types `schema/types.ts:80`). Portable Text rich text. | Fixed tables for posts/pages; custom collections = `entries` rows with a JSON `fieldsJson` queried by `json_extract` (`apps/website/src/features/entries/repo.sqlite.ts:91`); content-type defs in `content_types` (`features/content-types/repo.sqlite.ts`). |
| Admin | React SPA driven by `GET /_emdash/api/manifest` (`packages/core/src/astro/routes/api/manifest.ts`); Lingui i18n (map). | React + Vite SPA `apps/admin`, plus assistant dock (`apps/admin/src/components/AssistantDock/AssistantDock.tsx`). |
| Plugins / sandbox | Native (in-process) + sandboxed: V8 isolates via Worker Loader (CF) or a `workerd` sidecar on Node (`packages/workerd/src/sandbox/runner.ts:1-18`), env scrubbed to an allowlist (`:84`), Unix-socket back-channel (`:101,899`). Every host call checks a capability (`packages/workerd/src/sandbox/bridge-handler.ts:478-613`), network limited to `allowedHosts` (`:2218-2221`). ~28 capabilities (`packages/plugin-types/src/manifest-schema.ts:27-51`). Plugin data in one shared JSON document table + expression indexes (`packages/core/src/database/migrations/004_plugins.ts:16`, `packages/core/src/plugins/storage-indexes.ts`). | Site plugins run **in-process** via dynamic `import()` after SHA-256 integrity + SDK-range checks (`apps/website/src/features/plugin-runtime/loader.ts:1-35,103`); SDK-level capability stubs, 3 capabilities (`capability-sdk.ts:1-20`); setup/hook attach not called from `loadPlugin()` (loader header steps 4-5). Plugins create their own tables `p_<id>__*` with raw DDL/PRAGMA (`features/plugins/data-module.ts:445,494`). Agent plugins = folders of `plugin.json` + `mcp.json` + skills (`content/agent-plugins/supabase/`). |
| Registry / distribution | atproto signed records; install verifies publisher PDS records, checksum, provenance, minimum release age, and a **capability-consent hash** that must match what the admin saw; updates re-consent when permissions grow (`packages/core/src/api/handlers/registry.ts:4-7,401-452,929-1008`). | Content-addressed packages (`packages/sha256/<digest>/`), install with pinned SHA-256 or explicit trust-on-first-use (`apps/website/src/features/agent-plugins/install-from-url.ts:1-22`, `bundled-digests.ts`). No signatures verified: manifest has an unused `provenance.signature` field (`features/plugin-runtime/manifest.ts:78`). No consent diff on update found. |
| AI / MCP | **Server**: stateless Streamable HTTP MCP at `/_emdash/api/mcp`, ~72 tools (`packages/core/src/mcp/server.ts`, 73 `registerTool(` sites). Wrapper fences every tool not `readOnlyHint` against a site-write fence during imports/exports (`:862-906`) — a data-consistency lock, **not** a human confirmation. Plugin MCP tools gated by `mcp:tools:<plugin>` scope + RBAC permission (`:908-935`). No built-in assistant. | **Client + built-in agent**: assistant runs agent CLIs through the Jini daemon; Tovu tools reach a spawned CLI via an internal stdio `jini-mcp` bridge authed by a daemon token (`apps/website/src/assistant/mcp-injection.ts:1-20`). External MCP servers consumed with allowlist/"may write" grants and Confirm/Cancel cards (`assistant/external-mcp-call-confirmation.ts`, `features/agent-plugins/federate-mcp.ts`). **No public MCP endpoint** for outside agents (the only MCP server SDK import across Tovu + Jini is `Jini/packages/mcp/src/server/tool-server.ts`, stdio). |
| Auth / roles | Passkey-first, magic link, OAuth login, atproto, CF Access; 5 numeric roles + permission map (`packages/auth/src/types.ts:10-14`, `rbac.ts`); API tokens with scopes (`packages/auth/src/tokens.ts:45-62`); EmDash is an OAuth **authorization server** for MCP clients (`packages/core/src/astro/routes/api/oauth/`, `well-known/oauth-protected-resource.ts`). | Password login; roles owner/admin/editor/viewer with granular policies (`apps/website/src/features/identity/builtin-role-grants.ts:62`); API keys (`features/identity/api-key-types.ts`); members use magic link (`server/inbound/admin-http/routes/members/request-magic-link.ts`). No OAuth server. |
| Themes | A theme is a full Astro project scaffolded once; no runtime theme switching (map, docs `themes/overview.mdx`). | Runtime-switchable themes in tiers static/declarative/templated(Liquid)/handlebars, content separate from presentation (`content/themes/README.md`). |
| Media | `Storage` interface: local, S3/R2; signed-upload-URL flow; usage tracking (map; `packages/core/src/storage/types.ts`). | Local `uploads/` + S3 blob store (`apps/website/src/features/media/blob-store.s3.ts`), versioned media repo, AI media generation (`features/media-generation`). |
| Deploy targets | Cloudflare Workers (D1/R2/KV) or Node + SQLite/libSQL/Postgres; Docker (map). | Local/desktop; Docker; Fly/Railway/Render configs (`apps/website/src/features/deployments/deploy-config-{fly,railway,render}.ts`); static export. |
| Desktop | None (no electron/tauri anywhere in the graph). | Electron app `apps/desktop`. |

## 3. Who is ahead where

**EmDash ahead**
- Real multi-dialect storage today, one migration set, tests that run each suite on SQLite and (opt-in) Postgres (`packages/core/tests/utils/test-db.ts:574`).
- Plugin isolation: separate V8 isolate with CPU/memory/subrequest/wall limits (`packages/core/src/plugins/sandbox/types.ts:25-40`). Tovu site plugins run with full Node access.
- Plugin data portability: one JSON document table works on every dialect; Tovu's `p_<id>__*` DDL is the hardest Postgres blocker (lock-in audit §1).
- Supply-chain trust: signed records, consent hash, minimum release age.
- Outside-agent access: public MCP + OAuth server + scoped tokens; per-plugin MCP scopes.
- Logical, dialect-neutral site export/import with a write fence (`packages/core/src/transfer/fence.ts:1-9`) instead of file copies.

**Tovu ahead**
- Built-in assistant with human Confirm/Cancel cards, remembered approvals, external-MCP federation (EmDash has none of this in-product).
- Agent plugins (skills + MCP + connect cards) — no EmDash equivalent.
- Desktop app, own-your-directory model, runtime theme switching, AI media generation.
- Finer-grained admin roles/policies than EmDash's 5 fixed levels (EmDash is ahead on login methods).

## 4. Top 10 ideas to borrow (ranked by value / effort)

| # | What | EmDash source | Lands in Tovu | Effort | Risks |
|---|---|---|---|---|---|
| 1 | **`dialect-helpers` module** (PGLITE): `isPostgres(db)`, `currentTimestamp`, `binaryType` (blob/bytea), `jsonExtractExpr`, `tableExists`/`indexExists`/`listTableColumns` (information_schema vs `pragma_table_info`), `compoundSelectLimit`, `executeAtomicBatchIfSupported`. Replaces the `PRAGMA`/`sqlite_master`/`json_extract` sites the audit lists. | `packages/core/src/database/dialect-helpers.ts` (483 lines) | new `apps/website/src/platform/db/dialect.ts`; first callers `features/entries/repo.sqlite.ts:91`, `features/plugins/data-module.ts:458,494,622`, `features/webhooks/site-key-sources.ts:261` | S | Drizzle, not Kysely: helpers become `sql` fragments; detect dialect from the store, not an adapter class. |
| 2 | **Explicit transaction handle + nested reuse** (PGLITE): `withTransaction(db, trx => …)`; if `db.isTransaction`, run `fn(db)` so nested repo calls join the outer transaction. | `packages/core/src/database/transaction.ts:24-66` | Compare with `platform/db/pglite/content-store.ts` ALS executor. The ALS approach solves the same deadlock without touching call sites — keep it, but copy the **nested-call rule** (a nested `transaction()` must join, not open a second one). | S | Two styles (ALS vs explicit handle) = confusion; pick one per store. |
| 3 | **Dual-dialect test matrix** `describeEachDialect` (SQLite always, Postgres when env set). | `packages/core/tests/utils/test-db.ts:560-586` | Tovu contract suites (settings/forms/commands/outbox/webhooks; lock-in audit §1 "Tests") — run them on SQLite + PGlite. PGlite needs no server, so no env gate. | S | PGlite boot cost per test; share one instance per file. |
| 4 | **Plugin storage as one document table** `_plugin_storage(plugin_id, collection, id, data JSON)` + per-plugin expression indexes, validated identifiers. Removes the `p_<id>__*` raw-DDL blocker. | `packages/core/src/database/migrations/004_plugins.ts:14-30`, `packages/core/src/plugins/storage-indexes.ts`, `storage-query.ts` | `apps/website/src/features/plugins/data-module.ts` (new mode beside table mode); `@tovu/sdk` storage API | M-L | Store/deploy/lipay use relational tables; needs a migration path or both modes. Behavior change — owner call before changing defaults. |
| 5 | **Migration policy `auto` / `check` / `manual`** (+ `PendingMigrationsError`), separate dev/runtime values. | `packages/core/src/database/migrations/policy.ts:6-60` | `apps/website/src/platform/db/sqlite/content-db.ts` migrator entry (Tovu auto-applies today); PGlite store | S | Low; default stays `auto`. |
| 6 | **Fail-fast Postgres migration lock** (`pg_try_advisory_xact_lock` + poll) and **pool error redaction** (strip URLs/credentials from pg errors). | `packages/core/src/database/pg-migration-lock.ts:1-25`, `packages/core/src/db/postgres.ts:13-33` | Future `platform/db/postgres/*` (Supabase/hosted); redaction also fits `features/database-transfer/postgres-target.ts` (psql stderr) | S | Not needed for single-process PGlite. |
| 7 | **Install consent hash**: admin approves a manifest's capability set + MCP tools; install/update refuses if the manifest hash differs; updates that widen permissions re-ask. | `packages/core/src/api/handlers/registry.ts:82-126,929-1008,1248` | `apps/website/src/features/agent-plugins/install.ts` / `set-enabled.ts` (record approved `mcp.json` allow/write lists; re-ask on growth) | M | Must reuse the existing Confirm/Cancel card (one approval rule), not a new dialog. |
| 8 | **Public MCP endpoint with OAuth + scoped tokens** so Claude/ChatGPT/Codex can drive a Tovu site; write tools fenced; plugin tools gated per plugin scope. | `packages/core/src/astro/routes/api/mcp.ts`, `mcp/server.ts:852-935`, `packages/auth/src/tokens.ts:45-62`, `astro/routes/api/oauth/` | New route in `apps/website/src/server/inbound/public-http`; reuse Tovu tool registrations + `authorize()`; `Jini/packages/mcp` | L | Security surface (owner ruling). Confirm cards can't render in an outside client — decide what the approval rule means there. |
| 9 | **Logical site transfer with write fence + write epoch** (export stays consistent without file snapshots; import fences writes). Portable replacement for `VACUUM INTO`/`.backup()`. | `packages/core/src/transfer/` (`fence.ts`, `export/`, `import/`, `format/`) | `features/site-export`, `features/site-backup`, `platform/site-dir/duplicate-content-db.ts` (lock-in blocker #3) | L | Large; only once Postgres is a real target. |
| 10 | **Out-of-process plugin sandbox** (workerd sidecar, env allowlist, per-plugin token, capability-checked bridge, limits). | `packages/workerd/src/sandbox/{runner,bridge-handler,capnp}.ts` | `apps/website/src/features/plugin-runtime/loader.ts` step (3) for third-party plugins | L | Adds a native `workerd` binary to the desktop bundle; worth it only once third-party site plugins exist. |

Cheap extras: per-route query-count snapshots in CI (`scripts/query-counts.snapshot.{sqlite,d1}.json`, map), and FTS as an
explicit no-op on non-SQLite dialects (`packages/core/src/search/fts-manager.ts:79,93`) — the same stance Tovu can take for
post search on PGlite until a `tsvector` version exists.

**Directly helps the PGlite work now:** #1, #2 (nested-call rule), #3, #5. #4 unblocks plugin tables later; #6 and #9 matter once real Postgres/Supabase is a target.

## 5. MIT licence

EmDash is MIT, "Copyright 2026 Cloudflare Inc." (`LICENSE:1-3`). Tovu is Apache-2.0 (`LICENSE`, `NOTICE`). MIT code may be
copied, modified and shipped inside an Apache-2.0 project. The one condition: keep the MIT copyright notice and
permission text with any substantial copied portion.
- Copied or closely adapted file: header `Portions adapted from EmDash, Copyright 2026 Cloudflare Inc., MIT License.` and an EmDash entry with the full MIT text in `NOTICE`'s third-party section.
- Re-implementing an idea in our own code (most of §4) needs no attribution; a "pattern from EmDash" comment is courtesy.
- Do not use the EmDash name or Cloudflare marks for Tovu features.

## 6. Map corrections

Checked 13 claims against source; all substantially right. Corrections:
1. `db/adapters.ts` line numbers: `sqlite()` `:87`, `libsql()` `:112`, `postgres()` `:164` (map: `:146/:171/:223`); the deletion-guard types are at `:26-50`, not `:82-113`.
2. "Applies pending migrations at request time" is only the default. It is a policy: `auto` (run), `check` (throw `PendingMigrationsError`), `manual` (skip), with separate dev/runtime values (`packages/core/src/database/migrations/policy.ts:6,52-64`).
3. Capability list incomplete: also `admin.editor-draft:read`, `admin.editor-draft:patch`, `hooks.content-policy:register` (`packages/plugin-types/src/manifest-schema.ts:27-51`).
4. The MCP "write fence" is the site transfer/media-activation fence (blocks writes while an import runs, bumps an export's write epoch), not an approval step (`packages/core/src/mcp/server.ts:862-895`, `transfer/fence.ts:1-9`).
5. Tool count: 73 `registerTool(` sites in `mcp/server.ts`, one of them the plugin loop, so ~72 core tools (map: "~75").
6. Workerd back-channel is a Unix socket **with TCP fallback on Windows** (`packages/workerd/src/sandbox/runner.ts:101-102,899-906`); each plugin gets its own auth token encoding id + capabilities (`:14-17`).
7. Missing from the map but decision-relevant: EmDash has no Postgres-specific migrations — one set uses `dialect-helpers.ts`; plugin data lives in one `_plugin_storage` JSON table, not per-plugin tables.
