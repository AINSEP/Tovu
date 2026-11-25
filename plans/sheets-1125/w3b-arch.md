SHEETS Architecture leftovers COMPLETE: 22 sheets (14 Jini / 8 Tovu), 12 OPUS-REVIEW, 0 files move, 2 STAYS-HOST, 7 BLOCKED

Build after first-pass sheets 1–12. Tovu `c0f1068a59` and Jini `fd06f45b1` are each one report-only commit ahead of the source anchors in the first pass. The paths and lines below refer to the current snapshots, before sheets 1–12 are applied. No files changed. No tests, builds, installs, or type-checks ran.

`J/` means Jini `packages/`, `W/` means Tovu `apps/website/src/`, and `A/` means Tovu `apps/admin/src/`. The move count is for existing files relocated in full. G06 extracts bodies into new private modules. Package changesets and baseline actions below are instructions for the builders, not changes made in this dispatch.

## Status ledger

| First-pass remainder or disposition boundary | Status |
|---|---|
| R01 admin-owned classes and shared email/provider selectors | SHEETED · 13–14 |
| R01 UI widget and feature classes after the table slice | SHEETED · 15–16, 18 |
| R01 chat-owned classes and chat’s consumers of UI widget classes | SHEETED · 17–18 |
| R01 user-management, commerce, and devops class census | SHEETED · 19–21 |
| R01 Tovu chrome, theme styles, C0 host selector contracts, and injected host class values | STAYS-HOST · Tovu owns these style values. Sheets 14, 18, and 21 change package-facing bindings only. |
| R02 remaining ID citations, README and `PORT.md` rows | SHEETED · 22 |
| R02 executable copy and descriptor help | SHEETED · 23–24 |
| R03 legacy agent-plugin namespace, including install, index, MCP projection and persistent reads | SHEETED · 25, 27 |
| R03 preboot, credential cards, host tools, maturity, provider-face links, fork packaging and supersession | SHEETED · 26–27 |
| R03 site-plugin manifest filenames and SDK alias compatibility | SHEETED · 28–29 |
| R03 Tovu SDK resolution and site-plugin admission policy | STAYS-HOST · The packaged SDK path, exact aliases, tier policy and boot/worker bindings are host inputs. |
| G06 physical split and whole-file size row | SHEETED · 30 |
| H2 required new change-set writes, co-persisted events and preservation of stamped actors during outbox preparation | SHEETED · 31–32 |
| H2 standalone publish fallback and unforwarded publish contributors | SHEETED · 33–34 |
| H2 make every new outbox write actor-required | BLOCKED · The owner must decide attribution for anonymous ingress and derived events whose original envelope has no actor. Neither `user` nor `system` can be inferred safely. |
| H2 direct active-theme writes | BLOCKED · Choose a durable attribution record and whether a failed render verification records the attempted switch and its compensation or neither. Existing telemetry is not that record. |
| H2 taxonomy merge | BLOCKED · Its terminal attribution is the taxonomy revision row. Decide the revision ledger representation before requiring a kind that the writer cannot persist. |
| H2 Trash ledger kind | BLOCKED · Decide nullable actor-kind storage and retention/redaction for new rows without reinterpreting the existing principal and plugin fields. |
| H2 `taxonomy_revisions` actor-kind storage | BLOCKED · Decide schema and legacy-null semantics. `previousState` is domain data, not an attribution field. |
| H2 `post_revisions` actor-kind storage | BLOCKED · Decide schema and treatment of historical rows with synthetic or missing provenance. |
| H2 restore-ledger `actor_kind` column | BLOCKED · Typed attribution already lives in detail JSON. An additional queryable column needs the migration decision. |

K03’s bridge disposition is in first-pass sheet 5, not in the NOT-SHEETED handoff. This continuation does not repeat it, FIX 19’s apply-entry and restore changes, or FIX 24’s shell alias retirement. Manifest filename and SDK reads stay compatible in Tovu after their literals leave Jini.

## Build order

### 13. R01.ADMIN.J — Prefix admin-owned selector families

**BUILDER: SOL**

**Write first.** Add `email form spacing and provider loading paint survive the selector cutover` to the email screen tests and `a drag changes the dropzone outline without changing its accessible name` beside `J/admin/src/shell/components/InstallTabCard/__tests__/`. Use the real stylesheets, including a host-shaped wrapper. `M-admin-markup-with-old-css` leaves one old email selector or drag-state selector in CSS. The computed-style witness must fail.

**Change.** No TS signatures change.

| Baseline owner | Token-only edit |
|---|---|
| `J/admin/src/screens/email/email.css`, `EmailParts.tsx:27–65`, `EmailSenderTab.tsx:50–174`, `EmailTemplatesTab.tsx:32–89`, `EmailOverviewTab.tsx:47+` | Prefix CSS-owned `email-*` class tokens with `jini-admin-`. Use the exact tokens in the stylesheet as the allowlist, including the dynamically assembled `email-section`/`email-section-untitled` pair. Do not change IDs starting `email-`, field names, handles, labels, or `status-*`. |
| `screens/plugins/provider-settings-dialog.css:4–35` | Prefix its `provider-settings-*` class family with `jini-admin-`. Where the CSS currently uses `.field`, `.field-hint`, `.field-label`, or `.save-error`, keep the generic class contract distinct from the dialog’s private selectors. Sheet 14 updates the emitting host markup. Keep `--admin-dialog-width`, the animation, reduced-motion rules and dialog kit classes. |
| `shell/components/InstallTabCard/InstallTabCard.tsx:27,147`, `install-tab-card.css:10,30` | Rename the two private state tokens to `jini-install-tab-is-soon` and `jini-install-tab-is-dragging`. Keep the `card`, `card-title`, `field-hint`, button and other shared chrome contract values. |
| `screens/dashboard/Dashboard.tsx:102,151,184,397–400`, `dashboard.css:167–171,255` | Replace only the states on `jini-dash-*` markup and its paired selectors with `jini-dash-is-error` and `jini-dash-is-collapsed`. Do not rename the host dashboard’s separate `.dash-panel.is-collapsed` or the shared base utilities. |

For the rest of the admin census, use the tracked emitters under `src/{react,shell,screens,forms,media,comments,posts,seo,redirects,widgets,roles,security}` and their shipped CSS together. Keep the existing prefixed families in authentication, consent, observability, skills, restarts, media and security. A package-private unprefixed token emitted by one of those owners gets `jini-admin-` plus its old token, with all selector arms updated. The `page`, `notice`, `settings-ui-section`, `list-table`, `card-title`, `content-editor-*` and C0 dialog cases are shared contracts, not candidates for a global rename. An unused-looking CSS selector is not permission to delete it.

**Importers and package.** No specifier repoints. Close against `git grep -nE 'email-|provider-settings-|is-dragging|is-soon|is-collapsed|is-error' -- packages/admin/src examples` and inspect each exact class-token hit in the edited components and styles. Keep the CSS exports in `J/admin/package.json:3775,4534,4570` and the existing component entries. `.changeset/r01-admin-owned-selectors.md`, admin major for changed public CSS selectors. No declaration drift.

### 14. R01.ADMIN.T — Update the package-facing selector bindings

**BUILDER: SOL**

**After 13. Write first.** In `A/features/email/__tests__/Email.unit.test.tsx` and `A/features/plugins/__tests__/plugin-provider-settings.unit.test.tsx`, add `the exported stylesheet still paints the mounted host view`. Pin the form layout and the pending provider-dialog affordance separately. `M-host-emits-retired-provider-spinner` leaves the old spinner class only in host markup.

**Change.** `A/features/email/Email.tsx:29,105–117,208–227` and `EmailTemplateEditor.tsx:21,48–141,279–300` consume the exported email stylesheet. Update the corresponding CSS-owned tokens in those files, `EmailProviderTab.tsx:40–255`, `EmailSegments.tsx:17+`, and `__tests__/{Email,EmailTabs}.unit.test.tsx:159,105` respectively. Use `git grep -nE 'email-[[:alnum:]-]+' -- apps/admin/src/features/email apps/admin/src/styles*` against the exact sheet 13 class set. A host-owned class also used by local CSS can coexist with its new package class on that host node. Do not rename IDs, handles, test doubles, or local-only selectors.

Update `A/features/plugins/PluginProviderSettingsDialog.tsx:13,49–65,79,103+` and `__tests__/plugin-provider-settings.unit.test.tsx:71,86,112,142,254`. Pair any other emitters found by `git grep -nF 'provider-settings-' -- apps/admin/src` with their stylesheet selectors. Keep the host renderer, required view-model hooks, accessibility and package stylesheet import in place. Leave `A/styles.css:2204–2231` drawing the host dashboard.

**Package.** No Tovu export, changeset or baseline change. Wire with sheet 13’s admin artifact.

### 15. R01.UI-WIDGETS.J — Prefix Select, InfoTip, SeeMore and the UI TabBar

**BUILDER: SOL**

**Write first.** Add `a keyboard-opened Select paints its portalled option panel`, `InfoTip retains the below-placement marker and keyboard focus`, `SeeMore expands only its own text`, and `a selected UI TabBar item retains its count and underline` in the existing Select, InfoTip, SeeMore and tab-strip suites. Load the CSS that styles the tested renderer. `M-ui-tab-markup-with-old-active-selector` leaves the old selector on the `aria-selected` rule.

