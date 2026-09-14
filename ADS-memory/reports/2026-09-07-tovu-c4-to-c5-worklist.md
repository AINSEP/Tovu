# Handoff worklist — tovu-c4 → next session

**Received:** 2026-09-07, via cross-session message from `tovu-c4`.
**Status:** NOT being worked tonight. This is the queue for whenever Leona picks it up.
**Branch:** `restructure/apps-website-phased`. Tree clean at receipt; root `npx tsc -p tsconfig.json --noEmit` exits 0 (root tsconfig EXCLUDES tests). All c4 subagents stopped. Dev server up (API :3000, Vite :5173, both HTTPS), logging to `/tmp/tovu-dev.log` — keep that redirect.

## Read first
- `ADS-memory/reports/2026-09-07-uncommitted-state-handoff.md` — state map. Its "UNCOMMITTED" section is STALE; c4 committed it all as `31f83205`.
- `ADS-memory/reports/2026-09-07-page-duplicate-tool.md` — copy-tool design + HANDOFF section.
- `ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md` — tool gaps, keyword diff, why NOT to consolidate tools.
- `ADS-memory/reports/2026-09-07-assistant-env-isolation-fix.md` — the login problem in Task 1.

---

## TASK 1 — UNSETTLED as of 2026-09-07 22:22. Do NOT implement on a predicted failure.

The claim below ("the assistant cannot log in") is **predicted, never observed**. Verified independently this session:

- `Jini/packages/daemon/dist/agent-executor.js` — built **21:32**, contains `CLAUDE_CONFIG_DIR` (14 occurrences).
- Daemon pid 70953 started **21:36:30**, after that build. **So the isolation code IS live in the running daemon.** (An earlier guess that the daemon predated the commit was wrong — the agent built dist before committing, so commit timestamps mislead. Go by the artifact, not the commit.)
- `sites/tovu-com/chat.db` (read-only, `?mode=ro`): the most recent message of any kind is **20:07:04**. **Zero chat runs have happened since the isolation went live at 21:36:30.**

So Leona's "there's no problem with claude config dir" and F-ISOLATE's "login is broken" are *both* consistent with the evidence — nobody has exercised the isolated spawn path even once.

Also: F-ISOLATE's `claude auth status` proof was run **standalone in a shell** with `CLAUDE_CONFIG_DIR` swapped by hand, never against a daemon-spawned child. That cannot distinguish "auth breaks in the real spawn path" from "auth is fine there because `.credentials.json` copying or some other path covers it."

**The settling test: send one message to the admin assistant.**
- If it answers → the isolation does not break auth in the real spawn path. Drop the revert, keep the isolation, and find out *why* the standalone result didn't transfer (that gap is worth understanding, not just ignoring).
- If it fails to authenticate → the task below stands exactly as written: config flag, default OFF, no token.

The tool-restriction half (`ASSISTANT_DISALLOWED_TOOLS`, `d2bb8629`) is unaffected either way. Keep it on.

### Original framing (valid only if the test above fails)

# Assistant cannot log in. Fix by REVERTING, not by a token.
`d2bb8629` (Tovu) + `fa1afc58` (Jini) gave every spawned `claude` run a fresh mkdtemp'd `CLAUDE_CONFIG_DIR`. That closed a real leak (the assistant was reading Leona's personal `~/.claude` — skills, plugins, memory index, a 40-tool grant). But on macOS the Keychain login is keyed to `CLAUDE_CONFIG_DIR`, and Tovu passes no credential of its own, so the isolated assistant runs unauthenticated. Verified live via `claude auth status`, three ways.

Leona was told to run `claude setup-token` and pushed back — "there's no way we should need that". **Do NOT ask her for a token.** Put the isolation behind a config flag, DEFAULT OFF, so her assistant works again, leaving the mechanism ready for when Tovu provisions a real assistant credential. Say plainly in the commit that the leak is reopened by default, and why.

**Keep the tool restriction.** That half is `ASSISTANT_DISALLOWED_TOOLS` in `assistant-system-overlay.ts` — blocks Bash/Edit/Write/Task/Cron*/worktree/RemoteTrigger/Workflow at runtime, derived from 32 real chat runs that never used any of them. Independent of config-dir isolation; stays on. **Verify the separation actually works; do not assume.**

