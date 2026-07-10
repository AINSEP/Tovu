# Redirects — Section Design (2026-07-10)

- Author: autonomous Opus 4.8 sweep agent (design-only; no peer debate, no external audit)
- Companion ADR: `../architecture/ADR-033-redirects.md` (PROPOSED)
- Typed interfaces: `src/redirects/types.ts`, `src/redirects/ports.ts` (compile clean vs repo)
- Brief: redirect rules layered over routing; 301/302 rules; wildcard/regex matching seam;
  auto-redirect on entry slug change; hit counts.

---

## 1. Competitor-lite orientation

I did not deep-mine competitor repos (design-only depth). One primary source read plus the
platform's own placement rule was enough to fix the design axis.

- **WordPress** (`wp-includes/rewrite-and-routing.md`, read). Core routing is a two-phase
  front controller: an ordered array of **regex rewrite rules** compiled from permalink
  structures maps a path → query vars, then `WP_Query` runs and the template loader picks a
  template. Crucially, **core handles only *canonical* redirects** (`redirect_canonical` — trailing
  slash, case, old `?p=N` → pretty). **Arbitrary manual redirects live in the userland
  *Redirection* plugin**, which keeps its own `wp_redirection_items` + `wp_redirection_logs`
  tables, supports exact/regex source matching, 301/302/307, and per-rule hit logs with
  timestamps. The lesson taken: the regex-array-scanned-top-to-bottom model is the ReDoS/perf
  hazard Tovu must not import wholesale — hence the **bounded matcher + exact/prefix-first
  indexing** in ADR-033 §3. The lesson rejected: modelling manual redirects as an *optional
  plugin*, because Tovu treats never-break-links as core data integrity (§2 below).
- **Directus / Ghost / Shopify** (not mined). Directus has no first-class redirect subsystem
  (route-level, handled at the app/proxy). Ghost ships a **`redirects.yaml`/`.json`** file loaded
  at boot — declarative, flat, from→to + permanent flag, matched in order, no DB, no hit counts.
  Shopify exposes **URL Redirects** as a first-class store resource (`path` → `target`, admin +
  API + bulk CSV import) precisely because storefront migrations are constant — the strongest
  external vote that redirects belong in the *product core*, not a plugin.

**Takeaway.** The market splits on placement (WP = plugin, Shopify = core resource) but agrees on
the shape: from-pattern → target + a permanent/temporary flag, ordered matching, optional hit
logging, and — the piece everyone under-serves — **automatic** redirects when a URL changes.
Tovu's opportunity is to make that automatic capture a *guarantee*, which forces the core placement
and the in-transaction capture below.

## 2. Tier rationale (§3.5)

**Decision: Tier-2 core library `redirects`.** Full reasoning in ADR-033 §1. In brief, the §3.5
rule ("≥80% of sites need it AND plugins build on it; when in doubt start as a bundled plugin,
demotion is a breaking change") resolves to Tier-2 because the subsystem touches **two core seams a
Tier-3 plugin can only reach after-commit**:

1. the **routing** resolution chain (hot-path interception before 404), and
2. the **content write transaction** (mint a redirect atomically with a slug change).

An after-commit plugin hook leaves a window where the renamed URL 404s before the redirect
exists — fatal to a never-break-links *guarantee*. The guarantee is the differentiator (§1), so the
machinery is core. The honest doubt (WP proves manual rules *can* be a plugin) is preserved as
ADR-033 Open Q-3: the resolver/storage/auto-capture are core regardless; only the manual-CRUD
*screen* is a candidate for later re-homing, and demoting the never-break parts would be the
breaking change the placement rule warns against.

## 3. The design in prose

A **redirect rule** is a small, audited config row — `from` pattern, `to` target, a 301/302/307/308
status, a match type, an on/off status, an `override` flag, and provenance (manual / auto /
import). Rules live in **three core-owned tables in the site's `content.db`** (they travel with the
install-dir, ADR-012), **not** in `entries`: redirects are routing infrastructure, and — decisively
— **hit counts are high-write telemetry that would generate an editorial revision on every request
if they rode the content model.** So redirects reuse ADR-022's *discipline* (single write
chokepoint, append-only `redirect_revisions`, ULIDs, write-time validation, CI canary) on dedicated
tables — the identical call ADR-028 (settings) and ADR-027 (media sidecars) made — and split the
telemetry into a non-revisioned `redirect_hits` sidecar that *explicitly narrows* ADR-022 INV-3.

