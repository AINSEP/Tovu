DONE run A3 | jobs 5/5 complete (every LEFT list holds only documented EXCEPTION/REFACTOR/BUG items) | tests added 534 (it/test lines; 0 removed) | files 100% 281/345 (cms-3 70/90, misc-1 MISC_PLACEHOLDER/90, plugins-1 29/37, ui-1 ~49/57, admin-8 69/81) | bugs 2 new (open, not fixed) | left: cms-3 0, misc-1 0, plugins-1 0, ui-1 0, admin-8 0 (exceptions only)

# gap-fill-1127 run A3 (round 3): Jini TDD coverage gap fill, cloud, tests run

- **Start:** 2026-11-28 00:02 UTC. **End:** see last commit on this branch (about 1 h 55 min in). Stop reason: condition (a) of the round-3 brief. Every job's LEFT list was empty or held only documented EXCEPTION/REFACTOR items, and each of those was re-checked by a skeptical "exception challenge" agent.
- **Subagents:** 26 in total, all `opus-high` except one `opus-low` measurement-only run. Four ran at once for most of the run.
  - cms-3: 8 (4 sequential, 1 parallel slot B, 1 whole-job verify, 1 final verify + exception challenge, 1 audit fix)
  - misc-1: 6 (4 sequential, 1 exception challenge, 1 final re-measure)
  - admin-8: 6 (3 slot A, 1 parallel slot B, 1 fill + verify, 1 exception challenge)
  - plugins-1: 3
  - ui-1: 2
  - 1 independent read-only test-integrity audit of all five A3 diffs
- **Setup:**
  - Node 24.22.3 from the nodejs.org tarball, pnpm 10.33.2 via corepack.
  - Jini `pnpm install --frozen-lockfile` and `pnpm -r build` at merge-28 were green.
  - One git worktree per job, with `pnpm install --offline` and the built `dist/` copied in.
  - For the two parallel slots I used temporary local branches (`a3/admin-8b`, `a3/cms-3b`) in separate worktrees, on disjoint files. I cherry-picked them onto the job branch, and tsc stayed clean after each pick. Those local branches were never pushed.
- **Secrets:** gitleaks is **not installed** in this container, and per the round-3 brief I did not download it. Before every push I ran an automated guard over the diff: no production files; no `as any`, ts-ignore/expect-error, `.skip`/`.only`, coverage-ignore or `gitleaks:allow`; no `tovu`. Every staged diff was also read by eye. The audit agent found no secret-like values.
- **Rules kept:**
  - **No production code changes on any branch:** the non-test file count from the A2 head to now is 0 on all 5 branches.
  - No config, threshold, guard or `.gitleaks.toml` edits.
  - No `--no-verify`, no force-push, no RemoteTrigger, no codebase-memory tools.
  - packages/commerce, PageEditorChrome and the BUG 6 vault/store files were untouched.
- **Test counts:** `git diff -M <A2 head>..<A3 head>`, counting added `it(`/`test(` lines. Removed is 0 on every branch. One admin-8 test was *replaced* by an honest version, so its net change is 0; the deleted lines elsewhere are widened imports, helper signatures and fixtures.

| job | branch @ head | commits | it/test + | it/test - | files changed |
|---|---|---|---|---|---|
| cms-3 | `codex/w62-cov-cms-3` @ `2b5f5cbc` | 40 | 128 | 0 | 56 (+1739/-14) |
| misc-1 | `codex/w62-cov-misc-1` @ `0d1e9458` | 22 | 108 | 0 | 51 (+1401/-10) |
| plugins-1 | `codex/w62-cov-plugins-1` @ `180a1871` | 18 | 50 | 0 | 17 (+858/-5) |
| ui-1 | `codex/w62-cov-ui-1` @ `56604dec` | 6 | 31 | 0 | 19 (+506/-3) |
| admin-8 | `codex/w62-cov-admin-8` @ `1bb1bec2` | 32 | 217 | 0 | 40 (+3106/-17) |

All five branches are pushed, and each fast-forwards from its A2 head.

## Final coverage per job
These are whole-job scoped runs with `--coverage.all=true` over the brief's FILES list.

