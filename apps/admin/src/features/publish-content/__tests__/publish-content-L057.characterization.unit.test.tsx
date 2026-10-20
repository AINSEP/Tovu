import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { describe, expect, it } from "vitest";
import type { PublishContentReport } from "@tovu/publish-content-ui";
import { createFakePublishContentPort } from "../hooks/publish-content-dependencies.hooks";
import { usePublishContentConfirm } from "../hooks/use-publish-content-confirm.hooks";

const peers = [
  {
    id: "live",
    label: "Live",
    baseUrl: "https://live.test",
    remoteWorkspaceId: "local",
    masked: null,
    hasCredential: false,
  },
];
const t = (key: string) => key;
const report: PublishContentReport = {
  refused: false,
  refusalReason: null,
  applyOrder: ["page"],
  rows: [
    { entityType: "page", entityId: "a", entityLabel: "A", outcome: "created", writes: true, reason: null },
    { entityType: "page", entityId: "b", entityLabel: "B", outcome: "created", writes: true, reason: null },
    { entityType: "page", entityId: "c", entityLabel: "C", outcome: "unchanged", writes: false, reason: null },
  ],
};

describe("L057 view characterization before extraction", () => {
  it("keeps selection counts, fold state, labels and completion notices consistent through publishing", async () => {
    const port = createFakePublishContentPort({
      peers,
      report,
      executeResult: {
        restorePointId: "restore",
        runId: "run",
        changeSetIds: ["one", "two"],
        menuLinksUpdated: 2,
        menuLinksNotUpdated: ["Menu", "Menu"],
        verificationProblems: ["Poster", "Poster"],
      },
    });
    const { result } = renderHook(() =>
      usePublishContentConfirm({ onCancel: () => {}, t, port, confirmArmDelayMs: 0 })
    );
    await waitFor(() => expect(result.current.selectedPeerId).toBe("live"));
    expect(result.current.primaryKind).toBe("start");
    act(() => result.current.onPrimary());
    await waitFor(() => expect(result.current.primaryLabel).toBe("Publish 2 items"));
    expect(result.current.upToDateLabel).toBe("1 already up to date");
    expect(result.current.listedRows.map((row) => row.entityLabel)).toEqual(["A", "B"]);
    expect(result.current.columnCount).toBe(4);
    expect(result.current.allSelected).toBe(true);
    act(() => {
      result.current.onToggleUpToDate();
      result.current.onToggleRow("page:b");
    });
    expect(result.current.upToDateExpanded).toBe(true);
    expect(result.current.primaryLabel).toBe("Publish 1 item");
    expect(result.current.someSelected).toBe(true);
    act(() => result.current.onToggleAll());
    expect(result.current.primaryLabel).toBe("Nothing to publish");
    expect(result.current.primaryDisabled).toBe(true);
    act(() => result.current.onToggleAll());
    expect(result.current.allSelected).toBe(true);
    act(() => result.current.onPrimary());
    await waitFor(() => expect(result.current.phase.kind).toBe("done"));
    expect(result.current.doneMessage).toBe("Published 2 changes. Menu links updated: 2.");
    expect(result.current.doneNotices).toEqual(["Menu"]);
    expect(result.current.doneProblems).toEqual(["Poster"]);
    expect(result.current.selectionEnabled).toBe(false);
    expect(result.current.primaryLabel).toBe("Published");
    expect(result.current.dismissible).toBe(true);
    expect(port.calls.confirmPublish).toHaveLength(1);
    expect(port.calls.executePublish).toHaveLength(1);
  });

  it("keeps an empty unconnected destination disabled and passes its message through verbatim", async () => {
    const port = createFakePublishContentPort();
    const { result } = renderHook(() => usePublishContentConfirm({ onCancel: () => {}, t, port }));
    await waitFor(() => expect(result.current.connectOffer).not.toBeNull());
    expect(result.current.connectOffer?.message).toBe(
      "No live site is set up yet. Deploy this site once, then come back here."
    );
    expect(result.current.primaryLabel).toBe("Connect");
    expect(result.current.primaryDisabled).toBe(true);
    expect(result.current.rows).toEqual([]);
    expect(result.current.summary).toBeNull();
    expect(port.calls.planPublish).toEqual([]);
  });
});
