# Should Tovu move to a small set of general tools?

Date: 2026-10-05. Design proposal only: no code changed, no tests run.
Question (owner, paraphrased): can we have a few general, flexible tools that take arguments, so we stop
writing a new tool for every feature? Is that a good idea? Am I thinking about tools wrong?

## Short answer

Partly yes, partly no. And the owner is half thinking about tools wrong, in a way that helps.

1. **The model already uses only 3 general tools.** Every admin chat turn sends the model `search_tools`,
   `describe_tool` and `execute_delegated_tool {toolId, input}`, not the catalog
   (`apps/website/src/assistant/byok-tool-surface.ts:143-167`; the spawned-CLI path uses the same jini MCP
   meta-tools, `ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md` §3, which found zero
   direct domain-tool calls in a real captured history). So "one guarded tool that takes arguments"
   already exists. The 268 "tools" are really a **catalog of operations**: index cards the model searches,
   each with its own schema.
2. **The real cost is the ceremony per operation, not the number of operations.** Adding one capability
   today means writing the input shape three times (route parser, tool parser, JSON schema), the
   permission twice (route and tool), plus a risk entry, a manifest line, search keywords and
   doc2query text (evidence below). A general tool does not remove that ceremony. One declaration per
   operation, with both the route and the tool derived from it, does.
3. **Merge verbs, never nouns, and keep one search card per type.** Measured on this catalog, one
   "fat" generic entry finds the right family as well as separate cards at top-10, but it loses first
   place (38% vs 65% top-1). With bare-noun options it also wrongly answers 72 of 75 requests that
   wanted a change, where separate cards turned down all 75. Generic handlers are fine. The model
   should still see one card per type.

**Recommended shape (hybrid):** keep the 3 meta-tools. Add an **operation declaration kit**: each operation
declares its input schema, permission, risk and feature function once, and the tool and the admin route
are both generated from that. Where a verb works the same way for many types (read, trash, permanently
delete, duplicate, enable/disable, uninstall), use a **table-driven verb family**: one handler, one row
per type, and each row becomes its own card. For external services, use **category tools with vendor
adapters**. Do **not** build a single fat `create/update {type, …}` tool. Do **not** build a tool that
proxies admin routes.

---

## 1. What exists today (verified 2026-10-05)

| fact | evidence |
|---|---|
| 268 operations = 252 registry tools + 16 frontend-control capabilities | counted by building the live registry the parity script builds (`development/scripts/check-route-tool-parity.ts:52-58`); 103 of 252 declare `readOnly` |
| Catalog text is large; the model never receives it whole | descriptions 168,970 chars + schemas 183,090 chars across 252 tools (measured now); the 3 meta-tool descriptors are under 1 KB (`byok-tool-surface.ts:143-147`) |
| Parity: 316 admin routes, 234 covered, 46 chatless, 36 gaps (5 in progress, so **31 held**) | `development/parity/route-tool-parity.json` (commit 998a6328e) |
| `policy.authorize` is a pass-through `allow` for every tool; the real permission check runs inside the handler or the domain function | `node_modules/@jini-ai/core/src/registration-kit.ts:420-425` |
| `requiresConfirmation` is never set; the confirm card is a handler step (`humanConfirmedHandler`) | `registration-kit.ts:426-428`, `:101-125`; executor-level confirm exists but is unused (`node_modules/@jini-ai/daemon/src/tool-executor.ts:409-412`) |
| Risk (`sideEffects`) is one value per tool id and is checked for equality at wiring time | `node_modules/@jini-ai/core/src/agent-tools.ts:1-30` |
| The read-only gateway decides per tool id | `node_modules/@jini-ai/daemon/src/read-only-tools.ts:102-103`, `tool-registry.ts:90-92` |
| The audit log records the tool id and never the input | `node_modules/@jini-ai/daemon/src/tool-audit.ts:18-23` |
| Tool `inputSchema` is documentation only; nothing validates input against it. Handlers re-parse by hand | no validator in `tool-executor.ts`/`registration-kit.ts`; `withSchemaOnRejection` only appends the schema to an error (`registration-kit.ts:313`) |
| Routes have hand-written parsers and no machine-readable schema | e.g. `apps/website/src/server/inbound/admin-http/routes/redirects/create.ts:12-41`; 0 schema libraries in routes; `openapi/*.yaml` is hand-written, covers 16 areas, and carries `# Drift:` notes |
| Search ranks with FTS5 BM25 over id + description (no stemming); operator vocabulary has to be added by hand | `apps/website/src/assistant/tool-search-keywords.ts:6-23` |

