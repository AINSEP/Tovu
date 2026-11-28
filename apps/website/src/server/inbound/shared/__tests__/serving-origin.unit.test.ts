import assert from "node:assert/strict";
import test from "node:test";
import express, { type Request } from "express";
import { dispatchHttpRequest } from "#src/server/__tests__/helpers/in-process-http";
import { servingOriginFor } from "../serving-origin.js";

/**
 * @file `servingOriginFor`: the origin a request was served from, through a real Express app so the
 * app's own `trust proxy` setting decides whether forwarded headers count.
 */

async function originOf({ trustProxy, headers }: { trustProxy: boolean; headers: Record<string, string> }): Promise<string | null> {
  const app = express();
  app.set("trust proxy", trustProxy);
  app.get("/origin", (req, res) => { res.json({ origin: servingOriginFor({ req }) ?? null }); });
  const response = await dispatchHttpRequest({ app, method: "GET", url: "/origin", headers });
  assert.equal(response.status, 200);
  return (JSON.parse(response.body) as { origin: string | null }).origin;
}

test("an untrusted proxy's forwarded host and scheme are ignored; the Host header keeps its port", async () => {
  assert.equal(await originOf({ trustProxy: false, headers: { host: "shop.example:8443", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" } }), "http://shop.example:8443");
});

test("a trusted proxy's first forwarded host and scheme win, trimmed, with its port", async () => {
  assert.equal(await originOf({ trustProxy: true, headers: { host: "internal:3000", "x-forwarded-host": " public.example:444 , second.example", "x-forwarded-proto": "https" } }), "https://public.example:444");
  assert.equal(await originOf({ trustProxy: true, headers: { host: "internal:3000" } }), "http://internal:3000");
});

test("a Host that cannot form a URL, or no Host at all, yields no origin instead of failing", async () => {
  assert.equal(await originOf({ trustProxy: false, headers: { host: "bad host" } }), null);
  assert.equal(await originOf({ trustProxy: false, headers: { host: "" } }), null);
});

test("a hand-built request without Express's app or socket reads its Host; one without a header reader has no origin", () => {
  const headers: Record<string, string> = { host: "direct.example:81", "x-forwarded-host": "ignored.example" };
  const bare = { protocol: "http", get: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
  assert.equal(servingOriginFor({ req: bare }), "http://direct.example:81");
  assert.equal(servingOriginFor({ req: { protocol: "http" } as unknown as Request }), undefined);
});
