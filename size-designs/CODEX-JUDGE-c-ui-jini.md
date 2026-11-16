Software Architect / Code Inspection(Review):

Reviewed the specified `github/integ/wave-b-fixed` refs: Tovu `1ae82a766`, Jini `1fd7c0763`, plus `INDEX.md`, `LANES.md`, and `DESIGN.md`. Source references below refer to those Git snapshots. No files were edited and no tests were run.

The requested `agents/code-review/skills.md` is missing; I loaded the available `agents/code-inspection/skills.md` alongside the architect persona. Target complexity and size compliance remain unverified because the proposed implementations do not exist.

## 05 — Tovu PostEditor: needs rework

Source: `apps/admin/src/features/posts/PostEditor.tsx`.

1. **Major — The proposed section boundaries cannot preserve the current element order as described.**  
   **Evidence:** Design §2 groups header, actions, and toolbar-end into `PostEditorChrome`, while `PostEditorWorkspace` owns preview tabs, template picker, toolbar, and body. The real order is header (`1598`), notices (`1609`), view/template toolbar (`1633`), actions (`1676`), settings dialog (`1692`), collision notice (`1706`), then preview/body (`1712`). These responsibilities interleave; four sequential section components cannot reproduce that order using the stated bundles alone. The target also does not explicitly allocate content analysis and taxonomy (`1758–1761`).  
   **Fix:** Define composition around contiguous rendered regions and provide the complete root JSX, including saved-post panels and all intervening notices/dialogs.

2. **Major — Several mandated extraction seams do not match the source.**  
   **Evidence:** Design §2 specifies `PostEditorTitleRow + PostEditorStatusRow`, but the header contains back navigation, title, and slug (`651–769`); status belongs to `PostEditorActions` (`985–999`). It also mandates `ActionsMenu`, although actions contain ordinary publish/save/delete/settings buttons (`1006–1060`), with no menu. Design rule 4 tells the executor to stop when a named seam does not exist and the original exceeds 80 lines—exactly the situation for `PostEditorActions`.  
   **Fix:** Replace these names with verified responsibilities: back navigation, title/slug fields, status and publishing controls, save feedback, and settings trigger. Specify a decomposition that actually reaches the limits.

3. **Major — “Typography” includes CMS-specific insertion behavior, invalidating both the split and the blanket Jini flag.**  
   **Evidence:** Design assigns `404–533` to typography and only names three select components. Typography ends at `459`; `460–533` contains `EmbedInsertControl`, image/YouTube insertion, and post mentions using `AdminPost`, `mentionablePosts`, and `currentPostId`. The claim in §6 that the whole toolbar has “no post vocabulary” is false.  
   **Fix:** Give insertion controls an explicit owner and target. Separate reusable formatting from CMS embeds and post references; any Jini extraction must receive product behavior through an appropriate contract.

4. **Major — The exported-symbol inventory is incomplete.**  
   **Evidence:** Design §2 says the file keeps its “single export.” It currently exports toolbar state/defaults/probe (`150`, `155`, `199`), bubble-menu state/defaults/probe (`593`, `597`, `607`), `PostEditorProps` (`1423`), and `PostEditor` (`1513`). The probes test imports four runtime names from the old module (`__tests__/PostEditor.toolbar-probes.unit.test.ts:4`). Neither probe function nor the bubble probe data has an explicit destination in the target.  
   **Fix:** Map every exported declaration, move each probe with its data and comments, and update its consumers in the same compiling commit. Do not retain forwarding exports.

5. **Major — Loading/error handling and dialog lifetime are missing from the screen-hook contract.**  
   **Evidence:** The controller’s `post` can be absent; hooks run before the loading/error returns (`1583–1592`), and only afterward may rendering dereference `post`. The proposed `PostEditorScreen` contains only section bundles. Additionally, `usePostUrlDialog` belongs to `PostEditorBody` (`1286`) and its dialog renders there (`1297`), so its state unmounts when switching to preview. The proposed screen-level dialogs include URL dialogs without preserving that lifetime.  
   **Fix:** Define a loading/error/ready result contract and retain unconditional hook calls. Keep URL-dialog ownership under the edit body, or explicitly preserve its existing mount/reset behavior and characterize edit→preview→edit transitions.

