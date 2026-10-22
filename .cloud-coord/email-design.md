Web Design(Direct): **Web Design + Software Architect** — personas loaded to design the page and map it onto existing mail contracts.

**Recommendation:** one scrolling **Email** page at `/admin/email`, replacing Notifications under **Administration**. Keep all five requested sections visible. Separate configuration, DNS verification, sending readiness, and delivery evidence.

**1. Wireframes**

Desktop, approximately 1100px including the existing navigation:

```text
Administration │ Email                         [Current site]
               │ Sign-in links, confirmations and notifications
Settings       │ depend on email.
Email ←        │
Trash          │ [STATUS: configuration + next action]
               │
               │ PROVIDER
               │ [Installed provider ▼]  [Active]
               │ Credential: [Saved ✓] [Replace key]
               │ Last checked: …        [Switch provider]
               │
               │ SENDER
               │ Name [Example Site________________________]
               │ From [hello@example.com___________________]
               │ Domain: example.com             [Saved ✓]
               │
               │ DNS                         [Check again]
               │ Record  Host             Expected  Status
               │ TXT     selector._domainkey… […]   ✓ Matches
               │ TXT     send.example.com     […]   ✗ Missing
               │ Each record: [Copy host] [Copy value]
               │ Provider verification: Pending
               │
               │ SEND TEST EMAIL
               │ To [owner@example.com________] [Send test]
               │ Result: Accepted by provider · 10:42
               │
               │ WHAT USES EMAIL
               │ Use              Readiness      Evidence
               │ Sign-in links    Ready          Accepted …
               │ Confirmations    Ready          No sends yet
               │ Form notices     Blocked        See reason →
               │ Newsletter       Blocked        See reason →
               │
               │ RECENT SENDS AND FAILURES
               │ [All outcomes ▼] [Use ▼] [Recipient search]
               │ Time   Use     Recipient   Outcome   [Details]
               │ …      …       o•••@…      Accepted
               │ …      …       a•••@…      Failed
               │                                 [Load more]
               │
               │ [Bounces & blocked recipients] [Development]
```

Narrow, ≤480px:

```text
┌─────────────────────────────────────┐
│ ☰  Current site                     │
│ Administration                      │
│ Email                               │
│ Sign-in links and notifications     │
│ depend on email.                    │
│ [STATUS + next action]              │
├─────────────────────────────────────┤
│ Provider                            │
│ [Installed provider              ▼] │
│ [Active] [Credential saved ✓]       │
│ [Replace key] [Switch provider]      │
├─────────────────────────────────────┤
│ Sender                              │
│ Name [____________________________] │
│ From [____________________________] │
│ Domain: example.com     [Saved ✓]   │
│ DNS                  [Check again]  │
│ ✗ TXT · Missing                     │
│ Host: selector._domainkey… [Copy]    │
│ Expected: …               [Copy]    │
│ Observed: No matching record        │
│ ✓ TXT · Matches                     │
├─────────────────────────────────────┤
│ Send test email                     │
│ To [______________________________] │
│ [Send test email                  ] │
│ Accepted by provider · 10:42        │
├─────────────────────────────────────┤
│ What uses email                     │
│ Sign-in links             Ready    │
│ Last accepted: …          [Details] │
│ Form notifications        Blocked  │
│ Durable delivery unavailable       │
├─────────────────────────────────────┤
│ Recent sends and failures           │
│ [Filters]                           │
│ Failed · 10:40 · Form notification  │
│ a•••@example.com          [Details] │
│ [Load more]                         │
└─────────────────────────────────────┘
```

These state variants apply to **both** layouts; all sections retain their positions:

```text
NOT SET UP
[! Email is not set up] [Choose a provider]
Provider: [Choose… ▼]   Credential: Not saved
Sender:   [empty]       DNS: Choose provider and sender first
Test:     Disabled — finish setup
Uses:     Blocked — provider not configured
Recent:   No sends recorded / retain any historical sends

SET UP, DNS FAILING
[! Sending domain needs attention] [Review DNS]
Provider: [Active]      Credential: Saved
Sender:   Saved        DNS: ✓ Matches / ✗ Missing / ✗ Mismatch
Test:     Available if provider permits; show DNS warning
Uses:     Show each use's actual blocker and last result
Recent:   Preserve history; show provider refusals

HEALTHY
[✓ Provider configured · Sender verified]
Provider: [Active]      Credential: Saved
DNS:      ✓ Required records match · Checked …
Test:     [Send test email]
Uses:     Ready / Disabled / Not used, with separate evidence
Recent:   Accepted / Delivered where feedback confirms it

PROVIDER ERROR
[✗ Provider rejected the last request] [Review credential]
Provider: [Active · Error]  Credential: Saved, validity uncertain
DNS:      Last result + timestamp; current check unavailable
Test:     Show safe error; permit deliberate retry
Uses:     Show affected uses; retain previous success evidence
Recent:   Failed request + code + recovery action
```

