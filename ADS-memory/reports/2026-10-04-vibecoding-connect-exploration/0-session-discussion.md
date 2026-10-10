> **⚠️ EXPLORATORY — NOT A DECISION.** Owner curiosity session, 2026-10-04. Nothing here was chosen or approved, and nothing is being built. Prototype on a real vibe-coded app before deciding anything.

# Session discussion (Coordinator ↔ owner), condensed

## Goal in the owner's words
"How do I attach a React vibe-coded app to the backend and the admin?" Users vibe-code the app on our platform and may host it on Tovu, Vercel, or AWS. The owner wants it **as simple as possible for the user**: HTML tags, `data-embed-config` embeds, a script tag, a little JS. The backend "takes care of it like it does on Tovu."

## Making it easy for the user (points raised)
- **Tovu renders, not React.** The owner's correction: the app drops in `<div data-embed-config='{"type":"form","id":"contact"}'>` and gets Tovu's own HTML. The app author does not rebuild forms in React.
- **One `embed.js` for React, Vue, and Angular.** One `<script>` tag that finds marker divs and fills them, so no per-framework setup. A plain `div` + `data-` attribute works in all three with zero config; custom elements need Angular/Vue config.
- **Marker div with children:** keep them as fallback content, shown while loading or if loading fails. Tovu's HTML goes in a Shadow DOM so the framework never fights over it and CSS doesn't leak either way. Trade-off: the app's CSS can't style the embed directly, so expose CSS variables. The alternative (Codex) was to require empty markers.
- **Hosting:** Vercel/AWS is a *different domain* unless the user sets up a proxy. Asking users to set up a proxy breaks "easy for the user first", so the leaning was to default to cross-domain (CORS, no cookies) and let same-domain work automatically.
- **Form submits** must go through `embed.js` (fetch to the existing JSON branch). Tovu's redirect plus server-spliced success message can't reach an app page.
- **One generic mechanism, not per-feature work.** The owner: having a route and SDK call per feature "is not sustainable the more features we add." `data-embed-config` should be the abstraction: name a registered widget and/or function. Examples the owner gave:
  - `{"type":"widget","widget":"stripe-checkout","config":{...}}`
  - `{"type":"query","function":"getData","args":{...}}`
  - combined: widget + query, where the query result feeds the widget (data binding). "We can get as creative as we want."
- **New features register once.** A widget and/or function goes into a registry: no new route, no SDK change, no `embed.js` change. Tovu already half-has both registries: widget types (thin adapters over features) and per-feature `tool-registrations.ts`.

## Ways an app needs to attach to the backend (Coordinator's list, before Codex compressed it)
| # | Building block | What it does |
|---|---|---|
| 1 | Embed | Server renders HTML into a div |
| 2 | Query | Read data |
| 3 | Action | Write: submit, add to cart, comment, subscribe. Needs sign-in checks, protection against double submits, stricter rate limits |
| 4 | Identity | Sign-in, sign-out, current user, a token that works across domains. Everything else depends on it |
| 5 | Routing | App path → redirect, content + SEO metadata, or 404. One hook into the app's router |
| 6 | Live updates | Server push: order paid, new comment, chat |
| 7 | Uploads | Visitor files into Media |
| 8 | App manifest | Admin side of "attach": allowed domains, widgets and functions used, the app's own content types, so admin can manage its data |
| 9 | Custom server functions | Escape hatch: a vibe-coded function runs sandboxed on the server and is registered like any other (`features/plugin-runtime` may be the base) |

Smallest complete set floated: 1–5 + 8. Number 9 is what keeps it sustainable.
**Outside the generic pattern (fixed routes):** incoming payment-provider webhooks, the magic-link sign-in steps, secrets (server-only).
**Codex later compressed 1–9** into four primitives (call / render / subscribe / transfer) plus the app manifest on the admin side. See `3-generic-primitives-codex.md`.

## Safety (where the generic approach puts it)
A generic call route can run backend code, so the registry carries all the safety:
- every entry is private until marked public
- input is validated against a schema
- each entry has its own auth rule (anonymous / member / app) and rate limit
- member-only content is checked inside each function
- agent tools must opt in to browser exposure separately

One mistake there is a hole across everything, while with per-feature routes a mistake stays confined to one route.

## Payments (Stripe / PayPal)
They can't be plain HTML embeds: their own JS must load, and secret keys stay on the server. Flow discussed:
1. The admin stores the keys.
2. The widget asks Tovu to create a Stripe checkout session or PayPal order.
3. The browser either redirects to Stripe-hosted Checkout (simplest) or mounts the provider's widget.
4. The provider webhook marks the order paid.

Today checkout never charges, and payment webhooks never reach orders.

## Routing / redirects
Tovu applies redirects on the server, but an app's router owns navigation. So there is one route-resolve call plus a thin per-router hook (React Router / Vue Router / Angular Router). SEO limit: a browser script can't put content into the first HTML a search engine sees; that needs the app's own server or build step.

## Package placement
Owner decision for when this is built: `@jini-ai/vibecoding` (e.g. `/connect`), because it is specifically for connecting vibe-coded apps to the admin and server. The Coordinator's initial `@jini-ai/cms/embed` suggestion was overruled. Tovu-specific endpoints and adapters stay in Tovu.
