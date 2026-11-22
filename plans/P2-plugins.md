# P2 · Agent plugins: guidance routing, recipes, seed upgrade

**Bases:** Tovu `41e948ee4` (content `748c032db`), Jini `6b8e0d48a`. `W/` = Tovu `apps/website/src/`, `C/` = Tovu `content/`, `J/` = Jini `packages/`.
**Leads:** `inputs/r62t-left.md` L2, L4-T1, L4-T2, L5, L7, L11; `inputs/r62t-route.md` T1–T3; `inputs/r62t-howto.md` W5–W6; combine-12 Tovu decision 4; combine-12 Jini decision 4.
**Owner rules:** as in P1 (simple; plain words; hooks as props; keep `_optional = {}` pads and the args rule; 50/80 lines; complexity ≤ 10; keep why-comments; Jini vendor/framework-neutral; nothing above domains; every agent CLI). Owner 11-21: routing = top match + its declared companions + up to 3 in full (~24 KiB) + 2–3-line catalog entry for every other enabled plugin; argv-bound agents = full guidance when verified headroom, catalog + on-demand fallback; site import never moves the homepage automatically.

## Goal
Tovu consumes Jini merge-12's companion routing and the inactive-guidance option correctly; the publish and import recipes say exactly what the tools need; argv-bound agents (Antigravity `maxPromptArgBytes: 30_000`) get full guidance when it fits at final prompt assembly; the bundled `tovu/<id>` → `jini/<id>` upgrade gets durable recovery; Jini's seed log names install refusals in plain words.

## Current state (verified)
- `W/features/agent-plugins/automatic-agent-plugins.ts:111` `createEntry`; `:125` `resolve: ({ pluginId, ...request }) => resolveAgentPluginGuidance(…, { deliveryMode: 'inject', allowInactiveGuidance: true, ...request })` — ignores Jini's new `options` and always reads off plugins. Jini contract: `J/agent-plugins/src/lifecycle/automatic-use.ts:50` `resolve(input, options?: { allowInactiveGuidance?: boolean })`; Jini only sets it for an explicit off-plugin read (`:321`). Effect today: automatic delivery can inline guidance of a plugin the owner turned off.
- **Correction to the lead:** L4-T1 says Tovu `tool-registrations.ts:104–110` preserves `companions`. On base, Tovu has **no** `companions` reference anywhere under `W/features/agent-plugins/` (grep). Jini's search handler loads its own candidates (`tool-registrations.ts:113` "KNOWN GAP"), so companions reach routing from Jini metadata; Tovu only needs to stop overriding the inactive option. P2-T1 must prove this with an integration test rather than add a projection.
- Overlay assembly: `W/features/agent-plugins/lifecycle.ts:145–161` `resolveHostPluginRefs` (maturity notices + overlay `GUIDANCE.md` + Jini prefix + file sections).
- Publish: `W/features/publish-content/agent-tools.ts:45–56` — "Omit filters to publish everything pending" is the lead sentence; "Waits for a human confirmation card". **Correction to L2 owner Q1:** the card does come from the approval policy, not the handler: `W/contracts/core/tool-metadata/publish-content.ts:51–58` declares `approval: { class: 'publish', confirmation: 'policy' }`; the handler test `publish-tool.test.ts:158` ("without a UI card") runs below the policy gate. The description is therefore not false; P2-T3 adds a registration-level witness instead of changing the promise.
- Import recipes: `C/agent-plugin-overlays/site-import/host/content-mapping.md:86–88` still says `pages_write_html { id, html }`; `C/agent-plugins/tovu-theme/skills/tovu-theme/SKILL.md:599–607` mentions versions but not `written:true`/refusal counting. `C/agent-plugins/tovu-theme/plugin.json:4` `"version": "1.1.3"`.
- Argv budget: `W/server/inbound/assistant/agent-daemon-run-start.ts:312` `prepareRun`, `:360` `assembleRunPrompt` (final prompt, `:378`), `:396` `prepareSitePlugins` → `siteTools.preflight({ runId })` (`:398`) runs **before** history/page context/attachments are assembled. Daemon RPC: `W/server/runtime/composition/modules/assistant-tool-exec.ts:102–108` (`/internal/agent-plugin-preflight`, body `{ runId }`). Jini checks: `J/agent-runtime/src/prompt-budget.ts:49` `checkPromptArgvBudget`, `:147` Windows `.cmd` shim, `:216` direct exe. Jini `automatic-use.ts:283` skips automatic full guidance whenever `maxPromptArgBytes` is set.
- Seed upgrade: `W/features/agent-plugins/bundled-id-upgrade.ts` (170 lines): `:36` `RENAMED_BUNDLED_PLUGIN_IDS`, `:40` backup dir `.bundled-id-upgrade`, `:76` `upgradeRenamedBundledPlugins`, `:101` `upgradeOne`, `:121` `bundledSourceId`; boot consumes `idUpgrades` at `W/server/runtime/boot/bootstrap.ts:386–387` (log only, transient). combine-12 fixed the missing `calendly`/`shopify` IDs.
- Jini seed log: `J/agent-plugins/src/lifecycle/seed-bundled.ts:186–187` and `:296–300` (`seedOne`) both use `describeErrorForLog` → "Error" for `AgentPluginInstallError` (`install-errors.ts:4` code union, `:20` class). Bug C025/C048.

