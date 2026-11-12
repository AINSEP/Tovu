# Quality audit 2026-11-11 — SEC: floating promises, security scans, accessibility

Report only: nothing in either repo was changed outside `development/cloud/quality-1111/sec/`.
Brief: `development/cloud/quality-1111/BRIEF-SEC.md` + `COMMON.md`. No subagents were used.

- Tovu `a9c1184` (branch content of `cloud/quality-1111`), Jini `f6fa96a`. Container: 4 cores, 16 GB.
- Scope: Tovu `apps/`, `packages/`, `content/`; Jini `packages/*/src`. Skipped: tests, `__tests__`, `__mocks__`,
  fixtures, mocks, `test(s)/`, `e2e/`, dist, build, node_modules, vendor, `.d.ts`, stories, built plugin bundles.
- Every list is complete in its `.tsv` next to this file; this page gives totals and the top 50 of each.
- Raw tool output is in `raw/` (eslint JSON per unit, osv JSON, audit JSON, semgrep JSON).
- Scripts/configs used: `scripts/` (`promises.eslint.config.mjs`, `a11y.eslint.config.mjs`, `run-promises.sh`,
  `run-all-promises.sh`, `run-semgrep.sh`, `build_tsv.py`, `build_results.py`).

## Tool versions

| tool | version | how installed |
|---|---|---|
| Node | v24.22.3 (npm 11.19.1, pnpm 10.33.2 via corepack) | nodejs.org tarball, sha256 checked, `~/.local/node24` |
| eslint | 9.39.1 | pinned, container-only tool dir (scratchpad, `npm install --ignore-scripts`) |
| typescript-eslint / @typescript-eslint/parser | 8.46.4 | same tool dir |
| typescript (driving typed lint, both repos) | 5.9.3 | same tool dir (Jini's own root `tsc` is also 5.9.3) |
| eslint-plugin-jsx-a11y | 6.10.2 | same tool dir |
| osv-scanner | 2.2.2 (osv-scalibr 0.3.1), linux-amd64 release binary, sha256 checked against the release's `SHA256SUMS` | GitHub release |
| OSV database | offline npm `all.zip` downloaded 2026-11-12 ~01:43 UTC | `--offline-vulnerabilities --download-offline-databases` |
| semgrep | 1.95.0 | `pip install --user semgrep==1.95.0` |
| semgrep-rules | `semgrep/semgrep-rules` @ `a5ad1714` (2026-11-10) | git clone (registry blocked, see ENV) |
| njsscan rules (for p/nodejsscan) | njsscan 0.4.3 wheel, `rules/semantic_grep/**` YAML only (64 files, `good/` excluded) | `pip download --no-deps`, unzipped, never installed/executed |
| npm audit / pnpm audit | npm 11.19.1 / pnpm 10.33.2 | read-only, never `audit fix` |
## Totals (check × repo)
| check | Tovu | Jini |
|---|---|---|
| Floating promises: `no-floating-promises` (Tovu excludes SKIPPED apps/website) | 17 | 8 |
| Floating promises: `no-misused-promises` (Tovu excludes SKIPPED apps/website) | 90 | 59 |
| Floating promises: units SKIPPED / partial | 1 / 2 of 6 | 0 / 3 of 38 |
| osv-scanner rows (package@version × advisory × lockfile) | 248 (MODERATE 131 / HIGH 89 / LOW 22 / CRITICAL 6) | 184 (MODERATE 92 / HIGH 66 / LOW 21 / CRITICAL 5) |
| osv-scanner unique package@version × advisory | 201 | 184 |
| npm audit (Tovu root) / pnpm audit (Jini), by severity | 53 (C 3 / H 32 / M 18 / L 0) | 174 (C 6 / H 64 / M 86 / L 18) |
| Semgrep findings, security rules | 475 (WARNING 414 / ERROR 40 / INFO 21) | 480 (WARNING 411 / INFO 38 / ERROR 31) |
| Semgrep findings, other (non-security) rules from the JS/TS rule dirs | 3514 | 2994 |
| Semgrep files only partially analysed / timeouts / fatal / syntax error | 192 / 6 / 3 / 0 (of 4013 scanned) | 169 / 0 / 7 / 2 (of 3709 scanned) |
| jsx-a11y findings | 74 | 65 |
| a11y keyboard-handling hits (3 rules) / distinct elements / files | 46 / 35 / 26 | 32 / 26 / 22 |

## 1. Floating / misused promises (typed lint)
Config: `scripts/promises.eslint.config.mjs` — typescript-eslint parser, `projectService: true`, only
`@typescript-eslint/no-floating-promises` + `@typescript-eslint/no-misused-promises` (both default options),
`noInlineConfig: true` so existing `eslint-disable` comments do not hide hits. Each unit is linted from its own
directory with `tsconfigRootDir` = that directory, so the project service picks the nearest `tsconfig.json`.
Files: `git ls-files` `*.ts/*.tsx/*.mts/*.cts` with the scope exclusions (Jini: `src/` only).

- Tovu `apps/website` has no `tsconfig.json` of its own; the project service resolves its files through the
  Tovu root `tsconfig.json` (nearest one up the tree).
- Tovu `apps/desktop` has no `tsconfig.json` (only `tsconfig.{main,preload,renderer,live-verify}.json`), which the
  project service never discovers, so desktop runs with `parserOptions.project` = its
  `tsconfig.main.json`, `tsconfig.preload.json`, `tsconfig.renderer.json` instead (documented deviation).
- Tovu apps resolve `@jini-ai/*` from the published npm copies in their own `node_modules` (with `.d.ts`), so
  `npm run link:jini` was not needed; Jini packages resolve siblings through the workspace build (`pnpm -r build`
  EXIT 0, `raw/jini-build.txt`).
- Tovu `packages/sdk`, `packages/contracts` and `apps/site-chat` were also run (they are in the `apps/`/`packages/`
  scope); `content/` has no in-scope TypeScript (only tests and theme `.js` scripts), so it has no typed-lint unit.
- **Tovu `apps/website` (2165 files) is SKIPPED (time-box)** — run last as the largest unit, as the brief orders;
  it did not finish within step 1's 60 minutes (single eslint process, ~4.1 GB RSS, no output before stop). So the
  Tovu promise totals cover sdk, contracts, site-chat, desktop and admin only. Exact entry in the SKIPPED section.

Per unit (every unit run; `files_not_type_loaded` = files the project service could not place in a tsconfig):

| repo | unit | files | status | hits | files_not_type_loaded |
|---|---|---|---|---|---|
| jini | packages/admin | 378 | OK | 18 | 0 |
| jini | packages/agent-plugins | 119 | OK | 0 | 0 |
| jini | packages/agent-runtime | 151 | PARTIAL | 0 | 1 |
| jini | packages/agentic | 53 | PARTIAL | 0 | 5 |
| jini | packages/analytics | 12 | OK | 5 | 0 |
| jini | packages/artifacts | 10 | OK | 0 | 0 |
| jini | packages/capability-providers | 28 | OK | 0 | 0 |
| jini | packages/chat | 219 | OK | 0 | 0 |
| jini | packages/cli | 16 | OK | 0 | 0 |
| jini | packages/cms | 286 | OK | 1 | 0 |
| jini | packages/commerce | 88 | OK | 2 | 0 |
| jini | packages/cookie-consent | 26 | OK | 0 | 0 |
| jini | packages/core | 132 | OK | 8 | 0 |
| jini | packages/daemon | 140 | OK | 12 | 0 |
| jini | packages/db | 112 | OK | 0 | 0 |
| jini | packages/desktop-host | 67 | OK | 0 | 0 |
| jini | packages/devops | 90 | OK | 0 | 0 |
| jini | packages/diagnostics | 45 | OK | 1 | 0 |
| jini | packages/http-kit | 26 | OK | 1 | 0 |
| jini | packages/infra | 13 | OK | 0 | 0 |
| jini | packages/integrations | 116 | OK | 0 | 0 |
| jini | packages/mcp | 83 | OK | 0 | 0 |
| jini | packages/memory | 9 | OK | 0 | 0 |
| jini | packages/oauth | 35 | OK | 0 | 0 |
| jini | packages/platform | 114 | OK | 0 | 0 |
| jini | packages/plugins | 65 | OK | 0 | 0 |
| jini | packages/protocol | 12 | OK | 0 | 0 |
| jini | packages/provider-plugins | 42 | PARTIAL | 0 | 5 |
| jini | packages/registry | 17 | OK | 0 | 0 |
| jini | packages/sandbox | 12 | OK | 0 | 0 |
| jini | packages/search | 16 | OK | 0 | 0 |
| jini | packages/server | 15 | OK | 0 | 0 |
| jini | packages/sidecar | 13 | OK | 1 | 0 |
| jini | packages/sqlite | 1 | OK | 0 | 0 |
| jini | packages/ui-kit | 29 | OK | 0 | 0 |
| jini | packages/ui | 737 | OK | 5 | 0 |
| jini | packages/user-management | 112 | OK | 13 | 0 |
| jini | packages/vibecoding | 27 | OK | 0 | 0 |
| tovu | apps/admin | 895 | PARTIAL | 94 | 1 |
| tovu | apps/desktop | 262 | PARTIAL | 12 | 2 |
| tovu | apps/site-chat | 24 | OK | 1 | 0 |
| tovu | apps/website | 2165 | SKIPPED | 0 | 0 |
| tovu | packages/contracts | 6 | OK | 0 | 0 |
| tovu | packages/sdk | 3 | OK | 0 | 0 |

By rule:

| repo | rule | hits |
|---|---|---|
| tovu | @typescript-eslint/no-misused-promises | 90 |
| jini | @typescript-eslint/no-misused-promises | 59 |
| tovu | @typescript-eslint/no-floating-promises | 17 |
| jini | @typescript-eslint/no-floating-promises | 8 |

Top files:

| repo | file | hits |
|---|---|---|
| tovu | apps/admin/src/features/taxonomy/Taxonomy.tsx | 9 |
| jini | packages/core/src/settings/express/http.ts | 8 |
| tovu | apps/admin/src/features/media/Media.tsx | 8 |
| tovu | apps/admin/src/features/roles/Roles.tsx | 8 |
| tovu | apps/admin/src/components/EmbedInsertControl/EmbedInsertControl.tsx | 6 |
| jini | packages/user-management/src/react/users/Users.tsx | 5 |
| tovu | apps/desktop/src/main/index.ts | 5 |
| tovu | apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.tsx | 4 |
| tovu | apps/admin/src/features/pages/Pages.tsx | 4 |
| tovu | apps/admin/src/features/recovery/Recovery.tsx | 4 |
| tovu | apps/desktop/src/renderer/App.tsx | 4 |
| jini | packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts | 3 |
| jini | packages/analytics/src/product/index.ts | 3 |
| jini | packages/user-management/src/react/auth/Passkeys.tsx | 3 |
| jini | packages/user-management/src/react/auth/TotpSettings.tsx | 3 |
| tovu | apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx | 3 |
| tovu | apps/admin/src/features/database/Database.tsx | 3 |
| tovu | apps/admin/src/features/integrations/Integrations.tsx | 3 |
| tovu | apps/admin/src/features/pages/PageEditor.tsx | 3 |
| tovu | apps/admin/src/features/plugins/AddPluginPanel.tsx | 3 |
| tovu | apps/admin/src/features/posts/Posts.tsx | 3 |
| jini | packages/admin/src/comments/react/components/QueueSection.tsx | 2 |
| jini | packages/admin/src/media/react/components/EditMediaPanel.tsx | 2 |
| jini | packages/admin/src/seo/react/pages/SeoPage.tsx | 2 |
| jini | packages/analytics/src/product/fanout.ts | 2 |

Top 50 of 174 (full list: `floating-promises.tsv`):

| repo | file:line | rule |
|---|---|---|
| jini | packages/admin/src/comments/react/components/QueueSection.tsx:229 | no-misused-promises |
| jini | packages/admin/src/comments/react/components/QueueSection.tsx:237 | no-misused-promises |
| jini | packages/admin/src/comments/react/hooks/use-comment-queue.hooks.ts:71 | no-misused-promises |
| jini | packages/admin/src/forms/react/components/FormSubmissionDetail.tsx:98 | no-misused-promises |
| jini | packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts:319 | no-misused-promises |
| jini | packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts:335 | no-misused-promises |
| jini | packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts:336 | no-misused-promises |
| jini | packages/admin/src/forms/react/pages/FormsList.tsx:158 | no-misused-promises |
| jini | packages/admin/src/media/react/components/EditMediaPanel.tsx:16 | no-misused-promises |
| jini | packages/admin/src/media/react/components/EditMediaPanel.tsx:23 | no-misused-promises |
| jini | packages/admin/src/redirects/react/components/ImportRedirectsForm.tsx:24 | no-misused-promises |
| jini | packages/admin/src/seo/react/components/SitemapModal.tsx:225 | no-misused-promises |
| jini | packages/admin/src/seo/react/pages/SeoPage.tsx:302 | no-misused-promises |
| jini | packages/admin/src/seo/react/pages/SeoPage.tsx:777 | no-misused-promises |
| jini | packages/admin/src/widgets/react/pages/WidgetInstanceEditor.tsx:108 | no-misused-promises |
| jini | packages/admin/src/widgets/react/pages/WidgetRegionEditor.tsx:73 | no-misused-promises |
| jini | packages/admin/src/widgets/react/pages/WidgetRegions.tsx:83 | no-misused-promises |
| jini | packages/admin/src/widgets/react/pages/WidgetsLibrary.tsx:168 | no-misused-promises |
| jini | packages/analytics/src/product/fanout.ts:19 | no-misused-promises |
| jini | packages/analytics/src/product/fanout.ts:22 | no-misused-promises |
| jini | packages/analytics/src/product/index.ts:173 | no-floating-promises |
| jini | packages/analytics/src/product/index.ts:183 | no-floating-promises |
| jini | packages/analytics/src/product/index.ts:195 | no-floating-promises |
| jini | packages/cms/src/comments/express/submit-handler.ts:104 | no-misused-promises |
| jini | packages/commerce/src/http/payments-webhook.ts:129 | no-misused-promises |
| jini | packages/commerce/src/http/payments-webhook.ts:132 | no-misused-promises |
| jini | packages/core/src/settings/express/http.ts:80 | no-misused-promises |
| jini | packages/core/src/settings/express/http.ts:87 | no-misused-promises |
| jini | packages/core/src/settings/express/http.ts:95 | no-misused-promises |
| jini | packages/core/src/settings/express/http.ts:106 | no-misused-promises |
| jini | packages/core/src/settings/express/http.ts:129 | no-misused-promises |
| jini | packages/core/src/settings/express/http.ts:130 | no-misused-promises |
| jini | packages/core/src/settings/express/http.ts:131 | no-misused-promises |
| jini | packages/core/src/settings/express/http.ts:142 | no-misused-promises |
| jini | packages/daemon/src/http/attachment-lookup-routes.ts:72 | no-misused-promises |
| jini | packages/daemon/src/http/attachments.ts:1620 | no-misused-promises |
| jini | packages/daemon/src/http/attachments.ts:1639 | no-misused-promises |
| jini | packages/daemon/src/http/frontend-request-route.ts:49 | no-misused-promises |
| jini | packages/daemon/src/http/frontend-sessions.ts:304 | no-misused-promises |
| jini | packages/daemon/src/http/frontend-sessions.ts:320 | no-misused-promises |
| jini | packages/daemon/src/http/model-proxy.ts:606 | no-misused-promises |
| jini | packages/daemon/src/http/model-proxy.ts:652 | no-misused-promises |
| jini | packages/daemon/src/http/run-credentials.ts:50 | no-misused-promises |
| jini | packages/daemon/src/http/run-credentials.ts:72 | no-misused-promises |
| jini | packages/daemon/src/http/runs.ts:372 | no-misused-promises |
| jini | packages/daemon/src/http/tool-execution-routes.ts:196 | no-misused-promises |
| jini | packages/diagnostics/src/observability/tracker.ts:105 | no-floating-promises |
| jini | packages/http-kit/src/adapter.ts:100 | no-misused-promises |
| jini | packages/sidecar/src/json-ipc.ts:271 | no-misused-promises |
| jini | packages/ui/src/features/asset-grid/react/components/AssetGrid.tsx:250 | no-misused-promises |

## 2. Dependency vulnerabilities
osv-scanner 2.2.2 `scan source` with explicit `-L` lockfiles: Tovu `package-lock.json`, `apps/admin/package-lock.json`,
`apps/desktop/package-lock.json`, `apps/site-chat/package-lock.json` (927 / 668 / 710 / 395 packages; 4 local
`file:`/workspace packages filtered as unscannable); Jini `pnpm-lock.yaml` (1335 packages).
The online API (`api.osv.dev`) is blocked by this container's network policy (ENV, see below), so the scan used
osv-scanner's **offline** mode against the OSV npm database zip (`osv-vulnerabilities.storage.googleapis.com` is
reachable). One `osv.tsv` row = one advisory against one package@version in one lockfile, so a package present in
several lockfiles repeats; "unique" in the totals dedupes across lockfiles. Severity = the advisory's
`database_specific.severity` (GHSA label); where absent, the group's max CVSS score; else UNKNOWN. `fixed-in` = every
`fixed` event in the advisory's ranges for that package (`none` = no fixed version published).

