# tovu.dev — Naive Reader Comprehension Audit

**Persona:** First-time visitor to tovu.dev, no prior knowledge of Tovu.
**Method:** curl + tag-stripped read of all 14 confirmed-200 pages, no repo access. HTML comments were stripped with a corrected regex after an initial pass leaked internal dev notes as visible text (see Structural Problems — those comments are invisible to a real browser and are not counted as a user-facing defect).
**Pages read:** `/`, `/documentation`, `/quickstart`, `/how-tovu-works`, `/about`, `/why-local-first`, `/welcome`, `/how-themes-work`, `/theme-authoring`, `/assistant-tool-catalog`, `/how-plugins-work`, `/self-hosting`, `/faq`, `/contact`
**Confirmed 404s (site nav links to all of them):** `/docs`, `/blog`, `/pricing`, `/signin`, `/signup`

---

## Phase 2 — Question by question

### 1. What is Tovu? Two sentences to a colleague?
**ANSWERED** — but only if you skip the homepage.
`/faq`: "A content management system that runs on your own machine. You write posts and pages in a normal editor, a theme renders them into a site, and the whole thing — content, themes, settings — lives in one folder you control."
`/about` echoes it: "Tovu is a content platform you actually own... on a machine you control, in a single folder you can copy, back up, or hand to someone else."
Missing piece: the homepage (`/`), the page every visitor lands on first, does not say this at all — see gap #1 below.

### 2. Who is it for?
**PARTIAL.** No real page states an audience. Every non-homepage page frames Tovu as a CLI/solo-folder tool (`tovu init`, git, SQLite, "no code required" but "themes are real editable files"). The homepage instead frames it as a team SaaS product ("teams who'd rather publish than fight a page builder," a "Marketing lead, mid-size retail brand" testimonial, customer logos). These personas contradict each other and neither is stated as fact anywhere.

### 3. How do I get it? Could I actually obtain and run Tovu?
**PARTIAL/NOT ANSWERED** as a full journey. `/quickstart` gives real commands — `tovu init my-site`, then `cd my-site && tovu serve` — but never explains how the `tovu` binary/CLI gets onto your machine in the first place (no npm/brew/download/curl instruction anywhere in the 14 pages). Worse: the homepage's own buttons for "getting it" are all dead — see gap #2.

