REVISED r62t-rev-p2: 2 SOL sheets (1 Jini / 1 Tovu), 7 OPUS sheets

`W/` means Tovu `apps/website/src/`. `J/` means Jini `packages/`. Anchors are from merge-21, Tovu `7c87b3c3f9` and Jini `010c8cd87`. Changed anchors were checked against those trees. No files were changed and no tests, builds, installs, or type-checks ran.

These are P2 behavior changes. Do not move overlapping plugin, publish, post, or route files as part of this work. If an extraction lane lands first, follow the symbol to its new owner. Keep why-comments and `_optional = {}` pads. New functions take the two argument objects, stay within 80 lines and complexity 10, and keep the tighter 50-line limit in `agent-daemon-run-start.ts`. Keep Jini vendor- and server-framework-neutral and inject host effects. No P2 sheet requires a database migration.

P2-J1 is **DONE-ALREADY** and has no build sheet. Both seed catches use `describeSeedFailure` at `J/agent-plugins/src/lifecycle/seed-bundled.ts:188,301`. The exhaustive reason map and `instanceof` guard are at `:306–332`, and `lifecycle/__tests__/unit/seed-bundled-edges.unit.test.ts:148–168` pins the typed reason and path redaction.

## Jini SOL

### P2-T3.J — Make the publish catalog lead with scoped work

BUILDER: SOL  
Repo: Jini

In `publishContentAgentToolCatalog` at `J/cms/src/publish/content/agent-tools.ts:45–63`, keep the opening sentence at `:48` about the Publish dialog. Replace only the two following string fragments at `:49–50` with this exact string, including the trailing space.

```ts
"Call publish_content_status first to check whether publishing is ready. If asked to publish a specific item, resolve its exact key and pass it in items, such as \"page:<id>\"; types and items (exact title, slug, id or type:id) select only named items and excludeItems removes named items. If several destinations are saved, pass the chosen peerId; otherwise omit it for the connected destination. Publish everything pending only when the owner explicitly asks for everything. "
```

Keep `:51–53` byte-identical. Those lines cover overwrite, the human confirmation card, and verified live URLs. Keep the tool ID, schema, permissions, result fields, existing gateway why-comment, and empty-input handler behavior unchanged. Status checks readiness. It does not supply keys or peer IDs. Tovu supplies “this page” context in P2-T3.T.

Add `J/cms/src/publish/content/__tests__/agent-tools.test.ts` first. Import `publishContentAgentToolCatalog` from `../agent-tools.js` and `toolMetadata` from `../tool-metadata.js`.

- `publish guidance checks readiness and gives an exact item key before describing publish-all` locates the publish entry, requires all three phrases to exist, and asserts `indexOf("publish_content_status") < indexOf("items") < indexOf("everything pending")`. Pin the exact-key example and explicit request condition. Mutation `unfiltered-lead` restores the old fragments.
- `scoped guidance keeps the publish card and overwrite instructions` pins the unchanged wording and reads `{ class: "publish", confirmation: "policy" }` from `toolMetadata.publish_content_publish.approval`, not from the catalog entry. Mutation `drop-card-copy` removes the confirmation sentence.

Keep the existing `@jini-ai/cms/publish/content/agent-tools` export (`J/cms/package.json:1566`). No new callable, port, or intended API-baseline signature delta. Add `.changeset/p2-scoped-publish-catalog.md` with `@jini-ai/cms: patch`. Leave `api-baseline/jini-ai__cms.json` unchanged in the Sol job.

## Tovu SOL

### P2-T1.T0 — Forward the inactive-read option and pin the selected package

BUILDER: SOL  
Repo: Tovu

Replace only the resolver binding at `W/features/agent-plugins/automatic-agent-plugins.ts:125` with the equivalent of:

```ts
resolve: (
  { pluginId, ...request },
  { allowInactiveGuidance = false } = {},
) => resolveAgentPluginGuidance(
  {
    pluginRefIds: [pluginId],
    workspaceLayout: deps.agentPluginLayout.forWorkspace({
      workspaceId: deps.workspaceId,
    }),
  },
  { ...request, deliveryMode: 'inject', allowInactiveGuidance },
),
```

The second object is already part of the Jini `AutomaticAgentPluginPorts['resolve']` contract (`J/agent-plugins/src/lifecycle/automatic-use.ts:50`). An omitted option means `false`. Explicit inactive setup reads still pass `true`. Keep the injected Tovu resolver and workspace layout. Do not change ranking, maturity checks, permissions, or companion projection.

