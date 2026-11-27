# Tovu ext-crp continuation commit plan

Uncommitted coordinator handoff. Do not commit this file.

Starting HEAD: f716e20031255737f9adce36884834f71090d939 (`codex/tv-w3-ext-crp2`). Its parent is the pre-extraction source state. The inherited commit contains the interrupted run's partial work; this continuation never writes .git. Jini prerequisite branch inspected read-only: `codex/w3-ext-crpj` at fa8e4956132924fa72dfdfd1bd8c20a39f7a2d89.

The supplied prior Tovu plan path is absent. Reconstructed sheet/file ownership from `git show HEAD`, the saved transcript, current source, and the Jini report/COMMIT-PLAN. The owner-approved sheets supply the architecture, pattern and precise file map; no additional design or helpers were introduced.

Tests first: inherited transcript records tests before the corresponding moves; the CRP-12.T test is already at starting HEAD, before this continuation changes extra-head.ts. No tests, named mutations, builds, installs, typechecks or linters were run. Opus/cloud must execute the witnesses and affected gates. No RED/GREEN or passing-runtime claim.

## Ordered design commits completed in source

### CRP-01.T — Bind host copy and the resume descriptor

Inherited source implementation and test reviewed. Host retains all 22 availability rows (English plus 21 translations); neutral imports and credential vocabulary point directly to core. Resume ID/search remain host-bound.

**Test:** `passes the existing localized desktop availability notice and only that host copy`.

**Named mutation:** `bind-routine-copy-directly-to-core`. Bind serving routine copy directly to core; the Italian desktop availability assertion must fail. Existing neutral label and unknown-key assertions also remain.

**Files touched by this logical sheet (including inherited edits):**

- `apps/website/src/assistant/__tests__/approval-schema-labels-i18n.test.ts`
- `apps/website/src/assistant/__tests__/tool-approval-policy.test.ts`
- `apps/website/src/contracts/core/approval-i18n.ts`
- `apps/website/src/contracts/core/custom-credential-categories.ts`
- `apps/website/src/contracts/core/human-confirm.ts`
- `apps/website/src/contracts/core/tool-metadata/agent-pause.ts`
- `apps/website/src/features/custom-credentials/README.md`
- `apps/website/src/features/custom-credentials/credential-save-tool.ts`
- `apps/website/src/features/custom-credentials/index.ts`
- `apps/website/src/features/custom-credentials/tool-registrations.ts`
- `apps/website/src/features/custom-credentials/tovu-credential-sets.ts`
- `apps/website/src/features/custom-credentials/types.ts`
- `apps/website/src/platform/secrets/__tests__/vault-kinds.unit.test.ts`
- `apps/website/src/platform/secrets/vault-meta-rules.ts`
- `apps/website/src/server/runtime/composition/modules/__tests__/serving-routine-tools.unit.test.ts`

### CRP-02.T — Bind confirmation policy and retain the authenticated card

Inherited source implementation and test reviewed. Host supplies the permanent-delete allowlist/refusal and authenticated card renderer; lifecycle and moved types belong to daemon/core. Runtime wrappers and registration-scan rationale remain.

**Test:** `a grant revoked while a real host card is displayed prevents the writer`.

**Named mutation:** `bind-no-op-delete-grant`. Replace the host requireDeleteGrant binding with an async no-op; the real card test must fail because the revoked grant no longer rejects and the writer can run.

**Files touched by this logical sheet (including inherited edits):**

