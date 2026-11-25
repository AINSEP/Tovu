import { createMediaProvidersPort } from "@jini-ai/admin/screens/media/media-providers-port";

import { mediaApi } from "./api/media-api";

/**
 * @file The admin's media-providers binding: the real `MediaProvidersPort` over this host's
 * `mediaApi`. A module-level singleton — it closes over nothing mutable, so every call site can
 * share one object and no component needs a `useRef` to keep it stable across renders.
 */
export const mediaProvidersPort = createMediaProvidersPort({ mediaApi });
