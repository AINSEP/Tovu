/**
 * @file Raw `search_tools` query strings captured from a REAL, locally-spawned "claude" CLI, via
 * `tool-search-caller2-compliance-harness.ts`, run 2026-09-08 16:52-17:08 PDT.
 *
 * This is the RE-CAPTURE that supersedes `tool-search-caller2-compliance-captures-2026-08-05.ts` as
 * the scored ground truth for `tool-search-caller2-score-captures.ts`. That file is NOT edited or
 * deleted by this one's existence — it remains a frozen historical record of 2026-08-05, exactly as
 * before. This file exists because the `content_read` collapse (`a2fa0bfc`, 2026-09-08) retired 36
 * Tier-1 read tool ids, and 18 of the 2026-08-05 capture's 25 `expectedToolId` values pointed at ids
 * that no longer exist — making that capture's scored percentage measure data staleness, not
 * retrieval quality (see `ADS-memory/reports/2026-09-08-eval-ground-truth-migration.md`, "Quarantine"
 * section, and `ADS-memory/reports/2026-09-08-eval-recapture.md` for this run's own account).
 *
 * Same case list, same 25 operator queries, same harness, same `CASES` array
 * (`tool-search-caller2-compliance-harness.ts`) — only the catalog underneath changed. Committing the
 * raw captures separately from the harness means re-scoring against retrieval is free and instant, per
 * the same reasoning the 2026-08-05 file's own header states.
 *
 * ## Provenance
 *
 * - Git HEAD at capture time: `ac663cec2c7aef37260b57be2f73836a8c7a0376` (2026-09-08 16:54 -0700).
 * - Local `claude` CLI: `2.1.266 (Claude Code)` (`/Users/la/.local/bin/claude`) — NOT pinned or
 *   recorded by the harness itself, same real gap the 2026-08-05 file's header already names.
 * - Node `v24.2.0`.
 * - Live tool catalog size at capture time: **170** tools (`buildEvalToolRegistry`,
 *   `installFirstPartyToolContributors()` + `buildAssistantToolRegistrations`), same figure recorded
 *   elsewhere in this session's reports on 2026-09-08 — not hardcoded here, re-verified directly
 *   against the same registry this file's own values are scored against.
 * - `uptime` load averages immediately before launch: `22.11 23.02 37.47` (16:49 PDT), rechecked
 *   `31.20 25.27 37.71` (16:49-16:52 PDT window, just before the real process bound its port) — both
 *   comfortably under the ~100 contention threshold this run was gated on. **No load reading was taken
 *   mid-run** (the only readings are pre-launch and, separately, ~50 minutes after the run had already
 *   completed, by which point load had climbed to ~90/82/50) — disclosed as a real gap, not implied
 *   coverage of the full ~16-minute window.
 * - Run duration: ~16 minutes wall-clock (16:52 launch to 17:08 completion per the harness's own final
 *   log write), consistent with the harness's own documented estimate.
 *
 * ## A self-inflicted duplicate-launch collision, and why it does not affect this data
 *
 * The first launch attempt was backgrounded via a manually-`nohup`'d shell command whose wrapping
 * shell returned immediately; that FALSE NEGATIVE ("exit 0", 0-byte log, checked within seconds) was
 * not trusted per this dispatch's own instruction, and a `ps`/`pgrep` check found the process was in
 * fact alive and already bound to the harness's scratch port. A second launch attempt (this time using
 * the correct backgrounding mechanism) then collided on that same port (`EADDRINUSE`) and exited
 * immediately, before spawning any `claude` CLI subprocess — so it never called the local CLI, cost
 * nothing, and is not a second paid run. Its crash output, combined with an `>`-truncating redirect to
 * the SAME log path the first (real) process was still writing to, garbled two lines of raw console
 * output right at the start of that log file (a fragment of the crashed process's stack trace spliced
 * into the real process's still-advancing file offset). This affected ONLY the raw stdout log's first
 * two lines, before the real process's first case output — the real process's own `=== SUMMARY ===`
 * JSON block, printed once at the very end after all 25 cases completed, was written by that single
 * surviving process alone and is unaffected. Verified directly: `status` is `"succeeded"` for all 25
 * cases below, matching the harness's own per-case console output for every case from `backup-copy`
 * onward.
 *
 * ## Ground truth caveat — read before scoring
 *
 * `expectedToolId` below is the RAW value from the harness's own `CASES` array at capture time —
 * unresolved, exactly like the 2026-08-05 capture's `expectedToolId` field. **19 of these 25 raw ids
 * are collapse-retired** (verified via `RETIRED_READ_TOOL_TO_CARD.has()` at capture-verification time)
 * — this is expected, not a defect in this file: the harness's own `CASES` list predates the collapse
 * and was never updated for it (it received exactly one prior, unrelated fix, for the
 * `integrations_list_subscriptions` -> `webhooks_list_subscriptions` rename, which is why that one case
 * below already carries the current pre-collapse-but-post-rename id rather than the stale one the
 * 2026-08-05 file carries). Resolution to the tool that actually ships today happens at the SCORING
 * site (`tool-search-caller2-score-captures.ts`), via `currentToolIdFor`, exactly matching the pattern
 * every other "live ground-truth fixture" in this directory already uses (category A in
 * `ADS-memory/reports/2026-09-08-eval-ground-truth-migration.md`) — this file is being authored TODAY
 * against TODAY's catalog, so resolving at the scoring site is a live-fixture maintenance pattern, not
 * a retroactive reinterpretation of a historical record the way it would be for the frozen 2026-08-05
 * file (which is why that file's scorer was reverted rather than fixed this way). Verified directly: all
 * 25 raw ids resolve to a live tool id via `currentToolIdFor` against the 170-tool catalog above (0
 * unresolvable).
 *
 * ## Other caveats carried forward from the 2026-08-05 file, still true here
 *
 * - Single model family/CLI only: local `claude` per the version pinned above.
 * - Single-turn, no prior conversation history — may be an optimistic estimate of steady-state
 *   compliance relative to a real multi-turn chat session.
 * - `expect`/`alsoAcceptable`-shaped ground truth mirrors `tool-search-heldout-v2.ts`'s cases this
 *   sample draws from (each `caseId` here is a `HELD_OUT_V2` case, matched by its `query` text) — same
 *   as the 2026-08-05 file.
 */

