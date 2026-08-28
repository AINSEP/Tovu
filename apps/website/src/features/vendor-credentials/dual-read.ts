import type { UUID } from "@jini-ai/cms/core";

import type { SecretSealerPort } from "../webhooks/index.js";
import type { PublishConnectionInput, PublishCredentialSetRepoPort, PublishProviderId } from "../deployments/publish-credentials/index.js";
import type { SourceControlConnectionInput, SourceControlCredentialSetRepoPort, SourceControlProviderId } from "../source-control/types.js";
import { resolveDefaultForVendor } from "./store.js";
import { PUBLISH_PROVIDER_TO_VENDOR, SOURCE_CONTROL_PROVIDER_TO_VENDOR } from "./types.js";
import type { VendorConnectionInput, VendorCredentialSetRepoPort, VendorId } from "./types.js";

/**
 * @file The Phase 3 cutover seam: resolves the DEFAULT credential for a vendor by reading
 * `vendor_credential_sets` FIRST and falling back to whichever legacy table (`publish_credential_sets`
 * / `source_control_credential_sets`) used to carry that vendor ONLY when the new table's group is
 * empty. This is what lets `deployment_get_static_publish_capabilities` (and any future
 * source-control-operating caller) cut over to reading the new table WITHOUT regressing an install
 * whose data has not been backfilled yet — see this repo's own continuity notes on why a straight
 * cutover was rejected: the real production DB has zero `vendor_credential_sets` rows today, so
 * flipping the read path outright would report a working, already-configured GitHub Pages credential
 * as "not configured" until someone hand-runs `backfill-vendor-credentials.ts`. Dual-read removes that
 * risk unconditionally, for every install, regardless of whether the backfill has run.
 *
 * This module is INTENTIONALLY temporary. Once every install is confirmed migrated (the backfill
 * script proves it: `vendor_credential_sets` has a row for every legacy row), the legacy fallback
 * branches below should be deleted and every caller of {@link resolveDefaultForVendorDualRead} should
 * call `store.ts`'s `resolveDefaultForVendor` directly instead — the SAME "delete the dual-read path"
 * plan Phase 1's own AAD-strategy write-up already recorded as the cost of choosing this over a
 * straight cutover.
 *
 * ## Why this is its own file, not folded into `store.ts`
 *
 * `store.ts` owns ONLY the new table's CRUD/resolve contract — every one of its functions can be
 * deleted the day the two legacy tables are dropped, with zero trace of them ever having existed.
 * This module's entire reason to exist is the OPPOSITE: it depends on both legacy tables' own stores
 * and is the first thing to delete once they are gone. Keeping the two in separate files means "does
 * this code know about the legacy tables at all" is answerable by filename alone, and deleting this
 * file later can never accidentally take `store.ts`'s own contract down with it.
 *
 * ## The AAD trap this module must never reintroduce
 *
 * `publish-credentials/aad.ts`, `source-control/aad.ts`, and this feature's own `aad.ts` each derive
 * a DIFFERENT additional-authenticated-data string from `(workspaceId, providerId/vendorId, id)` —
 * never stored, always re-derived at open time (see any of those three files' own header). A legacy
 * row's ciphertext auth tag only verifies against ITS OWN table's AAD lineage; opening it with the
 * new table's AAD (or vice versa) fails closed, not silently. This module NEVER attempts to build a
 * "generic" decrypt path parameterized by lineage — it always delegates to the ALREADY-CORRECT
 * `resolveDefaultForVendor` (called directly) plus `deps.resolveLegacyPublish`/
 * `deps.resolveLegacySourceControl` (injected — see below), each of which derives its own table's AAD
 * internally. The three legacy-vs-new read paths stay genuinely separate all the way down to the
 * decrypt call; this module's own job stops at "which one has a row" and "reshape whichever
 * connection came back into `VendorConnectionInput`".
 *
 * ## Why the two legacy resolvers are INJECTED, not imported (2026-08-17 architecture SCC cut)
 *
 * This module used to value-import `resolveDefaultForPublish`
 * (`../deployments/publish-credentials/store`) and `resolveDefaultForSourceControl`
 * (`../source-control/store`) directly and call them by name. That closed a real cycle once
 * `source-control`/`deployments` tried to convert to the tool-contribution registry: `assistant`'s
 * own `REAL_VENDOR_CREDENTIAL_PORT` wiring reaches `features/vendor-credentials` (for
 * `list`/`create`/`update`/`providerToVendor` — genuinely load-bearing), which re-exports this
 * module, which reached back into `features/source-control`/`features/deployments` — see
 * `ADS-memory/reports/architecture/2026-08-17-vendor-credentials-cycle-design-options.md` (Option B,
 * the one implemented here) for the full trace. `resolveLegacyPublish`/`resolveLegacySourceControl`
 * below are typed with LOCALLY-declared structural signatures ({@link ResolveLegacyPublish}/
 * {@link ResolveLegacySourceControl}), not imported function types — the exact same technique
 * `features/deployments/publish-agent-tools.ts` already uses for its own `VendorCredentialPort`, one
 * hop further down this same chain. `resolveDefaultForVendorDualRead` has zero real callers today
 * (per that report's own finding), so nothing currently constructs `VendorCredentialDualReadDeps`
 * outside this file's own test — but whoever eventually wires the real functions in MUST do so from a
 * module that does not sit downstream of `source-control`'s/`deployments`'s own
 * `registerToolContributor` edge (i.e., NOT from `assistant` itself) — `server/` (the same composition
 * root that owns `VendorCredentialPort`'s real wiring today) is the safe place. Reopening this by
 * importing the two functions back into `assistant` would silently reintroduce the exact cycle this
 * cut removes.
 *
 * ## `github` precedence: publish before source-control
 *
 * `github` is the one vendor with rows possibly sitting in BOTH legacy tables (`github-pages` on
 * `publish_credential_sets`, `github` on `source_control_credential_sets`) — every other vendor maps
 * to at most one legacy table. When both have a default row, this module checks the publish table
 * first, matching `backfill-vendor-credentials.ts`'s own `loadSourceRows` ordering
 * ("`publish_credential_sets` rows FIRST... load-bearing, not incidental") — the same deterministic
 * precedence a workspace's eventual migrated data will already reflect, so a workspace read through
 * this dual-read path and one read after migration resolve to the SAME row.
 */

