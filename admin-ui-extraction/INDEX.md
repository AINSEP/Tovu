# Admin UI extraction: plan index (2026-11-17, planning only, nothing executed)

Second judge pass 2026-11-17 (`admin-judge2-REPORT.md`): J1 READY-WITH-NOTE, J2 READY-WITH-NOTE, T1b BLOCKED (AU-D15); owner decisions of 2026-11-17: AU-D1, D2, D3, D7, D8, D9, D10, D11, D13, D14 = Rec; D4, D6, D12 decide later.

Status: **PARTIAL, revision 3** (2026-11-16 PT; Opus review answered in full, table at the end). **Base from
revision 3: `integ/merge-final-2026-11-16`** (Tovu `232764af5`, Jini `65d73b0d5`; contains merge-a, merge-b and
size-05); `inventory.tsv` regenerated there. Revision 2 (2026-11-17): Round 2 answered all 17 findings of `CODEX-JUDGE.md` (table at the
end: 17 accepted, 0 rebutted) and re-verified the plan against Tovu merge-a `e801e9ae` / merge-b `450ac748` and Jini
merge-a `dde69a6d` / merge-b `9c982fd9` (`integ/merge-final-2026-11-16` did not exist). Written: common rules, the
screen recipe, the design-run brief (T-DESIGN), **31 specified runs** in 7 sheet files, 4 generated inventories.
Still not written: the designs themselves for the 8 design-first sheets (each is one Opus run with a fixed output
contract) — see section 9. No source was edited, no test was run, no browser was opened.

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
| `refactor/size-05-posteditor` @ `d0d599e4` | 30 (29 added) | PostEditor split into `posts/editor/`. **Revision 3: wrong, it is in merge-a** as squash `ffba5e382` (same `features/posts` tree) |
Revision 3: `integ/merge-final-2026-11-16` now contains both merge branches (and so size-05); it is the base. Before it existed, neither merge branch was an ancestor of the other. Every sheet starts with a blob guard (`inventory.tsv`), so a
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
| f/security | 6,108 (32) | 2,394 | 7,980 | 5 | 3: AccessTokensTab.tsx 1068, rules.ts 1133, use-access-tokens.hooks.ts 939 | 19 | MOVE (retire Tovu copy) | Jini security module, `@jini-ai/admin/security` (owner 11-10; D-5 not planned) | S-SECURITY a-d | YES |
| f/ai-assistant | 3,801 (31) | 4,063 | 4,918 | 216 | 2: AiAssistant.tsx 1080, use-visitor-credential-form.hooks.ts 709 | 14 | STAY | Tovu | - | no |
| f/deployment | 5,072 (28) | 2,561 | 6,644 | 0 | 1: StaticSiteTab.tsx 1420 | 9 | SPLIT | @jini-ai/devops/deploy/react | S-DEPLOY (design first) | YES |
| c/(other) | 3,973 (47) | 3,449 | 12,989 | 125 | 0 | 12 | later | @jini-ai/ui or domain, case by case | - | no |
| f/sites | 5,400 (37) | 1,345 | 5,820 | 0 | 2: Sites.hooks.tsx 568, use-site-transfer.hooks.ts 502 | 3 | STAY | Tovu (multi-site product) | - | no |
| f/media | 4,166 (22) | 1,888 | 5,043 | 0 | 2: Media.tsx 1578, rules.ts 759 | 11 | SPLIT | @jini-ai/cms/media/react (dedupe with Jini admin/media) | S-MEDIA (design first) | YES |
| f/taxonomy | 3,485 (27) | 1,282 | 4,829 | 0 | 1: Taxonomy.tsx 899 | 7 | MOVE | @jini-ai/cms/taxonomy/admin/react | S-TAXONOMY | YES |
| f/collections | 3,235 (24) | 1,304 | 4,475 | 0 | 1: Collections.tsx 671 | 2 | SPLIT | @jini-ai/cms/content-types/admin/react (ready) + cms/entries/admin/react (design first) | S-COLLECTIONS a, S-ENTRY-EDITOR | YES |
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
| f/users | **218 (7)** (judge 2, `232764af5`) | 1,584 | 3,069 | 0 | 0 | 0 | STAY (binding) | host binding of user-management/react/users | - | no |
| f/forms | 102 (4) | 1,821 | 389 | 0 | 0 | 0 | STAY (repoint in JM1) | host binding + dictionary of Jini forms | JM1 | YES |
| f/source-control | 1,225 (11) | 600 | 1,290 | 0 | 0 | 3 | STAY for now | later (devops/source-control) | - | no |
| f/seo | 145 (2) | 1,606 | 113 | 0 | 0 | 0 | STAY (repoint in JM2) | host binding + dictionary of Jini seo | JM2 | YES |
| f/widgets | 114 (3) | 1,449 | 109 | 0 | 0 | 0 | STAY (repoint in JM4) | host binding + dictionary of Jini widgets | JM4 | YES |
| f/library | **1,066 (7)** (judge 2, `232764af5`; the drift was blobs, not lines) | 454 | 1,409 | 0 | 0 | 0 | STAY for now | later | - | no |
| f/content-analysis | 712 (5) | 712 | 795 | 0 | 0 | 1 | STAY for now | later, with posts (cms/seo/content-analysis) | - | no |
| f/voice-input | 1,032 (12) | 0 | 1,572 | 91 | 0 | 5 | STAY for now | later (chat/react or ui) | - | no |
| f/comments | 82 (3) | 943 | 45 | 0 | 0 | 0 | STAY (repoint in JM4) | host binding + dictionary of Jini comments | JM4 | YES |
| f/providers | 681 (10) | 323 | 510 | 12 | 0 | 4 | STAY for now | later | - | no |
| f/skills | 686 (16) | 297 | 1,465 | 44 | 0 | 4 | STAY for now | later (ui/features/skills exists) | - | no |
| integrations | 973 (23) | 0 | 2,406 | 1,502 | 0 | 4 | STAY | Tovu host bindings (grow with every move) | every sheet | no |
| f/redirects | 63 (2) | 908 | 46 | 0 | 0 | 0 | STAY (repoint in JM2) | host binding + dictionary of Jini redirects | JM2 | YES |
| f/workspace | 495 (10) | 435 | 615 | 0 | 0 | 1 | STAY | Tovu | - | no |
| f/members | **139 (7)** (judge 2, `232764af5`) | 625 | 703 | 0 | 0 | 0 | STAY (binding) | host binding of user-management/react/members | - | no |
| f/import-export | 717 (11) | 35 | 439 | 0 | 0 | 3 | STAY | Tovu | - | no |
| f/analytics | 233 (7) | 376 | 336 | 0 | 0 | 0 | STAY for now | later | - | no |
| f/admin-themes | 149 (2) | 306 | 162 | 41 | 0 | 4 | STAY (rev 2) | Tovu theme controller, injected through the shell's `useThemeHook` | J3, T1b | YES |
| f/fs-files | 450 (4) | 0 | 969 | 0 | 0 | 0 | STAY for now | later | - | no |
| f/auth | 321 (10) | 58 | 406 | 0 | 0 | 2 | STAY (binding) | host binding of user-management/react/auth | T1b | YES |
| f/authentication | 318 (4) | 57 | 177 | 0 | 0 | 2 | STAY for now | later (user-management/react) | - | no |
| admin-themes | 374 (3) | 0 | 755 | 884 | 0 | 0 | STAY (rev 2) | Tovu: settings binding, painting, pre-paint hint, CSS packs (D-7) | J3, T1b | YES |
| f/webmcp | 168 (3) | 64 | 505 | 0 | 0 | 1 | STAY | Tovu | A1 touches 1 file | no |
| f/playground | 131 (4) | 29 | 147 | 0 | 0 | 1 | STAY | Tovu dev tool | - | no |
| f/admin-ui | 45 (2) | 0 | 122 | 3 | 0 | 1 | STAY | Tovu | - | no |
| styles | 0 (0) | 0 | 645 | 6,498 | 0 | 0 | STAY | Tovu host CSS (styles the jini- classes) | - | no |
| **total** (`f354cfbd`; the three judge-2 rows sum 279 lines / 2 files lower) | **118,112 (951)** | **66,281** | **182,593** | **16,796** | 38 | 285 | | | | |

