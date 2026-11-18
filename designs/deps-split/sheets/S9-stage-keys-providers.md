# S9 — stage `keys-providers` (rows E1-E5)

Responsibility: statements 112-143 (`f0613d9e` 1701-1890). Budget ≤180k. Commits: 6.
Prerequisites: S8. COMMON §2, §3, §9.

| commit | slice | statements | async | getters | returns |
|---|---|---|---|---|---|
| 1 | `slices/site-keys.ts` (+ `compositionSiteKeySources`) | 112-120 | no | — | `runtimeMode`, `siteDirForKeyring`, `siteKeySourcesList`, `memberRepo`, `newsletterKeyring`, `newsletterSubscriberDirectory`, `newsletterHooks`, `siteAssistantSecretKeyring`, `siteAssistantSecretSealer` |
| 2 | `slices/assistant-secrets.ts` | 121-126 | **yes** (121 `await normalizeSiteVaultAtBoot`, must finish before 122 — pinned by `composition-boot-order:177-180`) | — | `siteAssistantCredentialRepo`, `externalMcpServerRepo`, `externalMcpOAuthDevices`, `siteReferenceRepo`, `projectKeyReferences` |
| 3 | `slices/provider-config.ts` (+ `compositionCustomCredentials` from S4) | 127-130 | yes (127) | — | `savedProviderConfig`, `projectId`, `projectVault`, `projectStore`, `projectSiteId`, `providerConfigSource`, `customCredentialSetRepo` |
| 4 | `slices/provider-plugins.ts` (+ `compositionProjectKeys` from S4) | 131-132, 134-136 — statement 133 (`let bindSharedApiOAuth`) is a root cell: move the `let` to the top of the closure in this commit (undefined until 2113; read only inside `bindOAuth`) | yes (131) | `bindSharedApiOAuth: () => bindSharedApiOAuth` | `providerPlugins`, `projectKeys` |
| 5 | `slices/observed-stores.ts` (+ `flushLifecycleEvents`) | 141-143 only. 137-140 stay in the closure, in order (DESIGN §2.3): destructure 137, write 138, call 139, write 140, then `bindObservedStores(...)` | no | — | — |
| 6 | `stages/keys-providers.ts` | 112-136 (E1-E4; E5 stays in the closure) | yes | | |

`composition-boot-order.unit.test.ts:166-174` lists three of the four post-boot-promise awaits by exact text (`normalizeSiteVaultAtBoot`, `composeProviderConfig`, `providerPluginBoot`): per COMMON §9 rule 7, the closure line becomes `const { … } = await composeKeysProvidersStage(…)` and each original line is pinned verbatim inside its slice file, in order.

## STOP
```bash
D=apps/website/src/server/runtime/composition
test "$(grep -rl 'Shared connections are not available yet. Reopen this saved connection and try again.' $D/deps.ts $D/site-deps | wc -l)" = 1 || echo "STOP: the domain-error text moved or duplicated"
test "$(grep -rn 'setServerLogTraceReader(' $D/deps.ts $D/site-deps | wc -l)" = 1 || echo "STOP: trace reader set more than once"
```
Gates: COMMON §5; `site-root.late-contracts.pin.test.ts` (a), (c) every commit; `deps-observability-wiring`, `deps-provider-plugin-boot`, `deps-project-credentials` integration tests every commit.
