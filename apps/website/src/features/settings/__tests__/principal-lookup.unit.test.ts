import assert from "node:assert/strict";
import test from "node:test";

import type { PrincipalRecord, PrincipalRepoPort } from "@jini-ai/user-management";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";

import { createSettingsPrincipalLookup } from "../index.js";

/**
 * @file `createSettingsPrincipalLookup` — the host's membership/status policy for settings targets
 * (REQ-13/INV-09): only an active principal of the asked workspace, under the asked id, resolves.
 */

const WS = "ws-principal-lookup";

function principal(overrides: Partial<PrincipalRecord> = {}): PrincipalRecord {
  return { id: "p-1", workspaceId: WS, kind: "user", displayName: "Owner", status: "active", createdAt: "2026-10-21T00:00:00.000Z", ...overrides };
}

/** A repository that answers every lookup with one fixed row, so the lookup's own checks are what decide. */
function fixedRowRepo(row: PrincipalRecord | null): PrincipalRepoPort {
  return { findById: async () => row, list: async () => (row ? [row] : []), save: async () => undefined };
}

test("an active principal of the asked workspace resolves to its id only", async () => {
  const lookup = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}, { initialRows: [principal()] }) });
  assert.deepEqual(await lookup.findActiveById({ workspaceId: WS, id: "p-1" }), { id: "p-1" });
});

test("a missing principal never becomes a settings target", async () => {
  const lookup = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  assert.equal(await lookup.findActiveById({ workspaceId: WS, id: "p-1" }), null);
});

test("a disabled principal never becomes a settings target", async () => {
  const lookup = createSettingsPrincipalLookup({ repo: fixedRowRepo(principal({ status: "disabled", disabledAt: "2026-10-21T00:00:00.000Z" })) });
  assert.equal(await lookup.findActiveById({ workspaceId: WS, id: "p-1" }), null);
});

test("a row from another workspace is refused even when the repository returns it", async () => {
  const lookup = createSettingsPrincipalLookup({ repo: fixedRowRepo(principal({ workspaceId: "ws-foreign" })) });
  assert.equal(await lookup.findActiveById({ workspaceId: WS, id: "p-1" }), null);
});

test("a row under a different id is refused even when the repository returns it", async () => {
  const lookup = createSettingsPrincipalLookup({ repo: fixedRowRepo(principal({ id: "p-other" })) });
  assert.equal(await lookup.findActiveById({ workspaceId: WS, id: "p-1" }), null);
});
