import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import os from "node:os";
import * as path from "node:path";
import assert from "node:assert/strict";
import test, { after } from "node:test";

import { childProcessCoverageEnv } from "#src/core/child-process-coverage-env";

const require = createRequire(import.meta.url);

/**
 * @file `GET /api/components/search` and `GET /api/components/:id`, exercised over a real HTTP
 * socket against the real agent daemon entry point (`agent-daemon-server.ts`), not a fake
 * stand-in.
 *
 * Why this exists: `registerComponentCatalogRoutes(app, { catalog: buildComponentCatalogQuery() },
 * adapter)` reads as correctly wired, but so did the sibling `registerToolCatalogRoutes` call right
 * above it — which turned out to be silently unmounted for weeks (see the doc comment above both
 * calls in `agent-daemon-server.ts`). `daemon-boots.integration.test.ts` proves the real process
 * starts and listens, but asserts nothing about any individual route actually answering a request.
 * This file closes that gap for the component catalog specifically: real process, real port, real
 * bearer token, real `Host` header satisfying `requireSameOrigin`, real response bodies.
 */

const DAEMON_ENTRY = path.resolve(import.meta.dirname, "../../agent-daemon-server.ts");
const TSX_LOADER = require.resolve("tsx");

/** See `daemon-boots.integration.test.ts`'s identical constant: the real daemon child process must
 * not dump its own V8 coverage profile into this runner's aggregation directory. */
const WORKER_COVERAGE_DIR = mkdtempSync(path.join(os.tmpdir(), "tovu-component-catalog-worker-coverage-"));
after(() => rmSync(WORKER_COVERAGE_DIR, { recursive: true, force: true }));

const DAEMON_TOKEN = "c".repeat(64);

/** A port nothing else holds — see `daemon-boots.integration.test.ts`'s identical helper. */
async function reserveFreePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, resolve);
  });
  const address = probe.address();
  assert.ok(address !== null && typeof address === "object", "expected an AddressInfo");
  const { port } = address;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

test("the real daemon answers component-catalog search, describe, and a 404 over real HTTP", async (t) => {
  const port = await reserveFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, ["--import", TSX_LOADER, DAEMON_ENTRY], {
    env: {
      ...childProcessCoverageEnv(WORKER_COVERAGE_DIR),
      JINI_AGENT_DAEMON_PORT: String(port),
      TOVU_WORKSPACE: "workspace-local",
      // Never touch the developer's real content.db.
      TOVU_DB: "memory",
      TOVU_AGENT_DAEMON_TOKEN: DAEMON_TOKEN,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));

  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });

  const outcome = await new Promise<"listening" | "exited">((resolve) => {
    const deadline = setTimeout(() => resolve(child.exitCode === null ? "listening" : "exited"), 45_000);
    const poll = setInterval(() => {
      if (/listening on/i.test(output)) {
        clearTimeout(deadline);
        clearInterval(poll);
        resolve("listening");
      }
    }, 250);
    child.once("exit", () => {
      clearTimeout(deadline);
      clearInterval(poll);
      resolve("exited");
    });
  });

  assert.equal(outcome, "listening", `expected the daemon to start listening, but it exited:\n${output}`);

  const authHeaders = { authorization: `Bearer ${DAEMON_TOKEN}` };

  // 1. Search for a term known (via `component-catalog-query.test.ts`) to match real manifests.
  const searchRes = await fetch(`${baseUrl}/api/components/search?q=${encodeURIComponent("data table")}&limit=5`, {
    headers: authHeaders,
  });
  const searchText = await searchRes.text();
  assert.equal(searchRes.status, 200, `search request failed:\n${searchText}\n\ndaemon output:\n${output}`);
  const searchBody = JSON.parse(searchText) as { hits: Array<Record<string, unknown>> };
  assert.ok(Array.isArray(searchBody.hits), "response must have a `hits` array");
  assert.ok(searchBody.hits.length > 0, "expected at least one hit for \"data table\"");

  const firstHit = searchBody.hits[0]!;
  assert.equal(typeof firstHit.id, "string");
  assert.equal(typeof firstHit.provider, "string");
  assert.ok(Array.isArray(firstHit.capabilities));
  assert.equal(typeof firstHit.score, "number");
  assert.ok(
    searchBody.hits.some((hit) => hit.id === "native.data-table" || hit.id === "shadcn.data-table"),
    `expected a known data-table manifest among the hits: ${JSON.stringify(searchBody.hits)}`,
  );

  // 2. Describe the real id the search just returned.
  const describeRes = await fetch(`${baseUrl}/api/components/${encodeURIComponent(String(firstHit.id))}`, {
    headers: authHeaders,
  });
  const describeText = await describeRes.text();
  assert.equal(describeRes.status, 200, `describe request failed:\n${describeText}`);
  const describeBody = JSON.parse(describeText) as Record<string, unknown>;
  assert.equal(describeBody.id, firstHit.id);
  assert.equal(typeof describeBody.provider, "string");
  assert.ok(Array.isArray(describeBody.capabilities));
  assert.equal(typeof describeBody.propsSchema, "object");
  assert.ok(describeBody.propsSchema !== null, "propsSchema must be a real JSON-Schema object, not null");

  // 3. A made-up id must 404, not 200 or 500.
  const missingRes = await fetch(`${baseUrl}/api/components/no.such.component.xyz`, { headers: authHeaders });
  const missingText = await missingRes.text();
  assert.equal(missingRes.status, 404, `expected 404 for an unknown id, got ${missingRes.status}:\n${missingText}`);
  const missingBody = JSON.parse(missingText) as { error: { code: string } };
  assert.equal(missingBody.error.code, "NOT_FOUND");
});
