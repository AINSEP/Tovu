# UI/UX Design Agent Plugin — does the plugin mechanism do anything? (static verdict)

**Date:** 2026-08-21 · **Method:** static verification only, no browser run yet.
Every hypothesis below was checked against the code, not inherited from the brief or from memory.

## Verdict: the Agent Plugin *mechanism* contributes nothing. Confirmed on four independent points.

**1. The composer row inserts a literal string and nothing else.**
`apps/admin/src/features/plugins/composer-capabilities.ts:197-208`:
```
id: "agent-plugin:ui-ux-design",
description: "UI/UX Design Agent Plugin bundled with Tovu; not executed from the composer",
insertText: "UI/UX Design agent plugin",
```
The row's own description says it is *not executed*. Selecting it types five words into the draft.

**2. `installAgentPlugin` has zero production callers.** Every reference is inside its own tests
(`install.unit.test.ts`, `yauzl-archive-reader.unit.test.ts`, `agent-plugin-pipeline.integration.test.ts`)
or its own module doc. Confirms the standing project-memory note.

**3. The capability adapter is written and tested but unwired.** The only importer of
`toTovuComposerCapability` from `apps/admin/src/features/plugins/agent-plugin-capability-adapter.ts`
is `__tests__/agent-plugin-capability-adapter.unit.test.ts`. `AssistantDock.tsx:50` and
`AssistantDock.hooks.tsx:54,798` reference it in comments as tested-but-not-wired.

**4. NEW — the plugin content is not reachable from Tovu at all.** The brief's path
(`Jini/packages/plugins/ui-ux-design/`) **does not exist**. The real location is
`/Users/la/Programming/Jini/packages/agent-plugins/ui-ux-design/`. Grepping Tovu's `package.json`,
`apps/admin/package.json`, and all of `src/` for `@jini-ai/agent-plugins` or that path returns
**zero hits**. There is no dependency edge and no path reference. Tovu cannot load it even in
principle.

## The confound is real and confirmed

`diff -r` between `Tovu/AI-Dev-Shop/skills/ui-ux-design` and
`Jini/packages/agent-plugins/ui-ux-design/skills/ui-ux-design` reports **no differences — byte-identical.**

And the agent CLI is spawned with `cwd: process.env.TOVU_AGENT_CWD ?? process.cwd()`
(`src/server/agent-daemon/agent-daemon-server.ts:631`), i.e. the Tovu repo root — where
`AI-Dev-Shop/skills/ui-ux-design/SKILL.md` sits in plain sight.

So a beautifully-designed page proves nothing about the plugin. It is fully explained by the agent
reading a local skill file.

## What is still genuinely open

Exactly one channel remains untested, and it is a **prompt-text** channel, not a plugin channel: the
five words `UI/UX Design agent plugin` do land in the prompt. An LLM may well act on them — going
looking for design guidance it would not otherwise have sought. That is a real effect and it is worth
measuring, but crediting it to "the Agent Plugin" would be wrong: the identical effect would follow
from a user typing those words by hand.

**The A/B control settles it:** same page request, once with the inserted text, once without.
Equivalent output → even the prompt-text channel is inert.

Worth keeping from the brief's instrumentation: an access-time (`stat`) snapshot of
`AI-Dev-Shop/skills/ui-ux-design/` before and after a run, which directly answers whether the agent
read the local skill. The plugin-directory snapshot the brief proposed is now moot — that directory
is unreachable from Tovu.

## Chain steps missing for this to be a real end-to-end flow

1. A dependency edge from Tovu to the Agent Plugin package (none exists).
2. A caller for `installAgentPlugin` (none exists outside tests).
3. Wiring `agent-plugin-capability-adapter` into the composer's source list (not wired).
4. A composer binding that does something other than `insertText` (it does not).
