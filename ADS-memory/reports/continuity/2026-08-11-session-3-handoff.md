# Handoff — session 3, 2026-08-11 (Explore/Pages/Posts UI + templates unification)

**Status: IN PROGRESS — session may have been disconnected mid-flight.** Branch `general-work`.
**Nothing pushed.**

## FIRST THING TO DO ON RESUME

Two agents were live when this was written and their work may be half-finished:

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
