# Brief — SPEC-048, the agent-authored extension / glue tier

**Read `../RUN-PROTOCOL.md` in full first.** It is mandatory and covers the branch, the run log, the
commit/push discipline, and the evidence standard. Everything below assumes it.

- **Run log path:** `ADS-memory/reports/cloud-runs/2026-08-04-spec-048.md`
- **Fallback branch if push is rejected:** `spec-048-extension-glue-tier`
- **Deliverable:** `ADS-memory/specs/048-extension-glue-tier/spec.md` (Tovu repo)

## Bootstrap

1. Read `AI-Dev-Shop/agents/spec/skills.md` in the Tovu repo before any work. If missing, log and STOP.
2. Confirm persona load in your first line of output.
3. Do NOT read `AI-Dev-Shop/AGENTS.md` or the root `CLAUDE.md` — the `<<SUBAGENT_DISPATCH>>` marker
   exempts you.
4. Match `ADS-memory/specs/046-site-assistant-page-actions/spec.md` for shape and rigor: numbered
   REQ-N requirements, a "what already exists / do not rebuild" table, explicit non-goals.
5. Read `ADS-memory/governance/constitution.md` if present and honor it.

## Setup

**Documentation task. Do NOT run `npm install`, `pnpm install`, or any build.** Read source directly.
Write no code — this is M1 (spec).

## The problem, in the owner's words

The owner is building Tovu, a CMS where a site owner can have an AI agent vibecode pages and
eventually apps, while still getting a full admin. His framing:

> "For a website where I vibecode pages and apps, but I'm trying to give the user a full admin, I need
> a way for AI to create glue for stuff that I don't provide out-of-the-box… a folder that I can maybe
> override, extend, or add more functionality that acts as glue to bridge packages between that and
> the vibecoded app or even admin stuff. And an AI agent can do this — so they would have free reign
> to change and add anything in [that folder] that acts as glue, since every app is different."

Asked to clarify, he said: **"the idea is that an agent can create or edit (in a controlled manner)
stuff for a non-technical user."**

That clarification is the load-bearing constraint of the whole spec. **The author of the glue code is
an AI agent. The accountable party is a non-technical human who cannot read the code.** Every design
choice follows: preview/diff/approve, revert, and blast-radius containment matter more than developer
ergonomics. Reconciling "free reign" with "controlled manner" **is** the deliverable.

## Phase 1 — recon before you spec. Do not skip; it may change the answer.

The biggest risk is specifying a **fourth parallel extension mechanism** alongside three that already
exist. Establish first whether this is genuinely new, or a new *loading location and trust level* for
something already built.

Read: `ADS-memory/specs/005-plugin-system/`, `ADS-memory/specs/043-widgets/`,
`ADS-memory/specs/045-plugins-admin/`; the implementation under `src/features/plugins/`; the
tool-registration layer (`src/assistant/tool-registrations.ts`, `tool-registration-kit.ts`,
`tool-catalog-query.ts`, `tool-executor-audit.ts`); `ADS-memory/reports/architecture/` for ADRs on
plugins, capabilities, permissions or extension; and Tovu's capability model in `src/identity/seed.ts`
— note the precedent that theme-source editing is deliberately excluded from the editor role because
"authoring template/CSS source is a build-time-shaped capability whose failure mode is a broken site",
and that `media.upload_svg` is an "XSS-risk-gated capability".

**"The existing plugin system already covers this and needs only X and Y" is a valid and welcome
outcome.** If the evidence says that, say it prominently. Do not invent a mechanism to justify the
assignment.

Log your Phase 1 verdict to the run log before starting Phase 2.

## Naming constraint — hard

**Do not call this a "registry."** `@jini-ai/registry` already exists in Jini and means something
entirely different: semver specifier resolution plus signature-verified distribution of content
entries against a GitHub Actions OIDC trust root, with three backends. Pick a distinct name
(`extensions/`, `glue/`, `site-code/`, or better) and state the collision you avoided.

## The WordPress precedent — what it actually is

Another LLM told the owner "you need a registry folder, does WordPress do this?" That captures about a
quarter of the real pattern. Verify these and correct them where wrong:

- **`wp-content/`** — `plugins/`, `themes/`, and `mu-plugins/` ("must-use": auto-loaded, no activation
  step, not deactivatable from the admin). Plus **drop-ins**: reserved filenames (`object-cache.php`,
  `advanced-cache.php`, `db.php`, `maintenance.php`) that *replace* a core subsystem wholesale. The
  folder exists so core upgrades never overwrite host code.
