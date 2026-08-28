# Implementation Outline — Versioning, Release, and Upgrade for Tovu

- Author: Software Architect (DevOps skills loaded: `AI-Dev-Shop/agents/devops/skills.md`)
- Date: 2026-08-26
- Repo: `/Users/la/Programming/Tovu` @ branch `general-work`, HEAD `04567478`
- Remote: `https://github.com/leonaburime-ucla/Tovu-AI-CMS.git`
- Question answered: *the owner wants to version Tovu up, push it, install it as a real product, then pull updated versions down into that running install. What will it actually take?*

**Evidence rule used throughout:** every claim cites a file path and what was seen in it. Claims I did not personally verify are marked **UNVERIFIED**.

---

## §0 — Corrections to the dispatch brief (read this first)

Four of the five "ground facts" I was told to verify were wrong or materially incomplete. Two of them change the plan.

| # | Brief said | Reality | Impact |
|---|---|---|---|
| C-1 | "CI is deliberately OFF; 8 gates run ZERO tests" | **CI is ON and fires on every push.** `.github/workflows/ci.yml:52-56` — `on: push: branches: ["**"]`. It fails in 3–6s on **every** run for a reason that has nothing to do with the gates: `gh run view 32789789180` → *"The job was not started because recent account payments have failed or your spending limit needs to be increased."* Last 10 runs, all `failure`, all 4–6s. | **Load-bearing.** The blocker is a **GitHub billing account**, not a test config. It is fixable with a credit card in 5 minutes, not with engineering. But until it is fixed, no CI gate can run at all, so a manual-first release flow is mandatory (matches the brief's own constraint). |
| C-2 | "`emit-dist-package-json.mjs` already produces a publishable-shaped package.json — someone started this" | **False.** `development/scripts/emit-dist-package-json.mjs:58-66` emits exactly `{name: "tovu-dist", version, private: true, type, imports}`. No `dependencies`, no `bin`, no `exports`, and `private: true`. Its own header (lines 4-21) states its single purpose: re-scope `#src/*` so compiled files resolve `./src/*.js` instead of `./src/*.ts`. | **Load-bearing.** Nobody started a publish story. The publishable-package work is greenfield, not half-done. |
| C-3 | "~22 `file:` dependencies" | **27 `file:` specifiers across 3 manifests, resolving to 17 distinct sibling Jini packages.** Root `package.json:78-90` = 13; `apps/admin/package.json:18-27` = 10; `apps/site-chat/package.json:15-18` = 4. All point outside the repo at `../Jini/packages/*` / `../../../Jini/packages/*`. | Confirmed as the central obstacle. See §2. |
| C-4 | "`apps/admin` and `apps/site-chat` are not in the `workspaces` glob — check whether they ship" | Correct that they are excluded (`package.json:7-9` = `["packages/*"]`, and `packages/` contains only `sdk`). **They do not ship.** `npm run build` (`package.json:24`) copies `templates`, `themes`, `agent-plugins`, `db/drizzle`, `db/drizzle-database-journal`, `public` into `dist/` — and **nothing from `apps/`**. | **Load-bearing — this is the single biggest blocker.** See §1. |
| C-5 | `name: tovu`, `version: 0.1.0`, `private: true`, `workspaces: ["packages/*"]`, `bin.tovu -> dist/src/cli/main.js`, `engines.node >= 24` | **All five confirmed** (`package.json:2,3,4,7-9,13-15,10-12`). | — |

**One thing the brief did not mention, and it is the best news in this document:** the install-and-upgrade model is **already designed and largely built**. `src/site-dir/` (SPEC-003) implements `tovu init <dir>` and `tovu serve <dir>` with a real install directory, a `.site-meta.json` compatibility stamp, and a schema guard that refuses to open a site newer than the runtime. `src/site-dir/schema-guard.ts:80` literally throws the message `"— upgrade tovu"`. Someone already thought this through. §4 is mostly about the gaps around it, not about inventing it.

---

## §1 — The empirical result: is `dist/` self-contained? **No.**

The brief asked me to prove or disprove self-containment and said the empirical result is worth more than the rest of the document. Agreed. Here it is.

### 1.1 The build runs clean

```
npm run build   →   exit 0
```
(full log: `<scratchpad>/build.log`). `dist/` = **51 MB**, contains `dist/package.json`, `dist/packages/`, and `dist/src/` with 34 subdirectories including `cli/`, `server/`, `themes/`, `templates/`, `agent-plugins/`, `db/`, `public/`.

So the compile step is healthy. That is where the good news stops.

### 1.2 BLOCKER-1 — the admin UI is not in the build at all

`src/server/app.ts:1167-1169`:
```ts
// Built admin SPA (apps/admin/dist) at /admin; helpful 503 when unbuilt.
distDir: process.env.TOVU_ADMIN_DIST ?? path.resolve(import.meta.dirname, "../../apps/admin/dist"),
```

From the **built** file `dist/src/server/app.js`, `import.meta.dirname` is `dist/src/server`, so `../../apps/admin/dist` resolves to:

```
/Users/la/Programming/Tovu/dist/apps/admin/dist
```

Verified: **that path does not exist**, and `dist/apps/` does not exist either. The build chain (`package.json:24`) has no step that creates it. The source SPA build *does* exist at `apps/admin/dist` — but nothing copies it across.

`npm run build` and `npm run admin:build` (`package.json:63`) are separate scripts; only `npm run setup` (`package.json:65`) runs the admin build, and it runs it into `apps/admin/dist`, never into `dist/`.

**Consequence:** a Tovu installed from `dist/` serves a 503 at `/admin` unless the operator sets `TOVU_ADMIN_DIST` by hand to a directory that was never shipped to them. **The admin UI is the product.** This is not a rough edge; it is the difference between "an installed product" and "a headless server nobody can drive."

This alone disqualifies any release attempt this week that does not fix it. It is also, mercifully, a one-line fix to the build chain (§2.3).

### 1.3 BLOCKER-2 — `npm pack` today would publish 288 MB, including internal engineering reports and a full duplicate of the repo

```
npm pack --dry-run
  →  package size: 288.0 MB
     unpacked size: 674.8 MB
     total files: 31,442
```

There is no `files` field and no `.npmignore`, so the tarball is nearly the whole working tree. Measured contents by top-level directory (uncompressed):

| Dir | Size | Should it be published? |
|---|---|---|
| `.claude/` | **500.3 MB** | **No.** Dominated by the stale worktree `agent-acd4039588ea074a8` — a full second copy of the repo (item #23 in the current handoff's open list). |
| `dist/` | 48.3 MB | Yes — this is the actual product. |
| `src/` | 40.0 MB | No — raw TypeScript, already compiled into `dist/`. |
| `coverage/` | 30.3 MB | No. |
| `ADS-memory/` | **23.4 MB** | **No — and this one is not merely bloat.** These are internal architecture reports, handoffs, and security-design documents. Publishing them to a public registry discloses them permanently and irrevocably (npm tarballs are cached and mirrored). |
| `development/` | 19.6 MB | No. |
| `apps/` | 12.5 MB | Partially — see below. |

**Correction to my own earlier reading:** `dist/` and `apps/admin/dist` *are* both included despite `.gitignore:2-3` listing them. I initially expected npm's `.gitignore` fallback to exclude them; empirically it does not here. So the published `bin` would **not** dangle — that part of the concern was wrong.

**BLOCKER-1 survives this correction intact, and gets sharper.** The admin SPA ships in the tarball at `<pkg>/apps/admin/dist`, but the built server at `<pkg>/dist/src/server/app.js` computes `../../apps/admin/dist` = `<pkg>/dist/apps/admin/dist`. **The SPA is in the package and the server looks one directory level away from where it landed.** Off by exactly the `dist/` level — which is the same class of dev-tree-vs-built-tree path skew that `emit-dist-package-json.mjs` exists to solve for `#src/*`, and it should be solved the same way: copy the SPA to `dist/apps/admin/dist` so the one path expression in `app.ts:1169` stays correct in both trees (§2.3).

Adding `files` fixes the size, the raw-source leak, and the `ADS-memory` disclosure in one edit (§2.4).

### 1.4 BLOCKER-3 — the `file:` deps make the tarball uninstallable anywhere else

This is the one the brief predicted, and it is real. `npm pack` does **not** bundle dependencies; it copies `package.json` verbatim. A consumer installing the tarball would get a manifest declaring:

```json
"@jini-ai/core": "file:../Jini/packages/core"
```

npm resolves `file:` relative to the **installed package's own location**, so on any machine that is not this laptop, that path is `<somewhere>/node_modules/tovu/../Jini/packages/core` — which does not exist. Install fails at dependency resolution, before a single line of Tovu runs.

**This kills, outright:** publishing to npm as-is, `npm i github:owner/repo#tag`, and a GitHub Release tarball — all three, for the same reason. It does **not** kill Docker (the build context could include `../Jini`, though the brief notes Docker has its own `spawn` blocker — **UNVERIFIED**, I did not re-test the Docker/spawn claim), and it does **not** kill a self-contained bundled artifact (§2.2).

`.github/workflows/ci.yml:34-37` records the owner's own position on this, and it is worth quoting because it is a decision, not an oversight:

> The 13 `file:../Jini/packages/*` specifiers in package.json are deliberately NOT rewritten to dodge this — the owner keeps them as `file:` on purpose (no npm publish per local change, much faster to iterate) [...] Deploy-time packaging is a separate, later decision.

That later decision is now.

### 1.5 What I did *not* prove

I did not complete a clean-temp-dir `npm install` + boot, because BLOCKER-1 and BLOCKER-3 make the outcome a foregone conclusion — the install fails before boot, and even a hand-patched install would 503 on the admin UI. Running it would produce a failure I can already name from the file contents. **The three blockers above are each independently sufficient to fail a fresh install; there is no need to rank them by which fires first.**

What this means for the outline: §2's "what has to change" list is not speculative hardening. Items 1–4 are the minimum to get past a `npm install` that currently cannot succeed.

---

## §2 — (A) What is the distribution unit? **Recommendation: npm package on the public registry, `npm i -g tovu`.**

### 2.1 Why this is now viable — the finding that unlocks it

The `file:` problem looked fatal until I checked whether the Jini packages actually exist on the public npm registry. **They mostly do.** Checked all 17 with `npm view <pkg> version`:

| Jini package | On npm | Local version | Match? |
|---|---|---|---|
| `@jini-ai/agent-runtime` | 0.2.1 | 0.2.1 | ✅ exact |
| `@jini-ai/agentic` | 0.1.2 | 0.1.2 | ✅ exact |
| `@jini-ai/core` | 0.1.2 | 0.1.2 | ✅ exact |
| `@jini-ai/daemon` | 0.2.1 | 0.2.1 | ✅ exact |
| `@jini-ai/mcp` | 0.1.2 | 0.1.2 | ✅ exact |
| `@jini-ai/sqlite` | 0.1.2 | 0.1.2 | ✅ exact |
| `@jini-ai/ui` | 0.1.2 | 0.1.2 | ✅ exact |
| `@jini-ai/platform` | 0.1.2 | 0.1.2 | ✅ exact |
| `@jini-ai/protocol` | 0.1.2 | 0.1.2 | ✅ exact |
| `@jini-ai/chat` | **404** | 0.1.0 | ❌ |
| `@jini-ai/cms` | **404** | 0.1.0 | ❌ |
| `@jini-ai/devops` | **404** | 0.1.2 | ❌ |
| `@jini-ai/http-kit` | **404** | 0.2.1 | ❌ |
| `@jini-ai/infra` | **404** | 0.1.0 | ❌ |
| `@jini-ai/integrations` | **404** | 0.1.0 | ❌ |
| `@jini-ai/admin` | **404** | 0.1.0 | ❌ |
| `@jini-ai/agent-plugins` | **404** | 0.1.0 | ❌ |

**9 of 17 are already published at exactly the version this repo builds against.** The remaining 8 are all `private: false` in their own manifests (checked every `Jini/packages/*/package.json`) — so nothing in them is *marked* unpublishable. They simply have not been pushed.

That reframes the whole problem. This is not "the `file:` deps make publishing impossible." It is **"8 npm publishes stand between Tovu and a working `npm i -g tovu`."** That is a bounded, one-afternoon task on a repo the owner controls.

**Caveat I could not close:** memory records that Jini's `dist/` is gitignored and its `package.json` `exports` point at `dist/`, with no hot reload. Whether the 8 unpublished packages currently build cleanly enough to publish is **UNVERIFIED** — I did not run Jini's build. That is the first thing to check in Phase 1, and it is the single item most likely to expand this estimate.

### 2.2 The four candidates, judged against the `file:` problem

| Option | Survives `file:`? | Verdict |
|---|---|---|
| **A. npm package, public registry** | **Yes, after 8 publishes.** Rewrite all 27 `file:` specifiers to semver ranges at publish time only (the working tree keeps `file:` — see 2.5). | **RECOMMENDED.** Gives `npm i -g tovu`, `npx tovu`, and — critically — `npm i -g tovu@latest` as the entire upgrade command. That last property is what the owner is asking for, delivered free by the package manager instead of by code we write. |
| **B. git tag + `npm i github:owner/repo#tag`** | **No.** npm installs the repo *as-is* and runs `prepare`. The manifest still says `file:../Jini/...`. Fails identically to a tarball. Would need the same 8 publishes *plus* a `prepare` build step, i.e. strictly more work than A for a worse result. | Rejected. |
| **C. Docker image** | Yes in principle — the build context can include `../Jini`. But: the owner has asked not to start Docker without asking (standing instruction), the prior `spawn` blocker is **UNVERIFIED** by me, and a Docker image makes "upgrade my running site" mean container orchestration + volume management rather than one npm command. | Rejected for this slice. Reconsider for hosted/multi-tenant later. |
| **D. Tarball on a GitHub Release** | **No**, for the same manifest reason as B — *unless* the tarball is a fully-bundled artifact with `node_modules` vendored inside. That variant works and needs zero npm publishes. | **Recommended as the Phase-0 fallback** if Jini's 8 publishes turn out to be blocked. See §6 D-2. |

### 2.3 The build chain must ship the admin SPA (fixes BLOCKER-1)

`package.json:24` needs one more `cp -R` link in the chain, and `admin:build` must run before it:

```
npm run admin:build
&& mkdir -p dist/apps/admin/dist && cp -R apps/admin/dist/. dist/apps/admin/dist/
```

`dist/apps/admin/dist` is the exact path `src/server/app.ts:1169` computes from the built server. No source change is required — the default already points at the right place; the directory is just never created. (Alternative: change `app.ts:1169` and set the copy target to something shorter. Same effect, touches source. Prefer the build-chain fix.)

### 2.4 A `files` field (fixes BLOCKER-2)

Adding `"files": ["dist", "README.md", "LICENSE"]` replaces the 288 MB / 31,442-file default with an explicit allowlist. This is the **highest-value single edit in the whole document**: it simultaneously fixes the size, stops shipping raw `src/`, and — most importantly — stops publishing `ADS-memory/` and the `.claude/` worktree to a public registry. Expected published size ≈ 51 MB, before any pruning.

Ship this edit *before* the first `npm publish`, not after. An npm publish is effectively irreversible: unpublish is restricted to a 72-hour window and mirrors may retain the tarball regardless.

`private: true` (`package.json:4`) must also be removed or the publish is refused outright.

### 2.5 Keep `file:` in the working tree — rewrite only at publish

The owner's stated reason for `file:` (`.github/workflows/ci.yml:34-37`: "no npm publish per local change, much faster to iterate") is sound and should not be traded away. The clean resolution is that **the published manifest is a build artifact, not the working manifest.** Extend `development/scripts/emit-dist-package-json.mjs` — which already exists, already derives fields from the root manifest rather than hardcoding them, and already has the "keep the two in sync structurally" discipline in its header (lines 15-19) — to emit the *publishable* manifest too: `file:` → `^<local version>`, drop `private`, add `files`/`bin`/`engines`. Local dev is untouched; only `npm publish` sees the rewritten form.

This is the natural extension of a script that already exists for exactly this class of problem. It is not new machinery.

---

## §3 — (B) The full pre-publish change list

Ordered by whether it blocks the *first* install.

**Blocking — nothing installs without these:**

1. **Publish the 8 missing `@jini-ai/*` packages.** `chat, cms, devops, http-kit, infra, integrations, admin, agent-plugins`. Verify each builds first (**UNVERIFIED** risk, §2.1).
2. **Remove `private: true`** — `package.json:4`.
3. **Add `files: ["dist", ...]`** — fixes both the 288 MB bloat and the missing `dist/` (§2.4).
4. **Ship the admin SPA into `dist/apps/admin/dist`** — build-chain `cp` (§2.3). Without this the product has no UI.
5. **Rewrite `file:` → semver in the emitted publish manifest** (§2.5).

**Blocking for a *usable* install (the site works but the operator's data is at risk without these) — see §4:**

6. **Give `tovu serve <dir>` a `themesDir` override.** Today `CreateSqliteRouteDepsOverrides` (`src/server/deps.ts:291-303`) has exactly four fields — `db`, `workspaceId`, `pluginFailureThreshold`, `uploadsDir`. **No `themesDir`.** This is DATA-LOSS-1 in §4.
7. **Route `plugins`/`export`/`publish` dirs at the install dir.** `pluginsInstallDir()` (`deps.ts:244-246`), `resolveExportOutputRootDir()` (`deps.ts:203-205`), `resolvePublishOutputRootDir()` (`deps.ts:226-228`) and `resolveSourceControlExportRootDir()` (`deps.ts:214-218`) all default to `resolve(process.cwd(), "infra", ...)`. Under `tovu serve /home/me/mysite` launched from anywhere else, all four land in the wrong place.

**Non-blocking, do it anyway:**

8. `exports` field — currently absent. Only matters if anyone imports Tovu as a library; `bin` is the real entry. Low priority.
9. `LICENSE` file — absent from the repo root. npm will publish without one, but a public package without a license is a problem for anyone who adopts it.
10. `packages/sdk` is `private: true` with its own `main: ./dist/index.js` (`packages/sdk/package.json:3,7`). It is inside `workspaces`, so it is *not* automatically part of the `tovu` tarball. Confirm whether the runtime needs it — **UNVERIFIED**.

### 3.1 Is `dist/` self-contained? Summary answer

**No, on three counts, in descending severity:** (1) the admin SPA is absent entirely; (2) `dist/` is excluded from `npm pack` while `bin` points into it; (3) the dependency manifest is machine-local. Items 1–5 above close all three.

---

## §4 — (D) The upgrade path. **This is the section that matters.**

The owner's question: *he has Tovu installed, a real site, real content in a real DB. He runs the upgrade. What happens?*

Short answer: **the database is in good shape and was carefully designed. The themes will be silently destroyed. That asymmetry is the whole story.**

### 4.1 Database — SAFE, and better designed than expected

Upgrades run migrations automatically. `src/db/sqlite/content-db.ts:85` — `openContentDb` calls `migrate(db, { migrationsFolder: MIGRATIONS_DIR })` on **every open**, where `MIGRATIONS_DIR` is package-relative (`content-db.ts:46`). There are **50 migrations** today (`src/db/drizzle/meta/_journal.json`, latest `idx: 49`, tag `0049_common_cammi`).

The protections that already exist, all verified:

1. **A version stamp per site.** `.site-meta.json` carries `schemaVersion` (migration index) and `schemaTag` (migration hash) — `src/site-dir/types.ts:29-41`.
2. **A downgrade guard.** `src/site-dir/schema-guard.ts:78-82`: if the site's index is *greater* than the runtime's, it throws `SiteNewerThanRuntimeError` **before the db is ever opened**. So installing an *older* Tovu over a newer site refuses rather than corrupting.
3. **A divergence guard, which is the subtle one.** `schema-guard.ts:83-89`: equal index but a **different tag** is also refused. Its own comment: *"divergent lineage, refusing rather than guessing."* This catches two builds that share migration numbering but bundle different SQL — exactly the failure a hand-rolled integer version would miss.
4. **Correct write ordering.** `src/site-dir/boot-site-dir.ts:78-98`: guard → open+migrate → stamp, with the stamp written **only after** `migrate()` returns, both fields together, atomically (`writeJsonFileAtomic`). The header calls this out as CIC U-002 with explicit ordering constraints. A crash mid-migration leaves the old stamp, so the next boot retries rather than believing a migration that did not finish.

**The real gap: there is no rollback and no automatic backup.**

- **No down migrations.** `src/db/drizzle/` contains 50 `.sql` files and zero `down`/`rollback` files. Drizzle does not generate them. Once a migration applies, the only way back is a file copy.
- **Nothing backs up `content.db` before migrating.** `openContentDb` migrates immediately on open. There is no pre-migration snapshot step anywhere in `boot-site-dir.ts`.
- The machinery to do it **already exists and is used elsewhere**: `infra/` currently holds four `restore-point-*.db` files (e.g. `restore-point-workspace-local-wm2-1787623527269.db`, 27 MB, dated 2026-08-24), produced by `src/db/postgres/db-ops.ts` and its SQLite counterpart via better-sqlite3's online-backup API — which is precisely why `ContentDb` was widened with `$client` (`content-db.ts:38-43`). **The backup primitive is built, proven, and simply not wired into the upgrade path.**

> **RISK-1 (medium severity, cheap fix): an upgrade applies irreversible schema changes to a 28 MB production database with no automatic restore point.** The guards prevent *wrong* migrations; nothing protects against a *buggy* one. Fix: call the existing restore-point capture in `bootSiteDir` when `compareSchemaVersion` returns `"migrate"` — one call, at one site, using a primitive that already works.

### 4.2 Themes — **NOT SAFE. This is the one that eats his site.**

Three verified facts that combine badly:

1. **The themes root is inside the installed package.** `src/server/deps.ts:173-175`:
   ```ts
   export function builtInThemesDir(): string {
     return process.env.TOVU_THEMES_DIR ?? resolve(import.meta.dirname, "../themes");
   }
   ```
   From `dist/src/server/`, that is `dist/src/themes/` — i.e. `node_modules/tovu/dist/src/themes/` in an install. The build chain copies `src/themes/` there (`package.json:24`).

2. **`tovu serve <dir>` cannot move it.** `CreateSqliteRouteDepsOverrides` (`src/server/deps.ts:291-303`) has exactly four fields: `db`, `workspaceId`, `pluginFailureThreshold`, `uploadsDir`. **There is no `themesDir`.** And `src/cli/commands/serve.ts:84-88` passes only `db`, `workspaceId`, `uploadsDir`. So under `tovu serve /home/me/mysite`, themes still resolve into the package.

3. **Both theme *edits* and theme *installs* land there.**
   - `theme_write_file` (`src/features/theme/tool-registrations.ts:254`) → `writeThemeFile({ themesRoot: routeDeps.themesDir, ... })`.
   - `downloadMarketplaceTheme` (`src/features/theme/marketplace.ts`) `cpSync`s **two** copies — a pristine catalog copy and an editable working copy — both "under `RouteDeps.themesDir`" (`marketplace.ts:83, 239`).

> **RISK-2 (HIGH severity — certain, not hypothetical): `npm i -g tovu@<newer>` destroys every theme the owner installed or edited.**
>
> npm replaces the package directory on upgrade. Everything under `node_modules/tovu/dist/src/themes/` goes with it: every marketplace theme he installed, every AI-authored theme edit, and the "reset to original" catalog copies that were supposed to be his safety net. **Both the working copy and its backup live in the same doomed directory.**
>
> There is no warning, no error, and no diff. The site comes back up on the shipped default theme and looks like it was never customized.

This is the failure mode the brief asked me to name, and it is worse than "an upgrade might touch his copies" — it is that **user data was placed inside the software's own install directory**, which is the one location a package manager is guaranteed to overwrite.

**The fourth fact makes the fix concrete:** `src/site-dir/init-site.ts:39` already creates the right home for them:
```ts
const SUBDIRS = ["uploads", "themes", "plugins", "overrides"] as const;
```
`tovu init` creates `<dir>/themes`, `<dir>/plugins`, and `<dir>/overrides` — **and I could find no code that reads any of the three.** Grepping `src/**` for these names returns only `init-site.ts:39` itself plus unrelated domain-name strings. Only `<dir>/uploads` is wired (`serve.ts:87`).

So the intended design is already on disk. The wiring was never finished. **Fixing RISK-2 means completing an existing design, not inventing one**: add `themesDir` to the overrides interface, pass `path.join(target, "themes")` from `serve.ts`, and have theme discovery read the install dir *in addition to* the package's built-ins (bundled themes stay read-only in the package; installed/edited themes live in the site dir).

Note the memory-recorded model — *Tovu themes are COPIED, not inherited; Tovu never rebuilds themes* (ADR-020 §5) — makes this **easier**, not harder. Because a user's theme is a full standalone copy rather than a delta over a bundled parent, relocating it to the install dir needs no inheritance resolution. A copy in `<dir>/themes/` is complete and self-sufficient by construction.

### 4.3 Uploads — SAFE under `serve`, at risk in dev-shaped installs

`serve.ts:87` passes `uploadsDir: path.join(target, "uploads")`, and `deps.ts:857` honours it (`overrides?.uploadsDir ?? mediaUploadsDir()`). Media lands in the install dir and survives upgrades. This is the one path that was already fixed — `deps.ts:296-301` documents it as "CR-R01 fix: uploads used to always default to `mediaUploadsDir()`, which is `process.cwd()`-relative and therefore wrong whenever `tovu serve <dir>` is invoked from outside that dir."

**That comment is the precedent for RISK-2.** The identical bug was found and fixed for uploads and left unfixed for themes.

### 4.4 Plugins, exports, publish output — RISK-3 (medium)

Four more resolvers still default to `process.cwd()`-relative paths with no install-dir override:

| Function | `src/server/deps.ts` | Default |
|---|---|---|
| `pluginsInstallDir()` | 244-246 | `<cwd>/infra/plugins` |
| `resolveExportOutputRootDir()` | 203-205 | `<cwd>/infra/export` |
| `resolvePublishOutputRootDir()` | 226-228 | `<cwd>/infra/publish` |
| `resolveSourceControlExportRootDir()` | 214-218 | `<cwd>/infra/source-control-export` |

> **RISK-3: under `tovu serve <dir>`, installed plugins and every export/publish artifact are written relative to whatever directory the operator happened to `cd` into**, not to the site. Launch from `~` one day and `/tmp` the next and the site silently has different plugins. `<dir>/plugins` is created by `init` and never read.
>
> Severity is lower than RISK-2 only because these are scattered rather than destroyed — but "the site behaves differently depending on your shell's cwd" is its own bad day.

Each takes an env var today (`TOVU_PLUGINS_DIR`, `TOVU_EXPORT_DIR`, `TOVU_PUBLISH_DIR`, `TOVU_SOURCE_CONTROL_EXPORT_DIR`), so a **Phase-0 workaround exists with zero code**: a wrapper script that exports all five (including `TOVU_THEMES_DIR`) before invoking `tovu serve`. That is exactly how the smallest slice in §5 dodges RISK-2 without waiting for the proper fix.

### 4.5 Config and content

- `config.json` is **never written by `serve`** (`src/site-dir/types.ts:18`) and lives in the install dir. Safe.
- `.site-meta.json` is rewritten only on a real migration (`boot-site-dir.ts:94-98`). Safe.
- Content lives in `content.db` in the install dir. Safe, subject to RISK-1.
- Agent-plugin install state (`infra/agent-plugins/ws/<workspaceId>/`) and skills (`infra/skills/`) are `cwd`-relative like §4.4 — same class, same workaround. **UNVERIFIED** whether these have their own env overrides.

### 4.6 Data-loss risk register

| ID | Risk | Severity | Certain? | Fix cost |
|---|---|---|---|---|
| **RISK-2** | Upgrade destroys all installed + AI-edited themes **and their catalog backups** | **HIGH** | **Yes — every upgrade** | Small: `themesDir` override + discovery reads install dir |
| **RISK-1** | Irreversible migration on a real DB with no automatic restore point, no down migrations | Medium | On a buggy migration | Small: wire the existing restore-point capture into `bootSiteDir` |
| **RISK-3** | Plugins/exports/publish follow `cwd`, not the site | Medium | Yes, silently | Small: 4 more overrides |
| **RISK-4** | 288 MB publish leaks `ADS-memory/` + a repo worktree to a public registry | Medium (disclosure, irreversible) | Yes, on first publish | Trivial: `files` field |

**All four fixes are small. None is architectural. The danger is shipping before doing them, not the doing.**

---

## §5 — (C) Versioning scheme and release flow

### 5.1 Scheme: SemVer from `0.1.0`, next release `0.2.0`

Stay on `0.x`. Under SemVer, `0.x` means "no stability promise", which is honest for a product with unfinished install-dir wiring — and it lets breaking changes ship as minor bumps without lying to anyone. Move to `1.0.0` when RISK-1 through RISK-3 are closed and one upgrade has been done for real.

**There is a second version in this system that is not `package.json`'s, and it is the one that actually governs upgrades:** the migration index+tag in `.site-meta.json`. `src/site-dir/schema-guard.ts:48-52` derives it from `drizzle/meta/_journal.json`'s last entry — currently `idx: 49`, tag `0049_common_cammi`.

**Do not couple them.** They answer different questions (product identity vs. data-schema lineage), they change at different rates, and the schema guard's divergence check (`schema-guard.ts:83-89`) is strictly stronger than any package version comparison could be. Two versions here is correct design, not duplication. Worth stating explicitly because the instinct to unify them is strong and would remove a real safety property.

### 5.2 Release flow — manual, no CI dependency

Given C-1 (CI cannot run at all until the GitHub billing issue is resolved), every gate below is a local command the owner or an agent runs.

```
1.  git checkout general-work && git pull
2.  npm run build                       # must exit 0
3.  npm run typecheck                   # tsc --noEmit
4.  npm run ci:local                    # package.json:70 — the local gate bundle
5.  npm run check:route-coverage-floor  # or the scoped test set for what changed
6.  npm version minor                   # 0.1.0 -> 0.2.0; commits + tags v0.2.0
7.  npm publish                         # emits the rewritten publish manifest (§2.5)
8.  git push && git push --tags
9.  UPGRADE SMOKE TEST (§6 Phase 2) — non-negotiable, see below
```

Notes on specific steps:

- **Step 4** uses `ci:local` (`package.json:70` → `development/scripts/ci-local.sh`), which already exists precisely so the gates can run without GitHub. **UNVERIFIED**: I did not run it, and prior sessions report the repo carries a known-failing test baseline (`check:test-baseline` against `development/scripts/repo-test-failure-baseline.json`). Expect "matches baseline", not "all green" — and confirm which it is before treating step 4 as a gate.
- **Step 6** — `npm version` creates the git tag. That is the whole tagging story; no separate tagging convention is needed.
- **Step 9 is the gate that matters.** A release that has not been upgraded *into* has not been tested. Publishing is easy to verify and easy to get falsely confident about; upgrading is where RISK-1/2/3 live.
- **`npm publish` is effectively irreversible** (72-hour unpublish window, mirrors retain copies). The `files` field (§2.4) must land *before* step 7 ever runs the first time.

### 5.3 What the owner's upgrade command actually is

```
npm i -g tovu@latest     # replaces the runtime
tovu serve ~/mysite      # migrates the site on next boot, stamps .site-meta.json
```

That is it. Migration is automatic and guarded (§4.1). **Once RISK-2 is fixed**, this is safe. Until then it silently destroys themes, which is why §6 Phase 0 uses an env-var wrapper instead.

---

## §6 — (E) Phasing

The brief asks for the smallest slice that gets one install-and-upgrade cycle end to end, however ugly. Here it is, and it deliberately **skips npm entirely** for the first pass.

### Phase 0 — "prove the loop with a tarball" (half a day, zero publishes, zero risk)

The point is to exercise **upgrade mechanics**, which is what the owner said he wants to test. It does not need a registry.

1. Add `files: ["dist"]` to `package.json` (§2.4) — do this first regardless; it is the disclosure fix.
2. Add the admin-SPA copy step to the build chain (§2.3).
3. `npm run build && npm pack` → `tovu-0.1.0.tgz`.
4. In the scratchpad: `npm i -g ./tovu-0.1.0.tgz`. **This will fail on the `file:` deps** — expected. Resolve it the crude way: `npm i -g --omit=optional` will not help; instead install into a directory that has a `node_modules` copied from this repo, or symlink `../Jini` next to the install. Ugly on purpose.
5. `tovu init ~/tovu-test-site && tovu serve ~/tovu-test-site` — **with a wrapper that exports `TOVU_THEMES_DIR=~/tovu-test-site/themes` plus the four §4.4 vars.** This dodges RISK-2 and RISK-3 with zero code changes.
6. Add content through the admin UI. Edit a theme. Upload an image.
7. Bump to `0.2.0`, rebuild, repack, reinstall over the top.
8. `tovu serve ~/tovu-test-site` again. **Check: content intact? migrations applied and `.site-meta.json` restamped? theme edit still there? upload still there?**

Step 8 is the entire deliverable. It answers the owner's real question with evidence instead of a document. **If the theme edit survives in Phase 0, that proves the env-var workaround; it does not prove RISK-2 is fixed** — drop the wrapper and it comes back.

### Phase 1 — make it a real npm install (1–2 days)

1. Verify the 8 unpublished Jini packages build; publish them (§2.1). **This is the step most likely to expand — start here, not last.**
2. Extend `emit-dist-package-json.mjs` to emit the publishable manifest (§2.5).
3. Remove `private: true`.
4. `npm publish` → `npm i -g tovu` works from a clean machine.
5. Repeat the Phase 0 loop with `npm i -g tovu@0.2.0` as the upgrade step.

### Phase 2 — close the data-loss risks (1–2 days, parallelizable 3-wide)

Three independent slices, no ordering between them:

- **2a — RISK-2 (do this one first if only one gets done).** Add `themesDir` to `CreateSqliteRouteDepsOverrides` (`deps.ts:291-303`); pass `path.join(target, "themes")` from `serve.ts`; make theme discovery read install-dir themes in addition to bundled ones. Regression test: write a theme file, simulate a package replace, assert the edit survives.
- **2b — RISK-1.** Wire the existing restore-point capture into `bootSiteDir` when `compareSchemaVersion` returns `"migrate"`. Regression test: a failing migration leaves a restorable `.db`.
- **2c — RISK-3.** Four more overrides for plugins/export/publish/source-control-export.

Each needs a regression test that **fails first** — standing repo rule for any bug fix.

### Phase 3 — hardening (after one real upgrade has happened)

- Resolve the GitHub billing block (C-1) and let CI gate releases.
- `tovu upgrade` / `tovu backup` CLI commands, if the manual flow proves annoying.
- `LICENSE`, `exports`, README for a public package.
- Reconsider Docker for hosted/multi-tenant.

**Recommended stopping point for this week: Phase 0 + Phase 2a.** That combination gives a proven upgrade loop *and* removes the one risk that would actually lose the owner's work. Phase 1 is the bigger prize but has the unverified Jini-build dependency in front of it.

---

## §7 — (F) Open decisions for the owner

Six, each with a recommendation and the cost of the alternative.

**D-1 — Distribution unit: npm, or a self-contained bundled tarball?**
*Recommend: **npm** (§2.2 option A).* It makes the upgrade command `npm i -g tovu@latest`, which is the entire feature the owner asked for, delivered by the package manager rather than by code we maintain.
*Cost of the alternative:* a bundled tarball needs zero npm publishes and works today, but every upgrade becomes "download this URL, unpack it, replace the directory" — a manual ritual the owner has to remember and we have to document. Take it only if D-2 comes back blocked.

**D-2 — Publish the 8 missing `@jini-ai/*` packages to public npm?**
*Recommend: **yes**.* Nine are already public at exactly the right versions; the remaining 8 are all `private: false` already. This is the single unlock for D-1.
*Cost of the alternative:* keeping them unpublished forces the bundled tarball, permanently. **Caveat:** whether those 8 build cleanly is **UNVERIFIED** — check before committing to a date. If publicness itself is the objection (rather than effort), GitHub Packages with a scoped `.npmrc` is the middle road, at the price of every installer needing auth.

**D-3 — Fix RISK-2 (themes in the install dir) before or after the first real install?**
*Recommend: **before** — it is Phase 2a and it is small.*
*Cost of the alternative:* the owner runs on the env-var wrapper and RISK-2 fires the first time he upgrades without it. Every installed theme, every AI theme edit, and both "reset to original" catalog copies are destroyed with no warning. Given the whole point of the exercise is testing upgrades, shipping the known theme-eating upgrade path is the wrong bet.

**D-4 — Automatic pre-migration backup (RISK-1): on by default, opt-out, or manual?**
*Recommend: **on by default**, using the restore-point primitive that already works.* A 28 MB copy costs nothing and buys back the rollback that 50 down-migration-less migrations do not provide.
*Cost of the alternative:* manual backups are the ones nobody takes. Opt-in disk growth is the only real objection, and a retention cap answers it.

**D-5 — Fix the GitHub Actions billing block now, or accept manual releases indefinitely?**
*Recommend: **fix it now** — it is a payment method, not engineering, and it currently makes every push report a red X that means nothing.* That last part is the real cost: a permanently-red CI trains everyone to ignore CI.
*Cost of the alternative:* manual releases work fine for one operator (§5.2 is genuinely sufficient), so this is not blocking — but the false-red signal keeps degrading.

**D-6 — Version `0.2.0`, or jump to `1.0.0`?**
*Recommend: **`0.2.0`**.* `0.x` accurately signals "install-dir wiring is incomplete", and lets Phase 2's fixes ship as minors.
*Cost of the alternative:* `1.0.0` is a stability promise this codebase cannot keep this week — RISK-2 alone would make it false. It also spends the 1.0 announcement on a release nobody has upgraded into yet.

---

## §8 — Summary of what was verified vs. asserted

**Verified by direct file read or command execution:**
`package.json` fields and build chain · `npm run build` exit 0 and `dist/` contents · absence of `dist/apps/admin/dist` · `npm pack --dry-run` size, file count, and per-directory breakdown · 27 `file:` specifiers across 3 manifests · npm registry status of all 17 required `@jini-ai/*` packages · `private` flag on all 29 Jini packages · CI trigger config and the billing-failure annotation on run `32789789180` · `emit-dist-package-json.mjs` output shape · `src/site-dir/{boot-site-dir,init-site,schema-guard,types}.ts` · `src/db/sqlite/content-db.ts` migrate-on-open · 50 migrations, zero down migrations · `CreateSqliteRouteDepsOverrides`'s four fields · `builtInThemesDir()` / `mediaUploadsDir()` / `pluginsInstallDir()` / the three export-dir resolvers · `theme_write_file` and `downloadMarketplaceTheme` writing to `RouteDeps.themesDir` · that nothing reads `<install-dir>/{themes,plugins,overrides}`.

**Explicitly NOT verified (marked UNVERIFIED in-text):**
whether the 8 unpublished Jini packages build cleanly · the Docker `spawn` blocker · `ci:local`'s current pass/fail state · whether `packages/sdk` is needed at runtime · whether agent-plugin/skills install state has env overrides.

**Not attempted:** a full clean-temp-dir install-and-boot, for the reason given in §1.5 — three independently fatal blockers stand in front of it, each identifiable from file contents. Phase 0 step 4 is where that experiment belongs, once items 1–4 of §3 are done.
