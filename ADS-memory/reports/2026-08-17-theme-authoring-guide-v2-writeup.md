# Theme Authoring Guide v2 — written, committed, verified

Date: 2026-08-17 · Agent: Sonnet subagent (`ThemeGuideV2`), ADS Docs persona · Branch: `general-work`
Coordinator verification: independent (`git show --stat`, direct source spot-checks of the two
load-bearing new findings)

## Deliverable

`development/docs/themes/theme-authoring-guide-v2.md` — 584 lines, new file. v1 NOT overwritten.

Audience is AI-first per owner instruction ("they're probably the ones who are gonna be writing,
refactoring, doing the themes"): deterministic headings, explicit REQUIRED/OPTIONAL/FORBIDDEN
markers, `path:line` citations on every normative claim, machine-checkable rules stated as rules, a
read-vs-dead field table, a worked example per tier.

A prominent status block sits above §1 stating in plain words that v2 is a **TARGET design that
nothing runs**, and that all ~10 real themes still use v1's shape. v1 got a one-line pointer to v2;
v2 points back throughout.

### Section outline

0 status block · 1 audience · 2 relationship to v1/debate · 3 folder tree (authored) · 4 folder tree
(compiled) · 5 `theme.json` field reference · 6 build provenance · 7 tier taxonomy · 8 embed markers ·
9 `regions` · 10 `partials` rename · 11 `render/` · 12 `ai/` · 13 `AGENTS.md` + `tests/` ·
14 license/attribution · 15 read-vs-dead field table · 16 machine-checkable rules · 17 worked example
per tier · 18 gotchas · 19 open punch list · 20 further reading.

## Punch-list item 1 CLOSED — the real shape of `regions`

The debate preserved `regions` "as-implemented" but **never actually read it**. Now read:

```
src/features/theme/theme.ts:144   regions?: string[];
src/features/theme/theme.ts:624   regions: Array.isArray(raw.regions) ? raw.regions.map(String) : undefined,
```

**A flat array of region-key strings — NOT an object.** Coordinator-verified directly against source.

It is genuinely wired end-to-end (`theme.ts:130-144` → `pages.ts:164` → `resolver-service.ts:72,180`
→ `render.ts:1579,1700,1752`), but **zero live `theme.json` declares it**. Documented in v2 §9 with
the full citation chain. This fills the gap the debate flagged as unknown; it does not contradict any
locked decision.

## New find: `class` is worse than dead

```
src/features/theme/theme.ts:113   class?: "declarative";
```

Declared in the `ThemeManifest` TypeScript interface but **never parsed out of raw JSON** — absent
from `loadTheme()`'s object literal (`theme.ts:610-630`). Coordinator-verified: `raw.class` appears
nowhere in the file, and no `manifest.class` consumer exists anywhere in `src/`.

A field that typechecks, that an author could reasonably set, and that nothing on earth reads.

## Everything tagged `[NOT YET IMPLEMENTED]` / dead in v2 §15

- `ai/` (`capabilities.json`/`elements.json`/`scoring.json`) — zero implementation, grep-verified across `src/`.
- `AGENTS.md` at theme root; `tests/cases.json` + `fixtures/` + `golden/` — zero on disk.
- `data-tovu-agent` — zero hits anywhere. (`data-agent-element` is real but admin-only,
  `src/features/pages/`, never in theme markup.)
- `render/` folder; `partials` manifest key (the `slots` rename); `authors`, `license`,
  `attributions`, `category`, `tags`, `apiVersion`, `$schema`, `partials.inputs`,
  `assets.previewGallery`, `scripts.entries`, nested `tokens`/`fonts` objects — proposal-only,
  unread by any parser today.
- `class` — see above.
- `code-tier-asset-normalizer.ts` — real, tested, **zero production callers** (only its own test
  file; the module's own header says so).
- `LICENSE` file + structured license fields — zero themes ship one. `NOTICE.md` free text is the
  only real provenance mechanism today.

## Checks against the settled design — all held

1. `regions` — filled in, not contradicted (see above).
2. `build.framework` is still a **closed 3-value union** (`"react"|"vue"|"angular"`,
   `theme.ts:344-347`), narrower than Round 3's "open vocabulary" recommendation. Not a
   contradiction — the widening simply hasn't shipped. Documented as such.
3. **Astro claim verified TRUE**: `astro-real-bundler-conformance.test.ts` confirms unmodified
   default `astro build` output fails the install gate with exactly the two issues the debate
   predicted (missing stylesheet sentinel + zero asset references).

Both corrections already in the consensus report (no `framework` tier; build output *does* live
in-folder outside `sourceDir`) held up against every file read.

## v1 fix applied

`1a88866a` — corrected v1's §6 embed-marker claim. The real mechanism is **one** attribute,
`data-embed-config`, holding a JSON object; v1 documented three separate attributes.

## OPEN — three more v1 staleness bugs found, deliberately NOT fixed

All three trace to the same 2026-08-11 "unified content marker" change, one day after v1's own
2026-08-10 write-up date. Left untouched because they are conceptual/field-rename changes outside the
scoped one-claim fix, and #1 has real design implications that should not be silently resolved:

1. **`postTemplate` → `templates`.** The real field is `templates: string[]` (`theme.ts:161-189`,
   live in `basic/theme.json:11`), not the `postTemplate` name v1 uses throughout §3.1/§7.1.
2. **`activeAttr` → `honorsCurrentPage`.** The real primary field on a slot descriptor is
   `honorsCurrentPage: boolean` (`theme.ts:224-239`); `activeAttr` survives only as a legacy string
   fallback. v1 presents `activeAttr` as the primary spelling.
3. **`{{post}}` / `injectPostEmbedId` → unified `{"type":"content"}` marker.**
   `static-render.ts:56,75` states the unified marker "replaces BOTH `injectPostEmbedId`'s `{{post}}`
   literal…"; v1 §6.4/§7.1/§7.2/§9 still describe the old placeholder mechanism as current.

**Owner decision needed:** whether to run a follow-up pass bringing v1 fully current.

## Commits (independently verified via `git show --stat`)

| SHA | Message | Files |
|---|---|---|
| `adc2040b` | new `theme-authoring-guide-v2.md` | 1 file, +584 |
| `1a88866a` | `fix(docs): correct v1 theme guide's stale 3-attribute embed marker syntax` | 1 file, +25 −17 |

Each contains only its own file. `src/themes/static/basic/pages/index.html` (pre-existing,
unrelated, owner's) untouched throughout.
