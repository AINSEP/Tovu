Security / Red-Team(Review): **Verdict: needs rework.**

Reviewed `REVIEW.md` and `INDEX.md` at Tovu `8f0d1c6e`, the integration snapshots Tovu `65302ee5` / Jini `02edbb68`, cached Jini commits A03/B07/A37, and sheets at `45764eac`. No files were edited and no tests were run.

Fetch failed because the sandbox prohibits writing `.git/FETCH_HEAD`. Tovu `022e1d5b`, the cloud branch commits, and the unpushed A37 Tovu half were unavailable. Findings about those exact changes remain unverified here.

1. **Major — A1 misses an owner-check bypass introduced by generalising the owner type.**

   **Evidence:** `REVIEW.md:A1` marks the owner check preserved. Jini `af6779fb:packages/daemon/src/bound-confirmations.ts:15` permits an unrestricted `TOwner`, but line 128 calls `sameOwner` only when `held.owner` is truthy. A present, falsy scalar owner therefore receives no owner comparison. The original Tovu contract restricts owners to `FrontendSessionOwner` objects (`apps/website/src/assistant/site/visitor-confirmations.ts:9`); the copied truthiness assumption was safe for that narrower representation.

   Jini’s tests use only object owners (`packages/daemon/src/__tests__/bound-confirmations.test.ts:7`), so the review’s additional six test cases do not close this gap.

   **Fix:** Check explicitly for absence, or constrain the public owner contract to the supported representation. Add cases for matching, mismatched and omitted owners with every admitted representation, asserting that refusal leaves the challenge usable by its owner. Update A1’s findings and merge requirements.

2. **Major — A06 makes budget windows configurable without defining cache invalidation for them.**

   **Evidence:** The sheet’s `VisitorBudgetLimits` introduces independently supplied `windowSeconds` values (`split-a06-visitor-tool-engine.md:74`), while its implementation instruction retains the existing budgets with a limiter-factory substitution (`:132`). The existing cache records only `max` and reuses a limiter whenever that maximum matches:

   `apps/website/src/assistant/site/visitor-tool-budgets.ts:8`, `:29–35`.

   Today this works because the two windows are constants (`:42`, `:44`). Under the proposed contract, changing a window while retaining the maximum can leave the previous window active. `REVIEW.md:B1-F5/F6` discusses canonicalisation, ceilings and stores but misses this newly variable policy dimension.

   **Fix:** Keep windows fixed at factory construction if that satisfies the requirement. Otherwise specify window-change semantics, cache invalidation and preservation of consumed allowance. Add a fake-clock regression that changes only the window and checks the resulting admission decisions.

3. **Major — A06’s stated migration does not connect the new host binding to the executor.**

   **Evidence:** The sheet changes construction to `createVisitorExecutor({ capabilities, ports }, optional)` (`split-a06-visitor-tool-engine.md:132`). The real caller supplies ports in the second argument:

   `apps/website/src/assistant/site/capability-registry.ts:171`.

   S3 creates `visitorPorts(...)` and specifies import changes, but never specifies replacing this construction with a call through that binding (`sheet:142–144`). Merely repointing the import either fails against a closed options type or leaves ports absent from the new required argument if the unused options object remains broadly typed.

   The same migration deletes `visitor-execution-ports.ts`, although the Tovu gate still needs host-only members such as `confirmation`, `owner` and `publicationRevision` (`visitor-confirmation-gate.ts:68`, `:76`, `:80`). The sheet mentions a Tovu extension type at line 116 but does not give it a surviving definition and complete consumer updates.

   **Fix:** Specify the surviving Tovu port type, the complete adapter, the exact registry invocation and all affected producer/test updates in S3. Close the unused options type. Verify both configured and rollback construction through the real Tovu binding before deleting the old files.

