/**
 * @file The site's outbox event handlers, attached once per bus. `busesWithSiteEventHandlers` is the one guard cell and stays a
 * single module instance. Moved verbatim out of `app.ts`; the split into per-family functions is the next commit.
 */

import { hasFormFileOwners, hasFormFileStorageKeyOwners, withFormFileStorageKeyLock } from '#src/features/forms/form-file-purge';
import { SITEMAP_INVALIDATED_EVENT } from "@jini-ai/cms/seo";
import { withSha256Lock } from "#src/features/media/index";
import { handleSendBatchClaimed, SEND_BATCH_CLAIMED_EVENT } from "#src/features/newsletter/send-pipeline";
import type { SendBatchJob } from "#src/features/newsletter/index";
import type { NewsletterRouteDeps } from "../../inbound/admin-http/routes/newsletter/deps.js";
import { toSendPipelineDeps } from "../../inbound/admin-http/routes/newsletter/deps.js";
import { createFormsModule } from "./modules/forms.js";
import { createIntegrationsModule } from "./modules/integrations.js";
import { subscribeSiteSearchIndexer } from "./modules/site-search.js";
import type { RouteDeps } from "../../routes/types.js";
import { startModule } from "./http-app/module-handles.js";

/** Buses that already carry the handlers {@link subscribeSiteEventHandlersOnce} attaches. */
const busesWithSiteEventHandlers = new WeakSet<RouteDeps["bus"]>();

/**
 * Attaches the site's outbox event handlers to `routeDeps.bus`, once per bus (2026-09-14).
 *
 * `createApp` runs more than once on the same `routeDeps` in one process: the serving app first, then
 * `routeDeps.createSiteApp()` for every static export (`features/site-export/site-exporter.ts`) and every
 * published-page fetch (`features/site-inspection/published-page.ts`). These subscriptions used to
 * sit inline in `createApp`, so each rebuild added another copy of every handler to the same bus and
 * one event then ran each handler once per build (a duplicate forms notify mail per export, for
 * one). Pinned by `server/__tests__/integration/create-app-event-subscriptions-once.integration.test.ts`.
 *
 * Keyed on the bus because the bus is what holds the handlers. The first build's handlers serve every
 * later build; they capture fields of `routeDeps`, which is the same object in every build.
 *
 * @param routeDeps the composed deps whose `bus` receives the handlers.
 * @complexity O(1): a fixed set of subscriptions.
 */
