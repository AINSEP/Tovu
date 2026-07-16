# External Audit Command (/audit-work)

## Purpose
To package the current work for one or more external LLM auditors, collect their independent reviews, and return a decision-ready synthesis that tells the user what each auditor said, where auditors agree or conflict, what the Coordinator agrees with, what should change, and what the Coordinator disagrees with.

## Usage
Provide optional controls and an audit focus. The active agent will inspect the current work, build one audit packet, send the same packet independently to one or more external LLM CLIs, and return a structured cross-auditor external-audit report.

## Arguments
- `[controls] [focus]`
- `controls` (optional): `auditors=<claude,gemini,codex|all>`, `auditor=<claude|gemini|codex>`, `min_auditors=<int>`, `allow_same_family=<true|false>`, `reuse_packet=<path>`, `scope=<work-log|current-diff|staged|last-commit>`, `suggest_changes=<patches|notes|none>`, `audit_timeout_seconds=<int>`, `claude_model=<exact-id>`, `gemini_model=<exact-id>`, and/or `codex_model=<exact-id>`
- `focus`: what you want the external auditors to examine most closely

---

**Directive:**
Act as an External Audit Coordinator.

1. Parse `$ARGUMENTS`:
   - Detect optional controls anywhere in args: `auditors=<claude,gemini,codex|all>`, `auditor=<claude|gemini|codex>`, `min_auditors=<int>`, `allow_same_family=<true|false>`, `reuse_packet=<path>`, `scope=<work-log|current-diff|staged|last-commit>`, `suggest_changes=<patches|notes|none>`, `audit_timeout_seconds=<int>`, `claude_model=<exact-id>`, `gemini_model=<exact-id>`, and `codex_model=<exact-id>`.
   - Remaining text is the audit focus.
   - Defaults if omitted: `scope=work-log`; `suggest_changes=patches`; `audit_timeout_seconds=300`; `allow_same_family=false`; `min_auditors=1`; auditor selection is all available different-family external CLIs in deterministic order.
   - If `auditors=` names an explicit list and `min_auditors=` is omitted, set `min_auditors` to the number of requested auditors so missing requested auditors cannot be silently dropped.
   - `auditors=all` is the explicit spelling of the default all-available behavior for scripts. It still excludes the current host family unless `allow_same_family=true`.
   - `reuse_packet=<path>` means rerun a prior packet, usually for failed auditors. Do not rebuild or reframe the packet when this is set; verify the path exists and use it as the canonical packet.
2. Load `<AI_DEV_SHOP_ROOT>/skills/external-audit/SKILL.md`.
3. Also use `skills/llm-operations/references/peer-llm-dispatch.md` for shared packet, transport, diagnostics, and capability rules.
   - If any planned auditor is Claude, also use `skills/llm-operations/references/claude-code-cli-audits.md`.
   - Treat native Windows shells as unverified for this command. The dispatch-path strategy is OS-agnostic, but the command examples and probe flow assume a Bash-compatible shell unless adapted to PowerShell.
4. Inspect the current work surface before dispatching:
   - use the current session context plus repo evidence (`git status --short`, touched files, relevant file diffs, and when needed `git log -1 --stat`)
   - separate in-scope work from unrelated worktree changes
   - build a concrete work log of what was changed, why, what was verified, and what remains uncertain
   - default to the curated work log as the main packet payload; include commit or diff references only when they materially help the auditor inspect details
   - determine whether the packet names a bounded enough file set for grounded file-change suggestions; if `suggest_changes=patches` but the scope is too broad or uncertain for safe file-level proposals, downgrade to `suggest_changes=notes` and say so before dispatch
