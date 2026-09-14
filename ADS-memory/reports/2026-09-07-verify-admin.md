# TestRunner(Execution): re-verification of 6 unattested apps/admin commits — 2026-09-07

Scope: verification only. No source files written or modified. `apps/admin` test runner
invoked per its own `package.json` (`"test": "vitest run"`, working dir `apps/admin`).
All runs used `env -u TOVU_ADMIN_PASSWORD`. One test file per invocation. No
`serve-command*.integration.test.ts` invoked. Dev server left untouched.

## Summary table

| Commit | Test file(s) | Pass/Fail | Actually pins the bug? | Notes |
|---|---|---|---|---|
| e8a81a61 | PageEditor.unit.test.tsx, rules.unit.test.ts, use-page-editor.unit.test.ts | PASS (57, 58, 41) | **Proven by test** | Order assertion via real `fetchMock` call-index (`metaIndex` before `htmlIndex`); concurrent-save test asserts `updatePageHtmlCalls` stays `[]` on conflict — directly catches both behavior changes (reordered writes, refusal instead of silent overwrite). Banner sink covered by real render + click in PageEditor test. |
| e5394b55 | Pages.unit.test.tsx | PASS (73) | **Proven by test** | Regression test renders through real `DataTable` sort, asserts (as a sanity check) that the default sort actually inverted array order, then asserts each row's `data-agent-element` handle is id-derived, not index-derived. Would fail under the reintroduced bug. |
| 48b91af5 | use-standing-draft-autosave.unit.test.ts, api-autosave-keepalive.unit.test.ts | PASS (30, 5) | **Proven by test** | Hook test uses `toEqual([{ keepalive: true }])`/`false` per exit event — exact-value match, so the "listener called with the raw Event" bug (a truthy object, not `{keepalive:true}`) would fail it. API test asserts the real `fetch` init's `keepalive` field end to end, plus the byte-ceiling (`bodyFitsKeepalive`) astral-plane-character edge case. |
| 958fdd65 | CollectionEntries.unit.test.tsx | PASS (3) | **Proven by test** | Both the positive (`getByRole("link", ...)`) and negative (`queryByRole("link", ...)`).not.toBeInTheDocument()) assertions now use the real role. The prior `"button"` negative assertion was flagged in the commit message itself as a green-test-tolerates-the-bug case; that class of defect is what this fix removes. |
| 08884738 | none (i18n data) | PASS — see below | Verified by direct inspection, not a test | See i18n verification section. |
| 807e94e1 | none (doc-only) | N/A | Verified against the actual route/store code | See doc-verification section. |

## e8a81a61 — detail

```
$ cd apps/admin && env -u TOVU_ADMIN_PASSWORD npx vitest run src/features/pages/__tests__/PageEditor.unit.test.tsx
 Test Files  1 passed (1)
      Tests  57 passed (57)

$ ... npx vitest run src/features/pages/__tests__/rules.unit.test.ts
 Test Files  1 passed (1)
      Tests  58 passed (58)

$ ... npx vitest run src/features/pages/__tests__/use-page-editor.unit.test.ts
 Test Files  1 passed (1)
      Tests  41 passed (41)
```

