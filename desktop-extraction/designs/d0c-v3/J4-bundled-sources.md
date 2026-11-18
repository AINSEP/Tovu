# J4 (Jini): bundled agent-plugin source listing and host-signal declaration reader in `@jini-ai/agent-plugins/lifecycle/node` (~70k, T)

Why: the desktop resolves host signals with the website's `resolveBundledHostSignals` (`apps/desktop/src/desktop-host-signals.ts:3`). Its file-system half is generic and already half in Jini: Jini parses `hostSignals`/`deploymentAdvice` from a manifest (`packages/agent-plugins/src/lifecycle/metadata.ts:15-16,84-92`, `readAgentPluginMetadata` on `./manifest`) and already models the retired-plugin map as a host port (`lifecycle/ports.ts:51 retiredBundledPlugins: ReadonlyMap<string, string | readonly string[]>`). What is Tovu's: the retired map's contents, and the selection/evaluation rules (`@tovu/contracts/host-signals`). Design: `../D0c-REVISION-3.md` section 3.

## Census (step 0)
```bash
git -C ../Tovu show 2d82735a:apps/website/src/features/agent-plugins/bundled-contribution-sources.ts
git -C ../Tovu show 2d82735a:apps/website/src/features/agent-plugins/host-signals.ts
rg -n "export (type|interface) AgentPluginHostSignal|readonly hostSignals" packages/agent-plugins/src/lifecycle/metadata.ts
rg -n "listBundledPluginSources|readBundledHostSignalDeclaration" packages     # expected: no hit
```

## One commit: `feat(agent-plugins): bundled source listing and host-signal declaration reader (node)`
- NEW `packages/agent-plugins/src/lifecycle/bundled-sources.ts`:
  - `listBundledPluginSources(required: { sourceRoot: string; filename: string; retired: ReadonlyMap<string, unknown> }, _optional = {}): readonly { pluginId: string; packageRoot: string }[]` = Tovu `bundledContributionSources` body verbatim with `RETIRED_BUNDLED_AGENT_PLUGINS` replaced by `required.retired` (same filter order, same `localeCompare(..., "en")` sort, synchronous).
  - `readBundledHostSignalDeclaration(required: { sourceRoot: string; retired: ReadonlyMap<string, unknown> }, optional: { sources?: typeof listBundledPluginSources; readText?: (file: string) => string } = {}): { signals: readonly AgentPluginHostSignal[]; deploymentAdvice?: string }` = Tovu `host-signals.ts` `parseHostSignalDeclaration` + `readBundledHostSignalDeclaration` + `combineDeclarations` + `readManifestText`, verbatim except the source list comes from `listBundledPluginSources({ ...required, filename: 'plugin.json' })` and the types are Jini's. Same failure rules: listing throws -> `{ signals: [] }`; one unreadable/malformed manifest is skipped; duplicate env names or >1 distinct advice -> `{ signals: [] }`.
- `packages/agent-plugins/src/lifecycle/node.ts`: one export line for the two functions (the subpath's entry).
- Tests (vitest, `lifecycle/__tests__/bundled-sources.test.ts`, temp dirs built with `path.join`): retired folder skipped; folder without `plugin.json` skipped; sorted by id; duplicate env -> empty; two advices -> empty; missing `sourceRoot` -> `{ signals: [] }`; `readText` port used when given.
- `api-baseline/jini-ai__agent-plugins.json` via `pnpm api:update` (+ changeset if asked).
Mutation proof: drop the retired filter -> the retired test fails; restore.

Gate: COMMON G (Jini), `PKGS="agent-plugins"`. Neutral wording only (guard R5): no Tovu plugin ids in tests (use `alpha`, `beta`, `retired-one`).
