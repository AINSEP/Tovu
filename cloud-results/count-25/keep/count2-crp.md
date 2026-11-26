COUNT r62t-count2-crp COMPLETE: MOVE 108 / STAYS-HOST 66

All 174 Part 1 residual rows under `c/**`, `r/**` and `p/**` are classified at Tovu `caa3ac7811`, against Jini `dc2349f51`. These are additional verdicts, not a recount of Part 1 or of the planner’s existing keeps. MOVE counts a source file once when it still owns reusable behavior. Express mounts, host policy, and product copy stay behind when a file splits. No files were changed.

## 1. Extra KEEP_RULES

The regexes below use Part 1’s path abbreviations. In the planner, expand `c/` to `apps/website/src/contracts/`, `p/` to `apps/website/src/platform/`, and `r/` to `apps/website/src/server/inbound/`. These rules match exactly 66 residual rows, with no overlaps.

| Anchored regex | Why it stays | Files |
|---|---|---:|
| `^c/core/(?:agent-permission-mode\|public-page-security-headers\|rate-limit/rate-limit)\.ts$` | Host runtime defaults, report-only header policy, rate profiles and proxy trust. Jini owns the underlying primitives. | 3 |
| `^c/core/(?:assistant-run-events\|plugin-credential-card\|tool-failure-diagnostics\|entry-refs/unindexed-ref-warning)\.ts$` | Binds Tovu notices, app identity, redaction or a warning sink to existing Jini behavior. | 4 |
| `^c/core/(?:consent-refusal\|page-html\|renamed-bundled-plugin-ids\|theme-ids)\.ts$` | Tovu consent navigation and copy, authoring vocabulary, or compatibility IDs for bundled products and themes. | 4 |
| `^c/core/events/outbox-(?:retry-policies\|worker)\.ts$` | Selects retry policy for this host’s form events and supplies its scheduler and logger to Jini’s worker. | 2 |
| `^c/core/gated-mutations/ports\.ts$` | Tovu’s restore and watermark mirror contract. Generic approval contracts are already in Jini. | 1 |
| `^c/core/tool-metadata/(?:content-read\|index\|site-guide)\.ts$` | Tovu content-read card names, assembled tool catalog and product guide discovery copy. | 3 |
| `^c/headless/(?:assistant-permanent-deletes-policy\|assistant-tool-approval-policy\|index\|secret-form-cards)\.ts$` | Host tool allowlists, admin links, settings and handle policy, secret-card catalog projection, and their local barrel. Repoint or retire redundant exports as consumers move. | 4 |
| `^p/mail/(?:adapter-module\|adapters/smtp\.nodemailer\|delivery-availability\|index\|sender-identity)\.ts$` | Tovu plugin mail ABI, vendor loader, operator copy and active-mailer binding. Jini already owns the mail contracts and engines. | 5 |
| `^r/admin-http/http/(?:plugin-hook-error\|widgets)\.ts$` | Host error classification, redaction, authorization and response writing around existing Jini mappers. | 2 |
| `^r/admin-http/routes/(?:external-mcp/guard\|forms/forms-write-error\|media/(?:original\|route-guards)\|plugins/chart-providers)\.ts$` | Express admission or response adapters. Jini already owns the form refusal, media original outcomes and chart provider replies. | 5 |
| `^r/admin-http/routes/fs-files/(?:custom-root\|folder-picker)\.ts$` | Custom-root GET, PUT and DELETE specs already exist in Jini. Replace the duplicate Express bodies with mounts and keep the site-directory binding. The folder picker is a local-admin native dialog with host-owned concurrency. | 2 |
| `^r/admin-http/routes/(?:settings/shared\|system/sites\|widgets/preview-render)\.ts$` | Host settings fences and invalidation, local site switcher and supervisor, and selection of the host theme shell for widget preview. | 3 |
| `^r/public-http/http/site/(?:(?:handlebars\|liquid)-(?:render\|sandbox\|worker)\|worker-sandbox)\.ts$` | Concrete theme-engine adapters, worker entries, product-root lookup, dev compilation and resource budgets around Jini’s generic worker sandbox. No blanket rule for site rendering. | 7 |
| `^r/public-http/http/site/(?:seo-render-context\|render/(?:components/registry\|document-shell\|site-assistant-mount))\.ts$` | Express serving-origin projection, host component catalog, theme CSS and font assembly, and Tovu chat asset mounting. | 4 |
| `^r/public-http/middleware/(?:site-consent\|theme-page-preview\|theme-preview-refresh)\.ts$` | Host consent settings, legacy fallback and origin policy. For preview, Jini owns the decisions and Tovu binds the theme roster, renderers, session and Express response. | 3 |
| `^r/public-http/routes/(?:mail-feedback\|members/analytics\|oauth/callback-page\|ops/health)\.ts$` | Raw webhook mount over Jini’s handler, member telemetry binding, OAuth message IDs and copy, and host readiness state. Jini’s existing `/health` and `/healthz` specs are separate from this `/readyz`. | 4 |
| `^r/public-http/routes/site/(?:llms\|pages\|sitemap)\.ts$` | Host SEO inputs and response mounts over existing builders, or route registration order. `robots.ts` is not included because it still serializes the wire text itself. | 3 |
| `^r/public-http/routes/site/pages/(?:handlers/listing\|listing/listing-batch\|render-context/(?:content-marker-ports\|member-access\|site-title\|static-menus\|widgets))\.ts$` | Express rewrites, request state and host port composition. Includes legacy title policy, reserved theme menu IDs and assistant availability. | 7 |

