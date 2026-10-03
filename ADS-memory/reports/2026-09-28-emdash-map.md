# EmDash — factual map (2026-09-28)

Repo `/Users/la/Programming/OSS-Repos/emdash`, HEAD `0e8977c`. Read-only survey; facts only (no Tovu comparison).
cbm project name: **`Users-la-Programming-OSS-Repos-emdash`** (moderate mode; 32,325 nodes / 99,955 edges; `docs/`, `scripts/`, `e2e/`, `fixtures/`, `i18n/` excluded by the indexer).
Paths below are repo-relative. "Docs:" = `docs/src/content/docs/…`. `[unverified]` = read from docs/comments, not traced in code.

## 1. What it is
- "Agent-portable reimplementation of WordPress on Astro" (`package.json` description). Full-stack TypeScript CMS that runs **inside** an Astro app as an integration; admin + REST + MCP are injected routes, not a separate service (Docs: `concepts/architecture.mdx`).
- Pitch: WordPress ideas (extensibility, admin UX, plugin ecosystem) with plugins sandboxed in Worker isolates with capability manifests (`README.md`).
- Stack: TypeScript, Astro ≥6 (`output: "server"`), React ≥18 admin SPA, Kysely, Zod, TipTap/ProseMirror editing Portable Text, MCP TS SDK, atproto (`@atcute/*`) for the plugin registry (`packages/core/package.json` deps/peers).
- Deploy targets: Cloudflare Workers (D1 + R2 + KV, Worker Loader for sandbox) or any Node server with SQLite/libSQL/Postgres (`README.md`, `packages/cloudflare/src/index.ts`, `packages/core/src/db/adapters.ts`). `Dockerfile` + `compose.yaml` present at root.
- License: MIT, © 2026 Cloudflare Inc. (`LICENSE`). Author field: Matt Kane. On 1.x, backwards-compat policy is strict (`AGENTS.md` Rules).

## 2. Package map
pnpm monorepo (`pnpm-workspace.yaml`).

| Package / app | Purpose |
|---|---|
| `packages/core` (npm `emdash`) | The CMS: Astro integration, runtime, API routes + handlers, DB/migrations, schema registry, media, search, MCP server, plugin host, CLI (`bin: emdash`, `em`) |
| `packages/admin` | React SPA admin (TanStack Router/Query/Table, Kumo design system, Lingui, TipTap) |
| `packages/auth` | Passkey-first auth, RBAC (`src/rbac.ts`), API tokens/scopes, magic link, invites, OAuth consumer, Kysely adapter |
| `packages/auth-atproto` | AT Protocol ("Atmosphere") login provider |
| `packages/blocks` | Declarative plugin UI blocks (Block-Kit-style JSON UI rendered by admin) for sandboxed plugins |
| `packages/cloudflare` | CF adapters: D1 / D1-REST / Hyperdrive / Durable Object SQL DBs, R2 storage, KV object cache, CF Access auth, Worker Loader sandbox, CF Images/Stream media, CF email, AI Search/Vectorize plugins, playground/preview DOs |
| `packages/workerd` (`@emdash-cms/sandbox-workerd`) | Node-side plugin sandbox: spawns `workerd` (Miniflare in dev) |
| `packages/plugin-types` | Manifest contract: capability vocabulary, hook names, route/MCP entries (Zod: `src/manifest-schema.ts`) |
| `packages/plugin-cli` | `emdash-plugin` CLI: init/build/dev/bundle/publish, registry search, atproto identity |
| `packages/plugin-test` | workerd-backed Vitest host for sandboxed plugins |
| `packages/plugins/*` | First-party plugins: ai-moderation, api-test, atproto, audit-log, color, embeds, field-kit, forms, marketplace-test, mcp-smoke, sandboxed-test, webhook-notifier |
| `packages/marketplace` | LEGACY standalone CF Worker marketplace (discovery/publish/moderation, Workers-AI code+image audits); superseded by registry (Docs: `plugins/migrate-from-marketplace.mdx`) |
| `packages/registry-client` / `-lexicons` / `-loader` / `-moderation` / `-verification` | atproto registry: client + credential store, generated lexicon types (`com.emdashcms.experimental.*`, marked EXPERIMENTAL), Astro live loader, label/visibility policy, verification primitives |
| `packages/create-emdash` | `npm create emdash` scaffolder |
| `packages/gutenberg-to-portable-text`, `contentful-to-portable-text` | Importers' rich-text converters |
| `packages/x402` | x402 payment-protocol integration for Astro sites |
| `packages/atproto-test-utils` | In-memory MockPds/Jetstream/DID resolver for tests |
| `apps/aggregator` | Registry aggregator: indexes package records via Jetstream + PDS-verified ingest, XRPC reads |
| `apps/labeler` | Metadata-only moderation labeler for registry |
| `apps/plugins-site` | plugins.emdashcms.com catalog site [unverified: purpose from docs] |
| `apps/release-action` / `release-service` / `release-verifier` | GitHub Action + CF Workers for delegated, verified plugin releases (spec: `docs/technical-specs/delegated-release-service*.md`) |
| `templates/*` | blank, blog, marketing, portfolio, starter — each with a `-cloudflare` variant |
| `demos/*` | cloudflare, playground, plugins-demo, postgres, preview, simple |
| `infra/*` | Demo/ops workers (blog-demo, cache-demo, discord-bot, do-demo, emdash-bot, flue-review, perf-monitor) |
| `skills/` | Agent skills (see §5) |
| `docs/` | Starlight docs site (+ `docs-mcp.mdx`) |

