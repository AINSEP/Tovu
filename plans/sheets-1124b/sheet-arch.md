SHEETS r62t-sheet-arch PARTIAL: arch 40/3; rule breaks now 11100 (was 16340); size 23 sheets; K left; 10 SOL / 44 OPUS sheets

**The 43 architecture rows are accounted for.** Forty should be fixed at source. Three are the combine-21 publish repoints and are eligible for an owner-approved baseline refresh. The R8 runtime port already exists, but the daemon still owns CLI-specific executor code and xAI is still built into the daemon and media dispatcher.

Measured Tovu `7c87b3c3f9` and Jini `010c8cd87`, both at `origin/integ/merge-21-2026-11-24`. The dispatch’s bootstrap exception applies. No files changed, and no tests, builds, installs, type-checks, or architecture checker were run. The planner’s 1,240-file input was used for ownership and sequencing, not as a substitute for either source tree.

`PARTIAL` means the strict hook and compatibility-shell counts are bounded candidate counts, not a complete semantic inventory. The size and complexity lists are source reconstructions, not fresh gate output. The 11,100 headline is the comparable **raw audit subtotal** for args, CSS, and product text/IDs. It excludes hooks and shells because Part C supplies no comparable 11-11 count for either.

### Build contract

Write the named regression test or characterization pin first. For each `M-…`, make the indicated temporary mutation and verify the pin fails, then revert the mutation. No test-result claims in these sheets. Preserve observable behavior and why-comments. Move code verbatim at the seam, then change wiring only. Use existing required/optional args objects and retain `_optional = {}` pads. React components take props only, and custom hook props are required. Shared contracts go in core, host policy stays host-side, and no Jini package imports another package’s implementation. Use the injected admin kit and domain `react/` folders. Keep themes in Tovu. New or split functions must be at most 80 lines and complexity 10, with Part G targeting at most 50 nonblank, noncomment lines.

## 1. Architecture

The checker compares **resolved file pairs**, including type-only imports, not just feature pairs or totals. Resolving both relative imports and `#src` aliases gives **172 current pairs vs 174 baseline pairs, with 43 additions and 45 removals**. The net drop of two does not cancel any new edge. Paths in the table are relative to `apps/website/src/features/`.

| # | Importer → resolved target | Disposition |
|---:|---|---|
| 01 | `api-connections/host-bindings.ts` → `agent-plugins/lifecycle.ts` | A02 |
| 02 | `api-connections/host-bindings.ts` → `custom-credentials/index.ts` | A02 |
| 03 | `asset-transfer/asset-destinations.ts` → `media/index.ts` | A03 |
| 04 | `asset-transfer/asset-destinations.ts` → `theme/asset-operations.ts` | A03 |
| 05 | `asset-transfer/asset-sources.ts` → `theme/asset-operations.ts` | A03 |
| 06 | `asset-transfer/copy-tool.ts` → `theme/asset-operations.ts` | A03 |
| 07 | `content-types/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | A01 |
| 08 | `custom-credentials/credential-copy-tool.ts` → `project-keys/service.ts` | A02 |
| 09 | `custom-credentials/vault-repo.ts` → `project-keys/attached-vault.ts` | A02 |
| 10 | `deployments/publish-credentials/store.ts` → `vendor-credentials/index.ts` | A04 |
| 11 | `entries/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | A16 PURE-REPOINT |
| 12 | `entries/unreadable-owner-entries-repair.ts` → `trash/registry.ts` | A05 |
| 13 | `external-mcp/external-mcp-oauth.ts` → `api-connections/browser-binding.ts` | A06 |
| 14 | `forms/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | A01 |
| 15 | `forms/tool-registrations.ts` → `content-duplication/copy-naming-policy.ts` | A07 |
| 16 | `image-transform/tool.ts` → `theme/asset-operations.ts` | A03 |
| 17 | `mail-status/delivery-tool-registrations.ts` → `mail/capture-clear.ts` | A08 |
| 18 | `media-generation/tool-registrations.ts` → `media/public-urls.ts` | A09 |
| 19 | `media-import/tool-registrations.ts` → `media/public-urls.ts` | A09 |
| 20 | `media/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | A01 |
| 21 | `media/verify-published-media.ts` → `publish-content/tovu-publish-ports.ts` | A01 |
| 22 | `navigation/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | A01 |
| 23 | `post/post-tool-duplicate.ts` → `content-duplication/copy-naming-policy.ts` | A07 |
| 24 | `post/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | A01 |
| 25 | `project-keys/shared-oauth-disconnect.ts` → `api-connections/shared-owner.ts` | A02 |
| 26 | `publish-content/tool-registrations.ts` → `publish-trust/host-settings.ts` | A10 |
| 27 | `publish-content/tovu-publish-ports.ts` → `post/contracts.ts` | A01 |
| 28 | `publish-content/tovu-publish-ports.ts` → `theme/catalog.ts` | A01 |
| 29 | `site-backup/bundled-export-file-policy.ts` → `agent-plugins/bundled-catalog.ts` | A11 |
| 30 | `site-backup/import-plugin-state.ts` → `agent-plugins/soon-lock.ts` | A11 |
| 31 | `site-backup/import-restore-placement.ts` → `theme/catalog.ts` | A12 |
| 32 | `site-backup/package-file-inventory.ts` → `agent-plugins/new-site-agent-plugin-tokens.ts` | A11 |
| 33 | `site-backup/share-database/repo.sqlite.ts` → `post/search-host-config.ts` | A12 |
| 34 | `site-search/cms-search-rules.ts` → `post/read-model.ts` | A13 |
| 35 | `source-control/store.ts` → `vendor-credentials/index.ts` | A04 |
| 36 | `source-control/tool-registrations.ts` → `custom-credentials/index.ts` | A04 |
| 37 | `source-control/write-port.ts` → `custom-credentials/write-files-validation.ts` | A04 |
| 38 | `taxonomy/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | A16 PURE-REPOINT |
| 39 | `theme/active-theme-publish-content.ts` → `publish-content/tovu-publish-ports.ts` | A01 |
| 40 | `widgets/deps.ts` → `post/contracts.ts` | A14 |
| 41 | `widgets/deps.ts` → `post/post-trash.ts` | A14 |
| 42 | `widgets/deps.ts` → `post/post-update.ts` | A14 |
| 43 | `widgets/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | A16 PURE-REPOINT |

