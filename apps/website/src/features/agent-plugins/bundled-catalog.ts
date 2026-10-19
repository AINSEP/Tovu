/**
 * Bundled plugins that seed ENABLED, not disabled, because a core product path runs through them.
 * Each hosting plugin split out of `deploy` (2026-10-12: `vercel`, `netlify`,
 * `cloudflare-pages`, `github-pages`, `s3-compatible`) hosts the publish targets
 * (`features/deployments/deploy-targets/`): with them off, publishing a site would stop working.
 * Owner rule: a user should never have to fix anything by hand, so they are on from the first boot,
 * and an existing site's untouched disabled seed record is switched on too (`activation.ts`'s
 * `recordBundledAgentPluginIfAbsent`). An operator can still turn one off, and that decision survives
 * every later boot; an operator who had turned `deploy` off keeps the split-out hosts off too
 * (`deploy-split-activation.ts`). Phase B extends that carry to Fly, Render and Railway; GitHub
 * Actions deploys moved into `github` and follow its switch (owner, 2026-10-12). `deploy` itself is
 * retired (Phase B7, `RETIRED_BUNDLED_AGENT_PLUGINS` below) and no longer seeded.
 * `resend` hosts a mail adapter (`mail-adapter-registry.ts`),
 * moved out of core 2026-09-29: with it off, a site that saved that provider's key would silently
 * stop sending mail. `github` hosts the only git-host provider (`features/source-control/provider-registry.ts`),
 * moved out of core 2026-09-29: with it off, committing the site, `custom_credential_write_files`, site
 * backups and the Source Control form's account-name check would all stop. `site-import` (owner
 * decision 2026-10-08): bringing an existing website into Tovu is a first-run job, so the skill is
 * available without a trip to the Agent Plugins screen; it writes nothing until the owner approves
 * its plan, and imported entries are drafts. `tovu-theme` (owner auto-mode decision 2026-10-08):
 * `site-import` hands its theme step to this skill, so it must be on wherever `site-import` is; it
 * only ever edits a duplicated theme until the owner approves switching to it. `how-tovu-works`
 * enriches the core read-only site guide from the first boot; disabling it retains minimal cards.
 * `ui-ux-design` (owner, 2026-10-14): theme/page/import work must load the design skill first, so it
 * is on from first boot; `recordBundledAgentPluginIfAbsent` also switches on an existing site's
 * untouched disabled seed. An operator's explicit off decision still survives later boots.
 */
export const BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED: ReadonlySet<string> = new Set(["fly", "render", "railway", "vercel", "netlify", "cloudflare", "github-pages", "s3-compatible", "resend", "github", "site-import", "tovu-theme", "how-tovu-works", "ui-ux-design"]);

/**
 * Retired bundled plugin id -> the bundled plugin(s) that absorbed it. `seed-bundled.ts` never seeds a
 * retired id, even if a stale build still carries its directory.
 *
 * `tovu-deploy-fly` -> `deploy` (2026-09-29): one deploy plugin for every host; the fly.io server
 * procedure moved again to `fly` in Phase B, so it now retires straight into `fly`.
 *
 * `deploy` -> every plugin split out of it (Phase B7, 2026-10-12): `fly`, `render`, `railway`, `github`
 * (GitHub Actions deploys) and Phase A's static hosts. All of them, not just `fly`: Jini keeps a
 * retired plugin until EVERY listed successor is installed at its seeded digest
 * (@jini-ai/agent-plugins 0.4.5, R6), and a workspace whose installed `deploy` predates the split still
 * carries what each of them took over; one failed seed must not cost that capability. Fly is first:
 * it is the outcome's `successorId` and the name `deploy` answers to (`RETIRED_PLUGIN_REPLACEMENTS`).
 *
 * `create-tovu-theme` and `tovuize-site` -> `tovu-theme` (2026-10-06): one theme plugin for both
 * jobs, a new theme or a converted static site. They shared the theme-format rules and had started
 * contradicting each other about them; `tovu-theme`'s skill now carries both procedures.
 */
export const RETIRED_BUNDLED_AGENT_PLUGINS: ReadonlyMap<string, string | readonly string[]> = new Map<string, string | readonly string[]>([
  ["tovu-deploy-fly", "fly"],
  ["deploy", ["fly", "render", "railway", "github", "vercel", "netlify", "cloudflare", "github-pages", "s3-compatible"]],
  ["cloudflare-pages", "cloudflare"],
  ["create-tovu-theme", "tovu-theme"],
  ["tovuize-site", "tovu-theme"],
]);

/**
 * Retired plugin id -> the ONE successor that answers for it by name (Phase B7, 2026-10-12): a run
 * that pinned `deploy` resolves `fly` (`translateRetiredPluginRefs`), and `agent_plugin_deploy`
 * stays callable as a gated alias of `agent_plugin_fly` (`retired-plugin-tool-aliases.ts`). Fly holds
 * what `deploy`'s own skill used to teach; without this, a saved run pinning `deploy` would fail to
 * start once `deploy` is retired.
 */
