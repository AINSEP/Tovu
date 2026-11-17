# Admin UI extraction: plan index (2026-11-17, planning only, nothing executed)

Status: **PARTIAL** (context budget). Written: common rules, the screen recipe, 28 specified runs in 7 sheet files,
4 generated inventories. Not written: the 7 design-first screens' executable sheets (outlines only) — see section 9.
No source was edited, no test was run, no browser was opened.

## 1. What I read
- Tovu `integ/merge-a-2026-11-16` @ `f354cfbd` (worktree). `integ/merge-final-2026-11-16` did not exist. merge-a is
  the branch that has size-06 (`apps/admin/src/lib/api.ts` is gone; per-feature `features/<x>/api/`) and
  `development/hook-injection-debt.json`.
- Jini `integ/merge-a-2026-11-16` @ `96aade8c`.
- Personas: software-architect (lead), refactor, programmer, tdd, web-design. Skills: implementation-guardrails,
  feature-slice-design, refactor-patterns, architecture-migration, hexagonal-architecture, testable-design-patterns,
  test-design (test-design and three personas were read in part: the tool output was truncated).
- `reconcile/LESSONS-FOR-DESIGN-BRIEFS.md` (26 lessons), both input surveys, xpkg `COMMON.md` and `R1-R2-admin.md`,
  the head of `R3-user-management.md`, the lanes K/T and S/U indexes.

## 2. Three branches disagree about `apps/admin` (owner must merge before most sheets run)
| Branch | Admin source files changed vs `refactor/terra` | What |
|---|---|---|
| `integ/merge-a` (read here) | 468 | size-06 API split, size-04 pages, hook gate, import-cycle |
| `integ/merge-b` @ `dd70b057` | 61 | `moves/*`: dock split (`AssistantDock.state.hooks.ts`, `DockChatPane.tsx` added), members/users local ports deleted, sites/themes/database visuals files deleted, `use-focus-trap` deleted |
| `refactor/size-05-posteditor` @ `d0d599e4` | 30 (29 added) | PostEditor split into `posts/editor/`; in neither merge branch |
Neither merge branch is an ancestor of the other. Every sheet starts with a blob guard (`inventory.tsv`), so a
stale base is detected, not silently used. Sheets safe on merge-a alone: A0, A1, J1, J2, J3, T1a.

## 3. Size now (re-measured; both surveys were stale)
| | 11-06 survey | Now (`f354cfbd`) |
|---|---|---|
| `apps/admin/src` TS/TSX without tests | 182,453 | **184,393** = 118,112 source (951 files) + 66,281 dictionary |
| CSS | 16,788 | **16,796** |
| Test + harness lines | not counted | **182,593** |
| Source files over 500 lines | not counted | **38** |
| Hook-injection debt keys in `apps/admin` | n/a | **285** of 322 repo-wide (top: AssistantDock 50, settings 30, security 19, plugins 16, ai-assistant 14, App.tsx 13) |
| Jini `packages/admin/src` | 26,587 | **27,253** source, of which **17,508** TS/TSX (17,533 with JSON/CSS) is domain code in 11 folders |
| Jini `AdminShell` consumers | none | **none** (455 lines in `react/shell`) |
By verdict (source lines, dictionaries excluded): SPLIT 55,190 · STAY 32,875 · MOVE 23,853 · later 3,973 · covered by another plan 2,221.

Findings that change the plan:
1. **The blocker is 7 files, not 1.** Seven production files import six website modules by relative path, plus 30
   admin test files and 4 path aliases into website source. In `App.hooks.ts` the import is unused. (A1)
2. **Jini already has a roles module** (`user-management/src/admin`, controller 362 lines); the 11-10 survey said it
   lacked one. Roles is a dedupe with a behaviour diff, not a move. (S-ROLES)
3. **Jini's security module is 746 lines; Tovu's is 6,108.** "Port the Tovu-only behaviour" is most of the
   feature: 4 runs including a design. (S-SECURITY)
4. **The admin-module contract is already in `@jini-ai/core`** (`contracts/admin-module.ts`), and
   `user-management/src/admin` is a working precedent of a domain owning its admin screens. What is missing is a
   legal home for six small runtime pieces (J4, decision D-1).
5. **Jini's shell cannot host Tovu yet**: all-of permissions only, hooks called directly, unprefixed classes,
   missing slots. (J1-J3)
6. forms, SEO, comments, redirects, widgets, members, users are already Jini screens; Tovu holds bindings and
   dictionaries only. Their remaining work is on the Jini side (JM1-JM5).
