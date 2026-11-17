# K-01 SP-redirects-tools-1: redirects agent tools -> `@jini-ai/cms/redirects`
kind: SPLIT (K-TOOLS-PATTERN). est: 150k Sonnet. prerequisites: none in lane K; untangle lanes that touch `redirects/tool-registrations.ts` first.
tovu_files: `K-01.files.tsv` (2 files, 517 lines, blob-guarded). decls: `K-01.decls.tsv` (25 declarations, 8 handlers, longest handler 37 lines).
over the 50-line limit: `buildRedirectsRegistrations` 147 (S1 splits it into 8 handlers), `getRedirectsAgentToolCatalog` 55 (split: schema constants out of the function body).
jini_target: `packages/cms/src/redirects/{agent-tools,tool-registrations}.ts`, exported from the existing `./redirects` entry (guard: neither file exists; `rg -n "buildRedirectsRegistrations|redirectsDerivedRisk" packages/*/src` prints nothing).
ports: none new. Tovu imports are already only `./agent-tools.js`. `surfaces` is unused by the handlers (1 occurrence: the signature) -> Jini signature `buildRedirectsRegistrations({ deps })`; Tovu adapter ignores its second argument.
illegal imports to remove in S2: `@jini-ai/daemon/scheduler`, `@jini-ai/daemon/surface-exchanges`, `@jini-ai/platform/system` (default-surfaces builder only).
callers: prod 1 (`contributeRedirectsTools`), tests 3 files call `buildRedirectsRegistrations(` (in `K-01.repoint.tsv`).
characterization (S0): tool ids from `K-01.decls.tsv` handler rows; add (f): `redirects_list` leaves out a rule whose `isInTrash` is true (the "Bug B" comment at the list handler names this).
tovu wiring after: `features/redirects/tool-registrations.ts` exports only `contributeRedirectsTools`; why-comment block above it (2026-08-17 seam note) stays in Tovu.
changeset: cms minor "redirect agent tools and catalog". census: `K-01.census.txt`.
