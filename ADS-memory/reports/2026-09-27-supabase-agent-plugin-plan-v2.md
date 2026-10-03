# Supabase agent plugin, v2: everything inside the plugin (plan)

Date: 2026-09-27. Author: Software Architect subagent (read-only; nothing implemented, nothing committed).
Amended v2b (same day): the owner keeps a Supabase choice on the New site screen. Added G9-G11, section 4b, rewrote 5f, new
slices OB1a-OB4b, S-G10, C4, S-G11, C5, new order in section 6.
Supersedes Part C of `2026-09-27-supabase-agent-plugin-plan.md` (v1). v1's Part A facts (A1-A23) and its "Not verified" list
(U1-U5, being answered by the live Slice 0 agent) still stand and are not repeated here.

Governing ruling (owner, verbatim): **"ALL of this is abstracted in the agent-plugin. no special code outside of it, thats the
point of an agent plugin"**.

Owner decisions kept from v1: full DB access, but confirm before DROP/DELETE/TRUNCATE; at the free cap offer reuse/pause AND a
paid database (show the price, "Create it"); the user signs up for their own Supabase account once; zero-concept journey.

---

## 1. Headline

**No plugin-owned code is needed.** The official Supabase MCP server already does every account step v1 wanted Tovu code for.
What the host is missing is four small, generic plugin capabilities, and one Supabase-specific block in core that actively
prevents the pure-plugin path (the INV-04 "no project selected" refusal).

Checked against the server source (`supabase-community/supabase-mcp`, `packages/mcp-server-supabase/src/tools/`, 2026-09-27):

| Need | Official MCP tool | Notes |
|---|---|---|
| Which account / org | `list_organizations`, `get_organization` | OAuth consent already picks one org (v1 A6) |
| Existing databases | `list_projects`, `get_project` | `get_project` returns status, used to poll until `ACTIVE_HEALTHY` |
| Price | `get_cost {type:"project", organization_id}` → `{amount, recurrence}` | Tool doc says "always repeat the cost to the user" |
| Price accepted | `confirm_cost {type, recurrence, amount}` → `confirmation_id` | |
| Create | `create_project {name, region, organization_id, confirm_cost_id}` | **No password input: the server generates it internally.** The model never sees one, so v1's sealed-password work disappears. `confirm_cost_id` is "optional with elicitation"; Tovu's MCP client has no elicitation (grep: zero hits in `assistant/mcp-federation/`), so the model passes the id |
| Asleep database | `pause_project`, `restore_project` | v1 said "restore is dashboard-only"; the MCP can do it, so "Wake it up" is one tool call |
| Tables / SQL | `list_tables`, `apply_migration`, `execute_sql`, `list_migrations`, `get_advisors` | take `project_id`, so no URL scoping is needed |
| App wiring | `get_project_url`, `get_publishable_keys`, `generate_typescript_types` | |
| Delete a project | **none exists** | no permanent project delete is reachable from chat at all |

Annotations that matter: `execute_sql` and `apply_migration` both declare `destructiveHint: true`.

**Critical finding (not in v1):** `assistant/mcp-federation/trust.ts:352` refuses every tool declaring `destructiveHint: true`,
**unconditionally, with no operator override** (R3). Today `execute_sql` and `apply_migration` can never reach the model, whatever
is ticked in Settings. SPEC-052's database half has never been usable. Generic capability G3 below is what fixes this.

---

## 2. Target shape

```
content/agent-plugins/supabase/            <- ALL Supabase knowledge
  plugin.json        plain-words description + keywords ("database", "i need a database", ...)
  mcp.json           remote server + three generic tovu* extension keys (below)
  skills/supabase/SKILL.md                 the guided journey (section 4)
  skills/supabase/references/failure-modes.md   one plain sentence + at most one link per failure
  (no code, no bundled server)

apps/website (host)                          <- only generic plugin capabilities, zero "supabase"
```

`mcp.json` after v2 (the three `tovu*` keys are generic, validated by `manifest.ts`, usable by any plugin):

```json
{
  "mcpServers": {
    "supabase": {
      "type": "streamable-http",
      "url": "https://mcp.supabase.com/mcp?features=account,database,development,docs,debugging",
      "tovuAuthMode": "oauth",
      "tovuDefaultTools": {
        "allow": ["list_organizations","get_organization","list_projects","get_project","get_cost","confirm_cost",
                  "create_project","pause_project","restore_project","list_tables","list_extensions","list_migrations",
                  "apply_migration","execute_sql","get_advisors","get_logs","get_project_url","get_publishable_keys",
                  "generate_typescript_types","search_docs"],
        "write": ["confirm_cost","create_project","pause_project","restore_project","apply_migration","execute_sql"]
      },
      "tovuConfirmCalls": [
        { "tools": ["execute_sql","apply_migration"], "argument": "query",
          "pattern": "\\b(drop|delete|truncate)\\b", "flags": "i",
          "title": "Delete data from your database?",
          "body": "This change removes data or a whole table. It can't be undone.",
          "confirm": "Yes, delete it", "cancel": "Don't" }
      ]
    }
  }
}
```

Exact tool list is re-read from a live `tools/list` in Slice P0 (the list above is from source; `get_logs`/`search_docs`
names must be confirmed). `branching` and `storage` stay out of `features`.

**Scoping decision (mine, per `subagent_questions_choose_sustainable`).** v1 locked the connection to one `project_ref`, which
switches off the account tools (v1 A19) and forced first-party code. v2 drops URL scoping: tools take `project_id`, the OAuth
consent already limits the grant to the one organization the user picked, there is no project-delete tool, and destructive SQL
is confirmed (G3). The skill tells the model to work only on the project it created or the user chose, and to name the project
when it would touch a different one. This is what makes "no code outside the plugin" possible.

---

## 3. Generic host capabilities (exists / gap)

