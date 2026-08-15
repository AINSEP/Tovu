# Swarm Consensus Context Packet

**Packet ID:** `CTX-DEPLOY-2026-08-12`
**Date:** 2026-08-12
**Slug:** tovu-deployments
**Project Type:** brownfield (but the feature itself is greenfield)
**Mode:** debate — Round 1 (independent first pass, solution-neutral)

---

## Preamble for peer models

- IGNORE ALL PRIOR CONVERSATION HISTORY. New task. Discard recollections of packets about theme tiers, composers, plugins, commerce, or MCP tool catalogs.
- No `AGENTS.md`/`CLAUDE.md`/bootstrap file here. Intentional. A missing file is never a reason to stop.
- Do not read outside your working directory. Do not chain reads with `&&`.
- Read `files/`; ground claims in `path:line`.
- Round 1. Independent position. No other participant's answer included, deliberately.

---

## The Need

Tovu is a self-hostable, multi-workspace CMS with an embedded AI assistant. It has **no deployment feature of any kind**. The owner wants one, and wants to know what the backend already provides versus what the frontend would need.

The owner's working hypothesis, stated plainly so you can attack it: *"I'm thinking just MCP — so just access tokens and base URLs. But I'm not sure for things like GitHub whether we need CLIs. Take stock and let's see what we need."*

**A prior question the owner has not answered, and which this packet deliberately leaves open: what is being deployed?** Candidate readings include the rendered site, the Tovu instance itself, a theme, a plugin, or content changes promoted between environments. These imply very different systems.

## The Exact Question

> What should "deployment" mean for Tovu, and what is the right integration surface for it — MCP tools, CLI subprocesses, direct HTTP APIs, or something else — given what the backend already has?

---

## Repository Facts (verified)

### F1 — There is no deployment code. At all.

A search for `deploy` across the entire server tree (`src/`) and the admin SPA (`apps/admin/src/`) returns **zero hits**. No route group, no feature module, no UI section, no CLI command. This is genuinely greenfield inside a mature codebase.

### F2 — The backend surface that *does* exist

32 admin route groups: `analytics`, `assistant`, `change-sets`, `comments`, `commerce`, `connectors`, `content`, `content-types`, `database`, `database-recovery`, `entries`, `external-mcp`, `forms`, `integrations`, `marketplace`, `media`, `members`, `menus`, `newsletter`, `pages`, `plugins`, `posts`, `presentation`, `recovery`, `redirects`, `seo`, `settings`, `system`, `taxonomy`, `themes`, `users`, `widgets`, `workspace`.

Note `change-sets` (a reversible-change mechanism), `recovery` / `database-recovery`, and `system/module-status.ts` — the only health-shaped endpoint found.

### F3 — MCP is already federated, with a trust module

`mcp-federation/` provides `adapter.stdio.ts`, `adapter.memory.ts`, `bootstrap.ts`, `config.ts`, `presets.ts`, `registrations.ts`, `ports.ts`, and **`trust.ts`**. Separately, `admin/external-mcp/` exposes `list.ts`, `put.ts`, `delete.ts` and a `guard.ts` — i.e. operators can already register external MCP servers through the admin API, behind a guard.

**Important:** the stdio adapter means MCP servers are already launched as **local subprocesses**. "MCP instead of CLIs" is not automatically a subprocess-free choice.

### F4 — Credential machinery already exists and is non-trivial

`integrations/ports.ts` declares `RootKeyHandle`, `KeyringPort`, `SecretSealerPort`, `IntegrationSecretRepoPort`, `WebhookSubscriptionRepoPort`, `WebhookDeliveryRepoPort`, and re-exports `HttpClientPort` with an **`EgressPolicy`** (the HTTP client is guarded — pinned DNS/SSRF policy, response caps, redirect revalidation). Concrete implementations include an AES-GCM secret sealer, an env keyring, and a sqlite secret repo.

So "access tokens and base URLs" is not a new capability — there is already a sealed-secret store and a guarded outbound HTTP client to build on.

### F5 — Tovu already ships a CLI, and it is machine-introspectable

`src/cli/` contains `main.ts`, `program.ts`, `commands/`, `help.ts`, `errors.ts`, and **`introspect.ts`**. The CLI can emit a machine-readable description of its own capability surface. Tovu is therefore already both an MCP *client* and a CLI *provider*.

### F6 — The assistant launches agent CLIs, not hosted APIs

The embedded assistant works by detecting and launching agent CLI binaries on `PATH`; it is not an API-key-driven hosted integration. Whatever transport deployment uses will sit alongside that existing subprocess-launching reality.

