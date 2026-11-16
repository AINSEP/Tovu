# r2-sheets-b handoff (2026-11-15)

Done (planning files only, no clone edits):
- TSVs: C8 (117 split into 2 template rows; 118-120, 125, 129, 133 templates; row 12 FieldType template; row 27 MANUAL; row 31 MANUAL; row 143 → `@jini-ai/provider-plugins/observability-opentelemetry/port`; row 158 note), C9a (rows 19/99 deleted, 92/98 renames), C9-ui (row 5 → `./react/kit.js`, rows 6/9 deleted), C10 (row 98 DROP, rows 47/83 deleted). Backups: scratchpad `r2b/`.
- Dry runs (`--phase all`): C8 160 rows, 131 applied / 18 manual / 11 keep / 0 STALE / 0 ERROR; C9a 130 rows, 85 / 45 / 0 / 0; C9-ui 7, 7 / 0 / 0 / 0; C10 152 rows, 124 / 20 / 8 / 0.
- Follow-ups: `followups/{C2,C7,C8,C9a,C9-ui,C11a,C11-ids}.md`. Sheet revision blocks were appended to C1-plus, C2, C2-addendum, C7, C8, C9a (+ the hand edit 3 import fixed), C9-ui, C10 (port shape), C11 and LANES.

Remaining / warnings:
- The C11.md §4 guard sentence is clumsy. Intended meaning: check that `exports['./settings/express']` is present instead of checking the blob.
- C10-shell was not re-dry-run, and its rows were not changed.
- The chat embed-widget UiKitProvider gap is deferred to C9b (followups/C9-ui.md B4).
- The C3/C4/C5 rows of 6-lanes.md were skipped, per the dispatch.
