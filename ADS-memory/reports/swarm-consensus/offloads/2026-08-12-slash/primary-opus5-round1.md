# Primary (Claude Opus 5, 1M) — Debate 2 (Composer slash commands), Round 1, FROZEN

Written before reading any peer or subagent output. Packet: `CTX-SLASH-2026-08-12`.

## Position

**Option B/D hybrid: the package owns the mechanism, the host owns the effect — and the concrete change is that `Composer.tsx` must stop calling `setDraft` itself.** Right now the package makes a policy decision that belongs to the host: it has hardcoded "a slash command is a text macro."

But the more important finding is that **the interesting cost is not the dispatch — it's the trigger grammar**, and the packet's option list obscures that.

## Option Assessment

**Option A (text macro only) — reject, and there is already field evidence against it.** This is what exists. The team hit its ceiling and worked around it: `/mcp` was deliberately degraded to "settings navigation only" after an argument hint was removed as unsupported. That is A failing in practice, not in theory. If the only verb is "put text in the box," any command whose real intent is *go somewhere* or *do something* has to be faked or dropped.

**Option C (pure agent-tool invocation) — reject as the general answer.** It overfits: navigation and UI actions are not tools, and forcing them through a tool pipeline is a category error. Worse, it couples a reusable package to one host's agent runtime, breaking C1. C is right for *some* commands, which is exactly why the kind has to be declared per-command rather than chosen globally.

**Options B and D — accept, as one design.** D (declared `kind`) is just B with the dispatch table made explicit on the item instead of implicit in the host's handler. I'd take D's explicitness because it makes the palette renderable differently per kind (an executing command should not look identical to a text macro) and makes permission decisions inspectable before invocation.

**The structural fix underneath both:** `ComposerDiscoverySelect` is already typed `(selection) => void | Promise<void>`. **The async execution seam already exists and is used only for notification.** The package should delegate to the host's select handler and fall back to text insertion only when the host declines to handle the item. That is a small change to `Composer.tsx` and it moves policy out of the package without touching the parser, keyboard model, or ARIA wiring.

## Failure Modes And Sacrifice

**The trap nobody has written down: the trigger regex and the draft-replacement are coupled invariants.**

`parseComposerSlashQuery` is `/^\/([^\s/]*)$/` — anchored both ends, and `[^\s/]*` excludes whitespace. So the palette **only opens when the slash token is the entire draft**, and closes the instant a space is typed. `replaceComposerSlashTrigger` then does a full-draft replacement, which is safe *only because* the regex guarantees the draft is nothing but the slash token.

Relax the regex to support `/command arg1 arg2` and that replacement silently becomes destructive — it will eat the user's typed text. Three things move together: when the palette opens, when it dismisses (`dismissedSlashDraft` is memoized against the whole draft string), and what `aria-activedescendant` points at. **Arguments are not "not implemented yet" — they are structurally excluded by the trigger grammar, and adding them is the expensive part of this work, not the dispatch.**

**Genuine sacrifice of my choice:** the package can no longer guarantee what happens on select, so its test surface shrinks to mechanism only, and every host now carries dispatch boilerplate it didn't need before. A host that implements nothing gets today's behavior — which is the right default, but it means "slash commands work" becomes a per-host claim rather than a package property.

**Second failure mode:** two trigger vocabularies with divergent semantics in one component. `/` replaces the draft; `@` appends (`result.insertText ?? '@' + label + ' '`). Users will not model that difference, and maintainers will keep re-deriving it.

## What Would Change My Mind

- Evidence that commands genuinely need arguments. If they do, the trigger-grammar rewrite dominates the design and I'd sequence that first, before any dispatch work — the opposite of the natural instinct.
- Evidence that there is only ever one host. Then the package/host split is ceremony and the simplest thing is to put commands in the package directly.
- A decision that the assistant should never take direct action from the composer — that would make A correct and this whole debate moot.

## Unlisted Option

**Don't invent a command registry at all — make the slash palette a *projection* over registries that already exist.** Tovu already has an agent-tool registry, a skills catalog, a plugin catalog, and MCP federation. A "command" would not be a new entity with its own lifecycle, storage, permissions and collision rules; it would be a *view* over things already registered, and "execute" would mean whatever invoking that underlying thing already means. This avoids the classic failure of a second registry drifting out of sync with the first, and it removes the question "who may register a command" by inheriting each source's existing answer.

## Blind Spots

**(a) Option not listed:** the projection model above — slash as a view, not a registry.

**(b) The question we should be asking but aren't:** should `/` and `@` be the *same* mechanism with different filters? They are two pickers, in one component, with different insertion rules and separate state. The packet treats slash as the subject and mention as background, but the real design question may be whether the composer should have one unified resource-picker with a trigger-character parameter.

**(c) The framing assumption most likely wrong:** that slash commands should *execute* at all. The strongest evidence in the repo points the other way — `/mcp` was reduced to navigation, and the four wired sources (files, plugins, skills, MCP) are all fundamentally *context and navigation*, not actions. If that's the real shape, B is sufficient forever and C is a solution to a problem this product doesn't have.

<<SWARM_END>>
