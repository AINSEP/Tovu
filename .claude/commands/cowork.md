# Cowork Command (/cowork)

## Purpose
Coordinate multiple LLMs on a bounded file-editing task. Unlike `/debate`, this command is not reasoning-only. Unlike `/audit-work`, this command allows implementation work. All participants read the full scoped file set, independently design or diagnose the whole change without seeing each other's proposals, compare blind spots and disagreements, converge on one shared edit plan, then a single writer implements that plan while the non-writers verify the diff. File leases are merge-control only; they must not be used to partition the design problem, assign isolated slices, or bypass whole-team planning.

## Usage
Provide a bounded task and either explicit files or enough detail for the Coordinator to propose a file scope before writes.

## Arguments
- `[controls] [task]`
- `controls` (optional):
  - `files=<path1,path2,...>`: required for autonomous write execution; if omitted, the Coordinator must propose a scope and ask for confirmation before writes
  - `peers=<claude,gemini,codex>`: peer CLIs to include; default is available external peer CLIs, preferring different model families from the current host
  - `risk=<auto|low|medium|high>`: risk tier; default `auto`; when `auto`, the Coordinator resolves the tier from participant recommendations and change characteristics, using the highest justified tier
  - `approval=<plan|auto>`: default `plan`; `auto` is allowed only when the user explicitly provided it in this invocation
  - `audit=<auto|skip|require>`: default `auto`; `require` means audit must run and skip is not available regardless of conditions; `skip` is honored only when the audit-skip policy is satisfied
  - `max_retry_cycles=<1|2>`: default `1`; applies independently to peer-verification retries and test-gate retries, not as one shared total budget
  - `max_correction_rounds=<1|2>`: default `1`; number of post-audit correction rounds; independent from peer-verification and test-gate retry budgets
  - `cowork_timeout_seconds=<int>`: total peer-dispatch budget; default `600` for implementation-heavy cowork
  - `test_command=<command>`: explicit verification command; if omitted, infer a safe project test command or report that no automated test gate was found
  - `claude_model=<exact-id>`, `gemini_model=<exact-id>`, `codex_model=<exact-id>`: optional per-run model pins
- `task`: the concrete change to make

---

**Directive:**
Act as a Cowork Coordinator. Prefix user-facing updates with `Coordinator(Cowork):`.

This is a collaborative implementation workflow, not Swarm Consensus debate and not External Audit.

Core collaboration invariant:
- Every participant must reason about the whole scoped task before any write lease is assigned.
- `/cowork` is not parallel subagent decomposition. Do not split the problem into independent model-owned slices as a substitute for shared planning.
- Use peers to expose blind spots in the full design, coverage, traps, edge cases, and validation strategy before implementation.
- Freeze independent proposals before any participant sees another participant's proposal. This prevents anchoring on the first model's design.
- Assign one writer for the agreed plan by default. Use multi-writer leases only when the user explicitly asks for parallel implementation or the Coordinator states a concrete reason it is safer.
- Assign file leases only after the shared design is settled, and only to prevent conflicting edits during implementation.

1. Parse `$ARGUMENTS`.
   - Extract controls listed above.
   - Treat remaining text as the task.
   - If `files=` is omitted, inspect the repo enough to propose a bounded file list, then stop and ask the user to approve or revise the scope before any write-capable peer dispatch.
   - If the task is broad enough that the file set cannot be bounded, stop and ask for scope narrowing. `/cowork` is for small, reviewable file sets.
   - If the user asks to abort before writes begin, stop with no file changes. If the user asks to abort after cowork writes begin, restore in-scope files from the saved baseline when safe, report what was restored, and preserve unrelated worktree changes.

