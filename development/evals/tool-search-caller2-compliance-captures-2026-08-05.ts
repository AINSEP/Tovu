/**
 * @file Raw `search_tools` query strings captured from a REAL, locally-spawned "claude" CLI, via
 * `tool-search-caller2-compliance-harness.ts`, run 2026-08-05 12:01-12:31 PDT.
 *
 * This is the expensive, non-reproducible-on-demand artifact: 25 live local-CLI agent runs, one
 * per case, ~30-90s each (~16 minutes wall-clock total). Committing the raw captures separately
 * from the harness means re-scoring against retrieval (or re-deriving compliance stats) is free
 * and instant — no need to re-run the harness to ask a new question of this data.
 *
 * ## Provenance and correctness caveats — read before using this data
 *
 * - **First 3 cases (`backup-copy`, `comments-queue`, `recipes-list`) were run BEFORE a boundary
 *   check was possible; all 3 turned out to land AFTER the owner's schema fix (`Jini` repo commit
 *   `eeb71733`, applied mid-session) once wall-clock timestamps were checked.** So ALL 25 entries
 *   here measure the COHERENT (post-fix) state — there is no conflicted-state data in this file,
 *   and none was ever captured. "Which instruction wins under real conflict" was never tested; do
 *   not infer an answer to that question from this data.
 * - Do not compare these numbers against any pre-`0f397a4` or pre-`eeb71733` figure as though
 *   conditions matched — they didn't.
 * - One model family/CLI only: local `claude` (whatever binary version was on `PATH` at
 *   `/Users/la/.local/bin/claude` on 2026-08-05; NOT pinned or recorded by the harness — a real
 *   gap, worth fixing in a future run if the exact model id matters).
 * - Single-turn, no prior conversation history. Real chat sessions carry more competing context
 *   than a fresh run does — this may be an optimistic estimate of steady-state compliance.
 * - `expect`/`alsoAcceptable`-shaped ground truth mirrors `tool-search-heldout-v2.ts`'s cases this
 *   sample draws from (each `caseId` here is a `HELD_OUT_V2` case, matched by its `query` text).
 *
 * ## Classification criterion (mechanical, for reproducibility)
 *
 * A captured query is DESCRIPTIVE if it is a multi-word phrase naming an object + action (with or
 * without synonyms), matching the register the fixed `search_tools` schema now asks for. A
 * captured query is KEYWORD-STYLE if it matches the OLD schema's own worked examples in form: a
 * short 2-3 word noun/verb fragment with no connecting words (e.g. "navigate page", "fill form",
 * "list backups"). Mechanical test applied to every row below: word count >= 6 AND contains at
 * least one function word (a/the/of/for/that/with/or/and/to/on) => DESCRIPTIVE; word count <= 3
 * with no function word => KEYWORD-STYLE. Every one of the 35 captured queries below is >= 8 words
 * and contains multiple function words, so all 35 classify DESCRIPTIVE under this rule with no
 * borderline cases requiring manual judgment call in this dataset.
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

export const CALLER2_COMPLIANCE_CAPTURES_20260805: readonly Caller2ComplianceCapture[] = [
  { caseId: "backup-copy", operatorQuery: "before i mess with the site's data can we just make sure we have a copy of everything right now", expectedToolId: "backup_create_restore_point", durationMs: 52193, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "create a full backup snapshot of the site database, files, and configuration before making changes",
    "list existing backups and show backup status or history",
  ] },
  { caseId: "comments-queue", operatorQuery: "what comments are waiting for me to approve", expectedToolId: "comments_list_moderation_queue", durationMs: 28765, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list comments awaiting moderation approval, retrieve unapproved or pending comments queue",
  ] },
  { caseId: "recipes-list", operatorQuery: "show me all the recipes we've added so far", expectedToolId: "collections_entry_list", durationMs: 42475, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list all recipe content items on the site, returning recipes with their titles and details",
  ] },
  { caseId: "backup-snapshots", operatorQuery: "what snapshots of the site do we have saved from before", expectedToolId: "backup_list_restore_points", durationMs: 27327, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list saved site backups or snapshots that were previously created, showing their timestamps and contents",
  ] },
  { caseId: "collections-define", operatorQuery: "we need a whole new kind of listing on the site, like recipes with ingredients and prep time", expectedToolId: "collections_content_type_define", durationMs: 93339, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "create a new content type or entity bundle for the site, defining a new kind of listing with its own set of fields",
    "list the existing content types and their field definitions configured on this site",
    "register a brand new content type in the collections workspace with a key, label and initial field schema",
  ] },
  { caseId: "comments-settings", operatorQuery: "how are we set up for handling comments right now, like do people need approval first", expectedToolId: "comments_get_settings", durationMs: 36674, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "retrieve site comment settings and moderation configuration, such as whether comments require administrator approval before being published",
  ] },
  { caseId: "content-list", operatorQuery: "give me every single page on the site, drafts too", expectedToolId: "content_post_list", durationMs: 35974, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list all content pages on the site including unpublished drafts, returning titles, slugs and publication status",
  ] },
  { caseId: "content-update", operatorQuery: "rewrite the whole about page here's the new text", expectedToolId: "content_post_update", durationMs: 4676, status: "succeeded", searchToolsCalled: false, capturedQueries: [] },
  { caseId: "database-health", operatorQuery: "is everything running okay on the backend, any storage issues", expectedToolId: "database_get_health", durationMs: 39140, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "report overall backend system health status and diagnostics for the site, including service checks and warnings",
    "check disk space and storage usage, file storage capacity, database size and free space on the server",
    "reports database connectivity and disk headroom health summary",
  ] },
  { caseId: "forms-list", operatorQuery: "what contact forms do we have set up on the site", expectedToolId: "forms_list_definitions", durationMs: 27753, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list all forms configured on the site, including contact forms, their fields and submission settings",
  ] },
  { caseId: "identity-user-list", operatorQuery: "who has admin access to this dashboard", expectedToolId: "identity_user_list", durationMs: 28940, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list user accounts that hold the administrator role or elevated permissions on this site",
  ] },
  { caseId: "identity-user-create", operatorQuery: "set up a login for our new intern so she can get into the dashboard", expectedToolId: "identity_user_create", durationMs: 43901, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "create a new user account with a username, email, and password, and assign roles granting access to the administration dashboard",
    "list the available user roles and the permissions each role grants on the site",
  ] },
  { caseId: "integrations-list", operatorQuery: "what other systems are hooked up to notify when stuff happens on our site", expectedToolId: "integrations_list_subscriptions", durationMs: 49716, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list configured outgoing webhooks and webhook endpoints that send event notifications to external systems when site events occur",
    "list third-party integrations and connected external services configured for the site, such as notification or messaging providers",
  ] },
  { caseId: "media-list", operatorQuery: "how many images do we have uploaded to the site", expectedToolId: "media_list_assets", durationMs: 29837, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list or count uploaded image files and media attachments in the site's file/media library",
  ] },
  { caseId: "members-list", operatorQuery: "how many people have signed up as members on our site", expectedToolId: "members_list", durationMs: 38531, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "count registered users and list site member accounts with registration dates",
  ] },
  { caseId: "menus-list", operatorQuery: "what navigation menus do we have on the site", expectedToolId: "menus_list_menus", durationMs: 28978, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list the navigation menus configured on the site, returning each menu's name and machine name",
  ] },
  { caseId: "newsletter-campaigns", operatorQuery: "what email blasts have we sent out or got queued up", expectedToolId: "newsletter_list_campaigns", durationMs: 46438, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list email campaigns, newsletters, or bulk email blasts that have been sent or are queued for sending",
    "view outgoing mail queue and delivery log of messages pending or already dispatched",
  ] },
  { caseId: "plugins-list", operatorQuery: "what add-ons or extensions do we have installed on the site", expectedToolId: "plugins_list", durationMs: 40701, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list all installed modules, plugins, add-ons, or extensions on the site with their enabled or disabled status and version",
  ] },
  { caseId: "redirects-list", operatorQuery: "what old links do we have set up to bounce people to new pages", expectedToolId: "redirects_list", durationMs: 40227, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list configured URL redirects that forward visitors from an old path to a new destination page",
  ] },
  { caseId: "seo-entry-meta", operatorQuery: "what shows up when someone shares our about page on facebook", expectedToolId: "seo_get_entry_meta", durationMs: 51349, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "retrieve the Open Graph and social sharing preview metadata (og:title, og:description, og:image) for a page as it appears when shared on Facebook or Twitter",
    "read the effective SEO and OpenGraph metadata for a page",
  ] },
  { caseId: "settings-list", operatorQuery: "what site settings even exist that we could tweak", expectedToolId: "settings_list_definitions", durationMs: 50136, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list all available site configuration settings and their current values that an administrator can change",
    "update site-wide configuration options such as theme appearance, presentation, localization, security, and content defaults",
  ] },
  { caseId: "taxonomy-list", operatorQuery: "what categories and tags do we have set up for organizing posts", expectedToolId: "taxonomy_list", durationMs: 25148, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list taxonomy vocabularies and their terms, such as categories and tags used to classify and organize content posts",
  ] },
  { caseId: "theme-list", operatorQuery: "what themes do we have available for the site and are any of them broken", expectedToolId: "theme_list", durationMs: 31107, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list installed site themes and report their status, including broken or missing theme engines",
  ] },
  { caseId: "widgets-list", operatorQuery: "what widgets have we built for the sidebar and stuff", expectedToolId: "widgets_list_instances", durationMs: 39729, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "list all blocks or widgets placed in sidebar regions of the site layout",
    "list widget instances built in the workspace",
  ] },
  { caseId: "workspace-get", operatorQuery: "what's this site actually called and what's its url slug", expectedToolId: "workspace_get", durationMs: 40931, status: "succeeded", searchToolsCalled: true, capturedQueries: [
    "retrieve the site's general settings including site name, title, and URL slug or path alias configuration",
  ] },
];
