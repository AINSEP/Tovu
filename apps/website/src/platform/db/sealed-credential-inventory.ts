/** @file Compatibility facade for the site-key inventory. Jini owns vault persistence and AAD;
 * the host scan includes unknown plugin columns and the retained device-code store. */
export {
  inventoryVaultCredentials as listSealedCredentials,
  discoverSealedColumns, siblingColumns, SealedCredentialInventoryLimitError,
  type DiscoveredSealedColumn, type OpensUnderActiveKey, type SealedColumnSummary,
  type SealedCredentialEntry, type SealedCredentialInventory, type SealedCredentialInventoryDeps,
  type SealedCredentialInventoryOptions, type SealedCredentialUnknownReason,
} from "./vault-credential-inventory.js";
