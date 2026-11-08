import { createCredentialSaveTools } from '@jini-ai/agent-plugins/connect';
import { toolMetadata } from '../../contracts/core/tool-metadata/custom-credentials.js';
import { CREDENTIAL_SAVE_TOOL_ID } from '../../contracts/headless/index.js';
import { CUSTOM_CREDENTIAL_CATEGORIES } from '../../contracts/core/custom-credential-categories.js';
export type { CredentialSaveAdapters } from '@jini-ai/agent-plugins/connect';
export const { credentialSaveCatalog, credentialSaveDerivedRisk, buildCredentialSaveRegistrations } = createCredentialSaveTools({ metadata: toolMetadata, toolId: CREDENTIAL_SAVE_TOOL_ID, categories: CUSTOM_CREDENTIAL_CATEGORIES });
