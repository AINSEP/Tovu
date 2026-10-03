import { parseCredentialSchemesFile, type CredentialSchemeRule, type CredentialSchemeRegistry } from "@jini-ai/integrations/credentialed-http";

// Token-prefix rationale: Jini/packages/integrations/src/credentialed-http/auth-schemes.ts; plugin trust stays here.
import { findTrustedPluginPackages, readTrustedPluginFile, type TrustedPluginPackage } from "#src/features/agent-plugins/trusted-plugin-files";

/**
 * @file Self-describing token schemes: tokens that carry their own `Authorization` scheme word as a
 * leading prefix (a vendor token such as `<Scheme><rest>` must be sent as `Authorization: <Scheme>
 * <rest>`, and is rejected when sent as `Bearer <whole token>`). Core names no vendor: the rules are
 * DATA that Agent Plugins ship in {@link CREDENTIAL_SCHEMES_FILENAME}, and Jini applies them.
 * The `deploy` plugin ships the one rule known today, with its live-verification
 * evidence in the file's `note`.
 *
 * Recognition is by the token's own content, never by the credential's saved host: a
 * `custom_credential_sets` row has no provider id (only an operator-typed label, base URL and token),
 * and a credential saved with a proxied base URL still carries the same self-describing token.
 * Dispatch is try-each-in-turn, first match wins, so rules should keep their prefixes disjoint.
 *
 * TRUST GATES (`features/agent-plugins/trusted-plugin-files.ts`). The bundled-digest gate applies:
 * only a plugin package this build shipped may add a rule, since a rule decides how a saved secret is
 * sent. The activation gate deliberately does NOT apply: a rule is inert data (no code runs), and a
 * saved credential that already works must keep working unchanged when an operator switches the
 * contributing plugin off. Switching `deploy` off hides deploy tools; it must not silently turn a
 * working credential's header into one its provider rejects.
 *
 * Architectural role: `features/custom-credentials` capability, read by `credentialed-request.ts`.
 * Depends on `features/agent-plugins` for installed-package discovery and trust.
 *
 * Contract rationale for the Jini implementation and this host boundary:
 *
 * One scheme rule: a token starting with `prefix` (case-sensitive, with at least one character after
 *  it) is sent as `Authorization: <scheme> <rest of the token>`. `id` is bookkeeping only.
 *
 * One recognized self-describing token: the `scheme` word to send, and the `value` that follows it
 *  in the token (everything after the prefix, unmodified).
 *
 * The rules a workspace's trusted plugins contribute, plus every file or rule that was dropped.
 *
 * An HTTP auth-scheme name is an RFC 9110 `token`.
 *
 * Returns the first rule whose `prefix` is a genuine leading prefix of `token` (case-sensitive) with
 * at least one character left after it, or `null`. A token that IS exactly the prefix has no
 * credential value left to send and falls through to ordinary Bearer/Basic handling, as does a token
 * that merely contains a prefix later in the string. Pure.
 *
 * @complexity O(r) rules, each one `startsWith`.
 *
 * Parses a plugin's {@link CREDENTIAL_SCHEMES_FILENAME}. Pure; the parser is exported by Jini for direct tests. Unknown
 * keys (such as a rule's `note`) are ignored.
 *
 * @complexity O(r) in the declared rule count.
 *
 * One rule entry, or the reason it is invalid. @complexity O(1).
 */

export type { CredentialSchemeRule, CredentialSchemeRegistry } from "@jini-ai/integrations/credentialed-http";

/** The file a plugin ships at its root to contribute self-describing token scheme rules. */
export const CREDENTIAL_SCHEMES_FILENAME = "tovu-credential-schemes.json";

/**
 * This workspace's scheme rules, from installed plugins that pass the bundled-digest gate (and NOT
 * the activation gate, see this file's header). Read fresh on every call: a credentialed request is
 * agent-triggered, not a hot path.
 *
 * @throws Nothing for a plugin-level fault; only a filesystem fault listing the workspace's package
 * directory itself propagates.
 * @complexity O(p) installed plugins, one small file read per contributing plugin.
 */
export async function loadCredentialSchemeRegistry(ctx: { readonly workspaceId: string }): Promise<CredentialSchemeRegistry> {
  const verdicts = await findTrustedPluginPackages({
    workspaceId: ctx.workspaceId,
    filename: CREDENTIAL_SCHEMES_FILENAME,
    contribution: "credential schemes",
    requireActive: false,
  });
  const rules: CredentialSchemeRule[] = [];
  const refusals: string[] = [];
  for (const verdict of verdicts) {
    if ("refusal" in verdict) {
      refusals.push(verdict.refusal);
      continue;
    }
    const load = await loadPackageRules(verdict.trusted);
    rules.push(...load.rules);
    refusals.push(...load.refusals);
  }
  return dropDuplicateIds(rules, refusals);
}

/**
 * Rules read straight from a plugin's SOURCE directory, with no install or digest gate. For the
 * hermetic composition root and tests only, where the directory is this product's own
 * `content/agent-plugins/<id>/`: never point it at anything an operator or a third party can write.
 *
 * @complexity O(r) declared rules.
 */
export async function loadCredentialSchemeRegistryFromSource(plugin: TrustedPluginPackage): Promise<CredentialSchemeRegistry> {
  const load = await loadPackageRules(plugin);
  return dropDuplicateIds(load.rules, load.refusals);
}

/** One trusted package's rules, or a refusal naming why its file was dropped. A package without the
 *  file (possible only on the source path) contributes nothing. @complexity O(r). */
async function loadPackageRules(plugin: TrustedPluginPackage): Promise<CredentialSchemeRegistry> {
  let raw: string;
  try {
    raw = await readTrustedPluginFile(plugin, CREDENTIAL_SCHEMES_FILENAME);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { rules: [], refusals: [] };
    throw error;
  }
  const parsed = parseCredentialSchemesFile({ raw });
  if (!parsed.ok) return { rules: [], refusals: [`credential schemes from '${plugin.pluginId}' were not loaded: ${CREDENTIAL_SCHEMES_FILENAME} is invalid: ${parsed.reason}`] };
  return { rules: parsed.rules, refusals: [] };
}

/** Drops every rule id more than one plugin declares ("refusing to guess"). Order of the survivors is
 *  kept, so first-match dispatch stays deterministic. @complexity O(r). */
function dropDuplicateIds(rules: readonly CredentialSchemeRule[], refusals: readonly string[]): CredentialSchemeRegistry {
  const counts = new Map<string, number>();
  for (const rule of rules) counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1);
  const duplicated = [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  return {
    rules: rules.filter((rule) => counts.get(rule.id) === 1),
    refusals: [...refusals, ...duplicated.map((id) => `credential scheme '${id}' was not loaded: more than one plugin declares it`)],
  };
}
