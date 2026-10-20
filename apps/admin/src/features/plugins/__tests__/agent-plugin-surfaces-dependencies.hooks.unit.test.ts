import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAgentPluginSurfacesPort } from "../hooks/agent-plugin-surfaces-dependencies.hooks";

/**
 * @file The real admin-surface port against a stubbed `fetch`: each call goes to its own
 * same-origin admin route under this workspace, ids are path-encoded (a plugin or surface id can
 * never add a path segment), the two POSTs send JSON bodies, and the server's JSON comes back
 * unchanged. No network: `fetch` is a recording stub.
 */

interface Sent {
  readonly url: string;
  readonly method: string | undefined;
  readonly body: unknown;
}

let sent: Sent[] = [];
let answer: unknown = {};

beforeEach(() => {
  sent = [];
  answer = {};
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    sent.push({ url: String(url), method: init.method, body: typeof init.body === "string" ? JSON.parse(init.body) : init.body });
    return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
  });
});

afterEach(() => { vi.unstubAllGlobals(); });

const ROOT = "/api/admin/v1/workspaces/workspace-local/agent-plugins";

describe("defaultAgentPluginSurfacesPort", () => {
  it("lists a plugin's surfaces with a GET to its surfaces route and returns the server's listing", async () => {
    answer = { surfaces: [{ id: "connection-settings", title: "Manage connection", src: "/s/index.html", actions: [] }] };
    await expect(defaultAgentPluginSurfacesPort.list({ pluginId: "acme-office" })).resolves.toEqual(answer);
    expect(sent).toEqual([{ url: `${ROOT}/acme-office/surfaces`, method: "GET", body: undefined }]);
  });

  it("asks for a surface's bootstrap with a POST and an empty JSON body", async () => {
    answer = { surfaceId: "connection-settings", issuedAt: 1, expiresAt: 2, data: {} };
    await expect(defaultAgentPluginSurfacesPort.bootstrap({ pluginId: "acme-office", surfaceId: "connection-settings" })).resolves.toEqual(answer);
    expect(sent).toEqual([{ url: `${ROOT}/acme-office/surfaces/connection-settings/bootstrap`, method: "POST", body: {} }]);
  });

  it("posts an action's name and payload to the surface's actions route and returns the answer", async () => {
    answer = { ok: true, result: { saved: true } };
    await expect(defaultAgentPluginSurfacesPort.action({ pluginId: "acme-office", surfaceId: "connection-settings", action: "save-selection", payload: { resourceId: "r1" } })).resolves.toEqual(answer);
    expect(sent).toEqual([{ url: `${ROOT}/acme-office/surfaces/connection-settings/actions`, method: "POST", body: { action: "save-selection", payload: { resourceId: "r1" } } }]);
  });

  it("path-encodes plugin and surface ids so neither can add or climb a path segment", async () => {
    await defaultAgentPluginSurfacesPort.action({ pluginId: "../a/b", surfaceId: "x/../y?z", action: "a", payload: null });
    expect(sent[0]!.url).toBe(`${ROOT}/..%2Fa%2Fb/surfaces/x%2F..%2Fy%3Fz/actions`);
  });
});
