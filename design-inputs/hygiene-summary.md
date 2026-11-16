# Hygiene audit — 2026-11-11

Repos: tovu=/Users/la/Programming/Tovu, jini=/Users/la/Programming/tovu-integration-clones/ui-jini. Script: development/scripts/hygiene-audit.mjs (read-only). One TSV per check in this folder.

## Counts

| check | tovu | jini |
|---|---|---|
| i18n dictionaries found | 137 | 5 |
| i18n-missing-keys rows (missing / empty / locale-block-missing / array-short) | 1 / 27 / 3 / 0 | 0 / 0 / 0 / 0 |
| i18n-missing-keys high-confidence rows | 31 | 0 |
| i18n-hardcoded-jsx hits (files) | 19 (16) | 259 (67) |
| version-pin-drift rows | 1 (code-pin 1) | 11 (bundle-vs-package 11) |
| env vars read (dynamic reads) | 165 (5) | 77 (1) |
| env read-not-in-schema / schema-not-read | 144 / 6 | 65 / 0 |
| stale-comments (missing / line-beyond-eof; historic=yes) | 1261 / 3; 73 | 952 / 0; 144 |
| cross-repo bundle version differences | 11 | |

## npm audit

- tovu — `npm audit --omit=dev`: info 0, low 0, moderate 3, high 26, critical 2, total 31; high/critical with their own advisory: body-parser (high), drizzle-orm (high), handlebars (critical), liquidjs (high), nodemailer (high), sharp (high), shell-quote (critical), undici (high), zod (high); flagged only through a dependency: 19
- tovu — `npm audit (all deps)`: info 0, low 0, moderate 18, high 32, critical 3, total 53; high/critical with their own advisory: astro (critical), body-parser (high), brace-expansion (high), devalue (high), drizzle-orm (high), handlebars (critical), js-yaml (high), liquidjs (high), nodemailer (high), sharp (high), shell-quote (critical), source-map-js (high), svgo (high), undici (high), vite (high), zod (high); flagged only through a dependency: 19
- jini — `npm audit --omit=dev`: FAILED — `ENOLOCK This command requires an existing lockfile.`
- jini — `pnpm audit --prod`: info 0, low 9, moderate 42, high 27, critical 1; high/critical with their own advisory: undici (high), fast-uri (high), ip-address (high), electron (high), proxy-addr (critical), @modelcontextprotocol/sdk (high), zod (high), body-parser (high); flagged only through a dependency: 0
- jini — `npm audit (all deps)`: FAILED — `ENOLOCK This command requires an existing lockfile.`
- jini — `pnpm audit (all deps)`: info 0, low 18, moderate 86, high 64, critical 6; high/critical with their own advisory: lodash-es (high), brace-expansion (high), undici (high), fast-uri (high), ip-address (high), js-yaml (high), nanoid (high), vitest (critical), sharp (high), electron (high), source-map-js (high), proxy-addr (critical), tinypool (critical), @modelcontextprotocol/sdk (high), vite (high), dompurify (high), zod (high), body-parser (high); flagged only through a dependency: 0

## Notes

- tovu: 137 dictionaries found; expected locales (present in >= half): 21 (ar bn de es fa fr hi hu id it ja ko pl pt-BR ru th tr uk ur zh-CN zh-TW); 588 missing keys dropped as covered by the common dictionary or a same-file dictionary
- jini: 5 dictionaries found; expected locales (present in >= half): 21 (ar bn de es fa fr hi hu id it ja ko pl pt-BR ru th tr uk ur zh-CN zh-TW); 0 missing keys dropped as covered by the common dictionary or a same-file dictionary
- tovu env schema files: .env.example (16 names)
- jini env schema files: NONE (0 names)

## Top offenders

### tovu