2. Run peer and model preflight.
   - Use `<AI_DEV_SHOP_ROOT>/skills/llm-operations/references/peer-llm-dispatch.md` for peer CLI transport, diagnostics, and failure classification.
   - Apply the `Model Memory Map` in that reference before declaring any peer model unresolved. This is mandatory for `/cowork`; do not rely on CLI version output alone.
   - Detect available peer CLIs: `claude`, `gemini`, and `codex`.
   - Select peers from `peers=` if provided; otherwise select available external peer CLIs, preferring different model families from the current host.
   - Minimum viable cowork is the primary model plus at least one external peer. If no external peer is available, stop and ask whether to proceed as single-agent implementation instead; do not call it `/cowork`.
   - Resolve exact model identity for each selected peer using per-run pins first, then project knowledge and AI Dev Shop repo-local evidence, then home CLI defaults, and finally fresh smoke-test proof where required.
   - Project/repo evidence includes retained or local smoke-test caches, recent smoke-test reports, retained or local consensus reports, and bounded peer-dispatch packets under `tmp/peer-dispatch/`.
   - For Gemini, inspect the saved local preference in `~/.gemini/settings.json` at `model.name` before asking the user to pin `gemini_model=...`.
   - For Claude, inspect `<ADS_MEMORY_ROOT>/reports/swarm-consensus/smoke-tests/last-known-good.json` and the legacy local cache before asking the user to pin `claude_model=...`; if only stale exact evidence is found, report the saved preference and the staleness reason instead of saying the model is unknown.
   - If Claude rejects an alias, do not accept a lower-version `Try --model ...` suggestion until the Model Memory Map and `--model-plan-only` have been checked for an exact saved `command_model`.
   - If a selected peer's exact model cannot be proven, print a model confirmation gate before dispatch:
     `Planned cowork peers: Claude=<resolved-or-inferred>, Gemini=<resolved-or-inferred>, Codex=<resolved-or-inferred>. Reply with "run" to proceed or override with claude_model=..., gemini_model=..., codex_model=....`
   - CLI version strings are diagnostics only. Do not present CLI versions as model identities.
   - Maintain a participant status table from this point forward with: role, CLI, resolved model, CLI version, transport, status, failure class, and retry count.

3. Protect the worktree before any writes.
   - Run `git status --short`.
   - Separate in-scope files from unrelated dirty worktree changes. Do not revert or overwrite unrelated changes.
   - For every in-scope file, save a baseline copy and content hash under `<ADS_MEMORY_ROOT>/.local-artifacts/cowork/runs/<timestamp>/baseline/`.
   - Save the initial in-scope diff, if any, under the same run folder so pre-existing user edits can be restored on abort.
   - Before each write step, re-check the scoped file hashes. If a scoped file changed outside the cowork workflow, stop and ask the user how to proceed.

4. Build the shared context packet.
   - Include the task, controls, selected peer models, risk assumptions, scoped file paths, baseline hashes, and full content of every scoped file.
   - Include relevant test files or commands when they are obvious from repo conventions.
   - Save local-only context by default to `<ADS_MEMORY_ROOT>/.local-artifacts/cowork/runs/<timestamp>/context.md`.
   - If the user explicitly asks to retain the packet, save it under `<ADS_MEMORY_ROOT>/reports/cowork/runs/<timestamp>/context.md`.
   - Give every participant the same context packet. Do not let one model reason from hidden extra file content unless the Coordinator adds that content to the shared packet first.
   - Before expensive peer dispatch, run a cheap readability probe if a peer is asked to read the packet by path. The probe must ask for a deterministic value such as the first Markdown heading.
   - Treat that probe as the Peer Handshake Gate: require packet-bound ACK within 60 seconds by default, using `ACK_PACKET_RECEIVED <packet-id or deterministic packet marker> -- I received the packet and will work on it.`
   - Start `cowork_timeout_seconds` only after peer handshakes succeed or failed peers are explicitly classified and excluded.
   - If the probe fails, classify it as `path_or_permission_failure`, fix transport, and retry once before spending the full task prompt.
   - Prefer self-contained `stdin` transport for small and medium packets. Do not force peer CLIs to read sibling project-knowledge paths that may be outside their workspace allowlist.
   - In subfolder installs where `<ADS_MEMORY_ROOT>` is a sibling of `<AI_DEV_SHOP_ROOT>`, use an in-repo dispatch copy such as `<AI_DEV_SHOP_ROOT>/tmp/peer-dispatch/cowork/<timestamp>/context.md` when file transport is required.
   - Gemini CLI requires an argument for `-p/--prompt`; when using stdin, provide a short `-p "<task prompt>"` and pipe the packet on stdin because stdin is appended to the prompt.
   - Record both the authoring packet path and the dispatch transport used in the final report.
   - Prefer structured output modes when available.
   - Parse `stdout` only as the peer answer; treat `stderr` as diagnostics.
   - Save raw stdout/stderr captures under the cowork run folder.
   - Retry transient failures such as `429`, `503`, provider-capacity errors, and `empty_result_transport_failure` within `cowork_timeout_seconds`.
   - Only classify `empty_result_transport_failure` after the peer process exits successfully and stdout still contains no usable answer.
   - If a peer reports it could not access a required file, packet, URL, or artifact needed for the task, mark that peer as `Resource unavailable` for that phase. Do not synthesize a proposal that was built from assumptions about missing resources.

