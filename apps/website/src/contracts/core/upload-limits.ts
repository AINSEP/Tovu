/**
 * Owner policy: 50 MiB for media uploads, including Library documents. Reuse Jini's document
 * limit so upload validation and text extraction agree. Call sites pass it as uploadMedia's
 * maxUploadBytes override; Jini's default for other consumers' image/video uploads stays 10 MiB.
 * Lives in contracts/core to avoid a publish-content -> media module cycle.
 */
export { MAX_DOCUMENT_BYTES as TOVU_MAX_UPLOAD_BYTES } from "@jini-ai/cms/media";
