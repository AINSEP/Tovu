/** Binds the content domain's embed attribute allow-list and parser to the port admin's media module requires. */
import {
  EMBED_HTML_ATTRIBUTE_ALLOWED_NAMES,
  isAllowedEmbedHtmlAttributeName,
  parseEmbedHtmlAttributes,
} from '@jini-ai/cms/widgets/markers';
import type { EmbedPolicyPort } from '@jini-ai/admin/media';

/** `satisfies` keeps a shape change on either side a typecheck failure here, at the binding. */
export const embedPolicy = {
  allowedAttributeNames: EMBED_HTML_ATTRIBUTE_ALLOWED_NAMES,
  isAllowedAttributeName: isAllowedEmbedHtmlAttributeName,
  parseAttributes: parseEmbedHtmlAttributes,
} satisfies EmbedPolicyPort;