/**
 * Inverts an OLD-provider-id -> {@link VendorId} map (`types.ts`'s `PUBLISH_PROVIDER_TO_VENDOR`/
 * `SOURCE_CONTROL_PROVIDER_TO_VENDOR`) into the direction this module actually needs: given a vendor
 * a caller asked about, which (if any) legacy provider id on that table used to carry it. Built by
 * inversion rather than hand-duplicated so the forward map in `types.ts` — the same one
 * `backfill-vendor-credentials.ts` treats as its single source of truth — stays the ONLY place a
 * vendor-to-provider association is written down. A vendor added to the forward map without this
 * module changing at all still resolves correctly here; hand-duplicating the mapping is exactly the
 * "two mechanisms that share no code and silently drift" shape this feature's own Phase 2 write-up
 * warns about for a different pair of functions.
 *
 * Not every {@link VendorId} has an entry in either resulting map (`gitlab`/`bitbucket` have no
 * publish counterpart; `vercel`/`netlify`/`cloudflare`/`s3-compatible` have no source-control
 * counterpart) — the `Partial` return type reflects that on purpose, not a loosened default.
 *
 * @complexity O(k) in the small, fixed-size input map (5 or 3 entries) — runs once at module load,
 *   never per call.
 */
function invertProviderToVendorMap<ProviderId extends string>(forward: Record<ProviderId, VendorId>): Partial<Record<VendorId, ProviderId>> {
  const reversed: Partial<Record<VendorId, ProviderId>> = {};
  for (const providerId of Object.keys(forward) as ProviderId[]) {
    reversed[forward[providerId]] = providerId;
  }
  return reversed;
}

const VENDOR_TO_PUBLISH_PROVIDER = invertProviderToVendorMap<PublishProviderId>(PUBLISH_PROVIDER_TO_VENDOR);
const VENDOR_TO_SOURCE_CONTROL_PROVIDER = invertProviderToVendorMap<SourceControlProviderId>(SOURCE_CONTROL_PROVIDER_TO_VENDOR);

