# Cross-site reads for the admin chat: plan (crosssite-plan-c2, 2026-10-16)

## Summary (read this)

1. **Verdict:** the leading idea holds, with one correction. Read tools get one optional `site` input (a `sites_list` name). Writes stay on the active site, and a write tool given another `site` is refused with "switch sites". The same tool ids and handlers run against the other site. There is no new tool per resource and no `siteName` on each tool.
2. **The correction:** you can't "open the other site's RouteDeps". Every tool handler closes over one boot-time deps bag, and the composition root that builds it writes to the site while it boots (themes, migrations, seeds, repairs, vault, password reset, sweeps). Instead, a new **write-free peer composer** builds a smaller bag over READ-ONLY handles: content.db, chat.db and the journal DB. Repos are plain `new SqliteXRepo(kernel)` constructors. We then rebuild the registrations with the existing `buildAssistantToolRegistrations` and keep only the read-only, allowlisted ones. The bag is cached in an LRU of 3 sites and closed after 5 minutes idle.
3. **Coverage:** Tovu declares 103 read-only tools (`sideEffects: "none"`), plus the Jini-cms readers (media, menus, settings, collections, identity). About 65 to 75 of them work on another site for free: posts, pages, media, forms, taxonomy, menus, themes, settings, comments, members, newsletter, redirects, SEO, widgets, database health and schema, restore points, trash, chat history and site_guide. That is 27 of the 32 `content_read` cards. Secret-bearing, process-level and live-server tools are EXCLUDED by an explicit list (§3).
4. **Safety, in four layers:** (a) owner-only and local-host-only; (b) the target site is resolved through a registry name, never a path; (c) the handler runs as the target site's own owner, read-only; (d) the SQLite handles are opened `readOnly`, so a stray write fails inside SQLite. Each cross-site read leaves an audit row on the active site.
5. **Desktop:** the same mechanism works unchanged. It reads the other site's files and does not call that site's server, which would need that site's root key (a secret crossing sites). This works whether or not the other site is running.
6. **chatsite-c2 is absorbed:** its Tovu adapter (`site-chat-history.ts`) becomes the core of the new resolver. Its unreleased Jini change (`siteName` and the `siteHistory` port in `history-tools.ts`) is **dropped, not released**. The chat-history tools get `site` from the generic mechanism like every other read tool.
7. **Size:** 3 Codex jobs plus one Jini release. About **8 hours** wall time.

---

## 1. How tools get their site today (boot singletons, not per request)

- Every tool handler closes over one deps bag passed in once: `slice.build(enrichedRouteDeps, guardedSurfaces)` at `apps/website/src/assistant/tool-registrations.ts:321`. For example, `routeDeps.mediaRepo.findById({ workspaceId: routeDeps.workspaceId, ... })` at `features/media/tool-registrations.ts:185`, and `routeDeps.pagesHtmlStore(...)` in `features/pages/tool-registrations.ts`.
- That bag is built once per process. In the daemon, `buildAssistantToolRegistrations({...routeDeps,...})` runs at boot (`server/inbound/assistant/agent-daemon-server.ts:499`). BYOK builds the same catalog in `server/runtime/composition/modules/assistant-byok.ts:396`. The daemon is a per-site process.
- Execution context carries a principal and input only. No site travels with a call.
- **Building a second bag is cheap if we skip the boot writes.** Of the 38 named repo and store constructions in `server/runtime/composition/deps.ts:1144-1954`, the content and media repos are plain `new SqliteXRepo(kernel)` constructors over the dialect-neutral kernel: post, media, forms, menus, taxonomy, entries, settings, widgets, redirects and so on. The pages store and search are kernel closures too (`deps.ts:2121`, `deps.ts:2111`).
- **But `createSiteRouteDeps` (`deps.ts:1025`) cannot be reused**, because it writes while it boots:
  - `seedSiteThemes` (`deps.ts:1070`)
  - open, migrate, seed, repair (`open-site-content-db.ts:47-53`)
  - FTS backfill (`deps.ts:1138`)
  - admin password reset (`deps.ts:1182`)
  - vault normalisation (`deps.ts:1859`)
  - chat expiry sweep (`deps.ts:886`)
  - widget adoption (`deps.ts:2564`)

  It also starts plugin hosts and federation. Running it in a read-only mode would mean threading a flag through about 1,600 lines of interleaved boot code. **Rejected.**
