Software Architect(Review): **Both designs need rework.**

Source evidence below uses `refs/remotes/github/integ/wave-b-fixed`: Tovu `1ae82a766`, Jini `1fd7c0763`. Unless otherwise qualified, `deps.ts` and `app.ts` mean files under `apps/website/src/server/runtime/composition/`.

The requested `agents/code-review/skills.md` is missing. I used the canonical `agents/code-inspection/skills.md` identified by the agent registry. Graph tools were unavailable; verification used Git blobs and TypeScript AST inspection. No files were changed and no tests were executed.

## 01 — `01-tovu-composition-deps.md`

**Verdict: needs rework**

1. **Blocker — The proposed slice order cannot support its declared inputs.**

   **Evidence:** Design lines 39, 116 and 137 require explicit inputs, prohibit closure reads, and extract slices top to bottom. However:

   - Media storage at `deps.ts:1137` defers reads of `observability`, `workspaceId` and `settingsRepo`, initialized at lines 2014, 1163 and 1263.
   - Trash callbacks at `deps.ts:1525` and `1552` defer reads of repositories initialized at lines 1766 and 2095–2109.
   - The proposed early `trash-adapters.ts` also owns theme registration from `deps.ts:2140`. That registration needs `siteThemes`, created at 2132; its `removeTheme` binding needs `trash`, created at 1651.

   Passing these values eagerly produces TDZ failures. Moving their construction earlier changes the specified execution order. Keeping theme registration in the initial adapter builder also introduces a dependency back from Trash to the later publish/theme slice.

   **Fix:** Specify a staged dependency graph before execution: early repository construction, deferred capability readers, service assembly, and later theme registration. Give every deferred read an explicit getter contract and initialization point. Keep the theme-registration operation at its current lifecycle position.

2. **Major — One throwing `LateRef` contract does not preserve the existing binding semantics.**

   **Evidence:** Design lines 97–111 and 135 propose converting the late bindings to a getter that throws before initialization. The source contains several different contracts:

   - `routeDepsBuiltForPluginHost` deliberately returns no host during provider initialization (`deps.ts:1219–1225`).
   - `bindSharedApiOAuth` has an explicit user-facing availability error (`deps.ts:2004–2006`).
   - `formCollectionProviders` starts with a working empty-registry fallback (`deps.ts:1768`), then changes implementation at 2015.
   - Media credentials and consent use promises that wait for later resolution (`deps.ts:1135–1144`, `2253–2260`, `2849`, `2963`).

   These are not interchangeable TDZ bindings. The base contract also omits the `routeDepsBuilt` deferred promise while requiring its consumer to move.

   **Fix:** Document each binding’s early-read, update and failure behavior separately. Preserve optional values, initialized fallbacks, domain errors and asynchronous waiting. If a reusable reference utility remains necessary, implement it in Jini first; merely flagging new generic Tovu code for later extraction does not satisfy Jini First.

3. **Major — The step-zero lifetime test relies on a nonexistent seam and misstates teardown behavior.**

   **Evidence:** Design line 133 says to wrap `opened.onStoreClose` through an existing override. `CreateSiteRouteDepsOverrides` has no such override (`deps.ts:562–641`); `onStoreOpened` exposes only the wrapped store (`633`, `852`). The registration collector is private (`837`, `856`).

   Design line 125 also implies registration order determines serial close order. In fact, close awaits boot drains, then invokes registrations through `Promise.all` (`deps.ts:839–843`). Registrations can themselves be promises (`804`), so `registration.name` is not a reliable identifier.

   Finally, line 153 promises readiness-resolution tracing that step zero never specifies.

   **Fix:** Define an accessible recording seam using interface fakes. Pin the actual guarantees: boot drains finish before disposal; asynchronous registrations resolve before invocation; disposal completes before the underlying store closes. Specify readiness tracing explicitly instead of claiming the shape snapshot provides it.

