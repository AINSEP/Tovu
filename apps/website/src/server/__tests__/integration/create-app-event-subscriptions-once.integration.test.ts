import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventBus } from "#src/contracts/core/events/memory-bus";
import { processOutbox } from "#src/contracts/core/events/outbox-worker";
import type { DomainEvent } from "@jini-ai/cms/core";
import { createApp, createRouteDeps } from "../../runtime/composition/app.js";

/**
 * @file Regression proof that building the site app again on the same `RouteDeps` does not attach a
 * second copy of every event handler (2026-09-14).
 *
 * `createApp(routeDeps)` subscribes the site's handlers (SEO sitemap invalidation, forms notify mail,
 * webhook fan-out, newsletter batches, the `workspace.created` log) onto `routeDeps.bus`. The serving
 * process builds its app once, then builds it AGAIN through `routeDeps.createSiteApp()` for every
 * static export (`platform/export/site-exporter.ts`) and every `fetchPublishedPage` inspection call
 * (`features/site-inspection/published-page.ts`). Each of those rebuilds used to add one more copy of
 * each handler to the same bus, so after N exports one event ran every handler N+1 times.
 */

/** Counts, per event name, how many handler runs one publish causes; also records every subscribed name. */
class HandlerCountingBus extends InMemoryEventBus {
  readonly handlerRuns = new Map<string, number>();
  readonly subscribedNames = new Set<string>();

  override async subscribe<TPayload>(
    eventName: string,
    handler: (event: DomainEvent<TPayload>) => Promise<void>
  ): Promise<() => Promise<void>> {
    this.subscribedNames.add(eventName);
    return super.subscribe<TPayload>(eventName, async (event) => {
      this.handlerRuns.set(eventName, (this.handlerRuns.get(eventName) ?? 0) + 1);
      await handler(event);
    });
  }
}

/** A payload every createApp handler accepts without throwing: all ids point at rows that do not exist. */
function makeEvent(name: string, workspaceId: string, occurredAt: string): DomainEvent {
  return {
    id: `evt-${name}`,
    name,
    occurredAt,
    workspaceId,
    payload: {
      workspaceId,
      entryId: "missing-entry",
      contentType: "post",
      campaignId: "missing-campaign",
      sendIds: [],
      formDefinitionId: "missing-form",
      submissionId: "missing-submission",
    },
  };
}

/** Builds the app(s) on fresh deps with a counting bus, publishes one event per subscribed name, returns the counts. */
async function handlerRunsPerEvent(build: (deps: ReturnType<typeof createRouteDeps>) => void): Promise<Record<string, number>> {
  const deps = createRouteDeps();
  const bus = new HandlerCountingBus();
  deps.bus = bus;
  build(deps);
  for (const name of [...bus.subscribedNames].sort()) {
    await bus.publish(makeEvent(name, deps.workspaceId, deps.clock.nowIso()));
  }
  return Object.fromEntries([...bus.handlerRuns].sort(([a], [b]) => a.localeCompare(b)));
}

test("rebuilding the site app on the same RouteDeps (export, published-page fetch) adds no second copy of any event handler", async () => {
  const servedOnce = await handlerRunsPerEvent((deps) => {
    createApp(deps);
  });
  assert.equal(servedOnce["form.submission.received"], 2, "sanity: forms notify and webhook fan-out each run once");

  const servedThenExportedTwice = await handlerRunsPerEvent((deps) => {
    createApp(deps);
    deps.createSiteApp();
    deps.createSiteApp();
  });
  assert.deepEqual(servedThenExportedTwice, servedOnce);
});

test("one form submission event sends one notify email after the site app was rebuilt for an export", async () => {
  const deps = createRouteDeps();
  const sentTo: string[] = [];
  deps.mailer.send = async (message) => {
    sentTo.push(message.to.email);
    return { ok: true, providerMessageId: `sent-${sentTo.length}` } as never;
  };
  createApp(deps);
  deps.createSiteApp();

  const now = deps.clock.nowIso();
  await deps.formDefinitionRepo.create({
    id: "form-1",
    workspaceId: deps.workspaceId,
    name: "Contact",
    slug: "contact",
    fields: [],
    notify: { enabled: true, recipients: ["owner@example.com"] },
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await deps.formSubmissionRepo.create({
    id: "submission-1",
    workspaceId: deps.workspaceId,
    formDefinitionId: "form-1",
    data: { message: "hello" },
    sourceIp: "127.0.0.1",
    submittedAt: now,
  });
  await deps.outbox.enqueue({
    id: "evt-form-submission-1",
    name: "form.submission.received",
    occurredAt: now,
    workspaceId: deps.workspaceId,
    payload: { workspaceId: deps.workspaceId, formDefinitionId: "form-1", submissionId: "submission-1" },
  });

  await processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock });

  assert.deepEqual(sentTo, ["owner@example.com"]);
});
