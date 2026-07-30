# ADR-016: Agentic Document Editing — Frontend-Action Edits + Own Change-Set Review, No Paid Content AI

- Status: ACCEPTED
- Date: 2026-07-06
- Author: Claude Opus 4.8 / Leon Aburime

## Context

The assistant's highest-frequency job on a post is not "generate a new page" — it
is **tedious, multi-spot editing across an existing document**: "make the tone
consistent across all sections", "convert passive voice to active throughout",
"add alt text to every image", "restructure these 8 headings into 3", "update
every price mention". A human doing this manually is death-by-a-thousand-edits;
an agent does it in one pass. This is a core value prop of the AI-native angle
(the editing counterpart to the "assistant-as-modeling-interface" wedge).

The admin post editor uses **Tiptap** (ProseMirror); post bodies persist as Tiptap
JSON in `posts.body_json`. Three ways to give an agent this capability were
evaluated:

1. **Tiptap Content AI (buy).** Tiptap's commercial/Pro suite: an **AI Agent**
   extension (multi-step edits) plus **AI Changes / AI Suggestion** (accept/reject
   diff review, reject-reverts). It does exactly what we want — but it is
   subscription-gated (Tiptap Cloud token), i.e. our flagship interaction would be
   rented from a vendor.
2. **Community MCP (`tiptap-apcore`).** Wraps ~79 Tiptap editor commands as MCP
   tools with role-based ACL. Gives the *editing* half, but (a) has **no
   accept/reject review/diff layer** (only coarse undo/redo history), and (b) MCP
   is a **Node-side server transport**, while our editor is a **live instance in
   the user's browser** — the wrong shape for driving a browser editor.
3. **Build.** Frontend-action edit tools + our own review/diff/revert layer on
   ProseMirror primitives.

This ADR extends **ADR-013** (assistant = CopilotKit client + AG-UI agent,
`tools.ts` with an execution `surface`) and **ADR-014** (profiles/manifest filter
enforced server-side); it applies **ADR-008** (change-sets: propose / preview /
apply / revert) to content, in the same spirit as UF-01 update-safety.

## Decision

1. **Edits execute via CopilotKit frontend actions, not MCP.** Document-editing
   tools are `surface: 'frontend'` entries in the `tools.ts` registry (ADR-013):
   handlers run **in the browser**, bound to the live Tiptap editor instance, and
   wrap Tiptap commands / ProseMirror transactions. We do **not** expose the editor
   over MCP — MCP servers are Node-side and cannot cleanly drive an editor in the
   user's tab; frontend actions are purpose-built for exactly this. `tiptap-apcore`'s
   command taxonomy and its RBAC gating are a **design reference only**, not a
   dependency.

2. **Bulk edits are never silently applied — propose → review → accept/reject →
   revert.** The agent produces a *set* of edits that surface as a reviewable diff;
   the user accepts/rejects (per-change and all), and revert restores prior content.
   This is **ADR-008 change-sets at the content layer**: an article-wide edit is one
   reviewable, revertible change-set.

3. **We build the review/diff/revert layer ourselves — no Tiptap Content AI
   subscription.** The suggestion/diff/accept-reject workflow is built on ProseMirror
   steps + decorations + the change-set store; we do **not** license Tiptap's AI
   Agent / AI Changes / AI Suggestion. Rationale: (a) it is paid and vendor-gated,
   and the review-and-revert experience is core to Tovu's "agent proposes, human
   approves, always revertible" trust model (UF-01) — it must be owned, MIT-clean,
   and self-hostable; (b) the same machinery is reused for assistant-driven
   schema/content-type edits, so building it once compounds.

4. **Edit tools are RBAC-gated (ADR-014).** Which edit tools the agent may invoke is
   filtered by the current user's role via the profile/manifest filter, enforced
   server-side — an agent cannot exceed the caller's permissions (the Strapi-MCP /
   apcore safety lesson, applied through our own seam).

5. **Storage unchanged.** The edited document persists as Tiptap JSON in
   `posts.body_json`; no new content format.

## Consequences

- **No Tiptap Content AI subscription; no dependency on the `tiptap-apcore` MCP.**
  The agent still performs all the tedious multi-edit work; we supply the review UX.
- **New building blocks when this lands:** (a) a ProseMirror suggestion/decoration
  layer for the diff view, (b) a change-set store for content edits (realizes part of
  ADR-008), (c) `surface: 'frontend'` edit tools in `tools.ts`.
- **Reuse, not one-off:** the propose/review/revert machinery is shared between
  document editing and assistant-driven content-type/schema editing (the
  "assistant-as-modeling-interface" wedge) — one review substrate, two surfaces.
- **References (not code deps):** `tiptap-apcore` (editor-command taxonomy + RBAC
  shape), Tiptap AI Changes (the accept/reject review UX to match).
- **Effort / sequencing risk:** a ProseMirror diff/review UX is non-trivial. Scoped
  **post-skeleton**, after the ADR-013 composer refactor (its stated prerequisite);
  not part of v1's walking skeleton.
- **Relates to:** ADR-013 (tool surface / frontend actions), ADR-014 (RBAC profile
  filter), ADR-008 (change-sets), ADR-010 (trusted vs declarative — code themes are a
  separate surface from content edits).
