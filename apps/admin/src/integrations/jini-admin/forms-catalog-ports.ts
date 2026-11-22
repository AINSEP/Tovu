/** Binds the forms domain's field tables and safety rules to the port admin's forms module requires. */
import { FIELD_TYPE_REGISTRY, MAX_FORM_FILE_BYTES, SAFE_FORM_FILE_TYPES, escapeFormHtml, isBrowserSafeFieldPattern } from '@jini-ai/cms/forms';
import type { FormsCatalogPort } from '@jini-ai/admin/forms';

/** `satisfies` keeps a shape change on either side a typecheck failure here, at the binding. */
export const formsCatalog = {
  fieldKinds: FIELD_TYPE_REGISTRY,
  maxFileBytes: MAX_FORM_FILE_BYTES,
  safeFileTypes: SAFE_FORM_FILE_TYPES,
  isBrowserSafePattern: isBrowserSafeFieldPattern,
  escapeHtml: escapeFormHtml,
} satisfies FormsCatalogPort;
