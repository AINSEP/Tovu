import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { mock } from "node:test";

/**
 * @file The real `createSiteRouteDeps` composition's chat-orphan boot warning: when the orphan count
 * on a SQLite site fails, the composition logs one line and still finishes. Only the counting
 * collaborator is replaced (`mock.module`, registered before `deps.ts` loads); the composition, the
 * store and the logger are real. The sibling `create-sqlite-route-deps-for-workspace` file pins the
 * same function's text with injected ports; this file proves the bound composition calls it.
 */

const counted: Array<{ contentDbPath: string; chatDbPath: string }> = [];
const orphanCheckUrl = new URL("../../../platform/db/sqlite/chat-orphan-check.ts", import.meta.url).href;
// The table-name list the backup and migration modules read stays real.
const realOrphanCheck = await import(orphanCheckUrl);
mock.module(orphanCheckUrl, { namedExports: {
  ...realOrphanCheck,
  warnOnOrphanedChatRows: async ({ contentDbPath, chatDbPath }: { contentDbPath: string; chatDbPath: string }) => {
    counted.push({ contentDbPath, chatDbPath });
    throw new Error("chat.db is locked");
  },
} });
// Loaded after the mock: a static import would bind the real collaborator first.
const { createSiteRouteDeps } = await import("../../runtime/composition/deps.js");
const { drainBootReadiness } = await import("../helpers/unrun-site-boot.js");

test("a SQLite composition whose chat-orphan count fails logs that failure once and still returns working deps", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-chat-orphan-warning-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, "content.db");
  const errors: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(" ")); };
  let deps: Awaited<ReturnType<typeof createSiteRouteDeps>>;
  try {
    deps = await createSiteRouteDeps({}, { dbPath });
  } finally {
    console.error = realError;
  }
  await drainBootReadiness(deps);

  assert.deepEqual(counted, [{ contentDbPath: dbPath, chatDbPath: path.join(dir, "chat.db") }]);
  assert.deepEqual(errors.filter((line) => line.includes("warnOnOrphanedChatRows")),
    ["warnOnOrphanedChatRows failed at boot: chat.db is locked"]);
  assert.equal(deps.workspaceId, "workspace-local", "the failed warning never stops the boot");
});
