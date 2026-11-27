# Agent Plugins gap fill
Each entry names a concrete source change the test must reject. Reviewed statically against the Author Checklist. No executions authorized.

## Connect and core token sign-in
All paths below are relative to packages/agent-plugins/src.

- core/plugin-display-name.ts: formats mixed separators -> split on hyphens alone.
- core/token-sign-in-list.ts: offers only unambiguous plugins -> change exactly one declaration to at least one, or project probeUrl instead of helpUrl.
- connect/token-sign-in.ts: returns only the probe outcome (3 cases) -> pass the MCP URL instead of probeUrl, or replace the outcome with a fixed outcome.
- connect/token-sign-in.ts: does not validate or probe (3 cases) -> remove the null/auth guard or let resolver failures propagate.
- connect/token-sign-in.ts: refuses malformed token input -> bypass assertToken in access-token-tool.ts.
- connect/token-sign-in.ts: maps a thrown probe error -> existing red regression, letting probe rejection escape instead of returning unavailable.
- connect/new-site-agent-plugin-tokens.ts: returns trimmed nonblank tokens and host copy -> return raw map or parser refusal instead of wrapping the projected result.
- connect/new-site-agent-plugin-tokens.ts: projects each check (5 cases) -> remove each refusal rule or incorrectly include ok/unavailable.
- connect/new-site-agent-plugin-tokens.ts: continues after outage but stops on refusal -> stop at an unavailable result or continue after refusal.
- connect/new-site-agent-plugin-tokens.ts: uses valid bundled manifest ids -> substitute directory name, stop on malformed manifests, or remove retirement check.
- connect/plugin-credential-card.ts: fixed cards ignore user destinations -> assign baseUrl from values rather than declared fixed origin.
- connect/plugin-credential-card.ts: passes declared public fields -> skip assertFreeField or omit the username projection.
- connect/plugin-credential-card.ts: rejects invalid submitted values (7 cases) -> remove each respective required/type/URL/protocol/userinfo condition.
- connect/plugin-credential-card.ts: uses exact API label or domain target -> compare providerId for API or ignore explicit domain target.
- connect/plugin-credential-card.ts: absent or broken optional catalog -> let failure escape or reflect its private message.
- connect/row-update.ts: rebuilds from concurrent row edit -> write with the previous build result or pass the next row version instead of the current version.
- connect/switch-on-saved-token.ts: honors activation owner (4 cases) -> ignore precheck, ignore row disabled status, ignore final switch refusal, or report failed activation on success, respectively.

## Public export runtime
- site/exports/runtime.ts: renders canonical exports -> disable request-local memoization, use input aliases instead of canonical output, or remove head deduplication.
- site/exports/runtime.ts: static modes (3 cases) -> remove fallback-only template gate, allow link-only scripts, or keep scripts inert when the site's consent banner is off, respectively.
- site/exports/runtime.ts: ready login with another owner -> match providers by provider.id alone.
- site/exports/diagnostics.ts: keeps savable diagnostics distinct -> run props validation before version validation or remove missing/disabled distinction.
- site/exports/diagnostics.ts: ambiguous aliases -> select the first match rather than requiring exactly one, or ignore disabled owners before identity matching.
- site/exports/runtime.ts: foreign workspace and empty inputs -> remove the workspace/empty input check and read source data.
- site/exports/runtime.ts: advertises snippets only for ready exports -> generate snippets unconditionally or ignore props/host readiness.
- site/exports/source.ts: isolates manifest faults and reads PNG bytes -> decode PNG through the text reader or skip canonical path containment.
- lifecycle/layout.ts: learned and notes directories -> hard-code notes for both kinds, or let unknown kinds become directory segments.
- lifecycle/metadata.ts: ignores non-object tool keywords (2 cases) -> delete plain-object guard and treat indices/characters as keywords.
- site/host-plugin-guidance.ts: broken host-file directory -> return [] for any readdir rejection.
- lifecycle/host-tools/identity.ts: does not reveal identity read errors (2 cases) -> rethrow original error including absolute path.
- vercel/object-stores/vercel-blob.mjs: only separate Blob credential -> accept ordinary deploy token or a read-only Blob token.
- vercel/object-stores/vercel-blob.mjs: refuses site-media storage -> use artifact constructor on the site-media method.
- site/memory-i18n.ts: translates every source label (21 cases) -> remove any translation or copy the keep-memory label over the delete action in the named locale.
- site/memory-i18n.ts: preserves source copy -> return undefined when the locale or key is missing.
- site/memory-i18n.ts: selects the requested variant -> collapse zh-TW onto zh-CN.
- site/memory-i18n.ts: unlisted object method name -> existing red regression, inherited lookup returns a function instead of source copy.

