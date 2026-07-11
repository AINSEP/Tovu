# Swarm Debate Command (/debate)

## Purpose
Shortcut for `/consensus debate` when the user clearly wants the debate mode of Swarm Consensus rather than the generic umbrella command.

## Debate Routing Guard

`/debate` always means Swarm Consensus debate with external peer LLM CLIs. External peers are mandatory: a run that drops them and uses only in-host subagents is invalid. Do not, on your own initiative, substitute platform subagents, current-LLM helper agents, or repo-persona consultation for the external peers.

Two explicit-request exceptions:
- **Replacement** — the user asks for current-LLM subagents or repo-persona consultation *instead of* Swarm Consensus. Then run that mode and skip external dispatch.
- **Addition** — the user asks to spawn a subagent *in addition to* the external peers. Then add the subagent as an extra participant alongside the peer CLIs; it does not replace any external peer. Give it the same round packet under the same Round-Disclosure Guard (Round 1 neutral, later rounds informed), label it distinctly in the Peer Dispatch Brief and `Individual Responses` as an in-host subagent participant, and count its position in the debate trace. This is distinct from the same-family helper that fills the `Primary` slot when the host cannot surface a first-pass answer (consensus.md Step 8) — that helper is not a voting participant.

## Debate Problem-Framing Guard

Round 1 must be adversarial and solution-neutral. Frame the prompt as "what we need" and "how best to create it" before naming any candidate implementation. If a likely solution is included, present it as one option among alternatives and require peers to critique it, reject it if warranted, and surface failure modes. Do not write peer prompts that imply the Coordinator has already chosen the answer unless the user explicitly requested proposal validation.

## Debate Round-Disclosure Guard

Disclose the Coordinator's own analysis progressively — do not bias peers in Round 1, but do inform them afterward.

- **Round 1 (blind):** The Primary/host still produces its substantive frozen first-pass answer in Round 1 (consensus.md Step 8) — it is formed and recorded, just withheld from the peers. What the Round 1 *packet* must not carry is any Coordinator opinion, leaning, finding, verdict, or the Primary's answer; peers form independent positions from the neutral framing alone. This extends consensus.md Step 7's "no Primary answer in the Round 1 peer prompt" to the Coordinator's own discoveries as well.
- **Round 2+ (informed):** From the second round onward, the Coordinator SHOULD share what it discovered — its own analysis, the strongest points each side raised, cross-response deltas, and any evidence it gathered between rounds — so peers debate against the sharpest current state rather than re-arguing blind. Attribute these as Coordinator findings, keep them falsifiable, and still require each peer to state its position, whether it changed, and what would change its mind.

Apply this guard to every participant that receives a round packet, including any user-requested in-host subagent added under the Debate Routing Guard.

## Usage
Provide optional controls and a question. Debate mode is implied, including round-level rationale reporting about why each model holds or changes its position. Before external peer dispatch, the Coordinator must show a concise Peer Dispatch Brief, link the exact peer-facing prompt/context file, and wait for the user to reply `run`.

## Arguments
- `[controls] [prompt]`
- `controls` (optional): `max_rounds=<int>`, `min_confidence=<0.0-1.0>`, `swarm_timeout_seconds=<int>`, `claude_model=<id>`, `gemini_model=<id>`, and/or `codex_model=<id>`
- `prompt`: the detailed question or architectural problem to analyze

---

**Directive:**
Act as a Swarm Consensus Coordinator in `debate` mode.

1. Apply the Debate Routing Guard before any subagent or consultation action.
2. Treat `/debate $ARGUMENTS` as the exact equivalent of `/consensus debate $ARGUMENTS`.
3. Force `mode=debate` before parsing any remaining controls.
4. Parse optional controls anywhere in args: `max_rounds=<int>`, `min_confidence=<0.0-1.0>`, `swarm_timeout_seconds=<int>`, `claude_model=<id>`, `gemini_model=<id>`, and `codex_model=<id>`.
5. Remaining text is the prompt.
6. If omitted, default to: `max_rounds=2`, `min_confidence=0.90`, `swarm_timeout_seconds=300`.
7. Apply the Debate Problem-Framing Guard when creating the Round 1 prompt/context packet.
8. Apply the Debate Round-Disclosure Guard on every round: keep Round 1 packets free of Coordinator opinion/findings; from Round 2 on, fold the Coordinator's discoveries and cross-response deltas into the rebuttal packet.
9. If the user asked to add an in-host subagent (Addition case in the Debate Routing Guard), dispatch it alongside — never instead of — the external peers, under the same guards, and disclose it in the Peer Dispatch Brief.
10. Then follow `<AI_DEV_SHOP_ROOT>/framework/slash-commands/consensus.md` exactly as if the user had invoked `/consensus debate ...`.
