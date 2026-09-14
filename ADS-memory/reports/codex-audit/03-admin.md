# Admin source audit

Read-only audit at efc6847ed4490d0f57cd94d16b8cf46a6489a88a; window 4b89cd09..HEAD. Review in progress; coverage is recorded in 03-admin-coverage.json. Only surviving production source is reviewed. Tests, tsc, builds, runtime/browser checks and test certification are explicitly excluded. Findings are source-path confirmations, not runtime observations. No source modifications.

## ADM-001 — Medium — MCP drift comparison omits new connections and removed live admissions

- **Status:** CONFIRMED (source path); required correctness fix, `IMPLEMENTATION_FIX_REQUIRED`.
- **Primary location:** `apps/admin/src/features/settings/external-mcp-admissions-rules.ts:207` and `:180`.
- **Scenario:** The running assistant has an empty admissions snapshot, then the operator saves a new MCP server with an allowed tool. `ExternalMcpSettingsPanel` passes the updated saved roster into `useWiredExternalMcpAdmissions`, but `describeAdmissionDrift` only iterates `snapshot.connections`. The new saved connection has no live entry, so the result is empty and `ExternalMcpAdmissionsBanner:135` returns nothing. The new capability is unavailable in the running assistant, but the detailed drift rows and inline restart button are absent. `SettingsUi.tsx:690-694` does retain a generic footer saying changes apply on restart; this is a gap in the detailed live-versus-saved view, not an absence of all restart text.
- **Sibling scenario:** A live connection has admitted tools `read_a, read_b`, with no refusals. The operator removes `read_b` from the saved allowlist (or removes the connection). `describeConnectionDrift` only computes saved names missing from live, never live names missing from saved, so it again returns `null`. An explicitly removed admission can stay active without appearing in the detailed saved-versus-live warning; the generic footer does not disclose which tools remain live.
- **Evidence:** `ExternalMcpSettingsPanel.tsx:238-239,276-283`; `ExternalMcpSettingsPanel.hooks.tsx:32-36`; rules `:173-190,201-211`; banner `:124-147`. The admission data is described by its producer/consumer contract as frozen at connection/startup; no runtime restart was attempted in this audit.
- **Required change:** Compare the union of saved and live connection IDs and detect both additions and removals. Account for connection enablement and write-grant changes as part of that comparison.

## ADM-002 — Medium — Restart leaves the admissions banner permanently reporting the previous daemon

- **Status:** CONFIRMED (source path); required correctness fix, `IMPLEMENTATION_FIX_REQUIRED`.
- **Primary location:** `apps/admin/src/features/settings/hooks/use-external-mcp-admissions.hooks.ts:89` and `:101-108`.
- **Scenario:** Open the MCP settings with a refused write tool, grant it permission, and click the banner's Restart button. When the restart request is accepted and the new daemon subsequently admits the tool, the hook only sets `outcome`; it never invalidates/refetches `ADMISSIONS_KEY`. The mounted query has no polling and its adapter disables window-focus refetches. Consequently the UI keeps showing the old refusal, an unchecked "may write" checkbox, and "Restarting…" for the rest of the mounted session, even though the tool is available. Likewise an initial 503 remains visible when a daemon starts later.
- **Evidence:** Hook `:56,87-89,101-120`; banner `:40-43,110-111,124-147`; `apps/admin/src/lib/fetch-query/adapter.tanstack.tsx:96-101,161-183,185-204`. Parent review confirmed the daemon returns the report constructed at its startup (`apps/website/src/.../agent-daemon-server.ts`, parent report has the full path).
- **Required change:** Arrange a fresh admissions read when the restarted process can answer, with a bounded retry or an explicit refresh action. An accepted restart must remain distinct from healthy completion, but the displayed live tool list must eventually update.
