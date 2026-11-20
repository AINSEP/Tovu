BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.
You are a refactor programmer (Codex gpt-6.1-sol). Read <repos>/Tovu/AI-Dev-Shop/agents/refactor/skills.md and <repos>/Tovu/AI-Dev-Shop/skills/refactor-patterns/SKILL.md first. You run NO tests.
REPO: your cwd = private Tovu clone, branch codex/tv-hyb, HEAD = Tovu integ/merge-6-2026-11-19 (776ce6d0f). Base for every sheet: **merge-6** (do NOT wait for or merge codex/tv-xd5-render or codex/tv-xd5-publish; the CULL overrides the design on this).
TASK (TOVU ONLY; in this order; no sidekicks/subagents): TV-C3, TV-C1, TV-C2, TV-I18N-PICKER, EXACTLY as the OVER-ENGINEERING CULL (section at the end) defines them. The CULL wins over the design. Jini sheets are not yours.
SHEETS (order, base, STOP):
1. TV-C3 · merge-6 · comment text only in the five files the design lists. STOP a file if its line no longer holds `packages/core/src/settings/express/cms-adapter.ts`. COMMIT-PLAN.md entry "TV-C3".
2. TV-C1 · merge-6 · comment text only: the design's eight table rows + the CULL's `tiptap-text-schema.ts:5` text. STOP a row if the old path is not on that line. COMMIT-PLAN.md entry "TV-C1".
3. TV-C2 · merge-6 · comment text only: three design rows + the CULL's `MenuEditor.tsx:37` text; `site-exporter.ts:219` untouched. STOP a row if the old path is not on that line. COMMIT-PLAN.md entry "TV-C2".
4. TV-I18N-PICKER · merge-6 · files: `apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.tsx`, `apps/admin/src/components/MediaPickerDialog/__tests__/JiniMediaPicker.hooks.unit.test.tsx`. Test first. Do NOT edit `JiniMediaPicker.hooks.ts`. STOP if `sharedComponentsT` is not exported as `t` from `apps/admin/src/components/shared-components-i18n.ts`, if `useAdminLocale` is not exported from `apps/admin/src/hooks/use-admin-locale.hooks.ts`, or if `git grep -n -F '<MediaPickerDialog' -- apps/` shows a production caller passing a prop named `useAdminLocaleHook`. COMMIT-PLAN.md entry "TV-I18N-PICKER".
For comment sheets the validation is an exact text check; the combine mutation restores one old citation.

## NO OVER-ENGINEERING (owner rule, HARD — read before every edit)
- Do EXACTLY what the sheet names. If the sheet does not name it, do not add it.
- No new helpers, wrappers, adapters, ports, interfaces, types, generics, options, config flags or abstraction layers unless the sheet lists them by name.
- No "just in case" code: no extra validation, defensive checks, fallbacks, try/catch, null guards, retries or default values the existing code did not already have.
- No speculative generality: no parameters "for later", no unused exports, no optional args nobody passes, no `_optional` pads.
- Moves are VERBATIM: same statements, same order, same names. Do not rewrite, rename, "clean up", reformat or modernize code you move or touch.
- Tests: only the cases the sheet lists (+ the named mutation). No extra test scaffolding, fixtures or factories beyond what those cases need.
- Comments: keep existing why-comments verbatim; add NO new comments except where the sheet gives the exact text.
- Smallest diff that satisfies the sheet. If something seems to need more, STOP that step and report it instead of building it.
- Before finishing, re-read your diff and DELETE anything not required by the sheet. List any deletions in COMMIT-PLAN.md.

## OWNER RULES (HARD)
Behaviour identical except the stated bug fix (failing test first); API args (required, optional = {}) for NEW functions only, framework-dictated signatures exempt; every custom hook injected as a prop defaulted to the real hook; no re-export shells (delete + repoint); no new deps; no new eslint-disable/@ts-ignore/as any/as never; functions <= 50 lines, complexity <= 10 (hard). A file over 500 lines is NOT a stop reason (note it in COMMIT-PLAN.md and continue). Errors never generic: plain words + redacted details. No product names (Tovu, tovu.dev) anywhere in Jini; no vendor code in Jini core; never raise a debt number. STOP a sheet (continue the others) if a named declaration or anchor is missing, an unlisted PRODUCTION importer appears (`git grep -n -F '<symbol>' -- apps/ development/ packages/`; unlisted TEST importers needing only the same repoint are fine, record in REFRESH.md), a cast is needed, or a function limit is exceeded. MACHINE RULE: no other repo-wide scans; NO tests, builds, installs, type-checks, linters (the combine runner runs them and the named mutations); no codebase-memory-mcp; .git read-only; COMMIT-PLAN.md at repo root with ONE entry per sheet (sheet id, base, files touched, test added, mutation owed, deletions).

## REPORT (<= 300 words)
Per sheet: DONE / STOPPED (reason). Files touched. Anything you deleted from your own diff.

## DESIGN (Codex 6.2, r62t-hygiene-b) — context only; the CULL below wins
# r62t-hygiene-b · Merge-6 disposition

I verified the Tovu base `776ce6d0f` and the Jini base `d3e78b387`. The dispatch explicitly superseded the missing `AI-Dev-Shop/AGENTS.md` bootstrap for this clone. No files were changed. I ran no tests, builds, installs, type-checks, or linters.

Five sheets are ready. The Recharts version mismatch, Lexical removal, named backup file, and ChatFab locale gap are already resolved on merge-6. All 1,005 missing-key rows in the fresh audit are scanner false positives for the reported locale and key. The open i18n work is in JSX copy.

## Disposition