6. **Minor — The phone-width DOM snapshot does not establish overflow behavior.**  
   **Evidence:** The actual overflow calculation reads `offsetWidth`, `clientWidth`, computed gaps, and cached control widths (`hooks/use-post-editor-ui.hooks.ts:152–161`), with `ResizeObserver` and layout effects (`185–194`). Design step 0 specifies `innerHTML` at phone width without defining geometry or observer behavior.  
   **Fix:** Use controlled geometry and observer fakes to exercise promotion/demotion, or add a browser check. Assert which ranked controls remain primary and that “More” fits.

## 07 — Jini chat-pane styles: sound with fixes

Source: `packages/chat/src/react/features/chat-pane/styles.ts`.

1. **Minor — The escape-count assertion would reject a correct extraction.**  
   **Evidence:** Design §1 and §5 require three escaped backticks. The source has **eight**, on three lines: four at `952`, two at `1210`, and two at `1239`.  
   **Fix:** Distinguish occurrence count from matching-line count. Preserve all eight escapes and verify the evaluated string against the captured hash and length.

2. **Minor — The responsibility map and importer count are inaccurate.**  
   **Evidence:** There are **11 test importers total**, not 13; seven are `styles-*` tests, with the remainder being `ChatPane`, hit-targets, `Composer`, and `Markdown` tests. The proposed attachment range also contains composer textarea rules (`707–728`), the “markdown-table” range starts with code-toolbar rules (`1687–1721`), and the attachment-preview tail includes composer/folder-chip rules (`2016–2034`).  
   **Fix:** Correct the test manifest and describe these as ordered cascade segments with their actual contents. Name the mixed segments accurately and move introductory comments to the following segment as promised. Keep the original cascade order.

## 08 — Jini useChatPane: needs rework

Source: `packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts`.

1. **Blocker — The proposed hook graph has no valid evaluation order.**  
   **Evidence:** `useChatPaneRefs` is called first but requires `composer`, `conversation`, and `queuedTurn`, which are created later. Selection needs `composer.setAgent` (`535–562`), while conversation/composer initialization needs selection (`463–491`). Typed-answer delivery requires `enqueueTurn` (`839`, dependency at `848`), but the proposed queue hook comes later. Mid-run delivery also needs `enqueueTurn` (`897–899`), while queue release needs `sendIntoRunningTurn` (`1077`). The stated “root passes one sub-hook’s result into the next” direction cannot satisfy these dependencies.  
   **Fix:** Separate state/ref allocation from synchronization, queue mutation from queue release, and selection resolution from composer synchronization. Supply an acyclic call graph and concrete contracts before execution.

2. **Blocker — Moving the types while leaving the public entry untouched breaks compilation.**  
   **Evidence:** Design §2 removes type exports from the hook file while saying the pane `index.ts` and `ChatPane.tsx` remain untouched. The real `index.ts:54–58` re-exports `UseChatPaneOptions` and `UseChatPaneResult` from that hook file; `components/ChatPane.tsx:24` imports the result type there too.  
   **Fix:** Repoint the public entry’s type exports and every internal type importer in the type-move commit. Preserve the published names without leaving a shell at the old implementation path.

3. **Major — The helper and ref inventory substantially understates the work.**  
   **Evidence:** The source has **25 module-level helper functions**, not nine, and **21 `useRef` sites**, not twelve. Missing helpers include `recordConsumedInputs` (`194`), `awaitingRunReceipts` (`204`), delivery exception guards (`264`, `280`), `turnFolders` (`1157`), and `attachQueuedInput` (`1237`). The displayed ref contract omits delivery locks, answer/conversation generations, upload controllers, and batch ownership (`419–440`). These enforce delivery and isolation behavior.  
   **Fix:** Produce a complete symbol/state ownership table. Separate pure targeting rules from delivery effects and ID creation; revise file-size and effort estimates using that complete inventory.

