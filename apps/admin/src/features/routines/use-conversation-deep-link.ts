import type { ConversationLinkBuilder } from "./Routines";

/**
 * @file Authorized-detail URL builder for the Routines screen. Why: a routine row links to the
 * conversation its run produced; the link only carries the id. Whether the owner may open it is
 * decided when the dock applies the link (`useApplyConversationDeepLink`), never by this builder.
 */
export const useConversationLinkBuilder: ConversationLinkBuilder = () => ({
  hrefFor: ({ conversationId }) => `/ai-assistant?conversation=${encodeURIComponent(conversationId)}`,
});
