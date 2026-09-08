# `content_duplicate` — finished, run live, and verified in the production DB (2026-09-08)

Programmer. Bootstrap confirmed: `AI-Dev-Shop/agents/programmer/skills.md` (v1.7.1) loaded before any
work. Continues `ADS-memory/reports/2026-09-07-page-duplicate-tool.md`'s HANDOFF section.

**Status: done, including the owner's scope expansion to all four resources** (post, page, form,
media). The tool works from a sentence typed into the admin chat, and all three copies it made are
confirmed present in the live `sites/tovu-com/content.db`.

## The literal phrasings that work (step 5 — the owner's actual ask)

Typed into the admin assistant dock at `https://localhost:5173/admin/`, unedited:

> **`Make a copy of my Contact Us form and call it Support Requests`**

> **`copy Landing sample — xai and name it 'Landing Page'`**

> **`duplicate my red-triangle image and call the copy Red Triangle — dark background`**

The second one is the ORIGINAL failing production request from
`2026-09-07-page-tool-gap.md`, verbatim, em-dash and quotes included. It now works.

What the assistant did with each, unprompted: found `content_duplicate` via `search_tools`,
described it, resolved the source id (`forms_list_definitions` for the form, `content_post_list` for
the page), then called `content_duplicate` with the right `resource`. It replied:

```
Created Support Requests (slug: support-requests, ID: 7a522df8-d5d2-4b7d-90d6-df1308129268)
as an active copy of the Contact Us form.

Created Landing Page (slug: landing-page-2, ID: 45e153d1-58ce-474f-b25c-b23335bc64e3,
status: draft) as a copy of Landing sample — xai.

Duplicated red-triangle to a new media asset:
ID: c7611604-810c-4fc1-b39c-e9cb0a3ef1bc
Title: Red Triangle — dark background
Slug: copy-of-red-triangle
Status: active
```

### Verified against the live DB, not just the chat's own claim

Read-only (`file:…?mode=ro`, so no migration auto-applied):

| | source | copy |
|---|---|---|
| form | `Contact Us` / `contact-us` / active | `Support Requests` / `support-requests` / active |
| | 3 field descriptors, notify `ops@tovu-official.test` | **all 3 fields + notify copied identically** |
| page | `Landing sample — xai` / `/` / **published** / html | `Landing Page` / `landing-page-2` / **draft** / html |
| | `body_html` 41 954 bytes | `body_html` 41 954 bytes, **byte-identical** |

Two things worth calling out because they are the rules holding in production rather than only in a
test: the page copy came back **draft from a published source** (a copy never silently goes live),
and the page was `bodyFormat: "html"`, so the live run exercised the `pagesHtmlStore` path, not just
the TipTap one.

### The media run, measured before and after — the bytes decision holding in production

| | before | after |
|---|---|---|
| `media` rows | 16 | **17** — one new library entry |
| `asset_blobs` rows | 22 | **22** — no new blob row |
| blob files on disk | 31 | **31** — no second copy of the bytes |

Same `sha256` on both rows, `alt` carried over, the copy with its own slug, its own title, and its
own rendition row. This is the whole design decision, measured rather than asserted.

**Three real rows now exist in the live DB from this run** — the `Support Requests` form, the
`Landing Page` page (`landing-page-2`, draft), and the `Red Triangle — dark background` media asset
(`copy-of-red-triangle`). I left them rather than deleting live content; delete them from Forms /
Pages / Media whenever you like.

## What I actually found on disk (the handoff's open questions, answered)

`31f83205` compiled but had never been executed. Executing it surfaced two concrete defects:

1. **`check:boundaries` was at 20 errors against the 19 baseline.** The 20th was exactly the
   violation the dispatch warned about:
   `domain-no-direct-assistant-tool-registration: features/content-duplication/tool-registrations.ts
   → assistant/index.ts`. That file called `listDuplicateResourceHandlers()` — a VALUE import from
   `assistant/`. The rule bans any non-type-only `features/** -> assistant/**` edge, not just
   `register*` calls.
