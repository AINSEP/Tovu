REVISED r62t-rev-arch: 12 SOL sheets (5 Jini / 7 Tovu), 43 OPUS sheets

Merge-21 anchors checked against Tovu `7c87b3c3f` and Jini `010c8cd87`. No files changed and no tests, builds, installs, type-checks, or gates ran. A01 absorbs A16 under owner default 1, so all 43 new import pairs are fixed at source. A15 only prunes dead rows. R06 is split by repo so each SOL job has a bounded caller list. K03a is the mechanical split required by the review.

**Build contract.** Write the named pin before changing production code. In a runnable lane, verify the named temporary mutation turns it red, then revert the mutation. SOL writes the pins and changes. Opus runs verification, including the explicit handoffs below. Preserve behavior, why-comments, args-object boundaries, and `_optional = {}` pads. Custom hook props are required. Inject implementations at the host, keep shared contracts in core, keep themes in Tovu, and do not leave forwarding shells. K1 uses neutral route specs and small per-route deps. K2 uses the host-injected admin kit, with domain screens in the domain package’s `react/` folder. New or split functions must stay within 80 lines and complexity 10. Part G targets 50 nonblank, noncomment lines.

## Jini SOL

### R06.J — Private args conversion, artifact prefix matcher
BUILDER: SOL (OPUS-REVIEW)

**First pin.** In `packages/agent-runtime/src/__tests__/json-event-stream.test.ts`, pin the `legacy-google-stream-json` artifact path with distinct text and tag values, including an incomplete opening tag carried from one chunk into the next. Assert the emitted text and suppression outcome. Exercise the omission of the new empty optional object. `M-swap-required-fields` exchanges the two values at the caller.

**Change.** Convert only the private `packages/agent-runtime/src/defs/gemini/event-stream.ts:177` `artifactOpenCandidateLength(text: string, openTag: string)` to `artifactOpenCandidateLength({ text, openTag }, _optional = {})`. Its sole in-module caller is `stripDuplicateArtifactText` at `:153`, currently passing `current, openTag`. Preserve its matching loop and call timing. Opus type-checks and runs the pin afterward.

### G12 — Web-clone templates
BUILDER: SOL

**First pin.** Add `packages/agent-runtime/src/skills/web-clone/scripts/__tests__/template-byte-parity.test.mjs`. Before refactoring, capture fixtures for the serialized `skeleton({ name: "x" })` output and `notesTemplate({ name: "x", url, mode, level })`. Compare complete bytes, including empty lists and the final newline. `M-drop-template-final-newline` drops the final newline from the notes output.

**Change.** At `dna-scaffold.mjs:46`, extract private module-level `dnaMetaSection`, `dnaDesignSystemSection`, `dnaDesignStyleSection`, and `dnaVisualEffectsSection`. `skeleton` returns an object, so assemble the sections in the original property order and leave serialization and its trailing newline at the existing writer. At `init-clone.mjs:57`, extract `notesHeadingSection`, `notesSourceSection`, `notesStackSection`, `notesAssessmentSection`, `notesRunSection`, `notesChangesSection`, `notesComparisonSection`, `notesScoreSection`, `notesReplacementSection`, and `notesVerificationSection`. Each helper takes its existing template inputs in an args object and retains the optional pad. Join the notes sections with `[a(), b(), ...].join("")` in the original order. Preserve the bytes at section boundaries.

### G13 — Content duplication and media upload
BUILDER: SOL (OPUS-REVIEW)

**First pin.** Pin registered tool metadata and availability, import and replacement behavior, and image versus video limits. Use two distinct byte sizes, one above the image cap but within the video cap and one above the video cap. Assert the first is refused as an image and accepted as video, and the second is refused as video. `M-apply-video-cap-to-image` fails the image refusal.

**Change.** In `packages/cms/src/content-duplication/agent-tools.ts`, split `buildContentDuplicationAgentToolCatalog` by operation into private `buildReplaceTools` and `buildImportTools`. In `packages/cms/src/media/tool-registrations.ts:273`, split `mediaUploadHandlers` using `readUploadInput` and `assertWithinCap({ kind, bytes })`. Move the existing logic verbatim, with args objects and optional pads. Preserve lookup, validation, upload order, and refusal text. Opus runs the pins and mutation.

### G20 — Search candidate and RPC error complexity
BUILDER: SOL

**First pin.** Pin sparse plugin metadata and known RPC outcomes, including unexpected-ID cleanup, auth-required, and explicit-model refusal. `M-rpc-cleanup-falls-through` removes the `-32603` cleanup branch and makes an ignored reply reach `failWithRpcError`.

**Change.** In `packages/agent-runtime/src/agent-protocol/acp/session-results.ts:21`, extract these private boolean predicates with args objects and optional pads.

- `isUnexpectedInternalError({ state, obj, error })` returns `error?.code === -32603 && obj.id !== state.expectedId`.
- `isAuthRequiredError({ error, rpcErr })` returns `error?.code === ACP_AUTH_REQUIRED_ERROR_CODE && /auth/i.test(rpcErr)`.
- `isRejectedModelReply({ state, obj, effects })` returns `awaitingModelSelectionReply({ state, obj }) && !!effects.model && effects.model !== 'default'`.

Keep the five outcomes in order with the same effects: recoverable model selection, ignored cleanup, auth required, rejected explicit model, then generic RPC failure.

In `packages/agent-plugins/src/lifecycle/host-tools/search-tool.ts:332`, extract private `optionalPluginFields({ plugin }, _optional = {})` returning `Pick<IdentifiedAgentPluginSearchCandidate, "displayName" | "summary" | "version" | "description" | "requires" | "companions">`. Move the conditional spreads verbatim and spread the projected fields into the result. Preserve omission of absent keys and the existing output order, with display fields after `pluginId` and dependency fields after `provides`.

### K03a — Move the small CLI receipt adapters and constants
BUILDER: SOL

**Dependency.** Execute only after OPUS K01 has landed the bound receipt, MCP delivery, and launch strategy slots. Land before K03 closes and before G06.

**First pin.** Compare Gemini and OpenCode receipts for fixtures with distinct correlation values. Assert the bound plans keep the same config and executable environment keys. `M-generic-receipt-id` strips a fixture-specific correlation value.

**Change.** Move these files verbatim from `packages/daemon/src/agent-executor/` to the matching path under `packages/agent-runtime/src/defs/`, with their comments and applicable tests.

| Relative file | Export |
|---|---|
| `gemini/tool-calls.ts` | `geminiToolCallReceipt` |
| `opencode/tool-calls.ts` | `openCodeToolCallReceipt` |
| `opencode/constants.ts` | `OPENCODE_CONFIG_ENV` |
| `mimo/constants.ts` | `MIMO_CONFIG_ENV` |
| `amr/executable-env.ts` | `AMR_OPENCODE_BIN_ENV` |

Repoint daemon `tool-call-receipts.ts:1–9` from direct imports and `kind` selection to K01’s injected receipt capability. Bind the two implementations in their CLI defs. Supply the environment keys through the bound strategies instead of importing the constants in `mcp-bridge.ts:6–7,127–128` or `launch.ts:77,180`. Coordinate the same-folder constant import at `opencode/mcp-config.ts:4` with K03. Do not move that 126-line implementation or the Pi dispatch in this SOL sheet. Leave no forwarding files and no daemon import of agent-runtime implementations.

## Tovu SOL

Website paths in these sheets are relative to `apps/website/src/` unless given from repo root.

### A07 — Shared duplicate-name policy, rows 15 and 23
BUILDER: SOL

**First pin.** Both form and post duplication produce the same numeric suffix from a name that already ends in a number, skip occupied names, and preserve the exhaustion message. `M-copy-of-fallback` substitutes a `Copy of …` builder in one mount.

