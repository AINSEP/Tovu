# Spec Manifest: desktop-app-chat

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-051 |
| feature_name | FEAT-051-desktop-app-chat |
| version | 0.1.2 |
| last_edited | 2026-09-16T00:00:00Z |
| spec_naming | standard |
| spec_root | ADS-memory/specs/051-desktop-app-chat |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** This manifest is the package index for the strict Speckit compatibility flow.

It exists to make downstream stages read the full package instead of guessing filenames from memory.

Use it to answer:
- which spec files actually exist for this feature
- which files were intentionally omitted and why
- which files Software Architect, TDD, and Programmer must read

**Companion-package provenance.** `feature.spec.md` v0.1.2 was written and approved on its own (2026-09-12/13); the six files beside it in this folder were drafted 2026-09-16 by the `w4-spec051-designs` agent from that approved text plus a fresh re-verification pass against the working tree. `feature.spec.md` itself was **not edited**, so its `content_hash` and APPROVED status stand unchanged. Where a companion file would have had to guess an answer to OQ-01, OQ-02 or OQ-03, it carries an explicit `[OQ-0N OPEN]` marker instead of a guess.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec, APPROVED by the owner 2026-09-12, v0.1.2 |
| `api.spec.md` | PRESENT | `api.spec.md` | REQ-06 adds a new authenticated inbound HTTP route to the site daemon, plus a proxy mount; REQ-10 adds five IPC invoke channels and two push channels. Both are contracts a second team could get wrong |
| `state.spec.md` | OMITTED | — | REQ-18 explicitly confirms the feature introduces no new durable store: conversations persist through the already-built `useRunnerConversations`/sqlite store, unmodified, and no site's own transcript store is touched. The only new state is per-turn and in-memory (the turn's frozen tool set, REQ-05/INV-04), which behavior.spec.md §1 specifies as a precedence rule rather than a durable shape |
| `orchestrator.spec.md` | OMITTED | — | REQ-01/INV-01 require exactly one agent loop, run by `@jini-ai/daemon`'s existing `AgentExecutor`/`RunLifecycle` ported from Tovu-Runner. This feature introduces no coordinator of its own; the sequencing it does add (turn-start tool-set assembly, confirmation pause/resume) is specified as behavior rules in behavior.spec.md §1 and §4 |
| `ui.spec.md` | PRESENT | `ui.spec.md` | REQ-12 through REQ-17 and REQ-21 are a UI contract: a responsive docked/overlay panel, an embed signal that hides a component, a JS-driven layout switch, and an inline confirmation affordance |
| `errors.spec.md` | PRESENT | `errors.spec.md` | REQ-07, REQ-09 and REQ-19 all turn on refusals being caller-facing and named rather than silent or hanging. Those refusal texts are the contract |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | The Behavior Summary table in `feature.spec.md` is a precedence rule set (which context yields which tool set), REQ-05/INV-04 is an ordering rule, and REQ-11/REQ-19 define pause/degrade sequencing |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds REQ/AC/INV/EC coverage mapping before TDD. Every row is `PENDING` — nothing is implemented |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index for downstream stages |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `feature.spec.md`, `traceability.spec.md`, `spec-dod.md`, `api.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, plus `ADS-memory/.local-artifacts/agent-reports/2026-09-16-w4-spec051-designs.md` (the OQ-01/02/03 option analysis and the REQ-11 mechanism correction this package's markers refer to) |
| `tdd` | `feature.spec.md`, `traceability.spec.md`, `spec-dod.md`, `behavior.spec.md`, `errors.spec.md`, ADR, tasks |
| `programmer` | `feature.spec.md`, `traceability.spec.md`, `api.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, ADR, certified tests |

---