In `W/features/agent-plugins/__tests__/unit/bundled-kuinetic-package.unit.test.ts:23–42`, add `shipped kuinetic 0.1.1 declares ui-ux-design as a companion`. Read `path.join(PACKAGE_ROOT, "plugin.json")` from the selected package root. Parse the JSON with `parseAgentPluginManifest({ value })`, assert `ok`, then assert `manifest.version === "0.1.1"` and deep-equal `manifest.extensions.jini.companions` to `["ui-ux-design"]`. Mutation `drop-packaged-companion` deletes the field from the staged selected-package copy, not from Jini source. Do not add a duplicate Tovu fixture.

No dependency, public API, or manifest version change. P2-T1.T owns the runtime witnesses, including the only reliable pin for `force-inactive-read-true`.

## OPUS

### P2-J2.J — Separate guidance offers from delivery recording

BUILDER: OPUS  
Repo: Jini

In `J/agent-plugins/src/lifecycle/automatic-use.ts:57,148–288,331–360`, split resolution into a draft carrying plugin IDs and full text, and a delivery recorder. Reuse ranking, Ask/Auto consent, active-package admission, and the 24 KiB query cap. `offer` ignores `maxPromptArgBytes`. The blanket skip at `:283` stays only on legacy `prepare`, because P2-T4 sizes the variants at launch. Preserve byte-compatible one-shot output and its recording timing, capability backstops, Off mode, and consent and usage publication behavior.

Add shared data contracts beside `PrepareToolGuidance` at `J/core/src/contracts/site/daemon.ts:16`. Keep lifecycle implementation in agent-plugins.

```ts
export type AgentPluginGuidanceAttempt = {
  readonly runId: string
  readonly attempt: number
  readonly principalId: string
}

export type AgentPluginGuidanceOffer = {
  readonly offerId: string
  readonly fullSections: readonly {
    readonly pluginId: string
    readonly text: string
  }[]
  readonly fullPrefix: string
  readonly catalogPrefix: string
}
```

Add these methods to the existing controller. Use the same serialized queue for offers, commits, and explicit loads.

```ts
offer(
  required: {
    scope: AgentPluginGuidanceAttempt
    offerId: string
    input: { query: string; loaded?: readonly string[]; signal?: AbortSignal }
    isAttemptLive: (
      required: AgentPluginGuidanceAttempt,
      optional?: { signal?: AbortSignal },
    ) => Promise<boolean>
  },
  _optional = {},
): Promise<AgentPluginGuidanceOffer>

commit(
  required: {
    scope: AgentPluginGuidanceAttempt
    offerId: string
    deliveredIds: readonly string[]
  },
  optional: { signal?: AbortSignal } = {},
): Promise<{ readonly guidanceIds: readonly string[] }>
```

- The host injects the opaque offer ID and authoritative live-attempt check. Cache one current offer per logical-turn controller. Repeated offers for the same live attempt reuse the draft. An offer for a newer attempt on that turn deletes the older offer so the old scope’s commit refuses. The old scope cannot revive it.
- Draft full sections from the top match, its declared enabled companions, and up to three additional matches within the cap. `fullPrefix` contains those sections, catalog rows for the remaining enabled plugins, and the existing off note. `catalogPrefix` replaces all full sections with their catalog rows. Preserve existing order and pointer formatting. Offering may ask for consent or save an explicit Auto choice, but must not record or announce new delivery.
- A commit must match the stored scope and offer, be live at the recording boundary, and contain only unique offered IDs. Recheck enablement and exclusions for the selected IDs. A mismatch, abort, or unavailable selected ID refuses without partial recording. Empty commit is valid. Prior verified pinned or delivered IDs retain their existing behavior. New IDs enter `guidanceIds` only on successful commit.
- A repeat of `commit` with the same `scope`/`offerId`/`deliveredIds` returns the cached `{ guidanceIds }`. The same scope and offer ID with a different `deliveredIds` set rejects with `This guidance choice was already recorded for this turn.` A replay does not publish again and cannot bypass the live-attempt fence.
- Implement legacy `prepare` as an internal draft plus immediate record-all. Do not create a public offer or add a liveness dependency to that path. Explicit inactive guidance stays out of both recording paths. Preserve the why-comment that obtaining consent and resolving bytes do not prove full guidance was selected for delivery.

Add `J/agent-plugins/src/lifecycle/__tests__/unit/automatic-use.offer-commit.unit.test.ts` first.

| Witness | Mutation |
|---|---|
| `offer records nothing` | `record-on-offer` |
| `commit records only the ids passed` | `commit-every-offered-id` |
| `a deferred id never appears in guidanceIds until committed` | `offered-is-delivered` |
| `legacy prepare behaviour is unchanged` | `remove-legacy-argv-skip` |
| `an unoffered id refuses without recording delivery` | `accept-unoffered-id` with an otherwise valid live scope |
| `stale or foreign attempts refuse without recording delivery` | `skip-attempt-fence` with otherwise valid offered IDs |
| `the same commit publishes once and a changed replay is refused` | `replay-commit-publication` |
| `a plugin switched off after offer is not committed` | `skip-commit-admission-recheck` |
| `a replaced attempt cannot revive its offer` | `keep-old-offer-after-replacement` |

