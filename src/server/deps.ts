import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { InMemoryEventBus, InMemoryOutbox } from "../core/events";
import { InMemoryChangeSetRepo } from "../core/commands";
import { SqlitePostRepo } from "../features/post";
import { SqlitePresentationSettingsRepo } from "../features/presentation";
import { SqliteSettingsRepo } from "../features/settings/repo.sqlite";
import { discoverThemes } from "../features/theme";
import { SqliteWorkspaceRepo } from "../features/workspace";
import { openContentDb } from "../infra/sqlite/content-db";
import { ensureSeoSettingDefinitions } from "../seo";
import { installNewsletterDataModule } from "../newsletter/data-module-manifest";
import { ensureDefaultList } from "../newsletter/lists";
import {
  SqliteNewsletterAudienceSnapshotRepo,
  SqliteNewsletterCampaignRepo,
  SqliteNewsletterConfirmationTokenRepo,
  SqliteNewsletterListRepo,
  SqliteNewsletterSendRepo,
  SqliteNewsletterSubscriptionRepo,
} from "../newsletter/repo.sqlite";
import { seededWorkspace, seedSettingsFromPresentation, SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID } from "./seed";
import { LocalBufferSink } from "../analytics/repo.memory";
import {
  ConsoleMailerAdapter,
  InMemoryMagicLinkTokenRepo,
  InMemoryMemberRepo,
  InMemoryMemberSessionRepo,
  InMemoryMemberSubscriptionRepo,
  InMemoryMemberTierRepo,
} from "../members";
import { rebuildNavLocationBindings } from "../navigation/reconcile";
import { SqliteMenuRepo, SqliteNavLocationBindingRepo } from "../navigation/repo.sqlite";
import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "../integrations";
import { createFixedSecretSigner } from "../integrations/signing";
import {
  InMemoryAssetBlobRepo,
  InMemoryAssetRenditionRepo,
  InMemoryMediaRepo,
  InMemoryTransformDefinitionRepo,
  LocalFsBlobStore,
  SharpImageTransformer,
} from "../media";
import { createInMemoryIdentityRouteDeps } from "../identity";
import { SqliteFormDefinitionRepo, SqliteFormSubmissionRepo } from "../forms/repo.sqlite";
import { FORMS_SUBMIT_PROFILE } from "../forms/rate-limit-profile";
import { createRateLimiter } from "./middleware/rate-limit";
import type { RouteDeps } from "./routes/types";
import type { NewsletterRouteDeps } from "./routes/admin/newsletter/deps";
import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "../origin";
import {
  RedirectHitSinkImpl,
  RedirectPhaseHandlerResolver,
  redirectMatcher,
  RedirectSlugChangeCapture,
  registerRedirectHitOutboxHandler,
  registerRedirectsPhaseHandlers,
  SqliteRedirectRepo,
  type RedirectsWriteDeps,
} from "../redirects";
import { registerSlugChangeCapture } from "../routing";

/**
 * Root directory `LocalFsBlobStore` writes blob bytes under (ADR-012 `uploads/`
 * convention, mirroring `builtInThemesDir()`/`defaultContentDbPath()` above).
 */
export function mediaUploadsDir(): string {
  return process.env.TOVU_MEDIA_UPLOADS_DIR ?? join(process.cwd(), "uploads");
}

/** Built-in themes ship in the repo-root `themes/` dir (SPEC-004 spike). */
export function builtInThemesDir(): string {
  return process.env.TOVU_THEMES_DIR ?? join(process.cwd(), "themes");
}

/**
 * @file SQLite-backed composition of route dependencies.
 *
 * Purpose:
 * Builds the same `RouteDeps` shape the in-memory path produces, but with the
 * three feature repos backed by a persistent content.db.
 *
 * How it relates to the project:
 * - Used by the process entrypoint (`index.ts`) for the running server.
 * - Tests keep using the in-memory default in `server/app.ts` (hermetic).
 *
 * Note: outbox + event bus remain in-memory for now (events are fire-on-write
 * side effects, not yet durable across restarts) — a durable outbox is a later
 * slice. Persistence here covers the content model (workspaces/posts/themes).
 */
export function defaultContentDbPath(): string {
  return process.env.TOVU_CONTENT_DB ?? "content.db";
}

