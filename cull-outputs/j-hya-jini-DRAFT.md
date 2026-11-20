BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.
You are a refactor programmer (Codex gpt-6.1-sol). Read <repos>/Tovu/AI-Dev-Shop/agents/refactor/skills.md and <repos>/Tovu/AI-Dev-Shop/skills/refactor-patterns/SKILL.md first. You run NO tests.
REPO: your cwd = private Jini clone, branch codex/hya-jini, HEAD = Jini integ/merge-6-2026-11-19 (d3e78b387). Base for every sheet: **merge-6**.
TASK (JINI ONLY; no sidekicks/subagents): H2-A11Y-RESOURCE, EXACTLY as the OVER-ENGINEERING CULL (section at the end) defines it. The CULL wins over the design. DROPPED sheets H2-A11Y-ASSET and H-ABORT-DEPLOY are NOT done: no `react/menu-keyboard.ts`, no `focusMenuItemOnArrow`, no edit to `AssetTreeRowMenu.tsx` or `devops/src/deploy/tool.ts`. Tovu sheets are not yours.
SHEETS (order, base, STOP):
1. H2-A11Y-RESOURCE · merge-6 · files: `packages/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx`, `packages/ui/src/features/resource-dashboard/__tests__/ResourceCard.test.tsx`. Test first. STOP if `menuFocusIndex` is not exported from `packages/ui/src/browser/useMenuKeyboard.ts`, if `ResourceCardMenuItems` no longer has the single `onKeyDown={(event) => event.stopPropagation()}`, if `baseProps` cannot take `menuOpen` and an `item` with `menuActions` without a new fixture, or if the handler needs a cast. COMMIT-PLAN.md: one entry "H2-A11Y-RESOURCE".

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

## DESIGN (Codex 6.2, r62t-hygiene-a) — context only; the CULL below wins
# r62t-hygiene-a · §H and §H2 fix plans

**Five sheets are ready** on Tovu `776ce6d0f0` and Jini `d3e78b387`. Start with the two menu keyboard fixes and the deploy admission guard in Jini, then the newsletter send log and visitor search in Tovu. Members already has pagination. The historical Express count also fell substantially after the shared wrapper landed. I kept the remaining post DELETE hit partial because its slug lookup catches ordinary repository failures internally.

This was a read-only review. Tests and mutations below are specified for the combine run. Package versions come from the supplied November 11 triage, with base-lock verification assigned to the lockfile job.

## Disposition

### §H bug classes

Paths starting with `W/` mean Tovu `apps/website/src/`. Paths starting with `J/` mean Jini `packages/`. The grouped rows account for the named audit candidates. **PARTIAL** means the evidence supports another targeted review or a fix direction, but the executor sheet is incomplete.

