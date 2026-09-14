# Feature Spec: supabase-agent-plugin

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-052 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:d8a4828428d333889e99692a83641dc4f301fcf5789117091d2403243dc1fc8a |
| feature_name | FEAT-052-supabase-agent-plugin |
| last_edited | 2026-09-13T00:00:00Z |
| owner | Leona Burime |
| spec_agent | Spec Agent (s10-plugin-specs) |
| spec_mode | brownfield |

---

## Overview

A new installable agent plugin that lets a Tovu site owner connect their Supabase account to the AI assistant. The agent gives the user a login link, captures the resulting credential without ever showing it back to the user or the model, scopes access to one Supabase project in read-only mode by default, and only then exposes Supabase's official MCP tools (schema, SQL, docs) to the agent.

---

## Problem Statement

**Current state:** Tovu ships five bundled agent plugins (Higgsfield Media, Github, Fly.io Deploy, Site Compliance, tovuize-site) but none for Supabase. A user who wants the agent to work against a Supabase-backed database has no supported connect path — they would have to hand-type a personal access token somewhere, if they could find anywhere to put it at all. The generic building blocks this needs (OAuth self-configuration, sealed credential storage, MCP-UI masked forms, per-tool write allowlisting) already exist and are exercised by other plugins today; only the Supabase-specific package and the two new UI forms this flow needs are missing.

**Desired state:** From inside a chat conversation, a user who decides they want Supabase can: get a login link, authorize Tovu against their Supabase account (or, if that is not possible, paste a personal access token into a masked in-chat form), pick exactly one project, and land in a read-only-by-default connection — all without hand-editing any admin JSON and without the raw token ever appearing in the transcript, tool arguments, or logs.

**Why now:** Owner request, 2026-09-13 (`ADS-memory/.local-artifacts/owner-worklist.md` §12 item 1, §"NEW owner ask"): *"If the owner picks Supabase as a provider, the agent should prompt the user to log in via a link, use MCP-UI to show an access-token form, and save the token for them — the user shouldn't have to hand-enter it."* No hard deadline; flagged by the owner as needing a design/decision pass before implementation spend (worklist §"NEEDS A DESIGN/DECISION BEFORE SPENDING: Supabase plugin (12.1)").

**Success signal:** A user with an existing Supabase account and project can go from "I want to use Supabase" to the agent successfully calling a live, project-scoped, read-only Supabase MCP tool (e.g., listing tables) in one chat session, with zero manual admin-side JSON editing and zero raw-token exposure anywhere the model or a log can see it.

---

## User Journey

**Trigger:** The user tells the agent they want to use Supabase for the site's backend, or asks for something (e.g., "add a database") that the agent determines needs Supabase.

