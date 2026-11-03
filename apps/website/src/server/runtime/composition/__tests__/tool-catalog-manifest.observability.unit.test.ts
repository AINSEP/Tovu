import assert from "node:assert/strict";
import test from "node:test";

import { createContributionRegistry } from "@jini-ai/core";

import type { DerivedToolContributor, ToolContributor } from "@jini-ai/core";
import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { LIVE_PAGE_EGRESS_POLICY, WEB_FETCH_EGRESS_POLICY, WEB_SCREENSHOT_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import type { createDefaultHttpClient } from "#src/platform/http/client";
import { createNoopObservabilityPort } from "#src/platform/observability/index";
import { DOMAIN_DNS_EGRESS_POLICY } from "../domain-dns-adapters.js";
import { installFirstPartyToolContributors } from "../tool-catalog-manifest.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/**
 * @file `installFirstPartyToolContributors` threads `options.observability` into the egress it
 * builds itself: every guarded HTTP client (domain DNS, live page, web fetch, web screenshot).
 * `external_mcp_get_admissions` calls the injected server reader without a daemon HTTP read.
 */


function freshContributions() {
  return {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
}

/** Runs `external_mcp_get_admissions` as an authorized principal through the installed contributor. */
async function callGetAdmissions(contributions: ReturnType<typeof freshContributions>): Promise<unknown> {
  const contributor = contributions.contributors.list({}).find((candidate) => candidate.domain === "external-mcp-operations");
  assert.ok(contributor, "the installer registers the external-mcp-operations contributor");
  const deps = { workspaceId: "ws-otel", clock: { nowMs: () => 0 }, authorize: async () => ({ allowed: true, reason: "matched" }) };
  const registration = contributor.build(deps as never, { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) }).find((candidate) => candidate.descriptor.id === "external_mcp_get_admissions");
  assert.ok(registration);
  return registration.handler({ executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input: {}, signal: new AbortController().signal } as never);
}

test("installFirstPartyToolContributors builds every guarded HTTP client with the observability port it was given", () => {
  const observability = createNoopObservabilityPort({});
  const built: { policy: unknown; options: unknown }[] = [];
  const createHttpClient = ((policy, options) => {
    built.push({ policy, options });
    return {} as ReturnType<typeof createDefaultHttpClient>;
  }) as typeof createDefaultHttpClient;

  installFirstPartyToolContributors({ contributions: freshContributions() }, { observability, createHttpClient });

  // Site evidence and web screenshots use separate clients; rendered web fetch disables
  // redirects so the browser guard checks each destination itself (9b20083b6).
  assert.equal(built.length, 6);
  assert.deepEqual(built.map(call => call.policy), [
    DOMAIN_DNS_EGRESS_POLICY, WEB_SCREENSHOT_EGRESS_POLICY, LIVE_PAGE_EGRESS_POLICY,
    { ...WEB_FETCH_EGRESS_POLICY, maxRedirects: 0 }, WEB_FETCH_EGRESS_POLICY, WEB_SCREENSHOT_EGRESS_POLICY,
  ]);
  for (const call of built) assert.equal((call.options as { observability: unknown }).observability, observability);
});

test("external_mcp_get_admissions calls the injected server admissions reader", async () => {
  let reads = 0;
  const contributions = freshContributions();
  installFirstPartyToolContributors({ contributions }, { readAdmissions: async () => {
    reads++; return { ok: true, connections: [], configFailures: [{ connectionId: "bad", reason: "cannot resolve" }] };
  } });
  assert.deepEqual(await callGetAdmissions(contributions), { connections: [], configFailures: [{ connectionId: "bad", reason: "cannot resolve" }] });
  assert.equal(reads, 1);
});

test("an unwired admissions contributor refuses instead of querying or waking a daemon", async t => {
  let reads = 0;
  t.mock.method(globalThis, "fetch", async () => { reads++; throw new Error("must stay cold"); });
  const contributions = freshContributions();
  installFirstPartyToolContributors({ contributions });
  await assert.rejects(() => callGetAdmissions(contributions), /no live admissions report/i);
  assert.equal(reads, 0);
});
