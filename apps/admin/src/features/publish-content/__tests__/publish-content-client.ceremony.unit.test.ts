import { afterEach, expect, it, vi } from "vitest";
import { defaultPublishContentPort } from "../hooks/publish-content-dependencies.hooks";

afterEach(() => vi.unstubAllGlobals());

it("the real port preserves absent plan body and the confirmed overwrite set", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init === undefined ? {} : { init }) });
    return Response.json({});
  });
  await defaultPublishContentPort.planPublish({ peerId: "peer/one" });
  await defaultPublishContentPort.executePublish({ peerId: "peer/one", bundleId: "bundle", confirmationToken: "confirmed", overwriteEntityKeys: ["post:p1"] });
  expect(calls[0]?.url).toBe("/api/admin/v1/workspaces/workspace-local/publish-content/peers/peer%2Fone/push/plan");
  expect(calls[0]?.init?.body).toBeUndefined();
  expect(calls[1]?.url).toBe("/api/admin/v1/workspaces/workspace-local/publish-content/peers/peer%2Fone/push/execute");
  expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ bundleId: "bundle", confirmationToken: "confirmed", overwriteEntityKeys: ["post:p1"] });
});
