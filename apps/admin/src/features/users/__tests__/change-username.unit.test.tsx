import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { useUsers } from "../hooks/users-controller.hooks";
import { createFakeUsersPort } from "../hooks/users-dependencies.hooks";

it("the host hook forwards username through the existing port and refreshes the own profile", async () => {
  const own = { principalId: "self", workspaceId: "w", username: "self", email: "kept@example.test",
    status: "active" as const, roleIds: [], policyIds: [], createdAt: "2026-10-09", isOwner: false };
  const fake = createFakeUsersPort({ users: [own], meId: own.principalId });
  const port = { ...fake, me: async () => ({ user: { id: own.principalId }, canManageUserTrash: false, effectivePermissions: ["user.manage"] }) };
  const update = vi.spyOn(port, "updateUser");
  function wrapper({ children }: { children: React.ReactNode }) { return <FetchQueryProvider>{children}</FetchQueryProvider>; }
  const { result } = renderHook(() => useUsers({ port }), { wrapper });
  await waitFor(() => expect(result.current.ownProfile?.principalId).toBe("self"));
  act(() => result.current.changeUsername!.open({ user: own }));
  act(() => result.current.changeUsername!.setUsername("self.new"));
  await act(async () => result.current.changeUsername!.confirm({}));
  expect(update).toHaveBeenCalledWith({ principalId: "self" }, { username: "self.new" });
  await waitFor(() => expect(result.current.ownProfile?.username).toBe("self.new"));
  expect(result.current.ownProfile?.email).toBe("kept@example.test");
});
