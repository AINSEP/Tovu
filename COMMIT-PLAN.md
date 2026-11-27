# X4-rest Tovu commit plan (UNCOMMITTED)

All source changes remain in the working tree. `.git` is read-only; no commits, fetches or pushes. No subagents. No tests, mutations, builds, installs, typechecks or linters ran. Package intake and execution belong to Opus.

Actual Tovu HEAD: `b617bcc2b0050e743a717cd13f2e1ffff66b87d8`, not the sheet’s `a96020e1e7`. Upstream source checked at Jini `origin/codex/x4-restj` = `2e5984c66eb8cfb5a50d79a978ff5fe03c78f946`. Bootstrap programmer skills and governing architecture chapters were read from `/Users/la/Programming/Tovu` because this dispatch intentionally omits AI-Dev-Shop/ADS-memory. No architecture redesign, package edits, theme edits, feature activation or desktop edits. Existing host bindings are the approved pattern.

## Ordered logical commits / sheet ledger

Tests were added/repointed before their corresponding production edits, or the named existing witness was retained. X4-21’s JSON-before-heal witness was added after its independent typed-error binding, while the tested list/JSON/heal body stayed unchanged. Restored X4-26/41 production attempts are explicitly excluded from completed work. No RED/GREEN or mutation-kill claim is made.

### X4-01

LEFT-DESKTOP. No desktop edits. Required: extend desktop-resources.test.ts with valid native plus missing/invalid native readings (one bulk read, raw RSS retention, mixed-rss); repoint desktop-resources.ts and its test to @jini-ai/desktop-host/electron/memory-sampler; delete desktop-memory-sampler.ts. Native fallback/composition stay.

Named mutation(s): `replace-invalid-native-with-zero`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/desktop/src/desktop-memory-sampler.ts` — LEFT-DESKTOP

### X4-02

Built. Existing human-confirm.lifecycle.test.ts already pins exact outcomes, first unexpected key (including empty key), pre/post-click grant reads, and revocation preventing a writer. Repointed witnesses before production reduction. Host retains authenticated cards, handler bindings and product batch description. Positional callback ports adapt only at their bindings.

Named mutation(s): `report-expiry-as-user-cancel; skip-post-click-grant-read`.

Files touched in this logical unit:
- `apps/website/src/assistant/external-mcp-call-confirmation.ts`
- `apps/website/src/assistant/tool-approval-policy.ts`
- `apps/website/src/contracts/core/__tests__/human-confirm.lifecycle.test.ts`
- `apps/website/src/contracts/core/human-confirm.ts`
- `apps/website/src/features/agent-plugins/connect-tool.ts`
- `apps/website/src/features/asset-transfer/asset-destinations.ts`
- `apps/website/src/features/asset-transfer/asset-sources.ts`
- `apps/website/src/features/asset-transfer/copy-tool.ts`
- `apps/website/src/features/comments/tool-registrations.ts`
- `apps/website/src/features/database/tool-registrations.ts`
- `apps/website/src/features/deployments/deploy-ops/tool-registrations.ts`
- `apps/website/src/features/deployments/publish-agent-tools.ts`
- `apps/website/src/features/fs-files/tool-registrations.ts`
- `apps/website/src/features/identity/tool-registrations.ts`
- `apps/website/src/features/image-transform/tool.ts`
- `apps/website/src/features/media-import/tool-registrations.ts`
- `apps/website/src/features/media/__tests__/library-save-text.test.ts`
- `apps/website/src/features/media/__tests__/library-tools.test.ts`
- `apps/website/src/features/permanent-delete/tool-registrations.ts`
- `apps/website/src/features/plugin-runtime/host-tool-binding.ts`
- `apps/website/src/features/publish-content/tool-registrations.ts`
- `apps/website/src/features/recovery/tool-registrations.ts`
- `apps/website/src/features/routines/routine-tool-registrations.ts`
- `apps/website/src/features/site-update/tools.ts`
- `apps/website/src/features/storage/tool-registrations.ts`
- `apps/website/src/features/taxonomy/tool-registrations.ts`
- `apps/website/src/features/webhooks/tool-registrations.ts`
- `apps/website/src/server/runtime/composition/agent-plugin-uninstall-host.ts`
- `apps/website/src/server/runtime/composition/modules/assistant-tool-exec.ts`

Source-row outcome:
- `apps/website/src/contracts/core/approval-i18n.ts` — RETAINED
- `apps/website/src/contracts/core/chat-delete-grant.ts` — RETAINED
- `apps/website/src/contracts/core/tool-metadata/agent-pause.ts` — RETAINED
- `apps/website/src/contracts/core/human-confirm.ts` — BOUND

### X4-03

Built. Jini already contains the moved outbox-trace-parent characterization. Retained host-key witness and direct infra validator import; existing outbox-drainer.test.ts pins persisted parent before stripping. Host source only binds tovu.outbox.traceparent.

Named mutation(s): `retain-caller-supplied-parent`.

Files touched in this logical unit:
- `apps/website/src/contracts/core/events/__tests__/outbox-trace-parent.test.ts`
- `apps/website/src/contracts/core/events/outbox-trace-parent.ts`

Source-row outcome:
- `apps/website/src/contracts/core/events/outbox-trace-parent.ts` — BOUND

### X4-04

Built. Jini exact-string characterization already exists. Repointed all five named consumers and deleted contract. No activation change.

Named mutation(s): `omit-workspace-from-fence-key`.

Files touched in this logical unit:
- `apps/website/src/contracts/core/post-revision-lock.ts`
- `apps/website/src/features/post/__tests__/revision-refs.test.ts`
- `apps/website/src/features/post/__tests__/revision-thinning.postgres.test.ts`
- `apps/website/src/features/post/repo.ts`
- `apps/website/src/features/post/revision-thinning.ts`
- `apps/website/src/platform/db/sqlite/change-set-repo.sqlite.ts`

Source-row outcome:
- `apps/website/src/contracts/core/post-revision-lock.ts` — DELETED

### X4-05

Keep-only: stored PUBLISH_TRUST_WIRE and its importers retained; no wire edits.

Named mutation(s): `change-stored-challenge-version`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/contracts/core/publish-trust-wire.ts` — RETAINED

