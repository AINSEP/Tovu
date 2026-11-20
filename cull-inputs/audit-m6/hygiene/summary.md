# Hygiene audit — 2026-11-20

Repos: tovu=SCR/c-r62t-perfobs, jini=SCR/ro-m6-jini. Script: development/scripts/hygiene-audit.mjs (read-only). One TSV per check in this folder.

## Counts

| check | tovu | jini |
|---|---|---|
| i18n dictionaries found | 138 | 5 |
| i18n-missing-keys rows (missing / empty / locale-block-missing / array-short) | 1005 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| i18n-missing-keys high-confidence rows | 962 | 0 |
| i18n-hardcoded-jsx hits (files) | 19 (17) | 260 (68) |
| version-pin-drift rows | 260 (dep-not-installed 259, code-pin 1) | 466 (dep-not-installed 466) |
| env vars read (dynamic reads) | 164 (5) | 76 (1) |
| env read-not-in-schema / schema-not-read | 94 / 6 | 64 / 0 |
| stale-comments (missing / line-beyond-eof; historic=yes) | 675 / 3; 81 | 606 / 2; 152 |

## npm audit


## Notes

- tovu: 138 dictionaries found; expected locales (present in >= half): 21 (ar bn de es fa fr hi hu id it ja ko pl pt-BR ru th tr uk ur zh-CN zh-TW); 648 missing keys dropped as covered by the common dictionary or a same-file dictionary
- jini: 5 dictionaries found; expected locales (present in >= half): 21 (ar bn de es fa fr hi hu id it ja ko pl pt-BR ru th tr uk ur zh-CN zh-TW); 0 missing keys dropped as covered by the common dictionary or a same-file dictionary
- tovu env schema files: .env.example (63 names)
- jini env schema files: NONE (0 names)

## Top offenders

### tovu

- i18n-missing-keys by file: `apps/admin/src/features/deployment/deployment-i18n.tsx` 964, `apps/admin/src/features/users/users-i18n.ts` 24, `apps/admin/src/features/sites/site-transfer-i18n.ts` 10, `apps/admin/src/features/dashboard/dashboard-i18n.ts` 5, `apps/admin/src/features/auth/auth-i18n.ts` 2
- i18n-hardcoded-jsx by file: `apps/admin/src/features/ai-assistant/VisitorAssistantPanel.tsx` 2, `apps/admin/src/features/security/AccessTokensTab.tsx` 2, `apps/admin/src/App.chrome.tsx` 1, `apps/admin/src/components/DevicePreview/DevicePreviewToggle.tsx` 1, `apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.tsx` 1, `apps/admin/src/components/WidgetConfigFields/MediaContentEditor.tsx` 1, `apps/admin/src/features/auth/Login.tsx` 1, `apps/admin/src/features/authentication/Authentication.tsx` 1
- env vars by file count: TOVU_PUBLIC_URL 12, TOVU_SITE_DIR 10, TOVU_ADMIN_PASSWORD 9, NODE_ENV 7, PORT 7, TOVU_DESKTOP_USER_DATA_DIR 7, JINI_AGENT_DAEMON_PORT 6, TOVU_DEV_WARM_SITES 6, TOVU_SITE_LISTENER_ORIGIN 6, DEV 5
- stale-comments by file: `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts` 11, `apps/admin/src/features/providers/Providers.tsx` 10, `apps/website/src/server/runtime/composition/vault-legacy-codecs.ts` 10, `apps/website/src/features/site-export/site-exporter.ts` 9, `apps/desktop/src/tovu-server.ts` 8, `apps/admin/src/App.hooks.ts` 7

### jini

- i18n-missing-keys by file: none
- i18n-hardcoded-jsx by file: `packages/admin/src/security/react/tabs/AccessTokensTab.tsx` 23, `packages/user-management/src/admin/react/tabs/UsersTab.tsx` 14, `packages/admin/src/security/react/tabs/RootKeyTab.tsx` 10, `packages/admin/src/agent-plugins/react/components/AgentPluginRow.tsx` 9, `packages/user-management/src/admin/react/tabs/PoliciesTab.tsx` 9, `packages/admin/src/media/react/tabs/ProvidersTab.tsx` 8, `packages/user-management/src/admin/react/components/PermissionPanel.tsx` 8, `packages/admin/src/security/react/components/CredentialEditor.tsx` 7
- env vars by file count: HOME 9, APPDATA 6, CLAUDE_CONFIG_DIR 4, PATH 4, XDG_CONFIG_HOME 4, CODEX_HOME 3, PGHOST 3, PGPORT 3, PGUSER 3, USERPROFILE 3
- stale-comments by file: `packages/daemon/src/http/research.ts` 11, `packages/cms/src/widgets/html/html-embeds.ts` 9, `packages/cms/src/widgets/post-content-context.ts` 9, `packages/daemon/src/http/xai.ts` 9, `packages/cms/src/widgets/media-embed-resolution.ts` 6, `packages/daemon/src/http/routines.ts` 6

