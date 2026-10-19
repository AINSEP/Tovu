# Tovu: cross-site reads fail on HEAD (pages_read_html needs resolveActiveThemeId; schema-refusal message changed)

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is writable only if the fix is generic.
Persona: load /Users/la/Programming/Tovu/AI-Dev-Shop/agents/tdd/skills.md.

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state.
Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:` + per failure `VERDICT:` (test bug | real product bug, file:line)
and `RED->GREEN:` (which existing assertion is RED on HEAD and turns GREEN with your change).
REUSE before you write (search for an existing mechanism first). Smallest change. Move "why" comments with code, never delete them.
Never weaken an assertion to make it pass. Other agents have uncommitted edits in server/runtime/composition/{app,deps,serving-app,
permanent-delete-deps}.ts: do not edit those files. If the fix must go there, describe it under NOT DONE.

## Failures (node --test, 12:48 today, under the machine lock)
```
test at apps/website/src/assistant/__tests__/cross-site-read-catalog.test.ts:1:2093
✖ complete production catalog classifies every reader and exercises every scoped read on B
  AssertionError: 61 cross-site tools, 63 EXCLUDED tools; unavailable peer dependencies: pages / pages_read_html: This read needs resolveActiveThemeId, which isn't available for another site.
  + ["pages / pages_read_html: This read needs resolveActiveThemeId, which isn't available for another site."]
  - []

test at apps/website/src/server/runtime/composition/__tests__/peer-site-reads.test.ts:1:1082
✖ inSite: reads B's posts/media/forms and owner chats through the real catalog; audits only A
  CrossSiteUnavailable: This read needs resolveActiveThemeId, which isn't available for another site.  field: 'resolveActiveThemeId'
✖ appData: (same)

test at apps/website/src/server/runtime/composition/__tests__/peer-site-reads.test.ts:1:4784
✖ local-host/name/trash/live-db-alias/storage/schema refusals are fixed and path-free
  + 'This site has an unsupported database schema. Open it in Tovu first.'
  - 'Open B in Tovu once to upgrade it.'
  (test line ~121 deletes the newest __drizzle_migrations row and expects the "behind" message;
   peer-site-reads.ts:346-347 decides between the two messages from SqliteDatabaseIntrospectionAdapter.getSchemaState()/listPendingMigrations())
```
## Leads
1. Commit 9e220fe7f (2026-10-17 11:28, "page tools read the active theme's real tokens") made the pages tools depend on
   `resolveActiveThemeId`. The peer (other-site) dependency bag in server/runtime/composition/peer-site-reads.ts does not supply it, so
   pages_read_html is now unavailable cross-site. That is a real regression of the owner's cross-site page read. Decide the right fix:
   the peer bag supplies a read-only resolveActiveThemeId for site B (reuse how the local composition resolves it, scoped to B's
   content DB and settings, never A's), OR pages_read_html makes theme tokens optional when the dependency is absent. Choose whichever
   keeps "B's page is read with B's theme, never A's". Read `git show 9e220fe7f` first.
2. Schema message: find out why deleting the newest drizzle row no longer yields status 'behind' / pending migrations. Under ADR-066 the
   Drizzle chain is frozen at 78 and newer schema changes are TS migrations. Introspection may now report 'drift'/'unknown'. If the
   product still correctly says "Open B in Tovu once to upgrade it" for a genuinely older site, fix the TEST so it makes B genuinely
   behind the way the current migration system does (e.g. remove the newest TS-migration ledger row, whichever ledger introspection
   reads). If the product now misclassifies a genuinely old site as unsupported, that is a product bug: fix peer-site-reads.ts or the
   adapter, and keep the test.
