import { afterEach, expect, test, vi } from "vitest";

import { assistantPermanentDeletesPort } from "../assistant-permanent-deletes";
import { assistantSubagentsPort, SUBAGENT_DANGERS } from "../assistant-subagents";

/**
 * @file The two assistant risk-setting host adapters (`assistant-permanent-deletes.ts`,
 * `assistant-subagents.ts`) are thin: each must hit its own workspace system path with the shared
 * authenticated request boundary (JSON body, same-origin admin API base) and hand back the server's
 * settings unchanged. Same stub-real-`fetch`-and-assert-on-the-call pattern as `api-users.unit.test.ts`.
 */

afterEach(() => { vi.unstubAllGlobals(); });

function stubFetch(reply: unknown) {
  const calls: { url: string; method?: string; body?: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  return calls;
}

test("the permanent-deletes port reads and writes the workspace policy through the admin API", async () => {
  const settings = { enabled: true, allowedToolIds: ["delete_page"], canEdit: true };
  const calls = stubFetch(settings);
  await expect(assistantPermanentDeletesPort.read({})).resolves.toEqual(settings);
  const policy = { enabled: true, allowedToolIds: ["delete_page"], riskAcknowledged: true };
  await expect(assistantPermanentDeletesPort.write(policy)).resolves.toEqual(settings);
  expect(calls).toEqual([
    { url: "/api/admin/v1/workspaces/workspace-local/system/assistant-permanent-deletes", method: "GET", body: undefined },
    { url: "/api/admin/v1/workspaces/workspace-local/system/assistant-permanent-deletes", method: "PUT", body: policy },
  ]);
});

test("the subagents port reads and writes the full-CLI setting with the risk acknowledgement", async () => {
  const settings = { enabled: true, canEdit: true };
  const calls = stubFetch(settings);
  await expect(assistantSubagentsPort.read({})).resolves.toEqual(settings);
  await expect(assistantSubagentsPort.write({ enabled: true, riskAcknowledged: true })).resolves.toEqual(settings);
  expect(calls).toEqual([
    { url: "/api/admin/v1/workspaces/workspace-local/system/assistant-full-cli", method: "GET", body: undefined },
    { url: "/api/admin/v1/workspaces/workspace-local/system/assistant-full-cli", method: "PUT", body: { enabled: true, riskAcknowledged: true } },
  ]);
  expect(SUBAGENT_DANGERS[0]).toBe("Security risk: subagents can act independently.");
});