7. Lanes K/T and S/U planned server code only; their index lists the admin screens as "measured, not sheeted".
   Nothing here is planned twice. Shared files with them: owner `package.json` export maps only.

## 4. Per-screen inventory (generated: `screens.gen.md`; one row per file with blob: `inventory.tsv`)
`f/` = `features/`, `c/` = `components/`. Source = TS/TSX without tests and dictionaries.

| area | code lines (files) | dictionary | tests | CSS | files >500 | hook debt | verdict | owner / subpath | sheet | Chrome check |
|---|---|---|---|---|---|---|---|---|---|---|
| f/plugins | 6,669 (62) | 5,133 | 7,778 | 35 | 2: AgentPlugins.tsx 515, rules.ts 737 | 16 | SPLIT | @jini-ai/plugins/react + @jini-ai/agent-plugins/react | S-PLUGINS (design first) | YES |
| f/posts | 6,680 (54) | 3,270 | 9,455 | 1 | 2: rules.ts 562, use-post-editor.hooks.ts 1400 | 8 | SPLIT | @jini-ai/cms/posts/react | S-POSTS (design first) | YES |
| f/themes | 6,060 (25) | 3,655 | 9,548 | 0 | 3: ThemeExplore.tsx 1493, Themes.tsx 666, use-theme-explore.hooks.ts 1718 | 12 | SPLIT | @jini-ai/cms/theme/react | S-THEMES (design first) | YES |
| lib | 7,034 (91) | 2,247 | 22,190 | 0 | 1: execution-settings.ts 550 | 6 | MOVE PART | mostly Tovu host adapters; panel-access.ts -> Jini | T1a | no |
| f/pages | 7,144 (29) | 1,886 | 9,926 | 0 | 3: PageEditor.tsx 1428, rules.ts 615, use-page-editor.hooks.ts 1404 | 4 | SPLIT | @jini-ai/cms/pages/react (D-3) | S-PAGES (design first) | YES |
| c/AssistantDock | 6,395 (48) | 2,197 | 7,821 | 0 | 2: AssistantDock.tsx 665, AssistantDock.hooks.tsx 2134 | 50 | SPLIT | @jini-ai/chat/react (generic part) + Tovu wiring | S-DOCK a-c | YES |
| f/settings | 5,910 (32) | 2,667 | 6,765 | 9 | 3: external-mcp-admissions-rules.ts 631, ExternalMcpSettingsPanel.tsx 591, SettingsUi.tsx 744 | 30 | SPLIT | owner panels per tab; assembled page stays | S-SETTINGS (design first) | YES |
| f/security | 6,108 (32) | 2,394 | 7,980 | 5 | 3: AccessTokensTab.tsx 1068, rules.ts 1133, use-access-tokens.hooks.ts 939 | 19 | MOVE (retire Tovu copy) | Jini security module (D-5: user-management/admin/security) | S-SECURITY a-d | YES |
| f/ai-assistant | 3,801 (31) | 4,063 | 4,918 | 216 | 2: AiAssistant.tsx 1080, use-visitor-credential-form.hooks.ts 709 | 14 | STAY | Tovu | - | no |
| f/deployment | 5,072 (28) | 2,561 | 6,644 | 0 | 1: StaticSiteTab.tsx 1420 | 9 | SPLIT | @jini-ai/devops/deploy/react | S-DEPLOY (design first) | YES |
| c/(other) | 3,973 (47) | 3,449 | 12,989 | 125 | 0 | 12 | later | @jini-ai/ui or domain, case by case | - | no |
| f/sites | 5,400 (37) | 1,345 | 5,820 | 0 | 2: Sites.hooks.tsx 568, use-site-transfer.hooks.ts 502 | 3 | STAY | Tovu (multi-site product) | - | no |
| f/media | 4,166 (22) | 1,888 | 5,043 | 0 | 2: Media.tsx 1578, rules.ts 759 | 11 | SPLIT | @jini-ai/cms/media/react (dedupe with Jini admin/media) | S-MEDIA (design first) | YES |
| f/taxonomy | 3,485 (27) | 1,282 | 4,829 | 0 | 1: Taxonomy.tsx 899 | 7 | MOVE | @jini-ai/cms/taxonomy/react | S-TAXONOMY | YES |
| f/collections | 3,235 (24) | 1,304 | 4,475 | 0 | 1: Collections.tsx 671 | 2 | SPLIT | @jini-ai/cms/entries/react + cms/content-types/react | S-COLLECTIONS | YES |
| root | 3,859 (10) | 257 | 7,958 | 6,799 | 3: App.tsx 703, panels.tsx 1311, App.hooks.ts 1205 | 17 | SPLIT | @jini-ai/admin/react/shell (generic) + Tovu composition | J1 J2 T1a T1b A1 | YES |
| f/email | 2,949 (24) | 948 | 1,545 | 114 | 0 | 6 | STAY for now | not in the named goal; later (platform mail owner) | - | no |
| f/roles | 2,036 (9) | 1,523 | 2,579 | 0 | 2: Roles.tsx 869, use-roles.hooks.ts 629 | 0 | MOVE (dedupe with um admin roles) | @jini-ai/user-management/react/roles | S-ROLES | YES |
| f/dashboard | 983 (7) | 2,217 | 1,267 | 0 | 0 | 2 | STAY | Tovu | - | no |
| f/menus | 1,722 (14) | 1,272 | 2,840 | 0 | 1: MenuEditor.tsx 526 | 4 | MOVE | @jini-ai/cms/navigation/react | S-MENUS | YES |
| f/recovery | 1,448 (12) | 1,400 | 1,759 | 0 | 1: Recovery.tsx 572 | 1 | STAY for now | later (ops) | - | no |
| f/database | 1,557 (16) | 1,231 | 1,683 | 0 | 1: Database.tsx 535 | 1 | STAY for now | later (ops) | - | no |
| f/consent | 778 (7) | 1,971 | 1,097 | 145 | 0 | 4 | STAY (repoint in JM5) | host binding of Jini consent | JM5 | YES |
| f/publish-content | 2,633 (12) | 0 | 3,317 | 170 | 1: use-publish-content-confirm.hooks.ts 1363 | 2 | STAY | Tovu publishing (@tovu/publish-content-ui) | - | no |
| f/integrations | 1,626 (14) | 847 | 971 | 0 | 0 | 1 | STAY for now | later | - | no |
| f/observability | 1,304 (18) | 1,154 | 1,385 | 102 | 0 | 5 | STAY for now | later | - | no |
| f/trash | 1,072 (8) | 1,242 | 1,482 | 0 | 0 | 0 | MOVE | @jini-ai/cms/trash/react | S-TRASH | YES |
| c/WidgetConfigFields | 2,221 (11) | 0 | 1,054 | 0 | 1: WidgetConfigFields.tsx 601 | 3 | covered elsewhere | cms/widgets (audit2 a04 sheet exists) | a04 | YES |
| hooks | 1,873 (26) | 196 | 8,278 | 0 | 0 | 0 | MOVE PART | Tovu; shell hooks -> J2 | J2 | no |
| f/users | 418 (8) | 1,584 | 3,068 | 0 | 0 | 0 | STAY (binding) | host binding of user-management/react/users | - | no |
| f/forms | 102 (4) | 1,821 | 389 | 0 | 0 | 0 | STAY (repoint in JM1) | host binding + dictionary of Jini forms | JM1 | YES |
| f/source-control | 1,225 (11) | 600 | 1,290 | 0 | 0 | 3 | STAY for now | later (devops/source-control) | - | no |
| f/seo | 145 (2) | 1,606 | 113 | 0 | 0 | 0 | STAY (repoint in JM2) | host binding + dictionary of Jini seo | JM2 | YES |
| f/widgets | 114 (3) | 1,449 | 109 | 0 | 0 | 0 | STAY (repoint in JM4) | host binding + dictionary of Jini widgets | JM4 | YES |
| f/library | 1,067 (7) | 454 | 1,409 | 0 | 0 | 0 | STAY for now | later | - | no |
| f/content-analysis | 712 (5) | 712 | 795 | 0 | 0 | 1 | STAY for now | later, with posts (cms/seo/content-analysis) | - | no |
| f/voice-input | 1,032 (12) | 0 | 1,572 | 91 | 0 | 5 | STAY for now | later (chat/react or ui) | - | no |
| f/comments | 82 (3) | 943 | 45 | 0 | 0 | 0 | STAY (repoint in JM4) | host binding + dictionary of Jini comments | JM4 | YES |
| f/providers | 681 (10) | 323 | 510 | 12 | 0 | 4 | STAY for now | later | - | no |
| f/skills | 686 (16) | 297 | 1,465 | 44 | 0 | 4 | STAY for now | later (ui/features/skills exists) | - | no |
| integrations | 973 (23) | 0 | 2,406 | 1,502 | 0 | 4 | STAY | Tovu host bindings (grow with every move) | every sheet | no |
| f/redirects | 63 (2) | 908 | 46 | 0 | 0 | 0 | STAY (repoint in JM2) | host binding + dictionary of Jini redirects | JM2 | YES |
| f/workspace | 495 (10) | 435 | 615 | 0 | 0 | 1 | STAY | Tovu | - | no |
| f/members | 218 (8) | 625 | 702 | 0 | 0 | 0 | STAY (binding) | host binding of user-management/react/members | - | no |
| f/import-export | 717 (11) | 35 | 439 | 0 | 0 | 3 | STAY | Tovu | - | no |
| f/analytics | 233 (7) | 376 | 336 | 0 | 0 | 0 | STAY for now | later | - | no |
| f/admin-themes | 149 (2) | 306 | 162 | 41 | 0 | 4 | MOVE PART | @jini-ai/admin/react/shell theme port | J3 | YES |
| f/fs-files | 450 (4) | 0 | 969 | 0 | 0 | 0 | STAY for now | later | - | no |
| f/auth | 321 (10) | 58 | 406 | 0 | 0 | 2 | STAY (binding) | host binding of user-management/react/auth | T1b | YES |
| f/authentication | 318 (4) | 57 | 177 | 0 | 0 | 2 | STAY for now | later (user-management/react) | - | no |
| admin-themes | 374 (3) | 0 | 755 | 884 | 0 | 0 | MOVE PART | @jini-ai/admin/react/shell theme port; CSS packs stay (D-7) | J3 | YES |
| f/webmcp | 168 (3) | 64 | 505 | 0 | 0 | 1 | STAY | Tovu | A1 touches 1 file | no |
| f/playground | 131 (4) | 29 | 147 | 0 | 0 | 1 | STAY | Tovu dev tool | - | no |
| f/admin-ui | 45 (2) | 0 | 122 | 3 | 0 | 1 | STAY | Tovu | - | no |
| styles | 0 (0) | 0 | 645 | 6,498 | 0 | 0 | STAY | Tovu host CSS (styles the jini- classes) | - | no |
| **total** | **118,112 (951)** | **66,281** | **182,593** | **16,796** | 38 | 285 | | | | |

