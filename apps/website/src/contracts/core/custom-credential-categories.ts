/** The Access Tokens page's own category-filter ids, minus `"all"` — mirrors
 *  `apps/admin/src/features/security/rules.ts`'s `AccessTokenRowCategoryId` exactly (that file is
 *  the source of truth for the UI's own copy; this is the server-side validation twin, since a
 *  category must be readable/filterable without ever decrypting a row — see this file's own header
 *  and `db/schema.sqlite.ts`'s `customCredentialSets.category` doc). Kept as a plain literal union rather
 *  than importing from `apps/admin` (server code never depends on the admin app). */
export type CustomCredentialCategoryId = "source-control" | "hosting" | "media" | "ai" | "ops" | "general";

export const CUSTOM_CREDENTIAL_CATEGORIES: readonly CustomCredentialCategoryId[] = ["source-control", "hosting", "media", "ai", "ops", "general"];