A healthy provider does **not** imply every use works. Today production form notifications and bulk newsletter sends encounter the durable-path gate: [`deps.ts`](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/deps.ts:2435) supplies `durableOutboxReady: () => false`. The page must show that blocker even after a successful interactive test.

**Visual and interaction rules**

- Reuse `.page`, `.page-header`, `.jini-settings-section`, existing credential treatments, status chips, and `useAdminThemeBoundary`.
- Use `I18nProvider`, `useAdminLocale`, and the Settings save-state mechanism. Extend Jini components where needed; do not copy their lifecycle into Email.
- Sender fields autosave after validation, with **Saving / Saved / Couldn’t save · Retry**. Provider activation and test sends require explicit actions.
- Mobile preserves section order, stacks fields, and turns table rows into labelled records. Long DNS values wrap and remain copyable.
- Status always includes text; keyboard focus stays visible. Save/check results use accessible status announcements.

**2. Section contracts**

Paths below are relative to `apps/website/src/` unless otherwise indicated. **EXISTS** describes inspected implementation, not live verification. **NEW** describes proposed work.

| Section | Shows and actions | Data/API |
|---|---|---|
| **Status and onboarding** | Current site, runtime mode, configuration summary, highest-priority recovery action. Banner opens `/admin/email#provider`; incomplete setup expands the relevant section. | **EXISTS:** `GET /api/admin/v1/workspaces/:workspaceId/system/mail-status`; `registerAdminMailStatusRoute`, `createResolvedMailer().status()`. **NEW:** explicit check timestamps, provider-check errors, test-mode indicator and purpose readiness. Extend `AdminMailStatus`, which currently omits returned provider/refusal fields. |
| **Provider** | Installed providers; active provider; saved credential chip; plugin refusal reasons; capability badges; last observed error. Configure another provider without activating it, then **Switch provider**. Previous credentials remain saved. | **EXISTS:** `loadMailAdapterRegistry`, `contributeMailProviders`, `loadMailProviderCatalog`, `checkProvider`, `createSiteMailer().selectProvider`. Credential CRUD already exists at `/system/custom/credentials`, backed by `createCustomCredential` / `updateCustomCredential`. **NEW:** safe provider configuration DTO, declarative field labels/types/default endpoints/help links, and HTTP selection adapter. |
| **Sender and DNS** | Display name, From address, derived sender domain; provider verification separately from authoritative DNS results. Per record: type, host, expected/observed value, status, copy controls. **Check again**, copy instructions, plugin-provided setup guidance. | **EXISTS:** `readMailSenderSetting`, settings read/write APIs, `mailSenderIdentityFor`; `domainRequirements`; `withMailRequirements`; `planDomainDns`, `domainDnsInstructions`, `verifyDomainDns`. **NEW:** thin admin DNS adapters and detailed status DTO. Existing status only exposes sender warnings, not record results. |
| **Send test email** | Editable recipient, defaulting to the operator’s account address; actual provider, sender and destination; result with timestamp and message ID. | **EXISTS:** `mail_send_test` through the normal sender, suppression, rate-limit and delivery policy. **NEW:** shared callable test operation + HTTP adapter; optional chosen recipient; persist safe test evidence. Existing tool only permits the operator’s own address. |
| **What uses email** | Sign-in links, confirmations, configured form notifications, newsletter when present. Each shows enabled/configured state, provider lane, blockers, effective sender and last observed outcome. Expand for details and link to the owning screen. | **EXISTS:** Members interactive sends in `features/members/write-service.ts`; newsletter confirmations in `confirmation.ts`; Forms notification subscriber in `@jini-ai/cms/forms`; newsletter `evaluateLaunchGate`; shared purpose gate. **NEW:** aggregate projection using those owners’ checks, plus purpose-level activity attribution. |
| **Recent sends and failures** | Latest 25 entries; outcome/use/recipient filters; cursor pagination. Details show provider, lane, purpose, safe error, message ID and feedback timeline. | **EXISTS:** `createMailSendLedgerRepo`, `createMailFeedbackInboxRepo`, `createMailCaptureRepo().listCaptured`. **NEW:** paginated reads, joined feedback projection, HTTP/tools, indexes, and safe attempt metadata. The existing ledger lacks purpose/source attribution and omits refusals before reservation. |

