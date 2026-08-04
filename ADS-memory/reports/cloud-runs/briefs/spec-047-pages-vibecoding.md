# Brief — SPEC-047, Pages vibecoding

**Read `../RUN-PROTOCOL.md` in full first.** It is mandatory and covers the branch, the run log, the
commit/push discipline, and the evidence standard. Everything below assumes it.

- **Run log path:** `ADS-memory/reports/cloud-runs/2026-08-04-spec-047.md`
- **Fallback branch if push is rejected:** `spec-047-pages-vibecoding`
- **Deliverable:** `ADS-memory/specs/047-pages-vibecoding/spec.md` (Tovu repo)

## Bootstrap

1. Read `AI-Dev-Shop/agents/spec/skills.md` in the Tovu repo before any work. If missing or
   unreadable, log it and STOP.
2. Confirm persona load in your first line of output.
3. Do NOT read `AI-Dev-Shop/AGENTS.md` or the root `CLAUDE.md` — the `<<SUBAGENT_DISPATCH>>` marker
   in your dispatch exempts you from the interactive startup sequence.
4. Active spec provider is `speckit`, but the concrete repo precedent is **one `spec.md` per feature
   folder**. Read `ADS-memory/specs/046-site-assistant-page-actions/spec.md` and match its shape and
   rigor: numbered REQ-N requirements, a "what already exists / do not rebuild" table, explicit
   non-goals.
5. Read `ADS-memory/governance/constitution.md` if present and honor it.

## Setup

**Documentation task. Do NOT run `npm install`, `pnpm install`, or any build** — slow, and you do not
need them. Read source directly. Write no code; this is M1 (spec), and M2 (ADR) plus implementation
follow.

## Required reading

In the Tovu repo:
- `ADS-memory/reports/recon/pages-vibecoding-decisions.md` — **ground truth.** 13 locked decisions
  (D-1..D-13), 4 recorded reversals (D-REV-1..4), 6 open questions (OQ-1..6).
- `ADS-memory/reports/recon/2026-08-03-vibecoding-in-jini-inventory.md` — engine-level inventory;
  contains **two corrections** to the locked decisions.
- `ADS-memory/reports/recon/2026-08-03-vibecoding-apply-tier.md` — adversarial pressure-test of the
  edit contract.

In the Jini repo: `packages/vibecoding/` — `README.md`, `src/core/{types,target,apply,history}.ts`,
`src/html/regions.ts`, `package.json`.

## Verified current state (checked 2026-08-04 — verify before citing, but do not re-derive)

- The engine exists in Jini: `@jini-ai/vibecoding`, subpaths `./core` and `./html`, built and tested.
- **Tovu is at zero.** `@jini-ai/vibecoding` is not in Tovu's `package.json` (see the ten `@jini-ai/*`
  deps that are). No `body_format`/`bodyFormat` anywhere in `src/`. No spec existed before yours.

## Scope boundary — read twice

**You are specifying the Tovu product wiring, NOT the engine.** The edit loop, undo/redo, the
`EditTarget` port and the tagged-region HTML target are already built and green in Jini. Do not
re-specify them. Where Tovu must supply something the engine injects, specify *Tovu's implementation
of that port*.

## Settled — apply, do not re-litigate

- **`data-agent-element`, never `data-tovu-id`.** D-5 named `data-tovu-id`; the Jini inventory
  corrected it. The existing convention (`@jini-ai/agentic/element-handles.ts`) is an allowlist not a
  query language, is hardened against attribute-selector injection, and already has `region` as a
  role. A product-named attribute also fails Jini's guard rule R5 on its face.
- **D-REV-1..4 are settled.** Cite them; do not reopen them.
- **Ownership rule:** generic capability belongs in Jini and Tovu imports it; only host-specific
  things (the DB, the admin, the theme system, permissions) stay in Tovu. If your spec would put
  something reusable in Tovu, flag and justify it explicitly.

## The five things the spec must resolve, in priority order