### X4-06

Built. Inspected Jini descriptor characterization before direct importer repoints and deletion.

Named mutation(s): `convert-video-asks-twice`.

Files touched in this logical unit:
- `apps/website/src/contracts/core/tool-metadata/index.ts`
- `apps/website/src/contracts/core/tool-metadata/media-video-conversion.ts`
- `apps/website/src/features/media/tool-registrations.ts`

Source-row outcome:
- `apps/website/src/contracts/core/tool-metadata/media-video-conversion.ts` — DELETED

### X4-07

Built. Inspected Jini four-ID/three-exchange-writer characterization before importer repoints and deletion.

Named mutation(s): `routine-create-redeems-as-fresh-call`.

Files touched in this logical unit:
- `apps/website/src/assistant/byok-tool-surface.ts`
- `apps/website/src/contracts/core/tool-metadata/index.ts`
- `apps/website/src/contracts/core/tool-metadata/routines.ts`
- `apps/website/src/features/routines/__tests__/routine-tool-registrations.unit.test.ts`
- `apps/website/src/features/routines/routine-tool-registrations.ts`
- `apps/website/src/server/runtime/composition/__tests__/create-app-routine-wiring.test.ts`

Source-row outcome:
- `apps/website/src/contracts/core/tool-metadata/routines.ts` — DELETED

### X4-08

Keep-only: storage metadata and consumers retained; no registration/category edits.

Named mutation(s): `cleanup-advertises-direct-delete`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/contracts/core/tool-metadata/storage.ts` — RETAINED

### X4-09

Built. Jini schema contract witness owns one-of/ZIP constraints. Barrel witness excludes the removed forwarding export; direct consumers use host description binding.

Named mutation(s): `allow-path-and-attachment-together`.

Files touched in this logical unit:
- `apps/website/src/contracts/headless/__tests__/index.barrel.unit.test.ts`
- `apps/website/src/contracts/headless/index.ts`
- `apps/website/src/contracts/headless/plugin-install-source.ts`
- `apps/website/src/features/agent-plugins/install-tool.ts`
- `apps/website/src/features/plugin-runtime/plugin-host-copy.ts`

Source-row outcome:
- `apps/website/src/contracts/headless/plugin-install-source.ts` — BOUND

### X4-10

Built. Jini safe-url witness pins normalization before private-path matching and authored video projection. Doc-render host supplies the unchanged admin-original matcher; deleted old parser.

Named mutation(s): `apply-private-path-policy-before-url-normalization`.

Files touched in this logical unit:
- `apps/website/src/platform/html/safe-url.ts`
- `apps/website/src/server/runtime/composition/doc-render-host.ts`

Source-row outcome:
- `apps/website/src/platform/html/safe-url.ts` — DELETED

### X4-11

Built. Extended owner-passkey-routes.unit.test.ts before production edits for no-store/refusal and limiter/management admission order. Existing origin tests now call Jini with identical trusted inputs and copy. Six mounts, passkeyDeps timing, 30-day session lifetime and MFA/recovery files retained.

Named mutation(s): `read-request-host-for-passkey-site`.

Files touched in this logical unit:
- `apps/website/src/server/inbound/admin-http/__tests__/owner-passkey-routes.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/owner-passkey-routes.ts`

Source-row outcome:
- `apps/website/src/server/inbound/admin-http/owner-mfa-routes.ts` — RETAINED
- `apps/website/src/server/inbound/admin-http/owner-recovery-routes.ts` — RETAINED
- `apps/website/src/server/inbound/admin-http/owner-passkey-routes.ts` — BOUND

### X4-12

Keep-only: install-response/export-file host boundaries retained.

Named mutation(s): `put-install-warning-in-body`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/admin-http/routes/agent-plugins/install-response.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces/export-files.ts` — RETAINED

