/**
 * @file `tovu deploy config --target fly` for the Tovu `deploy` plugin: renders `fly.toml` from the
 * host's `DeploymentDescriptor` (`apps/website/src/features/deployments/deploy-config.ts`).
 * Structurally mirrors the repo-root `fly.toml`: that file IS the reference for what a correct Fly
 * config for Tovu looks like (`[build]`, `[env]`, `[[mounts]]`, `[http_service]` with a
 * `/readyz`-backed check). This renderer reproduces its exact shape with the caller-supplied region
 * and the descriptor's derived facts substituted in.
 *
 * No enumerated region allow-list here, unlike the Render/Railway renderers: Fly's region catalog is
 * large (~30 codes) and had no authoritative source to enumerate against without risking rejecting a
 * real one. Only presence is checked.
 *
 * Moved from core (`features/deployments/deploy-config-fly.ts`) byte-for-byte in output; plain JS by
 * owner decision (2026-09-29). The host passes the kit (`DeployConfigKit` in core's
 * `deploy-config.ts`): `assertNoConfigInjection`, `validationError(message)`, `migrationsNote`.
 */

/**
 * @typedef {{ readonly name: string, readonly requirement: "boot-blocking" | "recommended" }} DeploymentSecret
 * @typedef {{ readonly appName: string, readonly port: number, readonly dockerfilePath: string, readonly volumeMountPath: string, readonly volumeName: string, readonly healthCheckPath: string, readonly secrets: readonly DeploymentSecret[] }} DeploymentDescriptor
 * @typedef {{ readonly region: string }} RenderDeployConfigOptions
 * @typedef {{ readonly assertNoConfigInjection: (fieldLabel: string, value: string) => void, readonly validationError: (message: string) => Error, readonly migrationsNote: string }} DeployConfigKit
 * @typedef {{ readonly filename: string, readonly contents: string, readonly notes: readonly string[] }} RenderedDeployConfig
 */

/**
 * @param {DeploymentDescriptor} descriptor
 * @param {RenderDeployConfigOptions} options
 * @param {DeployConfigKit} kit
 * @returns {RenderedDeployConfig}
 */
function render(descriptor, options, kit) {
  const region = options.region.trim();
  if (!region) {
    throw kit.validationError("--region is required for --target fly (no default region is assumed)");
  }
  kit.assertNoConfigInjection("--region", region);
  kit.assertNoConfigInjection("the derived Fly app name (fly.toml's app)", descriptor.appName);
  kit.assertNoConfigInjection("the derived Fly volume name (fly.toml's [[mounts]].source)", descriptor.volumeName);

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

  const notes = [
    `Create the volume before the first deploy — this file only MOUNTS it, it does not create it: ` +
      `fly volumes create ${descriptor.volumeName} --region ${region} -a ${descriptor.appName}`,
    kit.migrationsNote,
    ...descriptor.secrets.map(
      (secret) => `Set ${secret.name} (${secret.requirement}) with: fly secrets set ${secret.name}=<value> -a ${descriptor.appName}`
    ),
  ];

  return { filename: "fly.toml", contents, notes };
}

export default { render };
