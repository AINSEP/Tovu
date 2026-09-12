import { DOC2QUERY } from "./tool-search-doc2query.js";
/**
 * @file Operator vocabulary for tool search — the words a human uses that a tool's own description
 * does not contain.
 *
 * ## Why this exists
 *
 * `search_tools` ranks with FTS5 + BM25 over each tool's `id` and `description`. That was a
 * convenience while a BYOK turn published all 131 descriptors to the model and it could simply read
 * the catalog. It stopped being a convenience when `byok-tool-surface.ts`'s meta-tool set reduced
 * the published surface to 3 tools: the model can now only REACH a tool by finding it, so a tool
 * that does not rank is, functionally, a tool that does not exist.
 *
 * Measured before this file existed (`development/evals/tool-search-quality.eval.ts`, 25
 * operator-phrased tasks): **40% top-1, 44% top-3, 56% found at all.** The failures were not
 * near-misses — "what images have been uploaded" returned `database_list_pending_migrations`, and
 * "give someone admin access" returned `newsletter_remove_subscription`.
 *
 * The cause is not ranking and not tokenization. Both were tested and rejected as the primary
 * cause: re-weighting BM25 made top-1 strictly WORSE at every setting tried, and porter stemming
 * bought only +2 top-3. The cause is that the vocabulary simply is not in the index — descriptions
 * are written in the codebase's nouns ("asset", "subscription", "restore point"), and operators ask
 * in theirs ("image", "webhook", "snapshot"). No ranking function recovers a word that was never
 * indexed.
 *
 * ## How the words below were chosen
 *
 * From what each tool IS — its domain's everyday synonyms — deliberately NOT by reading the eval's
 * query list and reverse-engineering terms that would score well. That distinction matters: an
 * earlier throwaway experiment DID write keywords against the eval queries and scored 96% top-1,
 * which is a self-graded number, not a result. `tool-search-quality.eval.ts` carries a second,
 * HELD-OUT case set for exactly this reason — phrasings that must be scored without ever having
 * shaped the words here. Trust the held-out number.
 *
 * ## Placement
 *
 * A standalone map rather than a `keywords` field on each of the 21 domains' catalog entries. That
 * is an interim choice, made for a reason worth stating: the catalog-entry type is shared with
 * `@jini-ai/cms` (identity's catalog comes from there), so adding a field is a cross-package change,
 * and the FTS schema itself lives in `@jini-ai/sqlite` — both are symlinked packages consumed via
 * `dist`, so both would need rebuilds to take effect. Everything here is Tovu-local and testable
 * today. If this proves out, the principled home is a `keywords` field on the catalog entry plus a
 * third FTS column, which is a strictly better design than appending to the indexed text.
 *
 * Only tools an operator plausibly asks for in plain language need an entry. A tool absent from this
 * map is unchanged — it keeps ranking on its id and description alone.
 */

/**
 * Tool id -> extra search vocabulary. Space-separated terms; word order does not matter (BM25 treats
 * these as a bag of terms). Include plurals AND singulars explicitly: the index uses FTS5's default
 * `unicode61` tokenizer, which does not stem, so "image" and "images" are different tokens.
 */
