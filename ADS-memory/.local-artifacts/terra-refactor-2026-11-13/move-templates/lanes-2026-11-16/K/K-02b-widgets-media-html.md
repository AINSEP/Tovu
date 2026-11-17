# K-02b `widgets/media-html.ts` (179 lines) -> `@jini-ai/cms/widgets/html` (one run, est 70k) - T-KT-MOVE
files: `K-02b.files.tsv`. importers: `K-02b.importers.tsv` (10 direct). pkg: cms. THIRD_PARTY_ALLOWED: `parse5` (already a cms dependency).
M0 decision with a command, not a judgment: `rg -n "export (async )?function" packages/cms/src/widgets/html` and compare with the exports in `K-02b.decls.tsv`. A same-named export exists -> SKIPPED "dedupe, needs a diff test design". None -> continue.
seam (M2): the 3 `console.*` calls become `optional.report?: (event: { code: string; detail: string }) => void` (no report = silent, as a missing console line changes no result); Tovu callers pass a binding that logs with the same text.
M1 characterization: golden HTML for each exported function over fixtures with a missing media id, an oversized image and a malformed fragment; assert the `report` fake's call list (codes, order). V3: drop one `report` call -> RED.
target: `packages/cms/src/widgets/html/media-html.ts`, exported from the existing html entry. changeset: cms minor.
