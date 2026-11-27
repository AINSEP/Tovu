import { usePublishContentConfirm as useHostPublishConfirm } from "../hooks/use-publish-content-confirm.hooks";
import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";
import type { PublishContentReport } from "@jini-ai/cms/publish/content/ui";
import { createFakePublishContentPort, defaultPublishContentPort } from "../hooks/publish-content-dependencies.hooks";
import { bindPublishContentConfirm } from "@jini-ai/cms/react/publish-content/hooks/use-publish-content-confirm.hooks";
import { applyPublishCriteria, preparePublishConfirmation, toPublishReportRows, publishEntityTypePluralLabel, publishSectionForEntityTypes } from "@tovu/publish-content-ui";
import { publishScopeDescriptionKey, publishScopeTitleKey } from "@jini-ai/admin/publish-content/screen/publish-scope";
import { describeApiError } from "@/lib/admin-http/request";
import { useWiredAdminLocale } from "@/hooks/use-admin-locale.hooks";

const usePublishContentConfirm = bindPublishContentConfirm({
  port: defaultPublishContentPort,
  hooks: { useLocaleHook: useWiredAdminLocale },
  deps: {
    applyPublishCriteria, preparePublishConfirmation, toPublishReportRows, publishEntityTypePluralLabel,
    publishSectionForEntityTypes, publishScopeDescriptionKey, publishScopeTitleKey, describeApiError,
    now: () => performance.now(),
    overwriteUnavailableKey: "is on an older Tovu and can't overwrite these yet. Update it, then publish again.",
  },
});

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
      result.current.onToggleRow({ key: "page:b" });
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

it("arms production publish confirmation only after the monotonic delay", async () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(1000);
  try {
    const port = createFakePublishContentPort({
      peers, report,
      executeResult: { restorePointId: "restore", runId: "run", changeSetIds: ["change"] },
    });
    const { result } = renderHook(() => useHostPublishConfirm({ onCancel: () => {}, t, port, confirmArmDelayMs: 250 }));
    await waitFor(() => expect(result.current.selectedPeerId).toBe("live"));
    act(() => result.current.onPrimary());
    await waitFor(() => expect(result.current.primaryKind).toBe("confirm"));
    clock.mockReturnValue(1249);
    await act(async () => result.current.onPrimary());
    expect(port.calls.confirmPublish).toEqual([]);
    expect(result.current.primaryKind).toBe("confirm");
    clock.mockReturnValue(1250);
    act(() => result.current.onPrimary());
    await waitFor(() => expect(result.current.phase.kind).toBe("done"));
    expect(port.calls.confirmPublish).toHaveLength(1);
    expect(port.calls.executePublish).toHaveLength(1);
  } finally {
    clock.mockRestore();
  }
});
