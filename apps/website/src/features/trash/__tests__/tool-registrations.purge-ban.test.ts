import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { resetToolContributorsForTests } from "#src/assistant/tool-contribution-registry";
import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";
import type { RouteDeps } from "#src/server/routes/types";

import { getTrashAgentToolCatalog } from "../agent-tools.js";
import { buildTrashRegistrations } from "../tool-registrations.js";
import type { PurgeReport, TrashPort } from "../ports.js";

/**
 * @file The purge ban, enforced at the registry rather than in prompt wording.
 *
 * The owner's ruling: **an agent can never hard-delete.** Permanent removal happens only from the
 * Trash screen, by a human, with the rows ticked by hand. A model can be asked not to call a tool
 * and can argue its way past the asking; a tool that is not registered cannot be called at all.
 *
 * Three independent proofs, because each one alone has a gap:
 *
 *  1. **Nothing registered is a purge.** The real catalog — every contributor
 *     `installFirstPartyToolContributors()` installs, which is what the daemon builds from — is
 *     enumerated and checked. This would catch a purge tool added under any name in any domain.
 *  2. **Nothing registered can REACH it.** `TrashPort.purgeSelected` is the only hard delete in
 *     this feature, and the two handlers that hold the port are run against one that throws.
 *  3. **No tool-wiring file anywhere mentions it.** Proof 2 can only exercise handlers it can
 *     reach; this reads the source of every `tool-registrations.ts` and `agent-tools.ts` in the
 *     product, so a purge wired behind a branch no fixture reaches still fails.
 */

const SRC_ROOT = path.join(import.meta.dirname, "../../..");

resetToolContributorsForTests();
installFirstPartyToolContributors();

const WORKSPACE_ID = "ws-purge-ban";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-20T12:00:00.000Z";

/** Throws the instant anything reaches the one hard delete this feature owns. */
class PurgeWasReachedError extends Error {}

function trashPortThatRefusesToPurge(): TrashPort {
  return {
    async trash() {
      return { ok: true, version: 1 };
    },
    async restore() {
      return "restored";
    },
    async list() {
      return {
        items: [
          {
            id: "row-1",
            workspaceId: WORKSPACE_ID,
            entityType: "post",
            entityId: "post-1",
            trashedAt: NOW,
            purgeAfter: "2026-11-19T12:00:00.000Z",
            actorPrincipalId: PRINCIPAL_ID,
            actorPluginId: null,
            displayTitle: "A deleted post",
            displaySubtitle: null,
            entityVersion: 2,
          },
        ],
        nextCursor: null,
      };
    },
    async purgeSelected(): Promise<PurgeReport> {
      throw new PurgeWasReachedError("an agent-callable path reached TrashPort.purgeSelected");
    },
  };
}

function trashToolDeps() {
  return {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: { nowIso: () => NOW },
    trash: trashPortThatRefusesToPurge(),
  };
}

function executionContext(input: unknown): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  } as ToolExecutionContext;
}

/** Every tool id the real, fully-installed catalog registers. @complexity O(t). */
function everyRegisteredToolId(): string[] {
  return buildAssistantToolRegistrations(createRouteDeps() as unknown as RouteDeps).map(
    (registration: ToolRegistration) => registration.descriptor.id
  );
}

/** Every production tool-wiring file under `src/`, relative and `/`-separated. */
function toolWiringSourceFiles(dir = SRC_ROOT): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__" && entry.name !== "node_modules") files.push(...toolWiringSourceFiles(full));
    } else if (entry.name === "tool-registrations.ts" || entry.name === "agent-tools.ts") {
      files.push(path.relative(SRC_ROOT, full).split(path.sep).join("/"));
    }
  }
  return files;
}

// --- proof 1 -------------------------------------------------------------------------------

test("no registered agent tool is a Trash purge, under any name, in any domain", () => {
  const ids = everyRegisteredToolId();
  assert.ok(ids.length > 100, `the real catalog should be installed; got ${ids.length} tool ids`);

  // Deliberately broad. The ban is on the CAPABILITY, so this matches the words a future purge
  // tool would plausibly be named with rather than one exact id. A legitimate tool that trips it
  // should be renamed or explicitly exempted here with its reasoning — never silently allowed.
  const offenders = ids.filter((id) => /purge|hard_?delete|permanently/i.test(id));
  assert.deepEqual(
    offenders,
    [],
    "an agent-callable tool now looks like a permanent delete. Permanent removal is human-only, from the Trash screen's confirm modal."
  );
});

test("the trash domain contributes exactly two tools, and neither is a purge", () => {
  const catalogNames = getTrashAgentToolCatalog().map((entry) => entry.name);
  assert.deepEqual(catalogNames, ["trash_list_items", "trash_restore_item"]);

  const registered = buildTrashRegistrations(trashToolDeps()).map((r) => r.descriptor.id).sort();
  assert.deepEqual(registered, ["trash_list_items", "trash_restore_item"]);
});

// --- proof 2 -------------------------------------------------------------------------------

/**
 * The shapes a model actually produces, tried against EVERY registered trash tool rather than the
 * two by name — so a third tool added later is exercised here the day it is added, instead of
 * quietly falling outside a hand-written pair of calls.
 */
const PROBE_INPUTS: readonly unknown[] = [
  {},
  { entityType: "post", entityId: "post-1" },
  { entityType: "comment", entityId: "c-1" },
  { entityType: "widget", entityId: "w-1" },
  { ids: ["row-1"] },
];

test("no registered trash tool reaches purgeSelected, on any input shape a model is likely to send", async () => {
  const registrations = buildTrashRegistrations(trashToolDeps());
  assert.ok(registrations.length > 0, "the trash tools must be wired for this proof to mean anything");

  for (const registration of registrations) {
    for (const input of PROBE_INPUTS) {
      try {
        await registration.handler(executionContext(input));
      } catch (error) {
        assert.ok(
          !(error instanceof PurgeWasReachedError),
          `${registration.descriptor.id} reached TrashPort.purgeSelected with input ${JSON.stringify(input)}`
        );
      }
    }
  }

  // Not only "did not purge" — the two tools must also still do their own jobs, or the loop above
  // would pass just as well against a pair of handlers that threw on everything.
  const byId = new Map(registrations.map((r) => [r.descriptor.id, r]));
  const listed = (await byId.get("trash_list_items")!.handler(executionContext({}))) as { items: unknown[] };
  assert.equal(listed.items.length, 1);
  const restored = (await byId
    .get("trash_restore_item")!
    .handler(executionContext({ entityType: "post", entityId: "post-1" }))) as { restored: boolean };
  assert.equal(restored.restored, true);
});

// --- proof 3 -------------------------------------------------------------------------------

test("no tool-wiring file in the product so much as mentions purgeSelected", () => {
  const mentions = toolWiringSourceFiles().filter((file) =>
    readFileSync(path.join(SRC_ROOT, file), "utf8").includes("purgeSelected")
  );
  assert.deepEqual(
    mentions,
    ["features/trash/agent-tools.ts", "features/trash/tool-registrations.ts"],
    "purgeSelected appeared in a tool-wiring file. The only permitted mentions are the two comments in trash's own catalog and wiring recording that it is NOT wired."
  );
});