Use the existing `./lifecycle` and `./contracts/site/daemon` exports (`J/agent-plugins/package.json:171`, `J/core/package.json:699`). Add `.changeset/p2-guidance-offer-commit.md` with minor entries for `@jini-ai/agent-plugins` and `@jini-ai/core`. Run `pnpm api:update` and keep only the additive changes to their API baselines. Stop if the host cannot prove liveness for the exact principal and attempt at commit.

### P2-T4.J — Fit variants at the real argv boundary

BUILDER: OPUS  
Repo: Jini  
Depends on P2-J2.J.

Tovu builds the variants. Jini alone knows the image-path text, system-overlay transformation, resolved binary, and actual argument vector. Do not size early user text or call the argument builder repeatedly. The existing runtime-locked launch seam allows adapter effects (`J/daemon/src/agent-executor/launch.ts:1464–1496`).

Add optional `readonly argvPromptPosition?: 'last'` beside `maxPromptArgBytes` at `J/core/src/contracts/agents/definition.ts:470`. Declare it only on the current argv-bound definitions at `J/agent-runtime/src/defs/aider/index.ts:57–76`, `antigravity/index.ts:257–276`, and `deepseek/index.ts:35–54`. They already emit the prompt verbatim as the last argument. Change no argv bytes.

Extend `AgentExecutorRunInput` and the `run` optional-args `Pick` at `J/daemon/src/agent-executor/contracts.ts:143–168,253` with `argvPromptVariants?: ArgvPromptVariants`. The required `prompt` remains the base, including user history, site context, and mandatory pin and refusal content.

```ts
type ArgvPromptVariant = {
  readonly id: 'full' | 'catalog' | 'pointer' | 'base'
  readonly prompt: string
}

type ArgvPromptVariants = {
  readonly candidates: readonly ArgvPromptVariant[]
  readonly onSelected: (
    required: { runId: string; id: ArgvPromptVariant['id'] },
    optional?: { signal?: AbortSignal },
  ) => Promise<void>
}
```

In new `J/daemon/src/agent-executor/argv-prompt-variants.ts`, add private `selectArgvPromptVariant({ def, resolvedBin, baseArgs, baseComposedPrompt, candidates, compose, budget }, _optional = {})`. Inject the existing pure runtime budget predicates and a candidate composer that uses the same image-path and system-overlay transformations as the base. Return `{ id, prompt, args }` or the existing `RuntimePromptBudgetError`.

- In `launch.ts:1340–1360,1495–1559`, select **after the single `buildRunArgs` call** at `:1495` and **before the existing Windows check** at `:1549`. Wrap that check’s input with the selected argv. Do not call the effectful check per candidate. `guardWindowsCommandLineBudget` at `:741–750` stays the final guard. Candidate probes use the underlying injected UTF-8, Windows shim, and direct-exe predicates against the composed prompt, entire candidate argv, and actual resolved binary.
- Verify the declared last argument equals `baseComposedPrompt` before replacing it. Try `full`, `catalog`, `pointer`, then `base`. A carrier mismatch must never claim optional guidance fit. The unmodified base may proceed only if it passes the existing budget checks. No fit follows the existing `AGENT_PROMPT_TOO_LARGE` before-spawn path. Do not repeat adapter building, policy evaluation, or staging. Non-argv runs stay byte-identical. A future staged/stream carrier or argv definition with a subagent settings hook needs its own checked seam before opting in.
- Call `onSelected` after the candidate and final invocation have been validated and before spawn. Refusal uses the existing resource-release path and never spawns. Preserve the synchronous spawn/listener ordering. Do not log candidate text, real argv, or an unredacted callback error. Keep a why-comment that sizing must not repeat adapter effects.

**K1 preflight transport.** Add `J/daemon/src/http/agent-plugin-preflight.ts` and export it from the existing `./http` entrypoint. Use `import { defineJsonRoute } from '@jini-ai/http-kit'` (`J/http-kit/src/adapter.ts:23`, existing daemon dependency at `J/daemon/package.json:220`). Define `POST /internal/agent-plugin-preflight` with a narrow `AgentPluginPreflightRouteDeps` containing `prepare({ runId, mode }, { signal } = {})` and `commit({ runId, offerId, deliveredIds }, { signal } = {})`. Return typed results.

| Accepted body | Success response |
|---|---|
| `{ runId }` | Existing `{ prefix, refusalPrefix, pluginIds }` |
| `{ op: 'offer', runId }` | `{ prefix, refusalPrefix, pluginIds, offer }`, where `prefix` is pinned-only and `offer` is `AgentPluginGuidanceOffer \| null` |
| `{ op: 'commit', runId, offerId, deliveredIds }` | `{ pluginIds }` |

