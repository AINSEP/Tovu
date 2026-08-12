/** @file Public surface of Tovu's Commerce feature: the read model plus the first vertical slice
 * (2026-08-12 debate) — catalog/order/webhook-inbox types, ports, and services. `repo.sqlite.ts`
 * is deliberately NOT re-exported here — every other feature's SQLite adapter is imported
 * directly by its own path (e.g. `src/members/repo.sqlite.ts`), not through the feature's index,
 * so infra composition stays visible at each call site rather than hidden behind a barrel. */

export * from "./contracts";
export * from "./status";
export * from "./types";
export * from "./ports";
export * from "./errors";
export * from "./checkout";
export * from "./webhook-inbox";
