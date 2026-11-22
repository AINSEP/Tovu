# C-contracts-core-4 — contracts-core → @jini-ai/core (Jini step J then Tovu step T)

Lane C. Batch J:3 T:5. Depends on: C-contracts-core-3. Est: J 73 min, T 51 min.

## J — move verbatim into Jini (14 files, 1200 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/contracts/core/tool-metadata/content-read.ts` | `packages/core/src/contracts/site/tool-metadata/content-read.ts` | 119 | W1 |
| `apps/website/src/contracts/core/tool-metadata/content-types.ts` | `packages/core/src/contracts/site/tool-metadata/content-types.ts` | 99 |  |
| `apps/website/src/contracts/core/tool-metadata/custom-credentials.ts` | `packages/core/src/contracts/site/tool-metadata/custom-credentials.ts` | 107 |  |
| `apps/website/src/contracts/core/tool-metadata/database-transfer.ts` | `packages/core/src/contracts/site/tool-metadata/database-transfer.ts` | 35 |  |
| `apps/website/src/contracts/core/tool-metadata/database.ts` | `packages/core/src/contracts/site/tool-metadata/database.ts` | 114 |  |
| `apps/website/src/contracts/core/tool-metadata/email-templates.ts` | `packages/core/src/contracts/site/tool-metadata/email-templates.ts` | 44 |  |
| `apps/website/src/contracts/core/tool-metadata/entries.ts` | `packages/core/src/contracts/site/tool-metadata/entries.ts` | 78 |  |
| `apps/website/src/contracts/core/tool-metadata/external-mcp.ts` | `packages/core/src/contracts/site/tool-metadata/external-mcp.ts` | 83 |  |
| `apps/website/src/contracts/core/tool-metadata/files-copy.ts` | `packages/core/src/contracts/site/tool-metadata/files-copy.ts` | 21 |  |
| `apps/website/src/contracts/core/tool-metadata/forms.ts` | `packages/core/src/contracts/site/tool-metadata/forms.ts` | 120 |  |
| `apps/website/src/contracts/core/tool-metadata/frontend-control.ts` | `packages/core/src/contracts/site/tool-metadata/frontend-control.ts` | 81 |  |
| `apps/website/src/contracts/core/tool-metadata/fs-files.ts` | `packages/core/src/contracts/site/tool-metadata/fs-files.ts` | 49 |  |
| `apps/website/src/contracts/core/tool-metadata/identity.ts` | `packages/core/src/contracts/site/tool-metadata/identity.ts` | 229 |  |
| `apps/website/src/contracts/core/tool-metadata/image-transform.ts` | `packages/core/src/contracts/site/tool-metadata/image-transform.ts` | 21 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/core" exports["./contracts/site/tool-metadata/content-read"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/content-types"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/custom-credentials"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/database"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/database-transfer"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/email-templates"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/entries"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/external-mcp"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/files-copy"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/forms"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/frontend-control"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/fs-files"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/identity"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/image-transform"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 14 sources, rewrite every importer (48 lines)

