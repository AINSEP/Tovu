import { createMediaProviderCatalogPort, createMediaProvidersPort } from "@jini-ai/admin/screens/media/media-providers-port";

import { mediaApi } from "./api/media-api";

/**
 * @file The real media-providers port — Tovu's own implementation of the transport
 * `@jini-ai/ui`'s Media providers tab declares but deliberately does not ship (same convention as
 * `ProjectLocationsPort`/`SkillsPort`; the package ships only a fake).
 *
 * Replaces `createFakeMediaProvidersPort()`, whose in-memory store forgot everything on reload.
 */

/**
 * The port instance. A module-level singleton rather than a factory: it closes over nothing, so
 * every call site can share one object and no component needs a `useRef` to keep it stable across
 * renders the way the fake did (the fake had to be ref-held because each call built a fresh store).
 */
export const mediaProvidersPort = createMediaProvidersPort({ mediaApi });

/** The catalog port the External Providers tab takes its cards (and its count) from; bound once like {@link mediaProvidersPort}. */
export const mediaProviderCatalogPort = createMediaProviderCatalogPort({ mediaApi });