### The duplication, concretely (redirects)

- The route parses the body by hand (`routes/redirects/create.ts:12-41`), checks `admin.redirects.manage`
  and calls `createRedirect`.
- The tool re-parses the same fields with `requireString`/`requireNumber`, checks the same permission
  again and calls the same `createRedirect` (`apps/website/src/features/redirects/tool-registrations.ts:179-195`).
- On top of that: a JSON schema in `features/redirects/agent-tools.ts`, a risk-map row
  (`tool-registrations.ts:108`), model-facing error rules (`:132-139`) and keyword rows.
- Recent tool additions touched 9-20 files each, mostly this boilerplate (`git show --stat` of a048812a2
  `system_read_server_logs`, f1741d96b `sites_create_site`, ca9f97328 `theme_set_active`). The biggest
  single cost in each was moving route logic into a shared feature function. The owner's "chat and UI
  call the same function" rule requires that move whatever shape tools take.

### Generic precedents already shipped

| precedent | shape | how it declares types / permission / risk |
|---|---|---|
| `content_read.<resource>` (28 cards over 35 old read tools) | one shared handler; **one id and search card per resource** | static table, permission copied per card (`apps/website/src/assistant/content-read-tool.ts:132-178`); retired ids are remapped (`:206-221`) |
| `trash_item {entityType, entityId}` | one id; type is an argument | delegate table (`features/trash/trash-item-tool.ts:153-219`) plus live registry kinds (`:455-457`); permission checked per kind in the handler (`:344`, `:375`); risk set to the strongest member, `deletes-durable-state` (`:235-236`); catalog floor permission `content.read` (`:240`) |
| `content_duplicate {resource}` | one id; type is an argument | per-resource handler registry; catalog permission is the placeholder `"resolved-per-resource"` (`features/content-duplication/agent-tools.ts:74-82`) |
| permanent deletes (9 ids) | **one table row per type, each its own id**, one shared confirm-card handler | `features/permanent-delete/agent-tools.ts:5-20`, `tool-registrations.ts:73-86`; 137 lines for 9 tools |
| `deployment_ops_* {platform}` | category tool; vendors are adapters | platform enum built from the adapter registry (`features/deployments/deploy-ops/agent-tools.ts:19-25`) |
| `plugins_uninstall {family}` | one verb across two plugin families | merged in S4 (`server/runtime/composition/tool-catalog-manifest.ts:327-331`) |

The permanent-delete table is the cleanest model: types plug in as data, every type keeps its own card,
permission and audit name, and the confirm handler is written once.

---

## 2. What the measurements say about generic tools

All from this repo's own evals on the real catalog (n=130 held-out phrasings):

- **Finding the tool.** One fat entry built from the members' real text matches separate cards at
  top-10: 97% vs 85% on the affected cases, and not significant on the whole set. **It loses first
  place**, 38% vs 65% top-1 ("always present, rarely first",
  `ADS-memory/reports/2026-09-08-parent-tool-read-eval.md`, Addendum 2). The agent tends to take the
  first result that matches its plan, so first place matters. A fat entry with a hand-written generic
  description collapses to 22% top-10 (same report, §3).
- **Filling the `type` argument.** On requests the tool can serve, picking the right type is free: 34/34
  for both fat and card designs. On requests it **cannot** serve, a fat read tool with bare-noun options
  returns a read on **72 of 75 requests that wanted a change**. Separate cards decline all 75. Options
  that name the verb fix it (5/96 false fills)
  (`ADS-memory/reports/2026-09-08-argument-fill-eval.md`, §3). For delete, no shape over-triggers.
- **Per-turn token cost:** unchanged either way. The model sees the 3 meta-tools whatever the catalog
  size (audit §3). What changes is the `describe_tool` payload: a fat union schema sends every type's
  fields, while a card sends one type's.
