import assert from "node:assert/strict";
import test from "node:test";

import { DeployError, type DeployFile } from "@jini-ai/devops/deploy";

import { S3CompatibleDeployTarget } from "../s3-compatible-target.js";

/**
 * @file `S3CompatibleDeployTarget` — SigV4-signed PUT per file (spec §1/§2), path-style addressing,
 * endpoint derivation for plain AWS S3, bounded upload concurrency, and the honest terminal `status`
 * this target decides from a real reachability check (spec §3a's "uploaded, not yet reachable"
 * requirement — this file proves the LOWER half of that contract; `adapter.ts`'s own test proves the
 * `StaticPublishOutcome` mapping built on top of it).
 *
 * Every test replaces `globalThis.fetch` with a recording fake — this target (via `aws4fetch`'s
 * `AwsClient.fetch`) and the reused `checkDeploymentUrl` helper both call the bare global `fetch`, so
 * intercepting it here is sufficient to keep this suite hermetic; no real network call is ever made.
 */

const CONFIG = {
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "s3cr3t",
  bucket: "my-bucket",
  region: "us-east-1",
  publicUrl: "https://my-bucket.s3.us-east-1.amazonaws.com",
};

const FILES: DeployFile[] = [
  { file: "index.html", data: "<html>home</html>", contentType: "text/html" },
  { file: "about/index.html", data: "<html>about</html>", contentType: "text/html" },
  { file: "robots.txt", data: "User-agent: *" },
];

type Call = { url: string; method: string; headers: Headers };

/**
 * Installs a recording fake for `globalThis.fetch`, restored by the caller. `respond` decides the
 * response for each call by URL/method — defaults to a 200 for anything unmatched, so a test only
 * needs to special-case the calls it cares about.
 *
 * `aws4fetch`'s `AwsClient.fetch(url, init)` calls `this.sign(url, init)` first, which returns a real
 * signed `Request` object, and THEN calls the global `fetch` with that ONE `Request` argument (no
 * separate `init`) — confirmed by reading `aws4fetch.cjs.js` directly rather than assumed from its
 * `.d.ts`. So method/headers must be read off the `Request` object itself, never off a second `init`
 * argument, which `checkDeploymentUrl`'s own unsigned probes never pass either.
 */
function installFakeFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call =
      input instanceof Request
        ? { url: input.url, method: input.method, headers: input.headers }
        : { url: typeof input === "string" ? input : input.toString(), method: init?.method ?? "GET", headers: new Headers(init?.headers) };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function okResponse(): Response {
  return new Response("", { status: 200 });
}

test("publish: signs and PUTs every file to a path-style object URL, then reports 'ready' when the public URL is reachable", async () => {
  const fake = installFakeFetch(() => okResponse());
  try {
    const target = new S3CompatibleDeployTarget(CONFIG);
    const result = await target.publish({ files: FILES, projectName: "demo" });

    assert.equal(result.targetId, "s3-compatible");
    assert.equal(result.url, CONFIG.publicUrl);
    assert.equal(result.status, "ready");

    // 3 uploads + 1 reachability HEAD probe against publicUrl.
    const uploadCalls = fake.calls.filter((c) => c.method === "PUT");
    assert.equal(uploadCalls.length, 3);

    const indexCall = uploadCalls.find((c) => c.url.endsWith("/my-bucket/index.html"));
    assert.ok(indexCall, `expected a PUT to .../my-bucket/index.html, got: ${uploadCalls.map((c) => c.url).join(", ")}`);
    assert.equal(indexCall!.url, "https://s3.us-east-1.amazonaws.com/my-bucket/index.html");

    const nestedCall = uploadCalls.find((c) => c.url.endsWith("/my-bucket/about/index.html"));
    assert.ok(nestedCall, "nested deploy-relative paths must be preserved in the object key");

    // SigV4 signature present, scoped to service "s3" and the configured region — proves aws4fetch
    // actually signed the request rather than a plain unauthenticated PUT reaching the fake.
    const auth = indexCall!.headers.get("authorization") ?? "";
    assert.match(auth, /^AWS4-HMAC-SHA256 /);
    assert.match(auth, /\/us-east-1\/s3\/aws4_request/);

    // Content-Type forwarded from DeployFile.contentType.
    assert.equal(indexCall!.headers.get("content-type"), "text/html");
  } finally {
    fake.restore();
  }
});