- **Hooks — `add_action` / `add_filter`** against `apply_filters()` / `do_action()` call sites
  throughout core, priority-ordered. **This is the actual extensibility mechanism**; the folder
  without named call sites is inert.
- **Child themes** — override by file-path precedence.
- **A theme's `functions.php`** — the per-site catch-all glue file, and the closest existing analogue
  to what the owner describes.

**The transferable lesson: a stable set of named call sites + an upgrade-safe location for host code +
a defined load order.** The folder is the least interesting third. Say so plainly, so the "just add a
folder" framing does not survive.

**What does NOT transfer:** WordPress grants extension code full in-process privilege because it
assumes a *human* author who is accountable — and that assumption is the origin of most of its CVE
history. Here the author is an agent and the accountable human cannot read the code.

Survey *briefly* how others did the controlled version — Shopify's app-vs-theme-extension split and
Shopify Functions, VS Code's `contributes` manifest + activation events, Figma/Slack scoped-token
permission models, browser-extension `permissions` manifests. Take what is load-bearing; do not write
a survey essay.

## What the spec must decide

1. **The trust model — the central decision.** In-process fully trusted (WordPress's answer), or each
   glue module **declares the capabilities it needs and the loader grants only those**? Recommend one
   with reasons. Note Tovu already made the analogous call one level down: the Pages/apps boundary is
   a **capability line, not a syntax line** — a Page may contain inline `<script>` but has no build
   step, no npm, no server routes, no persistence, and *that absence* is what makes a Page not an app.
   The stated rationale: a syntax ban is arbitrary and gets re-litigated the first time someone wants
   an accordion; a capability boundary is enforceable and explicable. See D-12 in
   `ADS-memory/reports/recon/pages-vibecoding-decisions.md`. Your tier is the inverse — server-side
   code with real reach — so its boundary must be at least as considered.
2. **The named call sites.** What are Tovu's `apply_filters` equivalents? Enumerate the actual
   extension points a glue module can attach to, grounded in what exists: content lifecycle, tool
   registration, admin nav/panels, rendering, outbox events, HTTP routes. **This is the substance of
   the spec** — a folder with no call sites is nothing.
3. **Load order, discovery, upgrade safety.** How modules are found, ordered deterministically (not
   by filename alphabetization — say why not), and why a Tovu upgrade never clobbers them.
4. **The agent-author control loop.** How an agent proposes glue; how it is validated before it can
   run; what the non-technical owner sees and approves; how it is reverted. **A broken glue module
   must not be able to brick the admin the owner would need in order to remove it** — specify that
   recovery path concretely. The sibling Pages mechanism is per-turn snapshot plus rewind, chosen over
   a Stop button because the reference implementation's Stop button turned out to be wired to an empty
   stub. Consider whether the same shape applies.
5. **Failure containment and observability.** What happens when glue throws, loops, or is slow. What
   the owner sees.
6. **Where it lives — Jini or Tovu.** Binding rule: **generic infrastructure belongs in Jini and Tovu
   imports it; Tovu should not own anything reusable.** Jini's other consumers are an app-builder
   product and a marketing product. Likely split: *mechanism in Jini, mounting and admin surface in
   Tovu* — but verify against what Jini's packages actually contain (`ls packages/` in the Jini repo;
   read `packages/core/src/tool-registry.ts` and `packages/platform/` at minimum). **Jini source and
   comments must not name any consuming product** — enforced by guard rule R5 in
   `scripts/check-engine-boundaries.ts`.
7. **Explicit non-goals.** Not an npm-installing plugin marketplace, not a general sandbox/VM tier,
   not a replacement for the existing plugin system (unless Phase 1 says otherwise).

## Also required

- The "what already exists / do not rebuild" table. If Phase 1 does its job, this spec should be
  mostly composition of existing parts.
- The mandatory **handoff contract**: inputs used, output summary, risks, suggested next assignee.
- Mark genuinely owner-only decisions `[NEEDS CLARIFICATION]` — that correctly blocks Software
  Architect dispatch. Do not guess to avoid the marker, and do not scatter it over things you could
  have determined by reading the code.

## Final report

Path written, the REQ list with one-line summaries, the **Phase 1 verdict**, every
`[NEEDS CLARIFICATION]`, your concerns, what you could not verify, and the commit sha / branch pushed.
