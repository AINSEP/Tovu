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
 * `TOVU_…_APP_ID`, `…_CLIENT_ID`, `…_BROWSER_KEY` or `…_PUBLIC_KEY`, and never one with a secret word.
 */

const PUBLIC_NAME_PATTERN = /^(TOVU_[A-Z0-9_]{1,48}_(APP_ID|CLIENT_ID|BROWSER_KEY|PUBLIC_KEY)|JINI_GOOGLE_PICKER_APP_ID|JINI_GOOGLE_PICKER_BROWSER_KEY)$/;

/** @complexity O(1) per read. */
export function createAdminSurfacePublicConfig(
  required: { readonly env: Readonly<Record<string, string | undefined>> },
  _optional: Record<string, never> = {},
): AdminSurfacePublicConfig {
  return createJiniAdminSurfacePublicConfig({ env: required.env, publicNamePattern: PUBLIC_NAME_PATTERN });
}
