# website/features/email-templates (W1 #20) — NOT FILLED
Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092`. **NOT FILLED** in this run (context budget: Group B stopped at ~250k tokens after 6 features). Facts below are from `make-sheet.py --kind all` + CLASSIFY-files.tsv + the untangle TSVs; nothing here is executable yet.

untangle_overlap: none

## Files and labels
render.ts (MOVE, 324) = pilot E01 / W0 `move-email-templates.gen.md`: **skipped here as already done in W0** (prompt list). Remaining: operations.ts (MIXED, 325, 2 importers) -> `@jini-ai/platform/mail` next to the moved renderer.

## Judgment notes for the sheet author
Host contract per survey: `EmailTemplateStore { find, create(seed), writeIfVersion(html), rename, listPage }`. MOVE-AFTER E01 landing in Jini (`rg -n "email-template" packages/platform/src/mail` must hit). Tier: Opus (325 lines, new port).

## Owner question
-
