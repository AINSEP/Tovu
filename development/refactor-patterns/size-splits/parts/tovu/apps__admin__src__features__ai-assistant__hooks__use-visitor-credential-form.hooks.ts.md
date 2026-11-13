### tovu:apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts
- **Over:** `useVisitorCredentialForm` 145 (file 357, under)
- **Phase:** now (?) · **Batch:** size-15
- **Tests:** `apps/admin/src/features/ai-assistant/__tests__/use-visitor-credential-form.unit.test.ts`, `apps/admin/src/features/ai-assistant/__tests__/VisitorCredentialForm.unit.test.tsx`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | the hydration `useEffect(() => {` using `apiRef, setStored, setConfig, setLoadState` | load stored credential once |
| B | `discoveryConfig` + `storedEndpointMismatch` refs (and their `.current =` lines), the "Discovery on load" effect, `presetSuppliedEndpoint`, the "Debounced, key-driven model discovery" effect | model discovery |
| C | `writes`, `saveState`, `settingsSaveState`, `saveKey`, `saveSettings` | the two Save buttons on one serial lane |
| D | config/preset/port/discovery/connectionTest/stored/loadState/dirty, `editConfig`, derived flags, `runKeyTest`, `runTestConnection`, `selectPreset*`, `configuredIds`, return | compose (stays) |

- **Splits** (same file, module level, above the hook, after `runVisitorTestConnection`):
  1. SUB-HOOK `useVisitorCredentialHydration({ apiRef, setStored, setConfig, setLoadState }: UseVisitorCredentialHydrationInput): void` ← the hydration effect (its "Hydrate from the server once" comment moves with it; deps array unchanged).
  2. SUB-HOOK `useVisitorModelDiscovery({ port, config, stored, apiKey, baseUrl, protocol, storedKeyIsForOtherEndpoint, setDiscovery, setConfig }: UseVisitorModelDiscoveryInput): void` ← from `const discoveryConfig = useRef(config);` through the debounced discovery effect, incl. `presetSuppliedEndpoint` and its SECURITY GATE comment (verbatim). `port` is the `useRef` object — pass the ref.
  3. SUB-HOOK `useVisitorCredentialSaves({ apiRef, config, setStored, setConfig, setDirty }: UseVisitorCredentialSavesInput): { saveState: SaveState; settingsSaveState: SaveState; saveKey: () => void; saveSettings: () => void }` ← `saveState`/`settingsSaveState` `useState` lines, `const writes = useSerialWrites();` (+ "One lane for both Save buttons" comment), `saveKey`, `saveSettings`. (The "Nothing on this screen writes a credential except these two functions" comment moves here; `hasStoredKey` stays in the hook.)
- **Importers to update:** none.
- **After:** file ~375; `useVisitorCredentialForm` ~70; discovery sub-hook ~50.
- **Risks / notes:** the debounced-discovery effect's security gate depends on `presetSuppliedEndpoint` memo over `baseUrl` — keep it inside the same sub-hook. `MODEL_DISCOVERY_DEBOUNCE_MS` is module level — fine.