2. **All 11 post/page duplicate tests were RED.** They still drove the retired
   `content_post_duplicate` tool id: `expected 'content_post_duplicate' to be wired`, on every one.

Answering the handoff's three explicit unknowns: the post/page handlers WERE migrated onto the
registry (`duplicatePostOrPage` + `contributePostDuplicateHandlers`), permission-per-resource WAS
written but had zero tests, and the enumerating error existed but was thin and untested. No third
resource had been attempted.

## Milestone (a) — posts/pages folded onto the registry · `91047a77`

- Boundary fixed by INJECTION, not by an exemption. `buildContentDuplicationRegistrations(routeDeps,
  resources)` now takes a `ContentDuplicationResourceSource`, and the composition root
  (`tool-catalog-manifest.ts`, already allowed to import assistant values) passes
  `{ listResourceHandlers: listDuplicateResourceHandlers }`. Everything the feature still needs from
  `assistant/` is a TYPE.
  It is passed as the reader FUNCTION rather than a pre-read array on purpose: the manifest
  registers this `ToolContributor` BEFORE it registers the per-resource handlers, so an array
  snapshotted at contribute-time is always empty. I note this because `external-mcp/
  tool-registrations.ts` took the other route — it is in the rule's `pathNot` exemption list. I did
  not add a second exemption.
  **Re-verified: 19 errors, back at baseline.**
- Tests MOVED, not re-authored: `git mv tool-registrations.duplicate.test.ts
  content-duplicate.post-page.test.ts`, `{ id, kind }` → `{ resource, id }`, title/slug/status under
  `overrides`. No assertion weakened. 11/11 green.
- Two stale references to the retired tool id, each a silent failure: the `TOOL_SEARCH_KEYWORDS`
  entry was still keyed `content_post_duplicate` (a keyword entry for a nonexistent tool leaves the
  REAL tool with no search vocabulary while the file looks fully populated — and search vocabulary
  is what the live run above depended on), and `rewrap-page-navigate-error.ts` steered callers to
  the dead id. Both re-pointed; a test now pins that the old key is gone.

## Milestones (b) + (c) — per-resource permission, enumerating error · `da586cc2`

Both were implemented and had **zero** tests. There is no precedent for per-resource permission —
all ~182 other tools use one static permission per tool id — so this is the pattern being
established, and it is now documented in the file's own header and tested.

The tests use two fake resources with deliberately different permissions and an `authorize` granting
exactly one, then assert BOTH that the refused resource rejects AND that its `duplicate()` was never
entered. That second half is the one that matters: a test asserting only the rejection would still
pass if the gate ran AFTER the copy.

The unsupported-resource rejection was tightened and extracted into `unsupportedResourceError`:

```
content_duplicate: cannot duplicate resource 'widget'. Supported resources: form, page, post.
No other resource can be duplicated by this tool — retrying with a different spelling will not help.
```

Asserted verbatim, plus sorted-order, the `(none registered)` case, and that it is thrown before any
`authorize()` call. The closing sentence is deliberate: without it a model reads "not supported" as
"try a synonym" and burns turns on `pages`/`Post`/`blog_post`.

**Mutation-verified rather than assumed.** Each assertion was proven to catch its break:

| mutation | result |
|---|---|
| `permission: handler.permission` → `"content.write"` | 2 failures — both per-resource tests |
| drop `.sort()` from the enumeration | 2 failures — both enumeration tests |

Both reverted; 12/12 green after.

## Milestone (d) — `form`, the second resource · `480f89f1`

Forms, not media, and specifically because it gates on **`admin.forms.manage`** — not
`content.write`. That is what makes the per-resource machinery load-bearing instead of decorative:
the assertion "a caller who can copy a page cannot thereby copy a form" could not pass vacuously the
way two `content.write` resources would let it.

Three genuine differences from post/page, handled rather than papered over:

