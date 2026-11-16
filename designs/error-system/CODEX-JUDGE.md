Software Architect + Security(Review): **Verdict: needs rework.**

Reviewed design commit `bd9ff568` against the requested Tovu `80b00f5b` and Jini `02edbb68` refs. All source reads used Git; nothing was edited or checked out. I checked 32 `SITES.tsv` rows and ran one in-memory redaction probe. I did not build or run either repository’s test suite.

Below, **D** means `designs/error-system/DESIGN.md`; **J** paths are relative to Jini’s `packages/`; **T** paths are relative to Tovu’s root.

1. **Blocker — The disclosure policy cannot satisfy its stated security guarantees.**

   **Evidence:** D:194–207 permits a signed-in user to receive the redacted first line of an arbitrary backend error while promising no secrets or raw payloads. The existing formatter explicitly says that callers own disclosure and that redaction does not make private backend facts public-safe: J `core/src/user-facing-error.ts:25–28`. The redactor explicitly cannot detect names, addresses or business secrets: J `core/src/redact.ts:14–20`.

   An in-memory probe of the pinned redactor left these synthetic canaries unchanged:

   - `Private draft body: Acme merger closes Friday`
   - `customer memo: violet-unlisted-passphrase`
   - `GET https://vendor.test/read?q=private-draft`

   Tovu currently restricts backend-cause disclosure to the authorized export pilot: T `apps/website/src/server/inbound/admin-http/routes/system/site-share-errors.ts:75–101`. D6 acknowledges widening disclosure, but neither authentication nor lexical redaction establishes that a caller may read a particular backend fact. The same limitation invalidates the blanket “never request bodies/query strings” claim for host logs when those values are embedded in `error.message`.

   **Fix:** Keep arbitrary diagnostic text behind the host’s diagnostic policy. Define an explicitly approved user-safe cause projection, authorized for the operation and caller. Test ordinary private prose, payload excerpts and unlisted secrets—not only recognizable token shapes.

2. **Blocker — The catalog’s lookup contract cannot represent existing error ownership.**

   **Evidence:** D:143 specifies global class-first matching, newest part first, followed by `code`.

   Existing relationships are not one class → one code:

   - One `FormDeliveryError` class carries nine distinct codes: J `cms/src/forms/delivery/errors.ts:8–10,32–47`.
   - The same `ForbiddenError` class maps to domain-specific codes in T `apps/website/src/features/members/tool-registrations.ts:186` and `apps/website/src/features/post/tool-registrations.ts:305`.
   - Two classes legitimately share `PAGES_NOT_FOUND`: T `apps/website/src/features/pages/tool-registrations.ts:742`.

   Global class-first lookup cannot select a delivery code or the correct domain-specific refusal. The blanket duplicate-code rule at D:155 also lacks a representation for legitimate class aliases.

   **Fix:** Separate canonical code definitions from scoped class mappings. Specify domain selection, class-plus-discriminant matching, alias handling and precedence before E2. Add contract cases for all three relationships above.

3. **Major — Catalog adoption cannot preserve current model-facing explanations through the proposed unchanged rule interfaces.**

   **Evidence:** D:127–134 provides one fixed sentence plus placeholder values restricted to IDs and counts. D:153 preserves the existing rule interfaces; E5 promises byte-identical model-facing text.

   Current `ModelFacingErrorRule.message` is an optional **string**. Reclassification either uses that string or the original error’s message: J `core/src/model-facing-tool-errors.ts:30–53,108–115`. It cannot render a catalog template per error.

   A single `MemberValidationError` currently distinguishes invalid email from blank name: T `apps/website/src/features/members/write-service.ts:98,165`. Neither class has structured fields sufficient for the proposed template mechanism; `MemberValidationError` is an empty subclass at T `apps/website/src/features/members/types.ts:251`.

   **Fix:** Specify how existing safe dynamic messages survive registration. Either retain an explicit, domain-approved original-message mode or design structured variants and their migration. E5 needs multiple construction cases per class, not one snapshot per class.

4. **Major — The lowercase-code design contradicts the existing describer it claims to reuse.**

   **Evidence:** D:153 says the catalog feeds `createErrorDescriber`; D:156 says persisted kebab-case codes remain valid and only the built-in set retains the strict token rule. In reality, **custom registrations** are also validated against uppercase constant-token syntax: J `core/src/model-facing-tool-errors.ts:237–238,431–436`. Registering `rate-limited` throws.

   Thus E5’s first catalog adoption cannot use the unchanged implementation described in the design.

   **Fix:** Explicitly design the describer change or a mapping between persisted codes and log codes. Keep approval by enumerated vocabulary; do not replace it with shape-only acceptance.

