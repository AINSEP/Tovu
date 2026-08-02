# AI-native WordPress Alternative — Pain Discovery Report (Reformatted)

**What happened:** the uploaded markdown file starts mid‑table (the very beginning is missing), which is why “Part 1” rendered unreadably. I rebuilt the tables and normalized formatting.  
**Important limitation:** only **44 dataset items** are present in the uploaded file, so I cannot reconstruct the missing items without the original full export.

---

## A) Dataset (Recovered 44 items)

### Dataset Part 1 (items 1–22)

| url | source_type | date_posted | persona | experience_level | context_stage | pain_point_statement | underlying_cause | severity | frequency_signal | current_workarounds | wish_list | ai_opportunity_tag | representative_quote |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| https://os.wordpress.org/plugins/far-future-expiry-header/ | plugin-review | 2024-05-07 | solo site owner | non-technical | performance tuning | A caching/header plugin review titled “Broke My Site” suggests the plugin caused breakage severe enough for a 1‑star report. | Server header/caching plugins can misconfigure cache headers and break asset delivery in some environments. | 4 | 2 | Remove/disable the plugin (implied). | Safe configuration defaults; automatic rollback of header rules that cause failures. | perf autopilot + automatic fixes | “Broke My Site”  |
| https://en-ca.wordpress.org/plugins/wp-simple-post-view/ | plugin-review | 2024-02-08 | blogger | intermediate | security/maintenance | Updating a post view-count plugin to 2.0.1 “broke my site” and showed a “Security check” error, forcing deactivation. | Plugin update introduced a failing security/nonce check or compatibility issue with WP 6.4.3. | 4 | 5 | Deactivate the plugin (mentioned). | Compatibility tests for minor updates; clearer error messages for ‘security check’ failures. | safe updates + debugging | “when I updated … to 2.0.1 and it broke my site … I had to deactivate it.”  |
| https://wordpress.org/plugins/autoptimize/ | plugin-review | 2025-11-06 | small business | intermediate | performance tuning | Installing Autoptimize immediately “totally broke” the homepage CSS layout, and removing it left the page broken. | Asset optimization/minification can reorder or remove critical CSS/JS; incomplete cleanup on uninstall can persist breakage. | 4 | 2 | Remove plugin (mentioned).<br>• Restore CSS/assets; clear caches (implied). | Safe asset optimization with preview, diff, and page-level rollback; clean uninstall. | perf autopilot + safe updates + automatic fixes | “Immediately after … Autoptimize my Home page became totally disordered … after the plugin was removed the page left broken.”  |
| https://wordpress.org/plugins/tawkto-live-chat/ | plugin-review | 2025-02-07 | small business | non-technical | security/maintenance | A new version (0.9.0) of a chat plugin broke the site initially; after disabling, the user couldn’t figure out how to delete/remove it. | Plugin upgrade regression and unclear uninstall/deprovisioning UX for embedded services. | 3 | 5 | Disable the plugin (mentioned). | Clear uninstall path that fully removes widgets/scripts; rollback for breaking releases. | assistant-guided UX + safe updates | “This new version (0.9.0) broke my site initially … I can’t find where to delete this.”  |
| https://wordpress.org/plugins/disable-dashboard-for-woocommerce/ | plugin-review | 2025-01-13 | ecommerce operator | intermediate | performance tuning | A reviewer says the WooCommerce-based WP backend is “very slow” and installing a debloat plugin didn’t improve admin performance (still >4s). | WooCommerce admin slowness driven by DB queries, extensions, and admin UI load; a single plugin can’t fix systemic bloat. | 3 | 4 | Try other performance measures (implied). | Plugin-less WooCommerce admin that is fast by default; built-in performance profiling for wp-admin. | perf autopilot + plugin-less primitives | “the WP backend … is very slow … still load on more than 4 s.”  |
| https://wordpress.org/plugins/error-monitor-and-notifier/ | plugin-review | 2025-06-25 | agency | intermediate | security/maintenance | A reviewer complains WordPress ‘critical error’/white-screen style failures leave you to figure out what went wrong on your own. | Core’s fatal-error UX lacks actionable diagnostics for non-dev users; logs are hard to access. | 4 | 3 | Install an error monitor plugin (implied by the review). | First-party error explanations, stack traces, and guided remediation in wp-admin. | debugging + assistant-guided UX | “You are left to find out what went wrong on your own.”  |
| https://de.wordpress.org/plugins/wc-blacklist-manager/ | plugin-review | 2025-07-23 | ecommerce operator | intermediate | security/maintenance | A WooCommerce anti-fraud plugin review warns it’s “breaking all form functionality” with a critical error on submit. | Checkout/form hooks conflict with other plugins/themes; insufficient compatibility testing for checkout-critical pathways. | 5 | 4 | Uninstall/avoid the plugin (implied). | Checkout-safe security primitives; sandboxed rules that can’t crash forms. | safe updates + security autopilot + debugging | “All of my forms and woocommerce checkout is getting a critical error … not worth installing.”  |
| https://wordpress.org/plugins/simple-revision-control/ | plugin-review | 2022-09-15 | agency | intermediate | security/maintenance | A reviewer reports pages ‘randomly and untraceably disappeared’ after purging revisions, and only backups saved the site (older canonical). | Plugin data-deletion logic unsafe or bugged; high-risk operations without robust safeguards. | 5 | 2 | Restore from backups (mentioned).<br>• Test on staging first (mentioned). | Guaranteed safe data operations with preview, undo, and per-page audit trail. | safe updates + automatic fixes + collaboration | “many pages (10+) have randomly and untraceably disappeared. Panic ensued … only our backups could save …”  |
| https://www.reddit.com/r/Wordpress/comments/1jzz2oo/wordpress_68_broke_my_post_editor_layout/ | reddit | 2025-04-15 | solo site owner | intermediate | content publishing | After updating to WordPress 6.8, the post editor layout broke (UI shifted), making writing/editing hard. | Core editor UI regression in WordPress 6.8 or conflict with theme/CSS; insufficient regression coverage for editor layout. | 4 | 3 | None mentioned in title; likely roll back or wait for patch (implied). | Editor layout stability across releases; quick rollback for core updates. | safe updates + automatic fixes + debugging | “WordPress 6.8 broke my post editor layout”  |
| https://www.reddit.com/r/Wordpress/comments/1pd35y4/wordpress_69_is_causing_permanent_100_cpu_usage/ | reddit | 2025-12-03 | agency | developer | scaling | Upgrading to WordPress 6.9 caused some sites to peg CPU at 100% with no traffic increase, forcing rollbacks. | Theme/plugin incompatibility or core regression causing tight loops; no automatic canary/rollback for core updates on production. | 5 | 2 | Roll back to previous WordPress version (mentioned).<br>• Pause auto-updates and wait for patch (mentioned). | Automatic detection of performance regressions post-update; safe rollback for core changes. | safe updates + perf autopilot + debugging | “CPU usage … maxing out … Rolling back … immediately fixes the load.”  |
| https://www.reddit.com/r/Wordpress/comments/1pdxnlo/i_got_an_email_saying_my_site_has_been_updated/ | reddit | 2025-12-04 | small business | non-technical | security/maintenance | An update happened and the live site is “completely destroyed” even though Elementor looks normal in the editor. | Update incompatibility causing CSS/asset regeneration issues (common with builders) and lack of guided recovery for non-devs. | 5 | 3 | None stated by OP; asks how to get back to normal. | One-click “restore last known good” after an update; clear root-cause explanation for why editor and live differ. | safe updates + assistant-guided UX + debugging | “I have no idea why everything always breaks when an update happens … I’m not a web developer.”  |
| https://www.reddit.com/r/Wordpress/comments/1hypg1a/cant_log_into_wpadmin_how_do_i_rollback_to_wp_662/ | reddit | 2025-01-11 | solo site owner | non-technical | security/maintenance | A bug in WP 6.7 prevents logging into wp-admin; the user wants to roll back core via FTP without losing content. | Core update regression plus lack of a supported rollback path for non-dev operators. | 5 | 3 | Downloaded SQL and site files for backup (mentioned).<br>• Considering core rollback via FTP (mentioned). | Supported core rollback and ‘admin recovery’ that doesn’t require CLI/SSH. | safe updates + assistant-guided UX + debugging | “Can’t log into wp-admin … rollback … using only FTP?”  |
| https://www.reddit.com/r/Wordpress/comments/1le8jd3/core_web_vitals_failing_due_to_high_ttfb_even/ | reddit | 2025-06-18 | agency | developer | performance tuning | A heavily optimized WooCommerce site still fails Core Web Vitals due to high TTFB after migrating hosts, adding CDN, Redis, etc. | Complex stack (WooCommerce + builder + 50+ plugins) with backend bottlenecks; “optimization” lacks root-cause visibility. | 4 | 2 | Migrated hosting; added caching/CDN; enabled Redis; optimized DB (mentioned). | End-to-end profiling that points to the real TTFB source (PHP, DB, plugin, external calls) with safe fixes. | perf autopilot + debugging | “spent nearly a week … 50+ plugins … still failing Core Web Vitals … root cause … high TTFB.”  |
| https://www.reddit.com/r/Wordpress/comments/1kan4cp/litespeed_cachequiccloud_still_no_big_improvement/ | reddit | 2025-04-29 | solo site owner | intermediate | performance tuning | Even with LiteSpeed Cache + QUIC.cloud CDN on a “simple” WordPress site, Google PageSpeed/Core Web Vitals don’t improve much. | Performance tuning requires more than enabling cache/CDN; bottlenecks may be theme, third-party scripts, or server config. | 3 | 2 | Install LiteSpeed Cache and QUIC.cloud; apply “all optimizations I could think of” (mentioned). | Performance autopilot that explains which changes matter and validates them safely. | perf autopilot + assistant-guided UX | “still not seeing significant improvements … even though the site is really simple.”  |
| https://www.reddit.com/r/Wordpress/comments/1g8vt5o/upgraded_site_from_74_to_81_php_and_it_broke_help/ | reddit | 2024-10-21 | small business | non-technical | security/maintenance | Upgrading PHP from 7.4 to 8.1 via host UI broke the site (critical error), and the host UI wouldn’t allow downgrading. | Hosting environment upgrade broke an outdated premium theme (Avada/ThemeFusion) and removed fallback options. | 5 | 3 | Identify theme as culprit and roll back to PHP 7.4 (mentioned).<br>• Plan to update theme to new major version (mentioned). | Pre-upgrade compatibility scan; safe rollback path for PHP changes; staging-first guidance. | safe updates + assistant-guided UX + debugging | “as soon as I apply version 8.1, the site is now broken … critical error … couldn’t go backwards to 7.4.”  |
| https://www.reddit.com/r/Wordpress/comments/1bvuule/is_anyone_having_avada_wordpress_v_65_update/ | reddit | 2024-04-04 | agency | intermediate | security/maintenance | WP 6.5 update anxiety: a client site uses Avada, which hadn’t updated its theme/builder yet, so updating core felt risky. | Theme/vendor lag behind core releases; site owners can’t safely update without breaking builder/theme compatibility. | 4 | 3 | Delay updates until theme/builder updates (implied). | Compatibility gating: block core updates when critical dependencies aren’t ready; clear vendor readiness signals. | safe updates + governance/trust | “As of April 4, 2024, Avada had not updated the theme or builders.”  |
| https://www.reddit.com/r/Wordpress/comments/1bv6ros/65_broke_my_editor/ | reddit | 2024-04-03 | blogger | intermediate | content publishing | After an auto-update, the editor background/appearance suddenly changed and the user asked host about rollback without losing changes. | Core update UI/CSS regression or host caching; lack of clarity on what changed and how to revert safely. | 3 | 2 | Ask host for rollback to prior version (mentioned). | Change log tied to observed UI changes; safe rollback that preserves content edits. | assistant-guided UX + safe updates | “Asked host if can be rolled back … without losing … changes…”  |
| https://www.reddit.com/r/Wordpress/comments/1fr7440/gutenberg_whats_the_fuss/ | reddit | 2024-09-28 | freelance dev | developer | design/build | Developers debate Gutenberg: beyond performance concerns, people cite usability and missing responsive/breakpoint controls as core friction. | Block editor UX lacks certain “layout builder” affordances (e.g., breakpoints), leading to CSS workarounds. | 3 | 4 | Use CSS manually; rely on page builders for breakpoints (implied by discussion). | Responsive design primitives and clearer usability model in Gutenberg. | plugin-less primitives + assistant-guided UX | “The lack of breakpoints is just ridiculous for me …”  |
| https://www.reddit.com/r/Wordpress/comments/1ixy0pk/elementors_new_price_obfuscation_practices/ | reddit | 2025-02-25 | small business | intermediate | security/maintenance | A long-time Elementor user says pricing is being obscured (features labeled ‘Free Trial’ without price), creating fear of surprise charges. | Plugin vendor monetization strategy (add-ons/AI) shifts cost uncertainty onto site owners. | 3 | 2 | Ask support chat for pricing (mentioned).<br>• Avoid unclear pricing software (mentioned by commenter). | Transparent, predictable pricing; no feature activation on sites without disclosed cost. | governance/trust + collaboration | “trying to get people to accept the plugin use without knowing how much they will be charged … shady business.”  |
| https://www.reddit.com/r/Wordpress/comments/1jeiuxf/wp_rocket_discontinue_infinite_license_whilst/ | reddit | 2025-03-18 | agency | intermediate | performance tuning | A WP Rocket customer saw a major price hike and removal of an unlimited license, forcing a reevaluation of performance tooling costs. | Subscription/tiering changes by vendors create operational risk for agencies managing many sites. | 3 | 2 | Cancel and request refund (mentioned). | Stable licensing for infrastructure-like plugins; predictable costs as sites scale. | governance/trust + plugin-less primitives | “charged … $479.20 … removed the Unlimited option … easiest cancellation …”  |
| https://www.reddit.com/r/Wordpress/comments/1i3m8nh/kadence_announces_new_prices_and_features_what_do/ | reddit | 2025-01-17 | agency | intermediate | design/build | Kadence’s move to per-site licensing and higher lifetime pricing prompts agencies to question lock-in and long-term cost. | Ecosystem monetization shifts from one-time purchases to recurring/per-site fees, increasing toolchain fragility. | 3 | 2 | Look for alternatives; consider building native blocks (mentioned in comments). | Core/block tooling that reduces reliance on pricey add-ons; portability across themes/builders. | plugin-less primitives + governance/trust | “They’re moving to a model where you pay based on how many sites you use.”  |
| https://www.reddit.com/r/Wordpress/comments/1ijrdpb/is_elementor_pro_still_bloated_trash/ | reddit | 2025-02-07 | freelance dev | intermediate | design/build | Developers describe Elementor as “bloated and slow,” questioning whether it’s still viable for performance-focused sites in 2025. | Builder architecture loads heavy assets and deep DOM structures; performance tuning becomes hard without replacing the builder. | 4 | 2 | Switch builders (e.g., Bricks) or use Gutenberg (implied).<br>• Optimize aggressively (implied). | Fast-by-default, plugin-less design system with predictable output and minimal CSS/JS. | plugin-less primitives + perf autopilot | “Is Elementor Pro still bloated trash?”  |