- i18n-missing-keys by file: `apps/admin/src/features/recovery/recovery-i18n.tsx` 8, `apps/admin/src/features/forms/forms-i18n.ts` 6, `apps/admin/src/features/pages/pages-i18n.ts` 6, `apps/admin/src/features/posts/posts-i18n.ts` 6, `apps/admin/src/components/ChatFab/ChatFab.tsx` 3, `apps/admin/src/features/observability/observability-i18n.ts` 1
- i18n-hardcoded-jsx by file: `apps/admin/src/features/ai-assistant/VisitorAssistantPanel.tsx` 2, `apps/admin/src/features/collections/Collections.tsx` 2, `apps/admin/src/features/security/AccessTokensTab.tsx` 2, `apps/admin/src/App.tsx` 1, `apps/admin/src/components/DevicePreview/DevicePreviewToggle.tsx` 1, `apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.tsx` 1, `apps/admin/src/components/WidgetConfigFields/MediaContentEditor.tsx` 1, `apps/admin/src/features/auth/Login.tsx` 1
- env vars by file count: TOVU_PUBLIC_URL 12, TOVU_SITE_DIR 10, TOVU_ADMIN_PASSWORD 9, NODE_ENV 7, PORT 7, TOVU_DESKTOP_USER_DATA_DIR 7, JINI_AGENT_DAEMON_PORT 6, TOVU_DEV_WARM_SITES 6, TOVU_SITE_LISTENER_ORIGIN 6, DEV 5
- stale-comments by file: `apps/admin/src/lib/api.ts` 58, `apps/website/src/server/routes/types.ts` 54, `apps/website/src/server/runtime/composition/app.ts` 31, `apps/website/src/server/runtime/composition/vault-legacy-codecs.ts` 28, `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts` 24, `apps/website/src/platform/db/schema.sqlite.ts` 16

### jini

- i18n-missing-keys by file: none
- i18n-hardcoded-jsx by file: `packages/admin/src/security/react/tabs/AccessTokensTab.tsx` 23, `packages/user-management/src/admin/react/tabs/UsersTab.tsx` 14, `packages/admin/src/security/react/tabs/RootKeyTab.tsx` 10, `packages/admin/src/agent-plugins/react/components/AgentPluginRow.tsx` 9, `packages/user-management/src/admin/react/tabs/PoliciesTab.tsx` 9, `packages/admin/src/media/react/tabs/ProvidersTab.tsx` 8, `packages/user-management/src/admin/react/components/PermissionPanel.tsx` 8, `packages/admin/src/security/react/components/CredentialEditor.tsx` 7
- env vars by file count: HOME 9, APPDATA 5, CLAUDE_CONFIG_DIR 4, PATH 4, CODEX_HOME 3, NODE_ENV 3, PGHOST 3, PGPORT 3, PGUSER 3, USERPROFILE 3
- stale-comments by file: `packages/daemon/src/tool-recovery/federated-refusal.ts` 14, `packages/daemon/src/http/research.ts` 11, `packages/cms/src/widgets/resolver-service.ts` 10, `packages/daemon/src/http/xai.ts` 10, `packages/daemon/src/http/routines.ts` 8, `packages/cms/src/entries/agent-tools.ts` 7

## Samples (auto-picked, spread across each TSV)

### i18n-missing-keys

- tovu `apps/admin/src/components/ChatFab/ChatFab.tsx` FAB_ACTION_TEMPLATE:49 hi — locale-block-missing `*`
- tovu `apps/admin/src/features/forms/forms-i18n.ts` FORMS_DICT:15 hi — empty `Move`
- tovu `apps/admin/src/features/pages/pages-i18n.ts` PAGES_DICT:26 tr — empty `Move`
- tovu `apps/admin/src/features/posts/posts-i18n.ts` POSTS_DICT:29 tr — empty `Move`
- tovu `apps/admin/src/features/recovery/recovery-i18n.tsx` SINCE_DISCARD_FRAGMENTS:1124 hu — empty `before`

### i18n-hardcoded-jsx