4. **Major — B3’s “sufficient” tests lose coverage of Tovu’s actual hostname admission policy.**

   **Evidence:** `REVIEW.md:732–734` says the tests are sufficient and identifies existing tests as retained binding protection. However, the sheet deletes `tryLocalOwnerSession` and moves its cases into Jini (`split-a51-session-bootstrap.md:79`).

   The actual hostname admission cases currently exercise that deleted function:

   `apps/admin/src/lib/__tests__/local-owner-signin.unit.test.ts:17–28`.

   Jini’s proposed tests fake `admit`, so they cannot detect an incorrect Tovu hostname predicate or binding. The surviving remote-refusal test at line 73 supplies a bootstrap function that throws. Since bootstrap errors are swallowed, that assertion can still pass when bootstrap is incorrectly attempted.

   **Fix:** Retain hostname cases in Tovu through `readInitialAdminSession`, using a successful bootstrap fake and explicit call counts. Assert that rejected hostnames produce zero bootstrap calls. Jini should separately test the generic admission mechanism with interface fakes.

5. **Major — The review omits concrete owner-rule violations from its acceptance requirements.**

   **Evidence:**

   - A03’s factories occupy 55 and 52 physical lines respectively: Jini `af6779fb:packages/daemon/src/bound-confirmations.ts:80–134` and `:161–212`. Neither has a recorded exception to the 50-line limit.
   - A37 adds another forwarding export to the existing barrel at `1b5af586:packages/mcp/src/federation/hosted/index.ts:14`.
   - A06 explicitly proposes a new forwarding `visitor-tools/index.ts` (`sheet:122`, `:132`); A51 proposes `session-bootstrap/index.ts` (`sheet:57`). Both conflict with the stated no-barrels target.
   - A06 places three **required** configuration tables in “options” (`sheet:138`). That cannot satisfy an optional second argument defaulting to `{}` without moving those requirements or inventing defaults.

   `INDEX.md` does not list these among the fixes required for execution or publication.

   **Fix:** Add them to the review’s required changes. Use direct implementation subpaths, split oversized factories without changing their lifecycle, and put required configuration in the first object. Verify size, complexity, signatures and package boundaries against the resulting files.

6. **Minor — The saved-keys regression-test inventory is factually wrong.**

   **Evidence:** `REVIEW.md:628–630`, `:742` and `INDEX.md:17`, `:48` report that a route-level saved-keys reveal test was not found. Two suites exist on the reviewed integration snapshot:

   - `apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-share-password.integration.test.ts:26–48`
   - `apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-share-password-handler.test.ts:39–75`

   The first suite exercises the registered route with a fake backend. Its line 45 isolates Fetch Metadata refusal while retaining a matching origin; the second also covers scheme refusal. These assertions address removal of the gates in `site-share-password.ts:23–24`.

   **Fix:** Correct both inventories and retain these suites during A50. Record mutation sensitivity separately for the shared predicate and the additional scheme check. Their execution remains unverified.

7. **Minor — A3’s “immutable pin preserved” classification overlooks a live mutable alias.**

   **Evidence:** `REVIEW.md:310` marks first-capability immutability preserved. Jini `1b5af586:packages/mcp/src/federation/hosted/pinned-capability.ts:61` returns the internal capability object itself. Its properties are TypeScript-readonly, but the runtime object is neither detached nor frozen. The accessor therefore exposes mutation authority over the pin as well as the raw token.

   The tests compare returned values (`pinned-capability.test.ts:18`, `:31`) without testing isolation from subsequent mutation.

   **Fix:** Correct the gate classification and expand A3-F1’s explanation. The proposed URL-only primitive accessor addresses both problems; require a regression proving public results cannot alter the pinned endpoint or bearer.