### Dataset Part 2 (items 23–44)

| url | source_type | date_posted | persona | experience_level | context_stage | pain_point_statement | underlying_cause | severity | frequency_signal | current_workarounds | wish_list | ai_opportunity_tag | representative_quote |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| https://www.reddit.com/r/Wordpress/comments/1lr1lxj/cant_upload_anything_into_this_months_upload/ | reddit | 2025-07-03 | small business | intermediate | content publishing | After the month rolled over, nothing would upload into /uploads/2025/07 unless the folder was deleted and recreated. | Filesystem permissions/ownership or server config issue affecting monthly uploads directory creation. | 3 | 3 | Delete and recreate uploads folder (mentioned). | Built-in diagnostics for media upload failures (permissions, disk, paths) with one-click fixes. | automatic fixes + assistant-guided UX + debugging | “Nothing uploads into /uploads/2025/07 … unless I delete and remake it.”  |
| https://www.reddit.com/r/Wordpress/comments/1ldipil/edit_twentytwentyfives_mobile_menu/ | reddit | 2025-06-17 | solo site owner | intermediate | design/build | A user likes the Twenty Twenty-Five theme but can’t figure out how to edit the mobile menu without installing another plugin. | FSE/menu customization discoverability issues; lack of simple menu editing affordances for common tweaks. | 3 | 2 | Looked for mobile menu plugins but disliked them (mentioned). | Simple mobile menu controls built into theme/editor without extra plugins. | assistant-guided UX + plugin-less primitives | “Edit TwentyTwentyFive's mobile menu”  |
| https://news.ycombinator.com/item?id=40294198 | hn | 2024-05-07 | in-house dev | developer | design/build | HN discussion frames “modern WordPress” as a painful developer experience (and links to posts like “Yikes”). | Mismatch between WP’s legacy architecture and modern web-dev expectations; theme/plugin ecosystem complexity. | 3 | 2 | Adopt headless setups or alternative CMS (implied). | Simpler primitives and modern DX without patchwork. | governance/trust + plugin-less primitives + migration | “Modern WordPress – Yikes”  |
| https://news.ycombinator.com/item?id=41170111 | hn | 2024-08-07 | in-house dev | developer | security/maintenance | HN discussion of nonce/authorization issues in WordPress plugins highlights systemic plugin security risks and site-owner exposure. | Large plugin supply chain with variable security practices; hard for site owners to assess risk. | 4 | 3 | Use 2FA, backups, and selective plugin choices (discussed). | Automated security policy enforcement and trustworthy vetting signals for plugins. | security autopilot + governance/trust + debugging | “Exploiting authorization by nonce in WordPress plugins”  |
| https://news.ycombinator.com/item?id=41728788 | hn | 2024-10-28 | freelance dev | developer | migration | Developers discuss leaving WordPress (“So long, WordPress”) as part of a broader migration trend away from WP stacks. | Accumulated maintenance cost (plugins, updates, performance) surpasses benefits for some projects. | 3 | 3 | Rebuild on other stacks/platforms (implied). | Migration paths and content portability without vendor lock-in. | migration + plugin-less primitives | “So long, WordPress”  |
| https://news.ycombinator.com/item?id=42659929 | hn | 2025-01-13 | in-house dev | developer | scaling | HN debate claims “WordPress is in trouble” and questions whether a generic CMS can safely serve so many use cases without heavy plugin stacks. | Overextension into ecommerce/enterprise workloads; reliance on third-party plugins for core capabilities. | 3 | 2 | Use specialized platforms for narrow use cases (discussed). | Opinionated, use-case-focused systems with fewer moving parts. | governance/trust + plugin-less primitives | “WordPress Is in Trouble”  |
| https://news.ycombinator.com/item?id=42523934 | hn | 2024-12-27 | in-house dev | developer | governance | HN discussion around WordPress leadership/drama underscores a trust/governance layer to product risk (decisions affect ecosystem stability). | Centralized leadership and ecosystem politics shape roadmap and vendor relationships. | 2 | 2 | Diversify stacks; avoid heavy coupling to WP-specific vendors (implied). | Transparent governance and predictable roadmap for stakeholders. | governance/trust | “Matt Mullenweg Asks What Drama to Create in 2025 …”  |
| https://wordpress.stackexchange.com/questions/430386/preventing-output-of-layout-styles-from-gutenberg-blocks | so | 2024-04-29 | freelance dev | developer | design/build | Developers struggle to prevent Gutenberg blocks from outputting layout styles, implying hard-to-control generated CSS. | Block supports/layout styles are applied automatically; overriding requires deep knowledge of theme.json/support flags and filters. | 3 | 2 | Custom theme code to disable supports (implied). | A supported, documented way to opt out of specific block-generated layout CSS at scale. | assistant-guided UX + plugin-less primitives | “Preventing Output of Layout Styles from Gutenberg Blocks”  |
| https://wordpress.stackexchange.com/questions/430000/how-to-delete-a-page-template-from-gutenberg-editor | so | 2024-03-29 | freelance dev | developer | design/build | Deleting a page template created in Gutenberg is non-obvious; devs ask how to remove templates from the editor. | Templates are saved as posts/entities in DB or theme files; UI does not clearly map creation to storage and deletion. | 3 | 2 | Delete template entity via Templates UI or DB (implied). | Clear template lifecycle management: create, locate, delete, restore, version. | assistant-guided UX + debugging | “How to delete a page template from Gutenberg editor”  |
| https://wordpress.stackexchange.com/questions/432287/how-to-remove-block-theme-from-wordpress-install-or-its-directory | so | 2024-11-09 | freelance dev | developer | migration | Users ask how to fully remove a block theme from an install, reflecting confusion about what block themes modify and where. | Block themes can touch templates, theme.json styles, and site editor data; removing may leave residual customization. | 2 | 3 | Switch to another theme and delete theme files (implied). | Safe theme removal that surfaces what will be lost/kept, with export/backups. | assistant-guided UX + migration | “How to remove block theme from wordpress install or its directory”  |
| https://wordpress.stackexchange.com/questions/438260/how-to-load-use-custom-js-in-gutenberg-available-in-classical-editor-and-frontend | so | 2025-07-13 | freelance dev | developer | design/build | Developers wrestle with loading custom JS so it works in Gutenberg and the front end, highlighting fragmented asset pipelines. | Separate contexts (editor vs frontend) require different enqueue points and build steps; easy to get wrong. | 3 | 2 | Enqueue scripts for editor and frontend separately (implied). | Unified, well-documented asset pipeline for blocks and frontend behavior. | assistant-guided UX + debugging | “How to load & use custom js in gutenberg … and frontend as well?”  |
| https://wordpress.stackexchange.com/questions/435037/how-to-add-text-to-the-left-of-an-image-in-gutenberg | so | 2025-03-09 | blogger | intermediate | content publishing | Simple layout requests like placing text to the left of an image lead users to StackExchange for help, implying editor layout limitations. | Gutenberg lacks “text wrap around image” workflows familiar from classic editors; requires columns/custom HTML/CSS. | 2 | 2 | Use Columns block or custom CSS/HTML (implied). | Basic rich-text layout controls (text wrap, alignment) without custom CSS. | assistant-guided UX + plugin-less primitives | “How to add text to the left of an image in Gutenberg?”  |
| https://github.com/WordPress/gutenberg/issues/61849 | github | 2024-05-22 | freelance dev | developer | design/build | Setting a global block gap for Columns in Global Styles can appear correct in the editor but not render on the frontend. | Mismatch between editor canvas styles and frontend CSS generation/serialization for block gap. | 3 | 4 | Manually add CSS gap rules in theme (implied). | WYSIWYG parity between editor and frontend; diff showing what will be generated. | automatic fixes + debugging + plugin-less primitives | “Adding block gap global styles does not work for Columns …”  |
| https://github.com/WordPress/gutenberg/issues/64670 | github | 2024-08-21 | in-house dev | developer | design/build | Editors struggle to understand inherited Global Styles values; there’s an effort to reflect inherited values in block appearance panels. | Theme.json + user styles layering makes it unclear what value is actually in effect for a block. | 2 | 2 | Inspect generated CSS or theme.json (implied). | UI that shows effective value + where it came from (theme, global styles, block override). | assistant-guided UX + plugin-less primitives | “reflect inherited global styles values …”  |
| https://github.com/WordPress/gutenberg/issues/64027 | github | 2024-07-27 | solo site owner | intermediate | design/build | When templates are missing/deleted, the Site Editor needs clearer context and direct links to restore or fix the right template. | Site Editor error states are too vague; users don’t know which template controls which view or how to restore it. | 3 | 2 | Manually hunt in Appearance > Editor > Templates (implied). | Contextual “this template displays X” messaging + one-click restore/default reset. | assistant-guided UX + automatic fixes | “Provide Context and Direct Links to Fix Empty …”  |
| https://github.com/WordPress/gutenberg/issues/61077 | github | 2024-04-16 | freelance dev | developer | design/build | White text can be invisible in the editor when editing patterns, making it hard to see what you’re doing. | Editor canvas/text color contrast bug depending on theme styles and pattern editing context. | 2 | 2 | Change theme styles temporarily; adjust contrast in the pattern (implied). | Accessible editor canvas contrast with reliable previews. | automatic fixes + assistant-guided UX | “White text not visible when editing pattern.”  |
| https://wordpress.org/support/topic/my-site-was-hack-malware-attack/ | wp-org-forum | 2025-06-14 | small business | non-technical | security/maintenance | A site owner reports a hack that changed the sitemap, added 1,000+ spam URLs, and caused redirects/spam results in Google. | Compromised WP install (core/plugin/theme) or credentials; attackers inject spam pages and submit fake sitemaps. | 5 | 3 | Remove fake sitemap in Search Console (mentioned).<br>• Clean site / remove malware (implied). | Security autopilot that detects and removes injected URLs/users; guided recovery steps tied to Search Console symptoms. | security autopilot + debugging + assistant-guided UX | “My site was hacked … Over 1,000 suspicious URLs are now indexed in Google.”  |
| https://wordpress.org/support/topic/site-hacked-cleaned-up-but-a-lot-of-redirects-in-google-search-console/ | wp-org-forum | 2026-01-17 | small business | intermediate | security/maintenance | Even after cleanup, hacked redirect URLs linger and keep getting re-validated in Google Search Console. | Residual redirect rules/doorway pages remain or Google cache persists; cleanup and verification workflow is unclear for owners. | 4 | 3 | Validate removals in Search Console (mentioned). | Tooling that maps infected URLs to filesystem/DB origins; automated removal + verification guidance. | security autopilot + assistant-guided UX + debugging | “Some of them are still redirecting to the fake site … being verified/passed by Google Search Console.”  |
| https://wordpress.org/support/topic/possible-hack-attempt-which-seemed-to-almost-work/ | wp-org-forum | 2025-09-05 | ecommerce operator | intermediate | security/maintenance | A store owner investigates a ‘possible hack attempt’ with suspicious entries (e.g., placeholder orders) and needs DB-level guidance. | Attackers or bots can generate bogus order records or probe endpoints; owners lack clear forensics workflows. | 4 | 3 | Inspect wp_posts table via phpMyAdmin/CLI (suggested). | Security autopilot for ecommerce: anomaly detection in orders/users + guided incident response. | security autopilot + debugging + assistant-guided UX | “possible hack attempt which seemed to ‘almost’ work”  |
| https://wordpress.org/support/topic/update-results-in-critical-error/ | wp-org-forum | 2025-11-13 | ecommerce operator | developer | security/maintenance | After an update, the site crashed with a critical error and logs showed a PHP fatal inside a WooCommerce payments plugin. | Plugin update introduced fatal error; payment gateway integrations are brittle across updates. | 5 | 3 | Inspect PHP error log (mentioned).<br>• Disable the failing plugin (implied). | Automatic rollback and dependency checks for payment plugins; preflight tests for critical commerce flows. | safe updates + debugging + automatic fixes | “after an update the site crashed with critical error … PHP Fatal error …”  |
| https://ghost.org/changelog/how-to-transfer-your-site-from-wordpress-to-ghost/ | blog | 2026-02-08 | blogger | intermediate | migration | Ghost’s migration guide emphasizes moving from WordPress to Ghost, implying demand for simpler publishing stacks and migrations. | Users seek fewer moving parts and lower maintenance overhead than typical WP + plugins stacks. | 3 | 2 | Use Ghost’s import tools and guides (mentioned). | Automated migration that preserves posts, URLs, images, and comments with minimal manual work. | migration + assistant-guided UX | “How to transfer your site from WordPress to Ghost”  |
| https://ryanfitton.co.uk/migrated-from-wordpress-to-ghost/ | blog | 2025-03-31 | blogger | intermediate | migration | A blogger describes migrating from WordPress to Ghost, typically motivated by reducing complexity and maintenance. | Perceived WP maintenance burden (updates, plugins, performance) outweighs benefits for a blog-focused use case. | 3 | 2 | Migration to Ghost (mentioned). | Portable content model and frictionless migration away from WP without breaking SEO. | migration + plugin-less primitives | “Migrated from WordPress to Ghost”  |

