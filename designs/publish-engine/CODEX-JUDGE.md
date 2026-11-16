Software Architect / Security(Review): **Verdict: needs rework.**

Reviewed the requested Git refs without changing files. Tovu currently resolves to `80b00f5b`; its source in scope is unchanged from the design’s `65302ee5`. Jini resolves to `02edbb68`.

I checked line totals and import declarations for all 48 inventory rows, exceeding the 15-row sampling requirement. I did not certify every importer count, function measurement, or complexity figure. No tests, typechecks, or mutation experiments were run.

Below, **D** means `designs/publish-engine/DESIGN.md`; Tovu source paths are relative to `apps/website/src/`.

1. **Blocker — The proposed universal entries load Node code and cross prohibited isolation domains.**

   **Evidence:** D:239–270 declares planning, registry and peers universal. However, `features/publish-content/planner.ts:1` value-imports `CONTENT_HASH_VERSION` from `content-hash.ts`, which imports `node:crypto` at line 1. `repo-handler.ts:5` imports the hashing implementation. `peer-transport.ts:3` imports the Node blob verifier, and `destination-credential.ts:1` imports the Node handshake client.

   Same-package leaf imports also do not automatically satisfy isolation: `media-references.ts:1` imports widgets markers, while Jini’s `scripts/check-subpath-isolation.ts:279–287` rejects crossings into another named domain. Its traversal follows runtime imports at lines 299–314. U7 is therefore a concrete target-shape conflict, not merely an unverified possibility.

   **Fix:** Separate universal constants/contracts from Node implementations, classify executable entries by their complete dependency closure, and explicitly resolve the media/widgets isolation crossings before finalizing exports.

2. **Blocker — The migration graph contains unavailable prerequisites.**

   **Evidence:**

   - D:434 adds the export entries in J0 before their source files land. Jini’s `scripts/check-subpath-isolation.ts:327–329` reports export targets without source files.
   - D:446 gives B03-P3 only J0 as a prerequisite. Its peer service still needs `normalizePeerBaseUrl`: `peers.ts:7`, called at lines 225–229. D:447 moves `peer-url` later, in P1.
   - D:459 requires characterization fakes from `@jini-ai/cms/publish/testing`, but D:434 creates that entry only after Phase 0, which includes those tests.

   **Fix:** Land the testing support before tests consume it; add each export only when its target exists; move `peer-url` before or with P3. Rebuild the graph from actual imports.

3. **Blocker — The specified test moves do not satisfy the proposed runner or host boundaries.**

   **Evidence:** D:413 uses cms’s test command, which is `vitest run` at Jini `packages/cms/package.json:431`. The three B01 suites scheduled to move at D:435 use `node:test`: `blob-staging.test.ts:3`, `bundle-staging.test.ts:2`, and `file-blob-index.test.ts:6`. No runner conversion or native-test invocation is specified.

   B02-S2 also moves two host-bound suites. `raw-file-contributor.test.ts:8–14` imports Tovu’s filesystem adapter and implementations. `raw-row-contributor.test.ts:1–10` imports Tovu SQLite helpers, its raw-row adapter and content kernel. These cannot become package-local tests through import repointing alone.

   **Fix:** Specify runner conversion and hook/cleanup changes per suite. Keep real-adapter integration tests in the host; add Jini unit tests using interface fakes. Report executed cases rather than relying on source-text counts.

4. **Major — “No broken intermediate state” lacks a reproducible package-delivery mechanism.**

   **Evidence:** D:411 requires each Tovu commit to resolve its preceding Jini commit, while U3 at D:563 leaves that unresolved. Tovu `package.json:139` uses `^0.7.0`; its lockfile resolves cms to registry version `0.7.0`. A Jini commit does not change that installation.

   An existing local mechanism was missed: `development/scripts/link-jini.mjs:1–27`. It explicitly supports local development only. `check-no-linked-jini.mjs:22–38,58–70` rejects local dependency forms and links for release builds.

   **Fix:** Define the build/package/release and lockfile update for every consuming commit. Verify clean installation and build against the intended artifact before deleting Tovu implementations.

5. **Major — The credential-store contract leaves existing credential-preserving operations undefined.**

   **Evidence:** D:361–368 offers `saveWithCredential(record, apiKey)` and `saveWithoutCredential(record)`, the latter described as serving connected destinations. It does not define metadata updates that preserve an existing envelope.

   Today, `peers.ts:293–306` supports that operation without decrypting or resealing. Lines 420–425 preserve the envelope through a revision-checked write; lines 617–630 preserve vault metadata, defaults and hint fields. Existing tests explicitly require a rename to preserve ciphertext and work without crypto (`__tests__/peers.test.ts:228–244,331–341`).

   **Fix:** Complete the operation and error contracts before approval: create, metadata update preserving credentials, credential replacement, connected-destination conversion and deletion. Keep vault persistence and revision handling with the existing vault owner, including for the in-memory host binding.

