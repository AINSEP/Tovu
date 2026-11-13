### tovu:apps/website/src/features/newsletter/tool-registrations.ts
- **Over:** `buildNewsletterRegistrations` 177 (file 415, under)
- **Phase:** after-move (MOVE-AFTER write-service.ts; STAY-WIRING) · **Batch:** size-50
- **Tests:** `apps/website/src/features/newsletter/__tests__/tool-registrations.model-facing-errors.test.ts`, `apps/website/src/features/newsletter/__tests__/delivery-tools.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.newsletter.test.ts`, `apps/website/src/assistant/__tests__/merged-readers-batch.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `NewsletterToolDeps`, `toCampaignWriteServiceDeps`, `toListsDeps`, `toConfirmationDeps`, `toSubscriptionsDeps`, `toUnsubscribeSubscriptionDeps`, `toNewsletterSendPipelineDeps` | deps-bag adapters (stay) |
| B | `newsletterDerivedRisk`, `toCampaignToolView`, `toListToolView`, `toSubscriptionToolView`, `toSendLogToolView`, `NEWSLETTER_MODEL_FACING_ERRORS`, `resendPendingSubscriptionConfirmation` | risk + model-facing views (stay) |
| C | `buildNewsletterRegistrations` `handlers` literal keys `newsletter_list_campaigns` … `newsletter_list_send_log` | read handlers |
| D | keys `newsletter_create_campaign`, `newsletter_update_campaign`, `newsletter_cancel_campaign`, `newsletter_pause_campaign` | campaign write handlers |
| E | keys `newsletter_create_list`, `newsletter_archive_list`, `newsletter_create_subscription`, `newsletter_remove_subscription`, `newsletter_resend_confirmation` | list + subscription (audience) write handlers |

- **Splits:**
  1. HELPERS in `buildNewsletterRegistrations` (same file, directly above it, in this order). Shared input type (plan-named) `interface NewsletterHandlersInput { deps: NewsletterToolDeps }`:
     - `buildNewsletterReadHandlers({ deps }: NewsletterHandlersInput): Record<string, ToolHandler>` ← handler entries `newsletter_list_campaigns: async (ctx) => {` through the end of `newsletter_list_send_log` (~L339-388), returned as an object literal, same key order.
     - `buildNewsletterCampaignWriteHandlers({ deps }: NewsletterHandlersInput): Record<string, ToolHandler>` ← entries `newsletter_create_campaign` through `newsletter_pause_campaign` (~L389-463).
     - `buildNewsletterAudienceWriteHandlers({ deps }: NewsletterHandlersInput): Record<string, ToolHandler>` ← entries `newsletter_create_list` through `newsletter_resend_confirmation` (~L464-534).
     - `buildNewsletterRegistrations` keeps `const handlers: Record<string, ToolHandler> = { ...buildNewsletterReadHandlers({ deps }), ...buildNewsletterCampaignWriteHandlers({ deps }), ...buildNewsletterAudienceWriteHandlers({ deps }) };` (key insertion order unchanged) and its `return buildDomainRegistrations({ metadata: toolMetadata,` statement with its "No `unwiredToolIds`" comment.
- **Importers to update:** none (helpers are module-private; exports unchanged).
- **After:** file ~425; `buildNewsletterRegistrations` ~14; helpers ~48 / ~72 / ~68.
- **Risks / notes:** Comments inside each handler entry move with the entry. Handlers close over `deps` only (outline: `uses: deps`), so no other locals cross. `_surfaces` param stays unused on the builder. After the move the write-service code leaves; the handler groups stay as STAY-WIRING.
