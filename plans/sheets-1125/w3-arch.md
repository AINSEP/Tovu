SHEETS Architecture/structure leftovers PARTIAL: 12 sheets (7 Jini / 5 Tovu), 10 OPUS-REVIEW, 0 files move

Anchored to `origin/integ/merge-23-2026-11-25` at Tovu `bf1519bba7329e0637eee4a6600dbdaba48f83db` and Jini `ad71bf68dee9907ce4db8fe86dcb8d1ffd06e8ba`. Both checkouts are detached at those tips. Reverify anchors and rerun the narrow importer searches before building, especially if the final fix run advanced either tip. No files changed. No tests, builds, installs, or type-checks ran.

| Area | Sheeted | Already landed or NOT-SHEETED |
|---|---|---|
| R01 class census | One matched UI data-table slice, including Tovu’s selector consumers | Shell alias cleanup already landed in combine-23 FIX 24. The rest of the class census is **NOT-SHEETED**. |
| R02 neutral copy and IDs | Consent validation refusal through the existing args and host ports | Consent labels and the first citation pass already landed. Remaining ID, README, and `PORT.md` rows are **NOT-SHEETED**. |
| R03 host legacy vocabulary | The four MCP field aliases and the provider share-key rule, each with a Tovu binding | The `extensions.tovu` namespace fallback and its preboot readers are **NOT-SHEETED**. Manifest filename and SDK aliases remain supported reads. |
| K03 residual vendors | Normalize bridge dispatch at the runtime binding. Verify the disposition of AMR, MiMo, Vibe, OpenCode ACP, Claude-compatible args, and Pi | K01, K02, K03a and OpenCode config staging are already present. No second move of those implementations. |
| G06 executor launch | Typed admission, preparation, handoff and cleanup split | Further physical breakup to retire the whole-file size row is **NOT-SHEETED**. This slice does not transfer vendor debt to new files. |
| P10-H2 attribution | Migrate-forward write shape and trusted admin/assistant bindings | System kind, publish import, restore and assistant post attribution are already present. Broad required-write cutover, theme activation, taxonomy merge, other publish writers, and ledger schema decisions are **NOT-SHEETED**. |

**Build contract.** `J/` denotes Jini `packages/`, `W/` denotes Tovu `apps/website/src/`, and `A/` denotes Tovu `apps/admin/src/`. All sheets are SOL work. OPUS-REVIEW is a subsequent review and test obligation, never a builder prerequisite. Sol writes the named tests before the implementation and leaves them unrun. Opus runs the smallest affected suites, applies and reverts each named mutation, then runs the relevant strict type, package, API, and repository gates. Review paired Jini and Tovu changes against one another before releasing a changed package or bundled plugin.

Preserve `_optional = {}` pads and object args, keep new or split functions at ≤80 lines and complexity ≤10, and move why-comments with the code they explain. Omit optional keys when absent unless the receiving type explicitly allows `undefined`. No new forwarding entry, ambient host fallback, or theme edit. The zero move count means zero existing files relocated in full. G06 extracts function bodies, not files.

## Jini build order

### 1. R01.TABLE.J — Match UI table markup and CSS

**BUILDER: SOL**

**Write first.** In `J/ui/src/features/interactive-ui/__tests__/components/DataTable.test.tsx` and `providers/shadcn/__tests__/data-table.test.tsx`, add `the host stylesheet gives this provider a bounded scroll frame and sticky headers`. Render each provider with its stylesheet loaded and check the matching scroll container and sticky column header. Keep the existing sort and accessibility assertions. `M-rename-table-markup-only` changes the rendered table class while leaving the selector behind. The style witness must fail even though the table still renders.

**Change.** Rename `jini-data-table` to `jini-ui-data-table`, retaining these exact suffixes where present: `-frame`, `-scroll`, `-sort`, `-empty`, `-pagination`, and `-pagination-controls`. Change the matching selectors without changing declarations, specificity, `data-slot`, `data-numeric`, `data-table-provider`, ARIA, or provider IDs.

| Current owner or consumer | Anchor |
|---|---|
| Interactive CSS selectors | `J/ui/src/features/interactive-ui/data-table.css:2–112` |
| Native React markup | `J/ui/src/features/interactive-ui/providers/native/data-table.tsx:19–30` |
| Shadcn React markup | `J/ui/src/features/interactive-ui/providers/shadcn/data-table.tsx:50–91` |
| Native chart DOM renderer | `J/ui/src/features/charts/table.ts:29–50` |
| Other Jini selector assertions | `J/ui/src/features/charts/__tests__/table.characterization.test.ts:19,49`, `J/ui/src/features/a2ui/__tests__/real-catalog-components.test.tsx:87,101` |
| Provider assertions | `J/ui/src/features/interactive-ui/__tests__/components/DataTable.test.tsx:18–19`, `J/ui/src/features/interactive-ui/providers/shadcn/__tests__/data-table.test.tsx:18–19` |

