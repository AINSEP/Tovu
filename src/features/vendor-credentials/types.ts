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
 *
 * **`"s3-compatible"` is a KNOWN, DELIBERATE exception to "every member identifies one account"** —
 * flagged 2026-08-16 during Phase 1 review, kept rather than removed on purpose. Every other member
 * of this union names a single company you authenticate to; `s3-compatible` names a PROTOCOL that
 * multiple unrelated companies speak (AWS S3 itself, Backblaze B2, MinIO, Wasabi, DigitalOcean
 * Spaces, Cloudflare R2, ...). Two credentials for two entirely different companies can therefore
 * land in the SAME vendor group under this id, with no second signal to tell them apart —
 * `accountLabel` is always `null` for `s3-compatible` (no reviewed identity extractor exists for it,
 * `static-publish/verify.ts`'s own reasoning), so the user-typed `label` on
 * `vendor_credential_sets` is the ONLY thing distinguishing them. This was kept rather than split
 * further because there is no reliable way to derive the real company from an S3-compatible
 * endpoint URL — pattern-matching hostnames (`*.r2.cloudflarestorage.com`, `*.backblazeb2.com`, ...)
 * would be fragile, easily wrong, and itself a second, unreviewed identity-inference surface.
 *
 * A related ambiguity this creates: **Cloudflare R2 is itself S3-compatible.** An R2 credential
 * could legitimately be saved as EITHER `cloudflare` (Cloudflare Pages' own token, which is NOT
 * S3-compatible — it is Cloudflare's own REST API) OR `s3-compatible` (an R2 bucket accessed via its
 * S3-compatible endpoint) depending purely on which save path the user went through — two rows, the
 * same real underlying account, two unrelated vendor groups. Nothing in this codebase reconciles
 * that; a human choosing where to save an R2 credential must pick based on what they are actually
 * using it for (Cloudflare Pages deploys vs. an S3-style bucket), not on "which one is more correct."
 *
 * Any UI that groups credentials by `VendorId` (e.g. "these are your GitHub tokens") MUST NOT apply
 * the same "these all belong to one account" framing to the `s3-compatible` group — see whichever
 * slice builds that grouping UI for the concrete copy rule.
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
