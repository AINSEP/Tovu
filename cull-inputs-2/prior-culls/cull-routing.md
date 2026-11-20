# Cull of r62t-routing

Bases: `origin/claude/uiux-split` (Jini 791890c11, Tovu dbdc850a03). Paths: Jini `packages/agent-plugins/src/lifecycle/`, Tovu `apps/website/src/`.

## Owner summary
1. A request gets its best-matching plugin in full plus the plugins it declares it needs. kUInetic and Tovu Theme both bring UI/UX Design. The limit is 3 plugins and 24 KiB.
2. Every other enabled plugin shows as a 3-line entry: what it covers, when to use it, and the load call. The agent loads those on demand.
3. `site_guide explain(themes)` names the design plugin, and agents are told to search plugins before building.
4. Dropped: Tovu's "redesign" word router, text excerpts and daemon byte plumbing. DeepSeek, agy and aider keep today's behaviour.
5. Your call: removing `<<SUBAGENT_DISPATCH>>` brings AI-Dev-Shop startup into localhost chat, because dev sites live in `Tovu/sites/`.

Counts: KEEP 1 / CUT-TO 2 / ADD 3 / DROP 3 / NEEDS-DECISION 1 / RETIRE 1.

| Item | Verdict | Reason |
|---|---|---|
| J1 catalog | **CUT-TO RT-J1** | 3-line rows, no paging. |
| J2 budget | **CUT-TO RT-J2** | Top match plus its `requires` providers, under a shared 24 KiB. DROP excerpting, top-3-by-rank and the dedup changes. |
| kuinetic `requires` | **ADD RT-J3** | Uses the existing manifest field. |
| T1 regex routing | DROP | Manifest `requires` replaces it. |
| T2 daemon allowance | DROP | Stdin adapters need nothing. Argv adapters keep the existing `maxPromptArgBytes` gate. |
| ARGV-EDGE | DROP | Moot. |
| T4 guide text | **KEEP RT-T1** | Owner-ordered. |
| tovu-theme `requires` | **ADD RT-T2** | Replaces T1. |
| Tovu test refresh | **ADD RT-T4, WAIT** | Runs after the Jini release. |
| T3 marker removal | **NEEDS-DECISION RT-T3** | The CLI cwd is `siteBinding.dir` (`agent-daemon-run-launch.ts:72`). Dev sites sit in `Tovu/sites/`, so the root `CLAUDE.md`/`AGENTS.md` startup returns (`agent-daemon-run-start.ts:365–374`). **Recommend:** remove the marker AND have the owner add this rule to `CLAUDE.md` and `AI-Dev-Shop/AGENTS.md`: "skip startup when the working directory is inside `sites/`". Otherwise keep the marker. |
| UIUX-SPLIT | RETIRE | Done. |

Note: `tovu-theme` SKILL.md (61,309 bytes) stays a load pointer, as today.

## Exact cut text

### RT-J1 — catalog (Jini, `automatic-use.ts`)
- Delete `relevantPluginNote` (`:31–50`).
- New private `enabledPluginCatalog({ ctx, candidates }, _options = {})`:
  - Rows: `candidates` minus `ctx.state.excluded` minus `ctx.delivered` keys, sorted by `pluginId` with `[...x].sort`.
  - Returns `''` when there are no rows. Otherwise returns `Enabled agent plugins (load one before acting on its part):\n` + the rows.
- New private `catalogRow({ ctx, plugin }, _options = {})`, built from `describeMatch`:
  - `- ${name} (${id}): ${why}`
  - `\n  Use for: ${keywords.slice(0, 8).join(', ')}`, only when keywords exist
  - `\n  Load: ${pointer}`, where `pointer` is `formatPluginToolPointer({ pluginId: id, file: 'SKILL.md' })`, or `search_agent_plugin_local({ query: "${id}" })` without that port.
- `prepare` (`:218`): `catalog = input.query !== undefined && !input.capabilities?.length ? enabledPluginCatalog(...) : ''`. Return `[result, catalog, off]`.
- The query branch of `preparedGuidance` returns guidance only.
- Off-note, capability path, consent, explicit loads unchanged.

**Tests first** (`__tests__/unit/automatic-use.unit.test.ts`):
- Replace `:265`/`:274` with 50 rows, each carrying `Load: host_read_plugin(...match-N...)`, and nothing resolved. Keep the load loop.
- Inactive, Ask-rejected and delivered plugins have no row.
- Refresh strings `:269`, `:410`, `:528`.
- Mutation: rows built from ranked matches only.
- Changeset: patch.