export function createSqliteRouteDeps(dbPath: string = defaultContentDbPath()): NewsletterRouteDeps {
  const db = openContentDb(dbPath);
  const clock = { nowIso: () => new Date().toISOString() };
  const idGen = { newId: () => randomUUID() };
  // No SQLite adapter exists yet for `identity` either — in-memory, same disclosed precedent as
  // members/navigation/integrations/analytics/media below (see identity/INFO.md).
  const identity = createInMemoryIdentityRouteDeps({ workspaceId: seededWorkspace.id, clock, idGen });
  const presentationRepo = new SqlitePresentationSettingsRepo(db);
  const settingsRepo = new SqliteSettingsRepo(db);
  // Fire-and-forget, mirroring `identityReady` (see routes/types.ts's `settingsReady` doc) — this
  // composition root stays synchronous; consumers await `settingsReady` before relying on the
  // migrated value being present.
  const settingsReady = seedSettingsFromPresentation({
    presentationRepo,
    settingsRepo,
    clock,
    ids: idGen,
    principals: identity.principalRepo,
    systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID,
  }).then(() => undefined);
  // SPEC-008 (ADR-PIPE-008 Decision §3, T050) — idempotently registers the 8 `site.seo.*`
  // definitions at boot, mirroring `settingsReady`'s fire-and-forget shape. Chained AFTER
  // `settingsReady` resolves, not fired in parallel with it — both are SQLite writers on the
  // SAME single better-sqlite3 connection, and `SettingsWriteService`'s chokepoint opens a real
  // `BEGIN IMMEDIATE` transaction; two independent async chains racing to BEGIN on one connection
  // throws "cannot start a transaction within a transaction" (caught directly, not theoretical).
  const seoReady = settingsReady.then(() =>
    ensureSeoSettingDefinitions(
      { settingsRepo, clock, ids: idGen, principals: identity.principalRepo },
      { workspaceId: seededWorkspace.id, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }
    ).then(() => undefined)
  );

  // ADR-PIPE-012 D-5/D-8 (T043/T044): the persistent composition root uses the real SQLite
  // adapters for both navigation repo ports, and runs the binding-index rebuild once at boot
  // (after the SQLite db above has already opened) so the derived index starts in sync with
  // whatever menus this content.db already holds. Fire-and-forget, mirroring `settingsReady`'s
  // shape — logged and swallowed rather than aborting boot, matching W-003's "logs and continues
  // on failure" contract (ADR-PIPE-012 Wiring Map).
  const menuRepo = new SqliteMenuRepo(db);
  const navLocationBindingRepo = new SqliteNavLocationBindingRepo(db);
  const menuBindingsReady = rebuildNavLocationBindings({
    menuRepo,
    bindingRepo: navLocationBindingRepo,
    clock,
    workspaceId: seededWorkspace.id,
  })
    .then(() => undefined)
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`rebuildNavLocationBindings failed at boot: ${(err as Error).message}`);
    });
  void menuBindingsReady;

  // SPEC-011 (Newsletter, ADR-PIPE-011 T011/W-010): boot-time `declareDataModule()` invocation for
  // Newsletter's real 5-table manifest, against the SAME raw better-sqlite3 handle underneath the
  // Drizzle `ContentDb` (mirrors `SqliteSettingsRepo.transaction`'s `$client` cast). Idempotent —
  // `declareDataModule()`'s own skip-if-exists logic makes repeated boot calls safe (T010 proves the
  // failure/rollback path separately). Fire-and-forget, mirroring `menuBindingsReady`'s shape: logged
  // and swallowed rather than aborting boot on failure — a failed install leaves Newsletter's admin
  // routes 404/500ing against missing tables, but never bricks the rest of the server.
  const newsletterClient = (db as unknown as { $client: import("better-sqlite3").Database }).$client;
  const newsletterListRepo = new SqliteNewsletterListRepo(db);
  // T030: seed the workspace's default "all subscribers" list right after the tables exist —
  // idempotent (`ensureDefaultList` is itself a find-or-create), matching `declareDataModule()`'s own
  // skip-if-exists convention.
  const newsletterReady = installNewsletterDataModule(newsletterClient, dbPath)
    .then(() => ensureDefaultList({ deps: { listRepo: newsletterListRepo, clock, ids: idGen }, input: { workspaceId: seededWorkspace.id } }))
    .then(() => undefined)
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`installNewsletterDataModule failed at boot: ${(err as Error).message}`);
    });

  // SPEC-009 (Redirects, ADR-PIPE-009) — FIRST-TIME composition-root wiring of `origin`'s
  // OriginRegistry and `routing`'s registration functions, mirroring `server/app.ts`'s identical
  // wiring. `origin` has no SQLite adapter yet (same disclosed "no SQLite adapter yet" precedent as
  // members/navigation-bindings/analytics/media above — see `origin/repo.memory.ts`'s file header),
  // so `InMemoryOriginSettingRepo` backs `OriginRegistry` even in this real-server composition;
  // `redirects` DOES get its real `SqliteRedirectRepo` here (unlike the in-memory-only libraries
  // above), since T014 built a full rule-of-two adapter for it.
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const originRegistry = new OriginRegistry({
    repo: new InMemoryOriginSettingRepo([
      {
        workspaceId: seededWorkspace.id,
        origin: createVerifiedOrigin({
          scheme: "http",
          host: "localhost",
          port: 3000,
          verifiedAt: clock.nowIso(),
          source: "dev-capability",
        }),
      },
    ]),
  });
  const redirectRepo = new SqliteRedirectRepo(db);
  const redirectHitSink = new RedirectHitSinkImpl();
  const redirectsWriteDeps: RedirectsWriteDeps = {
    repo: redirectRepo,
    db: redirectRepo,
    transaction: (fn) => redirectRepo.transaction(fn),
    matcher: redirectMatcher,
    originRegistry,
    clock,
    idGen,
    outbox,
  };
  registerRedirectsPhaseHandlers({
    resolver: new RedirectPhaseHandlerResolver({
      repo: redirectRepo,
      matcher: redirectMatcher,
      originRegistry,
      hits: { outbox, clock, idGen },
    }),
  });
  registerSlugChangeCapture(
    new RedirectSlugChangeCapture({ repo: redirectRepo, db: redirectRepo, clock, idGen })
  );
  void registerRedirectHitOutboxHandler({ bus, hitSink: redirectHitSink });

  return {
    workspaceId: seededWorkspace.id,
    workspaceRepo: new SqliteWorkspaceRepo(db),
    postRepo: new SqlitePostRepo(db),
    presentationRepo,
    settingsRepo,
    seoReady,
    settingsReady,
    changeSets: new InMemoryChangeSetRepo(),
    themes: discoverThemes(builtInThemesDir(), "built-in"),
    outbox,
    bus,
    clock,
    idGen,
    // No SQLite adapters exist yet for these newer libraries (members/navigation/integrations/
    // analytics) — in-memory here too, same as changeSets/outbox/bus above, until each grows one.
    analyticsSink: new LocalBufferSink(),
    ...identity,
    redirectRepo,
    redirectHitSink,
    originRegistry,
    redirectsWriteDeps,
    memberRepo: new InMemoryMemberRepo([]),
    memberTierRepo: new InMemoryMemberTierRepo([]),
    memberSubscriptionRepo: new InMemoryMemberSubscriptionRepo([]),
    memberSessionRepo: new InMemoryMemberSessionRepo([]),
    magicLinkRepo: new InMemoryMagicLinkTokenRepo([]),
    mailer: new ConsoleMailerAdapter(),
    menuRepo,
    navLocationBindingRepo,
    webhookSubscriptionRepo: new InMemoryWebhookSubscriptionRepo(),
    webhookDeliveryRepo: new InMemoryWebhookDeliveryRepo(),
    webhookSigner: createFixedSecretSigner(new Map()),
    // `media` (ADR-027 walking skeleton): rows stay in-memory (same disclosed precedent as the
    // other newer libraries above — no SQLite adapter built for this pass), but bytes use the
    // real `LocalFsBlobStore` here (unlike `server/app.ts`'s hermetic-test composition) because
    // durable byte storage is the one piece of Media that's pointless to fake in the actual
    // running server — the local filesystem adapter is ADR-006's "one being built now" half.
    mediaRepo: new InMemoryMediaRepo([]),
    assetBlobRepo: new InMemoryAssetBlobRepo([]),
    assetRenditionRepo: new InMemoryAssetRenditionRepo([]),
    blobStore: new LocalFsBlobStore({ rootDir: mediaUploadsDir() }),
    // ADR-027 §4 transform registry + rendition generation (new in this task): registry rows stay
    // in-memory (no SQLite adapter yet, same precedent as the media repos above), but the real
    // running server gets `SharpImageTransformer` (unlike `server/app.ts`'s hermetic-test
    // composition, which uses the deterministic in-memory double) — DISCLOSED BLOCKER: `sharp` is
    // not an installed dependency in this repo as of this task, so `SharpImageTransformer` will
    // throw `ImageTransformUnavailableError` the first time a real transform is requested against
    // this composition, until `npm install sharp` is run. See
    // `src/media/image-transformer.sharp.ts`'s file header.
    transformDefinitionRepo: new InMemoryTransformDefinitionRepo([]),
    imageTransformer: new SharpImageTransformer(),
    // SPEC-011 (Newsletter): real SQLite adapters for all 6 repo ports (the campaign pair is
    // Drizzle-backed; the 5 `p_newsletter__*` tables are raw-SQL, `declareDataModule()`-created —
    // see `newsletterReady` above). `membersConsentCapability` stays `null` (unbound) — Members has
    // not shipped a real capability this pass (ADR-PIPE-011 Risks item 3); Newsletter must not
    // substitute a local stand-in that returns success by default.
    newsletterReady,
    newsletterCampaignRepo: new SqliteNewsletterCampaignRepo(db),
    newsletterListRepo,
    newsletterSubscriptionRepo: new SqliteNewsletterSubscriptionRepo(db),
    newsletterAudienceSnapshotRepo: new SqliteNewsletterAudienceSnapshotRepo(db),
    newsletterSendRepo: new SqliteNewsletterSendRepo(db),
    newsletterConfirmationTokenRepo: new SqliteNewsletterConfirmationTokenRepo(db),
    membersConsentCapability: null,
    // SPEC-010 (Forms, Tier-1 sample plugin, ADR-PIPE-010): the real SQLite rule-of-two adapters
    // (unlike the several "no SQLite adapter yet" libraries noted above — Forms' C-012 ports both
    // ship one). `formsRateLimiter` is one process-lifetime counter store, matching
    // `server/app.ts`'s hermetic-test composition's identical construction.
    formDefinitionRepo: new SqliteFormDefinitionRepo(db),
    formSubmissionRepo: new SqliteFormSubmissionRepo(db),
    formsRateLimiter: createRateLimiter(FORMS_SUBMIT_PROFILE, clock),
  };
}
