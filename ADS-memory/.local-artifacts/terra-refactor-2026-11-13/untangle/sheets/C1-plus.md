# C1+: two pure ui helpers into core (no shells) — needed by C9a/R1

Planning only, 2026-11-15. Jini `jini-terra-base` @ `7f28bbcfc`. Executor: Sonnet, Jini only. Precondition: C1 landed (`packages/core/src/text/index.ts` exists).

| Name | From | To | Change |
|---|---|---|---|
| `extensionForMimeType(mimeType)` | `ui/src/utils/file-transfer.ts:66` | NEW `core/src/text/mime.ts`, exported from `core/src/text/index.ts` (`@jini-ai/core/text`) | verbatim; keep the positional `(mimeType: string)` signature (3 users, a one-arg pure lookup) |
| `hasAttributeOnAnyNodeShape(el, attr)` | `ui/src/features/html-editor/dom.ts:14` | NEW `core/src/primitives/node-shape.ts`, exported from `core/src/primitives/index.ts` (`@jini-ai/core/primitives`) | body + the full GrapesJS why-comment verbatim; **parameter type changes** `el: Element` → `el: NodeShape` with `export interface NodeShape { readonly hasAttribute?: (name: string) => boolean; readonly attributes?: unknown }` — core has no DOM lib (`tsconfig` lib ES2023); a DOM `Element` and GrapesJS's parsed node both fit structurally |

**Deletes (no shells):** both declarations in ui; `ui/src/features/asset-tree-browser/rules.ts` and `asset-tree-browser/index.ts` re-exports of `extensionForMimeType`; `ui/src/features/html-editor/index.ts` re-export of `hasAttributeOnAnyNodeShape`. `ui/src/index.ts` `export *` lines stay (the name leaves with its definition). ui's own caller `normalizePastedFile` imports from `@jini-ai/core/text`.

**Repoint:** `C1-plus.repoint.tsv` (built by `scripts/repoint-census.cjs` + `scripts/repoint-post.py`, configs `scripts/census/c1plus*.json`): 13 Jini files + 5 Tovu files (`apps/admin/src/features/pages/lib/embed-placeholder.ts` and 4 tests). MANUAL rows: 4 Tovu `vi.mock('@jini-ai/ui/html-editor')`/dynamic imports and 1 admin mock — check the mock factory does not stub `hasAttributeOnAnyNodeShape`; if it does, mock `@jini-ai/core/primitives` instead.

**Tests:** C lane splits the `extensionForMimeType` cases out of `ui/src/utils/__tests__/file-transfer.test.ts` into `core/src/text/__tests__/mime.test.ts`, and the `hasAttributeOnAnyNodeShape` cases out of `ui/src/features/html-editor/__tests__/dom.test.ts` into `core/src/primitives/__tests__/node-shape.test.ts` (add one plain-object `attributes` case).

**Gate:** `rg -n "document|window|Element\b" packages/core/src/primitives/node-shape.ts packages/core/src/text/mime.ts` → only the doc comment. Files touched (disjoint from C1, C2, C9a): `core/src/text/{mime,index}.ts`, `core/src/primitives/{node-shape,index}.ts`, the two ui source files, the two ui tests. ~15k Sonnet.

## r2-sheets-b revision (2026-11-15; Codex review r2; wins over everything above)
- **Signatures follow the owner rule** (the positional exception above is withdrawn): `extensionForMimeType({ mimeType }, _optional = {})`, `hasAttributeOnAnyNodeShape({ node, attribute }, _optional = {})`; every call rewritten (19 lines at review). `../followups/C2.md` B2.
- **Test split:** core's `node-shape.test.ts` uses plain-object `NodeShape`s only (core vitest is Node, no jsdom); real-DOM and `sourceElementAttributeView` cases stay in ui's `dom.test.ts`, importing the helper from `@jini-ai/core/primitives`. `../followups/C2.md` B3.
