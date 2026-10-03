# Deploy content & media inventory — what travels, what does not (2026-09-18)

Read-only investigation. Nothing was built, deployed, pushed, seeded, exported, or migrated. The
only write is this file. The live `content.db` was never opened in place — it and its WAL/shm
sidecars were copied to the session scratchpad and every query ran against the copy.

**One-line answer:** content does not travel with a deploy, and this is three separate holes, not
one — (1) the live `content.db` is gitignored so only a manually-regenerated `content.seed.db`
ever ships, (2) that seed is applied on a volume's **first boot only**, so a redeploy to an
existing volume is a guaranteed no-op for content, and (3) the seed's media rows currently
out-number the committed media bytes 26-to-10, so even a fresh volume gets 16 media records with
no files.

**The owner's own question — "is having the content.db the best way? how to handle actually
updating the content?" — is answered in its own section below (§h), before the inventory detail.
Their follow-up — "is there a way to merge content.db or is overwriting the best way?" — is §i.**

---

## (i) MERGE, OVERWRITE, OR NEITHER — a straight answer

**Verdict up front: neither. Do not move `content.db` — in either direction, by either method.**
A merge is not supportable on this schema today, and a whole-file overwrite is disqualified by what
shares the file. Move authored content **per entity, over the existing admin API**, and adopt a
one-way rule (§i.5) so the conflict question mostly stops arising.

### i.1 Is a merge technically possible? — schema facts, not SQLite theory

**Keys: mostly good, two real exceptions.** Every content *entity* uses a stable `TEXT` id — `posts`,
`entries`, `content_types`, `taxonomies`, `terms`, `menus`, `redirects`, `form_definitions`,
`media`, `asset_blobs`, `asset_renditions`. No collision risk. But two **authored join tables are
`INTEGER` AUTOINCREMENT**: `entry_refs` (sequence at 87) and `entry_terms` (at 2) — as is every
`*_revisions` table. Those ids collide between instances by construction. They are derivable join
rows, so the answer is re-derive, not merge; but a "just copy the tables" merge hits them.

**Timestamps: not trustworthy as an ordering key.** `updated_at` is absent entirely from
`content_types`, `asset_blobs`, `asset_renditions`, `entry_refs`, `entry_terms`, and
`nav_location_bindings`. Where it exists it is written from **`deps.clock.nowIso()` — the writing
machine's own clock** (`features/post/post.ts:861,1038`). Local and production are different
machines with different clocks. **So "last write wins by timestamp" is neither uniformly
implementable nor correct where it is implementable.**

**Versions: trustworthy, but they answer a different question.** `version INTEGER` exists on
`posts`, `entries`, `content_types`, `taxonomies`, `terms`, `menus`, `redirects`, `media`,
`asset_renditions`. It starts at 1 and is `existing.version + 1` on **every** write, including a
trash (`post.ts:477,486`). That reliably answers *"has this row diverged since I last saw it?"* It
does **not** answer *"whose edit is newer."* Everything about the design follows from that
distinction.

**Nearest prior art, and it deliberately does not merge.** `importRedirects`
(`features/redirects/redirects.ts:561-594`) pushes each rule through `createRedirect`
individually; a duplicate **fails that item**, the batch continues, and the route always answers
**`207 Multi-Status`** with `created[]` and `failed[]`
(`routes/redirects/import.ts:10-13,53`). That is create-only with an explicit failure list — the
shape to copy. Elsewhere, `onConflictDoUpdate` appears only for **singleton/config** rows (nav
bindings, credentials, webhooks, oauth) — never for a content entity. The `*_revisions` tables are
append-only audit logs that `seed-site.mjs` drops; they are not a merge basis.

**What breaks a naive row-by-row merge**

- **Unique constraints, all scoped to a workspace id that is IDENTICAL on both sides
  (`workspace-local`):** `posts(workspace_id, slug)`, `entries(workspace_id, type, slug)`,
  `menus(workspace_id, slug)`, `media(workspace_id, slug)`,
  `form_definitions(workspace_id, slug)`, `content_types(workspace_id, key)`,
  `nav_location_bindings(workspace_id, location_key)`,
  `widget_region_bindings(workspace_id, region_key)`. Two different ids with the same slug is a
  guaranteed constraint violation — which at least **fails loud** rather than silently picking one.
- **Soft-deleted slugs are invisible landmines.** 112 soft-deleted posts locally still hold their
  slugs; a merge can violate uniqueness against a row nobody can see in the UI.
- **Ordering has no correct merge.** Menus and nav bindings encode an order; two orderings cannot be
  combined.
- **Derived state must be rebuilt, not copied:** `post_search_*` (FTS5), and `transform_registry` —
  if that ends up empty every public `/m/…` media URL 404s (a known separate gap).
- **The one clean case:** `asset_blobs` is `UNIQUE(workspace_id, sha256)` and content-addressed, so
  **blob rows and blob bytes merge idempotently by construction.** Media is the *easy* half of a
  merge, not the hard half — provided the transport carries bytes at all.

### i.2 What a merge would silently get WRONG

1. **Deletions — the killer, and it is worse than the general case.** `posts` is the **only**
   authored table with a `deleted_at` column. `entries`, `menus`, `redirects`, `media`, `terms`,
   `taxonomies`, `form_definitions` all **hard-delete**. There is no tombstone to consult, so
   "present locally, absent in prod" is indistinguishable from "deleted in prod" — and any merge
   that treats it as an insert **resurrects content the owner deleted on the live site.** Silently.
