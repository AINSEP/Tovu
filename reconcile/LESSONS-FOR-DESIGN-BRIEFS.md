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

## Added after the ACP judgment (2026-11-16)
23. Protocol/adapter work: track an adapter executable and its backing engine as separate identities (version, probe, config, teardown); configured support != advertised capability != demonstrated interoperability; preserve telemetry dimensions (context vs billable usage, cumulative vs delta, units); a savings claim needs a deletion ledger (file, lines, why deletable).

## Added after the error-system judgment (2026-11-16)
24. Redaction is not disclosure authorization (a scrubbed diagnostic can still leak private payloads/business facts); registrations are relations, not 1:1 tables (model cardinalities before lookup precedence); test compatibility in BOTH directions (old readers vs new responses too); lint exemptions need executable examples run against the combined rules; correlation metadata must survive consumers that rebuild a fresh Error.

## Added after the publish-engine judgment (2026-11-16)
25. Package moves: every export-map entry must exist (and build) in the commit that introduces it; universal entries must not load Node code or cross isolation domains; every prerequisite in the migration graph must already exist or be scheduled; authorization compensation (cleanup after a failed check) needs its own failure-reporting contract - never lose evidence that cleanup failed.

## Added after the env-schema judgment (2026-11-16)
26. Config/env: names are an installation compatibility surface (no-alias still needs a deployment-state migration); OS string env != native binding namespaces (an object called env is not strings); model confidentiality separately from role (dynamic names, credentials inside URLs); define when validation applies and which override wins; deleting a deny/disable switch can silently ENABLE a forbidden capability - treat as security.

## From Codex judging the 11-16 evening PLANNING runs (xpkg lane sheets, lanes S/U)
27. **Separate extraction from compliance classification.** Keep raw import counts, but apply the approved exceptions (host-preset, frozen packages, option-C React->ui-kit) before generating cleanup work; do not plan work against an exception or apply a stricter rule than the owner approved.
28. **Separately delivered browser assets are separate composition boundaries.** A server-side binding cannot reach code shipped as a browser bundle/asset; plan an explicit browser-side injection point (and test the browser lifecycle event, not the server one).
29. **Validate the assembled executor brief as ONE contract.** A sheet + its shared COMMON/appendix must not contradict each other: "coordinator applies these lines later" makes a sheet's "every commit green" gate impossible; every STOP condition named must have a command that actually enforces it; hand-written instructions must not contradict generated facts (census, inventories).
30. **Every sub-sheet's intermediate state must compile alone.** Splitting a lane into a/b/c runs: sub-sheet a may not depend on contracts/implementations that b or c create; the base branches named for Tovu and Jini must be compatible with each other.
31. **Characterize, never invent.** For security paths (auth, API keys, search validation, permissions) the plan pins what the code does today, names the real producer of each invariant, and only then moves it; a planned test needs an existing injection seam or the sheet must create one first.
32. **Module location can be behaviour.** Inventory `import.meta.url` / directory-derived roots (assets, data dirs, workers) separately from import resolution before relocating a module.
33. **Different evidence authorizes different actions.** Registry-file ownership and child-process lineage (and similar pairs) authorize different things (file cleanup vs process termination); keep separate evidence for each when merging code paths.
34. **Carry diagnostic metadata through the transport before its first lossy transformation.** A downstream sanitizer cannot reconstruct erased error/tool names; plan where the data is preserved, not only where it is shown.
35. **Reserve fallback time inside every enclosing hard deadline** (abort signals, resource-close handlers); a fallback that needs time after the outer deadline never runs.
36. **Callable names come from the publisher's actual wire-name mapping**, not registry identity; verify the exact spelling an agent must send.
37. **Scope source-text lints by language and audience.** SQL and other embedded languages need negative fixtures before a text rule is enforced.
38. **Persisted-row fields are not creation-command fields.** Server-generated metadata must not become a required input just because one descriptor drives both screens.
39. **Field clearing is part of the transport protocol.** `undefined` does not survive a JSON round trip; define explicit clear semantics (null/sentinel) end to end.
40. **STOP commands never go inside markdown tables.** A `\|` in a table cell is a literal pipe when copied, so the STOP check never fires (fails open). Put every STOP/prerequisite command in a fenced code block and test that it fires on a planted case.
41. **The 50-line function rule needs its own command.** check:size only errors at 80; every sheet names the eslint limits command (max-lines-per-function 50, complexity 10, max-lines 500) and runs it per commit.
42. **Two plans touching the same files need a collision table before either runs.** One owner per file group (e.g. lane S owns taxonomy/trash SQL, lane K keeps tool layers); the other plan's sheets are retired or sequenced behind it.
43. **Facts are regenerated on the exact base the run will use.** Inventories, blob guards, line numbers and caller lists generated on an older merge drift; re-run the plan's own generators on the current base and re-pin before dispatch.
44. **Preflight the base's gates before launching a wave, and judge runs on "no new line beyond the base output".** A red base stops every sheet whose rule is "baseline red = STOP" (wave-1 lost three runs to it); record the base output and compare against it instead.
45. **Every commit runs ALL source-reading tests of each touched package, not only the files it edited.** Red commits recurred twice (size-02, G-STALE-DEPS) because a moved file broke a test that reads source text elsewhere.
46. **Why-comments are checked by machine.** Deleted comment blocks with no matching addition are a gate failure (check:why-comments); the audit found ~200 lost in Tovu and ~55 in Jini after one day of moves.
47. **A local link script must cover every app with its own node_modules.** link-jini skipped apps/desktop, so desktop gates silently ran against published copies; list every consumer explicitly and test the script.
