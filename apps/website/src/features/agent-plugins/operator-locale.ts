import { getEffective as settingsGetEffective, LANGUAGE_NAMESPACE, type SettingsRepoPort } from "@jini-ai/cms/settings";

/**
 * @file The calling operator's admin language, for the Agent Plugin confirmation dialogs.
 *
 * `memory-i18n.ts` carries the note/uninstall dialog copy in every admin locale, but its callers
 * (`write-note-tool.ts`, `uninstall-confirmation-ui.ts`) never passed a locale, so the dialogs were
 * English for every operator. The operator's choice is the per-user `core.language.locale` setting
 * the admin's own Language selector writes; this reads it the same way `settings_get_effective` does.
 */

/** The route-deps slice this reads. `settingsRepo` is always present on the composed assistant
 *  deps (`SettingsToolDeps`); optional so the many narrow test fixtures that never render copy keep
 *  working, and they get English. */
export interface OperatorLocaleDeps {
  readonly settingsRepo?: SettingsRepoPort;
}

/** Structural signature of `@jini-ai/cms/settings`'s `getEffective`, narrowed to what is read here. */
export type GetEffectiveSetting = (
  deps: { repo: SettingsRepoPort },
  input: { namespace: string; key: string; scopeContext: { workspaceId: string; principalId: string } },
) => Promise<{ value: unknown } | null>;

const FALLBACK_LOCALE = "en";

/**
 * Resolves the operator's admin locale code ("es", "pt-BR", ...), or "en".
 * Copy must never block a safety confirmation, so a missing repo, an unset or non-string value, and
 * a failed settings read all degrade to English, exactly as the admin's own locale hook does.
 * @param required.deps Route deps carrying the settings ledger.
 * @param required.workspaceId The tool's workspace.
 * @param required.principalId The operator the dialog is shown to.
 * @param optional.getEffective Settings resolver; defaults to the ledger's real `getEffective`.
 * @returns A locale code for `memoryText`.
 * @complexity O(1): one effective-setting read (up to three layer reads).
 */
export async function resolveOperatorLocale(
  required: { deps: OperatorLocaleDeps; workspaceId: string; principalId: string },
  { getEffective = settingsGetEffective as unknown as GetEffectiveSetting }: { getEffective?: GetEffectiveSetting } = {},
): Promise<string> {
  const { settingsRepo } = required.deps;
  if (!settingsRepo) return FALLBACK_LOCALE;
  try {
    const resolved = await getEffective({ repo: settingsRepo }, {
      namespace: LANGUAGE_NAMESPACE, key: "locale",
      scopeContext: { workspaceId: required.workspaceId, principalId: required.principalId },
    });
    return typeof resolved?.value === "string" && resolved.value ? resolved.value : FALLBACK_LOCALE;
  } catch {
    return FALLBACK_LOCALE;
  }
}
