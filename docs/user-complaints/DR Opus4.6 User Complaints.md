# WordPress in 2025: a comprehensive map of pain points across the ecosystem

**WordPress remains the web's dominant CMS at 43% market share, but its community is fracturing under the weight of architectural debt, governance crisis, and an ecosystem that increasingly feels like it's working against its users.** This report synthesizes complaints from hundreds of distinct community discussions across Reddit, WordPress.org forums, Stack Overflow, Hacker News, GitHub issues, and developer blogs from 2024–2025. The picture that emerges is not of a platform dying — but one whose structural problems are compounding while trust in its leadership has collapsed. Every category below reveals recurring friction that independently might be tolerable but collectively drives a growing cohort of developers, agencies, and site owners to question whether WordPress is still the right choice.

---

## 1. Gutenberg and core WordPress: a forced revolution that split the community

The block editor remains **the single most polarizing feature in WordPress history**. A ThemeIsle study analyzing 340+ community opinions found a near-even split — 159 positive, 139 negative, 50 mixed — but the intensity is asymmetric. Detractors are louder, more detailed, and more emotionally invested.

**Forced adoption and broken writing flow** dominate complaints. Writers and bloggers specifically reject the block paradigm: "As a writer, I don't write in blocks. I write documents as a whole. Block editing only works on sites light on text and heavy on graphics. WordPress is no longer designed for writers" (WordPress.com Forums). The Classic Editor plugin maintains **5+ million active installations** in 2025 — a de facto referendum on Gutenberg. One commenter put it bluntly: "2025 and it still sucks. The classic editor is the most popular plugin with over 9 million downloads. Should say enough" (WPShout). In January 2025, WordPress.com attempted to remove Classic Editor access, triggering panic among long-time users before partially reversing the decision.

**Hidden UI and discoverability problems** frustrate both new and experienced users. Settings are scattered across panels, toolbars, and sidebars with no clear hierarchy. Developer Kevin Geary documented fundamental gaps: no stylable CSS classes, poor HTML semantics, and groups that can't be converted to semantic list elements. Professional developers find these limitations unacceptable for production work. The Gutenberg plugin still holds a **2-star average** on WordPress.org, though review volume has plummeted from 1,024 in 2019 to roughly 37 in eight months of 2024 — suggesting fatigue more than resolution.

**Update breakage** remains a perennial cross-platform complaint. WordPress 5.5 broke approximately 50,000 sites by removing jQuery Migrate. WooCommerce 8.5.0 in January 2024 maxed out hosting CPU/RAM to 100% across hundreds of stores. The pattern is consistent: core or major plugin updates ship, third-party dependencies break, site owners scramble. Auto-updates compound the problem — sites update without owner awareness and break in production. Recovery Mode (introduced in WP 5.2) catches fatal errors but doesn't prevent the underlying incompatibility.

**Bloated core** draws increasing criticism as WordPress ships site-builder features to compete with Wix and Squarespace. One Hacker News commenter with 251 upvotes captured the developer sentiment: "Over the last few years, it's felt like I've been swimming upstream fighting against WordPress as they have tried to morph into a general website publishing tool." The REST API, while functional, suffers from slow response times (every uncached request boots the full WordPress stack), verbose data returns, a hard 100-records-per-page limit, and no native JWT authentication — all of which hamper headless deployments.

**Multisite** has effectively stagnated. Domain mapping remains complex, many hosts don't fully support it, and security vulnerabilities are amplified across the network. The community increasingly recommends separate installations managed via MainWP or ManageWP rather than multisite. **PHP version compatibility** creates a persistent tension: hosts push PHP 8.x for security and performance while much of the plugin ecosystem still breaks on anything beyond 7.4.

**Trend:** Mixed. Gutenberg is slowly improving technically but adoption resistance persists. FSE confusion is growing. Update breakage is not improving. The governance crisis (detailed in section 13) has injected new uncertainty into WordPress core's direction.

**Workarounds commonly cited:** Classic Editor plugin, ClassicPress fork, page builders (Elementor, Bricks), WPGraphQL as REST API alternative, Kadence Blocks for enhanced block experience.

**Sentiment splits:** New users and clients tend to accept Gutenberg. Long-time users, writers, and developers are most hostile. Agencies are pragmatic but frustrated by the extra complexity.