**cms-3:** 70/90 files at 100/100/100 (head 1885df09; 2b5f5cbc only adds test assertions).
- The run was 238 test files and 2533 tests. The only red is the BUG 6 vault test, which was already failing.
- The other 20: 3 are BUG 6 files (provider-credential-batch, -store, -vault). 17 are EXCEPTION claims, each **CONFIRMED** with a file:line proof in the final ledger.

**misc-1:** MISC_PLACEHOLDER/90 (agent-runtime, agentic, analytics, chat).
- The pre-challenge run gave 64/90. The exception challenge then covered 6 claimed-unreachable lines.
- All remaining items are documented EXCEPTION/REFACTOR.
- Known reds, not ours: agent-runtime `loads-without-integrations` (11), chat `durable-run-subscription` P26, and chat ag-ui `interrupts` "hands an interrupt…".

**plugins-1:** 29/37 files at 100/100/100. The whole suite (106 files, 1281 tests) is green.
- Totals were 99.47 S / 99.51 B / 99.06 F before the challenge, which closed 2 more files.
- Under coverage, `host-entry-purity.test.ts` sometimes hits its 60 s timeout. This is environmental and known from A2.

**ui-1:** about 49/57 (46/57 measured before the challenge, plus 3 claims refuted and covered).
- The remaining 8 are CONFIRMED EXCEPTION/REFACTOR items.

**admin-8:** 69/81 files at 100/100/100. The run was 173 test files and 1812 tests; the only red is the known `y5-live-secrets`.
- The other 12 files are at 100% lines and functions, and each misses exactly one branch.
- 11 of those 12 are CONFIRMED exceptions. The 12th is **BUG 8** (below).

## Exception challenge: claimed-unreachable lines that were actually reachable
Each challenge agent traced every caller and public export behind each EXCEPTION/REFACTOR claim. Where a real path existed, it wrote an honest test and checked its mutation:
- **misc-1 (6):**
  - chat: use-ai-agent-presentation B23, ChatCleanupDialog B23 (a kit button that uses aria-disabled), frontend-session-bridge B348 (`close()` called during `headers()`)
  - agentic: dom-page-driver B416 (a browser without `:modal`), dom-page-driver :703, site/tool-registrations B154
  - agent-runtime: acp/session B211 (an equivalent mutant on its own)
- **ui-1 (3):** use-optimistic-stored-value B50, editor-blocks B69, useTabStripDragReorder B73.
- **plugins-1 (3):**
  - discovery 292-298 (folder names that differ only in case collide)
  - import-policy :122 (the real `node:module` register hook)
  - PluginProviderSettingsDialog 139-141, via a per-file `// @vitest-environment jsdom` docblock. jsdom 26 was already installed; there is no config or package change. **Owner: confirm this docblock is acceptable for @jini-ai/plugins.**
- **cms-3 (1):** media/site/publish-content :231 (a row deleted mid-flight). The other 17 cms claims were confirmed.
- **admin-8 (1):** this one became **BUG 8**.

## BUGs (both appended to `development/open-bugs.md` on this branch; neither fixed, both owner decisions)
- **BUG 7, core (cross-cutting user-facing text):** Jini `packages/core/src/registration-kit.ts:371-372`. `decorateWithSchema` builds `${message}. ${RETRY_IS_FUTILE}`, so a message that already ends in "." comes out as "That address is not allowed.. Fix the input…".
  - Proposed fix: `const sep = /[.!?]$/.test(params.message) ? " " : ". ";`.
  - The core characterization tests stay green with that fix.
  - The cms `bindings.test.ts` no longer pins the `..`.
- **BUG 8, admin (low):** `security/host/hooks/access-token-actions.ts:87`. The hook is publicly exported; if `setExistingField({rowId, patch:{token}})` runs while the stores are pending, the draft gets `name: ""`, and after load the editor shows "" instead of the saved name.
  - The failing test was kept out of the commit; it is in open-bugs.md.
  - Fix options: merge row defaults in `existingTokenDraft`, or ignore ids that are not in `rows`.
- **BUG 6** (cms provider-credential vault/store) is still open and was deliberately not touched.

