Programmer(Execution): Programmer persona selected and loaded for the admin, site-key and migration items; its implementation/reuse discipline also governs this source audit.

# Admin, site-key and migrations dispatch — 2026-10-17

Inputs: `TRIAGE.md` rows s1-163, s4-03, s4-18, s4-19 and s1-170, and the corresponding original todo text. The live todo has been pruned concurrently: the former lines 355/366 are now 266/276 and the Categories/Recovery rows formerly at 1267/1276 are now 1021/1029. Use the triage IDs and titles as stable identifiers. No todo edits made.

ITEM 355: NOT DONE (rotation requires a durable cross-store cutover protocol; larger than M).
ITEM 1267: NOT DONE (both domain mutations are absent in the current Jini owner; the complete service/route/client/control/test slice is larger than a controls-only M).
ITEM 1276 — interrupted migration: NOT DONE (a separate unblock action needs a contract consistent with the existing restore-only resolution and restart gate; route decision goes to Coordinator).
ITEM 1276 — discarded-write-window counts: NOT DONE (there is no persisted per-category write-window source; implementing one and establishing its coverage exceeds M).
ITEM 366: DONE (old IDs mapped below to requirements, current owners, source evidence and remaining work; this is completion of the reconciliation audit, not a claim that all historical requirements are implemented).

Only this report was added. No production behavior or tests changed. No tests, typechecks, builds, servers, benchmarks, network commands, commits or pushes were run. Runtime and mutation results are deliberately unverified. Existing tests mentioned below were read, not executed.

## Reuse and scope decisions

Discovery used source reads and `rg`: no `search_graph`, `trace_path`, `get_code_snippet`, `query_graph` or `get_architecture` tool is exposed in this session. Searches stayed inside Tovu and Jini. The framework bootstrap, Programmer persona, architecture chapters 13/14, project memory, applicable ADR index and existing feature constraints were consulted. No framework, protected Fly/Shopify, shared registry or unrelated dirty source was edited.

### 355 — site-key rotation

Real flow: `SiteKeyTab.tsx` → site-key hooks/client → `routes/system/site-key.ts` → composed site-key recovery services → vault lifecycle and key-file writer. Existing recovery reseals credentials; rotation is not just a new button.

Reuse: credential resealing; searched Tovu's site-key recovery, vault recovery and Jini platform secrets for rotation/reseal; inspected `apps/website/src/server/runtime/composition/site-key-recovery.ts:79`, `apps/website/src/platform/db/vault-credential-recovery.ts:109` and `../Jini/packages/platform/src/secrets/credential-sets/vault.service.ts:270`; preserve these owners instead of adding a second encryption lifecycle.

Evidence and missing contract:

- `apps/admin/src/features/security/SiteKeyTab.tsx:29` explicitly excludes rotation; `apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:99` keeps Generate create-only. Generate must retain that contract.
- `site-key-recovery.ts:79` can reseal vault rows and `.storage-secret.json`. Its caller must take a restore point first; the operation is not a durable key-cutover journal.
- `vault-credential-recovery.ts:120` transacts row resealing, while `site-key-recovery.ts` separately rewrites the storage-secret file and `features/webhooks/site-key-ensure.ts:459` separately installs/stamps the key. A crash between these stores can leave some data under each key. Reusing the happy-path sequence does not establish restart recovery or concurrent-writer exclusion.
- `site-key-ensure.ts:450` explicitly refuses a different higher-precedence environment key. Keep that refusal; UI rotation cannot replace an env-set key.
- `features/publish-trust/keys.ts:80` documents that the site key derives the installation identity. `features/webhooks/keyring.env.ts:130` derives signing secrets from it. Inventory these effects before calling rotation complete; resealing database ciphertext alone does not preserve those contracts.