- **Slug.** `createFormDefinition` REQUIRES an explicit slug and validates
  `^[a-z0-9][a-z0-9-]{0,63}$` plus the reserved `new`; `createPost` derives one itself. New pure
  module `features/forms/duplicate-slug.ts` (mirroring `duplicate-embeds.ts`'s placement) derives and
  disambiguates: truncation without a trailing hyphen, a fallback for names with nothing sluggable,
  suffixes that shorten the BASE rather than overflow the ceiling, `new` treated as taken, and a
  bounded search that throws rather than spinning against a live DB. Its tests assert against
  `write-service.ts`'s own exported `SLUG_PATTERN`, so a change to that pattern breaks them rather
  than silently outdating them. RED captured first (`ERR_MODULE_NOT_FOUND`).
- **Status.** A form has no draft/published. The `status` override is REJECTED with a message naming
  what IS honored, never silently dropped. And since `createFormDefinition` always creates `active`,
  a copy of a DISABLED form is flipped back to disabled — the same "a copy is never more exposed
  than its source" rule that makes a duplicated published page default to draft. The persisted row is
  asserted, not just the returned view.
- **Deep copy.** `fields` and `notify.recipients` are deep-copied; a shallow copy would let an edit
  to the copy mutate the source row — the forms-side version of the shared-state corruption
  `duplicate-embeds.ts` prevents on the post side. Asserted by mutating the copy and re-reading the
  source.

Widgets deliberately untouched, per the dispatch and now recorded in the catalog header: a widget
instance is meant to be SHARED across documents, so "copy a widget" is an open product question, not
a wiring gap.

## Milestone (e) — `media`, the third resource, and the bytes decision · `3bcbbbf2`

Media is the one resource whose rows are not the whole story, so the dispatch asked for a deliberate
decision on blob-vs-reference. Here it is, with the reasoning, and it is also stated in the tool's own
description so the model tells the operator the same thing.

**A media copy REFERENCES the source's bytes. It never duplicates them.** That is forced by the
storage model rather than chosen between two workable options: `AssetBlobRecord`'s identity is
`(workspaceId, sha256)` and `BlobStorePort` is content-addressed (the storage key is derived from the
hash), so *"write a second copy of these bytes"* is not representable — identical bytes always resolve
to the same blob row and the same stored object. A "physical duplicate" could only mean a second ROW
pointing at the same object, which is strictly worse than sharing one.

So the handler routes the copy through `uploadMedia` with the source's own bytes and inherits the
semantics that package already documents and tests: two `MediaRecord`s, blob bytes written once. Two
properties come along with that, and both are reasons not to hand-write the rows:

1. The dedup check-then-act runs inside `withSha256Lock`, and a `tombstoned` blob (a pending GC
   candidate) is **resurrected** to `active` in that same locked section. A hand-rolled copy would
   happily point a brand-new row at a blob a GC pass was about to delete.
2. `AssetRenditionRecord` is keyed by `assetId`, not by hash, so the copy needs its own rendition
   rows to be addressable at its own `/m/<id>/…` URL. `uploadMedia` writes them.

**What the operator gets, said plainly in the tool description:** a new library entry with its own
id, slug, title, alt text, caption, credit, width/height, CSS class and HTML attributes — all seeded
from the source and independently editable — pointing at the same image or video. Editing the copy's
alt text does not touch the original's; deleting one does not break the other. It is **not** a
separate file to alter independently, and the description says so rather than letting an operator
discover it.

Third distinct permission: **`media.upload`**, alongside post/page's `content.write` and forms'
`admin.forms.manage`. Creating a copy IS creating a library entry, so it gates as an upload.

Handled rather than defaulted:

- A **trashed** source is refused — `uploadMedia` always creates `active`, so copying one would be a
  live entry for content already deleted (the same rule as draft-from-published and
  disabled-stays-disabled).
- A **missing blob row** fails before anything is written — no half-formed library entry.
- **Content type prefers the recorded value over a fresh sniff**, and that ordering is load-bearing,
  not an optimization: `sniffContentType` falls back to `application/octet-stream` outside its
  magic-byte table, so sniff-first would make some already-accepted assets un-copyable. It is then
  re-recorded against the hash — which also *fixes* an older asset that predates the content-type
  store, rather than letting the copy inherit that gap and drop out of the admin's Images/Videos
  filter and the `/m/…` video URL branch.
- The `status` override is rejected, naming what IS honored.
- A **slug works in place of an id**, since that is media's own established identity model.

The load-bearing test asserts the blob table still holds ONE row and the store ONE object after the
copy — not merely that the copy looks right, which would pass just as happily against an
implementation that duplicated every image. **Mutation-verified:** making the upload use altered
bytes fails exactly that test. No Jini package was edited; this is built entirely on ports
`MediaToolDeps` already exposes.

## What is left, ranked — the deliverable the lead asked for instead of a rushed handler

Effort is judged against the registry as it now stands: a new resource is a
`contribute<X>DuplicateHandlers()` returning plain data (`{ resource, build }`), one line in
`tool-catalog-manifest.ts`, and a test file. The wiring is no longer the work — the **semantics** are.
What follows is ranked by value to an operator, with the real decision each one hides.

### Worth doing, in this order

1. **Newsletter campaigns** — *high value, medium effort.* "Send the same thing again next month" is
   one of the most common real CMS copy actions, and there is no other way to do it today.
   `admin.newsletter.campaign.compose` is the natural gate. The decision: the copy must **never**
   inherit sent/sending state, a schedule, or a recipient-list send record — same "never more exposed
   than its source" rule, and here getting it wrong means actually mailing people.

2. **Collection entries** — *high value, medium-high effort.* This is the generic content row the
   whole content model is meant to converge on, so a duplicate here eventually subsumes post/page.
   The decision: entries carry revisions, taxonomy links and `entry_refs`, so "copy an entry" has to
   answer the same question `duplicate-embeds.ts` answered for widget placements — which references
   are re-minted and which are shared. Do this one *after* looking at how `entry_refs` is keyed;
   guessing would reproduce the exact placement-id bug this tool was built to avoid.

3. **Menus** — *good value, medium effort.* "Duplicate the main menu and tweak it for the footer" is
   a real workflow. The decision, and it is a hard requirement rather than a preference: the copy must
   **not** inherit the location binding. A location is singular (there is a `MenuLocationBoundError`
   for exactly this), so a naive copy either fails or silently steals the original's placement.

4. **Content types** — *good value for authors, medium effort.* "Make a new content type like this
   one" is genuinely useful. The decision is a real one, of the same shape as media's bytes: does the
   copy mint **fresh field ids** or reuse the source's? Fresh is almost certainly right (field ids are
   per-type identity), but it should be decided explicitly, and the deprecation/tombstone lifecycle
   means a copy of a deprecated type should probably not come back active.

