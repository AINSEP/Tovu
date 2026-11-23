import { InMemoryMemberTierRepo, InMemoryMemberSubscriptionRepo, InMemoryMemberSessionRepo, InMemoryMagicLinkTokenRepo } from "@jini-ai/user-management/members/repo.memory";
import { createConsoleMailProvider, toPositionalMailer } from "@jini-ai/platform/mail";
import { wrapMailerWithPurposeGate } from "#src/platform/mail/purpose-scoped-mailer";
import type { OutboundEmail } from "#src/platform/mail/index";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { InMemoryWebhookSubscriptionRepo, InMemoryWebhookDeliveryRepo } from "#src/features/webhooks/index";
import { createKeyringBackedSigner } from "@jini-ai/integrations/webhooks/site/signing.keyring";
import { InMemoryImageTransformer } from "#src/features/media/index";
import { SharpImageTransformer } from "@jini-ai/cms/media/node";
import { ensureDefaultList } from "@jini-ai/user-management/newsletter/lists";
import { seededWorkspace } from "../../../configuration/seed.js";
import { InMemoryNewsletterCampaignRepo, InMemoryNewsletterSubscriptionRepo, InMemoryNewsletterAudienceSnapshotRepo, InMemoryNewsletterSendRepo, InMemoryNewsletterConfirmationTokenRepo } from "@jini-ai/user-management/newsletter/repo.memory";
import { formSubmissionAttemptsFor } from "#src/features/forms/index";
import { removeEntityWithoutBlocker } from "@jini-ai/cms/trash/site/remove-without-blocker";
import { bindRemoveEntity } from "@jini-ai/cms/trash";
import { executeCommand } from "@jini-ai/cms/core";
import { createRateLimiter, SITE_ASSISTANT_PER_IP } from "#src/contracts/core/rate-limit/rate-limit";
import { FORMS_SUBMIT_PROFILE } from "#src/features/forms/rate-limit-profile";
import { InMemoryDatabaseLedgerRepo, InMemoryMigrationRunsRepo } from "#src/features/database/repo.memory";
import type { MemoryRootContext, MemoryRouteDeps } from "./context.js";

/** Nothing is delivered locally, so the preview is the mail: the full body carries the sign-in or
 * confirmation link an operator has to be able to follow from the log. */
function logConsoleMail({ message }: { message: OutboundEmail }): void {
  const body = message.text ?? message.html;
  console.log(`[mail:console] to=${message.to.email} subject=${JSON.stringify(message.subject)}${body === undefined ? "" : `\n${body}`}`);
}

/** Redirects, members, mailer, menus, webhooks and the media stores. */
export function memoryMemberMediaDeps(required: MemoryRootContext, _optional = {}) {
  const {
    assetBlobRepo,
    assetRenditionRepo,
    blobStore,
    mediaContentTypeStore,
    mediaRepo,
    memberRepo,
    menuRepo,
    navLocationBindingRepo,
    newsletterKeyring,
    originRegistry,
    redirectHitSink,
    redirectRepo,
    redirectsWriteDeps,
    transformDefinitionRepo,
  } = required;
  return {
    redirectRepo,
    redirectHitSink,
    originRegistry,
    redirectsWriteDeps,
    memberRepo,
    memberTierRepo: new InMemoryMemberTierRepo({}, { initialRows: [] }),
    memberSubscriptionRepo: new InMemoryMemberSubscriptionRepo({}, { initialRows: [] }),
    memberSessionRepo: new InMemoryMemberSessionRepo({}, { initialRows: [] }),
    magicLinkRepo: new InMemoryMagicLinkTokenRepo({}, { initialRows: [] }),
    // SPEC-022 REQ-09/REQ-10 — see deps.ts's identical wiring for the rationale. This hermetic
    // composition resolves `local` by default (no test sets TOVU_RUNTIME_MODE), so the gate stays
    // inert here — existing tests are unaffected (INV-06).
    mailer: wrapMailerWithPurposeGate({
      inner: toPositionalMailer({ mailer: createConsoleMailProvider({ clock: { nowMs: () => Date.now() }, preview: logConsoleMail }).create({ credential: { token: "" }, kit: {} as never }) }),
      mode: resolveRuntimeMode(),
      durableOutboxReady: () => false,
    }),
    menuRepo,
    navLocationBindingRepo,
    webhookSubscriptionRepo: new InMemoryWebhookSubscriptionRepo(),
    webhookDeliveryRepo: new InMemoryWebhookDeliveryRepo(),
    // ADR-PIPE-015 Phase 1 T017: the real createKeyringBackedSigner code path, backed by an
    // in-memory KeyringPort so this hermetic test/dev composition never touches a real file or
    // env var. The delivery worker is still the first real consumer — activation stays gated
    // (Phase 4) until the real KeyringPort/HttpClientPort/SQLite adapters are wired in deps.ts.
    webhookSigner: createKeyringBackedSigner({ keyring: newsletterKeyring }),
    // `media` (ADR-027 walking skeleton): in-memory rows + in-memory blob bytes here so tests
    // stay hermetic (no filesystem writes) — the real running server (`apps/website/src/server/runtime/composition/deps.ts`) uses
    // `LocalFsBlobStore` for actual byte durability while keeping rows in-memory too (see that
    // file's comment for why: no SQLite adapter exists yet for this newer library, matching the
    // disclosed precedent the last several admin-section libraries followed).
    mediaRepo,
    assetBlobRepo,
    assetRenditionRepo,
    mediaContentTypeStore,
    blobStore,
    // ADR-027 §4 transform registry + rendition generation (new in this task): in-memory registry
    // rows (no SQLite adapter yet, same disclosed precedent as the media repos above) and the
    // deterministic `InMemoryImageTransformer` test double here so hermetic tests never depend on
    // `sharp` being installed — see `src/media/image-transformer.sharp.ts`'s file header for the
    // disclosed blocker on the real adapter, which `apps/website/src/server/runtime/composition/deps.ts` wires instead.
    transformDefinitionRepo,
    imageTransformer: new InMemoryImageTransformer(),
    imageCodec: new SharpImageTransformer(),
  } satisfies Partial<MemoryRouteDeps>;
}

