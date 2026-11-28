/**
 * @file The dock's chat cleanup wording, built from the dock's own translator. Keys are the English
 * text (the dock dictionary's convention); translations live in `app-i18n.ts`'s dock host dictionary.
 */

/** The dock translator's shape (`useAssistantDockChrome().t`). */
export type DockTranslate = (input: { key: string }, options?: Record<string, never>) => string;

/** Every string the cleanup panel and `ChatCleanupDialog` show. */
export interface ChatCleanupCopy {
  dialog: { preview: string; confirm: string; expired: string; choose: string; partial: string; count: (required: { count: number; bytes: number }) => string };
  open: string;
  olderThan: string;
  deleteSelected: (required: { count: number }) => string;
  deleteSelectedBody: string;
  untitled: string;
  reason: (required: { reason: string }) => string;
  errors: { notConfigured: string; invalid: string; failed: string };
}

const REASONS: Record<string, string> = {
  pinned: "Pinned",
  open: "Open",
  active: "Still running",
  recoverable: "Can still be recovered",
  changed: "Changed since the preview",
};

/**
 * Builds the cleanup copy for one locale. Pure.
 * @param required.untitled - The chat package's own "Untitled" text, for kept chats with no title.
 * @complexity O(1).
 */
export function chatCleanupCopy({ t, locale, untitled }: { t: DockTranslate; locale: string; untitled: string }, _optional = {}): ChatCleanupCopy {
  const tr = (key: string) => t({ key });
  const size = new Intl.NumberFormat(locale, { notation: "compact", style: "unit", unit: "byte", unitDisplay: "narrow" });
  return {
    dialog: {
      preview: tr("Show what would be deleted"),
      confirm: tr("Delete these chats"),
      expired: tr("This preview expired. Choose again to see what would be deleted."),
      choose: tr("Choose again"),
      partial: tr("More chats are left. Delete the next batch."),
      count: ({ count, bytes }) => `${tr("Chats to delete")}: ${count} (${size.format(bytes)})`,
    },
    open: tr("Clean up chats"),
    olderThan: tr("Delete chats older than this many days"),
    deleteSelected: ({ count }) => `${tr("Delete selected")} (${count})`,
    deleteSelectedBody: tr("Delete the selected chats? This cannot be undone."),
    untitled,
    // Own keys only: a server reason such as "constructor" must not resolve to an Object.prototype member.
    reason: ({ reason }) => tr((Object.hasOwn(REASONS, reason) ? REASONS[reason] : undefined) ?? "Not checked"),
    errors: {
      notConfigured: tr("Chat cleanup is not available on this site."),
      invalid: tr("Choose between 1 and 365 days."),
      failed: tr("Couldn't finish. Nothing else was deleted. Try again."),
    },
  };
}
