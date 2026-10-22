Programmer(Execution): loaded the canonical Programmer persona for the backend review fixes and regression coverage.

# Visitor tools T2 — non-UI handoff

Implemented in this checkout, uncommitted. No tests, installs, builds, type checks, servers, background processes or subagents were run. Read-only ESLint parsing and complexity checks (cyclomatic and cognitive ceilings of 10) passed for the review-touched production files. `git diff --check` passed. The initial untracked `AI-Dev-Shop` entry was left untouched. UI files were not edited.

Tests are written for the new paths and changed policy/CAS behavior, including adversarial cases. **100% statement/branch/function/line coverage per touched production file is not measured or certified.** Review-touched production functions pass ESLint complexity ≤10; Central TestRunner must run coverage/type checking and any remaining complexity validation, including the existing large composition files; this handoff makes no blanket coverage claim for them. No coverage suppressions, exclusions or threshold changes were introduced.

## Opus review follow-up (2026-10-22)

Input: `/Users/la/Programming/Tovu/ADS-memory/reports/2026-10-22-visitor-t2-review.md` and the explicit review-fix dispatch. This dispatch authorizes edits and test definitions, prohibits runtime tests/installs/builds and commits, and keeps UI implementation out of scope. Existing two-object functions, injected ports, settings ledger and Jini approval handler remain the implementation pattern; no new platform module or boundary change was needed.

| Finding | Disposition | Changed behavior / evidence to run |
| --- | --- | --- |
| F1 | Fixed in source; runtime verification pending | Revision-only CAS no longer parses storage. Corrupt/future/oversized policy lists successfully with `policyState:"invalid"`, real row seq and every catalog tool Off. Only `{toolId:"site", mode:"off"}` without limits repairs it, without a card. The normal ledger records actor and complete reset policy; no partially parsed entries survive. Overflow of a valid merged policy first reclaims missing-source Off entries; remaining overflow names unavailable entries to turn Off. Tests cover HTTP 200, chat recovery without an emitter, rejected alternatives, an empty-catalog reset, stale corrupt-row CAS and ledger atomicity. |
| F2 | UI implementation deferred; mandatory handoff recorded below | Click-only segmented modes, explicit Save for limits, no mode select, no tab handles in `DIRECT_PAGE_HANDLES`; fill-without-click must issue no PUT. |
| F3 | Fixed in source; runtime verification pending | Mode approval checks only increasing rank (`off < ask < auto`); Auto → Ask is direct. Above-default quota increases remain independently gated. Matrix includes plugin/created Off → Ask, Ask → Auto and Auto → Ask. Tool description agrees. |
| F4 | Fixed in source; runtime verification pending | Boot registration adds `visitor-tools.manage` to Jini's permission catalog as well as existing owner/admin grants. Tests assert `isKnownPermission` and catalog owner. |
| F5 | Fixed in source; runtime verification pending | Card rows show mode before → after, changed per-visitor/site limits, endpoint, credential id and joined returned fields. No JSON or source revision in visible rows; full catalog comparison still binds source revision. Disclosure assertions updated. |
| F6 | Fixed in source; runtime verification pending | Concurrent `Promise.allSettled` applies assert one success, one typed revision conflict and exactly one ledger entry. The existing temporary CAS adapter maps only the memory adapter's precise overlapping-transaction refusal to that conflict. A real memory-composed HTTP-module race asserts 200/409 with reload, never 500. Other storage errors propagate. Postgres two-connection race stays in J1's adapter suite. |
| F7–F9 (INFO) | Comments recorded | The J1 swap point documents value-row seq semantics, unset/cleared rows, post-lock/rollback and Postgres tests, memory conflict normalization, the current generic-500/reporting choice, and host-owned source classification. The descriptor contract also forbids plugin-assigned builtin classification. F8 adds no new reporter; unknown faults retain the sibling settings route's behavior. |

Review-fix file set (relative to repository root):

- `apps/website/src/contracts/site-assistant/visitor-tools-management.ts`
- `apps/website/src/features/settings/visitor-tools-{write,service,configure,permissions,registrations,agent-tools}.ts`
- `apps/website/src/features/settings/__tests__/visitor-tools-{write,service,configure,permissions,registrations}.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/visitor-tools.integration.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/visitor-tools-management.unit.test.ts`
- This UI handoff and `ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md`.

