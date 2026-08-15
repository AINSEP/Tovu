I’ll audit the packet and every provided source file, then return only the required debate format with precise path-and-line citations.
The sources confirm a meaningful split already exists: the package owns generic inventory and interaction, while Tovu already handles one host-side effect. I’m checking the exact seams and lifecycle details before taking the independent position.
ACK_PACKET_RECEIVED CTX-SLASH-2026-08-12 -- I received the packet and will work on it.

## Position

Choose **E: an intent-first, host-executed command system, separate from resource discovery**.

The package should own slash parsing, filtering, keyboard behavior, accessibility, and draft-local edits. On selection it should emit a command intent. The host should own the workspace-scoped registry, resolve contributed commands, authorize effects, and report the outcome. Agent Plugins may contribute declarative, namespaced command descriptors, but not arbitrary browser functions.

Execution semantics should depend on the host-resolved intent:

- A macro makes one visible, editable draft change and does nothing until normal submission.
- A client command may immediately perform a low-risk host action such as navigation.
- An agent/tool command becomes a visible pending invocation and runs only after explicit submit or confirmation through the existing CLI/tool permission path. Selecting it must not manufacture a privileged tool call directly.

This resembles D in user experience, but rejects D’s crucial premise that the reusable composer dispatches effects. `ComposerDiscoveryItem.kind` is intentionally an open host taxonomy that Jini never switches on, while the item itself contains only descriptive fields and insertion text (`files/jini/slots.ts:74-89`). That boundary should remain intact.

The registry contract may live in the package, but each registry instance and its executor belong to the host. Tovu should assemble its registry per workspace from trusted built-ins, enabled plugins, and server-advertised capabilities. A third-party host sees only its own entries and contributions; it receives no Tovu commands.

One source-level correction matters: Tovu already executes one host-side action. Composer clears or changes the draft, then fire-and-forgets `onDiscoverySelect` (`files/jini/Composer.tsx:88-99`); Tovu resolves `mcp:settings` and navigates (`files/tovu/AssistantDock.tsx:269-273`). Because that item’s `insertText` is empty, selecting `/mcp` clears the draft before navigation (`files/tovu/agent-plugin-catalog.ts:85-103`). Thus the missing work is not merely “make selection execute”; it is defining a reliable command contract around an already-present, incomplete execution seam.

Arguments should be schema-governed values, never generic shell text. The current parser only recognizes a slash token occupying the entire draft and rejects whitespace (`files/jini/composer-discovery.ts:9-12`). While choosing a command, filtering should apply only to the command-name portion. After selection, argument collection should be visually distinct from the listbox, with command-specific validation. The current listbox/option model can remain the command-selection model (`files/jini/ComposerDiscovery.tsx:118-145`); it should not impersonate a shell or remain ambiguously open while arguments are being edited.

Keep the vocabularies separate:

- `/` invokes actions or macros.
- `@` references an entity in prompt text.
- `+` adds context or attachments.

They may share search primitives, but not registry semantics. Mentions already use independently searchable sources and append an inline reference (`files/jini/useComposer.ts:104-133`). The present coupling—one `discoveryGroups` collection driving both the plus menu and slash autocomplete—is the design debt (`files/tovu/AssistantDock.tsx:426-432`).

At scale, host order plus flat substring matching is insufficient: the filter has no relevance scoring, namespacing, permission filtering, or pagination (`files/jini/composer-discovery.ts:14-34`). Existing entries already demonstrate ambiguity: “UI/UX Design” appears independently as an Agent Plugin and a Skill (`files/tovu/agent-plugin-catalog.ts:57-83`). A contributed registry needs namespace-aware identity, capability filtering, grouping, and ranking before 200-command inventories are credible.

This should be finished, but the idea that every discovery item is a slash command should be deleted. The smallest defensible shipped scope is macros plus explicitly host-backed client commands such as `/mcp`; executable plugin/tool commands remain absent until the trust and outcome contract exists. Its rollback is removal of slash-command contributions while leaving the plus menu and mention vocabulary intact.

## Option Assessment

**A — Text macro only:** Valid for prompt templates and non-executable catalog entries, but inadequate as the universal meaning of `/`. It cannot honestly represent `/mcp`, which already navigates, and it encourages unavailable resources to masquerade as operations. The catalog explicitly says Agent Plugins are “catalogued, not executed” (`files/tovu/agent-plugin-catalog.ts:8-20`).

**B — Client-side dispatch:** Correct for navigation, panels, and other browser-local effects; current Tovu behavior is already an example. It is not sufficient for workspace mutations or agent tools because client visibility is not authorization. The current async-capable callback is especially weak: its promise is discarded, so there is no pending, failure, retry, or draft-restoration path (`files/jini/slots.ts:119-125`, `files/jini/Composer.tsx:88-90`).

