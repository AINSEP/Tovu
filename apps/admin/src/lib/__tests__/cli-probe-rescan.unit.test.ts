import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";

afterEach(() => { vi.unstubAllGlobals(); });

it("sends a strict force flag only for an explicit CLI Rescan", async () => {
  const bodies: unknown[] = [];
  vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
    bodies.push(JSON.parse(String(options.body)));
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  await api.detectExecutionAgents({}, {});
  await api.detectExecutionAgents({}, { force: true });
  expect(bodies).toEqual([{}, { force: true }]);
});
