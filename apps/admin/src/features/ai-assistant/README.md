# features/ai-assistant

The site-visitor-assistant settings screen — the ungrouped, top-row **AI Assistant** entry
(deliberately moved out of "Design & System" for UX reasons, see `panels.tsx`).

| file | what it is |
|---|---|
| `AiAssistant.tsx` | BYOK provider config, execution mode, connection test, model discovery — the site's own assistant credential, distinct from the operator's own admin-dock assistant. |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **The operator's admin-dock assistant** (`components/AssistantDock/AssistantDock.tsx`) — a sibling under
  `App.tsx`, not a child of this feature, even though they share the model-discovery call
  (`createExecutionPort().listModels`) and some `@jini-ai/ui` settings pieces with
  `features/settings`'s `SettingsUi.tsx`'s Execution-mode tab.

## Notes for anyone editing here

`AiAssistant.unit.test.tsx` is **9 passing / 4 failing**, and has been since the roadmap became its
own tab — the four failures are in the "not-yet-built roadmap accordion" block and query roadmap
content without activating the "Not built yet" tab first. This is pre-existing, known breakage, not
introduced by this feature move — do not "fix" it as a side effect of an unrelated change.

## What moved to the engine

- `AssistantToggleRow`, `OwnerGrantStatus`, the locale-sync and owner-grant hooks, and the Visitor
  tools tab (`VisitorToolsPanel` plus `useVisitorTools`/`useVisitorToolLimitsDraft`) live in
  `@jini-ai/admin/screens/assistant-settings/*`. This folder keeps the host bindings:
  `hooks/assistant-owner-grant-dependencies.hooks.ts` (confirmation hook, refresh bus, error copy)
  and `hooks/visitor-tools-dependencies.hooks.ts` (endpoint, namespace, 409 code, widgets).
- The daemon restart state machine is `@jini-ai/admin/react`'s `useProcessRestart`;
  `hooks/assistant-daemon-restart-dependencies.hooks.ts` binds the endpoints, the `/readyz` → `{ failed }`
  adapter, the post-restart delay and the error copy.
- The Visitor tab panel (`VisitorAssistantPanel`, `useVisitorAssistantPanel`) and the visitor
  credential form's hook, port, pure rules and press handlers live in
  `@jini-ai/admin/screens/assistant-settings/*` (`use-visitor-credential-form.hooks`,
  `visitor-credential-form-port`, `visitor-credential-form.rules`, `visitor-credential-form-actions`).
  `hooks/visitor-credential-form-dependencies.hooks.ts` binds the site-credential client, provider
  catalog, default preset, preferred model, probe transport, error copy (`rules.ts`'s
  `describeApiError`) and the stored-key endpoint rules (`lib/stored-credential-endpoint.ts`);
  `AiAssistant.tsx` passes the wired hooks and `InfoTip` into the panel. The form's markup and its
  status-line copy (`rules.ts`'s `visitorCredential*StatusMessage`) stay here.
- The settings DTOs (`PublicAssistantSettings`, `AdminExecutionDetectedAgent`, visitor-tools view
  types) live in `@jini-ai/core/contracts/site/api-ai-assistant-api-types`.
- Translations stay here (`ai-assistant-i18n.ts`, `visitor-tools-i18n.ts`) and reach the engine
  through `t`. Rationale: `docs/decisions/DR-005-portable-package-boundaries.md` in the engine repo.