- tovu `apps/admin/src/App.tsx:886` text <span> "Tovu"
- tovu `apps/admin/src/components/WidgetConfigFields/MediaContentEditor.tsx:323` prop:placeholder <textarea> "<img data-media-slug="…" alt="…">"
- tovu `apps/admin/src/features/authentication/Authentication.tsx:88` prop:aria-label <section> "… authentication setup"
- tovu `apps/admin/src/features/redirects/redirects-i18n.tsx:741` prop:label <InfoTip> "…: matchType, fromPattern, toTarget, statusCode. …: override, priority"
- tovu `apps/admin/src/features/settings/SettingsUi.tsx:214` expr <strong> "Tovu Admin …"
- jini `packages/admin/src/agent-plugins/react/components/AgentPluginFileTree.tsx:5` prop:aria-label <div> "Package files"
- jini `packages/admin/src/media/react/tabs/ProvidersTab.tsx:8` text <h4> "Media providers"
- jini `packages/admin/src/security/react/tabs/RootKeyTab.tsx:12` prop:label <TextField> "Type START FRESH"
- jini `packages/ui/src/features/interactive-ui/providers/shadcn/data-table.tsx:100` prop:aria-label <button> "Next page"
- jini `packages/user-management/src/admin/react/pages/RolesPage.tsx:15` text <Notice> "No roles tabs are enabled."

### version-pin-drift

- tovu code-pin charts-recharts: 0.6.24 vs 0.7.0 (`apps/website/src/server/runtime/composition/charts-recharts-source.ts:25`)
- cross cross-repo-bundle analytics-posthog: tovu=0.7.0 vs jini=0.6.24 (`node_modules/@jini-ai/provider-plugins/plugins/analytics-posthog/0.7.0 | packages/provider-plugins/plugins/analytics-posthog/0.6.24`)
- cross cross-repo-bundle charts-recharts: tovu=0.7.0 vs jini=0.6.24 (`node_modules/@jini-ai/provider-plugins/plugins/charts-recharts/0.7.0 | packages/provider-plugins/plugins/charts-recharts/0.6.24`)
- cross cross-repo-bundle formspree: tovu=0.7.0 vs jini=0.6.24 (`node_modules/@jini-ai/provider-plugins/plugins/formspree/0.7.0 | packages/provider-plugins/plugins/formspree/0.6.24`)
- cross cross-repo-bundle observability-opentelemetry: tovu=0.7.0 vs jini=0.6.24 (`node_modules/@jini-ai/provider-plugins/plugins/observability-opentelemetry/0.7.0 | packages/provider-plugins/plugins/observability-opentelemetry/0.6.24`)
- jini bundle-vs-package fixture-provider: 0.6.19 vs 0.7.1 (`packages/plugin-fixture-provider/plugins/fixture-provider/0.6.19`)
- jini bundle-vs-package analytics-posthog: 0.6.24 vs 0.7.1 (`packages/provider-plugins/plugins/analytics-posthog/0.6.24`)
- jini bundle-vs-package charts-recharts: 0.6.24 vs 0.7.1 (`packages/provider-plugins/plugins/charts-recharts/0.6.24`)
- jini bundle-vs-package formspree: 0.6.24 vs 0.7.1 (`packages/provider-plugins/plugins/formspree/0.6.24`)
- jini bundle-vs-package observability-opentelemetry: 0.6.24 vs 0.7.1 (`packages/provider-plugins/plugins/observability-opentelemetry/0.6.24`)

### stale-comments

