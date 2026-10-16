import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { actionsForRedirectLabel, createdLabel, deleteRedirectBody, failedItemLabel, importResultSummary, importRulesLabel, t } from "../redirects-i18n";

// Author Checklist F1.1/F4.3/F6.2: different created/failed numbers and literal
// translated/fallback output; no self-derived oracle or mocked subject.
it("binds the redirects dictionary and preserves untranslated labels", () => {
  expect(t({ locale: "es", key: "Bulk import" })).toBe("Importación masiva");
  expect(t({ locale: "es", key: "exact" })).toBe("exacta");
  expect(t({ locale: "es", key: "prefix" })).toBe("prefijo");
  expect(t({ locale: "es", key: "wildcard" })).toBe("comodín");
  expect(t({ locale: "unlisted-locale", key: "Bulk import" })).toBe("Bulk import");
  expect(t({ locale: "es", key: "unknown future redirect label" })).toBe("unknown future redirect label");
});

it.each([
  ["es", "17 creadas, 3 fallidas.", "Creada", "Elemento 9 (DUPLICATE)", 'Acciones para la regla de redirección desde "/old/<script>"'],
  ["unlisted-locale", "17 created, 3 failed.", "Created", "Item 9 (DUPLICATE)", 'Actions for redirect rule from "/old/<script>"'],
])("keeps counts, item codes and redirect identities in %s", (locale, summary, created, failed, actions) => {
  // Reject: swap created/failed interpolation or discard fromPattern.
  expect(importResultSummary(locale, 17, 3)).toBe(summary);
  expect(createdLabel(locale)).toBe(created);
  expect(failedItemLabel(locale, 9, "DUPLICATE")).toBe(failed);
  expect(actionsForRedirectLabel(locale, "/old/<script>")).toBe(actions);
});

it.each([
  ["es", "Pega un arreglo JSON de reglas, hasta 500.", "Campos: matchType, fromPattern, toTarget, statusCode. Opcionales: override, priority.", '¿Eliminar la regla de redirección desde "/old/<script>"?'],
  ["unlisted-locale", "Paste a JSON array of rules, up to 500.", "Fields: matchType, fromPattern, toTarget, statusCode. Optional: override, priority.", 'Delete the redirect rule from "/old/<script>"?'],
])("renders the one-line import hint with its fields tip, and treats the redirect pattern as text for %s", (locale, hint, fields, deletion) => {
  // Reject: inline the rule shape back into the hint, or render the pattern as HTML.
  const { container } = render(<>
    <label htmlFor="json">{importRulesLabel(locale, <code>SHAPE</code>)}</label>
    <textarea id="json" />
    {deleteRedirectBody(locale, "/old/<script>")}
  </>);
  const label = container.querySelector("label")!;
  expect(label.firstChild?.textContent).toBe(hint);
  expect(label.querySelector("code")).toBeNull();
  const tip = screen.getByRole("button", { name: fields });
  // A tap on the ⓘ must not also activate the label (focusing the textarea closes the tip).
  expect(fireEvent.click(tip)).toBe(false);
  expect(document.activeElement).not.toBe(container.querySelector("textarea"));
  expect(container.querySelector("p")?.textContent).toBe(deletion);
  expect(container.querySelector("script")).toBeNull();
});