4. **Major — Effect order cannot be delegated to a port-log experiment.**  
   **Evidence:** Design §3 allows reordering unless step-0 logs reveal a difference. Existing effects write internal state and refs that need not emit a port call: queue projection (`513–515`), selection synchronization (`537–555`), attachment-error clearing (`587–590`), answer generation (`592–598`), and attachment-batch adoption (`605–616`). Furthermore, extracting one release-guard hook cannot interleave it between two effects that remain inside a single conversation hook.  
   **Fix:** Specify the exact expanded effect order and preserve it structurally. Split synchronization phases where necessary. Add transition assertions for conversation switching, receipt projection, and late delivery/upload completion; absence from an external log is not proof of equivalence.

5. **Major — The context-wrapper recipe does not preserve closure semantics by itself.**  
   **Evidence:** Design §2 proposes `useCallback((i) => sendGuardedPrompt(ctx, i), [same deps as today])`. A newly constructed `ctx` is now a captured dependency. Omitting it can retain old fields; including it can change callback identity every render. The source intentionally mixes captured values—such as upload `composer` and conversation ID (`618–659`)—with latest-ref reads after asynchronous delivery (`743–776`, `823–848`).  
   **Fix:** Define captured versus live inputs for each callback and how context identity is maintained. Characterize retained old callbacks across draft changes and conversation switches, rather than only comparing the latest result’s identities.

## 09 — Jini ChatPane component: needs rework

Source: `packages/chat/src/react/features/chat-pane/components/ChatPane.tsx`.

1. **Blocker — The proposed hook file cannot parse the code assigned to it.**  
   **Evidence:** Design §2 moves `759–865` into `useChatPaneView.hooks.ts`. That range includes the JSX-producing runtime-picker callback (`837–855`). JSX requires a `.tsx` file.  
   **Fix:** Use `.hooks.tsx`, or give runtime-picker rendering a defined `.tsx` owner and pass the required values through its contract.

2. **Major — The proposed view contract and root example remove existing behavior and layout.**  
   **Evidence:** Design lines `53–60` render transcript, status, and composer directly under `<section>`. The real root contains header (`877`), plugin usage (`878`), a body wrapper (`879`), a controls wrapper with its own ref (`894`), controls suggestions (`895–897`), secret-redaction notice (`898–903`), and footer (`938`). Its root also carries style, activity, ref, and click-capture behavior (`868–873`). The proposed contract does not represent several of these. `useChatPaneControlsHeight.hooks.ts:23–27` explicitly requires the existing ancestor/sibling relationship.  
   **Fix:** Provide the complete final JSX and view contract, including both refs, wrappers, slots, notices, and event handlers. Add characterization cases for footer, plugin usage, redaction dismissal, and measured controls height.

3. **Major — The earlier execution window is blocked by known imports, not a hypothetical risk.**  
   **Evidence:** Design §6 inherits design 08’s “before R4 sheets or after R4” timing. This source imports `WorkingDirPicker` and `useAgentHandle` from `@jini-ai/ui` (`6`). The proposed working-directory leaf needs the former (`374–384`); the proposed view hook absorbs the latter’s invocation (`757`). Their new files have no L5 debt entry; the existing allowance is tied to `components/ChatPane.tsx` (`scripts/injection-debt.json:61`).  
   **Fix:** Require the applicable chat-kit/R4 conversion to land first and revalidate the extraction against that resulting source. Alternatively, obtain an explicit coordinator-approved contract change before moving these consumers. Do not start this design on the assumption that the pre-R4 window is executable.

## 10 — Jini daemon launcher: needs rework

Source: `packages/daemon/src/agent-executor/launch.ts`.

1. **Blocker — The cleanup premise is factually wrong and could introduce premature cleanup.**  
   **Evidence:** Design §§1–2 repeatedly describe an existing `try/finally` and promise to copy it. There is **no `finally`** in `run`. The only terminal `try/catch` handles spawn confirmation (`1690–1696`). Successful execution gives cleanup callbacks to lifecycle handlers (`1265–1292`, `1314–1388`). Lock release occurs on child exit (`1685`) or handoff (`1703`), and `releaseStagedResources` actually calls `releaseRuntimeLock()` **before** `cleanupStagedFiles()` (`1593–1595`).  
   **Fix:** Replace the fictional finalizer with an explicit ownership-transfer design. Preserve separate startup-failure, process-exit, close, and handoff paths. Test that `run()` resolving does not delete resources or release a still-needed lock.

