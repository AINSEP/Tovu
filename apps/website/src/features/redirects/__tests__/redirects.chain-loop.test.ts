import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "#src/features/origin/index";
import { redirectMatcher } from "../matcher.js";
import type { RedirectDbHandle } from "../ports.internal.js";
import { InMemoryRedirectRepo } from "../repo.memory.js";
import { createRedirect, type RedirectsWriteDeps } from "../redirects.js";
import { RedirectLoopError } from "../types.js";
import { isNeverInTrash, removeVia, restoreVia } from "./remove-redirect-double.js";

/**
 * @file S9 (fix-plan-web-medium-2026-09-24, row 26) — `resolveCollapsedTarget`'s cycle check only
 * looked one hop past the collapse, so a longer chain of existing rules (A->B, B->C, C->A) could be
 * completed by a create/update that itself collapses only once. This asserts the walk now follows
 * the whole chain and rejects with a distinct message from the direct self-loop case.
 */

const WORKSPACE_ID = "workspace-1";
const ACTOR_ID = "user-1";

function makeDeps(): RedirectsWriteDeps {
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
      redirectAllowlist: [],
    },
  ]);
  let clockTick = 0;
  let idTick = 0;
  return {
    repo,
    remove: removeVia(repo as unknown as Parameters<typeof removeVia>[0]),
    isInTrash: isNeverInTrash,
    restore: restoreVia(repo as unknown as Parameters<typeof removeVia>[0]),
    db: repo as unknown as RedirectDbHandle,
    transaction: async (fn) => fn(),
    matcher: redirectMatcher,
    originRegistry: new OriginRegistry({ repo: originRepo }),
    clock: { nowIso: () => `2026-07-13T00:00:${String(clockTick++).padStart(2, "0")}.000Z` },
    idGen: { newId: () => `redirect-${++idTick}` },
    outbox: new InMemoryOutbox(),
  };
}

test("S9: creating /a->/b when /b->/c and /c->/a already exist rejects the whole-chain cycle", async () => {
  const deps = makeDeps();
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
  await createRedirect({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/c",
      toTarget: "/a",
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
          fromPattern: "/a",
          toTarget: "/b",
          statusCode: 301,
          actorId: ACTOR_ID,
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof RedirectLoopError);
      assert.equal(
        (err as Error).message,
        "redirect from '/a' would create a cycle via '/b' (following existing redirects leads back to '/a')"
      );
      return true;
    }
  );
});