- `apps/website/src/assistant/ask-choice-tool.ts`
- `apps/website/src/assistant/byok-tool-surface.ts`
- `apps/website/src/assistant/tool-approval-policy.ts`
- `apps/website/src/assistant/tool-registrations.ts`
- `apps/website/src/contracts/core/__tests__/human-confirm.lifecycle.test.ts`
- `apps/website/src/contracts/core/__tests__/human-confirm.test.ts`
- `apps/website/src/contracts/core/__tests__/unit/chat-delete-grant.unit.test.ts`
- `apps/website/src/contracts/core/chat-delete-grant.ts`
- `apps/website/src/contracts/core/human-confirm.ts`
- `apps/website/src/features/agent-plugins/automatic-agent-plugins.ts`
- `apps/website/src/features/deployments/deploy-ops/tool-registrations.ts`
- `apps/website/src/features/external-mcp/tool-registrations.ts`
- `apps/website/src/features/identity/tool-registrations.ts`
- `apps/website/src/features/mail-status/__tests__/mail-status-tool.test.ts`
- `apps/website/src/features/mail-status/__tests__/provider-tools.unit.test.ts`
- `apps/website/src/features/permanent-delete/tool-registrations.ts`
- `apps/website/src/features/routines/__tests__/routine-approval.integration.test.ts`
- `apps/website/src/features/routines/__tests__/routine-tool-registrations.unit.test.ts`
- `apps/website/src/features/routines/routine-tool-registrations.ts`
- `apps/website/src/features/webhooks/tool-registrations.ts`
- `apps/website/src/server/inbound/assistant/assistant-tool-consent.ts`
- `apps/website/src/server/runtime/composition/__tests__/agent-pause-gate.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/agent-pause-tools.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/assistant-off-artifacts.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/site-mailer.unit.test.ts`
- `apps/website/src/server/runtime/composition/agent-pause-gate.ts`
- `apps/website/src/server/runtime/composition/create-app-options.ts`
- `apps/website/src/server/runtime/composition/modules/serving-routine-tools.ts`
- `apps/website/src/server/runtime/composition/site-search-tools.ts`

### CRP-03.T — Use the shared traced-delivery seam

Inherited source implementation and test reviewed. The original bus, parent reader and preparation port are passed to trackOutboxDelivery; worker ownership, retry and scheduling remain host-bound.

**Test:** `the subscriber envelope excludes the trace parent while its delivery span preserves it`.

**Named mutation:** `omit-host-envelope-strip-port`. Omit prepareEvent: withoutOutboxTraceParent from the host trace binding; the subscriber-envelope assertion must fail while the persisted-parent assertion remains.

**Files touched by this logical sheet (including inherited edits):**

- `apps/website/src/contracts/core/events/__tests__/outbox-drainer.test.ts`
- `apps/website/src/contracts/core/events/outbox-drainer.ts`

### CRP-08.T — Bind consent cache and repoint analytics consumers

Inherited source implementation and test reviewed. Cookie reading stays host-bound; analytics values and Request-parameterized types import from Jini. Existing visitor analytics tests retain the consent-proof/delivery-revocation assertions. Retired only the old visitor-analytics catch debt row after reviewing those tests and the Jini capture-failure witness.

**Test:** `an invalid cookie on a page with gated scripts does not make it public-cacheable`.

**Named mutation:** `presence-only-consent-cookie`. Treat presence of the consent cookie as a valid choice without parseStored; the wire Cache-Control assertion must fail.

**Files touched by this logical sheet (including inherited edits):**

- `apps/website/src/server/__tests__/routes/forms-submit.test.ts`
- `apps/website/src/server/inbound/public-http/__tests__/visitor-analytics.unit.test.ts`
- `apps/website/src/server/inbound/public-http/routes/members/analytics.ts`
- `apps/website/src/server/inbound/public-http/routes/members/deps.ts`
- `apps/website/src/server/inbound/public-http/routes/members/oidc-callback.ts`
- `apps/website/src/server/inbound/public-http/routes/members/oidc-start.ts`
- `apps/website/src/server/inbound/public-http/routes/site/analytics-ingest.ts`
- `apps/website/src/server/inbound/public-http/routes/site/comments-submit.ts`
- `apps/website/src/server/inbound/public-http/routes/site/forms-submit.ts`
- `apps/website/src/server/inbound/public-http/routes/site/newsletter-confirm.ts`
- `apps/website/src/server/inbound/public-http/routes/site/newsletter-deps.ts`
- `apps/website/src/server/inbound/public-http/routes/site/pages/__tests__/pre-consent-cache.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/pages/__tests__/pre-consent-vary.route.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/post-not-found.ts`
- `apps/website/src/server/inbound/public-http/routes/site/pages/pre-consent-cache.ts`
- `apps/website/src/server/inbound/public-http/routes/site/search.ts`
- `apps/website/src/server/inbound/public-http/visitor-analytics.ts`
- `apps/website/src/server/runtime/composition/__tests__/provider-plugins.unit.test.ts`
- `apps/website/src/server/runtime/composition/modules/forms.ts`
- `apps/website/src/server/runtime/composition/modules/public-members.ts`
- `apps/website/src/server/runtime/composition/modules/site-assistant.ts`
- `development/scripts/error-gate-debt.json`

