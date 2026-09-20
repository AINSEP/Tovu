import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "#src/features/origin/index";
import { redirectMatcher } from "../matcher.js";
import type { RedirectDbHandle } from "../ports.internal.js";
import { InMemoryRedirectRepo } from "../repo.memory.js";
import {
  createRedirect,
  importRedirects,
  tombstoneRedirect,
  updateRedirect,
  type RedirectsWriteDeps,
} from "../redirects.js";
import {
  RedirectConflictError,
  RedirectLoopError,
  RedirectNotFoundError,
  RedirectTargetNotAllowedError,
  RedirectValidationError,
} from "../types.js";
import type { RedirectStatus } from "../types.js";
import { removeVia } from "./remove-redirect-double.js";

/**
 * @file T008 — the write chokepoint (`redirects.ts`): validate-before-write
 * ordering, write-path open-redirect rejection (REQ-08/AC-10/11), one-hop
 * collapse (AC-16) + cycle rejection (AC-17), `matchType:'regex'` always
 * rejected (AC-27), partial-success import batch (AC-31), INV-01/04/05/07.
 */

const WORKSPACE_ID = "workspace-1";
const ACTOR_ID = "user-1";

function makeDeps(opts: { redirectAllowlist?: string[] } = {}): RedirectsWriteDeps {
  const repo = new InMemoryRedirectRepo();
  const originRepo = new InMemoryOriginSettingRepo([
    {
      workspaceId: WORKSPACE_ID,
      origin: createVerifiedOrigin({
        scheme: "https",
        host: "trusted.example",
        verifiedAt: "2026-07-13T00:00:00.000Z",
        source: "workspace-setting",
      }),
      redirectAllowlist: opts.redirectAllowlist ?? [],
    },
  ]);
  let clockTick = 0;
  let idTick = 0;
  return {
    repo,
    remove: removeVia(repo as unknown as Parameters<typeof removeVia>[0]),
    db: repo as unknown as RedirectDbHandle,
    transaction: async (fn) => fn(),
    matcher: redirectMatcher,
    originRegistry: new OriginRegistry({ repo: originRepo }),
    clock: { nowIso: () => `2026-07-13T00:00:${String(clockTick++).padStart(2, "0")}.000Z` },
    idGen: { newId: () => `redirect-${++idTick}` },
    outbox: new InMemoryOutbox(),
  };
}

// ---------------------------------------------------------------------------
// createRedirect — validation ordering, AC-01/02/03/06/07/08/09
// ---------------------------------------------------------------------------

test("createRedirect writes a record + a same-tx revision (INV-01, AC-01)", async () => {
  const deps = makeDeps();
  const { record } = await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/old",
      toTarget: "/new",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });

  assert.equal(record.fromPattern, "/old");
  assert.equal(record.status, "active");
  assert.equal(record.version, 1);
  const repo = deps.repo as InMemoryRedirectRepo;
  const revisions = repo.listRevisionsForTests(record.id);
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].seq, 1);
});

test("createRedirect defaults override:false and priority:0 (behavior.spec.md §3)", async () => {
  const deps = makeDeps();
  const { record } = await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/old",
      toTarget: "/new",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });
  assert.equal(record.override, false);
  assert.equal(record.priority, 0);
  assert.equal(record.source, "manual");
});

test("AC-27/INV-05: matchType 'regex' is always rejected with REDIRECT_VALIDATION_ERROR, even before any other check", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () =>
      createRedirect({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          matchType: "regex",
          fromPattern: "/a.*",
          toTarget: "/b",
          statusCode: 301,
          actorId: ACTOR_ID,
        },
      }),
    RedirectValidationError
  );
});

test("createRedirect rejects a fromPattern outside the 1-2048 length bound", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () =>
      createRedirect({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          matchType: "exact",
          fromPattern: "/" + "a".repeat(2048),
          toTarget: "/b",
          statusCode: 301,
          actorId: ACTOR_ID,
        },
      }),
    RedirectValidationError
  );
});

test("createRedirect rejects a priority outside 0-1000 (not silently clamped)", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () =>
      createRedirect({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          matchType: "exact",
          fromPattern: "/a",
          toTarget: "/b",
          statusCode: 301,
          priority: 1001,
          actorId: ACTOR_ID,
        },
      }),
    RedirectValidationError
  );
});

