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

**Status: DONE 2026-08-31.** Jini's `CodeWithLines` renders gutter and code as two independent
`pre` blocks kept aligned only because neither wraps, so wrapping it would desync every later line
number. Jini was off-limits, so a local `WrappedFileContent` renderer was added using one CSS grid
row per source line (`.code-viewer--wrap`, `minmax(0, 1fr)` rather than `minmax(max-content, ...)`)
— a wrapped line's row grows and its number grows with it, making desync structurally impossible.
Resolved as a per-file TOGGLE defaulting on for `.md` and off for code, placed outside the `<h3>`
so the existing exact-heading-name assertion still holds.

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

**Status: DONE 2026-08-31.** Flattened to `var(--surface)` and given `1px solid var(--border)` +
`var(--shadow-sm)` — reusing the existing `.card`/`.notice` border+shadow idiom rather than a new
treatment. All three tokens are already redefined under `:root[data-theme="dark"]`, so no separate
dark rule was needed. User bubbles keep their `--accent` fill, so the user/agent distinction
survives in both themes.

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

**Status: DONE 2026-08-31.** Winning rule confirmed as `.theme-card.active::before`
(`styles.css:2008`, sole definition, no dark override existed). Mechanism kept exactly — same
conic-gradient rotation, `@property` angle, mask-composite, same four angle stops. Only colours
changed, to new `--border-beam-gold-1/2/3` tokens (pale -> deep -> amber) defined in both themes.
Deliberately NOT reused `--warning`: that token is semantic and could be retuned for contrast
independently of a decorative beam. Gold-1 repeats as the final stop so the sweep tapers
pale->deep->amber->pale into the transparent trail instead of cutting from amber to nothing.

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

---

## 7. Clean out the dummy form definitions

**Reported:** 2026-08-31, owner, from `/admin/forms`. His read: "I think they're just dummy forms."

**Full inventory** — 9 definitions exist, ALL with status `active` (queried from
`sites/tovu-com/content.db`, `form_definitions`):

| slug | name | created |
|---|---|---|
| `contact-us` | Contact Us | 2026-07-30 |
| `newsletter-signup` | Newsletter Signup | 2026-07-30 |
| `feedback` | Feedback | 2026-07-30 |
| `bug-report` | Bug Report | 2026-07-30 |
| `canary-contact-form` | Canary Contact Form | 2026-07-31 |
| `canary-lookup-test` | Canary Lookup Test | 2026-07-31 |
| `coffee-club-signup` | Coffee Club Signup | 2026-08-22 |
| `bramblewick-coffee-club-signup` | Bramblewick Coffee Club Signup | 2026-08-22 |
| `nettlefold-coffee-club-signup` | Nettlefold Coffee Club Signup | 2026-08-22 |

**Two facts that de-risk this, both verified rather than assumed:**

1. **Every one of them has ZERO submissions.** Joined `form_submissions` on `form_definition_id`
   across all 9 — all zero. So deleting destroys no submitted data. NOTE: the numeric column in
   the admin list (showing 1 and 3) is therefore NOT a submission count — almost certainly a
   FIELD count. Do not read it as "3 people submitted this."
2. **No slug is referenced anywhere in `apps/**` or `development/**`** — grepped all four
   coffee-club/canary slugs across `.ts`, `.tsx`, `.mjs`, `.json`. Zero hits. So no test or
   fixture appears to depend on them by slug.

**The one thing to check before deleting anything:** the two `canary-*` entries are named like
deliberate probes, not demo content. A canary that nothing references by slug may still be
reached by a test that looks up "the first active form" or similar, and this repo has a known
precedent of something that LOOKED dead being a live fixture (`src/theme-archive`). Confirm the
canaries are not load-bearing before removing them — the four dated 07-30 and the three
coffee-club ones are much safer bets.

**Also worth deciding:** whether Tovu should ship ANY seeded form definitions on a fresh install.
If these came from seed data rather than manual creation, deleting them from this DB fixes only
this machine and they will reappear on the next fresh install — the real fix would be in the
seeder.

**Status: DONE 2026-08-31.** All 9 rows deleted; table empty. The two `canary-*` rows were PROVEN
unused rather than left on caution: the only code referencing those slugs is a dispatch test running
against `InMemoryFormDefinitionRepo`, which has no connection to the on-disk DB. The `posts` table
and `content/` theme files were also swept for all 9 ids and slugs — zero hits. Confirmed hand-made,
NOT seeded (no seed file touches `form_definitions`, and `sites/*` is gitignored), so they will not
return on a fresh install and no seeder fix is needed.

**Restore:** full INSERT SQL for all 9 rows saved to the session scratchpad as
`form_definitions_restore.sql` — replay with `sqlite3 sites/tovu-com/content.db < <file>`.

**Noted:** `features/forms/agent-tools.ts:239` documents INV-08 — "a form definition is never
permanently deleted, and no tool can delete one." This was an out-of-band SQL delete the app itself
would never perform. Acceptable for unreachable dummy rows with zero submissions; do NOT repeat it
against real data.

---

## 8. Form editor URL uses a raw UUID instead of the slug

**Reported:** 2026-08-31, owner, from the form editor.

