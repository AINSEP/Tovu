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
