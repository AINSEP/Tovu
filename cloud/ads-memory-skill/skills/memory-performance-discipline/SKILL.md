---
name: memory-performance-discipline
version: 0.1.0
last_updated: 2026-11-05
description: Use when designing, implementing, or reviewing polling, checkpoints, large payloads, caches, retained history, background lifecycles, or memory/performance fixes. Make recurring work and retention bounds explicit; verify savings on the production path.
---

# Skill: Memory & Performance Discipline

Software Architect proposes bounds and tradeoffs; Programmer implements and reports cost; Code Inspection verifies the actual path. Apply the checks to changed paths, without creating another scheduler, cache framework, or benchmark system.
Keep dependency/lifecycle rules in [coding-foundations](../coding-foundations/SKILL.md), reuse and query fan-out rules in [implementation-guardrails](../implementation-guardrails/SKILL.md), and load/latency validation in [performance-engineering](../performance-engineering/SKILL.md).
Load [Electron guidance](references/electron.md) **only for Electron desktop work**, including its launched servers, daemons, and bridges. Load [evidence](references/evidence.md) only when checking a lesson's basis.

## Seven checks

1. **Calculate recurring work.** Define frequency × payload × copies/scans × concurrent consumers, plus retained bytes. Count reads, serialization, parameters, writes, and scanning CPU separately, including unchanged polls. Repeated growing snapshots can accumulate quadratic work. Bound stream carry and overflow; sanitize before retaining or delivering. Probe long nonmatches and split secrets without weakening redaction.

2. **Read narrowly; verify physical work.** Request the smallest scoped projection: metadata for lists, bodies on detail, aggregate/existence queries for predicates, bounded pages for history. Trace through storage and serialization. `LIMIT 1` bounds output, not the search: inspect the real-engine plan, especially no-match cases with large terminal history. Use normal migrations and fresh bootstrap; account for index-build I/O and write blocking.

3. **Avoid repeated full JSON transformations.** Check a cheap validator before loading bodies; use validated stored JSON, guarded deltas, or backpressured streaming where contracts allow. Preserve authoritative full-merge fallbacks, replay/tool barriers, growing text tails, concurrent-write checks, Unicode correctness, and terminal fencing. Publish persistence receipts only after commit. SQL text splicing may still rewrite the full row/WAL; count that remaining work.

4. **Bound stores and prove cache usefulness.** Name the key, owner, capacity in bytes/count/age as appropriate, lifetime, invalidation scope, cleanup, overflow, and fallback cost. Count caps cannot bound unbounded entries. A correct cache can save nothing when unrelated writes invalidate it; measure hits and fallbacks with concurrent consumers. Preserve durable work and reversibility promises: without an authorized deletion policy, reject or defer new work at capacity.

5. **Schedule progress and fence teardown.** Coalesce to one pending write and one trailing timer per owner; choose cadence against payload and allowed crash loss. Successful/unchanged completion reschedules only for newer progress. Retry transient storage failure during quiet waits with positive minimum delay and a bounded/backed-off policy. Stop scheduling and clear timers before awaiting cleanup; late promises cannot revive retired owners. Persist terminal state without throttling.

6. **Require proof of idle before reclamation.** HTTP completion does not end publish/export/upload/send work. Release request holds exactly once on finish or close; consult background owners. Recheck live activity after asynchronous probes, then fence intake without yielding before graceful stop. Busy, failed, or unknown probes defer reclamation. Reuse existing control channels/samplers; cancel restart work on Stop/delete/quit, and prevent old exits from removing replacement bindings.

7. **Measure comparable workloads and budgets.** Name metric, units, process scope, runtime, flags, supported workload, and acceptance budget before claiming savings. Separate RSS, heap, native/external allocation, committed memory, and footprint; missing readings remain unknown. Compare baseline/changed production paths using existing harnesses, natural peaks and post-idle recovery, including relevant concurrency, quiet waits, reconnect, and terminal completeness. Forced GC is supplementary; unit tests or an unrun harness do not establish savings. Measure CPU/latency tradeoffs too.

## Cost output

Emit one line per materially affected recurring or retained path; describe evidence as **ESTIMATED**, **MEASURED**, or **UNVERIFIED**, with its source and budget result. Architect proposes bounds; Programmer reports implementation; Inspection verifies them. Use existing review severity rules; this checklist adds no approval gate or universal numeric threshold.

`Cost: <path/owner>; <frequency × payload × copies/scans × consumers>; retained <bound/lifetime/overflow>; fallback <full work>; tradeoff <durability/latency>; <ESTIMATED|MEASURED|UNVERIFIED + evidence/budget>; next <check>.`

For documentation alone: `Cost: N/A — documentation-only; no runtime I/O added`.
