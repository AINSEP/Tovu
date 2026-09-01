# NOTICE — provenance, license status, and content changes

## Addendum — hero "click-to-blur" check (requested after initial handoff)

The owner asked whether the hero has a real click-triggered blur/glitch interaction
that needed preserving, based on a screenshot showing a soft-focus, moody portrait.
Checked directly rather than assumed: **all 11 `<script>` blocks in the source
`index.html`** were searched for `blur`, `Tap`, `Press`, `whileHover`, `onTap`, and
`filter` — zero matches in any script. There is no click handler, no hover-triggered
variant, and no `cursor:pointer` anywhere near the hero markup. The only place `blur`
appears at all is a **permanent, load-time inline style**:
`data-framer-name="BG Image"` (nested directly inside `data-framer-name="Hero"`) carries
`style="filter:blur(8px);-webkit-filter:blur(8px);opacity:0.95"` unconditionally, with
no accompanying CSS rule for `:hover`/`:active`/`:focus` on that class anywhere in the
stylesheet. This is Framer's static soft-focus treatment of the hero background photo,
not an interaction — the "motion-blur look" in the owner's screenshot is this permanent
filter plus the photograph's own real motion-blur photography (hair mid-motion), not a
runtime effect.

**This port was missing that static blur** (my original `.hero-media img` had opacity +
`mix-blend-mode: luminosity` but no `filter: blur()`). Added `filter: blur(8px)` to
match the source exactly — re-rendered and re-screenshotted the hero to confirm it now
reads as the same soft-focus, moody portrait rather than the sharper version shipped in
the original handoff.

## What the source actually is

The export directory name was `fuel-screenshots`, and `DESIGN-HANDOFF.md` (an Open
Design tool artifact, not part of the original product) treated "Fuel" as an
unexplained project title. Reading the raw HTML resolved this immediately:
`index.html`'s own `<meta>` tags identify the real source —

```html
<meta name="generator" content="Framer c9b3949">
<title>Fuel - Premium Agency & Portfolio</title>
<meta name="description" content="Fuel, a premium agency framer template, is a perfect
fit for designers, freelancers, agencies, and photographers.">
```

