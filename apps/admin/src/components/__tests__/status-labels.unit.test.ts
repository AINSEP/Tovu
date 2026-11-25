import { createElement } from "react";
import { render, screen } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";

import { PluginMetadataLabel, RecipientLabel, ServerLabel } from "../status-labels";

vi.mock("@/hooks/use-admin-locale.hooks", () => ({ useAdminLocale: () => "es" }));

describe("status label wrappers", () => {
  it("renders all wrappers using the operator locale", () => {
    render(createElement("div", null,
      createElement(ServerLabel, { value: "published" }),
      createElement("span", null, createElement(RecipientLabel, { count: 1 })),
      createElement("span", null, createElement(RecipientLabel, { count: 2 })),
      createElement("span", null, createElement(PluginMetadataLabel, { values: ["built-in", "tier-3", "valid"] })),
    ));
    expect(screen.getByText("publicado")).toBeInTheDocument();
    expect(screen.getByText("destinatario")).toBeInTheDocument();
    expect(screen.getByText("destinatarios")).toBeInTheDocument();
    expect(screen.getByText("integrado · nivel 3 · válido")).toBeInTheDocument();
  });
});
