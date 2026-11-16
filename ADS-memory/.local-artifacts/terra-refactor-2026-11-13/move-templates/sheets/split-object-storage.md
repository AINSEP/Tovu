# website/features/object-storage (W1 #27) — NOT FILLED
Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092`. **NOT FILLED** in this run (context budget: Group B stopped at ~250k tokens after 6 features). Facts below are from `make-sheet.py --kind all` + CLASSIFY-files.tsv + the untangle TSVs; nothing here is executable yet.

untangle_overlap: none

## Files and labels
media-store.ts (MIXED 160) -> `@jini-ai/platform` object-store; registry.ts (MIXED 122, 3 importers).

## Judgment notes for the sheet author
Env name `TOVU_MEDIA_BL…` stays in Tovu (COMMON rule 8): Jini takes the value. `parseObjectStoresFile` wrapper in registry.ts is a DELETE (2 prod callers + 1 barrel); `defineProviderContribution` wiring stays. depends_on agent-plugins. Rule 5: platform object-store may import only platform + core. Tier: Sonnet+review.

## Owner question
-
