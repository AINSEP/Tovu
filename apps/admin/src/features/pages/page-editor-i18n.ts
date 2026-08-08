/**
 * @file Spanish dictionary for `use-page-editor.hooks.ts`'s own notice/error strings
 * (`setMessage`/`setError` fallbacks) — NOT `PageEditor.tsx`'s JSX markup, which `pages-i18n.ts`'s
 * own header notes was deliberately left out of scope by the earlier `.tsx`-only translation pass.
 * This file exists because that scope boundary was JSX vs. hooks, not "this feature's editor is
 * untranslated" — the hook's hardcoded English strings still surface directly in the UI (the same
 * gap `comments-i18n.ts` closes for `use-comment-queue.hooks.ts`/`use-comment-settings.hooks.ts`).
 * Same two-step fallback every other `t()` in this app uses: translated value, else the English
 * source string itself.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const PAGE_EDITOR_DICT: Record<string, Record<string, string>> = {
  es: {
    "failed to load page": "no se pudo cargar la página",
    Saved: "Guardado",
    "failed to save page": "no se pudo guardar la página",
    "failed to delete page": "no se pudo eliminar la página",
  },
};

export const t = createDictionaryTranslator(PAGE_EDITOR_DICT);
