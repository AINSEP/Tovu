# Amendments B — answers to `CROSSCHECK-B-2026-11-16.md` (2026-11-16)

Docs only. No source file and no design branch was edited; each amendment below says which design
changes, where, and how. The design owner applies it on that design's own branch.

Checked against: Tovu `refactor/terra` `80b00f5b`, Jini `refactor/terra` `02edbb68`.
Designs read: lost-updates `613db51d`, AG-UI `3ee6c75e`, error-system `40258f7b`, security review
`0a193e25`, ACP `03969e1a`, publish-engine `6ec1e62d` (**pre-revision**, see §7), daemon untangle
`32cd78ed` (R7, R8, index).

Result: 6 partial items — 6 accepted, 0 rebutted. 7 conflicts — 7 resolved (two with a narrower fix
than the cross-check proposed: X2 and X7). Four code facts the cross-check did not have are marked
**New fact**.

Lesson numbers refer to `LESSONS-FOR-DESIGN-BRIEFS.md`. "Practice" numbers are the owner list in
§8.

---

## 1. Lost updates (`designs/lost-updates/DESIGN.md`)

### LU-1 — §4.7 and S13: an observation for every baseline-writing path (accepted)

**Verified in code** (`apps/website/src/features/publish-content/apply-loop.ts`). The only baseline
read at apply time is `:426`, inside `checkAgreement`, reached only at `:416-417` for an `applied`
row with content. Five paths write a baseline through `refreshBaseline` (`:911-923`):

| # | Path | Where the write is called | Baseline read today |
|---|---|---|---|
| 1 | `created` | `applyOrdinaryRow` `:474` | none |
| 2 | `applied` | `applyOrdinaryRow` `:474` | `:426` |
| 3 | `forced` | `applyOrdinaryRow` `:474` | none (skipped on purpose, comment `:422`) |
| 4 | `created` that retires a holder | `applyRetiringRow` `:383` | none |
| 5 | `unchanged` | `refreshNonWritingRow` `:958` | none |

`conflict` and `blocked` rows write no baseline and need nothing.

**Change §4.7 "Publish baseline" to:**

1. The observation is a value with two cases and no third. "Not read" cannot be written down
   (lessons 7, 20):

   ```ts
   export type BaselineObservation =
     | { readonly kind: 'absent' }
     | { readonly kind: 'present'; readonly hashAtLastSync: string; readonly hashVersion: number; readonly runId: string };
   // port: advance(required: { record: PublishContentBaselineRecord; observed: BaselineObservation },
   //               optional: AdvanceBaselineOptions = {}): Promise<{ applied: boolean }>
   ```

   `observed` is required. The design's "`observed` … (or `null`)" is withdrawn: `null` could mean
   either "no row" or "nobody looked".
2. One function, `observeBaseline({ row, ctx })`, does the read. It is called once per row, at a
   fixed point, always **before the first destination write**: for paths 1–3 after
   `handler.inspect` and the existence check (`:387`), before `handler.apply`; for path 4 (which
   returns at `:291`, before that check) after `validateRetire` passes, before `handler.retire`; for
   path 5 at the top of `refreshNonWritingRow`. `checkAgreement` takes that observation as an argument and stops calling
   `findOne` itself, so path 2 still makes one read.
3. SQL: `absent` → `INSERT … ON CONFLICT DO NOTHING`; `present` → the design's
   `UPDATE … WHERE hash_at_last_sync = :hash AND run_id = :runId`. Both report whether they applied.
4. Miss rule: unchanged from the design (inspect the destination once; advance against a fresh read
   only if the destination holds the hash this run meant to record; else leave the newer baseline and
   add the report line). It now applies to all five paths. For path 5 the run wrote no content, so a
   miss with the same hash already recorded ends there.