The host stylesheet still enters through `J/ui/src/features/interactive-ui/styles.css:11`. Do not rename chart or A2UI component IDs. `git grep -nF 'jini-data-table' -- packages examples` is the Jini closeout query. The Tovu matches are owned by sheet 8.

**Package.** No signature or `J/ui/package.json` export change. Keep `./interactive-ui` and `./interactive-ui.css` at `:169–173,194`. Add `.changeset/r01-ui-table-class-contract.md` for `@jini-ai/ui` major because the stylesheet’s selector contract changes. `api-baseline/jini-ai__ui.json` should show no declaration drift. The stylesheet and browser witnesses are the compatibility evidence the API baseline cannot capture.

### 2. R02.CONSENT.J — Inject the banner-mode refusal at the input seam

**BUILDER: SOL · OPUS-REVIEW**

The lane called this held for lack of an args object. At the merged tip, `parseConsentConfig` has both its input object and its options pad, and every production call path has an existing host args or port object.

**Write first.** In `J/cookie-consent/src/site/__tests__/validation.pins.test.ts`, add `banner-mode refusal comes from each host and defaults to neutral copy`. Use two different injected strings and an omitted field. Assert the same `ToolInputError` for each invalid mode and no change to results for valid or omitted modes. `M-leak-default-product-name` restores `Choose the Jini banner…` on the fallback path. Add `draft and assistant preparation use the bound banner-mode refusal` to the site tests, with `M-drop-banner-refusal-forward` targeting one forwarding call.

**Change.** At `J/cookie-consent/src/site/validation.ts:14,21,67–70`, use this signature and propagate only the copy field:

```ts
export function parseConsentConfig(
  { value, bannerModeRefusal }: { value: unknown; bannerModeRefusal?: string | undefined },
  _options = {},
): ConsentConfig
```

Add the same optional field to the existing `validateConsentOptions` first object and default to `Choose the built-in banner, your own banner, or none.` on the failing `bannerMode` check. It is trusted host copy, not a key in `raw` or a field in `ConsentConfig`. Keep validation order, supported enum values, CSS handling, readiness, and refusal class unchanged.

- `J/cookie-consent/src/site/service.ts` adds `bannerModeRefusal?: string | undefined` to `ConsentServicePorts:27`. Pass it at the parser calls `:70,109,171,208,219`. Add it to `sampleConsentConfig`’s existing object at `:69` and pass it from the callers at `:124,198`.
- `J/cookie-consent/src/site/tool-registrations.ts:29,53–54,74,85` adds the same field to `ConsentToolHost` and passes it in both confirmation preparation paths.
- The other direct Jini references are `J/cookie-consent/src/site/README.md:41–50` and `__tests__/{validation.css-source,validation.pins}.test.ts:5`. They may keep the neutral default unless explicitly exercising host copy. No import repoints. Verify with `git grep -nF 'parseConsentConfig' -- packages examples`.

**Package.** Keep `./site/validation`, `./site/service` and `./site/tool-registrations` in `J/cookie-consent/package.json` unchanged. Add `.changeset/r02-consent-validation-copy.md` for `@jini-ai/cookie-consent` minor and refresh that package’s API baseline for the three additive option changes. Tovu adoption is sheet 9.

### 3. R03.MCP-ALIASES.J — Inject old MCP field names without changing the namespace reader

**BUILDER: SOL · OPUS-REVIEW**

**Write first.** Extend `J/agent-plugins/src/lifecycle/__tests__/unit/legacy-vocabulary.pins.unit.test.ts:17–18` with `two hosts translate only their own legacy MCP fields` and `canonical metadata wins even when malformed`. Test unbound, host A, and host B against the same fixture. Assert the canonical-only output, warning behavior, and that inline `defaultTools.read` still cannot supply reviewed read trust. `M-drop-injected-mcp-alias` removes the alias lookup. `M-inline-grants-review` removes the existing inline read stripping. Retain the installed-package warning witness at `capability-projection-host-contract.unit.test.ts:92–104`.

**Change.** Define a package-local descriptor in `J/agent-plugins/src/core/identity-namespace.ts` for the existing parser and lifecycle ports:

```ts
type LegacyMcpField = 'authMode' | 'defaultTools' | 'tokenAuth' | 'renamedTools';

export interface LegacyMcpAliases {
  readonly names: Readonly<Partial<Record<LegacyMcpField, string>>>;
  readonly warning: string;
}
```

