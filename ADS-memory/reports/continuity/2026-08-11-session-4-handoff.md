# Handoff — session 4, 2026-08-11 (Tiptap editor expansion + useWiredX/i18n sweep)

Generated: 2026-08-11, end of session
Source: Claude Code, Opus 5 (1M context), Coordinator + 9 Sonnet 5 subagents
Target: Claude Code (Opus for routing, Sonnet subagents for implementation)

**Status: all agents STOPPED for token cost. 76 commits on `general-work`. 72 UNPUSHED.**

---

## ⚠️ THE OWNER'S NEW STANDING DIRECTIVE — read before dispatching anything

> *"They are wasting time on tests. Have it so next session, they just do a sweep first and then
> test afterwards, because these tests are just eating up credits."*

**Change the cadence: sweep first, test after.** This session every agent was required to write a
test, negatively verify it, and re-run per file. That produced high quality and burned three agents
to ~500k tokens each.

For the next session:

- **Do the mechanical change across the whole slice first**, committing as it goes. No per-file test
  authoring, no per-file negative verification.
- **Then one test pass at the end**, covering the slice as a whole.
- Keep `tsc --noEmit` + existing scoped suites green throughout — that is cheap. It is *authoring new
  tests and mutation-verifying each one* that is expensive.
- Negative verification is now a **spot check on a sample**, not a per-file obligation.

This is a deliberate quality/cost trade the owner has chosen. Do not silently reinstate the old
cadence "to be safe."

---

## ⚠️ 72 commits are UNPUSHED

```
git push origin general-work
```

Everything from this session exists only on this machine. Both `origin/general-work` and
`origin/main` were at `8a40f62` when the session began.

---

## Uncommitted work IN THE TREE — finish it, do not redo it

Four agents were stopped mid-task. **Their work survived on disk.** Read it before touching anything
in these areas; re-implementing it is pure waste.

| area | agent | state |
|---|---|---|
| `features/posts/**` + `styles.css` | ToolbarPolish | Mention capability + toolbar polish, partly done |
| `features/widgets/**` (4 components + 4 hooks) | I18nSweepA | i18n move in progress |
| `features/workspace/**` | I18nSweepB | i18n move in progress |
| `development/playwright.post-editor.config.ts` | FormatRegression | e2e config tweak |

## Uncommitted and NOT ours — never `git checkout` these

`AssistantDock.tsx` + test, `AgentPlugins.tsx`, `panels.tsx`, `src/server/app.ts`,
`development/todos.md`, `development/docs/themes/theme-authoring-guide.md`, the untracked
`commerce/`/`authentication/`/`plugins/` trees, and **`src/themes/static/basic/pages/index.html` +
`pricing.html`, which carry the owner's own hand-edits to his live site** ("Leon" in the title/h1, a
`headcountss` typo he knows about).

⚠️ **Those theme edits were DESTROYED once this session and recovered from a stash.** See hazards.

---

## What shipped

### Tiptap editor — 15+ capabilities, all reaching the public site

`hardBreak` fix · align icons · highlight · subscript · superscript · text colour · background colour
· font family · font size · line height · typography (smart quotes) · placeholder · character count ·
**tables** · **task lists** · bubble menu · drag handle · code-block `language` attribute · YouTube
embeds · the post title as a real Tiptap node.

**Skipped, disclosed:** find-and-replace — no official free Tiptap package exists (npm 404; only
unmaintained third-party 0.1.x forks). A docs sidebar said otherwise; the registry is authoritative.

**Security work worth preserving:** `safeCssColor` / `safeCssFontFamily` / `safeCssLength` allowlists
in `render.ts`, each independent so one bad value cannot invalidate a valid sibling; bounds-checked
`colspan`/`rowspan` (1-1000); task-list checkboxes rendered `disabled` publicly since there is no
click handler there. All verified against real injection strings.

### `useWiredX` DI sweep — ~37 hooks converted

Plus **the spec that did not exist**: `development/docs/architecture/wired-hooks-convention.md`,
including the "when this does NOT apply" section, which is the half that stops future sweeps
converting things for symmetry.

### i18n sweep — components stop reaching for `useAdminLocale`

~20 of ~34 components converted to take a **bound** `t: (key) => string` from their hook.

**Unexpected payoff:** every component examined had a REDUNDANT duplicate `useAdminLocale()` call —
the hook already resolved locale for its own error strings while the component resolved it again.
`loadLanguage()` is unmemoized, so each call is a real concurrent settings fetch. This sweep is
removing per-screen duplicate network requests, not just relocating imports.

### Regression net

- `src/server/http/site/__tests__/tiptap-render-contract.test.ts` — table-driven, JSON in / public
  HTML out, one row per node & mark type.
