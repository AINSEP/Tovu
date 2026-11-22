# D-site-export-1 — site-export → @jini-ai/devops (Jini step J then Tovu step T)

Lane D. Batch J:1 T:2. Depends on: none (only already-Jini code). Est: J 35 min, T 23 min.

## J — move verbatim into Jini (3 files, 215 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/site-export/export-failure-summary.ts` | `packages/devops/src/static-export/site/export-failure-summary.ts` | 57 |  |
| `apps/website/src/features/site-export/ports.ts` | `packages/devops/src/static-export/site/ports.ts` | 96 |  |
| `apps/website/src/features/site-export/public-origin-policy.ts` | `packages/devops/src/static-export/site/public-origin-policy.ts` | 62 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/devops" exports["./static-export/site/export-failure-summary"]
- "@jini-ai/devops" exports["./static-export/site/ports"]
- "@jini-ai/devops" exports["./static-export/site/public-origin-policy"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 3 sources, rewrite every importer (9 lines)

```
apps/website/src/features/deployments/static-publish/adapter.ts:44  '#src/features/site-export/export-failure-summary' -> '@jini-ai/devops/static-export/site/export-failure-summary'
apps/website/src/features/site-export/__tests__/export-failure-summary.test.ts:3  '../export-failure-summary.js' -> '@jini-ai/devops/static-export/site/export-failure-summary'
apps/website/src/features/site-export/site-exporter.ts:24  './export-failure-summary.js' -> '@jini-ai/devops/static-export/site/export-failure-summary'
apps/website/src/features/site-export/index.ts:5  './ports.js' -> '@jini-ai/devops/static-export/site/ports'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/site-export/route-manifest.ts:12  './ports.js' -> '@jini-ai/devops/static-export/site/ports'
apps/website/src/features/site-export/theme-preview-manifest.ts:5  './ports.js' -> '@jini-ai/devops/static-export/site/ports'
apps/website/src/features/site-backup/__tests__/static-copy.unit.test.ts:21  '../../site-export/public-origin-policy.js' -> '@jini-ai/devops/static-export/site/public-origin-policy'
apps/website/src/features/site-export/__tests__/static-copy-policy.unit.test.ts:20  '../public-origin-policy.js' -> '@jini-ai/devops/static-export/site/public-origin-policy'
apps/website/src/features/site-export/site-exporter.ts:19  './public-origin-policy.js' -> '@jini-ai/devops/static-export/site/public-origin-policy'
```

## Tovu tests that must stay green (3; import lines are repointed above, assertions untouched)
- `apps/website/src/features/site-backup/__tests__/static-copy.unit.test.ts`
- `apps/website/src/features/site-export/__tests__/export-failure-summary.test.ts`
- `apps/website/src/features/site-export/__tests__/static-copy-policy.unit.test.ts`

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/site-export/export-failure-summary.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/website/src/features/site-export/ports.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `ports.ts`, negate the first `if (` condition of its first exported function; a NEW characterization test (write it first, tests-first rule) must go red, then revert
