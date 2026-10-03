import { render, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { IntegrationsRedirect } from "../IntegrationsRedirect";
import { useIntegrationsRedirect } from "../hooks/use-integrations-redirect.hooks";
import { useRouteLocation } from "@/lib/router";

afterEach(() => window.history.replaceState(null, "", "/"));

// F2.1/F2.4: deleting the component's hook mount, dropping ?tab=webhooks, or pushing history
// must fail. No router/hook mock: observe the URL and the production route subscription.
it("mounting the retired screen replaces its URL with the Webhooks tab and notifies the router", () => {
  window.history.replaceState(null, "", "/admin/integrations");
  const historyLength = window.history.length;
  const subscriber = renderHook(() => useRouteLocation());
  expect(subscriber.result.current).toBe("/integrations");
  const { container, rerender } = render(<IntegrationsRedirect />);
  expect(window.location.pathname).toBe("/admin/providers");
  expect(window.location.search).toBe("?tab=webhooks");
  expect(window.history.length).toBe(historyLength);
  expect(subscriber.result.current).toBe("/providers?tab=webhooks");
  expect(container).toBeEmptyDOMElement();

  window.history.replaceState(null, "", "/admin/media");
  rerender(<IntegrationsRedirect />);
  expect(window.location.pathname).toBe("/admin/media");
  expect(window.history.length).toBe(historyLength);
});

it("the redirect hook replaces history when mounted independently", () => {
  window.history.replaceState(null, "", "/admin/integrations?tab=mcp-server");
  const historyLength = window.history.length;
  renderHook(() => useIntegrationsRedirect());
  expect(window.location.pathname).toBe("/admin/providers");
  expect(window.location.search).toBe("?tab=webhooks");
  expect(window.history.length).toBe(historyLength);
});
