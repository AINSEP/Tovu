import { checkDiskHeadroom as check, type HeadroomCheck } from "@jini-ai/db/data-modules";
export type { HeadroomCheck } from "@jini-ai/db/data-modules";

export function checkDiskHeadroom(dbPath: string): HeadroomCheck { return check({ dbPath }); }