/** Newsletter repos, forms, rate limiters and the database ledger. */
export function memoryNewsletterFormsDeps(required: MemoryRootContext, _optional = {}) {
  const {
    clock,
    formDefinitionRepo,
    formSubmissionRepo,
    idGen,
    newsletterHooks,
    newsletterKeyring,
    newsletterListRepoInMemory,
    newsletterSubscriberDirectory,
    trash,
  } = required;
  return {
    // SPEC-011 (Newsletter): in-memory adapters — no `declareDataModule()` boot step needed (that
    // mechanism is SQLite-only), so `newsletterReady` resolves immediately, unlike `apps/website/src/server/runtime/composition/deps.ts`'s
    // real fire-and-forget install. `membersConsentCapability` stays `null` (unbound) — see that
    // file's identical note.
    // T030: seed the default "all subscribers" list once, same as `apps/website/src/server/runtime/composition/deps.ts`'s real boot path.
    newsletterReady: ensureDefaultList({
      deps: { listRepo: newsletterListRepoInMemory, clock, ids: idGen },
      input: { workspaceId: seededWorkspace.id },
    }).then(() => undefined),
    newsletterCampaignRepo: new InMemoryNewsletterCampaignRepo(),
    newsletterListRepo: newsletterListRepoInMemory,
    newsletterSubscriptionRepo: new InMemoryNewsletterSubscriptionRepo(),
    newsletterAudienceSnapshotRepo: new InMemoryNewsletterAudienceSnapshotRepo(),
    newsletterSendRepo: new InMemoryNewsletterSendRepo(),
    newsletterConfirmationTokenRepo: new InMemoryNewsletterConfirmationTokenRepo(),
    membersConsentCapability: null,
    // Stage 5 (routes) wiring — see the hoisted-vars comment above `commentsModule`/return.
    newsletterSubscriberDirectory,
    newsletterKeyring,
    newsletterHooks,
    // SPEC-010 (Forms, Tier-1 sample plugin, ADR-PIPE-010): in-memory adapters, matching every
    // other core-owned-table feature's hermetic test/dev composition. `formsRateLimiter` is one
    // process-lifetime `FORMS_SUBMIT_PROFILE` counter store (constructed once here, not
    // per-request) so its fixed-window counts persist across requests within one `createApp()`.
    formDefinitionRepo,
    formSubmissionRepo,
    formSubmissionAttempts: formSubmissionAttemptsFor({ submissionRepo: formSubmissionRepo }),
    removeFormSubmission: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: "form_submission"
    }) }),
    executeCommand,
    formsRateLimiter: createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock }),
    // SPEC-046 REQ-7 — same one-process-lifetime-counter-store shape as `formsRateLimiter` above,
    // matching `apps/website/src/server/runtime/composition/deps.ts`'s real composition's identical construction.
    siteAssistantRateLimiter: createRateLimiter({ profile: SITE_ASSISTANT_PER_IP, clock }),
    // ADR-041 §1/§2 (Database Timeline): in-memory ledger, same disclosed precedent as every other
    // feature's hermetic test/dev composition above. `apps/website/src/server/runtime/composition/deps.ts`'s real composition opens
    // the sidecar `ops/database-journal.db` and uses `SqliteDatabaseLedgerRepo` instead.
    databaseLedgerRepo: new InMemoryDatabaseLedgerRepo(),
    migrationRunsRepo: new InMemoryMigrationRunsRepo(),
  } satisfies Partial<MemoryRouteDeps>;
}