## Independent test-integrity audit (read-only, all 5 A3 diffs)
- **Clean on:** production changes, removed or weakened assertions, skip/only/todo, ts-ignore, coverage-ignore, config edits, `vi.mock` of the unit under test, snapshot-only tests, the `tovu` string, secret-like values and duplicated tests.
- **Casts:** 80 `as never` / `as unknown as` casts. Most are partial fixtures, branded ids, or deliberate bad input to a runtime guard, each with a comment.
- **Issues found, and what happened to each:**
  1. admin `access-token-actions.unit.test.tsx:560` used `undefined as never` to fake an impossible dependency return. **Fixed:** it is now an honest direct `writeCredential` create path, and both guards turn it red under mutation.
  2. cms `publish-content.test.ts:219` only asserted `[]`. **Fixed:** a wired missing-blob case now gets an exact non-empty finding.
  3. cms `bindings.test.ts:201` pinned the double period. **Fixed in the test**, and the cause is reported as BUG 7.
  4. admin `other-credentials.unit.test.tsx:160` had an uncommented cast. **Comment added.**
  5. agentic `publication-filter.unit.test.ts:39,46` were refusal-only tests. **Fixed:** allow controls added, and an always-refuse filter now turns them red.
  6. plugins `discovery.unit.test.ts:54` returns early on a case-insensitive filesystem, so it passes silently on macOS. **Owner decision:** a visible skip would break the no-skip rule.
- **Kept but worth knowing:** ui's barrel `index.unit.test.ts` files are low-value but honest; they pin the exact export keys and the identity of each export. admin `seo-surface.unit.test.ts:139` sends `{title: undefined}` with an `as unknown as` cast, with a comment, to simulate a host compiled without `exactOptionalPropertyTypes`.

## For the owner to decide
1. **BUG 7 and BUG 8** (above). **BUG 6** is still open.
2. **EXCEPTION approvals:** every job ledger lists each one with its proof.
   - cms-3: 17
   - admin-8: 11
   - ui-1: 8
   - plugins-1: 7 files
   - misc-1: about 26 items
3. **REFACTOR candidates (dead or unreachable code):**
   - plugins: `runtime-reload.ts:37` `expectedDigest ?? preview.digest`. I recommend dropping it: it would silently weaken the preview-digest match.
   - plugins: `runtime-reload.ts:47-48` and `runtime-boot.ts:48`, where onDisabled never runs.
   - plugins: `runtime-core.ts:102-103`. An installDir of "/" refuses every uninstall; use a `path.relative` containment check.
   - agent-runtime: `acp/session-run.ts:461-467`.
   - ui: `CustomSelectMarkup.tsx` (imported nowhere in Jini or Tovu), `catalog-manifests` `load` and `scrollable:58`.
   - cms: the `pop()`-in-`while` guards, the providers-tools narrowing, and `video-transcode:53`.
   - admin: the taxonomy reset-effect ref checks (`use-term-detail-panel:86`, `use-merge-term-section:196`), and `access-token-stores.hooks` 16/25/34.
4. **cms no-domain export:** an *unclosed* ld+json script at the end of the document keeps url/@id. A test pins this current behaviour; confirm it is intended.
5. **cms `replace-media-file.ts:115`:** the sniffer always falls back to octet-stream. Was the declared content type meant to set the upload cap?
6. **Pre-existing reds on these branches, not ours:**
   - admin: `y5-live-secrets` and `y5-admin-surfaces` "plugin Add falls back…" (both AdminKitProvider)
   - chat: P26 and the interrupts test
   - agent-runtime: `loads-without-integrations`
   - cms: the BUG 6 vault test
   - ui: `media-providers missing-peer.test.ts`, a 5 s timeout flake under full-suite coverage load
7. **Still open from A2:** the product-name strings in two existing plugins tests (`module-snapshot.unit.test.ts`, `provider-contributions.unit.test.ts`).

## Process notes
- Only the coordinator pushed. Pushes happened about every 8 minutes, through the guarded script, after each subagent landed.
- One guard false positive: the words "as anything" matched `as any`. I fixed the regex.
- The two parallel slots avoided collisions by owning disjoint files. Each subagent kept scratch files under `/tmp/a3-<job>/` after an early clash in the shared scratchpad.