## 3. Runtime

### Request / render path
- Integration `packages/core/src/astro/integration/index.ts` injects routes via `injectRoute` (`integration/routes.ts`) and virtual modules `virtual:emdash/{config,dialect,admin-registry,plugins,media-providers}` (`integration/virtual-modules.ts`).
- Middleware order (`integration/index.ts:348-371`): optional user `middleware.outer` → optional playground → `emdash/middleware` (runtime init, `astro/middleware.ts:639`) → redirect → setup → auth (setup+auth skipped in playground) → media-usage-write-fence → request-context (ALS).
- Middleware opens DB/storage and **applies pending migrations at request time** before routes run (Docs: `contributing/architecture.mdx`) [unverified in code].
- Public pages: Astro **Live Content Collections**. `src/live.config.ts` registers one `_emdash` collection with `emdashLoader()`; pages call `getEmDashCollection("posts")` / `getEmDashEntry()`; loader maps to `ec_posts` via Kysely with status/locale/pagination rules, then bylines + taxonomy terms are joined (`packages/core/src/loader.ts`, `query.ts`; Docs: `contributing/architecture.mdx` "Request paths").
- Preview/edit mode via request context so the same query functions return drafts (`src/preview/`, `src/visual-editing/` — toolbar + editable annotations).
- API: routes `packages/core/src/astro/routes/api/**` are thin; business logic in `src/api/handlers/*.ts` returning `ApiResult<T>`; helpers `apiError`, `parseBody(zod)`, `unwrapResult`, `requirePerm` (`AGENTS.md` API Routes). CSRF: all writes need `X-EmDash-Request: 1`. Lists return `{items,nextCursor}`.
- Central orchestrator `packages/core/src/emdash-runtime.ts` (6,323 lines).
- Perf discipline: per-request `requestCached`, `after()` deferral (waitUntil), query-count snapshots per route in CI (`scripts/query-counts.snapshot.{sqlite,d1}.json`); D1 Sessions API read replicas for anonymous reads (`AGENTS.md` Performance).

