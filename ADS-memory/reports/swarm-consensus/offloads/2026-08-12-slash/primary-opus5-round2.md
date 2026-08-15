# Primary (Claude Opus 5) — Debate 2 (Composer slash commands), ROUND 2, FROZEN

Written after reading every Round 1 response and the owner's reference screenshots, before reading any Round 2 output.

## Position And Movement

**Two changes, one of them a correction to my own Round 1 answer.**

1. **I withdraw Option D.** I chose "declared command kind" in Round 1. Sonnet found the written design law that kills it: `slots.ts:77-80` states `kind` is *"intentionally an open string: Jini filters and renders the value but never switches on a host-owned taxonomy."* A kind the package dispatches on violates the package's own contract; a kind only the host switches on is just Option B. D was never a fourth option. **My position is B**, with the descriptor carrying the effect rather than the package inferring it.

2. **I was wrong that there is no host dispatch path.** Both Gemini peers found `AssistantDock.tsx:270-273` — `resolveTovuComposerDiscoveryRoute` → `navigate` — already wired and already working for `/mcp`. Verified. The seam exists; what is missing is that `Composer.tsx:92-96` calls `setDraft` **unconditionally before** notifying the host, so `/mcp` has to ship `insertText: ""` to neutralize it. The package imposes text-macro policy and hosts opt out with an empty-string hack.

## The Lexical Question — my answer is NO, and I think the screenshot is being over-read

This is the biggest new question and I want to be sharp about it, because I expect disagreement.

Open Design's composer is Lexical with caret-derived triggers and a `MentionNode`; `ChatComposer.tsx` is 5,608 lines. It is tempting to conclude that matching the owner's screenshot requires porting the editor.

**Look at where the argument placeholders actually render.** In the screenshot, `<server-id>` and `<query>` appear **in the COMMANDS popover rows**, as menu chrome next to each command's label and description. The textarea itself contains only `/`. Nothing in that image shows an inline rich token inside the input. So the placeholders are *list rendering*, which a plain textarea composer can do today with zero editor changes.

What genuinely requires work is narrower: the palette must **stay open after a space** so `/mcp supabase` continues to filter, and selection must replace only the matched trigger span rather than the whole draft. Both are parser changes, not editor changes.

So: keep the textarea. Porting 5,608 lines of Lexical into a package with multiple hosts, to gain rendering that the popover already provides, is a rewrite justified by a misreading. Revisit only if inline tokenized arguments (a chip inside the input) become a requirement — and note Open Design's own unified `/`+`@` caret state machine is the thing worth stealing conceptually, not the editor.

## The Design — capability projection, and it absorbs three separate asks

The owner's three additions — arguments, prepopulation, preview, plus "capabilities I haven't thought of yet" — are one requirement: **Tovu must project its live capability registry into the composer.** Today `AssistantDock.tsx:430` passes a hardcoded four-entry literal while ~20 `tool-registrations.ts`/`agent-tools.ts` modules, `tool-catalog-query.ts`, and MCP federation registrations sit unprojected. `/search` cannot exist because nothing projects it, not because the composer lacks a feature.

One descriptor per capability carrying: label, description, **argument schema**, **preview source**, **execute binding**, confirmation requirement, provenance. The package renders and parses; it never learns what a skill or a plugin is, which keeps `slots.ts:77-80` satisfied. A new capability kind appears in the palette, previewable and invokable, with no composer change — which is exactly the extensibility requirement.

Three things I want in the code:

- **The grammar and the replacement are coupled invariants.** Today's regex `^\/([^\s/]*)$` guarantees the draft *is* the trigger, which is the only reason whole-draft replacement is safe. Relax one without the other and typed text gets eaten. They change together or not at all. (This is also why I did **not** ship the "draft-wipe fix" as a standalone: it is not a bug today — `selectPlusItem` guards on falsy `insertText`, and the slash path's draft is only ever the trigger. It becomes real the moment arguments land.)
- **Stop discarding the promise.** `void slots?.onDiscoverySelect?.(...)` (`Composer.tsx:89`) swallows rejections. Harmless while the only effect is `navigate`; silent failure the moment anything fallible is wired, which is the whole point of formalizing this.
- **Two-phase confirmation for consequential commands.** Tovu already has `PendingConfirmationStore` plus a redemption route for MCP-UI destructive actions. The descriptor should declare it rather than each host re-deciding.

## Strongest Counter-Argument

Sonnet's: that Option C's premise doesn't exist, because tool execution originates from the spawned agent CLI's own reasoning through `/api/delegated-tool-calls`, and there is no UI→tool-call path. If true, `/search` cannot execute directly and must become a prompt the agent acts on — Option A wearing a costume.

I think this is the sharpest objection in the debate and I do not fully have an answer. My tentative one: `/search` need not be a *tool call*; it can be a **client command** that calls a Tovu HTTP route, which is the same shape as `/mcp`'s `navigate` — no agent loop involved, no synthetic `tool_use` fabricated, no new consent model. That keeps me in B. But if the owner's intent is that `/search` runs through the *agent*, Sonnet is right and the answer is a structured prompt, not execution.

## What Would Change My Mind

- Evidence that inline tokenized arguments (chips in the input) are required rather than menu-rendered hints — that flips the Lexical answer.
- Confirmation that `/search`-class commands must run through the agent CLI rather than a host route — that collapses my B into a macro design and vindicates Sonnet.
- A second host for `@jini-ai/chat` with genuinely different command semantics would strengthen the package/host split; a single host would weaken the whole ceremony.

<<SWARM_END>>