| ID | Disposition | Reason |
|---|---|---|
| H-LIST-MEMBERS | RETIRE | `W/server/inbound/admin-http/routes/members/list.ts:18–22,63–64` accepts and emits a cursor, including compatibility with the old `afterId` input. |
| H-LIST-VISITOR | READY-FOR-CODEX | `W/assistant/site/tools.ts:202–210` filters public matches and slices at 20 by default. The model receives a bare array and cannot tell whether more matched. |
| H-LIST-NEWS | READY-FOR-CODEX | `W/features/newsletter/tool-registrations.ts:350–360` returns the first 100 send rows without a completeness cue. SQL and memory already accept an explicit higher probe limit. Campaign and subscription list tools already use `listPageForModel` at `:308,345`. |
| H-LIST-KEYS | PARTIAL | `W/server/runtime/composition/other-site-keys.ts:142–144,205–223` silently drops rows after 50 per source. `find` and `adopt` also use that bounded read at `:110–121`. The picker needs a per-source cue, and lookup by approved ID needs a separate correctness check. Carry the cue outside the choice rows so it cannot be selected as a key. The source factory also appears in the fn50 inventory. |
| H-LIST-TOVU-VIEWS | RETIRE | The bounded windows in `RecentEntriesConfigFields`, `useRecentServerErrors`, `termListView`, `themeExploreVisibleGroupFiles`, `rememberSiteDir`, `parseCollectionListConfig` and `createLogBuffer` belong to recent, collapsed, configured or retention views. Their TSV hits are outside the list route/tool change. |
| H-LIST-TOVU-BOUNDED | RETIRE | `newsletter/send-pipeline.ts:400` pages with `afterId`. `vault-credential-inventory.ts:195–202` counts and refuses overflow. `routes/integrations/list.ts:39–46` returns one latest delivery summary from the bounded lookup. |
| H-LIST-TOVU-SEARCH | PARTIAL | `byok-tool-surface.ts:304`, `component-catalog-query.ts:99`, `component-catalog-tool.ts:135`, `permanent-delete-tool-gate.ts:16`, `tool-catalog-query.ts:142`, `post/search.ts:264`. Trace the exposed result contracts. Determine which calls ask for ranked top results and which present an exhaustive search. Count only matches surviving visibility and delete-gate filtering. |
| H-LIST-TOVU-OPS | PARTIAL | Desktop `workspace-conversation-store.ts:103` and website `tool-gaps.repo.ts:11` expose bounded gap lists. `analytics/tool-registrations.ts:54` filters by path *after* taking a bounded recent window. `domain-dns-adapters.ts:135` and `composition/commerce.ts:380` can omit older in-scope rows before deduplication or site filtering. Passkeys `passkeys.repo.ts:12` needs the writer-cap invariant checked. These need consumer and eligibility checks before selecting a flag or cursor. |
| H-LIST-JINI-BOUNDED | RETIRE | `automatic-use.ts:269` ranks a short guidance note, `catalog-tools.ts:51–54` uses its 25th row to warn about the 24-item storefront cap, `repo.storefront.ts:26–31` applies that intentional storefront policy, and `batch-tool-inputs.ts:328–330` sets an input batch limit. |
| H-LIST-JINI-SEARCH | PARTIAL | `registry/tool-catalog-builder/query.ts:59`, `registry/tool-catalog/sqlite.ts:119`, `daemon/core/read-only-tools.ts:112`, `commerce/catalog/repo.ts:92`, `research-tavily.adapter.ts:134` and `devops/deploy/ops-runner.ts:159`. Trace final consumers and provider limit semantics before changing a public result. |
| H-LIST-JINI-INTERNAL | PARTIAL | `chat/store/sql/{cursor.ts:11,maintenance.ts:14}`, `cms/forms/{attachment-purge.ts:32,75,sql/submission-ip-retention-repo.ts:15}`, `cms/redirects/resolver.ts:102`, `integrations/{media-providers/dispatch/sqlite-async-operation-store.ts:270,media-providers/staging.ts:170,webhooks/tools/tool-handlers.ts:75}`, `oauth/pending-authorizations.ts:103`, and `search/indexer.ts:475`. Verify paging, repeat scheduling, admission constraints or deliberate capacity in each caller. Start with redirects and the attachment-purge reads because incomplete input there could change a decision. |
| H-LOST-S0–S13 | OWNED-ELSEWHERE `r62t-resheet` | Compared the November 20 TSV with `origin/plan/lost-updates-design-2026-11-16:designs/lost-updates/SITES.tsv` and the refreshed handoff. Sixty-three candidates match a design file. The renamed and additional paths are listed under PARTIAL below. |
| H-ABORT-DEPLOY | READY-FOR-CODEX | Jini `deploy.publish` can dispatch an already-aborted call. The existing target port has no in-flight cancellation contract, which is a separate unresolved boundary. |
| H-ABORT-CMS | PARTIAL | Jini `content-types/tool-registrations.ts:219` and `entries/tool-registrations.ts:181` call their update services without a signal. Their registration builders are in fn50. Entries must follow `origin/codex/dh-jini`, whose handler retains the same shape. Pin cancellation after service admission and before persistence. |
| H-ABORT-USER | PARTIAL | Jini `user-management/src/server/agent-tool-registrations.ts:439–453` drops the signal before `createUser`. Trace the last awaited authorization or preparation step and the first transaction write before selecting the fix. |
| H-ABORT-BACKUP | PARTIAL | Jini `db/src/tools/read-tools.ts:61–75` can reach ledger `save` after the artifact capture await. Verify artifact ownership before adding a check between capture and save, since cancellation there could leave an unindexed artifact. |
| H-ABORT-INSTALL | RETIRE | Jini `plugins/src/host/tools/install.ts:59–66` has an admission check before `installer.install`. The flagged `installFailed` call is failure telemetry. In-flight installation is outside this TSV hit. |
| H-ABORT-RENDER/GUIDE/STATUS | RETIRE | Tovu `render-ui-tool.ts:168`, `site-guide-tools.ts:110–117` and `publish-agent-tools.ts:1051–1058` hit on catalog construction, guide construction and status-response fields, respectively. |
| H-ABORT-CONSENT/FILES | PARTIAL | `consent` save/publish and `fs-files` batch write enter through `approvalToolHandler`. Jini `core/src/approval.ts:179–180` already prevents an abandoned approval from starting its `run`. Verify a later awaited step before adding a second guard. |
| H-ABORT-PAGE/POST | PARTIAL | `pages_write_html` and `content_post_update` need their own write-boundary trace. The post TSV points at `mergeUpdatePatch`, which computes values. The real write is the later `mutation.execute → updatePost`. That handler exceeds the size gate. Page write must follow `origin/codex/tv-xd5-publish`, whose `pages/tool-registrations.ts` retains the existing neighboring signal checks. |
| H-ABORT-MIGRATE/RESTORE/PUBLISH/THEME | PARTIAL | Trace Tovu `createMigrateForwardHandler`, `createRecoveryRestoreHandler`, `planPublishContentPull`, `createExecutePullHandler` and `theme_import_file_from_url` to the last await before the actual database, ledger or file mutation. Resolve settlement and cleanup ownership for already-started operations. Publish execution must be reconciled with the publish work owned by `r62t-resheet`. |
| H-ABORT-CREDENTIAL-PROMPTS | PARTIAL | `mail_configure_provider` and `external_mcp_test_connection` call `issueCredentialSetup` on response paths. Establish whether issuing that descriptor persists or raises anything after cancellation. The TSV alone does not show a credential write. |
| H-PERM-TV | PARTIAL | `assistant_admin_screen_link`, `search_components`, `describe_component`, and `assistant_demo_image` have the advertised `admin.assistant.use` and no local authorization check. `W/assistant/tool-registrations.ts:217,223,232` wires them centrally. Trace remote and delegated admission and then use the existing workspace and authorization bag if the tools need a local check. |
| H-PERM-J | PARTIAL | `J/agent-plugins/src/lifecycle/host-tools/search-tool.ts:279–296` advertises `ports.permissions.use` and builds a registration without a local check. Verify whether the existing host ports supply the authorizer and how the Tovu delegated registration is fenced. Reconcile with `r62t-routing` before touching this host-tools directory. |
| H-POST-DELETE | PARTIAL | `W/server/inbound/admin-http/routes/posts/delete.ts:161–164` registers directly and awaits before the outer `try`. `resolvePostIdForDelete:46–61` already maps ordinary lookup rejection and preserves raw-ID fallback. A failing response or error reporter can still reject outside the route boundary. Prove a production-reachable rejection before sheeting the existing `asyncRoute` around this registration. |
| H-DOLLAR | RETIRE | `J/admin/src/security/controllers/other-credentials.controller.ts:31` is credential API `replace({ store, id, token }, { signal })`. The fresh audit matched the method name. |
| H-BOOT-TOKEN | RETIRE · KEEP | `W/cli/commands/serve-listen.ts:48–63` emits the token only for `emitBootToken === true`, after the listener binds. The launcher reads the separate line before the readiness line, so preserving the explicit handshake preserves startup order. |

### §H2 verified lists

