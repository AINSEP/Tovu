# C-contracts-headless-1 — contracts-headless → @jini-ai/core (Jini step J then Tovu step T)

Lane C. Batch J:2 T:3. Depends on: none (only already-Jini code). Est: J 44 min, T 27 min.

## J — move verbatim into Jini (6 files, 289 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/contracts/headless/assistant-permanent-deletes-policy.ts` | `packages/core/src/contracts/headless/assistant-permanent-deletes-policy.ts` | 40 | W2 |
| `apps/website/src/contracts/headless/chart-providers.ts` | `packages/core/src/contracts/headless/chart-providers.ts` | 7 |  |
| `apps/website/src/contracts/headless/chat-attachment.ts` | `packages/core/src/contracts/headless/chat-attachment.ts` | 27 |  |
| `apps/website/src/contracts/headless/contracts.ts` | `packages/core/src/contracts/headless/contracts.ts` | 177 |  |
| `apps/website/src/contracts/headless/member-login.ts` | `packages/core/src/contracts/headless/member-login.ts` | 3 |  |
| `apps/website/src/contracts/headless/plugin-install-source.ts` | `packages/core/src/contracts/headless/plugin-install-source.ts` | 35 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/core" exports["./contracts/headless/assistant-permanent-deletes-policy"]
- "@jini-ai/core" exports["./contracts/headless/chart-providers"]
- "@jini-ai/core" exports["./contracts/headless/chat-attachment"]
- "@jini-ai/core" exports["./contracts/headless/contracts"]
- "@jini-ai/core" exports["./contracts/headless/member-login"]
- "@jini-ai/core" exports["./contracts/headless/plugin-install-source"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 6 sources, rewrite every importer (15 lines)

```
apps/website/src/assistant/__tests__/owner-permanent-delete-policy.test.ts:50  '../../contracts/headless/assistant-permanent-deletes-policy.js' -> '@jini-ai/core/contracts/headless/assistant-permanent-deletes-policy'
apps/website/src/contracts/headless/__tests__/index.barrel.unit.test.ts:6  '../assistant-permanent-deletes-policy.js' -> '@jini-ai/core/contracts/headless/assistant-permanent-deletes-policy'
apps/website/src/contracts/headless/index.ts:12  './assistant-permanent-deletes-policy.js' -> '@jini-ai/core/contracts/headless/assistant-permanent-deletes-policy'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/contracts/headless/index.ts:13  './assistant-permanent-deletes-policy.js' -> '@jini-ai/core/contracts/headless/assistant-permanent-deletes-policy'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/contracts/headless/index.ts:3  './chart-providers.js' -> '@jini-ai/core/contracts/headless/chart-providers'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/contracts/headless/__tests__/index.barrel.unit.test.ts:7  '../chat-attachment.js' -> '@jini-ai/core/contracts/headless/chat-attachment'
apps/website/src/contracts/headless/index.ts:5  './chat-attachment.js' -> '@jini-ai/core/contracts/headless/chat-attachment'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/contracts/headless/index.ts:6  './chat-attachment.js' -> '@jini-ai/core/contracts/headless/chat-attachment'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/contracts/headless/index.ts:2  './contracts.js' -> '@jini-ai/core/contracts/headless/contracts'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/contracts/headless/__tests__/index.barrel.unit.test.ts:10  '../member-login.js' -> '@jini-ai/core/contracts/headless/member-login'
apps/website/src/contracts/headless/index.ts:11  './member-login.js' -> '@jini-ai/core/contracts/headless/member-login'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/__tests__/fixtures/site-layout-context.ts:70  '../../contracts/headless/plugin-install-source.js' -> '@jini-ai/core/contracts/headless/plugin-install-source'
apps/website/src/contracts/headless/__tests__/index.barrel.unit.test.ts:11  '../plugin-install-source.js' -> '@jini-ai/core/contracts/headless/plugin-install-source'
apps/website/src/contracts/headless/index.ts:16  './plugin-install-source.js' -> '@jini-ai/core/contracts/headless/plugin-install-source'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/contracts/headless/index.ts:17  './plugin-install-source.js' -> '@jini-ai/core/contracts/headless/plugin-install-source'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
```

## Tovu tests that must stay green (3; import lines are repointed above, assertions untouched)
- `apps/website/src/__tests__/fixtures/site-layout-context.ts`
- `apps/website/src/assistant/__tests__/owner-permanent-delete-policy.test.ts`
- `apps/website/src/contracts/headless/__tests__/index.barrel.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/contracts/headless/assistant-permanent-deletes-policy.ts` (2)
- `apps/website/src/contracts/headless/plugin-install-source.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/contracts/headless/assistant-permanent-deletes-policy.ts:38: PERMANENT_DELETE_TOOLS.map(tool => `${tool.id}: ${tool.adminPath ?? "there is no Tovu admin screen for this operation; say so"}`).join("; ")
apps/website/src/contracts/headless/plugin-install-source.ts:15: path: { type: "string", minLength: 1, description: "Absolute path on the machine Tovu runs on. Exactly one of path/attachmentRef." },
```

## Named mutation
in the Jini copy of `contracts.ts`, negate the first `if (` condition of its first exported function; a NEW characterization test (write it first, tests-first rule) must go red, then revert