### Admin app
- `packages/admin` React SPA at `/_emdash/admin/*`, shell served by Astro (`astro/routes/admin.astro`). TanStack Router/Query/Table, Kumo (Cloudflare design system), Phosphor icons, dnd-kit, TipTap.
- **Manifest-driven**: fetches `GET /_emdash/api/manifest` (collections, fields, plugins, taxonomies, auth mode) and builds nav + field editors; schema changes appear without rebuild (Docs: `contributing/architecture.mdx`).
- Native plugin admin React components statically bundled via `virtual:emdash/admin-registry`; sandboxed plugins declare `admin.pages`/`widgets` in manifest and render via `@emdash-cms/blocks` [partly unverified].
- `yjs`, `y-protocols`, `@tiptap/extension-collaboration` are admin deps but a grep of `packages/admin/src` found no usage [unverified whether collab editing exists].

### Content model / schema
- Schema lives in the DB: `_emdash_collections` + `_emdash_fields`; each collection gets a **real SQL table `ec_<slug>`** with typed columns (not EAV), managed by `SchemaRegistry` (`packages/core/src/schema/registry.ts`). Admin field add → insert field row → `ALTER TABLE` add column (+index) → regen dev types.
- Standard columns: id (ULID), slug, status, author_id, primary_byline_id, created/updated/published/scheduled/deleted_at, version, live_revision_id, draft_revision_id, locale, translation_group; `UNIQUE(slug, locale)` (Docs: `contributing/architecture.mdx`; `AGENTS.md` Content Tables).
- Field types (`schema/types.ts` `FIELD_TYPE_TO_COLUMN`): string, text, number, integer, boolean, datetime, select, multiSelect, portableText, image, file, reference, json, slug, url, repeater, blocks.
- Validation: Zod schema generated from live field defs (`schema/zod-generator.ts`).
- Rich text stored as Portable Text; TipTap editor converts PT↔ProseMirror; unknown blocks preserved read-only.
- Revisions (`revisions` table, `database/migrations/001_initial.ts`), drafts vs live revision, scheduled publish (`scheduled-publish.ts`), soft delete/trash, i18n row-per-locale (migration `019_i18n.ts`).
- Other domains in core: bylines, taxonomies, menus, widgets/widget-areas, sections, redirects, comments, settings (`options` table, `site:` prefix), SEO, sitemap/robots routes.
- Seeds: `seed/seed.json` declares collections/fields/settings/taxonomies/menus/content; applied once by setup wizard (Docs: `themes/seed-files.mdx`, `themes/overview.mdx`).
- Import: pluggable `ImportSource` (WXR, WordPress connector plugin, REST probe) (`src/import/`); site transfer export/import with staging + fence (`src/transfer/`).
- Search: SQLite FTS5 only; on other dialects FTS manager is a no-op (`search/fts-manager.ts:79,93`). CF adds AI Search / Vectorize plugins (`packages/cloudflare/src/plugins/`).

### Storage layer (DB) — abstraction
- Kysely everywhere. Dialect type is only `"sqlite" | "postgres"` (`packages/core/src/db/adapters.ts`).
- Config-time adapter functions return **serializable descriptors** `{ entrypoint, …config }`; the runtime dynamically loads the entrypoint to build the dialect (`db/adapters.ts:146 sqlite()`, `:171 libsql()`, `:223 postgres()`; each also names a separate migrations entrypoint). Exposed to runtime via `virtual:emdash/dialect`.
- Cloudflare descriptors: `d1()`, `hyperdrive()` (Postgres via Hyperdrive), `durableObjects()` (DO SQLite), `previewDatabase()`, `playgroundDatabase()` (`packages/cloudflare/src/index.ts:287-471`); D1 has coalescing + session-guard + REST dialect (`packages/cloudflare/src/db/`).
- Descriptors may export capability hooks like an atomic collection-deletion guard (`db/adapters.ts:82-113`).
- Migrations: 89 forward-only, statically imported in `database/migrations/runner.ts` (`StaticMigrationProvider`, no auto-discovery for Workers bundling); migration locks for PG (`database/pg-migration-lock.ts`). Rules: immutable once shipped, restartable `up`, expand/contract, test every dialect (`AGENTS.md` Migrations).
- Repositories under `database/repositories/`; `FindManyResult<T>` cursor pagination.
- Object cache: memory (`internal/object-cache/memory`) or CF KV (`kvCache()`).

