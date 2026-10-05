import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import userEvent from "@testing-library/user-event";

import { SiteKeyTab } from "../SiteKeyTab";
import type { SiteKeyController } from "../hooks/use-site-key.hooks";
import type { SiteKeyRecoveryController } from "../hooks/use-site-key-recovery.hooks";
import { AGENT_PRIVATE_ATTRIBUTE } from "@jini-ai/agentic";
import type { AdminSiteKeyStatus } from "@/lib/api";

/**
 * @file First dedicated test file for `SiteKeyTab.tsx`. It exists because the 2026-09-09 copy
 * pass (`27e16a1e` — "Site key" as the canonical label, plus the added "Fingerprint" label and the
 * rewritten scope notice) shipped with no assertion that would fail if any of that wording
 * regressed; until now `Security.unit.test.tsx` only mounted this tab's shell, and its own header
 * noted there was no `*.unit.test.tsx` here. Each test below pins one of the strings that pass
 * introduced, because they are the user-facing names an operator reads, not incidental markup.
 */

const ACTIVE_FILE_STATUS: AdminSiteKeyStatus = {
  active: true,
  source: "file",
  fingerprint: "a1b2c3d4e5f6",
  keyFilePath: "/data/tovu/site-key",
  runtimeMode: "production",
  state: "active",
};

/** Minimal `SiteKeyController` fake — same shape `Security.unit.test.tsx` uses, with the
 *  `status` override being the only thing any test here varies. */
function makeSiteKey(overrides: Partial<SiteKeyController> = {}): SiteKeyController {
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
    refresh: async () => {},
    t: (key: string) => key,
    ...overrides,
  };
}

function renderTab(status: AdminSiteKeyStatus = ACTIVE_FILE_STATUS) {
  return render(<SiteKeyTab useSiteKeyHook={() => makeSiteKey({ status })} />);
}

