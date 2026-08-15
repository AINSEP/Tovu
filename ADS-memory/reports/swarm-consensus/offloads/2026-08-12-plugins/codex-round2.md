I’ll read the complete Round 2 packet and appendix first, then inspect the cited source files and shape the response to the packet’s exact format.
The packet’s key distinction is emerging clearly: correctness and recoverability are immediate gates, while design work can still proceed in parallel. I’m now verifying the runtime and spec details that determine where the gate applies and how narrow the next surface expansion should be.
ACK_PACKET_RECEIVED CTX-PLUGINS-R2-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

My destination is unchanged: retain ADR-024’s tier model, grow Tier-1 through core-mediated primitives, expose transport-agnostic typed contracts, and defer the full Tier-2 sandbox until executable-plugin demand justifies it.

The verified wiring failure materially changes my sequencing. Completing the SPEC-005 loop and adding failure recovery are now a joint P0—not merely cleanup before catalog growth. Executable code currently imports and is discarded, after which `loadPlugin()` returns `{loaded:true}` without invoking `setup()` or attaching anything (files/plugin-runtime/loader.ts:140-158). Worse, activation state is persisted as enabled before `onEnabled` runs, so a failed or incomplete load can leave durable state claiming success (files/plugin-runtime/activation.ts:116-135).

After that P0, the ecosystem bottleneck is **surface, not trust**. Advancing a Tier-3 plugin into a per-site process changes its blast radius but does not let it do anything new. The runtime still recognizes only three capabilities and one hook, while `adminSurfaces` has no behavior (files/plugin-runtime/manifest.ts:32-36; files/plugin-runtime/manifest.ts:59-63; files/plugin-runtime/manifest.ts:123-126). Surface does not, however, mean indiscriminately adding hooks: admin descriptors, webhooks, redirects, and similar primitives may be core-owned registrations rather than lifecycle callbacks.

## Sequencing Verdict

1. **P0: close and certify the existing vertical loop.** The enable path must retain the imported module, build the per-plugin SDK, invoke `setup()`, attach the resulting declared filter, and undo or quarantine activation if any step fails. Boot-time restoration, disable/detach, re-enable, and gateway revert must use the same path. Completion means AC-01 and AC-02 pass through the documented API path—not a test-only attachment seam (files/spec/feature.spec.md:107-113; files/spec/feature.spec.md:171-176).

   This is a shipping precondition for any new plugin-facing hook or Tier-1 claim. It is not a global stop-work order: catalog research, core-only webhook infrastructure, primitive feasibility work, and draft contracts can proceed in parallel. They simply must not freeze new public SDK surface or be called delivered plugin functionality until the skeleton works.

2. **P0 alongside wiring: local recovery/quarantine.** EC-10 permits one plugin to reject every save until an operator manually disables it (files/spec/feature.spec.md:232-233). That violates ADR-024’s sequencing invariant that no feature ship beyond its recovery rung; safe-mode quarantine is explicitly foundational (files/adr/ADR-024-plugin-execution-and-trust-model.md:108-117; files/adr/ADR-024-plugin-execution-and-trust-model.md:136-147).

   The current request should remain fail-closed and leave content unchanged. But the runtime already attributes hook failures to `pluginId`, so it has the information needed to trip a local circuit breaker and detach/quarantine the offender (files/plugin-runtime/hook-registry.ts:51-60; files/plugin-runtime/hook-registry.ts:168-203). Contract violations such as an invalid patch or capability denial justify immediate quarantine; generic exceptions can use a tightly bounded retry threshold. The operator must see the reason and explicitly re-enable. This is local failure containment, not ADR-024’s rejected remote auto-disable kill switch.

   Recovery is more urgent than either A or C because both multiply the number of failure-producing paths. It should ship with loop completion, before either expands production surface.

3. **Audit the existing ABI before multiplying it.** The public spec documents `(entry, ctx) => ExtPatch`, while execution awaits the callback; the snapshot also clones only the top level plus `ext` (files/spec/feature.spec.md:109; files/plugin-runtime/hook-registry.ts:160-170). Round 3 should settle an explicitly asynchronous return type and prove structured-clone-safe isolation of nested payloads. It must also add the priority and phase contract ADR-024 requires; current ordering is only source rank plus plugin id (files/plugin-runtime/hook-registry.ts:94-107; files/adr/ADR-024-plugin-execution-and-trust-model.md:95-99).

