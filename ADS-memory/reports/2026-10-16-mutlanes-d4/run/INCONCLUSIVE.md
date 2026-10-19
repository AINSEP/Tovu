
## row 63 (T1) apps/website/src/features/webhooks/signing.ts (sha b33dd7517032e7f3f0573b56f2bd331604d04e56)
tests: apps/website/src/features/webhooks/__tests__/signing.test.ts apps/website/src/features/webhooks/__tests__/signing.keyring.test.ts apps/website/src/features/webhooks/__tests__/delivery.test.ts
- line 29 (drop-nullish-default): `timestampSeconds: input.timestampSeconds ?? Math.floor(Date.now() / 1000),`

## row 71 (T1) apps/website/src/features/agent-plugins/new-site-agent-plugin-tokens.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/features/agent-plugins/__tests__/unit/new-site-agent-plugin-tokens.unit.test.ts
- line 124 (drop-nullish-default): `return process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR ?? path.join(resolveProductRoot(), "content", "agent-plugins");`

## row 97 (T1) apps/website/src/platform/db/migrations/0012_secrets_vault.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/platform/db/migrations/__tests__/secrets-vault-step.test.ts
- line 287 (drop-nullish-default): `const values = reserved.get(workspaceId) ?? new Set<string>();`

## row 104 (T1) apps/website/src/assistant/assistant-vault.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/assistant/__tests__/site-credential-store.test.ts apps/website/src/assistant/__tests__/execution-credential-store.test.ts
- line 55 (drop-nullish-default): `const raw = supplied ?? await repo.findOne(context);`

## row 127 (T1) apps/desktop/src/site-name-policy.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/desktop/src/site-name-policy.test.ts
- line 16 (guard-never-fires): `if (!occupied.has(normalized(candidate))) return candidate;`

## row 161 (T2) apps/website/src/server/inbound/admin-http/routes/system/deployment-overview.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/__tests__/routes/deployment-overview-site-key-row.test.ts
- line 128 (drop-nullish-default): `const siteKey = input.siteKey ?? inspectSiteKeyMaterial({ sources: siteKeySources({ mode, env: process.env, home: homedir(), cwd: process.cwd() }) });`

## row 160 (T2) apps/website/src/server/inbound/public-http/routes/site/products.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/public-http/routes/site/__tests__/products.route.test.ts apps/website/src/server/__tests__/routes/request-cost-render-work.measurement.test.ts apps/website/src/server/__tests__/routes/request-cost-cacheability.measurement.test.ts apps/website/src/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts
- line 101 (drop-nullish-default): `const product = products.find((p) => p.id === id) ?? products.find((p) => p.slug === id);`

## row 164 (T2) apps/website/src/server/inbound/public-http/routes/site/store.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/public-http/routes/site/__tests__/store.route.test.ts apps/website/src/server/inbound/public-http/routes/site/__tests__/store-return-query.test.ts apps/website/src/server/__tests__/routes/request-cost-cacheability.measurement.test.ts
- line 32 (guard-never-fires): `if (typeof raw !== "string" || !raw.startsWith("/")) return STORE_PATH;`

## row 167 (T2) apps/website/src/server/inbound/public-http/middleware/theme-static-assets.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/public-http/middleware/__tests__/theme-static-assets.test.ts apps/website/src/server/inbound/public-http/middleware/__tests__/theme-preview-refresh.test.ts
- line 82 (guard-never-fires): `if (themeDir === undefined) {`

## row 171 (T2) apps/website/src/server/inbound/admin-http/routes/settings/events.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/__tests__/routes/settings-events-resume.test.ts apps/website/src/server/__tests__/routes/settings-events-id-disclosure.test.ts apps/website/src/server/inbound/admin-http/routes/settings/__tests__/preview-feed-access.test.ts
- line 138 (drop-nullish-default): `const { scheduleInterval = setInterval, clearScheduledInterval = clearInterval } = deps.feedTimers ?? {};`

## row 176 (T2) apps/website/src/server/inbound/admin-http/routes/settings/shared.ts (sha 240b6046ee1b1128865f00fe11bddfb5bb79510c)
tests: apps/website/src/server/inbound/admin-http/routes/settings/__tests__/shared.unit.test.ts apps/website/src/server/__tests__/assistant-byok-routes.test.ts
- line 210 (guard-never-fires): `if (method !== "get" && Array.isArray((input.body as { definitions?: unknown } | null)?.definitions)`

## row 191 (T2) apps/website/src/server/inbound/admin-http/routes/users/enable.ts (sha 9b31543384b49e6179eb6f673825e34d1c6036c9)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/enable.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/create.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/owner-protection.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/account-protections.test.ts
- line 16 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 190 (T2) apps/website/src/server/inbound/admin-http/routes/content-types/update-fields.ts (sha 9b31543384b49e6179eb6f673825e34d1c6036c9)
tests: apps/website/src/server/inbound/admin-http/routes/content-types/__tests__/register-update-fields.conflict.test.ts apps/website/src/server/__tests__/routes/content-types-routes.test.ts apps/website/src/server/__tests__/routes/content-types-field-shape.test.ts
- line 103 (guard-never-fires): `if (!result.ok) {`

## row 203 (T2) apps/website/src/server/inbound/admin-http/routes/analytics/recent-hits.ts (sha 55ed187a614fd31b7ed3696422d23670f6ddc291)
tests: apps/website/src/server/__tests__/routes/analytics-recent-hits.test.ts
- line 74 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 156 (T2) apps/website/src/server/inbound/public-http/routes/site/pages.ts (sha 479ff6e191f9f4b40f506f3eef0de0fb5146fe1d)
tests: apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.route.test.ts apps/website/src/server/__tests__/routes/media-site-serving.test.ts apps/website/src/server/__tests__/routes/post-template-author.test.ts apps/website/src/server/__tests__/routes/widgets-site-serving.test.ts apps/website/src/server/__tests__/routes/bare-page-site-serving.test.ts apps/website/src/server/__tests__/routes/redirects-site-serving.test.ts
- line 207 (guard-never-fires): `if (!outcome || outcome.kind !== "redirect") return false;`
