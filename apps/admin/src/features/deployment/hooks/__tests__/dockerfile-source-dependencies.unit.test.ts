import { describe, expect, it, vi } from "vitest";

/**
 * @file Coverage for `dockerfile-source-dependencies.hooks.ts`'s `defaultDockerfileSourcePort` —
 * its two live `api.*` binds were never invoked by any existing suite: `use-dockerfile-source
 * .unit.test.tsx` only ever constructs `createFakeDockerfileSourcePort`, never renders the
 * `useWiredDockerfileSource()` entry point that wires the default port in. Same thin-bind shape as
 * `publish-credentials-dependencies.unit.test.ts`.
 */

const { getDockerfileSource, setDockerfileSource } = vi.hoisted(() => ({
  getDockerfileSource: vi.fn(),
  setDockerfileSource: vi.fn(),
}));

vi.mock("../../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, getDockerfileSource, setDockerfileSource },
  };
});

const { defaultDockerfileSourcePort } = await import("../dockerfile-source-dependencies.hooks");

describe("defaultDockerfileSourcePort", () => {
  it("getDockerfileSource delegates to api.getDockerfileSource, returning the snapshot unchanged", async () => {
    const snapshot = { exists: true, contents: "FROM node:22\n", etag: '"abc123"' };
    getDockerfileSource.mockResolvedValue(snapshot);
    await expect(defaultDockerfileSourcePort.getDockerfileSource()).resolves.toEqual(snapshot);
    expect(getDockerfileSource).toHaveBeenCalledWith();
  });

  it("setDockerfileSource forwards contents and ifMatch to api.setDockerfileSource", async () => {
    const written = { exists: true, contents: "FROM node:22-slim\n", etag: '"def456"' };
    setDockerfileSource.mockResolvedValue(written);
    await expect(
      defaultDockerfileSourcePort.setDockerfileSource("FROM node:22-slim\n", '"abc123"'),
    ).resolves.toEqual(written);
    expect(setDockerfileSource).toHaveBeenCalledWith("FROM node:22-slim\n", '"abc123"');
  });
});
