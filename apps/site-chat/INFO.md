# apps/site-chat — visitor chat (React + vanilla) on the public site

Host composition for the visitor chat widget. Jini owns the widget, conversation state, lazy
loader and the generic browser helpers; this app binds Tovu's product copy, mount id
(`tovu-site-assistant-root`), routes, storage key and diagnostics names. The visitor chat only
SHOWS the answering model — it never offers a model picker (owner 11-23).

## Files (`src/`)

| File | Role |
|---|---|
| `main.tsx` | Self-mounting React entry; mount id must match the server markup. |
| `SiteAssistantWidget.tsx`, `SiteAssistantWidget.hooks.ts` | React widget composition (pending `codex/visitor-chat-tovu`). |
| `SiteAssistantActivation.hooks.ts` | Dialog lifecycle, page language, loader activation, comparison agent control. |
| `SiteAssistantHeader.tsx`, `SiteAssistantHeader.hooks.ts` | Header slot adapter (OWNER-Q-4). |
| `SiteToolConfirmation.hooks.ts`, `tool-confirmation.ts`, `vanilla-tool-confirmation.ts` | Human-only tool confirmation (BX-13, pending Jini contract). |
| `site-assistant-transport.ts`, `site-assistant-errors.ts` | Visitor transport and error copy (pending `codex/visitor-chat-tovu`). |
| `session-store.ts` | Visitor transcript persistence (key, 50-message / 200 KB caps, message allowlist, comparison key suffix). BX-4/5 dedupe onto Jini `createBrowserSessionStore` is pending: the Jini store clears over-cap legacy envelopes and drops failure notifications, both behaviour changes. |
| `site-chat-comparison.ts` | Comparison-frame variant reader plus the product event/message names. |
| `site-chat-i18n.ts` | Visitor copy dictionary. |
| `visitor-page-control.ts`, `visitor-site-path.ts` | Visitor page actions; strict visitor path grammar. |
| `vanilla-host.ts`, `vanilla-entry.ts`, `loader-host.ts`, `loader-entry.ts` | Vanilla widget composition and lazy-loader build entries. |
| `jini-kits.ts`, `jini-surfaces.ts`, `remixicon-override.ts`, `vite-env.d.ts` | Host kit/surface composition, icon stylesheet URL, Vite types. |

Build: `vite.config.ts`, `vite.lazy.config.ts`, `vite.vanilla.config.ts`, `vite-public-guard.ts`
(keeps `apps/admin` out of the public bundle, ADR-054); `scripts/` holds bundle checks.

## Wiring

- **Embed send bridge** — `@jini-ai/chat/browser/embed-send-bridge`. `vanilla-host.ts` calls
  `installEmbedSendBridge({ root, send, enabled, requestEventName, readyMessageType }, { busyMessage })`
  and `SiteAssistantActivation.hooks.ts` passes `createEmbedSendAgentControl({ root, enabled,
  invocationId, requestEventName, readyMessageType }, { busyMessage, unmountedMessage })` to
  `ChatPane`. Tovu injects `enabled` (`isSiteChatComparisonRoot`), the names
  (`SITE_CHAT_COMPARISON_NAMES`) and copy (`SITE_CHAT_COMPARISON_COPY`); ordinary visitors get no listener.
- **Visitor paths** — `@jini-ai/core/contracts/server/verified-origin` `checkSiteRelativeTarget`
  with reserved segments `admin`/`api`, applied to the raw and fully decoded path; the strict
  no-query/fragment grammar stays in `visitor-site-path.ts`.
- **Dialog lifecycle** — `@jini-ai/chat/react/embed` `useEmbedChatDialog`; lazy loader —
  `@jini-ai/chat/browser/lazy-loader` `installLazyChatLoader`.
