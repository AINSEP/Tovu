# K-02 SP-widgets-tools-1 (+ K-02b media-html): widgets agent tools -> `@jini-ai/cms/widgets`
kind: SPLIT (K-TOOLS-PATTERN). est: K-02 210k Sonnet (largest handler table in lane K; plan a handoff at 200k), K-02b 60k. prerequisites: audit2 a04 (widget config editors) is independent.
tovu_files: `K-02.files.tsv` (2 files, 853 lines). decls: `K-02.decls.tsv` (28 declarations, 12 handlers, longest 55 -> split at its branch).
over the limit: `buildWidgetsRegistrations` 268.
ports (Tovu imports found): `withPluginHookRefusals` (`contracts/core/plugin-hook-failed-error.js`) -> `deps.wrapHookRefusals(handler)`; `buildWidgetsDeps`, `buildWidgetsRegionDeps`, `WidgetsRouteDeps` (`./deps.js`, composition over content-types/media/post) -> stay in Tovu: `WidgetsToolDeps` in Jini declares the two BUILT dep objects as fields; Tovu's `contributeWidgetsTools` builds them. `deps.ts` (140 lines, 12 outside importers) is STAY.
surfaces: 1 occurrence (signature only) -> not in the Jini signature.
callers: prod 1, tests 9 files.
characterization (S0): pattern (a)-(e) plus (f) a plugin-hook refusal thrown inside a handler surfaces as the same model-facing refusal (fails if the wrapper is dropped in extraction).
K-02b `widgets/media-html.ts` (179 lines, `K-02b.files.tsv`): parse5 is already a cms dependency; 3 `console.*` calls -> `report` port; target `packages/cms/src/widgets/html/media-html.ts`. FIRST diff against the existing `packages/cms/src/widgets/html/*` (44 files in `cms/src/widgets`): if a function with the same output exists it is a DEDUPE and needs one real caller compared, not a move. Not diffed at planning time.
changeset: cms minor. census: `K-02.census.txt`, `K-02b.census.txt`.
