/** Compatibility export for the recoverable-delete contract tests. Chat policy lives in headless. */
import { PERMANENT_DELETE_TOOLS } from "../../contracts/headless/index.js";
export const NON_TRASH_DELETE_TOOL_IDS: ReadonlySet<string> = new Set([
  ...PERMANENT_DELETE_TOOLS.map(tool => tool.id), "workspace_delete", "collections_execute_cleanup",
]);
