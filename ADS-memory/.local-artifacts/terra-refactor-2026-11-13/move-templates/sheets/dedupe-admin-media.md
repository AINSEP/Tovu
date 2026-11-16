id: DD-admin-media-1   (template T-DEDUPE; written 2026-11-16 from Tovu b28d38c6 / Jini b7666092, refactor/terra; skeleton by make-sheet.py)
feature: admin/features/media   (W1 #37, level 3)
status: READY (one slice). Tier: Sonnet executes; the behaviour diff below was done by Opus (this covers the "+ Opus review" of the Sonnet+review tier).
kind: SPLIT (label MIXED, 758 loc). The survey's move for this file is a DEDUPE of the HTML-attribute block onto `@jini-ai/admin/media` (already a Tovu dependency); everything else STAYS this wave. Re-kinded: DEDUPE slice.
tovu_files (blob at b28d38c6; mismatch = SKIP):
  - apps/admin/src/features/media/rules.ts | blob d18490a1ab23b817b6efe340e6986cee66ff3957
  - apps/admin/src/features/media/__tests__/media-html-attributes.unit.test.tsx | blob 4f52b6c1577724e1bb7efd0a644874aa08ecb216
  - apps/admin/src/features/media/__tests__/media-rules.unit.test.ts | blob eef571b5a48c62ae142465934e65e0a880ded2bf
  - apps/admin/src/features/media/hooks/use-edit-media-panel.hooks.ts | blob 161b8fc655fa0e700987cf7c62e95a8367f3d363
  - apps/admin/src/components/MediaEditDialog/MediaEditDialog.hooks.tsx | blob 7f5244272ff2563b92b391777429a715032213bd
  - apps/admin/src/components/WidgetConfigFields/media-content-rules.ts | blob 9155b7140c1c2dc2863f942b6a8df5994ae3ccf8
  - Jini packages/admin/src/media/index.ts | blob f0c2ecad781e4f004a97c0f62cb5234c631a1be5
split of rules.ts (every top-level declaration):
  - MEDIA_HTML_ATTRIBUTE_ALLOWED_NAMES (149), MEDIA_HTML_ATTRIBUTE_NAME_PATTERN (185), isAllowedMediaHtmlAttributeName (196), MediaHtmlAttributeRejectionReason (208), MediaHtmlAttributeError (210), ParsedMediaHtmlAttributes (218), HTML_ATTRIBUTE_TOKEN (237), ASCII_WHITESPACE_OR_CONTROL_MAX_CODE_POINT (243), isUnsafeMediaUrlValue (255), UNSAFE_MEDIA_STYLE_PATTERN (278), isUnsafeMediaStyleValue (279), classifyMediaHtmlAttributeToken (297), parseMediaHtmlAttributes (330), mediaAttributeTokenValue (756) | DELETE (twin in Jini)
  - describeMediaHtmlAttributeError (378) | STAY-PRODUCT (translated through Tovu media-i18n with a locale; Jini's twin returns English only). Its parameter type now comes from Jini.
  - KEYS, MEDIA_RESOURCE, mediaCreatedByLabel, MediaMetadataPatch, MEDIA_METADATA_PATCH_FIELDS, diffMediaMetadata, parseOptionalPixelSize, Base64FileReader, readFileAsBase64, filterMediaByTab, mediaContentTabCounts, MediaOrderBy, MEDIA_ORDER_OPTIONS, sortMediaByOrder, hasUntypedMedia, showsUntypedMediaNote, mediaAltText, MediaShape, LONG_MEDIA_HEIGHT_RATIO, mediaShapeBadges, mediaUploadLabel, mediaUploadAccept, MEDIA_GRID_SIZES, MediaGridSize, MEDIA_GRID_SIZE_STORAGE_KEY, parseMediaGridSize, mediaFillsPreview, findEditingItem, visibleMediaError, MediaRowMenuHandlers, mediaRowMenuItems, resolveLightboxItem | STAY this wave. Follow-up (not W1): Jini admin/media already has same-name `diffMediaMetadata`, `parseOptionalPixelSize`, `filterMediaByTab`, `MediaMetadataPatch`, `MediaOrderBy` (packages/admin/src/media/rules.ts, models.ts) with object-arg signatures; they need their own behaviour diff (Tovu `AdminMedia` vs Jini `MediaAsset`) in a W2 DEDUPE sheet.
behaviour diff (Tovu rules.ts:149-369,756 vs Jini packages/cms/src/widgets/markers/html-attributes.ts, which `@jini-ai/admin/media` html-attributes.ts forwards to):
  - allowed names: identical 18 names, same order; name pattern identical `/^[a-z][a-z0-9-]*$/`; data-/aria- prefix rule identical.
  - tokenizer regex, empty/whitespace input, malformed-skip and malformed-trailing results, classification order (event-handler, unsafe-url, disallowed-name, unsafe-style): identical.
  - unsafe URL strip: Tovu `charCodeAt(0)`, Jini `codePointAt(0)`; both keep every char above 0x20, so the stripped string is the same (pinned by media-rules.unit.test.ts:80-85, which now runs against Jini).
  - unsafe style: same pattern; Jini adds a CSS-escape decode only when `styleContext: "stylesheet"` is passed, which the admin forwarder never passes.
  - signatures: Jini takes objects: `parseMediaHtmlAttributes({ text })`, `isAllowedMediaHtmlAttributeName({ name })`. Callers are converted (COMMON rule 10).
  => no behaviour difference, no RED test.
Jini commit (types are not on the `@jini-ai/admin/media` barrel today):
  - packages/admin/src/media/index.ts: after the line "export { parseMediaHtmlAttributes, describeMediaHtmlAttributeError, isAllowedMediaHtmlAttributeName, MEDIA_HTML_ATTRIBUTE_ALLOWED_NAMES } from './html-attributes.js';" insert "export type { MediaHtmlAttributeError, MediaHtmlAttributeRejectionReason, ParsedMediaHtmlAttributes } from './html-attributes.js';"
  - changeset .changeset/admin-media-html-attribute-types.md: `"@jini-ai/admin": minor` | "`@jini-ai/admin/media` exports the HTML-attribute parse result and error types."
  - jini_msg: "feat(admin): export the media HTML-attribute types"
Tovu edits:
  1. rules.ts: delete lines 114-370 (from the "/**" that opens the MEDIA_HTML_ATTRIBUTE_ALLOWED_NAMES doc through the blank line after parseMediaHtmlAttributes' closing "}"); check first that line 114 is "/**", line 149 starts "export const MEDIA_HTML_ATTRIBUTE_ALLOWED_NAMES", line 369 is "}" and line 371 starts "/** Formats a {@link MediaHtmlAttributeError}". Then delete the last 5 lines of the file (the blank line before, the doc "/** The tokenizer captures double-quoted, single-quoted and unquoted values separately. */" and the 3-line mediaAttributeTokenValue function), so the file ends with resolveLightboxItem's "}\n".
     Then: "import type { RowMenuItem } from \"@jini-ai/admin/react\";" -> "import type { MediaHtmlAttributeError } from \"@jini-ai/admin/media\";\nimport type { RowMenuItem } from \"@jini-ai/admin/react\";"
     And in describeMediaHtmlAttributeError's doc, if it says "{@link MediaHtmlAttributeError}" leave it (the type is imported).
     Add one pointer line directly above "/** Formats a {@link MediaHtmlAttributeError}": "// The HTML-attribute allowlist and parser live in `@jini-ai/admin/media` (`parseMediaHtmlAttributes`); Tovu keeps only the translated message.\n"
  2. Run (from the Tovu clone root, script in move-templates/scripts/):
       python3 <M>/scripts/wrap-call-args.py apps/admin/src/features/media/__tests__/media-html-attributes.unit.test.tsx parseMediaHtmlAttributes text 21
       python3 <M>/scripts/wrap-call-args.py apps/admin/src/features/media/__tests__/media-html-attributes.unit.test.tsx isAllowedMediaHtmlAttributeName name 17
       python3 <M>/scripts/wrap-call-args.py apps/admin/src/features/media/__tests__/media-rules.unit.test.ts parseMediaHtmlAttributes text 3
       python3 <M>/scripts/wrap-call-args.py apps/admin/src/features/media/hooks/use-edit-media-panel.hooks.ts parseMediaHtmlAttributes text 1
       python3 <M>/scripts/wrap-call-args.py apps/admin/src/components/MediaEditDialog/MediaEditDialog.hooks.tsx parseMediaHtmlAttributes text 1
       python3 <M>/scripts/wrap-call-args.py apps/admin/src/components/WidgetConfigFields/media-content-rules.ts parseMediaHtmlAttributes text 1
     Each must print OK; a STOP line = SKIP (restore files). Assertion lines change only by the argument wrap (COMMON rule 20).
  3. Imports (exact old -> new):
     - media-html-attributes.unit.test.tsx: "import {\n  describeMediaHtmlAttributeError,\n  isAllowedMediaHtmlAttributeName,\n  parseMediaHtmlAttributes,\n} from \"../rules\";" -> "import { isAllowedMediaHtmlAttributeName, parseMediaHtmlAttributes } from \"@jini-ai/admin/media\";\nimport { describeMediaHtmlAttributeError } from \"../rules\";"
     - media-rules.unit.test.ts: delete the line "  parseMediaHtmlAttributes," inside the "../rules" import, and add after "import type { AdminMedia } from \"@/lib/api\";" the line "import { parseMediaHtmlAttributes } from \"@jini-ai/admin/media\";"
     - use-edit-media-panel.hooks.ts: delete the line "  parseMediaHtmlAttributes," inside the "../rules" import; add after "import { useFetchMutation, useFetchQuery } from \"@jini-ai/ui/fetch-query\";" the line "import { parseMediaHtmlAttributes } from \"@jini-ai/admin/media\";"
     - MediaEditDialog.hooks.tsx: "import { describeMediaHtmlAttributeError, parseMediaHtmlAttributes } from \"../../features/media/rules\";" -> "import { parseMediaHtmlAttributes } from \"@jini-ai/admin/media\";\nimport { describeMediaHtmlAttributeError } from \"../../features/media/rules\";"
     - media-content-rules.ts: "import { parseMediaHtmlAttributes } from \"../../features/media/rules\";" -> "import { parseMediaHtmlAttributes } from \"@jini-ai/admin/media\";"
     If any of these files already has an `import … from "@jini-ai/admin/media"` line, merge the name into it instead of adding a second import (check with rg first).
  4. comment_refs: media-content-rules.ts:305 "/** Same loose token shape as `features/media/rules.ts`'s `HTML_ATTRIBUTE_TOKEN` (not exported" -> "/** Same loose token shape as the media HTML-attribute tokenizer in `@jini-ai/cms/widgets/markers` (not exported"; the other path_literal hits (lib/api.ts:1666, lib/media-embed-extension.tsx:133, MediaEditDialog.hooks.tsx:21, media-html-attributes test header) name `rules.ts` conceptually or for describeMediaHtmlAttributeError, which stays: leave them.
census: python3 scripts/census.py <TOVU> apps/admin/src/features/media/rules.ts -> the 18 importers listed by make-sheet (9 prod, 9 test) stay; after the edit `rg -n "isAllowedMediaHtmlAttributeName|parseMediaHtmlAttributes|MEDIA_HTML_ATTRIBUTE_ALLOWED_NAMES|ParsedMediaHtmlAttributes" apps/admin/src --glob '!**/__tests__/**'` must show only `@jini-ai/admin/media` imports and the wrapped calls; `rg -n "MEDIA_HTML_ATTRIBUTE_ALLOWED_NAMES|ParsedMediaHtmlAttributes|MediaHtmlAttributeRejectionReason" apps/admin/src` must print no import from a "rules" path (if any other file imports these from rules today, SKIP: unlisted census hit).
why_moves: the 35-line doc above MEDIA_HTML_ATTRIBUTE_ALLOWED_NAMES (rules.ts:114-148, widget-attrs plan, owner rejected per-element filtering) has its twin rationale on the Jini declaration (packages/cms/src/widgets/markers/html-attributes.ts header); pointer only.
baselines: -; jini guards: Jini html-attributes.ts exports `parseMediaHtmlAttributes({ text }` and `isAllowedMediaHtmlAttributeName({ name }` (rg each: 1 hit) else SKIP.
untangle_overlap: rules.ts and the 5 edited files have no *.repoint.tsv row. (C2.repoint.tsv:182-184 name Media.tsx and RemoteImageImport.tsx, which this slice does not edit.) No wait for wave B.
tovu_msg: "refactor(admin-media): use the shared media HTML-attribute parser from @jini-ai/admin/media" | body "Tovu keeps describeMediaHtmlAttributeError (translated)."
Cloud run owes: the 3 media test files above + MediaEditDialog and WidgetConfigFields tests, Tovu typecheck.
est. executor tokens: ~50k Sonnet.
