# website/contracts/core/entry-refs (W1 #19) — NOT FILLED
Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092`. **NOT FILLED** in this run (context budget: Group B stopped at ~250k tokens after 6 features). Facts below are from `make-sheet.py --kind all` + CLASSIFY-files.tsv + the untangle TSVs; nothing here is executable yet.

untangle_overlap: none

## Files and labels
MOVE extractor.ts (414) -> `@jini-ai/cms/widgets`; DEDUPE ports.ts (40, 8 importers), types.ts (58, 5 importers), repo.memory.ts (50, DEDUPE-UNVERIFIED vs cms test fixture `InMemoryEntryRefsRepo`).

## Judgment notes for the sheet author
Host must supply the `EntryRefRow` shape and ref-key naming (`*TermId`, `*RefId`) to the extractor (value injection; check that the 414-line file splits under 50-line functions). DEDUPE-UNVERIFIED row needs the 11-10 behaviour diff + one real caller check. Tier: Sonnet (dedupes) + Sonnet+review (extractor).

## Owner question
-
