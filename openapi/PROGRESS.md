# OpenAPI publication progress

**All 16 fragments complete.** See `README.md` for the full file table and the consolidated
cross-feature drift findings — this file is kept only as a historical record of how the work was
split across dispatches.

Completed in 3 dispatch batches (2026-08-23):

- Batch 0 (canary): `009-redirects`
- Batch 1: `001-admin-command-gateway`, `002-content-entry-authoring`, `003-site-install-dir`,
  `004-declarative-theme-system`
- Batch 2: `005-plugin-system`, `006-identity-and-authorization`, `007-settings-core-ledger`,
  `008-seo`
- Batch 3: `010-forms`, `011-newsletter`, `012-menus`, `013-members`, `014-analytics`,
  `015-integrations`, `021-media-assets`

Each was independently verified against live route/handler code by its own dispatch, per-file, not
in one unsupervised pass. Drift found in every feature — see `README.md` for the consolidated list.
