# J4 (Jini): bundled source listing, host-signal parser and declaration reader in `@jini-ai/agent-plugins/lifecycle/node` (one repo: Jini; Codex-ready)

Why: the desktop resolves host signals with the website's `resolveBundledHostSignals` (`apps/desktop/src/desktop-host-signals.ts:3`). Its file-system half is generic: Jini already parses `hostSignals`/`deploymentAdvice` (`packages/agent-plugins/src/lifecycle/metadata.ts:5-16,84-92`) and already models the retired-plugin map as a host port (`lifecycle/ports.ts:51`). Tovu keeps the retired map's contents and the selection/evaluation rules (`@tovu/contracts/host-signals`). Judge 3 H1: v3 exported two functions while T7 imported a third (`parseHostSignalDeclaration`). v4 exports **all three** from one public path, `@jini-ai/agent-plugins/lifecycle/node` (`package.json:142-145` -> `dist/lifecycle/node.js`), so the Tovu parser tests keep running against the public API (T7). This sheet carries the source it copies; the executor reads no Tovu checkout.
Jini for verification: this sheet's commit. Named packages: `agent-plugins`.

## Files to change (one commit: `feat(agent-plugins): bundled source listing and host-signal declaration reader (node)`)
NEW `packages/agent-plugins/src/lifecycle/bundled-sources.ts`:
```ts
/** Reading host-signal declarations from a product's own bundled agent-plugin sources: manifests only,
 * never plugin code, and never an operator-writable install directory. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readAgentPluginMetadata, type AgentPluginHostSignal } from './metadata.js';

/** One plugin's declared host signals and its optional deployment advice. */
export interface AgentPluginHostSignalDeclaration {
  readonly signals: readonly AgentPluginHostSignal[];
  readonly deploymentAdvice?: string;
}
```
then four functions, each body copied from Tovu `2d82735a6` with only the substitutions named:
1. `export function listBundledPluginSources(required: { readonly sourceRoot: string; readonly filename: string; readonly retired: ReadonlyMap<string, unknown> }, _optional: Record<string, never> = {}): readonly { pluginId: string; packageRoot: string }[]` with TSDoc "Bundled plugin sources in plugin-id order. A source needs both `plugin.json` and `filename`; retired ids and non-directories never contribute. Synchronous so every reader applies the same selection. @complexity O(p) directories." Body = Tovu `bundled-contribution-sources.ts:12-16`:
   ```ts
   return readdirSync(required.sourceRoot, { withFileTypes: true })
     .filter(entry => entry.isDirectory() && !RETIRED_BUNDLED_AGENT_PLUGINS.has(entry.name))
     .map(entry => ({ pluginId: entry.name, packageRoot: path.join(required.sourceRoot, entry.name) }))
     .filter(plugin => existsSync(path.join(plugin.packageRoot, "plugin.json")) && existsSync(path.join(plugin.packageRoot, required.filename)))
     .sort((a, b) => a.pluginId.localeCompare(b.pluginId, "en"));
   ```
   with `RETIRED_BUNDLED_AGENT_PLUGINS` -> `required.retired`.
2. `export function parseHostSignalDeclaration({ manifest }: { manifest: unknown }, _optional = {}): AgentPluginHostSignalDeclaration | undefined`, TSDoc and body = Tovu `features/agent-plugins/host-signals.ts:8-19` verbatim:
   ```ts
   const { metadata } = readAgentPluginMetadata({ value: manifest });
   if (metadata.hostSignals === undefined) return undefined;
   return { signals: metadata.hostSignals, ...(metadata.deploymentAdvice === undefined ? {} : { deploymentAdvice: metadata.deploymentAdvice }) };
   ```