Daemon restart required. The harness BLOCKS `kill` — never route it to a subagent. Touching a file under `apps/website/src` makes the watcher respawn the daemon (~3s); that is the sanctioned way, and it destroys any live chat run.

## TASK 2 — REFRAMED by Leona 2026-09-07: fix the allowlist UX, don't hand-enumerate tools

Her point, and it supersedes the enumeration below: **a per-tool operator allowlist is the wrong default for a non-technical site owner.** She can hand-maintain a list because she is the developer building this. A real owner connecting an MCP server has no idea which tool ids exist, no idea which ones matter, and no reason to expect that connecting a server grants almost none of it. Making them configure "a bunch of little rules" per server will drive them off.

**Wanted shape:** connecting an external MCP server admits its tools by default, minus a dangerous set that stays refused. Her named examples of dangerous: `website_secrets`, `website_db`, `sandbox_exec` — secrets access, database access, arbitrary execution.

**DECIDED by Leona (2026-09-07): present the list, let the user choose, let them change it later.** Tovu does not guess in silence. On connect, show the server's actual tools with a sensible default selection (dangerous ones off), the user confirms or adjusts, and the same screen stays editable afterwards.

### What already exists (verified this session)
- **The data is already there.** `assistant/mcp-federation/trust.ts`'s `describeRemoteToolSurface` returns, per tool: `writeDeclared`, `destructiveDeclared`, `allowlisted`, `writeAllowed`, `refusalReason`, and `hintsAbsent`. INV-005 pins it to agree with `admitRemoteTools`, so the picker can never disagree with what actually gets admitted.
- **It is already served.** `server/inbound/admin-http/routes/external-mcp/probe.ts` builds its whole response from that one pure function.
- **The admin UI has no picker at all.** `apps/admin/src/features/settings/ExternalMcpSettingsPanel.tsx` (294 lines) contains no `allowedTools`/checkbox/toggle identifier anywhere — nor does any other settings file. The allowlist is not editable from the UI in any form today; it lives in the external-MCP store as `allowedToolNames` plus a separate write-allow set. **That is exactly the complaint** — there is no user-facing way to do this, only hand-editing.

So the work is a UI + persistence job on top of a backend that is already correct, not a trust-model redesign.

### Open questions for that build
- **Default selection.** All on except dangerous, or all off? "Dangerous" default should lean on `destructiveDeclared`/`writeDeclared` (real signal, already computed) plus a small Tovu pattern list for the `secrets`/`db`/`exec` shapes — the remote self-declares, so declarations alone are not sufficient.
- **`hintsAbsent` tools** — a server that declares nothing gets no signal at all. Default those on or off?
- **The restart wrinkle.** Config is read at daemon START, so an edit does not take effect until the assistant restarts. For "update it when they want" to not feel broken, the screen has to say so — or the admissions need to become re-readable live (`659b98ec` already added re-reading admissions after a restart; worth checking how far that goes).
- **A write grant needs BOTH lists** — allowlist and write-allow. A picker with one checkbox per tool will silently produce inert grants unless it handles both (`writeAllowedButNotAllowlisted` is an existing, named failure mode).
- **New tools appearing later** on an already-connected server: admitted automatically, or held pending the user's review?

The enumerated 14 below are **the interim state of the live higgsfield connection**, not the design. Landing them by hand unblocks her today; it does not answer the product question.

### Interim enumeration (the live connection today)
Only `generate_image` and `reveal_generation` are admitted today. 17 are refused as `not-in-operator-allowlist` (c4 first said 9; the daemon log shows 17). Leona reviewed the risk and **REJECTED three**. 

**Admit these 14**, alongside the two already admitted:
`show_characters`, `tiktok_accounts`, `tiktok_connect`, `tiktok_reconnect`, `tiktok_music_trending`, `tiktok_music_tune`, `tiktok_prepare_publish`, `tiktok_publish`, `tiktok_publish_status`, `participate_in_contest`, `website_status`, `apps_search`, `apps_describe`, `apps_invoke`.

