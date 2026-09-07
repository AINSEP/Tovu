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
