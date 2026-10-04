import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultPublishBackstopPort } from "../hooks/publish-backstop-dependencies.hooks";

afterEach(() => vi.unstubAllGlobals());
describe("manual publish HTTP adapter", () => {
  it("plans saved addresses, leaves typedHost absent, and sends a saved log on the same session route", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ logId: "log-1", entities: [], skipped: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const selected = { peerId: "saved-peer", reason: "Footer emergency", rows: [{ table: "p_banner", pk: { id: "one" } }], files: ["extras/banner.html"] };
    await defaultPublishBackstopPort.plan(selected);
    expect(fetch.mock.calls[0][0]).toContain("/workspaces/workspace-local/publish-content/backstop");
    const checkInit = fetch.mock.calls[0][1] as RequestInit;
    expect(checkInit.credentials).toBe("same-origin");
    expect(JSON.parse(checkInit.body as string)).toEqual({ ...selected, action: "plan" });
    await defaultPublishBackstopPort.send({ ...selected, typedHost: "live.example", logId: "log-1" });
    const sendInit = fetch.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(sendInit.body as string)).toEqual({ ...selected, typedHost: "live.example", logId: "log-1", action: "send" });
  });
  it("uses the destination session's own Undo route and hides old/forbidden servers", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ runId: "run-1", undone: 1, skipped: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await defaultPublishBackstopPort.undo({ runId: "run/1" });
    expect(fetch.mock.calls[0][0]).toContain("/runs/run%2F1/undo-backstop");
    fetch.mockImplementation(async () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }));
    expect(await defaultPublishBackstopPort.status()).toEqual({ allowed: false, installed: false });
  });
});
