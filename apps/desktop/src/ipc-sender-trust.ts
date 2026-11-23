/**
 * @file Who sent this IPC message (B115). `event.sender` is the whole `WebContents`: a site page in an
 * `<iframe>` inside the shell window shares it, and so shares its trusted `getURL()`. Only the frame
 * the message actually came from (`event.senderFrame`) tells the shell's own document apart, so the
 * check needs both: the page is trusted AND the message came from that page's main frame.
 */
import { orFallbackSync } from '@jini-ai/core/errors/idioms';

/** The slice of Electron's `IpcMainEvent` / `IpcMainInvokeEvent` the check reads. */
export interface IpcSenderEvent {
  sender: { getURL(): string };
  senderFrame?: { url: string; parent: unknown } | null;
}

/**
 * True only when the message came from a trusted page's main frame. Pure over `isTrustedUrl`.
 * A frame or sender torn down while its message was in flight throws on `url`/`getURL()`; that reads
 * as untrusted, never as a main-process error.
 * @param required.event the IPC event.
 * @param required.isTrustedUrl the host's "is this one of my own renderer pages" predicate.
 * @complexity O(1) plus two predicate calls.
 */
export function isTrustedMainFrame(
  { event, isTrustedUrl }: { event: IpcSenderEvent; isTrustedUrl: (required: { url: string }) => boolean },
  _optional = {},
): boolean {
  return orFallbackSync({ work: () => {
    const frame = event.senderFrame;
    return !!frame && frame.parent === null && isTrustedUrl({ url: frame.url }) && isTrustedUrl({ url: event.sender.getURL() });
  }, fallback: false, step: 'Verify IPC sender frame' });
}
