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

/** sol packet-3 finding 3-1: the Generate button used to show whenever `!status.active`, which
 *  includes an existing-but-invalid key file — a state where the server always 409s
 *  `ALREADY_EXISTS` (it only ever creates, never overwrites). Generate must be offered only for
 *  the genuinely decidable case: no key at all. */
describe("SiteTokenTab — Generate gating (sol finding 3-1)", () => {
  const NO_KEY_STATUS: AdminSiteTokenStatus = {
    active: false,
    source: "none",
    keyFilePath: "/data/tovu/integrations-root-key.hex",
    runtimeMode: "local",
  };

  const INVALID_FILE_STATUS: AdminSiteTokenStatus = {
    active: false,
    source: "file",
    invalid: true,
    keyFilePath: "/data/tovu/integrations-root-key.hex",
    runtimeMode: "production",
  };

  const INVALID_ENV_STATUS: AdminSiteTokenStatus = {
    active: false,
    source: "env",
    invalid: true,
    keyFilePath: "/data/tovu/integrations-root-key.hex",
    runtimeMode: "production",
  };

  it("shows Generate when there is no key at all", () => {
    renderTab(NO_KEY_STATUS);

    expect(screen.getByRole("button", { name: "Generate a key" })).toBeInTheDocument();
  });

  it("hides Generate when the existing key file is invalid — Generate can only create, never replace it", () => {
    renderTab(INVALID_FILE_STATUS);

    expect(screen.queryByRole("button", { name: "Generate a key" })).not.toBeInTheDocument();
  });

  it("hides Generate when an invalid env var is already active — that source always wins regardless of validity", () => {
    renderTab(INVALID_ENV_STATUS);

    expect(screen.queryByRole("button", { name: "Generate a key" })).not.toBeInTheDocument();
  });

  it("tells the operator honestly that this tab can't replace an invalid key file yet, instead of promising a control that isn't there", () => {
    renderTab(INVALID_FILE_STATUS);

    // The sentence sits alongside "The key file at <code>…</code>" in the same <p>, so it is
    // matched by substring (not full-node exact text) against that paragraph's combined content.
    expect(screen.getByText(/It will need to be replaced by hand on the server — this tab can't do that yet\./)).toBeInTheDocument();
  });
});
