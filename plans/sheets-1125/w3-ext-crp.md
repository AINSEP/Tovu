SHEETS EXTRACTION PARTIAL: 24 sheets (12 Jini / 12 Tovu), 20 OPUS-REVIEW, 28 files move

| Area | Original MOVE | Source removed on merge-23 | Surviving host adapter, already extracted | Sheeted | NOT-SHEETED |
|---|---:|---:|---:|---:|---:|
| Contracts core | 31 | 25 | 0 | 6 | 0 |
| Admin HTTP | 29 | 5 | 8 | 8 | 8 |
| Public HTTP | 48 | 6 | 6 | 14 | 22 |
| **Total** | **108** | **36** | **14** | **28** | **30** |

Anchors are from Tovu `bf1519bba7` and Jini `ad71bf68d`, both detached at `origin/integ/merge-23-2026-11-25`. The 28 count is unique ledger source files, including splits where the adapter stays. It does not count a source twice for the Jini and Tovu sheets. The 66 original STAYS-HOST rows are outside this dispatch. No files changed. No tests, builds, installs, or type-checks ran.

**Subtract before building**

- **Contracts removed, 25.** `operator-locale.ts`, `native-approval-memory.ts`, and all 23 ledger `tool-metadata/` files except `agent-pause.ts`. The surviving locale contracts and native approval memory are in Jini core. Use the current core metadata modules and their split catalogs, not the old ledger’s proposed destinations.
- **Admin removed, 5.** `http/{api-keys,posts}.ts`, `routes/forms/delete-submission.ts`, `routes/system/custom-credentials.ts`, and `routes/taxonomy/merge-term.ts`. These source paths are no longer build anchors. In particular, don’t recreate a monolithic merge-term registrar alongside Jini’s `merge-{plan,confirm,execute}` family.
- **Public removed, 6.** `http/content/posts.ts`, `http/shared/post.ts`, `http/site/render-context.ts`, `http/site/render/components/layout.ts`, `routes/site/robots.ts`, and `routes/site/pages/render-context/taxonomy.ts`. The robots registrar now mounts Jini’s `robotsRoute` from `routes/site/seo-documents.ts:85`.
- **Admin adapters retained, 8.** `routes/api-keys/{create-principal,issue,revoke}.ts:8`, `routes/analytics/recent-hits.ts:55`, `routes/media/list.ts:14`, `routes/posts/template-preview.ts:51,58`, `routes/publish-content/blobs-probe.ts:17`, and `routes/system/dockerfile-source.ts:21`. These already use Jini specs or the shared preview function. The separate preview renderer is not done.
- **Public adapters retained, 6.** `routes/agent-plugin-surfaces/export-files.ts:30`, `routes/content/posts/get-by-slug.ts:39`, and `routes/site/{analytics-ingest:27,newsletter-confirm:17,newsletter-unsubscribe:16,search:38}.ts`. Their remaining work is request binding, gates, host policy, or response composition. Keep the existing specs.

**Build conventions**

`W/` = Tovu `apps/website/src/`. `C/` = `W/contracts/core/`. `A/` = `W/server/inbound/admin-http/`. `P/` = `W/server/inbound/public-http/`. `M/` = `W/server/runtime/composition/modules/`. `J/<pkg>/` = Jini `packages/<pkg>/src/`. Source ranges below refer to the pinned heads, not shifted lines after an earlier sheet.

Recheck both SHAs and the listed imports at build time. For a removed module, repeat `git grep -n` on its import suffix and exported symbols, including `#src/` aliases, dynamic imports, and tests. For a split, repoint moved symbols and leave only real host bindings behind. Historical reports are not source importers. Preserve why-comments with their logic and keep existing wire, gate order, reporter boundaries, and feature defaults. No new migrations or screen moves.

On every new Jini subpath, add the corresponding `packages/<pkg>/package.json` export with `types`, `import`, and `default` pointing to the built file. Match `jini.entries` and the owning domain mapping where the package uses one. New pure leaves are `universal`. Existing entries stay in place unless a sheet names a new entry. Add tests before implementation. Sol writes but does not run them. Opus verifies the witness, applies and restores the named mutation, runs the affected gates, and regenerates only the affected `api-baseline/jini-ai__<pkg>.json` files using the Jini baseline workflow. This applies to ordinary verification too. `OPUS-REVIEW` adds focused review of the named security or privacy boundary, not a separate builder or build prerequisite.

Every Tovu sheet consumes its paired Jini export through the existing workspace dependency and release workflow. No Tovu export, changeset, or API-baseline entry is added. No version bump to an unpublished package. Use object args and preserve the optional pads. With exact optional properties, omit absent keys unless a receiving type explicitly allows `undefined`. Preserve meaningful falsy values. Keep functions at most 80 lines and complexity at most 10.

## Jini sheets, in build order

### CRP-01.J — Approval copy, credential category vocabulary, and resume descriptor

**BUILDER: SOL · OPUS-REVIEW · 3 source files**

- `C/approval-i18n.ts:2–107,109–157` → `J/core/contracts/site/approval-i18n.ts`. Move `APPROVAL_COPY`, schema labels, action copy, and the first eight routine labels verbatim. Leave the ninth routine key and its 21 translated desktop-availability notices in Tovu. `approvalText({ locale, key }: { locale: string; key: string }, _optional = {}): string` keeps schema → chrome → actions → routine labels → key precedence. Use `Object.hasOwn` before dynamic locale access and checked English/key fallback, including `schemaCopy[locale] ?? schemaCopy.en ?? key`. Don’t move the product name into the neutral table.
- `C/custom-credential-categories.ts:1–3` → **existing** `J/core/contracts/site/core-custom-credential-categories.ts:13`. Add `CUSTOM_CREDENTIAL_CATEGORIES: readonly CustomCredentialCategoryId[]` in the same six-value order. It is a vocabulary, not permission or vault admission. Keep category selection injected at existing consumers.
- `C/tool-metadata/agent-pause.ts:4–14` → `J/core/tool-metadata/agent-pause.ts`. Export `createResumeAgentWorkMetadata({ toolId, search }: { toolId: string; search: { keywords: string; queries: readonly string[] } }, _optional = {}): ToolMetadataById<ToolApprovalPolicy>`. Move `{ class: "edit", confirmation: "direct" }` and its rationale. Keep the registry key and search copy host-bound. Do not implicitly register or enable the tool.

**Tests first.** `core/contracts/site/__tests__/approval-i18n.test.ts` — `uses localized schema labels, English fallback and the original unknown key` (`approval-labels-always-english`). `core/contracts/site/__tests__/custom-credential-categories.test.ts` — `exports the ordered closed credential category vocabulary` (`drop-general-category`). `core/tool-metadata/__tests__/agent-pause.test.ts` — `resume metadata is edit-class and direct under the supplied ID` (`resume-adds-second-confirmation`).

**Package/API.** Add `./contracts/site/approval-i18n` and `./tool-metadata/agent-pause`. Extend the existing credential-category entry. `.changeset/crp-01-contract-catalog.md`, core baseline.

### CRP-02.J — Confirmation lifecycle and fresh deletion grant

**BUILDER: SOL · OPUS-REVIEW · 2 source files**