/**
 * `PublishConnectionInput` -> `VendorConnectionInput`. The two types are field-for-field identical
 * per vendor except the discriminant key (`providerId` vs `vendorId`) and, for `github-pages`/
 * `cloudflare-pages`, its literal value — the same parity `backfill-vendor-credentials.ts`'s own
 * `deriveTokenTail` silently relies on (it reads `.token`/`.secretAccessKey` off either shape without
 * caring which one it got). One small branch per vendor, dispatched via `switch` over the closed
 * `PublishConnectionInput` union rather than a generic spread-and-cast — matches `store.ts`'s own
 * `validateConnection` complexity-budget discipline (one small function's worth of branching per
 * vendor, not a widened inline conditional) and keeps every field named explicitly rather than
 * trusting a runtime shape assumption a future field rename could silently break.
 *
 * @complexity O(1) — one switch, one object literal, no iteration.
 */
function publishConnectionToVendorConnection(connection: PublishConnectionInput): VendorConnectionInput {
  switch (connection.providerId) {
    case "github-pages":
      return { vendorId: "github", token: connection.token };
    case "vercel":
      return { vendorId: "vercel", token: connection.token, ...(connection.teamId !== undefined ? { teamId: connection.teamId } : {}) };
    case "netlify":
      return { vendorId: "netlify", token: connection.token, ...(connection.siteId !== undefined ? { siteId: connection.siteId } : {}) };
    case "cloudflare-pages":
      return {
        vendorId: "cloudflare",
        token: connection.token,
        accountId: connection.accountId,
        ...(connection.projectName !== undefined ? { projectName: connection.projectName } : {}),
      };
    case "s3-compatible":
      return {
        vendorId: "s3-compatible",
        region: connection.region,
        bucket: connection.bucket,
        accessKeyId: connection.accessKeyId,
        secretAccessKey: connection.secretAccessKey,
        publicUrl: connection.publicUrl,
        ...(connection.endpoint !== undefined ? { endpoint: connection.endpoint } : {}),
      };
  }
}

/**
 * `SourceControlConnectionInput` -> `VendorConnectionInput` — same discriminant-only-differs parity
 * as {@link publishConnectionToVendorConnection}, for the source-control table's three providers.
 *
 * @complexity O(1) — one switch, one object literal, no iteration.
 */
function sourceControlConnectionToVendorConnection(connection: SourceControlConnectionInput): VendorConnectionInput {
  switch (connection.providerId) {
    case "github":
      return { vendorId: "github", token: connection.token };
    case "gitlab":
      return { vendorId: "gitlab", token: connection.token };
    case "bitbucket":
      return { vendorId: "bitbucket", token: connection.token, username: connection.username };
  }
}

/** Locally-declared structural stand-in for `publish-credentials/store.ts`'s
 *  `resolveDefaultForPublish` — same shape, deliberately NOT that function's own imported type (see
 *  this file's header for why). `deps`/`input`/the return shape are copied field-for-field from the
 *  real function's signature; a caller passing the real `resolveDefaultForPublish` satisfies this
 *  structurally with no adapter needed. */
type ResolveLegacyPublish = (
  deps: { repo: PublishCredentialSetRepoPort; sealer: SecretSealerPort },
  input: { workspaceId: UUID; providerId: PublishProviderId },
) => Promise<{ id: UUID; label: string; connection: PublishConnectionInput } | null>;

/** Locally-declared structural stand-in for `source-control/store.ts`'s
 *  `resolveDefaultForSourceControl` — same shape, same reasoning as {@link ResolveLegacyPublish}. */
type ResolveLegacySourceControl = (
  deps: { repo: SourceControlCredentialSetRepoPort; sealer: SecretSealerPort },
  input: { workspaceId: UUID; providerId: SourceControlProviderId },
) => Promise<{ id: UUID; label: string; connection: SourceControlConnectionInput } | null>;

export interface VendorCredentialDualReadDeps {
  readonly vendorRepo: VendorCredentialSetRepoPort;
  readonly publishRepo: PublishCredentialSetRepoPort;
  readonly sourceControlRepo: SourceControlCredentialSetRepoPort;
  /** Shared across all three tables — every table's own AAD is re-derived internally by the resolve
   *  function this module delegates to (this file's own header); nothing here needs a per-table
   *  sealer instance. */
  readonly sealer: SecretSealerPort;
  /** Injected rather than imported — see this file's header ("Why the two legacy resolvers are
   *  INJECTED, not imported"). A real caller passes `publish-credentials/store.ts`'s own
   *  `resolveDefaultForPublish` unchanged; this module never imports it by name. */
  readonly resolveLegacyPublish: ResolveLegacyPublish;
  /** Injected rather than imported — same reasoning as {@link VendorCredentialDualReadDeps.resolveLegacyPublish}.
   *  A real caller passes `source-control/store.ts`'s own `resolveDefaultForSourceControl` unchanged. */
  readonly resolveLegacySourceControl: ResolveLegacySourceControl;
}