### X4-13

Keep-only: recent-hit and request-bound consent/analytics bindings retained.

Named mutation(s): `include-recent-hit-incident-details-without-principal`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/admin-http/routes/analytics/recent-hits.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/routes/site/analytics-ingest.ts` — RETAINED

### X4-14

Keep-only: all three API-key bindings retained.

Named mutation(s): `issue-key-before-bound-authorization`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/admin-http/routes/api-keys/create-principal.ts` — RETAINED
- `apps/website/src/server/inbound/admin-http/routes/api-keys/issue.ts` — RETAINED
- `apps/website/src/server/inbound/admin-http/routes/api-keys/revoke.ts` — RETAINED

### X4-15

Keep-only: scoped vault readers and visitor confirmation request bindings retained.

Named mutation(s): `eagerly-open-saved-credential; confirm-before-owner-resolution`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/admin-http/routes/assistant/stored-credential-probe.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/routes/site-assistant-confirm.ts` — RETAINED

### X4-16

Keep-only: OAuth/probe mounts and external-mcp-route-failures.unit.test.ts retained.

Named mutation(s): `apply-one-gate-order-to-all-oauth-routes`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts` — RETAINED
- `apps/website/src/server/inbound/admin-http/routes/external-mcp/probe.ts` — RETAINED

### X4-17

Built. Jini provider-catalog witness pins grant before lookup and providers envelope; composition repointed, catalog file deleted, list binding retained.

Named mutation(s): `list-catalog-before-grant`.

Files touched in this logical unit:
- `apps/website/src/server/inbound/admin-http/routes/media/provider-catalog.ts`
- `apps/website/src/server/runtime/composition/modules/media.ts`

Source-row outcome:
- `apps/website/src/server/inbound/admin-http/routes/media/list.ts` — RETAINED
- `apps/website/src/server/inbound/admin-http/routes/media/provider-catalog.ts` — DELETED

### X4-18

Keep-only: install-route.unit.test.ts and four CMS plugin mounts retained.

Named mutation(s): `mount-zip-parser-before-auth`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/admin-http/routes/plugins/install.ts` — RETAINED

### X4-19

Built. Added typed transport/unknown refusal characterization before extracting local table/projection. Direct knownPeerActionRefusal consumers now import Jini (required to remove the local implementation without a forwarding export); route mounts and respondWithError importers remain on the host path.

Named mutation(s): `replace-typed-peer-code-with-generic-code`.

Files touched in this logical unit:
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peer-transport.routes.pins.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/peer-transport.ts`
- `apps/website/src/server/runtime/composition/modules/publish-content-backstop.ts`
- `apps/website/src/server/runtime/composition/modules/publish-content-transport.ts`

Source-row outcome:
- `apps/website/src/server/inbound/admin-http/routes/publish-content/blobs-probe.ts` — RETAINED
- `apps/website/src/server/inbound/admin-http/routes/publish-content/import-errors.ts` — RETAINED
- `apps/website/src/server/inbound/admin-http/routes/publish-content/route-helpers.ts` — RETAINED
- `apps/website/src/server/inbound/admin-http/routes/publish-content/peer-transport.ts` — BOUND

### X4-20

Keep-only: events-head-rejection.unit.test.ts and event-stream host binding retained.

Named mutation(s): `read-head-before-write-head`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/admin-http/routes/settings/events.ts` — RETAINED

### X4-21

PARTIAL. Publish-credentials typed error mapper bound, but listPublishCredentialsReply is ABSENT from packages/cms/src/admin-http/routes/system/publish-credentials/list.ts on origin/codex/x4-restj; list/JSON/heal body remains. Kept direct missing-principal witness; added JSON-before-heal characterization while that sequence remains unchanged. Publish-site readTargetConfig/preview/target projection bound after new preview/allowlist witness. Residual credentialChoice validation is still shared by startAdminPublish and the moved preview: Jini keeps it PRIVATE and exports no matching trigger-side helper. No new export/adapter invented; publish-site is not claimed pure binding. Dockerfile unchanged.

Named mutation(s): `heal-before-list-response; inspect-unconfigured-target; spread-target-descriptor`.

Files touched in this logical unit:
- `apps/website/src/server/__tests__/routes/publish-credentials-route.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/__tests__/publish-site.tw4.pins.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts`

Source-row outcome:
- `apps/website/src/server/inbound/admin-http/routes/system/dockerfile-source.ts` — RETAINED
- `apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts` — PARTIAL
- `apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts` — PARTIAL

### X4-22

Keep-only: late credential-kind and host mail bindings retained.

Named mutation(s): `read-request-credential-kind-at-mount`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/admin-http/routes/system/mail-providers.ts` — RETAINED