- At `identity-namespace.ts:77–101`, add `{ readonly legacyMcpAliases?: LegacyMcpAliases | undefined } = {}` as the second object of `readCompatibleAgentPluginServerMetadata` and `hasLegacyAgentPluginServerMetadata`. Iterate a fixed typed tuple of canonical keys. Use the injected alias only if present. Preserve manifest-before-inline precedence, canonical null handling, and the existing difference between a null manifest alias and inline alias processing. Keep `inlineMetadata` unchanged. For diagnostics, test the supplied alias keys as own properties. Do not enumerate arbitrary keys off the untrusted input to discover aliases.
- At `J/agent-plugins/src/lifecycle/manifest.ts:59,582–616`, add `legacyMcpAliases?: LegacyMcpAliases | undefined` to the existing parser options and the matching private options. Keep `readServerMetadata` as the higher-priority custom translator. When the portable default is selected, bind the optional aliases to the existing compatibility reader. Canonical inline handling still works when aliases are omitted. Use the descriptor warning for alias hits only. Keep the existing namespace warning and custom-namespace isolation. In particular, do not make an unrelated explicit namespace portable by giving it aliases.
- At `lifecycle/ports.ts:78,86–87`, add the optional field and include it in the existing `Omit` and `Pick` lists. `lifecycle/index.ts:167–173` already merges optional ports into the per-owner context. Forward the field from that context at `lifecycle/capability-projection.ts:23`. No module-global registry.
- The direct Jini decoder consumers are the parser and the two functions in `identity-namespace.ts`. Update legacy-bearing fixtures at `lifecycle/__tests__/unit/{legacy-vocabulary.pins,portable-metadata,capability-projection-host-contract}.unit.test.ts` to bind a test descriptor where they intend a legacy read. Leave the N‑1 `extensions.tovu` fixtures and the bundled-manifest write scan intact.

**Package.** No new package subpath. `J/agent-plugins/package.json:175–179,200–204` keeps `./lifecycle` and `./manifest`. Add `.changeset/r03-injected-mcp-aliases.md` for `@jini-ai/agent-plugins` major. An unbound parser no longer recognizes these host-specific aliases. Refresh `api-baseline/jini-ai__agent-plugins.json` for any exposed signature drift. Coordinate the cutover with sheet 10.

### 4. R03.SHARE-KEY.J — Share providers consume the host’s exact key predicate

**BUILDER: SOL · OPUS-REVIEW**

**Write first.** Extend `J/agent-plugins/vercel/__tests__/share-key.test.mjs` and `J/agent-plugins/s3-compatible/__tests__/target-edges.test.mjs:66–85` with `the same provider follows the key rule of the host that built it`. Exercise upload, delete, and verify with a fake transport and two distinct host suffixes. Assert that invalid keys produce no provider calls. `M-ignore-injected-share-key-policy` reintroduces a fixed suffix. `M-delete-skips-share-key-check` bypasses only delete’s existing validation.

**Change.** Add this optional capability to the existing host-kit types at `J/devops/src/deploy/host-kit.ts:59–77` and `J/devops/src/deploy/target-contracts.ts:25–40`:

```ts
readonly isShareArtifactKey?: (
  required: { readonly key: string },
  optional?: Record<string, never>,
) => boolean;
```

The capability is optional for a general deploy kit, but both bundled share implementations treat an absent predicate as refusing the key. No broad `.zip` fallback.

- `J/agent-plugins/vercel/object-stores/vercel-blob.mjs:33–34,65–71,89–126,154–155` replaces the file-local `SHARE_KEY` lookup with `kit.isShareArtifactKey?.({ key }) === true` in `requireKey`. Keep its refusal, URL equality check, upload headers, no-redirect path, and idempotent delete.
- `J/agent-plugins/s3-compatible/targets/s3-compatible.mjs:707–733` substitutes the same predicate in its existing key check. Keep all three checks ahead of network effects. `:1021–1023` already hands `required` through to the target. The delegate at `J/agent-plugins/s3-compatible/object-stores/s3-compatible.mjs:290–291` already passes the same kit. Neither site needs a new wrapper or method signature.
- The direct test factory callers found by `git grep -nF 'createArtifactStore('` are the two suites above and S3 `__tests__/object-store.test.mjs:416–444`. Supply the fixture predicate only for share behavior tests. Leave normal publishing and ordinary credential verification inputs unchanged.

**Package.** No `package.json` export additions. Add `.changeset/r03-injected-share-key-policy.md` for `@jini-ai/devops` minor and `@jini-ai/agent-plugins` major. Refresh the devops baseline if the kit declarations are captured. No new agent-plugins TS export is expected. Validate bundled provider packaging after sheet 11 is wired. Do not change token formats, store bindings, artifact filenames, or retention behavior.

### 5. K03.BRIDGE.J — Bind the delivery mechanism in agent-runtime

**BUILDER: SOL · OPUS-REVIEW**

**Write first.** Extend `J/daemon/src/agent-executor/__tests__/strategy-dispatch.test.ts:26–88` with `identical host capabilities select the same delivery without a vendor id` and `unbound configured delivery fails before acquiring a credential`. Use fake CLI IDs and distinct injected env carrier names. `M-raw-cli-strategy-dispatch` makes the dispatcher use the raw definition spelling again. Reuse the inherited-consent and refusing-config cases in `full-cli-mcp-policy.test.ts` and `access-approval-transport.test.ts`. `M-inherited-credential-before-consent` moves the credential call ahead of consent. No real credentials or subprocesses.

**Change.**

