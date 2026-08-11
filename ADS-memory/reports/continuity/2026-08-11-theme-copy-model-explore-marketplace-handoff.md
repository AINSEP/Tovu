# Handoff: theme copy model shipped — catalog, marketplace, Explore screen

Generated: 2026-08-11 (session 2 of the day)
Source: Claude Code (Opus 5, 1M context), Coordinator + 2 Sonnet subagents.
**Branch is now `general-work`** — `refactor/jini-admin-extraction` was renamed mid-session and no
longer exists. Same history, all commits intact. **Nothing pushed.**

---

## Next-Agent Prompt

Read this file, then `ADS-memory/reports/continuity/2026-08-11-page-theme-composition-handoff.md`
ONLY for background on what was superseded — its open decision is now CLOSED and executed.

**Process instruction from the owner, verbatim, given at the end of this session:**

> "a sonnet 5 subagent should have done this but too late now. ill have to restart for context purposes"

**Read that as binding.** Admin UI implementation work — components, hooks, CSS, their tests — should
be DISPATCHED to Sonnet subagents, not done in the Opus main context. The two subagents used this
session both worked well; the mistake was doing the third chunk (assets/CSS/reset UI) inline. Default
to delegating implementation; keep design decisions, verification, and cross-cutting judgment in the
main thread.

---

## THE DECISION, NOW EXECUTED

Runtime theme inheritance is **dead**. Themes are **copied from a pristine catalog**, never inherited.
Full model + the traps found building it: memory `project_tovu_theme_copy_model.md`.

- `src/themes/__original-themes__/<tier>/<id>/` — pristine originals. Never discovered, never runnable,
  never edited.
- `src/themes/__marketplace__/<tier>/<id>/` — local stand-in for a remote marketplace, same exclusion.
- Downloading writes BOTH the catalog original and an editable copy, so **every installed theme is a
  copy by construction** — there is no "am I editing an original?" question to answer anywhere.
- `lineage` is metadata, never runtime resolution. **Never call a copy a "child theme"** in code or UI.
- Ids unique per FOLDER; collisions get `-1`/`-2` via `nextAvailableThemeId`. **Only the id is
  suffixed, never the display `name`.**

`theme.json`'s `parent` field and `src/themes/static/basic-child/` still exist and are now DEAD —
deleting them is safe and was never done. The active theme is `basic`, so nothing depends on them.

---

## Commits this session (all on `general-work`)

| sha | what |
|---|---|
| `d327527` | originals catalog, `npm run theme` CLI, runtime rescan, dynamic asset route |
| `379f437` `136aed1` `b5ce2e6` | marketplace fixture, `nextAvailableThemeId`, list/download routes (subagent) |
| `7d0147c` | Explore screen — edit any theme, preview it rendered |
| `34d17e6` | `features/appearance` → `features/themes`; Marketplace tab enabled |
| `c5bdbb7` | (other agent) SQLite restore-points → `@jini-ai/infra` |
| `5763a52` `f5d2099` `fd26d93` | partial rendering, device widths, fullscreen, ResizeObserver (subagent) |
| `8a7169b` | Explore button blue; CLI copy suffixes on collision |
| `a4b1e49` | **save→preview staleness fix** + ⌘S |
| `5b5ecce` | ⌘S hint on the Save button |
| `69497c3` | assets/CSS/scripts in the file list; reset-to-original |
| `3ac885e` | (subagent) PageEditor preview tracks real pane width |

---

## The bug class that bit three times

**Boot-time snapshots.** `deps.themes` is built once at composition and held for the process's life.
Three separate symptoms, all the same cause:

1. A new theme on disk was invisible until restart → `rescanThemes` + a dynamic
   `/theme-assets/:themeId` route (per-theme `app.use()` mounts CANNOT be re-run; Express mounts
   cannot be removed).
2. A new theme's CSS 404'd → same dynamic route.
3. **Saving a file changed disk and nothing else** — `DiscoveredTheme.pages` holds file CONTENTS, and
   the preview renders from that map. The owner hit this immediately. Fixed by `reloadTheme` in
   `src/server/routes/admin/themes/explore.ts`, with a negative-verified regression test at
   `src/server/__tests__/routes/theme-file-save-route.integration.test.ts`.