Important behavior:

- **Switching:** credential save and activation are separate. Recheck availability and permissions at activation. State explicitly that the switch changes **both transactional and bulk mail**. Do not silently flatten an existing split-lane configuration.
- **DNS:** show `Checking`, `Matches`, `Missing`, `Mismatch`, `Pending`, `Unknown`, and `Timed out`. Unknown is never rendered as ✗. Show record requirements supplied by the provider, including MX when required; preserve existing SPF/DMARC through the DNS planner. No automatic DNS changes in this scope.
- **Provider limitations:** “DNS verification unavailable for this provider” is a supported state. Missing provider-side domain registration receives plugin-owned instructions.
- **Test results:** say **Accepted by provider**, **Captured locally**, **Redirected to …**, or **Failed**. “Delivered” requires delivery feedback. A test does not prove that notification workers or newsletter eligibility work.
- **Use readiness:** show **Ready**, **Blocked — reason**, **Disabled**, **Not configured**, or **Unknown**; show delivery evidence separately. Newsletter campaign From/Reply-To overrides remain visible and owned by Newsletter.
- **History:** distinguish accepted, delivered, bounced, complained, suppressed, deferred, failed and unknown outcomes. No general **Resend** button: sign-in links and unknown outcomes have existing retry constraints.

**Permissions, empty states and errors**

Permissions are enforced server-side per action. Owner access follows the existing wildcard grant; delegated administrators receive explicit permissions. Role names alone grant nothing.

| Section | View / act | Empty and failure behavior |
|---|---|---|
| Status | **EXISTS:** `admin.forms.manage` | Loading skeleton; failed read says “Status unavailable” with Retry, never “Not configured”. |
| Provider | Status permission above; credential summaries currently require `custom-credentials.write` over HTTP. Save/replace: `custom-credentials.write`; switch: `settings.workspace.write`. | No providers: **Manage agent plugins**. Show rejected plugin contributions safely. Vault unavailable: actionable error; no activation or false Saved state. |
| Sender | Read: `settings.read`; write: `settings.workspace.write` | Blank means no sender configured. Invalid address stays unsaved with field error. Failed save retains draft and previous effective value. |
| DNS | Read/instructions: `deployments.read`; persisted verification: `deployments.publish` | Missing requirements, unsupported verification and resolver failures receive distinct messages. Restricted users can see permitted summary facts without DNS actions. |
| Test | **EXISTS:** `admin.forms.manage` | Missing account address: enter a recipient. Missing sender/provider: explain disabled action. Suppression, throttling and provider refusal keep their actual reason. |
| Uses | Status: `admin.forms.manage`; linked feature actions retain their owning permissions | “No forms have email notifications configured”; omit absent optional features. A failed feature check produces Unknown only for that row. |
| Activity | **NEW:** `mail.activity.read`; full recipient details require this permission | “No sends recorded” versus “No matching results”. Request failure retains prior results labelled stale. No message bodies or sign-in URLs. |

Use these permissions for navigation visibility and partial section access; hide Email from principals with no applicable read access.

**3. What is missing**

