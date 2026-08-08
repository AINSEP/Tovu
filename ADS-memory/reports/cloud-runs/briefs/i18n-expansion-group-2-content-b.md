# Brief — i18n language expansion, Group 2 (Content B: collections, menus, widgets, taxonomy, forms)

**Read `ADS-memory/reports/cloud-runs/RUN-PROTOCOL.md` in full first.** It is mandatory and this
brief assumes it. Run log slug: `i18n-expansion-group-2-content-b`.

**A `<<SUBAGENT_DISPATCH>>` marker precedes this brief in your dispatch message — that means you
skip `AI-Dev-Shop/AGENTS.md`'s interactive bootstrap. Do NOT skip this brief or RUN-PROTOCOL.md.**

## What this is

Tovu's admin app (`apps/admin`) already has Spanish i18n shipped across every feature, plus a
shared architecture (just landed on this branch, commit `300406e`) that makes adding a language a
pure data change: no component code, no new tests, no per-language logic branches anywhere.

Your job: extend **17 named languages** into **5 specific files** (your disjoint slice — five other
cloud agents are doing five other disjoint file groups in parallel, each independently committing
to this same branch; do not touch files outside your list).

## Read these files first — they are the whole contract

- `apps/admin/src/lib/i18n-common.ts` — the shared cross-feature dictionary (Save, Cancel, Delete,
  ...), already populated with all 17 languages. Your files do NOT need to repeat these words —
  they fall back automatically. Do not duplicate common words into your files unless a
  feature-specific nuance genuinely requires different wording.
- `apps/admin/src/lib/dictionary-translator.ts` — the shared lookup every file's `t()` routes
  through. You are only adding data, not changing this file or any lookup logic.
- `apps/admin/src/lib/template-i18n.ts` — `interpolate()` and `pickPlural()`. Your file
  `collections-i18n.ts` has THREE functions already built on these (see below) — you're adding
  language data to their existing `Record<locale, ...>` constants, not writing new logic.

## Your five files

- `apps/admin/src/features/collections/collections-i18n.ts` — has `COLLECTIONS_DICT` (flat
  dictionary, add 17 blocks) **plus four more constants that also need all 17 locales added**:
  `LIFECYCLE_VERB` (a `Record<locale, Record<"deprecate"|"reactivate"|"tombstone", string>>` —
  each locale needs all three verb forms), `LIFECYCLE_FAILURE_TEMPLATE` (a
  `Record<locale, string>` template with `{verb}`/`{label}` tokens — see `interpolate()`'s doc),
  `ENTRY_LIFECYCLE_FAILURE` (`Record<locale, Record<"publish"|"unpublish", string>>`), and
  `ASSIGNED_TERMS_TEMPLATE` (`Record<locale, {one: string; other: string}>` — a two-form
  singular/plural pair per locale, `{count}` token; see `pickPlural()`'s doc — English/Spanish/
  most European languages use this two-form pattern; for a language that doesn't distinguish
  singular/plural at all in this context (e.g. Chinese, Japanese, Korean, Thai), use the SAME
  string for both `one` and `other`, matching how the `en:` form in a sibling file already does
  this — don't force a plural distinction a language doesn't have).
- `apps/admin/src/features/menus/menus-i18n.ts` (`MENUS_DICT`) — flat dictionary only.
- `apps/admin/src/features/widgets/widgets-i18n.ts` (`WIDGETS_DICT`) — flat dictionary only.
- `apps/admin/src/features/taxonomy/taxonomy-i18n.ts` (`TAXONOMY_DICT`) — flat dictionary only.
- `apps/admin/src/features/forms/forms-i18n.ts` (`FORMS_DICT`) — flat dictionary only.

(Confirm the "flat dictionary only" files really have no template functions when you open them —
things may have shifted since this brief was written. If one does, treat it like
`collections-i18n.ts`'s pattern above.)

## The 17 locale codes, exact spelling (must match exactly)

`id` (Bahasa Indonesia), `de` (Deutsch), `zh-CN` (Simplified Chinese), `zh-TW` (Traditional Chinese,
Taiwan), `pt-BR` (Portuguese, Brazil), `ru` (Russian), `fa` (Farsi/Persian), `ar` (Arabic), `ja`
(Japanese), `ko` (Korean), `pl` (Polish), `hu` (Hungarian), `fr` (French), `uk` (Ukrainian), `tr`
(Turkish), `th` (Thai), `it` (Italian). The existing `es:` block in each file/constant is done — do
not change it. There is no `en:` block — English is the dictionary key itself.

## Quality bar

- Write natural, professional software-UI language per locale, not a literal gloss. Translate full
  sentences by meaning, following the target language's own grammar and word order.
- Reuse the same target-language term for a recurring English source string within a file.
- Arabic (`ar`) and Farsi (`fa`) are right-to-left — write correct RTL-script text content only, no
  markup/layout changes (separate, already-logged gap, not your concern).
- Only translate human-facing UI copy — not identifiers, URL fragments, or machine-readable codes.

## Testing — do NOT add new tests, do NOT run the full suite

Pure data change. No new tests, ever, per locale — standing repo policy. After finishing each file,
run its existing scoped test(s) only, from `apps/admin/`:

```
npx vitest run src/features/collections/__tests__/CollectionEntries.unit.test.tsx src/features/collections/__tests__/CollectionEntryEditor.unit.test.tsx src/features/collections/__tests__/rules.unit.test.ts src/features/collections/__tests__/use-collection-entry-editor.unit.test.ts src/features/collections/__tests__/use-collections.unit.test.ts src/features/collections/__tests__/use-new-content-type-dialog.unit.test.ts src/features/collections/__tests__/use-term-picker.unit.test.ts
npx vitest run src/features/menus/__tests__/MenuEditor.unit.test.tsx src/features/menus/__tests__/Menus.unit.test.tsx
npx vitest run src/features/widgets/__tests__/WidgetInstanceEditor.unit.test.tsx src/features/widgets/__tests__/WidgetRegionEditor.unit.test.tsx src/features/widgets/__tests__/WidgetRegions.unit.test.tsx src/features/widgets/__tests__/WidgetsLibrary.unit.test.tsx src/features/widgets/__tests__/rules.unit.test.ts src/features/widgets/__tests__/use-widget-instance-editor.hooks.unit.test.ts
npx vitest run src/features/taxonomy/__tests__/Taxonomy.unit.test.tsx src/features/taxonomy/__tests__/use-merge-term-section.unit.test.ts src/features/taxonomy/__tests__/use-new-taxonomy-form.unit.test.ts src/features/taxonomy/__tests__/use-new-term-form.unit.test.ts src/features/taxonomy/__tests__/use-taxonomy.unit.test.ts src/features/taxonomy/__tests__/use-term-detail-panel.unit.test.ts
npx vitest run src/features/forms/__tests__/FormEditor.unit.test.tsx src/features/forms/__tests__/FormsList.unit.test.tsx
```

If one fails, it's a syntax error in your edit — fix it, don't work around it.

## Persisting your work

Follow RUN-PROTOCOL.md exactly: run log first, incremental commits (one per file finished), push to
`refactor/jini-admin-extraction`, fallback branch `i18n-expansion-group-2-overnight` if rejected.
Never gate a commit behind green tests.
