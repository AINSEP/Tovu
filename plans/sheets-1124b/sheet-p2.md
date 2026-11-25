SHEETS r62t-sheet-p2 PARTIAL: 6 todo / 1 done / 0 obsolete; 3 SOL sheets, 4 OPUS sheets

## Step status

`W/` is Tovu `apps/website/src/`. `J/` is Jini `packages/`. Line numbers refer to Tovu `7c87b3c3f9` and Jini `010c8cd87`. The six todo steps include partial work and the blocked journal. This was a read-only source check. No files changed and no tests, builds, installs, or type checks ran. The dispatched clone also lacks the referenced `ADS-memory` architecture files, so the sheets use the supplied owner rules and the P2/P9 plans.

| Step | Status | Merge-21 proof and remaining work |
|---|---|---|
| P2-J1 | **DONE-ALREADY** | Jini `0afe5e25e` fixed the defect. Both target catches use `describeSeedFailure` at `J/agent-plugins/src/lifecycle/seed-bundled.ts:188,301`. Lines 306–332 have an exhaustive code-to-copy map, an `instanceof` guard, and the existing fallback for other errors. The tests at `lifecycle/__tests__/unit/seed-bundled-edges.unit.test.ts:148–168` pin the typed reason and path redaction. The landed copy differs from the old proposed sentence, but delivers the same fix without assuming every identity conflict is a publisher mismatch. No sheet. |
| P2-J2 | **TODO** | `J/agent-plugins/src/lifecycle/automatic-use.ts:175–237` still records during one-shot preparation. Line 283 skips query full text for argv-bound agents. No offer/commit API. |
| P2-T1 | **PARTLY-DONE** | Jini owns companion routing at `automatic-use.ts:70–80,278–288`, with tests at `automatic-use.unit.test.ts:689–728`. Its kUInetic manifest already ships `0.1.1` and declares `ui-ux-design`. Tovu already has the explicit off-plugin/read-only case at `W/assistant/__tests__/automatic-agent-plugins.integration.test.ts:340`, but the adapter still forces `allowInactiveGuidance: true` at `W/features/agent-plugins/automatic-agent-plugins.ts:125`. The forwarding fix and host-level witnesses remain. |
| P2-T2 | **PARTLY-DONE** | The portable Jini recipe already surveys read-only and uses one exact cutover card at `J/agent-plugins/site-import/skills/site-import/SKILL.md:117–138,197–209`. Tovu already protects the current homepage and menu and says to preview by entry ID. The local-folder recipe still says to ask **before** surveying (`content/agent-plugins/tovu-theme/skills/tovu-theme/SKILL.md:492–494`), its HTML write is underspecified at 595–601, and the overlay still gives `{ id, html }` at `content/agent-plugin-overlays/site-import/host/content-mapping.md:86`. |
| P2-T3 | **PARTLY-DONE** | Approval already exists at `J/cms/src/publish/content/tool-metadata.ts:51–58`, with a Tovu policy-card characterization and scoped handler tests. The moved Jini catalog still leads with unfiltered publish at `J/cms/src/publish/content/agent-tools.ts:48–52`. Tovu’s overlay at `W/server/inbound/assistant/assistant-system-overlay.ts:185–198` still omits the named-page sequence. Also, `publish_content_status` returns readiness, **not** item keys or a destination list (`W/features/publish-content/tool-registrations.ts:377–380`). |
| P2-T4 | **TODO** | Tovu still requests one-shot preflight before final history, page context, and attachment notices (`W/server/inbound/assistant/agent-daemon-run-start.ts:329,354,362–408`). Its existing DeepSeek case at `W/assistant/__tests__/automatic-agent-plugins.integration.test.ts:697–729` pins the current catalog-only behavior. The real platform checks run farther downstream in Jini, after image handling and after argv construction. |
| P2-T5 | **PARTLY-DONE · NOT-SHEETED** | The verified move and rollback already moved to `J/agent-plugins/src/site/bundled-id-upgrade.ts:70–167`. There is no durable journal. Failed restore renames are swallowed before reporting `restored` at 140–152. Merge-21 meets the plan’s explicit **STOP** condition for layout migration overlap. The evidence and unblock are below. |