| Rank | Addition | Decision |
|---|---|---|
| **Must-have** | Honest readiness and production blockers | Existing configuration status cannot establish that each use works. Reuse the actual feature gates; never bypass them to make the page green. |
| **Must-have** | Feedback setup and visibility | Show whether feedback is supported, webhook URL, signing-secret configured state and last verified event. “No events yet” differs from healthy ingestion. Reuse `feedback-sources.ts` and its current/previous secret rotation slots. |
| **Must-have** | Bounces and suppression visibility | Search blocked recipients and show reason, scope and timestamp. Existing hard-bounce `all` and complaint `bulk` rules survive provider switches. |
| **Must-have** | Provider health, last error and live key replacement | Presence of a saved key proves neither validity nor delivery. Extend the resolver’s cached-provider lifecycle so replacing a key takes effect on the next send; clearing the UI cache alone is insufficient. |
| **Must-have** | Chosen test recipient | Default to self; validate the entered address, show the actual destination and rate-limit deliberate sends. Preserve suppression and test-mode rules. |
| **Must-have** | Banner onboarding | Replace “under Access Tokens” with **Set up email** linking directly here. Keep the existing dismissal behavior. |
| **Must-have** | Local/desktop explanation | Local console means **No external delivery**, never healthy email. Desktop without a site domain can use a verified sender domain the owner controls; the website hostname need not match. Do not invent `.local` DNS records or a free hosted relay. |
| **Must-have** | i18n and privacy | Translate page, navigation, banner, errors and approval cards across the existing 21 locales; support RTL and locale-aware dates. Define activity retention; captured auth links require short retention and restricted access. |
| **Should-have** | Reply-To | Add an optional system-mail default. `OutboundEmail.replyTo` already exists; sender settings/resolution need extension. Preserve campaign-specific overrides. |
| **Should-have** | Suppression management | Add manual blocking and controlled removal with a reason, audit and fresh approval. Removal does not restore marketing consent; complaints and hard bounces need deliberate handling. |
| **Should-have** | Capture inbox and development controls | Reuse capture storage. A local preview inbox is more useful than asking desktop owners to inspect stdout. Redirect/capture mode must have a prominent persistent indicator. |
| **Should-have** | Rate information | Show provider-declared limits and observed `retryAfterMs`; label unavailable account quota as Unknown. Existing token buckets are not billing-quota meters. |
| **Later** | Additional per-purpose switches | Reuse existing form notification and newsletter controls first. Do not add a master switch that silently disables sign-in or duplicates feature-owned policy. |
| **Later** | Templates and branding editor | Useful, but belongs with rendering owners. ADR-037 deliberately keeps templates outside the transport port. |
| **Later** | Separate lane selection, quota integrations, automatic failover/DNS apply | Keep the stored lane distinction visible; avoid expanding first-release controls without a separate requirement. |

**4. Assistant tools**

| Status | Tools / gap |
|---|---|
| **EXISTS** | `system_get_mail_status`: configuration, lanes, warnings, provider list; `admin.forms.manage`. |
| **EXISTS** | `mail_set_provider`: selects both lanes; `settings.workspace.write`; always asks, approval cannot be remembered. |
| **EXISTS — extend** | `mail_send_test`: currently self-address only, approval-gated. Add optional recipient and truthful captured/redirected/accepted results. |
| **EXISTS** | `credential_save` with `kind: "api"`: secure human form for creation/rotation; `custom_credential_list`; `custom_credential_verify`. Generic credential verification is not proof of mail-provider readiness. |
| **EXISTS** | `settings_get_effective` / `settings_set_value` can read/write current sender settings. Provider and test-mode writes are deliberately denied through generic assistant settings tools. |
| **EXISTS** | `dns_plan`, `dns_instructions`, `dns_verify` with `include: ["mail"]`. They plan, explain and verify; they do not apply DNS. |
| **NEW** | Extend `system_get_mail_status` with safe provider field metadata, checked-at/error facts, feedback setup and per-use readiness. |
| **NEW** | `mail_list_activity`, `mail_get_activity`, `mail_list_suppressions`; use the same projections and permissions as HTTP. |
| **NEW, when controls ship** | Suppression add/remove and `mail_set_test_mode`, with fresh approval and audit. Capture list/detail/purge tools accompany any capture UI. |
| **EXTEND EXISTING OWNER** | Plugin-driven setup defaults and credential-save post-save refresh. SMTP username/endpoint editing must also work through the secure credential form; the existing username-only tool is restricted to declared HTTP Basic schemes. |

The assistant uses these tools and secure forms throughout. Secrets never enter tool arguments or chat. UI and tools call the same underlying operations.

Tool evidence: [`mail-status/agent-tools.ts`](/Users/la/Programming/Tovu/apps/website/src/features/mail-status/agent-tools.ts), [`tool-registrations.ts`](/Users/la/Programming/Tovu/apps/website/src/features/mail-status/tool-registrations.ts), [`credential-save-tool.ts`](/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/credential-save-tool.ts), [`dns-tools.ts`](/Users/la/Programming/Tovu/apps/website/src/features/domain-dns/dns-tools.ts).

**5. Build plan**

Each phase ships independently. Generic contracts and mechanisms land in Jini before dependent Tovu adapters. New public functions retain `(requiredArgs, optionalArgs)`.

