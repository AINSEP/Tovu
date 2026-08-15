I’ll read the packet and repository-source subtree in place, then answer in the packet’s required debate format with path-and-line citations only.
ACK_PACKET_RECEIVED CTX-PLUGINS-2026-08-12 -- I received the packet and will work on it.

## Position

The best answer is a composite option E: make Tier-1 genuinely useful, define one transport-agnostic extension protocol shared by every executable tier, and treat a process-plus-OS-policy boundary as the concrete Tier-2 target. “Adaptive integration” should mean that plugins register against typed, versioned lifecycle contracts and receive only core-mediated capabilities—not that arbitrary code shares the host’s objects or global event bus.

ADR-024 is the right product-honesty frame, but not a sufficient architecture. Its separation of declarative, sandboxed, and trusted execution is sound, as is its rule that marketplace code waits for Tier-2 isolation (files/adr/ADR-024-plugin-execution-and-trust-model.md:31-54). Capabilities must remain a separate axis from execution tier and human authorization, as ADR-024 already says (files/adr/ADR-024-plugin-execution-and-trust-model.md:86-93).

The current encoding is unsafe, however: `tier` is author-declared, the validator accepts all three values, the loader does not enforce a tier-specific execution path, and the UI displays that manifest value verbatim (files/plugin-runtime/manifest.ts:124-126; files/plugin-runtime/manifest.ts:214-217; files/plugin-runtime/loader.ts:140-145; files/spec/ui.spec.md:176-182). A trust tier cannot be mere self-attestation. It must be derived from—or strictly checked against—the artifact and selected runtime: Tier-1 must be structurally code-free, Tier-2 must be executable only through the sandbox host, and Tier-3 must require the explicit trusted-code path.

There is also a direct Tier-1 contradiction to resolve. ADR-024 defines Tier-1 as manifest-only with zero executable code, while SPEC-005 currently requires every artifact to contain `server/index.mjs` (files/adr/ADR-024-plugin-execution-and-trust-model.md:34-37; files/spec/feature.spec.md:103-107). ADR-004’s original envelope likewise assumes a server entry (files/adr/ADR-004-plugin-artifact-format.md:17-27). The artifact envelope should remain, but the server entry must be conditional on execution tier.

The staged runtime should be treated as valuable substrate, not a completed execution loop. `loadPlugin()` currently stops after import and explicitly leaves SDK setup and hook attachment unwired; the hook registry records that no real plugin activation path has called `attach()` (files/plugin-runtime/loader.ts:140-158; files/plugin-runtime/hook-registry.ts:11-20). The traceability matrix also still marks the requirements pending (files/spec/traceability.spec.md:23-68). Broadening the public surface before closing that loop would freeze contracts around behavior that has not yet worked end to end.

**Tier-2 sandbox.** I would choose one restricted child process per plugin activation per workspace, speaking a capability-only RPC protocol. ADR-024’s per-site process rung is useful crash and blast-radius containment, but the ADR itself concedes that it does not enforce filesystem, network, environment, or resource capabilities (files/adr/ADR-024-plugin-execution-and-trust-model.md:71-77). Marketplace-grade Tier-2 therefore requires both process separation and an OS/runtime policy that denies ambient authority. A worker or ordinary process without that second element is containment, not the promised sandbox.

The protocol should preserve ADR-024’s already-correct ABI rules: asynchronous calls, serializable payloads, no live core objects, and capabilities passed by handle (files/adr/ADR-024-plugin-execution-and-trust-model.md:56-69). Its authority surface should include:

- Typed lifecycle subscriptions and constrained filter patches.
- Workspace-bound content reads and gateway-backed mutations.
- Logical plugin storage, settings, jobs, logs, and quotas.
- Secret handles rather than raw root keys.
- Core-mediated HTTP and webhook delivery under egress policy.
- A narrow admin-panel message bridge.

Those are natural extensions of machinery already present: root-key material is represented by an opaque handle, sealing keeps recoverable credentials out of `content.db`, and webhook repositories require workspace scope (files/integrations-ports.ts:46-57; files/integrations-ports.ts:89-97; files/integrations-ports.ts:103-114). The plugin must never choose an arbitrary workspace identifier and thereby turn the broker into a confused deputy; workspace identity belongs to the activation context.

