import { renderHook, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";

import { MEDIA_PROPS } from "@/media-panel";

/**
 * @file The Media mount's provider-catalog hook as `Media` calls it: `{ port }` only. The cms hook
 * takes React's `useEffect`/`useState` as required injected props, so the mount must hand `Media` a
 * host-bound hook; passing the raw cms hook threw "useState is not a function" on every Media render
 * (regression: merge-27, 2026-11-26).
 */

it("the Media mount's provider-catalog hook loads the catalog from the port it is called with", async () => {
  const catalog = [{ id: "openai", label: "OpenAI" }];
  const port = { fetchMediaProviderCatalog: async () => catalog };
  const { result } = renderHook(() => MEDIA_PROPS.hooks.useMediaProviderCatalogHook({ port }));
  expect(result.current).toBeNull();
  await waitFor(() => expect(result.current).toEqual(catalog));
});
