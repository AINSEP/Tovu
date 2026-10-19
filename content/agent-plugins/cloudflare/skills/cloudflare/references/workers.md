# Workers static assets

Stable script name: `jini-<project-name>`, unless `resourceName` supplies the exact existing name.
The plugin reads the account's workers.dev subdomain. If absent, open Workers & Pages in the
Cloudflare dashboard and finish workers.dev setup; do not invent or register a subdomain automatically.
Preview discloses script creation/update and enabling its workers.dev endpoint.

Publishing creates an asset upload session, uploads exactly the nonempty server buckets with the
session JWT, then uses the completion JWT in script metadata. Empty buckets need no upload.
A minimal module delegates to `env.ASSETS.fetch`; its `ASSETS` binding owns the static files.
Root `_headers`/`_redirects` go through assets config and are never public assets. Nested copies are
ordinary assets. Host security headers replace any root site-supplied `_headers` because they are
host policy.

Each file is at most 25 MiB. Default/free limit is 20,000 files, paid is 100,000; `assetPlan:"paid"`
must describe the real Workers account plan. Generated configuration/content-proof files count.
Uploads run sequentially to bound memory and concurrency. The compatibility date is pinned in code
and should advance only after release acceptance.

Official protocol: https://developers.cloudflare.com/workers/static-assets/direct-upload/

A self-hosted operator may explicitly configure `CLOUDFLARE_WORKERS_TOKEN` with `CLOUDFLARE_ACCOUNT_ID`. Historical `CLOUDFLARE_TOKEN` / `CLOUDFLARE_API_TOKEN` environment credentials remain Pages-only; the new target never silently reuses them. A saved compatible connection still takes precedence under the existing resolver.
