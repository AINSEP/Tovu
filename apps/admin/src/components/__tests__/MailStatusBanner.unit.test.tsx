import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MailStatusBanner } from "../MailStatusBanner/MailStatusBanner";
import { MAIL_UNCONFIGURED_TEXT, mailStatusBannerText } from "../MailStatusBanner/hooks/use-mail-status-banner.hooks";

/**
 * @file The blocking mail banner: shown only for `state: "unconfigured"`, silent for every other
 * state and for a failed status read (it must never block the admin on its own fetch).
 */

describe("mailStatusBannerText", () => {
  it("names the missing provider only when unconfigured", () => {
    expect(mailStatusBannerText({ status: { mailDeliveryAvailable: false, state: "unconfigured" } })).toBe(MAIL_UNCONFIGURED_TEXT);
    expect(mailStatusBannerText({ status: { mailDeliveryAvailable: true, state: "ready" } })).toBeNull();
    expect(mailStatusBannerText({ status: { mailDeliveryAvailable: true, state: "degraded" } })).toBeNull();
    expect(mailStatusBannerText({ status: { mailDeliveryAvailable: false } })).toBeNull();
    expect(mailStatusBannerText({ status: null })).toBeNull();
  });
});

describe("MailStatusBanner", () => {
  it("renders a blocking alert once the status says unconfigured", async () => {
    const fetchStatus = vi.fn(async () => ({ mailDeliveryAvailable: false, state: "unconfigured" as const }));
    render(<MailStatusBanner fetchStatus={fetchStatus} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(MAIL_UNCONFIGURED_TEXT);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when mail is ready", async () => {
    const fetchStatus = vi.fn(async () => ({ mailDeliveryAvailable: true, state: "ready" as const }));
    const { container } = render(<MailStatusBanner fetchStatus={fetchStatus} />);
    await vi.waitFor(() => expect(fetchStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the status read fails", async () => {
    const fetchStatus = vi.fn(async () => { throw new Error("403"); });
    const { container } = render(<MailStatusBanner fetchStatus={fetchStatus} />);
    await vi.waitFor(() => expect(fetchStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("ignores a status that arrives after unmount", async () => {
    let resolve: (value: { mailDeliveryAvailable: boolean; state: "unconfigured" }) => void = () => {};
    const fetchStatus = vi.fn(() => new Promise<{ mailDeliveryAvailable: boolean; state: "unconfigured" }>((done) => { resolve = done; }));
    const { unmount } = render(<MailStatusBanner fetchStatus={fetchStatus} />);
    unmount();
    resolve({ mailDeliveryAvailable: false, state: "unconfigured" });
    await Promise.resolve();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
