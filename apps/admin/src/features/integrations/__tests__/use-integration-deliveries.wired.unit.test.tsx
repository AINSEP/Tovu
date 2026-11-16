import { afterEach, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { api, type AdminWebhookDelivery } from "@/lib/api";
import { useWiredIntegrationDeliveries } from "../hooks/use-integration-deliveries.hooks";

afterEach(() => vi.restoreAllMocks());

it("loads one subscription's deliveries through the real port and binds a translator for the admin locale", async () => {
  const deliveries = [{ id: "d1" }] as unknown as AdminWebhookDelivery[];
  const list = vi.spyOn(api, "listIntegrationDeliveries").mockResolvedValue({ deliveries });
  const { result } = renderHook(() => useWiredIntegrationDeliveries({ subscriptionId: "sub-1" }));
  expect(result.current.deliveries).toBeNull();
  await waitFor(() => expect(result.current.deliveries).toEqual(deliveries));
  expect(list).toHaveBeenCalledWith({ subscriptionId: "sub-1" });
  expect(result.current.error).toBeNull();
  expect(typeof result.current.t({ key: "Deliveries" })).toBe("string");
});

it("shows a plain-words error when the delivery log fails to load", async () => {
  vi.spyOn(api, "listIntegrationDeliveries").mockRejectedValue(new Error("down"));
  const { result } = renderHook(() => useWiredIntegrationDeliveries({ subscriptionId: "sub-1" }));
  await waitFor(() => expect(result.current.error).not.toBeNull());
  expect(result.current.deliveries).toBeNull();
});
