
## row 18 (T1) apps/admin/src/features/security/Security.tsx (sha 88b36138ef7b8e3eec1da9ca4bc7cc460a888fca)
tests: apps/admin/src/features/security/__tests__/Security.unit.test.tsx
- line 128 (drop-nullish-default): `return override ?? useWiredSecurityPermissions;`

## row 23 (T1) apps/website/src/server/inbound/public-http/routes/publish-trust/handshake.ts (sha 88b36138ef7b8e3eec1da9ca4bc7cc460a888fca)
tests: apps/website/src/server/inbound/public-http/routes/publish-trust/__tests__/handshake-keyless.unit.test.ts
- line 108 (guard-never-fires): `if (typeof candidate.nonce !== "string") return null;`
- line 109 (guard-never-fires): `if (typeof candidate.sourceInstallationId !== "string") return null;`
- line 110 (guard-never-fires): `if (typeof candidate.generation !== "number" || !Number.isInteger(candidate.generation)) return null;`
- line 111 (guard-never-fires): `if (!Array.isArray(candidate.capabilities) || candidate.capabilities.some((c) => typeof c !== "string")) return null;`
- line 112 (guard-never-fires): `if (typeof candidate.signatureB64u !== "string") return null;`
- line 198 (guard-never-fires): `if (!(await withinRateLimit(req, res))) return;`
- line 211 (guard-never-fires): `if (!grant || !isGrantActive(grant, deps.clock.nowIso())) {`
- line 222 (guard-never-fires): `if (!verification.ok) {`

## row 24 (T1) apps/website/src/assistant/site-credential-store.ts (sha 88b36138ef7b8e3eec1da9ca4bc7cc460a888fca)
tests: apps/website/src/assistant/__tests__/site-credential-store.test.ts
- line 160 (guard-never-fires): `if (typeof opened?.payload?.apiKey !== "string") return null;`
- line 132 (drop-nullish-default): `const saved = await repo.put({ record: prepared, expectedRevision: existing?.revision ?? null });`

## row 20 (T1) apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts (sha 88b36138ef7b8e3eec1da9ca4bc7cc460a888fca)
tests: apps/admin/src/features/ai-assistant/__tests__/use-visitor-credential-form.unit.test.ts apps/admin/src/features/ai-assistant/__tests__/VisitorCredentialForm.unit.test.tsx
- line 331 (guard-never-fires): `if (!result) return { status: "error", message: "Connection test failed" };`
- line 451 (guard-never-fires): `if (cancelled) return;`
- line 457 (guard-never-fires): `if (cancelled) return;`
- line 493 (guard-never-fires): `if (cancelled) return;`

## row 26 (T1) apps/website/src/features/publish-trust/handshake-client.ts (sha 01c0796854c14f081c595f50f40c574939e4b1d2)
tests: apps/website/src/features/publish-trust/__tests__/handshake-client-keyless.unit.test.ts
- line 200 (guard-never-fires): `if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {`
- line 225 (guard-never-fires): `if (typeof installationId !== "string" || installationId === "" || typeof workspaceId !== "string" || workspaceId === "") {`
- line 262 (guard-never-fires): `if (typeof nonce !== "string" || nonce === "" || typeof targetInstallationId !== "string" || targetInstallationId === "") {`
- line 291 (guard-never-fires): `if (typeof token !== "string" || token === "") {`
- line 256 (drop-nullish-default): `const generation = input.generation ?? PUBLISH_TRUST_GENERATION;`

## row 27 (T1) apps/website/src/features/agent-plugins/switch-on-saved-token.ts (sha 01c0796854c14f081c595f50f40c574939e4b1d2)
tests: apps/website/src/features/agent-plugins/__tests__/unit/switch-on-saved-token.unit.test.ts
- line 80 (guard-never-fires): `if (record.updatedBy !== SEED_ACTOR) return false;`
- line 96 (guard-never-fires): `if (await isOff(target.pluginId)) return { state: "plugin-off-by-operator" };`
- line 102 (guard-never-fires): `if (row?.enabled !== true) return { state: "connection-off-by-operator" };`

## row 30 (T1) apps/website/src/features/publish-trust/connect.ts (sha fbe668708ccabb3180ecbaa00c670254da73be6e)
tests: apps/website/src/features/publish-trust/__tests__/grant-backstop.test.ts
- line 79 (guard-never-fires): `if (contents === null) continue;`
- line 81 (guard-never-fires): `if (found) return found[1];`
- line 160 (guard-never-fires): `if (!written.ok) throw new PublishTrustConnectError(`This site's publishing settings could not be saved: ${written.reason}`);`
- line 188 (guard-never-fires): `if (!written.ok) throw new PublishTrustConnectError(`This site's publishing settings could not be saved: ${written.reason}`);`

## row 29 (T1) apps/website/src/server/inbound/public-http/http/site/worker-sandbox.ts (sha fbe668708ccabb3180ecbaa00c670254da73be6e)
tests: apps/website/src/server/inbound/public-http/http/site/__tests__/worker-sandbox.test.ts apps/website/src/server/inbound/public-http/http/site/__tests__/sandbox-timeout-resolution.test.ts
- line 57 (guard-never-fires): `if ((error as NodeJS.ErrnoException).code !== "EBADF") throw error;`

## row 33 (T1) apps/admin/src/features/roles/roles-i18n.ts (sha fbe668708ccabb3180ecbaa00c670254da73be6e)
tests: apps/admin/src/features/roles/__tests__/roles-i18n.unit.test.ts apps/admin/src/features/roles/__tests__/rules.unit.test.ts apps/admin/src/features/roles/__tests__/Roles.unit.test.tsx
- line 1286 (drop-nullish-default): `{ ...entries, ...(ROLES_AUDIT_STRINGS[locale] ?? {}) },`

## row 37 (T1) apps/website/src/platform/oauth/endpoint-safety.ts (sha fbe668708ccabb3180ecbaa00c670254da73be6e)
tests: apps/website/src/platform/oauth/__tests__/endpoint-safety.test.ts apps/website/src/platform/oauth/__tests__/endpoint-safety-adapter.test.ts apps/website/src/platform/oauth/__tests__/providers.test.ts apps/website/src/platform/oauth/__tests__/authorization-code.test.ts apps/website/src/platform/oauth/__tests__/dynamic-registration.test.ts
- line 39 (guard-never-fires): `if (!(error instanceof JiniOAuthError)) throw error;`
- line 154 (guard-never-fires): `if (document.issuer !== undefined && document.issuer !== issuer)`

## row 34 (T1) apps/website/src/server/inbound/admin-http/routes/system/site-key.ts (sha fbe668708ccabb3180ecbaa00c670254da73be6e)
tests: apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-key-state.unit.test.ts apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-key-sources.unit.test.ts
- line 207 (guard-never-fires): `if (existsSync(join(siteDir, STORAGE_SECRET_FILENAME))) return true;`
- line 208 (guard-never-fires): `if (deps.contentKernel === undefined) return findSiteKeyDependentData(siteDir);`
- line 228 (guard-never-fires): `if (meta === undefined || meta.siteKeyFingerprint === fingerprint) return;`
- line 264 (guard-never-fires): `if (await rejectUnlessAuthorized(req, res, deps)) return;`
- line 280 (guard-never-fires): `if (await rejectUnlessAuthorized(req, res, deps)) return;`
- line 289 (guard-never-fires): `if (await rejectUnlessAuthorized(req, res, deps)) return;`
- line 308 (guard-never-fires): `if (await rejectUnlessAuthorized(req, res, deps)) return;`
- line 313 (guard-never-fires): `if (await rejectUnlessAuthorized(req, res, deps)) return;`
- line 318 (guard-never-fires): `if (await rejectUnlessAuthorized(req, res, deps)) return;`
- line 436 (guard-never-fires): `if (mode === "production" || ensured?.action === "production-noop") return generateProductionSiteKey(deps, hasData);`
- line 437 (guard-never-fires): `if (ensured === undefined) return refusal("SITE_META_UNREADABLE");`
- line 443 (guard-never-fires): `if (fingerprint === undefined || perSiteFilePath === undefined) throw new Error(`site key '${action}' carried no fingerprint or path`);`
- line 459 (guard-never-fires): `if (status.active && status.fingerprint !== undefined) return success("already-active", status.fingerprint, status.keyFilePath);`
- line 460 (guard-never-fires): `if (status.invalid) return refusal("KEY_INVALID");`

## row 36 (T1) apps/admin/src/features/plugins/composer-capabilities.ts (sha fbe668708ccabb3180ecbaa00c670254da73be6e)
tests: apps/admin/src/features/plugins/__tests__/composer-capabilities.unit.test.ts apps/admin/src/components/__tests__/AssistantDock.hooks.unit.test.tsx apps/admin/src/features/plugins/__tests__/composer-skill-ranking.unit.test.ts apps/admin/src/components/AssistantDock/__tests__/AssistantDock.hooks.unit.test.tsx
- line 383 (guard-never-fires): `if (name === query) return 0;`
- line 394 (guard-never-fires): `if (!match) return groups;`

## row 41 (T1) apps/website/src/server/inbound/public-http/routes/external-mcp/oauth-callback.ts (sha fbe668708ccabb3180ecbaa00c670254da73be6e)
tests: apps/website/src/server/inbound/public-http/routes/external-mcp/__tests__/oauth-callback.test.ts
- line 139 (drop-nullish-default): `const serverId = String(req.params.serverId ?? "");`