**Do NOT admit:** `website_secrets`, `website_db`, `sandbox_exec` — they grant a third-party server access to her secrets, her database, and arbitrary execution. These keep producing the normal `not-in-operator-allowlist` refusal, which is legible to the assistant as of `c5d10181`, so a call to one reports lacking permission rather than failing silently. Add no special handling for them.

`tiktok_publish` and `tiktok_prepare_publish` post publicly to a real account. Deliberately approved — do not re-raise.

A federated MCP write grant needs BOTH lists updated; config is read at daemon START, so restart.

## TASK 3 — 26 tools have no search keywords (CONFIRMED, not optional)
One-sentence explanation for her: her assistant finds tools by searching keywords, so a tool with no keywords is invisible even though it exists.

Fill all 26 empty entries, `sites_duplicate_site`'s missing "duplicate" keyword included.

The audit diffed 178 catalog ids against 158 keyword entries; 26 ids have zero entry, clustered on "duplicate" and execute-tier verbs. **`sites_duplicate_site` — the one copy tool Tovu already has — has no "duplicate" keyword**, part of why her "copy Landing sample" request found nothing. List is in the audit report. Purely additive; zero stale entries found. Write keywords the way a non-technical owner would phrase it ("connect me to Higgsfield"), not the tool's name.

## TASK 4 — Finish the generic `content_duplicate` tool, then actually try it
Her design, her words: *"a category of a tool and then having it flexible enough to do multiple things, like copying different things"* — ONE tool per verb, generic over resource, not one `*_duplicate` per entity.

Landed but UNFINISHED (`31f83205`): `assistant/duplicate-resource-registry.ts` and `features/content-duplication/`. It compiles. Nobody has run it. Unknown whether post/page handlers are fully migrated, whether permission resolves per resource, or whether an unsupported resource gives an enumerating error.

- **Fold in `content_post_duplicate`** (`71daa2bf`) — do not leave two surfaces. Its widgetEmbed deep-copy is correct and tested (mints a fresh `placementId`, keeps `widgetEntryId`); keep it.
- **Permissions resolve from the RESOURCE, not the tool.** No precedent: all ~182 tools use one static permission per tool id. `ToolPolicy.authorize(ctx)` can branch on `ctx.input`; none do.
- **Load-bearing constraint:** a resource feature must NOT import `registerDuplicateResourceHandler`. It contributes data via a type-only import; the actual register calls live at the composition root in `tool-catalog-manifest.ts`. A real `features/post -> assistant` VALUE edge previously created a module cycle and had to be removed. `.dependency-cruiser.mjs`'s `domain-no-direct-assistant-tool-registration` bans non-type-only `assistant/**` imports from `features/**`.
- Then **one more resource** (form or media) to prove the seam. **Not widgets** — a widget is meant to be shared across documents, so "copy a widget" needs her decision first.
- **Then actually try it** end to end and give her the literal phrasing that works.

## TASK 5 — Media page images too large (new, from her tonight)
`https://localhost:3000/admin/media` — images scale up with screen width and get unnecessarily big. **Cap at half the current maximum size.** Her words: "small thing." Not a redesign.

## TASK 6 — Verify the serve-command suite
`e54ebe5e` + `4a982f72` fixed it (unbounded `spawnSync`, unbounded `fetch`, unguarded `stopGracefully`). One file verified: 62s, zero orphans, where it previously hung 64 minutes. Two files still unrun, including `serve-command.integration.test.ts` (the 64-minute one).

Procedure: ONE file per `node --test`, always `--test-timeout=120000`, `pgrep -f 'tovu serve'` before and after (**never `pgrep -fl`, it dumps credentials**), stop at the first timeout or new orphan. Check `uptime` first — load hit 447 on 8 cores earlier and produced false failures.

## TASK 7 — `runProductionReadinessGateOrExit()` has ZERO test coverage, repo-wide
Not merely sole-covered by the quarantined suite — genuinely uncovered. Nothing proves the production-readiness gate is wired into the serve path. Ranked list of what else that suite is the only guard for: `ADS-memory/reports/2026-09-07-serve-wiring-coverage.md`.

