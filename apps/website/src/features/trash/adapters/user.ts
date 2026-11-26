import { createUserTrashAdapter as create, type UserTrashAdapterDeps as Deps } from "@jini-ai/cms/trash/site/adapters/user";

export type UserTrashAdapterDeps = Omit<Deps, "tables">;

export function createUserTrashAdapter(deps: UserTrashAdapterDeps) {
  return create({ ...deps, tables: { principals: "principals", users: "identity_users", sessions: "sessions", outbox: "outbox_events" } });
}
