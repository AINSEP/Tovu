/** @file Tovu's one binding of the real `@jini-ai/oauth` exports the API-connection entry requires as host input. */
import {
  createPendingAuthorizationStore, generateOAuthState, invalidPendingAuthorizationState, isCallbackFieldName, isOAuthError,
  MAX_AUTHORIZATION_STATE_LENGTH, MAX_CALLBACK_FIELD_LENGTH, MAX_CALLBACK_FIELDS, oauthFlowOperations, PENDING_AUTHORIZATION_STATE_BYTES,
  secureEqualsForOwnerBinding,
} from '@jini-ai/oauth';
import type { ApiConnectionCallbackFieldRules, ApiConnectionOAuthCapabilities } from '@jini-ai/integrations/api-connections';

/** The loopback receiver's callback-field rules, passed to every `parseApiConnectionDescriptor` call. */
export const apiConnectionCallbackFieldRules: ApiConnectionCallbackFieldRules = {
  maxFields: MAX_CALLBACK_FIELDS, maxLength: MAX_CALLBACK_FIELD_LENGTH, acceptsName: isCallbackFieldName,
};

/** The one set of real OAuth capabilities every Tovu API-connection host shares (see the contract's notes). */
export const apiConnectionOAuthCapabilities: ApiConnectionOAuthCapabilities = {
  flow: oauthFlowOperations, generateState: generateOAuthState, pendingStateBytes: PENDING_AUTHORIZATION_STATE_BYTES,
  invalidPendingState: invalidPendingAuthorizationState, secureEquals: secureEqualsForOwnerBinding, isOAuthError,
  maxAuthorizationStateLength: MAX_AUTHORIZATION_STATE_LENGTH, callbackFieldRules: apiConnectionCallbackFieldRules, createPendingAuthorizationStore,
};
