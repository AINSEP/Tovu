# website/features/media-generation (W1 #36, level 3): 3 slices; slice 1 READY, slices 2-3 PARTIAL (need an Opus fill)
Written 2026-11-16 from Tovu b28d38c6 / Jini b7666092 (refactor/terra); skeleton by make-sheet.py. CLASSIFY tier: Opus.
kind: SPLIT (3 MIXED files, 729 loc). Per file:
  - agent-tools.ts (blob 8276d38ab631e7fecff876c3354d03b25f809c81, 143 loc): the image-model filter rule is pure catalogue logic -> MOVE slice MV-media-generation-1 (READY). The tool catalog (`media_generate_asset` schema and text) STAYS (Tovu tool wording).
  - media-provider-registry.ts (blob 9bcbb28bb8844d9b003bc68d78442c553b6e6af0, 152 loc): survey: parser -> `@jini-ai/agent-plugins/lifecycle`, validators -> `@jini-ai/integrations/media-providers`. PARTIAL: not filled this run (see slice 2 notes).
  - tool-registrations.ts (blob fbb3fc0c06b8845ef74587a9942dbc6165ed7875, 434 loc, 4 stay_imports): survey: -> `@jini-ai/integrations/media-providers` with host port `resolveSavedCredential({providerId})` + env. PARTIAL: not filled this run (see slice 3 notes).