## 5. Sheets, order, prerequisites, estimates
| Order | Sheet (file) | Runs | Estimate | Needs | Chrome check |
|---|---|---|---|---|---|
| 1 | A0 baselines, A1 website imports (`A-prereqs.md`) | 2 | 0.31M | - | A0 is the check's baseline |
| 1 | J1 any-of, J2 shell contract, J3 theme port (`J-shell.md`) | 3 | 0.45M | J2: order with xpkg R1c | no (Jini only) |
| 2 | T1a permissions, T1b shell swap (`T1-adopt-shell.md`) | 2 | 0.34M | J1-J3, A0, A1; Opus review of T1b | **every panel** |
| 2 | J4 module runtime (`JM-jini-domains-out.md`) | 1 | 0.15M | D-1 | no |
| 3 | JM1 forms, JM2 seo+redirects, JM3 media, JM4 widgets+comments, JM5 agent-plugins+security+consent+source-control | 5 | 1.03M | J4; xpkg R1c, R2a (JM1), R2b (JM3-5) | forms, seo, redirects, widgets, comments, consent |
| 4 | S-TRASH, S-MENUS, S-ROLES, S-TAXONOMY a/b, S-COLLECTIONS a/b (`S-screens-ready.md` + `T-SCREEN.md`) | 7 | 1.36M | J4; R3 (roles); A1 (menus) | each screen |
| 4 | S-SECURITY a (design) b c d (`S-SECURITY-and-DOCK.md`) | 4 | 0.93M | JM5, D-5 | security, deployment |
| 4 | S-DOCK a b, c after a split design | 3 + 1 design | 0.77M | merge-b merged, D-6 | dock, real chat |
| 5 | S-POSTS, S-PAGES, S-THEMES, S-PLUGINS, S-SETTINGS, S-DEPLOY, S-MEDIA (`S-design-first.md`, outlines) | 7 designs + about 27 runs | 1.75M + 6.1M | merged base; D-3, D-4, lane K/T D-T4; T-PO-01, T-TH-03 | each screen |
**Total estimate: about 13.2M executor tokens**: 5.3M for the 28 specified runs, 7.9M for the design-first screens.
Runnable now with no owner decision: A0, A1, J1, J2, J3, T1a, T1b = 1.10M. After D-1: J4, JM1-5, the five ready
screens = 2.54M more.