4. **Major — The fragment strategy has no demonstrated way to preserve literal order.**

   **Evidence:** Design lines 78–82 prescribe one fragment builder per owner, followed by spreads in original key order. The source interleaves owners: Trash-related fields appear at `deps.ts:2272`, `2511`, `2520`, `2620` and `2640`, among other responsibilities.

   Gathering those fields into one owner fragment and spreading it once cannot preserve their original positions. It can also disturb precedence around `...identity` and its required `removeUser`/`isInTrash` overrides (`2507–2512`).

   **Fix:** Supply the actual fragment-to-property mapping before implementation. Use ordered fragments for contiguous source segments, or another explicit assembly scheme that preserves evaluation and overwrite order. Add behavioral assertions for overridden capabilities; `typeof` and key snapshots cannot distinguish the correct function from an incorrect replacement.

5. **Major — The export migration omits an existing re-export surface.**

   **Evidence:** Design lines 92 and 134 describe repointing imports by specifier to the new root, defaults or overrides. But `deps.ts:394` re-exports nine names from the already-existing `site-paths.ts`.

   A real mixed consumer is `apps/website/src/index.ts:12`, importing `createSiteRouteDeps`, `defaultContentDbPath` and `siteDir` together. Changing only its module specifier either breaks it or recreates prohibited re-exports. The target map also does not assign the public `siteIdentityFor` function (`deps.ts:1041`), used by `composition/__tests__/deps-provider-plugin-boot.integration.test.ts:15`.

   **Fix:** Create a complete symbol destination table. Split mixed imports, point path consumers directly to `site-paths.ts`, remove the old re-export statement, and assign every public helper a concrete destination.

6. **Major — Several target slices still need function-level decomposition.**

   **Evidence:** The proposed `trash-follow-ups.ts` moves the map at `deps.ts:1522–1589`, containing **62 nonblank, noncomment lines**. The proposed `content-publish.ts` contains the apply-port construction at `2144–2207`, already **58 code lines**, plus additional construction.

   The design explicitly decomposes `configureSiteSharing`, but supplies no corresponding decomposition for these oversized operations. Small destination files do not establish functions of at most 50 lines.

   **Fix:** Identify responsibility-based builders inside these slices—for example, attachment-purge hooks and publish-port assembly—and specify their contracts and expected function sizes before execution.

7. **Major — The prescribed intermediate verification cannot remain green unchanged.**

   **Evidence:** Design line 144 requires `wiring-identity.test.ts` to remain green unmodified. That test explicitly permits lifecycle-owner construction only in a fixed file list containing `app.ts` and `deps.ts` (`composition/__tests__/wiring-identity.test.ts:205–233`). Moving construction into `site-deps/base.ts` fails it.

   The generic instruction to repoint `readCode(path)` does not handle this directory-wide ownership assertion. Also, line 137 prescribes `tsc -p apps/website`, but the pinned tree has no `apps/website/tsconfig.json`; the website configuration is at repository root.

   **Fix:** Include narrowly justified ownership-baseline updates in the same extraction commit, preserving the number and identity of lifecycle owners. Use the actual root compiler configuration with `--noEmit`, alongside the test configuration. Treat an extraction and its caller/test updates as one atomic commit.

8. **Major — The proposed media-client move conflicts with both current ownership and the untangle decision.**

   **Evidence:** Design line 161 describes a duplicate `createNodeMediaHttpClient` in Tovu that should move to `@jini-ai/integrations/media-providers/node`. No such function exists in this source. Tovu already calls Jini’s guarded client and Node ports (`deps.ts:88`, `2210–2218`).

   Jini’s existing adapter imports `@jini-ai/platform/http/guarded` (`packages/integrations/src/media-providers/dispatch/node.ts:4`). Untangle `DESIGN.md:231` expressly moves domain Node adapters into a host preset. Moreover, that adapter hardcodes `userAgent: 'media-provider'` (`node.ts:23`), whereas Tovu uses `"Tovu/0.1.0"` (`deps.ts:2212`).

   **Fix:** Reclassify this as host wiring over existing implementations. Coordinate any reusable adapter with the approved host-preset destination, preserving the Tovu policy and user agent.

