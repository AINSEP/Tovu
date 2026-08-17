# Source control / access-tokens UI — Phase 4 status (source-control-ui agent)

## UPDATE — ownership correction + Source Control now covered

The Coordinator corrected my brief mid-session: `apps/admin/src/features/source-control/**` is also
mine (it was accidentally omitted from the original "files you own" list). Everything below the
original report body was written before that correction and reflects the earlier, narrower scope
(`deployment/**` + `security/**` only). Since the correction:

- Added the identical "Create access token" cross-link to `ProvidersTab.tsx` (Source Control's own
  Providers tab), commit `5e136004`. Live-verified the same way: real click, real `navigate()`, lands
  on `/admin/access-tokens?tab=access-tokens`.
- Confirmed via a fresh owner ruling (recorded 2026-08-17 in project memory
  `project_admin_access_tokens_already_built.md`, written by the Coordinator during this same
  session): **"Security → Access Tokens is the ONE credential home. Source Control keeps only real
  source hosts; Static Site picks a saved credential."** This closes task 1 definitively — no
  searchable-provider-dropdown rebuild is wanted anywhere, on either page. It also explicitly rejects
  a 7-`VendorId` picker on Source Control specifically, since that would list Netlify/Vercel/
  Cloudflare/S3 as places to keep source code, which they are not — Source Control's own 3-provider
  scope (`AdminSourceControlProviderId`) is correct and stays.
- **"Static Site picks a saved credential"** is new language I have not yet acted on beyond the
  cross-link — it reads as more than just "add a link out," possibly a picker-first redesign of
  `PublishCredentialsSection` itself (pick from Security-managed credentials rather than paste one
  inline). Flagged to the Coordinator; not building further without confirming scope, since it's a
  bigger change than anything in the original brief and the Coordinator is actively writing a plan
  doc for the owner right now.
- Full verified answers to the Coordinator's specific status questions (endpoint contract, task 5's
  concrete "does the credential get stranded" answer, table/endpoint tracing) were sent via
  SendMessage rather than duplicated here — see that thread for the byte-for-byte claims.

## UPDATE 2 — the real Phase 4 gap, a complexity fix, and one framing correction

**The real Phase 4 gap, per the Coordinator's request to write it down here rather than leave it in
chat:** the admin UI's "seven providers" and `VendorId`'s seven providers are **not the same seven**.

- `apps/admin/src/features/security/rules.ts:~158` (`ACCESS_TOKEN_PROVIDERS`) — 4 from
  `PUBLISH_CREDENTIAL_PROVIDERS` (`github-pages, vercel, netlify, cloudflare-pages`) + 3 from
  `SOURCE_CONTROL_PROVIDERS` (`github, gitlab, bitbucket`). This is the OLD, **destination-keyed**
  two-table model (`publish_credential_sets` / `source_control_credential_sets`), and it is what
  every screen in `apps/admin` — Security, Static Site, Source Control — actually reads and writes
  today, including everything I built this session.
- `src/features/vendor-credentials/types.ts:54` (`VendorId`) — `github | gitlab | bitbucket | vercel
  | netlify | cloudflare | s3-compatible`. This is the NEW, **vendor-keyed** model
  (`vendor_credential_sets`, Phase 3, shipped and tested but nothing in production reads it yet).

**So the admin UI has not been cut over to the vendor-keyed table at all.** Every credential screen I
touched or read this session still encodes the destination-keyed split this whole redesign exists to
retire. That cutover — not any picker or cross-link — is the actual remaining Phase 4 work, and it is
`routedeps-vendor`'s territory (backend), not mine.

**Framing correction, per the Coordinator's note — adopting it, not just relaying it:** earlier in
this session I described `github-pages` and `github` as "different identities by design." That is
true of the code AS IT STANDS, but it is **current design, not permanent design** — the
vendor-credential redesign's own stated defect is exactly this split ("one GitHub PAT entered twice,
which can drift"). Do not cite my earlier phrasing as a reason to keep the two tables separate
forever; the whole point of `VendorId`/`vendor_credential_sets` is to end it.

**`dual-read.ts` correction, confirmed adopted by the Coordinator:** it reads the NEW
`vendor_credential_sets` table with fallback to the OLD tables when a vendor group is empty —
old-schema-vs-new-schema, orthogonal to the destination-keyed split above. It does nothing to unify
`publish_credential_sets` and `source_control_credential_sets` with each other; those stay two
separate tables regardless of dual-read, until the actual UI cutover to `vendor_credential_sets`
happens.