5. **Taxonomy terms** — *low-moderate value, low effort.* Mechanically the easiest left: name + slug,
   `admin.taxonomy.manage`, slug derivation already solved by `duplicate-slug.ts`'s pattern. The
   decision is only "deep or shallow" for a term with children. Low value because creating a term
   from scratch is nearly as fast as copying one — worth adding for completeness, not for the
   workflow.

6. **Redirects** — *low value, low effort.* `createRedirect` exists and gates on
   `admin.redirects.manage`. But a redirect's identity IS its `from` path, so a copy has no sensible
   default: the caller MUST supply a new `from`, which makes `content_duplicate`'s "just copy it"
   shape a poor fit. If added, the missing-override error has to be excellent.

### I recommend these NOT be `content_duplicate` resources

- **Webhook subscriptions** — a subscription carries a signing **secret**. A copy must mint a fresh
  one, never carry the original's, and a tool whose whole promise is "same thing, new row" is the
  wrong place for a "…except this field, silently" exception. Low value, real security footgun.
- **Theme files** — already achievable with `theme_read_file` + `theme_write_file`, and the
  2026-09-07 coverage audit says so explicitly (no placement id can be orphaned, unlike the page
  case). They are also addressed by *path*, not by an id, so they would strain the `id` parameter's
  meaning for no gain.
