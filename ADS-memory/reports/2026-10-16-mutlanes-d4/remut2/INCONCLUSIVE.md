
## row 22 (T1) apps/website/src/assistant/execution-credential-store.ts (sha 9b31543384b49e6179eb6f673825e34d1c6036c9)
tests: apps/website/src/assistant/__tests__/execution-credential-store.test.ts apps/website/src/assistant/__tests__/byok-credential.test.ts apps/website/src/assistant/__tests__/live-model-cache.test.ts apps/website/src/server/__tests__/admin-assistant-execution-credential-routes.test.ts apps/website/src/platform/db/repos/__tests__/execution-credential-repo.test.ts
- line 110 (guard-never-fires): `if (value !== undefined && typeof value !== "string") {`

## row 24 (T1) apps/website/src/assistant/site-credential-store.ts (sha 9b31543384b49e6179eb6f673825e34d1c6036c9)
tests: apps/website/src/assistant/__tests__/site-credential-store.test.ts apps/website/src/platform/db/__tests__/sealed-credential-inventory.test.ts
- line 128 (drop-nullish-default): `model: input.model ?? existing?.meta.model ?? null },`
- line 52 (drop-nullish-default): `updatedAt: record?.updatedAt ?? null };`

## row 40 (T1) apps/website/src/assistant/external-mcp-reauth-tool.ts (sha 55ed187a614fd31b7ed3696422d23670f6ddc291)
tests: apps/website/src/assistant/__tests__/external-mcp-reauth-tool.test.ts apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
- line 344 (guard-never-fires): `if (!optional.emitSurface) return buildReauthNoSurfaceResult({ serverId, label });`
- line 347 (guard-never-fires): `if (activePrompts.has(promptKey)) return buildReauthAlreadyShowingResult({ serverId, label });`
- line 214 (guard-never-fires): `if (!serverId) {`