**Change.** Rewrite the class tokens `select-{trigger,trigger-label,trigger-chevron,panel,search,list,option,option-check,empty}`, `info-tip` and its emitted suffixes, `see-more` and its emitted suffixes, and `tab-bar` plus `-item`, `-count`, `-icon` to `jini-ui-<old-token>`. Preserve already prefixed tokens such as `jini-tab-bar-tag`. `jini-select-*` in the separate CustomSelect at `J/ui/src/react/components/{CustomSelect.tsx:574,CustomSelectMarkup.tsx:76}` and `jini-tab-bar-*` in UI Kit are **not** the old families. Leave shared `is-placeholder`, `is-selected`, `is-highlighted`, `is-expanded`, and `visually-hidden` semantics intact. `resolveSelectTriggerLabel`’s result type is unchanged, but its `className` value is part of the cutover.

- Markup owners are `J/ui/src/features/admin-widgets/components/Select/Select.tsx:182–183,254–268` and the popup/helpers in that directory, `components/InfoTip.tsx:57–137`, the `SeeMore` component, and `J/ui/src/features/tab-strip/react/components/TabBar.tsx:99+`.
- Match selectors at `J/ui/src/styles/admin.css:88–289` and in the admin-widgets stylesheet wherever the same token is present. Both distribution style entries keep their import order. Use the native portal and test focus behavior. Do not substitute ARIA attrs for classes if it changes specificity.
- The Jini consumers outside UI are `J/admin/src/shell/components/AssistantDock/DockHeaderTip.tsx:22`, `J/admin/src/shell/hooks/__tests__/use-list-table-cell-labels.unit.test.tsx:22` and its live label reader if it queries the tip class, `J/chat/src/react/features/chat-pane/components/RuntimeDropUp.tsx:37`, and `J/chat/src/react/styles/chat-settings.css:46–57,70,96,136–141`. Repoint exact class tokens, including tests, in that same commit. No dependency import.
- Close with `git grep -nE 'select-(trigger|panel|option|search|list|empty)|info-tip|see-more|tab-bar' -- packages/ui/src packages/admin/src packages/chat/src examples`. For style-only selectors on shared injected host markup, carry the paired hosts in sheet 18.

**Package.** Keep `J/ui/package.json:254–259` and its existing theme CSS distribution. No new CSS entry. `.changeset/r01-ui-widget-selectors.md`, UI major, and admin/chat patch for their matched consumers. No declaration baseline drift.

### 16. R01.UI-FEATURES.J — Finish the settings and other portable UI selector groups

**BUILDER: SOL**

**Write first.** Add `drawer, connector status and keyboard close agree with the shipped settings sheet` in `J/ui/src/features/connectors/__tests__/components/ConnectorDetailDrawer.test.tsx`, and `the empty external-tool view and expanded memory section retain their layouts` in the external-MCP and memory component suites. Add one paired style/interaction case for each additional private family in the source ledger below. `M-connector-status-styles-old-class` leaves the old `connector-status-pill` selector. `M-ui-feature-utility-renamed` rewrites a literal utility used by generated CSS and must fail the representative render.

**Change.** For the old tokens below use `jini-ui-<old-token>`. Keep suffixes and CSS cases such as `status-${statusTone}`, `size-${size}`, `state-${state}`, portal placement, and ancestor `data-*` selectors. Replace family-private state tokens only within that family’s markup and selector, never across all features.

| Owner and current anchors | Matched scope |
|---|---|
| `J/ui/src/features/connectors/components/{ConnectorCard,ConnectorGrid,ConnectorDetailDrawer,ConnectorLogo}.tsx`, drawer `:72–85+`, logo `:42–61` | `connector-*` and `connectors-*` in markup, settings CSS and connector tests. Existing `jini-connector-*` stays. |
| `features/external-mcp/react/components/ExternalMcpTab.tsx:86–104,156–202` | `external-mcp-*` present in the exported settings stylesheet. Tovu has a separate emitter, handled in 18. |
| `features/memory/react/components/{MemoryEntryCard,MemoryAdvancedModal,MemoryExtractionCard,MemoryHooksPanel,MemoryList,MemoryManualEditor,MemorySettingsPanel}.tsx`, e.g. EntryCard `:44`, AdvancedModal `:166` | Old `memory-*` selectors and their actual memory emitters. Do not expand the rename to memory path, record, or tool IDs. |
| `features/{source-config-list,skills,instructions,media-providers,execution,settings/dialog}` | Match old `source-config-*`, `skills-*`, `settings-*`, `library-*`, `media-provider-*`, `toolbar-*`, `toggle-*` and privately emitted select/status modifiers against `settings/dialog/styles/settings-dialog.css`. Only match a token to an actual emitter. Leave prefixed equivalents and injected host styling alone. |
| `features/{viewer-shell,resource-dashboard,asset-tree-browser,asset-grid,mcp-ui,tabbed-dialog}`, `react/components/OnboardingDropdown.tsx:470,550` | For the remaining UI census, prefix owned class families found in these emitters only when their CSS/DOM consumers can be paired. `tabbed-dialog.css:144`’s historical `.is-sidebar-collapsed` example is not live markup. Build utilities, `data-slot` hooks, editor/library markup and Remix Icon `ri-*` are not app-owned CSS classes. |

The starting selector ledger is `git grep -nE 'connector[s]?-|external-mcp-|memory-|source-config-|settings-section-card|library-|media-provider-|toolbar-|toggle-|onboarding-view' -- packages/ui/src packages/admin/src examples`. Include explicit selectors in tests such as `features/source-config-list/__tests__/SourceConfigItemCard.test.tsx:49` and the layout readers at `features/execution/__tests__/react/components/{LocalCliAgentCard,ByokProviderForm.layout}.test.tsx`. For families not on the selector list, use `git grep -nE 'className|classList|class=' -- packages/ui/src` to distinguish existing prefixes, utility classes, injected props, and exact owned tokens before editing. No global replacement of `active`, `open`, `primary`, `selected`, `body`, or any generic state.

**Package.** No API or import path changes. Keep `./settings-dialog.css`, `./tabbed-dialog.css` and `./interactive-ui.css` at `J/ui/package.json:194–196` and preserve the Tailwind sources at `:335`. `.changeset/r01-ui-feature-selectors.md`, UI major. No declaration drift.

### 17. R01.CHAT.J — Pair chat markup with its stylesheet consumers

**BUILDER: SOL**

**After 15. Write first.** Add `a closed MCP UI surface remains a bounded status card` to `J/chat/src/react/components/__tests__/McpUiSurfaceCard.test.tsx`, and `a locked question form paints its disabled choices while the answers remain readable` in `QuestionForm.test.tsx`. Add `fallback A2UI output preserves the refused surface and data markers` in the A2UI surface suite. `M-chat-state-markup-only` leaves the closed-card selector stale on one stylesheet consumer.

**Change.** Map the remaining chat-owned, unprefixed `mcpui-surface-*`, `a2ui-*` fallback classes, `question-form*`, `qf-*`, `chat-fab*`, `op-*`, `todo-*` and privately owned `accordion-collapsible` tokens to `jini-chat-<old-token>`. Keep `jini-qf-*`, `jini-qp-*`, `jini-op-*` and `jini-a2ui-*` unchanged. Preserve `data-a2ui-*`, IDs, status and protocol values, labels, and keyboard behavior. `J/admin/src/shell/components/ChatFab/ChatFab.tsx:121` shares the host FAB style contract. Rename its `chat-fab`, `chat-fab-dock-open`, and `chat-fab-dragging` tokens to the same prefix in this sheet. Leave the already-prefixed vanilla widget at `J/chat/src/embed-widget/vanilla/index.ts:64–93` alone.

The source anchors are `J/chat/src/react/components/{A2uiSurfaceCard.rules.ts:24,A2uiSurfaceCard.tsx:52–222,McpUiSurfaceCard.tsx:188,333–370,QuestionForm.tsx:86–146,QuestionFormField.tsx:34–226,ChatFab.tsx:28,TodoCard.tsx:30–57,ToolCard.tsx:131,248,294,475–482,516,619}`. Update actual matching chat CSS and examples, and the close-state assertions in `__tests__/{McpUiSurfaceCard,answered-question,standalone-approval,surface-question-replay}.test.tsx`. Tovu paints some of these classes even when `reference.css` is absent. Sheet 18 owns those rules. `git grep -nE 'a2ui-|mcpui-surface-|question-form|qf-|chat-fab|op-(card|title|output|status)|todo-|accordion-collapsible' -- packages/chat/src packages/admin/src examples` is the consumer search. If an existing `primary` or `open` utility does work for host paint, retain it as a contract rather than replacing it globally.

**Package.** No signature or export-map change. Keep `J/chat/package.json:105,130,258`. `.changeset/r01-chat-dom-selectors.md`, chat/admin major for their changed DOM selectors. API declarations unchanged.

### 18. R01.UI-CHAT.T — Repoint Tovu’s CSS consumers, not its themes

**BUILDER: SOL**

**After 15–17. Write first.** Add `a selected tab, portalled select and open dock keep the host paint` in the existing admin integration/stylesheet suites. Add `a declined MCP card still uses the closed-card style` to the real dock approval integration. `M-host-keeps-retired-closed-card-selector` leaves the old selector in the host stylesheet.

