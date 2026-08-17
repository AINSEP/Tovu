import { interpolate } from "../../lib/template-i18n";
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

/**
 * @file Translations for the Security page (`/admin/access-tokens`). Same shape as
 * `deployment/deployment-i18n.tsx`/`source-control/source-control-i18n.ts`: a flat
 * `DICT[locale][englishKey] = translation` map, `t = createDictionaryTranslator(DICT)`.
 *
 * KNOWN GAP, disclosed rather than silent: this dictionary is English-only for v1 — every OTHER
 * feature dictionary in this app carries the full ~20-locale set `SOURCE_CONTROL_DICT` shows, and
 * this page should eventually match that. `createDictionaryTranslator`'s own fallback chain
 * (`featureDict[locale]?.[key] ?? COMMON_I18N[locale]?.[key] ?? key`) is what makes this a legible
 * degrade rather than a broken one — a non-English reader sees this page's own copy in English
 * inside an otherwise-translated admin, the same "partial-coverage precedent" this file's sibling
 * dictionaries already document for their own newest strings, just applied to the whole page rather
 * than one or two edge-case templates. Follow-up: translate `SECURITY_DICT` into the same locale set
 * `SOURCE_CONTROL_DICT` carries.
 */

const SECURITY_DICT: Record<string, Record<string, string>> = {};

export const t = createDictionaryTranslator(SECURITY_DICT);

/** Load error banner — same `{error}`-interpolated template shape
 *  `publishCredentialsLoadErrorMessage`/`sourceControlCredentialsLoadErrorMessage` use. */
const ACCESS_TOKENS_LOAD_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't load saved access tokens: {error}",
};
export function accessTokensLoadErrorMessage(locale: string, error: string): string {
  return interpolate(ACCESS_TOKENS_LOAD_ERROR_TEMPLATE[locale] ?? ACCESS_TOKENS_LOAD_ERROR_TEMPLATE.en!, { error });
}

/** One row's save-error banner — mirrors `publishCredentialSaveErrorMessage`'s exact shape. */
const ACCESS_TOKEN_SAVE_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't save this token: {error}",
};
export function accessTokenSaveErrorMessage(locale: string, error: string): string {
  return interpolate(ACCESS_TOKEN_SAVE_ERROR_TEMPLATE[locale] ?? ACCESS_TOKEN_SAVE_ERROR_TEMPLATE.en!, { error });
}

/** A duplicate-name rejection — this page's own case, since neither origin store's dictionary has a
 *  template naming a PROVIDER + a NAME the way this page's uniqueness check does (`rules.ts`'s
 *  `accessTokenNameTaken`). */
const ACCESS_TOKEN_DUPLICATE_NAME_TEMPLATE: Record<string, string> = {
  en: 'A token named "{name}" already exists for {provider}.',
};
export function accessTokenDuplicateNameMessage(locale: string, name: string, provider: string): string {
  return interpolate(ACCESS_TOKEN_DUPLICATE_NAME_TEMPLATE[locale] ?? ACCESS_TOKEN_DUPLICATE_NAME_TEMPLATE.en!, { name, provider });
}

/** The Remove confirm dialog's three pieces of copy (`rules.ts`'s own "Remove from Tovu, never
 *  Revoke" load-bearing constraint — `development/todos.md:1208`) — kept as templates rather than
 *  built from `t()` fragments plus raw JSX spans, since the load-bearing FACT here (removing here
 *  does not revoke there) is exactly the kind of sentence that must not fragment across a
 *  flat-dictionary boundary and risk a future translator reordering it into something that drops or
 *  inverts the claim. */
const REMOVE_DIALOG_TITLE_TEMPLATE: Record<string, string> = { en: 'Remove "{name}" from Tovu?' };
export function removeDialogTitle(locale: string, name: string): string {
  return interpolate(REMOVE_DIALOG_TITLE_TEMPLATE[locale] ?? REMOVE_DIALOG_TITLE_TEMPLATE.en!, { name });
}

/** Two placeholders, not one: `{credentialLabel}` (what the saved row is FOR — `AccessTokenProviderInfo.label`,
 *  e.g. "GitHub Pages") and `{vendor}` (who actually issues/revokes it — `AccessTokenProviderInfo.vendorLabel`,
 *  e.g. "GitHub"). Collapsing both into one `{provider}` placeholder was the owner-reported bug: this
 *  sentence told an operator to revoke "on GitHub Pages", which has no revoke console of its own. See
 *  `rules.ts`'s `AccessTokenProviderInfo.vendorLabel` doc for the full reasoning. */
const REMOVE_DIALOG_BODY_TEMPLATE: Record<string, string> = {
  en: "This deletes Tovu's saved copy of this {credentialLabel} token. It does NOT revoke the token on {vendor} — it stays valid there until you revoke it yourself.",
};
export function removeDialogBody(locale: string, credentialLabel: string, vendor: string): string {
  return interpolate(REMOVE_DIALOG_BODY_TEMPLATE[locale] ?? REMOVE_DIALOG_BODY_TEMPLATE.en!, { credentialLabel, vendor });
}

const REMOVE_DIALOG_LAST_ROW_TEMPLATE: Record<string, string> = {
  en: "This is the only saved {provider} token — after removing it, nothing here will be marked as connected.",
};
export function removeDialogLastRowNote(locale: string, provider: string): string {
  return interpolate(REMOVE_DIALOG_LAST_ROW_TEMPLATE[locale] ?? REMOVE_DIALOG_LAST_ROW_TEMPLATE.en!, { provider });
}
