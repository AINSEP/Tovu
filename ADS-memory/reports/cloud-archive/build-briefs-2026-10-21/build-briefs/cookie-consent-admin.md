# Build brief: Cookie Consent admin page + custom categories

Code: `tovu-int` (branch `integration/2026-10-20`) and `jini-int`. **Build only in the clones.**

## Goal (owner terms)
A dedicated "Cookie Consent" page where the owner turns the banner on, writes its text, picks its look and
position with a live preview, sets the rules (region, re-ask on policy change), and publishes. Later, the
owner can add their own cookie categories beyond Necessary/Functional/Analytics/Marketing.

## Owner rules (every lot)
- The generic consent UI pieces (fields, preview frame) go in Jini `@jini-ai/admin/consent/react`. The Tovu binding (routes, revisions, nav) goes in Tovu.
- Consent policy and engine semantics stay in Jini `@jini-ai/cms/consent`. Tovu builds no second classifier or CSS parser (`features/consent/README.md:3-5`).
- Functions take `(requiredObj, optionalObj = {})` with ports. React components get props only. Complexity ≤10.
- 100% coverage per touched file with DI fakes. Any schema change is an ADR-066 TS migration; none is expected, since config is revision JSON.
- Make the smallest change, preserve "why" comments, and add no new deps.
- Vitest runs with `--maxWorkers=2`. Leave no test processes running.

## What already exists (reuse)
- **Backend (done, commit `d2126748f`)**: `apps/website/src/server/inbound/admin-http/routes/consent/routes.ts` provides GET `/settings`, GET `/readiness`, POST `/dry-run`, POST `/preview` (`{html, sandbox:""}`), PUT `/settings {config, expectedDraftId}` and POST `/publish {draftId, expectedPublishedId}`. A stale revision returns 409. Contract: `apps/website/src/features/consent/README.md:7-37`.
- Revisions store: `features/consent/revisions.repo.ts` (migration `0021_site_consent_revisions` is already in place). Validation: `features/consent/validation.ts`. Assistant tools `consent_get_settings/readiness/explain_blocked/update_settings/publish_settings`.
- Public middleware mounted in the clone: `server/inbound/public-http/middleware/site-consent.ts` plus `composition/app.ts:218,270,545`.
- **Jini admin view**: `jini-int/packages/admin/src/consent/react/ConsentSettingsPanel.tsx` (68 lines). It covers basic text fields, region and enabled only, has no placement/appearance/customCss/preview, and is ledger-shaped.
- **Tovu admin hook**: `apps/admin/src/features/consent/settings.hooks.ts` (44 lines) plus `consent-settings.css`. It targets the **legacy ledger namespace**, not the revisions API, and **no panel renders it**.
- Engine config fields: `jini-int/packages/cms/src/consent/types.ts:23-38`. `compileConsentCss` returns `problems` for inline errors.
- Design decisions: `/Users/la/Programming/Tovu/ADS-memory/reports/2026-10-19-consent/DEBATE.md:56-111`. These are opt-in everywhere by default, plain-text message + structured secondary link, and the tabs **Overview · Banner · Look & Position · Rules** (Records later). The preview is an iframe `srcdoc` with `sandbox=""` and never enters the admin DOM.

## Live-tree conflict (read before merging)
The live checkout `/Users/la/Programming/Tovu` has **uncommitted** `apps/website/src/server/inbound/public-http/middleware/site-consent.ts` (untracked) and an 8-line `composition/app.ts` mount. Both are an **older copy** of what the clone already committed. The live copy reads only the ledger config, while the clone reads the published revision first. Merging `integration/2026-10-20` into the live branch will conflict on both files. The clone's version should win, but discarding the owner's uncommitted files needs **owner OK**, so do not auto-resolve. This job touches neither file.

## Scope
IN (phase 1):
- An admin port onto the revisions API.
- The Jini panel grows the missing fields and a preview frame.
- A Tovu page with 4 tabs, draft autosave and an explicit Publish.

IN (phase 2, only after the owner answers Q2): custom categories.

OUT: the Records tab (receipt browsing), a compliance scanner, the Worker/D1 receipts for static sites, the Jini engine bug fixes (the separate release blockers in DEBATE.md Q2) and Settings → Privacy (that is vendor telemetry).

