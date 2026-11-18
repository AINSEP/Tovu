# S3 — module-level helper groups leave `deps.ts` (overrides, store opening, provider identity)

Responsibility: the three multi-user helper groups of DESIGN §1.3 "Module-level code". Budget ≤120k. Commits: 3 (one per group). Prerequisites: S2; COMMON §1-§4 (`DS_SHEET=S3`). No lane is merged mid-run (INDEX "Freeze"): the moved imports keep whatever spelling the base has. Take lines from `work/module-census.tsv` by declaration name.

| commit | new file | declarations (by name) | importers / anchors repointed in the same commit |
|---|---|---|---|
| 1 | `site-deps/overrides.ts` | `CreateSiteRouteDepsOverrides`, `assertOverridesPairedOrAbsent`, `pluginFailureThresholdOverride`, `resolveThemesDirOverride`, `resolveSiteBindingOverride`, `compositionApprovalOverrides`, `resolveWorkspaceIdOverride` | `deps-observability-wiring.integration.test.ts:10` (type); every `CreateSiteRouteDepsOverrides` importer (`grep -rln` it). **Positional → `(required, optional = {})` with callers**: `assertOverridesPairedOrAbsent(overrides)` → `({ overrides })`; `resolveThemesDirOverride(siteBinding, overrides)` → `({ siteBinding }, { overrides })`; `resolveSiteBindingOverride(overrides)` → `({}, { overrides })`; `resolveWorkspaceIdOverride(kernel, overrides)` → `({ kernel }, { overrides })` and the boot-order anchor `"await resolveWorkspaceIdOverride(kernel, overrides)"` updated to the new text in this commit |
| 2 | `site-deps/open-store.ts` | `hydrateContentDbIfNeeded`, `prepareCompositionStorage`, `StoreCloseRegistration`, `openCompositionStore`, `resolveChatDbPath`, `startOwnerSweeps`, `startOwnerChatExpirySweep` | `composition-boot-order.unit.test.ts:113-131`: `functionBody(…, "async function openCompositionStore(")`, `"function prepareCompositionStorage("`, `"function startOwnerSweeps("` read `site-deps/open-store.ts`; the `createSiteRouteDeps` anchors stay on `deps.ts`. `isInMemoryDbPath` keeps the base's spelling (`#src/features/plugins/snapshot` on `b5fbf2a5`; `wave3/moves-b1` changes it only if merged before S0) |
| 3 | `site-deps/provider-identity.ts` | `providerPluginBoot`, `composeProviderConfig`, `credentialProject`, `acceptedSiteId`, `siteIdentityFor`, `projectStoreFor` | `deps-provider-plugin-boot.integration.test.ts:15` (`siteIdentityFor`) |

`wave3/xpkg-c12obs-r12` edits both importer tests (`deps-observability-wiring`, `deps-provider-plugin-boot`): shared files, met at the coordinator's integration merge (COMMON §2).

## Carries (each pin green on the commit that moves the item)
| behaviour (base lines) | pin |
|---|---|
| override pairing: a half-supplied store/close pair throws the same error (501-517) | new `site-deps-overrides.unit.test.ts`: each unpaired combination → exact base message; paired/absent → no throw (characterized red-first by deleting the check) |
| site binding + themes dir + workspace overrides return what the base returns | same unit file, one case each with plain objects |
| store prelude order: storage choice → hydration → open → sweeps; failure releases (`openCompositionStore`, 683-718) | `composition-boot-order` anchors (repointed); `create-site-route-deps-failure-release.integration.test.ts`; S0 pin 5 (teardown) |
| drain → registrations → sweeps stopped → close (683-718) | S0 pin 5; `sqlite-shutdown.integration.test.ts` |
| provider identity: same site id/name/runtime for the same binding (889-905); project store selection (906-925) | `deps-provider-plugin-boot.integration.test.ts`, `deps-project-credentials.integration.test.ts`; S0 pin 3a |

```bash
SHEET_TESTS=()   # every carry test is in SR_TESTS (composition-boot-order, the composition __tests__ glob); the new site-deps-overrides.unit.test.ts runs as CHANGED_TESTS, then via the glob
```

## STOP (before the report commit)
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
test -f "$D/deps.ts"
grep -nE '^(export )?(async )?function (openCompositionStore|prepareCompositionStorage|startOwnerSweeps|composeProviderConfig|siteIdentityFor|assertOverridesPairedOrAbsent)\(' "$D/deps.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S3-HELPER-LEFT"; exit 1; }
grep -rnE '(assertOverridesPairedOrAbsent\(overrides|resolveThemesDirOverride\([a-zA-Z]+, |resolveSiteBindingOverride\(overrides|resolveWorkspaceIdOverride\(kernel, )' "$D" apps/website/src/server/__tests__ > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S3-POSITIONAL"; exit 1; }
F=apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts
BASE=$(sed -n 's/^TOVU_BASE=//p' designs/deps-split/work/BASE)
git show "$BASE:$F" > "$W/bo-base.ts"
grep -c 'assert\.' "$W/bo-base.ts" > "$W/n-base"
grep -c 'assert\.' "$F" > "$W/n-now"
test "$(cat "$W/n-now")" -ge "$(cat "$W/n-base")" || { echo "STOP-S3-ASSERTIONS $(cat "$W/n-now") < $(cat "$W/n-base")"; exit 1; }
```