| ID | Disposition | Reason or owner question |
|---|---|---|
| H2-DEV-AUTH | RETIRE | `W/server/inbound/admin-http/dev-auth.ts:767,829` wraps both GET registrations with `asyncRoute`. The wrapper forwards rejected promises to `next(error)` at `W/platform/express/async-route.ts:27–35`. |
| H2-TV-PRETRY | RETIRE | The 12 historical files now import the shared wrapper: external MCP OAuth/probe, custom-root/folder-picker, autosave, custom/publish/source-control credentials, site-key, preview refresh and both OAuth callbacks. The November 20 audit has no remaining hit in those files. |
| H2-J-SETTINGS-WRAP | RETIRE | The eight routes are now in `J/http-kit/src/settings/http.ts`. `http-request.ts:17–25` catches readiness and principal resolver failures and `http.ts:63–64` returns 401. `__tests__/settings-http.test.ts:94–101` pins the boundary. |
| H2-TV-SETTINGS-SSE | RETIRE | `W/server/inbound/admin-http/routes/settings/events.ts:386–397,408–416` wraps admission and emits an SSE error followed by `end()` on head-read failure. `origin/codex/tv-xd5-publish` retains both behaviors in the overlapping file at `:363–374,385–394`. |
| H2-NEWS-BOOT | RETIRE | `W/server/inbound/public-http/routes/site/newsletter-confirm.ts:20–21` puts the boot await within `asyncRoute`, so boot rejection reaches error middleware. |
| H2-UPLOAD | RETIRE | `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:525` binds `uploadFailureReporter` for the drop/paste handlers in `post-editor-file-upload.ts`. Error state now has an explicit reporting path. |
| H2-DISCARD | RETIRE | `use-page-editor.hooks.ts:1056–1059` and `use-post-editor.hooks.ts:1126–1129` report discard failure and retain the recovered-draft banner for retry. |
| H2-DESKTOP-QUIT | RETIRE | `apps/desktop/src/main/index.ts:1133–1144` catches agent shutdown failure before draining pending teardowns and completes quit in `finally`. |
| H2-METRIC | RETIRE | `J/diagnostics/src/observability/tracker.ts:69,111` delegates to fan-out, whose `fanout.ts:120–122` catches both synchronous throws and rejected metric promises. |
| H2-LOCATIONS | RETIRE | `J/ui/src/features/project-locations/react/hooks/useProjectLocationsTab.ts:80–86` reports `load-error`; `ProjectLocationsTab.tsx:85` maps the label. The hook test at `:41–49` pins rejection. |
| H2-DOCK-SAVE | PARTIAL | Confirmed. `execution-config.hooks.ts:206` and `byok-runtime.hooks.ts:136` ignore the `false` result from `execution-config-write.ts:49–58`. Finish the owner's five-second in-chat toast and saved-value requirement together. Trace the dock render and existing notice timer, then specify failure-after-newer-selection behavior and the existing ledger refresh path. A stale failure must preserve a newer successful selection. |
| H2-CATCH-AWAIT | NEEDS-DECISION | **Should the four historical catch-await cases keep their current failure envelopes now that `asyncRoute` forwards a secondary rejection?** Recommend yes. `users/create.ts:78,103` and `commerce/purchase.ts:186–192` already have that boundary. The old four rows include the return/cancel registrations of one shared handler. |
| H2-SEM-PASSWORD | NEEDS-DECISION | **When the parked creation fix resumes, should interactive new-site creation require an explicit owner password?** Recommend yes. Preserve existing credentials, the boot warning and the owner's instruction against automatic password changes. |
| H2-SEM-CORS | NEEDS-DECISION | **Should localhost developer CORS run only in dev mode?** Recommend yes, with an explicit inventory of supported local desktop callers before changing the mount. |
| H2-SEM-MENU | NEEDS-DECISION | **Should raw menu HTML writes require a full-admin grant?** Recommend yes, including tool-mediated writes, using the existing authorization path. |
| H2-A11Y-QUESTION | RETIRE | Jini `QuestionFormField.tsx:114,152,162,176,192,198` assigns the question as the accessible name for select, text, textarea, number, file and switch. Verify spoken names in Chrome during the next chat combine look. |
| H2-A11Y-PALETTE | PARTIAL | Confirmed. `J/ui/src/react/components/PaletteTweaks.tsx:165–230` has mouse-only `role="option"` items. The fn50 inventory records 64 lines for this UI function. Owner rules table it. Chrome look owed when the owner permits a compliant edit. |
| H2-A11Y-RESOURCE | READY-FOR-CODEX | `ResourceCardParts.tsx:30–32` advertises a menu and only stops key propagation. Arrow navigation is absent. Its stop also fences real menu-originated Escape from the existing window dismiss listener. |
| H2-A11Y-ASSET | READY-FOR-CODEX | `AssetTreeRowMenu.tsx:54–81` lacks arrow navigation. `useAssetTreeRowMenu.ts:34–37` already delegates Escape/outside dismissal to the DOM bridge. |
| H2-A11Y-CAPTIONS | NEEDS-DECISION | **Should media records support optional caption tracks for published videos and transcripts for audio?** Recommend yes. Start with author-supplied assets and the existing media picker. |
| H2-PKG | OPUS-CLOUD | Lockfile job. See the package table below. |

**Ownership register**

