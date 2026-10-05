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
/** Build schemas from the loaded registry. O(platforms + five tools); a missing registry uses bundled data only. */
export function getDeployOpsAgentToolCatalog(registry?: DeployOpsRegistry): AgentToolDefinition[] {
  const platforms = registry ? registry.list().map(p => p.descriptor) : bundledDescriptors();
  const ids = platforms.map(p => p.id);
  const listed = ` Platforms: ${platforms.map(p => `${p.id} (${p.label})`).join(", ") || "none available"}.`;
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
      description: `Deploy, ship or redeploy my server app now through a supported platform, using one saved credential. Returns platform, target, started (true), summary, and when the platform provides them runId, sha, machineIds, image and url. started means the platform accepted the deploy, not that it has landed: next call deployment_ops_wait with the same platform and target (plus runId when returned) until 'finished', then check the live site with fetch_live_url. Never retry a deploy whose connection dropped before checking deployment_ops_status. Refuses observe-only platforms, unknown platforms, ambiguous credentials, saved-host mismatches and rejected auth (use custom_credential_verify). Does not copy site content to the server; a static-site publish uses deployment_execute_static_publish.${listed}`,
      sideEffects: "mutates-durable-state",
      authorization: { permission: "custom-credentials.write" },
      inputSchema: { type: "object", additionalProperties: false, properties: { platform: base.platform, target: base.target, ref: { type: "string", minLength: 1, maxLength: 200, description: "Branch, tag or commit to deploy." }, credentialLabel: base.credentialLabel }, required: ["platform", "target"] },
    },
  ];
}
export const deployOpsAgentToolCatalog = getDeployOpsAgentToolCatalog();
