import { nativeToolMetadata } from '../core/tool-metadata/index.js';
export const CREDENTIAL_SAVE_TOOL_ID = 'credential_save';

/**
 * Tovu's secret-card field definitions. Layout, labels and provider-specific names stay in each
 * card builder; the secret marker comes from here so the callback gate derives its protected ids
 * from the very definitions the forms render. Never import handlers into the session proxy's gate.
 */
export const SECRET_FORM_CARD_DEFINITIONS = nativeToolMetadata.secretForms;

export const SECRET_FORM_TOOL_IDS = nativeToolMetadata.secretFormIds;
