# Lessons from the Codex gpt-6.1-sol HIGH judgment of Fable's 10 size designs (2026-11-16)
Result: 9 of 9 judged designs "needs rework" (styles.ts "sound with fixes", dropped by owner). 6 blockers, ~45 majors.
Judge reports: CODEX-JUDGE-{a-composition,b-site-api,c-ui-jini}.md beside the designs.

Paste these into every future split/move DESIGN brief (and executor brief):
1. Partition the real dependency graph (calls, recursion, state reads, init edges, deferred/late reads), never contiguous line ranges or names.
2. Inventory every declaration, export, state cell, consumer (incl. tools, mock factories, source-reading tests) before defining target files.
3. Trace late-bound / deferred reads: turning a closure read into an explicit argument can make it eager (TDZ / undefined at boot).
4. Define each slice's inputs, outputs, init point and owner of mutable state BEFORE the extraction order; values one slice makes and another uses need an explicit handoff.
5. Design the migration graph, not just the end state: each commit lists its prerequisites + caller/test updates and must compile and pass alone.
6. Characterization tests must be able to FAIL on the risk the design names (pin clock/randomness; assert headers, URLs, order, effects, cleanup, effect order, DOM order + mount lifetime).
7. Keep optional values, fallbacks, promises and domain errors as distinct contracts when moving code.
8. Check owner limits INSIDE each proposed file (functions <=50, complexity <=10, args shape), not just file size.
9. Generic mechanism vs host binding: Tovu routes/env/composition stay in Tovu even when colocated with a Jini-bound feature; search for an existing owner first.
10. Untangle lanes that touch the file are prerequisites; follow the latest approved untangle destination; path-keyed debt does not follow moved code silently.
11. Verify test seams and compiler commands exist (real tsconfig, real runner) before relying on them.

## Added after the daemon R7/R8 judgment (2026-11-16)
12. Check port bindings for BEHAVIOURAL compatibility, not structural typing: arg order, which object a field sits in, array vs object, positional vs object args (R8 blocker: CLI args silently dropped). Reuse existing adapters (C5) instead of direct references.
13. Trace every security gate (auth predicates, origin, body limits, parsers other middleware depends on, constant-time compares, principal rewrites) across the WHOLE host middleware chain; characterization tests must fail when the gate is removed and must match deployed behaviour per security profile.
14. Streaming routes: specify response commitment, production, backpressure and cleanup as separate lifecycle events.
15. Treat owner constraints as acceptance criteria; record approved exceptions before excluding their cost from estimates.

## Added after the lost-updates judgment (2026-11-16)
16. Concurrency: distinguish server-side serialization from protection against an already-stale client submission; every writer of a protected record (incl. access/security mutations, compensation, async effect completion) must take part in revision advancement; scope concurrency by the real conflict key, not by run ownership.
17. No-op behaviour must hold across the whole command/event lifecycle (no event, no outbox job, no revision bump), not just the primary row write.

## Added after the AG-UI judgment (2026-11-16)
18. A transport write is not a consumer transaction: security and correctness must hold per event, whatever the network chunk boundaries; cancellation channels are part of the safety contract (no effects after server cancel).
19. Authorization identity != quota identity (composite keys cannot enforce independent limits); a shared capability/tool name is not a correlation id (no FIFO pairing across streams); verify a named producer/consumer exists before designing around it.

## Added after the security-review judgment (2026-11-16)
20. Generalising a type: replace representation-dependent truthiness checks with explicit absence checks; making a constant configurable: revisit every cache key/invalidation that assumed the constant; accessors that return live internal objects transfer mutation authority (readonly is not runtime immutability).

## Added after the run-finalizer judgment (2026-11-16)
21. Test each redundant guard at an outcome only it protects; model process death separately from promise rejection (caught exceptions leave timers/callbacks alive); a successful CAS does not authorize an external launch of a row that has since become terminal; replacing a published implementation means reconciling both behaviour baselines.

## Added after the import-cycle judgment (2026-11-16)
22. Runtime vs type-only import classification depends on each package's compiler settings (verbatimModuleSyntax, isolatedModules, importsNotUsedAsValues); layer-registration invariants need node checks (isolated/sink modules), not only edge rules.
