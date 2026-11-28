import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { MediaOriginalReply } from "@jini-ai/cms/media";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { sendMediaOriginalTrashed, writeMediaOriginalReply } from "../media-original-writer.js";

test("an original reply is written verbatim: status, every header, then the exact body bytes", async t => {
  const app = express();
  const partial: MediaOriginalReply = { status: 206,
    headers: [["Content-Type", "image/png"], ["Content-Range", "bytes 0-3/9"], ["Cache-Control", "private, max-age=60"]],
    body: Uint8Array.from([137, 80, 78, 71]) };
  const unsatisfiable: MediaOriginalReply = { status: 416, headers: [["Content-Range", "bytes */9"]], body: null };
  app.get("/full", (_req, res) => writeMediaOriginalReply({ res, reply: partial }));
  app.get("/range", (_req, res) => writeMediaOriginalReply({ res, reply: unsatisfiable }));
  const origin = await startTestServer(app, t);
  const full = await fetch(`${origin}/full`);
  assert.equal(full.status, 206);
  assert.equal(full.headers.get("content-type"), "image/png");
  assert.equal(full.headers.get("content-range"), "bytes 0-3/9");
  assert.equal(full.headers.get("cache-control"), "private, max-age=60");
  assert.deepEqual([...new Uint8Array(await full.arrayBuffer())], [137, 80, 78, 71]);
  const range = await fetch(`${origin}/range`);
  assert.equal(range.status, 416);
  assert.equal(range.headers.get("content-range"), "bytes */9");
  assert.equal((await range.arrayBuffer()).byteLength, 0, "a reply without a body ends empty");
});

test("a trashed original is 410 Gone, never cached, with no body", async t => {
  const app = express();
  app.get("/gone", (_req, res) => sendMediaOriginalTrashed({ res }));
  const origin = await startTestServer(app, t);
  const gone = await fetch(`${origin}/gone`);
  assert.equal(gone.status, 410);
  assert.equal(gone.headers.get("cache-control"), "no-store");
  assert.equal(await gone.text(), "");
});
