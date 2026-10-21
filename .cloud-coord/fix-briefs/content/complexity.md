# Complexity of cloud-agent branches (2026-10-21)

Owner rule: target <=10; 11-15 acceptable as recorded debt; >15 must be refactored.

Scores: cyclomatic (complexity) and cognitive (sonarjs), threshold 10. "Introduced" = new function violation or score up vs base.

## Summary

| label | introduced >10 | introduced >15 | worst | pre-existing |
|---|---|---|---|---|
| J-build-analytics | 0 | 0 | 0 | 0 |
| J-build-comments | 4 | 0 | 14 | 0 |
| J-build-commerce | 0 | 0 | 0 | 0 |
| J-build-commerce2 | 0 | 0 | 0 | 5 |
| J-build-email-dns | 1 | 0 | 11 | 0 |
| J-build-mediagen | 0 | 0 | 0 | 0 |
| J-build-plugins | 0 | 0 | 0 | 0 |
| J-build-storage | 0 | 0 | 0 | 0 |
| J-cov-J1 | 0 | 0 | 0 | 0 |
| J-cov-J2 | 0 | 0 | 0 | 0 |
| J-cov-J3 | 0 | 0 | 0 | 0 |
| T-build-analytics | 0 | 0 | 0 | 0 |
| T-build-comments | 4 | 1 | 16 | 0 |
| T-build-email-dns | 4 | 0 | 11 | 0 |
| T-build-mediagen | 1 | 0 | 11 | 0 |
| T-build-plugins | 1 | 0 | 15 | 0 |
| T-build-storage | 0 | 0 | 0 | 0 |
| T-cov-T1 | 0 | 0 | 0 | 0 |
| T-fix-scheduled | 0 | 0 | 0 | 0 |

## J-build-comments

| repo:path:line | function | cyclomatic | cognitive | vs base |
|---|---|---|---|---|
| jini:packages/agent-plugins/src/lifecycle/update-store.ts:32 | parseJournal | 14 | - | new |
| jini:packages/agent-plugins/src/lifecycle/compatibility.ts:77 | readAgentPluginCompatibilityMetadata | 11 | 12 | new |
| jini:packages/agent-plugins/src/lifecycle/update.ts:53 | updateLocked | 11 | - | new |
| jini:packages/agent-plugins/src/lifecycle/update.ts:169 | reconcilePlugin | 11 | - | new |

## J-build-email-dns

| repo:path:line | function | cyclomatic | cognitive | vs base |
|---|---|---|---|---|
| jini:packages/platform/src/mail/provider.ts:71 | validateMailProvider | 11 | - | new |

## T-build-comments

| repo:path:line | function | cyclomatic | cognitive | vs base |
|---|---|---|---|---|
| tovu:apps/website/src/features/agent-plugins/install-tool.ts:95 | installArchivePlugin | 16 | 15 | new |
| tovu:apps/admin/src/features/plugins/AddAgentPluginPanel.tsx:15 | AddAgentPluginPanel | 13 | 12 | new |
| tovu:apps/website/src/server/inbound/admin-http/routes/agent-plugins/install.ts:66 | <anonymous@66> | 12 | - | new |
| tovu:apps/admin/src/features/plugins/AgentPluginRow.tsx:180 | AgentPluginRow | 11 | - | new |

## T-build-email-dns

| repo:path:line | function | cyclomatic | cognitive | vs base |
|---|---|---|---|---|
| tovu:apps/website/src/features/agent-plugins/mail-adapter-registry.ts:117 | parseMailAdaptersFile | - | 11 | new |
| tovu:apps/website/src/features/domain-dns/dns-changes.ts:95 | resolveTarget | 11 | - | new |
| tovu:apps/website/src/features/newsletter/send-pipeline.ts:520 | handleSendBatchClaimed | - | 11 | new |
| tovu:content/agent-plugins/resend/adapters/resend.mjs:78 | classifyError | 11 | - | new |

## T-build-mediagen

| repo:path:line | function | cyclomatic | cognitive | vs base |
|---|---|---|---|---|
| tovu:apps/website/src/server/runtime/composition/deps.ts:1120 | composeSiteRouteDeps | 11 | - | new |

## T-build-plugins

| repo:path:line | function | cyclomatic | cognitive | vs base |
|---|---|---|---|---|
| tovu:apps/admin/src/features/plugins/AddAgentPluginPanel.tsx:15 | AddAgentPluginPanel | 15 | 14 | new |

## Top 15 worst overall

| label | repo:path:line | function | cyclomatic | cognitive | vs base |
|---|---|---|---|---|---|
| T-build-comments  tovu:apps/website/src/features/agent-plugins/install-tool.ts:95 | installArchivePlugin | 16 | 15 | new |
| T-build-plugins  tovu:apps/admin/src/features/plugins/AddAgentPluginPanel.tsx:15 | AddAgentPluginPanel | 15 | 14 | new |
| J-build-comments  jini:packages/agent-plugins/src/lifecycle/update-store.ts:32 | parseJournal | 14 | - | new |
| T-build-comments  tovu:apps/admin/src/features/plugins/AddAgentPluginPanel.tsx:15 | AddAgentPluginPanel | 13 | 12 | new |
| J-build-comments  jini:packages/agent-plugins/src/lifecycle/compatibility.ts:77 | readAgentPluginCompatibilityMetadata | 11 | 12 | new |
| T-build-comments  tovu:apps/website/src/server/inbound/admin-http/routes/agent-plugins/install.ts:66 | <anonymous@66> | 12 | - | new |
| J-build-comments  jini:packages/agent-plugins/src/lifecycle/update.ts:53 | updateLocked | 11 | - | new |
| J-build-comments  jini:packages/agent-plugins/src/lifecycle/update.ts:169 | reconcilePlugin | 11 | - | new |
| J-build-email-dns  jini:packages/platform/src/mail/provider.ts:71 | validateMailProvider | 11 | - | new |
| T-build-comments  tovu:apps/admin/src/features/plugins/AgentPluginRow.tsx:180 | AgentPluginRow | 11 | - | new |
| T-build-email-dns  tovu:apps/website/src/features/agent-plugins/mail-adapter-registry.ts:117 | parseMailAdaptersFile | - | 11 | new |
| T-build-email-dns  tovu:apps/website/src/features/domain-dns/dns-changes.ts:95 | resolveTarget | 11 | - | new |
| T-build-email-dns  tovu:apps/website/src/features/newsletter/send-pipeline.ts:520 | handleSendBatchClaimed | - | 11 | new |
| T-build-email-dns  tovu:content/agent-plugins/resend/adapters/resend.mjs:78 | classifyError | 11 | - | new |
| T-build-mediagen  tovu:apps/website/src/server/runtime/composition/deps.ts:1120 | composeSiteRouteDeps | 11 | - | new |
