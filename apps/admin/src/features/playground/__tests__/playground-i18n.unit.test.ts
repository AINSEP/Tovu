import { expect, it } from "vitest";
import { t } from "../playground-i18n";

it("binds distinct canvas and empty-state copy for different locales", () => {
  // F4.3 regression target: bind an empty dictionary, or ignore the locale argument.
  expect(t({ locale: "es", key: "Playground" })).toBe("Zona de pruebas");
  expect(t({ locale: "es", key: "Canvas" })).toBe("Lienzo");
  expect(t({ locale: "es", key: "Nothing drawn yet — ask the assistant." })).toBe("Aún no hay nada dibujado; pregúntale al asistente.");
  expect(t({ locale: "de", key: "Canvas" })).toBe("Arbeitsfläche");
});

it("inherits common copy and retains readable source keys when a translation is absent", () => {
  // Regression target: return undefined on a miss, or omit the common-copy fallback.
  expect(t({ locale: "es", key: "Save" })).toBe("Guardar");
  expect(t({ locale: "en", key: "Canvas" })).toBe("Canvas");
  expect(t({ locale: "unknown", key: "Canvas" })).toBe("Canvas");
  expect(t({ locale: "es", key: "new canvas message" })).toBe("new canvas message");
});
