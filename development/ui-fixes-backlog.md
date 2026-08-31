# UI Fixes Backlog

Small, batchable UI/polish items. Deliberately queued rather than dispatched one at a time —
the intent is to work these as a group in a single UI pass.

Each entry names the symptom, where it lives, and (where known) the mechanism, so whoever picks
these up does not have to re-diagnose from scratch.

---

## 1. Agent Plugin file viewer does not wrap long lines

**Reported:** 2026-08-31, owner, from `/admin/agent-plugins` → "UI/UX Design package files" modal.

**Symptom:** the right-hand file-content pane scrolls horizontally forever instead of wrapping.
Long markdown lines (e.g. `SKILL.md`'s description and bullet lines) run off the right edge and
are unreadable without horizontal scrolling. The left-hand file-list column already wraps
correctly — only the content pane is affected.

**Where:** `apps/admin/src/features/plugins/AgentPluginDetailsModal.tsx` (modal + viewer), plus
whichever stylesheet owns the code/content pane.

**Likely mechanism (unverified):** the pane renders line-numbered content in a `<pre>`-like block
whose `white-space` keeps lines unbroken. A wrap fix probably wants `white-space: pre-wrap` +
`overflow-wrap: anywhere` on the content cell, while keeping the line-number gutter aligned —
the gutter is the part that makes this more than a one-line change, since wrapped lines must not
desynchronise from their numbers.

**Open question for whoever takes it:** should wrapping be unconditional, or a toggle? Source
files (`plugin.json`, `.ts`) are often genuinely better unwrapped; prose markdown is better
wrapped. A wrap/no-wrap toggle in the pane header may be the better answer than forcing either.

---

## 2. Agent reply bubbles still use the grey surface token

**Reported:** 2026-08-31, surfaced while fixing the ChatPane background.

**Symptom:** `.jini-message-agent .jini-message-content` (in `apps/admin/src/styles/assistant.css`,
~line 365) hardcodes `background: var(--surface-2)` — the same grey that was just removed from the
pane background. Now that the pane itself is `--surface` (white), the agent bubbles are the only
remaining grey.

**Why it was NOT fixed at the time:** this is a real design decision, not leftover drift. Those
bubbles have no border and no shadow, so flattening them to white makes agent replies dissolve
into the pane and removes the visual distinction between user and agent messages entirely.
User bubbles use `--accent` for the same separation purpose.

**Decision needed from the owner:** leave the bubbles subtly grey against the white pane, or
flatten them and add a border/shadow to preserve the distinction some other way.

---

## 3. Discovery popover scrollbar shifts slightly on hover

**Reported:** 2026-08-31, found incidentally while fixing the composer capability-picker clipping.
Not owner-reported.

**Symptom:** in the composer "+" / slash menu, once a hovered item's description expands (that
expansion is by design — it grows the row in normal flow rather than floating over the row below),
a row can exceed the popover's remaining `maxHeight` budget and the popover's internal scrollbar
shifts slightly.

**Where:** `Jini/packages/chat/src/react/components/ComposerDiscovery.tsx` and its styles.

**Severity:** cosmetic. Flagged only so it is not rediscovered as a new bug later.

**Note:** this is a Jini change, so it affects every `@jini-ai/chat` consumer and requires a
package rebuild plus a Tovu Vite cache clear to be visible.

---

## 4. External MCP agent-tool domain is unwired (not a UI fix — filed here so it is not lost)

**Found:** 2026-08-31, while fixing the `assistant_ask_choice` MCP-UI redemption 403.

**Finding:** `external_mcp_save` (`apps/website/src/features/external-mcp/save-form.ts`) builds a
real MCP-UI form with `toolName: EXTERNAL_MCP_SAVE_TOOL_ID` and the identical held-open-exchange
shape as `content_post_delete` — structurally it would qualify for
`MCP_UI_REDEEMABLE_TOOL_IDS`.

**But it is unreachable.** Nothing outside `features/external-mcp/` imports
`externalMcpAgentToolCatalog` (`agent-tools.ts`) or the save-form builder into any `ToolRegistry`
or composition root — verified by a repo-wide grep. The directory's own comments reference a
`tool-registrations.ts` that does not exist anywhere in the tree; only a rename commit shows for
it in git log.

**Consequence:** adding its id to the allowlist today would be inert. The real work is building
the missing registration wiring, which is a separate and much larger piece.

