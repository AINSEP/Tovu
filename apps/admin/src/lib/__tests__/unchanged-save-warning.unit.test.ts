import { describe, expect, it, vi } from "vitest";
import { unchangedSaveHandlers } from "../unchanged-save-warning";

// An open Interactive text session only reports its edit when it closes, so `dirty` is still false
// at the moment Save is pressed; Save must flush first instead of showing "Nothing changed".
describe("unchangedSaveHandlers pending-edit flush", () => {
  const harness = (outcome: "changed" | "unchanged" | "failed") => {
    const save = vi.fn(async () => {});
    const setConfirmingUnchangedSave = vi.fn();
    const flushPendingEdits = vi.fn(async () => outcome);
    const handlers = unchangedSaveHandlers({ dirty: false, save, setConfirmingUnchangedSave }, { flushPendingEdits });
    return { save, setConfirmingUnchangedSave, flushPendingEdits, handlers };
  };

  it("saves without the warning when the flush surfaces an unsaved edit", async () => {
    const { save, setConfirmingUnchangedSave, flushPendingEdits, handlers } = harness("changed");
    handlers.onSave();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(flushPendingEdits).toHaveBeenCalledTimes(1);
    expect(setConfirmingUnchangedSave).not.toHaveBeenCalled();
  });

  it("still warns when the flush finds nothing new", async () => {
    const { save, setConfirmingUnchangedSave, handlers } = harness("unchanged");
    handlers.onSave();
    await vi.waitFor(() => expect(setConfirmingUnchangedSave).toHaveBeenCalledWith(true));
    expect(save).not.toHaveBeenCalled();
  });

  it("neither saves nor warns when the flush failed (it showed its own error)", async () => {
    const { save, setConfirmingUnchangedSave, flushPendingEdits, handlers } = harness("failed");
    handlers.onSave();
    await vi.waitFor(() => expect(flushPendingEdits).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(save).not.toHaveBeenCalled();
    expect(setConfirmingUnchangedSave).not.toHaveBeenCalled();
  });

  it("a dirty editor saves straight away without flushing twice", async () => {
    const save = vi.fn(async () => {});
    const flushPendingEdits = vi.fn(async () => "changed" as const);
    unchangedSaveHandlers({ dirty: true, save, setConfirmingUnchangedSave: vi.fn() }, { flushPendingEdits }).onSave();
    expect(save).toHaveBeenCalledTimes(1);
    expect(flushPendingEdits).not.toHaveBeenCalled();
  });
});
