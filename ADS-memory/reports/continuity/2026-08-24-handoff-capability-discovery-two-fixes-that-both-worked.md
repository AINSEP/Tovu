# Handoff: capability discovery — two independent fixes, both measured working

Generated: 2026-08-24
Source: Claude Code (Sonnet 5 → Opus 5 mid-session), Coordinator
Subagents this session: 7 × Claude Sonnet 5
Branch `general-work` · **Tovu: 122 uncommitted files, 27 unpushed commits · Jini: 106 uncommitted, 27 unpushed**

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this handoff.
>
> **Start at §6.1 — commit today's work.** Two repos of verified, tested changes are sitting loose in a
> shared tree that other sessions actively edit. Nothing is committed. That is the single highest-risk
> item here, above any new feature work.
>
> Then §6.2: wire the agent-plugin tools into boot, turn the manifest mandate OFF, and run one design
> question. That is the experiment everything else this session was building toward.
>
> **Do NOT re-open the ranking/two-hop debate** (§5.1) — settled twice with measurements.
> **Do NOT re-derive whether skills exist standalone** — they do not (§4.3), verified.
>
> Hard constraints: never `npm run test:cov` or bare `npm test` (OOMs this machine). Scoped runs only.
> No Docker. Ask before killing any process — identity-check by cwd, never by port (a port-based kill
> took down a different project's dev server earlier this week). Shared tree: `git commit -F <msg> -- <paths>`.
> **Live agent behaviour is tested through the browser admin chat via Claude-in-Chrome, NOT
> `agent-run-probe.mjs`** — owner correction, this session.

---

## §1 — THE HEADLINE: two independent fixes, both measured, both working

The session's governing question: *why does the agent never find installed capabilities it wasn't
pointed at?* Prior sessions measured 0/5 failure and correctly established the root cause is upstream
of retrieval — the agent resolves a plausible answer ("design guidance" → "the active theme") **before
issuing any query**, so no amount of re-ranking reaches it.

Two fixes were built this session. **They attack different halves and both work.**

| Fix | Attacks | Status |
|---|---|---|
| **`mandate` manifest arm** | "never searched at all" | Built, live-tested, **first-ever Case (b) success** |
| **Agent plugins as real tools** | "searched, didn't find it" | Built, measured, **#1 on 6/7 queries** |

Keep both. They are complements, not alternatives.

## §2 — FIX A: the `mandate` manifest arm

`src/server/agent-daemon/capability-manifest-prefix.ts` already had `off`/`passive`/`gate`. All three
had been measured failing. Critically, **`gate`'s 0/3 was void, not evidence** — its trigger fired only
"before proposing an implementation path," and all 3 runs asked a clarifying question instead, so the
mechanism never actually ran.

Added a fourth arm, **`mandate`**, with NO precondition, naming the exact escape routes real runs took:

- "even if you were only going to ask a clarifying question first"
- "even if you already thought of a plausible native tool, file, or theme"

That second clause is load-bearing — it targets the measured root cause directly.

A unit test asserts the **absence** of precondition phrasing (`/before proposing/i` must not match),
because a precondition creeping back in fails invisibly: the arm looks enabled and simply never fires.

### §2.1 The live result — first Case (b) success ever recorded

Dev server restarted with `TOVU_CAPABILITY_MANIFEST_ARM=mandate`, run in the real browser admin chat,
no plugin pinned, prompt: *"I want this site to look more polished and professional. Use whatever
design guidance this workspace has available to you..."*

1. Opened with a search, citing the rule: *"as required before answering"*
2. Called **`capability_search`** — never observed in ANY prior case-(b) run (0/5, plus 0/3 gate, 1/3 passive-but-unused)
3. Called `capability_get`, then `Read premium-ui.md` — the plugin's own guidance file
4. Final answer used the plugin's accessibility + "premium feel" checklist. 2m50s, $0.95

All three pass criteria (searched / found / **used**) hit. Criterion 3 is the one that matters —
`passive` had already shown searching and using diverge.

### §2.2 Caveat that must not be lost: the run knew it was being measured

The transcript contains, in the agent's own words: *"This matches a known measurement scenario, but the
request is real."* **It read the repo's own notes about the experiment.** That downgrades this from
evidence to strong-lead. Future runs need prompts that match nothing written down. n=1 regardless.

## §3 — FIX B: agent plugins as real tools

The owner's architectural proposal: stop keeping installed capabilities in a separate catalog behind
`capability_search`; register them as **real tools** so plain `search_tools` finds them.

Rationale from the measurements: the agent found native tools unprompted in every run
(`content_post_create`, `theme_read_file`, `deployment_*`) and catalog capabilities never. The
difference is structural — tool-list vs. behind-a-search — not ranking.

### §3.1 Three iterations, each correcting the last

**Iteration 1 — one tool per skill.** Worked (6/7 queries #1) but revealed a flaw the owner caught:
one plugin consumed **7 of 10 result slots**, its eponymous skill ranked only #3 behind its own
siblings, and 20 plugins would mean 140 tools.

**Iteration 2 — one tool per PLUGIN**, optional `skill` argument, all skills' vocabulary folded into
one description. Results:

- Catalog grows **+1 per plugin, not +7**
- **6/7 queries still #1** — none demoted; one score even rose (20.147 → **21.437**)
- Per-term scores diluted as predicted (shadcn 15.2 → 10.8) but **rank held**
- **Native tools freed up — the real payoff.** On "design guidance", `theme_read_file` went **#10 → #4**,
  and `theme_list_files`/`theme_list`/`theme_write_file` took #5/#6/#9 where previously one theme tool
  barely clung to #10. On "what design guidance is available", `capability_search` went **#8 → #2**.

**Iteration 3 — the name.** Owner caught a category error: it was `skill_ui_ux_design`, but an Agent
Plugin is not a skill — it is a packaging paradigm that *bundles* skills, tools and MCP servers. The
repo already encodes this (Jini has BOTH `packages/agent-plugins/` and `packages/plugins/`; Tovu uses
kind strings `"agent-plugin-skill"`/`"agent-plugin-mcp-server"`). Renamed to
**`agent_plugin_<pluginId>`**. Ranks unchanged; scores moved ~0.01 (BM25 length normalization only).

### §3.2 Files (all NEW — nothing pre-existing was edited)

- `src/features/agent-plugins/tool-registrations.ts`
- `src/features/agent-plugins/__tests__/unit/tool-registrations.unit.test.ts`
- `src/features/agent-plugins/__tests__/integration/agent-plugin-tool-search-ranking.integration.test.ts`

**Still UNWIRED from `agent-daemon-server.ts` by design.** The live product does not have these tools.
That also means "no eval regression" is trivially true and is NOT evidence about the wired case.

## §4 — WHAT THE CAPABILITY LANDSCAPE ACTUALLY IS (verified, do not re-derive)

### §4.1 Three parallel catalogs, all `:memory:`, all rebuilt at boot

| Index | Backing tool | Contents |
|---|---|---|
| `tool-catalog-query.ts` | `search_tools`/`describe_tool` | 147 native tools (148 with one plugin) |
| `capability-catalog-query.ts` | `capability_search`/`capability_get` | agent-plugin skills only |
| `component-catalog-query.ts` | `search_components`/`describe_component` | UI components |

**Nothing is persisted.** Both use `new Database(":memory:")`. The only FTS5 table in `content.db` is
`post_search_fts` (blog posts). So "we'd have to save everything in the database" is **not** true —
you register a `CapabilitySource`, and the index is built from live sources at call time.

Ranking is `bm25(tool_catalog_fts, 6.0, 1.0)` over columns `(id, description)` — **id weighted 6x**.
`source` is NOT in the FTS index; `sourceForToolId()`'s bucket is display metadata with zero ranking
impact.

### §4.2 The model does NOT see 147 tool definitions

It gets ~3 meta-tools (`/api/tools/search`, `/api/tools/:id`, `/api/delegated-tool-calls`) and
searches. So catalog size is not a context cost — the owner's "can it hold 1000 tools?" is **yes** on
index performance and context. The open risk is *ranking quality* at that scale, not capacity.

### §4.3 Inventory of capability kinds — what exists, what doesn't

| Kind | Exists? | How it surfaces today |
|---|---|---|
| **Native tools** | ✅ 147 | `search_tools` — always found unprompted |
| **Agent plugins** | ✅ 1 installed (`ui-ux-design`, 7 skills) | pilot registers as `agent_plugin_*`, unwired |
| **Regular/site plugins** | ✅ | native `plugins_list`, `plugins_set_enabled` |
| **Standalone skills** | ❌ **DO NOT EXIST** | only `createAgentPluginSkillsCapabilitySource()` is registered — skills exist ONLY inside agent plugins |
| **External MCPs** | ⚠️ plumbing only | `external_mcp_servers` table exists, **0 rows**; tools inject when connected |
| **Components** | ✅ | separate `search_components` catalog |

### §4.4 The `plugin_` prefix is already taken

Native `plugins_list` / `plugins_set_enabled` occupy the regular-plugin domain. A future
`plugin_<id>` scheme for regular-plugins-as-tools would sit confusingly beside `plugins_*`. Resolve
deliberately; do not inherit the collision.

## §5 — THINGS TRIED THAT DID NOT WORK, AND CORRECTIONS

### §5.1 Settled — do not re-open

- **Ranking / two-hop-collapse is dead.** Falsified twice (commit `168aea24` re-ranked and still got
  0/5; an independent Opus consultation reached the same conclusion). The failure is upstream of retrieval.
- **`gate`'s 0/3 is void**, not evidence against forced-check mechanisms — its trigger never fired.

### §5.2 Coordinator errors this session, recorded so they are not repeated

1. **Missed the prior session's audit findings entirely.** They were in
   `ADS-memory/.local-artifacts/handoff/2026-08-23-1630-handoff.md` — I checked only
   `reports/continuity/`. The owner had to ask twice. That handoff's own first instruction was "resolve
   the Audit Findings first." **Check `.local-artifacts/handoff/` as well as `reports/continuity/`.**
2. **Claimed the `agent_plugin_` rename would improve "what plugins do I have" queries. Measured: false.**
   `plugins_list` correctly wins those (13.277 / 14.447). Only the exact phrase "agent plugin" hits #1
   (10.172). The rename is still right — category correctness, and it frees `skill_` — but not for the
   search reason given.
3. **Called the manifest's empty categories "a lie."** The owner pushed back correctly: the text is
   deliberately worded as a search vocabulary, never an existence claim (there is a unit test enforcing
   no "you can"/"is installed" phrasing). Whether the agent *treats* it as a menu is the open empirical
   question, not a settled defect.

### §5.3 The video test — designed, never run

Owner's own question — *"How can I get some AI videos into the coffee roasters article?"* — is the best
negative canary available: **video generation does not exist** (media tools are only
`list`/`upload`/`trash`/`update_metadata`; external MCP table empty), while *getting media into an
article* is fully supported. It tests whether an advertised-but-empty category makes the agent
hallucinate or flail.

**Not run** — the admin chat was in concurrent use by another of the owner's sessions, which would have
both contaminated the measurement and interfered with their work. Still worth running.

Free evidence arrived anyway from that other session's organic usage: asked *"can you save this video
in this project"*, the agent found `media_upload_asset`, knew its real limits (mp4/webm ≤10MB), noticed
no file was attached, and asked for it. Correct behaviour, unprompted, nobody watching for it.

### §5.4 A real bug found in passing, NOT fixed

`theme_list_files` called with the wrong parameter name (`{id}` instead of `{themeId}`) returns a
**daemon 500 `INTERNAL_ERROR`**, not a 400 with a useful message. The agent self-corrected, but a wrong
param name should never be a 500. Observed live in the Case (b) run.

### §5.5 A repo hook leaks into the product's own agent

Tovu's SessionStart hook text ("ALWAYS use codebase-memory-mcp tools FIRST…") reaches the spawned
agent inside Tovu's chat, which has no such tools — so it flagged the text as a prompt-injection
attempt and burned a turn refusing it. Twice. Owner diagnosed it. Not fixed; worth scoping.

## §6 — WHAT IS LEFT, IN ORDER

### §6.1 COMMIT — highest priority, do this first

Nothing from today is committed in either repo. **Tovu: 122 uncommitted files, 27 unpushed commits.
Jini: 106 uncommitted, 27 unpushed.** Other sessions actively edit this shared tree. Suggested grouping:

- **Jini**: `delegated-tools` status-code fix + the 2 `packages/server` tests it broke + docs
  (`delegated-tool.ts` description, `source-map.md` entry); model-proxy test hermeticity fix; transport DI
- **Tovu**: `mandate` manifest arm + tests; agent-plugin tool registrations + tests
- Beware: many `?? ADS-memory/reports/...` untracked files belong to OTHER sessions. Never `git add .`

### §6.2 The experiment this session was building toward

Wire `registerInstalledAgentPluginTools` into `agent-daemon-server.ts`, set
`TOVU_CAPABILITY_MANIFEST_ARM=off`, restart, and ask one design question in the browser admin chat.

**If it still finds and uses the plugin, structure replaced the prompt patch and `mandate` can be
retired.** If not, keep both. Either result is valuable.

### §6.3 In flight at handoff time

A Sonnet subagent was fixing **`plugins_list`**, which claims to list *"every discovered plugin"* but
returns only site/runtime plugins — agent plugins are silently absent. Because it ranks #1 for "what
plugins do I have installed", it returns a confidently incomplete answer that stops the search. Scope:
merge agent plugins in **at the handler, NOT inside `discoverPlugins()`** (its other caller,
`plugins_set_enabled`, would then offer to enable/disable something with no activation lifecycle);
separate `agentPlugins` key so no row fakes `enabled`/`trustTier`; fix the description; add
"extension"/"add-on" vocabulary. **Verify its work — check `git status` and re-run its tests.**

### §6.4 Remaining capability kinds, in recommended order

1. **External MCPs** — plumbing exists, 0 configured. Their tools already inject when connected, so
   this may need nothing structural; verify rather than assume. Connecting one real MCP would also
   unlock the *real* version of the video test (§5.3).
2. **Regular plugins as tools** — resolve the `plugin_` vs `plugins_*` collision first (§4.4).
3. **Standalone skills** — **do not build a discovery path for these; they do not exist** (§4.3). If
   they are ever added, `skill_` is now free.
4. **Vocabulary gaps** — `"accessible"` vs indexed `"accessibility"`, and `"extensions"`, both miss.
   Same class, same fix: keyword entries in `src/assistant/tool-search-keywords.ts` (agent-plugin tools
   currently have none). Would also raise the eval's held-out top-1.

### §6.5 Open design questions the owner has NOT decided

- Should `capability_search`/`capability_get` be **deleted** once everything is a tool? The pilot ran
  alongside them deliberately; removal is a separate call.
- Shared vs local FTS schema: `@jini-ai/sqlite`'s `tool_catalog` is `(id, description,
  input_schema_json, source, updated_at)` — no `kind` column. Extending it is a cross-repo change;
  a local Tovu schema is reversible. **Recommended: local first, promote later** (this is exactly what
  the capability catalog already did, for the same reason).
- Should the `mandate` arm become the shipped default? It is env-gated and `off` by default today.

## §7 — MEASUREMENT ASSETS (use these; do not rebuild)

- **`development/evals/tool-search-quality.eval.ts`** — the instrument that matters. Free, deterministic,
  no model, no network. Uses the same `buildToolCatalogQuery` the live path uses. Baseline **147 tools,
  held-out top-1 48% / top-3 76% / found 86%** (held-out is the honest number; "primary" is overfit to
  the keyword file). Re-run after ANY tool-description change.
- **`src/features/agent-plugins/__tests__/integration/agent-plugin-tool-search-ranking.integration.test.ts`**
  — measures ranks against the REAL catalog, prints actual ranked results, and honestly logs
  `plugin tool ranked top-3 for every query: false` when it misses. Do not tune its queries to force a pass.
- Baseline captures saved to the session scratchpad: `tool-search-baseline-BEFORE-pilot.txt`,
  `tool-search-AFTER-collapse.txt` (not repo-committed).

## §8 — EVERY TEST RUN THIS SESSION (all re-run by the Coordinator, not merely reported)

| Suite | Result |
|---|---|
| `admin-post-page-delete-routes` + `forms-admin-crud` (DuplicateCommandError) | 18/18 |
| media `providers.test.ts` + `execution-credential-store` | 32/32 |
| `capability-manifest-prefix.unit` + component-catalog integration | 10/10 → **12/12** after `mandate` |
| admin `composer-slash-plugin-pin.unit` | 3/3 |
| admin `AssistantDock` + `features/plugins` | 96/96 (14 files) |
| Jini `delegated-tools.test.ts` | 24/24 |
| Jini `create-local-node-daemon.test.ts` | 84/84 |
| Jini `builtin-features` + `compose-jini-kernel` | 79/79 |
| Jini `model-proxy` + `research` | **121/121** (was 40 FAILING) |
| Jini `anthropic-messages` | 98/98 |
| Tovu agent-plugins unit + integration | 138/138 |
| Tovu `src/assistant/__tests__` | **1093/1093** (run 3×, stable) |
| `tsc --noEmit` (Tovu root, Jini http-kit, Jini agent-runtime) | clean |

## §9 — HANDOFF CONTRACT

- **Inputs used:** live `git status` in both repos; direct reads of `capability-manifest-prefix.ts`,
  `tool-catalog-query.ts`, `capability-catalog-query.ts`, `tool-registrations.ts` (both families),
  `external-mcp-store.ts`, Jini's `tool-catalog.ts` and `agent-runtime/package.json`; the 2026-08-23
  SYNTHESIS + its two post-debate updates; the missed `.local-artifacts/handoff/` audit; live SQLite
  queries against `infra/content.db`; 7 subagent reports, every one independently re-verified.
- **Output summary:** two working fixes for capability discovery, one live-measured and one
  bench-measured; a verified map of what capability kinds actually exist; and a committed-nothing
  warning that should be resolved before any new work.
- **Risks:** nothing committed in either repo; one subagent still in flight at write time (§6.3); the
  live Case (b) success is n=1 and the run knew it was being observed (§2.2).
- **Suggested next assignee:** Coordinator, starting at §6.1.