## 5. Sheets, order, prerequisites, estimates (revision 2)
Owner-package subpaths in section 4 read `<owner>/<domain>/admin/react` (exact table: `JM-jini-domains-out.md`).
| Order | Sheet (file) | Runs | Estimate | Needs | Chrome check |
|---|---|---|---|---|---|
| 1 | A0 baselines, A1 website imports incl. Step D (`A-prereqs.md`) | 2 | 0.34M | - | A0 is the check's baseline |
| 1 | J1 access rule + `noAccess`, J2 shell contract, J3 theme seam (`J-shell.md`) | 3 | 0.50M (judge 2: J2 +50k for its new seams) | J2: order with xpkg R1c | no (Jini only) |
| 2 | T1a permissions, T1b shell swap (`T1-adopt-shell.md`) | 2 | 0.48M (judge 2: T1b 260k → 380k) | J1-J3, A0, A1; Opus review of T1b | **every panel**, 3 widths |
| 2 | J4 module runtime (`JM-jini-domains-out.md`) | 1 | 0.15M | D-1 | no |
| 3 | JM1-pre … JM5-pre: debt, barrels, `SeoPage` split, test classification | 5 | 0.92M | J4 | no (Jini only) |
| 4 | JM1 forms, JM2 seo+redirects, JM3 media, JM4 widgets+comments, JM5 agent-plugins+consent+source-control | 5 | 0.95M | its pre-run; xpkg R1c, R2a (JM1), R2b (JM3-5); xpkg G-TESTS integration home if a pre-run reports INTEGRATION tests | forms, seo, redirects, widgets, comments, consent |
| 5 | S-TRASH, S-MENUS, S-ROLES, S-TAXONOMY a/b, S-COLLECTIONS a (`S-screens-ready.md` + `T-SCREEN.md`) | 6 | 1.16M | J4; R3 (roles); A1 (menus) | each screen |
| 5 | S-SECURITY a (design) b c d (`S-SECURITY-and-DOCK.md`) | 4 | 0.96M | A1 Step D; d also S-DEPLOY's 3 imports | security, deployment |
| 5 | S-DOCK a b c | 3 | 0.60M | merge-b merged, D-6; b after T1b | dock, real chat |
| 6 | S-POSTS, S-PAGES, S-THEMES, S-PLUGINS, S-SETTINGS, S-DEPLOY, S-MEDIA, S-ENTRY-EDITOR (`S-design-first.md`, T-DESIGN + outlines) | 8 designs + about 29 runs | 2.0M + 6.5M | merged base; D-3, D-4, lane K/T D-T4; T-PO-01, T-TH-03 | each screen |
**Total estimate: about 14.4M executor tokens** (round 1: 13.2M): 5.9M for the 31 specified runs, 8.5M for the
design-first screens. What moved the number: +0.92M pre-runs (debt may not follow moved code; round 1 did not cost
it), +0.03M A1 Step D, +0.02M T1b, +0.04M J1, -0.06M J3, -0.17M dock (no split design needed), -0.20M collections b
moved to design-first, +0.65M S-ENTRY-EDITOR design + runs, +0.03M security design, -0.03M JM moves (security stays).
Runnable now with no owner decision: A0, A1, J1, J2, J3, T1a = 0.91M (judge 2: T1b now also needs AU-D15). After D-1: J4, the pre-runs, JM1-5, the
ready screens.

