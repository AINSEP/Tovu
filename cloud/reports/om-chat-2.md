# om-chat-2 — in progress

Branch: `cloud/om-chat-2`. Base Tovu `abead52498c80fd86b8f7b37a2caed31d98a7307`, Jini `3a86f98ba03380651c8bf64b8fc18c4f90a122fd` (fetched current `origin/cloud/combine` tips).

Scope: OMJ items 1, 2, 3, 4, 8. Jini owns shared behavior; Tovu adopts settings CSS and preserves reasoning metadata in picker wiring. No publishing, deployment, Open Marketing edits, or main pushes.

Settings presentation moved to `@jini-ai/chat/react/styles/chat-settings.css`; Tovu keeps its theme tokens and dock-specific help targets. Browser grid/settings checks 2/2, Jini settings lifecycle/content tests 18/18, Tovu affected settings tests 77/77. Exact commands and final SHAs will follow in the final report. Rebuilt contracts after switching base and relinked Jini.

Reasoning metadata wiring and its focused tests are in progress. No extra persistence calls or polls.
