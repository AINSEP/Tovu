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
 * @typedef {{ readonly region: string, readonly env?: Readonly<Record<string, string>> }} RenderDeployConfigOptions
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
 * Quotes a value as a YAML double-quoted scalar. JSON string escapes are valid YAML escapes; YAML
 * additionally forbids raw DEL, C1 controls and U+FFFE/U+FFFF, so those are escaped too.
 * @param {string} value
 * @returns {string}
 * @complexity O(n) in the value length.
 */
function yamlString(value) {
  return JSON.stringify(value).replace(/[\u007f-\u009f\ufffe\uffff]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/**
 * Checks the explicit non-secret variables the host passes (the CLI stamps `TOVU_SITE_ID` here).
 * @param {{ env: Readonly<Record<string, string>>, secrets: readonly DeploymentSecret[] }} input
 * @param {DeployConfigKit} kit
 * @returns {[string, string][]}
 * @throws {Error} For an invalid name, a non-string value or a declared secret name; never echoes the value.
 * @complexity O(n + s) for n variables and s declared secrets.
 */
function checkedEnv({ env, secrets }, kit) {
  const secretNames = new Set(secrets.map((secret) => secret.name));
  const entries = Object.entries(env);
  for (const [name, value] of entries) {
    if (!/^[A-Za-z_]\w*$/.test(name) || typeof value !== "string" || secretNames.has(name)) {
      throw kit.validationError("env must contain only non-secret string variables with valid names");
    }
  }
  return entries;
}

/**
 * Defaults keep their historical bytes; explicit `options.env` entries follow and may override them.
 * @param {DeploymentDescriptor} descriptor
 * @param {Readonly<Record<string, string>>} env
 * @param {DeployConfigKit} kit
 * @returns {string}
 * @complexity O(n + s) for n variables and s declared secrets.
 */
function renderEnvVarsBlock(descriptor, env, kit) {
  const explicit = checkedEnv({ env, secrets: descriptor.secrets }, kit);
  const lines = [];
  if (!("TOVU_RUNTIME_MODE" in env)) lines.push("      - key: TOVU_RUNTIME_MODE", "        value: production");
  if (!("PORT" in env)) lines.push("      - key: PORT", `        value: "${descriptor.port}"`);
  for (const [name, value] of explicit) lines.push(`      - key: ${name}`, `        value: ${yamlString(value)}`);
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
${renderEnvVarsBlock(descriptor, options.env ?? {}, kit)}
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
    // Owner decision 2026-10-08: the Dockerfile's `TOVU_INSTALL_BROWSER` defaults to 0, so the
    // opt-in has to be stated wherever a host's config is generated. Render passes a service's
    // environment variables to a Docker build as build args for every declared `ARG`.
    "Headless Chromium is not installed by default. To enable browser-backed tools (page evidence, " +
      "screenshots), set the environment variable TOVU_INSTALL_BROWSER=1 on this service (Render passes " +
      "it to the Docker build), redeploy, and allow ~150–250 MB more RAM per capture.",
    ...descriptor.secrets.map((secret) => `${secret.name} is ${secret.requirement} — see deploy-config.ts's own doc for why.`),
  ];

  return { filename: "render.yaml", contents, notes };
}

export default { render };
