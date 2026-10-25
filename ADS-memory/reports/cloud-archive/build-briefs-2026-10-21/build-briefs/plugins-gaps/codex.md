Codex(Peer): **Hold J3 as written.** It is larger than S, and its rollback promise currently exceeds its design. Paths below use `J/` = jini-int, `T/` = tovu-int.

Build A, ranked by what would hurt first:

1. **v1 · J3 · L — Durable update transaction.** Current installation immediately prunes superseded revisions (`J/packages/agent-plugins/src/lifecycle/install.ts:336`); pruning explicitly has no rollback slot (`:209`). Introduce durable staged/activating/committed states, restart recovery, and an expected-old-digest check under cross-process locking. Serialize updates against enable/disable/uninstall too. Test crashes at publication, pin switch, activation, rollback and cleanup. “One current digest” must permit retained, noncurrent rollback bytes.

2. **v1 · J3 · M — Data and memory compatibility.** Keeping files is insufficient when v2 changes settings, tables or learned-state interpretation. Specify schema ownership, supported state versions, and a host-controlled migration runner for trusted bundled code. Operator archives must never execute migrations. Initially refuse incompatible-state updates; reversible migration machinery can come **later · J3 · L**. Restoring old bytes after irreversible migration is not rollback.

3. **v1 · J3/T1 · L — Active consumers.** Either refuse updates while affected runs use the plugin, or retain digest leases until those runs finish. Existing prompt resolution rejects multiple matching digests (`J/packages/agent-plugins/src/lifecycle/resolve-agent-plugin-refs.ts:258`). All readers need the pin: skills, supporting-file tools, capability listings and prompt indexes. Define MCP reconnection, removed-tool handling, credential preservation and activation readiness. Current provisioning documents assistant restart requirements (`T/apps/website/src/features/agent-plugins/federate-mcp.ts:129`).

4. **v1 · J1/T1 · M — Compatibility authority.** Name the authoritative host version and extension namespace; use real semver. Malformed `hostRange` must produce an explicit invalid/incompatible state, not silently authorize enable. Recompute warnings when providers change, including reverse dependents losing capabilities during updates. Missing requirements remain warnings; exclude disabled providers and accidental self-satisfaction.

5. **v1 · J3/T1 · M — Candidate and audit contract.** Manifest version orders releases; digest identifies bytes. Define prerelease, invalid-version, equal-version/different-digest and downgrade behavior. Without Marketplace, offer explicit folder/zip candidate preview; `updateAvailable` should be unknown until checked. Phase A needs its own update route/tool/button, previously stranded in T3. Record actor, old/new versions/digests and outcome; activation currently stores only the latest actor/time (`J/packages/agent-plugins/src/lifecycle/activation.ts:68`). **Marketplace: out.**

Build B:

6. **v1 · B1 contract · M — Missing executable resolution and submission port.** Visitor-auth’s registry stores definitions only (`J/packages/capability-providers/src/visitor-auth/registry.ts:17`). Define provider-to-adapter resolution, workspace/site scope, readiness and atomic selection. Renderer plus moderation cannot dispatch public submission. `capability-providers/comments` is defensible for neutral contracts; keep CMS adapters in CMS and HTML/theme wiring in Tovu.

7. **v1 · B2 built-in · M — Preserve operational data.** Keep table identity, settings, salt, moderation history and pending queue; table declarations already use the reserved namespace (`T/apps/website/src/features/comments/types.ts:2`). Switching providers must warn about hidden pending comments and preserve a recovery path. Disable must gate routes/tools, not merely hide screens. Vendor export: **later · B3 · M**.

8. **v1 · B2 public · L — Form, abuse, SEO and caching.** Existing handler returns JSON (`J/packages/cms/src/comments/express/submit-handler.ts:105`): add form parsing, safe redirect/error UX and submission abuse protections. Preserve ingress limits/spam checks (`…/ingress.ts:135`). SSR approved comments only; bound thread reads, exclude private fields, and invalidate caches on moderation, selection and disable. Specify theme-marker placement and static-host behavior.

9. **v1 before vendors · B3 · M — Consent and tools.** Gate scripts, iframes and network requests before consent; support withdrawal and CSP ordering. Vendor moderation returns explicit unsupported/dashboard results. Preserve tool permissions, version checks and confirmations; never imply local moderation succeeded. Vendor embeds cannot promise SSR SEO.

10. **v1 · integration · M — Parallelism.** Freeze lifecycle/provider contracts first. Assign shared composition, plugin-admin and export files one writer. Coverage waves must pause on touched files or rebase onto final behavior. A and B can proceed independently afterward; retain executable contributions’ bundled-digest trust boundary.

<<SWARM_END>>