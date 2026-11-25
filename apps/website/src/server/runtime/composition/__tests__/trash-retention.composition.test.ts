/** @file Owner decision G7-4: Trash retention is ONE host-owned value, 30 days, injected into every
 * engine call. The engine (`@jini-ai/cms/trash`) has no default of its own, so a call site that
 * forgets to pass it must not silently fall back to some other number.
 *
 * Drives the real composed trash service (`composeTrashService`) over a real SQLite content DB and
 * reads the stamped `purgeAfter` back, then pins that every host call site takes the number from
 * the one host constant rather than from the engine or a literal.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { contentKernel } from "#src/platform/db/content-kernel";
import { createTableTrashAdapter } from "@jini-ai/cms/trash/sql";
import { SqliteTrashRepo, TRASH_TABLES } from "#src/features/trash/repo.sqlite";
import { buildTrashRegistry } from "#src/features/trash/registry";
import { createMemberTrashAdapter } from "#src/features/trash/adapters/member";
import { composeTrashService } from "../site-deps/trash-service.js";
import { TRASH_RETENTION_DAYS } from "../trash-retention.js";

const WS = "retention-workspace";
const AT = "2026-10-09T12:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

test("the host owns one trash retention window: 30 days", () => {
  assert.equal(TRASH_RETENTION_DAYS, 30);
});

test("deleting through the composed trash service stamps purgeAfter = deletedAt + 30 days", async () => {
  const db = openContentDb(":memory:");
  const client = db.$client;
  client.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run(WS, WS, WS, AT);
  client.prepare(`INSERT INTO members (id, workspace_id, email, status, fields_json, created_at, updated_at, version)
    VALUES (?, ?, ?, 'active', '{}', ?, ?, 1)`).run("member-1", WS, "member-1@example.test", AT, AT);
  const kernel = contentKernel({ store: db });
  const registry = buildTrashRegistry();
  const trashRepo = new SqliteTrashRepo({ store: client });
  const trashAdapters = new Map([["member", createMemberTrashAdapter({
    adapter: createTableTrashAdapter({ entry: registry.get("member")!, kernel, tables: TRASH_TABLES }), db: kernel,
  })]]);
  const { trash } = composeTrashService({
    kernel: kernel as never, trashRepo, trashAdapters: trashAdapters as never, workspaceId: WS,
    postRepo: (() => ({})) as never, pluginTrashAdapter: {} as never,
    mediaAccessEvidence: { invalidate: () => {} } as never,
  });

  await trash.trash({
    workspaceId: WS, entityType: "member", entityId: "member-1", expectedVersion: 1, at: AT,
    actor: { principalId: "operator" }, display: { title: "member-1@example.test" },
  });

  const row = await trashRepo.findByEntity({ workspaceId: WS, entityType: "member", entityId: "member-1" });
  assert.equal(row?.purgeAfter, new Date(Date.parse(AT) + 30 * DAY_MS).toISOString());
});

const REPO = new URL("../../../../../../../", import.meta.url);
const read = (path: string): string => fs.readFileSync(new URL(path, REPO), "utf8");
const HOST_CALL_SITES = [
  "apps/website/src/server/runtime/composition/site-deps/trash-service.ts",
  "apps/website/src/server/runtime/composition/memory-deps/slices/memory-trash.ts",
  "development/scripts/backfill-trashed-items.ts",
];

test("every host retention call site takes the window from the one host constant", () => {
  for (const path of HOST_CALL_SITES) {
    const source = read(path);
    assert.doesNotMatch(source, /@jini-ai\/cms\/trash\/site\/ports["'][^\n]*$|import \{[^}]*TRASH_RETENTION_DAYS[^}]*\} from "@jini-ai/m, `${path} reads retention from the engine`);
    assert.match(source, /import \{ TRASH_RETENTION_DAYS \} from "[^"]*composition\/trash-retention(\.js)?"/, `${path} must import the host constant`);
    // A one-argument computePurgeAfter call would let the engine choose the window.
    assert.doesNotMatch(source, /computePurgeAfter\(\{[^}]*\}\)/, `${path} calls computePurgeAfter without a retention window`);
    assert.doesNotMatch(source, /retentionDays:\s*\d/, `${path} hard-codes a retention number`);
  }
});
