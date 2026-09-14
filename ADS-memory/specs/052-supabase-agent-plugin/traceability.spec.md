# Traceability Matrix: supabase-agent-plugin

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
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
| traceability_status | PENDING IMPLEMENTATION |

**Purpose:** Traces every REQ/AC/INV/EC/error code/behavior rule from this spec package through to its (future) implementation and test. All rows are PENDING — this spec has not yet gone through TDD or Programmer stages.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Installable plugin package with a valid streamable-http+oauth `mcp.json` | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-01) | Manifest/mcp-config parse with zero errors | P1 | pending | pending | pending | pending | PENDING |
| REQ-02 | Agent explains install path when plugin not installed | — | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-02) | No Supabase tool call before install | P1 | pending | pending | pending | pending | PENDING |
| REQ-03 | Primary connect uses OAuth self-configuration, no manual client id/secret | — | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-03) | Single authorization URL returned, nothing hand-typed | P1 | pending | pending | pending | pending | PENDING |
| REQ-04 | OAuth callback seals token via existing sealer | — | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-04) | `sealedOAuth` non-empty, no plaintext in row | P1 | pending | pending | pending | pending | PENDING |
| REQ-05 | Project-selection form required before enablement | — | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-05) | No tool call reaches Supabase before project selected | P1 | pending | pending | pending | pending | PENDING |
| REQ-06 | Read-only toggle defaults on | — | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-06) | Toggle is "on" on first paint | P1 | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-06) | Turning toggle off only reflects explicit confirmation | P2 | pending | pending | pending | pending | PENDING |
| REQ-07 | New redeemable tool ids added to allowlist | — | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-07) | Listed ids processed; unlisted ids 403 | P1 | pending | pending | pending | pending | PENDING |
| REQ-08 | Fallback to PAT form on OAuth self-configuration failure | — | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-08) | Fallback form shown on discovery/registration failure | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | PAT sealed via custom-credential store, never logged/echoed | — | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-09) | Raw token absent from transcript/logs | P1 | pending | pending | pending | pending | PENDING |
| REQ-10 | PAT delivered as Authorization Bearer header, not env/args | — | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-10) | Outbound request carries Bearer header; env/args empty | P1 | pending | pending | pending | pending | PENDING |
| REQ-11 | No tool enabled until token AND project both present | — | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-11) | Connection excluded from enabled-config set pre-scope | P1 | pending | pending | pending | pending | PENDING |
| REQ-12 | Write tools require explicit `writeAllowedToolNames` grant | — | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-12) | Write-hinted tool refused without explicit grant | P1 | pending | pending | pending | pending | PENDING |
| REQ-13 | One-action disconnect deletes credential | — | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-13) | Post-disconnect calls fail; row no longer decrypts | P1 | pending | pending | pending | pending | PENDING |
| REQ-14 | Expired/revoked credential surfaces reconnect prompt, no silent retry | — | pending | pending | pending | pending | PENDING |
| AC-15 (REQ-14) | Plain-language prompt; raw Supabase error not relayed | P1 | pending | pending | pending | pending | PENDING |

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | Raw token must never appear in transcript, tool args, or logs | pending | pending | PENDING |
| INV-02 | No write-capable tool executes without explicit `writeAllowedToolNames` entry | pending | pending | PENDING |
| INV-03 | Sealed credential always uses the shared root-key-derived AES-256-GCM sealer | pending | pending | PENDING |
| INV-04 | No Supabase tool enabled while no project is selected | pending | pending | PENDING |
| INV-05 | MCP-UI submission processed only for ids in `MCP_UI_REDEEMABLE_TOOL_IDS` | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | User abandons OAuth consent screen | pending | pending | PENDING |
| EC-02 | Account has multiple projects/orgs | pending | pending | PENDING |
| EC-03 | Invalid/malformed personal access token pasted | pending | pending | PENDING |
| EC-04 | Both OAuth attempt and completed PAT fallback exist | pending | pending | PENDING |
| EC-05 | Token revoked directly at Supabase's dashboard | pending | pending | PENDING |
| EC-06 | Write-tool result contains destructive confirmation language | pending | pending | PENDING |
| EC-07 | Supabase hosted MCP endpoint unreachable | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| SUPABASE_OAUTH_DISCOVERY_FAILED | pending | pending | pending | PENDING |
| SUPABASE_OAUTH_CANCELLED | pending | pending | pending | PENDING |
| SUPABASE_NO_PROJECT_SELECTED | pending | pending | pending | PENDING |
| SUPABASE_PROJECT_NOT_IN_ACCOUNT | pending | pending | pending | PENDING |
| SUPABASE_TOKEN_INVALID | pending | pending | pending | PENDING |
| SUPABASE_TOKEN_REVOKED | pending | pending | pending | PENDING |
| SUPABASE_TOOL_ID_NOT_REDEEMABLE | pending | pending | pending | PENDING |
| SUPABASE_WRITE_TOOL_NOT_ALLOWED | pending | pending | pending | PENDING |
| SUPABASE_UPSTREAM_UNAVAILABLE | pending | pending | pending | PENDING |
| SUPABASE_UPSTREAM_TIMEOUT | pending | pending | pending | PENDING |
| SUPABASE_DISCONNECTED | pending | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Connect-method precedence (OAuth before PAT fallback) | § 1.1 | pending | pending | PENDING |
| Enablement precedence (token AND project both required) | § 1.2 | pending | pending | PENDING |
| Default: `ProjectScopeForm.readOnly = true` | § 3 | pending | pending | PENDING |
| Default: provisioned row starts `enabled: false`, empty allowlists | § 3 | pending | pending | PENDING |
| Fallback completion supersedes pending OAuth attempt | § 5.2 | pending | pending | PENDING |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| REQ-01 – REQ-14 | Spec stage only; TDD and Programmer stages have not run | Following `/plan` and `/tasks` dispatch | Coordinator |

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| REQ-01 – REQ-14 | Spec stage only; no tests written yet | Following TDD Agent dispatch | Coordinator |