## row 38 (T1) apps/admin/src/features/roles/hooks/use-roles.hooks.ts (sha fbe668708ccabb3180ecbaa00c670254da73be6e)
tests: apps/admin/src/features/roles/__tests__/use-roles.unit.test.tsx apps/admin/src/features/roles/__tests__/Roles.unit.test.tsx apps/admin/src/__measurements__/request-volume.measurement.test.tsx
- line 443 (guard-never-fires): `if (permissionsGenerationRef.current !== generation) return;`
- line 447 (guard-never-fires): `if (permissionsGenerationRef.current !== generation) return;`

## row 44 (T1) apps/desktop/src/webview-guest-policy.ts (sha 053c98c72cbeffda87d08511cae04e0cd00f95f7)
tests: apps/desktop/src/webview-guest-policy.test.ts
- line 17 (guard-never-fires): `if (typeof options?.preloadPath !== "string" || options.preloadPath.length === 0) {`

## row 46 (T1) apps/website/src/features/publish-trust/grant.ts (sha 053c98c72cbeffda87d08511cae04e0cd00f95f7)
tests: apps/website/src/features/publish-trust/__tests__/grant.test.ts apps/website/src/features/publish-trust/__tests__/grant-backstop.test.ts apps/website/src/features/publish-trust/__tests__/handshake.test.ts apps/website/src/features/publish-trust/__tests__/revocations.test.ts apps/website/src/features/publish-trust/__tests__/provisioning.test.ts
- line 138 (guard-never-fires): `if (raw.length > MAX_PUBLIC_KEYS) return `'publicKeys' must hold at most ${MAX_PUBLIC_KEYS} keys`;`
- line 142 (guard-never-fires): `if (typeof entry !== "object" || entry === null) return "each 'publicKeys' entry must be an object";`
- line 144 (guard-never-fires): `if (!isBoundedString(publicKeyB64u)) return "each 'publicKeys' entry needs a 'publicKeyB64u' string";`
- line 164 (guard-never-fires): `if (!Array.isArray(raw) || raw.length === 0) return "'capabilities' must be a non-empty array";`
- line 177 (guard-never-fires): `if (!Array.isArray(raw)) return "'entityTypes' must be an array";`
- line 178 (guard-never-fires): `if (raw.length > MAX_ENTITY_TYPES) return `'entityTypes' must hold at most ${MAX_ENTITY_TYPES} types`;`
- line 180 (guard-never-fires): `if (!isBoundedString(entry)) return "each 'entityTypes' entry must be a non-empty string";`
- line 201 (guard-never-fires): `if (!isBoundedString(doc.sourceInstallationId)) return fail("'sourceInstallationId' must be a non-empty string");`
- line 202 (guard-never-fires): `if (!isBoundedString(doc.workspaceId)) return fail("'workspaceId' must be a non-empty string");`

## row 38 (T1) apps/admin/src/features/roles/hooks/use-roles.hooks.ts (sha 053c98c72cbeffda87d08511cae04e0cd00f95f7)
tests: apps/admin/src/features/roles/__tests__/use-roles.unit.test.tsx apps/admin/src/features/roles/__tests__/Roles.unit.test.tsx apps/admin/src/__measurements__/request-volume.measurement.test.tsx
- line 443 (guard-never-fires): `if (permissionsGenerationRef.current !== generation) return;`
- line 447 (guard-never-fires): `if (permissionsGenerationRef.current !== generation) return;`
- line 396 (drop-nullish-default): `setEditingPolicyDescription(policy.description ?? "");`

## row 19 (T1) apps/website/src/features/publish-trust/provisioning.ts (sha 9469f4ae66c391cf9f11dfed00e98143e1f32ec7)
tests: apps/website/src/features/publish-trust/__tests__/provisioning.test.ts apps/website/src/features/publish-trust/__tests__/revocations.test.ts apps/website/src/features/publish-content/__tests__/publish-agent-tools.test.ts
- line 238 (guard-never-fires): `if (text.trim().length === 0) return withoutGrants(emptyState, origin);`

## row 22 (T1) apps/website/src/assistant/execution-credential-store.ts (sha 9469f4ae66c391cf9f11dfed00e98143e1f32ec7)
tests: apps/website/src/assistant/__tests__/execution-credential-store.test.ts apps/website/src/assistant/__tests__/byok-credential.test.ts apps/website/src/assistant/__tests__/live-model-cache.test.ts apps/website/src/server/__tests__/admin-assistant-execution-credential-routes.test.ts
- line 192 (guard-never-fires): `if (typeof opened?.payload?.apiKey !== "string") return null;`
- line 119 (guard-never-fires): `if (providerId !== undefined && providerId !== null && typeof providerId !== "string") {`
- line 162 (drop-nullish-default): `const saved = await repo.put({ record: prepared, expectedRevision: existing?.revision ?? null });`

## row 25 (T1) apps/website/src/server/inbound/admin-http/routes/taxonomy/assign-terms.ts (sha 9469f4ae66c391cf9f11dfed00e98143e1f32ec7)
tests: apps/website/src/server/inbound/admin-http/routes/taxonomy/__tests__/assign-terms.not-live.test.ts apps/website/src/server/__tests__/routes/taxonomy-routes.test.ts apps/website/src/server/__tests__/routes/taxonomy-trash-routes.test.ts
- line 87 (guard-never-fires): `if (!body) return;`
- line 131 (guard-never-fires): `if (!allowed.allowed) {`
- line 57 (drop-nullish-default): `const body = req.body ?? {};`

## row 39 (T1) apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts (sha 0c6d3713cb67d7b6e62112bb08887eec1292c8e8)
tests: apps/website/src/server/inbound/admin-http/routes/external-mcp/__tests__/oauth-error-mapping.test.ts
- line 124 (drop-nullish-default): `const serverId = String(req.params.serverId ?? "");`
- line 153 (drop-nullish-default): `res.json(await deps.externalMcpOAuth.pollDeviceAuthorization({ serverId: String(req.params.serverId ?? "") }));`
- line 180 (drop-nullish-default): `await deps.externalMcpOAuth.disconnect({ serverId: String(req.params.serverId ?? "") });`

## row 35 (T1) apps/website/src/assistant/tool-approval-policy.ts (sha 9469f4ae66c391cf9f11dfed00e98143e1f32ec7)
tests: apps/website/src/assistant/__tests__/tool-approval-policy.test.ts apps/website/src/assistant/__tests__/tool-registrations.trash-item.test.ts apps/website/src/features/custom-credentials/__tests__/credential-save-tool.unit.test.ts apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts
- line 66 (guard-never-fires): `if (/\btrash\b/.test(action)) return 'trash';`
- line 67 (guard-never-fires): `if (/\b(?:delete|purge|destroy|truncate)\b/.test(action)) return 'delete';`
- line 68 (guard-never-fires): `if (restores && (args.overwrite === true || args.replaceExisting === true || /\bover existing\b/.test(action))) return 'restore-over-existing';`
- line 69 (guard-never-fires): `if (/\b(?:publish|unpublish|deploy|send|deliver)\b/.test(action) || args.status === 'published' || typeof args.published === 'boolean') return 'publish';`
- line 71 (guard-never-fires): `if (/^(?:This tool\s+)?(?:publishes|unpublishes|deploys|sends|delivers|publish|unpublish|deploy|send|deliver)\b/i.test(description ?? '')) return 'publish';`
- line 72 (guard-never-fires): `if (/\b(?:trashes|moves? .{0,80} to (?:the )?trash)\b/i.test(description ?? '')) return 'trash';`
- line 73 (guard-never-fires): `if (/\brestores?\b.{0,80}\b(?:over|replaces?|replacing|overwrites?|overwriting)\b.{0,40}\b(?:existing|current)\b/i.test(description ?? '')) return 'restore-over-existing';`
- line 74 (guard-never-fires): `if (/\b(?:deletes|purges|permanently removes)\b/i.test(description ?? '')) return 'delete';`
- line 75 (guard-never-fires): `if (restores) return 'edit';`
- line 76 (guard-never-fires): `if (/\btrash\b/.test(declaredAction)) return 'trash';`
- line 77 (guard-never-fires): `if (/\b(?:publish|unpublish|deploy|send|deliver)\b/.test(declaredAction)) return 'publish';`
- line 78 (guard-never-fires): `if (/\b(?:delete|purge|destroy|truncate)\b/.test(declaredAction)) return 'delete';`
- line 79 (guard-never-fires): `if (annotations?.destructiveHint === true) return 'delete';`

## row 47 (T1) apps/website/src/features/publish-trust/revocations.ts (sha 561696da58c93415e493211d71363a83387c75fb)
tests: apps/website/src/features/publish-trust/__tests__/revocations.test.ts
- line 100 (guard-never-fires): `if (text.length > MAX_DOCUMENT_BYTES) return { ok: false, reason: `revocation list exceeds ${MAX_DOCUMENT_BYTES} bytes` };`
- line 110 (guard-never-fires): `if (raw.length > MAX_REVOCATIONS) return { ok: false, reason: `revocation list holds more than ${MAX_REVOCATIONS} records` };`
- line 114 (guard-never-fires): `if (typeof entry !== "object" || entry === null) return { ok: false, reason: "each revocation must be an object" };`
- line 116 (guard-never-fires): `if (!isBoundedString(sourceInstallationId)) return { ok: false, reason: "each revocation needs a 'sourceInstallationId'" };`
- line 212 (guard-never-fires): `if (input.resolution.state !== "configured") return refuse("site-not-configured");`
- line 117 (guard-never-fires): `if (!isBoundedString(revokedAt) || Number.isNaN(Date.parse(revokedAt))) {`
- line 120 (guard-never-fires): `if (note !== undefined && note !== null && !isBoundedString(note)) {`