| Item | Disposition |
|---|---|
| T-PO-02 Tovu cover image | OWNED-ELSEWHERE `r62t-resheet` |
| a49 S1 | OWNED-ELSEWHERE `r62t-resheet` |
| a59 S2 | OWNED-ELSEWHERE `r62t-resheet` |
| A66 | OWNED-ELSEWHERE `r62t-resheet` |
| a10 S2/S3 | OWNED-ELSEWHERE `r62t-resheet` |
| B01 J | OWNED-ELSEWHERE `r62t-resheet` |
| Optional loaders | OWNED-ELSEWHERE `r62t-resheet` |
| G-TESTS-0 ratchet | OWNED-ELSEWHERE `r62t-resheet` |
| Publish P0.4/P0.7/P0.8-rest | OWNED-ELSEWHERE `r62t-resheet` |
| Size 02 steps 5–7 | OWNED-ELSEWHERE `r62t-resheet` |
| S6c | OWNED-ELSEWHERE `r62t-resheet` |
| Security A06/A51/A50 re-sheets | OWNED-ELSEWHERE `r62t-resheet` |
| Desktop 1 | OWNED-ELSEWHERE `r62t-resheet` |
| Non-UI function size and complexity | OWNED-ELSEWHERE `fn50` / `c6fix`. The 424 long UI functions are tabled. |
| a09 | HELD on `r62t-redact` |
| R4/C-CHAT-DEPS | HELD on `r62t-redact` |
| G-TESTS T0 | HELD on `r62t-redact` |
| Run-finalizer B1 | HELD on `r62t-redact` |
| L7a | HELD on `r62t-redact` |
| AG-UI | OWNED-ELSEWHERE `r62t-agui` |
| ACP | OWNED-ELSEWHERE `r62t-acp` |
| Agent-plugin routing | OWNED-ELSEWHERE `r62t-routing` |
| Env schema remainder `ex-env*` | HELD |
| §H stale comments, i18n, pins, dead feature, junk and §H2 env names | OWNED-ELSEWHERE `r62t-hygiene-b` |
| Error-gate ledger | OWNED-ELSEWHERE `r62t-debt-a/b/c/jini` |
| §C Tovu | OWNED-ELSEWHERE `r62t-rules-tovu` |
| §C Jini product names/IDs | OWNED-ELSEWHERE `r62t-rules-jini-a` |
| §C remaining Jini rules | OWNED-ELSEWHERE `r62t-rules-jini-b` |
| Hardwiring, L7 CSS tokens, log-safety, env-access ledgers | OWNED-ELSEWHERE `r62t-hardwire` |
| §D | OWNED-ELSEWHERE `r62t-struct` |
| §E | OWNED-ELSEWHERE `r62t-tests` |
| §N, per-CLI/vendor folders, model IDs and per-CLI code | OWNED-ELSEWHERE `r62t-practice` |
| §L | HELD |

### H2-PKG · OPUS-CLOUD

`From → to` is the supplied triage baseline and target. A dash in the target column means the triage deferred to raw advisory data or gave no target. Resolve those rows and compare each version with the combine lock before changing it.

| Package | From → to | Class | Repo/lock |
|---|---|---|---|
| handlebars | 4.7.9 → 4.7.10 | Runtime | Tovu root |
| drizzle-orm | 0.44.7 → 0.45.2 minimum, 0.45.4 audit suggestion | Runtime | Tovu root |
| liquidjs | 10.27.1 → 10.27.2 | Runtime | Tovu root |
| nodemailer | 7.0.13 → 9.1.0 minimum, 10.5.0 clears triaged set | Runtime | Tovu root |
| sharp | 0.35.3 → 0.35.5 | Runtime | Tovu root |
| undici | 7.30.0 / 7.29.x → 7.30.1 | Runtime | Tovu root, desktop, admin/site-chat where resolved |
| body-parser | 1.20.5 / 2.3.0 → 1.20.9 / 2.4.0 via Express | Runtime/transitive | Tovu root, app locks with 2.x |
| zod | 3.25.76 → 4.6.6, with coordinated agent-plugins upgrade | Runtime/transitive | Tovu root and app locks |
| electron | 43.6.0 → 43.8.1 | Shipped runtime | Tovu desktop |
| proxy-addr | 2.0.7 → 2.0.8 | Runtime/transitive | Tovu desktop, site-chat |
| @modelcontextprotocol/sdk | 1.30.0 → 1.32.0 | Runtime/transitive | Tovu app locks |
| @tiptap/core | 3.27.2 → 3.30.5 | Runtime | Tovu admin |
| fast-uri | 3.1.6 → 3.1.7 | Transitive | Tovu site-chat |
| astro | 7.2.1 → 7.2.8 | Dev | Tovu root |
| shell-quote | 1.9.0 → 1.11.0 | Dev/optional | Tovu root |
| vite | 8.2.1 → 8.2.4 | Dev | Tovu root |
| devalue | 5.9.0 → 5.9.3 | Dev | Tovu root |
| svgo | 4.0.2 → 4.1.0 | Dev | Tovu root |
| source-map-js | 1.2.1 → 1.2.2 | Dev | Tovu root and app locks |
| js-yaml | 4.3.1 → 4.3.2 | Dev | Tovu root |
| brace-expansion | 5.0.7 → 5.0.11; app versions resolve in Cloud | Dev | Tovu root and app locks |
| undici | 8.11.2 → 8.12.2 | Dev | Tovu root |
| vite | 7.3.6 / 8.2.2 → — | Dev | Tovu app locks |
| nanoid | 3.3.17 → — | Dev | Tovu app locks |
| proxy-addr | 2.0.7 → 2.0.8 | Runtime | Jini minimal-host example |
| undici | 7.28.0 / 8.10.0 → 7.30.1 / 8.12.2 | Runtime | Jini devops, platform, sandbox |
| @modelcontextprotocol/sdk | 1.29.0 → 1.32.0 | Runtime | Jini chat and reference-web |
| zod | 3.25.76 / 4.4.3 → 4.6.6 | Runtime | Jini agentic and reference-web |
| body-parser | 1.20.6 / 2.3.0 → 1.20.9 / 2.4.0 | Runtime | Jini examples |
| electron | 43.2.0 → 43.8.1 | Runtime | Jini reference-desktop |
| fast-uri | 3.1.4 → 3.1.7 | Runtime | Jini reference-web |
| ip-address | 10.2.0 → 10.3.1 | Runtime | Jini reference-web |
| dompurify | 3.4.12 → 3.4.17 | Dev | Jini CMS |
| tinypool | 1.1.1 → 2.1.2 | Dev | Jini tooling |
| vitest | 2.1.9 → 3.2.6 | Dev | Jini tooling and package test harnesses |
| nanoid, lodash-es, vite, brace-expansion, js-yaml, sharp, source-map-js | — → — | Dev | Jini raw advisory rows |

## READY sheets

**Paste this block verbatim into each job brief.** It governs every sheet below.

