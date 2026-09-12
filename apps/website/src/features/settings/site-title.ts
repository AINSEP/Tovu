import type { JsonValue, UUID } from "@jini-ai/cms/core";
import {
  ensureSettingDefinitions,
  type EnsureSettingDefinitionsDeps,
  getEffective,
  SCOPE_BIT,
  type SettingsRepoPort,
} from "./index.js";

/**
 * @file SPEC-050 (`core.site.title`): the public site title as a per-workspace setting, and the one
 * resolver every render call site reads it through (REQ-02).
 *
 * Wiring Order Step 1, the spec's only permitted split. The definition's default is the literal
 * every site rendered before this setting existed, so registering it changes no rendered output,
 * and owner writes take effect everywhere the literal used to render. Step 2 moves the
 * no-owner-title value for new sites to the site display name. It must land in the same commit as
 * the pin that keeps pre-existing sites on the literal (REQ-06, REQ-07).
 *
 * `ownerKind: "core"` is forced, not chosen. The settings namespace fence (`@jini-ai/cms/settings`
 * `NAMESPACE_FENCE`) admits a `core.*` namespace only for a core definition, and requires such a
 * definition to be platform-wide (`workspaceId: null`). Its VALUES stay per-workspace through
 * `scopes: SCOPE_BIT.workspace`, which is REQ-01's shape.
 */

export const SITE_TITLE_NAMESPACE = "core.site";
export const SITE_TITLE_KEY = "title";

/** The title every site rendered before this setting existed (formerly `pages.ts`'s `SITE_TITLE`). */
export const LEGACY_SITE_TITLE = "Tovu Demo Site";

/** REQ-08's upper bound, mirroring `init-site.ts`'s limit for site display names. */
export const SITE_TITLE_MAX_LENGTH = 200;

export interface EnsureSiteTitleSettingDefinitionInput {
  /** The trusted boot-time actor the registration is attributed to (same convention as every other boot registrar). */
  systemPrincipalId: UUID;
}

/**
 * Idempotently registers the `core.site.title` definition. Safe to call on every boot:
 * `ensureSettingDefinitions` skips a registered definition and reconciles a changed core default.
 *
 * @complexity O(1), one definition.
 */
export async function ensureSiteTitleSettingDefinition(
  deps: EnsureSettingDefinitionsDeps,
  input: EnsureSiteTitleSettingDefinitionInput
): Promise<void> {
  await ensureSettingDefinitions(deps, {
    namespace: SITE_TITLE_NAMESPACE,
    definitions: [
      { key: SITE_TITLE_KEY, schema: { type: "string" }, defaultValue: LEGACY_SITE_TITLE, scopes: SCOPE_BIT.workspace },
    ],
    systemPrincipalId: input.systemPrincipalId,
  });
}

/**
 * The renderable form of a stored title: trimmed, 1..{@link SITE_TITLE_MAX_LENGTH} characters.
 * Anything else is `undefined`, so a caller falls back instead of rendering an empty or unbounded
 * `<title>` (REQ-08, REQ-09, INV-04). Pure.
 *
 * @complexity O(n) in the value's length.
 */
export function normalizeSiteTitle(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= SITE_TITLE_MAX_LENGTH ? trimmed : undefined;
}

export interface ResolveSiteTitleDeps {
  settingsRepo: SettingsRepoPort;
}

/**
 * The site title a public render shows for `workspaceId` (REQ-03). Reads without a principal, so
 * the user layer never applies (INV-03). Never throws. A failed read, an unregistered definition
 * (the boot chain is still pending), or an unusable stored value all resolve to
 * {@link LEGACY_SITE_TITLE}, so a settings fault can never turn a public page into a 500 (REQ-09).
 *
 * @complexity O(1) repo reads per call.
 */
export async function resolveSiteTitle(deps: ResolveSiteTitleDeps, input: { workspaceId: UUID }): Promise<string> {
  try {
    const resolved = await getEffective(
      { repo: deps.settingsRepo },
      { namespace: SITE_TITLE_NAMESPACE, key: SITE_TITLE_KEY, scopeContext: { workspaceId: input.workspaceId } }
    );
    return normalizeSiteTitle(resolved?.value ?? undefined) ?? LEGACY_SITE_TITLE;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`resolveSiteTitle: falling back to the legacy title for workspace '${input.workspaceId}': ${(err as Error).message}`);
    return LEGACY_SITE_TITLE;
  }
}