**C — Direct server/agent tool invocation:** Appropriate only for commands whose meaning truly is a tool operation. Tovu already gives agent CLIs tools through a daemon-side delegated permission gate (`files/tovu/AssistantDock.tsx:114-119`); slash commands should enter that pipeline rather than create a parallel privileged route. C cannot naturally explain navigation or editable macros, and executing a destructive tool merely because a palette row was selected is an unsafe consent boundary.

**D — Composer-dispatched hybrid:** Correct that different commands need different semantics, but wrong about ownership. Teaching the package to switch on `macro`, `client`, or `tool` couples reusable UI to host execution, permission, transcript, and runtime policy. The corrected hybrid is the selected E design: the package emits intent and handles editor mechanics; the host resolves and executes effects.

## Failure Modes And Sacrifice

The main failure modes are:

- A registry snapshot can become stale between discovery and execution when a plugin is disabled or workspace permission changes. Authorization must therefore be repeated at execution time.
- Duplicate or malicious contributed IDs can shadow trusted commands. IDs require contributor namespaces, and third-party declarations must not contain executable client functions.
- A client command can fail after the draft has been cleared. The present fire-and-forget callback cannot surface that failure or restore `/mcp`.
- Tool commands can produce irreversible effects. “Undo” cannot be promised universally; confirmation, cancellation where supported, an audit record, and an honest terminal result are required.
- Argument text can become an injection surface if treated as shell syntax. Only validated schema values should reach an agent/tool adapter.
- Async selection can double-run through repeated keyboard or pointer activation unless invocation identity and pending state are explicit.
- Rich argument states can break the current focus-stays-in-textarea accessibility model (`files/jini/Composer.tsx:108-123`, `files/jini/Composer.tsx:139-167`).

Draft destruction is currently narrower than the packet suggests: replacement happens only when the entire draft matches the slash grammar (`files/jini/composer-discovery.ts:37-40`). It therefore discards the command query, not unrelated prose. If slash triggering ever expands to mid-draft usage, whole-draft replacement becomes unacceptable; only the active trigger span may change. Macro insertion should be one editor-undo operation, while failed immediate actions should retain or restore the trigger.

Hidden costs include registry versioning, workspace capability filtering, plugin provenance, an async outcome model, accessibility for argument entry, searchable indexing, telemetry, and consistent failure presentation across hosts.

The genuine sacrifice is speed and extensibility: privileged commands will not be one-keystroke actions, and Agent Plugin authors cannot inject arbitrary browser handlers. Some commands require an extra submit or confirmation, and the command catalog can no longer reuse the simpler discovery-item type.

## What Would Change My Mind

I would favor A and remove executable slash semantics if user research showed that people consistently understand `/` as editable prompt expansion and almost never seek immediate actions.

I would favor a server-owned C-style registry if every intended command were an agent capability, client navigation disappeared from scope, and the daemon exposed authoritative per-workspace command metadata with uniform permission, confirmation, cancellation, and audit behavior.

I would accept composer-side D only if multiple independent hosts converged on the same stable execution protocol and the package could remain runtime-agnostic despite implementing it.

I would delete slash entirely if usage data showed that the plus menu and `@` references satisfy discovery, or if the only genuine command remained a shortcut to one settings page. Existing picker code being complete is not sufficient evidence that its ongoing conceptual and accessibility cost is justified.

## Unlisted Option

The missing decomposition is **two catalogs with an intent resolver**:

- A resource/reference catalog supplies the plus menu and `@` vocabulary.
- A command catalog supplies `/`, with declarative provenance, argument schema, consent requirements, and a namespaced command ID.
- A host-owned resolver maps command intent to draft mutation, client action, or the existing agent/tool pipeline.

This is stronger than putting an execution-kind field on `ComposerDiscoveryItem`, because the current type deliberately represents provider-neutral resources, while the catalog currently mixes resources, unavailable Agent Plugins, skills, and one settings action (`files/jini/slots.ts:74-101`, `files/tovu/agent-plugin-catalog.ts:42-99`).

## Blind Spots

**(a) A viable unlisted alternative:** Remove the slash palette and offer context-sensitive suggested actions from the host or agent, while retaining the established plus menu and mention system. That avoids a global 200-command namespace and can make permissions and relevance contextual.

**(b) A question that should be asked:** “What does the user believe they are consenting to at the instant they select a row, and how is that intent represented, authorized, and audited?” That is a better reframe than treating registry location as the primary decision.

**(c) The framing assumption most likely to be wrong:** That the existing discovery entries constitute one command vocabulary. They do not: some are prompt references, one is navigation, and Agent Plugins are explicitly catalogued without execution support. The duplicate “UI/UX Design” entries across different kinds make the mismatch visible already (`files/tovu/agent-plugin-catalog.ts:57-83`). Designing execution before separating those concepts would formalize the wrong abstraction.

<<SWARM_END>>