### Architecture sheets in build order

**A01 — Publish contract ownership · BUILDER: OPUS**  
**First pin:** Existing publish round trips exercise a missing optional slice, media verification with a legacy unset content type, post replacement rollback, and an active-theme apply that observes the host’s live array. `M-publish-bag-snapshot` copies that array at bind time and must fail the theme pin.  
**Change:** Use the CMS-owned media slice directly in `verify-published-media.ts`. For content types, forms, media, navigation, post and active-theme handlers, use the actual slice type and parameterize the gateway’s bag where the callback still needs it. Instantiate with the full Tovu bag at the host registry. Extract the `RemovePostFn` contract and the theme catalog type or structural view the bag actually reads to neutral host contracts. Repoint their definers and callers, including `composition/content-publish-ports.ts`. Retain the product intersection, optionality, live references and single blob-index instance. Don’t promote theme implementations or Tovu-only fields to Jini core. Close nine rows at source.

**A02 — Credential and OAuth contract direction · BUILDER: OPUS**  
**First pin:** In host bindings, credential-copy, vault-read and disconnect fixtures, pin grant lookup in the right workspace, no read for an ungranted site, and shared-owner disconnect affecting only the addressed owner. `M-unscoped-vault-reader` ignores the site grant.  
**Change:** Move shared signatures out of their implementation files. `host-bindings.ts` needs the contribution loader and the credential repository interface, not the lifecycle or custom-credentials feature. Give `credential-copy-tool.ts` the subset of `ProjectKeysPort` it calls. Move the structural vault reader type out of `attached-vault.ts`, and replace `ReturnType<typeof createSharedOAuthOwnerStorage>` at the disconnect seam with an explicit contract. Reuse canonical core contracts when the shape matches. Keep owner and grant semantics as existing host bindings. This removes five type edges, not five services.

**A03 — Asset transfer and theme policy · BUILDER: OPUS**  
**First pin:** A disallowed theme write fails preflight with no writes, a successful theme batch reloads once, and library saves retain their current document and failure responses. Pin the same shape-error mapping in copy and image transform. `M-theme-check-after-write` must fail the no-write assertion.  
**Change:** Inject the library saver plus archive-reader binding, and a small host theme port for permission, lookup, writability and reload through the existing asset/tool deps. Inject the shape predicate in both copy and transform, or use the identical neutral error contract if already shared. Build those bindings at the Tovu tool composition root. Don’t replace an edge to `theme/asset-operations.ts` with one to `theme/index.ts`. Don’t fold in combine-21’s separate asset-video conversion issue.

**A04 — Vault binding and source-control target policy · BUILDER: OPUS**  
**First pin:** Resolve and describe a credential by label in the correct scope without disclosing its secret. Preserve `credentialHint` and refusal behavior for an invalid repository target, with no write call after refusal. `M-write-before-target-check` inverts the order.  
**Change:** Deployments and source control receive a bound credential vault/scope/hint collaborator. `source-control/tool-registrations.ts` receives label resolution and safe description through its existing deps. Inject the existing target validator into `write-port.ts`. Keep provider-specific rules in their owner, and preserve the check on the **selected credential’s** repository target. No credential implementation transfers between Jini packages.

**A05 — Boot repair’s Trash lookup · BUILDER: OPUS**  
**First pin:** A wrong-owner historical row takes its existing registered Trash path, the narrowly defined unregistered case retains its current behavior, and a failed removal rolls back the marker. Valid and already-trashed rows remain unchanged. `M-repair-fallback-on-registry-hit` forces the fallback on a registered type.  
**Change:** Supply the scoped `entries` adapter lookup or bind the existing `removalFor` at boot composition. Remove the `buildTrashRegistry()` import from the repair. Leave locking, transactional re-check, version matching, marker, and reporting untouched. Don’t generalize the repair into a delete tool.

**A06 — Hosted MCP sign-in link binding · BUILDER: OPUS**  
**First pin:** Through `external-mcp-oauth.ts`, pin the same server ID, workspace ID, callback binding and unauthenticated refusal in the existing sign-in flow. `M-link-uses-default-workspace` ignores the supplied workspace.  
**Change:** Inject `hostedMcpSignInLink` through the existing OAuth deps. Keep URL construction with the current browser-binding owner and bind it at the host. Preserve encoding and callback trust policy. Don’t add a new route or a second URL builder.

**A07 — Shared duplicate-name policy · BUILDER: SOL**  
**First pin:** Both form and post duplication produce the same numeric suffix from a name that already ends in a number, skip occupied names, and preserve the exhaustion message. `M-copy-of-fallback` substitutes a `Copy of …` builder in one mount.  
**Change:** Host composition passes the one `copy-naming-policy.ts` binding into form registration and post duplication. Preserve the existing `isTaken` queries and Jini’s bounded search. The shared algorithm already lives in CMS. Tovu suffix and wording stay host policy.