---

## B) Pain taxonomy (clusters → count → avg severity → example sources)

| cluster | count | avg_severity | example_sources |
| --- | --- | --- | --- |
| Updates: plugin releases and auto-updates | 6 | 4.5 | wp-org-forum: https://wordpress.org/support/topic/wordpress-critical-error-14/  ; wp-org-forum: https://wordpress.org/support/topic/version-3-3-38-breaking-sites/  ; plugin-review: https://wordpress.org/plugins/login-page-styler/ |
| WooCommerce and ecommerce friction | 5 | 4.4 | wp-org-forum: https://wordpress.org/support/topic/woocommerce-not-working-after-database-update/  ; wp-org-forum: https://wordpress.org/support/topic/woocommerce-database-update-in-progress-forever-2/  ; wp-org-forum: https://wordpress.org/support/topic/certain-product-pages-causing-critical-error-on-website/ |
| Global styles, CSS, and responsive design gaps | 5 | 2.8 | github: https://github.com/wordpress/gutenberg/issues/67476  ; github: https://github.com/WordPress/gutenberg/issues/62261  ; github: https://github.com/WordPress/gutenberg/issues/59574 |
| Updates: core releases and admin access | 4 | 4.5 | reddit: https://www.reddit.com/r/Wordpress/comments/1jzz2oo/wordpress_68_broke_my_post_editor_layout/  ; reddit: https://www.reddit.com/r/Wordpress/comments/1pdxnlo/i_got_an_email_saying_my_site_has_been_updated/  ; reddit: https://www.reddit.com/r/Wordpress/comments/1hypg1a/cant_log_into_wpadmin_how_do_i_rollback_to_wp_662/ |
| Critical errors & debugging opacity | 4 | 4.25 | github: https://github.com/WordPress/gutenberg/issues/73882  ; wp-org-forum: https://wordpress.org/support/topic/site-kit-error-there-was-a-critical-error-on-your-website/  ; plugin-review: https://wordpress.org/plugins/hkdev-maintenance-mode/ |
| Plugin conflicts & debugging | 4 | 4.0 | wp-org-forum: https://wordpress.org/support/topic/products-not-displaying-9/  ; wp-org-forum: https://wordpress.org/support/topic/plugin-causes-errors-in-wp-2/page/2/  ; plugin-review: https://en-ca.wordpress.org/plugins/easy-video-reviews/ |
| Hosting & environment mismatch | 4 | 3.75 | wp-org-forum: https://wordpress.org/support/topic/excessive-database-queries-and-export-functionality-failure/  ; wp-org-forum: https://wordpress.org/support/topic/php-deprecated-notice-on-php8-3/  ; reddit: https://www.reddit.com/r/Wordpress/comments/1g8vt5o/upgraded_site_from_74_to_81_php_and_it_broke_help/ |
| Security and supply-chain risk | 4 | 4.25 | hn: https://news.ycombinator.com/item?id=41170111  ; wp-org-forum: https://wordpress.org/support/topic/my-site-was-hack-malware-attack/  ; wp-org-forum: https://wordpress.org/support/topic/site-hacked-cleaned-up-but-a-lot-of-redirects-in-google-search-console/ |
| FSE: crashes, recovery, and broken states | 4 | 3.5 | github: https://github.com/WordPress/gutenberg/issues/67498  ; github: https://github.com/WordPress/gutenberg/issues/60587  ; github: https://github.com/WordPress/gutenberg/issues/66888 |
| Migration away from WordPress | 4 | 2.75 | hn: https://news.ycombinator.com/item?id=41728788  ; so: https://wordpress.stackexchange.com/questions/432287/how-to-remove-block-theme-from-wordpress-install-or-its-directory  ; blog: https://ghost.org/changelog/how-to-transfer-your-site-from-wordpress-to-ghost/ |
| Performance: editor and backend regressions | 3 | 4.33 | github: https://github.com/WordPress/gutenberg/issues/64732  ; github: https://github.com/WordPress/gutenberg/issues/68875  ; reddit: https://www.reddit.com/r/Wordpress/comments/1pd35y4/wordpress_69_is_causing_permanent_100_cpu_usage/ |
| Caching and optimization complexity | 3 | 4.0 | wp-org-forum: https://wordpress.org/support/topic/both-websites-are-broken/  ; plugin-review: https://os.wordpress.org/plugins/far-future-expiry-header/  ; plugin-review: https://wordpress.org/plugins/autoptimize/ |
| Publishing: data loss and corruption | 3 | 4.67 | github: https://github.com/wordpress/gutenberg/issues/74158  ; github: https://github.com/WordPress/gutenberg/issues/68725  ; plugin-review: https://wordpress.org/plugins/simple-revision-control/ |
| Publishing: save failures and REST errors | 3 | 3.33 | github: https://github.com/WordPress/gutenberg/issues/67141  ; wp-org-forum: https://wordpress.org/support/topic/json-error-updating-failed-the-response-is-not-a-valid-json-response-3/  ; wp-org-forum: https://wordpress.org/support/topic/update-failed-the-response-is-not-a-valid-json-response-5/ |
| Admin UX fragmentation | 3 | 3.33 | github: https://github.com/WordPress/gutenberg/issues/70095  ; plugin-review: https://wordpress.org/plugins/uipress-lite/  ; github: https://github.com/WordPress/gutenberg/issues/64670 |
| Developer experience and tooling | 3 | 2.67 | github: https://github.com/WordPress/gutenberg/issues/68490  ; so: https://wordpress.stackexchange.com/questions/438260/how-to-load-use-custom-js-in-gutenberg-available-in-classical-editor-and-frontend  ; so: https://wordpress.stackexchange.com/questions/430386/preventing-output-of-layout-styles-from-gutenberg-blocks |
| FSE: navigation, menus, and mobile editing | 3 | 3.0 | github: https://github.com/WordPress/gutenberg/issues/69101  ; github: https://github.com/WordPress/gutenberg/issues/62649  ; reddit: https://www.reddit.com/r/Wordpress/comments/1ldipil/edit_twentytwentyfives_mobile_menu/ |
| FSE: template lifecycle management | 3 | 3.0 | github: https://github.com/wordpress/gutenberg/issues/74055  ; so: https://wordpress.stackexchange.com/questions/430000/how-to-delete-a-page-template-from-gutenberg-editor  ; github: https://github.com/WordPress/gutenberg/issues/64027 |
| Performance: CWV, TTFB, and frontend bloat | 3 | 3.67 | reddit: https://www.reddit.com/r/Wordpress/comments/1le8jd3/core_web_vitals_failing_due_to_high_ttfb_even/  ; reddit: https://www.reddit.com/r/Wordpress/comments/1kan4cp/litespeed_cachequiccloud_still_no_big_improvement/  ; reddit: https://www.reddit.com/r/Wordpress/comments/1ijrdpb/is_elementor_pro_still_bloated_trash/ |
| Licensing, subscriptions, and cost creep | 3 | 3.0 | reddit: https://www.reddit.com/r/Wordpress/comments/1ixy0pk/elementors_new_price_obfuscation_practices/  ; reddit: https://www.reddit.com/r/Wordpress/comments/1jeiuxf/wp_rocket_discontinue_infinite_license_whilst/  ; reddit: https://www.reddit.com/r/Wordpress/comments/1i3m8nh/kadence_announces_new_prices_and_features_what_do/ |
| Multisite and permissions complexity | 3 | 3.67 | github: https://github.com/wordpress/gutenberg/issues/73157  ; github: https://github.com/WordPress/gutenberg/issues/61608  ; wp-org-forum: https://wordpress.org/support/topic/website-inaccessible-after-6-9-upgrade/ |
| Governance/trust & ecosystem direction | 3 | 2.67 | hn: https://news.ycombinator.com/item?id=40294198  ; hn: https://news.ycombinator.com/item?id=42659929  ; hn: https://news.ycombinator.com/item?id=42523934 |

