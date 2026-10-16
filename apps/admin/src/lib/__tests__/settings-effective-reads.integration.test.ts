import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "../api";
import { loadExecutionConfig } from "../execution-settings";
import { loadInterface, loadLanguage } from "../settings-tabs";
import { defaultAdminLocalePort } from "../../hooks/admin-locale-dependencies.hooks";
import { publishSettingsRefresh, resetSettingsRefreshBus, subscribeToSettingsRefresh } from "../settings-refresh-bus";

/** Real loaders → real settings API → stubbed fetch, matching the request-volume measurement.
 * Deferred responses keep reads concurrent without timers or mocking the behavior under test. */
function stubSettingsFetch() {
  const calls: Array<{
    namespace: string;
    principalId: string | null;
    method: string;
    respond: (values: Record<string, unknown>, status?: number) => void;
  }> = [];
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    if (!url.pathname.endsWith("/settings/effective")) throw new Error(`Unexpected request: ${url}`);
    return new Promise<Response>((resolve) => {
      calls.push({
        namespace: url.searchParams.get("namespace")!,
        principalId: url.searchParams.get("principalId"),
        method: init?.method ?? "GET",
        respond: (values, status = 200) => resolve(new Response(JSON.stringify(status === 200 ? {
          data: Object.entries(values).map(([key, value]) => ({ key, value, sourceLayer: "user", defVersion: 1 })),
        } : { error: "settings unavailable" }), { status, headers: { "content-type": "application/json" } })),
      });
    });
  }));
  return calls;
}

afterEach(() => {
  resetSettingsRefreshBus();
  vi.unstubAllGlobals();
});

