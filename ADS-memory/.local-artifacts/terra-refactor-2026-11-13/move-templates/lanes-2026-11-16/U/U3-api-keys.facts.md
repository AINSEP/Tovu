# U3-api-keys — machine-verified facts (generated; do not hand-edit)

Source: Tovu tree at `LANE_ROOT` (committed copy: `origin/integ/merge-a-2026-11-16`) @ `e801e9aee`. Regenerate: `LANE_ROOT=<tovu clone> python3 scripts/inv.py && LANE_ROOT=<tovu clone> python3 scripts/rep.py && LANE_ROOT=<tovu clone> python3 scripts/facts.py [<out dir>]`. Blobs are `git hash-object` of that tree; a sheet executor re-checks every blob (COMMON STOP-on-mismatch).

Files: 4, 877 lines (tests not counted).

## Files
| path (under apps/website/src) | lines | blob | CLASSIFY label | audit row | existing sheet/design mention | prod importers | test importers |
|---|---|---|---|---|---|---|---|
| features/identity/api-key-secret.ts | 237 | 248632aac4a00abf099a65371cb7b8f3a11a6011 | MOVE | - | - | 2 | 2 |
| features/identity/api-key-service.ts | 471 | dc20a40a69f882ccc1aebc8bfd15b71f0b5e54f7 | MIXED | - | - | 5 | 3 |
| features/identity/api-key-types.ts | 67 | 2abe30b297692f384cf22ea0fee415d671bf5383 | MOVE | - | - | 7 | 2 |
| features/identity/site-key-permission.ts | 102 | 3ef2a49e93b333311854d080d4a75e54bd79af89 | - | - | - | 3 | 2 |

## Per file: exports, tables, lock keys, imports that leave the folder, importers

### features/identity/api-key-secret.ts (237 lines)
- exports (5): MintedApiKey, mintApiKey, parseApiKey, ScryptApiKeySecretHasher, decoyKeyHash
- tables touched: -
- lock keys: -
- flags: node:, tovu-text
- npm/@jini-ai imports: node:crypto
- same-folder imports: features/identity/api-key-types.ts
- imports leaving the folder: -
- prod importers (2): features/identity/api-key-service.ts, features/identity/wiring.ts
- test importers (2): features/identity/__tests__/api-key-secret.no-derivation.test.ts, features/identity/__tests__/api-key-secret.test.ts

### features/identity/api-key-service.ts (471 lines)
- exports (7): ApiKeyServiceDeps, CreateApiKeyPrincipalInput, createApiKeyPrincipal, IssueApiKeyInput, issueApiKey, revokeApiKey, authenticateApiKey
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/primitives, @jini-ai/user-management, @jini-ai/user-management/server, disabled principal, expired key, revoked key
- same-folder imports: features/identity/api-key-secret.ts, features/identity/api-key-types.ts
- imports leaving the folder: -
- prod importers (5): server/inbound/admin-http/dev-auth.ts, server/inbound/admin-http/routes/api-keys/create-principal.ts, server/inbound/admin-http/routes/api-keys/deps.ts, server/inbound/admin-http/routes/api-keys/issue.ts, server/inbound/admin-http/routes/api-keys/revoke.ts
- test importers (3): features/identity/__tests__/api-key-service.test.ts, features/identity/__tests__/repo.contract.test.ts, server/__tests__/admin-mcp-ui-tool-calls-route.test.ts

### features/identity/api-key-types.ts (67 lines)
- exports (3): ApiKeyRecord, ApiKeyRepoPort, ApiKeySecretHasherPort
- tables touched: -
- lock keys: -
- flags: tovu-text
- npm/@jini-ai imports: @jini-ai/core/primitives
- same-folder imports: -
- imports leaving the folder: -
- prod importers (7): features/identity/api-key-secret.ts, features/identity/api-key-service.ts, features/identity/repo.memory.ts, features/identity/repo.ts, features/identity/wiring.ts, server/inbound/admin-http/http/api-keys.ts, server/routes/types.ts
- test importers (2): features/identity/__tests__/api-key-service.test.ts, features/identity/__tests__/repo.contract.test.ts

### features/identity/site-key-permission.ts (102 lines)
- exports (2): SITE_KEY_MANAGE_PERMISSION, registerSiteKeyPermissionGrants
- tables touched: -
- lock keys: -
- flags: tovu-text
- npm/@jini-ai imports: -
- same-folder imports: features/identity/permission-grants.ts
- imports leaving the folder: -
- prod importers (3): features/deployments/deploy-ops/tool-registrations.ts, server/inbound/admin-http/routes/system/site-key.ts, server/runtime/composition/app-permission-grants.ts
- test importers (2): features/deployments/deploy-ops/__tests__/secrets.test.ts, server/runtime/composition/__tests__/permission-grants.test.ts

## Test files that import a file of this sheet (blob-guard each before editing)
| test | lines | blob |
|---|---|---|
| features/identity/__tests__/api-key-secret.no-derivation.test.ts | 58 | c3057932833cea95df687d07d645671feed387ab |
| features/identity/__tests__/api-key-secret.test.ts | 154 | d67c474449df237ad85c22e242128fd96837c900 |
| features/identity/__tests__/api-key-service.test.ts | 412 | e98186e8199d366989561773af553c6de9450bf2 |
| features/identity/__tests__/repo.contract.test.ts | 495 | a16261639ecf494fd21134b23af1a7f20e33b855 |
| server/__tests__/admin-mcp-ui-tool-calls-route.test.ts | 491 | c328df98de1378a70f85ee0ee3fe7ba50b0f8f49 |
| features/deployments/deploy-ops/__tests__/secrets.test.ts | 309 | d2bd2e8176fec3bb557451759824ba03a86c8121 |
| server/runtime/composition/__tests__/permission-grants.test.ts | 77 | 9cbf5eee71e4d90cb0388b9143213c1218febfca |

## vi.mock / vi.doMock / importActual sites that name a file of this sheet (lesson 2: mock factories are consumers)
- none found by pattern (re-check with the census at execution)

## Path-keyed baselines / configs that name a file of this sheet (lesson 10: debt does not follow moved code silently)
- development/scripts/check-architecture.baseline.json: `src/features/identity/site-key-permission.ts` at lines 88 (1 hits)

## Census command (run from the Tovu clone root; every hit must be listed above)
```
rg -n --no-heading -e 'api\-key\-secret|api\-key\-service|api\-key\-types|site\-key\-permission' apps development scripts --glob '!**/node_modules/**' -g '*.ts' -g '*.tsx' -g '*.json' -g '*.mjs' -g '*.cjs' | rg 'identity'
```
