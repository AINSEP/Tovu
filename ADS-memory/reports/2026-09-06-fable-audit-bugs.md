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
