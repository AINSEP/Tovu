import { isInMemoryDbPath as isMemory, discardCommittedSnapshot as discard } from "@jini-ai/db/data-modules";
export { snapshotDb } from "@jini-ai/db/data-modules";

export function isInMemoryDbPath(dbPath: string): boolean { return isMemory({ dbPath }); }
export function discardCommittedSnapshot(snapshotPath: string): Promise<void> { return discard({ snapshotPath }); }