**Change.** Keep `A/integrations/jini-kits.ts:18–20,61–77` using the same kit implementations and stylesheet imports. Repoint the package-facing exact selectors:

- `A/styles.css:258–291,2670–2681,2923–3052,3359–3371,4767–4768`, `A/styles/{select.css:47–186,site-transfer.css:16–17}` and `A/integrations/jini-admin/jini-media.css:532–638` for sheet 15. Preserve Jini UI Kit’s pre-existing `jini-select-*` and `jini-tab-bar-*` arms in mixed selectors. Adjust only the old UI TabBar branch of a combined selector. Update `A/__tests__/unit/{select-panel-surface-css,selection-ring-css}.unit.test.ts` and `A/components/__tests__/Select.unit.test.tsx:615–629`.
- `A/main.tsx:14`, `A/features/settings/{SettingsUi.tsx:113,ExternalMcpSettingsPanel.tsx:66,537+}`, the `A/styles/settings.css` and `A/styles/external-mcp-tool-picker.css` consumers, and adjacent stylesheet assertions for sheet 16. Leave the imports where they are. Add the new package styling class at a host emitter that consumes it, preserving any separate host-local class on the same node.
- `A/styles/assistant.css:249–401,710–742,1762–1764,1845–1856` and the exact question-form/tool-card selectors in that file or its imports for sheet 17. Update `A/components/AssistantDock/__tests__/unit/commit-approval.integration.test.tsx:44,67,78`. Do not rename `.fake-a2ui-surface-card` in `RoutedA2uiSurfaceCard.unit.test.tsx`, host dock state, or the sheet 8 table selector again.

Run the exact old-token ledger from 15–17 through `git grep -nE '<family alternatives>' -- apps/admin apps/site-chat apps/website`, including CSS compound selectors and test-body strings. Where two different emitters legitimately shared an old selector, split that selector arm to cover both and keep the declarations and specificity. No asset, theme module, or design-token replacement.

**Package.** No export, changeset or Tovu API-baseline changes.

### 19. R01.USER-MANAGEMENT.J — Put host-owned layout classes in the existing domain kit

**BUILDER: SOL**

**Write first.** In `J/user-management/src/react/members/__tests__/Members.kit.unit.test.tsx` and `react/users/__tests__/Users.kit.unit.test.tsx`, add `the table, empty state and notices use the supplied host classes`. Give two hosts different classes, use a stylesheet for each, and verify row navigation and action names. `M-members-hardcodes-host-table-class` bypasses the kit for the table.

**Change.** `J/user-management/src/react/kit.tsx:45–58,78–101` gains required `readonly classes: UserManagementClasses` on its `UserManagementKit`. Define `UserManagementClasses` in that existing owner. Use required readonly `string` slots named by semantic role, such as `page`, `pageHeader`, `pageHeaderText`, `pageKicker`, `pageTitle`, `pageDescription`, `tableScroll`, `table`, `card`, `empty`, `notice`, `error`, `actions`, `linkButton`, `mutedCell`, `form` and status-tone slots for the literals actually emitted. Use a typed key for a finite status set. Do not use `Record<string, string>` followed by unchecked indexing. Read classes via the same built-in React context mechanism as the existing kit delegates or pass an already selected value to private leaf renderers. Do not add custom-hook calls or optional hook defaults.

Anchors are `react/members/Members.tsx:115,164–223,274–282`, `react/users/{Users.tsx:113–114,238,284,725–778,UserRowParts.tsx:44,69,90–91,ChangeUsernameDialog.tsx:20}`, and the sibling roles/auth renderers found by `git grep -nE 'className|classList' -- packages/user-management/src/react`. Check `git grep -nE 'UserManagementKit|UserManagementKitProvider' -- packages examples` for all kit constructors, including `react/__tests__/fake-um-kit.tsx:4–7`. Map a token owned by the host to a slot, not to a guessed package-prefixed CSS class with no stylesheet. A genuinely private, locally styled token gets `jini-user-management-<old-token>` and paired selectors.

**Package.** Keep `./react` and the existing `./react/kit` export. `.changeset/r01-user-management-class-kit.md`, user-management major because existing kit constructors must supply the required values. Refresh `api-baseline/jini-ai__user-management.json`.

### 20. R01.DOMAIN-PAINT.J — Explicit class values for commerce and devops screens

**BUILDER: SOL**

**Write first.** In `J/commerce/src/react/__tests__/Payments.unit.test.tsx`, add `the host paints payments without changing the planned provider affordances`. In the devops React suites add `history, success and a failed run use the bound layout roles`. `M-domain-paint-fixed-fallback` restores one raw `dash-panel` or `save-error` literal. Host A and host B must yield different markup class values with the same semantics.

**Change.**

- `J/commerce/src/react/Payments.tsx:26–150` takes required `classes: PaymentsClasses` and required `usePaymentsHook: typeof usePayments`. Keep defaults for `locale` and `providers` only, keep `<Payments {...props} />`, and remove the optional props-object default. Domain-local class keys are `page`, `pageHeader`, `pageHeaderText`, `pageKicker`, `pageTitle`, `pageDescription`, `notice`, `panels`, `panel`, `panelHead`, `panelTitle`, `panelBody`, `actions`, `disabledStatus`, and `secondaryButton`. Pass the exact subset to private render helpers. Keep the hook’s locale and translator signature. Update the package’s `Payments.{hooks,locale,boundaries}.unit.test.tsx` and the direct call in `Payments.unit.test.tsx`. `git grep -nE '(<Payments|Payments\\()' -- packages examples` is the constructor ledger. No new Tovu mount.
- `J/devops/src/deploy/react/HistoryTab.tsx:22–59` adds required `classes` with `tab`, `card`, `empty`, `mark`, `title`, `body`, `secondaryButton`. `PublishRunResult.tsx:8–54` adds required `classes` with `success` and `error`. `J/devops/src/source-control/react/SourceControl.tsx:67–111` adds required `classes` for the package-emitted `page`, header, kicker, title and description tokens. Keep existing required hook/render props. No new theme dependency. Verify with `git grep -nE '(<HistoryTab|<PublishRunResult|<SourceControl|deployment-empty|save-(ok|error))' -- packages/devops examples` and the devops React emitter scan. Other style matches from an injected TabBar or a link handle are not screen-owned.

Do not import admin into either domain to obtain CSS. The class contracts are local presentation props, not shared data models.

**Package.** No new export paths. Keep commerce `./react` at `J/commerce/package.json:73`; keep devops `./deploy/react` and `./source-control/react`. `.changeset/r01-domain-paint-bindings.md`, commerce/devops major for required props. Refresh both API baselines.

### 21. R01.DOMAIN-PAINT.T — Bind existing Tovu style values at current mounts

**BUILDER: SOL**

**After 19–20. Write first.** Extend `A/integrations/__tests__/user-management-kit.integration.test.tsx` with `the real host keeps the members table and users empty-state styling`, and `A/features/deployment/__tests__/PureTabs.unit.test.tsx` with `the history message keeps the host layout`. `M-omit-empty-state-class-binding` supplies an empty string for just the deployment empty-state slot.

**Change.** Populate `userManagementKit.classes` at `A/integrations/jini-kits.ts:110+` with the current literal values, including `list-table`, `table-scroll`, `notice` and `empty-state`. `A/main.tsx:98` and `A/__tests__/render-with-jini-kits.tsx:23` already pass the complete object. Check extra provider constructors and the harnesses in `A/features/{members,users}/__tests__` via `git grep -nE 'UserManagementKit|UserManagementKitProvider' -- apps/admin`. No host CSS rules need renaming for this binding.

Pass the current deployment classes at `A/features/deployment/Deployment.tsx:62`, `StaticSiteTab.tsx:1287` and `__tests__/PureTabs.unit.test.tsx:27,41`. Use `A/styles.css:6097–6103`’s names for history. Pass the source-control classes at `A/features/source-control/source-control-panel.tsx:71+`. The Tovu commerce navigation at `A/panels.tsx:931,949` is not an import of Jini `Payments`. Leave it alone. Confirm with `git grep -nE 'commerce/react|<Payments|<HistoryTab|<PublishRunResult|SourceControlShell' -- apps/admin/src`.

**Package.** No Tovu export, changeset or API-baseline changes.

### 22. R02.REASONS.J — Replace consumer-only ID citations with reasons at the actual owners

**BUILDER: SOL**

**Write first.** Add `package port docs point at the contract that enforces the stated rule` to the repository’s doc/neutrality checks. Use a **closed fixture list** for the paths below. `M-restore-private-consumer-path` reintroduces the inaccessible `.local-artifacts` link in the comments port note. A second assertion pins that a representative wire vocabulary and explicit license credit are unchanged. Do not add a ban on ADR identifiers in historical records.

