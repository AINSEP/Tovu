Software Architect(Direct): **Verdict: needs rework.**

Reviewed DESIGN, INDEX, COMMON and all 16 sheets. Source evidence below uses Jini `refactor/terra@02edbb68` (`J:`) and Tovu `refactor/terra@80b00f5b` (`T:`). Plan references beginning `P:` are under `notes-second-app/` at `6a250c319`. No files were edited; no builds or tests were run.

1. **Blocker — G2 creates a second implementation at an already-owned destination.**  
   `P:sheets/G2-entries-sql.md:24–27` introduces `entryRepoFor` under `cms/entries/sql`. The S2 sheet on `plan/lanes-s-u-2026-11-16`, `S/S2-entries-content-types-sql.md:7,25–33`, already owns that destination and moves Tovu’s `SqlEntryRepo` and `entryRepoFor` there. The existing implementation includes trash handling, atomic CAS and additional read contracts (`T:apps/website/src/features/entries/repo.ts:21–29,93–105`). G2 instead assumes Tovu retains its own repository (`G2:30`). G15 is also misrouted: S3 already plans `user-management/server/sql` (`S/S3-identity-sql.md:1–15`).  
   **Fix:** Make NOTES consume S2’s adapter; dispatch any remaining requirements through that owner. Identify G15’s existing S3 owner instead of requesting another design.

2. **Blocker — N2’s static-serving design cannot use the current `Server` contract.**  
   `P:sheets/N2-web-admin.md:75,81–82` requires `/`, assets and arbitrary non-API fallback paths through one static registrar. The contract explicitly forbids wildcards and requires equal segment counts (`J:packages/core/src/contracts/server.ts:95–107`). NOTES already registers `GET /` (`J:examples/notes-app/src/app.ts:58`), and duplicate registrations throw (`node-server.ts:153–155`). Registering the static route last cannot solve either problem.  
   **Fix:** Design the host adapter’s unmatched-request handling and choose a distinct admin mount path before N2. Preserve the existing HTML routes and smoke assertions explicitly.

3. **Blocker — G7’s default request cannot start a daemon run.**  
   `P:sheets/G7-chat-daemon-transport.md:33` specifies “prompt + attachments only.” The daemon requires a nonempty `contextRef` and reads neither of those fields (`J:packages/daemon/src/http/runs.ts:117–133`). The existing transport supplies `contextRef` through the playground encoder (`J:examples/reference-web/src/daemon-transport.ts:232–243`), which G7 removes. N4 supplies no replacement serializer.  
   **Fix:** Define the host-neutral request contract and NOTES’ matching `resolveRunInput` binding together. Test the serialized request against the real daemon parser.

4. **Blocker — several prescribed intermediate commits cannot satisfy the shared contract.**  
   G6 moves adapters and leaves example stubs in steps 2–3, but introduces their package exports only in step 4 (`P:sheets/G6-entity-adapters.md:46–50`). Package-subpath imports therefore cannot resolve in the intervening commits. G7 first moves code containing the forbidden platform import, then removes that dependency in the next commit (`G7:58–63`; original import at `J:examples/reference-web/src/daemon-transport.ts:2`). Its manifest edit may instead be left for the coordinator.  
   **Fix:** Each move must atomically include the final ports, export map, caller updates, tests and deletion. Resolve coordinator-owned edits before dispatch rather than leaving incomplete commits.

