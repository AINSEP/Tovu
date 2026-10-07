# Admin selection colour tests

Opt-in guard for the brand-orange selected/active accents in the admin. It starts its own seeded
site, API and Vite admin through `isolated-journey-site.ts` and the journeys login, and it rejects
external admin URLs, so the owner's dev site is never used. Without opt-in the tests skip and no
site or server is started.

From the repository root:

```sh
env -u TOVU_E2E_ADMIN_BASE_URL TOVU_E2E_SELECTION_COLORS=1 npx playwright test --config=development/playwright.admin-selection-colors.config.ts
```

It reads `getComputedStyle` in the real cascade (admin CSS plus the `@jini-ai/ui` stylesheets the
Settings route injects), at 1440px and 390px, and compares each colour with `--primary` resolved
at runtime:

- Settings active tab text and underline
- selected CLI card border
- active BYOK provider chip fill
- Jini primary button fill and privacy consent primary fill
- admin tab bar (`/admin/plugins`) active underline and text

Why it exists: on 2026-10-03 the Jini extraction moved every `--jini-accent*` token onto
`--jini-primary`, which falls back to near-black #363636 unless the host sets
`--jini-theme-light-primary` / `--jini-theme-dark-primary`. No admin CSS changed, so only a
computed-style check catches that kind of upstream token drift. The stylesheet-text companion is
`apps/admin/src/__tests__/unit/selection-ring-css.unit.test.ts`.

The selected CLI card and the active provider chip depend on the machine's installed CLIs and the
stored execution mode. When either is not rendered, the test measures a same-class probe placed
inside the Settings panel, which goes through the same cascade.

Last run: 2026-10-06, 6 passed (2.7m).
