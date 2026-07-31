import type { ChatMessage } from "@jini-ai/chat-core";

import type { AssistantConversation } from "../lib/assistant-chats";

/**
 * @file What `useAssistantChats` needs from the outside world, as an interface rather than a set of
 * module imports.
 *
 * The hook used to import `lib/assistant-chats`'s functions directly, which meant the only way to
 * test it was to stub the global `fetch` and assert on the URLs and methods that came out — the
 * tests described HTTP when what they meant to describe was "which conversation did this message
 * get written to". Worse, behaviour that has nothing to do with transport (the write retry and its
 * backoff) could only be exercised by hand-building `Response` objects with the right status codes.
 *
 * Declaring the seam here follows the `useX(dependencies)` / `useWiredX()` pair this workspace
 * already uses throughout `@jini-ai/ui` (see `features/html-viewer/react/hooks/usePresentMode.ts`
 * for the canonical shape, and `foundry/docs/jini-port/skills/fixing-open-design-web.md` for the
 * rules). `ports.ts` declares, `assistant-chats-dependencies.ts` binds, and nothing else imports the
 * real provider.
 *
 * `AssistantConversation` is imported here `import type`, which is erased at compile time — so this
 * file still has no runtime dependency on `lib/assistant-chats`, and `dependencies.ts` remains the
 * single place the real implementation is reached.
 *
 * ## What is deliberately NOT in this port
 *
 * `persistableMessages` and `HttpError`. The first is a pure rule — no I/O, no host — and per the
 * pattern a hook imports rules directly rather than having them injected; making it swappable would
 * let a fake quietly change which messages count as settled, which is the one thing every test here
 * needs to hold still. The second is the error type an implementation is expected to throw for a
 * non-2xx response, and it is part of this contract even though it is not a method: {@link
 * AssistantChatsPort.saveMessage}'s retry classifies failures by it.
 */
export interface AssistantChatsPort {
  listConversations(): Promise<AssistantConversation[]>;
  /** `firstMessage` seeds the server-side title heuristic; omit it for an untitled empty chat. */
  createConversation(firstMessage?: string): Promise<AssistantConversation>;
  renameConversation(id: string, title: string): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  loadMessages(conversationId: string): Promise<ChatMessage[]>;
  /**
   * Writes one message.
   *
   * Expected to reject with an `HttpError` for a non-2xx response and with anything else for a
   * transport failure — the hook retries the second kind, and the first only for 429/5xx. An
   * implementation that swallows failures into a resolved promise silently disables the retry.
   */
  saveMessage(conversationId: string, message: ChatMessage): Promise<void>;
}