## 6. Order of runs (revision 2: serial wherever a shared file is edited; nothing is applied by a coordinator)
- Parallel: A0 ‖ A1 ‖ J1. Then J2, then J3 (same folder `react/shell`).
- T1a then T1b, alone: they own `App.tsx`, `App.chrome.tsx`, `App.hooks.ts`, `App.session.ts`, `nav.ts`, shell CSS.
  T1b step 3 is the Tovu half of J2 step 5 (class rename).
- J4 alone (`packages/core/package.json`, `packages/ui-kit/package.json`).
- JM1-pre … JM5-pre: file-disjoint inside `packages/admin/src`, but all edit `scripts/size-debt.json` and
  `scripts/hook-injection-debt.json`: **serial** (or parallel on separate branches merged one at a time with the
  debt files regenerated by `--update` after each merge; shrink-only check in COMMON-ADMIN section 1).
- JM1 → JM5 **serial**: `packages/admin/package.json`, `packages/cms/package.json`, Tovu `modules.hooks.ts`, `jini-kits.ts`.
- Screen sheets (S-*) **serial in their Tovu halves**: `panels.tsx`, `modules.hooks.ts`, `jini-kits.ts`. Their Jini
  halves may be prepared in parallel only when the owner packages differ (roles: `user-management`; security:
  `admin`; dock: `chat`; the cms screens share `packages/cms/package.json` and are serial).
  Order forced by coupling: taxonomy before S-ENTRY-EDITOR (term picker), posts with pages (mutual imports),
  security a before deploy, S-COLLECTIONS a with audit2 a04 (`WidgetConfigFields` imports collections 6 times),
  S-DOCK b after T1b (chart provider boundary).
- Never parallel with xpkg R1c/R2a/R2b/R3 on the same Jini folder: those go first. xpkg G-TESTS skips the nine
  JM folders (their tests are classified by the JM pre-runs) and provides the integration test package.

