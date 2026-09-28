/**
 * @file The ONE place `database_transfer_destinations`' AES-GCM additional authenticated data (AAD) is
 * formatted; sealing and opening both call it, so they can never drift apart (AAD is authenticated
 * but never stored — `features/webhooks/secret-sealer.aesgcm.ts`'s header). It binds the sealed
 * address to its workspace: a row copied onto another workspace does not open.
 */

/** Every row is sealed under this version (the table was born with AAD). */
export const DATABASE_DESTINATION_AAD_VERSION = 1;

/** @complexity O(1). */
export function buildDatabaseDestinationAad(input: { workspaceId: string }): string {
  return `database-transfer-destination:v${DATABASE_DESTINATION_AAD_VERSION}:${input.workspaceId}`;
}