- `C/chat-delete-grant.ts:4–9` and `C/human-confirm.ts:54–64` → existing `J/core/contracts/site/daemon-surface-exchanges.ts:13`, beside `AssistantSurfaceDeps`. Move the structural `ChatDeleteSurfaceDeps` and `HumanConfirmSurfaceDeps`, including the optional observe-only receipt port. Keep `HumanConfirmSpec` in its existing core owner.
- `C/chat-delete-grant.ts:19–29` → `J/daemon/surface-exchanges/chat-delete-grant.ts`. `requireChatDeleteGrant(required: { surfaces: ChatDeleteSurfaceDeps; toolId: string; principalId?: string; isDeleteTool: (required: { toolId: string }) => boolean; missingGrant: (required: { toolId: string }) => Error }, _optional = {}): Promise<void>`. Preserve the no-op for an unlisted tool, fail closed without a reader, and forward the optional principal only when present. Tovu supplies the allowlist and refusal destination, including the wording.
- `C/human-confirm.ts:66–141` → `J/daemon/surface-exchanges/human-confirm.ts`, using `../surface-exchanges.js`. Move `HUMAN_CONFIRM_CHOICE_PARAM`, `HumanConfirmOutcome`, `requireAccessApprover`, and the lifecycle. `requireHumanConfirm(required: { ctx: ToolExecutionContext; surfaces: HumanConfirmSurfaceDeps; spec: HumanConfirmSpec; requireDeleteGrant: (required: { surfaces: ChatDeleteSurfaceDeps; toolId: string; principalId: string }) => Promise<void>; render: (required: { spec: HumanConfirmSpec; exchange: ReturnType<ChatDeleteSurfaceDeps["surfaceExchanges"]["open"]>; alternatives: readonly HumanConfirmAlternative[] }) => UIResourceUri }, { emitSurface }: ToolExecutionOptions = {}): Promise<HumanConfirmOutcome>`. Use the existing core UI resource type. Replace the two grant calls and the card-render call with those ports. Keep access checks before disclosure and after an explicit confirm, and the pre-abort check before `open`. Preserve observe-only receipts, the non-restorable emitter, abort cleanup, and only accepting choices offered on that card. A private helper can choose the emitter and open the exchange to keep the lifecycle below the complexity cap. Do not duplicate the registration kit or make daemon import UI.

**Tests first.** `daemon/surface-exchanges/__tests__/human-confirm.test.ts` — `does not resume after the grant or approving person changes while the card is open` (`skip-post-click-grant-read`). Also pin an already-aborted signal opening no exchange, one abort close, a balanced listener, an unoffered choice never reported as selected, and the non-restorable receipt path. `daemon/surface-exchanges/__tests__/chat-delete-grant.test.ts` — `requires a fresh grant only for a selected delete tool` (`allow-delete-without-grant-reader`).

**Package/API.** Add `./surface-exchanges/chat-delete-grant` and `./surface-exchanges/human-confirm`, matching the existing daemon exchange entry’s runtime classification. Extend core’s existing `./contracts/site/daemon-surface-exchanges`. `.changeset/crp-02-human-confirm.md`, core and daemon baselines.

### CRP-03.J — Strip delivery-only data after reading the persisted trace parent

**BUILDER: SOL · OPUS-REVIEW · 1 source file**

`C/events/outbox-drainer.ts:67–73` → existing `J/infra/events/domain-outbox.ts:80–109`. Delivery tracing already lives here. Do not add another drainer or tracing entry. Extend `trackOutboxDelivery({ bus, tracker }, optional = {})` to accept `prepareEvent?: (required: { event: DomainEvent }, _optional?: Record<string, never>) => DomainEvent` beside `readParent?: ReadOutboxParent`. Read the parent from the original event. Inside the existing trace’s `run`, call `bus.publish(input)` if the port is absent, or `bus.publish({ ...input, event: prepareEvent({ event: input.event }) })` if present. Keep the event-name attribute from the original input. A parent-reader failure drops correlation only. A delivery or preparation failure propagates to the existing retry path. A failed row remains failed even if diagnostics are disabled. Keep the existing worker, schedule, depth sampling, retry options, and event envelope type.

**Tests first.** `infra/events/__tests__/domain-outbox.test.ts` — `reads trace ancestry before stripping private transport fields from each delivery` (`strip-before-reading-parent`). Assert repeated attempts use the stored parent, subscribers never see the private field, and the underlying publish rejection still propagates.

**Package/API.** Existing `./events/domain-outbox`. `.changeset/crp-03-outbox-delivery.md`, infra baseline.

### CRP-04.J — Presentation and stored-media response builders

**BUILDER: SOL · 2 source files**

- `A/http/presentation.ts:4–23` → `J/cms/admin-http/http/presentation.ts`. Move `toAdminPresentationResponse(required, _optional = {}): AdminPresentation`. Keep the four existing array fields and narrow `settings` to `Pick<PresentationSettingsRecord, "workspaceId" | "activeThemeId" | "updatedAt">` from CMS presentation. Keep the exact field projection. Themes and theme discovery stay in the host.
- `A/routes/media/stored-media-response.ts:8–26` → `J/cms/admin-http/routes/media/stored-media-response.ts`. `toStoredMediaResponse(required: { media: MediaRecord; contentType: string; byteLength: number; resolvePublicUrls: MediaListLookup<string>; resolveByteSizes: MediaListLookup<number> }, _optional = {}): Promise<AdminMediaEnvelope>`. Use the existing CMS record, list lookup convention and `toAdminMediaResponse`. If the current URL resolver’s map admits `null`, use `MediaListLookup<string | null>` at this seam. Call the public URL lookup first, using the media ID. Consult stored size by source SHA only for SVG. Keep `?? null`, including a real zero size. Don’t move blob access, sanitization, or URL generation.

**Tests first.** `cms/admin-http/http/__tests__/presentation.test.ts` — `projects only public presentation settings and the supplied theme lists` (`spread-presentation-settings`). `cms/admin-http/routes/media/__tests__/stored-media-response.test.ts` — `reports stored SVG bytes and does not read sizes for other content` (`report-upload-length-for-svg`).

**Package/API.** Add `./admin-http/http/presentation` and `./admin-http/routes/media/stored-media-response`. `.changeset/crp-04-admin-dtos.md`, CMS baseline.

### CRP-05.J — Plugin install response and stored-credential probe

**BUILDER: SOL · OPUS-REVIEW · 2 source files**

- `A/routes/agent-plugins/install-response.ts:14–71,82–142` → `J/cms/admin-http/routes/agent-plugins/install-response.ts`. Move `InstallRefusal`, `bodyParseRefusal`, `knownInstallRefusal`, `InstalledAgentPluginRow`, and `installedAgentPluginRow`. Give `knownInstallRefusal` a required `classifyHostError` port beside `error`. The port returns `{ kind: "upload" | "install"; code: string; message: string } | undefined`. Tovu binds `instanceof` for its upload/install error classes. Jini predicates for lifecycle update, incompatible host, and busy/unreadable stay as they are. Move the same status/copy tables with `Readonly<Partial<Record<string, …>>>` and checked fallbacks. Guard nullish parser errors when reading `.type`. Keep the operator-only warning separate from `body` and leave the unexpected-error reporter in Tovu. Use the existing CMS lifecycle-field projection. Don’t spread the candidate or expose its host path.
- `A/routes/assistant/stored-credential-probe.ts:75–119,140–165,186–215` → `J/cms/admin-http/routes/assistant/stored-credential-probe.ts`. `resolveProbeCredential({ input, openAdmin, openSite, subjects }: { input: ResolveProbeCredentialInput; openAdmin: (required: { principalId: string }) => Promise<StoredProbeCredential | null>; openSite: (required: Record<string, never>) => Promise<StoredProbeCredential | null>; subjects: { admin: string; site: string } }, _optional = {}): Promise<ProbeCredentialResolution>`, with `StoredProbeCredential = { apiKey: string; baseUrl: string | null }`. Preserve typed key first, no-store selection without a read, admin before site when both flags are set, and one selected read. Keep exact endpoint comparison after trim and terminal slash stripping, sending the original saved endpoint on success. No URL re-resolution, fallback across credential owners, or change to egress policy. Failures carry no key.

