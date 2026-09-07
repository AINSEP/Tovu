# Fable correctness audit — lens: BUGS — 2026-09-06

- Repo `/Users/la/Programming/Tovu`, branch `restructure/apps-website-phased`
- Audit HEAD (frozen): `efc6847ed4490d0f57cd94d16b8cf46a6489a88a`; window `4b89cd09..efc6847e` (243 commits)
- Read-only: no tests, builds, typechecks, servers. Code read at the frozen SHA; history used only to locate.
- Every finding: file:line, CONFIRMED (path read end to end, inputs -> wrong output stated) or PLAUSIBLE (inferred).
- Commits landing after `efc6847e` are checked (`git log efc6847e..HEAD`) before any finding is reported. At start: only `f682eff2` (chat run diagnosability).
- Codex claims (`ADS-memory/reports/codex-audit/`) are treated as CLAIMS; each is confirmed or refuted below with evidence. Already-fixed/in-flight and NOT re-reported: J01, MI-01, MI-02.

## Section 1 — Verification of codex claims

(appended as verified)

## Section 2 — Findings from commits codex left pending

(appended as confirmed)

## Section 3 — Rest of window

(appended as confirmed)

## Open questions

(recorded, not blocking)

## Ledger — all 243 commits

(filled at end; every commit reviewed or skipped-with-reason)

