### jini:packages/ui/src/features/connectors/ConnectorsBrowser.tsx
- **Over:** `ConnectorsBrowser` 126 (file 217, fine)
- **Phase:** now · **Batch:** size-37
- **Tests:** `src/features/connectors/__tests__/ConnectorsBrowser.test.tsx`, `src/features/connectors/__tests__/hooks/useWiredConnectorsBrowser.test.ts`, `src/features/connectors/__tests__/dependencies.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `filter`, `selectedProvider`, `useWiredConnectorsBrowser(...)` (+ its "Dependency resolution…" comment), `providerScopedConnectors`, `filteredConnectors`, `hasNoResults`, `alerts`, `handleProviderTabSelect`, `handleGateClick`, `actions`, `categoryLabelProps`, `gateProps`; type `ConnectorActionCallbacks` | browser state, wiring and action callbacks |
| B | `<div className="tab-panel-toolbar">` JSX | heading + provider tabs + search |
| C | `ConnectorsDetailPane`, `subHandleProp`, `ConnectorsDetailPaneProps`, rest of JSX | stays |

- **Splits** (in order):
  1. NEW `ConnectorsBrowser.hooks.ts` (sibling) — job: the browser's state + wiring. Moves type `ConnectorActionCallbacks` (with its doc comment; now `export`ed). `export function useConnectorsBrowser(input: UseConnectorsBrowserInput): ConnectorsBrowserState` ← unit A statements verbatim in order (calls `const t = useT();` itself for `alerts`). `UseConnectorsBrowserInput = UseWiredConnectorsBrowserParams & { providerTabs: readonly ProviderTab[]; getCategoryLabel?: (category: string) => string; gate?: ConnectorGateProps; onProviderTabClick?: (element: 'provider_chip' | 'search_connectors' | 'gate_card') => void }` (import `UseWiredConnectorsBrowserParams` from `./hooks/useWiredConnectorsBrowser.js`; do NOT import `ConnectorsBrowserProps` — cycle). Destructure all fields from `input` at the top. Returns `{ filter, setFilter, selectedProvider, catalog, authorization, detail, filteredConnectors, hasNoResults, alerts, handleProviderTabSelect, actions, categoryLabelProps, gateProps }`; declare the return type as an interface `ConnectorsBrowserState` using `WiredConnectorsBrowserController['catalog' | 'authorization' | 'detail']`, `ReturnType<typeof connectorPanelAlerts>`, `ConnectorActionCallbacks`, `Dispatch<SetStateAction<string>>`, and for `categoryLabelProps`/`gateProps` `{ getCategoryLabel?: (category: string) => string }` / `{ gate?: ConnectorGateProps }` — never loosen.
  2. SUB-COMPONENT in the original above `ConnectorsBrowser`: `ConnectorsBrowserToolbar({ providerTabs, selectedProvider, onSelectProvider, filter, onFilterChange, unlocked, onProviderTabClick, agentHandle }: ConnectorsBrowserToolbarProps): JSX.Element` ← unit B verbatim (`handleProviderTabSelect` → `onSelectProvider`, `setFilter` → `onFilterChange`). Calls `useT()`.
  3. `ConnectorsBrowser` keeps the prop destructuring (with `providerTabs = DEFAULT_PROVIDER_TABS` default), `const t = useT();`, `const { … } = useConnectorsBrowser({ … all needed props … });`, and the JSX (toolbar → `<ConnectorsBrowserToolbar …/>`). Remove unused imports (`useCallback`, `useMemo`, `useState`, rules, `AUTHORIZATION_CANCEL_FAILED_MESSAGE`, `DEFAULT_PROVIDER_TAB_ID`, `useWiredConnectorsBrowser`) — they move to the hooks file.
  4. `ConnectorsDetailPaneProps` uses `ConnectorActionCallbacks` → import it as a type from `./ConnectorsBrowser.hooks.js`.
- **Importers to update:** none outside (`ConnectorActionCallbacks` was module-private; `ConnectorsBrowser`/`ConnectorsBrowserProps` stay; `index.ts` unchanged).
- **After:** file ~165; `ConnectorsBrowser` ~70; `ConnectorsBrowserToolbar` ~30; hooks file ~95 (`useConnectorsBrowser` ~70).
- **Risks / notes:** `actions` is rebuilt each render as today (not memoized) — keep it that way. `t` in deps of `alerts` stays. No `vi.mock` of this file (the test injects hook overrides via props, which still flow through `useWiredConnectorsBrowser`).