**Decision needed:** is this domain meant to ship? If yes it needs a proper wiring task. If no it
is dead weight that reads as live code. Compare with the known pattern that unwired files here are
typically *unbuilt features* rather than dead code.

---

## 5. Active theme card: replace the rainbow border beam with a gold one

**Reported:** 2026-08-31, owner, from `/admin/themes` → Static tab, the Active ("Basic") theme card.

**Symptom / request:** the active theme card is outlined by an animated multi-colour gradient
"beam" (pink → purple → blue → cyan → green, visible along the card's left and bottom edges).
Owner wants a **gold** beam instead of the rainbow one.

**Where:** the active-card treatment on the Themes screen — `apps/admin/src/features/themes/`
(the Explore/theme-card component and its stylesheet). The beam is almost certainly a CSS
gradient driven by an animation, either a `conic-gradient`/`linear-gradient` border or a rotating
`background` behind a masked pseudo-element. Find the actual rule before editing — in this
codebase a colour's *presence* in a stylesheet is not proof it is the rule that wins.

**Scope note:** this is a colour/gradient swap, not a mechanism change. Keep the existing
animation, geometry, and masking; change only the colour stops. Prefer driving it from a token
rather than hardcoding hex values, and check whether the admin's dark theme
(`:root[data-theme="dark"]`) needs a separate treatment.

**Open question:** single gold, or a gold gradient with some variation (e.g. pale gold → deep
gold → amber) so the beam still reads as animated rather than a flat static border? A single
flat colour may make the motion invisible and lose the effect entirely. Worth confirming with
the owner, or building the gradient variant and showing it.

**Status: QUEUED — do not start. Owner is collecting more UI items for a single batched pass.**

---

## 6. Reconsider the left accent border ("accent rail") on cards

**Reported:** 2026-08-31, owner, from `/admin/workspace`. Owner's read: this reads as a tic —
a pattern that keeps getting applied by default rather than chosen.

**What it is:** a `border-left: 3px solid <color>` on a card or block, used to encode
severity/category. Common names: left accent border, accent rail, status stripe, leading accent
border (Bootstrap: `border-start`).

**Where it lives — this is a SYSTEM-WIDE idiom, not one card:**
- `apps/admin/src/styles.css:831` — `.card-danger { border-left: 3px solid var(--danger); }`
  (applied at `apps/admin/src/features/workspace/Workspace.tsx:114`, the "Delete workspace" card)
- `apps/admin/src/styles.css:1316-1318` — `.notice` / `.notice.error` / `.notice.warning`
- `apps/admin/src/styles.css:3651-3659` — the "ask the assistant" block, whose own comment says it
  deliberately "borrows `.notice`'s left-accent idiom"
- `apps/admin/src/styles.css:3682` — `.deployment-route-quiet`
- `apps/admin/src/styles/assistant.css:997` — another `border-left: 3px solid var(--danger)`

**Also to confirm in-browser:** the screenshot shows a GREY left edge on the ordinary (non-danger)
Workspace card too. `.card` (styles.css:795) was not confirmed to carry a left accent — that grey
bar may be the standard 1px border plus shadow at that crop/zoom, or a separate rule. Verify
before assuming there are two variants to remove.

**Decision needed — this is a design-system call, not a bug fix:**
1. Remove the idiom entirely and encode severity another way (heading colour, an icon, a tinted
   background, a full border in the accent colour), or
2. Keep it but apply it deliberately and rarely — e.g. destructive actions only, dropping it from
   `.notice` and the deployment/assistant blocks, or
3. Keep as-is.

Whichever is chosen, apply it in ONE pass across all five call sites above. A partial removal is
worse than either end state — the pattern reads as meaningful precisely because it is consistent.

**Status: DONE 2026-08-31.** Removed by the `admin-ui-batch` web-design pass. Resolution: option 1
variant — the left-only rail was replaced by a FULL border in the same accent colour at all five
semantic call sites, so the colour-coding survives and only the rail shape is gone. `.card-danger`
also gained a `--danger-bg` tint and a danger-coloured `.card-title` so severity carries a second
signal. Structural `border-left` rules (chat-dock panel dividers, `.editor-id`,
`.menu-item-row` indentation, and the TipTap blockquote) were deliberately left alone — different
design category, not this idiom.

**Also resolved:** the grey edge on the ordinary Workspace card was NOT a separate accent rule.
`.card` (styles.css:795) is a plain uniform `1px solid var(--border)` on all four sides plus
`--shadow-sm`; no left-specific override exists. The screenshot was just the normal border+shadow.