The spec never reads identity from the body. It dispatches only `runId`, `offerId`, and `deliveredIds` as body-derived inputs to the injected deps. Reject unknown fields, malformed IDs, and duplicate delivered IDs. The host supplies auth, live-run lookup, abort handling, and controller calls. The spec imports neither Express nor plugin implementation.

**Tests first.**

- Extend `J/daemon/src/agent-executor/__tests__/agent-executor.test.ts:3764–3822`. Add `argv alternatives use the real composed argument for both Windows carriers`, `argv fitting calls the adapter argument builder once`, `an argv carrier mismatch never claims full guidance`, and `a refused selection callback releases staging and never spawns`. Mutations are `skip-windows-argv-guards`, `rebuild-args-per-alternative`, `replace-unverified-last-argument`, and `spawn-after-commit-refusal`, respectively.
- Add a parameterized test under `J/agent-runtime/src/defs/__tests__/` named `the three argv-bound defs declare the prompt as last argv`. Assert the declaration, build args with each real definition and a probe prompt, and assert `args.at(-1) === prompt`. Add `argvPromptPosition is only declared on argv-bound defs` over `BASE_AGENT_DEFS` (`J/agent-runtime/src/registry.ts:52`). Mutation `declare-position-on-a-stdin-def` sets it on a `promptViaStdin: true` definition and fails the guard.
- Add `J/daemon/src/http/__tests__/agent-plugin-preflight.test.ts`. Pin `plugin preflight preserves the legacy wire shape and dispatches offer and commit separately` and `plugin preflight rejects callers trying to supply identity or duplicate ids`. In the latter, assert separate HTTP 400s for `principalId`, `attempt`, `workspaceId`, and duplicate delivered IDs. Mutations `alias-offer-to-legacy` and `allow-unknown-wire-fields` must fail.

Keep the existing daemon root and `./http` exports (`J/daemon/package.json:60,115`) and core `./contracts/agents` (`J/core/package.json:554`). No new subpath, no selector export, and no agent-runtime implementation import into daemon. Add `.changeset/p2-final-argv-fit.md` with minor entries for daemon and core and a patch for agent-runtime. Regenerate only affected API baselines.

### P2-T1.T — Prove inactive admission and companion delivery end to end

BUILDER: OPUS  
Repo: Tovu  
Depends on P2-T1.T0 and linked merge-21 Jini.

The production forwarding edit and package witness are in P2-T1.T0. Record the actual merge-21 baseline for `W/assistant/__tests__/automatic-agent-plugins.integration.test.ts`. The plan’s 41/2 baseline was from another tree. Tovu declares `^0.7.3-next.2` (`package.json:136`). Use the existing integration workflow to link the prefetched merge-21 Jini artifact. If only the old published artifact is available, stop on P7-J2.

- `an off plugin is not inlined by automatic delivery` flips activation **after ranking and before resolution**, or exercises the bound resolver directly on a now-off fixture with no second argument. An always-off fixture is insufficient because Jini already filters disabled candidates. Assert no full text and no new delivered ID. Mutation `force-inactive-read-true` restores the original adapter behavior and fails this witness.
- `an explicit load of an off plugin returns read-only guidance and grants no tools` extends the real executor case at `:340–373`. Assert off status, full read-only guidance, no delivered ID, and the same guarded write refusal before and after. Mutations `drop-explicit-inactive-option` and `record-inactive-read-as-delivery` fail.
- `kUInetic match delivers ui-ux-design as its companion in full and lists the rest as catalog lines` uses the actual linked manifests with the Tovu/Jini fixture at `:32–82`. Assert the full-text witnesses in order and only catalog rows for the remaining enabled fixtures. Mutation `erase-manifest-companions` fails.
- `a missing companion is skipped, never an error` omits the declared companion from that fixture and asserts the primary reaches the prompt while the missing ID is not delivered. Mutation `require-companion-to-resolve` fails.

If the deterministic race needs a direct seam, factor only the resolver at `W/features/agent-plugins/automatic-agent-plugins.ts:111–135` into `bindAutomaticGuidanceResolver({ workspaceLayout, resolveGuidance }, _optional = {}): AutomaticAgentPluginPorts['resolve']` in the same file. Pass the existing collaborators from `createEntry`. No extra companion projection, maturity bypass, or permission change. Explicit read-only setup guidance is not activation, authorization, or delivery.

### P2-T2.T — Survey first, write with a version, and keep the homepage staged

BUILDER: OPUS  
Repo: Tovu  
Land after P2-T1.T if the two are batched.

