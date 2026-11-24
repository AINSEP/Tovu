import { createApiKeySecret } from "@jini-ai/user-management/identity/api-key-secret";
import { createApiKeyService } from "@jini-ai/user-management/identity/api-key-service";

/**
 * @file The host binding of Jini's api-key format: the one place this product's scheme marker lives.
 *
 * Every key this site has ever issued is `tovu_ak_<12 hex>.<secret>`, and `api_keys.prefix` stores
 * that marker in the clear. Jini mints and parses under whatever prefix the host binds, so changing
 * this literal would make every issued key unparseable — it is fixed for the life of the product.
 * Routes import the bound transitions from here; the unbound ones and the types come from Jini.
 */
const apiKeySecret = createApiKeySecret({ prefix: "tovu_ak_" });

export const { mintApiKey, parseApiKey } = apiKeySecret;
export const { issueApiKey, authenticateApiKey } = createApiKeyService({ keySecret: apiKeySecret });