## row 40 (T1) apps/website/src/assistant/external-mcp-reauth-tool.ts (sha 561696da58c93415e493211d71363a83387c75fb)
tests: apps/website/src/assistant/__tests__/external-mcp-reauth-tool.test.ts apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
- line 204 (guard-never-fires): `if (answer.status !== "received") return { acknowledged: false, reason: answer.status };`
- line 344 (guard-never-fires): `if (!optional.emitSurface) return buildReauthNoSurfaceResult({ serverId, label });`
- line 245 (guard-never-fires): `if (!record.oauthProviderId && !record.oauthClientId) {`
- line 286 (guard-never-fires): `if (!answer.acknowledged) {`
- line 241 (drop-nullish-default): ``${EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID}: '${record.label ?? serverId}' does not use OAuth ` +`
- line 338 (drop-nullish-default): `const label = record.label ?? record.serverId;`
- line 212 (drop-nullish-default): `const input = (ctx.input ?? {}) as Record<string, unknown>;`

## row 49 (T1) apps/admin/src/features/security/SiteKeyTab.tsx (sha 561696da58c93415e493211d71363a83387c75fb)
tests: apps/admin/src/features/security/__tests__/SiteKeyTab.unit.test.tsx apps/admin/src/features/security/__tests__/SiteKeyTab.agent-secrecy.unit.test.tsx apps/admin/src/features/security/__tests__/site-key-copy.i18n.unit.test.tsx
- line 131 (guard-never-fires): `if (!status) return null;`
- line 156 (guard-never-fires): `if (invalid) return "status-warning";`
- line 202 (guard-never-fires): `if (!status?.active) return null;`
- line 256 (guard-never-fires): `if (!status || status.source !== "none") return null;`
- line 89 (guard-never-fires): `if (controller.status === undefined) {`
- line 182 (guard-never-fires): `if (status.source === "env") {`
- line 57 (drop-nullish-default): `return override ?? useWiredSiteKey;`

## row 51 (T1) apps/desktop/src/renderer/site-shell-policy.ts (sha 561696da58c93415e493211d71363a83387c75fb)
tests: apps/desktop/src/renderer/App.hooks.test.ts apps/desktop/src/renderer/shell-bug-fixes.test.ts apps/desktop/src/renderer/use-add-site.hooks.test.ts apps/desktop/src/renderer/use-site-rename.hooks.test.ts apps/desktop/src/renderer/use-site-folders.hooks.test.ts apps/desktop/src/renderer/site-card-actions-wiring.test.ts
- line 15 (guard-never-fires): `if (/(?:^|[\s'"(])(?:\/[\w.~][^\s]*|[A-Za-z]:\\)/.test(message)) return copy[operation];`
- line 56 (guard-never-fires): `if (message.includes('half-initialized or damaged Tovu site')) return copy.incomplete;`
- line 57 (guard-never-fires): `if (message.includes('cannot be examined')) return copy.unreadable;`

## row 50 (T1) apps/website/src/server/inbound/admin-http/routes/users/reset-password.ts (sha 561696da58c93415e493211d71363a83387c75fb)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/reset-password.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/account-protections.test.ts
- line 50 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 58 (drop-nullish-default): `const principalId = String(req.params.principalId ?? "");`
- line 66 (drop-nullish-default): `const body = (req.body ?? {}) as Record<string, unknown>;`

## row 52 (T1) apps/admin/src/features/security/hooks/use-site-key.hooks.ts (sha 561696da58c93415e493211d71363a83387c75fb)
tests: apps/admin/src/features/security/__tests__/use-site-key.unit.test.tsx apps/admin/src/features/security/__tests__/Security.unit.test.tsx apps/admin/src/features/security/__tests__/SiteKeyTab.unit.test.tsx apps/admin/src/features/security/__tests__/site-key-copy.i18n.unit.test.tsx apps/admin/src/features/security/__tests__/site-key-generate-error.unit.test.ts apps/admin/src/features/security/__tests__/SiteKeyTab.agent-secrecy.unit.test.tsx
- line 74 (guard-never-fires): `if (!(e instanceof ApiError)) return { kind: "generic", detail: describeApiError(e, t("unknown error")) };`
- line 92 (drop-nullish-default): `const loadError = query.error?.message ?? null;`

## row 53 (T1) apps/admin/src/features/roles/Roles.tsx (sha 561696da58c93415e493211d71363a83387c75fb)
tests: apps/admin/src/features/roles/__tests__/Roles.unit.test.tsx
- line 293 (guard-never-fires): `if (row.editingId === policy.id) {`
- line 697 (drop-nullish-default): `roles={c.roles ?? []}`
- line 727 (drop-nullish-default): `policies={c.policies ?? []}`

## row 54 (T1) apps/website/src/contracts/headless/assistant-tool-approval-policy.ts (sha 561696da58c93415e493211d71363a83387c75fb)
tests: apps/website/src/assistant/__tests__/tool-approval-policy.test.ts apps/website/src/assistant/__tests__/tool-approval-catalog.test.ts apps/website/src/assistant/__tests__/tool-metadata-projections.test.ts apps/website/src/assistant/__tests__/mcp-ui-allowlist-completeness.test.ts apps/website/src/assistant/__tests__/extension-approval-classification.test.ts apps/website/src/assistant/mcp-federation/__tests__/confirmation-policy.unit.test.ts
- line 47 (guard-never-fires): `if (!Object.hasOwn(TOOL_APPROVAL_POLICY, capabilityId)) throw new Error(`${capabilityId} has no approval classification`);`
- line 48 (guard-never-fires): `if (capabilityId !== 'page.click') return TOOL_APPROVAL_POLICY[capabilityId]!.confirmation === 'direct';`
- line 65 (guard-never-fires): `if (!Object.hasOwn(EXTENSION_TOOL_APPROVAL_POLICY, family)) throw new Error(`${registration.descriptor.id} has no approval classification`);`

## row 56 (T1) apps/website/src/features/site-inspection/site-capabilities.ts (sha 561696da58c93415e493211d71363a83387c75fb)
tests: apps/website/src/features/site-inspection/__tests__/site-capabilities.unit.test.ts apps/website/src/features/site-inspection/__tests__/tool-registrations.unit.test.ts
- line 270 (drop-nullish-default): `const timeoutMs = options.sectionTimeoutMs ?? DEFAULT_SECTION_TIMEOUT_MS;`

## row 55 (T1) apps/admin/src/features/security/hooks/use-site-key-recovery.hooks.ts (sha 561696da58c93415e493211d71363a83387c75fb)
tests: apps/admin/src/features/security/__tests__/use-site-key-recovery.unit.test.ts apps/admin/src/features/security/__tests__/SiteKeyTab.unit.test.tsx apps/admin/src/features/security/__tests__/site-key-copy.i18n.unit.test.tsx apps/admin/src/features/security/__tests__/SiteKeyRecoveryCard.unit.test.tsx
- line 76 (guard-never-fires): `if (affectedWebhooks.length === 0) return base;`

## row 58 (T1) apps/desktop/src/site-scan-policy.ts (sha b33dd7517032e7f3f0573b56f2bd331604d04e56)
tests: apps/desktop/src/site-folders.test.ts apps/desktop/src/shared-sites-home.test.ts
- line 15 (guard-never-fires): `if (normalized === `${home}/Tovu` && sitesHome !== undefined && trimSlashes(sitesHome) === `${normalized}/sites`) return;`

## row 61 (T1) apps/website/src/features/agent-plugins/token-sign-in.ts (sha b33dd7517032e7f3f0573b56f2bd331604d04e56)
tests: apps/website/src/features/agent-plugins/__tests__/unit/token-sign-in.unit.test.ts apps/website/src/features/agent-plugins/__tests__/unit/new-site-agent-plugin-tokens.unit.test.ts
- line 28 (drop-nullish-default): `return declared.length === 1 ? (declared[0] ?? null) : null;`

## row 67 (T1) apps/website/src/server/inbound/admin-http/routes/users/write-policy-permission.ts (sha b33dd7517032e7f3f0573b56f2bd331604d04e56)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/write-policy-permission.test.ts apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/backstop.routes.test.ts
- line 52 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 65 (drop-nullish-default): `const { policyPermission } = await writePolicyPermission({ deps: identityServiceDepsFrom(deps), input: { workspaceId: deps.workspaceId, callerPrincipalId: caller.id, policyId: String(req.params.policy`

## row 65 (T1) apps/website/src/platform/db/vault-credential-inventory.ts (sha b33dd7517032e7f3f0573b56f2bd331604d04e56)
tests: apps/website/src/platform/db/__tests__/sealed-credential-inventory.test.ts
- line 172 (guard-never-fires): `if (value.reason || !value.sealed) return false;`
- line 140 (drop-nullish-default): `entry: { table: ref.table, column: ref.column, workspaceId: identity?.workspaceId ?? null,`
- line 155 (drop-nullish-default): `count += Number(row?.count ?? 0);`