2. **Major — The proposed state contracts omit essential executor and resource state.**  
   **Evidence:** `ExecutorScope` contains only options, ports, and runtime; `RunStage` contains filenames and a lock. Existing executor-owned maps include filesystem temps (`1040`), live inputs and relays (`1085–1086`), and the exported `claimUserMessages` closure (`1088`). Per-run cleanup retains resource objects with cleanup methods, HTTP MCP state, written MCP path, and an abort controller (`1507–1595`). Several fields are cleared before awaiting cleanup to prevent repeated consumption.  
   **Fix:** Define executor-owned state separately from per-run state. Retain typed resource handles, cleanup ownership markers, and the process-exit controller. Verify overlapping runs **and separate executor instances**, including relay/message operations after startup returns.

3. **Major — The leaf map omits required functions and misclassifies effectful code as pure planning.**  
   **Evidence:** No destination is assigned to `selectAgentExecutorHostEnv` (`212–223`), process/misc dependency resolution (`288–318`), command preparation and spawn confirmation (`893–921`), or HTTP-MCP helpers (`963–992`). These are used by the remaining pipeline; several are public exports in `agent-executor/index.ts`. Meanwhile, the proposed `child-env.ts` range includes prompt/log staging (`402–423`), and `build-args.ts` includes settings preparation (`728–736`) plus the definition’s potentially effectful `buildArgs` call (`765`). The source explicitly explains that `buildArgs` can write shared settings (`1598–1604`).  
   **Fix:** Map all declarations and public exports. Separate environment calculation, resource staging, command preparation, and spawn confirmation according to actual effects. Update direct importers and public entry exports in each move commit.

4. **Major — The proposed run contract changes the API and misuses the argument convention.**  
   **Evidence:** Design §2 specifies `run({ scope }, input): Promise<AgentRunHandle>`. The actual contract is required run fields plus optional settings, returning `Promise<void>` (`contracts.ts:270`; implementation `launch.ts:1450`). The example’s second argument is mandatory execution input, not optional settings, and the proposed handle has no demonstrated existing contract.  
   **Fix:** Preserve `AgentExecutor['run']` at the returned executor boundary. Give the internal runner a required object containing scope and required execution data, plus optional settings defaulting to `{}`. Reuse the existing contract rather than introducing a new result model.

5. **Major — The new characterization plan misses key distinctions and overlooks existing pins.**  
   **Evidence:** Sorted environment **keys** cannot detect altered values or merge precedence. `computeChildEnv` combines MCP configuration, instructions, staged homes, and overlay overrides (`447–478`). Existing `split-parity.test.ts:55–80` already checks exact merged values and unchanged-object identity; `83–103` checks synchronous spawn. The source requires spawn→listener registration to remain in one synchronous turn (`854–866`, `1666–1691`). A generic ordered port transcript does not necessarily expose an inserted microtask boundary.  
   **Fix:** Extend the existing characterization suites. Assert deterministic environment values, precedence, identity where contractual, and the spawn-error microtask race. Include success-path resource retention and distinguish handoff, exit, and close timing.

## Recurring mistake classes

- **Inventory every declaration, export, state cell, and direct consumer before defining target files.** Explicitly account for helpers outside the headline function.
- **Prove dependency order before grouping hooks.** Split allocation, synchronization, mutation, and release when their dependencies run in different directions.
- **Preserve DOM order and mount lifetime separately.** Fragments prevent extra elements; they do not preserve ordering or state ownership automatically.
- **Treat closure capture, synchronous spans, and cleanup ownership as contracts.** “Move verbatim” does not establish equivalence after changing their surrounding scope.
- **Classify responsibilities from function bodies and effects.** Names such as “typography,” “planning,” or “composition root” do not establish a boundary.
- **Use characterization assertions that can detect the proposed failure.** Test environment values, geometry, internal transitions, and scheduling where those determine behavior.
- **Make known untangle dependencies prerequisites.** Revalidate after those lanes land; path-keyed debt cannot silently follow extracted code.
- **Check actual target contracts and metrics before removing debt entries.** Preserve `(required, optional = {})`, existing return contracts, function limits, complexity limits, and file limits without relying on estimated file sizes.