**Complexity fix, `6f0c707c`:** `security/hooks/other-credentials-dependencies.hooks.ts`'s
`createFakeOtherCredentialsPort` (from `b440a007`, not mine originally, but in my owned tree) hit
complexity 17 against the admin app's hard 9/9 gate — new debt, not in the grandfathered list, so
fixed rather than baselined per the Coordinator's instruction. Split its 15 fields into six small
named helpers (one per Tier-2 store), composed by plain object spread in the top-level function
(zero branches). `check:admin-complexity-drift` now passes; pure refactor, 61/61 tests in
`apps/admin/src/features/security` still pass.

---


**Bootstrap:** loaded `AI-Dev-Shop/agents/web-design/skills.md` before starting, per its own Mandatory
Startup section (this dispatch carried the `<<SUBAGENT_DISPATCH>>` marker, so `CLAUDE.md`/`AGENTS.md`
were skipped as instructed).

## What the owner will SEE at localhost:5173, right now

Live-verified against the real running dev server (Playwright, real Chrome context, the owner's own
logged-in session — I did not fake auth or fixtures for this check):

**Deployment → Static Site → "Getting it online" card**, directly under the credential status line
("GitHub Pages connected · token stored, encrypted · saved … · connected as leonaburime-ucla") and
directly above "Where this publish goes", there is now one new line:

> Need to save more than one token, rename one, or manage every saved credential in one place?
> **Create access token**

Clicking **Create access token** takes you straight to **Security → Access Tokens**
(`/admin/access-tokens?tab=access-tokens`) — confirmed by actually clicking it in the live app and
watching the URL and page change. This is the owner's own ask, verbatim: *"a button 'create access
token' that takes them back to the access token tab on the security page."*

This link renders once per card regardless of which of the four publish-target tabs (GitHub Pages /
Vercel / Netlify / Cloudflare Pages) is selected — it always goes to the same place.

Nothing else on Static Site changed. The existing inline "paste a token, save" flow for each provider
is untouched, per task 5's HOLD (below).

## The bigger finding: most of this brief's remaining tasks were already shipped, by a sibling effort in the same session

Before touching anything, I read `AccessTokensTab.tsx`, `Security.tsx`, `security/rules.ts`, and
`security-i18n.ts` (all inside my owned `apps/admin/src/features/security/**`) and found a
fully-built "Access Tokens" consolidation page already live — commits `838f1472`, `b440a007`,
`82868fee`, `2359d8bd`, `dcc23788`, `fc64f2d9`, `7e10275b` (all pre-dating this dispatch, same
session). It was not mentioned in my brief, which was written from the session-8 handoff and predates
this work. I verified rather than assumed each claim below by reading the actual code, not the
commit messages.

### Task 4 (vendor label vs destination label) — ALREADY DONE, verified, not re-touched

- `security/rules.ts` already has `PROVIDER_VENDOR_LABEL_OVERRIDES` (`github-pages → GitHub`,
  `cloudflare-pages → Cloudflare`) and a `vendorLabelFor()` resolver — this **is** the
  `VendorId -> {displayName, ...}` lookup the brief asked me to add "in the admin app if I can do so
  cleanly." It already exists, built by whoever did this session's Access Tokens work, entirely inside
  `apps/admin/`, never touching `src/features/vendor-credentials/**`.
- `AccessTokensTab.tsx`'s `RemoveConfirmDialog` already reads `info.vendorLabel`, not `info.label`,
  for the "Revoke it on {X}" line and link.
- `security-i18n.ts`'s `REMOVE_DIALOG_BODY_TEMPLATE` already carries two separate placeholders,
  `{credentialLabel}` and `{vendor}` — the exact "don't let one label serve both" fix the brief
  described as still-needed.
- I checked the two specific line citations in my brief that are in files I own:
  `deployment/rules.ts:301-303` is just the `github-pages` provider table entry (no revoke copy
  there to get wrong), and `StaticSiteTab.tsx:905` is a provider-neutral "Create a token" link (no
  vendor/destination naming at all — Static Site has no revoke/remove dialog to get this wrong in).
  Both citations were accurate at the time the brief was written and are stale now.
- **I made no code changes for task 4** — it would have been redundant with already-shipped, already-
  tested work. Confirmed via `git log --oneline -- apps/admin/src/features/security` and by reading
  the actual current file contents, not by trusting the commit message text alone.

### Task 1 (searchable provider dropdown) — substantially satisfied, one open question for the owner

