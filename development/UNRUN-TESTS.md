# Unrun tests registry

Tests authored but NEVER EXECUTED. One line per file: path | covers | why unrun | date. Append only.

- apps/website/src/server/__tests__/integration/trash-purge-real-composition.unrun.integration.test.ts | Trash purge/restore through the real `tovu serve` composition, SQLite + PGlite (6 tests) | owner directive 2026-10-04: author only, no runs | 2026-10-04
- apps/website/src/server/__tests__/integration/change-set-revert-real-composition.unrun.integration.test.ts | post edit -> persisted change-set -> revert, Idempotency-Key replay, SQLite + PGlite (6 tests) | owner directive 2026-10-04: author only, no runs | 2026-10-04
- apps/website/src/server/__tests__/integration/admin-logout-session.unrun.integration.test.ts | POST /auth/logout revokes the persisted session (route had zero tests), SQLite + PGlite (8 tests) | owner directive 2026-10-04: author only, no runs | 2026-10-04
- apps/website/src/server/__tests__/helpers/unrun-site-boot.ts | shared helper (not a test): initSite -> bootSiteDir -> createSiteRouteDeps -> createApp boot for both dialects | used only by the unrun files above | 2026-10-04
