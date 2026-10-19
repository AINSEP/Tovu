
## row 27 (T1) apps/website/src/features/agent-plugins/switch-on-saved-token.ts (sha 649720023ff11385b17ce2d32975911312e1274f)
tests: apps/website/src/features/agent-plugins/__tests__/unit/switch-on-saved-token.unit.test.ts
- line 96 (guard-never-fires): `if (await isOff(target.pluginId)) return { state: "plugin-off-by-operator" };`
- line 102 (guard-never-fires): `if (row?.enabled !== true) return { state: "connection-off-by-operator" };`

## row 37 (T1) apps/website/src/platform/oauth/endpoint-safety.ts (sha 809d73c60372a11f9b54a2250c5b0ed12ded6305)
tests: apps/website/src/platform/oauth/__tests__/endpoint-safety.test.ts apps/website/src/platform/oauth/__tests__/endpoint-safety-adapter.test.ts apps/website/src/platform/oauth/__tests__/providers.test.ts apps/website/src/platform/oauth/__tests__/authorization-code.test.ts apps/website/src/platform/oauth/__tests__/dynamic-registration.test.ts
- line 39 (guard-never-fires): `if (!(error instanceof JiniOAuthError)) throw error;`
- line 154 (guard-never-fires): `if (document.issuer !== undefined && document.issuer !== issuer)`
