# C-contracts-core-6 — contracts-core → @jini-ai/core (Jini step J then Tovu step T)

Lane C. Batch J:4 T:7. Depends on: C-contracts-core-3. Est: J 71 min, T 35 min.

## J — move verbatim into Jini (14 files, 787 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/contracts/core/tool-metadata/settings.ts` | `packages/core/src/contracts/site/tool-metadata/settings.ts` | 120 |  |
| `apps/website/src/contracts/core/tool-metadata/site-evidence.ts` | `packages/core/src/contracts/site/tool-metadata/site-evidence.ts` | 14 |  |
| `apps/website/src/contracts/core/tool-metadata/site-guide.ts` | `packages/core/src/contracts/site/tool-metadata/site-guide.ts` | 14 | W2 |
| `apps/website/src/contracts/core/tool-metadata/site-inspection.ts` | `packages/core/src/contracts/site/tool-metadata/site-inspection.ts` | 58 |  |
| `apps/website/src/contracts/core/tool-metadata/sites.ts` | `packages/core/src/contracts/site/tool-metadata/sites.ts` | 59 |  |
| `apps/website/src/contracts/core/tool-metadata/skills.ts` | `packages/core/src/contracts/site/tool-metadata/skills.ts` | 13 |  |
| `apps/website/src/contracts/core/tool-metadata/taxonomy.ts` | `packages/core/src/contracts/site/tool-metadata/taxonomy.ts` | 117 |  |
| `apps/website/src/contracts/core/tool-metadata/trash.ts` | `packages/core/src/contracts/site/tool-metadata/trash.ts` | 30 |  |
| `apps/website/src/contracts/core/tool-metadata/visitor-tools.ts` | `packages/core/src/contracts/site/tool-metadata/visitor-tools.ts` | 14 |  |
| `apps/website/src/contracts/core/tool-metadata/web-screenshot.ts` | `packages/core/src/contracts/site/tool-metadata/web-screenshot.ts` | 26 |  |
| `apps/website/src/contracts/core/tool-metadata/web.ts` | `packages/core/src/contracts/site/tool-metadata/web.ts` | 24 |  |
| `apps/website/src/contracts/core/tool-metadata/webhooks.ts` | `packages/core/src/contracts/site/tool-metadata/webhooks.ts` | 81 |  |
| `apps/website/src/contracts/core/tool-metadata/widgets.ts` | `packages/core/src/contracts/site/tool-metadata/widgets.ts` | 164 |  |
| `apps/website/src/contracts/core/tool-metadata/workspace.ts` | `packages/core/src/contracts/site/tool-metadata/workspace.ts` | 53 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/core" exports["./contracts/site/tool-metadata/settings"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/site-evidence"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/site-guide"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/site-inspection"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/sites"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/skills"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/taxonomy"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/trash"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/visitor-tools"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/web"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/web-screenshot"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/webhooks"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/widgets"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/workspace"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 14 sources, rewrite every importer (32 lines)