## Lots
**C1: Tovu admin: revisions port + controller (S).**
- Replace the unused ledger port in `features/consent/settings.hooks.ts` with `createConsentRevisionsPort({ request })`, offering get/readiness/dryRun/preview/saveDraft/publish over the routes above.
- Controller `use-consent-page.hooks.ts`: serialized debounced autosave carrying the last `draftId`. On 409, stop and show "Someone else changed this — reload", never retrying over their work. It also tracks draft-vs-published status and calls Publish with `expectedPublishedId`.
- Keep the file's "why" comment (adapter has no competing save state) and move it if the code moves.
- Tests: fake request for each status code (200/400 problems/404/409/503), autosave ordering and publish.

**C2: Jini admin: fields + preview (M).**
- In `@jini-ai/admin/consent/react`, extend `ConsentSettingsView`/`ConsentSettingsPanel` additively with `placement`, `secondaryLinkLabel/Url`, `appearance` tokens (color inputs + bounded px), `customCss` (textarea) and a `problems` prop rendered next to each field.
- Add `ConsentPreviewFrame({ html, width })`, which sets only `srcdoc` and `sandbox=""` with 320px/desktop toggles.
- Split it into section components so Tovu can place them per tab (`ConsentBannerFields`, `ConsentLookFields`, `ConsentRulesFields`). Keep `ConsentSettingsPanel` as the composed default for other hosts.
- Tests: RTL with fake onChange, the problems display, and the iframe attributes (no `allow-*`).
- Rebuild only the `@jini-ai/admin` package dist after review.

**C3: Tovu admin: the page (M).**
- `apps/admin/src/features/consent/{CookieConsent.tsx,index.ts,consent-i18n.ts,rules.ts}`. The panel id is `consent`, with `?tab=overview|banner|look|rules` (the same idiom as SEO, `panels.tsx:1114-1124`).
- The group is **Marketing** by default (DEBATE Q1 is unresolved, so the owner can move it: a one-line change).
- Overview uses readiness: on/off status, blocking problems such as `PRIVACY_LINK_REQUIRED` with a link to fix, and what will pause.
- The preview pane shows on the Banner and Look tabs. The Publish button is disabled while problems exist.
- Cross-link from the Analytics screen.
- Strings go in all locales the sibling i18n files carry.
- Tests: tab resolution, Overview mapping of readiness codes, publish disabled on problems, injected hook fakes.

**C4 (phase 2, owner-gated): custom categories (L, Jini cms + Tovu).**
- `CONSENT_CATEGORIES` is a fixed tuple (`cms/src/consent/types.ts:2`). It is coupled in `policy.ts`, `html/gate.ts`, `html/client.ts` and `html/render.ts`.
- Additive design: `ConsentConfig.categories?: { id, label, description, gpcDenies?: boolean }[]` (max 8, id `^[a-z][a-z0-9-]{1,31}$`, the four built-ins reserved). `ConsentChoices` becomes `Record<string, boolean>` keyed by built-ins plus declared ids.
- The gate accepts `data-consent-category="<declared id>"`, and undeclared ids stay blocked.
- Google Consent Mode keeps mapping only the four. Receipts record declared ids, and adding or removing a category re-asks visitors (through the policyVersion suffix).
- Built-in category descriptions/labels become editable in the same field. This is the README's "upstream engine contract" gap.
- Tests: the gate with declared/undeclared ids, GPC on a custom `gpcDenies` category, and receipt round-trip.

## Acceptance tests
- `/admin/consent` loads. Editing the title autosaves a draft and the site stays unchanged until Publish. Publish updates the live banner (integration test through the routes).
- An invalid custom CSS shows the problem inline, and Publish stays disabled.
- A 409 on save shows the reload notice and never overwrites.
- The preview HTML only ever lands in `srcdoc` of an iframe with `sandbox=""`.

## Needs a local Chrome look afterwards
Yes, and it matters: preview fidelity against the live site, 320px and desktop, 200% zoom, dark admin, keyboard through the tabs, contrast warnings, and the Accept/Reject equal-size check on the real site.

## Risks
- Two settings sources: the legacy ledger `core.consent.*` stays the boot source until first publish. The page must show the published revision, not ledger values.
- C4 changes consent semantics (legal exposure). It needs its own review, and the Jini release blockers listed in DEBATE.md Q2 should land first.

## Open questions (owner)
1. Should the page live under Marketing (recommended by 2 of 3 debaters) or Administration?
2. Does "custom categories" mean new categories (C4) or just editable names and descriptions for the four built-ins? The second is much smaller.
3. Should the stale live-tree `site-consent.ts` + `app.ts` mount be discarded in favor of the clone's committed version?
