# Site-assistant subagent — state at stop

Written by the **Coordinator**, not the agent. The agent (Sonnet 5) stopped receiving messages, so it
was terminated with `TaskStop` and its state was reconstructed by measuring the tree rather than by
asking it. Treat every claim here as measured; where something is unverified it says so explicitly.

Companion to `2026-08-04-handoff-public-visitor-assistant.md`.

## Where it actually got to

It was **further along than its last message implied** — it had finished the light-mode fix and moved
on to the New-thread confirmation without reporting either.

| task | state |
|---|---|
| 1. Force light mode | **DONE**, verified |
| 2. "New thread" confirmation | **DONE**, partially verified |
| 3. Match the FAB icon to admin's | **NOT STARTED** — Jini untouched |

All of its work is committed and pushed as **`82fee9a`** (Tovu). Nothing was lost.

### A Coordinator error worth not repeating

I twice reported the light-mode fix as unfinished because
`grep -c "prefers-color-scheme" widget.css` returned **3**. All three hits are inside a **doc
comment** explaining why there is deliberately no dark block and warning against restoring one. I was
counting prose and calling it code. A bare `grep -c` on a term that legitimately appears in
documentation is not evidence about behaviour — measure the behaviour.

## What was verified, and how

**Light mode — verified.** Drove real Chromium twice, once with `colorScheme: "light"` and once with
`"dark"`. The pane's computed background is `oklch(1 0 0)` in **both**. Zero pageerrors in both. This
is the check that matters: a visual check on a light-defaulting test browser would have passed
silently regardless.

**Build health — verified.** `tsc --noEmit` clean; `npm run build` clean; the `postbuild`
`check-bundle-mounts.mjs` guard passes ("bundle executed cleanly and mounted 1 child element(s)").

**Bundle size dropped 992 KB → 553 KB** (136 KB gzip). Not investigated — plausibly the React
`resolve.alias`/dedupe removing a duplicated copy. Worth confirming rather than assuming.

**New-thread confirmation — only partially verified.** The component exists (86 lines), is wired
through `ChatPane`, typechecks, and builds. On an **empty** transcript the header renders
`× | New thread | <suggested prompts>` with no confirm step, which is the intended
skip-when-nothing-to-lose behaviour.

## WHAT THE NEXT SESSION MUST CHECK

1. **The confirm step against a NON-empty transcript has never been exercised.** Send a message,
   click "New thread", and verify: the confirm appears, Cancel preserves the transcript, confirming
   clears it, and Escape dismisses. This is the whole point of the feature and it is unproven.
2. **Escape-key dismissal is unproven.** The component claims it listens from anywhere in the pane,
   not just while a button holds focus. Verify, do not assume.
3. **Bundle-size drop is unexplained.** 992 → 553 KB is a big change for a CSS + one-component
   commit. Confirm nothing was accidentally externalised or dropped from the build.

## Answer to an open question from the handoff

**`ChatPane` exposes a public `header` prop.** The confirmation is passed through it —
`SiteAssistantWidget.tsx:75`. **No fork of `@jini-ai/chat` was needed.** The prior handoff listed
this as unverified; it is now settled, and it removes a risk from task 2.

## Task 3 — the FAB icon, not started

Fully specified and authorized, just not begun:

- Package `ChatFab` renders a **text emoji** — `{open ? '×' : '💬'}` at
  `packages/chat/src/react/components/ChatFab.tsx:49`.
- Admin renders an SVG sparkle:
  `<path d="M9 1.8 10.6 6 15 7.2 10.6 8.4 9 12.6 7.4 8.4 3 7.2 7.4 6Z" />` plus
  `<circle cx="14" cy="13.5" r="1.7" />`, and an SVG × when open.
- `ChatFabProps` is `{ open, onToggle, label }` — **no icon override**, so this cannot be done from
  `apps/site-chat` alone.
- **Authorized:** add an optional icon prop to `@jini-ai/chat`'s `ChatFab`. Purely additive; the
  emoji must remain the default so other consumers (`examples/reference-web`) are unaffected. Do not
  touch `useChatFabDrag` or the pointer/keyboard handling — the comments there explain why `onClick`
  is deliberately absent.
- ⚠️ Copy the SVG **verbatim at 20×20**. It was previously authored at `width="50"` inside a 56px
  flex button and rendered a squashed 23.6×50 slab (fixed this session, `dd22881`).
  `.chat-fab > svg { flex: none }` exists for that reason — ensure the equivalent is in
  `widget.css`.
- This is a **Jini** change: rebuild `packages/chat` for Tovu to see it, and check `git status` in
  **both** repos — another session is live in Jini.

## Things this agent got right, worth carrying forward

- **Diagnosed before patching** on the bundle crash, and it mattered: the cause was that react-dom
  ships CJS with an unguarded `process.env.NODE_ENV` and Vite's `build.lib` does not auto-inject the
  define the way app builds do. A blind `define` would have hidden that.
- **Found the second crash the first was masking** — two React instances, because `@jini-ai/chat`
  and `@jini-ai/ui` are `file:` links resolving into the sibling Jini checkout's own nested React
  (19.2.7 vs the app's 19.2.8). Only visible once the first throw was gone.
- **Wrote a better regression guard than was asked for.** The brief said "grep the artifact for
  `process.`"; it instead executes the built bundle in jsdom and asserts the mount node gains
  children — which catches the duplicate-React bug, a failure with no greppable string. It validated
  the guard by deliberately reintroducing both crashes.
- **Caught a false positive on itself.** The composer measured a transparent background, which looks
  like a bug; it ran the identical script against the real admin dock and got pixel-identical
  results, so it matched admin's actual rendering rather than "fixing" a documented cascade quirk.

## Process failures on this dispatch

- **`SendMessage` silently stopped delivering.** The agent filed a "Tasks 1–3 complete" report and
  went idle while a browser-breaking bug I had messaged about was unfixed. It later confirmed the
  messages had crossed. **Diff a completion report against every correction sent; a missing item is
  the tell.** Resend with full state inline and require a paraphrase back.
- **Its reports ran ahead of and behind reality in both directions** — once claiming a setting was
  restored when it was not, and here having finished more than it reported. **Measure the tree; do
  not read the report.**
