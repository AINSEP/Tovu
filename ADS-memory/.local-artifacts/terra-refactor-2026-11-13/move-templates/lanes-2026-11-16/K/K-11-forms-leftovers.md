# K-11 forms leftovers + form destinations: DESIGN LEVEL (not executable; needs one Opus pass before sheets)
tovu_files: `K-11.files.tsv` (17 files, 1,414 lines, 89 import sites). decls: `K-11.decls.tsv` (101 declarations, none over 50 lines).
Already decided elsewhere, do not re-plan: audit2 B12 (delivery planner source-gone, sheeted), B22 (`settings/form-delivery.ts`, not sheeted), B08 (`forms/publish-content.ts`, blocked on the publish framework), CLASSIFY-files rows for `form-destinations` (3 MOVE `cms/forms`, 1 MOVE-AFTER, 1 MIXED, 1 DELETE) and `forms` (2 MOVE `cms/forms`, 1 MOVE `cms`, 1 MOVE-AFTER `cms/forms/html`, 2 DELETE, 1 DEDUPE).
Proposed slices (each one Sonnet run once ported):
- K-11a file hygiene SQL: `form-file-maintenance.ts` (145, 34 query sites), `form-file-purge.ts` 93, `protect-existing-files.ts` 59, `submission-ip-expiry-sweep.ts` 54 -> `@jini-ai/cms/forms/sql`. Port: media blob lookup (`f:media`). Retention windows are Tovu values. est 150k.
- K-11b remote import: `import-remote-submissions.ts` 238 + `form-destinations/pull.ts` 126 -> `cms/forms` with an injected fetch/credential port. est 140k.
- K-11c destinations: `form-destinations/{deliver,select,rewrite-actions,types,port,registry,key-store,connection-port}.ts`: `registry.ts` reads `agent-plugins`, `port.ts`/`key-store.ts`/`connection-port.ts` read `custom-credentials`: those three are bindings (STAY); the selection/delivery functions move. est 160k.
- `form-destination-manifest.ts` 100 (4 `tovu` text hits), `field-length-caps.ts` 39: read before labelling.
Open question for the Opus pass: whether destinations belong in `cms/forms` or `integrations` (they call vendor endpoints through credentials).
