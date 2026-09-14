# Code audit progress

- Repository: `/Users/la/Programming/Tovu`
- Branch: `restructure/apps-website-phased`
- Frozen HEAD: `efc6847ed4490d0f57cd94d16b8cf46a6489a88a`
- Window: `4b89cd09..efc6847ed4490d0f57cd94d16b8cf46a6489a88a` (243 commits)
- Started: 2026-09-06; initial 1-minute load 5.77 (<40).
- Source review at frozen HEAD, using history only to map scope. Tests are excluded from reading/auditing and execution. No tests, typechecks, builds, servers, database opens, commits, or source writes are permitted.
- Writes confined to this directory. Existing untracked files are excluded.
- Explicit scope extensions: commit `570e5822` backfill default and Jini `packages/cms` identity seed commits `434d781e`, `be29a436`.
- Bootstrap: `AI-Dev-Shop/AGENTS.md` loaded. Structured audit dispatch: interactive startup/session-file writes skipped under user write restrictions.
- Graph discovery attempted; source is authoritative when graph is missing or stale.
- Findings: `01-media-import-http.md` has MI-01 and MI-02; audit in progress.
- Inventory discrepancy: Git reports 243 commits (all 2026-09-06), not 242. Exact requested endpoints retained.
- Subagent support verified from active platform tool surface; read-only bounded correctness reviews assigned for desktop, admin, and content/identity. The local resolver script is not run because it contains stderr suppression forbidden by this audit.
- Graph is indexed but stale/incomplete: `installFirstPartyToolContributors` is present; new media-import and HTTP functions are absent. No index rebuild (read-only audit and machine load constraints).

## Coverage ledger

`pending` means source review has not been completed. A reviewed commit means its surviving in-scope HEAD code was read and relevant call paths traced, not that all conceivable behavior is proven. Deleted/overwritten implementations are deliberately excluded. Detailed paths are retained in `commit-inventory.json`.

