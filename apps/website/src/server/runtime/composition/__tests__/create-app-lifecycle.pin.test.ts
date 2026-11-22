import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { InMemoryEventBus } from "#src/contracts/core/events/memory-bus";
import type { DomainEvent } from "@jini-ai/core/contracts/events";
import { SITE_SLEEP_EXIT_CODE } from "@tovu/contracts/daemon-exit-codes";

/**
 * @file Characterization pin (design 02, step 0): `createApp`'s lifecycle effects — what it
 * subscribes, what it tracks as boot work, what it installs for idle stop, and which options reach
 * the assistant modules. Interface fakes only (a recording bus, a held-open `ready` promise, a spy
 * stop hook); no source reading. Registration ORDER is pinned in `create-app-route-table.pin.test.ts`.
 *
 * The supervisor module is wrapped (real behaviour, counted calls) before `app.js` is first loaded so
 * the idle-stop hook `createApp` installs is observable without reaching into module state.
 */

const supervisor = await import("../../lifecycle/daemon-supervisor.js");
const stopHooks: Array<() => Promise<{ idle: boolean }>> = [];
mock.module("../../lifecycle/daemon-supervisor.js", {
  namedExports: {
    ...supervisor,
    registerSiteIdleStopHook: (input: { stopIfIdle: () => Promise<{ idle: boolean }> }, options?: Record<string, never>) => {
      stopHooks.push(input.stopIfIdle);
      return supervisor.registerSiteIdleStopHook(input, options);
    },
  },
});
const { createApp, createRouteDeps } = await import("../app.js");
const { siteAppBootWorkByDeps } = await import("../site-app-boot-work.js");
const { createAssistantByokModule } = await import("../modules/assistant-byok.js");

/** Records the subscription order and stays a real in-memory bus. */
class RecordingBus extends InMemoryEventBus {
  readonly subscribed: string[] = [];
  override async subscribe<TPayload>(
    { eventName, handler }: { eventName: string; handler: (event: DomainEvent<TPayload>) => Promise<void> },
  ): Promise<() => Promise<void>> {
    this.subscribed.push(eventName);
    return super.subscribe<TPayload>({ eventName, handler });
  }
}

function depsWithBus(): { deps: ReturnType<typeof createRouteDeps>; bus: RecordingBus } {
  const deps = createRouteDeps();
  const bus = new RecordingBus();
  deps.bus = bus;
  return { deps, bus };
}

const PINNED_SUBSCRIPTION_ORDER = [
  "workspace.created",
  "seo.sitemap_invalidated",
  "entry.published",
  "entry.updated",
  "entry.unpublished",
];

test("event subscriptions: the site's handlers attach in a fixed order, once per bus", () => {
  const { deps, bus } = depsWithBus();
  createApp(deps);
  const afterFirst = [...bus.subscribed];
  assert.deepEqual(afterFirst.slice(0, PINNED_SUBSCRIPTION_ORDER.length), PINNED_SUBSCRIPTION_ORDER);
  assert.ok(afterFirst.includes("newsletter.send.batch.claimed"));
  assert.ok(afterFirst.includes("form.submission.received"));
  createApp(deps);
  deps.createSiteApp();
  assert.deepEqual(bus.subscribed, afterFirst, "a rebuild on the same deps subscribes nothing more");
});

test("event subscriptions: a second deps object (its own bus) subscribes again, to the same transcript", () => {
  const first = depsWithBus();
  const second = depsWithBus();
  createApp(first.deps);
  createApp(second.deps);
  assert.ok(first.bus.subscribed.length > 0);
  assert.deepEqual(second.bus.subscribed, first.bus.subscribed);
});

/** A tool surface whose boot pass the test controls; everything else is the real surface. */
function surfaceWithReady(deps: ReturnType<typeof createRouteDeps>, ready: Promise<void>) {
  return { ...createAssistantByokModule({ routeDeps: deps }).toolSurface, ready };
}

