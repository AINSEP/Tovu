# ADR-017: Three-Pane Editor — Content / Template / Preview (Data → Template → Output)

- Status: PROPOSED (direction accepted; blocked on the theme/template system)
- Date: 2026-07-06
- Author: Claude Opus 4.8 / Leon Aburime

## Context

A page/post in Tovu is three things stacked: the **content** (data), the
**template** (the component that renders it), and the **rendered output**. The
editor should expose those three as one coordinated workspace — a tabbed or split
"Content / Template / Preview" view — rather than hiding the template and forcing a
publish-to-see loop.

Crucially, this is **not three new concepts** — the three panes *are* Tovu's
existing architectural layers:

- **Content** = the content model. The post body is Tiptap JSON in
  `posts.body_json`.
- **Template** = the theme layer. Per **ADR-010**, themes are *declarative (no
  code) by default*; **code themes are "trusted mode."** The code pane is exactly
  that trusted-mode surface.
- **Preview** = the renderer. Per **ADR-002**, React is the blessed renderer and
  contracts stay renderer-agnostic — which is what makes a "React / Vue / Angular"
  template pane legitimate rather than a hack.

The AI-native payoff (ties **ADR-016**): the assistant edits content *and*
template together, the preview updates live, and the edits arrive as a
reviewable/revertible change-set. "Make the hero full-bleed and tighten the copy"
touches the template and the content at once — a genuinely differentiated editor.

## Decision

1. **The editor presents three coordinated views** — Content (Tiptap / `body_json`),
   Template (the rendering component), Preview (content rendered through template),
   as tabs or a split layout with the same underlying document/route.

2. **The panes map to existing layers, and inherit their rules.** Content →
   content model; Template → theme layer (ADR-010); Preview → renderer (ADR-002). No
   new content format, no new rendering contract.

3. **Preview runs in a sandboxed iframe; template code is isolated from the admin.**
   Editable template code is trusted-mode (ADR-010) and must not touch the admin
   context — sandbox it (iframe/worker), consistent with the plugin-safety posture
   (ADR-003 no-DDL, ADR-004 signed artifacts). Declarative themes remain the default
   safe path; raw code is the power-user opt-in.

4. **Multi-framework is a spectrum, not day-one.** Author templates in the blessed
   renderer (React); Vue/Angular are **alternative output targets validated by
   contract tests** (ADR-002), not three simultaneously-editable live panes. Start
   React-only; add target renderers behind the same contract later.

5. **Assistant edits flow through the ADR-016 review layer.** Cross-pane agent edits
   (content + template) are proposed as a change-set; the preview reflects the
   *working* (unapplied) change-set; the user accepts/rejects/reverts before commit.

## Consequences

- **Post-skeleton; depends on the theme/template system (ADR-010), which is not
  built.** This is why the status is PROPOSED — the direction is accepted, the
  implementation is gated on prerequisites (theme runtime, renderer contract, the
  ADR-016 review substrate).
- **Sandboxing is a hard requirement**, not polish — trusted template code + live
  preview means an isolation boundary from the admin.
- **Reuses, not reinvents:** the ADR-016 propose/review/revert substrate and the
  ADR-002 renderer contract are shared, not duplicated.
- **Reference:** the generic "Visual / Code / Preview" editor pattern (site
  builders, notebook tools) — but Tovu's differentiator is the assistant editing
  across all three panes with a reviewable diff, not the split view itself.
- **Open questions (for the eventual accepting revision):**
  - How the Template pane binds — per-page/route override vs the site-level theme.
  - What the middle pane shows for **declarative-theme** users who have no code: a
    visual/props editor rather than raw source.
  - Where preview state lives during an unapplied change-set (client vs a draft
    render endpoint).
- **Relates to:** ADR-002 (renderer), ADR-010 (declarative/trusted themes),
  ADR-016 (agentic editing + review), ADR-008 (change-sets), ADR-012 (site model).