The sheets are P2 behavior changes only. Do not move the overlapping plugin, publish, post, or route files as part of this work. Use the merge-21 anchors to locate the owning seam if an extraction lane lands first. Retain existing why-comments and `_optional = {}` pads. New functions use object arguments and stay within 80 lines and complexity 10. Keep the tighter 50-line target for run-start helpers.

## Jini SOL

### P2-T3.J — Make the publish catalog lead with scoped work

**BUILDER: SOL · Repo: Jini**

**Change** `J/cms/src/publish/content/agent-tools.ts:45–63`. In `publishContentAgentToolCatalog`, replace the unfiltered lead and reorder the description. Keep the tool ID, schema, permissions, destination behavior, `excludeItems`, overwrite caveat, confirmation sentence, and result fields unchanged. Use neutral wording:

> Call `publish_content_status` first to check whether publishing is ready. If asked to publish a specific item, resolve its exact key and pass it in `items`, such as `"page:<id>"`. If several destinations are saved, pass the chosen `peerId`. Publish everything pending only when the owner explicitly asks for everything. Report verified live URLs from the result.

Do not say the status tool supplies keys or peer IDs. Do not change the meaning of empty input at the handler. Keep the why-comment about the existing plan/confirm/execute gateway. The shared catalog explains shared behavior. Tovu injects the “this page” context and its own tool instructions through its overlay in P2-T3.T.

**Tests first** in new `J/cms/src/publish/content/__tests__/agent-tools.unit.test.ts`:

- `publish guidance checks readiness and gives an exact item key before describing publish-all` — assert ordering as well as the explicit request condition. Mutation `unfiltered-lead` restores the old sentence and fails the test.
- `scoped guidance keeps the publish card and overwrite instructions` — pin the existing wording and the `publish`/`policy` metadata. Mutation `drop-card-copy` removes the confirmation sentence and fails the test.

**Signature, exports, release** No new callable or host port. Keep `@jini-ai/cms/publish/content/agent-tools` at `J/cms/package.json:1566` unchanged. Add `.changeset/p2-scoped-publish-catalog.md` with `@jini-ai/cms: patch`. No intended API-baseline signature delta. Check `api-baseline/jini-ai__cms.json` without regenerating unrelated entries.

## Tovu SOL

### P2-T2.T — Survey first, write with a version, and keep the homepage staged

**BUILDER: SOL · Repo: Tovu**

**Change these files:**

- `content/agent-plugin-overlays/site-import/GUIDANCE.md:22–49`. State the public URL order explicitly. Survey and classify read-only, stage without altering the live homepage, verify the draft, then show the one existing cutover card naming the exact homepage address or replacement, menu placement, theme switch, and publication actions. If there is no approved switch, leave `/` alone. In the table, add `pages_read_html` and name `content_post_preview { id }` for the draft. Keep the current screenshot instruction for `themeId` when viewing an inactive theme. `content_post_preview` itself does **not** accept `themeId` (`W/features/post/preview-tool.ts:17–30`).
- `content/agent-plugin-overlays/site-import/host/content-mapping.md:10–29,83–88`. Read the local-folder mapping before forming the proposed cutover when needed, without starting the public crawl. Replace the stale layout recipe with `pages_read_html { id }`, then `pages_write_html { id, html, expectedVersion }`, where `expectedVersion` is the returned `version`. Keep stable `data-agent-element` and `data-agent-role="region"` handles. In a batch, count a layout page only when that item has `ok: true` **and** `result.written === true`. Report `written: false` or a tool error as not imported, then re-read and reconcile before retrying. Report warnings separately. The actual refusal and success fields are at `W/features/pages/tool-registrations.ts:561–596`.
- `content/agent-plugins/tovu-theme/skills/tovu-theme/SKILL.md:44–48,490–575,583–609,671–684`. Move the read-only survey above B1’s card and update the summary and cross-references. Keep the single optional static checkbox unchecked, the same submitted/declined semantics, and no writes before the local-folder card. Before opening it, read the current homepage, menu and theme and populate the card description with the actual proposed changes. No additional activation card and no unnamed cutover. Apply the same read/version/write/count recipe to B2. Explicitly call `content_post_preview { id }` before checking `/`. Keep B3’s no-CMS-page rule, the inactive theme scaffold, and the existing provenance and active-theme template why-comments.
- `content/agent-plugins/tovu-theme/plugin.json:4`. Bump `1.1.3` to `1.1.4` exactly once. Update the package witness at `W/features/agent-plugins/__tests__/unit/bundled-tovu-theme-package.unit.test.ts:318`. The packaged bytes and digest change. Verify against the existing Tovu composed-bundle selection and packaging tests under `development/scripts/__tests__/`, and re-pin only an actual changed digest if that gate reports one. Do not hand-edit a workspace’s `bundled-digests.json` or change Jini’s portable plugin version.

