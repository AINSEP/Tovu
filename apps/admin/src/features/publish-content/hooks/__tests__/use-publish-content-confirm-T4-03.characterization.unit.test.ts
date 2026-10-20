import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { describe, expect, it } from "vitest";

import type { AdminPublishDestinationView } from "@/lib/api";
import { createFakePublishContentPort } from "../publish-content-dependencies.hooks";
import { usePublishContentConfirm } from "../use-publish-content-confirm.hooks";

const t = (key: string): string => key;
const peer = {
  id: "live",
  label: "Live",
  baseUrl: "https://live.test",
  remoteWorkspaceId: "local",
  masked: null,
  hasCredential: false,
};
const destination: AdminPublishDestinationView = {
  connected: false,
  site: null,
  candidateUrl: "https://live.test",
  message: "Connect the configured live site.",
  nextStep: null,
};

describe("T4-03 destination offer characterization", () => {
  it("waits for both the empty peer list and destination before offering connection", async () => {
    const fake = createFakePublishContentPort({ destination });
    let resolvePeers!: (value: { peers: readonly typeof peer[] }) => void;
    let resolveDestination!: (value: AdminPublishDestinationView) => void;
    const peerReply = new Promise<{ peers: readonly typeof peer[] }>((resolve) => { resolvePeers = resolve; });
    const destinationReply = new Promise<AdminPublishDestinationView>((resolve) => { resolveDestination = resolve; });
    let destinationReads = 0;
    const port = {
      ...fake,
      listPeers: () => peerReply,
      getDestination: () => { destinationReads += 1; return destinationReply; },
    };
    const { result } = renderHook(() => usePublishContentConfirm({ onCancel: () => {}, t, port }));
    expect(result.current.connectOffer).toBeNull();
    expect(destinationReads).toBe(0);
    await act(async () => { resolvePeers({ peers: [] }); await peerReply; });
    await waitFor(() => expect(destinationReads).toBe(1));
    expect(result.current.connectOffer).toBeNull();
    await act(async () => { resolveDestination(destination); await destinationReply; });
    await waitFor(() => expect(result.current.connectOffer).toEqual({
      message: destination.message,
      candidateUrl: destination.candidateUrl,
    }));
    expect(result.current.primaryLabel).toBe("Connect");
    expect(result.current.primaryDisabled).toBe(false);
    expect(fake.calls.planPublish).toEqual([]);
  });

  it("never discovers or offers a destination when peers exist", async () => {
    const port = createFakePublishContentPort({ peers: [peer], destination });
    const { result } = renderHook(() => usePublishContentConfirm({ onCancel: () => {}, t, port }));
    await waitFor(() => expect(result.current.selectedPeerId).toBe(peer.id));
    expect(result.current.connectOffer).toBeNull();
    expect(port.calls.getDestination).toBe(0);
    expect(result.current.primaryLabel).toBe("Publish all content");
  });

  it("shows a peer-read error without offering connection or discovering a destination", async () => {
    const port = createFakePublishContentPort({ listPeersError: new Error("Peer read failed"), destination });
    const { result } = renderHook(() => usePublishContentConfirm({ onCancel: () => {}, t, port }));
    await waitFor(() => expect(result.current.errorMessage).toBe("Peer read failed"));
    expect(result.current.connectOffer).toBeNull();
    expect(port.calls.getDestination).toBe(0);
  });

  it("shows a destination-read error without offering connection", async () => {
    const port = createFakePublishContentPort({ destinationError: new Error("Destination read failed") });
    const { result } = renderHook(() => usePublishContentConfirm({ onCancel: () => {}, t, port }));
    await waitFor(() => expect(result.current.errorMessage).toBe("Destination read failed"));
    expect(result.current.connectOffer).toBeNull();
    expect(port.calls.getDestination).toBe(1);
  });

  it("preserves the server message and offers a disabled connection when there is no candidate", async () => {
    const port = createFakePublishContentPort({ destination: { ...destination, candidateUrl: null } });
    const { result } = renderHook(() => usePublishContentConfirm({ onCancel: () => {}, t, port }));
    await waitFor(() => expect(result.current.connectOffer).toEqual({ message: destination.message, candidateUrl: null }));
    expect(result.current.primaryLabel).toBe("Connect");
    expect(result.current.primaryDisabled).toBe(true);
    expect(port.calls.planPublish).toEqual([]);
  });
});