5. An `unchanged` row still writes `runId` and `syncedAt` as it does today. No no-op rule is added
   here (practice 10; lesson 17 does not apply because today's write is the intended bookkeeping).

**Correct §8 row 12.** "Success path: no extra read anywhere" is not true for S13: paths 1, 3, 4 and 5
gain one indexed `findOne` per row. Path 2 is unchanged.

**Change S13's row in §6:** files become the port, the Tovu SQL adapter
(`platform/db/repos/publish-content-baseline-repo.ts`), the in-memory repo (`baseline-repo.ts`),
`refreshBaseline`, `refreshNonWritingRow`, `checkAgreement` and the three row functions. Tests, red
first: the delayed-write test once per path (five cases); "A observes absent, B inserts, A's insert
does not overwrite"; a `created` row over a stale baseline row applies in one attempt with no report
line. Mutations that must turn them red: `advance` made unconditional; `observeBaseline` returning
`{ kind: 'absent' }` without reading. Estimate: 0.5 → 1 day. Ordering: see X5.

### LU-2 — §5 T-effect(a): split the plugin race test (accepted)

**Verified:** §4.6 queues steps 2–4 per plugin inside one runtime, so in T-effect(a) the disable
cannot complete while enable's hook is held. As written the test deadlocks or tests nothing.
No per-plugin queue exists today in `packages/plugins/src/host/node/runtime-core.ts` (the design says
so; confirmed by search).

**Replace T-effect(a) with two tests:**

- **(a1) One runtime: serialization.** Hold enable's hook. Submit disable to the same runtime. Assert
  the repo fake has recorded **no** disable write while the hook is held. Release the hook. Assert
  effect order `[load, unload]` and the final row is the disable's. Second case: the held hook fails;
  assert the undo applied on `created`, then the disable ran against the restored row. Mutation:
  remove the queue → the first assertion fails.
- **(a2) Two runtimes, one store: compensation fencing.** Build two runtimes, each with its own
  queue, over one activation repo fake. Hold runtime A's enable hook; runtime B's disable completes;
  A's hook fails. Assert A's undo misses, the row is still B's, and the error says the newer state was
  kept. Mutation: undo written without `expectedRevision` → fails. This is also the test that covers
  the two gateway rollbacks (`tools/management.ts:463`, Tovu `routes/plugins/set-enabled.ts`), which
  run outside the queue and are protected by the compare only; §4.6 step 5 should say that in one
  sentence.

(b) and (c) stay. S9c's test count becomes T-effect ×4.

### LU-3 — §4.4 and S1: an additive contract transition (accepted)

**Verified:** `ExternalMcpServerRepoPort.upsert` (`core/src/contracts/hosted-mcp/record.ts:124`) has
seven production callers in four Jini packages (`store.ts:1654`, `sign-in.ts:419, :621, :752`,
`federate-mcp.ts:520`, `apply-tool-renames.ts:125`) and two implementations: Jini `store.memory.ts:86`
and Tovu `class SqlExternalMcpServerRepo implements ExternalMcpServerRepoPort`
(`features/external-mcp/external-mcp-repo.ts:132, :163`). Test fakes of the port exist in both repos and were not
counted one by one; S1b and S1b-T find them with the compiler.

**New fact:** the SQL adapter's path in §6 S1 and in `SITES.tsv` is
`external-mcp-repo.ts:185`; the file is `apps/website/src/features/external-mcp/external-mcp-repo.ts`,
not under `platform/db/repos/`. Fix the path where it is written out.

**Replace "Contract and memory repo first, then one commit per writer group" with this order.**
Every commit compiles in its own repo. `upsert` exists until the last one (COMMON rules 14 and 19:
additive in Jini, no deprecation marker, no forwarder).

| Commit | Repo | Change | Why it is green alone |
|---|---|---|---|
| S1a | Tovu | Migration: the external-MCP table gains `version INTEGER NOT NULL DEFAULT 1`. `upsert`'s update branch sets `version = version + 1`. `updateAccessIfCurrent` does too | SQL only; the record type is untouched |
| S1b | Jini core, mcp | `ExternalMcpServerRecord.version`; the port **gains** `insert`, `updateIfVersion`, `updateOAuthRuntime` (required members); `upsert` stays. `store.memory.ts` and every Jini test fake implement all four | Jini has one production implementation |
| S1b-T | Tovu | `SqlExternalMcpServerRepo` and the Tovu test fakes implement the three methods and hydrate `version` | **Pair with S1b**: Tovu does not typecheck against S1b without it. The two land together on the integration branches, as wave B did. If Tovu's CI resolves `@jini-ai/core` from the registry (`^0.7.0` in `package.json`) and not from the sibling checkout, a Jini publish sits between them; the coordinator confirms which before dispatch (lesson 11) |
| S1c | Jini integrations | Runtime writers first: `persistTokens` and `setOAuthStatus` → `updateOAuthRuntime` | new method already everywhere |
| S1d | Jini mcp | `saveExternalMcpServer` → `insert` / `updateIfVersion` | same |
| S1e | Jini integrations, agent-plugins | Sign-in configuration, plugin adoption, tool renames → `updateIfVersion` | same |
| S1f | Tovu | Route `expectedVersion` + 409, GET `version`, tool, form binding; vault recovery bumps `version` | callers of existing service functions |
| S1g | Jini, then Tovu | Remove `upsert` from the port, both implementations and all fakes | a search for `\.upsert\(` on this port returns nothing first; the count goes in the commit message |

Two rules for the window between S1a and S1g:

- A legacy `upsert` still overwrites the row, but it now advances `version`, so a caller already on
  `updateIfVersion` sees it as a conflict and never as silence (lesson 16).
- S1c is before S1f on purpose. Until the hourly token refresh has left `upsert`, it advances
  `version`; the form must not send a basis before that or it would get conflicts for changes nobody
  can see.

Estimate: S1 3 → 3.5 days (two extra commits, one pairing).

### LU-4 — §8 row 3, D11 and §7: size is an acceptance criterion (accepted)

The cross-check is right: a recommendation is not an approval, and the estimate leaves the cost out
(lesson 15). I cannot approve an exception for the owner, so the design changes like this:

1. **Functions: no exception is asked for any more.** The four touched functions over 50 lines are
   split in a first, behaviour-free commit of the step that edits them (COMMON rule 11: split, never
   exempt), each with a characterization test that fails if the extracted part changes:
   `saveExternalMcpServer` 72 (S1), `updatePost` 69 (S6), `resetUserPassword` 64 (S3),
   `updateFormDefinition` 64 (S0, already planned). D11's "named exceptions" sentence is deleted.
   Cost added to §7: about 1.5 days.
2. **Files: D11 becomes a decision that blocks dispatch**, not a default. Until the owner answers,
   the steps that touch a file over 500 lines are not dispatched: S1 (`hosted/store.ts` 1,671,
   `sign-in.ts` 1,047, `external-mcp/tool-registrations.ts` 776), S3 (`identity/repo.ts` 710,
   `admin-crud-service.ts` 701), S5 (`redirects.ts` 845), S6 (`post.ts` 2,596,
   `taxonomy/write-service.ts` 1,120), S9c (`runtime-core.ts` 871, `management.ts` 757), S9d
   (`media-repo.ts` 719). S0b, S2, S4, S7, S7b, S8, S12 can go once their own files are checked the
   same way. The design must finish that list: §8 names 12 of its 19 files.
3. **`apply-loop.ts` (996) needs no exception.** The publish-engine design splits it in its own
   Phase 0 (P0.6, P0.8), and S13 now runs after that split (X5).
4. **§7 carries two totals:** with the no-growth rule approved (about 25 days: 22.5 + 1.5 function
   splits + 0.5 S13 + 0.5 S1), and with prerequisite file splits. The second number is **not known**:
   none of the remaining files has a size design, and this design must not invent one. The size lane
   supplies it before D11 is put to the owner.

---

## 2. AG-UI (`designs/ag-ui/DESIGN.md`)

### AGUI-1 — §7.5, §7.4 rule 3, §6.1: park before the executable handoff (accepted)

**Verified in the design text:** §7.5 line 1 emits the triplet and then tries to park; the "could not
park" row then refuses the tool. §6.1 itself says a client may run a declared tool the moment it
processes `TOOL_CALL_END`. So at capacity a stock client can perform an action the server has
refused. FT-1/FT-2 cover authorization only.

**Changes:**

1. **§7.5 first sentence becomes:** "On a `pause` event the stream closes open messages and calls
   `pauses.park` for the whole pause set. Only when it succeeds does the stream emit the handoff
   triplet for each frontend-tool pause."
2. **§7.4 rule 3 order becomes:** (a) `pauses.park` succeeds → (a2) the triplets are queued →
   (b) the route removes its `request.signal` listener → (c) the deadline is armed →
   (d) `RUN_FINISHED(interrupt)`. A disconnect between (a) and (b) is still "while producing": cancel
   and remove the record (the existing row of the disconnect table; no new case).
3. **"Could not park" row:** "no interrupt **and no `TOOL_CALL_*` event** is sent". The admin display
   record (`ACTIVITY_SNAPSHOT`, §6.1) shows the refusal text, as it does for a denied call.
4. **FT-1** gains: "…and only after `pauses.park` accepted the pause that `deliver` created."
   **FT-2** becomes: "A call that the gate refuses, denies or times out before delivery, **or that
   cannot be parked**, has no `TOOL_CALL_*` event." §4's row "frontend tool, refused / denied / timed
   out before delivery" gains "/ no capacity".
5. **Tests (S4 for the admin canary, S5 for the site), each able to fail:** a client fake that
   executes on `TOOL_CALL_END`, with the global count at its limit, then with each quota key at its
   limit: zero executions, zero `TOOL_CALL_*` events for a claimed name on the wire, the tool result
   is the capacity refusal, the run finishes in the same response. Mutation: emit before park → the
   first two assertions fail. §6.6's "Safe" line names this test beside the denying-policy one.

The refusal's words follow the error rule (plain words, no generic text); the site wording stays a
Tovu value passed in.

### X3 (AG-UI half) — §7.6, §3.2, §8 row S9: admin disclosure

See §6 X3. Summary of the change to this design: the admin binding described in §7.6 ("plain words +
the redacted detail + request id") is deleted. It is neither today's behaviour nor the error-system
contract.

### X4 (AG-UI half) — §4, §4.1, S1 B4: one field map

See §6 X4.

---

## 3. Error system (`designs/error-system/DESIGN.md`)

Fixes hold; the changes here come from conflicts X1, X2, X3, X4 and X7 (§6). In short: E5 keeps every
existing conflict code; E2's `record` gains one option and one formatting rule; E4 gains a fourth
existing path; E8 moves to post-AG-UI-S1 paths and carries the agreed field map; E5a's prerequisites
and caller map change.

---

## 4. Security review (`security/REVIEW.md`, sheet `split-a06-visitor-tool-engine.md`)

Fixes hold; the one change comes from conflict X2 (§6): B1-F13's fix is replaced. I could not read the
A06 sheet itself (it is not on any fetched branch); the amendment is written against the review's
quotes of it and against today's code.

---

## 5. ACP (`research/acp/DESIGN.md`)

### ACP-1 — §3.10, A9, O-12: contain descendants for the whole run (accepted)

**Verified in code:** the launcher starts the adapter through an injected `deps.spawn`
(`packages/daemon/src/agent-executor/launch.ts:881`) with no group option; nothing under
`agent-executor/` asks for one. Tree stop is a parent-id walk over a process snapshot
(`packages/platform/src/process.ts:301-344`). On POSIX a child whose parent has exited is re-parented,
so that walk cannot find it. A snapshot taken at session start cannot contain an engine started on
the first prompt.

**Change §3.10's table row "adapter crashed" and the paragraph under it:**

1. **Containment is created at spawn, before the adapter runs any code.** The spawn port returns a
   handle beside the child:

   ```ts
   export interface ProcessContainment {
     stop(required: { signal: 'SIGTERM' | 'SIGKILL' }, optional?: StopContainmentOptions): Promise<void>;
     isEmpty(required: Record<string, never>, optional?: IsEmptyOptions): Promise<boolean>;
   }
   ```

   POSIX: the adapter is started as the leader of its own process group; `stop` signals the group;
   `isEmpty` asks whether the group still has a member. Windows: there is no re-parenting, so the
   parent-id walk from the recorded adapter pid still works after the adapter dies; `stop` and
   `isEmpty` use it, comparing process start time so a reused pid is never signalled. The
   implementation lives in `@jini-ai/platform` and reaches the daemon through R8's process port
   (practice 1; the daemon imports only itself, core and protocol).
2. **Second layer for a descendant that leaves the group:** the launcher adds a parent-id snapshot to
   a per-run set at session start, after each prompt turn ends, and immediately before a planned
   stop. Every end (clean, protocol failure, cancel, crash) stops the group **and** that set, waits
   (bounded), then removes staged files. The "not removed, `onCleanupFailure` with the pids" rule is
   unchanged.
3. **Stated limit:** a descendant that both leaves the group and starts after the last snapshot can
   outlive a crash. No portable mechanism closes that without a native dependency (COMMON rule 9).
4. **O-12 is no longer optional.** It becomes "required for any def with an `engine`; decided with
   R8's process port (R8a step 5)". What the owner still decides is in §9, B3.
5. **A9's test becomes:** a fixture adapter that completes `initialize`, starts a descendant on its
   first prompt, then exits abnormally before teardown. Assert the descendant is stopped within the
   bound and the staged directory exists until it is gone. Second case: the descendant ignores
   SIGTERM → SIGKILL after the bound, then removal. Mutation: replace containment with the
   session-start snapshot → the first case fails. The token-masking assertion stays.
6. **Behaviour change to name in A9's commit (practice 10):** the adapter is no longer in the daemon's
   foreground process group, so a terminal interrupt reaches it only through the daemon's own
   shutdown path. Whether that path stops running agents today was **not verified**; A9 pins it with
   a test before changing the spawn option.

A9 now needs R8a step 5 (process ports), not only A2. See X6.

---

## 6. Cross-design conflicts

### X1 — lost-updates §4.9 ↔ error-system §3.1 / E5: version-conflict codes

**Verified in code.** All three codes are live:
`CONCURRENT_EDIT` (`routes/pages/update-html.ts:75`, `routes/email-templates/routes.ts:61`),
`EMAIL_TEMPLATES_VERSION_CONFLICT` (`features/email-templates/tool-registrations.ts:81`),
`WIDGETS_VERSION_CONFLICT` (`admin-http/http/widgets.ts:111`, `features/widgets/tool-registrations.ts:163`,
Jini `admin/src/widgets/rules.ts:56`, `cms/src/widgets/errors.ts:40`).

**New fact:** email templates use **two** codes today: `CONCURRENT_EDIT` on the HTTP route and
`EMAIL_TEMPLATES_VERSION_CONFLICT` to the model. Lost-updates §4.9's table has one "wire code"
column and lists only the second.

**Error-system changes (this design moves):**

- §3.1 last paragraph, "each domain binds its own conflict class to it [core `VERSION_CONFLICT`]",
  becomes: "each domain's binding keeps the code its registration uses today. Core's set defines
  `VERSION_CONFLICT`, `VERSION_REQUIRED` and, as a legacy generic code with the same sentence,
  `CONCURRENT_EDIT` (two domains use it, so no feature set may define it). The email-templates set
  defines `EMAIL_TEMPLATES_VERSION_CONFLICT`; the cms widgets set defines `WIDGETS_VERSION_CONFLICT`."
- E5's "version conflicts" item becomes "adopt in place: same class, same code, same model-facing
  string per scope". Its snapshot test already compares strings; add one row per code above for HTTP
  status and `code`. The §3.1 contract case "`PostVersionConflictError` … the version-conflict code"
  stays (posts use `VERSION_CONFLICT`).
- E5 "Needs" gains: lost-updates S0b (`versionConflictGuidance` in core) and the domain's own guard
  step, so the binding's guidance text has one owner.

**Lost-updates changes:** §4.9's table gets two columns, "HTTP code" and "model-facing code"
(email templates: `CONCURRENT_EDIT` / `EMAIL_TEMPLATES_VERSION_CONFLICT`). S11 gains the
prerequisite "error-system E5 landed" and renames a code by changing the binding and the sentence set
together, keeping the old code accepted for one release (D5 unchanged).

Order: lost-updates guards → E5 → S11 (optional, separately approved).

### X2 — security A06 `createPublicErrorReporter` ↔ error-system `createErrorReporter`

**Decision: one incident lifecycle, `createErrorReporter` in `@jini-ai/core/errors` (E2).** This is
the owner's "one shared mechanism in Jini". `createPublicErrorReporter` is not built.

**Verified in code:** today's owner is Tovu `assistant/site/public-errors.ts`. It mints an ID for
every reply (`:70`), writes one operator entry for every reply (`:71`), and returns
`"<words> (error <ID>)"` (`:73`), the same string shape §3.2 gives the core reporter.
`siteAssistantIncident` (`:38`) keeps the five visitor-caused codes away from the tracker. The
words and the code set are Tovu product values.

**Narrower than the cross-check proposed** ("change both contracts … thin adapter"): no adapter is
added to Jini at all.

*Security review, B1-F13 fix replaced.* The sheet's S2 step 2 becomes: the Jini visitor engine
declares the reply as a **required port in its first argument** and builds nothing:

```ts
export type VisitorErrorReplyPort =
  (required: { code: string; diagnostic: unknown }, optional?: { exactSecrets?: readonly string[] })
    => { readonly message: string; readonly code: string; readonly errorId: string };
```

The three tables (`messages`, `defaultMessage`, `visitorCausedCodes`) stay in Tovu, so COMMON rules 2
and 10 are both met and F13's own concern (a required value in an optional argument) cannot arise.
F13's type test becomes "the engine cannot be built without the reply port". A06 therefore does not
wait for the error system: Tovu passes today's `createSiteAssistantErrorReporter` unchanged. This
also removes an import the sheet would have needed from the visitor package into `diagnostics`
(practice: a Jini package imports only itself, core and protocol).

*Error system, E4 gains a fourth existing path.* `createSiteAssistantErrorReporter` becomes a caller
of the reporter, after characterization tests of today's replies (clock and IDs pinned): a
visitor-caused code; another code; a non-`Error` diagnostic; an exact secret echoed by a provider.

- Other codes: `reporter.describe({ error: diagnostic, step, scope: 'site-assistant', fallback: { message: <table words>, action } }, { audience: 'anonymous', exactSecrets })`.
- Visitor-caused codes: `reporter.record(…, { level: 'warning', tracker: 'skip', exactSecrets })`,
  then the same words with the returned ID. The reply and the operator entry are as today.

*Error system, E2 gains two things.*

- `record`'s options gain `tracker?: 'report' | 'skip'` (default `'report'`). `'skip'` is for a
  failure the caller caused and was told about. Without it, moving to one lifecycle would send every
  rate-limit refusal from an anonymous surface to the tracker. Class: unbounded third-party reporting
  driven by unauthenticated requests. A `scripts/guard.ts` allowlist names the files that may pass
  `'skip'` (one), the same device as `approveCause`.
- The reporter's text for a non-`Error` value must not run getters, `toJSON` or a custom inspector on
  it (today: `inspect(…, { customInspect: false, getters: false })`, `public-errors.ts:52`). Core
  cannot import `node:util`, so E2 states the rule and tests it with a value whose getter throws and
  whose `toJSON` records a call.

Named changes for operators (practice 10): the ID format (D2, already listed) and the record's shape.
One open point is in §9, B2.

Order: A03 fixes → A06 (port only) → E2 → E3 → E4 (includes this path) → AG-UI S5.

### X3 — AG-UI §7.6 ↔ error-system §3.3: admin diagnostic disclosure

**Verified in code:** the admin route sends the raw `error.message` after commit
(`modules/assistant-ag-ui.ts:560`) and a fixed string elsewhere (`:380`, `:661`). Before commit it
answers the flat Tovu shape with no ID (`:532`, `:574`).

**AG-UI changes (this design moves):**

- §3.2: the host port becomes
  `describeFailure: (required: { error: unknown; phase: AgUiRunPhase; requestId: string }) => RunErrorPayload`,
  using the existing `RunErrorPayload { message; error?: ApiError }` from `@jini-ai/protocol`
  (`protocol/src/errors.ts:64`). No new shape. `RUN_ERROR.code` is `payload.error?.code`.
- §7.6 second bullet becomes: "each host's `describeFailure` is one call to its `ErrorReporter.describe`
  with `fallback` words and the run's audience: site `anonymous`; admin `authorized` only after the
  run route's own permission check passed. The admin sees plain words, the error ID and Copy details.
  A raw or redacted error message is shown only through `approveCause` by the operation's owner."
  The phrase "both behaviours are kept" is deleted for the admin and listed as a behaviour change.
- §7.6 first bullet: the pre-commit answer is the Jini route envelope (`{ error: ApiError }` +
  `requestId`) once S2 makes this a `ServerRoute`; today's flat shape is a listed change of S2 with a
  both-directions reader test (lesson 24).
- §8 row S9 test adds the error-system canaries: a thrown message holding private draft text reaches
  no admin-visible field.
- Sequencing rule, so neither design waits: if S2 lands before E8, S2's admin binding reproduces
  today's bytes (it is a move) and E8 changes it; if E8 lands first, E8 changes `:560` in place and S2
  moves the reporter call. The disclosure change happens once, in E8, as E8 already lists.

**Error system:** no contract change. E8's "Needs" gains "AG-UI S1" (X4).

### X4 — AG-UI §4 / §4.1 ↔ error-system §3.4 / E8: error and status field map

**Verified in code:** `AgentEvent` status is `{ label, detail?, code?, data? }`
(`chat/src/core/events.ts:42-48`). The client rebuilds a plain `Error` from `RUN_ERROR.message`
(`chat/src/core/assistant-client/ag-ui-transport.ts:79`), one of E8's six sites and a file AG-UI S1
A2 moves and A3 splits.

**New fact:** AG-UI §4.1 lists `status.label, .detail, .code` and omits `data`, which exists today
and is produced on this path (`ag-ui/entry.ts:235`).

**The agreed map (both designs quote this table):**

| Thing | Fields | Wire |
|---|---|---|
| Run failed | `message` = words, ending `(error <ID>)` for an incident; `code` = `ApiError.code`; `error` = the `ApiError` (code, `requestId`, details) | `RUN_ERROR { message, code, error }`. `error` is an extra field, the mechanism §4 already uses for `TOOL_CALL_RESULT`. `rawEvent` is **not** used: it means "the upstream event" and stock clients may log it |
| Clean abort | `code: "abort"` | unchanged; pinned first by E8 |
| Status | `label`, `detail?`, `code?`, `data?`, `failure?` (`errorId`, `step`, `time`, `appVersion`, `jiniVersion`) | `CUSTOM <names.status>` value, all six fields, exact round trip |
| Saved transcript | the status event above | — |

If the pinned AG-UI encoder or the official client's validation drops the extra `error` field, the ID
still arrives in `message`, and the rest travels in a `CUSTOM` event just before `RUN_ERROR` (the
fallback error-system §3.4 already describes). The first test of the joint step decides which.

**AG-UI changes:** §4's "run failed" row and §4.1 gain the rows above (`status.data` in B4;
`status.failure` and `RUN_ERROR.error` marked "added by error-system E8"). T0-3's populated golden
includes `data`.

**Error-system changes:** §3.4 "How AG-UI carries the `ApiError`" is rewritten to the table above.
E8 "Needs" gains AG-UI S1 (A1–A4, B1–B4, C1–C2). E8's targets are the post-S1 paths:
`chat/src/core/ag-ui/event-projection.ts` and `event-reduction.ts` (changed **together, one commit,
with the round-trip golden**), `chat/src/core/ag-ui/client/run-client.ts` (the rebuild site, inside
the `subscribeRun` part A3 creates). `chat/src/core/run-failure.ts` is new and unaffected.

Order: this table → AG-UI S1 → E8 → AG-UI S3 onward read `RunFailure`.

### X5 — lost-updates S13 ↔ publish-engine B01 / B02: baseline port and apply loop

**Verified in the pre-revision publish design:** `baseline-repo.ts` (82 lines, the port and the
in-memory repo) is in B01's `transfer/` list (§1.1, §4.1); `apply-loop.ts` is split in place by P0.6
(functions) and P0.8 (files) and moved by B02-S5. Neither design names the other.

**Order:** publish P0.1–P0.8 → **lost-updates S13 (as amended by LU-1), in Tovu, one logical change:
port, SQL adapter, in-memory repo, callers** → B01 → F1, F2 → B02 → B03. S13 before B01 because after
B01 the port is a Jini export and the change would be a two-repo contract change under COMMON
rule 14.

**Lost-updates changes:** S13's row gains "Prerequisite: publish-engine P0.6 and P0.8"; the §6 text
"S1–S5, S12, S13 can run in parallel after S0" drops S13.

**Publish-engine revision must also take (flag for the run revising
`plan/publish-engine-design-2026-11-16`):**

1. B01's prerequisites become "J0 **and lost-updates S13**". The contract it moves is
   `advance({ record, observed })` with `BaselineObservation`; no `upsert` reaches Jini. §4.3 quotes
   that signature.
2. P0.6's lifted row functions take the observation in their `{ step }` object, so S13 adds a field
   and does not reshape them again.
3. B02-S5 moves the fenced code as a pure move; the five delayed-write tests move with it.
4. The Tovu SQL adapter stays in Tovu (§4.4 "What Tovu keeps") and implements `advance`.
5. The 14 `size-debt.json` entries for `publish-content/*` (§1.6) are retired by P0.6/P0.8, before
   S13, so S13 neither inherits nor adds one (lesson 10).

### X6 — ACP Phase A ↔ R8 / C6 / size-design 10

**Verified:** `launch.ts` is 1,710 lines, `events.ts` 1,398, `contracts.ts` 736. The untangle index
orders them R8a steps 0–4 → step 5 → C6 → R8b → lane K → size-design 10. ACP's own prerequisite P
says no Phase A step runs on a file over 500 lines. A2 edits all three. So "Phase A can start now"
contradicts P.

**ACP changes:** §6 "Order" and §7 split Phase A in two.

| Group | Steps | Files | May start |
|---|---|---|---|
| **A-client** | A0, A1, A4, A5, A6 | only `packages/agent-runtime/src/agent-protocol/acp/**` and its tests | after P for those files (the `refactor/size-jini-chat-runtime` ACP commits, then splits to ≤ 500 / ≤ 50) |
| **A-daemon** | A2, A3, A7, A8, A9 | daemon `launch.ts`, `events.ts`, `contracts.ts` and what they become | after R8a step 5 → C6 → R8b → import-cycle J2 → lane K → size-design 10 and the events/session splits (J2's place is from `AMENDMENTS-A.md`, which sets the same chain) |

- The grouping follows the design's own "Needs" column: none of A0, A1, A4, A5, A6 needs A2.
- STOP condition added to §7: an A-client step that needs any edit under
  `packages/daemon/src/agent-executor/` moves to A-daemon.
- "with the same-commit rule for C6's copy" is deleted: A2 runs after C6 and imports C6's type.
- A9 additionally needs the containment handle on R8's process port (ACP-1).
- **Not verified:** whether C6's type repoints touch `agent-protocol/acp/session*.ts`. If they do,
  the coordinator runs A-client before or after C6, not beside it.

**Untangle index:** its order line gains "→ ACP A-daemon" after size-design 10. No R7/R8 content
changes.

### X7 — error-system E5a ↔ R7: who owns route status

**Verified in code:** `statusForError` has 11 call sites: core `json-route.ts:150`; daemon
`remote-run-events.ts:84, :90`, `memory.ts:547`, `terminals.ts:301`, `frontend-sessions.ts:295`,
`tool-execution-routes.ts:89`; http-kit `adapter.ts:65, :108, :130`, `origin.ts:16`. R7 converts the
daemon groups to core `jsonRoute` and its step Z deletes http-kit's Express pieces only once cms (R9)
has converted too.

**New fact:** the core site is a module-level `errorAnswer` (`json-route.ts:149-150`) that receives
no host context. E5a has to pass the host into it as an argument; it is not a one-line swap.

**Narrower than "choose the post-R7 owners":** the owner is chosen by where routes are mounted, so
E5a splits.

- **E5a-1 (Jini core).** Needs: wave B, C-ORIGIN-PORT (it edits the same `RouteHostContext`).
  `RouteHostContext.statusFor?`; `routeStatus({ error }, { host })`; `errorAnswer({ error }, { host })`.
  This is the final owner for every route mounted through core `jsonRoute`, which after R7 is every
  daemon route. `daemonRouteHost({ context })` already forwards `context` whole (R7's `route-host.ts` sketch), so no daemon
  port changes. Test: a daemon route group under a fake host with `statusFor` answers the feature's
  status.
- **E5a-2 (daemon leftovers).** Needs: R7 G1–G3. The caller map is **recomputed by search on the
  post-R7 tree** (`statusForError(` in `packages/daemon/src`), not copied from today's six sites. A
  site R7 leaves hand-built takes `routeStatus` with the group's host.
- **E5a-3 (http-kit, only while it has consumers).** `adapter.ts` ×3 and `origin.ts` ×1 take
  `routeStatus` **only if R9 has not converted cms when E5 starts**. Form delivery is E5's first
  adopter and is a cms route, so without this its codes would answer 500. When R9 converts cms, those
  routes arrive at E5a-1's owner and R7-Z deletes the four sites; nothing is carried by hand.
- Tovu half: `statusFor: catalog.statusFor` is added where the daemon scope builds the route context
  (`agent-daemon-scope.ts`, the block R7 cites at `:1434`), after R7 in that file's order.

E5's "Needs" changes from "E2, E5a" to "E2, E5a-1, and E5a-3 or R9".

---

## 7. Designs under revision by other runs

- **Publish engine** (`plan/publish-engine-design-2026-11-16`, read at `6ec1e62d`): take X5 items
  1–5. If its revision renames P0.6, P0.8 or B01, LU-1 and X5 follow the new names.
- **Env schema**: its branch was not in this run's fetch list and I did not read it. Three amendments
  touch configuration it may own: the SQL migration number in LU-3 S1a; `AgUiRunLimits` values in
  AGUI-1; and the lookup of `@jini-ai/core` (registry or sibling checkout) in LU-3. If the env-schema
  revision defines when validation applies or which override wins (lesson 26), these three use it and
  add no env name of their own. None of the amendments above introduces an environment variable.

---

## 8. Owner practices, checked against the amendments

| # | Practice | Result |
|---|---|---|
| 1 | DI via typed ports | `advance`, `ProcessContainment`, `VisitorErrorReplyPort`, `describeFailure` are ports the host supplies. No new global |
| 2 | Args `(required, optional = {})` | Every new signature above follows it; options types are named. `observed` and the reply port are in the required argument on purpose |
| 3 | Functions ≤ 50, files ≤ 500, complexity ≤ 10 | LU-4 removes the function exceptions and makes the file question blocking. X5 puts S13 after the publish splits. X6 keeps ACP off the three over-limit daemon files. `observeBaseline` is a new small function, not growth in `applyOneRow` |
| 4 | Feature slicing | Each change stays in its feature folder |
| 5 | No barrels, shells, forwarders | LU-3 keeps `upsert` as a real method until S1g, with no deprecation shim. X2 removes a planned second reporter |
| 6 | Generic → Jini | Containment in `platform`, reporter in `core`. Visitor words and code set stay in Tovu (product values, COMMON rule 2) |
| 7 | A Jini package imports only itself + core + protocol | X2 removes a visitor-package → `diagnostics` import the sheet implied. X3 uses a `protocol` type. ACP-1 reaches `platform` through the host |
| 8 | Tests use fakes of interfaces | All new tests name a port fake or an existing fixture (`ACP_FIXTURE`, the activation repo fake, the client fake). Each lists a mutation |
| 9 | Errors never swallowed or generic | Capacity refusal has words (AGUI-1). Baseline miss adds a report line (LU-1). Cleanup failure still reports pids (ACP-1). `tracker: 'skip'` still writes the host record (X2) |
| 10 | No silent behaviour change | Named: extra baseline read on four paths (LU-1); legacy `upsert` advances `version` during S1 (LU-3); no `TOOL_CALL_*` at capacity (AGUI-1); adapter leaves the daemon's foreground group (ACP-1); admin run errors stop carrying raw text (X3); pre-commit envelope of the AG-UI route (X3); operator record shape for visitor errors (X2) |
| 11 | Smallest change | X2 and X7 are narrower than proposed. No new column for baselines. One protocol type reused. One option added to `record` |

## 9. Owner decisions these amendments raise

| # | Decision | Recommendation |
|---|---|---|
| B1 | Lost-updates D11: may a step edit a file that is already over 500 lines if it does not grow it? Blocks S1, S3, S5, S6, S9c, S9d | Decide after the size lane prices the splits. Function exceptions are withdrawn either way |
| B2 | Visitor errors under the one reporter: the host record keeps 30 stack lines (error-system §3.3); today the whole diagnostic is logged | Accept 30 lines; if not, make the cap a reporter option |
| B3 | ACP O-12: start adapters in their own process group (required by ACP-1), and accept the stated limit for a descendant that leaves the group | Yes |
| B4 | Admin assistant run errors: words + ID + Copy details; raw text only by `approveCause` | Yes; it is the error rule already decided |
| B5 | Keep `CONCURRENT_EDIT` as a core legacy code until S11 | Yes |
| B6 | ACP Phase A is split; the daemon half waits for size-design 10 | Yes |

## 10. Not verified

- The A06 sheet text (not on a fetched branch).
- Whether Tovu's CI resolves `@jini-ai/*` from the registry or the sibling checkout (LU-3).
- Whether the pinned AG-UI encoder and client keep an extra field on `RUN_ERROR` (X4; first test).
- Whether the daemon's shutdown path stops running agents today (ACP-1 item 6).
- Whether C6 repoints types inside `agent-protocol/acp/` (X6).
- The seven over-limit files §8 of the lost-updates design counts but does not name (LU-4).
- Nothing was run: no tests, no typecheck, no build. All checks were by reading and search.