**Change.** Import the type `DeriveDuplicateName` from `@jini-ai/cms/forms`. Follow the existing media injection at `server/runtime/composition/tool-catalog-manifest.ts:750`.

- **Forms.** Use `buildFormsRegistrations(routeDeps: FormsToolDeps, { deriveDuplicateName }: { deriveDuplicateName: DeriveDuplicateName })`. Feed `toPackageDeps({ routeDeps, deriveDuplicateName }, _optional = {})` and use the injected function at `features/forms/tool-registrations.ts:72`. `contributeFormsTools({ deriveDuplicateName }, _optional = {})` returns `build: (routeDeps) => buildFormsRegistrations(routeDeps, { deriveDuplicateName })`. Pass the same required collaborator through `contributeFormsDuplicateHandlers({ deriveDuplicateName }, _optional = {})`. Delete the direct import at `:21`.
- **Post.** `contributePostDuplicateHandlers({ deriveDuplicateName }, _optional = {})` threads the collaborator into `duplicatePostOrPage`, then `deriveDefaultDuplicateTitle(routeDeps, source, deriveDuplicateName)` at `features/post/post-tool-duplicate.ts:31,37`. Delete the direct import at `:12`.
- **Manifest.** Pass `{ deriveDuplicateName }` at `:516`, `:748`, and `:749`. The host import already exists at `:134`. Keep current `isTaken` queries, bounded search, suffix, and wording.

Update `features/post/__tests__/content-duplicate.plugin-hook-failed.test.ts:77` and `content-duplicate.post-page.test.ts`, using `listResourceHandlers: () => contributePostDuplicateHandlers({ deriveDuplicateName })` and updating direct assertions. Apply the same binding to `post.creator-kind.test.ts` and `tool-registrations.admin-url.test.ts`. In forms, update `tool-definition-view.unit.test.ts:26`, `content-duplicate.form.test.ts`, `tool-contract.characterization.test.ts`, `agent-tools.unit.test.ts`, `common-field-tools.test.ts`, `lost-update-boundaries.test.ts`, and `tool-registrations.model-facing-errors.test.ts`. Update `assistant/__tests__/{content-read-get-by-id,tool-registrations.forms}.test.ts` and `server/runtime/composition/__tests__/form-delivery.security.test.ts:120`. Tests may import `copy-naming-policy` directly because they are excluded from the architecture checker.

### A09 — Media public URL binding, rows 18 and 19
BUILDER: SOL

**First pin.** Import and generation return the same original and transformed URLs for the same saved media, including the no-transform case and current failure behavior. `M-return-original-for-rendition` bypasses the rendition branch.

**Change.** Declare this structural type locally in each importer. Import `MediaPublicUrlDeps` from `@jini-ai/cms/media/site/contracts` and `MediaRecord` from `@jini-ai/cms/media`. Do not import a type from `media/public-urls.ts`.

```ts
type ResolvePublicUrls = (
  required: { deps: MediaPublicUrlDeps & { workspaceId: string }; assets: readonly MediaRecord[] },
  optional?: Record<string, never>,
) => Promise<Map<string, string | null>>;
```

- **Generation.** In `features/media-generation/tool-registrations.ts`, use `buildMediaGenerationRegistrations(routeDeps, { resolvePublicUrls }: { resolvePublicUrls: ResolvePublicUrls })`, replace the call at `:467`, and return `build: (d) => buildMediaGenerationRegistrations(d, { resolvePublicUrls })` from `contributeMediaGenerationTools({ resolvePublicUrls }, _optional = {})`. Delete `:41`.
- **Import.** In `features/media-import/tool-registrations.ts`, add `resolvePublicUrls` to the second arg of `buildMediaImportRegistrations` and the existing contributor args at `:439–442`, alongside `videoImport`. Thread it through `persistImportedMedia` at `:226,244`, the local-file and URL handlers at `:357,389`, and `createMediaReplaceFileHandler` at `:299,328`. Delete `:18`. Preserve call order and error mapping.
- **Manifest.** Import `resolveMediaPublicUrls` once from `#src/features/media/public-urls`. At `:523` pass `contributeMediaGenerationTools({ resolvePublicUrls: resolveMediaPublicUrls })`. At `:525` add `resolvePublicUrls: resolveMediaPublicUrls` to the existing import options. The direct `persistImportedMedia` caller in `features/asset-transfer/asset-destinations.ts:117` also needs the binding. Thread it through `AssetToolDeps` and bind it at `contributeFilesCopyTools` and `contributeImageTransformTools` in the manifest at `:515,521`. Do not make asset transfer import the resolver itself. A03 must preserve this binding when it changes the asset seam.

Repoint the direct callers in `assistant/__tests__/tool-registrations.media-import-egress-refusal.integration.test.ts`, `features/media-generation/__tests__/{providers-tools,tool-registrations}.test.ts`, `features/media-import/__tests__/{import-local-file,import-video-conversion-wiring,replace-file,tool-registrations}.test.ts`, `features/media/__tests__/media-producing-previews.test.ts`, and `server/inbound/public-http/routes/site/__tests__/integration/media-replace-cache.integration.test.ts`. Update asset-copy and image-transform fixtures that construct the affected deps or contributors. Repeat the exact-symbol caller check before closing. `server/runtime/composition/content-target-inputs.ts` was checked and is not a direct caller. Do not edit unrelated media list or stored-response resolver consumers.

### A13 — Search projection input, row 34
BUILDER: SOL

**First pin.** The same post fixture produces identical indexed text with title, body, and metadata, including empty body. `M-search-use-raw-row` passes `(row) => row as never` in the test binding instead of `toRecord`.

**Change.** Replace `CMS_SEARCH_RULES` in `features/site-search/cms-search-rules.ts` with:

```ts
export function createCmsSearchRules(
  { toPostRecord }: {
    toPostRecord: (
      row: Parameters<CmsSearchDocumentRules<ContentDatabase>["toSearchText"]>[0]["row"],
    ) => Parameters<typeof toPostSearchDocument>[0];
  },
  _optional: Record<string, never> = {},
): CmsSearchDocumentRules<ContentDatabase>
```

Keep the other rule fields unchanged and use `toSearchText: ({ row }) => toPostSearchDocument(toPostRecord(row))`. Delete the `:12` import. In `server/runtime/composition/modules/site-search.ts:20`, import the factory plus `toRecord` from `#src/features/post/read-model`, build `const cmsSearchRules = createCmsSearchRules({ toPostRecord: toRecord })` once, and spread it at `:427,429`. Do likewise in `features/site-search/__tests__/cms-search.test.ts:15,41,44,215`, using `../../post/read-model.js`. Update the stale factory name in the feature’s `INFO.md`. Do not create a second mapper or add hold-aware liveness work.

### R04 — Tovu hook injection
BUILDER: SOL

**First pin.** Pass a distinct fake hook through the actual admin mount and assert its state reaches the screen. Add `apps/admin/src/features/media/__tests__/media-required-hooks.typecheck.tsx`. Supply all other required props and omit `useMediaHook` in a JSX expression marked `// @ts-expect-error`. `M-media-hook-local-fallback` restores the old optional declaration and local fallback at `Media.tsx:1487`, making the directive unused. Exercise a fully supplied mount too.

**Change.** These are the 33 scanner anchors on merge-21. Paths in the table are relative to `apps/admin/src/features/`. For each genuine hook, the consuming component takes a **required** hook prop typed from the current function, deletes any default alias, and receives the same hook from its parent or composition mount. A listed alias that already ends in `Hook` becomes required under its existing name. Keep call order and do not move host hooks into the Jini kit.