export const TOOL_SEARCH_KEYWORDS: Readonly<Record<string, string>> = {
  // --- media -------------------------------------------------------------------------------
  media_list_assets: "image images photo photos picture pictures file files upload uploads uploaded library gallery attachment attachments",
  media_upload_asset: "image images photo upload uploads uploading add attach file files picture",
  media_trash_asset: "image images photo delete remove trash file picture attachment",
  media_update_metadata: "image alt text caption description rename file photo metadata",
  media_generate_asset: "image images generate generated generating create created ai art artwork draw drawing design logo banner illustration picture dall-e dalle openai gpt make making",
  media_promote_chat_attachment: "image images photo attachment attachments attached uploaded chat file files add save promote this the one I sent library gallery",
  // 2026-09-06 — the incident this tool exists for was a DISCOVERY failure as much as a capability
  // one: the assistant was holding a CloudFront URL for an image it had just generated and reported
  // there was "no import-by-URL tool". Whatever an operator (or a model) calls the act of pointing at
  // a link and saying "keep that": url/link/address/href, import/download/fetch/grab/pull/save/store,
  // plus the words for WHERE it came from (remote, external, cdn, s3, cloudfront, web, internet,
  // online, elsewhere) — none of which the tool's own description happens to use in every form.
  // Singulars AND plurals spelled out: the FTS5 `unicode61` tokenizer does not stem (see this file's
  // header), so "url" and "urls" are unrelated tokens.
  media_import_from_url: "url urls link links address addresses href http https web internet online remote external elsewhere cdn s3 cloudfront bucket import imports importing download downloads downloading fetch fetching grab pull get save saving store storing copy add attach image images photo photos picture pictures file files asset assets media library gallery",

  // --- webhooks (formerly integrations) -----------------------------------------------------
  webhooks_list_subscriptions: "webhook webhooks endpoint endpoints callback callbacks integration integrations outgoing notification configured",
  webhooks_create_subscription: "webhook webhooks endpoint callback integration connect notify subscribe outgoing",
  webhooks_delete_subscription: "webhook webhooks endpoint remove delete disconnect integration",
  webhooks_pause_subscription: "webhook webhooks pause stop disable suspend integration",
  webhooks_get_deliveries: "webhook webhooks delivery deliveries fired sent failed failure retry retries attempts log history",

  // --- external mcp (agent tool servers) ----------------------------------------------------------------
  // 2026-09-08 (ADS-memory/reports/2026-09-08-tool-keywords.md) — all five external_mcp_* tools had
  // no keyword entry at all. Phrased from what an operator asks for when they want to plug in
  // another AI tool/service (the "connect me to higgsfield" style request), not from the domain's
  // own "MCP"/"transport"/"authMode" nouns.
  external_mcp_list: "mcp server servers external tool tools integration integrations connected connections configured list existing model context protocol third-party ai higgsfield",
  external_mcp_save: "connect add new save external tool server integration mcp hook up set up configure model context protocol third-party ai higgsfield update edit change existing",
  external_mcp_test_connection: "test check connection working works verify diagnose troubleshoot external tool server integration mcp",
  external_mcp_oauth_connect: "connect sign in log in authorize authorization oauth account link external tool server integration mcp",
  external_mcp_oauth_poll_device: "check status finished done connected ready oauth device code sign in external tool server mcp waiting",

  // --- backup / recovery -------------------------------------------------------------------
  backup_create_restore_point: "snapshot snapshots backup backups checkpoint save point restore safety before break",
  backup_list_restore_points: "snapshot snapshots backup backups checkpoint restore points list history",
  backup_plan_restore: "restore rollback revert recover undo snapshot backup",
  // 2026-09-08 (ADS-memory/reports/2026-09-08-tool-keywords.md) — 22-id keyword-coverage backfill.
  // backup_execute_restore, like several other entries added in this same batch, is deliberately
  // UNWIRED (never agent-callable — see its own file header): it exists only to complete the human
  // restore ceremony's confirmation token. Given an entry anyway, per this dispatch's instruction,
  // for consistency and so a future wiring change does not also need a keyword backfill.
  backup_execute_restore: "restore rollback revert recover undo run execute confirm confirmed apply go back to an earlier version snapshot restore point actually do the restore",
  backup_get_capabilities: "backup snapshot restore support capability available",
  recovery_get_status: "backup restore status health check migration in progress warning banner problem",
  recovery_resolve_deep_link: "restore point link verify check database timeline deep link envelope",

  // --- redirects ---------------------------------------------------------------------------
  redirects_create: "url urls link links redirect forward point moved old new address route vanity short",
  redirects_list: "url urls link links redirect redirects forward list existing",
  redirects_get: "url link redirect read view details one specific existing",
  redirects_get_hits: "url link redirect hits traffic clicks visits how many people broken followed",
  redirects_update: "url link redirect change edit update destination target",
  redirects_tombstone: "url link redirect delete remove disable",
  // Deliberately UNWIRED (never agent-callable, bulk write — see file header); entry added for
  // consistency, same reasoning as backup_execute_restore above.
  redirects_import: "url urls link links redirect redirects import bulk upload csv batch add many rules all at once migrate old urls",

  // --- identity / access -------------------------------------------------------------------
  identity_role_assign: "admin administrator access permission permissions grant give role promote make elevate someone user",
  identity_role_create: "role roles permission group admin editor create new access level",
  identity_role_list: "role roles permission groups access levels who can",
  identity_policy_attach: "permission permissions policy grant allow access rule attach give",
  identity_policy_create: "permission permissions policy rule access control create allow deny",
  identity_user_disable: "lock out block ban suspend deactivate revoke disable access someone user account",
  identity_user_enable: "unlock unblock reactivate restore enable access user account",
  identity_user_create: "add user account new person invite staff admin create",
  identity_user_list: "users accounts people staff admins who has access list",
  identity_user_update_email: "email address change update user account",
  identity_policy_delete: "permission access rule delete remove",
  identity_policy_list: "permission access rules list existing available what policies",
  identity_policy_update: "permission access rule edit change update rename re-describe",
  identity_role_delete: "role access level delete remove",
  identity_role_rename: "role access level rename edit change name",

  // --- members ------------------------------------------------------------------------------
  members_list: "members subscribers customers audience people registered signed up",
  members_disable: "member block ban suspend revoke deactivate lock out",
  members_request_magic_link: "login link sign in passwordless magic email member access send",
  members_get_by_id: "member lookup find details profile",

  // --- newsletter ----------------------------------------------------------------------------
  newsletter_list_subscriptions: "signed up subscriber subscribers mailing list audience joined email list who",
  newsletter_cancel_campaign: "stop cancel kill abort email campaign newsletter send going out",
  newsletter_pause_campaign: "pause hold stop email campaign newsletter sending",
  newsletter_create_campaign: "email campaign newsletter blast send announcement compose",
  newsletter_list_campaigns: "email campaigns newsletters sent scheduled drafts list",
  newsletter_remove_subscription: "unsubscribe remove subscriber opt out mailing list",
  newsletter_list_send_log: "email sent delivery log history newsletter campaign who received",
  newsletter_list_lists: "subscriber lists mailing lists available existing audience segments what lists",
  newsletter_create_list: "subscriber list new create mailing list audience segment group",
  newsletter_archive_list: "subscriber list archive retire remove hide stop using mailing list",
  newsletter_create_subscription: "add subscribe someone member to a list mailing list sign up manually",
  newsletter_resend_confirmation: "resend confirmation email opt-in link subscribe again didn't get the email",
  newsletter_get_campaign: "email campaign read view details one specific status",
  newsletter_update_campaign: "email campaign edit update change subject draft",

  // --- comments ------------------------------------------------------------------------------
  comments_list_moderation_queue: "comments waiting approval pending moderate moderation review queue unapproved held",
  comments_approve_comment: "comment approve publish allow accept moderation",
  comments_trash_comment: "comment hide remove delete trash reported abusive",
  comments_mark_comment_spam: "comment spam junk abusive reported flag",
  comments_restore_comment: "comment undelete bring back recover unspam un-spam",
  comments_get_settings: "comment settings configuration config current rules how comments work",
  comments_update_settings: "comment settings configure change require approval turn on off limit rate moderation rules",

  // --- forms ----------------------------------------------------------------------------------
  forms_list_submissions: "form submitted submissions contact responses replies entries messages people sent enquiries",
  forms_get_submission: "form submission response reply entry message detail",
  forms_list_definitions: "forms contact form list existing built",
  forms_create_definition: "form contact form build create new fields",
  forms_update_definition: "form edit change existing update fields recipients",
  forms_set_definition_status: "form enable disable turn off retire deactivate activate",

  // --- menus / navigation ----------------------------------------------------------------------
  menus_update_menu_tree: "navigation nav menu header top link links add item items reorder site structure",
  menus_create_menu: "navigation nav menu new create header footer",
  menus_list_menus: "navigation nav menus list existing header footer",
  menus_assign_location: "navigation nav menu location slot header footer place assign",
  menus_get_menu: "navigation nav menu read view details one specific existing item tree",

  // --- seo ---------------------------------------------------------------------------------------
  seo_regenerate_sitemap: "sitemap google search engine index rebuild regenerate crawl submit",
  seo_analyze_entry: "seo search results ranking google visibility not showing up indexed problems audit page",
  seo_get_entry_meta: "seo meta title description tags page preview snippet",
  seo_set_entry_overrides: "seo meta title description override page tags",
  seo_get_settings: "seo settings current site wide defaults meta social",
  seo_set_settings: "seo settings change update site wide defaults meta social robots",

  // --- taxonomy -----------------------------------------------------------------------------------
  taxonomy_assign_terms: "tag tags label labels categorize category categories assign article post topic",
  taxonomy_create_term: "tag category term topic create new label",
  taxonomy_create_taxonomy: "taxonomy category system tags group create new",
  taxonomy_list: "tags categories taxonomies topics labels list",
  taxonomy_rename_term: "tag category term rename edit change name",
  taxonomy_plan_merge_term: "tag category term merge combine duplicate preview before",
  // Deliberately UNWIRED (never agent-callable, token-gated confirmation step — see file header);
  // entry added for consistency per this dispatch's explicit instruction.
  taxonomy_execute_merge_term: "tag category term merge combine execute run confirm confirmed apply proceed",

  // --- widgets -------------------------------------------------------------------------------------
  widgets_bind_region: "widget sidebar footer region area slot place put add section",
  widgets_create_instance: "widget create add new block sidebar footer",
  widgets_list_regions: "widget regions areas slots sidebar footer available",
  widgets_list_instances: "widget widgets list existing placed blocks",
  widgets_get_instance: "widget read view details one existing current where used",
  widgets_get_region: "widget region read view current placements existing",
  widgets_update_instance: "widget update edit change config settings instance",
  widgets_trash_instance: "widget delete remove trash soft delete",
  widgets_set_region_placements: "widget region replace set whole list sidebar footer bulk update",
  widgets_insert_embed: "widget embed insert add put inline post entry body content",
  widgets_remove_embed: "widget embed remove delete take out inline post body",
  widgets_reorder_embeds: "widget embed reorder rearrange change order position swap",

  // --- theme ---------------------------------------------------------------------------------------
  // "copy duplicate clone" added 2026-09-07 (ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md,
  // Gap #3): no theme_* tool is named theme_copy_file — copyThemeFile exists as a route-level
  // primitive (themes/explore.ts's human Explore screen) but is not itself a wired tool. The
  // compose-it-yourself path (theme_read_file then theme_write_file to a new path) already works —
  // unlike the page-copy gap, theme files carry no row-scoped placement id a naive copy could
  // silently orphan — so nothing here needs the primitive itself, only a way for retrieval to find
  // the write tool when a user asks to "copy"/"duplicate" a theme file. See this file's own header
  // for why a keyword miss is a silent failure mode, not a wrong-result one.
  theme_write_file: "theme stylesheet css template edit change design code file overwrite replace whole file copy duplicate clone",
  theme_edit_file: "theme stylesheet css template edit change design code file one line small change patch replace single word snippet section",
  theme_read_file: "theme stylesheet css template view read design code file",
  theme_list_files: "theme files templates stylesheets css list design",
  theme_list: "theme themes design appearance skin installed",
  // "theme_copy_file" added 2026-09-12, closing one of the two gaps
  // ADS-memory/reports/2026-09-12-theme-agent-tools-survey.md found against the human Explore
  // screen's file operations. `theme_write_file`'s own "copy duplicate clone" keywords above predate
  // this (2026-09-07, when no real copy tool existed and composing read+write was the only path) and
  // are left in place rather than removed — they still describe a real, working composition, and
  // `tool-search-keywords.theme-copy.test.ts` pins them — but a model should now be routed to the
  // real, purpose-built tool first.
  theme_rename_file: "theme file rename renaming move name change filename css template stylesheet",
  theme_copy_file: "theme file copy duplicate clone branch variant new name",
  theme_trash_file: "theme file delete remove trash soft delete",
  theme_restore_trashed_file: "theme file bring back undelete recover",

  // --- database ------------------------------------------------------------------------------------
  database_get_health: "database health healthy status ok working check diagnose",
  database_get_schema_state: "database schema tables structure state",
  database_list_pending_migrations: "database migration migrations pending upgrade schema",
  database_list_restore_points: "backup snapshot history available recovery points",
  database_plan_migrate_forward: "database migration migrate upgrade schema preview plan dry run what would happen before",
  // Deliberately UNWIRED (never agent-callable — see file headers); entries added for consistency,
  // same reasoning as backup_execute_restore above.
  database_execute_migrate_forward: "database migration migrate run execute apply confirm confirmed upgrade schema forward proceed go ahead",
  database_get_restore_guidance: "database restore recover rollback revert snapshot earlier version how do i where do i go recovery guidance link help",
  database_query_timeline: "database history log timeline events audit trail what happened ledger",

  // --- sites (site directory) ---------------------------------------------------------------------------
  // 2026-09-08 (ADS-memory/reports/2026-09-08-tool-keywords.md) — sites_duplicate_site is the one
  // duplicate/copy tool that already existed with NO "duplicate" keyword at all, which is the direct
  // cause of a real production miss: an operator asked to "copy Landing sample" and nothing was
  // found. MUST carry "copy duplicate clone" — see this file's own header on why a keyword miss is a
  // silent failure mode, not a wrong-result one.
  sites_duplicate_site:
    "site sites copy duplicate clone new client starting point template based on existing existing site " +
    "spin up stand up set up create from a copy of same content",

  // --- content / collections --------------------------------------------------------------------------
  content_post_search: "post posts blog article articles find search title lookup copy duplicate clone",
  content_post_list: "post posts blog articles list all recent copy duplicate clone",
  content_post_create: "post blog article write new create draft copy duplicate clone",
  content_post_update: "post blog article edit change update publish draft",
  content_post_delete: "post blog article delete remove trash",
  content_post_get: "post page article lookup find fetch read single one by id details specific copy duplicate clone",
  // 2026-09-07 — added the same day as the tool itself (page-tool-gap dispatch). Phrased from the
  // operator's own words for the failing production request ("copy Landing sample — xai and name it
  // 'Landing Page'"), not from this catalog's own nouns — see this file's header on why vocabulary
  // absent from a tool's description is functionally a tool that cannot be found.
  //
  // Re-keyed 2026-09-08 from the retired bespoke `content_post_duplicate` to the cross-resource
  // `content_duplicate` (owner's redesign: one verb, generic over resource). The resource NOUNS
  // ("form", "page", "post") are carried here deliberately: retrieval matches an operator's "copy
  // that form" against this one entry, and a stale key naming a tool that no longer exists would
  // make the live tool unfindable while looking fully wired.
  content_duplicate:
    "copy duplicate clone replicate reuse make a copy of this page make a copy of this post " +
    "copy this form duplicate a form copy a page copy a post copy this image copy a media asset " +
    "duplicate an image reuse this picture same image different alt text " +
    "same content new name new title starting point template based on existing existing page existing post existing form existing media",
  collections_entry_publish: "publish live go public release draft entry post article",
  collections_entry_unpublish: "unpublish hide draft retract take down entry post",
  collections_entry_create: "entry create new record item content add",
  collections_entry_list: "entries records items content list all",
  collections_entry_update: "entry record item content edit change save update field value",

  // --- content types (custom fields / schema) -----------------------------------------------------------
  // Deliberately UNWIRED (never agent-callable, token-gated destructive removal — see file header);
  // entries added for consistency, same reasoning as backup_execute_restore above.
  collections_plan_cleanup: "content type content types cleanup clean up purge wipe delete permanently preview plan check what would happen before dry run eligible eligibility tombstoned old unused",
  collections_execute_cleanup: "content type content types cleanup clean up purge wipe delete permanently erase get rid of remove run execute confirm confirmed tombstoned old unused rows records data",
  collections_content_type_define: "content type custom fields schema model post type kind of content structure define build register new",
  collections_content_type_deprecate: "content type retire stop using disable old outdated no longer need freeze",
  collections_content_type_list: "content types schema models available what content kinds exist fields structure",
  collections_content_type_reactivate: "content type bring back restore undeprecate enable again turn back on",
  collections_content_type_tombstone: "content type delete remove permanently destroy get rid of",
  collections_content_type_update_fields: "content type fields schema add remove change edit structure update model rename field",

  // --- workspace / settings ------------------------------------------------------------------------------
  workspace_get: "site name title settings workspace details info about",
  workspace_update: "site name title rename change workspace settings brand",
  // workspace_create and workspace_delete are deliberately UNWIRED (never agent-callable — creating
  // or deleting the single addressable workspace row would orphan or break every other domain's
  // boot-wired workspaceId — see file header). Entries added for consistency, same reasoning as
  // backup_execute_restore above.
  workspace_create: "workspace site create new add",
  workspace_delete: "workspace site delete remove destroy get rid of",
  settings_get_effective: "setting settings configuration config value current",
  settings_list_definitions: "setting settings configuration options available what can",
  settings_get_raw: "setting raw value layer global workspace user default unresolved debug",
  settings_set_ui_preference: "preference language theme accent color notification sounds personal admin ui my settings",
  // settings_set, settings_clear, settings_reset, and settings_register_definitions are deliberately
  // UNWIRED (never agent-callable — generic/bulk/schema-level settings access, see file header).
  // Entries added for consistency, same reasoning as backup_execute_restore above.
  settings_set: "setting settings set change value update configure raw key",
  settings_clear: "setting settings clear reset remove value revert back to default delete unset",
  settings_reset: "setting settings reset all defaults wipe clear everything bulk namespace",
  settings_register_definitions: "setting settings definition definitions register schema rename change type deprecate add new remove",

  // --- plugins -------------------------------------------------------------------------------------------
  // 2026-09-09: this tool now covers BOTH plugin families, so the phrasing an operator uses for the
  // Agent Plugin half ("agent plugin", "skill", "turn on the higgsfield one") has to reach it too —
  // before, those words only ranked `search_agent_plugin_local`, which can find a plugin but cannot
  // turn one on, so the journey dead-ended one step short of working.
  plugins_set_enabled:
    "plugin plugins agent plugin agent-plugin agent-plugins enable disable turn on off activate deactivate switch on switch off " +
    "extension addon add-on skill skills capability use it install it already installed not active inactive",
  plugins_list: "plugin plugins extensions installed available list",
  // Added 2026-09-07 (ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md, Gap #4):
  // plugins_uninstall is a new tool with no prior entry at all.
  plugins_uninstall: "plugin plugins uninstall remove delete extension get rid of",

  // --- agent plugins (agent-plugins.org packages — a DIFFERENT system from .tovu-plugin above) -----------
  // 2026-09-09: search_agent_plugin_local is a new tool with no prior entry. Phrased from how an
  // operator asks "is there already something for this" rather than the manifest's own nouns
  // (id/keywords/description) — those already live in the tool's own description and in the plugin
  // data itself, so this vocabulary targets the DISCOVERY intent instead: searching, finding, and
  // marketplace-adjacent words ("addon", "package", "capability") an operator reaches for before
  // they know whether Tovu even has this concept.
  search_agent_plugin_local: "agent plugin plugins agent-plugin agent-plugins search find looking for do I have installed capability capabilities skill skills addon add-on package packages extension extensions bundle available covers supports mcp server marketplace",

  // --- interactive-UI component catalog -----------------------------------------------------------------
  search_components: "component components widget widgets chart charts graph graphs table tables button buttons checkbox card cards render rendering draw drawing display visualize visualization interactive ui shadcn recharts pie bar line",
  describe_component: "component props properties schema fields interactive ui widget render rendering",
  assistant_render_ui: "render show display draw put a chart here show me a graph draw a table build a dashboard visualize view results embed inline in chat",

  // --- pages (bespoke HTML) ------------------------------------------------------------------------------
  // 2026-09-09 — `pages_write_region` shipped as the one-section editor, and the three pages_* tools
  // now have to be told APART, not merely found: a query about changing one section must not land on
  // the full-body rewriter, which is exactly the 42KB-per-headline behavior the region tool exists to
  // stop. So the write pair carries deliberately opposed vocabulary (whole/entire/rewrite/from
  // scratch vs. one/single/section/without rewriting) rather than the union of both.
  pages_read_html: "page html source code view read existing content current markup body regions region handles sections what is on the page show me the page before editing version",
  pages_write_html: "custom page html code write create new design page build a page landing page whole entire full complete rewrite rewriting redo start over from scratch replace the page restructure add a section remove a section",
  pages_write_region:
    "section sections region regions part parts piece block chunk area one single just the only the " +
    "hero headline heading title banner cta call to action pricing faq testimonial footer text copy " +
    "edit editing change changing update updating tweak adjust revise reword swap replace fix amend " +
    "without rewriting not the whole page leave the rest keep the rest surgical targeted in place " +
    "handle data-agent-element",

  // --- deployments / static publish -----------------------------------------------------------------------
  deployment_list: "deployments environments releases history staging production what has been deployed",
  deployment_get_static_publish_capabilities: "can I publish ready deploy hosting connected status providers where github pages vercel netlify cloudflare",
  deployment_preview_static_publish: "dry run check before deploy what would happen test",
  deployment_execute_static_publish: "deploy push ship go live make it live publish the site hosting",
  deployment_generate_bucket_hosting_setup: "instructions steps how to setup guide public website cloud storage host",
  deployment_propose_custom_provider_credential: "connect add new save credential storage provider hosting account s3 bucket",
  deployment_trigger_export: "build generate export files download self host static site",
  deployment_get_export_status: "progress done finished check static site build",
  deployment_get_dockerfile: "docker container read view current build file",
  deployment_set_dockerfile: "docker container write edit update change build file",

  // --- source control --------------------------------------------------------------------------------------
  source_control_get_capabilities: "git source control connected ready can I commit repository credentials setup github gitlab bitbucket",
  source_control_execute_commit: "push code git repository export to repo commit changes github",

  // --- site inspection / evidence -----------------------------------------------------------------------
  site_get_profile: "site overview summary snapshot everything about the site inventory status",
  site_collect_page_evidence: "evidence audit check compliance verify rendered really does prove tracking consent",
  fetch_published_page: "check live page visitor sees rendered output verify loads works test does it work",

  // --- ask the administrator a question -----------------------------------------------------------------
  assistant_ask_choice:
    "ask question decide decision confirm confirmation choose choice choices options option select " +
    "single multi checklist checkbox radio approve approval permission go-ahead consent which one " +
    "poll survey form dialog interactive get input from user administrator before doing proceed",

  // --- agent-driven admin screen capture --------------------------------------------------------------
  "admin.capture_screenshot":
    "screenshot screenshots screen capture picture image photo see view look looks looking visual visually appearance " +
    "layout broken cramped misaligned overlapping clipped cut off ugly render rendering rendered how does this look " +
    "what does this look like show me the screen check the ui verify visually",

  // --- custom-credentials (2026-09-01) ------------------------------------------------------------------
  // Added the same day as `custom_credential_list` itself, after `custom_credential_verify`/
  // `custom_credential_make_request` were found to have shipped with ZERO search-keyword coverage —
  // see `agent-tools.ts`'s own header for the incident this closes (an entire Fly.io/name.com DNS
  // session run through raw `curl` in Bash while `custom_credential_make_request` sat unused and
  // unfound). Phrased from what an operator or a searching model actually types, not from the
  // domain's own nouns — includes the vendor-shaped vocabulary (DNS, registrar, hosting, deployment,
  // third-party API) the failing session was actually thinking in.
  custom_credential_list:
    "credential credentials token tokens api key keys secret secrets saved connected account accounts " +
    "provider providers registrar registrars dns domain domains hosting host deployment deploy deployments " +
    "third-party thirdparty external outside service services vendor vendors inventory what do i have " +
    "do i have list existing configured connections name.com flyio fly.io",
  custom_credential_verify:
    "verify verifying valid invalid expired revoked revoke working works work test testing check checking " +
    "credential token api key secret still good bad broken status health healthy alive dead stale current",
  custom_credential_make_request:
    "call calling request requests curl wget http https api endpoint third-party thirdparty external outside " +
    "service vendor provider dns registrar hosting deployment domain credential token use using saved fetch " +
    "send get post put patch delete hit query invoke run execute",
  // 2026-09-08 (ADS-memory/reports/2026-09-08-tool-keywords.md) — set_username/set_token/create had
  // no keyword entry at all, same family as the list/verify/make_request entries above.
  custom_credential_set_username:
    "credential username set add fix repair update change login sign in basic auth account name saved " +
    "api key token 401 unauthorized broken not working",
  custom_credential_set_token:
    "credential token api key set update change rotate replace new expired refresh save secret",
  custom_credential_create:
    "credential add new create save connect account api key token provider registrar hosting third-party " +
    "service dns fly.io name.com",
};

