# Supabase agent plugin: "I need a database" with no concepts (plan)

Date: 2026-09-27. Author: Software Architect subagent (read-only; nothing implemented).
Scope: Part A (facts checked against current sources), Part B (how it fits Tovu), Part C (plan).

## 0. Headline: this extends SPEC-052, which already exists

The dispatch treats this as new work. It isn't. **SPEC-052 (`ADS-memory/specs/052-supabase-agent-plugin/`,
APPROVED 2026-09-13) is already partly built:**

- `content/agent-plugins/supabase/` holds the plugin package: `plugin.json`, an `mcp.json` pointing at `https://mcp.supabase.com/mcp`
  with `tovuAuthMode: "oauth"`, and `skills/supabase/SKILL.md` plus `references/failure-modes.md` (commit a86f708a).
- `apps/website/src/features/supabase-connect/` provides `supabase_set_access_token` (a masked PAT form) and
  `supabase_set_project_scope` (a project picker with read-only on by default), plus `supabase-management-api.ts`
  (GET /v1/projects). They were added in commit d0666279, and their ids are in `MCP_UI_REDEEMABLE_TOOL_IDS`.
- `apps/website/src/assistant/supabase-mcp-scope.ts` makes sure no Supabase tool is offered until a `project_ref` is in the URL (INV-04).
- `apps/website/src/features/plugins/supabase-mcp/supabase-mcp-plugin.ts` is an older, second Supabase path: a stdio preset driven by
  `TOVU_SUPABASE_MCP_*` env vars, `--read-only` forced on, and an empty write list hard-coded.

SPEC-052 falls short of the owner's new bar, "zero concepts, Tovu creates the database", in four ways.

1. It **puts project creation out of scope**: "the user must already have a Supabase account and at least one project".
2. The **setup is operator-shaped**. The user enables the plugin, possibly restarts, has the agent call `external_mcp_oauth_connect`,
   comes back and says "done", picks a project, then goes to Settings → External MCP to enable the row and tick tools, and ticks
   "may write" per tool. Each step introduces a concept.
3. **Read-only is on by default and writes need a per-tool operator grant.** That conflicts with the standing owner rule
   (`stop_over_gating_capabilities`): reads and writes ungated, only permanent deletes confirmed.
4. **It was never verified live.** Dynamic client registration and OAuth tokens on `api.supabase.com` were never checked,
   and nothing was visually checked.

This plan is written as **SPEC-052 v1.1, a delta on top of it**. It is not a new spec. It keeps every useful piece already
built and removes or absorbs the rest.

---

## Part A: verified facts

Checked on 2026-09-27 against live endpoints and the Management API OpenAPI document (`https://api.supabase.com/api/v1-json`,
downloaded and parsed locally), plus the official docs.

