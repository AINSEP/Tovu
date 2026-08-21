import assert from "node:assert/strict";
import test from "node:test";

/**
 * `MCP_UI_REDEEMABLE_TOOL_IDS` (`../mcp-ui-tool-calls.ts`) builds `assistant_demo_choices`'s
 * membership ONCE, at module-import time, from `demoToolsEnabled()` — unlike `demo-choices-tool.ts`'s
 * own env-gated functions, which re-read `process.env` on every call. `mcp-ui-tool-calls.test.ts`
 * imports the module statically (before any test body runs), so that file can only ever observe
 * whatever `TOVU_ENABLE_DEMO_TOOLS` was at process start — it is a separate file (and, under `node
 * --test`'s default per-file process isolation, a separate module registry) so it can set the env var
 * and use a DYNAMIC import, which runs at the point it's awaited rather than being hoisted ahead of
 * that assignment.
 */
test("assistant_demo_choices joins the allowlist only when TOVU_ENABLE_DEMO_TOOLS was set before the module first loaded", async () => {
  const previous = process.env["TOVU_ENABLE_DEMO_TOOLS"];
  process.env["TOVU_ENABLE_DEMO_TOOLS"] = "1";
  try {
    const { isMcpUiToolCallAllowed, MCP_UI_REDEEMABLE_TOOL_IDS } = await import("../mcp-ui-tool-calls.js");
    assert.equal(isMcpUiToolCallAllowed("assistant_demo_choices"), true);
    assert.ok(MCP_UI_REDEEMABLE_TOOL_IDS.has("assistant_demo_choices"));
  } finally {
    if (previous === undefined) delete process.env["TOVU_ENABLE_DEMO_TOOLS"];
    else process.env["TOVU_ENABLE_DEMO_TOOLS"] = previous;
  }
});
