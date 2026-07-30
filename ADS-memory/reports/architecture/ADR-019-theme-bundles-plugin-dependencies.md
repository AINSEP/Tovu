# ADR-019: Theme Bundles — Themes Declare Plugin Dependencies; Behavior Stays in the Plugin Plane

- Status: ACCEPTED 2026-07-07 (extends ADR-010; relates to ADR-003, ADR-004, SPEC-004, SPEC-005; see ADR-020 for the tier model)
- Date: 2026-07-07
- Author: Claude Opus 4.8 / Leon Aburime

## Context

ADR-010 established two theme classes: **declarative** (default, no code, safe to
install from anyone) and **code/trusted mode** (full TSX, explicit trust
acknowledgment, rare). It also fixed the rule that interactivity comes *only* from
**registered components** shipped by core or by installed **plugins** — never by the
theme itself.

Two gaps surfaced in use:

1. **UX gap.** A good-looking declarative theme frequently needs a companion
   capability its component set doesn't cover — a mega-menu, a carousel, an SEO
   block, a word counter. ADR-010 says those components come from a plugin, but it
   never said how a user *gets* the right plugin. Today the implied flow is "install
   the theme, then go hunt the marketplace for the plugin(s) it references" — poor
   UX, and it renders a broken/incomplete site in the meantime (unknown component
   ids). The owner named this explicitly: *forcing people to download a theme then
   search for a plugin is not good user experience.*

2. **A tempting wrong turn.** The owner asked whether to add a theme class that can
   itself run JS (framed as "untrusted-but-runs-JS"). That inverts the trust model —
   it would hand the least-vetted artifact (a theme installed from a stranger) the
   most dangerous capability (arbitrary in-process code) — and it destroys ADR-010's
   core guarantee that installing a theme from anyone is safe. Rejected.

The clean resolution keeps behavior where it already belongs (the plugin plane, which
has the higher trust bar — ADR-003 no-DDL, ADR-004 signing/provenance, capability
permissions) and fixes only the *packaging and install UX*.

## Decision

**No new JS-capable theme class.** ADR-010's two classes stand. The only executable
trust surface remains plugins. What changes is packaging.

### 1. Theme bundles (a packaging variant of the declarative theme, not a trust class)

A declarative theme MAY declare plugin dependencies in its manifest:

```jsonc
// theme.json (declarative class, unchanged otherwise)
"requires": [
  { "pluginId": "acme/mega-nav", "versionRange": "^1.2", "optional": false },
  { "pluginId": "acme/seo",      "versionRange": "^0.4", "optional": true  }
]
```

- The theme package **still contains zero executable code** — SPEC-004 INV-01 holds
  unchanged. The code lives entirely in the *referenced plugins*, which pass the
  plugin trust bar independently.
- **Install/activation resolves dependencies and installs/enables the plugins in one
  consented step.** The installer surfaces the required plugins and their requested
  permissions and asks for a single confirmation:
  *"This theme needs plugin `acme/mega-nav`, which requests permissions A and B —
  install and enable it?"* One click, but an honest one, because code is arriving.

### 2. Referenced vs vendored dependencies

- **Referenced** (primary): the manifest points at a registry plugin by id + semver
  range; the installer resolves it from the plugin registry / artifact envelope
  (ADR-004, SPEC-004 OQ-02). Updates independently of the theme; dedupes across
  themes.
- **Vendored** (allowed for first-party / offline): the plugin ships inside the same
  signed bundle artifact. It is still installed **through the normal plugin
  pipeline** — never loaded as theme code, never exempt from permissions. Its version
  is coupled to the theme release.

### 3. Catalog labeling derived from packaging, not from theme trust

The user-facing distinction is *does code come with it*, not *can the theme execute*:

- **"Pure theme — no code"** — declarative, no `requires`. Install is instant and
  unconditionally safe (the "install from anyone" guarantee).
- **"Theme + plugins — requests permissions"** — a bundle. Install shows the
  one-step permission consent above.

### 4. Code/trusted-mode themes unchanged

ADR-010 §2 code themes remain the rare escape hatch (explicit trust, review + signing
for any marketplace listing). Bundles are the **preferred** way to deliver
interactivity because they keep the theme itself safe-by-construction.

## Consequences

- **Preserves ADR-010's invariant and the AI story.** Themes stay pure data an agent
  can generate/modify under change sets (ADR-008); only the plugin plane executes.
- **New surface to build (future slice, pairs with SPEC-005):** a dependency resolver
  and a single-consent install flow spanning theme + plugin install, plus the
  artifact envelope (SPEC-004 OQ-02 / ADR-004). A missing or version-incompatible
  dependency makes the theme list as *needs-plugins* / blocks activation with an
  actionable error — mirroring SPEC-004's validation posture (REQ-06), never a silent
  broken render (REQ-10 render-time fallback still applies).
- **Permission legibility tradeoff.** One broad "does-everything" plugin is easy to
  bundle but harder for a user to reason about than several narrow plugins. The
  catalog must surface the full requested permission set regardless of how the author
  packaged it; capability-scoping (ADR-003 spirit) still bounds blast radius.
- **Makes SPEC-004 OQ-04 load-bearing sooner.** Component props schemas + a versioned
  component registry are needed before third-party plugins can safely contribute the
  components a bundle relies on.
- **Does not relax any security rule.** Bundles change distribution/UX only; ADR-003
  (plugins never run DDL), ADR-004 (signed artifacts/provenance), and the plugin
  permission model all apply unchanged.

## Follow-ups

- New spec slice: *Theme bundles + plugin dependency resolution + consented install*
  (owner: Leon Aburime; pairs with SPEC-005 plugin system and the extension-artifact
  envelope spec, SPEC-004 OQ-02).
- SPEC-004 records this decision as a forward-looking Open Question (OQ-06) and scope
  pointer; no v1 requirement changes.