## row 68 (T1) apps/website/src/server/inbound/admin-http/routes/users/remove-policy-permission.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/remove-policy-permission.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/account-protections.test.ts
- line 55 (guard-never-fires): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 55 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 65 (drop-nullish-default): `const rows = await deps.policyPermissionRepo.listByPolicyId({ workspaceId: deps.workspaceId, policyId: String(req.params.policyId ?? "") });`
- line 66 (drop-nullish-default): `const removed = rows.find(row => row.id === String(req.params.policyPermissionId ?? ""));`
- line 76 (drop-nullish-default): `policyId: String(req.params.policyId ?? ""),`
- line 77 (drop-nullish-default): `policyPermissionId: String(req.params.policyPermissionId ?? ""),`

## row 69 (T1) apps/website/src/server/inbound/admin-http/routes/menus/assign-location.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/server/inbound/admin-http/routes/menus/__tests__/assign-location.not-live.test.ts apps/website/src/server/__tests__/admin-menus-routes.test.ts
- line 26 (guard-never-fires): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 32 (guard-never-fires): `if (!locationKey) {`
- line 9 (drop-nullish-default): `const body = (rawBody ?? {}) as Record<string, unknown>;`
- line 10 (drop-nullish-default): `const locationKey = String(body.locationKey ?? "").trim();`
- line 26 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 37 (drop-nullish-default): `const menuId = String(req.params.menuId ?? "");`

## row 70 (T1) apps/desktop/src/agent-plugin-tokens.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/desktop/src/agent-plugin-tokens.test.ts
- line 125 (drop-nullish-default): `const { pluginId, displayName, helpUrl } = (entry ?? {}) as Record<string, unknown>;`

## row 72 (T1) apps/website/src/server/inbound/admin-http/routes/users/attach-policy.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/attach-policy.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/owner-protection.test.ts
- line 42 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 74 (T1) apps/website/src/features/publish-trust/session.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/features/publish-trust/__tests__/handshake.test.ts
- line 122 (guard-never-fires): `if (typeof input.token !== "string" || input.token === "") return refuse("no session token supplied");`
- line 142 (guard-never-fires): `if (typeof payload !== "object" || payload === null) return refuse("session token payload is not an object");`
- line 143 (guard-never-fires): `if (payload.v !== SESSION_PAYLOAD_VERSION) return refuse(`unsupported session token version ${String(payload.v)}`);`
- line 152 (guard-never-fires): `if (payload.workspaceId !== deps.workspaceId) return refuse("session token was minted for another workspace");`
- line 146 (guard-never-fires): `if (Number.isNaN(now) || typeof payload.expiresAtIso !== "string" || Number.isNaN(Date.parse(payload.expiresAtIso))) {`

## row 75 (T1) apps/website/src/assistant/site-credential-store.memory.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/assistant/__tests__/site-credential-store.test.ts
- line 28 (drop-nullish-default): `...context, id: existing?.id ?? assistantVaultId({ context }), provider: record.provider, label: existing?.label ?? "",`
- line 35 (drop-nullish-default): `createdAt: existing?.createdAt ?? record.createdAt, updatedAt: record.updatedAt,`
- line 27 (drop-nullish-default): `await this.vault.put({ expectedRevision: existing?.revision ?? null, record: {`
- line 29 (drop-nullish-default): `isDefault: existing?.isDefault ?? false, revision: (existing?.revision ?? 0) + 1,`

## row 76 (T1) apps/website/src/assistant/execution-credential-store.memory.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/assistant/__tests__/execution-credential-store.test.ts apps/website/src/assistant/__tests__/agents.test.ts apps/website/src/assistant/__tests__/byok-credential.test.ts apps/website/src/assistant/__tests__/live-model-cache.test.ts
- line 30 (drop-nullish-default): `...context, id: existing?.id ?? assistantVaultId({ context }), provider: record.providerId, label: existing?.label ?? "",`
- line 37 (drop-nullish-default): `createdAt: existing?.createdAt ?? record.createdAt, updatedAt: record.updatedAt,`
- line 29 (drop-nullish-default): `await this.vault.put({ expectedRevision: existing?.revision ?? null, record: {`
- line 31 (drop-nullish-default): `isDefault: existing?.isDefault ?? false, revision: (existing?.revision ?? 0) + 1,`

## row 73 (T1) apps/website/src/server/inbound/admin-http/routes/users/assign-role.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/assign-role.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/owner-protection.test.ts
- line 41 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 77 (T1) apps/website/src/platform/db/repos/publish-trust-revocations.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/platform/db/repos/__tests__/publish-trust-revocations.dialects.test.ts
- line 90 (drop-nullish-default): `const revocation = { sourceInstallationId: input.sourceInstallationId, revokedAt: input.nowIso, note: input.note ?? null };`

## row 78 (T1) apps/desktop/src/renderer/use-create-site-plugin-tokens.hooks.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/desktop/src/renderer/use-create-site-plugin-tokens.hooks.test.ts apps/desktop/src/renderer/CreateWebsiteOnboarding.test.ts
- line 71 (guard-never-fires): `if (!enabled) return;`

## row 79 (T1) apps/website/src/server/inbound/admin-http/routes/forms/authoring.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/server/__tests__/routes/html-form-authoring.test.ts
- line 50 (guard-never-fires): `if (mapFormsWriteError(error, res)) return;`
- line 13 (guard-never-fires): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 13 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 18 (drop-nullish-default): `const body = (req.body ?? {}) as Record<string, unknown>;`
- line 20 (drop-nullish-default): `const formId = String(req.params.formId ?? "");`

## row 80 (T1) apps/website/src/server/inbound/admin-http/routes/assistant/put-execution-credential.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/credential-handler-failures.test.ts
- line 52 (guard-never-fires): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 52 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 59 (drop-nullish-default): `const body = (req.body ?? {}) as {`

## row 83 (T1) apps/admin/src/lib/credential-card-guidance.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/admin/src/lib/__tests__/credential-card-guidance.unit.test.ts
- line 8 (drop-nullish-default): `.filter(element => /secret-card/.test(element.dataset.agentElement ?? ""));`

## row 82 (T1) apps/website/src/platform/db/repos/gated-mutation-token-repo.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/platform/db/repos/__tests__/gated-mutation-token-repo.test.ts
- line 98 (guard-never-fires): `if (Number(result.numUpdatedRows) === 0) return { redeemed: false, record };`
- line 125 (drop-nullish-default): `return Number(row?.value ?? 0);`

## row 84 (T1) apps/website/src/server/inbound/admin-http/routes/assistant/get-site-credential.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/credential-handler-failures.test.ts
- line 14 (guard-never-fires): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 27 (guard-never-fires): `if (!authResult.allowed) {`
- line 14 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 90 (T1) apps/website/src/server/inbound/admin-http/routes/assistant/get-execution-credential.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/credential-handler-failures.test.ts
- line 15 (guard-never-fires): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 15 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 89 (T1) apps/admin/src/features/security/hooks/site-key-status.rules.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/admin/src/features/security/__tests__/site-key-status.rules.unit.test.ts apps/admin/src/features/security/__tests__/site-key-copy.i18n.unit.test.tsx
- line 10 (guard-never-fires): `if (!status.active) return t("None");`

## row 92 (T1) apps/admin/src/features/security/SiteKeyRecoveryCard.tsx (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/admin/src/features/security/__tests__/SiteKeyRecoveryCard.unit.test.tsx
- line 67 (guard-never-fires): `if (recovery.startFreshStep === "closed") {`

## row 96 (T1) apps/admin/src/features/security/CopyKeysDialog.tsx (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/admin/src/features/security/__tests__/CopyKeysDialog.unit.test.tsx
- line 9 (guard-never-fires): `if (!dialog.open) return null;`

## row 99 (T1) apps/website/src/platform/db/vault-credential-recovery.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/platform/db/__tests__/sealed-credential-discard.test.ts
- line 59 (guard-never-fires): `if (!record) return 0;`
- line 127 (guard-never-fires): `if (!value.sealed) continue;`
- line 130 (guard-never-fires): `if (await deps.sealer.open({ sealed }, { aad: value.aad }) !== plaintext) throw new Error("Credential recovery verification failed");`
- line 129 (drop-nullish-default): `const sealed = await deps.sealer.seal({ plaintext, key: deps.key, aad: value.aad ?? "" });`

## row 97 (T1) apps/website/src/platform/db/migrations/0012_secrets_vault.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/platform/db/migrations/__tests__/secrets-vault-step.test.ts
- line 77 (guard-never-fires): `if (typeof value !== "string") throw new Error(`secrets vault: invalid source field ${field}`);`
- line 180 (guard-never-fires): `if (name === "workspace_id") return "workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE";`
- line 182 (guard-never-fires): `if (name === "auth_mode") return "auth_mode text NOT NULL DEFAULT 'static_env'";`
- line 222 (guard-never-fires): `if (!approvals && statement.includes("_vault_mcp_approvals")) continue;`
- line 139 (drop-nullish-default): `return `vault:${JSON.stringify([kind, row.principal_id ?? row.provider_id ?? row.server_id ?? null])}`;`
- line 152 (drop-nullish-default): `serverId: nullable({ row, field: "server_id" }), aadVersion: Number(row[kind === "mcp-auth" ? "oauth_aad_version" : "aad_version"] ?? 1) };`

## row 101 (T1) apps/website/src/features/source-control/credential-form.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/features/source-control/__tests__/credential-form.unit.test.ts
- line 68 (guard-never-fires): `if (!isPlainObject(entry)) return `${at} must be an object`;`
- line 73 (guard-never-fires): `if (required !== undefined && typeof required !== "boolean") return `${at}.required must be a boolean`;`
- line 74 (guard-never-fires): `if (secret !== undefined && typeof secret !== "boolean") return `${at}.secret must be a boolean`;`
- line 79 (guard-never-fires): `if (typeof value !== "string" || value.length > 500) return false;`

