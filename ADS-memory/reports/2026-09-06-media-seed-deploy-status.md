# Investigation: media-seed fix `814ef465` — deploy status — 2026-09-06

Read-only investigation. Nothing built, deployed, pushed, or modified. The only
write is this file.

**Headline: the premise "the fix has never been deployed" is FALSE.** `814ef465`
reached production on 2026-09-02 and again on 2026-09-03. What is actually true
is narrower and different: a *later* content commit re-opened the same class of
bug on the branch, and 831 commits (including all the tovu-com content work)
have not been deployed since 2026-09-03.

---

## 1. Is the fix complete?

**Verified complete, and since hardened.** The three halves close the loop:

- `Dockerfile:97-99` — `cp -R "sites/$site/uploads" "dist/content/seed-sites/$site/uploads"`,
  inside the same loop that extracts `content.seed.db`, positioned **after**
  `RUN npm run build` (line 69, whose `rm -rf` on `dist/content/*` would
  otherwise wipe it) and **before** `RUN rm -rf sites` (line 108). Order is
  correct.
- `apps/website/src/server/runtime/composition/deps.ts` — `builtInSeedUploadsDir()`
  resolves `process.env.TOVU_STOCK_CONTENT_SEED_DIR ?? join(resolveProductRoot(), "content", "seed-sites")`
  then `join(stockRoot, siteName, "uploads")`. This is the **character-identical**
  stockRoot expression `builtInContentSeedDbPath()` uses, and that one is proven
  to resolve in prod (the media *rows* demonstrably arrive). So the payload is
  findable at runtime — inferred from shared expression, not separately tested in prod.
- `hydrate-blob-store-from-seed.ts` — per-key gate, wired next to
  `hydrateContentDbFromSeed()` in `createSqliteRouteDeps()` (the real prod
  composition root, same function the working seed hydration uses). The
  `blobStore` const is hoisted so the hydration and `RouteDeps.blobStore` share
  one instance.

**Hardened since 814ef465** (current HEAD is stronger than the commit under review):
- The hydrator now uses a single atomic `blobStore.putIfAbsent()` instead of the
  original `exists()`-then-`put()` pair, closing a real TOCTOU window where a
  live uploader's write could be clobbered by stock seed bytes.
- `findMissingSeedBlobs()` now verifies the file is a **regular file with
  correctly-hashed contents**, rejecting directories, symlinks, and wrong-byte
  files — not bare `existsSync` as in 814ef465.

**The one real gap in the fix — the seed guard checks the wrong thing.**
`findMissingSeedBlobs(db, liveDir)` cross-checks `asset_blobs.storage_key`
against the **working-tree filesystem**. CI/Fly builds from a **git clone**,
which contains only *tracked* files. A blob that is on the author's disk but
never `git add`ed passes the guard and is then absent from the build context.
That is not hypothetical — see §4.

---

## 2. Was it deployed? Yes — verified.

Evidence, in order:

- `git remote -v`: `origin` **is** `https://github.com/leonaburime-ucla/Tovu.git`
  — the public deploy mirror named in `fly-deploy.yml`'s banner, not a separate
  private repo. So `origin/main` is the deploy branch.
- `.github/workflows/fly-deploy.yml:75-78` — fires on `push: branches: [main]`
  plus `workflow_dispatch`.
- `git merge-base --is-ancestor 814ef465 origin/main` → **true**; `814ef465` sits
  165 commits back from `origin/main`'s tip `52ffafea` (2026-09-03 12:54 PDT).
- `gh run list --repo leonaburime-ucla/Tovu --workflow fly-deploy.yml` (read-only
  API query) — the deploy workflow has run repeatedly and **succeeded**:
  - **First success carrying the fix: run `33690549197`, `70a8b4e8`,
    2026-09-02T22:28:38Z** (the commit itself landed 2026-09-02T20:38Z; the
    three runs in between failed for unrelated `@jini-ai` dependency reasons).
  - Most recent success: run `33799181924`, `52ffafea`, **2026-09-03T19:54:47Z**.
  - `814ef465` verified an ancestor of all three of `70a8b4e8`, `65260e90`, `52ffafea`.

**What actually shipped at `52ffafea`** (extracted the seed db blob at that
commit, queried read-only, diffed against `git ls-tree` at the same commit):
10 `asset_blobs` rows, 13 tracked upload files, **0 rows without bytes**. The
deployed image was internally consistent. The fix worked.

*Caveat I could not close without touching prod:* whether prod's live
`content.db` — frozen at whatever the volume's **first** boot seeded, since
`hydrate-content-db-from-seed.ts:98` gates on `existsSync(dbPath)` and never
re-copies — holds media rows whose keys are outside the current 13-blob payload.
Blob hydration is per-key and runs every boot, so it can only fill keys the
*image* ships. The decisive check is a `GET` of `/admin/media` or the runtime
manifest on tovu.fly.dev, which I did not run per the no-remote constraint.

---

## 3. What deploying requires

