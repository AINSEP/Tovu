import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { ROUTINE_TOOL_IDS } from "@jini-ai/core/tool-metadata/routines";
import type { AssistantRoutinesHandle } from "../modules/assistant-routines.js";
import { servingRoutineToolOptions } from "../modules/serving-routine-tools.js";

/**
 * @file The routine wiring that only exists in the composed whole (P3 test debt). Each half is unit
 * tested alone; these prove the seams between them: `createApp` forwards the deferred routine boot
 * barrier into the chats module, and the four routine tools survive `createApp` -> `mountAssistant` ->
 * `installFirstPartyToolContributors` only when routines AND the release flag are both supplied.
 */

// A transparent spy over the real installer: the real contributors still register, we just keep the
// registry each composition built so the test can read what really landed in it.
const manifest = await import("../tool-catalog-manifest.js");
type Install = typeof manifest.installFirstPartyToolContributors;
const registries: Parameters<Install>[0]["contributions"][] = [];
mock.module("../tool-catalog-manifest.js", { namedExports: { ...manifest,
  installFirstPartyToolContributors: ((required: Parameters<Install>[0], optional?: Parameters<Install>[1]) => {
    registries.push(required.contributions);
    return manifest.installFirstPartyToolContributors(required, optional);
  }) as Install,
} });
const { createApp, createRouteDeps } = await import("../app.js");

function fakeHandle(): AssistantRoutinesHandle {
  const commands = { list: async () => ({ ok: true as const, routines: [] }) };
  return { availability: () => "ready" as const, commands, approvalBindingFor: () => undefined } as unknown as AssistantRoutinesHandle;
}

/** Every tool id the registry that the LAST composition built would advertise. */
function routineToolIdsInLastComposition(): string[] {
  const registry = registries.at(-1);
  assert.ok(registry, "createApp never reached installFirstPartyToolContributors");
  const contributor = registry.contributors.list({}).find((entry) => entry.domain === "routines");
  if (!contributor) return [];
  return contributor.build({} as never, {} as never).map((tool) => tool.descriptor.id).sort();
}

const routineSupply = (releaseEnabled: boolean) => servingRoutineToolOptions({
  canRun: true, releaseEnabled, ready: async () => fakeHandle(), workspaceId: "ws-1", access: async () => true,
});

test("routineBoot reaches assistant-chats through createApp -> mount-assistant: the lease owner's repair waits for whenInterrupted", async () => {
  const deps = createRouteDeps();
  let waited = 0;
  const work: Promise<void>[] = [];
  createApp(deps, { recoverAssistantChatRuns: true, onBootWork: ({ work: pending }) => work.push(pending),
    assistantRoutineBoot: { isLeaseOwner: () => true, whenInterrupted: async () => { waited += 1; } } });
  await Promise.all(work);
  assert.equal(waited, 1, "the deferred assistantRoutineBoot never arrived as routineBoot");
});

test("a passive boot (not the lease owner) does not wait on the routine barrier", async () => {
  const deps = createRouteDeps();
  let waited = 0;
  const work: Promise<void>[] = [];
  createApp(deps, { recoverAssistantChatRuns: true, onBootWork: ({ work: pending }) => work.push(pending),
    assistantRoutineBoot: { isLeaseOwner: () => false, whenInterrupted: async () => { waited += 1; } } });
  await Promise.all(work);
  assert.equal(waited, 0);
});

test("routines + routinesReleaseEnabled: true register the four routine tool ids through the whole composition", () => {
  const supply = routineSupply(true);
  createApp(createRouteDeps(), { routines: supply.routines, routinesReleaseEnabled: supply.routinesReleaseEnabled });
  assert.deepEqual(routineToolIdsInLastComposition(), [...ROUTINE_TOOL_IDS].sort());
});

test("the default (release flag false) registers no routine tool even when routines are supplied", () => {
  const supply = routineSupply(true);
  createApp(createRouteDeps(), { routines: supply.routines });
  assert.deepEqual(routineToolIdsInLastComposition(), []);
  createApp(createRouteDeps());
  assert.deepEqual(routineToolIdsInLastComposition(), []);
});
