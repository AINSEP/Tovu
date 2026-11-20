Implemented J-1, J-2 and J-3 in order, with moved tests written first.

- Added both status mappers and exported existing `entriesDeps`.
- Added the three media field parsers.
- Preserved 8 entries rows, 14 content-type rows and 4 media tests.
- Updated API docs, added the CMS changeset and recorded one entry per sheet in `COMMIT-PLAN.md`.

Reviewed all six moved files against pinned Tovu source; differences are limited to the permitted imports and comments. No out-of-scope deletions were needed.

No tests, builds, installs, typechecks or linters ran. `package.json` and Tovu remain unchanged. Git stayed read-only; no commits were created.