**A08 — Mail capture-clear planning · BUILDER: OPUS**  
**First pin:** Denied permission and declined approval both leave capture rows alone. An approved operation uses the scoped plan and retains the existing count and refusal semantics. `M-capture-clear-before-confirm` attempts the write from the planning path.  
**Change:** Pass `planMailCaptureClear` as a required planning collaborator to `delivery-tool-registrations.ts`. Bind it with the existing capture repo and permission check in mail/tool composition. Keep confirmation, execute and planning distinct. Don’t export a general-purpose capture-delete collaborator.

**A09 — Media public URL binding · BUILDER: SOL**  
**First pin:** Import and generation return the same original and transformed URLs for the same saved media, including the no-transform case and the current failure behavior. `M-return-original-for-rendition` bypasses the rendition branch.  
**Change:** Bind `resolveMediaPublicUrls` once at host composition, pass its narrow batch-shaped port into both registration modules, and preserve call order and error mapping. Don’t add another resolver or redirect the edge through a new barrel.

**A10 — Publish-trust provisioning owner · BUILDER: OPUS**  
**First pin:** HTTP and assistant connect flows share the same committed config path even when the test runs from a different working directory. Malformed or refused provisioning does not write. `M-provision-from-cwd` uses `process.cwd()` for one mount.  
**Change:** Supply the assembled committed-config provisioning port from publish composition. Remove the tool registration’s direct `publish-trust/host-settings.ts` import and local reconstruction. Keep repo-relative resolution, approved IO and existing refusal mapping in the host.

**A11 — Backup plugin catalog and import policy · BUILDER: OPUS**  
**First pin:** An archive still excludes the same bundled files, inventory finds the same bundled server IDs, and a soon-locked plugin cannot be restored through the archive path. `M-import-missing-soon-policy` treats every plugin as unlocked.  
**Change:** Inject `selection`, `listBundledAgentPluginServers`, and `findSoonAgentPlugin` through the existing export, inventory and import args. In particular, remove the production `selection ?? SELECTED_AGENT_PLUGIN_PACKAGES` fallback inside backup code. Bind the catalog and soon policy once at the host. Synthetic fixtures need no live plugins or credentials.

**A12 — Backup restore containment and search projection · BUILDER: OPUS**  
**First pin:** An outside `sourceDir` is refused before restore placement. The projected backup database uses the existing `tovu_search` and version marker policy, and retains the private-table exclusions. `M-restore-skip-containment` and `M-share-default-search-config` each fail their corresponding pin.  
**Change:** Inject `checkSourceDirContainment` and use a neutral input shape instead of deriving `CompiledBuild` from the theme implementation. Inject `PostSearchHostConfig` into the SQLite share projection from the same host binding post search uses. Don’t alter stored names, tables, archive format, or the live schema.

**A13 — Search projection input · BUILDER: SOL**  
**First pin:** The same post fixture produces identical indexed text with its title, body and metadata, including the empty-body case. `M-search-use-raw-row` skips `toRecord`.  
**Change:** Bind the post-row-to-search-document mapping where CMS search rules are composed. Keep the conversion and normalization with their owners and pass a projection callback to `cms-search-rules.ts`. Don’t create a second mapper or add hold-aware liveness work to this sheet.

**A14 — Widget embed post callbacks · BUILDER: OPUS**  
**First pin:** Widget embed updates use the live editor’s post update path and version guard. Rollback calls the forward restore on the original repository instance, retaining its prototype methods and the existing outbox behavior. `M-widget-spread-post-repo` substitutes a spread copy.  
**Change:** Supply update, restore and typed forgetting via the existing `WidgetHostPorts.posts` seam and host composer. Repoint the tool, publish, render and composition callers of `buildWidgetHostPorts`; cover the read-only fallback as well as the full-repo binding. Update `ForgetRemovedPostFn` to its neutral owner. Preserve the captions collaborator and the outbox bridge. The older `widgets/deps.ts → content-types/write-service.ts` baseline row is not one of these 43.

**A15 — Delete stale debt rows only · BUILDER: OPUS**  
**First test:** Add a narrow fixture to the existing architecture/error-gate tooling tests that checks the named deleted endpoints can be pruned without accepting an unrelated new edge or deleting live error debt. `M-preserve-dead-endpoint` restores one deleted entry.  
**Change:** Delete the Tovu `error-gate-debt.json` row for `apps/admin/src/features/plugins/hooks/use-admin-surface-frame.hooks.ts`, rule `catch-reads-error`, value `1`. No corresponding Jini debt row was found. Delete **12** architecture strings whose target is gone. Nine end at `publish-content/repo-handler.ts`, from content types, entries, forms, media, navigation, post, taxonomy, active theme, and widgets. Three end at `publish-content/content-references.ts`, from entries, post and widgets. Don’t regenerate the file or alter any numeric threshold.

**A16 — Three publish file-pair repoints · BUILDER: OPUS**  
**First pin:** Entries, taxonomy and widgets retain their existing registration, apply and undo outcomes, and the replacement imports are type-only. `M-unrelated-baseline-edge` adds a fourth allowlist pair and must fail a narrow diff assertion.  
**Change:** **Only after owner approval**, add precisely rows 11, 38 and 43 to `crossFeatureEdges` if they still remain after A01. Combine-21 names these three. The pre-x6 source already had the other six handler imports of the typed bag, so their former `repo-handler.ts` edges don’t certify them as fresh repoints. If approval is withheld, move the remaining shared type seam out of `features/publish-content` and repoint these consumers at source. No full `--update`.

## 2. Owner-rule census and sheets

The args count applies the referenced classifier to tracked source. It counts named declarations, methods, constructors and bound functions, omits inline call-context callbacks, and leaves opaque named types as unsure. It is a raw shape count, not a count of reviewed public API defects. The lexical product counts include comments and package docs. `hygiene-audit.mjs` is useful for distinguishing path and compatibility evidence, but does not provide a re-export-shell count. Its output-writing and network paths were not run.