## 7. Owner decisions
| # | Decision | Recommendation |
|---|---|---|
| D-0 | Which branch is the base? | **answered by revision 3**: `integ/merge-final-2026-11-16` contains merge-a (with size-05) and merge-b; COMMON-ADMIN section 0 checks ancestry |
| D-14 (new) | Website follow-up A2: drop the re-export lines of `contracts/core/credential-token.ts` (40 website importers) with a port on the media credential store instead of the test's `mock.module` | run after A1 Step D; small (120k), removes the last re-export shell on that path |
| D-11 (new) | The shell's two declared behaviour changes in J1 (unknown permissions show all-of panels; a denied URL shows `noAccess` instead of the default panel) | approve; no host consumes the Jini shell today |
| D-12 (new) | Proposed security hardening list that S-SECURITY run a will produce (show-once plaintext, hiding write controls) | decide after run a; nothing is implemented before |
| D-13 (new) | Multi-theme registry inside Jini | not now; only when a second host needs it |
| D-1 | Home of the module runtime the owners need (`createControllerStore`, errors, `querySuffix`, `hasPermission` → `@jini-ai/core`; `useController`, `bindReact` → `@jini-ai/ui-kit/react`) | approve as written; it is the only home the import rule allows |
| D-2 | Dictionaries (66k lines): stay in Tovu with a parity test against the owner's `messages.en` (today's precedent: seo, comments, forms), or ship in the owner package | stay in Tovu; a second host can copy them later |
| D-3 | Pages owner path: new `cms/src/pages/admin` or under `cms/src/entries/admin/pages` | new `pages` (matches lane T's `cms/src/posts`) |
| D-4 | Settings: approve the tab → owner table after its design | - |
| D-5 | Security's home. You said Tovu must use "Jini's admin/security" | **rev 2: the plan now does exactly that** (`packages/admin/src/security` stays). Moving it to `user-management` later is optional and unplanned; decide only if lane U3 needs it |
| D-6 | Which agent-failure scanners are generic (move to chat) and which name Tovu-specific secrets (stay) | decide per scanner in S-DOCK a's report |
| D-7 | Admin theme CSS packs (classic, glass; 884 lines, `--tovu-*` tokens): stay in Tovu | stay; only mechanics move (J3) |
| D-8 | The 4 aliases into website source and 30 admin tests importing website files | separate cleanup after A1; not blocking |
| D-9 | Jini admin `playground` (133 lines) stays in admin as a dev tool | stay |
| D-10 | Renaming the shell's classes to `jini-admin-*` touches Tovu's 6,799-line `styles.css` selectors | do it in T1b step 3 with the full Chrome check |
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
- The 11-10 survey's "about 2.1k generic" dock figure: rev 2 lists 2,162 lines in existing separate files (S-DOCK
  table; overflow, slow-run and folder-drop are separate files, round 1 was wrong). Whether each folder-drop file is
  free of Tovu path knowledge is checked in run c step 0.
- xpkg `G-TESTS.md` could not be read at its recorded path on `plan/xpkg-lane-sheets-2026-11-16` in round 2; the
  ownership split in JM (pre-runs classify the nine folders, G-TESTS owns the rest and the integration package) is
  this plan's proposal and must be confirmed against that sheet before JM1-pre starts.
- Whether `Sidebar` forwards `railOverride` / `onRailCollapsedChange` (they exist on `use-sidebar-rail.ts:83-96`;
  Tovu spreads them onto `Sidebar` today and typechecks): J2 step 3 confirms.
- The server-side authorization cells of the security operation trace (run a reads `apps/website`).
- `development/todos.md` and `owner-rules.md` were not looked for; rules are from the task text and xpkg COMMON.
- Per-test move/keep classification for 182,593 test lines.

## 9. What remains (numbered) — revision 2
1. Eight Opus design runs, each with the T-DESIGN output contract: S-POSTS + S-PAGES + S-ENTRY-EDITOR (one editor
   owner design, after D-T4), S-THEMES, S-PLUGINS, S-SETTINGS, S-DEPLOY, S-MEDIA. Round 2 wrote the brief and the
   new facts per screen; it did not do the designs (each is about 250k of reading).
2. S-SECURITY run a (design; brief and operation-trace table format are written).
3. Screens marked "later": email, database, recovery, observability, integrations, source-control, library,
   content-analysis, voice-input, providers, skills, analytics, fs-files, authentication, `components/*` other than
   the dock (about 17k source lines) — not in the named goal; no sheet.
4. DONE in revision 3: `inventory.tsv` regenerated on merge-final `232764af5` (the script reproduces the
   `f354cfbd` file byte for byte before it was pointed at merge-final). Round 2 had not regenerated it: merge-a moved 4 admin files since `f354cfbd` (2 production: `use-admin-subagents.hooks.ts`,
   `lib/assistant-transport-ag-ui.ts`), and the guard in COMMON-ADMIN section 0 reports them.
5. Tovu size work that is not extraction: split `AssistantDock.hooks.tsx` (2,134).
6. DONE 2026-11-17 by `admin-judge2` (`admin-judge2-REPORT.md`): J1, J2, T1b judged against the code and their commands run; see "Sheet status" below.