### F7 — There is a reversibility primitive already

Enable/disable of plugins is implemented as a **change-set with free rollback**, and there are `recovery` and `database-recovery` route groups. A deployment system would not be inventing reversibility from nothing.

---

## Constraints

| # | Constraint |
|---|---|
| C1 | **Self-hostable.** A design requiring a proprietary hosted control plane changes the product shape and must be flagged. |
| C2 | **Multi-workspace.** One process serves several sites; deploy actions must be workspace-scoped and must never infer a workspace from callback data. |
| C3 | Secrets must go through the existing sealed-secret ports; plaintext must never land in config, content revisions, logs, or browser responses. |
| C4 | Outbound HTTP should use the guarded `HttpClientPort` with its `EgressPolicy`, not raw fetch. |
| C5 | Nothing may present unproven capability as working (standing product rule). |
| C6 | The assistant should be able to drive this, since it is the product's differentiator. |

## Candidate designs to evaluate (options, not a proposal — attack them)

- **A — MCP-only.** Every deploy target is an MCP server (first-party or third-party). Tovu stores tokens + base URLs and speaks MCP. This is the owner's hypothesis; treat it as one option, not the answer.
- **B — Direct provider HTTP adapters.** Tovu talks to each provider's REST API through the guarded `HttpClientPort`, with a provider-neutral port and per-provider adapters — the same pattern commerce already chose for payments.
- **C — CLI subprocess adapters.** Shell out to provider CLIs (`gh`, `vercel`, `wrangler`, `docker`) already installed on the host, mirroring how the assistant already launches agent CLIs.
- **D — Git-push-as-deploy.** Tovu writes to a repository and the deployment is whatever the operator's existing CI already does. Tovu ships no deploy runtime at all.
- **E — Something else.**

## Open questions (address these)

1. **What is being deployed?** Answer this before choosing a transport — the packet deliberately does not decide it. Say which reading you assume and why.
2. **MCP vs CLI is not a clean binary** (see F3: stdio MCP *is* a subprocess). What does choosing MCP actually buy over a direct HTTP adapter, and what does it cost?
3. **GitHub specifically.** Does it need `gh`, a REST/GraphQL adapter, a GitHub App, or an MCP server? What decides that — auth model, scope granularity, or something else?
4. **Auth beyond tokens.** OAuth device flow, GitHub App installation tokens, short-lived OIDC. Is "store an access token" sufficient, and what breaks when it isn't?
5. **Long-running work.** Deploys take minutes and can fail halfway. Where does status live, how is progress surfaced, and what does the admin UI poll or subscribe to?
6. **Rollback.** Does the existing change-set/recovery machinery apply, or is deploy rollback a different concept entirely?
7. **Environments and promotion.** Are staging/production first-class, and does content promote between them?
8. **Frontend surface.** What does the admin actually need — a section, a per-target config panel, a run log, or an assistant-driven flow with no dedicated UI?
9. **Sequencing.** Smallest honest slice, and its rollback.

## Adversarial task

1. Best design and why. 2. Reject weak options with specific reasons tied to what exists. 3. Failure modes, hidden costs, one genuine sacrifice. 4. What evidence would change your answer. 5. State plainly whether the owner's "just MCP, tokens and base URLs" hypothesis is right, partly right, or wrong.

No implementation plan, no ranked slate, no code this round.

## Unlisted Option (required)

A strong option or decomposition not listed? "No, the listed options cover it" is valid.

## Blind Spots (required — all three)

**(a)** A viable option not listed. **(b)** A question we should be asking but aren't. **(c)** The framing assumption most likely wrong, and why.

---

## Staged Files

| Path | Why |
|---|---|
| `files/tovu/integrations-ports.ts` | Keyring, secret sealer, secret repo, webhooks, guarded HTTP + egress policy |
| `files/tovu/mcp-federation/*` | Existing MCP adapters, config, presets, registrations, and trust module |
| `files/tovu/external-mcp/*` | Admin routes for registering external MCP servers, and the guard |
| `files/tovu/cli/*` | Tovu's own CLI, including `introspect.ts` |
| `files/tovu/module-status.ts` | The only health-shaped endpoint that exists |

---

## Required response format

Begin with exactly:

```
ACK_PACKET_RECEIVED CTX-DEPLOY-2026-08-12 -- I received the packet and will work on it.
```

Headings: `## Position`, `## Option Assessment`, `## Failure Modes And Sacrifice`, `## What Would Change My Mind`, `## Unlisted Option`, `## Blind Spots`. End with `<<SWARM_END>>` on its own line.