5. **Major — E4 breaks existing incident-detail consumers before E6, and the N-1 proof checks the wrong direction.**

   **Evidence:** D:215 replaces `details.failure` with `ApiIncidentDetails`; E4 changes the producer before E6 changes UI handling.

   Existing consumers require `details.failure`:

   - T `apps/admin/src/lib/admin-failure-channel.ts:42–47`
   - T `apps/admin/src/features/sites/site-export-error.ts:25–31`

   The export adapter will discard the new incident fields, including their metadata. Merely proving that a **new decoder reads old envelopes** does not prove that a previously shipped client can consume the **new server response**.

   The “one function changes” claim at D:223 also overlooks `field: "message"` and extra-detail behavior owned by the current sender: T `apps/website/src/server/inbound/admin-http/routes/system/site-share-errors.ts:116–123,155–162`.

   **Fix:** Migrate all consumers first, preserve compatibility fields for the supported previous client generation, then change producers. Run previous-client fixtures against new responses, including export, message-field and extra-detail cases.

6. **Major — The host catalog never reaches the generic route status owner.**

   **Evidence:** D:154 adds an optional catalog to `statusForError`; E5 promises feature codes will stop accidentally returning 500.

   The real route response owner calls `statusForError({ error })` without a catalog: J `core/src/contracts/server/json-route.ts:149–150`. Parser failures, handler results and `ClientFacingError` all reach that owner at lines 225, 231, 244 and 254. Neither `jsonRoute` nor its internal call context carries the proposed catalog.

   Changing the helper alone preserves the current 500 fallback at every such call.

   **Fix:** Thread a typed status resolver or catalog through the existing route composition contract and update its callers and fakes in the same green step. Test a feature-specific refusal through `jsonRoute`, asserting the actual HTTP status.

7. **Major — Adding incident metadata to emitters does not deliver it through chat.**

   **Evidence:** E8 tests only emitted `error.code` and `error.requestId`.

   The daemon-frame consumer retains only the code and message, then constructs `new Error(message)`: J `chat/src/core/run-events/entry.ts:689–693`. The actual AG-UI consumer also constructs a plain `Error` from `event.message`: J `chat/src/core/assistant-client/ag-ui-transport.ts:74–80`. `RunHandlers.onError` currently accepts only `Error`: J `chat/src/core/transport.ts:45`.

   These paths discard the ID, action, cause, versions and time before the proposed notice can use them. A producer-level assertion can pass while Copy details remains incomplete.

   **Fix:** Include both transport consumers, the failure contract, stored projection and UI state in E8. Verify emitter → decoder → live notice → saved/reloaded failure. Preserve the existing clean-abort behavior separately.

8. **Major — E9 changes Electron rejection semantics without migrating the bridge consumers. It also targets the wrong sidecar branch.**

   **Evidence:** E9 catches thrown handlers and resolves `{ ok: false, error }`. Existing Electron bridges expect rejection on failure and domain values on success.

   For example, `getAppVersion()` is `Promise<string>`: T `apps/desktop/src/contracts/app-version.ts:5–7`. Preload forwards `ipcRenderer.invoke` directly at T `apps/desktop/src/preload/preload.mts:100`; the hook treats every resolved value as a version at T `apps/desktop/src/renderer/use-app-version.hooks.ts:31–36`. Under E9, its catch no longer runs and an error object becomes `version`.

   For sidecar IPC, `jsonIpcError` handles **frame parsing** at J `sidecar/src/json-ipc.ts:304–324`. Handler exceptions already use a separate sanitized `HANDLER_ERROR` branch at lines 352–368. Routing only `jsonIpcError` through the reporter leaves the actual handler-incident path unchanged.

   **Fix:** Specify preload unwrapping, typed bridge contracts and all affected consumers in E9. Preserve existing structured-result owners. Migrate sidecar parse refusals and handler incidents separately, with tests for both.

