import { isInMemoryDbPath as isMemory, discardCommittedSnapshot as discard } from "@jini-ai/db/data-modules";
export { snapshotDb } from "@jini-ai/db/data-modules";

export function isInMemoryDbPath({ dbPath }: { dbPath: string }, _optional = {}): boolean { return isMemory({ dbPath }); }
export function discardCommittedSnapshot({ snapshotPath }: { snapshotPath: string }, _optional = {}): Promise<void> { return discard({ snapshotPath }); }
