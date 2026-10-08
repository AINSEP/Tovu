import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";

import { SpanKind } from "@opentelemetry/api";
import { createContributionRegistry } from "@jini-ai/core";

import { AGENT_DAEMON_TOKEN_ENV_VAR, type DerivedToolContributor, type ToolContributor } from "#src/assistant/index";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { LIVE_PAGE_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import type { createDefaultHttpClient } from "#src/platform/http/client";
import { createNoopObservabilityPort } from "#src/platform/observability/index";
import { assertSpanOmits, createInMemoryOtel } from "#src/platform/observability/__tests__/fixtures/in-memory-otel";
import type { fetchDaemonAdmissions } from "#src/server/runtime/services/external-mcp-admissions";
import { DOMAIN_DNS_EGRESS_POLICY } from "../domain-dns-adapters.js";
import { installFirstPartyToolContributors } from "../tool-catalog-manifest.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/**
 * @file `installFirstPartyToolContributors` threads `options.observability` into the egress it
 * builds itself: both guarded HTTP clients (domain DNS, live page) and the daemon admissions read
 * behind `external_mcp_get_admissions`. Hand-written fakes for the two injectable collaborators,
 * plus one run through the real admissions read against a loopback stand-in daemon.
 */

const TOKEN = "tok-installer-0c4";

function freshContributions() {
  return {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor }) => contribution.domain }),
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

test("installFirstPartyToolContributors builds both guarded HTTP clients with the observability port it was given", () => {
  const observability = createNoopObservabilityPort({});
  const built: { policy: unknown; options: unknown }[] = [];
  const createHttpClient = ((policy, options) => {
    built.push({ policy, options });
    return {} as ReturnType<typeof createDefaultHttpClient>;
  }) as typeof createDefaultHttpClient;

  installFirstPartyToolContributors({ contributions: freshContributions() }, { observability, createHttpClient });

  assert.equal(built.length, 2);
  assert.deepEqual(new Set(built.map((call) => call.policy)), new Set([DOMAIN_DNS_EGRESS_POLICY, LIVE_PAGE_EGRESS_POLICY]));
  for (const call of built) assert.equal((call.options as { observability: unknown }).observability, observability);
});

test("external_mcp_get_admissions reads the daemon with the installer's observability port", async () => {
  const observability = createNoopObservabilityPort({});
  const reads: Parameters<typeof fetchDaemonAdmissions>[0][] = [];
  const fetchAdmissions = (async (options) => {
    reads.push(options);
    return { ok: true, connections: [] };
  }) as typeof fetchDaemonAdmissions;
  const contributions = freshContributions();
  installFirstPartyToolContributors({ contributions }, { observability, fetchAdmissions });

  assert.deepEqual(await callGetAdmissions(contributions), { connections: [] });

  assert.equal(reads.length, 1);
  assert.equal(reads[0]?.observability, observability);
});

/** A real stand-in daemon on loopback plus the env the admissions read resolves it from, both undone after the test. */
async function standInDaemon(t: TestContext): Promise<void> {
  const server = createServer((_req, res) => { res.setHeader("content-type", "application/json"); res.end('{"connections":[]}'); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const previous = { url: process.env.JINI_AGENT_DAEMON_URL, token: process.env[AGENT_DAEMON_TOKEN_ENV_VAR] };
  process.env.JINI_AGENT_DAEMON_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = TOKEN;
  t.after(async () => {
    if (previous.url === undefined) delete process.env.JINI_AGENT_DAEMON_URL;
    else process.env.JINI_AGENT_DAEMON_URL = previous.url;
    if (previous.token === undefined) delete process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
    else process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = previous.token;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
}

test("by default, the tool's daemon read is the real admissions fetch: one CLIENT span, never the token", async (t) => {
  await standInDaemon(t);
  const { exporter, port } = createInMemoryOtel();
  const contributions = freshContributions();
  installFirstPartyToolContributors({ contributions }, { observability: port });

  assert.deepEqual(await callGetAdmissions(contributions), { connections: [] });

  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 1);
  assert.equal(spans[0].name, "GET 127.0.0.1");
  assert.equal(spans[0].kind, SpanKind.CLIENT);
  assertSpanOmits(spans[0], [TOKEN, "admissions"]);
});
