import type { AgentPluginActivations, SetAgentPluginActivationRequired, SetAgentPluginActivationOptional } from "@jini-ai/agent-plugins/lifecycle";

/**
 * @file Deploy plugin split (2026-10-12): the five static hosts left the bundled `deploy` plugin
 * ("Deploy Online") for one plugin each, and every one of them seeds ENABLED
 * (`bundled-catalog.ts`). An operator who had turned `deploy` off had said "no publishing hosts";
 * without this step the next boot would silently switch five hosting plugins on (owner rule: no
 * silent behaviour changes). So, before the seeder runs, that "off" is carried to each new host id
 * that has no activation record yet. The seeder's no-overwrite rule then leaves those records alone,
 * because they are not its own untouched `system:seed` records.
 *
 * Runs on every boot (from `lifecycle.ts`'s `migrateBeforeSeed`); idempotent, since a host that
 * already has any record is never written again.
 */

/** The plugins that took over `deploy`'s static hosts, by plugin id. */
export const DEPLOY_SPLIT_HOST_PLUGIN_IDS: readonly string[] = ["vercel", "netlify", "cloudflare-pages", "github-pages", "s3-compatible"];

/** `updatedBy` of every record this step writes; never the seeder's own `system:seed`. */
export const DEPLOY_SPLIT_ACTOR = "migration:deploy-split";

/** The two activation calls this step makes, from the boot's lifecycle owner. */
export interface DeploySplitActivationPort {
  readonly readAgentPluginActivations: (input: { readonly workspaceRoot: string }) => Promise<AgentPluginActivations>;
  readonly setAgentPluginActivation: (required: SetAgentPluginActivationRequired, optional?: SetAgentPluginActivationOptional) => Promise<unknown>;
}

/**
 * Carries an operator's `deploy` "off" to every split-out host plugin that has no record yet.
 *
 * @param required.workspaceRoot - The workspace's agent-plugin root, as the activation file reader takes it.
 * @param required.activations - The boot's lifecycle owner (its activation writes share one queue).
 * @returns The plugin ids it wrote, in {@link DEPLOY_SPLIT_HOST_PLUGIN_IDS} order; empty when `deploy`
 * is on, absent, or still the seeder's own record.
 * @throws What the activation writer throws (unreadable file, busy lock); nothing is written then.
 * @complexity O(h) host ids, one locked write each only on the first boot after an operator's "off".
 */
export async function carryDeployDisabled(required: { readonly workspaceRoot: string; readonly activations: DeploySplitActivationPort }, _optional: Record<string, never> = {}): Promise<readonly string[]> {
  const { workspaceRoot, activations } = required;
  const { plugins } = await activations.readAgentPluginActivations({ workspaceRoot });
  const deploy = plugins.deploy;
  if (deploy === undefined || deploy.enabled || deploy.updatedBy === "system:seed") return [];
  const carried = DEPLOY_SPLIT_HOST_PLUGIN_IDS.filter((pluginId) => !Object.hasOwn(plugins, pluginId));
  for (const pluginId of carried) {
    await activations.setAgentPluginActivation({ workspaceRoot, pluginId, enabled: false, actor: DEPLOY_SPLIT_ACTOR }, { origin: "bundled" });
  }
  return carried;
}
