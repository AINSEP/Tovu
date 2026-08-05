# features/ai-assistant

The site-visitor-assistant settings screen — the ungrouped, top-row **AI Assistant** entry
(deliberately moved out of "Design & System" for UX reasons, see `panels.tsx`).

| file | what it is |
|---|---|
| `AiAssistant.tsx` | BYOK provider config, execution mode, connection test, model discovery — the site's own assistant credential, distinct from the operator's own admin-dock assistant. |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **The operator's admin-dock assistant** (`components/AssistantDock.tsx`) — a sibling under
  `App.tsx`, not a child of this feature, even though they share the model-discovery call
  (`createExecutionPort().listModels`) and some `@jini-ai/ui` settings pieces with
  `features/settings`'s `SettingsUi.tsx`'s Execution-mode tab.

## Notes for anyone editing here

`AiAssistant.unit.test.tsx` is **9 passing / 4 failing**, and has been since the roadmap became its
own tab — the four failures are in the "not-yet-built roadmap accordion" block and query roadmap
content without activating the "Not built yet" tab first. This is pre-existing, known breakage, not
introduced by this feature move — do not "fix" it as a side effect of an unrelated change.