**No missing thing blocks it. It is a decision/action, not an obstacle.** The
pipeline is proven working as of 2026-09-03: `FLY_API_TOKEN` is set, the
`tovu_sites` volume exists, the app boots past the production-readiness gate
(`TOVU_ADMIN_PASSWORD`, `ANALYTICS_ROOT_KEY_SEED` are set, or the successful
deploys would not have stayed up).

The billing block is real but **does not touch this path**: it stops `ci.yml`
(tests/gates) from starting a runner. `fly-deploy.yml` on the mirror runs fine —
the 2026-09-02/03 successes prove it.

Ordered list to get current `HEAD` into production:

1. **Commit the 6 untracked blob files** (§4) — or regenerate the seed with only
   tracked media. Without this the next deploy ships a seed referencing bytes the
   image does not contain.
2. **Re-run `npm run seed:site`** so the published `content.seed.db` and the
   tracked `uploads/` agree *as committed*, not as they sit on disk.
3. **Push the branch to the mirror's `main`** — `restructure/apps-website-phased`
   is 831 commits ahead of `main`, `main` is 0 ahead. Per the workflow banner
   this has previously been done by force-update. **Before any force-push, diff
   MODIFIED files against the mirror, not just added/deleted** — the last force
   update silently reverted the `packages/sdk` build step and `TOVU_BUILD_SHA`,
   and two deploys failed before anyone noticed.
4. The push triggers `fly-deploy.yml` automatically; alternatively use the
   `workflow_dispatch` button to deploy any branch without merging.
5. **Understand that content will not arrive.** The 19 seed-db commits since the
   deploy will NOT reach prod's `content.db` — `hydrateContentDbFromSeed` refuses
   to overwrite an existing live db, by design. Publishing that content to the
   existing volume needs a different mechanism (admin authoring, an import, or a
   deliberate volume reset). This is the most important non-obvious consequence
   in this report.

Blocked-by-a-decision: whether to force-push the branch to `main`, and how to get
content onto an already-initialized volume.
Blocked-by-a-missing-thing: nothing.

---

## 4. What is stacked behind it — and a NEW regression

**831 commits** are committed-but-undeployed (`git rev-list --count 52ffafea..HEAD`,
counting from `52ffafea`, the SHA of the last successful deploy). By conventional-commit
prefix: 214 `fix`, 199 `docs`, 169 `test`, 97 `feat`, 90 `refactor`, 26 `content`,
16 `design`, 10 `chore`, 2 each `style`/`redesign`/`ci`, 1 `wip`. Dated
2026-09-03 (88), 09-04 (93), 09-05 (428), 09-06 (222).

**The same bug class has re-opened on the branch since the deploy.** Verified by
diffing the current seed db's keys against `git ls-files`:

- Current `sites/tovu-com/content.seed.db` has **16** `asset_blobs` rows (was 10
  at deploy) — grown by 19 content commits, most recently `227454be` (09-05).
- Tracked upload files: still **13**. **Zero** upload blobs have been committed
  since `52ffafea`.
- **6 seed rows have no tracked bytes**, all six present on local disk as
  untracked (`git check-ignore` confirms they are *not* ignored — simply never
  `git add`ed):
  - `ws/workspace-local/blobs/00/00b3ca18…c66b8c`
  - `ws/workspace-local/blobs/53/535a1194…8cb8dd`
  - `ws/workspace-local/blobs/6f/6f69b29e…cbf0ab`
  - `ws/workspace-local/blobs/c0/c0d50d1c…ba3caf`
  - `ws/workspace-local/blobs/d5/d56763e9…0915da`
  - `ws/workspace-local/blobs/d6/d63c2247…b9f65e`
- (3 tracked blobs — shards `44`, `54`, `92` — are orphans no seed row
  references. Harmless, just dead weight in the image.)

This is precisely the working-tree-vs-git gap in §1: the guard passed at seed
time because the files are on Leona's disk, and would have shipped a broken seed
had a deploy run. Because the prod volume already exists, the immediate blast
radius is limited to a fresh volume or a new self-hosted install — but that is
exactly the audience the seed payload exists for.

**Suggested follow-up (not done here):** make the guard git-aware, or add a
repo-state gate that re-runs `findMissingSeedBlobs` against `git ls-files`
rather than the filesystem. No CI gate currently checks this — `ci.yml`'s only
seed gate is `check:seed-content-drift`, which is about
`seed-content.json`/`seed.ts` and unrelated.

---

## Method notes

- Load average checked before starting (12.73, well under the 40 threshold). No
  tests run, no indexing, no MCP codebase calls, no recursive greps outside the repo.
- Seed dbs inspected read-only via `sqlite3 "file:…?mode=ro"`; the deployed seed
  was extracted with `git show 52ffafea:…` into the scratchpad, never opened in place.
- The one network call was a read-only `gh run list` against the mirror's Actions
  API. No deploy, build, push, or image publish was attempted.
- No credential, token, or key value appears in this report.