Central runner: run those seven test files (expanded paths from the inventory below), with `--test-concurrency=1` for node:test / `--maxWorkers=2` for the central harness, then the contract/catalog and T1/shared-CAS regression suites named below. Run website TypeScript checking and per-file coverage. No runtime pass claim is made here. Read-only ESLint syntax/complexity checks cover all seven production files edited in this follow-up; both cyclomatic and cognitive ceilings are 10. The first scratch lint configuration used an incorrect SonarJS entrypoint; reading its installed manifest and switching to `cjs/plugin.js` resolved that configuration failure.

Reuse: invalid-state recovery and bounded policy merge; searched visitor policy parsing/resolution, management and T1 executor readers; extended the existing visitor-tools service and parser, using standard library collection operations. The null snapshot is explicitly invalid and cannot use upgrade defaults. No second policy owner.

Reuse: revision conflict normalization; searched Tovu form-delivery/comments guards and Jini `settings/{repo.memory,write-service,ports}.ts`; extended the already-authorized J1 bridge only. Jini remains generic CAS/adapter-conflict owner; publication/adoption is pending and sibling sources are outside this writable checkout. Coordinator receives the exact extraction notes in SURVEY.md.

Reuse: permission catalog and card disclosure; inspected mail permission registration, Jini permission catalog and the existing Jini UI confirmation detail renderer; called `registerPermission` and supplied plain `SurfaceDetail` rows to the existing approval owner. No new approval, UI-rendering or registry lifecycle.

Documentation classification: interface contract and lifecycle comments updated. Existing MOVE why-comments retained; repair and temporary memory-conflict reasons added at their owners. The INFO swap constraints are inline. Remaining risk is unexecuted runtime/type/coverage verification and J1's separate durable race test. Suggested next assignees: UI agent for F2, central TestRunner for the listed checks, J1 owner for durable adapter coverage and bridge removal.

## Inputs and authority

- Canonical `/Users/la/Programming/Tovu/ADS-memory/reports/2026-10-22-visitor-tools-design-review.md` overrides the design: required change 1, change 11 and T2 phase row.
- Canonical `2026-10-22-visitor-tools-design.md` and `2026-10-22-visitor-t1-j1-review.md`, especially F10/F12; local `ADS-memory/reports/2026-10-22-visitor-tools-t1-handoff.md`.
- Current dispatch specifically authorizes the temporary form-delivery/comments revision adapter while J1 remains unpublished. This supersedes T1's refusal of revision-dependent writes. Jini remains the generic CAS owner.
- Repository bootstrap, canonical Programmer/TDD personas, architecture chapters 13/14 and project memory. The clone omits those three governing memory paths, so their canonical `/Users/la/Programming/Tovu/ADS-memory/` copies were read. The task dispatch supplies the bounded implementation authority; no test certification is invented.
- MCP graph tools were unavailable. Source discovery used direct reads/rg across Tovu and manifest-named Jini owners. No sibling source was changed.

## Routes and permissions

Both routes are registered by the existing assistant-settings module, within the existing admin session boundary. Service authorization is fresh on every operation and again before persistence.

| Method | Path | Permission | Body / result |
| --- | --- | --- | --- |
| GET | `/api/admin/v1/workspaces/:workspaceId/assistant/visitor-tools` | `visitor-tools.manage` | `{data: VisitorToolsView}` |
| PUT | same | `visitor-tools.manage` | `{toolId, expectedRevisionSeq, mode?, limits?}` → `{data: VisitorToolsView}` |

`toolId` is a listed id, or `site` to apply the patch atomically to all currently available visitor-eligible tools. This stores per-tool choices; it does not create a future-tool default or a new aggregate site budget. An unavailable configured tool remains visible and can be switched Off individually. Other changes to unavailable tools are refused. Unknown ids never create eligibility.

The permission catalog registers `visitor-tools.manage` with owner `visitor-tools`, so delegated/custom roles can grant it. The boot grant registry now reconciles `visitor-tools.manage` explicitly to both built-in owner and admin policies, including already-seeded sites. Editor/viewer receive no grant. Existing additive/idempotent grant machinery owns persistence; no migration or parallel seed was added.

## Four chat tools

| Name | Current behavior | Gating |
| --- | --- | --- |
| `visitor_tools_list` | Complete revisioned catalog view | Direct, permission checked |
| `visitor_tool_configure` | All page mode/limit changes, including a site-wide batch | Tiered below |
| `visitor_tool_save` | `{available:false, code:"VISITOR_TOOLS_T4_REQUIRED"}` | Permission checked; no mutation/card until T4 |
| `visitor_tool_delete` | Same T4 refusal; accepts a `toolId` | Permission checked; no deletion/card until T4 |

Configure uses the existing `approvalToolHandler` prepare/ask/run owner. No new confirmation transport or approval store exists. Inputs are detached by that owner before preparation. The service snapshots catalog contracts independently, so a mutable source cannot retarget an open card.