8. **Minor — B2’s wildcard fix unnecessarily narrows other accepted origin classes.**

   **Evidence:** `REVIEW.md:650–652` recommends accepting only hosts with letter/digit/hyphen labels and rejecting trailing dots. The current predicate accepts canonical HTTP(S) origins through URL parsing and exact serialisation equality:

   `apps/website/src/contracts/core/public-page-security-headers.ts:80–85`.

   The proposed replacement also excludes canonical IPv6 origins and changes trailing-dot handling. Those changes are additional policy decisions, beyond rejecting CSP wildcard syntax.

   **Fix:** Reject wildcard syntax directly while preserving other accepted origins. Any broader restriction needs an explicit behaviour decision, caller assessment and corresponding tests.

The spot-check covered these **21 review rows or classifications**. Locations use the pinned commits stated above; shortened filenames refer to the paths cited in the findings.

| Review claim | Source checked | Result |
|---|---|---|
| A1 owner comparison preserved | Jini `bound-confirmations.ts:128` | Incomplete; finding 1 |
| A1 claim precedes await | Jini `bound-confirmations.ts:130–131` | Supported |
| A1 expiry checked around validation | Jini `bound-confirmations.ts:67–70` | Supported |
| A1 delivery survives validation failure | Jini `bound-confirmations.ts:68–70` | Supported |
| A1 input approval consumed once | Jini `bound-confirmations.ts:203–208` | Supported |
| A2 verification precedes persistence | Jini `vault.service.ts:381–385` | Supported |
| A2 recovery binds different source/target sealers | Tovu `site-key-recovery.ts:169–175` | Supported |
| A2 recovery transaction rolls back writes | Tovu `vault-credential-recovery.ts:113–122` | Supported |
| A2 refusal tests assert unchanged storage | Jini `vault.service.test.ts:506–531` | Supported by reading |
| A3 bearer uses exact URL | Jini `pinned-capability.ts:60` | Supported |
| A3 pin remains immutable | Jini `pinned-capability.ts:61–65` | Incomplete; finding 7 |
| A3 delivery refuses redirects | Jini `pinned-capability.ts:103` | Supported |
| B1 no-ports page-tool denial | Tovu `visitor-executor.ts:123` | Supported |
| B1 eligibility and execution limits | Tovu `visitor-executor.ts:118–121` | Supported |
| B1 per-address budget precedes site budget | Tovu `visitor-tool-budgets.ts:42–45` | Supported |
| B2 predicate compares host without scheme | Tovu `same-origin.ts:17`, `:32` | Supported |
| B2 saved-keys route adds scheme equality | Tovu `site-share-password.ts:23–24` | Supported |
| B2 saved-keys route coverage missing | Two suites cited in finding 6 | Inventory incorrect |
| D1 principal equality precedes rewrite | Tovu `assistant-tool-exec.ts:216`, `:233–235` | Supported |
| D2 delegated credential gate depends on parsed body | Tovu `agent-daemon-scope.ts:1407`, `:1433`; Jini `run-credentials.ts:154` | Supported |
| D3 native comparison must become an injected port | Jini `http-kit/src/api-security-middleware.ts:83–87`; `core/src/token.ts:46–55` | Supported |

Of the review’s four highs, **A2-F1 and B1-F1 are independently supported**. For **C-F1**, the integration code confirms the disagreement between planner, argument builder and inheritance defaults (`native-tool-policy.ts:119–132`, `defs/shared.ts:66–78`, daemon `launch.ts:1433`). The cloud commit introducing the declaration was unavailable, so its exact change and proposed test were not independently verified. **C-F2’s version/date requirement exists** at `agent-runtime/src/types.ts:346–347`; the cloud stamp, executor evidence and actual CLI behaviour remain unverified. The dependency-age “safe” verdict also remains unverified here.

## Recurring mistake classes

- When generalising an identifier type, replace representation-dependent truthiness checks with explicit absence checks.
- When exposing a formerly constant setting as configurable policy, revisit every cache key and invalidation condition that assumed the constant.
- Treat accessors returning live internal objects as transfers of mutation authority; TypeScript `readonly` does not establish runtime immutability.