> Behavior identical outside the named bug fix. API args `(required, optional = {})` for new functions only, with framework-dictated signatures exempt. Hooks are injected as props. No re-export shells, new deps, `eslint-disable`, `@ts-ignore`, `as any`, or `as never`. Functions ≤50 lines and complexity ≤10. A file over 500 lines goes in `COMMIT-PLAN.md` and work continues. STOP that sheet and continue the others if a named declaration is missing, an unlisted production importer appears, a cast is needed, or a function limit is exceeded. Check importers with the named exact `git grep` over `apps/ development/ packages/`. Same-repoint test importers go in `REFRESH.md`. No other repo-wide scans, codebase-memory-mcp, tests, builds, installs, type-checks or linters on this machine. `.git` is read-only. `COMMIT-PLAN.md` goes at repo root. No vendor code or server-framework dependency in Jini domain code. Jini packages import their own package, core and protocol, with the server/CLI preset exception. Lockfile changes, new npm dependencies and new Jini packages go to OPUS-CLOUD.
>
> Make exactly the named edits. Add only the named helpers, types, ports, options or layers. Preserve the moved statements, order, names and why-comments verbatim. Add only the named tests and mutation, using the existing fixtures. Keep existing validation, defaults, fallbacks, control flow and behavior outside the fix. Write the failing case before the source edit. The combine runner runs the test and mutation. Review the diff, remove anything the sheet did not require, and list those deletions in `COMMIT-PLAN.md`.

### H2-A11Y-RESOURCE · Jini · merge-6 · ~4k tokens

- **Test first.** In `J/ui/src/features/resource-dashboard/__tests__/ResourceCard.test.tsx:7,90,196`, use the existing `baseProps` and a card with two enabled actions. From the first focused action, ArrowDown focuses the second and ArrowUp returns to the first. Assert the card itself is never activated by those keystrokes. Mutation removes the keyboard focus call.
- **Edit.** In `ResourceCardParts.tsx:16–47`, replace the stop-only `onKeyDown` on `ResourceCardMenuItems` with a handler that allows Escape to reach the existing dismiss listener, stops propagation for other keys, and calls `focusMenuItemOnArrow(event)`. Leave native Enter and Space activation in place. The existing dismiss listener is `react/hooks/useResourceBoard.ts:177–204`.
- **Shared implementation named by this sheet and the asset sheet.** Add `J/ui/src/react/menu-keyboard.ts` with the package-internal `focusMenuItemOnArrow(event: KeyboardEvent<HTMLDivElement>): void`, a React keyboard-event handler. Return immediately unless the key is ArrowDown or ArrowUp. Find enabled buttons within `currentTarget`, wrap at the ends, and focus the next/previous one. With focus outside those buttons, Down starts at the first and Up at the last. Prevent default only when the handler moves focus. The helper gains its second caller in the next sheet.
- **Imports.** Add `import { focusMenuItemOnArrow } from '../../../../react/menu-keyboard.js';` to `ResourceCardParts.tsx`. `ResourceCard.tsx:2` continues using `./ResourceCardParts.js`. The existing test continues using its `ResourceCard` import. Package export and ledger changes are zero.
- **Order and stop.** The listed Jini pushes showed no overlap at the target. Run before H2-A11Y-ASSET in the same job. Stop the pair if the common handler needs component-specific state or the second caller drops out. **Chrome look owed** for Tab into actions, arrows, native activation and Escape from a focused action.

### H2-A11Y-ASSET · Jini · after H2-A11Y-RESOURCE · ~3k tokens

- **Test first.** In `J/ui/src/features/asset-tree-browser/__tests__/react/components/AssetTreeRowMenu.test.tsx:6,24,44`, use the existing props with Copy disabled and the optional download absent. Start on Rename. ArrowDown focuses Delete, a second ArrowDown wraps to Open, and ArrowUp wraps back to Delete. Mutation removes the root keyboard handler.
- **Edit.** In `react/components/AssetTreeRowMenu.tsx:37–84`, add `onKeyDown={focusMenuItemOnArrow}` to the existing popover root. Leave the `containerRef`, download markup, action handlers and DOM-bridge dismissal in place.
- **Imports.** Add `import { focusMenuItemOnArrow } from '../../../../react/menu-keyboard.js';` to `AssetTreeRowMenu.tsx`. `AssetTreeBrowserParts.tsx:18,293` and `index.ts:101–102` retain their existing imports and exports. The row-menu tests at `AssetTreeRowMenu.test.tsx:6` and `hook-injection.test.tsx:10` retain their direct component imports. Manifest and ledger changes are zero.
- **Order and stop.** No overlap with the listed Jini pushes at the component. Stop if the shared selector needs special handling for the existing download markup. **Chrome look owed** for arrows, disabled Copy, Download if supplied, and Escape through the existing DOM bridge.

### H-ABORT-DEPLOY · Jini · merge-6 · ~2.5k tokens

- **Test first.** In `J/devops/src/deploy/__tests__/tool.test.ts:151–167`, follow the existing valid `ToolExecutionContext` and `FakeDeployTarget` case. Abort the controller before invoking the handler. Assert rejection with the abort reason and that the target observes no publish input. Mutation removes the admission check.
- **Edit.** In `createDeployPublishToolRegistration` at `J/devops/src/deploy/tool.ts:126–152`, insert `ctx.signal.throwIfAborted();` immediately before the `publishDeploy` return at `:149`. Keep the parse, metadata option and target dispatch as they are. In-flight provider work remains a separately unverified cancellation question.
- **Imports and order.** Zero import repoints, export or ledger changes. The existing test keeps its import of the registration. No overlap with the listed Jini pushes at `tool.ts`. Stop if the guard cannot be placed immediately before dispatch using the existing context. Look owed is zero.

### H-LIST-NEWS · Tovu · merge-6 · ~3.5k tokens