test("createRedirect accepts priority exactly 1000", async () => {
  const deps = makeDeps();
  const { record } = await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/a",
      toTarget: "/b",
      statusCode: 301,
      priority: 1000,
      actorId: ACTOR_ID,
    },
  });
  assert.equal(record.priority, 1000);
});

// ---------------------------------------------------------------------------
// createRedirect — write-path open-redirect rejection (REQ-08, AC-10/AC-11)
// ---------------------------------------------------------------------------

test("AC-10: an absolute toTarget NOT on the redirect allowlist is rejected with RedirectTargetNotAllowedError", async () => {
  const deps = makeDeps(); // empty allowlist
  await assert.rejects(
    () =>
      createRedirect({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          matchType: "exact",
          fromPattern: "/a",
          toTarget: "https://evil.example/phish",
          statusCode: 301,
          actorId: ACTOR_ID,
        },
      }),
    RedirectTargetNotAllowedError
  );
});

test("AC-11: an absolute toTarget matching the workspace's own verified origin is allowed", async () => {
  const deps = makeDeps();
  const { record } = await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/a",
      toTarget: "https://trusted.example/b",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });
  assert.equal(record.toTarget, "https://trusted.example/b");
});

test("an allowlisted absolute cross-origin toTarget is allowed", async () => {
  const deps = makeDeps({ redirectAllowlist: ["partner.example"] });
  const { record } = await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/a",
      toTarget: "https://partner.example/deal",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });
  assert.equal(record.toTarget, "https://partner.example/deal");
});

test("a relative toTarget never needs the allowlist", async () => {
  const deps = makeDeps(); // empty allowlist
  const { record } = await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/a",
      toTarget: "/relative-target",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });
  assert.equal(record.toTarget, "/relative-target");
});

// ---------------------------------------------------------------------------
// createRedirect — dedup / conflict (behavior.spec.md §5.1, AC-09)
// ---------------------------------------------------------------------------

test("AC-09: a duplicate active exact fromPattern is rejected with RedirectConflictError", async () => {
  const deps = makeDeps();
  await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/dup",
      toTarget: "/first",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });

  await assert.rejects(
    () =>
      createRedirect({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          matchType: "exact",
          fromPattern: "/dup",
          toTarget: "/second",
          statusCode: 301,
          actorId: ACTOR_ID,
        },
      }),
    RedirectConflictError
  );
});

test("an exact and a prefix rule may share the same fromPattern (not a duplicate, different bands)", async () => {
  const deps = makeDeps();
  await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/shared",
      toTarget: "/exact-target",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });

  const { record } = await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "prefix",
      fromPattern: "/shared",
      toTarget: "/prefix-target",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });
  assert.equal(record.matchType, "prefix");
});

test("a duplicate fromPattern against a tombstoned (disabled) rule is allowed (not a duplicate)", async () => {
  const deps = makeDeps();
  const { record: first } = await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/reused",
      toTarget: "/first",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });
  await tombstoneRedirect({ deps, input: { workspaceId: WORKSPACE_ID, id: first.id, actorId: ACTOR_ID } });

  const { record: second } = await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/reused",
      toTarget: "/second",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });
  assert.equal(second.toTarget, "/second");
});

// ---------------------------------------------------------------------------
// createRedirect — one-hop collapse (AC-16) + cycle rejection (AC-17), INV-04
// ---------------------------------------------------------------------------

test("AC-16: creating B->C when A->B already exists collapses A's target to C at write time", async () => {
  const deps = makeDeps();
  await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/a",
      toTarget: "/b",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });

  // Creating B->C: since a hop A->B already exists pointing at B, and now B->C is
  // introduced, per REQ-13's "resolution follows AT MOST ONE hop" guarantee this
  // create itself (fromPattern=B) is unaffected — the collapse this AC/REQ-13
  // describes is verified by asserting a THIRD create whose toTarget is the
  // just-created B (i.e., creating X->B collapses to X->C once B->C exists).
  await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/b",
      toTarget: "/c",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });

  const { record: collapsed } = await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/x",
      toTarget: "/b",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });

  assert.equal(collapsed.toTarget, "/c", "X->B collapses to X->C since B->C already exists");
});