**The `theme_write_file` AGENT tool had this right from the start** and the HTTP route did not — a
second surface onto one capability that didn't carry over the first one's correctness. Worth checking
for other instances of that shape.

---

## Agent tools already exist — do not rebuild

Both domains are already registered in `src/assistant/tool-registrations.ts`:

- `themes` → `theme_list`, `theme_list_files`, `theme_read_file`, `theme_write_file`
- `pages` → `pages_read_html`, `pages_write_html`

The owner asked whether the AI can already edit and save pages/themes. **It can.** What was missing
was the human-facing equivalent, which is what the Explore screen now provides.

---

## Open work, in the owner's stated order

1. **Tailwind** — set up with `preflight` DISABLED, for NEW surfaces only. Do not migrate the existing
   4,687 lines / 541 selectors.
   **BINDING CONSTRAINT:** Tailwind's theme must map onto the existing CSS variables
   (`backgroundColor: { surface: 'var(--surface)' }` → `bg-surface`), never onto its default palette.
   A component written `bg-blue-500 shadow-md` is invisible to admin skins.
2. **shadcn/ui** — owner explicitly wants its components. Must come after Tailwind (shadcn generates
   Tailwind classes). Budget time to rewrite each generated component onto the token bridge.
3. **Admin skins** (Studio → Appearance) — the reason for constraint 1. `admin-appearance` is already
   a `Placeholder` panel. Needs token axes beyond color (`--surface-alpha`, `--surface-blur`,
   `--elevation-shadow`) or "glassmorphic" is unreachable. Full notes in `development/todos.md`.

---

## Uncommitted / loose ends

- **`src/server/app.ts`, `development/todos.md`** — carry other people's in-flight work (commerce
  module, a todos rewrite) alongside my additions. Held back deliberately; `todos.md` now also holds
  the admin-skins and shadcn notes, so it is probably worth committing regardless.
- **`liquid-allowlist.test.ts` / `handlebars-allowlist.test.ts` FAIL** — ENOENT on
  `src/themes/templated/dispatch/` and `src/themes/handlebars/ledger/`, which commit `4f6ce56`
  ("archive old ones") deleted. Pre-existing test rot, confirmed via git log, not caused here.
- **`src/features/theme/__tests__/static-render.test.ts` HANGS HARD** (burns a core until killed) and
  `post-template-resolution.test.ts` has a pre-existing failure. **Never run either.** Both test a
  retired design and should be DELETED — still the owner's call, raised across three handoffs now.
- **Repo weight**: the catalog copy added ~5.6MB, ~2.5MB of it `screenshots/` and `preview/` build
  artifacts. Excluding those from catalog copies would halve it and lose nothing.

---

## Live state

- Active theme: `basic`. Site :3000, admin :5173 — **both the owner's, do not kill.**
- `src/themes/static/novice/` is a committed demo copy of `basic` with a `team` page, a `sidebar`
  partial, and no footer on that page. Safe to delete if unwanted.
- `admin tsc --noEmit` baseline is **35** errors (a vitest `Mock<Procedure|Constructable>` typing
  issue in unrelated test files). Server tsc is clean. Anything above 35 is new.
- **Shell cwd resets between Bash calls** — always `cd /path && npx tsc`, never a bare `npx tsc`, or
  you get numbers from whatever directory the shell reset to. A subagent burned real time on this.

---

## Handoff Contract

- **Inputs used:** live `curl` against :3000, direct `sqlite3` reads, per-suite scoped test runs with
  real counts, `npx tsc --noEmit` in both packages, negative verification of the save regression test,
  and two Sonnet subagent reports each independently re-verified rather than taken at face value.
- **Output summary:** the copy-not-inherit model is built, tested, and running end to end — catalog,
  marketplace with collision suffixing, and an Explore screen that edits any theme and previews it.
- **Risks:** two poisoned test files still present; two allowlist tests failing on deleted fixtures;
  `app.ts`/`todos.md` uncommitted with mixed ownership; nothing pushed, five handoffs running.
- **Suggested next assignee:** Claude Code (Opus) for the Tailwind token-bridge design, then Sonnet
  subagents for the implementation — per the owner's instruction at the top of this file.
