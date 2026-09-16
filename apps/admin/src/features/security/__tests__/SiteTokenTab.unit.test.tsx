import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteTokenTab } from "../SiteTokenTab";
import type { SiteTokenController } from "../hooks/use-site-token.hooks";
import type { AdminSiteTokenStatus } from "@/lib/api";

/**
 * @file First dedicated test file for `SiteTokenTab.tsx`. It exists because the 2026-09-09 copy
 * pass (`27e16a1e` — "Site token" replacing "Root key", plus the added "Fingerprint" label and the
 * rewritten scope notice) shipped with no assertion that would fail if any of that wording
 * regressed; until now `Security.unit.test.tsx` only mounted this tab's shell, and its own header
 * noted there was no `*.unit.test.tsx` here. Each test below pins one of the strings that pass
 * introduced, because they are the user-facing names an operator reads, not incidental markup.
 */

const ACTIVE_FILE_STATUS: AdminSiteTokenStatus = {
  active: true,
  source: "file",
  fingerprint: "a1b2c3d4e5f6",
  keyFilePath: "/data/tovu/integrations-root-key",
  runtimeMode: "production",
};

/** Minimal `SiteTokenController` fake — same shape `Security.unit.test.tsx` uses, with the
 *  `status` override being the only thing any test here varies. */
function makeSiteToken(overrides: Partial<SiteTokenController> = {}): SiteTokenController {
  return {
    status: undefined,
    loadError: null,
    revealing: false,
    revealError: null,
    revealedHex: null,
    reveal: async () => {},
    hideRevealed: () => {},
    generating: false,
    generateError: null,
    generate: async () => {},
    t: (key: string) => key,
    ...overrides,
  };
}

function renderTab(status: AdminSiteTokenStatus = ACTIVE_FILE_STATUS) {
  return render(<SiteTokenTab useSiteTokenHook={() => makeSiteToken({ status })} />);
}

describe("SiteTokenTab — status card copy", () => {
  it('labels the section "Site token", not the older "Root key" wording', () => {
    renderTab();

    expect(screen.getByRole("heading", { name: "Site token" })).toBeInTheDocument();
  });

  it("renders the fingerprint label beside the active key's fingerprint", () => {
    renderTab();

    expect(screen.getByText("Fingerprint")).toBeInTheDocument();
    expect(screen.getByText("a1b2c3d4e5f6")).toBeInTheDocument();
  });

  it("keeps the scope notice's plain-language explanation of what the key protects", () => {
    renderTab();

    expect(
      screen.getByText(
        "This key protects the passwords, API keys, and other credentials you've saved in Tovu — including on your live site."
      )
    ).toBeInTheDocument();
  });
});
