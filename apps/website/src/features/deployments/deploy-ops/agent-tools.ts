import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveProductRoot } from "#src/platform/site-dir/index";
import type { AgentToolSideEffect } from "@jini-ai/core";
import { parseDeployOpsFile } from "./registry.js";
import { MAX_WAIT_SECONDS } from "./run-ops.js";
import type { DeployOpsDescriptor, DeployOpsRegistry } from "./types.js";
interface AgentToolDefinition {
  name: string; description: string; sideEffects: AgentToolSideEffect;
  authorization: { permission: string }; inputSchema: Readonly<Record<string, unknown>>;
}
/** Data-only source snapshot for hermetic catalog construction; never used to authorize or import modules. */
function bundledDescriptors(): readonly DeployOpsDescriptor[] {
  try {
    const parsed = parseDeployOpsFile(readFileSync(path.join(resolveProductRoot(), "content", "agent-plugins", "deploy", "tovu-deploy-ops.json"), "utf8"));
    return parsed.ok ? parsed.descriptors : [];
  } catch { return []; }
}
const platformList = (platforms: readonly DeployOpsDescriptor[]) => ` Platforms: ${platforms.map(p => `${p.id} (${p.label})`).join(", ") || "none available"}.`;
/** Build schemas from the loaded registry. O(platforms + eight tools); a missing registry uses bundled data only. */
export function getDeployOpsAgentToolCatalog(registry?: DeployOpsRegistry): AgentToolDefinition[] {
  const platforms = registry ? registry.list().map(p => p.descriptor) : bundledDescriptors();
  const ids = platforms.map(p => p.id);
  const listed = platformList(platforms);
  // Secrets are an optional adapter verb set, so their tools advertise only adapters that export it
  // (github-actions has none). Bundled data cannot say which do; the handler refuses the rest.
  const secrets = registry ? registry.list().filter(p => typeof p.module.listSecrets === "function").map(p => p.descriptor) : platforms;
  const secretsListed = registry ? platformList(secrets) : " Platforms: whichever deploy platforms have a secrets adapter.";
  const common = `${listed} Use these instead of custom_credential_make_request for deploy checks on these platforms. They don't deploy or change anything; to start a deploy use deployment_ops_deploy. For a static-site publish use deployment_get_static_publish_capabilities / the publish tools instead. Refuses unknown platforms, ambiguous credentials, saved-host mismatches, and rejected auth (use custom_credential_verify).`;
  const base = { platform: { type: "string", enum: ids }, target: { type: "string", minLength: 1, maxLength: 200, description: "App name or owner/repo, as required by the platform." }, credentialLabel: { type: "string", minLength: 1, maxLength: 200 }, runId: { type: "string", pattern: "^[0-9]+$" }, branch: { type: "string", minLength: 1, maxLength: 200 } };
  const definition = (name: string, description: string, properties: Record<string, unknown>, required: string[]): AgentToolDefinition => ({ name, description: description + common, sideEffects: "none", authorization: { permission: "custom-credentials.read" }, inputSchema: { type: "object", additionalProperties: false, properties, required } });
  return [
    definition("deployment_ops_status", "Check whether an app is up, running and healthy or whether a GitHub Actions workflow build passed or failed. Returns platform, target, healthy/deploying/failing/stopped/unknown state, summary, machine/job items, optional run URL and checkedAt.", base, ["platform", "target"]),
    definition("deployment_ops_logs", "Read bounded error logs to explain why a hosted app crashed or a GitHub Actions build failed. Returns platform, target, lines with message and optional time/source/level, and truncated. Actions returns failed steps and check annotations, not the redirected full log archive.", { ...base, limit: { type: "integer", minimum: 1, maximum: 500, default: 100 } }, ["platform", "target"]),
    definition("deployment_ops_wait", "Wait until an app is healthy or a workflow is finished; poll status every 10 seconds and tell the user when it is done. Returns reached, waitedSeconds, polls and last status; reached:false on timeout. Finished includes failure/stopped; unknown is not finished. Cancellation stops polling.", { ...base, until: { type: "string", enum: ["healthy", "finished"] }, timeoutSeconds: { type: "integer", minimum: 10, maximum: MAX_WAIT_SECONDS, default: 180 } }, ["platform", "target", "until"]),
    definition("deployment_ops_list_targets", "List my apps or other deployment targets on a supported platform before choosing one to inspect. Returns platform and targets with id, name and optional state. Listing may be unsupported by the platform; then supply a target to status.", { platform: base.platform, credentialLabel: base.credentialLabel, org: { type: "string", minLength: 1, maxLength: 200, description: "Optional organization slug." } }, ["platform"]),
    {
      name: "deployment_ops_deploy",
      description: `Deploy, ship or redeploy my server app now through a supported platform, using one saved credential. Returns platform, target, started (true), summary, and when the platform provides them runId, sha, machineIds, image and url. github-actions: target is the owner/repo holding .github/workflows/fly-deploy.yml; it resolves ref (a branch or tag, default main, never a bare commit SHA) to its full SHA, dispatches fly-deploy.yml with expected_sha pinned to it, and returns sha and runId (the workflow refuses to deploy if the ref moved); the saved api.github.com credential needs Actions write. started means the platform accepted the deploy, not that it has landed: next call deployment_ops_wait with the same platform and target (plus runId when returned) until 'finished', then check the live site with fetch_live_url. Never retry a deploy whose connection dropped before checking deployment_ops_status. Refuses platforms without a deploy adapter, unknown platforms, ambiguous credentials, saved-host mismatches and rejected auth (use custom_credential_verify). Does not copy site content to the server; a static-site publish uses deployment_execute_static_publish.${listed}`,
      sideEffects: "mutates-durable-state",
      authorization: { permission: "custom-credentials.write" },
      inputSchema: { type: "object", additionalProperties: false, properties: { platform: base.platform, target: base.target, ref: { type: "string", minLength: 1, maxLength: 200, description: "Branch or tag to deploy (github-actions default: main)." }, credentialLabel: base.credentialLabel }, required: ["platform", "target"] },
    },
    ...secretTools({ platforms: secrets.map(p => p.id), target: base.target, credentialLabel: base.credentialLabel, listed: secretsListed }),
  ];
}
/** Generic host-secrets tools; vendors are the deploy plugin's adapters, never per-vendor tools. O(1). */
function secretTools(required: { platforms: string[]; target: Record<string, unknown>; credentialLabel: Record<string, unknown>; listed: string }): AgentToolDefinition[] {
  const { platforms, target, credentialLabel, listed } = required;
  const name = { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]{0,127}$", description: "Secret (environment variable) name, e.g. TOVU_SITE_KEY." };
  const common = ` Works for any platform whose adapter supports secrets; others are refused with the list of platforms that do. Never returns a secret value or accepts one in model input.${listed}`;
  const targetProps = { platform: { type: "string", enum: platforms }, target, credentialLabel };
  return [
    {
      name: "deployment_ops_list_secrets",
      description: `List the secrets (environment variables) set on a hosted app: names, the platform's own digest and update time only, never values. Returns platform, target, secrets [{name, digest?, updatedAt?}], truncated, appliesOn (next-deploy | vendor-restart | immediately), supportsStaging and deployNeeded (true when writes wait for the next deploy).${common}`,
      sideEffects: "none",
      authorization: { permission: "custom-credentials.read" },
      inputSchema: { type: "object", additionalProperties: false, properties: targetProps, required: ["platform", "target"] },
    },
    {
      name: "deployment_ops_set_secret",
      description: `Set or copy a secret (environment variable) on a hosted app from a server-side source or a masked secure card; the assistant never sees the value. source {kind:'typed'} opens the masked card for a new key such as STRIPE_KEY; the human types the value there. source {kind:'site-key'} copies this site's own site key (needs the site-key permission); source {kind:'secret', name} copies another secret already on the same target (platform side, value never shown). Compares first: if the stored value is identical nothing is written (comparison 'same'). Replacing an existing secret asks the human to confirm on a card; creating a new one does not. dryRun:true only compares. Returns platform, target, name, source, comparison (same | different | absent | unknown), changed, fingerprint and fingerprintKind ('site-key' fingerprints match the admin Security page), appliesOn, supportsStaging, deployNeeded, optional version and dryRun, and summary; a declined card returns changed:false with cancelled/reason/note. Writes are staged where the platform allows: when deployNeeded is true, run deployment_ops_deploy afterwards.${common}`,
      sideEffects: "mutates-durable-state",
      authorization: { permission: "custom-credentials.write" },
      inputSchema: { type: "object", additionalProperties: false, properties: {
        ...targetProps, name,
        source: { type: "object", additionalProperties: false, description: "Where the server reads the value. kind 'typed' opens a secure card and takes no value; kind 'site-key' takes no name; kind 'secret' requires name (another secret on the same target).", properties: { kind: { type: "string", enum: ["site-key", "secret", "typed"] }, name }, required: ["kind"] },
        dryRun: { type: "boolean", default: false, description: "Only compare and report; write nothing." },
      }, required: ["platform", "target", "name", "source"] },
    },
    {
      name: "deployment_ops_unset_secret",
      description: `Remove a secret (environment variable) from a hosted app. Always asks the human to confirm on a card first; a name that is not set is reported, not removed. Returns platform, target, name, removed, appliesOn, supportsStaging, deployNeeded, optional version and summary; a declined card returns removed:false with cancelled/reason/note. When deployNeeded is true the running app keeps the variable until deployment_ops_deploy runs.${common}`,
      sideEffects: "deletes-durable-state",
      authorization: { permission: "custom-credentials.write" },
      inputSchema: { type: "object", additionalProperties: false, properties: { ...targetProps, name }, required: ["platform", "target", "name"] },
    },
  ];
}
export const deployOpsAgentToolCatalog = getDeployOpsAgentToolCatalog();