2. **Edited in both places.** The `expectedVersion` guard is **opt-in**: `assertExpectedVersion`
   returns early when it is `undefined` (`post.ts:949-951`). A client that omits it does an
   unconditional save and overwrites prod's edit with no warning.
3. **Draft locally, published in prod.** `status` is one column on the same row. Copying the row
   unpublishes a live page. Nothing in the merge can tell that apart from an intentional unpublish.
4. **Media rows without bytes.** Rows merge cleanly; bytes only travel if the transport carries
   them. This is the confirmed §c failure, re-entering through the merge door.
5. **Autosave and pins.** `posts.autosave_json` holds an in-progress local draft; `template_choice`
   and `overrides_theme_page` are per-row presentation pins. All would travel as ordinary columns.

### i.3 Honest verdict

**Merge: no.** Not on this schema, not today. Three independent blockers — no tombstones outside
`posts`, no trustworthy cross-machine ordering key, and integer join keys — and no prior art to
build on (the one importer in the codebase deliberately refuses to merge).

**Whole-file overwrite: no, disqualified.** See §i.4.

**Neither — move authored content in a different unit: yes.** Per entity, over the admin API,
create-or-update with `expectedVersion`, answering with an explicit conflict list. That is the
`importRedirects` `207 created[]/failed[]` shape extended with the `409 VERSION_CONFLICT` guard
`posts` already ships. Nothing about it requires a schema migration.

### i.4 If overwrite anyway — overwrite WHAT, and what dies?

**Whole file: disqualified outright.** Because authored and operational state share the file
(§h.1), overwriting `content.db` destroys, on a live site: `sessions` (everyone logged out),
`form_submissions` (real inbound messages), newsletter subscribers, comments, orders, analytics,
webhook deliveries, `agent_tool_attempts`/`outbox_events` history, **prod's own `identity_users`,
`principals` and `api_keys`** (operators locked out of their own site), and prod's sealed
credentials — replaced by ciphertext that cannot decrypt under prod's root key. No undo.

**Authored tables only: survivable, and it is essentially `PRUNE_TABLES` inverted.** Mechanically it
needs FK-ordered delete-then-insert inside one transaction, an FTS rebuild, `transform_registry`
preserved, and blob bytes shipped alongside. Semantically it means **"production is a replica"** —
anything authored in the prod admin is gone on the next publish. That is a legitimate rule, but it
must be stated to the owner as a rule, not discovered.

### i.5 The middle path — and it is the honest cheapest answer

**One-way publish, with production read-only for authored content.** Then merge never arises and
"authored-tables overwrite" becomes safe rather than lossy.

What has to be true: nobody authors content in the production admin. That can be a rule the owner
keeps, or enforced — a runtime flag that makes content-write routes `403` in production. Note the
enforcement is not free: the admin already writes live settings on ordinary clicks (provider/mode
chips autosave), so "read-only" has to mean *content*, deliberately, not *everything*.

What it costs the owner: no quick fix on the live site. Every correction is authored locally and
published. For a single-author site that is a small cost, and it deletes the entire conflict class.

### i.6 Direction of travel

Their case is **local → prod**, and that is the direction authored content should move — one way.

**prod → local is also needed, but for different tables and never as a merge.** The operational
tables only ever exist in production: form submissions, newsletter subscribers, comments, orders,
analytics, sessions. Those must never be overwritten by a push, and the only reason to bring them
back is **backup**, not merge.

That asymmetry is what makes one-way publish coherent rather than a limitation: **authored content
flows local → prod; operational data flows prod → backup; nothing flows both ways.** Any design
that tries to make one mechanism bidirectional inherits every problem in §i.2 for no benefit.

### i.7 One concrete gap this surfaced for the API-push option

`POST /api/admin/v1/workspaces/:id/posts` **generates the id server-side**
(`routes/posts/create.ts:73` — `const postId = deps.idGen.newId()`) and does not accept a
caller-supplied id. So a push cannot preserve ids today. Two ways out, both small: match on
`(workspace_id, slug)` — which is the unique key anyway and is arguably the better join key across
instances — or add an optional caller-supplied id to the create route. The route already honours an
`Idempotency-Key` header, so repeated pushes do not duplicate.

### i.8 Recommendation and cheapest reversible first step

**Recommend:** one-way publish; production read-only for authored content; per-entity transport over
the existing admin API with `expectedVersion` and an explicit conflict list. Not a DB merge, not a
file overwrite.

**Cheapest reversible first step (unchanged, now sharper): the read-only content diff.** It is also
the only honest way to answer "would a merge have been fine?" — it shows whether prod has authored
content at all. Alongside it, adopting the read-only-prod rule costs nothing and is reversible by
saying so.

### i.9 Unverified for this section

- **Whether production currently holds any authored content** — the decisive input to §i.5, and it
  needs a read of the live site, which this dispatch forbids.
- **Whether `expectedVersion` is enforced beyond `posts`.** Confirmed on `posts`; `entries`,
  `menus`, `taxonomy`, `redirects`, `form_definitions` unchecked. Assume posts-only.
- **Whether the other authored entities' create routes accept caller-supplied ids.** Checked
  `posts` only (they do not).
- I did **not** prototype a merge, per the dispatch. Every claim above is read from the schema, the
  route files, and `features/post/post.ts`.

---

## (h) THE OWNER'S QUESTION: is `content.db` the right unit, and what is the update story?

Short answer, then the evidence:

- **"Ship the content.db" can never be the answer, and the codebase already knows this.** Authored
  work and production's own operational state live in the same 104-table file. Shipping it would
  destroy prod's sessions, form submissions, orders, analytics, its admin user, and its
  credentials. `seed-site.mjs`'s `PRUNE_TABLES` is already an owner-reviewed classification of
  exactly which tables must not travel — it exists because this question was already half-answered
  in 2026-08-31.
