# Site cookie consent

Jini `@jini-ai/cms/consent` owns policy, HTML gating, safe appearance compilation, visitor forms,
GPC and receipt expiry. Tovu binds site copy, publication, authorization and storage. No second
classifier, CSS parser, consent runtime, confirmation engine or compliance scanner lives here.

The authenticated base is `/api/admin/v1/workspaces/:workspaceId/consent`:

| Method | Path | Input | Result |
| --- | --- | --- | --- |
| GET | `/settings` | none | draft, published, effective configuration, editor limits and fixed rules |
| GET | `/readiness` | optional `?path=/` | one denied-visitor page sample, gated resources and blocking problems |
| POST | `/dry-run` | `{path?, config?}` | same readiness for unsaved configuration; no writes |
| POST | `/preview` | `{path?, config?}` | `{html, blockingProblems, sandbox:"", revisionId}` for a sandboxed iframe |
| PUT | `/settings` | `{config, expectedDraftId}` | immutable saved draft and validation problems |
| POST | `/publish` | `{draftId, expectedPublishedId}` | atomically publishes exactly that stored draft |

Reads require `settings.read`; writes require `settings.workspace.write`. The global admin session
middleware authenticates first. A foreign workspace is 404, malformed input is 400, stale revisions
are 409, and unavailable state is 503. Responses are `no-store`. Revision tokens must be supplied:
use `null` for the first draft/publication. Autosave should serialize requests and carry the last
returned draft ID. On 409 reload and review; never silently retry over another editor's work.

`config` uses Jini's ConsentConfig: enabled, regionMode, policyVersion, privacyPolicyUrl, title,
message, acceptLabel, rejectLabel, preferencesLabel, placement, secondaryLinkLabel/Url,
appearance tokens and customCss. An empty or unset customCss means Tovu's default banner style
(`SITE_CONSENT_DEFAULT_CSS` in `config.ts`): the public site delivers it, the preview shows it, and GET
settings pre-fills it into `effective`/`draft` and exposes it as `editor.defaults.customCss` for
"Reset to default". GET settings exposes safe defaults and editor limits. Drafts may
retain invalid appearance while editing. Publish validates the stored copy, links, published local
privacy page, trusted automatic region mode and Jini's CSS result. Invalid drafts never change the
published look. Categories, necessary behavior and GPC are fixed by Jini; the API does not pretend
those are editable. Category descriptions/localization require an upstream engine contract.

The page job should use readiness for Overview, the config fields for Banner/Look/Rules, and
`/preview` for the real renderer with theme CSS. Assign its HTML only to an iframe `srcdoc` with
`sandbox=""`; never insert it into the admin DOM, enable scripts/forms, or grant same-origin access.
Check mobile, dark theme, keyboard behavior and visual parity in Chrome separately. Readiness is
one server-rendered page at a time (1 MB / 15 seconds / 200 entries), not browser network evidence
or an exhaustive tracker inventory. Existing site-compliance and site-evidence tools own that work.

The assistant contributes `consent_get_settings`, `consent_get_readiness`, `consent_explain_blocked`,
`consent_update_settings` and `consent_publish_settings`. Both writes use the shared confirmation
card; typed/model approval, no emitter, cancellation and stale revision IDs cannot authorize a write.
Generic settings tools cannot write the legacy `core.consent` namespace.

ADR-066 step `0021_site_consent_revisions` adds site_consent_revisions and site_consent_heads.
0019/0020 are reserved by the separately dispatched forms/Workspace work. Full snapshots cannot be
published as a sequence of scalar ledger writes: concurrent requests could observe a partial policy.
Only draft/published pointers change; revision JSON is append-only. The public engine policyVersion
is `<owner version>:<published revision id>`, so receipts identify exact retained configuration and
new publications re-ask visitors. Snapshots are retained; no cleanup deletes referenced policy data.
The existing settings ledger remains the boot/default/legacy source until first publication.

Static export crawls with explicitly enabled consent return gated HTTP 200 HTML containing the
banner and reopen link, with optional scripts inert in templates. Static hosts still have no durable
receipt backend. With the cookie-consent module wired, the deployment preflight only refuses for
other blocking problems; without it (old engine, still the default until consent P4 removes it) deployment returns 409
`CONSENT_REVIEW_REQUIRED` with Fix now / Publish without banner choices. Publish without banner is an explicit
PUT of a disabled draft, POST to publish it, then a deployment retry. Explain that this also disables
live-site enforcement and may allow optional scripts. No request flag bypasses the gate. The local
renderer has a composition-only audit option; no header/query/cookie can select it.
The assistant's own-site screenshots (`web_screenshot_page` sitePath) render through that same
option, so its pictures show the page rather than the banner over it; visitors still see the banner.

Node receipt storage remains Jini's immutable file adapter, with 180-day expiry and its 10k-record
capacity/eviction behavior. A database receipt adapter and Worker/D1 lifecycle are phase 2, not a
parallel forms submission store. No Jini sources were changed. Tests are supplied for the HTTP,
tool, storage and public delivery boundaries; this dispatch prohibits running them locally.

Consent defaults ON for every site; explicit owner ON/OFF and published snapshots take precedence.
`siteConsentReady` follows title preservation and owner seeding; definition registration gates readiness.
It reuses an existing Privacy Policy Page or creates a published, editable HTML Page transactionally.
Only an empty legacy privacy URL (including saved whitespace) is filled through Jini settings; a saved URL ends this bootstrap.
Existing draft, scheduled, or trashed policies are preserved; `PRIVACY_PAGE_MISSING` still blocks publication.
Generated copy uses the site title and owner email, highlighting missing contact for the owner to edit.
Content failures are logged and retried next open; the in-memory test composition skips content creation.

### Host withdrawal control and dynamic code exception

Tovu public delivery fixes `reopen: 'link'`; older revision snapshots need no migration.
The public HTTP adapter adds `<a href="#jini-consent" data-jini-consent-open>Cookie settings</a>`
inline in the page footer's last row (the last-closing footer, never an article footer; its
innermost trailing `<div>`, e.g. the "© Site" line), or as a centred row near the end of the body
when there is no live footer. A theme's own live control is never duplicated. It runs
at the final response boundary after Jini's gate, including streamed HTML and file delivery.
The control follows the policy actually delivered, including Jini's last-good policy during a
configuration outage. Disabled consent adds no control. Source-offset insertion preserves metadata.

`allowUnsafeEval?: boolean` is an optional revision field, absent = restrictive. It deliberately
stays outside `SITE_CONSENT_DEFAULTS`, whose fields are required in old snapshots. Only booleans
are accepted. The existing `settings.workspace.write` permission controls editing and publication;
there is no additional owner gate. Jini's Rules switch uses the existing autosave/Publish flow.
Assistant confirmations explain that allowing dynamic code weakens page-wide script protection;
optional scripts still wait for consent. Read failures retain the published flag in Jini's cache.

For Alpine compatibility, first self-host CDN Alpine, then offer `@alpinejs/csp`, then offer the
exception with its warning. CDN Alpine remains blocked before consent with either flag value.
Never enable the exception solely because a theme was detected.

Static delivery (owner decision 2026-10-26; Jini fddd084f3): explicitly enabled consent exports
gated HTTP 200 HTML with the banner and a native reopen link. Because static hosts cannot save
durable receipts, optional scripts remain inert in templates with denied defaults; the exporter's
saved grants are never baked into the page. This retains consent rather than shipping trackers
ungated, and does not provide a static receipt backend. The existing default-only export exemption
and disabled-consent exports are unchanged. Jini owns the static delivery contract; Tovu continues
to select static delivery for export requests.
