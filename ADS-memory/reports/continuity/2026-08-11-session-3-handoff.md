# Handoff — session 3, 2026-08-11 (Explore/Pages/Posts UI + templates unification)

Generated: 2026-08-11 (updated at session end)
Source: Claude Code, Opus 5 (1M context), Coordinator + 13 Sonnet 5 subagents
Target: Claude Code (Opus for design/routing, Sonnet subagents for implementation)

**Status: ALL AGENTS FINISHED AND COMMITTED.** Branch `general-work`. **51 commits. NOTHING PUSHED.**

---

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md` first and boot per its Mandatory Startup section. Then read this file
> in full. Then read `ADS-memory/reports/continuity/2026-08-11-deferred-wired-hooks-refactor.md`.
>
> **Do not re-derive anything.** This session produced a recon report, an audit of all 93 hook files,
> a design decision doc, and eleven implementation reports — all committed under `ADS-memory/reports/`
> and all listed below. Re-deriving them costs hours and produces worse answers.
>
> Start with **Tabled item 1** (the seven scoped hooks) unless the owner redirects — it is unblocked,
> fully planned, and the smallest complete piece of work available.
>
> **Two standing owner instructions that override defaults:** admin UI implementation is DISPATCHED to
> Sonnet subagents, not done in the Opus main context; and every UI brief must land the visible change
> and commit BEFORE the test pass, because the owner watches `:5173` and steers on what they can see.

---

## ⚠️ NOTHING IS PUSHED

51 commits from this session exist **only on this machine**. The branch's upstream is gone
(`origin/refactor/jini-admin-extraction`), so the first push needs:

```
git push -u origin general-work
```

This is the single largest risk in this handoff. A disk failure loses a full day of work across
thirteen agents.

## Uncommitted and NOT ours — leave alone, never `git checkout`

| path | whose |
|---|---|
| `src/themes/static/basic/pages/index.html` | **the owner's own hand-edits** — `<title>`/`<h1>` mentioning "Leon", live on `:3000` |
| `src/themes/static/basic/pages/pricing.html` | **the owner's own** — a `headcountss` typo they know about and chose to keep |
| `apps/admin/src/components/AssistantDock/AssistantDock.tsx` + its test | another workstream |
| `apps/admin/src/features/plugins/AgentPlugins.tsx` | another workstream |
| `apps/admin/src/panels.tsx` | another workstream |
| `src/server/app.ts` | another workstream (commerce module) |
| `development/todos.md` | mixed; carries admin-skins and shadcn notes |
| `development/docs/themes/theme-authoring-guide.md` | in-flight elsewhere; also stale (see tabled #9) |
| untracked `commerce/`, `authentication/`, `plugins/` trees | another workstream |

**`git checkout src/themes/static/basic/` would destroy the owner's live-site edits.** Never run it.

## FIRST THING TO DO ON RESUME

**Nothing is half-finished.** Every dispatched agent completed and committed. The "two agents were
live" section below is kept for the record of what they were told; both have since landed:

- **`TemplateRenderBug` → DONE, `6a20902`.** The hypothesis below was right in mechanism but
  incomplete in cause: picking a template *does* mark the row dirty, but the real defect was that
  **the fallback view never read `templateChoice` at all**, so it showed the same raw unstyled body
  whichever template was picked. "No CSS" and "doesn't re-render" were one bug. Fixed with an
  admin-only `/template-preview` endpoint that renders a **pending, unsaved** template choice through
  the real pipeline without persisting it, plus a new `contentDirty` on both hooks (dirty minus the
  template comparison) so the preview can distinguish "only the template moved" from "the operator
  edited content". **Known limitation, disclosed not hidden: published rows only** — a draft's body
  does not survive the content-marker resolver's visibility guard, so widening it would render styled
  chrome around an empty body. Left for a future pass.
- **`HeaderPolish` → DONE, `760e615` + `0ad812b`.** Title underline back under the title only, as a
  left-to-right fade rather than a hard edge (a plain revert had already been tried and rejected live
  for looking truncated); same rule on both editors. Explore callout collapsed to one line plus an
  info icon, right-aligned under the button row, reclaiming ~110px. It reused the existing (and
  previously unused) `InfoTip` component rather than building one — and found a real bug doing so:
  the tooltip opened upward by default and clipped off-screen at `top:-5px` at this call site, now
  flipped by a headroom check, with Escape-to-dismiss added. 183/183 tests green.

Coordinator checkpoint commits `607a412` and `a7eedab` captured that agent's in-flight state before it
finished; they are superseded by its own commits and need no action.

**Two environment notes worth carrying forward:** Playwright was badly contended for a stretch —
repeated timeouts and hangs while `curl` to the same URLs was instant — when several agents shared the
default browser tab. Agents should open their own tab. And the shared Playwright session meant one
agent's navigation landed in another's screenshots.

### Historical — what the two agents were told (kept for context)

Two agents were live when this was first written and their work may be half-finished:

1. **`TemplateRenderBug`** — investigating why switching a template renders with no CSS (Posts) and
   why the preview does not re-render (Pages). **Owner-facing bug, highest priority.** Brief and
   hypothesis are below under "Live agents".
2. **`HeaderPolish`** — post-title underline scope + collapsing the Explore "editing your own copy"
   callout to one line with an info tooltip, moved under the button row.

**Their in-flight CSS was snapshotted by the Coordinator** in a `wip(admin): snapshot HeaderPolish's
in-flight CSS` commit — `apps/admin/src/styles.css` and `styles/pages.css`. That commit is
**unreviewed and possibly a partial mid-write state**. Verify it; do not assume it is complete or
correct. Check `git log --oneline -15` for anything they committed themselves afterwards.

**Do NOT `git checkout` `src/themes/static/basic/`** — `pages/index.html` and `pages/pricing.html`
carry the owner's own uncommitted hand-edits (the `<title>`/`<h1>` mentioning "Leon", and a
`headcountss` typo on the live pricing page the owner is aware of and chose to leave).

Also still uncommitted and NOT agent work — leave alone: `AssistantDock.tsx`,
`AgentPlugins.tsx`, `panels.tsx`, `src/server/app.ts`, `development/todos.md`,
`development/docs/themes/theme-authoring-guide.md`, plus untracked commerce/auth/plugins trees.

### Live agents — what they were told

**`TemplateRenderBug`.** Symptoms, owner's words: on Posts, *"when I switch the template it renders
with no CSS — page shell and blog sidebar template; blog post seems fine."* On Pages, *"when I choose
a template from the dropdown sometimes it doesn't re-render — blog sidebar template does, page shell
and blog post don't."*

Coordinator's hypothesis, given to it explicitly as something to **verify or kill, not assume**: the
preview iframes the real public URL when a record is published AND clean, but falls back to a raw
themeless render when dirty. Selecting a template probably marks the editor dirty, which would make
"no CSS" the fallback branch firing, and "doesn't re-render" the iframe `src` never changing because
the choice was never saved. **Tell-tale check: if that branch is firing, its explanatory notice
should be visible on screen. The owner did not mention seeing one** — so either the theory is wrong
or the notice is not rendering.

It was also told to confirm the PUBLIC render at `:3000` is correct per template before concluding
this is preview-only, since `page-shell.html` was authored as a *page* shell and may simply lack the
chrome a post needs.

**`HeaderPolish`.** Underline back to the title's own width (the owner has now seen both the
half-width and full-row versions and prefers the short rule — make it look deliberate, not
truncated). Callout → one line plus an ⓘ tooltip carrying *"An untouched original is kept
separately…"*, positioned under the `← All themes` row, reclaiming the vertical space. Told to reuse
an existing tooltip component if one exists and to prefer a plain `title` attribute if it suffices,
per the owner's standing "if CSS can handle it, don't build tooltip machinery" rule.

---

## ⚠️ OPEN — sweep the remaining hook files for `useWiredX`

**This is the item the owner asked to be recorded here explicitly.**

`apps/admin` has a `useWiredX` convention: hook dependencies are **injected** rather than reached
for, so hooks are testable without a provider tree or module mocking. A full audit was done this
session — `ADS-memory/reports/implementation/2026-08-11-wired-hooks-audit.md` (commit `75655f7`) —
covering all **93** hook files:

| bucket | count |
|---|---|
| conforming | 5 (+4 port/infra files) |
| not applicable (no host dependency) | 24 |
| **non-conforming** | **57** |
| "leaf infra/bus" (reach a pub/sub bus or `useI18n`) | 5 |
| held by another agent at audit time | 2 |

**The owner scoped this session to SEVEN of them** — the two editor hooks he named
(`use-page-editor.hooks.ts`, `use-post-editor.hooks.ts`) plus the five leaf-infra ones, ruled
"inject them too". Details and blockers in
`ADS-memory/reports/continuity/2026-08-11-deferred-wired-hooks-refactor.md`.

**So ~50 hooks remain unconverted, deliberately.** That sweep is the open work. Notes for whoever
picks it up:

- **Do not redo the audit.** The table already names, per file, which of `api` / `useAdminLocale` /
  `navigate` it reaches for. Partition by feature and fan out.
- **Copy the demonstration slice**, `features/redirects` in commit `2ea11f4`: a port with a real
  binding and a fake, tests injecting the fake with no fetch stub, zero existing assertions edited,
  negatively verified. That is the shape.
- **Every conversion needs a test that mocks an injected dependency.** Testability is the entire
  justification; without one the conversion delivered nothing.
- **If a conversion makes you edit an existing assertion, stop** — either behavior changed or the
  test was asserting an implementation detail.

### The part that will bite if ignored: the drift is ONGOING, not historical

The auditor established both causes with git evidence:

- `useAdminLocale` drift arrived in **one commit** (`f645b5f`, 34 files, 2026-08-08) — a mass rollout
  that ignored a convention that already existed.
- `api` drift is **continuous** — every feature hook added across 12+ days and 8+ commits reached for
  it directly. Only two features ever followed the pattern before this session.

**Therefore a sweep alone will recur.** The durable fix is a `no-restricted-imports` lint rule, and a
working precedent already exists in `eslint.config.mjs` (the `@tanstack/react-query` boundary) that
generalizes directly. It was **not** adopted today because with only 7 of 62 converted it would flag
~55 existing violations needing grandfathering. **Adopt it as the sweep progresses**, not after —
otherwise new drift lands faster than the sweep clears it.

### Also: the spec does not exist

`AI-Dev-Shop/skills/impeccable/reference/hooks.md` is **not** the `useWiredX` spec — it documents the
Impeccable design-detector's lifecycle hook. The Coordinator cited it in error. **No `useWiredX` spec
file exists anywhere under `AI-Dev-Shop/`.** The four reference implementations are the only
authority:

- `apps/admin/src/hooks/use-assistant-chats.hooks.ts`
- `apps/admin/src/hooks/assistant-chats-port.hooks.ts`
- `apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts`
- `apps/admin/src/hooks/__tests__/use-assistant-chats.unit.test.ts`

**Writing the actual spec is worth doing** — a convention with no document and 57 violations is a
convention only its author knows.

---

## Other open items from this session

- **Template applicability has no answer.** After the marker unification, one flat `templates` array
  means nothing stops the Pages picker offering `blog-post.html` for Privacy Policy. The design doc's
  "infer from which markers a file contains" idea was correctly killed by the implementer — post
  unification every template carries the identical marker, so the signal no longer exists. Needs
  either declared metadata per template, or the end state where post-specific chrome becomes markers
  that degrade to nothing. See `ADS-memory/reports/design/2026-08-11-unified-content-marker-and-templates.md`.
- **The generic `post` embed type is superseded but not retired** — `content`-with-id replaces it.
- **`development/docs/themes/theme-authoring-guide.md`** carries stale template vocabulary
  (`postTemplate`/`pageTemplate`) and was left alone due to a concurrent in-flight edit.
- **Dark-mode toggle** (queue item 12 in `2026-08-11-explore-queue.md`) — never built. `AppearanceTab`
  is still the only writer of `data-theme`.
- **`ADS-memory/reports/implementation/2026-08-11-basic-page-template.md`** documents a git-index race
  that swept theme files into commit `028dba3`; isolable via a 2-file diff, commands in that report.

## Standing hazards proven repeatedly today

- **Concurrent agents share one git index.** Explicit-path `git add` is necessary but NOT sufficient —
  one commit swept in 17 files from another agent. Always `git diff --name-only --cached` before and
  `git show --stat HEAD` after. See memory `reference-shared-git-index-across-agents`.
- **Mid-flight `SendMessage` does not reach a heads-down subagent.** Put everything in the spawn
  prompt; send only when an agent surfaces or goes idle.
- **CSS presence is not precedence.** `.theme-card button.btn-explore` (0,2,1) beat `.btn-explore`
  (0,1,0) and made a change look like a no-op. Hit three times on that one card.
- **Screenshots are not evidence.** Two real defects this session were invisible in images and caught
  only by `getBoundingClientRect` — including a class silently doing nothing because it sat on a
  `display: contents` element.

---

## What shipped this session (all committed on `general-work`)

| area | commits | what |
|---|---|---|
| Cleanup | `c408ff7` `085e4c1` `26cd91f` `8e06816` `303f6f3` | Dead `parent` inheritance + `basic-child` deleted; `novice` removed (2.8M); `preview/` excluded from catalog copies. **Two deletions were REFUSED and fixed instead** — `post-template-resolution.test.ts` was live coverage with a 2-line fixture bug, and the allowlist tests guard live SSTI/XSS code. Three handoffs had said to delete both. |
| Explore file ops | `2786ba3` `d0898b1` `a43af2c` | `assets` screened to media, new read-only `other` group, JS read-only enforced server-side AND in UI, ⋮ menu with Copy/Rename + double-click rename. |
| Explore UI | `0910f52` `83e26a0` `04a5b23` `beab5a3` `fd81d10` `497ec8e` `ce82334` `88d9e5f` | `ThemeExplore` complexity 27→8 / 29→6 by top-level extraction; full-height sidebar; toolbar restructure; error toast; tier tab reorder; Explore button → black fill; Activate de-orangified; Save → `--primary` and `.btn-solid` deleted. |
| Pages templates | `2488e3f` `b345518` `f27f27d` `3ee2838` `fd403b6` `27fa181` | Render gate no longer hijacks Pages into the Post template branch; `injectPageTitle`; `validateTemplateDeclarations`; `basic/page-shell.html`; five legacy pages templated. |
| **Unified markers** | `69e08d9` `cebbcd3` | One `templates` array, one `{"type":"content"}` marker with optional id, resolver dispatching on `bodyFormat`. 63 files. **Found and fixed a pre-existing draft-leak hole** in the generic `post` resolver (unguarded `findById` since 2026-08-10). Recursion + visibility guards fault-injected. |
| Pages/Posts editors | `b9a2206` `486c75c` `46f0234` `7421b80` `935a6cf` `5d73e41` | Toolbar gap 36→12px; template picker merged into the toolbar row; title/slug share one row; HTML tab pretty-printer; themed preview; Editor/Preview tabs on Posts. |
| Mobile | `161d124` | Slug row no longer splits into three lines; Explore callout releases its 50% cap under 640px. |
| Hooks | `2ea11f4` `75655f7` | `features/redirects` converted to `useWiredX` as the demonstration slice; full 93-file audit. |

### Live-content migrations — restore points exist

- Nine legacy `doc` Pages converted to `html` via
  `development/scripts/convert-legacy-doc-pages-to-html.ts --apply`. Restore point:
  `infra/restore-point-convert-legacy-doc-pages-to-html-wm2-1786480868809.db`.
- Five published pages assigned `template_choice = page-shell.html`. Restore point:
  `infra/restore-point-assign-page-shell-template-to-legacy-pages-wm2-1786484079805.db`.

Both were run through `PagesHtmlDocumentStore` / the real admin route, never raw SQL.

### The headline fix

`terms-of-service`, `privacy-policy`, `contact`, `team` and `faq` were rendering as
`<title>Blog post — Basic</title>` on the live site, because the render gate checked `bodyFormat`
and never `kind` despite a comment claiming it was "scoped to Posts only". They now render their own
titles, content, and theme template. **The asymmetry that fixes it must survive future refactors:**
Posts fall back to the theme's first template when nothing is chosen; **Pages deliberately do not.**

---

# TABLED FOR NEXT SESSION — prioritized

This is the authoritative list. Where an earlier section above overlaps, this one wins.

## 1. The seven scoped hooks — READY NOW, start here

The owner audited-and-scoped this himself: convert **seven** hooks, not the other fifty.

- `apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts`
- `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts`
- the **five "leaf infra/bus" hooks** that reach a pub/sub bus or `useI18n` directly — owner's ruling:
  *"same treatment, inject them too."* They are named in the audit table.

**Unblocked.** The two editor hooks were held by the `TemplateRenderBug` agent, which has finished and
committed. **Concrete conversion plans already exist** in
`ADS-memory/reports/implementation/2026-08-11-wired-hooks-audit.md` — exact port interfaces taken from
`lib/api.ts`'s real signatures, exact signature changes, and a note that `PageEditor.tsx` /
`PostEditor.tsx`'s own DI-prop defaults need the same edit shape applied to `Redirects.tsx`.

Copy the shape of the demonstration slice, `features/redirects` (commit `2ea11f4`). **`use-post-editor`
has no unit test at all**, so its conversion must bring first coverage, not just rewiring — it is the
bigger of the two. Do all seven in ONE agent.

## 2. Tailwind → shadcn/ui → admin skins — the owner's stated order

**Carried over untouched from the previous session's handoff.** This was the plan before the ⋮ menu
consumed the day, and it is the largest remaining workstream.

1. **Tailwind**, with `preflight` **DISABLED**, for **NEW surfaces only**. Do not migrate the existing
   ~4,700 lines / 541 selectors.
   **BINDING CONSTRAINT:** Tailwind's theme must map onto the existing CSS variables
   (`backgroundColor: { surface: 'var(--surface)' }` → `bg-surface`), never onto its default palette.
   A component written `bg-blue-500 shadow-md` is invisible to admin skins — which is the entire
   reason constraint 1 exists.
2. **shadcn/ui** — the owner explicitly wants its components. Must come after Tailwind (shadcn emits
   Tailwind classes). **Budget time to rewrite each generated component onto the token bridge.**
3. **Admin skins** (Studio → Appearance). `admin-appearance` is still a `Placeholder` panel. Needs
   token axes beyond color (`--surface-alpha`, `--surface-blur`, `--elevation-shadow`) or
   "glassmorphic" is unreachable. Notes in `development/todos.md`.

**This session made step 3 materially easier**: every button restyled today went through tokens rather
than hex, and one real bug was fixed at the token level (`--surface` was `oklch(100% 0 0)` — a literal
hue instead of `none` — which made every disabled `--primary` button app-wide render pink).

## 3. Template applicability — an open design question, no answer yet

One flat `templates` array means **nothing stops the Pages picker offering `blog-post.html` for
Privacy Policy**. `blog-post.html` carries a byline, a date, tags and next-post nav; on a legal page
those render as empty or meaningless chrome. Before the merge this was *unrepresentable*; now it is
one click away.

The design doc proposed inferring applicability by scanning which markers each template contains.
**The implementer correctly killed that** — after unification every template carries the identical
single marker, so the signal no longer exists and the scan would be a no-op. It said so rather than
shipping one.

Two remaining options, needing an owner decision:
- **Declared metadata** per template (e.g. `{"file": "blog-post.html", "for": ["post"]}`) — simple,
  but reintroduces hand-declared truth that can drift from the file.
- **End state:** post-specific chrome becomes markers that degrade to nothing when the field is
  absent. Then applicability stops being a question at all. Bigger, and the right destination.

⚠️ **If the field-marker route is taken, resolve the date problem first.** `PostRecord` has **no
`publishedAt`** — only `updatedAt` (`src/features/post/post.ts:44`, whose own doc comment says calling
it `publishedAt` "would tell the model something false"). `entries.publishedAt` exists
(`db/schema.ts:923`) but is not threaded into `SiteRenderContext`. Build on `updatedAt` and every
listing date moves whenever someone fixes a typo.

## 4. Template preview is published-rows-only

`6a20902` renders a **pending, unsaved** template choice through the real pipeline. It is deliberately
scoped to **published** rows: testing showed a draft's own body does not survive the content-marker
resolver's visibility guard, so widening it would render styled chrome around an **empty body**.
Disclosed, not hidden. Fixing it means giving the preview path an authenticated read that bypasses the
public visibility filter — **carefully**, since that guard was added the same day to stop drafts
leaking onto public pages.

## 5. Dark-mode toggle — queue item 12, never built

The owner saw dark mode (agents flipping `data-theme` via `page.evaluate` to verify tokens), liked it,
and asked for a sun/moon toggle in the admin's top-right. Full brief in
`ADS-memory/reports/continuity/2026-08-11-explore-queue.md` item 12.

Key constraint: **`AppearanceTab` is still the only component that writes `data-theme`**, mounted
inside the Settings dialog with `livePreview={false}`. **Reuse that writer; do not add a second one** —
two things setting the same attribute is the duplication pattern this codebase hit three times today.
Also: persist the choice, default to `prefers-color-scheme`, handle first-paint flash, and give the
icon an accessible name plus `aria-pressed`. The top-right chrome may live in `panels.tsx`, which
holds someone else's uncommitted work.

## 6. The other ~50 hooks, and the lint rule

57 non-conforming hooks were found; 3 converted, 7 scoped (item 1). **~50 remain, deliberately.**

**The drift is ONGOING, not historical** — this is the part that matters. `useAdminLocale` drift came
in one commit (`f645b5f`, 34 files, 2026-08-08), but **`api` drift is continuous**: every feature hook
added over 12+ days and 8+ commits reached for it directly. **A sweep alone will recur.**

The durable fix is a `no-restricted-imports` lint rule; a working precedent already exists in
`eslint.config.mjs` (the `@tanstack/react-query` boundary) that generalizes directly. Not adopted today
because at 7-of-62 converted it would flag ~55 violations needing grandfathering. **Adopt it as the
sweep progresses, not after** — otherwise new drift lands faster than the sweep clears it.

## 7. Write the actual `useWiredX` spec

**No spec file exists anywhere under `AI-Dev-Shop/`.** The Coordinator cited
`skills/impeccable/reference/hooks.md` in error — that documents the Impeccable design-detector's
lifecycle hook, unrelated to React. The four reference implementations (listed earlier in this file)
are the only authority. A convention with no document and 57 violations is a convention only its
author knows.

## 8. Retire the generic `post` embed type

Superseded by `{"type":"content","id":...}` but still registered. Leaving both is a second way to say
one thing — the exact shape the marker-spine unification existed to remove. Note the `post` resolver
was retrofitted with the visibility guard in `69e08d9`, so it is safe in the meantime, just redundant.

## 9. `theme-authoring-guide.md` documents retired vocabulary

`development/docs/themes/theme-authoring-guide.md` still describes `postTemplate`/`pageTemplate`.
Left alone because it had a concurrent in-flight edit. A doc that teaches a retired API is worse than
no doc.

## 10. Housekeeping: a git-index race in `028dba3`

`PageShell`'s theme files (`basic/page-shell.html` + the `theme.json` template line) were swept into
`028dba3`, an unrelated ThemeExplore commit. History was **not** rewritten. Cleanly isolable via a
2-file diff; exact commands in
`ADS-memory/reports/implementation/2026-08-11-basic-page-template.md`. Cosmetic — fix only if the
history matters to you.

---

## Suggested skills for the next agent

- **`handoff`** — to produce the next one of these.
- **`codebase-memory`** — for structural questions; the index was fresh at HEAD this session, but it
  cannot see uncommitted work, so validate against source.
- **`simplify`** — several files grew today (`PostEditor.tsx`, `PageEditor.tsx`, `ThemeExplore.tsx`).
  `check:admin-complexity-drift` reports 3 violations; `ThemeExplore.tsx` was taken 27/29 → 8/6 and
  should stay there.
- **NOT `frontend-design`** — this admin has an established token system and two established editor
  layouts; new aesthetic direction is not what the remaining work needs.

## Handoff Contract

- **Inputs used:** live `curl` against `:3000` and `:5173`, direct read-only `sqlite3` on
  `infra/content.db`, `git log`/`git status`/`git show --stat`, scoped `vitest` and `node:test` runs
  with real counts, `npx tsc --noEmit` in both packages against the 35-error admin baseline,
  `npm run check:admin-complexity-drift`, `npm run check:embed-marker-drift`, and thirteen Sonnet
  subagent reports each independently spot-verified rather than taken at face value.
- **Output summary:** the copy-not-inherit theme model is finished end to end; Pages gained a template
  picker and a real content marker; the Post/Page template vocabulary is unified behind one `templates`
  key and one `content` marker; five legal pages that were rendering as blog posts on the live site are
  fixed; and both editors gained working themed previews.
- **Risks:** **nothing is pushed** (51 commits, one machine); template applicability is unanswered and
  now one click from a wrong render; draft previews are unsupported; ~50 hooks remain non-conforming
  with the drift still active; the owner's live-theme edits exist only in the working tree.
- **Suggested next assignee:** Claude Code (Opus) as Coordinator for the Tailwind token-bridge design
  and the applicability decision; Sonnet 5 subagents for all implementation, per the owner's standing
  instruction.
