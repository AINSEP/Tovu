import { renderHook, waitFor, render, screen } from "@/__tests__/fetch-query-render";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/admin-http/request";
import { useJiniMediaPicker } from "../JiniMediaPicker.hooks";
import { MediaPickerDialog } from "../MediaPickerDialog";

const { pick, picker } = vi.hoisted(() => { const pick = vi.fn(); return { pick, picker: { pick } }; });
vi.mock("@/integrations/jini-admin/module-context", () => ({ useHostMediaPicker: () => picker }));
afterEach(() => vi.resetAllMocks());

it("retains the API incident with redacted picker evidence and a cancel action", async () => {
  const cause = new ApiError({ message: "password=PICKER_CANARY", status: 500 }, { body: { errorId: "picker-incident" } });
  pick.mockRejectedValue(cause);
  const props = { onSelect: vi.fn(), onCancel: vi.fn() };
  const { result } = renderHook(() => useJiniMediaPicker(props));
  await waitFor(() => expect(result.current.error).toMatchObject({ errorId: "picker-incident" }));
  expect(JSON.stringify(result.current.error)).not.toContain("PICKER_CANARY");
  render(<MediaPickerDialog {...props} useJiniMediaPickerHook={() => result.current} useAdminLocaleHook={() => "es"} />);
  expect(screen.getByRole("button", { name: "Cancelar" }), "the picker error's cancel action uses the admin locale").toBeTruthy();
  expect(screen.getByText(/picker-incident/)).toBeTruthy();
});

it("suppresses rejection after caller cancellation", async () => {
  let reject!: (error: unknown) => void;
  pick.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  const { result, unmount } = renderHook(() => useJiniMediaPicker({ onSelect: vi.fn(), onCancel: vi.fn() }));
  unmount();
  reject(new Error("password=ABORT_CANARY"));
  await Promise.resolve();
  expect(result.current.error).toBeNull();
});
