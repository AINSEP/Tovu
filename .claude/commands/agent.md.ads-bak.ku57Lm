The user wants to enter Agent Direct Mode with a specific agent.

Requested agent: $ARGUMENTS

Steps:
1. Identify the agent from $ARGUMENTS. Valid names: `spec`, `architect`, `tdd`, `programmer`, `testrunner`, `code-review`, `refactor`, `security`, `observer`, `red-team`, `codebase-analyzer`, `database`, `coordinator`.
2. Detect optional mode keyword:
   - If user includes `consensus` (for example `/agent architect consensus`), enter Agent Direct Mode with Consensus enabled for the next high-level question.
   - Otherwise use standard Direct Mode.
3. Load that agent's skills from `<AI_DEV_SHOP_ROOT>/agents/<name>/skills.md`.
4. If consensus is enabled, also load `<AI_DEV_SHOP_ROOT>/skills/swarm-consensus/SKILL.md`.
5. Announce entry into Direct Mode:
   `AgentName(Direct): Switching to Agent Direct Mode. I'm the [Agent Name]. The Coordinator is observing but not routing. What do you need?`
   If consensus enabled, use this message instead:
   `AgentName(Consensus): Switching to Agent Consensus Mode. I'm the [Agent Name]. The Coordinator is observing but not routing. What do you need?`
   If consensus enabled, append this info section:
   - `single-pass: each model gives one independent answer, then I synthesize once.`
   - `debate: models run rebuttal rounds on disagreements until min_confidence is met or max_rounds is reached; if you do not override it, debate defaults to 2 rounds.`
   - `You can set controls per run: max_rounds=<int>, min_confidence=<0.0-1.0>, swarm_timeout_seconds=<int>, claude_model=<id>, gemini_model=<id>, and codex_model=<id> (for example: /debate max_rounds=4 min_confidence=0.92 swarm_timeout_seconds=300 gemini_model=<id> codex_model=<id> <prompt>).`
   - `If you want more detail on modes, thresholds, or round controls, ask and I will explain further.`
   - `I will show model/version preflight before answers, and if any model is inferred instead of explicitly pinned for this run, I will ask you to confirm or override it first.`
   - `Consensus reports must use the Step 5 template from the swarm skill. Debate mode can add a round trace, but it cannot replace the required report sections.`
   - `Switch back with /agent <name> (or "talk to <agent> directly").`
6. For all subsequent messages, follow `<AI_DEV_SHOP_ROOT>/AGENTS.md` → `Agent Direct Mode — Shared Rules`.

To end Agent Direct Mode: user says "back to coordinator", "resume coordinator", or addresses the Coordinator directly.

Full Agent Direct Mode rules: `<AI_DEV_SHOP_ROOT>/AGENTS.md` → Agent Direct Mode — Shared Rules section.
