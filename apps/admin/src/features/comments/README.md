# features/comments

The comment-moderation screen behind the sidebar's **People → Comments** entry.

| file | what it is |
|---|---|
| `index.ts` | The only surface `panels.tsx` may import; mounts the `comments.queue` module page. |
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