9. **Minor — Some supporting census claims are wrong.**

   **Evidence:** Design line 128 describes 14 setting-registration links and two exceptional argument shapes. `deps.ts:1287–1302` contains **12 links**, with **three** functions using the direct-deps form: admin interface, site title and site timezone.

   Line 92 claims 30+ production importers. The `apps/**` census of static and dynamic imports resolving directly to this module finds three production files: `cli/commands/export.ts:4`, `cli/commands/serve.ts:9`, and `index.ts:12`.

   **Fix:** Correct the counts and publish a symbol-aware importer inventory. Distinguish importing files, import statements, textual mentions and transitive consumers.

## 02 — `02-tovu-composition-app.md`

**Verdict: needs rework**

1. **Blocker — The mount contracts do not carry values their moved bodies require.**

   **Evidence:** `isAuthenticatedPreviewRevision` is created in the proposed core-content slice (`app.ts:2066`) and consumed in the public-site slice (`2496`). The design gives mount functions `void` returns and specifies no handoff for this predicate.

   The proposed `mountAssistant` accepts only `activateAssistantFederation` from `CreateAppOptions` (design line 79), but its source body also consumes `assistantToolSurface`, `onBootWork` and `recoverAssistantChatRuns` (`app.ts:2355–2356`, `2385–2387`).

   **Fix:** Specify the complete mount dependency graph. Return the preview predicate from its owner and pass it explicitly to the asset mount. Give the assistant mount the complete option subset its body uses. Validate these contracts before moving statements.

2. **Major — The supposedly unchanged `createApp` signature removes supported default behavior.**

   **Evidence:** Design lines 74–75 require a `routeDeps` argument while claiming the public signature is unchanged. The source defaults it to `createRouteDeps()` (`app.ts:2040`). Existing callers exercise that behavior, including `server/__tests__/admin-post-page-delete-routes.test.ts:25`.

   Preserving the default also requires an explicit module-dependency decision: `http-app.ts` would import the memory root, while the memory root’s `createSiteApp` capability calls `createApp` (`app.ts:1620` onward).

   **Fix:** Preserve zero-argument and explicit-`undefined` calls, and document the resulting import graph and initialization safety. If removing the default is intended, it requires an approved behavior change and caller migration.

3. **Major — The shared boot-work registry has no destination.**

   **Evidence:** `siteAppBootWorkByDeps` is an exported module-level WeakMap (`app.ts:1802`). The durable root writes into it (`deps.ts:2949`), and BYOK tracking reads it (`app.ts:1945–1952`, `2356`). Neither the target tree nor migration steps assign it an owner.

   Losing this shared identity can allow the store to close underneath export/inspection app boot work. Existing behavioral coverage specifically checks that lifetime in `composition/__tests__/sqlite-create-site-app-module-identity.integration.test.ts`.

   **Fix:** Assign one shared registry owner and repoint both readers and writers atomically. Keep the subscription WeakSet (`app.ts:1799`) with its subscription owner as a single module instance. Explicitly place the omitted `mountRoutes`, `startModule`, `runExportSite` and `registerSiteChatBundle` helpers too.

4. **Major — The memory extraction repeats the unresolved deferred-dependency problem.**

   **Evidence:** Design lines 59–65 and 101 prescribe base-then-slice extraction using the SQLite naming scheme, without specifying memory-specific deferred contracts.

   In the real flow:

   - Plugin activation captures `agentPluginLayout` at `app.ts:482`, initialized at 1171.
   - Plugin runtime captures `contentTypeRepo` and `outbox` at 499, initialized later.
   - Trash adapters capture `formDefinitionRepo`, `entryRefsRepo`, `menuRepo` and navigation bindings (`750`, `811`, `823`, `843`), initialized at 962–966.
   - Gallery resolution captures media metadata initialized after resolver registration (`983–985`, `1064`, `1167`).

   Passing the later repositories as ordinary slice inputs evaluates them too early.

   **Fix:** Provide the memory root’s actual initialization graph and deferred capability contracts. Preserve shared repository identity and the current lazy initialization of the taxonomy database. Matching filenames is insufficient evidence that the roots have matching construction order.

