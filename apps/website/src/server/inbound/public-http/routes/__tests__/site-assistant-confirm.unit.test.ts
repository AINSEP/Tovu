import assert from "node:assert/strict";
import test from "node:test";
import { registerSiteAssistantConfirm, SITE_ASSISTANT_CONFIRM_PATH } from "../site-assistant-confirm.js";

/** Registered Express handler with DI fakes; never opens a listener. */
function fixture(options: { enabled?: boolean; allowed?: boolean; origin?: string | null; fetchSite?: string | null; type?: string; accepted?: boolean; fail?: boolean; budget?: boolean } = {}) {
  let handler: (req: unknown, res: unknown) => void;
  let enabledCalls = 0;
  const deliveries: unknown[] = [], errors: unknown[] = [], origins: string[] = [];
  registerSiteAssistantConfirm({ app: { post(path: string, fn: typeof handler) { assert.equal(path, SITE_ASSISTANT_CONFIRM_PATH); handler = fn; } } as never,
    ports: {
      confirmations: { request: async () => false, confirm: async input => { deliveries.push(input); if (options.fail) throw new Error("storage failed"); return options.accepted !== false; } },
      enabled: async () => { enabledCalls++; return options.enabled !== false; },
      allowsOrigin: async ({ origin }) => { origins.push(origin); return origin === "https://site.test" && options.allowed !== false; },
      limiter: { check: async () => options.budget === false ? { allowed: false, retryAfterSeconds: 60 } : { allowed: true } },
      reportError: error => { errors.push(error); },
    } });
  return { deliveries, errors, origins, enabledCalls: () => enabledCalls, send(body: unknown = { challengeId: "a".repeat(22), allow: true }) {
    return new Promise<{ status: number; body: unknown; cache: string }>(resolve => {
      let status = 200, cache = "";
      const res = { setHeader(_name: string, value: string) { cache = value; }, status(value: number) { status = value; return res; },
        json(value: unknown) { resolve({ status, body: value, cache }); } };
      const headers = { origin: options.origin === null ? undefined : options.origin ?? "https://site.test",
        "sec-fetch-site": options.fetchSite === null ? undefined : options.fetchSite ?? "same-origin" };
      handler!({ body, headers, get: (key: keyof typeof headers) => headers[key], is: (type: string) => type === (options.type ?? "application/json"), socket: { remoteAddress: "127.0.0.1" } }, res);
    });
  } };
}

for (const allow of [true, false]) test(`same-origin click allow=${allow} delivers only the closed shape`, async () => {
  const f = fixture();
  const body = { challengeId: "a".repeat(22), allow };
  assert.deepEqual(await f.send(body), { status: 200, body: { accepted: true }, cache: "no-store" });
  assert.deepEqual(f.deliveries, [body]);
});

for (const body of [null, [], "approved", {}, { allow: true }, { challengeId: "a".repeat(22), allow: "true" },
  { challengeId: "forged", allow: true }, { challengeId: "a".repeat(22), allow: true, approved: true },
  { challengeId: "a".repeat(22), allow: true, executionId: "another" }, { challengeId: "a".repeat(500), allow: true }]) {
  test(`malformed or model-forged reply ${JSON.stringify(body)?.slice(0, 65)} refuses without delivery`, async () => {
    const f = fixture();
    assert.equal((await f.send(body)).status, 400);
    assert.deepEqual(f.deliveries, []);
  });
}

for (const options of [{ origin: "https://evil.test", fetchSite: null }, { origin: "", fetchSite: null },
  { origin: null, fetchSite: null }, { origin: "null" },
  { origin: "null", fetchSite: null }, { allowed: false, fetchSite: null }, { fetchSite: "cross-site" },
  { fetchSite: "same-site" }, { fetchSite: "none" }, { fetchSite: "" },
  { type: "application/x-www-form-urlencoded" }]) test(`foreign origin/type ${JSON.stringify(options)} refuses`, async () => {
  const f = fixture(options);
  assert.equal((await f.send()).status, 400);
  assert.deepEqual(f.deliveries, []);
});

test("same-origin metadata supplies the browser origin guarantee even without an Origin header", async () => {
  const f = fixture({ origin: null });
  assert.equal((await f.send()).status, 200);
  assert.deepEqual(f.origins, []);
});

test("disabled/rollback and rate-limited sites refuse without consuming any challenge", async () => {
  for (const [options, status] of [[{ enabled: false }, 404], [{ budget: false }, 429]] as const) {
    const f = fixture(options);
    assert.equal((await f.send()).status, status);
    assert.deepEqual(f.deliveries, []);
    assert.deepEqual(f.origins, []);
    assert.equal(f.enabledCalls(), status === 429 ? 0 : 1);
  }
});

test("missing Fetch Metadata is permitted only with a validated Origin; stale/replayed IDs and errors uniformly refuse", async () => {
  const legacy = fixture({ fetchSite: null });
  assert.equal((await legacy.send()).status, 200);
  assert.deepEqual(legacy.origins, ["https://site.test"]);
  for (const options of [{ accepted: false }, { fail: true }]) {
    const f = fixture(options);
    assert.deepEqual(await f.send(), { status: 400, body: { error: "I can't help with that request here." }, cache: "no-store" });
    assert.equal(f.errors.length, "fail" in options ? 1 : 0);
  }
});

for (const origin of ["https://preview.site.test", "http://localhost:5174", "http://127.0.0.1:4100"]) {
  test(`browser same-origin metadata accepts the actual widget host ${origin} without a canonical lookup`, async () => {
    const f = fixture({ origin });
    assert.equal((await f.send()).status, 200);
    assert.deepEqual(f.origins, []);
    const legacy = fixture({ origin, fetchSite: null });
    assert.equal((await legacy.send()).status, 400);
    assert.deepEqual(legacy.origins, [origin]);
  });
}