/** Separates a tool's real description from its appended search vocabulary. Written once, used by
 *  both halves of the fold/strip pair below so the two can never disagree about the boundary.
 *  Exported (2026-09-08) for `content-read-tool.ts`'s own card-description builder: a merged
 *  `content_read.<resource>` card composes ITS OWN single marker boundary from several retired
 *  tools' plain descriptions plus their combined keyword/doc2query tails (see that file's header)
 *  — reusing this constant keeps that boundary byte-identical to the one `indexedDescriptionFor`
 *  itself would draw, so `stripSearchKeywords` cuts a card's description in exactly the right place
 *  without either file having to know the other's marker text separately. */
export const KEYWORD_MARKER = " — also known as: ";

/**
 * Folds a tool's keywords into the text that gets INDEXED.
 *
 * Appending to the indexed description, rather than adding a dedicated FTS column, is what keeps
 * this change inside Tovu — see the module doc.
 *
 * The obvious cost of that shortcut — the model seeing a keyword tail on every hit — is NOT paid,
 * because {@link stripSearchKeywords} removes it again on the way out of `search_tools` and
 * `describe_tool`. The vocabulary exists only inside the FTS index, where BM25 can rank on it and
 * nothing else ever reads it. That split is the whole point: a tool's description is a contract
 * shown to a model, and padding it with synonyms to game a search index would degrade the thing
 * the model actually reasons about in order to fix the thing it searches with.
 */