```
apps/website/src/assistant/__tests__/fixtures/published-catalog-descriptor.ts:2  '#src/contracts/core/tool-metadata/content-read' -> '@jini-ai/core/contracts/site/tool-metadata/content-read'
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:134  '#src/contracts/core/tool-metadata/content-read' -> '@jini-ai/core/contracts/site/tool-metadata/content-read'
apps/website/src/assistant/__tests__/tool-registrations.forms.test.ts:2  '#src/contracts/core/tool-metadata/content-read' -> '@jini-ai/core/contracts/site/tool-metadata/content-read'
apps/website/src/assistant/__tests__/tool-registrations.webhooks.test.ts:2  '#src/contracts/core/tool-metadata/content-read' -> '@jini-ai/core/contracts/site/tool-metadata/content-read'
apps/website/src/assistant/content-read-tool.ts:1  '../contracts/core/tool-metadata/content-read.js' -> '@jini-ai/core/contracts/site/tool-metadata/content-read'
apps/website/src/contracts/core/tool-metadata/index.ts:11  './content-read.js' -> '@jini-ai/core/contracts/site/tool-metadata/content-read'
apps/website/src/features/comments/tool-registrations.ts:11  '../../contracts/core/tool-metadata/content-read.js' -> '@jini-ai/core/contracts/site/tool-metadata/content-read'
apps/website/src/features/forms/tool-registrations.ts:16  '../../contracts/core/tool-metadata/content-read.js' -> '@jini-ai/core/contracts/site/tool-metadata/content-read'
apps/website/src/features/redirects/tool-registrations.ts:8  '../../contracts/core/tool-metadata/content-read.js' -> '@jini-ai/core/contracts/site/tool-metadata/content-read'
apps/website/src/features/seo/tool-registrations.ts:12  '../../contracts/core/tool-metadata/content-read.js' -> '@jini-ai/core/contracts/site/tool-metadata/content-read'
apps/website/src/features/taxonomy/tool-registrations.ts:2  '../../contracts/core/tool-metadata/content-read.js' -> '@jini-ai/core/contracts/site/tool-metadata/content-read'
apps/website/src/features/webhooks/tool-registrations.ts:12  '../../contracts/core/tool-metadata/content-read.js' -> '@jini-ai/core/contracts/site/tool-metadata/content-read'
apps/website/src/features/widgets/tool-registrations.ts:11  '../../contracts/core/tool-metadata/content-read.js' -> '@jini-ai/core/contracts/site/tool-metadata/content-read'
apps/website/src/contracts/core/tool-metadata/index.ts:12  './content-types.js' -> '@jini-ai/core/contracts/site/tool-metadata/content-types'
apps/website/src/features/content-types/tool-registrations.ts:1  '../../contracts/core/tool-metadata/content-types.js' -> '@jini-ai/core/contracts/site/tool-metadata/content-types'
apps/website/src/contracts/core/tool-metadata/index.ts:13  './custom-credentials.js' -> '@jini-ai/core/contracts/site/tool-metadata/custom-credentials'
apps/website/src/features/custom-credentials/__tests__/extract-s8-c2p2-host-inputs.test.ts:15  '../../../contracts/core/tool-metadata/custom-credentials.js' -> '@jini-ai/core/contracts/site/tool-metadata/custom-credentials'
apps/website/src/features/custom-credentials/__tests__/extract-s8-c2p2c-ports.test.ts:24  '../../../contracts/core/tool-metadata/custom-credentials.js' -> '@jini-ai/core/contracts/site/tool-metadata/custom-credentials'
apps/website/src/features/custom-credentials/__tests__/extract-s8-x-host-operations.test.ts:13  '../../../contracts/core/tool-metadata/custom-credentials.js' -> '@jini-ai/core/contracts/site/tool-metadata/custom-credentials'
apps/website/src/features/custom-credentials/credential-copy-tool.ts:13  '../../contracts/core/tool-metadata/custom-credentials.js' -> '@jini-ai/core/contracts/site/tool-metadata/custom-credentials'
apps/website/src/features/custom-credentials/credential-save-tool.ts:2  '../../contracts/core/tool-metadata/custom-credentials.js' -> '@jini-ai/core/contracts/site/tool-metadata/custom-credentials'
apps/website/src/features/custom-credentials/tool-registrations.ts:11  '../../contracts/core/tool-metadata/custom-credentials.js' -> '@jini-ai/core/contracts/site/tool-metadata/custom-credentials'
apps/website/src/features/project-keys/tools.ts:4  '../../contracts/core/tool-metadata/custom-credentials.js' -> '@jini-ai/core/contracts/site/tool-metadata/custom-credentials'
apps/website/src/contracts/core/tool-metadata/index.ts:15  './database-transfer.js' -> '@jini-ai/core/contracts/site/tool-metadata/database-transfer'
apps/website/src/features/database-transfer/tool-registrations.ts:1  '../../contracts/core/tool-metadata/database-transfer.js' -> '@jini-ai/core/contracts/site/tool-metadata/database-transfer'
apps/website/src/contracts/core/tool-metadata/index.ts:14  './database.js' -> '@jini-ai/core/contracts/site/tool-metadata/database'
apps/website/src/features/database/tool-registrations.ts:1  '../../contracts/core/tool-metadata/database.js' -> '@jini-ai/core/contracts/site/tool-metadata/database'
apps/website/src/contracts/core/tool-metadata/index.ts:27  './email-templates.js' -> '@jini-ai/core/contracts/site/tool-metadata/email-templates'
apps/website/src/features/email-templates/tool-registrations.ts:2  '../../contracts/core/tool-metadata/email-templates.js' -> '@jini-ai/core/contracts/site/tool-metadata/email-templates'
apps/website/src/contracts/core/tool-metadata/index.ts:20  './entries.js' -> '@jini-ai/core/contracts/site/tool-metadata/entries'
apps/website/src/features/entries/tool-registrations.ts:1  '../../contracts/core/tool-metadata/entries.js' -> '@jini-ai/core/contracts/site/tool-metadata/entries'
apps/website/src/assistant/external-mcp-reauth-tool.ts:1  '../contracts/core/tool-metadata/external-mcp.js' -> '@jini-ai/core/contracts/site/tool-metadata/external-mcp'
apps/website/src/contracts/core/tool-metadata/index.ts:19  './external-mcp.js' -> '@jini-ai/core/contracts/site/tool-metadata/external-mcp'
apps/website/src/features/external-mcp/operations-tools.ts:1  '../../contracts/core/tool-metadata/external-mcp.js' -> '@jini-ai/core/contracts/site/tool-metadata/external-mcp'
apps/website/src/features/external-mcp/tool-registrations.ts:2  '../../contracts/core/tool-metadata/external-mcp.js' -> '@jini-ai/core/contracts/site/tool-metadata/external-mcp'
apps/website/src/contracts/core/tool-metadata/index.ts:25  './files-copy.js' -> '@jini-ai/core/contracts/site/tool-metadata/files-copy'
apps/website/src/features/asset-transfer/copy-tool.ts:10  '#src/contracts/core/tool-metadata/files-copy' -> '@jini-ai/core/contracts/site/tool-metadata/files-copy'
apps/website/src/contracts/core/tool-metadata/index.ts:21  './forms.js' -> '@jini-ai/core/contracts/site/tool-metadata/forms'
apps/website/src/features/forms/tool-registrations.ts:28  '../../contracts/core/tool-metadata/forms.js' -> '@jini-ai/core/contracts/site/tool-metadata/forms'
apps/website/src/assistant/frontend-control-capabilities.ts:100  '../contracts/core/tool-metadata/frontend-control.js' -> '@jini-ai/core/contracts/site/tool-metadata/frontend-control'
apps/website/src/contracts/core/tool-metadata/index.ts:22  './frontend-control.js' -> '@jini-ai/core/contracts/site/tool-metadata/frontend-control'
apps/website/src/contracts/core/tool-metadata/index.ts:23  './fs-files.js' -> '@jini-ai/core/contracts/site/tool-metadata/fs-files'
apps/website/src/features/fs-files/tool-registrations.ts:2  '../../contracts/core/tool-metadata/fs-files.js' -> '@jini-ai/core/contracts/site/tool-metadata/fs-files'
apps/website/src/contracts/core/tool-metadata/index.ts:24  './identity.js' -> '@jini-ai/core/contracts/site/tool-metadata/identity'
apps/website/src/features/identity/permission-list-tool.ts:1  '../../contracts/core/tool-metadata/identity.js' -> '@jini-ai/core/contracts/site/tool-metadata/identity'
apps/website/src/features/identity/tool-registrations.ts:3  '../../contracts/core/tool-metadata/identity.js' -> '@jini-ai/core/contracts/site/tool-metadata/identity'
apps/website/src/contracts/core/tool-metadata/index.ts:26  './image-transform.js' -> '@jini-ai/core/contracts/site/tool-metadata/image-transform'
apps/website/src/features/image-transform/tool.ts:1  '../../contracts/core/tool-metadata/image-transform.js' -> '@jini-ai/core/contracts/site/tool-metadata/image-transform'
```

## Tovu tests that must stay green (7; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/fixtures/published-catalog-descriptor.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.forms.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.webhooks.test.ts`
- `apps/website/src/features/custom-credentials/__tests__/extract-s8-c2p2-host-inputs.test.ts`
- `apps/website/src/features/custom-credentials/__tests__/extract-s8-c2p2c-ports.test.ts`
- `apps/website/src/features/custom-credentials/__tests__/extract-s8-x-host-operations.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/contracts/core/tool-metadata/content-read.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Named mutation
in the Jini copy of `identity.ts`, negate the first `if (` condition of its first exported function; a NEW characterization test (write it first, tests-first rule) must go red, then revert
