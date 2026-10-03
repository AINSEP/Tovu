/** @file Tovu compatibility facade over the shared Jini database package. */
// Write-equivalence, SQLite CHECK text and auto-index naming rationale: Jini/packages/db/src/kernel/schema-shape.ts.
export { databaseFile, readSchemaShape, type SchemaShape, type TableShape } from "@jini-ai/db/kernel";
