P9K-COMBINED COMPLETE

## Files left

**2,446 + 180 = 2,626 Tovu files.** The three landed branches are already credited in P9K.

| Area | P9K | Net added | Corrected |
|---|---:|---:|---:|
| Themes | 111 | 0 | 111 |
| Publish-content | 82 | 0 | 82 |
| Post | 109 | 0 | 109 |
| Newsletter | 25 | 0 | 25 |
| Site backup | 44 | 0 | 44 |
| Deployments | 70 | 0 | 70 |
| Security | 39 | 0 | 39 |
| Rendering/routes | 463 | 0 | 463 |
| Admin screens | 485 | 58 | 543 |
| Admin shell/transport/roles | 266 | 0 | 266 |
| Desktop | 17 | 100 | 117 |
| Users | 31 | 0 | 31 |
| Devops other | 37 | 0 | 37 |
| Shared contracts/platform | 110 | 1 | 111 |
| Other generic features | 557 | 3 | 560 |
| Visitor chat, including bundle measurement | 0 | 12 | 12 |
| `packages/contracts` | 0 | 3 | 3 |
| `packages/sdk` | 0 | 3 | 3 |
| **Total** | **2,446** | **180** | **2,626** |

The delta is A’s 165 candidates plus B’s 18 distinct visitor-chat, contracts and SDK files, plus D04’s removable atomic-write wrapper. Subtract one already-covered candidate (W2) and three retained candidates (`find-in-page.ts`, `zoom.ts`, `voice-unavailability.ts`). B’s ten desktop candidates overlap A. Caller edits, policy-only injections, record-guard cleanups and Jini-only work carry zero additional files. A counted split can leave a substantive host binding behind.

## Finding table

`A/`, `D/`, `W/` and `Site/` mean `apps/admin/src/`, `apps/desktop/src/`, `apps/website/src/` and `apps/site-chat/src/`. Destinations use the `@jini-ai/` prefix. A pair such as `AX-1/2 J/T 90/65` means two separate steps, Jini then Tovu, with estimates in minutes. The T step repoints the named sources and importers, depends on its J step, and uses the same parity mutation against the linked tree. Additional dependencies are named below. Each T repoint follows the existing P9K repoints on its files. All steps inherit P9 §1 and P9K’s K recipes, including existing args and pads, injected hooks, and test-first behavior changes.

### Audit A

For each **ADD** on a P9K stay row, the audit wins for the reusable code named below. P9K wins for the host policy, copy and bindings identified in the same row.

