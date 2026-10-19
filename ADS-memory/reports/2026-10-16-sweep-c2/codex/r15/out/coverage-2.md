TDD(Execution): TDD persona selected for behavior-focused coverage-gap tests.

CHANGED FILES:

```text
/Users/la/Programming/Tovu/apps/website/src/features/entries/__tests__/unit/publish-content.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/media-generation/__tests__/tool-registrations.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/newsletter/__tests__/lists.test.ts
/Users/la/Programming/Tovu/apps/website/src/contracts/core/commands/__tests__/repo.memory.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/features/menus/__tests__/use-menus.hooks.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/sites/__tests__/use-local-sites.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/webmcp/__tests__/admin-page-tools.unit.test.ts
```

PER FILE:

| Source | Added test scenarios |
|---|---|
| `entries/publish-content.ts` | Missing owning type during precheck, later owner creation, omitted `publishedAt`, collection and term references. |
| `media-generation/tool-registrations.ts` | Empty sanitized filename, saved credential without base URL, credential-free stub opt-in, default process environment, null public URL. |
| `newsletter/lists.ts` | Missing update target, different-slug comparisons, successful slug change, collision without partial writes. |
| `menus-dependencies.hooks.ts` | Slug lookup, missing read/update/trash targets, omitted items, preserved authoring fields, explicit updates and empty HTML. |
| `use-menus.hooks.ts` | Non-Error load/trash failures, other API errors, confirmation without a target, overlapping operations, cancellation during a write. |
| `use-local-sites.hooks.ts` | Missing snapshot/port, typed and opaque failures with retry, native confirmation, absent restart result, switching without local management. Existing tests already exercise guards at lines 56–57. |
| `admin-page-tools.ts` | Default warning at line 24, document/navigator discovery, absent hosts, registration failures after abort, disabled access after confirmation, malformed approval replies. |
| `commands/repo.memory.ts` | Default empty items, missing ID in a populated workspace, opposite timestamp-sort comparison. |

UNREACHABLE:

In [media-generation/tool-registrations.ts](/Users/la/Programming/Tovu/apps/website/src/features/media-generation/tool-registrations.ts):

- `:282` — missing provider/label fallback: accepted models resolve to registered, labeled providers.
- `:283` — missing environment-map fallback: every currently accepted image provider has a mapping.
- `:284` — empty environment-note branch: those mappings are nonempty.
- `:379` — null creator fallback: `uploadMedia` stamps the required acting principal.

These branches were retained for owner review; no invalid collaborator outputs were fabricated.

NOT DONE:

Tests, typecheck, builds, coverage, and package scripts were not run, as instructed. **100% coverage remains unverified.** Diff whitespace checks pass. No production files or git state were changed.