## row 102 (T1) apps/website/src/features/publish-trust/challenge.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/features/publish-trust/__tests__/handshake.test.ts
- line 162 (guard-never-fires): `if (typeof response?.nonce !== "string" || response.nonce === "") return refuse("no nonce supplied");`
- line 172 (guard-never-fires): `if (issued.targetInstallationId !== input.targetInstallationId) return refuse("nonce was issued for another destination");`
- line 174 (guard-never-fires): `if (response.sourceInstallationId !== grant.sourceInstallationId) {`
- line 178 (guard-never-fires): `if (!Array.isArray(response.capabilities) || response.capabilities.length === 0) {`

## row 104 (T1) apps/website/src/assistant/assistant-vault.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/assistant/__tests__/site-credential-store.test.ts apps/website/src/assistant/__tests__/execution-credential-store.test.ts
- line 12 (guard-never-fires): `if (!("vault" in repo)) throw new VaultError({ code: "invalid-record" });`
- line 14 (guard-never-fires): `if (!vault?.findOne) throw new VaultError({ code: "invalid-record" });`
- line 37 (guard-never-fires): `if (context.kind !== "site-assistant" && context.kind !== "personal-execution") throw new VaultError({ code: "context" });`
- line 54 (guard-never-fires): `if (!repo.findOne) throw new VaultError({ code: "invalid-record" });`
- line 57 (guard-never-fires): `if (buildVaultAad({ ...context, id: raw.id }) !== buildVaultAad(raw)) throw new VaultError({ code: "context" });`

## row 103 (T1) apps/website/src/assistant/external-mcp-vault.ts (sha 57f0ee959e3001b005b215b754d0e1a27efb9590)
tests: apps/website/src/assistant/__tests__/external-mcp-aad.test.ts apps/website/src/assistant/__tests__/external-mcp-dcr.test.ts apps/website/src/assistant/__tests__/external-mcp-oauth.test.ts apps/website/src/assistant/__tests__/external-mcp-store.test.ts apps/website/src/assistant/__tests__/external-mcp-aad-writer-sync.test.ts apps/website/src/assistant/__tests__/external-mcp-payload-version.test.ts
- line 16 (guard-never-fires): `if (!record.sealed) return null;`
- line 36 (guard-never-fires): `if (requested !== "mcp-env" && requested !== "mcp-auth") throw new VaultError({ code: "context" });`
- line 60 (guard-never-fires): `if (!record?.sealed) throw new VaultError({ code: "invalid-record" });`
- line 80 (guard-never-fires): `if (!opened?.payload) throw new VaultError({ code: "invalid-record" });`
- line 107 (guard-never-fires): `if (!id) return;`

## row 105 (T1) apps/website/src/server/inbound/assistant/early-run-session.ts (sha b8dd6cf54b808b198d2ad5fb4ddc50ccd0e104ec)
tests: apps/website/src/server/inbound/assistant/__tests__/early-run-session.unit.test.ts
- line 8 (guard-never-fires): `if (event.payload === null || typeof event.payload !== "object") return undefined;`
- line 34 (guard-never-fires): `if (!sessionId) return;`
- line 37 (guard-never-fires): `if (!accepted) return;`
- line 39 (guard-never-fires): `if (typeof childPid !== "number" || !attemptStore) return;`

## row 108 (T1) apps/website/src/server/inbound/admin-http/routes/users/update-policy.ts (sha b8dd6cf54b808b198d2ad5fb4ddc50ccd0e104ec)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/update-policy.test.ts
- line 43 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 51 (drop-nullish-default): `const { policy } = await updatePolicy({ deps: identityServiceDepsFrom(deps), input: { workspaceId: deps.workspaceId, callerPrincipalId: caller.id, policyId: String(req.params.policyId ?? "") } }, { ..`

## row 106 (T1) apps/website/src/server/inbound/admin-http/routes/users/update-role.ts (sha b8dd6cf54b808b198d2ad5fb4ddc50ccd0e104ec)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/update-role.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/account-protections.test.ts
- line 32 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 46 (drop-nullish-default): `roleId: String(req.params.roleId ?? ""),`
- line 47 (drop-nullish-default): `name: String(body.name ?? ""),`

## row 110 (T1) apps/website/src/server/inbound/admin-http/routes/users/delete-policy.ts (sha b8dd6cf54b808b198d2ad5fb4ddc50ccd0e104ec)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/delete-policy.test.ts
- line 36 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 49 (drop-nullish-default): `policyId: String(req.params.policyId ?? ""),`

## row 109 (T1) apps/website/src/server/inbound/admin-http/routes/users/delete-role.ts (sha b8dd6cf54b808b198d2ad5fb4ddc50ccd0e104ec)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/delete-role.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/account-protections.test.ts
- line 36 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 49 (drop-nullish-default): `roleId: String(req.params.roleId ?? ""),`

## row 111 (T1) apps/website/src/server/inbound/admin-http/routes/assistant/stored-credential-probe.ts (sha b8dd6cf54b808b198d2ad5fb4ddc50ccd0e104ec)
tests: apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/stored-credential-probe.admin.test.ts
- line 155 (drop-nullish-default): `{ workspaceId: deps.workspaceId, principalId: String(input.principalId ?? "") }`

## row 112 (T1) apps/admin/src/features/security/hooks/use-copy-keys.hooks.ts (sha b8dd6cf54b808b198d2ad5fb4ddc50ccd0e104ec)
tests: apps/admin/src/features/security/__tests__/CopyKeysDialog.unit.test.tsx apps/admin/src/features/security/__tests__/AccessTokensTab.unit.test.tsx
- line 64 (guard-never-fires): `if (disabled || busy.current) return;`
- line 82 (guard-never-fires): `if (!canStart || !startSite || !hint || busy.current) return;`
- line 95 (drop-nullish-default): `text: `${key.label} · ${key.provider ?? key.kind}${key.last4?.length === 4 ? ` · …${key.last4}` : ""}` })),`

## row 107 (T1) apps/website/src/features/custom-credentials/credential-save-tool.ts (sha b8dd6cf54b808b198d2ad5fb4ddc50ccd0e104ec)
tests: apps/website/src/features/custom-credentials/__tests__/credential-save-tool.unit.test.ts apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts apps/website/src/features/media-generation/__tests__/providers-tools.test.ts apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts apps/website/src/features/source-control/__tests__/propose-credential-tool.test.ts apps/website/src/features/custom-credentials/__tests__/create-agent-tool.unit.test.ts
- line 59 (guard-never-fires): `if (!KINDS.includes(kind as CredentialKind)) throw new ToolInputError({ message: 'Unknown credential kind. Use api, media-provider, source-control, publish-host or agent-plugin-token.' });`
- line 90 (guard-never-fires): `if ('pluginId' in hints) throw new ToolInputError({ message: 'Use target for the installed plugin id.' });`

## row 114 (T1) apps/website/src/server/inbound/admin-http/routes/users/create-policy.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/create-policy.test.ts
- line 38 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 115 (T1) apps/desktop/src/project-delete-guard.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/desktop/src/project-delete-guard.test.ts
- line 101 (guard-never-fires): `if (typeof row?.siteId !== "string" || row.siteId === "") return false;`
- line 133 (guard-never-fires): `if (parent === candidate) return absolute;`
- line 153 (guard-never-fires): `if (relative === "") return true;`
- line 178 (guard-never-fires): `if (row?.origin !== SITE_ORIGIN.created) return false;`

## row 116 (T1) apps/website/src/server/inbound/admin-http/routes/users/create-role.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/create-role.test.ts
- line 10 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 23 (drop-nullish-default): `name: String(req.body?.name ?? ""),`

## row 119 (T1) apps/admin/src/lib/stored-credential-endpoint.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/admin/src/lib/__tests__/stored-credential-endpoint.unit.test.ts
- line 59 (guard-never-fires): `if (apiKey.trim()) return true;`

## row 121 (T1) apps/website/src/server/inbound/admin-http/routes/assistant/delete-site-credential.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/credential-handler-failures.test.ts
- line 14 (guard-never-fires): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 27 (guard-never-fires): `if (!authResult.allowed) {`
- line 14 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 122 (T1) apps/website/src/contracts/core/native-approval-memory.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/contracts/core/__tests__/native-approval-memory.test.ts apps/website/src/features/settings/__tests__/settings-write-tools.test.ts apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-families.test.ts
- line 26 (guard-never-fires): `if (!store.hasIdentity) throw new ToolInputError({ message: 'NATIVE_APPROVAL_MEMORY_UNAVAILABLE: The approval store cannot reuse identity grants. Nothing was changed.' });`

## row 126 (T1) apps/website/src/contracts/core/gated-mutations/token.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/contracts/core/gated-mutations/__tests__/unit/token.unit.test.ts apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts apps/website/src/features/recovery/__tests__/unit/gated-hooks.unit.test.ts apps/website/src/features/recovery/__tests__/unit/permissions.unit.test.ts apps/website/src/features/publish-content/__tests__/execute-pull-tool.test.ts apps/website/src/contracts/core/gated-mutations/__tests__/unit/gateway.unit.test.ts
- line 83 (guard-never-fires): `if (typeof store.expire !== "function") throw new Error("atomic confirmation-token expiry is not configured");`

