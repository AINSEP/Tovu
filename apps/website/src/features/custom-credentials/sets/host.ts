/**
 * @file Compatibility shim. The generic credential-set host code moved to Jini
 * (`@jini-ai/integrations/credentialed-http/sets`, EXTRACT-S8 C1 move); this path re-exports the same
 * objects and types so existing importers keep one canonical identity. Tovu's inputs stay in
 * `../tovu-credential-sets.ts`.
 */
export type * from "@jini-ai/integrations/credentialed-http/sets";