### CRP-09.T — Mount visitor confirmation with request-bound ports

Inherited raw mount and direct-handler harness reviewed against the Jini spec/http-kit buffered response writer. Request-bound closures stay lazy; no Express request enters the daemon. Constant importers point to daemon. Existing malformed, denied, replay and disabled assertions are retained.

**Test:** `the request owner and trusted proxy address are bound afresh for each visitor`.

**Named mutation:** `reuse-first-request-facts`. Reuse the first request's rate/origin/owner closures for the next request; the two distinct owner and client-address assertions must fail.

**Files touched by this logical sheet (including inherited edits):**

- `apps/website/src/assistant/site/__tests__/visitor-frontend-control.unit.test.ts`
- `apps/website/src/server/inbound/public-http/routes/__tests__/site-assistant-confirm.unit.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site-assistant-confirm.ts`

### CRP-12.T — Bind page head routing, site title and verified origin

The interrupted run had added the named wire test before changing production. This continuation completed the real host binding to Jini buildExtraHead. The three handler imports stay bound to the host. Entry snapshot/fold serialization no longer have a second host implementation.

**Test:** `a marketing page keeps its own canonical through the host head contributor binding`.

**Named mutation:** `drop-marketing-canonical-fallback`. Drop canonicalFallbackPath when calling the shared builder; the /about canonical and og:url wire assertions must fail.

**Files touched by this logical sheet (including inherited edits):**

- `apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.route.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/pages/extra-head.ts`

## Sheets left because prerequisites are incomplete

Per dispatch, an incomplete paired Jini sheet blocks its entire Tovu sheet; partial Jini exports are not treated as permission to split/rewrite the Tovu design. No implementation or new test added for these sheets.

- **CRP-04.T — dependent on incomplete CRP-04.J.** The specified `../../presentation/sql/repo.js` does not export PresentationSettingsRecord; presentation export/test were removed from Jini. Stored-media alone exists, with a narrower `MediaListLookup<number>` than the nullable host map. Leave both Tovu builders/local consumers unchanged.
- **CRP-05.T — dependent on incomplete CRP-05.J.** The install-response export is absent: CMS does not declare its required agent-plugins lifecycle dependency, and that barrel is Node-backed despite the required universal entry. Stored-credential probe alone exists. Leave both Tovu seams unchanged.
- **CRP-06.T — dependent on incomplete CRP-06.J.** The mandated import-errors callback `(required: { error: unknown }) => error is Error` has no parameter named `error`, so it is an invalid type predicate; import-errors export/test are absent. Other refusal exports exist, but this Tovu sheet is left intact. Cross-set system-mail edits are untouched; publish-content-backstop/transport retain their host mappedErrorResponse use.
- **CRP-07.T — dependent on incomplete CRP-07.J.** The approved private MEMBER_AUTH_FAILURE move conflicts with its retained host sendMemberAuthError consumer; Jini stopped that move. Member functions exist, but this sheet waits for a corrected approved constant ownership instruction. Host cookie identity/writers remain unchanged.
- **CRP-10.T — dependent on stopped CRP-10.J.** Core comments-providers does not export the specified CommentSubmission or CommentsStoredProvider; the actual stored provider returns `{ ok: true, id, status }`, versus the ingress `{ ok: true, comment: { id, status } }`. No Jini comments-submit export exists. CRP-08.T is complete in source; the Jini prerequisite still blocks CRP-10.T.
- **CRP-11.T — dependent on incomplete CRP-11.J.** Existing CMS media/cover-image is Node-classified and imports parse5, incompatible with the required universal post-body/template-render-data modules. Four renderer exports/tests were removed; only marketing and bare-page exist. Leave the entire Tovu renderer sheet unchanged.