## Steps

### P2-J1 · Jini · plain reasons for bundled install refusals (~1 h)
New internal `J/agent-plugins/src/lifecycle/install-error-reasons.ts` `describeInstallRefusal({ error }, _optional = {}): string | undefined` — exhaustive `Record<AgentPluginInstallErrorCode, string>`; `instanceof AgentPluginInstallError` only (an object with a `code` field falls through). Use it at both catches (`seed-bundled.ts:187`, `:300`), falling back to `describeErrorForLog`. Not exported from `lifecycle/index.ts`.
Sentences: `PLUGIN_ID_CONFLICT` → "A plugin with this name is already installed from a different publisher. Check the installed copy before trying again." Others: size/file-count limit, failed integrity check, invalid archive entry, missing or invalid `plugin.json`, could not save the verified package — one fixed sentence each, no paths/hashes/messages.
**Tests first** (`lifecycle/__tests__/unit/seed-bundled-edges.unit.test.ts`): `a typed PLUGIN_ID_CONFLICT reports the fixed sentence and the next plugin still seeds` (red: "Error"), `an integrity refusal reports its sentence without the canary message`, `an impostor object with code PLUGIN_ID_CONFLICT keeps the diagnostic path`. Add a type-level exhaustiveness case (`satisfies Record<AgentPluginInstallErrorCode, string>`).
Mutation: route the typed error back to `describeErrorForLog`. No i18n/API/catalog delta (log text).

### P2-T1 · Tovu · honour `allowInactiveGuidance` and prove companion delivery (~1.5 h)
`automatic-agent-plugins.ts:125` → `resolve: ({ pluginId, ...request }, { allowInactiveGuidance = false } = {}) => resolveAgentPluginGuidance(…, { deliveryMode: 'inject', allowInactiveGuidance, ...request })`. Recommendation adopted from combine-12 Tovu decision 4 (`?? false`). Nothing else in routing changes.
**Tests first** (`W/assistant/__tests__/automatic-agent-plugins.integration.test.ts`, which is BASE-RED 41/2 — record the two existing reds first and keep them unchanged): `an off plugin is not inlined by automatic delivery` (red now: `true` is forced), `an explicit load of an off plugin returns read-only guidance and grants no tools`, `kUInetic match delivers ui-ux-design as its companion in full and lists the rest as catalog lines`, `a missing companion is skipped, never an error`. `bundled-kuinetic-package.unit.test.ts`: pin kUInetic `0.1.1` and its companion.
Mutation: restore unconditional `true`.
Needs: the Jini `@jini-ai/agent-plugins` artifact from merge-12 linked (combine). STOP if only the published `0.7.3-next.2` artifact is available (it predates `companions`) — mark blocked on P7-J2 (Jini release).

### P2-T2 · Tovu · import guidance: survey before card, versioned writes (~1.5 h; after P2-T1 in the same implementer if batched)
Combines L4-T2 and the W6 half of L2. Files: `C/agent-plugin-overlays/site-import/GUIDANCE.md`, `…/host/content-mapping.md:83–96`, `C/agent-plugins/tovu-theme/skills/tovu-theme/SKILL.md:492–514,563–609`, `plugin.json:4` → `1.1.4` (one bump for both).
Words (from W6): "Read each page with `pages_read_html`. Send `pages_write_html { id, html, expectedVersion }` with that version and stable section handles. Count a page only after `written: true`. Report refusals as not imported, read again and reconcile before retrying, and mention warnings." Plus: read-only survey first; one approval card lists the exact homepage/menu/theme changes; preview the draft homepage by entry ID with `content_post_preview`, check `/` only after the approved switch.
**Tests first:** `C/agent-plugin-overlays/site-import/__tests__/site-import-overlay.test.mjs` and `W/features/agent-plugins/__tests__/unit/bundled-tovu-theme-package.unit.test.ts`: `survey comes before the single choice card`, `writes carry expectedVersion and count only written:true`, `draft homepage is previewed by entry id before / is checked`, version `1.1.4`. Red now: `{ id, html }` recipe.
Mutations: card before survey; count a refused body as saved. Catalog: plugin digest changes → `guard:plugins:catalog`-equivalent Tovu catalog test re-pin.
STOP if staging needs a live write the card did not list.