| File | Checked anchors |
|---|---|
| `ai-assistant/AiAssistant.tsx` | `:256 useAdminExecutionModeHook`, `:257 useAdminLocale`, `:258 useTovuSettingsExecution`, `:264 useAdminExecutionCredentialHook`, `:622 useStoredCredentialHint`, `:778 useAdminThemeBoundary`, `:780 useAiAssistantTab`, `:791 useWiredAdminLocale` |
| `collections/CollectionEntryEditor.tsx` | `:116 useJsonFieldControl`, `:411 useCollectionEntryEditorHook` |
| `database/Database.tsx` | `:505 useAdminLocale` |
| `media/Media.tsx` | `:244 useMediaPreviewHook`, `:392 useEditMediaPanelHook`, `:1018 useMediaCardMetadata`, `:1052 useWiredMediaPreview`, `:1128 useMediaCardDetails`, `:1235 useMediaGridSize`, `:1396 useAdminThemeBoundary`, `:1489 useMediaHook`, `:1491 useMediaTabsHook`, `:1492 useMediaItemLink` |
| `pages/PageEditor.tsx` | `:811 useTabBarKeyboard`, `:1403 useThemePreviewFrame` |
| `plugins/AgentPluginDetailsModal.tsx` | `:43 useWiredAgentPluginMemory`, `:44 useAgentPluginDetailsView`, `:46 useAgentPluginSurfaces` |
| `plugins/AgentPlugins.tsx` | `:101 useAgentPluginUpdate`, `:397 useAdminThemeBoundary`, `:398 useAgentPluginTab`, `:401 useAgentPluginInstall`, `:407 useAgentPluginConfirmation` |
| `plugins/PluginProviderSettingsDialog.tsx` | `:100 useProviderSettingsFocus`, `:108 useSavedKey` |

At `PluginProviderSettingsDialog.tsx:108`, `useSavedKey` is an asynchronous **button action** returned from `useSettings`, not a React hook. Alias it locally as `selectSavedKey` and preserve the event handler and result timing. Require `useProviderSettingsFocusHook` and the existing `useSettings` prop and supply them in `Plugins.tsx:383`.

Wire screen-level bindings at `apps/admin/src/panels.tsx:197,228,318,734,935` and at `apps/admin/src/media-panel.ts:18` for `Media`. Wire child hooks down to `AdminExecutionMode`, the credential form, `JsonFieldControl`, the database sections, the media library/grid/card/preview/edit chain and `ExternalProvidersPanel`, `PagePreviewFrame`, `AgentPluginUpdateSlot`, and `AgentPluginDetailsModal`. Use a stable Tovu-side binding for the credential form supplied as a component to the Jini panel. Do not change the shared kit contract to carry a Tovu hook.

Remove the adjacent hook defaults in the same eight files, including AiAssistant’s root and locale-sync hooks, the execution-mode and credential override resolvers, the collection editor override resolver, the three database section defaults, the Media preview/edit/modal/root defaults, `usePageEditorHook`, modal `useDetails`, and the root `useAgentPluginsHook`. Leave non-hook defaults alone. Update direct mounts in the affected tests and measurements to supply real or fake hooks. The 33 anchors are the reviewed starting set, not a claim that the existing checker detects every optional or defaulted hook.

### R06.T — Private args conversion, held-back theme ordering
BUILDER: SOL (OPUS-REVIEW)

**First pin.** In `features/theme/__tests__/held-back-themes.unit.test.ts`, pin the existing code-unit order and resulting digest with at least two distinct file paths. Invoke the public path without a new optional arg. `M-swap-required-fields` reverses the comparator fields at its sole caller and changes the digest.

**Change.** Convert only the private `features/theme/held-back-themes.ts:49` `compareText(a: string, b: string)` to `compareText({ a, b }, _optional = {})`. At `walkHeldBackTree:41`, change the in-module call to `compareText({ a: a.relativePath, b: b.relativePath })`. Leave the framework-imposed `Array.sort` callback signature, ordering logic, bytes hashed, and theme ownership unchanged. Opus type-checks and runs the pin afterward.

### R08 — Tovu OAuth shell
BUILDER: SOL

**First pin.** Existing OAuth tests retain the same JS implementation and canonical contract types. Add `apps/website/src/platform/oauth/__tests__/no-ports-shell.test.ts`, asserting `fs.existsSync` for the old `ports.ts` path is false. `M-restore-tovu-oauth-shell` restores that file and fails the pin.

**Change.** The four type-only consumers under `apps/website/src/platform/oauth/__tests__/` are:

- `helpers.ts:8` → `OAuthClient` from `@jini-ai/core/contracts/oauth` and `OAuthProviderDescriptor` from `@jini-ai/oauth`.
- `token-refresh.test.ts:5` → `OAuthTokenSet` from `@jini-ai/oauth`.
- `providers.test.ts:7` and `authorization-code.test.ts:9` → `OAuthProviderDescriptor` from `@jini-ai/oauth`.

Move the shell’s why-comment on grant kinds, PKCE, and expiry as an absolute instant to `apps/website/src/platform/oauth/index.ts`. Delete `ports.ts`. Recheck OAuth-qualified and relative import specifiers in `apps/*` and `packages/*`, including tsconfig and Vitest aliases. Do not add a new forwarding entry. The planner’s empty shell inventory does not supersede the source.

### A15 — Delete stale debt rows only
BUILDER: SOL (OPUS-REVIEW)

**Change.** In `development/scripts/check-architecture.baseline.json` delete exactly these 12 `crossFeatureEdges` strings. Both endpoints in each pattern are prefixed `apps/website/src/features/`.

- `{content-types,entries,forms,media,navigation,post,taxonomy,widgets}/publish-content.ts` → `publish-content/repo-handler.ts`.
- `theme/active-theme-publish-content.ts` → `publish-content/repo-handler.ts`.
- `{entries,post,widgets}/publish-content.ts` → `publish-content/content-references.ts`.

Also delete the `development/scripts/error-gate-debt.json:127–131` object for `apps/admin/src/features/plugins/hooks/use-admin-surface-frame.hooks.ts`, rule `catch-reads-error`, value `1`. Fix the comma. Leave all thresholds, `meta`, and other stale-but-live-target edges untouched. Do not run `--update`.

**Verification.** No new tooling fixture or mutation. After the source fixes, Opus runs the architecture checker and error gate and verifies both are green. The isolated diff must show exactly 13 entries removed, 12 edge strings and one debt object, with no added debt.

## OPUS

### A01 — Publish contract ownership, rows 07, 11, 14, 20, 21, 22, 24, 27, 28, 38, 39, and 43
BUILDER: OPUS  
OWNER-DEFAULT: 1

**First pin.** Existing publish round trips exercise a missing optional slice, media verification with a legacy unset content type, post replacement rollback, and an active-theme apply that observes the host’s live array. `M-publish-bag-snapshot` copies that array at bind time and must fail the theme pin. Keep entries, taxonomy, and widgets registration, apply, and undo characterization as part of this slice.

**Change.** Use the CMS-owned media slice directly in `features/media/verify-published-media.ts`. For content types, forms, media, navigation, post, and active-theme handlers, use the actual slice type and parameterize the gateway’s bag where the callback still needs it. Instantiate with the full Tovu bag at the host registry. **Closes rows 07, 14, 20, 21, 22, 24, 27, 28, 39.** Apply the same parameterization to `features/{entries,taxonomy,widgets}/publish-content.ts`, closing **11, 38, and 43 at source**. No baseline additions and no A16 build sheet.

