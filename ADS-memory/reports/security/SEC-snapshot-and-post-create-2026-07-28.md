# SEC-snapshot-and-post-create — Security Review of Two Unrelated Bug Fixes

- Date: 2026-07-28
- Reviewer: Security
- Dispatch: Ad hoc `/code-review` security pass, run in parallel with (and independent of) a separate Code Review dispatch covering the same two changes.
- Skills loaded: `AI-Dev-Shop/agents/security/skills.md`, `AI-Dev-Shop/skills/security-review/SKILL.md`, `AI-Dev-Shop/skills/secure-input-handling/SKILL.md`, `AI-Dev-Shop/skills/architecture-decisions/SKILL.md`. `web-compliance` and `critical-internal-constraints` were not activated: neither change touches a consent/privacy/claims/account-control surface, and no `critical-internal-constraints.md` under `ADS-memory/reports/pipeline/005-plugin-system/` or the SPEC-002 pipeline tree designates `ESCALATE_SECURITY` units for these files.

## Scope and Method

`git diff` scoped exactly to the two named surfaces (working tree has many unrelated concurrent-agent changes, excluded):

1. `src/features/plugins/snapshot.ts`, `src/features/plugins/disk-headroom.ts`, `src/features/plugins/data-module.ts` (+ their `__tests__` diffs, read for regression-coverage evidence only).
2. `src/features/post/post.ts` (+ `__tests__/post.test.ts`), `src/server/routes/admin/posts/create.ts`, `src/server/routes/admin/pages/create.ts`.

Traced data flow beyond the diff itself where needed to answer the dispatcher's specific questions: `src/features/plugins/{migration-journal,migration-recovery,restore,plugin-identity}.ts`, `src/features/plugins/store/store-plugin.ts`, `src/newsletter/data-module-manifest.ts`, `src/comments/data-module-install.ts`, `src/infra/sqlite/content-db.ts`, `src/server/deps.ts` (config origin of `dbPath`) for change 1; `src/features/post/repo.sqlite.ts`, `src/server/http/site/render.ts` (`renderDocNode`/`renderMarks`/`safeHref`/`escapeHtml`), `src/server/routes/site/pages.ts`, `src/server/routes/content/posts/get-by-slug.ts`, `src/seo/seo.ts`, `src/infra/db/schema.ts`, `src/server/app.ts` (body-parser config, absence of error middleware) for change 2. Read `ADS-memory/specs/002-content-entry-authoring/{api,errors,behavior}.spec.md` as the required governing spec for change 2.

No Critical or High findings in either change. Three Medium/Low findings below, all in change 2; change 1 has one Low/informational note only.

---

## Finding 1 (Medium) — Route-layer body-size cap and `PAYLOAD_TOO_LARGE` error contract are unimplemented; only a global, 15x-looser, unmapped limit exists

- **Change:** 2 (posts/pages create)
- **Component/Type:** Input validation / missing size-bound control (oversized-payload / resource-amplification)
- **Affected files:** `src/server/routes/admin/posts/create.ts`, `src/server/routes/admin/pages/create.ts`, `src/server/app.ts:428`

### Description

`ADS-memory/specs/002-content-entry-authoring/api.spec.md` §4 explicitly specifies for `POST_CREATE`/`PAGE_CREATE`: *"Body size limit: 1 MiB (route layer; exceeding ⇒ 413, EC-05)"*, and `errors.spec.md` names a dedicated `PAYLOAD_TOO_LARGE` (413) code with message "Content too large to save." — "Route-layer body limit (1 MiB)." This is the documented control meant to bound the very fields this diff newly makes caller-controlled at create time (`bodyJson`, `slug`, `title`).