9. **Major — E1 introduces an unsafe and uncontained persistence callback.**

   **Evidence:** E1 accepts a policy-produced string after checking a “bounded code shape.” The existing log owner explicitly rejects shape as proof of safety because credentials can resemble codes: J `core/src/model-facing-tool-errors.ts:242–244`.

   E1 also lacks behavior for a throwing `describeError` callback. Existing policy callbacks are deliberately contained and fall back safely: J `infra/src/events/outbox/worker.ts:37–57,68–87`. A throw from the new call inside `recordOutcome` would escape; the batch loop awaits deliveries sequentially at lines 267–273, leaving later claimed rows unprocessed until recovery.

   The tests described at D:292 cover spaces, but neither code-shaped secrets nor callback failure.

   **Fix:** Make the domain return an explicitly allowlisted code, define the trust contract, and contain callback failure with the existing policy-failure mechanism. Test a code-shaped canary, synchronous throw, unknown delivery code, and a subsequent row in the same batch.

10. **Major — The promised persisted error ID has no storage or sweep design.**

    **Evidence:** D:200 and D:226 promise code/label **plus error ID**, with `reporter.record` called at failure time. No sweep step implements that lifecycle.

    Both outbox contracts currently expose only a string:

    - J `infra/src/events/outbox/ports.ts:12,27`
    - J `core/src/contracts/events/ports.ts:100,129–135`

    The host adapter forwards only those existing fields: T `apps/website/src/contracts/core/events/jini-outbox-adapter.ts:18–25`. The status projection parses the **entire** `lastError` as an exact code: J `cms/src/forms/delivery/status.ts:44`. Appending an ID to that string would recreate `delivery-failed`.

    Ordinary publish failure currently reaches `markFailed` without logging/reporting the original error: J `infra/src/events/outbox/worker.ts:119–136`. Wiring a logger sink in E3 does not intercept that branch.

    **Fix:** Assign a concrete step for recording ordinary delivery failures and storing their correlation IDs. Specify either a schema migration or another explicit association that preserves exact legacy codes, including adapter and status-view updates.

11. **Major — Several FP classifications are factually wrong, and the advertised parse exception cannot pass its claimed no-edit population.**

    **Evidence:**

    - `SITES.tsv:255` labels J `agent-runtime/src/providers/response-text.ts:19` a parse refusal. The try body reads an asynchronous stream, allocates buffers and checks a byte limit at lines 13–20.
    - `SITES.tsv:290` labels J `provider-plugins/src/payments-stripe/http.ts:54` a parse refusal. It catches the provider HTTP send and returns an uncertain payment outcome at lines 46–57.
    - Claimed no-edit parse sites contain additional validation statements: T `apps/desktop/src/renderer/SharedKeys.hooks.ts:134–137`, T `apps/website/src/assistant/byok-meta-tool-result.ts:89–94`, and T `apps/website/src/features/consent/config.ts:75–80`.

    These do not satisfy D:262’s single-parser-statement exception. Additionally, the independent ban on `new Error(...)` without cause conflicts with legitimate sanitized refusal sites such as T `apps/website/src/features/publish-content/backstop-service.ts:115–116`.

    **Fix:** Reclassify from complete try/catch ownership. Keep payment uncertainty distinct from parsing. Define consistent precedence across all three lint rules and use the claimed unchanged sites as executable rule fixtures before accepting E0’s baseline or estimates.

12. **Major — W1 cannot preserve the documented fallback behavior using the stated idioms.**

    **Evidence:** E7 calls all W1 edits behavior-preserving. D:279’s `absentWhen` instead rethrows errors outside listed codes/classes.

    Several W1 sites intentionally fall back on arbitrary failure:

    - Optional HEAD/GET download probes return `null`: T `apps/admin/src/features/sites/hooks/site-transfer-dependencies.hooks.ts:90–102`.
    - A failed daemon status probe falls back to recovery: T `apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts:425–432`.
    - An unavailable legacy-store dry-run still reports the store as available: T `apps/website/src/cli/commands/owner-store.ts:224–227`.

    `afterSettled` returns no fallback value; restricted `absentWhen` changes rejection behavior. No proposed idiom represents these contracts while retaining arbitrary-failure fallback.

    **Fix:** Keep these intentional fallback contracts explicit. Specify their permitted observation behavior and unchanged return values. Do not silently turn optional probes into user-visible failures to satisfy lint.

