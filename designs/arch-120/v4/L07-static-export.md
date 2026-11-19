# L07 — static export / packager (4 edges; S + H + I) — one repo (Tovu), Codex-ready

Combine-3 line covered: `site-backup/static-site-packager.ts -> source-control/index.ts`.
(`-> site-export/index.ts` and `source-control/static-site-packager-port.ts -> site-export/index.ts`
are part of L03's `ExportReport` move.)

**Behaviour to preserve (judge 3 F7):** the export path **disables** WebMCP. `exportHtml`
(`site-export/export-html-policy.ts:102-103`) calls `injectPublishedWebMcp({ html, enabled: false })`.
That call removes the `data-tovu-webmcp-script` script and the native form-tool attributes
(`toolname`, `tooldescription`, `toolautosubmit`, `toolparamtitle`, `toolparamdescription`;
`webmcp/published-html.ts:5-6,68`). The only caller is `site-exporter.ts:596`
(`security.transformHtml`). v3's characterization expected a WebMCP script in exported pages. That
was wrong, and v4 drops it.

### Changes
1. **S** `site-backup/static-site-packager.ts:1`: the implementer imports the consumer's port types
   (`StaticSitePackagerPort`, `StaticSitePackage`, `StaticSiteIdentity`). Drop the import. The function keeps its parameter
   and return shapes inline. Conformance is checked where composition assigns the packager
   (`deps.ts:2712`, `memory-deps/route-deps/publish-export.ts:239`: `staticSitePackager: createStaticSitePackager()`).
2. **H, the download-only transforms move to their only production user (2 edges; no wiring).**
   `downloadForms` (`export-html-policy.ts:185`) is called in production only by `site-backup/static-copy.ts:93`.
   `downloadDocumentBase` (`:223`) is called only by `site-backup/static-download-layout.ts:76`. Both
   are pure (parse5, no I/O). Move them, with the private helpers that only they reach
   (`serverAction`, `emailAlternative`, `formEdits`, `submitOwner`, `backendFormTarget`,
   `signInReference`, `refreshEdit`, `refreshContent`), to the new file
   `features/site-backup/static-download-html.ts`. Move the parse helpers that both `exportHtml`
   and the moved code use (`elements`, `editedHtml`, `attribute`, and the `Element` and `Edit`
   types) to the new file `platform/html/source-edits.ts`, next to `platform/html/escape.ts`, which
   both files already use. `export-html-policy.ts` imports them from there. Code moves verbatim.
   No helper is duplicated and no forwarder is left.
   Repoint: `static-copy.ts:6`, `static-download-layout.ts:3` → `./static-download-html.js`;
   tests `features/site-export/__tests__/hosted-forms-static.unit.test.ts:12`, `download-forms-privacy.test.ts`,
   `static-copy-policy.unit.test.ts:21` import `downloadForms` from `#src/features/site-backup/static-download-html`
   and `exportHtml` from where it is today (tests are not measured by `check:architecture`).
3. **I** `site-export/export-html-policy.ts:3` (`injectPublishedWebMcp`): `exportHtml` takes
   `removeWebMcp: (input: { html: string }) => string` as a required field of its first argument. Line 103
   becomes `html = removeWebMcp({ html });`, at the same position, before the identity edits.
   `ExportSiteRouteDeps` (`site-exporter.ts:493`) gains the required field
   `removePublishedWebMcp: (input: { html: string }) => string`, and `:596` passes
   `removeWebMcp: routeDeps.removePublishedWebMcp`. `RouteDeps` (`server/routes/types.ts`) gains the
   same field. Both roots set it to `({ html }) => injectPublishedWebMcp({ html, enabled: false })`,
   next to `exportSiteBound`: `deps.ts:2711` and `memory-deps/route-deps/publish-export.ts:238`.
   Composition imports `#src/features/webmcp/published-html`. The tests calling `exportHtml`
   directly (`hosted-forms-static.unit.test.ts:35,79`, `static-copy-policy.unit.test.ts:181`) pass the
   same lambda. `site-exporter.observability.unit.test.ts:34` spreads `createRouteDeps()` and needs no edit.

### Characterization tests (write on the parent first; must pass on parent and candidate)
- `features/site-export/__tests__/static-copy-policy.unit.test.ts`: add a case where exporting a page
  that contains `<script data-tovu-webmcp-script>` and a `<form toolname="x" tooldescription="y">`
  yields HTML with neither the script nor any of the five attributes, while every other byte of the
  form and the `<base>`/canonical handling is unchanged. Use an exact string compare against the
  parent's output, recorded in the test.
- Add a composed case: `exportSite` with deps from `createRouteDeps()` on a page with a native-form-tool form → exported file has no tool attributes.
- Keep: `features/site-backup/__tests__/{static-copy.unit,static-download-collisions.unit,static-site-packager.unit,static-export-themes.integration}.test.ts`,
  `features/source-control/__tests__/commit-site{,.characterization,.preview-parity}.unit.test.ts`,
  `features/site-export/__tests__/{download-forms-privacy,hosted-forms-static.unit,static-copy-policy.unit}.test.ts`.

### STOP
- If a moved helper is also reached by code that stays in `export-html-policy.ts` and is not one of
  `elements`, `editedHtml` or `attribute`, put it in `platform/html/source-edits.ts` as well. If it
  imports anything other than `parse5`, `@jini-ai/*` types or `#src/platform/**`, stop and report it.
- If another production caller of `exportHtml` appears, give it the same required field from its own deps.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `site-backup/static-copy.ts` -> `site-export/export-html-policy.ts` [H] downloadForms -> site-backup/static-download-html.ts
- `site-backup/static-download-layout.ts` -> `site-export/export-html-policy.ts` [H] downloadDocumentBase -> site-backup/static-download-html.ts
- `site-backup/static-site-packager.ts` -> `source-control/index.ts` [S] inline shapes; conformance at composition assignment
- `site-export/export-html-policy.ts` -> `webmcp/published-html.ts` [I] removeWebMcp required arg <- ExportSiteRouteDeps.removePublishedWebMcp (both roots)

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

#### Named test files (verifier runs them; every `*.test.ts` that imports a changed source file or a moved symbol's old home; AST index of the tip): 15 files

```text
  apps/website/src/features/site-backup/__tests__/share-backend-static-limits.unit.test.ts
  apps/website/src/features/site-backup/__tests__/static-copy.unit.test.ts
  apps/website/src/features/site-backup/__tests__/static-download-collisions.unit.test.ts
  apps/website/src/features/site-backup/__tests__/static-export-themes.integration.test.ts
  apps/website/src/features/site-backup/__tests__/static-site-packager.unit.test.ts
  apps/website/src/features/site-export/__tests__/download-forms-privacy.test.ts
  apps/website/src/features/site-export/__tests__/hosted-forms-static.unit.test.ts
  apps/website/src/features/site-export/__tests__/render-origin.integration.test.ts
  apps/website/src/features/site-export/__tests__/static-copy-policy.unit.test.ts
  apps/website/src/features/source-control/__tests__/commit-site.characterization.unit.test.ts
  apps/website/src/features/source-control/__tests__/commit-site.preview-parity.unit.test.ts
  apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts
  apps/website/src/features/source-control/__tests__/gates.characterization.unit.test.ts
  apps/website/src/features/source-control/__tests__/tool-registrations.dry-run.test.ts
  apps/website/src/features/source-control/__tests__/tool-registrations.unit.test.ts
```
The verifier runs every file above plus the new characterization tests this sheet names, on the parent and on the candidate (INDEX-v4 § Gate).
