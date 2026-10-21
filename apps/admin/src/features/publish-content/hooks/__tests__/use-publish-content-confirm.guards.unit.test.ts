import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";

import type { PublishContentReport } from "@tovu/publish-content-ui";
import { createFakePublishContentPort } from "../publish-content-dependencies.hooks";
import { usePublishContentConfirm } from "../use-publish-content-confirm.hooks";

/**
 * @file The confirm hook's re-entry and selection guards, driven through its public view over the
 * in-memory publish-content port: toggling a row back on, confirming with nothing selected, and
 * dismissing while a run is in flight.
 */

const t = (key: string): string => key;
const peer = { id: "live", label: "Live", baseUrl: "https://live.test", remoteWorkspaceId: "local", masked: null, hasCredential: true };

const TWO_POSTS: PublishContentReport = {
  refused: false,
  refusalReason: null,
  applyOrder: ["post"],
  rows: [
    { entityType: "post", entityId: "post-a", entityLabel: "post-a", outcome: "created", writes: true, reason: null },
    { entityType: "post", entityId: "post-b", entityLabel: "post-b", outcome: "applied", writes: true, reason: null },
  ],
} as PublishContentReport;

async function planned(port = createFakePublishContentPort({ peers: [peer], report: TWO_POSTS }), onCancel = vi.fn()) {
  const hook = renderHook(() => usePublishContentConfirm({ onCancel, t, port, confirmArmDelayMs: 0 }));
  await waitFor(() => expect(hook.result.current.selectedPeerId).toBe("live"));
  act(() => hook.result.current.onPrimary());
  await waitFor(() => expect(hook.result.current.phase.kind).toBe("planned"));
  return { ...hook, port, onCancel };
}

describe("usePublishContentConfirm — selection and re-entry guards", () => {
  it("unticking a row and ticking it again restores it to the selection", async () => {
    const { result } = await planned();
    const key = [...result.current.selectedKeys][0]!;
    act(() => result.current.onToggleRow(key));
    expect(result.current.selectedKeys.has(key)).toBe(false);
    act(() => result.current.onToggleRow(key));
    expect(result.current.selectedKeys.has(key)).toBe(true);
  });

  it("does not confirm a plan with every row unticked", async () => {
    const { result, port } = await planned();
    act(() => result.current.onToggleAll());
    expect(result.current.selectedKeys.size).toBe(0);
    await act(async () => { result.current.onPrimary(); });
    expect(port.calls.confirmPublish).toHaveLength(0);
    expect(result.current.phase.kind).toBe("planned");
  });

  it("ignores a dismiss while the publish is in flight", async () => {
    const base = createFakePublishContentPort({ peers: [peer], report: TWO_POSTS });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const port = { ...base, calls: base.calls, confirmPublish: async (input: Parameters<typeof base.confirmPublish>[0]) => { await gate; return base.confirmPublish(input); } };
    const { result, onCancel } = await planned(port as typeof base);
    act(() => result.current.onPrimary());
    await waitFor(() => expect(result.current.dismissible).toBe(false));
    act(() => result.current.onDismiss());
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => { release(); await gate; });
  });
});
