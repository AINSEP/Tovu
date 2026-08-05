/**
 * Held-out eval set v2 for tool-search retrieval quality — authored BLIND.
 *
 * ## Catalog acquisition
 * Ground truth was obtained by writing a throwaway script (never committed; created at
 * `/Users/la/Programming/Tovu/tmp-dump-catalog.ts`, run once via `npx tsx`, then deleted) that
 * imported `buildAssistantToolRegistrations` from `src/assistant/tool-registrations.ts` — the real
 * composition root the daemon uses — together with a permissive fake `RouteDeps` stand-in copied in
 * spirit from `src/assistant/__tests__/tool-registrations.contracts.test.ts`'s own `fakeRouteDeps()`
 * (that test file exists precisely so every domain's builder can run without a real DB). The script
 * built the full registration list and dumped `{id, description}` for every wired tool as JSON.
 * Result: 131 wired tools across 21 id-prefix domains, matching the count recorded in
 * `tool-registrations.ts`'s own module doc.
 *
 * ## Forbidden paths — compliance statement
 * Did NOT read, grep, glob, or `git show` any of: anything under `development/evals/`;
 * `src/assistant/tool-search-keywords.ts`; anything containing `HELD_OUT_CASES`, "held-out",
 * "heldout", or "eval case"; `ADS-memory/reports/analysis/2026-08-05-tool-search-*.md` or
 * `2026-08-05-hyde-cost-probe.md`; anything under `ADS-memory/.local-artifacts/handoff/`.
 * Explicit statement: I did not read anything on the forbidden list, and have no visibility into
 * the existing 20-case held-out set, the search-keywords vocabulary bridge, or any prior scoring
 * results. The only Tovu source read was the tool-registration composition root, the domain
 * `agent-tools.ts` catalogs it wires (via the registry dump, not by opening those files directly —
 * the dump script never touched the catalog files themselves), and three test files' *shape*
 * (`tool-registrations.contracts.test.ts`'s `fakeRouteDeps` helper) used only to construct the
 * throwaway script's stub dependencies.
 *
 * ## Anti-paraphrase rule applied
 * For every case, the query avoids the tool's own description vocabulary — no tool-name fragments,
 * no distinctive technical phrases lifted from the description (e.g. "cost class", "keyset-paginated",
 * "moderation queue", "schema drift", "restore point" mechanics, "sync"/"drift" for schema state,
 * "pause"/"halt"/"sending" for the newsletter send-pipeline tools, "rename"/"update" as bare verbs for
 * workspace, "bind"/"region key" for widget regions, "merge" for taxonomy term consolidation). Two
 * borderline calls, disclosed rather than silently resolved:
 *   - `media_update_metadata`: rewritten to avoid the literal field names "alt"/"caption" in favor of
 *     "description for screen readers" — the first draft used the field names verbatim and was cut.
 *   - `settings_get_raw`: says "every layer of that value", which echoes the description's
 *     "per-layer" framing more than any other case here. Kept because "layer" is how a non-technical
 *     operator plausibly describes a settings-precedence stack once they've noticed one setting looks
 *     different in different places — but flagged as the single highest-risk case in this set for
 *     inheriting tool vocabulary rather than inventing operator vocabulary independently.
 * Register: every query is a first-person situation/symptom a non-technical site admin would type
 * into a chat box, not an action name. Several include intentional run-on phrasing or a mild
 * misspelling ("libary", "agian", "rong", "actualy", "anymroe", "dont") to match how real operators
 * type, per the brief.
 *
 * ## Coverage
 * - 130 of 131 wired tools covered (99.2%) — one query per tool, in the tool-dump's own domain order.
 * - All 21 id-prefix domains touched: backup, collections, comments, content, database, forms,
 *   identity, integrations, media, members, menus, newsletter, plugins, recovery, redirects, seo,
 *   settings, taxonomy, theme, widgets, workspace.
 * - Skipped exactly one tool: `recovery_resolve_deep_link` (Database-Timeline deep-link envelope
 *   re-resolution). No operator-register query is honest here — this tool fires when a human clicks a
 *   deep link the UI already generated; nobody types a chat request for "re-validate this envelope's
 *   restorePointId server-side" in their own words, because they never see the envelope at all. Any
 *   query I could construct would either (a) require inventing a scenario no real operator would
 *   produce, or (b) smuggle in "restore point"/"deep link" vocabulary from the description to make the
 *   scenario legible, defeating the point.
 * - 12 cases carry an honest `alsoAcceptable`, most as reciprocal pairs where two tools have
 *   genuinely overlapping utility for the same operator phrasing: `backup_list_restore_points` /
 *   `database_list_restore_points` (apparently duplicate functionality wired in two domains),
 *   `content_post_search` / `content_post_list` / `content_post_get`, `comments_mark_comment_spam` /
 *   `comments_trash_comment`, `collections_content_type_tombstone` /
 *   `collections_content_type_deprecate`, `database_get_schema_state` / `database_get_health`,
 *   `forms_get_submission` / `forms_list_submissions`, `integrations_delete_subscription` /
 *   `integrations_pause_subscription`, `members_get_by_id` / `members_list`, `redirects_get` /
 *   `redirects_list`, `recovery_get_status` / `database_get_health`.
 *
 * ## Count vs. the ~100 target — flagged, not silently resolved
 * This lands at 130 cases, ~30% over the ~100 target. I chose coverage over trimming to the round
 * number: I could write an honest, non-leaking, realistic query for nearly the entire tool surface
 * (130/131), and cutting good cases to hit 100 would have meant discarding real coverage for no
 * measurement benefit — the brief's own skip rule ("a smaller honest set beats a padded one") argues
 * against padding, not against a larger honest set. If exactly ~100 is load-bearing for the scoring
 * design (e.g. a fixed compute budget per run), the cleanest way to cut is by domain size rather than
 * arbitrarily: identity (15), newsletter (14), widgets (12), and collections (11) are the four largest
 * clusters and could each lose 2-4 cases (favoring the CRUD verbs over rename/status-edit variants)
 * without losing domain coverage or breaking any alsoAcceptable pair. I did not pre-cut these myself
 * because I'd rather the scorer choose which 30 to drop than have me guess which lose the least
 * signal.
 *
 * ## Pushback on ecological validity (invited by the brief)
 * Agreeing with the brief's own stated belief: this buys statistical precision, not ecological
 * validity. Every query here is a single author's (mine) guess at operator phrasing, run through no
 * actual operator, and reused across cases in a suspiciously coherent "register" that a diverse real
 * population would not produce as uniformly (I lean toward casual, mildly complaining, first-person
 * phrasing throughout — real operators would vary more: some terser, some more formal, some pasting
 * error text verbatim). A retrieval system tuned against 100-200 of these can overfit "how one LLM
 * imagines an admin talks" rather than how admins actually talk. The fix this set cannot provide
 * itself is real operator transcripts (support tickets, actual chat logs) as a third, independent
 * check — synthetic query sets from any single author, however disciplined about vocabulary leakage,
 * remain a proxy for register even when they are not a proxy for the answer key.
 */