| Current anchor | What to retain or point to |
|---|---|
| `J/admin/src/comments/PORT.md:150` | Keep the scope of the shared port addition. Replace the private reports with the comments adapter/port and tests already in this package. |
| `J/admin/src/{forms/PORT.md:33,seo/PORT.md:25}` | Say the host supplies its existing dialog class and styles to keep DOM and layout stable. State that the native Dialog/TabBar inputs and DOM/ARIA/handle behavior remain. Do not edit actual `tovu-domain-dialog` selectors. |
| `J/cms/README.md:280,549,624` | Distinguish declared specs from host mounts, point to the relevant `src/admin-http/routes/` spec, and name `@jini-ai/core/contracts/server/verified-origin` as the reference matcher implementation. Do not imply every host mounts the custom routes or the folder picker. |
| `J/cms/src/admin-http/routes/{comments/README.md:3–4,content-types/README.md:3,entries/README.md:3,forms/README.md:3,menus/README.md:3,taxonomy/README.md:3,widgets/README.md:3,7}`, `src/navigation/README.md:3` | Describe the actual route/permission/validation behavior and the nearest service owner. For comments preserve moderation vs workspace settings, for navigation whole-tree write vs derived index, for taxonomy CAS, and for widgets the placement/inspection tool set. Subscriber names, permission strings and route IDs stay byte-identical. |
| `J/core/README.md:319`, `src/contracts/site/README.md:42`, `src/errors/README.md:10`, `J/db/src/watermark/README.md:4` | Explain host-owned vocabulary and composition, stable error disclosure/refusal boundaries, and the storage-kernel watermark’s one-query dialect contract. Link to the package’s own contract, error implementation or watermark conformance tests. |
| `J/user-management/src/members/{types.ts:2–35,58–95,125–168,200–229,329,ports.ts:2–31,104,183–229,258–265,374–389}` and `src/newsletter/{types.ts:4–55,99,139–171,236,260–302,339–372,ports.ts:4–19,54–61,75,124,211}` | Preserve member/operator session separation, revocation, scoped keys, no extra policy adapter for a single evaluator, transactional outbox/idempotency and the superseded campaign shape’s compatibility rationale. Do not make draft comments sound like shipping interfaces. Preserve historical provenance for superseded contracts. |
| Remaining current source and doc census | `git grep -nE '(SPEC[-_ ][0-9]+|ADR-([0-9]+|PIPE-)|Tovu/ADS-memory)' -- packages ':!**/CHANGELOG.md' ':!**/docs/**' ':!**/*test*' ':!**/*generated*'`. Partition by package, starting with CMS, user-management and admin. For each live source or doc hit use the nearest enforcing owner and state **why** the restriction exists. Keep actual IDs in quoted historical material, protocol references, generated artifacts and copyright/licensing references. Route any executable string to 23’s rules, never through the comment edit. |

The first citation pass is already in the tree. Use the live grep, not the old `404/536` tally as a patch list. Where an explanatory comment cites an unavailable host document and source does not substantiate the claim, preserve the claim as historical or say which decision the host must make. Never replace it with a guessed Jini guarantee.

**Importers and package.** No specifier, runtime, export, or API-baseline changes. No changeset for this source-comment and documentation-only sheet. Opus is not specially required for the doc sheet. Builder writes the check and leaves it unrun.

### 23. R02.LIVE-COPY.J — Remove internal IDs from shipped refusals and descriptor help

**BUILDER: SOL · OPUS-REVIEW**

**Write first.** In `J/cms/src/publish/content/__tests__/execute-import.test.ts:16`, add `unavailable restore point is still a hard refusal with no attestation override`. In the `J/plugins/src/runtime` catalog tests add `enablement explains confirmation and live schema writes without a host document id`. In `J/agent-plugins/s3-compatible/__tests__/bundled-package.test.mjs` add `media-key help uses a neutral example without changing the field`. `M-reinsert-internal-migration-id` restores the old refusal phrase. `M-remove-schema-risk-disclosure` removes the actual live DDL warning. `M-provider-help-changes-field` changes `mediaKeyPrefix`.

**Change.** At `J/cms/src/publish/content/execute-import.ts:54`, end the refusal with `is refused with no attestation override`. Put the reason beside the branch as a why-comment about recoverability. Keep the status/error code, refusal precedence, work ordering and exact no-override behavior. At `J/plugins/src/runtime/agent-tools.ts:154,218`, replace the ADR reference with plain `snapshot-protected, transactional schema changes` wording. Keep owner confirmation, live DB disclosure, discovery validity and the distinction between deactivation and reversal. Use the existing `copy` collaborator for actual host-specific names.

In `J/agent-plugins/s3-compatible/jini-deploy-targets.json:62`, replace the illustrative `tovu-media/` with `site-media/`. Update a matching translation key only if the exact old help text occurs in the locale map. No change to `mediaKeyPrefix`, defaulting, secrets, object-key generation or `ws/…`. Exact search `git grep -nE 'forward-migrate rule|snapshot-protected, transactional core-mediated|live schema DDL \\(ADR-023\\)|tovu-media/' -- packages examples`.

**Package.** No export-map or signature changes. `.changeset/r02-neutral-runtime-copy.md`, CMS/plugins/agent-plugins patch. No declaration drift.

### 24. R02.LIVE-COPY.T — Keep the host refusal and catalog witnesses aligned

**BUILDER: SOL · OPUS-REVIEW**

**After 23. Write first.** In `W/server/__tests__/integration/publish-content-import-real-composition.unrun.integration.test.ts:115–132`, name the test `the composed route refuses an unavailable restore point before any destination write`. `M-match-status-without-pinning-refusal` replaces the substantive check with status-only and must lose the reason/unchanged-state witness.

**Change.** Update the exact old phrase at `:123` to the new copy, keeping 409, `RESTORE_POINT_UNAVAILABLE`, and the destination-content assertion. `W/features/deployments/deploy-targets/__tests__/descriptor-fields.unit.test.ts:231` continues to pin `mediaKeyPrefix`. If golden tool-catalog fixtures contain the exact old string, update only the description bytes from 23, not the schema or registration. Exact search `git grep -nE 'forward-migrate rule|snapshot-protected, transactional core-mediated|live schema DDL \\(ADR-023\\)|tovu-media/' -- apps`. No production route repoint, no export, changeset or Tovu API-baseline change.

### 25. R03.IDENTITY.J — Make agent-plugin namespace fallback a host-supplied read policy

**BUILDER: SOL · OPUS-REVIEW**

**After 3 and 10. Write first.** Extend `J/agent-plugins/src/lifecycle/__tests__/unit/{legacy-vocabulary.pins,portable-metadata,plugin-identity,manifest-default-namespace}.unit.test.ts` with `the same installed document is legacy metadata only for its bound host`, `an own canonical key wins even when null or invalid`, and `an explicit custom namespace keeps its existing isolation`. Include inherited keys, absent aliases, a sibling host name and the exact warning count through the lifecycle. `M-use-legacy-when-canonical-is-invalid` and `M-projection-drops-identity-policy` isolate precedence and propagation.

**Change.** At `J/agent-plugins/src/core/identity-namespace.ts:1–71` use one optional descriptor, which exactly models the one current fallback:

```ts
export interface LegacyAgentPluginIdentity {
  readonly namespace: string;
  readonly warning: string;
}

export interface AgentPluginIdentityReadOptions {
  readonly identityNamespace?: string | undefined;
  readonly legacyIdentity?: LegacyAgentPluginIdentity | undefined;
}
```

The second object is `AgentPluginIdentityReadOptions = {}` on `resolveAgentPluginIdentityNamespace`, `readAgentPluginPortableExtension` and `readAgentPluginCompatibilityWarnings`. The lifecycle resolver and the portable-detection helper take `Pick<AgentPluginIdentityReadOptions, "legacyIdentity"> = {}`. First objects and returns remain as today. No new root registry, no discovery of alias names from manifest contents. An unbound default is canonical-only. Omitted namespace selects an own canonical key even if malformed, then an own configured alias if present. An explicit alias request still prefers an own canonical key, and the namespace warning retains its existing selected-alias semantics. An unrelated explicit raw reader remains isolated. The **lifecycle** selector separately preserves its current special rule at `:63–71` for a custom host with no own key and a valid alias object. Check object shape and own presence in the same order as today.

| Caller boundary | Current anchor and repoint |
|---|---|
| Raw manifest, validation and metadata | `J/agent-plugins/src/manifest.ts:81–82`, `lifecycle/manifest.ts:234–250`, `lifecycle/metadata.ts:45–50`. Receive the same existing options object with the extended type, preserving validation and warning ordering. |
| MCP parser | `lifecycle/manifest.ts:566–616`. Extend the existing optional parser fields from sheet 3 with `legacyIdentity`. Carry it into resolve, `readExtensionServers`, warning and portability checks. Keep `readServerMetadata` precedence and `legacyMcpAliases` independent. Inline data still cannot grant reviewed `read`. |
| Lifecycle | `lifecycle/ports.ts:78,86–87`, `index.ts:167–173`, `install.ts:168–171`, `installed-package-index.ts:27`, `persistent-state.ts:32`, `capability-projection.ts:21–24`. Forward the descriptor through the existing optional port and each resolver **and** any parser called with its selected namespace. Bind per lifecycle owner. |
| API consumers | `lifecycle/manifest.ts:59–62`, lifecycle barrel and `src/index.ts:11`, `src/__tests__/integration-contract.test.ts:5,30`, `lifecycle/__tests__/unit/plugin-identity.unit.test.ts:6,30,129,139`. Replace uses of the branded `legacyAgentPluginMetadataWarning` export with the injected fixture warning. Export the two types through the current owning manifest entries. |

