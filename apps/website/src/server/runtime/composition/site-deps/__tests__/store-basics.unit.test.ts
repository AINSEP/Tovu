import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { composeStoreBasics } from "../store-basics.js";

/**
 * @file The two closures `composeStoreBasics` builds that the default boot never runs: the boot-time
 * post-search backfill's failure handler (logs, never rejects `postSearchBackfillReady`) and the tool
 * audit reporter's log sink (the redacted entry goes to `console.error` under `[tool-audit]`, keyed by
 * the same error id the caller is handed). Driven through the composed results over a real content db.
 */

const layout = { forWorkspace: ({ workspaceId }: { workspaceId: string }) => ({ root: `/roots/${workspaceId}` }) };
type Layout = Parameters<typeof composeStoreBasics>[0]["agentPluginLayout"];

test("a failing boot backfill is logged with its message and postSearchBackfillReady still resolves", async (t) => {
  const errors = mock.method(console, "error", () => {});
  t.after(() => errors.mock.restore());
  const db = openContentDb(":memory:");
  const kernel = contentKernel({ store: db });
  db.$client.close();
  const basics = composeStoreBasics({ kernel, workspaceId: "site-7", agentPluginLayout: layout as unknown as Layout });
  assert.equal(await basics.postSearchBackfillReady, undefined);
  const lines = errors.mock.calls.map((call) => String(call.arguments[0]));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^preparePostSearchIndex failed at boot: \S/);
  assert.match(lines[0], /database connection is not open/);
});

test("reportToolAuditError logs the redacted diagnostic under [tool-audit] with the returned error id", async (t) => {
  const kernel = contentKernel({ store: openContentDb(":memory:") });
  const basics = composeStoreBasics({ kernel, workspaceId: "site-7", agentPluginLayout: layout as unknown as Layout });
  await basics.postSearchBackfillReady;
  const errors = mock.method(console, "error", () => {});
  t.after(() => errors.mock.restore());
  const reported = basics.reportToolAuditError({ code: "tool_audit", diagnostic: new Error("audit insert failed for tok-a") }, { exactSecrets: ["tok-a"] });
  assert.equal(errors.mock.callCount(), 1);
  const [tag, entry] = errors.mock.calls[0].arguments as [string, { errorId: string; code: string; diagnostic: string }];
  assert.equal(tag, "[tool-audit]");
  assert.equal(entry.errorId, reported.errorId);
  assert.equal(entry.code, "tool_audit");
  assert.match(entry.diagnostic, /audit insert failed for/);
  assert.doesNotMatch(entry.diagnostic, /tok-a/, "exact secrets are redacted before logging");
});
