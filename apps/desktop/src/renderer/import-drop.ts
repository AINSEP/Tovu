/**
 * @file What was dropped on the Import page. Reads the drop synchronously, because a drop's
 * `DataTransfer` is empty once the event returns. Folders come from `folder-drop.ts`.
 */
import { folderPathsFromDataTransfer } from './folder-drop.js';

export type ImportDrop =
  | { kind: 'folder'; path: string }
  | { kind: 'archive'; path: string }
  | { kind: 'refused'; message: string };

const ONE_AT_A_TIME = 'Drop one website at a time.';
const WRONG_TYPE = "Tovu can't import that. Drop a website folder or a .tovu.zip file.";
const NO_PATH = "Tovu couldn't tell where that file is. Use Choose file instead.";

/**
 * @param required.getPathForFile the preload's real path lookup; `''` when it has none.
 * @returns the one folder or .zip to import, or the plain sentence saying why not.
 * @complexity O(n) in the number of dragged items.
 */
export function classifyImportDrop(
  { dataTransfer, getPathForFile }: { dataTransfer: DataTransfer; getPathForFile: (file: File) => string },
  _optional: Record<string, never> = {},
): ImportDrop {
  const files = Array.from(dataTransfer.files ?? []);
  if (files.length > 1) return { kind: 'refused', message: ONE_AT_A_TIME };
  const [folder] = folderPathsFromDataTransfer(dataTransfer, getPathForFile);
  if (folder !== undefined) return { kind: 'folder', path: folder };
  const file = files[0];
  if (file === undefined || !/\.zip$/i.test(file.name)) return { kind: 'refused', message: WRONG_TYPE };
  const path = getPathForFile(file);
  return path === '' ? { kind: 'refused', message: NO_PATH } : { kind: 'archive', path };
}