test("publish: falls back to application/octet-stream when DeployFile.contentType is absent", async () => {
  const fake = installFakeFetch(() => okResponse());
  try {
    const target = new S3CompatibleDeployTarget(CONFIG);
    await target.publish({ files: [{ file: "robots.txt", data: "User-agent: *" }], projectName: "demo" });
    const uploadCall = fake.calls.find((c) => c.method === "PUT");
    assert.equal(uploadCall!.headers.get("content-type"), "application/octet-stream");
  } finally {
    fake.restore();
  }
});

test("publish: an explicit endpoint is used verbatim (trailing slash stripped); a blank/omitted endpoint derives the plain-AWS-S3 host from region", async () => {
  const fake = installFakeFetch(() => okResponse());
  try {
    const target = new S3CompatibleDeployTarget({ ...CONFIG, region: "auto", endpoint: "https://abc123.r2.cloudflarestorage.com/" });
    await target.publish({ files: [{ file: "index.html", data: "x" }], projectName: "demo" });
    const uploadCall = fake.calls.find((c) => c.method === "PUT");
    assert.equal(uploadCall!.url, "https://abc123.r2.cloudflarestorage.com/my-bucket/index.html");
  } finally {
    fake.restore();
  }
});

test("publish: throws DeployError naming the failing file when a PUT is rejected — never leaks credentials in the message", async () => {
  const fake = installFakeFetch((call) => (call.url.endsWith("about/index.html") ? new Response("Forbidden", { status: 403 }) : okResponse()));
  try {
    const target = new S3CompatibleDeployTarget(CONFIG);
    await assert.rejects(
      () => target.publish({ files: FILES, projectName: "demo" }),
      (err: unknown) => {
        assert.ok(err instanceof DeployError);
        assert.match(err.message, /about\/index\.html/);
        assert.match(err.message, /403/);
        assert.doesNotMatch(err.message, new RegExp(CONFIG.secretAccessKey));
        assert.doesNotMatch(err.message, new RegExp(CONFIG.accessKeyId));
        return true;
      }
    );
  } finally {
    fake.restore();
  }
});

test("publish: reports 'link-delayed' (never throws) when every upload succeeds but the public URL is not yet reachable", async () => {
  const fake = installFakeFetch((call) => (call.method === "PUT" ? okResponse() : new Response("Not Found", { status: 404 })));
  try {
    const target = new S3CompatibleDeployTarget(CONFIG);
    const result = await target.publish({ files: [{ file: "index.html", data: "x" }], projectName: "demo" });
    assert.equal(result.status, "link-delayed");
    assert.equal(result.url, CONFIG.publicUrl);
  } finally {
    fake.restore();
  }
});

test("checkReachability: a plain unauthenticated probe against the given URL — reachable:true on 200, and never signed", async () => {
  const fake = installFakeFetch(() => okResponse());
  try {
    const target = new S3CompatibleDeployTarget(CONFIG);
    const check = await target.checkReachability("https://example.test/site");
    assert.equal(check.reachable, true);
    // Never signed — no Authorization header on the reachability probe.
    assert.ok(!fake.calls[0]!.headers.get("authorization"), "checkReachability must be a plain unauthenticated probe, never SigV4-signed");
  } finally {
    fake.restore();
  }
});

test("publish: uploads at most 8 files concurrently (bounded worker pool), even for a large file set", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const method = input instanceof Request ? input.method : "GET";
    if (method === "PUT") {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return okResponse();
    }
    return okResponse();
  }) as typeof fetch;
  try {
    const target = new S3CompatibleDeployTarget(CONFIG);
    const manyFiles: DeployFile[] = Array.from({ length: 40 }, (_, i) => ({ file: `page-${i}.html`, data: "x" }));
    await target.publish({ files: manyFiles, projectName: "demo" });
    assert.ok(maxInFlight <= 8, `expected at most 8 concurrent uploads, observed ${maxInFlight}`);
    assert.ok(maxInFlight >= 2, `expected genuine concurrency (not fully serial), observed ${maxInFlight}`);
  } finally {
    globalThis.fetch = original;
  }
});