## Appendix: raw per-subagent tally
## cms-3 agent#1 (done ~00:25Z): 4dca3070 e707a239 d951a096 7329a2e5 | +35 tests, 0 removed | 100/100/100: forms tool-handlers.definitions, html/retry-draft; media site/duplicate-asset, blob-store.selection, site/import-video-conversion, site/promote-chat-attachment, site/blob-write-bindings, site/list-pending-chat-attachments; pages html-change-recording | publish-content S90.8/B76.4/F78.8 -> 100/98.9/93.9 | LEFT 56 files (measured 238 test files/2440 tests) | EXC proposed: publish-content.ts:286-287 (refactor: narrow restore deps), :231 defensive; library-save-attachment.ts:29 (?? null unreachable) | provider-credential-batch blocked by BUG 6; provider-credential-vault.test.ts pre-existing red | tip: --testTimeout=60000 --coverage.reportOnFailure
## misc-1 agent#1: 88c28699 01c988b2 755df334 | +26 tests, 0 removed | 100: agent-runtime runtime-port-bindings, runtime-strategies, json-line-stream, antigravity/index, claude config-dir/filesystem/mcp-config/mcp-delivery/mcp-json, codex isolation/mcp-delivery, opencode-acp, tool-turn (measured); closed by tests (not re-measured): claude-code-models, claude-filesystem-policy, claude-stream-frames, claude-stream-handler, diagnostics, model-discovery-yaml, model-discovery, native-permissions, native-tool-policy, acp/session-permission, antigravity/event-stream, codex/home-staging, providers/credentials; chat validate, chat-cleanup.hooks (measured), ChatCleanupPanel, checkpoint-interval, pointer, ChatSettingsSegmented | LEFT ~40 (chat ~23 branch-only incl ag-ui-transport 8; web-clone css-url/diagnostic-labels/recon-site unmeasured (src/skills excluded by config); agentic 11, analytics 6 unmeasured) | EXC: connection-test.ts:326-328, remotion assets, model-catalog-live-discovery.ts:94 | REFACTOR: acp/session-run.ts:461-467, acp/models.ts:465, ChatCleanupDialog.tsx:23, dom-page-driver.ts:703, acp/session.ts:209-211 (redundant try/catch) | pre-existing reds: agent-runtime tests/loads-without-integrations.test.ts (11, child stderr), chat durable-run-subscription.paths P26, ag-ui interrupts "hands an interrupt"
## admin-8 agent#1: cac7d15b 9bc18195 4b884365 7984a7ac 60d2dd8a f3b853c5 848ca2eb | +76 it lines, 0 removed (setup() signature widened) | 100: widgets/index.ts, security-i18n.ts, SeoIcons.tsx, AdminByokKeyPanel.hooks.ts, AccessTokenDialogs, AccessTokenFields, AccessTokenRows, AccessTokensGroups, AccessTokensTab, use-access-tokens.hooks (bindAccessTokens), access-token-refresh.hooks; closed access-token-actions 52/55/133/134, access-token-stores 15/33 | job total 93.88/92.45/90.05 -> 98.56/94.91/95.93 over 81 FILES; LEFT 59/81 | EXC/REFACTOR: access-token-actions.ts:87 | pre-existing red: y5-admin-surfaces.test.tsx "plugin Add falls back to Installed" (AdminKitProvider)
## plugins-1 agent#1: a8b63f24..4b40aec5 (12 commits) | +30 tests, 0 removed | whole suite 1231->1261, only red host-entry-purity timeout (env) | 37 FILES: 99.32 S / 98.58 B / 99.06 F / 99.32 L; 23 files 100/100/100; new 100: runtime-activation, archive-policy, runtime-conflicts, provider-contributions, contributions, provider-revision-watch, worker/start, runtime/install-source; runtime-boot L/B 100; runtime-core F 100 | LEFT 14 (tools/management 10 branch blocks not started; runtime-reload 37-39,74 + 2 onDisabled fns; module-snapshot 66,295; package-files 296; provider-host 127; discovery 186, 292-298) | new EXC: activation-polling:149 (stop clears interval same call), import-policy:122 default register (thread-wide loader hook) | REFACTOR: runtime-boot:48 onDisabled never runs
## ui-1 agent#1: 77694875 afe9b0f2 84705756 554d165f | +28 tests, 0 removed | 57 FILES scoped all=true: 97.26/98.3/98.1 -> 97.88/99.52/99.72 | new 100 (16): InfoTip.hooks, use-cursor-pages, useMediaProvidersTab, useProjectLocationsTab, NumberStepper, SketchEditor, TabStrip, shadcn select, execution/rules, select-popover, trim-chars, barrels app-shell/find-bar/number-stepper/resource-monitor/site-card (export-set+identity tests) | LEFT 11 = all EXC/REFACTOR/equivalent: EXC ExecutionTab.hooks:136, useReasoningControl:222, credential-card:45, integrations/rules:211-212, mcp-ui/fields:82-83; REFACTOR catalog-manifests load, scrollable:58, CustomSelectMarkup.tsx (0% dead, unimported); EQUIV editor-blocks:69, useTabStripDragReorder:73, use-optimistic-stored-value:50 | flake media-providers missing-peer.test.ts 5s timeout under load
## cms-3 agent#2: 6c1981c0..3f3d955d (13 commits on 7329a2e5) | +35 tests, 0 removed (7 deleted lines fixture refactors) | tsc clean at HEAD (3 commits committed before tsc; b20914b7/e6ded13d fix tsc errors) | new 100: fs-files/tool-registrations, html/site/safe-url, site-generation/provider-credential-save, site-generation/tool-registrations, site-import/bindings.deps, site/rendition-access, pages/html-document-store.memory | proposed EXC: navigation/site/publish-content:71; site-generation/providers-tools:188 (refactor exhaustive switch), :158-160 (narrow repo type); site-import/bindings:63 (drop base logEgressRefusal); site-import/tool-registrations:231; forms/site/publish-content:76/77 | LEFT 44
## misc-1 agent#2: a253d6e1 ff3291e2 64bef7f5 2ceb248f c3a31c5b e6230a1a | +34 it lines (chat), 0 removed | closed chat: ag-ui-transport, ag-ui-approval-relay, ag-ui-fetch-agent, transport.ts, messages.ts, browser-durable-subscription, durable-run-subscription, markdown-context, title.ts, ag-ui/event-projection, durable-runs/run-finalizer, accepted-input, ai-agent-presentation, ConversationList.tsx (100 or only REFACTOR branches) | REFACTOR: ag-ui-transport.ts:197,:218; ag-ui-approval-relay.ts:105; durable-run-subscription.ts:88,:107,:173; event-reduction.ts:88; ConversationList.hooks.ts:182,:189; use-ai-agent-presentation.hooks.ts:23 | LEFT chat: embed-send-bridge B86, frontend-invocation-handler B40/51/138, frontend-session-bridge B456/348, A2uiSurfaceCard.rules B14; agentic 11, analytics 6, web-clone 3 unmeasured
## plugins-1 agent#2: b5888849 c073a5bb 9db70657 5409316c | +16 tests, 0 removed | whole suite 1277 tests, only red host-entry-purity timeout (env) | 37 FILES: 99.47 S / 99.51 B / 99.06 F / 99.47 L; 27/37 at 100 | new 100: tools/management, node/module-snapshot, node/package-files, provider-host; discovery lines 100 (292-298 proven reachable via case-colliding folder names, test added) | DONE: left only owner items: REFACTOR runtime-reload.ts:47-48 + runtime-boot.ts:48 onDisabled dead; runtime-reload.ts:37 `expectedDigest ?? preview.digest` (recommend drop: weakens preview-match check); runtime-reload.ts:40 publisherId fallback | EXC: discovery.ts:186 O_NONBLOCK ?? 0 (Windows), activation-polling:149, import-policy:122, hook-registry:140, runtime-core 102-108, tools/contract, tools/index, PluginProviderSettingsDialog 139-141 (jsdom)
## admin-8 agent#2: 9c82f5d6 325c8a87 673f71e2 f8e2e0e8 3c260e07 646bac60 27f81d89 3acca323 d73b0c94 edaa8a8b | +52 it lines, 0 removed | 4 areas 518/519 (only y5-live-secrets known red), tsc clean | new 100 (17): DockLeadingAccessory, FolderDropNotice, FolderDropPathHint, FolderDropConfirmation, SubagentsIndicator, SelectedAgentPluginTray, DockHeader, DockHeaderTip.hooks, DockSettingsMenu, trash/rules.ts, AccessTokensTab.hooks (host), CopyKeysDialog, use-copy-keys.hooks, access-token-groups.hooks, access-token-rows.hooks, access-token-store-operations, other-credential-store-operations; Trash.tsx + use-trash.hooks L/F 100 | EXC: Trash.tsx:212, use-trash.hooks.ts:134 (refactor), use-other-credentials.hooks.ts:140 | REFACTOR: access-token-stores.hooks 16/25/34 | LEFT area: add-actions 54/105/119, replace-actions 31/41/81 (reload race), AgentFailureCard.hooks, AssistantDock.state.hooks, DockChatPane, MessageOverflowModal
## cms-3 agent#3: 5cd5f0bc 153f1858 cd32b7a7 8bd9ac77 dfb68e33 75794255 01b7f5fc b2ae043a 16dc7a16 86aaae23 fbc98746 ebdf86c5 | +30 tests, 0 removed, tsc clean each commit | new 100: fs-files write-files, native-folder-picker; media site-transform/image-ops, original-response, site/verify-published-media, site/view-image-tool; forms site/protect-existing-files, notify-subscriber, result-html, result-query, submission-email-validation; plus branches in forms portable-validation, repo.memory:149, submit-service | proposed EXC: forms/repo.memory.ts:103-104, forms/site/form-file-storage.ts:38, pages/authoring-html.ts:10, html/site/source-edits.ts:15, media/site/bootstrap.ts:84; candidate forms/write-service.ts:420 | LEFT 25 (+ provider-credential-batch BUG 6)
## misc-1 agent#3: 4ecdc260 61217274 7c5089a3 4f61462a 542f1e55 bb865e74 6ad70d7c | +35 it lines, 0 removed, tsc clean analytics+agentic | new 100: analytics projection, analytics-ingest, site/tool-registrations (privacy, product/index, config.settings already 100); agentic page-navigation, render-surface, use-skill-install.hooks, use-skills.hooks, site/install-tool; web-clone css-url.mjs, diagnostic-labels.mjs, recon-site.mjs (measured via CLI --coverage.exclude override; config untouched); dom-page-driver:703 proven reachable + covered | EXC: dom-page-driver:416-417 (jsdom no :modal), :549; publication-filter:97; installed-skill-tools:168 | REFACTOR: tool-registry-live-registration:36,:40; site/install-service:23; site/tool-registrations:154; installed-skill-tools:293; analytics visitor-analytics:36 | LEFT: chat embed-send-bridge B86, frontend-invocation-handler B40/51/138, frontend-session-bridge B456/348, A2uiSurfaceCard.rules B14
## admin-8 slot A agent#3: cf531fc8 f82e6710 0085d935 0379a268 | +19 it lines, 0 removed | new 100: AgentFailureCard.hooks, AssistantDock.state.hooks, DockChatPane, MessageOverflowModal, access-token-add-actions, access-token-replace-actions, access-token-stores.hooks | area 686/687 (y5-live-secrets known) | slot-A area DONE; EXC Trash.tsx:212, use-trash.hooks.ts:134, use-other-credentials.hooks.ts:140, access-token-actions.ts:87 (refactor: hook-direct replace renames to "")
## cms-3 agent#4: 5064108b a3338f2c 35317e1b 74a2c348 c253908c | +10 tests, 0 removed | video-frames.ffmpeg 100; import-media-entity, cover-image, video-transcode, media-service exceptions-only | EXC: cover-image.ts:129,:249 (pop in while), video-transcode.ts:53 (refactor: type string) | video-frames.ts:152 patch handed to cms-3b
## admin-8 slot B: b9be7426 adf4f4c6 dd87168a fbeff325 616191a1 2aea013c 9c25ab8b (cherry-picked onto codex/w62-cov-admin-8 -> 3819b9c3; tsc clean) | +44 it lines, 0 removed | area security/seo/workspace/webmcp 1123 tests, only y5-live-secrets red; area 100 L / 98.89 B / 100 F | new 100: security/react/live/Security.tsx; credential-failure, credential-forms.rules (68,69), custom-credential-forms, messages.en, rules, http adapter, access-token + root-key controllers (root-key-reveal 48); security/react index, CredentialEditor, OtherCredentialRow, SharedKeysDialog, other-credential-rows, AccessTokensTab/CredentialEditor/SecurityPage/SharedKeysDialog hooks; seo/adapters/memory; shared-keys close; workspace 77 | EXC: shared-keys.controller.ts:37 + root-key-reveal.ts:40 (catch-with-finally closing brace artifact), credential-forms.rules.ts:50, AccessTokensTab.tsx:46, webmcp-i18n.ts:68 | NOTE owner: seo-surface.unit.test.ts uses `as unknown as` cast (with comment) to send {title: undefined} as a non-exactOptional host would | LEFT: security/adapters/memory.ts 16 br, security-api.conformance 28, use-workspace 71, taxonomy rules 88, use-merge-term-section 196, use-term-detail-panel 86, use-term-picker 263/285/297/371/375 + fns creating/t
## cms-3 verify agent: ec8fda50 | +1 test (publish-content.ts:231 proven reachable: row deleted between import and read-back; EXCEPTION retired) | whole-job run at c253908c: 90 FILES, 2515 tests, only red = BUG 6 vault test; 54/90 at 100/100/100; other 36 = 16 EXCEPTION-only, 17 slot-B (in progress), 3 BUG 6
## cms-3 slot B: ef375fad f00b1366 857fa255 cc18ef50 (cherry-picked -> 1885df09; tsc clean) | +17 tests (incl. agent#4's video-frames:152 patch), 0 removed | new 100: export-html-policy, static-collections, blob-store.object-store, media/chat-preview, content-type-sniffer, versioned-repo, video-frames, mammoth, site/chat-preview, hydrate-blob-store-from-seed, site/public-path, generation-credentials, menu-render; arms closed write-service 420, style-values 132, media/tool-registrations 303 | EXC: replace-media-file.ts:115 (sniffer always falls back; owner: was declared type meant to set cap?) | NOTE owner: no-domain export keeps url/@id in an UNCLOSED ld+json script at document end (test pins current behaviour)
## misc-1 agent#4: 26dd6e1b 561253fb | +7 tests, 0 removed | new 100: embed-send-bridge, frontend-invocation-handler, A2uiSurfaceCard.rules; ChatCleanupDialog B17 closed | REFACTOR: frontend-session-bridge.ts:348 | FINAL whole-package runs: analytics 6/7, agentic 9/15, agent-runtime 29/40, chat 20/28 (pre-561253fb) = 64/90 at 100/100/100; all 26 others documented EXC/REFACTOR | job DONE
## cms-3 FINAL verify+challenge (no commits): head 1885df09, 90 FILES, 238 test files / 2533 tests, only red BUG 6 vault test | 70/90 at 100/100/100; LEFT 0; 3 BUG6 files; 17 EXCEPTION claims all CONFIRMED with file:line proofs (ledger "A3 section (final)") | job DONE
## admin-8 agent#4 fill+verify: 55cf08d4 944f80e6 67868a25 | +18 it, 0 removed, tsc clean | new 100: security/adapters/memory, security-api.conformance, use-workspace.hooks, taxonomy/rules, use-term-picker.hooks | FINAL verify 81 FILES (173 test files, 1812 tests; only red y5-live-secrets): 69/81 at 100/100/100; other 12 = L/F 100 + one EXCEPTION branch each; LEFT 0 | new EXC/REFACTOR: use-term-detail-panel.hooks.ts:86, use-merge-term-section.hooks.ts:196 (ref check in reset effect never true) | job DONE
## ui-1 exception challenge: 7c0e6807 56604dec | +3 tests, 0 removed, tsc clean | 3 claims were WRONG, now covered: use-optimistic-stored-value B50 (concurrent writer during in-flight save), editor-blocks B69 (trailing backslash; file branches 100), useTabStripDragReorder B73 (Text node EventTarget; file 100/100/100) | 8 CONFIRMED with proofs: ExecutionTab.hooks:136 (provider-catalog.ts:45), useReasoningControl:222, credential-card:45, integrations/rules:211-212, mcp-ui/fields:82-83, catalog-manifests load, scrollable:58, CustomSelectMarkup.tsx (unimported in Jini+Tovu)
## AUDIT (read-only, all 5 A3 diffs): no prod changes, no removed/weakened asserts, no skip/only/ignore/config edits, no vi.mock, no snapshots, no `tovu`, no secret-like values; 80 `as never`/`as unknown as` casts (mostly partial fixtures/branded ids/deliberate bad input to runtime guards, commented); verdicts cms-3 CLEAN(2 notes), misc-1 CLEAN(1), plugins-1 CLEAN(1), ui-1 CLEAN, admin-8 2 minor issues. Issues: (1) admin access-token-actions.unit.test.tsx:560 `undefined as never` fakes impossible dep return -> fix sent; (2) cms publish-content.test.ts:219 only asserts [] -> fix agent; (3) cms bindings.test.ts:201 pins double-period message from core/registration-kit.ts:372 -> BUG + test fix agent; (4) admin other-credentials.unit.test.tsx:160 cast -> comment; (5) agentic publication-filter.unit.test.ts:39,46 refusal-only -> fix sent; (6) plugins discovery.unit.test.ts:54 early-return on case-insensitive FS (silent on macOS) -> owner (no skips allowed); ui barrel tests low-value but honest.
## misc-1 exception challenge: 445468f2 82634f92 f049e136 0d1e9458 | +7 it lines + 2 allow assertions, 0 removed, tsc clean | 6 claims WRONG, now covered: chat use-ai-agent-presentation B23, ChatCleanupDialog B23 (aria-disabled kit button), frontend-session-bridge B348 (close() during headers()), agentic dom-page-driver B416 (browser without :modal), tool-registrations B154 (host deletes optional refresh hook), agent-runtime acp/session B211 (equivalent alone; red when both catches removed) | audit fix publication-filter allow controls done | rest CONFIRMED with proofs | REMAINING: 26 items, all EXC/REFACTOR
## cms-3 audit fix: 2b5f5cbc | publish-content.test.ts wired missing-blob case (no-op verifyApplied -> red); bindings.test.ts no longer pins ".." (two exact checks; mutation red) | BUG 7 (new, NOT fixed: core, cross-cutting text): packages/core/src/registration-kit.ts:371-372 decorateWithSchema builds `${message}. ${RETRY_IS_FUTILE}` -> "That address is not allowed.. Fix the input…" when message already ends in "."; proposed: sep = /[.!?]$/.test(message) ? " " : ". "; core characterization tests (gates.characterization:71/78/83) stay green.
## admin-8 exception challenge: 1bb1bec2 | 1 it replaced (cast test -> direct writeCredential create paths, both guards mutation-red), 0 net removed; other-credentials cast commented | BUG 8 (low, NOT fixed, owner decision): access-token-actions.ts:87 reachable via public export use-access-tokens.hooks: setExistingField({rowId, patch:{token}}) while stores pending -> draft name "" -> editor shows "" after load (the blank-name bug the doc says was fixed); failing test kept out of commit (snippet in report); fix options: merge row defaults in existingTokenDraft, or ignore ids not in rows | 11 others CONFIRMED (proofs); use-taxonomy:152 reachable but equivalent | admin-8 DONE
## plugins-1 exception challenge: 5af3f878 180a1871 | +4 tests, 0 removed, whole suite 106 files / 1281 tests all green | COVERED: import-policy.ts:122 (real node:module register hook; old reason wrong), PluginProviderSettingsDialog.tsx 139-141 (per-file `@vitest-environment jsdom` docblock, jsdom 26 already installed; no config/package change) | runtime-core.ts:102-103 reachable with installDir "/" (refuses every uninstall) - untestable safely (creates /-runtime as root) -> REFACTOR to path.relative containment | CONFIRMED rest | 29/37 at 100/100/100; 7 files left all EXC/REFACTOR
