# MCP tool refusal visibility — status check before implementing

**Dispatched task:** make a refused federated/external MCP tool call legible to the assistant
(and therefore the user) instead of vanishing into the daemon log, without touching any
allowlist.

## Finding: this task is already implemented and committed on this branch

Discovery (not new work) turned up `apps/website/src/assistant/mcp-federation/refusal-notice.ts`,
already wired into the daemon prompt path, with a full test suite already GREEN. Three commits,
all already on `restructure/apps-website-phased`, all dated today/yesterday:

- `0d9e41d5` feat(mcp-federation): tell the MODEL which external tools were refused, and why
- `659b98ec` fix(mcp,admin): stop reporting a callable tool as withheld; make the drift comparison
  two-directional; re-read admissions after a restart
- `ed40d6b5` refactor: keep the three functions this pass touched under the complexity ceiling of 9

Working tree is clean for every file in this area (`git status --porcelain` empty) — nothing
mid-flight, nothing uncommitted.

### What it already does
`trust.ts`'s `admitRemoteTools` returns a full accounting (`admitted` / `refused` /
`allowlistedButAbsent` / `writeAllowedButNotAllowlisted`). `refusal-notice.ts`'s
`buildFederatedRefusalPrefix` reduces that accounting into a prompt-prefix block
(`agent-daemon-server.ts:1088`, via `agent-daemon-port.ts`) that names the tool, the server, and an
operator-actionable fix, and instructs the model never to invent a different cause. It covers:
write-grant refusals (`remote-declares-not-read-only`), destructive-tool refusals, schema/name
faults, connection-cap faults, and two "drift" cases (allowlisted-but-absent typo,
write-allowed-but-not-allowlisted inert grant). It is adversarially hardened against a hostile
remote's tool name (control-char stripping, injection-payload test, truncation with an honest
count) and has a specific fix (MCP-01, 2026-09-07) for not reporting a tool that was actually
admitted under a different descriptor.

### Fresh evidence run (this session, from repo root)
```
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test \
  --experimental-test-module-mocks \
  apps/website/src/assistant/__tests__/mcp-federation.refusal-notice.test.ts
```
Result: **18/18 pass**, 0 fail.

## The gap: the dispatched "live instance" is the one case this design deliberately excludes

The dispatch's named live instance is the higgsfield connection: 11 tools advertised, 2 admitted
(`generate_image`, `reveal_generation`), 9 refused as `not-in-operator-allowlist`
(`show_characters`, `tiktok_accounts`, `tiktok_connect`, `tiktok_reconnect`,
`tiktok_music_trending`, `tiktok_music_tune`, `tiktok_prepare_publish`, `tiktok_publish`,
`tiktok_publish_status`).

`refusal-notice.ts`'s own rule R-B is explicit and tested: `not-in-operator-allowlist` is **never**
turned into a prefix item, on purpose:

> a real server advertises tens of tools and an operator allowlists three, so this reason fires for
> every tool nobody asked for. Reporting it would put a wall of "you did not enable this" in front
> of the model on every turn and train it to ignore the whole block.

Test proving this (already GREEN): `mcp-federation.refusal-notice.test.ts` — *"a tool the operator
never allowlisted produces NO prefix — that refusal is the routine default-deny, not news"*.

That is exactly the higgsfield shape (11 advertised, 2 wanted). So today, none of the 9 tiktok
refusals produce any prefix text — the shipped fix covers misconfiguration classes (write-grant
gaps, allowlist typos, inert grants, remote schema/name faults) but does **not** cover "operator
simply never turned this on," which is the specific reason behind every one of the 9 refusals named
in the dispatch.

Whether that's still a bug is a product call, not an implementation one: is "assistant doesn't
mention TikTok tools it was never granted" the correct, quiet behavior (the operator's allowlist
choice working as intended), or does the model need to know these 9 tools exist-but-are-withheld so
it can say "I don't have permission for that" instead of just not knowing TikTok exists at all? The
existing R-B reasoning argues the former; the dispatch's framing argues the latter. Reversing R-B
would also need an answer to the noise problem it was written to prevent (a real server with tens of
routine unwanted tools spamming the prompt every turn) — capping to just the connection's own
withheld set rather than a global list, naming the server without naming all 9 tools individually,
etc. are all real options, but they're a scope/policy decision, not a bug fix.