**"Fuel" is a commercial template sold on the [Framer](https://www.framer.com)
marketplace** — an agency/portfolio site built with Framer's visual site builder, then
exported as static HTML. Every page's footer also carries Framer's own platform badge
("Create a free website with Framer, the website builder loved by startups, designers
and agencies.") and generated CSS class names throughout follow Framer's own
`framer-<hash>` convention. This is a materially different situation from the three
`tailark-*` sibling themes built earlier this session, which came from a component-kit
export with no comparable marketplace-product signal.

## License status: **UNCONFIRMED — flagged, not blocking**

No `LICENSE` file, no license text, and no usage-rights statement of any kind is
present anywhere in the export. Framer marketplace templates are, as a general rule,
sold under a **license to use the template to build one live site on the Framer
platform** — not a license to extract the raw HTML/CSS/JS and redistribute or resell
it as a standalone theme product on a different platform, which is exactly what
porting it into Tovu as `@id: fuel` does. I could not find any statement in the export
confirming redistribution rights, and I did not attempt to purchase or independently
verify the specific marketplace listing's terms (out of scope for this pass, and I
have no confirmed listing URL to check against — the export gives no way to identify
*which* Framer marketplace listing this came from beyond the "Fuel" name).

Per the brief's own instruction, this is **not** treated as a blocker — the theme was
ported anyway — but the license is materially less certain here than for the three
`tailark-*` themes or `basic`, where the source was at minimum framed as a component
kit rather than a paid, single-product template. **The Tovu owner should not treat
this theme as clear to ship/sell without independently resolving the license
question** — this is the most important line in this document.

## Real-brand findings, and how each was handled

### 1. "Nike Studios" — case-study client name (the flag the brief pre-empted)

One of the four case-study pages was literally titled `portfolio-nike-studios.html`,
with page `<title>Nike Studios - Fuel - Premium Agency & Portfolio</title>`, nav
breadcrumbs, and portfolio-grid captions all reading "Nike Studios" / "Art Direction".
**Renamed to "Solace Studios"** throughout (`pages/portfolio-case-study-four.html`).

### 2. Nike-branded product photography in the asset pool (found during the assets audit, not mentioned in the brief — escalates the finding above)

Two local images in `assets/images/` are unambiguous, unmistakable photographs/renders
of **Nike-branded footwear with a fully visible swoosh logo**:
- `Ip3FlDVDFXR2R7krgbhjBt7cng.png` — a studio product shot of a Nike soccer cleat, swoosh
  clearly visible on the side.
- `1D2lDLcBnKpywBRPAJWNr6cpA.png` — a motion-blurred lifestyle photo of a man wearing
  white sneakers with what reads as a Nike-style mark on the side.

**Neither image was used anywhere in the port.** This is a materially stronger finding
than the case-study name alone — the export doesn't just *imply* an association with
Nike via a client name, it contains actual Nike-trademarked product imagery. The
"Solace Studios" case study (`case-solace.jpg`) uses a completely different, unrelated
photo (`rB1tXpmyebHaBY3FZqUIY6090.jpg` — a man in a white technical jacket against a
teal background, no athletic-brand association of any kind) specifically chosen to
fully decouple the renamed case study from any residual "looks like a Nike ad" reading.

### 3. Real design-award/platform names used to back fabricated accolades

The About page's awards section credits the (fictional) agency with wins from real,
well-known design-recognition platforms: **Awwwards, Behance, Dribbble, FWA (Favourite
Website Awards), CSSD Awards**, plus "Mindsparkle" and "Web Excellence Awards". Real
platforms lending borrowed credibility to a fabricated award history is the same class
of problem as a real client logo — a viewer could reasonably read "2x Awwwards SOTD" as
a true claim about a real, checkable award. **Fictionalized all seven** (`about.html`):

| Real (source) | Fictional (this port) |
|---|---|
| Awwwards | Awwstruck |
| CSSD Awards | CSS Circuit |
| Behance | Craftfolio |
| FWA | WNDR Awards |
| Mindsparkle | Sparkgrid |
| Dribbble | Inkwell |
| Web Excellence Awards | Web Craft Awards |

### 4. Client logo row — checked, kept as-is

The "Clients" marquee uses geographic/city-style names as fictional client brands:
**Savannah, Basel, Manila, Monaco, Oslo**. These read the same way the original
`basic` theme's NORTHWIND/FLUXPOINT/HARBOR CO. placeholder names do — invented,
generic-sounding, not tied to any specific real company I could identify — so they
were kept unchanged (Basel/Manila/Oslo, the three with locally-available raster
logos; Savannah's logo was also locally available and used; Monaco's mark only
existed as a remote-hosted SVG with no local copy, so it was dropped rather than
hotlinked or fabricated).

### 5. People in the photography — checked, findings below

- **CEO portrait and the homepage-testimonial portrait** (`hero-ceo.png`,
  `testimonial.png`) and several of the "Meet Our Team" photos (`team-ariana.png`,
  `team-nora.png`) share a consistent, distinctive art style — heavy amber/teal
  split-tone lighting, motion-blurred hair, uniform studio backdrop — that reads as
  **AI-generated portrait photography**, not photographs of real, identifiable
  individuals. I could not verify this with certainty (no metadata, no reverse-image
  check performed), so this is a judgment call based on visual style consistency
  across every "person" image sharing this exact treatment, not a confirmed fact.
- **The remaining team photos and the four blog/case-study cover photos**
  (`team-mira.png`, `team-selena.png`, `team-chloe.png`, `blog-velocity.png`,
  `blog-clearance.jpg`, `case-vellfire.png`, `case-dunwill.png`, `case-noara.png`,
  `case-solace.jpg`) read as **conventional commercial/editorial stock photography** —
  real camera photographs, plausibly licensed stock imagery of anonymous models, in
  the same category every prior theme this session has used without objection. None
  depict a recognizable public figure. I did not attempt to trace any of these to a
  specific stock agency to confirm license terms — they carry the same "bundled with
  an unconfirmed-license template" caveat as the rest of the asset pool (see License
  Status above), just without an *additional* real-trademark or real-person flag on
  top of that.
- **`blog-flowers.png`** (`vSMr1Zfuh0b2i7lq2yOMx58uxs.png`) is a very close-up beauty/
  skincare-style photo of a smiling model. Flagging explicitly because it's more
  personally-framed than the other stock photography, even though it reads as the same
  category of generic commercial stock imagery, not a named or otherwise identifiable
  individual.

## Styling: real CSS, not missing

`DESIGN-HANDOFF.md`'s "Stylesheets detected: 0" caused real problems for the three
`tailark-*` sibling themes (genuinely missing CSS, requiring pixel-sampling
reconstruction from screenshots). **That is not the case here.** Framer's export
convention embeds CSS directly in `<style>` blocks inside each HTML file (three per
page; the largest is ~185KB of generated, non-semantic `framer-<hash>` selectors) plus
~1,600 inline `style="..."` attributes per page — "0 stylesheets" only means no
external `<link rel="stylesheet">`, which the detector didn't account for. There is no
Tailwind CDN script anywhere in the export.