- **Schema looseness.** Merging create and update into one tool forces either a loose schema (the model
  can drop the concurrency token `update` needs) or a large conditional schema (audit §4).

---

## 3. The three options

### Option 1: resource verbs `list/get/create/update/delete {type, …}` over a type registry

- **In this codebase:** read is done (`content_read`), soft delete is done (`trash_item`), duplicate is
  done (`content_duplicate`), permanent delete is done (the table). What's left is create/update: about
  31 tools by verb count (18 create, 13 update).
- **What would collapse:** none of the create/update tools usefully. Their inputs share nothing (a redirect
  has `matchType/fromPattern/statusCode`; a campaign, a post and a role are unrelated shapes). A single
  `create {type, fields}` would have either an opaque `fields` that the model guesses at, or a union of
  about 20 shapes. Using one card per type (`create.redirect`, …) is just today's tools renamed.
- **Permissions/risk:** fine within one verb. Risk is the same for every type of a verb (create mutates,
  delete deletes), so the per-tool `sideEffects` check and the read-only gateway still work. Permission
  per type is already handled in handlers (`trash_item`). Across verbs it breaks: `trash_item` already
  had to declare the strongest risk, and the comments family shows one permission can't cover
  moderate + delete (audit §4).
- **Audit:** a fat id logs `create` without the type, because the audit never stores input
  (`tool-audit.ts:18-23`). Cards keep the type in the id.
- **Evals:** every id retirement strands ground truth and descriptions. The delete eval had 38 of 130
  stale cases until it remapped them (`2026-09-08-content-delete-eval.md` §2.2). A stale reference
  still ships today: `menus_assign_location` points at retired `menus_list_menus`
  (`capability-prompts.md`, Known gaps side note).
- **Verdict:** right for **uniform verbs** (read, trash, permanent delete, duplicate, restore,
  enable/disable, uninstall, status reads). Wrong for create/update.

### Option 2: category tools with vendor adapters

- **In this codebase:** `deployment_ops_*` already works this way. The vendor list comes from the adapter
  registry (`deploy-ops/agent-tools.ts:19-25`), as the owner's standing rule asks (never a per-vendor tool).
- **What would collapse:** credentials and connections are spread across custom credentials (7 tools),
  three `*_propose_*credential` tools, two more `*_delete_*credential` tools and several held gaps
  (verify publish credential, disconnect MCP OAuth, publish peers). Media providers already follow this
  pattern partly (`media_list_providers`, `media_generate_asset`).
- **Trade-off:** vendor-specific fields leak into the shared description. `deployment_ops_deploy`
  already carries GitHub-Actions-only prose (`deploy-ops/agent-tools.ts:34`). Adapters should declare
  their extra fields, and `describe_tool` should show them only for that vendor.
- **Verdict:** yes, for anything external (deploy, secrets/credentials, DNS, media generation, email,
  later payments). It stays the rule.

### Option 3: every admin route callable by construction (one guarded "admin action" tool)

- **In this codebase:** the "one guarded tool" half already exists as `execute_delegated_tool`. What's
  missing is route → tool derivation.
- **Why route-derived is the wrong direction:**
  - Routes have no machine-readable input schema (hand parsers; OpenAPI hand-written and drifting), so
    every one of the 316 routes would need a schema first.
  - Route results are HTTP status + UI JSON. The model needs model-facing error codes
    (`REDIRECTS_MODEL_FACING_RULES`, `features/redirects/tool-registrations.ts:132-139`).
  - 46 routes are rightly chatless: sessions, streaming, and secrets such as the API-key mint, which
    "must not pass through the model" (parity file).
  - The confirm card holds the call open mid-handler (`registration-kit.ts:101-125`). A request/response
    route can't do that.
  - Nothing dispatches a route in-process today, so it would be new plumbing.
  - Route-derived descriptions ("POST /redirects") have no operator vocabulary. That reproduces the
    22% thin-description result in §2.
  - It makes the parity check pass by construction without making the operations usable.
- **The useful half:** parity enforcement already exists (`check-route-tool-parity.ts --strict`,
  `:94-96`). Derive in the **other direction**: one operation declaration produces both the route and
  the tool.