No CRP Tovu sheet was designated BUILDER: OPUS, NEEDS-OPUS or REJECT. All OPUS-REVIEW checks and mutation execution remain pending. Jini-only sheets, rejected cross-set sheets and all 30 NOT-SHEETED candidates are outside this dispatch.

## Continuation changes and deletions

- Changed only `apps/website/src/server/inbound/public-http/routes/site/pages/extra-head.ts` and this uncommitted `COMMIT-PLAN.md`; all other listed changes already existed in starting HEAD.
- Removed from the host extra-head module the shared entry snapshot, canonical assembly, contributor fold/serialization and their now-unused imports, exactly as CRP-12.T requires. Their logic/rationale already exists in the paired Jini module. The existing long why-comment remains verbatim.
- No extraneous new helper, type, option, test fixture or production file was introduced. No tests or assertions were deleted/weakened. No additional cleanup deletions were necessary.
- Inherited authorized production deletions: `contracts/core/custom-credential-categories.ts` (CRP-01.T) and `server/inbound/public-http/visitor-analytics.ts` (CRP-08.T). No other production deletion.

## Static architecture and handoff review

Architecture audit: WARNING / runtime evidence pending. Reviewed source against the sheet boundaries: direct Jini imports for moved pure functions/types, real host bindings for copy, allowlist/card, cookie reader, request facts and SEO routing; no new re-export shell, dependency, migration, mount position, cookie identity or policy layer. The CRP-12.T host function is below both 50/80-line caps and delegates the fold; its injected callbacks retain the original routing/origin inputs. Local documentation is preserved, with no new filler comments.

Reuse: extra-head composition; inspected host extra-head.ts plus handlers/home.ts, marketing.ts, post.ts and Jini public-http/routes/site/pages/extra-head.ts; used the named Jini builder and existing host URL/origin/title functions, as CRP-12.T directs.

| Assessment unit | Disposition | Findings / local action | Direct evidence |
| --- | --- | --- | --- |
| buildExtraHead host binding | INCONCLUSIVE | Static contract/variable-name/effect-boundary review complete; runtime/type evidence intentionally unavailable | Existing verified-origin/preview cases plus named marketing canonical wire case |
| registerSiteAssistantConfirm and fixture | INCONCLUSIVE | Request closures/header/status bridge reviewed against Jini raw mount; runtime evidence pending | Named two-request owner/address case plus retained admission/refusal cases |
| Inherited CRP-01/02/03/08 bindings | INCONCLUSIVE | Source reviewed; named mutation behavior specified, not executed | Named characterization tests above; existing identity/grant/revocation pins |

No new recurring work, fan-out, subscriptions or resource limits. SEO binding adds O(1) host wiring; existing origin/routing I/O and the O(contributors + serialized head size) fold remain in their owners. No measured metrics or empirical security/function-quality verdict is claimed. No newly identified Critical/High source finding; mechanical checks were prohibited. Skepticism/variable-name review checked fallback path vs canonical URL, original trace parent vs stripped envelope, current visitor facts and deferred consent reads.

Pre-completion: requirements and diff reread; no out-of-list production edits; only source-level evidence collected. Runtime/self-validation, coverage, mutation witnesses and package export availability in the released Tovu dependency remain unverified because execution/install is explicitly prohibited. Coordinator should resolve the six prerequisite sheets and route the six retained Tovu sheets to Opus verification.

Fresh static evidence: `git status --short` reports only extra-head.ts modified and COMMIT-PLAN.md untracked; `git diff --check` exits 0 with no output. Scoped searches found no remaining imports of the removed host credential-category or visitor-analytics modules in their named consumer areas. Jini's CMS manifest declares the extra-head export's types/import/default and universal runtime entry. These checks establish source/manifest state only.