13. **Major — The i18n wire contract and browser catalog ownership are unfinished.**

    **Evidence:** D:237 promises `code + params`, but existing `ApiError` and `DecodedApiError` have no `params` field: J `protocol/src/errors.ts:33–39,81–102`. The proposed `ApiIncidentDetails` does not add it either.

    The browser is expected to import parts colocated with error classes. Existing model mappings can depend on server-side owners; for example, T `apps/website/src/features/post/tool-registrations.ts:299–305` registers classes declared in `post.ts`. “Imports only core” does not establish that importing a feature’s class-bearing module is browser-safe. D:366 admits this was unchecked.

    **Fix:** Define and validate the wire location of interpolation parameters and fallback behavior. Give browser-safe sentence data an explicit owner, with server class bindings composed separately. Verify browser import graphs and locale completeness against the actual exported sentence set.

14. **Minor — The owner-compliance claim contradicts the proposed signatures and E1 test.**

    **Evidence:** D:332 says new signatures comply, but D:276–279 specifies `observed(promise)`, `afterSettled(promise)` and callbacks as the second positional argument to `bestEffort`/`absentWhen`. These violate the required two-object boundary.

    E1’s CMS test explicitly uses the real infra worker, contrary to the supplied rule against testing with another package’s real implementation. The proposed `FormDeliveryError('rate-limited')` also differs from the actual required-object constructor at J `cms/src/forms/delivery/errors.ts:38–40`.

    **Fix:** Write the actual compliant signatures and package-local fake-based test contracts. Test infra persistence using a fake policy; test CMS classification using its own real error and fake boundary.

The following 20 FP rows were among the 32 source spot-checks. “Supported” means the local classification matched the inspected flow; it does not validate the proposed replacement or lint exception.

| TSV line | Real source site | Spot-check result |
|---:|---|---|
| 182 | J `admin/src/media/controllers/library.controller.ts:140` | Supported queue tail; returns original operation |
| 183 | J `admin/src/redirects/controllers/redirects.controller.ts:28` | Supported; mutation owns visible failure |
| 187 | J `agent-plugins/src/connect/executable/register.ts:124` | Supported queue tail |
| 198 | J `cms/src/forms/repo.memory.ts:190` | Supported queue tail; rollback rethrows |
| 202 | J `core/src/fetch/cache.ts:188` | Supported observation marker |
| 210 | J `diagnostics/src/observability/report-error.ts:97` | Supported reporting self-guard |
| 212 | J `infra/src/events/outbox/worker.ts:332` | Supported late-rejection observation |
| 227 | J `ui/src/features/resource-dashboard/react/components/ResourceRowList.tsx:94` | Supported; action state owns visible failure |
| 239 | J `admin/src/redirects/rules.ts:151` | Supported parse refusal |
| 240 | J `admin/src/security/rules.ts:45` | Refusal supported; proposed narrow parse exception insufficient |
| 249 | J `agent-plugins/src/connect/plugin-credential-card.ts:41` | Supported parse refusal |
| 255 | J `agent-runtime/src/providers/response-text.ts:19` | Incorrect: stream-read failure |
| 258 | J `cms/src/media/document-ingress.ts:221` | Supported parse refusal |
| 262 | J `cms/src/media/sanitize-svg.ts:58` | Supported UTF-8 refusal |
| 265 | J `core/src/list-page.ts:69` | Parse refusal includes base64 decoding helper |
| 277 | J `integrations/src/credentialed-http/auth-schemes.ts:44` | Supported parse refusal |
| 290 | J `provider-plugins/src/payments-stripe/http.ts:54` | Incorrect: uncertain transport outcome |
| 308 | T `apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx:1313` | Supported documented rescan fallback |
| 314 | T `apps/admin/src/features/sites/hooks/site-transfer-dependencies.hooks.ts:95` | Supported optional-probe fallback; replacement unspecified |
| 350 | T `apps/desktop/src/renderer/SharedKeys.hooks.ts:137` | Refusal supported; multiple-statement validation defeats stated exception |

I reproduced the TSV’s 525-row classification totals. I could not verify green intermediate commits, the proposed lint implementation, browser-safe catalog imports or the cost estimates: those implementations and proofs are absent.

## Recurring mistake classes

- **Redaction is not disclosure authorization.** A scrubbed diagnostic can still contain private payloads and business facts.
- **Error registration is a relation, not a one-to-one table.** Model class/code/domain cardinalities before defining lookup precedence.
- **Compatibility must be tested in both directions.** New readers accepting old responses does not prove old readers accept new responses.
- **Lint exemptions need executable examples.** Every site promised “unchanged” should pass the exact combined rules before the sweep is estimated.
- **Correlation metadata must survive consumer reconstruction.** Testing the emitted envelope is insufficient when downstream code creates a fresh plain `Error`.
