# features/analytics

The pageview/hits screen behind the sidebar's **Marketing → Analytics** entry.

| file | what it is |
|---|---|
| `Analytics.tsx` | List of recorded page-view hits (`DataTable`, timestamps). |
| `index.ts` | The only surface `panels.tsx` may import. |
| `analytics-i18n.ts` | Translations for this screen — 21 locales, keyed by the English string. |
| `__tests__/` | `Analytics.unit.test.tsx` + `use-analytics.hooks.unit.test.ts`. |

## Notes for anyone editing here

`Analytics.tsx` **is** unit-tested — `__tests__/Analytics.unit.test.tsx` (7 tests) and
`__tests__/use-analytics.hooks.unit.test.ts` (7 tests). Run them:

```
cd apps/admin && npx vitest run src/features/analytics
```

Driving a change in a browser is still worth doing for anything visual, but it is not the only
verification available here, and this file used to say it was.

**Copy changes are 21-file changes.** Every user-facing string is passed as `t("the full English
sentence")`, and that sentence is simultaneously its own lookup key in `analytics-i18n.ts`.
`lib/dictionary-translator.ts` resolves a miss as `?? key` — so editing the string in `Analytics.tsx`
alone silently renders English in all 21 locales, with no error and no failing test. Change the key
in `analytics-i18n.ts`'s every locale block in the same commit.
