> **⚠️ EXPLORATORY — NOT A DECISION.** Owner curiosity session, 2026-10-04. Nothing here was chosen or approved, and nothing is being built. The owner noted the proposed format "looks kinda funny" and that none of this can be judged until it is tried on a real vibe-coded app. Treat as raw input for a future prototype, not a spec.

_Source: question packet_

## CONTEXT BUDGET — HARD PRIORITY RULE (overrides finishing the task)
Your hard ceiling is 300k tokens of context. Stop well before it. This is an opinion question; it should need very little context.

## Preamble
- Do NOT read AGENTS.md / CLAUDE.md / CONTEXT.md or any bootstrap file. There is none for this task. A missing file is never a reason to stop; reporting yourself blocked is a wrong answer.
- Do NOT crawl the repo. Everything you need is below, verified against source on 2026-10-04. If you must confirm one fact, read at most 3 named files, never chained with `&&`.
- Never call codebase-memory-mcp `index_repository`.
- Do not edit any files. Answer only.

## The need (owner's words, paraphrased)
Tovu is a self-hostable CMS that is also becoming a vibe-coding platform. A user vibe-codes a React, Vue, or Angular app on our platform and "attaches it to the admin". They may host the built app on Vercel, AWS, or on Tovu itself. Inside that app they want to drop a plain marker div:

```html
<div data-embed-config='{"type":"form","id":"contact"}'></div>
```

...and have Tovu's own server-rendered HTML for that form (or menu, post, media, widget) appear there, with Tovu's backend handling it exactly like it does on a Tovu page today (submit, validation, rate limiting, spam honeypot, submissions appear in admin). The app author does NOT write a form in React. The owner wants:
1. ONE file, `embed.js`, that works for React, Vue, and Angular alike, abstracting the framework away.
2. A plan for when the marker div has children.

The proposed design so far:
- A new public endpoint, e.g. `GET /embed?config=<json>`, that runs the same server render used for pages and returns just the HTML fragment for one marker.
- `embed.js` finds `[data-embed-config]` elements, fetches the fragment, and sets `innerHTML`.

## The question
Is this the simplest design that actually works? What are we not seeing — hidden complexities, failure modes, and better/simpler alternatives? Specifically address:
- (a) How ONE `embed.js` should discover markers in apps that render client-side and re-render (React/Vue/Angular): MutationObserver over the document vs. a custom element (`<tovu-embed config='…'>`) vs. per-framework wrapper components vs. something else. Which is simplest and most robust, and why?
- (b) The framework virtual-DOM conflict: React/Vue/Angular own that div. What happens when the framework re-renders, unmounts/remounts (route changes), or reconciles children we injected? What does embed.js have to do?
- (c) The "marker div has children" case: authored fallback content, framework-rendered children, or previously injected content. Recommend a rule.
- (d) Cross-origin (Vercel/AWS) vs. same-origin (served by Tovu or proxied under the same domain): what breaks, what each costs, and which to default to. The owner believes "same domain" but also says users may host on Vercel/AWS — call out that tension plainly.
- (e) Form-submit flow from inside an SPA given the facts below (redirect + server-side result splice). What must change?
- (f) Security: injecting server HTML via innerHTML, CSP, CSRF, scripts inside fragments, open embed endpoint abuse/caching.
- (g) Anything else that makes this harder than it looks, and the smallest first slice you would build.

Give a direct recommendation, ranked risks, and the smallest first slice. Be concrete. Under ~900 words.

## Verified repository facts

F1 — Marker format and server-side substitution. Tovu pages (stored HTML) and theme templates contain markers like `<div data-embed-config='{"type":"widget","id":"w1"}'></div>`. Owned types: `["widget","form","taxonomy","media","post","content"]` (`page-embed-types.ts:14`). Theme `partial` and `menu` markers are resolved by a later static-render stage. `render.ts:1779 renderHtmlPageBody(html, resolved)` scans markers and replaces each with server-rendered HTML from data batch-loaded ahead of render (route handler loads, render is pure "resolved data in, HTML out"). Unresolved but owned → a static placeholder. Unowned types → left exactly as authored. Max 50 embeds per page. A bare marker div is whole-element replaced; a marker element with other attributes (class/style) keeps its tag and gets inner content.

F2 — All of this happens on the SERVER before the page is sent. A client-rendered SPA's DOM never passes through it. There is NO existing public endpoint that renders a single embed fragment, and NO CORS handling anywhere in the public HTTP layer.

F3 — Rendered form markup (`render.ts` `renderWidgetContactForm`):
```html
<style>…baseline…</style>
<div hidden … data-form-slug="contact">success message</div>
<form class="widget … widget-contact-form" method="post" action="/forms/contact/submit" data-form-slug="contact">
  <div hidden …>error slot</div>
  …fields…
  <div hidden aria-hidden="true"><input type="text" name="_hp" tabindex="-1"></div>
  <button type="submit">Send</button>
</form>
```
The `action` is RELATIVE. There is also an authored "html" mode where the author's own form HTML is used.

F4 — Submit route `POST /forms/:slug/submit` (`forms-submit.ts:246`) accepts urlencoded and JSON.
- If `Accept` contains `text/html` (a native browser form post): it sets a flash cookie and redirects (Post/Redirect/Get) to the `Referer`, but ONLY if the Referer host equals the request's own Host; otherwise it redirects to the site root (open-redirect guard).
- After the redirect, the success/error message is shown by the SERVER splicing it into the next page's HTML (`form-render.ts:461 injectFormSubmissionResultIntoHtml` — regex-finds the `<form … data-form-slug="…">` in the outgoing HTML and unhides the success slot / shows errors).
- Otherwise it returns JSON: 201 on success; 400 `{code:"FORMS_SUBMISSION_VALIDATION_ERROR", details:{fieldErrors}}`; 429 rate limit; 404 unknown form.

F5 — No theme JS runs on the server, by design (logic template tiers run in sandboxed worker threads). A theme-content CSP middleware exists for theme static assets; it deliberately does not set frame-ancestors.

F6 — Owner principles: easiest for the end user first; prototype first so they can see it; generic reusable code should live in the separate "Jini" package family rather than Tovu.
