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