`npm audit --json` (Tovu root workspace only, as the brief asks) and `pnpm audit --json` (Jini) are counted from
each tool's own `metadata.vulnerabilities`. npm counts *packages* (a package is flagged once, at its worst
severity, including packages flagged only because a dependency is vulnerable — e.g. the `@jini-ai/*` entries);
pnpm counts *advisory × vulnerable range*. The two are not comparable to each other or to osv rows.

osv rows per lockfile:

| repo | lockfile | rows |
|---|---|---|
| jini | pnpm-lock.yaml | 184 |
| tovu | apps/admin/package-lock.json | 38 |
| tovu | apps/desktop/package-lock.json | 74 |
| tovu | apps/site-chat/package-lock.json | 48 |
| tovu | package-lock.json | 88 |

Most-affected packages (osv rows):

| repo | package | rows |
|---|---|---|
| tovu | undici | 63 |
| jini | undici | 60 |
| tovu | vite | 22 |
| tovu | fast-uri | 20 |
| tovu | nodemailer | 20 |
| tovu | @modelcontextprotocol/sdk | 18 |
| tovu | brace-expansion | 14 |
| jini | vite | 13 |
| jini | electron | 12 |
| tovu | ip-address | 12 |
| jini | fast-uri | 11 |
| jini | brace-expansion | 10 |
| jini | nanoid | 9 |
| jini | hono | 9 |
| jini | ip-address | 8 |
| tovu | devalue | 8 |
| tovu | body-parser | 7 |
| tovu | electron | 7 |
| jini | @modelcontextprotocol/sdk | 6 |
| tovu | qs | 6 |
| jini | dompurify | 5 |
| tovu | zod | 5 |
| jini | mermaid | 5 |
| tovu | astro | 4 |
| jini | js-yaml | 4 |

Top 50 of 432 osv rows, most severe first (full list: `osv.tsv`):