export function subscribeSiteEventHandlersOnce(routeDeps: NewsletterRouteDeps): void {
  if (busesWithSiteEventHandlers.has(routeDeps.bus)) return;
  busesWithSiteEventHandlers.add(routeDeps.bus);

  void routeDeps.bus.subscribe({
    eventName: "workspace.created",
    handler: async (event) => {
      // Demonstration side effect. Replace with indexers/webhooks/etc.
      console.log("event handled:", event.name, event.payload);
    },
  });

  // SPEC-008 (ADR-PIPE-008 Decision §5, T038) — SEO subscribes to the 3 entry-lifecycle events
  // `post.ts`'s `updatePost()` now emits, invalidating that workspace's sitemap cache entry on
  // delivery (idempotent per ADR-009 — a duplicate delivery is a no-op, `invalidateSitemapCache`
  // is itself idempotent). Delivered by the serving process's background outbox drainer
  // (`serving-app.ts`) or by a route's own inline `processOutbox` call.
  const seoEventSubscriptions = routeDeps.sitemapService.createSeoEventSubscriptions({}, {});
  void routeDeps.bus.subscribe({ eventName: SITEMAP_INVALIDATED_EVENT, handler: seoEventSubscriptions.onSitemapInvalidated });
  void routeDeps.bus.subscribe({ eventName: "entry.published", handler: seoEventSubscriptions.onEntryPublished });
  void routeDeps.bus.subscribe({ eventName: "entry.updated", handler: seoEventSubscriptions.onEntryUpdated });
  void routeDeps.bus.subscribe({ eventName: "entry.unpublished", handler: seoEventSubscriptions.onEntryUnpublished });

  // Site search (lots S3/S4): the indexer re-loads each post/page an entry event names and writes the
  // current truth (document or tombstone) to every current index. Errors propagate so the outbox
  // redelivers. A composition without `siteSearch` subscribes nothing (`modules/site-search.ts`).
  subscribeSiteSearchIndexer({ bus: routeDeps.bus, runtime: routeDeps.siteSearch });

  const newsletterAdminDeps = routeDeps;
  // T040 (tasks.md Phase 4) — the `newsletter.send.batch.claimed` bus subscriber `send-pipeline.ts`'s
  // own file header names as the one piece of Stage 4 wiring no composition root had done yet
  // (found while wiring Stage 5's `send-campaign.ts`, which is the only real caller of `claimBatch`/
  // `processOutbox` for this campaign). Mirrors the demonstration subscription to `workspace.created`
  // above. In practice this handler is never reached in either composition root today:
  // `authorizeSend`'s Launch Gate check always rejects before `freezeAudience` ever enqueues a batch,
  // because precondition (a) `isSendingEnabled` always resolves `false` (`routes/newsletter/deps.ts`'s
  // `toSendPipelineDeps`) and (b) both composition roots bind `membersConsentCapability: null`
  // (tasks.md's disclosed, by-design "Real Sending Is Inherently Blocked Today" flag). Precondition
  // (d) is no longer the blocker — hosted-API (plugin) and SMTP adapters resolve (`boot/resolve-mailer.ts`),
  // corrected 2026-09-16. Wired now anyway so the pipeline is genuinely complete end to end the
  // moment (a) and (b) are met, not silently half-wired.
  void routeDeps.bus.subscribe<SendBatchJob>({
    eventName: SEND_BATCH_CLAIMED_EVENT,
    handler: async (event) => {
      await handleSendBatchClaimed({ deps: toSendPipelineDeps(newsletterAdminDeps), job: event.payload });
    },
  });

  /**
   * ADR-046 Phase 3 (SPEC-031) — SPEC-010 (Forms) outbox wiring, now split across two
   * feature-owned modules instead of two inline blocks: `forms` owns the C-009 notify
   * subscriber (its own business logic); `integrations` owns the webhook-fanout subscriber to
   * the SAME `form.submission.received` topic (cross-feature integration owned by the
   * consumer, per the ADR's explicit Phase 3 rule — see `modules/integrations.ts`'s header).
   */
  startModule(
    createFormsModule({
      outbox: routeDeps.outbox,
      fileCleanup: {
        withHashLock: withSha256Lock,
        withStorageKeyLock: withFormFileStorageKeyLock,
        hasStorageKeyOwners: input => hasFormFileStorageKeyOwners({ kernel: routeDeps.contentKernel, ...input }),
        findBlob: input => routeDeps.assetBlobRepo.findByHash(input),
        // This is a delayed cold GC job, never a visitor or upload hot path. Without a
        // persistent content database we cannot prove orphanhood, so retain the bytes.
        hasOwners: input => routeDeps.contentKernel
          ? hasFormFileOwners({ kernel: routeDeps.contentKernel, ...input }) : Promise.resolve(true),
        deleteBytes: input => routeDeps.blobStore.remove(input),
        removeBlob: input => routeDeps.assetBlobRepo.remove(input),
      },
      visitorAnalyticsDeliveryAllowed: routeDeps.visitorAnalyticsDeliveryAllowed,
      bus: routeDeps.bus,
      mailer: routeDeps.mailer,
      formDefinitionRepo: routeDeps.formDefinitionRepo,
      formSubmissionRepo: routeDeps.formSubmissionRepo,
      tracker: routeDeps.visitorTracker ?? routeDeps.tracker,
      senderIdentity: routeDeps.mailSenderIdentity,
    })
  );
  startModule(
    createIntegrationsModule({
      bus: routeDeps.bus,
      formDelivery: routeDeps.formDelivery,
      webhookSubscriptionRepo: routeDeps.webhookSubscriptionRepo,
      webhookDeliveryRepo: routeDeps.webhookDeliveryRepo,
      idGen: routeDeps.idGen,
      clock: routeDeps.clock,
    })
  );
}
