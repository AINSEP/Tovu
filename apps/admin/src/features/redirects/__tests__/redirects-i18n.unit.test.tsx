import { render, screen } from "@testing-library/react";
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
  ["es", "Pega un arreglo JSON de objetos de regla SHAPE (1-500 elementos)", '¿Eliminar la regla de redirección desde "/old/<script>"?'],
  ["unlisted-locale", "Paste a JSON array of SHAPE rule objects (1-500 items)", 'Delete the redirect rule from "/old/<script>"?'],
])("renders caller markup and treats the redirect pattern as text for %s", (locale, label, deletion) => {
  // Reject: lose shapeCode or render the pattern as HTML.
  const { container } = render(<>
    <label>{importRulesLabel(locale, <code>SHAPE</code>)}</label>
    {deleteRedirectBody(locale, "/old/<script>")}
  </>);
  expect(container.querySelector("label")?.textContent).toBe(label);
  expect(screen.getByText("SHAPE").tagName).toBe("CODE");
  expect(container.querySelector("p")?.textContent).toBe(deletion);
  expect(container.querySelector("script")).toBeNull();
});
