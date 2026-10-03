import { expect, it } from "vitest";
import { t } from "../playground-i18n";

it("binds distinct canvas and empty-state copy for different locales", () => {
  // F4.3 regression target: bind an empty dictionary, or ignore the locale argument.
  expect(t("es", "Playground")).toBe("Zona de pruebas");
  expect(t("es", "Canvas")).toBe("Lienzo");
  expect(t("es", "Nothing drawn yet — ask the assistant.")).toBe("Aún no hay nada dibujado; pregúntale al asistente.");
  expect(t("de", "Canvas")).toBe("Arbeitsfläche");
});

it("inherits common copy and retains readable source keys when a translation is absent", () => {
  // Regression target: return undefined on a miss, or omit the common-copy fallback.
  expect(t("es", "Save")).toBe("Guardar");
  expect(t("en", "Canvas")).toBe("Canvas");
  expect(t("unknown", "Canvas")).toBe("Canvas");
  expect(t("es", "new canvas message")).toBe("new canvas message");
});
