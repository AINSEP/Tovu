import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import { createDeployHostKit } from "../../../../apps/website/src/features/deployments/deploy-targets/host-kit.ts";

/**
 * @file Tovu's half of the portable `s3-compatible` plugin (now `@jini-ai/agent-plugins/s3-compatible`):
 * the SigV4 signer this host hands every S3-compatible module through `kit.createSigV4Client`.
 * Moved from the plugin's `object-store.test.mjs` case "put() sends a real SigV4-signed request"
 * (2026-11-02), which drove the plugin's store with `aws4fetch` directly. The plugin half (the store
 * hands the signer the credential, method, URL and bytes) stays with the plugin in Jini; this half
 * proves the host's signer emits a request any S3 API accepts, recomputed independently.
 */

test("the host kit's SigV4 client sends a verifiable AWS4-HMAC-SHA256 PUT with the exact body", async (t) => {
  /** @type {Request[]} */
  const sent = [];
  t.mock.method(globalThis, "fetch", async (request) => {
    sent.push(request);
    return new Response(null, { status: 200 });
  });
  const client = createDeployHostKit().createSigV4Client({ accessKeyId: "test-access-key-id", secretAccessKey: "test-secret-access-key", service: "s3", region: "us-east-1" });
  await client.fetch("https://objects.example.test/bucket/ws/key", { method: "PUT", body: new Uint8Array([1, 2, 3]) });

  const [request] = sent;
  const body = Buffer.from(await request.arrayBuffer());
  assert.deepEqual(body, Buffer.from([1, 2, 3]));
  const authHeader = request.headers.get("authorization");
  // Independent SigV4 verification: no use of aws4fetch's signer or credential cache.
  const match = authHeader?.match(/^AWS4-HMAC-SHA256 Credential=([^/]+)\/([^,]+), SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/);
  assert.ok(match, "expected an AWS4-HMAC-SHA256 Authorization header on the signed PUT");
  const [, accessKey, scope, signedHeaders, signature] = match;
  const datetime = request.headers.get("x-amz-date");
  const date = datetime.slice(0, 8);
  assert.equal(accessKey, "test-access-key-id");
  assert.equal(scope, `${date}/us-east-1/s3/aws4_request`);
  const payloadHash = request.headers.get("x-amz-content-sha256");
  if (payloadHash !== "UNSIGNED-PAYLOAD") assert.equal(payloadHash, createHash("sha256").update(body).digest("hex"));
  assert.equal(signedHeaders, "host;x-amz-content-sha256;x-amz-date");
  // A fetch `Request` never carries `host` (the transport derives it from the URL), so read it from there.
  const headerValue = (name) => (name === "host" ? new URL(request.url).host : request.headers.get(name));
  const canonicalHeaders = signedHeaders.split(";").map((name) => `${name}:${headerValue(name).trim().replace(/\s+/g, " ")}\n`).join("");
  const canonicalRequest = [request.method, new URL(request.url).pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", datetime, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
  const dateKey = createHmac("sha256", "AWS4test-secret-access-key").update(date).digest();
  const regionKey = createHmac("sha256", dateKey).update("us-east-1").digest();
  const serviceKey = createHmac("sha256", regionKey).update("s3").digest();
  const signingKey = createHmac("sha256", serviceKey).update("aws4_request").digest();
  assert.equal(signature, createHmac("sha256", signingKey).update(stringToSign).digest("hex"));
});