**Tests first.** `cms/admin-http/routes/agent-plugins/__tests__/install-response.test.ts` — `keeps parser, archive and lifecycle refusal bodies stable without exposing warnings` (`put-install-warning-in-body`). `cms/admin-http/routes/assistant/__tests__/stored-credential-probe.test.ts` — `never forwards a stored key to a different or unset endpoint` (`skip-saved-endpoint-match`). Also assert typed-key bypass and admin selection without a site read.

**Package/API.** Add `./admin-http/routes/agent-plugins/install-response` and `./admin-http/routes/assistant/stored-credential-probe`. `.changeset/crp-05-admin-projections.md`, CMS baseline.

### CRP-06.J — Publish, mail, and saved-share refusal primitives

**BUILDER: SOL · OPUS-REVIEW · 4 source files**

- `A/routes/publish-content/route-helpers.ts:18–22,37–50` → `J/cms/admin-http/routes/publish-content/route-helpers.ts`. Move `RouteRefusal` and `MappedErrorClass`. Export `knownMappedErrorResponse({ err, table }: { err: unknown; table: readonly MappedErrorClass[] }, _optional = {}): RouteRefusal | undefined`. Preserve first matching class, status, code, and safe typed message. Leave the 500 fallback, Express authorization and already-present overwrite parser alone. Do not replace the old writer with a second copy of `transport-shared.ts`’s throwing helper.
- `A/routes/publish-content/import-errors.ts:16–20,41–54` → `J/cms/admin-http/routes/publish-content/import-errors.ts`. `knownImportErrorResponse({ err, host }: { err: unknown; host: { readForbiddenReason: (required: { error: unknown }) => { message: string; reasonCode: string } | undefined; isStalePlan: (required: { error: unknown }) => error is Error; pluginHookBody: (required: { error: unknown }) => ImportErrorResponse["body"] | undefined } }, _optional = {}): ImportErrorResponse | undefined`. Bind the host gateway classes and plugin mapping through those ports. Use existing core token errors and local CMS restore/bundle errors. Keep the exact 403/409/404/500 distinction. The plugin port answers only the fixed redacted plugin shape. Unknown failures return `undefined`, not exception text.
- `A/routes/system/mail-providers.ts:42–56` → extend `J/cms/admin-http/routes/system/mail-providers.ts:28–59`. `classifyMailProviderError({ error, operationFailure, storeErrors }: { error: unknown; operationFailure: (required: { error: unknown }) => Extract<MailProviderFailure, { kind: "operation" }> | undefined; storeErrors: readonly (readonly [abstract new (...args: never[]) => Error, Extract<MailProviderFailure, { kind: "store" }>])[] }, _optional = {}): MailProviderFailure | undefined`. Operation first, then the first matching store class. No change to the credential-save spec, owner check, or existing wire refusal.
- `A/routes/system/site-share-password.ts:28–34,69–80,94–99` → `J/cms/admin-http/routes/system/site-share-password.ts`. `savedKeysSameOrigin({ origin, host, fetchSite, protocol }: { origin: string | undefined; host: string | undefined; fetchSite: string | undefined; protocol: string }, _optional = {}): boolean` calls the existing core same-origin check **and** requires the exact serving origin, preserving short-circuiting. `savedShareRefusalStatus({ code }: { code: string }, _optional = {}): 400 | 403 | 404` moves the `NOT_FOUND`/`FORBIDDEN` mapping. `savedShareUploadRefusal({ error }: { error: unknown }, _optional = {}): { status: 400 | 413; code: "INVALID_INPUT" | "LIMIT_EXCEEDED" } | undefined` moves the five parser tags and the existing size distinction. Keep owner/session admission, copy, exception classification by `SiteShareRefusal`, failure reporting, and password reveal itself bound in Tovu. Don’t route around the shared owner-session guard.

**Tests first.** Under the respective CMS route test directories add `route-helpers.test.ts` — `first typed refusal wins without rendering unknown exceptions` (`reverse-refusal-precedence`), `import-errors.test.ts` — `expired and redeemed tokens remain distinct and plugin text stays redacted` (`echo-plugin-exception`), extend `mail-providers.test.ts` — `operation failures win before the store table` (`store-classification-first`), and add `site-share-password.test.ts` — `requires exact serving origin in addition to browser same-origin facts` (`drop-exact-origin-check`). Include the 413/400/unknown parser table.

**Package/API.** Add `./admin-http/routes/publish-content/{route-helpers,import-errors}` and `./admin-http/routes/system/site-share-password`. Extend existing `./admin-http/routes/system/mail-providers`. `.changeset/crp-06-refusal-seams.md`, CMS baseline.

### CRP-07.J — Public member projection, cookie lifetime, and sign-in refusals

**BUILDER: SOL · OPUS-REVIEW · 3 source files**

- `P/http/members.ts:21–42` → `J/user-management/members/public-member-response.ts`. `toPublicMemberResponse({ member }: { member: Pick<MemberRecord, "id" | "email" | "name" | "status"> }, _optional = {}): PublicMemberResponse`. Construct an allowlisted object, conditionally adding `name` only when defined. Preserve the existing JSON shape, including an empty string. No workspace ID, version, verification fields, notes, or credential/session fields. Leave the member cookie name out of Jini.
- `P/routes/members/complete-sign-in.ts:36–43,60–70` and `sign-in.ts:37–48` → `J/user-management/members/public-member-auth-response.ts`. Export `memberCookieExpiry({ expiresAtIso, nowMs }: { expiresAtIso: string; nowMs: () => number }, _optional = {}): { expires: Date; maxAge: number }`. Preserve the two clock reads and nonnegative millisecond clamp followed by whole-second `Max-Age`. Don’t move cookie name, attributes, serializer, or host response writer. Move `memberAuthRefusal({ error }, { reset = false } = {})` verbatim using local member error classes. Move `memberSignInRefusal({ error, isSenderNotConfigured, senderNotConfiguredMessage }, _optional = {})` with the same auth → unavailable → validation precedence. `isSenderNotConfigured` accepts `{ error: unknown }` and returns `boolean`. Use a checked `instanceof MemberSignInUnavailableError` to obtain its message. Preserve the original short-circuit if this class matches and do not expose per-address delivery outcomes. Both mappers return `{ status: number; body: { error: string; code?: string } } | undefined`.

**Tests first.** `user-management/members/__tests__/public-member-response.test.ts` — `serializes an allowlisted member and omits absent name on the wire` (`spread-internal-member`). `public-member-auth-response.test.ts` alongside it — `only reset requests expose the typed validation refusal, never unknown exceptions` (`map-all-validation-as-reset`); `expired cookies clamp Max-Age and retain the injected clock behavior` (`negative-member-cookie-max-age`).

**Package/API.** Add `./members/public-member-response` and `./members/public-member-auth-response`. `.changeset/crp-07-public-member-seams.md`, user-management baseline.

### CRP-08.J — Consent-gated page caching and visitor analytics

**BUILDER: SOL · OPUS-REVIEW · 2 source files**

