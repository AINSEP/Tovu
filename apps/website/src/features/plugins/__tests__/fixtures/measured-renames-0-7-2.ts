/** @file Provider-owned fixture: the measured pre-rename ids, kept out of the vendor-neutral `agent-plugins` seam. */

// Measured in combine-11 (cloud-results/combine-11-tovu-b4-plugin-id-upgrade.txt): every bundled package
// @jini-ai/agent-plugins 0.7.2 shipped as `tovu/<id>` and 0.7.3-next.2 ships as `jini/<id>`.
export const MEASURED_RENAMES_0_7_2 = [
  "calendly", "cloudflare", "composio", "fly", "github-pages", "github", "google-login", "google-workspace",
  "higgsfield-media", "jev", "meilisearch", "netlify", "opentelemetry", "posthog", "railway", "render", "resend",
  "s3-compatible", "sentry", "shopify", "site-compliance", "site-import", "supabase", "vercel", "wordpress",
];
