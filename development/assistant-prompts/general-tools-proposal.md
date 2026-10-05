# Should Tovu move to a small set of general tools?

Date: 2026-10-05 (revised the same day after the owner clarified the question). Design proposal only: no
code changed, no tests run.

**The question, as the owner clarified it:** instead of many narrow tools, have **one general tool per
domain**, each taking many arguments. For example one posts/content tool, one media tool, one deploy
tool and one secrets tool, each doing what 8-19 narrow tools do today. Is that a good idea? Am I
thinking about tools wrong?

## Short answer

**Yes, the domain is the right unit for writing and owning capabilities. Expose it to the model as one
tool id per domain only after one cheap measurement and three gate fixes.** Not as a single huge schema.

1. **Where the win really is.** Today each capability costs a new tool: input shape written 3 times,
   permission written twice, plus risk, manifest, keyword and doc2query entries. Recent tool commits
   touched 9-20 files. With per-domain tools, a new capability becomes **one action row** in that
   domain's table. That is what stops "a new tool for every feature", and all 31 held parity gaps
   become actions in domains that already exist (§5).
2. **The model-facing half is a separate, measurable choice.** Once actions live in a domain table, the
   model can see either one id (`media {action: "upload", …}`) or one card per action (`media.upload`).
   That is a flag on how the table is published, not a rewrite. The evidence so far:
   - One entry per family finds the right family as well as separate cards at top-10, but wins first
     place less often (38% vs 65% top-1, not significant).
   - Picking the right *action* inside one entry has not been measured. The existing harness can measure
     it in a day.
3. **Three gates assume one tool = one risk level, so one id per domain needs fixes first.** The
   read-only gate, the risk check and the audit log all key on the tool id. A media tool that can both
   read and purge would otherwise be refused under read-only runs, and its audit rows could not tell an
   upload from a purge. These are small fixes in Jini core/daemon (§3.1).
4. **It is not the same thing as the 3 meta-tools, but it sits under them.** The meta-tools are how the
   model reaches any tool. Domain tools are what it reaches (§1).

Not recommended: one domain tool whose schema is a union of every action (the posts domain alone has
46,786 chars of schema today), and a tool that proxies admin routes.

---

## 1. Domain tools vs the 3 meta-tools

Every admin chat turn today sends the model exactly 3 tools: `search_tools`, `describe_tool` and
`execute_delegated_tool {toolId, input}` (`apps/website/src/assistant/byok-tool-surface.ts:143-167`). The
spawned-CLI path uses the same jini MCP meta-tools. A real captured history showed zero direct
domain-tool calls (`ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md` §3). The 268
narrow tools are what `search_tools` searches and `execute_delegated_tool` runs.

| | meta-tools (exist) | domain tools (proposed) |
|---|---|---|
| what they are | the doorway: find a tool, read its schema, run it | the rooms: media, posts, deploy, secrets… |
| how many | 3, fixed | ~20-25 (one per domain, §4) |
| arguments | `toolId` + opaque `input` | `action` + that action's fields |
| who checks permission | nobody; they only route to the tool | the action row (permission, risk, confirm) |
| the model's flow | search "upload image" → describe → execute `media_upload_asset` | search "upload image" → describe `media` (or `media.upload`) → execute `media {action:"upload", …}` |

They stack: domain tools replace the 268 narrow tools **under** the meta-tools, and the meta-tools stay.

**Variant: publish the domain tools directly, with no search step.** About 25 domain tools with short
descriptions (~600 chars each) would be about 15K chars (~4k tokens) per turn, against under 1 KB today.
The upside is that search misses at the domain level disappear, because the model reads every domain
description. Search misses are why `tool-search-keywords.ts` exists: it was 40% top-1 before keywords
(`apps/website/src/assistant/tool-search-keywords.ts:6-23`). Each action's schema would still be fetched
on demand. Worth a later experiment (Phase 3), not a first step.

---

## 2. What exists today (verified 2026-10-05)