| Phase | Reuse and files touched | Acceptance check |
|---|---|---|
| **1. Replace placeholder and fix banner** | Extend `apps/admin/src/panels.tsx`; add `features/email/Email.tsx`, hook and `email-i18n.ts`; extend `lib/api.ts`, `lib/admin-nav-i18n.ts`, `components/MailStatusBanner/*`. Reuse existing status API, theme boundary and settings styles. Redirect old `/admin/notifications` links. | Same nav count; correct site; banner opens Email; loading/403/error/unconfigured states; all locales. Label this first slice as configuration diagnostics. |
| **2. Provider, credential and sender setup** | Extend Jini `platform/mail` provider metadata and existing UI primitives as needed, then Tovu `features/agent-plugins/mail-adapter-registry.ts`, `server/runtime/boot/{mail-provider-catalog,resolve-mailer}.ts`, `server/runtime/composition/site-mailer.ts`, `features/mail-status/*`, `features/settings/mail-sender.ts`; add thin admin action routes beside `system/mail-status.ts`. | Configure inactive provider, switch both lanes with approval, failed save leaves active setup intact, rotate key while running, next send uses new credential. |
| **3. DNS and test delivery** | Extend `features/domain-dns/{dns-changes,dns-tools,mail-requirements}.ts` only where required; reuse `verifyDomainDns` as status writer. Extract shared test operation from `features/mail-status/tool-registrations.ts`; extend mail tool metadata and admin adapters. | Per-record pass/fail/unknown; preserve SPF/DMARC; unsupported verification; chosen recipient; duplicate-click protection; captured/redirected outcomes; permission parity. |
| **4. Uses and activity** | Extend Jini mail observation contracts and shared purpose-gate readiness access. Add Tovu mail read projections beside `features/mail/{ledger,feedback-inbox}.repo.ts`; extend composition, feature readiness adapters, mail-status tools/routes and Email UI. Add a **new** migration for metadata/indexes; leave migration 0023 immutable. | Form/newsletter blockers remain visible after test success; pre-send refusals appear; feedback joins correctly; historical purpose can be Unknown; pagination, isolation and retention work. |
| **5. Feedback, suppression and development operations** | Extend existing `features/mail/{feedback-sources,suppression.repo,capture.repo}.ts` and Jini contracts; add corresponding HTTP/tools and page disclosures. Reuse `credential_save` and current/previous webhook secret slots. | Bounce/complaint scope, provider switch persistence, secret rotation, approved suppression changes, capture privacy and purge behavior. |

One existing mismatch needs reconciliation in phase 2: [`mail-provider-catalog.ts`](/Users/la/Programming/Tovu/apps/website/src/server/runtime/boot/mail-provider-catalog.ts) currently registers SMTP and console as built-ins. Your plugin rule governs the build: expose SMTP through a plugin contribution using the existing generic transport capability; keep console as a local runtime mode. The page must contain no provider-name branches.

**6. Open questions**

No owner question blocks the first phase. Two policy choices block their later controls:

| Question | Recommended answer |
|---|---|
| Who may remove a suppression? | Owner/delegated `mail.suppressions.manage` permission; fresh confirmation and recorded reason. Never imply renewed newsletter consent. Ship visibility before removal. |
| How long should history and captured mail remain? | Start with 30 days of body-free activity metadata and 24 hours for captured bodies; make retention explicit and provide purge. Confirm before exposing capture previews. |

Inputs reviewed: ADR-037, architecture sections 13–14, the named mail/settings/DNS/plugin/boot files, current admin patterns, build notes, installed Jini contracts and available sibling sources. Some newer Jini mail sources are absent from the sibling checkout; installed package contracts supplied that evidence.

Design-reviewed only; no files changed, tests run or servers started. Next handoff: Coordinator to approve the design and sequence the shared-contract work.

---
## Owner decisions (2026-10-22 ~9:20 AM PT) — override the design above
- **SMTP stays in core.** It is a protocol (generic functionality: any mail server), not a vendor. Do NOT move it to a plugin. Vendor-specific presets (a provider's SMTP host/port defaults) belong in that vendor's plugin. Console stays a local runtime mode.
- **Templates are in scope** (not "later"): HTML email templates that work like Pages — raw HTML mode, the assistant can create/edit them with tools, and a live preview shows the email. Fill-in fields (e.g. {{name}}). Reuse the Pages raw-HTML editor + preview mechanism, not a new editor. Note: scripts can run in the admin preview only; mail clients strip JS, so sent emails are static HTML.
- **Resend MCP** wired into the Resend plugin (in progress).
- Suppression removal = owner-only with confirmation; retention 30 days activity metadata / 24 h captured bodies (coordinator default, owner may change).