### X4-23

Built. Added owner/session+origin-before-form cases and signal assertion before production edit. Import/read-owner/complete-owner operations bind Jini; ZIP parser, gate, busy slot, deadlines and cleanup remain.

Named mutation(s): `parse-owner-setup-before-origin-check`.

Files touched in this logical unit:
- `apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-import-saved-keys.integration.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/site-imports.ts`

Source-row outcome:
- `apps/website/src/server/inbound/admin-http/routes/system/site-imports.ts` — BOUND

### X4-24

Keep-only: site-share-failures.test.ts and host session/origin/no-store binding retained.

Named mutation(s): `call-reveal-before-origin-check`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/admin-http/routes/system/site-share-password.ts` — RETAINED

### X4-25

Built. Existing proof retry retained and cookie order strengthened; added lost-session-under-lock and failed-protocol-no-links witnesses before production edit. Parsers repointed to Jini with real cancellation error. Link/onMemberCreated/request-fact getters defer reads until protocol completion. Unlink binds the existing locked operation. Removed cookie forwarding export and repointed named consumers.

Named mutation(s): `emit-session-cookie-before-transaction-result; read-link-facts-before-protocol-result`.

Files touched in this logical unit:
- `apps/website/src/server/__tests__/routes/member-oidc-auth.test.ts`
- `apps/website/src/server/__tests__/routes/request-cost-cacheability.measurement.test.ts`
- `apps/website/src/server/inbound/public-http/routes/__tests__/integration/plugin-contributions.auth.integration.test.ts`
- `apps/website/src/server/inbound/public-http/routes/__tests__/plugin-contributions.unit.test.ts`
- `apps/website/src/server/inbound/public-http/routes/members/__tests__/member-proof-bodies.unit.test.ts`
- `apps/website/src/server/inbound/public-http/routes/members/__tests__/oidc-callback-params.unit.test.ts`
- `apps/website/src/server/inbound/public-http/routes/members/complete-sign-in.ts`
- `apps/website/src/server/inbound/public-http/routes/members/oidc-callback.ts`
- `apps/website/src/server/inbound/public-http/routes/members/oidc-deps.ts`
- `apps/website/src/server/inbound/public-http/routes/members/oidc-verify-email.ts`
- `apps/website/src/server/inbound/public-http/routes/members/unlink-identity.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/member-pages.route.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/search.ts`
- `apps/website/src/server/runtime/composition/modules/public-members.ts`

Source-row outcome:
- `apps/website/src/server/inbound/public-http/http/members.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/routes/members/complete-sign-in.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/routes/members/oidc-start.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/routes/members/sign-in.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/routes/members/oidc-callback.ts` — BOUND
- `apps/website/src/server/inbound/public-http/routes/members/oidc-verify-email.ts` — BOUND
- `apps/website/src/server/inbound/public-http/routes/members/unlink-identity.ts` — BOUND

### X4-26

STOPPED production file; new managed/static ordering characterization remains. Jini RenderSiteRequired.resolveTemplateId, resolveLiquidTemplateId and resolveHandlebarsTemplateId require string | undefined; Tovu real resolvers return string | null (features/theme/render-contract.ts). Binding would require an unlisted coercion or upstream contract fix. Reverted attempted production binding; render-site.ts equals HEAD. Seven leaf bindings unchanged.

Named mutation(s): `collect-assets-before-body-transform`.

Files touched in this logical unit:
- `apps/website/src/server/inbound/public-http/http/site/__tests__/render.golden.characterization.test.ts`

Source-row outcome:
- `apps/website/src/server/inbound/public-http/http/site/bare-page.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/http/site/render/blocks.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/http/site/render/components/entry-lists.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/http/site/render/content-html.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/http/site/render/page-body.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/http/site/render/post-body.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/http/site/render/template-render-data.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/http/site/render-site.ts` — STOPPED

### X4-27

PARTIAL. Added retired receipt, declined collector, pending refresh shared by two app builds, preview/off assets, off-cookie and non-full-cookie assertions before production edit. Bound plugin match/collector/visitor/receipt operations and document state/assets/loader to Jini. Exact residual blocker: Jini analyticsProof destructures cookieHeader before its non-full guard, forcing a second cookie read that the host must skip. Local readSiteAnalyticsProof body retained; no fake cookie/default added.

Named mutation(s): `skip-active-receipt-read; refresh-per-app-build`.

Files touched in this logical unit:
- `apps/website/src/server/inbound/public-http/middleware/__tests__/site-cookie-consent.regressions.unit.test.ts`
- `apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts`

Source-row outcome:
- `apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts` — PARTIAL

### X4-28

Built. Added exempt-admin vs public-slug status-read characterization first; middleware binds siteServingDecision and retains host lists/exact 503/error handling.

Named mutation(s): `read-site-status-before-exemption`.

Files touched in this logical unit:
- `apps/website/src/server/inbound/public-http/middleware/__tests__/site-serving-gate.test.ts`
- `apps/website/src/server/inbound/public-http/middleware/site-serving-gate.ts`

Source-row outcome:
- `apps/website/src/server/inbound/public-http/middleware/site-serving-gate.ts` — BOUND

### X4-29

Keep-only: public/member visibility resolver binding retained.

Named mutation(s): `supply-anonymous-access-for-authenticated-post-request`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts` — RETAINED