| Commit | Date | Status | Subject / reason |
|---|---|---|---|
| efc6847e | 2026-09-06 | skipped | docs(ads-memory): handoff for session tovu-14 — No in-scope production code (documentation/tests/generated or outside apps). |
| 0bfd3430 | 2026-09-06 | skipped | docs(ads-memory): record that commit trailers misattribute the model — No in-scope production code (documentation/tests/generated or outside apps). |
| b06b4ec7 | 2026-09-06 | skipped | docs(todos): close the two entries tonight's work shipped — No in-scope production code (documentation/tests/generated or outside apps). |
| 37ac1943 | 2026-09-06 | pending | feat(admin/settings): show the operator which external MCP tools the assistant refused |
| f02ac28e | 2026-09-06 | pending | fix(desktop/projects): stop a failed rescan blanking the grid, and unstack the header |
| c201d948 | 2026-09-06 | pending | feat(desktop/projects): add a Rescan control so discovery is not only a boot step |
| 65b8fd74 | 2026-09-06 | reviewed | feat(desktop/projects): scan for sites on disk at boot, so one made outside the shell appears |
| 4ede4562 | 2026-09-06 | skipped | fix(e2e/types): type the desktop-shell application-menu walk instead of leaving it implicitly any — No in-scope production code (documentation/tests/generated or outside apps). |
| 0d9e41d5 | 2026-09-06 | pending | feat(mcp-federation): tell the MODEL which external tools were refused, and why |
| e56965a6 | 2026-09-06 | pending | fix(admin/types): clear the 31-error tsc baseline in apps/admin |
| 8e973578 | 2026-09-06 | pending | fix(admin/workspace): refuse deleting the server's own bound workspace (INV-05) |
| 8a4e405d | 2026-09-06 | pending | fix(admin/menus): log the update-tree catch-all 500 instead of discarding it |
| b2a46c7e | 2026-09-06 | reviewed | feat(desktop/projects): record removals, so the seed guard can ask about the directory |
| 24bdafc1 | 2026-09-06 | skipped | test(media-import): prove the bytes, not that a row exists — No in-scope production code (documentation/tests/generated or outside apps). |
| a346b3ec | 2026-09-06 | pending | feat(assistant): make media_import_from_url findable, and close the catalog gap |
| dd187ece | 2026-09-06 | reviewed | feat(media-import): add media_import_from_url, the missing import-by-URL tool |
| b1ce2d0a | 2026-09-06 | reviewed | feat(platform/http): make the guarded HttpResponse byte-capable |
| fb5ad748 | 2026-09-06 | skipped | docs(todos): mark the non-basic theme shells out of scope — No in-scope production code (documentation/tests/generated or outside apps). |
| 0ea4f887 | 2026-09-06 | skipped | docs(ads-memory): record three commits carrying another commit's message — No in-scope production code (documentation/tests/generated or outside apps). |
| fa70c175 | 2026-09-06 | skipped | docs(ads-memory): record that the media-seed fix DID deploy, and the regression since — No in-scope production code (documentation/tests/generated or outside apps). |
| 68ce4909 | 2026-09-06 | skipped | docs(todos): close the HTML-Page fallback-shell entry against a live measurement — No in-scope production code (documentation/tests/generated or outside apps). |
| 570e5822 | 2026-09-06 | pending | fix(scripts): stop backfill-external-mcp-aad defaulting --db to the live site database |
| b27cdba4 | 2026-09-06 | pending | refactor(admin/menus): move ItemRow's Remove-confirmation logic into MenuEditor.hooks.tsx |
| 9e77a778 | 2026-09-06 | pending | feat(desktop): restore the tab strip and embedded project workspace |
| 204e01a7 | 2026-09-06 | pending | feat(desktop): embed a project as a tab, not a new BrowserWindow |
| c2e206db | 2026-09-06 | skipped | docs(ads-memory): map Tovu Runner and its connection to Tovu — No in-scope production code (documentation/tests/generated or outside apps). |
| 3bc9a415 | 2026-09-06 | reviewed | fix(desktop/e2e): stop the e2e suite writing into the real Electron userData dir |
| fc3bff7c | 2026-09-06 | skipped | docs(todos): file the single-window desktop shell and two gaps found live — No in-scope production code (documentation/tests/generated or outside apps). |
| 2b69b327 | 2026-09-06 | skipped | fix(admin/settings): restore the tsc baseline in the field-spec test — No in-scope production code (documentation/tests/generated or outside apps). |
| f50b8463 | 2026-09-06 | skipped | test(admin/settings): add exhaustive route-vs-field-spec coverage for External MCP — No in-scope production code (documentation/tests/generated or outside apps). |
| 6df1f9a7 | 2026-09-06 | pending | refactor(admin/hooks): adopt useSettlementGeneration at 8 call sites |
| cc01bce7 | 2026-09-06 | skipped | docs(todos): settle the footer menu content-ref-vs-raw-URL question — No in-scope production code (documentation/tests/generated or outside apps). |
| 6bf0fc86 | 2026-09-06 | skipped | docs(todos): re-measure the footer dead-links entry against the running site — No in-scope production code (documentation/tests/generated or outside apps). |
| ae13e739 | 2026-09-06 | pending | fix(admin): add the missing writeAllowedToolNames field spec |
| c171e62b | 2026-09-06 | pending | feat(admin/hooks): extract shared useSettlementGeneration guard |
| 13acf9d3 | 2026-09-06 | skipped | docs(ads-memory): explain the AAD backfill scripts and the --db asymmetry — No in-scope production code (documentation/tests/generated or outside apps). |
| 01146403 | 2026-09-06 | pending | fix(admin): drop invalid button-in-anchor nesting on 8 more screens |
| ab022bae | 2026-09-06 | skipped | docs(ads-memory): record boot-orchestration dedup fix report — No in-scope production code (documentation/tests/generated or outside apps). |
| d1eea4b2 | 2026-09-06 | pending | refactor(boot): dedupe agentDaemonWanted/logCriticalBootFailures; close export's migration-scan gap |
| ed397627 | 2026-09-06 | skipped | chore(scripts): add operator-invoked cleanup for stale owner sessions — No in-scope production code (documentation/tests/generated or outside apps). |
| 8d041b52 | 2026-09-06 | pending | refactor(outbox): move the retry-cap terminal-state decision into the worker |
| 874ee54d | 2026-09-06 | skipped | docs(ads-memory): correct C1 -- the .btn-* fix was never missing — No in-scope production code (documentation/tests/generated or outside apps). |
| 530d6122 | 2026-09-06 | pending | fix(admin): drop invalid button-in-anchor nesting on 3 more back/create links |
| a44148a1 | 2026-09-06 | pending | fix(admin/collections): drop invalid button-in-anchor nesting; correct stale CSS comment |
| 4c6a0797 | 2026-09-06 | pending | refactor(auth): delegate mintSessionForPrincipal to Jini's shared minter |
| 1044e2d5 | 2026-09-06 | pending | fix(render): escape apostrophes in every escapeHtml/escapeHtmlAttr copy |
| 4c65e392 | 2026-09-06 | pending | fix(admin-voice-input): release the mic if held released mid-permission-prompt |
| f31e6ded | 2026-09-06 | pending | fix(sites): thread the real boot-resolved site binding through RouteDeps instead of re-deriving it per request |
| 00bc4bd6 | 2026-09-06 | pending | fix(admin-security): stop "Make default" from also toggling its own row |
| ee14d334 | 2026-09-06 | skipped | test(backfill-execution-aad): refresh fixture tripwire for migration 0058 — No in-scope production code (documentation/tests/generated or outside apps). |
| 527077b6 | 2026-09-06 | skipped | test(assistant): fix stale audit-detail assertion in byok-tool-surface INCIDENT FIX test — No in-scope production code (documentation/tests/generated or outside apps). |
| 80e69410 | 2026-09-06 | skipped | docs(reports): mark the AAD backfill dedupe report complete — No in-scope production code (documentation/tests/generated or outside apps). |
| a68526dd | 2026-09-06 | skipped | refactor(scripts): migrate backfill-external-mcp-aad.ts onto the shared runner — No in-scope production code (documentation/tests/generated or outside apps). |
| a19708d3 | 2026-09-06 | skipped | test(scripts): add a characterization test for backfill-external-mcp-aad.ts — No in-scope production code (documentation/tests/generated or outside apps). |
| 916eb8b0 | 2026-09-06 | pending | refactor(deps): wire deps.ts onto the shared single-hop HTTPS egress policy |
| 7b2a2007 | 2026-09-06 | pending | refactor(platform/http): extract the shared single-hop HTTPS egress policy |
| 384790fa | 2026-09-06 | skipped | docs(reports): admin visual polish — six-combination proof of the Settings light pin — No in-scope production code (documentation/tests/generated or outside apps). |
| f1b13b38 | 2026-09-06 | skipped | test(admin/settings): pin that the Settings page cannot render dark — No in-scope production code (documentation/tests/generated or outside apps). |
| 7caa2b71 | 2026-09-06 | pending | fix(post): enqueue entry.published when a post/page is created already published |
| 7b138c50 | 2026-09-06 | skipped | refactor(scripts): migrate backfill-site-assistant-credential-aad.ts onto the shared runner — No in-scope production code (documentation/tests/generated or outside apps). |
| 0af0748e | 2026-09-06 | skipped | refactor(scripts): migrate backfill-media-provider-credential-aad.ts onto the shared runner — No in-scope production code (documentation/tests/generated or outside apps). |
| 3f0c9915 | 2026-09-06 | skipped | refactor(scripts): migrate backfill-execution-credential-aad.ts onto the shared runner — No in-scope production code (documentation/tests/generated or outside apps). |
| 08ace3ea | 2026-09-06 | pending | fix(assistant): route BYOK's tool executor through the shared read-only-gated stack |
| 11aa4708 | 2026-09-06 | pending | fix(identity): register this repo's pages.edit_html grant in the backfill script, without crashing its dry run |
| 6be26ddb | 2026-09-06 | skipped | test(site-glue): fix REQ-8 assertion that relied on the pre-fix immediate-reclaim bug — No in-scope production code (documentation/tests/generated or outside apps). |
| d3161f2e | 2026-09-06 | skipped | refactor(scripts): migrate backfill-connector-credential-aad.ts onto the shared runner — No in-scope production code (documentation/tests/generated or outside apps). |
| 947c0fa1 | 2026-09-06 | skipped | refactor(scripts): migrate backfill-composio-config-aad.ts onto the shared runner — No in-scope production code (documentation/tests/generated or outside apps). |
| 5ae37c8b | 2026-09-06 | skipped | docs(reports): admin visual polish — add the two Settings-pin commits to the commit list — No in-scope production code (documentation/tests/generated or outside apps). |
| ea8c660b | 2026-09-06 | skipped | docs(reports): admin visual polish — Settings pinned to light, inert-control consequence — No in-scope production code (documentation/tests/generated or outside apps). |
| 89c8c380 | 2026-09-06 | pending | design(admin/settings): pin the page to light and take it fully out of the card |
| 5182994a | 2026-09-06 | skipped | refactor(scripts): add shared AAD backfill scaffold, not yet wired to any script — No in-scope production code (documentation/tests/generated or outside apps). |
| 7d7ae169 | 2026-09-06 | pending | fix(members): correct decideTiersAccess's @complexity from O(t) to O(t·a) |
| 0ae3429d | 2026-09-06 | pending | fix(outbox): stop immediate re-queue, add exponential backoff and an attempt cap |
| a9a6e3a9 | 2026-09-06 | pending | fix(export): scheme-check the redirect stub's href sinks |
| d10f6708 | 2026-09-06 | skipped | docs(reports): record theme content-template naming drift investigation — No in-scope production code (documentation/tests/generated or outside apps). |
| 2b039738 | 2026-09-06 | pending | test(auth): add the boot-session route's first server-side test; fix a false comment |
| 563e58af | 2026-09-06 | skipped | docs(reports): admin visual polish pass, 2026-09-06 — No in-scope production code (documentation/tests/generated or outside apps). |
| 933c69e9 | 2026-09-06 | pending | design(admin): give the Database and Sites tab rows the icons every other tab row has |
| bc22ff14 | 2026-09-06 | pending | design(admin): apply the form measure to the Users and Integrations create forms |
| b8c321ef | 2026-09-06 | skipped | docs(reports): excess/dead-code review of the 2026-09-01 to 09-03 commits — No in-scope production code (documentation/tests/generated or outside apps). |
| ad20fc76 | 2026-09-06 | skipped | docs(review): add architecture/DI review for 2026-09-01 to 2026-09-03 — No in-scope production code (documentation/tests/generated or outside apps). |
| 9f13f0e3 | 2026-09-06 | pending | design(admin/settings): take the Settings surface out of its card when it renders light |
| 262a596b | 2026-09-06 | skipped | docs(reports): bug-hunt review of 2026-09-01 to 09-03 commits (292, unreviewed window) — No in-scope production code (documentation/tests/generated or outside apps). |
| e332ec33 | 2026-09-06 | reviewed | fix(desktop): stop minting a fresh 30-day session on every launch |
| b357e70c | 2026-09-06 | skipped | docs(architecture): reconcile ADR-INDEX with three missing ADRs and the ADR-047 audit-gap — No in-scope production code (documentation/tests/generated or outside apps). |
| 26985a2d | 2026-09-06 | pending | design(admin/media): draw the tab strip with the shared TabBar, with icons |
| fe0046dd | 2026-09-06 | pending | design(admin/sites): make the card's head its status strip; demote the second pill to a footnote |
| ff5513fa | 2026-09-06 | skipped | docs(ads-memory): consolidated handoff from session tovu-8f — No in-scope production code (documentation/tests/generated or outside apps). |
| 645f3221 | 2026-09-06 | pending | design(admin): give single-column forms one shared measure instead of the full column |
| 9051e2b5 | 2026-09-06 | pending | fix(site-dir): stop duplicateContentDb wiping every plugin's data from the copy |
| 96f656cd | 2026-09-06 | skipped | docs(todos): pass 8 additions — record the tovu-8f peer handoff — No in-scope production code (documentation/tests/generated or outside apps). |
| b3553dd9 | 2026-09-06 | pending | fix(media): escape the last three literal NUL bytes in tracked source |
| 5152128e | 2026-09-06 | skipped | docs(ads-memory): close out the todos de-stale report — No in-scope production code (documentation/tests/generated or outside apps). |
| e99249e2 | 2026-09-06 | skipped | docs(todos): de-stale pass 7 — the tail sections — No in-scope production code (documentation/tests/generated or outside apps). |
| c71c5923 | 2026-09-06 | skipped | docs(todos): de-stale pass 6 — Master Build Inventory sections 19-25 — No in-scope production code (documentation/tests/generated or outside apps). |
| 210b3751 | 2026-09-06 | skipped | docs(todos): de-stale pass 5 — Master Build Inventory sections 1-18 — No in-scope production code (documentation/tests/generated or outside apps). |
| ea5f3a42 | 2026-09-06 | pending | fix(repo): escape literal NUL bytes in source so git and grep can read them |
| 27ccb328 | 2026-09-06 | pending | fix(admin-security): name every access-token dialog and give ambiguous per-row buttons distinct names |
| 00718e89 | 2026-09-06 | pending | fix(admin-database): give every timeline row's Recovery link a distinct accessible name |
| ec725ad8 | 2026-09-06 | pending | fix(admin-recovery): give every row's Restore button a distinct accessible name |
| af8d083a | 2026-09-06 | skipped | docs(todos): de-stale pass 4 — Accomplish, ADR map, research backlogs — No in-scope production code (documentation/tests/generated or outside apps). |
| 0d63cfd8 | 2026-09-06 | pending | fix(site-dir): stop duplicateSite shipping the source site's private databases |
| 6528ed5a | 2026-09-06 | skipped | docs(todos): restore four sections pass 3 deleted by mistake — No in-scope production code (documentation/tests/generated or outside apps). |
| ef7fa9c8 | 2026-09-06 | pending | feat(chat-db): detect conversations stranded in content.db by the chat.db split |
| abfc98fe | 2026-09-06 | pending | fix(admin-taxonomy): term rows get a real role, valid selected-state, and a clean name |
| e2aafba6 | 2026-09-06 | pending | fix(admin-sites): give every site card's Activate button a per-site accessible name |
| 3d702539 | 2026-09-06 | pending | fix(admin-plugins): give repeated Enable/Disable/Inspect buttons a per-row accessible name |
| 30288302 | 2026-09-06 | skipped | docs(todos): de-stale pass 3 — Active Working Items AW-1..AW-7 — No in-scope production code (documentation/tests/generated or outside apps). |
| d10486d5 | 2026-09-06 | pending | fix(admin-themes): give repeated Activate/Explore/Download buttons a per-card accessible name |
| 6442b34f | 2026-09-06 | pending | fix(form-render): setInputValueAttr can't span an embedded opposite quote char |
| 5e593ab4 | 2026-09-06 | skipped | docs(todos): de-stale pass 2 — Admin Section Spec Sweep + 2026-08-10 slice — No in-scope production code (documentation/tests/generated or outside apps). |
| cb3789a9 | 2026-09-06 | skipped | fix(gitignore): close chat.db + db-snapshot leak opened by the content.db split — No in-scope production code (documentation/tests/generated or outside apps). |
| df07b37c | 2026-09-06 | skipped | docs(todos): de-stale pass 1 — top-of-file dated entries — No in-scope production code (documentation/tests/generated or outside apps). |
| fe76057d | 2026-09-06 | pending | fix(admin-media): give the upload toolbar's file/alt inputs a real accessible name |
| 552e806d | 2026-09-06 | skipped | docs(reports): code-inspection bug hunt for the 2026-09-04/05 commits — No in-scope production code (documentation/tests/generated or outside apps). |
| 0b298d86 | 2026-09-06 | pending | feat(assistant): serve a staged chat attachment's bytes back to its uploader |
| 3b196ffb | 2026-09-06 | pending | refactor(assistant): give the chat-attachment upload directory one definition |
| efeeb67a | 2026-09-06 | pending | fix(admin-themes): remove invalid button-in-anchor nesting on ThemeExplore's back control |
| f239866e | 2026-09-06 | pending | feat(admin-posts): tell the operator when autosave has stopped, instead of nothing |
| e5a434c3 | 2026-09-06 | pending | feat(admin-pages): tell the operator when autosave has stopped, instead of nothing |
| 52caa8cc | 2026-09-06 | skipped | docs(reports): scrub a NUL byte the report tool itself introduced; note it as F4 evidence — No in-scope production code (documentation/tests/generated or outside apps). |
| a9aac85b | 2026-09-06 | skipped | docs(reports): un-corrupt the 2026-09-04..05 excess-code review (literal NUL -> escape text) — No in-scope production code (documentation/tests/generated or outside apps). |
| ee304d5e | 2026-09-06 | skipped | docs(reports): architecture & DI review of the 2026-09-04/05 commits — No in-scope production code (documentation/tests/generated or outside apps). |
| ef79b352 | 2026-09-06 | skipped | docs(reports): excess/dead-code review of the 2026-09-04..05 commits — No in-scope production code (documentation/tests/generated or outside apps). |
| 6f32d027 | 2026-09-06 | pending | refactor(website): inject the tool-attempt audit sink; drop RouteDeps.contentDbPath |
| 0c1a1324 | 2026-09-06 | skipped | chore(architecture): register cli/commands/adopt.ts as a composition root — No in-scope production code (documentation/tests/generated or outside apps). |
| b37864c3 | 2026-09-06 | pending | feat(post-tools): wire expectedVersion through content_post_update, the guard's last unwired arm |
| 2756ac26 | 2026-09-06 | pending | refactor(posts): lift expectedVersion's boundary out of the route so a second arm can share it |
| 2bb817f6 | 2026-09-06 | skipped | test(admin-seo): make the cleared-field test assert what its name claims — No in-scope production code (documentation/tests/generated or outside apps). |
| 62634037 | 2026-09-06 | pending | feat(cli): add `tovu adopt <dir>` -- the missing route from an existing site dir to serve |
| 6998ef9c | 2026-09-06 | pending | refactor(site-dir): expose the marker-pair classification repairSite already computed |
| a50458bf | 2026-09-06 | pending | fix(desktop): reap orphaned tovu serve on every boot mode, never a live sibling's |
| d033ffb8 | 2026-09-06 | pending | fix(admin-seo): let an operator clear an SEO override, not just blank it |
| 90e68e8f | 2026-09-06 | pending | docs(posts-autosave): correct a route comment that described client logic which never existed |
| a60e07e8 | 2026-09-06 | pending | fix(admin-autosave): act on putAutosave's `applied` instead of discarding it |
| ed5fae17 | 2026-09-06 | pending | fix(desktop): refuse to rm a project directory the app did not create |
| 72e1e529 | 2026-09-06 | pending | fix(assistant): stop every source edit from destroying staged chat attachments |
| f3bdd3af | 2026-09-06 | pending | feat(admin-posts): send the loaded version and surface the 409 without losing the operator's work |
| fb473613 | 2026-09-06 | pending | feat(admin-settings): pass agentHandle to the 11 @jini-ai/ui-mounted Settings tabs |
| b359e613 | 2026-09-06 | pending | fix(website): add RouteDeps.contentDbPath and make the BYOK tool-audit sink lazy |
| e595312f | 2026-09-06 | pending | types(admin-api): let api.updatePost carry an optional expectedVersion |
| 76d7c739 | 2026-09-06 | reviewed | fix(desktop): one adoption chokepoint for every site-dir entry point |
| ffc37e59 | 2026-09-06 | skipped | docs(ads-memory): refactor review of the 2026-09-06 commits - excess and dead code — No in-scope production code (documentation/tests/generated or outside apps). |
| b81d57b1 | 2026-09-06 | skipped | docs(ads-memory): code-inspection bug hunt over the 2026-09-06 commits — No in-scope production code (documentation/tests/generated or outside apps). |
| 4e64e467 | 2026-09-06 | skipped | docs(ads-memory): architecture and DI review of the 2026-09-06 commits — No in-scope production code (documentation/tests/generated or outside apps). |
| eb678ed3 | 2026-09-06 | pending | feat(voice-input): add a "Disabled for now" tooltip to the mic button |
| 9c7d16bf | 2026-09-06 | pending | feat(posts-route): forward expectedVersion and give the version 409 its own code |
| a9f84cdc | 2026-09-06 | pending | refactor(admin-pages): bring PageEditor under the 9/9 complexity ceiling |
| 0b7b6de1 | 2026-09-06 | pending | fix(admin-pages): let a newly created page accept hand-authored HTML |
| be45461e | 2026-09-06 | pending | feat(post): add opt-in optimistic-concurrency check to updatePost |
| f92e835f | 2026-09-06 | skipped | docs(ads-memory): record the f3579456 authorship misattribution — No in-scope production code (documentation/tests/generated or outside apps). |
| bbd297d8 | 2026-09-06 | reviewed | fix(desktop): make Projects-screen seeding survive an emptied registry |
| 013ca04e | 2026-09-06 | skipped | docs(ads): record the outstanding worklist from session tovu-f6 — No in-scope production code (documentation/tests/generated or outside apps). |
| 7afe17a7 | 2026-09-06 | skipped | docs(admin): correct pages/posts as done, not permanently excluded — No in-scope production code (documentation/tests/generated or outside apps). |
| 48bf42c8 | 2026-09-06 | pending | fix(admin-posts): tag PostEditor's delete ConfirmDialog with agentHandle |
| f3579456 | 2026-09-06 | pending | feat(admin-pages): tag PageEditor's remaining view/device controls |
| 3ad87f39 | 2026-09-06 | pending | feat(admin-pages): tag ThemePagesTab and ThemePageDetailsModal controls |
| 2202253d | 2026-09-06 | pending | feat(admin-pages): tag Pages.tsx's list and tab controls |
| 56f6b46b | 2026-09-06 | pending | feat(admin-posts): tag Posts.tsx's list controls |
| 6462865e | 2026-09-06 | skipped | docs(admin): correct the Access Tokens live-verification handle names — No in-scope production code (documentation/tests/generated or outside apps). |
| fe5c8974 | 2026-09-06 | skipped | docs(admin): record Phase 4 - ai-assistant, media, and the 8 spot-check screens — No in-scope production code (documentation/tests/generated or outside apps). |
| c84559e8 | 2026-09-06 | pending | fix(admin-security): tag credential fields and Cancel/trigger buttons |
| 34a69401 | 2026-09-06 | pending | fix(admin-deployment): tag the two remaining external links on Static Site |
| 273b43cb | 2026-09-06 | pending | fix(admin): tag remaining agent-driveable gaps in sites and collections |
| 935762a5 | 2026-09-06 | pending | fix(admin-media): pass agentHandle to the purge ConfirmDialog |
| 978a7ca3 | 2026-09-06 | pending | feat(admin-ai-assistant): tag AiAssistant screen's Tovu-owned controls |
| 125b8dcc | 2026-09-06 | skipped | docs(admin): record pages/posts as permanently excluded from the agent-tag sweep — No in-scope production code (documentation/tests/generated or outside apps). |
| 8383d732 | 2026-09-06 | skipped | docs(admin): record Phase 3 live verification and handoff for the agent-tag sweep — No in-scope production code (documentation/tests/generated or outside apps). |
| ffc6ce5e | 2026-09-06 | skipped | docs(admin): update agent-tag coverage report through the settings pass — No in-scope production code (documentation/tests/generated or outside apps). |
| 7637876d | 2026-09-06 | pending | feat(admin-settings): tag the Tovu-owned controls on /admin/settings |
| feb8a777 | 2026-09-06 | pending | feat(assistant): add chat_list_pending_attachments so the model can find unclaimed uploads |
| fb5a1909 | 2026-09-06 | pending | feat(admin-themes): tag the remaining controls on the main Themes screen |
| 98e3021c | 2026-09-06 | pending | feat(admin-payments): tag the three cross-links on /admin/payments |
| d52258af | 2026-09-06 | pending | feat(admin-plugins): tag Plugins, AgentPlugins, and the plugin details modal |
| 10efb899 | 2026-09-06 | pending | fix(autosave): flush the pending standing draft on exit instead of cancelling it |
| eb10f5de | 2026-09-06 | pending | fix(seo): allow clearing a per-entry SEO override via null |
| c08155f2 | 2026-09-06 | pending | feat(admin-redirects): tag every control on /admin/redirects |
| be0f582a | 2026-09-06 | pending | feat(admin-integrations): tag the remaining controls on /admin/integrations |
| b5439d94 | 2026-09-06 | pending | feat(admin-workspace): tag the rename form and delete button |
| a5dd5e09 | 2026-09-06 | pending | feat(admin-recovery): tag every control on /admin/recovery |
| c629c0e6 | 2026-09-06 | pending | feat(admin-widgets): tag every control across all four widgets screens |
| cdb205a5 | 2026-09-06 | pending | feat(admin-dashboard): tag every link on the Overview screen |
| f7b8af1c | 2026-09-06 | skipped | test(assistant): prove media_promote_chat_attachment is generic, not AVIF-specific — No in-scope production code (documentation/tests/generated or outside apps). |
| 6e71742c | 2026-09-06 | pending | feat(admin): wire agentHandle onto every remaining untagged ConfirmDialog |
| 1d5c0376 | 2026-09-06 | skipped | docs(desktop-e2e): correct a comment that promised isolation the suite does not have — No in-scope production code (documentation/tests/generated or outside apps). |
| f281d3a2 | 2026-09-06 | pending | feat(assistant): add media_promote_chat_attachment, bridging chat uploads into the media library |
| e804d16d | 2026-09-06 | pending | feat(admin-comments): tag every control on /admin/comments |
| cbbda021 | 2026-09-06 | pending | feat(admin): tag Members' remaining controls and wire ConfirmDialog handles |
| 54051fe3 | 2026-09-06 | pending | fix(desktop): rename the fleet window title from Tovu Runner to Tovu |
| 7198436e | 2026-09-06 | pending | feat(admin-seo): tag the per-entry override editor and picker for agent driving |
| a53c80df | 2026-09-06 | pending | feat(desktop): make the Projects screen the default front page |
| a4efd9c2 | 2026-09-06 | pending | feat(admin-roles): tag the remaining untagged controls on /admin/roles |
| 4f2052f6 | 2026-09-06 | pending | fix(admin-assistant): move the composer mic button next to the "+" |
| 79ade955 | 2026-09-06 | pending | feat(admin-database): tag every interactive control on /admin/database |
| ab5f4b0f | 2026-09-06 | pending | feat(admin): wire agentHandle through every Placeholder-backed nav page |
| 8cfb8eb9 | 2026-09-06 | skipped | docs(admin): audit agentHandle coverage across every nav-listed admin page — No in-scope production code (documentation/tests/generated or outside apps). |
| 27a05955 | 2026-09-06 | skipped | docs: handoff for the rotated-out autosave-drafts agent — No in-scope production code (documentation/tests/generated or outside apps). |
| 34694309 | 2026-09-06 | pending | wip(posts): autosave recovery banner in PostEditor, state unverified |
| a4b99c90 | 2026-09-06 | pending | feat(pages): render the standing-draft recovery banner in PageEditor |
| 559655cb | 2026-09-06 | pending | feat(posts): wire standing-draft autosave into usePostEditor; fix slug URLs |
| 0911b45d | 2026-09-06 | skipped | docs: record that both handoff tasks belong to the peer session — No in-scope production code (documentation/tests/generated or outside apps). |
| 3f6097dc | 2026-09-06 | pending | design(admin/seo): drop the Entry caption and take Pages & posts full width |
| 24386850 | 2026-09-06 | skipped | docs: handoff for a second session - mic button, and the AVIF upload bridge — No in-scope production code (documentation/tests/generated or outside apps). |
| 05782b71 | 2026-09-06 | pending | feat(pages): wire standing-draft autosave + add the missing unsaved-work guard |
| 3a3dea2b | 2026-09-06 | pending | docs(admin/seo): correct the file header the de-carding made stale |
| 613ea7e2 | 2026-09-06 | pending | design(admin/seo): take the per-entry panels out of their boxes too |
| 9ac963e0 | 2026-09-06 | pending | fix(posts): standing-draft autosave carries title explicitly |
| f8fc6b8e | 2026-09-06 | pending | design(admin/seo): take the defaults form and sitemap panel out of their cards |
| 56a0fc09 | 2026-09-06 | pending | feat(admin): shared standing-draft autosave hook + api client functions |
| eba275f4 | 2026-09-06 | pending | feat(posts): standing-draft autosave persistence + HTTP surface (posts+pages) |
| 868cfe72 | 2026-09-06 | pending | feat(desktop): route project cards to their own window, strip the webview model |
| 04806e6b | 2026-09-06 | pending | feat(media): accept AVIF in the admin upload surfaces, with regression tests |
| 72a8dcb6 | 2026-09-06 | pending | feat(admin-roles): convert /admin/roles to a two-tab screen |
| e94da8f8 | 2026-09-06 | pending | feat(posts): add nullable posts.autosave_json column for standing-draft autosave |
| 20be2646 | 2026-09-06 | skipped | docs(tasks): refresh - 23 commits landed, four agents in flight, five new findings — No in-scope production code (documentation/tests/generated or outside apps). |
| cbb727db | 2026-09-06 | reviewed | fix(desktop): restore own-server boot mode gutted by the boot-token commit |
| 56e87ae0 | 2026-09-06 | pending | feat(admin-seo): convert /admin/seo to a three-tab screen |
| 2c6e0b07 | 2026-09-06 | pending | fix(post-editor): move preview-fallback notice above the frame, mirroring Pages |
| cf05115c | 2026-09-06 | skipped | docs(desktop): handoff for the rotated-out runner-ui-port agent — No in-scope production code (documentation/tests/generated or outside apps). |
| 15548bef | 2026-09-06 | pending | feat(auth): loopback boot token — the desktop admin comes up with no password |
| 0a1fb89e | 2026-09-06 | pending | fix(admin-settings): remove the peach background from /admin/settings |
| 30e68c54 | 2026-09-06 | pending | fix(admin-editors): compress the action row's band and give it a left anchor |
| de1e1e2e | 2026-09-06 | skipped | test(desktop-e2e): assert the admin comes up authenticated — No in-scope production code (documentation/tests/generated or outside apps). |
| 2aa317ab | 2026-09-06 | pending | feat(desktop): the admin comes up authenticated — no login screen |
| fb996e8f | 2026-09-06 | pending | feat(desktop): use the Tovu logo as the app and nav mark |
| 29a7f036 | 2026-09-06 | pending | feat(admin-editors): move Published/Save/Delete to their own row under the toolbar |
| 8e5a9d74 | 2026-09-06 | pending | feat(admin-editors): centre the editor title, move the back link to the far left |
| 5178eea5 | 2026-09-06 | skipped | design(landing): gold, black and white — the filled pill goes gold in dark mode — No in-scope production code (documentation/tests/generated or outside apps). |
| 717273e8 | 2026-09-06 | skipped | docs(tasks): no SITE password at all, and the default-owner-password finding — No in-scope production code (documentation/tests/generated or outside apps). |
| b3f613a6 | 2026-09-06 | skipped | design(landing): cycle the hero verb with kUInetic's word-cycler, as x.ai does — No in-scope production code (documentation/tests/generated or outside apps). |
| 14167454 | 2026-09-06 | skipped | test(desktop): first E2E that actually launches apps/desktop, and one RED — No in-scope production code (documentation/tests/generated or outside apps). |
| f66ef907 | 2026-09-06 | skipped | design(landing): rebuild the xAI-language homepage sample around x.ai's structure — No in-scope production code (documentation/tests/generated or outside apps). |
| af67f51e | 2026-09-06 | skipped | docs(desktop): manifest v2 — option-2 scope, N-BrowserWindow model — No in-scope production code (documentation/tests/generated or outside apps). |
| 6a0bd61c | 2026-09-06 | pending | feat(desktop): port the Runner preload and add TOVU_DESKTOP_UI=runner |
| 4c75f4c0 | 2026-09-06 | pending | feat(desktop): port Tovu-Runner s renderer and shared contracts |
| 10fb9215 | 2026-09-06 | pending | build(desktop): stand up the renderer build inside apps/desktop |
| 098e3466 | 2026-09-06 | skipped | docs(desktop): record the Tovu-Runner UI port manifest before any code lands — No in-scope production code (documentation/tests/generated or outside apps). |
| 46513d83 | 2026-09-06 | skipped | docs(ads-memory): hand off tovu-c0 — three owner-only commands, and apps/desktop never launched — No in-scope production code (documentation/tests/generated or outside apps). |
| 32af5802 | 2026-09-06 | pending | docs(index): record the reverted HTTP/2 attempt (Node-core crash, reproduced 3x) |
| 2cd019cd | 2026-09-06 | pending | fix(assistant,settings): drop the Connection header on HTTP/2 SSE streams |
| 848ddd09 | 2026-09-06 | pending | fix(admin-dev-proxy): strip hop-by-hop headers before relaying Vite's response |
| d131619d | 2026-09-06 | pending | feat(site-dir): add repairSite — write marker files into a pre-marker-convention site |
| 8a14b56a | 2026-09-06 | pending | refactor(site-dir): extract readAppliedSchemaIdentity, shared by the boot guard and repair-site |