**Adaptive integration.** It is the combination of three things, not a synonym for “many hooks”:

1. Declarative registrations tell core what durable structures and mediated behaviors are desired.
2. Typed lifecycle hooks tell core when plugin logic may observe or contribute.
3. Capability handles determine what effects that logic may cause.

Actions can be asynchronous notifications. Filters must consume immutable snapshots and return bounded patches with deterministic phase, priority, failure, timeout, and composition semantics. The existing hook registry already demonstrates immutable snapshots, namespace validation, deterministic composition, and fail-closed errors (files/plugin-runtime/hook-registry.ts:160-211). But its source/id ordering does not yet implement ADR-024’s required explicit priority and phase contract (files/plugin-runtime/hook-registry.ts:94-107; files/adr/ADR-024-plugin-execution-and-trust-model.md:95-99). A general broadcast event bus is not an authority model and should remain an internal transport, not the author-facing abstraction.

**Plugin-owned data.** Plugins should never execute raw DDL. Simple Tier-1 data belongs in declared, namespaced JSON fields, which the approved spec already retains across disable and uninstall (files/spec/feature.spec.md:200-208). Plugins needing relational data should submit a dialect-neutral schema declaration; core owns naming, migration generation, locking, snapshots, and execution for each supported database.

Disable must remain non-destructive. Uninstall should retain data by default. Purge must be a separate, explicit destructive operation. Code rollback may flip an installed-version pointer, but it cannot honestly promise free schema rollback: ADR-004’s near-total pointer rollback depended on the no-DDL rule (files/adr/ADR-004-plugin-artifact-format.md:52-54), while the newer activation surface acknowledges that enabling a data module can run core-mediated DDL and disabling only reverses the activation flag (files/plugin-runtime/agent-tools.ts:19-27; files/plugin-runtime/agent-tools.ts:102-105). Schema compatibility therefore belongs in update preflight, not in a blanket “pointer flip solves rollback” claim.

**Admin UI.** Tier-1 should use declarative forms and menu descriptors rendered entirely by core. Tier-2 panels should run in sandboxed iframes and communicate through the same serializable, capability-checked bridge. ADR-024 already identifies same-origin session theft and names iframe plus `postMessage` as the required isolation direction (files/adr/ADR-024-plugin-execution-and-trust-model.md:101-106).

For untrusted panels, I would explicitly supersede ADR-004’s rule that React and the editor runtime are host-provided externals (files/adr/ADR-004-plugin-artifact-format.md:43-48). A sandboxed panel should bundle its own renderer or use a framework-neutral UI protocol, so host React upgrades do not become cross-realm ABI breaks. Host-shared React can remain a Tier-3 convenience.

**Updates and distribution.** The artifact already has the right raw ingredients—semantic versions, `sdkRange`, integrity, provenance, dependencies, and side-by-side versions (files/adr/ADR-004-plugin-artifact-format.md:29-54). A full ecosystem needs deterministic per-workspace resolution and a persisted lock, rather than the current discovery behavior of silently selecting the greatest installed semver (files/plugin-runtime/discovery.ts:144-160). Updates should be compatibility-preflighted and activated as one dependency set.

Signing proves publisher identity, not safety; ADR-024 states that distinction directly (files/adr/ADR-024-plugin-execution-and-trust-model.md:16-20). Marketplace metadata should therefore carry publisher identity, immutable artifact hashes, provenance, compatibility, and advisory revocation. A kill switch should quarantine locally after crashes or policy violations and present signed advisories to operators; remote automatic disable would itself violate the never-brick promise, as ADR-024 recognizes (files/adr/ADR-024-plugin-execution-and-trust-model.md:138-147).

**Three extension systems.** Converge the operator experience and vocabulary, not the runtimes. Themes already reuse the envelope and tier concepts (files/adr/ADR-004-plugin-artifact-format.md:69-70; files/adr/ADR-024-plugin-execution-and-trust-model.md:31-45). Agent Plugins have a distinct portable packaging purpose and are not themselves a Tovu sandbox or permission system (PACKET.md:67-72). Users should see one “Extensions” control plane with clear type, publisher, workspace scope, execution mode, capabilities, health, and update state, while each extension type retains its appropriate artifact and runtime.

