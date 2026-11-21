A01–A07 are **done**, with no STOPs, on `codex/tv-z2`, base `776ce6d0f0`.

Paths below are under `apps/admin/src/`. Each file’s ledger key is `(path, catch-reads-error)`; reductions remain pending combine verification.

| Sheet | Files touched; expected reduction |
|---|---|
| A01 | `admin-themes/apply.ts` −1; `components/MailStatusBanner/hooks/use-mail-status-banner.hooks.ts` −2; `features/dashboard/hooks/use-dashboard.hooks.ts` −2 |
| A02 | `components/AssistantDock/hooks/`: `byok-runtime.hooks.ts`, `agents-inventory.hooks.ts`, `chat-package-kind.ts` −1 each |
| A03 | `features/fs-files/hooks/use-folder-drop.hooks.ts` −1; `lib/browser-working-directory-access.ts` −2 |
| A04 | `features/webmcp/browser-agent-settings.hooks.ts` −2; `lib/escape-owned-by-inner-layer.ts` −1 |
| A05 | `lib/browser-stream.ts`, `lib/server-reconnect.ts` −1 each |
| A06 | `lib/execution-settings.ts`, `site-section-availability.hooks.ts` −2 each |
| A07 | `lib/settings-tabs.ts` −2 |

Expected total: **22 findings across 15 source files**. A3, A4, and A90 match the exact CULL text. Both consent events retain their order.

`COMMIT-PLAN.md` records each sheet, ledger keys, expected reductions, and combine mutations. `REFRESH.md` records no importer repoints and the 548-line `execution-settings.ts`.

Zero tests added, changed, or run. No builds, checks, gate runs, ledger updates, commits, or pushes. No Jini or lockfile changes.

Final diff review found no unrelated source edits to delete. Removed seven unnecessary browser-look status fields from the handoff and recorded that deletion.
