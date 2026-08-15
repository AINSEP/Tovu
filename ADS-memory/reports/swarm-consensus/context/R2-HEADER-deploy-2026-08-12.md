# Swarm Consensus — Debate 6 (Deployments), ROUND 2

**Packet ID:** `CTX-DEPLOY-R2-2026-08-12`
**Mode:** debate Round 2 — INFORMED. Every participant's full Round 1 reasoning is appended verbatim below.

- IGNORE ALL PRIOR CONVERSATION HISTORY except this packet. No `AGENTS.md`/`CLAUDE.md` here; intentional, never a reason to stop. Do not read outside your working directory. Do not chain reads with `&&`.

## What Round 1 settled — the owner's hypothesis is rejected, on verified grounds

The owner proposed *"just MCP — access tokens and base URLs."* All participants rejected it, and the Coordinator verified the two load-bearing facts:

1. **MCP here is not a base URL and a token — it is a spawned subprocess.** `McpStdioLaunchSpec`'s own comment: *"Only stdio is implemented this pass… the hosted HTTP transport is deferred rather than half-built."* `spawnMcpStdioChannel` calls `child_process.spawn`.
2. **MCP bypasses the guarded HTTP client entirely.** `HttpClientPort` and `EgressPolicy` appear **zero times** anywhere in `mcp-federation/`. A federated MCP server manages its own network stack, so routing deployment through MCP discards the SSRF and DNS-pinning protections Tovu built for outbound requests.

Additional agreement: deployment means promoting an **immutable, workspace-scoped site release to a named environment**, not upgrading the Tovu process and not copying mutable content between instances. Direct HTTP adapters over the existing guarded `HttpClientPort` + sealed-secret ports are the default surface; MCP, CLI, and git-driven CI remain *adapter choices*, never the definition. Environments are first-class; rollback is redeploying a prior release, not reversing a local write. Status belongs in durable workspace-scoped execution records — `module-status.ts` is a boot-readiness snapshot, not a run store.

Also established: the CLI exposes only `init`, `serve`, `introspect` — **no build or export command** — so Tovu must not imply it can construct a deployable artifact today. And external-MCP config already demonstrates that stored config and live effect have separate lifecycles (changes take effect only after daemon restart).

## The Round 2 ask — PRODUCE CODE

Solution Slate Protocol is ON. Back the leading option with **real code**, not prose.

1. **The domain model.** `Release`, `Environment`, `DeploymentTarget`, `DeploymentRun` — show the TypeScript types and the table shapes, workspace-scoped, consistent with the repo's existing conventions (text PKs, `workspace_id` on every row, ISO-8601 text timestamps, integer `version` for optimistic concurrency).
2. **The provider-neutral port**, in the same shape as `CommercePaymentRuntimePort` — deliberately narrow, excluding anything unproven. Plus one concrete adapter written against the guarded `HttpClientPort` with its `EgressPolicy`.
3. **GitHub specifically.** The owner asked whether a CLI is needed. Answer with code: REST/GraphQL over `HttpClientPort`, a GitHub App with installation tokens, or `gh` subprocess. Justify on auth model and scope granularity, not preference.
4. **Secrets.** Wire through `KeyringPort` / `SecretSealerPort` / `IntegrationSecretRepoPort`. No plaintext in config, content revisions, logs, or browser responses.
5. **Long-running runs.** Deploys take minutes and fail halfway. Show how status is recorded and surfaced — poll or subscribe — and how a provider callback updates a run **without ever supplying or inferring the workspace**.
6. **The frontend.** What the admin actually needs: a section, a per-target config panel, a run log, or an assistant-driven flow. Show the route and component surface, and how it degrades when nothing is configured.
7. **The honesty constraint.** There is no build/export capability. Make the first slice explicitly "orchestrate an external deployment of a pre-existing artifact," and make the UI say so.

Provide a ranked slate of ≥2 options with explicit ranking criteria, full trade-offs, a genuine sacrifice per option, a recommendation, and the cheapest falsifying test. Then code for the leading option, consistent with the real files in `files/`.

Also state your current position, whether it changed this round and why, the strongest counter-argument, and what would change your mind.

## Required response format

Begin with exactly:

```
ACK_PACKET_RECEIVED CTX-DEPLOY-R2-2026-08-12 -- I received the packet and will work on it.
```

Headings: `## Position And Movement`, `## Solution Slate`, `## Leading Option — Code`, `## Strongest Counter-Argument`, `## What Would Change My Mind`.

End with exactly `<<SWARM_END>>` on its own line.

---

# APPENDIX — Every participant's full Round 1 response, verbatim

