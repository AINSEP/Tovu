import { createElement, StrictMode, type ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { useEscapeToCancel } from "../hooks/use-escape-to-cancel.hooks";

// Author Checklist: deleting cleanup or using [] deps must fail (F2.3, F3.3).
// Real document registration and React effect replay; callback delivery is the contract.
it("delivers only Escape to the current callback and stops delivery after unmount", async () => {
  const user = userEvent.setup();
  const first = vi.fn();
  const second = vi.fn();
  const { rerender, unmount } = renderHook(({ cancel }) => useEscapeToCancel(cancel), {
    initialProps: { cancel: first },
    wrapper: ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children),
  });

  await user.keyboard("{Enter}a");
  expect(first).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  expect(first.mock.calls).toEqual([[]]);

  rerender({ cancel: second });
  await user.keyboard("{Escape}{Escape}");
  expect(first.mock.calls).toEqual([[]]);
  expect(second.mock.calls).toEqual([[], []]);

  unmount();
  await user.keyboard("{Escape}");
  expect(first.mock.calls).toEqual([[]]);
  expect(second.mock.calls).toEqual([[], []]);
});
