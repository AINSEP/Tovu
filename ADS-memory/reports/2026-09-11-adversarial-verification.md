# Adversarial verification — 2026-09-11 fixes

- Agent: Code Inspection (`AI-Dev-Shop/agents/code-inspection/skills.md`, v1.3.0)
- Repo: `/Users/la/Programming/Tovu`, branch `restructure/apps-website-phased`, HEAD `c85b933c`, tree uncommitted
- Posture: adversarial. Suites were green before each agent declared victory; green was not accepted as evidence for anything.

---

## Bottom line — what I would not ship

1. **`media-rendition.ts`'s asset-access gate never learned the `media` node.** A members-only post
   whose asset is referenced through the generic `media` node — the node the admin composer inserts
   for *every* drop/paste/pick since today — serves that asset **200 to an anonymous caller**, with
   `cache-control: public, max-age=31536000, immutable`. Proven with a real RED (below). This is the
   third collector the dispatch asked me to look for, and it is the security one. Fix 3 is incomplete.
2. **The video-renders-as-`<img>` gap is not preview-only.** It hits live public pages for any post
   that takes the static-tier template branch. `render.ts`'s own `contentType` doc comment says
   otherwise and is false.
3. Everything else holds. The per-node-styling XSS boundary survived a 60-payload probe with no
   breakout.

---

## A. Legacy `image` node — **HOLDS** (one claim in the dispatch is factually wrong)

| Claim | Result |
|---|---|
| `DOC_NODE_HANDLERS.image`/`renderDocImage`/`safeImageSrc` still live | TRUE — `render.ts:1342`, `:1148`, `:379` |
| `image` removed from `TIPTAP_DOC_SCHEMA` | TRUE — only doc-comment mentions remain (`agent-tools.ts:109`, `:307`) |
| `"image"` added to `NAMED_NODE_TYPE_OPT_OUTS` | TRUE — `agent-tools.tiptap-node-vocabulary.test.ts:377` |
| `render.test.ts` zero diff vs HEAD | TRUE |
| `media-site-serving.test.ts` zero diff vs HEAD | TRUE |
| `tiptap-render-contract.test.ts` zero diff vs HEAD | **FALSE — 124 lines added** |

