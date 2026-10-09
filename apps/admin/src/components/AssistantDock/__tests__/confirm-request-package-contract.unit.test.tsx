import { act, renderHook } from "@testing-library/react";
import { useConfirmRequest } from "@jini-ai/admin/react";
import { expect, it } from "vitest";

// Exercise the public package entry used by AssistantDock: a source-only hook test cannot
// catch a missing export in the built JavaScript or declarations consumed by Tovu.
it.each([true, false])("resolves the public confirmation request to %s only after an answer", async (accepted) => {
  const { result } = renderHook(() => useConfirmRequest({}));
  let answer!: Promise<boolean>;
  let settled = false;
  act(() => {
    answer = result.current.confirm({ dialog: {
      title: "Delete conversation",
      body: 'Delete "Find my posts"? This cannot be undone.',
      confirmLabel: "Delete conversation",
      tone: "danger",
    } });
    void answer.then(() => { settled = true; });
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(result.current.dialog.open).toBe(true);
  expect(result.current.dialog.title).toBe("Delete conversation");
  act(() => {
    if (accepted) result.current.dialog.onConfirm();
    else result.current.dialog.onCancel();
  });
  await expect(answer).resolves.toBe(accepted);
  expect(result.current.dialog.open).toBe(false);
});