- **Chosen design:** a peer composer builds only the repos the allowlisted read domains need. It covers missing fields with a **fail-closed Proxy**: any field the composer doesn't provide turns into a value that throws `CrossSiteUnavailable(<field>)` the moment a handler uses it. A read tool can therefore never fall back silently to the ACTIVE site's data under another site's label. That silent fallback is the main correctness risk of the "spread the active deps" shortcut, which is rejected.
- The registrations themselves are rebuilt with the existing `buildAssistantToolRegistrations(peerDeps, surfaces, { contributions, targetScope: "off" })`. That gives the same handlers, the same permission checks, and the same approval and batch wrapping. Rebuilding about 200 registrations is a millisecond-scale loop with no I/O.

## 2. Which tools are read-only, and what comes for free

- **The flag:** `descriptor.readOnly` is set to `catalogEntry.sideEffects === "none"` (Jini `packages/core/src/registration-kit.ts:508`). `isReadOnlyTool` (`packages/core/src/tool-registry.ts:93`) is what the daemon's read-only gateway already enforces (`packages/daemon/src/core/read-only-tools.ts`, `checkReadOnlyTool` and `constrainPrincipalToReadOnlyTools`).
- **Count:** grep finds 103 `sideEffects: "none"` declarations across 57 Tovu files, against 114 writing ones. The Jini-cms catalogs add the media, menus, settings, collections and identity readers. All of these appear among the 32 `content_read` cards (`assistant/content-read-tool.ts`, `CONTENT_READ_CARDS`).
- **Free under the generic mechanism** (allowlisted domains whose read handlers use only the kernel repos, `authorize`, `workspaceId`, `themesDir` or the uploads blob store):
  - post (get, list, search, stats) and pages (`pages_read_html`)
  - media (list and get, `media_view_image`, `media_view_video` over the other site's local uploads)
  - forms, taxonomy, menus, collections and entries
  - theme reads (confined to the other site's `themes/`) and settings
  - comments, members, newsletter, redirects, SEO, widgets, workspace
  - identity lists
  - database: health, schema state, pending migrations, timeline, restore points
  - recovery and trash lists, change-sets
  - `assistant_chats_list` / `assistant_chat_read` (the other site's owner's chats)
  - `site_guide`
  - 27 of the 32 `content_read` cards. These get `site` automatically, because a card's schema is the union of its members' schemas (`content-read-tool.ts:440`).
  - Estimate: **about 65 to 75 tools.** Job 3's completeness test turns this estimate into an exact list.
- **Need changes:** none of the allowlisted handlers need code changes, as far as reading shows. Anything that does touch a missing field fails closed through the Proxy, and job 3's gate catches it. The fix is then to provide the field in the peer composer, or to move the tool to EXCLUDED.

## 3. Security

- **Owner-only:** the installation owner check (`principalId === await deps.ownerPrincipalId`) runs first, the same check chatsite-c2 uses in `assistant-history-tools.ts`. There is also a local-host gate, `isLocalTovuHost` (`server/runtime/composition/registered-sites.ts:17`), so a deployed site (Fly) never reads a registry.
- **The visitor AI can never reach this.** The public site chat uses its own tool set (`server/runtime/composition/modules/site-assistant.ts`, `assistant/site/tools.ts`), not `buildAssistantToolRegistrations`.
- **Permissions are checked on the TARGET site.** Users are site-local (comment in `site-chat-history.ts`), so the caller's principal means nothing on the other site. The peer handler runs as the target site's single owner principal. That principal is resolved read-only by the existing query at `site-chat-history.ts:63`, which refuses when the site has zero or two owners. It is attenuated with `toolAccess: 'read-only'`. The target domain's own `requireToolPermission` then checks the target site's own roles and members. Mapping active-site members onto the target site is deliberately left out of v1 (§7, question 2).
- **No free paths:** `site` must match a registry name exactly. Resolution goes through the shared `registeredSources` (`registered-sites.ts:25`), which already refuses folders in site-trash, duplicate identities, and a symlink or hardlink to the live database. It is reused by `local-credential-copy.ts:62` and `site-chat-history.ts:43`. Errors reach the model as fixed text that never contains a path (precedent: `site-chat-history.ts`).
- **Read-only handles:**
  - content.db is opened with `openSqliteFileKernel(path, { readOnly: true })` (`platform/db/kernel/drivers/sqlite.ts:26`).
  - chat.db is opened with `{ readonly: true, fileMustExist: true }`.
  - The journal DB is opened read-only.
  - Before first use, the target's schema is checked with `SqliteDatabaseIntrospectionAdapter.getSchemaState()` and pending migrations (`features/database/adapter.sqlite.ts`). A site whose schema is behind is refused with "open <site> in Tovu once to upgrade it". A read-only handle can't migrate, and an old schema would give wrong reads.
  - SQLite only in v1. Postgres would need the other site's sealed connection secret (a secret crossing sites). PGlite needs a running owner socket. All 5 of the owner's sites are SQLite.
- **Secrets never cross sites.** The peer composer never builds the vault, the site-key sealer, the credential stores, external MCP, the deploy or publish tokens, or the root key. Those fields are poisoned by the Proxy. These domains are also on an explicit **EXCLUDED** list, and are never given `site`:
  - Secret-bearing: custom-credentials, webhooks and integrations, external-mcp and its ops tools, deployments, deploy-ops, publish and publish-content (tokens and peer trust), source-control, domain-dns, site-backup, media-generation providers, mail-status.
  - They run installed code: agent-plugins, plugin-runtime (capability tools), skills, fs-files.
  - Process-level or live-server rather than site data: server-logs, web, web-screenshot, site-inspection, post preview, analytics, site-evidence.
  - Site-agnostic: sites, plus all UI slices (demo-*, render-ui, ask-choice, component-catalog, admin-screen-link, external-mcp-reauth).
  - Explicitly copying credentials between sites stays with its existing dedicated write tool (`local-credential-copy.ts`).
- **Audit:** the executor's audit sink records input key names only, never values (Jini `packages/daemon/src/core/tool-audit.ts:44`, `describeInput`). So the resolver appends one extra row through the active site's `routeDeps.toolAttemptAuditSink` (`server/routes/types.ts:901`), with detail `cross-site read: <registry name> (<registry id>)`. Nothing is written to the target site.
- **Writes:** write tools never advertise `site`. If a call still passes it, the wrapper refuses whenever `site` names a site other than the active one: "Writes run only on the active site. Switch with sites_switch_site first." If it names the active site, it is stripped and the call runs. This matters because some domain handlers may silently ignore an unknown key and write to the active site.

## 4. Desktop parity

Each desktop site runs its own `tovu serve` with its own daemon, and the mechanism lives inside that site's own daemon or BYOK process. Reading another site means opening its files read-only, which SQLite WAL mode allows across processes while the other site's server writes. It also works when the other site is not running.

Calling the other site's HTTP server instead is **rejected**, for three reasons:
- it would need that site's root key, which is a secret crossing sites;
- it would only work while that site is running;
- it would add a second, parallel read path.

Open files are kept low: at most 3 cached sites with 3 handles each, closed after 5 minutes idle.

## 5. What goes in Jini and what goes in Tovu

**Jini, `@jini-ai/core`:** a pure registration transform, `applyTargetScope({ registrations }, { resolveTarget, param = "site", describeParam, refuseWriteMessage })`.
- On read-only registrations it adds an optional `param` to the input schema. On every call it strips that param. When the host says the target is the current one, the original handler runs. Otherwise the host-resolved peer registration runs, with the host-resolved principal.
- On write registrations it refuses a non-current target.
- Its arguments follow the `(requiredObj, optionalObj)` shape, and the resolver is a port: `resolveTarget({ target, toolId, principal }) => Promise<"current" | { handler, principal }>`.
- Jini never reads `sites.json`.
- This is a sibling of Jini's `applyApprovalPolicy`. It follows the precedent in Tovu's `assistant/batch-tool-inputs.ts`, which is itself flagged `NEEDS-JINI` (lines 25-26) for the same "same ids, no second path" reasons.

**Tovu, `server/runtime/composition/peer-site-reads.ts`:** the resolver port.
- registry lookup through `registeredSources`
- the local-host and owner gates
- the target-owner principal
- the read-only opens and the schema check
- the peer composer and the fail-closed Proxy
- the LRU cache
- the cross-site audit row
- the `CROSS_SITE_READ_DOMAINS` allowlist and the EXCLUDED list

It is wired in `assistant/tool-registrations.ts` after the approval policy (`:367`) and before `applyBatchInputs` (`:379`). A batch's shared `site` then applies to every item, and the `content_read` collapse (`:381`) inherits `site` through the schema union.

**Fallback:** if a Jini release can't happen tonight, job 1 lands in Tovu as `assistant/site-target-inputs.ts` with a `NEEDS-JINI` header, like batch-tool-inputs. This needs the coordinator's call, because the owner rule is "flag it before building in Tovu".

## 6. Codex jobs (3), RED first, about 8 hours wall time

**Job 1, Jini core: `applyTargetScope`.** About 1.5 hours including review.
- Files: `packages/core/src/target-scope.ts`, its export, and `__tests__/target-scope.test.ts`.
- RED tests first:
  - schema gains `site` only on `readOnly` registrations;
  - `"current"` reaches the original handler with `site` stripped;
  - a peer target reaches the peer handler with the peer principal;
  - a write with a foreign `site` is refused;
  - an unknown site gives the host's message;
  - a batch's shared `site` is preserved.
- Same job: revert the unreleased chatsite change in `packages/chat/src/store/runtime/history-tools.ts` (`siteName` and `siteHistory`), plus its `zz-red-head` scratch files.
- Then run the autonomous Jini release (core and chat) and adopt it in Tovu.

**Job 2, Tovu: peer resolver and composer.** About 3 hours.
- New `server/runtime/composition/peer-site-reads.ts`. It absorbs `site-chat-history.ts`, which is deleted, and its test is ported.
- Wire it in `deps.ts` (replacing the `siteChatHistory` field with `peerSiteReads`), `server/routes/types.ts` and `assistant/tool-registrations.ts`.
- Revert `assistant-history-tools.ts` to plain `getStore`.
- RED tests (two temp sites, never the real home directory):
  - reads posts, media and forms from site B while A is active;
  - a write with `site=B` is refused;
  - non-owner, remote host, unknown name, a site in trash, and a symlink to the live DB are each refused;
  - a site with a behind schema is refused;
  - B's handles are read-only (an attempted write throws SQLITE_READONLY);
  - the LRU evicts and closes;
  - the audit row lands on A;
  - the chat-history tools read B's owner's chats through `site`.

**Job 3, Tovu: completeness gate and exclusions.** About 2 hours.
- `assistant/__tests__/cross-site-read-catalog.test.ts`: every `readOnly` registration is either in `CROSS_SITE_READ_DOMAINS` and runs against a seeded peer fixture without a `CrossSiteUnavailable` error, or is in EXCLUDED with a reason.
- Every EXCLUDED and write tool lacks `site` in its schema.
- `content_read` cards carry `site` only when all their members do.
- Add one line to the `sites_list` description: "pass a name as `site` to any read tool".

**Absorbing chatsite-c2:** its registry and owner logic is kept and moved, its per-tool `siteName` is gone, and its Jini half is never released. Recommendation for tovu-c2: stop chatsite-c2's Jini half now. If its Tovu adapter is already committed, job 2 moves it.

**Rules for every job:** the day-brief runners, `--maxWorkers=2`, the test lock, and a check that the real home directory is untouched.

## 7. Open questions for the owner (only real decisions)

1. **Cross-site writes:** should they ever be allowed? (For example, "copy this page from luvira into zoran".) Recommendation: no. Writes stay on the active site, and copying between sites remains the job of dedicated tools like the existing credential copy.
2. **Who besides the owner:** should an admin or member of the active site get cross-site reads too? Users are separate per site, so this would mean matching people across sites by email. Recommendation: owner only for now.

## Evidence index

- `apps/website/src/assistant/tool-registrations.ts:321,367,379,381`
- `apps/website/src/server/inbound/assistant/agent-daemon-server.ts:499`
- `apps/website/src/server/runtime/composition/deps.ts:886,1025,1070,1138,1144-1954,1182,1859,2111,2121,2564`
- `apps/website/src/server/runtime/composition/open-site-content-db.ts:47-53`
- `apps/website/src/server/runtime/composition/registered-sites.ts:17,25`
- `apps/website/src/server/runtime/composition/site-chat-history.ts:35,43,58,63,71` (in flight, uncommitted)
- `apps/website/src/assistant/content-read-tool.ts:440`
- `apps/website/src/assistant/batch-tool-inputs.ts:25`
- `apps/website/src/features/sites/agent-tools.ts:154`
- `apps/website/src/server/routes/types.ts:901`
- Jini `packages/core/src/registration-kit.ts:508`
- Jini `packages/core/src/tool-registry.ts:93`
- Jini `packages/daemon/src/core/read-only-tools.ts`
- Jini `packages/daemon/src/core/tool-audit.ts:44`
