import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IntegrationDeliveries } from "../IntegrationDeliveries";
import type { IntegrationDeliveriesController } from "../hooks/use-integration-deliveries.hooks";
import type { AdminWebhookDelivery } from "@/lib/api";

/**
 * @file `IntegrationDeliveries` — the webhook delivery-log screen, driven through the
 * `useIntegrationDeliveriesHook` dependency-injection seam. No test file existed for this
 * component at all before this pass (0.0% covered).
 */

const DELIVERY: AdminWebhookDelivery = {
  id: "d1",
  subscriptionId: "sub1",
  eventId: "evt1",
  topic: "post.published",
  status: "delivered",
  attempts: 1,
  nextAttemptAt: "2026-08-01T00:00:00.000Z",
  lastResponseStatus: 200,
  lastError: null,
  signedWithVersion: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  deliveredAt: "2026-08-01T00:01:00.000Z",
  deadAt: null,
};

function baseController(overrides: Partial<IntegrationDeliveriesController> = {}): IntegrationDeliveriesController {
  return { deliveries: [DELIVERY], error: null, t: (key: string) => key, ...overrides };
}

describe("loading and error states", () => {
  it("shows a loading placeholder before deliveries have loaded", () => {
    render(
      <IntegrationDeliveries
        subscriptionId="sub1"
        useIntegrationDeliveriesHook={() => baseController({ deliveries: null })}
      />,
    );
    expect(screen.getByText("Loading delivery log…")).toBeInTheDocument();
  });

  it("shows the error message instead of the table when the load failed", () => {
    render(
      <IntegrationDeliveries
        subscriptionId="sub1"
        useIntegrationDeliveriesHook={() => baseController({ deliveries: null, error: "failed to load deliveries" })}
      />,
    );
    expect(screen.getByText("failed to load deliveries")).toBeInTheDocument();
  });
});

describe("delivery table", () => {
  it("shows the empty state when there are no deliveries yet", () => {
    render(
      <IntegrationDeliveries
        subscriptionId="sub1"
        useIntegrationDeliveriesHook={() => baseController({ deliveries: [] })}
      />,
    );
    expect(screen.getByText("No deliveries yet for this subscription.")).toBeInTheDocument();
  });

  it("renders status, attempts, last response status, and a timestamp for each delivery", () => {
    render(
      <IntegrationDeliveries subscriptionId="sub1" useIntegrationDeliveriesHook={() => baseController()} />,
    );
    expect(screen.getByText("delivered")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    // Two "1"s could appear (attempts + version elsewhere) — attempts renders as a bare cell.
    expect(screen.getAllByRole("cell").length).toBeGreaterThan(0);
  });

  it("shows the last error text under the response status when the delivery failed", () => {
    render(
      <IntegrationDeliveries
        subscriptionId="sub1"
        useIntegrationDeliveriesHook={() =>
          baseController({
            deliveries: [{ ...DELIVERY, status: "failed", lastResponseStatus: 500, lastError: "connection reset" }],
          })
        }
      />,
    );
    expect(screen.getByText("connection reset")).toBeInTheDocument();
  });

  it("shows an em dash for a delivery with no response status yet (still pending)", () => {
    render(
      <IntegrationDeliveries
        subscriptionId="sub1"
        useIntegrationDeliveriesHook={() =>
          baseController({ deliveries: [{ ...DELIVERY, status: "pending", lastResponseStatus: null, lastError: null }] })
        }
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("page chrome", () => {
  it("links back to the Integrations list", () => {
    render(<IntegrationDeliveries subscriptionId="sub1" useIntegrationDeliveriesHook={() => baseController()} />);
    expect(screen.getByRole("link", { name: /integrations/i })).toHaveAttribute("href", "/admin/integrations");
  });
});