| ID | Status | Evidence or decision |
|---|---|---|
| TV-I18N-MISSING | RETIRE | 962 rows misread the deployment audit dictionary. The other 43 keys already exist in their reported locale through `translationEntry({ source, translated })`. Evidence below. |
| TV-I18N-FAB | RETIRE | `apps/admin/src/components/ChatFab/ChatFab.tsx:69–71` supplies both `open` and `close` templates for `hi`, `ur`, and `bn`. `fabActionLabel:76` reads those templates. |
| TV-I18N-PICKER | READY-FOR-CODEX | The Jini-backed media picker error button can use the same existing `Cancel` translation as the legacy picker. |
| TV-I18N-LITERALS | RETIRE | Eight rows identify two `Tovu` labels (`App.chrome.tsx:152`, `Login.tsx:36`), a CSS unit (`DevicePreviewToggle.tsx:49`), an HTML example (`MediaContentEditor.tsx:326`), the React name and bundle sizes (`VisitorAssistantPanel.tsx:93–94`), the URL field label (`MenuEditor.tsx:102`), and the literal `admin` username (`CreateSiteOnboarding.tsx:320`). |
| TV-I18N-REVIEW | OPUS-CLOUD · PARTIAL | Ten remaining admin JSX rows. Check for matching translations, then supply reviewed values in all locales wherever copy is missing. The copy inventory is below. |
| J-I18N-JSX | OPUS-CLOUD · PARTIAL | 260 candidates across 68 files. The packages have different copy injection mechanisms. Each file needs an identified mechanism, exact keys, and existing translations or reviewed new ones. |
| TV-RECHARTS | RETIRE | `b4401819cf` pins the approved browser provider and its full integrity map to published `0.7.1`. `package.json:161` and `package-lock.json:3471–3474` agree. `rechartsSourceDir:122` reads the pinned path using the package’s `./catalog` export. `recharts-package-pin.unit.test.ts:31–43` checks directory presence and the packaged map. The fresh “no bundle installed” row is from the clone without dependencies. |
| J-PROVIDER-VERSIONS | RETIRE | The old `0.6.24` directories were generated output. `packages/provider-plugins/.gitignore` excludes `/plugins/`. `scripts/build.ts:150–156,222–229` reads the destination package’s version and writes it into both the artifact manifest and directory. The package and tracked `catalog.json` say `0.7.1`. |
| J-LEXICAL-SOURCE | RETIRE | `0bf610e75` removed the feature directory, package export and browser entry, capability and API documentation, index references, Vitest entry, and hardwiring debt. Exact checks found no consumers on either base. Jini’s `packages/ui/README.md:383` records the deletion as history. Tovu’s two references are in old development briefs. |
| J-LEXICAL-DEPS | RETIRE | `0bf610e75` also removed the dependencies and lockfile entries. `packages/ui/package.json` and `pnpm-lock.yaml` have no matching Lexical entries. |
| TV-JUNK | RETIRE | `b0a412fffc` deleted `apps/website/src/features/publish-content/__tests__/apply-loop.test.ts-e`. The tracked-file suffix check returned zero matches. |
| J-JUNK | RETIRE | The tracked-file suffix check returned zero matches. |

### Stale comment targets

Counts are occurrences in the grouped TSV, excluding `historic=yes` and `line-beyond-eof`. A few remaining rows also describe history or generated layout, as shown below. `PARTIAL` identifies work left without an executable sheet.

