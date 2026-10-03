# Composio as an agent plugin (plan)

Date: 2026-09-27. Author: Software Architect / Programmer subagent.
Owner ask (verbatim): "wrap composio into its own agent-plugin and remove it from tovu".
Precedent: `2026-09-27-supabase-agent-plugin-plan-v2.md` (remote MCP + skill + generic host capabilities).
Inventory: `2026-09-27-vendor-code-in-core-inventory.md`, Composio row.

## 1. Headline

**The plugin is config + skill only. No plugin-owned code.** Composio runs a hosted MCP server,
Composio Connect, that speaks the same OAuth-for-MCP shape Tovu already supports for Higgsfield and
Supabase (`tovuAuthMode: "oauth"`: discovery, dynamic client registration, PKCE, public client).
The old core integration (Composio project API key + Tovu-run per-app OAuth broker) is replaced
wholesale, not ported.

Verified 2026-09-27:

| Fact | Source |
|---|---|
| Hosted MCP at `https://connect.composio.dev/mcp`, streamable HTTP, "1000+ apps ... through a single connection" via 7 meta-tools | https://docs.composio.dev/docs/composio-connect |
| Meta-tools: `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_GET_TOOL_SCHEMAS`, `COMPOSIO_MULTI_EXECUTE_TOOL`, `COMPOSIO_MANAGE_CONNECTIONS`, `COMPOSIO_WAIT_FOR_CONNECTIONS`, `COMPOSIO_REMOTE_WORKBENCH`, `COMPOSIO_REMOTE_BASH_TOOL` | same page |
| Per-app sign-in (Gmail, Slack, ...) is done BY Composio: "Composio generates an OAuth link you approve in your browser; after that the connection persists across sessions" | same page |
| Live probe: `POST /mcp` without auth → `401`, `WWW-Authenticate: Bearer ... resource_metadata="https://connect.composio.dev/.well-known/oauth-protected-resource"` | curl, 2026-09-27 |
| RFC 9728 metadata: `authorization_servers: ["https://connect.composio.dev"]`, `bearer_methods_supported: ["header"]` | `https://connect.composio.dev/.well-known/oauth-protected-resource` |
| RFC 8414 metadata: `registration_endpoint https://login.composio.dev/oauth2/register`, PKCE `S256`, `token_endpoint_auth_methods_supported: ["none"]`, scopes incl. `offline_access` | `https://connect.composio.dev/.well-known/oauth-authorization-server` |
| Key alternative is a `x-consumer-api-key` header, NOT `Authorization: Bearer` | composio-connect page; CORS `access-control-allow-headers` lists it |
| Project keys (`ak_`, `x-api-key`) are a different product surface (the backend API the old core used) | https://docs.composio.dev/reference/authenticating-to-composio |

Consequences:
- OAuth sign-in is the only auth the plugin declares. The supabase plan's G10 token alternative is
  `Authorization: Bearer`-shaped, so it does not fit Composio's `x-consumer-api-key` header. Not
  needed: OAuth works end to end and needs nothing from the user but a sign-in. No custom-header
  capability is invented for one vendor.
- `COMPOSIO_REMOTE_WORKBENCH` and `COMPOSIO_REMOTE_BASH_TOOL` (remote code execution) are left out
  of the skill's recommended grants.

## 2. Target shape

```
content/agent-plugins/composio/
  plugin.json                      plain description + discovery keywords (gmail, slack, notion, "connect my ...")
  mcp.json                         { composio: streamable-http, https://connect.composio.dev/mcp, tovuAuthMode: "oauth" }
  skills/composio/SKILL.md         connect -> search -> schemas -> connect app -> execute; grants; failure modes
```

Host keeps only generic capabilities that already exist: plugin-declared OAuth MCP rows
(`federate-mcp.ts`), `external_mcp_oauth_connect`, `external_mcp_reauth_prompt`, the Settings
allow/write ticks. When the Supabase slices land `agent_plugin_connect` (G1) and
`tovuDefaultTools` (G2), the Composio plugin adopts them as data-only edits, in the same slice that
moves `higgsfield-media` over (supabase plan slice C3). Nothing Composio-shaped is added to the host.

## 3. What happens to every core Composio file

Counted with `git grep -il composio` (175 paths incl. 44 drizzle meta snapshots, 2 build outputs).