5. Independent co-design phase, read-only.
   - The primary model must produce and freeze its own whole-task proposal before reading peer proposals.
   - No participant may see another participant's proposal, summary, or conclusions until all available proposals for this phase are frozen.
   - Save each participant's raw proposal before synthesis so later convergence can be audited for anchoring or omitted dissent.
   - Peer-dispatch packets for the independent proposal phase must contain only shared facts: task, scope, approved constraints, baseline hashes, relevant file contents, and any user-approved common synthesis from earlier workflows. They must not include the Primary proposal, another peer's proposal, proposal summaries, selected plan elements, comparison ledgers, or filenames/sections that expose them.
   - Before independent peer dispatch, run a contamination preflight on the exact packet being sent. At minimum, fail the packet if it contains phrases such as `Primary Frozen Proposal`, `primary-proposal`, `comparison ledger`, `selected proposal elements`, `Claude position`, `Gemini position`, or any prior peer proposal heading from the same cowork phase. If contamination is found, stop dispatch, quarantine any partial outputs as invalid, regenerate an unbiased packet, and report the correction to the user.
   - Dispatch selected peers in read-only or plan mode where supported. If a peer CLI cannot enforce read-only mode, the prompt must explicitly forbid edits in this phase.
   - The default is co-design, not independent full-file drafting. Participants should design everything the task requires at the right semantic level: architecture choices, eval dimensions, traps, acceptance criteria, patch strategy, edge cases, or file structure.
   - Do not ask every participant to draft full target files or unified diffs by default; that is token-expensive and usually redundant.
   - Require independent artifact drafts only when the user explicitly asks for them or when the Coordinator states that file-level wording itself is the core design risk.
   - If independent artifact drafts are used, they are proposal artifacts only and must not be applied to the worktree during this phase.
   - Require every participant to return:
     - `Cowork Scope Check`: what it believes the task is, which files/artifacts/context it actually reviewed, and any mismatch or uncertainty
     - reasoning flaws or implementation defects found
     - whole-task proposal covering all scoped outputs, not only a preferred slice
     - concrete design details sufficient for one final writer to implement the agreed output
     - proposed changes with file and line references where possible
     - blind spots, traps, edge cases, and validation gaps the other models are likely to miss
     - strengths: what should remain unchanged or be preserved in the plan
     - risk tier recommendation
     - tests or checks that should prove the change
   - Do not invent missing peer responses. If a peer fails, classify the failure and continue only if minimum viable cowork still holds.
   - If after failures or withdrawals only the primary model remains, stop or ask the user whether to continue as single-agent implementation. Do not call the result `/cowork`.

6. Compare, challenge, and converge on the shared edit plan.
   - Build a comparison ledger from the frozen proposals before deciding the final plan.
   - For content-heavy tasks, compare the concrete design decisions each participant proposed, not just abstract recommendations. The ledger must identify which proposal has stronger coverage, clearer traps, better controls, cleaner file structure, and better validation behavior.
   - The comparison ledger must call out agreements, disagreements, unique insights, suspected blind spots, and any proposal that appears to overfit to its own assumptions.
   - Treat the comparison ledger like a debate decision-point ledger: each disputed design point must name the competing positions, the strongest reason for each position, and what evidence would change the decision.
   - For design-heavy, coverage-heavy, or trap-heavy work, run at least one bounded challenge round after the independent proposals are frozen. Share only the comparison ledger or summarized deltas, then ask participants what they would change and what they believe the final design still misses.
   - Challenge-round prompts must require each participant to state: current position, why it holds that position, the strongest reason against it, whether its position changed, and what evidence would change its mind.
   - If a participant fails, times out, or reports a resource failure during a challenge round after contributing an independent proposal, mark it as `Withdrawn` for later rounds. Its frozen proposal remains in the ledger but do not invent its rebuttal.
   - Do not average votes. Weight convergence by grounded evidence, repo facts, validator constraints, and risk impact.
   - Synthesize the frozen proposals and challenge-round input into one plan.
   - Apply the **Solution Slate Protocol** from `skills/llm-operations/references/peer-llm-dispatch.md`: present the reconciled options as a ranked correction/design slate (≥2 options where they exist, explicit ranking criteria, per-option trade-offs, a recommendation + cheapest de-risking step) BEFORE any correction is applied to the worktree.
   - Reconcile the whole-task proposals before assigning the writer or file leases. The plan must reflect the best shared design, not a collage of isolated model-owned parts.
   - Do not use leases to let one model own the design of a suite, subsystem, trap set, coverage matrix, or other semantic slice unless every participant has first reviewed and shaped that slice as part of the whole plan.
   - The plan must include:
     - scoped files
     - risk tier; when `risk=auto`, use the highest justified tier from participant recommendations and change characteristics
     - shared design decisions, including traps, edge cases, and validation strategy where relevant
     - selected proposal elements that will seed the final implementation
     - final writer selection and rationale
     - file-level lease map, normally assigning all in-scope files to the single final writer
     - intended changes per file
     - acceptance checks
     - known disagreements and their resolution rationale
     - audit expectation from the audit-skip policy
   - Use single-writer implementation by default. If multiple writers are proposed, state why single-writer is insufficient and ask for user approval before writes.
   - Use file-level leases for v1. Hunk-level leases are out of scope unless the user explicitly asks for experimental behavior.
   - If participants cannot converge within two plan rounds, stop and present the competing proposals plus the disagreement ledger.
   - Default `approval=plan`: show the plan and ask the user to approve before writes.
   - If `approval=auto` was explicitly provided, proceed without the plan approval pause, but still print the plan before writes.

