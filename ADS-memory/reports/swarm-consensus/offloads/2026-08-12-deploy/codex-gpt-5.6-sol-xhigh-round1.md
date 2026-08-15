I’ll read the packet and every supplied source file, then return only the debate response in the exact requested envelope.
ACK_PACKET_RECEIVED CTX-DEPLOY-2026-08-12 -- I received the packet and will work on it.

## Position

“Deployment” should mean: **promoting an immutable, workspace-scoped site release to a named environment through a configured target, then observing that release until a terminal outcome**.

It should not initially mean upgrading the Tovu process, deploying themes/plugins independently, or copying mutable content between Tovu instances. Those are distinct lifecycle problems. The supplied CLI exposes only `init`, `serve`, and `introspect`; it provides no verified build, export, or release command, so Tovu must not imply that it can yet construct a deployable site artifact (files/tovu/cli/program.ts:35-62).

The best design is a Tovu-owned deployment domain with durable release, environment, target, and execution semantics, backed by provider adapters. Direct HTTP should be the default adapter surface: Tovu already exposes the shared `HttpClientPort`/`EgressPolicy` seam intended for SSRF-guarded outbound clients, plus keyring, sealing, and workspace-scoped secret storage (files/tovu/integrations-ports.ts:5-25,40-40,46-97,157-162). MCP, CLI, and Git-driven CI can remain adapter choices; none should define what a deployment is.

The smallest honest slice is triggering and observing deployment of a **pre-existing immutable artifact or source revision** to one named environment, with redeployment of the previous successful release as its rollback. It must explicitly say that Tovu is orchestrating an external deployment, not building a site when no build/export capability has been proven (files/tovu/cli/program.ts:35-62).

Environments should be first-class. Promotion means deploying the same release identity to another environment, not silently reconstructing it from current mutable content. Content promotion between Tovu instances is a separate export/import or change-management feature. Deployment rollback is likewise an external compensating action—normally redeploying a prior release—not reversal of a local configuration write. Existing external-MCP configuration already demonstrates that stored configuration and live external effect have separate lifecycles: changes take effect only after daemon restart (files/tovu/external-mcp/put.ts:21-24,57-57; files/tovu/external-mcp/delete.ts:12-14,30-30).

Status must live in durable, workspace-scoped execution records owned by Tovu, including the provider execution identifier, timestamps, requested release, environment, current state, and sanitized events. The current module-status route reports a boot-readiness snapshot and maps critical boot failure to HTTP 503; it is not a deployment run store (files/tovu/module-status.ts:42-49). The admin can poll this durable record initially; provider callbacks or polling update it but may never supply or infer the workspace. Existing repositories and routes consistently carry or verify `workspaceId`, which is the invariant deployment records must preserve (files/tovu/integrations-ports.ts:103-114,149-162; files/tovu/external-mcp/guard.ts:32-48).

The frontend needs a dedicated Deployments surface: environment and target configuration, credential-presence indicators, release/run history, live status, sanitized logs, failure detail, and rollback eligibility. Assistant-driven deployment should call the same native, permissioned deployment operations, not bypass this record. A chat-only interface cannot provide adequate audit and recovery visibility. Secret values should never be returned for display; the existing external-MCP read model exposes only environment-variable names and deliberately never decrypts values (files/tovu/external-mcp/list.ts:5-14).

Authentication must be a strategy, not a `token` string. Static tokens are one variant; OAuth grants, installation-scoped credentials, refreshable short-lived credentials, and workload identity require minting or refresh at execution time. Only the durable credential material or reference should be sealed and workspace-scoped. The existing sealer makes plaintext cross the boundary only when sealing/opening, while the secret repository requires `workspaceId` for lookup and deletion (files/tovu/integrations-ports.ts:46-97,157-162). Subprocess credentials, when used, belong in child-only environment variables rather than arguments (files/tovu/mcp-federation/ports.ts:142-147).

For GitHub, I would choose a GitHub App-style, installation-scoped credential and a direct HTTP adapter for workflow/deployment orchestration and status. `gh` is not inherently required. Actual commit publication would use a Git-capable adapter; workflow or deployment orchestration would use the provider API. An MCP server would be optional assistant extensibility, not the authoritative execution engine. The deciding factors are required operation, installation/repository scope, credential lifecycle, idempotency, and availability of durable execution identifiers—not whether a wrapper happens to be branded CLI or MCP.

