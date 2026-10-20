import type { AdminSurfacePublicConfig } from "@jini-ai/agent-plugins/admin-surfaces";

/**
 * @file The `publicConfig` port for plugin admin-surface handlers: host settings a surface may see
 * (a browser app id, a public browser key), read from this site's configuration by the names the
 * surface declared. Values are placeholders the operator configures; unset reads as `null`.
 *
 * Why the host re-checks names Jini already checked: the declaration refuses secret-shaped names,
 * but this port reads the process environment, which also holds the site's real secrets. Refusing
 * the same words here keeps a secret from leaking even if a declaration path is ever bypassed.
 */

const PUBLIC_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
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
