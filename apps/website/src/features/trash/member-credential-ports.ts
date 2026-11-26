import { createMemberTrashAdapter as create } from "@jini-ai/cms/trash/site/adapters/member-credential-sql";
import type { TrashAdapter } from "@jini-ai/cms/trash";
import type { TrashDb } from "./db-port.js";

export function createMemberTrashAdapter({ adapter, db }: { adapter: TrashAdapter; db: TrashDb }, _optional: Record<string, never> = {}): TrashAdapter {
  return create({ adapter, db, tables: { members: "members", sessions: "member_sessions", tokens: "member_magic_tokens" } });
}