## row 131 (T1) apps/website/src/contracts/core/approval-i18n.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/assistant/__tests__/tool-approval-policy.test.ts
- line 28 (drop-nullish-default): `return (APPROVAL_COPY[locale as keyof typeof APPROVAL_COPY] ?? APPROVAL_COPY.en)[KEYS.indexOf(key)];`

## row 151 (T1) apps/website/src/features/origin/configured-origin.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/features/origin/__tests__/configured-origin.test.ts
- line 75 (drop-nullish-default): `env: optional.env ?? process.env,`

## row 133 (T1) apps/admin/src/features/forms/forms-leave-guard-i18n.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/admin/src/features/forms/__tests__/forms-leave-guard-i18n.unit.test.ts
- line 63 (drop-nullish-default): `Object.fromEntries(FORMS_LEAVE_GUARD_KEYS.map((key, index) => [key, values[index] ?? key])),`

## row 152 (T1) apps/website/src/features/publish-trust/keys.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/features/publish-trust/__tests__/keys.test.ts apps/website/src/features/publish-trust/__tests__/keys-fail-closed-guard.unit.test.ts apps/website/src/features/publish-trust/__tests__/handshake.test.ts
- line 74 (guard-never-fires): `if (typeof value !== "string" || value === "") return null;`

## row 158 (T2) apps/website/src/server/inbound/public-http/http/site/form-render.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/public-http/http/site/__tests__/form-render.unit.test.ts apps/website/src/features/forms/__tests__/common-fields.test.ts apps/website/src/server/inbound/public-http/http/site/__tests__/form-theme-colours.test.ts apps/website/src/server/inbound/public-http/http/site/__tests__/form-attempt-token.unit.test.ts apps/website/src/server/inbound/public-http/http/site/__tests__/form-validation-friendly.test.ts apps/website/src/server/inbound/public-http/http/site/__tests__/form-field-types-style.unit.test.ts
- line 334 (guard-never-fires): `if (!field) return null;`
- line 341 (guard-never-fires): `if (!rawString || rawString.length > FORM_RESULT_MAX_FIELD_STRING_LEN * FORM_RESULT_MAX_FIELD_ERRORS) return [];`
- line 348 (guard-never-fires): `if (!Array.isArray(parsed)) return [];`
- line 368 (guard-never-fires): `if (!slug || !status) return undefined;`
- line 369 (guard-never-fires): `if (status === "success") return { kind: "success", slug };`
- line 370 (guard-never-fires): `if (status === "error") return { kind: "error", slug };`
- line 493 (guard-never-fires): `if (withTextarea !== html) return withTextarea;`
- line 528 (guard-never-fires): `if (!result) return html;`
- line 532 (guard-never-fires): `if (!formMatch) return html;`
- line 663 (guard-never-fires): `if (!isNonArrayRecord(candidate)) return false;`
- line 664 (guard-never-fires): `if (typeof candidate.value.slug !== "string" || !candidate.value.slug) return false;`
- line 689 (guard-never-fires): `if (!raw) return undefined;`
- line 696 (guard-never-fires): `if (!isFlashPayloadShape(parsed)) return undefined;`

## row 161 (T2) apps/website/src/server/inbound/admin-http/routes/system/deployment-overview.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/__tests__/routes/deployment-overview-site-key-row.test.ts
- line 157 (guard-never-fires): `if (!owner) return false;`
- line 163 (guard-never-fires): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 176 (guard-never-fires): `if (!authResult.allowed) {`
- line 163 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 162 (T2) apps/website/src/server/inbound/admin-http/routes/agent-plugins/set-enabled.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-set-enabled.integration.test.ts apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-set-enabled-busy.integration.test.ts
- line 253 (guard-never-fires): `if (candidate === undefined) {`
- line 119 (drop-nullish-default): `version: candidate.version ?? null,`
- line 120 (drop-nullish-default): `description: candidate.description ?? null,`
- line 217 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 222 (drop-nullish-default): `const pluginId = String(req.params.pluginId ?? "");`

## row 159 (T2) apps/website/src/server/inbound/admin-http/routes/themes/explore.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-svg-xss.test.ts apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-io-errors.unit.test.ts apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-detail-modified.test.ts apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-liquid-readable.test.ts apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-built-theme-gate.test.ts apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-pure-helpers.unit.test.ts
- line 321 (guard-never-fires): `if (post.status !== "published" || isTrashed(post)) continue;`
- line 395 (guard-never-fires): `if (err instanceof ThemePathError) return null;`
- line 492 (guard-never-fires): `if (pageId === "index") return contentBySlug.get(ROOT_SLUG) ?? null;`
- line 493 (guard-never-fires): `if (pageId === null || !isPublishableThemePageCandidate(theme, pageId)) return null;`
- line 514 (guard-never-fires): `if (!(await authorizeThemeAccess(deps, req, res))) return;`
- line 517 (guard-never-fires): `if (!theme) return;`
- line 577 (guard-never-fires): `if (!(await authorizeThemeAccess(deps, req, res))) return;`
- line 580 (guard-never-fires): `if (!theme) return;`
- line 602 (guard-never-fires): `if (typeof body.content !== "string") return { ok: false };`
- line 652 (guard-never-fires): `if (!(await authorizeThemeAccess(deps, req, res))) return;`
- line 655 (guard-never-fires): `if (!theme) return;`
- line 827 (guard-never-fires): `if (!(await authorizeThemeAccess(deps, req, res))) return;`
- line 830 (guard-never-fires): `if (!theme) return;`

## row 160 (T2) apps/website/src/server/inbound/public-http/routes/site/products.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/public-http/routes/site/__tests__/products.route.test.ts apps/website/src/server/__tests__/routes/request-cost-render-work.measurement.test.ts apps/website/src/server/__tests__/routes/request-cost-cacheability.measurement.test.ts apps/website/src/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts
- line 62 (drop-nullish-default): `return (await deps.store?.listProducts()) ?? [];`
- line 98 (drop-nullish-default): `const id = String(req.params.id ?? "");`

## row 165 (T2) apps/website/src/server/inbound/assistant/plugin-prompt-prefix.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/assistant/__tests__/plugin-prompt-prefix.unit.test.ts apps/website/src/server/inbound/assistant/__tests__/capability-manifest-prefix.unit.test.ts
- line 47 (guard-never-fires): `if (pluginRefIds.length === 0) return "";`

## row 163 (T2) apps/website/src/server/inbound/admin-http/http/widgets.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/__tests__/widgets-error-code-parity.test.ts apps/website/src/server/inbound/admin-http/http/__tests__/plugin-hook-error.test.ts
- line 43 (guard-never-fires): `if (!authResult.allowed) {`
- line 89 (drop-nullish-default): `body: { error: err.message, code: "WIDGETS_FORBIDDEN", details: { permission: match?.[1] ?? "", reason: match?.[2] ?? "" } },`

## row 164 (T2) apps/website/src/server/inbound/public-http/routes/site/store.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/public-http/routes/site/__tests__/store.route.test.ts apps/website/src/server/inbound/public-http/routes/site/__tests__/store-return-query.test.ts apps/website/src/server/__tests__/routes/request-cost-cacheability.measurement.test.ts
- line 41 (guard-never-fires): `if (!store) {`
- line 86 (drop-nullish-default): `const productId = String(req.query.productId ?? "");`