The actual implementation has neither part of this contract:
- `src/server/app.ts:428` sets one **global** `express.json({ limit: "15mb" })` for the entire app — 15x the spec'd bound, and not specific to these two routes.
- Neither `create.ts` route's `catch` block (both read in full) has any handling for a body-parser size error; there is no `code: "PAYLOAD_TOO_LARGE"` branch anywhere in either file.
- `src/server/app.ts` has no 4-arg Express error-handling middleware at all (confirmed by full-file grep) — a request that *does* exceed even the 15 MiB global cap falls through to Express's built-in default error handler, not the app's own JSON error envelope. That default handler's response shape (HTML vs JSON, stack trace included or not) depends on `NODE_ENV`, which this repo does not appear to pin anywhere in `app.ts` — an operational detail outside this diff's files but directly relevant to whether hitting this limit degrades gracefully.

### Exploit Scenario

1. An authenticated principal holding `content.write` (not necessarily a full admin — whatever role this permission is granted to) sends `POST /api/admin/v1/workspaces/:workspaceId/posts` with a `bodyJson` payload of, say, 8 MiB (a legitimate-looking but bloated TipTap doc, or simply padded with a large but valid JSON string field inside it).
2. The spec's intended control (1 MiB route-layer cap, 413 `PAYLOAD_TOO_LARGE`) never fires — Express's global 15 MiB limit happily accepts it.
3. `createPost` stores the full 8 MiB `bodyJson` verbatim (`isJsonObject` only checks `typeof === "object" && !Array.isArray`, no size/depth bound — confirmed at `src/features/post/post.ts:359`).
4. That post, once published, is rendered on **every unauthenticated visitor's** page load via `entryContent()`/`renderDocNode()` (`src/server/http/site/render.ts:192-195`) — the 8 MiB of content is walked and re-serialized to HTML on every hit (no caching seen in this render path), and appears in `sitemap.xml`/canonical-URL machinery too (`src/seo/seo.ts:123`). One authenticated write inflates the cost of many subsequent anonymous reads.
5. A request that *does* exceed 15 MiB gets Express's default (unhandled) error response instead of the documented JSON contract the admin UI/agents presumably code against (`errors.spec.md` §6 lists `PAYLOAD_TOO_LARGE` as a first-class code for this endpoint).

### Mitigation

- Add a route-scoped `express.json({ limit: "1mb" })` (or equivalent per-route body-size middleware) ahead of `POST_CREATE`/`PAGE_CREATE` (and their sibling `PUT` update routes, which the same spec section also covers), matching the spec's 1 MiB figure.
- Add error-handling (either a dedicated 4-arg middleware, or a per-route check) that catches the body-parser's size error (`err.type === "entity.too.large"` / `err.status === 413`) and emits `{ error: "Content too large to save.", code: "PAYLOAD_TOO_LARGE" }` with HTTP 413, per `errors.spec.md`.
- Separately (defense in depth, not a spec requirement): consider a `bodyJson` size/depth ceiling independent of the raw HTTP body size, since 1 MiB of deeply-nested-but-small JSON nodes can still produce pathological recursion depth in `renderDocNode`'s unbounded recursive descent.

### Verification Steps

1. `POST` a body with `bodyJson` between 1 MiB and 15 MiB to `/posts` and `/pages` create routes; confirm 413 with `code: "PAYLOAD_TOO_LARGE"` (not 201).
2. `POST` a body just under 1 MiB; confirm normal 201 success (no regression).
3. Confirm the update routes (`posts/update.ts`, `pages/update.ts` — same spec section, not modified by this diff but sharing the same gap) get the identical fix, since `errors.spec.md` states the limit "applies to create/update endpoints" as one rule.

**Human Sign-Off Required:** No (Medium, tracked — does not block release per severity guidance, but is a concrete spec-conformance gap on the exact new caller-controlled-input surface this diff introduces).

---

## Finding 2 (Medium) — No slug length bound: an authenticated write can inflate every subsequent public page render, sitemap entry, and canonical URL