| Finding | Decision, files, steps and mutation |
|---|---|
| A1 | **ADD** `AX-1/2` K2 J/T 90/65. `A/features/ai-assistant/{AssistantToggleRow,OwnerGrantStatus}` and locale-sync/owner-grant hooks → `admin/assistant-settings`. Inject locale, refresh, confirmation and copy. Mutate successful save to skip refresh. |
| A2 | **ADD** `AX-3` DEDUPE T 75. `use-assistant-daemon-restart.hooks.ts` → `admin` `useProcessRestart`. Adapt readiness to `{ failed }`, supply delay and error copy. Mutate failure to report ready. |
| A3 | **ADD** `AX-4` K4 J 55 for assistant settings DTOs. K2 `AX-5/6` J/T 105/90 for `AiAssistant.tsx` execution sections and `use-admin-execution-mode`/`use-ai-assistant` hooks, after 4 and T after 3. `AX-7` J 100 for credential discovery/save in `use-visitor-credential-form`; `AX-8` J 110 for that hook’s form state, `visitor-credential-form-port` and `VisitorAssistantPanel`; `AX-9` T 105 after 6/8. `AX-10/11` J/T 90/80 for `VisitorToolsPanel` and `use-visitor-tools`, after 4, T after 9. Use `admin/assistant-settings`. Host owns rollout, tabs, roadmap and provider catalog. Mutate restart gating, credential selection, submission reset and tool-limit clamp respectively. |
| A4 | **ADD** K2 `AX-12` J 95 for dashboard `rules.ts`, `dashboard-port` and `use-dashboard`; `AX-13/14` J/T 90/90 for `Dashboard.tsx` stat/activity views after 12 → `admin/dashboard`. Inject readers, labels and links. Mutate event ordering and empty-state rendering. |
| A5 | **ADD** K2 `AX-18/19` J/T 105/100 for `CredentialWarnings`, both `site-transfer-rules.ts` files and password, credential-gate and transfer hooks after A6. `AX-20/21` 95/85 for `SiteExportTab`, `site-export-error` and export-state; `AX-22/23` 100/90 for `SiteImportTab` and import-state; `AX-24/25` 85/75 for `StaticExportPicker` and static-selection. Each J/T pair follows 18/19 → `admin/site-transfer`. Inject archive rules, clipboard, operations and copy. Mutate acknowledgement, download refusal, failed import and default theme selection. |
| A6 | **ADD** `AX-15` K4 J 60 for transfer DTOs in `core/contracts/site`; `AX-16/17` K5 J/T 110/95 after 15 for `site-export-actions.ts`, `site-import-actions.ts`, `site-import-controller.ts` and shared parts of `site-transfer-dependencies.hooks.ts` → `admin/site-transfer`. Bind endpoints, download and desktop handoff in Tovu. Mutate job settlement to accept an unfinished export. |
| A7 | **ADD** `AX-26/27` K5 J/T 70/70. Sites `use-created-site-return` and `use-site-card-preview` hooks → `ui/site-card`. Inject address and status. Mutate creation to trigger the return twice. |
| A8 | **ADD** `AX-28` K4 J 55 for `voice-input-port.ts` contracts. K5 `AX-29/30` J/T 100/80 for `mic-capture` after 28, `AX-31/32` 100/80 for `space-hold-rules` and push-to-talk state, push-to-talk and space-hold hooks after 29/30, `AX-33/34` 90/80 for `mic-button-view`, button, CSS and placeholder after 31/32 → `ui/voice-input`. Inject bridge, translator and shortcut defaults. Mutate capture cancel, hold release and accessible disabled state. **REJECT** moving `voice-unavailability.ts`; its lookup serves Tovu/macOS deployment advice. |
| A9 | **ADD** `AX-35` K4 J 45 for `workspace-api.types.ts`; `AX-36/37` K2 J/T 100/85 after 35 for `Workspace.tsx`, `rules.ts`, `use-workspace` and `workspace-port` → `admin/workspace`. Host supplies identity, delete eligibility and messages. Mutate dirty-state detection. |
| A10 + D25 | **ADD** `AX-38` K5 J 70 for `tokensForCreate` from admin sites `rules.ts` and the desktop token hook → `agent-plugins/connect`, beside `token-map` validation. `AX-39` K2 J 90 after 38 for shared token-field state → `admin/agent-plugin-tokens`. `AX-40` T admin 80 after 39 and `AX-41` T desktop 75 after 38 repoint their token hooks. Inject inventory and compactor. Mutate whitespace-only token handling. |
| A11 | **ADD** `AX-42/43` K2 J/T 100/90 for sites list/trash (`AllSitesTab`, `SiteTrashTab`), after A7. `AX-44/45` K2 J/T 110/100 for `CreateSiteOnboarding`, `Sites.hooks`, `Sites`, after 39/42 and T after 40/43 → `admin/sites`. Host binds starters, database choices, tabs and lifecycle. Mutate trash refresh and post-create return. |
| M1 | **ADD** `AX-46/47` K4/K5 J/T 75/75. `D/preload/preload.mts` subscriber and `D/renderer/electron-webview.d.ts` structural types → `desktop-host/electron`. Keep allowlists, globals and JSX registration. Mutate cleanup to remove a different listener. |
| D1 | **ADD** K5 `AX-48` J 95 for renderer `find-bar-state`, `find-focus-clock`, `use-find-bar-state`; `AX-49` J 110 after 48 for `find-target`, `use-find-in-page`, `use-find-bar-effects`; `AX-51` J 100 after 49 for `find-input-focus`, focus-reclaim/input-binding hooks → `desktop-host/electron/usability/react`. `AX-50` J 85 for `app/FindBar.tsx` and its `app.css` section → `ui/find`. `AX-52` T 115 after 47/50/51 and `K5-desktop-1.T`. Inject `createFindQueryScheduler`, targets, bridges and copy. Mutate fresh-query flag, guest selection, IME guard and Escape behavior. **REJECT** moving `contracts/find-in-page.ts`; its deployed channels stay. |
| D2 | **ADD** `AX-53/54` K5 J/T 90/70. `use-zoom.hooks.ts` → `desktop-host/electron/usability/zoom`, with storage and target injected. Mutate reset to affect the wrong surface. **REJECT** moving `contracts/zoom.ts`; the channel is host ABI and the direction type already comes from Jini. |
| D3, D4 | **ADD** `AX-55/56` K5/DEDUPE J/T 85/75. Renderer `use-app-version` and `use-update-check` → `desktop-host/react/app-version` around existing loaders. T also replaces duplicate bridge types in `contracts/app-version.ts` with `AppVersionBridge`/`UpdateCheckBridge` and retains channels. `K5-desktop-1` covers main IPC. Mutate rejected-check settlement. |
| D5 | **ADD** `AX-57` DEDUPE T 65 for `folder-drop.ts` and `app/Spinner.tsx`, using `folderPathsFromDataTransfer` and `Spinner` from `ui`. `AX-58/59` K5 J/T 70/60 for `use-dropdown-menu` → `ui`, using `useDismissOnOutsideOrEscape`. Mutate folder propagation, loading accessible name and Escape. |
| D6 | **ADD** `AX-60/61` K5 J/T 105/95. Renderer `expanded-mode.ts`, `theme.ts`, delete-confirmation and expanded-mode hooks → `ui`, reuse `resolveColorScheme`. Inject storage, display policy and delete action. Mutate cancellation to clear the wrong pending item. |
| D7 | **ADD** `AX-62/63` K5 J/T 95/80. `LoadedSitesStepper.tsx`, its hooks and `use-loaded-sites` → `ui`. Inject bounds, labels and persistence. Mutate upper-limit behavior. |
| D8 | **ADD** `AX-64/65` K5 J/T 110/90. `use-live-views` and `use-webview-load-failure` → `desktop-host/react/guests`. J after 118, T after 119. Inject eviction, guest probe and clock. Mutate stale-load cancellation. |
| D9 | **ADD** `AX-66/67` DEDUPE J/T 80/70. `use-site-list-prefs` → `ui/site-card` `useSiteListPrefs`; add optional synchronous seed and preserve session fallback. Mutate denied-storage initial render. |
| D10 | **ADD** `AX-68` K4 J 90 for `contracts/{chat-attachments,workspace-chat,workspace-conversations}`. K5 `AX-69` J 110 for renderer attachment/transport and transport hook → `chat`; `AX-70` J 95 after 68/69 for `workspace-chat-ipc` → `desktop-host/electron/chat`; `AX-71` J 105 after 68 for conversation store/controller and renderer hook → `chat/conversations`. `AX-72` T 105 for transport/IPC after 69/70; `AX-73` T 95 for conversations after 71/72. Inject filesystem, decoder and sender binding. Mutate replay cursor, disposal and restored conversation. |
| D11 | **ADD** `AX-74` K4 J 50 for `contracts/runtime-inventory.ts`; `AX-75/76` K5 J/T 100/80 after 74 for `desktop-agent-inventory.ts` → `agent-runtime/inventory`. Inject probes/eligibility. Mutate rescan to return stale results. |
| D12 | **ALREADY-COVERED** `MemoryMetric` and `ResourceProcess` by `K4-seam-18`, sampler by `K5-desktop-1`. **ADD** `AX-77` K4 J 65 for remaining `contracts/resources.ts` DTOs after that seam. K5 `AX-78` J 110 for `desktop-resources`, `resources-ipc` and `use-resources` → `desktop-host/resources`; `AX-79` J 95 for `ResourcesPanel` and hooks → `ui/resource-monitor`, both after 77. `AX-80` T 100 after both. Inject sampler, thresholds and actions. Mutate PID reuse and hidden-panel polling. |
| W1 | **ADD** `AX-81` K4 J 65 for preview/cache ports. `AX-82/83` K5 J/T 105/90 for website `site-preview-{service,store}` → `cms/site-preview`; `AX-84/85` K5 J/T 100/85 for `playwright-site-preview-capture` → `diagnostics/web-evidence`. J after 81, T85 after 83. Inject browser opener, codec and cache eligibility. Mutate duplicate capture coalescing and cleanup on capture failure. |
| D13 | **ADD** `AX-86` K5 J 110 for `desktop-capture`, `site-preview-store` and both `main/boot/site-preview*` files → `desktop-host/electron/preview`, after 81/82. Reuse `createPreviewScheduler`; inject cache and admissible origin. `AX-87` K5 J 85 for renderer `use-site-preview` → `ui/site-card` after 81. `AX-88` T 105 after 86/87. Mutate stale guest cleanup and refresh revision. |
| D14 | **ADD** `AX-89/90` K5 J/T 105/90. `main/windows/{app-window,dock-icon,guest-navigation}` → `desktop-host/electron`. Inject title, URL, partition, preload and navigation policy. Mutate attached-guest handler cleanup. |
| D15 | **ADD** `AX-91/92` DEDUPE J/T 80/95. `webview-guest-policy`, `window-navigation-policy`, `window-bounds-store`, `zoom-menu` → current `desktop-host/electron` navigation/usability APIs. J only for bounds persistence seam where needed; T after 90. Retain missing-preload diagnostic, storage location and labels. Mutate saved-bounds restoration or required preload. |
| D16 | **ADD** `AX-93/94` K5 J/T 95/85 for `desktop-update-preference` and `update-check-now`; `AX-95/96` 105/95 for `main/updates/{desktop-updater,native-notices}`, after 93/94. Use `desktop-host/electron/updates` and the `DT-desktop-1` controller. Inject eligibility, preferences and copy. Mutate duplicate manual checks and quit-after-download. |
| D17 | **ADD** `AX-97/98` K5 J/T 85/75. `main/boot/boot-failure.ts` window settlement and `selftest-tracker.ts` accounting → `desktop-host/electron/selftest`. Host retains failure decision/exit reporting. Mutate duplicate settlement. |
| D18 | **ADD** `AX-99/100` K5 J/T 110/95 for `admin-dev-proxy`, `complexity-debt`, `live-verify-checks`, `quality-gates` → `devops/checks`; `AX-101/102` 95/85 for `move-to-applications` → `devops/packaging/electron`. Inject origins, manifests and packaging prompts. Mutate gate failure aggregation and relocation re-entry. |
| D19 | **ADD** `AX-132/103` DEDUPE J/T 60/55. `tree-quiet.ts` → `devops/packaging/electron` `treeQuietProblems`; extend its existing options for host formatters. Mutate moving-file refusal. |
| D20 | **ADD** K5 `AX-104` J 75 for `project-ipc.presence` → `desktop-host`; `AX-105` J 90 for renderer `import-error-details`, `mount-renderer`, `nav-availability` → `ui`; `AX-106` J 75 for `product-telemetry` error-collection lifecycle → `diagnostics`; `AX-108` T 90 after all three. `AX-107/109` K5 J/T 95/75 for `use-site-toast` and D29 `SiteToast.tsx` → `ui`. Preserve host telemetry vocabulary and copy. Mutate sender removal, missing root, reporting teardown and extended toast lifetime. |
| D21 | **ADD** `AX-112/113` K5 J/T 110/105. `desktop-auth.ts` transport/cookie exchange → `desktop-host/electron/session-bootstrap`. Host binds session rules, endpoint, partition and cookie names. Mutate failure to leave a partially bound session. |
| D22 | **ADD** `AX-114/115` K5 J/T 110/100 for `desktop-agent-service` → `sidecar/supervisor`, after BX-19/20 respectively. `AX-116/117` 75/65 for `tovu-server.output` → `diagnostics/console-tee`. Inject node, registry and redaction collaborators. Mutate child ownership and tail bounds. |
| D23 | **ADD** `AX-118/119` K5 J/T 100/90. `contracts/site-view-preference`, `site-view-preference`, renderer hook and `main/updates/settings-menu` refresh code → `desktop-host/electron/preferences`. Host retains choices, channels and menu composition. Mutate bounds or stale checked state. |
| D24 | **ADD** `AX-120/121` K5 J/T 95/80. `contracts/import-handoff`, `import-handoff-ipc`, renderer hook → `desktop-host/electron/handoff` for reusable forwarding/subscription. Inject parser, allowed sender, destination and handler. Mutate blocked-sender handling. |
| D26 | **ADD** `AX-122/123` K5 J/T 110/95 for `desktop-agent` → `agent-runtime`; `AX-124/125` 110/100 for `desktop-mcp-http` → `mcp/federation/hosted`. Inject runtime, delivery and catalogue; keep host tool and access policy. Mutate wrong-scope delivery. |
| D27 | **ADD** `AX-126/127` K5 J/T 110/95. `contracts/site-theme-preview-bridge`, `site-theme-preview-ipc`, `site-theme-preview` and renderer hook → `desktop-host/electron/subscriptions`. Inject endpoint, parser and reload. Mutate duplicate revision or disposed-sender cleanup. |
| D28 | **ADD** `AX-128/129` K5 J/T 105/100. `project-ipc.site-lifecycle` keyed transitions → `sidecar/supervisor`. J after 114, T after 115. Inject respawn/idle policy and server actions. Mutate cancellation to allow a stale retry. |
| D29 | **ADD** `AX-110/111` K5 J/T 85/75. Renderer `icon-frame.tsx` and `use-import-drop` → `ui`. Inject classification and callbacks. `SiteToast.tsx` is assigned to 107/109. Mutate rejected-drop state reset. |
| D30 | **ADD** `AX-130/131` K5 J/T 100/85. `main/boot/boot-steps.ts` setup/discovery mechanics → `desktop-host/node-toolchain`. Keep boot-mode choice, paths and warnings at host. Mutate failed background discovery to block boot. |
| W2 | **ALREADY-COVERED** by `K4-seam-5.J/.T` for `EntryPublishPorts`, `TaxonomyPublishPorts` and `WidgetPublishPorts`. K4 permits structural core contracts. The product’s registered entity bag stays host composition, as K02 confirms. |
| S1–S7 | **REJECT** extraction of the confirmed stays. S1 product tab composition; S2 assistant policy, copy and bindings; S3 dashboard endpoint/key wiring; S4 playground route/targets; S5 site APIs/actions/dictionaries; S6 voice rollout and composer binding; S7 workspace endpoint/redirect/copy. I04 separately covers an injection in retained assistant rules. |
| S8 | **ALREADY-COVERED** generic dictionary split by `K4-i18n-common.J/.T`. **REJECT** moving the product dictionary remainder or `tovu-execution-policy.ts`. |
| S9–S14 | **REJECT** extraction of the confirmed stays. S9 desktop product contracts; S10 boot, consent and window composition; S11 renderer product UI/bindings; S12 desktop discovery, packaging and policy; S13 credential identities/vault bindings; S14 site tool vocabulary, authorization and warm-server wiring. |

