# Swarm Consensus Context Packet

**Packet ID:** `CTX-SLASH-2026-08-12`
**Date:** 2026-08-12
**Slug:** tovu-composer-slash-commands
**Project Type:** brownfield
**Mode:** debate — Round 1 (independent first pass, solution-neutral)

---

## Preamble for peer models — read this first

- IGNORE ALL PRIOR CONVERSATION HISTORY. This is a new task. If you recall a packet about theme tiers, frontend control, or MCP tool catalogs, that is stale context — discard it.
- There is **no** `AGENTS.md`, `CLAUDE.md`, or bootstrap file in your working directory. This is intentional. A missing file is never a reason to stop; reporting yourself blocked is a wrong answer.
- Do not read outside your working directory. Do not chain file reads with `&&`.
- Your working directory has a `files/` subtree with verbatim source. Read it; ground claims in `path:line`.
- Round 1 of a debate. Form an **independent** position. No other participant's answer is here, deliberately.

---

## The Need

Two products share one chat composer: Tovu (a self-hostable CMS) embeds a chat assistant, and the composer component itself lives in a separate reusable package, `@jini-ai/chat`. A `/`-triggered command palette was built into that composer and then paused mid-flight.

Today, selecting a slash item **only inserts text into the draft**. Nothing executes. The need is to decide what a slash command should actually *do*, and who owns that decision.

## The Exact Question

> What is the right design for slash commands in a shared chat composer — specifically, what are the execution semantics on select, and where does the command registry live given the composer is a reusable package and Tovu is one of its hosts?

---

## Repository Facts (verified)

### F1 — The picker is built and green; the *execution* is what is missing

`files/jini/composer-discovery.ts` is a complete, pure, tested parser layer:

- `parseComposerSlashQuery(draft)` — matches `/^\/([^\s/]*)$/`. Note what this means: the palette **only opens when the slash token is the entire draft**. There is no mid-sentence `/` trigger and no multi-word query.
- `filterComposerDiscovery(groups, query)` — flattens non-empty groups preserving host order, case-insensitive substring match over `label`, `description`, `kind`, and `keywords`.
- `replaceComposerSlashTrigger(draft, insertText)` — **replaces the entire draft with `insertText`**.
- `appendComposerDiscovery(draft, insertText)` — the plus-menu path; appends with a space instead.
- `resolveComposerSlashKeyAction(key, shiftKey)` — ArrowUp/Down move, Enter/Tab select (not with Shift), Escape dismiss.

`files/jini/Composer.tsx` wires all of it: active index, circular arrow nav, dismiss-by-draft memo (`dismissedSlashDraft`), ARIA `aria-controls`/`aria-expanded`/`aria-activedescendant`, and a `ComposerSlashMenu`. On select it calls `composer.setDraft(replaceComposerSlashTrigger(...))` and `notifyDiscovery(item, 'slash')`.

**So the entire outcome of picking a slash command today is: the draft becomes some text.** There is no dispatch, no tool call, no navigation, no confirmation, no error path.

### F2 — The package/host split

