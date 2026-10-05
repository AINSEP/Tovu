import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, type AdminSiteKeyStatus } from "@/lib/api";
import { isSiteKeyLocked, useSiteKeyRecovery, type SiteKeyRecoveryPort } from "../hooks/use-site-key-recovery.hooks";

/**
 * @file The Site key tab's recovery controller (`use-site-key-recovery.hooks.ts`): "Paste your
 * old token" and "Start fresh" against a fake port. Refusals show the server's own sentence.
 */

const t = (key: string): string => key;
const HEX = "ab".repeat(32);

const PREVIEW = {
  removes: 2,
  affectedWebhooks: [{ label: "Order sync", targetUrl: "https://hooks.example.test/orders" }],
  detail: "2 saved credentials can't be unlocked and will be removed. These webhooks get a new signing secret, so update their receivers: Order sync (https://hooks.example.test/orders).",
  runtimeMode: "local" as const,
};

function makePort(overrides: Partial<SiteKeyRecoveryPort> = {}): SiteKeyRecoveryPort {
  return {
    importSiteKey: vi.fn(async () => ({ outcome: "unlocked" as const, fingerprint: "fp", keyFilePath: "/k", resealed: 0, runtimeMode: "local" as const })),
    previewStartFresh: vi.fn(async () => PREVIEW),
    startFresh: vi.fn(async () => ({
      outcome: "started-fresh" as const, fingerprint: "fp2", keyFilePath: "/k", discarded: 2, kept: 0, restorePointId: "rp-1",
      affectedWebhooks: PREVIEW.affectedWebhooks, runtimeMode: "local" as const,
    })),
    ...overrides,
  };
}

function status(state: AdminSiteKeyStatus["state"]): AdminSiteKeyStatus {
  return { active: state === "mismatch" || state === "active", source: "file", keyFilePath: "/k", runtimeMode: "local", state };
}

describe("isSiteKeyLocked", () => {
  it("is true for missing-with-data and mismatch, or after generate was refused as locked", () => {
    expect(isSiteKeyLocked(status("missing-with-data"), null)).toBe(true);
    expect(isSiteKeyLocked(status("mismatch"), null)).toBe(true);
    expect(isSiteKeyLocked(status("missing"), { kind: "locked", code: "KEY_DEPENDENT_DATA", detail: "x" })).toBe(true);
    expect(isSiteKeyLocked(status("active"), null)).toBe(false);
    expect(isSiteKeyLocked(status("missing"), null)).toBe(false);
    expect(isSiteKeyLocked(undefined, null)).toBe(false);
  });
});

describe("useSiteKeyRecovery — Paste your old site key", () => {
  it("unlocks with the pasted token, clears it from state, reports the result and refreshes the tab", async () => {
    const port = makePort({ importSiteKey: vi.fn(async () => ({ outcome: "unlocked" as const, fingerprint: "fp", keyFilePath: "/k", resealed: 2, runtimeMode: "local" as const })) });
    const onRecovered = vi.fn(async () => {});
    const { result } = renderHook(() => useSiteKeyRecovery(port, t, onRecovered));

    act(() => result.current.setSiteKey(`  ${HEX}\n`));
    await act(async () => result.current.unlock());

    expect(port.importSiteKey).toHaveBeenCalledWith(HEX);
    expect(result.current.siteKey).toBe("");
    expect(result.current.unlockError).toBeNull();
    expect(result.current.resultMessage).toBe("Unlocked. Your saved credentials work again. 2 saved since were moved over.");
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });

  it("shows the server's sentence when the token doesn't open anything, and keeps the input", async () => {
    const detail = "That site key does not open this site's saved credentials. Nothing was changed.";
    const port = makePort({ importSiteKey: vi.fn(async () => { throw new ApiError("SITE_KEY_DOES_NOT_OPEN", 409, undefined, { error: "SITE_KEY_DOES_NOT_OPEN", detail }); }) });
    const onRecovered = vi.fn();
    const { result } = renderHook(() => useSiteKeyRecovery(port, t, onRecovered));

    act(() => result.current.setSiteKey(HEX));
    await act(async () => result.current.unlock());

    expect(result.current.unlockError).toBe(detail);
    expect(result.current.siteKey).toBe(HEX);
    expect(result.current.resultMessage).toBeNull();
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it("does nothing for an empty paste", async () => {
    const port = makePort();
    const { result } = renderHook(() => useSiteKeyRecovery(port, t, vi.fn()));

    await act(async () => result.current.unlock());

    expect(port.importSiteKey).not.toHaveBeenCalled();
  });
});

describe("useSiteKeyRecovery — Start fresh", () => {
  it("loads the preview first, confirms only on the exact phrase, then names the affected webhooks", async () => {
    const port = makePort();
    const onRecovered = vi.fn(async () => {});
    const { result } = renderHook(() => useSiteKeyRecovery(port, t, onRecovered));

    await act(async () => result.current.openStartFresh());
    expect(result.current.startFreshStep).toBe("confirm");
    expect(result.current.preview?.detail).toBe(PREVIEW.detail);

    act(() => result.current.setConfirmText("start fresh"));
    expect(result.current.canConfirmStartFresh).toBe(false);
    await act(async () => result.current.startFresh());
    expect(port.startFresh).not.toHaveBeenCalled();

    act(() => result.current.setConfirmText("START FRESH"));
    expect(result.current.canConfirmStartFresh).toBe(true);
    await act(async () => result.current.startFresh());

    expect(port.startFresh).toHaveBeenCalledWith("START FRESH");
    expect(result.current.startFreshStep).toBe("closed");
    expect(result.current.resultMessage).toBe(
      "Done. Re-enter any credentials that were removed. Update these webhooks' receivers with their new signing secret: Order sync (https://hooks.example.test/orders)."
    );
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });

  it("shows the server's sentence when start fresh is refused, and keeps the confirm step open", async () => {
    const detail = "A restore point can't be made for this site's database right now, so nothing was changed.";
    const port = makePort({ startFresh: vi.fn(async () => { throw new ApiError("RESTORE_POINT_UNAVAILABLE", 409, undefined, { error: "RESTORE_POINT_UNAVAILABLE", detail }); }) });
    const { result } = renderHook(() => useSiteKeyRecovery(port, t, vi.fn()));

    await act(async () => result.current.openStartFresh());
    act(() => result.current.setConfirmText("START FRESH"));
    await act(async () => result.current.startFresh());

    expect(result.current.startFreshError).toBe(detail);
    expect(result.current.startFreshStep).toBe("confirm");
    expect(result.current.resultMessage).toBeNull();
  });

  it("cancel closes the confirm step and clears the typed phrase", async () => {
    const { result } = renderHook(() => useSiteKeyRecovery(makePort(), t, vi.fn()));

    await act(async () => result.current.openStartFresh());
    act(() => result.current.setConfirmText("START"));
    act(() => result.current.cancelStartFresh());

    expect(result.current.startFreshStep).toBe("closed");
    expect(result.current.confirmText).toBe("");
  });
});
