import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { readRequestFacts, JINI_REQUEST_FACTS } from "@jini-ai/core/contracts/site/request-facts";
import { captureRequestFacts, requestFactsLocals } from "../request-facts.js";

type Trust = "loopback" | 1 | null;
const PEER = /(^|:)127\.0\.0\.1$/;

/** The facts a real Express app (with this trust-proxy setting) computes for one request. */
async function factsFor(t: test.TestContext, { trust, headers }: { trust: Trust; headers: Record<string, string> }) {
  const app = express();
  if (trust !== null) app.set("trust proxy", trust);
  app.get("/facts", (req, res) => { res.json(captureRequestFacts({ req })); });
  const base = await startTestServer(app, t);
  return await (await fetch(`${base}/facts?tabId=a`, { headers })).json() as { clientAddress: string; servingProtocol: string; secure: boolean; query: unknown };
}

// Pin A4: the three facts are three different answers; none is derived from another or from the socket peer.
const rows: ReadonlyArray<{ name: string; trust: Trust; headers: Record<string, string>; address: string | typeof PEER; servingProtocol: string; secure: boolean }> = [
  { name: "no trust, spoofed forwarded-for, no proto", trust: null, headers: { "x-forwarded-for": "203.0.113.5" }, address: PEER, servingProtocol: "http", secure: false },
  { name: "no trust + https: the serving protocol follows the header, secure does not", trust: null, headers: { "x-forwarded-proto": "https" }, address: PEER, servingProtocol: "https", secure: false },
  { name: "no trust + HTTPS,http", trust: null, headers: { "x-forwarded-proto": "HTTPS,http" }, address: PEER, servingProtocol: "https", secure: false },
  { name: "trust 1 + one hop + https", trust: 1, headers: { "x-forwarded-for": "203.0.113.5", "x-forwarded-proto": "https" }, address: "203.0.113.5", servingProtocol: "https", secure: true },
  { name: "trust 1 + two hops: the rightmost is the client", trust: 1, headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.5" }, address: "203.0.113.5", servingProtocol: "http", secure: false },
  { name: "trust 1 + HTTPS,http: serving protocol https, secure false", trust: 1, headers: { "x-forwarded-for": "203.0.113.5", "x-forwarded-proto": "HTTPS,http" }, address: "203.0.113.5", servingProtocol: "https", secure: false },
  { name: "trust 1 + wss: neither http nor https, so Express's own answer, and not secure", trust: 1, headers: { "x-forwarded-for": "203.0.113.5", "x-forwarded-proto": "wss" }, address: "203.0.113.5", servingProtocol: "wss", secure: false },
  { name: "trust 1, no forwarded-for: the peer is the client", trust: 1, headers: { "x-forwarded-proto": "https" }, address: PEER, servingProtocol: "https", secure: true },
  { name: "trust loopback + https", trust: "loopback", headers: { "x-forwarded-for": "203.0.113.5", "x-forwarded-proto": "https" }, address: "203.0.113.5", servingProtocol: "https", secure: true },
];
for (const row of rows) test(`request facts pin: ${row.name}`, async t => {
  const facts = await factsFor(t, row);
  if (typeof row.address === "string") assert.equal(facts.clientAddress, row.address); else assert.match(facts.clientAddress, row.address);
  assert.equal(facts.servingProtocol, row.servingProtocol);
  assert.equal(facts.secure, row.secure);
  assert.deepEqual(facts.query, { tabId: "a" });
});

test("request facts: they are the same answers the hooks computed before (the existing functions, called unchanged)", async t => {
  const app = express();
  app.set("trust proxy", 1);
  const seen: unknown[] = [];
  app.get("/facts", (req, res) => { seen.push(requestFactsLocals({ req }, { base: { kept: 1 } })); res.end(); });
  await fetch(`${await startTestServer(app, t)}/facts`, { headers: { "x-forwarded-for": "203.0.113.5" } });
  const [locals] = seen as Record<string, unknown>[];
  assert.equal(locals!.kept, 1);
  assert.equal(readRequestFacts({ locals: locals! }).clientAddress, "203.0.113.5");
});

test("request facts: absent or malformed facts throw, and there is no default address", () => {
  for (const locals of [{}, { [JINI_REQUEST_FACTS]: null }, { [JINI_REQUEST_FACTS]: { clientAddress: "x" } }, { [JINI_REQUEST_FACTS]: { clientAddress: "x", servingProtocol: "http", secure: "yes", query: {} } }]) {
    assert.throws(() => readRequestFacts({ locals }), /request facts are missing/);
  }
});
