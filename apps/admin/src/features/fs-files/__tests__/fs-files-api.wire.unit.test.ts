import { afterEach, expect, it, vi } from "vitest";
import { fsFilesApi } from "../api/fs-files-api";

afterEach(() => vi.unstubAllGlobals());

it("clears the custom root with DELETE and preserves cancel's null path", async () => {
  const fetch = vi.fn(async () => new Response('{"path":null}', { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  expect(await fsFilesApi.clearFsFilesCustomRoot()).toEqual({ path: null });
  expect(fetch).toHaveBeenLastCalledWith("/api/admin/v1/workspaces/workspace-local/fs-files/custom-root", expect.objectContaining({ method: "DELETE" }));
  expect(await fsFilesApi.pickFolder()).toEqual({ path: null });
  expect(fetch).toHaveBeenLastCalledWith("/api/admin/v1/workspaces/workspace-local/fs-files/folder-picker", expect.objectContaining({ method: "POST" }));
});