- tovu `apps/admin/src/App.hooks.ts:306` cites `server/app.ts` — missing
- tovu `apps/admin/src/panels.tsx:873` cites `store-plugin.ts` — missing
- tovu `apps/website/src/features/deployments/publish-agent-tools.ts:366` cites `assistant/surface-exchanges.ts` — missing
- tovu `apps/website/src/features/theme/theme-files.ts:973` cites `server/deps.ts` — missing
- tovu `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts:1587` cites `src/server/modules/assistant.ts` — missing
- jini `packages/admin/src/comments/rules.ts:232` cites `Seo.tsx` — missing
- jini `packages/cms/src/content-types/agent-tools.ts:54` cites `__tests__/unit/agent-tools.schema-agreement.unit.test.ts` — missing
- jini `packages/daemon/src/http/research.ts:215` cites `research/index.ts` — missing (historic)
- jini `packages/memory/src/llm-provider.ts:12` cites `apps/daemon/src/memory-llm.ts` — missing (historic)
- jini `packages/ui/src/features/resource-dashboard/react/components/StatusPill.tsx:17` cites `packages/ui/source-map.md` — missing

## Limits (copied from the script header)

- **1** i18n-missing-keys: finds locale-keyed object literals (>=3 locale-code keys) whose values are
  object/array literals, plus per-locale files `<name>.<locale>.ts`. Keys are read statically:
  literal/identifier names, `[CONST]` computed keys resolved to a same-file string const,
  `...translationEntry("k", "v")`, and `...SAME_FILE_CONST`. Any other spread (e.g. `...X[locale]`)
  or a locale value that is an import is "unresolved" → rows get confidence=low. Dictionaries
  built at runtime (Object.fromEntries over arrays) are checked only through their array-valued
  source (array length vs the sibling *_KEYS array or the longest locale). Expected locales = the
  locales present in at least half of the repo's dictionaries; a dictionary missing one gets a
  single "locale-block-missing" row. A missing key is DROPPED (counted in the notes) when the
  common dictionary (dicts in a *common* i18n file + its *_KEYS arrays) or another dict in the
  same file has it for that locale — so a same-file dict that is NOT merged can hide a real gap.
  An `en` block under 90% of the union is an override block (raw key = English) and is not
  checked for missing keys. `helper([...])`/`helper({...})` locale values are read through
  their literal argument. It does not check translation quality or that a key is still used.