### Audit B

| Finding | Decision, files, steps and mutation |
|---|---|
| B01 | **ADD** `BX-1` DEDUPE J 110 for async request and byte-idle seams in `chat/transports/fetch-sse`; `BX-2` J 105 after 1 for HTTP refusal references, no-reply, custom frames and terminal callback. `BX-3` T 110 after 2 converts `Site/site-assistant-transport.ts`, binding `createFetchSseTransport` and core `decodeSseStream` for React/vanilla. Preserve visitor wire behavior and exclude confirmations from history. Mutate timeout reset and settlement on an empty reply. |
| B02 | **ADD** `BX-4/5` DEDUPE J/T 65/60. `Site/session-store.ts` → `chat/browser/session-store` `createBrowserSessionStore`. Preserve current reads of legacy envelopes through the existing args and enforce 50 messages/200 KB on new writes. Mutate key suffix isolation and boundary reads. |
| B03 | **ADD** `BX-7/8` DEDUPE J/T 110/110. `SiteAssistantWidget`, widget/activation hooks and `loader-host` → `chat/react/embed` `EmbedChatWidget`. J after 6. T after 7/13/15/34–36/47/49/59. Inject header, suggestions, greetings and confirmation slots. Mutate an open request sent before React commits. |
| B04 | **ADD** `BX-9` K4 J 65 for challenge contract → `core/contracts/chat`; `BX-10` K5 J 100 for lifecycle → `chat/embed-widget`; `BX-11` J 90 for React after 7/10; `BX-12` J 90 for vanilla slot after 10. `BX-13` T 100 after 3/11/12 for `tool-confirmation.ts`, `SiteToolConfirmation.hooks.ts`, `vanilla-tool-confirmation.ts`. Preserve explicit approval, expiry and one in-flight decision. Mutate duplicate submission and focus restoration. |
| B05, I01 | **ADD** `BX-14/15` K5 J/T 100/90. `visitor-page-control.ts` coordinator → `chat/browser/frontend-session-bridge`. T after 3/5/16. Inject capability IDs, DOM driver, credentials, path admission and publication. Mutate terminal/effect arrival order and reconnect handling. One file across both findings. |
| B06 | **ADD** `BX-16` DEDUPE T 60. `visitor-site-path.ts` wraps core `checkSiteRelativeTarget` and retains strict raw visitor grammar. Mutate acceptance of queries or fragments. |
| B07 | **ADD** `BX-17/18` K5 J/T 70/50. `apps/site-chat/scripts/measure-bundles.mjs` gzip measurement and totals → `devops/build/bundle-size`. Host supplies asset groups/budget. Mutate threshold comparison. |
| C01 | **ADD** `BX-19/20` K4 J/T 105/100. `daemon-connection.ts`, `daemon-exit-codes.ts` → dependency-free `core/contracts/runtime/daemon-control`. Keep Zod parsing and site registration at the host seam. Preserve numeric exit codes and strict idle acknowledgement. Mutate acceptance of an extra acknowledgement field. |
| C02 | **ADD** `BX-21` K4 J 50 for `host-signals.ts` contracts, `BX-22/23` K5 J/T 90/95 for evaluator/selector → `platform/host-signals` after 21. Supply Tovu’s Fly baseline and advice. Mutate duplicate detection or conflicting proxy hints. |
| S01, S02 | **ADD** `BX-24` DEDUPE J 90 for `packages/sdk/src/{content-contracts,index}.ts` common SDK types → `core/contracts/plugin-sdk`; `BX-25` K4 J 75 after 24 for `hooks.ts` descriptor/kind/signature utilities. `BX-26` T 100 after both. Keep public SDK entry, hook catalogue, draft fields, callback ABI and contribution priorities. Mutate filter signature or priority ordering. |
| D01 | **ADD** `BX-27` DEDUPE T 60. Desktop `smoke-bridge` and website `assistant/{ask-choice-ui-resource,byok-meta-tool-result,run-page-context,site/history,byok-tool-surface}`. Use core `isRecord` for ask-choice, `isNonArrayRecord` for the other guards. Mutate array acceptance. |
| D02 | **ADD**, same `AX-66/67` as D9. P9K retains the storage adapter; audit wins on the hook. |
| D03 | **ADD**, included in `AX-48/49/51/52`. P9K’s native IPC step covers the other half. |
| D04 | **ADD** `BX-28/29` INJECT T/T 110/70. Bind `platform/fs` atomic writers in `active-site`, `boot-site-dir`, `duplicate-site`, `init-site`, `key-only-site-meta` and `repair-site`; bind `move-site-storage` and delete `platform/site-dir/atomic-write.ts` in 29 after 28. Preserve injected filesystems, mode and durability. Mutate overwrite permissions or directory-flush failure. |
| K01, K02 | **REJECT** extraction of deployed Find channels, admin site-list settings binding and the product publish bag. W2’s generic contracts are covered separately. |
| I02 | **ADD** `BX-30` INJECT T 110 after 20/23/26. Bind projector, title normalizer, credential messages and redactor for `packages/contracts/src/{assistant-native-fallbacks,content-chat-title,credential-copy,secret-redaction}`. Mutate policy fallback or redaction. |
| I03 | **ADD** `BX-31/32` INJECT T/T 95/80. Website `assistant/site/{visitor-executor,visitor-tool-budgets}` receive executor, audit and counter factory. `assistant/run-start-context` receives plugin reader and text guards after 31. Mutate budget accounting and text-guard call order. |
| I04 | **ADD** catalog/form bindings enter A3’s `AX-6/9/11`; `BX-33` INJECT T 65 after them for retained `ai-assistant/rules.ts` query/validation functions. Mutate configured-provider validation. |
| I05 | **ADD** INJECT Jini chat `BX-6` 75 embed `dialog.hooks`; `BX-34` 95 after 6 for settings, composer, discovery and question components; `BX-35` 105 after 34 for pane, picker, composer area, drop-up and picker sections; `BX-36` 80 after 35 for file drop. `BX-37/38` T 100 each bind admin/desktop roots after 36/47/49/59; visitor binds in 8. Mutate focus trap, component selection, model picker and file-drop delegation. |
| I06 | **ADD** INJECT `BX-39/40/41` J 100/105/95, sequential, for user-management `admin/react` index/four pages, eight components, five tabs. Use the existing host-bound user-management kit surface. `BX-42` T 95 updates admin binding after 41. K5 overrides option C’s implementation-import allowance. Mutate an injected dialog or tab selection. |
| I07 | **ALREADY-COVERED** by `XC-6a` for node-adapters process, filesystem and lock collaborators, including the type-only lifecycle edge. |
| I08 | **ALREADY-COVERED** kernel/builtin features and local preset by `XC-6c/d`. **ADD** `BX-43` INJECT J 100 after `XC-6d` for `server/compose-jini-kernel.ts` route collaborators and shared token identities. Mutate resolver identity. |
| I09 | **ALREADY-COVERED** owner store, mount routes and named legacy storage edges by `XC-6b/d`. **ADD** INJECT J `BX-44` 85 for `route-host.ts` after 43; `BX-45` 100 for `adapters/node-pty.ts` and `terminal-service.ts` after 44; `BX-46` 75 for remaining legacy SQLite DDL binding after 45 and XC-6d. Mutate incident forwarding, PTY factory selection and missing migration. |
| I10 | **ADD** `BX-47/48` INJECT J 110/90. Chat `run-activity` and both `A2uiSurfaceCard` hook/rules files receive interpreter/catalog functions. Agentic `core/render-surface` receives decoder/catalog. Mutate display-only surface classification. |
| I11 | **ADD** `BX-49` INJECT J 110 after 47 for chat `McpUiSurfaceCard`, question input and recovery; `BX-50` J 95 for UI confirmation/form/outcome factories; `BX-51` J 85 for `agent-runtime/claude-stream-frames`; `BX-52` J 85 for `mcp/delegated-tool`. Inject resource and delegated-result codecs. Mutate frame metadata and marker round trip. |
| I12 | **ADD** `BX-53` K4 J 75 for core error constructor parity and terminal-run contract; reuse `apiErrorBody`. `BX-54` K5 J 90 after 53 for http-kit `internal-error`, `response`, `sse`. Daemon K5 J work after 53, sequential: `BX-55` 90 context/catalog/health/connectors/DB; `BX-56` 90 attachments/media/memory/host-tools; `BX-57` 95 model proxy/research/routines/XAI/resource request; `BX-58` 105 runs/cancellation/events/terminals/delegation/tool catalogue/execution. Mutate status, request ID, optional details and terminal-state classification. |
| I13 | **ADD** `BX-59` INJECT J 95 after `XC-1` and 35 for chat picker sections, model options and rules; `BX-60` J 85 after `XC-5` for CLI `local-daemon-discovery`. The P9 type remedies leave value calls. Mutate native-policy assessment and stale daemon selection. |
| Host bindings | **ADD** `BX-61` INJECT T 110 after 43–46/48–52/54/58 for affected website composition, including the owner-store CLI binding where required. Mutate forwarding of an injected error or codec port. Jini-side steps bind their own executable hosts. |

