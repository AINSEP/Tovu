import type { FrontendSessionBridge } from "@jini-ai/chat/react";

/** Dock-open pre-warm and first send share the authenticated API demand path. */
export async function activateAssistantDaemon(
  { signal }: { signal?: AbortSignal } = {}, { request = fetch }: { request?: typeof fetch } = {},
): Promise<void> {
  const deadline = AbortSignal.timeout(35_000);
  const response = await request("/api/frontend-sessions/activate", {
    method: "POST", credentials: "same-origin", signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  });
  if (!response.ok) throw new Error("the assistant could not start");
}

/** Wake through the authenticated API, then ensure a current page attachment.
 * @returns The current token, or undefined on surfaces with no page bridge.
 * @param options.onActivationSettled - Optional notification on activation success or failure,
 * before waiting for page attachment, so host startup feedback ends at the activation boundary.
 * @throws On activation failure, cancellation or a bridge that does not attach within 5s after ready.
 * @complexity O(1), one activation and one bounded attachment wait.
 */
export async function prepareAssistantPageBinding(
  { bridge, signal }: { bridge?: Pick<FrontendSessionBridge, "rebind" | "bindToken"> | null; signal?: AbortSignal },
  { activate = activateAssistantDaemon, onActivationSettled }: {
    activate?: typeof activateAssistantDaemon;
    onActivationSettled?: () => void;
  } = {},
): Promise<string | undefined> {
  try { await activate({ signal }, {}); }
  finally { onActivationSettled?.(); }
  signal?.throwIfAborted();
  if (!bridge) return undefined;
  const deadline = AbortSignal.timeout(5_000);
  const waitSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  waitSignal.throwIfAborted();
  await bridge.rebind({ signal: waitSignal }, {});
  signal?.throwIfAborted();
  const token = bridge.bindToken();
  if (!token) throw new Error("the assistant page is not attached");
  return token;
}
