# Admin assistant: capability → test-prompt inventory

Written 2026-10-05, after a live chat test showed the assistant could not publish to the live site and linked to
admin UUID pages instead of live URLs. **None of these prompts have been run yet.** This file is the list to run.

**Where the tool list came from.** The real registry was built the way the shipped app builds it
(`development/evals/tool-search-eval-registry.ts` → `installFirstPartyToolContributors()` +
`buildAssistantToolRegistrations()`). It has **246 tools** (102 read-only, 144 write). The full list, with where each
tool is defined, is in the appendix. The model does not get these tools directly. It finds them through
`search_tools` and runs them through `execute_delegated_tool`, so every prompt also tests whether search finds
the right tool. Admin-tab actions come from `apps/website/src/assistant/frontend-control-capabilities.ts`
(`page.*`, `chat.*`, `admin.capture_screenshot`, `admin.publish_content`). These work only while an admin tab is
open and bound to the run.

**Gaps were found by checking** the admin screens (`apps/admin/src/features/**`), the home page copy (`/` page in
`sites/tovu-dev/content.db`), `development/todos.md`, and the demo-video plan
(`ADS-memory/.local-artifacts/handoffs/2026-09-21-tovu-94-demo-videos-to-peer.md`).

**In progress (Codex job, uncommitted, don't edit):** `publish_content_publish` (publish to live,
`apps/website/src/features/publish-content/agent-tools.ts:41`), live URLs in content tool replies, and the chat-title
fix.

**Left out on purpose:** the 14 `newsletter_*` tools and the newsletter `content_read.*` lists. Owner rule: never
propose newsletter work.

## Legend

- **Effect:** `RO` = reads only. `LOCAL` = writes to this site's own DB or files. `EXT` = writes outside this
  computer: the live site, GitHub, Fly, a static host, email, or a paid API. EXT rows need the owner's OK every
  time. Live content publish and the main deploy are **on HOLD** until the owner says go (owner decisions
  2026-10-04).
- **Confirm card:** the tool stops and waits for a person to click Confirm in the chat. A script has to answer it
  (see "How to run").
- **Status:** `OK` = likely works (tool exists and looks wired). `?` = not known. `GAP` = known gap, no tool or a
  broken path. `WIP` = being built now.
- **Pass** describes the site after the prompt, which you can check in the admin, on the local public site
  (`https://localhost:3000/...`), or on the live site. **The assistant saying "done" never counts as a pass.**

---

## 0. Orientation and the chat itself

| id | Prompt (what the owner types) | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| O-01 | What can you do on this site? | `site_describe_capabilities` | Reply names the real areas (pages, posts, forms, menus, media, themes, publish, backup, deploy…) with no tools that don't exist | RO | OK |
| O-02 | Give me a quick overview of how my site is set up. | `site_get_profile` | Active theme, page/post counts and installed plugins match the admin | RO | OK |
| O-03 | How many posts and pages do I have, and how many are drafts? | `content_stats` | Numbers match the Posts and Pages lists in the admin | RO | OK |
| O-04 | Where do I manage my API tokens? Give me a link. | `assistant_admin_screen_link` | Reply has a clickable `/admin/...` link that opens the right screen | RO | OK |
| O-05 | Ask me whether I want the admin in light or dark mode, then switch it. | `assistant_ask_choice` → `settings_set_ui_preference` | A choice card shows; after a click the admin theme changes and stays changed after reload | LOCAL | OK |
| O-06 | Take a screenshot of the screen I'm on and tell me what you see. | `admin.capture_screenshot` | Description matches the open screen | RO | ? (needs a bound tab) |
| O-07 | Open the Forms screen and point at the button to make a new form. | `page.navigate`, `page.highlight` | Admin goes to Forms and the New button is highlighted | RO (UI) | ? (needs a bound tab) |
| O-08 | Start a fresh conversation. | `chat.reset_conversation` | Chat clears and stored messages are kept | RO (UI) | OK |
| O-09 | (Any first message) | none, it's a UI behavior | The sidebar chat title becomes a short meaningful title, not "New chat" or the raw prompt | LOCAL | WIP |
| O-10 | (Any reply that mentions a post or page) | none, it's a reply behavior | The link is the public URL (`/blog/slug`, live URL once published), not `/admin/.../<uuid>` | n/a | WIP |

## 1. Posts

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| P-01 | Write a draft blog post called "Five Coffee Brewing Tips" with a short intro and five tips. | `content_post_create` (kind post) | Draft shows in Posts with the title and 5 tips in the editor | LOCAL | OK |
| P-02 | Publish the "Five Coffee Brewing Tips" post. | `content_post_search` → `content_post_update` (status published) | Status is Published. Local public URL returns 200 and the reply links to it | LOCAL | OK (link format WIP) |
| P-03 | Show me how that post will look before I publish it. | `content_post_preview` | Reply shows the rendered page through the theme | RO | OK |
| P-04 | Find my posts about coffee. | `content_post_search` | Lists the matching posts, no made-up ones | RO | OK |
| P-05 | Rename that post to "Five Better Coffee Tips" and update the URL to match. | `content_post_update` (title, slug) | New title and slug saved. **The open editor shows the change without a reload** | LOCAL | GAP (todos: "Posts editor ignores assistant edits / stale slug in address bar") |
| P-06 | Unpublish the coffee tips post. | `content_post_update` (status draft) | Admin says Draft. Public URL returns 404 | LOCAL | OK |
| P-07 | Make a copy of the coffee tips post as a new draft. | `content_duplicate` | A second post shows as Draft with the same body | LOCAL | OK |
| P-08 | Delete the coffee tips post. | `content_post_delete` | Post is in Trash, not on the Posts list | LOCAL | OK |
| P-09 | Undo my last change to that post. | `change_sets_list` → `change_sets_revert` | The post goes back to the earlier title/body | LOCAL | OK |
| P-10 | Schedule the coffee tips post to go live next Monday at 9am. | **NONE**. `status` only allows draft/published | Post publishes on its own at that time | LOCAL | GAP |
| P-11 | Tag the post "brewing" and put it in the "Guides" category. | `taxonomy_create_term`, `taxonomy_assign_terms`, `taxonomy_get_assigned_terms` | Terms show on the post in the admin and on the public page | LOCAL | OK |
| P-12 | Set this image as the post's featured image. | **NONE** found (no featured-image field in `content_post_create`/`update` input) | Post card or header shows the image | LOCAL | GAP (EXPECTED, no tool found) |
| P-13 | Put the image "coffee-hero" at the top of the post. | `content_read.media_asset` → `content_post_update` (bodyJson image node using `publicUrl`) | Image shows at the top in the editor and on the public page | LOCAL | ? |

## 2. Pages (HTML pages)

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| G-01 | Make an "About us" page with a big headline, three cards about our values, and a contact button. | `content_post_create` (kind page) → `pages_write_html` | Page is in Pages as an HTML page and the preview shows hero + 3 cards + button | LOCAL | OK |
| G-02 | Change the headline on the About page to "Small team, big coffee." | `pages_read_html` → `pages_write_region` | Only that text changed. The rest of the HTML is byte-for-byte the same | LOCAL | OK |
| G-03 | Move the values section above the headline. | `pages_move_region` | Section order changed in the preview | LOCAL | OK |
| G-04 | Publish the About page. | `content_post_update` (status published) | Local `/about` returns 200 with the new content | LOCAL | OK |
| G-05 | What does a visitor see at /about right now? | `fetch_published_page` | Reports status 200 and quotes the real headline | RO | OK |
| G-06 | Hide the theme's built-in Pricing page. | `theme_set_page_published` | `/pricing` returns 404 locally | LOCAL | OK |
| G-07 | Add my Calendly booking widget to the "Book a demo" page. | `pages_write_html` (its instructions ban `<script src>`) | Calendly widget renders on the page | LOCAL | GAP (todos "Third-party embeds", gap 3) |
| G-08 | Embed this YouTube video on the About page: <url> | `pages_write_html` (embed markup) | The video plays on the public page | LOCAL | ? |

