# Behavior Rules Spec: supabase-agent-plugin

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-052 |
| feature_name | FEAT-052-supabase-agent-plugin |
| version | 1.0.0 |
| content_hash | sha256:0000000000000000000000000000000000000000000000000000000000000 |
| last_edited | 2026-09-13T00:00:00Z |

**Purpose:** This feature has a genuine connect-method precedence rule (OAuth vs. personal-access-token fallback), a non-obvious default (read-only), and a numeric/identity limit (exactly one active credential, exactly one selected project) — all three trigger conditions from the template's "When to create this file" list. This file is required, not optional.

---

## 1. Precedence Rules

### 1.1 Connect-Method Precedence

**Situation:** Applies every time the agent starts a Supabase connect flow.

**Sources in precedence order (highest to lowest):**
1. `OAuth self-configuration` — attempted first, always, because it requires zero manually-typed secrets and reuses the exact hardened path already used for Higgsfield (REQ-03).
2. `Personal-access-token fallback` — attempted only if source 1 fails (discovery failure, dynamic client registration refused, or no publicly reachable callback URL) (REQ-08).

**Example:**
- Scenario: Supabase's authorization server does not support dynamic client registration for Tovu's redirect URI.
- Input: source 1 = discovery/registration failure; source 2 = available.
- Result: source 2 (fallback form) is used. The agent does not retry source 1 automatically after a failure within the same connect attempt.

**Test requirement:** WHEN OAuth self-configuration fails, the system shall present the fallback form; WHEN OAuth self-configuration succeeds, the system shall never present the fallback form in the same attempt.

---

### 1.2 Enablement Precedence (Token vs. Project)

**Situation:** Applies to whether any Supabase tool may be dispatched.

**Sources in precedence order (highest to lowest, both required — this is an AND, not a fallback chain):**
1. `Valid sealed credential exists` (OAuth token not expired, or a probe-validated personal access token) — necessary but not sufficient.
2. `Exactly one project selected` (`project_ref` set) — necessary but not sufficient.

**Example:**
- Scenario: OAuth completes but the user has not yet submitted the project-scope form.
- Input: source 1 = present; source 2 = absent.
- Result: no Supabase tool is enabled (INV-04). The connection is excluded from `readEnabledExternalMcpConfigs`'s result (AC-12).

**Test requirement:** The TDD Agent must write a test for each of the four (credential present/absent) × (project present/absent) combinations; only (present, present) enables tools.

---

## 2. Ordering Rules

N/A — this feature does not define a display or processing order for multiple items. There is exactly one Supabase connection per workspace (the External MCP server id `supabase` is a fixed, singular id, not a collection).

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `ProjectScopeForm.readOnly` | MCP-UI form input, set server-side before the form is emitted | `true` | Least privilege: a user connecting Supabase for the first time has not yet decided which write tools they trust the agent with; defaulting to read-only means a mistaken first connection cannot mutate data (REQ-06, INV-02). |
| Newly provisioned Supabase External MCP row `enabled` | `external_mcp_servers` row, set by `provisionAgentPluginMcpServers` (existing, unmodified) | `false` | Matches the existing rule for every plugin-provisioned MCP row: a plugin's own `mcp.json` never auto-grants runtime access; the operator (or the agent, subject to existing permission checks) must still flip it on. |
| Newly provisioned Supabase External MCP row `allowedToolNames` / `writeAllowedToolNames` | Same row | `[]` (both empty) | No tool is callable until explicitly allowlisted — this is the existing default-deny federation rule (R2/R3 in `mcp-federation/trust.ts`), not something this feature changes. |
| OAuth connect retry after a discovery/registration failure | Agent behavior | Falls back to the personal-access-token form rather than re-attempting OAuth automatically | Repeating a failing dynamic-client-registration call in a loop wastes the user's time and produces no new information; a one-shot fallback gives the user a working path immediately (§1.1). |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| Active Supabase connections per workspace | Exactly 1 (fixed server id `supabase`) | api (External MCP store's id scheme) | Not a new constraint — every plugin-provisioned connection uses a fixed id derived from the plugin's `mcp.json` key. |
| Selected projects per connection | Exactly 1 | api (`ProjectScopeForm` submit handler) | `SUPABASE_NO_PROJECT_SELECTED` / `SUPABASE_PROJECT_NOT_IN_ACCOUNT` reject zero or invalid selections; there is no "all projects" option. |
| Personal-access-token length/format | Whatever Supabase's own token format is (not independently constrained by Tovu) | api (probe validation) | Tovu does not pattern-match the token client-side beyond "non-empty"; validity is determined by a live probe call (EC-03), never by regex guessing. |
| Time an OAuth connect attempt may sit "pending" before a retry starts fresh | No fixed TTL enforced by this feature | n/a | EC-01: a later retry always starts a fresh authorization request regardless of how long the prior attempt has been pending; this reuses the existing OAuth service's behavior unmodified. |

---

## 5. Deduplication Rules

### 5.1 What Counts as a Duplicate

A second Supabase connection attempt for the same workspace is never a separate resource — it is the same fixed-id External MCP row (`supabase`) being reconfigured. There is no scenario where two Supabase connections coexist for one workspace.

### 5.2 How Duplicates Are Handled

**At connect time:** If a personal-access-token fallback is completed while an OAuth attempt for the same row is still pending/incomplete, the fallback's result supersedes the pending OAuth attempt (EC-04) — the row moves to the fallback's credential and status, and the stale pending OAuth state is discarded, not merged.

**User-facing behavior:** The user only ever sees one Supabase entry in the Integrations list; there is no "which one wins" decision exposed to them.

### 5.3 Idempotency vs. Deduplication

Submitting the same personal access token twice through `AccessTokenForm` is not treated as an error — the second submission simply reseals and replaces the stored credential (idempotent from the user's point of view). This is distinct from the singular-connection rule above, which concerns concurrent connect *methods*, not repeated submissions of the same method.

---

## 6. Tie-Break Logic

N/A — this feature has no scenario where multiple items compete for the same role. Enablement is an AND of two required conditions (§1.2), not a competition between candidates.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| OAuth attempt is pending when the user starts a fresh connect attempt | The fresh attempt supersedes the pending one; no two pending OAuth attempts are tracked simultaneously for the same row. | Yes |
| Fallback token submitted while OAuth is also mid-flight | Fallback wins per §5.2 (EC-04); the OAuth attempt is discarded, not left dangling. | Yes |
| `ProjectScopeForm` submitted with `projectRef` not present in the account's project list | Rejected with `SUPABASE_PROJECT_NOT_IN_ACCOUNT`; connection remains unscoped. | Yes |
| `AccessTokenForm` submitted with an empty string | Rejected client-side before any network call (§ui.spec.md §3.3 `onSubmitEmptyToken`); no `SUPABASE_TOKEN_INVALID` round trip needed for this case. | Yes |
| Read-only toggle switched off without any write tools subsequently allowlisted by the operator | No behavior change from the read-only default — turning the toggle off only permits the *operator* to later add write tools; it does not itself enable any (§1.2, INV-02). | Yes |
| Two rapid `ProjectScopeForm` submissions with different `projectRef` values (double-click) | Last write wins for the project selection field itself, but tool enablement still requires the credential+project AND from §1.2 to be freshly re-evaluated — no stale enablement from the first submission survives. | Yes |