- No card for list, Off, lower limits, restoring a limit up to its default, or changing a reviewed built-in read/page-action tool's mode.
- A fresh, non-rememberable card for enabling an external/plugin/created tool, increasing an external tool's mode rank (Off → Ask/Auto or Ask → Auto), increasing a non-read built-in's mode rank, or increasing a limit above its default. A reduction from an already elevated limit remains direct.
- The handler passes `remembered: undefined` and provides no remember key. An unrelated saved plugin-escalation grant is ignored. A site batch uses one card containing all changes.
- Cards show plain rows for each tool's previous → next mode, changed previous → next limits, plus source-owned endpoint, credential id and joined returned fields when present. Source revision stays bound by the captured catalog and is omitted from visible rows. These fields are non-secret metadata; credentials/headers are never loaded by this service.
- Permission revocation, stale policy revisions and changed catalog contracts are checked after the click. A conflict requires a fresh list and a fresh approval for any publication change; approval is not replayed against a new revision.
- Closed schemas and runtime validation reject forged approval/identity/workspace/endpoint fields. Quotas accept positive safe integers; zero means invalid, not unlimited.

`visitor_tool_configure` is included in the existing MCP-UI redemption projection, so its parked card can be answered through the authenticated callback channel. Save/delete are accurately classified as read-only deferrals today; T4 must change their risk and approval declarations when it implements effects.

## Exact UI contract

Mandatory F2 controls (UI agent; no UI was built in this backend task):

- Use click-only `ChatSettingsSegmented` buttons for Auto / Ask first / Off. Mode has no `<select>`.
- Limits inputs update local draft state only on fill, change and blur. Persist only through an explicit **Save** button click.
- Never add any Visitor tools tab control handle to `DIRECT_PAGE_HANDLES` in `apps/website/src/contracts/headless/assistant-tool-approval-policy.ts`. `page.click` must retain its approval boundary.
- Add a UI regression: `page.fill` into a limits input, followed by change/blur but **no click**, sends **no PUT**; clicking Save sends the intended revisioned PUT. Cover segmented mode clicks through the existing page-click approval path.
- On `policyState:"invalid"`, show every tool Off, explain that saved policy is unreadable, and offer a click-only **Turn all tools Off to reset** action. Send `{toolId:"site", expectedRevisionSeq:revisionSeq, mode:"off"}` without limits. Disable other saves until that repair succeeds and clears the marker. Keep the repair button out of `DIRECT_PAGE_HANDLES` too.

GET and successful PUT wrap the same object in `{data: ...}`. Chat list/configure return the object directly:

```ts
type VisitorToolsView = {
  revisionSeq: number; // this policy's workspace row seq; 0 when no row exists
  policyState?: "invalid"; // unreadable stored policy; every catalog tool is Off
  defaults: { perIpPerHour: 30; perSitePerDay: 1000 };
  callsPerTurn: 4;
  tools: Array<{
    id: string;
    source: "builtin" | "plugin" | "created" | "unavailable";
    sourceRevision: string;
    title: string;
    description: string;
    effect: "read" | "write";
    availability: { available: boolean; reason?: string };
    publication?: {
      endpoint: string;
      credentialId: string;
      returnedFields: string[];
    };
    mode: "auto" | "ask" | "off";
    limits: { perIpPerHour: number; perSitePerDay: number };
  }>;
};
```

The runtime defaults/cap are numeric values, not TypeScript literal types in the actual exported interface. `mode` is the stored/effective policy choice, and `availability` describes the source contract. **Ask is stored and remains non-executable until T3**, exactly as in T1.

Example PUT:

```json
{"toolId":"list_categories","expectedRevisionSeq":123,"mode":"ask","limits":{"perIpPerHour":20}}
```

For valid policies, omitted mode/quota dimensions are preserved. Invalid policies accept only the exact site-wide Off repair described above. Always use the returned view's revision for the next edit. On HTTP 409, refetch and show the new state; do not silently overwrite or auto-retry publication changes.

Errors:

- 404: `{error:"workspace was not found"}` before service access for a foreign workspace.
- 403: `{error:"visitor-tools.manage is required", code:"FORBIDDEN"}`.
- 400: `{error:string, code:"VISITOR_TOOLS_VALIDATION_ERROR"}`.
- 409: `{error:string, code:"VISITOR_TOOLS_REVISION_CONFLICT", reload:true}`.
- 500: `{error:"internal error", code:"INTERNAL_ERROR"}` without storage details.
- Chat conflict: `{changed:false, code:"VISITOR_TOOLS_REVISION_CONFLICT", reload:true, note:string}`. A cancelled/expired/abandoned card uses the existing confirmation result with `changed:false`.

