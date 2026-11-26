import type { DeepLinkPorts } from "@jini-ai/admin/shell/hooks/use-conversation-deep-link";
import type { ConversationLinkBuilder } from "@jini-ai/admin/screens/routines/Routines";

/**
 * @file Authorized-detail URL builder for the Routines screen. Why: a routine row links to the
 * conversation its run produced; the link only carries the id. Whether the owner may open it is
 * decided when the dock applies the link (`useApplyConversationDeepLink`), never by this builder.
 */
export const useConversationLinkBuilder: ConversationLinkBuilder = () => ({
  hrefFor: ({ conversationId }) => `/ai-assistant?conversation=${encodeURIComponent(conversationId)}`,
});

/**
 * @file The dock half of "Open conversation": applies `?conversation=<id>` by selecting an EXISTING
 * conversation the signed-in owner can already list. Why: a link must never create a conversation,
 * send a message or start a run, so admission is the owner-scoped list read (not `select`, which
 * returns void), a transient fetch error is not proof the conversation is gone, and a missing one
 * clears only `conversation` from the URL (keeping `tab`) with a plain notice.
 */
import { listConversations } from "../../lib/assistant-chats";

/** Production lookup: the current owner-scoped list read. */
export const lookupOwnedConversation: DeepLinkPorts["lookupConversation"] = async ({ id }) => (await listConversations()).some((conversation) => conversation.id === id);

/** Production URL rewrite: replaceState keeps history clean; the router re-reads the URL on its next navigation. */
export const replaceBrowserQuery: DeepLinkPorts["replaceQuery"] = ({ query }) => {
  const url = new URL(window.location.href);
  url.search = query.toString();
  window.history.replaceState(window.history.state, "", url);
};

