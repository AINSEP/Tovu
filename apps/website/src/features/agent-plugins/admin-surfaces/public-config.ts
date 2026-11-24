import type { AdminSurfacePublicConfig } from "@jini-ai/agent-plugins/admin-surfaces";
import { createAdminSurfacePublicConfig as createJiniAdminSurfacePublicConfig } from "@jini-ai/agent-plugins/site/admin-surfaces/public-config";

/**
 * @file Tovu's binding of the admin-surface `publicConfig` port
 * (`@jini-ai/agent-plugins/site/admin-surfaces/public-config`): this site's allow-list of public
 * plugin-config names.
 *
 * Why the host narrows names beyond Jini's check: the declaration only refuses secret-looking
 * words, but this port reads the process environment, which also holds settings such as the site's
 * encryption key or storage keys whose names contain none of them (`TOVU_SITE_KEY`,
 * `JINI_S3_ACCESS_KEY_ID`). So only names shaped like public plugin config are read:
 * `TOVU_…_APP_ID`, `…_CLIENT_ID`, `…_BROWSER_KEY` or `…_PUBLIC_KEY`, plus the exact names the bundled plugins' manifests declare
 * (injected as `publicNames`; this file names no provider), and never one with a secret word.
 */

const TOVU_PUBLIC_NAME = "TOVU_[A-Z0-9_]{1,48}_(?:APP_ID|CLIENT_ID|BROWSER_KEY|PUBLIC_KEY)";
const SAFE_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;

/** `^(?:<host shapes>|<name>|…)$`; a manifest name that is not a plain upper-case setting name is dropped, never escaped into the pattern. */
function publicNamePattern({ publicNames }: { readonly publicNames: readonly string[] }): RegExp {
  return new RegExp(`^(?:${[TOVU_PUBLIC_NAME, ...publicNames.filter((name) => SAFE_NAME.test(name))].join("|")})$`);
}

/**
 * Setting names the bundled plugins' own manifests declare under `publicConfig` (any surface). Only bundled (product-shipped)
 * manifests may widen the allow-list: an installed plugin's declaration never does, since it could name a host secret.
 * @param required.readManifest - Returns the parsed admin-surface manifest of a bundled plugin, or null when it ships none.
 * @complexity O(p + n) plugins and declared names.
 */
export function bundledPublicConfigNames(
  required: { readonly pluginIds: readonly string[]; readonly readManifest: (required: { pluginId: string }) => unknown },
  _optional: Record<string, never> = {},
): readonly string[] {
  const names = new Set<string>();
  for (const pluginId of required.pluginIds) {
    const surfaces = (required.readManifest({ pluginId }) as { surfaces?: unknown } | null)?.surfaces;
    for (const surface of Array.isArray(surfaces) ? surfaces : []) {
      const declared = (surface as { publicConfig?: unknown })?.publicConfig;
      for (const name of Array.isArray(declared) ? declared : []) if (typeof name === "string") names.add(name);
    }
  }
  return [...names];
}

/** @complexity O(n) once per build for the declared names, O(1) per read. */
export function createAdminSurfacePublicConfig(
  required: { readonly env: Readonly<Record<string, string | undefined>>; readonly publicNames?: readonly string[] },
  _optional: Record<string, never> = {},
): AdminSurfacePublicConfig {
  return createJiniAdminSurfacePublicConfig({ env: required.env, publicNamePattern: publicNamePattern({ publicNames: required.publicNames ?? [] }) });
}
