import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ADMIN_LOCALES } from "@/lib/settings-tabs";
import { actionsForWebhookLabel, deleteWebhookBody, t } from "../integrations-i18n";

it("resolves integration-specific copy, shared fallback, English and unknown locale/key copy", () => {
  expect(t("es", "Pause")).toBe("Pausar");
  expect(t("es", "Resume")).toBe("Reanudar");
  expect(t("es", "Delivery log")).toBe("Registro de entregas");
  expect(t("de", "Save")).toBe("Speichern");
  expect(t("en", "Target URL")).toBe("Target URL");
  expect(t("xx", "Target URL")).toBe("Target URL");
  expect(t("es", "Unregistered webhook copy")).toBe("Unregistered webhook copy");
});

describe("parameterized webhook copy", () => {
  // F4.1/F4.3: changing locale or label must change the exact output. Object-before-verb
  // templates challenge a hardcoded English word order; interpolation must keep label text inert.
  it.each([
    ["es", '¿Eliminar el webhook "', '"? Esta acción no se puede deshacer.', 'Acciones para el webhook "', '"'],
    ["de", 'Webhook "', '" löschen? Dies kann nicht rückgängig gemacht werden.', 'Aktionen für Webhook "', '"'],
    ["tr", '"', '" webhook\'u silinsin mi? Bu işlem geri alınamaz.', '"', '" webhook\'u için işlemler'],
    ["en", 'Delete webhook "', '"? This cannot be undone.', 'Actions for webhook "', '"'],
    ["xx", 'Delete webhook "', '"? This cannot be undone.', 'Actions for webhook "', '"'],
  ])("renders %s destructive copy and action labels around the exact webhook name", (locale, before, after, actionBefore, actionAfter) => {
    const label = "Payments <b>& {label} $&</b>";
    const { container } = render(<>{deleteWebhookBody(locale, label)}</>);
    expect(container.querySelector("p")?.textContent).toBe(`${before}${label}${after}`);
    expect(container.querySelector("b")).toBeNull();
    expect(actionsForWebhookLabel(locale, label)).toBe(`${actionBefore}${label}${actionAfter}`);
    expect(actionsForWebhookLabel(locale, "Other webhook")).toBe(`${actionBefore}Other webhook${actionAfter}`);
  });

  // F4.2/F5.2: use the real locale picker as the completeness boundary, with membership controls.
  it("localizes deletion and accessible action names in every supported non-English locale", () => {
    const locales = ADMIN_LOCALES.filter(({ code }) => code !== "en");
    expect(locales.map(({ code }) => code)).toContain("tr");
    for (const { code } of locales) {
      const { container, unmount } = render(<>{deleteWebhookBody(code, "payments-17")}</>);
      const paragraph = container.querySelector("p");
      expect(paragraph, code).toBeInTheDocument();
      expect(paragraph!.textContent, code).toContain("payments-17");
      expect(paragraph!.textContent, code).not.toBe('Delete webhook "payments-17"? This cannot be undone.');
      const name = actionsForWebhookLabel(code, "payments-17");
      expect(name, code).toContain("payments-17");
      expect(name, code).not.toBe('Actions for webhook "payments-17"');
      unmount();
    }
  });
});