**Tests first** in `content/agent-plugin-overlays/site-import/__tests__/site-import-overlay.test.mjs` and `W/features/agent-plugins/__tests__/unit/bundled-tovu-theme-package.unit.test.ts:269–332`. Assert order within the actual procedure sections, not anywhere in the file.

| Test name | Mutation that must fail it |
|---|---|
| `survey comes before the single choice card` | `card-before-survey` restores the old B1 order. Update the existing unchecked-box test to keep its checkbox and cancellation assertions. |
| `writes carry expectedVersion and count only written:true` | `omit-html-version` restores `{ id, html }`. `count-refused-body` changes the success rule to outer `ok` alone. |
| `draft homepage is previewed by entry id before / is checked` | `public-route-before-cutover` moves the route check before the named approved switch. |
| `tovu-theme packages the versioned import recipe as 1.1.4` | `keep-theme-1.1.3` reverts the manifest bump. |

**Signature and injection** Markdown and manifest only. Existing tool signatures, host injection, routes and approvals stay unchanged. Keep the Luvira and source-preservation why-comments. If staging would require an unlisted live write, leave it staged and report the limitation.

### P2-T3.T — Resolve “this page” to one exact key

**BUILDER: SOL · Repo: Tovu · Verify with P2-T3.J linked**

**Change** `W/server/inbound/assistant/assistant-system-overlay.ts:185–198`. Keep the existing private `overlayCatalogProtocol` signature and edit only its publish paragraph. Text to add:

> When asked to publish a named page or “this page”, call `publish_content_status` to check readiness. Use the current page’s actual entry ID. If it is missing, resolve and verify the page with `content_post_search` or `content_read.content_post`. Send only its exact `page:<id>` key in `items`. If several destinations are saved, pass the chosen saved `peerId`. If you cannot identify the page or destination, ask before publishing. Publish everything pending only when the owner asks for everything. Report only the live URLs the result verified.

`page:<id>` is the actual page contributor key (`W/features/post/publish-content.ts:382,613–614`). Status is a read-only readiness check. Do not invent a status field, send an unfiltered publish request to discover a destination, or use a title as a fallback after finding the ID. Keep the local-versus-live and explicit-overwrite guidance. Why-comment: readiness identifies whether a publish is possible, not what the owner asked to send.

**Tests first:**

