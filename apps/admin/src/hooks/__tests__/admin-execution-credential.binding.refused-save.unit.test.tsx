import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, expect, it, vi } from "vitest";
import { resetSettingsRefreshBus } from "@jini-ai/admin/shell/lib/settings-refresh-bus";
import { useWiredAdminExecutionCredential } from "../use-admin-execution-credential.hooks";

afterEach(() => {
  window.localStorage.clear();
  resetSettingsRefreshBus();
  vi.unstubAllGlobals();
});

it("keeps the legacy key and typed draft when the live credential save is refused", async () => {
  const legacy = JSON.stringify({ apiKey: "sk-LEGACY-SENTINEL" });
  window.localStorage.setItem("tovu:execution-credentials:v1", legacy);
  const onByokChange = vi.fn();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/settings/effective?namespace=core.language")) return Response.json({ data: [] });
    expect(String(input)).toMatch(/\/assistant\/execution-credential$/);
    if (init?.method === "PUT") {
      return Response.json({ error: "Permission denied", code: "FORBIDDEN" }, { status: 403 });
    }
    return Response.json({ data: { isSet: false, masked: null, protocol: "anthropic", providerId: null, baseUrl: null, model: null, maxTokens: null, updatedAt: null } });
  });
  vi.stubGlobal("fetch", fetchMock);
  const { result, unmount } = renderHook(() => useWiredAdminExecutionCredential({
    byok: { protocol: "anthropic", providerId: "anthropic", apiKey: "sk-TYPED-SENTINEL", baseUrl: "https://api.anthropic.com", model: "" },
    onByokChange,
  }, {}));
  await waitFor(() => expect(result.current.legacyKey).toBe("sk-LEGACY-SENTINEL"));

  await act(async () => { await result.current.migrateLegacyKey(); });

  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT").map(([, init]) => JSON.parse(String(init?.body)))).toEqual([{
    apiKey: "sk-LEGACY-SENTINEL", protocol: "anthropic", providerId: "anthropic", baseUrl: "https://api.anthropic.com", model: "",
  }]);
  expect(result.current.saveState.status).toBe("error");
  expect(result.current.legacyKey).toBe("sk-LEGACY-SENTINEL");
  expect(window.localStorage.getItem("tovu:execution-credentials:v1")).toBe(legacy);
  expect(onByokChange).not.toHaveBeenCalled();
  unmount();
});