- **Change:** 2 (posts/pages create)
- **Component/Type:** Missing input-validation bound (resource-amplification via stored, unauthenticated-facing content)
- **Affected files:** `src/features/post/post.ts:128-130` (`isValidSlugFormat`, shared by `createPost`'s new explicit-slug path and pre-existing `updatePost`)

### Description

`behavior.spec.md` BR-03 step 2 requires: *"provided slug format `^[a-z0-9-]+$` and ≤ 120 chars"*. The implemented `isValidSlugFormat` only checks the regex:

```ts
function isValidSlugFormat(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}
```

No length bound anywhere in `createPost`'s new explicit-slug branch, and none in `updatePost` either (this helper is a straight extraction of `updatePost`'s pre-existing check, so the gap predates this diff there — but this diff is precisely what newly exposes the *same* unbounded check on the **create** path too, doubling the number of caller-facing endpoints that accept an unbounded slug). The DB schema (`src/infra/db/schema.ts`) has no column-length constraint on `slug` either — SQLite `TEXT` is unbounded.

I confirmed two real consuming call sites, per the dispatcher's specific ask not to just assume:
- `src/server/http/site/render.ts:185`: `href="/${escapeHtml(post.slug)}"` in the public entry-list — properly HTML-escaped (no XSS), but the *length* of the slug directly inflates every visitor's HTML response.
- `src/seo/seo.ts:123`: `` `/${post.slug}` `` used as the canonical URL / presumably feeds `sitemap.xml` as well.

Both are safe against injection/traversal (the charset allowlist blocks `.`/`/`/quotes/control chars) but neither bounds length, so this is specifically a size/amplification gap, not an injection gap.

### Exploit Scenario

1. An authenticated `content.write` principal creates a post with `slug` = 500,000 characters of `"a-"` repeated (still matches `^[a-z0-9-]+$`).
2. `findBySlug` uniqueness check passes (first use), `save()` stores it via Drizzle's parameterized insert (no injection), the DB's `posts_workspace_slug_unique` index now carries a very large key.
3. Every unauthenticated visitor to the site's entry-listing/home page (`entryList()` in `render.ts`) and every `sitemap.xml` request now re-serializes that oversized slug into their HTML/XML response — one authenticated write, repeated read-side cost for every anonymous visitor thereafter.

### Mitigation

