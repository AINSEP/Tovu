/**
 * @file Public surface for the `plugins` feature. Deliberately narrow: only the ADR-023
 * `dataModule` declaration contract that `comments` and `newsletter` both consume to register
 * their own own-tables (`declareDataModule`, `DataModuleDecl`, `ColumnType`). Everything else
 * under this directory (`lipay/`, `store/`, `supabase-mcp/`, `migration-recovery.ts`) is reached
 * only from the composition root or the assistant tool-catalog seam, which construct concrete
 * implementations directly by design (ADR-009 §1) — this barrel does not re-export them.
 */
export { declareDataModule, type ColumnDecl, type ColumnType, type DataModuleDecl } from "./data-module.js";