Coordinator follow-up: authorize a bounded rotation design covering preflight refusal of unreadable values, write exclusion, durable cutover/restart recovery, storage-secret handling, rollback, and the existing signing/installation identity semantics. Generic orchestration belongs in Jini with injected storage/key-install ports; site source order and CMS effects remain Tovu adapters. Then dispatch service/failure tests before route/hook/UI wiring. This report does not propose a new parallel owner or change any existing owner decision.

### 1267 — term reparenting and deprecation

Real flow: `Taxonomy.tsx` → `use-term-detail-panel.hooks.ts` → `TaxonomyPort` → rename route → `@jini-ai/cms/taxonomy` write service → site-bound repositories, transaction, revision, watermark and outbox.

Reuse: ordinary term metadata lifecycle and hierarchy validation; searched Tovu routes/hooks and Jini CMS taxonomy for reparent/deprecate/cycle/update; inspected `../Jini/packages/cms/src/taxonomy/write-service.ts:546`, `:560`, `:421`, `validation-chain.ts` and `apps/website/src/server/inbound/admin-http/routes/taxonomy/rename-term.ts:13`; the binding owner is the single taxonomy write service (`ADS-memory/reports/pipeline/018-categories-and-tags/adr.md:50`).

The current source exports create/import/rename/assign/unassign/delete, but no `reparentTerm` or `deprecateTerm`; `taxonomy/index.ts` in Tovu only re-exports Jini. `Taxonomy.tsx:48` discloses the omitted controls, and `hooks/taxonomy-port.hooks.ts:28` exposes only rename for term metadata. `importTerm` is not a substitute: it is an import/version contract and records an import, rather than reparent/deprecate semantics.

The original approved design is sufficient to specify semantics; there is no new product decision needed for whether deprecation blocks assignment. SPEC-018 explicitly makes it display/filtering only. The work is larger than the triage's apparent UI-only M: implement two missing Jini mutations, extend public exports, wire Tovu routes and error mapping, extend client/port/fakes, add hook controls and translations, and add domain/HTTP/hook/render tests. Jini's change also needs release/adoption because Tovu consumes published packages, not sibling source.

Coordinator follow-up: split into Jini owner-first mutation work and dependent Tovu UI/route work. Preserve the shared transaction in `renameTerm`, authorization before reads/writes, revision+watermark+outbox atomicity, hierarchy validation precedence, and arbitrary-depth/self-cycle refusal. Binding references: SPEC-018 CIC U-001/U-002 (`reports/pipeline/018-categories-and-tags/critical-internal-constraints.md`). Keep the separately assigned slug decision out of this work.

### 1276 — interrupted-migration unblock

Real flow: boot reconciliation → nonterminal migration row → `BLOCKED_PENDING_RECOVERY` → recovery status/banner → existing restore plan/disclosure/confirm/execute → Jini restore hooks → resolve run → restart if needed.

Reuse: interrupted-run resolution; searched reconciliation, restore hooks, status/banner, SPEC-019 API and recovery routes for unblock/markResolved; inspected `../Jini/packages/db/src/recovery/restore-hooks.ts:130`, `apps/website/src/server/inbound/admin-http/routes/recovery/restore.ts:146` and `apps/admin/src/features/recovery/Recovery.tsx:113`; the existing restore ceremony owns resolution, not a new status setter.

The disabled button is real. However `restore-hooks.ts:130` already identifies successful restore as ADR-041's resolution ceremony; it terminalizes the run at `:152`. The same code explicitly keeps the running process blocked when the adapter says `restartRequired`, because it still holds the old database inode. A route that merely calls `markResolved` or sets `SERVING` would reopen a half-migrated or stale database.

SPEC-019 asks for the single unblock action but its API specification does not define a separate unblock endpoint/transition. Existing migration-run lookup returns `{ id, status }`, not a safe automatically selected restore point (`../Jini/packages/db/src/recovery/reconcile-interrupted-migration.ts:33`). Do not select an arbitrary latest backup or bypass disclosure/confirmation.

