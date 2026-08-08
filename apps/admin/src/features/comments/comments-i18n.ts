/**
 * @file Spanish dictionary for the Comments feature. Covers `rules.ts`'s moderation-queue
 * row-menu labels (`commentRowMenuItems`: Approve/Spam/Trash/Restore/Purge) as well as the
 * hook-level notice/error strings from `use-comment-queue.hooks.ts` and
 * `use-comment-settings.hooks.ts` (`describeApiError` fallbacks, `setNotice` copy) — those never
 * got translated during the JSX-only pass since they live in `.hooks.ts` files, not component
 * markup. `Comments.tsx`'s own markup was not part of the earlier admin i18n pass and stays
 * English for now (see `redirects-i18n.tsx`/`integrations-i18n.tsx`/`recovery-i18n.tsx`'s matching
 * "rules.ts labels not translated" notes, now being closed feature-by-feature).
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const COMMENTS_DICT: Record<string, Record<string, string>> = {
  es: {
    Approve: "Aprobar",
    // Kept as "Spam" in Spanish too, deliberately — the loanword is what Spanish-language
    // moderation UIs use for this exact one-word label (e.g. Gmail's own Spanish interface), not an
    // untranslated leftover.
    Spam: "Spam",
    // "Trash" itself now falls through to the shared `COMMON_I18N` entry (same value as
    // `lib/admin-nav-i18n.ts`'s "Trash" nav entry, `widgets-i18n.ts`'s Trash tab).
    Restore: "Restaurar",
    // Reuses the phrase already established for the same underlying action under a different
    // English source string (`media-i18n.ts`/`widgets-i18n.ts`'s "Delete permanently") rather than
    // inventing a literal "Purgar".
    Purge: "Eliminar permanentemente",

    // use-comment-queue.hooks.ts / use-comment-settings.hooks.ts (hook-level notice/error strings)
    "failed to load the moderation queue": "no se pudo cargar la cola de moderación",
    "Failed to purge comment.": "No se pudo purgar el comentario.",
    "failed to load Comments settings": "no se pudo cargar la configuración de comentarios",
    "failed to save Comments settings": "no se pudo guardar la configuración de comentarios",
  },
};

export const t = createDictionaryTranslator(COMMENTS_DICT);
