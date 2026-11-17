/** Releases an events response that will never be read. An unread body stays open, and a run
 * reconnects up to maxReconnects times. Not awaited: a body that never finishes cancelling must
 * not stall the watch. A failed cancel has nothing left to release.
 * @complexity O(1); starts one cancel and returns. */
export function releaseUnreadBody({ response }: { response: Response }, _optional = {}): void {
  void response.body?.cancel().catch(() => undefined);
}