The owner’s “just MCP, tokens and base URLs” hypothesis is **wrong as the deployment architecture, though partly right as one optional connection form**.

## Option Assessment

- **A — MCP-only:** MCP buys runtime tool discovery, JSON-schema descriptions, namespacing, operator allowlists, permission gating, and a uniform assistant-facing call shape (files/tovu/mcp-federation/ports.ts:60-90,121-136; files/tovu/mcp-federation/trust.ts:57-103). But the implemented transport is stdio-only, so MCP currently means launching a local child process, not merely calling a base URL (files/tovu/mcp-federation/ports.ts:139-147; files/tovu/mcp-federation/adapter.stdio.ts:291-312). Its port has only `listTools`, `callTool`, and `close`, with no durable operation lifecycle (files/tovu/mcp-federation/ports.ts:78-91). The trust gate also refuses tools that honestly self-declare themselves destructive or non-read-only; deployment would therefore require a different trust posture or would perversely favor servers that omit those hints (files/tovu/mcp-federation/trust.ts:271-289). Current federation defaults to a 30-second call timeout and treats remote outcomes as untrusted model data, neither of which constitutes reliable minute-scale deployment tracking (files/tovu/mcp-federation/config.ts:43-48; files/tovu/mcp-federation/registrations.ts:102-120).

- **B — Direct provider HTTP adapters:** This is the preferred first-party transport beneath the deployment domain. It can use the existing guarded HTTP seam and sealed-secret contracts while expressing provider-specific authentication, idempotency, polling, callbacks, and error reconciliation without translating everything into model tools (files/tovu/integrations-ports.ts:5-25,40-40,89-97). Its cost is ongoing provider API maintenance and the danger of reducing richer providers to an impoverished lowest-common-denominator contract.

- **C — CLI subprocess adapters:** Viable only as an explicitly operator-provisioned adapter when a required capability is unavailable through a suitable API. Configuring an MCP command already grants arbitrary code execution as the Tovu process, and the existing gate calls that risk inherent (files/tovu/external-mcp/guard.ts:6-20). The stdio launcher consequently replaces the parent environment with an allowlisted subset plus explicit connection variables (files/tovu/mcp-federation/adapter.stdio.ts:298-312,372-394). Provider CLIs add binary availability, version pinning, output parsing, credential discovery, cancellation, and orphan-process costs. Tovu’s own CLI is machine-introspectable and can even be reshaped into MCP definitions, proving that “CLI versus MCP” is a layering choice rather than a clean transport binary (files/tovu/cli/introspect.ts:101-133).

- **D — Git-push-as-deploy:** Useful as a target adapter for operators whose CI already owns builds and releases, but insufficient as Tovu’s definition of deployment. A successful repository write proves neither that CI started nor that the intended environment reached the requested release. Tovu would still need status reconciliation and a durable run record. The staged CLI also establishes no current export, commit, or push capability (files/tovu/cli/program.ts:35-62).

- **E — Something else:** The selected design is the provider-neutral deployment domain plus durable execution state, with direct HTTP, Git/CI, MCP, and subprocess implementations admitted according to target capability. This keeps assistant control, provider transport, and deployment truth as separate concerns. Current MCP federation is deliberately optional and fail-open during boot, which is appropriate for assistant convenience but not for authoritative deployment state (files/tovu/mcp-federation/bootstrap.ts:18-32,144-151).

## Failure Modes And Sacrifice

Major failure modes and hidden costs are:

- An adapter times out after the provider accepted a request. Retrying without an idempotency or reconciliation contract can create duplicate releases. The existing MCP adapter deletes timed-out request IDs and ignores late replies, which is safe for RPC correlation but cannot answer whether an external side effect occurred (files/tovu/mcp-federation/adapter.stdio.ts:171-188,244-254).

- A worker or Tovu process dies mid-deployment. “Running” must become reconcilable rather than permanently stuck, and provider execution IDs must survive restarts.

- A forged or misrouted callback crosses workspaces. Callback state must resolve through a Tovu-created opaque execution mapping; the current admin guard correctly rejects a workspace path that differs from its dependency-scoped workspace (files/tovu/external-mcp/guard.ts:32-48).