- `P/routes/site/pages/pre-consent-cache.ts:15–67` → `J/cookie-consent/site/pre-consent-cache.ts`. Keep `CACHE_CONTROL_PRE_CONSENT_TRACKING` and `hasConsentGatedScripts({ html, configId }, _optional = {})`. Escape the injected config ID as a literal in the regex. Access capture `match[1]` with a checked fallback. Missing config is ungated, malformed config is gated. Export `preConsentCacheControl({ html, cacheControl, configId, hasConsentChoice }: { html: string; cacheControl: string; configId: string; hasConsentChoice: (required: Record<string, never>) => boolean }, _optional = {}): string`. Keep the order of existing private/no-store check, lazy cookie validation, then script detection. Express cookie reading and `parseStored` binding stay in Tovu.
- `P/visitor-analytics.ts:7–43` → `J/analytics/site/visitor-analytics.ts`. Use `VisitorAnalyticsDeps<RequestLike>` already at `J/analytics/site/contracts.ts:7`. Move `VisitorAnalyticsProvenance` and `visitorAnalyticsProvenance<RequestLike>({ deps, request }, _optional = {})` and `captureVisitorEvent<RequestLike>({ deps, request, name, properties }, { subjectId } = {})`, keeping the existing constrained properties type. No Express import. Preserve `visitorTracker ?? tracker`, require consent proof before minting the anonymous subject, then recheck delivery permission before capture, including denying when that predicate is absent. If properties are absent pass `{}`, not an explicit `undefined` property to the tracker. Preserve a supplied subject and swallow telemetry faults, not the parent operation’s faults.

**Tests first.** `cookie-consent/site/__tests__/pre-consent-cache.test.ts` — `malformed configured scripts force no-store without relaxing private directives` (`malformed-config-is-cacheable`). `analytics/site/__tests__/visitor-analytics.test.ts` — `does not capture when permission is revoked after proof minting` (`skip-delivery-consent-recheck`). Include absent proof, absent permission, and capture failure.

**Package/API.** Add `cookie-consent ./site/pre-consent-cache` and `analytics ./site/visitor-analytics`. `.changeset/crp-08-consent-and-analytics.md`, both baselines.

### CRP-09.J — Visitor confirmation raw spec

**BUILDER: SOL · OPUS-REVIEW · 1 source file**

`P/routes/site-assistant-confirm.ts:12–44,57–60` → `J/daemon/surface-exchanges/site-assistant-confirm.ts`. Export `SITE_ASSISTANT_CONFIRM_PATH` unchanged and `siteAssistantConfirmRoute` as a structural raw spec, `method: "post" as const`, `bufferedReply: true as const`, and static `Cache-Control: no-store`. Follow the structural raw pattern in `J/cms/public-http/routes/members/shared.ts:16–24`, without depending on CMS or http-kit. Use `handle({ raw, deps }: { raw: Pick<RouteInputContext, "body">; deps: SiteAssistantConfirmDeps }, _optional: { signal?: AbortSignal } = {}): Promise<Response>` and `Response.json` for the same legacy JSON shapes and statuses.

`SiteAssistantConfirmDeps` names only `rateAllowed({})`, `enabled({})`, `isJson({})`, `sameOrigin({})`, optional `resolveOwner({})`, `confirm({ challengeId, allow, owner? })`, `reportError({ error })`, and `refusalText`. `resolveOwner` returns the existing core `FrontendSessionOwner | null`, and `confirm` returns `Promise<boolean>`. Keep limiter → feature check → body parse → origin → media-type decision in the existing order, including evaluating origin on a malformed body before issuing the combined refusal. A challenge has exactly two fields, a literal boolean and a 22-character URL-safe nonce. Preserve 429, 404, 400, and 200, reuse the same refusal for a false result or caught error, and omit absent owner from the confirm argument. The host supplies the visitor store and origin facts. This must not accept an admin exchange or infer identity from body fields.

**Tests first.** `daemon/surface-exchanges/__tests__/site-assistant-confirm.test.ts` — `keeps malformed, foreign-origin and non-accepted decisions non-oracular and non-cacheable` (`confirm-before-origin`). Also assert rate-limited/disabled requests don’t touch the visitor store, the exact owner argument, and caught-error reporting.

**Package/API.** Add `./surface-exchanges/site-assistant-confirm`. `.changeset/crp-09-visitor-confirm.md`, daemon baseline.

### CRP-10.J — Comment admission and active provider routing

**BUILDER: SOL · OPUS-REVIEW · 1 source file**

`P/routes/site/comments-submit.ts:36–72,86–90` → `J/cms/public-http/routes/site/comments-submit.ts`. Move three neutral decisions. Keep the existing submission engine and transport registration.

- `commentFormReturnTo({ value }: { value: unknown }, _optional = {}): string` retains the local path, origin, backslash, control character, query and fragment behavior verbatim.
- `isSameOriginCommentPost({ origin, isJson, servingOrigin, configuredOrigin }: { origin: string | undefined; isJson: (required: Record<string, never>) => boolean; servingOrigin: (required: Record<string, never>) => string; configuredOrigin: (required: Record<string, never>) => string }, _optional = {}): boolean` preserves evaluation order and lazy origin reads. Missing origin is accepted only for JSON. A configured-origin failure on the consulted branch still propagates. No referer fallback.
- `commentProviderIngress({ providers, siteId }: { providers: CommentsProviderRegistry; siteId: string }, _optional = {}): { submit: (submission: CommentSubmission) => Promise<CommentSubmitResult> }`. Use neutral CMS submission/result types structurally, with no import from the Express entry. Preserve per-call `active({ siteId })`, `kind === "stored"` gating, the same projection, and `comments-disabled`. Do not add a raw-address field or a second hash, rate limiter, or ingress policy.

**Tests first.** `cms/public-http/routes/site/__tests__/comments-submit.test.ts` — `accepts only the admitted origin and a local form return while resolving the active stored provider per call` (`allow-originless-form`). Also pin a network-path return target and an embedded-provider refusal.

**Package/API.** Add `./public-http/routes/site/comments-submit`. `.changeset/crp-10-comment-admission.md`, CMS baseline.

### CRP-11.J — Renderers on injected body, component, and listing ports

**BUILDER: SOL · OPUS-REVIEW · 6 source files**

Move these files under `J/cms/public-http/http/site/` at the same relative paths. Reuse CMS’s installed `render-context.ts` and `render/doc/doc-render-contract.ts`, not copies of Tovu’s former contracts. In a private `render/body-render-ports.ts`, share a `BodyRenderPorts` type with `renderHtmlPageBody({ html, resolved }: { html: string; resolved: ResolveHtmlPageEmbedsResult | undefined }): string` and `renderDocNode({ node }: { node: JsonValue }, options?: DocRenderOptions): string`. The host supplies its existing body renderers. Pure same-package helpers use relative imports. No theme package, Handlebars, Liquid, Express, or host import in the moved code.

