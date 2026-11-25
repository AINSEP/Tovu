import type { ButtonHTMLAttributes } from "react";
import { Button } from "@jini-ai/ui-kit/react";

import type { ChatCleanupKit } from "./hooks/chat-cleanup.hooks";

/**
 * The cleanup controls' button: `@jini-ai/ui-kit`'s `Button` behind the native-button shape that
 * `ChatCleanupPanel` and `@jini-ai/chat/react`'s `ChatCleanupDialog` call it with.
 *
 * Why an adapter, not the kit `Button` itself: the kit's contract is `onPress` (plus `attrs` for
 * `aria-*`), and its native control wires its own `onClick` to `onPress`, so a caller's `onClick`
 * is silently dropped. Handing the bare kit `Button` in (merge-23) left "Clean up chats" rendered
 * but inert in the real dock, with no error, while every test passed a plain `"button"`. The
 * cleanup callers never read the click event, so pressing calls them without one.
 *
 * @complexity O(1).
 */
function ChatCleanupKitButton({ onClick, type, disabled, children, "aria-expanded": expanded }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const press = onClick as (() => void) | undefined;
  return (
    <Button type={type} disabled={disabled} attrs={expanded === undefined ? undefined : { "aria-expanded": expanded }}
      onPress={press ? () => press() : undefined}>
      {children}
    </Button>
  );
}

/** The dock's cleanup kit: the admin's themed button, speaking the cleanup's `onClick`. */
export const DOCK_CHAT_CLEANUP_KIT: ChatCleanupKit = { Button: ChatCleanupKitButton };
