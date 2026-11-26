import { REDIRECT_TABLES } from "@tovu/contracts/redirect-tables";
import { createRedirectTrashAdapter as create } from "@jini-ai/cms/trash/site/adapters/redirect";
import type { TrashDb as MarkerStore } from "../db-port.js";

export function createRedirectTrashAdapter(store: MarkerStore) {
  return create({ store, tables: REDIRECT_TABLES });
}
