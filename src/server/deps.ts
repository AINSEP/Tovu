import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { InMemoryEventBus, InMemoryOutbox } from "../core/events";
import { InMemoryChangeSetRepo } from "../core/commands";
import { SqlitePostRepo } from "../features/post";
import { SqlitePresentationSettingsRepo } from "../features/presentation";
import { discoverThemes } from "../features/theme";
import { SqliteWorkspaceRepo } from "../features/workspace";
import { openContentDb } from "../infra/sqlite/content-db";
import { seededWorkspace } from "./seed";
import { LocalBufferSink } from "../analytics/repo.memory";
import {
  ConsoleMailerAdapter,
  InMemoryMagicLinkTokenRepo,
  InMemoryMemberRepo,
  InMemoryMemberSessionRepo,
  InMemoryMemberSubscriptionRepo,
  InMemoryMemberTierRepo,
} from "../members";
import { InMemoryMenuRepo, InMemoryNavLocationBindingRepo } from "../navigation/repo.memory";
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
import type { RouteDeps } from "./routes/types";

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

export function createSqliteRouteDeps(dbPath: string = defaultContentDbPath()): RouteDeps {
  const db = openContentDb(dbPath);
  const clock = { nowIso: () => new Date().toISOString() };
  const idGen = { newId: () => randomUUID() };
  // No SQLite adapter exists yet for `identity` either — in-memory, same disclosed precedent as
  // members/navigation/integrations/analytics/media below (see identity/INFO.md).
  const identity = createInMemoryIdentityRouteDeps({ workspaceId: seededWorkspace.id, clock, idGen });

  return {
    workspaceId: seededWorkspace.id,
    workspaceRepo: new SqliteWorkspaceRepo(db),
    postRepo: new SqlitePostRepo(db),
    presentationRepo: new SqlitePresentationSettingsRepo(db),
    changeSets: new InMemoryChangeSetRepo(),
    themes: discoverThemes(builtInThemesDir(), "built-in"),
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    clock,
    idGen,
    // No SQLite adapters exist yet for these newer libraries (members/navigation/integrations/
    // analytics) — in-memory here too, same as changeSets/outbox/bus above, until each grows one.
    analyticsSink: new LocalBufferSink(),
    ...identity,
    memberRepo: new InMemoryMemberRepo([]),
    memberTierRepo: new InMemoryMemberTierRepo([]),
    memberSubscriptionRepo: new InMemoryMemberSubscriptionRepo([]),
    memberSessionRepo: new InMemoryMemberSessionRepo([]),
    magicLinkRepo: new InMemoryMagicLinkTokenRepo([]),
    mailer: new ConsoleMailerAdapter(),
    menuRepo: new InMemoryMenuRepo(),
    navLocationBindingRepo: new InMemoryNavLocationBindingRepo(),
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
  };
}
