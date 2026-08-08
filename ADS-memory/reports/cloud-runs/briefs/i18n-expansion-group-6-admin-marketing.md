# Brief — i18n language expansion, Group 6 (Admin/Marketing: settings-raw, seo, redirects, analytics)

**Read `ADS-memory/reports/cloud-runs/RUN-PROTOCOL.md` in full first.** It is mandatory and this
brief assumes it. Run log slug: `i18n-expansion-group-6-admin-marketing`.

**A `<<SUBAGENT_DISPATCH>>` marker precedes this brief in your dispatch message — that means you
skip `AI-Dev-Shop/AGENTS.md`'s interactive bootstrap. Do NOT skip this brief or RUN-PROTOCOL.md.**

## What this is

Tovu's admin app (`apps/admin`) already has Spanish i18n shipped across every feature, plus a
shared architecture (just landed on this branch, commit `300406e`) that makes adding a language a
pure data change: no component code, no new tests, no per-language logic branches anywhere.

Your job: extend **17 named languages** into **4 specific files** (your disjoint slice — five other
cloud agents are doing five other disjoint file groups in parallel, each independently committing
to this same branch; do not touch files outside your list).

## Read these files first — they are the whole contract

- `apps/admin/src/lib/i18n-common.ts` — the shared cross-feature dictionary, already populated with
  all 17 languages. Your files do NOT need to repeat these words — they fall back automatically.
- `apps/admin/src/lib/dictionary-translator.ts` — the shared lookup every file's `t()` routes
  through. You are only adding data.
- `apps/admin/src/lib/template-i18n.ts` — `interpolate()` and `pickPlural()`, used throughout your
  files' template constants below.

## Your four files

- `apps/admin/src/features/settings-raw/settings-raw-i18n.ts` — has `SETTINGS_RAW_DICT` (flat, add
  17 blocks) **plus four more constants**: `PRINCIPAL_NOT_FOUND_TEMPLATE` (`Record<locale,
  string>`, a `{principalIdRaw}`-token template — note it keeps a `PRINCIPAL_NOT_FOUND:` machine
  code prefix untranslated in the `es:` entry; do the same in every language — only translate the
  human-readable remainder after the colon), `SAVED_AT_SCOPE_TEMPLATE` and
  `CLEARED_AT_SCOPE_TEMPLATE` (both `{namespace}`/`{key}`/`{scope}` templates), and
  `RESET_NAMESPACE_TEMPLATE` (`Record<locale, {one, other}>` — a two-form singular/plural pair with
  `{clearedCount}`/`{namespace}`/`{scope}` tokens; for a language without singular/plural
  distinction in this context, use the same string for both `one` and `other`, same as this
  file's own `en:` entry already does).
- `apps/admin/src/features/seo/seo-i18n.ts` (`SEO_DICT`) — flat dictionary only. (Confirm this is
  still true when you open it.)
- `apps/admin/src/features/redirects/redirects-i18n.tsx` — has `REDIRECTS_DICT` (flat, add 17
  blocks) **plus six more constants**: `IMPORT_RULES_LABEL_FRAGMENTS` (`{before, after}` around an
  embedded `<code>` shape block), `IMPORT_RESULT_SUMMARY_TEMPLATE` (`{created}`/`{failed}` tokens),
  `CREATED_LABEL` (`Record<locale, string>`, no tokens — just the single word "Created" as a
  status label, not a full sentence), `FAILED_ITEM_LABEL_TEMPLATE` (`{index}`/`{code}` tokens),
  `DELETE_REDIRECT_BODY_FRAGMENTS` (`{before, after}` around an embedded pattern string), and
  `ACTIONS_FOR_REDIRECT_TEMPLATE` (`{fromPattern}` token) — add all 17 locales to every one of
  these six.
- `apps/admin/src/features/analytics/analytics-i18n.ts` (`ANALYTICS_DICT`) — flat dictionary only.

## The 17 locale codes, exact spelling (must match exactly)

`id` (Bahasa Indonesia), `de` (Deutsch), `zh-CN` (Simplified Chinese), `zh-TW` (Traditional Chinese,
Taiwan), `pt-BR` (Portuguese, Brazil), `ru` (Russian), `fa` (Farsi/Persian), `ar` (Arabic), `ja`
(Japanese), `ko` (Korean), `pl` (Polish), `hu` (Hungarian), `fr` (French), `uk` (Ukrainian), `tr`
(Turkish), `th` (Thai), `it` (Italian). The existing `es:` block in each file/constant is done — do
not change it. There is no `en:` block — English is the dictionary key itself.

## Quality bar

- Write natural, professional software-UI language per locale, not a literal gloss.
- Reuse the same target-language term for a recurring English source string within a file.
- Arabic (`ar`) and Farsi (`fa`) are right-to-left — write correct RTL-script text content only, no
  markup/layout changes (separate, already-logged gap, not your concern).
- Only translate human-facing UI copy — never a machine-readable code, an identifier, or (for
  `settings-raw-i18n.ts`) the `PRINCIPAL_NOT_FOUND:` prefix specifically.

## Testing — do NOT add new tests, do NOT run the full suite

Pure data change. No new tests, ever, per locale — standing repo policy. After finishing each file,
run its existing scoped test(s) only, from `apps/admin/`:

```
npx vitest run src/features/settings-raw/__tests__/Settings.unit.test.tsx src/features/settings-raw/__tests__/rules.unit.test.ts src/features/settings-raw/__tests__/use-settings-container.hooks.unit.test.ts
npx vitest run src/features/seo/__tests__/rules.unit.test.ts src/features/seo/__tests__/Seo.unit.test.tsx
npx vitest run src/features/redirects/__tests__/use-import-redirects-form.hooks.unit.test.tsx src/features/redirects/__tests__/rules.unit.test.ts src/features/redirects/__tests__/use-hit-count-cell.hooks.unit.test.tsx src/features/redirects/__tests__/use-redirects.hooks.unit.test.tsx
npx vitest run src/features/analytics/__tests__/use-analytics.hooks.unit.test.ts src/features/analytics/__tests__/Analytics.unit.test.tsx
```

The `settings-raw` command has ONE pre-existing, unrelated failure
("reloads every already-loaded namespace when the target principal changes", a stale-mock issue in
`use-settings-container.hooks.unit.test.ts` with nothing to do with i18n — already independently
confirmed twice). Expect that one failure and do not try to fix it; only worry about NEW failures
your own edit introduces.

If a different test fails, it's a syntax error in your edit — fix it, don't work around it.

## Persisting your work

Follow RUN-PROTOCOL.md exactly: run log first, incremental commits (one per file finished), push to
`refactor/jini-admin-extraction`, fallback branch `i18n-expansion-group-6-overnight` if rejected.
Never gate a commit behind green tests.
