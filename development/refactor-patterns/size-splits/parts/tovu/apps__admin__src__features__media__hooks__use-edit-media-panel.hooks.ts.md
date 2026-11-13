### tovu:apps/admin/src/features/media/hooks/use-edit-media-panel.hooks.ts
- **Over:** `useEditMediaPanel` 130 (file 185, under)
- **Phase:** now (?) · **Batch:** size-02
- **Tests:** `apps/admin/src/features/media/__tests__/use-edit-media-panel.hooks.unit.test.tsx`, smoke `apps/admin/src/features/media/__tests__/Media.unit.test.tsx`, `apps/admin/src/features/media/__tests__/media-html-attributes.unit.test.tsx`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `const [draft, setDraft] = useState<Required<MediaMetadataPatch>>({` + `function setTitle` … `function setHtmlAttributes` | metadata working copy + field setters |
| B | `hashCopied`/`urlCopied`/`embedCopied` states + `copyHash`, `copyUrl`, `copyEmbedCode` | copy-to-clipboard buttons |
| C | `const creators = useFetchQuery({`, `const userNames = useMemo(`, `const createdByLabel = …` | "Created by" label |
| D | `baselineRef`, `saveMutation`, `htmlAttributes*`, `save`, `error`, return | save (stays) |

- **Splits** (same file, module level, above `useEditMediaPanel`, in run order):
  1. SUB-HOOK `useMediaMetadataDraft({ item }: UseMediaMetadataDraftInput): { draft; setTitle; setSlug; setAlt; setCaption; setCredit; setWidth; setHeight; setCssClass; setHtmlAttributes }` ← `const [draft, setDraft] = useState<Required<MediaMetadataPatch>>({` and the nine `function setX(value: string)` setters. Return type = `Pick<EditMediaPanelController, "draft" | "setTitle" | … | "setHtmlAttributes">` if the controller fields match exactly; otherwise spell it out.
  2. SUB-HOOK `useMediaCopyActions({ item, publicUrl, embedSnippet }: UseMediaCopyActionsInput): { hashCopied; urlCopied; embedCopied; copyHash; copyUrl; copyEmbedCode }` ← the three `useState(false)` copied flags and `async function copyHash()`, `copyUrl()`, `copyEmbedCode()`. Call it right after `const embedSnippet = embedMarkerSnippet(…` (the two derived values move above the call; they are plain reads).
  3. SUB-HOOK `useMediaCreatedByLabel({ port, item, locale }: UseMediaCreatedByLabelInput): string` ← `const creators = useFetchQuery({` through `const createdByLabel = mediaCreatedByLabel({`.
  4. `useEditMediaPanel` keeps: props destructure, `useMediaMetadataDraft`, `baselineRef` (+ its "Frozen at mount" comment), `saveMutation`, `publicUrl`/`embedSnippet` (+ header-pointer comment), `useMediaCopyActions`, `htmlAttributesParsed`/`htmlAttributesError`, `save`, `error`, `useMediaCreatedByLabel`, return.
- **Importers to update:** none (no export moves).
- **After:** file ~200; `useEditMediaPanel` ~55; sub-hooks ≤ 40.
- **Risks / notes:** `draft`'s initializer and `baselineRef` both read `item` at mount — keep `useMediaMetadataDraft` called before `useRef(item)` so the "exactly like draft's own useState initializer" comment stays true. Hook call order changes only by grouping (copied-flag states move after `saveMutation`, as today).