## 2. Per-area count

| Area | Residual | MOVE | STAYS-HOST | NOT-CHECKED |
|---|---:|---:|---:|---:|
| contracts-core | 48 | 31 | 17 | 0 |
| contracts-headless | 4 | 0 | 4 | 0 |
| platform-mail | 5 | 0 | 5 | 0 |
| admin-http | 41 | 29 | 12 | 0 |
| public-http | 76 | 48 | 28 | 0 |
| **Total** | **174** | **108** | **66** | **0** |

## 3. MOVE ledger

Brace lists expand to individual files. Unless an arrow says otherwise, preserve the listed relative filename under the stated Jini destination. Existing Jini files are merge targets for the missing behavior, not files to overwrite. K1 mounts and framework-specific code stay in Tovu. K3 copy and K5 collaborators go through injected arguments, and K4 shared neutral contracts go to core.

### Contracts-core — 31

| Tovu source | Jini destination |
|---|---|
| `c/core/{approval-i18n,custom-credential-categories,operator-locale}.ts` | `packages/core/src/contracts/site/` |
| `c/core/events/outbox-drainer.ts` | `packages/infra/src/events/outbox/tracked-delivery.ts` |
| `c/core/{chat-delete-grant,human-confirm}.ts` | `packages/daemon/src/surface-exchanges/` |
| `c/core/native-approval-memory.ts` | `packages/chat/src/core/native-approval-memory.ts` |
| `c/core/tool-metadata/{agent-pause,agent-plugins,assistant,commerce,custom-credentials,frontend-control,fs-files,media-generation,permanent-delete,plugin-runtime,recovery,redirects,search,seo,settings,site-evidence,site-inspection,site-update,trash,visitor-tools,web-screenshot,web,webhooks,widgets}.ts` | `packages/core/src/tool-metadata/` |

The drainer’s delivery tracing is portable. Its scheduler and retry selection are not. The confirmation files still own exchange lifecycle, abort cleanup, approver verification and grant enforcement. Leave Tovu’s tool allowlist, destinations and surface identity with the host. The tool metadata entries move their reusable descriptors and approval classes, not Tovu-only IDs, product copy or the assembled registry.

### Admin HTTP — 29

**API keys → `packages/user-management/src/admin-http/`**

- `r/admin-http/http/api-keys.ts`
- `r/admin-http/routes/api-keys/{create-principal,issue,revoke}.ts`

**Remaining admin HTTP → `packages/cms/src/admin-http/`**