---

## C) Top 15 ranked clusters (recomputed scores + mini-briefs)

### Ranked list (Top 25)

| cluster | count | avg_severity | frequency_signal | strategic_fit_for_AI_native | score |
| --- | --- | --- | --- | --- | --- |
| Updates: plugin releases and auto-updates | 6 | 4.5 | 5.0 | 5.0 | 4.775 |
| WooCommerce and ecommerce friction | 5 | 4.4 | 4.0 | 4.0 | 4.18 |
| Updates: core releases and admin access | 4 | 4.5 | 3.0 | 5.0 | 3.875 |
| Critical errors & debugging opacity | 4 | 4.25 | 3.0 | 5.0 | 3.762 |
| Security and supply-chain risk | 4 | 4.25 | 3.0 | 5.0 | 3.762 |
| Plugin conflicts & debugging | 4 | 4.0 | 3.0 | 4.0 | 3.55 |
| Publishing: data loss and corruption | 3 | 4.67 | 2.0 | 5.0 | 3.502 |
| Global styles, CSS, and responsive design gaps | 5 | 2.8 | 4.0 | 4.0 | 3.46 |
| Hosting & environment mismatch | 4 | 3.75 | 3.0 | 4.0 | 3.438 |
| FSE: crashes, recovery, and broken states | 4 | 3.5 | 3.0 | 5.0 | 3.425 |
| Performance: editor and backend regressions | 3 | 4.33 | 2.0 | 5.0 | 3.348 |
| Caching and optimization complexity | 3 | 4.0 | 2.0 | 5.0 | 3.2 |
| Performance: CWV, TTFB, and frontend bloat | 3 | 3.67 | 2.0 | 5.0 | 3.052 |
| Migration away from WordPress | 4 | 2.75 | 3.0 | 4.0 | 2.988 |
| Editor: input regressions and UI glitches | 4 | 2.75 | 3.0 | 4.0 | 2.988 |
| Publishing: save failures and REST errors | 3 | 3.33 | 2.0 | 5.0 | 2.899 |
| Multisite and permissions complexity | 3 | 3.67 | 2.0 | 3.0 | 2.851 |
| Admin UX fragmentation | 3 | 3.33 | 2.0 | 4.0 | 2.798 |
| FSE: template lifecycle management | 3 | 3.0 | 2.0 | 4.0 | 2.65 |
| FSE: navigation, menus, and mobile editing | 3 | 3.0 | 2.0 | 3.0 | 2.55 |
| Editor: stability over time and panel consistency | 3 | 2.67 | 2.0 | 4.0 | 2.502 |
| Developer experience and tooling | 3 | 2.67 | 2.0 | 4.0 | 2.502 |
| Licensing, subscriptions, and cost creep | 3 | 3.0 | 2.0 | 2.0 | 2.45 |
| Editor: accessibility, contrast, and readability | 3 | 2.33 | 2.0 | 4.0 | 2.348 |
| Governance/trust & ecosystem direction | 3 | 2.67 | 2.0 | 2.0 | 2.302 |