| # | Capability (any plugin can use it) | Exists today? | Exact gap |
|---|---|---|---|
| G1 | **Connect card**: plugin declares an OAuth MCP server; one chat tool shows a card with a sign-in link and waits until connected | **Partial.** `external-mcp-oauth.ts` has discovery, DCR, PKCE, callback, refresh, revoke. `external_mcp_oauth_connect` (`features/external-mcp/agent-tools.ts:200`) only returns the URL as text and tells the model to wait for "done". Pending state is in `content.db` since `3c4e30d89`, so a daemon-started connect can complete on the web callback | New tool `agent_plugin_connect {pluginId}` in `features/agent-plugins/`: provisions the plugin's OAuth rows (existing `provisionAgentPluginMcpServers`, `federate-mcp.ts:410`), calls `beginConnect`, opens a held-open exchange (`contracts/core/tool-surface-exchanges.ts`) with a card, polls the row every 3 s for `oauth.status === "connected"`, returns `{status:"connected"}` or resumable `{status:"waiting-for-sign-in"}` at the ~5 min idle cap. The sign-in is the consent, so no separate enable dialog |
| G1b | **Links in cards open in a new tab** | **Gap.** `@jini-ai/ui`'s `useMcpUiHost` accepts `onOpenLink`; nothing under `apps/admin/` passes it (`external-mcp-reauth-tool.ts` header says so; confirmed by grep). The iframe has no `allow-popups` | Pass `onOpenLink` from the admin assistant dock: `https:` only, `window.open(url, "_blank", "noopener,noreferrer")`. Check the desktop webview's window-open handler routes it to the system browser |
| G2 | **Declared default tools, applied at connect** | **Gap, by design.** `federate-mcp.ts` rules 2-3 create the row `enabled:false` with empty `allowedToolNames`/`writeAllowedToolNames` ("provisioning is not authorization"); the operator ticks tools in Settings | New optional `tovuDefaultTools {allow, write}` in `manifest.ts` (remote entries only, string arrays, `write ⊆ allow`). Applied **once, on the first successful OAuth callback** for a row whose `provisionedByPluginId` is set and whose lists are still empty: set `enabled:true`, fill both lists, enable the plugin, `notifyExternalMcpRosterChanged()`. Hook point: `completeAuthorizationCallback` (`external-mcp-oauth.ts:1024`) via an injected `onConnected(serverId)` port. Rule 3's principle holds: the human's own sign-in, not provisioning, is what authorizes. An operator-edited row (non-empty lists) is never touched |
| G3 | **Confirm before calls whose arguments match a plugin-declared pattern** (Q1: DROP/DELETE/TRUNCATE) | **Gap, and a blocker.** R3 (`trust.ts:352`) refuses `destructiveHint:true` tools outright. No per-call confirmation exists on federated tools (`mcp-federation/registrations.ts:148` handler goes straight to `session.callTool`). The confirmation surface itself exists (`buildConfirmationSurface`, used by `external-mcp-reauth-tool.ts`, `content_post_delete`) | (a) `manifest.ts`: optional `tovuConfirmCalls[] {tools, argument, pattern, flags, title, body, confirm, cancel}`, pattern compiled at parse time, max length bounded. (b) `trust.ts`: a `destructiveHint:true` tool is admitted only when it is in `writeAllowedToolNames` **and** covered by a confirm rule; otherwise R3 stands. (c) federated handler: before `callTool`, if a rule covers the tool and the named argument matches, open a held-open confirmation and call only on "confirm"; "cancel" returns `{cancelled:true}` (never an error the model retries). (d) Rules are read from the provisioning plugin's package at federation build time; plugin gone → no rule → destructive tool refused again (fails closed) |
| G3 trust rule | who may declare G2/G3 | new | `tovuDefaultTools.write` entries that the remote marks `destructiveHint:true`, and every `tovuConfirmCalls` rule, are honoured **only for bundled, digest-verified packages** (`bundled-digests.ts`). A downloaded package can declare them, but they are ignored until an operator grants in Settings. Otherwise a marketplace package could self-grant destructive SQL with a pattern that never matches |
| G4 | **Choice card with a priced "Create it" button; existing vs new** | **Exists.** `ask_choice` (`assistant/ask-choice-tool.ts`), held open, single choice | none. The skill calls it by name |
| G5 | **Plain links in chat text** (open project, Supabase billing) | **Exists.** Off-site markdown links open in a new tab at render (memory `links_open_new_tab`) | none |
| G6 | **Sign-in keeps working when the site origin changes** (desktop port changes) | **Gap** (v1 Slice 2, generic already). DCR client minted once, pinned to its first redirect (`external-mcp-oauth.ts:700-724`) | Non-secret `oauthRegisteredRedirectUri` column + drizzle migration (journal `when` = previous + 1); re-register when it differs |
| G7 | **Find a disabled plugin from a plain request** | **Exists.** `search_agent_plugin_local` lists installed plugins including disabled ones (`tool-registrations.ts:960`, `enabled` flag), ranked by `keywords` | none. Keywords in `plugin.json` must include the user's words ("database", "store data", "signups", "backend") |
| G8 | Re-auth notice when a token dies | **Exists** (`external_mcp_reauth_prompt`) | After G1 exists, its card can offer the `agent_plugin_connect` flow instead of the Settings deep link. Optional, S-G1 follow-up |
| G9 | **Site-creation offer**: a bundled plugin offers an optional add-on on the "New site" screen; choosing it sets the plugin up in the new site's first chat | **Gap.** Both create screens hard-code a greyed Supabase radio (admin `Sites.hooks.tsx:209-236`, `CreateSiteOnboarding.tsx:106-153`; desktop `CreateWebsiteOnboarding.tsx:93-116`, `App.hooks.ts:1308-1468`). Admin create reads only `name` (`routes/system/sites.ts:125-134`); desktop refuses any non-SQLite kind (`project-ipc.ts:335-338`) and runs `tovu init <dir> --name` (`site-dir-store.ts:271-274`). Creating never starts the new site's server (admin footer, `CreateSiteOnboarding.tsx:262`), so nothing can run in it at create time. No auto-send-first-message path exists in the dock (grep: zero hits) | See section 4b. (a) `plugin.json`: optional `tovuSiteCreationOffer {label, description, translations?: {<locale>: {label, description}}}`, parsed in `manifest.ts` (today unknown keys only warn, `manifest.ts:83,144`). (b) `listSiteCreationOffers(bundledDir)` reads only the product's bundled tree (`deps.ts:437`), never downloaded packages. (c) `initSite({dir, name, addOns?})` (`init-site.ts:177`) writes `<site>/.site-setup.json` `{version:1, addOns:[{pluginId, state:"pending"|"started"|"done"}]}`: a site-local dotfile like `.site-meta.json`, which production never has (`deployment-overview.ts:35`), so a pending setup can never fire on a deployed site. Callers validate ids against the offer list first; `initSite` only checks the name grammar. (d) The new site's own admin, on first load, claims the pending entry (atomic, once) and sends one generic message with the plugin's chip selected (existing `useSelectedAgentPlugins`, `AssistantDock.hooks.tsx:661`), so the skill runs and calls `agent_plugin_connect`. G1 marks the entry `done` on connect |
| G10 | **Token alternative to sign-in** for a plugin's remote server | **Mostly exists.** Hosted rows already take a sealed `static_env` token sent as `Authorization: Bearer` (`external-mcp-store.ts:916-927`, sealing `:1984`, bounds `:1891-1894`). The masked in-chat form that writes it exists but is Supabase-only (`features/supabase-connect/tool-registrations.ts:219-240`, `supabase-connect-ui.ts`), and its probe calls Supabase's Management API | (a) `mcp.json` remote entry: optional `tovuTokenAuth {label, help, helpUrl}` (`helpUrl` https only). (b) The G1 card shows, under the sign-in button, "Or paste an access token" with a masked field, the one-sentence `help` and a `[label →](helpUrl)` link. **Move** the masked form out of `supabase-connect-ui.ts` into `features/agent-plugins/connect-card-ui.ts` (memory `move_tests_dont_reauthor`) before R2 deletes that folder. (c) Submit goes through the held-open exchange (never chat text), saves via `saveExternalMcpServer({authMode:"static_env", accessToken})`, then a generic probe: open the MCP session with the token and run `tools/list`; 401/403 → "That token didn't work. Make a new one and paste it again." (d) On success call the same G2 `onConnected(serverId)` port, so defaults apply identically. Supabase confirms the hosted server takes a PAT as `Authorization: Bearer` (https://supabase.com/docs/guides/getting-started/mcp, "Pass the token to the `Authorization` header"); tokens are made at https://supabase.com/dashboard/account/tokens |
| G11 | **Plugin site settings**: a plugin remembers non-secret values for this site (which database is this site's) | **Store exists.** ADR-028 settings (`setting_definitions` / `setting_values_*` carry `originPluginId`, `schema.sqlite.ts:344-370`); features register namespaces with `ensureSettingDefinitions` and read with `getEffective` (`features/settings/index.ts`, used by `analytics/config.settings.ts:110-181`). No agent plugin can declare or write one | (a) `plugin.json`: optional `tovuSiteSettings [{key, label, public?}]` (bounded, `key` grammar `[a-z][a-zA-Z0-9]{0,40}`). (b) Registered at plugin enable in namespace `agentPlugin.<pluginId>` with `originPluginId`. (c) One tool `agent_plugin_site_settings {pluginId, set?: {key: value}}` returns current values; only declared keys, string values ≤ 512 chars, rejects anything shaped like a secret (`sk_`/`sbp_`/`service_role`/JWT with a `service_role` claim). Never sealed because never secret; secrets stay in G10's sealed row |

Second consumer already in the repo: `content/agent-plugins/higgsfield-media/mcp.json` has the identical OAuth shape and today
walks the operator through `external_mcp_oauth_connect` + Settings ticks. G1/G2 serve it unchanged; slice C3 moves it over.

---

## 4. The user journey (plugin content only)

User: **"I need a database."**

1. The model finds the disabled `supabase` plugin with `search_agent_plugin_local` (G7) and calls
   `agent_plugin_connect {pluginId:"supabase"}` (G1). Card:
   > **Let's set up your database.** It's free and takes about two minutes. You'll sign in to Supabase, the database service
   > Tovu uses. No account? Choose **Sign up** there (GitHub or email). If it asks which organization, pick any.
   > **[Sign in to Supabase →]**
2. The user signs in / signs up and approves. The callback applies G2: plugin on, connection on, default tools granted. The card
   flips to **"Connected ✓"** and the tool returns. The skill is now loaded.
3. Skill: `list_organizations` (normally one) and `list_projects`. If projects exist, `ask_choice`:
   **Make a new database** (recommended) · Use "<name>" · ...
4. `get_cost`. If $0, say nothing about money. If more than $0, `ask_choice`: **"Create it ($X/month)"** · **Cancel**, then
   `confirm_cost` with the returned numbers.
5. `create_project` (name from the site name; region from the site's timezone, mapping table in the skill). Say "Creating your
   database... usually 1-2 minutes". Poll `get_project` about every 20 s, at most 10 times in one turn.
6. **"Your database is ready ✓"** plus `[Open it in Supabase →](https://supabase.com/dashboard/project/<ref>)`, then offer the next
   useful step ("Want me to make a table for your signup form?").

Failure rows (skill `references/failure-modes.md`, one plain sentence, at most one link):

| Situation | User sees | Model does |
|---|---|---|
| Sign-in not finished in ~5 min | "Still waiting for Supabase sign-in. [Sign in to Supabase →] Say "done" when you're back." | Calls `agent_plugin_connect` again on "done"; never loops |
| Consent denied | "Supabase wasn't connected. You can try again whenever you like." | Stops |
| Free cap (2) hit on `create_project` | `ask_choice`: **Use "<name>"** · **Pause "<name>" to free a slot** · **Paid database** | Use: continue with it. Pause: `pause_project` on that answer. Paid: link to the org's billing page to upgrade (Supabase takes payment, Tovu can't); on "done", `get_cost` → "Create it ($X/month)" → `confirm_cost` → `create_project` |
| Chosen database is asleep | "That database is asleep. Waking it up now (about a minute)." | `restore_project`, poll `get_project` |
| `INIT_FAILED` | "Supabase couldn't finish creating the database. Want me to try again?" | Never deletes anything |
| Destructive SQL | G3 card "Delete data from your database?" | On cancel: say it was not run |
| Token revoked | existing re-auth card | |
| Supabase down / 429 | "Supabase isn't responding right now. Try again in a few minutes." | One later retry at most |

Never say: ref, region, org slug, OAuth, MCP, token, scope, allowlist, read-only, plugin. Never show keys or passwords (the
publishable key only when wiring the site's own code, and only in code, not in prose). Exception: the G10 card says "access
token", because that is what Supabase's page calls it and the user has to find it there.

Step 7 (both entry points): `get_project_url` + `get_publishable_keys`, then
`agent_plugin_site_settings {pluginId:"supabase", set:{projectRef, url, publishableKey}}` (G11). Every later database request
starts with `agent_plugin_site_settings` so a new chat works on this site's database, not a guess from `list_projects`.

### 4b. Starting from "New site" (G9)

**What the user sees, admin:**
1. New site screen. Under "Site details", the section is renamed **"Add-ons"** (the built-in storage needs no row; it is always
   on). One row per offer, from the bundled plugins: `[ ] Supabase database — a hosted database for sign-ups, forms and app
   data. You'll sign in to Supabase or paste an access token right after.` No URL field, no key field.
2. "Create site" → back on All sites, "Created." now reads "Created. Its Supabase database gets set up the first time you open
   it." (true: nothing runs until that site's own server runs).
3. The user activates and opens the new site (existing flow). Its admin loads, the chat opens by itself with the message
   "Set up a Supabase database for this site" (the offer label, localised) and the Supabase chip selected. The skill calls
   `agent_plugin_connect` → the G1 card with **[Sign in to Supabase →]** and, below it, **Or paste an access token** (G10).
4. Either way, `Connected ✓`, then section 4 steps 3-7, ending on "Your database is ready ✓".

**Desktop:** same form row. Create picks the folder as today, runs `tovu init <dir> --name <n> --add-on supabase`, and **opens
the new site's tab straight away** when an add-on was chosen (so setup follows create with no extra click). The only wait is
the site's normal boot screen; then step 3.

**Why the token is not typed on the New site screen** (my decision): at create time the new site has no server, and its
secrets are sealed by that site's own server. Carrying a token from the create screen means argv to `tovu init` (visible in
`ps`), a plaintext file waiting in the folder, or one site's server writing into another site's database. The first chat card is
seconds later, uses the existing masked exchange and sealing, and is the same card the "I need a database" path uses. One
path, no secret at rest in the open.

**Exactly-once kickoff.** `GET /api/admin/site-setup` lists `pending` entries with their offer label. The dock calls
`POST /api/admin/site-setup/claim {pluginId}`: pending → started under the agent-plugins file lock
(`exclusive-file-lock.ts`); 200 once, 409 after. Only a 200 sends the message, so two tabs never both send. A `started` entry
that never reached `done` shows a small dock chip "Finish setting up your Supabase database" (click = the same message)
instead of re-sending by itself. `agent_plugin_connect` marks the entry `done` when it returns `connected`. If no AI model is
set up yet, the dock's existing "set up a model" state shows and the entry stays `pending` (claim only after the dock reports a
usable model: the same condition that enables its Send button).

---

## 5. Old paths to remove (GENERIC = ABSORB OLD PATHS)

Inventory from `git grep -il supabase -- apps packages` (tracked files; `content/agent-plugins/supabase` excluded).

### 5a. Delete (8 files)

| File | What it is | Replaced by |
|---|---|---|
| `apps/website/src/features/supabase-connect/agent-tools.ts` | `supabase_set_access_token`, `supabase_set_project_scope` descriptors | G1 + skill |
| `.../supabase-connect/tool-registrations.ts` | their handlers | G1 + skill |
| `.../supabase-connect/supabase-connect-ui.ts` | PAT form + project picker cards | G1 card, `ask_choice` |
| `.../supabase-connect/supabase-management-api.ts` | `GET /v1/projects` client | MCP `list_projects` |
| `.../supabase-connect/__tests__/supabase-connect.unit.test.ts` | its tests | G1/G2/G3 tests |
| `apps/website/src/features/plugins/supabase-mcp/supabase-mcp-plugin.ts` | stdio `npx` preset driven by `TOVU_SUPABASE_MCP_*` env, forced read-only | plugin `mcp.json` |
| `.../supabase-mcp/__tests__/supabase-mcp-plugin.test.ts` | its test | |
| `apps/website/src/assistant/supabase-mcp-scope.ts` | INV-04 host-keyed "no project selected" refusal | dropped (section 2 scoping decision) |

The Supabase-only PAT tool goes with them, but the owner now wants the token path (2026-09-27), so its masked form and
exchange handling are **moved** into the generic G10 card first (slice S-G10 runs before R2). What R2 deletes is only the
Supabase naming, the Management-API probe and the project picker.

### 5b. Edit out the Supabase branch (9 files)

| File | Change |
|---|---|
| `assistant/external-mcp-store.ts:9, 986-988` | remove the `supabaseMcpScopeFailure` import and branch; `:1077` comment |
| `assistant/index.ts:229-240` | remove the `supabase-mcp-scope` re-exports |
| `assistant/mcp-ui-tool-calls.ts:38-45` | remove the two `supabase_*` ids (add `agent_plugin_connect` in S-G1) |
| `assistant/tool-search-keywords.ts:465-469` | remove the two entries |
| `server/runtime/composition/tool-catalog-manifest.ts:48, 322-323` | remove `contributeSupabaseConnectTools` |
| `server/inbound/assistant/agent-daemon-server.ts:93, 1145-1150, 1203` | remove `registerSupabaseMcpPreset` |
| `server/runtime/composition/modules/assistant-byok.ts:68, 370` | remove `registerFederationPresets: registerSupabaseMcpPreset` |
| `assistant/byok-tool-surface.ts:469-472, 533-537` | the `registerFederationPresets` option (see 5d) |
| `features/plugins/index.ts:5` | drop `supabase-mcp/` from the directory list |

### 5c. Tests to update (7, beyond the 2 deleted)

`assistant/__tests__/domain-no-direct-tool-registration.boundary.test.ts`, `mcp-federation.registrations.test.ts`,
`mcp-federation.trust.test.ts`, `mcp-ui-allowlist-completeness.test.ts`, `mcp-ui-tool-calls.test.ts`,
`tool-registrations.contracts.test.ts`, `features/agent-plugins/__tests__/unit/bundled-supabase-package.unit.test.ts`.
Tests that merely use "supabase" as fixture data (e.g. `external-mcp-oauth.test.ts`, `mcp-federation.stdio-adapter.test.ts`,
admin `external-mcp-admissions` tests) stay as they are.

### 5d. Generic dead code left behind (recommend delete in the same job)

The env-var preset registry's **only** consumer is the Supabase preset: `assistant/mcp-federation/presets.ts`
(`registerFederatedMcpPreset` etc.), `bootstrap.ts:198, 355` (`resolveRegisteredPresets`), `reload.ts:135`, `index.ts:290`, the
`registerFederationPresets` option in `byok-tool-surface.ts`, and the "PRESET connections" note in
`apps/admin/src/features/settings/external-mcp-admissions-rules.ts:248`. Plugin `mcp.json` absorbed this path. Recommend slice R3
deletes it (per memory `unreachable_branch_delete_vs_test`); coordinator may split it out if it widens scope.

### 5e. Comments that will point at deleted files (fix in the removal slices)

`mcp-federation/config.ts:8-13`, `ports.ts:124, 158`, `bootstrap.ts:41-42`, `tool-contribution-registry.ts:24-25`,
`features/database/adapter.sqlite.ts:45-76` (still accurate about `mcp__supabase__*`; only check wording). Comment-only mentions
that stay true and need nothing: `adapter.http.ts`, `adapter.stdio.ts`, `trust.ts`, `bundled-digests.ts`, `files.ts`,
admin `AgentPlugins.tsx`, `use-agent-plugin-details-modal.hooks.ts`, `pg-fixture.ts`.

### 5f. The site-creation "Supabase" option: REPLACED by G9 (owner decision, end of file)

Today: a greyed "Supabase: needs a project URL and API key" radio. It is replaced by the generic G9 add-on list, not deleted
and not kept. Per file:

| File | Today | After |
|---|---|---|
| admin `features/sites/Sites.hooks.tsx:207-248` | `SiteDatabaseOption` with `id: "sqlite"\|"supabase"\|"custom"`, `resolveSiteDatabaseOptions` | `"supabase"` removed from the union and the array. New `resolveSiteCreationOfferRows(offers, locale)` + `addOns` state in `use-sites.hooks.ts`; `createSite()` sends `{name, addOns}` |
| admin `CreateSiteOnboarding.tsx:106-127` (`SupabaseVendorFields`), `:149-150` (`vendorFieldsFor` branch), header `:24-64` | disabled URL/key inputs | `SupabaseVendorFields` deleted; new `AddOnsSection` (checkbox per offer, offer text only); header paragraphs about "no state variable can hold a dialect" rewritten: add-ons are real, the database dialect is still SQLite-only |
| admin `sites-i18n.ts` (20 locales) | "Supabase", "Hosted · requires a project URL and API key", "Supabase project URL", "Supabase API key", "Paste your API key" | those 5 keys removed ("Shown for what's coming…" stays, Custom still uses it); the Database hint "…so the other two can't be chosen yet…" (`CreateSiteOnboarding.tsx:212`) reworded for one remaining option; "Add-ons" + the created-line sentence added (offer text itself comes translated from `plugin.json`). Admin port `sites-port.hooks.ts:17` `createSite({name})` → `createSite({name, addOns})`, `use-sites.hooks.ts:112` |
| website `routes/system/sites.ts:125-134, 216` | reads `name` only | also reads optional `addOns: string[]`, validates against `listSiteCreationOffers`, 400 `UNKNOWN_ADD_ON` before anything is created |
| website `init-site.ts:62-72, 177`, `cli/program.ts:47`, `cli/commands/init.ts:28` | name only | `addOns?`, `--add-on <id>` (repeatable), writes `.site-setup.json` |
| desktop `contracts/project.ts:18-24, 43, 78-91` | `DatabaseProviderKind` incl. `'supabase'`, `SiteDatabaseSummary`, `CreateSiteDatabaseInput.endpoint/credential` "required when kind is supabase" | `'supabase'` removed from the kind; `CreateSiteInput.addOns?: string[]`; new `SiteCreationOffer {pluginId, label, description}` DTO and `SITE_IPC_CHANNELS.creationOffers`; `SiteRecord.addOns: {pluginId, label, state}[]` read from `.site-setup.json` |
| desktop `project-ipc.ts:335-338, 355-361` | refuses non-SQLite | still refuses non-SQLite; refuses an unknown add-on id **before** the folder dialog; passes `addOns` to `adoptSiteDir` → `initSiteDir` adds `--add-on` (`site-dir-store.ts:271-274`) |
| desktop main | none | offers from `tovu site-offers --json` (new CLI command over `listSiteCreationOffers`), run once at app start and cached (bundled plugins cannot change while the app runs), so the form never waits on it |
| desktop `App.hooks.ts:1308-1468` | `computeCanCreate`/`buildCreateProjectInput`/`useCreateWebsiteForm` carry `supabaseUrl`, `supabaseKeyRef`, `hasSupabaseKey`, `supabaseReady` | every Supabase field deleted; `addOns: string[]` state + toggle; `computeCanCreate` loses the supabase branch; `handleCreate` (`:391-404`) opens the new site's tab when `input.addOns.length > 0` |
| desktop `CreateWebsiteOnboarding.tsx:51-116` | Supabase radio + URL/key fields | Supabase radio and fields deleted; add-on checkboxes from the offers |
| desktop `SiteGrid.hooks.ts:62-66` | `databaseLabel` returns "Supabase" | supabase branch deleted; the card shows each add-on label (with "set up when you open it" while `pending`) |
| tests | `Sites.hooks.unit.test.tsx`, `Sites.unit.test.tsx`, `use-sites.hooks.unit.test.tsx`, desktop `App.hooks` / `CreateWebsiteOnboarding` / `SiteGrid.hooks` / `project-ipc` tests asserting the greyed Supabase option or its fields | rewritten to the add-on list; the "refused before the dialog" test kept and extended to unknown add-ons |

Not in this job (leftover, listed for the coordinator per `fix_everything_means_current_topic`): the equally greyed **"Custom
DB Provider"** option and its `endpoint`/`credential`/`label` contract fields. After this job they are the only users of
`CreateSiteDatabaseInput`; deleting them is one small slice (R-CUSTOM) if the owner wants it.

### 5g. The stopped Slice-1 agent

`git status --short` on `apps/website/src/features/supabase-connect/`, `assistant/mcp-ui-tool-calls.ts`,
`features/external-mcp/`, `features/agent-plugins/`, `apps/admin/src`, `content/agent-plugins` shows **no uncommitted edits** at
the time of writing. If any appear before R1 runs, v2 discards everything under `features/supabase-connect/` and any
`supabase_get_database` id in `mcp-ui-tool-calls.ts`; edits to `features/external-mcp/deps.ts` / `tool-registrations.ts` that
only correct the stale cross-process comments are worth keeping. Ask the owner before undoing any of it
(memory `ask_before_undoing_agent_work`).

---

## 6. Slices

Every Sonnet brief: rotation clause first; "Design verified, don't re-verify; search only inside the repo; commit with
`git add <paths> && git commit -F msg -- <paths>`; wait in the foreground". Run tests from the repo root:
`env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks <file>`
(admin: its own runner, per memory `tests_must_run_repo_root`).

Order (v2b, 2026-09-27): P0 → S-G1b → S-G1 (owner SEES the card) ‖ OB1a → OB1b (owner SEES the New site choice) → S-G2 → R1
→ C1 (owner SEES "I need a database" end to end) → OB2 → OB3 (owner SEES New site → chat → Ready ✓ in admin) → S-G10 → C4
(owner SEES the token path) → S-G11 → C5 → S-G3 → C2 → R2 → R3 → S-G6 → OB4a → OB4b (desktop) → C3 → E2E.
`‖` = in parallel (OB1a touches only `manifest.ts`'s plugin.json half and a new file; S-G1 does not touch `manifest.ts`).
S-G6 must land before OB4b: every desktop site start can change the port, which breaks OAuth sign-in without it. C3 can run in
parallel with anything after C1. R2 must come after S-G10 (S-G10 moves the masked form out of the folder R2 deletes).

**P0. Live check** (already running as v1 Slice 0; add four questions). U6: what `create_project` returns at the free cap, and
what `get_cost` returns for a free org at the cap. U7: exact live `tools/list` names and annotations for the `features=` URL in
section 2. U8: does a daemon-started `beginConnect` complete on the web callback (confirms `3c4e30d89`). U9: with a personal
access token as `Authorization: Bearer` on the **unscoped** URL, do `list_organizations`, `get_cost` and `create_project`
work (Supabase's docs example pairs the token with `project_ref`; token scoping options on the tokens page decide whether a
token can create projects), and what does `get_publishable_keys` return (must be publishable/anon only, never a secret key).

**S-G1b. Links in chat cards open in a new tab** (Sonnet, tiny).
1. Admin assistant dock: pass `onOpenLink` to `useMcpUiHost`; `https:` only; `window.open(url, "_blank", "noopener,noreferrer")`.
2. Desktop: confirm the webview's window-open handler sends it to the system browser; if not, note it for the owner.
RED: dock hook unit test "an `onOpenLink` with an https URL opens a new tab; a `javascript:` URL does nothing".

**S-G1. `agent_plugin_connect`: the Connect card** (Sonnet). Prototype-first.
1. `features/agent-plugins/connect-tool.ts` (new): descriptor + handler. Provision rows via `provisionAgentPluginMcpServers`,
   `beginConnect` for each `authMode:"oauth"` row not yet connected, open the exchange, poll the row, return
   `{status:"connected"|"waiting-for-sign-in"}`. No token, URL or id in the result text.
2. `features/agent-plugins/connect-card-ui.ts` (new): the card. Plugin display name + description from `plugin.json`; the
   sign-in link; "Connected ✓" state. Plain words only.
3. Register in `features/agent-plugins/tool-registrations.ts`; add the id to `MCP_UI_REDEEMABLE_TOOL_IDS` and a keyword line
   ("connect sign in account link database") in `tool-search-keywords.ts`.
RED: "`agent_plugin_connect` for a bundled plugin with one OAuth server returns a surface with exactly one https sign-in link and
no token; with a fake callback flipping the row to connected, it returns `{status:"connected"}`". Then screenshots of the card
in the admin chat (memory `ui_fix_needs_visual_check_before_done`).

**OB1a. Site-creation offers, read side** (Sonnet, small).
1. `manifest.ts`: parse optional `tovuSiteCreationOffer {label ≤ 60, description ≤ 200, translations?}` into
   `AgentPluginManifest` (add to `KNOWN_MANIFEST_KEYS`, `:83`); bad shape → error like any other.
2. `features/agent-plugins/site-creation-offers.ts` (new): `listSiteCreationOffers(bundledDir, locale)` → sorted
   `{pluginId, label, description}[]`, locale fallback to English. Bundled tree only.
3. `content/agent-plugins/supabase/plugin.json`: add the offer (label "Supabase database", description per 4b step 1).
RED: "a bundled plugin with an offer is listed with its localised label; one without is not; a malformed offer fails the
manifest parse".

**OB1b. Admin New site screen shows the offer list** (Sonnet). Prototype-first: owner SEES it.
1. `GET /api/admin/sites/creation-offers` next to the create route (`routes/system/sites.ts`), admin-auth like its siblings.
2. Admin: `SitesPort.listCreationOffers`, `addOns` state + toggle in `use-sites.hooks.ts`, `AddOnsSection` in
   `CreateSiteOnboarding.tsx`; delete `SupabaseVendorFields` and the `"supabase"` option/union member (5f rows 1-3);
   `createSite` sends `{name, addOns}`. Until OB2 the route answers a non-empty `addOns` with 400 `ADD_ONS_NOT_READY` (shown
   under the button), never a silent SQLite-only site (memory `no_silent_behavior_changes`).
3. `sites-i18n.ts`: remove the 5 Supabase keys in all 20 locales, add the new ones.
RED: `Sites.hooks.unit.test.tsx` "the database options no longer include supabase; an offer row renders from the port and
toggling it puts its id in the create input". Screenshots of the New site tab (memory `ui_fix_needs_visual_check_before_done`).

**S-G2. Declared default tools, applied on first sign-in** (Sonnet).
1. `manifest.ts`: parse `tovuDefaultTools {allow, write}` on remote entries (`write ⊆ allow`, bounded arrays); invalid → the
   entry is rejected like any other shape error.
2. `external-mcp-oauth.ts`: `onConnected(serverId)` port, called at the end of a successful `completeAuthorizationCallback`.
3. `features/agent-plugins/apply-connect-defaults.ts` (new): the port's implementation. Only when `provisionedByPluginId` is
   set and both lists are empty: `enabled:true`, fill lists, `setAgentPluginEnabled(true)`, `notifyExternalMcpRosterChanged()`.
RED: "after the first OAuth callback, a plugin-provisioned row with empty lists is enabled with the declared tools; a row the
operator already edited is untouched".

**R1. Remove the INV-04 block** (Sonnet). Needed before C1, because the unscoped URL is refused today.
1. `external-mcp-store.ts`: drop the `supabaseMcpScopeFailure` import and branch.
2. `assistant/index.ts`: drop the re-exports. Delete `assistant/supabase-mcp-scope.ts`.
3. Update `mcp-federation.registrations.test.ts` / `mcp-federation.trust.test.ts` where they assert INV-04.
RED: "an unscoped `https://mcp.supabase.com/mcp?features=...` row resolves to a usable connection" (fails today).

**C1. Plugin content, happy path** (Sonnet; content only). Owner SEES "I need a database" end to end.
1. `mcp.json` per section 2 (without `tovuConfirmCalls` until S-G3).
2. `plugin.json`: plain-words description, user-words keywords.
3. `SKILL.md`: rewrite to section 4 steps 1-6 plus the never-say list. No Settings, no restart, no PAT.
RED: `bundled-supabase-package.unit.test.ts` "manifest parses; `tovuDefaultTools.write ⊆ allow`; SKILL.md mentions
`agent_plugin_connect` and never 'Settings → External MCP', 'restart', 'personal access token'". Bundled digests regenerate.
Then a live run on the owner's account with screenshots (the created test project stays until the owner says to delete it; it
is a permanent delete done in Supabase's dashboard, no tool can do it).

**OB2. Create writes the pending setup** (Sonnet).
1. `init-site.ts`: `InitSiteRequired.addOns?: string[]` (name grammar only, deduped, ≤ 8); after the site is complete, write
   `.site-setup.json` (all `pending`). No file when empty. A failure before it goes through `cleanupAndRethrow` as today.
2. `routes/system/sites.ts`: parse `addOns`, validate against `listSiteCreationOffers`, 400 `UNKNOWN_ADD_ON` before anything
   is created; replaces OB1b's `ADD_ONS_NOT_READY`.
3. CLI: `tovu init --add-on <id>` (repeatable, same validation); `tovu site-offers --json` (for OB4a).
4. Admin: the "Created." line gains the add-on sentence (4b step 2).
RED: "create with `addOns:["supabase"]` writes `.site-setup.json` with one pending entry; `["nope"]` is 400 and no folder
exists afterwards; the CLI refuses `--add-on nope` with exit ≠ 0 and no folder".

**OB3. The new site's first open runs the setup** (Sonnet; two halves).
- 3a. Server: `features/agent-plugins/site-setup.ts` (read / claim / mark done under `exclusive-file-lock.ts`);
  `GET /api/admin/site-setup`, `POST /api/admin/site-setup/claim`; `agent_plugin_connect` (S-G1's handler) marks the entry
  `done` on `connected`. RED: "two concurrent claims → exactly one 200; connect-connected marks done; a site with no file lists
  nothing".
- 3b. Admin dock: on load, if a pending entry exists and the dock can send, claim; on 200 open the dock, select the plugin chip,
  send the localised offer label message. `started`-not-`done` → the "Finish setting up…" chip. Logic in a hook, not `.tsx`
  (memory `component_logic_belongs_hooks`). RED: "with a pending entry the dock sends exactly one message with the chip
  selected; a 409 claim sends nothing; no model configured → no claim". Then a live run: New site (Supabase ticked) → activate
  → open → card → Ready ✓, with screenshots.

**S-G10. Token alternative in the Connect card** (Sonnet). Owner SEES the token path after C4.
1. `manifest.ts`: `tovuTokenAuth {label ≤ 60, help ≤ 200, helpUrl https}` on remote entries.
2. **Move** (not rewrite) the masked form and its exchange handling from `features/supabase-connect/supabase-connect-ui.ts`
   and `tool-registrations.ts:219-260` into `features/agent-plugins/connect-card-ui.ts` / `connect-tool.ts`, renamed generic;
   drop the Management-API probe; add the `tools/list` probe; call G2's `onConnected` after a good save.
3. Card: when the server declares `tovuTokenAuth`, render "Or paste an access token" + field + help + link under the sign-in
   button; the tool resolves on either path.
RED: "a pasted token is saved sealed as `static_env` and never appears in the tool result or transcript; a token the probe
rejects leaves the row unchanged and the card says so; the card has no token field for a server without `tovuTokenAuth`".

**C4. Plugin content: offer + token + step 7** (Sonnet; content only).
1. `mcp.json`: `tovuTokenAuth {label:"Supabase access tokens page", help:"An access token lets Tovu set up your database
   without signing in. Make one on Supabase's Access Tokens page and paste it here.", helpUrl:
   "https://supabase.com/dashboard/account/tokens"}` (wording adjusted to U9: if scoped tokens need a setting to create
   projects, the one sentence names it).
2. SKILL.md: the kickoff message is handled like "I need a database"; step 7 once S-G11 lands (C5).
RED: manifest test "`tovuTokenAuth.helpUrl` is the Supabase tokens page and https". Then a live token-path run with screenshots.

**S-G11. Plugin site settings** (Sonnet).
1. `manifest.ts`: `tovuSiteSettings [{key, label, public?}]`.
2. `features/agent-plugins/site-settings.ts` (new): register the namespace `agentPlugin.<id>` with `ensureSettingDefinitions`
   when the plugin is enabled; `agent_plugin_site_settings` tool (get / set declared keys; secret-shaped values refused).
3. Register the tool, MCP-UI allowlist not needed (no surface), keyword line ("remember site setting").
4. Check whether ADR-028 values are carried to production by `features/settings/publish-content.ts`; `url` and
   `publishableKey` going to production is wanted (the live site uses the same database); record the finding in the commit.
RED: "an undeclared key is refused; a value starting `sbp_` or `sk_` is refused; a declared key round-trips; values carry
`originPluginId`".

**C5. Plugin content: remember this site's database** (Sonnet; content only). `plugin.json` `tovuSiteSettings`
(`projectRef`, `url` public, `publishableKey` public); SKILL.md step 7 and "read settings first". RED: SKILL.md mentions
`agent_plugin_site_settings` and `get_publishable_keys`, and never "service_role"/"secret key".

**S-G3. Confirm-before-call rules** (Sonnet; two halves).
- 3a. `manifest.ts`: parse `tovuConfirmCalls` (compile the pattern, bounded length, flags from `[imsu]` only). `trust.ts`:
  admit a `destructiveHint:true` tool only when write-granted AND covered by a rule, and only for a bundled package (G3 trust
  rule). RED: "`execute_sql` with `destructiveHint:true` is admitted with a covering rule from a bundled plugin, refused without
  one, refused for a downloaded plugin".
- 3b. `mcp-federation/registrations.ts` handler: before `callTool`, match rule → held-open `buildConfirmationSurface`; cancel
  returns `{cancelled:true}`. Needs `surfaceExchanges` injected into federation deps. RED: "`DROP TABLE x` waits for confirm and
  is not sent on cancel; `SELECT 1` is sent without a card".
Known limit, stated in the rule doc: a regex over SQL over-confirms (a `delete` inside a string) and cannot see dynamic SQL
(`EXECUTE 'DR' || 'OP ...'` in a `DO` block). Acceptable for "the user is not surprised", not a security boundary.

**C2. Plugin content, failure paths + confirm rule** (Sonnet; content only).
1. Add `tovuConfirmCalls` to `mcp.json`.
2. `references/failure-modes.md` to the section 4 table; SKILL.md free-cap branch (reuse / pause / paid).
RED: manifest test "the confirm rule matches `drop table`, `DELETE FROM`, `truncate` and not `select`".

**R2. Delete `features/supabase-connect/` and the stdio preset** (Sonnet).
1. Delete the 7 files in 5a (supabase-connect ×5, supabase-mcp ×2). S-G10 has already moved the masked form out; confirm with
   `git log --follow` on `connect-card-ui.ts` before deleting, so no generic code goes with the folder.
2. Edit `tool-catalog-manifest.ts`, `agent-daemon-server.ts`, `assistant-byok.ts`, `mcp-ui-tool-calls.ts`,
   `tool-search-keywords.ts`, `features/plugins/index.ts`.
3. Update the tests in 5c.
RED: a boundary test "no file under `apps/website/src` outside `__tests__` contains `supabase` except comment-only files on an
explicit allow list" (strip comments first, per memory on `.tsx` comment false positives). Plus the admin/published typecheck.

**R3. Delete the env-var preset registry** (Sonnet; 5d). `presets.ts`, `resolveRegisteredPresets`, `reload.ts` reference,
`registerFederationPresets` option, `index.ts` export, admin comment, comments in 5e. RED: existing bootstrap tests pass with
`params.connections` only; typecheck.

**S-G6. Re-register on redirect change** (Sonnet). v1 Slice 2 unchanged.

**OB4a. Desktop main: offers and add-ons through create** (Sonnet).
1. `contracts/project.ts`: drop `'supabase'` from `DatabaseProviderKind` and its doc lines; `CreateSiteInput.addOns?`;
   `SiteCreationOffer` DTO; `SITE_IPC_CHANNELS.creationOffers`; `SiteRecord.addOns` (from `.site-setup.json`, read like
   `readSiteIdentity`).
2. Main: run `tovu site-offers --json` once at app start via `buildCliSpawnPlan`, cache, serve on the channel.
3. `project-ipc.ts` `handleCreate`: refuse unknown add-on ids before the dialog; pass `addOns` through `adoptSiteDir` →
   `initSiteDir`'s `--add-on`.
RED: `project-ipc` test "an unknown add-on is refused before `showOpenDialog` is called; `["supabase"]` reaches the spawn args
as `--add-on supabase`".

**OB4b. Desktop renderer: the offer list** (Sonnet).
1. `CreateWebsiteOnboarding.tsx`: delete the Supabase radio and fields; add-on checkboxes from the cached offers.
2. `App.hooks.ts`: delete every Supabase field from `computeCanCreate`, `buildCreateProjectInput`, `useCreateWebsiteForm`;
   `addOns` state; `handleCreate` opens the new site's tab when add-ons were chosen.
3. `SiteGrid.hooks.ts:62`: drop the supabase branch; the card lists add-on labels, "set up when you open it" while pending.
RED: "`buildCreateProjectInput` carries `addOns` and has no supabase fields; creating with an add-on opens the new tab".
Then a live desktop run (launch via `npm run desktop`, memory on the root key) with screenshots.

**R-CUSTOM (not scheduled; coordinator asks the owner).** Delete the greyed "Custom DB Provider" option and the
`CreateSiteDatabaseInput` endpoint/credential/label fields in both apps. See 5f last paragraph.

**C3. Move `higgsfield-media` onto `agent_plugin_connect` + `tovuDefaultTools`** (Sonnet; content only). Second consumer
proves G1/G2 are generic; its SKILL.md loses the Settings steps.

**E2E. Opus review + fix pass**, then a live run of every reachable section 4 row with screenshots.

Spec: SPEC-052 needs an amendment before S-G2 lands (reverses REQ-06/11/12, drops INV-04, removes the PAT form and project
picker, brings project creation into scope). A spec agent does it; it is not a code slice.

---

## 7. Decisions I made (not for the owner)

- No plugin-owned code; the official MCP covers the whole lifecycle. Password never exists on Tovu's side.
- Drop URL project scoping (section 2). Consent picks the org; no delete tool exists; destructive SQL confirms.
- Sign-in is the consent: `agent_plugin_connect` enables the plugin on successful connect, no separate "turn on" dialog.
- Declared defaults and confirm rules are generic `tovu*` keys in `mcp.json`, next to the existing `tovuAuthMode`.
- Destructive grants and confirm rules honoured for bundled packages only; downloaded packages still need Settings.
- The Supabase PAT tool is removed; the token path lives on as the generic G10 card (the masked form is moved, not rewritten).
- v2b: the site-creation choice is a generic add-on list (G9) fed by bundled plugins' `plugin.json`; the site keeps its
  built-in storage; the token is typed in the new site's first chat card, never on the New site screen (section 4b).
- v2b: pending setup lives in a site-local `.site-setup.json`, not `content.db`, so it can never ship to or fire on production.
- v2b: kickoff is claimed once server-side before the dock sends, so two tabs or a reload never send it twice.
- v2b: desktop reads offers through a new `tovu site-offers --json` CLI (keeps `apps/desktop` a consumer of the CLI contract,
  `site-dir-store.ts:255-258`), prefetched once at app start.
- v2b: this site's project ref, URL and publishable key are remembered as generic plugin site settings (G11) in the existing
  ADR-028 store; nothing secret is stored there.
- Delete the env-var preset registry with its only consumer.
- Region picked by the model from a timezone table in the skill (the MCP needs a region code).

## 8. Owner questions (max 2)

**Q1. The "Supabase" option in the New website screen.** Creating a site (admin and desktop) shows a greyed-out "Supabase: needs
a project URL and API key" database choice. With v2, a database comes from asking the assistant, so that option asks for exactly
the things we no longer want people to see. Remove it now as part of this job, or leave it for a later site-database job?
My pick: **remove it now** (one extra removal slice; about 10 files plus 20 translations).

**Q1 is answered** (see Owner decision below; applied in v2b as G9-G11 and slices OB1a-OB4b, S-G10, S-G11, C4, C5).

**Q2.** None needed. The v2b calls (token typed in the first chat card rather than on the New site screen; Custom option left
for a separate slice) are recorded in section 7.

## 9. Risks

- G3 is the first time a remote `destructiveHint:true` tool can be admitted at all. The bundled-only trust rule and the
  fail-closed "no rule, no admission" keep it narrow; E2E must prove a downloaded package cannot use it.
- Beta endpoints (v1 C7) still apply, now behind the MCP server instead of our code; Supabase maintains that layer.
- The 5-minute exchange cap during email sign-up: G1 returns a resumable status; the skill re-calls on "done".
- Free projects pause after 7 days; `restore_project` makes waking them one call. Keep-alive stays out (v1 C7).
- v2b: a PAT is account-wide unless scoped; the G10 row holds it sealed like any `static_env` token, and the destructive-SQL
  confirm (G3) applies identically. If U9 shows scoped tokens cannot create projects, the help sentence says which option to
  pick; if unscoped tokens are the only way, that is stated in the card, not hidden.
- v2b: an admin-created site's setup waits until someone opens that site (admin creation never starts it). The All sites line
  says so; nothing pretends it already happened.

## Owner decision (2026-09-27, tovu-7a)
- Site-creation greyed-out "Supabase: needs a project URL and API key" database option: REMOVE it in this job (~10 files + 20 locales).
- SUPERSEDED same day by owner: KEEP the Supabase option at the very start of site creation. Choosing it must get the database created for them: either the agent sets it up (plugin connect + create flow) or a pasted access token creates it. Owner verbatim: "i actually want the supabase option at the very beginnning when they make a site and if they choose it they should have the agent set it up or have an access token work to create it for them"
- APPLIED in plan v2b (2026-09-27): sections 3 (G9-G11), 4b, 5f, 6, 7.
- CLARIFIED (owner, via question): the site keeps its normal built-in storage. Picking "Supabase" at site creation = create and connect a Supabase database (via the plugin) for the site to use. Setup by the agent (Connect card + create flow) OR a pasted Supabase access token. Replace the greyed-out project-URL/API-key option; do not delete the choice.
- U6 (from slice0): get_cost is blind to the free cap (always 0 for free org); cap only surfaces as the create_project error "...reached their maximum limits for the number of active free plan projects...". So the reuse/pause/paid offer is shown AFTER a failed create, not before.
