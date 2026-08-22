I’ll load the repository’s mandatory bootstrap instructions and the converged plan first, then inspect the actual working-tree diff and the specific boundary paths called out.

The plan confirms the handler layer—not the query layer—is the intended `handle` boundary. I’m now tracing both tool return paths and all error construction, then checking the three out-of-lease edits and architecture-count arithmetic from repository evidence.

A concrete boundary defect is present: if the indexed skill disappears or becomes unreadable before `capability_get`, Node’s filesystem error from `readFile(absolute)` propagates unchanged and includes the absolute host path. The success payload strips `handle`, but the error path does not sanitize it. I’m finishing the architecture and lease rulings before assigning severity.

Verifier(Cowork):

## Cowork Verification Scope Check

Reviewed the converged plan and actual working-tree implementation across all nine leased files, plus the three disclosed out-of-lease files. Traced both tool handlers, catalog queries, source reads, containment logic, manifest wiring, risk metadata, workspace flow, and architecture metric implementation.

I accepted the Coordinator’s independently rerun test and TypeScript results without repeating them. I independently calculated the current architecture API-surface count as 205.

## Verdict

REJECT

## Findings

- **blocker** — Absolute host paths can escape through `capability_get` errors. At [capability-tool-registrations.ts:209](/Users/la/Programming/Tovu/src/assistant/capability-tool-registrations.ts:209), `source.read()` errors propagate unchanged. The implementation reaches [capability-projection.ts:153](/Users/la/Programming/Tovu/src/features/agent-plugins/capability-projection.ts:153), where `readFile(absolute)` and `realpath(packageRoot)` can produce Node filesystem errors containing the absolute package path. A skill removed, permission-changed, or otherwise unreadable between catalog construction and retrieval therefore exposes `packageRoot` through the model-facing thrown error. The success paths correctly omit `handle`; `capability_search` errors do not expose it.

- **should-fix** — The load-bearing handler boundary has no direct regression test. [capability-catalog-query.test.ts:87](/Users/la/Programming/Tovu/src/assistant/__tests__/capability-catalog-query.test.ts:87) deliberately proves `get()` returns the complete card including `handle`; only the untested destructure at [capability-tool-registrations.ts:202](/Users/la/Programming/Tovu/src/assistant/capability-tool-registrations.ts:202) prevents success-path disclosure. A handler-level test should serialize both tool results and exercise a failing `read()` whose error contains an absolute sentinel path.

- **should-fix** — Other plan-critical handler behavior is likewise untested directly: shared in-flight-promise behavior, propagation of `routeDeps.workspaceId`, mismatch rejection, and the explicit “different `process.env.TOVU_WORKSPACE` has no effect” acceptance case. The implementation itself uses the correct promise and workspace-threading design at [capability-tool-registrations.ts:134](/Users/la/Programming/Tovu/src/assistant/capability-tool-registrations.ts:134) and [capability-tool-registrations.ts:173](/Users/la/Programming/Tovu/src/assistant/capability-tool-registrations.ts:173).

All other requested checks passed:

- Implementation follows the converged plan without substantive redesign.
- No capability workspace resolution uses `process.env`.
- Both tool IDs have `"none"` derived-risk metadata.
- `kind` filtering occurs in SQL before `LIMIT`.
- No underscore-based `sourceForToolId` derivation was copied.
- No fake handler was added to the real `ToolRegistry`.
- `read()` delegates to `readInstalledSkillMarkdown`; no duplicate containment implementation exists.
- Card IDs contain the digest, with `pluginId`, `skillName`, and `revision` first-class.
- Existing query tests assert exact errors where covered.

The architecture arithmetic is confirmed: checked-in baseline is 202; current tree is 205. The new server deep import exposes exactly one additional production file, `features/agent-plugins/capability-source.ts`, so removing this slice’s attributable addition yields 204. Thus the pre-existing stale delta is +2 and this slice’s delta is +1.

## Out-of-lease ruling

- `src/assistant/__tests__/tool-contribution-registry.test.ts` — **justified**. The exact contributor-list contract was mechanically invalidated by the authorized manifest registration.

- `src/assistant/__tests__/tool-registrations.contracts.test.ts` — **justified**. The always-wired catalog must join the existing cross-catalog contract sweep.

- `src/assistant/index.ts` — **justified**. It preserves the established assistant barrel boundary and limits this slice’s API-surface increase to 204→205 instead of exposing further assistant internals.

## Score

**8.0** — The architecture and main success paths closely match the plan, but a reproducible absolute-host-path disclosure remains in the agent-facing `capability_get` error path.

Top issues reducing the score: unsanitized filesystem errors and no direct handler-boundary/concurrency/workspace tests.

What would raise it to 10: sanitize or map `source.read()` failures to path-free model-facing errors, then add direct handler tests covering serialized success results, hostile failing-read messages, shared in-flight construction, and workspace threading.

<<COWORK_END>>