1. Add `McpBridgeMechanism = 'config-file' | 'acp-merge' | 'env-content' | 'staged-home' | 'env-passthrough'` to `J/core/src/contracts/agents/definition.ts` beside `RuntimeAgentDef.externalMcpInjection:542`, exposed by the existing type export in `index.ts:2`. Keep the raw definition vocabulary and serialized delivery discriminants unchanged.
2. Add `readonly mcpBridgeMechanism?: McpBridgeMechanism` to `AgentRuntimeStrategies` at `J/daemon/src/ports/agent-runtime.ts:70–74`. Bind it in `J/agent-runtime/src/runtime-strategies.ts:114–135` through the existing `strategiesForDef:159–160` and `runtime-port-bindings.ts:109`. Use an exhaustive runtime-owned `Record<NonNullable<RuntimeAgentDef['externalMcpInjection']>, McpBridgeMechanism>`. Map `claude-mcp-json` to `config-file`, `codex-toml` to `staged-home`, both inline env declarations to `env-content`, and keep the two neutral names as-is. Omit the slot for an undeclared strategy. Check own membership for malformed external declarations. Do not add another id registry.
3. At `J/daemon/src/agent-executor/mcp-bridge.ts:118–181`, key `MCP_DELIVERY_BUILDERS` on `McpBridgeMechanism`. Keep the same builders and the same `McpBridgeDelivery` outputs. Replace `strategy` on `buildMcpBridgeDelivery`’s first object with required `mechanism: McpBridgeMechanism | undefined` and add `_optional: Record<string, never> = {}`. Keep `options`, `credential`, and the existing optional slots and nonce. No configured bridge or no declared delivery still returns `null`. A bound config-file, staged-home, or env-content mechanism still refuses its missing implementation rather than guessing a handler.
4. At `mcp-bridge.ts:191–242`, add required `mechanism: McpBridgeMechanism | undefined` to the existing `deps` object of `resolveMcpBridgeForRun`. Use it for the inherited-settings check and builder call. When the host configured injection and the definition declares delivery but the mechanism is missing, fail through the existing cleanup and typed failure path before credential lookup. Keep no-config behavior, the preparation slot, credential placement, and relay nonce behavior. At `launch.ts:898–900,1471–1473`, read the mechanism from `agentRuntime.strategies.for({ def })` and pass it in the bridge resolver’s deps. The later MCP file writer at `:1516` still gets only its existing staging slots.
5. Tighten only reduced per-file R15 counts in `scripts/vendor-neutral-debt.json`. Preserve the reasons behind the `mcp-bridge.ts:82–94,111–122,143–161` comments, including why ACP credentials stay in env and why runtime owns the named env carrier. Do not add vendor allowance in daemon or server.

**Callers.** Keep `J/daemon/src/agent-executor/index.ts:158–159` and `J/daemon/src/agent-executor.ts:44,61` exporting the same function names. Direct test callers of the builder are `agent-executor.test.ts:5256–5375`, `http-mcp.test.ts:81`, `split-parity.test.ts:49`, and `strategy-dispatch.test.ts:74,88`. Direct test callers of the resolver are `access-approval-transport.test.ts:35`, `antigravity-permissions.test.ts:33,96–124`, `full-cli-mcp-policy.test.ts:65,89`, and `message-relay.test.ts:11`. Update those call objects and the synthetic strategy bindings. Use `git grep -nE 'buildMcpBridgeDelivery|resolveMcpBridgeForRun' -- packages examples` after the update. No Tovu caller of either helper was found.

**Residual disposition.** AMR and Vibe already declare ACP at `J/agent-runtime/src/defs/amr/index.ts:279–286` and `defs/vibe/index.ts:15–16`. AMR’s executable env key is already owned by its def. MiMo’s config key and OpenCode-schema behavior are already runtime-bound at `runtime-strategies.ts:14–19,53–56,76–92`. Keep OpenCode ACP’s inline HTTP slot and MiMo’s lack of it. `defs/claude-compatible-args.ts` is shared by Claude and CodeBuddy, both inside agent-runtime. Keep it there. ACP, Pi RPC and stdin in `J/daemon/src/agent-executor/launch.ts:1314–1328` are transport branches, not vendor-ID branches. Do not move Pi RPC or add a special case for any of these CLI names.

**Package.** Keep existing `./contracts/agents`, `./ports/agent-runtime`, daemon and runtime entries in `package.json`. Add `.changeset/k03-bound-mcp-mechanism.md` for core minor, agent-runtime minor and daemon major. Refresh all three API baselines. G06 starts after this SOL sheet’s code lands.

### 6. G06.RUN.J — Split launch phases without changing resource ownership

**BUILDER: SOL · OPUS-REVIEW**

**After sheet 5.** All source anchors below refer to the original verified tip. Re-anchor the bridge call after K03.

**Write first.** Extend `J/daemon/src/agent-executor/__tests__/r8a-pins.test.ts` using the injected rig with `a synchronous spawn failure releases an acquired lock and each staged home once`. Pin the order from staging through failure and assert no prompt dispatch. Reuse `agent-executor.test.ts:5129,6098` for failures after MCP file and scratch-home staging. Add `an immediate child exit cannot beat lifecycle registration` using the fake child. `M-double-release-staged-home` invokes the staged home disposer twice before clearing the slot. `M-yield-before-child-wiring` puts an async yield between spawn and listener registration. Retain `agent-executor.test.ts:7223`, which records current behavior when prompt cleanup itself rejects. This sheet must not silently change that behavior.