| ID / dead target | Hits | Status | Evidence or remaining work |
|---|---:|---|---|
| TV `render.ts` | 105 | PARTIAL | `628cdb6d35` renamed the entry point to `render-site.ts` after the defining modules were split. Bare citations point to multiple owners. Resolve each caller’s cited symbol after `tv-xd5-render` and `tv-xd5-publish`. |
| TV `lib/api.ts` | 60 | PARTIAL | `317ad98798`, `cc7fb84240`, and `fe56e01124` moved sites, security, and deployment into different clients. Map the cited calls individually. The generic Vite comment can refer to the admin HTTP clients once its context is reviewed. |
| TV `apply-loop.ts` | 25 | PARTIAL | `051f7845ef` split the file into seven modules. `tv-xd5-publish` still contains both comment and runtime string hits. Map the comments to the combined owners after that branch and the publish re-sheets. |
| TV `AssistantDock.hooks.tsx` | 18 | PARTIAL | `AssistantDock.state.hooks.ts` and the feature’s `hooks/` directory contain distinct successors. Classify the 18 citations before proposing replacements. |
| TV `project-delete-guard.ts` | 16 | PARTIAL | Deletion now calls Jini `mayEraseDirectory` (`project-ipc.delete.ts:116`), while rename uses `readDirectoryIdentity` (`project-ipc.rename.ts:27`). `tracked-sites.ts:333` also cites the retired `readSiteIdentity` name. A blanket path replacement would misdirect some citations. |
| TV `apps/admin/dist` | 13 | RETIRE | Built bundle path. `admin-static.ts:38` and `apps/desktop/scripts/stage-payload.ts:19` describe the build output. |
| TV `port.hooks.ts` | 11 | PARTIAL | Bare references point to feature-specific port modules. For example, the pages and integrations callers cite different ports. |
| TV `@jini-ai/agent-plugins/github/deployments/github.mjs` | 9 | PARTIAL | Verify the current provider entry and the exact deployment declarations it supplies. |
| TV full public `render.ts` path | 9 | READY-FOR-CODEX | `TV-C1` covers the explicit references. |
| TV `server/app.ts` | 9 | RETIRE | The current composition file is `server/runtime/composition/app.ts`. The flagged references record the former analytics stub and the removed site-export dependency cycle. Preserve the historical paths in `config.settings.ts:16,80,172`, `export-run.ts:30`, `static-publish/adapter.ts:38–39`, and `memory-deps/route-deps/publish-export.ts:42,48`. |
| TV `sites/tovu-com/content.db` | 7 | PARTIAL | Classify the permission and SQLite example paths as historical, runtime, or stale before changing them. |
| TV `DeveloperApi.tsx` | 6 | RETIRE | `Providers.tsx:33–43,78,96,107,305` records the retired page and the code it contributed. The `panels.tsx:810` reference is to that retirement. |
| TV `apps/admin/src/lib/api.ts` | 6 | PARTIAL | Same client split as the bare-path group. The Vitest citation at `apps/admin/vitest.config.ts:109` is generic. Resolve the other five against their features. |
| TV `build-preview.mjs` | 6 | PARTIAL | The comment contexts describe the theme preview build. Candidate neutral wording is “the theme preview build.” The generator successor and pushed-branch overlap in `routes/themes/explore.ts` need verification. |
| TV `apps/site-chat/dist` | 5 | RETIRE | Built bundle path. `site-chat-static.ts:7–14` describes the Vite output, and `stage-payload.ts:19` names it for packaging. |
| TV `mcp-federation/trust.ts` | 5 | PARTIAL | Jini `packages/mcp/src/federation/trust.ts` is the successor. `external-mcp-i18n.ts:21` names the removed `refusalForRemoteToolHints`. `external-mcp-tool-picker-rules.ts:36` describes an earlier refusal rule, while current Jini has separate confirmation and write-grant logic at `trust.ts:329,494`. Verify those two claims before repointing the group. |
| TV `packages/commerce/src/store/store-plugin.ts` | 5 | PARTIAL | The claims refer separately to product and order tables, checkout, activation, and `listProducts`. Verify each successor, including the `panels.tsx` claims about the old flows. |
| TV `packages/core/src/settings/express/cms-adapter.ts` | 5 | READY-FOR-CODEX | `TV-C3` repoints to Jini’s `packages/core/src/settings/cms-adapter.ts:42`. |
| TV relative public `render.ts` path | 5 | READY-FOR-CODEX | `TV-C2` covers four live citations and preserves the fifth, which records the old `safeHref` copy. |
| J `render.ts` | 51 | PARTIAL | CMS widget, SEO, presentation, and host renderer references share the basename. Resolve by symbol. |
| J `SettingsDialog.tsx` | 30 | RETIRE | Upstream UI provenance. For example, `packages/ui/src/features/about/types.ts:2,117` identifies the original About panel and update toggle. |
| J `WorkspaceTabsBar.tsx` | 12 | RETIRE | Upstream UI provenance. `packages/ui/src/features/tab-strip/react/components/TabStrip.tsx:36–44` identifies what came from the original workspace tab strip. |
| J `PluginsView.tsx` | 10 | PARTIAL | References span source-config components and shared React primitives. Verify the provenance wording in the primitives before closing the group. |
| J `SkillsSection.tsx` | 9 | RETIRE | Upstream UI provenance. `packages/ui/src/features/skills/rules.ts:2,269,281,295,303` identifies the original code and inline helpers. |
| J `FileWorkspace.tsx` | 8 | RETIRE | Upstream UI provenance identified alongside `WorkspaceTabsBar.tsx` in `TabStrip.tsx:36–37`. |
| J `lipay-plugin.ts` | 8 | PARTIAL | `payments/contract/evidence.ts:5` records an old bug. `contract/provider.ts:3`, `kernel.ts:6`, and `state/status.ts:12` speak about the L4 split in the future tense. Resolve the stale prospective references against the L4 owners and preserve the bug history. |
| J `apps/daemon/src/routes/chat.ts` | 7 | PARTIAL | `daemon/src/http/model-proxy.ts:10,311` explicitly cites Open Design precedent. Verify the five provider citations before closing the group as provenance. |
| J `server/deps.ts` | 7 | PARTIAL | Some comments identify historical composition and in-memory storage choices. Others describe present seeding or registration. Verify current call sites before changing them. |
| J `server/index.mjs` | 7 | RETIRE | Plugin artifact layout. `packages/plugins/src/host/node/install.ts:175` validates the entry and `loader.ts:38–39` documents where it resides. |
| J `EntryShell.tsx` | 6 | PARTIAL | Source-config and onboarding provenance. Verify the original-shell references in the three React primitives. |
| J `packages/sha256` | 6 | RETIRE | Workspace runtime layout. `packages/agent-plugins/src/lifecycle/install.ts:48` describes the content-addressed path and `layout-b-persistent-state.unit.test.ts:73–75` uses it. |
| J `server/app.ts` | 6 | PARTIAL | The comments describe Tovu composition, historical analytics wiring, and an anticipated resolver registration. Verify current ownership per occurrence. |
| J `src/origin` | 6 | PARTIAL | `packages/cms/src/seo/absolute-url.ts:19–24` distinguishes the landed Tovu origin feature from the still-unwired shared routing seam. Preserve the quoted history and verify the four prospective routing and redirect references before updating them. |
| J relative host `render.ts` path | 6 | READY-FOR-CODEX | `J-C1` repairs the five live references and preserves the historical comparison in `InteractiveHtmlEditor.tsx:50`. |
| J `DesignSystemFlow.tsx` | 5 | PARTIAL | `file-dropzone/types.ts:7` is explicit upstream provenance. Verify the other four across revision review, preview, and file transfer. |
| J `McpClientSection.tsx` | 5 | RETIRE | Upstream UI provenance. `packages/ui/src/features/external-mcp/constants.ts:2` identifies Open Design’s original MCP fields, and the source-config comments describe how those fields were incorporated. |
| J `apps/web/src/components/PreviewDrawOverlay.tsx` | 5 | RETIRE | Upstream UI provenance. `annotation-canvas/drawing.ts:9–10` records the original path and archived source-map revision. |
| J `apps/web/src/providers/daemon.ts` | 5 | PARTIAL | `packages/chat/src/core/transport.ts:19` names the upstream branch. Verify which of the four agent-runtime references still describe the transcript producer before changing them. |
| TV targets with fewer than five hits | 271 | PARTIAL | 206 target groups. A bundled replacement list would need individual validation. |
| J targets with fewer than five hits | 255 | PARTIAL | 191 target groups. Same constraint. |
| Both repos · line citations beyond EOF | 5 | PARTIAL | Separate from missing paths. Three are nonhistorical and need declaration-level destinations. Preserve the two historical rows. |

### Locale evidence and translation handoff

The high-confidence deployment examples are `en / entries`, `it / Credential`, and `ar / Published:`. At `deployment-i18n.tsx:1759–1764`, `auditTranslationEntries` checks the locale array length and zips its values to `Object.keys(DEPLOYMENT_AUDIT_STRINGS)`. The scanner treated the argument’s property `entries` as a translation key. English points to `DEPLOYMENT_AUDIT_STRINGS` at line 1768. Italian and Arabic supply the values by position at lines 1779–1781 and 1803–1805. The dictionary merge at 2268–2279 uses those resolved entries.

