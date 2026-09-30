import { findTrustedPluginPackages, readTrustedPluginFile, type TrustedPluginPackage } from "#src/features/agent-plugins/trusted-plugin-files";

/**
 * @file Self-describing token schemes: tokens that carry their own `Authorization` scheme word as a
 * leading prefix (a vendor token such as `<Scheme><rest>` must be sent as `Authorization: <Scheme>
 * <rest>`, and is rejected when sent as `Bearer <whole token>`). Core names no vendor: the rules are
 * DATA that Agent Plugins ship in {@link CREDENTIAL_SCHEMES_FILENAME}, and {@link detectSelfDescribingAuthScheme}
 * applies them. The `deploy` plugin ships the one rule known today, with its live-verification
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
 */

/** The file a plugin ships at its root to contribute self-describing token scheme rules. */
export const CREDENTIAL_SCHEMES_FILENAME = "tovu-credential-schemes.json";

/** One scheme rule: a token starting with `prefix` (case-sensitive, with at least one character after
 *  it) is sent as `Authorization: <scheme> <rest of the token>`. `id` is bookkeeping only. */
export interface CredentialSchemeRule {
  readonly id: string;
  readonly prefix: string;
  readonly scheme: string;
}

/** One recognized self-describing token: the `scheme` word to send, and the `value` that follows it
 *  in the token (everything after the prefix, unmodified). */
export interface SelfDescribingTokenMatch {
  readonly scheme: string;
  readonly value: string;
}

/** The rules a workspace's trusted plugins contribute, plus every file or rule that was dropped. */
export interface CredentialSchemeRegistry {
  readonly rules: readonly CredentialSchemeRule[];
  readonly refusals: readonly string[];
}

const RULE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** An HTTP auth-scheme name is an RFC 9110 `token`. */
const HTTP_TOKEN_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const MAX_FIELD_LENGTH = 64;
const MAX_RULES = 32;

/**
 * Returns the first rule whose `prefix` is a genuine leading prefix of `token` (case-sensitive) with
 * at least one character left after it, or `null`. A token that IS exactly the prefix has no
 * credential value left to send and falls through to ordinary Bearer/Basic handling, as does a token
 * that merely contains a prefix later in the string. Pure.
 *
 * @complexity O(r) rules, each one `startsWith`.
 */
export function detectSelfDescribingAuthScheme(token: string, rules: readonly CredentialSchemeRule[]): SelfDescribingTokenMatch | null {
  for (const rule of rules) {
    if (token.startsWith(rule.prefix) && token.length > rule.prefix.length) {
      return { scheme: rule.scheme, value: token.slice(rule.prefix.length) };
    }
  }
  return null;
}

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
  const parsed = parseCredentialSchemesFile(raw);
  if (!parsed.ok) return { rules: [], refusals: [`credential schemes from '${plugin.pluginId}' were not loaded: ${CREDENTIAL_SCHEMES_FILENAME} is invalid: ${parsed.reason}`] };
  return { rules: parsed.rules, refusals: [] };
}

/**
 * Parses a plugin's {@link CREDENTIAL_SCHEMES_FILENAME}. Pure (exported for its own tests). Unknown
 * keys (such as a rule's `note`) are ignored.
 *
 * @complexity O(r) in the declared rule count.
 */
export function parseCredentialSchemesFile(raw: string): { readonly ok: true; readonly rules: readonly CredentialSchemeRule[] } | { readonly ok: false; readonly reason: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  if (!isPlainObject(value) || value.schemaVersion !== 1) return { ok: false, reason: "schemaVersion must be 1" };
  if (!Array.isArray(value.schemes) || value.schemes.length > MAX_RULES) return { ok: false, reason: `schemes must be an array of at most ${MAX_RULES} rules` };

  const rules: CredentialSchemeRule[] = [];
  for (const [index, entry] of value.schemes.entries()) {
    const rule = parseRule(entry, `schemes[${index}]`);
    if (typeof rule === "string") return { ok: false, reason: rule };
    if (rules.some((seen) => seen.id === rule.id)) return { ok: false, reason: `schemes[${index}].id '${rule.id}' is declared twice` };
    rules.push(rule);
  }
  return { ok: true, rules };
}

/** One rule entry, or the reason it is invalid. @complexity O(1). */
function parseRule(entry: unknown, at: string): CredentialSchemeRule | string {
  if (!isPlainObject(entry)) return `${at} must be an object`;
  const { id, prefix, scheme } = entry;
  if (typeof id !== "string" || id.length > MAX_FIELD_LENGTH || !RULE_ID_PATTERN.test(id)) return `${at}.id must be a lowercase hyphenated id`;
  if (typeof prefix !== "string" || prefix.length === 0 || prefix.length > MAX_FIELD_LENGTH || !HTTP_TOKEN_PATTERN.test(prefix)) {
    return `${at}.prefix must be a non-empty run of HTTP token characters`;
  }
  if (typeof scheme !== "string" || scheme.length > MAX_FIELD_LENGTH || !HTTP_TOKEN_PATTERN.test(scheme)) return `${at}.scheme must be an HTTP auth-scheme name`;
  return { id, prefix, scheme };
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

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
