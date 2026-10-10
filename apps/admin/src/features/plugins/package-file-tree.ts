/** Host signature adapter; tree construction, keyboard behavior and icon rules belong to Jini. */
import * as tree from "@jini-ai/admin/agent-plugins";
export type { PackageFileTreeNode, PackageFileTreeRow, PackageFileTreeKeyAction, PackageFileIconKind } from "@jini-ai/admin/agent-plugins";
const hostLocale = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).resolvedOptions().locale;
export const buildPackageFileTree = (paths: readonly string[]) => tree.buildPackageFileTree({ paths }, { locale: hostLocale });
export const firstPackageFilePath = (nodes: readonly tree.PackageFileTreeNode[]) => tree.firstPackageFilePath({ nodes });
export const ancestorFolderPaths = (filePath: string) => tree.ancestorFolderPaths({ filePath });
export const visiblePackageFileRows = (nodes: readonly tree.PackageFileTreeNode[], isExpanded: (path: string) => boolean) => tree.visiblePackageFileRows({ nodes, isExpanded: ({ path }) => isExpanded(path) });
export const packageFileTreeKeyAction = (rows: readonly tree.PackageFileTreeRow[], currentPath: string, key: string, isExpanded: (path: string) => boolean) => tree.packageFileTreeKeyAction({ rows, currentPath, key, isExpanded: ({ path }) => isExpanded(path) });
export const packageFileIconKind = (fileName: string) => tree.packageFileIconKind({ fileName });
