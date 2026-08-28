/**
 * @file The single canonical per-field guidance table for the S3-compatible ("Custom" tab) credential
 * — spec `ADS-memory/specs/custom-publish-provider-contract.md` §4c/§5.
 *
 * Purpose:
 * The four existing providers' novice-facing guidance already lives in TWO disconnected places with
 * zero sharing — a hardcoded array in the admin browser bundle (`apps/admin/src/features/deployment/
 * rules.ts`'s `PUBLISH_CREDENTIAL_PROVIDERS`) and separate prose in this server's tool descriptions
 * (`publish-agent-tools.ts`). Spec §5 names this as real, confirmed drift risk, and decides
 * S3-compatible should NOT repeat it: one canonical table, server-side, with three consumers reading
 * it rather than re-authoring it — the MCP-UI form this file's own credential-proposal tool builds
 * (`publish-agent-tools.ts`'s `deployment_propose_custom_provider_credential`), the admin's "Custom"
 * tab (fetched over HTTP — a NEW route/field this dispatch does not add, since `apps/admin/**` is out
 * of scope here; see this module's own consumers list below for what IS wired in this dispatch), and
 * this same tool's own `inputSchema` descriptions for its non-secret pre-fill fields.
 *
 * Scope discipline (spec §5/§7, DECIDED by the owner): this table exists for S3-compatible ONLY. The
 * other four providers' `rules.ts` hardcoding is NOT migrated in this pass — refactoring four working
 * publish paths to serve one brand-new, not-yet-proven one widens risk rather than reducing it.
 *
 * Architectural role:
 * `features/deployments/publish-credentials` domain data — no I/O, no dependency on `apps/admin` (an
 * HTTP fetch consumer on that side is future/concurrent work, not authored by this file).
 */

/** One field's full guidance — every consumer maps this 1:1 rather than re-deriving any of it. */
export interface FieldGuidance {
  readonly name: "endpoint" | "region" | "bucket" | "accessKeyId" | "secretAccessKey" | "publicUrl";
  readonly label: string;
  /** Human-facing, shown under the input. */
  readonly hint: string;
  readonly required: boolean;
  /** Drives masked (`type="password"`) rendering in the MCP-UI form — see `@jini-ai/ui`'s
   *  `StringField.secret`/`TextInputProps.secret` (spec §8/§8a, shipped upstream in Jini commit
   *  `738d151c`). `true` for `secretAccessKey` only: `accessKeyId` is explicitly a "treat like a
   *  username, not a password" field per its own hint text below — masking it would hide a value a
   *  human legitimately needs to read back and compare against their provider's dashboard, for no
   *  security benefit (it alone authorizes nothing without the paired secret). */
  readonly secret: boolean;
}

/**
 * The form-level framing shown above every field — spec §3b's explicit instruction that "AWS is
 * harder than Vercel" must be stated up front, not buried in field 4 of 6, and §3a's resolution
 * (Fallback 2: Tovu composes the exact hosting-setup content, the human applies it in their own
 * console — see `deployment_generate_bucket_hosting_setup`).
 */
export const S3_COMPATIBLE_FORM_DESCRIPTION =
  "S3-compatible storage needs three things, not just these fields: a bucket you've already created, " +
  "public access or hosting set up in front of it — ask me to generate the exact steps and the exact " +
  "policy for your bucket, then apply them yourself in your provider's console — and an access key " +
  "scoped to just that bucket. If you haven't done the first two yet, do that before filling this in.";

/**
 * The six fields, in form order. Spec §4c's table verbatim — see that section for the full per-field
 * citation trail (each provider's own current docs, verified 2026-08-15).
 */
export const S3_COMPATIBLE_FIELD_GUIDANCE: readonly FieldGuidance[] = [
  {
    name: "endpoint",
    label: "Endpoint",
    required: false,
    secret: false,
    hint:
      "Your storage service's API address — not your bucket's website address. Cloudflare R2: " +
      "https://<account-id>.r2.cloudflarestorage.com. Backblaze B2: check your bucket's 'Endpoint' " +
      "field in the B2 dashboard. DigitalOcean Spaces: https://<region>.digitaloceanspaces.com. " +
      "Wasabi: https://s3.<region>.wasabisys.com. Plain AWS S3: leave this blank.",
  },
  {
    name: "region",
    label: "Region",
    required: true,
    secret: false,
    hint:
      "The region your bucket lives in — e.g. us-east-1 for AWS, auto for Cloudflare R2, or your " +
      "Space's region for DigitalOcean (e.g. nyc3). Needed to sign requests correctly even if your " +
      "provider doesn't otherwise think in regions.",
  },
  {
    name: "bucket",
    label: "Bucket",
    required: true,
    secret: false,
    hint:
      "The exact name of the bucket (DigitalOcean calls it a 'Space') to publish into. " +
      "Case-sensitive. Tovu does not create this for you — create it in your provider's dashboard first.",
  },
  {
    name: "accessKeyId",
    label: "Access Key ID",
    required: true,
    secret: false,
    hint:
      "Created alongside your Secret Access Key when you make an API key pair. AWS: IAM → Security " +
      "credentials → Access keys. Cloudflare R2: R2 → Manage API tokens. Backblaze B2: Application " +
      "Keys. Use a key scoped to just this one bucket if your provider supports it — not an " +
      "account-wide key.",
  },
  {
    name: "secretAccessKey",
    label: "Secret Access Key",
    required: true,
    secret: true,
    hint:
      "Shown only once, at the moment the key pair is created — copy it right away. If you lose it, " +
      "your provider cannot show it to you again; you'll need to create a new key. Tovu stores this " +
      "encrypted and never displays it again after you save.",
  },
  {
    name: "publicUrl",
    label: "Public URL",
    required: true,
    secret: false,
    hint:
      "The web address people will actually visit once this is live, e.g. https://my-site.pages.dev, " +
      "a custom domain pointed at this bucket, or your provider's public bucket URL. Not sure how to " +
      "set this up? Ask me to generate the exact steps for your bucket, then apply them yourself in " +
      "your provider's console — Tovu never makes this change for you. Once it's live, paste the " +
      "address here; Tovu checks it after every publish and will tell you plainly if it isn't " +
      "reachable, rather than reporting success anyway.",
  },
];
