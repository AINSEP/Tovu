/**
 * @file Tovu owns the persisted name of the publish backstop audit log (`schema.sqlite.ts`'s
 * `publishBackstopLog`, a staged table). The adapter body lives in Jini
 * `@jini-ai/cms/publish/transfer/sql/backstop-audit-repo`; every Tovu caller passes this name, its
 * content kernel and `@jini-ai/db/kernel`'s `tableExists`.
 */
export const PUBLISH_BACKSTOP_TABLES = { log: "publish_backstop_log" } as const;