Move `RemovePostFn`, currently declared in `features/post/post-trash.ts`, and the `DiscoveredTheme` view read at `features/publish-content/tovu-publish-ports.ts:4` to a non-feature host module, `platform/publish-contracts.ts`. Put `ForgetRemovedPostFn` there for A14 too. Repoint `post/post-trash.ts`, `tovu-publish-ports.ts`, `server/runtime/composition/content-publish-ports.ts`, the theme definer or consumers of the moved view, and A14’s `widgets/deps.ts:6`. A feature-to-platform type import is outside the cross-feature pair rule. Delete `post/contracts.ts`, which only re-exports the two post types, once its importers are repointed. Retain the product intersection, optionality, live references, and single blob-index instance. Do not move theme implementations or Tovu-only fields to Jini core.

### A02 — Credential and OAuth contract direction
BUILDER: OPUS

**First pin.** In host bindings, credential-copy, vault-read and disconnect fixtures, pin grant lookup in the right workspace, no read for an ungranted site, and shared-owner disconnect affecting only the addressed owner. `M-unscoped-vault-reader` ignores the site grant.

**Change.** Move shared signatures out of their implementation files. `host-bindings.ts` needs the contribution loader and the credential repository interface, not the lifecycle or custom-credentials feature. Give `credential-copy-tool.ts` the subset of `ProjectKeysPort` it calls. Move the structural vault reader type out of `attached-vault.ts`, and replace `ReturnType<typeof createSharedOAuthOwnerStorage>` at the disconnect seam with an explicit contract. Reuse canonical core contracts when the shape matches. Keep owner and grant semantics as existing host bindings. This removes five type edges, not five services.

### A03 — Asset transfer and theme policy
BUILDER: OPUS

**First pin.** A disallowed theme write fails preflight with no writes, a successful theme batch reloads once, and library saves retain their current document and failure responses. Pin the same shape-error mapping in copy and image transform. `M-theme-check-after-write` must fail the no-write assertion.

**Change.** Inject the library saver plus archive-reader binding, and a small host theme port for permission, lookup, writability and reload through the existing asset/tool deps. Inject the shape predicate in both copy and transform, or use the identical neutral error contract if already shared. Build those bindings at the Tovu tool composition root. Don’t replace an edge to `theme/asset-operations.ts` with one to `theme/index.ts`. Don’t fold in combine-21’s separate asset-video conversion issue.

### A04 — Vault binding and source-control target policy
BUILDER: OPUS

**First pin.** Resolve and describe a credential by label in the correct scope without disclosing its secret. Preserve `credentialHint` and refusal behavior for an invalid repository target, with no write call after refusal. `M-write-before-target-check` inverts the order.

**Change.** Deployments and source control receive a bound credential vault/scope/hint collaborator. `source-control/tool-registrations.ts` receives label resolution and safe description through its existing deps. Inject the existing target validator into `write-port.ts`. Keep provider-specific rules in their owner, and preserve the check on the **selected credential’s** repository target. No credential implementation transfers between Jini packages.

### A05 — Boot repair’s Trash lookup, row 12
BUILDER: OPUS

**First pin.** A wrong-owner historical row takes its existing registered Trash path, the narrowly defined unregistered case retains its current behavior, and a failed removal rolls back the marker. Valid and already-trashed rows remain unchanged. `M-repair-fallback-on-registry-hit` forces fallback on a registered type.

**Change.** Add required `registeredTypes: () => Iterable<TrashEntry>` to the existing required objects of `removeUnreadableOwnerEntries` and `ownerEntryRemovalFor`. `TrashEntry` is the existing Jini contract matching what the `.find` at `features/entries/unreadable-owner-entries-repair.ts:52` reads. Bind `() => buildTrashRegistry().values()` at `server/runtime/composition/boot-data-repairs.ts`. Remove the `:4` registry import from the repair. Leave the `optional.removalFor` default at `:126` in place, threading the supplied lookup through its closure. Update the dialect and Postgres fixtures, including direct `ownerEntryRemovalFor` calls. Preserve locking, transactional re-check, version matching, marker, and reporting. Do not generalize the repair into a delete tool.

### A06 — Hosted MCP sign-in link binding, row 13
BUILDER: OPUS

**First pin.** Through `features/external-mcp/external-mcp-oauth.ts`, pin the same server ID, workspace ID, callback binding, and unauthenticated refusal in the existing sign-in flow. `M-link-uses-default-workspace` ignores the supplied workspace.

**Change.** Replace the module constant `tovuSignInPorts` at `:121` with `createTovuSignInPorts({ signInLink }: { signInLink: HostedMcpSignInPorts["signInLink"] }, _optional = {}): HostedMcpSignInPorts`. Use the injected value at `:133` and add `signInLink` to the required args of `createExternalMcpOAuthService` at `:166–167`. Bind `hostedMcpSignInLink` at both verified construction sites, `server/runtime/composition/site-deps/route-deps-assistant-mcp.ts:164` and `server/runtime/composition/memory-deps/route-deps/assistant-and-site.ts:92`. The reviewed `modules/external-mcp.ts` mounts routes using the composed service. It does not construct it.

Delete the `:4` import from the feature. Update `features/external-mcp/__tests__/h2c/sign-in-ports.test.ts` and the `h3/moved-shims.test.ts` identity assertion to call the factory. Supply the real binding or a fixture at existing service test constructors, including frozen harnesses, without rewriting historical baselines. Preserve encoding and callback trust policy. Do not add a new route or URL builder.

### A08 — Mail capture-clear planning, row 17
BUILDER: OPUS

**First pin.** Denied permission and declined approval both leave capture rows alone. An approved operation uses the scoped plan and retains the existing count and refusal semantics. `M-capture-clear-before-confirm` moves the effect into the planning path in the fixture.

**Change.** Pass the bound planner as a required collaborator in `contributeMailDeliveryTools({ planCaptureClear })`. Move both `createMailCaptureRepo({ db })` and the existing permission binding at `features/mail-status/delivery-tool-registrations.ts:67–70` into the mail/tool binder, and supply it at the manifest’s `:450` registration. Update the delivery visibility fixture. Remove the value import at `:19` **and** `type CaptureClearPlan = Awaited<ReturnType<typeof planMailCaptureClear>>` at `:56`. Declare the plan structurally in the registration file or take it from a non-feature or Jini contract. A type import from `mail/capture-clear.ts` would leave row 17 open. Keep planning, confirmation, and execution distinct. Do not export a general-purpose capture-delete collaborator.

### A10 — Publish-trust provisioning owner
BUILDER: OPUS

**First pin.** HTTP and assistant connect flows share the same committed config path even when the test runs from a different working directory. Malformed or refused provisioning does not write. `M-provision-from-cwd` uses `process.cwd()` for one mount.

**Change.** Supply the assembled committed-config provisioning port from publish composition. Remove the tool registration’s direct `publish-trust/host-settings.ts` import and local reconstruction. Keep repo-relative resolution, approved IO and existing refusal mapping in the host.

### A11 — Backup plugin catalog and import policy
BUILDER: OPUS

**First pin.** An archive still excludes the same bundled files, inventory finds the same bundled server IDs, and a soon-locked plugin cannot be restored through the archive path. `M-import-missing-soon-policy` treats every plugin as unlocked.

**Change.** Inject `selection`, `listBundledAgentPluginServers`, and `findSoonAgentPlugin` through the existing export, inventory and import args. In particular, remove the production `selection ?? SELECTED_AGENT_PLUGIN_PACKAGES` fallback inside backup code. Bind the catalog and soon policy once at the host. Synthetic fixtures need no live plugins or credentials.

### A12 — Backup restore containment and search projection, rows 31 and 33
BUILDER: OPUS

**First pin.** An outside `sourceDir` is refused before restore placement. The projected backup database uses the existing `tovu_search` and version marker policy, and retains the private-table exclusions. `M-restore-skip-containment` and `M-share-default-search-config` each fail their corresponding pin.

