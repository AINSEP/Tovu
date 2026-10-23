Programmer(Execution), with Security review lens: loaded both requested canonical personas; selected for the held tool flow, widget integration and anonymous confirmation trust boundary.

Implementation is present and uncommitted. Validation is PARTIAL: tests/browser validation/coverage were not run, as dispatched. Coordinator owns commits and central certification.

Inputs: the 2026-10-22 visitor-tools design review (overrides design), original design, T1/J1 review, T2 review and T2 non-UI handoff under `/Users/la/Programming/Tovu/ADS-memory/reports/`, plus this checkout's landed T1/T2/UI implementation. The supplied task is the T3 authority; a separate SPEC-046 version/hash/certification was not supplied. Architecture sections 13/14 were read from the canonical Tovu workspace because their clone-local paths are absent. Graph MCP tools were unavailable; source reads/rg were used.

### Behaviour and boundaries

- Ask capabilities are advertised only with a visitor confirmation channel and a real settings value-row revision reader. Headless/legacy adapters fail closed for Ask; Auto and the policy-off rollback retain their existing owners.
- `tool_confirmation` extends `ClientDirective` and uses the existing `client_directive` SSE transport. The provider waits inside Jini's existing `onConfirm` / `resumeConfirmation` execution lifecycle; no model confirmation tool exists.
- A separate visitor-only Jini surface-exchange store owns expiry, buffering and cleanup. Its IDs are 128 random bits (`randomBytes(16)`, base64url), never the site's time-ordered IDs. The site adapter holds the turn, execution, input digest and value-row revision. Inputs are detached before execution. Reply consumption claims the challenge synchronously before awaiting validation, so duplicate clicks/replays cannot deliver twice.
- One same-origin JSON `POST /api/site-assistant/confirm` accepts exactly `{challengeId, allow}`. Trusted canonical origin comes from the existing origin registry, never the request Host. The route applies the public enable/rollback gate, an in-process reply limiter, strict shape/type checks and no-store responses. It never reaches an admin exchange.
- Revisions and input digests are checked after the click and immediately before the effect. A changed-and-restored policy still has a new value-row seq and refuses. Missing/corrupt/read-failed policy, wrong execution, decline, expiry and disconnect cannot grant execution. Existing attempt auditing records the terminal result. A policy change discovered inside the pre-effect handler is a `failed` audit with the uniform public refusal; ordinary decline/expiry records `confirmation-denied`.
- The server wait is capped at 60 seconds, followed by the existing 10-second handler timeout, under the browser's 90-second idle timeout. There is at most one prompt per turn and 20 per site process. The existing budgets conservatively charge at authorization, including declined Ask attempts.
- Both widgets project Allow/Cancel into their existing proposal strip, with native buttons, a status announcement, default Cancel focus, focus restoration and a local 60-second display deadline. Only the live directive callback populates this state. The transport consumes confirmation envelopes before transcript events; IDs are never persisted or sent in later provider history. Malformed and late envelopes are consumed too.
- No plugin, commerce, vendor, admin registry, general HTTP, credential or generated-code capability was added to visitor execution. Why-comments were retained/moved; obsolete factual descriptions were updated.

### Production files changed (why)

| Path | Purpose |
| --- | --- |
| `apps/website/src/assistant/site/client-directives.ts` | Add the documented union extension and human-only channel rationale. |
| `apps/website/src/assistant/site/visitor-confirmations.ts` | Visitor routing/bearer binding over Jini exchanges; claim-once replies and pending admission. |
| `apps/website/src/assistant/site/visitor-confirmation-gate.ts` | Resume Jini only after a real click; bind/recheck the settings revision, input and execution. |
| `apps/website/src/assistant/site/visitor-executor.ts` | Enable Ask with those ports; detach input; preserve uniform refusal/audit; move registration closures without deleting their rationale. |
| `apps/website/src/assistant/site/capability-registry.ts` | Correct the obsolete T1 Ask comment. |
| `apps/website/src/server/inbound/public-http/routes/site-assistant-confirm.ts` | The single visitor return route, with injected origin/enable/limiter/reporting/delivery ports. |
| `apps/website/src/server/runtime/composition/modules/site-assistant.ts` | Compose the separate store/secure IDs/deadlines/route and wire live SSE plus settings snapshots. |
| `apps/site-chat/src/tool-confirmation.ts` | Bounded directive parser and click-only relative reply request. |
| `apps/site-chat/src/site-assistant-transport.ts` | Live callback; strip challenge envelopes before transcript/history recording and clear on settlement. |
| `apps/site-chat/src/SiteToolConfirmation.hooks.ts` | React's transient prompt, click consumption, display expiry and focus lifecycle. |
| `apps/site-chat/src/SiteAssistantWidget.tsx` | Show Allow/Cancel in the existing proposal strip while a turn is running. |
| `apps/site-chat/src/vanilla-tool-confirmation.ts` | Project onto Jini's existing DOM strip, intercept tool clicks before its navigation handler, then restore the strip. |
| `apps/site-chat/src/vanilla-host.ts` | Wire that projection to the live transport callback. |
| `apps/admin/src/features/ai-assistant/VisitorToolsPanel.tsx` | Real Ask tooltip; extract default budget hint formatting to keep the touched file's limits editor at complexity ≤10. |
| `apps/admin/src/features/ai-assistant/visitor-tools-i18n.ts` | Remove the obsolete “not live / acts as Off” claim from English and all 21 translations. |

