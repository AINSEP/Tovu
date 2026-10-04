import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PublishBackstopSection } from "../PublishBackstopSection";
import { usePublishBackstop } from "../hooks/use-publish-backstop.hooks";
import type { PublishBackstopPort, BackstopPlan } from "../hooks/publish-backstop-port.hooks";

const peer = { id: "live", label: "Live", baseUrl: "https://live.example", remoteWorkspaceId: "ws-live" };
const plan: BackstopPlan = {
  logId: "log-1", entities: [], skipped: [{ entityType: "raw-file", id: "config.json", reason: "Private file" }],
  plan: { planId: "plan-1", planHash: "hash-1", details: { refused: false, refusalReason: null,
    rows: [{ entityType: "raw-row", entityId: "p_banner:{\"id\":\"one\"}", outcome: "applied", writes: true, reason: null }] },
    backstopPreview: [{ entityType: "raw-row", entityId: "p_banner:{\"id\":\"one\"}", before: { title: "Old footer" }, after: { title: "New footer" }, unavailableReason: null }] },
};
function fake({ allowed = true, ready = true } = {}): PublishBackstopPort {
  return {
    status: vi.fn(async () => ({ allowed, installed: ready })),
    listPeers: vi.fn(async () => ({ peers: [peer] })),
    gaps: vi.fn(async () => ({ gaps: [{ label: "table:p_banner", count: 4, lastReason: "Footer missing a publish type", lastAt: "2026-10-04" }] })),
    plan: vi.fn(async () => plan),
    send: vi.fn(async () => ({ runId: "run-1", logId: "log-1", destination: peer.baseUrl, details: { rows: [] } })),
    run: vi.fn(async () => ({ runId: "run-1", reason: "Footer emergency", items: [{ entityType: "raw-row", id: "p_banner:one" }], canUndo: true })),
    undo: vi.fn(async () => ({ runId: "run-1", undone: 1, skipped: ["Banner changed on live; left alone."] })),
  };
}
const t = (key: string) => key;
async function selected(result: { current: ReturnType<typeof usePublishBackstop> }, { choosePeer = true } = {}) {
  await waitFor(() => expect(result.current.allowed).toBe(true));
  await act(async () => { await result.current.open(); });
  act(() => {
    if (choosePeer) result.current.selectPeer(peer.id);
    result.current.setRowTable("p_banner");
    result.current.setRowPk('{"id":"one"}');
    result.current.setReason("Footer missing a publish type");
  });
  act(() => result.current.addRow());
}