### Media
- `Storage` interface: upload/download/delete/exists/list/getSignedUploadUrl/getPublicUrl (`packages/core/src/storage/types.ts:157-199`). Impl: `LocalStorage`, `S3Storage` (R2/AWS) in core; native R2 binding in `packages/cloudflare/src/storage/r2.ts`. Same descriptor pattern (`astro/storage/adapters.ts`).
- Upload flow: `POST /_emdash/api/media/upload-url` creates pending item → client uploads to signed URL (S3) or EmDash streaming endpoint (R2/local) → `POST /media/:id/confirm` validates, marks ready (Docs: `contributing/architecture.mdx`).
- `media` table + storage; usage tracking + write fence (`media/usage`, middleware `media-usage-write-fence`); image endpoint, responsive/blurhash placeholders, focal point (`src/media/`); external media providers (CF Images, CF Stream) via `virtual:emdash/media-providers`.

### Auth / roles
- Passkey-first + magic link + invites + signup + OAuth login providers (GitHub, Google) + atproto + CF Access (`packages/auth/src`, `core/src/astro/routes/api/auth/`, `packages/cloudflare/src/auth/`).
- Roles numeric: SUBSCRIBER 10, CONTRIBUTOR 20, AUTHOR 30, EDITOR 40, ADMIN 50 (`packages/auth/src/types.ts`). **Permission-based** checks: `Permissions` map permission→min role (`packages/auth/src/rbac.ts:11-100`), e.g. `content:edit_own` AUTHOR, `schema:manage`/`plugins:manage` ADMIN. Routes call `requirePerm` / `requireOwnerPerm`.
- API tokens with scopes (`packages/auth/src/tokens.ts:45-62`): content/media/schema read/write, taxonomies/menus/settings, `mcp:tools`, `mcp:tools:<plugin>`, transfer scopes, `admin`.
- EmDash is itself an **OAuth authorization server** for MCP clients: `/oauth/authorize`, `/oauth/register` (dynamic client registration), token/refresh/revoke, device-code flow, `/.well-known/oauth-protected-resource` (`core/src/astro/routes/api/oauth/`, `well-known/`).

## 4. Plugin system + registry
- Two formats (Docs: `plugins/overview.mdx`, `plugins/installing.mdx`):
  - **Native**: npm package registered in `plugins: []`, `definePlugin()` (`core/src/plugins/define-plugin.ts:74`), runs in-process with full access; may ship React admin, Portable Text renderers, page fragments.
  - **Sandboxed (standard format)**: plain default export `{ hooks, routes }` (e.g. `packages/plugins/webhook-notifier/src/plugin.ts:228`) + `emdash-plugin.jsonc` manifest; runs in a sandbox runner; installed from registry (admin UI) or via `sandboxed: []` in config.
