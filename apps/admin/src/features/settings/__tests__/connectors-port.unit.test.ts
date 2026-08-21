import { describe, expect, it, vi } from "vitest";

import type { AdminConnector } from "../../../lib/api";

/**
 * @file Coverage for `connectors-port.ts` (0/8 funcs) — Tovu's real `ConnectorsPort`
 * implementation. `lib/api` is mocked the same way `access-tokens-dependencies.unit.test.ts` mocks
 * a live-binding surface.
 */

const { listConnectors, getConnectorStatuses, getConnector, connectConnector, disconnectConnector, cancelConnectorAuthorization } = vi.hoisted(() => ({
  listConnectors: vi.fn(),
  getConnectorStatuses: vi.fn(),
  getConnector: vi.fn(),
  connectConnector: vi.fn(),
  disconnectConnector: vi.fn(),
  cancelConnectorAuthorization: vi.fn(),
}));

vi.mock("../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, listConnectors, getConnectorStatuses, getConnector, connectConnector, disconnectConnector, cancelConnectorAuthorization },
  };
});

const { connectorsPort } = await import("../connectors-port");

function connector(overrides: Partial<AdminConnector> = {}): AdminConnector {
  return { id: "c1", name: "Connector 1", provider: "p", category: "cat", status: "available", tools: [], ...overrides };
}

describe("connectorsPort.fetchConnectors", () => {
  it("returns the catalog from api.listConnectors()", async () => {
    listConnectors.mockResolvedValue({ connectors: [connector()] });
    await expect(connectorsPort.fetchConnectors()).resolves.toEqual([connector()]);
    expect(listConnectors).toHaveBeenCalledWith();
  });

  it("rejects (does not swallow) when the catalog read fails", async () => {
    listConnectors.mockRejectedValue(new Error("catalog down"));
    await expect(connectorsPort.fetchConnectors()).rejects.toThrow("catalog down");
  });
});

describe("connectorsPort.fetchConnectorEnrichment", () => {
  it("defaults refresh to true when no options are given", async () => {
    listConnectors.mockResolvedValue({ connectors: [connector()] });
    await connectorsPort.fetchConnectorEnrichment!();
    expect(listConnectors).toHaveBeenCalledWith(true);
  });

  it("forwards options.refresh when explicitly false", async () => {
    listConnectors.mockResolvedValue({ connectors: [] });
    await connectorsPort.fetchConnectorEnrichment!({ refresh: false });
    expect(listConnectors).toHaveBeenCalledWith(false);
  });
});

describe("connectorsPort.fetchConnectorStatuses", () => {
  it("returns the status map from api.getConnectorStatuses()", async () => {
    const statuses = { c1: { status: "connected" } };
    getConnectorStatuses.mockResolvedValue(statuses);
    await expect(connectorsPort.fetchConnectorStatuses()).resolves.toEqual(statuses);
  });
});

describe("connectorsPort.fetchConnectorDetail", () => {
  it("returns the connector on success, forwarding options", async () => {
    getConnector.mockResolvedValue(connector({ id: "c2" }));
    await expect(connectorsPort.fetchConnectorDetail("c2", { hydrateTools: true })).resolves.toEqual(connector({ id: "c2" }));
    expect(getConnector).toHaveBeenCalledWith("c2", { hydrateTools: true });
  });

  it("resolves null (never rejects) when the read fails", async () => {
    getConnector.mockRejectedValue(new Error("not found"));
    await expect(connectorsPort.fetchConnectorDetail("missing")).resolves.toBeNull();
  });
});

describe("connectorsPort.connectConnector", () => {
  it("returns { connector, auth } when the API includes an auth object", async () => {
    connectConnector.mockResolvedValue({ connector: connector(), auth: { kind: "redirect_required", redirectUrl: "https://composio/x" } });
    await expect(connectorsPort.connectConnector("c1")).resolves.toEqual({
      connector: connector(),
      auth: { kind: "redirect_required", redirectUrl: "https://composio/x" },
    });
  });

  it("omits auth entirely (not auth: undefined) when the API response has none", async () => {
    connectConnector.mockResolvedValue({ connector: connector() });
    const result = await connectorsPort.connectConnector("c1");
    expect(result).toEqual({ connector: connector() });
    expect("auth" in result).toBe(false);
  });

  it("resolves { connector: null, error } with the rejection's message, never throwing", async () => {
    connectConnector.mockRejectedValue(new Error("composio unreachable"));
    await expect(connectorsPort.connectConnector("c1")).resolves.toEqual({ connector: null, error: "composio unreachable" });
  });

  it("falls back to String(err) for a non-Error rejection", async () => {
    connectConnector.mockRejectedValue("plain string failure");
    await expect(connectorsPort.connectConnector("c1")).resolves.toEqual({ connector: null, error: "plain string failure" });
  });
});

describe("connectorsPort.disconnectConnector", () => {
  it("returns the updated connector on success", async () => {
    disconnectConnector.mockResolvedValue(connector({ status: "available" }));
    await expect(connectorsPort.disconnectConnector("c1")).resolves.toEqual(connector({ status: "available" }));
  });

  it("resolves null (never rejects) on failure", async () => {
    disconnectConnector.mockRejectedValue(new Error("boom"));
    await expect(connectorsPort.disconnectConnector("c1")).resolves.toBeNull();
  });
});

describe("connectorsPort.cancelConnectorAuthorization", () => {
  it("returns the updated connector on success", async () => {
    cancelConnectorAuthorization.mockResolvedValue(connector({ status: "available" }));
    await expect(connectorsPort.cancelConnectorAuthorization("c1")).resolves.toEqual(connector({ status: "available" }));
  });

  it("resolves null (never rejects) on failure", async () => {
    cancelConnectorAuthorization.mockRejectedValue(new Error("boom"));
    await expect(connectorsPort.cancelConnectorAuthorization("c1")).resolves.toBeNull();
  });
});

describe("connectorsPort.openExternalUrl", () => {
  it("opens the URL as a popup and resolves true when the window opens", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);
    await expect(connectorsPort.openExternalUrl("https://composio/consent")).resolves.toBe(true);
    expect(openSpy).toHaveBeenCalledWith("https://composio/consent", "_blank", "popup=yes,width=620,height=760");
    openSpy.mockRestore();
  });

  it("resolves false when the popup is blocked (window.open returns null)", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    await expect(connectorsPort.openExternalUrl("https://composio/consent")).resolves.toBe(false);
    openSpy.mockRestore();
  });
});