7. Write under leases.
   - The final writer implements the agreed shared plan for all leased files; the writer does not independently redesign the solution after convergence.
   - A participant may modify only files it owns in the lease map.
   - If the user approved multiple writer peers, use isolated worktrees or another proven isolation mechanism. Do not run unconstrained writer CLIs concurrently in the same worktree.
   - If writing in the main worktree, run write leases sequentially unless the tooling can enforce disjoint file writes.
   - Prefer peer-native file edits only when the CLI can be constrained to the leased file set. Otherwise, ask the peer to return a unified diff for its leased files and have the Coordinator apply that diff.
   - After each writer returns, inspect `git diff --name-only` for out-of-lease changes. Out-of-lease writes are a protocol violation: stop, restore only the violating cowork changes from the saved baseline when safe, and record the violation in the disagreement ledger.
   - Scope expansion requires user approval before any new file is read into the shared context or modified.

8. Peer verification phase.
   - Dispatch all non-writers to verify the diff against the shared edit plan and current file state.
   - Verification must check whether the single writer preserved the converged design, not merely whether the diff is syntactically plausible.
   - Require every verifier to begin with a `Cowork Verification Scope Check` stating which diff/files/artifacts it actually reviewed.
   - Require explicit `APPROVE` or `REJECT` with reasons.
   - A rejection must identify the violated plan item, changed behavior, missed edge case, test gap, or audit-blocking uncertainty.
   - Verification findings must be classified as `blocker`, `should-fix`, or `optional`; only blockers prevent completion, but should-fix items must be acknowledged in the final synthesis.
   - **Scoring Gate (mandatory):** Every verifier must include a numerical score (1-10) with:
     - The score and one-sentence rationale (required even for a 10)
     - Top issues that reduced the score (if < 10)
     - What specifically would raise the score to 10 (if < 10)
   - Score/vote precedence: an explicit `REJECT` is always binding regardless of score. Additionally, a score below the risk-tier floor is treated as a `REJECT` even if the verifier said APPROVE.
   - **Risk-tiered score floor:** low risk = 7, medium/high risk = 8.5. A score below the applicable floor triggers a correction cycle.
   - Scores at or above the floor with APPROVE: pass. The "path to 10" items are surfaced as `should-fix` in the final output but do NOT trigger re-verification.
   - If a verifier omits a score, returns a non-numeric value, or provides an out-of-range number, retry the verification request once with an explicit score reminder. If still missing, treat that verifier's response as abstained and note it in the final output.
   - Scores are included in the final output's verifier votes section.
   - Give the writer at most `max_retry_cycles` peer-verification retry cycles for that file. If verification still fails, restore the cowork baseline for in-scope files, present the disagreement ledger, and stop.

9. Test and formatting gate.
   - Run `test_command` if provided.
   - If omitted, infer the narrowest safe test/format/lint command from project evidence. If no automated command can be inferred, say so plainly.
   - If tests fail, classify failures by likely owner file or lease.
   - Give the cowork run at most `max_retry_cycles` test-gate retry cycles for test failures. This budget is separate from peer-verification retries. If failures persist, restore the cowork baseline for in-scope files, present failure clusters and the disagreement ledger, and stop.