5. Build an audit packet using `skills/external-audit/references/audit-packet-template.md`.
   - If `reuse_packet=<path>` is set, skip packet construction and use that existing packet as the canonical authoring packet.
   - Save packets to `<ADS_MEMORY_ROOT>/.local-artifacts/external-audit/packets/<timestamp>-audit-packet.md` by default.
   - If the user explicitly asks to retain the packet, save it to `<ADS_MEMORY_ROOT>/reports/external-audit/packets/` instead.
   - Record the effective `suggest_changes` mode in the packet.
   - **Author the frozen Threat Model & Scope Contract** in the packet (see the template's `Threat Model & Scope Contract` section). Define scope as a positive ALLOWLIST of in-scope blocking failure domains plus allowed actors/capabilities and mandatory invariants — never an open-ended out-of-scope denylist (auditors route around denylists by renaming the excluded class). Assign a `TM-<id>`, freeze it, and record its hash. Author the threat model from the spec/intended-use and deployment context, not to guarantee a pass; the auditor's handshake gate (step 10) will reject an under-specified adversary.
   - **Detect the audit round.** Round 1 = no prior disposition ledger for this `TM-<id>`. Round N = a prior audit exists under the same `TM-<id>`: carry forward the `Prior-Round Disposition Ledger` with each prior finding's disposition (`fixed`/`out-of-scope`/`accepted-risk`/`wontfix`) and set `Audit round: N` so auditors run diff-only compliance, not a fresh full re-audit. If the threat model changed materially since the last round, mint a NEW `TM-<id>` and treat it as round 1 — scores across TM versions are not comparable.
   - Prefer serving the packet to the peer as a self-contained `stdin` payload when the bounded work log fits cleanly in one prompt.
   - If the peer still needs to read the packet from disk, follow the shared transport fallback rules in `skills/llm-operations/references/peer-llm-dispatch.md` and record both the authoring and dispatch paths in the packet.
6. Run external-auditor preflight:
   - detect which peer CLIs (`claude`, `gemini`, `codex`) are installed
   - prefer a different model family from the current host
   - if `auditors=` is provided, expand that explicit set; `auditors=all` means all installed peer CLIs, still excluding the current host family unless `allow_same_family=true`
   - if an explicit auditor list names the current host family, treat that as an explicit same-family request for that auditor and say that independence is weaker
   - if legacy `auditor=` is provided, run exactly that one auditor
   - if neither is provided, filter out the current host family unless `allow_same_family=true` and choose all available external CLIs in this exact order: `claude`, `gemini`, `codex`
   - if fewer than `min_auditors` are available, stop and tell the user which auditors were available, unavailable, or excluded
   - if no different-family external CLI is available, stop and tell the user instead of silently using the same family
   - resolve each planned auditor model only by: per-run override naming an exact model/version, saved pinned preference naming an exact model/version, or local CLI/config proof of the exact model/version
7. For each planned Claude auditor, first check whether the exact requested model already succeeded earlier in the current session on this same host/CLI. If yes, treat that as `session_success` proof and reuse it directly. Do not rerun discovery just because the cache file is absent.
8. For each planned Claude auditor where the requested or saved Claude model is still unproven after the session-success check, or it is rejected by the CLI, do not keep guessing manually. Run `python3 skills/swarm-consensus/scripts/cli_smoke_test.py --discover-claude --claude-model <requested-or-saved-model> --claude-require both --output-format json` first.
   - A valid Claude proof is an exact environment cache hit with a real artifact path, an exact-model `session_success` earlier in the current session on the same host/CLI, or a fresh discovery run that writes a new artifact.
   - If discovery finds a working exact Claude model in the same requested family/version, use it and continue.
   - If discovery finds only a different family/version, stop and ask the user before switching.
9. If any planned exact auditor model/version is not explicitly pinned or locally proven, record a pending model-pinning gate but do not stop yet. Continue through Internal Subagent Verification (steps 9a-9l). External dispatch remains blocked until the model issue is resolved at step 9m.

## Internal Subagent Verification Protocol

9a. Before dispatching any external peer audit, run one internal verification subagent inside the current session. This supplements the external peer audit path; it does not replace external review for high-risk, disputed, release-sensitive, security-sensitive, or architecture-significant work.

9b. Build a curated evidence packet for the internal verifier. Include only:
   - Active spec: requirements, acceptance criteria, invariants, and explicit non-goals from `<ADS_MEMORY_ROOT>/specs/`
   - Active contracts: computational controls, architecture fitness rules, interface contracts, and relevant ADRs from `<ADS_MEMORY_ROOT>/governance/` and `<ADS_MEMORY_ROOT>/reports/`
   - Output artifacts: current diff, changed files, new or changed test files, generated artifacts, and migration files
   - Test evidence: TestRunner report, command output summaries, coverage data, mutation quality results from `<ADS_MEMORY_ROOT>/.local-artifacts/sensors/mutation-quality-<timestamp>.md` (plus the sensor contract at `<AI_DEV_SHOP_ROOT>/harness-engineering/sensors/mutation-quality.md` for gate interpretation), and known skipped or unavailable checks
   - Review rubric: Code Review dimensions from `<AI_DEV_SHOP_ROOT>/agents/code-review/skills.md`
   - Relevant domain skill: for example `<AI_DEV_SHOP_ROOT>/skills/test-design/SKILL.md` for TDD output or `<AI_DEV_SHOP_ROOT>/skills/coding-foundations/SKILL.md` for Programmer output
   - Any explicit user constraints that affect correctness, risk, compatibility, or delivery scope

9c. Exclude all author-side rationale from the evidence packet. Do not provide implementation reasoning, decision justification, confidence claims, "why I chose this," dismissed alternatives, or self-assessments from the authoring agent. The verifier must evaluate the work on observable requirements, artifacts, and evidence only. This exclusion prevents rationalization bias and forces evaluation entirely on the merits.

9d. Spawn the verifier with falsification framing (not forced-defect framing, which manufactures speculative findings):
   > "Attempt to falsify every mandatory invariant in the threat-model contract. A zero-findings result is valid if the evidence supports it. Do not assume defects exist and do not invent speculative ones; evaluate strictly against the provided specs, contracts, and evidence."
   The internal verifier is bound by the SAME convergence contract as external auditors (step 10): same frozen threat-model allowlist and round detection, round-aware scope (full pass on round 1; diff + minimum necessary context with diff-causality on round N), semantic ledger matching, allowlist mapping of blockers, the out-of-scope escape valve, and the independent dual gate recomputed by the coordinator. This prevents the internal verifier from escalating unchanged work on a fresh full pass before the protected external-audit phase is reached.
   Require the verifier to read the supplied rubric and domain skill before review. Default persona selection (priority order — when work matches multiple categories, use the highest-priority persona): Security agent for security-sensitive work > Code Review agent for implementation work > TDD agent for test-design work. If no specific persona applies, use a generic adversarial verifier without agent-specific bootstrapping. If using a reserved pipeline agent persona, bootstrap it from `<AI_DEV_SHOP_ROOT>/agents/<resolved-agent>/skills.md` and require confirmation that the persona file was loaded.

9e. The verifier must inspect the curated packet against the active spec, contracts, tests, and review rubric. To maximize first-pass coverage, the verifier must work through these explicit dimensions in order before reporting:
   1. Cross-file consistency: are thresholds, gate behaviors, terminology, enums, and paths identical everywhere they appear?
   2. Contract violations: does the implementation match declared interfaces, slot definitions, and stage tables?
   3. Requirement drift: does the output satisfy every acceptance criterion in the spec?
   4. Logic completeness: are conditions mutually exclusive and exhaustive? Are there unreachable states?
   5. Template/registry propagation: are all new concepts registered in indexes, templates, and README files?
   6. Incorrect behavior: will an agent following these instructions produce the intended result unambiguously?
   7. Weak or absent tests: is claimed coverage backed by evidence?
   8. Unsafe assumptions: are there implicit dependencies on ordering, environment, or undeclared state?
   9. Regressions: does this change break existing documented behavior?
   10. Security issues, migration/data risks, and evidence gaps
   After exhausting this checklist, the verifier should also surface any other issues found. The checklist front-loads structured coverage; freeform discovery is the catch-all at the end.

9f. Mutation quality results are part of the verifier's evidence. Survived mutants may be cited as concrete evidence of weak test coverage. Escalate finding severity by one level when:
   - The mutation score on touched files is below the sensor's passing threshold (70%) AND the work product claims test adequacy or completeness, OR
   - Survived mutants directly correspond to acceptance criteria or invariant assertions (matching by file and function)
   The verifier may suppress escalation only by citing a specific equivalent-mutant classification or out-of-scope determination with file/line evidence.

9g. Each verifier finding must use this structure:
   - **Checked:** the requirement, contract, behavior, test claim, or risk area examined
   - **Expected:** what the spec, contract, rubric, or reasonable engineering standard requires
   - **Observed:** what the artifacts or evidence show
   - **Why it matters:** the user impact, correctness risk, maintainability risk, or release risk
   - **Recommended fix:** the smallest actionable correction or next investigation step
   - **Confidence:** high, medium, or low, with a short reason

9h. Classify each finding by severity: critical, high, medium, low, or advisory. Also assign one gate recommendation per finding:
   - **Hard blocker:** must be fixed before merge, release, or external audit
   - **Escalation:** requires owner, architect, security, database, or external peer review before proceeding
   - **Advisory:** useful improvement but not blocking
   - **No issue:** checked area passed with no actionable defect
   The internal verifier must also produce a numerical score (1-10) with one-sentence rationale, using the same risk-tiered score floor as external auditors (low risk = 7, medium/high risk = 8.5). Consistent with the external dual gate, the verifier blocks on EITHER condition independently: a hard-blocker finding OR a below-floor score prevents proceeding to external dispatch. The blocker must be classified before the score so the two cannot be traded, but the below-floor score remains an independent automatic block.

9i. If the verifier reports zero findings, it must still provide:
   - **Checks performed:** concise list of concrete areas reviewed
   - **Evidence used:** diff, tests, reports, mutation data, contracts, and spec references considered
   - **Residual risk:** what may still be wrong despite no findings
   - **Gate recommendation:** no issue, advisory, or escalation if uncertainty remains

9j. Zero findings are allowed, but zero findings on high-risk work are not a completion signal by themselves. For high-risk, disputed, release-sensitive, security-sensitive, or architecture-significant changes, external peer audit (step 10) is mandatory even when the internal verifier finds no issues. Optionally, run a second internal pass with a different persona before proceeding to step 10 for additional coverage.

9k. Gate handling:
   - If the internal verifier finds any hard blocker, return the work to the responsible implementation or upstream stage. Do NOT proceed to external audit dispatch (step 10).
   - If the verifier recommends escalation, route to the appropriate specialist or external peer audit before completion.
   - If only advisory issues are found, record them in the audit result and let the Coordinator decide whether to fix now or defer. Proceed to step 10.
   - If no issues are found and the work is routine risk, proceed to step 10 (external audit dispatch).
   - If no issues are found and the work is high risk, proceed to step 10 — external peer audit is mandatory for high-risk work regardless of internal results.

9l. Record the internal verification result in the audit artifact under `<ADS_MEMORY_ROOT>/.local-artifacts/external-audit/internal-verification/`. Include the curated packet summary, excluded rationale statement, verifier findings, gate recommendation, mutation-quality interpretation, residual risk, and whether external peer audit is still required.

9m. Model-pinning gate (deferred from step 9): If any planned exact auditor model/version is still not explicitly pinned or locally proven after internal verification completes, stop before external dispatch and print:
   `Planned auditors: <CLI=model-or-unproven list>. Exact model/version is not proven for: <CLI list>. Reply with auditors=... and claude_model=..., gemini_model=..., or codex_model=... using exact model name/version(s) to proceed.`

10. If every planned exact auditor model/version is explicit or locally proven, dispatch the audit prompt to each planned auditor independently.
   - every auditor gets the same canonical packet
   - auditors must not see each other's answers before responding
   - construct every auditor prompt from the canonical packet before dispatching the first auditor; if dispatch must be sequential, do not revise, reframe, or add emphasis to later prompts based on earlier auditor responses
   - run peer calls in parallel when practical; otherwise run sequentially but keep the prompts independent
   - do not hand `<ADS_MEMORY_ROOT>/.local-artifacts/` paths directly to the peer when file-based reads are required; use the shared transport fallback rules from `skills/llm-operations/references/peer-llm-dispatch.md`
   - before starting `audit_timeout_seconds`, run the Peer Handshake Gate from `skills/llm-operations/references/peer-llm-dispatch.md` and require: `ACK_PACKET_RECEIVED <packet-id or deterministic packet marker> -- I received the packet and will work on it.`
   - run the mandatory Heartbeat Monitor from `skills/llm-operations/references/peer-llm-dispatch.md` while any auditor process is alive
   - run a cheap readability probe first when using file-based transport: ask the peer to read the dispatch packet and echo the first Markdown heading
   - require the auditor to begin with an `Auditor Scope Check` that states what it believes it is auditing, the scope and target it used, which files or artifacts it reviewed, and any mismatch or uncertainty it noticed before giving findings
   - **Convergence protocol (mandatory — prevents threat-model escalation across rounds):**
     - **Threat-model handshake first:** require the auditor to compute threat-model acceptance FIRST and report it ONLY as the `threat_model_accepted`/`rejection_reason` fields inside the single structured JSON object defined in the packet template — never as a separate JSON block (a standalone first object reintroduces multi-object parse brittleness). If it rejects the contract as under-specified for the artifact, it returns that object with empty `findings` and no score, and the coordinator surfaces the rejection to the user instead of scoring — do not patch the threat model after seeing findings to force acceptance.
     - **Round-aware persona:** on round 1 the auditor runs a full threat-model pass; on round N it acts as a Compliance Inspector that (a) reconciles each `Prior-Round Disposition Ledger` entry and (b) audits the unified diff PLUS the minimum unchanged context needed to judge the diff's behavioral effects (callers, consumers, config, invariants it touches) for new contract violations. This catches fix-introduced regressions in unchanged integrations without re-auditing unrelated untouched code; every round-N finding must state its causal link to the diff.
     - **Semantic ledger matching:** match findings to prior ledger entries by underlying causal claim and affected surface, NOT by ID or wording — an excluded concern cannot re-enter under a new label. A ledger entry that cannot be verified as genuinely resolved (e.g. a `fixed` claim with no corresponding diff change) is itself a blocker in the gate-evasion/non-convergence domain. A non-diff late finding is admissible only with materially new evidence unavailable in round 1, and is flagged for human adjudication rather than auto-escalated.
     - **Allowlist mapping:** every blocking finding must map to exactly one in-scope blocking failure domain from the contract allowlist; an unmappable finding is advisory, not blocking. An excluded concern may not be re-raised by renaming its class — only by proving it occurs during normal in-scope operation.
     - **Classify blocker before scoring:** the auditor must decide blocking status by the fixed blocker rule before computing any 1-10 score, so the score floor cannot drive a blocker to be downgraded to advisory (or vice versa).
     - **Escape valve:** instruct the auditor that a catastrophic issue outside the pinned threat model goes in `out_of_scope_fatal_warnings` (surfaced to the human) rather than lowering the score or blocking the gate — this preserves convergence without causing false negatives.
     - **Late-finding honesty:** on round N, a new finding caused by the diff states its diff-causal link; a finding NOT caused by the diff is admissible only under the Semantic ledger matching rule above (materially new evidence unavailable in round 1 + human adjudication) and must carry a `round_1_miss_justification` — a justification alone does not make it admissible.
     - **Structured + deterministic:** require the structured JSON object from the packet template's Auditor Instructions, and request `temperature=0` (or the host's nearest deterministic setting) for re-audits so ledger evaluation is stable.
   - prefer a short prompt that points to the dispatch packet over embedding the full packet body inline when the peer can read files directly
   - if the packet already names the relevant files, prefer a bounded sectioned prompt over an open-ended repo-audit prompt
   - if an auditor is Claude, apply the Claude Code reference and prefer its dedicated runner when available
   - when `suggest_changes=notes`, ask for file-level change suggestions in prose or snippets only
   - when `suggest_changes=patches`, ask for file-level change suggestions plus candidate unified diffs or bounded replacement snippets only for files the auditor actually reviewed; if the scope is too uncertain for safe patch proposals, require the auditor to fall back to notes and say why
   - never ask auditors to apply edits; suggested changes are proposal-only artifacts
   - Prefer structured output modes when available.
   - Parse `stdout` only as each auditor answer.
   - Treat `stderr` as diagnostics.
   - Save raw stdout/stderr captures to `<ADS_MEMORY_ROOT>/.local-artifacts/external-audit/offloads/<timestamp>/<auditor>/` by default.
   - Retry transient failures like `429` and `503` within `audit_timeout_seconds`, with at most 2 retries.
   - only classify `empty_result_transport_failure` after the peer process exits successfully and stdout is still empty
   - use any host-specific live-run timing or fallback bounds from the host reference you loaded
   - if the peer exits successfully but returns an empty answer body, classify it as `empty_result_transport_failure` and retry once with a tighter bounded prompt and constrained read-only tool surface when supported
   - when file-based dispatch was used, delete the temporary dispatch copy after the run unless the user explicitly asks to retain it for debugging or evidence
   - if all planned auditors fail, stop and report the failure matrix instead of synthesizing findings
   - if some auditors fail and successful respondents are fewer than `min_auditors`, stop and ask whether to retry failed auditors using `reuse_packet=<path>`, proceed with degraded coverage, or abort
   - if some auditors fail but successful respondents still meet `min_auditors`, proceed only with a prominent `Degraded Coverage` note and a decision point to rerun failed auditors from the same packet
   - **Per-finding rationale gate (mandatory):** Every auditor dispatch prompt must require a concise `Finding Rationale` for each finding. Do not ask for private chain-of-thought. Require observable audit reasoning in this structure:
     - `Checked:` files, artifacts, commands, or packet sections inspected
     - `Expected:` the contract, behavior, invariant, or quality bar the work should satisfy
     - `Observed:` the concrete mismatch, omission, risk, or evidence found
     - `Why it matters:` user, correctness, security, maintainability, or workflow impact
     - `Recommended fix:` the smallest actionable fix or the decision needed
     - `Confidence:` high, medium, or low, with the main uncertainty if not high
   - **Independent dual gate (blocker OR below-floor):** the binding gate is `blocking_gate = FAIL` if EITHER any validated blocker (allowed actor violates a mandatory invariant, mapped to an in-scope allowlist domain, above the impact threshold) is unresolved, OR the score is below the risk-tiered floor. These two conditions are evaluated independently and neither can rescue the other: the blocker must be classified BEFORE the score is assigned, so a high score cannot bury a validated blocker and a below-floor score still blocks even with zero blockers. The decoupling (not the removal of the floor) is what prevents the auditor from trading classification for score.
   - **Coordinator recomputes the gate:** the packet's frozen contract carries the `risk_tier`, `score_floor`, and the exact gate formula, so the auditor and coordinator apply the same numbers. The coordinator MUST recompute `blocking_gate` from the returned validated blockers and numeric score and reject (retry once, then degrade) any auditor-supplied gate that disagrees — do not trust a returned `PASS` that contradicts the formula.
   - **Scoring Gate (mandatory):** Every auditor dispatch prompt must still require a numerical score (1-10) with:
     - The score and one-sentence rationale (required even for a 10)
     - Top issues that reduced the score (if < 10)
     - What specifically would raise the score to 10 (if < 10) — `path to 10` items are ALWAYS advisory and never become blockers via the score. A below-floor score independently fails the score gate on its own (see dual gate), but it does not promote any `path to 10` item to blocker status.
   - **Risk-tiered score floor:** low risk = 7, medium/high risk = 8.5. A score below the applicable floor is an independent blocking condition (see dual gate above), evaluated separately from blocker classification.
   - The coordinator must surface the "what would make it a 10" items as advisory action items in `Decision Points For User`.
   - If an auditor omits a score, returns a non-numeric value, or provides an out-of-range number, retry once with an explicit score reminder. If still missing, classify as `degraded coverage` and note the omission in the report.
   - An auditor's stated blocker findings are always binding regardless of score — a score of 8 does not override explicitly flagged blockers.
   - **Escalation ceiling (hard cap):** Total scoring attempts (initial + retries) must not exceed 3 per auditor. On hitting the ceiling: do NOT discard findings or block indefinitely. Record all unresolved blockers in a `## Human Escalation` section with the remaining blocker text, which auditor raised it, the score delta from the floor, and what was already attempted. Mark the audit status as `ESCALATED — requires human decision`. The human decides whether to accept, fix, or revert.
   - All scores are included in the `Auditor Matrix` section of the final report.
