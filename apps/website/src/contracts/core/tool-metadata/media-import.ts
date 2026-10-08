import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** media-import registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  "media_import_from_url": {
    search: {
      keywords: "url urls link links address addresses href http https web internet online remote external elsewhere cdn s3 cloudfront bucket import imports importing download downloads downloading fetch fetching grab pull get save saving store storing copy add attach image images photo photos picture pictures file files asset assets media library gallery",
      queries: [
        "I have a URL for an image, put it in the media library.",
        "Put the image from this URL in my media library, saving the remote image link.",
        "Can you save the image at this link into our media library?",
        "I have a URL for a picture — how do I get it into the CMS?",
        "Download this image from the web and add it to our media files.",
        "Another tool gave me a link to an image it made. Can you import it?",
        "How do I add a photo that lives on someone else's site or CDN?",
      ],
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  // Include URL/link vocabulary, import/download/save verbs and remote-source names so an
  // operator can discover import-by-URL. FTS unicode61 does not stem; include singulars/plurals.
  "media_import_local_file": {
    search: {
      keywords: "upload import add local file files computer disk downloads desktop folder folders video videos image images photo photos to media library my mac hero mp4 logo theme",
      queries: [
        "Add the video in my Downloads folder to the media library.",
        "Upload this photo from my desktop to the site.",
        "Import the logo file from the theme folder into media.",
        "Put hero.mp4 from my computer on the site.",
      ],
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
