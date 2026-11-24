PARTIAL __TOVU__ __JINI__: ~45 lane files left (STAYS-HOST pending prerequisites or STOPPED with recommendation, listed below); all 10 Codex FIX items and coordinator decisions 1-7 applied

# w5-admin — admin feature + admin shell leftovers (wave 5)

Unattended Opus coordinator run, 2026-11-24 05:50–08:20 UTC. All builder work was done by `model: sonnet` high-effort subagents (≤4 at a time; one brief overshoot to 5 was stopped before it edited anything). No Opus subagents (no security-seam work arose). Programmer persona read first: `AI-Dev-Shop/agents/programmer/skills.md` (v1.7.5) — confirmed; its rules (object args, test-first + named mutation, why-comments move with code, no metric gaming) were put into the shared builder brief.

## Branches and setup
- **Jini** `codex/w5-admin-jini` = `origin/codex/w4-admin-feat-jini` + merge `origin/codex/w4-admin-shell-jini` (`bc3acc30`; `packages/admin/package.json` union-merged).
- **Tovu** `codex/w5-admin-tovu` = `origin/codex/w4-admin-feat-tovu` + merge `origin/codex/w4-admin-shell-tovu` (`eafc04dd5`; `development/why-comments-debt.json` union-merged).
- Setup: Node 22.23.5, pnpm 10.33.2. Jini `pnpm install --frozen-lockfile` + `pnpm --no-bail -r build` 0/0 (0 `error TS`); Tovu `npm ci --ignore-scripts` (root, admin, desktop) 0; `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` 0 (per `combine-13-tovu.md` Setup); contracts tsc + sdk build 0.
- One Jini lockfile change: `pnpm install --no-frozen-lockfile` once for the new `@jini-ai/cms` react surface devDependencies (in `ee6ba90a`).
- No force-push, no `--no-verify`, hooksPath untouched, no RemoteTrigger, no codebase-memory tools, no tags/publish; `main`/`integ/*`/`plan/*`/`release/*`/other `codex/*` only fetched.

## FIX items applied (Codex rv1123q admin-feat, rv1123r admin-shell)
| # | Item | Result |
|---|---|---|
| q1 | plugins-api.types duplicates Core `AdminPluginDto` | DONE: client returns `AdminPluginDto` (legacy `conflicts` tolerance at the client boundary, test-first); plugin-file envelope/limits in Core `cms-plugins`; trash DTOs → new Core `contracts/site/cms-trash` consumed by Jini cms routes + Tovu website trash routes + admin; admin `screens/trash` deleted (no shell); README stale ref fixed. Jini `532838b5`, Tovu `5241befd5` |
| q2 | SiteKeyTab clipboard/timer | DONE: required `clipboard` + `scheduler` ports, bound in Tovu; 1500 ms reset + denied path tested (mutations 1500→1499, drop reset). Jini `532838b5` |
| q3 | use-export-password (DISAGREE) | MOVED → `@jini-ai/admin/sites/transfer/use-export-password.hooks` (clipboard, error formatter, labels injected; permission stays host). Jini `6eb7ec36`, Tovu `e8e3ba70f` |
| q4 | space-hold-rules (DISAGREE) | SPLIT → `@jini-ai/chat/react/features/voice-input/space-hold-rules` (required `holdKey`); key + duration stay host (`space-hold-config.ts`). Jini `bfc7c2f5`, Tovu `1eaaa039d` |
| q5 | voice-input-port mirrors desktop types (DISAGREE) | Neutral contract → `@jini-ai/core/contracts/speech-transcription`, used by desktop-host, Tovu admin and desktop preload; `window.tovuVoice` lookup stays host. Jini `049e08b1` |
| r6 | admin-shell hooks import `useFetchQuery`/`useInvalidate`/`useCachedLoader` | DONE: REQUIRED fields. Jini `5429b115` |
| r7 | DockSettingsMenu non-jini classes | DONE: `jini-row-menu-*` + scoped host CSS + DOM assertions |
| r8 | `live-tiptap-editor` positional | DONE: `isLiveEditor({ editor }, _optional = {})`; mutation (drop schema check) failed 2 Tovu tests |
| r9 | Tovu supplies r6 hooks | DONE (adapters + `MediaPickerDialog`). Tovu `c09e274df` |
| r10 | dev-proxy-upstream-close (DISAGREE) + forwarding exports | SPLIT → `@jini-ai/devops/local-dev/dev-proxy-upstream` (structural ports; Vite registration, refusal header, restart copy stay host); forwarding exports removed from `chat-attachment-liveness`, `assistant-chats`, `retry-unreachable`. Jini `d01b28c3`, Tovu `cb6af51f6` `59dcbca95` |