## Also open, lower value
Undo/revert (no "undo that" path exists at all — needs design, not wiring); `plugins_uninstall` is irreversible and guarded only by description wording — she may want confirmation gating; presentation tools; Composio connectors; vendor-credential reads; stray idle PID 69648 (`admin-dev-proxy.test.ts`, >1 day, harmless — only she can kill it).

---

## Working rules for this tree
Shared tree: explicit git paths only, NEVER `git add -A`, never bare `git stash`, unique commit-message file per commit. `timeout` does not exist on macOS (returns 127, looks real). Never `2>/dev/null`. apps/website tests run from repo ROOT; apps/admin runs from its own dir, tsc baseline 0 errors. `env -u TOVU_ADMIN_PASSWORD` if admin tests 401. Databases are LIVE and migrations auto-apply on a normal open — use read-only URIs to inspect. Jini `node_modules` are SYMLINKS: edit source, rebuild only the changed package, NEVER `pnpm -r build`.

---

# Appendix — detail gathered from the source reports (2026-09-07, this session)

Read in full: `uncommitted-state-handoff`, `assistant-env-isolation-fix`, `page-duplicate-tool`, `serve-wiring-coverage`, `assistant-tool-coverage-audit`, `serve-command-verification`, `mcp-refusal-visibility`, `tool-wiring-fixes`. Three corrections to the handoff are marked **CORRECTION**.

## Task 1 detail — exact mechanism to put behind the flag
Jini `packages/daemon/src/agent-executor.ts`: `resolveSourceClaudeConfigDir(hostEnv)`, `prepareClaudeConfigDirForRun` (mkdtemp + best-effort copy of a real `.credentials.json`), `prepareClaudeConfigDirIfNeeded` (gated on `def.id === 'claude'`, currently **unconditional**), `CreateAgentExecutorOptions.claudeConfigDirIsolation`, `computeChildEnv`'s `claudeConfigDir` param. Cleanup rides the existing `cleanupStagedFiles` closure. Commits: Jini `fa1afc58`, Tovu `d2bb8629`.

The flag's off-switch is `prepareClaudeConfigDirIfNeeded` — that is the single gate. 8 integration + 3 unit tests cover it (`packages/daemon`, 978/978 green).

**The credential hook already exists and is already tested** — `AgentExecutorRunInput.credentialEnv` flows through `buildAgentEnv`/`resolveRunEnv` (`env.test.ts:14`). `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` outrank Keychain login in Claude Code's own auth precedence. So "leave the mechanism ready" needs no new plumbing — only a provisioning decision, later.

Tool-restriction half (keep on): `ASSISTANT_DISALLOWED_TOOLS` in `assistant-system-overlay.ts`, passed in `agent-daemon-server.ts`'s `agentExecutor.run()`. Emitted as `--disallowedTools` by `packages/agent-runtime/src/defs/claude.ts`. Flag names verified against the installed CLI's `-p --help`; enforcement verified live under `--permission-mode bypassPermissions`. Independent of the config-dir gate.

## Task 2 detail — refusal counts disagree
**CORRECTION / open question:** `2026-09-07-mcp-refusal-visibility.md` recorded higgsfield as **11 advertised, 2 admitted, 9 refused** (the nine `show_characters` + `tiktok_*`). c4's handoff says the daemon log shows **17**, adding `participate_in_contest`, `website_status`, `website_db`, `website_secrets`, `apps_search`, `apps_describe`, `apps_invoke`, `sandbox_exec`. Either the server started advertising more tools, or one of the two counts is wrong. **Re-read the live daemon log before editing the allowlist** — do not copy either list on faith.

Refusal legibility is already shipped: `c5d10181` added `withFederatedRefusalDiagnosis`, so an *attempted* call to a refused tool now returns real text ("the administrator has not allowed this tool for this connection…") instead of a redacted `INTERNAL_ERROR`. Rule R-B still keeps the boot-time prompt prefix silent about `not-in-operator-allowlist` on purpose (noise) — that stays. This is exactly why the three rejected tools need no special handling.