| # | Claim | Verdict | Source |
|---|---|---|---|
| A1 | Supabase has OAuth apps, registered by org admins under Org settings → OAuth Apps | TRUE | https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration |
| A2 | Authorize and token endpoints are `https://api.supabase.com/v1/oauth/authorize` and `POST /v1/oauth/token` | TRUE. Both are marked **Beta/experimental** in the OpenAPI | same, and https://api.supabase.com/.well-known/oauth-authorization-server |
| A3 | PKCE is supported | TRUE. `S256` and `plain` are supported; PKCE is recommended, not required | AS metadata `code_challenge_methods_supported` |
| A4 | Token exchange needs a client secret | TRUE. `token_endpoint_auth_methods_supported` is only `client_secret_basic` and `client_secret_post`. There is **no `none`** (public client) method | AS metadata |
| A5 | Scopes are fine-grained | TRUE: `organizations:read, projects:read/write, database:read/write, analytics:read, secrets:read, edge_functions:read/write, environment:read/write, storage:read/write` (the REST API also has `auth:*`, `domains:*`, `rest:*`, `secrets:write`) | protected-resource metadata; OpenAPI `x-oauth-scope` |
| A6 | An OAuth grant is **org-scoped**: the user picks one organization on Supabase's consent page, and `organization_slug` can pre-select it | TRUE | build-a-supabase-oauth-integration doc; supabase-mcp README |
| A7 | Refresh-token lifetime | NOT PUBLISHED. The docs only say tokens are short-lived and that refreshing fails once the user revokes access. Treat the lifetime as unknown and handle `invalid_grant` as "reconnect" | build-a-supabase-oauth-integration doc |
| A8 | `POST /v1/projects` requires `name, org, region, db_pass, plan` | **PARTLY WRONG.** Required fields are `name`, `organization_slug` (`organization_id` is deprecated) and `db_pass`. `region` is deprecated in favour of `region_selection` (`{type:"specific",code}` or `{type:"smartGroup",code:"americas"|"emea"|"apac"}`), and **`plan` is deprecated and ignored** because the plan is set per organization. Scope: `projects:write` | OpenAPI `/v1/projects` POST |
| A9 | Project status can be polled | TRUE. `GET /v1/projects/{ref}` returns `status`, one of `COMING_UP, ACTIVE_HEALTHY, ACTIVE_UNHEALTHY, INIT_FAILED, INACTIVE, PAUSING, RESTORING, …`. `GET /v1/projects/{ref}/health?services=…` also exists | OpenAPI |
| A10 | `GET /v1/projects/{ref}/api-keys` | TRUE. Scope is `secrets:read`, and a `reveal` flag exists | OpenAPI |
| A11 | `POST /v1/projects/{ref}/database/query` | TRUE: body `{query, parameters?, read_only?}`, scope `database:write`, **Beta/experimental**. A `/database/query/read-only` variant also exists | OpenAPI |
| A12 | Migrations endpoints exist | TRUE: `GET/POST/PUT/DELETE /v1/projects/{ref}/database/migrations`. "Supabase for Platforms" says some platform features (migrations endpoint, restore points) need partner approval | OpenAPI; https://supabase.com/docs/guides/integrations/supabase-for-platforms |
| A13 | Rate limits | 120 requests/min per user per project or org, with 30 or 10 requests/min on analytics and database endpoints. Headers are `X-RateLimit-*` | https://supabase.com/docs/reference/api/introduction |
| A14 | A personal access token (PAT) is an alternative | TRUE. PATs are made at https://supabase.com/dashboard/account/tokens with a chosen expiry. **Scoped PATs** (limited to chosen orgs, projects and permissions) now exist and are recommended over classic PATs | api introduction |
| A15 | Free plan limits | TRUE: **2 free projects**, counted across every org where the user is Owner or Admin. Free projects **pause after 7 days of low activity** and can be restored for **up to 1 year** (the docs mention both 90 days and 1 year; the current page says 1 year) | https://supabase.com/docs/guides/platform/billing-on-supabase ; https://supabase.com/docs/guides/platform/free-project-pausing |
| A16 | The official MCP server is at `https://mcp.supabase.com/mcp` and uses OAuth with **dynamic client registration** | TRUE and checked live. The 401 carries `resource_metadata=…/.well-known/oauth-protected-resource/mcp`. That metadata names the auth server `https://api.supabase.com`, whose metadata has `registration_endpoint: https://api.supabase.com/platform/oauth/apps/register` | live `curl` 2026-09-27; https://supabase.com/docs/guides/getting-started/mcp |
| A17 | "DCR means we need no client secret" | **WRONG AS STATED.** Registration hands each install its own client id **and secret** (A4: only secret-based auth methods exist). What DCR removes is a **Tovu-wide** secret: each install mints and seals its own. That is exactly what `external-mcp-oauth.ts` already does | A4, A16 |
| A18 | MCP tools include list_organizations, get_cost/confirm_cost, create_project, apply_migration, execute_sql, get_project_url, keys | TRUE. The account group is `list_projects, get_project, create_project, pause_project, restore_project, list_organizations, get_organization, get_cost, confirm_cost`. Also `get_project_url`, `get_publishable_keys`, `generate_typescript_types`, `list_tables`, `apply_migration`, `execute_sql`, `list_migrations`, `get_advisors`, edge functions, docs, branching (paid), and storage (off by default). `create_project` needs a `confirm_cost_id` from `confirm_cost` | https://supabase.com/docs/guides/getting-started/mcp ; https://github.com/supabase-community/supabase-mcp |
| A19 | The MCP URL takes `project_ref`, `read_only` and `features` flags | TRUE. **Account tools are turned off when `project_ref` is set** | same |
| A20 | Claim flow ("Supabase for Platforms") | EXISTS: a platform creates projects in its own org and the user claims them (`/v1/oauth/authorize/project-claim`, `/v1/projects/{ref}/claim-token`). The claim-token endpoint is flagged **`x-internal`**, and the feature is partner/approval-gated | OpenAPI; supabase-for-platforms doc |
| A21 | Lovable | Lovable Cloud runs on Supabase and is managed by Lovable, so there is no user account. Alternatively the user clicks "Connect Supabase", goes through OAuth, then picks or creates a project in chat | https://supabase.com/blog/lovable-cloud-launch ; https://docs.lovable.dev/integrations/supabase |
| A22 | Bolt | Bolt provisions a database in Bolt's own org, and the user can **Claim** it later (the claim flow), or connect an existing project | https://support.bolt.new/integrations/supabase |
| A23 | Vercel | Vercel Marketplace native integration: Vercel provisions it, bills through the Vercel account, and syncs env vars automatically (`SUPABASE_URL`, keys, `POSTGRES_URL`…) | https://supabase.com/docs/guides/integrations/vercel-marketplace |

