import { ValidationError } from "#src/platform/site-dir/index";

import { assertNoConfigInjection, MIGRATIONS_NOTE } from "./deploy-config.js";
import type { DeploymentDescriptor, RenderDeployConfigOptions, RenderedDeployConfig } from "./deploy-config.js";

/**
 * @file `tovu deploy config --target render` — renders `render.yaml` (a Render Blueprint) from
 * `DeploymentDescriptor` (`./deploy-config.ts`). Schema verified via context7 against Render's own
 * current docs (`/websites/render`, "Blueprint Specification" + `llms-full.txt`'s example
 * `render.yaml`), fetched 2026-08-31 — not written from memory, per this task's own instruction:
 * - A Dockerfile-built `type: web` service uses `runtime: docker`; with no `rootDir` given, the
 *   build looks for `Dockerfile` at the repo root by default — matches this repo exactly, so no
 *   `dockerfilePath`-shaped override field is emitted (the docs' own example never showed one for
 *   the plain root-Dockerfile case either).
 * - `region` is a fixed enum — see {@link RENDER_VALID_REGIONS}'s own doc — "cannot be modified
 *   after service creation", per the spec's own text, which is exactly why this renderer refuses to
 *   guess or default it.
 * - `envVars[].sync: false` is Render's actual mechanism for "this key exists, prompt for its value
 *   in the Dashboard" — the docs' own worked example uses it for a real secret
 *   (`ANTHROPIC_API_KEY`). No value ever appears next to it here.
 * - `disk` (name/mountPath/sizeGB) is confirmed valid on `type: web` (not just `pserv`) — "paid
 *   Render web services, private services, and background workers" per the docs — which is also why
 *   `plan: starter` is set explicitly below: Render's free tier does not support persistent disks at
 *   all, and a disk silently would not attach.
 * - Every web service must bind `0.0.0.0:$PORT`, defaulting to 10000 if unset — Tovu's own
 *   Dockerfile bakes `PORT=3000`, so `PORT` is declared explicitly here (Render's own guidance for a
 *   Docker deploy — see the n8n deploy guide's identical advice — is to declare it rather than rely
 *   on auto-detection).
 */

/**
 * Render's Blueprint `region` enum. Source: context7 `/websites/render`, "Blueprint Specification >
 * region": "The region field specifies where a service is deployed, with options including oregon,
 * ohio, virginia, frankfurt, and singapore. This value cannot be modified after service creation."
 * Fetched 2026-08-31.
 */
export const RENDER_VALID_REGIONS = ["oregon", "ohio", "virginia", "frankfurt", "singapore"] as const;

function renderEnvVarsBlock(descriptor: DeploymentDescriptor): string {
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

export function renderRenderYaml(descriptor: DeploymentDescriptor, options: RenderDeployConfigOptions): RenderedDeployConfig {
  const region = options.region.trim();
  if (!region) {
    throw new ValidationError("--region is required for --target render (no default region is assumed)");
  }
  if (!(RENDER_VALID_REGIONS as readonly string[]).includes(region)) {
    throw new ValidationError(`--region "${region}" is not a valid Render region — one of: ${RENDER_VALID_REGIONS.join(", ")}`);
  }
  // `region` itself needs no separate injection check here — it just passed the allow-list above,
  // so it can only be one of RENDER_VALID_REGIONS's five known-safe literals.
  assertNoConfigInjection("the derived Render service name (fly.toml's app)", descriptor.appName);
  assertNoConfigInjection("the derived Render disk name (fly.toml's [[mounts]].source)", descriptor.volumeName);

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

  const notes: string[] = [
    "Persistent disks require a paid plan — \"plan: starter\" above is the cheapest tier that supports " +
      "one; the free tier cannot attach this disk at all.",
    "Render prompts for each `sync: false` env var's real value in the Dashboard the first time this " +
      "Blueprint is applied — no value is stored in this file.",
    MIGRATIONS_NOTE,
    ...descriptor.secrets.map((secret) => `${secret.name} is ${secret.requirement} — see deploy-config.ts's own doc for why.`),
  ];

  return { filename: "render.yaml", contents, notes };
}
