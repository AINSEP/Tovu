# Brief — i18n language expansion, Group 1 (Content A: pages, posts, media, dashboard)

**Read `ADS-memory/reports/cloud-runs/RUN-PROTOCOL.md` in full first.** It is mandatory and this
brief assumes it. Run log slug: `i18n-expansion-group-1-content-a`.

**A `<<SUBAGENT_DISPATCH>>` marker precedes this brief in your dispatch message — that means you
skip `AI-Dev-Shop/AGENTS.md`'s interactive bootstrap. Do NOT skip this brief or RUN-PROTOCOL.md.**

## What this is

Tovu's admin app (`apps/admin`) already has Spanish i18n shipped across every feature, plus a
shared architecture (just landed on this branch, commit `300406e`) that makes adding a language a
pure data change: no component code, no new tests, no per-language logic branches anywhere.

Your job: extend **17 named languages** into the flat dictionary of **5 specific files** (your
disjoint slice — five other cloud agents are doing five other disjoint file groups in parallel,
each independently committing to this same branch; do not touch files outside your list).

## Read these three files first — they are the whole contract

- `apps/admin/src/lib/i18n-common.ts` — the shared cross-feature dictionary (Save, Cancel, Delete,
  ...), already populated with all 17 languages. A feature dictionary does NOT need to repeat these
  words — they fall back automatically. Do not duplicate common words into your files unless a
  feature-specific nuance genuinely requires different wording than the shared one (rare — if
  you're tempted, leave it out and let the fallback handle it).
- `apps/admin/src/lib/dictionary-translator.ts` — `createDictionaryTranslator()`, the shared lookup
  every feature file's exported `t()` (or equivalent) routes through. You are not changing this
  file or how any `t()` function works — you are only adding data (new locale blocks) to the
  `Record<locale, Record<key,string>>` dictionaries that already exist in your five files.
- `apps/admin/src/features/dashboard/dashboard-i18n.ts` — read this one as your reference shape: a
  `const XXX_DICT: Record<string, Record<string, string>> = { es: {...} }` object. Your job is to
  add 17 more locale blocks (`id:`, `de:`, `zh-CN:`, `zh-TW:`, `pt-BR:`, `ru:`, `fa:`, `ar:`, `ja:`,
  `ko:`, `pl:`, `hu:`, `fr:`, `uk:`, `tr:`, `th:`, `it:`) as siblings of the existing `es:` block, in
  every one of your five files — same key set as `es`, translated values.

## Your five files

- `apps/admin/src/features/pages/pages-i18n.ts` (`PAGES_DICT`)
- `apps/admin/src/features/pages/page-editor-i18n.ts`
- `apps/admin/src/features/posts/posts-i18n.ts` (`POSTS_DICT`)
- `apps/admin/src/features/media/media-i18n.ts` (`MEDIA_DICT`)
- `apps/admin/src/features/dashboard/dashboard-i18n.ts` (`DASHBOARD_DICT`)

None of these five have parameterized "template" helper functions (the kind that interpolate a
runtime value mid-sentence) — just the flat dictionary. Confirm that's still true when you open
them (things may have shifted since this brief was written); if you find one, use
`apps/admin/src/lib/template-i18n.ts`'s `interpolate`/`pickPlural` the same way
`apps/admin/src/features/recovery/recovery-i18n.tsx` already does, as a working example.

## The 17 locale codes, exact spelling (must match exactly — these are consumed elsewhere by code)

`id` (Bahasa Indonesia), `de` (Deutsch), `zh-CN` (Simplified Chinese), `zh-TW` (Traditional Chinese,
Taiwan), `pt-BR` (Portuguese, Brazil), `ru` (Russian), `fa` (Farsi/Persian), `ar` (Arabic), `ja`
(Japanese), `ko` (Korean), `pl` (Polish), `hu` (Hungarian), `fr` (French), `uk` (Ukrainian), `tr`
(Turkish), `th` (Thai), `it` (Italian). The existing `es:` block in each file is done — do not
change it. There is no `en:` block anywhere in this app's dictionaries — English is the dictionary
key itself, the fallback when a locale/key isn't found; do not add one.

## Quality bar

- Write natural, professional software-UI language for each target locale — the register a real
  shipped product uses, not a literal word-for-word gloss. If you're translating a full sentence
  (an empty-state description, a confirm-dialog body), translate the whole sentence's meaning and
  let word order follow the target language's own grammar — do not preserve English word order.
- Within a single file, reuse the same target-language term for a recurring English source string
  every time it appears (e.g. if "Loading…" appears three times in one file, use the identical
  translation each time in each language) — check for this before finishing each file.
- Arabic (`ar`) and Farsi (`fa`) are right-to-left languages — just write correct RTL-script text
  content. Do not attempt to add any `dir="rtl"` markup or layout changes; that is a known, already
  logged, separate gap outside this task's scope.
- Do not translate anything that is a machine-readable identifier, a URL fragment, a status code
  string like `PRINCIPAL_NOT_FOUND:`, or similar — only human-facing UI copy. If a file has such a
  case, the existing `es:` block already shows you the boundary (compare what it did and didn't
  translate).

## Testing — do NOT add new tests, do NOT run the full suite

This is a pure data change. No new test file, no new test case, per any locale, ever — this repo
has a standing policy against per-locale test duplication; existing tests already prove the
lookup mechanism is locale-aware by asserting on `es`, and that mechanism is untouched by your
work. After finishing each file, run its existing scoped test(s) only, from `apps/admin/`:

```
npx vitest run src/features/pages/__tests__/rules.unit.test.ts src/features/pages/__tests__/Pages.unit.test.tsx src/features/pages/__tests__/use-pages.unit.test.ts
npx vitest run src/features/pages/__tests__/PageEditor.unit.test.tsx
npx vitest run src/features/posts/__tests__/PostEditor.unit.test.tsx src/features/posts/__tests__/Posts.unit.test.tsx src/features/posts/__tests__/rules.unit.test.ts
npx vitest run src/features/media/__tests__/Media.unit.test.tsx src/features/media/__tests__/use-media-lightbox.unit.test.ts
npx vitest run src/features/dashboard/__tests__/Dashboard.unit.test.tsx
```

These should all still pass unchanged (you're adding new keys to a `Record`, not touching existing
`es`/lookup behavior). If one fails, it's a syntax error in your edit (a stray comma, an unescaped
quote) — fix it, don't work around it.

## Persisting your work

Follow RUN-PROTOCOL.md exactly: run log first, incremental commits (one per file you finish, not
one giant commit at the end), push to `refactor/jini-admin-extraction`, fallback branch
`i18n-expansion-group-1-overnight` if that push is rejected. Never gate a commit behind green
tests — commit, then verify, then report honestly.
