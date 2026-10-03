/** Compatibility adapter; transaction/verification rationale now lives in @jini-ai/db/kernel/store-copy. */
import * as copy from "@jini-ai/db/kernel/store-copy";
import type { StorageKernel } from "@jini-ai/db/kernel";
export { BATCH_ROWS, StoreCopyError } from "@jini-ai/db/kernel/store-copy";
export type { CatalogTable, CopiedTable } from "@jini-ai/db/kernel/store-copy";
export const MOVED_SCHEMAS = ["public", "ai_chat"] as const;
/** Migration ledgers are compared, never copied: both stores are already at head. */
export const LEDGERS = [{ schema: "public", name: "tovu_migrations" }, { schema: "ai_chat", name: "tovu_chat_migrations" }];
const scope = { schemas: MOVED_SCHEMAS, ledgers: LEDGERS };
export const readCatalog = (kernel: StorageKernel<unknown>) => copy.readCatalog({ kernel, scope });
export const nonEmptyTables = (kernel: StorageKernel<unknown>) => copy.nonEmptyTables({ kernel, scope });
export const assertLedgersAgree = (source: StorageKernel<unknown>, target: StorageKernel<unknown>) => copy.assertLedgersAgree({ source, target, scope });
export const copyPgStore = (source: StorageKernel<unknown>, target: StorageKernel<unknown>, optional: { onCopied?: () => Promise<void> } = {}) => copy.copyPgStore({ source, target, scope }, optional);