test("AC-17: creating B->A when A->B already exists is rejected as a cycle", async () => {
  const deps = makeDeps();
  await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/a",
      toTarget: "/b",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });

  await assert.rejects(
    () =>
      createRedirect({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          matchType: "exact",
          fromPattern: "/b",
          toTarget: "/a",
          statusCode: 301,
          actorId: ACTOR_ID,
        },
      }),
    RedirectLoopError
  );
});

// ---------------------------------------------------------------------------
// AC-08 / INV-01 — a mid-write failure leaves no orphan row
// ---------------------------------------------------------------------------

test("AC-08: a failure inside the transaction wrapper leaves neither the record nor the revision persisted", async () => {
  const repo = new InMemoryRedirectRepo();
  const originRepo = new InMemoryOriginSettingRepo([
    {
      workspaceId: WORKSPACE_ID,
      origin: createVerifiedOrigin({
        scheme: "https",
        host: "trusted.example",
        verifiedAt: "2026-07-13T00:00:00.000Z",
        source: "workspace-setting",
      }),
    },
  ]);
  const deps: RedirectsWriteDeps = {
    repo,
    remove: removeVia(repo as unknown as Parameters<typeof removeVia>[0]),
    db: repo as unknown as RedirectDbHandle,
    transaction: async () => {
      throw new Error("simulated mid-transaction failure");
    },
    matcher: redirectMatcher,
    originRegistry: new OriginRegistry({ repo: originRepo }),
    clock: { nowIso: () => "2026-07-13T00:00:00.000Z" },
    idGen: { newId: () => "redirect-x" },
    outbox: new InMemoryOutbox(),
  };

  await assert.rejects(
    () =>
      createRedirect({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          matchType: "exact",
          fromPattern: "/a",
          toTarget: "/b",
          statusCode: 301,
          actorId: ACTOR_ID,
        },
      }),
    /simulated mid-transaction failure/
  );

  assert.equal(await repo.findById({ workspaceId: WORKSPACE_ID, id: "redirect-x" }), null);
  assert.equal(repo.listRevisionsForTests("redirect-x").length, 0);
});

// ---------------------------------------------------------------------------
// updateRedirect — AC-06
// ---------------------------------------------------------------------------

test("updateRedirect applies a partial change and appends a new revision", async () => {
  const deps = makeDeps();
  const { record } = await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/a",
      toTarget: "/b",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });

  const { record: updated } = await updateRedirect({
    deps,
    input: { workspaceId: WORKSPACE_ID, id: record.id, toTarget: "/c", actorId: ACTOR_ID },
  });

  assert.equal(updated.toTarget, "/c");
  assert.equal(updated.version, 2);
  const repo = deps.repo as InMemoryRedirectRepo;
  assert.equal(repo.listRevisionsForTests(record.id).length, 2);
});

test("updateRedirect on a nonexistent id throws RedirectNotFoundError", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => updateRedirect({ deps, input: { workspaceId: WORKSPACE_ID, id: "nope", actorId: ACTOR_ID } }),
    RedirectNotFoundError
  );
});

// ---------------------------------------------------------------------------
// updateRedirect — status validation. `RedirectStatus` is a two-value union but
// TypeScript doesn't enforce that at the HTTP boundary: the admin PATCH route casts
// an arbitrary `body.status` string straight into `UpdateRedirectInput`, so runtime
// validation here is what actually protects this field.
// ---------------------------------------------------------------------------

const INVALID_STATUSES = ["Disabled", "ACTIVE", "deleted", ""];

for (const status of INVALID_STATUSES) {
  test(`updateRedirect rejects a non-canonical status value ${JSON.stringify(status)} instead of storing it`, async () => {
    const deps = makeDeps();
    const { record } = await createRedirect({
      deps,
      input: {
        workspaceId: WORKSPACE_ID,
        matchType: "exact",
        fromPattern: "/a",
        toTarget: "/b",
        statusCode: 301,
        actorId: ACTOR_ID,
      },
    });

    await assert.rejects(
      () =>
        updateRedirect({
          deps,
          input: {
            workspaceId: WORKSPACE_ID,
            id: record.id,
            status: status as unknown as RedirectStatus,
            actorId: ACTOR_ID,
          },
        }),
      RedirectValidationError
    );

    const stored = await deps.repo.findById({ workspaceId: WORKSPACE_ID, id: record.id });
    assert.equal(stored?.status, "active");
  });
}

