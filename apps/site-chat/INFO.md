# apps/site-chat

The public-site visitor chat: the React widget, the React-free vanilla widget and the lazy loader
that Tovu sites embed. Product copy, mount ids, themes and the site-assistant transport live here;
the generic embed machinery comes from `@jini-ai/chat` (`./react/embed`, `./vanilla`, `./browser/*`).

## Wiring

- S1 Escape key: `SiteAssistantHeader.hooks.ts` builds `keyboard` with `createViewEscapeKeyPort({ view: page.defaultView })` from `@jini-ai/chat/react/embed` (factory injectable via the hook's options); the capture listener keeps a confirm-step Escape from also closing the visitor dialog.
- S4 visitor copy: `site-chat-i18n.ts` keeps the product dictionary; lookup and `{name}` placeholders are `createDictionaryTranslator`/`interpolate` from `@jini-ai/core/text`, and the page language is matched with `resolveSystemLocale({ languages: [lang], supportedLocales })` from the React-free `@jini-ai/ui/i18n/locale` (so `pt` → pt-BR, `zh-Hant` → zh-TW).
