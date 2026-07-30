# ADR-010: Themes Are Declarative by Default; Code Themes Are a Trusted-Mode Escape Hatch

- Status: ACCEPTED (amends ADR-002)
- Date: 2026-07-01
- Author: Claude Fable 5 / Leon Aburime

## Context

ADR-002 assumed the WordPress trust model: self-hosted sites, themes are
trusted code, so full-power TSX authoring wins. The product owner corrected
this: **a third-party theme library is a core goal — users will one-click
install themes written by strangers.** Arbitrary TSX from strangers executing
in-process is not an acceptable default. Precedents agree: the ecosystems that
run open theme libraries all made themes safe(r)-by-construction — Shopify
(Liquid), Ghost (Handlebars + gscan validation), and modern WordPress *block
themes* (which are nearly code-free: HTML block templates + `theme.json`).

## Decision

Two theme classes; the safe one is the default and the only one installable
from a library without review.

### 1. Declarative themes (default, library-installable)

A declarative theme contains **no executable code**:

- **Templates** as block/slot trees (JSON or constrained markup — the same
  block vocabulary as the content doc model), bound to the template-hierarchy
  IDs from the theme contract.
- **Design tokens** (`tovu.theme.json` analog of WP `theme.json`): palette,
  typography, spacing, radii — consumed by core's style engine.
- **CSS** (sanitized at install: no imports from foreign origins, no
  javascript: URLs, budgeted size).
- **Assets** (fonts, images) with integrity hashes (ADR-004 envelope).
- **Settings schema** (registered into the schema registry like everything else).
- **Interactivity only by reference:** templates place *registered components*
  by id (`component: "tovu/menu"`, `"plugin-x/carousel"`) — components are
  shipped by core or by installed plugins (which have the higher trust bar),
  never by the theme itself.

Install-time validation (Ghost gscan-style) rejects anything outside the
declared surface. Rendering is done by **core's renderer (React server-side
today, per ADR-002)** — for declarative themes the renderer is an internal
implementation detail, so these themes are genuinely framework-portable.

### 2. Code themes (trusted mode)

Full TSX themes (the ADR-002 authoring model) remain for agencies/self-built
sites: installing one requires an explicit developer-mode/trust acknowledgment,
and any future marketplace listing requires review + signing (ADR-004
provenance). Same artifact envelope, `class: "code"` in the manifest.

### Reference themes dogfood the default

`paper`, `atlas`, `glassmorphic` are ported to the *declarative* format — they
must prove the library format is expressive enough before third parties use it.

## Consequences

- **The AI story gets materially better:** an agent can safely *generate or
  modify* a declarative theme (JSON + CSS) with zero code-review risk —
  themes become data an AI can manipulate under change sets (ADR-008).
- Expressiveness is bounded by the block/component vocabulary. Gaps are closed
  by growing the *registered component* library (core or plugins), never by
  letting themes ship code. Expect pressure here; hold the line.
- CSS is the main remaining injection surface — the sanitizer and asset
  integrity checks are security-critical code (`lib/text` + install pipeline).
- ADR-002 stands for: React as core's rendering implementation, renderer-agnostic
  contracts, Vue shell demoted. Superseded portion: "themes are trusted code"
  as the general case — that now applies only to the code-theme class.