- `W/server/inbound/assistant/__tests__/assistant-system-overlay.unit.test.ts:84` — `publish this page resolves the current entry and sends only its exact page key`. Assert in both native-tool modes that readiness precedes key selection, `items` carries the key, and everything pending requires an explicit request. Mutation `use-publish-without-scope` restores the old overlay paragraph.
- `W/features/publish-content/__tests__/publish-tool.test.ts:176` — `one named item among other pending work → only that key reaches the confirmed plan`. Use the existing peer fixture with the target page and a pending neighbor, preferably a same-title item of a different kind. Pass `items: ["page:one"]`. Assert only the target is in the **confirmed** bundle and final writes and only its verified URL is reported. Mutation `drop-final-item-filter` omits the selector from the final scoped plan. The initial dry plan may still inspect multiple pending items.
- Same test file, use real `buildPublishContentRegistrations({ routeDeps, surfaces }, {})` (`tool-registrations.ts:352–391`) and wrap the actual registration with the host’s `applyToolApprovalPolicy`, using the exchange setup at `W/assistant/__tests__/agent-plugin-executable-tools.characterization.test.ts:22–37`. Name the witness `publish_content_publish opens the approval card before any publish when the policy asks`. Assert that the card carries the single key, and there are no peer stages, confirmations or executions while it is open. Cancel and assert no work. In a fresh call, approve as the owning principal and assert exactly the selected write. This witness should be green on baseline. Mutation `bypass-publish-policy-wrapper` fails it. If baseline is red, stop and hand off the approval finding rather than changing policy in this sheet.

**Signature and injection** No production signature, dependency, permission or schema change. The host continues to supply its approval surface and peer ports. Re-record `W/assistant/__tests__/fixtures/moved-tools.golden.json` via its existing `MOVED_TOOLS_GOLDEN_WRITE=1` test after linking Jini. The changed description contributes to aggregate catalog bytes at `moved-tools.golden.test.ts:76`. Do not bless unrelated descriptor or card changes.

## OPUS

### P2-T1.T — Forward the explicit inactive-read option

**BUILDER: OPUS · Repo: Tovu · Reason: guidance admission boundary**

**Change** `W/features/agent-plugins/automatic-agent-plugins.ts:111–135`. The resolver passed to `createAutomaticAgentPluginUse` must take both existing argument objects:

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
)
```

Use the existing typed port. The host injects the Tovu overlay-aware resolver and workspace layout. If the deterministic race test needs a direct seam, factor only this adapter into `bindAutomaticGuidanceResolver({ workspaceLayout, resolveGuidance }, _optional = {}): AutomaticAgentPluginPorts['resolve']` in the same file. Have `createEntry` pass the existing collaborators. Do not add another companion projection, a maturity bypass or a tool-permission change.

**Tests first** in `W/assistant/__tests__/automatic-agent-plugins.integration.test.ts:32–82,340–373`. Record the actual merge-21 baseline when running the suite. The old plan’s 41/2 result was on another base.

- `an off plugin is not inlined by automatic delivery` — include an activation flip **after ranking and before resolution**, or exercise the bound resolver directly on a now-off fixture with no second argument. Always-off-only is not a sufficient red because Jini already filters disabled candidates. Assert no full text or new delivered ID. Mutation `force-inactive-read-true`.
- `an explicit load of an off plugin returns read-only guidance and grants no tools` — extend the existing real executor case at 340. Assert the off status and full read-only guidance, no delivered ID, and the same guarded write refusal before and after. Mutations `drop-explicit-inactive-option` and `record-inactive-read-as-delivery`.
- `kUInetic match delivers ui-ux-design as its companion in full and lists the rest as catalog lines` — seed the actual linked manifests into the real Tovu/Jini fixture. Assert full-text witnesses in order, and only catalog rows for the non-inlined enabled fixtures. Mutation `erase-manifest-companions`.
- `a missing companion is skipped, never an error` — leave the declared companion out of the fixture. Assert the primary reaches the prompt and the missing ID is not delivered. Mutation `require-companion-to-resolve`.
- In `W/features/agent-plugins/__tests__/unit/bundled-kuinetic-package.unit.test.ts:23–42`, add `shipped kuinetic 0.1.1 declares ui-ux-design as a companion`. Read the resolved packaged `plugin.json`, not a duplicate Tovu fixture. Mutation `drop-packaged-companion`.

**Dependency and why** Tovu still declares `^0.7.3-next.2` (`package.json:136`) and this dispatch has no installed package. Run the witnesses with the prefetched merge-21 Jini artifact linked through the existing integration workflow. If only the old published artifact is available, stop on P7-J2. Explicit read-only setup guidance is not activation, authorization or delivery.

### P2-J2.J — Separate guidance offers from delivery recording

**BUILDER: OPUS · Repo: Jini · Reason: live principal and attempt binding**

**Change** `J/agent-plugins/src/lifecycle/automatic-use.ts:57,148–288,331–357`. Reuse the ranking, Ask/Auto consent, active-package resolution and 24 KiB query cap. Split resolution into a draft that carries complete text with plugin identity, and a recorder. Keep one-shot `prepare` byte-compatible, including the legacy argv skip, capability backstops, Off mode, and the consent/usage publication rules.

Add these shared data contracts to `J/core/src/contracts/site/daemon.ts` beside `PrepareToolGuidance:16`. The lifecycle implementation remains in agent-plugins.

```ts
type AgentPluginGuidanceAttempt = {
  readonly runId: string
  readonly attempt: number
  readonly principalId: string
}

