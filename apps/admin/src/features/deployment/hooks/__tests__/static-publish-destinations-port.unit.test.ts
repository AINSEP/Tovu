import { describe, expect, it, vi } from "vitest";

import type { AdminPublishDestination } from "@/features/deployment/api/deployment-api.types";

/**
 * @file A340 — the publish port's history read. `defaultStaticPublishPort.listPublishDestinations`
 * must hand back the API's rows untouched (the form decides what to seed from them), and the fake
 * port must default to an empty history so a test that ignores past publishes sees a blank form.
 * Same thin-bind shape as `static-publish-dependencies.unit.test.ts`.
 */

const { listPublishDestinations } = vi.hoisted(() => ({ listPublishDestinations: vi.fn() }));

vi.mock("../../api/deployment-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/deployment-api")>();
  return { ...actual, deploymentApi: { ...actual.deploymentApi, listPublishDestinations } };
});

const { createFakeStaticPublishPort, defaultStaticPublishPort } = await import("../static-publish-dependencies.hooks");

const DESTINATION: AdminPublishDestination = {
  id: "static:vercel:acme",
  kind: "static",
  lastPublishedAt: "2026-11-01T00:00:00.000Z",
  label: "Vercel: acme",
  url: "https://acme.vercel.app",
  target: "vercel",
  projectName: "acme",
  configFields: {},
};

describe("static publish port — publish history", () => {
  it("defaultStaticPublishPort.listPublishDestinations delegates to api.listPublishDestinations unchanged", async () => {
    listPublishDestinations.mockResolvedValue([DESTINATION]);
    await expect(defaultStaticPublishPort.listPublishDestinations()).resolves.toEqual([DESTINATION]);
    expect(listPublishDestinations).toHaveBeenCalledWith();
  });

  it("createFakeStaticPublishPort lists no history unless a test supplies one", async () => {
    await expect(createFakeStaticPublishPort().listPublishDestinations()).resolves.toEqual([]);
    const supplied = createFakeStaticPublishPort({ listPublishDestinations: () => Promise.resolve([DESTINATION]) });
    await expect(supplied.listPublishDestinations()).resolves.toEqual([DESTINATION]);
  });
});
