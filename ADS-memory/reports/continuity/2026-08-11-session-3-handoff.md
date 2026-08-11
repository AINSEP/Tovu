# Handoff — session 3, 2026-08-11 (Explore/Pages/Posts UI + templates unification)

**Status: IN PROGRESS.** Two agents were still running when this was written (`TemplateRenderBug`,
`HeaderPolish`). Run the full `/handoff` once they land to complete it. This file exists now so the
open items below cannot be lost to a restart.

Branch `general-work`. **Nothing pushed.**

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
