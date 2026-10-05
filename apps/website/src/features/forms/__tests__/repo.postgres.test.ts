import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { FormSlugConflictError, type FormDefinitionRecord } from "@jini-ai/cms-forms";

import { openPostgresKernel } from "#src/platform/db/kernel/index";
import { freshPostgresContentDatabase } from "#src/platform/db/__tests__/postgres-database";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { formDefinitionRepoFor } from "../repo.js";

/**
 * @file F0938 — two writers creating one slug in one workspace, on a real Postgres server with two
 * independent connection pools. `repo.dialects.test.ts` runs SQLite and PGlite, which serialize every
 * transaction, so its conflict cases are sequential and stay green with `create`'s per-workspace
 * `lockKey` removed. Here the first writer pauses after its existence check until the second writer's
 * check has run (bounded, because with the lock in place the second writer cannot get there), so
 * without the lock both checks see no row and the loser surfaces Postgres's raw unique violation
 * instead of the promised `FormSlugConflictError`.
 */

const DATABASE = "tovu_forms_repo_pg_fixture";
const WS = "ws-forms-pg";
const T0 = "2026-09-28T00:00:00.000Z";

let first: ContentKernel;
let second: ContentKernel;
let observer: ContentKernel;

before(async () => {
  const url = freshPostgresContentDatabase(DATABASE);
  first = openPostgresKernel<ContentDatabase>({ connectionString: url });
  second = openPostgresKernel<ContentDatabase>({ connectionString: url });
  observer = openPostgresKernel<ContentDatabase>({ connectionString: url });
});

after(async () => {
  await first?.close();
  await second?.close();
  await observer?.close();
});

function definition(id: string, slug: string): FormDefinitionRecord {
  return {
    id, workspaceId: WS, name: `Form ${id}`, slug,
    fields: [{ id: "name", label: "Name", type: "text", required: true }],
    notify: { enabled: false, recipients: [] }, status: "active", createdAt: T0, updatedAt: T0, version: 1,
  };
}

/** `kernel` whose first `run` (create's existence check) holds its transaction open until `resume`. */
function pausedAfterCheck(kernel: ContentKernel, resume: Promise<void>): ContentKernel {
  let runs = 0;
  return {
    ...kernel,
    run: async (fn) => {
      const result = await kernel.run(fn);
      if (++runs === 1) await resume;
      return result;
    },
  } as ContentKernel;
}

/** `kernel` that reports when its first `run` (the existence check) has returned. */
function reportingCheck(kernel: ContentKernel, checked: () => void): ContentKernel {
  let runs = 0;
  return {
    ...kernel,
    run: async (fn) => {
      const result = await kernel.run(fn);
      if (++runs === 1) checked();
      return result;
    },
  } as ContentKernel;
}

test("postgres: racing creates of one slug persist one winner and give the loser FormSlugConflictError", async () => {
  let secondChecked!: () => void;
  const secondCheck = new Promise<void>((resolve) => (secondChecked = resolve));
  // With the lock the second writer waits in lockKey and never checks, so only the bound ends the pause.
  const resume = Promise.race([secondCheck, new Promise<void>((resolve) => setTimeout(resolve, 2_000))]);

  const winner = formDefinitionRepoFor(pausedAfterCheck(first, resume)).create(definition("def-a", "contact"));
  // Let the first writer take its lock and run its check before the second starts.
  await new Promise((resolve) => setTimeout(resolve, 200));
  const loser = formDefinitionRepoFor(reportingCheck(second, secondChecked)).create(definition("def-b", "contact"));

  const [won, lost] = await Promise.allSettled([winner, loser]);
  assert.equal(won.status, "fulfilled");
  assert.equal(lost.status, "rejected");
  const reason = (lost as PromiseRejectedResult).reason as unknown;
  assert.ok(reason instanceof FormSlugConflictError, `expected FormSlugConflictError, got ${String(reason)}`);
  assert.equal(reason.slug, "contact");
  assert.equal(reason.message, "a form with slug 'contact' already exists");

  const rows = await observer.run((db) =>
    db.selectFrom("form_definitions").select(["id", "slug"]).where("workspace_id", "=", WS).execute(),
  );
  assert.deepEqual(rows, [{ id: "def-a", slug: "contact" }]);
});
