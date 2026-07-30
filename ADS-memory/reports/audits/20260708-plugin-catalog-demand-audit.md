# Plugin-Catalog Demand Audit — the ACCEPTED gate for ADR-024

- Date: 2026-07-08
- Author: Leon Aburime / Coordinator (Opus 4.8)
- Purpose: the owed evidence named in **ADR-024 §Open** ("⚠️ Gate to ACCEPTED"). Enumerate the
  real near-term plugin demand and classify **Tier-1-declarative vs needs-code**, to decide whether
  ADR-024's tiered "install from anyone" on-ramp is vindicated or collapses.
- Method: ground the demand curve in the **actual WordPress install base** (the ADR leans on "the
  WordPress content-pack category"), then classify each category against **Tovu's** Tier-1
  declarative surface (ADR-024 §1), its core-mediated-webhook allowance (ADR-024 §1), and the
  ADR-023 `dataModule` data tier. WordPress is the right proxy: it is the incumbent Tovu targets
  and the largest observed CMS-extension demand signal (61k+ plugins; install counts below).

## The decision rule (from ADR-024 §Open, verbatim intent)

> If Tier-1 covers **<~20%** of demand, the on-ramp claim collapses and *B (isolation-first)*
> regains urgency; if it covers **~half** (as the WordPress content-pack category suggests), this
> ADR is strongly vindicated.

## The demand curve (grounded, WordPress.org active installs, early 2026)

Top-installed plugins/categories, from current published install data (sources below): Yoast SEO
(13M+), Elementor (10M+), Contact Form 7 (10M+), Classic Editor (9M+), WPForms (6M+), Akismet
(6M+), WooCommerce (~5–7M), All-in-One WP Migration/Backup (5M+), Site Kit by Google (5M+),
Wordfence Security (5M+), WP Mail SMTP (3M+), UpdraftPlus (3M+), Rank Math / All-in-One SEO (3M+),
WordPress Importer (3M+); plus the perennial content-pack layer (ACF, Custom Post Type UI),
Redirection, cookie/GDPR consent, and membership/gated-content.

## The pivotal structural fact: Tovu's core absorbs what WordPress leaves to plugins

Many of WP's most-installed plugins exist **because WP core is thin**. Tovu's core is thick exactly
there (by prior ADRs), so those categories are **not third-party plugins in Tovu** — they are core
features, served with **zero third-party code**:

| WordPress plugin category | Why it's a plugin in WP | In Tovu it is… |
|---|---|---|
| Custom fields / post types (ACF, CPT-UI) | WP core has no field/type registry | **Core** — content-types-as-data registry (ADR-022) |
| Revisions / history | WP revisions are shallow | **Core** — append-only complete revisions (ADR-022) |
| Roles / capabilities (Members) | WP roles are coarse | **Core** — identity & RBAC (ADR-021) |
| Backup / migration (UpdraftPlus, AIO Migration) | WP has no native safe backup | **Core** — never-brick snapshots + site export (ADR-023 §4, ADR-012) |
| Import (WordPress Importer) | — | **Core** — site instantiation/import tooling (ADR-012) |

This does two things at once: it **shrinks** third-party plugin demand, and it **concentrates the
risky code in core** (trusted) rather than in third-party plugins (untrusted) — a structural win
for "install from anyone," independent of the tally below.

## Classification (dominant-demand call)

Legend — **CORE**: absorbed into core, not a third-party plugin (zero third-party code). **T1**:
Tier-1 declarative plugin — content types/fields/taxonomies/expression-indexes/settings/declarative
admin/forms/theme-presets, or a **core-mediated webhook** (all zero-executable-code per ADR-024 §1).
**NC**: needs executable code (Tier-2 sandboxed / Tier-3 trusted), often **+ dataModule** (ADR-023).

| # | Real demand (category) | Class | Rationale |
|---|---|---|---|
| 1 | **SEO** (Yoast/Rank Math/AIOSEO) | **T1** (analysis = NC premium) | Meta tags, canonical/OG, titles = declarative fields; sitemaps + redirects = core. Live keyphrase/readability *analysis* is the only genuinely-code part, and it's the premium, not the base demand. |
| 2 | **Page builder** (Elementor) | **Theme-plane** (NC if forced as plugin) | Layout/templating is Tovu's **theme** system (ADR-020: declarative + LiquidJS Tier-2 + code Tier-3), not the plugin system. Demand met without a code *plugin*. |
| 3 | **Forms** (Contact Form 7 / WPForms) | **T1** (core-mediated) | Form *definition* (fields/validation/layout) is declarative; submission storage = `dataModule`/entries; email/notify = **core-mediated** ("on submit, core emails / POSTs webhook"). A forms primitive is core-mediated by design. |
| 4 | **Editor tweaks** (Classic Editor) | **CORE / T1** | Pure toggle/settings schema; the editor itself (TipTap) is core. |
| 5 | **E-commerce** (WooCommerce) | **NC + dataModule** | Own tables (products/orders), checkout runtime, payment-gateway network, tax/shipping calc. The archetypal Tier-2/3 + ADR-023 case. |
| 6 | **Anti-spam** (Akismet) | **NC** (core-mediation could absorb) | A synchronous external verdict on each submission — a runtime decision hook + network. A core "moderation provider" primitive could pull it to T1; today, code. |
| 7 | **Backup / migration** (UpdraftPlus, AIO Migration) | **CORE** | Never-brick snapshots + export are core (ADR-023 §4, ADR-012). |
| 8 | **Analytics** (Site Kit / MonsterInsights) | **T1** (dashboard = NC premium) | Tracking-tag injection = declarative head/asset (a setting + core injects the snippet). The in-admin GA dashboard (pull data + render) is the code premium, not the base demand. |
| 9 | **Security / firewall** (Wordfence) | **NC** (reduced demand) | Live request inspection + malware scan = deep runtime. But Tovu designs out WP's main attack surface (no plugin DDL, sandboxed tiers, capability model), so the *demand* is structurally lower. |
| 10 | **Transactional email** (WP Mail SMTP) | **T1 / CORE** | SMTP config = settings schema + a core mail adapter; delivery is a core/config concern. |
| 11 | **Content import** (WordPress Importer) | **CORE** | Site instantiation/import tooling (ADR-012). |
| 12 | **Redirects** (Redirection) | **T1 / CORE** | Declarative from→to rule table, core-executed at routing. |
| 13 | **Content packs** (ACF, CPT-UI) | **T1** | Pure declarative content types + fields + taxonomies = exactly ADR-022's registry. The purest Tier-1 category, and a top-demand one. |
| 14 | **Cookie / GDPR consent** | **T1** | Declarative settings + a core-injected banner (client asset via ADR-025's sandboxed frame). |
| 15 | **Membership / gated content** | **T1** (billing = NC premium) | Role/policy definitions (ADR-021) + declarative content-gating rules = T1; only the *billing* half needs code + dataModule. |

## Tally & verdict

**Zero-third-party-code demand (CORE + T1):** #1, #3, #4, #7, #8, #10, #11, #12, #13, #14, #15 → **11 / 15 ≈ 73%.**
**Needs code (Tier-2/3, ± dataModule):** #2 (theme-plane/NC), #5, #6, #9 → **4 / 15 ≈ 27%.**

**Stress test (harsh reading).** If we demote the two "base/premium split" categories (SEO #1,
Analytics #8) entirely to needs-code because their *differentiating* feature needs code, T1 still
lands at **9 / 15 ≈ 60%**, NC at **40%**.

**Both readings clear the bar decisively:** Tier-1 covers **~60–73%** of real near-term demand —
well above the ~50% "strongly vindicated" line and **nowhere near** the <~20% collapse line.

> **Verdict: ADR-024 is VINDICATED. Recommend flip PROPOSED → ACCEPTED.** The tiered on-ramp is
> not a fig leaf: the majority of real plugin demand is satisfiable with zero third-party
> executable code, and the code-heavy remainder is exactly what the marketplace-gated Tier-2 +
> ADR-023 `dataModule` are designed for.

## Honest caveats (these are conditions, not disclaimers)

1. **The T1 share is conditional on core shipping a small set of mediated primitives.** Forms (#3),
   analytics tag injection (#8), SMTP (#10), redirects (#12), and core-mediated webhooks generally
   are counted T1 *because core provides the mediated primitive*. If core does **not** build them,
   those categories slide toward NC and the T1 share drops toward the ~50% line. **Actionable:** a
   "core-mediated primitives" set (webhook dispatch, snippet/asset injection, mail adapter, redirect
   executor, form-submission sink) belongs on the Phase-0/near-term core roadmap — it is what
   *converts* declarative demand into a safe on-ramp.
2. **The single highest-value plugin (WooCommerce) is squarely NC + dataModule.** Vindicating
   Tier-1 as the *on-ramp* does not make Tier-2 optional — commerce, the flagship commercial use
   case, lives entirely in Tier-2 + ADR-023. So this audit vindicates ADR-024's *sequencing*
   (Tier-1 first, marketplace = Tier-2), not a "Tier-1 is enough" conclusion. The marketplace gate
   still must ship the sandbox.
3. **WordPress is a proxy, not Tovu's realized catalog.** The demand curve is the incumbent's; a
   from-scratch agent-native commerce CMS may skew *more* declarative (config/content packs, agent
   tools) or *more* code (bespoke commerce). Re-run this audit against Tovu's own top-15 installs
   once a real catalog exists — this is the first-principles estimate, to be replaced by observed data.

## Relationship to the other owed evidence

This closes the **ADR-024** gate. Two sibling evidence items remain open and are *not* closed here:
the **ADR-022** owed 100k-entry index benchmark, and the **ADR-023** owed ~50k-product
faceted-catalog benchmark (both about *performance*, not *demand*).

## Sources

- [50 Most Popular WordPress Plugins 2026 (Ranked by Installs) — peligent.com](https://peligent.com/blog/most-popular-wordpress-plugins/)
- [61+ Top WordPress Plugins 2026 — brainywp.com](https://brainywp.com/blog/top-wordpress-plugins/)
- [Top WordPress Plugins by Active Installations — wpmonitor.dev](https://wpmonitor.dev/plugins-statistics/)
- [20+ WordPress Plugins with 1M+ Active Installs — neliosoftware.com](https://neliosoftware.com/blog/20-wordpress-plugin-1-million-active-installs/)
- [Most Popular WordPress Plugins by Active Installations — wplake.org](https://wplake.org/blog/most-popular-wordpress-plugins/)
