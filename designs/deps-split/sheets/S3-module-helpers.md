# S3 — module-level helper groups leave `deps.ts` (overrides, store opening, provider identity)

Responsibility: the three multi-user helper groups of DESIGN §1.3 "Module-level code". Budget ≤130k. Commits: 3 (one per group). Prerequisites: S2; COMMON §1-§3 (`DS_SHEET=S3`); `wave3/moves-b1` merged into the base (freeze-lanes: before S3 — `gates.sh freeze` stops otherwise). Take lines from `work/module-census.tsv` by declaration name.

| commit | new file | declarations (by name) | importers / anchors repointed in the same commit |
|---|---|---|---|
| 1 | `site-deps/overrides.ts` | `CreateSiteRouteDepsOverrides`, `assertOverridesPairedOrAbsent`, `pluginFailureThresholdOverride`, `resolveThemesDirOverride`, `resolveSiteBindingOverride`, `compositionApprovalOverrides`, `resolveWorkspaceIdOverride` | `deps-observability-wiring.integration.test.ts:10` (type); every `CreateSiteRouteDepsOverrides` importer (`grep -rln` it). **Positional → `(required, optional = {})` with callers**: `assertOverridesPairedOrAbsent(overrides)` → `({ overrides })`; `resolveThemesDirOverride(siteBinding, overrides)` → `({ siteBinding }, { overrides })`; `resolveSiteBindingOverride(overrides)` → `({}, { overrides })`; `resolveWorkspaceIdOverride(kernel, overrides)` → `({ kernel }, { overrides })` and the boot-order anchor `"await resolveWorkspaceIdOverride(kernel, overrides)"` updated to the new text in this commit |
| 2 | `site-deps/open-store.ts` | `hydrateContentDbIfNeeded`, `prepareCompositionStorage`, `StoreCloseRegistration`, `openCompositionStore`, `resolveChatDbPath`, `startOwnerSweeps`, `startOwnerChatExpirySweep` | `composition-boot-order.unit.test.ts:113-131`: `functionBody(…, "async function openCompositionStore(")`, `"function prepareCompositionStorage("`, `"function startOwnerSweeps("` read `site-deps/open-store.ts`; the `createSiteRouteDeps` anchors stay on `deps.ts`. `isInMemoryDbPath` is imported in its post-`moves-b1` spelling |
| 3 | `site-deps/provider-identity.ts` | `providerPluginBoot`, `composeProviderConfig`, `credentialProject`, `acceptedSiteId`, `siteIdentityFor`, `projectStoreFor` | `deps-provider-plugin-boot.integration.test.ts:15` (`siteIdentityFor`) |

`wave3/xpkg-c12obs-r12` edits both importer tests (`deps-observability-wiring`, `deps-provider-plugin-boot`): shared files — the freeze check stops a commit that would create a conflict there; then the coordinator merges that lane first.

## Carries (each pin green on the commit that moves the item)
| behaviour (base lines) | pin |
|---|---|
| override pairing: a half-supplied store/close pair throws the same error (504-520) | new `site-deps-overrides.unit.test.ts`: each unpaired combination → exact base message; paired/absent → no throw (characterized red-first by deleting the check) |
| site binding + themes dir + workspace overrides return what the base returns | same unit file, one case each with plain objects |
| store prelude order: storage choice → hydration → open → sweeps; failure releases (`openCompositionStore`, 686-721) | `composition-boot-order` anchors (repointed); `create-site-route-deps-failure-release.integration.test.ts`; S0 pin 5 (teardown) |
| drain → registrations → sweeps stopped → close (686-721) | S0 pin 5; `sqlite-shutdown.integration.test.ts` |
| provider identity: same site id/name/runtime for the same binding (892-908); project store selection (909-928) | `deps-provider-plugin-boot.integration.test.ts`, `deps-project-credentials.integration.test.ts`; S0 pin 3a |

## STOP
```bash
set -euo pipefail
G="bash designs/deps-split/work/gates.sh"; D=apps/website/src/server/runtime/composition
$G forbid S3-HELPER-LEFT '^(export )?(async )?function (openCompositionStore|prepareCompositionStorage|startOwnerSweeps|composeProviderConfig|siteIdentityFor|assertOverridesPairedOrAbsent)\(' $D/deps.ts
$G forbid S3-POSITIONAL '(assertOverridesPairedOrAbsent\(overrides|resolveThemesDirOverride\([a-zA-Z]+, |resolveSiteBindingOverride\(overrides|resolveWorkspaceIdOverride\(kernel, )' $D apps/website/src/server/__tests__
F=apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts
base=$(sed -n 's/^TOVU_BASE=//p' designs/deps-split/work/base-outputs/refs.env)
n_base=$(git show "$base:$F" | grep -c 'assert\.')
n_now=$(grep -c 'assert\.' "$F")
[ "$n_now" -ge "$n_base" ] || { echo "STOP-S3-ASSERTIONS composition-boot-order has $n_now assert calls (base $n_base)"; exit 1; }
```
Gates: COMMON §5.
