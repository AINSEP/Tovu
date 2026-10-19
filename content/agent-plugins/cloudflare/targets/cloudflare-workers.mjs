import { createTarget, previewTarget, validateConfig, verifyCredential } from '../lib/target.mjs';
import { uploadWorker } from '../lib/workers-upload.mjs';

/** Workers serves static exports only; Tovu's Node/SQLite server stays on its existing server host. */
export default {
  defaultForNewDestination: true,
  // Historical worksFor:[cloudflare] meant Pages only. Adding Workers must not expand that grant.
  defaultCredentialWorksFor: ['cloudflare-workers'],
  acceptsCredential: ({ worksFor }, _options = {}) => worksFor.includes('cloudflare-workers'),
  destinationConfig: ({ providerMetadata }, _options = {}) => typeof providerMetadata?.resourceName === 'string' ? { resourceName: providerMetadata.resourceName } : {},
  validateConfig,
  verifyCredential,
  preview: (input, options = {}) => previewTarget({ ...input, targetId: 'cloudflare-workers' }, options),
  create: (context, options = {}) => createTarget({ ...context, targetId: 'cloudflare-workers', upload: uploadWorker }, options),
};