**Change.** In `features/site-backup/import-restore-placement.ts`, inject **both** `checkSourceDirContainment` and `loadTheme`, removing imports at `:4–5`. Replace `type CompiledBuild = Parameters<typeof checkSourceDirContainment>[0]["build"]` at `:21` with a neutral structural shape. Thread the bound ports through the existing restore and held-back-theme callers, including `features/site-backup/import-restore.ts` and `server/runtime/composition/modules/theme-held-back.ts`. Inject `PostSearchHostConfig` into `features/site-backup/share-database/repo.sqlite.ts` from the same host binding post search uses. Preserve stored names, tables, archive format, and live schema.

### A14 — Widget embed post callbacks, rows 40–42
BUILDER: OPUS

**Dependency.** A14 depends on A01’s type move. Build A14 after A01.

**First pin.** Widget embed updates use the live editor’s post update path and version guard. Rollback calls the forward restore on the original repository instance, retaining its prototype methods and the existing outbox behavior. `M-widget-spread-post-repo` substitutes a spread copy.

**Change.** Supply update, restore, and typed forgetting via the existing `WidgetHostPorts.posts` seam and host composer. Repoint the tool, publish, render, and composition callers of `buildWidgetHostPorts`, including the read-only fallback and full-repo binding. Use `ForgetRemovedPostFn` from A01’s `apps/website/src/platform/publish-contracts.ts`, the same non-feature module that owns `RemovePostFn`. Do not retain `features/post/contracts.ts` as a re-export. Preserve the captions collaborator and outbox bridge. The older `widgets/deps.ts → content-types/write-service.ts` pair is not one of the 43.

### R01 — Prefix Jini CSS in matched slices
BUILDER: OPUS

**First pin.** For each converted screen, assert the intended visual state or computed style and its accessible interaction, including a host that supplies the corresponding stylesheet. `M-rename-markup-only` changes one class without changing its selector.

**Change.** Use `jini-admin-`, `jini-ui-`, `jini-user-management-`, `jini-chat-`, `jini-commerce-`, and `jini-devops-` for classes owned by the corresponding packages. Start at `packages/admin/src/react/shell/AdminShell.tsx:31,89–95` and `packages/ui/src/features/interactive-ui/providers/shadcn/checkbox-field.tsx:20`. The checkbox’s `flex items-center gap-2` are Tailwind utilities. Replace them with an owned, prefixed rule with equivalent computed layout, then verify it visually. Before renaming shell tokens, map selector owners and preserve any host selectors still in use through a matched compatibility alias or the existing host class contract. In Tovu, `apps/admin/src/styles.css:1389,1478–1486,1732` and `App.chrome.tsx:139–152` are evidence that `boot-screen` and `admin-topbar*` are not safe to drop blindly. Preserve data attributes, active and disabled states, specificity, and responsive behavior. Do not edit Tovu themes to reduce the count.

### R02 — Neutral copy and citations
BUILDER: OPUS

**First pin.** Render two hosts using distinct injected product copy, and verify the translated text, interpolation and fallback remain correct for each. `M-leak-default-product-name` restores one Jini-side product default.

**Change.** K3 means product copy enters through a **new field on an existing args object**, including an existing translator args object where appropriate. Move actual UI/help copy through that seam. If no reachable args object exists, hold the hit for its owning seam instead of inventing a wrapper. For `PORT.md`, README, and ID hits, retain the reason and point to a real neutral owner or host note. Start in CMS, user-management, and admin, which account for 404 of the 536 lexical ID lines. Do not bulk-replace immutable historical records or turn copy cleanup into a persisted-identifier migration. Lexical totals are starting inventories, not a reviewed list of live strings.

### R03 — Legacy vocabulary and persisted identifiers
BUILDER: OPUS

**First pin.** An N-1 manifest or OAuth config still reads the old spelling, current writes use the existing canonical spelling, and legacy share artifacts retain their current read behavior. Test each migration at the boundary where it is actually interpreted. `M-drop-legacy-read` disables one existing fallback and must fail its old fixture.

**Change.** Triage `agent-plugins/src/core/identity-namespace.ts`, `plugins/src/host/plugin-format.ts`, the Calendly/S3/Vercel files and the catalog references separately from display copy. Inject host-specific legacy descriptors where they belong to the host. Keep explicitly supported legacy reads and recognize historical changelog entries as such. Don’t rename an artifact key, extension namespace, SDK import alias or credential field in place.

### R05 — Jini hooks required, including existing defaults
BUILDER: OPUS

**First pin.** A `CommentsPage` or `EditMediaPanel` mounted with a known fake receives its output. Tooling fixtures distinguish required props, defaulted props, React built-ins, and a real local custom-hook call. `M-checker-accept-default` makes the strict fixture fail.

**Change.** Use `CommentsPage.tsx` and `EditMediaPanel.tsx` as canaries. Make the hook props required, delete default imports, and update mounts and tests before processing admin, UI, chat, user-management, and UI-kit by domain. The 537 defaulted or optional binding candidates are not all verified violations. Update the two repos’ checkers and fixtures so that parameter and body destructuring, property access, and aliases are recognized only when backed by a required collaborator. Preserve existing recognition of required destructuring and React built-ins. Make diagnostics recommend required props, not fallback hooks. This is component injection, not a ban on composition inside custom hooks.

### R07 — Exported args-object migration
BUILDER: OPUS

**First pin.** At each exported entry, assert the object-form call works from a real importer and preserves omitted-option behavior. `M-drop-optional-default` fails the omission case.

**Change.** Triage the **40 Tovu / 414 Jini** exported flags by subpath and actual callers before converting, starting with Tovu website and Jini agent-plugins/UI. Include examples, package API surfaces and paired Tovu callers in the same rollout. Don’t convert React components to two parameters, or change an external adapter callback signature. Where a published API really changes, use the existing API/changeset process, not a second forwarding API.

### R09 — Jini compatibility shells
BUILDER: OPUS

**First pin.** Import the real package owner from a consumer fixture, verifying type compatibility and, for live exports, identity and behavior. `M-one-consumer-back-to-shell` restores the old path to a fixture. Keep the current CMS settings identity witness until the release decision is applied.

**Change.** Keep `cms/settings` until the release after the one that introduced the deprecation. `packages/cms/CHANGELOG.md:171–178` records the one-release promise under `0.5.3`. Later versions are listed, but confirm the actual published compatibility release before removing `./settings`. The still-live `packages/cms/src/__tests__/settings-compatibility.contract.test.ts:5` imports the old path. `packages/cms/docs/spec/api.spec.md:305` names it. The paired Tovu source has `settings/site/*` consumers, which are distinct and must stay. Use a changeset and owner-signed API-surface change for the published removal, not an automatic baseline refresh.

For the other candidates, delete only after the exact Jini and Tovu consumer grep, including relative imports, barrels, tests, exports, and aliases, is pasted into the execution sheet. The checked merge-21 anchors establish these repoint groups:

- `cms/src/seo/xml-escape.ts` → core text. Direct hits in `feed.ts`, `sitemap-documents.ts`, `index.ts`, and `__tests__/entry.test.ts`. Repoint real downstream `escapeXml` consumers instead of preserving a second SEO export shell.
- `oauth/src/{args,ports}.ts` → `@jini-ai/core/contracts/oauth`. Relative consumers include `authorization-code`, `device-code`, `discovery-policy`, `discovery`, `dns-pinned-transport`, `endpoint-safety`, `file-registration-cache`, `guarded-transport`, `index`, `loopback-receiver`, `node-file-cache`, `oidc`, `options`, `pending-authorizations`, `pkce`, `refresh`, `registration-cache`, `registration`, `registry`, and `resource`. Include the remaining test and relative hits in the deletion diff. Preserve the genuine public OAuth implementation surface.
- `platform/src/mail/{engine-contracts,ports,types}.ts` → `@jini-ai/core/contracts/mail`. Checked local hits include the mail `index`, `adapter-module`, `builtin-providers`, `delivery-availability`, `delivery-wrapper`, `feedback-route`, `feedback`, `mail-status`, `policy`, `prepare-sender-email`, `provider-setup`, `provider`, `purpose-scoped-mailer`, `rate-limit`, `resolve-mailer`, `sender-domain-verification`, `sender-identity`, `smtp`, and engine/resolver tests. The `activity/` module’s own `ports.ts` is a different file.
- `platform/src/secrets/{ports,types}.ts` and `secrets/credential-sets/types.ts` → `@jini-ai/core/contracts/vault`. Checked local hits for the base types include `secrets/index.ts`, `passphrase-envelope.ts`, and `secret-sealer.aesgcm.ts`. Confirm each remaining relative and public consumer separately.

No exact Tovu production imports of the old `cms/settings`, `oauth/ports`, or candidate deep mail/vault shell paths were found in the targeted checks. Do not infer an empty consumer list from that for every alias or export. Once the complete lists are attached, the remaining mechanical repoints can be issued separately to SOL.

### K01 — Make R8 select capabilities, not CLI names
BUILDER: OPUS

**First pin.** A synthetic runtime def supplied by the host can drive launch, stream and tool receipts using only injected strategy contracts. Run the existing R8 characterization with two different fakes. `M-hardcode-cli-dispatch` dispatches on the first fixture’s ID.

**Change.** Extend the existing `AgentRuntimePort` in `packages/daemon/src/ports/agent-runtime.ts` and its `packages/agent-runtime/src/runtime-port-bindings.ts` binding with the smallest strategy slices for staged launch, MCP delivery, and tool receipts. Put shared structural inputs in core only if both packages need them. Keep process execution, event journaling, and generic orchestration in daemon. Host composition binds the runtime as today. No parallel registry or daemon-to-agent-runtime implementation import.

The current `launch.ts` has 93 vendor-name hits in the review inventory. `mcp-bridge.ts:5–9` imports Antigravity, OpenCode, Claude, and Codex directly, and `tool-call-receipts.ts:1–9` selects vendors directly. These are measurable K01–K03 closeout targets. Extend `scripts/guard.ts`, or wire a dedicated vendor-neutrality checker into it, so `pnpm guard` checks `daemon/src/**` and `server/src/**` for `codex|claude|opencode|gemini|antigravity|xai|grok`. Allow only explicitly listed, path-scoped comment mentions that still explain migration history. Do not allowlist imports, code identifiers, vendor configuration, or static registrations. Pin rejection using a synthetic retained reference. Verify the guard across K01–K05 at combine, after the moves have landed.

### K02 — Codex, Claude, and Antigravity staging
BUILDER: OPUS

**First pin.** Use the R8 argv/env characterization plus the Codex isolation and cleanup suites, Claude config and subagent-start pins, and Antigravity permission-order tests. Refused starts acquire no resources. `M-stage-before-refusal` fails the acquire-order assertion. Use fake credentials and injected filesystem fixtures.

**Change.** Move Codex home/config/isolation and MCP delivery into `packages/agent-runtime/src/defs/codex/`, Claude config/filesystem/MCP/subagent startup into `defs/claude/`, and Antigravity permission preparation into `defs/antigravity/`. Move tests and why-comments with the code. `packages/daemon/src/agent-executor/codex/home-staging.ts:80` links the existing `auth.json` into the run home, and the staged MCP config can carry a bearer token. Preserve credential ownership, isolation, and cleanup order. Keep generic staging/cleanup with injected IO. Replace direct launch and bridge maps with K01’s bound strategies. Moved files reach daemon **only through those strategies**, never through a daemon import of agent-runtime implementation.

### K03 — OpenCode, Gemini, Pi, and residual CLI routing
BUILDER: OPUS

**First pin.** Pin OpenCode config merging, Gemini and OpenCode receipt correlation, and Pi session cancellation and terminal delivery. `M-generic-receipt-id` strips a fixture-specific correlation field. Reuse K03a’s receipt and environment-key pins at combine.

**Change.** After K01, move the OpenCode `mcp-config.ts` implementation to `packages/agent-runtime/src/defs/opencode/` and Pi’s `pi-rpc-events.ts` dispatch to `defs/pi/`. The small Gemini and OpenCode receipt adapters and the three constants are K03a, not a second move here. Review the residual AMR/Mimo bindings, dispatcher format cases, and `defs/{opencode-acp,vibe,claude-compatible-args}.ts`. Move confirmed CLI-specific policy into its def and inject it into the generic executor. A genuinely shared protocol helper may stay shared. Repoint consumers, move tests and why-comments, and preserve identifiers, cancellation behavior, and wire protocol. This is not the separate ACP adoption proposal.

### K04 — xAI OAuth and search plugin
BUILDER: OPUS  
OWNER-DEFAULT: 6  
OWNER-DEFAULT: 7

**First pin.** Extend the existing `packages/daemon/src/http/__tests__/xai.test.ts` characterization and route harness for status/body parity, listener lifecycle, timeout, and safe error disclosure. `M-duplicate-listener-slot` breaks the one-listener pin. Move vendor-specific tests with the code and keep a neutral host-mount witness.

**Change.** Move the xAI route declarations, token/search adapters, OAuth preset, and xAI-specific callback configuration to `packages/provider-plugins/src/xai/`. Export `@jini-ai/provider-plugins/xai` and add its `catalog.json` entry. Move the concrete xAI preset and redirect helper from `packages/agent-runtime/src/providers/oauth-provider.ts` with their tests. Leave generic OAuth mechanics with their owner and inject them at the host.

Keep route definitions server-neutral, with narrow per-route deps. Tovu and the relevant examples mount the donated specs at host composition, **not** in `packages/server`. Inject OAuth and secure persistence behavior, listener lifecycle, fetch, clock, and error reporting. Preserve route paths, stored credentials, and the shared listener’s teardown behavior.

Remove `xaiRoutes` and vendor route exports from daemon `http/index.ts` and delete `http/xai.ts` without a shim. Delete `daemon/src/ports/xai-oauth.ts` and both declarations of its `./ports/xai-oauth` subpath in `daemon/package.json:36,80–83`. Repoint or move its fake-port and server typecheck witnesses. In server, remove `xaiRoutes` from `builtin-features.ts:42`, `options.xai` at `:94`, `xaiFeature` at `:551–567` and its feature-list entry at `:711`. Remove or generalize the remaining xAI mentions in `feature.ts`, `kernel-base.ts`, and `create-local-node-daemon.ts`, including the local daemon’s vendor listener slot. Add a changeset for the removed server option and daemon subpath and obtain owner sign-off on the public API-surface change. Q7 puts OAuth and search in this design-first lane after R8, not in P10-C2.

### K05 — Grok media provider contribution
BUILDER: OPUS  
OWNER-DEFAULT: 6  
OWNER-DEFAULT: 7

**First pin.** Reuse Grok adapter and engine fixtures for image generation and TTS with synthetic credentials, including an unsupported request and redacted failure. `M-media-ignore-injected-registry` restores static Grok selection inside the engine.

**Change.** Move `packages/integrations/src/media-providers/dispatch/providers/grok.ts` and tests to `packages/provider-plugins/src/xai/`. Introduce a provider-plugin **`media`** contribution kind carrying adapters shaped for the existing media-provider registry. Register the contribution at host composition, using Tovu’s existing media registry seam in `server/runtime/composition/deps.ts`, not a daemon or server built-in. Preserve availability during the paired host/plugin rollout, media kind IDs, and result behavior.

