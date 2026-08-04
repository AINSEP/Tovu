# Site-assistant QA verification — the three unproven claims

Dispatched 2026-08-04 by the Coordinator to a QA/E2E subagent (Sonnet 5) to verify three claims the
prior agent left unproven. Persisted on arrival, mid-run — task 3 was still in progress at the time
of writing.

Source: `2026-08-04-site-assistant-agent-notes.md` ("WHAT THE NEXT SESSION MUST CHECK").

## Task 1 — New-thread confirm against a non-empty transcript

**Verdict: FALSE as shipped. TRUE after a fix. Commit `eefb34e`.**

The headline claim looked true and wasn't. The confirm step *did* appear on a non-empty transcript —
but **Cancel was broken**, so "Cancel preserves the transcript" was not merely unverified, it was
unverifiable.

**Root cause — a CSS class-name collision across a package boundary.**
`SiteAssistantHeader.tsx` gave Cancel the class `jini-chat-pane__cancel`. That name is **not free
real estate**: `@jini-ai/chat`'s `ChatPane` injects its own default stylesheet which already defines

```css
.jini-chat-pane__cancel { position: absolute; right: 48px; bottom: 22px }
```

for an unrelated pre-existing control — the in-flight run's "Stop run" button. Cancel was therefore
torn out of the header's flex row and absolutely positioned near the composer footer.

**Measured, not eyeballed:**
- `getBoundingClientRect()`: container top **67.6px**, Cancel button top **572px** — ~505px adrift.
- Screenshot showed only "Discard chat?" in the header; Cancel was effectively invisible.
- With a run in flight, Cancel and "Stop run" occupied the **identical** screen position. Playwright's
  click-interception check caught it outright: *"`<button>Stop run</button>` intercepts pointer
  events"*. Cancel was literally unclickable in that state.

**Fix (Tovu-only, Jini untouched):** Cancel got its own class `tovu-site-assistant__reset-cancel`,
styled identically in `widget.css`, so it can never inherit the package rule again.

**Re-verified after the fix:** confirm appears; deltaY between Cancel and its container now **0px**;
Cancel visible and clickable; Cancel preserves the transcript; confirming clears it; no
`window.confirm` call occurs (it is the intended inline two-step). `tsc --noEmit` clean, `vite build`
clean, bundle-mount guard passes, bundle **552.87 KB — unchanged**.

## Task 2 — Escape dismissal from anywhere in the pane

**Verdict: TRUE.**

Focus was clicked explicitly into the composer, and `document.activeElement` was confirmed to be
`TEXTAREA.jini-composer-input` — *not* the Cancel button — before pressing Escape. The confirm UI
disappeared and the transcript was preserved: Escape closes the confirm without triggering the reset,
which is the correct semantic. The `window.addEventListener('keydown', ...)` approach in
`SiteAssistantHeader.tsx` works as documented.

## Task 3 — the 992 → 553 KB bundle drop

**Verdict: mechanism CONFIRMED, attribution FALSE.** The drop is real and benign, but it did **not**
happen at `82fee9a` as its commit message claims — it happened one commit earlier, at `42f5170`.

Established by rebuilding at each historical point (no `node_modules` reinstall needed — zero prod
dependency changes across the range):

| commit | state | bundle |
|---|---|---|
| `082da83` | pre-`42f5170`, no alias / no `define` | **992.38 KB** (matches the cited baseline exactly) |
| `a5dcd29` | parent of `82fee9a`, but *after* `42f5170`'s alias+define fix | **551.70 KB** — already dropped |
| `eefb34e` | current | **552.87 KB** (+1.16 KB, one small component) |

`git show --stat 82fee9a` confirms it touched only `SiteAssistantHeader.tsx`,
`SiteAssistantWidget.tsx`, and `widget.css` — never `vite.config.ts` or any dependency file. Its
message quoted the **cumulative session figure** as if it were that commit's own effect. A defect in
the historical record, not in the build. `42f5170`'s own message documents the real cause correctly.

**Nothing was silently dropped or externalised:** zero occurrences of `19.2.7` (the Jini-nested
duplicate React — still on disk, simply no longer bundled), two of `19.2.8` (the app's own copy);
`Symbol.for("react.element")` appears exactly once, i.e. one React runtime rather than two; zero
`require(` calls and zero bare top-level imports (a proper self-executing IIFE); no
external/unresolved-module warnings from `vite build`; zero `process.env.NODE_ENV` (dead-code
eliminated as intended); mount guard passes.

## Follow-up — collision blast radius

Commissioned after task 1, to decide whether the real fix belonged in Tovu or in the package.

**Blast radius is exactly one class — the one already fixed.**

`SiteAssistantHeader.tsx` is the *only* file in `apps/site-chat` that authors DOM elements with
`jini-*` class names (`SiteAssistantWidget.tsx` authors none; it stays in its own
`tovu-site-assistant*` namespace). Post-fix it authors five: `__header`, `__heading`, `__eyebrow`,
`__title`, `__new-thread`. All five were read in the package's `styles.ts` and are ordinary in-flow
styling — `display: flex`, padding, border, color, font, `min-width`, overflow. **None carries
`position`, `transform`, `top/left/right/bottom`, or `z-index`**, so none can tear an element out of
flow the way `.jini-chat-pane__cancel` did.

Two distinctions worth keeping straight, since a naive grep conflates them:
- A wider sweep shows `apps/site-chat` *styles* **39** classes the package also defines. That is
  overwhelmingly legitimate **theming**, and is the intended pattern. It is not the hazard.
- The hazard is narrower: **the app putting a package class name on a new element it created.**
  Cancel was the only instance.

Also established: `packages/chat/src/react/styles/reference.css` defines these same class names but
is **never imported or injected** anywhere in runtime code (zero hits outside itself). It is dead
weight, not a second live ruleset — worth knowing before someone reads it as authoritative.

**Ownership call (agent's, and the Coordinator concurs):** the fix belongs in Tovu, where it landed.
This was one component author not knowing that one specific class carried a positioning side-effect,
not a structural failure of the package's naming convention.

## The transferable lesson

**A class name that belongs to another package's injected stylesheet is a shared namespace, not a
label.** The prior agent's component typechecked, built, rendered, and passed its own review — the
defect lived entirely in the cascade, across a package boundary, and only in states nobody had
exercised. Note the compounding factor: the collision was *worst* in the in-flight-run state, which
is exactly the state a quick manual check is least likely to be in.

This is the third instance in this workstream of the pattern already recorded in the handoff — the
mechanism is correct and the surrounding context makes it wrong. jsdom has no layout engine, so no
number of unit tests at any count could have caught it.

## Handoff Contract

- **Inputs used:** real Chromium (private, not the Playwright MCP) against the dev server on port
  3000; `getBoundingClientRect()` / `document.activeElement` readbacks; Playwright click-interception
  diagnostics; `tsc --noEmit`; `vite build` + the `check-bundle-mounts.mjs` postbuild guard.
- **Output summary:** two of three claims resolved; one shipped bug found and fixed.
- **Risks:** commit `eefb34e` has a shell-mangled commit *message* (diff is correct and complete);
  left unamended deliberately since it is already pushed. Task 3 outstanding.
- **Suggested next assignee:** QA/E2E (continuing), then Coordinator.