Coordinator decision required: define whether the action only enters the existing restore-point selection/ceremony, or whether a distinct recovery operation is intended. The first can reuse all restore gates; the second needs an explicit recovery contract. Route that decision through the existing SPEC-019/ADR process. Binding records: GOV-ADR-001 (shared gated gateway), GOV-ADR-002 (one site lock), SPEC-019 CIC U-002 (server-owned plan plus disclosure acknowledgment), and the restart constraint in `restore-hooks.ts:140`. No alternate unblock path was added.

### 1276 — complete discarded-write-window counts

Real flow: disclosure route → Jini `computeDisclosure` → injected watermark source; composition currently injects `AlwaysUnavailableWatermarkSource` → counts are unknown. Status independently reports the same unavailable baseline.

Reuse: write-watermark/disclosure owners; searched both repos for category counts, watermark capture and write history; inspected `apps/website/src/platform/db/watermark-kernel.ts:8`, `apps/website/src/server/inbound/admin-http/routes/recovery/disclosure.ts:13`, `apps/website/src/server/runtime/composition/deps.ts:2400`, `../Jini/packages/db/src/recovery/lookup-adapters.ts:12` and `disclosure.ts:60`.

The watermark is a singleton counter. It does not attribute each increment to a category, restore window or deleted row. The injected stand-in explicitly documents the missing per-category tracker. `computeDisclosure` cannot derive counts by subtracting watermark values or counting current rows: repeated updates/deletes and cross-category transactions defeat those approaches. `partial: true` is a deliberate ADR-041/045 safety contract until write-path inventory proves completeness, not the defect to remove.

Coordinator follow-up: define the counted unit (writes, affected records or another documented measure), add persisted category attribution through the existing write chokepoint, cover all promised write paths, scope reads to the requested restore point, then share the real baseline source between disclosure and status. Generic source/orchestration belongs in Jini; category attribution belongs with the corresponding writes. This needs schema/retention and write-path work across domains and exceeds M. Preserve unknown for missing/old/unreadable baselines and retain partial coverage until proved exhaustive.

## 366 — old admin plan mapping and current-source audit

Historical requirement sources, used only to recover intent:

- `ADS-memory/.local-artifacts/archive/owner-worklist-retired-2026-10-04.md:2611`–`:2614` preserve the exact old queue, including the tooling reference.
- `ADS-memory/.local-artifacts/terra-admin-review-2026-09-20/plan-misc.md`, `plan-components.md`, `plan-content.md`, `plan-platform.md` define the numbered admin requirements.
- `ADS-memory/reports/2026-09-20-session-handoff-tovu-8a.md:59` and `:69` define tooling and the two security guards; `reports/2026-09-20-mutation-sweep-changed-files.md:166` supplies the lower-confidence mutation inventory.

Current implementation judgments below are source-only. **Present** means the requested mechanism is visible in the current source; **Partial/Open** names surviving work; **Superseded** means the old target no longer exists and its successor is identified. None means tests passed. Historical handoff success claims were not substituted for current evidence.

