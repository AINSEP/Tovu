/** EventSource-compatible page transport, with ownership delegated to browser-stream. */
import { startBrowserStream, type BrowserStreamPorts } from "./browser-stream";
import { adminStreamActivity, type StreamActivity } from "./stream-activity";

type Source = Pick<EventSource, "addEventListener" | "close" | "readyState">;

/**
 * Preserve the bridge's EventSource contract across idle close/reopen, including native errors.
 * Pausing emits an error so the bridge clears its now-invalid bind token; reconnect attaches anew.
 * Message/command frames remain local: rebroadcasting them could click another tab's page.
 * @returns A disposable EventSource facade; native sources retain their own reconnect/backoff.
 * @complexity O(1) state and three listeners per live source.
 */
export function openTabEventSource(
  { url }: { url: string },
  { open = (url: string): Source => new EventSource(url), ports, activity = adminStreamActivity }: {
    open?: (url: string) => Source; ports?: BrowserStreamPorts; activity?: StreamActivity;
  } = {},
): EventSource {
  let source: Source | undefined;
  let disposed = false;
  class ManagedSource extends EventTarget implements EventSource {
    // EventTarget already supports these listeners; expose EventSource's typed event overloads.
    readonly addEventListener = super.addEventListener.bind(this) as EventSource["addEventListener"];
    readonly removeEventListener = super.removeEventListener.bind(this) as EventSource["removeEventListener"];
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSED = 2;
    readonly url = url;
    readonly withCredentials = false;
    onerror: EventSource["onerror"] = null;
    onmessage: EventSource["onmessage"] = null;
    onopen: EventSource["onopen"] = null;
    get readyState(): number { return disposed ? 2 : source?.readyState ?? 0; }
    close(): void {
      if (disposed) return;
      disposed = true;
      stop();
    }
  }
  const managed = new ManagedSource();
  // Assigned before `managed` is returned, so no caller can reach `close()` while it is unset.
  const stop = startBrowserStream({ key: url, connect: () => {
    const current = open(url);
    source = current;
    for (const kind of ["message", "error", "open"] as const) {
      current.addEventListener(kind, (event) => {
        if (source !== current || disposed) return;
        const message = event as MessageEvent<string>;
        const forwarded = kind === "message"
          ? new MessageEvent("message", { data: message.data, lastEventId: message.lastEventId, origin: message.origin })
          : new Event(kind);
        managed.dispatchEvent(forwarded);
        if (kind === "message") managed.onmessage?.call(managed, forwarded as MessageEvent);
        else if (kind === "error") managed.onerror?.call(managed, forwarded);
        else managed.onopen?.call(managed, forwarded);
      });
    }
    return () => {
      source = undefined;
      current.close();
      // The daemon revokes its token on close. Clear the bridge's copy before another run starts.
      if (!disposed) {
        const event = new Event("error");
        managed.dispatchEvent(event);
        managed.onerror?.call(managed, event);
      }
    };
  } }, { ports, scope: "tab", activity });
  return managed;
}
