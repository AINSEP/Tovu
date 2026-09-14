# MCP refusal and assistant audit

Inputs: Tovu frozen HEAD `efc6847ed4490d0f57cd94d16b8cf46a6489a88a`, `0d9e41d5`, `37ac1943`, and changed assistant composition. HEAD source/call paths only; no tests or application execution. Operator UI findings live in `03-admin.md`.

## MCP-01 — Medium — A duplicate descriptor makes the model report an admitted tool as unavailable

- **Location:** `apps/website/src/assistant/mcp-federation/refusal-notice.ts:156`, blanket instruction at `:219`.
- **Status: CONFIRMED.** Traced admission → registration → saved snapshot → prompt construction → run startup.
- **Scenario:** An operator allows tool `image_lookup`. The remote advertises two descriptors named `image_lookup`, the first with a valid schema and permitted annotations. `trust.ts:307` admits the first name and refuses only the repeat as `duplicate-remote-tool-name`; `admitRemoteTools` retains the first in `admitted` and the repeat in `refused` (`trust.ts:433`). `buildFederatedMcpRegistrations` registers the admitted descriptor. The new prefix independently reduces every refusal except `not-in-operator-allowlist`, never checking `admitted`, then tells the model that every listed tool is absent from `search_tools`/`describe_tool` and impossible to call. Its duplicate-specific explanation acknowledges that the first definition was kept, contradicting the blanket instruction.
- **Impact:** Every run receives authoritative but false availability instructions for a tool that is actually registered and discoverable. This undermines the feature's purpose of replacing guessed explanations with accurate ones.
- **Correction direction:** Distinguish refusal of an additional descriptor from absence of a tool name. Derive unavailable-name claims after subtracting the admitted set; retain a separate vendor-malformation warning if wanted.
- **Limit:** Confirmed from source, not reproduced against a remote server.

## Coverage / handoff

Confirmed real wiring: `start()` awaits federation, exposes the same boot reports over `/api/federation/admissions`, builds the refusal prefix at `agent-daemon-server.ts:1073`, and `onStarted` prepends it at `:780` before agent execution. Catalog construction happens after federation. The sanitized-name and connection-ID validation paths were read. Review ongoing; no blanket security or completeness claim.

Next assignee: audit continuation, then operator triage. No source changes made.
