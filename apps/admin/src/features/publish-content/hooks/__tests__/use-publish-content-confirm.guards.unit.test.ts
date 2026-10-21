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

describe("usePublishContentConfirm — results that land after the dialog closed", () => {
  function gatedPort(step: "confirmPublish" | "executePublish", outcome: "resolve" | "reject") {
    const base = createFakePublishContentPort({ peers: [peer], report: TWO_POSTS });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const calls = { execute: 0 };
    const original = base[step].bind(base) as (input: never) => Promise<unknown>;
    const gated = async (input: never) => {
      if (step === "executePublish") calls.execute += 1;
      await gate;
      if (outcome === "reject") throw new Error(`${step} failed late`);
      return original(input);
    };
    const port = { ...base, calls: base.calls, [step]: gated, ...(step === "confirmPublish" ? { executePublish: async (input: never) => { calls.execute += 1; return (base.executePublish as (i: never) => Promise<unknown>)(input); } } : {}) };
    return { port: port as unknown as typeof base, release: async () => { release(); await gate; }, calls };
  }

  it.each(["resolve", "reject"] as const)("a confirm that settles (%s) after unmount starts no publish", async (outcome) => {
    const { port, release, calls } = gatedPort("confirmPublish", outcome);
    const { result, unmount } = await planned(port);
    act(() => result.current.onPrimary());
    await waitFor(() => expect(result.current.dismissible).toBe(false));
    unmount();
    await act(release);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls.execute).toBe(0);
  });

  it.each(["resolve", "reject"] as const)("a publish that settles (%s) after unmount is dropped without error", async (outcome) => {
    const { port, release, calls } = gatedPort("executePublish", outcome);
    const { result, unmount } = await planned(port);
    act(() => result.current.onPrimary());
    await waitFor(() => expect(calls.execute).toBe(1));
    const phaseAtUnmount = result.current.phase.kind;
    unmount();
    await act(release);
    expect(phaseAtUnmount).toBe("executing");
    expect(result.current.phase.kind).toBe("executing");
  });
});


describe("usePublishContentConfirm — primary action after the plan stops being confirmable", () => {
  it("confirms nothing for a refused plan", async () => {
    const refused = { ...TWO_POSTS, refused: true, refusalReason: "Content versions differ." } as PublishContentReport;
    const { result, port } = await planned(createFakePublishContentPort({ peers: [peer], report: refused }));
    await act(async () => { result.current.onPrimary(); });
    expect(port.calls.confirmPublish).toHaveLength(0);
    expect(result.current.phase.kind).toBe("planned");
  });

  it("starts nothing more once the publish is done", async () => {
    const { result, port } = await planned();
    act(() => result.current.onPrimary());
    await waitFor(() => expect(result.current.phase.kind).toBe("done"));
    const before = { plan: port.calls.planPublish.length, confirm: port.calls.confirmPublish.length };
    await act(async () => { result.current.onPrimary(); });
    expect(port.calls.planPublish).toHaveLength(before.plan);
    expect(port.calls.confirmPublish).toHaveLength(before.confirm);
    expect(result.current.phase.kind).toBe("done");
  });
});

describe("usePublishContentConfirm — overwrite toggles and criteria results", () => {
  const WITH_CONFLICT: PublishContentReport = {
    refused: false,
    refusalReason: null,
    applyOrder: ["post"],
    rows: [
      { entityType: "post", entityId: "post-a", entityLabel: "post-a", outcome: "created", writes: true, reason: null },
      { entityType: "post", entityId: "post-edited", entityLabel: "post-edited", outcome: "conflict", writes: false, reason: null, canOverwrite: true },
    ],
  } as PublishContentReport;

  it("Overwrite all ticks every offered row, and a second press clears them again", async () => {
    const { result } = await planned(createFakePublishContentPort({ peers: [peer], report: WITH_CONFLICT }));
    expect(result.current.overwriteOfferKeys.size).toBeGreaterThan(0);
    act(() => result.current.onToggleAllOverwrite());
    await waitFor(() => expect(result.current.allOverwriteTicked).toBe(true));
    act(() => result.current.onToggleAllOverwrite());
    await waitFor(() => expect(result.current.overwriteKeys.size).toBe(0));
  });

  it("reports a criteria plan's left-alone row that came back with no reason", async () => {
    const onPlanned = vi.fn();
    const port = createFakePublishContentPort({ peers: [peer], report: WITH_CONFLICT });
    renderHook(() => usePublishContentConfirm({ onCancel: () => {}, t, port, criteria: {}, onPlanned }));
    await waitFor(() => expect(onPlanned).toHaveBeenCalledTimes(1));
    const result = onPlanned.mock.calls[0]![0] as { leftAlone?: { label: string; reason: string }[] };
    expect(JSON.stringify(result)).toMatch(/"label":"post-edited","reason":"[^"]+"/);
  });
});