10. Run `/audit-work` on the implementation.
   - After tests pass, run `/audit-work` inline as a built-in cowork guardrail. This is not optional by default.
   - Use the diff from the saved cowork baseline hashes to current in-scope files as the audit input. Exclude unrelated dirty worktree changes and preserve any initial in-scope diff separately.
   - Use `suggest_changes=patches`.
   - Prefer a different model family from the writer for the auditor. If no external auditor is available, invoke the primary model in a fresh context/session so it does not rubber-stamp its own prior output.
   - When same-family audit is used, disclose it in the final output. For medium/high risk, require user confirmation before proceeding with a same-family auditor.
   - The audit examines the actual implemented diff, not the plan. It catches mistakes that only surface in written code: logic errors, missed edge cases, regressions, style violations, and plan-drift the peer verifiers may have missed.
   - The `/audit-work` scoring gate applies here: the auditor must return a 1-10 score. An audit score below the risk-tier floor (low=7, medium/high=8.5) becomes a normalized `blocker` for correction rounds. Scores at or above the floor are advisory — the "path to 10" items are surfaced as `should-fix` but do not block. A score of 10 with no findings skips correction rounds.
   - If the auditor omits a score, returns a non-numeric value, or provides an out-of-range number, treat it as a malformed response: retry once with an explicit score reminder, then classify as `degraded coverage` if still missing.
   - The Coordinator normalizes audit findings into `blocker`, `should-fix`, or `optional` while preserving the auditor's original wording and severity rationale.
   - Present the full normalized audit findings to the user and the writer before correction rounds begin.
   - Audit-skip policy: `/audit-work` may be skipped only when `audit=skip` is explicitly provided AND all of these hold:
     - risk tier is `low`
     - the change does not involve security, authentication, authorization, data integrity, schema migration, payment, public API contract, dependency/infra, concurrency, or architecture-sensitive areas
     - no unresolved or material resolved disagreement remains in the ledger
     - all peer verifiers approved their non-owned diffs
     - no out-of-lease writes occurred
     - automated tests/checks passed
   - If `audit=skip` conflicts with the policy, do not silently skip. Report that the requested skip is blocked, explain why, and proceed with running the audit.

11. Correction rounds.
   - After the audit report is delivered, run up to `max_correction_rounds` correction rounds (default 1, max 2).
   - In each round, present the audit findings (classified as `blocker`, `should-fix`, or `optional`) to the writer.
   - The writer reviews each finding and states whether it agrees or disagrees, with reasoning.
   - The writer applies only the corrections it agrees with. It must not blindly accept all suggestions — the point is selective, reasoned correction.
   - If the writer disagrees with a finding, it must state why. Disagreements are recorded in the disagreement ledger.
   - After each correction round, re-run the step 9 test gate. If tests fail, the writer gets one test-fix attempt within the same round. If the test-fix attempt also fails, restore the cowork baseline for in-scope files when safe, report the correction failure and disagreement ledger, and stop.
   - After each correction round that produced changes, the Coordinator performs a targeted self-verification pass on the correction diff. This is a zero-external-token check using the Coordinator's existing context. It verifies exactly two things:
     1. Each accepted fix actually resolves the finding it addressed.
     2. The correction diff does not introduce obvious contradictions with adjacent steps or the converged plan.
   - If the self-verification spots a problem, flag it as an unresolved blocker for the user rather than triggering another correction cycle.
   - If blockers from the audit remain unaddressed after all correction rounds (writer disagreed with a blocker), flag this prominently in the final output for user decision.
   - If no audit findings require changes (clean audit), skip correction rounds and proceed to final output.
   - **Escalation ceiling (hard cap):** Total scoring attempts across the entire cowork run (peer verification + audit + correction re-scores) must not exceed 3 per file. On hitting the ceiling:
     1. Do NOT restore baseline or discard the work.
     2. Keep the current state of the files as-is.
     3. Record all unresolved findings in a `## Human Escalation` section in the final output with: the remaining blocker text, which peer raised it, the score delta from the floor, and what was already attempted.
     4. Mark the cowork run status as `ESCALATED — requires human decision` (not failed).
     5. The human decides whether to accept as-is, apply specific remaining fixes, or revert.

12. Final output.
   - Include:
     - participants and resolved model identities
     - participant status table with transport, failures, withdrawals, and retries
     - scoped files
     - authoring packet path and dispatch transport
     - baseline snapshot location
     - file lease map
     - summary of changes
     - disagreement ledger
     - challenge-round trace for design-heavy work
     - verifier votes (must include each verifier's 1-10 score, rationale, and path-to-10)
     - tests/checks run and results
     - audit findings summary (auditor family, same-family disclosure if applicable, auditor score)
     - correction rounds: what was accepted, what was rejected, and why
     - self-verification results
     - unresolved blockers (if any) requiring user decision
     - remaining risks or manual follow-up
   - If the run reverted to baseline, state that no cowork changes remain applied and include the reason.
   - Keep the final answer decision-ready and concise.
