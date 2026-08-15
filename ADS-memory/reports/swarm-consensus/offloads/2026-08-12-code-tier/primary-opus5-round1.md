# Primary (Claude Opus 5, 1M) — Round 1, FROZEN

Written before reading any peer or subagent output. Packet: `CTX-CODE-TIER-2026-08-12`.

## Position

**The tier is the wrong unit of design, and Option A is the trap.** My leading position is a variant of Option B — frameworks are a build-time authoring concern that emits the existing `static`-tier contract — but with an honest structural admission Option B as stated does not make: a built theme is a *different class of object* from an authored theme, and the system must say so explicitly rather than pretend it is the same thing.

## Option Assessment

**Option A — SSR adapters in a worker sandbox. Reject, and it is the most dangerous option precisely because it looks like the obvious one.**

The `templated`/`handlebars` posture is safe because of *two* layers, and only one of them ports. Worker isolation ports fine. The **load-time allowlist does not** — and that is the layer doing the real work. Liquid and Handlebars are allowlistable because they are not general-purpose languages: you can enumerate their tags, filters and helpers and reject the rest at validation time, before a single byte executes. There is no analogue for "arbitrary React component code". You cannot lint general JavaScript into safety. So Option A silently drops Tovu from *two* gates to one, while presenting itself as "the same posture as the tiers we already ship."

Second: it is three permanent runtimes, not one. Three SSR APIs, three peer-dependency trees, three version-skew surfaces, forever. Angular is the outlier that breaks the "adapter" framing — it needs its own compiler and DI container at render time, and is an order of magnitude heavier per request than a React `renderToString`.

I want to give A its strongest argument, because it has one: SSR emits an HTML *string*, so `static-render.ts`'s rewrite pipeline could in principle run over that output unchanged. That is real and it is the best thing about A. It is not enough, because it buys a capability (per-request server-side theme execution) that I do not believe the stated need actually requires — see below.

**Option D — trusted signed plugin JS in-process. Reject, weakest of the four.** It is Option A with the sandbox deleted. It destroys C4 (installable from strangers with zero code-execution risk) outright and puts the degrade-never-500 contract at the mercy of author code. Signing establishes *who* wrote it, never *what it does*. This is a supply-chain control being asked to do the job of a runtime control.

**Option C — client-only islands. Viable, and the second-best answer.** The server keeps doing exactly what it does today; framework components ship as browser bundles hydrating into mount points inside otherwise-static HTML. C2/C3/C4 survive untouched. Its weakness is that it still requires a build step, so it inherits Option B's entire toolchain problem *without* B's simplicity — and the no-build escape hatch is only half available (Vue's runtime compiler works via ESM + import maps; React needs a JSX transform; Angular unambiguously needs a build). So C pays B's price and gets less.

**Option B — compile to `static` at build time. My lead, with a named sacrifice.**

Why it dominates: it adds zero runtime, zero new security surface, zero new failure mode. C2, C3, C4, C7, C8 are preserved for free rather than defended. The rewrite pipeline keeps working *unchanged*, because the build emits precisely the `pages/*.html` + embed-marker contract that pipeline already consumes. Self-hostability is untouched — the build runs on the author's machine and the output is what ships.

## Failure Modes And Sacrifice

Option B's genuine sacrifice is exactly **C5 and C6 — the two properties that make Tovu's theme system distinctive.**

1. **Copy-not-inherit and per-file reset become incoherent.** The user opens `pages/index.html` in the admin file editor, but the source of truth is `src/Home.tsx`, which is never served and may not even be shipped. "Restore this file to pristine" restores *build output*, not authored source. F6's whole elegance — reset is a plain file copy because the original is untouched — degrades into a two-source-of-truth problem.
2. **AI-authorability regresses hard.** `theme_write_file` writes built HTML that the next build overwrites. For an agent to genuinely author a built theme it would have to edit TSX *and run a build*, which the server cannot do: there is no theme build step today (F9), and requiring one would put a Node toolchain in the runtime path of a self-hosted install (C1).
3. **What you see is not what you wrote.** Debuggability and the live-edit loop both suffer.

The honest resolution is not to paper over this. It is to declare two theme populations with different contracts: **authored** themes (editable, AI-repairable, per-file resettable — everything shipping today) and **built** themes (opaque, versioned, replaced wholesale, editor-read-only with source provenance). Declaring that explicitly is better than letting the editor silently offer edits that the next build eats.

Secondary failure mode worth flagging regardless of option chosen: `parseTier` silently coerces any unrecognised tier string to `"declarative"` (`theme.ts:249-252`). The moment anyone ships a `theme.json` with `"tier": "code"` against a build that doesn't implement it, they get a *declarative* theme failing validation for confusing reasons, not a clear "unsupported tier" error. Whatever is decided, that coercion should become a hard error first.

## What Would Change My Mind

Evidence that theme authors need **per-request server-side dynamism the embed/slot system cannot express.** My whole position rests on the claim that a CMS theme's dynamic content already arrives through markers the route layer resolves (`menu`, `widget`, `form`, `media`, `post`), so the framework is wanted for *authoring ergonomics*, not for rendering. If the roadmap genuinely requires live product data, personalization, or auth-gated content rendered per request — the `storefront` direction taken seriously — then an executing tier matters and A becomes necessary rather than merely attractive.

Even then I would first ask whether the answer is to extend the **existing sandboxed `templated` tier's data seams** rather than add a JavaScript tier, since that keeps the allowlist gate intact.

I would also move if someone shows a real allowlist-equivalent for author-supplied JS — a capability-based module graph that is verifiable at load time rather than trusted at runtime.

## Unlisted Option

**Web Components / custom elements as a single neutral seam.** React, Vue, and Angular can all compile to standard custom elements. Tovu would support *one* contract — custom elements plus declarative shadow DOM — instead of three framework adapters. The framework becomes entirely the author's private business, invisible to Tovu, and Tovu's supported surface never mentions React, Vue, or Angular at all. This is strictly stronger than per-framework adaptation on maintenance cost, and it composes with the existing embed-marker vocabulary (a custom element *is* a marker). Its cost is that declarative shadow DOM interacts awkwardly with the theme's global token/CSS injection, which is real and needs answering.

## Blind Spots

**(a) Option not listed:** the Web Components seam above.

**(b) The question we should be asking but aren't:** *who is the theme author?* A professional agency shipping a marketplace theme and a site owner tweaking their own site through the admin editor want opposite things — the first wants a toolchain and doesn't care about in-admin editing; the second is the entire reason copy-not-inherit and per-file reset exist. The packet debates a mechanism without naming the user, and the correct mechanism flips depending on the answer. If both populations are real, the two-theme-classes split isn't a compromise, it's the actual design.

**(c) The framing assumption most likely to be wrong:** that authors want React/Vue/Angular in order to *render*. I think they want it for component composition, typed props, and design-system reuse — ergonomics available with no framework runtime in Tovu at all. If that's right, the entire `code`-tier framing is answering a question nobody asked, and the real deliverable is an authoring toolkit plus a documented output contract, not a runtime tier.

<<SWARM_END>>
