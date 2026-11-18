# L07 — static export / packager (4 edges, I + S)

Combine-3 lines covered here: `site-backup/static-site-packager.ts -> source-control/index.ts`.
(`-> site-export/index.ts` and `source-control/static-site-packager-port.ts -> site-export/index.ts`
are L03's `ExportReport` move.)

- **S** `site-backup/static-site-packager.ts:1`: the implementer imports the consumer's port types
  (`StaticSitePackagerPort`, `StaticSitePackage`, `StaticSiteIdentity`). Drop the import; the
  function keeps its parameter/return shapes inline (they are the same structure). Conformance is
  checked where composition assigns the packager to source-control's port (`credentials-host-ports.ts`
  / `deps.ts` binding — inventory), so a drift is a compile error at the wiring site. The port stays
  owned by its consumer (source-control).
- **I** `site-backup/static-copy.ts:6` (`downloadForms`), `site-backup/static-download-layout.ts:3`
  (`downloadDocumentBase`): one **required** `exportHtml: { downloadForms, downloadDocumentBase }`
  on the static-copy deps, passed from composition.
- **I** `site-export/export-html-policy.ts:3` (`injectPublishedWebMcp`): the export policy takes it
  through its deps; composition passes webmcp's function. STOP-check: if the policy is called from
  a non-composed path (rg callers), pass it from that path's existing deps instead of adding a default.

**Characterization (named risks):** *static copy no longer rewrites forms/base* and *published HTML
loses the WebMCP block* → `features/site-backup/__tests__/static-copy*.test.ts`,
`static-download-layout*.test.ts`, `static-site-packager.unit.test.ts`,
`features/site-export/__tests__/export-html-policy*.test.ts`; add one composed-deps case asserting a
form in an exported page is rewritten and the WebMCP script is present.

**Gates:** shared gate, `LANE=L07`.

Base: Tovu `2d82735a` (integ/merge-3 tip). Edge list for G2: `designs/arch-120/v3/edges/L07.txt`. Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L07`.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `site-backup/static-copy.ts` -> `site-export/export-html-policy.ts` [I] downloadForms -> StaticCopyDeps.exportHtml port (composition)
- `site-backup/static-download-layout.ts` -> `site-export/export-html-policy.ts` [I] downloadDocumentBase -> same exportHtml port
- `site-backup/static-site-packager.ts` -> `source-control/index.ts` [S] drop the port-type import; conformance checked where composition assigns it
- `site-export/export-html-policy.ts` -> `webmcp/published-html.ts` [I] injectPublishedWebMcp -> export deps port (composition)

#### Exact importers of each changed source file (callers that construct/pass its deps, and tests)
- `features/site-backup/static-copy.ts`
    - prod: features/site-backup/archive-manifest.ts, features/site-backup/import-verifier-inventory.ts, features/site-backup/plan-store.ts, features/site-backup/share-backend.ts, features/site-backup/share-zip.ts, features/site-backup/static-download-layout.ts, features/site-backup/static-site-packager.ts
    - tests: features/site-backup/__tests__/share-backend-static-limits.unit.test.ts, features/site-backup/__tests__/static-copy.unit.test.ts, features/site-backup/__tests__/static-export-themes.integration.test.ts, features/site-export/__tests__/render-origin.integration.test.ts, features/site-export/__tests__/static-copy-policy.unit.test.ts
- `features/site-backup/static-download-layout.ts`
    - prod: features/site-backup/share-zip.ts, features/site-backup/static-site-packager.ts
    - tests: features/site-backup/__tests__/static-copy.unit.test.ts, features/site-backup/__tests__/static-download-collisions.unit.test.ts, features/site-backup/__tests__/static-export-themes.integration.test.ts, features/site-export/__tests__/render-origin.integration.test.ts
- `features/site-backup/static-site-packager.ts`
    - prod: server/runtime/composition/deps.ts, server/runtime/composition/memory-deps/route-deps/publish-export.ts
    - tests: features/site-backup/__tests__/static-site-packager.unit.test.ts, features/source-control/__tests__/commit-site.characterization.unit.test.ts, features/source-control/__tests__/commit-site.preview-parity.unit.test.ts, features/source-control/__tests__/commit-site.unit.test.ts, features/source-control/__tests__/gates.characterization.unit.test.ts, features/source-control/__tests__/tool-registrations.dry-run.test.ts, features/source-control/__tests__/tool-registrations.unit.test.ts
- `features/site-export/export-html-policy.ts`
    - prod: features/site-backup/static-copy.ts, features/site-backup/static-download-layout.ts, features/site-export/site-exporter.ts
    - tests: features/site-export/__tests__/download-forms-privacy.test.ts, features/site-export/__tests__/hosted-forms-static.unit.test.ts, features/site-export/__tests__/static-copy-policy.unit.test.ts