### X4-30

Keep-only: plugin-contributions.auth.integration.test.ts retained; only required X4-25 cookie import repoint.

Named mutation(s): `parse-plugin-body-before-activation; skip-post-handler-generation-check`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/public-http/routes/plugin-contributions.ts` — RETAINED

### X4-31

Keep-only: comments-submit.test.ts and host origin/form/analytics/reporting binding retained.

Named mutation(s): `enumerate-provider-before-origin-admission`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/public-http/routes/site/comments-submit.ts` — RETAINED

### X4-32

Built. Added denial/missing equality, original-alias/retired-slug parity, and no-validator/no-byte assertions before production edit. Host only binds request facts, evidence cache, clock, lazy member entitlement, repos, crypto, sanitization and byte writers. Both aliases share the cache/ports; no media-maintenance activation.

Named mutation(s): `evaluate-etag-before-admission; ignore-retired-slug-evidence`.

Files touched in this logical unit:
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/media-validation.integration.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts`

Source-row outcome:
- `apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts` — BOUND

### X4-33

Keep-only: pre-consent-vary.route.test.ts and response/cache bindings retained.

Named mutation(s): `overwrite-vary-on-consent`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/public-http/routes/site/pages/pre-consent-cache.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/routes/site/pages/response.ts` — RETAINED

### X4-34

STOPPED both sources. Jini media-metadata.ts and post-previews.ts are ABSENT at the specified render-context entry paths on origin/codex/x4-restj. Jini peer report also says specified CRP-15/16 witness files absent. No replacements invented.

Named mutation(s): `key-metadata-by-resolved-id; page-before-visibility`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/public-http/routes/site/pages/render-context/media-metadata.ts` — STOPPED
- `apps/website/src/server/inbound/public-http/routes/site/pages/render-context/post-previews.ts` — STOPPED

### X4-35

STOPPED both sources. Jini static-tier.ts and template-render.ts are ABSENT at the specified pages entry paths; peer report says specified witnesses absent. Existing host bodies retained.

Named mutation(s): `assign-listing-keys-before-substitution; resolve-saved-html-instead-of-pending`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/public-http/routes/site/pages/static-tier.ts` — STOPPED
- `apps/website/src/server/inbound/public-http/routes/site/pages/template-render.ts` — STOPPED

### X4-36

PARTIAL. Used pre-existing Jini marketing/post-not-found/post/nested-route witnesses first. Fully bound marketing and post-not-found, bound template-eligibility and nested redirects independently. home.ts and virtual-page.ts entries are ABSENT; post.ts exports neither renderGenericPostPage nor renderBarePostPage; slug-routes.ts exports no slugPageRoute. Remaining host bodies retained and not counter-kept.

Named mutation(s): `serve-static-index-before-root; ignore-marketing-override-flag; record-not-found-before-redirect; theme-gate-before-bare; render-denied-slug; read-virtual-body-from-public-repo`.

Files touched in this logical unit:
- `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/marketing.ts`
- `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/post-not-found.ts`
- `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/post.ts`
- `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/slug-routes.ts`

Source-row outcome:
- `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/home.ts` — STOPPED
- `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/virtual-page.ts` — STOPPED
- `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/marketing.ts` — BOUND
- `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/post-not-found.ts` — BOUND
- `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/post.ts` — PARTIAL
- `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/slug-routes.ts` — PARTIAL

### X4-37

PARTIAL. Existing first-occurrence/dedup projector witness already covers named case and is repointed; composition repointed; template-preview-youtube.ts deleted. Render half STOPPED: Jini template-preview-render.ts is ABSENT, including TemplatePreviewRenderError and renderPostPreview; host render body/error imports retained. HTTP binding unchanged.

