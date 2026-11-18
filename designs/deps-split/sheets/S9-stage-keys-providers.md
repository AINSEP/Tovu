# S9 — keys and providers (E1-E5) around three root awaits

Responsibility: bindings `runtimeMode` … the observed-store binding statements (`f0613d9e` 1698-1887). Three root awaits sit inside this range and **stay in the root, verbatim**: `await normalizeSiteVaultAtBoot(…)` (1792), `… = await composeProviderConfig(…)` (1819), `const providerPlugins = await providerPluginBoot({ overrides })(…)` (1841). Budget ≤170k. Commits: 6. Prerequisites: S8; COMMON §1-§3, §9 (`DS_SHEET=S9`).

| commit | slice (sync) | bindings | position | returns |
|---|---|---|---|---|
| 1 | `slices/site-keys.ts` (+ `compositionSiteKeySources`) | `runtimeMode` … `siteAssistantSecretSealer` | before the vault await | `runtimeMode`, `siteDirForKeyring`, `siteKeySourcesList`, `memberRepo`, `newsletterKeyring`, `newsletterSubscriberDirectory`, `newsletterHooks`, `siteAssistantSecretKeyring`, `siteAssistantSecretSealer` |
| 2 | `slices/assistant-secrets.ts` | `siteAssistantCredentialRepo` … `projectKeyReferences` | after the vault await, before `composeProviderConfig` | same names |
| 3 | `slices/provider-config.ts` (+ `compositionCustomCredentials` from S4) | `providerConfigSource`, `customCredentialSetRepo` | after `composeProviderConfig`, before provider boot | same |
| 4 | `slices/provider-boot-input.ts` `providerBootInput(required)` | the argument object of the provider-boot call (`processRole` … `...createTelemetryConsent(…)`), written **inside** the call: `await providerPluginBoot({ overrides })(providerBootInput({ … }))` so the callee is evaluated before the arguments, as today | in the call | the object |
| 5 | `slices/provider-plugins.ts` (+ `compositionProjectKeys` from S4) | the dispose registration, `projectKeys`, the provider-revision watch registration; the cell `bindSharedApiOAuth` moves to the top of the closure | after provider boot | `projectKeys` |
| 6 | `slices/observed-stores.ts` (+ `flushLifecycleEvents`) `bindObservedStores(required)` | the three statements after `lifecycleTracker = tracker` | after the root writes | — |

The destructuring of `observability, tracker, aiTraceSink`, the writes `formCollectionProviders = …`, `setServerLogTraceReader(…)`, `lifecycleTracker = tracker` **stay in the root, in that order** (DESIGN §2.3). No `stages/keys-providers.ts` spans an await: commits 1-3 and 5 are called directly by the root between its awaits (a stage file groups only consecutive sync calls — here none have two neighbours, so there is no stage file; DESIGN §2.2 segments s2-s5).

## Carries
| behaviour (base lines) | pin |
|---|---|
| vault fence: credential consumers are constructed only after normalization finished (1783-1796) | `composition-boot-order` assertions `keyring < normalize < credentials`: `keyring` and `credentials` anchors now read the slice call order in the root (`composeSiteKeys(` < `await normalizeSiteVaultAtBoot(` < `composeAssistantSecrets(`) + verbatim anchors inside the slices |
| the five post-boot-promise awaits stay exactly those lines, in order | `composition-boot-order` widened list (S0 pin 6) — unchanged text except identifiers the move renames |
| provider disposal before plugin-runtime disposal at teardown (1849-1854) | S0 pin 5 (recording `dispose`) |
| provider revision watch registered on close and reapplies through the provider runtime (1875-1879) | `deps-provider-plugin-boot.integration.test.ts`, `deps-project-credentials.integration.test.ts` |
| OAuth binding late-bound: exact domain error until bound (1855-1874) | S4's `composition-project-keys.unit.test.ts`; S0 pin 3a |
| logger bindings: every moved `consoleLogger` use receives the root's logger (E3 handoff) | `gates.sh loggers` + `forbid` below |
| process-global trace reader set once at the same position (1883) | `expect-count` below; `deps-observability-wiring.integration.test.ts` |
| lifecycle buffer flushed once after the swap (1884-1887) | S0 pin 3c |

## STOP
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
grep -rnE 'Shared connections are not available yet\. Reopen this saved connection and try again\.' "$D/deps.ts" "$D/site-deps" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S9-DOMAIN-ERROR-ONCE"; exit 1; }
grep -rnE 'setServerLogTraceReader\(' "$D/deps.ts" "$D/site-deps" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S9-TRACE-READER-ONCE"; exit 1; }
grep -rnE '^  (const [^=]+= )?await (normalizeSiteVaultAtBoot|composeProviderConfig|providerPluginBoot)\(' "$D/deps.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 3 || { cat "$W/hits"; echo "STOP-S9-ROOT-AWAITS"; exit 1; }
grep -rnE '^(export )?async function|^  (const [^=]+= )?await ' "$D/site-deps/slices/site-keys.ts" "$D/site-deps/slices/assistant-secrets.ts" "$D/site-deps/slices/provider-config.ts" "$D/site-deps/slices/provider-boot-input.ts" "$D/site-deps/slices/provider-plugins.ts" "$D/site-deps/slices/observed-stores.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S9-ASYNC-SLICE"; exit 1; }
grep -rnE 'consoleLogger' "$D/site-deps" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S9-CONSOLE-IN-SLICE"; exit 1; }
```
(The root-await pattern counts the `const { … } = await composeProviderConfig(` form too: `const [^=]+= ` spans the destructuring.) Gates: COMMON §5; `deps-observability-wiring`, `deps-provider-plugin-boot`, `deps-project-credentials` are in `tests sr`.
