# Embed marker migration — worked example and remaining work

Status as of 2026-08-10, branch `refactor/jini-admin-extraction`, HEAD `83bb623`. Nothing pushed.

**Read this before touching any embed/marker code.** It is the contract, not a summary.

Companion: `embed-type-inventory.md` — why `form` was removed, why `menu` keeps two mechanisms, what
registering a new type costs, and the state of taxonomy and `pages.edit_html`.

---

## The shape

One attribute. JSON. `type` and `id` are ordinary keys, not separate attributes, so adding a key
never requires a new attribute name.

```html
<div data-embed-config='{"type":"partial","id":"nav","current":"index"}'></div>
<nav class="docs-nav" aria-label="Documentation"
     data-embed-config='{"type":"menu","id":"docs-themes-menu","variant":"tree"}'>
  <ul class="menu-list depth-0">
    <li class="menu-item depth-0"><span class="menu-item-label">No docs menu bound yet</span></li>
  </ul>
</nav>
```

Single-quoted attribute, so the JSON's own double quotes need no escaping. The inner content is a
real fallback: when nothing resolves, it stays exactly as authored rather than being blanked.

**Retired, and nothing may reintroduce them:** `data-embed-type`, `data-embed-id`,
`data-embed-variant`, `data-tovu-slot`, `data-slot-variant`, `data-nav-current`.

## The one parser

`src/contracts/core/embeds/marker.ts`. Every consumer calls it; **no consumer writes its own regex.** That is
the whole point — there were four before, and they had already drifted apart.

```ts
import { scanEmbedMarkers, markersOfType, describeRejection } from "#src/contracts/core/embeds/marker";

const { markers, rejected } = scanEmbedMarkers(html);
for (const m of markers) {
  m.type;        // "menu"                     — which resolver
  m.id;          // "docs-themes-menu"         — which instance (string | undefined)
  m.config;      // { type, id, variant: "tree" } — the whole object, read your own keys off it
  m.tag;         // "nav"                      — rebuild the open tag with this
  m.attrs;       // ' class="docs-nav" aria-label="…" data-embed-config=…' — verbatim
  m.whole;       // the full element incl. inner fallback content
  m.index;       // offset in `html`
  m.occurrence;  // 1-based, stable — use for entry_refs fieldPath locators
}
```

`rejected` is the part that matters most. It is never silently empty-on-error.

## Worked example — replacing a marker's content in place

This is the canonical consumer shape. Note it rebuilds the tag from `m.tag` + `m.attrs`, which is
what preserves `class`, `aria-label`, and anything else the theme author put there.

```ts
function injectMenus(html: string, menus: Record<string, readonly Item[]>): string {
  const { markers } = scanEmbedMarkers(html);
  // Right-to-left, so each splice leaves earlier offsets valid.
  return [...markers].reverse().reduce((acc, m) => {
    if (m.type !== "menu" || m.id === undefined) return acc;
    const items = menus[m.id];
    if (items === undefined) return acc;                 // unknown menu: leave the fallback alone
    const inner = m.config.variant === "tree" ? renderTree(items) : renderFlat(items);
    if (inner === "") return acc;                        // resolves to nothing: leave the fallback alone
    const replaced = `<${m.tag}${m.attrs}>${inner}</${m.tag}>`;
    return acc.slice(0, m.index) + replaced + acc.slice(m.index + m.whole.length);
  }, html);
}
```

Two invariants that already cost real bugs this session and must survive:

1. **Unresolved means untouched.** A missing menu, a deleted target, or a render that produces an
   empty string leaves the marker's authored content exactly as-is. An active theme must never show
   an empty nav because a lookup failed.
2. **Rebuild from `m.tag` + `m.attrs`.** Do not synthesize the open tag from `config` alone; you
   will silently drop styling and accessible names.

## Where the complexity ceiling now bites

`apps/admin/**` is gated at **9 cyclomatic / 9 cognitive, as errors** (commit `0ea3596`, 18 files
grandfathered in `development/scripts/admin-complexity-debt.json`). New embed code is expected to
clear 9/9 too — `marker.ts` does. Check any function you write:

```bash
npx eslint <path> --rule '{"complexity":["error",9],"sonarjs/cognitive-complexity":["error",9]}'
npm run check:admin-complexity-drift
```

The usual fix is extracting the branchy part into a named helper, the way `parseMarkerConfig` was
split out of `scanEmbedMarkers` to get it from 10 to 9.

## Canaries — run these first, every time

`src/contracts/core/embeds/__tests__/marker.canary.test.ts`, 9 tests, currently green.

```bash
node --import tsx --test src/contracts/core/embeds/__tests__/marker.canary.test.ts
```

They run against the **real theme files on disk**, not fixtures, because a fixture suite only proves
the parser understands markup its own author wrote. If a canary fails, the migration is wrong and no
consumer-side work is worth doing until it passes.

---

## Done