This changes heading slices in the packaged skill and the selected bundle’s bytes. Run the slice-based skill tests and the composed-bundle checks. Keep the theme and host overlays in Tovu.

- `content/agent-plugin-overlays/site-import/GUIDANCE.md:22–49`. State the public-URL order explicitly. Survey and classify read-only, stage away from the live homepage, verify the draft, then show the one existing cutover card naming the homepage address or replacement, menu placement, theme switch, and publication actions. Leave `/` alone without the approved switch. Add `pages_read_html` to the tool table and name `content_post_preview { id }` for draft preview. Keep `themeId` for screenshots of the inactive theme, not for `content_post_preview`, which does not accept it (`W/features/post/preview-tool.ts:17–30`).
- `content/agent-plugin-overlays/site-import/host/content-mapping.md:10–29,83–88`. Read the local-folder mapping before forming the cutover proposal when needed, without starting the public crawl. Replace the stale layout bullet with the versioned contract below. Use the same contract in Part B2.

  > For a layout page, create the draft with no body. Read it with `pages_read_html { id }`, then call `pages_write_html { id, html, expectedVersion }` using the returned `version`. Keep stable `data-agent-element="<handle>"` and `data-agent-role="region"` attributes on top-level sections. In a batch, count the page only when that item has `ok: true` and `result.written === true`. Report `written: false` and tool errors as not imported. Re-read and reconcile before retrying. Report warnings separately.

  The write success and refusal fields are at `W/features/pages/tool-registrations.ts:561–596`.
- `content/agent-plugins/tovu-theme/skills/tovu-theme/SKILL.md`, “Set expectations up front” and Part B at `:490–684`. Move `## Survey before you touch anything: pages, families, and cruft` (`:526`) immediately above `## B1 — One up-front choice` (`:492`). The Part B order is Survey, B1, What this job converts, B2, B3, B4. Update the opening summary and cross-references. Keep survey read-only, including reading the current homepage, menu, and theme. Before opening the card, put the actual proposed changes in its description. Keep exactly one `assistant_ask_choice`, the optional unchecked static checkbox, the submitted/declined semantics, and no writes before the card. Do not add an activation card or make an unnamed cutover. In B2 use the read/version/write/count contract. In B2 and B4 explicitly preview the draft with `content_post_preview { id }` before checking `/`, and check `/` only after the named switch has been approved and applied. Keep B3’s no-CMS-page rule, the inactive scaffold, and the Luvira, provenance, source-preservation, and active-theme template why-comments.
- `content/agent-plugins/tovu-theme/plugin.json:4`. Bump `1.1.3` to `1.1.4` exactly once. Update the version witness at `W/features/agent-plugins/__tests__/unit/bundled-tovu-theme-package.unit.test.ts:318`. Run `development/scripts/__tests__/bundled-agent-plugin-selection.test.ts` and `compose-bundled-agent-plugins.test.ts`, and re-pin only an actual changed digest if the composed-bundle gate reports one. Do not hand-edit a workspace’s `bundled-digests.json` or change Jini’s portable plugin version.

**Tests first.** Put the following witnesses in `W/features/agent-plugins/__tests__/unit/bundled-tovu-theme-package.unit.test.ts:269–332`. Assert order within the actual Part B slices. At `:287`, replace `partB.indexOf("## B1") < partB.indexOf("## Survey")` with the reverse order, checking both headings exist. Preserve the unchecked-box, cancellation, and single-card assertions.

| Witness | Mutation |
|---|---|
| `survey comes before the single choice card` | `card-before-survey` restores the old B1 position |
| `writes carry expectedVersion and count only written:true` | `omit-html-version` restores `{ id, html }`. `count-refused-body` counts outer `ok` alone |
| `draft homepage is previewed by entry id before / is checked` | `public-route-before-cutover` puts the route check before the named approved switch |
| `tovu-theme packages the versioned import recipe as 1.1.4` | `keep-theme-1.1.3` reverts the manifest bump |

Put the separate overlay-text witnesses in `content/agent-plugin-overlays/site-import/__tests__/site-import-overlay.test.mjs:38–94`. Pin the public-URL sequence in `GUIDANCE.md`, the versioned write and counting contract in `host/content-mapping.md`, and the entry-ID preview before the approved `/` check. The overlay suite does not read `SKILL.md`.

Markdown and manifest only. No tool signature, host port, route, or approval change. If staging would require an unlisted live write, leave it staged and report the limitation.

### P2-T3.T — Resolve “this page” to one exact key

BUILDER: OPUS  
Repo: Tovu  
Verify with P2-T3.J linked.

Edit only the publish paragraph in `overlayCatalogProtocol` at `W/server/inbound/assistant/assistant-system-overlay.ts:185–198`. Keep its existing signature, local-versus-live language, and explicit-overwrite instructions. Add this guidance.