- **Widgets** — unchanged from the dispatch: a widget instance is meant to be SHARED across
  documents, so "copy a widget" is an open product question, not a wiring gap. Needs the owner's
  decision before anyone writes a handler.
- **Users, members, roles, access tokens** — identity and credentials. Never copyable.

## Architecture metrics — where they stand, and attribution

`check:architecture` FAILS, as this repo's known-RED baseline. On the two cycles the dispatch asked
about:

- **`assistant <-> server` is NOT this task's.** Its SCC is
  `[assistant, features/comments, features/external-mcp, features/newsletter, features/plugins,
  server]` — `features/content-duplication` is not a member. Removing my boundary violation shrank
  the largest SCC from **7 to 6**, which is the measurement that attributes it: content-duplication
  was contributing one member, and that member is now gone. What remains includes
  `features/external-mcp`, whose `tool-registrations.ts` holds the `pathNot` exemption for the very
  same VALUE edge I removed from mine. That is another agent's in-flight work, not mine to change.
- **`features/post <-> platform` is NOT this task's either.** `features/post`'s platform edges
  (`repo.sqlite.ts`, `search-index.*.ts`, `tool-registrations.ts`'s `entryPublicPath`) all predate
  `31f83205`; `git show 31f83205 -- features/post/tool-registrations.ts` adds no platform import.

Neither cycle is intended, and I am not accepting them silently — but neither is caused by the
duplication wiring, and the one member that WAS is removed. The remaining ratchet regressions
(propagation cost, module API surface, bidirectional hub count) are shared-tree measurements over
several agents' concurrent work; per `feedback_repo_wide_check_measures_the_tree`, they are not
attributable to a single task from this run.

## Evidence

- Root `npx tsc -p tsconfig.json --noEmit` — **exit 0** (read directly, not through a pipe). Note it
  EXCLUDES test files, so it says nothing about the tests above.
- `npm run check:boundaries` — **19 errors**, 191 warnings. Baseline, not 20.
- Per-file test runs, one `node --test` invocation each, from repo root with
  `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json`:
  `content-duplication/tool-registrations` 12/12 · `post/content-duplicate.post-page` 11/11 ·
  `media/content-duplicate.media` 13/13 · `forms/content-duplicate.form` 10/10 ·
  `forms/duplicate-slug` 9/9 ·
  `post/tool-registrations.admin-url` 7/7 · `assistant/tool-search-keywords.content-post-copy` 4/4 ·
  `assistant/rewrap-page-navigate-error` 8/8 · plus a regression sweep across every
  `features/{forms,post,pages,content-duplication}/__tests__` and the touched `assistant/__tests__`
  files.
- **No `serve-command*.integration.test.ts` was run** (hard constraint). No unscoped test run.
- Live DB inspected read-only only; no script wrote to it. The two rows above were written by the
  assistant itself, through the tool, which is the point.

## Commits

| sha | milestone |
|---|---|
| `91047a77` | boundary fix + post/page tests re-pointed at the generic tool |
| `da586cc2` | per-resource permission and the enumerating error, mutation-verified |
| `480f89f1` | `form` as the second resource |
| `3bcbbbf2` | `media` as the third resource, with the bytes decision |
| this report | the live runs, and the ranked list of what remains |

One housekeeping note for the record: the `git mv` renaming `tool-registrations.duplicate.test.ts`
to `content-duplicate.post-page.test.ts` was swept into another agent's commit `964bd4cc` (a bare
`git commit` on this shared index picked up whatever was staged). Content intact, history not
rewritten, nothing to redo. Every commit above passes explicit pathspecs to `git commit` itself, not
only to `git add`.