- **Test first.** Extend `W/features/newsletter/__tests__/tool-registrations.model-facing-errors.test.ts` beside the send-log result at `:317–318`. Seed 101 ordered sends for one campaign via the existing memory repo fixture. Assert 100 projected rows in the original order and `truncated: true`. At exactly 100 assert `truncated: false`. Mutations set the probe limit to 100, or change the completeness comparison from `>` to `>=`, respectively. Update the existing one-row exact payload to include `truncated: false`.
- **Edit.** In `createNewsletterListSendLogHandler` at `W/features/newsletter/tool-registrations.ts:350–360`, pass `limit: DEFAULT_LIST_LIMIT + 1` to the existing `listByCampaign` call. Return `{ sends: rows.slice(0, DEFAULT_LIST_LIMIT).map(toSendLogToolView), truncated: rows.length > DEFAULT_LIST_LIMIT }`. In `agent-tools.ts:121–129`, append the 100-row limit and the meaning of `truncated` to the tool description. Keep the campaign scope and the existing PII projection.
- **Imports.** Add `import { DEFAULT_LIST_LIMIT } from "./repo-subscribers.js";`, the same constant imported at `repo-sends.ts:4`. Zero importer repoints. SQL `repo-sends.ts:84–103` and memory `repo.memory.ts:227–242` take the explicit limit already. The existing tool and package entries stay in place. No injection-debt or manifest rows. Record the model-output baseline change in `COMMIT-PLAN.md`.
- **Order and stop.** No overlap with the listed Tovu pushes at the two source files. The reference pattern is Jini `cms/src/media/tool-registrations.ts:258–260`, which carries completeness beside the list. Stop if another production consumer treats the send-log envelope as closed. Look owed is zero.

### H-LIST-VISITOR · Tovu · merge-6 · ~4k tokens

- **Test first.** Extend `W/assistant/site/__tests__/tools.test.ts:225–239` with the existing `maxResults` fixture. Assert the field is true above the cap and false exactly at the cap after filtering. Mutations remove the field or use `>=`, respectively. In `capability-registry.test.ts:104–109`, assert the same envelope survives actual registry invocation. Mutation unwraps the entries array in the registration.
- **Edit.** In `createSiteAssistantTools`, change only `search_published_entries` at `W/assistant/site/tools.ts:202–211` to return `Promise<{ entries: readonly PublicEntrySummary[]; truncated: boolean }>` and `{ entries: matched.slice(0, limit).map(toSummary), truncated: matched.length > limit }`. In the same file at `:257–260`, describe the 20-result default and qualify the omitted-query claim. `capability-registry.ts:118` already forwards the returned value under `result`. Preserve it as the envelope. The media model contract at `J/cms/src/media/agent-tools.ts:105` and `tool-registrations.ts:258–260` likewise exposes the cap and its completeness signal together.
- **Consumers.** No import repoints. Update direct result reads in `tools.test.ts:114,122,148,160–163,228,237–239` to use `.entries`, with explicit empty-envelope assertions for no matches. `:107` still only awaits the call. Change the existing registry result assertion at `capability-registry.test.ts:104–109` to narrow and read the envelope without introducing a cast. `visitor-tool-presentation.ts:12`, `visitor-confirmation-gate.ts:15`, and the name inventory in `visitor-tools.integration.test.ts:29,53` keep their current declarations. No manifest or injection-debt edit. Record the model-output baseline change in `COMMIT-PLAN.md`.
- **Order and stop.** No overlap with the listed Tovu pushes at the producer and registry. Stop on a production reader that expects the bare array, or if the typed registry fixture requires a cast. Owed after combine is one visitor-chat Chrome look through the tool path with more than 20 public matches.

## Job batching

The five ready sheets give **three Jini sheets and two Tovu sheets**. Both queues are below the requested six-sheet dispatch minimum. Use the following orders when the coordinator fills the remaining slots with independent sheets from the sibling jobs. Estimates cover the sheets in this report.

| Queue | Proposed branch | Base and order | Est. executor tokens |
|---|---|---|---|
| Jini first | `codex/hygiene-a-jini` | `d3e78b387`. H2-A11Y-RESOURCE → H2-A11Y-ASSET → H-ABORT-DEPLOY. Add 3–5 independent Jini sheets. No listed pushed prerequisite for these three. | 9.5k plus partner sheets |
| Tovu second | `codex/hygiene-a-tovu` | `776ce6d0f0`. H-LIST-NEWS → H-LIST-VISITOR. Add 4–6 independent Tovu sheets. No new Jini publication is required for these two. No listed pushed prerequisite. | 7.5k plus partner sheets |

## `development/open-bugs.md` handoff

- Tovu `apps/website/src/features/newsletter/tool-registrations.ts:358` — Send log hides whether the campaign has more than 100 rows — H-LIST-NEWS.
- Tovu `apps/website/src/assistant/site/tools.ts:210` — Visitor search hides whether additional public entries matched — H-LIST-VISITOR.
- Tovu `apps/website/src/server/runtime/composition/other-site-keys.ts:142` — Per-site key cap hides saved choices and also bounds ID lookup used by adoption — H-LIST-KEYS, PARTIAL.
- Tovu `apps/admin/src/components/AssistantDock/hooks/execution-config.hooks.ts:206` — Failed mode save leaves an optimistic choice visible without an in-chat toast — H2-DOCK-SAVE, PARTIAL.
- Tovu `apps/admin/src/components/AssistantDock/hooks/byok-runtime.hooks.ts:136` — Failed BYOK model save leaves an optimistic choice visible without an in-chat toast — H2-DOCK-SAVE, PARTIAL.
- Jini `packages/devops/src/deploy/tool.ts:149` — Already-aborted tool calls can still dispatch a publish — H-ABORT-DEPLOY.
- Jini `packages/ui/src/react/components/PaletteTweaks.tsx:178–224` — Keyboard users cannot reach and select a palette option — H2-A11Y-PALETTE, PARTIAL.
- Jini `packages/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx:28–41` — Arrow keys cannot navigate the card menu — H2-A11Y-RESOURCE.
- Jini `packages/ui/src/features/asset-tree-browser/react/components/AssetTreeRowMenu.tsx:54–81` — Arrow keys cannot navigate the asset row popover — H2-A11Y-ASSET.

## PARTIAL

