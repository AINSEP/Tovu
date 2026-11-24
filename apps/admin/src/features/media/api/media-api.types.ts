import type { AdminMediaDto } from "@jini-ai/core/contracts/site/cms-media";
import type { MediaProviderCredentials } from "@jini-ai/ui/core";
import type { CredentialTokenHint } from "@jini-ai/platform/secrets/credential-token";

/**
 * One media-generation vendor's stored credentials, keyed by ENGINE-CANONICAL provider id (`grok`,
 * `nanobanana`, …) — see `features/media/media-provider-catalog.ts` for why the spelling matters.
 *
 * Structurally `@jini-ai/ui`'s `MediaProviderCredentials` and mirrors
 * `apps/website/src/features/media/provider-credential-store.ts`'s `MediaProviderCredentialView` on the server. `apiKey`
 * is send-only: the operator types one and it goes up, but no response ever carries it back — a
 * stored key comes back as `apiKeyConfigured`/`apiKeyTail` instead.
 */
export interface AdminMediaProviderCredentials extends MediaProviderCredentials {
  apiKeyHint?: CredentialTokenHint | null;
}

export type AdminMediaProviderMap = Record<string, AdminMediaProviderCredentials>;

/**
 * One asset as the admin API answers it — the server's wire shape, declared once in Jini Core
 * (`@jini-ai/core/contracts/site/cms-media`, rv1123e K1); the `@jini-ai/cms` serializer answers
 * exactly it, so the client no longer restates its fields (see `AdminMediaDto` for each field's doc:
 * `slug`, `htmlAttributes` — a stored-XSS boundary the server re-validates on write and render —
 * `contentType` — `null` means unreadable bytes, kept on the All tab — and `publicUrl`).
 *
 * Client-only difference: five fields stay OPTIONAL here because legacy servers omit them —
 * `kind` (absent ⇒ ordinary media), `originalFilename`/`displayFilename` (documents only),
 * `byteSize` and the read-only `createdBy`.
 */
export type AdminMedia = Omit<AdminMediaDto, AdminMediaLegacyOptionalField> & Partial<Pick<AdminMediaDto, AdminMediaLegacyOptionalField>>;

/** The {@link AdminMedia} fields a legacy server may omit. */
type AdminMediaLegacyOptionalField = "kind" | "originalFilename" | "displayFilename" | "byteSize" | "createdBy";
