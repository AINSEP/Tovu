# features/comments

The comment-moderation screen behind the sidebar's **People → Comments** entry.

| file | what it is |
|---|---|
| `comments-i18n.ts` | Host locale dictionary; shared navigation and server labels keep their existing owners. |

Screens live in `@jini-ai/admin/comments` (`@jini-ai/admin/comments/react` for React).
Queue/settings controllers, rules, HTTP/memory adapters and copied behavioral tests live there.
Tovu supplies its authenticated workspace transport, live locale and queue refresh notifications
through `integrations/jini-admin/comments-ports.ts` and `comments-module.hooks.ts`.

## What this feature does not own

- The public-facing comment submission form — this feature only moderates comments already
  recorded.

## Notes for anyone editing here

The host dictionary test stays in `__tests__/comments-i18n.unit.test.ts`; host switch coverage is
in `integrations/jini-admin/__tests__/comments-swap.unit.test.tsx`. Jini retains the screen suites.
Settings deliberately do not subscribe to queue refresh: the uncontrolled form's one-shot
baseline prevents background reads from silently reverting another operator's saved settings.

## Wiring

- `panels.tsx` renders `@jini-ai/admin/screens/comments`'s `Comments` (re-exported eagerly by `panel-pages.ts`) and spreads `commentsMount(...)` (`integrations/jini-admin/panel-mounts.ts`: `useModulePanel` from `integrations/jini-admin/modules.hooks.ts` and `CommentsModuleLoading` from `integrations/jini-admin/comments-module.hooks.ts`) as its required props; it mounts the `comments.queue` module page.
- `comments-host-ports.ts` binds `@jini-ai/admin/screens/comments/api/comments-api`'s `createCommentsApi` to this host's `authenticatedAdminRequest` and `WORKSPACE_ID`; every importer reads the `commentsApi` singleton from there.

**Locale (P12 #6.T).** The screens take no locale. `CommentsModuleLoading`/`createHostCommentsModule` (`integrations/jini-admin/comments-module.hooks.ts`) take a REQUIRED `useAdminLocaleHook` (`UseAdminLocaleHook` from
`@jini-ai/admin/react/kit`); there is no default and no direct import of the live hook. `panels.tsx` passes `ctx.useAdminLocaleHook` from `PanelRenderContext` to `commentsMount`, which binds it
into `CommentsModuleLoading` (one stable bound component per hook, so the loading notice does not remount); the
function is the host's one `useHostAdminLocale` (`hooks/admin-locale-dependencies.hooks.ts`), the
same one `adminKit.hooks.useAdminLocale` holds. Tests pass a fake hook or `useHostAdminLocale`.
