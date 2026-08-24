# Primary (Claude Opus 5, host) — Round 1 frozen position

Frozen before dispatching or reading any peer's Round 1 answer, per the Debate Round-Disclosure Guard.

## Proposed invariant structure

```
theme-id/
  theme.json                     # required manifest
  tokens.json                    # required design tokens
  tokens.<mode>.json             # optional per-mode override (e.g. tokens.light.json)
  NOTICE.md                      # optional human-prose provenance/license notes
  assets/
    previews/                    # required: >=1 card image; optional gallery; video/audio playback deferred
    images/  video/  audio/  fonts/   # optional, any media type
  css/
    theme.css                    # required single entry point; may @import siblings in css/
  templates/                     # render-layer source; format is tier-specific
  scripts/                       # optional first-party interactive JS/TS; declarative tier has none
    vendor/                      # optional vendored third-party libraries (not CDN-loaded), own LICENSE per package
  locales/                       # optional i18n UI strings
  ai/
    capabilities.json            # optional; RUNTIME agent/MCP-facing metadata for the published site
    AGENT.md                     # optional; DEV-TIME instructions for a coding agent maintaining/converting this theme
  tests/                         # optional; fixtures/golden output to verify correct rendering
  dist/                          # component-framework tier only; local dev build output (see reasoning)
```

## Reasoning, point by point

**`templates/`, not `src/`.** I disagree with the Terra candidate here. Two of the three tiers that exist today already call it `templates/` — keeping that name is less churn, not more. More importantly: `src/` is ambiguous the moment a theme also has `css/`, `scripts/`, and `assets/` as siblings — a developer's default expectation for `src/` (especially one coming from Next.js/SvelteKit/Astro, where `src/` is the umbrella for EVERYTHING including components, utils, styles) is "all my code lives here," which would be actively wrong in this shape. `templates/` is unambiguous: it's specifically the files that render into pages, nothing else. Since CSS and scripts already have their own homes, there is no compilation-vs-source case left for `src/` to win on.

**`css/theme.css`.** Agree with the Terra candidate. One guaranteed entry point, but inside a folder so it can grow (`css/tokens-overrides.css`, per-page splits) without ever needing a second top-level file.

**`scripts/`, not `js/`.** Agree with the Terra candidate, for a reason it didn't have access to: the real repo's `static/basic` theme vendors a third-party animation library locally (`js/vendor/motion.js`) instead of loading it from a CDN, specifically to keep the theme fully self-hostable. That's a real, deliberate policy worth a distinguished `scripts/vendor/` convention — first-party interactive code and vendored third-party code are different trust levels and probably need different treatment in tooling (e.g. a vendored file should never be hand-edited; that should be enforceable, not just documented).

**`dist/` — partial disagreement with the Terra candidate.** Terra says never inside the author folder. I think that's the wrong boundary. A LOCAL, gitignored `dist/` during a theme author's own dev/watch loop on the component-framework tier is normal and harmless — it's their own machine. The actual constraint the owner's untrusted-third-party-code concern requires is: the marketplace/production pipeline must NEVER trust an author-supplied `dist/` as the shipped artifact — it always rebuilds from source in a sandboxed builder it controls. The trust boundary is about who builds it and where, not whether the folder is allowed to exist at all.

**`ai/` split in two, plus a separate `tests/`.** The runtime capability surface (`capabilities.json` — WebMCP-style element/tool-call metadata for agents visiting the live site) and the dev-time surface (`AGENT.md` — instructions for a coding agent converting/maintaining the theme) are different audiences and shouldn't be conflated in one file. `tests/` (fixtures/golden output) is useful to a human AND a coding agent equally, so it gets its own top-level folder rather than being nested under `ai/`.

**Documentation split.** Two documents, generated from one shared source of truth rather than hand-duplicated (duplication drifts). Concretely: a JSON Schema for `theme.json` (machine-readable, validates real themes, IS the agent-facing spec) plus a prose authoring guide for humans (examples, rationale, screenshots) whose field-reference tables are generated FROM the schema's own `description`s — not maintained twice by hand.

**What I'm least sure of:** whether `templates/` truly survives contact with the component-framework tier once it's real — a Vue/Svelte theme's "render source" often IS its interactive logic (a `.vue` file has script+template+style in one file), which strains the "templates holds render-only, scripts holds interactivity" split I'm proposing. Flagging this now as the place I'd most expect a strong peer counter-argument to change my mind.
