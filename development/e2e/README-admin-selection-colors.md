# Admin selection colour tests

Journey guard for the brand-orange selected/active accents in the admin. Each test starts its own seeded
site, API and Vite admin through `isolated-journey-site.ts` and the journeys login, and it rejects
external admin URLs, so the owner's dev site is never used. The offline pins now run by default under the consolidated journeys config; the selection-specific
config is retired.

From the repository root:

```sh
npm run e2e:journeys -- admin-layout.pins.journey.ts --grep "Bug pin: admin-selection-colors"
```

It reads `getComputedStyle` in the real cascade (admin CSS plus the `@jini-ai/ui` stylesheets the
Settings route injects), at 1440px and 390px, and compares each colour with `--primary` resolved
at runtime:

- Settings active tab text and underline
- selected CLI card border
- active BYOK provider chip fill
- Jini primary button fill and privacy consent primary fill
- admin tab bar (`/admin/plugins`) active underline and text
- AI Assistant page (`/admin/ai-assistant?tab=admin`) active tab, provider chip fill, and the
  sidebar's active rail and icon (desktop width)

Fills are compared with `--primary` too: the fresh site has no chosen Dialog appearance accent, and
the ledger's unchosen default must not repaint the brand (`use-admin-appearance.hooks.ts`).

Why it exists: on 2026-10-03 the Jini extraction moved every `--jini-accent*` token onto
`--jini-primary`, which falls back to near-black #363636 unless the host sets
`--jini-theme-light-primary` / `--jini-theme-dark-primary`. No admin CSS changed, so only a
computed-style check catches that kind of upstream token drift. The stylesheet-text companion is
`apps/admin/src/__tests__/unit/selection-ring-css.unit.test.ts`.

The selected CLI card and the active provider chip depend on the machine's installed CLIs and the
stored execution mode. When either is not rendered, the test measures a same-class probe placed
inside the Settings panel, which goes through the same cascade.

Legacy run: 2026-10-06, 6 passed (2.7m). Migration typechecked; browser execution pending.