I checked the remaining 43 locale/key pairs. Each uses the current object-argument `translationEntry` helper, which returns the source-keyed entry at `apps/admin/src/lib/translation-entry.ts:11`. Concrete examples include `AUTH_DICT` Spanish `Password` at `auth-i18n.ts:8`, dashboard Japanese password advice at `dashboard-i18n.ts:1056`, and Thai `Owner password` at `deployment-i18n.tsx:1274`. The same pattern accounts for the remaining site-transfer, users, password-field, and reset-info rows. No translation pass is needed for the missing-key TSV.

For the **Tovu JSX translation pass**, start from these exact UI sites and preserve the variables in the translated template. Key text below is the source text or template to verify against the feature dictionary.

| Site under `apps/admin/src/` | Copy to verify |
|---|---|
| `features/authentication/Authentication.tsx:90` | `{provider} authentication setup` |
| `features/collections/ContentTypeFieldsSection.tsx:48`, `NewContentTypeDialog.tsx:48` | `e.g. prep_time`, `e.g. recipe`. Preserve the identifier examples. |
| `features/redirects/redirects-i18n.tsx:741` | Required/optional field help containing `matchType`, `fromPattern`, `toTarget`, `statusCode`, `override`, and `priority`. Verify the existing localized fragments before requesting a new key. |
| `features/security/AccessTokensTab.tsx:800,885` | The full token-add accessibility label at 800 and `required` at 885. Authentication already supplies `required`; verify all locales before copying it into the security feature. |
| `features/settings/ExternalMcpSettingsPanel.tsx:357,360` | `Open tool permissions for {name} — {count} enabled`. The ARIA label and agent label use the same copy. |
| `features/settings/SettingsUi.tsx:210` | The title template beginning `Tovu Admin`. Preserve the product name and runtime value. |
| `features/taxonomy/Taxonomy.tsx:830` | `{term}, subcategory of {parent}` |
| `lib/media-embed-extension.tsx:115` | `Your browser does not support the video tag.` |

For **Jini**, `audit-m6/hygiene/i18n-hardcoded-jsx.tsv` gives the exact file, line, JSX slot, and source text. The existing mechanisms are local to their features. For example, `packages/ui/src/renderers/react/i18n.tsx` takes a host dictionary and provides `useT`, and `packages/ui/src/features/panel-kit/hooks/__tests__/injected-copy.test.ts` demonstrates a caller-supplied `translate` option. Neither establishes a provider for the audited security `AccessTokensTab`, media `ProvidersTab`, user-management `UsersTab`, or shadcn `DataTable`. Those components have literal copy and no translator at the inspected render sites. The Jini translation handoff still needs a per-feature route through existing copy wiring and an exact list of keys without matching translations. A common provider or new generic copy layer would exceed this dispatch. Every eventual JSX sheet owes a Chrome look.

### Environment names

The nine groups below use the supplied H2 environment triage and the env-schema design. The schema and `ex-env*` work remain on owner hold. No env sheets.

| ID | Status | Owner question and recommendation |
|---|---|---|
| ENV-SCHEMA | OPUS-CLOUD · HELD | Keep `ex-env*` parked. Fresh audit counts are evidence for that design, with no rename authorized here. |
| ENV-1 | NEEDS-DECISION | Keep both stdin EOF variables? **Yes.** `TOVU_STOP_ON_STDIN_EOF` addresses the site child and `JINI_STOP_ON_STDIN_EOF` addresses the daemon child. The env plan records the two bindings at §2.7. |
| ENV-2 | NEEDS-DECISION | Adopt one operator-facing site-switching setting? **Yes.** Use `TOVU_ENABLE_SITE_SWITCHER` for operator policy and preserve the distinct launcher and binding flags until their callers can be migrated together. |
| ENV-3 | NEEDS-DECISION | Unify the four PID names? **Keep them role-specific.** `TOVU_PARENT_PID`, `TOVU_DESKTOP_OWNER_PID`, `TOVU_LOCAL_SITE_OWNER_PID`, and `TOVU_DEV_SUPERVISOR_PID` name different process relationships. |
| ENV-4 | NEEDS-DECISION | Choose one canonical public origin and define each other origin’s role? **Yes.** Use `TOVU_PUBLIC_URL` for the public address and document the precedence of listener, callback, share, desktop, and dev/bundle values at the host boundary. |
| ENV-5 | NEEDS-DECISION | Rename the desktop owner sign-in value to identify it as a capability? **Yes, in the held migration.** Keep `TOVU_DEV_OWNER_SIGNIN` as the Boolean switch and preserve consume-at-import handling for the desktop capability. |
| ENV-6 | NEEDS-DECISION | Make the database mode and path names explicit? **Yes.** Recommend `TOVU_DB_MODE` for the selector, with compatible parsing during migration. Keep the content, chat, and journal paths distinct. |
| ENV-7 | NEEDS-DECISION | Merge the two daemon token names? **Keep both.** They cross distinct boundaries, site-to-daemon and daemon-to-bridge. Document each boundary without coupling the credentials. |
| ENV-8 | NEEDS-DECISION | Standardize runtime Postgres names without changing fixture or socket semantics? **Yes.** Keep `JINI_PG_*` at the Jini host, libpq `PG*` names in the fixtures, and the Tovu socket setting at Tovu’s host boundary. |
| ENV-9 | NEEDS-DECISION | Prefix the analytics seed and comments salt with `TOVU_`? **Yes, in the held migration.** Carry the old names as compatibility inputs for existing deployments. |

### Other owners and holds

