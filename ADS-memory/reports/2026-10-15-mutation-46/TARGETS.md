# Mutation-46 target list — 2026-10-15

Risk-ordered Tovu source files for `development/scripts/mutation-sweep.mjs`. Built by mutation-46 (TDD Agent).

- Source set: files changed in the last 30 days (`git log --since=30.days --name-only`), existing, with at least one `if (`/`??` guard, committed and clean at planning time.
- EXCLUDED: every Ownership scope of the 13 `2026-10-15-sweep-fix` Codex shard prompts (s01-s11, j1-j2) plus every file their `out/*.jsonl` edited (land-sweep-46's lane), Shopify, and dirty files. Re-checked before each sweep (also against any `sweep-fix-r*` round).
- Jini files are out: the tool hardcodes the current repo (`git diff` + runner choice), so Jini cannot be targeted.
- Order: T1 security/auth/credential/sandbox, T2 HTTP routes, T3 publish/deploy/mail, T4 data writes, T5 admin hooks, T6 other. Within a tier: not swept on 09-20 first, then most commits in 30 days.
- `tests` = test files whose relative imports resolve to the file (candidates; the sweep passes a chosen explicit subset).

| # | tier | file | commits30 | guards | importing tests | 09-20 |
|---|---|---|---:|---:|---|---|
| 1 | T1 | `apps/admin/src/features/security/security-i18n.ts` | 24 | 4 | rules.unit.test.ts, security-i18n.unit.test.ts, site-key-copy.i18n.unit.test.tsx (+2) |  |
| 2 | T1 | `apps/admin/src/features/security/rules.ts` | 21 | 46 | AccessTokensTab.credential-flows.unit.test.tsx, AccessTokensTab.hooks.unit.test.tsx, OtherCredentialsSection.unit.test.tsx (+3) |  |
| 3 | T1 | `apps/website/src/features/webhooks/site-key-ensure.ts` | 20 | 54 | site-key-ensure.unit.test.ts |  |
| 4 | T1 | `apps/admin/src/features/security/AccessTokensTab.tsx` | 17 | 10 | AccessTokensTab.credential-flows.unit.test.tsx, AccessTokensTab.unit.test.tsx, access-tokens-revoke-copy.unit.test.tsx |  |
| 5 | T1 | `apps/website/src/server/inbound/admin-http/dev-auth.ts` | 14 | 36 | admin-assistant-execution-credential-routes.test.ts, admin-assistant-execution-routes.test.ts, admin-assistant-settings-routes.test.ts (+75) |  |
| 6 | T1 | `apps/website/src/assistant/external-mcp-oauth.ts` | 11 | 48 | external-mcp-aad-writer-sync.test.ts, external-mcp-connection-revocation.test.ts, external-mcp-dcr.test.ts (+2) |  |
| 7 | T1 | `apps/website/src/server/inbound/admin-http/publish-trust-auth.ts` | 10 | 13 | publish-trust-keyless.unit.test.ts |  |
| 8 | T1 | `apps/website/src/features/agent-plugins/import-access-token.ts` | 10 | 13 | apply-tool-renames.unit.test.ts, import-access-token.unit.test.ts, token-sign-in.unit.test.ts |  |
| 9 | T1 | `apps/website/src/features/custom-credentials/credentialed-request.ts` | 10 | 4 | tool-registrations.custom-credentials-egress-refusal.integration.test.ts, auth-failure-diagnostic.unit.test.ts, credentialed-request.unit.test.ts (+2) |  |
| 10 | T1 | `apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts` | 9 | 75 | AccessTokensTab.credential-flows.unit.test.tsx, AccessTokensTab.hooks.unit.test.tsx, AccessTokensTab.unit.test.tsx (+3) |  |
| 11 | T1 | `apps/admin/src/features/security/hooks/use-other-credentials.hooks.ts` | 9 | 26 | AccessTokensTab.credential-flows.unit.test.tsx, AccessTokensTab.hooks.unit.test.tsx, AccessTokensTab.unit.test.tsx (+5) |  |
| 12 | T1 | `apps/admin/src/features/deployment/hooks/use-publish-credentials.hooks.ts` | 9 | 23 | StaticSiteTab.unit.test.tsx, use-publish-credentials-wired.unit.test.tsx, use-publish-credentials.unit.test.tsx |  |
| 13 | T1 | `apps/website/src/features/agent-plugins/access-token-tool.ts` | 9 | 19 | access-token-tool.unit.test.ts |  |
| 14 | T1 | `apps/website/src/features/custom-credentials/write-files-validation.ts` | 8 | 18 | write-files-validation.unit.test.ts |  |
| 15 | T1 | `apps/admin/src/features/security/OtherCredentialsSection.tsx` | 8 | 4 | OtherCredentialsSection.unit.test.tsx |  |
| 16 | T1 | `apps/website/src/features/custom-credentials/store.ts` | 7 | 26 | tool-registrations.custom-credentials-egress-refusal.integration.test.ts, stores.test.ts, auth-failure-diagnostic.unit.test.ts (+15) |  |
| 17 | T1 | `apps/website/src/features/source-control/credential-setup.ts` | 7 | 9 | propose-credential-tool.test.ts |  |
| 18 | T1 | `apps/admin/src/features/security/Security.tsx` | 7 | 1 | Security.unit.test.tsx |  |
| 19 | T1 | `apps/website/src/features/publish-trust/provisioning.ts` | 6 | 28 | publish-agent-tools.test.ts, provisioning.test.ts, revocations.test.ts |  |
| 20 | T1 | `apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts` | 6 | 28 | VisitorCredentialForm.unit.test.tsx, use-visitor-credential-form.unit.test.ts |  |
| 21 | T1 | `apps/website/src/features/webhooks/secret-sealer.aesgcm.ts` | 6 | 1 | byok-credential.test.ts, byok-tool-surface.test.ts, execution-credential-store.test.ts (+50) |  |
| 22 | T1 | `apps/website/src/assistant/execution-credential-store.ts` | 5 | 24 | byok-credential.test.ts, execution-credential-store.test.ts, live-model-cache.test.ts (+1) |  |
| 23 | T1 | `apps/website/src/server/inbound/public-http/routes/publish-trust/handshake.ts` | 5 | 17 | handshake-keyless.unit.test.ts |  |
| 24 | T1 | `apps/website/src/assistant/site-credential-store.ts` | 5 | 17 | site-credential-store.test.ts |  |
| 25 | T1 | `apps/website/src/server/inbound/admin-http/routes/taxonomy/assign-terms.ts` | 5 | 11 | taxonomy-routes.test.ts, taxonomy-trash-routes.test.ts, assign-terms.not-live.test.ts |  |
| 26 | T1 | `apps/website/src/features/publish-trust/handshake-client.ts` | 5 | 9 | handshake-client-keyless.unit.test.ts |  |
| 27 | T1 | `apps/website/src/features/agent-plugins/switch-on-saved-token.ts` | 5 | 9 | switch-on-saved-token.unit.test.ts |  |
| 28 | T1 | `apps/website/src/platform/db/key-dependent-data.ts` | 5 | 5 | key-dependent-data.test.ts |  |
| 29 | T1 | `apps/website/src/server/inbound/public-http/http/site/worker-sandbox.ts` | 5 | 4 | sandbox-timeout-resolution.test.ts, worker-sandbox.test.ts |  |
| 30 | T1 | `apps/website/src/features/publish-trust/connect.ts` | 5 | 4 | grant-backstop.test.ts |  |
| 31 | T1 | `apps/website/src/features/site-export/static-security-headers.ts` | 5 | 1 | static-security-headers.test.ts |  |
| 32 | T1 | `apps/website/src/features/custom-credentials/auth-schemes.ts` | 5 | 1 | auth-schemes.unit.test.ts, credentialed-request.unit.test.ts |  |
| 33 | T1 | `apps/admin/src/features/roles/roles-i18n.ts` | 5 | 1 | Roles.unit.test.tsx, roles-i18n.unit.test.ts, rules.unit.test.ts |  |
| 34 | T1 | `apps/website/src/server/inbound/admin-http/routes/system/site-key.ts` | 4 | 43 | site-key-sources.unit.test.ts, site-key-state.unit.test.ts |  |
| 35 | T1 | `apps/website/src/assistant/tool-approval-policy.ts` | 4 | 23 | mcp-ui-tool-calls-route.static-publish.integration.test.ts, tool-approval-policy.test.ts, tool-registrations.trash-item.test.ts (+1) |  |
| 36 | T1 | `apps/admin/src/features/plugins/composer-capabilities.ts` | 4 | 15 | AssistantDock.hooks.unit.test.tsx, AssistantDock.hooks.unit.test.tsx, composer-capabilities.unit.test.ts (+1) |  |
| 37 | T1 | `apps/website/src/platform/oauth/endpoint-safety.ts` | 4 | 14 | authorization-code.test.ts, dynamic-registration.test.ts, endpoint-safety-adapter.test.ts (+2) |  |
| 38 | T1 | `apps/admin/src/features/roles/hooks/use-roles.hooks.ts` | 4 | 14 | request-volume.measurement.test.tsx, Roles.unit.test.tsx, use-roles.unit.test.tsx |  |
| 39 | T1 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts` | 4 | 13 | oauth-error-mapping.test.ts |  |
| 40 | T1 | `apps/website/src/assistant/external-mcp-reauth-tool.ts` | 4 | 11 | external-mcp-reauth-tool.test.ts, tool-registrations.contracts.test.ts |  |
| 41 | T1 | `apps/website/src/server/inbound/public-http/routes/external-mcp/oauth-callback.ts` | 4 | 7 | oauth-callback.test.ts |  |
| 42 | T1 | `apps/website/src/features/agent-plugins/capability-projection.ts` | 4 | 2 | agent-plugin-pipeline.integration.test.ts, bundled-composio-package.unit.test.ts, bundled-higgsfield-media-package.unit.test.ts (+2) |  |
| 43 | T1 | `apps/website/src/platform/db/repos/oauth-pending-store.ts` | 4 | 1 | sealed-credential-discard.test.ts, sealed-credential-inventory.test.ts, oauth-pending-store.test.ts |  |
| 44 | T1 | `apps/desktop/src/webview-guest-policy.ts` | 4 | 1 | webview-guest-policy.test.ts |  |
| 45 | T1 | `apps/desktop/src/asar-verify.ts` | 4 | 1 | asar-verify.test.ts |  |
| 46 | T1 | `apps/website/src/features/publish-trust/grant.ts` | 3 | 24 | grant-backstop.test.ts, grant.test.ts, handshake.test.ts (+2) |  |
| 47 | T1 | `apps/website/src/features/publish-trust/revocations.ts` | 3 | 22 | revocations.test.ts |  |
| 48 | T1 | `apps/website/src/features/webhooks/secret-scan-guard.ts` | 3 | 21 | secret-scan-guard.test.ts |  |
| 49 | T1 | `apps/admin/src/features/security/SiteKeyTab.tsx` | 3 | 13 | SiteKeyTab.agent-secrecy.unit.test.tsx, SiteKeyTab.unit.test.tsx, site-key-copy.i18n.unit.test.tsx |  |
| 50 | T1 | `apps/website/src/server/inbound/admin-http/routes/users/reset-password.ts` | 3 | 12 | account-protections.test.ts, reset-password.test.ts |  |
| 51 | T1 | `apps/desktop/src/renderer/site-shell-policy.ts` | 3 | 11 | App.hooks.test.ts, shell-bug-fixes.test.ts, site-card-actions-wiring.test.ts (+3) |  |
| 52 | T1 | `apps/admin/src/features/security/hooks/use-site-key.hooks.ts` | 3 | 10 | Security.unit.test.tsx, SiteKeyTab.agent-secrecy.unit.test.tsx, SiteKeyTab.unit.test.tsx (+3) |  |
| 53 | T1 | `apps/admin/src/features/roles/Roles.tsx` | 3 | 10 | Roles.unit.test.tsx |  |
| 54 | T1 | `apps/website/src/contracts/headless/assistant-tool-approval-policy.ts` | 3 | 5 | extension-approval-classification.test.ts, mcp-ui-allowlist-completeness.test.ts, tool-approval-catalog.test.ts (+3) |  |
| 55 | T1 | `apps/admin/src/features/security/hooks/use-site-key-recovery.hooks.ts` | 3 | 5 | SiteKeyRecoveryCard.unit.test.tsx, SiteKeyTab.unit.test.tsx, site-key-copy.i18n.unit.test.tsx (+1) |  |
| 56 | T1 | `apps/website/src/features/site-inspection/site-capabilities.ts` | 3 | 4 | site-capabilities.unit.test.ts, tool-registrations.unit.test.ts |  |
| 57 | T1 | `apps/website/src/server/inbound/public-http/routes/oauth/callback-page.ts` | 3 | 3 | callback-page.test.ts |  |
| 58 | T1 | `apps/desktop/src/site-scan-policy.ts` | 3 | 3 | shared-sites-home.test.ts, site-folders.test.ts |  |
| 59 | T1 | `apps/admin/src/features/roles/rules.ts` | 3 | 3 | rules.unit.test.ts |  |
| 60 | T1 | `apps/website/src/features/taxonomy/collection-term-policy.ts` | 3 | 2 | collection-term-policy.test.ts |  |
| 61 | T1 | `apps/website/src/features/agent-plugins/token-sign-in.ts` | 3 | 2 | new-site-agent-plugin-tokens.unit.test.ts, token-sign-in.unit.test.ts |  |
| 62 | T1 | `apps/admin/src/features/security/hooks/use-security-permissions.hooks.ts` | 3 | 2 | Security.unit.test.tsx, use-security-permissions.unit.test.tsx, security-permissions-dependencies.unit.test.tsx |  |
| 63 | T1 | `apps/website/src/features/webhooks/signing.ts` | 3 | 1 | delivery.test.ts, signing.keyring.test.ts, signing.test.ts |  |
| 64 | T1 | `apps/website/src/features/theme/sync-originals.ts` | 3 | 1 | shipped-site-theme-drift.canary.test.ts, shipped-theme-original-drift.canary.test.ts, sync-originals.test.ts |  |
| 65 | T1 | `apps/website/src/platform/db/vault-credential-inventory.ts` | 2 | 17 | sealed-credential-inventory.test.ts |  |
| 66 | T1 | `apps/admin/src/features/security/hooks/access-tokens-dependencies.hooks.ts` | 2 | 15 | access-tokens-dependencies.unit.test.ts, use-access-tokens.unit.test.tsx |  |
| 67 | T1 | `apps/website/src/server/inbound/admin-http/routes/users/write-policy-permission.ts` | 2 | 11 | backstop.routes.test.ts, write-policy-permission.test.ts |  |
| 68 | T1 | `apps/website/src/server/inbound/admin-http/routes/users/remove-policy-permission.ts` | 2 | 11 | account-protections.test.ts, remove-policy-permission.test.ts |  |
| 69 | T1 | `apps/website/src/server/inbound/admin-http/routes/menus/assign-location.ts` | 2 | 11 | admin-menus-routes.test.ts, assign-location.not-live.test.ts |  |
| 70 | T1 | `apps/desktop/src/agent-plugin-tokens.ts` | 2 | 11 | agent-plugin-tokens.test.ts |  |
| 71 | T1 | `apps/website/src/features/agent-plugins/new-site-agent-plugin-tokens.ts` | 2 | 10 | new-site-agent-plugin-tokens.unit.test.ts |  |
| 72 | T1 | `apps/website/src/server/inbound/admin-http/routes/users/attach-policy.ts` | 2 | 9 | attach-policy.test.ts, owner-protection.test.ts |  |
| 73 | T1 | `apps/website/src/server/inbound/admin-http/routes/users/assign-role.ts` | 2 | 9 | assign-role.test.ts, owner-protection.test.ts |  |
| 74 | T1 | `apps/website/src/features/publish-trust/session.ts` | 2 | 9 | handshake.test.ts |  |
| 75 | T1 | `apps/website/src/assistant/site-credential-store.memory.ts` | 2 | 8 | site-credential-store.test.ts |  |
| 76 | T1 | `apps/website/src/assistant/execution-credential-store.memory.ts` | 2 | 8 | agents.test.ts, byok-credential.test.ts, execution-credential-store.test.ts (+1) |  |
| 77 | T1 | `apps/website/src/platform/db/repos/publish-trust-revocations.ts` | 2 | 7 | publish-trust-revocations.dialects.test.ts |  |
| 78 | T1 | `apps/desktop/src/renderer/use-create-site-plugin-tokens.hooks.ts` | 2 | 7 | CreateWebsiteOnboarding.test.ts, use-create-site-plugin-tokens.hooks.test.ts |  |
| 79 | T1 | `apps/website/src/server/inbound/admin-http/routes/forms/authoring.ts` | 2 | 6 | html-form-authoring.test.ts |  |
| 80 | T1 | `apps/website/src/server/inbound/admin-http/routes/assistant/put-execution-credential.ts` | 2 | 6 | credential-handler-failures.test.ts |  |
| 81 | T1 | `apps/desktop/src/desktop-auth.ts` | 2 | 5 | desktop-auth-streams.test.ts, desktop-auth.test.ts, site-preview-store.test.ts |  |
| 82 | T1 | `apps/website/src/platform/db/repos/gated-mutation-token-repo.ts` | 2 | 4 | gated-mutation-token-repo.test.ts |  |
| 83 | T1 | `apps/admin/src/lib/credential-card-guidance.ts` | 2 | 4 | credential-card-guidance.unit.test.ts |  |
| 84 | T1 | `apps/website/src/server/inbound/admin-http/routes/assistant/get-site-credential.ts` | 2 | 3 | credential-handler-failures.test.ts |  |
| 85 | T1 | `apps/website/src/contracts/headless/assistant-permanent-deletes-policy.ts` | 2 | 3 | _tmp-full-sweep.test.ts, permanent-delete-tool-gate.test.ts, tool-metadata-projections.test.ts (+2) |  |
| 86 | T1 | `apps/website/src/contracts/core/credential-copy.ts` | 2 | 3 | credential-fidelity.unit.test.ts, credential-token.test.ts |  |
| 87 | T1 | `apps/website/src/assistant/credential-chat-intake.ts` | 2 | 3 | credential-chat-intake.unit.test.ts |  |
| 88 | T1 | `apps/admin/src/lib/local-owner-signin.ts` | 2 | 3 | local-owner-signin.unit.test.ts |  |
| 89 | T1 | `apps/admin/src/features/security/hooks/site-key-status.rules.ts` | 2 | 3 | site-key-copy.i18n.unit.test.tsx, site-key-status.rules.unit.test.ts |  |
| 90 | T1 | `apps/website/src/server/inbound/admin-http/routes/assistant/get-execution-credential.ts` | 2 | 2 | credential-handler-failures.test.ts |  |
| 91 | T1 | `apps/admin/src/lib/credential-copy.ts` | 2 | 2 | credential-fidelity.unit.test.ts |  |
| 92 | T1 | `apps/admin/src/features/security/SiteKeyRecoveryCard.tsx` | 2 | 2 | SiteKeyRecoveryCard.unit.test.tsx |  |
| 93 | T1 | `apps/website/src/server/inbound/public-http/middleware/public-page-security-headers.ts` | 2 | 1 | public-page-security-headers.test.ts |  |
| 94 | T1 | `apps/website/src/assistant/external-mcp-tool-approval-adapters.ts` | 2 | 1 | mcp-federation.extra-approval-checks.test.ts, mcp-federation.remembered-approvals.test.ts, tool-registrations.plugins-set-enabled-families.test.ts (+4) |  |
| 95 | T1 | `apps/admin/src/features/webmcp/admin-page-approval.store.ts` | 2 | 1 | admin-page-action-policy.unit.test.ts, admin-page-approval-input.unit.test.ts, admin-page-approval.unit.test.tsx |  |
| 96 | T1 | `apps/admin/src/features/security/CopyKeysDialog.tsx` | 2 | 1 | CopyKeysDialog.unit.test.tsx |  |
| 97 | T1 | `apps/website/src/platform/db/migrations/0012_secrets_vault.ts` | 1 | 32 | secrets-vault-step.test.ts |  |
| 98 | T1 | `apps/website/src/features/custom-credentials/credential-copy-tool.ts` | 1 | 24 | credential-copy-card-frame.unit.test.ts, tool-registrations.contracts.test.ts, credential-copy-tool.test.ts |  |
| 99 | T1 | `apps/website/src/platform/db/vault-credential-recovery.ts` | 1 | 18 | sealed-credential-discard.test.ts |  |
| 100 | T1 | `apps/admin/src/features/security/hooks/other-credentials-dependencies.hooks.ts` | 1 | 16 | CopyKeysDialog.unit.test.tsx, other-credentials-dependencies.unit.test.ts, use-other-credentials.unit.test.tsx (+1) |  |
| 101 | T1 | `apps/website/src/features/source-control/credential-form.ts` | 1 | 15 | credential-form.unit.test.ts |  |
| 102 | T1 | `apps/website/src/features/publish-trust/challenge.ts` | 1 | 14 | handshake.test.ts |  |
| 103 | T1 | `apps/website/src/assistant/external-mcp-vault.ts` | 1 | 12 | external-mcp-aad-writer-sync.test.ts, external-mcp-aad.test.ts, external-mcp-dcr.test.ts (+3) |  |
| 104 | T1 | `apps/website/src/assistant/assistant-vault.ts` | 1 | 11 | execution-credential-store.test.ts, site-credential-store.test.ts |  |
| 105 | T1 | `apps/website/src/server/inbound/assistant/early-run-session.ts` | 1 | 8 | early-run-session.unit.test.ts |  |
| 106 | T1 | `apps/website/src/server/inbound/admin-http/routes/users/update-role.ts` | 1 | 8 | account-protections.test.ts, update-role.test.ts |  |
| 107 | T1 | `apps/website/src/features/custom-credentials/credential-save-tool.ts` | 1 | 8 | tool-registrations.contracts.test.ts, create-agent-tool.unit.test.ts, credential-save-tool.unit.test.ts (+4) |  |
| 108 | T1 | `apps/website/src/server/inbound/admin-http/routes/users/update-policy.ts` | 1 | 7 | update-policy.test.ts |  |
| 109 | T1 | `apps/website/src/server/inbound/admin-http/routes/users/delete-role.ts` | 1 | 7 | account-protections.test.ts, delete-role.test.ts |  |
| 110 | T1 | `apps/website/src/server/inbound/admin-http/routes/users/delete-policy.ts` | 1 | 7 | delete-policy.test.ts |  |
| 111 | T1 | `apps/website/src/server/inbound/admin-http/routes/assistant/stored-credential-probe.ts` | 1 | 7 | stored-credential-probe.admin.test.ts |  |
| 112 | T1 | `apps/admin/src/features/security/hooks/use-copy-keys.hooks.ts` | 1 | 7 | AccessTokensTab.unit.test.tsx, CopyKeysDialog.unit.test.tsx |  |
| 113 | T1 | `apps/website/src/server/inbound/shared/trust-proxy.ts` | 1 | 6 | trust-proxy.test.ts |  |
| 114 | T1 | `apps/website/src/server/inbound/admin-http/routes/users/create-policy.ts` | 1 | 6 | create-policy.test.ts |  |
| 115 | T1 | `apps/desktop/src/project-delete-guard.ts` | 1 | 6 | project-delete-guard.test.ts |  |
| 116 | T1 | `apps/website/src/server/inbound/admin-http/routes/users/create-role.ts` | 1 | 5 | create-role.test.ts |  |
| 117 | T1 | `apps/admin/src/features/deployment/hooks/publish-credentials-dependencies.hooks.ts` | 1 | 5 | StaticSiteTab.unit.test.tsx, publish-credentials-dependencies.unit.test.ts, use-publish-credentials.unit.test.tsx |  |
| 118 | T1 | `apps/website/src/server/inbound/admin-http/routes/api-keys/deps.ts` | 1 | 4 | deps.test.ts, handler-failures.test.ts |  |
| 119 | T1 | `apps/admin/src/lib/stored-credential-endpoint.ts` | 1 | 4 | stored-credential-endpoint.unit.test.ts |  |
| 120 | T1 | `apps/admin/src/features/security/AccessTokensTab.hooks.tsx` | 1 | 4 | AccessTokensTab.hooks.unit.test.tsx |  |
| 121 | T1 | `apps/website/src/server/inbound/admin-http/routes/assistant/delete-site-credential.ts` | 1 | 3 | credential-handler-failures.test.ts |  |
| 122 | T1 | `apps/website/src/contracts/core/native-approval-memory.ts` | 1 | 3 | tool-registrations.plugins-set-enabled-families.test.ts, native-approval-memory.test.ts, settings-write-tools.test.ts |  |
| 123 | T1 | `apps/website/src/assistant/site/capability-registry.ts` | 1 | 3 | capability-registry.test.ts |  |
| 124 | T1 | `apps/website/src/server/inbound/admin-http/routes/assistant/delete-execution-credential.ts` | 1 | 2 | credential-handler-failures.test.ts |  |
| 125 | T1 | `apps/website/src/features/theme/token-aliases.ts` | 1 | 2 | token-aliases.test.ts |  |
| 126 | T1 | `apps/website/src/contracts/core/gated-mutations/token.ts` | 1 | 2 | tool-registrations.taxonomy.test.ts, gateway.unit.test.ts, token.unit.test.ts (+4) |  |
| 127 | T1 | `apps/desktop/src/site-name-policy.ts` | 1 | 2 | site-name-policy.test.ts |  |
| 128 | T1 | `apps/admin/src/features/posts/post-editor-route-key.ts` | 1 | 2 | post-editor-route-key.unit.test.ts |  |
| 129 | T1 | `apps/website/src/server/inbound/admin-http/http/api-keys.ts` | 1 | 1 | response-projections.test.ts |  |
| 130 | T1 | `apps/website/src/server/http/request-cookie.ts` | 1 | 1 | request-cookie.unit.test.ts |  |
| 131 | T1 | `apps/website/src/contracts/core/approval-i18n.ts` | 1 | 1 | tool-approval-policy.test.ts |  |
| 132 | T1 | `apps/admin/src/lib/boot-token-fragment.ts` | 1 | 1 | boot-token-fragment.unit.test.ts |  |
| 133 | T1 | `apps/admin/src/features/forms/forms-leave-guard-i18n.ts` | 1 | 1 | forms-leave-guard-i18n.unit.test.ts |  |
| 134 | T1 | `apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts` | 12 | 17 | NONE |  |
| 135 | T1 | `apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts` | 8 | 15 | NONE |  |
| 136 | T1 | `apps/website/src/platform/db/repos/origin-repo.ts` | 3 | 12 | NONE |  |
| 137 | T1 | `apps/website/src/features/custom-credentials/vault-repo.ts` | 2 | 15 | NONE |  |
| 138 | T1 | `apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts` | 2 | 13 | NONE |  |
| 139 | T1 | `apps/website/src/server/inbound/admin-http/routes/assistant/put-site-credential.ts` | 2 | 7 | NONE |  |
| 140 | T1 | `apps/admin/src/features/ai-assistant/hooks/use-assistant-owner-grant.hooks.ts` | 2 | 7 | NONE |  |
| 141 | T1 | `apps/website/src/server/inbound/admin-http/routes/system/assistant-owner-grant.ts` | 2 | 4 | NONE |  |
| 142 | T1 | `apps/website/src/features/custom-credentials/credential-recovery.ts` | 2 | 2 | NONE |  |
| 143 | T1 | `apps/website/src/features/custom-credentials/custom-credential-create-ui.ts` | 2 | 1 | NONE |  |
| 144 | T1 | `apps/website/src/server/inbound/admin-http/routes/system/credential-copy.ts` | 1 | 12 | NONE |  |
| 145 | T1 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/tool-approvals.ts` | 1 | 7 | NONE |  |
| 146 | T1 | `apps/website/src/features/theme/verify-active-theme.ts` | 1 | 2 | NONE |  |
| 147 | T1 | `apps/website/src/features/theme/save-theme-original.ts` | 1 | 2 | NONE |  |
| 148 | T1 | `apps/website/src/contracts/core/chat-delete-grant.ts` | 1 | 2 | NONE |  |
| 149 | T1 | `apps/website/src/contracts/core/agent-permission-mode.ts` | 1 | 2 | NONE |  |
| 150 | T1 | `apps/admin/src/features/webmcp/admin-page-approval.hooks.ts` | 1 | 1 | NONE |  |
| 151 | T1 | `apps/website/src/features/origin/configured-origin.ts` | 3 | 5 | configured-origin.test.ts | yes |
| 152 | T1 | `apps/website/src/features/publish-trust/keys.ts` | 3 | 3 | handshake.test.ts, keys-fail-closed-guard.unit.test.ts, keys.test.ts | yes |
| 153 | T1 | `apps/website/src/features/publish-trust/provisioning.node-io.ts` | 3 | 1 | provisioning.node-io.test.ts | yes |
| 154 | T1 | `apps/website/src/server/inbound/admin-http/authorize-guard.ts` | 1 | 1 | authorize-guard.test.ts | yes |
| 155 | T2 | `apps/website/src/server/inbound/public-http/http/site/render.ts` | 39 | 172 | all-fields-demo-fixture.test.ts, common-fields.test.ts, forms-submit.test.ts (+26) |  |
| 156 | T2 | `apps/website/src/server/inbound/public-http/routes/site/pages.ts` | 37 | 117 | admin-post-template-preview.test.ts, bare-page-site-serving.test.ts, media-site-serving.test.ts (+19) |  |
| 157 | T2 | `apps/website/src/server/inbound/assistant/assistant-system-overlay.ts` | 13 | 1 | credential-guidance.unit.test.ts, agent-daemon-server.tool-restriction-wiring.unit.test.ts, assistant-system-overlay.unit.test.ts |  |
| 158 | T2 | `apps/website/src/server/inbound/public-http/http/site/form-render.ts` | 11 | 26 | common-fields.test.ts, form-attempt-token.unit.test.ts, form-field-types-style.unit.test.ts (+3) |  |
| 159 | T2 | `apps/website/src/server/inbound/admin-http/routes/themes/explore.ts` | 9 | 65 | preview-refresh.test.ts, explore-access-and-not-found.test.ts, explore-built-theme-gate.test.ts (+20) |  |
| 160 | T2 | `apps/website/src/server/inbound/public-http/routes/site/products.ts` | 9 | 6 | request-cost-cacheability.measurement.test.ts, request-cost-render-work.measurement.test.ts, commerce-strip-parity.test.ts (+1) |  |
| 161 | T2 | `apps/website/src/server/inbound/admin-http/routes/system/deployment-overview.ts` | 9 | 5 | deployment-overview-site-key-row.test.ts |  |
| 162 | T2 | `apps/website/src/server/inbound/admin-http/routes/agent-plugins/set-enabled.ts` | 8 | 14 | agent-plugin-set-enabled-busy.integration.test.ts, agent-plugin-set-enabled.integration.test.ts |  |
| 163 | T2 | `apps/website/src/server/inbound/admin-http/http/widgets.ts` | 6 | 5 | widgets-error-code-parity.test.ts, plugin-hook-error.test.ts |  |
| 164 | T2 | `apps/website/src/server/inbound/public-http/routes/site/store.ts` | 6 | 4 | request-cost-cacheability.measurement.test.ts, store-return-query.test.ts, store.route.test.ts |  |
| 165 | T2 | `apps/website/src/server/inbound/assistant/plugin-prompt-prefix.ts` | 6 | 2 | capability-manifest-prefix.unit.test.ts, plugin-prompt-prefix.unit.test.ts |  |
| 166 | T2 | `apps/website/src/server/inbound/admin-http/routes/menus/update-tree.ts` | 5 | 15 | admin-menu-page-roundtrip.test.ts, admin-menus-routes.test.ts, menu-html-mode.test.ts (+1) |  |
| 167 | T2 | `apps/website/src/server/inbound/public-http/middleware/theme-static-assets.ts` | 5 | 11 | theme-preview-refresh.test.ts, theme-static-assets.test.ts |  |
| 168 | T2 | `apps/website/src/server/inbound/admin-http/routes/presentation/get.ts` | 5 | 5 | get.test.ts |  |
| 169 | T2 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/probe.ts` | 5 | 4 | admin-external-mcp-probe-routes.test.ts |  |
| 170 | T2 | `apps/website/src/server/inbound/assistant/durable-run-routes.ts` | 4 | 20 | agent-daemon-server.durable-binding.unit.test.ts, durable-run-routes.unit.test.ts |  |
| 171 | T2 | `apps/website/src/server/inbound/admin-http/routes/settings/events.ts` | 4 | 15 | settings-events-id-disclosure.test.ts, settings-events-resume.test.ts, preview-feed-access.test.ts |  |
| 172 | T2 | `apps/website/src/server/inbound/admin-http/routes/agent-plugins/install.ts` | 4 | 15 | agent-plugin-install-zip.integration.test.ts |  |
| 173 | T2 | `apps/website/src/server/inbound/admin-http/routes/users/update.ts` | 4 | 14 | account-protections.test.ts, create.test.ts, owner-protection.test.ts (+1) |  |
| 174 | T2 | `apps/website/src/server/inbound/admin-http/routes/seo/put-entry.ts` | 4 | 10 | seo-site-serving.test.ts, put-entry.test.ts |  |
| 175 | T2 | `apps/website/src/server/inbound/admin-http/routes/assistant/test-agent.ts` | 4 | 10 | test-agent-mock-module.test.ts |  |
| 176 | T2 | `apps/website/src/server/inbound/admin-http/routes/settings/shared.ts` | 4 | 9 | assistant-byok-routes.test.ts, shared.unit.test.ts |  |
| 177 | T2 | `apps/website/src/server/inbound/admin-http/routes/assistant/list-models.ts` | 4 | 9 | connection-probe-ssrf.test.ts |  |
| 178 | T2 | `apps/website/src/server/inbound/admin-http/routes/presentation/patch-active-theme.ts` | 4 | 8 | preview-refresh.test.ts, patch-active-theme.test.ts |  |
| 179 | T2 | `apps/website/src/server/inbound/admin-http/routes/assistant/test-connection.ts` | 4 | 8 | connection-probe-ssrf.test.ts |  |
| 180 | T2 | `apps/website/src/server/inbound/admin-http/http/forms.ts` | 4 | 7 | forms-response.test.ts |  |
| 181 | T2 | `apps/website/src/server/inbound/admin-http/routes/assistant/detect-agents.ts` | 4 | 5 | detect-agents-projection.test.ts, detect-agents-route.test.ts |  |
| 182 | T2 | `apps/website/src/server/inbound/admin-http/routes/agent-plugins/files.ts` | 4 | 5 | agent-plugin-files.integration.test.ts, agent-plugin-memory.integration.test.ts |  |
| 183 | T2 | `apps/website/src/server/inbound/admin-http/routes/users/list.ts` | 4 | 4 | account-protections.test.ts, create.test.ts, list.test.ts |  |
| 184 | T2 | `apps/website/src/server/inbound/admin-http/http/media.ts` | 4 | 4 | response-projections.test.ts |  |
| 185 | T2 | `apps/website/src/server/inbound/admin-http/http/plugin-hook-error.ts` | 4 | 2 | plugin-hook-error.test.ts |  |
| 186 | T2 | `apps/website/src/server/inbound/admin-http/routes/sites/sites-home.ts` | 3 | 17 | shared-sites-home.unit.test.ts, sites-config.unit.test.ts, sites-home.unit.test.ts |  |
| 187 | T2 | `apps/website/src/server/inbound/admin-http/routes/forms/update.ts` | 3 | 13 | forms-admin-crud.test.ts, forms-auth.test.ts |  |
| 188 | T2 | `apps/website/src/server/inbound/admin-http/routes/users/create.ts` | 3 | 12 | create.test.ts, owner-protection.test.ts |  |
| 189 | T2 | `apps/website/src/server/inbound/admin-http/routes/fs-files/custom-root.ts` | 3 | 12 | custom-root-permission.test.ts, custom-root.test.ts |  |
| 190 | T2 | `apps/website/src/server/inbound/admin-http/routes/content-types/update-fields.ts` | 3 | 11 | content-types-field-shape.test.ts, content-types-routes.test.ts, register-update-fields.conflict.test.ts |  |
| 191 | T2 | `apps/website/src/server/inbound/admin-http/routes/users/enable.ts` | 3 | 10 | account-protections.test.ts, create.test.ts, enable.test.ts (+1) |  |
| 192 | T2 | `apps/website/src/server/inbound/public-http/http/site/bare-page.ts` | 3 | 9 | bare-page.unit.test.ts |  |
| 193 | T2 | `apps/website/src/server/inbound/admin-http/routes/users/delete.ts` | 3 | 9 | account-protections.test.ts, delete.test.ts |  |
| 194 | T2 | `apps/website/src/server/inbound/admin-http/routes/content-types/register.ts` | 3 | 9 | content-types-field-shape.test.ts, content-types-lifecycle-gap-fill.test.ts, content-types-routes.test.ts (+2) |  |
| 195 | T2 | `apps/website/src/server/inbound/admin-http/routes/agent-plugins/list.ts` | 3 | 9 | agent-plugins-http.integration.test.ts |  |
| 196 | T2 | `apps/website/src/assistant/a2ui-actions-route.ts` | 3 | 9 | a2ui-actions-route.test.ts |  |
| 197 | T2 | `apps/website/src/server/inbound/public-http/middleware/theme-preview-refresh.ts` | 3 | 8 | theme-preview-refresh.test.ts |  |
| 198 | T2 | `apps/website/src/server/inbound/admin-http/routes/forms/create.ts` | 3 | 7 | forms-admin-crud.test.ts, forms-auth.test.ts, forms-list-submissions-and-get-by-id-edge-cases.test.ts (+2) |  |
| 199 | T2 | `apps/website/src/server/inbound/public-http/routes/site/analytics-ingest.ts` | 3 | 6 | analytics-ingest.test.ts, analytics-ingest.test.ts |  |
| 200 | T2 | `apps/website/src/server/inbound/admin-http/routes/comments/moderation-queue.ts` | 3 | 6 | moderation-queue.test.ts |  |
| 201 | T2 | `apps/website/src/server/inbound/admin-http/routes/seo/put-settings.ts` | 3 | 5 | put-settings.test.ts |  |
| 202 | T2 | `apps/website/src/server/inbound/admin-http/routes/agent-plugins/memory.ts` | 3 | 5 | agent-plugin-memory.integration.test.ts |  |
| 203 | T2 | `apps/website/src/server/inbound/admin-http/routes/analytics/recent-hits.ts` | 3 | 4 | analytics-recent-hits.test.ts |  |
| 204 | T2 | `apps/website/src/server/inbound/shared/observability-middleware.ts` | 3 | 1 | observability-middleware.test.ts, request-id.test.ts |  |
| 205 | T2 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/list.ts` | 3 | 1 | built-in-connection.test.ts |  |
| 206 | T2 | `apps/website/src/server/inbound/admin-http/routes/widgets/agent-tools.ts` | 2 | 26 | library.unit.test.ts |  |
| 207 | T2 | `apps/website/src/server/inbound/admin-http/routes/sites/local-sites.ts` | 2 | 15 | local-sites.unit.test.ts |  |
| 208 | T2 | `apps/website/src/server/inbound/admin-http/routes/recovery/restore.ts` | 2 | 11 | recovery-restore-routes.test.ts |  |
| 209 | T2 | `apps/website/src/server/inbound/admin-http/routes/users/disable.ts` | 2 | 10 | account-protections.test.ts, create.test.ts, disable.test.ts |  |
| 210 | T2 | `apps/website/src/server/inbound/admin-http/routes/settings/register-definitions.ts` | 2 | 10 | settings-auth.test.ts, settings-principal-check.test.ts, settings-read-scoping.test.ts (+6) |  |
| 211 | T2 | `apps/website/src/server/inbound/public-http/http/shared/post.ts` | 2 | 9 | post.test.ts |  |
| 212 | T2 | `apps/website/src/server/inbound/admin-http/routes/widgets/region-mutate-placements.ts` | 2 | 9 | library.unit.test.ts |  |
| 213 | T2 | `apps/website/src/server/inbound/admin-http/routes/entries/lifecycle.ts` | 2 | 9 | entries-routes.test.ts |  |
| 214 | T2 | `apps/website/src/server/inbound/admin-http/routes/content-types/lifecycle.ts` | 2 | 9 | content-types-lifecycle-gap-fill.test.ts, content-types-routes.test.ts, entries-routes.test.ts |  |
| 215 | T2 | `apps/website/src/server/inbound/public-http/http/site/external-links.ts` | 2 | 8 | external-links.test.ts |  |
| 216 | T2 | `apps/website/src/server/inbound/admin-http/routes/forms/list-submissions.ts` | 2 | 8 | forms-auth.test.ts, forms-list-submissions-and-get-by-id-edge-cases.test.ts, forms-submissions.test.ts |  |
| 217 | T2 | `apps/website/src/server/inbound/admin-http/routes/forms/delete-submission.ts` | 2 | 8 | forms-auth.test.ts, forms-submissions.test.ts |  |
| 218 | T2 | `apps/website/src/server/inbound/admin-http/routes/settings/set.ts` | 2 | 6 | settings-auth.test.ts, settings-principal-check.test.ts, settings-read-scoping.test.ts (+6) |  |
| 219 | T2 | `apps/website/src/server/inbound/admin-http/routes/settings/get-raw.ts` | 2 | 6 | settings-auth.test.ts, settings-read-scoping.test.ts, json-route-parity.unit.test.ts |  |
| 220 | T2 | `apps/website/src/server/inbound/admin-http/routes/settings/clear.ts` | 2 | 6 | settings-auth.test.ts, settings-principal-check.test.ts, settings-workspace-scoping.test.ts (+3) |  |
| 221 | T2 | `apps/website/src/server/inbound/admin-http/routes/widgets/update.ts` | 2 | 5 | update.unit.test.ts |  |
| 222 | T2 | `apps/website/src/server/inbound/admin-http/routes/settings/reset.ts` | 2 | 5 | settings-auth.test.ts, settings-workspace-scoping.test.ts, json-route-parity.unit.test.ts (+2) |  |
| 223 | T2 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/delete.ts` | 2 | 5 | built-in-connection.test.ts |  |
| 224 | T2 | `apps/website/src/server/inbound/admin-http/admin-static.ts` | 2 | 5 | admin-dev-proxy.test.ts |  |
| 225 | T2 | `apps/website/src/server/inbound/shared/json-body-parsers.ts` | 2 | 4 | contribution-runtime.integration.test.ts, visitor-assistant-safety.integration.test.ts, plugin-contributions.auth.test.ts (+1) |  |
| 226 | T2 | `apps/website/src/server/inbound/admin-http/routes/widgets/embed-insert.ts` | 2 | 4 | embed-insert.unit.test.ts |  |
| 227 | T2 | `apps/website/src/server/inbound/admin-http/routes/settings/get-effective.ts` | 2 | 4 | settings-auth.test.ts, settings-principal-check.test.ts, settings-read-scoping.test.ts (+2) |  |
| 228 | T2 | `apps/website/src/server/inbound/public-http/http/site/liquid-render.ts` | 2 | 3 | liquid-render.unit.test.ts, render-featured-image.unit.test.ts |  |
| 229 | T2 | `apps/website/src/server/inbound/admin-http/routes/themes/list.ts` | 2 | 3 | b07-admin-read-gaps.test.ts, list.test.ts |  |
| 230 | T2 | `apps/website/src/server/inbound/public-http/http/site/handlebars-render.ts` | 2 | 2 | handlebars-render.unit.test.ts, render-featured-image.unit.test.ts |  |
| 231 | T2 | `apps/website/src/server/inbound/admin-http/routes/widgets/list.ts` | 2 | 2 | b07-admin-read-gaps.test.ts, library.unit.test.ts |  |
| 232 | T2 | `apps/website/src/server/inbound/admin-http/routes/assistant/get-chat-attachment.ts` | 2 | 2 | get-chat-attachment-failure.test.ts |  |
| 233 | T2 | `apps/website/src/server/inbound/public-http/routes/site/comments-submit.ts` | 2 | 1 | comments-submit.test.ts |  |
| 234 | T2 | `apps/website/src/server/inbound/admin-http/routes/redirects/shared.ts` | 2 | 1 | shared.test.ts |  |
| 235 | T2 | `apps/website/src/server/inbound/admin-http/http/menus.ts` | 2 | 1 | admin-menus-routes.test.ts |  |
| 236 | T2 | `apps/website/src/server/inbound/public-http/routes/plugin-contributions.ts` | 1 | 12 | contribution-runtime.integration.test.ts, plugin-contributions.auth.test.ts |  |
| 237 | T2 | `apps/website/src/server/inbound/admin-http/routes/themes/preview.ts` | 1 | 12 | preview-route.test.ts |  |
| 238 | T2 | `apps/website/src/server/inbound/admin-http/routes/menus/create.ts` | 1 | 11 | admin-menus-routes.test.ts, menu-html-mode.test.ts |  |
| 239 | T2 | `apps/website/src/server/inbound/admin-http/routes/entries/create.ts` | 1 | 11 | entries-routes.test.ts |  |
| 240 | T2 | `apps/website/src/server/inbound/admin-http/routes/comments/moderate.ts` | 1 | 11 | moderate.test.ts |  |
| 241 | T2 | `apps/website/src/server/inbound/admin-http/admin-dev-proxy.ts` | 1 | 11 | admin-dev-proxy-path.unit.test.ts, admin-dev-proxy.test.ts |  |
| 242 | T2 | `apps/website/src/server/inbound/admin-http/routes/widgets/preview.ts` | 1 | 10 | preview.unit.test.ts |  |
| 243 | T2 | `apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts` | 1 | 10 | taxonomy-merge-term-routes.test.ts |  |
| 244 | T2 | `apps/website/src/server/inbound/admin-http/routes/change-sets/revert.ts` | 1 | 10 | change-sets-revert.test.ts |  |
| 245 | T2 | `apps/website/src/server/inbound/admin-http/routes/sites/site-previews.ts` | 1 | 9 | site-previews.unit.test.ts |  |
| 246 | T2 | `apps/website/src/server/inbound/admin-http/routes/entries/update.ts` | 1 | 9 | entries-routes.test.ts |  |
| 247 | T2 | `apps/website/src/server/inbound/admin-http/routes/database/restore-points.ts` | 1 | 9 | database-restore-points-routes.test.ts, recovery-routes.test.ts |  |
| 248 | T2 | `apps/website/src/server/inbound/admin-http/routes/workspace/delete.ts` | 1 | 8 | workspace-routes.test.ts |  |
| 249 | T2 | `apps/website/src/server/inbound/admin-http/routes/themes/duplicate.ts` | 1 | 8 | duplicate-route.test.ts |  |
| 250 | T2 | `apps/website/src/server/inbound/admin-http/routes/redirects/create.ts` | 1 | 8 | redirects-auth.test.ts, redirects-create.test.ts, redirects-site-serving.test.ts |  |
| 251 | T2 | `apps/website/src/server/inbound/public-http/routes/site/forms-multipart.ts` | 1 | 7 | common-fields.test.ts |  |
| 252 | T2 | `apps/website/src/server/inbound/public-http/http/site/form-validation-message.ts` | 1 | 7 | form-validation-message.unit.test.ts |  |
| 253 | T2 | `apps/website/src/server/inbound/admin-http/routes/widgets/region-get.ts` | 1 | 7 | b07-admin-read-gaps.test.ts, library.unit.test.ts |  |
| 254 | T2 | `apps/website/src/server/inbound/admin-http/routes/settings/assistant-subagents-access.ts` | 1 | 7 | assistant-subagents.test.ts |  |
| 255 | T2 | `apps/website/src/server/inbound/admin-http/routes/newsletter/send-test-campaign.ts` | 1 | 7 | send-test-campaign.test.ts |  |
| 256 | T2 | `apps/website/src/server/inbound/admin-http/routes/newsletter/create-campaign.ts` | 1 | 7 | create-campaign.test.ts |  |
| 257 | T2 | `apps/website/src/server/inbound/assistant/run-log-lines.ts` | 1 | 6 | run-log-lines.unit.test.ts |  |
| 258 | T2 | `apps/website/src/server/inbound/admin-http/routes/seo/get-entry.ts` | 1 | 6 | seo-site-serving.test.ts, get-entry.test.ts |  |
| 259 | T2 | `apps/website/src/server/inbound/admin-http/routes/menus/get-by-id.ts` | 1 | 6 | admin-menus-routes.test.ts |  |
| 260 | T2 | `apps/website/src/server/inbound/admin-http/routes/menus/delete.ts` | 1 | 6 | admin-menus-routes.test.ts |  |
| 261 | T2 | `apps/website/src/server/inbound/admin-http/routes/integrations/deliveries.ts` | 1 | 6 | admin-integrations-routes.test.ts |  |
| 262 | T2 | `apps/website/src/server/inbound/admin-http/routes/integrations/create.ts` | 1 | 6 | admin-integrations-routes.test.ts, create.test.ts |  |
| 263 | T2 | `apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts` | 1 | 5 | content-post-get-by-slug.test.ts |  |
| 264 | T2 | `apps/website/src/server/inbound/public-http/http/site/site-chat-markup.ts` | 1 | 5 | site-chat-markup.test.ts |  |
| 265 | T2 | `apps/website/src/server/inbound/admin-http/routes/workspace/create.ts` | 1 | 5 | create.test.ts |  |
| 266 | T2 | `apps/website/src/server/inbound/admin-http/routes/widgets/region-bind.ts` | 1 | 5 | region-bind.unit.test.ts |  |
| 267 | T2 | `apps/website/src/server/inbound/admin-http/routes/widgets/create.ts` | 1 | 5 | b07-widget-create-gaps.test.ts, library.unit.test.ts |  |
| 268 | T2 | `apps/website/src/server/inbound/admin-http/routes/taxonomy/create-term.ts` | 1 | 5 | taxonomy-merge-term-routes.test.ts, taxonomy-routes.test.ts, taxonomy-trash-routes.test.ts |  |
| 269 | T2 | `apps/website/src/server/inbound/admin-http/routes/seo/get-entry-analyze.ts` | 1 | 5 | get-entry-analyze.test.ts |  |
| 270 | T2 | `apps/website/src/server/inbound/admin-http/routes/redirects/update.ts` | 1 | 5 | redirects-auth.test.ts, redirects-site-serving.test.ts |  |
| 271 | T2 | `apps/website/src/server/inbound/admin-http/routes/redirects/tombstone.ts` | 1 | 5 | redirects-auth.test.ts |  |
| 272 | T2 | `apps/website/src/server/inbound/admin-http/routes/assistant/put-settings.ts` | 1 | 5 | credential-handler-failures.test.ts |  |
| 273 | T2 | `apps/website/src/server/inbound/public-http/routes/site/chat-comparison.ts` | 1 | 4 | site-chat-comparison-routes.test.ts |  |
| 274 | T2 | `apps/website/src/server/inbound/admin-http/routes/workspace/get.ts` | 1 | 4 | b07-workspace-handler-gaps.test.ts, read-update.test.ts |  |
| 275 | T2 | `apps/website/src/server/inbound/admin-http/routes/taxonomy/rename-term.ts` | 1 | 4 | taxonomy-routes.test.ts |  |
| 276 | T2 | `apps/website/src/server/inbound/admin-http/routes/taxonomy/delete-term.ts` | 1 | 4 | taxonomy-routes.test.ts, taxonomy-trash-routes.test.ts |  |
| 277 | T2 | `apps/website/src/server/inbound/admin-http/routes/redirects/import.ts` | 1 | 4 | redirects-auth.test.ts |  |
| 278 | T2 | `apps/website/src/server/inbound/admin-http/routes/commerce/status.ts` | 1 | 4 | route-async-guards.test.ts, commerce-status-adapter.integration.test.ts |  |
| 279 | T2 | `apps/website/src/server/inbound/public-http/middleware/site-serving-gate.ts` | 1 | 3 | site-serving-gate.test.ts, async-error-forwarding.unit.test.ts |  |
| 280 | T2 | `apps/website/src/server/inbound/public-http/middleware/published-webmcp.ts` | 1 | 3 | published-webmcp.test.ts |  |
| 281 | T2 | `apps/website/src/server/inbound/assistant/chat-attachment-directory.ts` | 1 | 3 | site-path-resolvers.unit.test.ts |  |
| 282 | T2 | `apps/website/src/server/inbound/admin-http/routes/widgets/regions-list.ts` | 1 | 3 | library.unit.test.ts |  |
| 283 | T2 | `apps/website/src/server/inbound/admin-http/routes/taxonomy/delete-taxonomy.ts` | 1 | 3 | taxonomy-routes.test.ts, taxonomy-trash-routes.test.ts |  |
| 284 | T2 | `apps/website/src/server/inbound/admin-http/routes/seo/post-sitemap-regenerate.ts` | 1 | 3 | post-sitemap-regenerate.test.ts |  |
| 285 | T2 | `apps/website/src/server/inbound/admin-http/routes/presentation/rescan-themes.ts` | 1 | 3 | rescan-themes.test.ts |  |
| 286 | T2 | `apps/admin/src/lib/router.ts` | 1 | 3 | MenuEditor.unit.test.tsx, Pages.unit.test.tsx, agent-pages.unit.test.ts (+1) |  |
| 287 | T2 | `apps/website/src/server/inbound/public-http/routes/site/robots.ts` | 1 | 2 | robots.route.test.ts |  |
| 288 | T2 | `apps/website/src/server/inbound/public-http/http/site/form-validation-i18n.ts` | 1 | 2 | form-validation-friendly.test.ts |  |
| 289 | T2 | `apps/website/src/server/inbound/admin-http/routes/widgets/preview-render.ts` | 1 | 2 | preview.unit.test.ts |  |
| 290 | T2 | `apps/website/src/server/inbound/admin-http/routes/widgets/get-by-id.ts` | 1 | 2 | b07-admin-read-gaps.test.ts, b07-widget-create-gaps.test.ts, library.unit.test.ts |  |
| 291 | T2 | `apps/website/src/server/inbound/admin-http/http/newsletter.ts` | 1 | 2 | newsletter-errors.test.ts |  |
| 292 | T2 | `apps/website/src/server/inbound/assistant/attempt-process-identity.ts` | 1 | 1 | early-run-session.unit.test.ts |  |
| 293 | T2 | `apps/website/src/server/inbound/admin-http/routes/workspace/list.ts` | 1 | 1 | b07-workspace-handler-gaps.test.ts, read-update.test.ts |  |
| 294 | T2 | `apps/website/src/server/inbound/admin-http/routes/system/assistant-permanent-deletes.ts` | 1 | 1 | assistant-permanent-deletes.test.ts |  |
| 295 | T2 | `apps/website/src/server/inbound/admin-http/routes/recovery/status.ts` | 1 | 1 | recovery-routes.test.ts |  |
| 296 | T2 | `apps/website/src/server/inbound/admin-http/routes/forms/resolve-definition.ts` | 1 | 1 | resolve-definition.test.ts |  |
| 297 | T2 | `apps/website/src/server/inbound/admin-http/routes/entries/list.ts` | 1 | 1 | entries-routes.test.ts |  |
| 298 | T2 | `apps/website/src/server/inbound/admin-http/routes/database/timeline.ts` | 1 | 1 | admin-database-timeline-route.test.ts |  |
| 299 | T2 | `apps/website/src/server/inbound/admin-http/http/entity-not-live.ts` | 1 | 1 | entity-not-live.test.ts |  |
| 300 | T2 | `apps/website/src/server/inbound/admin-http/routes/pages/update.ts` | 9 | 17 | NONE |  |
| 301 | T2 | `apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts` | 8 | 29 | NONE |  |
| 302 | T2 | `apps/website/src/server/inbound/admin-http/routes/pages/update-html.ts` | 5 | 10 | NONE |  |
| 303 | T2 | `apps/website/src/server/inbound/admin-http/routes/pages/delete.ts` | 5 | 9 | NONE |  |
| 304 | T2 | `apps/website/src/server/inbound/admin-http/routes/pages/create.ts` | 3 | 8 | NONE |  |
| 305 | T2 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/put.ts` | 3 | 6 | NONE |  |
| 306 | T2 | `apps/website/src/server/inbound/public-http/http/site/handlebars-worker.ts` | 3 | 2 | NONE |  |
| 307 | T2 | `apps/website/src/server/inbound/public-http/http/site/liquid-worker.ts` | 3 | 1 | NONE |  |
| 308 | T2 | `apps/website/src/server/inbound/admin-http/routes/system/export-site.ts` | 2 | 14 | NONE |  |
| 309 | T2 | `apps/website/src/server/inbound/admin-http/routes/widgets/embed-reorder.ts` | 2 | 4 | NONE |  |
| 310 | T2 | `apps/website/src/server/inbound/admin-http/routes/widgets/embed-remove.ts` | 2 | 4 | NONE |  |
| 311 | T2 | `apps/website/src/server/inbound/admin-http/routes/system/mail-status.ts` | 2 | 3 | NONE |  |
| 312 | T2 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/admissions.ts` | 2 | 2 | NONE |  |
| 313 | T2 | `apps/website/src/server/inbound/admin-http/routes/system/server-logs.ts` | 1 | 5 | NONE |  |
| 314 | T2 | `apps/website/src/server/inbound/admin-http/http/redirects.ts` | 1 | 5 | NONE |  |
| 315 | T2 | `apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts` | 1 | 3 | NONE |  |
| 316 | T2 | `apps/website/src/server/inbound/admin-http/routes/system/observability-status.ts` | 1 | 3 | NONE |  |
| 317 | T2 | `apps/website/src/server/inbound/public-http/routes/site/newsletter-unsubscribe.ts` | 1 | 1 | NONE |  |
| 318 | T2 | `apps/website/src/server/inbound/public-http/routes/site/newsletter-confirm.ts` | 1 | 1 | NONE |  |
| 319 | T3 | `apps/admin/src/features/deployment/StaticSiteTab.tsx` | 17 | 34 | StaticSiteTab.unit.test.tsx |  |
| 320 | T3 | `apps/website/src/features/webhooks/keyring.env.ts` | 14 | 15 | external-mcp-aad.test.ts, external-mcp-payload-version.test.ts, form-save-errors.model-facing.test.ts (+7) |  |
| 321 | T3 | `apps/website/src/features/site-export/site-exporter.ts` | 14 | 3 | export-failure-summary.test.ts, index.test.ts, site-exporter.observability.unit.test.ts (+1) |  |
| 322 | T3 | `apps/admin/src/features/deployment/deployment-i18n.tsx` | 13 | 3 | deployment-i18n.unit.test.ts |  |
| 323 | T3 | `apps/website/src/features/theme/publish-content.ts` | 11 | 50 | publish-content.apply.test.ts, publish-content.pack.test.ts |  |
| 324 | T3 | `apps/website/src/features/widgets/publish-content.ts` | 10 | 7 | publish-content.test.ts |  |
| 325 | T3 | `apps/website/src/features/site-backup/sources.ts` | 9 | 30 | sources.unit.test.ts, tool-registrations.unit.test.ts |  |
| 326 | T3 | `apps/website/src/features/newsletter/send-pipeline.ts` | 8 | 33 | delivery-tools.test.ts, send-pipeline.test.ts |  |
| 327 | T3 | `apps/website/src/features/navigation/publish-content.ts` | 8 | 14 | publish-content.characterization.test.ts, publish-content.test.ts, reverters.test.ts |  |
| 328 | T3 | `apps/website/src/features/database-transfer/table-catalog.ts` | 8 | 13 | postgres-ddl.unit.test.ts, table-catalog.unit.test.ts, transfer-completeness.unit.test.ts |  |
| 329 | T3 | `apps/website/src/features/entries/publish-content.ts` | 8 | 3 | publish-content.test.ts |  |
| 330 | T3 | `apps/website/src/features/site-inspection/published-page.ts` | 7 | 24 | loopback-site-server.unit.test.ts, page-body.test.ts, published-page-body.unit.test.ts (+3) |  |
| 331 | T3 | `apps/website/src/features/newsletter/repo.ts` | 7 | 10 | repo.dialects.test.ts |  |
| 332 | T3 | `apps/website/src/features/database-transfer/destination-store.ts` | 7 | 10 | probes-and-cards.test.ts, confirmation-policy.unit.test.ts, destination-store.migrated.test.ts (+4) |  |
| 333 | T3 | `apps/website/src/features/database-transfer/copy-engine.ts` | 7 | 1 | copy-engine.postgres.test.ts, exclusions.unit.test.ts |  |
| 334 | T3 | `apps/website/src/features/redirects/publish-content.ts` | 6 | 4 | publish-content.characterization.test.ts, publish-content.test.ts |  |
| 335 | T3 | `apps/admin/src/features/deployment/hooks/use-static-publish.hooks.ts` | 5 | 14 | StaticSiteTab.unit.test.tsx, use-static-publish.unit.test.tsx |  |
| 336 | T3 | `apps/website/src/features/site-export/route-manifest.ts` | 5 | 9 | index.test.ts, route-manifest.test.ts |  |
| 337 | T3 | `apps/website/src/features/content-types/publish-content.ts` | 5 | 4 | publish-content.test.ts |  |
| 338 | T3 | `apps/website/src/features/newsletter/repo.memory.ts` | 4 | 29 | tool-registrations.newsletter.test.ts, campaign-write-service.test.ts, confirmation.test.ts (+7) |  |
| 339 | T3 | `apps/website/src/features/agent-plugins/mail-adapter-registry.ts` | 4 | 10 | bundled-mail-resend.unit.test.ts, mail-adapter-registry.unit.test.ts, trusted-plugin-files.unit.test.ts |  |
| 340 | T3 | `apps/website/src/features/settings/publish-content.ts` | 4 | 8 | publish-content.round-trip.test.ts |  |
| 341 | T3 | `apps/website/src/features/taxonomy/publish-content.ts` | 4 | 6 | planner.test.ts, publish-content.test.ts |  |
| 342 | T3 | `apps/website/src/features/theme/page-publish-tool.ts` | 4 | 4 | tool-registrations.contracts.test.ts |  |
| 343 | T3 | `apps/admin/src/features/deployment/OverviewTab.tsx` | 4 | 3 | OverviewTab.unit.test.tsx |  |
| 344 | T3 | `apps/website/src/features/forms/publish-content.ts` | 4 | 2 | publish-content.test.ts |  |
| 345 | T3 | `apps/website/src/features/database-transfer/confirmation-ui.ts` | 4 | 1 | confirmation-ui.unit.test.ts |  |
| 346 | T3 | `apps/website/src/features/newsletter/campaign-write-service.ts` | 3 | 16 | campaign-write-service.test.ts |  |
| 347 | T3 | `apps/website/src/features/webhooks/repo.memory.ts` | 3 | 13 | tool-registrations.webhooks.test.ts, agent-tools.delete-confirmation.test.ts, delivery.test.ts (+3) |  |
| 348 | T3 | `apps/website/src/features/navigation/import-menu.ts` | 3 | 12 | import-menu.test.ts, repo.sqlite.compare-and-set.test.ts |  |
| 349 | T3 | `apps/website/src/features/site-backup/plan-store.ts` | 3 | 8 | plan-store.unit.test.ts, tool-registrations.unit.test.ts |  |
| 350 | T3 | `apps/admin/src/features/deployment/Deployment.tsx` | 3 | 3 | Deployment.unit.test.tsx |  |
| 351 | T3 | `apps/desktop/src/dist-import-check.ts` | 3 | 1 | dist-import-check.test.ts |  |
| 352 | T3 | `apps/website/src/features/taxonomy/publish-term-ids.ts` | 2 | 10 | publish-term-ids.test.ts |  |
| 353 | T3 | `apps/website/src/features/newsletter/unsubscribe.ts` | 2 | 10 | unsubscribe.test.ts |  |
| 354 | T3 | `apps/website/src/features/newsletter/subscriptions.ts` | 2 | 9 | subscriptions.test.ts |  |
| 355 | T3 | `apps/website/src/platform/db/repos/publish-history-repo.ts` | 2 | 8 | publish-content-repos.dialects.test.ts |  |
| 356 | T3 | `apps/admin/src/features/deployment/hooks/use-dockerfile-source.hooks.ts` | 2 | 8 | DockerfileTab.unit.test.tsx, use-dockerfile-source.unit.test.tsx |  |
| 357 | T3 | `apps/website/src/features/newsletter/confirmation.ts` | 2 | 7 | confirmation.test.ts, subscriptions.test.ts |  |
| 358 | T3 | `apps/admin/src/features/deployment/hooks/use-static-export.hooks.ts` | 2 | 7 | StaticSiteTab.unit.test.tsx, use-static-export.unit.test.tsx |  |
| 359 | T3 | `apps/admin/src/features/deployment/DockerfileTab.tsx` | 2 | 6 | DockerfileTab.unit.test.tsx |  |
| 360 | T3 | `apps/website/src/features/database-transfer/destination-exchange.ts` | 2 | 5 | probes-and-cards.test.ts |  |
| 361 | T3 | `apps/website/src/features/newsletter/launch-gate.ts` | 2 | 4 | launch-gate.test.ts, send-pipeline.test.ts |  |
| 362 | T3 | `apps/website/src/features/plugin-runtime/plugin-export.ts` | 2 | 3 | plugin-export.unit.test.ts |  |
| 363 | T3 | `apps/website/src/features/agent-plugins/deploy-split-activation.ts` | 2 | 3 | bundled-github-actions-ops.unit.test.ts, deploy-split-activation.unit.test.ts |  |
| 364 | T3 | `apps/website/src/features/newsletter/hooks.ts` | 2 | 2 | delivery-tools.test.ts, hooks.test.ts, send-pipeline.test.ts (+1) |  |
| 365 | T3 | `apps/website/src/features/webhooks/delivery.ts` | 2 | 1 | delivery.test.ts |  |
| 366 | T3 | `apps/website/src/features/newsletter/lists.ts` | 1 | 8 | lists.test.ts |  |
| 367 | T3 | `apps/website/src/features/site-backup/push-jobs.ts` | 1 | 7 | tool-registrations.unit.test.ts |  |
| 368 | T3 | `apps/website/src/features/webmcp/published-html.ts` | 1 | 6 | published-site.test.ts |  |
| 369 | T3 | `apps/website/src/features/theme/theme-file-import.ts` | 1 | 4 | theme-file-import.test.ts |  |
| 370 | T3 | `apps/admin/src/features/deployment/hooks/static-publish-dependencies.hooks.ts` | 1 | 4 | static-publish-dependencies.unit.test.ts, use-static-publish.unit.test.tsx |  |
| 371 | T3 | `apps/website/src/features/theme/import-theme-file-tool.ts` | 1 | 1 | tool-registrations.contracts.test.ts |  |
| 372 | T3 | `apps/website/src/features/newsletter/data-module-manifest.ts` | 1 | 1 | data-module-manifest.failure-rollback.test.ts, repo.contract.test.ts, repo.dialects.test.ts (+1) |  |
| 373 | T3 | `apps/admin/src/lib/publish-criteria-deep-link.ts` | 1 | 1 | publish-criteria-deep-link.unit.test.ts |  |
| 374 | T3 | `apps/website/src/features/theme/active-theme-publish-content.ts` | 4 | 6 | NONE |  |
| 375 | T3 | `apps/website/src/contracts/core/scheduled-publish.ts` | 4 | 2 | NONE |  |
| 376 | T3 | `apps/website/src/platform/db/repos/webhook-repo.ts` | 3 | 4 | NONE |  |
| 377 | T3 | `apps/website/src/platform/db/sqlite/publish-backstop-row.sqlite.ts` | 2 | 11 | NONE |  |
| 378 | T3 | `apps/website/src/platform/db/sqlite/publish-backstop-audit.sqlite.ts` | 2 | 1 | NONE |  |
| 379 | T3 | `apps/website/src/contracts/core/publish-history-list-limit.ts` | 2 | 1 | NONE |  |
| 380 | T3 | `apps/website/src/features/site-backup/push-engine.ts` | 1 | 14 | NONE |  |
| 381 | T3 | `apps/admin/src/features/deployment/rules.ts` | 19 | 33 | StaticSiteTab.unit.test.tsx, rules.unit.test.ts, use-static-export.unit.test.tsx (+1) | yes |
| 382 | T3 | `apps/admin/src/features/pages/lib/theme-page-publish-state.ts` | 3 | 7 | theme-page-publish-state.unit.test.ts | yes |
| 383 | T4 | `apps/website/src/assistant/external-mcp-store.ts` | 20 | 128 | byok-tool-surface.test.ts, external-mcp-aad-writer-sync.test.ts, external-mcp-aad.test.ts (+12) |  |
| 384 | T4 | `apps/website/src/platform/db/migrations/index.ts` | 13 | 1 | seed-content-store.postgres.test.ts, chat-package-adoption.test.ts, checksums.test.ts (+15) |  |
| 385 | T4 | `apps/website/src/features/source-control/store.ts` | 12 | 23 | stores.test.ts, tool-registrations.unit.test.ts, commit-site.unit.test.ts (+5) |  |
| 386 | T4 | `apps/desktop/src/site-dir-store.ts` | 8 | 32 | add-site-button-wiring.test.ts, add-site-pointer.test.ts, agent-plugin-tokens.test.ts (+8) |  |
| 387 | T4 | `apps/website/src/features/navigation/repo.ts` | 8 | 9 | footer-page-links.test.ts, repo.compare-and-set.postgres.test.ts, repo.sqlite.compare-and-set.test.ts (+1) |  |
| 388 | T4 | `apps/website/src/platform/db/sqlite/content-db.ts` | 8 | 4 | site-title-preservation.sqlite.test.ts, oauth-pending-store.sqlite.test.ts, page-empty-template-choice-migration.test.ts (+35) |  |
| 389 | T4 | `apps/website/src/features/pages/html-document-store.memory.ts` | 7 | 14 | edit-html-permission.test.ts, hidden-until-script.test.ts, html-document-store.memory.test.ts (+8) |  |
| 390 | T4 | `apps/website/src/platform/db/sqlite/fresh-content-db.ts` | 7 | 3 | fresh-content-db.unit.test.ts |  |
| 391 | T4 | `apps/website/src/platform/db/migration/manifest.ts` | 6 | 22 | migration-manifest-postgres.test.ts, migration-manifest.test.ts, schema-migration-drift.test.ts (+3) |  |
| 392 | T4 | `apps/website/src/features/entries/repo.ts` | 6 | 17 | repo.compare-and-set.postgres.test.ts, repo.compare-and-set.test.ts, repo.dialects.test.ts |  |
| 393 | T4 | `apps/website/src/server/runtime/lifecycle/close-store-on-shutdown.ts` | 6 | 9 | process-root-parity.test.ts, close-store-on-shutdown-boot-work.test.ts, close-store-on-shutdown-stop-serving.test.ts (+1) |  |
| 394 | T4 | `apps/website/src/platform/db/kernel/ops.ts` | 6 | 3 | jini-db-facades.integration.test.ts, ops.postgres.test.ts, ops.test.ts |  |
| 395 | T4 | `apps/website/src/platform/db/repos/media-repo.ts` | 5 | 25 | media-content-type-store.test.ts |  |
| 396 | T4 | `apps/website/src/features/pages/html-document-store.ts` | 5 | 20 | html-document-store.noop-save.test.ts, html-document-store.revisions.test.ts, html-document-store.sqlite.test.ts (+1) |  |
| 397 | T4 | `apps/website/src/platform/db/migrations/runner.ts` | 5 | 2 | jini-db-facades.integration.test.ts, drop-empty-core-commerce-tables-step.test.ts, drop-unused-deployment-tables-step.test.ts (+8) |  |
| 398 | T4 | `apps/website/src/features/plugins/store/store-plugin.ts` | 5 | 1 | store-plugin.dialects.test.ts, store-plugin.test.ts |  |
| 399 | T4 | `apps/website/src/platform/db/prepare-content-store.ts` | 4 | 7 | prepare-content-store.dialects.test.ts, seed-content-store.postgres.test.ts, site-title-preexisting-marker-migration.test.ts (+3) |  |
| 400 | T4 | `apps/website/src/features/settings/repo.ts` | 4 | 5 | repo.contract.test.ts |  |
| 401 | T4 | `apps/website/src/features/navigation/migrate-footer-page-links.ts` | 4 | 5 | footer-page-links.test.ts |  |
| 402 | T4 | `apps/website/src/features/agent-plugins/write-note-tool.ts` | 4 | 4 | write-note-tool.unit.test.ts |  |
| 403 | T4 | `apps/website/src/features/agent-plugins/lifecycle.ts` | 4 | 1 | external-mcp-connection-source.operator-read-only.test.ts, mcp-ui-tool-calls-route.agent-plugins-uninstall.integration.test.ts, tool-registrations.plugins-set-enabled-busy.test.ts (+63) |  |
| 404 | T4 | `apps/website/src/platform/db/sqlite/database-journal-repo.ts` | 3 | 29 | database-journal-kernel.test.ts, database-journal-schema.test.ts, database-journal.integration.test.ts |  |
| 405 | T4 | `apps/website/src/platform/db/sqlite/database-introspection-adapter.sqlite.ts` | 3 | 14 | database-introspection-adapter.dialects.test.ts, database-introspection-adapter.sqlite.integration.test.ts |  |
| 406 | T4 | `apps/website/src/platform/db/repos/external-mcp-repo.ts` | 3 | 11 | external-mcp-repo.test.ts |  |
| 407 | T4 | `apps/website/src/server/runtime/lifecycle/local-site-process.ts` | 3 | 10 | local-site-process.unit.test.ts |  |
| 408 | T4 | `apps/desktop/src/nested-sites-migration.ts` | 3 | 8 | nested-sites-migration.test.ts |  |
| 409 | T4 | `apps/admin/src/features/database/hooks/use-migrate-forward-section.hooks.ts` | 3 | 7 | Database.unit.test.tsx, use-migrate-forward-section.unit.test.tsx |  |
| 410 | T4 | `apps/website/src/features/settings/site-title-write.ts` | 3 | 5 | settings-write-tools.test.ts |  |
| 411 | T4 | `apps/website/src/features/plugins/migration-recovery.ts` | 3 | 3 | data-module.test.ts, migration-recovery.test.ts |  |
| 412 | T4 | `apps/website/src/platform/db/migrations/0000_legacy_baseline.ts` | 3 | 2 | checksums.test.ts |  |
| 413 | T4 | `apps/website/src/platform/db/sqlite/database-journal-schema.ts` | 3 | 1 | database-journal-schema.test.ts |  |
| 414 | T4 | `apps/website/src/platform/db/migrations/chat/0000_chat_baseline.ts` | 3 | 1 | chat-migration-behavior.test.ts |  |
| 415 | T4 | `apps/website/src/features/external-mcp/save-form.ts` | 2 | 20 | save-form.unit.test.ts, static-token-setup.unit.test.ts |  |
| 416 | T4 | `apps/website/src/features/fs-files/custom-root-store.ts` | 2 | 9 | custom-root-store.test.ts, layout.test.ts, wiring.integration.test.ts |  |
| 417 | T4 | `apps/website/src/assistant/external-mcp-store.memory.ts` | 2 | 9 | byok-tool-surface.test.ts, external-mcp-aad-writer-sync.test.ts, external-mcp-aad.test.ts (+10) |  |
| 418 | T4 | `apps/website/src/features/navigation/repoint-menu-refs.ts` | 2 | 6 | repoint-menu-refs.test.ts |  |
| 419 | T4 | `apps/website/src/platform/db/sqlite/chat-orphan-check.ts` | 2 | 5 | chat-orphan-check.dialects.test.ts, chat-orphan-check.integration.test.ts |  |
| 420 | T4 | `apps/website/src/features/taxonomy/repo.ts` | 2 | 4 | repo.dialects.test.ts |  |
| 421 | T4 | `apps/website/src/platform/db/watermark-kernel.ts` | 2 | 2 | repo.sqlite.integration.test.ts, prepare-content-store.dialects.test.ts, watermark-kernel.dialects.test.ts |  |
| 422 | T4 | `apps/website/src/platform/db/repos/entry-refs-repo.ts` | 2 | 1 | entry-refs-repo.dialects.test.ts |  |
| 423 | T4 | `apps/website/src/platform/db/migrations/chat/0001_sqlite_chat_tables.ts` | 2 | 1 | chat-migration-behavior.test.ts |  |
| 424 | T4 | `apps/admin/src/lib/unchanged-save-warning.ts` | 2 | 1 | unchanged-save-warning.unit.test.ts |  |
| 425 | T4 | `apps/website/src/platform/db/migrations/legacy-sqlite.ts` | 1 | 10 | checksums.test.ts, legacy-adoption.test.ts, fresh-content-db.unit.test.ts |  |
| 426 | T4 | `apps/website/src/features/tool-audit/repo.ts` | 1 | 6 | repo.dialects.test.ts |  |
| 427 | T4 | `apps/website/src/platform/db/migrations/0011_drop_empty_core_commerce_tables.ts` | 1 | 5 | drop-empty-core-commerce-tables-step.test.ts |  |
| 428 | T4 | `apps/website/src/contracts/core/commands/repo.memory.ts` | 1 | 5 | authorize-gateway.test.ts, command-atomicity.test.ts, revert-plugin-ext.integration.test.ts (+3) |  |
| 429 | T4 | `apps/website/src/platform/db/migrations/0002_drop_empty_legacy_chat_tables.ts` | 1 | 4 | drop-empty-legacy-chat-tables-step.test.ts |  |
| 430 | T4 | `apps/website/src/features/sites/site-preview/site-preview-store.ts` | 1 | 4 | site-preview-service.unit.test.ts, site-preview-store.unit.test.ts |  |
| 431 | T4 | `apps/admin/src/features/ai-assistant/hooks/use-admin-permanent-deletes.hooks.ts` | 1 | 4 | AdminPermanentDeletes.unit.test.tsx |  |
| 432 | T4 | `apps/website/src/platform/db/kernel/sqlite-only.ts` | 1 | 3 | sqlite-only.test.ts |  |
| 433 | T4 | `apps/website/src/server/runtime/lifecycle/await-boot-work.ts` | 1 | 2 | process-root-parity.test.ts, await-boot-work.test.ts |  |
| 434 | T4 | `apps/website/src/platform/db/sqlite/hydrate-content-db-from-seed.ts` | 1 | 2 | hydrate-content-db-from-seed.test.ts |  |
| 435 | T4 | `apps/admin/src/features/recovery/hooks/use-restore-flow.hooks.ts` | 1 | 2 | use-restore-flow.unit.test.ts |  |
| 436 | T4 | `apps/website/src/server/runtime/lifecycle/readiness-state.ts` | 1 | 1 | assistant-ag-ui-routes.test.ts, assistant-proxy-routes.test.ts, deployment-overview-route.test.ts (+5) |  |
| 437 | T4 | `apps/website/src/platform/db/migrations/0003_coercion_json_as_json.ts` | 1 | 1 | coercion-json-as-json-step.test.ts |  |
| 438 | T4 | `apps/website/src/platform/db/migrations/0001_post_search.ts` | 1 | 1 | post-search-behavior.test.ts |  |
| 439 | T4 | `apps/website/src/platform/db/keyset-cursor.ts` | 1 | 1 | keyset-cursor.test.ts |  |
| 440 | T4 | `apps/website/src/platform/db/repos/change-set-repo.ts` | 3 | 20 | NONE |  |
| 441 | T4 | `apps/website/src/platform/db/repos/outbox-repo.ts` | 3 | 2 | NONE |  |
| 442 | T4 | `apps/website/src/platform/db/repos/analytics-sink.ts` | 3 | 2 | NONE |  |
| 443 | T4 | `apps/website/src/features/content-types/repo.rows.ts` | 2 | 2 | NONE |  |
| 444 | T4 | `apps/desktop/src/workspace-conversation-store.ts` | 1 | 6 | NONE |  |
| 445 | T4 | `apps/website/src/platform/db/migrations/0006_submission_ip_retention.ts` | 1 | 5 | NONE |  |
| 446 | T4 | `apps/website/src/server/runtime/lifecycle/local-site-host.ts` | 1 | 4 | NONE |  |
| 447 | T4 | `apps/website/src/server/runtime/lifecycle/theme-preview-host.ts` | 1 | 3 | NONE |  |
| 448 | T4 | `apps/website/src/server/runtime/lifecycle/site-preview-host.ts` | 1 | 3 | NONE |  |
| 449 | T5 | `apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts` | 28 | 49 | PageEditor.interactive-flush.unit.test.tsx, PageEditor.preview-remount.unit.test.tsx, PageEditor.unit.test.tsx (+5) |  |
| 450 | T5 | `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts` | 19 | 59 | PostEditor.unit.test.tsx, post-author.unit.test.tsx, post-cover-image.unit.test.tsx (+4) |  |
| 451 | T5 | `apps/admin/src/App.hooks.ts` | 14 | 46 | app-chat-dock-drop-capture.unit.test.tsx, app-chat-dock-seam.unit.test.tsx, app-confirm-dialog-i18n.unit.test.tsx (+14) |  |
| 452 | T5 | `apps/admin/src/features/dashboard/hooks/use-dashboard.hooks.ts` | 9 | 17 | use-dashboard-port.unit.test.ts, use-dashboard.hooks.unit.test.ts |  |
| 453 | T5 | `apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts` | 7 | 20 | use-external-mcp.unit.test.ts, credential-fidelity.unit.test.ts |  |
| 454 | T5 | `apps/admin/src/features/pages/hooks/use-theme-canvas-styling.hooks.ts` | 7 | 13 | use-theme-canvas-styling.unit.test.ts |  |
| 455 | T5 | `apps/admin/src/features/plugins/hooks/use-plugins.hooks.ts` | 7 | 8 | Plugins.unit.test.tsx, PluginsAddTab.unit.test.tsx, plugin-list-refresh.unit.test.ts (+1) |  |
| 456 | T5 | `apps/admin/src/features/posts/hooks/use-posts.hooks.ts` | 6 | 6 | Posts.unit.test.tsx, posts-agent-drive.unit.test.tsx, use-posts.unit.test.ts |  |
| 457 | T5 | `apps/admin/src/features/posts/hooks/use-post-editor-ui.hooks.ts` | 6 | 2 | use-post-editor-ui.hooks.unit.test.tsx |  |
| 458 | T5 | `apps/admin/src/features/taxonomy/hooks/use-term-picker.hooks.ts` | 5 | 25 | TermPicker.unit.test.tsx, use-term-picker.unit.test.tsx |  |
| 459 | T5 | `apps/admin/src/features/dashboard/hooks/dashboard-dependencies.hooks.ts` | 5 | 15 | use-dashboard-port.unit.test.ts |  |
| 460 | T5 | `apps/admin/src/features/pages/hooks/page-editor-dependencies.hooks.ts` | 5 | 13 | PageEditor.interactive-flush.unit.test.tsx, PageEditor.preview-remount.unit.test.tsx, html-tab-new-page.unit.test.ts (+6) |  |
| 461 | T5 | `apps/admin/src/features/pages/hooks/use-theme-pages.hooks.ts` | 5 | 12 | Pages.unit.test.tsx, ThemePageDetailsModal.unit.test.tsx, ThemePagesTab.unit.test.tsx (+4) |  |
| 462 | T5 | `apps/admin/src/features/settings/hooks/use-external-mcp-admissions.hooks.ts` | 5 | 10 | ExternalMcpAdmissionsBanner.unit.test.tsx, external-mcp-missing-launcher-recovery.unit.test.tsx, use-external-mcp-admissions.unit.test.tsx |  |
| 463 | T5 | `apps/admin/src/features/taxonomy/hooks/use-taxonomy.hooks.ts` | 5 | 8 | render-churn.measurement.test.tsx, request-volume.measurement.test.tsx, Taxonomy.unit.test.tsx (+4) |  |
| 464 | T5 | `apps/admin/src/features/plugins/hooks/use-agent-plugins.hooks.ts` | 5 | 7 | AgentPluginDetailsModal.unit.test.tsx, AgentPlugins.unit.test.tsx, AgentPluginsAddTab.unit.test.tsx (+2) |  |
| 465 | T5 | `apps/admin/src/features/pages/hooks/use-interactive-flush.hooks.ts` | 5 | 5 | use-interactive-flush.unit.test.ts |  |
| 466 | T5 | `apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.hooks.tsx` | 5 | 4 | MediaPickerDialog.hooks.unit.test.tsx, MediaPickerDialog.unit.test.tsx |  |
| 467 | T5 | `apps/admin/src/features/posts/hooks/post-editor-dependencies.hooks.ts` | 4 | 18 | post-author.unit.test.tsx, post-cover-image.unit.test.tsx, post-schedule-featured.unit.test.tsx (+3) |  |
| 468 | T5 | `apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.hooks.tsx` | 4 | 18 | WidgetConfigFields.hooks.unit.test.tsx |  |
| 469 | T5 | `apps/admin/src/features/recovery/hooks/use-recovery.hooks.ts` | 4 | 9 | admin-nav-recovery-acs.unit.test.ts, Recovery.unit.test.tsx, use-recovery.unit.test.ts |  |
| 470 | T5 | `apps/admin/src/features/plugins/hooks/plugins-dependencies.hooks.ts` | 4 | 9 | PluginsAddTab.unit.test.tsx, plugin-list-refresh.unit.test.ts, use-plugin-package-files.hooks.unit.test.ts (+1) |  |
| 471 | T5 | `apps/admin/src/features/plugins/hooks/use-agent-plugin-memory.hooks.ts` | 4 | 8 | agent-plugin-memory-panel.unit.test.tsx, agent-plugin-memory.hooks.unit.test.ts |  |
| 472 | T5 | `apps/admin/src/features/observability/hooks/use-recent-server-errors.hooks.ts` | 4 | 2 | recent-errors-panel.unit.test.tsx, use-recent-server-errors.hooks.unit.test.ts |  |
| 473 | T5 | `apps/admin/src/features/content-analysis/hooks/use-content-analysis.hooks.ts` | 4 | 2 | ContentAnalysisCard.unit.test.tsx, use-content-analysis.hooks.unit.test.tsx |  |
| 474 | T5 | `apps/admin/src/features/fs-files/hooks/use-folder-drop.hooks.ts` | 3 | 14 | use-folder-drop.hooks.unit.test.ts |  |
| 475 | T5 | `apps/admin/src/features/taxonomy/TaxonomyRowMenu.hooks.ts` | 3 | 10 | TaxonomyRowMenu.hooks.unit.test.tsx |  |
| 476 | T5 | `apps/admin/src/features/settings/ExternalMcpSettingsPanel.hooks.tsx` | 3 | 10 | ExternalMcpSettingsPanel.hooks.unit.test.tsx |  |
| 477 | T5 | `apps/admin/src/features/taxonomy/hooks/taxonomy-dependencies.hooks.ts` | 3 | 6 | embed-header-alignment.unit.test.tsx, html-embed.unit.test.tsx, use-taxonomy.unit.test.tsx (+1) |  |
| 478 | T5 | `apps/admin/src/components/MediaPickerDialog/JiniMediaPicker.hooks.ts` | 3 | 6 | JiniMediaPicker.hooks.unit.test.tsx |  |
| 479 | T5 | `apps/admin/src/features/content-analysis/hooks/content-analysis-dependencies.hooks.ts` | 3 | 5 | ContentAnalysisCard.unit.test.tsx, use-content-analysis.hooks.unit.test.tsx |  |
| 480 | T5 | `apps/admin/src/components/DevicePreview/DevicePreview.hooks.ts` | 3 | 4 | DevicePreview.hooks.unit.test.ts |  |
| 481 | T5 | `apps/admin/src/features/workspace/hooks/use-workspace.hooks.ts` | 3 | 3 | Workspace.unit.test.tsx, use-workspace.hooks.unit.test.ts |  |
| 482 | T5 | `apps/admin/src/components/EmbedInsertControl/EmbedInsertControl.hooks.tsx` | 3 | 3 | EmbedInsertControl.hooks.unit.test.tsx, EmbedInsertControl.unit.test.tsx, GalleryInsertControl.unit.test.tsx |  |
| 483 | T5 | `apps/admin/src/features/recovery/hooks/recovery-dependencies.hooks.ts` | 2 | 11 | use-recovery.unit.test.ts |  |
| 484 | T5 | `apps/admin/src/components/Select/Select.hooks.tsx` | 2 | 9 | Select.hooks.unit.test.tsx, Select.unit.test.tsx |  |
| 485 | T5 | `apps/admin/src/features/settings/ExternalMcpToolPicker.hooks.tsx` | 2 | 8 | ExternalMcpToolsModal.unit.test.tsx |  |
| 486 | T5 | `apps/admin/src/lib/widget-embed-extension.hooks.ts` | 2 | 7 | widget-embed-extension.hooks.unit.test.ts |  |
| 487 | T5 | `apps/admin/src/features/taxonomy/hooks/term-picker-dependencies.hooks.ts` | 2 | 7 | TermPicker.unit.test.tsx, use-term-picker.unit.test.tsx |  |
| 488 | T5 | `apps/admin/src/features/database/hooks/use-timeline-section.hooks.ts` | 2 | 7 | request-volume.measurement.test.tsx, Database.unit.test.tsx, use-migrate-forward-section.unit.test.tsx (+1) |  |
| 489 | T5 | `apps/admin/src/components/WidgetConfigFields/widget-config-fields-dependencies.hooks.ts` | 2 | 6 | WidgetPreview.unit.test.tsx, widget-config-fields-dependencies.unit.test.ts |  |
| 490 | T5 | `apps/admin/src/features/settings/hooks/use-external-mcp-tool-picker.hooks.ts` | 2 | 3 | use-external-mcp-tool-picker.cached-server.unit.test.tsx, use-external-mcp-tool-picker.hooks.unit.test.tsx |  |
| 491 | T5 | `apps/admin/src/features/observability/hooks/recent-server-errors-dependencies.hooks.ts` | 2 | 3 | recent-errors-panel.unit.test.tsx, use-recent-error-item.hooks.unit.test.ts, use-recent-server-errors.hooks.unit.test.ts |  |
| 492 | T5 | `apps/admin/src/components/MediaEditDialog/MediaEditDialog.hooks.tsx` | 2 | 3 | MediaEditDialog.hooks.unit.test.tsx, MediaEditDialog.unit.test.tsx |  |
| 493 | T5 | `apps/admin/src/features/settings/hooks/use-settings-active-tab-scroll.hooks.ts` | 2 | 2 | use-settings-active-tab-scroll.hooks.unit.test.tsx |  |
| 494 | T5 | `apps/admin/src/features/observability/hooks/use-observability-status.hooks.ts` | 2 | 2 | Observability.unit.test.tsx, recent-errors-panel.unit.test.tsx, use-observability-status.hooks.unit.test.ts |  |
| 495 | T5 | `apps/admin/src/features/integrations/hooks/use-integrations.hooks.ts` | 2 | 2 | request-volume.measurement.test.tsx, use-integrations.unit.test.tsx |  |
| 496 | T5 | `apps/admin/src/features/database/hooks/schema-state-section-dependencies.hooks.ts` | 2 | 2 | use-schema-state-section.unit.test.tsx |  |
| 497 | T5 | `apps/admin/src/features/analytics/hooks/use-analytics.hooks.ts` | 2 | 2 | Analytics.unit.test.tsx, use-analytics.hooks.unit.test.ts |  |
| 498 | T5 | `apps/admin/src/features/ai-assistant/hooks/use-admin-subagents.hooks.ts` | 2 | 2 | AdminSubagents.unit.test.tsx |  |
| 499 | T5 | `apps/admin/src/components/InstallTabCard/use-folder-upload.hooks.ts` | 2 | 2 | use-folder-upload.hooks.unit.test.ts |  |
| 500 | T5 | `apps/admin/src/lib/media-embed-extension.hooks.ts` | 2 | 1 | media-embed-extension.hooks.unit.test.tsx |  |
| 501 | T5 | `apps/admin/src/features/settings/hooks/use-user-interface-tab.hooks.ts` | 2 | 1 | UserInterfaceSettingsPanel.unit.test.tsx |  |
| 502 | T5 | `apps/admin/src/features/providers/hooks/use-always-allow.hooks.ts` | 2 | 1 | always-allow.unit.test.tsx |  |
| 503 | T5 | `apps/admin/src/features/database/hooks/use-schema-state-section.hooks.ts` | 2 | 1 | Database.unit.test.tsx, use-migrate-forward-section.unit.test.tsx, use-schema-state-section.unit.test.tsx |  |
| 504 | T5 | `apps/admin/src/components/TemplateSource/use-template-source.hooks.ts` | 2 | 1 | TemplateSourceModal.unit.test.tsx, use-template-source.hooks.unit.test.ts |  |
| 505 | T5 | `apps/admin/src/features/voice-input/hooks/use-push-to-talk.hooks.ts` | 1 | 15 | push-to-talk-state.hooks.unit.test.ts, use-push-to-talk.hooks.unit.test.ts |  |
| 506 | T5 | `apps/admin/src/features/taxonomy/hooks/use-merge-term-section.hooks.ts` | 1 | 12 | use-merge-term-section.unit.test.tsx |  |
| 507 | T5 | `apps/admin/src/features/voice-input/hooks/use-space-hold-to-talk.hooks.ts` | 1 | 10 | use-space-hold-to-talk.hooks.unit.test.ts |  |
| 508 | T5 | `apps/admin/src/features/pages/hooks/use-editor-html-jump.hooks.ts` | 1 | 9 | editor-html-jump.unit.test.ts |  |
| 509 | T5 | `apps/admin/src/features/posts/hooks/use-post-url-dialog.hooks.ts` | 1 | 7 | PostUrlDialog.chromecheck.unit.test.tsx, use-post-url-dialog.hooks.unit.test.ts |  |
| 510 | T5 | `apps/admin/src/features/consent/settings.hooks.ts` | 1 | 6 | settings.test.ts |  |
| 511 | T5 | `apps/admin/src/features/ai-assistant/hooks/use-ai-assistant.hooks.ts` | 1 | 5 | use-ai-assistant.hooks.unit.test.ts, visitor-widget-setting.unit.test.tsx |  |
| 512 | T5 | `apps/admin/src/features/taxonomy/hooks/use-term-detail-panel.hooks.ts` | 1 | 4 | use-term-detail-panel.unit.test.tsx |  |
| 513 | T5 | `apps/admin/src/features/taxonomy/hooks/merge-term-section-dependencies.hooks.ts` | 1 | 4 | use-merge-term-section.unit.test.tsx |  |
| 514 | T5 | `apps/admin/src/features/pages/hooks/theme-canvas-wrapper.ts` | 1 | 4 | theme-canvas-wrapper.unit.test.ts |  |
| 515 | T5 | `apps/admin/src/features/pages/hooks/theme-canvas-dependencies.hooks.ts` | 1 | 4 | PageEditor.interactive-flush.unit.test.tsx, PageEditor.preview-remount.unit.test.tsx, html-tab-new-page.unit.test.ts (+6) |  |
| 516 | T5 | `apps/admin/src/features/providers/hooks/always-allow-dependencies.hooks.ts` | 1 | 3 | Providers.unit.test.tsx, always-allow.unit.test.tsx |  |
| 517 | T5 | `apps/admin/src/features/observability/hooks/use-observability-tab.hooks.ts` | 1 | 3 | use-observability-tab.hooks.unit.test.ts |  |
| 518 | T5 | `apps/admin/src/features/integrations/hooks/integrations-dependencies.hooks.ts` | 1 | 3 | use-integrations.unit.test.tsx, Providers.unit.test.tsx |  |
| 519 | T5 | `apps/admin/src/components/TemplateSource/template-source-dependencies.hooks.ts` | 1 | 3 | use-template-source.hooks.unit.test.ts |  |
| 520 | T5 | `apps/admin/src/integrations/chart-providers/use-chart-registry.hooks.ts` | 1 | 2 | use-chart-registry.unit.test.tsx |  |
| 521 | T5 | `apps/admin/src/features/webmcp/browser-agent-settings.hooks.ts` | 1 | 2 | app-hooks-admin-webmcp.unit.test.tsx, AssistantDock.unit.test.tsx, browser-agent-settings.unit.test.tsx |  |
| 522 | T5 | `apps/admin/src/features/taxonomy/hooks/use-taxonomy-html-embed.hooks.ts` | 1 | 2 | use-taxonomy-html-embed.unit.test.tsx |  |
| 523 | T5 | `apps/admin/src/features/taxonomy/hooks/use-new-term-form.hooks.ts` | 1 | 2 | use-new-term-form.unit.test.tsx |  |
| 524 | T5 | `apps/admin/src/features/taxonomy/hooks/use-new-taxonomy-form.hooks.ts` | 1 | 2 | use-new-taxonomy-form.unit.test.tsx |  |
| 525 | T5 | `apps/admin/src/features/taxonomy/hooks/new-term-form-dependencies.hooks.ts` | 1 | 2 | use-new-term-form.unit.test.tsx |  |
| 526 | T5 | `apps/admin/src/features/settings/hooks/use-ai-agent-presentation.hooks.ts` | 1 | 2 | ai-agent-presentation.unit.test.ts |  |
| 527 | T5 | `apps/admin/src/features/workspace/hooks/workspace-dependencies.hooks.ts` | 1 | 1 | use-workspace.hooks.unit.test.ts |  |
| 528 | T5 | `apps/admin/src/features/voice-input/hooks/mic-capture.ts` | 1 | 1 | PushToTalkMicButton.unit.test.tsx, mic-capture.unit.test.ts, voice-to-composer.integration.test.tsx (+1) |  |
| 529 | T5 | `apps/admin/src/features/taxonomy/hooks/new-taxonomy-form-dependencies.hooks.ts` | 1 | 1 | use-new-taxonomy-form.unit.test.tsx |  |
| 530 | T5 | `apps/admin/src/features/integrations/hooks/use-integration-deliveries.hooks.ts` | 1 | 1 | IntegrationDeliveries.unit.test.tsx, use-integration-deliveries.unit.test.tsx |  |
| 531 | T5 | `apps/admin/src/features/integrations/hooks/integration-deliveries-dependencies.hooks.ts` | 1 | 1 | use-integration-deliveries.unit.test.tsx |  |
| 532 | T5 | `apps/admin/src/features/analytics/hooks/analytics-dependencies.hooks.ts` | 1 | 1 | use-analytics.hooks.unit.test.ts |  |
| 533 | T5 | `apps/admin/src/features/ai-assistant/hooks/ai-assistant-dependencies.hooks.ts` | 1 | 1 | ai-assistant-dependencies.unit.test.ts |  |
| 534 | T5 | `apps/admin/src/components/MediaPickerDialog/media-picker-dependencies.hooks.ts` | 1 | 1 | JiniMediaPicker.hooks.unit.test.tsx, MediaPickerDialog.hooks.unit.test.tsx |  |
| 535 | T5 | `apps/admin/src/features/settings/hooks/use-external-mcp-remove-confirm.hooks.ts` | 3 | 1 | NONE |  |
| 536 | T5 | `apps/admin/src/features/plugins/hooks/use-plugin-remove-confirm.hooks.ts` | 3 | 1 | NONE |  |
| 537 | T5 | `apps/admin/src/features/plugins/hooks/use-agent-plugin-disable-confirm.hooks.ts` | 3 | 1 | NONE |  |
| 538 | T5 | `apps/admin/src/features/settings/ExternalMcpToolsModal.hooks.ts` | 2 | 2 | NONE |  |
| 539 | T5 | `apps/admin/src/features/ai-assistant/hooks/use-visitor-assistant-panel.hooks.ts` | 2 | 1 | NONE |  |
| 540 | T5 | `apps/admin/src/components/WidgetConfigFields/MediaContentEditor.hooks.ts` | 1 | 14 | NONE |  |
| 541 | T5 | `apps/admin/src/features/plugins/hooks/use-package-file-tree.hooks.ts` | 1 | 10 | NONE |  |
| 542 | T5 | `apps/admin/src/components/InstallTabCard/use-zip-drop.hooks.ts` | 1 | 3 | NONE |  |
| 543 | T5 | `apps/admin/src/components/WidgetConfigFields/HtmlAttributeRows.hooks.ts` | 1 | 1 | NONE |  |
| 544 | T5 | `apps/admin/src/components/ServerRestartingBanner/hooks/use-server-connection-status.hooks.ts` | 1 | 1 | NONE |  |
| 545 | T5 | `apps/admin/src/features/pages/hooks/use-pages.hooks.ts` | 7 | 7 | Pages.unit.test.tsx, use-pages.unit.test.ts | yes |
| 546 | T5 | `apps/admin/src/features/settings/hooks/use-settings-ui.hooks.ts` | 7 | 1 | SettingsUi.unit.test.tsx, use-settings-ui.unit.test.ts | yes |
| 547 | T5 | `apps/admin/src/features/posts/hooks/posts-list-dependencies.hooks.ts` | 1 | 9 | use-posts.unit.test.ts | yes |
| 548 | T5 | `apps/admin/src/features/pages/hooks/pages-dependencies.hooks.ts` | 1 | 9 | use-pages.unit.test.ts, pages-dependencies.unit.test.ts | yes |

T6-other: 372 further files, not listed (full ranking in mutation-46 scratch `ranked.json`).
