/** Pins multipart decoding (repeated names, file identity, empty pickers, limits) and the
 * middleware's 413/400 responses for the public forms endpoint. */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import express from "express";
import { parseFormMultipart, parseFormMultipartMiddleware } from "../forms-multipart.js";
import { startTestServer } from "../../../../../__tests__/helpers/http-test-server.js";

const boundary = "pin-boundary";
const contentType = `multipart/form-data; boundary=${boundary}`;
type Part = { name: string; value: string; filename?: string; type?: string };
const encodeParts = (parts: readonly Part[]): Uint8Array<ArrayBuffer> => new TextEncoder().encode(parts.map(part => {
  const disposition = `form-data; name="${part.name}"${part.filename === undefined ? "" : `; filename="${part.filename}"`}`;
  const type = part.type ? `\r\nContent-Type: ${part.type}` : "";
  return `--${boundary}\r\nContent-Disposition: ${disposition}${type}\r\n\r\n${part.value}\r\n`;
}).join("") + `--${boundary}--\r\n`);

test("a single text control decodes to its string value", async () => {
  assert.deepEqual({ ...await parseFormMultipart({ bytes: encodeParts([{ name: "topic", value: "sales" }]), contentType }) }, { topic: "sales" });
});

test("the decoded body has no prototype, so a control named __proto__ is plain data", async () => {
  const body = await parseFormMultipart({ bytes: encodeParts([{ name: "__proto__", value: "x" }]), contentType });
  assert.equal(Object.getPrototypeOf(body), null);
  assert.equal(body["__proto__"], "x");
});

test("a repeated name becomes an array in submission order, including three or more values", async () => {
  const body = await parseFormMultipart({ bytes: encodeParts([{ name: "c", value: "a" }, { name: "c", value: "b" }, { name: "c", value: "d" }]), contentType });
  assert.deepEqual(body.c, ["a", "b", "d"]);
});

test("a file control decodes to filename, content type and bytes", async () => {
  const body = await parseFormMultipart({ bytes: encodeParts([{ name: "doc", value: "hello", filename: "a.txt", type: "text/plain" }]), contentType });
  assert.deepEqual(body.doc, { filename: "a.txt", contentType: "text/plain", bytes: new TextEncoder().encode("hello") });
});

test("the empty file picker (no filename, no bytes) is skipped", async () => {
  const body = await parseFormMultipart({ bytes: encodeParts([{ name: "picker", value: "", filename: "", type: "application/octet-stream" }]), contentType });
  assert.deepEqual({ ...body }, {});
});

test("a file with an empty filename but some bytes is kept", async () => {
  const body = await parseFormMultipart({ bytes: encodeParts([{ name: "picker", value: "x", filename: "", type: "text/plain" }]), contentType });
  assert.deepEqual(body.picker, { filename: "", contentType: "text/plain", bytes: new TextEncoder().encode("x") });
});

test("a named zero-byte file is kept", async () => {
  const body = await parseFormMultipart({ bytes: encodeParts([{ name: "f", value: "", filename: "empty.png", type: "image/png" }]), contentType });
  assert.deepEqual(body.f, { filename: "empty.png", contentType: "image/png", bytes: new Uint8Array() });
});

test("a body over 12 MiB is refused with a RangeError before parsing", async () => {
  await assert.rejects(parseFormMultipart({ bytes: new Uint8Array(12 * 1024 * 1024 + 1), contentType }), { name: "RangeError", message: "form upload exceeds 12 MB" });
});

test("exactly 12 MiB is not refused for size", async () => {
  await assert.rejects(parseFormMultipart({ bytes: new Uint8Array(12 * 1024 * 1024), contentType }), (error: Error) => error.name !== "RangeError");
});

test("more than 2000 controls is refused with a RangeError", async () => {
  const parts = Array.from({ length: 2001 }, (_, index) => ({ name: `f${index}`, value: "v" }));
  await assert.rejects(parseFormMultipart({ bytes: encodeParts(parts), contentType }), { name: "RangeError", message: "too many form controls" });
});

test("exactly 2000 controls is accepted", async () => {
  const parts = Array.from({ length: 2000 }, (_, index) => ({ name: `f${index}`, value: "v" }));
  assert.equal(Object.keys(await parseFormMultipart({ bytes: encodeParts(parts), contentType })).length, 2000);
});

test("multipart without a boundary is refused by the parser with a TypeError", async () => {
  await assert.rejects(parseFormMultipart({ bytes: encodeParts([{ name: "a", value: "b" }]), contentType: "multipart/form-data" }), { name: "TypeError" });
});

async function middlewareServer(t: TestContext) {
  const app = express();
  app.post("/form", express.raw({ type: () => true, limit: "20mb" }), parseFormMultipartMiddleware, (req, res) => {
    res.json({ body: Buffer.isBuffer(req.body) ? `buffer:${req.body.toString()}` : req.body });
  });
  const baseUrl = await startTestServer(app, t);
  return (body: Uint8Array<ArrayBuffer> | string, type: string) => fetch(`${baseUrl}/form`, { method: "POST", headers: { "content-type": type }, body });
}

test("middleware leaves a non-multipart request body untouched", async t => {
  const post = await middlewareServer(t);
  const response = await post("a=1", "application/x-www-form-urlencoded");
  assert.deepEqual(await response.json(), { body: "buffer:a=1" });
});

test("middleware replaces a multipart body with the decoded controls", async t => {
  const post = await middlewareServer(t);
  const response = await post(encodeParts([{ name: "topic", value: "sales" }]), contentType);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { body: { topic: "sales" } });
});

test("middleware answers 413 for an oversized multipart body", async t => {
  const post = await middlewareServer(t);
  const response = await post(new Uint8Array(12 * 1024 * 1024 + 1), contentType);
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { code: "FORMS_SUBMISSION_VALIDATION_ERROR", error: "invalid or oversized multipart form" });
});

test("middleware answers 400 for malformed multipart", async t => {
  const post = await middlewareServer(t);
  const response = await post("not multipart", contentType);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: "FORMS_SUBMISSION_VALIDATION_ERROR", error: "invalid or oversized multipart form" });
});