6. **Major — K4 proposes characterization assertions that contradict existing behavior.**

   **Evidence:** D:189 says every response field is validated and proposes refusal when required fields are missing. The current client intentionally supplies fallbacks:

   - `handshake-client.ts:243`: missing/non-string origin becomes the base URL.
   - Lines 314–317: missing/non-string expiry becomes `""`; absent/non-array capabilities use the requested capabilities.

   These are explicitly pinned in `__tests__/handshake-client.unit.test.ts:164–166,242–252`.

   **Fix:** Enumerate required fields separately from optional fields and their fallbacks. Characterize the existing contract. Any stricter validation needs an explicit behavioral change decision.

7. **Major — The registry plan recreates shared state in composition and misses direct readers.**

   **Evidence:** D:405 exports `publishTypes` as a registry instance from a composition module, despite OD-1’s isolation rationale at D:548. Multiple application constructions would import the same constructed instance. The current repeated-construction behavior is documented in `server/runtime/composition/modules/publish-content.ts:37–49`.

   P0.4 lists registration and catalog callers but omits direct registry readers, including `features/publish-content/tool-registrations.ts:166,298` and `server/inbound/admin-http/routes/publish-content/destination.ts:209`. Those need dependency changes, not simple import repointing.

   **Fix:** Construct the registry per composition instance and pass it through both server and daemon boot paths and every reader. Test isolation through the actual composition roots, not only two direct factory calls.

8. **Major — `beforeSaveHook` has contradictory target contracts and no complete migration.**

   **Evidence:** D:323 retains a top-level `beforeSaveHook?: BeforeSavePort`; D:335 instead directs moving it into `TPorts.post`. The actual handler reads `deps.beforeSaveHook` at `features/post/publish-content.ts:389`. `features/publish-content/tool-registrations.ts:425` supplies it at the top level.

   **Fix:** Choose one contract and name all affected producers, consumers and tests. Preserve the plugin-refusal behavior exercised by `publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts`; do not delegate this boundary decision to implementation.

9. **Major — The trust proof table does not establish every claimed security property.**

   **Evidence:** D:203 requires constant-time MAC comparison, but its proposed tests observe verification results and parsing order. Replacing `timingSafeEqual` in `session.ts:129–133` with a non-constant-time comparison can preserve those results.

   D:206 supplies only unspecified “existing Tovu route tests” for the host middleware. Independent checks include grant capability re-intersection (`publish-trust-auth.ts:308–315`) and the permission/type/backstop conjunction (`:417–429`). Other host gates, including bundle entity-type admission (`routes/publish-content/bundle-create.ts:138–163`) and raw-value disclosure authorization (`routes/publish-content/import.ts:122–143`), lack specific mutation-proof assignments.

   **Fix:** Expand the matrix to individual predicates and boundary effects, with named tests. Treat constant-time implementation as a separately verified implementation constraint; functional refusal tests cannot certify it.

10. **Major — The “one recorded exception” error-handling claim misses authorization compensation failures.**

    **Evidence:** D:587 claims error handling complies with one crypto-verification exception. But `connect-destination.ts:108–117` silently suppresses grant-reversal failure after connection recording fails. Lines 150–166 suppress restoration failure during disconnect compensation. These affect whether recorded connection state agrees with durable authorization.

    `raw-file-contributor.ts:126–130` also converts every file-read exception into absence.

    **Fix:** Inventory these existing exceptions explicitly. Preserve the primary error while reporting compensation failures through a redacted diagnostic port. Specify tests for primary and compensation failures together; obtain an explicit decision for any retained suppression.

11. **Major — P0.5’s signature census is incomplete.**

    **Evidence:** D:168 lists 23 conversions and D:580 claims compliance afterward. Omitted examples include:

    - `peers.ts:191`: `toPeerSummary(record)`
    - `peers.ts:250`: `createPublishContentPeer(deps, input)`
    - `peers.ts:503`: `selectConnectedDestination(rows)`
    - `planner.ts:239,254`: scalar-shaped label helpers
    - `planner.ts:491`: `planImport(bundle, deps)`
    - `challenge.ts:83`: `buildChallengeMessage(input)` without the required options boundary

    **Fix:** Census all public functions, methods and callbacks against the required signature convention. Include their caller migrations before calling the subsequent moves behavior-free.

12. **Major — OD-3 recommends a target explicitly forbidden by the brief.**

    **Evidence:** D:550 recommends explicit named-export entry files. Those remain re-export shells; replacing `export *` with named re-exports does not satisfy “no barrels/re-export shells/forwarders.” `INDEX.md:45` additionally says direct leaf exports conflict with the rule, although an export-map key targeting the owning implementation file creates no shell.

    **Fix:** Use direct implementation entry points or substantive public modules that own behavior. Finalize those specifiers before preparing the caller migration.

## Recurring mistake classes

- Export-map entries create packaging obligations even before any consumer imports them; each target must exist in the commit that introduces its export.
- Authorization compensation needs its own failure-reporting contract. Preserving the primary error does not justify silently losing evidence that cleanup failed.