Use `git grep -nE 'resolveAgentPlugin(Identity|Lifecycle)Namespace|readAgentPlugin(PortableExtension|CompatibilityWarnings|Metadata)|isPortableAgentPluginNamespace|legacyAgentPluginMetadataWarning|validatePluginManifest' -- packages/agent-plugins/src examples`. Default-host examples with canonical manifests need no new options. Keep canonical writers and copied/installed bytes unchanged. No clock-based end date.

**Package.** Keep `./manifest` and `./lifecycle` at `J/agent-plugins/package.json:175–179,200–204`. `.changeset/r03-agent-identity-read-policy.md`, agent-plugins major for the unbound default and warning export removal. Refresh `api-baseline/jini-ai__agent-plugins.json`. Release with 26–27.

### 26. R03.PREBOOT.J — Thread the same read policy outside the lifecycle

**BUILDER: SOL · OPUS-REVIEW**

**After 25. Write first.** Add `legacy-only manifest produces the same capability decisions before and after boot` across credential-card, host-signals and host-tool tests. Add `a canonical fork preserves presentation but drops publisher and supersession claims` to `J/agent-plugins/src/folder-customization.test.ts:82–92`, and `an untrusted successor cannot use the namespace binding` to `site/__tests__/supersession.unit.test.ts`. `M-preboot-skips-legacy-policy` bypasses one reader. `M-fork-uses-alias-as-write-key` writes the selected read namespace rather than the requested canonical output. `M-supersession-skips-trusted-verdict` allows an untrusted fixture to contribute.

**Change.** Extend existing optional objects with `Pick<AgentPluginIdentityReadOptions, "legacyIdentity">` and keep `= {}`. Do not add a required policy argument to canonical-only call sites. Where a caller already accepts `identityNamespace` keep it. The following ledger is for option propagation, not import-specifier churn.

| Owners in `J/agent-plugins/src/` | Binding and invariant |
|---|---|
| `lifecycle/credential-card-metadata.ts:115–124`, `connect/{credential-cards.ts:2–12,index.ts:3}` | Parse and warn with the same options. Add `createCredentialCardsContribution(required: Pick<AgentPluginIdentityReadOptions, "legacyIdentity">, _optional: Record<string, never> = {})` at the real declaration owner. Preserve the current definition shape and default canonical contribution as `createCredentialCardsContribution({})`. No new distant wrapper, destination trust still belongs to the loader. |
| `lifecycle/host-tools/{identity.ts:16–61,ports.ts:78–83,search-tool.ts:349,skill-tool.ts:297}` | Extend `readPluginMaturity`, `readProviderPluginLink`, and `readInstalledAgentPluginIdentity` options. Add `legacyIdentity?: LegacyAgentPluginIdentity \| undefined` to `AgentPluginHostToolPorts`. Carry it through both source readers and from installed identity into its maturity/provider helpers. Keep current fs/readText defaults, warnings and fail-closed handling. |
| `site/soon-lock.ts:34–35,52–72,81–95`, `site/provider-plugin-link.ts:104–119` | Forward through find/read/assert/lock and the provider-face port’s declared link reader. Preserve host Soon list and switch-off-only lock, and the activation queue. Do not broaden a provider ID’s grammar. |
| `site/host-signals.ts:36–39,56–70,103–119` | Thread through `parseHostSignalDeclaration`, `readBundledHostSignalDeclaration` and `resolveBundledHostSignals`. A custom `readDeclaration` remains higher priority. No new activation, trust, env read or fail-open branch. |
| `site/supersession.ts:63,69,90–105` | Thread through `parseSupersedes`, installed/bundled source fallback and `readSupersessions`. Preserve selection from trusted verdicts and the installed-before-bundled ordering. |
| `folder-zip-node.ts:149–187`, `site/customize-tool.ts:28–41` | Carry the options from `prepareCustomizedAgentPluginArchive` to `zipCustomizedAgentPluginFolder` and `customizeManifest`. Preserve canonical output and existing explicit-custom namespace behavior. Keep stripping identity and historical/supersession claims. Do not retrofit a persisted archive. |

Use `git grep -nE 'credentialCardsContribution|parsePluginCredentialCards|readInstalledAgentPluginIdentity|readProviderPluginLink|readPluginMaturity|findSoonAgentPlugin|assertAgentPluginReady|lockSoonAgentPlugins|bindProviderFacePorts|parseHostSignalDeclaration|readBundledHostSignalDeclaration|resolveBundledHostSignals|readSupersessions|parseSupersedes|zipCustomizedAgentPluginFolder|prepareCustomizedAgentPluginArchive' -- packages/agent-plugins/src examples` for direct call sites and fixtures. A branded N‑1 test becomes a literal fixture policy, not a default in production.

**Package.** Keep `./connect`, `./lifecycle/host-tools`, `./folder-zip/node` and the existing `./site/{soon-lock,provider-plugin-link,host-signals,supersession,customize-tool}` entries. `.changeset/r03-preboot-identity-policy.md`, agent-plugins minor on top of 25’s coordinated major. Refresh the same baseline with the additive options/factory.

### 27. R03.IDENTITY.T — Supply the legacy descriptor at every Tovu entry, including desktop preboot

**BUILDER: SOL · OPUS-REVIEW**

**After 25–26. Write first.** Add `an installed N-1 plugin keeps its identity, OAuth declaration, card and Soon status across preboot and boot` in `W/server/runtime/composition/__tests__/plugin-host.integration.test.ts`, and `the desktop preboot path honors the same legacy host-signal declaration` beside `apps/desktop/src/desktop-host-signals.ts`. Exercise a malformed canonical key beside a valid legacy one. `M-bind-lifecycle-but-not-preboot` removes only the host-signals binding. `M-bind-card-parse-but-not-destination-check` removes only the provider-link read binding at the credential-card owner.

**Change.** Define `TOVU_AGENT_PLUGIN_IDENTITY_READ` in a side-effect-free `W/features/agent-plugins/identity-read-policy.ts`, satisfying `Pick<AgentPluginIdentityReadOptions, "legacyIdentity">`. It is one required host constant, not a lookup on the environment or a re-export shell. Set namespace to `tovu` and copy the existing `2027-05-06` warning bytes from baseline `J/agent-plugins/src/core/identity-namespace.ts:36`. Keep `extensionNamespace: "jini"` and sheet 10’s separate alias descriptor.

| Consumer | Pass the host descriptor |
|---|---|
| `W/features/agent-plugins/lifecycle.ts:159,169,174,183,261–277` | Add it to lifecycle optional deps, direct maturity/ready/Soon reads, and `readSupersessions`. |
| `W/assistant/tool-search-keywords.ts:33`, `W/features/agent-plugins/{exports/source.ts:35,install-upload.ts:137,234,memory.ts:26}`, `W/features/member-login/providers.ts:43` | Pass it to the raw metadata/manifest/identity readers. Do not change member-login’s existing ID allow decision. |
| `W/server/runtime/composition/{agent-plugin-connections.ts:147,domain-dns-adapters.ts:173,host-signals.ts:8}` and `apps/desktop/src/desktop-host-signals.ts:27–29` | Bind to client namespace, direct declaration reads, and both preboot signal readers. The desktop import is of the pure descriptor only, no website composition or server module. |
| `W/features/agent-plugins/{connect-tool.ts:84,host-tool-ports.ts:55+,install-tool.ts:88,set-enabled.ts:75–79}`, `W/server/runtime/composition/{plugin-credential-cards.ts:44–46,64,plugin-host.ts:88,site-guide.ts:54,72}` | Supply policy to credential parsing, fork, mature/linked identity and host tools. Build the credential contribution with the Jini factory and keep Tovu’s existing destination ownership `load` override. Wrap only the fallback `readIdentity` binding where a custom one can be injected. |
| `W/server/runtime/{boot/bootstrap.ts:49,62,composition/agent-plugin-service-ports.ts:72,79,composition/app.ts:226,composition/site-deps/store-basics.ts:43,composition/site-portability.ts:18}` | Forward on provider-face/Soon calls without changing activation policy. The restore adapters under `features/site-backup/{import-plugin-state,import-restore}.ts` already carry a bound callback. Bind it in `site-portability.ts`, not once per restore. |

For legacy fixture calls in `features/agent-plugins/__tests__`, `assistant/__tests__`, runtime/route integration tests and desktop staging tests, reuse the descriptor for an intentional legacy positive. Leave canonical-only tests and the unbound Jini negative as such. Cross-check the two grep ledgers in 25–26 against `-- apps packages` plus `git grep -nE 'extensions\\.tovu|parseAgentPluginManifest|readAgentPluginMetadata' -- apps`. Do not touch the site-plugin `identityNamespace` in `W/features/plugin-runtime/host-binding.ts:77`. It is a different contract.

**Package.** No Tovu export, changeset or API baseline. Neither namespace bytes nor published N‑1 package contents change.

### 28. R03.FILENAMES.J — Inject legacy site-plugin filenames, keep one canonical writer

**BUILDER: SOL · OPUS-REVIEW**

**Write first.** Extend `J/plugins/src/host/__tests__/unit/{plugin-format.pins,plugin-format,source-drafts,install}.unit.test.ts` with `canonical wins without falling back after bad canonical bytes`, `a configured legacy filename remains readable through install, discovery, retained export and draft`, and `an alias never exempts an unrelated file from integrity`. Add a snapshot/browser asset witness using `host/__tests__/integration/browser-provider-approval-matrix.integration.test.ts`. `M-drop-bound-manifest-alias`, `M-snapshot-exempts-arbitrary-file`, and `M-write-legacy-manifest` hit distinct boundaries.