## Coordinator decisions 1–7
1. **K4 type owners** — `security-api.types`, `source-control-api.types` → `@jini-ai/admin` security / source-control modules (client-only; server does not share them); `deployment-api.types` split (product literal `tovu-peer` destination type stays host); `access-token-rows` moved with injected labels; `integrations-api.types` split: server-shared webhook types → new Core `contracts/site/cms-integrations` (website now imports them), external-MCP shapes → Core `cms-external-mcp`, agent-plugin list row → admin `agent-plugins/models`. Request-injected clients `createSecurityApi`/`createSourceControlApi`/`createDeploymentApi`/`createIntegrationsApi` with Tovu `*-host-ports.ts` bindings.
2. **Domain-react placement** — remote image import → new `@jini-ai/cms/react/media` browser surface (kit, hook, error formatter, header tip and media port injected; no ui/ui-kit runtime dep, guard L5/SI clean); members: Jini `user-management/react/members` already owned the screen, so the Tovu wrapper was deleted and `panels.tsx` renders the Jini `Members` with host props; media provider catalog adapter → `@jini-ai/integrations` (not `ui`: ui must evaluate without the integrations peer, pinned by `missing-peer.test.ts`). No domain dep added to `@jini-ai/admin`.
3. **i18n dictionary factory** — all 9 dictionaries (settings-capabilities, providers, integrations, comments, menus, taxonomy, collections, security, plugins) → `create<X>Dictionary({ commonDictionary, productName?, referenceProductName? }, _optional = {})` in Jini + `core/bind-dictionary-names`; product names are `{productName}` placeholders; host binds once in `lib/i18n-common.ts`. Every dictionary split into <500-line locale-data files (decision 13); merged dictionaries proven byte-identical by JSON dump `cmp`.
4. **Object args** — `useSecurityPermissions({ port, permission, useFetchQuery })`, `useChatDisplayPreferences({ port, namespace, defaults, … })`, `useAssistantChats({ port, client, lastConversation })`, `useThemePages({ port, noThemeId, … })`, `isLiveEditor({ editor })`, trash rules `translate`, … (test-first, named mutations).
5. **File-tree dedupe** — `PackageFilesModal` uses Jini `useAgentPluginFileTree` (now takes the host locale); Tovu `use-package-file-tree.hooks.ts` + `package-file-tree.ts` deleted (uncovered cases ported to Jini first: +13 Jini tests; locale test written first, failed, then passed).
6. **IntegrationsRedirect** — moved to `@jini-ai/admin/screens/integrations/IntegrationsRedirect` with a REQUIRED hook prop; render sites in `panels.tsx` (5), `App.tsx`, `AdminUi.tsx` pass the host hook; `panels-render` assertions updated.
7. **check:hooks** — Jini checker accepts hooks received as REQUIRED props/params (`32243fd5`; 4 new checker tests, mutation named); the 8 false-positive debt rows were removed (debt 8 → 0). Still flags imported custom hooks.

Coordinator review fixes applied on builder output: guard N1/N2 product refs in a moved file (`external-mcp-tool-picker-rules.ts`); a defaulted Jini hook prop in cms `RemoteImageImport` made REQUIRED; `useThemePages` and `useSecurityPermissions` no longer import kit-facade query hooks (REQUIRED fields instead, rv1123r fix-6 pattern); a leftover forwarding `export type { TranscriptionPort }` in Tovu desktop removed; Core webhook contract kept the server's `version` field (optional, server always sends it).

## Files (lane: 87 admin-feat SKIPPED + 14 admin-shell STOPPED, plus the Codex DISAGREE files)
Paths are under Tovu `apps/admin/src/`; Jini destinations under `packages/admin/src/` unless another package is named.

