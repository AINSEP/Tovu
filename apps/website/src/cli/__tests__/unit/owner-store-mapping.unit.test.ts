import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { mapOwnerApiKey } from "../../commands/owner-store-mapping.js";

test("a legacy GitHub key cannot import when the bundled provider is absent", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "owner-store-mapping-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const old = process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR;
  process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR = root;
  t.after(() => {
    if (old === undefined) delete process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR;
    else process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR = old;
  });
  await assert.rejects(mapOwnerApiKey({
    row: { kind: "source-control", provider: "github", label: "Old GitHub", meta: {} },
    payload: { token: "fixture-key-not-for-output" },
  }), {
    name: "ToolInputError",
    message: "This older source-control key cannot be imported. Save a replacement in Shared Keys. Details: P25_IMPORT_SOURCE_CONTROL_PAYLOAD; secret values omitted.",
  });
});