## 3. Forms

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| F-01 | Make a contact form with name, email and message, all required, and email me when someone sends it. | `forms_create_definition` → `forms_update_definition` (notification recipients) | Form is Active in Forms with 3 required fields and my email as a recipient | LOCAL | OK |
| F-02 | Add an optional phone number field to the contact form. | `content_read.form_definition` → `forms_update_definition` | Field shows in the form editor and on the rendered form | LOCAL | OK |
| F-03 | Put the contact form on the Contact page. | `pages_write_html`/`pages_write_region` with `data-embed-config='{"type":"form",...}'` (HTML page). On a rich-text page: `widgets_insert_embed` | Local `/contact` shows a working form | LOCAL | ? |
| F-04 | Show me the latest contact form submissions. | `forms_list_submissions`, `forms_get_submission` | Matches Forms → Submissions in the admin | RO | OK |
| F-05 | Take the old signup form offline. | `forms_set_definition_status` (disabled) | Form says Disabled. The public page no longer accepts it | LOCAL | OK |
| F-06 | Delete the "html-form-demo" test form. | **NONE**. `trash_item` entityType is only post/comment/media/redirect/widget | Form is in Trash | LOCAL | GAP |
| F-07 | Delete that spam submission. | `trash_item` with `form_submission`, but the schema enum does not allow it (the `forms_list_submissions` description says it does) | Submission is in Trash | LOCAL | GAP (description and schema disagree) |
| F-08 | Will I actually get an email when someone fills in the form? | `system_get_mail_status` | Honest answer about the mail driver, with a setup note if mail is off | RO | OK |
| F-09 | Copy the contact form so I can make a quote-request version. | `content_duplicate` (form) | A second form shows with the same fields | LOCAL | OK |

## 4. Menus and navigation

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| N-01 | Make a main menu with Home, About, Blog and Contact. | `menus_create_menu` → `menus_update_menu_tree` | Menu shows in Menus with 4 items that point at the right pages | LOCAL | OK |
| N-02 | Put that menu in the site header. | `menus_assign_location` | The local public header shows the 4 links | LOCAL | OK |
| N-03 | Add the Contact page to the header menu. | `content_read.menu` → `menus_update_menu_tree` | Header shows Contact. No other item was lost | LOCAL | OK |
| N-04 | Rename "Blog" to "Journal" in the menu and move it to the end. | `menus_update_menu_tree` | Header order and label updated | LOCAL | OK |
| N-05 | Delete the old footer menu. | **NONE**. `trash_item` has no `menu` | Menu is in Trash | LOCAL | GAP |

## 5. Widgets and regions

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| W-01 | Add a "Recent posts" box to the blog sidebar. | `widgets_create_instance` → `widgets_bind_region`/`widgets_set_region_placements` | Sidebar on a public blog page shows recent posts | LOCAL | OK |
| W-02 | Put the "Book a demo" callout into the coffee tips post. | `widgets_insert_embed` | Callout shows inside the post body | LOCAL | OK |
| W-03 | Remove the callout from that post. | `widgets_remove_embed` | Gone from the post. The widget itself is still in the library | LOCAL | OK |
| W-04 | Change the callout's button text to "Talk to us". | `content_read.widget_instance` → `widgets_update_instance` | Every page that uses it shows the new text | LOCAL | OK |
| W-05 | Make a widget that holds my Calendly / any iframe embed. | **NONE**. No generic embed widget type | Widget renders the embed | LOCAL | GAP (todos "Third-party embeds", gap 1) |

## 6. Media and AI images/video

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| M-01 | What images do I have in my media library? | `content_read.media_asset` | List matches Media in the admin | RO | OK |
| M-02 | Look at the image "coffee-hero" and write good alt text for it. | `media_view_image` → `media_update_metadata` | Alt text describes the real picture and is saved on the asset | LOCAL | OK |
| M-03 | Generate an image of a latte on a wooden table. | `media_generate_asset` | New image in Media, `placeholder:false` | EXT (paid; OpenAI or another vendor key in Media providers. 09-21 handoff: no key saved) | ? |
| M-04 | Use Higgsfield to make two images showing "the nascent agentic web" and save them to my media library. | external MCP `mcp__higgsfield__generate_image` → `media_import_from_url` | 2 new images in Media | EXT (paid; Higgsfield plan. `z_image` works on the current plan, `gpt-image-2` needs basic+) | ? |
| M-05 | Make a 5-second Higgsfield video of steam rising from a coffee cup. | external MCP (Higgsfield video tool) → `media_import_from_url` | Video in Media and plays | EXT (paid; ask about cost first) | ? |
| M-06 | Save this image into my library: <https url> | `media_import_from_url` | Image in Media | LOCAL (fetches a URL) | OK |
| M-07 | Add the photo on my Desktop called cup.jpg to my media library. | `fs_list_files` → `media_import_local_file` | Image in Media | LOCAL | ? (allowed roots) |
| M-08 | Delete the image "old-logo". | `media_trash_asset` (then `media_purge_asset` with confirm card for permanent) | In Trash (or gone after confirm) | LOCAL | OK |
| M-09 | Which image generators are set up? Save my OpenAI image key. | `media_list_providers`, `media_propose_provider_credential` (form) | Provider shows as configured | LOCAL | OK |

## 7. Themes and design

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| T-01 | Which themes do I have, and which one is on? | `content_read.theme` | Matches Themes in the admin | RO | OK |
| T-02 | Switch the site to the "basic" theme. Then switch it back. | `theme_set_active` | Public site changes theme, then goes back | LOCAL | OK |
| T-03 | Make the header background dark navy. | `theme_list_files` → `theme_read_file` → `theme_edit_file` | Local public header is navy. Theme still validates | LOCAL | OK |
| T-04 | Undo my CSS change, put the file back the way it shipped. | `theme_reset_file` | File back to original. Header color back | LOCAL | OK |
| T-05 | Make a new theme based on tovu-theme called "roastery". | `theme_copy_file`/`theme_write_file` → `theme_rescan` | "roastery" shows in Themes and can be turned on | LOCAL | ? |
| T-06 | Install the "X" theme from the theme catalog. | **NONE**. No catalog exists: the theme marketplace and its `theme_install_from_marketplace` tool were deleted 2026-10-04 (owner). Make a theme with T-05 instead | Theme installed and listed | LOCAL | N/A (no catalog) |
| T-07 | Switch the admin to Spanish. Then back to English. | `settings_list_ui_locales` → `settings_set_ui_preference` | Admin text is Spanish, then English | LOCAL | OK |

## 8. Publish to the live site

Live content publish is **on HOLD** until the owner says go. Run these against a throwaway peer, or only with the
owner's OK. Leave out the 4 test pages/forms (owner decision 2026-10-04).

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| L-01 | Is publishing to my live site set up? | `publish_content_status` | Plain answer that matches reality: connected, not connected, never deployed, or nothing to publish | RO | OK |
| L-02 | Connect this computer to my live site. | `publish_content_connect` | Says the next deploy is needed and gives the `nextStep` text. L-01 then reports connected after deploy | LOCAL (live after deploy) | OK |
| L-03 | Publish my changes to the live site. | `publish_content_publish` | `fetch_live_url` of each item returns 200 with the new content. Reply gives **live URLs first** | EXT (live) | WIP |
| L-04 | Publish only the About page. | `publish_content_publish` (`items`) | Only About changed on live | EXT (live) | WIP |
| L-05 | Publish everything except the Contact page. | `publish_content_publish` (`excludeItems`) | Contact unchanged on live. Everything else updated | EXT (live) | WIP |
| L-06 | Open the publish window with the About page already picked. | `admin.publish_content` | Publish dialog opens with About selected. Nothing is written until a person clicks "Publish N items" | n/a (UI) | ? (needs a bound tab) |
| L-07 | Did the live site update? Check /about on the live site. | `fetch_live_url` | Quotes the live headline and status | RO (external read) | OK |
| L-08 | What would I get if I pulled the live site down here? Then do it. | `publish_content_plan_pull` → `publish_content_execute_pull` (confirm card) | Plan lists items. After confirm, local items match live | LOCAL (overwrites local) | OK |
| L-09 | What do I still have to publish by hand? | `publish_backstop_gaps` | Lists the kinds publishing doesn't cover | RO | OK |
| L-10 | Publish my theme change and my installed plugins and skills live. | `publish_content_publish`. Only the theme-files type exists in the publish registry | Theme, plugins and skills all show on live | EXT (live) | GAP for plugins/skills (todos "Publish") |
| L-11 | Disconnect this computer from the live site. | `publish_content_disconnect` | L-01 reports not connected | LOCAL | OK |

