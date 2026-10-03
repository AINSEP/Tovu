import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { validateBaseUrlResolved } from "@jini-ai/agent-runtime";

/**
 * @file BYOK SSRF-guard adversarial battery (2026-08-04 dispatch, MSG-1 item 1 — "highest
 * value").
 *
 * Attacks `@jini-ai/agent-runtime`'s `connection-guard.ts` (`validateBaseUrl` /
 * `validateBaseUrlResolved`), reached through Tovu's own real HTTP routes
 * (`.../assistant/execution/{models,test-connection}`), against this file's hermetic
 * two-server harness (`../playwright.admin.config.ts`) — never the shared dev server, and
 * never a real provider: the "confused deputy" target below is a plain `node:http` server
 * this spec starts and owns.
 *
 * **The headline finding is not a bypass — it's a documented design decision with a real
 * blast radius.** `connection-guard.ts`'s own comment states loopback is "intentionally
 * allowed (for local LLM servers like Ollama)": `isLoopbackApiHost` short-circuits
 * `validateBaseUrl` to ALWAYS allow `localhost`/`127.0.0.0/8`/`[::1]` (and their decimal /
 * octal / hex / IPv4-mapped-IPv6 encodings — WHATWG's URL parser canonicalizes all of those
 * to plain dotted-decimal before the guard ever sees the hostname, confirmed by direct
 * probe), with **no port restriction at all**. That means an authenticated admin's BYOK
 * "Test connection" / model-discovery feature can be pointed at ANY port on the Tovu
 * server's own loopback interface — including, in principle, Tovu's own API, or any other
 * locally-bound service on that host. `ssrf-loopback-reaches-arbitrary-local-port` below
 * proves this is exploitable, not theoretical, by standing up a real local HTTP server and
 * confirming Tovu's server-side fetch actually reaches it.
 *
 * Every OTHER case in the battery (RFC1918, link-local/metadata, CGNAT, 0.0.0.0,
 * non-http(s) schemes, DNS-rebinding to a private IP) is correctly BLOCKED — see the
 * `ssrf-guard blocks` describe block. This spec exists to keep that split (loopback
 * allowed-by-design vs. everything-else blocked) honest over time: if a future change
 * accidentally narrows the block-list's coverage of a real private range, this spec fails.
 *
 * **One login per describe block, not per case.** `src/server/middleware/rate-limit.ts`'s
 * `LOGIN_STRICT` profile is a REAL brute-force guard — 10 requests/60s per client IP
 * (`dev-auth.ts:140`) — and this suite's own login calls are enough to trip it on
 * themselves if each case logs in separately (measured live: cases 11+ in a 13-login-per-
 * file layout started returning 429). Batching every case for a describe block into ONE
 * `test()` that logs in once and reuses the same authenticated `request` for every
 * sub-case is a workaround for this suite's OWN login volume, not a weakening of any
 * assertion against the product — the rate limiter itself is fully intact and untouched.
 */

const A2UI_LOGIN = { username: "admin", password: "tovu-dev" };

async function login(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/admin/v1/auth/login", { data: A2UI_LOGIN });
  expect(res.status()).toBe(200);
}

const MODELS_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/models";
const CONNECTION_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/test-connection";

function modelsBody(baseUrl: string, apiKey = "sk-test-FAKE-KEY-NOT-REAL") {
  return { protocol: "openai", baseUrl, apiKey, model: "deputy-marker-model" };
}

test("ssrf-guard blocks every documented private/reserved range and non-http(s) scheme", async ({ request }) => {
  await login(request);

  const blockedCases: Array<{ name: string; baseUrl: string; expectMessage: string }> = [
    {
      name: "cloud metadata service (169.254.169.254)",
      baseUrl: "http://169.254.169.254/latest/meta-data/",
      expectMessage: "Internal IPs blocked",
    },
    { name: "0.0.0.0", baseUrl: "http://0.0.0.0", expectMessage: "Internal IPs blocked" },
    { name: "RFC1918 10.x", baseUrl: "http://10.0.0.5", expectMessage: "Internal IPs blocked" },
    { name: "RFC1918 192.168.x", baseUrl: "http://192.168.1.1", expectMessage: "Internal IPs blocked" },
    { name: "RFC1918 172.16-31.x", baseUrl: "http://172.16.0.1", expectMessage: "Internal IPs blocked" },
    { name: "CGNAT 100.64/10", baseUrl: "http://100.64.0.1", expectMessage: "Internal IPs blocked" },
    {
      name: "decimal-encoded 10.x (167772165 = 10.0.0.5)",
      baseUrl: "http://167772165",
      expectMessage: "Internal IPs blocked",
    },
    { name: "hex-encoded private IP (0xac100001 = 172.16.0.1)", baseUrl: "http://0xac100001", expectMessage: "Internal IPs blocked" },
    { name: "IPv6 ULA fc00", baseUrl: "http://[fc00::1]", expectMessage: "Internal IPs blocked" },
    { name: "IPv6 ULA fd00", baseUrl: "http://[fd00::1]", expectMessage: "Internal IPs blocked" },
    { name: "IPv6 link-local", baseUrl: "http://[fe80::1]", expectMessage: "Internal IPs blocked" },
    { name: "IPv4-mapped private IPv6", baseUrl: "http://[::ffff:10.0.0.5]", expectMessage: "Internal IPs blocked" },
    { name: "userinfo hiding a private host", baseUrl: "http://public.example@10.0.0.5", expectMessage: "Internal IPs blocked" },
    { name: "file://", baseUrl: "file:///etc/passwd", expectMessage: "Only http/https allowed" },
    { name: "gopher://", baseUrl: "gopher://127.0.0.1:70/_test", expectMessage: "Only http/https allowed" },
  ];

  for (const path of [MODELS_PATH, CONNECTION_PATH]) {
    for (const { name, baseUrl, expectMessage } of blockedCases) {
      const start = Date.now();
      const res = await request.post(path, { data: modelsBody(baseUrl) });
      const elapsedMs = Date.now() - start;
      expect(res.status(), name).toBe(200); // route always 200s; `ok:false` carries the failure
      const body = await res.json();
      expect(body.ok, name).toBe(false);
      expect(body.message, `${path}: ${name}`).toBe(expectMessage);
      // A guard rejection is a synchronous hostname/DNS check, not a real connection attempt —
      // it should return fast. Loose smoke bound, not a precise SLA (shared dev machine, real
      // multi-second jitter observed even on passing cases) — the signal it guards against is
      // the guard letting a request through and something downstream hitting ITS OWN
      // multi-second timeout (`PROVIDER_MODELS_TIMEOUT_MS` is 12s), which this sits well under.
      expect(elapsedMs, name).toBeLessThan(10_000);
    }
  }
});