## Mail
- lifecycle/mail/contribution.ts: retains valid owners and ordered refusals -> remove v2 id or feedback check, or omit optional-card diagnostics.
- lifecycle/mail/catalog.ts: retains valid owners and ordered refusals -> publish credential labels/forms for rejected or keyless providers.
- lifecycle/mail/contribution.ts: files cards by owner (source and live loaders) -> erase plugin ownership or omit source-only card diagnostics.
- lifecycle/mail/catalog.ts: falls back to builtins (2 cases) -> propagate adapter load fault or omit refusal.
- lifecycle/mail/catalog.ts: uses plugin account credential only for domain reads -> request by descriptor id rather than declared account connection or let core providers use plugin account tokens.
- lifecycle/mail/configuration.ts: checks required username presence -> treat any matching credential row as complete, expose username, or refuse keyless hosted providers.
- lifecycle/mail/selection.ts: disabling clears only owned lane -> clear both lanes or capture ownership only after toggle.
- lifecycle/mail/selection.ts: rereads after revision conflict -> retry stale value and revision rather than rebuilding on latest setting.
- lifecycle/mail/selection.ts: refuses an id now owned by another plugin -> omit registry-owner check during cleanup.
- lifecycle/mail/selection.ts: caps conflicts and completes later -> drop pending ownership on failure or change the attempt bound to two.
- lifecycle/mail/selection.ts: clears only orphaned installed provider ids -> skip installed fallback or omit the existing-provider filter.
- lifecycle/mail/selection.ts: avoids inactive reads on enable/healthy lanes -> query installedProviderIds even when no selected id disappeared.
- lifecycle/mail/host-mailer.ts: waits for boot and invalidates own cache -> replace mailerReady with resolved promise or omit live invalidation binding.
- lifecycle/mail/selection.ts: propagates a refused write -> retry any failure, or invalidate the active facade after a rejected direct selection.
- lifecycle/mail/adapter-descriptors.ts: keeps valid copy -> ignore usedFor or pass through raw fields.
- lifecycle/mail/adapter-descriptors.ts: drops invalid optional copy (4 cases) -> remove the matching text, URL parse, URL length or usedFor validation.
- lifecycle/mail/adapter-descriptors.ts: labels bad JSON and wrong array shape -> collapse either failure into a generic schema error.

## Host tools
- lifecycle/host-tools/memory-tools.ts: approval families and stale digests -> give writes the read family, or skip the bound digest gate.
- lifecycle/host-tools/memory-tools.ts: learned memory under bound owner -> list notes instead of learned entries or discard the persisted write.
- lifecycle/host-tools/memory-tools.ts: rejects caller owner/kind and non-ENOENT faults -> accept unexpected keys or map every read error to exists:false.
- lifecycle/host-tools/write-note-tool.ts: host permission and notes -> request the use permission or write the learned namespace.
- lifecycle/host-tools/write-note-tool.ts: invalid note input (4 cases) -> remove extra-field, entry-path, byte-count or NUL check, respectively.
- lifecycle/host-tools/write-note-tool.ts: denied, uninstalled and abandoned -> move storage above any corresponding guard.
- lifecycle/host-tools/search-tool.ts: invalid page offset (3 cases) -> remove the respective negative or safe integer guard.

## Lifecycle and site bindings
- connect/plugin-host/index.ts: preview plans declared MCP grants -> wire a different workspace or return empty preview instead of passing server definitions to the preview owner.
- connect/plugin-host/index.ts: discovery and admission -> cache activation, ignore selected revision, admit a captured id because it's hidden from lookup, or move the publication callback outside the lock.
- site/activation-effects.ts: cache per file revision -> replace stat-based revision with constant or never invalidate the absent revision.
- site/activation-effects.ts: propagates non-missing filesystem fault -> map all stat faults to absent.
- lifecycle/set-enabled.ts: replaces seed-only OFF -> incorrectly treat boot seed as an operator's decision or skip the conditional write.
- site/provider-plugin-link.ts: bound links follow selected workspace -> capture stale workspace root, ignore preferred revisions or stop on one unreadable manifest.
- site/provider-plugin-link.ts: refuses multiple selected revisions -> remove duplicate revision guard, swallowing per-descriptor failures instead.
- site/uninstall-tool.ts: revision swap after approval -> surface an unhandled exception or report removal on stale confirmation.
- site/uninstall-tool.ts: unreadable record calls for repair -> send restart instructions for all update journal refusals.
- site/uninstall-tool.ts: named uninstall refusals (2 cases) -> rethrow either domain error without conversion to ToolInputError.
- site/update-effects.ts: deferred recovery refuses removal -> remove guard for missing notifier or silently accept the remove operation.
- react/agent-plugin-install-port.ts: new install posts zip bytes -> use update route or enable replace by default, or re-encode the original bytes.