11. If any auditor returned suggested changes, save them as proposal artifacts using `skills/external-audit/references/proposed-fixes-template.md`.
   - Default save path: `<ADS_MEMORY_ROOT>/.local-artifacts/external-audit/proposed-fixes/<timestamp>/`
   - Retained save path only when the user explicitly asks: `<ADS_MEMORY_ROOT>/reports/external-audit/proposed-fixes/<timestamp>/`
   - Always save the raw extracted proposal bundle to `proposed-fixes.md`, grouped by auditor.
   - If an auditor returned grounded unified diffs, split them into `patches/<auditor>-<nnnn>-<slug>.diff` files when practical; otherwise keep them inline in `proposed-fixes.md`.
   - Treat these artifacts as suggestions only. Do not apply them automatically — but do not silently drop them either (see the Proposed-Fix Disposition Gate below).
   - Apply the **Solution Slate Protocol** from `skills/llm-operations/references/peer-llm-dispatch.md` when recording remediation: where a finding has more than one viable fix, present them as a ranked slate (explicit ranking criteria, per-option trade-offs and failure modes, a recommendation + cheapest de-risking step) rather than a single take-it-or-leave-it fix. Each ranked option then enters the Proposed-Fix Disposition Gate individually. This governs the auditor's remediation OUTPUT only; it does not relax the step 9c exclusion of author-side rationale from the auditor's input packet.

