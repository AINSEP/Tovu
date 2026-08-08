/**
 * @file Spanish dictionary for `use-settings-container.hooks.ts`'s own notice/error strings — the
 * "Raw Settings" ops/debug screen (`Settings.tsx` in this feature) was never touched by the
 * earlier `.tsx`-only translation pass at all (no `useAdminLocale`/dictionary reference anywhere
 * in it), so this file starts scoped to just the hook. Same two-step fallback every other `t()`
 * in this app uses: translated value, else the English source string itself.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";
import { interpolate, pickPlural } from "../../lib/template-i18n";

const SETTINGS_RAW_DICT: Record<string, Record<string, string>> = {
  es: {
    "Failed to load namespace": "No se pudo cargar el espacio de nombres",
    "Failed to save value": "No se pudo guardar el valor",
    "Failed to clear value": "No se pudo borrar el valor",
    "Failed to reset namespace": "No se pudo restablecer el espacio de nombres",
  },
};

export const t = createDictionaryTranslator(SETTINGS_RAW_DICT);

const PRINCIPAL_NOT_FOUND_TEMPLATE: Record<string, string> = {
  en: 'PRINCIPAL_NOT_FOUND: no active principal matches "{principalIdRaw}".',
  es: 'PRINCIPAL_NOT_FOUND: ningún principal activo coincide con "{principalIdRaw}".',
};

/** `onSubmitPrincipal`'s no-match error — keeps the `PRINCIPAL_NOT_FOUND:` machine-readable code
 *  prefix untranslated (same convention as an HTTP status code or error code elsewhere in this
 *  app) and only translates the human-readable remainder, which embeds the raw typed input
 *  mid-sentence so it can't be a flat `ES` entry. */
export function principalNotFoundMessage(locale: string, principalIdRaw: string): string {
  return interpolate(PRINCIPAL_NOT_FOUND_TEMPLATE[locale] ?? PRINCIPAL_NOT_FOUND_TEMPLATE.en, { principalIdRaw });
}

const SAVED_AT_SCOPE_TEMPLATE: Record<string, string> = {
  en: "Saved {namespace}.{key} at {scope} scope.",
  es: "Se guardó {namespace}.{key} en el ámbito {scope}.",
};

/** `onSubmitValue`'s live-region success announcement — embeds `namespace`/`key`/`scope`
 *  mid-sentence. */
export function savedAtScopeMessage(locale: string, namespace: string, key: string, scope: string): string {
  return interpolate(SAVED_AT_SCOPE_TEMPLATE[locale] ?? SAVED_AT_SCOPE_TEMPLATE.en, { namespace, key, scope });
}

const CLEARED_AT_SCOPE_TEMPLATE: Record<string, string> = {
  en: "Cleared {namespace}.{key} at {scope} scope.",
  es: "Se borró {namespace}.{key} en el ámbito {scope}.",
};

/** `onClearValue`'s live-region success announcement — same shape as {@link savedAtScopeMessage}. */
export function clearedAtScopeMessage(locale: string, namespace: string, key: string, scope: string): string {
  return interpolate(CLEARED_AT_SCOPE_TEMPLATE[locale] ?? CLEARED_AT_SCOPE_TEMPLATE.en, { namespace, key, scope });
}

const RESET_NAMESPACE_TEMPLATE: Record<string, { one: string; other: string }> = {
  en: {
    one: "Reset {clearedCount} setting(s) in {namespace} ({scope} scope) to defaults.",
    other: "Reset {clearedCount} setting(s) in {namespace} ({scope} scope) to defaults.",
  },
  es: {
    one: "Se restableció {clearedCount} configuración en {namespace} (ámbito {scope}) a sus valores predeterminados.",
    other: "Se restablecieron {clearedCount} configuraciones en {namespace} (ámbito {scope}) a sus valores predeterminados.",
  },
};

/** `onConfirmReset`'s live-region success announcement — Spanish singular/plural agreement on the
 *  cleared-count ("1 configuración" vs "N configuraciones") the English "setting(s)" shorthand
 *  doesn't need. */
export function resetNamespaceMessage(locale: string, clearedCount: number, namespace: string, scope: string): string {
  const forms = RESET_NAMESPACE_TEMPLATE[locale] ?? RESET_NAMESPACE_TEMPLATE.en;
  return interpolate(pickPlural(clearedCount, forms), { clearedCount, namespace, scope });
}