describe("SiteKeyTab — status card copy", () => {
  it('labels the section "Site key" with the canonical terminology', () => {
    renderTab();

    expect(screen.getByRole("heading", { name: "Site key" })).toBeInTheDocument();
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

/** Site-key plan (2026-09-24) item 3: the "none" status note used to promise that clicking
 *  Generate would create and save the key file — stale ever since Generate was hidden by default
 *  (§A.6) in favor of automatic creation at boot (`ensureSiteKeyForBoot`). The copy must say what
 *  actually happens now, not describe a control that isn't on the page. */
describe("SiteKeyTab — 'no key yet' copy is terse and true (site-key plan item 3)", () => {
  const NO_KEY_STATUS: AdminSiteKeyStatus = {
    active: false,
    source: "none",
    keyFilePath: "/data/tovu/site-keys/abc123.hex",
    runtimeMode: "local",
    state: "missing",
  };

  it("says a key is created automatically, not that Generating one would save it", () => {
    renderTab(NO_KEY_STATUS);

    expect(screen.getByText("A key is created automatically when this site starts.")).toBeInTheDocument();
    expect(screen.queryByText(/Generating one saves it to/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No key has been created yet\./)).not.toBeInTheDocument();
  });
});

/** sol packet-3 finding 3-1: the Generate button used to show whenever `!status.active`, which
 *  includes an existing-but-invalid key file — a state where the server always 409s
 *  `ALREADY_EXISTS` (it only ever creates, never overwrites). Generate must be offered only for
 *  the genuinely decidable case: no key at all. */
describe("SiteKeyTab — Generate gating (sol finding 3-1)", () => {
  const NO_KEY_STATUS: AdminSiteKeyStatus = {
    active: false,
    source: "none",
    keyFilePath: `/data/tovu/site-key.hex`,
    runtimeMode: "local",
    state: "missing",
  };

  const INVALID_FILE_STATUS: AdminSiteKeyStatus = {
    active: false,
    source: "file",
    invalid: true,
    keyFilePath: `/data/tovu/site-key.hex`,
    runtimeMode: "production",
    state: "invalid",
  };

  const INVALID_ENV_STATUS: AdminSiteKeyStatus = {
    active: false,
    source: "env",
    invalid: true,
    keyFilePath: `/data/tovu/site-key.hex`,
    runtimeMode: "production",
    state: "invalid",
  };

  it("hides Generate even when there is no key at all — site-key plan §A.6: kept but hidden by default", () => {
    renderTab(NO_KEY_STATUS);

    expect(screen.queryByRole("button", { name: "Generate a key" })).not.toBeInTheDocument();
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

/** The locked site's recovery card (design 2026-09-14 §4.3/§4.6): two actions, terse copy, one
 *  typed confirmation for Start fresh. The card only renders; `useSiteKeyRecovery` owns state. */
describe("SiteKeyTab — recovery card for a locked site", () => {
  const MISMATCH_STATUS: AdminSiteKeyStatus = {
    active: true,
    source: "file",
    fingerprint: "ffff00001111",
    keyFilePath: "/home/me/.tovu/site-keys/site.hex",
    runtimeMode: "local",
    state: "mismatch",
  };

  function makeRecovery(overrides: Partial<SiteKeyRecoveryController> = {}): SiteKeyRecoveryController {
    return {
      siteKey: "",
      setSiteKey: () => {},
      unlocking: false,
      unlockError: null,
      unlock: async () => {},
      startFreshStep: "closed",
      preview: null,
      openStartFresh: async () => {},
      cancelStartFresh: () => {},
      confirmText: "",
      setConfirmText: () => {},
      canConfirmStartFresh: false,
      startingFresh: false,
      startFreshError: null,
      startFresh: async () => {},
      resultMessage: null,
      t: (key: string) => key,
      ...overrides,
    };
  }

  function renderLocked(status: AdminSiteKeyStatus, recovery: Partial<SiteKeyRecoveryController> = {}) {
    return render(
      <SiteKeyTab useSiteKeyHook={() => makeSiteKey({ status })} useSiteKeyRecoveryHook={() => makeRecovery(recovery)} />
    );
  }

  it("offers both actions when the site's credentials are locked", () => {
    renderLocked(MISMATCH_STATUS);

    expect(screen.getByRole("heading", { name: "Your saved credentials are locked" })).toBeInTheDocument();
    expect(screen.getByLabelText("Paste your old site key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start fresh…" })).toBeInTheDocument();
    expect(screen.getByText("Lost it? A restore point is saved first, then only the credentials that can't be unlocked are removed.")).toBeInTheDocument();
  });

  it("does not show the card when the key is fine", () => {
    renderLocked(ACTIVE_FILE_STATUS);

    expect(screen.queryByRole("heading", { name: "Your saved credentials are locked" })).not.toBeInTheDocument();
  });

  it("the confirm step shows the preview sentence and keeps Start fresh disabled until the phrase is typed", () => {
    renderLocked(MISMATCH_STATUS, {
      startFreshStep: "confirm",
      preview: { removes: 1, affectedWebhooks: [], detail: "1 saved credential can't be unlocked and will be removed.", runtimeMode: "local" },
      confirmText: "START",
    });

    expect(screen.getByText("1 saved credential can't be unlocked and will be removed.")).toBeInTheDocument();
    expect(screen.getByLabelText("Type START FRESH to confirm")).toHaveValue("START");
    expect(screen.getByRole("button", { name: "Start fresh" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("forwards the typed token and Unlock and Start fresh actions", async () => {
    const user = userEvent.setup();
    const setSiteKey = vi.fn();
    const unlock = vi.fn(async () => {});
    const openStartFresh = vi.fn(async () => {});
    renderLocked(MISMATCH_STATUS, { siteKey: "old-token", setSiteKey, unlock, openStartFresh });
    await user.type(screen.getByLabelText("Paste your old site key"), "x");
    expect(setSiteKey).toHaveBeenCalledWith("old-tokenx");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(unlock).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Start fresh…" }));
    expect(openStartFresh).toHaveBeenCalledTimes(1);
  });

  it("forwards the confirmation text, enables Start fresh when allowed, and wires Cancel", async () => {
    const user = userEvent.setup();
    const setConfirmText = vi.fn();
    const startFresh = vi.fn(async () => {});
    const cancelStartFresh = vi.fn();
    renderLocked(MISMATCH_STATUS, { startFreshStep: "confirm", canConfirmStartFresh: true, setConfirmText, startFresh, cancelStartFresh });
    fireEvent.change(screen.getByLabelText("Type START FRESH to confirm"), { target: { value: "START FRESH" } });
    expect(setConfirmText).toHaveBeenCalledWith("START FRESH");
    const confirm = screen.getByRole("button", { name: "Start fresh" });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(startFresh).toHaveBeenCalledTimes(1);
    expect(cancelStartFresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelStartFresh).toHaveBeenCalledTimes(1);
    expect(startFresh).toHaveBeenCalledTimes(1);
  });

  it("the pasted token field is a password field hidden from the assistant", () => {
    renderLocked(MISMATCH_STATUS, { siteKey: "abc" });

    const input = screen.getByLabelText("Paste your old site key");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute(AGENT_PRIVATE_ATTRIBUTE);
  });

  it("keeps the card up with the result sentence after recovery, even once the status is active again", () => {
    renderLocked(ACTIVE_FILE_STATUS, { resultMessage: "Unlocked. Your saved credentials work again." });

    expect(screen.getByText("Unlocked. Your saved credentials work again.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unlock" })).not.toBeInTheDocument();
  });
});

/** A locked site's status card must not promise a key will be made at startup — boot refuses to
 *  mint over saved credentials. It points at the recovery card instead. */
describe("SiteKeyTab — status note for a locked site", () => {
  const LOCKED_NOTE = "Your credentials need their original site key — use the card above.";

  it("missing-with-data: says the credentials need their original site key, not that a key is created at startup", () => {
    renderTab({ active: false, source: "none", keyFilePath: "/k", runtimeMode: "local", state: "missing-with-data" });

    expect(screen.getByText(LOCKED_NOTE)).toBeInTheDocument();
    expect(screen.queryByText("A key is created automatically when this site starts.")).not.toBeInTheDocument();
  });

  it("mismatch: shows the same line", () => {
    renderTab({ active: true, source: "file", fingerprint: "ffff00001111", keyFilePath: "/k", runtimeMode: "local", state: "mismatch" });

    expect(screen.getByText(LOCKED_NOTE)).toBeInTheDocument();
  });

  it("a plain missing key keeps the startup line", () => {
    renderTab({ active: false, source: "none", keyFilePath: "/k", runtimeMode: "local", state: "missing" });

    expect(screen.getByText("A key is created automatically when this site starts.")).toBeInTheDocument();
  });
});

it("shows the env-conflict note without offering key recovery or Generate", () => {
  renderTab({ active: false, source: "env", reason: "env-conflict", invalid: true, keyFilePath: "", runtimeMode: "production", state: "env-conflict" });
  expect(screen.getByText("Site key environment variables conflict. Set TOVU_SITE_KEY to the existing site key and remove the deprecated variable; nothing was changed.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Generate a key" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Unlock" })).not.toBeInTheDocument();
});