## Sheet status (second judge, 2026-11-17; facts on Tovu `232764af5`, Jini `65d73b0d5`)
| Sheet | Status | Note |
|---|---|---|
| A0 | DONE (build run `admin-a0-a1`, Tovu `wave2/admin-a` @ `2eacf8519`, not merged) | only classic-light 1440/390 committed; no editor/dialog/dock-open or 1024 px pictures: J/T1/S runs capture their own "before" at 1024 |
| A1 | PARTIAL (same run) | rows 1, 3 and Step B done; row 6, Step C, Step D not done (report `cloud-results/admin-a0-a1.md` on that branch). Row 1 removes one import from `App.hooks.ts`: T1b line numbers there shift by one after it merges |
| A2 | DONE (same run) | AU-D14 |
| J1 | **READY-WITH-NOTE** | routable fix verified for 8 panel kinds x 9 permission sets on built `dist`; two existing assertions change by AU-D11 (named in the sheet); T9 needs the package self-reference command (minimal-host does not depend on admin); STOP command made exact |
| J2 | **READY-WITH-NOTE** | judge 2 added seams T1b needs (1b host-owned session, `ids`, `afterMain`, `assistantAside`, topbar icon parity); step 5 (class rename) stays on `admin-ui/J2-classes` and merges only with T1b step 3; its write set is `packages/ui/src/styles/admin.css`, not the theme file; Jini hook gate is red on the base (PRE-EXISTING, BASE-RED) |
| J3 | not re-judged in this pass | T1b depends on it unchanged (`useThemeHook={() => undefined}`) |
| T1a | not re-judged; its census ran (`panel-access` users: `App.tsx:28,215,576`, `panels.tsx:3,119`, `lib/__tests__/panel-access.unit.test.ts`, plus comments) | Tovu panels declare **no** all-of `permissions` (0 hits), so J1's all-of changes cannot move a Tovu panel; P1 stands |
| T1b | **BLOCKED (owner decision AU-D15, new; then READY-WITH-NOTE)** | revision 3's mapping would have broken legacy `/section/:id`, the `/assistant` alias, moved import-export/add-ons URLs, the Sites gate, `#admin-sidebar`/`#main-content` lookups (26 baseline `app-*` files, 259 tests pin them). Mapping rewritten with a route-parity step 0; estimate 260k → 380k |

New owner decision:
| # | Decision | Recommendation |
|---|---|---|
| AU-D15 (new, judge 2) | After T1b, a legacy `/admin/section/<unknown id>` URL still shows the Placeholder, but `main[data-agent-page]` reports the hidden `section` panel's id instead of the unknown id (no Jini seam reports a route param as the page id; unknown ids are not published agent pages) | accept |