> When asked to publish a named page or “this page”, call `publish_content_status` to check readiness. Use the current page’s actual entry ID. If it is missing, resolve and verify the page with `content_post_search` or `content_read.content_post`. Send only its exact `page:<id>` key in `items`. If several destinations are saved, pass the chosen saved `peerId`. If you cannot identify the page or destination, ask before publishing. Publish everything pending only when the owner asks for everything. Report only the live URLs the result verified.

`contributePagePublish` registers the `page` entity type at `W/features/post/publish-content.ts:613–614`. `publish_content_status` returns readiness only (`W/features/publish-content/tool-registrations.ts:377–380`). Do not invent a status field, send an unfiltered publish call to discover a destination, or fall back to a title after identifying the entry. Keep a why-comment that readiness says whether publishing is possible, not what the owner asked to send.

**Tests first.**

- In `W/server/inbound/assistant/__tests__/assistant-system-overlay.unit.test.ts:84`, add `publish this page resolves the current entry and sends only its exact page key`. Assert in both native-tool modes that readiness precedes key selection, `items` carries the exact key, and publish-all requires an explicit request. Mutation `use-publish-without-scope` restores the old paragraph.
- In `W/features/publish-content/__tests__/publish-tool.test.ts`, next to `:176`, add `one named item among other pending work → only that key reaches the confirmed plan`. Adapt the existing peer fixture at `:25–98` to advertise and pack a target `page:one` and a **same-title neighbour of a different `entityType`**. Call with `items: ["page:one"]`. Assert `f.staged.at(-1)?.map(({ entityType, id }) => \`${entityType}:${id}\`)` deep-equals `["page:one"]`. Also assert that only the target is written and only its verified live URL is reported. The initial dry plan may still inspect both. Mutation `drop-final-item-filter` must fail the exact last-bundle assertion, not merely a count.
- In the same file, add `publish_content_publish opens the approval card before any publish when the policy asks`. Use the peer fixture’s route deps and an actual `AssistantSurfaceDeps` exchange store. Select `publish_content_publish` from the real `buildPublishContentRegistrations({ routeDeps, surfaces }, {})` (`tool-registrations.ts:352–392`). Register it via `applyToolApprovalPolicy` and execute it using the exchange pattern in `W/assistant/__tests__/agent-plugin-executable-tools.characterization.test.ts:19–37`. Use the real registration, not that test’s stub. Call with the fixture’s owning principal and `items: ["page:one"]`. Wait for the real card, assert it shows the single key, and assert `f.staged` is empty and confirms and executes are zero. Cancel and assert no work. In a fresh execution and exchange, confirm as the owning principal and verify exactly the selected write. Mutation `bypass-publish-policy-wrapper` must fail. This characterization should be green on the linked baseline. If it is red, stop and hand off the approval finding without changing policy in this sheet.

No production signature, permission, schema, or host-port change. With the T3.J artifact linked, run `W/assistant/__tests__/moved-tools.golden.test.ts` with `MOVED_TOOLS_GOLDEN_WRITE=1` to re-record `fixtures/moved-tools.golden.json`. The changed description affects the aggregate catalog bytes at `:76`. Accept only the intended delta, not unrelated descriptor or card changes. This is not an architecture-baseline refresh.

### P2-T4.T — Compose final prompt variants and commit only the chosen IDs

BUILDER: OPUS  
Repo: Tovu  
Depends on consumable P2-J2.J and P2-T4.J.

**Turn owner.** At `W/features/agent-plugins/automatic-agent-plugins.ts:43–74,179–229`, extend the existing logical-turn owner with `offer({ runId, messageId, context, scope, offerId, isAttemptLive }, _optional = {})` and `commit({ scope, offerId, deliveredIds }, { signal } = {})`. Reuse principal, conversation, and turn binding and the pending-Ask lifecycle. Cache success per attempt. A replacement attempt does not inherit an old receipt. Retire stale aliases and their ability to commit. Keep one-shot `start` and tool-triggered `prepareGuidance` working.

**Host RPC.** In `W/server/runtime/composition/modules/assistant-tool-exec.ts:70–181,216–225` and `assistant-byok.ts:555,582–583`, mount the Jini spec at the existing path. Preserve the tool-execution token gate, 1 KiB body limit, no-store response, and disconnect behavior. Inject `prepare({ runId, mode }, { signal } = {})` and `commit({ runId, offerId, deliveredIds }, { signal } = {})`. `assistant-byok.ts` supplies `routeDeps.chatRunLedger.durable`. `findLiveSiteToolRun` calls `runStore.find({ runId }, {})` at `assistant-tool-exec.ts:220`, which returns the `DurableRunHead` (`J/chat/src/core/durable-runs/ports.ts:17,30,48`). Use its `recoveryCount` as `attempt`. Derive principal, workspace, logical turn, and run ownership only from the stored head. Create the opaque offer ID on the host. Re-read and compare that exact ownership after awaits and at commit. Old, stopped, and replacement attempts cannot commit another attempt’s offer. Preserve fail-closed pin refusal and safe diagnostic copy. No server-side secret or candidate prompt is logged on refusal.