export const RETIRED_PLUGIN_REPLACEMENTS: ReadonlyMap<string, string> = new Map([["deploy", "fly"], ["cloudflare-pages", "cloudflare"]]);

/** Maps each pinned ref through {@link RETIRED_PLUGIN_REPLACEMENTS}, keeping order and dropping a
 *  duplicate the translation creates (`deploy` and `fly` both pinned).
 *  @complexity O(n) in ref count. */
export function translateRetiredPluginRefs(pluginRefIds: readonly string[]): readonly string[] {
  return [...new Set(pluginRefIds.map((id) => RETIRED_PLUGIN_REPLACEMENTS.get(id) ?? id))];
}

/** `agent_plugin_<pluginId>` (hyphens folded to underscores) — the id
 *  `features/agent-plugins/tool-registrations.ts`'s own `toAgentPluginToolId` mints for the same
 *  plugin, duplicated here as a one-line transform rather than imported: that function is private to
 *  a sibling module this file must not reach into (mirrors this codebase's own precedent for
 *  `humanize()`, duplicated three times across `capability-projection.ts` /
 *  (the now-removed) `capability-source.ts` / `tool-registrations.ts`, each with the same "private
 *  formatting helper of a sibling module" reasoning). If the two ever drift, `resolve-agent-plugin-
 *  refs.unit.test.ts`'s pointer-mode tests assert against the REAL installed tool id, not this
 *  template, so a drift fails loudly there. */
export function toAgentPluginToolId(pluginId: string): string {
  return `agent_plugin_${pluginId.replace(/-/g, "_")}`;
}

/**
 * `pointer` delivery — the ~400-byte replacement for the ~15KB `inject` section above.
 *
 * Two properties are load-bearing, each one bought with a measurement rather than reasoned from
 * first principles:
 *
 * 1. **It is mandatory, and says so.** The owner's framing is "the chip shouldn't inject anything, let
 *    the AI know what to look at" — right in substance, with one precision that must not be lost: this
 *    cannot inject NOTHING, because a tool can simply be ignored. The 2026-08-21 run read 0 of 30
 *    files listed as optional, and read exactly the 4 that SKILL.md named once the wrapper stopped
 *    hedging. Injection's one real virtue is that it is guaranteed; that virtue is kept here for the
 *    ~400 bytes and dropped for the 15KB.
 *
 * 2. **It names the bridge call, not just the tool.** Neither `agent_plugin_<pluginId>` nor its
 *    now-removed predecessor `capability_get` is in the spawned agent's own tool namespace —
 *    measured live 2026-08-22 (`ADS-memory/reports/2026-08-22-capability-tools-first-live-run.md`):
 *    the agent reaches Tovu tools only through Jini's MCP proxy, and burned five discovery hops
 *    (`ToolSearch` x3, `search_tools`, `describe_tool` x2) locating that route on a prompt that
 *    named both tools explicitly and did nothing else. A pointer saying only "call
 *    agent_plugin_<pluginId>" would name a tool that does not exist from the agent's side. The
 *    plain name is given FIRST and the proxied form second, so a Jini rename degrades this to the
 *    still-workable "search for it" case rather than to a call that hard-fails.
 *
 * REDIRECTED 2026-08-26 (owner call, `ADS-memory/knowledge/2026-08-26-removed-capability-search.md`):
 * this used to name `capability_get({ "id": <capability-id.ts's card id> })`. That tool pair is gone;
 * `agent_plugin_<pluginId>` called with NO argument already returns exactly the same content — the
 * plugin's own eponymous skill (`tool-registrations.ts`'s `loadInstalledAgentPluginToolSources`
 * documents that default) — so the redirect changes delivery, never content. The eponymous-skill
 * existence check below is unchanged from before this redirect: it is what makes "no argument"
 * exactly correct rather than a guess.
 *
 * Deliberately points at the plugin's own EPONYMOUS skill, exactly what `inject` sends, so arm 2 and
 * arm 3 of the A/B differ in delivery alone and not in content.
 */
export function formatPluginToolPointer({ pluginId: pluginRefId }: { readonly pluginId: string }, _optional = {}): string {
  const toolId = toAgentPluginToolId(pluginRefId);
  return [
    `MANDATORY — before you begin this task, make this one tool call and follow what it returns:`,
    ``,
    `  ${toolId}({})`,
    ``,
    `If your tools are proxied, that call is:`,
    `  mcp__jini__execute_delegated_tool({ "toolId": "${toolId}", "input": {} })`,
    ``,
    `Called with no argument, it returns this Agent Plugin's own instructions — not a summary, and`,
    `not background material you may skip. Follow them, including any files they direct you to load,`,
    `before you start work.`,
  ].join("\n");

}
