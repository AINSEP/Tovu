# Primary (Claude Opus 5) — Debate 6 (Deployments)

## ⚠️ Protocol disclosure

No blind Round 1 position was frozen before dispatch — a Primary Participation failure. The Round 1 section below is informed, not blind. Round 2 *is* properly frozen.

---

# Round 1 position (LATE — informed, not blind)

The owner's hypothesis — *"just MCP, access tokens and base URLs"* — fails on two facts I verified myself rather than inherited:

1. **MCP here is not a base URL and a token; it is a spawned subprocess.** `McpStdioLaunchSpec`'s own comment: *"Only stdio is implemented this pass… the hosted HTTP transport is deferred rather than half-built."* `spawnMcpStdioChannel` calls `child_process.spawn`.
2. **MCP bypasses the guarded HTTP client entirely.** `HttpClientPort` and `EgressPolicy` appear **zero times** anywhere in `mcp-federation/`. A federated server manages its own network stack, so routing deployment through MCP discards the SSRF and DNS-pinning protections Tovu deliberately built for outbound requests.

Both Gemini peers found (2) independently — their best contribution of the session.

---

# Round 2 position — FROZEN

Written after reading all Round 1 responses, before reading any Round 2 output.

## Position And Movement

Unchanged in direction, sharpened on GitHub and on scope. Deployment means **promoting an immutable, workspace-scoped release to a named environment through a configured target, then observing it to a terminal outcome.** Direct HTTP adapters over the guarded `HttpClientPort` are the default surface. MCP, CLI, and git-driven CI remain *adapter choices* and must never define what a deployment is.

## The honesty constraint is the biggest design fact, and it should shape the first slice

The CLI exposes only `init`, `serve`, `introspect` — **no build or export command**. Tovu cannot currently construct a deployable site artifact. So the first slice must be *"orchestrate an external deployment of a pre-existing artifact or source revision,"* and the UI must say exactly that. Anything else presents unproven capability as working, which this product has a standing rule against.

That also resolves the packet's deliberately-open question: **what is being deployed is not decided by architecture, it is constrained by what exists.** Given no build step, the only honest v1 is triggering someone else's build of a revision Tovu already tracks.

## GitHub — a GitHub App with installation tokens. Not `gh`, not a PAT.

The owner asked whether CLIs are needed. My answer is no, and the reason is auth granularity rather than transport taste:

- **`gh` CLI** requires the binary on the host, inherits *the operator's personal* credentials, and gives a self-hosted multi-workspace server a user-bound identity it cannot scope per workspace. It also puts an unversioned external dependency in the deploy path. Reject.
- **A personal access token** is one credential with coarse scopes and no per-workspace boundary; revocation is all-or-nothing and it is bound to a human who may leave.
- **A GitHub App** issues short-lived **installation tokens**, scoped per repository and per permission, revocable per installation, not bound to a person, and it maps cleanly onto `workspace_id` — each workspace gets its own installation. It also fits the existing sealed-secret ports without storing a long-lived plaintext credential.

The cost I accept: a GitHub App is meaningfully more setup than pasting a token, and self-hosters will feel it. That is the genuine sacrifice, and it is worth it because the alternative gives every workspace on a shared instance the same blast radius.

Everything goes through `HttpClientPort` + `EgressPolicy`; nothing shells out.

## Remaining Disagreements

**Where MCP legitimately fits.** Not nowhere. An operator who has already federated a deploy-capable MCP server should be able to select it as a *target adapter*. What must not happen is deployment being *defined* as MCP, because that inherits the subprocess and egress-bypass properties above and wraps deterministic infrastructure operations in a nondeterministic LLM tool-call path with prompt-injection surface. Adapter yes; definition no.

**Status must be a durable run record, not a status endpoint.** `module-status.ts` is a boot-readiness snapshot that maps critical boot failure to 503 — it is not a run store. Deploy runs need their own workspace-scoped records with provider execution id, timestamps, requested release, environment, state, and sanitized events. Poll first; streaming later.

**The callback invariant.** A provider callback may update a run but must **never supply or infer the workspace** — it is looked up from the run record, which is workspace-scoped by construction. This is the same rule the visitor-auth design already landed on for OAuth state, and it is the single easiest thing to get wrong in a multi-tenant deploy system.

**Rollback is a compensating action, not a reversal.** Redeploying the previous successful release. It is not the change-set machinery, and conflating the two would be a category error — change-sets revert *local* state, deployment effects are external and already observed by users.

## Strongest Counter-Argument

That building a Tovu-owned deployment domain — releases, environments, targets, runs, adapters — is a large amount of machinery for a product whose users may simply want "push to GitHub and let my existing CI do it" (Option D). That is a real argument: Option D ships almost nothing and satisfies a large fraction of real cases. My answer is that D is not actually a different design, it is *one adapter* in the design above, and choosing D exclusively means Tovu has no vocabulary for environments, releases, or run status — so the moment anyone wants a second target, it is rebuilt from scratch. But if the owner's real need is only "publish to one place," D honestly wins on cost.

## What Would Change My Mind

- The owner naming a single deploy target and no intention of a second — then Option D exclusively, and the domain model is over-engineering.
- A build/export capability landing in the CLI — that changes what is being deployed and reopens the whole first-slice question.
- Evidence that self-hosters will not tolerate GitHub App setup — that would push me to support a PAT as an explicitly-degraded path with the blast radius disclosed, rather than as the default.

<<SWARM_END>>
