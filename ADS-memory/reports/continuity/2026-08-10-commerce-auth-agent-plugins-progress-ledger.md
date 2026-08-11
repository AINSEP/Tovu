# Active Work Progress Ledger — Commerce, Authentication, and Agent Plugins

Last updated: 2026-08-10
Coordinator mode: Pipeline Mode
Requested implementation agents: `gpt-5.6-sol` at `xhigh`

## Current Objective

Reconcile the stale Tovu backlog against current source, improve the Commerce and
Authentication admin surfaces, and establish a standards-based Agent Plugins surface
integrated with Tovu/Jini chat discovery.

## Active Task List

| ID | Workstream | Status | Owner | Current evidence / next action |
|---|---|---|---|---|
| T1 | Audit Admin Section Spec Sweep against latest `src/**` and `apps/**` | Complete | CodeBase Analyzer | Reconciled 17 sections: 9 implemented, 7 partial, Newsletter admin UI open. |
| T2 | Update `development/todos.md` with current done/not-done state | Complete | Coordinator | Sweep matrix, stale split-era scope, and the final Commerce/Authentication/Agent Plugins done/open checklist are source-synced. |
| T3 | Learn Open SaaS Commerce using CBM MCP + Graphify | Complete | Programmer | Pricing, checkout, subscriptions, provider adapters, and revenue IA traced and source-validated. |
| T4 | Port bounded Open SaaS concepts to Tovu Commerce tab | Implemented and wired | Programmer → Coordinator | `features/commerce/Payments` now replaces the Payments placeholder; combined focused wiring run is green. |
| T5 | Add provider-specific Authentication fields | Complete | Programmer | Google, Facebook, and LinkedIn schemas/panels are wired; 17 focused agent tests passed with 100% targeted coverage. |
| T6 | Design Jini authentication capabilities | Complete (design) | Programmer | Provider-neutral metadata, secret/token/state ports, OAuth lifecycle, auth/audit, refresh/revocation, tenant scoping, and roadmap documented in handoff. |
| T7 | Update embedded AI Dev Shop checkout | Complete | Coordinator | Fast-forwarded `f1282b7` → `2ed7b14`; existing local peer-dispatch edit preserved via autostash. |
| T8 | Study Agent Plugins v1.0.0 official standard | Complete | Coordinator | Confirmed fixed `plugin.json`, `skills/*/SKILL.md`, optional `mcp.json`, and reverse-domain client extensions. |
| T9 | Package AI Dev Shop `ui-ux-design` as an Agent Plugin | Complete | Programmer | Conforming source bundle exists at `apps/admin/src/features/plugins/bundled/ui-ux-design/`; manifest/skill/reference equivalence tests pass. |
| T10 | Build Settings-style Agent Plugins admin screen | Complete | Programmer | `Installed` and inert `Marketplace` tabs, honest bundled card, and source inspector are built. |
| T11 | Learn Open Design add-menu and slash-command tooling | Complete | CodeBase Analyzer | Exact plus-menu, attachment, slash trigger/filter/keyboard/insertion, and Jini ownership seams mapped. |
| T12 | Integrate plugins/Agent Plugins/skills/MCP/files into ChatPane/Composer add menu | Complete | Programmer | Generic Jini grouped discovery plus Tovu catalog adapter are wired; Files/images, regular Plugins, Agent Plugins, Skills/Design toolbox, and MCP render from the plus menu. |
| T13 | Add `/` autocomplete for regular plugins, Agent Plugins, skills, and MCP | Inspection fixes implemented; final rerun in progress | Programmer | Unsupported MCP argument hint removed; `/mcp` is settings navigation only. Shift+Tab no longer selects. Active slash row now has accent-soft background, outline, and inset marker. Jini Composer tests are green 18/18. |
| T14 | Run combined tests, typechecks, architecture checks, and browser verification | Complete before final Composer fix; rerun required | Coordinator / Programmer | Root: Tovu focused 39/39; corrected plugin/AssistantDock 24/24; backdrop UI 7/7; Jini Composer 17/17; PreviewModalShell 77/77; Jini Chat typecheck/build; Tovu Vite build; diff checks. Full admin typecheck retains 34 unrelated baseline mock errors. |
| T15 | Perform combined Code Inspection + security review | Security PASS; inspection pending fixes | Coordinator | Security found no Critical/High/Medium issues; Low advisories cover modal focus, discovery trust/error semantics, per-instance ARIA IDs/menu keyboard model, and browser publication of allowlisted source. Code Inspection is waiting on T13 fixes. |
| T16 | Final backlog/ledger sync and handoff | Checkpoint saved; final handoff pending | Coordinator | This file is the resumption source of truth. No commits/pushes were requested or made. |
| T17 | Decide Jini visitor-auth backend package boundary | Complete; approval pending | System Design | Recommend `@jini-ai/capability-providers/visitor-auth` for neutral OAuth/OIDC contracts/orchestration, with provider adapters in explicit child subpaths and host-owned sessions/secrets/tenant policy. |
| T18 | Add read-only Agent Plugin internals inspector and future Marketplace tab | Complete | Programmer | Reuses Jini `PreviewModalShell` + `CodeWithLines`; exact 14-file source allowlist; traversal rejection; Marketplace has no fetch/install/fake inventory. |
| T19 | Rename first Agent Plugins tab to `Installed` and close inspector from backdrop | Complete | Programmer | True-backdrop target closes; interior clicks remain open; X/Escape preserved. Tovu 7/7 and Jini PreviewModalShell 77/77 passed. |
| T20 | Live UI/UX critique and visual redesign | Critique complete; redesign explicitly skipped | Web Design / Owner | Verdict: targeted redesign recommended (card hierarchy, Marketplace empty state, mobile inspector, modal focus). Owner asked to skip implementation for this run; implementation agent was interrupted before proceeding. |
| T21 | Implement Jini `visitor-auth` foundation and map Tovu host wiring | Implemented; host wiring intentionally deferred | Authentication Programmer/System Design | Universal public subpath, metadata-only Google/Facebook/LinkedIn definitions, immutable extensible registry, opaque-secret ports/tokens, and pure fail-closed OAuth/OIDC lifecycle are implemented. Package tests/typecheck/build and strict changed-scope complexity checks pass; Tovu lacks a safe external-identity/transaction/audit seam, so no false host wiring was added. |
| T22 | Implement smallest provider-neutral Payments backend slice | Implemented (bounded read-only status) | Commerce System Design/Programmer | Added the provider-neutral runtime port/read model and authenticated `GET .../commerce/status`; 7/7 focused and 17/17 expanded tests, root typecheck, and build pass. Configuration schema and all money/downstream capabilities remain explicitly unavailable. |

