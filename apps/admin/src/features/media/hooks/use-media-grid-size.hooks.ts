import { useCallback, useState } from "react";
import { MEDIA_GRID_SIZE_STORAGE_KEY, parseMediaGridSize, type MediaGridSize } from "../rules";

/** The Media grid's card size, remembered per browser (owner, 2026-11-01). Storage can be
 *  unavailable (private mode, blocked): the choice then just lasts for the visit. */
export function useMediaGridSize(): [MediaGridSize, (size: MediaGridSize) => void] {
  const [size, setSizeState] = useState<MediaGridSize>(() => {
    try { return parseMediaGridSize(window.localStorage.getItem(MEDIA_GRID_SIZE_STORAGE_KEY)); } catch { return "medium"; }
  });
  const setSize = useCallback((next: MediaGridSize) => {
    setSizeState(next);
    try { window.localStorage.setItem(MEDIA_GRID_SIZE_STORAGE_KEY, next); } catch { /* not remembered */ }
  }, []);
  return [size, setSize];
}