Named mutation(s): `fallback-to-saved-on-empty-pending-html; return-duplicate-preview-video-ids`.

Files touched in this logical unit:
- `apps/website/src/server/inbound/admin-http/routes/posts/__tests__/template-preview-embeds.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/posts/template-preview-youtube.ts`
- `apps/website/src/server/runtime/composition/modules/content.ts`

Source-row outcome:
- `apps/website/src/server/inbound/admin-http/routes/posts/template-preview-render.ts` — STOPPED
- `apps/website/src/server/inbound/admin-http/routes/posts/template-preview-youtube.ts` — DELETED
- `apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts` — RETAINED

### X4-38

Built. Extended member-pages.route.test.ts before production edit: private header before denial lookup and signed-in account response private/no-store. Binds makeMemberPagePost/memberPageRoute, retains product catalog/markup/session/render/writers.

Named mutation(s): `defer-private-header-until-after-session`.

Files touched in this logical unit:
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/member-pages.route.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/member-pages.ts`

Source-row outcome:
- `apps/website/src/server/inbound/public-http/routes/site/member-pages.ts` — BOUND

### X4-39

Built. Added overlapping held confirmation plus failing request witness first; reporters and subscription request facts remain separate. Request-deps closures replace AsyncLocalStorage dispatcher; public raw mount exposes handlerName using existing registeringUnderName. Three forwardRejection names/verb positions preserved; route-table pin untouched. Scope file deleted.

Named mutation(s): `reuse-first-newsletter-request-facts`.

Files touched in this logical unit:
- `apps/website/src/server/__tests__/routes/newsletter-public-routes.test.ts`
- `apps/website/src/server/inbound/admin-http/admin-raw-route-ports.ts`
- `apps/website/src/server/inbound/public-http/routes/site/newsletter-confirm.ts`
- `apps/website/src/server/inbound/public-http/routes/site/newsletter-public-scope.ts`
- `apps/website/src/server/inbound/public-http/routes/site/newsletter-unsubscribe.ts`

Source-row outcome:
- `apps/website/src/server/inbound/public-http/routes/site/newsletter-confirm.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/routes/site/newsletter-unsubscribe.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/routes/site/newsletter-public-scope.ts` — DELETED

### X4-40

Keep-only: SEO/head host title/origin/deferred metadata bindings retained.

Named mutation(s): `use-configured-origin-in-place-of-verified-serving-origin`.

Files touched: none (keep-only / stopped / desktop hold).

Source-row outcome:
- `apps/website/src/server/inbound/public-http/routes/site/pages/extra-head.ts` — RETAINED
- `apps/website/src/server/inbound/public-http/routes/site/seo-documents.ts` — RETAINED

### X4-41

STOPPED production file; new admission/snapshot characterization remains. Jini purchase admitPurchase deps.checkLimit requires Promise<{ allowed: boolean; retryAfterSeconds: number }> even on success. Tovu RateLimitResult success is { allowed: true }, without retryAfterSeconds. No unlisted default, cast or new interface added. Reverted attempted production binding; purchase.ts equals HEAD. Existing settlement/buyer tests untouched.

Named mutation(s): `activate-before-origin; allocate-write-snapshot-for-return`.

Files touched in this logical unit:
- `apps/website/src/server/inbound/public-http/routes/commerce/__tests__/purchase.integration.test.ts`

Source-row outcome:
- `apps/website/src/server/inbound/public-http/routes/commerce/purchase.ts` — STOPPED

### X4-42

Built. Added missing-detail one-point-lookup/no-render/no-decoration + receiver assertion before production edit. Bound selectors and route decisions; real catalog methods are bound to their receiver. Host theme/consent/checkout/writers and two 500 messages retained.

Named mutation(s): `decorate-before-product-exists`.

Files touched in this logical unit:
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/products.route.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/products.ts`

Source-row outcome:
- `apps/website/src/server/inbound/public-http/routes/site/products.ts` — BOUND

### X4-43

Keep-only: search limits/analytics binding retained; cookie import direct under X4-25.

Named mutation(s): `record-search-before-admission`.

Files touched in this logical unit:
- `apps/website/src/server/inbound/public-http/routes/site/search.ts`

Source-row outcome:
- `apps/website/src/server/inbound/public-http/routes/site/search.ts` — RETAINED

## Exact-path counter keeps

The branch-only planner is not installed in this checkout. These exact anchored rules were evaluated with its reconstructed five keep sections; no directory keep was widened. They are carried here for coordinator intake, not invented as a second checked-in scanner. Partial/stopped sources are deliberately absent.

