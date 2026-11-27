# COMMIT-PLAN

Spec: revised r62t-rev-p4, Tovu-only SOL dispatch.
Base HEAD: `7c87b3c3f95301d59f55041bf163b723bbab5d79`.
All changes remain in the working tree; the coordinator makes commits.

## Completed design commits, in order

1. **P4-T1.T — shutdown settlement**
   - First extended `apps/website/src/server/runtime/composition/__tests__/process-root-parity.test.ts`, retaining `daemon shutdown waits for publication even when durability fails after rename` and all its existing assertions.
   - Added `afterSettled` to the evaluated function's dependencies and supplied a forwarding spy using the real idiom. The spy checks that the log already contains `store-closed`; assertions check one call with the original publication promise.
   - Then changed `apps/website/src/server/inbound/assistant/agent-daemon-server.ts`: import `afterSettled` from `@jini-ai/core/errors/idioms` and replace only the publication catch with `await afterSettled({ promise: registryPublication })`.
   - Named mutations: drop `await`, or move `removeIfCurrent` before settlement. The retained pending-publication assertion and final order pin reject either mutation. No mutation was executed.
   - Retained the second-signal no-op and final order `["store-closing","store-closed","remove:123","exit:143"]`, listener drain, scope disposal, PID ownership check, and existing rationale.

## Stopped / skipped

- **P4-T5.T — skipped: coordinated T2/T3 reporter wiring is absent.** `apps/website/src/server/inbound/shared/admin-failure.ts` still defines `AdminFailurePorts` with only `tracker` and writes through the legacy console/tracker path. The named observability test still builds tracker-only hosts. Do not add T5's reporter-mode assertions against this uncoordinated wiring.
- Upstream evidence: the supplied `o-f-p4j/f-p4j.md` reports J1 implemented and J5 stopped because J2a is absent. Read-only inspection of `codex/f-p4j:packages/core/src/errors/reporter.ts` confirms `runOperation` lacks J2a's `classify`, `settle`, and verdict contract. J2b/J4 and dependent T2/T3 are not staged here. T1 is independent; the existing `afterSettled` idiom was confirmed at `codex/f-p4j:packages/core/src/errors/idioms.ts`.
- Jini SOL sheets **P4-J1.J / P4-J5.J** are outside this Tovu-only dispatch; no Jini files were changed.
- Left to OPUS: **P4-J2a.J, P4-J2b.J, P4-J4.J, P4-T2.T, P4-T3.T, P4-T3b.T, P4-J3a.J, P4-J3b.J**.
- **P4-T4** is not a SOL sheet; no replay or index edits were made.

## Verification and handoff

- No tests, mutations, builds, installs, type-checks, linters, commits, or pushes ran, as directed. Runtime results and coverage remain unverified for the cloud run.
- Fresh source/diff review confirmed both T1 anchors, exact production replacement, test-first edit order, and retained assertions. No certified tests were removed or weakened.
- Architecture audit (static): PASS for this diff. Reused the named Jini idiom; no new helpers, ports, APIs, dependency changes, or composition imports. Existing comments remain verbatim.
- Reuse: shutdown publication settlement; inspected the named daemon/test anchors and Jini `afterSettled`; used that existing owner exactly as specified by P4-T1.T.
- Function quality: `exitDaemon` — INCONCLUSIVE pending runtime evidence; static review found no new issue. Added settlement work is O(1) time/space beyond waiting; existing scope disposal remains O(scopes). The named test directly covers the changed settlement and ordering seam.
- Documentation: existing publication/delete rationale remains accurate; no new comments were added, per dispatch.
- Final scope review: two T1 files changed; this root plan is the only created file. Deletions of unrequired additions: none; no unrequired additions remained.