**Change.** Keep `createAgentExecutor` as the owner in `J/daemon/src/agent-executor/launch.ts:925` and retain its exact signature and the `AgentExecutor` methods. Extract the following ordered phases. Keep the already-bound vendor staging and its why-comments in `launch.ts` where R15 accounts for them. The new driver at `J/daemon/src/agent-executor/launch-run.ts` is private to the executor, has no vendor imports or strings, and owns only phase sequencing.

```ts
type RunRequired = Parameters<AgentExecutor['run']>[0];
type RunOptions = NonNullable<Parameters<AgentExecutor['run']>[1]>;
type NoOptions = Record<string, never>;

export function createLaunchRunner<A, P>(
  phases: {
    admit(required: { requiredArgs: RunRequired; optionalArgs: RunOptions }, optional?: NoOptions): Promise<A>;
    prepare(required: { admitted: A }, optional?: NoOptions): Promise<P>;
    handoff(required: { prepared: P }, optional?: NoOptions): Promise<void>;
  },
  _optional: NoOptions = {},
): AgentExecutor['run']
```

The returned function keeps `(requiredArgs, optionalArgs = {})` and awaits the three phases in that order. Use typed phase outputs, not an executor-wide object that helpers can freely mutate.

| Current range in `launch.ts` | Destination and invariant |
|---|---|
| `:925–1000` | Keep factory setup and per-executor bookkeeping. Preserve the three map lifetimes, `sendUserMessage`, `claimUserMessages` and the existing `failBeforeSpawn` result. Lift phase-specific helpers out of the factory, passing only their collaborators. |
| `:1002–1152,1354–1380` | `admitLaunch` resolves the definition and transport, then runs native policy, image budget, filesystem checks, executable resolution, overlay/model selection, and the capability probe in current order. Its typed result carries the input, definition, stream format, image delivery, launch, env, overlay and composer, and model selection. Keep each existing check in its own named function with explicit deps. No stages or child start on refusal. |
| `:1382–1500` | `prepareLaunchInputs` acquires prompt then log, initializes one run-owned resource state, resolves HTTP/native MCP, computes runtime context and takes the runtime lock. Keep HTTP MCP and native bridge mutually exclusive as today. Preserve the credential resolution point and the exact failure cleanup path. |
| `:1401–1465,1486–1500` | `createLaunchCleanup` holds the one resource state used by both failure and child paths. Preserve HTTP → filesystem temps → prompt → log → MCP JSON → staged home → staged config → instructions cleanup order. Clear the slots currently consumed before awaiting their disposers. Keep lock release separate from full staged cleanup and preserve the controller and handoff semantics. |
| `:1502–1577` | Split `stageLaunchConfiguration` from `prepareLaunchInvocation`. The former keeps argv build, MCP config, staged home, staged config and instructions in their present order before child env. The latter fits the prompt variant, checks platform length, plans the invocation and confirms the selection before spawn. Do not repeat argv construction to fit variants. |
| `:1155–1330,1579–1619` | `handoffLaunch` keeps spawn synchronous through exit-listener and child-wiring registration, then awaits spawn confirmation. Preserve failure removal from both live maps and the unawaited handoff watcher. Keep ACP, Pi and stdin dispatch in separate existing branches. |

Use small phase-specific required objects and `_optional = {}`. Give staged state explicitly initialized null or undefined fields using the existing resource types, not a `Partial` object cast to a completed run. Keep the two distinctions that matter most here: staging failure owns cleanup without a child, and a spawned child can emit before the next awaited continuation.

**Callers and package.** No public or test importer changes for G06. The direct `launch.js` importers are `J/daemon/src/agent-executor/index.ts:143` and `__tests__/{access-approval-transport,host-env-ports,launch-characterization,launch-defaults-and-staging}.test.ts`. Public helper implementations stay exported from their existing owners. No `package.json` entry for the new driver. Add `.changeset/g06-launch-phases.md` for `@jini-ai/daemon` patch, with no API baseline drift expected. Retire only the stale `createAgentExecutor.run` size row at `scripts/size-debt.json:220` after the reviewer verifies the replacement phases. Re-measure the whole-file row at `:213`. Do not retire it on the strength of the shorter `run`, and do not create new R15, size, log-safety or error-gate debt rows to make this slice pass.

### 7. P10-H2.MIGRATE.J — Require a trusted actor on the migrate-forward writer

**BUILDER: SOL · OPUS-REVIEW**

**Write first.** In `J/db/src/__tests__/recovery/owner-contract.test.ts:75–93`, add `migrate-forward retains user, agent, and explicit system attribution without changing the plan`. Use a fixed actor ID across the user and agent cases. Assert `createdBy`, ledger `actorId`, and parsed ledger detail, including the existing `artifactRef`. `M-migrate-drops-actor-kind` removes kind from the ledger detail. `M-migrate-defaults-to-user` stamps the same actor kind for all cases.

