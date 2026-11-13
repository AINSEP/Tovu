/** Host signature adapter; tree construction, keyboard behavior and icon rules belong to Jini. */
import * as tree from "@jini-ai/admin/agent-plugins";
export type { PackageFileTreeNode, PackageFileTreeRow, PackageFileTreeKeyAction, PackageFileIconKind } from "@jini-ai/admin/agent-plugins";
const hostLocale = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).resolvedOptions().locale;
export const buildPackageFileTree = (paths: readonly string[]) => tree.buildPackageFileTree({ paths }, { locale: hostLocale });
export const firstPackageFilePath = (nodes: readonly tree.PackageFileTreeNode[]) => tree.firstPackageFilePath({ nodes });
export const ancestorFolderPaths = ({ filePath }: { filePath: string }, _optional = {}) => tree.ancestorFolderPaths({ filePath });
export const visiblePackageFileRows = ({ nodes, isExpanded }: { nodes: readonly tree.PackageFileTreeNode[]; isExpanded: (required: { path: string }, optional?: Record<string, never>) => boolean }, _optional = {}) => tree.visiblePackageFileRows({ nodes, isExpanded });
export const packageFileTreeKeyAction = ({ rows, currentPath, key, isExpanded }: { rows: readonly tree.PackageFileTreeRow[]; currentPath: string; key: string; isExpanded: (required: { path: string }, optional?: Record<string, never>) => boolean }, _optional = {}) => tree.packageFileTreeKeyAction({ rows, currentPath, key, isExpanded });
export const packageFileIconKind = ({ fileName }: { fileName: string }, _optional = {}) => tree.packageFileIconKind({ fileName });
