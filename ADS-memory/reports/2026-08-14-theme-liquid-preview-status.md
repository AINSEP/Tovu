# `.liquid` template preview status — is the failing test wrong, or the code?

**Date:** 2026-08-14. **Method:** read-only — no source edited, no `vitest`/`tsc` run (owner has
capped test execution to one consolidated agent for the rest of the sweep). Evidence below is
`git log`/`git show`/`git diff` output and direct file reads only.

## Verdict, up front

**The test is wrong. The code is right, and it is real.** `ThemeExplore.unit.test.tsx`'s "shows a
specific 'no rendered preview yet' message for a .liquid template" test asserts behavior that was
superseded the same day it was written, by a commit ~70 minutes later that gave Explore a genuine,
committed, working templated-tier `.liquid` render pipeline (client route selection in
`ThemeExplore.tsx`, real Liquid-sandbox rendering in `theme-page-preview.ts`/`render.ts` server-side).
Nobody regressed the preview; the test just never got updated when the pipeline landed.

**Corollary: the standing project note ("templated themes have no rendered preview; `bd5b477`
delivered source text only") is stale and needs correcting.** It was accurate for exactly the ~70
minutes between `bd5b477` and the pipeline commits below — not today.

---

## 1. What the failing test asserts, and what it actually gets

`apps/admin/src/features/themes/__tests__/ThemeExplore.unit.test.tsx`, `describe("preview notice —
no rendered preview available")`:

```ts
it("shows a specific 'no rendered preview yet' message for a .liquid template, not the generic placeholder", () => {
  renderExplore({ view: "preview", selected: "templates/home.liquid" });
  expect(screen.getByText(/templated themes don't have a rendered preview yet/i)).toBeInTheDocument();
  expect(screen.getByText(/use the html tab/i)).toBeInTheDocument();
  expect(screen.queryByText(/^select a file to preview\.?$/i)).not.toBeInTheDocument();
});
```

The test's own preceding comment (verbatim, still in the file): *"This does not add rendering —
Explore still has no templated-tier preview pipeline — it only makes the honest reason visible
instead of the generic placeholder."*

What the code actually does today for a selected `.liquid` file, traced in `ThemeExplore.tsx`:

```ts
// previewSrcFor(), line 156-159
if (isLiquidTemplateFile(file)) {
  const templateId = file.label.replace(/\.liquid$/i, "");
  return siteUrl(`/theme-explore/${theme}/template/${encodeURIComponent(templateId)}?v=${previewNonce}`);
}
```

`previewSrc` is therefore **never `null`** for a `.liquid` file anymore, so the branch that renders
`themeExplorePreviewNotice(t)` (the "no rendered preview yet" text the test looks for) is never
reached — the component instead renders `<ThemeExplorePreview src={previewSrc} title="Theme
preview" />`, a real `<iframe>`. The function's own doc comment says this explicitly (verbatim):

> "Explore now HAS a templated-tier render pipeline (...), so `previewSrcFor` builds a real preview
> URL for every `.liquid` file and this function is never reached for one."

So under jsdom, the test's `getByText(/templated themes don't have a rendered preview yet/i)` finds
nothing and the test fails with a `TestingLibraryElementError` (an "unable to find an element with
the text" failure — same failure shape team-lead described; not independently re-run here per the
no-test-execution constraint, but this is what the traced code path produces, and it matches the
described symptom exactly).

## 2. Does a real `.liquid` preview pipeline exist? Traced end to end.

**Client** (`apps/admin/src/features/themes/ThemeExplore.tsx`):
- `previewSrcFor` (above) builds `/theme-explore/{theme}/template/{templateId}` for any `.liquid`
  file — one of four preview URL shapes (page / partial / `.liquid` template / raw asset), not a
  placeholder branch.
- `themeExplorePreviewNotice`'s doc comment (lines 178-192) states in its own words that the
  "not built yet" special-case was removed once the pipeline landed.

**Server** (`src/server/middleware/theme-page-preview.ts`, `registerThemePagePreview`):
- `GET /theme-explore/:themeId/template/:templateId` (added by `2a7cb56`, below) is a full route, not
  a placeholder: `requireAdminSession` + `authorizeThemeSetPermission` gate, 404/422 handling for
  unknown theme/wrong tier/unknown template id, then:
  ```ts
  const html = await renderSite({
    theme, route, siteTitle: SITE_TITLE, posts, post, products, product,
    widgets, mediaTransformVersions, mediaAssetMetadata, pageHtmlEmbeds,
    liquidTemplateIdOverride: templateId,
  });
  res.set("Cache-Control", "no-store").type("html").send(html);
  ```
- `renderSite` (`src/server/http/site/render.ts:1884`) is **the same function the live public site
  renders through** — not a preview-only shim. It calls `renderLiquidInSandbox`
  (`./liquid-sandbox.ts`, imported at `render.ts:15`, invoked at `render.ts:2020`) to actually execute
  the Liquid template in a sandboxed process against real content: `listPublishedPosts` for real
  published post data, real resolved widgets/media/embeds. Products are deliberately hard-coded empty
  (a disclosed containment for a known `{{ product.description | raw }}` sink in one theme's
  `product.liquid` — documented in the route's own file header, not a rendering limitation).
- The route's own file header states the reasoning for why it's gated (unlike its two `static`-tier
  sibling routes, which stay ungated) — further evidence this was a deliberate, reviewed addition,
  not a stray or unfinished commit.

**E2E** (`development/e2e/theme-liquid-preview.spec.ts`, targets
`.theme-explore-main .page-preview-iframe` as team-lead flagged): the file's **committed** version
(`6b6666b`) still tests the OLD "honest message, no iframe" behavior. But the file has an
**uncommitted working-tree change** (present before this investigation started — visible in this
session's very first `git status`, not made by any agent in this sweep) that rewrites the second test
to assert the real pipeline instead: iframe count 1, `sandbox="allow-scripts"`, a real nav link
("Journal") visible inside the rendered frame, computed `font-family` matching the theme's real
CSS (`/inter/i`, not the browser default serif), and an explicit assertion that the old notice text
is now `not.toBeVisible()`. This uncommitted diff is independent corroboration — someone else looking
at the same code already reached the same "the pipeline is real, the old test is what's wrong"
conclusion, for the E2E suite. It just never propagated to the unit test. **Not run** (per the
no-test-execution constraint) — cited as corroborating evidence only, not verified green.

## 3. When did the divergence happen — git log, in order

| Time (2026-08-12) | Commit | What it did |
|---|---|---|
| 15:16 | `bd5b477` | Client-only: `.liquid` treated as `readable` so the HTML tab shows source instead of triggering a browser download. **This is the commit the standing project note cites — accurate for its own scope, source-only, no render.** |
| 15:21 | `b33bbe8` | E2E test added for the `bd5b477` source-readability fix. |
| 16:28 | `89b450f` | Adds the "honest" `themeExplorePreviewNotice` message AND **the now-failing unit test** asserting it, for `.liquid` files. Correct when written — Explore genuinely had no render pipeline yet at this point. |
| 16:28 (same) | `6b6666b` | E2E test pinning that same honest-message gap. |
| 17:39 | `2a7cb56` | **Server**: `theme-page-preview.ts` gains the real `/theme-explore/:themeId/template/:templateId` route — `renderSite`/`renderLiquidInSandbox`, real content, real CSS. |
| 17:40 | `89fabb9` | **Client**: `ThemeExplore.tsx`'s `previewSrcFor` wired to the new route; sandboxes both preview iframes. This is the commit that made the 16:28 unit test stale — `previewSrc` stops returning `null` for `.liquid` files from this point on. |

The unit test (`ThemeExplore.unit.test.tsx`) has not been touched since `89b450f` (16:28) — i.e., it
predates the pipeline by about 70 minutes and was never revisited afterward. `ThemeExplore.tsx`,
`use-theme-explore.hooks.ts`, and `theme-page-preview.ts` are all clean (fully committed, no pending
working-tree changes) at the current HEAD — this is settled, not another agent's mid-flight work.

## 4. Verdict, restated with the fix implied (not applied)

The correct fix is to **update the unit test's expectation**, not the code: replace the "shows a
specific 'no rendered preview yet' message" assertion with one that expects the real preview iframe
(`screen.getByTitle("Theme preview")`, `src` containing `/theme-explore/{theme}/template/{templateId}`)
for a `.liquid` file — mirroring how the sibling tests in the same `describe("preview src — pages vs.
partials")` block already assert page/partial/asset URLs. The doc comment above the test
("Explore still has no templated-tier preview pipeline") should be corrected or removed along with
it, and the standing project note claiming the same should be corrected to reflect that a real,
gated, sandboxed Liquid render pipeline has existed and been committed since 2026-08-12 17:39–17:40.

Not ambiguous: client code, server code, and (uncommitted) e2e test all agree with each other and
disagree with only the one stale unit test and the stale project note derived from an earlier commit
in the same day's sequence.

**No files were changed to produce this report.**
