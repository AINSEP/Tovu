# features/comments

The comment-moderation screen behind the sidebar's **People → Comments** entry.

| file | what it is |
|---|---|
| `Comments.tsx` | List of comments across all posts/pages, moderation actions (approve/spam/trash), settings. Gates actions through `hasPermission`. |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- The public-facing comment submission form — this feature only moderates comments already
  recorded.

## Notes for anyone editing here

`Comments.tsx` has a unit test (`__tests__/Comments.unit.test.tsx`).