type AgentPluginGuidanceOffer = {
  readonly offerId: string
  readonly fullSections: readonly { readonly pluginId: string; readonly text: string }[]
  readonly fullPrefix: string
  readonly catalogPrefix: string
}
```

Add to the existing controller return object:

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

Host injects the offer ID and authoritative live-attempt check. Store at most one current offer per logical turn controller. Cache repeated offers for the same live attempt and retire the offer when a replacement attempt takes ownership. The old scope must not be able to revive itself. Use the existing queue for offer, commit and explicit load.

- A draft uses the plan’s existing top match, declared enabled companions and up to three more within the byte cap. `fullPrefix` is full sections plus catalog rows for the remaining enabled plugins and the existing off note. `catalogPrefix` omits all full sections and includes their catalog rows. Preserve pointer formatting and ordering. Keep consent effects separate from delivery. Offering can ask the person or save their explicit Auto choice, but must not record or announce any new guidance delivery.
- A commit must match the stored scope and offer, be live at the recording boundary, and contain only unique offered IDs. Recheck enablement and exclusions for chosen IDs. Mismatch, abort, changed selection on replay, or an unavailable selected ID refuses without partial recording. Repeat of the same commit returns the same successful result without another publication. Empty commit is valid. Prior verified pinned or delivered IDs keep their existing behavior. The new offered IDs become visible in `guidanceIds` only on successful commit.
- Implement legacy `prepare` as an internal draft plus immediate record-all, without creating a public offer or requiring liveness injection. Keep its existing output and usage timing. Keep explicit inactive guidance out of both recording paths. Why-comment: consent and resolved bytes are both necessary, but neither alone proves the model received the full text.

**Tests first** in new `J/agent-plugins/src/lifecycle/__tests__/unit/automatic-use.offer-commit.unit.test.ts`:

| Test name | Mutation that must fail it |
|---|---|
| `offer records nothing` | `record-on-offer` |
| `commit records only the ids passed` | `commit-every-offered-id` |
| `a deferred id never appears in guidanceIds until committed` | `offered-is-delivered` |
| `legacy prepare behaviour is unchanged` | `remove-legacy-argv-skip` |
| `unknown ids and stale or foreign attempts do not record delivery` | `skip-attempt-fence` and `accept-unoffered-id` |
| `the same commit publishes once and a changed replay is refused` | `replay-commit-publication` |
| `a plugin switched off after offer is not committed` | `skip-commit-admission-recheck` |

**Exports and release** Existing `./lifecycle` in `J/agent-plugins/package.json:171` and `./contracts/site/daemon` in `J/core/package.json:699` suffice. No new subpath. Add `.changeset/p2-guidance-offer-commit.md` with minor entries for `@jini-ai/agent-plugins` and `@jini-ai/core`. Update their API baselines with `pnpm api:update`, retaining only the additive surface changes. Stop if the host cannot prove liveness for the exact principal and attempt at commit.

### P2-T4.J — Fit the variants at the real argv boundary

**BUILDER: OPUS · Repo: Jini · Reason: exact launch composition and effect ordering · After P2-J2.J**

The old plan places the decision in Tovu’s `assembleRunPrompt`. That is where Tovu should **build the variants**, not claim they fit. Jini still adds image-path text, resolves the system overlay and builds actual argv. A preflight estimate would miss those bytes. Calling `buildArgs` repeatedly is also unsafe. The launch seam explicitly allows runtime-locked side effects (`J/daemon/src/agent-executor/launch.ts:1464–1496`).

**Change** `J/core/src/contracts/agents/definition.ts:470` to add optional `readonly argvPromptPosition?: 'last'`. Declare it only on the three current argv-bound definitions, which already write the prompt verbatim as the last element. Anchors are `J/agent-runtime/src/defs/aider/index.ts:57–76`, `antigravity/index.ts:257–276` and `deepseek/index.ts:35–54`. Do not change their existing argv bytes. Keep the daemon vendor-neutral.

**Change** `J/daemon/src/agent-executor/contracts.ts:143–168` and `launch.ts:1340–1360,1495–1559`. Add `argvPromptVariants?: ArgvPromptVariants` to the optional argument object of `run(required, optional = {})`. The required `prompt` is the undecorated-by-automatic-guidance fallback, with user history, site context and any mandatory pinned/refusal content intact.

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

Add a private helper in new `J/daemon/src/agent-executor/argv-prompt-variants.ts` with `selectArgvPromptVariant({ def, resolvedBin, baseArgs, baseComposedPrompt, candidates, compose, budget }, _optional = {})`. Inject the existing launch-port budget predicates and a pure candidate composer that uses the same image-path and overlay transformations. Return `{ id, prompt, args }` or the existing `RuntimePromptBudgetError`. Build base arguments once under the existing lock. Check the declared last argument matches `baseComposedPrompt` before replacement. For each candidate, check composed UTF-8 bytes, then both existing Windows guards on the entire candidate argv and actual resolved binary. Use full, catalog, pointer, base order. No fit means the existing `AGENT_PROMPT_TOO_LARGE` before-spawn path. Do not call `buildArgs` for alternatives, re-run policy or staging, or change the synchronous spawn/listener ordering. If the carrier does not match, never claim any optional text fit. Non-argv runs remain byte-identical. A future staged/stream prompt or argv definition with a subagent settings hook needs its own checked seam before opting in.

Run `onSelected` only after the final candidate and invocation are validated, before spawn, and use the existing resource-release path if the callback refuses. Never log the candidate prompt, real argv, or an unredacted callback error. Why-comment: this is the single point that knows the effective binary and every argument, and a sizing probe must not repeat adapter effects.

**K1 transport spec.** Add `J/daemon/src/http/agent-plugin-preflight.ts` and export it through the existing `./http` entrypoint. Use `defineJsonRoute({ method: 'post', path: '/internal/agent-plugin-preflight', parse, handle }, options)` with a narrow `AgentPluginPreflightRouteDeps` of `prepare({ runId, mode }, { signal } = {})` and `commit({ runId, offerId, deliveredIds }, { signal } = {})`. Return typed results. Accept exactly legacy `{ runId }`, `{ op: 'offer', runId }`, and `{ op: 'commit', runId, offerId, deliveredIds }`. Legacy success is the existing `{ prefix, refusalPrefix, pluginIds }`. Offer adds `offer: AgentPluginGuidanceOffer | null` and uses `prefix` for the pinned-only base. Commit returns `{ pluginIds }`. Reject extra identity fields, malformed IDs and duplicate delivered IDs. The host mounts the spec and injects auth, live-run lookup, abort handling and controller calls. No Express or plugin implementation import in the spec.

**Tests first:**

- `J/daemon/src/agent-executor/__tests__/agent-executor.test.ts:3764` — `argv alternatives use the real composed argument for both Windows carriers`, `argv fitting calls the adapter argument builder once`, `an argv carrier mismatch never claims full guidance`, and `a refused selection callback releases staging and never spawns`. Mutations `skip-windows-argv-guards`, `rebuild-args-per-alternative`, `replace-unverified-last-argument`, and `spawn-after-commit-refusal`, respectively.
- New `J/daemon/src/http/__tests__/agent-plugin-preflight.unit.test.ts` — `plugin preflight preserves the legacy wire shape and dispatches offer and commit separately` and `plugin preflight rejects callers trying to supply identity or duplicate ids`. Mutations `alias-offer-to-legacy` and `allow-unknown-wire-fields`.

**Exports and release** Existing `@jini-ai/daemon` root and `./http` (`J/daemon/package.json:60,115`), and core `./contracts/agents` (`J/core/package.json:554`). No new subpath and no export for the selector helper. Add `.changeset/p2-final-argv-fit.md` with minor entries for daemon and core and a patch for agent-runtime. Regenerate affected API baselines only. The runtime ports already have the three check implementations. Do not add `./prompt-budget` or import agent-runtime implementation into daemon.

### P2-T4.T — Compose real prompt variants and commit only the chosen IDs

**BUILDER: OPUS · Repo: Tovu · Reason: authenticated, retry-safe commit · After P2-J2.J and P2-T4.J are consumable**

**Change these seams:**

- `W/features/agent-plugins/automatic-agent-plugins.ts:43–74,179–229`. Extend the existing logical-turn owner with `offer({ runId, messageId, context, scope, offerId, isAttemptLive }, _optional = {})` and `commit({ scope, offerId, deliveredIds }, { signal } = {})`. Reuse the principal/conversation/turn binding and pending-Ask lifecycle. Keep successful offer bytes cached per attempt, not shared as a commit receipt across attempts. Keep `start` and tool-triggered `prepareGuidance` working unchanged for one-shot callers. Retire stale attempt aliases and their ability to commit.
- `W/server/runtime/composition/modules/assistant-tool-exec.ts:70–181,216–225` and the composition at `assistant-byok.ts:550,582`. Mount the Jini spec at the current path with the existing tool-execution token gate, body limit, no-store response and disconnect behavior. Inject `prepare({ runId, mode }, { signal } = {})` and `commit({ runId, offerId, deliveredIds }, { signal } = {})` into the spec. Derive the principal, workspace and attempt from `findLiveSiteToolRun`, never from request JSON. Use `DurableRunHead.recoveryCount` as `attempt`, and bind the offer to the stored `runId`, principal, and existing logical turn. The host creates the opaque offer ID and injects the live lookup into Jini. Recheck the same live ownership at commit after any await. An old, stopped or replacement attempt cannot commit another attempt’s offer. Keep existing fail-closed behavior for a refused pin and existing safe error copy for preflight.
- `W/server/inbound/assistant/agent-daemon-site-tools.ts:24,54,155–170`. Keep `preflight({ runId }, { signal } = {})` for the old body, and add `offerPluginGuidance({ runId }, { signal } = {})` and `commitPluginGuidance({ runId, offerId, deliveredIds }, { signal } = {})` bound to the existing live site-tools entry. Use strict response schemas and the existing authenticated transport, bounded read and no-redirect behavior. Verify the request still belongs to the same entry after awaiting it. Retry a lost commit reply only with the exact same attempt, offer and IDs. A different selection is not a retry.
- `W/server/inbound/assistant/agent-daemon-run-start.ts:314–408` and `agent-daemon-run-launch.ts:24–34,65–83`. Base the mode on the **selected** adapter after tool-access selection at 345–347, rather than the original stored agent request. If its definition is unavailable at assembly, stop this optional path rather than guessing. Keep one-shot for non-argv definitions. Build the base once from the final selected history, page context, attachments, capability and refusal prefixes, and explicit pins. Add `buildPluginPromptVariants({ basePrompt, offer, discoveryPointer }, _optional = {})` to assemble the optional prefixes with the existing separator helper. Supply the highest-to-lowest candidates to the executor. Fallback is all catalog rows, then a compact `search_agent_plugin_local` pointer with `offset: 0` and `nextOffset` plus the explicit loader, then base if even the pointer cannot fit. Never trim history or an explicit pin to make optional text fit. Pass the matching full section IDs only for the `full` selection, and `[]` for all fallbacks. Existing subagent carry IDs must not treat an offer as delivery. None of the three current argv-bound adapters requires a subagent settings rewrite in this sheet.

**Tests first:** extend `W/assistant/__tests__/automatic-agent-plugins.integration.test.ts:668–753` and the real RPC suite at `W/server/runtime/composition/modules/__tests__/assistant-agent-plugin-preflight.integration.test.ts:39–135`. The old fixture only captures daemon input, so it is useful for prompt assembly assertions, but not proof of the final Windows check. Use the P2-T4.J launch fixture for that assertion, with the same offered content and an injected platform.

| Test name | Mutation that must fail it |
|---|---|
| `exact fit inlines full guidance` | `argv-agents-always-use-catalog` |
| `one byte over falls back to the catalog` | `size-the-early-user-text-only` |
| `Windows quoting expansion is counted` | `skip-final-quoted-argv-check` |
| `catalog overflow uses paged discovery without dropping a pin` | `trim-pinned-prefix-for-catalog` |
| `a deferred id is absent from guidanceIds` | `commit-all-offered-ids-on-fallback` |
| `cached retry does not double-commit` | `bypass-commit-receipt` |
| `stopped and replaced attempts cannot commit a live offer` | `commit-by-run-id-without-live-attempt-fence` |
| `the selected non-argv adapter still uses one-shot preflight` | `choose-preflight-mode-from-original-agent` |

**Why and rollout** Keep the comments explaining cold versus resumed history, the refusal prefix, the consent disconnect, and attempt ownership. Add one comment where the offer crosses the launch boundary explaining why prepared is not delivered. Tovu adds no package export. Verify with the linked coherent Jini artifacts before changing registry pins. Promotion to a registry build is P7-J2. No database schema change is required by any of these sheets.

## P2-T5 lock stop

**P2-T5.J and P2-T5.T are NOT-SHEETED.** `W/features/agent-plugins/lifecycle.ts:197–214` moves the old bundle **before** it calls `owner.seedBundledAgentPlugins`. The seed owner at `J/agent-plugins/src/lifecycle/seed-bundled.ts:181–189` then runs the layout migration, through Tovu’s hook at `lifecycle.ts:124–130`. The migration takes `.agent-plugin-layout-migrated.lock` and takes the individual `.plugin-state-<id>.lock` for package moves (`J/agent-plugins/core/persistent-state.js:226,302–317`). The publisher-ID move and restore hold neither across the window. Simply holding the per-plugin lock around the wrapper can also make the nested migration reacquire it.

The next OPUS handoff is to establish **one shared lock ordering with explicit ownership** across layout migration, move, seed and restore. Prove with two real lock contenders that migration cannot enter that window and that the seed cannot reacquire a lock it already owns. Keep the existing verification of publisher, ledger digest and installed bytes. Do not begin journal writes or call a failed restore repaired before this witness passes. The subsequent journal sheet must cover interruption before and after each rename, failure to restore, and concurrent boot. Its first crash-order mutation should persist `moving` *after* the rename and fail the restart test. This is a filesystem journal, not a database migration.

## Owner question

Can the P7 real-site check provide redacted historical digests and read-only legacy fixtures from the 0.7.2 sites? **Recommended default:** collect those before designing multi-revision or pre-layout recovery. Do not infer an old digest or broaden what may be moved. The index already accepts keeping resolved publisher-update entries as history, so that decision is not reopened here.
