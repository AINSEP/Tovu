import { ValidationError } from "#src/platform/site-dir/index";

import { MIGRATIONS_NOTE } from "./deploy-config.js";
import type { DeploymentDescriptor, RenderDeployConfigOptions, RenderedDeployConfig } from "./deploy-config.js";

/**
 * @file `tovu deploy config --target railway` — renders `railway.json` from `DeploymentDescriptor`
 * (`./deploy-config.ts`). Schema verified via context7 against Railway's own current docs
 * (`/railwayapp/docs`), fetched 2026-08-31 — not written from memory:
 * - `build.builder: "DOCKERFILE"` + `build.dockerfilePath` and `deploy.healthcheckPath` /
 *   `deploy.restartPolicyType: "ON_FAILURE"` are confirmed real config-as-code fields (the Rails and
 *   Jupyter deploy guides' own worked `railway.json` examples).
 * - Railway's config-as-code has NO env-var / secrets section at all — confirmed explicitly (the
 *   docs' own reference titles the `railway.toml` full-field listing as showing only `[build]` and
 *   `[deploy]`; variables are managed only via the Dashboard, the CLI (`railway variables set`), or
 *   the GraphQL API). Emitting an invented `envVars`/`variables` key here would not be "valid for
 *   this platform" — it would just be ignored or misread — so this renderer emits none, and every
 *   secret appears in `notes` instead.
 * - Railway's config-as-code has NO volume field either — confirmed explicitly (the docs' own
 *   reference snippet is captioned "railway.toml format (no volume mount support)"). A newer
 *   TypeScript-based Infrastructure-as-Code path can express a volume mount, but it is a compiled,
 *   executed program rather than a static declarative file — a different shape than the other two
 *   renderers in this module and than `railway.json` itself, so it is not what this renderer emits;
 *   the volume-creation step instead appears in `notes`, via the plain CLI command the docs show
 *   (`railway volume add --mount-path <path>`).
 * - No plain single-service `region` field exists in `railway.json`/`railway.toml` — only
 *   `deploy.multiRegionConfig`, a map of region → replica count, confirmed by two independent
 *   worked examples. Pinning to exactly one region is expressed here as a single-entry map with
 *   `numReplicas: 1` — the correct value regardless of user choice, since Tovu's persistent state is
 *   one SQLite file on one volume; more than one replica sharing it would mean concurrent SQLite
 *   writers on the same file, not horizontal scaling.
 */

/**
 * Railway's 4 selectable region identifiers (service settings — apply identically to
 * `multiRegionConfig` keys). Source: context7 `/railwayapp/docs`, "Deployment regions table",
 * fetched 2026-08-31.
 */
export const RAILWAY_VALID_REGIONS = ["us-west2", "us-east4-eqdc4a", "europe-west4-drams3a", "asia-southeast1-eqsg3a"] as const;

export function renderRailwayConfig(descriptor: DeploymentDescriptor, options: RenderDeployConfigOptions): RenderedDeployConfig {
  const region = options.region.trim();
  if (!region) {
    throw new ValidationError("--region is required for --target railway (no default region is assumed)");
  }
  if (!(RAILWAY_VALID_REGIONS as readonly string[]).includes(region)) {
    throw new ValidationError(`--region "${region}" is not a valid Railway region — one of: ${RAILWAY_VALID_REGIONS.join(", ")}`);
  }

  const config = {
    $schema: "https://railway.com/railway.schema.json",
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: descriptor.dockerfilePath,
    },
    deploy: {
      healthcheckPath: descriptor.healthCheckPath,
      restartPolicyType: "ON_FAILURE",
      multiRegionConfig: {
        [region]: { numReplicas: 1 },
      },
    },
  };

  const contents = `${JSON.stringify(config, null, 2)}\n`;

  const notes: string[] = [
    `Create the volume once, before the first deploy — railway.json has no field for this (Railway's ` +
      `config-as-code does not support declaring volumes): railway volume add --mount-path ${descriptor.volumeMountPath} ` +
      `(name it "${descriptor.volumeName}" to match Tovu's other platform configs).`,
    MIGRATIONS_NOTE,
    ...descriptor.secrets.map(
      (secret) =>
        `Set ${secret.name} (${secret.requirement}) with: railway variables set ${secret.name}=<value> — railway.json has no ` +
        "env-var section; Railway manages variables outside config-as-code."
    ),
  ];

  return { filename: "railway.json", contents, notes };
}
