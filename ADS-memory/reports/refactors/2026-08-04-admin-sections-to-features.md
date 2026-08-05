# Proposal: `apps/admin/src/sections/` → `apps/admin/src/features/`

Status: **awaiting owner verification.** Nothing has been moved. Plan → canary → subagent.

---

## 1. What is actually on disk (two different things, easily confused)

| path | what it is |
|---|---|
| `apps/admin/src/sections/` | **The real code.** 36 `.tsx` files, 12,554 lines, flat, plus `__tests__/` with 19 test files (also flat). |
| `apps/admin/sections/` | **13 folders containing only `INFO.md`.** Not under `src/`, so nothing imports it and nothing builds it. |

`apps/admin/sections/*/INFO.md` is **not a migration plan for the current code** — read one and it is
clear they are *original product-design placeholders*: they cite build phases ("Phase 5", "after
Phase 1"), ADRs (ADR-004/008/010), user flows (UF-01/07/10/13), and a plugin **surface registry**
that contributes admin sections at runtime. They describe an admin that does not exist yet.

Three of the thirteen describe things with no code at all today (`updates`, `notifications`,
`tools`), and `ai/` describes a change-set review queue, not the assistant screen we have.

**So: useful as vocabulary, wrong as a target.** Adopting those folder names wholesale would create
empty features and mis-file real ones.

### Recommendation for that directory

Do not delete it — it is the only written record of that design. **Move it to
`ADS-memory/reports/architecture/admin-target-sections/`** where design documents live, and have
each real feature folder carry its own `README.md` instead (see §4). If you would rather keep it in
the repo tree, say so and it stays — but it should not sit next to `src/` looking like scaffolding.

---

## 2. The grouping signal I used

Not the INFO.md names. The product already groups these screens, in `panels.tsx` — every panel
declares a `group`, and `nav.ts`'s `buildNav()` derives the sidebar from it. That grouping is live,
tested (`__tests__/unit/admin-nav-recovery-acs.unit.test.ts`), and is what an operator actually sees.

The nav groups are: **(ungrouped top row)**, **Content**, **People**, **Design & System**,
**Marketing**.

### The one real decision for you: flat or nested?

```
A. FLAT                          B. NESTED BY NAV GROUP
features/posts/                  features/content/posts/
features/pages/                  features/content/pages/
features/users/                  features/people/users/
features/seo/                    features/marketing/seo/
```

**I recommend A (flat).** Nav grouping is a *presentation* choice — "AI Assistant" was already moved
out of "Design & System" into the ungrouped top row for UX reasons (`panels.tsx:108`), and a
re-group would then mean moving directories and rewriting imports for a cosmetic change. A feature
folder should be stable; the sidebar is allowed to move things around it.

Everything below assumes A. Say the word and I will re-cut it as B.

---

## 3. Proposed mapping — all 36 files

Feature folders own their screens, their editors, and (per §5) their tests.

### Ungrouped / top row
| feature | files |
|---|---|
| `features/dashboard/` | `Dashboard.tsx` |
| `features/ai-assistant/` | `AiAssistant.tsx` |

### Content
| feature | files |
|---|---|
| `features/posts/` | `Posts.tsx`, `PostEditor.tsx` |
| `features/pages/` | `Pages.tsx` |
| `features/media/` | `Media.tsx` |
| `features/collections/` | `Collections.tsx`, `CollectionEntries.tsx`, `CollectionEntryEditor.tsx` |
| `features/menus/` | `Menus.tsx`, `MenuEditor.tsx` |
| `features/widgets/` | `WidgetsLibrary.tsx`, `WidgetRegions.tsx`, `WidgetRegionEditor.tsx`, `WidgetInstanceEditor.tsx` |
| `features/taxonomy/` | `Taxonomy.tsx` |
| `features/forms/` | `FormsList.tsx`, `FormEditor.tsx` |

### People
| feature | files |
|---|---|
| `features/users/` | `Users.tsx` |
| `features/roles/` | `Roles.tsx` |
| `features/members/` | `Members.tsx` |
| `features/comments/` | `Comments.tsx` |

### Design & System
| feature | files |
|---|---|
| `features/appearance/` | `Appearance.tsx` |
| `features/plugins/` | `Plugins.tsx` |
| `features/database/` | `Database.tsx` |
| `features/integrations/` | `Integrations.tsx`, `IntegrationDeliveries.tsx` |
| `features/recovery/` | `Recovery.tsx` |
| `features/settings/` | `Settings.tsx`, `SettingsUi.tsx` |
| `features/workspace/` | `Workspace.tsx` |

### Marketing
| feature | files |
|---|---|
| `features/seo/` | `Seo.tsx` |
| `features/redirects/` | `Redirects.tsx` |
| `features/analytics/` | `Analytics.tsx` |

### Not features — these two need a decision
| file | why it does not fit | proposal |
|---|---|---|
| `Login.tsx` (43 lines) | Renders before the admin shell; not a nav panel, has no `panels.tsx` entry. | `features/auth/Login.tsx` — it is a screen, and `auth` is honest even as a folder of one. |
| `Placeholder.tsx` (65 lines) | A *shared* component: `panels.tsx:6` imports it directly and renders it for `newsletter`, which has no screen. Filing it under a feature would make an unrelated feature a dependency of the router. | `components/Placeholder.tsx` — beside the other shared components. |

### Two things worth flagging now, before anyone moves a file

1. **`settings/` holds two unrelated screens.** `Settings.tsx` (938 lines) is the SPEC-007 raw ledger
   browser; `SettingsUi.tsx` (837) is the curated 13-tab Open Design port. Both are deliberately kept
   (`SettingsUi.tsx`'s header states the decision on record). They share a name and nothing else.
   Option: `features/settings/` for the curated one and `features/settings-raw/` for the ledger
   browser — which matches `panels.tsx`, where they are already two panels (`settings`,
   `settings-raw`). **I lean toward splitting them.** Your call.
2. **`Appearance.tsx` is 76 lines** while the nav calls it "Themes". If it is a stub, `features/appearance/`
   is still the right home, just a small one.

---

## 4. What goes in each feature folder

Per your note that these folders should hold more than an `INFO.md`:

```
features/menus/
  index.ts            re-exports the panel component(s) — panels.tsx imports from here
  Menus.tsx
  MenuEditor.tsx
  hooks/              only if §6 extracts any
  __tests__/          mirrors the folder (see §5)
  README.md           what this feature owns, what it deliberately does not
```

`index.ts` is the point of the exercise: `panels.tsx` imports `features/<name>`, never a file inside
it, so a feature can reshape internally without touching the router.

---

## 5. Tests

`sections/__tests__/` is flat, 19 files. They move **with their feature**, into
`features/<name>/__tests__/`, mirroring the structure — the same convention just applied to
`@jini-ai/chat`'s `model-picker`.

**Move them, do not re-author them.** `git mv`, then fix relative import depth. Re-authoring burns
passes and quietly loses coverage.

Known pre-existing breakage to leave alone (or fix deliberately, but do not hide):
`AiAssistant.unit.test.tsx` is **9 passing / 4 failing** right now, and has been since the roadmap
became its own tab. The four failures query roadmap content without activating the "Not built yet"
tab. They must still fail after the move for the same reason — a move that "fixes" them has changed
behaviour.

Sections with **no** test today: `Analytics`, `Appearance`, `Collections`, `Database`, `Login`,
`Pages`, `Posts`, `Recovery`, `Redirects`, `Roles`, `Seo`, `Settings` (raw), `SettingsUi`,
`Taxonomy`, `Workspace`, `WidgetRegionEditor`, `WidgetRegions`, `IntegrationDeliveries`. That is a
real gap, but it is **not** this refactor's job. Listed so it is visible, not so it gets bundled in.

---

## 6. Hooks — this is the part that is not mechanical, and I want to flag it hard

You asked to "extract the hooks properly into hooks file". I checked: **there are no named custom
hooks in any section file.** Zero. `rg` for `function use[A-Z]` / `const use[A-Z]... =` across all 36
files returns nothing.

So this is not a move. It is **authoring new hooks** out of inline state, which is a behaviour-
changing refactor. The density:

| file | `useState` | `useEffect` |
|---|---|---|
| `Users.tsx` | 26 | 2 |
| `Settings.tsx` | 23 | 6 |
| `Roles.tsx` | 23 | 2 |
| `Taxonomy.tsx` | 22 | 4 |
| `FormEditor.tsx` | 22 | 5 |
| `Database.tsx` | 18 | 3 |
| `CollectionEntryEditor.tsx` | 16 | 2 |
| `Seo.tsx` | 15 | 4 |
| `Media.tsx` | 15 | 3 |
| `Collections.tsx` | 15 | 5 |

**Recommendation: do it as a second pass, not inside the move.** Two reasons, and the second is the
one that matters:

1. A move is verifiable by "imports resolve, tests still pass, screens still render". A hook
   extraction is not — it can silently change render timing, effect ordering, or what re-renders.
2. If both happen in one commit, a regression cannot be bisected to either. `Users.tsx` has 26
   `useState` calls and **no test at all** — extracting hooks there, blind, is the highest-risk edit
   in this whole plan.

The convention already exists and should be followed: `hooks/use-*.hooks.ts`, matching
`hooks/use-settings-slice.hooks.ts` and `hooks/use-dirty-guard.hooks.ts`. Feature-local hooks live in
`features/<name>/hooks/`; anything a second feature needs is promoted to the shared `src/hooks/`.

---

## 7. Canary

**`features/menus/`** — `Menus.tsx` (165) + `MenuEditor.tsx` (441), 606 lines, and *both* have tests
(`Menus.unit.test.tsx`, `MenuEditor.unit.test.tsx`).

It is the right canary because it exercises every mechanism the other 24 features need — a
list/editor pair, an `index.ts` barrel, a `panels.tsx` import rewrite, a `__tests__/` move with
import-depth changes — while being small enough to read the whole diff.

Verification gate before any subagent is dispatched:
- `npx tsc --noEmit -p tsconfig.json` clean in `apps/admin`
- `Menus`/`MenuEditor` unit tests pass from their new location
- the Menus screen and the editor render in a browser (private Chromium, not your Chrome)
- `rg "sections/Menus|sections/MenuEditor"` returns nothing

---

## 8. Open questions for you

1. **Flat (A) or nested-by-nav-group (B)?** I recommend A.
2. **Split `Settings.tsx` and `SettingsUi.tsx`** into `settings-raw/` and `settings/`? I lean yes.
3. **`apps/admin/sections/` (the INFO.md tree)** — move to `ADS-memory/reports/architecture/`,
   or keep in the repo?
4. **Hooks extraction as a separate pass?** I strongly recommend yes.
5. `Login.tsx` → `features/auth/`, and `Placeholder.tsx` → `components/`. Object if either is wrong.
