import { nativeToolMetadata } from '../core/tool-metadata/index.js';
export const CREDENTIAL_SAVE_TOOL_ID = 'credential_save';

/**
 * Tovu's secret-card field definitions. Layout, labels and provider-specific names stay in each
 * card builder; the secret marker comes from here so the callback gate derives its protected ids
 * from the very definitions the forms render. Never import handlers into the session proxy's gate.
 */
export const SECRET_FORM_CARD_DEFINITIONS = nativeToolMetadata.secretForms;

export const SECRET_FORM_TOOL_IDS = nativeToolMetadata.secretFormIds;

/**
 * The secret marker for one secret-form tool's card. Throws when `toolId` declares no secret form,
 * so a card can never render a secret field the callback gate does not protect.
 */
export function secretFormField(toolId: string): { readonly secret: true } {
  const definition = SECRET_FORM_CARD_DEFINITIONS[toolId];
  if (!definition) throw new Error(`${toolId} declares no secret form`);
  return definition.secretField;
}
