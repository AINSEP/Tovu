import { createTracker } from "@jini-ai/diagnostics/observability/node";
import assert from "node:assert/strict";
import test from "node:test";

import { createNoopObservabilityPort, type ObservabilityPort } from "#src/platform/observability/index";

import { publishStaticSite } from "../adapter.js";

/** @file The publish/deploy chokepoint: every `publishStaticSite` run is one `site.publish` operation (fake port; no network). */

test("a refused publish is one site.publish operation labelled by target and failure code", async () => {
  const log: string[] = [];
  const noop = createNoopObservabilityPort({});
  const observability: ObservabilityPort = { ...noop, trackOperation: ({ name, attributes }) => {
    log.push(`start:${name}:${JSON.stringify(attributes)}`);
    return { ...noop.trackOperation({ name, attributes }), end: ({ outcome, failed }) => { log.push(`end:${outcome}:${failed}`); } };
  } };
  const outcome = await publishStaticSite({ tracker: createTracker({ observability }) } as never, { projectName: " ", config: { target: "cloudflare-pages" } } as never);
  assert.deepEqual(outcome, { ok: false, code: "INVALID_CONFIG", message: "projectName must be 1-200 characters" });
  assert.deepEqual(log, ['start:site.publish:{"publish.target":"cloudflare-pages"}', "end:INVALID_CONFIG:true"]);
});