The smallest ecosystem-bearing slice is a truly code-free Tier-1 artifact with install, configuration, lifecycle, and distribution semantics—not merely a manifest parser. ADR-024’s recorded demand audit says Tier-1 covers roughly 60–73% only if core provides mediated primitives such as webhooks, forms, redirects, mail, and asset injection; it also says the highest-value commerce case still requires Tier-2 (files/adr/ADR-024-plugin-execution-and-trust-model.md:148-160). That supports Tier-1 as an on-ramp, not as an excuse to abandon the sandbox.

## Option Assessment

- **A — Grow Tier-1 first:** Correct as the ecosystem-facing slice, provided Tier-1 becomes structurally incapable of containing executable code and receives the mediated primitives on which its claimed coverage depends. Pure A is weak if “defer the sandbox” has no marketplace gate; ADR-024’s strongest safeguard is precisely that executable marketplace distribution cannot outrun isolation (files/adr/ADR-024-plugin-execution-and-trust-model.md:47-54).

- **B — Build Tier-2 now:** Correct as a defined security target, but weak as the sole product bet. A process rung alone does not meet ADR-024’s capability-sandbox requirement (files/adr/ADR-024-plugin-execution-and-trust-model.md:71-77), and the current loader does not yet complete setup or registration (files/plugin-runtime/loader.ts:147-158). Building a broad sandbox API before proving the broker protocol through real extensions risks freezing the wrong capabilities.

- **C — Expand the hook surface:** Reject “hook count” as the measure of adaptiveness. Hook signatures are an effectively irreversible ecosystem API, which is why ADR-024 freezes async, serializable contracts before third parties exist (files/adr/ADR-024-plugin-execution-and-trust-model.md:56-69). The approved spec itself requires review before adding hook points or capability tokens (files/spec/feature.spec.md:355-365). Hooks should follow demonstrated extension demand, with action/filter, phase, priority, timeout, and failure semantics defined together.

- **D — Converge all extension systems:** Reject one universal artifact/runtime. Theme rendering, CMS server behavior, and portable agent skills have different authority and compatibility needs. Converge discovery, consent, status, updates, and terminology; keep execution contracts separate.

- **E — Capability-broker architecture:** This is my preferred decomposition. Tier-1 declarations and Tier-2 processes become two clients of the same core-owned registries and capability model, while Tier-3 remains an explicitly dangerous compatibility path.

## Failure Modes And Sacrifice

- A nominal “process sandbox” still exposes the site if filesystem, environment, network, and resource controls remain ambient; ADR-024 explicitly separates per-site process isolation from capability-grade isolation (files/adr/ADR-024-plugin-execution-and-trust-model.md:71-77).

- A broker can become a confused deputy if plugins supply workspace IDs, URLs, paths, or secret identifiers that are not rebound to the activation’s grants. Existing persistence ports consistently carry `workspaceId`, illustrating the required structural boundary (files/integrations-ports.ts:103-114; files/integrations-ports.ts:149-162).

- Hook chains can become a latency and availability multiplier. The current registry awaits filters serially and acknowledges that plugin execution cost is unbounded (files/plugin-runtime/hook-registry.ts:138-141; files/plugin-runtime/hook-registry.ts:160-170). Timeouts, cancellation, circuit breakers, and quarantine are ecosystem invariants, not optional monitoring polish.

- Tier-1 can quietly become executable through expressions, templates, or webhook interpolation. ADR-024 therefore requires its expression language to remain total, side-effect-free, and bounded-cost (files/adr/ADR-024-plugin-execution-and-trust-model.md:79-84).

- “Reversible activation” can conceal irreversible data evolution. The current activation function persists the enabled row before invoking the load callback (files/plugin-runtime/activation.ts:112-135), and data-module enablement may perform live schema changes (files/plugin-runtime/agent-tools.ts:19-27). Recovery must cover the entire activation transaction, not only the boolean flag.

- Dependency resolution can create diamond conflicts, abandoned dependencies, and incompatible rollback sets. Dependencies exist in the artifact contract, but SPEC-005 still defers their resolution (files/adr/ADR-004-plugin-artifact-format.md:29-40; files/spec/feature.spec.md:265-270).

