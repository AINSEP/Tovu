import type { AgentPluginActivations, AgentPluginActivationVerdict, SetAgentPluginActivationRequired, SetAgentPluginActivationOptional } from "@jini-ai/agent-plugins/lifecycle";

/**
 * @file Deploy plugin split (2026-10-12): the static hosts and server platforms left the bundled `deploy` plugin
 * ("Deploy Online") for one plugin each, and every one of them seeds ENABLED
 * (`bundled-catalog.ts`). An operator who had turned `deploy` off had said "no publishing hosts";
 * without this step the next boot would silently switch hosting plugins on (owner rule: no
 * silent behaviour changes). So, before the seeder runs, that "off" is carried to each new host id
 * that has no activation record yet. The seeder's no-overwrite rule then leaves those records alone,
 * because they are not its own untouched `system:seed` records.
 *
 * Runs on every boot (from `lifecycle.ts`'s `migrateBeforeSeed`); idempotent, since a host that
 * already has any record is never written again.
 */

/** The plugins that took over `deploy`'s static hosts and server platforms, by plugin id. */
export const DEPLOY_SPLIT_HOST_PLUGIN_IDS: readonly string[] = ["vercel", "netlify", "cloudflare-pages", "github-pages", "s3-compatible", "fly", "render", "railway"];

/** `updatedBy` of every record this step writes; never the seeder's own `system:seed`. */
export const DEPLOY_SPLIT_ACTOR = "migration:deploy-split";

/** The activation calls this step makes, from the boot's lifecycle owner. */
export interface DeploySplitActivationPort {
  readonly assertAgentPluginActivationsWritable: (input: { readonly workspaceRoot: string }) => Promise<void>;
  readonly resolveAgentPluginActivation: (input: { readonly workspaceRoot: string; readonly pluginId: string }) => Promise<AgentPluginActivationVerdict>;
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
  // Discovery deliberately folds unreadable files to empty; migration must never infer consent
  // from that view. Reuse the lifecycle owner's strict file check and per-record verdicts first.
  await activations.assertAgentPluginActivationsWritable({ workspaceRoot });
  const deployVerdict = await activations.resolveAgentPluginActivation({ workspaceRoot, pluginId: "deploy" });
  if (deployVerdict.verdict === "undetermined") throw new Error(`Cannot carry deploy activation: ${deployVerdict.reason}`);
  const { plugins } = await activations.readAgentPluginActivations({ workspaceRoot });
  const deploy = plugins.deploy;
  if (deploy === undefined || deploy.enabled || deploy.updatedBy === "system:seed") return [];
  const carried = DEPLOY_SPLIT_HOST_PLUGIN_IDS.filter((pluginId) => !Object.hasOwn(plugins, pluginId));
  // Check all missing successor decisions before the first write, so one malformed record cannot
  // produce a partially consented split through discovery's normalized view.
  for (const pluginId of carried) {
    const verdict = await activations.resolveAgentPluginActivation({ workspaceRoot, pluginId });
    if (verdict.verdict === "undetermined") throw new Error(`Cannot carry ${pluginId} activation: ${verdict.reason}`);
  }
  for (const pluginId of carried) {
    await activations.setAgentPluginActivation({ workspaceRoot, pluginId, enabled: false, actor: DEPLOY_SPLIT_ACTOR }, { origin: "bundled" });
  }
  return carried;
}