- 184 markers across 93 theme files consolidated to the single attribute (`b7acc21`).
- `src/contracts/core/embeds/marker.ts` — the shared parser, within 9/9, tsc clean.
- 9 canaries green against real themes.
- **All four consumers rewired onto `scanEmbedMarkers`** (was item 1 below). Their local regexes are
  gone; `static-render.ts` landed in `ffb54fd`.
- **Stored Page content migrated** (`5436508`). See the next section — this was never on the list.
- **`form` removed as an embed type** (`47af7b2`). Rationale and the `menu` decision:
  `embed-type-inventory.md`.
- **Drift check ratcheted** (`83bb623`): a legacy `slots.*.activeAttr` is now a hard failure, and the
  check scans stored Page bodies as well as theme files.
- **`PUT /pages/:id/html` gated on `content.write`** (`ee7af59`) — it previously had no authz at all.

## The gap that was never on this list: stored content

**Page bodies live in the database, and the sweep only ever touched disk.** `posts.body_html` in
`content.db` still carried the retired vocabulary long after every theme file was clean, and nothing
reported it — a retired attribute is invisible to the shared parser, so such an embed does not
render as broken, it renders as an inert empty `<div>`.

This was not theoretical. Page `glassmorphic-landing` carried
`<div data-embed-type="form" data-embed-id="…">` and its contact form had silently stopped
rendering. Confirmed by curling the live site before the fix (raw marker markup came back, no form)
and after (a real `<form action="/forms/contact-us/submit">`).

Closed by `development/scripts/migrate-page-embed-markers.ts` — dry-run by default, idempotent,
prints reversal SQL, refuses to write a body the shared parser rejects, and reports BLOCKED rather
than guessing when a `form` marker has no `contact-form` widget to migrate onto. `entry_refs` is
re-extracted for every html-format page, because the locator format itself changed
(`bodyHtml[data-embed-type=form#1]` → `bodyHtml[embed:widget#1]`).

**The lesson worth carrying: a marker-vocabulary change is a CONTENT migration, not only a code
one.** Any future change to the spine has to ask what is already stored. `check:embed-marker-drift`
now scans the database for exactly this reason (skipping gracefully when none is present).

## Not done — in order

1. ~~**Rewire the four consumers onto `scanEmbedMarkers`.**~~ Done — see above.
2. **Write-chokepoint validation.** Reject any write whose `data-embed-config` fails to parse or
   lacks a `type`. Not a security control — an integrity one: `entry-refs` builds the where-used
   index safe-delete trusts, and one stray character anywhere in a config would otherwise drop a
   reference from it and let a delete proceed against something still in use. Render-time stays
   forgiving (warn + degrade, never throw); the gate is at write time, and it must cover agent-tool
   and direct-API writes, not only the admin editor.
3. **Register `partial` as a real embed type** in `HTML_EMBED_RESOLVERS`, which knows
   `widget`/`media`/`post` (`form` was removed 2026-08-10 — `embed-type-inventory.md`). Note this is
   entangled with the open decision at the bottom of this file: registering `partial` here means the
   page-embed stage OWNS it, and today `static-render.ts` resolves it instead. Do not do this without
   settling that first — `isPageEmbedType` returning true for `partial` would let this stage
   substitute a placeholder over a theme's own scaffolding.
4. ~~**Drift check.**~~ Done — `development/scripts/check-embed-marker-drift.ts` +
   `npm run check:embed-marker-drift`, ratcheted further in `83bb623`.
5. **`html` widget type** — `capability: "static"`, config `{ html: string }`, scripts permitted.
   Purpose: save a named raw-HTML snippet once, place it anywhere by reference.
6. **Wire `pages.edit_html`** (SPEC-047 REQ-9). **Blocked outside this repository, not merely
   undone.** `authorize()` matches literal `policy_permissions` rows and never reads the permission
   catalog; no row spells `pages.edit_html`, and the seed lives in `@jini-ai/cms`. Gating on it
   before that seed exists would leave only `owner` able to edit Page HTML. The interim
   `content.write` gate landed in `ee7af59` with refusal-path tests; see `embed-type-inventory.md`
   for exactly what it does and does not buy.
7. **Stale references to the old vocabulary** in comments and docs: `theme-authoring-guide.md`
   (§6.1 slots, and §8.2 which still claims nested menus never render — untrue since `77f567d`),
   `content/themes/*/build-preview.mjs` (per-theme authoring preview scripts, 4 hits in `basic` alone —
   these will silently stop resolving slots), and several theme `theme.json` descriptions.

## Open decision, not yet made

**Should `type: "partial"` resolve to a content entry instead of a file on theme disk?** Today a
partial is `nav.html` sitting in the theme folder: no revisions, no admin editing, needs a server
restart. WordPress moved past this in 2022 with template parts.

The analysis is in `development/docs/architecture/wordpress-content-injection-comparison.md`
(`a60f450`, `e1dddb9`). Its finding: the menu precedent transfers only halfway — menus work as content
because a menu is a narrow typed tree the theme renders from resolved data, whereas a partial *is*
presentation. The closer analog is Tovu's own `bodyFormat: "html"` Pages. Renaming the attribute does
not make partials content; that is a separate, larger decision the owner has not made.