| Rule | 11-11 | Merge-21 Tovu | Merge-21 Jini |
|---|---:|---:|---:|
| Args-object violations | Tovu 6,718, Jini 7,291 | **1,804 / 17,012**, 40 exported | **7,774 / 36,227**, 414 exported |
| Unprefixed JSX `className` literal attributes | Jini 1,230 | N/A, Jini-only rule | **957** |
| `tovu` text/path hits | Jini 542 | N/A, Jini-only rule | **29** text lines, 0 paths |
| Tovu-style `SPEC`/`ADR`/`U`/`D` ID lines | Jini 559 | N/A, Jini-only rule | **536** |
| Direct custom-hook calls under each checked-in scanner | No Part C count | **33** | **0** |
| Direct calls through defaulted or optional destructured hook bindings, strict-owner candidates | No comparable count | **237** | **537** |
| Whole files forwarding only to another `@jini-ai` owner | No comparable count | **1** | **10** |

The separate historical args note says **7,319** for Jini. The headline uses **7,291**, the figure in the requested Part C. The source scan also has 1,168 Tovu and 3,186 Jini unsure signatures, outside the violation count. The later hooks inventory recorded 284 Tovu and 587 Jini **direct** calls under its own snapshot. It is not a baseline for required-vs-defaulted props. In particular, Jini’s zero is consistent with its checker accepting a defaulted hook, not with all props being required. The simple defaulted-binding count misses aliases such as Tovu’s `props.useMediaHook ?? useWiredMedia`, and the shell count excludes mixed adapters and local forwards. Conversely, not every forwarding candidate should be deleted without checking the public API.

**R01 — Prefix Jini CSS in matched slices · BUILDER: SOL**  
**First pin:** For each converted screen, assert the intended visual state or computed style and its accessible interaction, including a host that supplies the corresponding stylesheet. `M-rename-markup-only` changes one class without changing its selector.  
**Change:** Start with admin’s 486 and UI’s 318 hits, followed by user-management 71, chat 44, commerce 35 and devops 3. Start concretely at `admin/src/react/shell/AdminShell.tsx` and `ui/src/features/interactive-ui/providers/shadcn/checkbox-field.tsx`. Rename owned tokens with selectors and all host/test consumers. Replace shared utility tokens with equivalent prefixed owned styles where they aren’t an injected class contract. Preserve data attributes, active/disabled selectors, specificity, and approved host selectors until their matched migration. Never edit Tovu themes to lower this count.

**R02 — Neutral copy and citations · BUILDER: SOL**  
**First pin:** Render two hosts using distinct injected product copy, and verify the translated text, interpolation and fallback remain correct for each. `M-leak-default-product-name` restores one Jini-side product default.  
**Change:** Handle true UI/help copy through a field on the existing K3 args or translator object. For `PORT.md`, README and ID hits, retain the reason and point to a real neutral owner or host note. Start in CMS, user-management and admin, which account for 404 of the 536 ID lines. Don’t turn bulk text replacement into a compatibility migration or rewrite immutable historical records just to lower a count. If a live copy hit has no reachable args object, hold it for the owning seam rather than inventing a wrapper.

**R03 — Legacy vocabulary and persisted identifiers · BUILDER: OPUS**  
**First pin:** An N-1 manifest or OAuth config still reads the old spelling, current writes use the existing canonical spelling, and legacy share artifacts retain their current read behavior. Test each migration at the boundary where it is actually interpreted. `M-drop-legacy-read` disables one existing fallback and must fail its old fixture.  
**Change:** Triage `agent-plugins/src/core/identity-namespace.ts`, `plugins/src/host/plugin-format.ts`, the Calendly/S3/Vercel files and the catalog references separately from display copy. Inject host-specific legacy descriptors where they belong to the host. Keep explicitly supported legacy reads and recognize historical changelog entries as such. Don’t rename an artifact key, extension namespace, SDK import alias or credential field in place.

**R04 — Tovu hook injection · BUILDER: SOL**  
**First pin:** Pass a distinct fake hook through the actual admin composition and assert its state reaches the screen. `M-media-hook-local-fallback` restores a local fallback and must fail a required-prop source or type fixture.  
**Change:** Start with the 33 hits in `AiAssistant.tsx`, `CollectionEntryEditor.tsx`, `Database.tsx`, `Media.tsx`, `PageEditor.tsx`, `AgentPluginDetailsModal.tsx`, `AgentPlugins.tsx` and `PluginProviderSettingsDialog.tsx`. Distinguish actual local calls from prop aliases the scanner fails to resolve, then remove optional/default aliases in the same surface. Fix at mounts, panels and host bindings. Retain hook call order. Don’t thread products into the Jini kit.

**R05 — Jini hooks required, including existing defaults · BUILDER: SOL**  
**First pin:** A `CommentsPage` or `EditMediaPanel` mounted with a known fake receives its output. Tooling fixtures distinguish required props, defaulted props, React built-ins and a real local custom-hook call. `M-checker-accept-default` makes the strict fixture fail.  
**Change:** Use those two components as canaries, then process admin, UI, chat, user-management and UI-kit in domain batches. Repoint host mounts and tests as each default is removed. Jini’s checker already recognizes required parameter destructuring and some body destructuring. Carry that behavior into any Tovu checker correction, make defaulted collaborator props distinguishable from required ones, and cover property/alias forms. Don’t regress to recommending default hooks in the diagnostic. The scope here is component injection, not a ban on all composition inside custom hooks.