For chat-write refetches, reuse `GET /api/admin/v1/workspaces/:workspaceId/settings/events`: it already polls the shared ledger across HTTP/daemon processes and emits `event: settings-changed` with `data: {namespaces:[...]}`. Refetch this dedicated GET when the array contains `site.assistant`, then compare its `revisionSeq`. Do not use the SSE global cursor as the policy revision. The existing feed requires `settings.read`; it is not a new visitor-tools event.

## J1 / T4 / plugin seams

**J1:** `apps/website/src/features/settings/visitor-tools-write.ts` has an explicit **J1 SWAP POINT** at `guardVisitorToolsRevision`. `expectedRevisionSeq` flows from transport → management prepare → apply → T1 writer. The adapter checks at `saveWorkspaceValue`, after `appendRevision` takes the existing ledger transaction lock, and conflicts roll back both append and value. It compares only the value row seq, without parsing the policy; unset is 0 and cleared retains its seq. It preserves other repo methods' receivers and non-method properties, while normalizing the memory adapter's overlapping-transaction refusal to the existing typed reload conflict. This is the existing form-delivery/comments pattern, authorized by the dispatch, not an unlocked pre-read CAS.

Once Jini publishes, thread the option through host `site-title-write.set(required, optional)` into Jini `set(required, {expectedRevisionSeq})`, remove this adapter, and map Jini's conflict error to the same HTTP/chat reload contract. Leave the service's request contract and post-lock/rollback tests intact. The extraction backlog is updated at `ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md`.

**T4/later:** `VisitorToolsServiceDeps.listCatalog` is the injected visitor-only eligibility port. `VisitorToolDescriptor` and `VisitorToolsManagementPort` live at `apps/website/src/contracts/site-assistant/visitor-tools-management.ts`. Plugin/created sources can supply those descriptors and use the same list/configure service without page/chat divergence. The host adapter must assign `source` itself; plugin input must never claim `builtin`. A source must include an accurate revision and publication disclosure; apply compares the full captured catalog before saving.

The production composition currently supplies T1's seven reviewed built-ins only. No plugin declares visitor eligibility today; the approved review defers plugin parsing/digest review. Ordinary admin plugin tools are never enumerated or made public. The DI suites exercise plugin and created descriptors as future source contracts. `search_products` remains T3b in its commerce owner.

T4 must implement save/delete in this management owner, extend their closed schemas and ports, and update actual derived risk/approval metadata. Saved-request target/credential/projection/effect changes and create+enable require a single always-ask, non-rememberable card; deletion requires the existing permanent-delete confirmation. No partial definition implementation or new secret/HTTP machinery was added in T2.

## Production file inventory

All paths below are relative to `apps/website/src/`:

- `contracts/site-assistant/visitor-tools-management.ts`: shared service/catalog/read-model contracts.
- `contracts/site-assistant/visitor-tools.ts`: allow positive safe limits above defaults; widening approval belongs at management, not stored-policy parsing.
- `contracts/core/tool-metadata/visitor-tools.ts`, `contracts/core/tool-metadata/index.ts`: search/approval/callback metadata.
- `features/settings/visitor-tools-service.ts`: shared authorization, list, preparation, atomic merge, source recheck and write orchestration.
- `features/settings/visitor-tools-configure.ts`: closed parsing and pure tier decision.
- `features/settings/visitor-tools-write.ts`: T1 writer, revision snapshot and temporary locked revision adapter.
- `features/settings/visitor-tools-agent-tools.ts`, `features/settings/visitor-tools-registrations.ts`: four tool contracts and approval adapters.
- `features/settings/visitor-tools-permissions.ts`: owner/admin grants.
- `server/inbound/admin-http/routes/assistant/visitor-tools.ts`: GET/PUT transport and typed error mapping.
- `server/inbound/admin-http/routes/assistant/deps.ts`, `server/routes/types.ts`: narrow injected service field.
- `server/runtime/composition/visitor-tools-management.ts`: reviewed built-in catalog and shared composition factory.
- `server/runtime/composition/{app,deps}.ts`: memory/durable service wiring.
- `server/runtime/composition/modules/assistant-settings.ts`: route mounting.
- `server/runtime/composition/app-permission-grants.ts`: boot registration.
- `server/runtime/composition/tool-catalog-manifest.ts`, `assistant/tool-registrations.ts`: contributor installation and dependency type.

