import { afterEach, expect, it, vi } from "vitest";
import { deploymentApi } from "../deployment-host-ports";
import type { PublishDestination } from "@jini-ai/devops/deploy/site/static-publish/publish-history";

afterEach(() => vi.unstubAllGlobals());

it("keeps all destination discriminants, linked peer and omitted credential through the live client", async () => {
  const fixture = [
    { id: "tovu-peer:saved", kind: "tovu-peer", peerId: "saved", label: "Live", url: "https://live.test", lastPublishedAt: "2026-10-18T03:00:00Z" },
    { id: "deploy:vercel:site", kind: "deploy", target: "vercel", label: "site", url: "https://live.test/", status: "confirmed", lastPublishedAt: "2026-10-18T02:00:00Z", linkedPeerId: "saved" },
    { id: "static:vercel:site", kind: "static", target: "vercel", projectName: "site", label: "Vercel: site", url: "https://static.test", lastPublishedAt: "2026-10-18T01:00:00Z", configFields: {} },
  ] satisfies PublishDestination[];
  const fetch = vi.fn(async () => new Response(JSON.stringify(fixture), { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  const result = await deploymentApi.listPublishDestinations();
  expect(result.map(row => row.kind)).toEqual(["tovu-peer", "deploy", "static"]);
  expect(result.find(row => row.kind === "deploy")).toMatchObject({ linkedPeerId: "saved" });
  expect(result.find(row => row.kind === "static")).not.toHaveProperty("credentialId");
  expect(result).toEqual(fixture);
  expect(fetch.mock.calls).toHaveLength(1);
});