**Not verified, and needing the live check in Slice 0:**

- **U1.** Does an OAuth token minted through MCP discovery (sent with `resource=https://mcp.supabase.com/mcp`) work on
  `api.supabase.com/v1/*`? The issuer is the same, so it probably does. The worklist has carried this question since 09-13.
- **U2.** Does DCR accept an `http://127.0.0.1:<port>` or `http://localhost:<port>` redirect? Probably yes, because Claude Code
  and Cursor connect to mcp.supabase.com with loopback redirects.
- **U3.** What happens on the consent page for an account with **no organization**? Does it make one?
  `POST /v1/organizations` exists but has no OAuth scope listed.
- **U4.** Does `create_project` / `POST /v1/projects` return a distinct error when the 2-free-project cap is hit (status and message)?
- **U5.** What are the real access-token and refresh-token lifetimes? Read `expires_in`.
- **U6.** What do `create_project` and `get_cost` return when the free cap is hit?
- **U7.** What does the live `tools/list` from `https://mcp.supabase.com/mcp?features=account,database,development,docs,debugging` return (tool names and `destructiveHint`)?
- **U8.** Does a connect started in the agent daemon complete on the web callback?

**Slice 0 results (2026-09-27, partial: the owner has not signed in yet, so no token exists):**

- **U1: OPEN.** Needs the token. Our authorize URL sends **no `resource=` parameter** (checked live: the params are
  `response_type, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method`), so "a token minted with
  `resource=…/mcp`" is not what our flow produces. The question becomes: does our token work on both `/v1/*` and the MCP URL?
- **U2: YES for `https://localhost:3000`.** Enabling the `supabase` plugin and calling `POST …/mcp-servers/supabase/oauth/connect`
  ran DCR against `api.supabase.com/platform/oauth/apps/register`, which accepted redirect
  `https://localhost:3000/api/mcp-servers/oauth/callback/supabase` and returned a client id. It asked for all 13 scopes in A5.
  Plain `http://127.0.0.1:<port>` has not been tried.
- **U3: OPEN.** Needs the owner on the consent page.
- **U4 / U6: `get_cost` does not see the cap.** In supabase-mcp `packages/mcp-server-supabase/src/pricing.ts`,
  `getNextProjectCost` returns `amount: 0` for any org whose `plan === 'free'`, however many projects are active. Only a paid org
  charges $10/month from its second project. So the cap only shows up when the Management API rejects the create. Reported message
  (community threads, not live): "The organization has members who have reached their maximum limits for the number of active free
  plan projects within organizations where they are an administrator or owner". The status code is not published. The owner's account
  was not checked for being at the cap, and no create was attempted. **Consequence for Slice 3:** Tovu must count active free-org
  projects itself (`GET /v1/projects`, filter out `INACTIVE/GOING_DOWN/REMOVED`, the same filter supabase-mcp uses) before offering
  "create". Relying on `get_cost` would show "$0" and then fail.
- **U5: OPEN.** Needs the token. Also found: the pending authorization state lives **10 minutes**
  (`oauth_pending_authorizations.expires_at = created_at + 10 min`). A link sent through a coordinator expired before it was clicked.
- **U7: OPEN.** Needs the token.
- **U8: YES in code, not proven live.** Both the web root (`server/runtime/composition/deps.ts:1566`) and the daemon
  (`agent-daemon-server.ts:1198`, `routeDeps.externalMcpOAuthPending`) use `createSqlitePendingAuthorizationStore` on the same
  `content.db`. Live, the web-started connect wrote its row to `sites/tovu-dev/content.db`. There is a caveat for the in-memory root
  (`composition/app.ts:827`, `TOVU_DB=memory`), which cannot cross processes. The remaining live risk is that the daemon derives its
  own redirect origin: if it differs from the `https://localhost:3000` the client was minted with, Supabase refuses the redirect
  (the Part B "minted once" gap).
- **U9: docs say YES, not tested live (no PAT given).** Supabase's MCP guide (https://supabase.com/docs/guides/getting-started/mcp)
  documents `"Authorization": "Bearer ${SUPABASE_ACCESS_TOKEN}"` with a scoped PAT for the hosted server, for places where browser
  OAuth is impossible. Account tools (`create_project` and the rest) are turned off only by `project_ref` (A19), so an unscoped URL
  with a PAT should list `create_project`. This fits `adapter.http.ts`, which sends a static bearer header, so the Slice 2 PAT
  fallback can use the same hosted row.