| Group | Files | Fate |
|---|---|---|
| `platform/connectors/*` (config store + memory, key probe, service, credential store + memory, 2 AAD builders, 2 tests) | 10 | **delete**. The 2 AAD builders are inlined into `sealed-credential-descriptors.ts` (see DATA) |
| `platform/db/sqlite/composio-*-repo.sqlite.ts` + 2 tests | 4 | **delete** |
| Admin routes `server/inbound/admin-http/routes/connectors/*` (10 files) | 10 | **delete** |
| Public callback `server/inbound/public-http/routes/connectors/composio-callback.ts` | 1 | **delete** (see callback check) |
| `composition/modules/connectors.ts` + wiring in `app.ts`, `deps.ts`, `routes/types.ts` (`ComposioDeps`) | 4 | module **deleted**, wiring removed |
| `server/__tests__/admin-connectors-{routes,oauth}.test.ts` | 2 | **delete** |
| `rate-limit.ts` Composio buckets | 1 | buckets **removed** |
| `sealed-credential-descriptors.ts` | 1 | keep the 2 descriptors (tables still exist), AAD inlined, marked for removal with the drop |
| Schema dialects `schema.{sqlite,postgres,mysql}.ts`, `migration/manifest.ts` entry, parity/manifest tests | 6 | **kept unchanged** until the drop migration (removing the table from `schema.sqlite.ts` would make the next `drizzle generate` emit a DROP that auto-applies) |
| 4 migrations + 44 meta snapshots | 48 | **kept** (history) |
| `development/scripts/backfill-{composio-config,connector-credential}-aad.ts` + tests | 4 | **delete** (one-shot backfills for dead tables) |
| `development/e2e/connectors-*.spec.ts`, `fake-composio-{cli,server}.ts`, `playwright.connectors.config.ts` | 5 | **delete** |
| Admin: `ComposioKeyField`, `composio-i18n`, `connectors-port`, `composio-config-*`/`use-composio-*` hooks + their tests | 15 | **delete** |
| Admin: Providers "Composio" tab (hidden since 2026-09-10 at the owner's request), `use-providers`, `providers-i18n` | 5 | tab + controller removed |
| Admin: Security → Other credentials Composio rows (`rules.ts`, `use-other-credentials`, deps/port, i18n, tests) | 9 | Composio rows removed |
| Admin: `lib/api.ts` connector client fns + 2 tests, `styles.css` rules | 4 | removed |
| Comment-only mentions elsewhere (oauth, deployments, webhooks, users, pages, ...) | ~20 | reworded where the comment now points at a deleted file |

Result: **~55 files deleted, ~30 edited, 0 moved into the plugin** (nothing Composio-specific is worth
keeping: the new server does its own per-app OAuth). What still says "composio" afterwards: the
plugin, the 3 schema dialects, the migration manifest entry, the 2 legacy sealed descriptors, and
migration history.

`@jini-ai/integrations` stays a root dependency: `features/media-generation/*` also imports it.
The admin's own `@jini-ai/integrations` dependency is removed if nothing in `apps/admin` imports it
after slice 3.

## 4. DATA

Live counts (read-only, 2026-09-27): `sites/tovu-dev/content.db` has **1** `composio_config` row (a
sealed project API key) and **0** `composio_connector_credentials` rows; `apps/website/sites/tovu-com`
has 0 and 0. No desktop user-data DB carries either table's rows.

**Decision: users reconnect; no re-seal.** The old rows cannot be migrated into the plugin's
external-MCP row: Composio Connect authenticates a Composio *user account* by OAuth, while the stored
row is a *project* API key (`ak_...`, `x-api-key`), a different credential for a different API.
Connected app accounts (0 today) lived under a Tovu-chosen Composio `userId`
(`tovu-workspace-<id>`) inside that project and are not visible to a Connect sign-in either.

Until the drop: code stops reading and writing both tables. The two sealed-credential descriptors
stay so the sealed-credential inventory and key-rotation re-seal still recognise the leftover rows
(otherwise they report `no-descriptor` and the companion test fails).

**Drop migration: PROPOSAL ONLY, not written** (hard stop: migrations auto-apply). When approved:
one migration per dialect dropping `composio_connector_credentials` then `composio_config`, journal
`when` = previous entry + 1; in the same slice remove the tables from the 3 schema files, the
`migration/manifest.ts` entry, the 2 descriptors, and the parity-test rows. Irreversible: loses the one
sealed project key in tovu-dev (unused since the tab was hidden on 2026-09-10).

## 5. Public OAuth callback

`/…/connectors/oauth/callback` (`composio-callback.ts`) only completes a connect started by the
deleted `connect` route, keyed by an in-process pending map. With 0 connected accounts anywhere and
the tab hidden since 2026-09-10, nobody relies on it. The hard stop does not apply; it is deleted.
The new plugin uses the generic external-MCP OAuth callback, which already exists.

## 6. Slices (each committed by explicit paths)

1. **P1 plugin.** `content/agent-plugins/composio/{plugin.json,mcp.json,skills/composio/SKILL.md}` +
   `features/agent-plugins/__tests__/unit/bundled-composio-package.unit.test.ts` (parses, keywords,
   OAuth remote entry at the verified URL, no credential material, skill names the meta-tools and
   excludes the remote-execution tools from recommended grants). RED first (package missing).
2. **R1 server removal.** Delete the server groups in section 3; unwire composition; remove rate-limit
   buckets; inline AAD into descriptors; delete scripts + e2e. Test: descriptor/inventory test,
   rate-limit test, the composition smoke tests that touched `composioConnectors`; root tsc.
3. **R2 admin removal.** Providers tab, Settings files, Security rows, `api.ts`, styles, their tests.
   Test: touched admin unit files; admin tsc; screenshot of Integrations and Security pages.
4. **R3 comment sweep.** Reword comments that cite deleted files. `git grep -il composio` must list
   only the section-3 "kept" set plus the plugin.
5. **Later, owner-approved only:** the drop migration (section 4).
6. **Later, after supabase G1/G2 land:** adopt `agent_plugin_connect` + `tovuDefaultTools` in
   `composio/mcp.json` and the skill.