## Revision 2 - judge response (`CODEX-JUDGE.md`; every finding verified against the code first)
Code read: Tovu `integ/merge-a-2026-11-16` @ `e801e9ae`, `integ/merge-b-2026-11-16` @ `450ac748`; Jini merge-a @
`dde69a6d`, merge-b @ `9c982fd9`. The judge read `refactor/terra`; every citation below was re-checked on merge-a.
| # | Severity | Verdict | What changed (file) | Evidence |
|---|---|---|---|---|
| 1 | Blocker | ACCEPT | `A-prereqs.md` row 7 + new Step D: export inventory, the two live helpers stay in `lib/credential-copy.ts`, only the three forwarding lines go, tests D1-D4, size-exception path fixed | `apps/admin/src/lib/credential-copy.ts:2-4` forwarding, `:10` `storedCredentialHint`, `:21` `credentialDraftError` (rethrows non-validator errors `:28-29`); 15 production importers |
| 2 | Blocker | ACCEPT | `J-shell.md` J2 step 4 `slots.frame`; `T1-adopt-shell.md` provider row, tests S8-S9, Chrome check | `App.tsx:678-680` providers wrap layout, dock, overlays; `RoutedA2uiSurfaceCard.tsx:75`; `chart-registry-context.ts:10-13` core-only default |
| 3 | Blocker | ACCEPT | `COMMON-ADMIN.md` sections 2, 3, 6: no coordinator-only files, the run edits manifests/lockfile/registrations in the commit that needs them, shared files serialized, wip branch vs lane branch with `git rebase --exec`; `T-SCREEN.md` steps 3-4; `JM` recipe; INDEX section 6 | round-1 `COMMON-ADMIN.md:87-90,112-113` vs `:71` contradicted each other as the judge says |
| 4 | Blocker | ACCEPT | `JM-jini-domains-out.md`: reverse-edge census for every folder; media note moves `embed-policy.ts` to its owner in commit A and removes the admin export | `packages/admin/src/core/ports/embed-policy.ts:7`, `core/ports/index.ts:130`; no importer of `EmbedPolicyPort` in Jini packages or Tovu apps; `cms/src/media/html-attributes.ts:98` already declares the type |
| 5 | Major | ACCEPT | `J-shell.md` G8 + J2 step 3 `slots.sidebar` render slot (replaces `sidebarOverlay`); T1b mapping row, tests S10-S11, 1024 px check; `COMMON-ADMIN.md` section 4 | `App.tsx:603-641` (two nav slices, toggle between, `{...dockRail}`); `use-dock-auto-rail.hooks.ts:59-61`; `AdminShell.tsx:55-69` fixed arrangement |
| 6 | Major | ACCEPT | `J-shell.md` J1 rewritten: file list adds `core/manifest/rules.ts` (read) and `core/index.ts`; routable vs visible sets, `access`, `noAccess` moved into J1, tests T7-T10 through `AdminShell`; two behaviour changes declared (D-11) | `react/shell/model.ts:25-29,34-35`; `core/manifest/rules.ts:34`; `core/index.ts:33` |
| 7 | Major | ACCEPT | `J-shell.md` J3 redesigned: ownership table, host keeps settings binding, painting and pre-paint; shell gets a theme hook seam, no new port method; inventory rows `admin-themes` → STAY; D-13 | `theme-ports.ts:10-13` sync, scheme-only; `admin-themes/use-admin-theme.hooks.ts:34-41` four async methods; `apply.ts:60-74` three attributes + storage hint |
| 8 | Major | ACCEPT | `S-SECURITY-and-DOCK.md`: invented tests removed; operation-trace table (cited cells), parity tests only from rows, P1-P4 from verified facts, hardening split out (D-12); `T-SCREEN.md` "characterize, never invent" | `use-security-permissions.hooks.ts:8-17`; `Security.tsx:153-163`; `api/security-api.types.ts:9-18` |
| 9 | Major | ACCEPT | `S-screens-ready.md`: collections reduced to content types (run a); `S-design-first.md` new S-ENTRY-EDITOR joined to the TipTap decision; `T-SCREEN.md` STOP for third-party editor imports | `CollectionEntryEditor.tsx:1,4,466`; `use-collection-entry-editor.hooks.ts:2-3,9` |
| 10 | Major | ACCEPT | `S-design-first.md` S-ENTRY-EDITOR items 3-4: pin the present payload and save-then-publish, field-diffing excluded, fake must refuse stale versions first; round-1 test C1 deleted | `use-collection-entry-editor.hooks.ts:244-254`; `collection-entry-editor-dependencies.hooks.ts:75-79` |
| 11 | Major | ACCEPT | `S-screens-ready.md` S-MENUS: existing `listPages` port reused, `PagePicker` slot removed, M1 is up/down + save payload, M4 added | `menus-port.hooks.ts:25`; `menus-dependencies.hooks.ts:1-19`; `MenuEditor.tsx:17-19`; `use-menu-editor.hooks.ts:216-219,320` |
| 12 | Major | ACCEPT | `JM-jini-domains-out.md`: five pre-runs; `SeoPage.tsx` partition table by declaration; debt census per folder; cost added (0.92M) | `SeoPage.tsx` 838 lines; `scripts/size-debt.json:108-119`; 20 size keys and 77 hook keys in the nine folders |
| 13 | Major | ACCEPT | `JM-jini-domains-out.md` pre-run step 4: four test classes, case ledger across destinations, G-TESTS ownership split and prerequisite | 92 of 135 test files in the nine folders import admin internals outside their folder; `media/react/__tests__/media.test.tsx:3-18` |
| 14 | Major | ACCEPT | `S-SECURITY-and-DOCK.md` S-DOCK table and runs: existing overflow/slow-run/folder-drop files listed, registry split into lifecycle vs host bindings, tests O1-O5, split-design prerequisite removed, estimate 0.77M → 0.60M | files exist on merge-a and merge-b (79/59/72/41/63/79 lines); invariant at `OverflowAwareMcpUiSurfaceCard.tsx:25-42` |
| 15 | Major | ACCEPT | `COMMON-ADMIN.md` sections 0 and 2: every command names its directory, admin tests via `npm --prefix apps/admin run test --`, debt paths corrected; `A-prereqs.md` exception path | `development/scripts/{size-debt,src-complexity-debt,size-exceptions}.json` exist, `development/size-debt.json` does not; `size-exceptions.json:20` |
| 16 | Major | ACCEPT | `JM-jini-domains-out.md` exact specifier table (41 keys), existing cms roots preserved, 17 `export *` lines removed in pre-runs; `COMMON-ADMIN.md` browser proof = real `vite build`; INDEX subpaths made consistent (`…/admin/react`) | `packages/cms/package.json` `./forms`, `./media` (node) exist; `user-management/package.json:59-79` precedent; `apps/admin/package.json:12` build refuses linked Jini |
| 17 | Minor | ACCEPT | `COMMON-ADMIN.md`: locales from `ADMIN_LOCALES` (21 translated), two-way file-set guard, wider lazy-import regex, DOM class assertion, by-file hook check, comment diff by content | `packages/contracts/src/admin-locales.ts` 22 entries; `seo-i18n-parity.unit.test.ts:12` 21; `scripts/check-hook-injection.mjs:41-47` count ratchet |
Counts the judge called stale, re-run: translated locales 21 (was 20); production files importing website source 7
(unchanged), admin test files mentioning `website/src/` 30 (unchanged); panels 51, any-of 31 (unchanged).