**Change.** `J/plugins/src/host/plugin-format.ts:1–21` keeps `PLUGIN_MANIFEST_FILENAME` and `PLUGIN_SDK_SPECIFIER`. Replace the legacy constants and static read lists with:

```ts
export interface PluginManifestReadOptions {
  readonly legacyManifestFilenames?: readonly string[] | undefined;
}

export function pluginManifestFilenames(
  _required: Record<string, never>,
  optional: PluginManifestReadOptions = {},
): readonly string[];

export function canonicalizePluginManifest<T>(
  required: { files: ReadonlyMap<string, T> },
  optional: PluginManifestReadOptions = {},
): Map<string, T>;
```

The helper yields canonical first, then valid, de-duplicated host basenames in supplied order. Accept only manifest-style bare `*.plugin.json` names with no separators, NUL, or dot traversal. No config from the artifact itself. Canonicalize only by selecting an own Map entry and writing the selected exact bytes under the canonical name. Under `noUncheckedIndexedAccess`, select via typed entries or distinguish the `has` branch without inventing a non-undefined `T`. Preserve current canonical-malformed refusal. The `registerPluginSdkResolver` API at `runtime/sdk-resolver.ts:92–105` already receives exact specifiers and stays unchanged.

| Path in `J/plugins/src/host/` | Current anchor and propagation |
|---|---|
| `ports.ts:35–43`, `index.ts:3` | Add the option to the existing manifest host ports, and expose helper/type through `./host`. Remove `LEGACY_PLUGIN_MANIFEST_FILENAME`, `PLUGIN_MANIFEST_FILENAMES`, `LEGACY_PLUGIN_SDK_SPECIFIER`, `PLUGIN_SDK_SPECIFIERS` after the paired host cutover. |
| `node/{install.ts:169–195,249–266,397–419,438–456,discovery.ts:215–226,248–277,310+,package-files.ts:294–325}` | Use the same candidate order in validation, integrity exclusion, installed identity scan, source integrity, staging, discovery and `listSitePluginPackage`. Add the read options to the existing second object of `computePluginIntegrity` and `listSitePluginPackage`. Other public call shapes unchanged. |
| `node/source-drafts.ts:135–160,203–212,232–262,303–305,345–350,446+` | Store a single normalized list in the existing draft context and use it on open, read, write, seal, snapshot and hashing. Writing any recognized alias targets canonical. Clear configured stale alias files only after the canonical atomic write succeeds, by exact validated basename. Keep locking and containment. |
| `node/integrity-command.ts:9–22` | Extend its `output` option with the read policy. Select source then write canonical, retaining existing temp/rename/cleanup and original-file behavior. |
| `node/{module-snapshot.ts:234–259,280–295,browser-provider-assets.ts:38–49,loader.ts:156,runtime-activation.ts:174+,runtime-contracts.ts:196,runtime-conflicts.ts:14–25,runtime-reload.ts:32–37,106–111}` | Carry the policy through runtime binding and the existing optional importer/loader args into snapshot verification and browser admission. Preserve reviewed manifest digest equality, containment and distinct snapshot identity. Skip exactly the configured manifest names, never a path or extension wildcard. Install and discovery already share `runtimeBinding`; verify those paths instead of duplicating configuration. |

The importer ledger is `git grep -nE 'LEGACY_PLUGIN_(MANIFEST_FILENAME|SDK_SPECIFIER)|PLUGIN_(MANIFEST_FILENAMES|SDK_SPECIFIERS)|canonicalizePluginManifest|computePluginIntegrity|listSitePluginPackage|snapshotPluginModuleGraph|verifyPluginSnapshotIntegrity|admitBrowserProviderAssets|createPluginModuleImporter' -- packages/plugins packages/server packages/cli examples`. Use neutral fixture aliases in Jini and exact legacy Tovu bytes in 29. After the branded production constants are gone, retire only `scripts/source-neutrality-allowlist.json`’s `plugin-format.ts` row. No persisted manifest rewrite or expiry.

**Package.** Keep `./host`, `./host/node`, `./host/worker`, `./runtime/sdk-resolver` at `J/plugins/package.json:62–77,167+`. `.changeset/r03-plugin-format-read-options.md`, plugins major. Refresh `api-baseline/jini-ai__plugins.json`.

### 29. R03.FILENAMES.T — Preserve site-plugin install, backup and SDK compatibility

**BUILDER: SOL · OPUS-REVIEW**

**After 28. Write first.** Add `CLI install, worker load and backup agree on the old manifest and exact SDK specifier` to the relevant CLI, worker and site-plugin backup suites. Reuse `W/cli/__tests__/integration/serve-command-plugin-sdk-resolver.integration.test.ts:203`, `W/server/runtime/plugin-tier2/__tests__/worker.unit.test.ts:116`, and `W/features/site-backup/__tests__/share-site-plugin-versions.integration.test.ts`. `M-backup-omits-bound-manifest-alias` and `M-worker-omits-exact-legacy-sdk-specifier` remove one binding each.

**Change.** Put `TOVU_SITE_PLUGIN_MANIFEST_READ` with `legacyManifestFilenames: ["tovu.plugin.json"]` and `TOVU_SITE_PLUGIN_SDK_SPECIFIERS = [PLUGIN_SDK_SPECIFIER, "@tovu/sdk"] as const` in one pure host vocabulary module under `W/features/plugin-runtime/`. Give the legacy SDK specifier a host constant for `require.resolve`. Use `pluginManifestFilenames({}, TOVU_SITE_PLUGIN_MANIFEST_READ)` where a list is needed. No duplication of file reading or module resolution.

- `W/features/plugin-runtime/host-binding.ts:10,54–58,72–84` injects the policy and uses the same list for tier-1 manifest exclusion. `W/server/runtime/composition/plugin-runtime.ts:80–87`, `W/cli/commands/plugin/install.ts:30,63–68` and `W/server/runtime/composition/product-telemetry.ts:142–147` already spread the host binding into the runtime/discovery path. Ensure any direct importer or loader gets the same options, including the direct telemetry `createPluginModuleImporter` if it exercises snapshots.
- `W/cli/program.ts:77` explicitly passes the policy to `runPluginIntegrityCommand`. `W/features/site-backup/archive-extensions.ts:5,17` derives its list from that policy. Bind the existing `listSitePluginPackage` callback at `W/features/site-backup/sources.ts:19,48` by passing the options. Do not widen the backup file set beyond manifest and integrity-listed bytes.
- Repoint imports at `W/features/plugin-runtime/sdk-resolver.ts:2,22,38–39`, `W/server/runtime/plugin-tier2/worker.ts:18,41`, and `__tests__/worker.unit.test.ts:12,116` to the host constant. The three boot calls at `W/index.ts:171` and `W/cli/commands/{serve.ts:204,export.ts:136}` already use the host resolver. Keep entry timing, exact specifier matching, and the once-per-process guard. `A/components/AssistantDock/hooks/composer-files.hooks.ts:26` is a host archive-ingest alias, not the site-plugin runtime’s resolver.
- Check `git grep -nE 'LEGACY_PLUGIN_(MANIFEST_FILENAME|SDK_SPECIFIER)|PLUGIN_(MANIFEST_FILENAMES|SDK_SPECIFIERS)|listSitePluginPackage|computePluginIntegrity|runPluginIntegrityCommand' -- apps packages development/scripts`. Update the flagged fixture calls, not legacy fixture file bytes or the packaged `@tovu/sdk` name.

**Package.** No Tovu export, changeset, baseline, or installed-manifest migration.

### 30. G06.PHYSICAL.J — Retire the executor’s whole-file size row

**BUILDER: SOL · OPUS-REVIEW**

**After 5–6. Write first.** Extend `J/daemon/src/agent-executor/__tests__/{launch-characterization,launch-defaults-and-staging,r8a-pins}.test.ts` with `admission refusal stages nothing`, `failure after staging disposes the run-owned files exactly once`, and `a synchronous spawn wires exit before the first await`. `M-duplicate-invocation-build`, `M-skip-staged-disposer`, and `M-yield-before-wiring-exit` must fail independently. Keep the original cleanup-rejection and child-message behavior pins.

**Change.** Use sheet 6’s typed runner as the orchestration boundary. Re-anchor after sheet 6, then apply the following map by symbol rather than old absolute range. No new package-level APIs. Existing public signatures stay exact. New internal functions use one narrow required object and `_optional: Record<string, never> = {}`. No phase imports `launch.ts` back.

