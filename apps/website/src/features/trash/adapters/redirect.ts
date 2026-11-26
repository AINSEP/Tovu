import { REDIRECT_TABLES } from "@tovu/contracts/redirect-tables";
import { createRedirectTrashAdapter as create } from "@jini-ai/cms/trash/site/adapters/redirect";
import type { TrashDb as MarkerStore } from "../db-port.js";
import { schemaErasedKernel } from "#src/platform/db/content-kernel";

export function createRedirectTrashAdapter({ store }: { store: MarkerStore }, _optional: Record<string, never> = {}) {
  return create({ store: schemaErasedKernel({ store }), tables: REDIRECT_TABLES });
}
