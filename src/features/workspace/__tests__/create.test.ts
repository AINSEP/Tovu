import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryOutbox } from "../../../core/events";
import { createWorkspace, WorkspaceConflictError, WorkspaceValidationError } from "../create";
import { InMemoryWorkspaceRepo } from "../repo.memory";

/**
 * Specification tests for the create-workspace slice.
 *
 * These tests intentionally exercise domain behavior without HTTP/framework coupling.
 */
test("createWorkspace stores workspace and enqueues workspace.created", async () => {
  const repo = new InMemoryWorkspaceRepo();
  const outbox = new InMemoryOutbox();

  let n = 0;
  const idGen = { newId: () => `id-${++n}` };
  const clock = { nowIso: () => "2026-02-21T00:00:00.000Z" };

  const result = await createWorkspace(
    {
      deps: { repo, outbox, idGen, clock },
      input: { name: "Tovu Site", slug: "tovu-site" },
    }
  );

  assert.equal(result.id, "id-1");

  const rows = await outbox.claimPending(10, "2026-02-21T00:00:00.000Z");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event.name, "workspace.created");
  assert.equal(rows[0].event.workspaceId, "id-1");
});

test("createWorkspace rejects invalid slug", async () => {
  const repo = new InMemoryWorkspaceRepo();
  const outbox = new InMemoryOutbox();
  const idGen = { newId: () => "id-1" };
  const clock = { nowIso: () => "2026-02-21T00:00:00.000Z" };

  await assert.rejects(
    () =>
      createWorkspace({
        deps: { repo, outbox, idGen, clock },
        input: { name: "X", slug: "Bad Slug" },
      }),
    WorkspaceValidationError
  );
});

test("createWorkspace rejects duplicate slug", async () => {
  const repo = new InMemoryWorkspaceRepo();
  const outbox = new InMemoryOutbox();
  let n = 0;
  const idGen = { newId: () => `id-${++n}` };
  const clock = { nowIso: () => "2026-02-21T00:00:00.000Z" };

  await createWorkspace({
    deps: { repo, outbox, idGen, clock },
    input: { name: "A", slug: "dup" },
  });
  await assert.rejects(
    () =>
      createWorkspace({
        deps: { repo, outbox, idGen, clock },
        input: { name: "B", slug: "dup" },
      }),
    WorkspaceConflictError
  );
});