11a. **Proposed-Fix Disposition Gate (mandatory PROCESS-COMPLETENESS gate — distinct from the threat-model `blocking_gate`).** This gate enforces that no auditor critique is silently dropped. It is NOT a third blocking condition on the deterministic dual gate (which stays `validated blocker OR below-floor score`): an undispositioned proposed fix makes the audit's reporting STATE `INCOMPLETE`, it is not itself a threat-model blocker and does not flip `blocking_gate`. Enumerate EVERY proposed fix and EVERY per-finding `recommended_fix` from EVERY auditor as a checklist. For each one, the coordinator MUST record exactly one explicit disposition with a one-line rationale:
   - `agree-implement` — the coordinator agrees and sees no issue → it MUST be implemented this session OR converted to `agree-defer` with a stated reason. "Agree but silently skip" is not a permitted state. (Implementing an advisory/`path to 10` suggestion is NOT a prerequisite for reporting the threat-model PASS/FAIL outcome — but it still must be dispositioned and either done or explicitly deferred.)
   - `agree-defer` — the coordinator agrees but cannot safely implement now → record the concrete reason and the tracked follow-up (file/ticket). Deferral requires a stated blocker, not convenience.
   - `disagree` — the coordinator rejects it → requires an evidence-backed rationale tied to the spec, contract, or threat-model contract. If two or more auditors independently converged on the fix, a `disagree` must additionally be surfaced as a `Decision Points For User` item (it cannot be unilaterally buried).
   - The audit may not be reported as COMPLETE (cannot advance to a final `Audit Outcome` of done) while any proposed fix lacks a disposition — but this is a process-state requirement, separate from and not folded into the threat-model `blocking_gate` result.
   - After implementing the `agree-implement` set, re-verify (sync checks, `bash -n`/lint where applicable, and a residual-consistency scan for contradictions the edits may have introduced) before declaring the gate satisfied.
   - Write the completed disposition table into `proposed-fixes.md` and mirror it in the final report's `Coordinator Response -> Proposed Fix Handling` section.