## Revision 3 - Opus review response (complete; first part B1 + M1, second part below)
Review: Opus, plan @ 5f5f211ce (scratchpad `opus-review/admin-ui.md`, itself partial). Checked on `integ/merge-final-2026-11-16` (Tovu f70017dc5, Jini 65d73b0d5).
| item | verdict | change | evidence |
|---|---|---|---|
| B1 routable set drops every all-of panel | ACCEPT (mechanism differs from the coordinator's wording) | `J-shell.md` J1: routable = `resolvePanels({ panels }, { capabilities, permissions: ['*'] })`; real permissions go to `isPanelAccessible` (visible + `access`); new tests T11-T13 + V3 (T11/T13 RED without `['*']`, T12 RED on today's `model.ts`). Passing the real permissions into `resolvePanels` was not used: a denied all-of URL would fall back to the default panel again and unknown permissions would still drop all-of panels | Jini `core/manifest/rules.ts:34,38`; `core/permissions/rules.ts` (`'*'` wildcard); `react/shell/model.ts:25-28` |
| M1 Step D moves a re-export shell | ACCEPT | `A-prereqs.md` Step D: admin imports the 4 token names from `@jini-ai/platform/secrets/credential-token` (declared in admin, `universal` entry); only `credential-copy.ts` moves, its import repointed to platform; `@tovu/contracts` gains the declared `@jini-ai/platform` dependency; no `exports` edit (wildcard) | website `contracts/core/credential-token.ts:3-5` re-export, `:6-10` live binding; `packages/contracts/package.json` exports `./*`, deps analytics + diagnostics only; Jini platform `jini.entries["./secrets/credential-token"] = universal` |