## 9. Site backup, GitHub and source control

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| B-01 | Where can I back up my site? | `source_control_get_capabilities` | Lists GitHub (and any other plugin host) with ready/not-ready | RO | OK |
| B-02 | Connect my GitHub account. | `source_control_propose_credential` or `agent_plugin_connect` (github) | Credential saved. B-01 shows ready | LOCAL | OK |
| B-03 | Back up my whole site to my private GitHub repo `<owner>/<repo>`. | `site_backup_plan` → `site_backup_push` (confirm card) | One new commit in the repo with DB snapshot, media, themes, plugins and settings folder | EXT (GitHub) | ? |
| B-04 | Commit the built site to my GitHub repo `<owner>/<repo>`. | `source_control_execute_commit` (try `dryRun:true` first) | Commit with exported HTML. `commitUrl` opens | EXT (GitHub) | ? |
| B-05 | Did my GitHub Actions build pass? Show me the error if not. | `deployment_ops_status`/`deployment_ops_logs` (github-actions) | Matches the Actions tab | RO (external read) | ? |
| B-06 | Restore my site from the GitHub backup. | **NONE**. Backup push only, there is no restore-from-repo | Site matches the backup | LOCAL | GAP (EXPECTED, no tool found) |
| B-07 | Delete my saved GitHub credential. | `source_control_delete_credential` (confirm card) | B-01 shows no credential | LOCAL | OK |

## 10. Deployment, hosting and domains

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| D-01 | Export my site as static files. | `deployment_trigger_export` → `deployment_get_export_status` | Export finishes. Files are on disk | LOCAL | OK |
| D-02 | Where can I publish a static copy, and am I ready? | `deployment_get_static_publish_capabilities` | Lists GitHub Pages / Netlify / Vercel / Cloudflare / bucket with honest readiness | RO | OK |
| D-03 | Save my Netlify token. | `deployment_propose_custom_provider_credential` (form) | D-02 shows Netlify configured | LOCAL | OK |
| D-04 | Check what publishing to Netlify would do, without publishing. | `deployment_preview_static_publish` | Shows base path and config problems, publishes nothing | RO | OK |
| D-05 | Publish the site to Netlify now. | `deployment_execute_static_publish` | Returns a URL. That URL serves the site | EXT (static host) | ? |
| D-06 | Help me host the site in my own S3 bucket. | `deployment_generate_bucket_hosting_setup` | Steps and policy JSON with my bucket name in them | RO | OK |
| D-07 | Show me my Dockerfile, then add a HEALTHCHECK line. | `deployment_get_dockerfile` → `deployment_set_dockerfile` | Repo-root Dockerfile has the line | LOCAL | OK |
| D-08 | Is my Fly app up? If it crashed, why? | `deployment_ops_list_targets`, `deployment_ops_status`, `deployment_ops_logs` (fly) | Matches `fly status` | RO (external read) | ? |
| D-09 | Tell me when the Fly deploy finishes. | `deployment_ops_wait` | Reports healthy or failed when it ends | RO (external read) | ? |
| D-10 | Deploy the full site to Fly.io. | **NONE**. No full-site deploy trigger. Fly agent plugin is a skill + ops tools; `custom_credential_make_request` could reach the Fly API | New Fly release, live site serves it | EXT (Fly) | GAP |
| D-11 | Is my domain example.com pointed at my site correctly? Is HTTPS working? | `domain_check_dns`, `domain_lookup_dns`, `domain_tls_status` | Answers match `dig` / browser certificate | RO (external read) | OK |
| D-12 | Delete my old Netlify credential. | `deployment_delete_provider_credential` (confirm card) | D-02 shows it gone | LOCAL | OK |

## 11. Plugins, agent plugins and skills

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| X-01 | What plugins do I have? | `content_read.plugin`, `search_agent_plugin_local` | Both plugin kinds listed, matches the Plugins / Agent Plugins screens | RO | OK |
| X-02 | Turn on the Higgsfield plugin. | `plugins_set_enabled` (agent-plugin, confirm card) | Plugin On after confirm | LOCAL | OK |
| X-03 | Turn off the sample storefront plugin. | `plugins_set_enabled` (site-runtime) | Plugin Off | LOCAL | OK |
| X-04 | Uninstall the X plugin. | `plugins_uninstall` | Gone from the list | LOCAL | OK |
| X-05 | Connect my Higgsfield account. | `agent_plugin_connect` (`agent_plugin_set_access_token` fallback) | Plugin shows connected. Its MCP tools are admitted after a daemon restart | LOCAL (OAuth with vendor) | ? |
| X-06 | Remember for the GitHub plugin that my backup repo is `<owner>/<repo>`. | `agent_plugin_write_note` (confirm) | Note shows in the plugin's memory panel | LOCAL | OK |
| X-07 | Install the plugin in this folder / zip (absolute path). | `plugins_install` (confirm card; needs `TOVU_PLUGIN_LOCAL_INSTALL=1`, like the admin dialog) | Plugin listed, off | LOCAL | ? |
| X-08 | Install the skill at `https://github.com/<owner>/<repo>`. | `skills_install` (confirm card; GitHub URL only) | Skill listed, on | LOCAL (GitHub fetch) | ? |

## 12. SEO and redirects

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| S-01 | How's the SEO on my About page? | `content_read.seo_entry_meta`, `seo_analyze_entry` | Score and issues listed | RO | OK |
| S-02 | Give the About page this meta description: "…" | `seo_set_entry_overrides` | Local `/about` page source has the meta tag | LOCAL | OK |
| S-03 | Make page titles read "Page name \| Tovu". | `seo_get_settings` → `seo_set_settings` | `<title>` uses the template | LOCAL | OK |
| S-04 | Rebuild my sitemap. | `seo_regenerate_sitemap` | `/sitemap.xml` includes the newest page | LOCAL | OK |
| S-05 | Send /old-contact to /contact permanently. | `redirects_create` (301) | `curl -I` local `/old-contact` gives 301 to `/contact` | LOCAL | OK |
| S-06 | Add these 20 redirects from my old site: (pasted list) | `redirects_import` | All 20 listed. Bad rows are reported, not dropped silently | LOCAL | OK |
| S-07 | How often is the /old-contact redirect used? Turn it off. | `redirects_get_hits`, `redirects_tombstone` | Hit count shown. Redirect then gives 404 | LOCAL | OK |

## 13. Users, roles, members, settings

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| U-01 | Add a user "jane" (jane@example.com) as an editor. | `identity_user_create` → `identity_role_assign` | Jane is in Users with the Editor role | LOCAL | OK |
| U-02 | What can an editor do? | `content_read.identity_role` → `identity_policy_list_permissions` | Permission list matches Roles screen | RO | OK |
| U-03 | Make a "Writer" role that can only edit posts, and give it to Jane. | `identity_role_create`, `identity_policy_create`, `identity_policy_attach`/role wiring, `identity_role_assign` | Jane can edit posts and is refused on pages | LOCAL | ? (policy permissions add path) |
| U-04 | Change Jane's email to jane@coffee.test. | `identity_user_update_email` | Users shows the new email | LOCAL | OK |
| U-05 | Turn off Jane's access. Then turn it back on. | `identity_user_disable`, `identity_user_enable` | Status Disabled, then Active | LOCAL | OK |
| U-06 | Delete Jane's account. | `identity_user_delete` needs the user in Trash first, but `trash_item` has no `user` type | Jane removed after the confirm card | LOCAL | GAP (unreachable prerequisite) |
| U-07 | Reset Jane's password. | **NONE** | Jane can sign in with a new password | LOCAL | GAP (EXPECTED, no tool found; may be on purpose) |
| U-08 | List my members and resend a sign-in link to sam@example.com. | `content_read.member`, `members_request_magic_link` | Email sent, or honest "mail is off" | EXT (email) | OK |
| U-09 | Add sam@example.com as a member. | **NONE** (no member create/invite tool) | Sam in Members | LOCAL | GAP (EXPECTED, no tool found) |
| U-10 | Turn off member sam's access. | `members_disable` | Member Disabled, sessions ended | LOCAL | OK |
| U-11 | Set the site time zone to Europe/Tirane. | `settings_set_value` (`settings_get_effective` to check) | Settings shows the zone | LOCAL | OK |
| U-12 | Rename my site to "Ashgrove Coffee". | `workspace_update` | New name in the admin header and settings | LOCAL | OK |
| U-13 | Change my admin password / turn on two-step sign-in. | **NONE** | n/a | LOCAL | GAP (EXPECTED; likely on purpose, confirm with owner) |

## 14. Comments

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| C-01 | Which comments are waiting for approval? | `content_read.comment_moderation_queue` | Matches Comments → Pending | RO | OK |
| C-02 | Approve the first one, mark the second as spam. | `comments_approve_comment`, `comments_mark_comment_spam` | Statuses changed. Approved one shows on the post | LOCAL | OK |
| C-03 | Delete the spam comment forever. | `comments_purge_comment` (confirm) | Gone from all lists | LOCAL | OK |
| C-04 | From now on, hold all new comments for approval. | `comments_get_settings` → `comments_update_settings` | Setting on | LOCAL | OK |