**R06 — Private args-object conversion in both repos · BUILDER: SOL**  
**First pin:** Use a caller-level test with distinct values for adjacent old positionals and a second call omitting the optional value. `M-swap-required-fields` swaps the two values at one call site.  
**Change:** Convert private violations with their callers in each touched module, beginning with the clear multi-param cases in Tovu website and Jini CMS/agent-runtime. Carry “absent” semantics and default timing exactly. Keep framework-imposed callbacks and method overrides separate from owned APIs. Use the audit delta per batch and avoid sweeping thousands of unrelated private functions into one commit.

**R07 — Exported args-object migration · BUILDER: OPUS**  
**First pin:** At each exported entry, assert the object-form call works from a real importer and preserves omitted-option behavior. `M-drop-optional-default` fails the omission case.  
**Change:** Triage the **40 Tovu / 414 Jini** exported flags by subpath and actual callers before converting, starting with Tovu website and Jini agent-plugins/UI. Include examples, package API surfaces and paired Tovu callers in the same rollout. Don’t convert React components to two parameters, or change an external adapter callback signature. Where a published API really changes, use the existing API/changeset process, not a second forwarding API.

**R08 — Tovu OAuth shell · BUILDER: OPUS**  
**First pin:** Existing OAuth paths still use the same JS implementation and canonical contract types after repointing. A source fixture rejects a new consumer of `platform/oauth/ports.ts`. `M-restore-tovu-oauth-shell` restores the file after deletion.  
**Change:** The planner’s `shells.json` was empty, but `apps/website/src/platform/oauth/ports.ts` is a type-only forwarder to core OAuth and the Jini OAuth facade on this tip. Check relative imports and package/alias mappings, not only `#src/platform/oauth/ports`, before deletion. Point each name at its real owner, move still-useful OAuth why-comments to the real boundary, and don’t add a new forwarding route.

**R09 — Jini compatibility shells · BUILDER: OPUS**  
**First pin:** Import the real package owner from a consumer fixture, verifying type compatibility and, for live exports, identity and behavior. `M-one-consumer-back-to-shell` restores the old path to a fixture.  
**Change:** Triage `cms/src/{seo/xml-escape,settings/index}.ts`, `oauth/src/{args,ports}.ts`, and platform’s `mail/{engine-contracts,ports,types}.ts`, `secrets/{ports,types}.ts`, and `secrets/credential-sets/types.ts`. Repoint consumers directly to core text/settings or the canonical OAuth/mail/vault contracts. `cms/settings` explicitly promises one compatibility release. Verify that release window and the paired consumers before taking away its published path. Don’t classify a package’s real public export surface as a disposable extraction shell.

## 3. Part K — One folder per CLI and vendor

| Item | Status and proof |
|---|---|
| R8 injection seam | **DONE-ALREADY.** `daemon/src/ports/agent-runtime.ts` defines `AgentRuntimePort`, `agent-runtime/src/runtime-port-bindings.ts` supplies the binding, and Tovu desktop and website pass it with `satisfies AgentRuntimePort`. Extend this seam. |
| CLI definitions | **Folders exist, migration LEFT.** `agent-runtime/src/defs/` has the named CLI folders, but daemon `agent-executor/` still has `codex/`, `claude/`, `antigravity/`, `gemini/`, `opencode/`, `amr/`, `mimo/` and shared `pi-rpc-events.ts`. `launch.ts`, `mcp-bridge.ts` and `tool-call-receipts.ts` still select vendor code directly. |
| xAI | **LEFT.** `daemon/src/http/xai.ts` owns routes and the xAI request logic. `server/src/builtin-features.ts` mounts it and keeps a listener handle. Grok media lives in `integrations/src/media-providers/dispatch/providers/grok.ts` and is statically registered by `builtin-vendors.ts`. It is not a provider plugin on this tip. |
| Model proxy | **Partially isolated.** It already receives `ProviderToolTurnPort`, but `buildProxyProviderRegistry` directly knows Anthropic, OpenAI, Azure, Google and Ollama. No direct xAI arm was found in that registry. |

**K01 — Make R8 select capabilities, not CLI names · BUILDER: OPUS**  
**First pin:** A synthetic runtime def supplied by the host can drive launch, stream and tool receipts using only injected strategy contracts. Run the existing R8 characterization with two different fakes. `M-hardcode-cli-dispatch` dispatches on the first fixture’s ID.  
**Change:** Extend the existing runtime binding with the smallest strategy slices for staged launch, MCP delivery and tool receipts. Move shared structural inputs to core only if both packages need them. Keep process execution, event journaling and generic orchestration with daemon. Host composition binds the runtime as today. Don’t add a parallel registry or a daemon-to-agent-runtime implementation import.

**K02 — Codex, Claude and Antigravity staging · BUILDER: OPUS**  
**First pin:** Use the R8 argv/env characterization plus the Codex isolation and cleanup suites, Claude config and subagent-start pins, and Antigravity permission-order tests. Refused starts acquire no resources. `M-stage-before-refusal` violates that ordering.  
**Change:** Move Codex home/config/isolation and MCP delivery into `defs/codex/`, Claude config/filesystem/MCP/subagent startup into `defs/claude/`, and Antigravity’s permission preparation into `defs/antigravity/`. Move tests and why-comments with them. Keep one generic staging/cleanup mechanism with injected IO. Replace the hardcoded launch and bridge maps with K01’s bound strategies. Preserve temporary-resource ownership and cleanup order.

**K03 — OpenCode, Gemini, Pi and residual CLI routing · BUILDER: OPUS**  
**First pin:** Pin OpenCode config merging, Gemini and OpenCode receipt correlation, and Pi session cancellation and terminal delivery. `M-generic-receipt-id` strips a fixture-specific correlation field.  
**Change:** Move OpenCode config and tool receipts, Gemini tool calls, and Pi’s RPC-specific dispatch into their respective `defs/<cli>/` folders. Review `amr/`, `mimo/`, the dispatcher’s format cases, and `defs/{opencode-acp,vibe,claude-compatible-args}.ts` as follow-through. A truly shared protocol helper can stay shared, but CLI policy belongs with its def. Move the confirmed residual policies and repoint all consumers. Don’t rename identifiers or alter the wire protocol. This is not the separate ACP adoption proposal.