/** Which table a {@link VendorCredentialDualReadResult} was actually read from — surfaced so a caller
 *  that cares (logging, a "this came from your old GitHub Pages credential" hint, or a future
 *  migration-completeness audit) can tell without re-deriving it, without forcing every caller that
 *  does NOT care to destructure it. */
export type VendorCredentialDualReadSource = "vendor" | "legacy-publish" | "legacy-source-control";

export interface VendorCredentialDualReadResult {
  readonly source: VendorCredentialDualReadSource;
  readonly id: UUID;
  readonly label: string;
  readonly connection: VendorConnectionInput;
}

/**
 * Resolves the DEFAULT credential for `(workspaceId, vendorId)`, reading `vendor_credential_sets`
 * first and falling back to whichever legacy table used to carry that vendor only when the new
 * table's group is genuinely empty — see this file's own header for the full design and why "no
 * default row" (`resolveDefaultForVendor`'s own contract) is a safe empty-group signal: this table's
 * write path guarantees a vendor's first-ever saved connection always auto-defaults, so there is no
 * "group has rows but none is default" state for this function to misread as empty.
 *
 * Three possible outcomes, matching this feature's own acceptance criteria: a row in the NEW table
 * (`source: "vendor"`); no row in the new table but one in a legacy table (`source: "legacy-publish"`
 * or `"legacy-source-control"`); or no row anywhere (`null` — honestly "not configured", not a
 * fallback error).
 *
 * @throws {@link import("./store.js").VendorCredentialSecretStoreUnconfiguredError} the new table's row
 *   failed to decrypt.
 * @throws {@link import("../deployments/publish-credentials/store.js").PublishCredentialSecretStoreUnconfiguredError}
 *   a legacy publish-table row failed to decrypt.
 * @throws {@link import("../source-control/store.js").SourceControlCredentialSecretStoreUnconfiguredError}
 *   a legacy source-control-table row failed to decrypt.
 *   These three error classes are deliberately NOT unified into one — see this file's own header on
 *   why the three read paths must stay genuinely separate all the way down; a caller that needs to
 *   treat "any secret-store failure" uniformly can still do so with `instanceof Error`, but this
 *   function itself never blurs which table actually failed.
 * @complexity O(1) — at most three sequential repo reads/decrypts (new table, then at most one legacy
 *   table for most vendors, both legacy tables only for `github`), short-circuiting on the first hit.
 */
export async function resolveDefaultForVendorDualRead(
  deps: VendorCredentialDualReadDeps,
  input: { workspaceId: UUID; vendorId: VendorId }
): Promise<VendorCredentialDualReadResult | null> {
  const primary = await resolveDefaultForVendor({ repo: deps.vendorRepo, sealer: deps.sealer }, input);
  if (primary) {
    return { source: "vendor", id: primary.id, label: primary.label, connection: primary.connection };
  }

  const legacyPublishProviderId = VENDOR_TO_PUBLISH_PROVIDER[input.vendorId];
  if (legacyPublishProviderId !== undefined) {
    const legacyPublish = await deps.resolveLegacyPublish(
      { repo: deps.publishRepo, sealer: deps.sealer },
      { workspaceId: input.workspaceId, providerId: legacyPublishProviderId }
    );
    if (legacyPublish) {
      return {
        source: "legacy-publish",
        id: legacyPublish.id,
        label: legacyPublish.label,
        connection: publishConnectionToVendorConnection(legacyPublish.connection),
      };
    }
  }

  const legacySourceControlProviderId = VENDOR_TO_SOURCE_CONTROL_PROVIDER[input.vendorId];
  if (legacySourceControlProviderId !== undefined) {
    const legacySourceControl = await deps.resolveLegacySourceControl(
      { repo: deps.sourceControlRepo, sealer: deps.sealer },
      { workspaceId: input.workspaceId, providerId: legacySourceControlProviderId }
    );
    if (legacySourceControl) {
      return {
        source: "legacy-source-control",
        id: legacySourceControl.id,
        label: legacySourceControl.label,
        connection: sourceControlConnectionToVendorConnection(legacySourceControl.connection),
      };
    }
  }

  return null;
}
