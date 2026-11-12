Config: `scripts/a11y.eslint.config.mjs` — `eslint-plugin-jsx-a11y` 6.10.2 `flatConfigs.recommended.rules`,
typescript-eslint parser without type info, `noInlineConfig: true`. Targets: `git ls-files` `*.tsx`/`*.jsx` under
Tovu `apps/admin/src` (229 files), Jini `packages/ui/src` (234) and `packages/chat/src` (33), scope exclusions applied.
No file failed to parse. (eslint also reported 6 "eslint-disable comment has no effect because of noInlineConfig"
notices in Jini; those are not findings and are not in `a11y.tsv`.)

"Menus/popovers missing keyboard handling" is counted, as the brief asks, from the three rules
`interactive-supports-focus`, `click-events-have-key-events`, `no-static-element-interactions`: hits, distinct
elements (file+line, since one element often trips two of them) and files.