- Concurrent production promotions race, or rollback targets a release that was superseded after the operator opened the page. Environment-level serialization or explicit expected-current-release checks are required.

- Secrets leak through command arguments, provider output, logs, or browser responses. Existing MCP launch specifications already prohibit arguments for secrets, and existing read routes omit credential values entirely (files/tovu/mcp-federation/ports.ts:142-147; files/tovu/external-mcp/list.ts:5-14).

- MCP-specific integrations expose third-party descriptions and results to the assistant. The current trust layer identifies both as prompt-injection surfaces and only claims containment and provenance—not that an external server becomes safe (files/tovu/mcp-federation/trust.ts:44-52,87-103).

- CLI adapters execute vendor-controlled binaries with the Tovu process’s operating-system authority. Environment filtering reduces credential inheritance but does not provide process isolation (files/tovu/mcp-federation/adapter.stdio.ts:298-312).

The genuine sacrifice is integration breadth: first-party HTTP adapters and durable reconciliation take more work per provider than exposing arbitrary MCP tools. I would accept that loss because deployment is a high-impact product operation whose truth, permissions, and recovery cannot be delegated to untrusted runtime tool descriptions.

## What Would Change My Mind

I would favor MCP as the primary adapter if intended providers demonstrated a stable deployment-specific MCP contract with resumable operation IDs, idempotency, status retrieval, cancellation, scoped non-static authentication, and a trust model that permits audited write operations. That would be materially different from the current generic `listTools`/`callTool`/`close` interface and read-oriented admission posture (files/tovu/mcp-federation/ports.ts:78-91; files/tovu/mcp-federation/trust.ts:65-85).

I would favor Git-push-only if the actual requirement is exclusively “publish a deterministic repository revision into operator-owned CI,” every supported deployment already has that CI, and Tovu gains a verified deterministic export/build-to-repository capability. The supplied command tree currently proves none of those site-release operations (files/tovu/cli/program.ts:35-62).

I would favor CLI adapters more broadly if required providers expose essential capabilities only through versioned, noninteractive CLIs with stable machine output, explicit credentials, cancellation, and resumable status.

If “deployment” actually means installing or upgrading the Tovu server itself, this answer changes completely: deployment belongs primarily to the operator’s infrastructure packaging and orchestration system. If it means content promotion, the core becomes revision mapping, dependency validation, conflict handling, and import/export rather than provider deployment APIs.

## Unlisted Option

A viable unlisted option is a **self-hosted pull runner**. Tovu would own signed, workspace-scoped deployment jobs and durable state, while an operator-run agent claims jobs, executes provider CLIs or infrastructure tooling outside the Tovu server process, and reports progress. This is especially valuable where outbound access is restricted or executing configurable commands with the Tovu process’s authority is unacceptable—a risk the existing MCP configuration guard explicitly recognizes (files/tovu/external-mcp/guard.ts:6-20).

Its costs are runner provisioning, version compatibility, lease/retry semantics, and another authenticated protocol. It should be an isolation option, not a proprietary hosted control plane requirement.

## Blind Spots

**(a) Viable option not listed:** The pull-based self-hosted runner above, or a runner constrained to signed OCI artifacts, separates deployment authority and provider tooling from the CMS process.

**(b) Missing question:** Who owns production deployment authority—the workspace, the external repository/application owner, or the Tovu installation operator—and is approval separation required? Current federated calls reuse the coarse `admin.integrations.manage` permission, although authorization can be scoped per connection; production deployment likely deserves explicit environment-level policy rather than inheriting that coarse grant accidentally (files/tovu/mcp-federation/trust.ts:115-135; files/tovu/mcp-federation/registrations.ts:90-100).

**(c) Framing assumption most likely wrong:** That deployment is primarily a transport-selection problem. The real unresolved boundary is the release: its contents, identity, reproducibility, ownership, and relationship to a workspace and environment. MCP can wrap a CLI—the current introspector explicitly turns CLI commands into MCP tool definitions—so choosing MCP before defining deployment semantics merely moves the ambiguity behind another protocol (files/tovu/cli/introspect.ts:101-133).

<<SWARM_END>>