test("boot work: the tool surface's pass is tracked on siteAppBootWorkByDeps and handed to onBootWork until it resolves", async () => {
  const deps = createRouteDeps();
  const tracked = new Set<Promise<void>>();
  siteAppBootWorkByDeps.set(deps, tracked);
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  const received: Promise<void>[] = [];
  createApp(deps, { assistantToolSurface: surfaceWithReady(deps, ready), onBootWork: ({ work }) => received.push(work) });
  assert.equal(tracked.size, 1);
  assert.ok(tracked.has(ready), "the exact pass is tracked");
  assert.ok(received.includes(ready), "onBootWork receives the exact pass");
  release();
  await ready;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(tracked.size, 0, "a settled pass leaves the set");
});

test("boot work: a rejected pass also leaves the set (and is not an unhandled rejection)", async () => {
  const deps = createRouteDeps();
  const tracked = new Set<Promise<void>>();
  siteAppBootWorkByDeps.set(deps, tracked);
  let fail!: (reason: Error) => void;
  const ready = new Promise<void>((_resolve, reject) => { fail = reject; });
  ready.catch(() => undefined);
  createApp(deps, { assistantToolSurface: surfaceWithReady(deps, ready) });
  assert.equal(tracked.size, 1);
  fail(new Error("pass failed"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(tracked.size, 0);
});

test("boot work: deps with no registered collector still compose and still call onBootWork", () => {
  const deps = createRouteDeps();
  assert.equal(siteAppBootWorkByDeps.get(deps), undefined);
  let calls = 0;
  createApp(deps, { onBootWork: () => { calls += 1; } });
  assert.equal(calls, 1);
});

test("recoverAssistantChatRuns reaches the chats module: it adds a second boot pass, only with the admin assistant on", () => {
  const passes = (options: Parameters<typeof createApp>[1], adminAssistantEnabled = true): number => {
    const deps = createRouteDeps();
    deps.adminAssistantEnabled = adminAssistantEnabled;
    let count = 0;
    createApp(deps, { ...options, onBootWork: () => { count += 1; } });
    return count;
  };
  assert.equal(passes({}), 1, "BYOK pass only");
  assert.equal(passes({ recoverAssistantChatRuns: true }), 2, "BYOK pass + interrupted-run recovery");
  assert.equal(passes({ recoverAssistantChatRuns: true }, false), 1, "no chats module when the admin assistant is off");
});

test("stopForIdle installs exactly one stop hook per app; without it none", async () => {
  stopHooks.length = 0;
  createApp(createRouteDeps());
  assert.equal(stopHooks.length, 0);
  const stops: Array<{ exitCode: number }> = [];
  createApp(createRouteDeps(), { stopForIdle: (input) => stops.push(input) });
  assert.equal(stopHooks.length, 1);
  assert.deepEqual(await stopHooks[0]!(), { idle: true });
  assert.deepEqual(stops, [{ exitCode: SITE_SLEEP_EXIT_CODE }]);
  assert.deepEqual(await stopHooks[0]!(), { idle: false }, "the intake fence is closed after the stop");
  assert.equal(stops.length, 1);
});

test("stopForIdle: background work (a share backend with work, a sending campaign) vetoes the stop", async () => {
  const vetoed = async (arrange: (deps: ReturnType<typeof createRouteDeps>) => void): Promise<{ reply: { idle: boolean }; stops: number }> => {
    stopHooks.length = 0;
    const deps = createRouteDeps();
    deps.newsletterCampaignRepo.hasSending = async () => false;
    arrange(deps);
    let stops = 0;
    createApp(deps, { stopForIdle: () => { stops += 1; } });
    return { reply: await stopHooks[0]!(), stops };
  };
  assert.deepEqual(await vetoed(() => undefined), { reply: { idle: true }, stops: 1 }, "control: no work, the app stops");
  assert.deepEqual(await vetoed((deps) => {
    (deps as { siteShareBackend?: unknown }).siteShareBackend = { registry: undefined, hasWork: () => true };
  }), { reply: { idle: false }, stops: 0 }, "a share backend with work");
  assert.deepEqual(await vetoed((deps) => { deps.newsletterCampaignRepo.hasSending = async () => true; }),
    { reply: { idle: false }, stops: 0 }, "a campaign that is sending");
});