| Tovu source | Jini signature and seam |
|---|---|
| `P/http/site/bare-page.ts:25–99` | `renderBareEntryDocument(required: RenderBareEntryDocumentRequired & { renderers: BodyRenderPorts }, _optional = {}): string`. Keep the three empty maps and raw authored-document test before any wrapping. Omit absent optional `renderBareDocument` fields conditionally. Host assets attach only to documents this renderer constructs. |
| `P/http/site/render/post-body.ts:13–105` | Keep `shortDate({ iso, timeZone }, _optional = {})`. Change `renderAssignedTermsBlock({ terms }: { terms: readonly AssignedTermView[] }, _optional = {})`. `renderPostBody({ ctx, post, renderers }, _optional = {})` and `entryContent({ ctx, renderers, bylinePrefix }, _optional = {})` preserve the authored-HTML versus doc split, cover projection, terms-after-body order, go-live date and optional byline. Inject `"By "` from the host and retain the existing escaping boundary. |
| `P/http/site/render/template-render-data.ts:10–114` | `buildTemplateRenderData({ ctx, renderPostBody, formatMoney }, _optional = {}): Record<string, unknown>` with `renderPostBody({ ctx, post }): string` and `formatMoney({ money }: { money: { minorUnits: number; currency: string } }): string`. Pass that formatter into `formatProductMoney({ amount, currency, formatMoney }, _optional = {})`, retaining uppercase and the currency-less USD fallback. Keep `featuredImageView({ ctx, post }, _optional = {})`, cover lookup, unavailable-transform null result and structured-cloneable shape. |
| `P/http/site/render/components/entry-lists.ts:10–74` | `entryList({ ctx, props, renderCoverImageTag, emptyPostsText }, _optional = {})`; `productEntryList({ ctx, formatMoney, emptyProductsText }, _optional = {})`; `productEntryContent({ ctx, formatMoney }, _optional = {})`. Use `SiteRenderContext`, `JsonObject`, and the structural featured-image shape from `featuredImageView`. `renderCoverImageTag` takes `{ image }` and optional `{ loading?: "lazy" }`. Keep batch slicing, title escaping, `postDisplayDateIso`, continuation link, product fallback key and markup. Inject empty-state strings. |
| `P/http/site/render/components/marketing.ts:9–85` | `hero`, `section` take `{ props, mediaPlaceholderClasses }`, using `DocRenderClasses["mediaPlaceholder"]`. `announcement`, `ctaBand`, `featureGrid` take `{ props }`. All use `_optional = {}`. Keep href admission and escaping. Move the component algorithms, not Tovu’s class configuration or component registry. |
| `P/http/site/render/blocks.ts:11–98` | `renderBlockSeam({ ctx, props, ports }, _optional = {})` and `renderBlock({ node, ctx, ports }, _optional = {})`; `node: JsonValue`. `ports` contains `componentFor({ id })`, `renderWidgetRegion({ ctx, regionKey })`, the body/doc functions, and `entryList({ ctx, props })`. `componentFor` returns a callable accepting `{ ctx, props }` or `undefined`. Thread the same ports through the dispatch table and recursive doc children. Preserve escaped unknown comments, special region dispatch before content-doc fallback, and the three pre-resolved maps. |

Don’t use unchecked dictionary or array lookups. Preserve the current shape where a template intentionally observes `undefined`, as with `compareAtPriceFormatted`. Fix only signature/import necessities and strictness at the move seam. Don’t reinterpret raw authored HTML as less-trusted widget HTML.

**Tests first.** Add `cms/public-http/http/site/__tests__/bare-page.test.ts` — `does not wrap or augment a complete authored document` (`wrap-full-authored-html`). Under `render/__tests__/`, add `post-body.test.ts` — `appends escaped assigned terms after the selected body` (`escape-authored-body`), `template-render-data.test.ts` — `uses one injected body renderer and keeps the legacy date and product fields` (`use-updated-at-over-publish-at`), `entry-lists.test.ts` — `keeps the next link on the second non-final batch` (`drop-listing-offset`), `marketing.test.ts` — `refuses disallowed action hrefs while using supplied media classes` (`skip-action-href-admission`), and `blocks.test.ts` — `dispatches declared regions without calling the doc renderer` (`render-region-as-doc-node`).

**Package/API.** Add the six same-relative subpaths below `./public-http/http/site/`. `body-render-ports.ts` is internal. `.changeset/crp-11-render-seams.md`, CMS baseline.

### CRP-12.J — Page head composition

**BUILDER: SOL · 1 source file**

`P/routes/site/pages/extra-head.ts:10–70` → `J/cms/public-http/routes/site/pages/extra-head.ts`. Preserve the entry snapshot, distinct home/page treatment, canonical precedence and contributor fold. New contract:

- `buildExtraHead(required, { canonicalFallbackPath = "/" }: { canonicalFallbackPath?: string } = {}): Promise<string>`.
- `required` has `workspaceId`, `route: "home" | "post" | "page"`, `siteTitle`, `post: PublicPostRecord | undefined`, and `renderBaseUrl: string | undefined`. It also has `postCanonical({ post }) => Promise<string | undefined>`, `postFallbackPath({ post }) => string`, `resolveOrigin({ workspaceId }) => Promise<VerifiedOrigin | undefined>`, `seoContributor: PageHeadHook`, and `pageHeadContributors: readonly PageHeadHook[]`.
- Use existing CMS `toAbsoluteUrl`, `foldPageHead` and `serializeHeadElements`. The render base skips the verified-origin read. An explicit post canonical wins over derived post path, which wins over the entry-less fallback. Build the entry value with the existing `id`, `type`, `slug`, `title`, `status`, `updatedAt` and `ext` fields. Keep SEO contributor first. The fold’s per-contributor failure handling does not mean origin or routing errors are swallowed.

**Tests first.** `cms/public-http/routes/site/pages/__tests__/extra-head.test.ts` — `keeps post canonical precedence and an entry-less page’s own fallback path` (`use-home-canonical-for-marketing-page`). Also pin no origin lookup for a supplied render base and continued fold after a contributor fails.

**Package/API.** Add `./public-http/routes/site/pages/extra-head`. `.changeset/crp-12-extra-head.md`, CMS baseline.

## Tovu sheets, in build order

### CRP-01.T — Bind host copy and the resume descriptor

**BUILDER: SOL · OPUS-REVIEW · after CRP-01.J**

- At `C/approval-i18n.ts:109–135`, keep only the host availability key and its localized strings. Keep a real bound `approvalText` function in this file that returns the localized notice for that key and otherwise calls Jini. `M/serving-routine-tools.ts:4,79` keeps the bound function. `M/__tests__/serving-routine-tools.unit.test.ts:3,92` likewise stays. Repoint neutral `APPROVAL_COPY` and `approvalText` imports at `W/assistant/__tests__/approval-schema-labels-i18n.test.ts:4`, `tool-approval-policy.test.ts:113,122,129`, and `C/human-confirm.ts:26` to core. No re-export shell.
- Delete `C/custom-credential-categories.ts`. Repoint `W/features/custom-credentials/{credential-save-tool:4,index:6,tool-registrations:54,tovu-credential-sets:9,types:14}.ts`, `W/platform/secrets/vault-meta-rules.ts:9`, and `W/platform/secrets/__tests__/vault-kinds.unit.test.ts:13` to core’s existing `core-custom-credential-categories` entry. Existing feature-barrel exports can point directly there. Fix the README reference.
- At `C/tool-metadata/agent-pause.ts:6–14` bind `createResumeAgentWorkMetadata` to the current ID and the unchanged search copy. Its two importers stay bound to this host value, `C/tool-metadata/index.ts:54` and `W/server/runtime/composition/agent-pause-tools.ts:4`. Do not import the composer from the catalog to obtain the ID.

**Tests first.** Add `serving-routine-tools.unit.test.ts` case `passes the existing localized desktop availability notice and only that host copy` (`bind-routine-copy-directly-to-core`). Keep the metadata baseline and the existing declined/confirmed resume pins.

### CRP-02.T — Bind confirmation policy and retain the authenticated card

**BUILDER: SOL · OPUS-REVIEW · after CRP-02.J, CRP-01.T**