Delete the `registerGrok` import at `builtin-vendors.ts:7`, its registration at `:25`, and the Grok forwarding exports at `dispatch/index.ts:8`. Repoint their consumers and verify the xAI leftovers in the media `providers.ts` inventory at `:20,31,237`. The other 11 built-in media vendors stay in integrations. This sheet’s integrations neutrality claim covers xAI only. P10-C2 remains **media only** and is the paired media work, not a second Grok implementation and not OAuth or model proxy.

### K06 — Model-proxy provider policy out of daemon
BUILDER: OPUS  
OWNER-DEFAULT: 6  
OWNER-DEFAULT: 7

**First pin.** In `packages/daemon/src/http/__tests__/model-proxy.test.ts`, use two assembled provider fixtures with different capabilities and pin selection, unsupported-provider responses, non-streaming normalization, and error projection. `M-proxy-static-provider-list` makes the injected fixture unreachable.

**Change.** Keep generic HTTP validation, authorization, and response mapping in daemon. At `packages/daemon/src/http/model-proxy.ts:470`, move Anthropic, OpenAI, Azure, Google, and Ollama request and tool-turn policy behind per-vendor subpaths under `@jini-ai/provider-plugins`. Tovu and example hosts import the registration factories and inject registrations into the existing daemon seam. `packages/server` must not assemble vendor registrations. Keep `ProviderToolTurnPort`, existing advertised options, and error mapping. There is no current xAI arm in this registry. Do not add one. Pair with G18 as one implementation slice. This is the §K design-first lane after R8, not P10-C2.

### G01 — Assistant transport and durable-run subscription
BUILDER: OPUS

**Change.** In `packages/chat/src/core/assistant-client/transport.ts`, split `createAssistantTransportClient` and its `createAssistantTransport` builder into run start/continuation, stream subscription/replay, and abort/disposal helpers sharing the same closure state. In `durable-run-subscription.ts`, separate `followDurableRun` subscription decisions from frame delivery and teardown.

**First pin.** Pin a disconnect, reconnect with replay and caller abort. Assert ordering, no duplicate events and one teardown. `M-replay-from-zero` ignores the stored cursor.

### G02 — SQL chat store and run ledger
BUILDER: OPUS

**Change.** In `packages/chat/src/store/sql/store.ts`, separate `createSqlChatStore` and `writeMessage` row encoding from transactional writes. In `store/runtime/{durable-run-store,run-ledger}.ts`, separate query, transition and idempotency handling without splitting transactions. In `store/legacy/sqlite/conversations.ts`, split `conversationSummarySql` into named query fragments without changing SQL or parameter order.

**First pin.** Pin ledger replay, accepted-request races and old/new SQL row parity with fixtures. `M-ledger-nonatomic-finish` moves the terminal write outside its transaction.

### G03 — Durable recovery and run finalization
BUILDER: OPUS

**Change.** In `packages/chat/src/server/durable-runs/recover.ts:createDurableRecovery` and `run-finalizer/entry.ts:createAssistantRunFinalizer`, extract recovery eligibility separately from side effects and finalizer data preparation from settlement. Keep the order of claims, persistence and notifications.

**First pin.** Pin recovery of a lost connection, a preexisting terminal run, and two finalization attempts. `M-finalize-twice` removes the already-settled guard.

### G04 — Frontend session bridge
BUILDER: OPUS

**Change.** In `packages/chat/src/embed-widget/browser/frontend-session-bridge.ts`, split `createFrontendSessionBridge` attachment/invocation result handling from lifecycle. In `openFetchFrontendStream.connect`, the cognitive candidate at 11, split one fetch/read attempt from reconnect scheduling.

**First pin.** Use `frontend-session-bridge.test.ts` for reconnect, terminal HTTP statuses, abort during read, same-origin credentials and stale attachment rejection. `M-retry-403` makes a terminal refusal retry.

### G05 — Parser and tagged text state machines
BUILDER: OPUS

**Change.** In `packages/chat/src/core/util/parser.ts:createArtifactParser`, both `createTaggedTextSuppressor` implementations in `agent-runtime/src/agent-protocol/acp/` and `artifacts/src/`, and cognitive candidate `chat/src/core/question-form/scan.ts:balancedObjectEnd` (13), extract parser transitions and separate quoted-token advancement from brace accounting. Pin distinct consumers before considering any dedupe.

**First pin.** Feed escaped quotes, embedded braces, a truncated object and tags split over chunk boundaries. Assert output byte parity and that suppressed text stays suppressed. `M-close-on-quoted-brace` treats a brace in a string as structure.

### G06 — Executor launch
BUILDER: OPUS

**Change.** In `packages/daemon/src/agent-executor/launch.ts`, after K01–K03, split `createAgentExecutor` and its `run` into run admission, resource preparation, spawn handoff and cleanup using one typed run context. Avoid extracting a helper that still captures half the factory.

**First pin.** Reuse R8 lifecycle pins and add acquire/release ordering for post-staging failure. `M-double-release-staged-home` runs the disposal path twice.

### G07 — Daemon scheduler, idle, trace, and stores
BUILDER: OPUS

**Change.** In `packages/daemon/src/`, target `routines/routine-store.ts:createInMemoryRoutineStore`, `routines/scheduler.ts:RoutineService.start_` (called at `:176,202`), `core/tool-gaps.ts:createToolGapCollector`, `ai-trace-lifecycle.ts:withAiTracing`, and `idle-monitor.ts:createIdleMonitor`. Extract store transitions, scheduler subscription/cleanup, gap aggregation, trace context/emission, and idle effects independently.

**First pin.** Pin scheduler start/stop, idempotent run and idle expiry with a fake clock, and an allowed-only trace record. `M-emit-after-stop` lets one scheduled callback escape teardown.

### G08 — Built-in features and plugin runtime
BUILDER: OPUS

**Change.** In `packages/server/src/builtin-features.ts:createBuiltInFeatures` and `packages/plugins/src/host/node/runtime-core.ts:createPluginRuntimeCore`, move feature assembly by lifecycle responsibility and plugin validation/activation/disposal by phase. Keep orchestration order and injected dependencies. Coordinate the server extraction after K04/K06.

**First pin.** Pin mount/dispose order, unavailable-feature behavior, and activation rollback. `M-dispose-in-install-order` reverses the unwind order.

### G09 — Sidecar JSON IPC
BUILDER: OPUS

**Change.** In `packages/sidecar/src/json-ipc.ts`, split `requestJsonIpc` and its callback. Extract request encoding and reply parsing separately from close/timeout settlement. Keep one owner of final resolution and timer/socket cleanup.

**First pin.** Pin partial replies, malformed replies, timeout and a late reply. `M-late-reply-resolves` permits a second settlement.

### G10 — Agent plugin lifecycle
BUILDER: OPUS

**Change.** In `packages/agent-plugins/src/`, target `lifecycle/{activation,trusted-plugin-files,capability-projection,package-paths,set-enabled,search}.ts:buildModule` and `admin-surfaces/surface-handlers.ts:createAdminSurfaceHandlerHost`. Extract activation lock/read/write phases, trusted path resolution, pure projection/indexing, enable/disable transitions, and admin handler assembly separately. Land one file cluster at a time.

**First pin.** Begin with activation lock/reconcile and durable-write fixtures. Pin untrusted path refusal, enabled capability visibility and correct admin handler selection. `M-trusted-path-without-owner-check` must fail the path fixture.

### G11 — Guarded transport and stream handlers
BUILDER: OPUS

**Change.** In `packages/agent-runtime/src/providers/`, target `connection-guard.ts:pinnedFetch` and its callback, `qoder-stream.ts:createQoderStreamHandler`, and `role-marker-guard.ts:createRoleMarkerGuard`. Split guarded request setup from response handling, and parser state from event translation.