test("a hostname that DNS-resolves to a private IP is blocked (rebinding defense) — one-off, not through the route", async () => {
  // The production route always uses real DNS (`defaultDnsLookup`) with no override surface
  // — no request param lets a client inject a fake resolver. To exercise this branch
  // deterministically (without depending on controlling a real public DNS record that
  // resolves to a private IP, which this environment cannot guarantee), this calls
  // `validateBaseUrlResolved` directly with an injected resolver. This is a genuine one-off
  // measurement of the function's own contract, NOT a route-level proof — flagged as such in
  // the final report. No login needed; this test never touches the HTTP route.
  //
  // Imported from the installed `@jini-ai/agent-runtime` package (top of file), not — as this line
  // used to — a dynamic `import()` of a hardcoded absolute path into a sibling checkout
  // (`/Users/la/Programming/Jini/...`). That path only ever existed on the one laptop that wrote it
  // (`876b4fed`, 2026-08-05): a real `TS2307: Cannot find module` in CI, where the Jini sibling is
  // cloned to a different path, confirmed live against run `31998106661`. The package export is the
  // same function Tovu's own production code already resolves this same way elsewhere.
  const fakeLookup = async () => [{ address: "10.0.0.5", family: 4 }];
  const result = await validateBaseUrlResolved({ baseUrl: "http://internal.example.com", lookup: fakeLookup });
  expect(result.error).toBe("Internal IPs blocked");
  expect(result.forbidden).toBe(true);
});

test("ssrf-guard: loopback is allowed BY DESIGN, with no port restriction — the real blast radius", async ({
  request,
}) => {
  await login(request);

  // Every encoding must reach an owned listener and return a usable catalog. A generic
  // network error cannot establish that loopback was accepted or the endpoint constructed right.
  let hitCount = 0;
  const received: Array<{ path: string | undefined; method: string | undefined; authorization: string | undefined }> = [];
  const handler: http.RequestListener = (req, res) => {
    hitCount++;
    received.push({ path: req.url, method: req.method, authorization: req.headers.authorization });
    res.writeHead(200, { "content-type": "application/json" });
    // A non-empty catalog: an empty `data: []` is reported by `model-catalog.ts` as
    // `ok:false` ("Provider returned no usable text-generation models"), which would be
    // indistinguishable from a guard rejection in this test.
    res.end(JSON.stringify({ data: [{ id: "deputy-marker-model", object: "model" }] }));
  };
  const deputy = http.createServer(handler);
  const ipv6Deputy = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    deputy.once("error", reject);
    deputy.listen(0, "127.0.0.1", resolve);
  });
  const port = (deputy.address() as AddressInfo).port;

  try {
    await new Promise<void>((resolve, reject) => {
      ipv6Deputy.once("error", reject);
      ipv6Deputy.listen(0, "::1", resolve);
    });
    const ipv6Port = (ipv6Deputy.address() as AddressInfo).port;
    const encodings = [
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
      `http://[::1]:${ipv6Port}`,
      `http://2130706433:${port}`,
      `http://0177.0.0.1:${port}`,
      `http://0x7f000001:${port}`,
      `http://[::ffff:127.0.0.1]:${port}`,
    ];
    for (const baseUrl of encodings) {
      const before = hitCount;
      const res = await request.post(MODELS_PATH, { data: modelsBody(baseUrl) });
      expect(res.status(), baseUrl).toBe(200);
      const body = await res.json();
      expect(hitCount, baseUrl).toBe(before + 1);
      expect(received[before], baseUrl).toEqual({
        path: "/v1/models", method: "GET", authorization: "Bearer sk-test-FAKE-KEY-NOT-REAL",
      });
      expect(body.ok, baseUrl).toBe(true);
      expect(body.models, baseUrl).toContain("deputy-marker-model");
    }
  } finally {
    await new Promise<void>((resolve) => deputy.close(() => resolve()));
    await new Promise<void>((resolve) => ipv6Deputy.close(() => resolve()));
  }
});