## Samples (auto-picked, spread across each TSV)

### i18n-missing-keys

- tovu `apps/admin/src/features/deployment/deployment-i18n.tsx` DEPLOYMENT_AUDIT_TRANSLATIONS:1767 en — missing `entries`
- tovu `apps/admin/src/features/deployment/deployment-i18n.tsx` DEPLOYMENT_AUDIT_TRANSLATIONS:1767 it — missing `Credential`
- tovu `apps/admin/src/features/deployment/deployment-i18n.tsx` DEPLOYMENT_AUDIT_TRANSLATIONS:1767 ja — missing `Credential`
- tovu `apps/admin/src/features/deployment/deployment-i18n.tsx` DEPLOYMENT_AUDIT_TRANSLATIONS:1767 ar — missing `Published:`
- tovu `apps/admin/src/features/deployment/deployment-i18n.tsx` DEPLOYMENT_AUDIT_TRANSLATIONS:1767 tr — missing `Published:`

### i18n-hardcoded-jsx

- tovu `apps/admin/src/App.chrome.tsx:152` text <span> "Tovu"
- tovu `apps/admin/src/components/WidgetConfigFields/MediaContentEditor.tsx:326` prop:placeholder <textarea> "<img data-media-slug="…" alt="…">"
- tovu `apps/admin/src/features/authentication/Authentication.tsx:90` prop:aria-label <section> "… authentication setup"
- tovu `apps/admin/src/features/redirects/redirects-i18n.tsx:741` prop:label <InfoTip> "…: matchType, fromPattern, toTarget, statusCode. …: override, priority"
- tovu `apps/admin/src/features/settings/SettingsUi.tsx:210` expr <strong> "Tovu Admin …"
- jini `packages/admin/src/agent-plugins/react/components/AgentPluginFileTree.tsx:5` prop:aria-label <div> "Package files"
- jini `packages/admin/src/media/react/tabs/ProvidersTab.tsx:8` text <p> "Credentials this host uses to generate images and video."
- jini `packages/admin/src/security/react/tabs/RootKeyTab.tsx:9` text <Button> "Start fresh"
- jini `packages/ui/src/features/interactive-ui/providers/shadcn/data-table.tsx:93` prop:aria-label <button> "Next page"
- jini `packages/user-management/src/admin/react/pages/RolesPage.tsx:15` text <Notice> "No roles tabs are enabled."

### version-pin-drift

- tovu code-pin charts-recharts: 0.7.1 vs (no bundle installed) (`apps/website/src/server/runtime/composition/charts-recharts-source.ts:25`)
- tovu dep-not-installed html2canvas-pro: dependencies: 2.4.0 vs  (`apps/admin/package.json`)
- tovu dep-not-installed @jini-ai/ui-kit: devDependencies: ^0.7.0 vs  (`apps/desktop/package.json`)
- tovu dep-not-installed @electric-sql/pglite: dependencies: 0.5.8 vs  (`package.json`)
- tovu dep-not-installed kysely: dependencies: ^0.29.6 vs  (`package.json`)
- jini dep-not-installed @jini-ai/core: devDependencies: workspace:^ vs  (`package.json`)
- jini dep-not-installed jsdom: devDependencies: ^25.0.1 vs  (`packages/chat/package.json`)
- jini dep-not-installed @jini-ai/db: devDependencies: workspace:* vs  (`packages/daemon/package.json`)
- jini dep-not-installed hast-util-from-parse5: devDependencies: 8.0.3 vs  (`packages/platform/package.json`)
- jini dep-not-installed @jini-ai/core: dependencies: workspace:^ vs  (`packages/sidecar/package.json`)

### stale-comments

- tovu `apps/admin/src/App.hooks.ts:54` cites `AssistantDock.hooks.tsx` — missing
- tovu `apps/admin/src/features/providers/Providers.tsx:96` cites `DeveloperApi.tsx` — missing
- tovu `apps/desktop/src/site-dir-store.ts:12` cites `working-directory-store.ts` — missing (historic)
- tovu `apps/website/src/features/post/tiptap-doc-schema.ts:77` cites `render.ts` — missing
- tovu `apps/website/src/server/inbound/admin-http/admin-static.ts:38` cites `apps/admin/dist` — missing
- jini `packages/admin/src/comments/rules.ts:231` cites `Seo.tsx` — missing
- jini `packages/cli/src/command-registry.ts:55` cites `cli.ts` — missing
- jini `packages/commerce/src/payments/kernel.ts:5` cites `state-machine.ts` — missing
- jini `packages/integrations/src/media-providers/dispatch/providers/minimax.ts:4` cites `apps/daemon/src/media/index.ts` — missing (historic)
- jini `packages/ui/src/features/notifications/react/components/NotificationsTab.tsx:66` cites `SettingsDialog.tsx` — missing

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