## What I did / did not do

- No code changes. No allowlist changes — none were made or needed; I did not touch
  `sites/*/config.json` or any admissions rule file.
- No daemon restart, no process kills.
- Did not touch `@jini-ai/http-kit` or any Jini source file — this task never needed to; the
  `2026-09-07-http-kit-error-diagnosability.md` report referenced in the dispatch does not exist yet
  (checked, MISSING), so there's no known overlap with C9-ERRORS to align against beyond "different
  package, different file."
- Confirmed `not-in-operator-allowlist` refusals are structurally the same root cause the shipped
  fix already addresses (federated tool never reaches `ToolRegistry`, so `@jini-ai/daemon`'s
  `createToolExecutor` — the "ToolExecutor gate" — would only ever return a generic "tool not
  found" for a direct call attempt; there's no second execution-time gate to fix separately from
  the admission-time one `trust.ts`/`refusal-notice.ts` already cover).

## Daemon restart requirement

Not applicable to my work (I made no config or code changes). For the record, since it bears on the
already-shipped mechanism: `refusal-notice.ts`'s prefix explicitly tells the model "this list is
fixed for the lifetime of this assistant process: a setting changed now takes effect only after the
assistant is restarted" — consistent with the standing note that the operator allowlist is read at
daemon start.

## Allowlist confirmation

**No allowlist entry was added, removed, or modified**, by me or as part of this report. The
higgsfield allowlist remains exactly `generate_image` + `reveal_generation`.

## Correction to the record

