import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "#src/db/sqlite/content-db";
import { workspaces } from "#src/db/schema";
import { resolveWorkspace } from "../../resolve-workspace";

/**
 * @file SPEC-003 C-005 (`resolveWorkspace`) — TDD certification, unit tier.
 *
 * Traces: REQ-06, state.spec.md §5 (`resolveWorkspace` selector contract), CIC U-001
 * (`resolveWorkspace` is the single source of truth both `createSqliteRouteDeps`'s changed
 * default path and `bootSiteDir` must call).
 *
 * `resolveWorkspace` does not exist yet — this file is expected to fail to compile/run until
 * the Programmer implements `src/site-dir/resolve-workspace.ts` (see tasks.md T003). That is
 * the correct TDD state: this suite defines the target, not a verification of existing code.
 *
 * **Amendment (2026-07-29, B1 fix):** state.spec.md §5's old ">1 rows ⇒ SITE_CORRUPT" contract
 * was amended after a real regression: SPEC-044's workspace-admin `CREATE_WORKSPACE` route can
 * create a second row through normal authorized use, which then bricked boot on every restart
 * with no recovery path. Owner decision: workspaces are a real, intentional multi-site primitive
 * (ADR-007), not an error condition — a >1-row content.db must keep booting, defaulting to the
 * oldest row, with an explicit `workspaceId` selector available. The ">1 rows" tests below assert
 * the amended contract, not the old throw.
 *
 * Outcome Matrix (state.spec.md §5 selector contract, amended):
 *   Given 0 workspace rows                          -> throws SiteCorruptError
 *   Given exactly 1 workspace row                    -> returns that WorkspaceRecord verbatim
 *   Given >1 workspace rows, no options.workspaceId   -> returns the OLDEST row (by createdAt)
 *   Given >1 workspace rows, options.workspaceId set  -> returns the matching row (any position)
 *   Given options.workspaceId set but no row matches  -> throws ValidationError
 */

test("zero workspace rows: resolveWorkspace throws a SiteCorruptError naming zero rows", () => {
  const db = openContentDb(":memory:");
  assert.throws(
    () => resolveWorkspace({ db }),
    (err: unknown) => {
      assert.ok(err instanceof Error, "must throw a real Error, not a string/plain object");
      assert.equal((err as Error).name, "SiteCorruptError", "AC-09/state.spec.md §5 name this the SITE_CORRUPT-mapped error");
      assert.match((err as Error).message.toLowerCase(), /zero|no workspace|0 (row|workspace)/, "message should name the zero-row condition (state.spec.md §5)");
      return true;
    }
  );
});

test("exactly one workspace row: resolveWorkspace returns that row's WorkspaceRecord unchanged", async () => {
  const db = openContentDb(":memory:");
  const record = { id: "ws-only-one", name: "Only Workspace", slug: "only-workspace", createdAt: "2026-07-28T00:00:00.000Z" };
  db.insert(workspaces).values(record).run();

  const resolved = resolveWorkspace({ db });
  assert.deepEqual(resolved, record, "REQ-06: the resolved workspace must equal the db's one actual row, field for field");
});

test("multiple workspace rows, no selector: resolveWorkspace returns the OLDEST row by createdAt (B1 fix) and logs a warning naming it", () => {
  const db = openContentDb(":memory:");
  db.insert(workspaces).values({ id: "ws-newer", name: "Newer", slug: "newer", createdAt: "2026-07-28T00:00:01.000Z" }).run();
  db.insert(workspaces).values({ id: "ws-older", name: "Older", slug: "older", createdAt: "2026-07-28T00:00:00.000Z" }).run();

  const originalWarn = console.warn;
  const warnCalls: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnCalls.push(args);
  };
  try {
    const resolved = resolveWorkspace({ db });
    assert.equal(resolved.id, "ws-older", "B1: with no explicit selector, the OLDEST row must win regardless of insertion/select order");
    assert.ok(warnCalls.length > 0, "a warning must be logged when more than one workspace row exists");
    assert.ok(
      warnCalls.some((args) => args.some((a) => typeof a === "string" && a.includes("ws-older"))),
      "the warning should name the chosen (oldest) workspace id"
    );
  } finally {
    console.warn = originalWarn;
  }
});

test("multiple workspace rows, explicit workspaceId: resolveWorkspace returns the matching row even when it is not the oldest", () => {
  const db = openContentDb(":memory:");
  db.insert(workspaces).values({ id: "ws-older", name: "Older", slug: "older", createdAt: "2026-07-28T00:00:00.000Z" }).run();
  db.insert(workspaces).values({ id: "ws-newer", name: "Newer", slug: "newer", createdAt: "2026-07-28T00:00:01.000Z" }).run();

  const resolved = resolveWorkspace({ db }, { workspaceId: "ws-newer" });
  assert.equal(resolved.id, "ws-newer", "an explicit workspaceId must be honored even when a different row is older");
});

test("explicit workspaceId matching no row: resolveWorkspace throws a ValidationError naming the missing id", () => {
  const db = openContentDb(":memory:");
  db.insert(workspaces).values({ id: "ws-a", name: "A", slug: "a", createdAt: "2026-07-28T00:00:00.000Z" }).run();

  assert.throws(
    () => resolveWorkspace({ db }, { workspaceId: "does-not-exist" }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal((err as Error).name, "ValidationError");
      assert.match((err as Error).message, /does-not-exist/, "the message should name the id that didn't match");
      return true;
    }
  );
});