```
apps/website/src/contracts/core/tool-metadata/index.ts:46  './settings.js' -> '@jini-ai/core/contracts/site/tool-metadata/settings'
apps/website/src/features/settings/tool-registrations.ts:1  '../../contracts/core/tool-metadata/settings.js' -> '@jini-ai/core/contracts/site/tool-metadata/settings'
apps/website/src/features/settings/ui-locales-tool.ts:1  '../../contracts/core/tool-metadata/settings.js' -> '@jini-ai/core/contracts/site/tool-metadata/settings'
apps/website/src/contracts/core/tool-metadata/index.ts:49  './site-evidence.js' -> '@jini-ai/core/contracts/site/tool-metadata/site-evidence'
apps/website/src/features/site-evidence/tool-registrations.ts:1  '../../contracts/core/tool-metadata/site-evidence.js' -> '@jini-ai/core/contracts/site/tool-metadata/site-evidence'
apps/website/src/contracts/core/tool-metadata/index.ts:50  './site-guide.js' -> '@jini-ai/core/contracts/site/tool-metadata/site-guide'
apps/website/src/server/runtime/composition/__tests__/site-guide-tools.test.ts:14  '#src/contracts/core/tool-metadata/site-guide' -> '@jini-ai/core/contracts/site/tool-metadata/site-guide'
apps/website/src/server/runtime/composition/site-guide-tools.ts:2  '#src/contracts/core/tool-metadata/site-guide' -> '@jini-ai/core/contracts/site/tool-metadata/site-guide'
apps/website/src/contracts/core/tool-metadata/index.ts:51  './site-inspection.js' -> '@jini-ai/core/contracts/site/tool-metadata/site-inspection'
apps/website/src/features/site-inspection/tool-registrations.ts:1  '../../contracts/core/tool-metadata/site-inspection.js' -> '@jini-ai/core/contracts/site/tool-metadata/site-inspection'
apps/website/src/contracts/core/tool-metadata/index.ts:52  './sites.js' -> '@jini-ai/core/contracts/site/tool-metadata/sites'
apps/website/src/features/sites/tool-registrations.ts:2  '../../contracts/core/tool-metadata/sites.js' -> '@jini-ai/core/contracts/site/tool-metadata/sites'
apps/website/src/contracts/core/tool-metadata/index.ts:53  './skills.js' -> '@jini-ai/core/contracts/site/tool-metadata/skills'
apps/website/src/features/skills/install-tool.ts:1  '../../contracts/core/tool-metadata/skills.js' -> '@jini-ai/core/contracts/site/tool-metadata/skills'
apps/website/src/features/skills/tool-registrations.ts:1  '../../contracts/core/tool-metadata/skills.js' -> '@jini-ai/core/contracts/site/tool-metadata/skills'
apps/website/src/contracts/core/tool-metadata/index.ts:55  './taxonomy.js' -> '@jini-ai/core/contracts/site/tool-metadata/taxonomy'
apps/website/src/features/taxonomy/tool-registrations.ts:1  '../../contracts/core/tool-metadata/taxonomy.js' -> '@jini-ai/core/contracts/site/tool-metadata/taxonomy'
apps/website/src/contracts/core/tool-metadata/index.ts:57  './trash.js' -> '@jini-ai/core/contracts/site/tool-metadata/trash'
apps/website/src/features/trash/tool-registrations.ts:5  '../../contracts/core/tool-metadata/trash.js' -> '@jini-ai/core/contracts/site/tool-metadata/trash'
apps/website/src/features/trash/trash-item-tool.ts:1  '../../contracts/core/tool-metadata/trash.js' -> '@jini-ai/core/contracts/site/tool-metadata/trash'
apps/website/src/contracts/core/tool-metadata/index.ts:47  './visitor-tools.js' -> '@jini-ai/core/contracts/site/tool-metadata/visitor-tools'
apps/website/src/features/settings/visitor-tools-registrations.ts:6  '../../contracts/core/tool-metadata/visitor-tools.js' -> '@jini-ai/core/contracts/site/tool-metadata/visitor-tools'
apps/website/src/contracts/core/tool-metadata/index.ts:59  './web-screenshot.js' -> '@jini-ai/core/contracts/site/tool-metadata/web-screenshot'
apps/website/src/features/web-screenshot/tool-registrations.ts:1  '../../contracts/core/tool-metadata/web-screenshot.js' -> '@jini-ai/core/contracts/site/tool-metadata/web-screenshot'
apps/website/src/contracts/core/tool-metadata/index.ts:58  './web.js' -> '@jini-ai/core/contracts/site/tool-metadata/web'
apps/website/src/features/web/tool-registrations.ts:1  '../../contracts/core/tool-metadata/web.js' -> '@jini-ai/core/contracts/site/tool-metadata/web'
apps/website/src/contracts/core/tool-metadata/index.ts:60  './webhooks.js' -> '@jini-ai/core/contracts/site/tool-metadata/webhooks'
apps/website/src/features/webhooks/tool-registrations.ts:24  '../../contracts/core/tool-metadata/webhooks.js' -> '@jini-ai/core/contracts/site/tool-metadata/webhooks'
apps/website/src/contracts/core/tool-metadata/index.ts:61  './widgets.js' -> '@jini-ai/core/contracts/site/tool-metadata/widgets'
apps/website/src/features/widgets/tool-registrations.ts:1  '../../contracts/core/tool-metadata/widgets.js' -> '@jini-ai/core/contracts/site/tool-metadata/widgets'
apps/website/src/contracts/core/tool-metadata/index.ts:62  './workspace.js' -> '@jini-ai/core/contracts/site/tool-metadata/workspace'
apps/website/src/features/workspace/tool-registrations.ts:1  '../../contracts/core/tool-metadata/workspace.js' -> '@jini-ai/core/contracts/site/tool-metadata/workspace'
```

## Tovu tests that must stay green (1; import lines are repointed above, assertions untouched)
- `apps/website/src/server/runtime/composition/__tests__/site-guide-tools.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/contracts/core/tool-metadata/site-guide.ts` (2)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/contracts/core/tool-metadata/site-guide.ts:8: keywords: "how tovu works site guide learn building blocks forms widgets markers themes members SEO deploy plugins Jini",
apps/website/src/contracts/core/tool-metadata/site-guide.ts:9: queries: ["How does Tovu work?", "Design a planner directory site."],
```

## Named mutation
in the Jini copy of `widgets.ts`, negate the first `if (` condition of its first exported function; a NEW characterization test (write it first, tests-first rule) must go red, then revert