export const HELD_OUT_V2: readonly { query: string; expect: string; alsoAcceptable?: readonly string[] }[] = [
  // backup
  { query: "before i mess with the site's data can we just make sure we have a copy of everything right now", expect: "backup_create_restore_point" },
  { query: "what snapshots of the site do we have saved from before", expect: "backup_list_restore_points", alsoAcceptable: ["database_list_restore_points"] },
  { query: "how expensive would it be to snapshot this site", expect: "backup_get_capabilities" },
  { query: "if we went back to last week's version what would we actually lose", expect: "backup_plan_restore" },

  // collections (content types + entries)
  { query: "what kinds of content can we even create on this site", expect: "collections_content_type_list" },
  { query: "we need a whole new kind of listing on the site, like recipes with ingredients and prep time", expect: "collections_content_type_define" },
  { query: "the recipe thing needs a new field for how many servings it makes", expect: "collections_content_type_update_fields" },
  { query: "we're not doing that events thing anymore, stop letting people add new ones", expect: "collections_content_type_deprecate" },
  { query: "actually bring the events thing back, we changed our mind", expect: "collections_content_type_reactivate" },
  { query: "get rid of that events thing completely, we're never using it again", expect: "collections_content_type_tombstone", alsoAcceptable: ["collections_content_type_deprecate"] },
  { query: "show me all the recipes we've added so far", expect: "collections_entry_list" },
  { query: "add a new recipe for banana bread", expect: "collections_entry_create" },
  { query: "fix the typo in the banana bread recipe title", expect: "collections_entry_update" },
  { query: "that banana bread recipe is ready, put it live", expect: "collections_entry_publish" },
  { query: "pull the banana bread recipe down for now, it's not ready", expect: "collections_entry_unpublish" },

  // comments
  { query: "what comments are waiting for me to approve", expect: "comments_list_moderation_queue" },
  { query: "how are we set up for handling comments right now, like do people need approval first", expect: "comments_get_settings" },
  { query: "make people wait for approval before their comment shows up", expect: "comments_update_settings" },
  { query: "that comment is fine just let it thru already", expect: "comments_approve_comment" },
  { query: "that comment is obviously spam get it off the page", expect: "comments_mark_comment_spam", alsoAcceptable: ["comments_trash_comment"] },
  { query: "one of the commenters on my last blog post is being really nasty can you get that off there", expect: "comments_trash_comment", alsoAcceptable: ["comments_mark_comment_spam"] },
  { query: "actually put that comment back i didn't mean to remove it", expect: "comments_restore_comment" },

  // content (posts/pages)
  { query: "i know we wrote something about our shipping policy somewhere but i can't remember where", expect: "content_post_search", alsoAcceptable: ["content_post_list"] },
  { query: "give me every single page on the site, drafts too", expect: "content_post_list" },
  { query: "pull up the full text of our about page so i can read through it", expect: "content_post_get", alsoAcceptable: ["content_post_search"] },
  { query: "we need a new blog post announcing the holiday hours", expect: "content_post_create" },
  { query: "rewrite the whole about page here's the new text", expect: "content_post_update" },
  { query: "that old post about the spring sale needs to go, we're done with it", expect: "content_post_delete" },

  // database
  { query: "can you show me a history of everything that's changed on the backend lately", expect: "database_query_timeline" },
  { query: "what points in time can we roll the site back to", expect: "database_list_restore_points", alsoAcceptable: ["backup_list_restore_points"] },
  { query: "is everything running okay on the backend, any storage issues", expect: "database_get_health" },
  { query: "i heard our site's backend might not match what it's supposed to look like right now", expect: "database_get_schema_state", alsoAcceptable: ["database_get_health"] },
  { query: "are there any updates queued up that still need to run on our site", expect: "database_list_pending_migrations" },
  { query: "if we ran that pending update right now what would actually happen", expect: "database_plan_migrate_forward" },

  // forms
  { query: "what contact forms do we have set up on the site", expect: "forms_list_definitions" },
  { query: "we need a form for people to request a quote, with name email and a message box", expect: "forms_create_definition" },
  { query: "add a phone number field to the quote request form", expect: "forms_update_definition" },
  { query: "turn off the old quote form we don't want people filling it out anymore", expect: "forms_set_definition_status" },
  { query: "who has filled out the contact form this week i need to follow up with them", expect: "forms_list_submissions" },
  { query: "pull up the details of that one submission from the guy asking about pricing", expect: "forms_get_submission", alsoAcceptable: ["forms_list_submissions"] },

  // identity
  { query: "who has admin access to this dashboard", expect: "identity_user_list" },
  { query: "what admin permission levels do we have to choose from", expect: "identity_role_list" },
  { query: "what are all the custom permission sets we've built here", expect: "identity_policy_list" },
  { query: "set up a login for our new intern so she can get into the dashboard", expect: "identity_user_create" },
  { query: "change the email on file for one of our admin logins", expect: "identity_user_update_email" },
  { query: "our old marketing guy quit cut off his access to the dashboard asap", expect: "identity_user_disable" },
  { query: "turn that guy's login back on we rehired him", expect: "identity_user_enable" },
  { query: "we need a new kind of access level, something between editor and admin", expect: "identity_role_create" },
  { query: "give sarah the same access level as our other editors", expect: "identity_role_assign" },
  { query: "call that access level something friendlier than what it's named now", expect: "identity_role_rename" },
  { query: "we made an access level by mistake nobody's using it get rid of it", expect: "identity_role_delete" },
  { query: "set up a permission bundle just for people who only handle the newsletter", expect: "identity_policy_create" },
  { query: "that permission bundle's name doesn't make sense anymore fix it", expect: "identity_policy_update" },
  { query: "we don't need that permission bundle anymore and nobody's using it", expect: "identity_policy_delete" },
  { query: "give just this one person the newsletter permissions directly don't bother making a whole access level for it", expect: "identity_policy_attach" },

  // integrations
  { query: "what other systems are hooked up to notify when stuff happens on our site", expect: "integrations_list_subscriptions" },
  { query: "did that zapier hookup actually go through the last few times or is it failing", expect: "integrations_get_deliveries" },
  { query: "whenever someone submits the contact form i want it to ping our slack", expect: "integrations_create_subscription" },
  { query: "stop sending that slack ping for now we're getting spammed", expect: "integrations_pause_subscription" },
  { query: "we don't use that slack hookup anymore remove it", expect: "integrations_delete_subscription", alsoAcceptable: ["integrations_pause_subscription"] },

  // media
  { query: "how many images do we have uploaded to the site", expect: "media_list_assets" },
  { query: "heres a pic can you put it in our media libary", expect: "media_upload_asset" },
  { query: "that photo needs a description for screen readers and the caption underneath is wrong too", expect: "media_update_metadata" },
  { query: "delete that old logo image we don't use it anymore", expect: "media_trash_asset" },

  // members
  { query: "how many people have signed up as members on our site", expect: "members_list" },
  { query: "pull up that one member's account info, the guy who emailed asking about his subscription", expect: "members_get_by_id", alsoAcceptable: ["members_list"] },
  { query: "kick that member out they've been harassing other users", expect: "members_disable" },
  { query: "he says he can't log into his account can you resend him the login link", expect: "members_request_magic_link" },

  // menus
  { query: "what navigation menus do we have on the site", expect: "menus_list_menus" },
  { query: "show me everything that's currently in the header menu", expect: "menus_get_menu" },
  { query: "we need a whole new menu just for the footer links", expect: "menus_create_menu" },
  { query: "add a link to our new pricing page into the main navigation", expect: "menus_update_menu_tree" },
  { query: "put that footer menu we built into the actual footer spot", expect: "menus_assign_location" },

  // newsletter
  { query: "what email blasts have we sent out or got queued up", expect: "newsletter_list_campaigns" },
  { query: "how'd that last email newsletter do", expect: "newsletter_get_campaign" },
  { query: "what different mailing lists do we have set up", expect: "newsletter_list_lists" },
  { query: "who's actually signed up for our vip list", expect: "newsletter_list_subscriptions" },
  { query: "did that email actually reach everyone or did some bounce", expect: "newsletter_list_send_log" },
  { query: "let's draft up an email about our black friday sale", expect: "newsletter_create_campaign" },
  { query: "change the subject line on that draft email we're working on", expect: "newsletter_update_campaign" },
  { query: "scrap that scheduled email we're not doing the sale anymore", expect: "newsletter_cancel_campaign" },
  { query: "put that email on hold right now, half of it's already gone out and something's wrong", expect: "newsletter_pause_campaign" },
  { query: "make a separate mailing list just for people who bought something", expect: "newsletter_create_list" },
  { query: "we don't use that old mailing list anymore put it away", expect: "newsletter_archive_list" },
  { query: "add this one person to our vip mailing list", expect: "newsletter_create_subscription" },
  { query: "take that person off the vip list they asked to leave", expect: "newsletter_remove_subscription" },
  { query: "she never got the confirmation email to finish signing up can you send it agian", expect: "newsletter_resend_confirmation" },

  // plugins
  { query: "what add-ons or extensions do we have installed on the site", expect: "plugins_list" },
  { query: "turn on that extension we installed last week", expect: "plugins_set_enabled" },

  // recovery (recovery_resolve_deep_link skipped — see header)
  { query: "is anything currently wrong or stuck with our site's backups or updates", expect: "recovery_get_status", alsoAcceptable: ["database_get_health"] },

  // redirects
  { query: "what old links do we have set up to bounce people to new pages", expect: "redirects_list" },
  { query: "show me where that one old link is supposed to send people", expect: "redirects_get", alsoAcceptable: ["redirects_list"] },
  { query: "is anybody actualy still using that old link we set up", expect: "redirects_get_hits" },
  { query: "we moved our pricing page anyone hitting the old address should land on the new one", expect: "redirects_create" },
  { query: "that old-link-to-new-link thing needs to point somewhere else now", expect: "redirects_update" },
  { query: "turn off that old redirect we don't need people bounced there anymore", expect: "redirects_tombstone" },

  // seo
  { query: "what shows up when someone shares our about page on facebook", expect: "seo_get_entry_meta" },
  { query: "is our pricing page actually optimized for google or are we missing something", expect: "seo_analyze_entry" },
  { query: "change what shows up in google search results for our about page specifically", expect: "seo_set_entry_overrides" },
  { query: "what's our site-wide setup for how we show up in search results", expect: "seo_get_settings" },
  { query: "stop google from indexing our staging pages site-wide", expect: "seo_set_settings" },
  { query: "googles search console says our sitemap is stale can you refresh it", expect: "seo_regenerate_sitemap" },

  // settings
  { query: "what site settings even exist that we could tweak", expect: "settings_list_definitions" },
  { query: "what's actually applied right now for our theme color settings", expect: "settings_get_effective" },
  { query: "i changed a setting at some level but the site isn't reflecting it can you show me every layer of that value", expect: "settings_get_raw" },
  { query: "switch my own dashboard into dark mode", expect: "settings_set_ui_preference" },

  // taxonomy
  { query: "what categories and tags do we have set up for organizing posts", expect: "taxonomy_list" },
  { query: "we want a whole new way to group our products, like by season", expect: "taxonomy_create_taxonomy" },
  { query: "add a new tag called holiday that people can put on posts", expect: "taxonomy_create_term" },
  { query: "that tag is spelled rong fix the name", expect: "taxonomy_rename_term" },
  { query: "put the holiday tag on this blog post", expect: "taxonomy_assign_terms" },
  { query: "we've got two tags that mean the same thing what happens if we combine them into one", expect: "taxonomy_plan_merge_term" },

  // theme
  { query: "what themes do we have available for the site and are any of them broken", expect: "theme_list" },
  { query: "what files actually make up our current theme", expect: "theme_list_files" },
  { query: "show me what's inside the homepage template file for our theme", expect: "theme_read_file" },
  { query: "change the footer template so it says the right copyright year", expect: "theme_write_file" },

  // widgets
  { query: "what widgets have we built for the sidebar and stuff", expect: "widgets_list_instances" },
  { query: "where all is that one widget actually being used on the site", expect: "widgets_get_instance" },
  { query: "what spots on the site can actually hold a widget", expect: "widgets_list_regions" },
  { query: "what's currently sitting in the sidebar slot", expect: "widgets_get_region" },
  { query: "build me a new widget that shows our latest instagram posts", expect: "widgets_create_instance" },
  { query: "change the settings on that recent-posts widget, show 10 instead of 5", expect: "widgets_update_instance" },
  { query: "get rid of that old newsletter signup widget we dont need it anymroe", expect: "widgets_trash_instance" },
  { query: "our new theme has a spot for a widget that isn't hooked up to anything yet, set it up", expect: "widgets_bind_region" },
  { query: "put the recent-posts widget and the newsletter one both in the sidebar, in that order", expect: "widgets_set_region_placements" },
  { query: "drop that instagram widget right into the middle of this blog post", expect: "widgets_insert_embed" },
  { query: "take that widget back out of the middle of the post we don't need it there", expect: "widgets_remove_embed" },
  { query: "swap which widgets show up in which spot inside that post without changing anything else about it", expect: "widgets_reorder_embeds" },

  // workspace
  { query: "what's this site actually called and what's its url slug", expect: "workspace_get" },
  { query: "we just rebranded, the site's name and address still say the old company", expect: "workspace_update" },
];