- `r/admin-http/http/{posts,presentation}.ts`
- `r/admin-http/routes/agent-plugins/install-response.ts`
- `r/admin-http/routes/analytics/recent-hits.ts`
- `r/admin-http/routes/assistant/stored-credential-probe.ts`
- `r/admin-http/routes/external-mcp/{oauth,probe}.ts`
- `r/admin-http/routes/forms/delete-submission.ts`
- `r/admin-http/routes/media/{list,stored-media-response}.ts`
- `r/admin-http/routes/plugins/install.ts`
- `r/admin-http/routes/posts/{template-preview,template-preview-render}.ts`
- `r/admin-http/routes/publish-content/{blobs-probe,import-errors,peer-transport,route-helpers}.ts`
- `r/admin-http/routes/settings/events.ts`
- `r/admin-http/routes/system/{custom-credentials,dockerfile-source,mail-providers,publish-credentials,site-share-password}.ts`
- `r/admin-http/routes/system/publish-site.ts` → `packages/cms/src/admin-http/routes/system/publish-site/`, extending that route family with the remaining trigger and destination handling
- `r/admin-http/routes/taxonomy/merge-term.ts`

Three overlaps matter here. Jini’s publish peer transport has `peerPullRoute`, not the residual push-plan, confirm and execute routes. Its custom-credential module has create and delete specs, not the residual list and update handlers. And Jini already parses overwrite keys, so `route-helpers.ts` contributes the reusable typed refusal mapping, not a second parser or the Express authorization gate.

### Public HTTP — 48

**Rendering and site HTTP → `packages/cms/src/public-http/`**

- `r/public-http/http/content/posts.ts`, `r/public-http/http/shared/post.ts`
- `r/public-http/http/site/{bare-page,render-context}.ts`
- `r/public-http/http/site/render/{blocks,content-html,page-body,post-body,template-render-data}.ts`
- `r/public-http/http/site/render/components/{entry-lists,layout,marketing}.ts`
- `r/public-http/routes/agent-plugin-surfaces/export-files.ts`
- `r/public-http/routes/content/posts/get-by-slug.ts`
- `r/public-http/routes/members/{complete-sign-in,oidc-callback,oidc-verify-email,sign-in,unlink-identity}.ts`
- `r/public-http/routes/plugin-contributions.ts`
- `r/public-http/routes/site/{comments-submit,media-rendition,member-pages,products,robots}.ts`
- `r/public-http/routes/site/pages/{extra-head,pre-consent-cache,response,static-tier,template-render}.ts`
- `r/public-http/routes/site/pages/handlers/{home,marketing,post-not-found,post,slug-routes,virtual-page}.ts`
- `r/public-http/routes/site/pages/render-context/{media-metadata,post-previews,taxonomy}.ts`

**Other public HTTP owners**

| Tovu source | Jini destination |
|---|---|
| `r/public-http/http/members.ts` | `packages/user-management/src/members/public-member-response.ts` |
| `r/public-http/middleware/site-cookie-consent.ts` | `packages/cookie-consent/src/site/http.ts` |
| `r/public-http/routes/commerce/purchase.ts` | `packages/commerce/src/http/purchase.ts` |
| `r/public-http/routes/site-assistant-confirm.ts` | `packages/daemon/src/surface-exchanges/site-assistant-confirm.ts` |
| `r/public-http/routes/site/analytics-ingest.ts` | `packages/analytics/src/site/analytics-ingest.ts` |
| `r/public-http/routes/site/{newsletter-confirm,newsletter-unsubscribe}.ts` | `packages/user-management/src/newsletter/http/` |
| `r/public-http/routes/site/search.ts` | `packages/search/src/site/route.ts` |
| `r/public-http/visitor-analytics.ts` | `packages/analytics/src/site/visitor-analytics.ts` |

The public rendering moves are the reusable block, body, listing and page-response behavior. Theme files, CSS, concrete engine wiring and product markup bindings stay. `http/members.ts` contributes the public member DTO, not the Tovu cookie name. `site-cookie-consent.ts` contributes reusable collector admission and receipt eligibility, not Tovu disk placement, asset loading or Express mounts. `comments-submit.ts` contributes admission, return-target and provider-routing decisions, not a second submission engine.

## 4. NOT-CHECKED

None in the 174-row scope. Part 1’s unresolved `a/**` and `w/**` rows were outside this dispatch and are unchanged.
