# website/features/plugin-runtime (W1 #22) — NOT FILLED
Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092`. **NOT FILLED** in this run (context budget: Group B stopped at ~250k tokens after 6 features). Facts below are from `make-sheet.py --kind all` + CLASSIFY-files.tsv + the untangle TSVs; nothing here is executable yet.

untangle_overlap: none

## Files and labels
10 files / 1,144 lines: MOVE plugin-export.ts (18) + sdk-resolver.ts (124) -> `@jini-ai/plugins/host/node`; MOVE content-analyzer analyze-content.ts (283), summary.ts (66), tiptap-blocks.ts (128) -> `@jini-ai/cms/seo`; MIXED agent-tools.ts (299), install-source.ts (62), install.ts (23); DELETE declarative-content-types.ts (89), invocation-core-deps.ts (52).

## Judgment notes for the sheet author
Both DELETE rows are KIND-SUSPECT (5 and 1 runtime decls): re-check as DEDUPE vs `@jini-ai/plugins` host rules. analyze-content needs `toSlug` passed in (stay_imports 1). `sdk-resolver.ts` carries `@tovu/sdk` specifier -> value injected. `tiptap-blocks.ts` may touch the TipTap decision (owner decision 3). Smallest first slice: plugin-export.ts (18 lines, no host value). Tier: Sonnet for the MOVE rows, Opus for agent-tools.ts.

## Owner question
Owner decision 3 (TipTap / editor surface) may gate tiptap-blocks.ts.
