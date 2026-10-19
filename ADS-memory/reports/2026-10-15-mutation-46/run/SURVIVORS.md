
## row 1 (T1) apps/admin/src/features/security/security-i18n.ts
tests: apps/admin/src/features/security/__tests__/security-i18n.unit.test.ts apps/admin/src/features/security/__tests__/rules.unit.test.ts apps/admin/src/features/settings/__tests__/ai-agent-locales.unit.test.ts apps/admin/src/features/security/__tests__/site-key-copy.i18n.unit.test.tsx apps/admin/src/features/security/__tests__/site-key-status.rules.unit.test.ts
- line 1882 (guard-never-fires): `if (result.status === "copied") return `${t("copied ✓")}${result.last4?.length === 4 ? ` …${result.last4}` : ""}`;`
- line 1883 (drop-nullish-default): `return t(COPY_REASON_TEXT[result.reasonCode ?? ""] ?? "Copying keys failed. Try again.");`
- line 1989 (guard-never-fires): `if (store.id === "external-mcp") return localeEntry({ table: REMOVE_DIALOG_EXTERNAL_MCP_BODY, locale });`

## row 4 (T1) apps/admin/src/features/security/AccessTokensTab.tsx
tests: apps/admin/src/features/security/__tests__/AccessTokensTab.unit.test.tsx apps/admin/src/features/security/__tests__/AccessTokensTab.credential-flows.unit.test.tsx apps/admin/src/features/security/__tests__/access-tokens-revoke-copy.unit.test.tsx
- line 484 (drop-nullish-default): `{info.tokenLabel ?? translate("Access token")}`
- line 574 (drop-nullish-default): `value={values[field.name] ?? ""}`

## row 7 (T1) apps/website/src/server/inbound/admin-http/publish-trust-auth.ts
tests: apps/website/src/server/inbound/admin-http/__tests__/publish-trust-keyless.unit.test.ts
- line 114 (guard-never-fires): `if (!header) return null;`
- line 129 (drop-nullish-default): `return (res.locals.publishTrust as PublishTrustContext | undefined) ?? null;`
- line 196 (drop-nullish-default): `return grant?.publicKeys.find((key) => key.generation === generation)?.publicKeyB64u ?? "";`
- line 231 (guard-never-fires): `if (!token) {`
- line 239 (guard-never-fires): `if (targetInstallationId === null) {`
- line 256 (guard-never-fires): `if (!isPublishTrustRoute(req.method, req.originalUrl)) {`
- line 296 (guard-never-fires): `if (!admission.allowed) {`
- line 306 (guard-never-fires): `if (capabilities.length === 0) {`
- line 352 (guard-never-fires): `if (!context) return deps;`
- line 399 (guard-never-fires): `if (!context) return deps;`
- line 410 (guard-never-fires): `if (publishType === undefined) return granted(params);`
- line 412 (guard-never-fires): `if (!permissions?.includes(permission)) {`

## row 8 (T1) apps/website/src/features/agent-plugins/import-access-token.ts
tests: apps/website/src/features/agent-plugins/__tests__/unit/import-access-token.unit.test.ts apps/website/src/features/agent-plugins/__tests__/unit/token-sign-in.unit.test.ts apps/website/src/features/agent-plugins/__tests__/unit/apply-tool-renames.unit.test.ts
- line 61 (drop-nullish-default): `const principalId = input.principalId ?? AGENT_PLUGIN_TOKEN_IMPORT_ACTOR;`
- line 70 (drop-nullish-default): `if (input.onlyAtUrl !== undefined && (row?.url ?? target.config.url) !== input.onlyAtUrl) {`
- line 96 (guard-never-fires): `if (seen.has(plugin.pluginId)) continue;`
- line 149 (drop-nullish-default): `const retiredSet = (auth.retiredEnv ?? []).filter((name) => (env[name] ?? "").trim() !== "");`

## row 10 (T1) apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts
tests: apps/admin/src/features/security/hooks/__tests__/use-access-tokens.unit.test.tsx apps/admin/src/features/security/__tests__/Security.unit.test.tsx apps/admin/src/features/security/__tests__/AccessTokensTab.unit.test.tsx apps/admin/src/features/security/__tests__/AccessTokensTab.hooks.unit.test.tsx apps/admin/src/features/security/__tests__/access-tokens-revoke-copy.unit.test.tsx apps/admin/src/features/security/__tests__/AccessTokensTab.credential-flows.unit.test.tsx
- line 480 (drop-nullish-default): `: (accessTokensLoadError(publishQuery.error, sourceControlQuery.error, customQuery.error, t, locale) ?? reloadError);`
- line 524 (drop-nullish-default): `if (patch.token !== undefined) setExistingBusy(prev => ({ ...prev, [rowId]: { saving: prev[rowId]?.saving ?? false, error: credentialDraftError({ value: patch.token! }, { locale }) } }));`
- line 529 (drop-nullish-default): `return { ...prev, [rowId]: { ...blankDraft(), name: persistedRow?.name ?? "", username: persistedRow?.username ?? "", ...patch } };`
- line 578 (drop-nullish-default): `const draft = existingDrafts[row.id] ?? { ...blankDraft(), name: row.name, username: row.username ?? "" };`
- line 599 (drop-nullish-default): `setExistingDrafts((prev) => ({ ...prev, [row.id]: { ...blankDraft(), name: fields.name.trim(), username: row.username ?? "" } }));`
- line 641 (drop-nullish-default): `if (kind === "publish") setPublishCredentials((prev) => withPromotedDefault(prev ?? [], result as AdminPublishCredentialSummary));`
- line 642 (drop-nullish-default): `else setSourceControlCredentials((prev) => withPromotedDefault(prev ?? [], result as AdminSourceControlCredentialSummary));`
- line 680 (drop-nullish-default): `if (patch.token !== undefined) setAddForms(prev => ({ ...prev, [key]: { ...(prev[key] ?? blankAddFormEntry()), error: credentialDraftError({ value: patch.token! }, { locale, required: true }) } }));`
- line 681 (drop-nullish-default): `setAddForms((prev) => ({ ...prev, [key]: { ...(prev[key] ?? blankAddFormEntry()), draft: { ...(prev[key]?.draft ?? blankDraft()), ...patch } } }));`
- line 746 (drop-nullish-default): `const totalCount = rows?.length ?? 0;`

## row 14 (T1) apps/website/src/features/custom-credentials/write-files-validation.ts
tests: apps/website/src/features/custom-credentials/__tests__/write-files-validation.unit.test.ts
- line 97 (guard-never-fires): `if (typeof target.repo !== "string") throw new CustomCredentialValidationError(`invalid repo '${String(target.repo)}'`);`

## row 17 (T1) apps/website/src/features/source-control/credential-setup.ts
tests: apps/website/src/features/source-control/__tests__/propose-credential-tool.test.ts
- line 138 (guard-never-fires): `if (run.status === 'cancelled' || run.status === 'expired' || run.status === 'abandoned') return undefined;`