## Task 3 detail — 22 still missing, not 26
**CORRECTION:** 4 of the audited 26 have landed since the audit. Verified against `apps/website/src/assistant/tool-search-keywords.ts` (keys are unquoted identifiers — a `"quoted"` grep silently matches nothing).

PRESENT now: `content_post_duplicate`, `custom_credential_list`, `custom_credential_verify`, `custom_credential_make_request`.

**Still MISSING (22):** `backup_execute_restore`, `collections_execute_cleanup`, `collections_plan_cleanup`, `custom_credential_set_username`, `custom_credential_set_token`, `custom_credential_create`, `database_execute_migrate_forward`, `database_get_restore_guidance`, `external_mcp_list`, `external_mcp_save`, `external_mcp_test_connection`, `external_mcp_oauth_connect`, `external_mcp_oauth_poll_device`, `redirects_import`, `settings_clear`, `settings_register_definitions`, `settings_reset`, `settings_set`, `sites_duplicate_site`, `taxonomy_execute_merge_term`, `workspace_create`, `workspace_delete`.

`0af1c873` already added `copy duplicate clone` to `theme_write_file` and a full entry for `plugins_uninstall`; it deliberately skipped `external_mcp_*` as out of its scope. The audit found **zero stale entries** — the 6 apparent orphans were its own glob missing `DOMAIN_SLICES` and inline-declared tools.

## Task 4 detail — what already shipped vs what is unfinished
Shipped in `71daa2bf` (do NOT redo): `features/post/duplicate-embeds.ts` (`copyBodyJsonWithFreshEmbedPlacements` — fresh `placementId`, `widgetEntryId` carried over unchanged, because a widget instance is *meant* to be shared); the HTML-page path via optional `PostToolDeps.pagesHtmlStore` (rejects **before** writing if unwired, so no orphan row); `adminUrl` on get/list/create/duplicate; `page.navigate` error rewrap. `content_post_duplicate` defaults: title `"Copy of <source>"`, slug via `createPost`'s own derivation, status **always** `draft`.

Unfinished, landed in `31f83205`: `assistant/duplicate-resource-registry.ts`, `features/content-duplication/{agent-tools,tool-registrations}.ts`. Compiles; never run.

Watch out: `assistant/index.ts`, `assistant/tool-registrations.ts`, `features/post/*`, and `server/runtime/composition/tool-catalog-manifest.ts` carried **three agents' interleaved edits**. `check:architecture` shows new `assistant <-> server` and `features/post <-> platform` cycles (SCC 0→6) that `0af1c873`'s author attributed to this duplication wiring — that check is a known-RED baseline, but the new cycles are worth confirming are intended.

## Task 6 detail — the "verified" run actually failed its own tests
**CORRECTION:** `serve-command-boot-lifecycle.integration.test.ts` completed in 61.7s with zero orphans — the hang fix is real — but it **failed 0/2**. Both tests died in shared `initFixture()` at ~30.1–30.4s with empty stderr and `status: null`: the signature of `runCliSync`'s new 30s `spawnSync` timeout firing, not an app error. Load was **139 on 8 cores** with 49 node processes at the time. Result is **inconclusive**, not green — re-run it on a quiet box before trusting any verdict on boot-lifecycle behavior.

Also: that run never reached `spawnServe`, so it exercised only the `runCliSync` timeout half of the fix — `waitForHttpReady` / `stopGracefully` / the fetch timeouts are still completely unproven. And the open question the runner raised: is a 30s `runCliSync` default right for a machine that regularly hosts several agents?