**Resolution** runs inside the routing chain, twice: a `pre_content` pass where only `override`
rules fire (retire a live URL), and the default `post_content` **404-fill** pass. Because live
content wins by default, reusing an old slug for new content silently reclaims it — the stale auto
rule just stops matching. **Matching is exact/prefix-first and index-backed (O(1) / longest-prefix);
only on a miss does the resolver touch the bounded "dynamic" set** of wildcard + regex rules,
evaluated in a fixed order through a **total, bounded-cost matcher** (linear-time / RE2, anchored,
per-request cap). That boundedness is not a nicety — ADR-022's amendment designates any hot-path
expression evaluator a *trust-boundary primitive*, because an unbounded regex a rule-author can
type is a ReDoS DoS. Patterns are validated *at write time*, so nothing unsafe ever reaches the hot
path, and **raw regex authoring is gated behind `redirects.use_regex` (default-deny)** — wildcard
covers the common "move a section" case without it.

**Auto-redirect on slug change** is the correctness centerpiece. When an entry's routable path
changes, core mints an `exact`, `auto_slug_change` rule old→new. To guarantee *no request ever sees
the moved entry without its redirect*, capture is **synchronous, in the same content write
transaction** as the rename — via a core-only, in-transaction extension point on the content
chokepoint that `redirects` attaches to (keeping `content` decoupled from `redirects`). Rules are
**collapsed to one hop at write time** (A→B then B→C stored as A→C) and **cycles rejected**, so the
request path is loop-proof and never chases chains.

**Hit counts** never touch the response hot path: the resolver emits a `redirect.hit` outbox event
(ADR-009 async lane), and an idempotent handler folds it into `redirect_hits`. A dropped increment
loses a statistic, never a redirect. **Extensibility** is one sync `redirect.resolve` filter hook
(i18n/SEO/conditional-redirects build on it) plus three notification events — no hook soup.

## 4. Alternatives considered

| # | Alternative | Why rejected |
|---|---|---|
| A1 | **Tier-3 bundled plugin** (WP *Redirection* model) | Can't reach the content tx or routing chain except after-commit → 404 window → breaks the never-break *guarantee* that justifies the feature (ADR-033 §1). Kept as the honest doubt in Open Q-3. |
| A2 | **Redirects as `entries`** (seeded content-type, ADR-022) | Hit-count writes → a revision per request (INV-3 violation); high-write telemetry on the content chokepoint; no editorial body/taxonomy to justify it. The ADR-027 media-sidecar precedent says operational state gets core-owned sidecars. |
| A3 | **Own tables via ADR-023 plugin core-mediated path** | ADR-023 is for *plugins*. `redirects` is a core library; it owns core tables directly (like `principals`, `setting_values`). Routing ADR-023 through it would be miscategorization + needless capability gating. |
| A4 | **`RedirectMatcherPort` / `RedirectHitSinkPort` as ADR-006 ports now** | Rule-of-two fails: plausible second adapters exist (edge/CDN compiler; external analytics) but **none is being built now** → speculative abstraction ADR-006 forbids. Stay internal seams; promote on first real second adapter (named trigger in §8). |
| A5 | **Async (outbox) auto-redirect capture** | After-commit → the exact 404 window the guarantee forbids. Rejected for *sync in-tx* capture (ADR-033 §5); the async event is kept only for downstream notification. |
| A6 | **Backtracking regex, WP-style top-to-bottom scan** | ReDoS trust hazard (ADR-022 amendment) + O(n) hot-path scan. Rejected for exact/prefix indexing + a bounded dynamic seam + write-time validation. |
| A7 | **Chase redirect chains at request time** | A→B→C latency + loop risk. Rejected for write-time one-hop collapse + cycle rejection (loop-proof by construction). |
| A8 | **Ghost-style flat `redirects.yaml` file** | No hit counts, no per-rule audit/attribution, no auto-capture, no workspace scoping, poor AI/admin ergonomics. Good for portability only; the export format can *emit* this shape, but the source of truth is the audited tables. |