**First pin.** Pin existing guarded transport refusal and safe redirect semantics, plus chunk-stable Qoder and marker output. `M-drop-pinned-connection-binding` breaks the injected transport contract fixture.

### G14 — CMS services
BUILDER: OPUS

**Change.** In `packages/cms/src/`, target `publish/content/backstop-service.ts:createBackstopService`, `comments/site/types.ts:commentsDataModule`, `redirects/site/publish-content.ts:contributeRedirectPublish`, `themes/preview/watcher.node.ts:createThemeWatcher`, and `trash/write-service.ts:createTrashHandlers`. Extract precheck vs execution, data declarations vs mounting, redirect mapping vs apply, watcher event filtering vs scheduling, and Trash validation vs mutation. No host theme moves.

**First pin.** Pin exact backstop refusal/no writes, redirect round trip, watcher disposal and Trash conflict preservation. `M-trash-write-before-conflict-check` and `M-watcher-event-after-close` each target their own fixture.

### G15 — Commerce settlement and route assembly
BUILDER: OPUS

**Change.** In `packages/commerce/src/payments/ingest/settlement-worker.ts:createSettlementWorker` and `catalog/plugin-server.ts:createCommerceServer`, separate settlement claim/routing from persistence and map routes independently of host registration.

**First pin.** Pin duplicate settlement, failed effect rollback and route response parity. `M-settle-duplicate` skips the idempotency decision.

### G16 — Tool catalogs
BUILDER: OPUS

**Change.** Target `packages/core/src/tool-metadata/plugin-runtime.ts:createPluginRuntimeToolMetadata`, `db/src/recovery/agent-tools.ts:createRecoveryAgentToolCatalog`, `mcp/src/external/agent-tools.ts:{createExternalMcpAgentToolCatalog,saveInputSchema}`, `mcp/src/federation/registrations.ts:buildFederatedMcpRegistrations`, and `platform/src/mail/email-template-agent-tools.ts:createEmailTemplatesAgentToolCatalog`, all under `packages/`. Extract static metadata groups apart from schema and execution assembly.

**First pin.** Pin the registered names, schemas, risk metadata and unchanged denial behavior. Assert stored-credential metadata never emits secret values. `M-tool-risk-default-allow` removes a risk marker, and `M-schema-exposes-secret` includes a fixture secret.

### G17 — Export runner and analytics guards
BUILDER: OPUS

**Change.** In `packages/devops/src/deploy/site/export-run.ts:createExportRunner` and `packages/analytics/src/product/index.ts:withProductAnalyticsGuards`, separate staging/cleanup from export results, and consent/eligibility from dispatch.

**First pin.** Pin failed export leaves no staged output, and denied analytics emits no event. `M-analytics-before-consent` invokes the recording collector early.

### G18 — Model-proxy registry
BUILDER: OPUS

**Change.** Execute with K06 in `packages/daemon/src/http/model-proxy.ts:buildProxyProviderRegistry`. Separate generic lookup and route handling from registered adapter-specific maps.

**First pin.** Use K06’s provider fixture and pin error normalization for a failed adapter call. `M-proxy-default-on-unknown` routes a missing provider to the default engine.

### G19 — AG-UI and tool-call details
BUILDER: OPUS

**First pin.** Use `run-frames.test.ts` for safe wire errors and terminal order, with wrong thread/parent/interrupt fixtures for resume. Use `packages/chat/src/core/__tests__/tool-call-detail.test.ts` with a synthetic secret to pin redaction before truncation. `M-resume-ignore-parent`, `M-wire-original-daemon-error`, and `M-truncate-before-redact` must fail separate pins.

**Change.** In `packages/chat/src/core/ag-ui/event-projection.ts`, split `writeFrameOutcome` (13) frame presentation from terminal mapping and `readConfirmationResume` (11) ownership checks from decision decoding. In `packages/chat/src/core/tool-call-detail.ts`, split `describeToolCallDetail` (11) safe display formatting from note selection. Do not move this file into the core package or change redaction and disclosure order.

### G21 — Refusal, term sync, and video complexity
BUILDER: OPUS

**First pin.** Pin authorized versus anonymous error disclosure, denied term sync before writes, media refusal before reads, and lock release on failure. `M-refusal-show-auth-sentence`, `M-term-write-on-deny`, and `M-video-read-before-size-guard` must fail their corresponding pins.

**Change.** Target `packages/core/src/errors/reporter.ts:refusalError`, `packages/cms/src/taxonomy/site/publish-term-ids.ts:prepareTermSync`, `packages/cms/src/media/video-transcode.ts:readOriginalVideo`, and `packages/cms/src/media/video-transcode.ffmpeg.ts:100`, the `transcode` method returned by `createFfmpegMediaTranscoder` at `:94` (11 each in the source reconstruction). Extract audience choice from parameter rendering, term planning from authorized apply/revert, and video read guards from bytes and cleanup.

### G22 — Serialized page structure and performance collectors
BUILDER: OPUS

**Change.** In `packages/diagnostics/src/web-evidence/{page-structure-script,page-performance-script}.ts:{collectPageStructure,collectPagePerformance}`, extract responsibility-sized collectors via the existing `buildPageStructureExpression`/`buildPagePerformanceExpression` boundary. Keep one self-contained evaluation, structured-clone results, existing sampling limits, and the name shim. A plain module-scope hoist is invalid because the callback is serialized.

**First pin.** Pin the **serialized** output in the structure/performance fixtures, including cap markers and absence of form values or other raw browser data. `M-unbound-serialized-helper` omits one helper from the evaluated unit and must fail at that boundary.

### G23 — Web-clone browser evaluation
BUILDER: OPUS

**Change.** In `packages/agent-runtime/src/skills/web-clone/scripts/{recon-site,visual-diff,interaction-probe}.mjs`, target `collectSignals`, `compareInBrowser`, `candidates` and their three `page.evaluate` callbacks. Extract pure collection phases into a self-contained browser unit per operation, using G22’s isolation pattern if the packaging supports it. Retain one evaluation per snapshot. Keep inputs as data and don’t hoist free references into the Node process.

**First pin.** In a deterministic page fixture, pin ordering and caps, CSS read tolerance, pixel metrics, and candidate selectors. `M-split-evaluation-snapshot` changes the DOM between phases and must fail parity. `M-browser-free-reference` makes the serialized capture fail. If packaging cannot preserve the single snapshot, leave the callback intact and return that constraint to the owner.

## Combine closeout

- **Architecture.** Assert zero introduced cross-feature file pairs after A01–A14. Both source reconstructions found the same 43 additions. They differed by one on current pair and removal totals, so verify the actual pair set, not the net count. The previously fixed composition back-edges and assistant/server cycle must not return. A15 is exactly 12 stale baseline deletions plus one error-debt deletion. No `crossFeatureEdges` additions or full baseline refresh.
- **Owner-rule census.** Keep the prior 11,100 headline as a raw subtotal, not verified defects. The inherited counts are 1,804 Tovu and 7,774 Jini args flags, 957 Jini class literals, 29 Jini product-text lines, and 536 Jini ID lines. Recount these separately from hook candidates and forwarding shells. A green hook ratchet is not proof that props are required. Published-surface changes in R09 and K04 follow the changeset and owner sign-off process.
- **Size and complexity.** The prior source reconstruction yielded 64 non-UI size candidates and 11 complexity candidates across cyclomatic and cognitive rules. Confirm actual rule IDs and scores before cutting debt. Do not add an exception or delete a debt row merely because different counting methods disagree. UI sizing, additional unverified hook or forwarding forms, and the separate ACP adoption proposal are outside these sheets.
