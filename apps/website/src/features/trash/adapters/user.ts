import { bindKernelUserTrashAdapter } from "@jini-ai/user-management/identity/sql/kernel-user-trash-store";
import { lazyKernel } from "@jini-ai/cms/trash/site/adapters/marker-sql";

export const USER_ENTITY_TYPE = "user";
export const createUserTrashAdapter = bindKernelUserTrashAdapter({ kernelFor: lazyKernel, entityType: USER_ENTITY_TYPE });
export type UserTrashAdapterDeps = Parameters<typeof createUserTrashAdapter>[0];