- **Slice 3 decision: PENDING U1.**
- **Live-run log:** two admin-started authorize links (20:22 and 20:48 local) both expired unused. The dev API on :3000 was restarting
  under tsx watch at 20:39-20:47 and 20:49:40-20:52, and a callback that arrives during a restart is lost.

**Coordinator claims that were wrong or imprecise:**

- **A8:** `plan` and `region` are not create-project inputs any more. `plan` is ignored, and `region_selection` replaces `region`.
- **A17:** DCR does not mean "no client secret". Each install gets its own secret. What goes away is the need for a Tovu-wide secret.
- **"The comment at external-mcp-store.ts:55 is false".** It **has since been corrected.** Lines 53-60 now say the store federates
  `streamable_http` through `adapter.http.ts`.
- **A different stale comment matters more:** `apps/website/src/features/external-mcp/deps.ts:36-50` (and the echo in
  `tool-registrations.ts:124-132`) says a chat-started `authorization_code` connect can never complete across the daemon/web
  process boundary. **That has been false since commit 3c4e30d89**, which moved pending OAuth state into `content.db`
  (migration 0062). Slice 1 corrects both comments.

---

## Part B: how it fits Tovu (repo facts)

- **Plugin packaging.** Bundled packages live in `content/agent-plugins/<id>/` and are seeded **switched OFF**
  (`features/agent-plugins/seed-bundled.ts`). They are validated by `features/agent-plugins/manifest.ts`. `federate-mcp.ts:309-326`
  creates the MCP row with `enabled:false` and empty `allowedToolNames` / `writeAllowedToolNames`, on the deliberate rule that
  "provisioning is not authorization". Enabling a plugin is `plugins_set_enabled` (`set-enabled.ts`).
- **Remote MCP client.** `assistant/mcp-federation/adapter.http.ts` is streamable HTTP with a bearer header. The store
  (`external-mcp-store.ts`) resolves a hosted row to `{url, headers}`. Roster changes now reload live runtimes through
  `external-mcp-roster-change.ts`, so the SKILL.md steps that say "restart the assistant" are stale.
- **OAuth.** `assistant/external-mcp-oauth.ts` handles RFC 9728/8414 discovery, RFC 7591 DCR, PKCE, callback, refresh lease and revocation.
  - The client secret and tokens are sealed with the ADR-058 AES-GCM sealer under `TOVU_INTEGRATIONS_ROOT_KEY` (the Site Token),
    with AAD bound through `external-mcp-aad.ts`.
  - The callback route is `server/routes/external-mcp/oauth-callback.ts`, and the redirect origin is `TOVU_PUBLIC_URL`, falling back
    to this process's own bind origin.
  - **Gap:** the client is minted **once** (`external-mcp-oauth.ts:700-724`) and pinned to the redirect URI it was minted with.
    If the origin later changes (a desktop port, a new domain), the provider refuses the stale redirect and nothing re-registers.
- **Held-open chat UI.** `contracts/core/tool-surface-exchanges.ts` lets one tool call show an MCP-UI surface and wait for up to about
  5.5 minutes (idle limit 5 min; the spawned agent's MCP deadline is 6 min). Existing uses include `askThenReport` (custom
  credentials, Supabase forms) and `ask-choice-tool.ts`. Off-site links open in a new tab, applied generically at render
  (owner memory `links_open_new_tab`).
- **Deployment modes:**
  - **Hosted and self-hosted:** `TOVU_PUBLIC_URL` is the redirect origin. It is stable, so DCR registers once.
  - **Desktop:** the redirect origin is a loopback address. Memory notes that the desktop site's port can change on restart, so the
    minted client's redirect can go stale. This needs the Slice 2 re-registration fix.
  - **Client-secret custody** is solved in all three modes by per-install DCR. No Tovu-wide secret ships anywhere.
    A **pre-registered Tovu OAuth app would need a Tovu-held secret, which a desktop build cannot keep, so it would need a hosted
    broker.** That is the main reason to prefer DCR.

---

## Part C: plan

### C1. Recommended architecture

**Use the official remote MCP for day-to-day database work, and a small first-party "concierge" for account setup.
Both share one OAuth connection.**

1. **One credential.** Keep the existing single `supabase` external-MCP row and its OAuth/DCR connect, which is already built,
   sealed and refresh-leased. The PAT form stays as a hidden fallback.
