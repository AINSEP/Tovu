import { createDictionaryTranslator } from "../../lib/dictionary-translator";

/**
 * @file Copy for the Sites admin screen (`/admin/sites`).
 *
 * **Translations are not authored yet, and that is a disclosed gap rather than a silent one.**
 * `createDictionaryTranslator`'s lookup order is feature dict -> shared `COMMON_I18N` -> the English
 * key itself, so with an empty feature dict every locale still renders correct English copy, and
 * the words this screen shares with the rest of the admin (`Save`, `Cancel`, `Created`, …) still
 * come back translated from `COMMON_I18N` for all 18 locales. Adding a locale here later is purely
 * additive — no call site changes, because in this admin the English copy string IS the key.
 *
 * The alternative considered and rejected was shipping two or three hand-written locales out of the
 * 18 the other feature dictionaries carry: partial coverage would leave the screen visibly
 * half-translated in a way a fully-absent dict does not, while adding 16 more locales of
 * unverifiable machine translation to a screen whose copy is load-bearing (it is the only thing
 * standing between the operator and believing a site switch happened) is a worse trade again.
 *
 * Every string in this screen is chrome/explanatory copy. The data — folder names, display names,
 * absolute paths, and the server's own `restartInstructions` — is rendered verbatim and never
 * translated, matching how `AdminExternalMcpServer.serverId` is handled elsewhere in this app.
 */
const SITES_DICT: Record<string, Record<string, string>> = {};

export const t = createDictionaryTranslator(SITES_DICT);
