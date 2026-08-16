# Visual spec — Security page / Access Tokens tab

Date: 2026-08-16
Author: web-design agent (dispatched, read-only on code)
Status: spec only — no `.ts`/`.tsx`/`.css` touched by this dispatch
Skills loaded: general-behavior, ui-ux-design (+ premium-ui, sam-crawford, self-made-web-designer,
kole-jain), frontend-accessibility, web-compliance, interface-design, theming,
vercel-web-design-guidelines, shadcn-ui (n/a — this app ships no Tailwind/shadcn; noted and skipped
past the top-level read, per that skill's own "mapping design decisions to shadcn primitives when the
stack includes it" scope, which this stack does not)

Builds on, not duplicating: `development/todos.md:1208` (original Security-page spec),
`ADS-memory/reports/continuity/2026-08-16-session-6-handoff.md` (scope supersession — Replace added),
`apps/admin/src/features/deployment/StaticSiteTab.tsx` and `apps/admin/src/features/source-control/
ProvidersTab.tsx` (the two credential UIs this page consolidates), `src/db/schema.ts` (the eight
sealed-credential tables, read directly for this spec — see the inventory table below).

## STATUS: COMPLETE (Phase 1)

Every section below (§0–§16) was written and is not partial — §1–§15 spec the page in full, §16 is a
closed list of assumptions rather than a placeholder. Read on restart with no loss: this file is not a
handoff to a stranger, it is my own worklist — I (this same agent identity, web-design) will build
Phase 2 against it once the Security page and Access Tokens tab exist in the tree and team-lead opens
Phase 2. **§17, appended after the original Phase-1 pass, is the concrete Phase 2 worklist** — read
that first on restart, it points back into the sections above by number rather than repeating them.

Paused after Phase 1 by team-lead, owner's call: "we deployed you too early... a design pass wants
something real to look at." Correct call — `security-tokens` is building the page concurrently; there
was nothing rendered yet for a design pass to react to. Nothing was left mid-thought; this is a clean
boundary, not an interruption.

---

## 0. Read this first — one decision that changes the shape of everything else

The dispatch brief says the page supports **Create, Replace/rotate, and Remove**. The 2026-08-16
session-6 handoff says Create must stay on the originating feature flow (Static Site, Source Control)
and the Security page is **Replace + Remove only** — reversing that was called out as a mistake to not
repeat, and defended with a real, three-passes-paid-for argument (Static Site's credential step was
deliberately pulled out of an "Advanced" disclosure into Step 1).

I looked for the actual conflict and I don't think there is one, once you look at what "Create" means
on each screen:

- **Static Site / Source Control today create exactly one thing per provider**: the DEFAULT
  connection (`publish_credential_sets` / `source_control_credential_sets`, `isDefault = true`). Every
  row in `PublishCredentialRowState`/`SourceControlCredentialRowState` is singular — there is no UI
  anywhere that lets an operator save a **second** GitHub Pages token. The schema already supports it
  (`UNIQUE (workspace_id, provider_id, label)`, an `isDefault` flag with a real promotion rule on
  delete — see `publishCredentialSets`' own doc comment in `schema.ts`), the UI has just never exposed
  it.
- **The owner's ask — "a 30-day token for testing, a production token" — is a request for that
  never-built multi-row UI**, not a request to duplicate the single-row Create flow that already
  exists on Static Site/Source Control.

So the resolution: **the Access Tokens tab is where multi-row token management lives, full stop —
Create, Replace, Remove, and default-selection, for every provider that supports more than one named
connection.** Static Site and Source Control are UNCHANGED — same one-row-per-provider Step
1/accordion, still fast, still task-shaped, still editing the SAME `isDefault` row this page's own
"Replace" edits. Nothing here re-hides that step or adds a second place to do what those screens
already do. What was missing — save a second, third, differently-scoped token, and choose *which*
saved token a publish target actually uses — genuinely has no other home, so putting it here does not
reopen the "two entry points for one secret" bug: it's one entry point for a capability that only
exists here.

**If this reading is wrong** — if the owner meant Create should ALSO be duplicated onto this page for
the single-default-row case — the fallback is simple: hide `AccessTokenAddForm` (§5) behind a
provider's existing rows are non-empty check is unnecessary either way, since "Add another" is already
additive to whatever Static Site/Source Control created. I don't think there's a real fallback needed;
flagging the reasoning so it's not silently assumed.

---

## 1. The eight stores, and what "Access Tokens" tab actually covers

Read directly from `src/db/schema.ts`. Two axes matter for this page: whether a store is **multi-row
per provider** (the "named tokens" shape the owner described) or **single-row per scope**, and whether
it stores a **masked tail** at all.

| # | Store (table) | Shape | Masked tail? | Provider(s) | Existing screen |
|---|---|---|---|---|---|
| 1 | `publish_credential_sets` | multi-row, named, `isDefault` | **No** (deliberately — Terra's own recommendation, schema.ts:1461) | github-pages, vercel, netlify, cloudflare-pages | Static Site tab |
| 2 | `source_control_credential_sets` | multi-row, named, `isDefault` | **No** (same reasoning, copied verbatim) | github, gitlab, bitbucket | Source Control → Providers |
| 3 | `site_assistant_credentials` | single-row per workspace | **Yes** (`masked`, `••••`+last4) | the public visitor assistant's model key | Settings (AI) |
| 4 | `admin_execution_credentials` | single-row per `(workspace, admin)` | **Yes** (`masked`) | the admin's own BYOK dock key | AI Assistant dock (BYOK) |
| 5 | `media_provider_credentials` | multi-row per `(workspace, provider)`, but ONE row per provider (no named variants) | **Yes** (`keyTail`) | media-gen vendors (grok, fal, …) | Media → Media providers |
| 6 | `composio_config` | single-row per workspace | **Yes** (`keyTail`) | the Composio project key | Settings → Connectors |
| 7 | `composio_connector_credentials` | multi-row per `(workspace, connector)` — OAuth, not a typed-in token | No tail (there's no token to derive one from; `account_label` is the human-readable field) | per-connector OAuth accounts | Settings → Connectors |
| 8 | `external_mcp_servers` | multi-row per `(workspace, server)` | No per-field tail (`env_names` lists variable NAMES in plaintext; values are one sealed blob) | operator-defined MCP servers | Settings → External MCP |

**Scope split for this page, and why:**

- **Tier 1 — "Deploy & source control" (§4–§7 below).** Stores #1–#2, all seven providers
  (github-pages, vercel, netlify, cloudflare-pages, github, gitlab, bitbucket). This is what the
  owner described verbatim: named, multiple-per-provider, token + Save. Full Create / Replace /
  Remove here.
- **Tier 2 — "Other credentials" (§8).** Stores #3–#8. Single connection per scope (or per-connector,
  but never *named* the way Tier 1 is) — these already have a real Create flow on their own screen and
  gain nothing from a second one. This tier is **read + Replace + Remove + deep link**, matching the
  session-6 decision exactly, because for THESE stores that decision's reasoning fully applies (one
  settings row, one place it's created).

This is also what makes the **partial-inventory disclosure** concrete rather than decorative: if
Tier 2's read wiring doesn't ship in the same pass as Tier 1 (a reasonable phased build — Tier 1 is
the page's actual point, Tier 2 is the "close the inventory gap" follow-through), the page must say so
on screen rather than silently showing 7 providers as if that were the whole install. See §9.

**BYOK/Composio "already flagged broken"** (session-6 handoff) refers to their *consumer* features —
stale model lists, no picker — not to whether the credential row itself is readable. Nothing here
needs those features fixed; a broken model picker doesn't stop this page from truthfully reporting
"Composio project key — saved 2026-08-10."

**The GitHub trap, stated once so it isn't silently mis-solved:** "GitHub" is not one credential.
`github-pages` (store #1, write access for publishing) and `github` (store #2, source-control read/
write) are two different tables, two different scopes, two different tokens an operator has to create
separately on GitHub's own site. Typing "GitHub" into the search box must surface BOTH — see §6 — but
they render as two clearly-labeled subsections ("GitHub Pages · Publishing" / "GitHub · Source
Control"), never merged into one card. A merged card is exactly the "github-pages vs github mismatch a
naive reuse gets silently wrong" trap the session-6 handoff names directly.

---

## 2. Page & nav

New top-level Operations panel, same shell every built Operations screen already uses
(`Deployment.tsx`, `SourceControl.tsx`):

```
.page
├── .page-header            (kicker "Operations", title "Security", description)
├── TabBar                   (one real tab today: "Access Tokens")
└── <tab content>
```

**Nav registration** (`panels.tsx`) — informational for Programmer, not mine to touch: place it
directly after Source Control, ahead of the two `soon: true` placeholders (Activity Log, Import &
Export) — same reasoning `deployment`'s own comment gives for its position relative to Recovery: this
is a BUILT screen, and it reads the credentials both Deployment and Source Control create, so it
belongs beside them, not buried under two panels nobody can use yet.

```tsx
// panels.tsx — new entry, id "security"
nav: {
  label: "Security",
  group: "Operations",
  // A shield — distinct from Deployment's rocket-launch and Source Control's two-nodes-joined glyph.
  icon: '<path d="M9 2 3.5 4v4.2c0 3.6 2.3 6.4 5.5 7.8 3.2-1.4 5.5-4.2 5.5-7.8V4z"/><path d="M6.7 9.2l1.8 1.8 3-3.4"/>',
}
```

**Page header copy:**

```
kicker:       Operations
title:        Security
description:  One place to see every access token this install holds, and rotate or remove one
              without hunting across the screens that created it.
```

`agentHandle("security-header", { role: "region", label: "Security panel header — every saved
access token in this install, in one place" })` on the `.page-header` div — same convention
`Deployment.tsx`/`SourceControl.tsx` use on theirs.

**TabBar** — one tab today, same `SOURCE_CONTROL_TAB_IDS`-style list-of-one, not padded with a
disabled placeholder for a feature that hasn't been spec'd (Activity Log and Roles & Permissions
already have their OWN top-level nav entries — they are not proposed as sibling tabs here, since
nothing in this brief asks for that and inventing it would be scope creep):

```tsx
const SECURITY_TAB_IDS = ["access-tokens"] as const;
```

```
tab label:  Access Tokens
handle:     security-tab-access-tokens
handleLabel: "Switch to the Access Tokens tab — every saved token across GitHub, Vercel, Netlify,
             Cloudflare Pages, and this install's other connected services"
```

---

## 3. Component split

Per-scope ESLint complexity gate (hard 9/9 cyclomatic/cognitive — `eslint.config.mjs` `F06 option B`)
means this follows `Deployment.tsx`'s own pattern: a thin shell, one file per tab, and every
repeated-branch block pulled into its own named function/component. Proposed files:

```
apps/admin/src/features/security/
  Security.tsx                       — page shell: page-header + TabBar (mirrors SourceControl.tsx)
  security-i18n.ts                   — t()/dictionary, same shape as deployment-i18n.ts
  rules.ts                           — pure helpers: search matching, grouping, tone/label lookups
  security-visuals.tsx               — icons (search, chevron, lock/shield glyphs), no hooks
  AccessTokensTab.tsx                — search bar, partial-inventory notice, provider sections
  hooks/
    use-access-tokens.hooks.ts       — fetch + local CRUD state (mirrors use-publish-credentials.hooks.ts)
    access-tokens-port.hooks.ts      — port interface (DI seam, same convention as every other feature)
    access-tokens-dependencies.hooks.ts
  __tests__/
```

Inside `AccessTokensTab.tsx`, split by the same "extract, don't inline" discipline every file read for
this spec already uses:

- `AccessTokensSearch` — the search input + live match count
- `ProviderGroup` — one provider's card: heading, saved-token rows, "Add another token" affordance
- `TokenRow` — one saved token: name, status, saved-date, Replace/Remove actions (Tier 1 shape)
- `TokenRowFields` — the Name + Access token (+ provider-specific extra field) inputs, shared between
  "add" and "replace" the same way `PublishCredentialFields` is shared between `CredentialStepTodo`/
  `CredentialStepDone` today
- `OtherCredentialRow` — Tier 2's flatter read-only-plus-Replace/Remove row
- `PartialInventoryNotice` — the disclosure banner (§9)
- `RemoveConfirmDialog` — native `<dialog>`, same foundation as `.confirm-dialog`

---

## 4. Layout — populated, one provider expanded

```
┌─────────────────────────────────────────────────────────────────────┐
│ Operations                                                          │
│ Security                                                       H1   │
│ One place to see every access token this install holds, and        │
│ rotate or remove one without hunting across the screens that        │
│ created it.                                                          │
├─────────────────────────────────────────────────────────────────────┤
│ [ Access Tokens ]                                          tab-bar  │
├─────────────────────────────────────────────────────────────────────┤
│ 🔍 Search by provider, name, or purpose            "GitHub"    ✕    │
│                                              3 of 9 tokens matching  │
├─────────────────────────────────────────────────────────────────────┤
│ ▸ Deploy & source control                                            │
│                                                                       │
│  ── GitHub Pages · Publishing ──────────────────────────────────    │
│  ●  Production                    ● connected · saved Aug 10   ⌄    │
│  ●  30-day test token             ● connected · saved Aug 14   ⌄    │
│  [+ Add another GitHub Pages token]                                  │
│                                                                       │
│  ── GitHub · Source Control ────────────────────────────────────    │
│  ○  Not connected                                        [Connect]  │
│                                                                       │
│  ── Vercel ──────────────────────────────────────────────────────   │
│  ○  Not connected                                        [Connect]  │
│                                                                       │
│  ── Netlify ─────────────────────────────────────────────────────   │
│  ○  Not connected                                        [Connect]  │
│                                                                       │
│  ── Cloudflare Pages ────────────────────────────────────────────   │
│  ○  Not connected                                        [Connect]  │
│                                                                       │
│  ── GitLab ──────────────────────────────────────────────────────   │
│  ○  Not connected                                        [Connect]  │
│                                                                       │
│  ── Bitbucket ───────────────────────────────────────────────────   │
│  ○  Not connected                                        [Connect]  │
│                                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ ▸ Other credentials                                                  │
│  (Tier 2 rows — §8)                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

Class names (new file `apps/admin/src/styles/access-tokens.css`, header comment matching
`source-control.css`'s own convention — draws on `styles.css` tokens, reuses `.card`, `.field*`,
`.status*`, `.notice*`, `.page*`, redefines nothing):

```css
.access-tokens-tab { display: flex; flex-direction: column; gap: var(--space-5); }

.access-tokens-search { position: relative; display: flex; flex-direction: column; gap: var(--space-1); }
.access-tokens-search-input {
  width: 100%; padding-left: 2.25rem; /* room for the icon */
}
.access-tokens-search-icon {
  position: absolute; left: 0.7rem; top: 0.6rem; color: var(--faint); pointer-events: none;
}
.access-tokens-search-count { font-size: var(--text-xs); color: var(--muted); }

.access-tokens-tier { display: flex; flex-direction: column; gap: var(--space-4); }
.access-tokens-tier-title {
  margin: 0; font-family: var(--font-display); font-size: var(--text-lg); font-weight: 700; color: var(--fg);
}

.access-tokens-provider-group { display: flex; flex-direction: column; gap: var(--space-2); }
.access-tokens-provider-heading {
  margin: 0; font-size: var(--text-sm); font-weight: 600; letter-spacing: 0.02em;
  color: var(--muted); text-transform: uppercase;
}
/* The subtitle naming WHICH purpose this credential is for — required whenever a provider name
   (GitHub) covers more than one store (github-pages vs github). Omitted for single-purpose
   providers (Vercel, Netlify, Cloudflare Pages) — see this file's own header on the GitHub trap. */
.access-tokens-provider-purpose { font-weight: 400; text-transform: none; color: var(--faint); }
```

Row shell reuses the accordion idiom already proven on Source Control/Static Site (`<details>`,
native disclosure, one visible expand affordance):

```css
.access-tokens-row {
  display: flex; flex-direction: column; gap: var(--space-3);
  padding: var(--space-4); background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
}
.access-tokens-row-done { background: var(--surface-2); }
.access-tokens-row-summary {
  display: flex; align-items: center; gap: var(--space-3); cursor: pointer; list-style: none;
  font-size: var(--text-sm); color: var(--fg-2);
}
.access-tokens-row-summary::-webkit-details-marker { display: none; }
.access-tokens-row-marker {
  display: grid; place-items: center; flex-shrink: 0;
  width: 1.75rem; height: 1.75rem; border-radius: 50%;
  background: var(--surface-2); border: 1px solid var(--border-strong); color: var(--fg-2);
}
.access-tokens-row-marker-done {
  background: var(--ok-solid, var(--ok)); border-color: var(--ok-solid, var(--ok));
  color: var(--ok-solid-ink, oklch(99% 0 none));
}
.access-tokens-row-name { font-weight: 600; color: var(--fg); }
.access-tokens-row-summary-expand {
  display: inline-flex; align-items: center; gap: var(--space-1); flex-shrink: 0; margin-left: auto;
  font-size: var(--text-xs); font-weight: 600; color: var(--fg-2);
}
.access-tokens-row-summary-expand svg { transition: transform 0.15s ease; }
.access-tokens-row[open] .access-tokens-row-summary-expand svg { transform: rotate(180deg); }
.access-tokens-row .access-tokens-row-fields { padding-left: calc(1.75rem + var(--space-3)); }
```

This is a direct, deliberate visual rhyme with `.source-control-row`/`.deployment-step` — same
bordered-surface-vs-quiet-surface contrast, same disclosure chevron + text-label pairing (never a bare
clickable row — that was the exact defect `DisclosureChevron`'s own doc records being caught and
fixed). Not a shared import (this page owns its own CSS file, same boundary Source Control drew
against Deployment for the same "built by different agents concurrently" reason) — a rhyme, not a
dependency.

**Fields inside an open row** — single-column `.field`/`.field-group` stack, **never** `.field-row`'s
two-up grid, for the identical reason `PublishCredentialFields`'s own doc gives (uneven hint heights
break the grid — Cloudflare Pages' Account ID field is the concrete example already living in this
codebase, and Tier 1 rows here add a **Name** field with its OWN hint on top of that):

```
┌ Name ──────────────────────────────────┐
│ [ Production                        ]  │
│ A short label so you can tell this     │
│ token apart from others for the same   │
│ provider.                              │
├ Access token ───────────────────────────┤
│ [ ••••••••••••••••••••••••••••••••  ]  │
│ Stored encrypted on the server. Once   │
│ saved, Tovu never displays it again.   │
│ Needs a classic personal access token  │
│ with the "repo" scope, or a            │
│ fine-grained token with Contents and   │
│ Pages permissions set to Read and      │
│ write. Create a token ↗                │
└──────────────────────────────────────────┘
[ Save ]
```

The Access token field's hint text is the SAME `scopeGuidanceKey` string already defined per provider
in `deployment/rules.ts`'s `PUBLISH_CREDENTIAL_PROVIDERS` / `source-control/rules.ts`'s
`SOURCE_CONTROL_PROVIDERS` — reused verbatim, not reworded, since that copy was itself an
owner-narrowed pass (both files' own headers record this). This page's `rules.ts` should import or
mirror those exact strings rather than drafting new guidance a second time.

---

## 5. The Name field — new, and worth being precise about

This is the one genuinely new input Tier 1 introduces (Static Site/Source Control never asked for a
name — they only ever wrote `PUBLISH_CREDENTIAL_ROW_LABEL`, a fixed constant). It maps directly to the
`label` column already in the schema (`publish_credential_sets.label` / `source_control_credential_
sets.label`, `UNIQUE (workspace_id, provider_id, label)`).

- Label: **Name**
- Placeholder: none (placeholder-as-label is the exact defect this codebase already fixed twice —
  Static Site's credential form, Source Control's credential form; do not reintroduce it here)
- Hint (`.field-hint`): "A short label so you can tell this token apart from others for the same
  provider."
- Validation: non-empty, and unique against this provider's OTHER saved names — surfaced as a
  `.field-error` under the input ("A token named '{name}' already exists for {provider}."), not a
  toast, so it stays anchored to the field that caused it.
- Auto-generated names for already-migrated rows (brief's own requirement — existing tokens must look
  right without a rename step): render as **"{Provider} token"** (e.g. "GitHub Pages token") for a
  workspace's first-ever row per provider, and **"{Provider} token 2"**, **"{Provider} token 3"** for
  any additional legacy rows a migration produces (unlikely today — every current provider is
  single-row — but the naming scheme should not collide if migration ever runs against >1 row). This
  is a **display default**, not a placeholder: it is written into `label` at migration time and edits
  like any other saved name from then on — never grey placeholder text sitting in the box.

---

## 6. Search

Reuses the one existing search-input precedent in this app (`Playground.tsx`'s `.playground-search` /
`type="search"` / "N of M" counter idiom) rather than inventing a second pattern:

```tsx
<label className="visually-hidden" htmlFor="access-tokens-search">
  Search access tokens
</label>
<input
  id="access-tokens-search"
  className="access-tokens-search-input"
  type="search"
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  placeholder="Search by provider, name, or purpose"
/>
```

**What it matches** (state on screen, don't leave it a guess — same lesson `Playground`'s own empty
state names its exact three fields): provider label ("GitHub", "GitHub Pages", "Cloudflare Pages"),
purpose subtitle ("Publishing", "Source Control"), and the token's own Name field ("Production",
"30-day test token"). Typing "github" matches BOTH GitHub Pages and GitHub·Source Control sections —
this is the concrete behavior behind the owner's "you type GitHub and it shows up" example, and it is
exactly why §1's two-subsection rendering under one heading matters: a single flat "GitHub" card could
not honestly hold two different credentials with two different scopes.

**Match count**, live-region text above the results (same role the Playground counter plays):
- No query: `"9 tokens across 8 providers"` (count every SAVED row, not every possible provider slot)
- Query active, matches found: `"3 of 9 tokens matching “github”"`
- Query active, zero matches: handled by the empty state below, not the counter line

**No-matches empty state** (`.empty-state`, same block Media/Playground already use):

```
No token matches "azure"
Search runs over provider, purpose, and token name — try "GitHub" or "Cloudflare".
```

---

## 7. States — Tier 1 row (`TokenRow`)

Per `components-and-states.md`'s required matrix:

| State | Visual |
|---|---|
| **Not connected** (no saved rows for this provider) | One quiet row: empty ring marker (`.access-tokens-row-marker`, no glyph), "Not connected" text, a single `[Connect]` button — this IS the add-first-token action, not a separate flow; opens the same `TokenRowFields` an "Add another" click would |
| **Connected, collapsed** | Filled-checkmark marker, Name as the primary text, `.status status-ok` "Connected" pill, "saved {date}" — same phrasing `CredentialStepDone`/`SourceControlRowSummary` already use ("token stored, encrypted" — never "updated", see §11), chevron + "Replace token" at the row's end |
| **Connected, expanded (Replace)** | `TokenRowFields` open below the summary, current Name pre-filled (name IS re-readable — it's plaintext, unlike the token), Access token field blank with the "leave blank to keep the current token" hint |
| **Default indicator** (only shown when a provider has ≥2 saved tokens) | A small `.status status-neutral` "Default" pill next to whichever row is `isDefault`, plus a plain-text `[Make default]` link on every OTHER row in that group — see §7a |
| **Saving** | Save button label swaps to "Saving…", disabled, same `busy` idiom every other credential form in this app uses |
| **Save failed** | `.save-error` paragraph under the Save button, `role="alert"` |
| **Adding another** | "Add another {provider} token" ghost-style link/button under the group's existing rows — opens a blank `TokenRowFields` block in place, same shape a not-connected row's fields take |
| **Remove** | `RemoveConfirmDialog` (§7b) |

### 7a. Default selection

This is the UI surface for the `isDefault` mechanic that already exists server-side (§1) but has never
been exposed. Only rendered once a provider has 2+ saved tokens — a single-token provider has nothing
to choose between, and showing a "Default" pill on a lone row would read as an unexplained label.

```
●  Production                    [Default]        ● connected · saved Aug 10   ⌄
●  30-day test token         [Make default]        ● connected · saved Aug 14   ⌄
```

`[Make default]` is a `.link-button` (the existing borrowed-link-styled-as-button primitive,
`styles.css` — not a filled button; this is a low-frequency, reversible, non-destructive action and
should not compete visually with Save/Remove). Clicking it is an immediate write (no confirm dialog —
promoting a default is safely reversible by promoting a different one back), with the row's own
`saving`/`error` state covering the request the same way Save does.

### 7b. Remove — "Remove from Tovu," never "Revoke"

Native `<dialog>`, same `.confirm-dialog` foundation the app already has (`styles.css:2874` —
`[open]`-scoped `display`, per that class's own documented trap: an unscoped `display` rule on a bare
`dialog` class always wins over the UA `dialog:not([open]) { display: none }` regardless of
specificity, so `display: flex` MUST live only on `.confirm-dialog[open]`, never on the bare class).

```
┌─────────────────────────────────────────┐
│ Remove "Production" from Tovu?           │  <h2>
│                                           │
│ This deletes Tovu's saved copy of this   │  .confirm-dialog-body
│ GitHub Pages token. It does NOT revoke   │
│ the token on GitHub — it stays valid     │
│ there until you revoke it yourself.      │
│                                           │
│ Revoke it on GitHub ↗                    │
│                                           │
│              [ Cancel ]  [ Remove from Tovu ] │  .confirm-dialog-actions
└─────────────────────────────────────────┘
```

- Trigger button (inside the expanded row, beside Save): `.btn-danger`, label **"Remove from Tovu"** —
  never "Delete", never "Revoke". This is the load-bearing copy constraint from the brief and the
  original spec; it is not a style choice, it asserts a fact about what the button does.
  `revocation`, not deletion, is what actually invalidates a credential at the provider — Tovu's row
  is a cached secret, not the secret's source of truth.
- Body copy explicitly separates "removed here" from "revoked there," per provider — the link target
  is each provider's own `tokenPageUrl`/revocation page (already defined per provider in
  `rules.ts`'s `PUBLISH_CREDENTIAL_PROVIDERS`/`SOURCE_CONTROL_PROVIDERS` — reuse those, they already
  point at each provider's token-management page, which for every one of the seven Tier 1 providers
  IS the same page revocation happens from).
- If this row is the group's `isDefault`, removing it triggers the SAME promotion rule the server
  already implements (`publish-credentials/store.ts`: deleting the default promotes the
  most-recently-updated remaining row) — the dialog does not need its own copy about this UNLESS it's
  the LAST row for that provider, in which case add one line: "This is the only saved {Provider}
  token — after removing it, nothing here will be marked as connected."
- Confirm button `agentHandle`: **do not tag it.** Deleting a credential is exactly the class of
  action `StaticSiteTab.tsx`'s own boundary already draws around credential-entry fields (no
  `data-agent-element` read/act surface) — an agent should not be able to drive "Remove from Tovu"
  through page automation any more than it can read or write the token itself. The row's SUMMARY
  (name, provider, connected/saved-date) stays tagged, matching every other credential row in this
  app; the destructive action inside it does not.

---

## 8. Tier 2 — "Other credentials" (single-row stores)

Flatter than Tier 1 — no accordion-per-row disclosure needed since there's exactly one row per
provider and no Name field to show (these were never named). One line per credential:

```
┌─────────────────────────────────────────────────────────────────┐
│ Admin AI Assistant (BYOK)              ● connected · ••••7f2a    │
│ Your own model key for this admin's assistant dock.              │
│                                          saved Aug 9              │
│                              [ Manage on AI Assistant ↗ ]  [Remove from Tovu]│
└─────────────────────────────────────────────────────────────────┘
```

- **Value display**: bare `••••{tail}` text, no reveal control (there is nothing behind it to reveal
  — see §10). Rendered only for the three stores that actually carry a tail (`masked`/`keyTail`:
  site_assistant_credentials, admin_execution_credentials, media_provider_credentials,
  composio_config — four, not three; corrected count matches §1's table). Every other Tier 2 store
  (composio_connector_credentials, external_mcp_servers) shows a fact instead of a tail:
  `composio_connector_credentials` shows `account_label` ("Connected as: {label}"); `external_mcp_
  servers` shows which env variable NAMES are set (`env_names`, already plaintext — "3 environment
  variables set") since there is no single "the token" to characterize.
- **Deep link**: `[ Manage on {screen} ↗ ]` — a real link to the owning screen (Settings → AI,
  AI Assistant dock, Media → Media providers, Settings → Connectors, Settings → External MCP), always
  present, since Create for these lives there and nowhere else.
- **Remove** — same `.btn-danger` "Remove from Tovu" + confirm dialog as Tier 1, no Replace action
  (Replace for a single-row store IS "go create a new one there," which the deep link already covers
  — adding a Replace form here would be the second-entry-point problem the session-6 handoff actually
  warns about, for THESE stores specifically).

---

## 9. Partial-inventory disclosure

Required by the brief regardless of how much of §1's 8-store inventory ships in the first pass. Sits
directly under the search bar, above the tier sections, `.notice.warning` (existing class,
`--warning`/`--warning-bg` tokens already in `styles.css`):

```
⚠ Showing 7 of 8 known credential stores. External MCP server credentials aren't listed here yet —
  manage them on Settings → External MCP.
```

- Only rendered when the page's own read coverage is genuinely partial — never a static disclaimer
  left on screen after full coverage ships (that would be the inverse defect: crying wolf about a gap
  that's already closed). Driven by a real flag the hook reports (`coverageComplete: boolean` +
  `missingStores: string[]`), not a hardcoded string this component owns.
- Distinct from the BYOK/Composio "flagged broken" note — that is about THOSE features' OWN
  functionality being unreliable, not about this page's read coverage. If Tier 2 fully reads all six
  of its stores, no warning renders even though BYOK/Composio remain broken elsewhere; the row itself
  still displays correctly (§8) with no asterisk needed — reading a row and using the feature it
  configures are different claims.
- `agentHandle("security-partial-inventory-notice", { role: "status", label: "..." })` — an agent
  asking "what secrets does this install hold" needs the same honesty a human reader does; this is
  exactly the kind of fact `data-agent-element` exists to make legible on the page rather than only in
  a comment.

---

## 10. The token-value display decision

**Never build a reveal-to-plaintext control anywhere on this page.** This isn't a security posture
being chosen for this page in isolation — it's a fact about what every one of the eight stores
actually returns:

- `publish_credential_sets` / `source_control_credential_sets`: **no masked tail at all**, by explicit
  design (schema.ts:1461 — Terra's recommendation, "not even storing a last-4 keeps zero
  token-derived material outside the sealed blob"). §4's Access token field, once saved, shows no
  value — just the connected/saved-date summary. There is nothing to mask because nothing but the
  sealed ciphertext exists server-side.
- `site_assistant_credentials` / `admin_execution_credentials` / `media_provider_credentials` /
  `composio_config`: return a **precomputed last-4** (`masked`/`keyTail`), and that's ALL they ever
  return — the full value is never sent to the client, sealed or not. §8's `••••{tail}` is the ceiling
  of what's showable, not a truncated view of something more that a "reveal" button could fetch.

So "reveal" is never a UI restraint being exercised — it's a capability that doesn't exist one layer
down. Do not spec an eye-icon toggle, do not spec a "show token" affordance, and if an implementer
asks whether one should be added: the answer is a schema change (storing plaintext or a longer
recoverable fragment somewhere), not a component prop, and that's a security decision several tiers
above a visual spec.

**Agent-facing boundary**: `agentHandle()` labels on every row in this page describe the FACT of
connection (provider, name, saved date) and must never restate a masked tail even where one exists to
show a human. A masked tail visible in a `data-agent-element` label is visible to any agent reading
this page the same way it's visible to a human looking at the screen — the four characters it reveals
are a smaller secret than the full token, but they are still secret-derived material an agent has no
task-relevant reason to read. This mirrors the boundary `StaticSiteTab.tsx`'s own token `<input>`
already draws (no `data-agent-element` read surface over the field's VALUE, only over the surrounding
region) — extended here to the visible tail text too, since Tier 2 is the first place on this page
that has one to leak.

---

## 11. Copy — exact strings

| Context | Copy |
|---|---|
| Page title | Security |
| Page description | One place to see every access token this install holds, and rotate or remove one without hunting across the screens that created it. |
| Tab label | Access Tokens |
| Search placeholder | Search by provider, name, or purpose |
| Search a11y label | Search access tokens |
| Match count (no query) | {N} tokens across {M} providers |
| Match count (query) | {N} of {M} tokens matching "{query}" |
| No-match empty state title | No token matches "{query}" |
| No-match empty state body | Search runs over provider, purpose, and token name — try "GitHub" or "Cloudflare". |
| Tier 1 heading | Deploy & source control |
| Tier 2 heading | Other credentials |
| Name field label | Name |
| Name field hint | A short label so you can tell this token apart from others for the same provider. |
| Not-connected row | Not connected |
| Connect button | Connect |
| Add-another link | Add another {provider} token |
| Connected summary | {Name} · token stored, encrypted · saved {date} |
| Default pill | Default |
| Make-default link | Make default |
| Replace affordance | Replace token |
| Remove button | Remove from Tovu |
| Remove dialog title | Remove "{name}" from Tovu? |
| Remove dialog body | This deletes Tovu's saved copy of this {provider} token. It does NOT revoke the token on {provider} — it stays valid there until you revoke it yourself. |
| Remove dialog link | Revoke it on {provider} ↗ |
| Remove dialog, last-row variant (append) | This is the only saved {provider} token — after removing it, nothing here will be marked as connected. |
| Deep-link (Tier 2) | Manage on {screen} ↗ |
| Partial-inventory notice | Showing {N} of 8 known credential stores. {missing list} aren't listed here yet — manage {them/it} on {screen(s)}. |
| Name uniqueness error | A token named "{name}" already exists for {provider}. |

Every string that names a provider (`{Provider}`, `{Provider Pages}`) carries `translate="no"` on its
`<span>`, matching every other provider-name mention across `StaticSiteTab.tsx`/`ProvidersTab.tsx` —
"GitHub" is not a word to localize.

---

## 12. Accessibility

- **Heading structure**: `<h1>` page title (from `.page-title`), `<h2>` per tier ("Deploy & source
  control" / "Other credentials"), `<h3>` per provider group heading is NOT used — provider headings
  (`.access-tokens-provider-heading`) are visual labels over a group of rows, not a third heading
  level a screen-reader user would want to jump between (there are up to 7 of them in Tier 1 alone;
  treating each as a heading would make "navigate by heading" on this page noisier than useful). This
  is a deliberate departure from `HistoryTab.tsx`'s own finding ("a tab panel had no heading
  structure at all") — that finding was about a panel with ZERO structure; this page has real `<h1>`/
  `<h2>` landmarks, and the provider labels are `role="presentation"`-adjacent text, not missing
  headings.
- **Tabs**: `TabBar`'s existing `role="tablist"`/`role="tab"`/`aria-selected` — no new work, this page
  reuses the primitive verbatim.
- **Search input**: `<label className="visually-hidden" htmlFor="access-tokens-search">Search access
  tokens</label>` — never placeholder-as-label (§6 shows the placeholder is a HINT, the label is
  separate and visually hidden, same pattern `Playground.tsx` already uses).
- **Accordion rows**: native `<details>`/`<summary>` — keyboard operable by default (Enter/Space
  toggles), no custom JS needed, matching `.source-control-row`/`.deployment-step-done`.
- **Live regions**: match count (`role="status" aria-live="polite"`, same as `CopyLine`'s "Copied!"
  swap elsewhere in this app), save-error (`role="alert"`), partial-inventory notice
  (`role="status"`).
- **Color**: connected/default state never rely on color alone — filled marker + checkmark glyph
  (Tier 1) or explicit "Connected"/"Default" text (both tiers), matching `CapabilityMark`'s own
  documented rule.
- **Focus**: Remove confirm dialog uses native `<dialog>`'s built-in focus trap and returns focus to
  the trigger on close/cancel — same guarantee `.confirm-dialog`'s existing callers already get for
  free from the element, not from bespoke JS.
- **Contrast**: every color used here (`--ok`, `--warning`, `--danger`, `--muted`, `--faint`,
  `--fg`/`--fg-2`) is an EXISTING token already measured for AA in `styles.css`'s own token-block
  comments — nothing new is introduced, so nothing new needs re-measuring.

---

## 13. `agentHandle()` tagging plan

Grepped `agentHandle(` across `StaticSiteTab.tsx`/`ProvidersTab.tsx`/`TabBar.tsx` for the live
convention (24 call sites in `StaticSiteTab.tsx` alone) — this page follows it exactly:

| Element | handle | role | label |
|---|---|---|---|
| `.page-header` | `security-header` | region | Security panel header — every saved access token in this install, in one place |
| TabBar container | `security-tab-bar` | region | (ariaLabel) |
| Access Tokens tab button | `security-tab-access-tokens` | button | Switch to the Access Tokens tab — every saved token across GitHub, Vercel, Netlify, Cloudflare Pages, and this install's other connected services |
| Search input | `security-access-tokens-search` | field | Search saved access tokens by provider, name, or purpose |
| Partial-inventory notice | `security-partial-inventory-notice` | status | States which credential stores this page does not yet read from |
| Each provider group | `security-access-tokens-group-{providerId}` | region | {Label}'s saved access tokens — {N} connected |
| Each Tier 1 row (summary only, never the fields) | `security-access-tokens-row-{providerId}-{tokenId}` | region | {Name} — {Provider}, {connected/not connected} |
| Name field | `security-access-tokens-name-{providerId}-{tokenId}` | field | This token's display name |
| Token field | **not tagged** | — | matches `StaticSiteTab.tsx`'s existing boundary — no `data-agent-element` on the value input itself |
| Save button | `security-access-tokens-save-{providerId}-{tokenId}` | button | Save this {Provider} token |
| Make-default link | `security-access-tokens-default-{providerId}-{tokenId}` | button | Make {Name} the default {Provider} token |
| Remove trigger | **not tagged** | — | destructive action, same boundary as the token field (§7b) |
| Remove confirm dialog | **not tagged** | — | same reasoning |
| Tier 2 row | `security-other-credentials-row-{store}` | region | {Label} — {connected/not connected}, no masked value in the label even when one is shown on screen (§10) |
| Tier 2 deep link | `security-other-credentials-manage-{store}` | link | Open {screen} to manage this credential |

---

## 14. The tab-bar wrap fix — sign-off

Read `.tab-bar`/`.tab-bar-item` at `styles.css:1927` directly (already in the working tree as an
uncommitted change — `flex-wrap: wrap` is live, not merely proposed). Confirmed it does what a wrapped
two-row tab bar needs without further changes:

- `gap: 0.3rem` between items in both axes (row gap and column gap use the same value with `flex-wrap`
  — no separate row-gap rule needed).
- `border-bottom: 1px solid var(--border)` sits on the CONTAINER (`.tab-bar`), not per-item, so a
  second wrapped row does not draw a second horizontal rule under itself — the container's one border
  still reads as the shelf every tab sits on, wrapped or not.
- Selected-indicator (`border-bottom-color: var(--accent-text)` on `.tab-bar-item[aria-selected=
  "true"]`) is per-item and 2px, unaffected by wrapping — it will correctly render under whichever row
  the active tab lands on.
- `flex-shrink: 0` on `.tab-bar-item` is what actually makes wrap trigger instead of squeeze — already
  present, and the CSS comment directly above it (styles.css:1925) explains this was hard-won.

**Nothing to add for Security's own tab bar** — it has one tab today, so wrapping never engages; this
section exists because the brief asked how a wrapped bar should look across Media/Pages/ThemeExplore/
Source Control, and the honest answer, having read the rule, is that it already looks right. The one
thing worth flagging: `.tab-bar-dot` (the connected-provider indicator `StaticSiteTab.tsx` introduced)
has `flex-shrink: 0` and sits inline before the label — confirmed it does not fight the wrap, since the
dot is inside the same flex item as its label, not a sibling the row could wrap between.

---

## 15. Publish outcome surface — three states, replacing "Done."

Read `Jini packages/ui/src/features/mcp-ui/surfaces/document.ts` directly. Current shape:
`DEFAULT_SURFACE_STATUS_TEXT.done = 'Done.'`, written into `.mcpui-status[data-state="done"]`
(`role="status" aria-live="polite"`, `renderStatusRegion()`). No dedicated publish-outcome builder
exists yet in this package — this is genuinely new work, not a redesign of something built.

**This file lives in the Jini repo (`/Users/la/Programming/Jini`), not Tovu — I did not touch it (I'm
read-only in Tovu and have no mandate over a separate repo either). What follows is a spec for
whoever builds it there**, written against that file's real token/class system so it drops in without
translation.

The frame is 640px max-width, no host stylesheet reachable (`SURFACE_CSP`'s `default-src 'none'`), and
must survive the "narrow docked chat pane" width the brief names — every rule below is already
written mobile-first in the existing `SURFACE_BASE_CSS` (`.mcpui-details` is a 2-column grid with
`minmax(0, 1fr)`, already wrap-safe; nothing here needs a breakpoint).

### Succeeded

```
┌──────────────────────────────────────────┐
│ Published                                  │  .mcpui-title
│ Your site is live.                          │  .mcpui-description
│                                              │
│ Published to        github-pages            │  .mcpui-details (dt/dd)
│ Live at             leonaburime-ucla.github.io/tovu-demo/  │
│                                              │
│ [ Open the live site ↗ ]                    │  .mcpui-actions, primary
└──────────────────────────────────────────┘
```

`data-state="succeeded"` (new value, alongside existing `idle`/`working`/`done`/`failed`/`invalid`) —
`.mcpui-status[data-state="succeeded"] { color: var(--jini-mcpui-text-strong); }` (same treatment
`"done"` already gets; this state fully replaces `"done"` for the publish flow specifically, "done"
stays for every other surface's generic ack). The live URL renders as a REAL clickable action, not
inline text — a URL alone in a status line is easy to miss inside a 640px frame; the button is the
thing that actually answers "did it work."

### Failed

```
┌──────────────────────────────────────────┐
│ Publish failed                              │  .mcpui-title
│                                              │
│ GitHub rejected the push: the token for     │  .mcpui-warning (repurposed as
│ this repository has expired.                │   the error container — see below)
│                                              │
│ Go to Security → Access Tokens to           │
│ replace the token, then try again.          │
└──────────────────────────────────────────┘
```

`data-state="failed"` already exists and is already styled `color: var(--jini-mcpui-danger)` on
`.mcpui-status` — reused as-is for the status line's own short summary ("Publish failed."). The BODY
detail (the actual reason, and what to do about it) goes in `.mcpui-warning`, which already exists in
this file (`border: 1px solid var(--jini-mcpui-danger); background: var(--jini-mcpui-danger-tint)`) —
correctly reused here since this genuinely IS an error, unlike the "partial" case below. **Actionable**
means naming the specific next step, not "an error occurred" — if the underlying error is an expired
credential, say so and point at where to fix it (this Security page, once it ships, is the natural
target for that pointer).

### Partial (uploaded but not yet reachable)

```
┌──────────────────────────────────────────┐
│ Uploaded, not live yet                      │  .mcpui-title
│ The files reached GitHub Pages, but the     │  .mcpui-description
│ site isn't serving them yet — this can      │
│ take a few minutes on a first publish.      │
│                                              │
│ Published to        github-pages            │  .mcpui-details
│ Will be live at      leonaburime-ucla.github.io/tovu-demo/ │
│                                              │
│ [ Check now ]         [ Open when ready ↗ ] │  .mcpui-actions
└──────────────────────────────────────────┘
```

`data-state="partial"` — **new**, and needs a **new token pair**, since neither the existing
success-toned `text-strong` nor the danger pair is honest here (an amber-on-danger frame reads as an
error the reader doesn't have, and plain `text-strong` doesn't distinguish this from a clean success).
Proposed, following the exact derivation pattern the danger pair already uses in `tokens.ts`:

```ts
// SURFACE_TOKENS (light) — new base entries
'--jini-mcpui-warning': '#a87614',
// SURFACE_TOKENS_DARK — new base entries
'--jini-mcpui-warning': '#d9a740',
// DERIVED_TOKENS — new, same color-mix formula danger already uses
'--jini-mcpui-warning-tint': 'color-mix(in srgb, var(--jini-mcpui-warning) 10%, transparent)',
```

```css
.mcpui-status[data-state="partial"] { color: var(--jini-mcpui-warning); }
```

The detail block for this state reuses `.mcpui-warning`'s STRUCTURE with the new token in place of
danger:
```css
.mcpui-notice-partial {
  margin: 14px 0 0; padding: 9px 11px; border-radius: var(--jini-mcpui-radius-md);
  border: 1px solid var(--jini-mcpui-warning); background: var(--jini-mcpui-warning-tint);
  color: var(--jini-mcpui-text-strong);
}
```
(A new class rather than overloading `.mcpui-warning` with a third color via a modifier, since
`.mcpui-warning` is already used elsewhere in this package for confirmation-dialog "this is
irreversible" copy — repainting it conditionally would risk an existing caller picking up the wrong
tone by accident.)

Two actions, not one: **"Check now"** (re-polls the same status check `StaticPublishController.
checkPreview()`/publish-poll already performs) is `neutral` variant; **"Open when ready"** is
`primary` but the surface script should NOT disable it — a reader clicking through early just sees a
GitHub Pages "not found yet" page, which is a safe, recoverable outcome, not a broken one worth
gatekeeping behind a spinner.

### Shared rule across all three

The generic `DEFAULT_SURFACE_STATUS_TEXT.done = 'Done.'` string must never be what a reader of a
publish surface sees — the surface's OWN script sets `data-state`/status text directly to one of
`succeeded`/`failed`/`partial` and skips the shared default entirely, the same way any builder already
can (`SurfaceStatusText` is an interface a caller fills in, not a hardcoded string the shell forces).
This is the whole fix: nothing about `renderStatusRegion()`/`SURFACE_SCRIPT_PRELUDE`'s `setStatus()`
helper needs to change, only the publish surface's OWN three-way branch on the tool result needs to
exist, which it currently does not (confirmed: no publish-specific builder file exists in `mcp-ui/
surfaces/` today).

---

## 16. Assumptions and open questions

1. **Vercel included in Tier 1 even though the owner's example only named GitHub/Cloudflare/
   Netlify.** Assumption: an omission of an existing, otherwise-identical provider, not a deliberate
   exclusion — leaving it out would make the page a LESS complete consolidation than Static Site
   already is today. Cheap to reverse (delete one provider-group block) if wrong.
2. **§0's Create-stays-consolidated-here-only reading of the brief vs. the session-6 handoff.** Flagged
   in full at the top rather than buried — this is the one decision in this spec most likely to need
   owner confirmation before Programmer builds against it, because it resolves an apparent conflict
   between two documents rather than following either one verbatim.
3. **Tier 2's exact scope (which 6 stores, in what phase).** I split all 8 stores into two tiers by
   shape (§1), but whether Tier 2 ships in the same pass as Tier 1 is a build-sequencing call, not a
   design one — §9's partial-inventory notice is what makes either sequencing honest on screen.
4. **Security page's nav position** (directly after Source Control) is a recommendation with the same
   reasoning `deployment`'s own panels.tsx comment gives for ITS position, not a settled decision —
   easy for Programmer to place differently if the owner has an opinion once they see it built.
5. **The GitHub Pages/Cloudflare "dropdown to choose which saved token to use"** (brief's own scope
   item) is spec'd only at the visual level here: a new `<select>` in `StaticPublishTargetFields`
   (`StaticSiteTab.tsx`) labeled "Access token," populated from this page's Tier 1 rows for that
   provider, defaulting to whichever is `isDefault`. Wiring it (a new field on `AdminStaticPublishConfig`
   naming a specific credential id, not just resolving the provider's default) is a data-contract
   change outside this spec's fence — Programmer's job, flagged here so it isn't lost.

---

## 17. Phase 2 worklist — my own build order, once Phase 2 opens

Written for myself, not a stranger. `security-tokens` is expected to have created the page shell,
routes, hooks, and CRUD wiring by the time this opens (Phase 1 assumed I'd be styling/restructuring
markup that already fetches and mutates real data, not building the data layer myself — if that
assumption is wrong on restart, check with team-lead before assuming scope grew again). Order below is
"cheapest-to-verify first" so an early item's outcome can correct a later one before I've sunk work
into it.

1. **Look at what actually got built before touching anything.** Open `/admin/access-tokens` (or
   wherever `security-tokens` routed it), read the real component tree and real class names — they
   will not match my proposed `apps/admin/src/features/security/*` file layout in §3 exactly, since
   that was written from the spec side, not the implementation side. Reconcile, don't fight: rename in
   THIS document if the real structure disagrees, rather than forcing the built page to match a spec
   written before it existed.
2. **`apps/admin/src/styles.css:1927` `.tab-bar` — re-verify, don't re-derive.** §14 already concluded
   the live `flex-wrap: wrap` change needs nothing further (container-level border-bottom survives
   wrapping, per-item selected indicator is unaffected, `.tab-bar-dot` doesn't fight the wrap). That
   conclusion was reached by READING the CSS, not by seeing it render. First real Phase 2 action:
   actually look at Media, Pages, ThemeExplore, Source Control, and Deployment's tab bars wrapped to
   two rows in a real browser (narrow the viewport or dock the chat pane to force it) before trusting
   §14 — if reality disagrees with the static read, fix it there, don't leave two contradicting
   answers in this file.
3. **Build `apps/admin/src/styles/access-tokens.css`** per §4's class list — `.access-tokens-tab`
   through `.access-tokens-row-summary-expand`. Reuse tokens only; introduce nothing new (§4 already
   confirms none are needed on the Tovu side).
4. **`TokenRow`/`ProviderGroup`/`TokenRowFields` markup** per §4/§5/§7 — accordion shell first (empty
   states, not-connected state), THEN the open/fields state, THEN Replace/Remove, in that order so
   each stage is checkable against a real screenshot before the next is layered on.
5. **Search** (§6) — wire the existing `.playground-search`-style input against whatever the real
   hook's field list turns out to be; verify the match count string against real data, not the
   assumed "9 tokens across 8 providers" example.
6. **Remove confirm dialog** (§7b) — copy is exact in §11, don't rewrite it live. Verify the
   `[open]`-scoped `display` trap directly (open the dialog, confirm it isn't visible before that,
   the same live check `.confirm-dialog`'s own comment says was needed the first time).
7. **Tier 2 rows** (§8) — only if `security-tokens` actually wired reads for those 6 stores; if not,
   this stays a Phase 3/later item and §9's partial-inventory notice is what covers the gap instead of
   me inventing Tier 2 markup with nothing real behind it.
8. **Accessibility pass** (§12) — do this against the REAL rendered DOM (heading order, tab semantics,
   live regions), not just against this document's intent. A spec saying a live region exists is not
   evidence one was actually wired correctly.
9. **Anything visually wrong I notice along the way that isn't in scope for this page** — log it in a
   new dated section at the bottom of this file rather than silently fixing it inline or silently
   dropping it. Nothing observed yet as of this Phase 1 pass beyond `.tab-bar` (item 2 above); Phase 1
   was a read-only pass through specific files named in the brief, not a full visual audit of the
   admin, so "nothing else found" reflects the narrower Phase 1 scope, not a clean bill of health for
   the whole app.

Not on this list: the Jini `mcp-ui/surfaces/document.ts` work from §15. That is a different repo I
have no write mandate over even in Phase 2 (this dispatch's write access, per team-lead's message, is
`apps/admin/src/styles.css` plus Tovu-side JSX/class changes) — §15 stays a spec for whoever does own
that repo, not a Phase 2 item of mine.

---

## Note to my future self

You have no memory of writing this. The repo has moved on — the Security page exists now and almost
certainly does not look like what's drawn in this document. Below is what won't be obvious from just
re-reading §0–§17: the uncertainty behind the confident-sounding calls, what I tried and threw out,
where I expect the plan to be wrong, and what surprised me about this codebase's CSS. Read this
BEFORE trusting any specific section — it tells you which ones to lean on and which to re-derive.

**Uncertain about, beyond what §16 admits to:**

- §0's whole Create-scope argument rests on ONE observed fact: Static Site/Source Control only ever
  write ONE default row per provider today. If `security-tokens` built something where the page
  itself already does multi-row Create — which is plausible, since I never actually saw their work,
  only inferred it from doc comments written before this session — then §0 is solving a problem that
  no longer exists and you should delete it rather than defend it.
- I don't actually know if "Security page → Access Tokens tab" implies MORE tabs are coming. I read it
  as a list-of-one (matching Source Control's `SOURCE_CONTROL_TAB_IDS = ["providers"]` precedent) but
  the phrasing has the same shape as "Deployment → Static Site tab," which has FOUR siblings. If a
  second Security tab shows up in the built page, that's not drift from my spec, that's the owner
  answering a question I only guessed at.
- Tier 2 (§8 — BYOK, Composio, media provider, external MCP) is MY invention, not the owner's. Their
  literal words only ever named GitHub/Cloudflare/Netlify. I built Tier 2 to satisfy the session-6
  handoff's "eight stores, nothing can answer what secrets does this install hold" framing, which is a
  coordinator's synthesis, not a direct quote. If Tier 2 didn't get built, that might be the RIGHT
  call, not a gap — check whether the owner ever actually saw and reacted to that framing before
  assuming Tier 2 is still wanted.
- "Make default" (§7a) as an immediate write with no confirm — I never checked whether flipping
  `isDefault` has any live side effect (an in-flight publish reading it mid-request, say). If it
  turns out not to be as inert as I assumed, it needs the confirm dialog I deliberately left off.

**Considered and rejected — don't re-litigate these:**

- A `<h3>` per provider group, for a11y purism. Rejected: 7 provider headings plus 2 tier headings
  makes heading-navigation on this page noisier than useful. Provider names are visual labels over a
  row group, not a third heading tier. If this page ever grows to feel like it needs real per-provider
  landmarks, that's a sign the page has outgrown two tiers, not a sign the heading call was wrong.
- `.list-table` instead of the accordion-card shape for token rows. Rejected: `.list-table` is this
  app's dense-read pattern (Posts, Users) and every row here needs to open into a real form
  (Replace). Forcing that into table cells would be a worse fit than reusing the accordion idiom
  Static Site/Source Control already proved out.
- A reveal/eye-icon toggle on Tier 2's `••••{tail}` rows. Rejected hard, not just "not now" — see §10.
  There is nothing behind those four characters to reveal; a toggle button that reveals nothing new is
  a fake affordance, worse than no button.
- One merged "GitHub" card covering both github-pages and github (source control). Rejected explicitly
  — this is the exact trap the session-6 handoff named by hand ("github-pages vs github mismatch a
  naive reuse gets silently wrong"). Don't merge them even if it looks tidier; §1 explains why.
- Building the publish-outcome surface states as Tovu code, since the chat pane that shows them is
  visually part of this admin. Rejected once I actually found the file — `document.ts` lives in the
  Jini repo, a separate package this dispatch (even in Phase 2) has no write mandate over. §15 is a
  spec for someone else, and I nearly missed that boundary because the RENDERED result looks local.

**Where I expect this plan to be wrong, and what to check first:**

- Everything in §3 (file/component names) is almost certainly wrong versus what got built. Don't
  patch around it — read the real tree first (§17 item 1 already says this, it's worth repeating
  because it's the single highest-value five minutes of the restart).
- §14's tab-bar conclusion was reached by reading CSS, never by looking at a rendered wrapped bar.
  It's probably right (the reasoning is sound: container-level border-bottom, per-item selected
  indicator, `.tab-bar-dot` inside the flex item not a sibling) but "probably right from reading" and
  "confirmed" are different claims — don't let §14's confident tone read as verified.
- §7b assumes `.confirm-dialog` (native `<dialog>`, the `[open]`-scoped display trap) is what
  `security-tokens` reused for Remove. If they built a different confirm primitive, adopt THEIRS —
  don't force a second dialog pattern onto a page that already has one working.
- The whole masked-tail table in §1/§10 was read directly from `schema.ts` comments, which are
  unusually trustworthy in this file (they're original author's design rationale, not inferred
  claims) — but re-verify the four "has a tail" stores (`site_assistant_credentials`,
  `admin_execution_credentials`, `media_provider_credentials`, `composio_config`) against whatever the
  real API actually returns by the time Tier 2 gets built. A schema column existing doesn't guarantee
  the route serializing it still includes it.

**What surprised me about this admin's CSS — useful before writing new rules of your own:**

- The `[open]`-scoped `display` trap (an author `display` rule on a bare dialog/details class beats
  the UA `:not([open]) { display: none }` regardless of specificity — origin outranks specificity)
  is independently rediscovered and re-explained in FULL, from scratch, in the comments above
  `.confirm-dialog`, `.image-preview-modal`, AND `.theme-explore-preview-dialog`. Three separate
  authors hit the same live bug and each wrote their own paragraph about it rather than one of them
  linking back to an earlier one. That tells you this fact is genuinely non-obvious even to people who
  already know CSS well — budget for it being non-obvious to you too on restart, and scope `display`
  to `[open]` on the very first pass, not after your own dialog renders open-by-default.
- `--surface: oklch(100% 0 none)` uses the literal keyword `none` for the hue component, not `0` —
  and the file's own comment shows this was a real, shipped, previously-unnoticed bug (pink-tinted
  disabled buttons) before someone worked out why. `color-mix(in oklch, ...)` treats a POWERLESS hue
  (`none`) completely differently from an ordinary hue angle that happens to be zero. Never write
  `oklch(X% 0 0)` for a neutral in this file if it will ever be `color-mix`'d against something with
  real chroma — write `none`.
- `.visually-hidden`'s `top: 0; left: 0` is load-bearing, not a stray reset — without an explicit
  offset, `position: absolute` on an element whose entire ancestor chain is `position: static`
  resolves against the INITIAL containing block (the document), not anywhere near the element's
  visual location. One shared utility class, used 22 times, produced 341px of phantom scroll on ONE
  page before this was diagnosed. If you add a new visually-hidden element anywhere, don't assume its
  positioning is inert just because it's 1px×1px.
- This codebase's CSS comments are themselves a decision log, not just documentation — competing
  agents' claims get cross-checked against each other in-line, owner quotes are reproduced verbatim,
  and reversed decisions say so explicitly ("SUPERSEDED", "INVERTED", with the date and the reason).
  Match that density in `access-tokens.css` rather than writing sparse property-only comments — it's
  clearly a deliberate house style here, not incidental verbosity from any one author.
- The per-scope ESLint complexity gate (hard 9/9 cyclomatic/cognitive, `eslint.config.mjs` `F06 option
  B`) shapes component boundaries as much as design intent does — components like `ExportRunCounts`/
  `ExportRunFailures`/`ProviderCliRow` exist ONLY because an inline `.map()` callback or ternary would
  have pushed their parent over budget, not because they're independently reusable. When splitting
  `TokenRow`/`TokenRowFields`/etc. in Phase 2, expect to hit this gate and expect the "correct" split
  to sometimes look over-fragmented for no visual reason — that's the lint rule talking, not bad taste.

---

## COORDINATOR RULING — §0 Create-scope: ANSWERED, ADOPTED (2026-08-16)

The Phase 1 note-to-self records §0 as the one decision most worth a second look and states the
author did not know whether it was ever weighed in on. It was. Recording it here so the restart does
not re-open it.

**§0's reading is adopted in full.** Static Site and Source Control only ever create ONE default row
per provider, and no UI anywhere today can create a second. The owner's "30-day test token vs
production token" is therefore a request for a multi-row capability that has never been built and has
no other home. The Access Tokens tab owning Create does not reopen the two-entry-point problem,
because there is no second entry point to conflict with — the existing screens keep editing the same
`isDefault` row this page's Replace also edits, and **nothing on them has to be un-built or changed.**

This supersedes the 2026-08-16 session-6 handoff's "Create must stay on the feature flows" line
(`ADS-memory/reports/continuity/2026-08-16-session-6-handoff.md:96`). That decision was made against
the assumption of a single row per provider; §0 shows the assumption no longer holds once multi-row
tokens exist. The owner confirmed Create directly: "Create has to be here. It absolutely has to be
because you have to create the access token and paste it and then save it, or you can replace it, or
you can just remove it so other people who are logging in don't have it."

**The Tier 1 / Tier 2 split is also adopted**, and was relayed to `security-tokens` as its scope
answer before it began building:

- **Tier 1** — full Create / Replace / Remove / default-selection here. Seven providers:
  `github-pages`, `vercel`, `netlify`, `cloudflare-pages`, `github`, `gitlab`, `bitbucket`.
- **Tier 2** — read + Replace + Remove + deep-link only. BYOK x2, media provider, Composio x2,
  external MCP. Single-row settings, not token collections; session-6's reasoning holds for these.

**Also settled:** v1 migrates existing DB rows onto this page with auto-generated names. Nobody
re-pastes a token they already saved, and migration must not break the feature pages that read those
rows today.

### Still genuinely open on restart

§14's tab-bar sign-off, exactly as the note-to-self says — it is a conclusion from READING the CSS at
`apps/admin/src/styles.css:1927`, never from seeing it rendered. Since Phase 1 ended, `security-tokens`
shipped the fix and measured the real defect: with the chat dock open the tab row needs 450px and has
388px at an 800px viewport, so this reproduced at ordinary desktop widths, not only at the 390px
canary. `flex-wrap: wrap` is live and its e2e coverage is in
`development/e2e/deployment-tabbar-scroll.spec.ts` (4 tests, confirmed RED before the fix). Judging
how a wrapped two-row bar actually LOOKS across Media, Pages, ThemeExplore, Source Control and
Deployment remains Phase 2 item 2 and is still unverified visually.

---

## OWNER RULING — page shape: ONE LIST, not two surfaces (2026-08-16)

Supersedes this spec's layout assumption. The §0 tiering **survives**, but as a per-row capability
difference, not as a separate surface. Phase 2 must lay out against this, not against Phase 1's
two-surface reading.

The owner proposed a Security page under Operations with an Access Tokens tab plus a SECOND tab
carrying the Settings-style wrapped icon-tab row, sub-divided `All / Media providers / Operations /
AI`. Presented with the alternative, they chose the alternative:

**One tab. One list. Every credential in the install. The category row is a FILTER on that list.**

```
OPERATIONS
Security

  Access Tokens  |  (future tabs)
  ─────────────

  [ search: github____________ ]

  All   Source control   Hosting   Media   AI   Ops
  ───

  ▸ GitHub               2 tokens      [+ Add]
      prod token          default ▾
      30-day test
  ▸ Cloudflare           1 token       [+ Add]
  ▸ Netlify              — none —      [+ Add]
  ▸ Cloudinary (media)   1 key         [Replace] [Remove]
  ▸ BYOK (AI)            1 key         [Replace] [Remove]
```

Rationale: from a person's point of view a Cloudinary key and a GitHub token are the same kind of
thing — a secret this install holds. Splitting them across two tabs makes someone learn a rule
("is this an access token or an other-credential?") that has no obvious answer and no payoff. One
filtered list has no rule to learn.

**Consequences:**

- **Tier 2 is no longer deferred.** All 8 stores are listed in v1.
- **The "Showing 7 of 8 known credential stores" disclosure is DELETED.** There is nothing to
  disclose once the page shows everything. Do not reintroduce it.
- Tier 1 rows: multiple named tokens, `[+ Add]`, default selector. Tier 2 rows: `[Replace]`
  `[Remove]` + deep-link to where that setting actually lives. Same list, same visual rhythm.
- Categories start from `All / Source control / Hosting / Media / AI / Ops`, `All` default. Every
  store lands in exactly one.

**On the visual reference.** The owner pointed at Settings' wrapped icon-tab row as the look they
want for the filter — that is `SettingsDialogShell` from `@jini-ai/ui`, rendered in page mode by
`apps/admin/src/features/settings/SettingsUi.tsx`. **Borrow the styling, do not adopt the
component.** `apps/admin/src/features/deployment/Deployment.tsx`'s header documents why it was
rejected for a full-page screen: it bundles its own vertical sidebar plus a kicker/title/subtitle
header that fights a page's own `.page-header`. Use `components/TabBar.tsx` for the page's top-level
tab row, and give the category filter its own class rather than overloading `.tab-bar` — it is a
filter control, not a tab bar.

**Also settled since Phase 1:** no migration. Existing rows carry the sentinel label `"default"`
(`PUBLISH_CREDENTIAL_ROW_LABEL` / `SOURCE_CONTROL_CREDENTIAL_ROW_LABEL`, both UI-side constants).
Render a friendly computed name for those at display time and persist a real label only on a
user-initiated rename/replace/create. A write-on-load migration was proposed and rejected: it writes
on read, races on the `(workspaceId, providerId, label)` UNIQUE index, never runs on an install
nobody opens, and fails silently.