## Brownfield / Reverse-Spec References

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `ADS-memory/reports/2026-09-12-desktop-global-chat-recon.md` | source touchpoint | The recon this spec was built from. Addendum 4 is current design; Addendum 3 §4/§5 is superseded |
| `ADS-memory/.local-artifacts/agent-reports/2026-09-16-w4-spec051-designs.md` | source touchpoint | Re-verification of the 10 worklist blockers, the OQ-01/02/03 option sets, and the correction that E2 is wrong (the five invoke channels ARE registered, as throwing stubs) |
| `apps/desktop/src/contracts/workspace-chat.ts` | source touchpoint | The seven IPC channels REQ-10 must answer, and `mcpToolNameForVerb`'s dot-to-underscore mapping both ends depend on |
| `apps/desktop/src/runner-ipc-stubs.ts` | source touchpoint | Registers all five `workspace:chat:*` invoke channels as deliberately-throwing stubs. REQ-10 must REMOVE those five names from `RUNNER_STUB_CHANNELS`: `ipcMain.handle` throws on a duplicate registration |
| `apps/desktop/src/contracts/sections.ts` | source touchpoint | The 29-verb `desktop.*` taxonomy REQ-02 draws from, and `visibleSections()`/`runnerToolNames()`, the two derivations OQ-01 chooses between |
| `apps/desktop/src/contracts/site-assistant-tools.ts` | source touchpoint | The reverse-direction allowlist, and the owner's recorded parity ruling plus the empty `WORKSPACE_ONLY_VERBS`/`WORKSPACE_ONLY_NAMESPACES` re-narrowing seam — the precedent OQ-01 option B would follow |
| `apps/website/src/assistant/mcp-ui-tool-calls-route.ts` | source touchpoint | The already-shipped, non-run-scoped, allowlisted inbound tool-execution route REQ-06 should be a sibling of (OQ-03 option A) |
| `apps/website/src/assistant/mcp-ui-tool-calls.ts` | source touchpoint | `MCP_UI_REDEEMABLE_TOOL_IDS` and its per-entry-justification discipline — the model for REQ-07's allowlist (OQ-02) |
| `apps/website/src/assistant/pending-confirmations.ts` | source touchpoint | Records why `descriptor.requiresConfirmation` with no `ExecutionDelegate` "is not a weaker version of this mechanism; it is a hang". Directly contradicts REQ-11 as written |
| `apps/website/src/assistant/frontend-control-capabilities.ts` | source touchpoint | Why `chat.reset_conversation` is filtered out of the admin capability set today — the same property REQ-11 must not reintroduce |
| `apps/website/src/server/runtime/composition/modules/assistant.ts` | source touchpoint | The session-authenticated proxy mount pattern REQ-06's route reuses (`requireAdminSession` then forward) |
| `apps/desktop/src/desktop-auth.ts`, `apps/desktop/main.ts` | source touchpoint | `sitePartition`/`ensureSiteSession` (the credential REQ-06 authenticates with) and `openSitesHomeWindow` (which takes no `partition`, so the top-level renderer holds no site cookie) |
| `apps/website/src/assistant/byok-tool-surface.ts` | source touchpoint | States the site catalog's real size — 131 tools, 21 domains — which is the constraint that rules out a full-catalog answer to OQ-02 |
| `/Users/la/Programming/Tovu-Runner/src/main/runner-daemon.ts`, `runner-tools.ts`, `runner-agent-prompt.ts` | source touchpoint | REQ-10's port reference. Note that Tovu-Runner depends on Jini via `file:../Jini/packages/*`; `apps/desktop` depends on registry versions and must not inherit that |

---

## Validation Notes

- Validator last run: not-run
- Validator result: FAIL
- Validator manual waiver: N/A
- Canonical hash verified at: not-run
- Notes: The drafting agent was dispatched read-only for source and explicitly instructed not to run test suites, builds, typechecks or gates while other agents held the test slots, so `validate_spec_package.py --phase spec` has not been executed against this package. **Running it is the first action for whoever picks this up.** `feature.spec.md` was not edited while these companions were written, so its recorded `content_hash` (`sha256:cbd3265b...`) should still verify; the validator is what proves that. Three `[OQ-0N OPEN]` markers remain across `api.spec.md`, `behavior.spec.md` and `errors.spec.md`; they are Open Questions with owners and dates (2026-09-19), not `[NEEDS CLARIFICATION]` markers, and do not block the validator.
