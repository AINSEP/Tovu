import assert from "node:assert/strict";
import test from "node:test";
import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor, DerivedToolContributor, ToolExecutionContext, ToolExecutionOptions } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock } from "@jini-ai/platform/system";
import type { RetentionPassResult } from "@jini-ai/platform/retention";
import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import { installFirstPartyToolContributors } from "../tool-catalog-manifest.js";
import type { SiteStoragePort } from "../modules/storage-routes.js";

/**
 * @file ST-15c.T binding: the storage tools reach the live first-party catalog, the cleanup entry is
 * classified `mutates-durable-state`, and a live cleanup goes through the owner's approval card on the
 * same port the storage routes mount. Without a serving port the tools refuse in plain words.
 */

const pass = (dryRun: boolean): RetentionPassResult => ({ status: "completed", dryRun, startedAt: "t0", finishedAt: "t1", policies: [] } as unknown as RetentionPassResult);

function install({ siteStorage }: { siteStorage?: SiteStoragePort }) {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions }, siteStorage ? { siteStorage } : {});
  let count = 0;
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => `exchange-${++count}` }, defaultChannel: "mcp-ui" });
  const contribution = contributions.contributors.list({}).find(entry => entry.domain === "system-storage");
  assert.ok(contribution, "the storage contributor is registered in the real first-party catalog");
  const registrations = contribution.build({ ownerPrincipalId: Promise.resolve("owner") } as never, { surfaceExchanges: store });
  const log: string[] = [];
  const options: ToolExecutionOptions = { emitSurface: async () => {
    log.push("card");
    store.deliver({ exchangeId: `exchange-${count}`, principalId: "owner", params: { decision: "confirm" } }, { toolId: "site_storage_cleanup" });
  } };
  const call = (id: string, input: unknown, principal = "owner") => registrations.find(r => r.descriptor.id === id)!
    .handler({ executionId: "e", principal: { id: principal }, run: { id: "r" }, input, signal: new AbortController().signal } as ToolExecutionContext, options);
  return { contribution, registrations, log, call };
}

test("registered site_storage_cleanup has derived risk mutates-durable-state and goes through the approval card", async () => {
  const log: string[] = [];
  const siteStorage: SiteStoragePort = {
    measure: async () => { throw new Error("not measured here"); },
    runOnce: async ({ dryRun }) => { log.push(`runOnce:${dryRun}`); return pass(dryRun); },
    lastPass: () => undefined,
  };
  const wired = install({ siteStorage });
  assert.equal(wired.contribution.risk.get("site_storage_cleanup"), "mutates-durable-state");
  assert.equal(wired.contribution.risk.get("site_storage_report"), "none");
  assert.deepEqual(wired.registrations.map(r => r.descriptor.id).sort(), ["site_storage_cleanup", "site_storage_report"]);
  const result = await wired.call("site_storage_cleanup", { dryRun: false }) as Record<string, unknown>;
  log.splice(1, 0, ...wired.log);
  assert.deepEqual(log, ["runOnce:true", "card", "runOnce:false"], "the card precedes the live pass");
  assert.equal(result.cleaned, true);
  await assert.rejects(wired.call("site_storage_cleanup", { dryRun: false }, "teammate"), /Only the site owner/);
});

test("without a serving storage port both tools refuse in plain words", async () => {
  const wired = install({});
  await assert.rejects(wired.call("site_storage_report", {}), /runs only in the app that is serving this site/);
  await assert.rejects(wired.call("site_storage_cleanup", {}), /runs only in the app that is serving this site/);
  assert.deepEqual(wired.log, [], "no card without a port");
});
