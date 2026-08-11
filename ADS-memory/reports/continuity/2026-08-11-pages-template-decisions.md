# Owner decisions for the Pages template picker

Written by the Coordinator 2026-08-11, after the `PagesTemplates` agent was already dispatched.
**Mid-flight `SendMessage` does not reach a heads-down subagent here**, so this file is the record and
any message is only a nudge. If you are that agent and this is not in your transcript, you never
received it — act on the file.

The dispatch brief listed these as open questions for the agent to decide. **The owner has now
decided them.** Where this file and your own judgment differ, this file wins.

---

## DECIDED — `theme.json` gets a separate `pageTemplate` array

Owner's question, verbatim: *"we have post template, and that's a field under the manifest with the
thing. Should there also be a place called pages_template? And those have to have the
data-embed-config."*

**Answer: yes, a separate array. Do NOT reuse `postTemplate` for Pages.**

Reasoning to preserve in the code:

- The two are different artifacts by content, not just by intent. A **post** template carries
  `{"type":"post","id":"{{post}}"}` — a marker resolved caller-side by substituting a real post id.
  A **page** template carries `{"type":"content"}` — the page's own body, already in hand, needing no
  id resolution.
- Sharing one array means the Pages picker offers templates that render an empty body, and the Posts
  picker offers templates that render nothing. Both failures are silent.
- The existing field name `postTemplate` already commits to kind-specific lists; a second one is
  consistent rather than novel.

**Name it `pageTemplate`** — singular, camelCase, matching the existing `postTemplate`. NOT
`pages_template`; the manifest is camelCase throughout and a snake_case outlier invites a parser bug.

## DECIDED — validate the content marker at theme load, not at render

A declared `pageTemplate` entry that contains no `{"type":"content"}` marker renders a page with no
body: a page that looks fine structurally, with the actual content silently gone. That is the
worst failure class this codebase keeps hitting — wrong output that looks like right output.

**`loadTheme` must reject (or mark the theme `status: "invalid"` with a specific error) any
`pageTemplate` entry lacking a content marker.** Same validation posture `loadTheme` already applies
to a theme missing `pages/index.html`. Catch it when the theme is loaded, where the author can act on
it, not on a visitor's page view.

Consider whether the symmetric check is worth adding for `postTemplate` — an entry with no
`{"type":"post"}` marker has the identical problem, and if that guard doesn't already exist it is the
same one-line-ish shape. If you add it, say so; if you decide it is out of scope, say that instead of
silently skipping it.

## Owner wants to try it on `basic`

Owner: *"I think we also need to edit the basic template and have… do we have the data-embed-config
there? we can try it out."*

They want a working page template in the active theme so this is demonstrable, not theoretical.

**⚠️ But `src/themes/static/basic/` is the LIVE active theme serving the owner's public site on
:3000, and it carries uncommitted owner edits in `pages/index.html` and `pages/pricing.html`.** The
standing rule in every brief this session is: do not write that directory.

Resolve it this way:
- **ADDING a new file** (e.g. `basic/page-shell.html` or similar, plus the `pageTemplate` entry in
  `basic/theme.json`) is additive and does not disturb any existing page. That is acceptable and is
  what the owner is asking for.
- **Do NOT modify or revert any existing file** in `basic/`, above all `pages/index.html` and
  `pages/pricing.html`.
- Note `page-shell.html` may already exist — `our-story` (`page-shell-demo`) references
  `page-shell.html` as its `template_choice` and renders correctly today. **Check before creating;
  reuse the existing one if it is already there** rather than shadowing it with a second file.
- Commit the theme addition separately from code changes so it is easy to revert alone.

---

## Task 2 is DONE — and it exposed the remaining gap

The Coordinator ran `--apply` on 2026-08-11 at the owner's explicit instruction, after the agent was
blocked by the permission classifier and correctly refused to route around it.

- **Restore point:** `infra/restore-point-convert-legacy-doc-pages-to-html-wm2-1786480868809.db`
  (watermark 2).
- **Nine rows converted**, content preserved: `terms-of-service` (4971 chars), `privacy-policy`
  (5675), `faq` (1274), `contact` (639), `team` (528), and `untitled`/`untitled-2`/`untitled-3`/
  `untitled-4` (0 chars — always-empty drafts).
- **Verified live:** all five published pages return HTTP 200 with their own correct `<title>`
  (`Terms of Service`, not `Blog post — Basic`). FAQ carries 2 stylesheets, a `<nav>`, a `<footer>`,
  and **zero unresolved `data-embed-config` markers**.

**The remaining problem, which is what Tasks 3-4 must solve.** The theme SHELL wraps these pages, but
the body is raw semantic HTML with no theme layout classes — FAQ renders `<h1 class="entry-title">`
followed by bare `<h2>`s. The owner's words: *"I went and saw it and it looked bad. There's no
styling associated with it for FAQ and all of that."* The theme's CSS styles wrappers like `.wrap`
that the converted content does not have. A `pageTemplate` containing `{"type":"content"}` inside the
theme's own layout markup is exactly the fix.

### FINAL STEP — assign a template to the five published legacy pages

Once `pageTemplate`, the content marker, and the picker exist, the five published pages
(`terms-of-service`, `privacy-policy`, `contact`, `team`, `faq`) need `template_choice` actually set,
or they stay unstyled and the whole exercise stops one step short of visible.

- Set it **through the picker or through `PagesHtmlDocumentStore`** — not raw SQL. The point of
  building the picker is that hand-editing the DB stops being the mechanism.
- The four `untitled*` drafts are empty and unpublished; leave them alone.
- **Verify by eye and by markup**, not just by a 200: confirm the theme's layout classes are present
  around the body and that FAQ no longer renders as bare headings. `curl` the page and check for the
  theme's wrapper classes.
- Remember Task 1's guard: a Page uses a template ONLY when `template_choice` is explicitly set —
  there is deliberately no first-template fallback for Pages. So these five will stay unstyled until
  something explicitly assigns them. That is correct behavior, not a bug to work around.

---

## Standing constraints (unchanged)

- `:3000` and `:5173` are the owner's servers — never kill or restart.
- `ExploreUI2` owns `apps/admin/src/features/themes/ThemeExplore.tsx`, `Themes.tsx`, and
  `apps/admin/src/styles.css`. Stay out of all three.
- Live-content writes need a restore point first, and go through
  `PagesHtmlDocumentStore.write()` — never ADR-041's `executeMigrateForward`.
- Explicit-path `git add` only; the tree holds unrelated untracked work from other workstreams.
- Make every judgment call yourself and record the reasoning as output. No instruction will reach you
  mid-flight.
