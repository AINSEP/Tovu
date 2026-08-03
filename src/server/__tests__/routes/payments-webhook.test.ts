/**
 * @file Route-level tests for `POST /payments/webhook/:providerId` against the REAL `createApp()`.
 *
 * The point of using the real app rather than a minimal standalone Express instance: the whole
 * design problem is that `app.ts` mounts a blanket `express.json({ limit: "15mb" })` ahead of route
 * registration, which parses the body and discards the bytes an HMAC is computed over. A test that
 * built its own app without that parser would prove nothing. These tests send genuinely signed
 * bytes through the app that HAS the blanket parser mounted, so a regression in registration order
 * fails here immediately.
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/http/index";
import { InMemoryPaymentCredentials } from "#src/features/plugins/lipay/credentials";
import { activateLipay, type LipayApi } from "#src/features/plugins/lipay/lipay-plugin";
import { createLipayGateway, signLipayWebhook } from "#src/features/plugins/lipay/providers/lipay-gateway";
import { createApp, createRouteDeps } from "../../app";

const WORKSPACE_ID = "workspace-1";
const WEBHOOK_SECRET = "whsec_route_test";

class ScriptedHttpClient implements HttpClientPort {
  constructor(private readonly responses: readonly HttpResponse[]) {}
  private cursor = 0;
  async send(_request: HttpRequest): Promise<HttpResponse> {
    const entry = this.responses[Math.min(this.cursor, this.responses.length - 1)];
    this.cursor += 1;
    return entry;
  }
}

async function makeFixture(): Promise<{ lipay: LipayApi; paymentId: string; db: Database.Database; dir: string; now: number }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-lipay-route-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");

  const now = Date.now();
  let n = 0;
  const lipay = await activateLipay({
    db,
    dbPath,
    workspaceId: WORKSPACE_ID,
    httpClient: new ScriptedHttpClient([
      { status: 200, headers: {}, bodyText: JSON.stringify({ id: "ch_1", status: "pending", next_action: { type: "none" } }) },
    ]),
    credentials: new InMemoryPaymentCredentials({ lipay: { secretKey: "sk_route_test", webhookSecret: WEBHOOK_SECRET } }),
    providers: [createLipayGateway({ apiBaseUrl: "https://lipay.test" })],
    clock: { now: () => now },
    idGen: { newId: () => `route-${(n += 1)}` },
    webhookBaseUrl: "https://site.test",
    returnUrl: "https://site.test/return",
  });

  const charged = await lipay.charge({
    workspaceId: WORKSPACE_ID,
    providerId: "lipay",
    amount: { minorUnits: 4200, currency: "USD" },
    idempotencyKey: "order-1",
  });
  if (!charged.ok) throw new Error("charge fixture failed");

  return { lipay, paymentId: charged.payment.id, db, dir, now };
}

async function withServer<T>(lipay: LipayApi, run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = createApp({ ...createRouteDeps(), lipay });
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function signedDelivery(body: unknown, timestampSeconds: number): { raw: Buffer; signature: string } {
  const raw = Buffer.from(JSON.stringify(body), "utf8");
  return { raw, signature: signLipayWebhook({ secret: WEBHOOK_SECRET, rawBody: raw, timestampSeconds }) };
}

function cleanup(db: Database.Database, dir: string): void {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

test("payments webhook: a real HMAC-signed request validates through the app that mounts express.json", async () => {
  const { lipay, paymentId, db, dir, now } = await makeFixture();
  const seconds = Math.floor(now / 1000);
  const { raw, signature } = signedDelivery(
    { id: "evt_1", type: "charge.succeeded", created: seconds, data: { id: "ch_1", amount: 4200, currency: "USD" } },
    seconds
  );

  const status = await withServer(lipay, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/payments/webhook/lipay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-lipay-signature": signature },
      body: raw,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { processed: 1, duplicates: 0 });
    return lipay.getPayment({ workspaceId: WORKSPACE_ID, id: paymentId })?.status;
  });

  assert.equal(status, "succeeded");
  cleanup(db, dir);
});

test("payments webhook: a body tampered with after signing is rejected with 401", async () => {
  const { lipay, paymentId, db, dir, now } = await makeFixture();
  const seconds = Math.floor(now / 1000);
  const { raw, signature } = signedDelivery(
    { id: "evt_1", type: "charge.succeeded", created: seconds, data: { id: "ch_1", amount: 4200, currency: "USD" } },
    seconds
  );
  const tampered = Buffer.from(raw.toString("utf8").replace('"amount":4200', '"amount":1'), "utf8");
  assert.notEqual(tampered.toString("utf8"), raw.toString("utf8"));

  const status = await withServer(lipay, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/payments/webhook/lipay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-lipay-signature": signature },
      body: tampered,
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, "SIGNATURE_INVALID");
    return lipay.getPayment({ workspaceId: WORKSPACE_ID, id: paymentId })?.status;
  });

  assert.equal(status, "pending");
  cleanup(db, dir);
});

test("payments webhook: byte-identical JSON that differs only in key order and whitespace still verifies", async () => {
  // This is the failure mode the raw-body fix exists for: `express.json()` reparses the body, and
  // any re-serialization reorders keys and drops whitespace, so an HMAC over the reserialized form
  // would not match. Sending deliberately unusual formatting proves the original bytes survived.
  const { lipay, db, dir, now } = await makeFixture();
  const seconds = Math.floor(now / 1000);
  const raw = Buffer.from(
    `{\n  "data" : { "currency":"USD", "amount":4200, "id":"ch_1" },\n  "created":${seconds},\n  "type":"charge.succeeded",\n  "id":"evt_1"\n}`,
    "utf8"
  );
  const signature = signLipayWebhook({ secret: WEBHOOK_SECRET, rawBody: raw, timestampSeconds: seconds });

  await withServer(lipay, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/payments/webhook/lipay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-lipay-signature": signature },
      body: raw,
    });
    assert.equal(response.status, 200, "the exact bytes must reach the verifier, not a reserialized copy");
  });

  cleanup(db, dir);
});

test("payments webhook: a redelivery is acknowledged as a duplicate, not applied twice", async () => {
  const { lipay, db, dir, now } = await makeFixture();
  const seconds = Math.floor(now / 1000);
  const { raw, signature } = signedDelivery(
    { id: "evt_1", type: "charge.succeeded", created: seconds, data: { id: "ch_1" } },
    seconds
  );

  await withServer(lipay, async (baseUrl) => {
    const send = () =>
      fetch(`${baseUrl}/payments/webhook/lipay`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-lipay-signature": signature },
        body: raw,
      });

    assert.deepEqual(await (await send()).json(), { processed: 1, duplicates: 0 });
    assert.deepEqual(await (await send()).json(), { processed: 0, duplicates: 1 });
  });

  cleanup(db, dir);
});

test("payments webhook: an unregistered provider is a 404 and an unsigned request a 401", async () => {
  const { lipay, db, dir } = await makeFixture();

  await withServer(lipay, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/payments/webhook/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).code, "PROVIDER_NOT_REGISTERED");

    const unsigned = await fetch(`${baseUrl}/payments/webhook/lipay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(unsigned.status, 401);
  });

  cleanup(db, dir);
});

test("payments webhook: an install without lipay composed reports 503 rather than 404", async () => {
  // `createRouteDeps()` (the hermetic in-memory composition) has no lipay, and the route is
  // registered unconditionally — so the honest answer is "not configured here", not "no such route".
  const app = createApp();
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/payments/webhook/lipay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "PAYMENTS_UNAVAILABLE");
  } finally {
    server.close();
    await once(server, "close");
  }
});