| Item | Disposition |
|---|---|
| T-PO-02 cover image | OWNED-ELSEWHERE `r62t-resheet` |
| a49 S1 | OWNED-ELSEWHERE `r62t-resheet` |
| a59 S2 | OWNED-ELSEWHERE `r62t-resheet` |
| A66 | OWNED-ELSEWHERE `r62t-resheet` |
| a10 S2/S3 | OWNED-ELSEWHERE `r62t-resheet` |
| B01 J | OWNED-ELSEWHERE `r62t-resheet` |
| Optional loaders | OWNED-ELSEWHERE `r62t-resheet` |
| G-TESTS-0 ratchet | OWNED-ELSEWHERE `r62t-resheet` |
| Lost-updates S13 | OWNED-ELSEWHERE `r62t-resheet` |
| Lost-updates S0–S12 halves | OWNED-ELSEWHERE `r62t-resheet` |
| Publish P0.4/P0.7/P0.8-rest | OWNED-ELSEWHERE `r62t-resheet` |
| Size 02 steps 5–7 | OWNED-ELSEWHERE `r62t-resheet` |
| S6c | OWNED-ELSEWHERE `r62t-resheet` |
| Security A06/A51/A50 | OWNED-ELSEWHERE `r62t-resheet` |
| Desktop 1 | OWNED-ELSEWHERE `r62t-resheet` |
| Non-UI size and complexity | OWNED-ELSEWHERE `fn50` / `c6fix` |
| 424 admin UI size cases | TABLED |
| a09 | HELD on chat redaction |
| R4/C-CHAT-DEPS | HELD on chat redaction |
| G-TESTS T0 | HELD on chat redaction |
| Run-finalizer B1 | HELD on chat redaction |
| L7a | HELD on chat redaction |
| Redaction redesign | OWNED-ELSEWHERE `r62t-redact` |
| AG-UI | OWNED-ELSEWHERE `r62t-agui` |
| ACP | OWNED-ELSEWHERE `r62t-acp` |
| Agent-plugin routing | OWNED-ELSEWHERE `r62t-routing` |
| §C Tovu | OWNED-ELSEWHERE `r62t-rules-tovu` |
| §C Jini names and IDs | OWNED-ELSEWHERE `r62t-rules-jini-a` |
| §C remaining Jini rules | OWNED-ELSEWHERE `r62t-rules-jini-b` |
| Hardwiring, L7 CSS tokens, log safety, env-access ledgers | OWNED-ELSEWHERE `r62t-hardwire` |
| Admin, desktop, and site-chat error gate | OWNED-ELSEWHERE `r62t-debt-a` |
| Website features, assistant, CLI, and contracts error gate | OWNED-ELSEWHERE `r62t-debt-b` |
| Website server and platform error gate | OWNED-ELSEWHERE `r62t-debt-c` |
| Jini error gate | OWNED-ELSEWHERE `r62t-debt-jini` |
| §D structure | OWNED-ELSEWHERE `r62t-struct` |
| §E tests | OWNED-ELSEWHERE `r62t-tests` |
| §H bug classes and §H2 verified bugs | OWNED-ELSEWHERE `r62t-hygiene-a` |
| §N, per-CLI/vendor folders, and model IDs | OWNED-ELSEWHERE `r62t-practice` |
| `todos.md` §L | PARKED |

## READY execution sheets

**Shared brief for every sheet and batch.** Behavior identical except for the named localization. New functions use `(required, optional = {})`, with framework-dictated signatures exempt and no unused argument pads. No re-export shells, new dependencies, new `eslint-disable`, `@ts-ignore`, `as any`, or `as never`. Functions ≤50 lines and complexity ≤10. Record a file over 500 lines in root `COMMIT-PLAN.md` and continue. STOP the affected sheet and continue the others for a missing named declaration, a needed cast, an exceeded function limit, or an unlisted production importer. Check named symbols with exact `git grep -n -F` in the specified app, development, or package scope. Record any unlisted test importer that only needs the same repoint in `REFRESH.md`. No other repo-wide scans, tests, builds, installs, type-checks, linters, or codebase-memory-mcp. `.git` read-only under the machine brief. Hooks are injected as props. Vendor code belongs in provider packages. Jini domain code stays framework-independent. A lockfile change, new dependency, or new Jini package goes to OPUS-CLOUD.

Make exactly the listed edits. No additional helpers, wrappers, ports, types, options, validation, defaults, or other abstractions. Moves and existing why-comments stay verbatim. For the comment sheets, change the named citation text only. Use only the named test cases and mutations. Re-read the diff, remove any extra changes, and list deletions in `COMMIT-PLAN.md`. Record the named mutation for the combine verifier. For every comment sheet, the validation is an exact text check in the listed comments. The mutation restores the old citation at one edited occurrence and makes that check fail. No test file, production declaration, importer, export, debt row, or Chrome/Electron look applies to a comment-only sheet.

### J-C1 · Host renderer references

**Jini · base `d3e78b387` · 1,400 executor tokens.** No pushed Jini branch touches these five files. The verified host successors include the split renderer, the contact-form widget renderer, and the render context. The Jini comments can identify them by their role.

| File on base | Exact replacement |
|---|---|
| `packages/cms/src/widgets/html/html-embeds.ts:351` | Replace `(the host app's \`src/server/inbound/public-http/http/site/render.ts\`)` with `(in the host renderer)`. |
| `packages/cms/src/widgets/post-embed-resolution.ts:48` | Replace `the host app's \`src/server/inbound/public-http/http/site/render.ts\`` with `the host renderer`. |
| `packages/cms/src/widgets/resolvers/contact-form.ts:96` | Replace `the host app's \`src/server/inbound/public-http/http/site/render.ts\`'s \`renderWidgetContactForm\`` with `the host app's \`renderWidgetContactForm\``. |
| `packages/commerce/src/catalog/storefront.ts:8,56` | Replace `(the host app's \`src/server/inbound/public-http/http/site/render.ts\`)` with `(defined in the host render context)`. |

Preserve the historical trace at `packages/admin/src/react/components/InteractiveHtmlEditor/InteractiveHtmlEditor.tsx:50`. STOP if the combined source changes the meaning of any of the five live references.

### TV-C1 · Full public renderer path