| Old ID | Recovered requirement | Current owner / source evidence | Audit disposition and remaining work |
|---|---|---|---|
| misc A1 | Translate redirect import parse errors | Jini `packages/admin/src/redirects/controllers/import-redirects.controller.ts:25` passes `t()` into `parseImportPayload`; Tovu `integrations/jini-admin/redirects-ports.ts:60` binds the existing dictionary; `features/redirects/redirects-i18n.tsx:46` contains both keys | Present for the two assigned parse errors. The old local hook moved into Jini; do not recreate it. Historical sitemap transport-error localization was inventory-only and remains a separate check. |
| misc A2 | Move sitemap title derivation out of markup | Jini `packages/admin/src/seo/react/hooks/SitemapModal.hooks.ts:24` owns `useSitemapPresentation`; Tovu `features/seo/index.ts:17` mounts the module | Present in successor. Existing JSX dispatch functions were explicitly excluded by the old plan; do not expand this ID to every `.tsx` helper. |
| misc F6a | Translate Observability | `apps/admin/src/features/observability/observability-i18n.ts:40` has a populated Spanish dictionary and the file contains the other locale blocks | Present dictionary mechanism; locale completeness/runtime rendering not executed. |
| misc F6b | Translate Playground | `features/playground/Playground.tsx:49` binds locale and translator; visible header/canvas/empty-state strings call it | Present. |
| misc F6c | Translate Skip to content | `apps/admin/src/App.tsx:696` uses `tApp`; `app-i18n.ts:25` supplies Spanish and other locale blocks | Present. The historical plan explicitly excluded pre-auth loading copy; it is not outstanding under this ID. |
| misc F7 | Remove SEO's false untranslated-tab comment | Old `features/seo/Seo.hooks.tsx` is absent. Jini `packages/admin/src/seo/react/hooks/SeoPorts.hooks.ts:19` describes injected host translation; Tovu `integrations/jini-admin/seo-module.hooks.ts:37` binds `createSeoTranslator` | Superseded by the module migration; do not restore the old file to edit a comment. |
| misc D1 | Remove unused PlaceholderTabs import | `apps/admin/src/panels.tsx` has only prose mentions, at `:771` and `:891`; no live import | Present removal. Orphan-component deletion was explicitly a separate owner choice. |
| components D1 / F6 | Translate BYOK migration/buttons/errors | `components/AdminByokKeyPanel.tsx:61`, `:79`, `:138`, `:216` now resolve locale and translate visible buttons | Present button/prompt wiring; full error-key/locale coverage remains unverified. Do not equate this with component D2. |
| components D1 / F7 | Dock missing keys, COMMON fallback, ChatFab hi/ur/bn, selected-plugin remove label | `components/ChatFab/ChatFab.tsx:49` owns locale templates and still lacks hi/ur/bn; `components/AssistantDock/assistant-dock-i18n.ts:1134` reads the chat dictionary with no general COMMON fallback; `SelectedAgentPluginTray.tsx:76`–`:77` still interpolate raw English `Remove` | Open at these three sinks. The dock chrome translator at `:527` does have COMMON fallback, but the chat-pane adapter is a different call path. Verify the historical ten missing keys against that adapter, not the chrome translator. |
| components D2.1 | Shared dictionary + Select/WidgetPickerDialog wiring | `components/shared-components-i18n.ts` and picker/select feature folders remain the host owners | Dictionary exists; this dispatch inspected D2.2–D2.7 sinks rather than certifying every D2.1 path. Keep any existing D2.1 closure provisional until direct caller/locale tests are executed. |
| components D2.2 | Translate WidgetConfigFields | `components/WidgetConfigFields/WidgetConfigFields.tsx:113`, `:220`, `:346` take/forward `t` | Translation mechanism present; complete dynamic field-label/error coverage unverified. |
| components D2.3 | Translate MediaPickerDialog | `components/MediaPickerDialog/MediaPickerDialog.tsx:68` uses the wired hook; `:82`, `:88`, `:123` translate title/loading/cancel | Present wiring. |
| components D2.4 | EmbedInsertControl copy + locale forwarding + helper placement | `components/EmbedInsertControl/EmbedInsertControl.tsx:200` translates visible copy, but `:80`/`:86` still hold non-JSX helpers; `.hooks.tsx:62`–`:64` call shortcut `useWidgetAddControl` with only `port` | Partial/Open: move the existing helpers with their rationale, and forward the resolved locale to pinned Form/Menu/Gallery controls so their error messages use the selected locale. Reuse the existing picker hook. |
| components D2.5 | ImagePreviewModal close-label localization | Generic owner `../Jini/packages/ui/src/features/admin-widgets/components/ImagePreviewModal.tsx:15` exposes `closeLabel`, defaulting to English at `:30` | Package seam exists. No host call-site closure established here; verify every live consumer supplies a translated label before marking end-to-end complete. |
| components D2.6 | Translate ExternalMcpToolPicker SeeMore labels | `features/settings/ExternalMcpToolPicker.tsx:130` uses Jini `SeeMore`; `:135` still supplies raw English `See more of …'s description` and no translated toggle labels | Open at the live sink; reuse SeeMore's existing label props, add locale entries and a consumer render test. |
| components D2.7 | Translate dirty-guard confirmation | Generic owner `../Jini/packages/ui/src/features/panel-kit/hooks/use-dirty-guard.hooks.ts:41` calls injected `translate`; host pages `use-page-editor.hooks.ts:1115`, posts `use-post-editor.hooks.ts:992`, menus `use-menu-editor.hooks.ts:275` pass `(key) => key` | Open host adoption. Reuse the current translation port; the generic guard already supports it. |
| components “D2.8” | Translate media/widget embed-extension copy after the seven planned commits | Original `plan-components.md:506` lists only seven D2 commits. `handoffs/2026-09-20-a3-write-components-i18n.md:165` appends embed-extension localization as a separate follow-up. Current owners: `apps/admin/src/lib/media-embed-extension.{tsx,hooks.ts}`, `widget-embed-extension.{tsx,hooks.ts}` | Resolved ID ambiguity: this is the handoff's extension follow-up, not a nonexistent eighth original plan commit. Keep its completion unverified; audit live node-view/controller text with the existing feature dictionaries. |
| content C / A3 | Accessible status selects | `features/pages/PageEditor.tsx:257` and `features/posts/PostEditor.tsx:983` have translated `aria-label` | Present for the cited targets. |
| content C / A1-pages | Translate PageEditor | `features/pages/PageEditor.tsx:158`, `:257` and surrounding markup use the editor translator | Original zero-translation finding is obsolete; whole-file locale parity still unverified. |
| content C / A1-collections | Translate validators and collection messages | `features/collections/CollectionEntries.tsx:29`, `:37` translate error copy; `features/collections/rules.ts:130` binds translation but `:135` still returns raw interpolated reserved-key English, through `validateNewContentTypeDraft` at `:217` | Partial: the reserved-key branch remains a concrete localization gap; verify remaining lifecycle templates through the existing collections dictionary. |
| content C / A1-menus-posts | Translate menu/post list and save text | `features/menus/MenuEditor.tsx:437` and `:448` use `t`; both menu and post hooks receive translators | Source mechanism present; historical copy inventory is not fully certified. Keep residual raw/interpolated messages in a localization follow-up. |
| content C / A2 | Move editor leave-guard handlers into hooks | Pages use `onBackLinkClick` (`PageEditor.tsx:157`, with only a forwarding arrow). `features/menus/MenuEditor.tsx:427` still calls `confirmLeave`/`preventDefault` inline | Partial/Open for menus. Keep documented module-level menu helpers out of scope; the original plan explicitly excluded them. |
| platform commit 2 | Keep webhook list visible after a failed row action | `features/integrations/rules.ts:124` returns toggle/delete errors even with loaded subscriptions; `features/integrations/hooks/use-integrations.hooks.ts:166` feeds those into `error`; `Integrations.tsx:159` returns immediately on `error` | Open/latent as in the original plan: retain loaded subscriptions and surface row failures without replacing the list; do not enable the deliberately inert webhook tab as part of this fix. |
| platform commit 5 | Move AgentPlugins confirm state/handlers into a hook | `features/plugins/AgentPlugins.tsx:371` declares `pendingDisable`; `:378` owns the handler; `:471`–`:482` render/confirm inline | Open. Extend/reuse the plugin feature's confirmation flow, preserve fresh-object lookup and both disable/remove variants. |
| platform commit 6 / D1 | Correct dead Database restore-point hook comment; separately decide deletion | The old hook trio is absent. `hooks/__tests__/content-refresh-coverage.unit.test.ts:74` states Recovery owns restore points; Recovery owns the live list/create/restore surface | Superseded by removal; no retired hook to edit. Do not remove live Recovery hooks. |
| tooling E.1 | Pass module-mock flag in mutation runner | `development/scripts/mutation-sweep.mjs:113` passes `--experimental-test-module-mocks` | Present; old omission is resolved in source. No mutation run performed. |
| tooling E.2 | Repair missing full-test baseline input | `package.json:40` still points `check:test-baseline` at `development/scripts/repo-test-failure-baseline.json`; that file is absent, while `route-test-failure-baseline.json` exists | Open. Full baseline capture/review is required; do not substitute the route-only file or fabricate a baseline. No tests permitted in this dispatch. |
| tooling B4–6 / guard 1 | Assert fail-closed signature decoding before crypto effects | `features/publish-trust/__tests__/keys-fail-closed-guard.unit.test.ts:46` asserts no crypto call for malformed key/signature; `keys.test.ts` is the existing broad suite | Tests now exist; old “untested” claim is stale. Execution/mutation effectiveness unverified. |
| tooling B4–6 / guard 2 | Assert run lookup workspace isolation | `features/publish-content/__tests__/run-repo.test.ts:10` identifies and tests the cross-workspace guard | Tests now exist; no fresh execution/mutation claim. |
| tooling B4–6 / lower-confidence survivors | Reconfirm historical §6b findings with explicit test paths | `reports/2026-09-20-mutation-sweep-changed-files.md:166` explicitly says these were not widened/rerun | Still unverified. The exact historical inventory is below; old survivor counts are not current defect counts. |

