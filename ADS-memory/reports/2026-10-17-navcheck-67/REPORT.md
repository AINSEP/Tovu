# navcheck-67 — check of Codex nav Soon fix (navsoon-67 r1)

Commit: aa6ea1b86 (Tovu, restructure/apps-website-phased, not pushed). No Jini commit.

## Review
- nav.ts: getNav() sets `soonPreviewable: item.soon || item.soonPreviewable` — every Soon row becomes Jini's real `<a>` (Sidebar.tsx:481 renders bare soon as inert `<div aria-disabled>`, which the admin's empty-click rail toggle counted as blank space). Every Soon panel in panels.tsx renders a page (Placeholder or real screen), so no dead links. Smallest change, reuses existing Jini mechanism.
- panels.tsx: Admin Themes panel (Studio, soon, distinct icon, Placeholder sectionId/agentHandle "admin-themes"). Renders "Admin Themes is coming soon."
- i18n: 21 locale labels, all plausible ("Temas del administrador", "Admin-Themes", "管理画面のテーマ", …). Parity test green.
- No dead code. Minor, non-blocking: some panels.tsx comments still describe "a bare soon: true renders a disabled div" — true of Jini, but Tovu now overrides it for all rows.
- Possible follow-up (not done): Jini's own empty-click classification still treats inert `is-soon` divs as blank space for other hosts that don't opt in.

## Codex round 2 (navcheck-67/r2, 1 job) — test bugs in Codex's new test
1. Accessible name is "Design SystemSoon" (no space); test queried "Design System Soon". → regex `^label\s*Soon$`.
2. `vi.spyOn(window.matchMedia)` + `mockRestore()` wiped the setup stub's implementation, so cases 2-5 threw "defaultMatchMedia is not a function". → restore with `mockImplementation(defaultMatchMedia)`.
Out: /Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/8655ba7e-6293-4ab0-ac50-c88a2fb27da5/scratchpad/navcheck-67/out-r2/nav-soon-test-fix.md

## Tests (under lock, --maxWorkers=2)
- Round 1: 5 failed / 112 passed (the two test bugs above; production behaviour passed nav/path asserts).
- After r2: app-sidebar-rail-storage-key, nav-wiring, panels-render, lib/admin-nav-i18n, sidebar-labels — 5 files, 117 passed, 2 skipped.
- apps/admin tsc --noEmit: clean.
- RED argued from test+diff (no revert, owner on admin): HEAD inert divs → is-rail after click; Admin Themes missing; nav-wiring previewable assertion; panel count 46 vs 47. Authentication/Comments cases are regression guards.
- Real home unchanged (sites.json md5 02c3cd64…, 860 site-keys, 5 site dirs).

## Chrome look (own tab, closed)
- Desktop 999px: Authentication, Admin Themes, Design System, Appearance, Comments — each opens its page, nav stays expanded, item highlighted (accent bar + pill).
- Phone 390px (resize_window ignored; used a 390px same-origin iframe): drawer closes on navigate (expected), reopening shows group expanded and item highlighted for all five.
