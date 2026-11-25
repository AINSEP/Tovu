import { render, screen } from "@/__tests__/render-with-jini-kits";
import { describe, expect, it, vi } from "vitest";

import { SiteImportTab } from "../SiteImportTab";
import type { SiteImportController } from "../hooks/use-site-transfer.hooks";

/**
 * @file A337 (owner decision: by design). With the site switcher off there is no browser path to
 * start another site, so the Import tab's empty state must say how to get one, not just refuse.
 */

const t = (key: string): string => key;

function importController(): SiteImportController {
  return { nextCursor: undefined, loadingMore: false, moreError: null, loadMore: vi.fn(), reset: vi.fn(), savedKeysPassword: "", setSavedKeysPassword: vi.fn(), imports: [], listError: null, link: "", setLink: vi.fn(), file: null, chooseFiles: vi.fn(), clearFile: vi.fn(),
    canImport: false, importing: false, importError: null, startImport: vi.fn(async () => {}), current: null, resume: vi.fn(),
    password: "", setPassword: vi.fn(), confirm: "", setConfirm: vi.fn(), passwordProblem: null, settingOwner: false,
    ownerError: null, completeOwner: vi.fn(async () => {}), liveAddress: "", setLiveAddress: vi.fn(),
    liveAddressValid: false, startLiveImport: vi.fn(), arrivedForImport: false };
}

const HOW_TO_ADD = "To add another site, run Tovu on your own computer with the site switcher on (set TOVU_ENABLE_SITE_SWITCHER=1; npm run dev already does).";

describe("site switcher off: how to add another site", () => {
  it("explains how to add another site where this host cannot make one", () => {
    render(<SiteImportTab t={t} useImport={() => importController()} useLiveSite={() => ({ creating: false, error: null, start: vi.fn(async () => {}) })}
      useDesktop={() => ({ available: false, opening: false, error: null, open: vi.fn(async () => {}) })} canMakeSites={false} />);
    expect(screen.getByText("This host can't make new sites, so it can't import a live website here.")).toBeTruthy();
    expect(screen.getByText(HOW_TO_ADD)).toBeTruthy();
  });

  it("does not show the how-to where a site can be made", () => {
    render(<SiteImportTab t={t} useImport={() => importController()} useLiveSite={() => ({ creating: false, error: null, start: vi.fn(async () => {}) })}
      useDesktop={() => ({ available: false, opening: false, error: null, open: vi.fn(async () => {}) })} canMakeSites />);
    expect(screen.queryByText(HOW_TO_ADD)).toBeNull();
  });
});