- **Verdict:** no route proxy. Keep the parity check, and make new routes come from operation
  declarations.

---

## 4. Recommended shape

```
model sees:   search_tools · describe_tool · execute_delegated_tool       (unchanged)
                                   │
catalog:      one card per operation or per type (ids stay specific: content_read.redirect, trash_item…)
                                   │
built from:   (a) defineOperation({...})       one-off operations; route + tool from ONE declaration
              (b) verb family table             uniform verbs; one handler, one row per type
              (c) category + vendor adapters    external services
                                   │
gate:         ToolExecutor (unchanged) → handler validates against the declared schema,
              checks the row/op permission, asks the human only for permanent deletes
```

**`defineOperation` (new, belongs in Jini `@jini-ai/core` beside `buildDomainRegistrations`):**
`{ id, noun, verb, inputSchema, permission | resolvePermission(input), sideEffects, confirm?: "human",
run: featureFn, errors: ModelFacingErrorRule[], keywords?, http?: { method, path, mapParams, mapResult } }`.

- **Tool:** the schema is validated once, so the hand re-parse goes away, and the permission is checked
  once. The registration goes through the existing `buildDomainRegistrations` gates.
- **Route:** the optional `http` binding generates the Express route (an adapter in `@jini-ai/http-kit`).
  The admin UI keeps its URLs and responses.
- **Parity:** an op with an `http` binding links route ↔ tool automatically, so the parity JSON entry
  writes itself.
- **Search:** `noun`/`verb`/`keywords` feed the card text, replacing separate rows in
  `tool-search-keywords.ts`.
- Adding a capability becomes one file in the feature plus one manifest line, instead of 9-20 files.

**Verb families (generalize the permanent-delete table into a Jini contract):** a family declares its verb,
risk and shared handler, and each type contributes `{type, permission, schema?, run}`. Each row is
published as its own id/card (`content_read.<type>` style). Search, audit and the read-only gateway then
keep working per type. Owner rule [[generic_mechanism_must_absorb_old_paths]]: when a family absorbs a
type, that type's old tool id is retired and remapped (the `currentToolIdFor` pattern,
`content-read-tool.ts:206-221`), never left standing beside it.

**What stays Tovu-only:** the type rows and vendor adapters themselves, the manifest, and the parity file.
**What goes to Jini:** `defineOperation`, the verb-family contract and card derivation (today copied
between `content-read-tool.ts`, `trash-item-tool.ts` and `permanent-delete/`), the HTTP binding adapter,
the category/adapter registry shape (generalize `deploy-ops/registry.ts`), and the parity checker's
generic half (`development/scripts/lib/route-tool-parity.ts`).

### Migration cost: what collapses, what stays

| group | today | under the proposal |
|---|---|---|
| Reads (`content_read.*`) | 28 cards over 35 ops | moves onto the family contract; ids unchanged |
| Soft delete (`trash_item`) + the per-type trash tools it wraps | 1 + 5 | family contract; delegates stay internal |
| Permanent delete | 9 ids, one table | already this shape; moves onto the shared contract |
| Duplicate, uninstall, enable/disable | `content_duplicate`, `plugins_uninstall`, `plugins_set_enabled`, user/member/webhook disable-style tools (~6) | enable/disable becomes a family; ids stay specific |
| Credentials / connections | ~12 tools across custom-credential, propose, delete | category tool with kind adapters |
| Create / update / domain verbs (publish, schedule, assign, merge…) | ~140 | **stay distinct ids**; rewritten to `defineOperation` one feature at a time, as features are touched |
| Chat-only tools (fetch, evidence, assistant UI, demo) | ~50 | unchanged |
| Frontend control (`page.*`, `chat.*`) | 16 | unchanged |

The id count barely changes, and it shouldn't, because ids are search cards. The saving is code per
operation and new gaps closing by **adding a row instead of writing a tool**.

---

## 5. The 31 held gaps under this shape