5. **Major — The stated file split does not solve the remaining oversized functions.**

   **Evidence:** Design line 62 splits Trash adapters into content adapters, taxonomy/form adapters and a registration loop. The source map contains **216 code lines** (`app.ts:637–878`); the design gives file bounds but no per-adapter function decomposition.

   The apply-port statement is another oversized construction (`1088–1151`, 58 code lines). Separately, the pinned source’s `subscribeSiteEventHandlersOnce` remains **55 code lines** (`1820–1909`). The design references a different branch’s decomposition without making its adoption a prerequisite.

   **Fix:** Specify per-responsibility adapter builders and an apply-port builder decomposition. Either land the reviewed subscription decomposition first or include it explicitly. Verify the 50-line target against the actual execution base.

6. **Major — The route-table snapshot cannot pin “the whole of part B.”**

   **Evidence:** Design line 96 makes that claim, but important behavior occurs outside route registration:

   - Idle parking installs a stop hook (`app.ts:2037`).
   - Event subscriptions and module starts occur at 2058 and 2166.
   - BYOK boot tracking and federation activation occur at 2356 and 2361.
   - Recovery behavior and boot-work reporting depend on options at 2385–2387.

   The three proposed configurations also omit mounting-affecting options such as `stopForIdle`, `themeIdOverride` and `consentAudit` (`2031`, `1974–1992`). A stack snapshot cannot inspect captured dependencies or prove worker/subscription behavior.

   **Fix:** Keep the route snapshot, but supplement it with fake-port lifecycle transcripts, repeated-app subscription tests, boot-work drainage tests and targeted HTTP precedence checks. Cover each mounting-affecting option and relevant interaction.

7. **Major — The visitor builders are incorrectly characterized as pure forwarding functions.**

   **Evidence:** Design line 110 proposes exact-key forwarding tests for three supposedly pure builders. The source also constructs a comments limiter and starts salt resolution using environment, runtime mode and keyring (`app.ts:2532–2537`). The salt owner can derive a secret, warn and generate randomness (`features/comments/ip-hash-salt.ts:65–74`).

   The forms builder constructs file-storage capabilities and retains deferred filesystem and principal lookups (`app.ts:2583–2603`). Exact-key assertions do not verify these behaviors or their lifetime.

   **Fix:** Preserve these as capability-construction boundaries. Test through fake keyring/storage interfaces, including deferred execution, failure behavior and construction frequency. Reuse the existing salt resolver rather than reimplementing its policy.

8. **Major — Blanket duplication of slices is not a reuse decision based on their contracts.**

   **Evidence:** Design line 91 forbids sharing any slice and allows sharing only literal fragments that match after identifier renaming. Yet the guarded HTTP construction is already identical across the roots (`app.ts:1156–1164`, `deps.ts:2210–2218`), and the publish assembly follows the same mechanism over different repository implementations (`app.ts:1088–1151`, `deps.ts:2144–2207`).

   Conversely, identical literal syntax does not prove equivalent lifecycle semantics. Placing shared result contracts beneath the SQLite implementation’s folder (line 87) also makes the memory implementation depend on its sibling implementation’s ownership.

   **Fix:** Decide ownership per shared invariant. Keep adapter construction separate where contracts differ, and reuse common host assembly where the contracts match. Put shared contracts in a neutral owner. The generic `createLazyProxy` should land in Jini before dependent Tovu changes, or carry the required explicit deferral and backlog entry.

## Recurring mistake classes

- Trace deferred reads as carefully as direct calls. Explicit arguments can turn safe closures into eager TDZ failures.
- Define cross-slice inputs, outputs, initialization points and mutable-state ownership before prescribing extraction order.
- Preserve optional values, fallbacks, promises and domain errors separately; they are different contracts.
- Inventory every export and mixed import before deleting an entry path.
- Verify function limits inside proposed files; file counts do not establish compliant functions.
- Characterize observable behavior. Key shapes and router stacks do not prove captured dependencies, security policy or lifecycle ordering.
- Verify that test seams exist and compiler commands target real configurations.
- Make each extraction commit include its necessary caller and test updates.
- Base reuse decisions on ownership and shared invariants, and follow the latest approved untangle destination.