### P2-T3 · Tovu · scoped "publish this page" guidance (~1 h; parallel with P2-T2)
W5: `W/server/inbound/assistant/assistant-system-overlay.ts:184` `overlayCatalogProtocol` and `W/features/publish-content/agent-tools.ts:48–52`: replace "Omit filters to publish everything pending" with "For a named page or 'this page', call publish_content_status, then send its exact key in `items` (and `peerId` when there are several destinations). Publish everything pending only when the owner asks for everything. Report the live URLs the result verified." Keep overwrite and card sentences.
**Tests first:** overlay unit test and `publish-tool.test.ts`: `one named item among other pending work → only that key reaches the confirmed plan`; new registration-level case `publish_content_publish opens the approval card before any publish when the policy asks` (pins the metadata at `tool-metadata/publish-content.ts:58`; green expected — if red, STOP and raise it as a security finding). Mutation: restore the unfiltered lead sentence; drop the item filter at final planning. Golden: re-record `moved-tools.golden.test.ts` bytes.

### P2-J2 · Jini · two-phase guidance offer/commit for argv-bound agents (~2 h)
Add to `J/agent-plugins/src/lifecycle/automatic-use.ts` an **offer** that returns candidate full sections + catalog text without recording delivery, and a **commit({ runId, attempt, deliveredIds })** that records only the sections actually placed. Existing one-shot `prepare` stays (it becomes offer+commit-all), so non-argv hosts are unchanged. Remove the blanket skip at `:283` for callers that use offer/commit; keep it for legacy callers.
**Tests first** (`lifecycle/__tests__/unit/automatic-use.offer-commit.unit.test.ts`): `offer records nothing`, `commit records only the ids passed`, `a deferred id never appears in guidanceIds until committed`, `legacy prepare behaviour is unchanged`. Mutation: record on offer. API baseline: additive exports. STOP if commit cannot be bound to the live principal and attempt.

### P2-T4 · Tovu · fit guidance at final prompt assembly (~2 h; after P2-J2 is consumable)
Move the fit decision to `assembleRunPrompt` (`agent-daemon-run-start.ts:360`): get the offer at `prepareSitePlugins` (`:396`), assemble the final prompt (history, page context, attachments, refusal prefix), then choose: all full sections if `checkPromptArgvBudget` + the platform checks (`prompt-budget.ts:49,147,216`) pass on the **composed invocation**; else catalog-only; else the paged discovery pointer. Commit the chosen IDs over the existing RPC (`assistant-tool-exec.ts:102`, add `commit` body `{ runId, deliveredIds }`). Agents without `maxPromptArgBytes` keep today's path.
**Tests first** (extend `automatic-agent-plugins.integration.test.ts:697–753` fixture): `exact fit inlines full guidance`, `one byte over falls back to the catalog`, `Windows quoting expansion is counted`, `a deferred id is absent from guidanceIds`, `cached retry does not double-commit`. Red now: preflight sizes before final assembly. Mutation: size the early user text only.
STOP if the selected agent definition is not known at assembly time. Function-size watch: `agent-daemon-run-start.ts` functions must stay ≤ 50; split a `fitPluginGuidance` helper.

### P2-T5 · Tovu · durable bundled-ID upgrade (~2 h)
L11 "journal and interruption recovery" only (the two other L11 items are owner/fixture-blocked, see questions). Write a workspace-scoped journal `.bundled-id-upgrade/journal.json` (atomic write via the existing durable JSON helper) **before** the first rename: `{ pluginId, from, to, phase: 'moving'|'moved'|'seeded'|'restored' }`; on boot, reconcile any non-final entry (old root present → resume move; saved root present and canonical missing → restore; canonical present → mark seeded). `restoreUnseededUpgrades` reports `restored` only after the rename succeeds. Hold the existing lifecycle lock across move→seed→restore.
**Tests first** (`bundled-id-upgrade.unit.test.ts`): `restart after each phase boundary converges to one jini/<id> copy`, `a failed restore stays pending and is retried next boot`, `restored is not reported when the rename fails` (red now), `two concurrent boots do not double-move`. Mutation: write the journal after the first rename.
STOP if Jini's layout migration can run inside the same window without the lock — report the overlap.

## Owner questions (recommendations)
1. Persistent publisher-update list: keep one entry per workspace + transition, unresolved visible until resolved, resolved kept as history? **Recommend yes**; build after P2-T5.
2. Multi-revision/pre-migration upgrade: needs real historical digests and legacy fixtures from the owner's 0.7.2 sites (OWED-LOCAL, P7). **Recommend** collecting them during the P7 real-site check before planning code.

## Chrome / Electron owed
Assistant run on a site with kUInetic + UI/UX Design on → both delivered; turn UI/UX Design off → not inlined; ask "publish this page" → card lists one page; Antigravity run with a long history still gets catalog lines; boot a 0.7.2 site, kill during upgrade, reboot → one `jini/<id>` copy.

## Dependencies / batches
- Batch A (parallel): P2-J1, P2-J2 (Jini).
- Batch B (parallel): P2-T1 (needs merge-12 Jini artifact), P2-T3, P2-T5. P2-T2 after P2-T1 (same files family).
- P2-T4 after P2-J2 is linked/released.

## Estimate
~11 h (J1 1, J2 2, T1 1.5, T2 1.5, T3 1, T4 2, T5 2).