5. **Blocker — the sandboxed preload needs bundling, which D0/D1 do not plan.**  
   D0 replaces the handwritten preload with package calls; D1 imports `exposeBridge` and its channel table while specifying `sandbox: true` and a plain `tsc` build (`P:sheets/D0-desktop-host-ipc-bridge.md:58–61`; `D1-notes-desktop.md:35,40,61`). The current preload requires only Electron (`J:examples/reference-desktop/src/preload.cts:1`). Sandboxed preloads cannot load arbitrary package or local files through `require`; Electron requires bundling for this arrangement. [Electron sandbox documentation](https://www.electronjs.org/docs/latest/tutorial/sandbox).  
   **Fix:** Add a bundled CJS preload build, externalize Electron, and test the emitted preload in a real sandboxed window.

6. **Major — the note descriptor makes creation require a server-generated version.**  
   N1 declares `version` required (`P:sheets/N1-notes-entity-api.md:41`); G5 later renders it read-only (`G5-field-renderer-search.md:62`). New drafts initialize non-boolean fields to `undefined` (`J:packages/admin/src/react/entities/rules.ts:100–105`), and missing required fields disable saving (`use-entity-edit.ts:81–84`; `EntityEdit.tsx:36`). A read-only renderer supplies no initial value.  
   **Fix:** Specify separate creation and persisted-row requirements, or introduce an explicit initialization mechanism. Do not require users to invent a concurrency token.

7. **Major — the promised conflict UI has no usable error seam.**  
   N2 requires a conflict-specific message and Reload action (`P:sheets/N2-web-admin.md:62–63,72`). The editor catches errors without retaining them (`J:packages/admin/src/react/entities/use-entity-edit.ts:113–114`) and renders only “Operation failed” (`EntityEdit.tsx:55`). No sheet changes that contract.  
   **Fix:** Add a generic typed mutation-failure/recovery seam in admin before N2. Test conflict identity, retained draft contents and reload behavior.

8. **Major — N4 invalidates a cache that the entity screens do not use.**  
   `P:sheets/N4-chat-ui.md:39–41` proposes `useInvalidate()` after a run. Entity reads use local per-mount state and rerun only when `load` or `scope` changes (`J:packages/admin/src/react/entities/use-entity-read.ts:7–21`; `EntityList.hooks.ts:16–24`). Query-cache invalidation cannot refresh that list. The fallback requiring focus or manual refresh also contradicts N5’s automatic-update assertion.  
   **Fix:** Name and implement the actual refresh binding—such as replacing the registry/port identity—or add an explicit refresh seam before N4.

9. **Major — “required props only” leaves ChatPane unable to send.**  
   N4 supplies transport and required props only (`P:sheets/N4-chat-ui.md:33`). ChatPane defaults to an empty agent inventory and local execution (`J:packages/chat/src/react/features/chat-pane/components/ChatPane.tsx:591–599`); its send gate rejects an absent selected agent (`rules.ts:182–186`). Detecting a CLI on the server does not populate the browser.  
   **Fix:** Specify the runtime inventory and selection binding, including a selectable scripted agent for N5, and add the required proxy endpoints before mounting the pane.

10. **Major — N1’s publication and editable-field mappings disagree with the services.**  
    N1 models `draft | published` and expects publishing followed by unpublishing to return to draft (`P:sheets/N1-notes-entity-api.md:32,52`). The real lifecycle includes `unpublished`, and `unpublishEntry` produces that state (`J:packages/cms/src/entries/types.ts:16`; `write-service.ts:652–653`). N1 also exposes an editable slug, while `updateEntry` accepts no slug (`write-service.ts:347–371`).  
    **Fix:** Preserve all lifecycle states or document an approved projection. Make slug immutable in the UI unless its owning service gains a separately designed rename operation.

11. **Major — the assistant cannot update a note’s body through the advertised existing tool.**  
    The services support body changes, but `collections_entry_update` forwards only title, fields and expected version (`J:packages/cms/src/entries/tool-registrations.ts:177–191`). DESIGN promises an assistant that updates notes through these registrations (`P:DESIGN.md:31–33`), without recording this missing binding.  
    **Fix:** Add the gap to the CMS tool owner’s work, including schema and handler changes. Verify an assistant body edit through the delegated tool path.

12. **Major — N1’s bounded search binding uses arguments the read service does not accept.**  
    N1 proposes `listEntries(..., { type, limit })` and claims a 200-row bound (`P:sheets/N1-notes-entity-api.md:33,42`). `listEntries` accepts and forwards only `type` (`J:packages/cms/src/entries/list.ts:42–49`), so this binding either fails typechecking or reads the full collection before filtering. `search` is also absent from `AdminEntityListQuery` until the much later G5 (`J:packages/admin/src/core/ports/entities.ts:229–255`).  
    **Fix:** Land the required read/query contract before its consumers, and distinguish a database read bound from truncating already-loaded rows.

13. **Major — G2 has not resolved its pagination or transaction contract.**  
    G2 proposes an additive `nextCursor` result “only if” the current result permits it (`P:sheets/G2-entries-sql.md:26,67–69`). The result is concretely `EntryRecord[]` (`J:packages/cms/src/entries/list.ts:33`), not a page object. Its shared suite also requires rollback against `InMemoryEntryRepo` (`G2:35–41`), whose transaction simply invokes the callback (`J:packages/cms/src/entries/repo.memory.ts:67–69`).  
    **Fix:** Resolve the page API and memory transaction semantics with S2 before writing executable steps. Include every changed implementation and consumer in those commits.

14. **Major — G6’s wire protocol loses existing port semantics.**  
    G6’s list protocol carries only `limit`, `cursor` and `search` (`P:sheets/G6-entity-adapters.md:26`), although its conformance requirements include filter and sort (`:36–38`). Its JSON patch protocol also lacks a clearing representation. The editor deliberately sends explicit `undefined` to clear optional fields (`J:packages/admin/src/react/entities/use-entity-edit.ts:55–58`); ordinary JSON serialization removes those properties.  
    **Fix:** Specify filter/sort serialization and explicit field-clearing semantics. Exercise both through the HTTP round trip, not only the memory adapter.

15. **Major — N3 leaves authenticated MCP callbacks undesigned.**  
    N3 allows fallback to default security and says to mirror the example’s MCP injection (`P:sheets/N3-assistant-server.md:42,77–78`). Strict mode already supports an injected token environment (`J:packages/server/src/create-local-node-daemon.ts:149,153`). However, MCP callbacks need their own credential binding: the executor does not inherit `JINI_*` keys from arbitrary injection environment, and credentials arrive through a resolver (`agent-executor/mcp-bridge.ts:74–86`; `contracts.ts:441–463`). That contract explicitly forbids handing the child the host’s inbound API token. The planned tests call the daemon directly with a bearer and never exercise this missing delivery path.  
    **Fix:** Design callback credential issuance and validation explicitly. Remove automatic security downgrade and prove a real MCP callback authenticates with the intended authority.

16. **Major — N3 invents denial/conflict responses instead of characterizing them.**  
    N3 expects a tool-permission denial code and a conflict result (`P:sheets/N3-assistant-server.md:66–67`). Domain registrations currently use an allow policy (`J:packages/core/src/registration-kit.ts:539`); service failures are thrown by `fromResult` (`:299–303`). The executor classifies non-`ToolInputError` failures as internal (`packages/daemon/src/tool-executor.ts:441`), which the delegated route maps to its internal-error path (`http/delegated-tools.ts:280–291`). DESIGN’s mutation `authorize: () => 'allow'` also does not match the CMS evaluator’s `{ allowed, reason }` result contract.  
    **Fix:** Characterize the deployed outcomes first. Record any desired error-mapping change as an owned gap, and use correctly shaped authorization mutations.

17. **Major — the provider inventory stops at direct AdminKit slots.**  
    N2 inventories shell/entity symbols and mounts AdminKit plus a query provider (`P:sheets/N2-web-admin.md:21–27,39,56–59`). A selected UI implementation can itself require another binding: `CustomSelect` calls the UI kit’s overlay hook (`J:packages/ui/src/react/components/CustomSelect.tsx:14,532`), whose provider is mandatory (`react/kit.tsx:57–63`). N4 likewise omits the existing host i18n binding, leaving `useT` on its default context (`J:packages/chat/src/react/hooks/context.ts:24–49`).  
    **Fix:** Inventory transitive provider/hook requirements and bind them at each browser composition root. Add tests that detect unbound hooks, including translation and locale hooks where used.

18. **Major — prohibited shells are expressly prescribed.**  
    G1 leaves a three-line re-export (`P:sheets/G1-node-server.md:43–47`); G6 leaves two stubs (`G6:46–50`); G7 leaves thin re-export files (`G7:58–63`). N2 requires slice `index.ts` files containing named exports (`N2:29`), and D0 requests a bridge re-export file even though the implementation already exists (`D0:26,58`).  
    **Fix:** Remove those steps. Point export maps at implementation files and move/repoint/delete atomically.

19. **Major — owner exceptions and STOP rules are incomplete.**  
    DESIGN permits React entries to import `@jini-ai/ui-kit/react` despite the stated package boundary (`P:DESIGN.md:174`). G16 defers the object-argument conflict while new adapters must implement the positional ABI (`:147`; `J:packages/admin/src/core/ports/entities.ts:290–299`). COMMON’s STOP list does not cover red commits, uninjected hooks, shells, lost why-comments or stale counts; its baseline/gate rules permit failures to be merely reported (`P:sheets/COMMON.md:15–16,45–55`). Cognitive complexity and error-handling requirements are also missing from its limits.  
    **Fix:** Resolve exceptions before dispatch and estimation. Make the complete owner rules executable acceptance and STOP conditions, preserving a separate green-baseline path for characterization tests.

20. **Major — the verification instructions cannot establish their claimed result.**  
    COMMON invokes `pnpm api:check`, which is absent from the inspected root scripts (`J:package.json:9–37`). Its Tovu check runs `npm install` and root `tsc` without invoking the existing Jini link mechanism; registry dependencies remain active (`T:package.json:132–148`; `development/scripts/link-jini.mjs:2–20`). G1 moves a `node:test` suite into a package whose test script runs Vitest (`J:examples/notes-app/src/node-server.test.ts:5`; `packages/http-kit/package.json`). The size checker also excludes examples and permits 80-line functions (`J:scripts/check-size.mjs:14–15`).  
    **Fix:** Supply real commands for linking the exact Jini SHA, checking each affected Tovu application, running the moved tests, and enforcing the stricter example limits.

21. **Major — G1 misses the existing route-matching owner.**  
    G1 moves the example adapter’s matching and precedence implementation into http-kit (`P:sheets/G1-node-server.md:18–26,43`). Core already exports `createRouteTable` and `matchServerPath` specifically to keep adapters from reimplementing them (`J:packages/core/src/contracts/server/route-table.ts:1–3,32,74`; `contracts/server.ts:123`).  
    **Fix:** Make the adapter call the core route table. Preserve only Node request/response conversion, listening and socket lifecycle in http-kit.

22. **Minor — several inventory facts and red-test expectations are wrong.**  
    N0 expects no `getSetCookie` and a failing cookie test (`P:sheets/N0-server-baseline.md:17,31`), but the inspected adapter already preserves cookies using it (`J:examples/notes-app/src/node-server.ts:94–102`). G1 similarly schedules precedence changes already implemented at `:57–65,136–139`. N5’s referenced `examples/minimal-host/scripts/health-boot.ts` does not exist; the existing test identifies the root `scripts/health-boot.ts` (`J:examples/minimal-host/src/health-boot.test.ts:21–22`). N5’s described browser sequence creates two notes, then asserts three.  
    **Fix:** Regenerate expected facts against the pinned base. Characterize existing fixes rather than requiring already-correct behavior to fail.

23. **Minor — G8 labels a supported standard-library operation as a missing package capability.**  
    DESIGN says an installed consumer cannot locate the MCP bin (`P:DESIGN.md:139`), but the existing `./bin` export already resolves to `dist/bin/serve.js` (`J:packages/mcp/package.json`, `exports["./bin"]`). N3 itself proposes using `import.meta.resolve` on that export (`P:sheets/N3-assistant-server.md:43`).  
    **Fix:** Use that public subpath and standard URL conversion. Retain a separate package helper only if an independently required behavior remains after this reuse decision.

24. **Major — D1 names the wrong shutdown method and omits failed-start cleanup.**  
    D1 tests that the launcher handle’s `stop()` is called (`P:sheets/D1-notes-desktop.md:64–66`), while the actual handle exposes `shutdown({}, options)` (`J:packages/desktop-host/src/sidecar.ts:49–58`). D0 explicitly leaves a child alive after readiness timeout, and D1 responds by showing a dialog and quitting (`D0:53`; `D1:43–44`), without requiring shutdown of that failed-start child.  
    **Fix:** Specify the exact launcher binding and retain the handle across readiness failure. Test timeout, early exit and post-spawn failure cleanup through `shutdown`.

25. **Major — D2 assumes Node discovery that `node-toolchain` does not provide.**  
    D2 prefers “a Node found by” that package (`P:sheets/D2-desktop-packaging.md:22–25`). Its actual API constructs shims around a supplied Electron executable (`J:packages/desktop-host/src/node-toolchain/index.ts:15–21,55–77`); it does not discover an independent system Node. Using those shims changes the native ABI assumption underlying D6.  
    **Fix:** Choose a concrete Node distribution/discovery strategy and corresponding SQLite staging/build contract before the desktop sheets run.

26. **Major — the packed proof does not prove the second browser consumer.**  
    N5 installs a scratch copy of `notes-app` and runs its existing smoke script (`P:sheets/N5-web-proof.md:45–48`). That script exercises the HTML server and contact form, without `--web`, the admin bundle or an assistant tool call (`J:examples/notes-app/scripts/smoke.ts:17–18,47–70`). Missing browser peers or broken browser entry points can therefore coexist with `NOTES_PACKED_BOOT_OK`.  
    **Fix:** Build and boot the packed browser application outside workspace resolution, then exercise admin CRUD and a scripted assistant tool round trip there.

The inventory sampling covered 18 rows against source and export maps:

| Sample | Source check | Result |
|---|---|---|
| Server helpers/testing/conformance | `core/package.json:23–26`; `contracts/server.ts:120–128` | Present |
| Node adapter | `notes-app/src/node-server.ts:116` | Example-owned; core matching owner missed |
| SQLite connection/kernel | `db/package.json`, `./sqlite`, `./kernel/sqlite` | Present |
| SQL entry repository gap | `cms/src/entries/index.ts:99–102` | Absent currently; S2 already owns arrival |
| Five entry tools | `cms/src/entries/tool-registrations.ts:147–198` | Present; body-update binding missing |
| Admin shell | `admin/package.json:23`; `react/shell/types.ts:63–85` | Present |
| Entity screens | `react/entities/index.ts:1–5`; `EntityField.tsx:73` | Present; text control is single-line |
| Monolithic AdminKit | `react/kit.tsx:119–126,155–162,194–199` | Inventory matches |
| Browser navigation | `browser/shell-navigation.ts:10–16` | Present |
| Daemon preset | `server/src/create-local-node-daemon.ts:149–198` | Present; security/credential contracts incomplete in plan |
| Chat transport port | `chat/src/core/transport.ts:97–107` | Present |
| Example daemon transport | `reference-web/src/daemon-transport.ts:214–283` | Present; request protocol was not carried into G7 |
| MCP bin | `mcp/package.json`, `exports["./bin"]` | Already publicly resolvable |
| Desktop bridge isolation | `desktop-host/src/index.ts:12–17` | Root mixes bridge and Node modules |
| Sidecar readiness | `desktop-host/src/sidecar.ts:37–58` | Probe API exists; proposed `ready` API is new |
| Electron binders | `reference-desktop/src/electron-surfaces.ts:17–102` | Example-owned |
| Packaging helpers | `devops/src/packaging/electron/entry.ts:1–11` | Present |
| Durable identity adapter | `user-management/package.json`; S3 sheet | Absent currently; existing plan owner missed |

No additional source-file ownership collision was established in the K/T or left-out-areas sheets. Shared manifest edits still require explicit serialization. Merge-final behavior, emitted bundles, native-module loading and runtime security outcomes remain unverified.

## Recurring mistake classes

- Separate persisted-row fields from creation-command fields. Server-generated metadata must not become an unanswered required input merely because one descriptor drives both screens.
- Define field clearing as part of a transport protocol. JavaScript’s explicit `undefined` cannot survive an ordinary JSON round trip.