3. `export function readBundledHostSignalDeclaration(required: { readonly sourceRoot: string; readonly retired: ReadonlyMap<string, unknown> }, optional: { readonly sources?: typeof listBundledPluginSources; readonly readText?: (file: string) => string } = {}): AgentPluginHostSignalDeclaration`, TSDoc = Tovu `host-signals.ts:26-34` with "the hermetic bundled source policy" kept and `@example readBundledHostSignalDeclaration({ sourceRoot, retired })`; body = Tovu `host-signals.ts:39-50`:
   ```ts
   let sources: ReturnType<typeof listBundledPluginSources>;
   // Preboot readers must not turn a missing bundled payload into a boot failure.
   try { sources = (optional.sources ?? listBundledPluginSources)({ ...required, filename: "plugin.json" }); }
   catch { return { signals: [] }; }
   const declarations = sources.flatMap(source => {
     try {
       const file = path.join(source.packageRoot, "plugin.json");
       const text = optional.readText === undefined || optional.readText === null ? readManifestText({ file }) : optional.readText(file);
       const declaration = parseHostSignalDeclaration({ manifest: JSON.parse(text) });
       return declaration === undefined ? [] : [declaration];
     } catch { return []; }
   });
   return combineDeclarations({ declarations });
   ```
   (the only changes: `bundledContributionSources` -> `listBundledPluginSources`; the comment drops Tovu's "(phase 2 policy)" reference).
4. private `combineDeclarations` and `readManifestText` = Tovu `host-signals.ts:53-63` verbatim (types renamed to `AgentPluginHostSignalDeclaration`).
- `packages/agent-plugins/src/lifecycle/node.ts`: append `export { listBundledPluginSources, parseHostSignalDeclaration, readBundledHostSignalDeclaration, type AgentPluginHostSignalDeclaration } from './bundled-sources.js';`.
- `scripts/error-gate-debt.json`: add `{ "file": "packages/agent-plugins/src/lifecycle/bundled-sources.ts", "rule": "catch-reads-error", "value": 2 }` in path order (the two catches move unchanged; T7 moves Tovu's row `error-gate-debt.json:948`). Verifier sets the reported count if different (never above 2).
- `api-baseline/jini-ai__agent-plugins.json` (regenerated by the verifier, COMMON 1); NEW `.changeset/agent-plugins-bundled-host-signals.md`: `"@jini-ai/agent-plugins": minor` / "Add `listBundledPluginSources`, `parseHostSignalDeclaration` and `readBundledHostSignalDeclaration` to `@jini-ai/agent-plugins/lifecycle/node`."
Neutral wording only (guard): no product names in code, comments or tests; test ids `alpha`, `beta`, `retired-one`.

## Characterization tests to add
NEW `packages/agent-plugins/src/lifecycle/__tests__/bundled-sources.test.ts` (vitest; temp dirs from `fs.mkdtempSync(path.join(os.tmpdir(), ...))`, every expected path built with `path.join`, removed in `afterEach`):
1. listing: `retired-one` skipped; a folder without `plugin.json` skipped; a folder without `filename` skipped; a plain file skipped; result sorted `alpha`, `beta`.
2. parser: a manifest with signals + advice -> both; `hostSignals` absent -> `undefined`; an invalid `hostSignals` -> `undefined` (Jini's metadata reader rejects it).
3. reader: missing `sourceRoot` -> `{ signals: [] }`; one malformed `plugin.json` skipped, others kept; duplicate env names across plugins -> `{ signals: [] }`; two distinct advices -> `{ signals: [] }`; `readText` port used when given; `sources` port used when given.
Red checks: (1) drop `&& !required.retired.has(entry.name)` -> case 1 fails; (2) `combineDeclarations` returns `{ signals }` without the duplicate check -> case 3 duplicate-env fails.

## STOP conditions
- `rg -n "listBundledPluginSources|readBundledHostSignalDeclaration|parseHostSignalDeclaration" packages` prints a hit before the edit.
- `metadata.ts` does not export `AgentPluginHostSignal` with exactly the fields `env`, `facts { hosted?, nativeToolsRestricted?, trustProxyHops? }`, `label?` (T7's type check depends on it).
