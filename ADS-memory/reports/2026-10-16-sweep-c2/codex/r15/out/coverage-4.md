TDD(Direct): Loaded the TDD persona for behavior-focused coverage tests.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/website/src/features/web-screenshot/__tests__/web-screenshot.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/components/AssistantDock/__tests__/chat-package-kind.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/collections/__tests__/use-collection-entry-editor.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/features/consent/__tests__/settings.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/media/__tests__/use-media-lightbox.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/pages/__tests__/use-pages.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/posts/__tests__/posts-list-dependencies.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/security/__tests__/use-site-key-recovery.unit.test.ts

PER FILE:

Added scenarios for these paths; execution remains pending.

| Source | Added coverage scenarios |
|---|---|
| `web-screenshot.ts` | Input-validation alternatives, signal forwarding, unexpected errors, missing observer, generic save failure, empty tiles, final-URL fallbacks, filename fallback, origin refusal, own-site queue overflow. |
| `chat-package-kind.ts` | Read failure at line 41, malformed ZIP guards, Windows names, folder-path fallbacks, skill companions and plugin precedence. |
| `use-collection-entry-editor.hooks.ts` | Missing extension fields, repeated validity reports, multiple invalid fields, background refresh preserving unsaved edits. |
| `settings.hooks.ts` | Default wiring, null ledger values, invalid types/region, saving/saved/error states. |
| `use-media-lightbox.hooks.ts` | Missing refs, non-HTML trigger, closed navigation, boundary clamping and unrelated keys. |
| `use-pages.hooks.ts` | Successful actions before initial load, null-cache paths, unrelated-row retention and deletion errors. |
| `posts-list-dependencies.hooks.ts` | Default options, unknown IDs, omitted version basis and default concurrent-save title. Separate suite preserves the other worker’s modified hook tests. |
| `use-site-key-recovery.hooks.ts` | Error fallback at line 66, preview failure at lines 119–120, absent callbacks and in-flight action guards. |

UNREACHABLE:

- `apps/website/src/features/web-screenshot/web-screenshot.ts:303`: rejection callback cannot run; `tail` starts fulfilled and every assignment handles rejection.
- `apps/admin/src/features/posts/hooks/posts-list-dependencies.hooks.ts:20` and `:22`: private helper always receives an object containing a generated ID, bypassing both defaults.
- `apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts:249` and `:293`: null-editor paths are unreachable through the current guarded call graph; entry initialization and saves require an editor.

These remain intact for the owner’s decision.

NOT DONE:

Tests, typecheck, builds, coverage and package scripts were not run, as instructed. **100% coverage is not verified.** Static whitespace checking passed. No production files or git state were changed.