**Daemon client.** At `W/server/inbound/assistant/agent-daemon-site-tools.ts:24,54,155–170`, retain `preflight({ runId }, { signal } = {})` and the legacy body. Add `offerPluginGuidance({ runId }, { signal } = {})` and `commitPluginGuidance({ runId, offerId, deliveredIds }, { signal } = {})`. Reuse authenticated, bounded, no-redirect transport and strict response schemas. Check that the call still belongs to the same live site-tools entry after awaiting it. Retry only a lost commit reply, **at most once**, using the exact same live attempt, offer, and IDs. Check the abort signal and live entry before retry. Never retry a stopped run, a refusal, or a different selection.

**Prompt and launch.** At `W/server/inbound/assistant/agent-daemon-run-start.ts:314–408` and `agent-daemon-run-launch.ts:24–34,65–83`, choose the preparation mode from the **selected** adapter after tool-access selection at `run-start.ts:345–347`. Do not use the original stored agent request. If the definition is unavailable, stop the optional variant path rather than guessing. Keep one-shot guidance for non-argv definitions. Build the base once from final selected history, page context, attachments, capability and refusal prefixes, and explicit pins.

Put variant assembly in new `W/server/inbound/assistant/agent-plugin-prompt-variants.ts`, exporting `buildPluginPromptVariants({ basePrompt, offer, discoveryPointer }, _optional = {})`. Keep functions in `agent-daemon-run-start.ts` at or below 50 lines. Use the existing prompt separator. Pass `full`, `catalog`, `pointer`, and `base` in that order to the executor. The pointer names `search_agent_plugin_local` starting at `offset: 0`, says to follow the returned `nextOffset`, and names the explicit loader. Do not trim history or explicit pins to fit optional text. The selection callback commits the full section IDs only for `full` and `[]` for each fallback. Do not count offered IDs as delivered or pass them to subagents in the existing carry IDs. None of the three current argv-bound definitions needs a subagent settings rewrite for this sheet.

**Tests first.** Extend the assembly fixture in `W/assistant/__tests__/automatic-agent-plugins.integration.test.ts:668–753` and the RPC suite at `W/server/runtime/composition/modules/__tests__/assistant-agent-plugin-preflight.integration.test.ts:19–135`. The Tovu fixture captures daemon input. Use the same offered content in P2-T4.J’s launch fixture with an injected platform to prove actual final sizing.

| Witness | Mutation or exact assertion |
|---|---|
| `exact fit inlines full guidance` | `argv-agents-always-use-catalog` |
| `one byte over falls back to the catalog` | `size-the-early-user-text-only` |
| `Windows quoting expansion is counted` | `skip-final-quoted-argv-check` |
| `catalog overflow uses paged discovery without dropping a pin` | `trim-pinned-prefix-for-catalog` |
| `a deferred id is absent from guidanceIds` | `commit-all-offered-ids-on-fallback` |
| `cached retry does not double-commit` | Lose the first reply and verify one retry and one publication. `bypass-commit-receipt` fails |
| `an aborted run never retries a lost commit reply` | Abort before the retry and assert one request only. `retry-after-abort` fails |
| `stopped and replaced attempts cannot commit a live offer` | `commit-by-run-id-without-live-attempt-fence` |
| `a recovered run's old offer cannot commit` | Capture the old offer, advance recovery so the store returns a bumped `recoveryCount`, and verify refusal and no delivery change |
| `the selected non-argv adapter still uses one-shot preflight` | `choose-preflight-mode-from-original-agent` |
| `preflight refusal logs neither server secrets nor candidate text` | Spy on `console.warn` in the RPC suite, following the mock at `:24–36`. Put distinct secret and candidate-text canaries in the injected refusal path and assert neither appears in warning arguments. Preserve safe warning diagnostics, as at `agent-daemon-run-start.ts:400–407` |

Preserve why-comments about cold versus resumed history, the refusal prefix, consent disconnect, and attempt ownership. At the launch boundary explain why prepared guidance is not delivered guidance. Tovu adds no package export. Verify with coherent linked Jini artifacts before changing registry pins. Registry promotion is P7-J2.

### P2-T5.0 — One lock ordering for layout migration, id-upgrade move, seed and restore

BUILDER: OPUS  
Repo: both

