# X-recovery-1 — recovery → @jini-ai/db (Jini step J then Tovu step T)

Lane X. Batch J:22 T:24. Depends on: C-contracts-core-7. Est: J 36 min, T 22 min.

## J — move verbatim into Jini (2 files, 187 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/recovery/agent-tools.ts` | `packages/db/src/recovery/agent-tools.ts` | 175 | W1 |
| `apps/website/src/features/recovery/gated-hooks.ts` | `packages/db/src/recovery/gated-hooks.ts` | 12 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/db" exports["./recovery/agent-tools"]
- "@jini-ai/db" exports["./recovery/gated-hooks"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (2, 157 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/recovery/__tests__/unit/agent-tools.unit.test.ts`
- `apps/website/src/features/recovery/__tests__/unit/gated-hooks.unit.test.ts`


## T — Tovu repoint: delete the 2 sources, rewrite every importer (6 lines)

```
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:77  '../../features/recovery/agent-tools.js' -> '@jini-ai/db/recovery/agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.database-recovery.test.ts:22  '../../features/recovery/agent-tools.js' -> '@jini-ai/db/recovery/agent-tools'
apps/website/src/features/recovery/tool-registrations.ts:46  './agent-tools.js' -> '@jini-ai/db/recovery/agent-tools'
apps/website/src/features/recovery/__tests__/unit/permissions.unit.test.ts:7  '../../gated-hooks.js' -> '@jini-ai/db/recovery/gated-hooks'
apps/website/src/features/recovery/tool-registrations.ts:35  './gated-hooks.js' -> '@jini-ai/db/recovery/gated-hooks'
apps/website/src/server/inbound/admin-http/routes/recovery/restore.ts:8  '#src/features/recovery/gated-hooks' -> '@jini-ai/db/recovery/gated-hooks'
```

## Tovu tests that must stay green (3; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.database-recovery.test.ts`
- `apps/website/src/features/recovery/__tests__/unit/permissions.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/recovery/agent-tools.ts` (1)
- `apps/website/src/features/recovery/gated-hooks.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/recovery/agent-tools.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/recovery/agent-tools.ts:118: description: "Reports this site's restore-point cost class and mechanism kind. For private full-site repository backups, call source_control
```

## Named mutation
in the Jini copy of `agent-tools.ts`, negate the first `if (` condition of its first exported function; `agent-tools.unit.test.ts` must go red, then revert