## 5. Implementation proposal

### 5.1 Phasing

- **Phase R0 — types + seams (this PR).** `src/redirects/types.ts` + `src/redirects/ports.ts`
  (interfaces only, compiling). No behavior. Lands the vocabulary the routing + content ADRs
  need to reference.
- **Phase R1 — storage + CRUD chokepoint.** `redirects` + `redirect_revisions` tables (Drizzle);
  `InMemoryRedirectRepo` + `DrizzleRedirectRepo`; `createRedirect`/`updateRedirect`/
  `tombstoneRedirect`/`listRedirects` commands with write-time normalization, `validatePattern`,
  open-redirect allowlist check, one-hop collapse + cycle rejection; revision-in-same-tx + CI
  canary. Admin routes under `src/server/routes/admin/redirects/*`.
- **Phase R2 — resolution.** `RedirectResolver` + bounded `RedirectMatcher` (exact/prefix index
  probes → capped dynamic scan); wire into the request pipeline as a provisional pre-routing
  middleware **pending the routing ADR** (Open Q-1) — isolated so the real chain registration is
  a one-file swap.
- **Phase R3 — auto-capture on slug change.** Consume the content chokepoint's in-tx
  `onEntrySlugChange` extension point (Open Q-2) → `captureSlugChange`. Gated on that seam
  existing; until then, a temporary post-commit subscriber with a documented 404-window caveat.
- **Phase R4 — hit counts + hook + AI/export.** `redirect.hit` event + idempotent
  `RedirectHitSink` handler + `redirect_hits`; `redirect.resolve` filter hook; AI tools;
  import/export (batched through the chokepoint).

### 5.2 `src/` modules to add

```
src/redirects/
  types.ts            # DONE (this PR) — records, revisions, hit stats, resolution, commands
  ports.ts            # DONE (this PR) — RedirectRepoPort (port) + matcher/hit-sink/resolver seams + events/hook
  redirects.ts        # R1 — create/update/tombstone/list command handlers (chokepoint + validation + collapse)
  resolver.ts         # R2 — RedirectResolver impl (two-phase, precedence, hook invocation)
  matcher.ts          # R2 — bounded RedirectMatcher (exact/prefix/wildcard/regex, validatePattern)
  capture.ts          # R3 — captureSlugChange (in-tx auto-redirect)
  hits.ts             # R4 — RedirectHitSink + redirect.hit handler
  repo.memory.ts      # R1 — InMemoryRedirectRepo
  repo.sqlite.ts      # R1 — DrizzleRedirectRepo
  index.ts            # public surface (ADR-009 §1 — index.ts is the boundary)
  INFO.md
  __tests__/ __specs__/
src/server/routes/admin/redirects/{list,create,update,delete}.ts   # R1/R4
src/infra/db/schema.ts   # EXTEND (not this PR): redirects, redirect_revisions, redirect_hits tables + indexes
```

### 5.3 Schema / DDL sketch (Drizzle → SQLite; ports to PG)