| file | decision |
|---|---|
| `features/sites/hooks/use-export-password.hooks.ts` | MOVED `sites/transfer/use-export-password.hooks.ts` (q3) |
| `features/voice-input/hooks/space-hold-rules.ts` | SPLIT `@jini-ai/chat` `react/features/voice-input/space-hold-rules.ts`; key/duration stay host (q4) |
| `features/voice-input/voice-input-port.ts` | SPLIT contract → `@jini-ai/core/contracts/speech-transcription`; STAYS-HOST remainder (binds `window.tovuVoice`) (q5) |
| `apps/admin/dev-proxy-upstream-close.ts` | SPLIT `@jini-ai/devops/local-dev/dev-proxy-upstream`; host keeps Vite registration + refusal copy (r10) |
| `features/integrations/api/integrations-api.types.ts` | SPLIT → Core `cms-integrations` + `cms-external-mcp`, admin `agent-plugins/models`; deleted |
| `features/integrations/api/integrations-api.ts` | MOVED `screens/integrations/api/integrations-api.ts` (`createIntegrationsApi`; host binding `integrations-host-ports.ts`) |
| `features/integrations/hooks/integrations-port.hooks.ts`, `integration-deliveries-port.hooks.ts` | MOVED `screens/integrations/integrations-ports.ts` |
| `features/plugins/hooks/agent-plugin-install-port.hooks.ts`, `agent-plugins-port.hooks.ts` | MOVED `screens/integrations/agent-plugin-ports.ts` |
| `features/providers/always-allow-rules.ts` | MOVED `screens/providers/always-allow-rules.ts` |
| `features/providers/hooks/always-allow-port.hooks.ts` | MOVED `screens/providers/always-allow-ports.ts` |
| `features/integrations/IntegrationsRedirect.tsx` | MOVED `screens/integrations/IntegrationsRedirect.tsx` (required hook prop; decision 6) |
| `features/settings/external-mcp-tool-picker-rules.ts` | MOVED `screens/settings/external-mcp-tool-picker-rules.ts` (`isApiError`/`describeApiError` injected) |
| `features/settings/external-mcp-admissions-rules.ts` | SPLIT `screens/settings/external-mcp-{drift-types,tool-drift,connection-drift}.ts`; English drift copy STAYS-HOST (`external-mcp-drift-copy.ts`, product copy) |
| `features/security/api/security-api.types.ts` | MOVED `security/api/security-api.types.ts` |
| `features/source-control/api/source-control-api.types.ts` | MOVED `source-control/api/source-control-api.types.ts` |
| `features/security/access-token-rows.ts` | MOVED `security/access-token-rows.ts` (labels injected) |
| `features/deployment/api/deployment-api.types.ts` | SPLIT `deployment/api/deployment-api.types.ts`; `AdminPublishDestination` STAYS-HOST (product wire literal `tovu-peer`) |
| `features/deployment/api/deployment-api.ts` | MOVED `deployment/api/deployment-api.ts` (`createDeploymentApi`) |
| `features/security/api/security-api.ts` | MOVED `security/api/security-api.ts` |
| `features/source-control/api/source-control-api.ts` | MOVED `source-control/api/source-control-api.ts` |
| `features/deployment/hooks/{deployment-overview,dockerfile-source,publish-credentials}-port.hooks.ts` | MOVED `deployment/host/hooks/` |
| `features/security/hooks/access-tokens-port.hooks.ts` | MOVED `security/host/hooks/` |
| `features/source-control/hooks/source-control-credentials-port.hooks.ts` | MOVED `source-control/host/hooks/` |
| `features/security/hooks/use-security-permissions.hooks.ts` | MOVED `security/host/hooks/use-security-permissions.hooks.ts` (`{ port, permission, useFetchQuery }`; decision 4) |
| `features/security/rules.ts` | SPLIT `security/access-token-categories.ts` (categories injected); permission/resource policy STAYS-HOST |
| `features/security/access-token-providers.ts` | MOVED `security/access-token-providers.ts` (copy injected; copy constant stays host) |
| `features/security/custom-credential-forms.ts` | MOVED `security/custom-credential-forms.ts` |
| `features/{settings/settings-capabilities,providers,integrations,comments,menus,taxonomy,collections,security,plugins}-i18n` (9) | MOVED dictionary factories (`screens/<x>/<x>-i18n.ts` + `i18n/*` data; security under `security/`); host binds in `lib/i18n-common.ts` (decision 3) |
| `features/plugins/hooks/use-package-file-tree.hooks.ts`, `features/plugins/package-file-tree.ts` | DELETED (duplicate of Jini `useAgentPluginFileTree`; decision 5) |
| `features/members/MembersPanel.tsx`, `MembersPanel.hooks.ts` | DELETED (host renders Jini `user-management/react` `Members`; decision 2) |
| `features/media/RemoteImageImport.tsx`, `hooks/use-remote-image-import.hooks.ts` | MOVED `@jini-ai/cms` `react/media/` (decision 2) |
| `features/media/media-provider-catalog.ts` | MOVED `@jini-ai/integrations` `media-providers/configurable-catalog.ts`; pinned ids STAYS-HOST (owner policy) |
| `features/posts/post-editor-route-key.ts` | MOVED `posts/post-editor-route-keys.ts` (instance factory, HW3; decision 13) |
| `features/posts/editor/view-bar/view-tabs.ts` | MOVED `posts/view-tabs.ts` (+ `PostEditorView`) |
| `features/pages/hooks/use-theme-pages.hooks.ts` | SPLIT `pages/hooks/use-theme-pages.hooks.ts`; collision path / publish summary / wired binding STAYS-HOST (host routes + publish state) |
| `features/plugins/hooks/use-plugin-provider-settings.hooks.ts` | SPLIT `screens/plugins/hooks/use-plugin-provider-settings.hooks.ts`; wired binding stays host |
| `features/plugins/AgentPlugins.hooks.ts` | MOVED `screens/plugins/AgentPlugins.hooks.ts` |
| `features/providers/hooks/use-providers.hooks.ts` | MOVED `screens/providers/hooks/use-providers.hooks.ts` (`useExternalMcp` required) |
| `features/trash/rules.ts` | SPLIT `screens/trash/rules.ts`; `describeTrashLoadError` STAYS-HOST (Tovu API product copy) |
| `components/AssistantDock/hooks/use-chat-display-preferences.hooks.ts` (+ generic part of `chat-display-preferences.ts`) | MOVED `shell/components/AssistantDock/hooks/use-chat-display-preferences.hooks.ts`; namespace/defaults stay host |
| `hooks/use-assistant-chats.hooks.ts` | SPLIT `shell/hooks/use-assistant-chats.hooks.ts` (`client` required); client singleton + `useWiredAssistantChats` STAYS-HOST |
| `components/AssistantDock/hooks/assistant-mcp-ui.ts` | SPLIT `shell/.../open-mcp-ui-link.ts` (origin/openWindow injected); sandbox-proxy URL builder stays host (website pin) |
| `components/AssistantDock/DockHeader.tsx` | STAYS-HOST (host composition: host tip, i18n, dock props) |
| `lib/{block-atom-insert,post-title-extension}.ts`, `lib/{media-image-extension,media-embed-extension}.tsx` | STAYS-HOST (tiptap editor stays in host; owner 11-23) |
| `features/posts/PostEditor.hooks.ts`, `editor/bubble-menu/*`, `editor/toolbar/{toolbar-group-props,toolbar-state}.ts`, `hooks/use-post-url-dialog.hooks.ts`, `hooks/post-editor-file-upload.ts` | STAYS-HOST (tiptap; owner 11-23) |
| `features/security/access-token-forms.ts` | STAYS-HOST for now (composes host deployment/source-control rules + `ApiError`); move after those rules |
| `features/settings/hooks/use-admin-appearance-settings.hooks.ts` | STAYS-HOST (21-line composition of three host hooks; moving = wrapper) |
| `features/settings/hooks/use-settings-ui.hooks.ts` | STAYS-HOST (host settings-slice wiring) |
| `features/settings/hooks/use-external-mcp-tool-picker.hooks.ts`, `features/plugins/hooks/use-agent-plugin-update.hooks.ts` | STAYS-HOST (bind host `integrationsApi` / compose host install hook) |
| `features/plugins/hooks/{use-plugin-package-files,use-agent-plugin-details-modal}.hooks.ts`, `features/providers/hooks/use-always-allow.hooks.ts`, `features/integrations/hooks/use-integration-deliveries.hooks.ts`, `features/settings/hooks/use-external-mcp-admissions.hooks.ts` | STOPPED (budget): call `@jini-ai/ui` query hooks + host singletons. Recommendation: same recipe as `useThemePages` — kit query hooks and api client as REQUIRED fields — then move |
| `features/settings/rules.ts`, `features/settings/hooks/use-ai-agent-presentation.hooks.ts` | STOPPED: need `@jini-ai/ui` types (`ExecutionConfig`, `ByokConfig`, `DetectedAgent`, …) and `ACCENT_SWATCH_PRESETS`. Recommendation: move those ui types to Core contracts first |
| `features/pages/hooks/use-theme-canvas-styling.hooks.ts` | STOPPED: needs `CanvasStyling` (ui html-editor), `resolveThemeLayout` (cms value), host error class. Recommendation: `CanvasStyling` → Core, inject the other two, own batch |
| `components/ConfirmActionDialog.tsx` | STOPPED: needs the kit `KitConfirmDialogProps` extension (`dialogRef`, `titleId`, per-action attrs, `extra`) across every kit implementation + ~150 host CSS rules; recommend one owner-reviewed kit batch, then move the 3 callers |
| `components/AssistantDock/DockHeaderTip.tsx` | STOPPED: 8 importers would each pass `useTip` + `bubbleStyle`; recommend exposing `bubbleStyle` on the kit `InfoTipController` so the Jini component needs no props |
| `lib/assistant-daemon-activation.ts` | STOPPED (owner): needs `@jini-ai/admin` in Tovu root devDependencies (manifest + lockfile). Recommendation: approve it, then re-apply the ready move |
| `components/AssistantDock/hooks/byok-runtime.hooks.ts`, `components/WidgetConfigFields/HtmlAttributeRows.tsx`, `components/MediaEditDialog/MediaEditDialog.tsx` | NOT ATTEMPTED (budget): prerequisites unchanged from w4 (K4-seam-20 preset type; kit ghost-icon-button / Dialog slots + visual review) |
| plugins components (`AgentPluginMemoryPanel`, `PluginPackageFilesModal`, `AgentPluginMaturity`, `AgentPluginUpdateControl`, `PluginProviderSettingField.tsx`, `PluginProviderSettingsDialog`, `PluginRemoveConfirmDialog`, `admin-surface-theme`), posts components (`PostCoverImage`, `PostEditorActions`, `PostEditorSlugCollisionWarning`, `ToolbarColorGroup`, `ToolbarTypographyGroup`), `deployment/OverviewTab`, `providers/AlwaysAllowPanel`, security `AccessTokensTab.hooks`, `OtherCredentialsSection.hooks`, `CopyKeysDialog`, `SiteKeyRecoveryCard`, `other-credential-stores`, `integrations/{Integrations,IntegrationDeliveries}.tsx`, settings `ExternalMcpAdmissionsBanner`, `ExternalMcpToolPicker` | NOT ATTEMPTED (budget; mostly non-`jini-` CSS + host components). Their K4/i18n/hook prerequisites are now landed, so a next lane can move them |