The plan’s STOP condition is met on merge-21. Tovu’s `seedWithIdUpgrade` moves packages before calling `owner.seedBundledAgentPlugins` (`W/features/agent-plugins/lifecycle.ts:197–214`). Jini then runs the layout migration inside seed (`J/agent-plugins/src/lifecycle/seed-bundled.ts:181–189`), via Tovu’s `migrateBeforeSeed` hook (`lifecycle.ts:124–130`). Layout migration takes the workspace `.agent-plugin-layout-migrated.lock` and takes `.plugin-state-<id>.lock` for individual package moves (`J/agent-plugins/core/persistent-state.js:226,302–317`). The publisher-ID move and restore do not share ownership across that window. In Jini’s `bundled-id-upgrade.ts`, the move dispatch is at `:75–90`, verified move and admission at `:99–115,126–134`, and restore at `:140–152`. At `:148`, restore swallows a failed rename and then reports `restored`.

**Change.** Put the workspace migration lock on the outside of one shared ordering, before any per-plugin lock. Share the same canonical workspace root and injected lock across the Jini owner and Tovu host. Hold workspace ownership from before the ID-upgrade move through seed and restore. Pass explicit, workspace-scoped ownership into the seed’s nested migration path so it can run under the already-held lock without acquiring it again. Direct migrations still take the same outer lock. Keep per-plugin locking under that order. Do not take a plugin lock and then enter a path that will reacquire it. Tovu’s site-wide migration enumerates workspaces (`W/features/agent-plugins/memory.ts:62–70`). Do not hold one workspace’s lock while acquiring another workspace’s lock through that loop.

Keep publisher ID, bundled ledger digest, repacked installed bytes, and canonical replacement verification. A held move must refuse seeding that ID. It must never put that ID through an alternate install path or relax verification. `restoreUnseededUpgrades` may report `restored` only after the required renames succeed. If one fails, leave the saved copy in place and report `held` or pending, not repaired. Keep the lock release on failure. Jini owns shared locking and verification, while Tovu injects its filesystem and lock effects, workspace layout, and rename map. Do not add journal writes in this sheet.

**Tests first.** Extend `J/agent-plugins/src/site/__tests__/bundled-id-upgrade.test.ts` for restore and add a Tovu lifecycle integration witness with the real lock adapter and a temporary workspace.

1. Start two real lock contenders for the same workspace. Hold the first at the move/seed/restore boundary and assert the second cannot enter `migratePluginLayout`’s work while the first owns the window. After release, assert the second proceeds. A fixture whose migration marker always makes it a no-op is not sufficient.
2. Drive the actual `migrateBeforeSeed` seam while the caller holds the lock. Assert seed reaches completion without reacquiring it. Mutation `reacquire-inside-seed` deliberately attempts the same acquisition and must deadlock or hit the test’s bounded timeout.
3. Force the restore rename to fail. Assert `restoreUnseededUpgrades` leaves the outcome `held` or pending, keeps the saved copy, and never returns `restored`. Mutation `swallow-restore-failure` reinstates `.catch(() => undefined)` at `:148` and fails.
4. Exercise a held move and assert the affected ID never reaches the seed/install call, while unrelated IDs retain their current behavior. Keep the existing verification-refusal witnesses.

Close this sheet only once the real-lock witnesses pass. If seed or migration cannot participate in the same ownership protocol, keep the journal blocked and report the exact re-entry or overlap. This is filesystem work. No database migration, ADR-066 N/A.

**Follow-on stub, not a separate runnable sheet — P2-T5.J/T.journal**  
BUILDER: OPUS  
Repo: both. Depends on P2-T5.0.

Under the verified workspace lock, add the workspace-scoped filesystem journal `.bundled-id-upgrade/journal.json`. Use the existing injected durable JSON writer pattern at `J/agent-plugins/src/lifecycle/update-store.ts:85`. Persist `{ pluginId, from, to, phase: "moving" }` atomically **before the first rename**. Advance through `moving | moved | seeded | restored` as the corresponding effects are verified. On restart reconcile nonfinal entries under the same lock. If the verified old root is still present, resume the move. If the saved root exists and the canonical copy is missing, restore. If the verified canonical copy is present, mark it seeded. A failed restore stays pending for the next boot. Keep held IDs out of seeding and do not weaken publisher, ledger, or installed-byte checks.

Tests first against the real filesystem path. `restart after each phase boundary converges to one jini/<id> copy` exercises interruptions before and after each rename. `a failed restore stays pending and is retried next boot` proves truthful recovery. `two concurrent boots do not double-move` exercises the shared lock. Persisting `moving` after the first rename must fail the restart witness. Filesystem journal only, no database migration, ADR-066 N/A.

Collect redacted historical digests and read-only legacy fixtures during P7’s real-site check before designing pre-layout or multi-revision recovery. Do not infer a historical digest or broaden what may be moved.