untangle_overlap:
  - C3.repoint.tsv:459 providers-tools.ts (not in this feature's backlog; untouched here)
  - C3.repoint.tsv:460 tool-registrations.ts (`AuthorizeFn` from ../../contracts/core/commands -> @jini-ai/core/contracts/events): slice 1 edits ONE import line of tool-registrations.ts (line 39, a different line) -> slice 1 may run before wave B; guard it by exact text, not blob. Slice 3 rewrites the file: execute after wave B merge.
  - C11.repoint.tsv:149 __tests__/providers-tools.test.ts (not edited here).

## Slice MV-media-generation-1 (T-MOVE): imageModelIdsFrom + IMAGE_MODEL_IDS into @jini-ai/integrations/media-providers/catalog
tovu_files:
  - apps/website/src/features/media-generation/agent-tools.ts | blob 8276d38ab631e7fecff876c3354d03b25f809c81
  - apps/website/src/features/media-generation/tool-registrations.ts | text-guarded (C3 lane hot): the line "import { buildMediaGenerationAgentToolCatalog, IMAGE_MODEL_IDS, imageModelIdsFrom } from \"./agent-tools.js\";" must occur exactly once
jini guards: packages/integrations/src/media-providers/image-model-ids.ts must not exist; `rg -n "imageModelIdsFrom|ImageModelCatalog|IMAGE_MODEL_IDS" packages/integrations/src` prints nothing; packages/integrations/src/media-providers/catalog.ts | blob c1a0111eaa003bde01ca3d89c7ea6c94820cafaa; `rg -n "export const IMAGE_MODELS|export function findProvider" packages/integrations/src/media-providers/providers.ts` prints 2 lines.
jini_code (new file packages/integrations/src/media-providers/image-model-ids.ts):
```ts
import { IMAGE_MODELS, findProvider } from './providers.js';

/** The two catalogue reads the image-model rule needs: structurally a `MediaModelCatalog` /
 *  `MediaProviderRegistry`, declared here so this file stays inside the dependency-free catalog graph. */
export interface ImageModelCatalog {
  modelsForSurface(required: { surface: "image" }): readonly { readonly id: string; readonly provider: string }[];
  findProvider(required: { id: string }): { readonly integrated: boolean } | null;
}

/**
 * Every image model in `catalog` whose vendor the catalogue itself marks `integrated` (a real vendor,
 * not a planned/placeholder entry). A host advertising an image tool uses this as the `model` enum AND
 * re-checks the caller's `model` against it in the handler: a tool schema's `enum` is descriptive only
 * (the kernel neither parses nor validates a tool's schema), so a model outside this set must be
 * rejected there. Catalogue order is kept: it is the default-model resolution order. Pass the live
 * provider registry so plugin-contributed vendors' image models are included.
 * @complexity O(m) image models.
 */
export function imageModelIdsFrom({ catalog }: { catalog: ImageModelCatalog }, _optional: Record<string, never> = {}): string[] {
  return catalog.modelsForSurface({ surface: "image" })
    .filter((model) => catalog.findProvider({ id: model.provider })?.integrated === true)
    .map((model) => model.id);
}

/**
 * {@link imageModelIdsFrom} over the built-in catalogue, computed at import time. `integrated` is a
 * reliable proxy for "the dispatch engine has a real adapter": every image-surface provider marked
 * `integrated: true` has an adapter registered in the dispatch engine's vendor registry (which this
 * dependency-free subpath deliberately does not import), and the `providers.test.ts` adapter-coverage
 * assertion fails if the catalogue claims a vendor the engine cannot render.
 */
export const IMAGE_MODEL_IDS: readonly string[] = imageModelIdsFrom({ catalog: { modelsForSurface: () => IMAGE_MODELS, findProvider } });
```
jini_index: packages/integrations/src/media-providers/catalog.ts: after "export * from './providers.js';" insert "export * from './image-model-ids.js';"
  (the catalog import-graph test in `__tests__/catalog.test.ts` must still pass: the new file imports only './providers.js'. If that test enumerates allowed files by name, SKIP: the sheet does not edit it.)
jini_tests (new file packages/integrations/src/media-providers/__tests__/image-model-ids.test.ts):
```ts
import { describe, expect, it } from 'vitest';
import { IMAGE_MODEL_IDS, imageModelIdsFrom } from '../image-model-ids.js';
import { IMAGE_MODELS, findProvider } from '../providers.js';

describe('imageModelIdsFrom', () => {
  it('keeps catalogue order and drops models whose vendor is not integrated', () => {
    const catalog = {
      modelsForSurface: () => [{ id: 'a', provider: 'real' }, { id: 'b', provider: 'planned' }, { id: 'c', provider: 'missing' }, { id: 'd', provider: 'real' }],
      findProvider: ({ id }: { id: string }) => (id === 'real' ? { integrated: true } : id === 'planned' ? { integrated: false } : null),
    };
    expect(imageModelIdsFrom({ catalog })).toEqual(['a', 'd']);
  });

  it('IMAGE_MODEL_IDS is the rule over the built-in catalogue', () => {
    expect(IMAGE_MODEL_IDS).toEqual(IMAGE_MODELS.filter((model) => findProvider({ id: model.provider })?.integrated === true).map((model) => model.id));
    expect(IMAGE_MODEL_IDS.length).toBeGreaterThan(0);
  });
});
```
changeset: .changeset/integrations-image-model-ids.md: `"@jini-ai/integrations": minor` | "`@jini-ai/integrations/media-providers/catalog` exports `imageModelIdsFrom` and `IMAGE_MODEL_IDS`: the image models whose vendor is integrated, in catalogue order."
jini_msg: "feat(integrations): image-model id rule in the media-providers catalog"
Tovu edits:
  - agent-tools.ts: "import { IMAGE_MODELS, findProvider } from \"@jini-ai/integrations/media-providers/catalog\";" -> "import { IMAGE_MODEL_IDS } from \"@jini-ai/integrations/media-providers/catalog\";"
  - agent-tools.ts: delete from line 31 ("/**" opening the IMAGE_MODEL_IDS doc, whose next line starts " * Every catalogued image model whose vendor the catalogue itself marks `integrated`") through the closing "}" of `imageModelIdsFrom` (line 78) and the blank line after it; put in their place (Tovu history stays in Tovu, COMMON rule 12):
```ts
// The `model` enum is `IMAGE_MODEL_IDS` from the media-providers catalog (vendors marked integrated, in
// catalogue order). It replaced this file's old `OPENAI_IMAGE_MODELS`, a fixed 3-entry literal that made
// every non-OpenAI vendor (including a machine's only configured one, Nano Banana / `nanobanana`)
// unreachable through this tool no matter what credential existed.

```
    Check before deleting: line 59 starts "export const IMAGE_MODEL_IDS", line 74 starts "export function imageModelIdsFrom", line 78 is "}". Else SKIP.
  - agent-tools.ts header line " * marks real (see {@link IMAGE_MODEL_IDS}), not a fixed 3-entry OpenAI literal." stays (the name is imported).
  - tool-registrations.ts: "import { buildMediaGenerationAgentToolCatalog, IMAGE_MODEL_IDS, imageModelIdsFrom } from \"./agent-tools.js\";" -> "import { IMAGE_MODEL_IDS, imageModelIdsFrom } from \"@jini-ai/integrations/media-providers/catalog\";\nimport { buildMediaGenerationAgentToolCatalog } from \"./agent-tools.js\";"
    (If tool-registrations.ts already imports from "@jini-ai/integrations/media-providers/catalog", merge the two names into that import instead.)
  - comment refs: tool-registrations.ts and __tests__/tool-registrations.test.ts mention "`agent-tools.ts`'s `IMAGE_MODEL_IDS`" conceptually (lines 54, 111, 199, 266, 274; test 495): leave them (history; the rule's doc now lives in Jini).
census: python3 scripts/census.py <TOVU> apps/website/src/features/media-generation/agent-tools.ts -> tool-registrations.ts:39 and __tests__/tool-registrations.test.ts:35 (mediaGenerationAgentToolCatalog, unchanged). `rg -n -w "imageModelIdsFrom|ImageModelCatalog" apps --glob '!**/node_modules/**'` after: only tool-registrations.ts (import + line 427 call).
tovu_msg: "refactor(media-generation): image-model id rule comes from @jini-ai/integrations"
Cloud run owes: Jini integrations vitest (catalog + new test), Tovu tool-registrations.test.ts, Tovu typecheck. No RED test.
est. executor tokens: ~40k Sonnet.

## Slice 2 (media-provider-registry.ts) — PARTIAL, not filled
Outline for the Opus fill (do not execute): parseMediaProvidersFile / parseDescriptor / refuseLabel / isPlainObject / asContribution are a generic "provider manifest file" parser keyed on Tovu's file name `tovu-media-providers.json` (MEDIA_PROVIDERS_FILENAME STAYS: product name). Target `@jini-ai/agent-plugins/lifecycle` next to `ProviderContributionDescriptor` takes the parser; validators of a media contribution go to `@jini-ai/integrations/media-providers` as pure functions. Rule 5 conflict to resolve first: the parser would need `ProviderContributionDescriptor` (agent-plugins) AND media validators (integrations) in one place; one of them must become a port. `loadMediaProviderRegistry` (node:path, Tovu LoadPluginContributions) STAYS.
est. sheet: ~35k Opus; exec ~45k Sonnet.

## Slice 3 (tool-registrations.ts) — PARTIAL, not filled; execute after wave B merge (C3.repoint.tsv:460)
Outline: the credential-resolution order across vendors (try each image model's provider in IMAGE_MODEL_IDS order until one has a reachable credential) is generic -> `@jini-ai/integrations/media-providers` with host port `resolveSavedCredential({ providerId })` and the env VALUES passed in (env NAMES stay in Tovu, COMMON rule 8). Approval wiring, Tovu media store/content types and resolveMediaPublicUrls STAY. 4 stay_imports => 4 ports; above the Sonnet cap: Opus sheet.
est. sheet: ~50k Opus; exec ~60k Sonnet.