Given the real CSS is machine-generated, per-build-hashed, and not meant to be hand-
edited (the same reason the `tailark-*` themes and `basic` all hand-author their own
semantic CSS rather than ship a framework's generated output), this port does the
same: real color values were confirmed by sampling flat regions of the reference PNGs
directly (`index.png`, full resolution) rather than trusting the generated CSS's
`rgb(0,153,255)` (a Framer-internal editor artifact appearing 262 times in inline
styles, not an actual design color — nothing in the rendered screenshots is blue) —
`css/styles.css` here is 100% hand-authored, using real measured values:
background `#ffffff`, foreground `#111111`, dark-section/footer background sampled at
exactly `rgb(17,17,17)`. The source is genuinely monochrome (black/white/gray) in its
UI chrome — all of its color comes from photography, not from a UI accent hue — so
this theme ships **`"modes": ["light"]`** only, honestly, rather than fabricating a
second dark-mode token set the source never had (same precedent as `tailark-dusk`
shipping dark-only and `tailark-quartz-libre` shipping light-only).

## Style variants — `postTemplate` candidates (not wired, per instruction)

The export ships **four blog-post files** (`blog-all-grapples`, `blog-flowers-love`,
`blog-velocity-becomes`, `blog-way-to-clearance`) and **four portfolio-case-study
files** (`portfolio-vellfire-calibration`, `portfolio-dunwill-lanson`,
`portfolio-noara-willis`, `portfolio-nike-studios`). Within each group of four, the
layout, section structure, and even the body paragraph copy are **identical** — only
the title, category, date/author (blog) or stat callouts (case study), and hero image
differ. This is a stronger, cleaner postTemplate-candidate signal than a typical theme:
these aren't just "similar-looking" pages, they're literally the same template
re-skinned four times by the original author.

Ported as: `pages/blog.html` (canonical) + `blog-two.html`, `blog-three.html`,
`blog-four.html`, and `pages/portfolio-case-study.html` (canonical) +
`portfolio-case-study-two.html`, `-three.html`, `-four.html`. **`theme.json` does
*not* declare a `postTemplate` array** — per the brief, that decision belongs to the
Tovu owner, not to this port. All eight pages are real, complete, navigable pages
either way; declaring `postTemplate` later is additive, not a rewrite.

## Rebrand

"Fuel" → **"Ember"** (proposed, not final — the Tovu owner should confirm before this
ships). Rationale: the source's own copy is already built around a fire/ignition
metaphor ("Igniting ideas with precision...", "Pick a plan... your project will kick
off..."), so "Ember" keeps that thread without reusing the literal template name.
Working directory kept as `src/themes/static/fuel/` regardless of display name, per
instruction. The literal "FUEL" wordmark raster
(`assets/images/71YDGBsigsdGanJvkYBelFcVI.png`, a giant transparent-background PNG of
the word "FUEL") was **not reused** — the homepage hero's giant wordmark is real CSS
text (`EMBER`), not a raster image, so relabeling required no asset work.

The CEO's name in the source, **"Lousiana KD6"**, is unusual but not a real-person
concern (reads as a deliberate stylized handle, not an identifiable individual) — it
was still changed to **"Rowan Aldis"** as an editorial choice for brand consistency
with the rest of the rewrite, not because it was flagged as a real-brand/real-person
issue. Team member names (Ariana Voss, Mira Leone, Selena Hart, Nora Bennett, Chloe
Richter), the testimonial byline (Adrian Velasco / NovaLabs), and blog authors (Sofia
Langford, Maya Renfield, Aria Mendes, Leena Harper) were all checked and kept as-is —
generic, template-invented placeholder names with no match to a recognizable public
figure.

## Structure

```
src/themes/static/fuel/
  theme.json, tokens.json          (light-only — see Styling above)
  nav.html, footer.html            (shared partials)
  pages/{index,about,contact,portfolio,
         portfolio-case-study,-two,-three,-four,
         blog,-two,-three,-four}.html
  css/styles.css                   (hand-authored, ~450 lines)
  js/{reveal.js,nav-toggle.js}, js/vendor/{motion.js,LICENSE.md}
  images/                          (18 curated real local assets, renamed
                                     semantically — see per-finding notes above
                                     for what was excluded and why)
  NOTICE.md                        (this file)
```

`js/vendor/motion.js` is the same MIT-licensed, verified [Motion](https://motion.dev)
v13.0.0 build already vendored for `basic` — reused rather than re-fetched, per the
brief.

## Verification performed

- `loadTheme()` (the real engine function, `src/features/theme/theme.ts`) run directly
  against this theme folder: `status: "valid"`, zero errors, all 12 pages and both
  partials discovered correctly.
- `renderStaticPage()` (the real engine function, `src/features/theme/static-render.ts`)
  run directly for all 12 pages — token injection, partial-slot marker resolution
  (`data-embed-config`; `data-tovu-slot` at the time this was written), and
  `../css/`/`../js/` → `/theme-assets/fuel/...` rewriting all confirmed working, with
  the rendered output written to disk and screenshotted (not the raw un-rendered
  source files).
- Private headless Chromium (`playwright` npm package, launched from a plain Node
  script — not the MCP/browser-extension Playwright tool) screenshotted 7 pages
  (`index`, `about`, `contact`, `portfolio`, `portfolio-case-study`,
  `portfolio-case-study-four`, `blog`) at three breakpoints each (390×844, 820×1180,
  1440×900) — 21 screenshots total, all waiting 2.2s after `load` before capture per
  the session's own established screenshot-timing lesson. A real layout bug was found
  and fixed this way: `.portfolio-card` had an erroneous `gap: 220px` (should have been
  a small spacing value) that pushed each card's image ~200px below its header with a
  large dead-white gap between them — caught on the first screenshot pass, fixed in
  `css/styles.css`, re-rendered and re-screenshotted to confirm.
- Did **not** touch the live Tovu dev server or its active theme, per instruction —
  verification was entirely against a standalone local static server over the
  rendered output plus a `theme-assets` symlink back to this theme folder.