- **2** i18n-hardcoded-jsx: JsxText with letters, `{"string"}` children, and string literals (incl.
  ternary/?? branches) in title/placeholder/aria-label/alt/label props. Tovu = apps/admin/src only;
  Jini = every packages/*/src .tsx. Skips text inside code/pre/kbd/samp/style/script, data-*,
  no-letter text, single letters, and single tokens that look like identifiers/classes/URLs
  (contain - _ . / : # @ = or camelCase). Brand names in camelCase (GitHub) are therefore skipped;
  intentionally untranslated copy (vendor names) still shows up. Strings built in variables and
  passed as props are not seen.
- **3** version-pin-drift: (a) code pins = object literals with string `pluginId` + semver `version`,
  compared with installed plugin bundle folders (<repo>/node_modules/@*/*/plugins/<id>/<ver>,
  <repo>/packages/*/plugins/<id>/<ver>, <repo>/content/plugins/<id>/<ver>); (b) bundle folder name
  vs its jini.plugin.json version; (c) a package's versioned bundle folder vs the package version;
  (d) the same plugin id at different versions across repos; (e) package.json dependency ranges
  (dependencies/dev/optional, not peer) vs the installed package.json found by walking up
  node_modules; workspace:/file:-tgz specifiers are checked, link:/git/url ones skipped; (f) Tovu
  package-lock.json vs installed for root direct deps. Pins held only in a database (site
  settings) are not seen.
- **4** env-sprawl: `process.env.X`, `process.env["X"]`, `process.env[CONST]` (same-file string const),
  `const {X} = process.env`, `import.meta.env.X`, aliases (`const e = process.env`), and ALL_CAPS
  reads on injected env objects (`env.X`, `deps.env.X`, `env[CONST]`; source=env-param, lower
  confidence). source=name-literal = a "TOVU_…"/"JINI_…" string literal anywhere in prod code
  (catches names read through helpers/lists, also catches copy that merely mentions a name).
  Dynamic `process.env[expr]` goes to env-dynamic-reads.tsv. Schema = names on `NAME=` /
  `# NAME=` lines in tracked .env*.example files; a zod/env schema module, if one existed, would
  need adding here. "read-not-in-schema" ignores name-literal-only vars; "schema-not-read" means
  the name appears nowhere in prod code (it may be read by scripts, Docker or CI).
- **5** stale-comments: path-like tokens in comments (apps/ packages/ src/ development/ content/
  scripts/ docs/ sites/ themes/ prefixes, or any token ending .ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs).
  Resolved against the repo root, the file's folder, the nearest package root, and every other
  repo root (Jini/ and Tovu/ prefixes map to those repos); .js<->.ts and .ts<->.tsx swaps count as
  found. A partial path (`features/x/y.ts`, written relative to some src/) counts as found when
  ANY tracked file in either repo ends with it — so a citation pointing at the wrong package but
  a real suffix is missed. Bare file names (no slash) count as found if that basename is tracked
  anywhere in either repo, so a renamed-but-common name (index.ts) is never flagged. URLs, globs,
  <placeholders>, absolute paths and `.x.ts` fragments (a name wrapped across comment lines) are
  skipped. Comments that narrate history ("moved from X") are flagged but marked historic=yes.
  `file:line` citations are flagged when the line is past the end of the file.
- **6** npm-audit: `npm audit --json --omit=dev` and without --omit=dev at each repo root. Needs network
  and a package-lock.json; Jini is pnpm (no lockfile) so npm audit fails there and `pnpm audit
  --json [--prod]` is tried instead (still read-only). Advisory data is whatever the registry
  returns today.


## Hand-verified samples (11-11, short excerpts; appended by hand, a rerun drops this section)

- i18n-missing-keys: `forms-i18n.ts:628/690/1007` really hold `Move: ""` (ja/ko/tr). `ChatFab.tsx:49` FAB_ACTION_TEMPLATE has 19 locales, no hi/ur/bn. Tuned out: `Label`/`Status`/`More` "missing" in COLLECTIONS_DICT were covered by i18n-common (588 such rows now dropped); partial `en` override blocks no longer count; `auditTranslationEntries([...])` blocks now read.
- i18n-hardcoded-jsx: admin is nearly clean (rg `>[A-Z][a-z]+ [a-z]+…<` in admin .tsx finds 0, matching 19 script hits, mostly brand/"e.g." placeholders). Jini: `RootKeyTab.tsx:9 label="Old root key"`, `MembersTab.tsx` `<th>Status`, `UsersConfirmation.tsx` "Confirm new password" confirmed (those files are dense one-liners, hence low line numbers).
- version-pin-drift: `charts-recharts-source.ts:25` pins 0.6.24; Tovu has only `node_modules/@jini-ai/provider-plugins/plugins/charts-recharts/0.7.0` — the known chart-to-table fallback. Jini source bundles are folders named 0.6.24 inside provider-plugins 0.7.1 (one fact, 11 plugins). Tuned out: pnpm-symlink duplicates, remotion asset template package.json.
- env-sprawl: `TOVU_SITE_KEY` is read via a name list + helper (deployment-overview.ts:92), caught only by source=name-literal. OTEL_* in .env.example are read by the OpenTelemetry SDK, not our code — expected "schema-not-read".
- stale-comments: `server/deps.ts` / `server/app.ts` (routes/types.ts:284, Jini db/tools/database-catalog.ts:26) and `App.hooks.tsx` (assistant-dock-i18n.ts:966) do not exist anywhere; Jini `packages/http/src/runs.ts` (cli/run-command.ts:8) is now http-kit. `App.tsx:515` (desktop use-site-actions.hooks.ts:8) is past EOF (304 lines). False positive kept: trash/permissions.ts:42 cites Jini's `permissions.ts:638`, but the bare name resolves to its own folder first. Tuned out: dir-relative partial paths (suffix match), `.hooks.ts` line-wrap fragments, `package.js(on)`, globs, absolute paths.
