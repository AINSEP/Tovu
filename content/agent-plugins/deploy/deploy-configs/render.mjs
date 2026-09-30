/**
 * @file `tovu deploy config --target render` for the Tovu `deploy` plugin: renders `render.yaml` (a
 * Render Blueprint) from the host's `DeploymentDescriptor`
 * (`apps/website/src/features/deployments/deploy-config.ts`). Schema verified via context7 against
 * Render's own current docs (`/websites/render`, "Blueprint Specification" + `llms-full.txt`'s example
 * `render.yaml`), fetched 2026-08-31, not written from memory:
 * - A Dockerfile-built `type: web` service uses `runtime: docker`; with no `rootDir` given, the build
 *   looks for `Dockerfile` at the repo root by default, which matches this repo exactly, so no
 *   `dockerfilePath`-shaped override field is emitted.
 * - `region` is a fixed enum (see {@link RENDER_VALID_REGIONS}), "cannot be modified after service
 *   creation", which is exactly why this renderer refuses to guess or default it.
 * - `envVars[].sync: false` is Render's mechanism for "this key exists, prompt for its value in the
 *   Dashboard". No value ever appears next to it here.
 * - `disk` (name/mountPath/sizeGB) is valid on `type: web` for paid services, which is why
 *   `plan: starter` is set explicitly: the free tier does not support persistent disks at all.
 * - Every web service must bind `0.0.0.0:$PORT`, defaulting to 10000 if unset. Tovu's Dockerfile
 *   bakes `PORT=3000`, so `PORT` is declared explicitly here.
 *
 * Moved from core (`features/deployments/deploy-config-render.ts`) byte-for-byte in output; plain JS
 * by owner decision (2026-09-29). The host passes the kit (`DeployConfigKit` in core's
 * `deploy-config.ts`).
 */

/**
 * @typedef {{ readonly name: string, readonly requirement: "boot-blocking" | "recommended" }} DeploymentSecret
 * @typedef {{ readonly appName: string, readonly port: number, readonly dockerfilePath: string, readonly volumeMountPath: string, readonly volumeName: string, readonly healthCheckPath: string, readonly secrets: readonly DeploymentSecret[] }} DeploymentDescriptor
 * @typedef {{ readonly region: string }} RenderDeployConfigOptions
 * @typedef {{ readonly assertNoConfigInjection: (fieldLabel: string, value: string) => void, readonly validationError: (message: string) => Error, readonly migrationsNote: string }} DeployConfigKit
 * @typedef {{ readonly filename: string, readonly contents: string, readonly notes: readonly string[] }} RenderedDeployConfig
 */

/**
 * Render's Blueprint `region` enum. Source: context7 `/websites/render`, "Blueprint Specification >
 * region": "The region field specifies where a service is deployed, with options including oregon,
 * ohio, virginia, frankfurt, and singapore. This value cannot be modified after service creation."
 * Fetched 2026-08-31.
 */
export const RENDER_VALID_REGIONS = Object.freeze(["oregon", "ohio", "virginia", "frankfurt", "singapore"]);

/**
 * @param {DeploymentDescriptor} descriptor
 * @returns {string}
 */
function renderEnvVarsBlock(descriptor) {
  const lines = [
    "      - key: TOVU_RUNTIME_MODE",
    "        value: production",
    "      - key: PORT",
    `        value: "${descriptor.port}"`,
  ];
  for (const secret of descriptor.secrets) {
    lines.push(`      - key: ${secret.name}`, "        sync: false");
  }
  return lines.join("\n");
}

/**
 * @param {DeploymentDescriptor} descriptor
 * @param {RenderDeployConfigOptions} options
 * @param {DeployConfigKit} kit
 * @returns {RenderedDeployConfig}
 */
function render(descriptor, options, kit) {
  const region = options.region.trim();
  if (!region) {
    throw kit.validationError("--region is required for --target render (no default region is assumed)");
  }
  if (!RENDER_VALID_REGIONS.includes(region)) {
    throw kit.validationError(`--region "${region}" is not a valid Render region — one of: ${RENDER_VALID_REGIONS.join(", ")}`);
  }
  // `region` itself needs no separate injection check here: it just passed the allow-list above, so
  // it can only be one of RENDER_VALID_REGIONS's five known-safe literals.
  kit.assertNoConfigInjection("the derived Render service name (fly.toml's app)", descriptor.appName);
  kit.assertNoConfigInjection("the derived Render disk name (fly.toml's [[mounts]].source)", descriptor.volumeName);

  const contents = `services:
  - type: web
    name: ${descriptor.appName}
    runtime: docker
    plan: starter
    region: ${region}
    healthCheckPath: ${descriptor.healthCheckPath}
    envVars:
${renderEnvVarsBlock(descriptor)}
    disk:
      name: ${descriptor.volumeName}
      mountPath: ${descriptor.volumeMountPath}
      sizeGB: 10
`;

  const notes = [
    "Persistent disks require a paid plan — \"plan: starter\" above is the cheapest tier that supports " +
      "one; the free tier cannot attach this disk at all.",
    "Render prompts for each `sync: false` env var's real value in the Dashboard the first time this " +
      "Blueprint is applied — no value is stored in this file.",
    kit.migrationsNote,
    ...descriptor.secrets.map((secret) => `${secret.name} is ${secret.requirement} — see deploy-config.ts's own doc for why.`),
  ];

  return { filename: "render.yaml", contents, notes };
}

export default { render };