```js
const X4_EXACT_KEEPS = [
  [/^apps\/website\/src\/contracts\/core\/approval\-i18n\.ts$/, 'X4-02: retained host policy or dependency binding'],
  [/^apps\/website\/src\/contracts\/core\/chat\-delete\-grant\.ts$/, 'X4-02: retained host policy or dependency binding'],
  [/^apps\/website\/src\/contracts\/core\/tool\-metadata\/agent\-pause\.ts$/, 'X4-02: retained host policy or dependency binding'],
  [/^apps\/website\/src\/contracts\/core\/human\-confirm\.ts$/, 'X4-02: retained host policy or dependency binding'],
  [/^apps\/website\/src\/contracts\/core\/events\/outbox\-trace\-parent\.ts$/, 'X4-03: retained host policy or dependency binding'],
  [/^apps\/website\/src\/contracts\/core\/publish\-trust\-wire\.ts$/, 'X4-05: retained host policy or dependency binding'],
  [/^apps\/website\/src\/contracts\/core\/tool\-metadata\/storage\.ts$/, 'X4-08: retained host policy or dependency binding'],
  [/^apps\/website\/src\/contracts\/headless\/plugin\-install\-source\.ts$/, 'X4-09: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/owner\-mfa\-routes\.ts$/, 'X4-11: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/owner\-recovery\-routes\.ts$/, 'X4-11: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/owner\-passkey\-routes\.ts$/, 'X4-11: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/agent\-plugins\/install\-response\.ts$/, 'X4-12: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/agent\-plugin\-surfaces\/export\-files\.ts$/, 'X4-12: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/analytics\/recent\-hits\.ts$/, 'X4-13: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/site\/analytics\-ingest\.ts$/, 'X4-13: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/api\-keys\/create\-principal\.ts$/, 'X4-14: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/api\-keys\/issue\.ts$/, 'X4-14: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/api\-keys\/revoke\.ts$/, 'X4-14: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/assistant\/stored\-credential\-probe\.ts$/, 'X4-15: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/site\-assistant\-confirm\.ts$/, 'X4-15: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/external\-mcp\/oauth\.ts$/, 'X4-16: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/external\-mcp\/probe\.ts$/, 'X4-16: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/media\/list\.ts$/, 'X4-17: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/plugins\/install\.ts$/, 'X4-18: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/publish\-content\/blobs\-probe\.ts$/, 'X4-19: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/publish\-content\/import\-errors\.ts$/, 'X4-19: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/publish\-content\/route\-helpers\.ts$/, 'X4-19: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/publish\-content\/peer\-transport\.ts$/, 'X4-19: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/settings\/events\.ts$/, 'X4-20: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/system\/dockerfile\-source\.ts$/, 'X4-21: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/system\/mail\-providers\.ts$/, 'X4-22: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/system\/site\-imports\.ts$/, 'X4-23: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/system\/site\-share\-password\.ts$/, 'X4-24: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/http\/members\.ts$/, 'X4-25: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/members\/complete\-sign\-in\.ts$/, 'X4-25: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/members\/oidc\-start\.ts$/, 'X4-25: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/members\/sign\-in\.ts$/, 'X4-25: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/members\/oidc\-callback\.ts$/, 'X4-25: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/members\/oidc\-verify\-email\.ts$/, 'X4-25: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/members\/unlink\-identity\.ts$/, 'X4-25: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/http\/site\/bare\-page\.ts$/, 'X4-26: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/http\/site\/render\/blocks\.ts$/, 'X4-26: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/http\/site\/render\/components\/entry\-lists\.ts$/, 'X4-26: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/http\/site\/render\/content\-html\.ts$/, 'X4-26: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/http\/site\/render\/page\-body\.ts$/, 'X4-26: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/http\/site\/render\/post\-body\.ts$/, 'X4-26: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/http\/site\/render\/template\-render\-data\.ts$/, 'X4-26: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/middleware\/site\-serving\-gate\.ts$/, 'X4-28: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/content\/posts\/get\-by\-slug\.ts$/, 'X4-29: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/plugin\-contributions\.ts$/, 'X4-30: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/site\/comments\-submit\.ts$/, 'X4-31: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/site\/media\-rendition\.ts$/, 'X4-32: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/site\/pages\/pre\-consent\-cache\.ts$/, 'X4-33: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/site\/pages\/response\.ts$/, 'X4-33: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/site\/pages\/handlers\/marketing\.ts$/, 'X4-36: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/site\/pages\/handlers\/post\-not\-found\.ts$/, 'X4-36: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/admin\-http\/routes\/posts\/template\-preview\.ts$/, 'X4-37: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/site\/member\-pages\.ts$/, 'X4-38: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/site\/newsletter\-confirm\.ts$/, 'X4-39: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/site\/newsletter\-unsubscribe\.ts$/, 'X4-39: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/site\/pages\/extra\-head\.ts$/, 'X4-40: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/site\/seo\-documents\.ts$/, 'X4-40: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/site\/products\.ts$/, 'X4-42: retained host policy or dependency binding'],
  [/^apps\/website\/src\/server\/inbound\/public\-http\/routes\/site\/search\.ts$/, 'X4-43: retained host policy or dependency binding'],
];
```