| repo | lockfile | package | version | id | severity | fixed-in |
|---|---|---|---|---|---|---|
| jini | pnpm-lock.yaml | dompurify | 3.4.12 | GHSA-cg2g-xh64-v4q7 | CRITICAL | 3.4.17 |
| jini | pnpm-lock.yaml | proxy-addr | 2.0.7 | GHSA-jqcg-44mw-7w3h | CRITICAL | 2.0.8 |
| jini | pnpm-lock.yaml | tinypool | 1.1.1 | GHSA-5gmw-xhrv-c9v3 | CRITICAL | 2.1.1 |
| jini | pnpm-lock.yaml | tinypool | 1.1.1 | GHSA-85c8-ppgw-ccpr | CRITICAL | 2.1.2 |
| jini | pnpm-lock.yaml | vitest | 2.1.9 | GHSA-5xrq-8626-4rwp | CRITICAL | 3.2.6,4.1.0 |
| tovu | apps/desktop/package-lock.json | proxy-addr | 2.0.7 | GHSA-jqcg-44mw-7w3h | CRITICAL | 2.0.8 |
| tovu | apps/site-chat/package-lock.json | proxy-addr | 2.0.7 | GHSA-jqcg-44mw-7w3h | CRITICAL | 2.0.8 |
| tovu | package-lock.json | astro | 7.2.1 | GHSA-26w7-cxv4-gfx2 | CRITICAL | 7.2.8 |
| tovu | package-lock.json | handlebars | 4.7.9 | GHSA-8r5x-fm3f-whwj | CRITICAL | 4.7.10 |
| tovu | package-lock.json | handlebars | 4.7.9 | GHSA-p8wg-vrv2-v86f | CRITICAL | 4.7.10 |
| tovu | package-lock.json | shell-quote | 1.9.0 | GHSA-pqg4-j6r4-53mv | CRITICAL | 1.11.0 |
| jini | pnpm-lock.yaml | @modelcontextprotocol/sdk | 1.29.0 | GHSA-22jm-h49p-29qw | HIGH | 1.32.0 |
| jini | pnpm-lock.yaml | @modelcontextprotocol/sdk | 1.29.0 | GHSA-46jr-4wx8-v453 | HIGH | 1.32.0 |
| jini | pnpm-lock.yaml | @modelcontextprotocol/sdk | 1.29.0 | GHSA-6qxp-vccf-f47h | HIGH | 1.31.0 |
| jini | pnpm-lock.yaml | @modelcontextprotocol/sdk | 1.29.0 | GHSA-f897-62hf-6gxq | HIGH | 1.30.1 |
| jini | pnpm-lock.yaml | body-parser | 1.20.6 | GHSA-27r3-jxmh-p828 | HIGH | 1.20.9,2.4.0 |
| jini | pnpm-lock.yaml | body-parser | 2.3.0 | GHSA-27r3-jxmh-p828 | HIGH | 1.20.9,2.4.0 |
| jini | pnpm-lock.yaml | brace-expansion | 2.1.2 | GHSA-6j4f-fj2g-mc7p | HIGH | 1.1.19,2.1.5,3.0.7,5.0.10 |
| jini | pnpm-lock.yaml | brace-expansion | 2.1.2 | GHSA-mh99-v99m-4gvg | HIGH | 1.1.17,2.1.3,3.0.3,5.0.8 |
| jini | pnpm-lock.yaml | brace-expansion | 2.1.2 | GHSA-qhr7-859c-m2p7 | HIGH | 1.1.20,2.1.6,3.0.8,5.0.11 |
| jini | pnpm-lock.yaml | brace-expansion | 2.1.2 | GHSA-rgw5-rvv9-x895 | HIGH | 1.1.18,2.1.4,3.0.6,5.0.9 |
| jini | pnpm-lock.yaml | brace-expansion | 5.0.7 | GHSA-6j4f-fj2g-mc7p | HIGH | 1.1.19,2.1.5,3.0.7,5.0.10 |
| jini | pnpm-lock.yaml | brace-expansion | 5.0.7 | GHSA-mh99-v99m-4gvg | HIGH | 1.1.17,2.1.3,3.0.3,5.0.8 |
| jini | pnpm-lock.yaml | brace-expansion | 5.0.7 | GHSA-qhr7-859c-m2p7 | HIGH | 1.1.20,2.1.6,3.0.8,5.0.11 |
| jini | pnpm-lock.yaml | brace-expansion | 5.0.7 | GHSA-rgw5-rvv9-x895 | HIGH | 1.1.18,2.1.4,3.0.6,5.0.9 |
| jini | pnpm-lock.yaml | dompurify | 3.4.12 | GHSA-mrv2-3pqr-j5jr | HIGH | 3.4.17 |
| jini | pnpm-lock.yaml | electron | 43.2.0 | GHSA-9qh4-3jw8-366w | HIGH | 41.10.6,42.9.2,43.4.1,44.0.0-beta.5 |
| jini | pnpm-lock.yaml | electron | 43.2.0 | GHSA-gr2m-v5gq-v685 | HIGH | 41.10.6,42.9.2,43.4.1,44.0.0-beta.5 |
| jini | pnpm-lock.yaml | electron | 43.2.0 | GHSA-j84w-jfhq-vhvj | HIGH | 41.10.6,42.9.2,43.4.1,44.0.0-beta.5 |
| jini | pnpm-lock.yaml | electron | 43.2.0 | GHSA-jr5w-w6x2-84p9 | HIGH | 42.11.16,43.8.1,44.9.1,45.0.0-beta.6 |
| jini | pnpm-lock.yaml | electron | 43.2.0 | GHSA-qmv3-fv6v-rmhq | HIGH | 42.10.0,43.5.0,44.0.0-beta.6 |
| jini | pnpm-lock.yaml | fast-uri | 3.1.4 | GHSA-5jgf-p345-68v8 | HIGH | 2.4.5,3.1.6,4.1.3 |
| jini | pnpm-lock.yaml | fast-uri | 3.1.4 | GHSA-7p8r-x3mc-p8w7 | HIGH | 2.4.4,3.1.5,4.1.2 |
| jini | pnpm-lock.yaml | fast-uri | 3.1.4 | GHSA-f65p-4m7j-42xc | HIGH | 2.4.5,3.1.6,4.1.3 |
| jini | pnpm-lock.yaml | fast-uri | 3.1.4 | GHSA-fph4-wmhf-6fwf | HIGH | 2.4.5,3.1.6,4.1.3 |
| jini | pnpm-lock.yaml | fast-uri | 3.1.4 | GHSA-jqff-g426-hqxp | HIGH | 2.4.5,3.1.6,4.1.3 |
| jini | pnpm-lock.yaml | fast-uri | 3.1.4 | GHSA-qw65-cvwx-89v3 | HIGH | 2.4.6,3.1.7,4.1.4 |
| jini | pnpm-lock.yaml | ip-address | 10.2.0 | GHSA-mwp4-54f8-5fhr | HIGH | 10.3.1 |
| jini | pnpm-lock.yaml | js-yaml | 3.15.0 | GHSA-2883-xcg3-v3hh | HIGH | 3.15.2,4.3.2 |
| jini | pnpm-lock.yaml | js-yaml | 3.15.0 | GHSA-5p4m-2wfm-xmqj | HIGH | 3.15.1,4.3.1 |
| jini | pnpm-lock.yaml | js-yaml | 4.3.0 | GHSA-2883-xcg3-v3hh | HIGH | 3.15.2,4.3.2 |
| jini | pnpm-lock.yaml | js-yaml | 4.3.0 | GHSA-5p4m-2wfm-xmqj | HIGH | 3.15.1,4.3.1 |
| jini | pnpm-lock.yaml | lodash-es | 4.17.21 | GHSA-r5fr-rjxr-66jc | HIGH | 4.18.0 |
| jini | pnpm-lock.yaml | nanoid | 3.3.16 | GHSA-2v37-7h3g-55p8 | HIGH | 3.3.18,5.1.6 |
| jini | pnpm-lock.yaml | nanoid | 3.3.3 | GHSA-28wg-ghj8-5hjv | HIGH | 3.3.16,5.1.16 |
| jini | pnpm-lock.yaml | nanoid | 3.3.3 | GHSA-2v37-7h3g-55p8 | HIGH | 3.3.18,5.1.6 |
| jini | pnpm-lock.yaml | nanoid | 3.3.3 | GHSA-xwg4-73v4-xw9w | HIGH | 3.3.12,5.1.11 |
| jini | pnpm-lock.yaml | nanoid | 4.0.2 | GHSA-28wg-ghj8-5hjv | HIGH | 3.3.16,5.1.16 |
| jini | pnpm-lock.yaml | nanoid | 4.0.2 | GHSA-2v37-7h3g-55p8 | HIGH | 3.3.18,5.1.6 |
| jini | pnpm-lock.yaml | nanoid | 4.0.2 | GHSA-xwg4-73v4-xw9w | HIGH | 3.3.12,5.1.11 |

npm audit (Tovu root) by severity: `{"info": 0, "low": 0, "moderate": 18, "high": 32, "critical": 3, "total": 53}`

pnpm audit (Jini) by severity: `{"info": 0, "low": 18, "moderate": 86, "high": 64, "critical": 6}`

npm audit (Tovu root), every flagged package (53):