- **The right unit is not "a file" but "the authored subset, per entity, with versions."** The
  schema already supports this: stable ids, a `posts.version` integer, and a shipped
  `409 VERSION_CONFLICT` path.
- **The update story should be decoupled from deploy entirely.** That is not a new opinion — it is
  what `deployment-constraints.md:171-172` already ruled ("the panel's real subject is provisioning
  and upgrading an instance, not publishing content").

### h.1 What `content.db` actually holds — 104 tables, classified

Counts are live rows in `sites/tovu-com/content.db` today (read-only scratch copy).

**AUTHORED — the user's work; should travel** (≈20 tables)

`posts` 166 · `entries` 17 · `entry_refs` 17 · `entry_terms` 2 · `content_types` 2 ·
`taxonomies` 3 · `terms` 2 · `menus` 6 · `nav_location_bindings` 2 ·
`widget_region_bindings` 2 · `redirects` 2 · `form_definitions` 5 ·
`presentation_settings` 1 (active theme = `basic`) · `media` 23 · `asset_blobs` 29 ·
`asset_renditions` 34 · `commerce_products`/`commerce_prices`/`commerce_product_images` 0 ·
`p_store__products` 3 · `p_newsletter__lists` 1 · `newsletter_campaigns` 0

**OPERATIONAL — production's own; must never be overwritten** (≈30 tables)

`sessions` 838 · `agent_tool_attempts` 3476 · `outbox_events` 872 · `form_submissions` 14 ·
`identity_users` 4 · `principals` 7 · `principal_roles` 3 · `principal_policies` 1 ·
`gated_mutation_tokens` 3 · `database_write_watermark` 1 · `origin_settings` 1 ·
`analytics_events`/`redirect_hits`/`webhook_deliveries`/`webhook_subscriptions`/`publish_history`/
`releases`/`deployment_environments`/`deployment_targets`/`deployment_runs`/`deployment_run_events`/
`commerce_orders`/`commerce_order_items`/`commerce_webhook_events`/`p_store__orders`/
`p_comments__comments`/`p_comments__moderation_log`/`p_newsletter__subscriptions`/`p_newsletter__sends`/
`p_newsletter__confirmation_tokens`/`p_newsletter__audience_snapshots`/`members`/`member_*`/`oauth_*` 0

**SECRETS — operational, and actively unsafe to ship** (11 tables)

`admin_execution_credentials` 1 · `site_assistant_credentials` 1 · `publish_credential_sets` 1 ·
`external_mcp_servers` 2 · `composio_config` 1 · `custom_credential_sets` 3 · `api_keys` 1 ·
`composio_connector_credentials`/`vendor_credential_sets`/`media_provider_credentials`/
`source_control_credential_sets` 0. Sealed against a **per-environment** root key, so even shipping
them yields ciphertext that fails at use time.

**DERIVED — rebuildable; should NOT travel** (9 tables)

`post_search_document` 166 · `post_search_fts*` (fts5 index; note this sqlite3 build cannot even
open it) · `transform_registry` 1 · `setting_definitions` 47 · `__drizzle_migrations` 65 ·
`_plugin_identity` 3 / `_plugin_migrations` 12 / `_plugin_migration_journal` 3 · `sqlite_sequence` 10 ·
`site_title_preexisting_workspaces` 1 (a migration marker `seed-site.mjs` already resets)

**HISTORY / UNDO — drop** (8 tables, 1459 rows)

`setting_revisions` 898 · `change_sets` 476 + `change_set_items` 476 · `entry_revisions` 62 ·
`taxonomy_revisions` 18 · `redirect_revisions` 3 · `content_type_revisions` 2 ·
`member_revisions`/`newsletter_campaign_revisions` 0

**MIXED / AMBIGUOUS — these four ARE the design decision**

1. **`setting_values_workspace` (18 rows)** — the worst offender. In one UUID-keyed table it holds
   authored site config (site title `"Tovu Demo Site"`, `robots.txt` rules, the SEO title template
   `"%s"`) *and* environment config (AI provider `"google-gemini"`, model `"gemini-3.6-flash"`,
   execution mode `"local-cli"`, agent `"claude"`, a media-provider pointer). No column separates
   them. Any bundle format has to decide per-setting, and the table gives it nothing to decide with.
   **This is the single most concrete piece of work any content-transport design has to do first.**
2. **Authorization** — `roles` 4, `policies` 5, `policy_permissions` 57, `role_policies` 4 are
   config the author shapes; `principals` 7, `principal_roles` 3, `principal_policies` 1 are
   production's actual people. Same subsystem, opposite classification.
3. **`plugin_activations` (1)** — authored intent ("this plugin is on"), but meaningless unless the
   plugin is installed in the target environment.
4. **`workspaces` (1)** — identity, not content. Both sides already hold the same row id
   (`workspace-local`), which is what makes a per-entity merge feasible at all.

**The structural fact that makes options 2 and 4 viable:** ids are stable constants, not
per-environment. `workspace-local` is identical on both sides, and even the starter template's
entries carry fixed ids (`post-home`, …). A merge therefore has real join keys; it does not have to
guess by slug.

### h.2 The hard problem: two writers

Once a site is live, the same page can be edited locally and in production. Today's de facto answer
is **"local silently never wins"** — that is the bug, not a policy.

Any real answer must pick one of three, explicitly:

- **(a) local authoritative** — a push overwrites prod. Loses whatever was authored on the server.
- **(b) prod authoritative** — local is a staging area you can only pull from. Loses nothing, but
  makes local authoring pointless once deployed.
- **(c) per-entity version compare, explicit conflict list** — the only one that cannot silently
  lose work.

**(c) is already half-built and shipped.** `PUT /api/admin/v1/workspaces/:id/posts/:postId` accepts
`expectedVersion` and returns **`409 VERSION_CONFLICT`** with a `versionConflictEnvelope`
(`routes/posts/update.ts:49,77-80,106-108`; rule owned by `features/post/expected-version.ts`).
The admin editor already surfaces this to a human ("version 3 … autosaving has paused … were NOT
saved", `PostEditor.unit.test.tsx:1332-1335`). **Tovu already has a two-writer story for one
instance; the cross-instance case is the same mechanism with a different transport.** Any design
that invents a second conflict model instead of extending this one is adding a third render-path-
class divergence.

### h.3 The options, with honest costs

**A. Ship the whole `content.db` file — REJECT.**
Cost: near zero to build. What it destroys: 838 sessions (everyone logged out), 14 form
submissions, every order/analytics/webhook row, prod's `identity_users` and `api_keys` (operators
locked out of their own site), and prod's sealed credentials replaced by ciphertext that cannot
decrypt under prod's root key. Two writers: last-writer-wins at *file* granularity — the most
destructive possible resolution. Can lose authored data: yes, catastrophically and with no undo.
Given §h.1 this is not survivable, and `PRUNE_TABLES` exists precisely because someone already
reached this conclusion.

**B. Export/import an authored-content bundle.**
*What already exists, and it is more than expected:*
- `seed-site.mjs` is ~80% of the **export** half — the prune list (the classification), the VACUUM,
  the PII scrub, and a blob-integrity check.
- `content/templates/starter/seed-content.json` (49 KB: `workspace`, 9 `entries`,
  `presentation`) + `readTemplate()` (`platform/site-dir/read-template.ts`) + `seedContentDb()`
  (`platform/db/sqlite/content-db.ts:138-162`) is a **working, git-native, file-based content
  bundle format with a working importer**, plus a CI drift gate (`check:seed-content-drift` →
  `development/scripts/generate-seed-content.ts --check`).

*What is missing:* the importer runs **only at site creation** and is guarded by workspace-slug
existence (`content-db.ts:146-149` — `if (existing.length > 0) return;`), so it can never merge
into a live site; and it covers 3 of ~20 authored tables (workspace, posts, presentation) — no
entries, menus, taxonomy, media, forms, or redirects. And it carries no bytes.
Cost: medium. No schema migration. Two writers: undefined today — you would have to build (c).
Can lose data: only if you build it as a replace rather than a merge.

**C. Content as files in the repo, DB as derived cache.**
The precedent exists (B's `seed-content.json` + drift gate), but making files the *source of truth*
is a different scale of change: the admin writes through SQLite repos; `posts` carries `bodyJson`
(TipTap doc), `bodyHtml`, `autosave_json`, `version`, `seo_ext_json`, `member_access_json`,
`template_choice`; the FTS index, the revision tables, and the gated-mutation flow all hang off the
db. You would need either a writeback (admin save → file → db, with the drift gate as the guard) or
to accept that **production's admin becomes read-only for content** — which fights the product's
own positioning ("run and operate it by talking to it"). Two writers: genuinely solved, by git, but
only by routing one side's edits through git. Cost: large. Needs a migration and a source-of-truth
ruling.
My read: this is a legitimate strategic direction and a bad way to fix this bug. Do not couple them.

**D. API/sync push from local admin to the live site — the substrate is already shipped.**
`/api/admin/v1/workspaces/:workspaceId/posts` has GET/POST/PUT/DELETE; media has
`POST …/media` (upload), `GET …/media/:id/original` (bytes out), list, trash, delete; auth already
supports **API keys** (`authenticateApiKey`, `apiKeyRepo`, `api_keys` table) alongside session
cookies. Decoupled from deploy, which is what the existing ruling says the deploy panel should be.
Two writers: extend the shipped `expectedVersion`/`409` mechanism per entity and return an explicit
conflict list — no new conflict model.
Cost: medium — a client (CLI command or admin action), a selection/diff step, a conflict report. No
schema migration. What it breaks: nothing existing. Risk: it is a **write path into production**,
so it needs the same discipline as a deploy — a dry-run first, an explicit target, never an
implicit "push everything".

**E. No content travel, but say so loudly.**
Deploy states the ref it is shipping and says "your 45 pages, 9 posts and 23 media items stay
local." Cost: very small. Breaks nothing. Two writers: no conflict by construction. But it is only
honest if there is a real action to point at — otherwise it is a better-worded dead end. Today the
one real action is the **static export/publish** path (which works end to end, and is what the
owner could use this week).

### h.4 Media: how each option handles bytes

Any option that moves only the DB reproduces the confirmed blank-preview incident (§c).

| Option | Rows | Bytes | Verdict |
|---|---|---|---|
| A whole DB | yes | **no** — `uploads/` is not in the db | broken previews, plus everything else |
| B bundle | yes | only if the bundle is a *directory* (db/JSON + `uploads/`) and the import writes through `BlobStorePort` | workable; must be designed in from line one |
| C files in repo | yes | yes — blobs are content-addressed files, a natural fit for git (but binaries in git forever) | good fit, biggest change |
| D API push | yes | **yes, natively** — `POST …/media` is a real upload route; content-addressing makes re-upload idempotent | best fit; no new byte transport needed |
| E no travel | n/a | n/a | the static export already inlines/fetches asset bytes through the real `/m/` pipeline |

Note the asymmetry that already exists in production: `hydrateBlobStoreFromSeed` is per-key and
runs **every** boot, so bytes *can* already be topped up repeatedly — it is only bounded by what
the image carries. Bytes are the easier half; rows are the one gated to first boot.

### h.5 Recommendation

1. **Reject A outright**, and say so plainly to the owner: the file is the wrong unit, and it is
   the wrong unit for a reason already written into `PRUNE_TABLES`.
2. **Destination: D (push over the existing admin API), decoupled from deploy.** It is the only
   option whose transport, auth, byte handling, and conflict mechanism are all *already shipped*;
   it matches the existing "deploy provisions, it does not publish" ruling; and it is the only one
   that gives a good answer to two writers without taking authoring away from either side.
3. **Reuse B's classification, not B's shape.** `PRUNE_TABLES` (inverted) is the definition of
   "authored". Fix `setting_values_workspace` first — until authored settings are distinguishable
   from environment settings, *every* option in this list is blocked on the same ambiguity.
4. **Ship E now regardless of which destination is chosen.** Silence is the defect the owner hit.
   The warning text needs numbers, which step 5 produces.
5. **Treat C as a separate strategic question.** Do not let this bug decide the source of truth.

**Cheapest reversible first step — a read-only content diff.**
One command (or one admin panel) that reads the local db and the remote site **over the existing
admin API, read-only**, and prints: N pages/posts here that are not there, M that differ, K media
keys whose bytes are missing remotely, and any entity whose `version` moved on both sides. It
writes nothing anywhere, needs no schema change, is safe against production by construction, and it
produces exactly (a) the number the deploy warning must state and (b) the dry-run a push would
need. If the owner then wants a push, the diff *is* the push's plan step; if they do not, nothing
was built that has to be unbuilt.

**Independent, do-it-anyway fix (one line of judgement, not a design):** make
`findMissingSeedBlobs` measure `git ls-files` instead of the working tree. That closes the
rows-vs-bytes hole for every fresh install today, and it is orthogonal to whichever option above
wins. It was already recommended on 2026-09-06 and not done; the count has gone from 6 to 16 since.

### h.6 What I did not verify for this section

- Whether prod's admin API is reachable and whether an API key exists on the prod side — checking
  means a network call to production, which this dispatch forbids. The *local* code proves the
  routes and the auth path exist; it does not prove prod will accept them.
- Whether `expectedVersion` is honoured on every authored entity or only on `posts`. I confirmed it
  on `posts` (`routes/posts/update.ts`); `entries`, `menus`, `taxonomy`, `redirects` and
  `form_definitions` were not checked. A push design must assume it is `posts`-only until proven
  otherwise.
- Which of the 18 `setting_values_workspace` rows are authored vs. environment. They are keyed by
  UUID `setting_id` and I did not join them to `setting_definitions` to name each one. That join is
  the first concrete task of whichever design wins, and it is cheap.

---

## (a) Where content and media live, and what travels

| Thing | On disk | In git | In the image | Reaches an EXISTING prod volume |
|---|---|---|---|---|
| Live content (`sites/tovu-com/content.db`) | 42 MB | **no** (`.gitignore:57`) | no | **never** |
| Chat (`sites/tovu-com/chat.db`) | 73 MB | no (`.gitignore:70`) | no | never |
| Stock seed (`sites/tovu-com/content.seed.db`) | 2.2 MB | **yes** (tracked) | yes → `dist/content/seed-sites/<site>/` (`Dockerfile:95-96`) | **first boot only** |
| Media bytes (`sites/tovu-com/uploads/`) | 42 files | **13 of 42 tracked** | whatever is tracked (`Dockerfile:97-99`) | every boot, per-key top-up |
| Site themes (`sites/tovu-com/themes/`) | 6 static + 1 declarative | 297 files tracked | **no — `Dockerfile:108` `rm -rf sites`** | never |
| Stock themes (`content/themes/`) | — | yes | yes → `dist/content/themes` | first boot only |

Evidence:

- `.gitignore:57-59` ignores `sites/*/content.db` and its sidecars; `.gitignore:70-72` the same for
  `chat.db`. The paired comment at `.gitignore:42-52` states the intent: `sites/` was deliberately
  **un**-ignored on 2026-08-31 so a git-based deploy ships a site, but the live db stays out
  because it grows without bound and carries real secrets/PII. `content.seed.db` is the tracked
  substitute.
- `fly.toml` mounts the Fly volume at `/workspace/Tovu/sites` (`Dockerfile:175-184` documents the
  same path and declares `VOLUME ["/workspace/Tovu/sites"]`). The mount **replaces** the image's
  entire `sites/` tree — that is why stock data has to be staged outside `sites/`.
- `Dockerfile:92-100` is the only thing that rescues site data before `Dockerfile:108`'s
  `RUN rm -rf sites`: a loop copying each `sites/*/content.seed.db` → `dist/content/seed-sites/<site>/content.seed.db`
  and, if present, `sites/<site>/uploads` → `dist/content/seed-sites/<site>/uploads`. **Nothing
  else under `sites/` survives the wipe.**

### Consequence nobody has written down yet: the site's OWN themes never travel either

`seedSiteThemes()` is called at boot with `stockDir: builtInThemesDir()`
(`apps/website/src/server/runtime/composition/deps.ts:728`, and `deps.ts:305` resolves that to
`<productRoot>/content/themes`) — the **product's stock** theme tree, not the site's. The site's
own tree is wiped at `Dockerfile:108` and never staged anywhere.

Measured: `sites/tovu-com/themes/static/kuinetic-showcase` (71 git-tracked files) exists **only**
under `sites/`, with no counterpart in `content/themes/static/`. Any theme the owner authored or
customised in their site directory is structurally unable to reach a container — not even a fresh
one. The other six theme folders happen to exist in both trees, so this has been invisible.

Severity today is limited: `presentation_settings.active_theme_id` is `"basic"`, which exists in
both trees, so the *rendering* theme does travel. The gap bites the moment anyone activates a
site-authored theme.

---

## (b) The existing machinery: what each piece can and cannot do

### 1. `npm run seed:site` — `development/scripts/seed-site.mjs` (developer CLI, wired)

Copies the live `content.db` to scratch, deletes every table in `PRUNE_TABLES`
(`seed-site.mjs:47-99`), nulls `identity_users.last_login_at`, resets the legacy site-title pin,
`VACUUM`s, verifies blob integrity, and publishes `sites/<site>/content.seed.db`. It never writes
to the live db (`assertLiveDbUntouched`).

- **Can:** produce a committable, secret-stripped snapshot of local content.
- **Cannot:** put that snapshot anywhere. Its own header says so: *"Getting `content.seed.db`
  promoted to the literal `content.db` a fresh container boots from … is a Dockerfile/entrypoint
  concern, deliberately left out of this script"* (`seed-site.mjs:25-28`).
- **Reachability:** `npm run seed:site` only. No admin UI, no agent tool, no CI step. A user who
  never opens a terminal cannot produce a seed at all.

### 2. `hydrateContentDbFromSeed()` — `apps/website/src/platform/db/sqlite/hydrate-content-db-from-seed.ts` (WIRED)

Wired at `deps.ts:564` (via `hydrateContentDbIfNeeded`, `deps.ts:562-565`) inside
`createSqliteRouteDeps` — the real production composition root. **The gate is `existsSync(dbPath)`
and nothing else** (its own header, lines 20-27: *"an existing file, however old or however it got
there, means 'never touch this again'"*). Three outcomes: `seeded`, `already-present`,
`no-seed-source`.

This is the single most important fact in this report: **on every redeploy after the first, this
returns `already-present` and copies nothing.** It is correct — overwriting a live prod db with a
stale seed is unrecoverable data loss — but it means "deploy" can never be the verb that moves
content onto a running site.

### 3. `hydrateBlobStoreFromSeed()` — `apps/website/src/features/media/hydrate-blob-store-from-seed.ts` (WIRED)

Wired at `deps.ts:977`, log-and-swallow on failure. Unlike its siblings it gates **per content-
addressed key** via `BlobStorePort.putIfAbsent()`, so it runs on **every** boot and tops up any key
the image ships that the live store lacks. Safe against a concurrent uploader (the header documents
the TOCTOU fix that replaced `exists()`+`put()`).

- **Can:** fill in bytes for media rows, repeatedly, on any boot.
- **Cannot:** ship bytes that are not in the image. Its reach is bounded by what git carries — see
  (c).

### 4. The site exporter — `apps/website/src/platform/export/site-exporter.ts` (WIRED, but it is a different product)

Boots the real Express app in-process on port 0, issues real HTTP requests for every route in the
manifest, crawls the emitted HTML for assets, and writes a folder of static files. Reachable three
ways:

- CLI: `apps/website/src/cli/commands/export.ts` (`tovu export <dir>`).
- Admin: `POST/GET …/system/export` (`apps/website/src/server/inbound/admin-http/routes/system/export-site.ts`),
  trigger-plus-poll, `system.export`-gated.
- Admin: `POST/GET …/system/publish` (`…/routes/system/publish-site.ts`) → `publishStaticSite`
  (`features/deployments/static-publish/adapter.ts`) for GitHub Pages / Vercel / Netlify /
  Cloudflare Pages.
- UI: `apps/admin/src/features/deployment/StaticSiteTab.tsx` — `useWiredStaticExport`,
  `useWiredStaticPublish`, `useWiredPublishCredentials`. Genuinely wired end to end.

**This is the one path today by which a user's authored pages actually reach the public internet.**
It is not a content migration: it emits read-only HTML, every POST route goes dark (forms,
comments, newsletter, analytics, payments webhook), and the result is per-provider (base-path
rewriting makes a GH-Pages build non-portable to Vercel).

### 5. The "Full Site" tab — informational only, no backend

`apps/admin/src/features/deployment/FullSiteTab.tsx:7-22` is explicit: every provider row is
`status: "planned"`, there is no admin-reachable backend, and `src/features/deployments/` (domain
model, GitHub provider adapter, migration) has **no route importing it**. Its own
`features/deployments/index.ts:6-11` confirms the write side is unbuilt.

So the deploy the owner actually ran did not go through the product at all — it went through the
**agent plugin** `content/agent-plugins/tovu-deploy-fly`, which drives a GitHub Actions workflow.

### 6. Is there an importer? **No.**

`apps/website/src/server/__specs__/90-migration/import-export-and-migration.spec.md` defines an
import contract (`ImportDryRunResult`, migration records, redirect mapping) — it is a spec with no
implementation. The only import code that exists is narrow and unrelated:
`routes/redirects/import.ts`, `routes/newsletter/import-subscriptions.ts`,
`features/media-import/`. There is **no** path — CLI, HTTP, agent tool, or env var — that accepts a
`content.db`/seed and merges it into a running site. `features/database/restore-points.ts` is a
local whole-db snapshot/restore, same machine only.

---

## (c) Media rows vs. bytes — **CONFIRMED, still true, and worse than when it was last measured**

The 2026-09-02 fix (`814ef465`) was real and is intact: the Dockerfile stages `uploads/`
(`Dockerfile:97-99`), the boot hydrator exists and is wired, and `seed-site.mjs`'s
`findMissingSeedBlobs()` refuses to publish a seed whose rows lack bytes. **The hole moved.**

`findMissingSeedBlobs(db, liveDir)` checks `asset_blobs.storage_key` against the **working tree**
(`seed-site.mjs`: `path.join(liveDir, "uploads", row.storage_key)`). CI and Fly build from a **git
clone**, which contains only *tracked* files. A blob on the author's disk that was never
`git add`ed passes the guard and is then absent from the build context.

Measured today (`sqlite3` against scratch copies; `git ls-tree`/`git ls-files` for the tracked set):

| | asset_blobs rows | tracked upload files | rows with **no** committed bytes |
|---|---|---|---|
| Seed at the **deployed** commit `f2997c6e` | 16 | 13 | **6** |
| Seed at branch HEAD `3ede05b9` (2026-09-14) | 26 | 13 | **16** |
| Live `content.db` | 29 | 13 | 19 |

All 16 missing keys exist on local disk (that is exactly why the guard passed) and are **not**
gitignored — `git check-ignore` returns rc=1 on them. They are simply 27 untracked blob
directories nobody ever staged. Zero upload blobs have been committed since 2026-09-03.

Three blobs (shards `44`, `54`, `92`) are tracked but referenced by no seed row — dead weight, harmless.

**Same gap as the content one, or separate?** Separate, and stacked:

- The **content** gap is a *policy* gap: `content.db` is deliberately ignored and the seed applies
  once per volume.
- The **media** gap is a *consistency* gap: rows and bytes come from two different sources (the
  tracked seed db vs. the tracked upload tree), and only one of them is regenerated by
  `npm run seed:site`. Nothing keeps them in sync, and the guard that was built to keep them in
  sync measures the wrong tree.

Fixing the content gap does **not** fix the media gap; a content migration that moved rows without
moving bytes would reproduce the identical blank-preview production incident.

Prod's *current* media state is **UNVERIFIED** — checking it means an HTTP read of the live site,
which this dispatch forbids. Because the blob hydrator runs every boot and is per-key, prod may
have filled in whatever the image carried at each release; it can never have filled in a key the
image never carried.

---

## (d) How much authored state is at stake locally

From `sites/tovu-com/content.db` (read-only, scratch copy, 2026-09-18):

| | count |
|---|---|
| `posts` rows total | 166 |
| — live (`deleted_at IS NULL`) | **54** |
| — of those: **pages** published / draft | **43 / 2** |
| — of those: **posts** published | **9** |
| — soft-deleted | 112 |
| `entries` | 17 |
| `media` | 23 |
| `asset_blobs` | 29 (+34 `asset_renditions`) |
| `content_types` | 2 |
| `form_definitions` / `form_submissions` | 5 / 14 |
| `redirects` | 2 |
| `setting_values_workspace` | 18 |
| `identity_users` | 4 |

Most recent edit: the home page (`slug: /`) at **2026-09-18T19:38:50Z**.

**The staleness gradient, which is the concrete shape of the owner's complaint:**

| Snapshot | live posts | media | asset_blobs | newest `updated_at` |
|---|---|---|---|---|
| Live `content.db` (what the owner sees locally) | 54 | 23 | 29 | 2026-09-18 |
| Committed seed at branch HEAD (`3ede05b9`, 2026-09-14) | 47 | 20 | 26 | 2026-09-12 |
| Seed at the **deployed** commit `f2997c6e` | 40 | 9 | 16 | 2026-09-05 |

So even in the best case — a fresh volume, deploying the owner's own branch — they would get
content frozen at 2026-09-12, missing the 7 blog posts written 2026-09-15/16 and the 2026-09-18
home-page edit, because the seed is only as current as the last manual `npm run seed:site`.

---

## (e) What is genuinely unsafe to auto-ship, and why

1. **Prod's own `content.db`.** Any "push my content" that writes the whole db overwrites real
   authored data, form submissions, and settings on the server with **no undo**. This is why
   `hydrateContentDbFromSeed`'s presence-only gate exists, and it should not be softened.
2. **Sealed credentials — 10 tables.** `admin_execution_credentials`, `site_assistant_credentials`,
   `publish_credential_sets`, `external_mcp_servers`, `composio_config`,
   `composio_connector_credentials`, `vendor_credential_sets`, `media_provider_credentials`,
   `custom_credential_sets`, `source_control_credential_sets`, `api_keys`
   (`seed-site.mjs:80-93`). Two independent reasons per that file: the operator configures their
   own, and the seal is enveloped against a **per-environment** `TOVU_INTEGRATIONS_ROOT_KEY`, so a
   shipped sealed row is ciphertext that fails at *use* time — a worse failure than "not
   configured".
3. **PII.** `sessions` (login IP/user-agent), `form_submissions` (14 rows, one carrying the owner's
   own real name and email), `identity_users.last_login_at`, and `ai_chat_messages` /
   `assistant_agent_sessions` / `ai_chats` (real transcripts; these now live in the separate
   `chat.db`, 73 MB).
4. **Audit/undo history** — `*_revisions`, `change_sets`, `outbox_events`, `agent_tool_attempts`.
   Not unsafe so much as meaningless on a fresh site; the authoritative state is already in the
   live tables.
5. **Media rows without their bytes.** Shipping rows alone is not a neutral partial success: it
   produces a 500 from `LocalFsBlobStore.get()` on every preview, which the admin UI silently
   degrades to a placeholder. Rows and bytes must move together or not at all.

**Safely shippable** (what a content push would legitimately carry): `posts`, `entries`,
`content_types`, `taxonomy`, `redirects`, `form_definitions` (definitions, not submissions),
navigation/presentation settings, `media`+`asset_blobs`+`asset_renditions` **paired with their
bytes**, and the site's `themes/` tree. That is essentially `content.seed.db`'s existing shape —
the prune list is already the right answer to "what is safe"; what is missing is a *transport* and
a *merge*, not a *filter*.

---

## (f) Prior rulings, and where they are recorded

1. **"Deploying ships CODE, not CONTENT."** —
   `content/agent-plugins/tovu-deploy-fly/skills/tovu-deploy-fly/SKILL.md:10-33`. Carries a table
   ("First deploy, fresh volume → the stock seed content, not their local content"; "Every later
   deploy → whatever is already on the volume, untouched"), names a content migration as *"a
   different thing"*, and at :308-309 instructs the agent to **repeat the rule at the end of the
   deploy**. The warning exists — as agent instructions only. Nothing in the product surfaces it,
   and the owner did not receive it.
2. **"CONTENT CANNOT REACH A DEPLOYED SITE (confirmed by code search)"** —
   `ADS-memory/reports/2026-09-10-deploy-handoff.md`, own section heading. *"No script, CLI, admin
   action, agent tool or env var can push updated local content onto a live volume."* Still true
   today; re-verified above.
3. **The seed guard checks the wrong tree, and the bug had already re-opened** —
   `ADS-memory/reports/2026-09-06-media-seed-deploy-status.md` §1 and §4. It measured 6 rows
   without bytes and recommended making the guard git-aware. Nothing was done; today it is 16.
   Same report §3 item 5: *"Understand that content will not arrive … This is the most important
   non-obvious consequence in this report."*
4. **Self-hosted first; two separate deploy lists; content publishing needs no deploy in a hosted
   model** — memory `deployment_model.md` (2026-08-13/15 owner decisions) and
   `development/docs/deployment/deployment-constraints.md:171-172` (*"in a hosted model, saving
   content IS publishing … the panel's real subject is provisioning and upgrading an instance, not
   publishing content"*). This is the ruling that explains why no content-push path was ever built:
   the panel was scoped to provisioning.
5. **One export engine, per-provider profiles — not four pipelines** — memory `deployment_model.md`.
   Relevant if a content-transport design is tempted to grow per-host variants.
6. **Site-content editorial rulings** — `ADS-memory/reports/2026-09-04-site-content-decisions.md`
   (unpublish the 38 junk pages rather than delete; nav restructure; `/llms.txt` as a complete
   index). Any content push should not re-publish what that ruling drafted.
7. **Exporter testing ruling** — memory `site_exporter_export_testing_ruling.md` (2026-08-21):
   don't widen the exporter's public surface for tests; extract the small pure decision. Constrains
   *how* the exporter may be changed, not whether.
8. **Memory `media_seed_ships_rows_not_bytes`** describes the 2026-09-02 fix as "NOT yet deployed".
   That framing is stale — the 2026-09-06 report proves it deployed on 2026-09-02/03. The *finding*
   the memory records is nonetheless still live, via the working-tree-vs-git gap.

---

## (g) What I could not determine

- **Prod's actual content and media state.** Any check is an HTTP read of the live site; the
  dispatch forbids touching production, so whether `tovu.fly.dev/admin/media` previews work today
  is **UNVERIFIED**. Both prior reports left the same caveat open.
- **Whether the deployed image ever had a matching `uploads/` payload for the 6 missing keys at
  `f2997c6e`.** The image is not local; the git-tree diff proves the bytes were not in the build
  context, which is sufficient for the finding but not a reading of the container.
- ~~Where the active theme id is persisted.~~ **RESOLVED while answering §h:** it is
  `presentation_settings.active_theme_id`, currently `"basic"` — a theme that exists in both trees.
  So `kuinetic-showcase` is **not** the rendering theme, which downgrades the theme finding in (a)
  from "the live site's theme cannot deploy" to "a site-authored theme can never deploy". The
  structural gap is unchanged; the blast radius today is smaller than it first appeared.
- **The git/ref half** (which ref Fly deployed, whether the plugin knows the operator's branch,
  local vs. remote `main`) — deliberately left to the other agent. One content-relevant crossover,
  stated as fact and not as an opinion on their half: `sites/tovu-com/content.seed.db` is touched by
  **no commit reachable from local `main`**, and the commit that produced the current seed
  (`3ede05b9`) is contained only by `restructure/apps-website-phased`.
- **Whether anything automates committing new upload blobs.** I found no hook, script, or CI step
  that does; I did not exhaustively audit every hook directory.

---

## Method notes

- Live `content.db` + `-wal` + `-shm` copied to the session scratchpad and queried there; the live
  file was never opened, so nothing could trigger a checkpoint or journal write against it. Seed
  dbs likewise copied (and, for the deployed commit, extracted with `git show … > scratch`).
- No migrations run, no `npm run seed:site`, no export, no publish, no deploy, no network call to
  production or to GitHub.
- No process was killed, restarted, or inspected with `ps eww`/`pgrep -fl`.
- Counts are from `sqlite3` aggregates and `git ls-tree`/`git ls-files` set differences (`comm`),
  not from greps.
- No credential, token, or key value appears in this report.
