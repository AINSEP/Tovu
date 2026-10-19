TDD(Direct): Loaded the TDD persona for behavior-focused coverage design. Added 26 tests across eight existing suites; production code is unchanged.

**CHANGED FILES:**

- [Collections tests](/Users/la/Programming/Tovu/apps/admin/src/features/collections/__tests__/use-collection-entries.unit.test.tsx)
- [Database tests](/Users/la/Programming/Tovu/apps/admin/src/features/database/__tests__/use-schema-state-section.unit.test.tsx)
- [Publish credentials tests](/Users/la/Programming/Tovu/apps/admin/src/features/deployment/hooks/__tests__/use-publish-credentials.unit.test.tsx)
- [Integration rules tests](/Users/la/Programming/Tovu/apps/admin/src/features/integrations/__tests__/rules.unit.test.ts)
- [Integrations hook tests](/Users/la/Programming/Tovu/apps/admin/src/features/integrations/__tests__/use-integrations.unit.test.tsx)
- [Remote image import tests](/Users/la/Programming/Tovu/apps/admin/src/features/media/__tests__/remote-image-import.unit.test.tsx)
- [Page link rules tests](/Users/la/Programming/Tovu/apps/admin/src/features/menus/__tests__/page-target-kind.unit.test.ts)
- [Queries tab tests](/Users/la/Programming/Tovu/apps/admin/src/features/observability/__tests__/use-queries-tab.hooks.unit.test.tsx)

**PER FILE:** Added scenarios target these paths; execution remains pending.

| Source file | Added coverage scenarios |
|---|---|
| `collection-entries-dependencies.hooks.ts` | Empty defaults, unfiltered entries, configured entry-read failure. |
| `schema-state-section-dependencies.hooks.ts` | Live adapter at line 11; default fake schema state. |
| `use-publish-credentials.hooks.ts` | Draft/save before descriptors load; secondary secret validation and ordinary-field error preservation. |
| `integrations/rules.ts` | Toggle/delete error precedence; initial-load error and background-refresh suppression. |
| `use-integrations.hooks.ts` | Resume paused subscription; delete without confirmation; failed-create draft retention. |
| `use-remote-image-import.hooks.ts` | Invalid and duplicate submission guards; empty alt; dialog close at line 57. |
| `page-link-rules.ts` | Explicit content-type hints, nested references, retained URL precedence, missing ID/label/catalogue fallbacks. |
| `use-queries-tab.hooks.ts` | Wired hook at lines 38–39 through TanStack and built-in providers. |

Concurrent additions in the integrations suite were preserved.

**UNREACHABLE:**

- [use-publish-credentials.hooks.ts:338](/Users/la/Programming/Tovu/apps/admin/src/features/deployment/hooks/use-publish-credentials.hooks.ts:338): `prev ?? []` fallback during verification—verification requires existing credentials, and subsequent setters always retain an array.
- [use-publish-credentials.hooks.ts:376](/Users/la/Programming/Tovu/apps/admin/src/features/deployment/hooks/use-publish-credentials.hooks.ts:376): nullish `selection?.` path—every stored selection is a defined record; `Object.values` skips absent keys.

Both remain unchanged for the owner’s decision.

**NOT DONE:** Tests, typecheck, builds, coverage, and package scripts were not run. No git mutations were performed. Measured 100% coverage remains unverified and requires the lock-holding verifier.