## Jini extension

- `434d781e`: reviewed; J01 in `05-jini-identity.md`
- `be29a436`: skipped; tests-only under user scope

## Handoff

Inputs: user scope, frozen commit inventory, governing instructions. Output: durable coverage ledger. Risks: audit unfinished; pending rows are not reviewed. Next assignee: Codex audit continuation, then operator triage.

## Batch 1 — media import / HTTP

Read `b1ce2d0a` and `dd187ece` surviving implementation at HEAD, including client injections and tool registration. Findings MI-01/02 flushed to `01-media-import-http.md`. `24bdafc1` deliberately skipped (tests only). `a346b3ec` remains pending for full search/discovery caller checks. Detailed path coverage: `01-media-import-coverage.json`. Graph search works but trace_path was denied by tool approval policy; direct source search/read used as fallback.

## Batch 2 — parallel checkpoints and static measurement

Durable reports now exist for desktop (`02`), admin (`03`), content/identity (`04`), Jini identity (`05`), and MCP/assistant (`06`). Each carries its own confirmed scenarios and limitations. Agents update separate coverage JSON; the root consolidates this ledger. Static SonarJS cognitive analysis read 215 changed code files from frozen HEAD, with no application imports, tests, compiler, build, or network. Raw results: `cognitive-results.json`; five functions exceed the requested 9 ceiling, pending base comparison and source adjudication. This isolated rule run is not a full repository lint pass.
