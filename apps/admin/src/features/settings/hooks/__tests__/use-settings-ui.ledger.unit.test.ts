import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, expect, it, vi } from "vitest";
import { SAVE_DEBOUNCE_MS } from "@/hooks/use-settings-slice.hooks";
import { useAdminExecutionMode } from "@/features/ai-assistant/hooks/use-admin-execution-mode.hooks";
import { useSettingsUi } from "../use-settings-ui.hooks";

type Write = { namespace: string; scope: string; key: string; valueJson: unknown };
const endpoint = "/api/admin/v1/workspaces/workspace-local/settings";
function useLedger() {
  const rows = new Map<string, Record<string, unknown>>([
    ["core.execution", { "byok.model": "previous-model" }],
    ["core.instructions", { custom: "Previous instructions" }],
    ["core.language", { locale: "en" }],
  ]);
  const writes: Write[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === `${endpoint}/effective` && init?.method === "GET") {
      const namespace = url.searchParams.get("namespace") ?? "";
      return Response.json({ data: Object.entries(rows.get(namespace) ?? {}).map(([key, value]) => ({ key, value })) });
    }
    if (url.pathname === `${endpoint}/value` && init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Write;
      writes.push(body);
      rows.set(body.namespace, { ...rows.get(body.namespace), [body.key]: body.valueJson });
      return Response.json({ key: body.key, valueJson: body.valueJson });
    }
    return Response.json({ error: "Unexpected settings route" }, { status: 404 });
  });
  return { rows, writes };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([
  ["Settings", useSettingsUi],
  ["Admin AI Assistant", useAdminExecutionMode],
] as const)("%s refreshes the execution model without erasing a typed, unsaved key", async (_screen, useController) => {
  const ledger = useLedger();
  const { result } = renderHook(() => useController().execution);
  await waitFor(() => expect(result.current.value?.byok.model).toBe("previous-model"));
  const previous = result.current.value!;
  vi.useFakeTimers();
  act(() => result.current.onChange({ ...previous, byok: { ...previous.byok, apiKey: "unsaved-draft-key" } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS); });
  ledger.rows.set("core.execution", { "byok.model": "new-server-model" });
  await act(async () => result.current.refresh());
  expect(result.current.value?.byok).toMatchObject({ model: "new-server-model", apiKey: "unsaved-draft-key" });
  expect(ledger.writes).toEqual([]);
});

it("persists the new instructions at workspace scope and language at user scope", async () => {
  const ledger = useLedger();
  const { result } = renderHook(() => useSettingsUi());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.instructions.value).toBe("Previous instructions");
  expect(result.current.language.value).toBe("en");
  vi.useFakeTimers();
  act(() => {
    result.current.instructions.onChange("Use metric units.");
    result.current.language.onChange("fr");
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS); });
  expect(ledger.writes).toEqual(expect.arrayContaining([
    { namespace: "core.instructions", scope: "workspace", key: "custom", valueJson: "Use metric units." },
    { namespace: "core.language", scope: "user", key: "locale", valueJson: "fr" },
  ]));
  expect(ledger.writes).toHaveLength(2);
  expect(result.current.instructions.value).toBe("Use metric units.");
  expect(result.current.language.value).toBe("fr");
  expect(ledger.rows.get("core.instructions")?.custom).toBe("Use metric units.");
  expect(ledger.rows.get("core.language")?.locale).toBe("fr");
});