**Change.** `CommandActor` already extends `MutationActor`, and `MutationActor.kind` already includes `system` at `J/core/src/contracts/events/{command.ts:13,ports.ts:23–25}`. Do not widen it again. At `J/db/src/recovery/migrate-forward-hooks.ts:48–56`, replace `actorId: string` with required `actor: MutationActor` imported type-only from `@jini-ai/core/contracts/events`. Keep the signature:

```ts
buildMigrateForwardHooks(
  input: BuildMigrateForwardHooksInput,
  _optional = {},
): GatedMutationHooks<{ costClass: string; siteId: string }, { migrated: true }>
```

At `:108–135`, use `input.actor.id` for `createdBy` and the ledger’s compatibility `actorId`. Add `actor: { id: input.actor.id, kind: input.actor.kind }` beside the existing `artifactRef` in `detailJson`. This follows the current restore writer at `J/db/src/recovery/restore-hooks.ts:128`. The plan hash, permissions, `scopeKind: "instance"`, fresh capability read, capture, and save/append order do not change. Do not add a column, reinterpret old rows, run a migration, or repurpose confirmer identity.

**Callers and package.** `git grep -nE 'buildMigrateForwardHooks|BuildMigrateForwardHooksInput' -- packages examples` locates the Jini owner contract and the identity check in `J/db/src/__tests__/recovery/barrels.test.ts:14,41`. Preserve the latter and update the former. Keep the existing `./recovery/*` export at `J/db/package.json:116–120`. Add `.changeset/p10-h2-migrate-forward-actor.md` for `@jini-ai/db` major and refresh `api-baseline/jini-ai__db.json`. Tovu adoption is sheet 12.

## Tovu build order

### 8. R01.TABLE.T — Repoint the host’s selector witnesses

**BUILDER: SOL**

**After sheet 1. Write first.** In `A/components/AssistantDock/__tests__/RoutedA2uiSurfaceCard.contract.unit.test.tsx`, keep the real native and shadcn providers and add `the table keeps its provider marker when moved into and out of the target`. `M-host-queries-retired-table-class` leaves one old selector behind. The test must fail on the corresponding portal transition.

**Change.** Update selectors at `RoutedA2uiSurfaceCard.contract.unit.test.tsx:34–39` and the public stylesheet assertions in `A/components/AssistantDock/__tests__/interactive-ui-styles.unit.test.ts:7,10–12`. The latter must still resolve `@jini-ai/ui/interactive-ui.css` and pin that the production boundary imports it. These are the Tovu matches from `git grep -nF 'jini-data-table' -- apps ':!**/*.json'`. No production mount, stylesheet import, theme, provider ID, or signature change.

**Package.** No Tovu export, changeset or API-baseline change. Consume sheet 1’s UI artifact through the existing dependency path as part of the paired verification.

### 9. R02.CONSENT.T — Bind Tovu’s consent refusal copy

**BUILDER: SOL · OPUS-REVIEW**

**After sheet 2. Write first.** Add `a rejected banner mode uses Tovu’s copy without saving a draft` in `W/features/consent/__tests__/service.test.ts`, using the real host ports fixture at `__tests__/fixture.ts:21–29`. Add the equivalent held-preparation assertion to `__tests__/tools.test.ts`. `M-drop-tovu-banner-copy-port` removes the field from the tool host only. The test must distinguish host copy from Jini’s neutral fallback.

**Change.** Put `TOVU_CONSENT_BANNER_MODE_REFUSAL = 'Choose the Tovu banner, your own banner, or none.'` in `W/features/consent/host-bindings.ts`. Include it as `bannerModeRefusal` in `consentServiceHostPorts:26–28` and update that `satisfies Pick` key list. Include it in `consentToolHost:32–34`. Existing spread bindings pick it up, including the fixtures and `W/server/runtime/composition/site-consent.ts` and `tool-catalog-manifest.ts`. Pass the same copy at the direct public parse at `W/server/inbound/public-http/middleware/site-consent.ts:57`. Keep its fail-closed behavior unchanged.

The direct parser tests at `W/features/consent/__tests__/service.test.ts:185,194,241,333` and `unit/validation.property.unit.test.ts:19–51` otherwise remain neutral contract tests. No import repoints other than importing the host constant at the direct middleware call. No route or public response schema change.

**Package.** No Tovu export, changeset or baseline change. Accept the deliberate brand correction in this one refusal. No change to consent policy or revision publication.

### 10. R03.MCP-ALIASES.T — Bind Tovu’s N‑1 MCP vocabulary at the lifecycle root

**BUILDER: SOL · OPUS-REVIEW**

**After sheet 3. Write first.** Extend `W/features/agent-plugins/__tests__/unit/lifecycle-capability-binding.unit.test.ts:49–64` with `Tovu’s installed MCP owner reads legacy aliases without changing canonical output`. Assert a still-working old OAuth config and the existing `[agent-plugins]` warning channel and compatibility date. `M-unbind-tovu-mcp-aliases` removes only the host descriptor. Keep the standalone portable-reader negative witness too.