## row 168 (T2) apps/website/src/server/inbound/admin-http/routes/presentation/get.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/admin-http/routes/presentation/__tests__/get.test.ts
- line 46 (guard-never-fires): `if (!authResult.allowed) {`
- line 28 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 166 (T2) apps/website/src/server/inbound/admin-http/routes/menus/update-tree.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/admin-http/routes/menus/__tests__/update-tree.not-live.test.ts apps/website/src/server/__tests__/admin-menus-routes.test.ts apps/website/src/server/__tests__/admin-menu-page-roundtrip.test.ts apps/website/src/server/inbound/admin-http/routes/menus/__tests__/menu-html-mode.test.ts
- line 75 (drop-nullish-default): `console.error(`admin menu update-tree route failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);`
- line 33 (drop-nullish-default): `expectedVersion: Number(body.expectedVersion ?? 0),`
- line 96 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 107 (drop-nullish-default): `const menuId = String(req.params.menuId ?? "");`

## row 167 (T2) apps/website/src/server/inbound/public-http/middleware/theme-static-assets.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/public-http/middleware/__tests__/theme-static-assets.test.ts apps/website/src/server/inbound/public-http/middleware/__tests__/theme-preview-refresh.test.ts
- line 152 (guard-never-fires): `if (candidate === null) continue;`
- line 73 (drop-nullish-default): `const themeId = String(req.params.themeId ?? "");`
- line 96 (drop-nullish-default): `try { relativePath = decodeURIComponent(req.url.split("?", 1)[0] ?? "").replace(/^\/+/, ""); }`

## row 170 (T2) apps/website/src/server/inbound/assistant/durable-run-routes.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/assistant/__tests__/durable-run-routes.unit.test.ts apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.durable-binding.unit.test.ts
- line 80 (guard-never-fires): `if (run.cancelReason || !["queued", "running"].includes(run.message.runStatus ?? "")) return "stale";`
- line 93 (guard-never-fires): `if (result?.status !== "completed") return send(body);`
- line 31 (guard-never-fires): `if (typeof body.runId !== "string") { next(); return; }`
- line 56 (guard-never-fires): `if (typeof body.runId !== "string" || typeof body.toolId !== "string") { next(); return; }`
- line 61 (guard-never-fires): `if (!store) { next(); return; }`
- line 41 (drop-nullish-default): `res.status(201).json({ run: (await lifecycle.get({ runId })) ?? started.run, started: started.started });`
- line 14 (drop-nullish-default): `const body = (req.body ?? {}) as { contextRef?: unknown };`
- line 30 (drop-nullish-default): `const body = (req.body ?? {}) as { runId?: unknown; contextRef?: unknown; agentId?: string };`

## row 169 (T2) apps/website/src/server/inbound/admin-http/routes/external-mcp/probe.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/__tests__/admin-external-mcp-probe-routes.test.ts
- line 79 (drop-nullish-default): `const serverId = String(req.params.serverId ?? "");`

## row 172 (T2) apps/website/src/server/inbound/admin-http/routes/agent-plugins/install.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-install-zip.integration.test.ts
- line 79 (guard-never-fires): `if (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(expectedSha256)) {`
- line 96 (guard-never-fires): `if (replace !== undefined && replace !== "true" && replace !== "false") {`
- line 71 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 107 (drop-nullish-default): `displayName: candidate.displayName ?? null,`
- line 108 (drop-nullish-default): `summary: candidate.summary ?? null,`
- line 109 (drop-nullish-default): `version: candidate.version ?? null,`
- line 110 (drop-nullish-default): `description: candidate.description ?? null,`

## row 171 (T2) apps/website/src/server/inbound/admin-http/routes/settings/events.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/__tests__/routes/settings-events-resume.test.ts apps/website/src/server/__tests__/routes/settings-events-id-disclosure.test.ts apps/website/src/server/inbound/admin-http/routes/settings/__tests__/preview-feed-access.test.ts
- line 194 (guard-never-fires): `if (cached !== undefined) return cached;`
- line 228 (guard-never-fires): `if (closed) return;`
- line 247 (guard-never-fires): `if (closed || ticking) return;`
- line 256 (guard-never-fires): `if (!access.settings) return;`
- line 139 (guard-never-fires): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 139 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 196 (drop-nullish-default): `const namespace = definition?.namespace ?? null;`

## row 173 (T2) apps/website/src/server/inbound/admin-http/routes/users/update.ts (sha fda996e7f58c1ec11af912a5273a847b510fcb7c)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/update.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/create.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/owner-protection.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/account-protections.test.ts
- line 14 (guard-never-fires): `if (body.username !== undefined && typeof body.username !== "string") {`
- line 79 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 86 (drop-nullish-default): `const principalId = String(req.params.principalId ?? "");`

## row 175 (T2) apps/website/src/server/inbound/admin-http/routes/assistant/test-agent.ts (sha 240b6046ee1b1128865f00fe11bddfb5bb79510c)
tests: apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/test-agent-mock-module.test.ts
- line 45 (guard-never-fires): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 10 (drop-nullish-default): `const body = (rawBody ?? {}) as Record<string, unknown>;`
- line 13 (drop-nullish-default): `model: String(body.model ?? "").trim(),`
- line 45 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 174 (T2) apps/website/src/server/inbound/admin-http/routes/seo/put-entry.ts (sha 240b6046ee1b1128865f00fe11bddfb5bb79510c)
tests: apps/website/src/server/inbound/admin-http/routes/seo/__tests__/put-entry.test.ts apps/website/src/server/__tests__/routes/seo-site-serving.test.ts
- line 19 (guard-never-fires): `if (live) return live;`
- line 46 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 177 (T2) apps/website/src/server/inbound/admin-http/routes/assistant/list-models.ts (sha 240b6046ee1b1128865f00fe11bddfb5bb79510c)
tests: apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/connection-probe-ssrf.test.ts
- line 81 (guard-never-fires): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 94 (guard-never-fires): `if (!authResult.allowed) {`
- line 113 (guard-never-fires): `if (!baseUrl.trim()) {`
- line 147 (guard-never-fires): `if (!credential.ok) {`
- line 81 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 103 (drop-nullish-default): `const body = (req.body ?? {}) as ListModelsRequestBody;`

## row 176 (T2) apps/website/src/server/inbound/admin-http/routes/settings/shared.ts (sha 240b6046ee1b1128865f00fe11bddfb5bb79510c)
tests: apps/website/src/server/inbound/admin-http/routes/settings/__tests__/shared.unit.test.ts apps/website/src/server/__tests__/assistant-byok-routes.test.ts
- line 215 (guard-never-fires): `if (method !== "get" && await touchesAssistantSubagents({ body: input.body, repo: deps.settingsRepo, workspaceId: deps.workspaceId })) {`
- line 222 (guard-never-fires): `if (String(raw.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 166 (drop-nullish-default): `return { ...service, set: (input) => (required.deps.set ?? set)({ deps, input }) };`
- line 222 (drop-nullish-default): `if (String(raw.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 179 (T2) apps/website/src/server/inbound/admin-http/routes/assistant/test-connection.ts (sha 240b6046ee1b1128865f00fe11bddfb5bb79510c)
tests: apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/connection-probe-ssrf.test.ts
- line 29 (guard-never-fires): `if (result.ok) return result.detail?.trim() ? result.detail : "Connection succeeded";`
- line 91 (guard-never-fires): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 104 (guard-never-fires): `if (!authResult.allowed) {`
- line 141 (guard-never-fires): `if (!credential.ok) {`
- line 91 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 113 (drop-nullish-default): `const body = (req.body ?? {}) as TestConnectionRequestBody;`

## row 178 (T2) apps/website/src/server/inbound/admin-http/routes/presentation/patch-active-theme.ts (sha 240b6046ee1b1128865f00fe11bddfb5bb79510c)
tests: apps/website/src/server/inbound/admin-http/routes/presentation/__tests__/patch-active-theme.test.ts apps/website/src/features/theme/__tests__/preview-refresh.test.ts
- line 51 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 181 (T2) apps/website/src/server/inbound/admin-http/routes/assistant/detect-agents.ts (sha 240b6046ee1b1128865f00fe11bddfb5bb79510c)
tests: apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/detect-agents-route.test.ts apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/detect-agents-projection.test.ts
- line 152 (guard-never-fires): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 175 (drop-nullish-default): `const agents = await (inventory ? inventory.read(input) : (deps.assistantAgentInventory?.listDetectedAssistantAgents ?? listDetectedAssistantAgents)(input));`
- line 176 (drop-nullish-default): `const discoveryPending = inventory ? inventory.isPending({}) : (deps.assistantAgentInventory?.assistantAgentDiscoveryPending ?? assistantAgentDiscoveryPending)();`
- line 152 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 182 (T2) apps/website/src/server/inbound/admin-http/routes/agent-plugins/files.ts (sha 9b31543384b49e6179eb6f673825e34d1c6036c9)
tests: apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-files.integration.test.ts apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-memory.integration.test.ts
- line 26 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 31 (drop-nullish-default): `const pluginId = String(req.params.pluginId ?? "");`

## row 183 (T2) apps/website/src/server/inbound/admin-http/routes/users/list.ts (sha 9b31543384b49e6179eb6f673825e34d1c6036c9)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/list.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/create.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/account-protections.test.ts
- line 24 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 186 (T2) apps/website/src/server/inbound/admin-http/routes/sites/sites-home.ts (sha 9b31543384b49e6179eb6f673825e34d1c6036c9)
tests: apps/website/src/server/inbound/admin-http/routes/sites/sites-home.unit.test.ts apps/website/src/platform/site-dir/__tests__/unit/shared-sites-home.unit.test.ts apps/website/src/platform/site-dir/__tests__/unit/sites-config.unit.test.ts
- line 36 (guard-never-fires): `if (selected === undefined) throw new Error("Choose an absolute folder path for sites settings.");`
- line 19 (guard-never-fires): `if (method === "get") { res.json(workspace.config({})); return; }`
- line 15 (drop-nullish-default): `if (!(deps.isSiteSwitcherEnabled ?? isSiteSwitcherEnabled)()) { res.status(403).json({ error: "Local sites management is disabled." }); return; }`
- line 30 (drop-nullish-default): `if (!(deps.isSiteSwitcherEnabled ?? isSiteSwitcherEnabled)()) { res.status(403).json({ error: "Local sites management is disabled." }); return; }`
- line 14 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }`

## row 189 (T2) apps/website/src/server/inbound/admin-http/routes/fs-files/custom-root.ts (sha 9b31543384b49e6179eb6f673825e34d1c6036c9)
tests: apps/website/src/server/inbound/admin-http/routes/fs-files/__tests__/custom-root.test.ts apps/website/src/server/inbound/admin-http/routes/fs-files/__tests__/custom-root-permission.test.ts
- line 64 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 188 (T2) apps/website/src/server/inbound/admin-http/routes/users/create.ts (sha 9b31543384b49e6179eb6f673825e34d1c6036c9)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/create.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/owner-protection.test.ts
- line 57 (guard-never-fires): `if (!username) return false;`
- line 59 (guard-never-fires): `if (!existingUser) return false;`
- line 17 (drop-nullish-default): `password: String(body.password ?? ""),`
- line 76 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 187 (T2) apps/website/src/server/inbound/admin-http/routes/forms/update.ts (sha 9b31543384b49e6179eb6f673825e34d1c6036c9)
tests: apps/website/src/server/__tests__/routes/forms-auth.test.ts apps/website/src/server/__tests__/routes/forms-admin-crud.test.ts
- line 71 (guard-never-fires): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 71 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 76 (drop-nullish-default): `const formId = String(req.params.formId ?? "");`
- line 77 (drop-nullish-default): `const body = (req.body ?? {}) as Record<string, unknown>;`

## row 192 (T2) apps/website/src/server/inbound/public-http/http/site/bare-page.ts (sha 9b31543384b49e6179eb6f673825e34d1c6036c9)
tests: apps/website/src/server/inbound/public-http/http/site/__tests__/bare-page.unit.test.ts
- line 140 (drop-nullish-default): `required.widgetInlineResolved ?? EMPTY_INLINE_RESOLVED,`
- line 141 (drop-nullish-default): `required.mediaTransformVersions ?? EMPTY_MEDIA_TRANSFORM_VERSIONS,`
- line 142 (drop-nullish-default): `required.mediaAssetMetadata ?? EMPTY_MEDIA_ASSET_METADATA`
- line 75 (drop-nullish-default): `const foldHasTitle = required.extraHead?.includes("<title>") ?? false;`
- line 79 (drop-nullish-default): ``<meta name="viewport" content="width=device-width, initial-scale=1"/>${titleTag}${required.extraHead ?? ""}` +`
- line 133 (drop-nullish-default): `const rawBodyHtml = post.bodyHtml ?? "";`

## row 191 (T2) apps/website/src/server/inbound/admin-http/routes/users/enable.ts (sha 9b31543384b49e6179eb6f673825e34d1c6036c9)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/enable.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/create.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/owner-protection.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/account-protections.test.ts
- line 23 (drop-nullish-default): `const principalId = String(req.params.principalId ?? "");`

## row 193 (T2) apps/website/src/server/inbound/admin-http/routes/users/delete.ts (sha 649720023ff11385b17ce2d32975911312e1274f)
tests: apps/website/src/server/inbound/admin-http/routes/users/__tests__/delete.test.ts apps/website/src/server/inbound/admin-http/routes/users/__tests__/account-protections.test.ts
- line 49 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 63 (drop-nullish-default): `principalId: String(req.params.principalId ?? ""),`

## row 190 (T2) apps/website/src/server/inbound/admin-http/routes/content-types/update-fields.ts (sha 9b31543384b49e6179eb6f673825e34d1c6036c9)
tests: apps/website/src/server/inbound/admin-http/routes/content-types/__tests__/register-update-fields.conflict.test.ts apps/website/src/server/__tests__/routes/content-types-routes.test.ts apps/website/src/server/__tests__/routes/content-types-field-shape.test.ts
- line 28 (guard-never-fires): `if (error instanceof ContentTypeAlreadyExistsError) return { status: 409, code: "CONTENT_TYPE_ALREADY_EXISTS" };`

## row 195 (T2) apps/website/src/server/inbound/admin-http/routes/agent-plugins/list.ts (sha 649720023ff11385b17ce2d32975911312e1274f)
tests: apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugins-http.integration.test.ts
- line 62 (drop-nullish-default): `id: candidate.id ?? `unknown/${candidate.pluginId}`,`
- line 37 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`
- line 60 (drop-nullish-default): `version: candidate.version ?? null,`
- line 61 (drop-nullish-default): `description: candidate.description ?? null,`
- line 63 (drop-nullish-default): `provides: candidate.provides ?? [],`

## row 196 (T2) apps/website/src/assistant/a2ui-actions-route.ts (sha 2c4e6f3750be851bb5bbda71bc8ebd636e61120a)
tests: apps/website/src/assistant/__tests__/a2ui-actions-route.test.ts
- line 118 (guard-never-fires): `if (typeof exchangeId !== "string" || exchangeId.length === 0) {`
- line 116 (drop-nullish-default): `const body = (rawBody ?? {}) as { exchangeId?: unknown; message?: unknown };`

## row 197 (T2) apps/website/src/server/inbound/public-http/middleware/theme-preview-refresh.ts (sha 2c4e6f3750be851bb5bbda71bc8ebd636e61120a)
tests: apps/website/src/server/inbound/public-http/middleware/__tests__/theme-preview-refresh.test.ts
- line 89 (guard-never-fires): `if (String(req.params.workspaceId) !== deps.workspaceId) {`
- line 100 (guard-never-fires): `if (!auth.allowed) {`
- line 30 (drop-nullish-default): `const isAsset = /^\/(?:theme-assets|theme-preview-assets)(?:\/|$)/.test(req.path ?? "");`

## row 199 (T2) apps/website/src/server/inbound/public-http/routes/site/analytics-ingest.ts (sha 1e995f985b8e806e5d1152f27ebb4f2d46eb2e7e)
tests: apps/website/src/server/__tests__/routes/analytics-ingest.test.ts apps/website/src/server/inbound/public-http/routes/site/__tests__/analytics-ingest.test.ts
- line 76 (drop-nullish-default): `ip: req.ip ?? req.socket.remoteAddress ?? "",`
- line 77 (drop-nullish-default): `userAgent: req.get("user-agent") ?? "",`
- line 78 (drop-nullish-default): `acceptLanguage: req.get("accept-language") ?? null,`

## row 200 (T2) apps/website/src/server/inbound/admin-http/routes/comments/moderation-queue.ts (sha 809d73c60372a11f9b54a2250c5b0ed12ded6305)
tests: apps/website/src/server/inbound/admin-http/routes/comments/__tests__/moderation-queue.test.ts
- line 28 (drop-nullish-default): `cursor: optionalString({ input: query, key: "cursor" }) ?? null,`
- line 34 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 201 (T2) apps/website/src/server/inbound/admin-http/routes/seo/put-settings.ts (sha 809d73c60372a11f9b54a2250c5b0ed12ded6305)
tests: apps/website/src/server/inbound/admin-http/routes/seo/__tests__/put-settings.test.ts
- line 9 (drop-nullish-default): `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {`

## row 202 (T2) apps/website/src/server/inbound/admin-http/routes/agent-plugins/memory.ts (sha 47ebd03317acd155665791af27a6f62ac1ceabc5)
tests: apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-memory.integration.test.ts
- line 12 (guard-never-fires): `if (String(req.params.workspaceId) !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }`

## row 203 (T2) apps/website/src/server/inbound/admin-http/routes/analytics/recent-hits.ts (sha 55ed187a614fd31b7ed3696422d23670f6ddc291)
tests: apps/website/src/server/__tests__/routes/analytics-recent-hits.test.ts
- line 67 (guard-never-fires): `if (typeof raw !== "string" || raw.trim() === "") return undefined;`

## row 149 (T1) apps/website/src/contracts/core/agent-permission-mode.ts (sha 479ff6e191f9f4b40f506f3eef0de0fb5146fe1d)
tests: apps/website/src/contracts/core/__tests__/unit/assistant-native-fallbacks.unit.test.ts
- line 34 (guard-never-fires): `if (required.env.TOVU_AGENT_PERMISSION_MODE === "bypass") return "bypass";`
- line 35 (guard-never-fires): `if (required.env.TOVU_AGENT_PERMISSION_MODE === "restricted") return "restricted";`

## row 155 (T2) apps/website/src/server/inbound/public-http/http/site/render.ts (sha 479ff6e191f9f4b40f506f3eef0de0fb5146fe1d)
tests: apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts apps/website/src/server/inbound/public-http/http/site/__tests__/render-author.test.ts apps/website/src/server/inbound/public-http/http/site/__tests__/render-no-theme.test.ts apps/website/src/server/inbound/public-http/http/site/__tests__/render-handlebars.test.ts apps/website/src/server/inbound/public-http/http/site/__tests__/liquid-render.unit.test.ts apps/website/src/server/inbound/public-http/http/site/__tests__/render-form-layout.test.ts
- line 418 (guard-never-fires): `if (!absolute && (!src || /[\s\\]|^[a-z][a-z\d+.-]*:|^\/\//i.test(src))) return null;`
- line 425 (guard-never-fires): `if (!absolute && parsed.origin !== SAFE_HREF_RESOLUTION_ORIGIN) return null;`
- line 426 (guard-never-fires): `if (ADMIN_MEDIA_ORIGINAL_PATH.test(parsed.pathname)) return null;`
- line 427 (guard-never-fires): `if (parsed.username || parsed.password) return null;`
- line 609 (guard-never-fires): `if (!isObject(mark)) continue;`
- line 611 (guard-never-fires): `if (!renderer) continue;`

## row 156 (T2) apps/website/src/server/inbound/public-http/routes/site/pages.ts (sha 479ff6e191f9f4b40f506f3eef0de0fb5146fe1d)
tests: apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.route.test.ts apps/website/src/server/__tests__/routes/media-site-serving.test.ts apps/website/src/server/__tests__/routes/post-template-author.test.ts apps/website/src/server/__tests__/routes/widgets-site-serving.test.ts apps/website/src/server/__tests__/routes/bare-page-site-serving.test.ts apps/website/src/server/__tests__/routes/redirects-site-serving.test.ts
- line 284 (guard-never-fires): `if (isStaticExportRequest(request)) return false;`
- line 289 (guard-never-fires): `if (!settings.publicEnabled) return false;`
- line 440 (guard-never-fires): `if (!post || post.bodyFormat !== "html") return undefined;`
- line 660 (guard-never-fires): `if (menu.doc.mode === "html") return { html: menu.doc.html ?? "" };`
- line 674 (guard-never-fires): `if (menuIds.length === 0) return {};`
- line 733 (guard-never-fires): `if (currentIndex === -1) return undefined;`
- line 961 (guard-never-fires): `if (typeof candidate === "string" && candidate.length > 0) return candidate;`
- line 1004 (guard-never-fires): `if (list === undefined || listingKey === undefined || !batch.hasMore) return list;`
