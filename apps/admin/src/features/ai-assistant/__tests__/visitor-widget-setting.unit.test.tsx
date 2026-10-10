/** wcmp: real query/mutation hook, injected settings port, no module mocks. */
import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { describe, expect, it } from "vitest";
import type { PublicAssistantSettings } from "@/lib/api";
import type { AiAssistantPort } from "../hooks/ai-assistant-port.hooks";
import { useAiAssistant } from "../hooks/use-ai-assistant.hooks";

function fixture() {
  let state: PublicAssistantSettings = { publicEnabled: false, widget: "react" };
  let failure: Error | null = null;
  const writes: Partial<PublicAssistantSettings>[] = [];
  const port: AiAssistantPort = {
    getAssistantSettings: async () => ({ data: { ...state } }),
    setAssistantSettings: async patch => {
      writes.push(patch);
      if (failure) throw failure;
      state = { ...state, ...patch };
      return { data: { ...state } };
    },
  };
  return { port, writes, fail: () => { failure = new Error("Widget choice could not be saved."); } };
}

describe("visitor widget setting", () => {
  it("keeps React by default, saves only the explicit widget choice and retains the master switch", async () => {
    const f = fixture();
    const { result } = renderHook(() => useAiAssistant({ port: f.port }));
    await waitFor(() => expect(result.current.settings?.widget).toBe("react"));
    expect(f.writes).toEqual([]);
    await act(async () => { await result.current.setWidget({ widget: "vanilla" }); });
    await waitFor(() => expect(result.current.settings).toEqual({ publicEnabled: false, widget: "vanilla" }));
    expect(f.writes).toEqual([{ widget: "vanilla" }]);
    await act(async () => { await result.current.setPublicEnabled(true); });
    await waitFor(() => expect(result.current.settings).toEqual({ publicEnabled: true, widget: "vanilla" }));
  });

  it("preserves the persisted choice and reports the real error when saving fails", async () => {
    const f = fixture();
    const { result } = renderHook(() => useAiAssistant({ port: f.port }));
    await waitFor(() => expect(result.current.settings?.widget).toBe("react"));
    f.fail();
    await act(async () => { await result.current.setWidget({ widget: "vanilla" }); });
    await waitFor(() => expect(result.current.saveError).toBe("Widget choice could not be saved."));
    expect(result.current.settings?.widget).toBe("react");
    expect(result.current.saving).toBe(false);
  });
});
