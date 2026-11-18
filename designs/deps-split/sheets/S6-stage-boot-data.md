# S6 — stage `boot-data` (rows B1-B3)

Responsibility: statements 33-55 (`f0613d9e` 1092-1284); statement 32 (`let routeDepsBuiltForPluginHost`) stays in the closure. Budget ≤130k. Commits: 4.
Prerequisites: S5. COMMON §2, §3, §9. D0c: if `origin/wave3/desktop-d0c` is merged into the base, the `startupSecretEnvironment` import moves with statement 34 in its **D0c spelling** (`@tovu/host-shared/startup-secrets`); if not, it moves as it is and the INDEX overlap row applies.
```bash
git merge-base --is-ancestor origin/wave3/desktop-d0c HEAD && echo "D0c in base: use @tovu/host-shared/startup-secrets" || echo "D0c not in base: keep ../../../platform/secrets/startup-secrets.js spelling, rewritten relative to the slice"
```

| commit | slice | statements | getters | returns |
|---|---|---|---|---|
| 1 | `slices/plugin-runtime-boot.ts` (+ `pluginFailureThresholdOverride` import from `overrides.ts`) | 33 | `lifecycleTracker`, `pluginHost: () => routeDepsBuiltForPluginHost?.pluginHost`, `contentTypeRepo`, `outbox` | `pluginRuntime` |
| 2 | `slices/identity-settings.ts` (+ `applyAdminPasswordResetFromEnvIfConfigured`, `compositionSiteDisplaySources`, `createSiteDisplayNameSource`) | 34-46 | — | `identity`, `settingsPrincipals`, `adminPasswordResetReady`, `presentationRepo`, `settingsRepo`, `settingsReady`, the six `*Ready`, `siteTitlePreservationStore`, `siteDisplayName`, `siteTimeZone`, `siteTitleSettingsDeps`, `siteSettingsReady`, `siteTitleReady` |
| 3 | `slices/boot-chains.ts` | 47-55 | — (`logger` value) | `menuRepo`, `navLocationBindingRepo`, `menuBindingsReady`, `newsletterListRepo`, `newsletterReady`, `commentsReady`, `transformDefinitionRepo`, `mediaTransformReady`, `blobHydrationReady` |
| 4 | `stages/boot-data.ts` | 33-55 | | |

The 12-link `ensure*` chain (1153-1171) moves verbatim as one chain (3 links take `(deps, { systemPrincipalId })`, 9 take `({ deps, systemPrincipalId })` — do not normalise). `siteTitleReady.catch(() => undefined)` (1184) moves with it. All synchronous: no `await` in these slices.

## STOP
```bash
grep -c '\.then(() => ensure' apps/website/src/server/runtime/composition/site-deps/slices/identity-settings.ts | grep -qx 12 || echo "STOP: settings chain is not 12 links"
grep -nE '^  (const [^=]+= )?await ' apps/website/src/server/runtime/composition/site-deps/slices/{plugin-runtime-boot,identity-settings,boot-chains}.ts && echo "STOP: became async"
```
Gates: COMMON §5; `site-root.boot-chains.pin.test.ts` every commit.