---

### Updates: plugin releases and auto-updates (score 4.775)

- **Who it hurts most:** solo site owner, small business, agency, freelance dev
- **Common triggers:** auto-updates; dependency chain changes; host PHP upgrades; security patch rush
- **Why existing solutions fail:** Patchwork of plugins/hosts/builders creates hidden dependencies; fixes are manual, non-deterministic, and often lack safe rollback/verification.
- **Job to be done:** “When I’m in **security/maintenance** and something changes, I want the system to **keep my site working and explain what changed**, so that **I don’t lose time, money, or trust**.”
- **AI-native capability (plugin-less):**
  - Risk scoring + canary rollout for updates, with automatic rollback on errors.
  - Change blame: identify the exact plugin/theme/core change that introduced breakage.
  - Generate a safe, minimal fix (config change, revert, or patch) and verify.
- **Non‑AI capability required:**
  - Atomic deploys + snapshots (files + DB) as a first-class primitive.
  - Deterministic, signed artifacts and dependency locking.
- **Representative sources:** https://wordpress.org/support/topic/wordpress-critical-error-14/, https://wordpress.org/support/topic/version-3-3-38-breaking-sites/, https://wordpress.org/plugins/login-page-styler/

### WooCommerce and ecommerce friction (score 4.180)

- **Who it hurts most:** ecommerce operator, small business, agency
- **Common triggers:** updating WooCommerce/extensions; DB updates/migrations; payment/shipping plugin changes; heavy catalog growth
- **Why existing solutions fail:** Patchwork of plugins/hosts/builders creates hidden dependencies; fixes are manual, non-deterministic, and often lack safe rollback/verification.
- **Job to be done:** “When I’m in **security/maintenance, scaling** and something changes, I want the system to **keep my site working and explain what changed**, so that **I don’t lose time, money, or trust**.”
- **AI-native capability (plugin-less):**
  - Preflight test critical checkout flows before any change (cart → checkout → payment → email).
  - Autofix/rollback when schema migration stalls or gateway throws fatal errors.
  - Guided incident response with clear “what broke” and safe remediation steps.