## One environment change I made and reverted — stated because it was not silent

The admin chat's default runtime (Local CLI · Claude Code) answered
`Not logged in · Please run /login`, so the first attempt failed before reaching any tool. I switched
the dock to **API · BYOK (Google Gemini · gemini-3.8-flash)**, which was already configured, ran both
sentences, and **switched it back to Local CLI · Claude Code afterwards** (re-verified as `active`).
The Local CLI still needs a `claude /login` you would have to run yourself — the harness blocks me
from doing it.

## Open, and deliberately not done

- `features/external-mcp/tool-registrations.ts`'s `pathNot` exemption for the same boundary rule I
  fixed properly. Another agent's in-flight work. It is one of the 6 members of the remaining
  `assistant <-> server` SCC, so removing it the same way would shrink that cycle further.
- The remaining resources are ranked above, with the real decision each one hides. They are
  explicitly NOT mine — a second agent picks them up. The seam is proven by three resources resolving
  to three genuinely different permissions (`content.write` / `admin.forms.manage` / `media.upload`),
  which is what it needed to prove.
- `content_duplicate` returns each resource's own view shape (`{ post: … }` vs `{ definition: … }`)
  rather than a normalized envelope. Correct for now — each resource's view is what its own
  follow-up tools take — but worth a decision before the resource count grows much further.

## Follow-up (2026-09-08, new session) — default copy name: numeric suffix, never `Copy of`

Programmer. Bootstrap confirmed: `AI-Dev-Shop/agents/programmer/skills.md` (v1.7.1) loaded before any
work. Different task from the section above (which built the tool itself) — this changes its DEFAULT
name from `Copy of X` to a numeric suffix, per the owner's follow-up ruling: `Copy of Copy of X` on a
second copy, and untranslatable. Verified each of the 4 claimed edit sites before touching it, per the
dispatch's own "trust but verify" framing — all 4 were exactly as described.

### The shared collision-search module

New: `apps/website/src/features/content-duplication/derive-available-name.ts`. Two exports:

- `deriveAvailableName({ base }, { isTaken, withSuffix?, onExhausted? })` — the bounded suffix-search
  LOOP, generalized from `features/forms/duplicate-slug.ts`'s `deriveAvailableFormSlug`
  (try `base`, then `withSuffix(base, 2)`, `withSuffix(base, 3)`, … until free). `duplicate-slug.ts`
  now DELEGATES to this for its own hyphenated, length-capped slug search — folding
  `RESERVED_SLUGS`/`SLUG_PATTERN` into the injected `isTaken` (both mean "skip, try the next suffix",
  which is exactly what returning `true` from `isTaken` already does) and its own message into
  `onExhausted`. One collision loop in the codebase, not two — the dispatch's explicit instruction.
  `duplicate-slug.test.ts` (9 cases, including the exact exhaustion-message regex) was NOT in the
  dispatch's list of tests to update, and needed no changes: same behavior, same error text, verified
  by running it unchanged. 9/9 green.
- `deriveDuplicateName({ sourceName }, { isTaken })` — layers the trailing-number rule on top: a
  trailing integer is read as an existing copy counter (and stripped before searching) ONLY when the
  stripped base itself already exists as a title in the resource. `Landing 2` -> `Landing 3` only if
  `Landing` exists; `Blog 2024` with no `Blog` row -> `Blog 2024 2`. Direct unit tests added
  (`content-duplication/__tests__/derive-available-name.test.ts`, 10/10) cover both branches plus the
  loop's own default/custom-suffix/exhaustion/onExhausted behavior — not just indirect coverage
  through the three resource tests.

### Applied to all three resources