- `development/e2e/post-editor-toolbar.spec.ts` + `development/playwright.post-editor.config.ts`.
- Proven by reverting each of the four historical bugs and observing the actual failure.
- **Closed a real coverage hole:** bulletList, orderedList, listItem, blockquote, codeBlock,
  horizontalRule had ZERO coverage anywhere despite being handled correctly.

### Four silent-drop bugs found and fixed

`textAlign`, `underline`, `strike`, `hardBreak` — all rendered correctly in the editor and were
**silently discarded** on the public site. Root cause is structural and permanent:

> **The admin editor and the public site use DIFFERENT renderers.** Tiptap in the browser;
> hand-written `renderDocNode`/`renderMarks` (`src/server/http/site/render.ts`) for the public site.
> The latter only knows types someone explicitly taught it. Anything else vanishes with no error.

**Every new capability must land in three places** — editor, `renderDocNode`, `.post-detail-body`
CSS — and be verified with `curl http://localhost:3000/<slug>`. Unit tests passing is not evidence;
that is exactly how all four survived.

---

# TABLED FOR NEXT SESSION — prioritized

## 1. Finish the in-flight work on disk (above). Cheapest win available.

## 2. ⚠️ 5 NEW complexity violations — a tracked quality gate regressed

```
features/pages/PageEditor.tsx
features/pages/lib/prettify-html.ts
features/posts/hooks/use-post-editor.hooks.ts
features/seo/hooks/seo-dependencies.hooks.ts
features/themes/Themes.tsx
```

`npm run check:admin-complexity-drift`, ceiling 9/9. Introduced by the sweep; nobody owns them now.

**The non-obvious rule: extract at TOP LEVEL, never as closures nested inside the hook.** This
project's metric folds nested closures into the enclosing function's score; ESLint's does not. Only
top-level extraction satisfies both. `PageEditor.tsx` should resolve as a side effect of item 3.

## 3. `PageEditor.tsx` UI-state extraction (owner-specified shape)

Move `draftHtml` + `prevViewRef` + reformat effect (`:178-180`), `paneWidth` + measuring effect
(`:465-466`), and `frameRef` (`:453`) into **the EXISTING `usePageEditor` hook**.

⚠️ **The owner explicitly rejected a separate `*-ui.hooks.ts`**: *"creating a bunch of hook files is
not what I want. Just add it to what's already there."*

⚠️ Preserve the `prevViewRef` guard exactly — it reformats only on the *transition into* the HTML
tab, so the formatter never rewrites text under the operator's cursor.
⚠️ `draftHtml` must remain incapable of affecting `dirty`. Add a test that switching tabs alone does
not mark the page unsaved.
Also delete the dead `navigate` import at `PageEditor.tsx:7`.

## 4. Finish the i18n sweep — ~14 components left

`Workspace` (in flight), `AiAssistant` (45KB, scope carefully), `ChatFab`, `Placeholder`, the four
`widgets` components (in flight). **`App.tsx` is deliberately excluded** — its `useAdminLocale` call
has a dedicated e2e regression test and a subtle login-race history.

Two rulings to carry forward:
- **Components rendered in a loop** (per row/item) must NOT each call `useAdminLocale()` — resolve
  once at the nearest single-render ancestor and thread `t` down as a prop. The dependency is still
  injected, just from the parent.
- **A subcomponent defined in the same file** as a converted screen, with no hook of its own, keeps
  its direct `t` import.

## 5. Editor: remaining queue

File handler (drag/paste images) — ⚠️ **must NOT base64-inline**; route through the existing media
upload path and insert the same node shape the Media picker produces (`assetId`/`transformName`).
Then the low-priority free extras: table of contents, focus, invisible characters, unique ID. All
confirmed MIT on npm.

## 6. Backfill the contract table — it was outgrown within hours

`tiptap-render-contract.test.ts` covers types as of its own commit. **Missing:** subscript,
superscript, the `textStyle` mark and its attributes, taskList/taskItem, table/tableRow/tableCell/
tableHeader, youtube, codeBlock `language`. Also add rows asserting the security guards hold.

**Process fix worth adopting:** each new mark/node lands its own table row as part of its own change,
rather than a QA pass chasing a fast-moving file afterwards.

## 7. QA gaps never covered

- **The owner's actual preview bug.** `PostEditor.tsx:653` — any content edit sets `contentDirty` and
  drops the preview out of both themed branches into a bare `SrcDocSandbox` with no theme CSS. Also
  verify whether the fallback's *explanatory notice* renders at all; the owner never saw one.
- ⚠️ **The naive fix is wrong**: pointing the dirty case at `/template-preview` renders the LAST
  SAVED body. The right shape is letting that route accept a pending body the way it already accepts
  a pending `templateChoice` (`template-preview.ts:90`) — but the `{"type":"content"}` marker
  re-fetches by id via `resolveContentTypeEmbeds` → `findPublishedPostById`
  (`resolver-service.ts:554`), so an in-memory override will not reach it. Threading an override
  through that resolver is the real work, and would likely also fix draft previews.
