import { DOC2QUERY } from "./tool-search-doc2query";
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

  // --- webhooks (formerly integrations) -----------------------------------------------------
  webhooks_list_subscriptions: "webhook webhooks endpoint endpoints callback callbacks integration integrations outgoing notification configured",
  webhooks_create_subscription: "webhook webhooks endpoint callback integration connect notify subscribe outgoing",
  webhooks_delete_subscription: "webhook webhooks endpoint remove delete disconnect integration",
  webhooks_pause_subscription: "webhook webhooks pause stop disable suspend integration",
  webhooks_get_deliveries: "webhook webhooks delivery deliveries fired sent failed failure retry retries attempts log history",

  // --- backup / recovery -------------------------------------------------------------------
  backup_create_restore_point: "snapshot snapshots backup backups checkpoint save point restore safety before break",
  backup_list_restore_points: "snapshot snapshots backup backups checkpoint restore points list history",
  backup_plan_restore: "restore rollback revert recover undo snapshot backup",
  backup_get_capabilities: "backup snapshot restore support capability available",

  // --- redirects ---------------------------------------------------------------------------
  redirects_create: "url urls link links redirect forward point moved old new address route vanity short",
  redirects_list: "url urls link links redirect redirects forward list existing",
  redirects_get_hits: "url link redirect hits traffic clicks visits how many people broken followed",
  redirects_update: "url link redirect change edit update destination target",
  redirects_tombstone: "url link redirect delete remove disable",

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

  // --- comments ------------------------------------------------------------------------------
  comments_list_moderation_queue: "comments waiting approval pending moderate moderation review queue unapproved held",
  comments_approve_comment: "comment approve publish allow accept moderation",
  comments_trash_comment: "comment hide remove delete trash reported abusive",
  comments_mark_comment_spam: "comment spam junk abusive reported flag",

  // --- forms ----------------------------------------------------------------------------------
  forms_list_submissions: "form submitted submissions contact responses replies entries messages people sent enquiries",
  forms_get_submission: "form submission response reply entry message detail",
  forms_list_definitions: "forms contact form list existing built",
  forms_create_definition: "form contact form build create new fields",

  // --- menus / navigation ----------------------------------------------------------------------
  menus_update_menu_tree: "navigation nav menu header top link links add item items reorder site structure",
  menus_create_menu: "navigation nav menu new create header footer",
  menus_list_menus: "navigation nav menus list existing header footer",
  menus_assign_location: "navigation nav menu location slot header footer place assign",

  // --- seo ---------------------------------------------------------------------------------------
  seo_regenerate_sitemap: "sitemap google search engine index rebuild regenerate crawl submit",
  seo_analyze_entry: "seo search results ranking google visibility not showing up indexed problems audit page",
  seo_get_entry_meta: "seo meta title description tags page preview snippet",
  seo_set_entry_overrides: "seo meta title description override page tags",

  // --- taxonomy -----------------------------------------------------------------------------------
  taxonomy_assign_terms: "tag tags label labels categorize category categories assign article post topic",
  taxonomy_create_term: "tag category term topic create new label",
  taxonomy_create_taxonomy: "taxonomy category system tags group create new",
  taxonomy_list: "tags categories taxonomies topics labels list",

  // --- widgets -------------------------------------------------------------------------------------
  widgets_bind_region: "widget sidebar footer region area slot place put add section",
  widgets_create_instance: "widget create add new block sidebar footer",
  widgets_list_regions: "widget regions areas slots sidebar footer available",
  widgets_list_instances: "widget widgets list existing placed blocks",

  // --- theme ---------------------------------------------------------------------------------------
  theme_write_file: "theme stylesheet css template edit change design code file",
  theme_read_file: "theme stylesheet css template view read design code file",
  theme_list_files: "theme files templates stylesheets css list design",
  theme_list: "theme themes design appearance skin installed",

  // --- database ------------------------------------------------------------------------------------
  database_get_health: "database health healthy status ok working check diagnose",
  database_get_schema_state: "database schema tables structure state",
  database_list_pending_migrations: "database migration migrations pending upgrade schema",

  // --- content / collections --------------------------------------------------------------------------
  content_post_search: "post posts blog article articles find search title lookup",
  content_post_list: "post posts blog articles list all recent",
  content_post_create: "post blog article write new create draft",
  content_post_update: "post blog article edit change update publish draft",
  content_post_delete: "post blog article delete remove trash",
  collections_entry_publish: "publish live go public release draft entry post article",
  collections_entry_unpublish: "unpublish hide draft retract take down entry post",
  collections_entry_create: "entry create new record item content add",
  collections_entry_list: "entries records items content list all",

  // --- workspace / settings ------------------------------------------------------------------------------
  workspace_get: "site name title settings workspace details info about",
  workspace_update: "site name title rename change workspace settings brand",
  settings_get_effective: "setting settings configuration config value current",
  settings_list_definitions: "setting settings configuration options available what can",

  // --- plugins -------------------------------------------------------------------------------------------
  plugins_set_enabled: "plugin plugins enable disable turn on off activate deactivate extension",
  plugins_list: "plugin plugins extensions installed available list",
};

/** Separates a tool's real description from its appended search vocabulary. Written once, used by
 *  both halves of the fold/strip pair below so the two can never disagree about the boundary. */
const KEYWORD_MARKER = " — also known as: ";

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
 * runs over every hit including the ~90 tools that have no keywords at all.
 */
export function stripSearchKeywords(indexed: string): string {
  const at = indexed.indexOf(KEYWORD_MARKER);
  return at === -1 ? indexed : indexed.slice(0, at);
}
