### tovu:apps/admin/src/features/providers/Providers.tsx
- **Over:** `Providers` 129 (file 165, under)
- **Phase:** now (STAY-PRODUCT; survey also notes `TabIcon` as a duplicate candidate — not part of this split) · **Batch:** size-05
- **Tests:** `apps/admin/src/features/providers/__tests__/Providers.unit.test.tsx`, `providers-i18n.unit.test.ts`, `apps/admin/src/features/providers/hooks/__tests__/use-providers.unit.test.ts` (smoke)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `const tabs: TabBarTab[] = [` (4 tab descriptors with `TabIcon` glyphs, ~L142-205) | the page's tab strip definition |
| B | rest of `Providers` (theme boundary, locale, hook, `activeTabId`, the `<I18nProvider>` markup and tab bodies) | the page (stays) |

- **Splits:**
  1. HELPER in `Providers.tsx` (module level, between `TabIcon` and `ProvidersProps`/`resolveProvidersHook`, i.e. above `Providers`): `providersTabs({ locale }: ProvidersTabsInput): TabBarTab[]` ← the array literal assigned to `tabs`, returned as is (all "Absorbed from `DeveloperApi.tsx`…" / "Soon" comments move word for word). `Providers` keeps `const tabs = providersTabs({ locale });`. `ProvidersTabsInput = { locale: string }` (match `useAdminLocale()`'s return type).
- **Importers to update:** none.
- **After:** file ~170; `Providers` ~78; `providersTabs` ~55.
- **Risks / notes:** `t` / `tIntegrations` are module imports, so the helper needs only `locale`. Long comments inside the JSX tab bodies stay put.
