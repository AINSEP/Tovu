import { useEffect, useState } from "react";
import type { MediaProviderOption } from "@jini-ai/core";
import { useMediaProviderCatalog } from "@jini-ai/cms/react/media/use-media-provider-catalog.hooks";

/**
 * `@jini-ai/cms`'s provider-catalog read bound to React's own hooks, in the `{ port }` shape the Media
 * screen calls it with. The cms hook takes `useEffect`/`useState` as required injected props; handing
 * `Media` the raw cms hook made every Media render throw (merge-27, 2026-11-26).
 *
 * @complexity O(1) per render plus one request per mount.
 */
export function useWiredMediaProviderCatalog(
  { port }: { port: Parameters<typeof useMediaProviderCatalog>[0]["port"] },
  _optional: Record<string, never> = {},
): readonly MediaProviderOption[] | null {
  return useMediaProviderCatalog({ port, useEffect, useState });
}
