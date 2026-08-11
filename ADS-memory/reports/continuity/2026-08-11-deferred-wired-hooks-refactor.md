# DEFERRED — `useWiredX` hook dependency-injection refactor

> ## ⚠️ UPDATED 2026-08-11 (second pass) — read this block before the rest of the file
>
> **The spec pointer below is WRONG.** `AI-Dev-Shop/skills/impeccable/reference/hooks.md` documents
> the Impeccable design-detector's lifecycle hook and has nothing to do with React `useWiredX`. The
> Coordinator matched on a filename and asserted it. **No `useWiredX` spec file exists anywhere under
> `AI-Dev-Shop/`.** Work from the four reference implementations named further down; they are real.
> Someone should write the actual spec.
>
> ### The audit is DONE — do not redo it
> `ADS-memory/reports/implementation/2026-08-11-wired-hooks-audit.md` (commit `75655f7`) has the full
> table of all **93** hook files under `apps/admin/src`, naming which of `api` / `useAdminLocale` /
> `navigate` each non-conforming one reaches for.
>
> - 5 conforming (+4 port/infra files) · 24 not-applicable · **57 non-conforming** · 5 "leaf infra"
>   flagged for a ruling · 2 held by another agent.
> - `features/redirects` (3 hooks) was converted as a demonstration slice in commit `2ea11f4` — a new
>   port with a real binding and a fake, 7 new tests injecting the fake with no fetch stub, zero
>   existing assertions edited, negatively verified. **Copy that slice's shape.**
>
> ### Why the drift happened — BOTH causes, and it changes the fix
> - `useAdminLocale` drift arrived in **one commit** (`f645b5f`, 34 files, 2026-08-08), a mass rollout
>   that ignored a convention that already existed.
> - `api` drift is **continuous** — every feature hook added over 12+ days and 8+ commits reached for
>   it directly; only two features ever followed the pattern before this session.
>
> So **a cleanup alone will recur.** A `no-restricted-imports` lint rule is the durable fix, and a
> working precedent already exists in `eslint.config.mjs` (the `@tanstack/react-query` boundary) that
> generalizes directly. **Not adopted** — the owner chose the minimal scope below, and a rule today
> would flag ~55 existing violations needing grandfathering. Revisit when more are converted.
>
> ### OWNER DECISIONS, 2026-08-11 — this is the whole remaining scope
> **Convert exactly seven hooks. Not the other fifty.**
>
> 1. **The two originally deferred**, which the owner named himself:
>    `apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts` and
>    `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts`.
>    Concrete conversion plans for both are already written in the audit report — exact port
>    interfaces taken from `lib/api.ts`'s real signatures, exact signature changes, and a note that
>    `PageEditor.tsx` / `PostEditor.tsx`'s own DI-prop defaults need the same edit shape applied to
>    `Redirects.tsx`. **`use-post-editor.hooks.ts` has no existing unit test at all**, so it is the
>    bigger lift of the two.
> 2. **The five "leaf infra/bus" hooks** the auditor flagged — they reach a pub/sub bus or `useI18n`
>    directly rather than one of the four named dependencies. Owner's ruling: **same treatment, inject
>    them too.** A bus and a translation function are host dependencies like any other, and they are
>    precisely the ones that force a provider tree into a test.
>
> **Blocker:** the two editor hooks were held by the `TemplateRenderBug` agent. Confirm that agent has
> finished and its work is committed before editing them. Do all seven in ONE agent.



Raised by the owner 2026-08-11. An agent was dispatched and then **stopped within a minute, on the
owner's call**, because two other agents were actively editing hook files at the time. Nothing was
changed. This file preserves the analysis so the work can be re-dispatched cleanly rather than
re-derived.

**Re-dispatch when `ExploreUI2` and `PagesTemplates` have both landed and committed.**

---

## The convention

The admin has a `useWiredX` paradigm: hook dependencies are **injected** rather than reached for, so
hooks can be tested and mocked without a provider tree or module-level mocking.

- **Spec:** `AI-Dev-Shop/skills/impeccable/reference/hooks.md`
- **Conforming implementations already in this repo** — these are the pattern reference, and where the
  doc and the working code disagree, the code wins:
  - `apps/admin/src/hooks/use-assistant-chats.hooks.ts`
  - `apps/admin/src/hooks/assistant-chats-port.hooks.ts`
  - `apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts`
  - tests: `apps/admin/src/hooks/__tests__/use-assistant-chats.unit.test.ts`

So this is **drift from an established convention**, not a new pattern to introduce. Do not invent a
second injection style.

## The owner's example

`apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts`. Owner, verbatim:

> *"for some of the hooks they aren't doing the useWiredX paradigm where the dependencies are
> injected so it's easier to test and mock. Here's an example — `t` for translation, and `api`,
> `navigate`, `useAdminLocale` should be injected."*

Dependencies to inject: the translation function `t`, the `api` client, `navigate`, `useAdminLocale`
— anything the hook currently reaches for instead of receiving.

## Why it was deferred

Both hook files most in need of conversion were in flight:

- `apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts` — `PagesTemplates` is adding a
  template picker to `PageEditor.tsx` and will likely need `templateChoice` state here.
- `apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts` — created by `ExploreUI2`,
  captured mid-write in snapshot commit `223612e`, still being worked.

Converting a file another agent is rewriting produces a merge mess and, worse, a refactor whose
"behavior preserved" claim can't be trusted because the baseline moved underneath it.

## Shape of the work when re-dispatched

**Persona:** `AI-Dev-Shop/agents/refactor/skills.md`, model Sonnet. Note that role defaults to
propose-only — **authorize execution explicitly** in the brief, since the owner wants the conversion,
not a proposal.

**Phase 1 — Audit, delivered before any conversion.** Enumerate every hook under `apps/admin/src`,
classify conforming / non-conforming / not-applicable, and for each non-conforming one list exactly
which dependencies are reached-for. The map is the deliverable even if conversion stalls; a partial
conversion with no map is worse than a map with no conversion.

Also determine whether the drift is **recent** (a convention set and then forgotten) or **scattered
across history**. That answers whether this needs a lint rule or just a cleanup — and a lint rule is
the only thing that stops it recurring.

**Phase 2 — Convert, one hook or small group per commit.**
- Preserve behavior exactly. If a bug surfaces during conversion, report it; do not fix it in the
  same commit. A behavior change riding inside a refactor commit is invisible in review.
- **Every conversion needs a test that mocks an injected dependency.** Testability is the entire
  justification; a conversion without one has not delivered the benefit. Negatively verify at least
  one.
- **If you find yourself editing an existing assertion, stop.** Either the refactor changed behavior
  or the test was asserting an implementation detail. Say which.

**Interaction to check:** `npm run check:admin-complexity-drift` exits 1 today
(`ThemeExplore.tsx`, `Themes.tsx`). The owner's tool aggregates closures into the enclosing hook
while ESLint does not, so **only top-level extraction lowers both metrics** — and dependency
injection tends to move code toward module scope. Run the check before and after; report both.

**Blocking gate:** the `programmer` persona's step-187 function-quality self-check applies to
refactored units. `@complexity` in docs, never a complexity NUMBER in a source comment.

## Standing constraints

- `:3000` and `:5173` are the owner's servers — never kill or restart.
- Never write `src/themes/static/basic/`.
- Explicit-path `git add` only; inspect diffs before staging. The tree carries untracked work from
  unrelated workstreams (commerce, auth, plugins).
- Commits `f95232e` and `223612e` are unreviewed Coordinator snapshots of agents' mid-write state.
- Scoped test runs only; never run `src/features/theme/__tests__/static-render.test.ts`.
