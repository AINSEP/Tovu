/**
 * @file The `VendorId` union `vendor_credential_sets` (`../../db/schema.ts`) keys its rows on — see
 * that table's own doc comment for the full "destination vs. vendor" redesign this type is the
 * center of.
 *
 * Deliberately minimal for this migration slice: `VendorId` plus the two OLD-to-NEW mapping tables
 * `backfill-vendor-credentials.ts` needs to translate an existing `publish_credential_sets`/
 * `source_control_credential_sets` row into a `vendor_credential_sets` one. The real
 * `VendorConnectionInput` closed union, `VendorCredentialSetRecord`, and a
 * `VendorCredentialSetRepoPort` (mirroring `../deployments/publish-credentials/types.ts`'s own
 * shape) belong to the slice that builds the unified store/resolver against this table — this
 * migration only needs to know the vendor id space exists and how an old row maps into it, not the
 * full read/write contract on top of it.
 */

/**
 * A company/protocol identity a saved credential authenticates to — as opposed to a PUBLISH
 * DESTINATION (`"github-pages"`), which is what a token is *used for*, not *who it is*. See
 * `../../db/schema.ts`'s `vendorCredentialSets` doc for the full reasoning.
 */
export type VendorId = "github" | "gitlab" | "bitbucket" | "vercel" | "netlify" | "cloudflare" | "s3-compatible";

export const VENDOR_IDS: readonly VendorId[] = ["github", "gitlab", "bitbucket", "vercel", "netlify", "cloudflare", "s3-compatible"];

/**
 * `publish_credential_sets.provider_id` -> `VendorId`. A `Record` (not a `Map`/`Set`-based lookup)
 * so this mapping is exhaustively checked against `PublishProviderId` at compile time — a new
 * publish provider added to that union without a corresponding entry here is a `tsc` error, not a
 * runtime surprise the backfill script would otherwise discover only by throwing on an unmapped row.
 */
export const PUBLISH_PROVIDER_TO_VENDOR: Record<"github-pages" | "vercel" | "netlify" | "cloudflare-pages" | "s3-compatible", VendorId> = {
  "github-pages": "github",
  vercel: "vercel",
  netlify: "netlify",
  "cloudflare-pages": "cloudflare",
  "s3-compatible": "s3-compatible",
};

/** `source_control_credential_sets.provider_id` -> `VendorId`. Same exhaustiveness reasoning as
 *  {@link PUBLISH_PROVIDER_TO_VENDOR}. */
export const SOURCE_CONTROL_PROVIDER_TO_VENDOR: Record<"github" | "gitlab" | "bitbucket", VendorId> = {
  github: "github",
  gitlab: "gitlab",
  bitbucket: "bitbucket",
};
