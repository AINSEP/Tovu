import { describe, expect, it } from "vitest";

import { pluginMetadataLabel, recipientLabel, serverLabel } from "../status-labels";
import { SHARED_COMPONENTS_DICT } from "../shared-components-i18n";

describe("serverLabel", () => {
  it("provides every mapped server label in all 21 supported locales", () => {
    const values = ["published", "draft", "active", "trashed", "pending", "approved", "spam", "trash", "owner", "recipient", "recipients", "built-in", "site", "tier-1", "tier-2", "tier-3", "valid", "invalid", "success", "disabled", "exact", "prefix", "wildcard"];
    expect(Object.keys(SHARED_COMPONENTS_DICT)).toHaveLength(21);
    for (const labels of Object.values(SHARED_COMPONENTS_DICT)) {
      for (const value of values) expect(labels[value]).toBeTruthy();
    }
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
