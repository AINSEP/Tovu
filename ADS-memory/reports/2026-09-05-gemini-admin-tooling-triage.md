# Triage: 2026-09-05 Gemini admin-tooling audit — all 37 confirmed findings vs. current tree

STATUS: IN PROGRESS — skeleton committed first with the finding list; per-finding verification being
appended next.

Source: `ADS-memory/reports/2026-09-05-gemini-audit-admin-tooling.md`. That report already ran its own
verification pass against source at audit time; this triage re-verifies each of its 37 numbered
findings against the CURRENT tree, since fix commits have landed since it was written.

## Finding list (37)

1-7: backfill-reset-admin-password.ts / backfill-custom-credential-usernames.ts
8-12: check-governance-adr-scope-drift.ts
13-15: dead-path-sweep.ts
16-17: apps/admin/src/lib (api.ts, resolve-active-tab-id.ts)
18-25: apps/admin/src/features/sites (use-sites.hooks.ts, Sites.tsx, rules.ts)
26-32: apps/admin/src/features/security + settings (use-access-tokens.hooks.ts, use-composio-key-field,
  use-external-mcp.hooks.ts, ExternalMcpSettingsPanel.tsx)
33-37: apps/admin App.tsx / AssistantDock / SlowRunNoticeCard

(Per-finding classification and evidence to follow.)