- **There are THREE renderers**, not two: Tiptap, `editor.getHTML()` (the preview fallback), and
  `renderDocNode`. Nothing tests the middle one.
- **Bubble menu and drag handle** are untested and structurally cannot be unit-tested.

## 8. Still open from session 3

Template applicability (owner said leave it); the generic `post` embed type is superseded but not
retired; `theme-authoring-guide.md` documents retired `postTemplate`/`pageTemplate` vocabulary.

---

## ⚠️ HAZARDS PROVEN REPEATEDLY TODAY

**1. `git stash` / `git reset --hard` / `git checkout <dir>` are REPO-WIDE in this shared tree.**
Two agents ran a bare `git stash` while checking a typecheck baseline. It reverted every agent's
uncommitted work at once. The second incident **destroyed the owner's uncommitted live-site edits and
broke the admin app for an hour** (`panels.tsx` lost the uncommitted fix for an old
`appearance → themes` rename, leaving a broken import that 500'd all of `:5173`).
**Ban these in every brief.** Use `git diff` / `git show <ref>:<path>`.

**Recovery pattern that worked:** never `git stash pop`. Restore file-by-file with
`git checkout stash@{0} -- <path>` + `git reset <path>`, and **enumerate everything the stash
contained** (`git stash show --name-only`) before deciding what to restore — the files most likely
forgotten are the ones no agent owns.

**Three stash entries remain as backups. Do not drop them until the tree is verified.**

**2. The shared git index — and the fix that actually works.**
Three commits landed with correct contents under the wrong message. Verifying `--cached` before
committing cannot close the window. **The fix: `git commit -F <msgfile> -- <explicit paths>`** — the
pathspec form commits only those paths regardless of what anyone else has staged.

**3. Mid-flight `SendMessage` does not arrive.** 0-for-5 with one agent. **The spawn prompt is the
only reliable channel.** Send only when an agent surfaces. Change scope by stop-and-respawn **at a
commit boundary** — and `git status` the agent's slice first.
⚠️ A stopped agent's queued message can arrive *after* its death and read exactly like a live agent
announcing work. Verify against `TaskStop`'s running list, never a message.
⚠️ Uncommitted work surviving `TaskStop` is **non-deterministic** — it survived every time today, but
assume loss when deciding, then check the tree before redoing anything.

**4. A diff-stat measures size, not meaning.** The Coordinator saw `+56/-8` vs `+40/-8` and reported
lost work; the "missing" lines were negative-verification sabotage the agent had already restored.
**Read the content before any recovery decision.**

**5. `:3000` caches theme HTML at boot.** `discoverThemes` uses `readFileSync` once. A theme edit does
nothing until a server restart or POST `/api/admin/v1/workspaces/workspace-local/themes/rescan`.
**The owner's restored homepage edits are on disk but `:3000` has not picked them up — it needs a
restart.**

**6. TipTap e2e selection:** only a triple-click is stable. `dblclick`+click silently drops marks;
`window.getSelection()` never reflects a dblclick in this contenteditable; keyboard selection looks
right but compounds marks across paragraphs. Recorded in memory.

**7. A `useWiredX` wrapper calling `useAdminLocale()` fires an extra mount fetch** that consumes a
queued `fetchMock`. The test then fails asserting on an *unrelated* message. The tempting fix —
loosening the assertion — silently destroys coverage. Use `mockImplementation(() => jsonResponse())`
for a fresh `Response` per call, or spy the settings endpoint directly.

---

## Handoff Contract

- **Inputs used:** live `curl` against `:3000` and `:5173`, `git log`/`status`/`show --stat`/`stash
  show`, `npm run check:admin-complexity-drift`, scoped `vitest` and `node:test` runs, npm registry
  license checks, context7 for Tiptap v3 docs, and nine Sonnet subagent reports each independently
  spot-verified rather than taken at face value — which caught a false "forms has no i18n" claim, a
  false "work was lost" alarm, and a stale complexity attribution.
- **Output summary:** the post editor went from 14 controls to a full rich-text surface with tables,
  task lists, colour, typography and media embeds, all rendering on the public site; ~37 hooks and
  ~20 components moved onto dependency injection; the `useWiredX` spec was written; and a regression
  net now covers the editor→public-site seam that produced four silent bugs.
- **Risks:** **72 commits unpushed**; 5 complexity violations above the ceiling; ~14 components and
  the editor's file-handler still unconverted; the contract table lags the renderer; the owner's
  preview bug is diagnosed but unfixed; three stash entries still hold recovery state.
- **Suggested next assignee:** Claude Code (Opus) as Coordinator; Sonnet 5 subagents for all
  implementation — **with the sweep-first/test-after cadence at the top of every brief.**