Add `slug.length <= 120` to `isValidSlugFormat` (or a sibling check applied identically in both `createPost`'s explicit-slug branch and `updatePost`), matching BR-03's documented bound; apply the same 200-char bound to `title` while touching this (see Finding 4).

### Verification Steps

1. `POST` a create request with a 121+ character slug matching the format regex; confirm `VALIDATION_ERROR` (400), not 201.
2. `PUT` update with the same; confirm parity (both endpoints must reject identically, since they share the helper).
3. Confirm a 120-char slug still succeeds (no regression at the boundary).

**Human Sign-Off Required:** No (Medium, tracked).

---

## Finding 3 (Low) — Reserved-slug validation (`admin`, `api`) required by BR-02/BR-03 is entirely unimplemented, for both the new explicit-slug path and the pre-existing derived-slug path

- **Change:** 2 (posts/pages create)
- **Component/Type:** Missing business-rule validation / defense-in-depth gap (not currently exploitable as a routing bypass)
- **Affected files:** `src/features/post/post.ts` (`createPost`'s explicit-slug branch, lines ~176-191; the derived-slug loop, same lines; `updatePost`, unchanged by this diff but sharing the same absence)

### Description

`behavior.spec.md` BR-03 step 3 requires: *"slug not reserved (`admin`, `api`) — a **provided** slug equal to a reserved word fails `VALIDATION_ERROR`; a **derived** slug equal to a reserved word is NOT a hard failure but is resolved by suffixing per BR-02"*, and `errors.spec.md` lists `"slug 'admin' is reserved"` as one of the documented `VALIDATION_ERROR` messages. I grepped the whole codebase for `"is reserved"`/`RESERVED_SLUG`/`reservedSlug` — no such check exists anywhere in `src/features/post/post.ts`, in `createPost`'s new explicit-slug path, or in the pre-existing `updatePost`/derived-slug loop.

**Confirmed not currently exploitable as a routing/security bypass**, because the public site router (`src/server/routes/site/pages.ts:148`) independently hardcodes the exclusion at the routing layer: `if (!slug.match(/^[a-z0-9-]+$/) || slug === "admin" || slug === "api") { next(); return; }`. So today, content saved with `slug: "admin"` simply becomes permanently unreachable at `/admin` (the request falls through to the real admin app instead) — a data-integrity/UX defect (dead, wasted content slot), not a security compromise. The headless content API (`src/server/routes/content/posts/get-by-slug.ts`) does **not** apply this exclusion at all (different, non-colliding URL namespace, so no issue there today).

The reason this is still worth tracking as a security finding rather than pure UX: the "admin"/"api" exclusion is currently enforced in exactly one place (`pages.ts`'s router), duplicated ad hoc rather than centralized in the validation layer the spec assigns it to. If that router-level guard is ever refactored, or a future site-serving mode/consumer of slugs doesn't replicate it, there is no remaining backstop — the intended defense-in-depth layer (reject at write-time) is the one actually missing.

### Exploit Scenario (latent — requires a future change to the routing guard to matter)

1. Today: an authenticated `content.write` principal creates a page with `slug: "admin"`. It saves successfully (no validation rejects it).
2. It is permanently unreachable via `/:slug` (falls through to the real `/admin` app) — wasted, confusing, but not a security event.
3. Latent risk: if a future refactor of `pages.ts`'s catch-all (or a new slug-consuming surface that doesn't know about this exclusion) removes/misses the hardcoded `"admin"`/`"api"` check, a stored `slug: "admin"` record would then become live and could shadow or race the real admin surface, depending on registration order — a scenario the spec's write-time validation exists specifically to prevent regardless of router-layer diligence.

### Mitigation

Add the reserved-word check the spec requires, in `src/features/post/post.ts`:
- `createPost`'s explicit-slug branch: reject `explicitSlug === "admin" || explicitSlug === "api"` with `PostValidationError` (matching the documented message).
- The derived-slug loop (both `createPost`'s auto-derivation and BR-02's suffix-search condition): treat a reserved-word match as an additional "already taken" condition alongside `findBySlug`, so `slug("Admin")` derives to `admin-2` rather than silently succeeding as `admin`.
- `updatePost`: same check (out of this diff's authored scope, but the shared-helper refactor this diff already did makes it a one-line addition to fix both call sites at once).

### Verification Steps

1. `POST` create with `slug: "admin"` (or `"api"`); confirm `VALIDATION_ERROR`, not 201.
2. `POST` create with `title: "Admin"` and no explicit slug; confirm the derived slug is NOT bare `"admin"` (should resolve to `admin-2` or fail `SLUG_CONFLICT` if the suffix space is otherwise exhausted).
3. Confirm `updatePost` rejects the same reserved values.

**Human Sign-Off Required:** No (Low, tracked).

---

## Finding 4 (Low / contextual) — `title` has no enforced max length (spec: 200 chars), unchanged by this diff but part of the same BR-03 contract it implements

- **Change:** 2 (posts/pages create)
- **Component/Type:** Missing input-validation bound
- **Affected files:** `src/features/post/post.ts:159` (`const title = input.title.trim() || "Untitled";`)

### Description

`behavior.spec.md` BR-03 step 1 requires title `≤ 200 chars`; `api.spec.md` §4 states `maxLength: 200`. `createPost` trims but never bounds length. This predates this diff (`title` was already caller-supplied before the fix), so it is not something this diff regressed — flagging it because this diff is the change that newly implements BR-03's validation ordering for `POST_CREATE`/`PAGE_CREATE` end-to-end, and the length bound is one more explicit line item of that same rule the diff otherwise closely followed (it implemented steps 2, 4, and 5 of BR-03 faithfully but not the length parts of steps 1-2). Same amplification framing as Finding 2 applies (title is rendered escaped, so no XSS, but is unbounded in stored size and appears in public HTML on every page view of that entry).

### Mitigation

Add `title.length <= 200` validation alongside the other BR-03 checks in `createPost` (and `updatePost`, which has the identical gap).

**Human Sign-Off Required:** No (Low, tracked).

---

## Verified sufficient / no finding (change 2) — worth stating explicitly since these were the dispatcher's named concerns

- **`bodyJson` prototype pollution:** Not a real risk here. `isJsonObject` is shallow but `bodyJson` arrives via Express's `express.json()` (`JSON.parse` under the hood), which creates `"__proto__"` as an ordinary own property, not a prototype link, in modern V8/Node — no downstream code path deep-merges or `Object.assign`s into a shared object using attacker-controlled keys (repo `save()` does `JSON.stringify(record.bodyJson)`, a pure serialize; `renderDocNode` only *reads* `node.type`/`node.attrs`/`node.content`). No pollution vector found.
- **`bodyJson`-driven stored XSS:** Not present. The actual HTML sink (`src/server/http/site/render.ts`) HTML-escapes all text content (`escapeHtml` in `renderMarks`) and allowlists link-mark `href` schemes via `safeHref` (`/`, `#`, `https?://`, `mailto:` only — blocks `javascript:`/`data:`). This defense is sink-side (correct placement per secure-input-handling's rule 8) and applies identically regardless of whether `bodyJson` arrived via create (new) or update (pre-existing) — this diff does not weaken or bypass it.
- **`status` enum bypass:** None. `isValidPostStatus` is a strict `=== "draft" || === "published"` check; `req.body.status` is forwarded unconverted (no `String()` coercion) but strict `===` doesn't coerce types, so any non-matching value (object, array, number, `null`, unexpected string) fails closed into `PostValidationError` → 400. Closed allowlist confirmed.
- **Slug format vs. injection/traversal:** Confirmed sufficient at both real call sites checked. `^[a-z0-9-]+$` blocks every character needed for path traversal (`.`, `/`), SQL metacharacters, or HTML/URL-scheme injection. `findBySlug` (`src/features/post/repo.sqlite.ts:45-52`) uses Drizzle's parameterized `eq()` — no SQL injection regardless of slug content. The public route (`pages.ts:148`) independently re-validates the same charset before ever doing a lookup, so even a hypothetically-corrupted stored slug can't reach an unvalidated code path there.
- **Slug uniqueness / TOCTOU:** The app-level `findBySlug`-then-`save()` sequence has a check-then-act race (two concurrent creates could both pass the check), but `posts_workspace_slug_unique` (`src/infra/db/schema.ts`) is a real DB-level unique index backstopping it — a raced duplicate insert fails at the DB, not silently corrupting state. This pattern is unchanged/pre-existing (identical to the long-standing auto-derived-slug loop and to `updatePost`), not introduced by this diff.

---

## Change 2 — Overall Threat Assessment

The core shape-mismatch fix itself is sound: validation happens before any repository write (fail-fast, no partial writes on bad input — confirmed by the new tests asserting nothing is stored on `PostValidationError`/`PostConflictError`), the dangerous sinks (HTML render, SQL query, public routing) are all independently defended regardless of what this diff newly allows into `bodyJson`/`slug`/`status`, and the enum/format checks that exist are closed allowlists with no observed bypass. Nothing here is exploitable pre-authentication, and nothing crosses a tenant/workspace boundary or an authorization boundary.

The gaps found (Findings 1-4) are all "the diff's own governing spec (SPEC-002) asked for more validation than was implemented" — a real-input-validation-completeness problem, not a broken trust boundary. The most consequential is Finding 1 (missing size cap): it's the one gap that lets an authenticated, moderately-trusted actor (whatever role holds bare `content.write`, not necessarily full admin) impose cost on unauthenticated third parties (every site visitor, via inflated render/response size) — worth fixing before this ships more broadly, though it does not block this specific release on Critical/High grounds. Findings 2-4 compound the same "unbounded field, rendered publicly" pattern at smaller scale. None require human sign-off under this skill's escalation rules (no Critical finding; no High finding touching auth/authz/data-exfiltration), but all four should be tracked and are straightforward, low-risk additions to fix (extending the exact validation helpers this diff already introduced/shared).

---

## Change 1 — Findings

## Finding 5 (Low / Informational) — `isInMemoryDbPath`'s `file:` URI parsing has a narrow, currently-unreachable divergence from SQLite's own URI-parameter resolution

- **Change:** 1 (snapshot-leak fix)
- **Component/Type:** Input-classification edge case (not attacker-reachable in the current architecture)
- **Affected files:** `src/features/plugins/snapshot.ts:37-48` (`isInMemoryDbPath`)

### Description

Dispatcher's question (a) asked whether a crafted `dbPath` could bypass the in-memory guard in either direction. I traced every call site of `declareDataModule`/`checkDiskHeadroom`/`snapshotDb` (`src/features/plugins/store/store-plugin.ts`, `src/newsletter/data-module-manifest.ts`, `src/comments/data-module-install.ts`) back to their `dbPath` origin: all resolve to the same single content-db path the composition root opens (`src/server/deps.ts:createSqliteRouteDeps`, defaulting to `process.env.TOVU_CONTENT_DB ?? "content.db"`). **`dbPath` is operator/environment-config-controlled, never derived from an HTTP request, plugin manifest, or any other untrusted input in this codebase.** This closes off the practical threat model for (a) almost entirely — there is no request path by which an external attacker supplies `dbPath`.

The two theoretical edge cases in the guard itself:
- A real on-disk file literally named `:memory:` (or `""`) being misclassified as in-memory: not actually a bypass, because `better-sqlite3`/SQLite's own C API treats the literal string `":memory:"` (and `""`) as its special anonymous-database identifiers unconditionally — there is no way to pass that literal string and have the underlying driver open a real file by that name instead. `isInMemoryDbPath` is *correctly mirroring the driver's own semantics*, not introducing a new interpretation.
- The `file:` URI branch's `mode` parameter resolution: `isInMemoryDbPath` uses `URLSearchParams.get("mode")`, which returns the *first* occurrence of a repeated query parameter. If SQLite's own URI parser resolves repeated `mode=` parameters differently (e.g., last-wins), a URI like `file:x?mode=rwc&mode=memory` could theoretically be classified differently by this guard than by the underlying SQLite engine actually opening the file. I did not find this pattern used anywhere in the codebase, and given `dbPath` is not attacker-controlled, this is not currently exploitable — flagging as informational/track-only in case `dbPath` ever becomes derived from a less-trusted source (e.g., a future per-tenant or plugin-supplied database path).

### Exploit Scenario

None currently constructible — requires both a non-standard `file:` URI with duplicate `mode` parameters *and* `dbPath` becoming attacker- or lower-trust-plugin-controlled, neither of which is true today (ADR-023's own §0 caveat already discloses that a Tier-3 in-process plugin opening the db file directly is an separate, pre-existing, already-tracked access-control gap, unrelated to this specific guard).

### Mitigation

No action required given current reachability. If `dbPath` is ever sourced from a less-trusted caller in the future, prefer deriving `isInMemoryDbPath`'s URI handling from the same parsing SQLite itself would perform (or reject URIs with duplicate query keys outright) rather than trusting `URLSearchParams`' first-wins convention to match SQLite's C-level parser.

### Verification Steps

1. Confirm (already true) that no HTTP route, plugin-registration path, or manifest field in this repo ever sets `dbPath` from request-supplied data — grep `dbPath` call sites on any future change to this list.
2. If ever changed: add a test asserting `isInMemoryDbPath`'s classification agrees with `better-sqlite3`'s actual behavior for a `file:` URI with duplicate `mode=` parameters.

**Human Sign-Off Required:** No (informational, not currently exploitable).

---

## Change 1 — Answering the dispatcher's two specific questions directly

**(a) Bypass of `isInMemoryDbPath`?** No practical bypass found. The two literal-string cases (`:memory:`, `""`) exactly mirror the underlying SQLite driver's own special-casing, so there's no divergence to exploit for those. The `file:` URI branch has one narrow, currently-unreachable theoretical divergence (Finding 5), moot because `dbPath` is not attacker-controlled anywhere in this codebase's current architecture (confirmed by tracing every call site back to server config).

**(b) Does skipping the journal for in-memory DBs create real-world risk?** No — genuinely inert, and correctly reasoned in the code's own comments. Verified independently: (1) `recoverIncompleteDataModuleMigrations` (`migration-recovery.ts`) opens its *own* fresh `new Database(dbPath)` connection for the boot-recovery scan — for `:memory:` this is an unrelated, brand-new anonymous database (SQLite gives every `:memory:` connection its own private store unless using a shared-cache URI), so it trivially finds zero incomplete journal entries and no-ops, exactly as before this diff; nothing in this diff changes that path's behavior. (2) The crash-recovery guarantee this journal exists to provide (§2/§4's "next boot") structurally cannot apply to an in-memory db regardless of whether a journal entry exists, because the entire database — table, journal, and all — vanishes with the process; "recoverable" and "not recoverable" are the same outcome. (3) The new tests (`data-module.test.ts`'s two new cases) directly exercise both the success and DDL-failure paths against a `:memory:` db and confirm same-process transaction rollback (§9, the only failure mode that can occur here) still fully protects data integrity with the journal skipped — good regression coverage, this is exactly the right test to have added. (4) Usage today is test-only (grepped the whole non-test codebase for `:memory:`/`mode=memory`/`cache=shared` — zero production call sites); even in a hypothetical future production use of an in-memory or shared-cache db, the same "no next boot exists" reasoning holds unconditionally, not just for the test-only case observed today.

## Change 1 — Overall Threat Assessment

This is a clean, well-scoped bug fix with no security regression. It removes a real (if non-security) bug — hundreds of MB of spurious `:memory:.snapshot-*` files written to the repo root/cwd on every test run — without weakening the never-brick crash-recovery guarantee for any case where that guarantee actually applies (real, on-disk `dbPath`s are completely untouched by this change; every existing snapshot/journal/headroom code path for a real file is unmodified). The one edge case surfaced (Finding 5) is theoretical and unreachable given `dbPath`'s actual origin in this codebase, and the reasoning in the code's own extensive comments about why skipping the journal is safe for `:memory:` holds up under independent verification, including against the boot-time recovery path the dispatcher didn't explicitly ask about but which I checked anyway. No finding in this change requires a code change before shipping.

---

## Summary Table

| # | Change | Severity | Finding | Human Sign-Off |
|---|--------|----------|---------|-----------------|
| 1 | 2 (post create) | Medium | Route-layer 1 MiB body-size cap / `PAYLOAD_TOO_LARGE` contract unimplemented | No |
| 2 | 2 (post create) | Medium | No slug length bound (spec: ≤120) — public-facing amplification via unauthenticated render/sitemap | No |
| 3 | 2 (post create) | Low | Reserved-slug (`admin`/`api`) validation entirely unimplemented (BR-02/BR-03) | No |
| 4 | 2 (post create) | Low | `title` has no enforced 200-char max (contextual, pre-existing) | No |
| 5 | 1 (snapshot fix) | Low/Info | Theoretical `file:` URI `mode=` precedence divergence — not attacker-reachable | No |

No Critical or High findings in either change.