The `tiptap-render-contract.test.ts` diff is entirely *additive* (item C's `media` rows). No
pre-existing `image` row was removed and `REGISTERED_NODE_TYPES` still lists `"image"`, so the
substance is fine — but the file is not at zero diff and should not be reported as reverted.

### The rationale for keeping the renderer — partially verified, materially overstated

- **Undo really can resurrect a soft-deleted post.** `features/post/reverters.ts` registers a
  `post/delete` inverse applier whose inverse payload is `{ deletedAt: null }` (`:117`, `:145`).
  Confirmed by reading the code, not the comment.
- **`sites/tovu-com/content.db`**: 14 posts carry an `image` node. **All 14 are already soft-deleted.**
  Exactly 2 lack `assetId` — the count in the claim is right.
- **But those 2 are `probe-image-post-xyz` and `probe-legacy-image-post-xyz`**, agent-created throwaway
  probes from 2026-08-05. The "2 legacy posts that cannot migrate" is arithmetically accurate and
  rhetorically misleading: no owner content is at stake. The decision to keep the renderer is still
  defensible on plain back-compat grounds; the evidence offered for it is weaker than presented.

### The drift guard is real, not a fake gate

`agent-tools.tiptap-node-vocabulary.test.ts:380` reads `Object.keys(DOC_NODE_HANDLERS)` from
`render.ts` directly. Mutation probe **P5** (added a fake handler key) produced a real RED. This is a
genuine fix for the hand-copied-list class found earlier today.

One residual: the test at `:45` still `deepEqual`s a hand-written 12-entry array of block types.
That *is* a hand-copied list — but it is cross-checked in both directions by the drift guard, so it
is redundancy, not a fake gate.

---

## B. Post Preview — fixes 1 and 2 **HOLD**; fix 3 is **INCOMPLETE**

### B1/B2 — hold

`PostEditor.tsx`'s `canShowPendingContentPreview` and the hook's copy are genuinely equivalent:
the hook's `isDirty` is the same value as the component's `dirty` prop (`use-post-editor.hooks.ts:1042`,
`dirty: isDirty`). The raw `SrcDocSandbox` branch and `degradeUnplayableEmbedsForRawPreview` are gone
with their tests. Mutation probe **P1** (reverting the hook's boolean to the pre-fix `contentDirty`)
produced a real RED in the new hook test.

### B3 — the third collector exists, and it is the authorization gate

**`apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts:98–108`**

```ts
function collectImageAssetIds(node: unknown, out: Set<string>): void {
  ...
  if (node.type === "image" && isPlainObject(node.attrs) && typeof node.attrs.assetId === "string") {
```

Still `"image"`-only. It feeds `scanEntryAssets` (`:178`) → `classifyEntry` (`:228`) →
`resolveMediaAccessDecision` (`:378`), whose empty-gating-set branch **fails open**:

```ts
const gating = referencing.length > 0 ? referencing : opaqueGated;
if (gating.length === 0) {
  return { gated: false, allowed: true };   // media-rendition.ts:391-393
}
```

`bodyFormat: "doc"` *is* in `READABLE_BODY_FORMATS`, so the unreadable-body fallback that this file's
own doc (`:355–364`) installed as the stop-gap never fires. The scan believes it read the body
successfully and simply found no reference.

The admin composer inserts `{ type: "media", ... }` today
(`apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:436`), so this is the live authoring
shape, not a hypothetical.

**RED probe (real, reproduced twice, not fabricated):**

```
✔ PROBE control: members-only post referencing via legacy `image` node is gated (404)
PROBE transform-route status: 200 cache-control: public, max-age=31536000, immutable
✖ PROBE: members-only post referencing via the generic `media` node must be gated too
PROBE original-route status: 200 cache-control: private, no-store
✖ PROBE: /m/{id}/original (the URL renderDocMedia emits for video) with a members-only `media` node
```

Both public routes leak. The transform route hands the bytes to a shared CDN for a year — the exact
failure mode `isLiveReferrerCandidate`'s own doc (`:191–196`) describes as the takedown catastrophe
the 2026-09-05 fix existed to prevent. That file's closing line — *"which is precisely how this defect
arrived, one content type at a time"* — has just repeated itself one **node** type at a time.

**Existing coverage tolerates it completely.** `media-rendition-gating-bypass.test.ts` builds every
`bodyJson` fixture through `imageBody()` (`:95`) and has zero `media`-node cases.

**Live exposure on this install:** latent, not currently firing. `sites/tovu-com/content.db` has 47
live posts, all with `member_access_json` NULL (nothing gated), and 1 already carries a `media` node.
The leak arms the moment gating is used.

**Collector inventory (the answer to "is there a third"):**

| # | Location | Recognizes | Status |
|---|---|---|---|
| 1 | `routes/site/pages.ts:927` `collectMediaRefAssetIds` | `image` + `media` | widened today ✓ |
| 2 | `features/widgets/resolver-service.ts:699` `isRefBasedMediaNode` | `image` + `media` | widened today ✓ |
| 3 | `routes/site/media-rendition.ts:104` `collectImageAssetIds` | `image` only | **MISSED — security gate** |
| 4 | `contracts/core/entry-refs/extractor.ts:77` `collectWidgetEmbedRefs` | `widgetEmbed` only | pre-existing: never saw `image` either, so safe-delete's where-used index is blind to both. Not a regression; worth a separate ticket. |

Mutation probe **P2** (reverting `isRefBasedMediaNode` to image-only) produced 2 real REDs, so
collector 2's fix is genuinely gated.

### B — real-browser proof the dispatch reported as unobtainable

`development/e2e/post-editor-preview-branches.spec.ts` **does run.** See "Known-open item 2" below.
Both tests that prove fix B passed against a real Chromium:

```
✓ FIXED (2026-09-11): a brand-new, UNTOUCHED draft's Preview tab shows the real themed
  template render, not the raw editor-buffer fallback                              (22.6s)
✓ WIDENED (2026-09-09): a DRAFT post's own content edit shows the themed
  pending-content preview, not the raw editor-buffer fallback                      (13.5s)
```

---

## C. Per-instance media styling — **HOLDS**; XSS probe found **no bypass**

Verified present: `MediaAssetRenderMeta.contentType` (`render.ts:190`), `mediaNodeStyleOverride`
(`:1081`), applied in **both** `renderDocMedia` branches (video `:1227–1230`, image via
`tryRenderRefImage`'s `nodeStyleOverride` `:1110–1118`), published on `TIPTAP_DOC_SCHEMA`'s `media`
entry, `Edit | Replace | Remove` action row (`media-embed-extension.tsx:110–117`) opening
`MediaEditDialog` with `{alt, cssClass, htmlAttributes}` (`:120`), validators imported from
`features/media/rules.ts` (`MediaEditDialog.hooks.tsx:3`).

**`/Users/la/Programming/Jini/packages/cms/` is git-clean** — nothing was edited there. Claim confirmed.

Mutation probes **P3** (node override stripped from the video branch only) and **P4** (precedence
swapped so asset wins) both produced real REDs, including a video-branch-specific one. The fix did
not land in one arm only.

### XSS probe — what I tried and what happened

Payload battery driven through the real `renderDocNode` on both dispatch branches:
25 `htmlAttributes` payloads × 2 branches, 5 `cssClass` payloads × 2 branches, plus `alt` in both
attribute and text-node context, and `assetId`/`transformName` injection. Payloads included the
actual 2026-09-07 stored-XSS shape (`data-x><svg/onload=alert(1)`), quote-breakouts
(`data-x=" onerror="alert(1)`), case tricks (`ONERROR=`, `DATA-X>`), whitespace-smuggled handlers
(`data-a="1"\nonerror="alert(1)"`), `javascript:` in `poster` (plain, mixed-case, entity-encoded),
`style=`, `srcset=`, `formaction=`, `xlink:href=`, backtick values, and `autofocus onfocus=`.

**No breakout. Nothing reached the page unescaped, and nothing slipped the allowlist.** Every
rejection failed closed (`parseMediaHtmlAttributes` returns `{attributes: {}}` on the *first*
rejection, so a single bad token discards the whole string). Representative output:

```
<img src="/m/asset-1/public.v1/image.jpg" alt="" class="x&quot; onerror=&quot;alert(1)" loading="lazy">
<video src="/m/asset-1/original" controls class="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">…</video>
poster="javascript:alert(1)"       -> <video src="…" controls>…</video>        (omitted entirely)
poster="&#106;avascript:alert(1)"  -> poster="&amp;#106;avascript:alert(1)"    (double-escaped, inert)
assetId '"><script>alert(1)</script>' -> placeholder (isPlausibleMediaRefId rejects it)
```

Two baseline assertions confirm the probes were not vacuous: an allowed
`data-kui="hero" loading="eager"` *does* reach the `<img>`, and `data-kui="hero" muted` *does* reach
the `<video>`. The allowlist's name pattern `^[a-z][a-z0-9-]*$` (Jini
`html-attributes.ts:67`) is what makes "escape the value" sufficient — no accepted name can carry a
tag terminator. `escapeHtml` (`render.ts:225`) covers `& < > " '`.

### Two findings that are not breakouts but are worth recording

- **Recommended — defense-in-depth reduced to one layer for node-level values.** The asset-level
  field is validated at the write path (`updateMediaMetadata`) *and* at render. The node-level field
  is validated at render *only*: the admin dialog's check is client-side, and `createPost`/`updatePost`
  apply no `bodyJson` schema validation at all (`agent-tools.ts`'s own disclosure). Jini's
  `html-attributes.ts` header states the requirement as *"enforced at the write path AND the render
  path, since a client-only check is not a control."* For the node that is now half-met. The agent
  tool can write arbitrary `attrs.htmlAttributes` straight into the DB.
- **Recommended — `poster` is an unrestricted-URL attribute.** It is allowlisted and accepts any
  non-`javascript:` URL, so a per-post `htmlAttributes` can point a public page at an arbitrary third
  party (tracking pixel / visitor-IP disclosure). Pre-existing at the asset level; per-post styling
  and the agent tool widen who can set it. Not XSS.

---

## D. Desktop — **HOLDS**, verified by content rather than mtime

- **Bundle currency proven by rebuild, not timestamps.** `npx vite build --outDir <scratch>` then
  `diff -rq` against `dist/renderer` → **exit 0**, identical content-hashed filenames
  (`index-BLHdFM1P.js`, `index-D5RoeaDj.css`, `remixicon-D9cWxkfR.css`). The bundle is current.
- **Context worth stating:** `dist/` is gitignored (`.gitignore:2`). The "~20h stale bundle" was a
  local-workstation condition only; it was never in the repo and no other checkout was affected.
- **Auth chain holds by construction, not by coincidence.** `main.cjs:489` and
  `src/project-ipc.cjs:83` both call the *same* pure function
  `sitePartition(siteDir)` = `persist:tovu-site-<sha256(path.resolve(siteDir)).slice(0,32)>`
  (`src/desktop-auth.cjs:112`). `App.tsx:617`'s `partition={project.partition}` therefore cannot
  drift from the partition `ensureSiteSession` seeded — these are not two hand-written literals.
  Residual risk: `path.resolve` normalizes `./` but does **not** canonicalize symlinks, so two
  spellings of the same site directory through a symlink would produce two distinct cookie jars.

---

## Known-open items — how accurate the characterisations were

### 1. `resolvePostContentMediaContext` never resolves `contentType` — **UNDERSTATED**

This is **not** preview-only. `pages.ts`'s two live public post render paths diverge:

- `renderGenericPostPage` (`:1226`) calls `resolveMediaAssetMetadataForRender` → `contentType`
  resolved → video renders correctly.
- `renderViaTemplate` (the **static-tier template branch**, reached from
  `renderTemplateBranchIfEligible`) never calls it. It resolves media solely through
  `resolveHtmlPageEmbeds` (`pages.ts:845`) → `resolvePostContentMediaContext`, which sets no
  `contentType`. A video referenced by a `media` node therefore renders as `<img>` on the **live
  public page** for every post taking that branch.

**False comment:** `render.ts`'s `MediaAssetRenderMeta.contentType` doc calls the gap
*"(`resolvePostTypeEmbeds`/`resolveContentTypeEmbeds`, i.e. a post rendered because a PAGE embeds
it)"*. That parenthetical is wrong — `renderViaTemplate` reaches the same path for a post rendered at
its **own** public URL. The comment in
`resolve-html-page-embeds.integration.test.ts:917` has it right.

Separately, that same integration-test comment block is written in the present tense describing the
*pre-fix* state (*"still check `obj.type === \"image\"` only"*) in a file where the fix has already
landed. Minor doc-accuracy finding.

### 2. E2E "could not be executed, Playwright rejects the self-signed cert" — **WRONG DIAGNOSIS; the suite runs**

Root cause is a **scheme mismatch, not a cert rejection.** Playwright never got as far as TLS.

```
tovu server running on https://localhost:7851 — store: in-memory
curl http://localhost:7851/   -> 000        (nothing; it's a TLS listener)
curl -k https://localhost:7851/ -> 200
```

`development/playwright.post-editor.config.ts:31-32` declares
`BASE_URL`/`API_BASE_URL` as `http://localhost:…`, so `webServer.url` polls plain HTTP against an
HTTPS socket and times out at 45s. The spec file repeats the bug at
`post-editor-preview-branches.spec.ts:77` (`const API_BASE_URL = "http://localhost:7851";`).

With a temporary `https://` + `ignoreHTTPSErrors: true` patch (reverted), the suite ran:
**2 passed, 2 failed, 1 skipped.** Both failures are only the spec's own hardcoded `http://`
constant (`Expected "http://localhost:7851/untitled-4"` / `Received "https://..."`). Both tests
proving fix B passed.

This is a pre-existing config defect unrelated to today's changes, but it is a **one-line-ish fix**,
not an environmental blocker — and the suite is currently un-runnable for everyone, silently.

### 3. admin `voice-to-composer.integration.test.tsx` "~21 failures" — **CANNOT BE THAT FILE**

The file contains **6 tests total**, all passing in isolation (`Tests 6 passed (6)`, exit 0). It is
untouched by today's diff and imports nothing that changed. "~21 failures in that file" is
arithmetically impossible; the count must span other files. The "pre-existing, unrelated" part is
consistent with what I can see, but the attribution is wrong.

---

## Mutation-probe log

Every probe was a single-line source edit, run, then reverted. Diff stats were re-checked against
the pre-probe values (`render.ts` 156, `resolver-service.ts` 47, `use-post-editor.hooks.ts` 73) and
matched exactly afterwards. Two temporary test files were created and deleted.

| # | Target | Mutation | Result | Reverted |
|---|---|---|---|---|
| P0 | `media-rendition.ts` gate | *none* — new temp test `zz-adversarial-probe.test.ts` asserting a `media`-node members-only post is gated | **RED on unmutated code** — 200 + `public, max-age=31536000, immutable`; control (`image` node) 404s. Real defect, not a probe artifact. | file deleted ✓ |
| P1 | `use-post-editor.hooks.ts:824` | `!canShowLiveSite && !canShowTemplatePreview` → `contentDirty && !canShowLiveSite && !canShowTemplatePreview` | **RED** — 1 failure, the new clean-draft debounce test | ✓ |
| P2 | `resolver-service.ts:699` | `isRefBasedMediaNode` → `image`-only | **RED** — 2 failures in `resolve-html-page-embeds.integration.test.ts` | ✓ |
| P3 | `render.ts:1227-1230` | video branch: node override replaced with raw `meta.*` | **RED** — 1 failure, the video-branch precedence contract row | ✓ |
| P4 | `render.ts:1082` | `mediaNodeStyleOverride` precedence swapped (asset wins) | **RED** — 3 failures across both suites | ✓ |
| P5 | `render.ts:1342` | added `zzProbeFakeNode` to `DOC_NODE_HANDLERS` | **RED** — the drift guard | ✓ |
| P6 | XSS battery | new temp test `zz-xss-probe.test.ts`, 60 renders | **NO breakout**; 2 baselines confirm non-vacuity | file deleted ✓ |
| P7 | `playwright.post-editor.config.ts` | `http://` → `https://` + `ignoreHTTPSErrors` | Suite executed: 2 passed / 2 failed / 1 skipped | ✓ (restored from backup, `git status` clean) |

**No RED was fabricated.** Every one above is a pasted run output.

Non-source side effects, all cleaned: `apps/desktop` renderer built to a scratch dir (deleted;
`dist/renderer` untouched), `test-results/` from the Playwright probe removed.

---

## Scoped suite re-runs (my own, not inherited)

| Suite | Result |
|---|---|
| Website: `tiptap-render-contract`, `render`, `agent-tools.tiptap-node-vocabulary`, `resolve-html-page-embeds.integration`, `media-site-serving`, `media-rendition-gating-bypass`, `render-context-resolution-helpers`, `media/repo.contract` | **367 tests, 0 real failures** |
| Admin: `features/posts/__tests__`, `MediaEditDialog.*`, `features/media/__tests__`, `media-embed-extension`, `media-image-extension` | **465 passed / 25 files, exit 0** |
| Admin `tsc --noEmit -p .` | **exit 0** — the dispatch's zero baseline confirmed |
| Admin `voice-to-composer.integration.test.tsx` isolated | **6 passed, exit 0** |

**Environment correction:** `env -u TOVU_ADMIN_PASSWORD` is **not** admin-only. Three tests in
`apps/website/src/server/__tests__/routes/media-site-serving.test.ts` failed 401 at `loginAsOwner`
purely because that variable was set in my shell, and passed with it unset. Any website route test
that logs in needs the same treatment. A reviewer who skipped this would have reported three false
regressions in a file that is at zero diff.

---

## Verdicts

| Item | Verdict |
|---|---|
| A — legacy `image` node | **HOLDS**; one dispatch claim false (`tiptap-render-contract.test.ts` not at zero diff), rationale's "2 unmigratable posts" real but they are throwaway probes |
| B1/B2 — Preview booleans | **HOLDS**, mutation-gated, and now proven in a real browser |
| B3 — asset-ref collectors | **INCOMPLETE — third collector missed, fails open on an authorization gate** |
| C — per-node styling + XSS boundary | **HOLDS**; no bypass found; two Recommended posture findings |
| D — desktop bundle + auth chain | **HOLDS**, verified by content |
| Open item 1 (`contentType`) | **UNDERSTATED** — live public pages affected, and a false comment says otherwise |
| Open item 2 (E2E) | **MISCHARACTERISED** — scheme bug, not a cert; suite runs |
| Open item 3 (voice-input) | **MISATTRIBUTED** — that file has 6 tests |
