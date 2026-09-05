# Gemini 3.8 Flash Adversarial Audit — apps/admin, apps/site-chat, packages, development, .github, root config

Scope: commits committed 2026-09-03 and 2026-09-04 touching `apps/admin/**`, `apps/site-chat/**`, `packages/**`,
`development/**`, `.github/**`, and root config (`eslint.config.mjs`, `package.json`, `fly.toml`, `tsconfig*`).

Range audited: `ec4fb6e8` (parent of earliest in-scope commit) .. `HEAD` on `restructure/apps-website-phased`,
filtered to the paths above. 65 commits, 162 files, ~10,995 insertions / ~1,698 deletions in this slice.

Method: diffs/full files fed to `agy --model gemini-3.8-flash-high --effort high` in print mode (no tool access
given to Gemini — all context supplied in-prompt). Every finding Gemini raised was then checked against the actual
source at the actual line before being recorded here. No tests, coverage, or typecheck were run for this audit
(machine was in use by five other agents); findings that would require a test run to confirm are marked UNVERIFIED.

STATUS: IN PROGRESS — this skeleton is committed first; sections below are appended as each chunk completes.

## Summary

- Chunks audited: 0 / (planned ~10-14)
- Findings raised by Gemini: TBD
- Confirmed: TBD
- Discarded (disproved on verification): TBD
- Unverified (plausible, needs a test run not permitted in this session): TBD

## Coverage map (chunks planned)

- [ ] Security/gate-integrity: backfill scripts (password reset, AAD family, custom-credential-usernames)
- [ ] CI/gate scripts: check-governance-adr-scope-drift.ts, check-menu-href-allowlist-sync.ts, check-coverage-integrity.ts,
      check-admin-complexity-drift.ts, dead-path-sweep.ts, route-coverage-lib.ts, check-route-coverage-diff.ts
- [ ] .github/workflows/ci.yml, fly-deploy.yml, root config (eslint.config.mjs, package.json, fly.toml)
- [ ] Complexity/architecture baselines (src-complexity-debt.json, admin-complexity-debt.json, check-architecture.baseline.json)
- [ ] apps/admin/src/lib: api.ts, assistant-transport.ts, resolve-active-tab-id.ts
- [ ] apps/admin new Sites feature (Sites.tsx, use-sites.hooks.ts, rules.ts, sites-dependencies/sites-port hooks)
- [ ] apps/admin App.tsx / App.hooks.tsx, AssistantDock, SlowRunNoticeCard
- [ ] apps/admin Media.tsx, Collections.tsx, MenuEditor.tsx
- [ ] apps/admin Settings/ExternalMcpSettingsPanel, Security/AccessTokensTab + hooks
- [ ] apps/admin hooks-extraction refactor commits (no-logic-in-tsx rule compliance) — Pages, Posts, ThemeExplore, AiAssistant, etc.
- [ ] apps/admin vite.config.ts, dev.mjs
- [ ] Test-quality spot checks on the largest new test files
- [ ] packages/sdk/package.json, apps/site-chat changes

## Findings

(none yet — appended per chunk)

## Areas not covered / caveats

TBD at completion.
