# features/entries

## Wiring
- `unreadable-owner-entries-repair.ts` is the host binding of `@jini-ai/cms/entries/site/unreadable-owner-entries-repair`: it binds the marker setting id, the lock key, the `entries` / `setting_values_global` SQL on the content kernel, `DECLARED_CONTENT_TYPE_OWNERS`, the Trash registry / widget-binding table removal adapters and the `[boot-repair]` log lines; called from `server/runtime/composition/boot-data-repairs.ts`.