- **Non‑AI capability required:**
  - Built-in transactional migrations + automatic rollback for DB changes.
  - First-party commerce primitives (payments, tax, shipping hooks) with stable contracts.
- **Representative sources:** https://wordpress.org/support/topic/woocommerce-not-working-after-database-update/, https://wordpress.org/support/topic/woocommerce-database-update-in-progress-forever-2/, https://wordpress.org/support/topic/certain-product-pages-causing-critical-error-on-website/

### Updates: core releases and admin access (score 3.875)

- **Who it hurts most:** solo site owner, small business, agency, freelance dev
- **Common triggers:** auto-updates; dependency chain changes; host PHP upgrades; security patch rush
- **Why existing solutions fail:** Patchwork of plugins/hosts/builders creates hidden dependencies; fixes are manual, non-deterministic, and often lack safe rollback/verification.
- **Job to be done:** “When I’m in **security/maintenance** and something changes, I want the system to **keep my site working and explain what changed**, so that **I don’t lose time, money, or trust**.”
- **AI-native capability (plugin-less):**
  - Risk scoring + canary rollout for updates, with automatic rollback on errors.
  - Change blame: identify the exact plugin/theme/core change that introduced breakage.
  - Generate a safe, minimal fix (config change, revert, or patch) and verify.
- **Non‑AI capability required:**
  - Atomic deploys + snapshots (files + DB) as a first-class primitive.
  - Deterministic, signed artifacts and dependency locking.
- **Representative sources:** https://www.reddit.com/r/Wordpress/comments/1jzz2oo/wordpress_68_broke_my_post_editor_layout/, https://www.reddit.com/r/Wordpress/comments/1pdxnlo/i_got_an_email_saying_my_site_has_been_updated/, https://www.reddit.com/r/Wordpress/comments/1hypg1a/cant_log_into_wpadmin_how_do_i_rollback_to_wp_662/

### Critical errors & debugging opacity (score 3.762)

- **Who it hurts most:** solo site owner, small business, agency, devs
- **Common triggers:** normal day-to-day site operations
- **Why existing solutions fail:** Patchwork of plugins/hosts/builders creates hidden dependencies; fixes are manual, non-deterministic, and often lack safe rollback/verification.
- **Job to be done:** “When I’m in **varies** and something changes, I want the system to **keep my site working and explain what changed**, so that **I don’t lose time, money, or trust**.”
- **AI-native capability (plugin-less):**
  - Assistant-guided UX for common admin tasks with guardrails.
  - Automatic fixes for common breakages with rollback.
  - Debugging copilots that translate errors into steps.
- **Non‑AI capability required:**
  - Audit trails + reversible operations.
  - Stable primitives to reduce plugin sprawl.
- **Representative sources:** https://github.com/WordPress/gutenberg/issues/73882, https://wordpress.org/support/topic/site-kit-error-there-was-a-critical-error-on-your-website/, https://wordpress.org/plugins/hkdev-maintenance-mode/

### Security and supply-chain risk (score 3.762)

- **Who it hurts most:** small business, blogger, agency, in-house dev
- **Common triggers:** vulnerable plugins; credential stuffing; SEO spam injections; supply-chain risk
- **Why existing solutions fail:** Patchwork of plugins/hosts/builders creates hidden dependencies; fixes are manual, non-deterministic, and often lack safe rollback/verification.
- **Job to be done:** “When I’m in **security/maintenance** and something changes, I want the system to **keep my site working and explain what changed**, so that **I don’t lose time, money, or trust**.”
- **AI-native capability (plugin-less):**
  - Continuous extension risk monitoring and auto-mitigation (disable/quarantine) when exploitation patterns appear.
  - Guided cleanup playbooks that map symptoms (redirects, spam pages) to exact DB/filesystem sources.
  - Least-privilege hardening recommendations applied automatically (with undo).
- **Non‑AI capability required:**
  - Sandboxed execution for extensions + permissions model (capability-based).
  - Secure update channel + integrity verification + immutable audit log.
- **Representative sources:** https://news.ycombinator.com/item?id=41170111, https://wordpress.org/support/topic/my-site-was-hack-malware-attack/, https://wordpress.org/support/topic/site-hacked-cleaned-up-but-a-lot-of-redirects-in-google-search-console/

### Plugin conflicts & debugging (score 3.550)