## 6. File-disjointness for parallel runs
- Parallel: A0 ‖ A1 ‖ J1. Then J2, then J3 (same folder `react/shell`).
- T1a then T1b, alone: they own `App.tsx`, `App.chrome.tsx`, `App.hooks.ts`, `App.session.ts`, `nav.ts`, shell CSS.
- JM1-JM5 are source-disjoint. They collide on Jini `packages/admin/package.json`, `packages/cms/package.json`
  (JM1-4) and Tovu `integrations/jini-admin/modules.hooks.ts`: coordinator applies those lines, or run serially.
- S sheets are disjoint by feature folder. Shared, coordinator-only: `panels.tsx`, `modules.hooks.ts`,
  `integrations/jini-kits.ts`, owner `package.json`. Known cross-feature couplings that force an order:
  taxonomy before collections (term picker), posts with pages (mutual imports), security a before deploy,
  S-COLLECTIONS with audit2 a04 (`WidgetConfigFields` imports collections 6 times), S-DOCK after merge-b.
- Never parallel with xpkg R1c/R2a/R2b/R3 on the same Jini folder: those go first.

## 7. Owner decisions
| # | Decision | Recommendation |
|---|---|---|
| D-0 | Which branch is the base? merge-a, merge-b and size-05 each change admin differently | merge all three into one branch before any S sheet |
| D-1 | Home of the module runtime the owners need (`createControllerStore`, errors, `querySuffix`, `hasPermission` → `@jini-ai/core`; `useController`, `bindReact` → `@jini-ai/ui-kit/react`) | approve as written; it is the only home the import rule allows |
| D-2 | Dictionaries (66k lines): stay in Tovu with a parity test against the owner's `messages.en` (today's precedent: seo, comments, forms), or ship in the owner package | stay in Tovu; a second host can copy them later |
| D-3 | Pages owner path: new `cms/src/pages/admin` or under `cms/src/entries/admin/pages` | new `pages` (matches lane T's `cms/src/posts`) |
| D-4 | Settings: approve the tab → owner table after its design | - |
| D-5 | Security's home. You said Tovu must use "Jini's admin/security"; the rule also says admin's domain code moves to its owner | `user-management/src/admin/security` (API keys go there in lane U3) |
| D-6 | Which agent-failure scanners are generic (move to chat) and which name Tovu-specific secrets (stay) | decide per scanner in S-DOCK a's report |
| D-7 | Admin theme CSS packs (classic, glass; 884 lines, `--tovu-*` tokens): stay in Tovu | stay; only mechanics move (J3) |
| D-8 | The 4 aliases into website source and 30 admin tests importing website files | separate cleanup after A1; not blocking |
| D-9 | Jini admin `playground` (133 lines) stays in admin as a dev tool | stay |
| D-10 | Renaming the shell's classes to `jini-admin-*` touches Tovu's 6,799-line `styles.css` selectors | do it in T1b with the full Chrome check |
| inherited | Lane K/T D-T4 (which Jini package may depend on `@tiptap/*`) blocks S-POSTS editor | - |

## 8. Could not verify
- No build, test, typecheck, gate or browser was run. Every "green" in a sheet is a requirement, not an observation.
- Line numbers in `App.tsx`, `App.hooks.ts`, `App.chrome.tsx` were read on merge-a; they will shift.
- Whether `packages/contracts` may depend on `@sindresorhus/slugify` and `@jini-ai/chat` (A1 rows 3, Step C).
- Whether `@jini-ai/core` already has an equivalent of `describeApiError` / `AdminApiError` (J4 searches first).
- Function-level limits (<= 50 lines, complexity <= 10) inside the files to move: only file sizes were measured.
- The body of Tovu's and Jini's roles, media and security implementations: sizes and file lists only; the
  behaviour diffs are step 1 of those sheets.
- The S sheets' port method lists: derived at run time from the existing `*-port.hooks.ts` files, not pre-written.
- The 11-10 survey's "about 2.1k generic" dock figure: only files that exist as separate files were re-measured
  (1,459 lines listed in S-DOCK); overflow, slow-run and folder-drop code sits inside two large files.
- `development/todos.md` and `owner-rules.md` were not looked for; rules are from the task text and xpkg COMMON.
- Per-test move/keep classification for 182,593 test lines.

## 9. What remains (numbered)
1. Seven Opus designs: S-POSTS + S-PAGES (together), S-THEMES, S-PLUGINS, S-SETTINGS, S-DEPLOY, S-MEDIA.
2. S-SECURITY run a (design) and the split design of `AssistantDock.hooks.tsx` (2,134 lines).
3. Screens marked "later": email, database, recovery, observability, integrations, source-control, library,
   content-analysis, voice-input, providers, skills, analytics, fs-files, authentication, `components/*` other than
   the dock (about 17k source lines) — not in the named goal; no sheet.
4. Re-run `inventory.tsv` on the merged base (script logic: areas = top folder; blobs from `git ls-tree`).
5. Adversarial judge pass on J2 (slot list) and T1b (session port behaviour) before they run.