### Tests written or updated — exact paths to run

New runnable suites:

- `apps/website/src/assistant/site/__tests__/visitor-confirmations.unit.test.ts`
- `apps/website/src/assistant/site/__tests__/visitor-confirmation-gate.unit.test.ts`
- `apps/website/src/assistant/site/__tests__/visitor-executor-confirmation.unit.test.ts`
- `apps/website/src/server/inbound/public-http/routes/__tests__/site-assistant-confirm.unit.test.ts`
- `apps/site-chat/src/__tests__/tool-confirmation.test.ts`
- `apps/site-chat/src/__tests__/SiteToolConfirmation.hooks.test.ts`
- `apps/site-chat/src/__tests__/SiteAssistantWidget.confirmation.test.ts`
- `apps/site-chat/src/__tests__/vanilla-tool-confirmation.test.ts`
- `apps/site-chat/src/__tests__/vanilla-host.confirmation.test.ts`

Updated runnable suites:

- `apps/website/src/server/__tests__/site-assistant-routes.test.ts` — full held stream, fake provider, forged assistant history, trusted origin, real click, replay, handler effect count and no challenge in provider continuation.
- `apps/admin/src/features/ai-assistant/__tests__/VisitorToolsPanel.unit.test.tsx` — accessible tooltip description and direct budget-hint formatting branches.

Shared fake fixture (not a runnable suite): `apps/website/src/assistant/site/__tests__/visitor-confirmations.fixture.ts`. It uses the real Jini exchange store with fake clock/scheduler/IDs; no sleeping/processes. The route test uses the existing stub provider and test-server cleanup owners.

Regressions to include centrally:

- `apps/website/src/assistant/site/__tests__/visitor-executor.unit.test.ts`
- `apps/website/src/assistant/site/__tests__/visitor-tool-budgets.unit.test.ts`
- `apps/website/src/assistant/site/__tests__/visitor-tools.integration.test.ts`
- `apps/website/src/assistant/site/__tests__/capability-registry.test.ts`
- `apps/website/src/assistant/site/__tests__/client-directives.test.ts`
- `apps/site-chat/src/__tests__/site-assistant-transport.test.ts`
- `apps/site-chat/src/__tests__/SiteAssistantWidget.directives.test.ts`
- `apps/site-chat/src/__tests__/vanilla-host.adapters.test.ts`
- `apps/site-chat/src/__tests__/vanilla-host.test.ts`

Central runner must measure and enforce 100% branch/statement/function/line coverage per touched production file, including existing suites; no exclusions/suppressions were added. Browser keyboard/focus/screen-reader behaviour needs two lanes (React and vanilla). jsdom tests are written; they are not browser certification.

### Read-only validation and author review

- `tsc --noEmit --incremental false -p apps/site-chat/tsconfig.json`: PASS, including the new client tests.
- `tsc --noEmit --incremental false -p tsconfig.json`: FAIL from missing Jini exports/modules and other diagnostics outside the changed files; the captured check had no diagnostics in T3 source/test paths. This is not a green baseline or test certification.
- `tsc --noEmit --incremental false -p apps/admin/tsconfig.json`: FAIL; no diagnostics in the changed VisitorToolsPanel/i18n paths.
- ESLint with `--rule 'complexity: [error, 10]'`: changed implementation functions pass; remaining warnings concern unchanged neighbouring style/regex expressions. The composition module also passed the strict complexity check, with existing style warnings.
- `git diff --check`: PASS.
- Tests, installs, builds and browser runs: NOT RUN, per dispatch. No commit, push or subagent dispatch. All launched static-check processes were allowed to finish.

Raw logs: `ADS-memory/.local-artifacts/visitor-tools-t3/{lint.log,admin-tsc.log,root-tsc.log}`.

Reuse: waiting/resumption/cancellation uses Jini ToolExecutor; expiration/delivery/timer disposal uses Jini surface exchanges, inspected rather than copied. Policy snapshots use the landed settings owner; origin checks use the existing verified-origin owner; counting uses the existing HTTP-kit limiter. Widgets use their existing proposal strips and transport callback boundary; no new SSE event or card system.

Architecture audit: WARNING. The visitor/admin registry and exchange boundaries remain separate, policy snapshots stay with settings, dependencies are ports, and no provider/plugin imports enter core. The vanilla ABI has no live prompt-rendering seam: this site's thin adapter relies on Jini's current proposal DOM classes. Coordinator should review that coupling and route a public `@jini-ai/chat` extension seam before broader reuse. It is recorded in `ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md`; no unwritable sibling Jini files or node_modules were changed.

Function-quality author review: broker/gate/route/transport controls have no other recorded findings after local splits and bound checks. The vanilla projection has a Recommended ownership/markup-coupling finding; the smallest follow-up is a public Jini projection port. Type/runtime/coverage claims remain limited by the unexecuted tests and the failing wider type checks. No certified test was deleted or weakened.

Next assignees: Coordinator/Central TestRunner runs the exact suites, reconciles Jini dependency exports, enforces per-file coverage, and performs the two browser lanes; Code Inspection/Security checks the nonce, settings revision and vanilla seam before integration. Coordinator commits only after review under the dispatch's commit ownership.
