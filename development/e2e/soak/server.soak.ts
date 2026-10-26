/** Real compiled serve child: sequential public/admin/media/404 requests and inspector heap floors. */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import { pinSessionHeaders } from "../support/bug-pin-auth.js";
import { JOURNEY_ADMIN_USER, JOURNEY_ADMIN_PASSWORD, type IsolatedJourneySite } from "../support/isolated-journey-site.js";
import { TINY_PNG } from "../journeys/_fixtures.js";
import { createMemoryEvidence } from "./_evidence.js";

interface HeapReading { pid: number; node: string; heapUsed: number; rss: number }

/** One outstanding inspector request, matched by ID; all waits are bounded and errors omit capabilities.
 * @complexity O(1) exchanges; no event backlog or retained protocol payloads.
 */
async function connectInspector({ url, pid }: { url: string; pid: number }, _options = {}) {
  const socket = new WebSocket(url);
  try { await once(socket, "open", { signal: AbortSignal.timeout(5000) }); }
  catch { socket.close(); throw new Error("Inspector connection failed"); }
  let nextId = 0;
  let busy = false;
  return {
    async read(_required = {}, _options = {}): Promise<HeapReading> {
      if (busy) throw new Error("Concurrent inspector request");
      busy = true;
      const id = ++nextId;
      return new Promise<HeapReading>((resolve, reject) => {
        const timer = setTimeout(() => finish({ error: "Inspector response deadline" }), 10_000);
        /** Release handlers on every outcome; remote exception text is deliberately not logged. */
        function finish({ value, error }: { value?: HeapReading; error?: string }, _options = {}) {
          clearTimeout(timer); busy = false;
          socket.onmessage = socket.onerror = socket.onclose = null;
          if (error) reject(new Error(error));
          else resolve(value!);
        }
        socket.onerror = socket.onclose = () => finish({ error: "Inspector disconnected" });
        socket.onmessage = event => {
          try {
            const message = JSON.parse(String(event.data));
            if (message.id === undefined) return; // Protocol notifications are not replies.
            if (message.id !== id) return finish({ error: "Inspector response ID mismatch" });
            if (message.error || message.result?.exceptionDetails) return finish({ error: "Inspector GC evaluation failed" });
            const value = message.result.result.value as HeapReading;
            if (value?.pid !== pid) return finish({ error: "Inspector PID mismatch" });
            finish({ value });
          } catch { finish({ error: "Invalid inspector response" }); }
        };
        try { socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { awaitPromise: true, returnByValue: true,
          expression: `(async () => { if (typeof globalThis.gc !== 'function') throw new Error('GC unavailable'); globalThis.gc(); await new Promise(setImmediate); globalThis.gc(); return { ...process.memoryUsage(), pid: process.pid, node: process.versions.node }; })()`,
        } })); } catch { finish({ error: "Inspector send failed" }); }
      });
    },
    async close(_required = {}, _options = {}) {
      if (socket.readyState === WebSocket.CLOSED) return;
      const closed = once(socket, "close", { signal: AbortSignal.timeout(5000) });
      socket.close(); await closed;
    },
  };
}

/** Login once, resolve seeded pages, upload one real fixture. Dispose all Playwright setup responses. */
async function prepareWorkload({ request, origin, workspaceId }: { request: APIRequestContext; origin: string; workspaceId: string }, _options = {}) {
  const login = await request.post(`${origin}/api/admin/v1/auth/login`, { data: { username: JOURNEY_ADMIN_USER, password: JOURNEY_ADMIN_PASSWORD } });
  try { expect(login.status()).toBe(200); } finally { await login.dispose(); }
  const headers = await pinSessionHeaders({ request });
  const api = `${origin}/api/admin/v1/workspaces/${workspaceId}`;
  const listed = await request.get(`${api}/pages`, { headers });
  let pages: Array<{ post: { slug: string; status: string } }>;
  try { expect(listed.status()).toBe(200); pages = (await listed.json()).posts; } finally { await listed.dispose(); }
  const urls = pages.filter(({ post }) => post.status === "published").slice(0, 2).map(({ post }) => new URL(`/${post.slug.replace(/^\//, "")}`, origin).href);
  expect(urls).toHaveLength(2);
  const upload = await request.post(`${api}/media`, { headers, data: { filename: "memory-soak.png", contentType: "image/png", dataBase64: TINY_PNG.toString("base64") } });
  let mediaURL: string;
  try { expect(upload.status()).toBe(201); mediaURL = (await upload.json()).media.publicUrl; } finally { await upload.dispose(); }
  expect(mediaURL!).toMatch(/^\/m\//);
  return { headers, mix: [
    ...urls.map(url => ({ url, status: 200, type: "text/html", headers: {} })),
    { url: `${api}/pages`, status: 200, type: "application/json", headers },
    { url: new URL(mediaURL!, origin).href, status: 200, type: "image/", headers: {} },
    { url: `${origin}/__memory_soak_missing_page__`, status: 404, type: "text/html", headers: {} },
  ] };
}

test("serve memory floors after 3,000 requests", async ({ request }, info) => {
  const site = info.config.metadata.isolatedJourneySite as IsolatedJourneySite;
  const evidence = createMemoryEvidence({ suite: "server", warmup: 500, workload: 3000 });
  let inspector: Awaited<ReturnType<typeof connectInspector>> | undefined;
  let phase = "serve inspector setup";
  try {
    await expect.poll(() => existsSync(path.join(site.runtimeDir, "soak-server.json")), { timeout: 10_000 }).toBe(true);
    const boot = JSON.parse(readFileSync(path.join(site.runtimeDir, "soak-server.json"), "utf8"));
    inspector = await connectInspector({ url: boot.inspectorURL, pid: boot.pid });
    phase = "login, seeded pages and media setup";
    const { mix } = await prepareWorkload({ request, origin: site.apiURL, workspaceId: boot.workspaceId });
    // O(requests) sequential I/O: one fully consumed response at a time, no retained response list.
    for (let completed = -500; completed <= 3000; completed++) {
      if (completed >= 0 && completed % 500 === 0) {
        phase = `post-GC heap checkpoint at ${completed} requests`;
        const readings = [await inspector.read(), await inspector.read()];
        expect(readings.every(reading => Number.isFinite(reading.rss) && reading.rss > 0)).toBe(true);
        evidence.metadata.node = readings[0].node;
        evidence.checkpoint({ completed, samples: readings.map(reading => reading.heapUsed), readings });
      }
      if (completed === 3000) break;
      const item = mix[(completed + 500) % mix.length];
      phase = `HTTP request ${completed + 1} (mix ${(completed + 500) % mix.length})`;
      const response = await fetch(item.url, { headers: item.headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
      const bytes = await response.arrayBuffer();
      expect(response.status).toBe(item.status);
      expect(response.headers.get("content-type")).toContain(item.type);
      expect(bytes.byteLength).toBeGreaterThan(0);
    }
  } catch (error) {
    // samples.json keeps only the fixed phase; the report keeps the real assertion or I/O error.
    evidence.fail({ reason: phase });
    throw error;
  } finally {
    try { await inspector?.close(); }
    catch { evidence.fail({ reason: "inspector cleanup" }); throw new Error("Inspector cleanup failed"); }
  }
  evidence.finish();
});
