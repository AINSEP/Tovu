import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useComposioKeyField } from "../hooks/use-composio-key-field.hooks";
import type { ComposioConfigController } from "../hooks/use-composio-config.hooks";

/** Identity translator — these tests exercise the draft/save state `useComposioKeyField` derives
 *  from `composio`, not translated copy (that's `composio-i18n.unit.test.ts`'s job), so `t` only
 *  needs to satisfy the signature. */
const fakeT = (key: string): string => key;

/**
 * @file `useComposioKeyField` — the draft-input state extracted out of `ComposioKeyField.tsx`.
 * Pins the hook's own contract against a hand-built `ComposioConfigController` fixture (there is no
 * existing fake-port helper for this controller to reuse — `use-composio-config.hooks.ts` itself
 * has no test file yet): `configured`/`busy` derive from the controller, `onSave` trims and is a
 * no-op on blank input, and `draft` clears after a save (even a failed one).
 */

function makeController(overrides: Partial<ComposioConfigController> = {}): ComposioConfigController {
  return {
    config: null,
    unlocked: false,
    loadError: null,
    saveState: "idle",
    saveError: null,
    catalogRefreshKey: 0,
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("useComposioKeyField", () => {
  it("starts with an empty draft", () => {
    const { result } = renderHook(() => useComposioKeyField(makeController(), fakeT));
    expect(result.current.draft).toBe("");
  });

  it("configured mirrors composio.config.configured", () => {
    const { result: unconfigured } = renderHook(() =>
      useComposioKeyField(makeController({ config: { configured: false, apiKeyTail: "" } }), fakeT),
    );
    expect(unconfigured.current.configured).toBe(false);

    const { result: configured } = renderHook(() =>
      useComposioKeyField(makeController({ config: { configured: true, apiKeyTail: "abcd" } }), fakeT),
    );
    expect(configured.current.configured).toBe(true);
  });

  it("busy is true only while saveState is saving", () => {
    const { result } = renderHook(() => useComposioKeyField(makeController({ saveState: "saving" }), fakeT));
    expect(result.current.busy).toBe(true);
  });

  it("onSave is a no-op on a blank or whitespace-only draft", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useComposioKeyField(makeController({ save }), fakeT));

    act(() => result.current.setDraft("   "));
    await act(async () => {
      await result.current.onSave();
    });

    expect(save).not.toHaveBeenCalled();
  });

  it("onSave trims the draft, calls composio.save, and clears the draft on success", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useComposioKeyField(makeController({ save }), fakeT));

    act(() => result.current.setDraft("  comp_secret  "));
    await act(async () => {
      await result.current.onSave();
    });

    expect(save).toHaveBeenCalledWith("comp_secret");
    expect(result.current.draft).toBe("");
  });

  it("ignores a second onSave call while the first is still in flight — a genuine no-op, not a second save", async () => {
    const resolvers: Array<() => void> = [];
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { result } = renderHook(() => useComposioKeyField(makeController({ save }), fakeT));

    act(() => result.current.setDraft("comp_secret"));
    // Both calls synchronous, in the SAME tick — a real double-click can land before React
    // re-renders with `busy: true`, so the guard has to be a synchronous check-then-set, not a wait
    // for `busy`/`saveState` to reflect the first click.
    let firstCall!: Promise<void>;
    let secondCall!: Promise<void>;
    act(() => {
      firstCall = result.current.onSave();
      secondCall = result.current.onSave();
    });
    await act(async () => {
      for (const resolve of resolvers) resolve();
      await firstCall;
      await secondCall;
    });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("allows a later onSave once the in-flight one has settled", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useComposioKeyField(makeController({ save }), fakeT));

    act(() => result.current.setDraft("comp_first"));
    await act(async () => {
      await result.current.onSave();
    });

    act(() => result.current.setDraft("comp_second"));
    await act(async () => {
      await result.current.onSave();
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(2, "comp_second");
  });

  it("does NOT clear the draft when composio.save rejects — the `await` short-circuits before setDraft", async () => {
    // `composio.save` is `useComposioConfig`'s `write`, which catches internally and never
    // rejects in production — so this path is unreachable with the real wired hook. Pinned here
    // anyway because the source comment above `setDraft("")` (moved verbatim from the
    // pre-extraction component) claims the clear is "unconditional," which is only true because
    // `save` never rejects; if a caller ever substitutes a rejecting `save`, the `await` throws
    // and this line never runs — a real gap between the comment and the code, reported rather
    // than silently "fixed" here (behavior must not change in this pass).
    const save = vi.fn().mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useComposioKeyField(makeController({ save }), fakeT));

    act(() => result.current.setDraft("comp_secret"));
    await expect(
      act(async () => {
        await result.current.onSave();
      }),
    ).rejects.toThrow("network down");

    expect(result.current.draft).toBe("comp_secret");
  });
});