**K04 — xAI OAuth and search plugin · BUILDER: OPUS**  
**First pin:** Extend daemon `http/__tests__/xai.test.ts` and the route characterization harness for status and body parity, listener lifecycle, timeout, and safe error disclosure. `M-duplicate-listener-slot` breaks the one-listener pin.  
**Change:** Separate vendor OAuth, token/search adapters and xAI route declarations into the xAI provider plugin. Keep route definitions server-neutral, with narrow per-route deps, and mount the donated specs at host bootstrap. Inject the OAuth and secure persistence behavior, listener lifecycle, fetch, clock and error reporter. Transfer the built-in mount in `server/src/builtin-features.ts` without changing route paths or stored credentials. No `daemon/http/xai.ts` forwarding shell.

**K05 — Grok media provider contribution · BUILDER: OPUS**  
**First pin:** Reuse Grok adapter and engine fixtures for image generation and TTS with synthetic credentials, including an unsupported request and redacted failure. `M-media-ignore-injected-registry` restores static Grok selection inside the engine.  
**Change:** Move `providers/grok.ts` and its tests to the same xAI provider plugin under its media contribution. Register via the host-owned registry and remove the Grok static import and forwarding exports from the integrations dispatcher. Keep media kind IDs and request/result behavior. Preserve availability during the paired host/plugin rollout without retaining a second implementation.

**K06 — Model-proxy provider policy out of daemon · BUILDER: OPUS**  
**First pin:** In `http/__tests__/model-proxy.test.ts`, use two assembled provider fixtures with different capabilities and pin selection, unsupported-provider responses, non-streaming normalization, and error projection. `M-proxy-static-provider-list` makes the injected fixture unreachable.  
**Change:** Keep generic HTTP validation, authorization and response mapping in daemon. Keep the real provider-specific request and tool-turn policy behind registrations assembled from existing adapters at the host. Preserve the `ProviderToolTurnPort` seam and existing advertised options. Don’t add an xAI model-proxy path that does not already exist. Pair with G18 so this registry is split once.

## 4. Part G — Non-UI size and complexity

The size lookup counted nonblank, noncomment source lines, including nested code in the enclosing function. It found **79** candidates after excluding React hooks, React files, obvious UI directories, migrations/generated files and stored exceptions. Another **15** are UI-specific functions outside those paths, including admin screen clients/controllers, editor and member-auth UI glue, the vanilla chat loader, and the consent client runtime. They are tabled, leaving **64** plain-function candidates, close to the dispatch’s estimate. Browser transports and diagnostics collectors remain in scope where they do work other than UI. Nested candidate spans count separately, but are assigned to their parent’s sheet.

The 11-11 cloud complexity count of 37 and the old Part C CCN implementation are different measurements. The old Part C decision count finds `writeFrameOutcome` at **12**. A source reading of the current cyclomatic rule, including defaults, nullish operators and optional chains, instead identifies **nine non-UI candidates**. The checked-in cognitive debt adds **two** other functions. I could not substantiate the dispatch’s six as the current set. The sheets below cover the eleven named candidates, and the builder should confirm rule IDs and scores before touching them. The UI-only `ErrorNotice` candidate is tabled.

All paths below are relative to Jini `packages/`. The 23 sheets include 20 length sheets and three complexity-only sheets. On overlaps, land the boundary change first and do the extraction in the same lane.

