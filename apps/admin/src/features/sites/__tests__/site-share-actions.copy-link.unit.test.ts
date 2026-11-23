import { describe, expect, it, vi } from "vitest";

import { createSiteShareActions } from "../hooks/site-export-actions";
import type { SiteShare } from "../hooks/site-transfer-dependencies.hooks";

/**
 * B191: `copyLink` awaited `navigator.clipboard.writeText` with no catch, so a refused write (a
 * permission prompt dismissed, an unfocused page, an insecure context) became an unhandled promise
 * rejection while the owner saw nothing happen. These drive the real action with an injected clipboard.
 */
const share = { shareId: "share-1", url: "https://example.com/s/abc" } as SiteShare;

function actions({ writeText }: { writeText: (text: string) => Promise<void> }) {
  const setCopiedId = vi.fn();
  const setExportError = vi.fn();
  const setExportFailure = vi.fn();
  const { copyLink } = createSiteShareActions({
    revokingId: null, passwordDisplay: { hidePassword: vi.fn() }, setRevokingId: vi.fn(), setExportError, setExportFailure,
    port: {}, t: (key: string) => key, invalidate: vi.fn(), scope: { queryScope: "scope" }, clipboard: { writeText },
    credentials: { credentialGate: () => null }, setCopiedId,
  } as never);
  return { copyLink, setCopiedId, setExportError, setExportFailure };
}

describe("createSiteShareActions.copyLink", () => {
  it("marks the link copied after a successful write", async () => {
    const writeText = vi.fn(async () => {});
    const { copyLink, setCopiedId, setExportFailure } = actions({ writeText });
    await copyLink(share);
    expect(writeText).toHaveBeenCalledWith("https://example.com/s/abc");
    expect(setCopiedId).toHaveBeenCalledWith("share-1");
    expect(setExportFailure).not.toHaveBeenCalled();
  });

  it("catches a rejected write, tells the owner in plain words and does not mark the link copied", async () => {
    const writeText = vi.fn(async () => { throw Object.assign(new Error("Write permission denied."), { name: "NotAllowedError" }); });
    const { copyLink, setCopiedId, setExportError, setExportFailure } = actions({ writeText });
    // An unhandled rejection would fail the run; the action must resolve.
    await expect(copyLink(share)).resolves.toBeUndefined();
    expect(setCopiedId).not.toHaveBeenCalled();
    expect(setExportError).toHaveBeenCalledWith(null);
    const failure = setExportFailure.mock.calls.at(-1)?.[0];
    expect(failure.message).toBe("Couldn't copy the link to your clipboard.");
    expect(failure.step).toBe("copy link");
    expect(failure.cause).toMatch(/NotAllowedError/);
  });
});