4. **Then grow surface through vertical, demand-backed slices.** Start with webhooks because the staged code already has workspace-scoped subscription/delivery repositories, retries, and HKDF signing support (files/integrations-ports.ts:59-86; files/integrations-ports.ts:103-155). Treat snippet/assets, mail, redirects, and form submissions as four separate feasibility-and-delivery slices, each exercised by a real plugin.

   The 60–73% Tier-1 estimate is conditional, not delivered capacity: ADR-024 expressly conditions it on all five primitives and still assigns the highest-value plugin to Tier-2 (files/adr/ADR-024-plugin-execution-and-trust-model.md:148-160). Tier-1 also needs a structurally code-free artifact path; the present spec requires `server/index.mjs` for every artifact, contradicting Tier-1’s zero-code definition (files/spec/feature.spec.md:103-107; files/adr/ADR-024-plugin-execution-and-trust-model.md:31-42). Therefore A is not a cheap manifest expansion.

5. **Background work is in the ecosystem roadmap, but out of the immediate P0/P1 build.** It should receive a dedicated contract soon, not become another generic hook. The current vocabulary has neither a jobs capability nor a scheduled hook, and ADR-024 explicitly defers Electron sleep/catch-up semantics (files/plugin-runtime/manifest.ts:32-36; files/adr/ADR-024-plugin-execution-and-trust-model.md:138-147).

   Tier-1 can eventually declare schedules for bounded core-owned operations. Arbitrary scheduled plugin code waits for Tier-2 isolation. The specification must define persistence, missed-run coalescing, idempotency, workspace binding, quotas, timeout, attribution, disable/update behavior, and quarantine before implementation. Deferring those semantics indefinitely would exclude a major WordPress-class workload; forcing them into the next walking slice would overload it.

## Remaining Disagreements

**Surface versus hook count.** Surface is the higher-leverage axis, but “go wide on hooks” is too coarse. A redirect executor is better modeled as a validated core rule; an admin menu as a descriptor; a webhook as a durable subscription. Hooks should be reserved for genuine lifecycle observation or contribution.

**Per-hook cost.** Each hook is a miniature durable protocol requiring:

- A demonstrated consumer and action-versus-filter classification.
- Versioned, serializable input and result schemas.
- Capability and authorization mapping.
- Transaction phase, priority, deterministic composition, and conflict rules.
- Fail-open/fail-closed behavior, timeout, retry, cancellation, and quarantine policy.
- Attribution, replay/idempotency rules, performance bounds, and conformance tests.
- Attach, detach, boot restoration, update, and disable behavior.

The existing hook executes filters serially and explicitly has no plugin latency bound (files/plugin-runtime/hook-registry.ts:138-170). That cost changes Q2 from “expand broadly” to “add a small catalog driven by the second and third real plugins.” INV-06 correctly prevents falling back to dynamic hook soup (files/spec/feature.spec.md:200-208).

**Trust-rung timing.** Per-site process isolation remains valuable safety work, especially once real Tier-3 plugins exist, but it is not the next ecosystem unlock. The full sandbox-first option remains rejected as settled. Bring Rung 1 forward only as a risk-reduction project after the ABI audit, not as a substitute for usable surface.

## Strongest Counter-Argument

The leading opposing position is that any hook growth before isolation deepens dependency on unsafe in-process execution, so Tovu should restrict itself to Tier-1 declarations and perhaps build per-site process isolation first.

The strongest rebuttal is that isolation does not manufacture extension points. With one hook, a perfectly isolated plugin is still nearly powerless. ADR-024 intentionally freezes callbacks as asynchronous, serializable transport contracts precisely so the same contract can move behind IPC later (files/adr/ADR-024-plugin-execution-and-trust-model.md:56-77). Once the current shallow-snapshot and async-signature questions are resolved, selectively adding such contracts does not commit Tovu to live objects or synchronous in-process semantics.

The opposing warning remains valid against undisciplined Option C. That is why my position is surface-first after P0, not hook-count-first: add only proven typed contracts, while Tier-3 distribution stays restricted and Tier-1 consumes core-mediated registrations wherever callbacks are unnecessary.

## What Would Change My Mind

I would advance Tier-2 ahead of further Tier-1 breadth if:

- Feasibility work shows the four missing primitives are expensive, unsafe, or cannot remain bounded, materially collapsing the conditional Tier-1 coverage estimate.
- The next real plugin cohort is dominated by executable behavior that the completed surface already supports but cannot safely distribute.
- Active Tier-3 adoption makes the machine-wide blast radius an immediate operational risk rather than a future marketplace concern.

I would delay hook-catalog growth further if the completed `beforeSave` conformance tests cannot prove asynchronous, deeply serializable payloads, deterministic phase/priority behavior, bounded execution, and automatic recovery.

I would move scheduled work into the next slice if concrete target plugins show that durable jobs—not webhooks, redirects, forms, or admin descriptors—are their shared first dependency. Otherwise it should be specified now and implemented after the first recovered, end-to-end Tier-1 vertical slices.

<<SWARM_END>>