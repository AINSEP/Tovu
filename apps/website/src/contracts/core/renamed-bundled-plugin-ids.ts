/**
 * @file The bundled plugin ids whose package moved publisher. This is provider data, so it lives in this host contract and
 * not in the vendor-neutral `agent-plugins` seam (`api-connections/__tests__/vendor-neutrality.test.ts`
 * keeps that seam free of provider ids); `agent-plugins/bundled-id-upgrade.ts` only consumes the list.
 */

/** Local ids whose bundled package moved from publisher `tovu` to `jini` in @jini-ai/agent-plugins 0.7.3. */
export const RENAMED_TO_JINI = [
  "calendly", "cloudflare", "composio", "fly", "github", "github-pages", "google-login", "google-workspace",
  "higgsfield-media", "jev", "meilisearch", "netlify", "opentelemetry", "posthog", "railway", "render",
  "resend", "s3-compatible", "sentry", "shopify", "site-compliance", "site-import", "supabase", "vercel", "wordpress",
] as const;