**Tovu · base merge-6 after `origin/codex/tv-xd5-render` and `origin/codex/tv-xd5-publish` · 1,700 tokens.** The former supplies the combined renderer, and the latter touches `features/theme/theme.ts` with the old citation still present.

Let `S` denote the literal `apps/website/src/server/inbound/public-http/http/site/`. Replace the full `S` + `render.ts` citation at these base lines with `S` + the listed destination. Paths in this table are under `apps/website/src/` unless they begin with `apps/`.

| Base location | Destination suffix |
|---|---|
| `apps/admin/src/lib/post-title-extension.ts:35` | `render/doc/doc-nodes.ts` |
| `features/pages/skeleton.ts:5` | `render-site.ts` |
| `features/post/agent-tools.ts:97` | `render/content-html.ts` |
| `features/theme/theme.ts:7` | `render-site.ts` |
| `server/inbound/public-http/middleware/site-chat-static.ts:15` | `render-site.ts` |
| `server/inbound/public-http/middleware/theme-preview-static.ts:15` | `render-site.ts` |
| `server/inbound/public-http/middleware/theme-static-assets.ts:17` | `render-site.ts` |
| `server/runtime/configuration/seed.ts:39` | `render/doc/doc-nodes.ts` |

At `features/post/tiptap-text-schema.ts:5`, replace the exact fragment `` `Srender.ts`'s `renderDocNode`/`renderMarks` `` with `` `renderDocNode` (`Srender/content-html.ts`)/`renderMarks` (`Srender/doc/marks.ts`) ``, expanding `S` as above. STOP if `renderDocNode`, `renderMarks`, or the documented render branch has moved again on the combined base.

### TV-C2 · Relative public renderer path

**Tovu · base merge-6 after `origin/codex/tv-xd5-render` and `origin/codex/tv-xd5-publish` · 1,300 tokens.** The latter touches `site-exporter.ts` and the historical citation is still present in its snapshot.

Replace `server/inbound/public-http/http/site/render.ts` at the four named comment sites. Preserve the relative spelling by using the same prefix followed by the specified suffix.

| Base location | Destination suffix |
|---|---|
| `apps/admin/src/features/menus/MenuEditor.tsx:37` | `render/widgets/menu.ts` |
| `apps/admin/src/lib/media-embed-extension.tsx:11` | `render/doc/nodes-media.ts` |
| `apps/admin/src/lib/media-image-extension.tsx:14` | `render/doc/doc-nodes.ts` |
| `apps/website/src/features/media/import-media-entity.ts:22` | `render/doc/doc-nodes.ts` |

Preserve `apps/website/src/features/site-export/site-exporter.ts:219`. It documents where the retired `safeHref` lived. STOP if the combined renderer moves the menu, media node, or image-node dispatch to another defining module.

### TV-C3 · Settings CMS adapter path

**Tovu · base `776ce6d0f` · 1,000 tokens.** No pushed branch overlaps these five edit sites. Jini merge-6 already contains `packages/core/src/settings/cms-adapter.ts:42`.

Replace `packages/core/src/settings/express/cms-adapter.ts` with `packages/core/src/settings/cms-adapter.ts` in these comments:

- `apps/website/src/features/settings/site-title-write.ts:145`
- `apps/website/src/server/inbound/admin-http/routes/settings/get-effective.ts:8`
- `apps/website/src/server/inbound/admin-http/routes/settings/get-raw.ts:16`
- `apps/website/src/server/inbound/admin-http/routes/settings/reset.ts:23`
- `apps/website/src/server/inbound/admin-http/routes/settings/shared.ts:169`

STOP if `createCmsSettingsService` is absent at that Jini destination or the combined Tovu routes delegate their CMS policy elsewhere.

### TV-I18N-PICKER · Media picker error Cancel

**Tovu · base `776ce6d0f` · 2,300 tokens.** No pushed Tovu branch touches `apps/admin/src/components/MediaPickerDialog/`. The existing `sharedComponentsT` translator falls through to `COMMON_I18N`, which has `Cancel` for all 21 non-English admin locales. The legacy component already uses this mechanism through its controller.

**Test first.** In `apps/admin/src/components/MediaPickerDialog/__tests__/JiniMediaPicker.hooks.unit.test.tsx:10`, extend `retains the API incident with redacted picker evidence and a cancel action`. Pass `useAdminLocaleHook: () => "es"` in the `renderHook` props, retain the redaction and incident assertions, and assert the button by accessible name `Cancelar`. Keep the cancellation test at line 23. Mutation for combine verification is to restore `Cancel` in the JSX branch. The same locale case must fail.

**Named edits.** All files below are under `apps/admin/src/components/MediaPickerDialog/`.

- `MediaPickerDialog.tsx:53`, `MediaPickerDialogProps`. Add only `useAdminLocaleHook?: typeof useAdminLocale`, with `import type { useAdminLocale } from "../../hooks/use-admin-locale.hooks";`. At the error button in `MediaPickerDialog:149–151`, replace the child `Cancel` with `{vm.cancelLabel}`. Keep the existing `onClick={vm.onCancel}`.
- `JiniMediaPicker.hooks.ts:13`, `useJiniMediaPicker`. Add `import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";` and `import { t as sharedComponentsT } from "../shared-components-i18n";`. Read `const { useAdminLocaleHook = useAdminLocale } = props;` and `const locale = useAdminLocaleHook();` unconditionally in the existing hook. Add `cancelLabel: sharedComponentsT({ locale, key: "Cancel" })` to its existing return object. This uses the same host locale cache as the legacy controller. The localized label is the only new return field.
- The existing `useJiniMediaPicker` imports at `MediaPickerDialog.tsx:2` and `__tests__/JiniMediaPicker.hooks.unit.test.tsx:4` stay on `"./JiniMediaPicker.hooks"` and `"../JiniMediaPicker.hooks"` respectively. The component import in the test at line 5 stays on `"../MediaPickerDialog"`. There is no package export, dictionary entry, manifest change, or debt-row change.