describe("effective settings reads at the real API seam", () => {
  it("shares one GET per namespace across concurrent loaders, then reads fresh after settlement", async () => {
    const calls = stubSettingsFetch();
    const interfaces = Array.from({ length: 5 }, () => loadInterface());
    const executions = Array.from({ length: 3 }, () => loadExecutionConfig());
    for (const call of calls) call.respond(call.namespace === "core.interface" ? { wrapTabs: true } : { mode: "byok" });

    expect(await Promise.all(interfaces)).toEqual(Array(5).fill({ hideChatFabWhileOpen: true, wrapTabs: true }));
    expect((await Promise.all(executions)).map((config) => config.mode)).toEqual(Array(3).fill("byok"));
    expect(calls.map(({ namespace, method }) => [namespace, method])).toEqual([
      ["core.interface", "GET"], ["core.execution", "GET"],
    ]);

    const nextInterface = loadInterface();
    const nextExecution = loadExecutionConfig();
    for (const call of calls.slice(2)) call.respond(call.namespace === "core.interface" ? { wrapTabs: false } : { mode: "local-cli" });
    await expect(nextInterface).resolves.toEqual({ hideChatFabWhileOpen: true, wrapTabs: false });
    expect((await nextExecution).mode).toBe("local-cli");
    expect(calls.filter((call) => call.namespace === "core.interface")).toHaveLength(2);
    expect(calls.filter((call) => call.namespace === "core.execution")).toHaveLength(2);
  });

  it("keeps principal-specific effective values separate", async () => {
    const calls = stubSettingsFetch();
    const reads = [
      api.getSettingsEffective({ namespace: "core.interface" }),
      api.getSettingsEffective({ namespace: "core.interface" }, { principalId: "alice" }),
      api.getSettingsEffective({ namespace: "core.interface" }, { principalId: "bob" }),
      api.getSettingsEffective({ namespace: "core.interface" }, { principalId: "alice" }),
    ];
    for (const call of calls) call.respond({ subject: call.principalId ?? "workspace" });
    const results = await Promise.all(reads);
    expect(results.map(({ data }) => data[0].value)).toEqual(["workspace", "alice", "bob", "alice"]);
    expect(calls.map((call) => call.principalId)).toEqual([null, "alice", "bob"]);
  });

  it("shares a rejection without retaining it for the next read", async () => {
    const calls = stubSettingsFetch();
    const reads = [loadInterface(), loadInterface()];
    const outcomes = Promise.allSettled(reads);
    for (const call of calls) call.respond({}, 500);
    for (const outcome of await outcomes) {
      expect(outcome.status).toBe("rejected");
      if (outcome.status === "rejected") expect(outcome.reason).toBeInstanceOf(ApiError);
    }
    expect(calls).toHaveLength(1);
    const retry = loadInterface();
    calls[1].respond({ wrapTabs: true });
    await expect(retry).resolves.toMatchObject({ wrapTabs: true });
    expect(calls).toHaveLength(2);
  });

  it.each([{ scope: undefined }, { scope: [] }, { scope: ["core.interface"] }])("drops affected reads before refresh fan-out ($scope) and protects the replacement", async ({ scope }) => {
    const calls = stubSettingsFetch();
    const oldInterface = loadInterface();
    const oldExecution = loadExecutionConfig();
    const refreshed: ReturnType<typeof loadInterface>[] = [];
    subscribeToSettingsRefresh(() => { refreshed.push(loadInterface()); });
    subscribeToSettingsRefresh(() => { refreshed.push(loadInterface()); });

    publishSettingsRefresh(scope);
    const execution = loadExecutionConfig();
    // Settle only the original reads first: their cleanup must not evict a newer request.
    calls[0].respond({ wrapTabs: false });
    calls[1].respond({ mode: "local-cli" });
    await Promise.all([oldInterface, oldExecution]);
    const joined = loadInterface();
    for (const call of calls.slice(2)) call.respond(call.namespace === "core.interface" ? { wrapTabs: true } : { mode: "byok" });
    await expect(Promise.all([...refreshed, joined])).resolves.toEqual(Array(3).fill({ hideChatFabWhileOpen: true, wrapTabs: true }));
    expect((await execution).mode).toBe(scope?.length ? "local-cli" : "byok");
    expect(calls.filter((call) => call.namespace === "core.interface")).toHaveLength(2);
    expect(calls.filter((call) => call.namespace === "core.execution")).toHaveLength(scope?.length ? 1 : 2);
  });

  it("shares one replacement GET across unscoped refreshes in the same synchronous turn", async () => {
    const calls = stubSettingsFetch();
    const oldInterface = loadInterface();
    const refreshed: ReturnType<typeof loadInterface>[] = [];
    subscribeToSettingsRefresh(() => { refreshed.push(loadInterface()); });

    publishSettingsRefresh();
    // A second publish must preserve the replacement read the first publish's listener started.
    publishSettingsRefresh();
    calls[0].respond({ wrapTabs: false });
    for (const call of calls.slice(1)) call.respond({ wrapTabs: true });

    await expect(oldInterface).resolves.toEqual({ hideChatFabWhileOpen: true, wrapTabs: false });
    await expect(Promise.all(refreshed)).resolves.toEqual(Array(2).fill({ hideChatFabWhileOpen: true, wrapTabs: true }));
    expect(calls.map(({ namespace, method }) => [namespace, method])).toEqual([
      ["core.interface", "GET"], ["core.interface", "GET"],
    ]);
  });

  it("shares language with direct loaders and preserves refresh-drop behavior", async () => {
    const calls = stubSettingsFetch();
    const oldReads = [loadLanguage(), defaultAdminLocalePort.loadLanguage()];
    const refreshed: Promise<string>[] = [];
    const unsubscribes = [1, 2, 3].map(() => defaultAdminLocalePort.subscribeToSettingsRefresh(() => {
      refreshed.push(defaultAdminLocalePort.loadLanguage());
    }));
    publishSettingsRefresh(["core.language"]);
    // Preserve the locale port's existing once-per-dispatch-turn drop, even for repeated notices.
    publishSettingsRefresh(["core.language"]);
    calls[0].respond({ locale: "en" });
    for (const call of calls.slice(1)) call.respond({ locale: "fr" });
    await expect(Promise.all(oldReads)).resolves.toEqual(["en", "en"]);
    await expect(Promise.all(refreshed)).resolves.toEqual(Array(6).fill("fr"));
    expect(calls).toHaveLength(2);

    const beforeNextRefresh = loadLanguage();
    publishSettingsRefresh(["core.language"]);
    calls[2].respond({ locale: "fr" });
    for (const call of calls.slice(3)) call.respond({ locale: "de" });
    await expect(beforeNextRefresh).resolves.toBe("fr");
    await expect(Promise.all(refreshed.slice(6))).resolves.toEqual(["de", "de", "de"]);
    expect(calls).toHaveLength(4);
    for (const unsubscribe of unsubscribes) unsubscribe();
  });
});
