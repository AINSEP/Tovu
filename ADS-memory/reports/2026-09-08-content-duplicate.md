# `content_duplicate` — finished, run live, and verified in the production DB (2026-09-08)

Programmer. Bootstrap confirmed: `AI-Dev-Shop/agents/programmer/skills.md` (v1.7.1) loaded before any
work. Continues `ADS-memory/reports/2026-09-07-page-duplicate-tool.md`'s HANDOFF section.

**Status: all five milestones done.** The tool works from a sentence typed into the admin chat, and
both copies it made are confirmed present in the live `sites/tovu-com/content.db`.

## The literal phrasings that work (step 5 — the owner's actual ask)

Typed into the admin assistant dock at `https://localhost:5173/admin/`, unedited:

> **`Make a copy of my Contact Us form and call it Support Requests`**

> **`copy Landing sample — xai and name it 'Landing Page'`**

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

**Two real rows now exist in the live DB from this run** — the `Support Requests` form and the
`Landing Page` page (`landing-page-2`, draft). I left them rather than deleting live content; delete
them from Forms / Pages whenever you like.

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
  `forms/content-duplicate.form` 10/10 · `forms/duplicate-slug` 9/9 ·
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
| `91047a77` | (a) boundary fix + post/page tests re-pointed at the generic tool |
| `da586cc2` | (b)+(c) per-resource permission and the enumerating error, mutation-verified |
| `480f89f1` | (d) `form` as the second resource |
| this report | (e) the live run |

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
- The next resources the coverage audit named (`collections/entries`, `media`, `redirects`,
  `taxonomy terms`, `menus`) are now a small, mechanical addition each: a
  `contribute<X>DuplicateHandlers()` returning plain data, one line in the manifest. The seam is
  proven by two resources with genuinely different permissions, which is what it needed to prove.
- `content_duplicate` returns each resource's own view shape (`{ post: … }` vs `{ definition: … }`)
  rather than a normalized envelope. Correct for now — each resource's view is what its own
  follow-up tools take — but worth a decision before the resource count grows much further.