### Exact lower-confidence mutation inventory

Recovered from §6b rather than inferred from reused `B4` IDs elsewhere: `publish-trust/keys.ts`, `publish-content/run-repo.ts`, `agent-plugins/bundled-digests.ts`, `publish-trust/provisioning.node-io.ts`, `publish-content/ui/phase.ts`, `publish-content/ui/report-rows.ts`, `contracts/core/commands/revert.ts`, `contracts/core/model-facing-tool-errors.ts`, `origin/configured-origin.ts`, `publish-content/peer-url.ts`, `publish-content/planner.ts`, `publish-content/publish-readiness.ts`, `publish-content/report-labels.ts`, admin `lib/chat-attachment-liveness.ts`, desktop `project-ipc.ts`, and `publish-content/peer-transport.ts`. The report also separately marks admin `features/pages/lib/theme-page-publish-state.ts` provisional. The historical heading says “15 files,” but the table names **16 distinct files**; preserve the actual paths and do not use that heading as a current metric.

The keys/run-repo test additions above already falsify treating the old list as an untouched backlog. Further mutation verification must resolve moved owners and pass explicit current test files. It is intentionally not executed or declared complete by this dispatch.

### Actionable remainder, without changing the todo file

1. Translate SelectedAgentPluginTray remove copy, supply the missing ChatFab hi/ur/bn templates, and adopt COMMON fallback in the chat-pane adapter. Verify its missing-key inventory separately from the already-correct dock chrome translator.
2. Finish EmbedInsertControl helper placement and locale forwarding to shortcut picker controllers.
3. Localize current SeeMore accessible/toggle copy and dirty-guard host callbacks. Verify ImagePreviewModal consumers and the separate embed-extension follow-up.
4. Translate Collections' reserved-key error; finish menu back-link handler placement; verify the remaining content localization inventory.
5. Fix the Integrations row-error presentation and extract AgentPlugins' confirm flow, preserving their current behavior and feature ownership.
6. Capture/review a real whole-suite baseline when tests are authorized, then rerun the historical survivor inventory with explicit tests. Existing guard-test files are not new missing-test findings.

Architecture review: no new owner or boundary was introduced; source remained unchanged. Proposed future work points back to Jini taxonomy, Jini vault, Jini recovery/gated mutations, and the existing host translation ports. No CIC deviation was made. Pre-completion check: assigned titles reread, source references checked, protected/unrelated files untouched by this worker, and no test success claimed. Next assignee: Coordinator for the three design/sizing decisions and dependent bounded implementation dispatches; TestRunner only when the prohibition on test execution is lifted.
