import { createPluginCredentialCardOperations } from '@jini-ai/agent-plugins/connect';
import { CustomCredentialValidationError } from './store.js';
import { assertCredentialFreeField } from '../../contracts/core/credential-token.js';
export type { LoadPluginCredentialCards } from '@jini-ai/agent-plugins/connect';
export const { readPluginCredentialValues, findPluginCredentialCard, loadPluginCredentialCardsSafely } = createPluginCredentialCardOperations({ cardErrors: { validation: message => new CustomCredentialValidationError(message) }, assertFreeField: assertCredentialFreeField });