At `C/chat-delete-grant.ts:14–29`, retain `chatDeleteRefusal` and a binding `requireChatDeleteGrant` with its old two-object signature. Bind `isDeleteTool` to `PERMANENT_DELETE_TOOLS` and bind `missingGrant` to `chatDeleteRefusal`. At `C/human-confirm.ts:91–131`, keep `requireHumanConfirm` as the actual composition of the host grant and `renderHumanConfirmation`. Move the implementation of `requireAccessApprover` out. Import the choice param back for the card builder at `:268–270`, and import `HumanConfirmOutcome` from daemon wherever a type is needed. Repoint `W/assistant/ask-choice-tool.ts:13` to daemon’s `requireAccessApprover`. Host UI, native summaries, exact URI/app identity, `humanConfirmedToolHandler`, `approvalToolHandler`, host-facing cancellation semantics, and the host allowlist scan remain. Keep the literal `requireHumanConfirm` binding and the registration scan’s parameterized-open rationale.

Direct type repoints for `ChatDeleteSurfaceDeps`, with mixed imports split: `W/assistant/{ask-choice-tool:14,tool-registrations:9}.ts`, `C/human-confirm.ts:19`, `C/__tests__/unit/chat-delete-grant.unit.test.ts:3`, `W/features/{agent-plugins/automatic-agent-plugins:6,deployments/deploy-ops/tool-registrations:1,external-mcp/tool-registrations:13,identity/tool-registrations:2,permanent-delete/tool-registrations:1,routines/routine-tool-registrations:7,webhooks/tool-registrations:23}.ts`, `W/features/mail-status/__tests__/{mail-status-tool.test:1,provider-tools.unit.test:2}.ts`, `W/server/inbound/assistant/assistant-tool-consent.ts:5`, and `W/server/runtime/composition/{__tests__/site-mailer.unit.test:4,site-search-tools:6}.ts`. `HumanConfirmSurfaceDeps` comes from the same core entry at `W/features/routines/__tests__/routine-approval.integration.test.ts:7`, `W/server/runtime/composition/create-app-options.ts:11`, and `M/serving-routine-tools.ts:5`, and wherever the mixed `human-confirm` imports use only that type. Runtime callers of `approvalToolHandler`, `humanConfirmedToolHandler`, `notConfirmedResult`, `refuseUnexpectedKeys`, and the bound `requireHumanConfirm` keep their host import. Don’t re-export moved types.

**Tests first.** Extend `C/__tests__/human-confirm.lifecycle.test.ts` with `a grant revoked while a real host card is displayed prevents the writer` (`bind-no-op-delete-grant`). Keep the headless, identity, missing-emitter, and allowlist coverage.

### CRP-03.T — Use the shared traced-delivery seam

**BUILDER: SOL · OPUS-REVIEW · after CRP-03.J**

At `C/events/outbox-drainer.ts:67–73` remove `subscriberBus`. Use `trackOutboxDelivery({ bus: args.bus, tracker }, { readParent, prepareEvent: withoutOutboxTraceParent })`. Retain the Tovu worker services, no-op tracker binding, `outboxRetryPolicyForEvent`, and scheduling options. Remove the passthrough re-exports at `:34,36`; any consumers of those Jini-owned names import `@jini-ai/infra/events/outbox` directly. `startOutboxDrainer` and `OutboxQueueMetrics` remain bound here. Existing importers stay at `W/server/runtime/composition/serving-app.ts:22` and `C/events/__tests__/{jini-outbox-parity.test:11,outbox-drainer.scheduling.test:10,52,outbox-drainer.test:8,outbox-retry-policies.unit.test:7}.ts`.

**Tests first.** Extend `C/events/__tests__/outbox-drainer.test.ts` with `the subscriber envelope excludes the trace parent while its delivery span preserves it` (`omit-host-envelope-strip-port`). Keep the single serving-process owner pin.

### CRP-04.T — Repoint presentation and stored-media builders

**BUILDER: SOL · after CRP-04.J**

Delete `A/http/presentation.ts` and `A/routes/media/stored-media-response.ts`. Repoint `M/presentation.ts:13,48,107` and `W/server/http/__tests__/headless-contracts.test.ts:13` to `@jini-ai/cms/admin-http/http/presentation`. Repoint `M/media.ts:54`, and at `:199,248` inject `resolvePublicUrls: ({ media }) => resolveMediaPublicUrls({ deps, assets: media })` and `resolveByteSizes: ({ media }) => resolveMediaByteSizes({ deps, media })` in the existing stored-result ports. Keep the upload and replace routes’ existing spec and response envelopes.

**Tests first.** Add `upload and replace use the stored byte size for a sanitized SVG` beside the existing admin media byte-size wire tests (`wire-upload-length-to-replace-dto`). Keep the same fixture for both verbs.

### CRP-05.T — Bind install error classes and secret readers

**BUILDER: SOL · OPUS-REVIEW · after CRP-05.J**

- At `A/routes/agent-plugins/install-response.ts:78–102`, keep the unexpected-error path and bind `classifyHostError` using the two existing host constructors. Remove the moved parser, row builders and tables. `M/agent-plugin-install-route.ts:9` splits its import. Parser and row come directly from CMS, while its known-refusal callback gets the bound classifier. `A/routes/agent-plugins/__tests__/unit/install-response.unit.test.ts:8` splits moved symbols from host-only writers/classifier. `A/http/__tests__/unexpected-route-errors.test.ts:17` keeps its host writer import.
- `A/routes/assistant/stored-credential-probe.ts:140–165` becomes a real host binding with the existing function name but object arguments `resolveProbeCredential({ deps, input }, _optional = {})`. Pass `openAdmin` and `openSite` closures over the original repo, workspace and **same** sealer. Retain the original `String(input.principalId ?? "")` at the admin selection seam. Keep both subject strings here. Update `M/assistant-execution.ts:14,121` and the ten calls in `A/routes/assistant/__tests__/stored-credential-probe.admin.test.ts:78–233` to object args. Keep the import on the bound module. The spec wiring at `M/assistant-execution.ts:199,231` still uses `probeCredentialFor`.

**Tests first.** Add `a typed key never opens either host store, even if both saved switches are set` to `stored-credential-probe.admin.test.ts` (`eagerly-open-saved-credential`). Keep the unexpected install error wire and redaction cases.

### CRP-06.T — Keep host writers and bind the refusal primitives

**BUILDER: SOL · OPUS-REVIEW · after CRP-06.J**

- At `A/routes/publish-content/route-helpers.ts:45–54`, call the CMS `knownMappedErrorResponse` before the existing `adminFailureResponse`. `mappedErrorResponse`, writers, and authorization remain real host functions. `A/routes/publish-content/peer-transport.ts:26–28` repoints only `MappedErrorClass` and `RouteRefusal` to CMS. `A/http/__tests__/unexpected-route-errors.test.ts:16` and `A/routes/publish-content/__tests__/route-helpers.unit.test.ts:7–10` keep the actual host helpers.
- At `A/routes/publish-content/import-errors.ts:43–54`, keep the bound function with the same name, supplying the host gateway predicates and `pluginHookFailedBody` port. Move `ImportErrorResponse` to the Jini import, without re-exporting. Host imports remain at `M/publish-content-import.ts:28`, `W/features/publish-content/__tests__/publish-tool.test.ts:5`, `A/http/__tests__/{ranked-user-facing-errors.test:13,unexpected-route-errors.test:15}.ts`, and `A/routes/publish-content/__tests__/import-errors.test.ts:21` for the bound functions. Keep `IMPORT_FAILURE` and its 507/500 behavior.
- At `A/routes/system/mail-providers.ts:42–56`, keep the host error class table and bind it to the CMS classifier. Preserve `M/system-mail.ts:31–32,105`, which uses this binding alongside the credential-save mount. Never change the request-bound credential-kind read at `mail-providers.ts:77`.
- At `A/routes/system/site-share-password.ts:28–34,75–79,95–99`, call the Jini origin and status primitives. Pass the request’s exact origin, host, fetch-site and protocol. Preserve no-store before checks, workspace rejection before session lookup, then owner check before origin and reveal. Keep the distinct password-safe copy, export-stage diagnostics, and parser responses. Consumers of this actual host binding stay at `A/routes/system/site-shares.ts:1`, `M/system-site-shares.ts:14`, `W/features/site-backup/__tests__/saved-keys-quality.test.ts:19`, and `A/routes/system/__tests__/site-share-failures.test.ts:10`.