The composer is `@jini-ai/chat`, consumed by Tovu via a `file:` dependency. Tovu supplies the *content* of the discovery groups through a catalog adapter; the package supplies the *mechanism*. The discovery item type (`ComposerDiscoveryItem`, declared in the package's `slots.ts`) carries `label`, `description`, `kind`, `keywords`, and an optional `insertText`.

`ComposerDiscoverySelect` is typed `(selection) => void | Promise<void>` — an async-capable seam exists but is currently used only for notification.

### F3 — What populates the palette

Four source kinds are wired into the plus-menu/slash discovery today: files/images, regular Plugins, Agent Plugins, Skills, and MCP. Of these, `/mcp` was deliberately reduced to **settings navigation only** — an earlier build showed an MCP argument hint that was removed as unsupported.

### F4 — The work was explicitly halted

A progress ledger records this workstream as "inspection fixes implemented; final rerun in progress", followed by an owner instruction that **all Plugins/Composer work is on hold**. Package tests were green at 18/18 when it stopped. Nothing here is abandoned code — it is paused, working, and incomplete in exactly one dimension.

### F5 — There is a second, separate picker in the same composer

`useComposer.ts` has a **mention** popover (`MentionPopoverState`) with its own insertion rule: `result.insertText ?? '@' + result.label + ' '`. So the composer already has two overlapping trigger vocabularies (`/` and `@`) with different insertion semantics — slash *replaces the draft*, mention *appends*.

---

## Constraints

| # | Constraint |
|---|---|
| C1 | The composer is a **reusable package** with more than one host. A design that hardcodes Tovu concepts into the package breaks that. |
| C2 | Tovu is **self-hostable** and multi-workspace; anything user-triggered must be workspace-scoped. |
| C3 | The chat assistant runs against agent CLIs, not a hosted API — command execution has to work in that model. |
| C4 | Existing behavior (plus-menu discovery, mention popover, 18 green tests) must not regress. |
| C5 | Whatever is decided must also serve Agent Plugins (a separate debate), which will want to contribute commands. |

## Candidate designs to evaluate (options, not a proposal — attack them)

- **A — Text macro only.** A slash command is sugar for prompt text. Selecting expands to a longer prompt the user can edit and send. Nothing executes directly. (This is roughly what exists.)
- **B — Client-side command dispatch.** The host registers handlers; selecting invokes a typed handler in the host app (navigate, open a panel, run a local action). The package owns trigger/filter/keyboard; the host owns effects.
- **C — Server/agent tool invocation.** A slash command maps to a registered agent tool; selecting builds a structured tool call executed through the existing tool pipeline, with the same permission gate as any other tool.
- **D — Hybrid with a declared command kind.** Each command declares its own execution kind (`macro` | `client` | `tool`), and the composer dispatches accordingly.
- **E — Something else.**

## Open questions (address these; do not treat as decided)

1. **Arguments.** `parseComposerSlashQuery` cannot express `/command arg1 arg2` — its regex rejects whitespace outright. Do commands need arguments, and if so what happens to the trigger grammar, the filter, and the ARIA model?
2. **Registry ownership.** Package-owned, host-owned, or a contributed registry? What does a third-party host see?
3. **Permission and trust.** If a command executes, what may it do, and who consents? Note C3.
4. **Failure and undo.** What does the user see when a command fails, and is any of it reversible?
5. **Draft destruction.** `replaceComposerSlashTrigger` throws away whatever the user typed. Is that correct?
6. **Two vocabularies.** Should `/` and `@` converge, stay separate, or is one of them redundant?
7. **Discoverability at scale.** Substring matching over a flat list is fine at 10 commands. What happens at 200 when plugins contribute?
8. **Phasing.** The smallest slice that ships value from a paused-but-working state, and its rollback.

## Adversarial task

1. Identify the best design and say why. 2. Reject weak options with specific reasons tied to the code. 3. Name your choice's failure modes, hidden costs, and one genuine sacrifice. 4. State what evidence would change your answer. 5. Say whether this should be finished at all, or deleted.

No implementation plan, no ranked slate, no sample code this round — position-forming only.

## Unlisted Option (required)

Is there a strong option or decomposition not listed above that is better, or that this framing missed? "No, the listed options cover it" is valid.

## Blind Spots (required — all three)

**(a)** A viable option this packet failed to list. **(b)** A question we should be asking but aren't — a reframe, not a new answer. **(c)** The framing assumption most likely to be wrong, and why.

---

## Staged Files

| Path | Why |
|---|---|
| `files/jini/composer-discovery.ts` | The complete pure parser/filter/key layer |
| `files/jini/Composer.tsx` | The wiring: state, keyboard, ARIA, select handlers |
| `files/jini/ComposerDiscovery.tsx` | The plus-menu and slash-menu renderers |
| `files/jini/useComposer.ts` | Draft state, persistence, and the separate mention popover |
| `files/jini/slots.ts` | `ComposerDiscoveryGroup` / `ComposerDiscoveryItem` type contracts |
| `files/tovu/agent-plugin-catalog.ts` | Tovu's host-side catalog adapter |
| `files/tovu/AssistantDock.tsx` | Tovu's embedding of the composer |

---

## Required response format

Begin with exactly:

```
ACK_PACKET_RECEIVED CTX-SLASH-2026-08-12 -- I received the packet and will work on it.
```

Use headings: `## Position`, `## Option Assessment`, `## Failure Modes And Sacrifice`, `## What Would Change My Mind`, `## Unlisted Option`, `## Blind Spots`.

End with exactly `<<SWARM_END>>` on its own line. A response without it is classified truncated and excluded.
