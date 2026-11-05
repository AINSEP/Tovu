import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { InMemoryMemberRepo, InMemoryMemberSessionRepo } from "#src/features/members/repo.memory";
import { registerCommerceRoutes, type CommerceHttpDeps } from "../purchase.js";

const now = "2026-11-05T18:00:00.000Z";

async function fixture(t: test.TestContext) {
  const memberRepo = new InMemoryMemberRepo();
  const memberSessionRepo = new InMemoryMemberSessionRepo();
  const member = { id: "buyer", workspaceId: "shop", email: "buyer@example.test", status: "active" as const,
    createdAt: now, updatedAt: now, version: 1 };
  await memberRepo.save(member);
  const session = { id: "session", workspaceId: "shop", memberId: member.id,
    tokenHash: createHash("sha256").update("buyer-token").digest("hex"), createdAt: now,
    expiresAt: "2026-11-06T18:00:00.000Z" };
  await memberSessionRepo.save(session);
  const calls: Array<{ action: string; input: unknown }> = [];
  const commerce = {
    status: async () => ({ active: true, ready: true, reason: null }),
    activate: async () => ({ active: true, ready: true, reason: null }),
    checkoutOrigin: async () => base,
    createOrder: async (input: { memberId: string; priceId: string; quantity?: number }) => {
      calls.push({ action: "create", input }); return { order: { id: "order-one", status: "pending" } };
    },
    pay: async (input: { memberId: string; orderId: string }) => {
      calls.push({ action: "pay", input }); return { order: { id: input.orderId, status: "pending" }, payment: { status: "pending" } };
    },
    readOrder: async (input: { memberId: string; orderId: string }) => {
      calls.push({ action: "read", input }); return { order: { id: input.orderId, status: "pending" }, payment: { status: "pending" } };
    },
  };
  const deps: CommerceHttpDeps = { workspaceId: "shop", clock: { nowMs: () => Date.parse(now), nowIso: () => now },
    memberRepo, memberSessionRepo, commerce };
  const app = express(); app.use(express.json({ limit: "4kb" }));
  registerCommerceRoutes({ app, deps });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, body?: unknown, cookie = "tovu_member_session=buyer-token", origin = base) => fetch(base + path, {
    method: body === undefined ? "GET" : "POST", headers: { cookie, origin, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { deps, member, session, calls, request, memberRepo, memberSessionRepo };
}

const orders = "/api/commerce/v1/workspaces/shop/orders";

test("purchase uses the authenticated member and resumes the same order id", async t => {
  const f = await fixture(t);
  assert.equal((await f.request(orders, { priceId: "price-one", quantity: 2 })).status, 201);
  assert.equal((await f.request(`${orders}/order-one/pay`, {})).status, 200);
  assert.equal((await f.request(`${orders}/order-one/pay`, {})).status, 200);
  assert.deepEqual(f.calls, [
    { action: "create", input: { memberId: "buyer", priceId: "price-one", quantity: 2 } },
    { action: "pay", input: { memberId: "buyer", orderId: "order-one" } },
    { action: "pay", input: { memberId: "buyer", orderId: "order-one" } },
  ]);
});

test("foreign workspace, forged member/scope/return URL, bad input and cross-origin writes never reach commerce", async t => {
  const f = await fixture(t);
  assert.equal((await f.request(orders.replace("shop", "foreign"), { priceId: "price-one" })).status, 404);
  for (const body of [{ priceId: "p", memberId: "victim" }, { priceId: "p", providerAccountId: "other" },
    { priceId: "p", mode: "live" }, { priceId: "p", returnUrl: "https://evil.test" },
    { priceId: "p", quantity: 0 }, { priceId: "p", quantity: 101 }, { priceId: "p", quantity: 1.5 },
    { priceId: "" }, { priceId: "x".repeat(257) }, { priceId: ["p"] }]) {
    assert.equal((await f.request(orders, body)).status, 400);
  }
  assert.equal((await f.request(orders, { priceId: "p" }, undefined, "https://evil.test")).status, 403);
  assert.equal((await f.request(`${orders}/order-one/pay`, { paid: true })).status, 400);
  assert.deepEqual(f.calls, []);
});

test("anonymous, operator, duplicate-cookie, disabled, revoked and expired sessions cannot purchase", async t => {
  const f = await fixture(t);
  for (const cookie of ["", "tovu_session=operator", "tovu_member_session=buyer-token; tovu_member_session=buyer-token"]) {
    assert.equal((await f.request(orders, { priceId: "p" }, cookie)).status, 401);
  }
  await f.memberRepo.save({ ...f.member, status: "disabled", version: 2 });
  assert.equal((await f.request(orders, { priceId: "p" })).status, 401);
  await f.memberRepo.save({ ...f.member, version: 3 });
  await f.memberSessionRepo.save({ ...f.session, revokedAt: now });
  assert.equal((await f.request(orders, { priceId: "p" })).status, 401);
  await f.memberSessionRepo.save({ ...f.session, expiresAt: now });
  assert.equal((await f.request(orders, { priceId: "p" })).status, 401);
  assert.deepEqual(f.calls, []);
});

test("return and cancel pages read owned ledger truth; a forged paid query cannot mutate it", async t => {
  const f = await fixture(t);
  for (const page of ["return", "cancel"]) {
    const response = await f.request(`/commerce/${page}?orderId=order-one&paid=true&session_id=forged`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).order.status, "pending");
  }
  assert.deepEqual(f.calls.map(c => c.action), ["read", "read"]);
});

test("disabled commerce rejects new purchases without invoking it", async t => {
  const f = await fixture(t); f.deps.commerce = undefined;
  assert.equal((await f.request(orders, { priceId: "p" })).status, 503);
  assert.deepEqual(f.calls, []);
});

test("desktop requests use the configured deployed shop for payment acceptance", async t => {
  const f = await fixture(t);
  f.deps.commerce!.checkoutOrigin = async () => "https://deployed-shop.example.test";
  const response = await f.request(orders, { priceId: "p" });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "DEPLOYED_SHOP_REQUIRED");
  assert.deepEqual(f.calls, []);
});

test("purchase requests use a bounded shared rate budget", async t => {
  const f = await fixture(t);
  for (let i = 0; i < 12; i++) assert.equal((await f.request(`${orders}/order-one/pay`, {})).status, 200);
  const limited = await f.request(`${orders}/order-one/pay`, {});
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal(f.calls.length, 12);
});