Read `git show e8a81a61` in full. The write-order assertion in `use-page-editor.unit.test.ts`
("calls the metadata writer before the HTML writer") reads real `fetchMock.mock.calls` indices for
`/posts/pg-html` vs `/pages/pg-html/html` and requires `htmlIndex > metaIndex` — this is the exact
inverse of the pre-fix assertion, so it fails hard if the order regresses. The new
`describe("save() guards against a concurrent save")` block drives `usePageEditor` through a real
`simulateConcurrentSave()` on the fake port and asserts `deps.port.updatePageHtmlCalls` is `[]` when
a conflict is detected (the literal "body write landed over the other operator's page" failure mode
the commit's RED reproduction cites) — a reintroduced silent-overwrite bug would populate that array
and fail the test. `PageEditor.unit.test.tsx`'s new `describe("version-conflict banner")` renders
the real component and clicks the real buttons, asserting `saveOverwritingConflict`/
`dismissSaveConflict` are called and `save` is not — this is the sink, not just the hook logic.
Verdict: **proven by test**, not merely code-reading-shaped.

## e5394b55 — detail

```
$ ... npx vitest run src/features/pages/__tests__/Pages.unit.test.tsx
 Test Files  1 passed (1)
      Tests  73 passed (73)
```

The new `describe("per-row agent handles survive the table's own sort")` block is a real regression
test: it renders `<Pages>` with a fixture (`OLDER`/`NEWER`) engineered so the default sort
(Updated, newest-first) inverts array order, includes an explicit sanity assertion that the sort
actually inverted the rendered order (`titles` equals `["Draft Page", "About"]`), and only then
asserts `editHandleForTitle` returns the id-derived handle for each title. This is a real render
through `DataTable`'s actual sort, not a mock of it. Verdict: **proven by test**.

## 48b91af5 — detail

```
$ ... npx vitest run src/hooks/__tests__/use-standing-draft-autosave.unit.test.ts
 Test Files  1 passed (1)
      Tests  30 passed (30)

$ ... npx vitest run src/lib/__tests__/api-autosave-keepalive.unit.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Hook-side tests dispatch real `pagehide`/`visibilitychange`/unmount/debounce-tick events and assert
`optionsSeen` via `toEqual([{ keepalive: true }])` / `toEqual([{ keepalive: false }])` — an exact
object match, not a truthy check, so the "listener passed straight to `addEventListener`, receiving
the raw `Event` as the options arg" bug the commit describes (a truthy object masquerading as
`{keepalive:true}`) would fail this assertion rather than pass it vacuously. The API-side file
(`api-autosave-keepalive.unit.test.ts`) stubs the real global `fetch` and asserts the actual
`RequestInit.keepalive` field end-to-end, plus the byte-ceiling drop case and an astral-plane
(4-byte-per-char) string that a `.length`-based byte check would misjudge. Verdict: **proven by
test**, both halves (hook -> port call, and port call -> fetch init) covered.

## 958fdd65 — detail

```
$ ... npx vitest run src/features/collections/__tests__/CollectionEntries.unit.test.tsx
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Read `git show 958fdd65`. This commit's own message documents the failure mode it fixes: the old
`queryByRole("button", ...)` negative assertion in the unknown-content-type test passed vacuously
once the New-entry control became a real `<a>` link everywhere (no button exists on ANY screen any
more), so it would keep passing even if that branch wrongly started rendering the real link — the
canonical "green test that tolerates the bug" shape. Both the positive and negative assertions now
target `role: "link"`, restoring the negative assertion's power to actually fail if that branch
regresses. Verdict: **proven by test** as it now stands (both assertions are live checks again).

## 08884738 — i18n verification (no test exists; direct inspection)

Diffed the commit (`git show 08884738`) across all 7 touched dictionary files
(`pages-i18n.ts`, `plugins-i18n.ts`, `posts-i18n.ts`, `seo-i18n.ts`, `external-mcp-i18n.ts`,
`themes-i18n.ts`, `page-editor-i18n.ts`) and parsed the added keys mechanically: **27 keys total**,
matching the commit message's count exactly (1 + 2 + 3 + 4 + 11 + 2 + 4 = 27).

Wrote a small Python parser (scratchpad-only, not committed) that reads each dictionary file's
current on-disk content, extracts each of the 21 locale blocks
(`ar, bn, de, es, fa, fr, hi, hu, id, it, ja, ko, pl, pt-BR, ru, th, tr, uk, ur, zh-CN, zh-TW` —
confirmed to be exactly 21 blocks in every one of the 7 files), and checked that every one of the 27
added keys is present as an object key in every one of the 21 blocks in its file.

**Result: 0 of 27 keys missing from any locale.** Also checked for duplicate keys introduced within
any single locale block across the 7 files: **none found**, consistent with the commit's own claim.

Spot-checked that the call sites actually resolve through the dictionaries the commit touched (not
just that the strings exist somewhere):
- `t("My Pages")` — `Pages.tsx:176` — resolves through `PAGES_DICT` (pages-i18n.ts). Confirmed.
- `t("Keep editing")` — `PostEditor.tsx:840` — resolves through `POSTS_DICT` (posts-i18n.ts). Confirmed.
- `t("Explore")` — `Themes.tsx:416,419` — resolves through `THEMES_DICT` (themes-i18n.ts). Confirmed.

Did not attempt to re-verify the commit's separate, explicitly-out-of-scope claim about 9/45
dictionaries having unequal key sets elsewhere in the app (e.g. THEMES_DICT's "Rescan themes" gap) —
that is disclosed as a known, pre-existing, deliberately-unfixed gap in the commit message, not
something this commit claims to have closed.

Verdict: **claim verified true** — all 27 keys exist in all 21 locales, no dictionary gained a
duplicate key.

## 807e94e1 — doc-only verification (no test; read the doc against the actual code)

Read the corrected comment in `apps/admin/src/lib/api.ts` (lines ~2201-2220) in full, then verified
its factual claims directly against the code it describes:

1. **"This route takes no `expectedVersion`"** — confirmed. `apps/website/src/server/inbound/
   admin-http/routes/pages/update-html.ts`'s handler reads only `req.body?.html`; no
   `expectedVersion` is read or used anywhere in the file.
2. **"read() then write() inside ONE request... conditions on a version captured microseconds
   earlier, never the version the CLIENT loaded"** — confirmed against `PagesHtmlDocumentStore`
   (`apps/website/src/features/pages/html-document-store.sqlite.ts`): `read()` captures
   `this.lastReadVersion` from the row at call time; `write()` conditions its `UPDATE ... WHERE
   version = expectedVersion` on that just-captured value, both calls happening inside the same
   route handler invocation (`update-html.ts` lines 162-167: `ensureHtmlFormat` -> `read()` ->
   `write()`). There is no path for a version the client loaded in an earlier request to reach this
   compare-and-set.
3. **"It also BUMPS `version` on every successful write"** — confirmed:
   `html-document-store.sqlite.ts`'s `write()` sets `version: nextVersion` (`expectedVersion + 1`)
   unconditionally on success.
4. **"`updatePost` is the only one of the two that accepts a client-supplied `expectedVersion`"** —
   confirmed: `api.ts:2111-2122`'s `updatePost` signature includes `expectedVersion?: number`;
   `update-html.ts`'s route has no equivalent parameter.
5. **"`usePageEditor.save` writes metadata FIRST and only reaches this route once that guard has
   passed... see `writePage`"** — confirmed: `use-page-editor.hooks.ts:285-293`'s `writePage`
   calls `port.updatePost(...)` first, then `port.updatePageHtml(...)` second — matching e8a81a61's
   fix exactly.

Verdict: **claim verified true against the current code.** The comment accurately describes the
route's actual concurrency behavior; no discrepancy found. Comment-only change, no source behavior
touched, consistent with the commit's own "no behavior change" statement.

## Admin TypeScript baseline

```
$ cd apps/admin && env -u TOVU_ADMIN_PASSWORD npx tsc --noEmit
(exit 0, 0 lines of output, 0 "error TS" matches)
```

**0 errors** — baseline held. No regression.

## Overall

All 6 commits check out. Five have real regression tests that would fail if their bug were
reintroduced ("proven by test"); the two without tests (08884738 i18n, 807e94e1 doc-only) were
verified by direct inspection against the current on-disk code/data and their claims hold.
No defects found. No source files were written or modified during this verification pass.