My dispatch presented the refusal-visibility work as unbuilt ("the refusal is written ONLY to the
agent daemon's log ... the assistant never learns it was refused"). That premise was wrong for the
BOOT-TIME half: `refusal-notice.ts` + `buildFederatedRefusalPrefix`, already on this branch before I
started, solve exactly that for every actionable misconfiguration reason. Only the CALL-TIME half
(below) was actually missing. Stating this plainly so the stale "unbuilt" premise doesn't get
repeated downstream — `mcp-federation.registrations.test.ts` and `mcp-federation/bootstrap.ts` show
as concurrently modified (uncommitted) in the shared tree as of this writing, presumably A1-MCPDRIFT
continuing adjacent work; I did not open either file's diff and did not touch them.

Also flagging per the team lead's instruction: commit `659b98ec` ("stop reporting a callable tool as
withheld; make the drift comparison two-directional; re-read admissions after a restart") was **not**
in the set of admin commits re-verified today — it is unattested. I did not chase this further; noting
it here as directed.

## Round 2: the call-time gap (team lead's follow-up)

Team lead's call: R-B stands (boot-time enumeration of a routine default-deny is correctly silent),
but an ACTUAL attempted call to a refused tool is not routine — the model naming a tool id is
evidence it wants it, so R-B's noise argument doesn't apply. Extend the surface at call time, not
prompt-assembly time, and check whether the path already exists before building.

**It did exist, and it was losing the reason exactly as suspected.** Traced the real call path used
by production Tovu runs (not BYOK — confirmed via `agent-daemon-server.ts:1174`'s comment "Backs
`@jini-ai/mcp`'s `search_tools`/`describe_tool`"): model → `@jini-ai/mcp`'s `execute_delegated_tool`
→ `POST /api/delegated-tool-calls` (`@jini-ai/http-kit`'s `packages/http-kit/src/delegated-tools.ts`)
→ `createDelegatedToolBridge` → `ToolExecutor.execute`. A refused (never-registered) federated tool
id makes `execute` throw `ToolExecutor: unknown tool "<id>"` (`packages/daemon/src/tool-executor.ts:355`,
"a routing/programming error", not a `ToolExecutionResult`). That throw is uncaught by every existing
Tovu decorator (`tool-executor-stack.ts`'s three wrappers all pass a throw through unchanged) and
lands in `delegated-tools.ts:440-441`'s catch-all, which redacts EVERY throw to a bare
`INTERNAL_ERROR` + correlation id (`reportInternalError`) and sends the real text ONLY to
`onInternalError` (default `console.error` — the daemon log). Confirmed this is the live route
(`agent-daemon-server.ts:935`, `registerDelegatedToolRoutes(app, { toolExecutor, ... })`).

Also checked C9-ERRORS's report (`ADS-memory/reports/2026-09-07-http-kit-error-diagnosability.md`,
which now exists): they shipped a generic `ClientFacingError` carve-out in `@jini-ai/http-kit`'s
`adapter.ts` (`mountJsonRoute`'s catch), explicitly noting no Tovu route uses it yet and that
`delegated-tools.ts` was NOT touched. I did not touch `delegated-tools.ts` or any other Jini file
either — used a different, already-wired escape hatch instead (below), so there is no overlap or
race with that work.

### The fix — zero Jini changes

`delegated-tools.ts` already has a live, un-redacted path: `ToolExecutionResult.status === 'failed'`
with `errorKind === 'validation'` maps to a real `400 BAD_REQUEST` carrying the handler's own message
verbatim (`toolExecutionResultToApiResult`, `delegated-tools.ts:358-362`). So instead of touching
Jini, added a Tovu-side `ToolExecutor` decorator — matching the existing sibling pattern
(`read-only-tool-constraint.ts`, `tool-executor-audit.ts`, `tool-failure-recovery.ts`) — that catches
the unknown-tool throw for a federated id THIS BOOT's admission snapshot actually refused, and
returns that legible `failed`/`validation` result instead of letting the throw escape.

New files/changes (commit `c5d10181a7c81f865f555c34cf157ae8c6ccb07e`):

- `apps/website/src/assistant/federated-refusal-diagnosis.ts` (new) — `withFederatedRefusalDiagnosis(inner, getSnapshot)`.
  Composed OUTERMOST around the existing 3-decorator stack in `agent-daemon-server.ts` (not folded
  into `tool-executor-stack.ts`, which BYOK also shares and has no federation snapshot to check) —
  every existing decorator still sees and classifies the original throw unchanged, in particular
  `tool-executor-audit.ts`'s `isUnknownToolError` still records an `unknown-tool` audit row exactly
  as before. `getSnapshot` is a closure, not a value, because the decorator is composed before
  `attachFederatedMcpTools` resolves (mirrors the pre-existing `federationRefusalPrefix` `let`
  pattern in the same file).
- `apps/website/src/assistant/mcp-federation/refusal-notice.ts` — added `explainFederatedToolRefusal`
  (the one explanation R-B withholds from the boot prefix, needed for an attempt) and
  `findFederatedToolRefusal` (resolves one attempted tool id against the snapshot by re-minting
  `federatedToolId` per refusal — never a second, independent parser of the id format).
- `apps/website/src/assistant/agent-daemon-port.ts` — exported `withFederatedRefusalDiagnosis`
  through the existing curated port (matches how `buildFederatedRefusalPrefix` is already exposed).
- `apps/website/src/server/inbound/assistant/agent-daemon-server.ts` — `toolExecutor` now wraps
  `createAssistantToolExecutor(...)` in `withFederatedRefusalDiagnosis`; `federationAdmissionReports`
  is now a module-scope `let` (mirroring `federationRefusalPrefix`'s existing pattern) reassigned
  inside `start()` instead of a local `const`, typed via `Awaited<ReturnType<typeof
  attachFederatedMcpTools>>["reports"]` (not `refusal-notice.ts`'s deliberately narrower
  `FederationAdmissionSnapshotEntry`, which structurally omits `isPreset` —
  `registerFederationAdmissionsRoute` needs the full shape; caught by a real `tsc` error, fixed, not
  guessed).

Chose `status: 'failed', errorKind: 'validation'` over `status: 'denied'` deliberately:
`toolExecutionResultToApiResult`'s `'denied'` branch maps to a FIXED string
(`'this operation was denied by policy'`) and ignores `ToolExecutionResult.error` entirely, so a
custom message placed there would never reach the wire. `'validation'` is a semantic stretch (it
normally means "the caller's input was malformed") accepted because it is the only existing carrier
for a free-text, non-redacted message — documented as a deliberate tradeoff in the new file's header,
not hidden.

### RED (before the fix)

Wrote the test file first, referencing the not-yet-existing module, then stashed the two source
changes (`git stash push -u --` on exactly those two paths — never a bare stash) to prove RED against
the actual pre-fix tree rather than a hypothetical:

```
$ TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test \
  --experimental-test-module-mocks \
  apps/website/src/assistant/__tests__/federated-refusal-diagnosis.test.ts

Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  '/Users/la/Programming/Tovu/apps/website/src/assistant/federated-refusal-diagnosis.js'
✖ apps/website/src/assistant/__tests__/federated-refusal-diagnosis.test.ts
ℹ tests 1 / pass 0 / fail 1
```

`git stash pop` restored the fix immediately after.

### GREEN (after the fix)

```
$ TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test \
  --experimental-test-module-mocks \
  apps/website/src/assistant/__tests__/federated-refusal-diagnosis.test.ts
ℹ tests 9 / pass 9 / fail 0
```

Exact-text assertion for the named incident (`not-in-operator-allowlist`, tiktok_publish on
higgsfield):

```
tool "tiktok_publish" on external server "higgsfield" was refused: the administrator has not
allowed this tool for this connection. Fix: in Settings → External MCP, add it to "Allowed
tools", then restart the assistant.
```

Also covered in the 9: a different reason (write-grant) gets its own distinct text; pass-through
for a normal completion; pass-through (unchanged throw) for a native-typo id and for a
federated-shaped id this boot never refused; pass-through for an unrelated throw ("connection
reset"); the live-snapshot-read property (composed pre-boot with an empty snapshot, still diagnoses
correctly once the closed-over binding is reassigned); `resumeConfirmation`/`cancel`/`getAuditRecord`
pass straight through.

### The existing 18 tests stayed green, plus 5 new direct unit tests for the two new pure functions

```
$ TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test \
  --experimental-test-module-mocks \
  apps/website/src/assistant/__tests__/mcp-federation.refusal-notice.test.ts
ℹ tests 23 / pass 23 / fail 0
```

All 18 original tests pass byte-for-byte unchanged, including R-B's own
"a tool the operator never allowlisted produces NO prefix — that refusal is the routine
default-deny, not news". 5 new tests added directly for `explainFederatedToolRefusal` /
`findFederatedToolRefusal` (including one asserting every non-allowlist reason's text is IDENTICAL
between the boot prefix and the call-time explainer, so the two channels can never silently
disagree about *why* a given reason fired).

### Regression evidence

- Full repo `npx tsc -p tsconfig.json --noEmit`: **0 errors** (first attempt caught a real type
  mismatch — `registerFederationAdmissionsRoute` needs the `isPreset`-carrying shape
  `refusal-notice.ts`'s narrower type omits — fixed by deriving the type from
  `attachFederatedMcpTools` itself rather than reusing the pure module's structural type).
- 5 targeted unit tests already touching `agent-daemon-server.ts`/the federation-admissions route
  (all outside the forbidden `serve-command*`/boot-the-whole-daemon family): all pass, 28/28 —
  `agent-daemon-server.page-navigate-error-rewrap.unit.test.ts` (3),
  `agent-daemon-server.session-resume-wiring.unit.test.ts` (11),
  `agent-daemon-server.attachment-kind-filter.unit.test.ts` (4),
  `federation-admissions-route.unit.test.ts` (5), `plugin-prompt-prefix.unit.test.ts` (5).
- Did not run `daemon-boots.integration.test.ts` or anything that boots the live module — out of an
  abundance of caution given the explicit prohibition on `serve-command*` (same risk family: an
  actually-running daemon process). Full-repo typecheck plus the unit suites above is the evidence
  available without that risk.

### Shared-tree hygiene

`agent-daemon-server.ts` had an unrelated, already-uncommitted 8-line diff from another concurrent
agent (a `withPageNavigateErrorRewrap` wrap near line 462, unrelated page-navigate work — likely
C4-PAGETOOLS) when I started editing it. Confirmed via `git diff` before touching the file; my edits
are in disjoint regions (imports, the `toolExecutor` construction ~line 489, the new `let` ~line 592,
and the `start()` reassignment ~line 1086) and the post-edit diff shows both changes cleanly
coexisting. Committed only the 6 files this fix actually touches, via explicit `git add <paths>` (no
`-A`), verified staged-only via `git status --porcelain` before commit; a UNIQUELY-named
commit-message file was used (`commit-msg-mcp-refusal-call-time.txt` in the session scratchpad).
Commit: `c5d10181a7c81f865f555c34cf157ae8c6ccb07e`.

### Daemon restart required?

**Yes, to see the effect** — same as the boot-time prefix. `toolExecutor` and the
`federationAdmissionReports` binding it reads are both constructed/populated once per process
lifetime; a currently-running daemon process has neither this decorator wired in nor (for any
process already running before this commit) the new file loaded. A restart of the agent daemon is
required for an operator/user to observe the new call-time behavior. I did not restart anything
myself, per the hard constraint.

### Allowlist confirmation

**No allowlist entry was added, removed, or modified**, in either round of this task. The higgsfield
allowlist remains exactly `generate_image` + `reveal_generation`. All 9 refused-tool test fixtures
used a synthetic in-memory `FederationAdmissionReport`/snapshot constructed inline in the test files
— never real config, never `sites/*/config.json`, never any admissions-rules file.

## Architecture Audit

- **Status: PASS**
- ADR rules checked: no `.dependency-cruiser.mjs` boundary rule names
  `apps/website/src/assistant/federated-refusal-diagnosis.ts` or the touched `mcp-federation/*`
  files; `assistant/agent-daemon-port.ts`'s own doc ("no other module should import it") was
  respected — only `agent-daemon-server.ts` imports the new export through it, matching every other
  entry in that file.
- Files audited: `federated-refusal-diagnosis.ts` (new), `mcp-federation/refusal-notice.ts`,
  `agent-daemon-port.ts`, `agent-daemon-server.ts`, both test files.
- Violations found: none. `federated-refusal-diagnosis.ts` sits in `assistant/` (not
  `mcp-federation/`) matching its sibling decorators — `mcp-federation/` is documented as "pure
  functions, no I/O, no registry", and a `ToolExecutor` decorator is a composition-layer adapter, not
  a pure reduction.

## Pre-Completion Checklist

- Requirements re-verified against the team lead's follow-up: call-time (not enumeration) surfacing,
  R-B untouched, existing 18 tests green, no allowlist touched, restart-requirement noted, exact-text
  RED/GREEN shown. All satisfied.
- Fresh evidence commands: shown above (RED, GREEN, 23/23 refusal-notice, full-repo tsc, 5 targeted
  regression files).
- Test-integrity: no existing test deleted or weakened; the 18 pre-existing `refusal-notice` tests
  are byte-identical (diff confirms only additions).
- Scope: touched exactly the 6 files listed above. Did not touch `@jini-ai/http-kit`,
  `@jini-ai/daemon`, `@jini-ai/mcp`, `apps/admin/src`, any allowlist/config, or any
  `serve-command*.integration.test.ts`.
- Open items: `daemon-boots.integration.test.ts` (or any live-daemon boot) was not run — see
  Regression evidence above for why, and for the typecheck+unit-test evidence used instead. A daemon
  restart is required for the fix to take effect on the currently-running process (see above).

## Self-Validation

- Required: runtime-changing behavior is in scope (a new decorator changes what `toolExecutor`
  returns for a specific call shape), but the standard live-daemon self-validation harness could not
  be run without violating the explicit "no serve-command*/daemon boot" constraint.
- Status: **PARTIAL** — substituted evidence: full-repo `tsc --noEmit` (0 errors, which would catch
  any wiring/closure/type mistake in the module-scope changes) plus 5 real unit-test files that
  already exercise `agent-daemon-server.ts`'s construction path (28/28 pass) plus the 9 new
  decorator-level tests exercising the exact call shape end-to-end at the `ToolExecutor` interface
  boundary (the same interface `delegated-tools.ts` calls against).
- Report path: this file.
- Attempts used: 1 (RED matched expectation immediately; the one real bug found — the `isPreset`
  type mismatch — was caught by `tsc`, not by a failing runtime test, and fixed on the first
  diagnosis).
- Critical path checked: an attempted call to a refused, never-registered federated tool id.
- Negative/edge path checked: native-typo id (unchanged throw), federated-shaped-but-never-refused id
  (unchanged throw), unrelated throw text (unchanged throw), late-bound snapshot (correct behavior
  before AND after the module-scope binding is populated).
- Bounded diagnosis pass used: no — the one failure (`tsc`'s `isPreset` mismatch) was diagnosed and
  fixed in a single pass.

## Style notes / function quality

| unit | disposition | findings | local fix attempted |
|---|---|---|---|
| `withFederatedRefusalDiagnosis` (decorator factory) | NO_RECORDED_FINDINGS | none — pure control-flow wrapper, O(1) extra cost on the unhappy path only | n/a |
| `isUnknownToolError` (duplicated helper) | RECOMMENDED (LOW, duplication) | duplicated verbatim from `tool-executor-audit.ts` rather than imported — deliberate, documented in both files' comments (avoids `mcp-federation`-adjacent coupling for an 18-character regex); MEDIUM message-text-coupling risk is pre-existing and inherited, not introduced | not extracted — see file's own doc for why a shared import was rejected |
| `explainFederatedToolRefusal` | NO_RECORDED_FINDINGS | none — O(1) branch, directly tested including equivalence with the boot-prefix's own text | n/a |
| `findFederatedToolRefusal` | NO_RECORDED_FINDINGS | none — O(c·r) bounded exactly like `summarizeFederatedRefusals`, directly tested including R-C sanitization | n/a |

Zero-findings skepticism pass (3 of 4 units, `isUnknownToolError` already flagged above): all three
are small, single-branch, directly-tested functions with no I/O, no mutable state, no scale risk (the
snapshot is boot-sized, already bounded elsewhere by `attachFederatedMcpTools`/`maxTools`). Variable
name audit: `refusal` in `findFederatedToolRefusal` holds exactly a refusal-loop entry; `found` /
`result` in tests hold exactly what they're asserted against; `getSnapshot` (not `snapshot`) names
that it is a live accessor, not a captured value — the one name in this change where getting it wrong
would have silently reintroduced the pre-boot-empty-array bug the whole `let`/closure design exists
to avoid.

Complexity/space: `withFederatedRefusalDiagnosis` adds O(1) per call on the happy path (a single
`try` with no extra allocation) and O(c·r) only on the already-unhappy unknown-tool path, bounded by
the same connection/refusal counts every other reduction in this file accepts.

No adversarial aggregate/cross-item test needed — this is a single-call classification decorator, not
a batch/reducer/reconciliation workflow; the RED/GREEN pair plus the 5 direct unit tests are the
right-shaped evidence.

## Risks and tech debt

- `isUnknownToolError`'s message-text coupling (MEDIUM, inherited from `tool-executor-audit.ts`, now
  duplicated once more) means a future `@jini-ai/daemon` wording change to the "unknown tool" message
  would silently stop this decorator from diagnosing anything — it would fall back to today's opaque
  redaction, never a worse outcome, but the diagnosis would go quiet with no test catching the drift
  (both copies test their OWN regex against a literal string they own, not against
  `@jini-ai/daemon`'s actual thrown text). Worth requesting a typed/coded unknown-tool error upstream
  the next time Jini's `ToolExecutor` contract is touched.
- `errorKind: 'validation'` reuse (see "The fix" above) is a documented semantic stretch. If
  `delegated-tools.ts` is ever generalized to use C9-ERRORS's `ClientFacingError` (their own
  "Suggested next routing"), this decorator's synthetic result could be revisited to throw
  `ClientFacingError` directly instead, which would be a cleaner status (e.g. a real 403/404) once
  that plumbing exists Tovu-side. Not done now — out of scope, and would touch a Jini-adjacent
  boundary decision better made deliberately.

## Suggested next routing

Ready for review. If the team lead wants the call-time explanation text unified further with the
admin-facing `describeRemoteToolSurface` picker UI (operator's own view of the same refusal), that
is a separate, optional follow-up — not attempted here to stay inside the dispatched scope.
