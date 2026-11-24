import { t as tExecution } from '@jini-ai/admin/screens/settings/settings-execution-i18n';
import { interpolate } from '@jini-ai/core/text';

/** This product's copy for Jini's AI-agent dictionary (`@jini-ai/admin/screens/settings/settings-execution-i18n`):
 *  the Local CLI scope key that names the product carries a `{productName}` token, and every site that
 *  renders it (Settings → AI agent, AI Assistant's mount of the same form) passes these vars to
 *  `interpolate()` (K3: product copy stays in the host). */
export const SETTINGS_EXECUTION_PRODUCT_VARS: Readonly<{ productName: string }> = { productName: "Tovu" };

/** The Local CLI scope label in this product's words: Jini's dictionary entry for `key`, filled with
 *  {@link SETTINGS_EXECUTION_PRODUCT_VARS}. AI Assistant's mount of the form renders it through this one call.
 *  @complexity O(n) in the label length. */
export function hostLocalCliScopeLabel(required: Parameters<typeof tExecution>[0], _optional = {}): string {
  return interpolate({ template: tExecution(required), vars: SETTINGS_EXECUTION_PRODUCT_VARS });
}
