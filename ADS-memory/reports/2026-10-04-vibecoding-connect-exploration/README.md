# Vibe-coded apps ↔ Tovu backend — exploration (2026-10-04)

> **⚠️ EXPLORATORY — NOT A DECISION.** This was a curiosity session: "what's possible?" Nothing here was chosen, approved, or scheduled, and nothing is being built. The owner's verdict: the proposed config format "looks kinda funny", and none of this can be judged until it is tried on a real vibe-coded app. **Next step if this is ever picked up: prototype on a real app first, then decide.**

## The question
How does a user who vibe-codes a React/Vue/Angular app (hosted on Tovu, Vercel, AWS…) attach it to Tovu's backend and admin, ideally through the existing `data-embed-config` marker, so they only write HTML tags, embeds, or a little JS?

## How the thinking moved
1. **Client-side embeds.** Tovu fills `data-embed-config` markers on the server, so a client-rendered app never gets them filled. Idea: one framework-agnostic `embed.js` plus a fragment endpoint that reuses Tovu's render. Reviewed by Codex and Sonnet → files `1-*`.
2. **Per-feature design.** Codex mapped every backend capability to its own endpoint and SDK call. **Owner rejected this direction:** "not sustainable the more features we add." Kept only for its code findings → file `2-*`.
3. **Generic primitives.** The owner wants one abstract mechanism: `data-embed-config` names a registered widget and/or function, e.g. `{"type":"widget","widget":"stripe-checkout"}` or `{"type":"query","function":"getData","args":{}}`, and the two can be combined. Codex reduced everything to four primitives (call / render / subscribe / transfer), three generic routes, and one registry-entry shape → file `3-*`.

## Owner positions stated during the session (inputs, not decisions)
- The client runtime should live in `@jini-ai/vibecoding` (e.g. `/connect`), not `@jini-ai/cms`. It is specifically for connecting vibe-coded apps to the admin and server.
- One `embed.js` that works for React, Vue and Angular.
- The mechanism must be generic and registry-driven, not one route and SDK call per feature.

## Code facts found along the way (verified against source 2026-10-04; may drift)
- `render.ts:1779 renderHtmlPageBody` substitutes markers server-side. It leaves unowned marker types untouched (`render.ts:1781`).
- After a native form post, the success/error message is spliced in by the server (`form-render.ts:461`). This can't reach a client-rendered app. The JSON branch of `POST /forms/:slug/submit` can.
- No public CORS except localhost dev (`server/inbound/shared/dev-cors.ts`).
- Members `completeSignIn` already returns a raw session token (`features/members/write-service.ts:240`); the HTTP route only sets a cookie.
- Commerce `checkout.ts` never charges. The Lipay payments plugin verifies webhooks, but nothing calls the commerce webhook inbox, so there is no settlement bridge.
- The published-content lookup does not enforce member access (`features/post/post.ts:1824`, per Codex).

## Files
| File | What |
|---|---|
| `0-session-discussion.md` | **Start here:** the conversation itself — making it easy for users, the 9 ways an app attaches, safety, payments, routing, package placement |
| `1-embed-js-question.md` | question packet |
| `1-embed-js-review-codex.md` | Codex 6.1-sol (high) answer |
| `1-embed-js-review-sonnet-summary.md` | Sonnet 5.5 xhigh answer (summary) |
| `2-per-feature-design-question.md` | question packet |
| `2-per-feature-design-codex-REJECTED-DIRECTION.md` | Codex 6.1-sol (high) design. Direction rejected; code findings still useful |
| `3-generic-primitives-question.md` | question packet |
| `3-generic-primitives-codex.md` | Codex 6.1-sol (high): four primitives, unified grammar, registry shape, risks |

Raw Codex JSONL transcripts: `ADS-memory/.local-artifacts/peer-questions/2026-10-04-{embed-js-spa,vibecoding-connect-design,connect-primitives}/`.
