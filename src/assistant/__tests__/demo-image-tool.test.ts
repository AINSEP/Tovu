import assert from "node:assert/strict";
import test from "node:test";
import { inflateSync } from "node:zlib";

import type { ToolRegistration } from "@jini-ai/cms/core";

import { DEMO_IMAGE_TOOL_ID, buildDemoImageRegistrations, demoImageAgentToolCatalog, demoImageDerivedRisk } from "../demo-image-tool.js";

/**
 * @file The typed-media path's one real Tovu tool, proven at the handler boundary: a `content`
 * envelope carrying a well-formed `{type:'image', mimeType, data}` block whose `data` is a real,
 * decodable PNG — not merely a plausible-looking base64 string.
 */

/** Enables the env-gated demo tool for one builder call, then restores the environment — same
 *  pattern as `demo-choices-tool.test.ts`'s own `buildHandler`. */
function buildHandler(): ToolHandlerUnderTest {
  const previous = process.env["TOVU_ENABLE_DEMO_TOOLS"];
  process.env["TOVU_ENABLE_DEMO_TOOLS"] = "1";
  let registrations: ToolRegistration[];
  try {
    registrations = buildDemoImageRegistrations();
  } finally {
    if (previous === undefined) delete process.env["TOVU_ENABLE_DEMO_TOOLS"];
    else process.env["TOVU_ENABLE_DEMO_TOOLS"] = previous;
  }
  const registration = registrations.find((r) => r.descriptor.id === DEMO_IMAGE_TOOL_ID);
  assert.ok(registration, "the demo tool must be wired when its env gate is set");
  return registration.handler as ToolHandlerUnderTest;
}

type ToolHandlerUnderTest = (ctx: {
  executionId: string;
  principal: { id: string };
  run: { id: string };
  input: unknown;
  signal: AbortSignal;
}) => Promise<{ content: Array<{ type: string; text?: string; mimeType?: string; data?: string }> }>;

function call(handler: ToolHandlerUnderTest) {
  return handler({
    executionId: "exec-1",
    principal: { id: "principal-1" },
    run: { id: "run-1" },
    input: {},
    signal: new AbortController().signal,
  });
}

test("the tool stays unwired when its env gate is unset", () => {
  const previous = process.env["TOVU_ENABLE_DEMO_TOOLS"];
  delete process.env["TOVU_ENABLE_DEMO_TOOLS"];
  try {
    assert.deepEqual(buildDemoImageRegistrations(), []);
  } finally {
    if (previous !== undefined) process.env["TOVU_ENABLE_DEMO_TOOLS"] = previous;
  }
});

test("returns a text block and a well-formed image block", async () => {
  const handler = buildHandler();
  const result = await call(handler);

  assert.equal(result.content.length, 2);
  assert.equal(result.content[0]?.type, "text");
  assert.match(result.content[0]?.text ?? "", /PNG color swatch/);
  assert.equal(result.content[1]?.type, "image");
  assert.equal(result.content[1]?.mimeType, "image/png");
  assert.equal(typeof result.content[1]?.data, "string");
});

test("the image block's data is a real, decodable PNG — not a stub string", async () => {
  const handler = buildHandler();
  const result = await call(handler);
  const data = result.content[1]?.data;
  assert.ok(data, "expected an image block with data");

  const png = Buffer.from(data, "base64");
  assert.deepEqual(png.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "PNG signature");

  // IHDR immediately follows the signature: length(4) + "IHDR"(4) + 13 bytes of header data.
  const ihdr = png.subarray(16, 16 + 13);
  assert.equal(ihdr.readUInt32BE(0), 64, "width");
  assert.equal(ihdr.readUInt32BE(4), 64, "height");

  // IDAT follows IHDR's 13-byte data + 4-byte CRC, at a fixed offset for this known header size.
  const idatStart = 8 + (8 + 13 + 4);
  const idatLength = png.readUInt32BE(idatStart);
  const idat = png.subarray(idatStart + 8, idatStart + 8 + idatLength);
  const raw = inflateSync(idat); // throws if the deflate stream — and therefore the whole file — is not real
  assert.equal(raw.length, (1 + 64 * 3) * 64);
});

test("two calls produce byte-identical images — the swatch is deterministic, not randomly generated", async () => {
  const handler = buildHandler();
  const [first, second] = await Promise.all([call(handler), call(handler)]);
  assert.equal(first.content[1]?.data, second.content[1]?.data);
});

test("the catalog entry publishes an empty-object inputSchema — the model must call it with no arguments", () => {
  const entry = demoImageAgentToolCatalog.find((e) => e.name === DEMO_IMAGE_TOOL_ID);
  assert.ok(entry);
  assert.deepEqual(entry.inputSchema, { type: "object", additionalProperties: false, properties: {} });
});

test("the risk classification declares no side effects", () => {
  assert.equal(demoImageDerivedRisk.get(DEMO_IMAGE_TOOL_ID), "none");
});