## Decisions Locked This Session

- The old Admin Section Sweep is not a blocker anymore.
- Commerce stays provider-neutral; Stripe/PayPal are adapters, not core dependencies.
- Authentication UI must not imply OAuth works until backend contracts exist.
- Agent Plugins v1 is a package format, not an install, permission, sandbox, or trust model;
  Tovu/Jini must provide those client policies.
- Portable Agent Plugin components are Skills and MCP servers. Slash commands and Tovu-specific
  UI metadata belong under a stable reverse-domain client extension namespace.
- The canonical UX skill payload is `AI-Dev-Shop/skills/ui-ux-design`; the owner-provided
  Desktop copy currently matches it exactly.
- Public-site OAuth/social sign-in is named `visitor-auth`, avoiding ambiguity with admin auth,
  MCP client auth, existing local `AuthProvider`, and API-token integrations.

## Current Risks / Blockers

- Shared `apps/admin/src/panels.tsx` wiring is serialized; the focused Commerce + Authentication + nav run passed 19/19 tests.
- The Agent Plugins standard is a Working Draft; the loader must pin the recognized v1 schema.
- Plugin execution, installation, trust, permissions, and sandboxing are not part of this first UI/discovery slice.
- Existing unrelated admin test typings may keep the full admin typecheck red; targeted evidence must
  distinguish new regressions from baseline failures.
- Code Inspection's three Composer blockers are implemented; final package/Tovu build and inspector
  re-freeze are still required before merge-ready status.
- The package-source inspector intentionally publishes its 14 allowlisted source files into the admin
  browser bundle. Current files contain no detected secrets; future additions require license/secret review.
- UI/UX redesign is deferred by explicit owner instruction. Preserve the functional `Installed` /
  `Marketplace` page and backdrop behavior; do not resume polish unless asked.
- As of the next owner instruction, all Plugins/Composer work is explicitly on hold. Active work is
  limited to Authentication (`visitor-auth`) and Payments/Commerce.
- `visitor-auth` is a foundation, not an enabled login system: it has no provider adapter, callback
  route, secret-store adapter, token verifier, external-identity linker, or session-minter wiring.
- Commerce status is now a real authenticated API read, but no payment runtime is composed in either
  host composition root. It must not be presented as provider-account readiness: config schema,
  checkout, subscriptions, reconciliation, orders, and revenue remain follow-on work.
