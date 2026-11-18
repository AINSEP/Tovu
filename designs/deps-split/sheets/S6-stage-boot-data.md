# S6 — slices `plugin-runtime-boot`, `identity-settings`, `boot-chains` (B1-B3)

Responsibility: bindings `pluginRuntime` … `blobHydrationReady` (`b5fbf2a5` 1089-1281); the cell `routeDepsBuiltForPluginHost` moves to the top of the closure (DESIGN §2.2; read only through the getter). Budget ≤120k. Commits: 3. Prerequisites: S5; COMMON §1-§4, §9 (`DS_SHEET=S6`). The `startupSecretEnvironment` import moves with `identity` in the base's spelling (`../boot/startup-secrets.js` on `b5fbf2a5`; `@tovu/host-shared/startup-secrets` only if `wave3/desktop-d0c` merged before S0 — INDEX "Freeze").

| commit | slice | bindings | getters | returns |
|---|---|---|---|---|
| 1 | `slices/plugin-runtime-boot.ts` (imports `pluginFailureThresholdOverride` from `overrides.ts`) | `pluginRuntime` | `lifecycleTracker`, `pluginHost: () => routeDepsBuiltForPluginHost?.pluginHost`, `contentTypeRepo`, `outbox` | `pluginRuntime` |
| 2 | `slices/identity-settings.ts` (+ `applyAdminPasswordResetFromEnvIfConfigured`, `compositionSiteDisplaySources`, `createSiteDisplayNameSource`) | `identity` … `siteTitleReady` + the `siteTitleReady.catch(() => undefined)` statement | — | `identity`, `settingsPrincipals`, `adminPasswordResetReady`, `presentationRepo`, `settingsRepo`, `settingsReady`, the six `*Ready`, `siteTitlePreservationStore`, `siteDisplayName`, `siteTimeZone`, `siteTitleSettingsDeps`, `siteSettingsReady`, `siteTitleReady` |
| 3 | `slices/boot-chains.ts` | `menuRepo` … `blobHydrationReady` | — (`logger` value) | `menuRepo`, `navLocationBindingRepo`, `menuBindingsReady`, `newsletterListRepo`, `newsletterReady`, `commentsReady`, `transformDefinitionRepo`, `mediaTransformReady`, `blobHydrationReady` |

The 12-link `ensure*` chain moves verbatim as one chain (3 links take `(deps, { systemPrincipalId })`, 9 take `({ deps, systemPrincipalId })` — do not normalise).

## Carries
| behaviour (base lines) | pin |
|---|---|
| plugin host is optional until after assembly; read at call time (1091) | S0 pin 3b (fresh activation after the cell is set) + new `$D/__tests__/plugin-runtime-boot.unit.test.ts`: the slice hands `composePluginRuntime` the getter itself (a recording fake sees a function and reads it only when called) |
| declared content types deferred: `contentTypeRepo`/`outbox` read only on enable (1108-1110) | `plugin-runtime-boot.unit.test.ts`: building with throwing getters does not throw |
| settings chain: 12 `ensure*` definitions in order, serialized (1134-1168); title preservation `catch` (1181) | S0 pin 4 |
| comments module install starts after the newsletter install settles; menu/newsletter/comments/media chains log their failure text (1189-1281) | S0 pin 4; new `$D/__tests__/boot-chains.unit.test.ts` with a rejecting fake per chain → the exact `consoleLogger.error` message via the fake `logger` |
| admin password reset from env runs once at the same position (1127) | `create-site-route-deps-boot-options.integration.test.ts` (drives `applyAdminPasswordResetFromEnvIfConfigured` through boot) |

```bash
SHEET_TESTS=(
  apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts
)   # plus SR_TESTS and CHANGED_TESTS (COMMON §5)
```

## STOP (before the report commit; COMMON §9 rule 8 form)
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
grep -rnE '\.then\(\(\) => ensure' "$D/site-deps/slices/identity-settings.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 12 || { cat "$W/hits"; echo "STOP-S6-SETTINGS-CHAIN"; exit 1; }
grep -rnE '^(export )?async function|^  (const [^=]+= )?await ' "$D/site-deps/slices/plugin-runtime-boot.ts" "$D/site-deps/slices/identity-settings.ts" "$D/site-deps/slices/boot-chains.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S6-ASYNC-SLICE"; exit 1; }
```
Gates: COMMON §5.
