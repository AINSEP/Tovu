import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, expect, it, vi } from "vitest";
import { useComposerCapabilities } from "../../../components/AssistantDock/hooks/composer-discovery.hooks";
import { SKILLS_CHANGED_EVENT } from "../../skills/api";

afterEach(() => vi.unstubAllGlobals());

it("keeps the real installed source's forced snapshot when an older refresh finishes last", async () => {
  let release: (response: Response) => void = () => {};
  const fetch = vi.fn()
    .mockImplementationOnce(() => new Promise<Response>(done => { release = done; }))
    .mockResolvedValueOnce(Response.json({ skills: [{ toolId: "new", name: "New", description: "Current" }] }))
    .mockResolvedValueOnce(new Response(null, { status: 304 }));
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(() => useComposerCapabilities());
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  act(() => window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT)));
  await waitFor(() => expect(result.current.composerCapabilities.byItemId.has("installed-skill:new")).toBe(true));
  await act(async () => { release(Response.json({ skills: [] })); });
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(result.current.composerCapabilities.byItemId.has("installed-skill:new")).toBe(true);
});
