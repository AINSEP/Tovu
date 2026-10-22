import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MailStatusBanner } from "../MailStatusBanner/MailStatusBanner";
import {
  MAIL_BANNER_DISMISSED_KEY,
  MAIL_UNCONFIGURED_TEXT,
  mailStatusBannerText,
  readMailBannerDismissed,
  writeMailBannerDismissed,
  type MailBannerStorage,
} from "../MailStatusBanner/hooks/use-mail-status-banner.hooks";

/**
 * @file The blocking mail banner: shown only for `state: "unconfigured"`, silent for every other
 * state and for a failed status read (it must never block the admin on its own fetch). The × hides
 * it and remembers that per browser; a storage that throws still hides it for the session.
 */

/** In-memory `MailBannerStorage` fake. */
function memoryStorage(seed: Record<string, string> = {}): MailBannerStorage & { data: Record<string, string> } {
  const data = { ...seed };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}

/** A storage whose every call throws, like `localStorage` in some privacy modes. */
const throwingStorage: MailBannerStorage = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
};

const unconfigured = async () => ({ mailDeliveryAvailable: false, state: "unconfigured" as const });

beforeEach(() => localStorage.clear());

describe("mailStatusBannerText", () => {
  it("names the missing provider only when unconfigured", () => {
    expect(mailStatusBannerText({ status: { mailDeliveryAvailable: false, state: "unconfigured" } })).toBe(MAIL_UNCONFIGURED_TEXT);
    expect(mailStatusBannerText({ status: { mailDeliveryAvailable: true, state: "ready" } })).toBeNull();
    expect(mailStatusBannerText({ status: { mailDeliveryAvailable: true, state: "degraded" } })).toBeNull();
    expect(mailStatusBannerText({ status: { mailDeliveryAvailable: false } })).toBeNull();
    expect(mailStatusBannerText({ status: null })).toBeNull();
  });
});

describe("readMailBannerDismissed / writeMailBannerDismissed", () => {
  it("round-trips the dismissal through the storage port", () => {
    const storage = memoryStorage();
    expect(readMailBannerDismissed({ storage })).toBe(false);
    writeMailBannerDismissed({ storage });
    expect(storage.data[MAIL_BANNER_DISMISSED_KEY]).toBe("1");
    expect(readMailBannerDismissed({ storage })).toBe(true);
  });

  it("treats any other stored value as not dismissed", () => {
    expect(readMailBannerDismissed({ storage: memoryStorage({ [MAIL_BANNER_DISMISSED_KEY]: "0" }) })).toBe(false);
  });

  it("never throws when storage does", () => {
    expect(readMailBannerDismissed({ storage: throwingStorage })).toBe(false);
    expect(() => writeMailBannerDismissed({ storage: throwingStorage })).not.toThrow();
  });
});

describe("MailStatusBanner", () => {
  it("renders a blocking alert once the status says unconfigured", async () => {
    const fetchStatus = vi.fn(async () => ({ mailDeliveryAvailable: false, state: "unconfigured" as const }));
    render(<MailStatusBanner fetchStatus={fetchStatus} dismissLabel="Dismiss" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(MAIL_UNCONFIGURED_TEXT);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when mail is ready", async () => {
    const fetchStatus = vi.fn(async () => ({ mailDeliveryAvailable: true, state: "ready" as const }));
    const { container } = render(<MailStatusBanner fetchStatus={fetchStatus} dismissLabel="Dismiss" />);
    await vi.waitFor(() => expect(fetchStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the status read fails", async () => {
    const fetchStatus = vi.fn(async () => { throw new Error("403"); });
    const { container } = render(<MailStatusBanner fetchStatus={fetchStatus} dismissLabel="Dismiss" />);
    await vi.waitFor(() => expect(fetchStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("ignores a status that arrives after unmount", async () => {
    let resolve: (value: { mailDeliveryAvailable: boolean; state: "unconfigured" }) => void = () => {};
    const fetchStatus = vi.fn(() => new Promise<{ mailDeliveryAvailable: boolean; state: "unconfigured" }>((done) => { resolve = done; }));
    const { unmount } = render(<MailStatusBanner fetchStatus={fetchStatus} dismissLabel="Dismiss" />);
    unmount();
    resolve({ mailDeliveryAvailable: false, state: "unconfigured" });
    await Promise.resolve();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("× hides the banner and remembers it in the injected storage", async () => {
    const storage = memoryStorage();
    render(<MailStatusBanner fetchStatus={unconfigured} dismissLabel="Descartar" storage={storage} />);
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(storage.data[MAIL_BANNER_DISMISSED_KEY]).toBe("1");
  });

  it("stays hidden on the next mount once dismissed", async () => {
    const fetchStatus = vi.fn(unconfigured);
    const storage = memoryStorage({ [MAIL_BANNER_DISMISSED_KEY]: "1" });
    const { container } = render(<MailStatusBanner fetchStatus={fetchStatus} dismissLabel="Dismiss" storage={storage} />);
    await vi.waitFor(() => expect(fetchStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("still hides for the session when storage throws", async () => {
    render(<MailStatusBanner fetchStatus={unconfigured} dismissLabel="Dismiss" storage={throwingStorage} />);
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("defaults to the browser's localStorage", async () => {
    const first = render(<MailStatusBanner fetchStatus={unconfigured} dismissLabel="Dismiss" />);
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(localStorage.getItem(MAIL_BANNER_DISMISSED_KEY)).toBe("1");
    first.unmount();
    const fetchStatus = vi.fn(unconfigured);
    const { container } = render(<MailStatusBanner fetchStatus={fetchStatus} dismissLabel="Dismiss" />);
    await vi.waitFor(() => expect(fetchStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