1. **`HtmlRegionParser` has no implementation anywhere.** The engine deliberately injects it as a
   port; no HTML parser exists in Jini and the package is `"runtime": "universal"`. Byte-preserving
   splice requires a parser reporting **source offsets**. Specify what the parser must report and
   what it must tolerate in malformed input; evaluate candidates (`parse5` with
   `sourceCodeLocationInfo` is the obvious one; consider `node-html-parser`, and whether the
   browser's own `DOMParser` serves any path); and say **where the implementation lives** — Tovu, or
   a new `@jini-ai/vibecoding/html/node` adapter. **This is the hardest open decision. Give it real
   analysis, not a one-liner.**
2. **`HtmlDocumentStore` over Tovu's Pages row + the `body_format` discriminator (D-2).** Additive
   column, never a destructive migration (Ghost precedent). Posts locked to `"doc"`, Pages default
   `"html"`. **The trap:** an `html`-format document must NEVER be offered a Tiptap tab — Tiptap
   silently discards nodes outside its vocabulary and saves the loss with no error. Specify how that
   is prevented *structurally*, not by convention.
3. **Preview (D-4) — the requirement has NARROWED; you must scope it.** The Jini inventory found
   `@jini-ai/renderers-react`'s `SrcDocSandbox` already ships
   `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"` with a regression test that
   separately asserts `allow-same-origin` is ABSENT — an opaque origin, which defeats the
   admin-session-theft threat D-4 was written against. What a separate origin still buys that srcdoc
   does not: a real navigable URL (testing links/navigation, sharing a preview, surviving a page
   load). **Decide for v1: opaque-origin srcdoc, or a real separate-origin URL?** Recommend one with
   reasons. If srcdoc, then D-4 stops being a prerequisite and the decision log's sequencing changes
   — say so explicitly.
4. **Generation prompt fed literal theme token VALUES, not adjectives (D-3).** Verify the token
   loader still exists where cited (`src/features/theme/theme.ts:85`) before citing it. Generated CSS
   uses `var(--accent, #64a19d)` — literal fallbacks, so pages follow theme switches, degrade on a
   theme missing a token, and still export self-contained. D-3's own status line says it was "decided
   by Coordinator on evidence" and the owner has not confirmed it — surface it as an owner check, not
   as settled.
5. **Permission gate (D-12) + rate limit (D-11).** Authoring raw HTML is permission-gated, same
   capability class as `media.upload_svg` ("XSS-risk-gated capability", cited at
   `src/identity/seed.ts:132` — verify). Rate-limit the generation endpoint from day one: SPEC-006
   REQ-14 has a rate-limit primitive and SPEC-046 shipped `SITE_ASSISTANT_PER_IP`. Reuse, don't
   invent.

## Also required

- **OQ-1 is unresolved and blocks D-10:** does the BYOK execution path normalize tool calls the same
  way the daemon path does, across anthropic/openai/azure/google
  (`src/server/routes/admin/assistant/list-models.ts` lists the four)? **Investigate and answer it if
  you can do so cheaply from the code** — that is genuinely valuable. Otherwise mark
  `[NEEDS CLARIFICATION]`, which per framework rules blocks Software Architect dispatch. Do not paper
  over it. (A separate cloud agent is working the BYOK bug concurrently; don't edit code, just
  report what you learn.)
- **OQ-3** (a bespoke page still needs real site chrome; if the model invents its own nav per page
  the site is broken) and **OQ-4** (a generated `<form>` that posts nowhere silently loses leads) —
  decide in-v1 or deferred, with reasons. D-13 (shared behavior becomes a widget; SPEC-043 exists) is
  the likely mechanism for OQ-4.
- **Explicit non-goals** from the "Deliberately NOT ported" list: no sandbox/VM tier, no
  shell/start/build actions, no LLM-driven file-selection subsystem, no in-memory session state. Also
  scope out OQ-2 (vision self-check) and OQ-6 (import-an-existing-design) as post-v1.
- A **sequencing** section confirming or superseding the decision log's 7 steps, given your D-4 call.
- The mandatory **handoff contract**: inputs used, output summary, risks, suggested next assignee.

## Final report

Path written, the REQ list with one-line summaries, every `[NEEDS CLARIFICATION]` left, your
concerns, what you could not verify, and the commit sha / branch you pushed to.
