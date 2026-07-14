import type { Express } from "express";

import type { EventBusPort, OutboxPort, UUID } from "../../core/ports";
import type { AuthorizeFn, ChangeSetRepoPort } from "../../core/commands";
import type {
  PasswordHasherPort,
  PolicyPermissionRepoPort,
  PolicyRepoPort,
  PrincipalPolicyRepoPort,
  PrincipalRepoPort,
  PrincipalRoleRepoPort,
  RolePolicyRepoPort,
  RoleRepoPort,
  SessionRepoPort,
  UserRepoPort,
} from "../../identity";
import type { PostRepoPort } from "../../features/post";
import type { PresentationSettingsRepoPort } from "../../features/presentation";
import type { SettingsRepoPort } from "../../features/settings/ports";
import type { DiscoveredTheme } from "../../features/theme";
import type { WorkspaceRepoPort } from "../../features/workspace";
import type { LocalBufferSink } from "../../analytics/repo.memory";
import type {
  MagicLinkTokenRepoPort,
  MemberRepoPort,
  MemberSessionRepoPort,
  MemberSubscriptionRepoPort,
  MemberTierRepoPort,
} from "../../members";
import type { MailerPort } from "../../mail";
import type { MenuRepoPort } from "../../navigation/repo.memory";
import type { NavLocationBindingRepoPort } from "../../navigation";
import type { WebhookDeliveryRepoPort, WebhookSubscriptionRepoPort } from "../../integrations";
import type { WebhookSigner } from "../../integrations/signing";
import type {
  AssetBlobRepoPort,
  AssetRenditionRepoPort,
  BlobStorePort,
  ImageTransformerPort,
  MediaRepoPort,
  TransformDefinitionRepoPort,
} from "../../media";
import type { OriginRegistryPort } from "../../origin";
import type { RedirectHitSink, RedirectRepoPort, RedirectsWriteDeps } from "../../redirects";
import type { FormDefinitionRepoPort, FormSubmissionRepoPort } from "../../forms/ports";
import type { RateLimiter } from "../middleware/rate-limit";

