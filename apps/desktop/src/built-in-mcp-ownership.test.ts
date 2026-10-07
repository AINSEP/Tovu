import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildServeEnv } from "./tovu-server.ts";
import { SITES_MCP_SERVER_ID } from "./sites-mcp-registration.ts";

test("desktop declares ownership using the same id its registration source uses", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-mcp-owner-"));
  try {
    const env = buildServeEnv({ repoRoot: root, baseEnv: { TOVU_BUILT_IN_MCP_SERVER_IDS: '["unrelated-inherited-value"]' } });
    assert.deepEqual(JSON.parse(env.TOVU_BUILT_IN_MCP_SERVER_IDS!), [SITES_MCP_SERVER_ID]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
