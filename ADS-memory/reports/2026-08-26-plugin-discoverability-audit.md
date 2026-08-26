# Plugin discoverability audit: two Agent Plugins + the live Word Count miss

Date: 2026-08-26. Read-only investigation (QA/E2E agent). Every claim below is labeled
**VERIFIED** (confirmed by running something against the live daemon or reading the exact
enforcing code) or **INFERRED** (reasoned from adjacent evidence, not directly executed).

Live daemon used for verification: PID 5231/5232 (`tsx` -> `node
src/server/agent-daemon/agent-daemon-server.ts`), **boot time 11:20 AM PDT today** (confirmed via
`ps`, current time was 1:56 PM PDT at time of testing) — **VERIFIED**.

---

## Q1 — are the two Agent Plugins actually live?

### `ui-ux-design` — ACTIVE and registered

- Installed on disk at `infra/agent-plugins/ws/workspace-local/packages/sha256/f64f...`, mtime
  Aug 21 14:50:59 — **VERIFIED** (well before today's boot).
- Not listed in `activations.json` at all. `features/agent-plugins/activation.ts`'s
  `isAgentPluginActive()` treats an absent record as **active** — this is documented, deliberate
  behavior ("presence implies consent only for packages an operator put there... a plugin already
  installed on every existing instance got there by an operator explicitly running the install
  command — that IS the consent") — **VERIFIED by reading the enforcing code**.
- Registered as a real tool in the live catalog: **VERIFIED live**.
  `GET /api/tools/agent_plugin_ui_ux_design` (bearer-authed, via the daemon's own minted
  `TOVU_AGENT_DAEMON_TOKEN`) returns 200 with a full description naming all 7 bundled skills
  (frontend-accessibility, gstack-design, interface-design, shadcn-ui, ui-ux-design,
  vercel-web-design-guidelines, web-compliance) and an `inputSchema` with a `skill` enum of the
  same 7 names.
- Tool id: `agent_plugin_ui_ux_design`, `source: "agent"`.
- Sanity-replayed the prior 2026-08-24 report's two queries against today's boot: still ranks **#1**
  for "change site theme, colors, fonts, or visual design template for the website" (score 15.2,
  ahead of `theme_write_file`/`theme_read_file`/`pages_write_html`/`theme_list`) and **#2** for
  "audit the site for privacy or cookie law compliance" (score 9.07, right behind
  `site_collect_page_evidence`). Both **VERIFIED live**, not re-derived from the old report.

### `site-compliance` — installed, but **DISABLED**, and NOT registered

This is the one piece of new information this audit surfaces: it is not simply "live like the
other one."

- Installed on disk at `infra/agent-plugins/ws/workspace-local/packages/sha256/5d6f...`, mtime
  Aug 25 21:22:56 (yesterday evening) — **VERIFIED**.
- `activations.json` (same directory) contains exactly one record:
  ```json
  {"schemaVersion":1,"plugins":{"site-compliance":{"enabled":false,"origin":"bundled","updatedAt":"2026-08-26T04:22:56.452Z","updatedBy":"system:seed"}}}
  ```
  `origin: "bundled"` + `updatedBy: "system:seed"` matches `activation.ts`'s documented seeding
  behavior exactly: a plugin Tovu itself placed on disk (not an operator-run install) gets an
  explicit `enabled: false` record at seed time, and nobody has flipped it on. **VERIFIED** (file
  read directly; timestamp is Aug 25 21:22:56 PDT, i.e. before today's 11:20 AM boot, so the
  currently-running daemon's one-shot snapshot reflects this disabled state).
- `loadInstalledAgentPluginToolSources()` (`features/agent-plugins/tool-registrations.ts`) filters
  through `filterActiveAgentPlugins()` **before** ever building a tool — a disabled plugin is
  skipped, not merely hidden after being built. **VERIFIED by reading the code.**
- Confirmed live: `GET /api/tools/agent_plugin_site_compliance` → `404 NOT_FOUND`,
  `"no catalog entry for tool id \"agent_plugin_site_compliance\""`. **VERIFIED live.**

**Q1 answer:** one of the two plugins the team believed were both live is actually dormant. It is
correctly installed, correctly validated (`plugin.json` is well-formed), but sitting behind an
activation gate nobody has flipped — it will not appear in `search_tools`, `describe_tool`, or any
prompt-prefix injection until an operator (or a `plugins_set_enabled`-style action, if one existed
for this system — see Q2, it doesn't) turns it on.

---

## Q2 — why did Word Count not show up?

### The root cause, stated plainly

**Word Count is not an Agent Plugin at all.** It belongs to a completely different, older
mechanism — `features/plugin-runtime` (SPEC-005/ADR-024, the CMS "site plugin" system: tiers,
`.tovu-plugin` installs, `content.db`-backed activation) — not
`features/agent-plugins` (the Jini-packaged skill/tool bundles registered by
`registerInstalledAgentPluginTools`, which is what makes `ui-ux-design` a real tool). These are two
independently-designed systems that happen to share three capability-string literals via one
constants file (`core/extension-capability-vocabulary.ts`). Confirmed by reading
`src/features/plugin-runtime/built-ins/word-count/index.ts`: its manifest is a `PluginManifest`
(`id/name/version/tier/capabilities/hooks/fields`), not the `GlueManifest` shape
(`id/version/sdkRange/capabilities/attachments`) the site-glue system uses — it has no
`attachments` field at all. **VERIFIED.**

`features/plugin-runtime/manifest.ts` (the validator both `discovery.ts` and `loader.ts` call)
hard-codes:
```ts
const VALID_HOOKS = new Set(["content.entry.beforeSave"]);
const VALID_CAPABILITIES = new Set<PluginCapability>(SHARED_EXTENSION_CAPABILITIES); // content.read, content.extend, hooks.attach
```
That is the **entire** v1 vocabulary — confirmed by reading the validator itself, not inferred.
**Nothing in that vocabulary means "expose a callable tool."** A plugin in this system can read
content, extend it with a field, and attach to exactly one save-time hook — it has no declared way
to register anything an agent's `search_tools` could ever find. Word Count uses this correctly: it
hooks `content.entry.beforeSave`, computes a real word count, and writes it to
`ext.word-count.count` on every save. That machinery is real, live, and running — the *plugin* is
not broken. It simply has no path to becoming a tool.

The **only** agent-tool surface `plugin-runtime` exposes at all is two generic, plugin-agnostic
management tools, in `features/plugin-runtime/agent-tools.ts`:
- `plugins_list` — "Lists every discovered plugin... with its id, name, version, source, trust
  tier, validation status, current enabled state" (read-only)
- `plugins_set_enabled` — enable/disable by id

Both **are** wired into the live catalog (`contributePluginsTools()` →
`installFirstPartyToolContributors()`, called in `agent-daemon-server.ts` before
`buildToolCatalogQuery`) — **VERIFIED**, this part of candidate hypothesis #1 is only half right.
But their indexed text is entirely about *managing plugins as objects*, never about what an
*enabled* plugin's own hook computes. Neither ever mentions "word," "count," "length," or "reading
time," so they correctly do not match a content-metrics query. There is, in short, **no tool
anywhere whose job is "project a plugin's own capability into something search_tools can find."**
This is exactly the gap already on the team's own backlog as task #11 ("Register regular plugins
into the tool catalog so search_tools can find them") — this audit confirms that gap is real, live,
and is precisely what caused today's miss.

### The site-glue `assistant.tools` candidate — checked and ruled out

The dispatch's second hypothesis (site-glue's `assistant.tools` call site validates then silently
rejects as `UNWIRED_CALL_SITE`) is **not what happens, but it's still irrelevant to Word Count**:

- `resolveCallSiteDispatch("assistant.tools")` actually returns `{ wired: true }` —
  `assistant.tools` genuinely is one of the three members of `WIRED_CALL_SITES` in
  `features/site-glue/manifest.ts`. **VERIFIED by reading the code** (not rejected).
- But `mergeGlueToolRegistrations()` — the **only** function in the entire codebase that would ever
  act on that "wired" status and actually merge a glue module's tools into a live tool list — has
  **zero callers anywhere outside its own file and its own tests**. `grep` across `src/` found no
  reference to it, `GlueHostPort`, or `glueModules` in `src/server` (the composition root) at all.
  **VERIFIED.** Site-glue is a fully-validated, TDD-certified library (ADR-057) that is simply
  never invoked by any live process — the same "unwired, not dead" shape this codebase already has
  precedent for elsewhere (`forms/manifest.ts`, `http/client.ts`).
- Even if it were wired, it would not matter here: no real plugin, including Word Count, ever
  constructs a `GlueManifest` with an `attachments` array. Word Count's manifest type has no such
  field. Site-glue and plugin-runtime are two parallel, non-overlapping extension mechanisms; Word
  Count only ever participates in the latter.

### Replayed queries — actual live top-10, pasted verbatim

Both replayed against the running daemon's `GET /api/tools/search` (same route the daemon's own
`@jini-ai/mcp` `search_tools` proxies) — **VERIFIED live**, not reconstructed:

**Query 1 — "compute word count or reading time statistics for post content"**
```
1. content_post_update        8.93
2. content_post_delete        8.08
3. redirects_get_hits         7.92
4. content_post_create        7.22
5. content_post_get           7.19
6. content_post_list          7.16
7. content_post_search        7.02
8. deployment_get_dockerfile  6.72
9. widgets_insert_embed       6.63
10. collections_content_type_deprecate  5.43
```

**Query 2 — "report content metrics and statistics such as length, word totals, or reading time across the site"**
```
1. deployment_get_dockerfile               6.72
2. content_post_delete                     6.45
3. seo_get_settings                        5.75
4. content_post_search                     5.72
5. deployment_get_static_publish_capabilities  5.28
6. assistant_demo_a2ui                     5.08
7. deployment_list                         5.07
8. source_control_execute_commit           4.61
9. theme_list_files                        4.37
10. content_post_update                    4.28
```

No hit in either list is about word/character/length counting, reading time, or content metrics as
a concept — the closest matches are generic post CRUD tools that happen to share incidental
vocabulary ("content," "post"). This is not truncation and not a ranking artifact: it is the
complete top 10, and it is what a healthy BM25 index returns when the concept being searched for
has **no indexed representative at all**.

### Retrieval, selection, or something else?

**This is neither.** It is a third, distinct failure mode: a **registration gap**.

- Not a **retrieval/ranking** failure (2026-08-24 report's original framing): there is no buried
  correct answer sitting at rank #6 or #11 that better embeddings would promote — there is no
  candidate in the index at all to promote.
- Not a **selection** failure (2026-08-24 report's corrected framing, the "theme_list vs.
  ui-ux-design" case): the agent did not ignore a good result in favor of a familiar native verb —
  it had genuinely nothing on-topic to choose from, searched twice with well-formed queries, and
  correctly concluded no tool exists.
- The admin assistant's own conclusion — "No built-in word-count tool" — was **factually correct**
  at the tool-catalog level, even though a live, `status: valid`, tier-3 Word Count *plugin* is
  actively computing and storing a real count on every save. The nuance worth keeping: the
  capability exists in the product; it simply never became an agent-callable tool, so falling back
  to manual Bash counting was the only option the catalog actually offered.

---

## Summary

| Plugin | Installed | Active | In live catalog | Evidence |
|---|---|---|---|---|
| `ui-ux-design` (Agent Plugin) | yes | yes (no disable record) | yes, `agent_plugin_ui_ux_design`, ranks #1-#2 on-topic | VERIFIED live |
| `site-compliance` (Agent Plugin) | yes | **no** — explicit `enabled:false`, origin `bundled` | **no** — 404 on describe | VERIFIED live |
| Word Count (plugin-runtime plugin) | yes, tier-3, valid | yes (enabled, hook fires on save) | **no tool exists for it at all** — only generic `plugins_list`/`plugins_set_enabled` are wired, and neither mentions word count | VERIFIED live + code |

No blockers hit. No product code touched.