## Run log
- Run 2 started 2026-09-07 00:01 (a prior run's header survived as a82f6135; this run appends). Post-HEAD commits at start: f682eff2, a82f6135, ce7a5f64, 103f7ae1, fd39c9b7.

### C01 — CONFIRMED (High) — `expectedVersion` compare is not atomic with the write
- `apps/website/src/features/post/post.ts:974` `assertExpectedVersion(existing, input.expectedVersion)` is a pure in-memory compare against the row read at `:969`. Between it and the write sit three awaits: `:976 await assertSlugAvailableForUpdate` (repo read), `:982 await runBeforeSaveHook` (plugin hook — genuinely async, arbitrary latency), `:999 await deps.repo.save(post)`.
- `apps/website/src/features/post/repo.sqlite.ts:167-190` `save()` is `INSERT … ON CONFLICT(posts.id) DO UPDATE` with NO `version` predicate — the "set" half of the "compare-and-set" the doc comment at `post.ts:907` claims. The comment is false: it is a compare, then an unconditional set.
- Scenario: A and B both PUT `expectedVersion: 7`. A passes the compare, parks in the before-save hook. B passes, saves v8. A resumes, saves its stale document as v8 (`buildUpdatedPost` computes `existing.version + 1` from ITS stale read). Both 200; B's content erased; version does not advance twice. The route (`routes/posts/update.ts`) runs each request through `executeCommand` but nothing serialises two requests on the same id.
- The correct primitive already exists IN THE SAME FILE: `repo.sqlite.ts` `writeAutosave` (`eq(posts.version, snapshot.baseVersion)` in the WHERE, `changes===0` → `applied:false`) and `features/pages/html-document-store.sqlite.ts:313` (`eq(posts.version, expectedVersion)`). `save()` never got the predicate. Classic correct-primitive-unwired-sink.
- Post-HEAD check: `git log efc6847e..HEAD` contains no fix for this.

### C02 — CONFIRMED (Medium) — Pages PUT drops `expectedVersion`; one arm fixed, sibling left
- `apps/website/src/server/inbound/admin-http/routes/pages/update.ts:23-33` `parsePageUpdateBody` forwards exactly `title/slug/bodyJson/status`; `:154 ...parsePageUpdateBody(req.body)` is the only spread into `updatePost`'s input. `expectedVersion` never reaches `post.ts:974`, so `assertExpectedVersion` returns at `:920` (`undefined` → no-op). Error mapper `:36-58` has no `PostVersionConflictError` branch (unreachable anyway).
- Contrast `routes/posts/update.ts:32-49` which forwards `expectedVersion: parseExpectedVersion(body.expectedVersion)` and maps the 409 at `:76-79`.
- Scenario: stale client PUTs `/pages/:id` with `expectedVersion: 7` after another save made v8 → 200, v8 overwritten. Same request to `/posts/:id` → 409 VERSION_CONFLICT.
- Client side: `apps/admin/src/lib/api.ts:2071-2079` `updatePost` carries `expectedVersion`; the pages editor uses `updatePost`? — see Section 3 note on `api.updatePage` (checked below).
- Also unforwarded by the pages arm: `templateChoice`/`overridesThemePage` — likely deliberate (pages have their own theme-page flow) but the route doc's "same `updatePost` feature call" claim does not disclose either omission.

### C03 — CONFIRMED (Medium) — `duplicateSite` leaves `config.json`/partial `content.db` in a pre-existing empty target
- `apps/website/src/platform/site-dir/init-site.ts:132-157` `validateInitTarget` ACCEPTS an existing empty directory (`readdirSync(target).length > 0` is the only refusal at `:154`).
- `duplicate-site.ts:213-216`: `mkdirSync` (and the `wroteAnything = true` beside it) is skipped when the target exists. `:221-223` the copy callback only fires if the source has ≥1 portable entry. `:226-227` `config.json` is then written unconditionally; `:231` `duplicateContentDb` writes `content.db` — NEITHER flips `wroteAnything`.
- `init-site.ts:103-121` `cleanupAndRethrow` does `rmSync` ONLY `if (wroteAnything)`. So a `VACUUM INTO` failure (`duplicate-content-db.ts` first try) or a post-copy purge/checkpoint/integrity failure (second block — the target file already exists by then) rethrows with `config.json` (+ possibly `content.db`) left behind. The retry then hits `InitDirNotEmptyError` at `init-site.ts:155`.
- Sibling check — does `initSite` have the same hole? See follow-up below (initSite's own try block).

### MCP-01 — CONFIRMED (Medium) — duplicate-name refusal tells the model an ADMITTED tool is uncallable
- `apps/website/src/assistant/mcp-federation/trust.ts:301-307` `admitRemoteToolName`: first descriptor of a name is admitted (`seen.add`), the repeat is refused `duplicate-remote-tool-name`. `admitRemoteTools` (`:420-433`) puts the first in `admitted` and the repeat in `refused` — same `remoteName` in both lists.
- `refusal-notice.ts:156-169` `refusalItems` skips only `not-in-operator-allowlist`; it never subtracts `report.admitted`. So the duplicate produces an item. `:230-235` `PREFIX_INSTRUCTION` then asserts of EVERY item: "They are NOT in `search_tools`, `describe_tool` cannot describe them, and calling them is impossible." The per-item explanation (`:139-141`) says the opposite ("Tovu refuses the repeat rather than letting a second definition overwrite the first").
- Scenario: remote advertises `image_lookup` twice; operator allowlisted it. The model is told on every run that `image_lookup` is withheld and impossible, and told to "repeat the fix verbatim" (which says there is no fix) — while `search_tools` lists it. Directly defeats the file's stated purpose.
- Admin side (`external-mcp-admissions-rules.ts:99-102`) is NOT wrong: its copy says "kept only the first" and `notLoaded` correctly excludes it (name is in `admitted`). Only the model-facing arm is wrong.

### ADM-001 — CONFIRMED as code shape (Low/Medium) — drift is one-directional
- `apps/admin/src/features/settings/external-mcp-admissions-rules.ts:207-212` `describeAdmissionDrift` iterates `snapshot.connections` only; a saved connection with no live entry (added after boot) produces no row. `:180-183` `describeConnectionDrift` computes `saved − live` (`notLoaded`) and never `live − saved`, so a tool REMOVED from the saved allowlist (or a connection removed/disabled) but still live yields `null`.
- The file header (`:20-22`) promises "every place the operator's own intent and the gate's decision disagree" — a removed-but-still-live tool is such a place. `SettingsUi.tsx` generic "applies on restart" footer survives (per codex; not re-verified here — see ledger). Severity kept low: nothing wrong is DISPLAYED, something true is omitted.

### ADM-002 — CONFIRMED (Medium) — banner never re-reads admissions after a restart it triggered
- `apps/admin/src/features/settings/hooks/use-external-mcp-admissions.hooks.ts:87` `useFetchQuery({ key: ADMISSIONS_KEY, fetch })` — no `staleTime` override, no polling. `:89` `useFetchMutation({ run: () => port.restartAssistantDaemon() })` — NO `invalidates`, so `adapter.tanstack.tsx:185-196`'s `onSuccess` invalidation loop runs over an empty list. `:101-108` `restart()` only `setOutcome`.
- `apps/admin/src/lib/fetch-query/adapter.tanstack.tsx:96` client defaults: `staleTime: 10_000, retry: false, refetchOnWindowFocus: false` — nothing refetches a mounted query on its own.
- Scenario: operator ticks "may write" (roster saved), clicks Restart → 200 `{ok:true}`. `restartAccepted` becomes `true` and is never cleared; `admissions.data` is the OLD snapshot until the component unmounts and remounts >10 s later. Banner keeps showing the stale refusal row (its checkbox is hard-wired `checked={false}`, `ExternalMcpAdmissionsBanner.tsx:44`) plus "Restarting…" indefinitely.
- Caveat vs codex: "for the rest of the mounted session" is exact — a tab switch that unmounts the panel and remounts it after 10 s does refetch. Fix shape: `invalidates: [ADMISSIONS_KEY]` on the mutation is insufficient alone (the new daemon is not up yet when the 200 arrives — route header `routes/system/assistant-daemon.ts:22-32` says so); needs a bounded delayed refetch or a `refetchInterval` while `restartAccepted`.

### C02 addendum — client reach
- The admin has NO client for `PUT /pages/:id` (`apps/admin/src/lib/api.ts:2140-2168`: `createPage/getPage/updatePageHtml/deletePage` only). PageEditor and the Pages list save through `api.updatePost` → `/posts/:id` (kind-blind), which DOES forward `expectedVersion`. So the C02 hole is reachable only by external API clients / anything that speaks the pages surface directly — real, one-arm-left, but the admin UI is not exposed through it. Severity Medium→Low-Medium.

### Not findings (checked, recorded so the ledger is honest)
- `8e973578` `routes/workspace/delete.ts`: refuses unconditionally today (`:75` 404 on mismatch, `:92-98` 409 on match) — `deleteWorkspace` at `:100` is dead but documented as deliberate. Not a defect.
- `7caa2b71` create-published event: `post.ts:842` emits; all three create sinks drain (`routes/posts/create.ts:119`, `routes/pages/create.ts:112`, `post/tool-registrations.ts:535`). Other `createPost` callers checked below.
- `6442b34f` `form-render.ts:405-413` `setInputValueAttr`: `("[^"]*"|'[^']*')` alternation is correct; no finding.
- `1044e2d5`: `static-render.ts:107-108,:168-174`, `site-exporter.ts:313-314`, `form-render.ts:164-165` all escape `'`. FIVE more `escapeHtml` copies exist outside the commit (`assistant/mcp-ui.ts`, `public-http/http/site/page-head.ts`, `routes/site/newsletter-unsubscribe.ts`, `newsletter-confirm.ts`, `store.ts`) — checked below.

## Section 2 — Findings from commits codex left pending

### D-05 (codex) — CONFIRMED (High) — desktop Delete races an in-flight Start on the same site
- `apps/desktop/main.cjs:569-576` `openSiteServer`: `openSites.set(siteDir, …)` happens only AFTER `await startSiteBackend(...)` — the child is spawning/booting with no entry in the map.
- `apps/desktop/src/project-ipc.cjs:205-211` `handleStart` runs inside `deps.serializer.run(id, …)`; `:151-168` `handleDelete` does NOT — it reads `deps.openSites.get(id)` (undefined during the boot window), skips the stop, `untrackProject`, then `fsp.rm(id, { recursive: true, force: true })` (`:166-167`) when `mayEraseProjectDirectory` says yes (created-origin, outside repo).
- Scenario: Start site → immediately back to All → Delete → confirm. Directory removed under a booting `tovu serve`; the start then resolves and `openSites.set` publishes a running entry for a project that no longer exists. Fix shape: route delete through the same per-id serializer.

### D-02 (codex) — CONFIRMED (Medium) — hosted-DB choice accepted then silently dropped
- `apps/desktop/src/renderer/CreateWebsiteOnboarding.tsx:66-70` renders Supabase/Custom as selectable options with real inputs. `apps/desktop/src/project-ipc.cjs:97-123` `handleCreate` reads only `input.displayName`; `adoptSiteDir` (`site-dir-store.cjs:236-240`) runs `tovu init`; `buildProjectRecord:69` hard-codes `database: { kind: "sqlite" }`. Only the Supabase key field carries a "prototype does not retain the key" hint; the Custom arm and the URL/connection fields carry none. Operator picks Supabase → gets a local SQLite site reported as success.

### D-04 (codex) — CONFIRMED as code shape (Low) — delete authorisation is path+origin only
- `apps/desktop/src/project-delete-guard.cjs:mayEraseProjectDirectory` checks `row.origin === "created"` and "not inside repoRoot"; nothing checks that the directory at that path still is a site (markers) or is the one the app created. `readTrackedProjects` never prunes. Requires the operator to have moved the site and reused its path — low likelihood, high blast radius (recursive rm).

### SEO-01 — CONFIRMED shape (Low) — `setEntrySeoOverrides` is another compare-less version bump (C01 sibling)
- `apps/website/src/features/seo/write-service.ts:~225-235`: `findById` → `postRepo.save({ ...existing, seoExtJson, version: existing.version + 1 })` — full-row upsert (`repo.sqlite.ts:167-190`), no version predicate, bumps `version`. Consequences: (1) any open editor's standing-draft autosave starts returning `applied:false` (`repo.sqlite.ts writeAutosave` predicate) → "Someone else saved this while you were editing" banner (`posts/rules.ts:210`) for an SEO-only change; (2) an editor Save with `expectedVersion` gets 409 VERSION_CONFLICT for content nobody changed; (3) the microtask window between `findById` and `save` can re-write a concurrent content save with `existing`'s body. Pre-existing shape, but the window's new `expectedVersion`/autosave features made it user-visible. Same for the `seo_set_entry_overrides` agent tool (same chokepoint).

### ESC-01 — CONFIRMED (Low) — `1044e2d5` "every escapeHtml copy" left `page-head.ts`
- `apps/website/src/server/inbound/public-http/http/site/page-head.ts:194-200` `escapeHtml` still lacks the `'` → `&#39;` replacement the commit added to four sibling copies. No single-quoted attribute sink found in that file at HEAD (grep for `='${escapeHtml` empty), so not exploitable today; a one-arm-left inconsistency with a false commit message.

### Not findings (pending-list commits read, no defect)
- `0ae3429d`/`8d041b52` outbox: HEAD is consistent — worker decides `nextStatus` (`outbox-worker.ts`), both adapters take the 4th param, Jini `OutboxPort.markFailed` (`Jini/packages/cms/src/core/ports.ts:144-149`) declares it. `claimPending` leaves `processing` rows unrecoverable after a crash (no reaper) — PRE-EXISTING, outside window.
- `eb10f5de`/`d033ffb8` SEO null-clear: `applyOverridesPatch` deletes on `null`; validators skip `null`; agent schema widened to `["string","null"]`; collapses to `NULL` when empty. Consistent end to end.
- `a60e07e8`/`10efb899`/`eba275f4` autosave: `writeAutosave` is the correct conditional UPDATE; hook gates further autosaves on stale basis; recovery banner distinguishes "from before a newer save" (`posts/rules.ts:103`, `pages/rules.ts:292`). Flush-on-exit cleanup closes over the OLD `entryId` (correct).
- `15548bef`/`2aa317ab`/`4c6a0797` boot token: single-use sha256 + `timingSafeEqual`, loopback-only via `req.socket.remoteAddress`, token printed only with `emitBootToken`. Minor: a 500 after redeem burns the token (desktop cannot retry) — not a defect on its own.
- `b37864c3` `content_post_update` forwards `expectedVersion` (`post/tool-registrations.ts:~555,597`). Kind-blind for `kind:"post"` like the HTTP route.
- `a9a6e3a9` export redirect stub: `safeHref` then `escapeHtmlAttr` on all three sinks. `d1eea4b2` export now runs `reconcileInterruptedMigrationOnBoot` and refuses when blocked. `62634037` adopt: refuses partial marker sets. `2cd019cd`/`848ddd09` HTTP/2: `Connection` omitted when `httpVersionMajor >= 2`; proxy strips hop-by-hop. `00bc4bd6`, `4c65e392`: correct.

### D-01 (codex) — CONFIRMED (Medium) — one unreadable candidate aborts desktop boot
- `apps/desktop/src/project-registry.cjs:298-305` `discoverSiteDirs` filter: `fs.statSync(dir, { throwIfNoEntry: false })` still throws EACCES/ELOOP; `classifySiteDir` (`site-dir-store.cjs:127-133`) calls `missingSiteMarkers`/`fs.readdirSync(dir)` with no try. Only the ROOT `readdirSync` (`:290-294`) is guarded.
- `apps/desktop/main.cjs:1001` `rescanProjects(projectDeps)` runs inside the `whenReady()` chain whose only handler is `.catch(reportBootFailure)` (`:924-1021`) — before `openFleetWindow()` (`:1006`). One unreadable directory under `<repo>/sites` (or a remembered dir replaced by a file, ENOTDIR) exits the app. The renderer-side rescan fix (`f02ac28e`) cannot help; the renderer never opens.

### D-06 (codex) — CONFIRMED (Medium) — a crashed child stays "running"; Start reuses the dead handle
- `apps/desktop/src/tovu-server.cjs:~500-517`: the only exit listener is `child.once("exit", ...)` -> `finish(...)`, a no-op once `settled` is true (boot line already seen). The resolved handle exposes no exit event; `main.cjs` registers no other `exit` listener (grep: only `:381` in `stopChild` and `:515`).
- `main.cjs:569-576` `openSiteServer` returns `already.server` whenever `openSites` has the key -> after a crash, "Start site" returns the dead handle and spawns nothing; `buildProjectRecord` (`project-ipc.cjs:53-72`) keeps reporting `running`. The comment claiming the poll catches crashes is unsupported by any producer of that status.

### D-03 (codex) — CONFIRMED (Medium) — webview failure listeners never attach after Start
- `apps/desktop/src/renderer/App.hooks.ts:645-689` `useWebviewLoadFailure` effect deps are `[webviewRef, resetKey]`; it returns early when `webviewRef.current === null` (`:660-661`). `App.tsx:505,512` passes `resetKey = reloadNonce:view`; `running` (`:505`) is not part of the key. The stopped tab renders `ProjectStartPanel` (ref null); when the poll flips `status` to running the `<webview ref>` mounts (`:611`) but neither dep changed, so no `did-fail-load` listener or stall timer is ever installed for the first load. Same on retry from the failure panel.

### D-07 (codex) — CONFIRMED shape (Low) — second desktop instance overwrites the first's crash-safety row
- `apps/desktop/src/site-registry.cjs:86-89` `recordSiteOpened` replaces by `siteDir` only. `reconcileOrphans` (`:246-264`) correctly retains a live sibling's child (ppid != 1), but a second instance opening the same site rewrites the row with its own pid; a later hard-kill of the first leaves its child unrecorded.

### DS-01 — PLAUSIBLE (Low) — `e332ec33` treats cookie presence as session validity
- `apps/desktop/src/desktop-auth.cjs` `hasActiveSessionCookie` = `cookies.get({name:"tovu_session"}).length > 0`; `main.cjs` then sets `emitBootToken: !alreadyAuthenticated` and skips `authenticateSiteSession`. A cookie whose server row is gone (DB restore-point rollback, `cleanup-stale-owner-sessions --apply` after clock skew, any server-side revoke without the desktop's own logout) yields a 401 admin with no boot token minted and no password to fall back on. Recovery is quit+relaunch (`endSiteSession` on quit hits `/auth/logout`, which clears the cookie even for an unknown token). Not reproduced; inferred from the read.

### PG-01 — PLAUSIBLE (Low) — `schema.postgres.ts` did not get `autosave_json`
- `e94da8f8` added `autosaveJson` to `apps/website/src/platform/db/schema.ts:166` + `drizzle/0058_keen_mauler.sql`; `schema.postgres.ts` has no such column (grep empty). Its only production consumer is `platform/db/migration/manifest.ts`; Postgres-at-site-creation is CANCELLED, so dialect drift rather than a live defect.

### Not findings (pending-list, read)
- `e56965a6` tsc baseline: type-only (`includeIfNonEmptyString` widens to accept `null`; `AgentElementRole` typing; test typings). No runtime change found.
- `a9f84cdc` PageEditor: pure `PageEditorPane` extraction; props threaded 1:1.
- `0b7b6de1`: `pageAcceptsHtmlBody` guards the doc->html conversion on a real Tiptap doc (F01 guard) — correct. `05782b71`: page unsaved-work guard wired via `useDirtyGuard` (`use-page-editor.hooks.ts:152`).
- `c171e62b`/`6df1f9a7` settlement: every adopting file pairs `next()` with `isCurrent()` (8 files checked; `use-roles.hooks.ts` references it only in a comment).
- `c201d948`/`f02ac28e` rescan: `setProjects(await bridge.rescanProjects())`, error captured, `finally` clears the flag; the poll's cancel flag prevents post-unmount sets.
- `a346b3ec` media-import: contributed via `tool-catalog-manifest.ts` -> `assistant/tool-registrations.ts` (BYOK and daemon arms share the manifest).
- `ae13e739`: `writeAllowedToolNames` spec present (`settings/rules.ts:158-163`); server `routes/external-mcp/put.ts:86` parses it; store persists it.
- `04806e6b` AVIF: server acceptance lives in Jini's `content-type-sniffer.ts` (already `image/avif`); admin arms (`Media.tsx:612`, `use-post-editor.hooks.ts:344`) now match. No one-arm gap.
- `ea5f3a42`/`b3553dd9` NUL escapes: the backslash-u0000 escape inside a template literal is the same code unit as the raw byte (`builtin-role-grants.ts`). No semantic change.
- `d131619d`/`8a14b56a`/`6998ef9c` repairSite: refuses partial markers, unmigrated/diverged db; unlinks `config.json` if the meta write fails.
- `0b298d86` attachment read: owner check, containment, integrity (dev/ino/size). `f281d3a2` promote: Jini `resolveForRun` only matches KNOWN records by id or recorded path (`http-kit/src/attachments.ts:1213`) — no arbitrary-path read. `feb8a777` scoped by principal. `3b196ffb`: both processes use `resolveChatAttachmentUploadDirectory()`.
- `7b2a2007`/`916eb8b0` egress policy: shared constant wired at `deps.ts:1137,1147`; media-import keeps its own 3-redirect policy.
- `570e5822`: `--db` no longer defaults to the live db. `11aa4708`: `pages.edit_html` grant registered via side-effect import of `features/pages/permissions.ts`. `ed397627` cleanup script: dry-run opens read-only, `--apply` captures a restore point first.
- `26985a2d`/`933c69e9` "design" commits carry hook files, but the hook changes are SVG icon components and tab metadata only.
- Desktop window-vs-tab: three same-day commits (`868cfe72` windows, `204e01a7` tabs, `9e77a778` restore tabs) leave BOTH `openSiteWindow` (`main.cjs:515`, still called from the adopt flow `:653` and own-server mode `:914`) and `openSiteServer` (`:569`) live; both store a `{server}`-shaped entry in `openSites`, so the shared readers stay coherent.

## Findings index (severity-ordered)

| Id | Sev | Status | One line |
|---|---|---|---|
| C01 | High | CONFIRMED | `updatePost` compares `expectedVersion` in memory then `save()` upserts with no version predicate; two awaits sit between (`post.ts:974-999`, `repo.sqlite.ts:167-190`). Same file already has the right primitive (`writeAutosave`). |
| D-05 | High | CONFIRMED | Desktop Delete bypasses the per-id serializer Start uses; `openSites` is populated only after the child boots -> rm under a booting `tovu serve`. |
| C02 | Low-Med | CONFIRMED | `PUT /pages/:id` drops `expectedVersion` (`pages/update.ts:23-33`). Admin has no client for that route (PageEditor uses `/posts/:id`), so reach is external API clients only. |
| C03 | Medium | CONFIRMED | `duplicateSite` into a pre-existing empty dir with no portable entries never sets `wroteAnything`; `config.json`/partial `content.db` survive a failure and the retry hits `InitDirNotEmptyError`. `initSite` is NOT a sibling (its subdir mkdirs flip the flag). |
| MCP-01 | Medium | CONFIRMED | `refusal-notice.ts` reports `duplicate-remote-tool-name` refusals without subtracting `admitted`; the prefix then tells the model the tool "is NOT in search_tools ... calling it is impossible" while it is registered. |
| ADM-002 | Medium | CONFIRMED | Restart mutation has no `invalidates`; admissions query has no polling/focus refetch -> stale refusal + "Restarting..." until remount >10 s later. |
| D-01 | Medium | CONFIRMED | One EACCES/ELOOP/ENOTDIR candidate under `sites/` throws out of `discoverSiteDirs` -> `reportBootFailure` before the fleet window opens. |
| D-06 | Medium | CONFIRMED | Post-boot child exit is unobserved; `openSites` keeps the dead handle; Start returns it. |
| D-03 | Medium | CONFIRMED | `useWebviewLoadFailure` deps exclude `running`; listeners never attach to a guest mounted after Start. |
| D-02 | Medium | CONFIRMED | Supabase/Custom DB choices are selectable, then `handleCreate` ignores them and reports `sqlite`. |
| ADM-001 | Low-Med | CONFIRMED shape | Drift is `saved - live` only; a removed-but-still-live tool and a connection added after boot produce no row (`admissions-rules.ts:180-183,207-212`). |
| SEO-01 | Low | CONFIRMED shape | `setEntrySeoOverrides` is another read -> compare-less full-row `save()` with a version bump; now user-visible via autosave `applied:false` and `expectedVersion` 409s. |
| D-04 | Low | CONFIRMED shape | Delete guard = origin+containment; no identity/marker check of the directory at that path. |
| D-07 | Low | CONFIRMED shape | `recordSiteOpened` replaces the row by `siteDir`; a second desktop instance drops the first child's pid. |
| ESC-01 | Low | CONFIRMED | `1044e2d5` "every copy" left `page-head.ts:194-200` without the `'` escape (no single-quoted sink there today). |
| DS-01 | Low | PLAUSIBLE | `e332ec33` skips the boot token whenever a `tovu_session` cookie EXISTS, not when it is VALID. |
| PG-01 | Low | PLAUSIBLE | `schema.postgres.ts` lacks `autosave_json`; Postgres is cancelled, so drift only. |

Refuted/none: nothing codex claimed in the verify list was refuted; every one held on read. Not re-reported (fixed post-HEAD): J01, MI-01, MI-02 (`103f7ae1`), chat-run death path (`f682eff2`).

## Open questions
- C01/C02/SEO-01 share one fix: give `PostRepoPort.save()` (or a new `saveIfVersion`) the `eq(posts.version, expected)` predicate `writeAutosave` already uses, and make `updatePost` treat `changes === 0` as `PostVersionConflictError`. Who owns `features/post` tonight?
- Is `PUT /pages/:id` meant to keep `templateChoice`/`overridesThemePage` out too, or is the parser simply stale? The route doc claims parity with `posts/update.ts`.
- Desktop: is `openSiteWindow` (window mode, `main.cjs:515`) still a supported path or leftover from `868cfe72`? Both modes are live at HEAD.
- Not reached this run (see ledger `NOTREACHED`): `6a0bd61c` preload IPC surface (security lens), `10fb9215` build, `b27cdba4` (MenuEditor, off limits).

## Ledger — all 243 commits

Legend: R = code read at frozen HEAD by this run (finding ids above where relevant). RC = codex `reviewed`; spot-checked here (`e332ec33` -> DS-01; `cbb727db` stat only; `dd187ece`/`b1ce2d0a` covered by MI-01/02 fix `103f7ae1`; `3bc9a415` e2e-only). TAG = agentHandle data-attribute tagging by subject; not read. A11Y = accessible-name fixes; one sampled (`ec725ad8` uses `aria-label`, not the agentHandle label); rest not read. NEST = button-in-anchor markup only; not read. UI = layout/copy-only by subject; not read. DESIGN = CSS/markup (stat checked: no logic files beyond SVG icon components). SCRIPTS = AAD backfill runner migrations; runner read: dry run opens read-only, `--apply` captures a restore point, all six default `--db` to `infra/content.db` (not the live site db). TEST = tests out of scope this pass. DOCS = docs/todos/reports only. NOTREACHED = not examined; reason in Open questions.

| Commit | Status | Subject |
|---|---|---|
| efc6847e | DOCS | docs(ads-memory): handoff for session tovu-14 |
| 0bfd3430 | DOCS | docs(ads-memory): record that commit trailers misattribute the model |
| b06b4ec7 | DOCS | docs(todos): close the two entries tonight's work shipped |
| 37ac1943 | R | feat(admin/settings): show the operator which external MCP tools the assistant refused |
| f02ac28e | R | fix(desktop/projects): stop a failed rescan blanking the grid, and unstack the header |
| c201d948 | R | feat(desktop/projects): add a Rescan control so discovery is not only a boot step |
| 65b8fd74 | R | feat(desktop/projects): scan for sites on disk at boot, so one made outside the shell... |
| 4ede4562 | NOTREACHED | fix(e2e/types): type the desktop-shell application-menu walk instead of leaving it im... |
| 0d9e41d5 | R | feat(mcp-federation): tell the MODEL which external tools were refused, and why |
| e56965a6 | R | fix(admin/types): clear the 31-error tsc baseline in apps/admin |
| 8e973578 | R | fix(admin/workspace): refuse deleting the server's own bound workspace (INV-05) |
| 8a4e405d | R | fix(admin/menus): log the update-tree catch-all 500 instead of discarding it |
| b2a46c7e | R | feat(desktop/projects): record removals, so the seed guard can ask about the directory |
| 24bdafc1 | TEST | test(media-import): prove the bytes, not that a row exists |
| a346b3ec | R | feat(assistant): make media_import_from_url findable, and close the catalog gap |
| dd187ece | RC | feat(media-import): add media_import_from_url, the missing import-by-URL tool |
| b1ce2d0a | RC | feat(platform/http): make the guarded HttpResponse byte-capable |
| fb5ad748 | DOCS | docs(todos): mark the non-basic theme shells out of scope |
| 0ea4f887 | DOCS | docs(ads-memory): record three commits carrying another commit's message |
| fa70c175 | DOCS | docs(ads-memory): record that the media-seed fix DID deploy, and the regression since |
| 68ce4909 | DOCS | docs(todos): close the HTML-Page fallback-shell entry against a live measurement |
| 570e5822 | R | fix(scripts): stop backfill-external-mcp-aad defaulting --db to the live site database |
| b27cdba4 | NOTREACHED | refactor(admin/menus): move ItemRow's Remove-confirmation logic into MenuEditor.hooks... |
| 9e77a778 | R | feat(desktop): restore the tab strip and embedded project workspace |
| 204e01a7 | R | feat(desktop): embed a project as a tab, not a new BrowserWindow |
| c2e206db | DOCS | docs(ads-memory): map Tovu Runner and its connection to Tovu |
| 3bc9a415 | RC | fix(desktop/e2e): stop the e2e suite writing into the real Electron userData dir |
| fc3bff7c | DOCS | docs(todos): file the single-window desktop shell and two gaps found live |
| 2b69b327 | NOTREACHED | fix(admin/settings): restore the tsc baseline in the field-spec test |
| f50b8463 | TEST | test(admin/settings): add exhaustive route-vs-field-spec coverage for External MCP |
| 6df1f9a7 | R | refactor(admin/hooks): adopt useSettlementGeneration at 8 call sites |
| cc01bce7 | DOCS | docs(todos): settle the footer menu content-ref-vs-raw-URL question |
| 6bf0fc86 | DOCS | docs(todos): re-measure the footer dead-links entry against the running site |
| ae13e739 | R | fix(admin): add the missing writeAllowedToolNames field spec |
| c171e62b | R | feat(admin/hooks): extract shared useSettlementGeneration guard |
| 13acf9d3 | DOCS | docs(ads-memory): explain the AAD backfill scripts and the --db asymmetry |
| 01146403 | NEST | fix(admin): drop invalid button-in-anchor nesting on 8 more screens |
| ab022bae | DOCS | docs(ads-memory): record boot-orchestration dedup fix report |
| d1eea4b2 | R | refactor(boot): dedupe agentDaemonWanted/logCriticalBootFailures; close export's migr... |
| ed397627 | R | chore(scripts): add operator-invoked cleanup for stale owner sessions |
| 8d041b52 | R | refactor(outbox): move the retry-cap terminal-state decision into the worker |
| 874ee54d | DOCS | docs(ads-memory): correct C1 -- the .btn-* fix was never missing |
| 530d6122 | NEST | fix(admin): drop invalid button-in-anchor nesting on 3 more back/create links |
| a44148a1 | NEST | fix(admin/collections): drop invalid button-in-anchor nesting; correct stale CSS comment |
| 4c6a0797 | R | refactor(auth): delegate mintSessionForPrincipal to Jini's shared minter |
| 1044e2d5 | R | fix(render): escape apostrophes in every escapeHtml/escapeHtmlAttr copy |
| 4c65e392 | R | fix(admin-voice-input): release the mic if held released mid-permission-prompt |
| f31e6ded | R | fix(sites): thread the real boot-resolved site binding through RouteDeps instead of r... |
| 00bc4bd6 | R | fix(admin-security): stop "Make default" from also toggling its own row |
| ee14d334 | TEST | test(backfill-execution-aad): refresh fixture tripwire for migration 0058 |
| 527077b6 | TEST | test(assistant): fix stale audit-detail assertion in byok-tool-surface INCIDENT FIX test |
| 80e69410 | DOCS | docs(reports): mark the AAD backfill dedupe report complete |
| a68526dd | SCRIPTS | refactor(scripts): migrate backfill-external-mcp-aad.ts onto the shared runner |
| a19708d3 | TEST | test(scripts): add a characterization test for backfill-external-mcp-aad.ts |
| 916eb8b0 | R | refactor(deps): wire deps.ts onto the shared single-hop HTTPS egress policy |
| 7b2a2007 | R | refactor(platform/http): extract the shared single-hop HTTPS egress policy |
| 384790fa | DOCS | docs(reports): admin visual polish — six-combination proof of the Settings light pin |
| f1b13b38 | TEST | test(admin/settings): pin that the Settings page cannot render dark |
| 7caa2b71 | R | fix(post): enqueue entry.published when a post/page is created already published |
| 7b138c50 | SCRIPTS | refactor(scripts): migrate backfill-site-assistant-credential-aad.ts onto the shared ... |
| 0af0748e | SCRIPTS | refactor(scripts): migrate backfill-media-provider-credential-aad.ts onto the shared ... |
| 3f0c9915 | SCRIPTS | refactor(scripts): migrate backfill-execution-credential-aad.ts onto the shared runner |
| 08ace3ea | R | fix(assistant): route BYOK's tool executor through the shared read-only-gated stack |
| 11aa4708 | R | fix(identity): register this repo's pages.edit_html grant in the backfill script, wit... |
| 6be26ddb | TEST | test(site-glue): fix REQ-8 assertion that relied on the pre-fix immediate-reclaim bug |
| d3161f2e | SCRIPTS | refactor(scripts): migrate backfill-connector-credential-aad.ts onto the shared runner |
| 947c0fa1 | SCRIPTS | refactor(scripts): migrate backfill-composio-config-aad.ts onto the shared runner |
| 5ae37c8b | DOCS | docs(reports): admin visual polish — add the two Settings-pin commits to the commit... |
| ea8c660b | DOCS | docs(reports): admin visual polish — Settings pinned to light, inert-control conseq... |
| 89c8c380 | DESIGN | design(admin/settings): pin the page to light and take it fully out of the card |
| 5182994a | SCRIPTS | refactor(scripts): add shared AAD backfill scaffold, not yet wired to any script |
| 7d7ae169 | R | fix(members): correct decideTiersAccess's @complexity from O(t) to O(t·a) |
| 0ae3429d | R | fix(outbox): stop immediate re-queue, add exponential backoff and an attempt cap |
| a9a6e3a9 | R | fix(export): scheme-check the redirect stub's href sinks |
| d10f6708 | DOCS | docs(reports): record theme content-template naming drift investigation |
| 2b039738 | R | test(auth): add the boot-session route's first server-side test; fix a false comment |
| 563e58af | DOCS | docs(reports): admin visual polish pass, 2026-09-06 |
| 933c69e9 | R | design(admin): give the Database and Sites tab rows the icons every other tab row has |
| bc22ff14 | DESIGN | design(admin): apply the form measure to the Users and Integrations create forms |
| b8c321ef | DOCS | docs(reports): excess/dead-code review of the 2026-09-01 to 09-03 commits |
| ad20fc76 | DOCS | docs(review): add architecture/DI review for 2026-09-01 to 2026-09-03 |
| 9f13f0e3 | DESIGN | design(admin/settings): take the Settings surface out of its card when it renders light |
| 262a596b | DOCS | docs(reports): bug-hunt review of 2026-09-01 to 09-03 commits (292, unreviewed window) |
| e332ec33 | R | fix(desktop): stop minting a fresh 30-day session on every launch |
| b357e70c | DOCS | docs(architecture): reconcile ADR-INDEX with three missing ADRs and the ADR-047 audit... |
| 26985a2d | R | design(admin/media): draw the tab strip with the shared TabBar, with icons |
| fe0046dd | DESIGN | design(admin/sites): make the card's head its status strip; demote the second pill to... |
| ff5513fa | DOCS | docs(ads-memory): consolidated handoff from session tovu-8f |
| 645f3221 | DESIGN | design(admin): give single-column forms one shared measure instead of the full column |
| 9051e2b5 | R | fix(site-dir): stop duplicateContentDb wiping every plugin's data from the copy |
| 96f656cd | DOCS | docs(todos): pass 8 additions — record the tovu-8f peer handoff |
| b3553dd9 | R | fix(media): escape the last three literal NUL bytes in tracked source |
| 5152128e | DOCS | docs(ads-memory): close out the todos de-stale report |
| e99249e2 | DOCS | docs(todos): de-stale pass 7 — the tail sections |
| c71c5923 | DOCS | docs(todos): de-stale pass 6 — Master Build Inventory sections 19-25 |
| 210b3751 | DOCS | docs(todos): de-stale pass 5 — Master Build Inventory sections 1-18 |
| ea5f3a42 | R | fix(repo): escape literal NUL bytes in source so git and grep can read them |
| 27ccb328 | A11Y | fix(admin-security): name every access-token dialog and give ambiguous per-row button... |
| 00718e89 | A11Y | fix(admin-database): give every timeline row's Recovery link a distinct accessible name |
| ec725ad8 | A11Y | fix(admin-recovery): give every row's Restore button a distinct accessible name |
| af8d083a | DOCS | docs(todos): de-stale pass 4 — Accomplish, ADR map, research backlogs |
| 0d63cfd8 | R | fix(site-dir): stop duplicateSite shipping the source site's private databases |
| 6528ed5a | DOCS | docs(todos): restore four sections pass 3 deleted by mistake |
| ef7fa9c8 | R | feat(chat-db): detect conversations stranded in content.db by the chat.db split |
| abfc98fe | A11Y | fix(admin-taxonomy): term rows get a real role, valid selected-state, and a clean name |
| e2aafba6 | A11Y | fix(admin-sites): give every site card's Activate button a per-site accessible name |
| 3d702539 | A11Y | fix(admin-plugins): give repeated Enable/Disable/Inspect buttons a per-row accessible... |
| 30288302 | DOCS | docs(todos): de-stale pass 3 — Active Working Items AW-1..AW-7 |
| d10486d5 | A11Y | fix(admin-themes): give repeated Activate/Explore/Download buttons a per-card accessi... |
| 6442b34f | R | fix(form-render): setInputValueAttr can't span an embedded opposite quote char |
| 5e593ab4 | DOCS | docs(todos): de-stale pass 2 — Admin Section Spec Sweep + 2026-08-10 slice |
| cb3789a9 | NOTREACHED | fix(gitignore): close chat.db + db-snapshot leak opened by the content.db split |
| df07b37c | DOCS | docs(todos): de-stale pass 1 — top-of-file dated entries |
| fe76057d | A11Y | fix(admin-media): give the upload toolbar's file/alt inputs a real accessible name |
| 552e806d | DOCS | docs(reports): code-inspection bug hunt for the 2026-09-04/05 commits |
| 0b298d86 | R | feat(assistant): serve a staged chat attachment's bytes back to its uploader |
| 3b196ffb | R | refactor(assistant): give the chat-attachment upload directory one definition |
| efeeb67a | NEST | fix(admin-themes): remove invalid button-in-anchor nesting on ThemeExplore's back con... |
| f239866e | R | feat(admin-posts): tell the operator when autosave has stopped, instead of nothing |
| e5a434c3 | R | feat(admin-pages): tell the operator when autosave has stopped, instead of nothing |
| 52caa8cc | DOCS | docs(reports): scrub a NUL byte the report tool itself introduced; note it as F4 evid... |
| a9aac85b | DOCS | docs(reports): un-corrupt the 2026-09-04..05 excess-code review (literal NUL -> escap... |
| ee304d5e | DOCS | docs(reports): architecture & DI review of the 2026-09-04/05 commits |
| ef79b352 | DOCS | docs(reports): excess/dead-code review of the 2026-09-04..05 commits |
| 6f32d027 | R | refactor(website): inject the tool-attempt audit sink; drop RouteDeps.contentDbPath |
| 0c1a1324 | NOTREACHED | chore(architecture): register cli/commands/adopt.ts as a composition root |
| b37864c3 | R | feat(post-tools): wire expectedVersion through content_post_update, the guard's last ... |
| 2756ac26 | R | refactor(posts): lift expectedVersion's boundary out of the route so a second arm can... |
| 2bb817f6 | TEST | test(admin-seo): make the cleared-field test assert what its name claims |
| 62634037 | R | feat(cli): add `tovu adopt <dir>` -- the missing route from an existing site dir to s... |
| 6998ef9c | R | refactor(site-dir): expose the marker-pair classification repairSite already computed |
| a50458bf | R | fix(desktop): reap orphaned tovu serve on every boot mode, never a live sibling's |
| d033ffb8 | R | fix(admin-seo): let an operator clear an SEO override, not just blank it |
| 90e68e8f | DOCS | docs(posts-autosave): correct a route comment that described client logic which never... |
| a60e07e8 | R | fix(admin-autosave): act on putAutosave's `applied` instead of discarding it |
| ed5fae17 | R | fix(desktop): refuse to rm a project directory the app did not create |
| 72e1e529 | R | fix(assistant): stop every source edit from destroying staged chat attachments |
| f3bdd3af | R | feat(admin-posts): send the loaded version and surface the 409 without losing the ope... |
| fb473613 | TAG | feat(admin-settings): pass agentHandle to the 11 @jini-ai/ui-mounted Settings tabs |
| b359e613 | R | fix(website): add RouteDeps.contentDbPath and make the BYOK tool-audit sink lazy |
| e595312f | R | types(admin-api): let api.updatePost carry an optional expectedVersion |
| 76d7c739 | R | fix(desktop): one adoption chokepoint for every site-dir entry point |
| ffc37e59 | DOCS | docs(ads-memory): refactor review of the 2026-09-06 commits - excess and dead code |
| b81d57b1 | DOCS | docs(ads-memory): code-inspection bug hunt over the 2026-09-06 commits |
| 4e64e467 | DOCS | docs(ads-memory): architecture and DI review of the 2026-09-06 commits |
| eb678ed3 | UI | feat(voice-input): add a "Disabled for now" tooltip to the mic button |
| 9c7d16bf | R | feat(posts-route): forward expectedVersion and give the version 409 its own code |
| a9f84cdc | R | refactor(admin-pages): bring PageEditor under the 9/9 complexity ceiling |
| 0b7b6de1 | R | fix(admin-pages): let a newly created page accept hand-authored HTML |
| be45461e | R | feat(post): add opt-in optimistic-concurrency check to updatePost |
| f92e835f | DOCS | docs(ads-memory): record the f3579456 authorship misattribution |
| bbd297d8 | R | fix(desktop): make Projects-screen seeding survive an emptied registry |
| 013ca04e | DOCS | docs(ads): record the outstanding worklist from session tovu-f6 |
| 7afe17a7 | DOCS | docs(admin): correct pages/posts as done, not permanently excluded |
| 48bf42c8 | TAG | fix(admin-posts): tag PostEditor's delete ConfirmDialog with agentHandle |
| f3579456 | TAG | feat(admin-pages): tag PageEditor's remaining view/device controls |
| 3ad87f39 | TAG | feat(admin-pages): tag ThemePagesTab and ThemePageDetailsModal controls |
| 2202253d | TAG | feat(admin-pages): tag Pages.tsx's list and tab controls |
| 56f6b46b | TAG | feat(admin-posts): tag Posts.tsx's list controls |
| 6462865e | DOCS | docs(admin): correct the Access Tokens live-verification handle names |
| fe5c8974 | DOCS | docs(admin): record Phase 4 - ai-assistant, media, and the 8 spot-check screens |
| c84559e8 | TAG | fix(admin-security): tag credential fields and Cancel/trigger buttons |
| 34a69401 | TAG | fix(admin-deployment): tag the two remaining external links on Static Site |
| 273b43cb | TAG | fix(admin): tag remaining agent-driveable gaps in sites and collections |
| 935762a5 | TAG | fix(admin-media): pass agentHandle to the purge ConfirmDialog |
| 978a7ca3 | TAG | feat(admin-ai-assistant): tag AiAssistant screen's Tovu-owned controls |
| 125b8dcc | DOCS | docs(admin): record pages/posts as permanently excluded from the agent-tag sweep |
| 8383d732 | DOCS | docs(admin): record Phase 3 live verification and handoff for the agent-tag sweep |
| ffc6ce5e | DOCS | docs(admin): update agent-tag coverage report through the settings pass |
| 7637876d | TAG | feat(admin-settings): tag the Tovu-owned controls on /admin/settings |
| feb8a777 | R | feat(assistant): add chat_list_pending_attachments so the model can find unclaimed up... |
| fb5a1909 | TAG | feat(admin-themes): tag the remaining controls on the main Themes screen |
| 98e3021c | TAG | feat(admin-payments): tag the three cross-links on /admin/payments |
| d52258af | TAG | feat(admin-plugins): tag Plugins, AgentPlugins, and the plugin details modal |
| 10efb899 | R | fix(autosave): flush the pending standing draft on exit instead of cancelling it |
| eb10f5de | R | fix(seo): allow clearing a per-entry SEO override via null |
| c08155f2 | TAG | feat(admin-redirects): tag every control on /admin/redirects |
| be0f582a | TAG | feat(admin-integrations): tag the remaining controls on /admin/integrations |
| b5439d94 | TAG | feat(admin-workspace): tag the rename form and delete button |
| a5dd5e09 | TAG | feat(admin-recovery): tag every control on /admin/recovery |
| c629c0e6 | TAG | feat(admin-widgets): tag every control across all four widgets screens |
| cdb205a5 | TAG | feat(admin-dashboard): tag every link on the Overview screen |
| f7b8af1c | TEST | test(assistant): prove media_promote_chat_attachment is generic, not AVIF-specific |
| 6e71742c | TAG | feat(admin): wire agentHandle onto every remaining untagged ConfirmDialog |
| 1d5c0376 | DOCS | docs(desktop-e2e): correct a comment that promised isolation the suite does not have |
| f281d3a2 | R | feat(assistant): add media_promote_chat_attachment, bridging chat uploads into the me... |
| e804d16d | TAG | feat(admin-comments): tag every control on /admin/comments |
| cbbda021 | TAG | feat(admin): tag Members' remaining controls and wire ConfirmDialog handles |
| 54051fe3 | UI | fix(desktop): rename the fleet window title from Tovu Runner to Tovu |
| 7198436e | TAG | feat(admin-seo): tag the per-entry override editor and picker for agent driving |
| a53c80df | UI | feat(desktop): make the Projects screen the default front page |
| a4efd9c2 | TAG | feat(admin-roles): tag the remaining untagged controls on /admin/roles |
| 4f2052f6 | UI | fix(admin-assistant): move the composer mic button next to the "+" |
| 79ade955 | TAG | feat(admin-database): tag every interactive control on /admin/database |
| ab5f4b0f | TAG | feat(admin): wire agentHandle through every Placeholder-backed nav page |
| 8cfb8eb9 | DOCS | docs(admin): audit agentHandle coverage across every nav-listed admin page |
| 27a05955 | DOCS | docs: handoff for the rotated-out autosave-drafts agent |
| 34694309 | R | wip(posts): autosave recovery banner in PostEditor, state unverified |
| a4b99c90 | R | feat(pages): render the standing-draft recovery banner in PageEditor |
| 559655cb | R | feat(posts): wire standing-draft autosave into usePostEditor; fix slug URLs |
| 0911b45d | DOCS | docs: record that both handoff tasks belong to the peer session |
| 3f6097dc | DESIGN | design(admin/seo): drop the Entry caption and take Pages & posts full width |
| 24386850 | DOCS | docs: handoff for a second session - mic button, and the AVIF upload bridge |
| 05782b71 | R | feat(pages): wire standing-draft autosave + add the missing unsaved-work guard |
| 3a3dea2b | DOCS | docs(admin/seo): correct the file header the de-carding made stale |
| 613ea7e2 | DESIGN | design(admin/seo): take the per-entry panels out of their boxes too |
| 9ac963e0 | R | fix(posts): standing-draft autosave carries title explicitly |
| f8fc6b8e | DESIGN | design(admin/seo): take the defaults form and sitemap panel out of their cards |
| 56a0fc09 | R | feat(admin): shared standing-draft autosave hook + api client functions |
| eba275f4 | R | feat(posts): standing-draft autosave persistence + HTTP surface (posts+pages) |
| 868cfe72 | R | feat(desktop): route project cards to their own window, strip the webview model |
| 04806e6b | R | feat(media): accept AVIF in the admin upload surfaces, with regression tests |
| 72a8dcb6 | UI | feat(admin-roles): convert /admin/roles to a two-tab screen |
| e94da8f8 | R | feat(posts): add nullable posts.autosave_json column for standing-draft autosave |
| 20be2646 | DOCS | docs(tasks): refresh - 23 commits landed, four agents in flight, five new findings |
| cbb727db | RC | fix(desktop): restore own-server boot mode gutted by the boot-token commit |
| 56e87ae0 | UI | feat(admin-seo): convert /admin/seo to a three-tab screen |
| 2c6e0b07 | UI | fix(post-editor): move preview-fallback notice above the frame, mirroring Pages |
| cf05115c | DOCS | docs(desktop): handoff for the rotated-out runner-ui-port agent |
| 15548bef | R | feat(auth): loopback boot token — the desktop admin comes up with no password |
| 0a1fb89e | UI | fix(admin-settings): remove the peach background from /admin/settings |
| 30e68c54 | UI | fix(admin-editors): compress the action row's band and give it a left anchor |
| de1e1e2e | TEST | test(desktop-e2e): assert the admin comes up authenticated |
| 2aa317ab | R | feat(desktop): the admin comes up authenticated — no login screen |
| fb996e8f | UI | feat(desktop): use the Tovu logo as the app and nav mark |
| 29a7f036 | UI | feat(admin-editors): move Published/Save/Delete to their own row under the toolbar |
| 8e5a9d74 | UI | feat(admin-editors): centre the editor title, move the back link to the far left |
| 5178eea5 | DESIGN | design(landing): gold, black and white — the filled pill goes gold in dark mode |
| 717273e8 | DOCS | docs(tasks): no SITE password at all, and the default-owner-password finding |
| b3f613a6 | DESIGN | design(landing): cycle the hero verb with kUInetic's word-cycler, as x.ai does |
| 14167454 | TEST | test(desktop): first E2E that actually launches apps/desktop, and one RED |
| f66ef907 | DESIGN | design(landing): rebuild the xAI-language homepage sample around x.ai's structure |
| af67f51e | DOCS | docs(desktop): manifest v2 — option-2 scope, N-BrowserWindow model |
| 6a0bd61c | NOTREACHED | feat(desktop): port the Runner preload and add TOVU_DESKTOP_UI=runner |
| 4c75f4c0 | R | feat(desktop): port Tovu-Runner s renderer and shared contracts |
| 10fb9215 | NOTREACHED | build(desktop): stand up the renderer build inside apps/desktop |
| 098e3466 | DOCS | docs(desktop): record the Tovu-Runner UI port manifest before any code lands |
| 46513d83 | DOCS | docs(ads-memory): hand off tovu-c0 — three owner-only commands, and apps/desktop ne... |
| 32af5802 | DOCS | docs(index): record the reverted HTTP/2 attempt (Node-core crash, reproduced 3x) |
| 2cd019cd | R | fix(assistant,settings): drop the Connection header on HTTP/2 SSE streams |
| 848ddd09 | R | fix(admin-dev-proxy): strip hop-by-hop headers before relaying Vite's response |
| d131619d | R | feat(site-dir): add repairSite — write marker files into a pre-marker-convention site |
| 8a14b56a | R | refactor(site-dir): extract readAppliedSchemaIdentity, shared by the boot guard and r... |

Counts: R 86, RC 4, TAG 28, A11Y 8, NEST 4, UI 12, DESIGN 11, SCRIPTS 7, TEST 11, DOCS 65, NOTREACHED 7 = 243.