STOP if another production caller injects a picker result that would require a return-shape change, locale selection requires another options layer, or the existing common dictionary loses `Cancel` for any supported locale. **Chrome look owed** after combine. Compare the picker error Cancel button in Spanish and English, and dismiss it in each locale.

## Batch order

These are add-on queues for the coordinator’s 6–8 sheet jobs. There is one ready Jini sheet and four ready Tovu sheets, so neither queue is large enough for a standalone job under the requested batch size.

| Queue | Base and execution order | Incremental executor budget |
|---|---|---:|
| Jini first | Merge-6 `d3e78b387`. Append `J-C1` to a Jini job with 5–7 compatible sheets. The eight listed Jini pushed refs have no overlap with the named edits. | 1,400 tokens |
| Tovu second | Merge-6 `776ce6d0f`. Append `TV-C3` → `TV-C1` → `TV-C2` → `TV-I18N-PICKER` to a Tovu job with 2–4 compatible sheets, on one branch after `origin/codex/tv-xd5-render` and `origin/codex/tv-xd5-publish`. `TV-C3` uses the Jini merge-6 adapter path and has no dependency on `J-C1`. | 6,300 tokens |

## Partial coverage

The tables identify each unresolved large comment target, the small-target counts, and the remaining JSX copy. I went past the targeted lookup budget across source and ref checks, then stopped further lookups. The partial items still need occurrence-level evidence or all-locale translation inventory. The Recharts conclusion verifies the checked-in approval, package version, catalog, and lockfile on merge-6. The packaged browser bytes and Chrome behavior remain combine verification.

## OVER-ENGINEERING CULL (Opus) - WINS
# Cull of r62t-hygiene-b (stale comments, translations, pins, dead editor, junk, env names)

Input `cull-inputs/designs/r62t-hygiene-b.md`. Base Tovu `776ce6d0f` (merge-6), Jini `d3e78b387` (merge-6). Read-only; checked with `git show`, single-symbol `git grep`, `git ls-tree` and `merge-base`.

**Counts (5 READY sheets):** **KEEP 2** (J-C1, TV-C3) · **CUT-TO 3** (TV-C1, TV-C2, TV-I18N-PICKER) · DROP 0 · **NEEDS-DECISION 10** (9 env + 1 scanner) · CLOUD 2 (TV-I18N-REVIEW, J-I18N-JSX copy passes) · BLOCKED 0. Agree with every RETIRE row.

## The ~1,005 missing-translation rows: scanner misreads, not missing copy (verified)
- **962 high-confidence rows** (`deployment-i18n.tsx`, dict line 1767, 48 rows × 20 locales, plus `en`/`es` `entries`). The locales are built as `auditTranslationEntries({ entries: [ … ] })` (`deployment-i18n.tsx:1759–1765`). That zips a positional array onto `Object.keys(DEPLOYMENT_AUDIT_STRINGS)` and **throws at module load** if the length is wrong, so a missing value cannot ship. The scanner reads the argument name `entries` as the only key.
- **43 low-confidence rows** (users 24, site-transfer 10, dashboard 5, deployment 2, auth 2). Each value is present as `...translationEntry({ source, translated })` (`lib/translation-entry.ts:11`). Checked: users `ja`/`th` "Reset password" at `users-i18n.ts:662,1124`, and auth `es` "Password" at `auth-i18n.ts:8`. The spread hides the key from the scanner.
- Result: **0 real missing keys.** No translation pass for this TSV.

## Verdicts

| Sheet | Verdict | Base | Reason |
|---|---|---|---|
| J-C1 host renderer refs (Jini) | **KEEP** | merge-6 | The five comment sites are as cited (`html-embeds.ts:351`, `post-embed-resolution.ts:48`, `resolvers/contact-form.ts:96`, `storefront.ts:8,56`). The replacements are neutral and use no product name. `renderWidgetContactForm` still exists (Tovu `render/contact-form-widget.ts:48`). |
| TV-C1 full renderer path (Tovu) | **CUT-TO** | **merge-6** (not "after xd5-render/publish") | Neither branch is in merge-6 (`merge-base --is-ancestor` false, 4 commits each). Waiting buys nothing, and one destination is wrong after the wait: `origin/codex/tv-xd5-render` **deletes** `render/doc/marks.ts` (`renderMarks` moves to `@jini-ai/cms/html/document-marks`), so the sheet's own STOP would fire. Do it on merge-6. `tiptap-text-schema.ts:5` names the symbols without paths. The other 8 destinations exist on merge-6 and survive the render branch (`render-site.ts`, `content-html.ts`, `doc/doc-nodes.ts`, all M not D). `theme.ts:7` is a one-line comment overlap with tv-xd5-publish (same old text there); the combine takes ours. |
| TV-C2 relative renderer path (Tovu) | **CUT-TO** | **merge-6** | Same reasoning. tv-xd5-render **deletes** `render/widgets/menu.ts` (`renderWidgetMenu` moves to `@jini-ai/cms/navigation/menu-render`). `MenuEditor.tsx:37` cites the symbol, not a path. The other three destinations survive. |
| TV-C3 settings adapter path (Tovu) | **KEEP** | merge-6 | All five cite the removed Jini `settings/express/cms-adapter.ts`. `createCmsSettingsService` is at Jini `core/src/settings/cms-adapter.ts:42`. |
| TV-I18N-PICKER (Tovu) | **CUT-TO** | merge-6 | Bug confirmed (BUGS 1). The design changes two files and adds a hook return field (`cancelLabel`). Smaller: inject the locale hook into the one component that renders the button and translate there. No change to `useJiniMediaPicker`. The existing test already renders `MediaPickerDialog`. |
| TV-I18N-MISSING | agree RETIRE | — | Verified above. |
| TV-I18N-FAB, -LITERALS, TV-RECHARTS, J-PROVIDER-VERSIONS, J-LEXICAL-*, TV-JUNK, J-JUNK | agree RETIRE | — | Pins: only one non-`dep-not-installed` row (`charts-recharts-source.ts:25`, 0.7.1). It matches `package.json:161` `@jini-ai/provider-plugins: "0.7.1"`; the row comes from a clone with no install. Lexical: none in Jini `packages/ui` tree or `package.json`. Junk: zero tracked `*.orig/.bak/.rej/-e/~/.swp` in both repos. |
| Stale-comment PARTIAL/RETIRE groups | agree | — | No blanket replacements. Every group needs per-symbol checks. |
| TV-I18N-REVIEW (10 rows), J-I18N-JSX (260) | **CLOUD** (Opus copy pass) | — | Needs reviewed copy in 21 locales and a Chrome look. Cut from any future sheet: a "common provider or generic copy layer" in Jini. Use each feature's existing copy wiring. |
| ENV-SCHEMA, ENV-1…9 | NEEDS-DECISION (held) | — | See below. |