## 15. Collections (custom content types)

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| K-01 | Make a "Recipes" type with title, ingredients and steps. | `collections_content_type_define` | Recipes shows in Collections | LOCAL | OK |
| K-02 | Add a recipe for cold brew and publish it. | `collections_entry_create` → `collections_entry_publish` | Entry Published | LOCAL | OK |
| K-03 | Add a "prep time" field to Recipes. | `collections_content_type_update_fields` | Field shows in the entry editor | LOCAL | OK |
| K-04 | Show my recipes on a public page. | ? (no tool found that renders a collection listing; `content` embed type may) | Public page lists recipes | LOCAL | ? |
| K-05 | Retire the Recipes type. | `collections_content_type_deprecate` | Type Deprecated, new entries blocked | LOCAL | OK |

## 16. Categories and tags

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| Y-01 | Make a "Topics" category list with Brewing and Beans. | `taxonomy_create_taxonomy`, `taxonomy_create_term` | Shows in Categories & Tags | LOCAL | OK |
| Y-02 | Rename "Beans" to "Coffee beans". | `taxonomy_rename_term` | New name everywhere | LOCAL | OK |
| Y-03 | Merge the "brew" tag into "brewing". | `taxonomy_plan_merge_term` → `taxonomy_execute_merge_term` (confirm) | Posts tagged "brew" now show "brewing" | LOCAL | OK |
| Y-04 | Delete the "misc" tag. | **NONE** (merge/deprecate only; `trash_item` has no term type) | Tag gone | LOCAL | GAP |

## 17. Trash, undo, restore points, database

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| R-01 | What's in the trash? Bring back the coffee tips post. | `trash_list_items` → `trash_restore_item` | Post back on Posts list | LOCAL | OK |
| R-02 | Empty the trash. | `trash_empty` (confirm card; permanent) | Trash empty | LOCAL | OK |
| R-03 | Make a restore point before I change anything. | `backup_get_capabilities` → `backup_create_restore_point` | New restore point listed | LOCAL | OK |
| R-04 | Put the site back the way it was at that restore point. | `backup_plan_restore` → `backup_execute_restore` (confirm) | Content matches the restore point | LOCAL | OK |
| R-05 | Is my database healthy? Any updates waiting? Apply them. | `database_get_health`, `database_get_schema_state`, `content_read.database_pending_migration`, `database_plan_migrate_forward` → `database_execute_migrate_forward` (confirm) | Health matches Database screen. After confirm, no pending migrations | LOCAL | OK |
| R-06 | Show me the database history. | `database_query_timeline` | Matches Database → Timeline | RO | OK |
| R-07 | Copy my data to my Postgres database. | `database_transfer_set_destination` (form) → `database_transfer_plan` → `database_transfer_run` → `database_transfer_status` | Rows present in the Postgres DB | EXT (Postgres) | ? |
| R-08 | Is anything wrong with my site's recovery state? | `recovery_get_status` | Matches the banner (or says none) | RO | OK |

## 18. Integrations, credentials, MCP, webhooks

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| I-01 | Save my Cloudflare API token. | `custom_credential_create` (form, token never in chat) | Shows on Access Tokens | LOCAL | OK |
| I-02 | Is my Cloudflare token still working? | `custom_credential_verify` | Honest yes/no | RO (external read) | OK |
| I-03 | Use my Cloudflare token to list my DNS zones. | `content_read.custom_credential` → `custom_credential_make_request` | Zones match the Cloudflare dashboard | RO (external read) | OK |
| I-04 | Connect the Supabase MCP server. | `external_mcp_save` (form) → `external_mcp_oauth_connect` | Connection saved and authorized. `external_mcp_probe_connection` lists tools | EXT (OAuth with vendor) | ? |
| I-05 | Which outside tools can you use right now, and which were refused? | `external_mcp_get_admissions`, `content_read.external_mcp` | Matches Settings → External MCP | RO | OK |
| I-06 | Send a webhook to <url> whenever a post is published. | `webhooks_create_subscription` → `webhooks_get_deliveries` | After publishing a post, a delivery shows with a 2xx | EXT (outbound HTTP) | OK |
| I-07 | Pause that webhook. Then delete it. | `webhooks_pause_subscription`, `webhooks_delete_subscription` | Paused, then gone | LOCAL | OK |
| I-08 | Remove the Supabase connection. | `external_mcp_delete` (confirm; no undo) | Gone | LOCAL | OK |

## 19. Analytics, inspection, sites, commerce