| Sheet | Targets and split | First pin and named mutation |
|---|---|---|
| **G01 · BUILDER: OPUS** | `chat/src/core/assistant-client/transport.ts` — `createAssistantTransportClient`, its `createAssistantTransport` builder. Separate run start/continuation, stream subscription/replay, and abort/disposal into helpers sharing the same closure state. `durable-run-subscription.ts` — `followDurableRun`, separate subscription decisions from frame delivery and teardown. | Pin a disconnect, reconnect with replay and caller abort. Assert ordering, no duplicate events and one teardown. **M-replay-from-zero** ignores the stored cursor. |
| **G02 · BUILDER: OPUS** | `chat/src/store/sql/store.ts` — `createSqlChatStore`, `writeMessage`. Separate row encoding and transactional writes. `store/runtime/{durable-run-store,run-ledger}.ts` — separate query, transition and idempotency handling without splitting transactions. `store/legacy/sqlite/conversations.ts` — `conversationSummarySql`, split named query fragments without changing SQL/parameter order. | Pin ledger replay, accepted-request races and old/new SQL row parity with fixtures. **M-ledger-nonatomic-finish** moves the terminal write outside its transaction. |
| **G03 · BUILDER: OPUS** | `chat/src/server/durable-runs/recover.ts:createDurableRecovery` and `run-finalizer/entry.ts:createAssistantRunFinalizer`. Extract recovery eligibility separately from side effects, and finalizer data preparation from settlement. Keep the order of claims, persistence and notifications. | Pin recovery of a lost connection, a preexisting terminal run, and two finalization attempts. **M-finalize-twice** removes the already-settled guard. |
| **G04 · BUILDER: OPUS** | `chat/src/embed-widget/browser/frontend-session-bridge.ts` — `createFrontendSessionBridge` and cognitive candidate `openFetchFrontendStream.connect` (11). Separate attachment/invocation result handling from lifecycle. Split one fetch/read attempt from reconnect scheduling. | Use `frontend-session-bridge.test.ts` for reconnect, terminal HTTP statuses, abort during read, same-origin credentials and stale attachment rejection. **M-retry-403** makes a terminal refusal retry. |
| **G05 · BUILDER: OPUS** | `chat/src/core/util/parser.ts:createArtifactParser`, both `createTaggedTextSuppressor` implementations in `agent-runtime/src/agent-protocol/acp/` and `artifacts/src/`, and cognitive candidate `chat/src/core/question-form/scan.ts:balancedObjectEnd` (13). Extract parser transitions and separate quoted-token advancement from brace accounting. Pin distinct consumers before considering any dedupe. | Feed escaped quotes, embedded braces, a truncated object and tags split over chunk boundaries. Assert output byte parity and that suppressed text stays suppressed. **M-close-on-quoted-brace** treats a brace in a string as structure. |
| **G06 · BUILDER: OPUS** | `daemon/src/agent-executor/launch.ts` — `createAgentExecutor` and its `run`. After K01–K03, separate run admission, resource preparation, spawn handoff and cleanup using one typed run context. Avoid extracting a helper that still captures half the factory. | Reuse R8 lifecycle pins and add acquire/release ordering for post-staging failure. **M-double-release-staged-home** runs the disposal path twice. |
| **G07 · BUILDER: OPUS** | `daemon/src/routines/routine-store.ts:createInMemoryRoutineStore`, `routines/scheduler.ts:start_`, `core/tool-gaps.ts:createToolGapCollector`, `ai-trace-lifecycle.ts:withAiTracing`, `idle-monitor.ts:createIdleMonitor`. Extract store transitions, scheduler subscription/cleanup, gap aggregation, trace context/emission, and idle effects independently. | Pin scheduler start/stop, idempotent run and idle expiry with a fake clock, and an allowed-only trace record. **M-emit-after-stop** lets one scheduled callback escape teardown. |
| **G08 · BUILDER: OPUS** | `server/src/builtin-features.ts:createBuiltInFeatures` and `plugins/src/host/node/runtime-core.ts:createPluginRuntimeCore`. Move feature assembly by lifecycle responsibility and plugin validation/activation/disposal by phase. Keep orchestration order and injected dependencies. Coordinate the server extraction after K04/K06. | Pin mount/dispose order, unavailable-feature behavior, and activation rollback. **M-dispose-in-install-order** reverses the unwind order. |
| **G09 · BUILDER: OPUS** | `sidecar/src/json-ipc.ts:requestJsonIpc` and its callback. Extract request encoding and reply parsing separately from close/timeout settlement. Keep one owner of final resolution and timer/socket cleanup. | Pin partial replies, malformed replies, timeout and a late reply. **M-late-reply-resolves** permits a second settlement. |
| **G10 · BUILDER: OPUS** | `agent-plugins/src/lifecycle/{activation,trusted-plugin-files,capability-projection,package-paths,set-enabled}.ts:buildModule`, `lifecycle/search.ts:buildModule`, `admin-surfaces/surface-handlers.ts:createAdminSurfaceHandlerHost`. Extract activation lock/read/write phases, trusted path resolution, pure projection/indexing, enable/disable transitions, and admin handler assembly separately. Land one file cluster at a time. | Begin with activation lock/reconcile and durable-write fixtures. Pin untrusted path refusal, enabled capability visibility and correct admin handler selection. **M-trusted-path-without-owner-check** must fail the path fixture. |
| **G11 · BUILDER: OPUS** | `agent-runtime/src/providers/connection-guard.ts:pinnedFetch` and callback, `qoder-stream.ts:createQoderStreamHandler`, `role-marker-guard.ts:createRoleMarkerGuard`. Split guarded request setup from response handling, and parser state from event translation. | Pin existing guarded transport refusal and safe redirect semantics, plus chunk-stable Qoder and marker output. **M-drop-pinned-connection-binding** breaks the injected transport contract fixture. |
| **G12 · BUILDER: SOL** | `agent-runtime/src/skills/web-clone/scripts/dna-scaffold.mjs:skeleton` and `init-clone.mjs:notesTemplate`. Extract independently named sections of each output template and join them in the same sequence. | Assert full generated file bytes against a small fixture, including empty lists and final newline. **M-drop-template-final-newline** changes exactly that byte. |
| **G13 · BUILDER: OPUS** | `cms/src/content-duplication/agent-tools.ts:buildContentDuplicationAgentToolCatalog` and `media/tool-registrations.ts:mediaUploadHandlers`. Split catalog construction by operation and media input lookup/cap validation from upload invocation. | Pin tool metadata/availability and import/replace behavior including the current media cap split. **M-apply-video-cap-to-image** fails the image refusal fixture. |
| **G14 · BUILDER: OPUS** | `cms/src/publish/content/backstop-service.ts:createBackstopService`, `comments/site/types.ts:commentsDataModule`, `redirects/site/publish-content.ts:contributeRedirectPublish`, `themes/preview/watcher.node.ts:createThemeWatcher`, `trash/write-service.ts:createTrashHandlers`. Extract precheck vs execution, data declarations vs mounting, redirect mapping vs apply, watcher event filtering vs scheduling, and Trash validation vs mutation. No host theme moves. | Pin exact backstop refusal/no writes, redirect round trip, watcher disposal and Trash conflict preservation. **M-trash-write-before-conflict-check** and **M-watcher-event-after-close** each target their own fixture. |
| **G15 · BUILDER: OPUS** | `commerce/src/payments/ingest/settlement-worker.ts:createSettlementWorker` and `catalog/plugin-server.ts:createCommerceServer`. Separate settlement claim/routing from persistence and map routes independently of host registration. | Pin duplicate settlement, failed effect rollback and route response parity. **M-settle-duplicate** skips the idempotency decision. |
| **G16 · BUILDER: OPUS** | `core/src/tool-metadata/plugin-runtime.ts:createPluginRuntimeToolMetadata`, `db/src/recovery/agent-tools.ts:createRecoveryAgentToolCatalog`, `mcp/src/external/agent-tools.ts:{createExternalMcpAgentToolCatalog,saveInputSchema}`, `mcp/src/federation/registrations.ts:buildFederatedMcpRegistrations`, `platform/src/mail/email-template-agent-tools.ts:createEmailTemplatesAgentToolCatalog`. Extract static metadata groups apart from schema and execution assembly. | Pin the registered names, schemas, risk metadata and unchanged denial behavior. Assert stored-credential metadata never emits secret values. **M-tool-risk-default-allow** removes a risk marker, **M-schema-exposes-secret** includes a fixture secret. |
| **G17 · BUILDER: OPUS** | `devops/src/deploy/site/export-run.ts:createExportRunner` and `analytics/src/product/index.ts:withProductAnalyticsGuards`. Separate staging/cleanup from export results, and consent/eligibility from dispatch. | Pin failed export leaves no staged output, and denied analytics emits no event. **M-analytics-before-consent** invokes the recording collector early. |
| **G18 · BUILDER: OPUS** | `daemon/src/http/model-proxy.ts:buildProxyProviderRegistry`. Execute with K06. Separate generic lookup and route handling from registered adapter-specific maps. | Use K06’s provider fixture and pin error normalization for a failed adapter call. **M-proxy-default-on-unknown** routes a missing provider to the default engine. |
| **G19 · BUILDER: OPUS** | Complexity in `chat/src/core/ag-ui/event-projection.ts:{writeFrameOutcome,readConfirmationResume}` (13, 11) and `core/tool-call-detail.ts:describeToolCallDetail` (11). Split frame presentation from terminal mapping, resume ownership checks from decision decoding, and safe display formatting from note selection. | Use `run-frames.test.ts` for safe wire errors and terminal order, with wrong thread/parent/interrupt fixtures for resume and a synthetic secret for tool detail. **M-resume-ignore-parent**, **M-wire-original-daemon-error**, and **M-truncate-before-redact** must fail their separate pins. |
| **G20 · BUILDER: SOL** | Complexity in `agent-plugins/src/lifecycle/host-tools/search-tool.ts:buildSearchCandidate` (12) and `agent-runtime/src/agent-protocol/acp/session-results.ts:handleRpcError` (12). Extract optional metadata projection and ordered RPC disposition predicates. Preserve the effect calls and ordering. | Pin sparse metadata and known RPC outcomes, including unexpected-ID cleanup vs auth-required and model refusal. **M-rpc-cleanup-falls-through** turns ignored cleanup into a visible RPC failure. |
| **G21 · BUILDER: OPUS** | Complexity in `core/src/errors/reporter.ts:refusalError`, `cms/src/taxonomy/site/publish-term-ids.ts:prepareTermSync`, `cms/src/media/video-transcode.ts:readOriginalVideo`, and `cms/src/media/video-transcode.ffmpeg.ts:transcode` (11 each). Extract audience choice from parameter rendering, term planning from authorized apply/revert, and read guards from bytes/cleanup. | Pin authorized vs anonymous error disclosure, denied term sync before writes, and media refusal before reads plus lock release on failure. **M-refusal-show-auth-sentence**, **M-term-write-on-deny**, and **M-video-read-before-size-guard** must fail. |
| **G22 · BUILDER: OPUS** | `diagnostics/src/web-evidence/{page-structure-script,page-performance-script}.ts:{collectPageStructure,collectPagePerformance}`. Extract responsibility-sized collectors via the existing `buildPageStructureExpression`/`buildPagePerformanceExpression` boundary. Keep one self-contained evaluation, structured-clone results, existing sampling limits, and the name shim. A plain module-scope hoist is invalid because the callback is serialized. | Pin the **serialized** output in the structure/performance fixtures, including cap markers and absence of form values or other raw browser data. **M-unbound-serialized-helper** omits one helper from the evaluated unit and must fail at that boundary. |
| **G23 · BUILDER: OPUS** | `agent-runtime/src/skills/web-clone/scripts/{recon-site,visual-diff,interaction-probe}.mjs` — `collectSignals`, `compareInBrowser`, `candidates` and their three `page.evaluate` callbacks. Extract pure collection phases into a self-contained browser unit per operation, using G22’s isolation pattern if the packaging supports it. Retain one evaluation per snapshot. Keep inputs as data and don’t hoist free references into the Node process. | In a deterministic page fixture, pin ordering and caps, CSS read tolerance, pixel metrics, and candidate selectors. **M-split-evaluation-snapshot** changes the DOM between phases and must fail parity. **M-browser-free-reference** makes the serialized capture fail. If packaging cannot preserve the single snapshot, leave the callback intact and return that constraint to the owner. |

### Integration closeout

- Run the real architecture checker after A01–A15, then compare the **exact** remaining set to A16 before any baseline edit. Investigate a different set rather than accepting it. The already-fixed composition back-edges and the assistant/server cycle must not return.
- Recount the owner-rule buckets separately. A green `check:hooks` does not prove required props. A shrinking args count does not prove public API compatibility. Keep the source, N-1 fixture, and mutation evidence for each batch.
- Confirm the Part G line and complexity candidates against the actual gates before cutting debt. Don’t drop a historical debt row or add an exception just because two counting methods disagree.
- **NOT-SHEETED:** Property-access or indirect hook variants outside the stated counts, unverified mixed/local forwarding adapters, and any additional complexity rows surfaced only by the real gate. UI function sizing remains tabled. The second Part K heading about ACP adoption and Part D’s separate cycle/duplication/dead-code inventories are outside this dispatch.
