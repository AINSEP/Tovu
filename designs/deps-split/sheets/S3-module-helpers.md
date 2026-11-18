# S3 — module-level helper groups leave `deps.ts` (overrides, store opening, provider identity)

Responsibility: the three multi-user helper groups of DESIGN §1.3 "Module-level code". Single-user helpers stay until their user's slice moves. Budget ≤120k. Commits: 3 (one per group).
Prerequisites: S2. COMMON §2, §3. Re-take line numbers from `work/module-census.tsv` (columns comment-start, end).

| commit | new file | declarations (today's lines incl. comments) | importers to repoint (same commit) |
|---|---|---|---|
| 1 | `composition/site-deps/overrides.ts` | `CreateSiteRouteDepsOverrides` 417-503, `assertOverridesPairedOrAbsent` 504-520, `pluginFailureThresholdOverride` 521-533, `resolveThemesDirOverride` 551-560, `resolveSiteBindingOverride` 561-570, `compositionApprovalOverrides` 644-650, `resolveWorkspaceIdOverride` 760-771 | `deps-observability-wiring.integration.test.ts:10` (type `CreateSiteRouteDepsOverrides`); every file that imports the type from `deps.ts` (`grep -rn CreateSiteRouteDepsOverrides apps development`) |
| 2 | `composition/site-deps/open-store.ts` | `hydrateContentDbIfNeeded` 534-550, `prepareCompositionStorage` 651-659, `StoreCloseRegistration` 660-666, `openCompositionStore` 667-721, `resolveChatDbPath` 722-732, `startOwnerSweeps` 733-751, `startOwnerChatExpirySweep` 752-759 | `composition-boot-order.unit.test.ts:113-131`: `functionBody(deps, "async function openCompositionStore(")`, `"function prepareCompositionStorage("`, `"function startOwnerSweeps("` now read `site-deps/open-store.ts`; the `createSiteRouteDeps` anchors (`await openCompositionStore({ dbPath }, { overrides })`) stay on `deps.ts` |
| 3 | `composition/site-deps/provider-identity.ts` | `providerPluginBoot` 844-848, `composeProviderConfig` 849-871, `credentialProject` 872-884, `acceptedSiteId` 885-891, `siteIdentityFor` 892-908, `projectStoreFor` 909-928 | `deps-provider-plugin-boot.integration.test.ts:15` (`siteIdentityFor`) |

Rules: exports only what `deps.ts` or a test uses; `hydrateContentDbIfNeeded` keeps calling `resolveSiteBindingOverride` (imported from `overrides.ts`). Each moved function already has the `(required, optional)` shape (verify; any that does not is listed in the report, not changed here).

## STOP
```bash
for n in openCompositionStore prepareCompositionStorage startOwnerSweeps composeProviderConfig siteIdentityFor assertOverridesPairedOrAbsent; do grep -n "function $n" apps/website/src/server/runtime/composition/deps.ts && echo "STOP: $n still in deps.ts"; done
F=apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts
test "$(git diff HEAD~3 -- $F | grep -c '^-.*assert')" -le "$(git diff HEAD~3 -- $F | grep -c '^+.*assert')" || echo "STOP: assertions were removed from composition-boot-order"
```
Gates: COMMON §5, plus `node --import tsx --test apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts`.