### 6.3 Untested Error Codes

| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| All codes in `errors.spec.md` | Spec stage only | Following TDD Agent dispatch | Coordinator |

### 6.4 Deferred Items

| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| OQ-04 (stdio/local deployment of `@supabase/mcp-server-supabase`) | A future spec revision | Out of scope for v1; hosted endpoint covers the requested flow | Leona Burime (pending explicit confirmation — see feature.spec.md OQ-04) |

---

## 7. Untraced Requirements

| REQ/AC ID | Reason Not In Matrix |
|-----------|---------------------|
| — | — |

---

## 8. Traceability Completeness Checklist

- [x] All REQ-* from feature.spec.md appear in the Section 1 matrix
- [x] All AC-* from feature.spec.md appear in the Section 1 matrix
- [x] All INV-* from feature.spec.md appear in the Section 2 matrix
- [x] All EC-* from feature.spec.md appear in the Section 3 matrix
- [x] All error codes from errors.spec.md appear in the Section 4 matrix
- [x] All behavior rules from behavior.spec.md appear in the Section 5 matrix
- [x] Section 6.1 (unimplemented) entries are all DEFERRED-equivalent (spec stage, pre-TDD) with a target and owner
- [x] Section 6.2 (untested) entries are all accounted for the same way
- [x] Section 6.3 (untested error codes) accounted for the same way
- [x] Section 7 (untraced) is empty
- [ ] All VERIFIED rows have been reviewed and signed off by the Code Inspection Agent — N/A at spec stage, no rows are VERIFIED yet

**[ ] TRACEABILITY COMPLETE** — not yet; pending implementation. This is expected and correct for a spec-stage handoff.

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | s10-plugin-specs | 2026-09-13T00:00:00Z | Spec-stage handoff; all rows pending implementation |
| TDD Agent | | | |
| Programmer Agent | | | |
| Code Inspection Agent | | | |
| Coordinator | | | |