## Tests written/updated — exact paths

New runnable suites:

- `apps/website/src/features/settings/__tests__/visitor-tools-configure.unit.test.ts`: closed input, forged fields, mode/quota validation, tier matrix and property-based reductions.
- `apps/website/src/features/settings/__tests__/visitor-tools-service.unit.test.ts`: current/future source choices, unavailable/unknown tools, partial/site patches, no partial invalid batches, bounds, competing revisions, catalog changes, fresh auth and corrupt storage.
- `apps/website/src/features/settings/__tests__/visitor-tools-registrations.unit.test.ts`: all four tools, direct paths, fresh cards with saved grants present, disclosure, one site-batch card, cancel/expiry/abort/headless refusal, input mutation, conflicting page edits, source mutation, revocation, T4 deferrals and errors.
- `apps/website/src/features/settings/__tests__/visitor-tools-permissions.unit.test.ts`: real seeded in-memory identity owners, existing-install reconciliation, idempotence, owner/admin allow and editor/viewer deny.
- `apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/visitor-tools.integration.test.ts`: real registered handlers over DI services, exact views, foreign-workspace fence, authorization/input/error mapping and write conflicts. No listening server is needed.
- `apps/website/src/server/runtime/composition/__tests__/visitor-tools-management.unit.test.ts`: seven-tool production catalog, service composition and existing assistant-settings module mounting.

Updated runnable suites:

- `apps/website/src/features/settings/__tests__/visitor-tools-write.unit.test.ts`: accepted/stale CAS, rolled-back ledger/value, cleared/unset revisions, missing definition, preserved adapter metadata/receivers and post-append comparison ordering; existing generic-writer/alias/reset tests retained.
- `apps/website/src/contracts/site-assistant/__tests__/visitor-tools.unit.test.ts`: safe integer bounds and property-based approved widening round-trip; other T1 parser cases retained.
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`: include the new contributor's authoritative catalog in the existing completeness/risk/schema sweep.
- `apps/website/src/assistant/__tests__/mcp-ui-tool-calls.test.ts`: existing callback allowlist includes configure.

DI fixture (not a runnable suite): `apps/website/src/features/settings/__tests__/visitor-tools-management.fixture.ts`, reusing T1's `visitor-tools.fixture.ts`. In-memory settings/identity, injected catalogs, fake time and the real surface-exchange engine are used; no provider key/network is needed.

Central validation: run the suites above, the T1 settings-protection/visitor executor/budget suites, existing assistant catalog/approval and comments/settings regression suites, type checking, then inspect per-file coverage and complexity. No test execution or certification happened in this builder task.

## Reuse / author review

- Reuse: policy persistence/revisions; inspected T1 writer, settings chokepoint and Jini set; extended T1 through the same permissioned set transaction. The temporary post-lock adapter follows inspected form-delivery/comments ownership under explicit task authorization. Jini retains the future generic CAS owner.
- Reuse: approval lifecycle and transport; inspected settings ALWAYS_ASK pattern, human-confirm, Jini approval and MCP-UI metadata projection; used the same handler with its tier predicate and no remembered port. No parallel confirmation state machine.
- Reuse: permission reconciliation; inspected identity role grants/wiring/app registry; registered owner/admin rows on the existing explicit boot registry, rather than a second seed/migration.
- Reuse: catalog; inspected the reviewed literal capability handlers and their existing schemas. Production descriptions are projected from the six CMS schemas plus site_guide at composition, without reading the admin registry. Future eligibility is an injected port, not a plugin parser built early.
- Reuse: invalidation; inspected settings/events and its ledger-based cross-process feed; policy writes already append the watched ledger, so no new pub/sub or SSE protocol.

New logic-bearing units use required-object/optional-object boundaries. Framework callbacks retain their required framework signatures. Author review kept new decision units small, separated parsing/gating/effects, and bounded policy/catalog work to 128 entries each. Catalog work is linear without per-tool I/O; persistence uses existing settings transactions. Why-comments document the frozen upgrade grant, non-rememberable publication boundary and post-lock CAS reason. No commerce/vendor implementation or new dependency was added.

The requested review fixes and F2 handoff are implemented in this static pass; runtime/type/coverage/complexity evidence remains pending. In particular, a second Postgres connection race must still be validated centrally against the existing ledger-lock adapter behavior. UI integration and T3/T4/plugin feature delivery remain separate phases.

Next assignees: UI agent uses the exact routes/view/feed above; Coordinator/Central TestRunner verifies compile, tests, per-file coverage and complexity; Code Inspection/Security reviews the approval/CAS boundary before integration.
