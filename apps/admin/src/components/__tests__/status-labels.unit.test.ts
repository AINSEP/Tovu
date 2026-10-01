import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { KNOWN_SERVER_LABELS, PluginMetadataLabel, RecipientLabel, ServerLabel, pluginMetadataLabel, recipientLabel, serverLabel } from "../status-labels";
import { SHARED_COMPONENTS_DICT } from "../shared-components-i18n";

vi.mock("@/hooks/use-admin-locale.hooks", () => ({ useAdminLocale: () => "es" }));

describe("serverLabel", () => {
  it("provides every mapped server label in all 21 supported locales", () => {
    expect(Object.keys(SHARED_COMPONENTS_DICT)).toHaveLength(21);
    for (const labels of Object.values(SHARED_COMPONENTS_DICT)) {
      for (const value of KNOWN_SERVER_LABELS) expect(labels[value]).toBeTruthy();
    }
  });

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

  it("localizes known server values and leaves future values readable", () => {
    expect(serverLabel("published", "es")).toBe("publicado");
    expect(serverLabel("unrecognized-state", "es")).toBe("unrecognized-state");
  });

  it("uses singular and plural recipient labels", () => {
    expect(recipientLabel(1, "es")).toBe("destinatario");
    expect(recipientLabel(2, "es")).toBe("destinatarios");
  });

  it("localizes each plugin metadata tag without changing its value order", () => {
    expect(pluginMetadataLabel(["built-in", "tier-3", "valid"], "es")).toBe("integrado · nivel 3 · válido");
  });
});
