# website/platform/db/migration (W1 #21) — NOT FILLED
Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092`. **NOT FILLED** in this run (context budget: Group B stopped at ~250k tokens after 6 features). Facts below are from `make-sheet.py --kind all` + CLASSIFY-files.tsv + the untangle TSVs; nothing here is executable yet.

untangle_overlap: none

## Files and labels
manifest.ts (MIXED, 950 lines, 1 importer).

## Judgment notes for the sheet author
Survey: production needs only `computeCoreTableCopyOrder` + `DERIVED_OBJECTS`, and both depend on Tovu's drizzle `schema.sqlite.ts` -> STAY-PRODUCT. `new_deps: drizzle-orm` would be a new Jini dependency (COMMON rule 9). Likely re-kind: STAY (or a DELETE of the unused remainder after a reach check). Tier: Opus.

## Owner question
Q-migration: confirm manifest.ts stays in Tovu (drizzle schema is product) and only dead exports are removed? Recommended YES.
