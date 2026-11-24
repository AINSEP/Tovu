# features/navigation

## Wiring

- Menu reverters live in `@jini-ai/cms/navigation/site/reverters`; the host binds `registerMenuReverters({ registry, deps })` with its menu repo, clock, id generator and outbox in `server/runtime/composition/site-deps/route-deps-site-providers.ts` and `memory-deps/route-deps/assistant-and-site.ts`.
- `repo.sqlite.ts` binds Tovu's `menus` / `nav_location_bindings` tables to Jini's `SqlMenuRepo` / `SqlNavLocationBindingRepo`.
