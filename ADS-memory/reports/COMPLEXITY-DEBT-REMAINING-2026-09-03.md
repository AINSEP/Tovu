# Remaining complexity-gate findings — 2026-09-03

Fresh `npx tsx development/scripts/check-src-complexity-drift.ts` run after fixing the 3 worst
offenders (`save-form.ts`, `skills/tool-registrations.ts`, `assistant/tool-failure-recovery.ts`).
Threshold is 9/9 (cyclomatic `complexity` + `sonarjs/cognitive-complexity`), both hard-overridden
via `--rule`. 70 violations remain across 41 files, none touched by this pass. Handed off as tech
debt for a later baseline-and-ratchet pass (add to `development/scripts/src-complexity-debt.json`
with justification, or refactor file-by-file).

Also unrelated to this pass: 5 stale baseline entries in `src-complexity-debt.json` no longer
reproduce (dead `src/...` paths from before the 2026-09-02 apps/website repoint) — an owner decision
on whether to delete them, not made here.

| File | Rule | Function | Score | Target |
|---|---|---|---|---|
| apps/website/src/assistant/ask-choice-tool.ts | complexity | readSelectSpec | 11 | 9 |
| apps/website/src/assistant/ask-choice-tool.ts | complexity | parseAskChoiceInput | 11 | 9 |
| apps/website/src/assistant/ask-choice-tool.ts | cognitive | (unnamed) | 10 | 9 |
| apps/website/src/assistant/execution-credential-store.ts | complexity | resolveExecutionCredentialSeal | 10 | 9 |
| apps/website/src/assistant/external-mcp-oauth.ts | cognitive | (unnamed) | 12 | 9 |
| apps/website/src/assistant/external-mcp-reauth-tool.ts | complexity | (async method) | 16 | 9 |
| apps/website/src/assistant/external-mcp-reauth-tool.ts | cognitive | (unnamed) | 13 | 9 |
| apps/website/src/assistant/external-mcp-store.ts | complexity | resolveExternalMcpSealedEnv | 11 | 9 |
| apps/website/src/assistant/mcp-federation/adapter.http.ts | complexity | postWithTimeout | 10 | 9 |
| apps/website/src/assistant/mcp-federation/bootstrap.ts | complexity | attachFederatedMcpTools | 10 | 9 |
| apps/website/src/assistant/mcp-federation/trust.ts | complexity | (arrow function) | 10 | 9 |
| apps/website/src/assistant/run-start-context.ts | complexity | parseRunStartContextRef | 13 | 9 |
| apps/website/src/assistant/run-start-context.ts | cognitive | (unnamed) | 10 | 9 |
| apps/website/src/assistant/site-credential-store.ts | complexity | resolveSiteAssistantCredentialSeal | 10 | 9 |
| apps/website/src/features/agent-plugins/activation.ts | complexity | normalizeActivations | 17 | 9 |
| apps/website/src/features/agent-plugins/activation.ts | cognitive | (unnamed) | 16 | 9 |
| apps/website/src/features/agent-plugins/tool-registrations.ts | cognitive | (unnamed) | 14 | 9 |
| apps/website/src/features/comments/ingress.ts | complexity | submit | 16 | 9 |
| apps/website/src/features/comments/ingress.ts | cognitive | (unnamed) | 16 | 9 |
| apps/website/src/features/custom-credentials/store.ts | complexity | updateCustomCredential | 11 | 9 |
| apps/website/src/features/custom-credentials/store.ts | cognitive | (unnamed) | 11 | 9 |
| apps/website/src/features/identity/api-key-secret.ts | complexity | parseStoredHash | 12 | 9 |
| apps/website/src/features/identity/api-key-service.ts | complexity | authenticateApiKey | 10 | 9 |
| apps/website/src/features/identity/default-credential-exposure.ts | complexity | listFiles | 11 | 9 |
| apps/website/src/features/identity/default-credential-exposure.ts | cognitive | (unnamed) | 12 | 9 |
| apps/website/src/features/media/hydrate-blob-store-from-seed.ts | cognitive | (unnamed) | 15 | 9 |
| apps/website/src/features/media/tool-registrations.ts | complexity | resolveMediaPublicUrls | 12 | 9 |
| apps/website/src/features/media/tool-registrations.ts | cognitive | (unnamed) | 12 | 9 |
| apps/website/src/features/members/access-resolver.ts | cognitive | (unnamed) | 13 | 9 |
| apps/website/src/features/members/access-resolver.ts | complexity | decide | 13 | 9 |
| apps/website/src/features/members/write-service.ts | complexity | requestSignInLink | 10 | 9 |
| apps/website/src/features/members/write-service.ts | cognitive | (unnamed) | 12 | 9 |
| apps/website/src/features/origin/origin.ts | complexity | normalizeOriginCandidate | 15 | 9 |
| apps/website/src/features/origin/origin.ts | cognitive | (unnamed) | 12 | 9 |
| apps/website/src/features/plugin-runtime/manifest.ts | complexity | validateField | 12 | 9 |
| apps/website/src/features/redirects/redirects.ts | complexity | updateRedirect | 11 | 9 |
| apps/website/src/features/settings/migration.ts | complexity | migrateLegacyPresentationSettings | 10 | 9 |
| apps/website/src/features/site-evidence/collect-page-evidence.ts | cognitive | (unnamed) | 10 | 9 |
| apps/website/src/features/site-evidence/page-structure-script.ts | complexity | selectorFor | 10 | 9 |
| apps/website/src/features/site-evidence/page-structure-script.ts | cognitive | (unnamed, selectorFor) | 11 | 9 |
| apps/website/src/features/site-evidence/page-structure-script.ts | complexity | accessibleNameOf | 12 | 9 |
| apps/website/src/features/site-evidence/page-structure-script.ts | cognitive | (unnamed, accessibleNameOf) | 14 | 9 |
| apps/website/src/features/site-evidence/page-structure-script.ts | complexity | collectContrastSamples | 11 | 9 |
| apps/website/src/features/site-evidence/page-structure-script.ts | cognitive | (unnamed, collectContrastSamples) | 11 | 9 |
| apps/website/src/features/site-evidence/same-origin.ts | complexity | normalizeSitePath | 11 | 9 |
| apps/website/src/features/site-evidence/same-origin.ts | cognitive | (unnamed) | 10 | 9 |
| apps/website/src/features/site-inspection/published-page.ts | complexity | resolveSameOriginPath | 15 | 9 |
| apps/website/src/features/site-inspection/published-page.ts | cognitive | (unnamed) | 11 | 9 |
| apps/website/src/features/theme/validation/references.ts | cognitive | (unnamed) | 10 | 9 |
| apps/website/src/features/vendor-credentials/dual-read.ts | complexity | publishConnectionToVendorConnection | 10 | 9 |
| apps/website/src/features/webhooks/delivery.ts | complexity | processDueDeliveries | 12 | 9 |
| apps/website/src/features/webhooks/delivery.ts | cognitive | (unnamed) | 12 | 9 |
| apps/website/src/features/webhooks/seal-aad-invariant.ts | complexity | checkSealCallArguments | 11 | 9 |
| apps/website/src/features/webhooks/secret-scan-guard.ts | cognitive | (unnamed) | 15 | 9 |
| apps/website/src/features/webhooks/signing.ts | cognitive | (unnamed) | 10 | 9 |
| apps/website/src/features/widgets/resolver-service.ts | complexity | (async arrow function) | 10 | 9 |
| apps/website/src/server/inbound/admin-http/routes/assistant/detect-agents.ts | complexity | toExecutionTabAgent | 12 | 9 |
| apps/website/src/server/inbound/admin-http/routes/forms/delete-submission.ts | complexity | (async arrow function) | 10 | 9 |
| apps/website/src/server/inbound/admin-http/routes/forms/get-submission.ts | complexity | (async arrow function) | 10 | 9 |
| apps/website/src/server/inbound/admin-http/routes/pages/create.ts | cognitive | (unnamed) | 10 | 9 |
| apps/website/src/server/inbound/admin-http/routes/plugins/uninstall.ts | cognitive | (unnamed) | 11 | 9 |
| apps/website/src/server/inbound/admin-http/routes/plugins/uninstall.ts | complexity | (async arrow function) | 10 | 9 |
| apps/website/src/server/inbound/admin-http/routes/posts/create.ts | cognitive | (unnamed) | 10 | 9 |
| apps/website/src/server/inbound/admin-http/routes/site/profile.ts | complexity | parseSections | 10 | 9 |
| apps/website/src/server/inbound/admin-http/routes/site/profile.ts | cognitive | (unnamed) | 14 | 9 |
| apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts | complexity | (async arrow function) | 10 | 9 |
| apps/website/src/server/inbound/public-http/http/site/form-render.ts | complexity | readFieldErrorsFromQuery | 10 | 9 |
| apps/website/src/server/inbound/public-http/http/site/form-render.ts | cognitive | (unnamed) | 12 | 9 |
| apps/website/src/server/inbound/public-http/http/site/render.ts | complexity | renderWidgetMediaImage | 11 | 9 |
| apps/website/src/server/runtime/composition/deps.ts | complexity | createSqliteRouteDeps | 11 | 9 |

Full raw ESLint-JSON-derived log:
`/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/94b12ac3-e733-4ff2-b911-c33ac5749e20/scratchpad/complexity-after.log`
