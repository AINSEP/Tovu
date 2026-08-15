import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../../lib/fetch-query";
import { useDeploymentOverview } from "../use-deployment-overview.hooks";
import { createFakeDeploymentOverviewPort } from "../deployment-overview-dependencies.hooks";
import type { AdminDeploymentOverview } from "../../../../lib/api";

/**
 * @file `useDeploymentOverview` — the Overview tab's single read. Injected-port coverage, same
 * shape `use-integrations.unit.test.tsx` establishes: drives the pure hook against
 * `createFakeDeploymentOverviewPort` with real `fetch` stubbed to prove no network call happens.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const fakeT = (key: string): string => key;
const fakeLocale = "en";

function snapshotFixture(overrides: Partial<AdminDeploymentOverview> = {}): AdminDeploymentOverview {
  return {
    mode: "local",
    productionReadinessGate: { applicable: false, passed: false },
    defaultOwnerPasswordUnsafe: true,
    daemonKnownFailed: false,
    dbPath: "infra/content.db",
    uploadsDir: "infra/uploads",
    envVars: [
      { name: "TOVU_ADMIN_PASSWORD", set: false },
      { name: "TOVU_ADMIN_USER", set: false },
      { name: "TOVU_INTEGRATIONS_ROOT_KEY", set: false },
      { name: "JINI_AGENT_DAEMON_PORT", set: false },
    ],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useDeploymentOverview — injected port", () => {
  it("loads the snapshot from the fake port's seed, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeDeploymentOverviewPort(snapshotFixture({ mode: "production" }));

    const { result } = renderHook(() => useDeploymentOverview(port, fakeT, fakeLocale), { wrapper });

    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());
    expect(result.current.snapshot?.mode).toBe("production");
    expect(result.current.error).toBeNull();
    // Proves the injection actually took, not just that the hook happened to resolve something.
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("surfaces a rejected port as a translated, formatted error message rather than throwing", async () => {
    const port = createFakeDeploymentOverviewPort(() => Promise.reject(new Error("boom")));

    const { result } = renderHook(() => useDeploymentOverview(port, fakeT, fakeLocale), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.snapshot).toBeUndefined();
    expect(result.current.error).toContain("Could not load deployment status");
    expect(result.current.error).toContain("boom");
  });

  it("returns the injected t unchanged, proving the value isn't built internally", () => {
    const distinctT = (key: string): string => `xx-${key}`;
    const port = createFakeDeploymentOverviewPort(snapshotFixture());
    const { result } = renderHook(() => useDeploymentOverview(port, distinctT, fakeLocale), { wrapper });
    expect(result.current.t("Overview")).toBe("xx-Overview");
  });
});