**Tests first.** Extend `site-share-failures.test.ts` with `a foreign-origin owner session gets a no-store refusal before the reveal backend` (`call-reveal-before-origin-check`). Keep known import and rank/redaction tests on host writers.

### CRP-07.T — Bind member refusal and cookie seams

**BUILDER: SOL · OPUS-REVIEW · after CRP-07.J**

- `P/http/members.ts:19` stays as the cookie identity owner. Delete its DTO and mapper. Repoint `P/http/__tests__/members.test.ts:3,13,16`, `P/routes/members/oidc-verify-email.ts:9,55`, and `M/public-members.ts:26,161,185,269` to `@jini-ai/user-management/members/public-member-response`, passing `{ member }`. Keep the cookie-only imports, including the import and compatibility use in `complete-sign-in.ts:5,26`, untouched by the DTO move.
- At `P/routes/members/complete-sign-in.ts:41–43`, apply `memberCookieExpiry({ expiresAtIso, nowMs: Date.now })` under the same cookie serializer and attributes. Clearing stays unchanged. Use Jini `memberAuthRefusal` inside the host `sendMemberAuthError` at `:74`. Repoint the direct `memberAuthRefusal` import at `M/public-members.ts:28`, keeping other host symbols there.
- Keep `memberSignInRefusal` at `P/routes/members/sign-in.ts:40` only as the real host binding of the sender-not-configured predicate and copy. The mount at `M/public-members.ts:31,141,249` stays bound. `P/routes/members/__tests__/member-auth-errors.test.ts:5–6` still tests the host writers. No changes to request admission, logging policy, or cookie identity.

**Tests first.** Extend the member auth error coverage with `site-wide sender setup refusal stays 503 without leaking a provider exception` (`report-raw-sender-exception`). Keep the public member serialization and signed-in wire cases.

### CRP-08.T — Bind consent cache and repoint analytics consumers

**BUILDER: SOL · OPUS-REVIEW · after CRP-08.J**

- At `P/routes/site/pages/pre-consent-cache.ts:15–67`, leave `hasParsedConsentChoice` as the host cookie reader. Bind Jini `preConsentCacheControl` with `configId: CONFIG_ID` and `hasConsentChoice: () => hasParsedConsentChoice({ request }, options)`. Repoint direct `hasConsentGatedScripts` and constant imports in `P/routes/site/pages/__tests__/{pre-consent-cache.test:4,pre-consent-vary.route.test:11}.ts` to Jini and supply `CONFIG_ID` to the former helper. Imports of the bound `preConsentCacheControl`, including `response.ts:21`, stay.
- Delete `P/visitor-analytics.ts`. Repoint value/provenance imports to `@jini-ai/analytics/site/visitor-analytics` and types to `@jini-ai/analytics/site/contracts`; use `VisitorAnalyticsDeps<Request>` at the places that used the Express alias. Production anchors are `P/routes/members/{analytics:3,deps:2–3,oidc-callback:2,oidc-start:1}.ts`, `P/routes/site/{analytics-ingest:1,comments-submit:1,3,forms-submit:2,4,newsletter-confirm:2,newsletter-deps:1,search:7–8}.ts`, `P/routes/site/pages/handlers/post-not-found.ts:1`, and `M/{forms:35,public-members:21,site-assistant:11}.ts`. Tests are `W/server/__tests__/routes/forms-submit.test.ts:15`, `P/__tests__/visitor-analytics.unit.test.ts:6` and `W/server/runtime/composition/__tests__/provider-plugins.unit.test.ts:628`. Update the last one if it pins the old import path. Retire only the old file’s debt row at `development/scripts/error-gate-debt.json:1103` after confirming the moved catch is covered. Keep distinct consent revocation and visitor identity behavior.

**Tests first.** Extend `pre-consent-vary.route.test.ts` with `an invalid cookie on a page with gated scripts does not make it public-cacheable` (`presence-only-consent-cookie`). Keep Tovu’s visitor analytics behavior tests while repointing imports.

### CRP-09.T — Mount visitor confirmation with request-bound ports

**BUILDER: SOL · OPUS-REVIEW · after CRP-09.J**

Replace `P/routes/site-assistant-confirm.ts:35–60` with the real `mountPublicRawRoute` binding. Use `requestDeps` to bind `rateAllowed` through `resolveClientIp(req)`, `isJson` through the current `req.is("application/json")`, and `sameOrigin`/`resolveOwner` through the existing `requestHookInput({ req })`. Preserve lazy calls, `ports.enabled`, the visitor-only `confirmations.confirm`, current refusal copy, and report sink. Use typed per-request binding slots rather than an Express request inside Jini. Keep `registerSiteAssistantConfirm({ app, ports }, _options = {})` and its existing registration position. The custom mount failure writer also sets no-store and answers the existing redacted 400. Preserve the app’s existing JSON parser and its ordering.

`M/site-assistant.ts:33` keeps the actual registrar. Split constant imports in `W/assistant/site/__tests__/visitor-frontend-control.unit.test.ts:14` and `P/routes/__tests__/site-assistant-confirm.unit.test.ts:3` so the path comes directly from daemon. If a direct-handler fixture needs to capture the raw mount’s Express handler, adapt only the harness, not the response/security assertions.

**Tests first.** Extend `site-assistant-confirm.unit.test.ts` with `the request owner and trusted proxy address are bound afresh for each visitor` (`reuse-first-request-facts`). Preserve existing malformed, denied, replay and disabled cases.

### CRP-10.T — Bind comment admission without changing the ingress engine

**BUILDER: SOL · OPUS-REVIEW · after CRP-10.J, CRP-08.T**

At `P/routes/site/comments-submit.ts:37–72`, delete the return-target and provider implementations. Import them from CMS, binding the active-provider port at `:86–90`. Keep `isSameOriginCommentPost({ request }, _optional = {})` as the actual host origin/proxy binding. Use lazy callbacks over `request.is`, `resolveProtocol`, `request.get("host")`, and `resolvePublicOrigin`. Preserve the salt promise, IP hash boundary, URL-encoded parser limits, request limiter, unchanged 403 and analytics hook at `:80–119`. Don’t change a public POST or admission into a different flow during this split.

`P/routes/site/__tests__/comments-submit.test.ts:8` splits moved `commentFormReturnTo` from bound functions. `P/routes/commerce/purchase.ts:11` and `P/routes/members/deps.ts:28` keep using the host same-origin binding. `W/server/runtime/composition/http-app/visitor-submit.ts:15` and `W/server/runtime/composition/__tests__/create-app-visitor-capabilities.pin.test.ts:19,24` keep the host registrar.

**Tests first.** Extend `comments-submit.test.ts` with `proxied form admission uses the configured serving origin without widening JSON admission` (`allow-foreign-origin-json`). Keep the no-JS redirect and 32 KiB parser behavior.

