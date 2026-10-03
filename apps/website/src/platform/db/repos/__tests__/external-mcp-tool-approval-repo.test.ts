import assert from "node:assert/strict";
import test from "node:test";

import type { UUID } from "@jini-ai/core/primitives";

import type { ExternalMcpToolApprovalRecord } from "#src/assistant/external-mcp-tool-approvals";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlExternalMcpToolApprovalRepo } from "../external-mcp-tool-approval-repo.js";

/** @file The G3 "Always allow" store's one Kysely body on SQLite and PGlite (storage plan §4). */

const WS = "ws-1" as UUID;
const KEY = { workspaceId: WS, serverId: "github", toolName: "create_issue" };
const GRANT: ExternalMcpToolApprovalRecord = { ...KEY, fingerprint: "fp-1", grantedByPrincipalId: "user-1", grantedAt: "2026-09-27T00:00:00.000Z" };

/** The repo on `kernel`, every call held until the FK parents (both sites' `github` connection) exist. */
function seededRepo(kernel: ContentKernel): SqlExternalMcpToolApprovalRepo {
  const at = GRANT.grantedAt;
  const seeded = kernel.transaction(async () => {
    await kernel.run((db) => db.insertInto("workspaces").values(["ws-1", "ws-2"].map((id) => ({ id, name: id, slug: id, created_at: at }))).execute());
    await kernel.run((db) =>
      db
        .insertInto("external_mcp_servers")
        .values(["ws-1", "ws-2"].map((id) => ({ workspace_id: id, server_id: "github", transport: "http", enabled: true, created_at: at, updated_at: at })))
        .execute()
    );
  });
  return new SqlExternalMcpToolApprovalRepo({ ...kernel, run: async (fn) => (await seeded, kernel.run(fn)) });
}

describeEachDialect("ExternalMcpToolApprovalRepoPort", { tables: ["workspaces", "external_mcp_servers", "external_mcp_tool_approvals"], make: seededRepo }, (makeRepo) => {
  test("find returns null until a grant is saved, then the exact record", async () => {
    const repo = makeRepo();
    assert.equal(await repo.find(KEY), null);
    await repo.upsert(GRANT);
    assert.deepEqual(await repo.find(KEY), GRANT);
  });

  test("upsert replaces the fingerprint and grant of the one row for site + connection + tool", async () => {
    const repo = makeRepo();
    await repo.upsert(GRANT);
    const regrant = { ...GRANT, fingerprint: "fp-2", grantedByPrincipalId: "user-2", grantedAt: "2026-09-28T00:00:00.000Z" };
    await repo.upsert(regrant);
    assert.deepEqual(await repo.listByWorkspaceId(WS), [regrant]);
  });

  test("listByWorkspaceId is scoped to the site; delete reports whether a row went", async () => {
    const repo = makeRepo();
    const other = { ...GRANT, toolName: "list_issues" };
    await repo.upsert(GRANT);
    await repo.upsert(other);
    await repo.upsert({ ...GRANT, workspaceId: "ws-2" as UUID });
    assert.deepEqual((await repo.listByWorkspaceId(WS)).map((r) => r.toolName).sort(), ["create_issue", "list_issues"]);
    assert.equal(await repo.delete(KEY), true);
    assert.equal(await repo.delete(KEY), false);
    assert.equal(await repo.find(KEY), null);
    assert.deepEqual(await repo.find({ ...KEY, workspaceId: "ws-2" as UUID }), { ...GRANT, workspaceId: "ws-2" });
    assert.deepEqual(await repo.listByWorkspaceId(WS), [other]);
  });
});