| fact | evidence |
|---|---|
| 268 = 252 registry tools + 16 frontend-control capabilities; 103 of 252 read-only | counted by building the live registry the parity script builds (`development/scripts/check-route-tool-parity.ts:52-58`) |
| Catalog text: 168,970 description chars + 183,090 schema chars | measured now; the model gets it piecemeal via `describe_tool` |
| Parity: 316 admin routes; 234 covered, 46 chatless, 36 gaps (5 in progress, so **31 held**) | `development/parity/route-tool-parity.json` (998a6328e) |
| `policy.authorize` is a pass-through; the real permission check runs in the handler or domain function | `node_modules/@jini-ai/core/src/registration-kit.ts:420-425` |
| Confirm cards are a handler step (`humanConfirmedHandler`); `requiresConfirmation` is never set | `registration-kit.ts:101-125`, `:426-428` |
| Risk (`sideEffects`) is one value per tool id, checked for equality at wiring time | `node_modules/@jini-ai/core/src/agent-tools.ts:1-30` |
| Read-only is decided **per tool id**, and the read-only constraint rides on the principal at the innermost executor | `node_modules/@jini-ai/core/src/tool-registry.ts:90-92`; `apps/website/src/assistant/read-only-tool-constraint.ts` header; `node_modules/@jini-ai/daemon/src/read-only-tools.ts:102-103` |
| The audit log records tool id + optional value-free `detail`, never input | `node_modules/@jini-ai/daemon/src/tool-audit.ts:18-23` |
| Tool `inputSchema` is documentation only: no validator; handlers re-parse by hand | none in `tool-executor.ts`/`registration-kit.ts`; `withSchemaOnRejection` only appends the schema to an error (`registration-kit.ts:313`) |
| Routes have hand parsers and no machine-readable schema | `apps/website/src/server/inbound/admin-http/routes/redirects/create.ts:12-41`; 0 schema libraries in routes; `openapi/*.yaml` is hand-written with `# Drift:` notes |

**The duplication, concretely (redirects):**

- The route parses the body by hand, checks `admin.redirects.manage` and calls `createRedirect`
  (`routes/redirects/create.ts:12-41`).
- The tool re-parses the same fields, checks the same permission again and calls the same function
  (`features/redirects/tool-registrations.ts:179-195`).
- On top of that: a JSON schema in `agent-tools.ts`, a risk row (`tool-registrations.ts:108`), error
  rules (`:132-139`) and keyword rows.
- Tool commits a048812a2, f1741d96b and ca9f97328 touched 20, 13 and 9 files.

### Domain-shaped precedents already shipped

| precedent | what it shows |
|---|---|
| permanent deletes: 9 ids from one spec table, one shared confirm-card handler (`features/permanent-delete/agent-tools.ts:5-20`, `tool-registrations.ts:73-86`; 137 lines total) | **the action-table pattern**: one row per action with its own permission and subject, one handler, confirm written once |
| `deployment_ops_* {platform}` with the vendor list built from the adapter registry (`features/deployments/deploy-ops/agent-tools.ts:19-25`) | a domain tool with vendors as adapters, as the owner's standing rule requires |
| `trash_item {entityType}` (`features/trash/trash-item-tool.ts:153-219`, `:344`, `:375`, `:235-236`) | per-type permission in the handler works; the cost is that risk must be declared as the strongest member (`deletes-durable-state`) |
| `content_read.<resource>` (28 cards, one handler; `apps/website/src/assistant/content-read-tool.ts:132-178`, `:206-221`) | one handler with per-resource cards, and the remap needed when ids are retired |
| `content_duplicate {resource}` with placeholder permission `"resolved-per-resource"` (`features/content-duplication/agent-tools.ts:74-82`) | what catalog-level permission visibility looks like once one id spans several permissions |
| `plugins_uninstall {family}` (`server/runtime/composition/tool-catalog-manifest.ts:327-331`) | merging one verb across families inside a domain |

---

## 3. Option A (central): one general tool per domain

**Concretely:** a domain declares an action table. Each row is
`{ action, inputSchema, permission, sideEffects, confirm?: "human", run: featureFn, errors, keywords, http? }`.
That is the permanent-delete spec table generalized to every verb. The domain publishes as one tool
(`media`), or as one card per action (`media.upload`); §3.2 covers the choice. Vendors are adapters
inside a domain (deploy, secrets, media generation), as the owner's rule requires.

Size of today's domains (from the live catalog; some ids are prefix-grouped approximations):

| domain | narrow tools today | of which read-only | schema chars | description chars |
|---|---|---|---|---|
| posts (`content_post_*`, stats, duplicate, read card) | 8 | 4 | **46,786** | 11,963 |
| media (incl. generation, import, purge) | 11 | 3 | 8,554 | 8,836 |
| deploy (deployment_*, domain DNS) | 19 | 13 | 7,747 | 19,507 |
| secrets (custom credentials, propose/delete credential) | 13 | 2 | 8,684 | 20,213 |
| newsletter | 17 | 4 | 5,581 | 5,473 |
| identity (users, roles, policies) | 17 | 4 | 4,308 | 6,097 |
| theme | 13 | 3 | 8,781 | 7,884 |
| comments | 8 | 2 | 3,987 | 2,137 |