| Old `launch.ts` anchor | Destination or retained owner |
|---|---|
| `:78–179,231–291`, definition/format/environment resolution | `launch-admission.ts` owns `isSupportedStreamFormat`, `assessAgentExecutorCompatibility`, `isAgentExecutorSupported`, `resolveDefAndStreamFormat`, `resolveImageDeliveryAndArgvBudget`, `resolveRunEnv`, `selectAgentExecutorHostEnv`, `resolveLaunch` and their private helpers. Move `ConfirmedAgentLaunchResolution` with its true owner as a module-local exported type used by adjacent phases. |
| `:421–425,430–624`, options and pure overlay planning | `launch-arguments.ts` owns `computeSystemPromptOverlay`, `buildAgentBuildArgsOptions`, `resolveSystemPromptOverlayDelivery` and the pure option/overlay helpers. `buildRunArgs`’s failure mapping remains at its current catch owner until the neutral core split has all its existing error witnesses. Do not move catch-debt to the new file. |
| `:740–768,793–808`, platform budget, command planning and stdin format check | `launch-invocation.ts` owns `guardWindowsCommandLineBudget`, `prepareRunCommand`, `isStdinDrivenFormat` plus sheet 6’s neutral invocation phase. The catch at `:793–803` does not read the error and stays that way. |
| `:1155–1330,1579–1619`, handoff and prompt transport | `launch-handoff.ts` owns the thin handoff and transport helpers from 6 with explicit collaborators. The old bridge-probe kind selector and error-formatting catch sites that still carry debt can stay in `launch.ts` as narrow callbacks. Map cleanup and exit listener install still happen synchronously before the first awaited spawn confirmation. No dispatch order changes. |
| `:1382–1500,1502–1577`, resource owner and staging | `launch-resources.ts` owns the neutral typed resource state, cleanup sequencing and runtime-lock controller. Keep the current credential-bearing compatibility dispatch, specific option spellings and error/log boundaries in `launch.ts`, supplying inventory/cleanup collaborators to the new primitives. Keep the default stage-call order, not a parallel resource allocation. |
| `:190–210,295–315,320–419,649–734,771–791,810–819,925–1000` | `launch.ts` retains `createAgentExecutor`, per-executor maps, failure policy, the remaining compatibility ABI reads and narrow preparation/catch owners. Leave `computeRuntimeContext`’s existing wire discriminant and the live `CreateAgentExecutorOptions` property names compatible. Eliminate any leftover executor-wide parameter bag introduced only for the split. |

Preserve actual reasons with moved code. In particular, keep canonical flag capability defaults, command quoting/budgets, credential-free argv, prompt/diagnostic file ordering, and lock release on process exit rather than pipe drain. If a moved comment names a vendor solely as an example, express the same reason using the capability and leave the concrete wire fact with its compatibility owner. Never move an R15 hit, raw catch read or console occurrence into a debt-free file just to make `launch.ts` shorter. Existing catch/log operations that must remain at the old path can receive only their specific inputs. When a phase approaches 80 lines or complexity 10, extract a leaf with a real seam, not a second options bag.

**Importer repoints.** `J/daemon/src/agent-executor/index.ts:122–143` becomes direct exports from the actual owners above, not a new `launch.ts` forwarding shell. Preserve the public re-export through `J/daemon/src/agent-executor.ts:81` and root `src/index.ts:107`. Repoint `__tests__/host-env-ports.test.ts:8` and `__tests__/launch-characterization.test.ts:3` to split owners for env/build/overlay and keep their retained helpers on `launch`. `__tests__/{access-approval-transport.test.ts:15,launch-defaults-and-staging.test.ts:17}` keep their retained helper owners unless sheet 6 changed the test import. Check `git grep -nF 'launch.js' -- packages/daemon/src examples`. No public package subpath.

**Package.** `.changeset/g06-launch-physical-owners.md`, daemon patch. `J/daemon/package.json` root export unchanged and API baseline must show no signature drift. Opus checks the actual gate (`scripts/check-size.mjs:15,57` counts nonblank/noncomment lines), each replacement file, and the whole-file row in `scripts/size-debt.json:213`. Remove that row only if `launch.ts` is at or below 500 and no replacement crosses the cap. Retire the function row at `:220` only once across both passes. R15, error-gate, log-safety and why-comment checks must pass without transferring debt to a new path.

### 31. P10-H2.NEW-CHANGE-SET.J — Require provenance at the new-write boundary

**BUILDER: SOL · OPUS-REVIEW**

**After 7 and 12. Write first.** Extend `J/cms/src/core/commands/__tests__/command.test.ts`, `J/db/src/events/__tests__/change-set.sql.repo.dialects.test.ts` and the outbox repo contract with `one command persists one actor on both atomic records`, `a historical row still reads with no invented kind`, and `an envelope preparation hook cannot erase or replace a stamped actor`. Add a compile witness that a read record is not a valid new insert. `M-stamp-header-only`, `M-serialize-prepared-actor`, and `M-infer-legacy-kind` fail different assertions.

**Change.** `J/core/src/contracts/events/{change-set.ts:36–41,89–97,ports.ts:23–57,127–129}` gets write-only types:

```ts
export type AttributedDomainEvent<T = Record<string, unknown>> =
  Omit<DomainEvent<T>, "actor" | "actorId"> & {
    actor: MutationActor;
    actorId: MutationActor["id"];
  };

export type NewChangeSetRecord =
  Omit<ChangeSetRecord, "actor" | "actorId"> & {
    actor: MutationActor;
    actorId: MutationActor["id"];
  };
```

Change `ChangeSetRepoPort.insert`’s first object to `record: NewChangeSetRecord` and its existing optional second object to `event?: AttributedDomainEvent | undefined`. Both are type-exported through `J/core/src/contracts/events.ts:2–4`. Leave `ChangeSetRecord`, `DomainEvent`, `OutboxRecord`, event delivery, historical replay, and `OutboxPort.enqueue`’s broader contract readable. No default actor and no widening the kinds.

- `J/cms/src/core/commands/command.ts:119–128,206–275` returns the strict event/header types from its already attributed command builder. `repo.memory.ts:25–31` takes the same write args and preserves its existing order. `revert.ts:139–153,208–217` can explicitly annotate its newly created event as attributed, without tightening the historical record it reads or returns.
- `J/db/src/events/change-set-repo.sql.ts:97–110` consumes the strict types and checks header/event actor equality when both are supplied, before effects. Keep insert of header, items and event in the same kernel transaction. Keep the existing `actorKindColumn` capability so a host cannot select a column not in its schema. Tovu already enables it at `W/platform/db/sqlite/change-set-repo.sqlite.ts:52–53`.
- At `J/db/src/events/outbox-repo.sql.ts:72–105,137–139`, preserve original actor and `actorId` alongside original id, workspace and occurrence time when preparing an envelope. Capture original actor data before the hook and give it a separate envelope/actor object so it cannot mutate that identity in place. Keep existing permitted payload/metadata preparation and fallback. If the original has no actor, do not let a preparation callback synthesize one. Omit absent optional keys. For direct transactional writers verify the same serializer is used where it already owns the shape. Do not reroute `J/cms/src/forms/sql/form-delivery-repo.ts:154` or Tovu purge/trash inserts through an independent enqueue.

`git grep -nE 'implements ChangeSetRepoPort|\\.insert\\(\\{[^}]*items|preparedOutboxEvent|outboxEventValues' -- packages examples` identifies implementers and fixtures. Update CMS change-set tool fixtures at `change-sets/__tests__/tool-registrations.test.ts:56,142`, forms memory fixture, and SQL dialect fixtures. Tests for history must seed old rows at the read-fixture boundary, not cast past the insertion contract.

**Package.** No new export subpath. Keep core `./contracts/events`, CMS commands and DB `./events` at `J/db/package.json:141`. `.changeset/p10-h2-new-change-set-provenance.md`, core/DB major, CMS major for its affected adapter contracts. Refresh core, CMS and DB API baselines. No new migration.

### 32. P10-H2.NEW-CHANGE-SET.T — Finish the Tovu cutover to strict inserts

**BUILDER: SOL · OPUS-REVIEW**

**After 31. Write first.** Extend `W/server/runtime/composition/__tests__/mutation-actor.test.ts:68+` with `the real SQL binding preserves the same actor after outbox preparation`, and the SQL repo contract with `a legacy row replays with an actor ID and unknown kind`. `M-echo-prepared-actor` returns the hook’s actor instead of the writer’s. `M-enqueue-outside-change-set-transaction` must fail the rollback witness.

**Change.** Keep `W/platform/db/sqlite/change-set-repo.sqlite.ts:43–53` on the already migrated capability and preserve the persisted shape. For new-write fixtures use explicit actors with matching IDs. Seed actor-less rows directly only in tests that exercise historical reads. Close `git grep -nE '\\.insert\\(\\{[^}]*items|implements ChangeSetRepoPort|preparedOutboxEvent|outboxEventValues' -- apps/website/src`. The direct fixture owners are:

- `W/contracts/core/commands/__tests__/{repo.contract,repo.memory.unit}.test.ts`
- `W/platform/db/{repos/__tests__/change-set-repo.test.ts,sqlite/__tests__/{change-set-repo.sqlite,repo-transactions.sqlite}.test.ts}`
- `W/features/change-sets/__tests__/tool-registrations.test.ts:227`
- `W/server/__tests__/routes/{change-sets-get-list,change-sets-revert}.test.ts`
- `W/server/runtime/composition/__tests__/mutation-actor.test.ts:68`

Keep `W/platform/db/sqlite/outbox-repo.sqlite.ts`, `W/platform/db/repos/form-delivery-binding.ts`, and the raw inserts at `W/features/{identity/user-purge.ts:87,trash/adapters/user.ts:82}` in the producer ledger below. Changing the change-set declaration does not bring them under it. Do not label this a universal outbox cutover.

**Package.** No Tovu exports, changeset, API baseline, migration or generated types change.

### 33. P10-H2.PUBLISH.J — Require the run’s actor through apply, retirement and repointing

**BUILDER: SOL · OPUS-REVIEW**