## Task 7 detail — the ranked sole-coverage list
Ranks 1–6 all share one shape: well-tested primitive, one production call site, zero proof the call site still fires. `ad18413d` closed exactly this for `pinServedSiteDirIntoEnv` using a source-text wiring check; the same treatment is the recommended stopgap for the rest.
1. `runProductionReadinessGateOrExit` — uncovered repo-wide, banned suite included.
2. `registerPluginSdkResolver` in `serve.ts` — **ESCALATE_SECURITY**; deleting it silently defeats ADR-005 deep-import blocking. Arguably more urgent than #1 since it *has* a guard and the guard is unrunnable.
3. `runBootLifecycle` · 4. `ensureAgentDaemonToken` · 5. `installUnhandledRejectionGuard` · 6. `parsePort`/`resolveServePort` (neither is exported — unreachable without a spawn).
Ranks 8–9 (`ensureAgentDaemonPortResolved` ordering, `agentDaemonWanted`/`logCriticalBootFailures`) are latent gaps nothing tests even when the suite runs.

## Settled context worth not re-deriving
- **Do not consolidate the tool catalog.** ~182 tools exist, but the model is only ever shown 3–4 meta-tools (`search_tools`/`describe_tool`/`execute_delegated_tool`); a real `chat.db` capture confirms zero bare domain tool ids were ever invoked directly. Consolidation buys no context savings and costs the per-tool permission boundary. The page-copy failure was a missing tool + missing keywords, not catalog size.
- `page.navigate` is itself an over-consolidation bug: "page" means an admin SPA screen there and a CMS row everywhere else.
- Confirmed-deliberate absences, not gaps: `users/reset-password`, identity `writePolicyPermission`, `taxonomy_execute_merge_term`, `theme_delete_file`/`theme_create`/`theme_delete`/`theme_rename_folder`, plugin install/upload (genuinely route-less).
- Still-open gaps beyond the tasks above: change-set `revert` (no undo tool anywhere), presentation (no tool reads or sets the *active* theme, or rescans), Composio `connectors` (zero tools), built-in vendor-credential read.

## Two mistakes c4 logged against itself
1. Dispatched agents with no rotation / milestone-commit clause; two hit ~450k before committing.
2. Redirected a finished implementation twice mid-flight instead of settling the tool's shape with Leona before dispatching.

Settle the shape first, scope one task per agent, require commit-and-report per task.

---

# Carried forward from tovu-c4 before it was closed (2026-09-08)

c4 confirmed it holds NO in-flight state: working tree clean, root tsc 0, all its subagents stopped,
no background processes, no pending decision only it held. Its last commit was `31f83205`. Safe to close.

Items it held that were never in the worklist:
- **`plugins_uninstall` is irreversible and guarded only by wording in its own description.** The agent
  that built it deliberately did NOT invent confirmation gating, though `backup_execute_restore` has
  some. Open decision for Leona.
- **`659b98ec`** (external-MCP admissions, authored by a stopped agent) was never re-verified. The other
  12 unattested commits from that period were, and all passed. Flagged, not chased.
- **`TIPTAP_DOC_SCHEMA`** in `features/post/agent-tools.ts` documents `widgetEmbed.attrs` as carrying
  only `placementId`; real nodes also carry `widgetEntryId`. Recorded, unfixed. This nearly caused a
  copy that silently shared live widgets between the original and the copy.
- **`.env`'s `TOVU_AGENT_FORBID_BASH=1` is deliberate** (there is a `.env.bak-before-forbid-bash`
  beside it). Do not "fix" it.
- Stray idle PID 69648 (`admin-dev-proxy.test.ts`, >1 day). Harmless. The harness blocks `kill` — only
  Leona can, via `! kill`.
- **Load hit 447 on 8 cores** on 2026-09-07 and produced false test failures that looked real. Check
  `uptime` before trusting any timing-sensitive result, and stay well below 8-10 concurrent agents.

## Verified closed this session
- `content_post_duplicate` IS fully folded into `content_duplicate` — no second surface. Only comments
  reference the old id; the catalogs declare exactly two duplicate verbs (`content_duplicate`,
  `sites_duplicate_site`).
- The "members are decorative" premise is FALSE and the shared memory note has been corrected. Both
  this session and c4 verified independently: `member_access_json` is column 16 of the live `posts`
  table; `resolvePostMemberAccess` is called from `public-http/routes/content/posts/get-by-slug.ts:74`,
  `routes/site/media-rendition.ts:126`, and `features/seo/sitemap.ts`. Only the WRITE path is absent.
