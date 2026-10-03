import assert from "node:assert/strict";
export const AT = "2026-10-01T12:00:00.000Z";
export function context(responses: Record<string, unknown>) {
  const calls: string[] = [];
  return { calls, nowIso: () => AT, fail: (message: string): never => { throw new Error(message); }, get: async (url: string) => {
    calls.push(url);
    assert.equal(Object.hasOwn(responses, url), true, `unexpected GET ${url}`);
    return { status: 200, json: responses[url], text: typeof responses[url] === "string" ? responses[url] as string : JSON.stringify(responses[url]) };
  } };
}
