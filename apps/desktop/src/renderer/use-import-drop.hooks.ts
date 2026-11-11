/** @file Drag-and-drop for the Import page: the highlight, and routing a drop to its source. */
import { useState, type DragEvent } from 'react';

import { classifyImportDrop, classifyImportFiles, type ImportDrop } from './import-drop.js';
import { runnerInventoryBridge } from './runner-api.js';

/**
 * @param required.busy an import is running; a drop is ignored rather than queued.
 * @param required.onFolder,required.onArchive,required.onRefused one of these runs per drop.
 * @returns handlers for the page's root, so a drop anywhere on the page counts, `dragging`, and
 *   `onPicked` for the files the drop zone's own picker returns.
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
  const route = (drop: ImportDrop) => {
    if (drop.kind === 'folder') onFolder(drop.path);
    else if (drop.kind === 'archive') onArchive(drop.path);
    else onRefused(drop.message);
  };
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
  // Capture phase, and the drop stops here: the shared drop zone inside the page would otherwise
  // expand a dropped folder into every file in it (a site folder holds node_modules) and lose the
  // folder's own path, which is the one thing a folder import needs.
  const onDropCapture = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    if (busy) return;
    route(classifyImportDrop({ dataTransfer: event.dataTransfer, getPathForFile }));
  };
  const onPicked = (files: File[]) => {
    if (!busy) route(classifyImportFiles({ files, getPathForFile }));
  };
  return { dragging, onPicked, dropProps: { onDragEnter: onDragOver, onDragOver, onDragLeave, onDropCapture } };
}