### CRP-11.T — Bind render ports and repoint pure consumers

**BUILDER: SOL · OPUS-REVIEW · after CRP-11.J**

- Keep real bindings at `P/http/site/{bare-page.ts:82,render/post-body.ts:78,95,render/blocks.ts:23,92}` over current body, component, or listing renderers. Use `Parameters<typeof importedRenderer>[0]` with injected keys omitted for a wrapper input when needed. The host’s `post-body.ts` binds the existing byline copy. `P/http/site/render/components/registry.ts:4–6` supplies the cover renderer, money formatter, empty states, and `TOVU_DOC_RENDER_CLASSES.mediaPlaceholder`. Preserve the registry’s callback shape for existing host users. Delete `components/marketing.ts` after repointing `registry.ts:6` directly to Jini. At `components/entry-lists.ts:10,46,70`, retain only actual host bindings over lists and money, not copied markup. Existing registry, `blocks.ts:7`, and `render-site.ts:21` use the host-bound entry-list functions.
- At `P/http/site/render/template-render-data.ts:32`, keep only the bound template-data builder and a bound money helper if still used by the host. Move direct `featuredImageView` imports to Jini at `P/routes/site/pages/render-context/{media-metadata:8,post-previews:13}.ts`, `P/http/site/render/components/entry-lists.ts:4` if a pure usage survives, and the mixed imports in `P/http/site/__tests__/{img-by-url.test:6,render-featured-image.unit.test:12,render-products.unit.test:5,render-site-timezone.unit.test:9}.ts` where that symbol is used. The engine callers at `P/http/site/{handlebars-render:7,liquid-render:8}.ts` keep the bound data builder. Don’t repoint them to an unbound Jini function.
- Repoint the direct `renderAssignedTermsBlock` use at `P/routes/site/pages/template-render.ts:19` to Jini and pass `{ terms }`. Remove host exports of pure moved functions that no longer have host consumers. Any retained direct date usage imports `shortDate` from Jini, not a passthrough. Existing post-body runtime bindings are used at `P/http/site/render/{blocks:6,template-render-data:4,components/registry:5}.ts` and `P/http/site/render-site.ts:20`. Existing block bindings are used at `P/http/site/{handlebars-render:6,liquid-render:7,render-site:22}.ts` and `P/http/site/__tests__/{render-blocks-site-branches.unit.test:10,render.test:20}.ts`. The bare renderer stays bound at `A/routes/posts/template-preview-render.ts:14`, `P/routes/site/pages/handlers/post.ts:11`, `P/http/site/__tests__/bare-page.unit.test.ts:7`, and `P/routes/site/__tests__/widget-body-embeds.test.ts:10`. Don’t move or alter `content-html.ts`, `page-body.ts`, theme files, CSS, workers, or preview mounts in this sheet.

**Tests first.** Add `declarative and both logic-tier bindings see the same resolved body and use the host media placeholder classes` beside `P/http/site/__tests__/render.test.ts` (`disconnect-host-doc-render-port`). Keep the existing golden, bare-page, listing and authored-HTML cases unchanged in meaning.

### CRP-12.T — Bind page head routing, site title and verified origin

**BUILDER: SOL · after CRP-12.J**

At `P/routes/site/pages/extra-head.ts:38–70`, retain the same host `buildExtraHead` function signature over `RouteDeps`. Supply `postCanonical` from the existing `urlFor` call with the same `entryRef`, `entryId`, content type and workspace. Supply `postFallbackPath` from `postPublicPath` and `resolveOrigin` from the current workspace/registry/runtime-mode input. Build the `seoContributor` using the same `rootSlug` and lazy `resolveSiteTitleForRender(deps, { preserveAuthoredFallback: true })`. Pass `deps.pageHeadContributors ?? []` and the existing render base. Reuse the Jini fold, not a second host snapshot. Keep the three host-bound imports at `P/routes/site/pages/handlers/{home:27,marketing:14,post:18}.ts`.

**Tests first.** Add or extend a site-pages wire case `a marketing page keeps its own canonical through the host head contributor binding` (`drop-marketing-canonical-fallback`). Keep the verified-origin and preview coverage.

## NOT-SHEETED — 30 files

These are remaining ledger candidates, not permission to move the files wholesale. The stated missing proof or seam is the next planning step. None is a prerequisite to a sheet above.

| Source | Missing proof or seam |
|---|---|
| `A/routes/external-mcp/{oauth,probe}.ts` | Separate operation specs from shared credential, browser and polling gates. Preserve route-specific rate-limit order and OAuth refusal ownership. |
| `A/routes/plugins/install.ts` | Pin all four folder/ZIP × preview/apply paths before splitting the parser and installation policy. |
| `A/routes/posts/template-preview-render.ts` | The mounted preview is already shared. This remaining renderer needs the template/static/bare selection and authored-body override seam, including the same preflight used by embed inspection. |
| `A/routes/publish-content/peer-transport.ts` | Jini already owns pull. Push plan, confirm and execute need separate scopes and proof of overwrite admission, grant and credential order, and the forwarded response. |
| `A/routes/settings/events.ts` | SSE head admission, resume cursor, reauthorization, and per-connection timers need a stream-lifecycle seam. Don’t move the host namespace or preview policy along with it. |
| `A/routes/system/publish-credentials.ts` | Explicit K1 STOP at `:19–26`. Direct invocation without a principal rejects, while the shared mount answers a redacted 500. A parity decision is required before replacing that registrar. |
| `A/routes/system/publish-site.ts` | Jini already has preview/status/targets. Trigger and destination reads need separate per-route ports and parity for authorization, credential selection and visibility. |
| `P/http/site/render/{content-html,page-body}.ts` | Split the remaining widget dispatch and authored HTML marker behavior from the host render tables. Jini already owns several doc, media and widget primitives. Don’t copy them or move the theme bridge. |
| `P/routes/members/{oidc-callback,oidc-verify-email,unlink-identity}.ts` | Existing raw specs stay. Finish only the remaining domain decisions after proving challenge/session rotation, transaction ordering, and callback/proof/cookie parity with the host binders. |
| `P/routes/plugin-contributions.ts` | Separate live activation/generation checks and neutral response adaptation from dynamic Express registration and host auth middleware. |
| `P/routes/site/media-rendition.ts` | Delimit residual content negotiation, original-video and share/media behavior against the existing Jini media primitives. Preserve range, cache, and admission order. |
| `P/routes/site/{member-pages,products}.ts` | Separate reusable page/result selection from member copy, storefront markup, theme choices, and checkout readiness binding. |
| `P/routes/site/pages/{response,static-tier,template-render}.ts` | Reconcile response hooks and cache/header order, then separate static marker finishing and template selection from host engine/asset wiring. Don’t bypass the new consent seam. |
| `P/routes/site/pages/handlers/{home,marketing,post-not-found,post,slug-routes,virtual-page}.ts` | Cut after the response and template seams. Need a branch-by-branch matrix for nested-path precedence, fallthrough, cache, status and virtual-entry behavior. |
| `P/routes/site/pages/render-context/{media-metadata,post-previews}.ts` | Isolate transform/cover lookup and marker batching. Keep access decisions ahead of visible previews and preserve pagination keys and result shapes. |
| `P/middleware/site-cookie-consent.ts` | Isolate collector admission and receipt eligibility from asset/disk placement and host middleware. Prove revocation at both collection and delivery. |
| `P/routes/commerce/purchase.ts` | Needs distinct neutral order/create/pay/read/page specs. First verify buyer lookup, same-origin order, idempotency and provider return/cancel behavior against the commerce owner. |
