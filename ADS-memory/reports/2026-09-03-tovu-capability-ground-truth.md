# Tovu Capability Ground Truth — 2026-09-03

Purpose: ground-truth inventory of what Tovu (`/Users/la/Programming/Tovu`) can actually do today, for diffing against tovu.dev's public claims. Compiled by the codebase-analyzer subagent per `AI-Dev-Shop/agents/codebase-analyzer/skills.md` (loaded before work began).

Repo state: branch `restructure/apps-website-phased`, HEAD `9e416602`. Codebase Memory MCP project "Tovu" is indexed at this exact HEAD (55,394 nodes / 89,031 edges) — used for `get_architecture`/`search_graph` discovery; all SHIPPED/PARTIAL claims below are cross-checked against source via Read/Bash, not taken from the graph alone.

## Sampling Notice

**Read in full / grepped exhaustively:** `assistant/tool-registrations.ts` (the tool-registry assembly point, 679 lines, read in full); `capability-inventory.ts` (full); root `package.json` scripts; `Dockerfile` (full); `cli/program.ts` (full); DB `schema.ts` table list (full `sqliteTable` scan); ~20 of 22 `features/*/agent-tools.ts` catalogs (name+description extracted via script, several read raw for the ones the script mis-parsed); all `admin-http/routes/*` and `public-http/routes/*` directory listings.