```
redirects(
  id TEXT NOT NULL,                 -- ULID
  workspace_id TEXT NOT NULL,
  match_type TEXT NOT NULL,         -- exact|prefix|wildcard|regex
  from_pattern TEXT NOT NULL,       -- normalized
  to_target TEXT NOT NULL,          -- site-relative path or allowlisted absolute URL
  status_code INTEGER NOT NULL,     -- 301|302|307|308
  status TEXT NOT NULL,             -- active|disabled
  override INTEGER NOT NULL,        -- 0|1
  priority INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,             -- manual|auto_slug_change|import
  source_entry_id TEXT,             -- auto provenance
  from_path_at_capture TEXT,
  to_path_at_capture TEXT,
  created_by_principal TEXT NOT NULL,
  created_by_plugin_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, id)                                   -- composite (ADR-021 §4)
);
CREATE UNIQUE INDEX ux_redirects_exact
  ON redirects(workspace_id, from_pattern) WHERE match_type='exact' AND status='active';   -- ADR-022 partial-index mechanism
CREATE INDEX ix_redirects_prefix
  ON redirects(workspace_id, from_pattern) WHERE match_type='prefix' AND status='active';   -- longest-prefix range scan
CREATE INDEX ix_redirects_dynamic
  ON redirects(workspace_id, priority DESC, created_at)
  WHERE match_type IN ('wildcard','regex') AND status='active';                             -- ordered dynamic set

redirect_revisions(                                                -- append-only ledger (ADR-022 §4b)
  redirect_id TEXT NOT NULL, workspace_id TEXT NOT NULL, seq INTEGER NOT NULL,
  state_json TEXT NOT NULL, tombstoned INTEGER NOT NULL,
  actor_id TEXT NOT NULL, plugin_id TEXT, recorded_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, redirect_id, seq),
  FOREIGN KEY (workspace_id, redirect_id) REFERENCES redirects(workspace_id, id)
);

redirect_hits(                                                     -- operational sidecar (narrows INV-3)
  redirect_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0, last_hit_at TEXT,
  PRIMARY KEY (workspace_id, redirect_id),
  FOREIGN KEY (workspace_id, redirect_id) REFERENCES redirects(workspace_id, id)
);
```

### 5.4 Permission strings (ADR-021)

`redirects.read` · `redirects.create` · `redirects.update` · `redirects.delete` ·
`redirects.manage` (bulk / import-export / reorder / set `override` / off-site target) ·
`redirects.use_regex` (gated, default-deny). Registered in the code-side catalog; the four seed
roles bundle them; `owner`'s `*` covers them dynamically.

### 5.5 Hooks / events (ADR-009)

- **Sync filter hook (lane 3):** `redirect.resolve` (`RedirectResolveHook`) — transform/short-circuit
  a resolution; the home of deferred conditional redirects.
- **Outbox events (lane 2):** `redirect.created` / `redirect.updated` / `redirect.tombstoned`
  (notification); `redirect.hit` (drives async counting).
- **Consumed in-tx extension point (lane 1/3, content-owned):** `onEntrySlugChange` → `captureSlugChange`.

### 5.6 v1 scope cut + named deferred seams

**IN:** exact/prefix/wildcard rules; 301/302/307/308; manual CRUD + admin + AI; in-tx auto-capture;
one-hop collapse + loop rejection; `override`; async aggregate hits; import/export; open-redirect
allowlist. **DEFERRED (seam named):** raw `regex` (seam: `matchType:'regex'` + `redirects.use_regex`,
needs bounded engine) · edge/CDN compilation (seam: promotes `RedirectMatcher` to an ADR-006 port) ·
per-hit timeseries (seam: `redirect.hit` event stream) · conditional redirects (seam: `redirect.resolve`
hook) · query-string matching (v1 = path only).

## 6. Top open questions for the human audit

1. **Q-1 — routing resolver-chain contract** is owed by the (nonexistent) routing ADR; §4 of the
   ADR is provisional until then.
2. **Q-2 — in-transaction, core-only slug-change extension point** on the content chokepoint: new
   hook class vs typed call vs chokepoint capability? The atomic-capture guarantee needs it.
3. **Q-3 — tier boundary**: is Tier-2-whole correct, or should the manual-CRUD *screen* be a Tier-3
   client over a core resolver/store?
4. **Q-4 — dynamic-set cap** value + over-cap policy (reject vs evict).
5. **Q-5 — 307/308 admin exposure** before a non-GET routable surface exists.

> Process caveat: **design-only, single agent, no debate, no audit.** Written to ADR-027/022 depth
> as a quality bar, but it has NOT cleared the debate→audit gate. Owes a tier-call + Q-1/Q-2 debate
> and an audit of the never-break atomicity (§5), matcher totality (§3), and open-redirect (§7)
> claims before ACCEPTED.