## FILES LEFT (`scan.mjs` + `plan.mjs` from `origin/plan/whats-left-1122`, clean worktree per commit; themes = `theme` + `adm-themes` areas)
| | FILES LEFT | excl. themes |
|---|---:|---:|
| before (base `eafc04dd5`) | 2,147 | 2,036 |
| after (`__TOVU__`) | __FL_AFTER__ | __FL_AFTER_X__ |

## Gates (tip vs base; base measured in clean worktrees at `bc3acc30` / `eafc04dd5`)
__GATES__

## Self-check (Codex failure list)
- No re-export/forwarding files added; three pre-existing forwarding exports removed (r10) plus the desktop `TranscriptionPort` one.
- Custom hooks reach Jini only as REQUIRED props/fields (diff grep for defaulted `useX = useY` in Jini: 0; kit-facade hook imports removed from moved hooks; `check:hooks` green).
- No server-framework types or host log formatters in Jini (dev-proxy port is structural; refusal copy injected).
- `jini-*` classes for moved rendering (dock menu, cms import dialog) with host CSS aliases.
- No new size/complexity exception or debt rows (Jini size/complexity output identical to base; oversized dictionaries split instead).
- Shared wire types in Core (`cms-trash`, `cms-integrations`, `cms-plugins`, `cms-external-mcp`, `speech-transcription`).
- Object args with `_optional = {}` on new/changed exported functions and hooks.
- Behaviour changes test-first with named mutations (SiteKey reset, plugins legacy conflicts, hook checker, dev-proxy writableEnded, display prefs, assistant chats resume, MCP-UI link origin, theme pages noThemeId, route-keys isolation, security permission, access-token sort/copy, file-tree locale).
- Why-comments moved with the code; debt rows only where the comment was found at the destination or deleted with its code (see Gates).
- api baselines regenerated (`d066e46c`), changeset `.changeset/p9-w5-admin.md` (admin/desktop-host/cms minor = breaking for direct callers, others patch).
