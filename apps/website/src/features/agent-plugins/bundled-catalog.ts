/**
 * Bundled plugins that seed ENABLED, not disabled, because a core product path runs through them.
 * `deploy` hosts the publish targets (`features/deployments/deploy-targets/`): with it off, publishing
 * a site would stop working. Owner rule: a user should never have to fix anything by hand, so it is on
 * from the first boot, and an existing site's untouched disabled seed record is switched on too
 * (`activation.ts`'s `recordBundledAgentPluginIfAbsent`). An operator can still turn it off, and
 * that decision survives every later boot. `resend` hosts a mail adapter (`mail-adapter-registry.ts`),
 * moved out of core 2026-09-29: with it off, a site that saved that provider's key would silently
 * stop sending mail. `github` hosts the only git-host provider (`features/source-control/provider-registry.ts`),
 * moved out of core 2026-09-29: with it off, committing the site, `custom_credential_write_files`, site
 * backups and the Source Control form's account-name check would all stop. `site-import` (owner
 * decision 2026-10-08): bringing an existing website into Tovu is a first-run job, so the skill is
 * available without a trip to the Agent Plugins screen; it writes nothing until the owner approves
 * its plan, and imported entries are drafts. `tovu-theme` (owner auto-mode decision 2026-10-08):
 * `site-import` hands its theme step to this skill, so it must be on wherever `site-import` is; it
 * only ever edits a duplicated theme until the owner approves switching to it.
 */
export const BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED: ReadonlySet<string> = new Set(["deploy", "resend", "github", "site-import", "tovu-theme"]);

/**
 * Retired bundled plugin id -> the bundled plugin that absorbed it. `seed-bundled.ts` never seeds a
 * retired id, even if a stale build still carries its directory.
 *
 * `tovu-deploy-fly` -> `deploy` (2026-09-29): one deploy plugin for every host; the fly.io server
 * procedure is now `deploy`'s `references/fly-server.md`.
 *
 * `create-tovu-theme` and `tovuize-site` -> `tovu-theme` (2026-10-06): one theme plugin for both
 * jobs, a new theme or a converted static site. They shared the theme-format rules and had started
 * contradicting each other about them; `tovu-theme`'s skill now carries both procedures.
 */
export const RETIRED_BUNDLED_AGENT_PLUGINS: ReadonlyMap<string, string> = new Map([
  ["tovu-deploy-fly", "deploy"],
  ["create-tovu-theme", "tovu-theme"],
  ["tovuize-site", "tovu-theme"],
]);

/** `agent_plugin_<pluginId>` (hyphens folded to underscores) — the id
 *  `features/agent-plugins/tool-registrations.ts`'s own `toAgentPluginToolId` mints for the same
 *  plugin, duplicated here as a one-line transform rather than imported: that function is private to
 *  a sibling module this file must not reach into (mirrors this codebase's own precedent for
 *  `humanize()`, duplicated three times across `capability-projection.ts` /
 *  (the now-removed) `capability-source.ts` / `tool-registrations.ts`, each with the same "private
 *  formatting helper of a sibling module" reasoning). If the two ever drift, `resolve-agent-plugin-
 *  refs.unit.test.ts`'s pointer-mode tests assert against the REAL installed tool id, not this
 *  template, so a drift fails loudly there. */
function toAgentPluginToolId(pluginId: string): string {
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