- **post/page** (`tool-registrations.ts`'s new `deriveDefaultDuplicateTitle`): one `postRepo.list()`
  scan, titles compared WITHIN the same `kind` (a post and a page may legitimately share a title).
  Slug is untouched — `createPost` still derives it from the (now numbered) title itself, so
  `"Landing sample — xai 2"` yields `landing-sample-xai-2` with no second derivation, exactly as the
  dispatch specified.
- **form** (`deriveDefaultDuplicateFormName`): one `formDefinitionRepo.list()` scan. The slug line
  itself is UNCHANGED — it already took `name` and derived a slug from it; feeding it the new numbered
  name (`"Contact Us 2"`) instead of `"Copy of Contact Us"` was the whole fix, so `contact-us-2` falls
  out with zero new slug logic.
- **media** (`resolveDuplicateTitle` in `duplicate-asset.ts`): one `mediaRepo.list()` scan, skipped
  entirely when an explicit title override is given. The trickier edit: the old `filename:
  \`copy-of-${source.slug}\`` seed (used only to bootstrap `uploadMedia`'s OWN internal slug
  derivation, immediately overwritten by `applyCopiedMetadata`'s real title write) could NOT simply
  become the resolved title — `uploadMedia`'s `deriveTitleFromFilename` strips anything matching
  `\.[^./\\]+$` (a period anywhere near the end, not just a real extension: e.g. `"Report v1.2 2"` would
  lose `".2 2"`), and a numbered duplicate title CAN legitimately contain a period (a source titled
  `"Logo v1.2"`). `applyCopiedMetadata`'s own pre-existing doc comment already named this exact hazard
  for why `title` bypasses `filename` — I kept that discipline and extended it to the seed too: the
  seed stays `${source.slug}-copy` (slug-derived, guaranteed dot-free per `MEDIA_SLUG_FORMAT_PATTERN`),
  never the resolved title. Media's slug is therefore reworded away from `copy-of-` but NOT mirrored to
  the numbered title the way forms' is — `MediaRecord`'s own doc states title/slug are independent
  fields by design, and nothing in the dispatch named media's slug specifically. Stated here as the
  recorded judgment call it is, not slipped in.

### Scale-bounded O(n) `list()` scan — row counts, read live 2026-09-08

No `findByTitle` on `PostRepoPort`, `FormDefinitionRepoPort`, or `MediaRepoPort` (confirmed by reading
all three port interfaces directly, including the one in the separate `Jini` repo for media) — only
`findById`/`findBySlug`/`list`. Adding a port method to three domains was out of scope. Current live
scale (`sites/tovu-com/content.db`, queried read-only): **78 pages, 64 posts, 3 forms, 17 media rows**
— the dispatch's own cited counts (17/3/43) were already stale by the time this task started, from the
first agent's own live runs adding rows; the numbers above are what this task's code comments cite.
Revisit if any of these grows into the thousands — each duplicate call does exactly ONE `list()` scan
(not one per suffix candidate), held as a `Set` in memory for the search loop.

### Tests updated (the 3 named in the dispatch, each verified RED against the old assertion first by reading the pre-edit code, not by re-running an already-passing test)

- `post/__tests__/content-duplicate.post-page.test.ts` — the `'Copy of <title>'` assertion now expects
  `"Landing sample — xai 2"` / `landing-sample-xai-2`; added a same-source-twice test proving `... 3`.
- `forms/__tests__/content-duplicate.form.test.ts` — same shape; the existing "disambiguates the second
  slug" test now asserts BOTH name and slug increment (`Contact Us 2`/`contact-us-2`, then
  `Contact Us 3`/`contact-us-3`) instead of only the old slug-only suffix behavior.
- `media/__tests__/content-duplicate.media.test.ts` — `` `Copy of ${source.title}` `` ->
  `` `${source.title} 2` ``; added a same-asset-twice test proving `... 3`.

### Live verification — through the assistant, read back from the DB, not the chat's claim

Local CLI still reports `Not logged in · Please run /login` (same as the prior session) — switched the
dock to **API · BYOK (Google Gemini · gemini-3.8-flash)**, ran two duplicate requests, then **switched
back to Local CLI afterwards** (re-verified `active` before finishing).

> **`Duplicate the Landing sample — xai page. Don't give it a name.`**

The assistant found `content_duplicate` via `search_tools`, described it, and called it. Reply:

```
Duplicated Landing sample — xai as a draft:
Title: Landing sample — xai 2
Slug: landing-sample-xai-2
ID: 386d060b-47d0-4d7f-8919-056283fa002f
Status: Draft
```

Read back read-only (`file:…?mode=ro`):

```
386d060b-…|Landing sample — xai 2|landing-sample-xai-2|draft|page|html
```

Sent again — **same source, no name** — a second time:

> **`Duplicate the Landing sample — xai page again. Still don't give it a name.`**

```
Title: Landing sample — xai 3
Slug: landing-sample-xai-3
ID: 7b42dba9-b192-4b48-bf05-822648146dcf
```

Read back read-only, matching exactly, alongside the source and the unrelated `Landing sample — gold`
page (proves the collision scan is per-title, not fooled by a shared prefix):

```
98cd394b-…|Landing sample — gold|sample-gold|published
4f220108-…|Landing sample — xai|/|published
386d060b-…|Landing sample — xai 2|landing-sample-xai-2|draft
7b42dba9-…|Landing sample — xai 3|landing-sample-xai-3|draft
```

Two more real draft rows now exist in the live DB from this run (`... 2` and `... 3`, both pages) —
left in place rather than deleted, same as the prior session's live-run rows; delete from Pages
whenever convenient.

### Evidence

- Root `npx tsc -p tsconfig.json --noEmit` — **exit 0**, checked directly (not through a pipe), both
  before and after the live run (no code changed in between).
- `npm run check:boundaries` — **19 errors** (unchanged baseline). Total warning count moved 191 -> 193
  in this same run, but neither `derive-available-name.ts` nor any of the 4 edited files appears in ANY
  reported line (grepped the full output for each touched path) — the two extra warnings are shared-tree
  noise from concurrent agents' work, per `feedback_repo_wide_check_measures_the_tree`, not this task's.
- Per-file test runs, `node --test` from repo root with `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json`:
  `content-duplication/derive-available-name` 10/10 (new) · `forms/duplicate-slug` 9/9 (unchanged,
  confirming no behavior drift) · `post/content-duplicate.post-page` 12/12 · `forms/content-duplicate.form`
  10/10 · `media/content-duplicate.media` 14/14 · plus a 25-file, single-invocation regression sweep
  across every `features/{post,forms,media,pages,content-duplication}/__tests__` file that could
  plausibly be touched by the import changes (excluding only the known-hanging
  `serve-command*.integration.test.ts`, none of which live in these directories) — **334/334 green,
  0 failures**.
- No `serve-command*.integration.test.ts` was run. No unscoped test run — every invocation named exact
  file paths.
- Live DB inspected read-only only; the two new rows were written by the assistant itself, through the
  tool, which is the point.

### Commit

`6c13c606` — the shared module, the four edit sites, the three updated tests, and the new direct
unit-test file, all in one commit (this is a single cohesive naming-policy change, not several
independent slices).

### Deviations from the dispatch — both judgment calls, stated plainly

1. **Media's slug is reworded away from `copy-of-` but not mirrored to the numbered title.** See "the
   trickier edit" above for the period/extension-stripping hazard that made mirroring unsafe without a
   Tovu-side slugify duplicate; `MediaRecord`'s own doc backs treating title/slug as independent for
   this resource specifically.
2. **Row counts in the code comments (78/64/3/17) differ from the dispatch's own cited numbers
   (17/3/43)** — the dispatch's counts were already stale (first agent's live runs added rows before
   this task started); comments cite what was actually true when written, per this file's own
   discipline elsewhere.

Nothing else deviates: the trailing-number rule, the reuse-the-loop instruction, the
slug-follows-title-automatically post/page behavior, and the derive-from-the-new-name forms behavior
are all implemented exactly as specified in the dispatch.