| package | severity | via entries | fixAvailable |
|---|---|---|---|
| @ag-ui/core | high | 1 | False |
| @ag-ui/encoder | high | 2 | {'name': '@ag-ui/encoder', 'version': '1.0.4', 'isSemVerMajo |
| @ag-ui/proto | high | 1 | {'name': '@ag-ui/encoder', 'version': '1.0.4', 'isSemVerMajo |
| @esbuild-kit/core-utils | moderate | 1 | {'name': 'drizzle-kit', 'version': '0.31.11', 'isSemVerMajor |
| @esbuild-kit/esm-loader | moderate | 1 | {'name': 'drizzle-kit', 'version': '0.31.11', 'isSemVerMajor |
| @eslint/config-array | moderate | 1 | {'name': 'eslint', 'version': '9.39.5', 'isSemVerMajor': Tru |
| @jini-ai/agent-plugins | high | 1 | {'name': '@jini-ai/agent-plugins', 'version': '0.6.23', 'isS |
| @jini-ai/agent-runtime | high | 1 | {'name': '@jini-ai/analytics', 'version': '0.6.12', 'isSemVe |
| @jini-ai/agentic | high | 2 | {'name': '@jini-ai/agent-plugins', 'version': '0.6.23', 'isS |
| @jini-ai/analytics | high | 1 | {'name': '@jini-ai/analytics', 'version': '0.6.12', 'isSemVe |
| @jini-ai/chat | high | 5 | False |
| @jini-ai/cms | high | 1 | {'name': '@jini-ai/cms', 'version': '0.5.2', 'isSemVerMajor' |
| @jini-ai/commerce | high | 2 | {'name': '@jini-ai/agent-plugins', 'version': '0.6.23', 'isS |
| @jini-ai/daemon | high | 3 | False |
| @jini-ai/http-kit | high | 1 | {'name': '@jini-ai/cms', 'version': '0.5.2', 'isSemVerMajor' |
| @jini-ai/mcp | high | 1 | {'name': '@jini-ai/mcp', 'version': '0.4.4', 'isSemVerMajor' |
| @jini-ai/protocol | high | 1 | {'name': '@jini-ai/cms', 'version': '0.5.2', 'isSemVerMajor' |
| @jini-ai/registry | high | 1 | False |
| @jini-ai/search | high | 1 | {'name': '@jini-ai/search', 'version': '0.6.19', 'isSemVerMa |
| @jini-ai/server | high | 5 | False |
| @jini-ai/ui | high | 2 | {'name': '@jini-ai/agent-plugins', 'version': '0.6.23', 'isS |
| @jini-ai/user-management | high | 2 | False |
| @ts-morph/common | moderate | 1 | {'name': 'ts-morph', 'version': '17.0.1', 'isSemVerMajor': T |
| @typescript-eslint/eslint-plugin | moderate | 2 | {'name': 'typescript-eslint', 'version': '8.36.0', 'isSemVer |
| @typescript-eslint/parser | moderate | 1 | {'name': 'typescript-eslint', 'version': '8.36.0', 'isSemVer |
| @typescript-eslint/type-utils | moderate | 2 | {'name': 'typescript-eslint', 'version': '8.36.0', 'isSemVer |
| @typescript-eslint/typescript-estree | moderate | 1 | {'name': 'typescript-eslint', 'version': '8.36.0', 'isSemVer |
| @typescript-eslint/utils | moderate | 1 | {'name': 'typescript-eslint', 'version': '8.36.0', 'isSemVer |
| astro | critical | 4 | True |
| body-parser | high | 3 | True |
| brace-expansion | high | 5 | True |
| devalue | high | 8 | True |
| drizzle-kit | moderate | 2 | {'name': 'drizzle-kit', 'version': '0.31.11', 'isSemVerMajor |
| drizzle-orm | high | 1 | {'name': 'drizzle-orm', 'version': '0.45.4', 'isSemVerMajor' |
| esbuild | moderate | 1 | {'name': 'drizzle-kit', 'version': '0.31.11', 'isSemVerMajor |
| eslint | moderate | 2 | {'name': 'eslint', 'version': '9.39.5', 'isSemVerMajor': Tru |
| eslint-plugin-sonarjs | moderate | 1 | {'name': 'eslint-plugin-sonarjs', 'version': '2.0.0', 'isSem |
| fast-uri | moderate | 4 | True |
| handlebars | critical | 3 | True |
| js-yaml | high | 2 | True |
| liquidjs | high | 2 | True |
| minimatch | moderate | 1 | {'name': 'eslint-plugin-sonarjs', 'version': '2.0.0', 'isSem |
| nodemailer | high | 20 | {'name': 'nodemailer', 'version': '10.5.0', 'isSemVerMajor': |
| qs | moderate | 3 | True |
| sharp | high | 2 | True |
| shell-quote | critical | 1 | True |
| source-map-js | high | 1 | True |
| svgo | high | 2 | True |
| ts-morph | moderate | 1 | {'name': 'ts-morph', 'version': '17.0.1', 'isSemVerMajor': T |
| typescript-eslint | moderate | 4 | {'name': 'typescript-eslint', 'version': '8.36.0', 'isSemVer |
| undici | high | 16 | True |
| vite | high | 6 | True |
| zod | high | 1 | {'name': '@jini-ai/cms', 'version': '0.5.2', 'isSemVerMajor' |

pnpm audit (Jini), every advisory (158):

| package | severity | advisory | patched |
|---|---|---|---|
| @hono/node-server | moderate | GHSA-frvp-7c67-39w9 | >=1.19.15 |
| @hono/node-server | moderate | GHSA-rmxm-3fg6-px4f | >=2.1.3 |
| @modelcontextprotocol/sdk | high | GHSA-22jm-h49p-29qw | >=1.32.0 |
| @modelcontextprotocol/sdk | high | GHSA-46jr-4wx8-v453 | >=1.32.0 |
| @modelcontextprotocol/sdk | high | GHSA-6qxp-vccf-f47h | >=1.31.0 |
| @modelcontextprotocol/sdk | high | GHSA-f897-62hf-6gxq | >=1.30.1 |
| @modelcontextprotocol/sdk | moderate | GHSA-6prh-2h8m-c8cw | >=1.32.0 |
| @modelcontextprotocol/sdk | moderate | GHSA-rvq5-wwqv-78pq | >=1.32.0 |
| @vitest/mocker | moderate | GHSA-82fw-gwwq-j7x9 | >=4.1.11 |
| @vitest/mocker | moderate | GHSA-qxg6-89mg-rqv8 | >=4.1.12 |
| body-parser | high | GHSA-27r3-jxmh-p828 | >=1.20.9 |
| body-parser | high | GHSA-27r3-jxmh-p828 | >=2.4.0 |
| brace-expansion | high | GHSA-6j4f-fj2g-mc7p | >=2.1.5 |
| brace-expansion | high | GHSA-6j4f-fj2g-mc7p | >=5.0.10 |
| brace-expansion | high | GHSA-mh99-v99m-4gvg | >=2.1.3 |
| brace-expansion | high | GHSA-mh99-v99m-4gvg | >=5.0.8 |
| brace-expansion | high | GHSA-qhr7-859c-m2p7 | >=2.1.6 |
| brace-expansion | high | GHSA-qhr7-859c-m2p7 | >=5.0.11 |
| brace-expansion | high | GHSA-rgw5-rvv9-x895 | >=2.1.4 |
| brace-expansion | high | GHSA-rgw5-rvv9-x895 | >=5.0.9 |
| brace-expansion | moderate | GHSA-q2hr-2g5m-vwhr | >=2.1.7 |
| brace-expansion | moderate | GHSA-q2hr-2g5m-vwhr | >=5.0.12 |
| dompurify | critical | GHSA-cg2g-xh64-v4q7 | >=3.4.17 |
| dompurify | high | GHSA-mrv2-3pqr-j5jr | >=3.4.17 |
| dompurify | low | GHSA-6688-9rhm-gjv2 | >=3.4.16 |
| dompurify | low | GHSA-c6gr-qvv4-5v3f | >=3.4.17 |
| dompurify | moderate | GHSA-55q2-fjhq-7xh7 | >=3.4.13 |
| electron | high | GHSA-9qh4-3jw8-366w | >=43.4.1 |
| electron | high | GHSA-gr2m-v5gq-v685 | >=43.4.1 |
| electron | high | GHSA-j84w-jfhq-vhvj | >=43.4.1 |
| electron | high | GHSA-jr5w-w6x2-84p9 | >=43.8.1 |
| electron | high | GHSA-qmv3-fv6v-rmhq | >=43.5.0 |
| electron | low | GHSA-3qxv-5xgr-q7w9 | >=43.7.3 |
| electron | low | GHSA-98mx-cjp9-gchm | >=43.5.1 |
| electron | low | GHSA-h3v5-h239-pg29 | >=43.7.3 |
| electron | moderate | GHSA-2p8c-gr87-2676 | >=43.7.0 |
| electron | moderate | GHSA-997q-gvvc-jwmx | >=43.7.0 |
| electron | moderate | GHSA-fw47-9c62-h3vw | >=43.7.0 |
| electron | moderate | GHSA-x562-297c-g43g | >=43.7.6 |
| esbuild | moderate | GHSA-67mh-4wv8-2f99 | >=0.25.0 |
| fast-uri | high | GHSA-5jgf-p345-68v8 | >=3.1.6 |
| fast-uri | high | GHSA-7p8r-x3mc-p8w7 | >=3.1.5 |
| fast-uri | high | GHSA-f65p-4m7j-42xc | >=3.1.6 |
| fast-uri | high | GHSA-fph4-wmhf-6fwf | >=3.1.6 |
| fast-uri | high | GHSA-jqff-g426-hqxp | >=3.1.6 |
| fast-uri | high | GHSA-qw65-cvwx-89v3 | >=3.1.7 |
| fast-uri | low | GHSA-333x-w4r6-6crp | >=3.1.9 |
| fast-uri | low | GHSA-xhq7-xmqj-769h | >=3.1.9 |
| fast-uri | moderate | GHSA-hrr3-gc8f-f4qj | >=3.1.8 |
| fast-uri | moderate | GHSA-w74x-v6f9-j3xg | >=3.1.9 |
| fast-uri | moderate | GHSA-wjr9-j795-jxcr | >=3.1.9 |
| glob | moderate | GHSA-3g3m-2fjr-6pw4 | >=14.0.2 |
| hono | low | GHSA-79qm-7rj5-m7r9 | >=4.12.34 |
| hono | moderate | GHSA-54fx-42gc-7vw4 | >=4.12.34 |
| hono | moderate | GHSA-5r4p-p66f-jhc7 | >=4.13.11 |
| hono | moderate | GHSA-8j4g-w8fx-2239 | >=4.12.34 |
| hono | moderate | GHSA-crvj-82cr-hjcx | >=4.13.5 |
| hono | moderate | GHSA-f23p-vx2j-j53r | >=4.12.34 |
| hono | moderate | GHSA-g6gw-c38x-mqfc | >=4.13.5 |
| hono | moderate | GHSA-gqvv-2mrq-wpjv | >=4.13.5 |
| hono | moderate | GHSA-hxh3-vqpv-xpqv | >=4.13.7 |
| ip-address | high | GHSA-mwp4-54f8-5fhr | >=10.3.1 |
| ip-address | moderate | GHSA-22jq-vg5j-6vgg | >=10.2.1 |
| ip-address | moderate | GHSA-2vr4-cq9g-pvrc | >=10.5.1 |
| ip-address | moderate | GHSA-4xrf-jv44-h6hh | >=10.2.2 |
| ip-address | moderate | GHSA-h3mg-xc3c-68pw | >=10.7.1 |
| ip-address | moderate | GHSA-j6r3-76f7-8jcv | >=10.7.1 |
| ip-address | moderate | GHSA-rpw4-54j3-4h4q | >=10.5.1 |
| ip-address | moderate | GHSA-rxp7-6hxx-x8q5 | >=10.7.4 |
| js-yaml | high | GHSA-2883-xcg3-v3hh | >=3.15.2 |
| js-yaml | high | GHSA-2883-xcg3-v3hh | >=4.3.2 |
| js-yaml | high | GHSA-5p4m-2wfm-xmqj | >=3.15.1 |
| js-yaml | high | GHSA-5p4m-2wfm-xmqj | >=4.3.1 |
| katex | low | GHSA-238p-pmpm-9mq7 | >=0.18.2 |
| lodash-es | high | GHSA-r5fr-rjxr-66jc | >=4.18.0 |
| lodash-es | moderate | GHSA-xxjr-mmjv-4gpg | >=4.17.23 |
| mermaid | low | GHSA-c4c3-pg64-4m4v | >=11.16.1 |
| mermaid | moderate | GHSA-2v8p-3f2j-5mp7 | >=11.16.1 |
| mermaid | moderate | GHSA-3rrr-jr9j-h3q3 | >=11.16.1 |
| mermaid | moderate | GHSA-6x64-9x62-f2gx | >=11.16.1 |
| mermaid | moderate | GHSA-rhh3-jpg6-66xh | >=11.16.1 |
| minimatch | moderate | GHSA-g3hv-75wg-m249 | >=11.0.1 |
| nanoid | high | GHSA-28wg-ghj8-5hjv | >=3.3.16 |
| nanoid | high | GHSA-28wg-ghj8-5hjv | >=5.1.16 |
| nanoid | high | GHSA-2v37-7h3g-55p8 | >=3.3.18 |
| nanoid | high | GHSA-2v37-7h3g-55p8 | >=5.1.6 |
| nanoid | high | GHSA-xwg4-73v4-xw9w | >=3.3.12 |
| nanoid | high | GHSA-xwg4-73v4-xw9w | >=5.1.11 |
| nanoid | moderate | GHSA-mwcw-c2x4-8c55 | >=3.3.8 |
| nanoid | moderate | GHSA-mwcw-c2x4-8c55 | >=5.0.9 |
| postcss | moderate | GHSA-fxqj-rqcc-2cmp | >=8.5.23 |
| proxy-addr | critical | GHSA-jqcg-44mw-7w3h | >=2.0.8 |
| qs | moderate | GHSA-4mjr-xmp4-gh2g | >=6.16.0 |
| qs | moderate | GHSA-6pq8-jhm2-2vcw | >=6.16.1 |
| qs | moderate | GHSA-x5fp-wj9c-mxmx | >=6.16.0 |
| sharp | high | GHSA-rgj7-g3m4-5g8c | >=0.35.4 |
| sharp | high | GHSA-wq5f-xc86-pv6w | >=0.35.5 |
| source-map-js | high | GHSA-68fv-2mgg-jv7q | >=1.2.2 |
| tinypool | critical | GHSA-5gmw-xhrv-c9v3 | >=2.1.1 |
| tinypool | critical | GHSA-85c8-ppgw-ccpr | >=2.1.2 |
| undici | high | GHSA-2m5v-pch6-74hx | >=7.30.1 |
| undici | high | GHSA-2m5v-pch6-74hx | >=8.12.2 |
| undici | high | GHSA-4cwx-7wf7-3272 | >=7.29.0 |
| undici | high | GHSA-4w7w-5xrc-9h26 | >=7.30.1 |
| undici | high | GHSA-4w7w-5xrc-9h26 | >=8.12.2 |
| undici | high | GHSA-qrxm-fqhp-jwvm | >=7.30.1 |
| undici | high | GHSA-qrxm-fqhp-jwvm | >=8.12.2 |
| undici | high | GHSA-rfgv-xxqx-mfg5 | >=7.29.1 |
| undici | high | GHSA-rfgv-xxqx-mfg5 | >=8.10.2 |
| undici | high | GHSA-vp8m-p9jh-q5pm | >=8.10.2 |
| undici | high | GHSA-w293-vg96-wgc3 | >=7.29.1 |
| undici | high | GHSA-w293-vg96-wgc3 | >=8.10.2 |
| undici | high | GHSA-xjj6-f33q-929c | >=7.30.1 |
| undici | high | GHSA-xjj6-f33q-929c | >=8.12.2 |
| undici | low | GHSA-2gqq-gqf2-x968 | >=7.29.1 |
| undici | low | GHSA-2gqq-gqf2-x968 | >=8.10.2 |
| undici | low | GHSA-8436-99hf-9mmv | >=7.29.1 |
| undici | low | GHSA-8436-99hf-9mmv | >=8.10.2 |
| undici | low | GHSA-r53p-7pc4-xj5r | >=7.29.1 |
| undici | low | GHSA-r53p-7pc4-xj5r | >=8.10.2 |
| undici | moderate | GHSA-2jfj-6hjv-fm6j | >=7.29.1 |
| undici | moderate | GHSA-2jfj-6hjv-fm6j | >=8.10.2 |
| undici | moderate | GHSA-3wwx-pv8p-q78v | >=7.29.1 |
| undici | moderate | GHSA-3wwx-pv8p-q78v | >=8.10.2 |
| undici | moderate | GHSA-3xpg-4rpp-hhhm | >=7.29.1 |
| undici | moderate | GHSA-3xpg-4rpp-hhhm | >=8.10.2 |
| undici | moderate | GHSA-4qv8-2p9j-2685 | >=7.30.1 |
| undici | moderate | GHSA-4qv8-2p9j-2685 | >=8.12.2 |
| undici | moderate | GHSA-55wc-3pg8-jfw6 | >=7.30.1 |
| undici | moderate | GHSA-55wc-3pg8-jfw6 | >=8.12.2 |
| undici | moderate | GHSA-8xcm-r25x-g524 | >=7.29.0 |
| undici | moderate | GHSA-9fm3-97px-rjf6 | >=7.30.1 |
| undici | moderate | GHSA-9fm3-97px-rjf6 | >=8.12.2 |
| undici | moderate | GHSA-f72v-6w45-q472 | >=7.30.1 |
| undici | moderate | GHSA-f72v-6w45-q472 | >=8.12.2 |
| undici | moderate | GHSA-jr45-8vmc-qm54 | >=7.29.0 |
| undici | moderate | GHSA-m8rv-5g2x-5cg5 | >=7.29.0 |
| undici | moderate | GHSA-pmjh-fq2x-6v4x | >=7.29.1 |
| undici | moderate | GHSA-pmjh-fq2x-6v4x | >=8.10.2 |
| undici | moderate | GHSA-rx4f-c7p8-82vq | >=7.29.1 |
| undici | moderate | GHSA-rx4f-c7p8-82vq | >=8.10.2 |
| undici | moderate | GHSA-v3r7-h72x-cjcm | >=7.29.0 |
| vite | high | GHSA-587h-7wmj-h5pm | >=6.4.4 |
| vite | high | GHSA-587h-7wmj-h5pm | >=8.1.6 |
| vite | low | GHSA-9jrq-w75r-8gcw | >=6.4.4 |
| vite | low | GHSA-9jrq-w75r-8gcw | >=8.1.6 |
| vite | moderate | GHSA-4w7w-66w2-5vf9 | >=6.4.2 |
| vite | moderate | GHSA-698v-4r3x-3vcv | >=6.4.4 |
| vite | moderate | GHSA-698v-4r3x-3vcv | >=8.1.6 |
| vite | moderate | GHSA-fx2h-pf6j-xcff | >=6.4.3 |
| vite | moderate | GHSA-r825-w8mm-5pxw | >=6.4.4 |
| vite | moderate | GHSA-r825-w8mm-5pxw | >=8.1.6 |
| vite | moderate | GHSA-rq7h-c2jc-7f22 | >=6.4.4 |
| vite | moderate | GHSA-rq7h-c2jc-7f22 | >=8.1.6 |
| vite | moderate | GHSA-v6wh-96g9-6wx3 | >=6.4.3 |
| vitest | critical | GHSA-5xrq-8626-4rwp | >=3.2.6 |
| vitest | moderate | GHSA-82fw-gwwq-j7x9 | >=4.1.11 |
| zod | high | GHSA-mrhx-c7xc-m3w5 | >=4.6.6 |

## 3. Semgrep security scan
**The semgrep.dev registry is blocked in this container (ENV)**, so `--config p/security-audit --config p/typescript
--config p/javascript --config p/nodejsscan` could not be fetched. The scan used the same rules from their sources,
offline, with `--metrics=off`:

| registry pack | offline substitute |
|---|---|
| `p/javascript` | `semgrep-rules/javascript/**` (all rules) |
| `p/typescript` | `semgrep-rules/typescript/**` (all rules) |
| `p/nodejsscan` | njsscan 0.4.3 `rules/semantic_grep/**` (the rule set that pack is built from; `good/` "control present" rules excluded) |
| `p/security-audit` | its JS/TS rules are already inside the two dirs above; plus every rule in `semgrep-rules/{html,generic,bash,dockerfile,yaml,json}` with `metadata.category: security` and `subcategory: audit` (97 rule files) |

So the rule set is a close superset of the four packs for JS/TS (the dirs include a few non-security
correctness/best-practice JS rules the registry packs may leave out; every hit keeps its full rule id, so they
can be filtered) and an approximation for the non-JS part of `p/security-audit`. Rule ids below are shortened to
start at `semgrep-rules.` / `njsscan.` / `rules-audit-other.`. Targets: Tovu `apps packages content`, Jini
`packages/*/src`, git-tracked files, with `--exclude` for tests/`__tests__`/`__mocks__`/fixtures/mocks/e2e/dist/
build/node_modules/vendor/`*.test.*`/`*.spec.*`/`*.d.ts`/stories; `--timeout 30`, `--max-target-bytes 1000000`, `-j 2`.
Paths and rule ids only — no exploit detail.

Because the rule dirs also carry non-security rules (i18n key format, props spreading, correctness, best practice),
every row in `semgrep.tsv` has a `class` column: `security` = rule id contains `.security.`, or comes from njsscan,
or from the collected audit rules; `other` = everything else. Security counts and the top 50 use `security` only;
`other` rows are kept in full in the TSV and counted per rule below. "Partially analysed" = semgrep could not fully
parse the file (its own `PartialParsing` errors), so findings in those files may be undercounted.

Counts per rule (every rule that fired; security class first):

| class | repo | rule id | severity | hits |
|---|---|---|---|---|
| security | tovu | semgrep-rules.javascript.lang.security.html-in-template-string | WARNING | 249 |
| security | jini | semgrep-rules.javascript.lang.security.html-in-template-string | WARNING | 143 |
| security | jini | njsscan.regex_dos | WARNING | 98 |
| security | tovu | njsscan.regex_dos | WARNING | 59 |
| security | jini | semgrep-rules.javascript.lang.security.audit.detect-redos | WARNING | 41 |
| security | jini | semgrep-rules.javascript.lang.security.audit.unsafe-dynamic-method | WARNING | 39 |
| security | jini | semgrep-rules.javascript.lang.security.audit.unsafe-formatstring | INFO | 38 |
| security | tovu | semgrep-rules.javascript.lang.security.audit.unsafe-dynamic-method | WARNING | 33 |
| security | jini | rules-audit-other.missing-integrity | WARNING | 30 |
| security | jini | semgrep-rules.javascript.lang.security.audit.detect-non-literal-regexp | WARNING | 25 |
| security | tovu | semgrep-rules.javascript.lang.security.audit.detect-non-literal-regexp | WARNING | 23 |
| security | tovu | semgrep-rules.javascript.lang.security.audit.unsafe-formatstring | INFO | 21 |
| security | tovu | njsscan.node_timing_attack | WARNING | 14 |
| security | jini | njsscan.node_timing_attack | WARNING | 13 |
| security | tovu | njsscan.node_secret | ERROR | 11 |
| security | tovu | semgrep-rules.javascript.lang.security.audit.detect-redos | WARNING | 9 |
| security | jini | njsscan.node_secret | ERROR | 8 |
| security | tovu | njsscan.node_username | WARNING | 8 |
| security | jini | njsscan.node_username | WARNING | 7 |
| security | tovu | semgrep-rules.javascript.browser.security.insecure-document-method | ERROR | 5 |
| security | tovu | semgrep-rules.javascript.browser.security.insecure-innerhtml | ERROR | 5 |
| security | jini | semgrep-rules.javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop | WARNING | 5 |
| security | jini | njsscan.node_sha1 | WARNING | 5 |
| security | tovu | semgrep-rules.javascript.browser.security.wildcard-postmessage-configuration | WARNING | 5 |
| security | jini | njsscan.generic_header_injection | ERROR | 4 |
| security | tovu | njsscan.node_nosqli_injection | ERROR | 4 |
| security | tovu | njsscan.express_open_redirect | ERROR | 4 |
| security | tovu | semgrep-rules.javascript.lang.security.audit.unknown-value-with-script-tag | WARNING | 4 |
| security | jini | semgrep-rules.javascript.browser.security.insecure-document-method | ERROR | 3 |
| security | jini | semgrep-rules.javascript.browser.security.insecure-innerhtml | ERROR | 3 |
| security | jini | njsscan.node_nosqli_injection | ERROR | 3 |
| security | jini | njsscan.eval_nodejs | ERROR | 3 |
| security | jini | njsscan.node_api_key | ERROR | 3 |
| security | tovu | njsscan.node_api_key | ERROR | 3 |
| security | jini | njsscan.express_open_redirect | ERROR | 2 |
| security | tovu | njsscan.generic_header_injection | ERROR | 2 |
| security | tovu | njsscan.node_password | ERROR | 2 |
| security | tovu | semgrep-rules.javascript.express.security.injection.tainted-sql-string | ERROR | 2 |
| security | jini | njsscan.node_insecure_random_generator | WARNING | 2 |
| security | tovu | semgrep-rules.typescript.react.security.audit.react-href-var | WARNING | 2 |
| security | tovu | njsscan.generic_error_disclosure | WARNING | 2 |
| security | tovu | semgrep-rules.javascript.express.security.audit.express-res-sendfile | WARNING | 2 |
| security | jini | semgrep-rules.javascript.express.security.audit.remote-property-injection | ERROR | 1 |
| security | jini | semgrep-rules.javascript.node-crypto.security.gcm-no-tag-length | ERROR | 1 |
| security | tovu | semgrep-rules.javascript.lang.security.audit.spawn-shell-true | ERROR | 1 |
| security | tovu | njsscan.node_logic_bypass | ERROR | 1 |
| security | jini | semgrep-rules.typescript.react.security.audit.react-href-var | WARNING | 1 |
| security | jini | rules-audit-other.insecure-document-method | WARNING | 1 |
| security | jini | semgrep-rules.typescript.react.security.audit.react-dangerouslysetinnerhtml | WARNING | 1 |
| security | tovu | semgrep-rules.javascript.express.security.audit.res-render-injection | WARNING | 1 |
| security | tovu | semgrep-rules.javascript.express.security.injection.raw-html-format | WARNING | 1 |
| security | tovu | semgrep-rules.javascript.express.security.cors-misconfiguration | WARNING | 1 |
| security | tovu | semgrep-rules.javascript.express.security.audit.xss.direct-response-write | WARNING | 1 |
| other | tovu | semgrep-rules.typescript.react.portability.i18next.i18next-key-format | WARNING | 2197 |
| other | jini | semgrep-rules.typescript.react.portability.i18next.i18next-key-format | WARNING | 1435 |
| other | jini | semgrep-rules.typescript.react.best-practice.react-props-spreading | INFO | 749 |
| other | tovu | semgrep-rules.typescript.react.best-practice.react-props-spreading | INFO | 723 |
| other | jini | semgrep-rules.javascript.lang.correctness.missing-template-string-indicator | INFO | 583 |
| other | tovu | semgrep-rules.javascript.lang.correctness.missing-template-string-indicator | INFO | 419 |
| other | jini | semgrep-rules.typescript.react.portability.i18next.jsx-not-internationalized | INFO | 141 |
| other | tovu | semgrep-rules.typescript.react.portability.i18next.jsx-not-internationalized | INFO | 118 |
| other | jini | semgrep-rules.javascript.lang.correctness.no-replaceall | WARNING | 28 |
| other | tovu | semgrep-rules.javascript.lang.correctness.no-replaceall | WARNING | 23 |
| other | jini | semgrep-rules.typescript.react.portability.i18next.jsx-label-not-i18n | WARNING | 22 |
| other | jini | semgrep-rules.typescript.react.best-practice.react-props-in-state | WARNING | 16 |
| other | tovu | semgrep-rules.javascript.lang.best-practice.javascript-confirm | WARNING | 12 |
| other | tovu | semgrep-rules.typescript.react.best-practice.react-props-in-state | WARNING | 10 |
| other | jini | semgrep-rules.javascript.lang.correctness.no-stringify-keys | WARNING | 8 |
| other | jini | semgrep-rules.javascript.lang.best-practice.lazy-load-module | WARNING | 6 |
| other | tovu | semgrep-rules.javascript.lang.best-practice.lazy-load-module | WARNING | 4 |
| other | tovu | semgrep-rules.javascript.lang.correctness.no-stringify-keys | WARNING | 4 |
| other | jini | semgrep-rules.javascript.lang.best-practice.javascript-confirm | WARNING | 3 |
| other | jini | semgrep-rules.javascript.lang.best-practice.javascript-prompt | WARNING | 2 |
| other | tovu | semgrep-rules.javascript.lang.correctness.useless-assignment | INFO | 2 |
| other | tovu | semgrep-rules.javascript.react.correctness.hooks.calling-set-state-on-current-state | ERROR | 1 |
| other | jini | semgrep-rules.javascript.lang.correctness.useless-assignment | INFO | 1 |
| other | tovu | semgrep-rules.javascript.audit.detect-replaceall-sanitization | INFO | 1 |

Files with the most security-class hits:

| repo | file | hits |
|---|---|---|
| tovu | apps/website/src/server/inbound/public-http/http/site/render.ts | 114 |
| tovu | apps/website/src/server/inbound/public-http/http/site/form-render.ts | 22 |
| jini | packages/cms/src/forms/html-render.ts | 20 |
| tovu | apps/website/src/server/inbound/public-http/routes/site/member-pages.ts | 19 |
| tovu | apps/website/src/features/theme/static-render.ts | 16 |
| tovu | apps/website/src/features/theme/entry-list-render.ts | 14 |
| jini | packages/ui/src/features/mcp-ui/surfaces/structured-details.ts | 13 |
| jini | packages/chat/src/react/components/Markdown.tsx | 12 |
| jini | packages/cookie-consent/src/render/banner.ts | 11 |
| jini | packages/admin/src/forms/html-rules.ts | 10 |
| jini | packages/ui/src/features/mcp-ui/surfaces/document.ts | 10 |
| jini | packages/cms/src/seo/feed.ts | 9 |
| jini | packages/chat/src/core/user-text-redaction.ts | 8 |
| tovu | apps/website/src/features/agent-plugins/exports/runtime.ts | 8 |
| tovu | apps/website/src/server/inbound/assistant/agent-daemon-scope.ts | 8 |
| jini | packages/mcp/src/federation/trust.ts | 7 |
| tovu | apps/website/src/features/navigation/render-entry.ts | 7 |
| jini | packages/cms/src/forms/express/handler.ts | 6 |
| jini | packages/daemon/src/run-lifecycle.ts | 6 |
| jini | packages/agent-runtime/src/skills/web-clone/scripts/asset-harvest.mjs | 5 |
| jini | packages/ui/src/features/lexical-rich-text-editor/mention-parser.ts | 5 |
| jini | packages/ui/src/features/mcp-ui/surfaces/choice-group.ts | 5 |
| jini | packages/ui/src/features/mcp-ui/surfaces/text-input.ts | 5 |
| jini | packages/ui/src/renderers/sandboxed-document.ts | 5 |
| tovu | apps/admin/src/features/menus/html-rules.ts | 5 |

Top 50 of 955 security-class findings (ERROR first; full list incl. the 6508 other-class rows: `semgrep.tsv`):

| repo | file:line | rule id | severity |
|---|---|---|---|
| jini | packages/admin/src/security/conformance/security-api.conformance.ts:13 | njsscan.node_secret | ERROR |
| jini | packages/admin/src/security/conformance/security-api.conformance.ts:16 | njsscan.node_secret | ERROR |
| jini | packages/agent-runtime/src/claude-stream.ts:194 | njsscan.generic_header_injection | ERROR |
| jini | packages/agent-runtime/src/claude-stream.ts:209 | njsscan.generic_header_injection | ERROR |
| jini | packages/agent-runtime/src/providers/tool-turn.ts:95 | njsscan.generic_header_injection | ERROR |
| jini | packages/capability-providers/src/visitor-auth/lifecycle.ts:110 | njsscan.node_secret | ERROR |
| jini | packages/chat/src/core/user-text-redaction.ts:18 | njsscan.node_secret | ERROR |
| jini | packages/chat/src/embed-widget/browser/lazy-loader.ts:49 | semgrep-rules.javascript.browser.security.insecure-document-method | ERROR |
| jini | packages/chat/src/embed-widget/browser/lazy-loader.ts:49 | semgrep-rules.javascript.browser.security.insecure-innerhtml | ERROR |
| jini | packages/chat/src/embed-widget/browser/lazy-loader.ts:84 | semgrep-rules.javascript.browser.security.insecure-document-method | ERROR |
| jini | packages/chat/src/embed-widget/browser/lazy-loader.ts:84 | semgrep-rules.javascript.browser.security.insecure-innerhtml | ERROR |
| jini | packages/cms/src/comments/express/submit-handler.ts:109 | njsscan.express_open_redirect | ERROR |
| jini | packages/cms/src/media/rendition-service.ts:147 | njsscan.node_nosqli_injection | ERROR |
| jini | packages/cms/src/media/rendition-service.ts:156 | njsscan.node_nosqli_injection | ERROR |
| jini | packages/cms/src/media/rendition-service.ts:177 | njsscan.node_nosqli_injection | ERROR |
| jini | packages/cms/src/redirects/express/index.ts:33 | njsscan.express_open_redirect | ERROR |
| jini | packages/commerce/src/payments/testkit/lipay-fake.ts:39 | njsscan.node_secret | ERROR |
| jini | packages/daemon/src/http/run-credentials.ts:33 | semgrep-rules.javascript.express.security.audit.remote-property-injection | ERROR |
| jini | packages/daemon/src/http/xai.ts:761 | njsscan.eval_nodejs | ERROR |
| jini | packages/diagnostics/src/core/secrets-only.ts:43 | njsscan.node_secret | ERROR |
| jini | packages/mcp/src/federation/stdio/default-connect.ts:84 | njsscan.eval_nodejs | ERROR |
| jini | packages/platform/src/asset-cache.ts:194 | njsscan.eval_nodejs | ERROR |
| jini | packages/platform/src/secrets/secret-sealer.aesgcm.ts:68 | semgrep-rules.javascript.node-crypto.security.gcm-no-tag-length | ERROR |
| jini | packages/plugins/src/host/provider-contributions.ts:43 | njsscan.node_secret | ERROR |
| jini | packages/provider-plugins/src/analytics-posthog/index.ts:19 | njsscan.node_api_key | ERROR |
| jini | packages/sidecar/src/supervision/supervisor-node.ts:283 | njsscan.node_secret | ERROR |
| jini | packages/ui/src/features/execution/constants.ts:56 | njsscan.node_api_key | ERROR |
| jini | packages/ui/src/features/execution/constants.ts:61 | njsscan.node_api_key | ERROR |
| jini | packages/ui/src/features/html-editor/react/hooks/useInteractiveHtmlEditor.ts:123 | njsscan.generic_header_injection | ERROR |
| jini | packages/ui/src/utils/markdown-scroll-sync.ts:207 | semgrep-rules.javascript.browser.security.insecure-document-method | ERROR |
| jini | packages/ui/src/utils/markdown-scroll-sync.ts:207 | semgrep-rules.javascript.browser.security.insecure-innerhtml | ERROR |
| tovu | apps/admin/src/hooks/use-cms-sidebar-label-tooltips.hooks.ts:7 | njsscan.generic_header_injection | ERROR |
| tovu | apps/admin/vite.config.ts:36 | njsscan.generic_header_injection | ERROR |
| tovu | apps/desktop/scripts/check-gates.ts:78 | semgrep-rules.javascript.lang.security.audit.spawn-shell-true | ERROR |
| tovu | apps/desktop/src/coverage-floors.ts:290 | njsscan.node_password | ERROR |
| tovu | apps/site-chat/src/vanilla-host.ts:40 | semgrep-rules.javascript.browser.security.insecure-document-method | ERROR |
| tovu | apps/site-chat/src/vanilla-host.ts:40 | semgrep-rules.javascript.browser.security.insecure-innerhtml | ERROR |
| tovu | apps/website/src/features/agent-plugins/exports/runtime.ts:118 | njsscan.node_logic_bypass | ERROR |
| tovu | apps/website/src/features/form-destinations/port.ts:104 | njsscan.node_secret | ERROR |
| tovu | apps/website/src/features/form-destinations/pull.ts:123 | njsscan.node_secret | ERROR |
| tovu | apps/website/src/features/identity/api-key-service.ts:45 | njsscan.node_api_key | ERROR |
| tovu | apps/website/src/features/publish-content/apply-loop.ts:426 | njsscan.node_nosqli_injection | ERROR |
| tovu | apps/website/src/features/publish-content/gated-hooks.ts:234 | njsscan.node_nosqli_injection | ERROR |
| tovu | apps/website/src/features/publish-content/gated-hooks.ts:252 | njsscan.node_nosqli_injection | ERROR |
| tovu | apps/website/src/features/publish-content/peers.ts:256 | njsscan.node_api_key | ERROR |
| tovu | apps/website/src/features/publish-content/peers.ts:307 | njsscan.node_api_key | ERROR |
| tovu | apps/website/src/features/theme/validation/webmcp-markup.ts:138 | njsscan.node_secret | ERROR |
| tovu | apps/website/src/features/webhooks/secret-sealer.aesgcm.ts:97 | njsscan.node_secret | ERROR |
| tovu | apps/website/src/platform/db/migrations/0012_secrets_vault.ts:13 | njsscan.node_secret | ERROR |
| tovu | apps/website/src/platform/db/migrations/0020_vault_api_connection_kind.ts:36 | njsscan.node_secret | ERROR |

## 4. Accessibility (eslint-plugin-jsx-a11y recommended)
Config: `scripts/a11y.eslint.config.mjs` — `eslint-plugin-jsx-a11y` 6.10.2 `flatConfigs.recommended.rules`,
typescript-eslint parser without type info, `noInlineConfig: true`. Targets: `git ls-files` `*.tsx`/`*.jsx` under
Tovu `apps/admin/src` (229 files), Jini `packages/ui/src` (234) and `packages/chat/src` (33), scope exclusions applied.
No file failed to parse. (eslint also reported 6 "eslint-disable comment has no effect because of noInlineConfig"
notices in Jini; those are not findings and are not in `a11y.tsv`.)

"Menus/popovers missing keyboard handling" is counted, as the brief asks, from the three rules
`interactive-supports-focus`, `click-events-have-key-events`, `no-static-element-interactions`: hits, distinct
elements (file+line, since one element often trips two of them) and files.

Counts per rule:

| repo | rule | hits |
|---|---|---|
| tovu | jsx-a11y/click-events-have-key-events | 22 |
| jini | jsx-a11y/click-events-have-key-events | 16 |
| jini | jsx-a11y/no-noninteractive-element-interactions | 13 |
| tovu | jsx-a11y/interactive-supports-focus | 13 |
| tovu | jsx-a11y/no-autofocus | 13 |
| tovu | jsx-a11y/no-static-element-interactions | 11 |
| tovu | jsx-a11y/no-noninteractive-element-interactions | 11 |
| jini | jsx-a11y/no-static-element-interactions | 10 |
| jini | jsx-a11y/no-autofocus | 7 |
| jini | jsx-a11y/interactive-supports-focus | 6 |
| jini | jsx-a11y/media-has-caption | 4 |
| jini | jsx-a11y/no-redundant-roles | 2 |
| jini | jsx-a11y/label-has-associated-control | 2 |
| jini | jsx-a11y/iframe-has-title | 2 |
| jini | jsx-a11y/role-supports-aria-props | 2 |
| tovu | jsx-a11y/media-has-caption | 2 |
| jini | jsx-a11y/no-noninteractive-element-to-interactive-role | 1 |
| tovu | jsx-a11y/role-supports-aria-props | 1 |
| tovu | jsx-a11y/no-noninteractive-element-to-interactive-role | 1 |

Keyboard-handling gaps (menus/popovers/click targets): files with `interactive-supports-focus` / `click-events-have-key-events` / `no-static-element-interactions` hits, every file:

| repo | file | hits |
|---|---|---|
| jini | packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFileRow.tsx | 4 |
| tovu | apps/admin/src/features/plugins/AgentPluginDisableConfirmDialog.tsx | 3 |
| tovu | apps/admin/src/features/plugins/PluginRemoveConfirmDialog.tsx | 3 |
| tovu | apps/admin/src/features/settings/ExternalMcpRemoveConfirmDialog.tsx | 3 |
| tovu | apps/admin/src/features/settings/ExternalMcpToolsModal.tsx | 3 |
| tovu | apps/admin/src/features/skills/SkillInstallConfirmation.tsx | 3 |
| tovu | apps/admin/src/features/skills/SkillRemoveConfirmDialog.tsx | 3 |
| tovu | apps/admin/src/features/themes/ThemeExplore.tsx | 3 |
| jini | packages/ui/src/features/admin-widgets/components/Select/Select.tsx | 2 |
| jini | packages/ui/src/features/asset-grid/react/components/AssetGridBody.tsx | 2 |
| jini | packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFolderRow.tsx | 2 |
| jini | packages/ui/src/features/asset-tree-browser/react/components/AssetTreeRowMenu.tsx | 2 |
| jini | packages/ui/src/features/command-palette/react/components/CommandPaletteRow.tsx | 2 |
| jini | packages/ui/src/features/tabbed-dialog/react/components/TabbedDialog.tsx | 2 |
| jini | packages/ui/src/react/components/PaletteTweaks.tsx | 2 |
| tovu | apps/admin/src/App.tsx | 2 |
| tovu | apps/admin/src/features/library/Library.tsx | 2 |
| tovu | apps/admin/src/features/plugins/AgentPluginRow.tsx | 2 |
| tovu | apps/admin/src/features/plugins/PackageFilesModal.tsx | 2 |
| tovu | apps/admin/src/features/redirects/redirects-i18n.tsx | 2 |
| tovu | apps/admin/src/features/taxonomy/Taxonomy.tsx | 2 |
| jini | packages/chat/src/react/components/ChatSettingsDialog.tsx | 1 |
| jini | packages/chat/src/react/components/ComposerDiscovery.tsx | 1 |
| jini | packages/chat/src/react/components/Markdown.tsx | 1 |
| jini | packages/chat/src/react/features/chat-pane/components/RuntimeDropUp.tsx | 1 |
| jini | packages/ui/src/features/admin-widgets/components/Lightbox/Lightbox.tsx | 1 |
| jini | packages/ui/src/features/command-palette/react/components/CommandPalette.tsx | 1 |
| jini | packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx | 1 |
| jini | packages/ui/src/features/mention-autocomplete/react/components/MentionAutocomplete.tsx | 1 |
| jini | packages/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx | 1 |
| jini | packages/ui/src/features/viewer-shell/react/components/MarkdownSplitPane.tsx | 1 |
| jini | packages/ui/src/react/components/CustomSelect.tsx | 1 |
| jini | packages/ui/src/react/components/OnboardingDropdown.tsx | 1 |
| jini | packages/ui/src/react/components/WorkingDirPicker.tsx | 1 |
| jini | packages/ui/src/renderers/preview-modal-shell/react/components/PreviewModalShell.tsx | 1 |
| tovu | apps/admin/src/components/AssistantDock/DockSettingsMenu.tsx | 1 |
| tovu | apps/admin/src/components/AssistantDock/MessageOverflowModal.tsx | 1 |
| tovu | apps/admin/src/components/WidgetConfigFields/MediaContentEditor.tsx | 1 |
| tovu | apps/admin/src/features/ai-assistant/VisitorAssistantTabs.tsx | 1 |
| tovu | apps/admin/src/features/email/EmailTemplateEditor.tsx | 1 |
| tovu | apps/admin/src/features/media/Media.tsx | 1 |
| tovu | apps/admin/src/features/menus/MenuEditor.tsx | 1 |
| tovu | apps/admin/src/features/pages/PageEditor.tsx | 1 |
| tovu | apps/admin/src/features/pages/ThemePageDetailsModal.tsx | 1 |
| tovu | apps/admin/src/features/posts/PostEditor.tsx | 1 |
| tovu | apps/admin/src/features/posts/PostSettingsDialog.tsx | 1 |
| tovu | apps/admin/src/features/security/AccessTokensTab.tsx | 1 |
| tovu | apps/admin/src/features/taxonomy/TaxonomyRowMenu.tsx | 1 |

Top 50 of 139 (full list: `a11y.tsv`):

| repo | file:line | rule |
|---|---|---|
| jini | packages/chat/src/embed-widget/react/header.tsx:28 | jsx-a11y/no-autofocus |
| jini | packages/chat/src/react/components/AttachmentPreviewModal.tsx:29 | jsx-a11y/no-noninteractive-element-interactions |
| jini | packages/chat/src/react/components/AttachmentPreviewModal.tsx:29 | jsx-a11y/no-redundant-roles |
| jini | packages/chat/src/react/components/ChatSettingsDialog.tsx:68 | jsx-a11y/click-events-have-key-events |
| jini | packages/chat/src/react/components/ChatSettingsDialog.tsx:68 | jsx-a11y/no-noninteractive-element-interactions |
| jini | packages/chat/src/react/components/Composer.tsx:686 | jsx-a11y/no-autofocus |
| jini | packages/chat/src/react/components/ComposerDiscovery.tsx:39 | jsx-a11y/no-static-element-interactions |
| jini | packages/chat/src/react/components/ConversationTitleEditor.tsx:44 | jsx-a11y/no-autofocus |
| jini | packages/chat/src/react/components/Markdown.tsx:522 | jsx-a11y/click-events-have-key-events |
| jini | packages/chat/src/react/components/Markdown.tsx:522 | jsx-a11y/no-noninteractive-element-interactions |
| jini | packages/chat/src/react/components/QuestionForm.tsx:377 | jsx-a11y/label-has-associated-control |
| jini | packages/chat/src/react/features/chat-pane/components/AgentRuntimePicker.tsx:496 | jsx-a11y/no-noninteractive-element-interactions |
| jini | packages/chat/src/react/features/chat-pane/components/RuntimeDropUp.tsx:58 | jsx-a11y/interactive-supports-focus |
| jini | packages/ui/src/features/about/react/components/AboutTab.tsx:231 | jsx-a11y/label-has-associated-control |
| jini | packages/ui/src/features/admin-widgets/components/Lightbox/Lightbox.tsx:45 | jsx-a11y/click-events-have-key-events |
| jini | packages/ui/src/features/admin-widgets/components/Lightbox/Lightbox.tsx:45 | jsx-a11y/no-noninteractive-element-interactions |
| jini | packages/ui/src/features/admin-widgets/components/Select/Select.tsx:69 | jsx-a11y/click-events-have-key-events |
| jini | packages/ui/src/features/admin-widgets/components/Select/Select.tsx:134 | jsx-a11y/no-static-element-interactions |
| jini | packages/ui/src/features/asset-grid/react/components/AssetGridBody.tsx:36 | jsx-a11y/no-static-element-interactions |
| jini | packages/ui/src/features/asset-grid/react/components/AssetGridBody.tsx:62 | jsx-a11y/no-static-element-interactions |
| jini | packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFileRow.tsx:117 | jsx-a11y/no-autofocus |
| jini | packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFileRow.tsx:154 | jsx-a11y/click-events-have-key-events |
| jini | packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFileRow.tsx:154 | jsx-a11y/no-static-element-interactions |
| jini | packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFileRow.tsx:157 | jsx-a11y/click-events-have-key-events |
| jini | packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFileRow.tsx:157 | jsx-a11y/no-static-element-interactions |
| jini | packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFolderRow.tsx:18 | jsx-a11y/click-events-have-key-events |
| jini | packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFolderRow.tsx:18 | jsx-a11y/no-static-element-interactions |
| jini | packages/ui/src/features/asset-tree-browser/react/components/AssetTreeRowMenu.tsx:53 | jsx-a11y/click-events-have-key-events |
| jini | packages/ui/src/features/asset-tree-browser/react/components/AssetTreeRowMenu.tsx:53 | jsx-a11y/no-static-element-interactions |
| jini | packages/ui/src/features/command-palette/react/components/CommandPalette.tsx:55 | jsx-a11y/no-noninteractive-element-interactions |
| jini | packages/ui/src/features/command-palette/react/components/CommandPalette.tsx:56 | jsx-a11y/no-static-element-interactions |
| jini | packages/ui/src/features/command-palette/react/components/CommandPaletteRow.tsx:14 | jsx-a11y/click-events-have-key-events |
| jini | packages/ui/src/features/command-palette/react/components/CommandPaletteRow.tsx:14 | jsx-a11y/interactive-supports-focus |
| jini | packages/ui/src/features/connectors/components/ConnectorCard.tsx:241 | jsx-a11y/no-noninteractive-element-to-interactive-role |
| jini | packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:393 | jsx-a11y/click-events-have-key-events |
| jini | packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:393 | jsx-a11y/no-noninteractive-element-interactions |
| jini | packages/ui/src/features/file-dropzone/react/components/FileDropzoneLightbox.tsx:42 | jsx-a11y/media-has-caption |
| jini | packages/ui/src/features/file-dropzone/react/components/FileDropzoneLightbox.tsx:48 | jsx-a11y/media-has-caption |
| jini | packages/ui/src/features/file-dropzone/react/components/FileDropzoneThumbnailGrid.tsx:55 | jsx-a11y/iframe-has-title |
| jini | packages/ui/src/features/iframe-pool/react/components/PooledIframe.tsx:57 | jsx-a11y/iframe-has-title |
| jini | packages/ui/src/features/lexical-rich-text-editor/react/components/RichTextInput.tsx:220 | jsx-a11y/role-supports-aria-props |
| jini | packages/ui/src/features/memory/react/components/MemoryAdvancedModal.tsx:47 | jsx-a11y/no-noninteractive-element-interactions |
| jini | packages/ui/src/features/mention-autocomplete/react/components/MentionAutocomplete.tsx:82 | jsx-a11y/role-supports-aria-props |
| jini | packages/ui/src/features/mention-autocomplete/react/components/MentionAutocomplete.tsx:100 | jsx-a11y/interactive-supports-focus |
| jini | packages/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx:28 | jsx-a11y/interactive-supports-focus |
| jini | packages/ui/src/features/sketch-editor/react/components/SketchEditor.tsx:192 | jsx-a11y/no-autofocus |
| jini | packages/ui/src/features/tab-launcher-menu/react/components/TabLauncherMenu.tsx:100 | jsx-a11y/no-autofocus |
| jini | packages/ui/src/features/tabbed-dialog/react/components/TabbedDialog.tsx:157 | jsx-a11y/click-events-have-key-events |
| jini | packages/ui/src/features/tabbed-dialog/react/components/TabbedDialog.tsx:157 | jsx-a11y/no-static-element-interactions |
| jini | packages/ui/src/features/version-manager/react/components/VersionPromptPopover.tsx:58 | jsx-a11y/no-redundant-roles |

## SKIPPED / ENV items (exact errors)

- **ENV — osv online API blocked.** First osv-scanner run (online mode) failed for both repos:
  `error when retrieving vulns: max retries exceeded: attempt 4: request failed: Post "https://api.osv.dev/v1/querybatch": Forbidden`
  (agent proxy: `api.osv.dev:443 — connect_rejected`). Worked around with `--offline-vulnerabilities
  --download-offline-databases`; the offline DB came from `osv-vulnerabilities.storage.googleapis.com`. Same
  advisories, but no live API; DB snapshot time is in the versions table.
- **ENV — semgrep registry blocked.** `semgrep.dev:443 — connect_rejected` (`curl: (56) CONNECT tunnel failed,
  response 403`), so `p/security-audit`, `p/typescript`, `p/javascript`, `p/nodejsscan` could not be fetched;
  substituted with the offline rule sources described in section 3. Counts are therefore close to, not identical
  with, a registry-pack run.
- **Setup deviations (brief allows minimum setup).** Done: Node 24, Jini `pnpm install --frozen-lockfile` (EXIT 0,
  `raw/jini-install.txt`) and `pnpm --no-bail -r build` (EXIT 0, `raw/jini-build.txt`); Tovu `npm ci` in root,
  `apps/admin`, `apps/desktop`, `apps/site-chat` (all EXIT 0, `raw/tovu-npm-ci.txt`). Not done (not needed for
  any check): `npm run build --workspace @tovu/sdk`, `npm run link:jini`, desktop `build:preload` — Tovu's typed
  lint resolves `@jini-ai/*` from the published copies in its own `node_modules`.
- **Typed lint — files not type-loaded** (listed in full below and in `floating-promises-skipped.tsv`): files that
  no tsconfig includes, so the project service (or, for desktop, the given `project` list) cannot type them.
  Those files were not linted for promises; every other file in the unit was.
- **Semgrep partial parses**: files semgrep could only partially parse / timed out on (counts in the totals
  table; per-file detail in `raw/semgrep-*.json` `errors`). Findings in those files may be undercounted.
- **Semgrep / a11y / typed lint ignore inline suppressions**: typed lint and a11y run with `noInlineConfig`, so
  hits under an existing `eslint-disable` are counted (deliberately: the audit measures, it does not trust waivers).

Floating-promises skips (every entry, from `floating-promises-skipped.tsv`, 15):

| repo | unit | file | error |
|---|---|---|---|
| jini | packages/agent-runtime | packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/remotion.config.ts | Parsing error: /home/user/Jini/packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/remotion.config.ts was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject. |
| jini | packages/agentic | packages/agentic/src/core/dom/dom-page-driver.ts | Parsing error: /home/user/Jini/packages/agentic/src/core/dom/dom-page-driver.ts was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject. |
| jini | packages/agentic | packages/agentic/src/core/dom/index.ts | Parsing error: /home/user/Jini/packages/agentic/src/core/dom/index.ts was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject. |
| jini | packages/agentic | packages/agentic/src/core/dom/model-context.ts | Parsing error: /home/user/Jini/packages/agentic/src/core/dom/model-context.ts was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject. |
| jini | packages/agentic | packages/agentic/src/core/dom/native-model-context.ts | Parsing error: /home/user/Jini/packages/agentic/src/core/dom/native-model-context.ts was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject. |
| jini | packages/agentic | packages/agentic/src/core/dom/publication-filter.ts | Parsing error: /home/user/Jini/packages/agentic/src/core/dom/publication-filter.ts was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject. |
| jini | packages/provider-plugins | packages/provider-plugins/src/charts-echarts/client/provider.ts | Parsing error: /home/user/Jini/packages/provider-plugins/src/charts-echarts/client/provider.ts was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject. |
| jini | packages/provider-plugins | packages/provider-plugins/src/charts-echarts/descriptor.ts | Parsing error: /home/user/Jini/packages/provider-plugins/src/charts-echarts/descriptor.ts was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject. |
| jini | packages/provider-plugins | packages/provider-plugins/src/charts-echarts/index.ts | Parsing error: /home/user/Jini/packages/provider-plugins/src/charts-echarts/index.ts was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject. |
| jini | packages/provider-plugins | packages/provider-plugins/src/charts-echarts/mount.ts | Parsing error: /home/user/Jini/packages/provider-plugins/src/charts-echarts/mount.ts was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject. |
| jini | packages/provider-plugins | packages/provider-plugins/src/charts-echarts/option.ts | Parsing error: /home/user/Jini/packages/provider-plugins/src/charts-echarts/option.ts was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject. |
| tovu | apps/admin | apps/admin/vitest.config.ts | Parsing error: /home/user/Tovu/apps/admin/vitest.config.ts was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject. |
| tovu | apps/desktop | apps/desktop/scripts/verify-find-in-page.ts | Parsing error: "parserOptions.project" has been provided for @typescript-eslint/parser. The file was not found in any of the provided project(s): scripts/verify-find-in-page.ts |
| tovu | apps/desktop | apps/desktop/scripts/verify-site-power.ts | Parsing error: "parserOptions.project" has been provided for @typescript-eslint/parser. The file was not found in any of the provided project(s): scripts/verify-site-power.ts |
| tovu | apps/website | unit | SKIPPED (time-box): eslint over 2165 files (typed via the Tovu root tsconfig.json — apps/website has none) ran 01:56→02:56 wall clock (started 02:01:10), single process at ~4.1 GB RSS, ~109% CPU, produced no output before the step-1 60-minute time-box; the run was stopped at its 3600 s background li |
