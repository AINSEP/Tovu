/**
 * @file The one definition of an Agent-Plugin-skill capability card id.
 *
 * Its own module rather than a private helper inside `capability-source.ts` because there are now two
 * modules that must agree on this string exactly, and they sit on opposite ends of a dependency edge
 * that cannot be reversed:
 *
 * - `capability-source.ts` MINTS these ids (one card per skill folder per digest) and hands them to
 *   `capability_search`.
 * - `resolve-agent-plugin-refs.ts` in `pointer` delivery mode PRINTS one into the run's prompt prefix,
 *   telling the agent the exact `capability_get` call to make.
 *
 * `capability-source.ts` already imports `listInstalledPlugins` from `resolve-agent-plugin-refs.ts`,
 * so having the pointer builder import the id builder back from `capability-source.ts` would close an
 * import cycle. Duplicating the template string in both would be worse still: a drift would produce a
 * prompt pointing at a card id that no `capability_search` result can ever match, and the failure
 * would surface as "the agent ignored the instruction" — the single most expensive misreading
 * available in this feature, and the exact one the 2026-08-21 measurement already burned a session on.
 *
 * The digest is IN the id (not "newest wins") because `InstalledAgentPlugin` carries no timestamp an
 * upgrade-resolution policy could be computed from, and `install.ts` never deletes an old digest —
 * "an upgrade happened" and "two versions are genuinely installed" are the identical runtime state.
 * Two installed digests therefore get two disjoint ids by construction, never a collision to dedupe.
 */

/** The `kind` every card this source mints carries, and the prefix of every id it builds. */
export const AGENT_PLUGIN_SKILL_CAPABILITY_KIND = "agent-plugin-skill";

/** `agent-plugin-skill:<pluginId>:<archiveDigest>:<skillName>` */
export function toAgentPluginSkillCapabilityId(
  pluginId: string,
  archiveDigest: string,
  skillName: string,
): string {
  return `${AGENT_PLUGIN_SKILL_CAPABILITY_KIND}:${pluginId}:${archiveDigest}:${skillName}`;
}