## React
- react/use-agent-plugins.hooks.ts: adds and replaces install row in place -> append a duplicate or replace the whole cached array.
- react/use-agent-plugins.hooks.ts: install while initial fetch pending -> skip installation cache write when rows are null.
- react/use-agent-plugins.hooks.ts: localized load and toggle errors -> expose the upstream failure, skip known-code localization, or keep the failed row toggling.
- react/installed-skills-composer-source.ts: initial failure then recover -> retain the failed pending request instead of allowing a retry, or suppress its diagnostic.
- react/AgentPluginDetailsModal.tsx: Manage view uses correct surface metadata (2 cases) -> remove cached fallback or prefer cached surface over fresh list, or drop initial surface selection.
- site/customize-tool.ts: forks selected revision and keeps source unchanged -> use unfiltered installed list, forbid empty replacement text, or leak FolderZipError as a runtime error.
- site/customize-tool.ts: refuses zero or two revisions (2 cases) -> default to arbitrary installed folder instead of requiring one match.
- site/memory.ts: site bindings preserve note context and active migration result -> include learned memory, mishandle JSON escaping, or return the last sibling's migration result.
- site/memory.ts: sibling discovery skips bad entries and continues -> migrate the active workspace as a sibling, follow plain files, or propagate a broken sibling fault.
- site/plugin-memory.ts: uses plugin state ownership and lock result -> lose the result from the state lock or skip the active workspace's migration.
- site/install-tool.ts: checks update target before fetching (2 cases) -> skip the id grammar or permit uppercase old digest.
- site/install-tool.ts: routes attachment update to owner -> use install preview, omit the old digest/settings/MCP or attachment owner, or expose named update rejection as an internal error.
- site/install-tool.ts: folder source validation and refusal -> zip an absent path or expose FolderZipError as a raw exception.
- site/install-tool.ts: customization always submits new install -> use caller replace or original source input rather than pinned fork bytes.
- lifecycle/update.ts: non-contention failure after background wait -> retry permanent faults, clear the journal, or omit/misclassify the terminal event.
- site/install-upload.ts: stops invalid archive before extraction (5 cases) -> leak reader failure, remove entry or manifest cap, leak JSON parse failure, or accept a nested manifest, respectively.
- site/install-upload.ts: checks size before hashing/enumeration -> hash/open the rejected upload or remove size check.
- site/automatic-agent-plugins.ts: explicit loads check owner and input -> allow an unknown field/cross-principal load, or omit required host copy for missing guidance.
- site/automatic-agent-plugins.ts: offer and commit scoped attempt -> admit an owner mismatch, allow a cancelled binding, replace prior offer id, or skip recording the commit.
- site/automatic-agent-plugins.ts: off mode clears usage strip -> skip OFF publication or read the catalog despite the mode.
- lifecycle/host-tools/skill-tool.ts: summarizes first prose or readable fallback -> choose a heading or omit fallback for all-heading documents.
- lifecycle/host-tools/skill-tool.ts: eponymous contained guidance and live gate -> choose first listed skill, drop supporting-file port args/notes, or gate only at boot / match only plugin id.
- lifecycle/host-tools/skill-tool.ts: retracts ambiguous revisions -> leave the earlier registration live or suppress the rest of the catalog.
- lifecycle/host-tools/skill-tool.ts: safe recovery on unknown skill/file -> reflect raw skill path, omit unavailable-reader hint or accept arbitrary inputs.
- lifecycle/host-tools/search-tool.ts: ranks before paging -> run the ranker only over the first response page or bypass it for a nonblank query.
- site/deploy-split-activation.ts: seed-only predecessor is not an operator decision -> copy any predecessor, including the seeder's default.
- site/deploy-split-activation.ts: corrupt successor blocks carry -> ignore an undetermined target and overwrite it.
- ffmpeg-transcode/adapter.ts: cancellation during sealing -> omit the post-seal check and publish despite cancellation.
- ffmpeg-transcode/adapter.ts: staged input rejected before lookup -> ignore an already-aborted signal or bypass maxInputBytes on staged input.
- lifecycle/search-projection.ts: disabled soon discovery status -> label it as ordinary disabled guidance or omit maturity.
- lifecycle/host-tools/provider-status-tool.ts: status filter omitted -> always select a single row or list before authorization.
- core/export-props.ts: optional link and nonstring URL behavior -> require absent urlProps values or coerce booleans into URLs.
- core/identity-namespace.ts: malformed legacy extension cannot usurp lifecycle scope -> select any own legacy key even when it is not an object and an unrelated scope was requested.
- lifecycle/automatic-use-offer.ts: abort during liveness check -> remove the post-await cancellation check.
- site/set-enabled.ts: lazy workspace root and system conditional enable -> bind wrong root, drop unlessOperatorDisabled, or skip post-OFF notification.
- lifecycle/mail/contribution.ts: contributes real positional mailer -> lose the guarded HTTP adapter or pass object-shaped args directly to positional mailer.
- lifecycle/credential-card-metadata.ts: domain-owned card reusing API probe -> remove the isApiCard check.
- lifecycle/credential-card-metadata.ts: explicit optional field copy -> drop help copy, optional hint, or forward non-contract metadata.
- site/bundled-id-upgrade.ts: missing or unreadable bundled replacement -> move installed bytes before validating the new bundled manifest.
- site/install-tool.ts: bundled ID may not overwrite operator namesake -> skip provenance check, or accept bundledId with an unrelated source path/kind.
- site/exports/runtime.ts: no-host export remains usable during provider outage -> require providers to resolve successfully for every export or omit version defaulting.
- site/automatic-agent-plugins.ts: tool preparation failure is advisory and retryable -> propagate the index fault or rethrow a previously failed preparation forever.
- site/admin-surfaces/delivery-bindings.ts: create retains id across conflict -> generate ids on every merge attempt or discard the other writer's binding.
- site/install-upload.ts: publisher admission gates publication -> bypass withInstallIdentity, derive id from storage name, or switch off outside admission lock.
- connect/row-update.ts: no missing/unchanged row write -> invoke build on a null read or try to persist a null build result.
- lifecycle/search.ts: automatic deployment matching without a vendor suffix -> require a colon-suffixed capability or remove the intent-and-vendor gate.
- lifecycle/automatic-use.ts: committed offer ID cannot be re-keyed -> allow a different ID to replace a committed offer.
- connect/plugin-credential-card.ts: host public-field rejection -> skip credential-free field policy or replace the host's original error.
- folder-zip-node.ts: extensionless package forks with local identity -> remove extension initialization or omit the new host identity.
- lifecycle/exports.ts: remote scripts require declared origin -> admit https scripts without origin membership or require a host for local scripts.
- lifecycle/install.ts: executable permission is explicit and frozen -> freeze all files with the same mode or drop executable metadata during extraction.
- lifecycle/seed-bundled.ts: held publisher migration cannot publish -> ignore heldPluginIds and seed the refused package.
- lifecycle/tools/capabilities.ts: benign cyclic error remains reportable -> mark revisiting a node as a token leak instead of terminating that arm.
- vercel/targets/vercel.mjs: successful probe with unreadable body -> let JSON parsing fail the credential check.
- site/automatic-agent-plugins.ts: detached consent suppresses terminal receipt -> emit user_message into the detached transcript or drop the late preference decision.
- site/automatic-agent-plugins.ts: failed Off event propagates without loading -> swallow publish failure or fall through to catalog preparation.
- site/install-upload.ts: post-publication cleanup fault leaves replacement installed -> restore old package or reject the already-published replacement on cleanup fault.
- lifecycle/host-tools/skill-tool.ts: routes host-owned file to overlay -> send it to the plugin reader or append notes before host overlay.

