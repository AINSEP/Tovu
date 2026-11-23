import { expectTypeOf, test } from "vitest";
import type { AdminIdentityUser } from "@jini-ai/core/contracts/site/user-management-react";

// The roster's rename capability distinguishes the seeded owner from policy owners.
test("the shared user contract carries the server rename capability", () => {
  expectTypeOf<AdminIdentityUser>().toHaveProperty("canRename");
  expectTypeOf<AdminIdentityUser>().toMatchTypeOf<{ canRename?: boolean }>();
});
