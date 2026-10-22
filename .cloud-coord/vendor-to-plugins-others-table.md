# Lane B (non-Fly vendors) — full classification table
Branch: cloud/vendor-to-plugins-2026-10-22-b2 (from origin/cloud/deploy-2026-10-22)

| file | vendor | class | action |
|---|---|---|---|
| A/agent-plugins/__tests__/unit/bundled-deploy-config-railway.unit.test.ts | Railway | a | MOVED -> content/agent-plugins/railway/deploy-configs/__tests__/railway.test.mjs (7/7) |
| .../bundled-deploy-config-render.unit.test.ts | Render | a | MOVED -> render/deploy-configs/__tests__/render.test.mjs (13/13); Fly lane's 1-line comment edit re-applied (modify/delete conflict on merge: take delete) |
| .../bundled-deploy-cloudflare-pages.unit.test.ts | Cloudflare | a | MOVED -> cloudflare/__tests__/bundled-package.test.mjs (2/2) |
| .../cloudflare-contribution-migration.unit.test.ts | Cloudflare | a | MOVED -> cloudflare/__tests__/contribution-migration.test.mjs (8/8) |
| .../bundled-deploy-github-pages.unit.test.ts | GitHub Pages | a | MOVED -> github-pages/targets/__tests__/github-pages.test.mjs (59/59) |
| .../bundled-deploy-netlify.unit.test.ts | Netlify | a | MOVED -> netlify/targets/__tests__/netlify.test.mjs (42/42) |
| .../bundled-deploy-s3-compatible.unit.test.ts | S3 | a | MOVED -> s3-compatible/targets/__tests__/s3-compatible.test.mjs (51/51) |
| .../bundled-deploy-vercel.unit.test.ts | Vercel | a | MOVED -> vercel/targets/__tests__/vercel.test.mjs (53/53) |
| .../bundled-mail-resend.unit.test.ts | Resend | a | MOVED -> resend/__tests__/bundled-mail.test.mjs (26/26) |
| W/features/deployments/{publish-agent-tools,static-publish/{verify,adapter,types,publish-history},deploy-targets/registry,publish-credentials/{store,account-label-heal-scheduler,types}}.ts | GH Pages, Vercel, Netlify, Cloudflare, S3 | c | GENERICIZED; why -> <vendor>/NOTES.md |
| W/features/site-export/{site-exporter,static-security-headers}.ts | same | c | GENERICIZED; why -> NOTES.md / existing cloudflare refs |
| W/server/inbound/admin-http/routes/system/{publish-site,publish-credentials}.ts; W/server/runtime/composition/app.ts | GH Pages, Vercel | c | GENERICIZED |
| W/platform/db/schema.sqlite.ts (publish_history comments only); W/platform/db/repos/publish-history-repo.ts | all static hosts | c | GENERICIZED (no schema change; drift tests 43/43) |
| W/cli/program.ts --base-path help example | GitHub Pages | c (help) | GENERICIZED |
| W/features/{plugins/lipay/lipay-plugin,source-control/commit-site,custom-credentials/credentialed-request}.ts; W/server/inbound/public-http/{http/site/form-render,middleware/public-page-security-headers}.ts | Vercel, GH Pages, Cloudflare | c | GENERICIZED; BYHO forms incident -> cloudflare/NOTES.md |
| W/contracts/core/tool-metadata/mail-status.ts query "Use Resend..." (+ baseline fixture) | Resend | c | GENERICIZED; fixes pre-existing no-mail-vendor-in-core failure |
| W/features/{agent-plugins/mail-adapter-registry,mail/feedback-inbox.repo,newsletter/send-pipeline}.ts; W/server/runtime/boot/mail-delivery-policy.ts | Resend | c | GENERICIZED; why -> resend/NOTES.md |
| W/assistant/__tests__/tool-search-keywords.backfill-ranking.test.ts + tool-metadata/publish-content.ts:57 | Netlify | c (test) | GENERICIZED query (still rank 1) |
| A/lib/api.ts; A/features/deployment/{rules.ts,StaticSiteTab.tsx (current-behaviour docs)}; A/features/security/{security-visuals,OtherCredentialsSection,AccessTokensTab header}; A/features/source-control/{ProvidersTab, hooks/use-source-control-credentials}; A/styles.css comments | all static hosts | c | GENERICIZED (comments only) |
| W/features/agent-plugins/bundled-catalog.ts (SEEDED_ENABLED, RETIRED maps) | all | b | LEFT — Fly lane owns. Follow-up: add `extensions.tovu.seededEnabled: true` to railway/render/vercel/netlify/cloudflare/github-pages/s3-compatible/resend plugin.json and drop their literals once Fly lane's reader lands |
| W/features/agent-plugins/deploy-split-activation.ts:17,66-78 | all hosts, cloudflare-pages | b | LEFT REAL DEPENDENCY — migration descriptor (list excludes `github`, not derivable from RETIRED map without naming it) |
| W/features/agent-plugins/lifecycle.ts:127-138 | cloudflare-pages | b | LEFT REAL DEPENDENCY — plugin replacement/supersession descriptor needed |
| W/features/publish-trust/connect.ts:51 DEPLOY_CONFIG_CANDIDATE_PATHS | Render, Railway (+Fly) | b | LEFT REAL DEPENDENCY — needs deploy-config descriptor field for candidate paths; allowlisted in deploy-vendor-scan |
| W/platform/db/migrations/0013_unify_vault_credentials.ts | GH Pages, Cloudflare, Vercel, Netlify | b | LEFT — applied migration |
| W/platform/db/schema.sqlite.ts publish_history owner/repo/branch/commit_sha columns | GitHub Pages | b | LEFT — vendor-shaped columns (schema change) ; comments genericized |
| W/server/runtime/composition/domain-dns-adapters.ts:68 cloudflare-dns.com DoH | Cloudflare (public resolver) | — | LEFT — SWEEP adapter exclusion; not the Cloudflare plugin |
| W/contracts/core/tool-metadata/mail-status.ts lowercase "resend" keyword | Resend | c | LEFT — ambiguous verb, allowed by mail boundary; plugin keywords also carry it |
| W/features/object-storage + TOVU_MEDIA_BLOB_STORE=s3 / TOVU_S3_* ; media-store.s3.integration.test.ts | S3 | — | LEFT GENERIC-OK (S3 protocol, core wiring test) |
| W/server/inbound/admin-http/routes/newsletter/resend-confirmation.ts, members/newsletter "resend" | — | — | not vendor (verb) |
| W/features/deployments/{deploy-config.ts:9,249, index.ts:61}; W/cli/commands/deploy-config.ts:70; peer-*/egress/types/deps comments; Dockerfile:160; .gitignore:48; A/features/security/rules.ts hunks | Railway, Render | c | LEFT — inside Fly lane's hunks/files (conflict risk); deploy-config.ts:274 also cites deleted bundled-deploy-config-render.unit.test.ts -> coordinator: repoint to render/deploy-configs/__tests__/render.test.mjs |
| A/features/security/rules.ts (github vs github-pages disambiguation), AccessTokensTab.tsx:338-344,792 JSX comment; StaticSiteTab.tsx dated history header; use-publish-credentials.hooks.ts:158 owner quote; styles/access-tokens.css:81 | GH Pages, Cloudflare | c/history | LEFT — dated history / owner quotes / disambiguation rationale tied to two same-company providers |
| A/features/security/security-i18n.ts, members-i18n etc. | — | — | LEFT per dispatch (i18n catalogs) |
| knip.json entry list of plugin modules | all | b (tooling) | LEFT — Fly lane touched knip.json; could become globs `content/agent-plugins/*/{targets,deploy-configs,adapters,object-stores}/*.mjs` |
| development/scripts/hardwiring-debt.json (stale cloudflare-pages paths) | Cloudflare etc | tooling data | LEFT |
| Core tests using vendor ids as fixtures: deployments/__tests__/publish-agent-tools.unit (184), publish-credentials/__tests__/store.unit (154), static-publish/__tests__/{credentials,verify,adapter,adapter.plugin-targets,publish-run,publish-history}, admin deployment/security hooks+tab tests, server routes publish-site/publish-credentials, retire-bundled, deploy-split-activation, bundled-deploy-package, deploy-config-registry, cli deploy-config tests | all | c (test fixtures) | LEFT — they test core code (or core+real plugin integration); converting to synthetic ids is a separate, large pass |
| development/e2e journeys + 12 visual snapshot PNGs (admin-deployment-static-site-target-<vendor>) | static hosts | test | LEFT — Chromium; not run |
| development/docs, todos.md, HANDOFF/SESSION notes, RELEASE-NOTES, .cloud-coord, ADS-memory | all | history | LEFT |