- **Lost-update reconciliation.** Twenty-one fresh rows lack an exact file match in `SITES.tsv`. Eight Tovu identity rows in `repo.assignments.ts`, `repo.authentication.ts` and `repo.authorization.ts` fit S3 by domain. Three newsletter rows in `repo-sends.ts` and `repo-subscribers.ts` fit S9 by domain. On Jini, reconcile comments `tool-registrations.ts:420`, content types `sql/repo.ts:46`, entries `sql/repo.ts:136`, SEO `tool-registrations.ts:234` and taxonomy `sql/term-repo.ts:40` against S6–S8 by declaration. The remaining candidates are `db/src/gated-mutations/repo.sql.ts:58`, `db/src/settings/repo.sql.ts:123,171,185,201` and `db/src/verified-origin/register.ts:68`. They need writer/precondition proof and an explicit ownership match before dispatch. No extra lost-update sheet is ready.
- **Candidate closure and overlap.** The remaining PARTIAL rows identify the next source boundary to verify. I did not finish the downstream authorization, write, scheduling or completeness traces for them. The current checkout also lacked the named `ro-tovu-ext` survey clone. The November 20 audit, November 11 triage, plan ref and finished sibling outputs supplied the evidence used here.
- **Integration proof.** The sheets specify source and regression changes. The combine run still owes mutation results, Chrome looks, and base-lock verification for OPUS-CLOUD.

## OVER-ENGINEERING CULL (Opus) - WINS
# Cull of r62t-hygiene-a (§H bug classes + §H2 verified lists)

Input `cull-inputs/designs/r62t-hygiene-a.md`. Base Tovu `776ce6d0f` (merge-6), Jini `d3e78b387` (merge-6). Read-only; anchors checked with `git show` and single-symbol `git grep`.

**Counts (5 READY sheets + 1 cloud row):** KEEP 0 · **CUT-TO 3** (H2-A11Y-RESOURCE, H-LIST-NEWS, H-LIST-VISITOR) · **DROP 2** (H2-A11Y-ASSET, H-ABORT-DEPLOY) · **NEEDS-DECISION 6** (5 from the design + 1 new) · CLOUD 1 (H2-PKG) · BLOCKED 0. Agree with every RETIRE, PARTIAL and OWNED-ELSEWHERE row (no sheets).

## Verdicts

| Sheet | Verdict | Base | Reason |
|---|---|---|---|
| H2-A11Y-RESOURCE (Jini) | **CUT-TO** | merge-6 | Bug confirmed (BUGS 1). Cut the new file `react/menu-keyboard.ts` and its new `focusMenuItemOnArrow`: Jini already has `menuFocusIndex` (`ui/src/browser/useMenuKeyboard.ts:12–21`, wraps, Up/Down/Home/End), exported at `browser/index.ts:11`. Features already import `browser/` (`asset-grid/.../DeleteConfirmDialog.tsx:3`). With ASSET dropped the helper would have one caller. Inline the handler in the one component. |
| H2-A11Y-ASSET (Jini) | **DROP** | — | Not a bug. `AssetTreeRowMenu.tsx:55–83` is a plain popover of `<button>`s: no `role="menu"`/`menuitem`, so nothing promises arrow keys and every action is reachable with Tab. Its only purpose in the design was to be the second caller that justified the new helper. |
| H-ABORT-DEPLOY (Jini) | **DROP** | — | Not a bug. The tool executor is the only path that calls `handler` (`daemon/src/tool-executor.ts:11–16`). `tool-executor-handler.ts:128–130` returns `cancelled` when the signal is aborted and then reaches `handler(...)` at `:155` with no `await` in between. An already-aborted call never reaches `publishDeploy`. The handler has no await before dispatch, so an extra `throwIfAborted()` duplicates the executor check. |
| H-LIST-NEWS (Tovu) | **CUT-TO** | merge-6 | Bug confirmed (BUGS 2). `listByCampaign` defaults to `DEFAULT_LIST_LIMIT` = 100 (`repo-sends.ts:100`, `repo-subscribers.ts:10`). The handler at `tool-registrations.ts:358` passes no limit. Edit as designed. Cut the tests to **one** new case. |
| H-LIST-VISITOR (Tovu) | **CUT-TO** | merge-6 | Bug confirmed (BUGS 3). The schema says "Omit query to list everything published" (`tools.ts:258–259`), but `:210` slices to `limit` (20). Edit as designed. Cut the new registry case: the registry forwards `result` unchanged (`capability-registry.ts:118`), and its existing assertion must change anyway. |
| H2-PKG | **CLOUD** | — | Lock job. Needs installs and audits. |
| H2-CATCH-AWAIT, H2-SEM-PASSWORD, H2-SEM-CORS, H2-SEM-MENU, H2-A11Y-CAPTIONS | NEEDS-DECISION | — | See below. |
| Admin send log (new, not in the design) | NEEDS-DECISION | — | BUGS 4. |
| All RETIRE rows, all PARTIAL rows, ownership register | agree | — | Spot-checked: H-BOOT-TOKEN (`serve-listen.ts:57–58`, only when `emitBootToken === true`), H-DOLLAR (credential `replace(...)` method, not `String.replace`), H-POST-DELETE (`resolvePostIdForDelete` catches lookup failures, `delete.ts:50–61`), H-LIST-KEYS (picker and `find`/`adopt` read the same capped, ordered rows, so lookup matches the picker. The bug is only the silent cap, BUGS 5). |

## Exact cut text

### H2-A11Y-RESOURCE · Jini · merge-6
"In `packages/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx` add `import { menuFocusIndex } from '../../../../browser/useMenuKeyboard.js';`. In `ResourceCardMenuItems`, replace only `onKeyDown={(event) => event.stopPropagation()}` with:
```tsx
onKeyDown={(event) => {
  if (event.key !== 'Escape') event.stopPropagation();
  const entries = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=\"menuitem\"]')];
  const next = menuFocusIndex({ key: event.key, current: entries.findIndex((entry) => entry === event.target), count: entries.length });
  if (next === null) return;
  event.preventDefault();
  entries[next]?.focus();
}}
```
Update the component's doc line to: `/** The open kebab menu's items: arrow keys move between them, Escape reaches the board's dismiss listener, and other clicks and keydowns never bubble to the card. */`. No new file, helper, export or type. Leave native Enter/Space activation alone.
**Test (write it first):** in `features/resource-dashboard/__tests__/ResourceCard.test.tsx` add one `it('moves focus between menu items with the arrow keys')`. Use `baseProps({ menuOpen: true, item: { id: 'p1', title: 'X', menuActions: [two actions] } })` (menu actions live on the item, as in the existing test at `:91`). Focus the first item. ArrowDown focuses the second, and ArrowUp returns to the first. `onOpen` and `onToggleSelected` are never called. Mutation (combine): remove `entries[next]?.focus();`. **Chrome look owed** at combine: Tab into the menu, arrows, Enter, and Escape closing from a focused item."

