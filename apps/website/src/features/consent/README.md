# Site cookie consent

`@jini-ai/cookie-consent` owns effective permission state, declared-script loading, banner/CMP
bridges, GPC/DNT, receipts and safe banner CSS. Tovu binds site publication, authorization, theme
assets, privacy pages and storage. There is no page-rewriting consent engine.

Declare assets in a theme manifest using `scripts: [{src, consent?}]`. No `consent` means automatic
execution, including external scripts. Several values mean every category must be allowed. The
public API uses `window.jiniConsent.allows({consent: ['analytics', 'marketing']})`; it checks effective
permissions, including durable receipt confirmation, rather than the visitor's unconfirmed choices.
Unknown categories and malformed declarations are rejected. Eligible scripts start in array order
and once per document; withdrawal reloads when arbitrary code cannot reliably be stopped.

Public delivery constructs asset slots in managed documents. `GET /_consent/context` reads only
published settings, resolves the trusted region and sets its cookie, with `private, no-store`.
Page HTML contains no visitor state, consent cookie writes or response scanning. A construction
snapshot refreshes after owner publication; disabled pages emit no consent assets or requests and
perform no consent-specific reads. Startup/publication reads remain outside that page hot path.
The browser downloads the core and extensions assets before the optional lifecycle runs.

Existing sites move only after explicit review. Raw executable page HTML stays executable; a JSON
declaration does not neutralize an old tag. Admin readiness distinguishes declaration validation
from unmanaged-content warnings and missing asset slots in full-document themes. It does not
simulate allowances or claim complete tracker coverage. Existing pages are never converted or
rewritten. No browser security-header changes are part of this delivery.

Optional comments scripts inherit the provider's consent category. Ordinary stored comments and
provider-authored inert frames/templates remain visible and retain their existing semantics.

The authenticated base remains `/api/admin/v1/workspaces/:workspaceId/consent`:

| Method | Path | Result |
| --- | --- | --- |
| GET | `/settings` | draft, published, effective settings and editor limits |
| GET | `/readiness` | declaration validation and separately labelled unmanaged-content warnings |
| POST | `/dry-run` | the same diagnostics for unsaved settings; no writes |
| POST | `/preview` | standalone scriptless banner preview, never rewritten sample page HTML |
| PUT | `/settings` | immutable draft with expected draft revision |
| POST | `/publish` | publish exactly the reviewed draft using expected publication revision |

Reads require `settings.read`; writes require `settings.workspace.write`. Authentication, workspace
scoping, confirmation cards, origin/rate limits, privacy-page validation, storage checks and revision
conflicts remain. Snapshots use ADR-066 migration `0021_site_consent_revisions`; no schema changes
are required by declarations. The public policy id is `<owner-version>:<published-revision-id>`.
Drafts never affect public context. Settings default off until the owner enables them.

Banner previews belong in a sandboxed iframe with `sandbox=""`. They show banner appearance only.
Readiness is bounded to one 1 MB page sample and 200 diagnostics, with redacted URL labels; it is
not browser network evidence or an exhaustive tracker inventory.

Static export embeds a policy snapshot with local evidence and explicitly copies each declared
local script and consent runtime asset once. It excludes live plugin collectors. Re-export when
policy or declarations change; outside services need their own runtime server. Local evidence is
never described as a server receipt. Disabled exports use ordinary asset delivery.

Receipt storage remains Jini's immutable bounded file adapter with 180-day expiry, a 10k-record
capacity and amortized maintenance. Receipt ids are not exposed as visitor analytics properties.
Detached server delivery rechecks the current policy and active receipt before sending.
