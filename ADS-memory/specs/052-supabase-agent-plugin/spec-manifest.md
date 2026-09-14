# Spec Manifest: supabase-agent-plugin

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-052 |
| feature_name | FEAT-052-supabase-agent-plugin |
| version | 1.0.0 |
| last_edited | 2026-09-13T00:00:00Z |
| spec_naming | standard |
| spec_root | ADS-memory/specs/052-supabase-agent-plugin |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** This manifest is the package index for the strict Speckit compatibility flow.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec |
| `api.spec.md` | OMITTED | `—` | This feature introduces no new HTTP endpoints. It reuses the existing External MCP OAuth admin routes (`POST .../mcp-servers/:serverId/oauth/connect`, `GET /api/mcp-servers/oauth/callback/:serverId`) and the existing MCP-UI tool-calls route (`POST /api/admin/v1/mcp-ui/tool-calls`) unmodified; the only additions are two new tool ids consumed through that existing route and a new allowlist entry, not a new API surface. |
| `state.spec.md` | OMITTED | `—` | No new durable state shape is introduced. The feature writes into the existing `external_mcp_servers` row schema (`external-mcp-store.ts`) and the existing custom-credential table, both unmodified. |
| `orchestrator.spec.md` | OMITTED | `—` | No new coordinator/orchestration layer is introduced; the feature is two tool handlers plus a plugin package, calling existing generic services directly. |
| `ui.spec.md` | PRESENT | `ui.spec.md` | Two new MCP-UI form surfaces (project scope, fallback access token) need explicit input/event/rendering contracts. |
| `errors.spec.md` | PRESENT | `errors.spec.md` | The feature introduces new, feature-specific failure states (invalid token, no project selected, revoked, etc.) that need a canonical registry distinct from the generic External MCP error set. |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Genuine precedence rule (OAuth attempted before the personal-access-token fallback), a non-obvious default (read-only-by-default), and a deduplication rule (fallback completion supersedes a pending OAuth attempt) all apply. |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds REQ/AC/INV/EC/error-code/behavior-rule coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index for downstream stages |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `feature.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md` |
| `tdd` | `feature.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md`, ADR, tasks |
| `programmer` | `feature.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, ADR, certified tests |

---

## Brownfield / Reverse-Spec References

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `apps/website/src/features/agent-plugins/manifest.ts:71-306` | source touchpoint | Defines the exact `plugin.json`/`mcp.json` schema the new Supabase package must satisfy (REQ-01). |
| `content/agent-plugins/higgsfield-media/{plugin.json,mcp.json,skills/higgsfield-media/SKILL.md}` | source touchpoint | Worked example of an OAuth-federated `streamable-http` plugin; the Supabase package's structure and SKILL.md are modeled directly on this. |
| `apps/website/src/assistant/external-mcp-oauth.ts:487-978` | source touchpoint | Existing generic OAuth self-configuration (discovery, dynamic client registration, callback completion, token persistence) reused unmodified as the primary connect path (REQ-03, REQ-04). |
| `apps/website/src/features/webhooks/secret-sealer.aesgcm.ts:48-140` and `apps/website/src/features/webhooks/keyring.env.ts:45-188` | source touchpoint | The AES-256-GCM sealer and root-key derivation this feature's credentials must use unmodified (INV-03). |
| `apps/website/src/features/custom-credentials/{custom-credential-set-token-ui.ts,store.ts,tool-registrations.ts:907-947,537-604}` | source touchpoint | Exact pattern the fallback `AccessTokenForm` and its tool handler are modeled on, including the `askThenReport` requirement (REQ-08, REQ-09). |
| `apps/website/src/assistant/mcp-ui-tool-calls.ts:36-263` | source touchpoint | `MCP_UI_REDEEMABLE_TOOL_IDS` allowlist that both new tool ids must be added to (REQ-07); documents the exact prior-incident pattern ("form renders, submission 403s") this feature must not repeat. |
| `apps/website/src/assistant/mcp-federation/trust.ts:36-103` | source touchpoint | R1–R3 federation rules (tool namespacing, default-deny, read-only-unless-explicitly-write-granted) this feature's tools must comply with unmodified (REQ-12, INV-02); the file's own header already names Supabase's `execute_sql`/`apply_migration`/`delete_branch` as the concrete threat model this tier was hardened against. |
| `apps/website/src/features/agent-plugins/federate-mcp.ts:185-298,361` | source touchpoint | `provisionAgentPluginMcpServers` default-disabled, empty-allowlist provisioning behavior this feature relies on (REQ-11, behavior.spec.md §3). |
| `apps/website/src/assistant/mcp-federation/adapter.http.ts:18-21` | source touchpoint | Existing code comment explicitly naming `https://mcp.supabase.com/mcp` as a real hosted-transport target, confirming the transport choice in REQ-01. |
| Context7 `/supabase/mcp` docs (`https://github.com/supabase/mcp/blob/main/_autodocs/endpoints.md`, `.../api-reference/create-supabase-mcp-server.md`, `.../api-reference/create-supabase-api-platform.md`) | external reference | Confirms the hosted endpoint URL, its OAuth 2.1 vs. Bearer-PAT auth split between hosted/local deployment modes, the `read_only` and `project_ref` query parameters, and the `SUPABASE_ACCESS_TOKEN` env var used by the (out-of-scope) stdio deployment mode. |
| `ADS-memory/.local-artifacts/owner-worklist.md` §12 item 1 | source touchpoint | Owner's verbatim request this spec implements. |

---

## Validation Notes

- Validator last run: pending — run `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/052-supabase-agent-plugin --phase spec --update-hash` before handoff.
- Validator result: PENDING
- Validator manual waiver: N/A
- Canonical hash verified at: pending
- Notes: This is a brownfield spec — every requirement is additive to existing, already-hardened generic infrastructure (OAuth federation, credential sealing, MCP-UI redemption, trust-tier allowlisting). No new authentication, encryption, or rendering mechanism is introduced.