export function indexedDescriptionFor(
  toolId: string,
  description: string,
  /** Test seam, mirroring `buildToolCatalogQuery`'s own `includeSearchKeywords`. `false` folds the
   *  operator nouns but NOT the doc2query questions, which is the only way to still measure the
   *  pre-adoption baseline now that production includes both — without it, the adoption eval's
   *  "before" arm silently becomes its "after" arm and the comparison reports a null result. */
  options: { readonly includeDoc2query?: boolean } = {},
): string {
  const keywords = TOOL_SEARCH_KEYWORDS[toolId];
  // doc2query (ADOPTED 2026-08-06) — the same fold, one tier further out. `TOOL_SEARCH_KEYWORDS`
  // supplies the operator's NOUNS; `DOC2QUERY` supplies whole questions an operator would ask, which
  // is what carries the verbs and the phrasing BM25 needs to separate sibling tools inside one
  // domain. Both live behind the same {@link KEYWORD_MARKER}, so {@link stripSearchKeywords} removes
  // the pair with the single cut it already made and no caller sees either.
  //
  // Adopted on the paired test against HyDE-alone (the live config), NOT against the keywords
  // baseline that every earlier document quoted: `tool-search-doc2query-adoption.eval.ts` measures
  // +12 cases at top-3 (won 14, lost 2, exact p=0.004). Top-1 is +7 and NOT significant (p=0.21) —
  // top-3 is the metric that governs because `byok-tool-surface.ts` returns 10 ranked candidates and
  // instructs the model to inspect the 1-3 that look right, so ranking into the shortlist is what
  // the model actually consumes. Recall@20 hits 130/130 with this folded in.
  const questions = (options.includeDoc2query ?? true) ? DOC2QUERY[toolId] : undefined;
  const tail = [keywords, questions?.join(" ")].filter((part): part is string => Boolean(part && part.length > 0)).join(" ");
  if (tail.length === 0) return description;
  return description.length > 0 ? `${description}${KEYWORD_MARKER}${tail}` : tail;
}

/**
 * Inverse of {@link indexedDescriptionFor} — recovers the tool's authored description from whatever
 * was indexed, so no caller of `search_tools`/`describe_tool` ever sees the search vocabulary.
 *
 * Deliberately tolerant of text that was never folded (no marker -> returned unchanged), because it
 * runs over every hit including the handful of tools that have no keywords at all — as of the
 * 2026-09-01 backfill, just the three `TOVU_ENABLE_DEMO_TOOLS`-era "Development only" demo tools
 * (`assistant_demo_a2ui`/`assistant_demo_choices`/`assistant_demo_image`), deliberately excluded
 * since no real operator plausibly asks for them in plain language (see this file's own header).
 * Before that backfill it was ~90 of the then-~150 registered tools; see this change's own report
 * for the full before/after enumeration.
 */
export function stripSearchKeywords(indexed: string): string {
  const at = indexed.indexOf(KEYWORD_MARKER);
  return at === -1 ? indexed : indexed.slice(0, at);
}