**Sampled, not read in full:** individual admin route handler bodies (status inferred from route existence + tests + capability-inventory, not every handler read); `apps/admin/src/features/*` component internals (directory listing + a few files only); theme rendering internals (`static-render.ts`, `liquid-worker.ts`, etc. — listed and named, not read line-by-line); the `@jini-ai/cms`/`@jini-ai/core` external package internals that 7 domains' tool catalogs are re-exported from (identity, workspace, settings, entries, content-types, navigation/menus, media) — these live outside this repo's `apps/**`/`packages/**` scope, in the separate Jini monorepo, so their exact tool ids/descriptions are NOT verified here, only their existence and counts (from Tovu's own authoritative comment).

**Excluded:** `apps/admin` component-level UI code beyond directory structure; `development/scripts/*` beyond the ones cited; test files (existence checked, not read); `ADS-memory/` itself.

Confidence: Admin capabilities — High (route dirs + capability-inventory cross-checked). Agent tools — High for ~110 of the ~158 first-party tool ids (real descriptions read); Medium for the ~41 Jini-external ones (counted, not read) and a handful of demo/UI tools (named, description inferred from surrounding comment, not the tool's own file). Content model — High (capability-inventory.ts is a maintained, typed source of truth). Themes/rendering — Medium (file inventory, not full read). Deployment — High (Dockerfile + CLI + package.json all read directly). Extension surfaces — Medium-High.

---

## 1. Admin capabilities

Two independent listings agree closely: 35 route directories under `apps/website/src/server/inbound/admin-http/routes/`, and 30 feature directories under `apps/admin/src/features/`.

| Area | What it lets a user do | Status |
|---|---|---|
| analytics | View site analytics events (page views etc.), SqliteBufferSink-backed | SHIPPED |
| api-keys | Issue/revoke API keys for programmatic access (identity capability) | SHIPPED |
| assistant | Configure the in-admin AI assistant (settings, site credential, BYOK turn endpoint) | SHIPPED |
| change-sets | View/revert grouped content-change history (ADR-046 durable) | SHIPPED |
| comments | Moderate comments (queue, approve/spam/trash/restore), configure comments.* settings | SHIPPED |
| commerce | Products/orders/prices/webhook events (schema tables exist: `commerceOrders`, `commerceProducts`, `commercePrices`, `commerceWebhookEvents`) | PARTIAL — schema + routes exist; capability-inventory has no "commerce"/"store" production entry, only an "experimental" `store` spike (`features/plugins/store`) |
| connectors | Connect external services (OAuth-based; Composio callback route exists) | PARTIAL — public callback route shipped, admin config route shipped; breadth of connector catalog not fully sampled |
| content | Generic content operations | UNKNOWN — not individually sampled beyond dir existence |
| content-types | Define/manage custom content type schemas | SHIPPED (production, gated-mutations ceremony for structural changes) |
| database | DB health, schema drift, migrations, restore points (Database Timeline) | SHIPPED (critical capability) |
| database-recovery | Restore-point browsing/plan/execute ceremony | PARTIAL — `capability-inventory.ts` explicitly classifies `recovery` as `experimental`: "the restore ceremony runs... but does not physically overwrite content.db (no live-swap mechanism)" |
| deployments | Configure deployment environments/targets, trigger static export, view Dockerfile, publish | SHIPPED (5/5 tools wired per tool-registrations.ts header) |
| entries | Generic CMS entries CRUD (the content-type-agnostic record layer) | SHIPPED (critical) |
| external-mcp | Register/connect external MCP servers (stdio or OAuth/device-code) | SHIPPED |
| forms | Define forms, view/manage submissions | SHIPPED |
| integrations | Webhooks (subscriptions + delivery log) | SHIPPED, but `processDueDeliveries` worker "still not started anywhere" per capability-inventory — deliveries are recorded, not necessarily dispatched |
| marketplace | Browse/install themes and plugins | PARTIAL — `features/theme/marketplace.ts` exists; breadth not fully sampled |
| media | Upload/manage media assets, renditions, transforms | SHIPPED |
| members | Manage site members (visitor accounts, not admin users) | SHIPPED |
| menus | Manage navigation menus and location bindings | SHIPPED |
| newsletter | Campaigns, subscriber lists, subscriptions, send log | SHIPPED — but no agent-callable send/schedule tool exists by design (draft-only creation) |
| pages | Create/edit bespoke-HTML pages (distinct from Posts) | SHIPPED — `pages_write_html` tool confirms a real HTML write path exists (memory's "Posts have no HTML write path" is about Posts specifically, not Pages) |
| plugins | Discover/enable/disable installed plugins (Tier 1-3 system) | SHIPPED |
| posts | Create/edit/publish blog posts (Tiptap JSON body) | SHIPPED |
| presentation | Site-wide presentation/display settings | SHIPPED (optional capability) |
| recovery | (see database-recovery above — same underlying capability, two route surfaces) | PARTIAL |
| redirects | Manual redirect rules, hit stats, bulk import | SHIPPED — except `redirects_import` explicitly marked "NEVER agent-callable" |
| seo | Per-entry SEO overrides, site-wide SEO settings, sitemap regeneration | SHIPPED |
| settings | Workspace/global/user setting values | SHIPPED (critical) |
| site | Site-level admin operations | UNKNOWN — not individually sampled |
| skills | Manage installed agent skills | PARTIAL — memory notes "Skills user-installed, never bundled"; `features/skills/tool-registrations.ts` exists but not read in full |
| system | System-level admin operations | UNKNOWN — not individually sampled |
| taxonomy | Manage taxonomies/terms, tag entries | SHIPPED — "persists on Pages, renders only on static tier" per memory (not re-verified this pass) |
| themes | Browse/validate/edit theme files, switch active theme | SHIPPED |
| users | Manage admin/operator user accounts, roles, policies | SHIPPED (identity capability, critical) |
| widgets | Create widget instances, bind to regions, inline-embed in content | SHIPPED (12/12 tools wired) |
| workspace | Multi-tenant workspace management | SHIPPED (critical) |

Two admin-UI-only feature dirs have no matching admin-http route dir: `dashboard` (landing screen, aggregates other capabilities — SHIPPED as UI), `playground` (likely a dev/test surface — UNKNOWN), `security` and `authentication`/`auth` (likely map onto `users`/`identity` server-side — not separately verified).

## 2. Agent / AI assistant tools

**Correction to prior memory ("~24-25 registered agent tools"): the real number is roughly 6x that.** The authoritative source is `apps/website/src/assistant/tool-registrations.ts:1-148` (file header) and its `allToolContributors()`/`buildAssistantToolRegistrations()` (lines 566-678). Per the file's own maintained comment (updated 2026-09-03): **`buildAssistantToolRegistrations()` returns 154 distinct tool ids** as of a 2026-08-26 measurement, **plus at least 5 more added since** (`assistant_admin_screen_link`, `external_mcp_reauth_prompt`, `search_components`, `describe_component`, `assistant_ask_choice`) — so the live count is ~158-160, across **29 domains**. This is a maintained, self-auditing figure: the file throws at composition-root-boot time if any tool id collides across domains, and a separate script (`check:inventory`) cross-checks capability names against `deps.ts`/`app.ts`.

Where the tools live: most domains keep a static catalog in their own `features/<domain>/agent-tools.ts` (name/description/sideEffects/authorization/inputSchema, `AgentToolDefinition[]`), wired into the registry either directly (`DOMAIN_SLICES` array) or via an explicit-call registry (`tool-contribution-registry.ts`) to avoid import cycles — both paths are live production wiring, not dead code. **Seven domains' catalogs are NOT defined in this repo at all**: `identity` (15 tools), `workspace` (2-4), `settings` (4-8), `entries` (5), `content-types` (6-8), `menus`/navigation (5), `media` (4) are re-exported from the external `@jini-ai/cms` npm package (the separate Jini monorepo) — Tovu's own files here are thin re-export shims (e.g. `apps/website/src/features/identity/tool-registrations.ts:17-18`). That's ~41-49 of the ~158 tool ids whose exact descriptions live outside this repo's scope.

### Tool catalog by domain (name :: one-line description), extracted from source

**comments** (`features/comments/agent-tools.ts`, 7/7 wired):
- `comments_list_moderation_queue` :: Lists comments by moderation status, keyset-paginated. Read-only.
- `comments_get_settings` / `comments_update_settings` :: Read/patch the 6 comments.* settings.
- `comments_approve_comment`, `comments_mark_comment_spam`, `comments_trash_comment`, `comments_restore_comment` :: moderation ladder — all reversible. No `comments_purge` (irreversible) tool exists by design.

**database** (`features/database/agent-tools.ts`, 7/9 wired):
- `database_get_health`, `database_get_schema_state`, `database_list_pending_migrations`, `database_query_timeline`, `database_list_restore_points` :: read-only status/history.
- `database_plan_migrate_forward` :: previews a forward migration, no writes.
- `database_execute_migrate_forward` :: catalog entry exists but description says "NEVER agent-callable" — human-confirmation-only.
- `backup_create_restore_point` :: mints a restore point (shared id with Recovery's catalog — resolved by Recovery declaring it unwired).
- `database_get_restore_guidance` :: read-only deep-link to the Recovery UI.

**recovery** (`features/recovery/agent-tools.ts`, 5/7 wired): `backup_list_restore_points`, `backup_get_capabilities`, `backup_plan_restore` (read-only previews); `backup_execute_restore` (only runs with a human-minted token, never mints one itself); `recovery_get_status`; `recovery_resolve_deep_link`.

**redirects** (7/7 wired): `redirects_list`, `redirects_get`, `redirects_get_hits` (read); `redirects_create`, `redirects_update` (validated, cycle/dup-rejecting); `redirects_tombstone` (soft-delete); `redirects_import` — catalog entry present but "NEVER agent-callable".

**seo** (6/6 wired): `seo_get_entry_meta`, `seo_analyze_entry` (read); `seo_set_entry_overrides`, `seo_get_settings`, `seo_set_settings`, `seo_regenerate_sitemap`.

**forms** (6/6 wired): `forms_list_definitions`, `forms_create_definition`, `forms_update_definition`, `forms_set_definition_status` (no delete tool exists — disabling is the only retirement path), `forms_list_submissions`, `forms_get_submission`.

**members** (4/4 wired): `members_list`, `members_get_by_id`, `members_disable` (soft — no hard delete), `members_request_magic_link`.

**newsletter** (14/14 wired): list/get campaigns, lists, subscriptions, send log; `newsletter_create_campaign` (draft-only — **no agent-callable send/schedule tool exists**), `newsletter_update_campaign`, `newsletter_cancel_campaign`, `newsletter_pause_campaign` (stop-only, no resume tool), `newsletter_create_list`, `newsletter_archive_list`, `newsletter_create_subscription`, `newsletter_remove_subscription`, `newsletter_resend_confirmation`.

**webhooks** (`integrations`, 5/5 wired): `webhooks_list_subscriptions`, `webhooks_get_deliveries`, `webhooks_create_subscription` (signing secret never exposed), `webhooks_pause_subscription`.

**theme** (4/4 wired): `theme_list`, `theme_list_files`, `theme_read_file`, `theme_rename_file`, `theme_restore_trashed_file` — a live theme-file editing surface reachable by the assistant.

**widgets** (12/12 wired): list/get instances, list/get regions (read); `widgets_create_instance`, `widgets_update_instance`, `widgets_trash_instance` (soft, unconditional), `widgets_bind_region`, `widgets_set_region_placements` (atomic, version-guarded), `widgets_insert_embed`/`widgets_remove_embed`/`widgets_reorder_embeds` (inline rich-text widget embedding).

**plugins** (`plugin-runtime`, 2/2 wired): `plugins_list` (read), `plugins_set_enabled` (can trigger live schema DDL for data-module plugins).

**deployments** (5/5 wired): `deployment_get_export_status`, `deployment_list`, `deployment_get_dockerfile` (+ 2 more per catalog not individually extracted — write-Dockerfile and trigger-export).

**static-publish** (3/3 wired, `features/deployments/publish-agent-tools.ts`): preview/get-capabilities (reads) + `deployment_execute_static_publish` — genuinely destructive (publishes to the public internet with a write-scoped credential), gated behind a human-confirmation MCP-UI dialog, not a bare tool call.

**source-control** (2/2 wired): `source_control_get_capabilities` (read); `source_control_execute_commit` — pushes a real commit with a write-scoped credential, same human-confirmation gating as static-publish. GitHub-only; GitLab/Bitbucket credentials save but committing to them "is not implemented yet."

**custom-credentials** (6 tools, `features/custom-credentials/agent-tools.ts`): `custom_credential_list` (read), `custom_credential_verify` (live-pings the provider), `custom_credential_make_request` (proxies an authenticated request to any saved provider — DELETE is human-confirmation-gated, other verbs are not), `custom_credential_set_username`, `custom_credential_set_token` (opens an interactive form — token never passes through the model), `custom_credential_create`. This is the "agents can use saved tokens" capability memory already flagged as SHIPPED.

**external-mcp** (5 tools): `external_mcp_list` (read, never exposes secrets), `external_mcp_save` (human-confirmation form, never a silent write), `external_mcp_test_connection`, `external_mcp_oauth_connect`, `external_mcp_oauth_poll_device` — full OAuth-authorization-code and device-code flows for federating a third-party MCP server.

**post** (`content_post_*`, 6/6 wired): `content_post_search`, `content_post_list`, `content_post_get`, `content_post_create`, `content_post_update`, `content_post_delete` — full CRUD, human-confirmation-gated delete via the same MCP-UI surface-exchange mechanism as static-publish.

**pages** (2 tools so far confirmed, catalog says its own domain not folded into post): `pages_read_html`, `pages_write_html` — full-body HTML rewrite tool, converts an entry to Page format if needed.

**site-inspection** (2 tools): `site_get_profile`, `fetch_published_page`.

**site-evidence** (1 tool): `site_collect_page_evidence` (`SITE_EVIDENCE_TOOL_ID`, `features/site-evidence/agent-tools.ts:33`) — this is the tool the Dockerfile installs headless Chromium (Playwright) specifically to support; degrades to "browser unavailable" if `TOVU_INSTALL_BROWSER=0`.

**media-generation** (1 tool): `media_generate_asset` — per memory, SHIPPED as of a prior session.

**taxonomy** (6/7 per header; individual ids not extracted — catalog lives in `features/taxonomy/tool-registrations.ts` with a different code shape than the regex sampled).

**Cross-domain/UI tools** (`apps/website/src/assistant/*.ts`, standalone, not tied to a CMS domain):
- `assistant_ask_choice` (`ask-choice-tool.ts`) :: lets the assistant ask the human a real multi-choice question via a held-open MCP-UI surface — the production counterpart to the demo tool below.
- `assistant_admin_screen_link` (`admin-screen-link-tool.ts`, added 2026-09-03) :: read-only "take the human to the right admin screen" fallback link.
- `external_mcp_reauth_prompt` (`external-mcp-reauth-tool.ts`, added 2026-09-02) :: in-chat notice when a federated MCP OAuth grant dies, points at Settings rather than re-authing itself.
- `search_components` / `describe_component` (`component-catalog-tool.ts`, added 2026-08-30) :: lets the model discover/describe UI components it can render (shadcn/recharts registry + primitives) — closes a gap where these were reachable for spawned-CLI agents but not BYOK turns.
- `demo-choices`, `demo-a2ui`, `demo-image`, `render-ui` (un-gated 2026-08-26, previously behind `TOVU_ENABLE_DEMO_TOOLS`) :: `render-ui` is general-purpose (draws any catalog component); the other three are fixed demo/proof-of-transport tools (MCP-UI one-shot, A2UI multi-turn, typed-media image) — SHIPPED but not product features in themselves.

### Tools deliberately NOT agent-callable (by design, evidenced in the catalogs themselves)
`database_execute_migrate_forward`, `redirects_import`, `newsletter` send/schedule/resume, `comments_purge`, `forms` hard-delete, `members` hard-delete — each has an explicit comment explaining the omission (usually: irreversible, or human-UI-only).

## 3. Content model

Source of truth: `capability-inventory.ts` (`apps/website/src/server/runtime/configuration/capability-inventory.ts:44-361`), a typed, boot-time-enforced list — plus the raw Drizzle schema (`apps/website/src/platform/db/schema.ts`, 80 tables).

| Content type | Status | Evidence |
|---|---|---|
| workspace | production, critical | capability-inventory.ts:46-56 |
| posts | production, critical | capability-inventory.ts:58-68; `content_post_*` tools |
| pages | production (Tiptap-distinct HTML type) | `pages_write_html` tool; separate from posts by design |
| entries | production, critical (generic content-type-agnostic layer) | capability-inventory.ts:181-191 |
| content-types | production, critical | capability-inventory.ts:169-179 |
| taxonomy | production, optional | capability-inventory.ts:193-203 |
| media | production, optional (sharp-dependent) | capability-inventory.ts:309-319 |
| comments | production (Tier-3 bundled plugin, real v1 backend) | capability-inventory.ts:333-346 |
| newsletter | production, optional | capability-inventory.ts:121-131 |
| redirects | production, optional | capability-inventory.ts:133-143 |
| forms | production, optional | capability-inventory.ts:145-155 |
| navigation (menus) | production, optional | capability-inventory.ts:109-119 |
| widgets | production (12/12 tools wired) | schema `widgetRegionBindings`; tool catalog |
| commerce | **not in capability-inventory at all** — schema tables exist (`commerceOrders`, `commerceProducts`, `commercePrices`, `commerceProductImages`, `commerceWebhookEvents`) but no production classification found | PARTIAL/UNKNOWN |
| store (Tier-3 spike) | **explicitly experimental** — "SPIKE sample Tier-3 plugin... never intended as a production capability" | capability-inventory.ts:347-360 |
| database (migrations/ledger) | production, critical | capability-inventory.ts:157-167 |
| recovery/restore | **explicitly NOT production** — "does not physically overwrite content.db (no live-swap mechanism)... disclosure watermark source is `AlwaysUnavailableWatermarkSource`" | capability-inventory.ts:216-232 |
| identity/users/roles/policies | production, critical | capability-inventory.ts:93-107; schema `principals`/`roles`/`policies` |
| members (visitor accounts) | production, critical | capability-inventory.ts:273-283 |
| webhooks (outbound) | production, but **delivery worker never started** | capability-inventory.ts:285-295 |
| origin (verified prod domain) | production, critical, but **seeded with a hardcoded dev-capability localhost origin — no real verification flow exists yet** | capability-inventory.ts:297-307 |
| analytics | production | capability-inventory.ts:321-330 |
| gated-mutations, outbox, change-sets | production, critical/optional infra | capability-inventory.ts:234-271 |

## 4. Themes & rendering

A theme is a folder (`content/themes/<id>/`) validated against a `theme.json` schema, with an explicit v1→v2 migration path and two authoring tiers: a **static tier** (Handlebars/Liquid templates, sandboxed workers — `handlebars-worker.ts`, `liquid-worker.ts`, `worker-sandbox.ts`) and a **code tier** (a real framework build, e.g. Angular, normalized post-build via `tovu theme normalize-build` into Tovu's own static-asset-contract shape). Evidence: `apps/website/src/features/theme/` — `theme.ts`, `theme-layout.ts`, `theme-lineage.ts`, `active-theme.ts`, `marketplace.ts`, `static-render.ts`, `static-portability-index.ts`, `handlebars-allowlist.ts`, `liquid-allowlist.ts`, `code-tier-asset-normalizer.ts`, `static-asset-contract.ts`, `file-identity-lock.ts`, `build-conformance.ts`.

CLI surfaces this directly: `tovu theme validate` (author/publish/install profiles), `tovu theme migrate` (v1→v2, dry-run capable), `tovu theme generate-index` (regenerates a static-tier portability-backup index.html), `tovu theme normalize-build` (`cli/program.ts:77-113`). A user (or the assistant, via `theme_*` tools) can list, read, rename, and trash/restore individual files inside an installed theme — a real live-edit surface, not just install/activate. Memory's "THREE render paths diverge" and "templated preview gap" were not re-verified this pass (file inventory only; render internals not read line-by-line) — SHIPPED (theme system exists and is reachable) but render-path-count claim is UNKNOWN this pass.

## 5. Public site features

Visitor-facing routes under `apps/website/src/server/inbound/public-http/routes/`:
- **site chat assistant** — a dedicated build (`apps/site-chat/`, `SiteAssistantWidget.tsx`, `site-assistant-transport.ts`, `session-store.ts`) served from the Docker image (`TOVU_SITE_CHAT_DIST`). SHIPPED.
- **comments** — public submission (`site/comments-submit.ts`), rate-limited/honeypot/spam-classified per capability-inventory. SHIPPED.
- **forms** — public submission (`site/forms-submit.ts`). SHIPPED.
- **newsletter** — public confirm/unsubscribe (`site/newsletter-confirm.ts`, `site/newsletter-unsubscribe.ts`), double-opt-in. SHIPPED.
- **sitemap.xml, robots.txt** — `site/sitemap.ts`, `site/robots.ts`. SHIPPED.
- **llms.ts** — a dedicated route, almost certainly an `llms.txt`-style machine-readable site descriptor for AI crawlers. SHIPPED (route exists; content not read).
- **media-rendition** — serves transformed image renditions. SHIPPED.
- **analytics-ingest** — public analytics beacon endpoint. SHIPPED.
- **member sign-in** — magic-link flow (`members/sign-in.ts`, `members/complete-sign-in.ts`). SHIPPED.
- **commerce**: `site/products.ts`, `site/store.ts`, `site/payments-webhook.ts` exist as routes but commerce has no capability-inventory production entry — PARTIAL.
- **OAuth callback pages** (`oauth/callback-page.ts`, `oauth/public-origin.ts`), **external-mcp OAuth callback**, **Composio connector callback** (`connectors/composio-callback.ts`) — these are admin-initiated flows that need a public callback URL, not visitor content per se, but they are public-network-reachable routes. SHIPPED.
- **ops/health** — a health-check endpoint. SHIPPED.

## 6. Deployment / hosting

Concrete, verified from `Dockerfile`, `cli/program.ts`, and root `package.json`:

- **npm/CLI**: `npx tovu init <dir>` scaffolds a new install; `tovu serve <dir>` validates/migrates/boots (serves site + admin on one port); `tovu export <dir>` renders the public site to static files (no server, no browser — for static hosting/GitHub Pages, supports `--base-path` for subpath deploys); `tovu deploy config --target fly|render|railway` generates that platform's config from the Dockerfile/fly.toml as single source of truth; `tovu introspect` emits a machine-readable command/tool manifest (for Tovu-Runner, per memory).
- **Docker**: a real multi-stage `Dockerfile` at repo root (`docker build -t tovu:local .`). Build stage installs 3 npm workspaces (root, `apps/admin`, `apps/site-chat`) plus `packages/sdk`, compiles TypeScript, copies stock content/themes/agent-plugins. Runtime stage is `node:24-bookworm-slim`, optionally bakes in headless Chromium via Playwright (`TOVU_INSTALL_BROWSER` build arg — needed only for `site_collect_page_evidence`; omitting it shrinks the image and that one tool degrades gracefully). Runs as non-root `node` user, exposes port 3000, mounts `/workspace/Tovu/sites` as a volume for durable per-site state. `CMD ["node", "dist/src/index.js"]`.
- **Fly.io**: per memory, LIVE on Fly today, deployed from a **separate public mirror repo** (this repo's own `gh` cannot answer deploy questions). `fly.toml`-oriented comments throughout the Dockerfile confirm Fly is the primary target; `deploy config` also supports Render and Railway config generation, though live-deployment status on those two is unverified this pass.
- **Desktop app**: memory records Tovu-Runner (a separate Electron repo, `/Users/la/Programming/Tovu-Runner`) as the desktop app wrapping this CLI — not re-verified this pass (out of scope: separate repo).
- **npm scripts**: `npm run dev` (dev orchestrator), `npm start` (`node dist/src/index.js`, same as the Docker CMD), `npm run build` (full compiled-dist build incl. asset copies), `npm run export`.

## 7. Extension surfaces

- **Plugins** (`features/plugins/`) — a tiered plugin system (Tier 1-3 per ADR-023/ADR-031 references in comments) with its own data-module DDL engine (`data-module.ts`), migration journal/recovery (`migration-journal.ts`, `migration-recovery.ts`, crash-recovery-aware), snapshot/restore, and plugin-identity tracking. `comments` itself is described as "a Tier-3 bundled plugin... a real, supported v1 backend, not an experimental spike" — i.e. the plugin system isn't just scaffolding, it's already hosting a real production feature. SHIPPED as infrastructure; breadth of what third-party plugins can do wasn't independently sampled.
- **Agent Plugins** (`features/agent-plugins/`) — a distinct concept from CMS plugins: installable packages of agent instructions/tools (`install-from-url.ts`, `seed-bundled.ts`, `bundled-source-archive.ts`, `manifest.ts`, `capability-projection.ts`, `tool-registrations.ts`, `yauzl-archive-reader.ts` — real zip-archive installation, not a stub). SHIPPED.
- **External MCP servers** — full connection lifecycle (list/save/test/OAuth-connect/OAuth-poll-device), 5 agent tools, plus a public OAuth callback route and a re-auth-prompt UI tool for expired grants. This is one of the most fully-wired extension surfaces found: config → connect → detect-failure → re-auth, all present. SHIPPED.
- **Connectors** (Composio) — a public callback route exists (`connectors/composio-callback.ts`) and an admin `connectors/config` route; this looks like a narrower, Composio-specific integration alongside the more general external-MCP mechanism. PARTIAL — not fully characterized this pass.
- **Skills** — `features/skills/` (`tool-registrations.ts`, `layout.ts`) exists as a real feature with its own admin route dir; per memory, "user-installed, never bundled" (i.e. no first-party skills ship by default). PARTIAL/SHIPPED-as-infrastructure — not independently re-verified this pass.
- **Credentials/connectors underlying all of the above**: `custom-credentials` (generic saved API tokens, agent-usable via `custom_credential_make_request`), `vendor-credentials` (typed per-publish-provider), `source-control-credential-sets`, `publish-credential-sets`, `mediaProviderCredentials`, `composioConnectorCredentials` — six distinct credential tables in the schema, suggesting several independently-evolved credential seams rather than one unified one (consistent with memory's "signer-not-secret seam" debate history).

---

## Corrections to prior memory this pass surfaced
1. **Agent tool count**: memory said "~24-25 registered agent tools" — the real, currently-maintained figure is **~158-160 tool ids across 29 domains** (`assistant/tool-registrations.ts`'s own header comment, self-auditing at boot). The 24-25 figure may be counting *domains*, not tool ids — 29 domains is close to that number.
2. Seven of those domains' tool catalogs (identity, workspace, settings, entries, content-types, menus, media — roughly 41-49 tool ids) are **not defined in this repo** — they're re-exported from the external `@jini-ai/cms` package in the separate Jini monorepo. A ground-truth diff against tovu.dev should treat these as real/SHIPPED (they compose into the live registry) but their exact descriptions need a Jini-repo read, which was out of this task's declared scope (`apps/**`/`packages/**` in Tovu).