2. **The account lifecycle runs in Tovu code, never through model-chosen MCP calls.** New first-party tools in `features/supabase-connect/`:
   - look up organizations,
   - check cost,
   - create the project with a Tovu-generated, sealed database password and `region_selection` picked from the site's
     timezone/locale (a smart group),
   - poll status to `ACTIVE_HEALTHY`,
   - read the project URL and publishable key,
   - write `project_ref` into the MCP URL.

   The reasons for doing this in code:
   - The MCP turns account tools **off** once `project_ref` is set (A19), and INV-04 correctly never offers an unscoped Supabase
     connection to the model. The model therefore cannot create a project through the MCP without widening scope to the whole account.
   - It is deterministic. There are no hallucinated regions or plans, and the password is never seen by the model.
   - Progress and failures become plain chat text instead of raw vendor errors.

   The transport is **Management REST** (`api.supabase.com/v1`) using the connection's OAuth token. If Slice 0 shows U1 fails, the
   **same functions call the MCP account tools** (`list_organizations`, `get_cost`, `confirm_cost`, `create_project`, `get_project`)
   over an **internal, unscoped HTTP client that the model never sees**, using the same token. Pick one of the two after Slice 0.
   Do not build both.
3. **The model gets the project-scoped MCP** (`?project_ref=<ref>&features=database,docs,development,debugging,functions`, which
   drops `account`, `branching` and `storage`). It is **enabled automatically** with a default allowlist that the plugin declares.
   This replaces the operator Settings → External MCP step.
4. **Access level.** Per the owner rule, reads and writes are on, and only permanent deletes get the existing lightweight in-chat
   confirmation (`features/post/delete-confirmation-ui.ts` pattern). The open question is what counts as a delete when
   `execute_sql` can run `DROP` (see owner question Q1).
5. **Absorb the old path in the same job** (owner rule `generic_mechanism_must_absorb_old_paths`). Delete the stdio env-var preset
   (`features/plugins/supabase-mcp/`) and its registration, or reduce it to a thin alias that seeds the same OAuth row. Leaving two
   Supabase paths is not an option.

Alternatives rejected:

- **(a) A pure MCP wrapper.** It breaks the scope-before-offer safety rule and hands cost and create decisions to the model.
- **(b) A Tovu-registered OAuth app.** It needs a Tovu-held client secret and a hosted broker for the desktop build, and gains
  nothing over DCR.
- **(c) "Supabase for Platforms" projects in a Tovu-owned org that users claim later.** This is the only route to truly zero
  sign-up (the Bolt/Lovable model), but it needs a Supabase partnership, uses a Tovu-owned org and billing, and relies on internal
  endpoints. It is a business decision (owner question Q3), not v1.

### C2. The user journey (what a non-technical user sees)

The user says: **"I need a database."**

1. The agent calls one tool, `supabase_get_database`. It is always registered because it is first-party. If the plugin is off, the
   tool enables it: the user asking is the consent. The chat shows a card:
   > **Let's set up your database.** It's free and takes about two minutes. You'll sign in to Supabase (the database service Tovu
   > uses). **[Connect Supabase →]**
   - The button is the OAuth authorize URL and opens in a new tab.
   - The tool call stays open (a held-open exchange) and polls the connection row for `oauthStatus: "connected"`.
2. **If the user has no Supabase account**, Supabase's sign-in page offers "Sign up" (GitHub in one click, or email). The card also
   says:
   > No Supabase account? Choose **Sign up** on that page. You can use GitHub or email.
3. On Supabase's consent page the user approves. **If they belong to several organizations**, Supabase asks them to pick one on that
   page (A6). The card says:
   > If Supabase asks which organization, pick any. That's where your database will live.
4. The callback lands and the card updates to **"Connected ✓"** with no extra click. The tool continues:
   - It lists organizations the grant can see (normally one) and existing projects.
   - **If the user has projects already**, it shows one choice (the existing `ask-choice` surface):
     > **Make a new database** (recommended) · Use "<project name>" · …
5. **Cost check.** For a free organization under the cap the cost is $0, and the card says nothing about money. If Supabase reports a
   non-zero monthly cost, the card shows **"This will cost about $X/month on your Supabase plan. [Create it] [Cancel]"**. That is a
   real spend confirmation, and the only confirmation in the normal path.
6. **Create.** The card shows **"Creating your database… (usually 1-2 minutes)"** with a progress line while the tool polls
   `GET /v1/projects/{ref}` until `ACTIVE_HEALTHY`.
7. **Done.** The card reads:
   > **Your database is ready ✓**  [Open it in Supabase →]
   - The link is `https://supabase.com/dashboard/project/<ref>`, offered for curiosity only.
   - The agent immediately has the scoped Supabase tools and says something like "I can now create tables for your signup form. Want
     me to?"
   - No keys, ref, region, password or organization is shown.

**Failure paths.** Each is one plain sentence plus at most one link.

