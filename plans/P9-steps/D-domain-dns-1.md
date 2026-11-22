# D-domain-dns-1 — domain-dns → @jini-ai/devops (Jini step J then Tovu step T)

Lane D. Batch J:7 T:15. Depends on: C-contracts-core-3. Est: J 34 min, T 21 min.

## J — move verbatim into Jini (2 files, 201 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/domain-dns/mail-requirements.ts` | `packages/devops/src/dns/site/mail-requirements.ts` | 99 |  |
| `apps/website/src/contracts/core/tool-metadata/domain-dns.ts` | `packages/devops/src/dns/site/tool-metadata.ts` | 102 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/devops" exports["./dns/site/mail-requirements"]
- "@jini-ai/devops" exports["./dns/site/tool-metadata"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 85 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/domain-dns/__tests__/mail-requirements.test.ts`


## T — Tovu repoint: delete the 2 sources, rewrite every importer (9 lines)

```
apps/website/src/features/domain-dns/__tests__/mail-dns-status.test.ts:10  '../mail-requirements.js' -> '@jini-ai/devops/dns/site/mail-requirements'
apps/website/src/features/domain-dns/dns-changes.ts:36  './mail-requirements.js' -> '@jini-ai/devops/dns/site/mail-requirements'
apps/website/src/features/domain-dns/dns-tools.ts:17  './mail-requirements.js' -> '@jini-ai/devops/dns/site/mail-requirements'
apps/website/src/features/domain-dns/mail-dns-status.ts:23  './mail-requirements.js' -> '@jini-ai/devops/dns/site/mail-requirements'
apps/website/src/features/domain-dns/tool-deps.ts:4  './mail-requirements.js' -> '@jini-ai/devops/dns/site/mail-requirements'
apps/website/src/contracts/core/tool-metadata/index.ts:18  './domain-dns.js' -> '@jini-ai/devops/dns/site/tool-metadata'
apps/website/src/features/domain-dns/dns-tools.ts:15  '../../contracts/core/tool-metadata/domain-dns.js' -> '@jini-ai/devops/dns/site/tool-metadata'
apps/website/src/features/domain-dns/mail-dns-tools.ts:10  '../../contracts/core/tool-metadata/domain-dns.js' -> '@jini-ai/devops/dns/site/tool-metadata'
apps/website/src/features/domain-dns/tools.ts:2  '../../contracts/core/tool-metadata/domain-dns.js' -> '@jini-ai/devops/dns/site/tool-metadata'
```

## Tovu tests that must stay green (1; import lines are repointed above, assertions untouched)
- `apps/website/src/features/domain-dns/__tests__/mail-dns-status.test.ts`

## Named mutation
in the Jini copy of `domain-dns.ts`, negate the first `if (` condition of its first exported function; `mail-requirements.test.ts` must go red, then revert