*Sources: WordPress.com Forums, WP Tavern, ThemeIsle 340+ opinion analysis, WPShout, Hacker News (item #30172268), geary.co, WordPress.org plugin reviews, Reddit r/WordPress, r/ProWordPress*

---

## 2. Performance degrades predictably as sites grow

WordPress performance complaints follow a depressingly predictable trajectory: site launches fast, plugins accumulate, page load creeps upward, and the owner discovers that "free" WordPress requires expensive optimization.

**Page load bloat from plugins and page builders** is the most universal performance complaint. Elementor recommends a **768MB PHP memory limit** — a staggering requirement that reveals how resource-hungry page builders have become. Themes and plugins load CSS and JavaScript on every page regardless of whether the assets are needed there, and most site owners have no idea this is happening. A typical WordPress site with 20–50 plugins introduces dozens of render-blocking resources. WordPress 6.8 (April 2025) added speculative loading via the Speculation Rules API, and Google's replacement of FID with INP as a Core Web Vital in March 2024 increased performance awareness — but the plugin ecosystem continues to be the primary source of bloat.

**Admin dashboard slowness at scale** is one of the most frequently reported issues and one of the hardest to solve, because **wp-admin cannot be page-cached**. Every click triggers a full PHP execution cycle. One WooCommerce store owner on WordPress.org forums documented the problem precisely: "Loading my wp-admin dashboard and WooCommerce orders list takes over 15 seconds and makes thousands of queries. Deactivating WooCommerce plugins, and they load in less than one second. Why does WooCommerce run so many queries?" At 10,000 products, the product list query alone can take **3–8 seconds**. The WordPress Heartbeat API adds further overhead by running real-time polling that most users don't need.

**Caching complexity** creates a paradox: the system most in need of optimization is also the hardest to optimize correctly. WordPress sites may need page caching, object caching (Redis/Memcached), CDN caching, browser caching, and OPcache — each requiring different plugins and configurations that can conflict with each other. WP Engine's own documentation warns that object caching should be disabled when autoloaded data exceeds 800KB because the 1MB buffer limit causes "instant and random 502 errors." The existence of WP Rocket, LiteSpeed Cache, W3 Total Cache, and dozens of other caching plugins — each with different approaches and compatibility profiles — is itself evidence of the problem.

**Hosting bottlenecks** affect the majority of WordPress sites running on shared hosting. Budget providers throttle resources quietly rather than returning errors, creating mysterious slowness that site owners can't diagnose. The community consensus has shifted toward managed WordPress hosting (Kinsta, WP Engine, Cloudways) or cloud VPS as the minimum for serious sites, but this raises the total cost of ownership significantly.

**Trend:** Slightly improving at the margins (WordPress 6.8 speculative loading, broader Redis adoption) but fundamentally unchanged. The admin dashboard performance problem has no architectural solution in sight.

*Sources: WordPress.org support forums (multiple threads), WPBundle (2025 technical analysis), WP Speed Fix, hosting provider documentation (Kinsta, WP Engine, Pressable), onlinemediamasters.com*

---

## 3. The plugin ecosystem: WordPress's greatest strength is also its greatest liability

The plugin ecosystem — 59,000+ free plugins on WordPress.org alone — is simultaneously what makes WordPress powerful and what makes it fragile. The complaints here are not edge cases; they represent the daily reality of running WordPress.

**Plugin conflicts** are the most universally cited frustration. The Elementor/ACF conflict alone has spawned dozens of GitHub issues and support forum threads through 2024–2025. One user on WordPress.org forums captured the typical experience: "After the latest Elementor Pro update the website started crashing. After hours of debugging, it seems the conflict lies with ACF Extended. I can't update Elementor without the site crashing." With no sandboxing between plugins, any update can break any other plugin — and WordPress provides no native tools to diagnose which one is responsible.

**Abandoned plugins** represent a growing security and stability crisis. Patchstack's 2024 report found **827 plugins and themes reported as abandoned** (up from 147 in 2022), with 58.16% permanently removed from the repository. In 2024, over 1,600 plugins and themes were removed for unpatched security issues — roughly **4 per day**. The economics of free plugin development make this inevitable: developers burn out, companies fold, and the plugins quietly become time bombs. Patchstack CEO Oliver Sild noted that "since around 30% of security vulnerabilities reported in plugins won't get patched, people have been reaching out to us for help. The options are limited — you can either hardcode a fix yourself, delete the plugin, or risk security."

**Premium plugin renewal fatigue** has become one of the ecosystem's most emotionally charged complaints. The industry has shifted aggressively toward annual subscriptions with auto-renewal. A typical business WordPress site running 10–15 premium plugins faces **$1,000–$1,500 per year** in license fees alone. Yoast SEO Premium runs ~$99/year, Elementor Pro ~$59–399/year, Gravity Forms ~$59–259/year, ACF Pro ~$49–249/year. One retired blogger on WP Tavern captured the frustration: "As a retiree writing my own travel blog, I can't afford to keep paying renewal fees for plugins." Freemius data shows renewal rates historically run only 3–20%, driving companies to implement auto-renewal and eliminate renewal discounts.

**Vendor lock-in** crystalized as a community concern after the ACF takeover in October 2024, when WordPress.org forked WP Engine's Advanced Custom Fields into "Secure Custom Fields." One WordPress.org reviewer called Elementor "a virus slaving you to keep on using it" — strong language reflecting genuine frustration from someone managing 1,000 sites. Elementor, with **16 million+ active installations**, remains the poster child for plugin lock-in: removing it means rebuilding every page from scratch.

**Trend:** Getting worse across every dimension. Vulnerability counts rose 42% year-over-year in 2025. Abandonment is accelerating. Renewal costs are increasing. The ACF fork crisis damaged developer trust in the ecosystem's stability.

*Sources: WordPress.org forums, GitHub Elementor issues, Patchstack 2024/2025 State of WordPress Security reports, Wordfence 2024 Security Report, WP Tavern, ACF support forums*

---

## 4. Theme lock-in and the painful transition to Full Site Editing

**Page builder theme lock-in** is the single most emotionally charged complaint in the WordPress theme ecosystem. Content built with Elementor stores data as serialized arrays in post_meta; Divi uses proprietary shortcodes. Deactivating either renders content unreadable. One Elementor user managing 100+ sites wrote on WordPress.org: "We run over 100 sites and I'm sick to death of having to run buggy updates/migrations every few days. These guys are amateurs who push every line of code through their broken CI/CD system onto the shoulders of their customers." Migration from a page builder to Gutenberg typically costs **$2,000–$8,000 in developer time** for a modest site, with no automated conversion path.

**Theme bloat** from ThemeForest multipurpose themes (Avada, Enfold, BeTheme) remains a persistent performance drain. Speed tests show Avada and Enfold loading pages in 2.8–3+ seconds out of the box, with massive admin option panels that could be replaced by a few lines of CSS. The developer community has been vocal: "ThemeForest is loaded with mostly poor quality themes that sell because people love all the flashy design features" (EngageWP). Despite this, ThemeForest's multipurpose themes remain bestsellers, bought primarily by non-technical users attracted to feature-rich demos.

**Full Site Editing (FSE) confusion** is a growing issue as WordPress pushes block themes. Users don't understand the difference between Gutenberg, FSE, Site Editor, and block themes. The shift from simple theme settings panels to direct template editing baffles most WordPress users. KadenceWP articulated the problem clearly: "Previously you would enable a sidebar globally in your theme settings. With FSE, you need to edit the template to add a column and move all the template blocks. The vast majority of users don't want access to edit templates." Even in 2025, one industry analysis concluded that "block themes have not really arrived yet. Many developers advise against using an FSE theme for a productive website" (BloggerPilot). The developer workflow is equally broken — version control, deployment, and team collaboration have no clear path with FSE's database-stored templates.

**Marketplace quality control** remains poor. SolidWP vulnerability reports document **111–173 new theme vulnerabilities per week** in 2024. Abandoned themes with years-old update dates remain listed on WordPress.org and ThemeForest, and the gap between demo presentation and real-world performance is consistently cited as deceptive.

**Trend:** FSE is slowly maturing (WP 6.7 brought stability improvements) but adoption remains low. Hybrid themes like Kadence and Blocksy are emerging as the pragmatic middle ground. Theme bloat is gradually improving as lightweight options gain market share.

*Sources: WordPress.org forums (May 2024 Elementor reviews), KadenceWP blog, Brian Coords/r/ProWordPress, WP Mayor, BloggerPilot, InternetFolks speed tests, SolidWP vulnerability reports, EngageWP*

---

## 5. WooCommerce: death by a thousand extensions

WooCommerce powers **33.87% of the ecommerce platform market**, but its users are increasingly vocal about a business model that fragments basic functionality into paid add-ons.

**Extension cost is the strongest sentiment across all WooCommerce complaints.** The platform is "free" but a functional store typically requires 5–10 paid extensions totaling **$500–$1,500/year**: Subscriptions ($279/yr), Table Rate Shipping ($79/yr), Product Add-Ons ($49/yr), plus payment gateway plugins. One Kinsta blog commenter captured the prevailing mood: "Cost of goods sold should not be a plugin. That's extremely basic functionality that most other ecommerce solutions build in. I know it's free and I do support the developers financially, but that really feels like we are being nickel and dimed." The annual renewal model means these costs compound indefinitely. Multiple Reddit users note that WooCommerce's true running cost frequently rivals or exceeds Shopify's monthly fees when factoring in hosting, extensions, security, and maintenance.

**Update breakage in WooCommerce is more consequential than in core WordPress** because it directly impacts revenue. WooCommerce 8.5.0 (January 2024) broke hundreds of stores with CPU/RAM maxing to 100%. Version 8.6.0 (February 2024) broke checkout and product pages, requiring an emergency patch. WooPayments 6.2.0 broke variable products entirely: "The most recent update has completely broken these products and has resulted in lost revenue and upset customers. There is no word from developers regarding a fix" (WordPress.org plugin review). The concurrent migrations to HPOS (High-Performance Order Storage) and Blocks checkout have created an extended period of instability throughout 2024–2025.

**Scaling beyond a few hundred products** exposes WooCommerce's architectural roots. The platform originally stored orders and products in `wp_posts` and `wp_postmeta` — the same tables used for blog posts. With 30,000 products, `wp_postmeta` balloons to approximately **1.8 million rows**, and admin queries that should take milliseconds stretch to 3–8 seconds. One store owner documented the experience on WordPress.org forums: "Loading a scant product page takes over five seconds, all because of an insane amount of WooCommerce queries. I'm running on a beefy VPS with 6 cores and 16GB of RAM." HPOS (introduced across WooCommerce 6.9–8.2) is the single biggest architectural improvement, moving orders to dedicated indexed tables, but many plugins don't yet support it, creating a prolonged migration headache.

**Tax and shipping configuration** is particularly painful for US-based stores dealing with multi-state sales tax. Proper tax automation requires TaxJar, Avalara, or Stripe Tax ($50–500+/year depending on volume) — functionality that Shopify handles natively. Shipping zone priority and overlap logic creates unexpected charges without clear warnings. WooCommerce's inventory management is fundamentally single-warehouse with no stock reservation mechanism, meaning two simultaneous buyers can oversell the last item.

**The WooCommerce-to-Shopify pipeline** is well-established. Users cite maintenance burden, 24/7 support availability, security responsibility, and checkout conversion as reasons to switch. Shopify claims **17% higher checkout conversion** than WooCommerce on average (biased source, but directionally consistent with community reports). The counterargument — ownership, no transaction fees beyond gateway costs, SEO flexibility, and freedom from platform risk — keeps many stores on WooCommerce, particularly those in restricted industries (firearms, CBD, adult products) that face Shopify/Stripe restrictions.

**Trend:** HPOS and Blocks checkout are meaningful improvements, but the transition period has been painful. Extension costs continue rising. The competitive pressure from Shopify is intensifying.

*Sources: WordPress.org support forums, r/woocommerce, r/ecommerce, GitHub WooCommerce issues, WP Speed Fix, WPBundle technical analysis, Kinsta blog comments, Convesio blog (synthesizing Reddit threads)*

---

## 6. Database architecture: a 2007 design straining under 2025 workloads

WordPress's database architecture is arguably its deepest structural problem — an Entity-Attribute-Value (EAV) pattern in `wp_postmeta` that was designed for blog post metadata and now underpins everything from ecommerce products to event calendars to custom applications.

**The `wp_postmeta` scaling problem** has been documented on WordPress Trac ticket #14558, which has been **open for over 10 years** with no resolution. The core complaint: everything stored as post meta (products, orders, custom fields, plugin data) goes into a single table where values are untyped strings. A developer on Stack Overflow demonstrated the impact: "With merely 30,000 products you are looking at having 1,800,000 rows in wp_postmeta. This query took ~3 seconds to fetch from wp_postmeta but takes **~0.006 seconds from custom tables**" — a 500x performance difference. One store owner with just 15,000 orders found their `wp_postmeta` table had grown to 1.2 million rows, making the entire site "extremely slow and nearly unusable."

**The `wp_options` autoload problem** affects virtually every WordPress site over time. Plugins casually set their options to autoload, meaning every page load fetches all autoloaded options into memory. Kinsta documented one site with **250MB of autoloaded data**. WP Engine warns that high autoload data causes "instant and random 502 errors" because Redis object cache has a 1MB buffer limit. WordPress 6.6+ introduced automatic autoload threshold management — a welcome improvement, but the ecosystem of plugins that abuse autoload remains vast.

**Transient pollution** creates silent database bloat. WordPress stores transients (temporary cached data) as rows in `wp_options`, and expired transients are only cleaned up when requested again — never proactively. Kinsta has documented sites with "thousands of old transient records." Each transient creates two database rows (data + timeout), and WooCommerce is a particularly aggressive transient creator. Redis/Memcached eliminates this problem entirely by handling TTL expiration natively, but most WordPress sites don't use object caching.

**Revision buildup** compounds database bloat. WordPress creates unlimited revisions by default, autosaving every 60 seconds. The WP Engine controversy in 2024 revealed that many managed hosts disable or limit revisions by default specifically because of performance impact — a practice Mullenweg criticized, highlighting the tension between WordPress's defaults and production requirements.

**Migration difficulties** stem directly from the database architecture. WordPress stores absolute URLs throughout the database in serialized PHP arrays. Simple search-and-replace during migration corrupts serialized data if the old and new domain names have different character lengths. This is not a bug but a fundamental architectural characteristic that makes every migration a potential minefield. Large database migrations (10GB+) routinely timeout.

**Trend:** Slowly improving at the plugin level (WooCommerce HPOS is the biggest success story, and WordPress 6.6 addressed autoload management). But core WordPress architecture remains unchanged, and Trac #14558 shows no signs of resolution. The EAV pattern is not going away.

*Sources: WordPress Trac #14558, GitHub WooCommerce #17241, Stack Overflow, Hacker News, Kinsta/WP Engine/Servebolt hosting documentation, Delicious Brains, nanowp.com (2025)*

---

## 7. Security: 11,334 new vulnerabilities in 2025 and the arms race is accelerating

WordPress core itself is relatively secure — **only 7 vulnerabilities** were found in core in 2024. The problem is everything around it. Patchstack documented **11,334 new vulnerabilities** across the WordPress ecosystem in 2025, a **42% increase** over the prior year. **96% of these were in plugins**, 4% in themes. This is the defining security reality: WordPress's attack surface is its ecosystem.

**Plugin-introduced vulnerabilities** are the overwhelmingly dominant attack vector, responsible for **92% of all successful WordPress breaches** in 2025. The specifics are alarming: 52% of plugin developers to whom Patchstack reported vulnerabilities did not patch before public disclosure. Attackers weaponize newly disclosed vulnerabilities within a **median of 5 hours** for critical flaws. Major 2024–2025 incidents include the WordPress Automatic Plugin (CVSS 9.9, unauthenticated SQL execution), Bricks Theme (CVSS 10.0, unauthenticated remote code execution), GiveWP (CVSS 10.0, full site takeover via PHP object injection on 100,000+ installations), and a supply chain attack in June 2024 that compromised five plugins simultaneously by injecting code to create rogue admin accounts.

**Brute force attacks** on `wp-login.php` are staggering in scale. Wordfence blocked **55 billion password attack attempts** in 2024. AI-enhanced botnets increased brute force attempts by 45% through 2025, using residential proxy rotation that makes simple IP blocking increasingly ineffective. WordPress's default behavior of revealing valid usernames through author archives and the REST API makes enumeration trivial.

**Malware cleanup** has become significantly harder as attackers deploy AI-generated, cloaked, self-replicating malware specifically designed to evade popular security scanners. Sucuri documented malware that tampered with Wordfence's own files to remain hidden — found in 14% of infected sites. A 2025 campaign exploited the must-use plugins (`mu-plugins`) directory, which doesn't appear in the admin panel plugin list and is rarely examined by administrators. Even after cleanup, backdoor variants continuously monitor and recreate rogue admin accounts.

**The lack of built-in 2FA** remains conspicuous. WordPress mandated 2FA for plugin/theme developers with commit access in October 2024 (a supply-chain security measure), but regular site users still require a third-party plugin. WordPress 6.9 introduced the "Abilities API" for more granular access control, acknowledging that the legacy roles system was insufficient — but it's an incremental step.

**Trend:** Dramatically worsening. High-severity vulnerabilities in 2025 exceeded the combined total from the two previous years. AI is accelerating both attack sophistication and exploitation speed.

*Sources: Patchstack State of WordPress Security 2024/2025, Wordfence 2024 Security Report, Bleeping Computer, The Hacker News, SecurityWeek, Sucuri, DeveloPress, Security Boulevard*

---

## 8. Developer experience: modern PHP trapped in a 2005 architecture

The developer experience complaints are not about individual bugs but about a systemic mismatch between WordPress's architecture and modern development practices.

**WordPress feels "dated"** is the most frequently expressed developer sentiment, particularly on Hacker News. One highly upvoted comment cited a StackOverflow survey finding that "67% of developers surveyed stated that they dislike working with it due to its outdated PHP language and poor architecture." WordPress still supports PHP 7.4 (end-of-life), which means modern PHP features — typed properties, enums, fibers, match expressions — cannot be used in core. A Dev.to post titled "Never WordPress Again" (2026) captured developer frustration: "We live in an era of declarative UIs and CI/CD pipelines. WordPress remains stuck in workflows reminiscent of the early 2000s."

**Hook/filter complexity** creates what developers call "spaghetti" — hundreds of hooks firing per request, with no sandboxing between plugins and no native tooling to trace execution order. The shift to FSE added JavaScript-side hooks layered on top of PHP hooks, creating two parallel hook systems. One developer documented spending hours debugging a hook that fired before their code could attach to it, leading to "emotions on my wide spectrum from frustration to rage" (room34.com).

**Debugging** remains primitive compared to modern frameworks. WordPress's WP_DEBUG system is essentially a boolean constant that dumps errors, with no native breakpoint or step-through capability. WordPress Studio only added Xdebug integration in March 2026, acknowledging the longstanding gap. Before that, debugging meant "scattering debug output throughout your code" — a technique most developers abandoned a decade ago in other ecosystems. Query Monitor remains the essential diagnostic plugin, but its existence underscores what core WordPress lacks.

**Headless WordPress complexity** is a growing pain point as more teams attempt to use WordPress as a backend with modern JavaScript frontends. A Dev.to developer described a recurring nightmare: "Emergency client meeting: 'Why is our $50,000 headless WordPress site slower than our old WordPress theme?'" — the result of WPGraphQL computing everything from scratch on every request. An agency developer estimated that one in three headless WordPress projects is "a $15K mistake" that gets partially reversed when the client's team can't manage content updates without developer involvement.

**Build tool fragmentation** rounds out the picture. WordPress core uses webpack for Gutenberg blocks, but there's no standard for plugin or theme development — teams split between webpack, Vite, Laravel Mix, and esbuild. The `@wordpress/scripts` package standardizes block development, but the broader ecosystem remains chaotic.

**Trend:** Getting worse from the developer perspective. FSE pushes WordPress toward no-code users while alienating its developer base. The governance crisis accelerated "WordPress exodus" discussions. Roots.io Bedrock/Sage, headless setups, and alternative CMSes are common escape routes.

*Sources: Hacker News (items #34640771, #40296534, #27311540), Dev.to, room34.com, WordPress.com (Studio announcement), Stack Overflow, agency blogs (benryan.com.au)*

---

## 9. Content management gaps that plugins were never meant to fill

**The media library has no native folder system** — one of the single most complained-about features across the entire WordPress ecosystem. WordPress stores all uploads in year/month subdirectories with no organizational UI beyond a search box and date filter. WP Tavern commenters have been requesting folders for years: "Folders in library are MUCH more important and there are no signs on the horizon that this feature will appear. It's been a pain in the ass for web developers/designers for many years." Content editors managing hundreds of images spend significant time working around this limitation. Third-party plugins (FileBird, Real Media Library) fill the gap but add another dependency.

**ACF dependency** represents a structural weakness: Advanced Custom Fields is effectively required for any non-trivial WordPress site because core WordPress's native custom fields UI is rudimentary. The 2024 WP Engine dispute, which resulted in WordPress.org forking ACF into "Secure Custom Fields," exposed how precarious this dependency is. Meta Box and Pods exist as alternatives but have smaller ecosystems. WordPress core has added custom fields in the block editor, but capability remains nowhere near ACF's level.

**Multilingual setup** remains expensive and fragile. WPML ($39–199/year, requiring four separate plugins for full functionality) adds **20+ database queries per page** for string translation and can increase database size by 30–50% on sites with thousands of pages in multiple languages. A client launching a five-language ecommerce site with 5,000 products experienced **800+ database queries per page and 8-second load times**. WPML/ACF conflicts are extensively documented, with repeater fields storing incorrectly across translations. Polylang is lighter but lacks advanced features. Weglot offers a cloud-based alternative but costs $15–199/month.

**SEO plugin bloat**, particularly from Yoast, is a high-volume complaint. Performance testing shows Yoast adds **+0.18 seconds to page load** versus Rank Math's +0.01 seconds, with memory impact of +1.62MB versus +0.35MB. Yoast's 87,200 lines of code dwarf Rank Math's 51,300. Users report needing a separate "Hide SEO Bloat" plugin just to remove Yoast's dashboard advertisements. Rank Math has gained significant market share as the lighter, feature-richer free alternative.

**Trend:** Media library and CPT limitations are stagnant — no improvements planned. WPML is slowly improving with automatic translation features. The Yoast-to-Rank Math migration is an ongoing community trend.

*Sources: WP Tavern, WordPress.org forums, ACF support forums, WPML support forums, Online Media Masters, Supawrite comparison (2025), Polaris Nexus performance analysis*

---

## 10. Hosting and DevOps: basic infrastructure WordPress still can't handle natively

**WP-Cron is fundamentally broken by design.** WordPress uses a "virtual cron" that only fires when someone visits the site — meaning low-traffic sites miss scheduled tasks entirely while high-traffic sites waste resources checking cron on every page load. WordPress Trac ticket #39340 documents the issue as a long-standing open bug. One user on WordPress.org forums found scheduled backups showing timestamps of **January 1, 1970** — a clear timestamp error affecting "basically all WP sites hosted with this ISP." Many managed hosting providers actively disable WP-Cron and implement their own solutions, but WP Engine's "Alternate Cron" has been documented triggering jobs twice within the same minute, "sending invoices twice, duplicating data."

**WordPress has no native staging, git workflow, or deployment pipeline.** The database stores both content and configuration with hardcoded URLs in serialized data, making database syncing between environments extremely difficult. As FatLab Web Support described: "WordPress demands a specific workflow pattern: code flows upward, content flows downward. Most hosting providers force you to fight this natural pattern." Managed hosts offer proprietary staging solutions, but these create vendor dependency and don't transfer between providers.

**Email deliverability via `wp_mail()`** is silently broken on most WordPress installations. WordPress sends email through PHP's `mail()` function, which lacks SPF, DKIM, and DMARC authentication. Many hosts disable `mail()` entirely. Emails silently fail or go to spam — contact form submissions get lost, WooCommerce order confirmations never arrive. Gmail, Yahoo, and Outlook tightened sender requirements in February 2024, making default WordPress email even less reliable. WP Mail SMTP has **3 million+ active installations**, a testament to how universal this problem is.

**Server resource consumption** from WordPress + page builders + plugins routinely requires 256–512MB of PHP memory per request. Divi alone can require **512MB of memory and 10,000–15,000 max_input_vars**. These requirements strain shared hosting and drive users toward expensive managed hosting, increasing total cost of ownership.

**Trend:** WP-Cron and email deliverability are not improving — the fundamental architecture hasn't changed. Staging workflows are slowly improving through managed hosting, but remain host-specific and non-portable.

*Sources: WordPress.org support forums, WordPress Trac #39340, Pressidium (2025), Kinsta, WP Mail SMTP, SpinupWP, AJG Interactive, WP Engine documentation, Websavers*

---

## 11. The true cost of "free" WordPress

**Total cost of ownership surprises** are among the most emotionally charged complaints from non-technical site owners. WordPress is "free" but a professional business site typically requires: hosting ($10–500/month), premium theme ($60–200/year), 10–15 premium plugins ($1,000–1,500/year in licenses), SSL, domain, backup service, security plugin, SMTP service, and professional maintenance ($140–1,000+/month). Annual maintenance costs range from **$300 to $60,000** depending on complexity. Reddit's r/smallbusiness and r/Entrepreneur communities frequently recommend Squarespace or Wix over WordPress for small businesses specifically because "you don't need to deal with maintaining a server, optimizing it, securing it — it's all being done for you."

**Annual renewal fatigue** compounds the cost problem. The WordPress ecosystem has shifted almost entirely to subscription licensing. Plugins that were once one-time purchases now require yearly renewals with no guarantee of meaningful updates during the renewal period. One WP Tavern commenter articulated the frustration: "The problem I have with the annual subscription model is that you have no idea what, if any, new releases will be issued during your subscription period. If the renewal price is exactly the same as the initial purchase price, there is little incentive to renew."

**Client handoff** is agencies' number-one operational headache. Non-technical clients break sites by updating plugins without testing, install conflicting plugins, or can't navigate hosting concepts. License ownership during handoff creates confusion — whose account holds the plugin licenses? Post-handoff support overload drains agency profitability. As one managed hosting provider documented: "When client sites go down on external hosting, troubleshooting becomes guesswork. Getting authorization codes from clients during off-hours can turn quick fixes into extended outages."

**The ongoing maintenance burden** has spawned an entire sub-industry. Companies like GoWP, WP Buffs, and WP Maintain exist solely to white-label WordPress maintenance for agencies — **their existence validates the severity of the problem**. A Melapress survey found that 64% of WordPress professionals had experienced a security breach. Each site has a unique plugin stack, hosting environment, and custom code, making standardized maintenance nearly impossible.

**Trend:** Getting worse as more plugins adopt subscription models and hosting costs rise. The gap between "WordPress costs nothing" marketing and reality is widening.

*Sources: Reddit r/smallbusiness, r/Entrepreneur, eSEOspace (2026), Codeable (2026), WP Tavern, Pressable, WP Umbrella, WPServices.com*

---

## 12. Migration: the hotel California of content management

**Page builder lock-in is the most emotionally intense complaint in the entire ecosystem.** Elementor stores content as serialized data in post_meta; Divi uses proprietary shortcodes. Deactivating either renders all content unreadable. One user managing a 1,000-site Elementor license called it "a virus slaving you to keep on using it." Another managing 100+ sites described being "sick to death of having to run buggy updates/migrations every few days." Migration from a page builder to any other system requires manual page-by-page rebuilding — there is **no automated conversion path** from Elementor or Divi to Gutenberg blocks. WordPress itself has begun publishing "Data Liberation" guides to help users migrate from Divi and Elementor to Gutenberg, which some view as WordPress undermining its own ecosystem partners.

**Moving between WordPress hosts** requires navigating serialized data hazards. WordPress stores absolute URLs throughout its database in PHP serialized arrays that break if naively search-and-replaced (when domain name lengths differ). Tools like Better Search Replace, Duplicator, and WP-CLI handle this, but the process remains stressful for non-technical users. Large sites with 10GB+ databases routinely hit plugin upload limits and migration timeouts.

**Migrating away from WordPress entirely** is increasingly discussed but remains difficult. Content is stored in a MySQL database with WordPress-specific schema. Custom fields, taxonomies, and relationships have no universal export format. The WordPress REST API can be used to crawl all pages, but "WordPress provides more information than you probably need" and the extracted data still requires significant transformation for any target CMS. The 2024 Automattic/WP Engine controversy specifically accelerated migration interest — one developer reported helping seven people move from WordPress.com to self-hosted in a single week after the dispute, with an inbox that "exploded with requests."

**URL structure dependencies** make migration SEO-risky. Changing permalink structures risks search ranking damage, and comprehensive redirect mapping (ideally via Screaming Frog crawl before migration) is essential but adds cost and complexity.

**Trend:** Page builder lock-in awareness is growing as WordPress pushes Gutenberg, but the problem is structurally unchanged. Migration tooling between hosts is slowly improving. Migration away from WordPress entirely is becoming more feasible as alternative CMS ecosystems mature.

*Sources: WordPress.org forums (May 2024 Elementor reviews), Search Engine Journal, Toast Design, FatLab Web Support, Foundation Web Dev (2024), Zesty.io*

---

## 13. The governance crisis that shook WordPress's foundations

The Automattic vs WP Engine dispute of late 2024 was not merely corporate drama — it was a **governance crisis that exposed fundamental questions about who controls the open-source project powering 43% of the web**.

On September 17, 2024, Matt Mullenweg published a blog post calling WP Engine a "cancer to WordPress." Within weeks, the situation escalated: WP Engine was banned from WordPress.org resources (breaking plugin updates for ~1.5 million websites), WordPress.org took over WP Engine's ACF plugin and republished it as "Secure Custom Fields," and Mullenweg offered an "alignment offer" buyout that resulted in **159 Automattic employees (8.4% of the company) resigning** — including Josepha Haden Chomphosy, the Executive Director of the WordPress project. Approximately 80% of departures came from the WordPress/Ecosystem division.

The most damaging revelation came on October 22, 2024, when Automattic's legal statement asserted that **WordPress.org is "solely Matt Mullenweg's project"** — contradicting years of community understanding that it operated under the WordPress Foundation. A December court injunction forced restoration of WP Engine's access. Twenty veteran core contributors published an open letter criticizing governance. Joost de Valk (Yoast founder) proposed foundation-led governance reform; Mullenweg responded: "I think this is a great idea for you to lead under a name other than WordPress."

Community sentiment about Mullenweg's leadership shifted to **overwhelmingly negative** across platforms. One Hacker News commenter observed: "The WordPress community of developers/contributors has been under the impression that the dot org site was under the control of the nonprofit WP Foundation. However Matt recently declared that dot org has been his personal website this whole time." Developer Taupecat Studios articulated the trust damage: "How can any developer, especially one who contributes regularly to the plugin ecosystem, have any faith in the governance of WordPress as a whole? When your hard work can be capriciously snatched out from under you, what incentive is there to continue to develop for the platform?"

In January 2025, Mullenweg disbandedthe WordPress Sustainability Team, deactivated five community members' WordPress.org accounts, and banned de Valk and others. On r/WPDrama — a subreddit created specifically for the controversy — Mullenweg posted "What drama should I create in 2025?" to 500+ overwhelmingly negative comments. The FAIR project (Federated and Independent Repositories) launched under the Linux Foundation in mid-2025 but failed to gain ecosystem financial backing, with de Valk stepping away by late 2025.

**Cautious stabilization began in mid-2025**: Automattic resumed WordPress core contributions after a four-month pause, WordPress.org began a "Restoring Trust" initiative, and some banned accounts were reinstated. But the fundamental governance structure remains unchanged — Mullenweg retains full control of WordPress.org — and the legal battle continues. Mullenweg himself conceded "the lawsuits could potentially bankrupt me or force the closure of WordPress.org."

*Sources: Hacker News (multiple front-page threads), Reddit r/WordPress, r/WPDrama, WP Tavern, The Repository, Post Status, IEEE Spectrum, Search Engine Journal, Joost de Valk's blog, court filings*

---

## 14. The migration landscape: where people are going and why they're staying

WordPress's CMS market share declined from **65.2% in January 2022 to ~61.3% by April 2025**, while overall web share growth plateaued at ~43%. The platform contracted 2.9% between December 2024 and December 2025 while competitors grew. This isn't collapse — it's erosion at the margins, with new projects increasingly choosing alternatives.

The most frequently mentioned alternatives, ranked by community discussion volume:

- **Webflow** — the consensus #1 alternative for agencies and marketing teams; 13%+ market share growth over three years
- **Shopify** — dominant alternative for ecommerce; $292B GMV in 2024; some regional search interest overtook WordPress by late 2024
- **Squarespace/Wix** — for small businesses seeking simplicity; Wix grew 28.9% between December 2024 and December 2025
- **Ghost** — for writers and publishers wanting clean, focused blogging
- **Headless CMSes** (Sanity, Contentful, Strapi, Storyblok, Payload CMS) — growing among developers and enterprises
- **Static generators** (Astro, Hugo, Next.js, 11ty) — developer favorites for performance-critical sites
- **Statamic/Kirby** — developer niche for file-based, lightweight CMS
- **Framer** — growing for design-focused marketing sites

What keeps people on WordPress despite the frustrations is significant: the unmatched plugin ecosystem (59,000+ free plugins), massive developer talent pool, ultimate flexibility, no transaction fees, and simple inertia ("WordPress is what I know"). No single alternative matches WordPress's breadth — users must trade features when migrating. Enterprise users are particularly unlikely to move, having invested too heavily in customization.

The nuanced reality is captured in sentiment differences by user type. Core contributors and plugin developers are the most negative — many have stepped back or been banned. Agencies are cautious and diversifying, still using WordPress but hedging. Site owners are mixed, with many unaware of the governance drama. New projects increasingly choose alternatives. Enterprise users are mostly staying, too invested to leave. The "WordPress peaked" narrative has significant data support: its absolute dominance is past its zenith, but it remains far ahead of any single competitor.

*Sources: W3Techs market share data, Reddit r/WordPress, r/webdev, Hacker News, WPBeginner, agency blogs (Developly, Represent.no, Creative Corner), WP Tavern*

---

## Conclusion: compounding problems in search of leadership

Five meta-patterns emerge from this research that cut across all 12 categories:

**Architectural debt is the root cause of most technical pain.** The EAV database pattern, visitor-triggered cron, PHP `mail()`, serialized URL storage, and lack of plugin sandboxing are all design decisions from 2005–2007 that now constrain everything built on top of WordPress. Fixes like HPOS prove these problems are solvable — but only when a team (in that case, WooCommerce's) commits to a multi-year migration. Core WordPress has not undertaken equivalent architectural modernization.

**The ecosystem's economic model is breaking down.** Free plugins subsidized by premium upsells create perverse incentives: developers add bloat to justify paid tiers, abandon free plugins when they're unprofitable, and fragment basic functionality across paid extensions. Annual renewals compound costs until WordPress's "free" positioning becomes actively misleading.

**The governance crisis didn't create these problems but accelerated them.** Trust in WordPress.org as a neutral community resource has been severely damaged. Plugin developers question whether their work can be "capriciously snatched." The one-release-per-year cadence (down from three to four) reflects declining contribution hours. The FAIR project's failure to gain backing suggests the ecosystem may lack the collective will to build alternatives to Mullenweg-controlled infrastructure.

**WordPress's identity crisis is real.** The platform is simultaneously trying to serve no-code site builders (via Gutenberg/FSE), sophisticated developers (via headless/REST/GraphQL), enterprise clients, and hobbyist bloggers. The result is a product that frustrates all audiences: too complex for beginners, too constrained for developers, too fragile for enterprise, and no longer simple enough for bloggers.

**The competitive landscape has shifted permanently.** Webflow, Shopify, and modern headless CMSes are no longer immature alternatives — they're mature products with clear value propositions. WordPress still wins on flexibility and ecosystem size, but the calculus has changed. The question for many users is no longer "is there anything better?" but "is the maintenance overhead worth it?"

WordPress isn't dying. But the confidence that carried it to 43% of the web is fraying, and the problems documented in this report are compounding faster than they're being solved.