### 4. What can it actually DO — enumerate every claim, rate each
- **Posts** (TipTap rich text, draft/published, versioned) — (a) explained well enough to use — `/how-tovu-works`
- **Pages** (TipTap doc OR raw-HTML body, one-way conversion) — (a) — `/how-tovu-works`
- **Menus** (tree, entryRef/termRef/url/route targets) — (a) — `/how-tovu-works`
- **Media** (uploads, alt/caption/credit/hash) — (a) — `/how-tovu-works`
- **Widgets/embeds** (one marker vocabulary, forms are widgets) — (a) — `/how-tovu-works`
- **Themes, 5 tiers** (declarative/templated/handlebars/static/code) — (a) — `/how-themes-work`, though "code" tier is correctly flagged "designed, not built yet"
- **AI assistant** (tool catalog, deny-by-default gate, human-gated deletes, full audit log) — (a) — `/assistant-tool-catalog`, `/faq`
- **Theme authoring** (manifest, tokens, slots, menu embeds) — (a) — `/theme-authoring`, marred by a live broken placeholder on that same page (gap #8)
- **Plugins** — (b) named but not explained: "declare exactly what they touch," "typed hooks," "admin surfaces," but zero worked example, unlike every other content type
- **Instant version history / one-click revert** — (c) hinted at only. Appears solely on the (fake) homepage; the real docs only mention "a version number incremented on every edit" and an "audited change-set gateway," never a revert UI
- **Built-in SEO & analytics** — (c) hinted at only. Homepage-only claim, never corroborated anywhere in real docs
- **Export to code / custom domains / "embed anywhere"** — (c) hinted at only, and partly contradicted: `/self-hosting` says custom domains + TLS are "Coming Soon"
- **Self-hosting / managed hosting** — correctly labeled roadmap: one-click deploy, automatic backups, SQLite→Postgres migration, BYO domain+TLS, all under "Coming Soon" — `/self-hosting`
- **Postgres support** — (c) contradictory: `/about` says "Postgres-ready behind the same interface" (implies works now); `/self-hosting` lists the SQLite→Postgres move as a *future* managed-hosting feature

### 5. How does it work, mechanically?
**ANSWERED**, and this is the site's strongest material. `/how-tovu-works` gives the real content model — Posts/Pages share one `posts` table discriminated by `kind`, TipTap JSON body vs. raw-HTML body with a DB constraint enforcing exactly one, Menus as a `menus` table with a tree, Media table, one marker vocabulary + resolver registry for embeds — with real JSON/HTML examples and exact table/file names. `/how-themes-work` explains the 5-tier system with a real `theme.json`. The admin itself is barely toured: only one line in `/quickstart` ("Tovu prints two addresses — one for your public site, one for the admin").

### 6. The AI assistant — what it does, what stops it doing something bad?
**ANSWERED**, the best-written page on the site. `/assistant-tool-catalog`: no DB/shell/internal-function access; every action is a registered, reviewed tool; all calls route through one deny-by-default executor; destructive actions are "human-gated" (confirmation dialog, cannot self-approve); deletions are soft and revertible via change-set revert; every attempt is logged in the site's own DB. `/faq` reinforces this identically. No gaps.

### 7. Finished vs. planned vs. aspirational — is the site honest?
**MOSTLY**, with one major exception. `/why-local-first`, `/faq`, `/self-hosting`, `/how-tovu-works` are unusually candid: "Tovu is at MVP," self-hosting is "planned... much later," the code theme tier is "designed, not built yet," multi-author editing "is not what this shape is naturally good at." The exception: the homepage makes zero-hedge claims ("Start building free," "Free tier covers up to 3 published sites," a testimonial, SEO/analytics, one-click revert) that are never marked planned/aspirational and are partly contradicted by the honest pages — and nothing on the page discloses that it isn't real Tovu copy.

### 8. What does it cost?
**NOT ANSWERED.** No real page states pricing. The only pricing signals are the fake homepage ("No credit card. Free tier covers up to 3 published sites") and a "Pricing"/"See pricing" link to `/pricing`, which 404s. The honest answer, reconstructed from real docs, is "free, self-run, nothing to pay for" (`/faq`: "There is no managed plan, no signup"; `/about`: "No lock-in and no per-seat pricing") — but a visitor has to reconcile that against a broken pricing link and homepage language implying paid tiers exist.

### 9. First three things after getting it?
**ANSWERED**, well done. `/quickstart` steps 1–3: `tovu init my-site` → `cd my-site && tovu serve` (opens admin) → go to Posts → New, write, save as draft. Concrete, sequential, ~10 minutes. Only gap: it never says how `tovu` got installed before step 1 (see gap #3).

---

## Phase 3 — Verdict

**One-line verdict: MOSTLY.** A motivated newcomer who pushes past the homepage and reads `/documentation`, `/quickstart`, `/faq`, `/how-tovu-works`, `/how-themes-work`, and `/assistant-tool-catalog` comes away with an accurate, fairly deep understanding. But the mandatory front door — `/` — actively misinforms and every one of its CTAs is a dead link, which for most real visitors would flip this to NO before they ever reach the good pages.

### Top 10 comprehension gaps (ranked)

1. **Homepage describes a different, fictional product.** `/` is "Basic," a page-builder SaaS with pricing, signup, hosted plan, and a customer testimonial — none of which are true of Tovu, and all contradicted by every other page. Fix: replace with real Tovu positioning from `/about`/`/faq`.
2. **Every homepage CTA is a dead link.** "Get started" and both "Start building free" buttons → `/signup` (404); "Read the docs" → `/docs` (404); "See pricing"/"Pricing" → `/pricing` (404). A visitor cannot act on anything on the homepage. Fix: point CTAs at `/quickstart` and `/documentation`; remove pricing links.
3. **No install instructions anywhere.** `/quickstart` starts at `tovu init my-site` with no step explaining how the `tovu` CLI gets onto your machine. Fix: add a real "Step 0: Install."
4. **No stated audience.** Real docs imply solo/developer use; the fake homepage implies enterprise teams. No page states who Tovu is actually for. Fix: one explicit sentence on `/` or `/about`.
5. **Contact page ships live, unfilled template placeholders.** `/contact`: "Email: support@example.com — replace with your real address," "security@example.com," "link to your GitHub repository," "link to your Discord or forum, if you have one." Fix: fill in real contact info or hide the section.
6. **Plugins are named but never made concrete.** `/how-plugins-work` gives no worked example, unlike the JSON/HTML examples for every other content type. Fix: add one worked plugin example.
7. **Contradiction on Postgres readiness.** `/about` implies it works today ("Postgres-ready behind the same interface"); `/self-hosting` lists it as a future managed-hosting feature. Fix: state plainly which is true.
8. **`/theme-authoring` shows a live broken placeholder in its own sidebar**: "No docs menu bound yet." Fix: bind the docs sidebar menu for this route, same as `/how-tovu-works` already does.
9. **No pricing page**, yet "Pricing" is linked from nav/footer/homepage and the fake homepage implies tiered pricing exists, directly contradicting `/faq`'s "no per-seat pricing." Fix: ship a one-line `/pricing` ("free, self-hosted") or remove the link.
10. **`/welcome` reads like an internal QA note, not a welcome page** — "pressure-test the shell before we fill in the rest of the CMS," "Build the skateboard first, but make sure it actually rolls," a stray `console.log('Tovu shell is live')`. Fix: rewrite as a real admin tour or unpublish.

### Missing pages (beyond the 5 known 404s)
- `/pricing` — linked everywhere, doesn't exist; the real answer is one line
- `/docs` — footer links here (distinct from the working header link to `/documentation`); redirect or remove
- A "who is this for" page/section
- A real install page (npm/brew/download) — currently absent, not even 404'd
- **The Plugin API** — referenced by name in `/how-themes-work` ("See How Plugins Work and The Plugin API for the plugin system itself") but no such page exists or is linked from anywhere
- A changelog — the demo theme's own manifest lists a "changelog" page in its page set, but no real Tovu changelog exists

### Structural problems
- Two different "Docs" links site-wide: header → `/documentation` (works), footer → `/docs` (404) — same label, two destinations
- The homepage is an unedited theme demo mounted at `/`, only decodable as "not real copy" via the footer credit "A Tovu theme, adapted from an original Open Design export," which appears in small print on every page and requires already understanding Tovu's theme system to interpret correctly
- `/documentation` lays out a sensible reading order (Quickstart → concepts → themes → assistant → plugins/self-hosting), but nothing on the homepage points here — its own "Read the docs" button 404s
- Internal implementation comments (file paths like `static-render.ts`, `kuinetic.all.js`, `pages.ts`) are embedded as literal HTML comments in `/how-tovu-works`'s shipped page source — invisible in a real browser, not a user-facing defect, but visible to anyone who views source

### What is genuinely good
- `/how-tovu-works` and `/how-themes-work`: precise, mechanical, backed by real JSON/HTML examples and exact table/file names — better than most real product docs
- `/assistant-tool-catalog`: the strongest page on the site — a specific, non-hand-wavy security model that actually earns trust
- `/faq`: candid, well organized by real visitor concerns, willing to say "not yet"
- `/quickstart`: concrete, time-boxed, end-to-end testable (minus the install-step gap)
- `/why-local-first`: unusually honest — lists the costs of the local-first choice, not just the benefits
- Consistent, correct MVP/roadmap labeling everywhere **except** the homepage
