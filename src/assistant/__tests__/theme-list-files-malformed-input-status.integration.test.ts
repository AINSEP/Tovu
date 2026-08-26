import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/http-kit";

import { discoverAllBuiltInThemes } from "../../features/theme/index.js";
import { buildThemesRegistrations, type ThemeToolDeps } from "../../features/theme/tool-registrations.js";

/**
 * @file Regression test for the bug report: `theme_list_files` called with a malformed/wrong
 * parameter name (e.g. `theme_id` instead of `themeId`) returned an HTTP 500 through
 * `/api/delegated-tool-calls` — the real transport a spawned agent CLI uses to call this site's
 * tools (`registerDelegatedToolRoutes` in `src/server/agent-daemon/agent-daemon-server.ts`) — instead
 * of a 400. Root cause and fix both live upstream in `@jini-ai/core`/`@jini-ai/daemon`/
 * `@jini-ai/http-kit` (a shared `ToolInputError` marker threading a `ToolExecutionResult.errorKind`
 * through to the wire status), so this test drives the REAL chain end to end — real theme
 * registrations, a real `ToolRegistry`/`ToolExecutor`, and the real `delegatedToolExecuteRoute` — to
 * confirm the fix actually reaches Tovu rather than merely existing at the Jini unit level.
 */

const DECLARATIVE_MANIFEST = JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "declarative", engine: 1 }, null, 2);

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-list-files-status-"));
  const plain = path.join(root, "plain");
  fs.mkdirSync(plain, { recursive: true });
  fs.writeFileSync(path.join(plain, "theme.json"), DECLARATIVE_MANIFEST, "utf8");
  fs.writeFileSync(path.join(plain, "tokens.json"), "{}", "utf8");
  return root;
}

async function buildDelegatedToolDeps() {
  const themesDir = makeThemesRoot();
  const routeDeps: ThemeToolDeps = {
    workspaceId: "ws-1",
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" }),
    themesDir,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  };

  const registry = createToolRegistry();
  for (const registration of buildThemesRegistrations(routeDeps)) registry.register(registration);
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog() });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });

  return { run, lifecycle, toolExecutor, resolvePrincipal: () => ({ id: "principal-1" }) };
}

test("theme_list_files called with a wrong parameter name ('theme_id' instead of 'themeId') is a 400 BAD_REQUEST end to end, not a 500", async () => {
  const { run, lifecycle, toolExecutor, resolvePrincipal } = await buildDelegatedToolDeps();

  const result = await delegatedToolExecuteRoute.handle(
    { runId: run.id, toolUseId: "tu-1", toolId: "theme_list_files", input: { theme_id: "plain" } },
    { lifecycle, toolExecutor, resolvePrincipal },
  );

  assert.deepEqual(result, {
    ok: false,
    error: { code: "BAD_REQUEST", message: "'themeId' (non-empty string) is required" },
  });
});

test("theme_list_files called with themeId missing entirely is also a 400 BAD_REQUEST, not a 500", async () => {
  const { run, lifecycle, toolExecutor, resolvePrincipal } = await buildDelegatedToolDeps();

  const result = await delegatedToolExecuteRoute.handle(
    { runId: run.id, toolUseId: "tu-1", toolId: "theme_list_files", input: {} },
    { lifecycle, toolExecutor, resolvePrincipal },
  );

  assert.deepEqual(result, {
    ok: false,
    error: { code: "BAD_REQUEST", message: "'themeId' (non-empty string) is required" },
  });
});

test("a well-formed theme_list_files call still succeeds end to end (the fix does not break the golden path)", async () => {
  const { run, lifecycle, toolExecutor, resolvePrincipal } = await buildDelegatedToolDeps();

  const result = await delegatedToolExecuteRoute.handle(
    { runId: run.id, toolUseId: "tu-1", toolId: "theme_list_files", input: { themeId: "plain" } },
    { lifecycle, toolExecutor, resolvePrincipal },
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.result, {
      executionId: result.value.result.executionId,
      status: "completed",
      output: { themeId: "plain", files: ["theme.json", "tokens.json"] },
      truncated: false,
    });
  }
});

test("an unknown themeId (a shape rejection decorated with the tool's schema) is ALSO a 400 BAD_REQUEST, not a 500", async () => {
  const { run, lifecycle, toolExecutor, resolvePrincipal } = await buildDelegatedToolDeps();

  const result = await delegatedToolExecuteRoute.handle(
    { runId: run.id, toolUseId: "tu-1", toolId: "theme_list_files", input: { themeId: "nope" } },
    { lifecycle, toolExecutor, resolvePrincipal },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "BAD_REQUEST");
    assert.match(result.error.message, /theme 'nope' was not found/);
  }
});
