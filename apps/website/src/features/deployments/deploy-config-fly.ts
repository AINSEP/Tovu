import { ValidationError } from "#src/platform/site-dir/index";

import { assertNoConfigInjection, MIGRATIONS_NOTE } from "./deploy-config.js";
import type { DeploymentDescriptor, RenderDeployConfigOptions, RenderedDeployConfig } from "./deploy-config.js";

/**
 * @file `tovu deploy config --target fly` — renders `fly.toml` from `DeploymentDescriptor`
 * (`./deploy-config.ts`). Structurally mirrors the repo-root `fly.toml` already committed tonight:
 * that file IS the reference for what a correct Fly config for Tovu looks like (`[build]`, `[env]`,
 * `[[mounts]]`, `[http_service]` with a `/readyz`-backed check) — this function reproduces its exact
 * shape with the caller-supplied region and the descriptor's derived facts substituted in, so this
 * renderer and that file cannot silently diverge in shape, only in the values a fresh run derives.
 *
 * No enumerated region allow-list here, unlike the Render/Railway renderers: Fly's region catalog
 * is large (~30 codes) and this pass had no authoritative source to enumerate it against without
 * risking rejecting a real one — see this task's own report for what stays unverified. Only
 * presence is checked.
 */

export function renderFlyToml(descriptor: DeploymentDescriptor, options: RenderDeployConfigOptions): RenderedDeployConfig {
  const region = options.region.trim();
  if (!region) {
    throw new ValidationError("--region is required for --target fly (no default region is assumed)");
  }
  assertNoConfigInjection("--region", region);
  assertNoConfigInjection("the derived Fly app name (fly.toml's app)", descriptor.appName);
  assertNoConfigInjection("the derived Fly volume name (fly.toml's [[mounts]].source)", descriptor.volumeName);

  const contents = `app = "${descriptor.appName}"
primary_region = "${region}"

[build]
  dockerfile = "${descriptor.dockerfilePath}"

[env]
  TOVU_RUNTIME_MODE = "production"
  PORT = "${descriptor.port}"

[[mounts]]
  source = "${descriptor.volumeName}"
  destination = "${descriptor.volumeMountPath}"

[http_service]
  internal_port = ${descriptor.port}
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

  [[http_service.checks]]
    grace_period = "60s"
    interval = "30s"
    method = "GET"
    timeout = "5s"
    path = "${descriptor.healthCheckPath}"
`;

  const notes: string[] = [
    `Create the volume before the first deploy — this file only MOUNTS it, it does not create it: ` +
      `fly volumes create ${descriptor.volumeName} --region ${region} -a ${descriptor.appName}`,
    MIGRATIONS_NOTE,
    ...descriptor.secrets.map(
      (secret) => `Set ${secret.name} (${secret.requirement}) with: fly secrets set ${secret.name}=<value> -a ${descriptor.appName}`
    ),
  ];

  return { filename: "fly.toml", contents, notes };
}