| id | Prompt | Backing tool(s) | Pass condition | Effect | Status |
|---|---|---|---|---|---|
| A-01 | Which pages got visits today, and from where? | `analytics_list_recent_hits` (`summarize:true`) | Top paths and referrers match Analytics | RO | OK |
| A-02 | What were my top 10 pages last month? | `analytics_list_recent_hits` reads only the recent-hit buffer | A month of totals | RO | GAP (recent buffer only) |
| A-03 | What cookies does my home page set? | `site_collect_page_evidence` | Cookie names match browser devtools | RO | OK |
| A-04 | Show me recent server errors. | **NONE** (admin Observability screen has no chat tool) | Errors listed | RO | GAP (EXPECTED, no tool found) |
| A-05 | What sites do I have on this computer? | `sites_list` | Matches Sites → All sites | RO | OK |
| A-06 | Make a copy of this site called "staging". | `sites_duplicate_site` | "staging" listed and boots | LOCAL | OK |
| A-07 | Create a brand-new empty site called "bakery". | **NONE** (admin Create Site onboarding only) | New site listed | LOCAL | GAP (EXPECTED, no tool found) |
| A-08 | Switch to my "staging" site. | **NONE** (`sites_list` says it doesn't switch) | Admin now serves staging | LOCAL | GAP (EXPECTED, no tool found) |
| A-09 | Is checkout set up? | `commerce_get_status` | Matches Payments screen | RO | OK |
| A-10 | Connect Stripe and add a product. | **NONE** | Product sellable | EXT | GAP (EXPECTED, no tool found) |

---

## Story prompts (multi-step, typed as one request or a short series)

Each story passes only if **every** step's result can be seen. Stop at the first failing step and log it.

**ST-1. Contact page, end to end (demo video 2).** "Make a 'Get in touch' HTML page with a short intro. Make a
contact form with name, email and message, put it on that page, add the page to the header menu, and publish it
to the live site." Then a person (or Chrome) fills in the form on the **live** site.
Tools: `content_post_create` → `pages_write_html` → `forms_create_definition` → form embed marker →
`menus_update_menu_tree`/`menus_assign_location` → `publish_content_publish` → (visitor submit) →
`forms_list_submissions`.
Pass: live `/get-in-touch` returns 200 with the form. Live header has the link. The submission is visible.
**Catch:** the submission lands in the **live** site's DB, not this computer's. Check the live admin's Forms or
pull with `publish_content_plan_pull`. A local `forms_list_submissions` will not show it. The menu and form must
also be covered by publish (check `publish_backstop_gaps`). EXT (live). Status: WIP (publish tool).

**ST-2. AI images → article → live (demo video 1).** "Use Higgsfield to make 2 images about 'the nascent agentic
web', write and publish an article called 'The Nascent Agentic Web' using them, then publish it live and give me
the link." Tools: Higgsfield MCP → `media_import_from_url` → `content_post_create`/`content_post_update` →
`publish_content_publish` → `fetch_live_url`. Pass: live article returns 200 and both images load on live (media
bytes must publish too). Reply's first link is the live URL. EXT (paid + live). Status: WIP / ?.

**ST-3. Laptop → GitHub backup → deploy → live article.** "Write a short post 'We moved to Tovu', back up the site
to my private GitHub repo, deploy, and show me the post on the live site." Tools: `content_post_create` →
`site_backup_plan` → `site_backup_push` → deploy (static: `deployment_execute_static_publish`. Full site: **no
tool**, D-10) → `fetch_live_url`. Pass: backup commit in repo, live post 200. EXT (GitHub + host). Status: GAP for
the full-site deploy step.

**ST-4. Brand refresh.** "Generate a simple logo, put it in the header, change the accent color to forest green,
and publish the theme change live." Tools: `media_generate_asset` (or Higgsfield) → `theme_edit_file` →
`publish_content_publish` (theme-files type). Pass: live header shows logo and green. EXT (paid + live). Status: ?.

**ST-5. Safe change with undo.** "Make a restore point, then rewrite the About page intro. Actually, undo that."
Tools: `backup_create_restore_point` → `pages_write_region` → `change_sets_revert`. Pass: About intro back to
original. Restore point listed. LOCAL. Status: OK (check that change sets cover HTML region writes).

**ST-6. Go live on my domain.** "Publish the site to Netlify, then check my domain coffee.test points at it and
HTTPS works." Tools: `deployment_execute_static_publish` → `domain_check_dns` → `domain_tls_status`. Pass: Netlify
URL serves the site. DNS/TLS answers match reality. EXT. Status: ?.

**ST-7. Organize the blog.** "Make categories Brewing and Beans, sort my 5 newest posts into them, and add a
Brewing link to the header." Tools: taxonomy tools → `menus_update_menu_tree`. Pass: posts tagged, header link
opens the category listing. LOCAL. Status: ? (category listing URL).

**ST-8. Move a page without breaking links.** "Change the Contact page URL to /talk-to-us and make the old URL
still work." Tools: `content_post_update` (slug) → `redirects_create`. Pass: `/talk-to-us` 200, `/contact` 301.
LOCAL (then EXT if published). Status: OK.

**ST-9. Add a teammate.** "Add Jane as an editor and tell me what she can and can't do." Tools: U-01 + U-02. Pass:
Jane in Users, permission summary matches. LOCAL. Status: OK.

**ST-10. SEO sweep then publish.** "Check SEO on all my published pages, fix any missing descriptions, rebuild the
sitemap, and publish live." Tools: `seo_analyze_entry` (each) → `seo_set_entry_overrides` →
`seo_regenerate_sitemap` → `publish_content_publish`. Pass: no "missing description" issues. Live pages carry the
meta. EXT (live). Status: WIP (publish) / ? (do SEO overrides publish?).

**ST-11. Recipes section.** "Make a Recipes section with 3 recipes and a public page listing them." Tools: K-01,
K-02, then K-04 (unknown). LOCAL. Status: ?.

---

## Known gaps (summary)

1. P-05: editor doesn't reflect assistant edits / stale slug (todos).
2. P-10: no scheduled publishing.
3. P-12: no featured-image field/tool.
4. G-07 / W-05: no third-party embeds (Calendly/iframe): `<script src>` banned, no embed widget type.
5. F-06: can't delete a form from chat (`trash_item` lacks `form`).
6. F-07: can't trash a submission. The tool description says `form_submission` works, the schema refuses it.
7. N-05: can't delete a menu (`trash_item` lacks `menu`).
8. T-06: no theme catalog to install from (deleted 2026-10-04, owner).
9. L-10: plugins/skills/agent-plugin files don't publish live (theme files only).
10. B-06: no restore from a GitHub backup.
11. D-10: no full-site deploy (Fly) trigger.
12. X-07: DONE 2026-10-05 (`plugins_install`).
13. X-08: DONE 2026-10-05 (`skills_install`, GitHub URL).
14. U-06: user delete can't be reached (`trash_item` lacks `user`, but `identity_user_delete` needs it trashed).
15. U-07: no user password reset (may be on purpose).
16. U-09: no member create/invite.
17. U-13: no own-password / two-step change (likely on purpose).
18. Y-04: can't delete a tag/term.
19. A-02: analytics is only the recent buffer, no longer history.
20. A-04: no server-errors/logs tool for the local site.
21. A-07: can't create a new site.
22. A-08: can't switch sites.
23. A-10: no commerce setup (Stripe/products).

**In progress (WIP):** L-03/04/05 publish live, O-09 chat title, O-10 live links in replies.

Side note found while checking: `menus_assign_location`'s input description still points at `menus_list_menus` /
`menus_get_menu`, which are not in the catalog (they were folded into `content_read.menu`). The model may look for
tools that don't exist.

---

## How to run these repeatably

### Option A: script against the local server's chat API (recommended for the main pass)

What exists already:
- **`development/scripts/agent-run-probe.mjs`** drives one real run headlessly through the exact path the admin
  composer uses. It logs in with `POST /api/admin/v1/auth/login` (seeded `admin`/`tovu-dev`), then
  `POST /api/runs` and `GET /api/runs/:runId/events` (SSE). It writes `<label>.events.jsonl` and a summary with a
  tool_use histogram, turn count, cost and final text. This is **Local CLI mode**: it spawns the installed coding-agent
  CLI (Claude Code), so it runs on the subscription with no per-token bill.
- **BYOK mode:** `POST /api/admin/v1/assistant/byok-turn`
  (`apps/website/src/server/runtime/composition/modules/assistant-byok.ts:75`). One request, one SSE stream. It
  accepts `byok.baseUrl`, so it can point at a **loopback stub model**. That gives a free, deterministic run against
  the real catalog, real handlers and real DB (memory `live_byok_turn_stub_provider_verification`). The stub tests
  plumbing (tool found, args accepted, DB changed), not whether a real model picks the right tool.
- **Confirm cards** (marked "confirm card" above) park the tool until answered. A script must answer them with
  `POST /api/admin/v1/mcp-ui/tool-calls` (`apps/website/src/assistant/mcp-ui-tool-calls-route.ts:92`) or
  `POST /api/admin/v1/a2ui/actions` (`a2ui-actions-route.ts:67`), using the surface id from the SSE `agent` event.
- **Admin-tab actions** (`page.*`, `admin.capture_screenshot`, `admin.publish_content`) need a live admin tab bound to
  the run, so they **can't run headless**.

Plan: turn `agent-run-probe.mjs` into a batch runner. It reads the rows from this file, runs one fresh chat per
prompt (and keeps a chat across steps for stories), records which tools were called, then checks the **pass
condition separately**. Checks read the admin REST API, the site DB read-only (`file:sites/<site>/content.db?mode=ro`),
`curl` on the local public site, and live `GET`s. The run's own reply is never the check. Default to
LOCAL/RO rows. EXT rows only run when named, with the owner's OK. Run against a duplicated site (`sites_duplicate_site`)
so test writes don't touch tovu-dev.

### Option B: Claude in Chrome

Use Chrome only for the rows a script can't see: O-05 to O-10, L-06, how confirm cards look, link rendering in
replies, and the live-site form submit in ST-1. It's slower and not repeatable, but it is the only way to check what
the owner actually sees.

**Recommendation:** script first (batch `agent-run-probe.mjs`, Local CLI with the real model for the main pass,
stub-BYOK as a cheap regression run of handlers). Claude in Chrome only for the ~10 UI-bound rows.

### Prerequisites by row

| Needed | Rows |
|---|---|
| API started with `.env` loaded (root key), or saved credentials can't decrypt and BYOK/Higgsfield are skipped | all EXT rows, M-03/04/05, I-*, B-*, D-03/05/08/09 |
| Local CLI (Claude Code) installed, or a BYOK key saved in Settings | every row |
| Admin tab open and bound to the run | O-06, O-07, L-06 |
| Live site deployed with the publish peer connected (`publish_content_status` = works); owner OK (HOLD) | L-03/04/05/07/10, ST-1/2/3/4/10 |
| **Private** GitHub repo with ≥1 commit (README) + saved GitHub credential (custom provider, base URL = GitHub API origin) | B-03, ST-3 |
| GitHub credential with repo write | B-04, `custom_credential_write_files` |
| Fly app + saved Fly token | D-08, D-09, D-10 |
| Netlify (or other static host) token | D-03/05, ST-6 |
| OpenAI (or other) image key in Media providers; costs per image | M-03, ST-4 |
| Higgsfield agent plugin on + connected; `z_image` on current plan (`gpt-image-2` needs basic+); video costs more, ask first. Daemon restart after connecting | M-04, M-05, X-05, ST-2 |
| Mail driver configured (else expect an honest "mail off") | F-01 email, U-08 |
| Postgres URL | R-07 |
| Supabase account (OAuth) | I-04 |
| Public URL that accepts webhooks (e.g. a request bin) | I-06 |
| A real domain you control | D-11, ST-6 |

---

## Appendix: full tool catalog (246 tools, built 2026-10-05)

Built from the live registry. "Defined at" is where the tool id is declared (catalog entry or registration). Jini
packages are shown by their source path. `publish_content_publish` is uncommitted (WIP).

| Tool id | R/W | Defined at |
|---|---|---|
| `agent_plugin_connect` | W | `apps/website/src/features/agent-plugins/connect-tool.ts` |
| `agent_plugin_set_access_token` | W | `apps/website/src/features/agent-plugins/access-token-tool.ts` |
| `agent_plugin_write_note` | W | `apps/website/src/features/agent-plugins/write-note-tool.ts` |
| `analytics_list_recent_hits` | R | `apps/website/src/features/analytics/agent-tools.ts:3` |
| `assistant_admin_screen_link` | R | `apps/website/src/assistant/admin-screen-link-tool.ts:98` |
| `assistant_ask_choice` | R | `apps/website/src/assistant/ask-choice-tool.ts` |
| `assistant_demo_a2ui` | R | `apps/website/src/assistant/demo-a2ui-tool.ts:55` |
| `assistant_demo_choices` | R | `apps/website/src/assistant/demo-choices-tool.ts` |
| `assistant_demo_image` | R | `apps/website/src/assistant/demo-image-tool.ts:38` |
| `assistant_render_ui` | R | `apps/website/src/assistant/render-ui-tool.ts:26` |
| `backup_create_restore_point` | W | `apps/website/src/features/recovery/agent-tools.ts:152` |
| `backup_execute_restore` | W | `apps/website/src/features/recovery/agent-tools.ts:138` |
| `backup_get_capabilities` | R | `apps/website/src/features/recovery/agent-tools.ts:121` |
| `backup_plan_restore` | R | `apps/website/src/features/recovery/agent-tools.ts:128` |
| `change_sets_list` | R | `apps/website/src/features/change-sets/agent-tools.ts:88` |
| `change_sets_revert` | W | `apps/website/src/features/change-sets/agent-tools.ts:99` |
| `collections_content_type_define` | W | `@jini-ai/cms/src/content-types/agent-tools.ts:145` |
| `collections_content_type_deprecate` | W | `@jini-ai/cms/src/content-types/agent-tools.ts:181` |
| `collections_content_type_reactivate` | W | `@jini-ai/cms/src/content-types/agent-tools.ts:188` |
| `collections_content_type_tombstone` | W | `@jini-ai/cms/src/content-types/agent-tools.ts:195` |
| `collections_content_type_update_fields` | W | `@jini-ai/cms/src/content-types/agent-tools.ts:165` |
| `collections_entry_create` | W | `@jini-ai/cms/src/entries/tool-registrations.ts:142` |
| `collections_entry_publish` | W | `@jini-ai/cms/src/entries/agent-tools.ts:148` |
| `collections_entry_unpublish` | W | `@jini-ai/cms/src/entries/agent-tools.ts:162` |
| `collections_entry_update` | W | `@jini-ai/cms/src/entries/tool-registrations.ts:162` |
| `comments_approve_comment` | W | `apps/website/src/features/comments/agent-tools.ts:166` |
| `comments_get_settings` | R | `apps/website/src/features/comments/agent-tools.ts:130` |
| `comments_mark_comment_spam` | W | `apps/website/src/features/comments/agent-tools.ts:173` |
| `comments_purge_comment` | W | `apps/website/src/features/permanent-delete/agent-tools.ts:9` |
| `comments_restore_comment` | W | `apps/website/src/features/comments/agent-tools.ts:188` |
| `comments_trash_comment` | W | `apps/website/src/features/comments/agent-tools.ts:180` |
| `comments_update_settings` | W | `apps/website/src/features/comments/agent-tools.ts:137` |
| `commerce_get_status` | R | `apps/website/src/features/commerce/status-tool.ts:12` |
| `content_duplicate` | W | `apps/website/src/features/content-duplication/agent-tools.ts:37` |
| `content_post_create` | W | `apps/website/src/features/post/tool-registrations.ts:720` |
| `content_post_delete` | W | `apps/website/src/features/post/agent-tools.ts:916` |
| `content_post_preview` | R | `apps/website/src/features/post/preview-tool.ts:17` |
| `content_post_search` | R | `apps/website/src/features/post/tool-registrations.ts:638` |
| `content_post_update` | W | `apps/website/src/features/post/tool-registrations.ts:789` |
| `content_read.backup_restore_point` | R | `apps/website/src/assistant/content-read-tool.ts:133` |
| `content_read.collection_content_type` | R | `apps/website/src/assistant/content-read-tool.ts:134` |
| `content_read.collection_entry` | R | `apps/website/src/assistant/content-read-tool.ts:135` |
| `content_read.comment_moderation_queue` | R | `apps/website/src/assistant/content-read-tool.ts:136` |
| `content_read.content_post` | R | `apps/website/src/assistant/content-read-tool.ts:137` |
| `content_read.custom_credential` | R | `apps/website/src/assistant/content-read-tool.ts:138` |
| `content_read.database_pending_migration` | R | `apps/website/src/assistant/content-read-tool.ts:139` |
| `content_read.database_restore_point` | R | `apps/website/src/assistant/content-read-tool.ts:140` |
| `content_read.external_mcp` | R | `apps/website/src/assistant/content-read-tool.ts:141` |
| `content_read.form_definition` | R | `apps/website/src/assistant/content-read-tool.ts:142` |
| `content_read.identity_policy` | R | `apps/website/src/assistant/content-read-tool.ts:143` |
| `content_read.identity_role` | R | `apps/website/src/assistant/content-read-tool.ts:144` |
| `content_read.identity_user` | R | `apps/website/src/assistant/content-read-tool.ts:145` |
| `content_read.media_asset` | R | `apps/website/src/assistant/content-read-tool.ts:146` |
| `content_read.member` | R | `apps/website/src/assistant/content-read-tool.ts:147` |
| `content_read.menu` | R | `apps/website/src/assistant/content-read-tool.ts:148` |
| `content_read.newsletter_campaign` | R | `apps/website/src/assistant/content-read-tool.ts:150` |
| `content_read.newsletter_list` | R | `apps/website/src/assistant/content-read-tool.ts:156` |
| `content_read.plugin` | R | `apps/website/src/assistant/content-read-tool.ts:157` |
| `content_read.redirect` | R | `apps/website/src/assistant/content-read-tool.ts:158` |
| `content_read.seo_entry_meta` | R | `apps/website/src/assistant/content-read-tool.ts:162` |
| `content_read.setting_definition` | R | `apps/website/src/assistant/content-read-tool.ts:163` |
| `content_read.taxonomy` | R | `apps/website/src/assistant/content-read-tool.ts:164` |
| `content_read.theme` | R | `apps/website/src/assistant/content-read-tool.ts:165` |
| `content_read.webhook_subscription` | R | `apps/website/src/assistant/content-read-tool.ts:166` |
| `content_read.widget_instance` | R | `apps/website/src/assistant/content-read-tool.ts:168` |
| `content_read.widget_region` | R | `apps/website/src/assistant/content-read-tool.ts:173` |
| `content_read.workspace` | R | `apps/website/src/assistant/content-read-tool.ts:176` |
| `content_stats` | R | `apps/website/src/features/post/content-stats-tool.ts:28` |
| `custom_credential_create` | W | `apps/website/src/features/custom-credentials/agent-tools.ts:308` |
| `custom_credential_delete` | W | `apps/website/src/features/permanent-delete/agent-tools.ts:12` |
| `custom_credential_make_request` | W | `apps/website/src/features/custom-credentials/agent-tools.ts:284` |
| `custom_credential_set_token` | W | `apps/website/src/features/custom-credentials/agent-tools.ts:300` |
| `custom_credential_set_username` | W | `apps/website/src/features/custom-credentials/agent-tools.ts:292` |
| `custom_credential_verify` | R | `apps/website/src/features/custom-credentials/agent-tools.ts:276` |
| `custom_credential_write_files` | W | `apps/website/src/features/custom-credentials/agent-tools.ts:316` |
| `database_execute_migrate_forward` | W | `apps/website/src/features/database/tool-registrations.ts` |
| `database_get_health` | R | `apps/website/src/features/database/tool-registrations.ts:104` |
| `database_get_schema_state` | R | `apps/website/src/features/database/tool-registrations.ts:106` |
| `database_plan_migrate_forward` | R | `apps/website/src/features/database/tool-registrations.ts:96` |
| `database_query_timeline` | R | `apps/website/src/features/database/tool-registrations.ts:91` |
| `database_transfer_plan` | R | `apps/website/src/features/database-transfer/tool-registrations.ts:39` |
| `database_transfer_run` | W | `apps/website/src/features/database-transfer/tool-registrations.ts` |
| `database_transfer_set_destination` | W | `apps/website/src/features/database-transfer/tool-registrations.ts` |
| `database_transfer_status` | R | `apps/website/src/features/database-transfer/tool-registrations.ts:40` |
| `deployment_delete_provider_credential` | W | `apps/website/src/features/permanent-delete/agent-tools.ts:13` |
| `deployment_execute_static_publish` | W | `apps/website/src/features/deployments/publish-agent-tools.ts:247` |
| `deployment_generate_bucket_hosting_setup` | R | `apps/website/src/features/deployments/publish-agent-tools.ts:273` |
| `deployment_get_dockerfile` | R | `apps/website/src/features/deployments/agent-tools.ts:126` |
| `deployment_get_export_status` | R | `apps/website/src/features/deployments/agent-tools.ts:117` |
| `deployment_get_static_publish_capabilities` | R | `apps/website/src/features/deployments/publish-agent-tools.ts:239` |
| `deployment_ops_list_targets` | R | `apps/website/src/features/deployments/deploy-ops/agent-tools.ts:30` |
| `deployment_ops_logs` | R | `apps/website/src/features/deployments/deploy-ops/tool-registrations.ts:14` |
| `deployment_ops_status` | R | `apps/website/src/features/deployments/deploy-ops/tool-registrations.ts:12` |
| `deployment_ops_wait` | R | `apps/website/src/features/deployments/deploy-ops/tool-registrations.ts:16` |
| `deployment_preview_static_publish` | R | `apps/website/src/features/deployments/publish-agent-tools.ts:231` |
| `deployment_propose_custom_provider_credential` | W | `apps/website/src/features/deployments/publish-agent-tools.ts:260` |
| `deployment_set_dockerfile` | W | `apps/website/src/features/deployments/agent-tools.ts:134` |
| `deployment_trigger_export` | W | `apps/website/src/features/deployments/agent-tools.ts:109` |
| `describe_component` | R | `apps/website/src/assistant/component-catalog-tool.ts:45` |
| `domain_check_dns` | R | `apps/website/src/features/domain-dns/tools.ts:48` |
| `domain_lookup_dns` | R | `apps/website/src/features/domain-dns/tools.ts:42` |
| `domain_tls_status` | R | `apps/website/src/features/domain-dns/tools.ts:54` |
| `external_mcp_delete` | W | `apps/website/src/features/permanent-delete/agent-tools.ts:11` |
| `external_mcp_get_admissions` | R | `apps/website/src/features/external-mcp/operations-tools.ts:31` |
| `external_mcp_oauth_connect` | W | `apps/website/src/features/external-mcp/agent-tools.ts:201` |
| `external_mcp_oauth_poll_device` | W | `apps/website/src/features/external-mcp/agent-tools.ts:213` |
| `external_mcp_probe_connection` | W | `apps/website/src/features/external-mcp/operations-tools.ts:24` |
| `external_mcp_reauth_prompt` | R | `apps/website/src/assistant/external-mcp-reauth-tool.ts:80` |
| `external_mcp_save` | W | `apps/website/src/features/external-mcp/agent-tools.ts:177` |
| `external_mcp_test_connection` | W | `apps/website/src/features/external-mcp/agent-tools.ts:189` |
| `fetch_live_url` | R | `apps/website/src/features/site-inspection/agent-tools.ts:165` |
| `fetch_published_page` | R | `apps/website/src/features/site-inspection/tool-registrations.ts:170` |
| `forms_create_definition` | W | `apps/website/src/features/forms/tool-registrations.ts:292` |
| `forms_get_submission` | R | `apps/website/src/features/forms/agent-tools.ts:284` |
| `forms_list_submissions` | R | `apps/website/src/features/forms/agent-tools.ts:262` |
| `forms_set_definition_status` | W | `apps/website/src/features/forms/tool-registrations.ts:334` |
| `forms_update_definition` | W | `apps/website/src/features/forms/tool-registrations.ts:314` |
| `fs_list_files` | R | `apps/website/src/features/fs-files/agent-tools.ts:124` |
| `fs_read_file` | R | `apps/website/src/features/fs-files/agent-tools.ts:125` |
| `identity_policy_attach` | W | `@jini-ai/user-management/src/server/agent-tools.ts:313` |
| `identity_policy_create` | W | `@jini-ai/user-management/src/server/agent-tools.ts:267` |
| `identity_policy_delete` | W | `apps/website/src/features/identity/tool-registrations.ts` |
| `identity_policy_list_permissions` | R | `apps/website/src/features/identity/permission-list-tool.ts:12` |
| `identity_policy_update` | W | `@jini-ai/user-management/src/server/agent-tools.ts:283` |
| `identity_role_assign` | W | `@jini-ai/user-management/src/server/agent-tools.ts:228` |
| `identity_role_create` | W | `@jini-ai/user-management/src/server/agent-tools.ts:215` |
| `identity_role_delete` | W | `apps/website/src/features/identity/tool-registrations.ts` |
| `identity_role_rename` | W | `@jini-ai/user-management/src/server/agent-tools.ts:241` |
| `identity_user_create` | W | `apps/website/src/features/identity/tool-registrations.ts` |
| `identity_user_delete` | W | `apps/website/src/features/permanent-delete/agent-tools.ts:10` |
| `identity_user_disable` | W | `@jini-ai/user-management/src/server/agent-tools.ts:199` |
| `identity_user_enable` | W | `@jini-ai/user-management/src/server/agent-tools.ts:207` |
| `identity_user_update_email` | W | `@jini-ai/user-management/src/server/agent-tools.ts:183` |
| `media_generate_asset` | W | `apps/website/src/features/media-generation/tool-registrations.ts:326` |
| `media_import_from_url` | W | `apps/website/src/features/media-import/tool-registrations.ts:281` |
| `media_import_local_file` | W | `apps/website/src/features/media-import/agent-tools.ts:105` |
| `media_list_providers` | R | `apps/website/src/features/media-generation/providers-tools.ts:39` |
| `media_propose_provider_credential` | W | `apps/website/src/features/media-generation/tool-registrations.ts` |
| `media_purge_asset` | W | `apps/website/src/features/permanent-delete/agent-tools.ts:8` |
| `media_trash_asset` | W | `apps/website/src/features/trash/trash-item-tool.ts:171` |
| `media_update_metadata` | W | `@jini-ai/cms/src/media/tool-registrations.ts:277` |
| `media_upload_asset` | W | `apps/website/src/features/media/tool-registrations.ts` |
| `media_view_image` | R | `apps/website/src/features/media/view-image-tool.ts:45` |
| `members_disable` | W | `apps/website/src/features/members/agent-tools.ts:110` |
| `members_request_magic_link` | W | `apps/website/src/features/members/agent-tools.ts:118` |
| `menus_assign_location` | W | `@jini-ai/cms/src/navigation/agent-tools.ts:241` |
| `menus_create_menu` | W | `@jini-ai/cms/src/navigation/agent-tools.ts:201` |
| `menus_update_menu_tree` | W | `@jini-ai/cms/src/navigation/tool-registrations.ts:145` |
| `newsletter_archive_list` | W | `apps/website/src/features/newsletter/agent-tools.ts:204` |
| `newsletter_cancel_campaign` | W | `apps/website/src/features/newsletter/agent-tools.ts:161` |
| `newsletter_create_campaign` | W | `apps/website/src/features/newsletter/agent-tools.ts:135` |
| `newsletter_create_list` | W | `apps/website/src/features/newsletter/agent-tools.ts:189` |
| `newsletter_create_subscription` | W | `apps/website/src/features/newsletter/agent-tools.ts:218` |
| `newsletter_list_send_log` | R | `apps/website/src/features/newsletter/agent-tools.ts:121` |
| `newsletter_list_subscriptions` | R | `apps/website/src/features/newsletter/agent-tools.ts:109` |
| `newsletter_pause_campaign` | W | `apps/website/src/features/newsletter/agent-tools.ts:174` |
| `newsletter_remove_subscription` | W | `apps/website/src/features/newsletter/agent-tools.ts:235` |
| `newsletter_resend_confirmation` | W | `apps/website/src/features/newsletter/tool-registrations.ts:489` |
| `newsletter_resume_campaign` | W | `apps/website/src/features/newsletter/delivery/tool-registrations.ts:53` |
| `newsletter_schedule_campaign` | W | `apps/website/src/features/newsletter/delivery/tool-registrations.ts:47` |
| `newsletter_send_campaign` | W | `apps/website/src/features/newsletter/delivery/tool-registrations.ts:41` |
| `newsletter_send_test` | W | `apps/website/src/features/newsletter/delivery/tool-registrations.ts:35` |
| `newsletter_update_campaign` | W | `apps/website/src/features/newsletter/agent-tools.ts:148` |
| `pages_move_region` | W | `apps/website/src/features/pages/agent-tools.ts:225` |
| `pages_read_html` | R | `apps/website/src/features/pages/agent-tools.ts:119` |
| `pages_write_html` | W | `apps/website/src/features/pages/agent-tools.ts:140` |
| `pages_write_region` | W | `apps/website/src/features/pages/agent-tools.ts:177` |
| `plugins_set_enabled` | W | `apps/website/src/features/plugin-runtime/agent-tools.ts:210` |
| `plugins_install` | W | `apps/website/src/features/plugin-runtime/install-tool.ts` |
| `plugins_uninstall` | W | `apps/website/src/features/plugin-runtime/agent-tools.ts:226` |
| `publish_backstop_gaps` | R | `apps/website/src/features/publish-content/agent-tools.ts:42` |
| `publish_content_connect` | W | `apps/website/src/features/publish-content/agent-tools.ts:43` |
| `publish_content_disconnect` | W | `apps/website/src/features/publish-content/disconnect-tool.ts:13` |
| `publish_content_execute_pull` | W | `apps/website/src/features/publish-content/tool-registrations.ts` |
| `publish_content_plan_pull` | W | `apps/website/src/features/publish-content/agent-tools.ts:45` |
| `publish_content_publish` | W | `apps/website/src/features/publish-content/agent-tools.ts:41` |
| `publish_content_status` | R | `apps/website/src/features/publish-content/agent-tools.ts:41` |
| `recovery_get_status` | R | `apps/website/src/features/recovery/agent-tools.ts:160` |
| `recovery_resolve_deep_link` | R | `apps/website/src/features/recovery/agent-tools.ts:171` |
| `redirects_create` | W | `apps/website/src/features/redirects/agent-tools.ts:204` |
| `redirects_get_hits` | R | `apps/website/src/features/redirects/agent-tools.ts:197` |
| `redirects_import` | W | `apps/website/src/features/redirects/agent-tools.ts:226` |
| `redirects_tombstone` | W | `apps/website/src/features/trash/trash-item-tool.ts:184` |
| `redirects_update` | W | `apps/website/src/features/redirects/agent-tools.ts:212` |
| `search_agent_plugin_local` | R | `apps/website/src/features/agent-plugins/tool-registrations.ts:885` |
| `search_components` | R | `apps/website/src/assistant/component-catalog-tool.ts:44` |
| `seo_analyze_entry` | R | `apps/website/src/features/seo/agent-tools.ts:232` |
| `seo_get_settings` | R | `apps/website/src/features/seo/agent-tools.ts:248` |
| `seo_regenerate_sitemap` | W | `apps/website/src/features/seo/agent-tools.ts:263` |
| `seo_set_entry_overrides` | W | `apps/website/src/features/seo/agent-tools.ts:240` |
| `seo_set_settings` | W | `apps/website/src/features/seo/tool-registrations.ts:191` |
| `settings_clear_value` | W | `apps/website/src/features/settings/tool-registrations.ts` |
| `settings_get_effective` | R | `@jini-ai/cms/src/settings/agent-tools.ts:164` |
| `settings_get_raw` | R | `@jini-ai/cms/src/settings/agent-tools.ts:172` |
| `settings_list_ui_locales` | R | `apps/website/src/features/settings/ui-locales-tool.ts:11` |
| `settings_set_ui_preference` | W | `apps/website/src/features/settings/ui-locales-tool.ts:66` |
| `settings_set_value` | W | `apps/website/src/features/settings/tool-registrations.ts` |
| `site_backup_plan` | R | `apps/website/src/features/site-backup/tool-registrations.ts:96` |
| `site_backup_push` | W | `apps/website/src/features/site-backup/tool-registrations.ts` |
| `site_collect_page_evidence` | R | `apps/website/src/features/site-evidence/agent-tools.ts:35` |
| `site_describe_capabilities` | R | `apps/website/src/features/site-inspection/tool-registrations.ts:147` |
| `site_get_profile` | R | `apps/website/src/features/site-inspection/tool-registrations.ts:134` |
| `sites_duplicate_site` | W | `apps/website/src/features/sites/tool-registrations.ts:157` |
| `sites_list` | R | `apps/website/src/features/sites/list-tool.ts:11` |
| `skills_install` | W | `apps/website/src/features/skills/install-tool.ts` |
| `source_control_delete_credential` | W | `apps/website/src/features/permanent-delete/agent-tools.ts:14` |
| `source_control_execute_commit` | W | `apps/website/src/features/source-control/tool-registrations.ts:185` |
| `source_control_get_capabilities` | R | `apps/website/src/features/source-control/tool-registrations.ts:177` |
| `source_control_propose_credential` | W | `apps/website/src/features/source-control/tool-registrations.ts:167` |
| `system_get_mail_status` | R | `apps/website/src/features/mail-status/agent-tools.ts:3` |
| `taxonomy_assign_terms` | W | `apps/website/src/features/taxonomy/tool-registrations.ts:131` |
| `taxonomy_create_taxonomy` | W | `apps/website/src/features/taxonomy/tool-registrations.ts:124` |
| `taxonomy_create_term` | W | `apps/website/src/features/taxonomy/tool-registrations.ts:126` |
| `taxonomy_execute_merge_term` | W | `apps/website/src/features/taxonomy/tool-registrations.ts` |
| `taxonomy_get_assigned_terms` | R | `apps/website/src/features/taxonomy/agent-tools.ts:19` |
| `taxonomy_plan_merge_term` | R | `apps/website/src/features/taxonomy/tool-registrations.ts:137` |
| `taxonomy_rename_term` | W | `apps/website/src/features/taxonomy/tool-registrations.ts:128` |
| `taxonomy_unassign_terms` | W | `apps/website/src/features/taxonomy/tool-registrations.ts:134` |
| `theme_copy_file` | W | `apps/website/src/features/theme/tool-registrations.ts:854` |
| `theme_edit_file` | W | `apps/website/src/features/theme/agent-tools.ts:371` |
| `theme_list_files` | R | `apps/website/src/features/theme/tool-registrations.ts:629` |
| `theme_read_file` | R | `apps/website/src/features/theme/tool-registrations.ts:651` |
| `theme_rename_file` | W | `apps/website/src/features/theme/tool-registrations.ts:796` |
| `theme_rescan` | W | `apps/website/src/features/theme/agent-tools.ts:328` |
| `theme_reset_file` | W | `apps/website/src/features/theme/tool-registrations.ts:760` |
| `theme_restore_trashed_file` | W | `apps/website/src/features/theme/tool-registrations.ts:946` |
| `theme_set_active` | W | `apps/website/src/features/theme/set-active-theme-tool.ts:51` |
| `theme_set_page_published` | W | `apps/website/src/features/theme/page-publish-tool.ts:13` |
| `theme_trash_file` | W | `apps/website/src/features/theme/tool-registrations.ts:891` |
| `theme_write_file` | W | `apps/website/src/features/theme/tool-registrations.ts:672` |
| `trash_empty` | W | `apps/website/src/features/permanent-delete/agent-tools.ts:6` |
| `trash_item` | W | `apps/website/src/features/trash/trash-item-tool.ts:88` |
| `trash_list_items` | R | `apps/website/src/features/trash/agent-tools.ts:120` |
| `trash_purge_item` | W | `apps/website/src/features/permanent-delete/agent-tools.ts:7` |
| `trash_restore_item` | W | `apps/website/src/features/trash/agent-tools.ts:139` |
| `webhooks_create_subscription` | W | `apps/website/src/features/webhooks/agent-tools.ts:167` |
| `webhooks_delete_subscription` | W | `apps/website/src/features/webhooks/agent-tools.ts:182` |
| `webhooks_get_deliveries` | R | `apps/website/src/features/webhooks/agent-tools.ts:160` |
| `webhooks_pause_subscription` | W | `apps/website/src/features/webhooks/agent-tools.ts:175` |
| `widgets_bind_region` | W | `apps/website/src/features/widgets/agent-tools.ts:238` |
| `widgets_create_instance` | W | `apps/website/src/features/widgets/tool-registrations.ts:295` |
| `widgets_insert_embed` | W | `apps/website/src/features/widgets/tool-registrations.ts:417` |
| `widgets_remove_embed` | W | `apps/website/src/features/widgets/agent-tools.ts:294` |
| `widgets_reorder_embeds` | W | `apps/website/src/features/widgets/agent-tools.ts:313` |
| `widgets_set_region_placements` | W | `apps/website/src/features/widgets/agent-tools.ts:252` |
| `widgets_trash_instance` | W | `apps/website/src/features/trash/trash-item-tool.ts:195` |
| `widgets_update_instance` | W | `apps/website/src/features/widgets/tool-registrations.ts:313` |
| `workspace_update` | W | `@jini-ai/cms/src/workspace/agent-tools.ts:93` |