## Static handoff

- Baseline: d1ced6c5b. 128 test definitions (including parameterized definitions), 41 extended test files and 12 new test files. All 62 requested source paths have a linked behavior test. Shared tests may link to more than one source.
- No tests, installs, builds, typechecks, coverage or mutations ran. Relative imports and changed-file scope were checked statically. The tracked test diff passes git diff --check. No source, existing assertion, coverage setting or threshold was changed.
- Expected red, connect/token-sign-in.ts:54: rejecting the injected probe escapes the documented never-throw check. Await and map it to the bounded unavailable result.
- Expected red, site/memory-i18n.ts:171: inherited Object properties can be returned as translations. Require an own locale and own key, or use prototype-free maps.
- EXCEPTION site/install-upload.ts:103: length-checked dense filtered array cannot yield an undefined enclosing folder.
- EXCEPTION site/exports/diagnostics.ts:27,31: exactly one member of the freshly filtered arrays implies a defined owner or component. Test missing and ambiguous selection, not arbitrary array corruption.
- EXCEPTION lifecycle/host-tools/skill-tool.ts:602-605: every registration comes from a handler key that the same loop recorded in identityByToolId. This guard protects against future registry-kit drift.
- EXCEPTION vercel/targets/vercel.mjs:326: the undefined side of the nullish fallback is unreachable following the ready-object guard.
- Recompute per-branch coverage on cloud. The supplied branch-only rows did not identify branch locations. In particular, failed-publication destination stat faults in install-upload.ts still need a focused case. The skill-tool listing was truncated, so compare its full uncovered report against the new tests before claiming its target is met.
