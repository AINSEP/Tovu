# AUDIT-SHEETS-1: executable sheets for audit rows A* / B* (2026-11-16, PARTIAL)

Scope: every ACCEPT row in `AUDIT-ADDITIONS.tsv` whose id starts with A or B. Sheets were written against Tovu `refactor/terra` b28d38c6 / Jini `refactor/terra` b7666092, with untangle overlap checked against `../untangle/sheets/*.repoint.tsv` (C1..C11, C*-shell, R-BARRELS). Sheets live in `sheets/audit/`. Assemble each as `cat T-<KIND>.md sheets/audit/<sheet>.md COMMON.md`.

Run status: **PARTIAL**. The context budget ran out after 4 sheets. The run did them in value order but took **B01 out of order** (see below).

| id | kind | sheet | slices | tier | untangle overlap | status | est. executor tok |
|---|---|---|---|---|---|---|---|
| A03 | SPLIT | `sheets/audit/split-A03-visitor-confirmation-binding.md` | 1 (J+T) | Sonnet + Opus diff review (security) | none (startable now) | READY | ~55k |
| A05 | SPLIT | `sheets/audit/split-A05-render-ui-tool.md` | 1 (J+T) | Sonnet | C10:119,138, C11:65; target moved by C10 (`agentic/a2ui` gone, uses `protocol/a2ui`) | READY: **execute after wave B merge** | ~40k |
| A04 | SPLIT | `sheets/audit/split-A04-byok-credential.md` | 1 (J+T) | Sonnet | R-BARRELS:221 (sealer import line), C6:250 / C10-shell / R-BARRELS on other lines of edited files (text-guarded) | READY: **execute after wave B merge** | ~40k |
| A10 | MOVE (+1 injected predicate) | `sheets/audit/move-A10-issued-sign-ins.md` | 1 (J+T) | Sonnet | none on edited files (startable now) | READY | ~25k |
| B01 | HARDEN | not written | 2 | Opus + Sonnet | R-BARRELS:1727,1733,1734 (type imports) | NOT STARTED: needs a dedicated Opus session (see notes) | n/a |
| B06 | SPLIT | not written | 1 | Sonnet | not checked | NOT STARTED (budget) | n/a |
| A08 | SPLIT | not written | 1 | Sonnet | not checked | NOT STARTED (budget; fold into the row-56 sheet per AUDIT-ADDITIONS) | n/a |
| A06 | MOVE | not written | 1 | Sonnet | not checked; note `assistant-byok.ts:86` imports it (also edited by A04 on other lines) | NOT STARTED (budget) | n/a |
| A09 | DEDUPE | not written | 1 | Sonnet | `database-transfer/*` rows import `plan-store.js` (untangle) | NOT STARTED: owner question 2 in AUDIT-ADDITIONS (stateful store in core) still open, so BLOCKED anyway | n/a |
| B02 | SPLIT | not written | 1 | Sonnet+review | not checked | NOT STARTED (partly blocked: after CLASSIFY row 13) | n/a |
| B05 | SPLIT | not written | 1 | Sonnet+review | not checked | NOT STARTED (partly blocked: after lifecycle) | n/a |
| B07 | MOVE | not written | 1 | Sonnet | not checked | NOT STARTED (partly blocked: after CLASSIFY row 13) | n/a |
| A01, A02, B04 | SPLIT/SPLIT/SERVER | not written | - | - | - | BLOCKED per AUDIT-ADDITIONS (cycle-cuts + row 131; row 146; server-port) | n/a |

## Notes for the next session
- **B01 (run finalizer) was deliberately not sheeted.** Tovu `server/runtime/composition/modules/assistant-run-finalizer.ts` (blob c0de6c22, 809 lines) has 16 importers and tests. Its contract differs structurally from Jini's `chat/server/run-finalizer/entry.ts` (226 lines), not just by missing behaviour. A zero-judgment sheet would take roughly 100k tokens of Opus work, which would have left nothing for the other rows. Parity rows seen so far, for whoever writes it:
  - P1: durable recovery. Tovu has `createDurableRecovery`, `recover`, `reconcileInterrupted`, launch/cancel/attach for new attempts, `verifyChildDead` and `supportsNativeResume`. Jini has none of it.
  - P2: resolution deadline. Tovu bounds each attempt with `resolutionTimeoutMs` (120 s) and `statusTimeoutMs` (5 s) through `withinDeadline` and `readWithinBound`. Jini only has a fixed reconnect count.
  - P3: checkpoint growth. Tovu grows by progress (text characters, extension events, tool identities: `checkpointGrew`). Jini grows by event count only.
  - P4: checkpoint cadence and retry. Tovu sizes the interval (`checkpointIntervalMs({ bytes })`, 1/3/10 s) and backs off a failed write (`checkpointRetryAt`). Jini uses a fixed 1 s with no backoff.
  - P5: retained projection. Tovu keeps `retainedEvents` and `checkpointState.previous`, so a replay prefix never shrinks the saved projection. It also seeds the watch with `attemptBase`.
  - P6: stream abort and release. Tovu has `abortStream` and `stopWatch`, and the daemon client has `release`.
  - P7: per-watch daemon override and a previous-daemon fallback (`recoveryDaemon`).
  - P8: observability. Tovu records each agent run's terminal status through `tracker`.
  - Host-only parts that stay in Tovu: `createHttpRunDaemonClient` (URL, token, principal header, park recovery), `agentCarriesOwnMemory`, `verifyAttemptChildDead`.
  - Several of these touch run settlement, so failing tests must come first. Tier: Opus parity list, then Sonnet execution in 2 slices.
- A03 and A10 have no wave B overlap and can run now. A04 and A05 use derived-blob or text guards that assume the wave B shapes, so run them only after the wave B merge.
- Every sheet keeps all existing Tovu tests byte-identical apart from import repoints, and adds a new Jini test file. None changes behaviour, so none needs a failing test first.
