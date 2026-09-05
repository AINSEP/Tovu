import { describe, expect, it, vi } from "vitest";

import type { AdminExportRunSnapshot } from "@/lib/api";

/**
 * @file Coverage for `static-export-dependencies.hooks.ts`. `defaultStaticExportPort
 * .getSiteExportStatus` is already exercised indirectly (the wired hook polls status on mount),
 * but `triggerSiteExport` never is — no existing suite renders `useWiredStaticExport()` and then
 * triggers a run. `createFakeStaticExportPort`'s own default `triggerSiteExport` fallback (the
 * `??` branch used when a test calls it with no `options.triggerSiteExport` override) is likewise
 * unreached: every existing caller either omits `triggerSiteExport` entirely without invoking it,
 * or overrides it explicitly. Same thin-bind shape as `publish-credentials-dependencies.unit.test.ts`.
 */

const { triggerSiteExport, getSiteExportStatus } = vi.hoisted(() => ({
  triggerSiteExport: vi.fn(),
  getSiteExportStatus: vi.fn(),
}));

vi.mock("../../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, triggerSiteExport, getSiteExportStatus },
  };
});

const { createFakeStaticExportPort, defaultStaticExportPort } = await import("../static-export-dependencies.hooks");

const IDLE_RUN: AdminExportRunSnapshot = { status: "idle", startedAtIso: null, finishedAtIso: null, outputDir: null };
const RUNNING_RUN: AdminExportRunSnapshot = { status: "running", startedAtIso: "2026-08-01T00:00:00.000Z", finishedAtIso: null, outputDir: null };

describe("defaultStaticExportPort", () => {
  it("triggerSiteExport forwards options to api.triggerSiteExport", async () => {
    triggerSiteExport.mockResolvedValue(RUNNING_RUN);
    await expect(defaultStaticExportPort.triggerSiteExport({ clean: true })).resolves.toEqual(RUNNING_RUN);
    expect(triggerSiteExport).toHaveBeenCalledWith({ clean: true });
  });

  it("triggerSiteExport delegates with no options when called bare", async () => {
    triggerSiteExport.mockResolvedValue(RUNNING_RUN);
    await expect(defaultStaticExportPort.triggerSiteExport()).resolves.toEqual(RUNNING_RUN);
    expect(triggerSiteExport).toHaveBeenCalledWith(undefined);
  });

  it("getSiteExportStatus delegates to api.getSiteExportStatus, returning the snapshot unchanged", async () => {
    getSiteExportStatus.mockResolvedValue(IDLE_RUN);
    await expect(defaultStaticExportPort.getSiteExportStatus()).resolves.toEqual(IDLE_RUN);
    expect(getSiteExportStatus).toHaveBeenCalledWith();
  });
});

describe("createFakeStaticExportPort — defaults", () => {
  it("triggerSiteExport defaults to resolving the seeded status when not overridden", async () => {
    const port = createFakeStaticExportPort(RUNNING_RUN);
    await expect(port.triggerSiteExport()).resolves.toEqual(RUNNING_RUN);
  });

  it("an explicit triggerSiteExport override wins over the default", async () => {
    const triggerOverride = vi.fn().mockResolvedValue(RUNNING_RUN);
    const port = createFakeStaticExportPort(IDLE_RUN, { triggerSiteExport: triggerOverride });
    await expect(port.triggerSiteExport({ clean: true })).resolves.toEqual(RUNNING_RUN);
    expect(triggerOverride).toHaveBeenCalledWith({ clean: true });
  });
});