Revision 3, second part (all remaining items; checked on Tovu merge-final `232764af5`, Jini `65d73b0d5`):
| item | verdict | change | evidence |
|---|---|---|---|
| M2 COMMON-ADMIN obeyed the xpkg COMMON and also "won" over it | ACCEPT | `COMMON-ADMIN.md`: the reference is dropped; the file is self-contained and names which xpkg clauses it copied (S3→C4, S8→C8, S9→C12, S11→C9, S13→C6, hand-deleted debt keys) and which do not apply (census, compliance classes, single-branch git, report path). Real conflicts found and settled: (1) base merge-a vs merge-final → merge-final, with ancestry checks; (2) `check-hook-injection.mjs --update` (rewrites the whole debt file) vs xpkg "delete only your own keys, never regenerate" → hand deletion | xpkg `COMMON.md` rev 3 line 3 (disagreement = STOP), line 31 (never regenerate); Jini `scripts/check-hook-injection.mjs:3,22` (`--update` rewrites) |
| Commands inside tables | ACCEPT | `COMMON-ADMIN.md` section 2 is now a rule table C1-C12 with no commands plus one fenced block per rule; `A-prereqs.md` rows 1 and 6 and `J-shell.md` G1 commands moved to blocks. No `\|` pattern existed anywhere in the plan (searched all sheets); the table cells held raw `|` alternations | old `COMMON-ADMIN.md:100-108`, `A-prereqs.md:34,39`, `J-shell.md:10` |
| S-FN50 missing | ACCEPT | `COMMON-ADMIN.md` C8: eslint 50-line functions + 500-line files on changed files, compared with the base (model: xpkg S8). Tovu passes NO complexity rule (config already errors at 10, admin 9; a command-line 10 would loosen admin); Jini repeats complexity 10 + cognitive 10 | Tovu `development/scripts/complexity-eslint.config.mjs:43-48`, `size-eslint.config.mjs` (warn 50, gate 80, `IIFEs: true`); Jini `eslint.config.mjs:66-75`, `package.json` `complexity:strict` |
| Judge row 8 (security trace) | CONFIRMED | facts re-read; sizes added to `S-SECURITY-and-DOCK.md` | `use-security-permissions.hooks.ts:8-17` (unknown = hidden), `Security.tsx:153-163`, `security-api.types.ts:9-18`; `AccessTokensTab.tsx` reads no permission (0 hits) |
| Judge row 9 (collections → content types; entry editor joined to TipTap) | CONFIRMED | none | `CollectionEntryEditor.tsx:1` `@tiptap/react`, `:4,466` widget embed; hook `:2-3` tiptap, `:9` widget embed; `@tiptap` in 8 `lib` and 11 `features/posts` source files |
| Judge row 10 (pin the write contract; fake must refuse stale versions) | CONFIRMED | none | hook `:244-254` sends title + `fieldsJson` + `bodyJson` + `expectedVersion`; publish saves first and publishes with the returned version (`:296-318`); fake `collection-entry-editor-dependencies.hooks.ts:75-79` returns `expectedVersion + 1` without comparing |
| Judge row 11 (menus) | CONFIRMED | none | `menus-port.hooks.ts:25` optional `listPages`; `menus-dependencies.hooks.ts:19` binds `pagesApi` + `pagePublicPath`; `MenuEditor.tsx:17-19` "No drag-and-drop"; hook `:216` refusal, `:219` query disabled, `:320` `toSlug`, `:338` `moveAt` |
| Judge row 14 (dock) | CONFIRMED, sizes updated | `S-SECURITY-and-DOCK.md` S-DOCK now measured on merge-final | the 6 files 79/59/72/41/63/79 unchanged; `OverflowAwareMcpUiSurfaceCard.tsx:25-42`; `RoutedA2uiSurfaceCard.tsx:75`; `use-dock-renderer-registry.hooks.ts:186-193`; `AssistantDock.tsx` 242 (merge-a 665) |
| New: S-POSTS said size-05 is in no merge branch | FIXED (found while checking row 9) | `S-design-first.md` S-POSTS (1), INDEX section 2 and D-0 | `ffba5e382` "Squash refactor/size-05-posteditor (merge-a #6)"; `git diff size-05 ffba5e382 -- apps/admin/src/features/posts` is empty; `posts/editor/` 28 files already at `f354cfbd` |
| m1 Sidebar.tsx "has a debt/exception row" | ACCEPT | `J-shell.md` J2 step 5: 593 raw, about 351 code lines, under the gate, no row | Jini `scripts/check-size.mjs:57` (skips blanks and comments); no `Sidebar` in `size-debt.json`, `size-exceptions.json` |
| m2 guard read inventory from `$T` | ACCEPT | `COMMON-ADMIN.md` section 0: the run fetches the plan branch and reads the file from `FETCH_HEAD` into `$INV`; the dispatcher pastes it if the fetch fails; the NEW check now uses the inventory's own file filter | plan branch is on the Tovu remote |
| m3 inventory stale | DONE | `inventory.tsv` regenerated: 1,068 rows (2 new: `AssistantDock.state.hooks.ts`, `DockChatPane.tsx`, verdict copied from their area; 8 gone). Drift vs `f354cfbd` over a third: `f/members`, `f/users`, `f/library` (no sheet moves them); everything else under | script logic: areas from the path, kind from the name, blobs from `git ls-tree --abbrev=10` |
| m4 T1a P1 snapshot source | ACCEPT | `T1-adopt-shell.md` P1: expected sets computed by Tovu `withoutInaccessiblePanels` on the base and pinned as literals | `lib/panel-access.ts:64` |
| Website `credential-token.ts` re-export | DESIGNED, owner decision D-14 | `A-prereqs.md` new sheet A2: optional `credentialPolicy` port on the media credential store replaces the test's `mock.module`; re-export lines deleted; 40 importers repointed by name; tests W1-W2 | `credential-token.ts:3-5` re-export, `:6-10` binding; `provider-credential-store.rethrow.test.ts:17-27`; store call sites `:154,169,200`; root `package.json:127` declares platform |

## What remains after revision 3
- Not regenerated: the section 4 per-screen table (its `screens.gen.md` source was never committed) and the size columns of the S sheets (still `f354cfbd`; the guard reports each
  changed file, and only `f/members`, `f/users`, `f/library` drifted by more than a third).
- Section 9 items 1-3, 5, 6 (design runs, S-SECURITY run a, "later" screens, `AssistantDock.hooks.tsx` split, a
  second adversarial pass on J1/J2/T1b) and the xpkg G-TESTS ownership confirmation (section 8).
- Owner decisions D-1..D-14 (D-0 answered).