## Inserted batch list

Here `A#` means `AX-#` and `B#` means `BX-#`. A lettered batch runs immediately after its numbered batch, in letter order. Unlettered rows join the existing batch. The 193 items fit in 39 inserted batches and existing vacancies. Inserted batches use at most one J item per package and one T item per affected app; cross-app contract repoints occupy the sole T slot. Existing vacancies used for new T work have disjoint app paths in the P9K sheets.

```text
B4a   B16 B1 B9 B17 B39 B48
B4b   B18 B2 B19 B40 B50 B51
B4c   B3 B4 B21 B41 B52
B4d   B5 B6 B22 B24
B4e   B20 B7 B25
B4f   B23 B10 B53
B4g   B26 B11 B54 B55
B4h   B12 B56
B4i   B13 B14 B57
B4j   B15 B34 B58
B13a  B35
B13b  B36
B13c  B47
B13d  B49
B27a  B31 A1 A4 A26 A38 A46
B27b  A27 A47 B32 A5 A15 A48
B27c  A7 A28 A49 A50 A99 A106
B27d  A8 A29 A35 A51 A101 A114
B27e  A10 A31 A53 A68 A124 A128
B27f  A12 A33 A55 A69 A74 A132
B27g  A13 A58 A70 A71 A75 A77
B27h  A16 A60 A78 A81 A128 A132
B27i  A18 A62 A82 A84 A89
B27j  A83 A20 A66 A86
B27k  A85 A22 A79 A91
B46a  A2 A24 A87 A93
B46b  A3 A36 A95 A105
B54a  B27 A39 A97 A107
B54b  B28 A42 A104 A110
B54c  B29 A44 A112
B54d  B30 A118
B54e  A64
B54f  A120
B54g  A126
B54h  A130
B54i  A131
B129a B59
B129b B8 B37 B38
B130  B60
B143  B43 B42
B144  B44
B145  B45 A41
B146  B46 A52 A40
B146a B61
B147  A54
B148  A56 A43
B149  A57 A45
B150  A59 A14
B151  A61
B153  A63
B154  A67 A37
B155  A72 A30
B156  A73
B157  A76 A32
B158  A80
B159  A88 A34
B160  A90 A6
B161  A92 A9
B162  A94
B163  A96 A11
B164  A98 B33
B165  A100 A17
B166  A102 A19
B167  A103 A21
B168  A108
B169  A109 A23
B170  A111 A25
B171  A113
B172  A115
B173  A117
B174  A119
B175  A65
B176  A121
B177  A123
B178  A125
B179  A127
B180  A129
```

## B1–B3 MECHANICAL/PATTERN

| Batch | MECHANICAL | PATTERN |
|---|---|---|
| B1 | `T-post-1.T`; `SH-3` shell deletion/repoint after the owner clears its test block | `RT-K1-0.J`, `A-K2-0a.J`, `K4-i18n-common.J`; `SEC-0` is the read-only parity gate for the security swap |
| B2 | `C-platform-html-1.T` | `RT-K1-0.T`, `K4-i18n-common.T`, `A-K2-0b.J`, `K4-seam-1.J`, `K4-seam-2.J` |
| B3 | `A-adm-other-1.J` | `K4-seam-1.T`, `K4-seam-2.T`, `K4-contracts-core-5.J` (first application of seam 1), `A-K2-0.J`, `K4-seam-3.J` |

**NOT-CHECKED** from Audit B’s original scope are repository-wide duplicate parity, the exhaustive Tovu implementation-import inventory and dynamic or relative Jini package edges. P9K’s owner holds still apply. This was a read-only reconciliation.