- Manifest (`packages/plugin-types/src/manifest-schema.ts:443-463`): id, version, `declaredAccess`, `capabilities[]`, `allowedHosts[]`, `storage` (named collections with indexes), `hooks[]`, `routes[]`, `mcp.tools[]` (name, description, route, permission, destructive, JSON input/output schema), `admin` (pages, widgets, editor panels/actions).
- Capabilities (`manifest-schema.ts:27-51`): network:request, network:request:unrestricted, content:read/revisions:read/write/publish/restore, comments:read/moderate, schema:read, taxonomies:read/write, bylines:read, redirects:read/write, media:read/bytes:read/metadata:write/write, users:read, email:send, hooks.email-transport/email-events/page-fragments:register. Deprecated aliases normalized (network:fetch, read:content, …).
- Hooks (30): plugin lifecycle (install/activate/deactivate/uninstall), content before/after save/delete/publish/schedule/unpublish/restore, media before/afterUpload, cron, email before/deliver/after, comment hooks, byline hooks, page:metadata, page:fragments (`manifest-schema.ts:107-137`).
- Plugin ctx API seen in use: `ctx.kv`, `ctx.storage.<collection>`, `ctx.http.fetch` (only with network capability), `ctx.log` (`webhook-notifier/src/plugin.ts`).
- Sandboxing: `SandboxRunner` interface — `isAvailable`, `isHealthy`, `load(manifest, code)` → instance with `invokeHook`, `invokeRoute`, `terminate` (`core/src/plugins/sandbox/types.ts:154-351`).
  - Cloudflare: Worker Loader (Dynamic Workers, Workers Paid, `LOADER` binding); plugin talks to host only through a `PluginBridge` service binding that enforces capabilities (`packages/cloudflare/src/sandbox/runner.ts` header, `bridge.ts`).
  - Node: `@emdash-cms/sandbox-workerd` spawns `workerd` (Miniflare in dev), env scrubbed to PATH/HOME/TMP/LANG, Unix socket back-channel, restart with backoff (`packages/workerd/src/sandbox/`; Docs: `deployment/plugin-sandbox.mdx`).
  - Limits per invocation: 50 ms CPU, 128 MB, 10 subrequests, 30 s wall (`core/src/plugins/sandbox/types.ts:31-40`; `cloudflare/src/sandbox/runner.ts:61-64`); CPU/subrequests enforced by isolate, wall-time by `Promise.race`.
- Distribution: **atproto-based registry** (default `https://registry.emdashcms.com`, browse at plugins.emdashcms.com). Publisher = atproto DID/handle; public name `@handle/slug`. Records are signed atproto lexicon records; aggregator indexes via Jetstream; labeler moderates metadata; delegated release service/action/verifier for CI-built releases with provenance (Docs: `plugins/registry.mdx`; `apps/*`).
- Install flow (`core/src/api/handlers/registry.ts:512-1149 handleRegistryInstall`, route `astro/routes/api/admin/plugins/registry/install.ts`): resolve package by DID+slug via aggregator XRPC (timeouts, bounded pagination) → pick release → read authoritative signed records from publisher PDS (aggregator copies not trusted) → env `requires` compat gate → minimum-release-age holdback → derive opaque pluginId, reject id conflicts → fetch bytes (aggregator cache or PDS) → verify signed checksum/archive/manifest (+provenance if required) → **capability consent gate** (manifest hash must match what admin consented to; plugin MCP tools need explicit consent) → store bundle in storage under registry prefix → upsert `_plugin_state` → run lifecycle + sync runtime (rollback on failure). Updates re-consent when permissions/MCP tools grow or a route becomes public.
- Uninstall keeps plugin storage by default.
- Legacy `marketplace` option still supported for existing installs.

## 5. AI / agent features
- **Built-in MCP server**, on by default at `/_emdash/api/mcp` (disable `mcp: false`), Streamable HTTP, **stateless** (new transport per request) (`core/src/astro/routes/api/mcp.ts`). Auth: OAuth or PAT bearer — admin browser session alone does not authenticate MCP (Docs: `guides/ai-tools.mdx`).
- `createMcpServer(pluginTools, request)` (`core/src/mcp/server.ts:852`, 3,955 lines): ~75 tools — content_* (list/get/create/update/delete/restore/permanent_delete/publish/unpublish/schedule/unschedule/compare/discard_draft/list_trashed/duplicate/translations), byline_*, schema_* (collections, fields, block types incl. versions), media_* (list/create/upload base64/get/update/delete/usage_repair), search, taxonomy_*, menu_*, revision_list/restore, settings_get/update, site_transfer/export/import_*.
- Wrapper on `registerTool` maps auth errors to structured `_meta.code` envelopes and applies a site write fence to every tool not annotated `readOnlyHint: true` (`mcp/server.ts:862-906`).
- **Plugins contribute MCP tools** declared in manifest `mcp.tools`, each bound to a plugin route + an RBAC permission; tools with unknown permissions are skipped (`mcp/server.ts:908`); gated by `mcp:tools:<plugin>` token scope and install consent.
- Docs show connecting Claude custom connector, ChatGPT dev mode, Codex CLI via OAuth (Docs: `guides/ai-tools.mdx`, `reference/mcp-server.mdx`). Docs site also has an MCP (`docs-mcp.mdx`) [unverified].
- CLI `emdash`/`em` (`core/src/cli/commands/`): content, schema, media, menu, taxonomy, search, seed, export-seed, migrate, secrets, site, login, init, doctor, import — agent-usable remote control of an instance.
- `skills/` (symlinked as `.claude/skills` and `.agents/skills`): building-emdash-site, creating-plugins, emdash-cli, wordpress-plugin-to-emdash, wordpress-theme-to-emdash, writing-emdash-docs, adversarial-reviewer, agent-browser, ux-acceptance-coordinator. First four are shipped for site builders/agents; the rest are contributor workflow.
- `AGENTS.md` (== `CLAUDE.md`) is a detailed agent-facing contributor guide. Repo also has `.opencode/`, `.agents/`.
- Plugins: `ai-moderation` (first-party), marketplace uses Workers AI for code/image audits.