## Exact cut text

### TV-C1 · Tovu · merge-6
"Do the eight table rows exactly as the design lists them (replace the full `apps/website/src/server/inbound/public-http/http/site/render.ts` with `apps/website/src/server/inbound/public-http/http/site/` + the destination suffix). At `apps/website/src/features/post/tiptap-text-schema.ts:5`, replace the fragment `` `apps/website/src/server/inbound/public-http/http/site/render.ts`'s `renderDocNode`/`renderMarks` `` with `` the site renderer's `renderDocNode`/`renderMarks` ``. Comment text only. STOP a row if its line no longer holds the old path."

### TV-C2 · Tovu · merge-6
"Do the three rows `media-embed-extension.tsx:11` → `render/doc/nodes-media.ts`, `media-image-extension.tsx:14` → `render/doc/doc-nodes.ts`, and `import-media-entity.ts:22` → `render/doc/doc-nodes.ts` as designed (same relative prefix). At `apps/admin/src/features/menus/MenuEditor.tsx:37`, replace `` (`server/inbound/public-http/http/site/render.ts`) `` with `` (`renderWidgetMenu`) ``. Leave `site-exporter.ts:219` alone. Comment text only."

### TV-I18N-PICKER · Tovu · merge-6
"In `apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.tsx`:
- Add `import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";` and `import { t as sharedComponentsT } from "../shared-components-i18n";`.
- `MediaPickerDialogProps`: add `useAdminLocaleHook?: typeof useAdminLocale;`.
- `MediaPickerDialog`: destructure `useAdminLocaleHook = useAdminLocale` beside `useJiniMediaPickerHook`. Add `const locale = useAdminLocaleHook();` right after `const vm = …`. In the error branch, replace the button child `Cancel` with `{sharedComponentsT({ locale, key: "Cancel" })}`. Nothing else changes.
Do NOT touch `JiniMediaPicker.hooks.ts` (no `cancelLabel`).
**Test (write it first):** in `__tests__/JiniMediaPicker.hooks.unit.test.tsx`, in the existing first test, render with `useAdminLocaleHook={() => "es"}` and replace `screen.getByText("Cancel")` with `screen.getByRole("button", { name: "Cancelar" })`. Keep the redaction and incident assertions. No new test. Mutation (combine): put back the literal `Cancel`. **Chrome look owed:** the picker error in Spanish and English."

## BUGS (confirmed on merge-6)
1. Tovu `apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.tsx:150`: the picker error's Cancel button is hard-coded English in all 22 admin locales. COMMON_I18N has `Cancel` (e.g. `es` "Cancelar", `lib/i18n-common.ts:31`). Fix: TV-I18N-PICKER.
2. Tovu `apps/admin/src/components/MediaPickerDialog/JiniMediaPicker.hooks.ts:31–32`: the error's message and action ("The media could not be chosen." / "Cancel and choose the media again.") are English-only. Not in the design and unsheeted. Same copy pass as TV-I18N-REVIEW.
- Design defect, not a code bug: TV-C1 and TV-C2 cite `render/doc/marks.ts` and `render/widgets/menu.ts` as successors, but the branch they wait for deletes both.

## NEEDS-DECISION (one line each, with recommendation)
- **Scanner:** teach `development/scripts/hygiene-audit.mjs` (line ~248) to read `...translationEntry({ source })` keys and to treat `auditTranslationEntries({ entries })` as complete? **Yes**: one small Opus fix to the dev script, so 1,005 false rows stop coming back each audit. Not Codex. No product code.
- **ENV-SCHEMA:** stay parked with `ex-env*`. **Agree.**
- **ENV-1** keep both stdin-EOF names: **agree, keep**.
- **ENV-2** add one operator-facing site-switcher setting: **no new name now**. It would add a variable while keeping the old flags (raises the env count). Decide inside `ex-env`.
- **ENV-3** keep four role-specific PID names: **agree**.
- **ENV-4** one canonical public origin: **document precedence only; no new variable or rename now**.
- **ENV-5** rename the desktop sign-in capability: **defer to `ex-env`**.
- **ENV-6** `TOVU_DB_MODE` with compatibility parsing: **no now**. The rename plus compatibility code is new code for no bug. Revisit in `ex-env`.
- **ENV-7** keep both daemon token names: **agree**.
- **ENV-8** keep the Postgres names per boundary: **agree, no change**.
- **ENV-9** prefix the analytics seed and comments salt: **defer to `ex-env`**. No compatibility shim now.

## Jobs
- **`j-hyb-jini-DRAFT.md`** (Jini, base merge-6 `d3e78b387`, 1 sheet): J-C1. ~1.4k tokens; batch with other Jini sheets.
- **`j-tv-hyb-DRAFT.md`** (Tovu, base merge-6 `776ce6d0f`, 4 sheets): TV-C3 → TV-C1 → TV-C2 → TV-I18N-PICKER. No wait on xd5 branches. The combine resolves the one-line `theme.ts:7` comment overlap with tv-xd5-publish.
- **Combine owes:** one mutation and one Chrome look (picker). Opus copy pass for TV-I18N-REVIEW + BUGS 2 and, separately, J-I18N-JSX per feature.
- **Dropped:** the `cancelLabel` hook field and the `JiniMediaPicker.hooks.ts` edits, the wait on xd5 branches, the two now-wrong path destinations, any Jini common copy provider.