**Change.** Define `TOVU_LEGACY_MCP_ALIASES` at the existing MCP host seam `W/features/agent-plugins/mcp-host-bindings.ts:10`. Type it with `satisfies NonNullable<AgentPluginLifecycleOptional['legacyMcpAliases']>` using a type-only import. Bind exactly `tovuAuthMode`, `tovuDefaultTools`, `tovuTokenAuth`, and `tovuRenamedTools` to their four canonical keys. Supply the existing warning bytes, including the `2027-05-06` compatibility date, in the host descriptor.

Pass `{ ...policy, legacyMcpAliases: TOVU_LEGACY_MCP_ALIASES }` as the second object at `W/features/agent-plugins/lifecycle.ts:261–274`. This is the active agent-plugin parser binding. `W/features/plugin-runtime/host-binding.ts:72–84` is the separate site-plugin SDK and admission owner. Do not change its `identityNamespace` to implement this slice.

**Direct standalone fixture callers.** At `W/assistant/__tests__/external-mcp-connection-source.operator-read-only.test.ts:37–40` and `W/features/agent-plugins/__tests__/{manifest.default-tools-read.test.ts,unit/manifest.unit.test.ts,unit/portable-readers.unit.test.ts,unit/tw2-L224-characterization.unit.test.ts}`, pass the descriptor in the existing second object for reads that intentionally exercise these aliases. Preserve existing `pluginManifest` opts. Make the no-binding negative test explicit and retain malformed-input cases. Installed-package fixtures at `unit/lifecycle-capability-binding.unit.test.ts:57`, `unit/mcp-projection-seam.distinct-ports.unit.test.ts:71`, `W/server/runtime/composition/__tests__/plugin-host.integration.test.ts:348`, `W/server/__tests__/routes/sites-route-agent-plugin-tokens.test.ts:159`, and the agent-plugin set-enabled integration test at `:398,425,475,551,575` must reach the composed lifecycle. Do not fix those by rewriting old fixture keys. Canonical-only parser calls need no new option. Recheck `git grep -nE 'tovu(AuthMode|DefaultTools|TokenAuth|RenamedTools)|parseAgentPluginMcpConfig' -- apps/website/src`.

**Package.** No Tovu export, changeset or API-baseline change. No credential field renaming in stored data, no namespace migration, and no change to the bundled write format.

### 11. R03.SHARE-KEY.T — Bind the current share-key wire format at the share host

**BUILDER: SOL · OPUS-REVIEW**

**After sheet 4. Write first.** In `W/server/runtime/composition/__tests__/site-share-wiring.integration.test.ts`, add `the provider can verify and revoke the exact old share object without accepting adjacent keys`. Use the provider fixture and guarded transport. Pin no provider I/O for an alternate suffix, a wrong token, or an overlong slug. `M-share-kit-uses-archive-file-policy` substitutes the wider `SHARE_FILE` acceptance rule, which also accepts static archives. This must fail the artifact witness.

**Change.** At `W/features/site-backup/share-registry.ts:9–14`, name the host-owned suffix `SHARE_ARTIFACT_SUFFIX = ".tovu.zip"` and keep the object-key rule exactly equivalent to the providers’ original `_share/<16 ASCII letters>/<1–80 lowercase slug characters>.tovu.zip`. Expose a host helper `isShareArtifactKey({ key }: { readonly key: string }, _optional: Record<string, never> = {}): boolean`. Do not use `SHARE_FILE` as the object-key rule. Reuse the named suffix in `W/features/site-backup/share-service.ts:2,7` and the registry’s existing artifact-suffix option. Existing download URLs and headers stay byte-identical.

At `W/server/runtime/composition/site-deps/site-sharing.ts:10,109–119,149`, add the predicate to the returned share-only kit. Keep the anonymous HEAD override and the guarded client, including its redirect behavior. This is the production `createArtifactStore` call found by `git grep -nF 'createArtifactStore(' -- apps/website/src`. Leave `W/features/object-storage/artifact-provider.ts:23` and its provider selection ABI intact. Ordinary, non-share deploy kits are unchanged.

**Package.** No Tovu export, changeset or baseline change. Verify the prior share-password fixture independently, but do not touch its key derivation, expiry rule, or ciphertext.

### 12. P10-H2.MIGRATE.T — Bind the actual write channel at both migrate-forward entries

**BUILDER: SOL · OPUS-REVIEW**

**After sheet 7. Write first.** Extend `W/server/__tests__/routes/database-migrate-forward-routes.test.ts:147–149` with `admin migrate-forward records the authenticated user in the ledger detail`. Extend `W/assistant/__tests__/tool-registrations.database-recovery.test.ts:764–808` with `human confirmation does not turn an assistant migration into a user write`. Drive the same principal through both entry types and compare actor kind, keeping the confirmer and authorizer assertions. `M-migrate-assistant-as-confirmer` stamps from the confirmation channel instead of the requesting tool channel. `M-migrate-admin-as-agent` swaps only the admin binding.

