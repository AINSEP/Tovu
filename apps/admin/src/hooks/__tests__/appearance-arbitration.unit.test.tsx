import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../../lib/settings-tabs";
import { useAdminAppearance, useSettingsAppearance } from "../use-admin-appearance.hooks";
import { useAdminAppearanceSnapshot } from "../use-admin-appearance-snapshot.hooks";

it("shares the host draft store while an older shell read is in flight", async () => {
  const root = document.createElement("main");
  const pending: Array<(value: typeof DEFAULT_APPEARANCE) => void> = [];
  const port = {
    loadAppearance: () => new Promise<typeof DEFAULT_APPEARANCE>(done => { pending.push(done); }),
    subscribeToSettingsRefresh: () => () => {},
  };
  const { result, rerender } = renderHook(({ ready }) => {
    useAdminAppearance({}, { port, root });
    useSettingsAppearance({ ready, accentColor: "#e11d48" }, { root });
    return useAdminAppearanceSnapshot({ port }, { root });
  }, { initialProps: { ready: false } });
  await waitFor(() => expect(pending).toHaveLength(1));
  rerender({ ready: true });
  await act(async () => pending[0]?.({ ...DEFAULT_APPEARANCE, accentColor: "#2563eb" }));
  await waitFor(() => expect(result.current.data?.appearance.accentColor).toBe("#2563eb"));
  expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe("#e11d48");
});
