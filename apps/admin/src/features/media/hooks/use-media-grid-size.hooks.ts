import { useCallback, useState } from "react";
import { orFallbackSync } from "@jini-ai/core/errors/idioms";
import { MEDIA_GRID_SIZE_STORAGE_KEY, parseMediaGridSize, type MediaGridSize } from "../rules";

/** The Media grid's card size, remembered per browser (owner, 2026-11-01). Storage can be
 *  unavailable (private mode, blocked): the choice then just lasts for the visit. */
export function useMediaGridSize(): [MediaGridSize, (size: MediaGridSize) => void] {
  const [size, setSizeState] = useState<MediaGridSize>(() => orFallbackSync({ work: () => parseMediaGridSize({ value: window.localStorage.getItem(MEDIA_GRID_SIZE_STORAGE_KEY) }), fallback: "medium", step: "Read media grid size" }));
  const setSize = useCallback((next: MediaGridSize) => {
    setSizeState(next);
    orFallbackSync({ work: () => window.localStorage.setItem(MEDIA_GRID_SIZE_STORAGE_KEY, next), fallback: undefined, step: "Save media grid size" }); /* not remembered */
  }, []);
  return [size, setSize];
}