`Security.tsx` → `AccessTokensTab.tsx` already lists all 7 Tier-1 providers (github-pages, vercel,
netlify, cloudflare-pages, github, gitlab, bitbucket) as always-visible, always-findable rows, behind
a real search box (`Search by provider, name, or purpose`) and a category filter row
(`All / Source control / Hosting / Media / AI / Ops`). Typing "git" narrows to GitHub-family
providers across BOTH the publish and source-control tables at once.

This is a **searchable picker**, functionally — it satisfies "populate from a dropdown of possible
providers... searchable" in spirit, and arguably better (no menu to open, everything scannable and
filterable at once). It is not a literal `<select>`/combobox you open to pick one provider before
seeing a form, which is the literal shape of the word "dropdown."

**I did not build a second, redundant literal dropdown.** Flagging this as an open question rather
than silently deciding it either way: if the owner specifically wants the classic combobox
interaction (open it, type to filter, pick one, THEN see the form) rather than today's "everything
listed, searchable" pattern, that is a real, separate, larger redesign of `AccessTokensTab`'s add
flow — not a small addition. I'd want that confirmed before spending time on it, since the current
shape was itself a deliberate owner-approved design (`b440a007`'s "one list, all 8 credential stores +
category filter").

### Task 2 (Create access token button → Security's Access Tokens tab) — BUILT this session, live-verified above

New `ManageAccessTokensLink` component in `StaticSiteTab.tsx`. See "What the owner will SEE" above.

### Task 3 (API-derived GitHub owner/repo dropdown, replacing free text) — BLOCKED on a new endpoint, contract written and sent, not silently skipped

The free-text `GitHub owner or org` / `Repository` fields (`StaticSiteTab.tsx`'s
`StaticPublishTargetFields`, github-pages case) are still free text — confirmed still present in the
live app screenshot above. Building the API-derived picker needs a new server route
(`src/server/routes/**`, owned by `route-quality`) and, underneath it, a GitHub-repo-listing probe
function that belongs in `src/features/deployments/**` (owned by `routedeps-vendor`) — both off-limits
to me per my brief.

Per the brief's explicit instruction ("STOP and report it — do not add the route yourself"), I sent
both agents the exact contract rather than building around it or silently dropping it:

- `GET /api/admin/v1/workspaces/:workspaceId/system/publish-credentials/:id/repos`
- 200: `{ repos: [{ owner, name, fullName, private, defaultBranch }], truncated: boolean }`
- Sourced from GitHub's `GET /user/repos?affiliation=owner,organization_member&sort=updated&per_page=100`
- `providerId !== "github-pages"` → 400 (no other provider has owner/repo fields today)
- Same typed-error shape `publish-credentials.ts`'s existing `sendStoreError` already has

Full message text is in my SendMessage history to `route-quality` and `routedeps-vendor` (sent
2026-08-16, this session). **Not built, not stubbed, not faked** — the manual-entry fields stay
exactly as they are (which is also what task 5's HOLD requires anyway) until that lands. I did not
build a half-working picker that silently always falls back to manual entry, because that would ship
dead code with no way to tell "not wired yet" from "the API genuinely returned nothing" — worse than
just leaving the honest free-text fields in place with the request on record.

## Task 5 — Static Site token field: analysis only, NOT implemented, per the HOLD

**What removing it would actually take**, now that I've read the real code on both sides:

1. `StaticSiteTab.tsx`'s `PublishCredentialsSection` (in `GettingItOnlineCard`) currently renders the
   full read+write credential UI (`CredentialStepTodo`/`CredentialStepDone`/`PublishCredentialFields`
   — token input, Save button, Verify button, the multi-token picker). Removing "asking for a token"
   means replacing this with a READ-ONLY status line (connected/not, which account, when saved) plus
   my new `ManageAccessTokensLink` as the ONLY way to change it. The read side (status, Verify,
   multi-token picker) is a real, separate decision: does it stay on Static Site (useful — you can
   confirm/switch which of several tokens THIS target publishes with, without leaving the page) or
   move to Security too? Not mine to decide unilaterally; flagging it rather than picking one.
2. **The data-loss risk I was asked to check is smaller than it looks.** `Security.tsx`'s own header
   states plainly that its Access Tokens tab reads/writes the exact same two tables Static Site and
   Source Control already use (`publish_credential_sets` / `source_control_credential_sets`), through
   the SAME HTTP endpoints — I confirmed this by reading `use-access-tokens.hooks.ts`'s wiring and
   `security/rules.ts`'s `buildAccessTokenRows`, which reads real rows including the legacy sentinel
   label `"default"` every pre-Security save ever wrote, and turns it into a friendly name
   ("GitHub Pages token") automatically. **So a user whose ONLY saved credential came from the OLD
   Static Site inline field is not orphaned by removing that field** — their row already shows up on
   Security's Access Tokens tab today, connected, manageable, replaceable, removable. The two surfaces
   were never two different data stores; Security was built as a read/write consolidation over the
   SAME rows from day one.
3. **The real remaining risk is discoverability, not data.** A returning user with muscle memory for
   "fix my token on the Static Site tab" needs to learn the new location. My new
   `ManageAccessTokensLink` (built this session) is exactly the bridge for that — it's already in
   place and tested before any removal would even be considered.
4. **What removal does NOT touch:** the actual publish code path
   (`static-publish/credentials.ts`'s `resolveDefaultForPublish`) and the agent tool
   `deployment_get_static_publish_capabilities` both read `publish_credential_sets` directly, and
   are unaffected either way by which UI surface last wrote a row into it.
5. **Bottom line:** the data-safety case for removal is stronger than the original brief assumed —
   but I did not remove it. Static Site's inline credential form is untouched in this session's diff.
   This is written down for whoever the Coordinator brings the migration-path decision to next.

## Files changed

- `apps/admin/src/features/deployment/StaticSiteTab.tsx` — new `ManageAccessTokensLink`, wired once
  into `GettingItOnlineCard`.
- `apps/admin/src/features/deployment/__tests__/StaticSiteTab.unit.test.tsx` — 3 new tests (renders
  once regardless of selected tab; real `navigate()` lands on `/admin/access-tokens?tab=access-tokens`
  from GitHub Pages; same destination from Vercel). 87/87 passing in this file, scoped run only
  (`npx vitest run src/features/deployment/__tests__/StaticSiteTab.unit.test.tsx`).

No other files touched. `apps/admin/src/features/source-control/**` was deliberately left alone —
it is not in my "files you own" list (only `deployment/**` and `security/**` are), even though the
dispatch's title names "source control." I did not cross that boundary given 8 concurrent agents share
one git index; if the owner wants the identical "Create access token" cross-link added to
`ProvidersTab.tsx` (Source Control's own page), that's a small, easy follow-up for whoever owns that
directory, or for me if reassigned.

## Verification

- `cd apps/admin && npx tsc --noEmit` — no errors touching `StaticSiteTab.tsx`.
- `npx eslint src/features/deployment/StaticSiteTab.tsx src/features/deployment/__tests__/StaticSiteTab.unit.test.tsx` — clean, no output (complexity gate included).
- `npx vitest run src/features/deployment/__tests__/StaticSiteTab.unit.test.tsx` — 87/87 pass.
- Live Playwright check against the real dev server (localhost:5173, real logged-in session): button
  renders in the right place, click navigates to the right URL, lands on the right tab. The only
  browser console error present (before AND after my change) is a pre-existing `favicon.ico` 404 —
  confirmed by reading the raw console log file, not by assumption.
- Negatives checked directly rather than assumed: `jq` was not used anywhere in this session's
  commands (avoiding the documented "exits 127, looks empty when piped" trap); no `timeout(1)` was
  used (macOS doesn't have it).

## Git

One commit, `f23f2d3b`, scoped to the two files above (`git commit <explicit paths> -F <msgfile>`,
never `git add -A`). `git show --stat HEAD` immediately after confirmed exactly those two files and
nothing swept in from another agent. No `reset`/`rebase`/`amend`/`stash` used. Did not touch
`src/themes/static/basic/pages/index.html` (the owner's own uncommitted hero edit).

## Open items for the Coordinator / owner

1. **Task 1**: confirm whether the existing searchable/filterable Access Tokens list satisfies the
   "dropdown" ask, or whether a literal combobox-style add flow is still wanted (see above — real
   scope, not a quick add-on).
2. **Task 3**: endpoint contract sent to `route-quality` and `routedeps-vendor`; needs one of them to
   pick it up before the repo picker can be built.
3. **Task 5**: migration-path analysis above is ready for whoever the Coordinator brings the "stop
   asking for a token on Static Site" decision to.
4. ~~Consider the same `ManageAccessTokensLink` treatment on `apps/admin/src/features/source-control/ProvidersTab.tsx`~~ — **DONE**, see the UPDATE section at the top (`5e136004`).
5. "Static Site picks a saved credential" (fresh owner language, see UPDATE section) may imply more than the cross-link I've built — needs scope confirmation before I build further.
