/**
 * Dock fixtures that do not exercise the conversation deep link pass these: no route query (so the
 * link hook has nothing to apply) and a hook that does nothing. Why: both props are REQUIRED on the
 * dock, so a fixture must say "deep link off" explicitly instead of inheriting a live default.
 */
export const DOCK_DEEP_LINK_OFF = { query: null, useConversationDeepLink: () => undefined } as const;
