/** @file Drag-and-drop for the Import page: the highlight, and routing a drop to its source. */
import { useState, type DragEvent } from 'react';

import { classifyImportDrop } from './import-drop.js';
import { runnerInventoryBridge } from './runner-api.js';

/**
 * @param required.busy an import is running; a drop is ignored rather than queued.
 * @param required.onFolder,required.onArchive,required.onRefused one of these runs per drop.
 * @returns handlers for the page's root, so a drop anywhere on the page counts, and `dragging`.
 * @complexity O(1) per drag event; O(n) in dragged items per drop.
 */
export function useImportDrop(
  { busy, onFolder, onArchive, onRefused }: {
    busy: boolean;
    onFolder: (path: string) => void;
    onArchive: (path: string) => void;
    onRefused: (message: string) => void;
  },
  { getPathForFile = (file: File) => runnerInventoryBridge()?.getPathForFile?.(file) ?? '' }: { getPathForFile?: (file: File) => string } = {},
) {
  const [dragging, setDragging] = useState(false);
  const onDragOver = (event: DragEvent<HTMLElement>) => {
    // Without this Chromium refuses the drop, and a file let go elsewhere would navigate the window.
    event.preventDefault();
    event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
    setDragging(!busy);
  };
  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    // Leaving a child is not leaving the page; `relatedTarget` is where the pointer went.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    const drop = classifyImportDrop({ dataTransfer: event.dataTransfer, getPathForFile });
    if (drop.kind === 'folder') onFolder(drop.path);
    else if (drop.kind === 'archive') onArchive(drop.path);
    else onRefused(drop.message);
  };
  return { dragging, dropProps: { onDragEnter: onDragOver, onDragOver, onDragLeave, onDrop } };
}