### RT-J2 — top match plus required providers (Jini)
1. `search.ts:80`: add `readonly requires?: readonly string[] | undefined;`. `host-tools/search-tool.ts` `buildSearchCandidate`: add `...(plugin.requires !== undefined ? { requires: plugin.requires } : {})`.
2. New private `withRequiredProviders({ ranked, candidates }, _options = {})`:
   - Enabled candidates whose `provides` meets `ranked[0].requires` go right after the top (ranked entry, else `{ ...plugin, score: 4 }`).
   - The rest of the ranked list follows, deduplicated.
   - `rankCandidates`'s query branch returns it, so one Ask covers them.
3. `MAX_PRIMARY_GUIDANCE_BYTES` → `MAX_QUERY_GUIDANCE_BYTES = 24 * 1024`.
4. `primaryMatch`:
   - Existing gates unchanged: `maxPromptArgBytes`, query, `loaded`, and top already loaded.
   - Returns `[top, ...required].slice(0, 3)`.
   - `required` = consented matches that provide one of `top.requires` and are not in `ctx.alreadyLoaded`.
5. `resolveGuidance`: the `primaryId` option → `budget?: number`.
   - With a budget: a block over the remaining bytes gets the existing deferral pointer, and a delivered block subtracts its UTF-8 size.
   - Without one: the 8 KiB check, unchanged.
   - The query path passes `MAX_QUERY_GUIDANCE_BYTES`.
6. Fix "one primary" doc comments.

**Tests first:**
- Top + unranked provider → both bodies, both in `guidanceIds`, and an unrequired plugin gets only a row. Mutation: drop `withRequiredProviders`.
- 20 KiB top + 5 KiB provider → provider deferred. Mutation: per-block cap.
- Three providers → 2 delivered.
- One `ask` covers both.
- `:539` → `[24576, 24577, 61309]`. `:597` unchanged.
- Changeset: minor. OPUS-CLOUD runs `pnpm api:update`.

### RT-J3 — kuinetic requires ui-design (Jini)
- `packages/agent-plugins/kuinetic/plugin.json` `extensions.jini`: `"requires": ["ui-design"]`, CHANGELOG line.
- Recompute its two digests in `packages/plugin-catalog/catalog.json` (plain sha256, as in 791890c11).
- `bundled-package.test.mjs` asserts it. Changeset: patch.

### RT-T1 — guide and pre-build search (Tovu)
- Copy the design's T4 sentences verbatim into `features/theme/capability-card.ts:8` and `assistant/site-guide-pointer.ts:3`. Keep the trailing space.
- Tests first:
  - A new `test()` in `server/runtime/composition/__tests__/site-guide-tools.test.ts` asserts the card names `ui-ux-design`, `search_agent_plugin_local` and `load_agent_plugin`.
  - The fragments in `assistant/__tests__/small-contracts.unit.test.ts:61` add `search_agent_plugin_local`.

### RT-T2 — tovu-theme requires ui-design (Tovu)
- `content/agent-plugins/tovu-theme/plugin.json` `extensions.jini`: `"requires": ["ui-design"]`, version 1.1.3 → 1.1.4.
- Its `bundled-package.test.mjs` asserts it.

### RT-T3 — marker (WAIT owner decision)
If approved, do the design's T3 exactly. Otherwise drop it.

### RT-T4 — refresh (WAIT Jini release + lock bump)
- `features/agent-plugins/__tests__/unit/bundled-automatic-relevance.unit.test.ts`:
  - The mapping adds `requires: manifest.requires`.
  - `loaded` = top + its providers, and the rest get rows.
  - Add `Redesign this site, use kuinetic` → `['kuinetic', 'ui-ux-design']`.
- `assistant/__tests__/automatic-agent-plugins.integration.test.ts:416–419`: the 600-byte and "+N more" assertions → 50 rows.
- No source edits.

## Run plan (both under 4 sheets, so DRAFT; nothing launched)
- `j-rt-jini-DRAFT.md`: RT-J1 → RT-J2 → RT-J3.
- `j-tv-rt-DRAFT.md`: RT-T1 and RT-T2 now. RT-T3 after the decision. RT-T4 after the Jini release.
- Combine (Chrome + Electron): "Redesign this site, use kuinetic" → both bodies + rows.