- **Who it hurts most:** solo site owner, small business, agency, devs
- **Common triggers:** normal day-to-day site operations
- **Why existing solutions fail:** Patchwork of plugins/hosts/builders creates hidden dependencies; fixes are manual, non-deterministic, and often lack safe rollback/verification.
- **Job to be done:** “When I’m in **varies** and something changes, I want the system to **keep my site working and explain what changed**, so that **I don’t lose time, money, or trust**.”
- **AI-native capability (plugin-less):**
  - Assistant-guided UX for common admin tasks with guardrails.
  - Automatic fixes for common breakages with rollback.
  - Debugging copilots that translate errors into steps.
- **Non‑AI capability required:**
  - Audit trails + reversible operations.
  - Stable primitives to reduce plugin sprawl.
- **Representative sources:** https://wordpress.org/support/topic/products-not-displaying-9/, https://wordpress.org/support/topic/plugin-causes-errors-in-wp-2/page/2/, https://en-ca.wordpress.org/plugins/easy-video-reviews/

### Publishing: data loss and corruption (score 3.502)

- **Who it hurts most:** blogger, solo site owner, small business
- **Common triggers:** editor save failures; REST/API errors; revision conflicts; content corruption
- **Why existing solutions fail:** Patchwork of plugins/hosts/builders creates hidden dependencies; fixes are manual, non-deterministic, and often lack safe rollback/verification.
- **Job to be done:** “When I’m in **content publishing** and something changes, I want the system to **keep my site working and explain what changed**, so that **I don’t lose time, money, or trust**.”
- **AI-native capability (plugin-less):**
  - Save-reliability autopilot: detect and resolve save failures with actionable explanations.
  - Content integrity checks + automatic repair of corrupted blocks/revisions.
  - Offline/queued publishing with safe reconciliation when connectivity returns.
- **Non‑AI capability required:**
  - Transactional content writes + strong revisioning and conflict resolution.
  - Health checks for REST endpoints and background jobs.
- **Representative sources:** https://github.com/wordpress/gutenberg/issues/74158, https://github.com/WordPress/gutenberg/issues/68725, https://wordpress.org/plugins/simple-revision-control/

### Global styles, CSS, and responsive design gaps (score 3.460)

- **Who it hurts most:** blogger, small business, agency, freelance dev
- **Common triggers:** switching themes; editing templates; style overrides; mobile/responsive adjustments; editor updates
- **Why existing solutions fail:** Patchwork of plugins/hosts/builders creates hidden dependencies; fixes are manual, non-deterministic, and often lack safe rollback/verification.
- **Job to be done:** “When I’m in **design/build, content publishing** and something changes, I want the system to **keep my site working and explain what changed**, so that **I don’t lose time, money, or trust**.”
- **AI-native capability (plugin-less):**
  - Assistant-guided editor UX that safely makes layout/style changes and explains what changed.
  - Auto-recovery from broken template states; detect and repair invalid block markup.
  - Design-system enforcement: keep styles consistent across pages without CSS whack-a-mole.
- **Non‑AI capability required:**
  - Versioned, inspectable template/style artifacts with diff + rollback.
  - Clear separation between content and presentation with stable contracts.
- **Representative sources:** https://github.com/wordpress/gutenberg/issues/67476, https://github.com/WordPress/gutenberg/issues/62261, https://github.com/WordPress/gutenberg/issues/59574

### Hosting & environment mismatch (score 3.438)

- **Who it hurts most:** solo site owner, small business, agency
- **Common triggers:** shared hosts; PHP/MySQL version mismatch; memory limits; cron issues
- **Why existing solutions fail:** Patchwork of plugins/hosts/builders creates hidden dependencies; fixes are manual, non-deterministic, and often lack safe rollback/verification.
- **Job to be done:** “When I’m in **setup, scaling** and something changes, I want the system to **keep my site working and explain what changed**, so that **I don’t lose time, money, or trust**.”
- **AI-native capability (plugin-less):**
  - Environment compatibility scanner with proactive alerts and guided remediation.
  - Auto-tune resource settings and background jobs based on observed load.
  - One-click “safe mode” that disables risky components without breaking admin access.
- **Non‑AI capability required:**
  - Self-contained runtime with known-good defaults + reproducible environments.
  - First-class observability (logs, traces) exposed to non-technical users.
- **Representative sources:** https://wordpress.org/support/topic/excessive-database-queries-and-export-functionality-failure/, https://wordpress.org/support/topic/php-deprecated-notice-on-php8-3/, https://www.reddit.com/r/Wordpress/comments/1g8vt5o/upgraded_site_from_74_to_81_php_and_it_broke_help/

### FSE: crashes, recovery, and broken states (score 3.425)

- **Who it hurts most:** blogger, small business, agency, freelance dev
- **Common triggers:** switching themes; editing templates; style overrides; mobile/responsive adjustments; editor updates
- **Why existing solutions fail:** Patchwork of plugins/hosts/builders creates hidden dependencies; fixes are manual, non-deterministic, and often lack safe rollback/verification.
- **Job to be done:** “When I’m in **design/build, content publishing** and something changes, I want the system to **keep my site working and explain what changed**, so that **I don’t lose time, money, or trust**.”
- **AI-native capability (plugin-less):**
  - Assistant-guided editor UX that safely makes layout/style changes and explains what changed.
  - Auto-recovery from broken template states; detect and repair invalid block markup.
  - Design-system enforcement: keep styles consistent across pages without CSS whack-a-mole.
- **Non‑AI capability required:**
  - Versioned, inspectable template/style artifacts with diff + rollback.
  - Clear separation between content and presentation with stable contracts.
- **Representative sources:** https://github.com/WordPress/gutenberg/issues/67498, https://github.com/WordPress/gutenberg/issues/60587, https://github.com/WordPress/gutenberg/issues/66888

### Performance: editor and backend regressions (score 3.348)

- **Who it hurts most:** small business, agency, freelance dev, ecommerce operator
- **Common triggers:** page builders + plugin stacks; poor hosting/TTFB; CWV failures; editor slowdown
- **Why existing solutions fail:** Patchwork of plugins/hosts/builders creates hidden dependencies; fixes are manual, non-deterministic, and often lack safe rollback/verification.
- **Job to be done:** “When I’m in **performance tuning, scaling** and something changes, I want the system to **keep my site working and explain what changed**, so that **I don’t lose time, money, or trust**.”
- **AI-native capability (plugin-less):**
  - Perf autopilot that proposes and applies safe optimizations (critical CSS, image strategy, query caching) and measures impact.
  - Root-cause attribution (theme vs plugin vs hosting vs content) for slow pages and editor lag.
  - Automatic budgets/guardrails to prevent regressions during changes.
- **Non‑AI capability required:**
  - Built-in performance primitives (edge cache, image pipeline, DB/query observability).
  - Standardized extension interfaces that enforce performance budgets.
- **Representative sources:** https://github.com/WordPress/gutenberg/issues/64732, https://github.com/WordPress/gutenberg/issues/68875, https://www.reddit.com/r/Wordpress/comments/1pd35y4/wordpress_69_is_causing_permanent_100_cpu_usage/

### Caching and optimization complexity (score 3.200)

- **Who it hurts most:** small business, agency, freelance dev, ecommerce operator
- **Common triggers:** page builders + plugin stacks; poor hosting/TTFB; CWV failures; editor slowdown
- **Why existing solutions fail:** Patchwork of plugins/hosts/builders creates hidden dependencies; fixes are manual, non-deterministic, and often lack safe rollback/verification.
- **Job to be done:** “When I’m in **performance tuning, scaling** and something changes, I want the system to **keep my site working and explain what changed**, so that **I don’t lose time, money, or trust**.”
- **AI-native capability (plugin-less):**
  - Perf autopilot that proposes and applies safe optimizations (critical CSS, image strategy, query caching) and measures impact.
  - Root-cause attribution (theme vs plugin vs hosting vs content) for slow pages and editor lag.
  - Automatic budgets/guardrails to prevent regressions during changes.