**Change.**

- `W/server/runtime/composition/modules/database-migrate-forward.ts:33–37` keeps its existing `migrateHooksFor({ deps, actorId }, _optional = {})` host signature and passes `actor: actorForMutation({ principalId: actorId, origin: "admin" })` to the writer. `:45–71` keeps plan/confirm/execute calls, the `principalId` used for auth, cost class, and operation lock unchanged.
- In `W/features/database/tool-registrations.ts:59,124–143,158–179,224–266`, inject a required tool-channel binding `(required: { readonly principalId: string }, optional?: Record<string, never>) => MutationActor` in the contribution factory’s required object. Keep `DatabaseToolDeps` and its shared registry intersection unchanged. Give the local build input an intersection with `readonly mutationActor: DatabaseMutationActorBinding`. Bind it to the existing deps at contributor build time without eagerly flattening getters. Use an explicit delegating deps object if needed. Both plan and prepared execute hooks call it with `ctx.principal.id`. Do not take the actor from `ctx.input` or `confirmer`.
- `W/server/runtime/composition/tool-catalog-manifest.ts:76,537` changes the registration to `contributeDatabaseTools({ mutationActor: ({ principalId }) => actorForMutation({ principalId, origin: "assistant" }) })`. `actorForMutation` is already imported at `:129`. Both CLI and BYOK use this contributor. Keep confirmation acting as `confirmer.id` and execution authorization acting as `ctx.principal.id` at `W/features/database/tool-registrations.ts:193–216`.
- `W/features/database/gated-hooks.ts:2,4,7–8` already derives its input from Jini. Keep the policy adapter and pass `actor` unchanged. Update the two direct hook fixtures at `W/features/database/__tests__/unit/migrate-forward-hooks.unit.test.ts:40,94`, their ledger expectation at `:70–72`, the direct contributor fixture at `W/assistant/__tests__/tool-registrations.database-recovery.test.ts:51`, and the direct build fixtures at `W/features/database/__tests__/unit/tool-registrations.input-validation-status.unit.test.ts:27–28,61–68`. No Jini import specifier repoints. The closeout search is `git grep -nE 'buildMigrateForwardHooks|contributeDatabaseTools|buildDatabaseRegistrations' -- apps/website/src`.

**Package.** No Tovu export, changeset, migration, generated DB type, or API-baseline change. `actorForMutation` already has its explicit worker/system branch at `W/server/runtime/composition/mutation-actor.ts:11–37`. There is no autonomous migrate-forward writer to bind here.

## NOT-SHEETED handoff

- **R01 remaining census.** Distinguish package-owned selectors, host selector contracts, build-time utility classes, and third-party markup before creating more paired slices. Do not reopen the combine-23 shell conversion or rename Tovu screen and theme classes to improve a lexical count.
- **R02 remaining IDs and citations.** No blanket `SPEC`/`ADR` or identifier replacement. Each remaining row needs a real neutral owner and classification as executable copy, explanatory rationale, persisted wire identifier, or historical record. A total from the old census is not an importer ledger.
- **R03 namespace.** `J/agent-plugins/src/core/identity-namespace.ts:4–71` still owns the hardcoded legacy namespace. This is broader than the MCP alias decoder. It reaches lifecycle install, projection, indexed and persistent reads, folder packaging, preboot credential/host-tool metadata and supersession. Direct Tovu readers include `W/assistant/tool-search-keywords.ts:33`, `W/features/agent-plugins/{exports/source.ts:35,install-upload.ts:137,memory.ts:26}`, `W/features/member-login/providers.ts:43`, and `W/server/runtime/composition/{agent-plugin-connections.ts:147,domain-dns-adapters.ts:173}`. A lifecycle-only injection would strand some N‑1 reads. No namespace removal or expiry is authorized by sheets 3 or 10.
- **G06 physical file-size remainder.** Vendor-bearing rationale and compatibility identifiers remain in the original owner. A further physical split needs its own line ledger and a way to preserve those reasons without adding per-file vendor, error, or log-safety debt. Do not call the whole-file row closed after the phase split.
- **H2 broad write cutover.** `J/core/src/contracts/events/change-set.ts:41,97` and `ports.ts:57,127–129` still permit unknown provenance on types used for writes. The eventual cutover must distinguish strict new-write inputs from historical read/replay shapes and enumerate both repositories’ producers, direct transactional inserts, serializers, and fixtures first. Do not make read-side `DomainEvent.actor` required, cast old rows into new writes, guess user/system, or split an existing outbox transaction. Theme activation currently has a host telemetry identity at `W/features/presentation/set-active-theme.ts:11–20`, not a durable actor field. Taxonomy merge still writes `actorId` at `J/cms/src/taxonomy/gated-hooks.ts:90–96`. Trash, taxonomy and post revision storage, the restore-ledger column decision, the out-of-run publish repo fallback, and unforwarded publish contributor actors remain open. FIX 19’s import, restore and assistant post writers should not be rebuilt.
