import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { DEFAULT_MAX_READ_BYTES } from "@jini-ai/cli";

import { ValidationError } from "../../../platform/site-dir/errors.js";
import { readStdinOrRefuse } from "../stdin-input.js";

test("over-cap stdin yields a flag-specific ValidationError without stream text", async () => {
  for (const flag of ["--agent-plugin-tokens-stdin", "--create-input-stdin"]) {
    const input = new PassThrough();
    const reading = readStdinOrRefuse({ input }, { flag });
    input.end(Buffer.alloc(DEFAULT_MAX_READ_BYTES + 1, "private-stream-text"));
    await assert.rejects(reading, (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.message, `init: ${flag} payload is too large`);
      assert.equal(error.message.includes("private-stream-text"), false);
      return true;
    });
  }
});

test("non-cap stream errors pass through unchanged", async () => {
  const input = new PassThrough();
  const failure = new Error("stream failed");
  const reading = readStdinOrRefuse({ input }, { flag: "--create-input-stdin" });
  input.destroy(failure);
  await assert.rejects(reading, (error: unknown) => error === failure);
});