12. Synthesize the result back to the user. The final answer must include:
   - the exact report structure from `skills/external-audit/references/external-audit-report-template.md`
   - the exact auditor model version used (`Resolved Model`) and the auditor CLI version for each planned auditor
   - the effective `suggest_changes` mode used
   - `Work Log`
   - `Auditor Matrix` (must include each auditor's 1-10 score and one-line rationale)
   - `Degraded Coverage` when any planned auditor failed, was skipped, or did not review the target scope
   - `Per-Auditor Scope Checks`
   - `What The External LLMs Said`
   - `Per-Finding Rationales`
   - `Cross-Auditor Synthesis`
   - `Suggested Changes By Auditor`
   - `Coordinator Response -> Agree`
   - `Coordinator Response -> Change`
   - `Coordinator Response -> Disagree`
   - `Coordinator Response -> Proposed Fix Handling` — MUST contain the completed Proposed-Fix Disposition Gate table from step 11a: every auditor proposed fix / `recommended_fix` with its disposition (`agree-implement` / `agree-defer` / `disagree`), one-line rationale, and — for `agree-implement` — confirmation it was actually implemented and re-verified this session. The audit cannot reach `Audit Outcome` while any proposed fix is missing a disposition.
   - `Audit Outcome`
   - `Decision Points For User` (must include "what would make it a 10" items from any auditor scoring < 10)
   - if any exact model version cannot be proven, do not run the audit; ask for pinned model(s) instead
   - if two or more auditors independently converge on the same finding, do not dismiss it in `Disagree` without making it a `Decision Points For User` item and explaining the evidence required to override it
13. Before writing the final report, if the user has not already specified retention, ask:
   `Save external audit report? Reply "save report" to retain it in <ADS_MEMORY_ROOT>/reports/external-audit/runs/, "local only" to keep it in <ADS_MEMORY_ROOT>/.local-artifacts/external-audit/runs/, or "inline only" for no file.`
   Save ad hoc reports to `<ADS_MEMORY_ROOT>/.local-artifacts/external-audit/runs/<timestamp>-external-audit-report.md` by default. If the user explicitly wants to retain the artifact, save it to `<ADS_MEMORY_ROOT>/reports/external-audit/runs/<timestamp>-external-audit-report.md` instead.
   - Suggested-change bundles remain in `.local-artifacts` by default even when the report is saved, unless the user explicitly asks to retain the proposed fixes too.