| Situation | What the user sees | What the system does |
|---|---|---|
| Walks away from the sign-in, or closes the tab | Card after about 5 min: **"Still waiting for Supabase sign-in. [Open sign-in again →]"** Say "done" anytime. | The exchange expires and returns `{status:"waiting-for-sign-in"}`. The next call to `supabase_get_database` resumes: it reads the row, starts a fresh authorization, never loops, and never retries on its own. |
| Denies consent | **"Supabase wasn't connected. You can try again whenever you like."** [Connect Supabase →] | The callback error is mapped. Nothing is stored. |
| Free-project cap hit (2 already) | **"Your Supabase account already has its 2 free databases. You can use one of them for this site, or pause one in Supabase to free a slot."** [Use "<name>"] [Open my Supabase projects →] | The cap error from U4 is mapped. The tool never offers a paid upgrade unless the owner allows it (Q2). |
| Chosen project is paused | **"That database is asleep (Supabase pauses free ones after a week unused). [Wake it up →]"** | Links to the project's dashboard page (restore is dashboard-only per the docs) and polls on the next call. |
| Provisioning takes more than about 5 min, or the tool deadline passes | **"Still setting up. I'll check again in a moment."** | Returns `{status:"provisioning", ref}` (the ref is kept in state, not in the text) and resumes polling on the next call. |
| Provisioning fails (`INIT_FAILED`) | **"Supabase couldn't finish creating the database. [Try again]"** | Records the failed ref and does not auto-delete it. |
| Token expired or revoked (a 401 later on) | **"Supabase needs you to sign in again. [Reconnect →]"** | Refresh is tried once under the existing lease. On `invalid_grant` it shows the re-auth card (existing `external_mcp_reauth_prompt`), and the original action is retried once after reconnect. |
| Supabase is down | **"Supabase isn't responding right now. Try again in a few minutes."** | No loop, and no raw body shown. |
| Sign-in cannot start (DCR refused, or no reachable callback) | **"Supabase sign-in isn't available here, so let's use a one-time code instead. [Create a code →]"** then the masked field | The existing `supabase_set_access_token` form, reworded. A hidden fallback. |
| Rate limited (429) | "Supabase asked us to slow down. Trying again in a minute." | Honours `X-RateLimit-Reset` with one delayed retry, then stops. |

### C3. What is stored, how it is sealed, and what is never shown

| Item | Where | Protection |
|---|---|---|
| DCR client id and **client secret**; OAuth access and refresh tokens | existing `supabase` external-MCP row | ADR-058 AES-256-GCM under the Site Token (`TOVU_INTEGRATIONS_ROOT_KEY`), AAD-bound (`external-mcp-aad.ts`). Unchanged. |
| **The registered redirect URI** (new, Slice 2) | same row, non-secret column | Plain. Used to detect a stale client. |
| **Database password** (generated with 32 bytes of CSPRNG) | the site-credential store (`assistant/site-credential-store.ts` + `site-credential-aad.ts`) under a fixed name such as `supabase.db_password.<ref>` | Sealed. Never returned to the model. Kept only because Supabase requires one and the owner may later want a direct Postgres URL. |
| Project ref, project URL, publishable key | the row URL (`project_ref`) and site settings | Non-secret. The publishable key is designed to be public. |
| Secret / service-role key | **not fetched in v1** | Least privilege. The agent works through the MCP, not the data API. Fetch it only when a feature names a need. |

The agent must **never show or pass to the model**: tokens, the client secret, the DB password, a secret or service-role key, or the
Site Token. It should **avoid saying** these words unless the user asks: "ref", "region", "org slug", "PAT", "OAuth", "MCP", "scope",
"allowlist", "read-only". Tool results carry `projectName` and `status` only. The ref stays in tool state and is never put in text.

### C4. Build slices

Each slice is for a narrow Sonnet implementer: 3-5 steps, exact files, and a red test first. Every brief must say: "Design verified,
don't re-verify; search only inside the repo; commit with `git commit -F msg -- <paths>`."

Run tests from the repo root:
`env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks <file>`.

**Slice 0: live check.** Opus or the coordinator with the owner's Supabase account. No code. This must happen before Slice 3.

1. Start the dev site and enable `supabase` in Agent Plugins.
2. Ask the chat to call `external_mcp_oauth_connect {id:"supabase"}` and sign in with the owner's account.
3. Record: DCR succeeded? (A16, U2). Loopback redirect accepted? (U2). The token's `expires_in` (U5).
4. With the sealed token, as a throwaway script run by the agent (not the owner), call `GET https://api.supabase.com/v1/organizations`
   and `GET /v1/projects`. Record: does U1 hold?
5. Write the answers into this report's "Not verified" list. **This decides REST or internal-MCP for Slice 3.**