- An iframe bridge can merely relocate authority if its messages accept arbitrary API requests. Panel messages need schemas and the same capability checks as server-side RPC; the iframe itself is only the containment mechanism.

- Publisher signatures do not protect against compromised publisher updates. Integrity and provenance are necessary evidence, not behavioral trust (files/adr/ADR-024-plugin-execution-and-trust-model.md:16-20).

The genuine sacrifice is WordPress-style immediacy and intimacy. Tier-2 authors lose synchronous hooks, shared transactions, live host objects, host React internals, arbitrary native modules, and unrestricted filesystem/network access. ADR-024 already records the chatty asynchronous ABI and loss of live transaction context as a real accepted DX cost (files/adr/ADR-024-plugin-execution-and-trust-model.md:129-131). Tovu should accept that smaller surface rather than sell unsafe equivalence to WordPress.

## What Would Change My Mind

I would move isolation ahead of Tier-1 breadth if a fresh catalog of actual target extensions showed that the existing 60–73% declarative-demand estimate does not survive real customer requirements, or if the required “declarative” primitives became a programming language in disguise. ADR-024 itself names a low Tier-1 coverage result as the condition that restores isolation-first urgency (files/adr/ADR-024-plugin-execution-and-trust-model.md:148-160).

I would accept a worker or isolate instead of the process design only after adversarial escape tests demonstrated enforced denial of filesystem, environment, network, cross-workspace access, and resource exhaustion while preserving the accepted artifact and asynchronous ABI.

I would permit broader hooks after multiple real plugins independently require the same lifecycle point and conformance tests establish deterministic ordering, failure, retry, and rollback behavior. The current spec sensibly ties catalog growth to demonstrated plugin demand (files/spec/feature.spec.md:258-271).

I would reconsider isolated admin panels if evidence showed that essential extension classes cannot work through declarative UI or a message bridge. That evidence would need to outweigh the same-origin credential risk ADR-024 identifies (files/adr/ADR-024-plugin-execution-and-trust-model.md:101-106).

I would reconsider the no-raw-DDL rule only if a core-owned logical schema layer could not express proven workloads across supported dialects. Even then, marketplace code should not receive database credentials or arbitrary migration execution.

## Unlisted Option

A viable unlisted option is a remote connector or operator-deployed sidecar mode. The local artifact remains code-free and declares events, settings, permissions, and an endpoint; core sends signed webhooks and exposes narrowly scoped APIs. Third-party code runs outside the Tovu process and machine boundary selected by the operator.

This is a deployment mode, not a fourth trust tier. It builds naturally on Tier-1’s core-mediated webhook concept (files/adr/ADR-024-plugin-execution-and-trust-model.md:34-37) and the existing egress, keyring, sealing, subscription, and delivery abstractions (files/integrations-ports.ts:1-25; files/integrations-ports.ts:46-97; files/integrations-ports.ts:103-155). It could support sophisticated integrations before local arbitrary-code isolation exists, while making data disclosure and availability tradeoffs explicit.

## Blind Spots

**(a) Viable option not listed:** The remote connector/sidecar plane above. It separates “third parties can program integrations” from “Tovu must safely execute their JavaScript locally.”

**(b) Missing question:** What is the principal and lifetime of a capability grant? The design needs to define whether consent belongs to a publisher, artifact version, plugin installation, workspace activation, or individual operator—and what happens to grants when a site is cloned, restored, exported, or transferred. Current activation state is workspace-and-plugin scoped (files/plugin-runtime/activation.ts:27-44), while ADR-024 correctly says capability and human authorization are separate axes (files/adr/ADR-024-plugin-execution-and-trust-model.md:86-93).

**(c) Framing assumption most likely wrong:** That `plugin.tier` is trustworthy as a manifest-authored property. The current system validates only vocabulary, projects the value into discovery, and renders it directly to the operator (files/plugin-runtime/manifest.ts:214-217; files/spec/state.spec.md:59-68; files/spec/ui.spec.md:176-182). Execution trust is a property of the artifact’s actual contents plus the host runtime selected for it. The manifest may request a mode, but Tovu must determine and enforce the effective tier.

<<SWARM_END>>