### H-LIST-NEWS · Tovu · merge-6
"As designed for the edit: in `createNewsletterListSendLogHandler` (`apps/website/src/features/newsletter/tool-registrations.ts:351–360`), call `listByCampaign({ workspaceId: deps.workspaceId, campaignId, limit: DEFAULT_LIST_LIMIT + 1 })` and return `{ sends: rows.slice(0, DEFAULT_LIST_LIMIT).map(toSendLogToolView), truncated: rows.length > DEFAULT_LIST_LIMIT }`. Add `import { DEFAULT_LIST_LIMIT } from "./repo-subscribers.js";`. In `agent-tools.ts` (the `newsletter_list_send_log` description), append: ` Returns at most 100 rows; truncated: true means more rows exist.`
**Test (write it first):** in `__tests__/tool-registrations.model-facing-errors.test.ts`, update the existing one-row payload (`:318`) to add `truncated: false`. Add **one** test. Seed exactly 100 sends for one campaign with `deps.newsletterSendRepo.save`. Assert 100 rows and `truncated: false`. Save a 101st and assert 100 rows in id order and `truncated: true`. No other cases. Mutations (combine): `+ 1` removed; `>` → `>=`. Record the model-output shape change in COMMIT-PLAN.md. The admin route `routes/newsletter/list-send-log.ts` is NOT touched."

### H-LIST-VISITOR · Tovu · merge-6
"Edit as designed: in `apps/website/src/assistant/site/tools.ts`, change only `search_published_entries` to `Promise<{ entries: readonly PublicEntrySummary[]; truncated: boolean }>`. Return `{ entries: matched.slice(0, limit).map(toSummary), truncated: matched.length > limit }`. Change the schema description (`:258–259`) to `"Search this site's published posts and pages by title or slug. Returns summaries only, at most 20 by default; truncated: true means more matched. Omit query to list published entries."`. Leave `capability-registry.ts` unchanged.
**Test (write it first):** in `__tests__/tools.test.ts`, change the existing `maxResults` case (`:225–239`) so that it asserts `truncated: true` above the cap. Add one assertion at exactly the cap with `truncated: false`. Repoint the other direct reads (`:114,122,148,160–163`) to `.entries`. In `capability-registry.test.ts:106`, change only the existing cast's type to `{ result: { entries: readonly { slug: string }[] } }` and read `.result.entries`. No new registry case. Check `server/__tests__/visitor-assistant-safety.integration.test.ts:180–200`: it matches on the JSON text, so it needs no edit. Record the model-output shape change in COMMIT-PLAN.md. **Chrome look owed:** visitor chat with more than 20 public matches."

## BUGS (confirmed on merge-6)
1. Jini `packages/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx:30–32`: a `role="menu"` with no arrow-key navigation. It also stops every keydown, so Escape from a focused item never reaches the board's `window` Escape listener (`hooks/useResourceBoard.ts:184–193`; React's root listener stops native propagation). Fix: H2-A11Y-RESOURCE.
2. Tovu `apps/website/src/features/newsletter/tool-registrations.ts:358`: the send-log tool silently returns the first 100 rows. Fix: H-LIST-NEWS.
3. Tovu `apps/website/src/assistant/site/tools.ts:210` with `:258–259`: visitor search silently caps at 20 while its description says it lists everything. Fix: H-LIST-VISITOR.
4. Tovu `apps/website/src/server/inbound/admin-http/routes/newsletter/list-send-log.ts:23`: the admin send-log route has the same silent 100-row cap. Not in the design; unsheeted (see NEEDS-DECISION).
5. Tovu `apps/website/src/server/runtime/composition/other-site-keys.ts:142–144`: saved keys past 50 per site are silently hidden (design H-LIST-KEYS, PARTIAL).

Not bugs: H-ABORT-DEPLOY (executor guard) and H2-A11Y-ASSET (not a menu).

## NEEDS-DECISION (one line each, with recommendation)
- **H2-CATCH-AWAIT:** keep the four current failure envelopes? **Yes**: `asyncRoute` already forwards a second rejection. No change.
- **H2-SEM-PASSWORD:** should interactive new-site creation require an owner password when the parked fix resumes? **Yes**, and never change existing passwords automatically.
- **H2-SEM-CORS:** localhost developer CORS only in dev mode? **Yes**, after listing the desktop callers. One small Opus design, not Codex.
- **H2-SEM-MENU:** require full admin for raw menu HTML writes, tools included? **Yes**, through the existing authorization path. One security sheet in the next round.
- **H2-A11Y-CAPTIONS:** add caption and transcript tracks to media? **Not now**: it is a new feature, not hygiene. Park it in the backlog.
- **Admin send-log cap (BUGS 4):** add `afterId` paging to `GET .../newsletter/campaigns/:id/sends` with the admin UI? **Yes, later**, as one paired route+UI sheet. Not part of this job (that would widen the admin contract).

## Jobs
- **`j-hya-jini-DRAFT.md`** (Jini, base merge-6 `d3e78b387`, 1 sheet): H2-A11Y-RESOURCE. ~2k executor tokens; best batched with other Jini sheets.
- **`j-tv-hya-DRAFT.md`** (Tovu, base merge-6 `776ce6d0f`, 2 sheets): H-LIST-NEWS → H-LIST-VISITOR. No Jini dependency.
- **Combine owes:** the three mutations, two Chrome looks, and the H2-PKG lock job (CLOUD).
- **Dropped:** H2-A11Y-ASSET, H-ABORT-DEPLOY, the `react/menu-keyboard.ts` helper, the new registry test, the separate at-cap newsletter test (folded into one).