describe("manual publishing ceremony", () => {
  it("hides the section for editors/custom admins without reading peers or gaps", async () => {
    const port = fake({ allowed: false });
    render(<PublishBackstopSection port={port} t={t} />);
    await waitFor(() => expect(port.status).toHaveBeenCalled());
    expect(screen.queryByText("Advanced: send by hand")).toBeNull();
    expect(port.listPeers).not.toHaveBeenCalled();
    expect(port.gaps).not.toHaveBeenCalled();
  });
  it("shows missing schema and does not offer a send", async () => {
    render(<PublishBackstopSection port={fake({ ready: false })} t={t} />);
    await waitFor(() => expect(screen.getByText("Advanced: send by hand")).toBeTruthy());
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Send by hand needs audit storage installed on both sites.");
    expect(notice).toHaveClass("notice", "warning");
    expect(screen.queryByRole("button", { name: "Send to live" })).toBeNull();
  });
  it("requires an explicit destination choice even when only one live site is connected", async () => {
    const port = fake();
    const { result } = renderHook(() => usePublishBackstop({ port, t }));
    await selected(result, { choosePeer: false });
    const { rerender } = render(<PublishBackstopSection port={port} t={t} useBackstopHook={() => result.current} />);
    expect(screen.getByRole("combobox", { name: "Publish to" })).toHaveValue("");
    expect(screen.getByRole("option", { name: "Choose a site…" })).toHaveProperty("selected", true);
    expect(result.current.peerId).toBe("");
    expect(result.current.host).toBe("");
    expect(result.current.canCheck).toBe(false);
    await act(async () => { await result.current.check(); });
    expect(port.plan).not.toHaveBeenCalled();
    act(() => result.current.selectPeer(peer.id));
    rerender(<PublishBackstopSection port={port} t={t} useBackstopHook={() => result.current} />);
    expect(screen.getByRole("combobox", { name: "Publish to" })).toHaveValue("live");
    expect(result.current.canCheck).toBe(true);
    await act(async () => { await result.current.check(); });
    expect(port.plan).toHaveBeenCalledWith(expect.objectContaining({ peerId: "live" }));
  });
  it("checks selected addresses without filling the human confirmation, then sends the saved plan", async () => {
    const port = fake();
    const { result } = renderHook(() => usePublishBackstop({ port, t }));
    await selected(result);
    await act(async () => { await result.current.check(); });
    expect(port.plan).toHaveBeenCalledWith({ peerId: "live", reason: "Footer missing a publish type", rows: [{ table: "p_banner", pk: { id: "one" } }], files: [] });
    expect(result.current.typedHost).toBe("");
    await act(async () => { await result.current.send(); });
    expect(port.send).not.toHaveBeenCalled();
    act(() => result.current.setTypedHost("wrong.example"));
    await act(async () => { await result.current.send(); });
    expect(port.send).not.toHaveBeenCalled();
    act(() => result.current.setTypedHost("live.example"));
    await act(async () => { await result.current.send(); });
    expect(port.send).toHaveBeenCalledWith({ peerId: "live", reason: "Footer missing a publish type", rows: [{ table: "p_banner", pk: { id: "one" } }], files: [], typedHost: "live.example", logId: "log-1" });
    expect(result.current.undoHref).toContain("https://live.example/admin/?backstopRun=run-1");
  });
  it("invalidates a plan and its typed address when the reason or selection changes", async () => {
    const port = fake(); const { result } = renderHook(() => usePublishBackstop({ port, t }));
    await selected(result);
    await act(async () => { await result.current.check(); });
    act(() => { result.current.setTypedHost("live.example"); result.current.setReason("Different emergency reason"); });
    expect(result.current.plan).toBeNull(); expect(result.current.typedHost).toBe("");
    await act(async () => { await result.current.send(); });
    expect(port.send).not.toHaveBeenCalled();
  });
  it("fails closed when an older live cannot provide before/after values", async () => {
    const port = fake(); port.plan = vi.fn(async () => ({ ...plan, plan: { ...plan.plan!, backstopPreview: undefined } }));
    const { result } = renderHook(() => usePublishBackstop({ port, t })); await selected(result);
    await act(async () => { await result.current.check(); });
    act(() => result.current.setTypedHost("live.example"));
    await act(async () => { await result.current.send(); });
    expect(port.send).not.toHaveBeenCalled(); expect(result.current.valuesReviewed).toBe(false);
  });
  it("an overwrite choice rechecks live and the send uses only that newly saved plan", async () => {
    const port = fake();
    const key = `raw-row:${plan.plan!.details.rows[0].entityId}`;
    port.plan = vi.fn(async (input) => ({ ...plan, logId: input.overwriteEntityKeys?.length ? "log-forced" : "log-conflict", plan: { ...plan.plan!, details: { ...plan.plan!.details,
      rows: [{ ...plan.plan!.details.rows[0], outcome: input.overwriteEntityKeys?.length ? "forced" : "conflict", writes: !!input.overwriteEntityKeys?.length, canOverwrite: !input.overwriteEntityKeys?.length, reason: "Edited on live" }] } } }));
    const { result } = renderHook(() => usePublishBackstop({ port, t })); await selected(result);
    await act(async () => { await result.current.check(); });
    act(() => result.current.setTypedHost("live.example"));
    expect(result.current.canSend).toBe(false);
    await act(async () => { await result.current.toggleOverwrite(key); });
    expect(result.current.typedHost).toBe(""); expect(port.plan).toHaveBeenLastCalledWith(expect.objectContaining({ overwriteEntityKeys: [key] }));
    act(() => result.current.setTypedHost("live.example"));
    await act(async () => { await result.current.send(); });
    expect(port.send).toHaveBeenCalledWith(expect.objectContaining({ logId: "log-forced", overwriteEntityKeys: [key] }));
  });
  it("drops a failed send's plan so a consumed confirmation is never retried", async () => {
    const port = fake(); port.send = vi.fn(async () => { throw new Error("Connection dropped"); });
    const { result } = renderHook(() => usePublishBackstop({ port, t })); await selected(result);
    await act(async () => { await result.current.check(); });
    act(() => result.current.setTypedHost("live.example"));
    await act(async () => { await result.current.send(); });
    expect(result.current.plan).toBeNull(); expect(result.current.typedHost).toBe("");
    await act(async () => { await result.current.send(); });
    expect(port.send).toHaveBeenCalledTimes(1); expect(result.current.error).toBe("Connection dropped");
  });
  it("discards a late plan after selecting another destination", async () => {
    let resolve!: (value: BackstopPlan) => void;
    const port = fake(); port.plan = vi.fn(() => new Promise<BackstopPlan>((done) => { resolve = done; }));
    const { result } = renderHook(() => usePublishBackstop({ port, t })); await selected(result);
    let checking!: Promise<void>;
    act(() => { checking = result.current.check(); });
    act(() => result.current.selectPeer("other"));
    await act(async () => { resolve(plan); await checking; });
    expect(result.current.plan).toBeNull(); expect(result.current.canSend).toBe(false);
  });
  it("renders live/local values, skipped reasons and gaps, with no agent confirmation handle", async () => {
    const port = fake();
    const { result } = renderHook(() => usePublishBackstop({ port, t })); await selected(result);
    await act(async () => { await result.current.check(); });
    render(<PublishBackstopSection port={port} t={t} useBackstopHook={() => result.current} />);
    expect(screen.getByText(/Old footer/)).toBeTruthy(); expect(screen.getByText(/New footer/)).toBeTruthy();
    expect(screen.getByText("Private file")).toBeTruthy(); expect(screen.getByText("table:p_banner")).toBeTruthy();
    const confirm = screen.getByLabelText("Type the live address");
    expect(confirm.getAttribute("data-agent-handle")).toBeNull();
    expect(confirm.getAttribute("data-webmcp-action")).toBeNull();
  });
  it("offers one-click Undo on the destination and reports OCC skips", async () => {
    const port = fake();
    const { result } = renderHook(() => usePublishBackstop({ port, t, runId: "run-1", canPublish: false }));
    await waitFor(() => expect(result.current.run?.canUndo).toBe(true));
    await act(async () => { await result.current.undo(); });
    expect(port.undo).toHaveBeenCalledExactlyOnceWith({ runId: "run-1" });
    expect(result.current.undoResult?.skipped).toEqual(["Banner changed on live; left alone."]);
    expect(result.current.canUndo).toBe(false);
  });
  it("does not permit malformed keys, duplicate addresses or unsafe integer primary keys", async () => {
    const { result } = renderHook(() => usePublishBackstop({ port: fake(), t })); await selected(result);
    act(() => result.current.addRow()); expect(result.current.rows).toHaveLength(1);
    act(() => result.current.setRowPk('{"id":9007199254740993}'));
    act(() => result.current.addRow()); expect(result.current.rows).toHaveLength(1);
    expect(result.current.error).toBeTruthy();
  });
});