export interface Caller2ComplianceCapture {
  /** Matches a `tool-search-heldout-v2.ts` case's `query` field — the ORIGINAL operator phrasing given to the CLI as its task prompt. */
  readonly caseId: string;
  readonly operatorQuery: string;
  readonly expectedToolId: string;
  readonly durationMs: number;
  readonly status: string;
  readonly searchToolsCalled: boolean;
  /** The exact `query` argument(s) the CLI sent to `search_tools`, in call order. Empty array means the case's `searchToolsCalled` is `false`. */
  readonly capturedQueries: readonly string[];
}

export const CALLER2_COMPLIANCE_CAPTURES_20260908: readonly Caller2ComplianceCapture[] = [
  { caseId: "backup-copy", operatorQuery: "before i mess with the site's data can we just make sure we have a copy of everything right now", expectedToolId: "backup_create_restore_point", durationMs: 48700, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "create a full backup or export of the site's database and content before making changes",
    ] },
  { caseId: "comments-queue", operatorQuery: "what comments are waiting for me to approve", expectedToolId: "comments_list_moderation_queue", durationMs: 33334, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "list comments pending moderation approval awaiting review on site content",
    ] },
  { caseId: "recipes-list", operatorQuery: "show me all the recipes we've added so far", expectedToolId: "collections_entry_list", durationMs: 31766, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "list all recipes that have been added to the site's recipe catalog",
      "list content entries or items of a specific content type such as recipes",
      "retrieve recipe records with ingredients and instructions from the database",
      "list every menu in the workspace",
    ] },
  { caseId: "backup-snapshots", operatorQuery: "what snapshots of the site do we have saved from before", expectedToolId: "backup_list_restore_points", durationMs: 48947, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "list saved site backups and snapshots of the website content/configuration taken previously",
    ] },
  { caseId: "collections-define", operatorQuery: "we need a whole new kind of listing on the site, like recipes with ingredients and prep time", expectedToolId: "collections_content_type_define", durationMs: 61039, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "create a new listing type or content schema with custom fields (like ingredients and prep time) for a new category of listings on the site",
      "list all registered collection content types with their fields and version",
    ] },
  { caseId: "comments-settings", operatorQuery: "how are we set up for handling comments right now, like do people need approval first", expectedToolId: "comments_get_settings", durationMs: 41362, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "retrieve comment moderation settings, whether comments require admin approval before being published",
      "site configuration profile snapshot of pages, plugins, settings",
    ] },
  { caseId: "content-list", operatorQuery: "give me every single page on the site, drafts too", expectedToolId: "content_post_list", durationMs: 68489, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "list all pages on the site including draft and published pages",
      "list posts or pages in the workspace including drafts",
      "site profile snapshot including pages and posts inventory",
    ] },
  { caseId: "content-update", operatorQuery: "rewrite the whole about page here's the new text", expectedToolId: "content_post_update", durationMs: 11633, status: "succeeded", searchToolsCalled: false, capturedQueries: [] },
  { caseId: "database-health", operatorQuery: "is everything running okay on the backend, any storage issues", expectedToolId: "database_get_health", durationMs: 26586, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "check backend system health status and uptime",
      "view storage usage, disk space, and quota limits",
    ] },
  { caseId: "forms-list", operatorQuery: "what contact forms do we have set up on the site", expectedToolId: "forms_list_definitions", durationMs: 18720, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "list contact forms configured on the site, retrieve form submission endpoints and their fields",
    ] },
  { caseId: "identity-user-list", operatorQuery: "who has admin access to this dashboard", expectedToolId: "identity_user_list", durationMs: 43005, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "list administrator users with admin access or admin role permissions for the dashboard",
    ] },
  { caseId: "identity-user-create", operatorQuery: "set up a login for our new intern so she can get into the dashboard", expectedToolId: "identity_user_create", durationMs: 77711, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "create a new admin dashboard user account with login credentials for a staff member",
      "list available roles and permissions in the workspace",
      "generic content read tool listing entities by resource type",
      "list identity roles built-in owner admin editor author contributor",
    ] },
  { caseId: "integrations-list", operatorQuery: "what other systems are hooked up to notify when stuff happens on our site", expectedToolId: "webhooks_list_subscriptions", durationMs: 41147, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "list configured webhook integrations that send notifications for site events",
      "list third-party notification channels connected to the site (Slack, email, SMS alerts)",
    ] },
  { caseId: "media-list", operatorQuery: "how many images do we have uploaded to the site", expectedToolId: "media_list_assets", durationMs: 42028, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "count or list uploaded images and media files stored on the site",
    ] },
  { caseId: "members-list", operatorQuery: "how many people have signed up as members on our site", expectedToolId: "members_list", durationMs: 41037, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "count or list members/users who have signed up or registered on the site",
      "list workspace members with status pending active disabled",
    ] },
  { caseId: "menus-list", operatorQuery: "what navigation menus do we have on the site", expectedToolId: "menus_list_menus", durationMs: 30760, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "list navigation menus configured for the site, including menu items and their structure",
      "list all menus in the workspace with id slug title status locations",
    ] },
  { caseId: "newsletter-campaigns", operatorQuery: "what email blasts have we sent out or got queued up", expectedToolId: "newsletter_list_campaigns", durationMs: 78195, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "list email blasts or campaigns that have been sent or are scheduled/queued",
      "view queued or pending email messages/notifications to users",
    ] },
  { caseId: "plugins-list", operatorQuery: "what add-ons or extensions do we have installed on the site", expectedToolId: "plugins_list", durationMs: 34326, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "list installed add-ons, plugins, or extensions enabled on the site",
    ] },
  { caseId: "redirects-list", operatorQuery: "what old links do we have set up to bounce people to new pages", expectedToolId: "redirects_list", durationMs: 62070, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "list URL redirects that forward old page paths to new destination pages",
      "read content items by type such as redirect rules pages or posts",
    ] },
  { caseId: "seo-entry-meta", operatorQuery: "what shows up when someone shares our about page on facebook", expectedToolId: "seo_get_entry_meta", durationMs: 64787, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "view page social sharing preview and Open Graph meta tags for a specific page like About",
      "get page SEO settings title description and social image for About page",
    ] },
  { caseId: "settings-list", operatorQuery: "what site settings even exist that we could tweak", expectedToolId: "settings_list_definitions", durationMs: 42047, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "view or list site configuration settings for the site, such as general options, branding, and feature toggles",
    ] },
  { caseId: "taxonomy-list", operatorQuery: "what categories and tags do we have set up for organizing posts", expectedToolId: "taxonomy_list", durationMs: 27116, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "list blog post categories for organizing content",
      "list tags used to organize or label posts",
    ] },
  { caseId: "theme-list", operatorQuery: "what themes do we have available for the site and are any of them broken", expectedToolId: "theme_list", durationMs: 41967, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "list available site themes and their status",
      "check theme for errors or broken configuration on the site",
    ] },
  { caseId: "widgets-list", operatorQuery: "what widgets have we built for the sidebar and stuff", expectedToolId: "widgets_list_instances", durationMs: 30997, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "list dashboard sidebar widgets that have been created or configured for the site",
    ] },
  { caseId: "workspace-get", operatorQuery: "what's this site actually called and what's its url slug", expectedToolId: "workspace_get", durationMs: 39926, status: "succeeded", searchToolsCalled: true, capturedQueries: [
      "retrieve site name, title, and URL slug from site settings or configuration",
    ] },
];