**Slice 1: prototype so the owner can SEE it** (Sonnet, `prototype_first_then_correctness`). Wording and card only, on existing tools.

1. Add `supabase_get_database` to `apps/website/src/features/supabase-connect/agent-tools.ts` (no input) and wire it in
   `tool-registrations.ts`. In the prototype it:
   - enables the plugin via the existing `set-enabled.ts` function,
   - calls the existing `beginConnect`,
   - renders one card with **[Connect Supabase →]**,
   - holds the exchange open, polling the row every 3 s until `oauthStatus: "connected"` or the deadline.
2. Add the card builder `buildConnectCardResource` to `supabase-connect-ui.ts`, reusing its existing outcome-card style.
3. Add the id to `MCP_UI_REDEEMABLE_TOOL_IDS` (`apps/website/src/assistant/mcp-ui-tool-calls.ts`).
4. Fix the stale cross-process comments in `features/external-mcp/deps.ts:36-50` and `features/external-mcp/tool-registrations.ts:124-132`.

RED test: in `features/supabase-connect/__tests__/supabase-connect.unit.test.ts`, "`supabase_get_database` on a fresh repo enables
the plugin row and returns a surface containing exactly one https authorize link, with no token in the result".
Then Playwright or Chrome screenshots of the card in the admin chat.

**Slice 2: stable sign-in on every host** (Sonnet).

1. `external-mcp-store.ts`: add a non-secret `oauthRegisteredRedirectUri` column to the row type, plus a drizzle migration.
   Follow memory `drizzle_future_journal_timestamps_skip_migrations`: the journal `when` must be the previous value + 1.
2. `external-mcp-oauth.ts` around lines 700-724: re-mint the client when the current `redirectUri` differs from the registered one,
   and persist the new value.
3. Map a denied consent (`error=access_denied` on the callback) to a closed reason the card can word.

RED test: in `apps/website/src/assistant/__tests__/external-mcp-oauth.test.ts`, "a connect whose redirect origin changed
re-registers the client instead of reusing the one pinned to the old origin".

**Slice 3: account concierge** (Sonnet, two narrow halves).

- 3a. `features/supabase-connect/supabase-management-api.ts`: add `listOrganizations`, `createProject`
  (`{name, organization_slug, db_pass, region_selection:{type:"smartGroup",code}}`), `getProject` (status), and
  `getPublishableKey`. Each keeps the file's closed `reason` results and never passes a body through. Add a pure
  `pickRegionGroup(timezone)` mapping to americas, emea or apac.
  RED test: "createProject sends region_selection smartGroup and never plan/region; maps a free-cap refusal to `reason:'free-limit'`",
  using fake `HttpClientPort` responses captured in Slice 0.
- 3b. `tool-registrations.ts`, inside `supabase_get_database` after connect:
  - pick the organization (auto when there is one),
  - existing-vs-new choice via `askOnce`,
  - generate and seal the DB password via the site-credential store,
  - create, poll to `ACTIVE_HEALTHY` inside the exchange with a resumable `{status:"provisioning"}`,
  - write `project_ref` via the existing `buildScopedSupabaseMcpUrl`.

  RED test: "a fresh connected account with 0 projects ends with a scoped URL, a sealed db password, and a result containing no
  token, password or ref".

**Slice 4: zero-setup tool access** (Sonnet).

1. `content/agent-plugins/supabase/mcp.json`: declare the default tool grant for the plugin. This adds one new optional field to
   `features/agent-plugins/manifest.ts` (for example `tovuDefaultTools: {allow:[…], write:[…]}`), validated against the known list.
2. `features/supabase-connect/tool-registrations.ts`: after the project is scoped, set the row `enabled:true`, fill the allowlists
   from that declaration, add the `&features=` group filter, and call `notifyExternalMcpRosterChanged()`.
3. Change the default of the form's read-only toggle per Q1.

RED test: "after `supabase_get_database` completes, `readEnabledExternalMcpConfigs` offers `list_tables` and `apply_migration` for
the scoped row without any operator write". This is a deliberate reversal of SPEC-052 REQ-06/11/12, so the spec amendment must land
first (see C5).

**Slice 5: failure wording and fallback** (Sonnet).

- Rework the copy in `supabase-connect-ui.ts` and `skills/supabase/references/failure-modes.md` to the C2 table.
- Hide the PAT form behind the sign-in-cannot-start branch only.
- Handle 429, paused, `INIT_FAILED`, and the free cap.

RED test: one table-driven test in `supabase-connect.unit.test.ts`. Each fake vendor response maps to the exact user sentence from C2
(assert the exact text, per memory `assert_exact_error_text`).

**Slice 6: skill rewrite and old-path removal** (Sonnet).