export interface RouteDeps {
  workspaceId: UUID;
  workspaceRepo: WorkspaceRepoPort;
  postRepo: PostRepoPort;
  presentationRepo: PresentationSettingsRepoPort;
  /**
   * SPEC-007 — the settings ledger's repo port. `core.commands.appliers`
   * (via `revert.ts`) reads through this now instead of
   * `PresentationSettingsRepoPort` (ADR-PIPE-007 Migration Safety); the
   * admin `settings.*` routes (Phase 5, not yet wired) will consume it too.
   */
  settingsRepo: SettingsRepoPort;
  /**
   * Resolves once the one-time `migrateLegacyPresentationSettings()` boot
   * migration (SPEC-007 REQ-08) completes. Mirrors `identityReady`'s
   * fire-and-forget pattern (`identity/wiring.ts`): the composition roots
   * stay synchronous, and any settings-reading route/consumer should await
   * this before treating `settingsRepo` reads as post-migration-complete.
   */
  settingsReady: Promise<void>;
  /**
   * SPEC-008 (ADR-PIPE-008 Decision §3, T012) — resolves once the one-time
   * `ensureSeoSettingDefinitions()` boot call registers the 7 `site.seo.*`
   * setting definitions. Mirrors `settingsReady`'s exact shape/convention;
   * the admin `seo` settings routes (`get-settings.ts`/`put-settings.ts`)
   * await this first, same as `settings/get-effective.ts` awaits `settingsReady`.
   */
  seoReady: Promise<void>;
  /** Change-set store for the command gateway (in-memory in v1, ADR-008/018). */
  changeSets: ChangeSetRepoPort;
  /** Themes discovered at boot (built-in + site themes/ dir), SPEC-004 spike. */
  themes: DiscoveredTheme[];
  outbox: OutboxPort;
  bus: EventBusPort;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  /** In-memory analytics ingest buffer (ADR-035 ingest-only stage; no rollup yet). */
  analyticsSink: LocalBufferSink;
  /** `members` library ports (ADR-030) — Members admin screen. */
  memberRepo: MemberRepoPort;
  memberTierRepo: MemberTierRepoPort;
  memberSubscriptionRepo: MemberSubscriptionRepoPort;
  memberSessionRepo: MemberSessionRepoPort;
  magicLinkRepo: MagicLinkTokenRepoPort;
  mailer: MailerPort;
  /** Local, navigation-owned menu repo (ADR-029; not a frozen ADR port). */
  menuRepo: MenuRepoPort;
  /** The one real ADR-029 port: the derived nav_location_bindings index. */
  navLocationBindingRepo: NavLocationBindingRepoPort;
  /** ADR-036 `webhook_subscriptions` persistence. */
  webhookSubscriptionRepo: WebhookSubscriptionRepoPort;
  /** ADR-036 `webhook_deliveries` persistence. */
  webhookDeliveryRepo: WebhookDeliveryRepoPort;
  /**
   * ADR-036 §5 outbound HMAC signer. DEV-ONLY placeholder wiring (see `createRouteDeps()`):
   * built via `createFixedSecretSigner` with an empty dev secret map, not a real
   * `KeyringPort`-derived signer. Not consumed by any route yet — the delivery worker is the
   * first real consumer.
   */
  webhookSigner: WebhookSigner;
  /**
   * `media` library ports (ADR-027 walking skeleton — see `src/media/INFO.md`
   * for the disclosed scope: bespoke `MediaRecord` table instead of the
   * not-yet-implemented generic entries model, no journaled GC, no transform
   * pipeline, no origin-isolated serving). `mediaRepo` is the bespoke table's
   * repo (not a frozen ADR port, same status as `menuRepo`); `assetBlobRepo`/
   * `assetRenditionRepo` are the two core-owned sidecars ADR-027 §2 specifies;
   * `blobStore` is the one real ADR-027 §1 `BlobStorePort`.
   */
  mediaRepo: MediaRepoPort;
  assetBlobRepo: AssetBlobRepoPort;
  assetRenditionRepo: AssetRenditionRepoPort;
  blobStore: BlobStorePort;
  /**
   * ADR-027 §4 named transform registry + rendition generation — new in this
   * task (see `src/media/rendition-service.ts` file header for the disclosed
   * scope: core-declared transforms only, in-process lazy single-flight
   * generation only). `transformDefinitionRepo` is the append-only
   * `transform_registry` sidecar; `imageTransformer` is the seam that
   * actually runs the pixel operation (`InMemoryImageTransformer` in the
   * hermetic test/dev composition, `SharpImageTransformer` in the real
   * running server — see `server/app.ts` / `server/deps.ts`).
   */
  transformDefinitionRepo: TransformDefinitionRepoPort;
  imageTransformer: ImageTransformerPort;
  /**
   * `identity` library repo ports (ADR-021 / SPEC-006) — principal-centric
   * auth. In-memory only this pass (see `identity/INFO.md`); real login,
   * sessions, and the RBAC seed run against these.
   */
  principalRepo: PrincipalRepoPort;
  userRepo: UserRepoPort;
  sessionRepo: SessionRepoPort;
  roleRepo: RoleRepoPort;
  policyRepo: PolicyRepoPort;
  policyPermissionRepo: PolicyPermissionRepoPort;
  rolePolicyRepo: RolePolicyRepoPort;
  principalRoleRepo: PrincipalRoleRepoPort;
  principalPolicyRepo: PrincipalPolicyRepoPort;
  /** argon2id hashing seam (INV-05) — see `identity/hasher.ts`. */
  passwordHasher: PasswordHasherPort;
  /**
   * Resolves once first-boot identity seeding (`identity/seed.ts`) completes.
   * Seeding hashes the owner's password (async, argon2id), so
   * `createRouteDeps()`/`createSqliteRouteDeps()` stay synchronous by kicking
   * the seed off immediately and handing back this promise; auth-adjacent
   * middleware/routes `await` it before touching identity repos, so
   * correctness never depends on request timing (no race).
   */
  identityReady: Promise<void>;
  /**
   * Bound closure over `identity.authorize()` + its repos (ADR-006/ADR-021 §2:
   * `authorize()` itself is ordinary core code, not a port — this field exists
   * so `core/commands` can call it without importing the `identity` library;
   * see `AuthorizeFn`'s doc in `core/commands/command.ts`).
   */
  authorize: AuthorizeFn;
  /**
   * `forms` library ports (SPEC-010, ADR-PIPE-010 — mirrors the existing
   * `webhookSubscriptionRepo`/`webhookDeliveryRepo` field-addition precedent). `formsRateLimiter`
   * is a single, process-lifetime `createRateLimiter(FORMS_SUBMIT_PROFILE, clock)` instance (not
   * constructed per-request) so its fixed-window counters persist across requests.
   */
  formDefinitionRepo: FormDefinitionRepoPort;
  formSubmissionRepo: FormSubmissionRepoPort;
  formsRateLimiter: RateLimiter;
  /**
   * SPEC-009 / ADR-PIPE-009 — `redirects` + first-time `origin` composition-
   * root wiring. `redirectRepo`/`redirectHitSink` back the admin HTTP surface
   * (Phase 2) and the `phase-handler.ts` read path; `originRegistry` is the
   * single open-redirect/canonical-origin oracle (ADR-040), wired into the
   * composition root for the first time by this feature — no other library
   * had a real consumer for it before now. `redirectsWriteDeps` bundles the
   * write chokepoint's full dependency set (repo/db/transaction/matcher/
   * originRegistry/clock/idGen/outbox) — a single pre-built object rather
   * than exposing the package-private `RedirectDbHandle`/transaction-wrapper
   * types on this shared file (INV-07's chokepoint boundary stays {
   * `redirects.ts`, `capture.ts`, `ports.internal.ts` } — routes only ever
   * see the already-composed `RedirectsWriteDeps`, never the raw db handle).
   */
  redirectRepo: RedirectRepoPort;
  redirectHitSink: RedirectHitSink;
  originRegistry: OriginRegistryPort;
  redirectsWriteDeps: RedirectsWriteDeps;
  /** SPIKE: seam for the sample Tier-3 store plugin (data lives in plugin-owned `p_store__*`
   * tables). Optional — only the SQLite runtime wires it (see `index.ts`). */
  store?: {
    listProducts(): { id: string; title: string; price: number; stock: number; version: number }[];
    checkout(
      productId: string,
      qty: number
    ):
      | { ok: true; orderId: string; remainingStock: number; retries: number }
      | { ok: false; reason: "not-found" | "out-of-stock" | "conflict"; retries: number };
  };
}

export type RouteRegistrar = (app: Express, deps: RouteDeps) => void;