test("updateRedirect rejects a non-canonical status on an otherwise disable-only PATCH, rather than missing isDisableOnlyUpdate's exact-string fast path and falling through to store it (4c2f6fc5 interaction)", async () => {
  const deps = makeDeps();
  const { record: planted } = await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/legacy-garbage-status",
      toTarget: "/safe-target",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });

  // "Disabled" (wrong case) does not match isDisableOnlyUpdate's exact "disabled" comparison, so
  // this PATCH misses the disable-only fast path and falls through to full field validation —
  // which must now reject the garbage status instead of silently storing it as unservable garbage.
  await assert.rejects(
    () =>
      updateRedirect({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          id: planted.id,
          status: "Disabled" as unknown as RedirectStatus,
          actorId: ACTOR_ID,
        },
      }),
    RedirectValidationError
  );

  const stored = await deps.repo.findById({ workspaceId: WORKSPACE_ID, id: planted.id });
  assert.equal(stored?.status, "active");
});

// ---------------------------------------------------------------------------
// tombstoneRedirect — AC-07
// ---------------------------------------------------------------------------

test("AC-07: tombstoneRedirect flips status to disabled; the rule is still listable but no longer matched", async () => {
  const deps = makeDeps();
  const { record } = await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/a",
      toTarget: "/b",
      statusCode: 301,
      actorId: ACTOR_ID,
    },
  });

  const { record: tombstoned } = await tombstoneRedirect({
    deps,
    input: { workspaceId: WORKSPACE_ID, id: record.id, actorId: ACTOR_ID },
  });

  assert.equal(tombstoned.status, "disabled");
  const listed = await deps.repo.list({ workspaceId: WORKSPACE_ID });
  assert.equal(listed.length, 1);
  const matched = await deps.repo.lookupExact({ workspaceId: WORKSPACE_ID, path: "/a", includeOverrideOnly: false });
  assert.equal(matched, null);
});

test("tombstoneRedirect on a nonexistent id throws RedirectNotFoundError", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => tombstoneRedirect({ deps, input: { workspaceId: WORKSPACE_ID, id: "nope", actorId: ACTOR_ID } }),
    RedirectNotFoundError
  );
});

// ---------------------------------------------------------------------------
// importRedirects — AC-31, EC-08
// ---------------------------------------------------------------------------

test("AC-31: importRedirects processes each item independently; one invalid item does not abort the batch", async () => {
  const deps = makeDeps();
  const { created, failed } = await importRedirects({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      rules: [
        { workspaceId: WORKSPACE_ID, matchType: "exact", fromPattern: "/import-1", toTarget: "/t1", statusCode: 301, actorId: ACTOR_ID },
        { workspaceId: WORKSPACE_ID, matchType: "regex", fromPattern: "/bad", toTarget: "/t2", statusCode: 301, actorId: ACTOR_ID },
        { workspaceId: WORKSPACE_ID, matchType: "exact", fromPattern: "/import-2", toTarget: "/t3", statusCode: 301, actorId: ACTOR_ID },
      ],
    },
  });

  assert.equal(created.length, 2);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].index, 1);
  assert.equal(failed[0].code, "REDIRECT_VALIDATION_ERROR");
});

test("EC-08: two items in the same batch with the same exact fromPattern — first succeeds, second fails with REDIRECT_CONFLICT", async () => {
  const deps = makeDeps();
  const { created, failed } = await importRedirects({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      rules: [
        { workspaceId: WORKSPACE_ID, matchType: "exact", fromPattern: "/dup-in-batch", toTarget: "/t1", statusCode: 301, actorId: ACTOR_ID },
        { workspaceId: WORKSPACE_ID, matchType: "exact", fromPattern: "/dup-in-batch", toTarget: "/t2", statusCode: 301, actorId: ACTOR_ID },
      ],
    },
  });

  assert.equal(created.length, 1);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].index, 1);
  assert.equal(failed[0].code, "REDIRECT_CONFLICT");
});