- The architecture ratchet still reports SCC growth 33 → 34 from concurrent source state and the
  intentional Commerce public API increment 220 → 221. The baseline was not moved; see the Commerce
  continuation report for evidence.

## Exact Checkpoint State

- AI-Dev-Shop HEAD: `2ed7b14` (`Add extensibility, theming, and UI/UX guidance`). Existing local edit
  remains at `skills/llm-operations/references/peer-llm-dispatch.md` and must be preserved.
- Agent Plugin identity/layout: `ui-ux-design` v`1.1.0` at
  `apps/admin/src/features/plugins/bundled/ui-ux-design/`, with root `plugin.json` and
  `skills/ui-ux-design/SKILL.md` plus 12 references.
- `mcp.json` is intentionally absent: Agent Plugins v1 makes it optional, and this package declares
  no MCP server. Do not create an empty or fabricated manifest.
- Packaged skill recursively matches both `AI-Dev-Shop/skills/ui-ux-design` and the owner-provided
  Desktop source byte-for-byte.
- Jini visitor-auth now exists at the universal public subpath
  `@jini-ai/capability-providers/visitor-auth`. It exports neutral contracts/pure decisions only;
  Google, Facebook, and LinkedIn remain explicitly `metadata-only` and no provider works end to end.
- Main owned Jini changes are under `packages/chat/src/react/**`; backdrop dismissal additionally
  changes `packages/ui/src/renderers/preview-modal-shell/react/components/PreviewModalShell.tsx` and
  its focused test.
- Worktrees contain many unrelated concurrent user changes. Never reset/revert them; inspect only
  the owned files listed in the implementation handoffs.

## Next Actions

1. Do not resume Plugins, Composer, or the deferred UI redesign unless the owner asks.
2. Receive and verify the T21 `visitor-auth` implementation handoff, then obtain owner approval for
   the first host/provider adapter slice before exposing an enabled Authentication control.
3. Independently inspect the T22 provider-neutral Commerce status handoff, then design the first
   host-owned provider-configuration contract before wiring any provider adapter.
4. Reconcile shared package/host boundaries, rerun focused verification, and update this ledger plus
   `development/todos.md` with exact done/open state.

## T21 Tovu Host-Adapter Map

- **Tenant:** map every Jini `tenantId` to Tovu `workspaceId`; callback state lookup, provider
  registration lookup, identity linking, sessions, and audit must all include that scope. Never infer
  a tenant from provider callback data.
- **Credentials/secrets:** `src/integrations/ports.ts`'s `SecretSealerPort` and
  `IntegrationSecretRepoPort` can underpin a future `VisitorAuthClientRegistrationPort` adapter,
  with the Jini contract carrying only an opaque `VisitorAuthClientSecretRef`. Tovu still needs a
  visitor-auth configuration record for public client/app IDs and enabled state; do not put plaintext
  secrets in config, content revisions, logs, or browser responses.
- **OAuth transaction:** add a tenant-scoped store whose `consume({ tenantId, state })` is atomic and
  one-time. Seal the PKCE verifier at rest, bind the row to a digest of the initiating browser/session,
  enforce the short expiry, and consume even when the later callback validation rejects.
- **HTTP and crypto:** concrete discovery/token/revocation adapters must live outside the universal
  module and use Tovu's guarded `src/http` `HttpClientPort` (pinned DNS/SSRF policy, response caps,
  redirect revalidation). CSPRNG/SHA-256 and ID-token/JWKS verification are host/provider adapters;
  callback claims stay untrusted until signature and semantic validation both pass.
- **Identity/session:** current Jini CMS/Tovu `UserRecord` requires `passwordHash` and has no external
  identity link. Add an `ExternalIdentityRepoPort` keyed by `(workspaceId, providerId, subject)` plus
  an explicit, confirmation-aware account-link policy before reusing the existing principal/session
  repositories. Do not synthesize passwords or auto-link solely by email.
- **Audit:** `src/features/tool-audit` is tool-specific and explicitly non-gating, so it is not a
  visitor-auth audit adapter. Add a redacted visitor-auth audit port/record for configuration changes,
  authorization starts, callback rejection reason codes, link/create decisions, refresh, revoke, and
  administrative disable; never record codes, tokens, PKCE verifiers, nonces, or secret values.
- **Callback/redirect:** Tovu owns the derived callback URI and route lifecycle; it is displayed to
  operators for provider-console setup, never editable as a credential. The route must atomically
  consume state, validate tenant/browser/state/expiry/response issuer, exchange through a provider
  adapter, verify ID tokens, apply account-link policy, then mint the existing hashed server session.