**After 31. Write first.** In `J/cms/src/publish/content/__tests__/{apply-row,apply-retire,apply-report,raw-row-contributor}.test.ts`, add `apply, overwrite retirement and repoint use the same vouched actor` and `an out-of-run handler refuses missing or conflicting provenance before mutating`. Cover the raw-file path too. `M-publish-reintroduces-user-fallback`, `M-drop-actor-on-retire`, and `M-select-peer-principal-as-actor` each fail a positive witness. Keep the plan, idempotency and rollback pins.

**Change.** `J/cms/src/publish/content/type-registry.ts:223–231,249–253,271–276` requires `actor: MutationActor` on the first objects for `apply`, `retire`, and `repointReferences`, with the current second object kept. `principalId` still authorizes the operation. Thread the validated actor already supplied to the apply-run opener at `apply-report.ts:219,551–554` through the run type, `apply-report.ts:248–258,301–304`, `apply-row.ts:74–95,148–160,208–220`, and `apply-retire.ts:29,109–117`. No actor field in packed entity state, plan/hash input or remote schemas.

- `repo-handler.ts:30–38,154,308–320,357–402` gains `readonly actor: MutationActor` in `RepoWriteContext`. Use the per-call actor for `executeCommand` instead of `env.deps.mutationActor ?? { …kind: "user" }`. Validate missing and mismatched actor before any repo write, including non-undo writes. Use the existing `checkedMutationActor` with an explicit undefined refusal, not `as MutationActor`. If the composed apply catalog also supplies a bound actor, reject a contradictory value. Keep `PublishContentDeps.mutationActor` for read-only catalog builds and contributors adopting 34. It is not an implicit actor for standalone calls.
- `raw-row-contributor.ts:188`, `raw-file-contributor.ts:239` consume the same validated input actor. Keep permission `publish.backstop`, CAS/write ordering and mutation compensation. The source principal continues to own conflict/idempotency data where it did before.
- At `J/cms/src/posts/post-import.ts:51,142–193`, accept an optional `actor?: MutationActor | undefined` alongside legacy `actorId` at the shared import/restore input boundary, and forward it into the existing content and public-transition outbox builders. Refuse a supplied mismatch. Direct legacy callers outside this publish lane do not receive a made-up actor. At `J/cms/src/navigation/site/import-menu.ts:227–259`, add the same optional trusted actor to the input and preserve that actor on the existing buffered publish events, never inside their data payload. Keep buffering and rollback intact.

Close `git grep -nE 'createRepoPublishHandler|importPostEntity|importMenuEntity|\\.apply\\(|\\.retire\\(|\\.repointReferences\\(|mutationActor.*\\?\\?' -- packages/cms/src/publish packages/cms/src/{posts,navigation,widgets,redirects,settings} examples`. Adapt all direct command/factory test fixtures, not just the report path. No repoints to a new public subpath. Keep `./publish/content/*` where already exposed, the existing posts/navigation exports and `./contracts/events`. `.changeset/p10-h2-publish-writer-context.md`, CMS major. Refresh CMS baseline.

### 34. P10-H2.PUBLISH.T — Attribute the remaining concrete publish writes

**BUILDER: SOL · OPUS-REVIEW**

**After 33. Write first.** Add `an assistant import stamps agent on the imported post event, overwrite retire and menu repoint` in `W/server/runtime/composition/__tests__/mutation-actor.posts.test.ts` or its publish fixture. Pin both channels for the same principal, no extra events on compensation, and the current precheck/authorization failures. Extend `W/features/theme/__tests__/publish-content.apply.test.ts` and `W/features/widgets/__tests__/unit/publish-content.test.ts` with `the publish gateway’s actor reaches the domain writer`. `M-publish-tool-as-user`, `M-widget-import-drops-kind`, and `M-publish-uses-source-author` fail separate comparisons.

**Change.**

| Current Tovu owner | Actual write change |
|---|---|
| `W/features/post/publish-content.ts:332–370,422–430,507–535,558–608` | Accept the required context actor on import, retire and their compensation paths. Forward to `importPostEntity`/restore inputs and existing content effects where they emit. Replace `:521`’s invented user. Keep the same checked `principalId`, author mapping, term operations, permission, trash behavior and rollback. |
| `W/features/navigation/publish-content.ts:117–123,213–344` | Pass the context actor into `importMenuEntity` and all the way through `repointOneMenu` to `executeCommand:302–309`. Preserve excluded IDs and the after-row repoint pass. |
| `W/features/theme/publish-content.ts:709–779,812+` | Pass validated `input.actor` to the existing theme-file command rather than `kind: "user"`. `active-theme-publish-content.ts:78–108` already crosses the repo handler, so its **change set** gets the actor from 33. This does not close direct activation’s separate storage question. No theme asset change. |
| `W/features/widgets/publish-content.ts:210–220,250–267` | Thread `ctx.actor` into the existing `WidgetWriteActor` kind slot while retaining `principalId` and plugin metadata. Do it for both widget instance and area writers where supported by the domain port. Do not use `actor.pluginId` as provenance. |
| `W/features/taxonomy/publish-content.ts:66–69,114–118` | Consume `ctx.actor` at both existing `importTaxonomy`/`importTerm` calls instead of depending on the optional catalog bag. Preserve source IDs and version expectations. |
| `W/features/media/publish-content.ts:196–221`, `W/server/runtime/composition/publish-content-manifest.ts:12–15` | Preserve `blobCreatedByPrincipal`, content sniffing, and the existing raw adapters. Media, redirects, and settings get the actor on the strict factory/gateway write. If a contributor emits its own domain event, forward the validated actor to that event’s existing writer. Do not add a new media or settings event just to satisfy this sheet. |

Check `git grep -nE 'createRepoPublishHandler|\\.apply\\(|\\.retire\\(|\\.repointReferences\\(|mutationActor|actor:.*kind: .user' -- apps/website/src/features apps/website/src/server/runtime/composition`. Update standalone fixture calls in `features/publish-content/__tests__/{repo-handler,raw-file-contributor,raw-row-contributor,round-trip-harness}*`, plus domain round-trip/overwrite fixtures, to supply a known test actor. A direct host caller without a trusted actor must refuse. Do not change the already-shipped apply-entry, restore, or assistant post contributor bindings.

**Package.** No Tovu exports, changeset, API baseline or storage migration. No imported source bundle shape change.

## Owner decisions left open

The broad H2 contract cannot be closed by upgrading only `CommandActor` or by tightening `OutboxPort.enqueue` and fixing the compiler errors with casts. The remaining product decision is visible at the producer boundaries:

| Boundary | Current evidence and question for the owner |
|---|---|
| Anonymous and derived outbox writes | Jini `J/cms/src/{comments/ingress.ts:218,forms/submit-service.ts:258,forms/html/import-remote-submissions.ts:151,forms/notify-subscriber.ts:107,redirects/resolver.ts:145,entries/go-live.ts:88,108}` includes anonymous causes, reactions to older events, and scheduled work. Tovu `W/features/{forms/form-file-maintenance.ts:85,media/media-search-source.ts:162,pages/html-document-store.ts:482–488,identity/user-purge.ts:87,trash/adapters/user.ts:82}` and `W/platform/db/repos/form-delivery-binding.ts` include derivations and direct inserts. Decide whether anonymous ingress attributes to a named receiving service or requires an explicit anonymous provenance form, and whether derived events keep origin provenance separately from the worker that produced the new event. |
| Other optional writer shapes | `J/cms/src/entries/{types.ts:49,write-service.ts:285,423,527,641}`, `content-types/lifecycle.ts:115,218`, taxonomy’s narrow event ports, navigation, workspace, forms and newsletter producers still need an explicit producer policy before enforcing a universal write type. The ledger searches are `git grep -nE '\\.enqueue\\(|outboxEventValues\\(|insertInto\\(.{0,24}outbox_events|ActorIdentityInput|toKernelOutbox'` in the two source trees. Separate HTTP/stream queues from durable outbox writes and retain JSON replay without fabricated fields. |
| Direct theme activation | `J/cms/src/presentation/presentation.ts:22–38,94–120` saves settings only. `W/server/runtime/composition/modules/presentation.ts:94`, `W/features/theme/{set-active-theme-tool.ts:125–166,verify-active-theme.ts:47–57}` and `W/features/presentation/set-active-theme.ts:11–20` show the admin, assistant and compensation paths. Choose an atomic durable change/event or a separately specified settings audit field, including the compensation rule. |
| Taxonomy merge | `J/cms/src/taxonomy/gated-hooks.ts:24–39,79–96` and `write-contracts.ts:67+`; `W/features/taxonomy/{gated-hooks.ts:17–27,52–60,tool-registrations.ts:123–149}` and `W/server/runtime/composition/modules/taxonomy.ts:130–176`. When storage is chosen, bind admin `user` and tool `agent` at these existing seams, not the confirmer. Do not encode provenance in `previousState` or treat the existing `deprecate` operation as a new event name. |
| Ledger schema | `W/platform/db/schema.sqlite.ts:276–291,1388–1398` and `schema.postgres.ts:752–766,1157–1166` own post/taxonomy revisions. The current change-set kind migration is already `0047`. Choose new-row storage and historical null semantics for Trash, both revision tables, and any restore-ledger column. Leave existing restore detail JSON, retention, and redaction untouched until then. |