## 6. Themes / templates
- A theme = a complete Astro project distributed as a `create-astro` template; **no runtime theme package or template hierarchy**; after scaffolding the files belong to the site (Docs: `themes/overview.mdx`).
- Layout: `astro.config.mjs`, `src/{components,layouts,pages,styles}`, `src/live.config.ts`, `seed/seed.json` (`package.json#emdash.seed`). Seed lookup: `.emdash/seed.json` → package.json path → `seed/seed.json` → built-in default.
- Templates: blank, blog, marketing, portfolio, starter (+ `-cloudflare` each) in `templates/`; synced to external repo by `sync-templates.yml`; screenshot pipeline `scripts/screenshot-all-templates.mjs`.
- WP theme porting guidance: Docs `themes/porting-wp-themes.mdx` + skill `wordpress-theme-to-emdash`.
- API route `astro/routes/api/themes/preview.ts` exists [unverified purpose].

## 7. Engineering patterns
- Tests: Vitest per package; core split `tests/{unit,integration,workerd}`; **no DB mocks** — real node:sqlite per test, opt-in Postgres parity (`EMDASH_TEST_PG`), `describeEachDialect` helper; Playwright E2E (`e2e/`, table + playground configs, axe-core a11y); browser tests for admin; UX acceptance via agent-driven journeys (`acceptance/`, skill). Regression test required for bug fixes when deterministic (`AGENTS.md` Testing).
- Lint/format: oxlint (type-aware, deny warnings), oxfmt + prettier; knip; TS 6 beta + `@typescript/native-preview`.
- SQL safety rules: never `sql.raw` interpolation; `sql.ref` for identifiers; `validateIdentifier` (`database/validate.ts`).
- i18n: admin via Lingui, 30+ locales incl. RTL (ar, fa), pseudo-locale mode, RTL-safe logical Tailwind rule; catalog extraction on merge (`auto-extract.yml`); docs translations tracked with Lunaria (`lunaria.config.ts`, `lunaria.yml`). Server errors English, stable SCREAMING_SNAKE codes.
- Content i18n: row-per-locale + `translation_group`.
- CI (`.github/workflows/`): ci, query-counts (+auto-apply), visual regression (+report/apply), env-types, format auto-apply, security-analysis, release via changesets, preview releases (pkg-pr-new), PR triage/sweep bots, CLA, review bots.
- Releases: changesets with a written standard (`.changeset/README.md`); PR template mandatory incl. AI disclosure.
- Singletons on `globalThis` via `Symbol.for` (Vite chunk duplication); secrets read `process.env` only, never `import.meta.env` (`config/secrets.ts`).
- Handlers are standalone functions `(db, …) => ApiResult<T>`; permissions centralized in `rbac.ts`.
