import type { AdminSurfacePublicConfig } from "@jini-ai/agent-plugins/admin-surfaces";

/**
 * @file The `publicConfig` port for plugin admin-surface handlers: host settings a surface may see
 * (a browser app id, a public browser key), read from this site's configuration by the names the
 * surface declared. Values are placeholders the operator configures; unset reads as `null`.
 *
 * Why the host narrows names beyond Jini's check: the declaration only refuses secret-looking
 * words, but this port reads the process environment, which also holds settings such as the site's
 * encryption key or storage keys whose names contain none of them (`TOVU_SITE_KEY`,
 * `TOVU_S3_ACCESS_KEY_ID`). So only names shaped like public plugin config are read:
 * `TOVU_…_APP_ID`, `…_CLIENT_ID`, `…_BROWSER_KEY` or `…_PUBLIC_KEY`, and never one with a secret word.
 */

const PUBLIC_NAME_PATTERN = /^TOVU_[A-Z0-9_]{1,48}_(APP_ID|CLIENT_ID|BROWSER_KEY|PUBLIC_KEY)$/;
const SECRET_WORDS = /SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|COOKIE|SESSION|SIGNING/;
export const PUBLIC_CONFIG_REFUSED_MESSAGE = "This setting is not public configuration, so a plugin surface cannot read it.";

/** @complexity O(1) per read. */
export function createAdminSurfacePublicConfig(
  required: { readonly env: Readonly<Record<string, string | undefined>> },
  _optional: Record<string, never> = {},
): AdminSurfacePublicConfig {
  return {
    async get({ name }) {
      if (!PUBLIC_NAME_PATTERN.test(name) || SECRET_WORDS.test(name)) throw new Error(PUBLIC_CONFIG_REFUSED_MESSAGE);
      return required.env[name]?.trim() || null;
    },
  };
}