| route(s) | under the proposal |
|---|---|
| GET/PUT `assistant/settings` (2) | **no new tool**: register `site.assistant.*` as a settings definition so `settings_get_effective`/`settings_set_value` cover it |
| GET `skills`, GET `mcp-servers/tool-approvals`, GET `publish-content/peers`, GET `runs/:runId/backstop` (4) | **read-family rows** (`content_read.skill`, `.mcp_tool_approval`, `.publish_peer`, `.backstop_log`) |
| GET `system/deployment-overview`, `module-status`, `observability-status`, `publish-content/backstop/status` (4) | **read-family singleton rows**, like the existing `content_read.workspace` |
| DELETE / PATCH `skills/:toolId` (2) | **rows** in the existing `plugins_uninstall` / `plugins_set_enabled` families (`family: "skill"`) |
| POST `system/publish/credentials/:id/verify`, DELETE `mcp-servers/:id/oauth`, POST/PATCH/DELETE `publish-content/peers` (5) | **credentials/connections category**: verify and disconnect by kind; peers become named targets of `publish_content_connect`/`_disconnect` |
| POST `api-keys/:id/revoke`, DELETE `mcp-servers/:id/tool-approvals/:toolName` (2) | **revoke-access family rows** (same risk, separate permissions) |
| POST `settings/reset` (1) | extend `settings_clear_value` with a namespace scope (one op, no new id) |
| POST `media/:id/replace`, POST newsletter `subscriptions/import`, GET+POST `plugins/:id/preview`, POST + DELETE `policies/:id/permissions`, POST `settings/definitions` (7 routes → 5 ops) | new **`defineOperation`** ops (the policy add/remove pair can be one `identity_policy_set_permissions`) |
| POST `publish-content/backstop`, POST `runs/:runId/undo-backstop` (2) | new ops, **on HOLD** with live publish |
| POST `api-keys/principals` (1) | new op; the key mint itself stays chatless |
| POST `users/:id/reset-password` (1) | stays chatless unless the owner wants a secret form (see questions) |

That's 31 routes. **20 close without a new hand-written tool** (settings definition, family rows, category
kinds, one extended op). 10 routes need new operations (8 ops, 2 of them on HOLD), and 1 stays chatless.

---

## 6. Phased plan

**Phase 1: prototype on one real feature (small, reversible).** Build `defineOperation` plus its HTTP
binding, and convert **redirects** end to end: create, update, tombstone, import, hits, and the
`content_read.redirect` card.

- **Why redirects:** one permission, model-facing errors already written, no confirm, no vendor, 5-7
  routes.
- **Success means:**
  - the admin UI is byte-identical (same URLs, same JSON);
  - tool ids are unchanged;
  - the hand parser and duplicate permission check are gone;
  - the tool input is validated by the schema;
  - the heldout-v2 retrieval numbers for redirect cases are unchanged;
  - the parity entry is generated;
  - a count of lines and files compared with today.
- **Reversible:** the old route/tool files are kept until the prototype is accepted.

**Phase 1b: same week, no new kit needed.** Close 4 held gaps by adding rows only: the skills
list/uninstall/enable rows and the MCP-approvals read row. This proves the claim that a gap closes by
adding a row.

**Phase 2.** Move the verb-family contract into Jini and move `content_read`, `trash_item`, permanent
delete, duplicate and enable/disable onto it. Add the status-read rows, the credentials/connections
category and the revoke family. That closes the remaining 16 no-new-tool gaps.

**Phase 3.** Convert other features to `defineOperation` only when a feature is touched anyway, with no
big-bang. Turn on `check-route-tool-parity --strict` in the gates so a new admin route without an op or a
chatless reason fails.

**Never:** a fat `create/update {type, fields}` tool, or a route-proxy "admin action" tool.

---

## 7. Questions for the owner

1. Is the pain mainly **how much code each new capability takes** (what this proposal fixes), or **the
   assistant not finding or using things** (already handled by search, and not fixed by fewer tools)?
2. OK to prototype on **redirects**, with its admin routes generated from the same declaration as the
   tool (same URLs and responses)?
3. The model will still see specific cards (for example "read redirects"), not one bare "read" tool,
   because measured first-place accuracy drops by about a third with one entry. Fine?
4. Should resetting another user's password stay out of chat for good, or get a secret-entry form?