**Symptom:** the URL is `localhost:5173/admin/forms/6eb1ec19-67cb-4df6-9baf-b157a3718db7`.
Owner: it "should be a slug in the URL rather than that twenty character monstrosity." Expected
shape: `/admin/forms/contact-us`.

**Where:** route registration in `apps/admin/src/panels.tsx` (the `forms` panel, ~line 300) and
`apps/admin/src/features/forms/` (`FormsList.tsx` builds the link, `FormEditor.tsx` reads the
param — its header notes `formId === "new"` is the create case, so whatever replaces the id must
keep that sentinel working).

**Design questions to settle before implementing — this is not a pure find-and-replace:**
- Slugs are user-editable (the editor has a SLUG field). Changing a slug would therefore change
  the URL and break any bookmark or open tab. Decide whether to accept that, redirect old → new,
  or keep the id as a canonical fallback the route still resolves.
- The lookup path changes from "get by id" to "get by slug" — confirm the admin API supports
  fetching a definition by slug, or the route will need a client-side list lookup first.
- Slug uniqueness must be guaranteed at the DB/service level if it becomes the URL key. Verify
  there is a unique constraint on `form_definitions.slug` before relying on it.
- Precedent: check how other admin screens with user-facing identifiers (Pages, Posts, Themes)
  already handle id-vs-slug in their URLs and follow whichever pattern is established rather
  than inventing a third.

**Status: DONE 2026-08-31.** The bookmark-breaking risk this entry worried about turned out not to
exist: the slug input is `disabled={!isNew}` and `write-service.ts` documents that "slug is never
accepted from a patch; it is always ignored", so slugs are IMMUTABLE after creation and a
slug-based URL can never go stale. No redirect logic needed.

Implemented as slug-first / id-second resolution on GET (mirroring Pages'
`getAdminPostByIdOrSlug`), with WRITES staying id-only — Pages' own hook documents "every write
uses `page.id`, never `routeSlug`", so the PUT route needed no change. The unique constraint
`form_definitions_workspace_slug_unique` already existed.

**A novel collision was found and fixed at the source:** with the slug as URL key, a form slugged
"new" would collide with the `formId === "new"` create sentinel and become permanently unreachable
by direct URL. Forms is the first screen combining a `/new` sentinel with a user-chosen slug key
(Pages has no `/new` URL; Menus/Widgets use UUIDs). "new" is now a RESERVED_SLUG rejected at create
time in `write-service.ts`, which also covers the agent-facing `createForm` tool.

---

## 9. Form fields table is clipped when the assistant dock is open, with no scroll

**Reported:** 2026-08-31, owner, with two screenshots (dock closed vs dock open).

**Symptom:** with the assistant dock open, the fields table's right-hand columns are cut off —
the `Remove` buttons are sliced vertically — and **it cannot be scrolled horizontally to reach
them.** Owner: "I can't really scroll to the right to see it. It doesn't allow scrolling, because
the AI agent is open." With the dock closed the same table fits.

**Important starting point — a fix for this already exists and is being defeated.**
`apps/admin/src/features/forms/FormEditor.tsx`'s own header comment (~lines 26-29) records that
the fields table "had no horizontal-scroll escape hatch for its many columns" and that a
`.table-scroll` wrapper plus `styles/forms.css` were added for precisely this. So the wrapper is
present; something is stopping it working at dock-open widths. Do not re-add a scroll wrapper —
find why the existing one does not engage.

**Leading hypothesis (unverified):** the same comment says the table uses `table-layout: fixed`
with **percentage** column widths. A percentage-width fixed-layout table always sizes to its
container rather than overflowing it, so `.table-scroll` never gets any overflow to scroll —
instead the columns are crushed and their contents clip. If so, the fix is a `min-width` on the
table (in px/ch) so it genuinely overflows and hands the wrapper something to scroll, not a
change to the wrapper.

**Second candidate:** an ancestor with `overflow: hidden` swallowing the scroll — the same class
of bug just fixed in the composer discovery menu, where `.jini-chat-pane__body`'s unconditional
`overflow: hidden` clipped an absolutely-positioned child. `.admin-chat-dock` also sets
`overflow: hidden`. Rule this in or out before changing anything.

**Test at the narrow width specifically.** This is invisible with the dock closed. Related known
trap in this repo: always test the SHORTEST/narrowest viewport, not the comfortable one.

**Status: DONE 2026-08-31.** Leading hypothesis CONFIRMED, second candidate ruled out with evidence.
`table-layout: fixed` + percentage `<colgroup>` widths means the table always sizes to exactly 100%
of its container and can never exceed `.table-scroll`, so that wrapper never receives any overflow
to scroll — the columns just crush proportionally, worst on the 8% Req/More and 18% Remove columns.
The `overflow: hidden` theory was disproved: `.admin-chat-dock` is a SIBLING of `.admin-main-col`,
never a DOM ancestor of `.table-scroll`, so it cannot clip it.

Fixed with `min-width: 720px` on `.form-fields-table`, sized off the tightest columns, giving the
existing wrapper real overflow to scroll. No wrapper change.

**Caveat: not visually verified in a browser.** `apps/admin/vitest.config.ts` sets `css: false`, so
jsdom applies no real CSS and no automated layout regression test is possible. Worth one manual
check at dock-open narrow width.
