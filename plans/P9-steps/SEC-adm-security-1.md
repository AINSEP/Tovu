# SEC-adm-security-1 — adm-security → @jini-ai/admin (Jini step J then Tovu step T)

Lane SEC. Batch J:29 T:30. Depends on: A-adm-shell-lib-3. Est: J 37 min, T 20 min.

## J — move verbatim into Jini (4 files, 57 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/security/copy-keys-dialog.css` | `packages/admin/src/security/host/copy-keys-dialog.css` | 6 |  |
| `apps/admin/src/features/security/hooks/security-permissions-port.hooks.ts` | `packages/admin/src/security/host/hooks/security-permissions-port.hooks.ts` | 11 |  |
| `apps/admin/src/features/security/SiteKeyTab.hooks.tsx` | `packages/admin/src/security/host/SiteKeyTab.hooks.tsx` | 33 |  |
| `apps/admin/src/features/security/Security.hooks.ts` | `packages/admin/src/security/host/Security.hooks.ts` | 7 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./security/host/Security.hooks"]
- "@jini-ai/admin" exports["./security/host/SiteKeyTab.hooks"]
- "@jini-ai/admin" exports["./security/host/copy-keys-dialog"]
- "@jini-ai/admin" exports["./security/host/hooks/security-permissions-port.hooks"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 4 sources, rewrite every importer (6 lines)

```
apps/admin/src/features/security/CopyKeysDialog.tsx:6  './copy-keys-dialog.css' -> '@jini-ai/admin/security/host/copy-keys-dialog'
apps/admin/src/features/security/hooks/security-permissions-dependencies.hooks.ts:2  './security-permissions-port.hooks' -> '@jini-ai/admin/security/host/hooks/security-permissions-port.hooks'
apps/admin/src/features/security/hooks/use-security-permissions.hooks.ts:5  './security-permissions-port.hooks' -> '@jini-ai/admin/security/host/hooks/security-permissions-port.hooks'
apps/admin/src/features/security/SiteKeyTab.tsx:8  './SiteKeyTab.hooks' -> '@jini-ai/admin/security/host/SiteKeyTab.hooks'
apps/admin/src/features/security/__tests__/use-site-key.unit.test.tsx:8  '../SiteKeyTab.hooks' -> '@jini-ai/admin/security/host/SiteKeyTab.hooks'
apps/admin/src/features/security/Security.tsx:1  './Security.hooks' -> '@jini-ai/admin/security/host/Security.hooks'
```

## Tovu tests that must stay green (1; import lines are repointed above, assertions untouched)
- `apps/admin/src/features/security/__tests__/use-site-key.unit.test.tsx`

## Named mutation
in the Jini copy of `SiteKeyTab.hooks.tsx`, negate the first `if (` condition of its first exported function; `use-site-key.unit.test.tsx` must go red, then revert
