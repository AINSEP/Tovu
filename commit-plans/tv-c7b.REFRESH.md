# tv-c7b refresh notes

Base: `8d1a4c2742`. No additional production importer or test importer needing a repoint was found. No test files changed. The soak script's local `readDesktopMemory` is unrelated to the desktop adapter export.

## C7-WHY source-map mismatches

Fourteen supplied old excerpts do not occur in the mapped `<commit>^:<file>` source object. The specified objects were read; the input excerpts supplied the phrase text in these cases. The ten matched theme-file comments were also read directly in their Jini git objects. No Jini working-tree access was used. The old Tovu commit in each allow reason is the coordinator-supplied mapping, not an independently recovered removal commit.

- `6ec2ad6f6260 apps/website/src/features/theme/theme-files.ts:576-606` — `a72c714e75^` lacks this excerpt; found in `packages/cms/src/themes/files/atomic-write.node.ts`.
- `a8704a24614f apps/website/src/features/theme/theme-files.ts:608-615` — `a72c714e75^` lacks this excerpt; not found in Jini; no allow row.
- `177b981d1af5 apps/website/src/features/theme/theme-files.ts:677-680` — `a72c714e75^` lacks this excerpt; found in `packages/cms/src/themes/files/atomic-write.node.ts`.
- `75583b54283e apps/website/src/features/theme/theme-files.ts:935-943` — `a72c714e75^` lacks this excerpt; found in `packages/cms/src/themes/files/original-source.node.ts`.
- `71e11ad716e2 apps/website/src/features/theme/theme-files.ts:950-984` — `a72c714e75^` lacks this excerpt; found in `packages/cms/src/themes/files/original-source.node.ts`.
- `43d7ee054639 apps/website/src/features/theme/theme-files.ts:1042-1049` — `a72c714e75^` lacks this excerpt; found in `packages/cms/src/themes/files/original-source.node.ts`.
- `a3f2213ef6ef apps/website/src/features/theme/theme-files.ts:1063-1085` — `a72c714e75^` lacks this excerpt; found in `packages/cms/src/themes/files/original-source.node.ts`.
- `4e1fc892e648 apps/website/src/features/theme/theme-files.ts:1098-1110` — `a72c714e75^` lacks this excerpt; found in `packages/cms/src/themes/files/moves.node.ts`.
- `3e4535520cae apps/website/src/features/theme/theme-files.ts:1116-1121` — `a72c714e75^` lacks this excerpt; not found in Jini; no allow row.
- `5080e4f4933a apps/website/src/features/theme/theme-files.ts:1134-1144` — `a72c714e75^` lacks this excerpt; found in `packages/cms/src/themes/files/moves.node.ts`.
- `a35e2b245fe0 apps/website/src/features/theme/theme-files.ts:1171-1187` — `a72c714e75^` lacks this excerpt; found in `packages/cms/src/themes/files/moves.node.ts`.
- `7b8bb3c9d66e apps/website/src/features/theme/theme-files.ts:1211-1219` — `a72c714e75^` lacks this excerpt; found in `packages/cms/src/themes/files/moves.node.ts`.
- `0d79bcdae56a apps/website/src/server/inbound/public-http/http/site/form-render.ts:327-329` — `900ba1e7d4^` lacks this excerpt; not found in Jini; no allow row.
- `389afe32d3ce apps/website/src/server/inbound/public-http/http/site/form-render.ts:653-664` — `900ba1e7d4^` lacks this excerpt; not found in Jini; no allow row.

## Repeated input ID

`50c0dc278cf3` occurs at both `apps/website/src/features/navigation/html-render.ts:1-1` and `apps/website/src/features/taxonomy/html-render.ts:1-1`. Both searches found nothing; both occurrences are listed in COMMIT-PLAN.md. No duplicate allow ID was added.
