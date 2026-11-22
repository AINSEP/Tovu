# X-forms-1 — forms → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:11 T:12. Depends on: none (only already-Jini code). Est: J 37 min, T 22 min.

## J — move verbatim into Jini (3 files, 155 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/forms/form-destination-manifest.ts` | `packages/cms/src/forms/site/form-destination-manifest.ts` | 101 | W4 |
| `apps/website/src/features/forms/import-remote-submissions.ts` | `packages/cms/src/forms/site/import-remote-submissions.ts` | 51 |  |
| `apps/website/src/features/forms/mail-outbox-readiness.ts` | `packages/cms/src/forms/site/mail-outbox-readiness.ts` | 3 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./forms/site/form-destination-manifest"]
- "@jini-ai/cms" exports["./forms/site/import-remote-submissions"]
- "@jini-ai/cms" exports["./forms/site/mail-outbox-readiness"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 114 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/forms/__tests__/form-destination-manifest.test.ts`


## T — Tovu repoint: delete the 3 sources, rewrite every importer (7 lines)

```
apps/website/src/features/forms/__tests__/form-schema-hash.test.ts:6  '../form-destination-manifest.js' -> '@jini-ai/cms/forms/site/form-destination-manifest'
apps/website/src/features/forms/index.ts:189  './form-destination-manifest.js' -> '@jini-ai/cms/forms/site/form-destination-manifest'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/assistant/__tests__/tool-registrations.forms.test.ts:32  '../../features/forms/import-remote-submissions.js' -> '@jini-ai/cms/forms/site/import-remote-submissions'
apps/website/src/features/forms/index.ts:196  './import-remote-submissions.js' -> '@jini-ai/cms/forms/site/import-remote-submissions'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/forms/tool-registrations.ts:32  './import-remote-submissions.js' -> '@jini-ai/cms/forms/site/import-remote-submissions'
apps/website/src/contracts/core/events/__tests__/forms-notification-retry.test.ts:5  '#src/features/forms/mail-outbox-readiness' -> '@jini-ai/cms/forms/site/mail-outbox-readiness'
apps/website/src/server/runtime/composition/site-deps/mail-http.ts:24  '#src/features/forms/mail-outbox-readiness' -> '@jini-ai/cms/forms/site/mail-outbox-readiness'
```

## Tovu tests that must stay green (3; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.forms.test.ts`
- `apps/website/src/contracts/core/events/__tests__/forms-notification-retry.test.ts`
- `apps/website/src/features/forms/__tests__/form-schema-hash.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/forms/form-destination-manifest.ts` (4)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Named mutation
in the Jini copy of `form-destination-manifest.ts`, negate the first `if (` condition of its first exported function; `form-destination-manifest.test.ts` must go red, then revert
