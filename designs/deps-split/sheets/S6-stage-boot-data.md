# S6 — stage `boot-data` (B1-B3)

Responsibility: bindings `pluginRuntime` … `blobHydrationReady` (`f0613d9e` 1092-1284); the cell `routeDepsBuiltForPluginHost` moves to the top of the closure (DESIGN §2.2; read only through the getter). Budget ≤130k. Commits: 4. Prerequisites: S5; COMMON §1-§3, §9 (`DS_SHEET=S6`); `wave3/desktop-d0c` merged into the base (freeze-lanes: before S6) — the `startupSecretEnvironment` import moves with `identity` in its D0c spelling `@tovu/host-shared/startup-secrets`.

| commit | slice | bindings | getters | returns |
|---|---|---|---|---|
| 1 | `slices/plugin-runtime-boot.ts` (imports `pluginFailureThresholdOverride` from `overrides.ts`) | `pluginRuntime` | `lifecycleTracker`, `pluginHost: () => routeDepsBuiltForPluginHost?.pluginHost`, `contentTypeRepo`, `outbox` | `pluginRuntime` |
| 2 | `slices/identity-settings.ts` (+ `applyAdminPasswordResetFromEnvIfConfigured`, `compositionSiteDisplaySources`, `createSiteDisplayNameSource`) | `identity` … `siteTitleReady` + the `siteTitleReady.catch(() => undefined)` statement | — | `identity`, `settingsPrincipals`, `adminPasswordResetReady`, `presentationRepo`, `settingsRepo`, `settingsReady`, the six `*Ready`, `siteTitlePreservationStore`, `siteDisplayName`, `siteTimeZone`, `siteTitleSettingsDeps`, `siteSettingsReady`, `siteTitleReady` |
| 3 | `slices/boot-chains.ts` | `menuRepo` … `blobHydrationReady` | — (`logger` value) | `menuRepo`, `navLocationBindingRepo`, `menuBindingsReady`, `newsletterListRepo`, `newsletterReady`, `commentsReady`, `transformDefinitionRepo`, `mediaTransformReady`, `blobHydrationReady` |
| 4 | `stages/boot-data.ts` (sync) | 1-3 | | |

The 12-link `ensure*` chain moves verbatim as one chain (3 links take `(deps, { systemPrincipalId })`, 9 take `({ deps, systemPrincipalId })` — do not normalise).

## Carries
| behaviour (base lines) | pin |
|---|---|
| plugin host is optional until after assembly; read at call time (1094) | S0 pin 3b + new `plugin-runtime-boot.unit.test.ts`: the slice passes a getter, flipping the root cell later is seen by the runtime's lookup |
| declared content types deferred: `contentTypeRepo`/`outbox` read only on enable (1111-1113) | same unit: building with throwing getters does not throw |
| settings chain: 12 `ensure*` definitions in order, serialized (1137-1171); title preservation `catch` (1184) | S0 pin 4 |
| comments module install starts after the newsletter install settles; menu/newsletter/comments/media chains log their failure text (1192-1284) | S0 pin 4; `boot-chains.unit.test.ts` with a rejecting fake per chain → the exact `consoleLogger.error` message via the fake `logger` |
| admin password reset from env runs once at the same position (1130) | existing admin-reset test in `server/__tests__/unit` (wide set) |

## STOP
```bash
set -euo pipefail
G="bash designs/deps-split/work/gates.sh"; D=apps/website/src/server/runtime/composition
$G expect-count S6-SETTINGS-CHAIN 12 '\.then\(\(\) => ensure' $D/site-deps/slices/identity-settings.ts
$G forbid S6-ASYNC-SLICE '^(export )?async function|^  (const [^=]+= )?await ' $D/site-deps/slices/plugin-runtime-boot.ts $D/site-deps/slices/identity-settings.ts $D/site-deps/slices/boot-chains.ts $D/site-deps/stages/boot-data.ts
$G forbid S6-OLD-SECRETS-PATH 'platform/secrets/startup-secrets' $D/deps.ts $D/site-deps
```
Gates: COMMON §5.
