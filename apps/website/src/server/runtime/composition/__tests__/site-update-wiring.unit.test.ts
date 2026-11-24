import assert from "node:assert/strict";
import test from "node:test";
import { createContributionRegistry, type ToolContributor, type DerivedToolContributor } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { createFakeSiteUpdate } from "@jini-ai/devops/deploy";
import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import { nativeToolMetadata } from "#src/contracts/core/tool-metadata/index";
import { installFirstPartyToolContributors } from "../tool-catalog-manifest.js";

/** @file The site-update tools are in the first-party catalog and metadata, and stay absent until a host supplies a runtime. */

function siteUpdateContributor() {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  const contributor = contributions.contributors.list({}).find((candidate) => candidate.domain === "site-update");
  assert.ok(contributor, "the site-update contributor is registered");
  return contributor;
}

test("site-update has no tools when the host supplies no update runtime", () => {
  assert.deepEqual(siteUpdateContributor().build({ authorize: async () => ({ allowed: true, reason: "matched" }), workspaceId: "ws" } as never, {} as never), []);
});

test("site-update offers both tools once a host supplies a runtime, and metadata covers them", () => {
  const fake = createFakeSiteUpdate({ runningVersion: "1.2.0", latest: { version: "1.3.0", notes: "Faster pages." } });
  const runtime = { feed: fake.feed, site: fake.ports.site, backup: fake.ports.backup, readiness: fake.ports.readiness, ids: fake.ports.ids, runningVersion: async () => "1.2.0" };
  const registrations = siteUpdateContributor().build({ authorize: async () => ({ allowed: true, reason: "matched" }), workspaceId: "ws", siteUpdateRuntime: runtime } as never, { surfaceExchanges: {} } as never);
  assert.deepEqual(registrations.map((r) => r.descriptor.id).sort(), ["site_update_apply", "site_update_check"]);
  for (const id of ["site_update_check", "site_update_apply"]) assert.ok(nativeToolMetadata.byId[id], `metadata for ${id}`);
});

test("site-update denies a caller the permission check refuses", async () => {
  const fake = createFakeSiteUpdate({ runningVersion: "1.2.0", latest: { version: "1.3.0", notes: "Faster pages." } });
  const runtime = { feed: fake.feed, site: fake.ports.site, backup: fake.ports.backup, readiness: fake.ports.readiness, ids: fake.ports.ids, runningVersion: async () => "1.2.0" };
  const registrations = siteUpdateContributor().build({ authorize: async () => ({ allowed: false, reason: "no" }), workspaceId: "ws", siteUpdateRuntime: runtime } as never, { surfaceExchanges: {} } as never);
  const check = registrations.find((r) => r.descriptor.id === "site_update_check")!;
  await assert.rejects(() => check.handler({ executionId: "e", principal: { id: "p" }, run: { id: "r" }, input: {}, signal: new AbortController().signal } as never, {} as never));
});