- **Non‑AI capability required:**
  - Built-in performance primitives (edge cache, image pipeline, DB/query observability).
  - Standardized extension interfaces that enforce performance budgets.
- **Representative sources:** https://wordpress.org/support/topic/both-websites-are-broken/, https://os.wordpress.org/plugins/far-future-expiry-header/, https://wordpress.org/plugins/autoptimize/

### Performance: CWV, TTFB, and frontend bloat (score 3.052)

- **Who it hurts most:** small business, agency, freelance dev, ecommerce operator
- **Common triggers:** page builders + plugin stacks; poor hosting/TTFB; CWV failures; editor slowdown
- **Why existing solutions fail:** Patchwork of plugins/hosts/builders creates hidden dependencies; fixes are manual, non-deterministic, and often lack safe rollback/verification.
- **Job to be done:** “When I’m in **performance tuning, scaling** and something changes, I want the system to **keep my site working and explain what changed**, so that **I don’t lose time, money, or trust**.”
- **AI-native capability (plugin-less):**
  - Perf autopilot that proposes and applies safe optimizations (critical CSS, image strategy, query caching) and measures impact.
  - Root-cause attribution (theme vs plugin vs hosting vs content) for slow pages and editor lag.
  - Automatic budgets/guardrails to prevent regressions during changes.
- **Non‑AI capability required:**
  - Built-in performance primitives (edge cache, image pipeline, DB/query observability).
  - Standardized extension interfaces that enforce performance budgets.
- **Representative sources:** https://www.reddit.com/r/Wordpress/comments/1le8jd3/core_web_vitals_failing_due_to_high_ttfb_even/, https://www.reddit.com/r/Wordpress/comments/1kan4cp/litespeed_cachequiccloud_still_no_big_improvement/, https://www.reddit.com/r/Wordpress/comments/1ijrdpb/is_elementor_pro_still_bloated_trash/

### Migration away from WordPress (score 2.988)

- **Who it hurts most:** blogger, small business, agency
- **Common triggers:** moving hosts/builders/CMS; redesigns; WP.com → self-hosted; multi-site consolidation
- **Why existing solutions fail:** Patchwork of plugins/hosts/builders creates hidden dependencies; fixes are manual, non-deterministic, and often lack safe rollback/verification.
- **Job to be done:** “When I’m in **migration** and something changes, I want the system to **keep my site working and explain what changed**, so that **I don’t lose time, money, or trust**.”
- **AI-native capability (plugin-less):**
  - SEO-safe migration planner that maps URLs, redirects, metadata, and media with validation checks.
  - Automated content model normalization (blocks → portable schema) with previews.
  - Post-migration monitoring to catch 404s, ranking drops, and broken embeds.
- **Non‑AI capability required:**
  - Portable, well-defined content schema + export/import format.
  - Built-in redirect + canonical management and verification tooling.
- **Representative sources:** https://news.ycombinator.com/item?id=41728788, https://wordpress.stackexchange.com/questions/432287/how-to-remove-block-theme-from-wordpress-install-or-its-directory, https://ghost.org/changelog/how-to-transfer-your-site-from-wordpress-to-ghost/

### Editor: input regressions and UI glitches (score 2.988)

- **Who it hurts most:** blogger, small business, agency, freelance dev
- **Common triggers:** switching themes; editing templates; style overrides; mobile/responsive adjustments; editor updates
- **Why existing solutions fail:** Patchwork of plugins/hosts/builders creates hidden dependencies; fixes are manual, non-deterministic, and often lack safe rollback/verification.
- **Job to be done:** “When I’m in **design/build, content publishing** and something changes, I want the system to **keep my site working and explain what changed**, so that **I don’t lose time, money, or trust**.”
- **AI-native capability (plugin-less):**
  - Assistant-guided editor UX that safely makes layout/style changes and explains what changed.
  - Auto-recovery from broken template states; detect and repair invalid block markup.
  - Design-system enforcement: keep styles consistent across pages without CSS whack-a-mole.
- **Non‑AI capability required:**
  - Versioned, inspectable template/style artifacts with diff + rollback.
  - Clear separation between content and presentation with stable contracts.
- **Representative sources:** N/A


---

## D) Opportunity backlog (20 requirements)

| requirement_name | target_persona | success_metric | key_risks | why_wordpress_struggles |
| --- | --- | --- | --- | --- |
| Preflight Update Guardian | agency, small business | ≥90% reduction in update-caused downtime events and “rollback success” within 5 minutes | rollback integrity, false positives, complexity of dependency graphs | updates are distributed across core/themes/plugins/hosts and lack atomic rollback and canary rollout primitives. |
| Atomic Plugin & Core Rollback | solo site owner | user can revert to last-known-good state in ≤2 clicks with no content loss | DB migrations, schema drift | plugins can perform irreversible operations and updates aren’t transactional. |
| Change Blame & Conflict Isolation Engine | freelance dev, agency | median time-to-root-cause <15 minutes for “it broke” incidents | noisy signals, misattribution | no first-class dependency graph or deterministic config registry |
| Safe Mode Boot for Admin & Editor | small business, blogger | ≥95% of fatal-error states still allow admin access + guided recovery | safety (don’t hide real compromise), reliability | fatal errors can crash wp-admin and recovery often requires filesystem/DB access. |
| Editor Integrity Guardrails | blogger | zero “post content not saved” incidents in production | write-path complexity, edge cases | nan |
| REST Failure Classifier | intermediate site owner | ≥70% reduction in forum escalations for JSON/REST save errors | environment variability | nan |
| FSE Template Versioning & One-Click Restore | solo site owner, agency | <1 minute to revert template regressions | template/content coupling | nan |
| Template-to-Route Explainer | non-technical site owner | ≥50% reduction in “where is this template used?” confusion | correctness | nan |
| Performance Autopilot with Bottleneck Attribution | agency, ecommerce operator | measurable CWV improvements and reduced “random optimization plugin installs” | unsafe “optimizations,” misdiagnosis | nan |
| Editor Performance Regression Shield | developers | detect and block regressions pre-release (admin/editor budgets) | false alarms | nan |
| First-Party Caching with Health Checks | small business | fewer “site looks broken” cache incidents | cache invalidation complexity | nan |
| Safe Asset Optimization Pipeline | agency | 0 “CSS totally broke” incidents with optimization enabled | breaking JS/CSS order | nan |
| WooCommerce Upgrade Orchestrator | ecommerce operator | DB updates always complete or roll back with clear status | long migrations | nan |
| Checkout Safety Harness | ecommerce operator | detect checkout failures within minutes post-update and auto-revert | payment compliance, reliability | nan |
| Security Autopilot for SEO Spam & Redirects | small business | time-to-clean <24h and no persistent redirect revalidation | false positives, lockouts | nan |
| Extension Risk Scoring & Policy Enforcement | agency | reduction in vulnerable-extension exposure and incidents | ecosystem pushback, accuracy | nan |
| Environment Compatibility Scanner | site owner on shared host | prevent PHP upgrade breakage | incomplete detection | nan |
| Multisite Role & Capability Analyzer | enterprise/in-house dev | fewer “settings reverted” surprises for non-super-admins | permissions complexity | nan |
| Pricing Volatility Shield | agency | reduced surprise renewals and better cost forecasting across sites | data freshness | nan |
| SEO-Safe Migration Wizard | blogger, small business | preserved rankings/traffic after migration | incomplete mapping, link rot | nan |

---

## Coverage and limitations

The original report text says it focused on concrete incidents over generic sentiment, and included a few older canonical items where the pattern is timeless. (This section was **cut off** in the uploaded file.)