**Steps:**
1. The agent checks whether the Supabase plugin is installed and active. If not installed, the agent explains what it does and how to install it (bundled seed or Marketplace) and does not attempt to connect.
2. The agent's primary connect action self-configures OAuth against Supabase's hosted MCP endpoint — the same generic discovery/registration path already used for the Higgsfield plugin — and returns one clickable authorization ("login") link.
3. The user clicks the link, logs into (or is already logged into) Supabase, authorizes the requested access, and is redirected back. Tovu's existing OAuth callback route completes the connection and seals the resulting token; the agent never sees the raw token.
4. The agent renders a new MCP-UI form asking the user to pick exactly one Supabase project to scope the connection to, with a read-only toggle defaulted to on. No Supabase tool is enabled until this form is submitted.
5. **Fallback path** — used only if OAuth self-configuration cannot complete (Supabase's auth server refuses dynamic client registration for this deployment, or there is no publicly reachable callback URL): the agent instead links the user to `https://supabase.com/dashboard/account/tokens` to create a personal access token, then renders a masked MCP-UI form (the same pattern already used for pasting API keys) for the user to submit that token. The agent never sees the raw value.
6. Once a token exists and a project is selected, the connection still starts fully disabled with an empty tool allowlist, exactly like any other External MCP connection — the operator (or the agent, subject to existing permission checks) must still enable it and choose which tools it may call.

**Outcome:** The agent can call Supabase MCP tools scoped to the chosen project, at whatever read/write tier the operator granted.

**Alternate paths:**
- User abandons the OAuth consent screen: the connection stays unconnected; a retry starts a fresh authorization request.
- User pastes an invalid personal access token: the form re-renders with an error; nothing is stored.
- User later disconnects Supabase: the sealed credential is deleted (not merely disabled) and further Supabase tool calls fail cleanly.
- Stored token is later revoked or expires: the next tool call fails with a plain-language reconnect prompt instead of a raw error or a silent retry loop.

Note: deterministic ordering (OAuth-first vs. fallback), the read-only default, and the write-allowlist precedence are detailed in `behavior.spec.md`.

---

## Scope

**In scope:**
- A new agent plugin package: `content/agent-plugins/supabase/plugin.json`, `mcp.json`, `skills/supabase/SKILL.md` (+ references), matching the schema in `apps/website/src/features/agent-plugins/manifest.ts`.
- Reuse (unmodified) of the existing OAuth self-configuration and federation machinery (`apps/website/src/assistant/external-mcp-oauth.ts`, `apps/website/src/assistant/mcp-federation/*`) as the primary connect path.
- Two new MCP-UI forms and their tool handlers: a project-scope + read-only-toggle form, and (fallback only) a masked personal-access-token form modeled on `apps/website/src/features/custom-credentials/custom-credential-set-token-ui.ts`.
- Registering the plugin's new redeemable tool ids in `MCP_UI_REDEEMABLE_TOOL_IDS` (`apps/website/src/assistant/mcp-ui-tool-calls.ts`).
- Read-only-by-default access, with write tools gated behind the existing `writeAllowedToolNames` operator grant (`mcp-federation/trust.ts` R3).
- A one-action disconnect/revoke flow that deletes the sealed credential.
- SKILL.md guidance content mirroring `content/agent-plugins/higgsfield-media/skills/higgsfield-media/SKILL.md`'s structure (cold-start, cost-of-tools, write-grant explanation, do-not list).

**Out of scope:**
- Any new OAuth protocol implementation, credential-encryption mechanism, or MCP-UI rendering engine — all three already exist and are reused as-is.
- Local/self-hosted `stdio` deployment of `@supabase/mcp-server-supabase` as a Tovu-spawned per-workspace process — a plausible future alternative, deferred (see OQ-01).
- Rework of the generic External MCP "Add server" admin form — that UI cleanup is worklist item 12.4, already in flight as a separate task (`o3-mcp-form`).
- Automatic Supabase project creation — the user must already have a Supabase account and at least one project.
- Any Supabase capability beyond what `https://mcp.supabase.com/mcp` exposes.

---

## Requirements

- REQ-01: The system MUST provide an installable agent plugin package whose `mcp.json` declares a single `streamable-http` server pointing at `https://mcp.supabase.com/mcp` with `tovuAuthMode: "oauth"`, and whose `plugin.json`/`mcp.json` both pass `parseAgentPluginManifest`/`parseAgentPluginMcpConfig` validation.
- REQ-02: When the Supabase plugin is not installed and the user asks the agent to connect Supabase, the agent MUST explain how to install it and MUST NOT attempt to call any Supabase-scoped tool.
- REQ-03: The agent's primary connect action MUST use the existing OAuth self-configuration path (RFC 9728/8414 discovery + RFC 7591 dynamic client registration, `external-mcp-oauth.ts`) to produce one authorization URL, with no manually-typed client id or secret.
- REQ-04: On successful OAuth callback, the system MUST seal the resulting token using the existing `AesGcmSecretSealer` / `sealExternalMcpOAuthPayload` path — the same mechanism already used for every other OAuth-federated plugin.
- REQ-05: After a Supabase connection reaches `oauthStatus: "connected"`, the system MUST present an MCP-UI form requiring the user to select exactly one Supabase project (`project_ref`) before the connection can be enabled.
- REQ-06: The project-selection MCP-UI form MUST default its read-only toggle to "on"; turning it off MUST require a distinct, explicit user action.
- REQ-07: Every new MCP-UI-redeemable tool id this plugin introduces MUST be added to `MCP_UI_REDEEMABLE_TOOL_IDS`; a submission for a Supabase-plugin tool id not on that list MUST be rejected with 403 by the existing route, not silently accepted.
- REQ-08: If OAuth self-configuration fails (discovery failure, dynamic client registration refused, or no publicly reachable callback URL), the agent MUST offer a fallback: a link to `https://supabase.com/dashboard/account/tokens` plus a masked MCP-UI form for the user to paste a personal access token.
- REQ-09: A personal access token submitted through the fallback form MUST be sealed via the existing custom-credential store and MUST NOT appear in the assistant's transcript, any tool-call arguments visible to the model, or any log.
- REQ-10: A sealed fallback-path token MUST be delivered to the Supabase MCP connection as an `Authorization: Bearer <token>` HTTP header on a `streamable-http` External MCP row — never as a chat message, a tool argument, or an environment variable.
- REQ-11: No Supabase tool MUST be enabled for the assistant until both (a) a valid token exists (OAuth or personal-access-token) and (b) a project has been selected.
- REQ-12: Write-capable Supabase tools (e.g., `apply_migration`, `execute_sql`, `delete_branch`) MUST remain unavailable to the agent unless the operator explicitly adds them to the connection's `writeAllowedToolNames` — no plugin-specific bypass of the existing trust-tier check.
- REQ-13: The user MUST be able to disconnect Supabase in one explicit action, after which no further Supabase tool calls succeed and the previously sealed credential is deleted, not merely disabled.
- REQ-14: If a Supabase tool call fails because the stored credential is expired, revoked, or otherwise invalid, the agent MUST surface a clear, actionable reconnect message and MUST NOT retry silently with the stale credential or relay Supabase's raw error body to the model unfiltered.

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given the Supabase plugin package on disk, when `parseAgentPluginManifest` and `parseAgentPluginMcpConfig` run against it, then both return zero errors.
- AC-02 (REQ-02) [P1]: Given the Supabase plugin is not installed, when the user asks the agent to connect Supabase, then the agent's reply explains how to install it and no Supabase-scoped tool call is made.
- AC-03 (REQ-03) [P1]: Given the Supabase plugin is installed, when the user asks the agent to connect Supabase, then the agent returns exactly one clickable authorization URL produced by the existing OAuth self-configuration path, with no client id or secret typed by the user or the operator.
- AC-04 (REQ-04) [P1]: Given the OAuth callback completes successfully, when the stored connection record is inspected, then the token is present only in encrypted form and no plaintext token value exists anywhere in that record.
- AC-05 (REQ-05) [P1]: Given a Supabase connection with `oauthStatus: "connected"` and no project selected, when the agent attempts to use any Supabase tool, then the agent renders the project-selection MCP-UI form instead and no tool call reaches Supabase.
- AC-06 (REQ-06) [P1]: Given the project-selection form is rendered, when it first loads, then the read-only toggle's value is "on" with no user interaction.
- AC-07 (REQ-06) [P2]: Given the user explicitly turns the read-only toggle off and submits, when the connection's write-tool allowlist is inspected afterward, then it contains only the write tools the form explicitly confirmed.
- AC-08 (REQ-07) [P1]: Given a submission POSTed to the MCP-UI tool-calls route for `supabase_set_project_scope` or `supabase_set_access_token`, when those ids are present in `MCP_UI_REDEEMABLE_TOOL_IDS`, then the submission is processed; given a request naming any other, unlisted Supabase-plugin tool id, then the route returns 403.
- AC-09 (REQ-08) [P1]: Given OAuth self-configuration returns a discovery or registration failure, when the agent responds, then it presents the personal-access-token link and masked form instead of repeating the same failing OAuth attempt.
- AC-10 (REQ-09) [P1]: Given a user submits a personal access token through the fallback form, when the assistant's transcript and tool-call logs are inspected afterward, then the raw token string does not appear anywhere in them.
- AC-11 (REQ-10) [P1]: Given a sealed fallback-path connection, when a Supabase tool is invoked, then the outbound request to `https://mcp.supabase.com/mcp` carries an `Authorization: Bearer` header and the token is never passed as a plain configuration value or command argument for that connection.
- AC-12 (REQ-11) [P1]: Given a freshly OAuth-connected Supabase server with no project selected, when the assistant starts up or reconnects, then no Supabase tool is offered to the agent.
- AC-13 (REQ-12) [P1]: Given a Supabase connection where the operator has allowed read tools but has not granted any write tool, when the agent calls a Supabase tool that self-declares itself as a write/destructive operation, then the call is refused rather than executed.
- AC-14 (REQ-13) [P1]: Given a connected Supabase plugin, when the user disconnects it, then subsequent Supabase tool calls fail with a "not connected" error and the previously sealed credential row no longer decrypts to a usable token.
- AC-15 (REQ-14) [P1]: Given a Supabase API call fails with 401 due to an expired or revoked token, when the agent responds to the user, then the message is a plain-language reconnect prompt and Supabase's raw error body is not relayed verbatim to the model.

---

## Invariants

- INV-01: A raw Supabase OAuth token or personal access token must never appear in the assistant's transcript, in tool-call arguments visible to the model, or in any application log.
- INV-02: A Supabase connection must never execute a write-capable tool unless that exact tool name is present in the connection's operator-set `writeAllowedToolNames`.
- INV-03: The sealed credential for a Supabase connection must always use the same root-key-derived AES-256-GCM sealer used for every other External MCP or custom credential — never a plugin-specific storage mechanism.
- INV-04: A Supabase tool must never be enabled for the assistant while no project has been selected for that connection.
- INV-05: An MCP-UI form submission naming a Supabase-plugin tool id must never be processed unless that exact id is present in `MCP_UI_REDEEMABLE_TOOL_IDS`.

---

## Edge Cases

- EC-01: What happens when the user abandons the OAuth consent screen partway through? Expected behavior: the connection stays in a pending/unconnected state; a later retry starts a fresh authorization request rather than resuming a stale one.
- EC-02: What happens when the OAuth-authorized Supabase account has more than one organization or project? Expected behavior: the project-selection MCP-UI form lists every project the account can see and requires picking exactly one before any tool is enabled.
- EC-03: What happens when the user pastes an invalid or malformed personal access token into the fallback form? Expected behavior: the token is validated with a lightweight authenticated probe before sealing; on failure, the form re-renders with an error and nothing is stored.
- EC-04: What happens when both an OAuth attempt and a completed personal-access-token fallback exist for the same workspace (OAuth partially failed, then the fallback was completed)? Expected behavior: exactly one active credential per Supabase connection — completing the fallback supersedes any incomplete OAuth attempt rather than creating a second parallel connection.
- EC-05: What happens when the token is revoked directly from Supabase's own dashboard rather than through Tovu? Expected behavior: the next Supabase tool call fails with 401 and the agent surfaces the reconnect prompt from REQ-14 rather than treating it as a transient network error.
- EC-06: What happens when a write-capable tool's result contains destructive confirmation language (e.g., a `delete_branch` response)? Expected behavior: the existing untrusted-data boundary and the operator's write-allowlist both apply unmodified — no plugin-specific exception.
- EC-07: What happens when Supabase's hosted MCP endpoint is unreachable? Expected behavior: the tool call fails with a clear "Supabase is unavailable" message; no silent hang and no automatic retry loop.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| Supabase hosted MCP server (`https://mcp.supabase.com/mcp`, package `@supabase/mcp-server-supabase`) | The actual Supabase tools (schema, SQL, docs, project/account operations) over `streamable-http` | Endpoint unreachable or returns a non-2xx response | Tool call fails with a clear message (EC-07); no local emulation |
| Tovu `ExternalMcpOAuthService` (`apps/website/src/assistant/external-mcp-oauth.ts`) | RFC 9728/8414 discovery, RFC 7591 dynamic client registration, token exchange/refresh — reused unmodified | Discovery or dynamic client registration fails against Supabase's auth server | Falls back to the personal-access-token path (REQ-08) |
| Tovu custom-credential store (`apps/website/src/features/custom-credentials/store.ts`) | Sealed storage and the masked MCP-UI form pattern used by the fallback path | Sealer/keyring misconfigured (`TOVU_INTEGRATIONS_ROOT_KEY` unset) | Save fails closed with `CustomCredentialSecretStoreUnconfiguredError` — no plaintext fallback |
| `mcp-federation/trust.ts` write-allowlist mechanism | Enforces read-only-by-default and explicit write-grant for Supabase's destructive tools | N/A — in-process code, not an external system | None; a defect here blocks the feature rather than degrading it |
| `MCP_UI_REDEEMABLE_TOOL_IDS` allowlist (`apps/website/src/assistant/mcp-ui-tool-calls.ts`) | Gate that must include this plugin's new tool ids or every form submission 403s | New tool ids omitted from the allowlist | None — this is a required code change delivered with this feature, not a runtime fallback |

---

## Open Questions

- OQ-01: Does `https://mcp.supabase.com/mcp`'s OAuth authorization server support RFC 7591 dynamic client registration for third-party integrators the way Higgsfield's does, or does Tovu need to pre-register one Supabase OAuth application and ship a fixed client id? Recommended default applied in this spec: assume dynamic registration works, since Tovu's OAuth self-configuration code is generic and Supabase's hosted MCP server documents OAuth 2.1; if registration is refused at implementation time, REQ-08's personal-access-token fallback already covers it without a spec change. — Owner: Leona Burime — Resolve by: 2026-09-20
- OQ-02: Should the desktop app default straight to the personal-access-token fallback instead of attempting OAuth first, given it may run fully offline with no publicly reachable callback URL? Recommended default applied in this spec: attempt OAuth everywhere first (desktop already proxies the same admin callback route the browser admin uses), falling back automatically per REQ-08 if it fails — but this should be confirmed against a real desktop build before implementation. — Owner: Leona Burime — Resolve by: 2026-09-20
- OQ-03: On disconnect, should Tovu attempt to call a Supabase token-revocation endpoint, or is deleting the local sealed row sufficient (leaving the token valid at Supabase's end until it expires or the user revokes it manually)? Recommended default applied in this spec: local deletion only for v1, matching every other External MCP disconnect today; the SKILL.md and disconnect UI copy should tell the user to also revoke at Supabase's end if they want the token fully dead. — Owner: Leona Burime — Resolve by: 2026-09-20
- OQ-04: Should a self-hosted/local `stdio` deployment of `@supabase/mcp-server-supabase` (a Tovu-spawned per-workspace process, authenticated via `SUPABASE_ACCESS_TOKEN`) be offered as an alternative to the hosted endpoint, e.g. for operators who want the Management API platform directly? Recommended default applied in this spec: out of scope for v1 (see Scope); revisit only if the hosted endpoint proves insufficient. — Owner: Leona Burime — Resolve by: 2026-10-01

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Reuses the official `@supabase/mcp-server-supabase` hosted endpoint and Tovu's existing generic OAuth, federation, and custom-credential services; no custom auth protocol is implemented. |
| II — Test-First | COMPLIES | TDD Agent is dispatched before Programmer per the standard pipeline; every AC above is written to seed a test directly. |
| III — Simplicity Gate | COMPLIES | Every new module (plugin package, two MCP-UI forms, two redeemable tool ids, one allowlist edit) traces to REQ-01 through REQ-14. |
| IV — Anti-Abstraction Gate | COMPLIES | No new abstraction layer is introduced; the two new tool handlers call the existing generic services directly. |
| V — Integration-First Testing | COMPLIES | Every P1 AC is stated as an observable integration-level behavior (sealed row shape, HTTP header content, allowlist membership) rather than an implementation detail. |
| VI — Security-by-Default | COMPLIES | Read-only default, sealed-only storage, redeemable-id allowlist, and the never-log invariants (INV-01–INV-05) are all mandatory; Security Agent review is still required before merge per this article's own rule. |
| VII — Spec Integrity | COMPLIES | `spec_id` and `content_hash` are recorded; all downstream agents must reference this version. |
| VIII — Observability | COMPLIES | REQ-14 and EC-05/EC-07 require clear, structured failure surfacing rather than silent failure or an unfiltered raw error. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (verified against existing `ADS-memory/reports/pipeline/` folders — none exist yet for FEAT-052)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (feature has non-trivial ordering/precedence rules: OAuth-vs-fallback, read-only default, write-grant precedence)
- [x] traceability.spec.md complete (pending implementation — rows marked "pending")
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row reserved for Coordinator Planning Preflight
- [x] spec_mode is `brownfield`; brownfield evidence paths are recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Agent Directives (optional)

Always:
- Treat every Supabase token (OAuth-derived or pasted PAT) as INV-01-protected: never place it in a chat message, a tool argument the model can read, or a log line.
- Add every new redeemable tool id to `MCP_UI_REDEEMABLE_TOOL_IDS` in the same commit that introduces the tool — a tool that renders but 403s on submit is a shipped regression, not a follow-up.

Ask before:
- Pre-registering a fixed Supabase OAuth application (client id/secret) instead of relying on dynamic client registration — this is a platform-level credential decision, not an implementation detail (see OQ-01).

Never:
- Implement a plugin-specific credential store, sealer, or MCP-UI rendering path — reuse the existing generic services exactly as this spec describes.