Every domain mixes read-only and writing actions, and most also mix in deletes and permanent deletes.
That mix is what decides the costs below.

### 3.1 Trade-offs, checked against the actual gates

- **Permission (works today).** Policy is pass-through and the real check runs in the handler, so each
  action row checks its own permission, as `trash_item` does per kind. The cost is that a reviewer no
  longer sees one permission per tool id; they read the action table instead. The comments domain
  needs `comments.moderate` for approve/spam/restore, `comments.delete` for trash and
  `comments.delete.force` for purge. Per action that is fine; per tool it would over- or under-grant
  (audit §4).
- **Confirmation (works today).** Only permanent deletes need the card, and the card is already a
  handler step, so a `purge` row uses `humanConfirmedHandler` and the other rows don't.
- **Risk and read-only (needs a fix for one-id exposure).** `sideEffects` is one value per id, and
  `isReadOnlyTool` takes only the descriptor. A one-id `media` tool must declare
  `deletes-durable-state`, the same compromise `trash_item` makes. The read-only constraint
  (`read-only-tool-constraint.ts`) would then refuse even `media {action:"list"}`. **Fix (Jini):** a
  descriptor field `actions: {name, sideEffects, readOnly}[]`, and make
  `isReadOnlyTool({descriptor, input})` look up the action. Without it, the read-only paths lose every
  domain read.
- **Audit (needs a small fix).** Rows record `toolId` only. **Fix (Jini daemon):** put the action name
  in the existing value-free `detail` field. It is a fixed label, not input, so it stays within that
  field's "never raw input" rule.
