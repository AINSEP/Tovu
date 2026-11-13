### tovu:apps/admin/src/features/dashboard/Dashboard.tsx
- **Over:** `Dashboard` 106 (file 281, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-15
- **Tests:** `apps/admin/src/features/dashboard/__tests__/Dashboard.unit.test.tsx`, smoke `apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `<div className="page-header">` (~L238, 35 lines) | page header + its actions/banners |
| B | `<div className="dash-top">` | stats / appearance / activity (stays) |

- **Splits** (same file, module level, above `Dashboard`):
  1. SUB-COMPONENT `DashboardHeader({ canPublish, t, … }: DashboardHeaderProps): JSX.Element` ← the `<div className="page-header">` element; props = exactly the outer names that element reads (read it; per the outline candidates are `t`, `canPublish`; banners `SiteKeyWarningBanner`/`DefaultPasswordBanner` stay where they are today — move them only if they are inside that element, then add `showSiteKeyBanner`, `siteKeyBannerMessage`, `showDefaultPasswordBanner`, `dismissDefaultPasswordBanner` as props).
- **Importers to update:** none.
- **After:** file ~290; `Dashboard` ~75; `DashboardHeader` ~40.
- **Risks / notes:** `usePublishToLiveAvailable()` stays in `Dashboard` (hook), its result passed as `canPublish`.