## Count rerun

Scanner and planner classification loaded from `/Users/la/Programming/Tovu` `origin/plan/whats-left-1122:plans/P9-data/tools/{scan,plan}.mjs`; only the classification stage was evaluated. Five report sections from `plans/count-1124/` expand to 507 rules (regex alternatives retained); no claim to recover the historical 3,615 generated rules. Actual HEAD differs from the dispatch denominator, so these counts are at the actual checkout.

| Stage | Baseline HEAD | Final working tree |
|---|---:|---:|
| Raw moving candidates | 1,152 | 1,145 |
| Excluding theme areas | 1,031 | 1,024 |
| Five report keep sections | 508 | 501 |
| Plus 64 exact X4 host keeps | — | 437 |

Slice reconciliation: 86 rows = 49 retained + 15 bound + 7 deleted + 5 partial + 9 stopped + 1 LEFT-DESKTOP. The 37 MOVE rows have 22 completed (15 bindings, 7 deletions), with 15 remaining. Count evidence: `/tmp/x4-count-result.json`. No other slice is counted as completed by this task.

## Final diff deletions / scope cleanup

- Deleted moved Tovu sources:
  - `apps/website/src/contracts/core/post-revision-lock.ts`
  - `apps/website/src/contracts/core/tool-metadata/media-video-conversion.ts`
  - `apps/website/src/contracts/core/tool-metadata/routines.ts`
  - `apps/website/src/platform/html/safe-url.ts`
  - `apps/website/src/server/inbound/admin-http/routes/media/provider-catalog.ts`
  - `apps/website/src/server/inbound/admin-http/routes/posts/template-preview-youtube.ts`
  - `apps/website/src/server/inbound/public-http/routes/site/newsletter-public-scope.ts`
- Removed forwarding exports: `PLUGIN_INSTALL_SOURCE_SCHEMA` from contracts/headless/index.ts; `MEMBER_SESSION_COOKIE` from complete-sign-in.ts.
- Removed moved approval/projection/parser, trace, metadata, passkey dispatch, peer refusal, import operation, member-link/unlink, consent, media, page-handler and storefront bodies only where usable Jini owners exist.
- Reverted the attempted render-site.ts and purchase.ts bindings after concrete upstream signature mismatches. Kept their characterization additions. No unrelated cleanup, new source file, helper abstraction, validation, fallback, retry, interface, package manifest or lockfile change.

## Static review / handoff

- Architecture audit: WARNING / PARTIAL. Completed cuts use static Jini imports and host dependency/request bindings; partial/stopped bodies remain explicitly listed. Upstream package artifacts are not installed here. No runtime or type readiness claim.
- Reuse: the entries named by each sheet were inspected on origin/codex/x4-restj and called directly; no alternate Jini owner was introduced.
- Direct coverage seams: the named host route, card, cookie, consent, media and renderer tests above; upstream descriptor/schema/revision/handler witnesses retained. Coverage numbers unavailable because execution is prohibited.
- Manual function review: bound functions perform dependency projection/response writing; no new domain algorithm. Remaining local logic is listed under PARTIAL/STOPPED. Function lengths/complexity were not measured by running a linter/metric gate.
- Cost retained: one consent state per site key; one shared pending refresh; 60-second policy interval and 250-ms initial-read bound. Media keeps the same workspace evidence cache and lazy per-request member entitlement. No new polling, worker, timer class or cache introduced.
- Fresh static evidence: syntax-only TypeScript source parsing; git diff --check; count/import graph review. No import of any of the seven deleted source paths remains in the scanner graph. Desktop, themes, package manifests/lockfiles and the route-table pin are unchanged.
- Pre-completion: requirements and diff re-read; no tests removed or weakened; all source changes confined to named Tovu bindings/importers/witnesses. COMMIT-PLAN.md is the only created workspace file. Runtime self-validation not run because dispatch prohibits tests/builds/installs. Opus must execute the witnesses and named mutations after package intake.

Final static review: 95 modified TypeScript files parsed with the existing TypeScript parser (syntax only), zero parse diagnostics, zero remaining moved-symbol imports from the old host owners; `git diff --check` clean. Seven deleted source paths have zero remaining importers. Total tracked diff: 102 files; COMMIT-PLAN.md is untracked. No desktop/theme/package files changed. Review artifact: `/tmp/x4-static-review.json`.
