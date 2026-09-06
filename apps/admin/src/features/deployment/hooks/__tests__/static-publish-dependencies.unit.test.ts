import { describe, expect, it, vi } from "vitest";

import type { AdminPublishRunSnapshot, AdminStaticPublishConfig, AdminStaticPublishPreview } from "@/lib/api";

/**
 * @file Coverage for `static-publish-dependencies.hooks.ts`. `defaultStaticPublishPort
 * .getPublishStatus` is already exercised indirectly (the wired hook polls status on mount), but
 * `getPublishPreview` and `triggerPublish` never are — no existing suite renders
 * `useWiredStaticPublish()` and then previews or triggers a run. `createFakeStaticPublishPort`'s
 * own default `getPublishPreview` fallback (the `??` branch used when a test calls it with no
 * `overrides.getPublishPreview`) is likewise unreached — every existing caller that omits the
 * override never calls `port.getPublishPreview()` (the `getPublishStatus` default IS already
 * exercised elsewhere, via `use-static-publish.unit.test.ts`). Same thin-bind shape as
 * `publish-credentials-dependencies.unit.test.ts`.
 */

const { getPublishPreview, triggerPublish, getPublishStatus } = vi.hoisted(() => ({
  getPublishPreview: vi.fn(),
  triggerPublish: vi.fn(),
  getPublishStatus: vi.fn(),
}));

vi.mock("../../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, getPublishPreview, triggerPublish, getPublishStatus },
  };
});

const { createFakeStaticPublishPort, defaultStaticPublishPort } = await import("../static-publish-dependencies.hooks");

const GITHUB_CONFIG: AdminStaticPublishConfig = { target: "github-pages", owner: "tovu", repo: "tovu-com" };
const IDLE_RUN: AdminPublishRunSnapshot = { status: "idle", startedAtIso: null, finishedAtIso: null, target: null };
const RUNNING_RUN: AdminPublishRunSnapshot = { status: "running", startedAtIso: "2026-08-01T00:00:00.000Z", finishedAtIso: null, target: "github-pages" };
const PREVIEW: AdminStaticPublishPreview = {
  target: "github-pages",
  valid: true,
  validationError: null,
  basePath: "/tovu-com",
  credentialsConfigured: true,
  credentialGuidance: null,
  willInjectNojekyll: true,
};

describe("defaultStaticPublishPort", () => {
  it("getPublishPreview forwards config to api.getPublishPreview, returning the preview unchanged", async () => {
    getPublishPreview.mockResolvedValue(PREVIEW);
    await expect(defaultStaticPublishPort.getPublishPreview(GITHUB_CONFIG)).resolves.toEqual(PREVIEW);
    expect(getPublishPreview).toHaveBeenCalledWith(GITHUB_CONFIG);
  });

  it("triggerPublish forwards input to api.triggerPublish", async () => {
    triggerPublish.mockResolvedValue(RUNNING_RUN);
    const input = { config: GITHUB_CONFIG, projectName: "tovu-com" };
    await expect(defaultStaticPublishPort.triggerPublish(input)).resolves.toEqual(RUNNING_RUN);
    expect(triggerPublish).toHaveBeenCalledWith(input);
  });

  it("getPublishStatus delegates to api.getPublishStatus, returning the snapshot unchanged", async () => {
    getPublishStatus.mockResolvedValue(IDLE_RUN);
    await expect(defaultStaticPublishPort.getPublishStatus()).resolves.toEqual(IDLE_RUN);
    expect(getPublishStatus).toHaveBeenCalledWith();
  });
});

describe("createFakeStaticPublishPort — getPublishPreview default", () => {
  const IDLE_PREVIEW: AdminStaticPublishPreview = {
    target: "vercel",
    valid: false,
    validationError: null,
    basePath: null,
    credentialsConfigured: false,
    credentialGuidance: null,
    willInjectNojekyll: false,
  };

  it("defaults to a neutral, invalid vercel preview when not overridden", async () => {
    const port = createFakeStaticPublishPort();
    await expect(port.getPublishPreview(GITHUB_CONFIG)).resolves.toEqual(IDLE_PREVIEW);
  });

  it("an explicit getPublishPreview override wins over the default", async () => {
    const port = createFakeStaticPublishPort({ getPublishPreview: () => Promise.resolve(PREVIEW) });
    await expect(port.getPublishPreview(GITHUB_CONFIG)).resolves.toEqual(PREVIEW);
  });
});

describe("createFakeStaticPublishPort — getPublishStatus default", () => {
  it("defaults to the idle run when not overridden", async () => {
    const port = createFakeStaticPublishPort();
    await expect(port.getPublishStatus()).resolves.toEqual(IDLE_RUN);
  });

  it("an explicit getPublishStatus override wins over the default", async () => {
    const port = createFakeStaticPublishPort({ getPublishStatus: () => Promise.resolve(RUNNING_RUN) });
    await expect(port.getPublishStatus()).resolves.toEqual(RUNNING_RUN);
  });
});