- **Schema size and looseness.** A single union schema for posts would send ~47K chars in one
  `describe_tool` result and hide each action's required fields inside a conditional. That is the
  failure the audit warns about, where `update` needs a concurrency token and `create` does not.
  **Fix:** `describe_tool` takes `media` (returns the action list with one-line purposes) or
  `media.upload` (returns that one action's schema). Validate input against the row's schema, so the
  hand re-parse goes away; today no validator exists at all.
- **Search (one entry per domain).** The repo's own evals show one entry built from the members' real
  text matches separate cards at top-10 but leads less often: 97% vs 85% top-10 and 38% vs 65% top-1 on
  the affected cases, none of it significant (`ADS-memory/reports/2026-09-08-parent-tool-read-eval.md`,
  Addendum 2). A domain entry is denser in its own nouns than a cross-domain one, so it should do at
  least as well, but that is unmeasured.
- **Picking the action (the open risk).** For a type argument the measurements are good: 34/34 correct
  on requests the tool serves (`ADS-memory/reports/2026-09-08-argument-fill-eval.md`). The danger seen
  there was bare-noun options pulling in requests the tool should decline. Options that name the verb
  fixed it (5/96 false fills). A domain tool's options *are* verbs, so it should behave like that
  verb-named arm. But "upload vs import from URL vs generate" inside media has never been measured.
- **Domain boundaries are a naming problem.** `content` vs `pages` vs `collections`; `deploy` vs
  `publish` vs `backup` vs `source control`. The `page.navigate` incident shows how one noun meaning
  two things misleads the model (audit §4). Domains should follow the words the owner uses in the
  admin UI, one noun each.
- **Overlap with cross-domain families.** `trash_item`, `content_read` and `content_duplicate` cut
  *across* domains, so "trash this image" would have two paths (`media trash` and `trash_item`). Owner
  rule [[generic_mechanism_must_absorb_old_paths]]: pick one model-facing path. Proposal: domain
  actions are the path. The cross-domain families become shared *implementations* that domain rows
  call. The Trash screen's own operations (list, restore, purge, empty) stay as a `trash` domain.
- **Migration and evals.** Retiring ~250 ids strands eval ground truth, keyword keys, description prose
  and parity entries. The 35-id read collapse needed a remap table (`content-read-tool.ts:206-221`). The
  delete eval scored 66% instead of 87% until 38 stale cases were remapped
  (`2026-09-08-content-delete-eval.md` §2.2). A stale reference still ships: `menus_assign_location`
  points at retired ids (`capability-prompts.md`, Known gaps). Per-action cards (`media.upload`) need
  the same remap but keep one card per action.
- **Token cost:** unchanged with meta-tools. About +4k tokens per turn in the direct-publish variant (§1).

### 3.2 One id per domain, or one card per action?

| | one id per domain (`media`) | one card per action (`media.upload`) |
|---|---|---|
| matches the owner's picture | yes | partly: the code is per domain, cards are per action |
| search | domain nouns dense; top-1 unmeasured for domains | measured: equal to today |
| action choice | made by the model when filling the action argument (unmeasured) | made by search (measured) |
| read-only/risk/audit | needs the 3 Jini fixes above | works today (each card has its own risk) |
| ids retired | ~250 | ~250, but each maps 1:1 to a card |

Both come from the same action table. **Build the table first and publish cards. Run the per-domain
arm of the argument-fill eval. Switch to one id per domain if action choice is ≥95% and top-10 holds.**

---

## 4. Proposed domains (owner nouns, ~22)

posts · pages · collections · media · menus · widgets · forms · comments · taxonomy · newsletter ·
theme · seo-redirects · users-access (users, roles, policies, members, API keys) · settings ·
plugins (plugins, agent plugins, skills) · integrations (external MCP, webhooks) · secrets (all saved
credentials; vendors as adapters) · publish (live publish, peers, backstop, pull) · deploy (hosting,
DNS, static export; vendors as adapters) · backup-restore (site backup, restore points, change sets,
recovery, database) · trash · site-system (profile, sites, logs, status, analytics, mail, commerce).

Unchanged: the 16 frontend-control capabilities (`page.*`, `chat.*`) and assistant UI helpers
(`assistant_render_ui`, choice cards). They drive the chat itself and belong to no admin domain.

**What goes to Jini:**
- the action-table contract and its registration (beside `buildDomainRegistrations` in `@jini-ai/core`);
- action-aware `isReadOnlyTool`, risk and audit `detail`;
- per-action `describe_tool`;
- schema validation of input;
- the HTTP binding that generates the admin route from a row (`@jini-ai/http-kit`);
- the vendor-adapter registry shape (generalize `deploy-ops/registry.ts`);
- the generic half of the parity checker (`development/scripts/lib/route-tool-parity.ts`).

**What stays in Tovu:** the domain tables, the vendor adapters and the manifest.

---

## 5. Comparisons

### Option B: cross-domain resource verbs `list/get/create/update/delete {type, …}`

- **The same idea, cut the other way.** One tool per verb across all domains, instead of one tool per
  domain across all verbs.
- **What it gets right:** risk is the same for every type within a verb, so the read-only gate, risk
  check and audit work today. That is why read (`content_read`), soft delete (`trash_item`), permanent
  delete and duplicate were built this way.
- **Where it fails:** create/update. A redirect, a campaign and a role share no fields, so
  `create {type, fields}` is either opaque or a union of ~20 shapes.
- **What the owner gets:** nothing they asked for, because a new feature still means touching several
  verb tools.
- **Verdict:** keep as the *implementation* of shared verbs underneath domain rows, not as the
  model-facing shape.

### Option C: route-derived catalog (every admin route callable through one guarded "admin action" tool)

- **It mostly exists already.** `execute_delegated_tool` already is the one guarded tool.
- **What's wrong with deriving from routes:**
  - routes have no machine-readable schemas;
  - they return HTTP/UI shapes, not model-facing errors;
  - 46 routes are rightly chatless (sessions, streaming, and secrets "must not pass through the model");
  - a confirm card can't be held open across a request/response;
  - nothing dispatches routes in-process;
  - "POST /redirects" carries no operator vocabulary, which brings back the 22% thin-description
    search result (read eval §3).
- **Verdict:** go the other direction. Domain action rows **generate** routes (the optional `http`
  binding), and the existing `check-route-tool-parity.ts --strict` (`:94-96`) keeps every route either
  an action or chatless with a reason.

### Vendor adapters

Not a separate option. Deploy, secrets and media generation are domain tools whose vendors are adapters.
That is already the rule.

---

## 6. The 31 held gaps under Option A

Every gap becomes an **action row in a domain that already exists**, so no new tool is needed. The work
per gap is the row plus its feature function.

| route(s) | domain → action |
|---|---|
| POST `api-keys/:id/revoke`, POST `api-keys/principals` (2) | users-access → `revoke_api_key`, `create_api_principal` (the key mint itself stays chatless) |
| POST `users/:id/reset-password` (1) | users-access → `reset_password`, only with a secret-entry form (owner question) |
| POST + DELETE `policies/:id/permissions` (2) | users-access → `set_policy_permissions` |
| GET/PUT `assistant/settings` (2) | settings → existing get/set, once `site.assistant.*` is registered as a settings definition |
| POST `settings/definitions`, POST `settings/reset` (2) | settings → `define`, `reset_namespace` |
| GET `mcp-servers/tool-approvals`, DELETE `…/tool-approvals/:toolName`, DELETE `mcp-servers/:id/oauth` (3) | integrations → `list_approvals`, `revoke_approval`, `disconnect_oauth` |
| POST `media/:id/replace` (1) | media → `replace_file` |
| POST newsletter `subscriptions/import` (1) | newsletter → `import_subscribers` |
| GET + POST `plugins/:id/preview` (2) | plugins → `preview` |
| GET `skills`, DELETE / PATCH `skills/:toolId` (3) | plugins → `list`/`uninstall`/`set_enabled` with `family:"skill"` |
| GET/POST/PATCH/DELETE `publish-content/peers` (4) | publish → `list_peers`, `add_peer`, `update_peer`, `remove_peer` |
| POST `publish-content/backstop`, GET `…/backstop/status`, GET `runs/:runId/backstop`, POST `…/undo-backstop` (4) | publish → `backstop_send`, `backstop_status`, `backstop_log`, `backstop_undo` (sends are **on HOLD** with live publish) |
| POST `system/publish/credentials/:id/verify` (1) | secrets → `verify` (kind: publish credential) |
| GET `system/deployment-overview`, `module-status`, `observability-status` (3) | site-system → `status` with `section` |

That is 31 routes and 0 new tools: about 25 action rows, 2 of which wait on the publish HOLD and 1 on
the owner's password-reset answer. Six of the 31 can close today as rows in families that already exist
(skills ×3, assistant settings ×2, settings reset), before any domain kit is built.

---

## 7. Phased plan

**Phase 1: prototype one domain end to end (small, reversible): comments.**

- **Why comments:**
  - 8 tools, small;
  - mixed permissions (moderate / delete / delete.force);
  - mixed risk (none / mutates / deletes / permanent with a confirm card);
  - it is the exact family the 2026-09-07 audit used as the argument *against* merging.
  - Redirects would be easier but tests nothing, since it has one permission. Media is the better
    second step: its catalog is partly `@jini-ai/cms`-owned and it has vendor adapters.
- **Build:**
  - the action-table kit with schema validation;
  - per-action `describe_tool`;
  - action-aware read-only, risk and audit (behind a flag in Jini);
  - the `http` binding for comment routes, so the admin UI keeps the same URLs and JSON.
- **Measure:**
  - (a) action choice, with a per-domain arm added to `development/evals/tool-search-argument-fill.eval.ts`;
  - (b) heldout-v2 retrieval for comment cases, one-id vs cards;
  - (c) the read-only run refuses `purge` and allows `list`;
  - (d) the audit row names the action;
  - (e) the confirm card still appears only for purge;
  - (f) files and lines per new action compared with today.
- **Reversible:** the old ids stay until the prototype is accepted.

**Phase 1b (in parallel, no kit needed):** close the 6 gaps that are rows in existing families
(skills ×3, assistant settings ×2, settings reset).

**Phase 2:** if Phase 1 passes, convert media (vendor adapters, cms-owned catalog), then secrets and
deploy, the owner's examples. Close the remaining gaps as rows of their domains. Retire old ids with a
remap table, and update eval ground truth in the same commit.

**Phase 3:**
- convert remaining domains only when each is touched anyway;
- turn on `check-route-tool-parity --strict` in the gates;
- try the direct-publish variant (§1) as a measured experiment.

**Never:** one union schema per domain sent in a single describe; a route-proxy tool; two model-facing
paths for the same action.

---

## 8. Questions for the owner

1. Do these ~22 domains (§4) match how you think about the admin? Especially: should publish and deploy
   be one domain or two?
2. When a domain and a cross-domain tool overlap (for example "trash this image"), OK that the domain
   tool becomes the only path and `trash_item` / `content_read` become internal?
3. OK to prototype on **comments** first, with its admin routes generated from the same action table
   (same URLs and responses)?
4. Should resetting another user's password stay out of chat for good, or get a secret-entry form?
