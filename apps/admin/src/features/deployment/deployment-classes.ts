/**
 * @file The admin stylesheet classes the neutral deploy views (`@jini-ai/devops/deploy/react`)
 * take as props. Values are the class names those views hard-coded before the move.
 */

/** `HistoryTab`'s empty-state classes. */
export const HISTORY_TAB_CLASSES = {
  tab: "deployment-tab", card: "card", empty: "deployment-empty", mark: "deployment-empty-mark",
  title: "deployment-empty-title", body: "deployment-empty-body", secondaryButton: "btn-secondary",
} as const;

/** `PublishRunResult`'s outcome classes. */
export const PUBLISH_RUN_RESULT_CLASSES = { success: "save-ok", error: "save-error" } as const;
