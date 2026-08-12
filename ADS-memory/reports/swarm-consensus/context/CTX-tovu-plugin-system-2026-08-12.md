# Swarm Consensus Context Packet

**Packet ID:** `CTX-PLUGINS-2026-08-12`
**Date:** 2026-08-12
**Slug:** tovu-plugin-system
**Project Type:** brownfield
**Mode:** debate — Round 1 (independent first pass, solution-neutral)

---

## Preamble for peer models

- IGNORE ALL PRIOR CONVERSATION HISTORY. New task. Discard any recollection of packets about theme tiers, composer internals, or MCP tool catalogs.
- No `AGENTS.md`/`CLAUDE.md`/bootstrap file exists here. Intentional. A missing file is never a reason to stop; reporting yourself blocked is a wrong answer.
- Do not read outside your working directory. Do not chain reads with `&&`.
- Read `files/`; ground claims in `path:line`.
- Round 1. Independent position. No other participant's answer is included, deliberately.

**Note on a later round:** the product owner has specifically asked that one participant (Codex GPT-5.6 Sol at xhigh) produce a full plugin-system design in **Round 2**, for the other participants to attack. Round 1 remains position-forming for everyone. Do not produce a design document now.

---

## The Need

Tovu is a self-hostable, multi-workspace CMS in TypeScript. It wants a **plugin ecosystem in the WordPress sense** — third parties extend the product, users install extensions without touching code, and the extensions integrate *adaptively* (they hook into the product's own lifecycle rather than being bolted on).

WordPress plugins are interpreted PHP dropped into a folder. A TypeScript runtime has no equivalent unless one is defined.

## The Exact Question

> Given the tiered trust model and partial runtime already in place, what is the right design for a full plugin ecosystem — and specifically, what does "adaptive integration" mean when the sandbox that makes third-party code safe does not yet exist?

---

## Repository Facts (verified)

### F1 — This is NOT greenfield. There is an accepted architecture and a working runtime.

- **ADR-004 (ACCEPTED)** defines the artifact: a `.tovu-plugin` tarball containing `tovu.plugin.json` (manifest), `server/index.mjs` (prebuilt ESM entry exporting `definePlugin()`), optional `admin/panel.mjs` + `admin/panel.css` (prebuilt React admin-UI bundles), `assets/`, `LICENSE`, `README.md`. Its stated motivation: *"Without this, 'plugins' silently become workspace packages and the single-binary install-dir product model dies."*
- **SPEC-005 v1.1.2, status APPROVED** — "Plugin System — Artifact, Capability-Scoped Loader, One Hook, `ext.*` Fields (v1 Walking Skeleton)".
- **~1,578 lines of implemented runtime** under `plugin-runtime/`: `discovery.ts` (255), `manifest.ts` (277), `hook-registry.ts` (215), `loader.ts` (202), `activation.ts` (152), `tool-registrations.ts` (151), `capability-sdk.ts` (118), `agent-tools.ts` (109), plus sqlite/memory repos.

### F2 — ADR-024 defines a tiered trust model, and it is the load-bearing decision

> **Tier-1 — Declarative (zero executable code).** Manifest-only: content types & fields, taxonomies, expression indexes, settings schemas, declarative admin menu items/forms, declarative theme presets, and **core-mediated** webhooks. *"Installable from anyone, today — there is nothing to isolate. This is the ecosystem's on-ramp."*
>
> **Tier-2 — Sandboxed code.** Executable plugin code under isolation. *"Ships with the marketplace, not before."*
>
> **Tier-3 — Trusted code.** Today's in-process ESM reality. *"Local / first-party / explicitly sideloaded only,"* honestly labeled at install as *"this plugin runs with full access to your machine and every site on it."* **Never the default and never marketed as safe.**

The forcing function, stated explicitly:

> *"'Install from anyone' means Tier-1 now, Tier-2 later, and NEVER Tier-3."*
> *"Tier-3 plugins are never listable in the public marketplace. The catalog physically cannot offer executable third-party code until Tier-2 isolation exists — so **shipping the marketplace is shipping the sandbox.**"*
> *"Installability ≠ enablement."* Enable/disable is a change-set with free rollback.

`plugin.tier` is a required, validated manifest field (`tier-1` | `tier-2` | `tier-3`); every v1 manifest today declares `tier-3`.

### F3 — v1 is deliberately a walking skeleton: **one hook**

The spec's own title says "One Hook." `hook-registry.ts` exposes `createHookRegistry()`, `HookRegistry`, `HookRegistryFieldDecl`, and an `AttachmentSource` of `"built-in" | "site" | "glue"`. A filter that throws is caught by the caller and mapped to a 500 `PLUGIN_HOOK_FAILED`. There is a `capability-sdk.ts` building a **capability-scoped SDK** per plugin — the isolation-by-interface layer, distinct from process isolation.

### F4 — Install is filesystem-only

REQ-02's install path is filesystem-only; there is no upload endpoint and no per-plugin settings/config UI (carried as an open question). An admin list screen with enable/disable and a per-row trust-tier badge is specified.

### F5 — There are two other extension systems in the same product

1. **Agent Plugins** (agent-plugins.org standard) — a separate, portable packaging format for Skills and MCP servers, with its own admin screen. Explicitly *not* an install/permission/sandbox/trust model.
2. **Themes** — a five-tier system whose tier vocabulary ADR-024 explicitly generalizes from (`theme.json.tier` → `plugin.tier`).

A user could plausibly encounter three different "extension" concepts.

### F6 — Adjacent machinery that a plugin system would want

Integration ports already exist for secrets: `KeyringPort`, `SecretSealerPort`, `RootKeyHandle`, `IntegrationSecretRepoPort`, plus `WebhookSubscriptionRepoPort` / `WebhookDeliveryRepoPort` and an `HttpClientPort` with an `EgressPolicy`. There is a change-set system providing free rollback, and a `tool-audit` feature that is explicitly non-gating.

---

## Constraints

| # | Constraint |
|---|---|
| C1 | **Self-hostable, single-binary install-dir product model.** ADR-004 exists to protect it. |
| C2 | **Multi-workspace.** One process serves several sites; a plugin must not cross workspace boundaries. |
| C3 | **ADR-024's honesty rule:** never market unsandboxed execution as safe; never make Tier-3 the default. |
| C4 | **TypeScript/Node runtime.** No PHP-style interpreted drop-in exists for free. |
| C5 | Existing APPROVED spec, accepted ADRs, and ~1,578 lines of runtime must be built on or explicitly superseded — not silently ignored. |
| C6 | Enable/disable must stay reversible (change-set backed). |

## Candidate designs to evaluate (options, not a proposal — attack them)

- **A — Grow Tier-1 first.** Invest in making the declarative tier genuinely expressive (content types, fields, taxonomies, settings schemas, admin forms, core-mediated webhooks) so a real ecosystem exists with zero executable third-party code. Defer the sandbox.
- **B — Build the Tier-2 sandbox now.** Treat isolation as the critical path, because ADR-024 makes the marketplace depend on it. Candidate mechanisms: separate OS process with IPC, `worker_threads` with a capability-only SDK, WASM, or a V8 isolate.
- **C — Expand the hook surface.** The WordPress analogy is really about *hooks* — many well-known extension points. Go wide on hooks and filters over the capability-scoped SDK, staying at Tier-3 for first-party and Tier-1 for third-party.
- **D — Converge the three extension systems.** One artifact, one trust vocabulary, one admin surface covering plugins, Agent Plugins, and themes.
- **E — Something else.**

## Open questions (address these)

1. **What is the Tier-2 sandbox concretely?** Process, worker, WASM, or isolate — and what is the capability surface crossing that boundary? Note the codebase already rejected `vm2` (escape CVEs) and `isolated-vm` (native compilation) elsewhere.
2. **What does "adaptive integration" actually mean here?** WordPress's power is `add_action`/`add_filter` ubiquity. Is the equivalent many hooks, a capability SDK, declarative manifests, or an event bus?
3. **Plugin-owned data.** Can a plugin create tables/columns? What happens on uninstall, on rollback, and across three DB dialects?
4. **Admin UI extension.** ADR-004 ships prebuilt React panels. How are they isolated from the host admin, and what happens when the host's React version moves?
5. **Update, versioning, dependency resolution, and kill-switch.** None of these are specified.
6. **Distribution.** Signing, provenance, revocation, and who runs the marketplace.
7. **Three extension systems.** Converge, keep separate, or retire one? What does the user see?
8. **Sequencing.** Given "shipping the marketplace is shipping the sandbox," what is the smallest slice that grows an ecosystem without shipping the sandbox first?

## Adversarial task

1. Best design and why. 2. Reject weak options with specific reasons tied to the artifacts. 3. Failure modes, hidden costs, one genuine sacrifice. 4. What evidence would change your answer. 5. Whether ADR-024's tier model is the right frame at all — say so plainly if you think it is wrong.

No implementation plan, no ranked slate, no code this round.

## Unlisted Option (required)

A strong option or decomposition not listed above? "No, the listed options cover it" is valid.

## Blind Spots (required — all three)

**(a)** A viable option not listed. **(b)** A question we should be asking but aren't. **(c)** The framing assumption most likely wrong, and why.

---

## Staged Files

| Path | Why |
|---|---|
| `files/adr/ADR-004-plugin-artifact-format.md` | The accepted artifact format |
| `files/adr/ADR-024-*.md` | The accepted tiered trust model — the load-bearing decision |
| `files/spec/*.spec.md` | SPEC-005 APPROVED: feature, behavior, state, errors |
| `files/plugin-runtime/*.ts` | The ~1,578-line implemented runtime |
| `files/integrations-ports.ts` | Existing secret/keyring/webhook/egress ports a plugin system would build on |

---

## Required response format

Begin with exactly:

```
ACK_PACKET_RECEIVED CTX-PLUGINS-2026-08-12 -- I received the packet and will work on it.
```

Headings: `## Position`, `## Option Assessment`, `## Failure Modes And Sacrifice`, `## What Would Change My Mind`, `## Unlisted Option`, `## Blind Spots`. End with `<<SWARM_END>>` on its own line.