1. Rewrite `content/agent-plugins/supabase/skills/supabase/SKILL.md` around `supabase_get_database`: one tool, no Settings steps,
   no restart, and the "never say" word list from C3.
2. Delete `apps/website/src/features/plugins/supabase-mcp/` and its registration call in `agent-daemon-server.ts`, or make it seed
   the OAuth row. Delete its test, and update `bundled-supabase-package.unit.test.ts`.

RED test: the manifest test validates the new field (`features/agent-plugins/__tests__/unit/bundled-supabase-package.unit.test.ts`).
A grep test also asserts that SKILL.md no longer mentions "Settings → External MCP" or "restart".

**Slice 7: review.** An Opus code-inspection and fix pass. Then a live end-to-end run on the owner's account with screenshots of every
C2 row that can be reached. Delete the test project afterwards, **with owner confirmation, because it is a permanent delete**.

### C5. Decisions I made (not for the owner)

- Treat this as a SPEC-052 v1.1 amendment: bring project creation into scope and reverse the operator-gating REQs (06, 11 in part,
  12 and step 6). A spec agent should amend it before Slice 4.
- Use DCR per install, not a registered Tovu app. Use smart-group region selection, not a region picker. Show no organization picker
  (Supabase's own consent page does that).
- Always show the cost step. It only appears when the cost is above $0.
- Do not fetch the secret/service-role key in v1. Seal the DB password in the site-credential store.
- Leave out the MCP `account`, `branching` and `storage` groups for the model.
- Remove the stdio preset. Keep the PAT path as a hidden fallback only.
- Disconnect also calls `POST /v1/oauth/revoke` when the grant came from OAuth. This is a cheap improvement over SPEC-052 OQ-03.

### C6. Owner questions (plain words, max 3)

**Q1. How much should the assistant be allowed to change in the database?**
Your standing rule is that the assistant may read and write freely and only permanent deletes ask first. Supabase's "run SQL" tool
can also wipe a table in one command. Options:

- (a) Full access, and I add a check that asks you first whenever a SQL command would delete a table or data (DROP / DELETE / TRUNCATE).
- (b) Full access with no extra check.
- (c) Changes only on databases the assistant created for you; existing ones stay look-only unless you say so.

My pick is **(a)**.

**Q2. What if the free databases are used up?**
Supabase allows 2 free databases per person. When both are taken, should the assistant:

- (a) only offer to reuse one of them, or send you to pause one (never spend money), or
- (b) also offer a paid database (Supabase Pro plan, a monthly charge; the exact price comes from Supabase's own cost check at the time, and I have not checked the current price) after showing you the price and a
  "Create it" button?

My pick is **(a)** for v1.

**Q3. Is signing up for Supabase acceptable, or do you want no sign-up at all?**
Today the user signs in to (or creates) their own free Supabase account once. The only way to avoid that is the Bolt model: Tovu owns
a Supabase organization, creates databases there, and users "claim" them later. That needs a partnership with Supabase, and Tovu pays
for or holds the databases. My pick is to **keep the user's own account for v1** and revisit if sign-up proves to be the drop-off point.

### C7. Risks

- Several key endpoints are Beta/experimental, including OAuth authorize/token and `database/query`. Pin behaviour in tests with
  recorded responses, and treat a 404 or 410 as "Supabase changed; tell the user it's unavailable".
- U1 and U2 are unproven until Slice 0. Both have a fallback already designed (internal MCP account tools, and the PAT form).
- The 5.5-minute exchange cap: sign-up with email verification can take longer. The resumable status design covers this, and the next
  call picks up where it left off.
- Free projects pause after 7 days unused, which a quiet small-business site will hit. Recommend a follow-up (not v1): a daily
  lightweight keep-alive query, or tell the owner plainly. **Do not build it without asking**, since it games the vendor's policy.

## Owner decisions (2026-09-27, tovu-7a)
- Q1 DB power: full access; confirm with the user before DROP/DELETE/TRUNCATE.
- Q2 free cap hit: offer reuse/pause AND a paid database (show the price, "Create it" button). Overrides the plan pick of free-only.
- Q3 sign-up: the user signs up for their own Supabase account once (v1).
- Slice 0 live check on the owner account: approved, run now.

## OWNER RULING (2026-09-27, verbatim): "ALL of this is abstracted in the agent-plugin. no special code outside of it, thats the point of an agent plugin"
Consequence: no Supabase-specific code in apps/website core. Existing features/supabase-connect + features/plugins/supabase-mcp must move INTO the plugin package (generic = absorb old paths). Any missing plugin capability is added GENERICALLY to the plugin host, never Supabase-shaped. Slice 1 (core placement) was stopped.
